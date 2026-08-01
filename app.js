(() => {
  'use strict';

  const STORAGE = {
    settings: 'babycry.settings.v1',
    history: 'babycry.history.v1'
  };

  const defaults = {
    babyName: 'Meu bebê',
    babyAgeMonths: '',
    duration: 10,
    apiUrl: '',
    demoMode: false,
    darkMode: false
  };

  const state = {
    settings: loadJSON(STORAGE.settings, defaults),
    history: loadJSON(STORAGE.history, []),
    recording: false,
    analyzing: false,
    recorder: null,
    installPrompt: null,
    timer: null,
    animation: null
  };

  const el = id => document.getElementById(id);
  const ui = {
    recorderCard: document.querySelector('.recorder-card'),
    visualizer: el('visualizer'),
    recordButton: el('recordButton'),
    recordButtonText: el('recordButtonText'),
    recordHint: el('recordHint'),
    recordStatus: el('recordStatus'),
    countdown: el('countdown'),
    analysisPanel: el('analysisPanel'),
    headerBabyName: el('headerBabyName'),
    historyList: el('historyList'),
    toast: el('toast'),
    settingsForm: el('settingsForm'),
    babyNameInput: el('babyNameInput'),
    babyAgeInput: el('babyAgeInput'),
    durationInput: el('durationInput'),
    apiUrlInput: el('apiUrlInput'),
    demoModeInput: el('demoModeInput'),
    installButton: el('installButton')
  };

  init();

  function init() {
    buildVisualizer();
    bindNavigation();
    bindActions();
    applySettings();
    renderHistory();
    registerServiceWorker();
  }

  function loadJSON(key, fallback) {
    try {
      const data = JSON.parse(localStorage.getItem(key));
      return data && typeof data === 'object' ? (Array.isArray(fallback) ? data : {...fallback, ...data}) : fallback;
    } catch { return fallback; }
  }

  function saveSettings() {
    localStorage.setItem(STORAGE.settings, JSON.stringify(state.settings));
  }

  function saveHistory() {
    localStorage.setItem(STORAGE.history, JSON.stringify(state.history.slice(0, 50)));
  }

  function buildVisualizer() {
    ui.visualizer.innerHTML = Array.from({length: 26}, () => '<i style="height:8px"></i>').join('');
  }

  function bindNavigation() {
    document.querySelectorAll('[data-view-target]').forEach(button => {
      button.addEventListener('click', () => showView(button.dataset.viewTarget));
    });
  }

  function showView(name) {
    document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === `view-${name}`));
    document.querySelectorAll('.nav-item').forEach(v => v.classList.toggle('active', v.dataset.viewTarget === name));
    if (name === 'history') renderHistory();
    window.scrollTo({top: 0, behavior: 'smooth'});
  }

  function bindActions() {
    ui.recordButton.addEventListener('click', () => state.recording ? stopRecording() : startRecording());

    el('themeButton').addEventListener('click', () => {
      state.settings.darkMode = !state.settings.darkMode;
      saveSettings();
      applySettings();
    });

    ui.settingsForm.addEventListener('submit', event => {
      event.preventDefault();
      state.settings = {
        ...state.settings,
        babyName: ui.babyNameInput.value.trim() || defaults.babyName,
        babyAgeMonths: ui.babyAgeInput.value,
        duration: Number(ui.durationInput.value) || 10,
        apiUrl: ui.apiUrlInput.value.trim().replace(/\/$/, ''),
        demoMode: ui.demoModeInput.checked
      };
      saveSettings();
      applySettings();
      toast('Configurações salvas.');
      showView('home');
    });

    el('clearHistory').addEventListener('click', () => {
      if (!state.history.length) return toast('O histórico já está vazio.');
      if (confirm('Apagar todo o histórico deste aparelho?')) {
        state.history = [];
        saveHistory();
        renderHistory();
        toast('Histórico apagado.');
      }
    });

    el('exportHistory').addEventListener('click', exportHistory);

    window.addEventListener('beforeinstallprompt', event => {
      event.preventDefault();
      state.installPrompt = event;
      ui.installButton.classList.remove('hidden');
    });

    ui.installButton.addEventListener('click', async () => {
      if (!state.installPrompt) return;
      state.installPrompt.prompt();
      await state.installPrompt.userChoice;
      state.installPrompt = null;
      ui.installButton.classList.add('hidden');
    });
  }

  function applySettings() {
    document.body.classList.toggle('dark', Boolean(state.settings.darkMode));
    ui.headerBabyName.textContent = state.settings.babyName;
    ui.countdown.textContent = `${state.settings.duration}s`;
    ui.babyNameInput.value = state.settings.babyName;
    ui.babyAgeInput.value = state.settings.babyAgeMonths;
    ui.durationInput.value = String(state.settings.duration);
    ui.apiUrlInput.value = state.settings.apiUrl;
    ui.demoModeInput.checked = Boolean(state.settings.demoMode);
  }

  async function startRecording() {
    if (state.analyzing) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioContext && !window.webkitAudioContext) {
      return showError('Este navegador não oferece os recursos de áudio necessários. Atualize o navegador ou use Chrome/Safari recente.');
    }

    try {
      ui.analysisPanel.classList.add('hidden');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      });
      state.recorder = await createWavRecorder(stream);
      state.recording = true;
      state.recorder.start();
      setRecordingUI(true);
      startCountdown(state.settings.duration);
      animateVisualizer();
    } catch (error) {
      console.error(error);
      showError('Não foi possível acessar o microfone. Verifique a permissão do navegador e abra o site por HTTPS.');
    }
  }

  async function stopRecording() {
    if (!state.recording || !state.recorder) return;
    state.recording = false;
    clearInterval(state.timer);
    cancelAnimationFrame(state.animation);
    setRecordingUI(false);

    try {
      const blob = await state.recorder.stop();
      state.recorder = null;
      resetVisualizer();
      if (blob.size < 12000) throw new Error('A gravação ficou curta ou silenciosa demais.');
      await analyzeAudio(blob);
    } catch (error) {
      console.error(error);
      showError(error.message || 'A gravação não pôde ser processada.');
    }
  }

  function startCountdown(seconds) {
    let remaining = seconds;
    ui.countdown.textContent = `${remaining}s`;
    state.timer = setInterval(() => {
      remaining -= 1;
      ui.countdown.textContent = `${Math.max(0, remaining)}s`;
      if (remaining <= 0) stopRecording();
    }, 1000);
  }

  function setRecordingUI(active) {
    ui.recorderCard.classList.toggle('recording', active);
    ui.recordButtonText.textContent = active ? 'PARAR E ANALISAR' : 'ANALISAR CHORO';
    ui.recordHint.textContent = active ? 'gravando agora' : 'toque para iniciar';
    ui.recordStatus.textContent = active ? 'Ouvindo o ambiente' : 'Pronto para ouvir';
    if (!active) ui.countdown.textContent = `${state.settings.duration}s`;
  }

  async function analyzeAudio(blob) {
    state.analyzing = true;
    ui.recordButton.disabled = true;
    showLoading();

    try {
      let result;
      if (state.settings.demoMode) {
        await sleep(1200);
        result = demoResult();
      } else {
        if (!state.settings.apiUrl) throw new Error('Configure o endereço do backend em Ajustes antes de usar a análise real.');
        const audioBase64 = await blobToBase64(blob);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60000);
        const response = await fetch(state.settings.apiUrl, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            audioBase64,
            mimeType: 'audio/wav',
            durationSeconds: state.settings.duration,
            babyAgeMonths: state.settings.babyAgeMonths === '' ? null : Number(state.settings.babyAgeMonths)
          }),
          signal: controller.signal
        });
        clearTimeout(timeout);
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || `Erro do servidor (${response.status}).`);
        result = validateResult(body);
      }

      const entry = {...result, id: crypto.randomUUID?.() || String(Date.now()), createdAt: new Date().toISOString()};
      state.history.unshift(entry);
      saveHistory();
      renderResult(entry);
    } catch (error) {
      console.error(error);
      const message = error.name === 'AbortError' ? 'A análise demorou mais que o esperado. Tente novamente.' : error.message;
      showError(message || 'Não foi possível concluir a análise.');
    } finally {
      state.analyzing = false;
      ui.recordButton.disabled = false;
    }
  }

  function validateResult(value) {
    if (!value || typeof value !== 'object') throw new Error('Resposta inválida do servidor.');
    const suggestions = Array.isArray(value.suggestions) ? value.suggestions.filter(x => typeof x === 'string').slice(0, 4) : [];
    return {
      category: String(value.category || 'indeterminado'),
      title: String(value.title || 'Resultado indeterminado'),
      confidence: ['baixa','moderada'].includes(value.confidence) ? value.confidence : 'baixa',
      explanation: String(value.explanation || 'O áudio não permitiu formular uma hipótese confiável.'),
      suggestions: suggestions.length ? suggestions : ['Observe alimentação, sono, fralda, temperatura e comportamento geral.'],
      urgent: Boolean(value.urgent),
      safetyNote: String(value.safetyNote || 'Não use este resultado para adiar atendimento médico.'),
      demo: Boolean(value.demo)
    };
  }

  function demoResult() {
    return {
      category: 'demonstração',
      title: 'Exemplo: possível desconforto',
      confidence: 'baixa',
      explanation: 'Este é apenas um resultado ilustrativo para testar a interface. Nenhuma inteligência artificial analisou o áudio.',
      suggestions: ['Verifique fralda, posição e temperatura.', 'Reduza luz e ruídos.', 'Observe se há sinais de alerta.'],
      urgent: false,
      safetyNote: 'Desative o modo demonstração e configure o backend para realizar uma análise de áudio.',
      demo: true
    };
  }

  function showLoading() {
    ui.analysisPanel.classList.remove('hidden');
    ui.analysisPanel.innerHTML = `<div class="analysis-loading"><span class="spinner"></span><span><b>Analisando o áudio</b><small>Buscando padrões acústicos com cautela…</small></span></div>`;
  }

  function renderResult(result) {
    ui.analysisPanel.classList.remove('hidden');
    ui.analysisPanel.innerHTML = `
      <article class="result-card ${result.demo ? 'demo' : ''}">
        <div class="result-top"><span>${escapeHTML(result.demo ? 'modo demonstração' : result.category)}</span><span>confiança ${escapeHTML(result.confidence)}</span></div>
        <h3>${escapeHTML(result.title)}</h3>
        <p>${escapeHTML(result.explanation)}</p>
        <div class="suggestion-box"><b>O que observar agora</b><ul>${result.suggestions.map(s => `<li>${escapeHTML(s)}</li>`).join('')}</ul></div>
        <p class="result-warning">${escapeHTML(result.safetyNote)}</p>
      </article>`;
  }

  function showError(message) {
    ui.analysisPanel.classList.remove('hidden');
    ui.analysisPanel.innerHTML = `<article class="error-card"><h3>Não foi possível concluir</h3><p>${escapeHTML(message)}</p></article>`;
  }

  function renderHistory() {
    if (!state.history.length) {
      ui.historyList.innerHTML = '<div class="empty-state"><b>Nenhum registro ainda</b>As análises aparecerão aqui e ficarão salvas somente neste aparelho.</div>';
      return;
    }
    ui.historyList.innerHTML = state.history.map(item => `
      <article class="history-card">
        <div class="history-head"><div><h3>${escapeHTML(item.title)}</h3><span class="eyebrow">confiança ${escapeHTML(item.confidence)}</span></div><time>${formatDate(item.createdAt)}</time></div>
        <p>${escapeHTML(item.explanation)}</p>
      </article>`).join('');
  }

  function exportHistory() {
    if (!state.history.length) return toast('Não há registros para exportar.');
    const blob = new Blob([JSON.stringify(state.history, null, 2)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `babycry-historico-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function createWavRecorder(stream) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const context = new AudioCtx();
    if (context.state === 'suspended') await context.resume();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = .72;
    const processor = context.createScriptProcessor(4096, 1, 1);
    const silentGain = context.createGain();
    silentGain.gain.value = 0;
    const chunks = [];
    let active = false;

    source.connect(analyser);
    analyser.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(context.destination);

    processor.onaudioprocess = event => {
      if (!active) return;
      chunks.push(new Float32Array(event.inputBuffer.getChannelData(0)));
    };

    return {
      analyser,
      start() { active = true; },
      async stop() {
        active = false;
        processor.disconnect(); analyser.disconnect(); source.disconnect(); silentGain.disconnect();
        stream.getTracks().forEach(track => track.stop());
        const inputRate = context.sampleRate;
        await context.close();
        const merged = mergeFloat32(chunks);
        const resampled = downsample(merged, inputRate, 16000);
        return encodeWav(resampled, 16000);
      }
    };
  }

  function mergeFloat32(chunks) {
    const length = chunks.reduce((sum, c) => sum + c.length, 0);
    const merged = new Float32Array(length);
    let offset = 0;
    chunks.forEach(c => { merged.set(c, offset); offset += c.length; });
    return merged;
  }

  function downsample(buffer, inputRate, outputRate) {
    if (outputRate >= inputRate) return buffer;
    const ratio = inputRate / outputRate;
    const length = Math.round(buffer.length / ratio);
    const result = new Float32Array(length);
    let inputIndex = 0;
    for (let i = 0; i < length; i++) {
      const next = Math.round((i + 1) * ratio);
      let sum = 0, count = 0;
      for (; inputIndex < next && inputIndex < buffer.length; inputIndex++) { sum += buffer[inputIndex]; count++; }
      result[i] = count ? sum / count : 0;
    }
    return result;
  }

  function encodeWav(samples, sampleRate) {
    const arrayBuffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(arrayBuffer);
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);
    let offset = 44;
    for (const sample of samples) {
      const s = Math.max(-1, Math.min(1, sample));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
    return new Blob([view], {type: 'audio/wav'});
  }

  function writeString(view, offset, text) {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  }

  function animateVisualizer() {
    const bars = [...ui.visualizer.children];
    const analyser = state.recorder?.analyser;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const draw = () => {
      analyser.getByteFrequencyData(data);
      bars.forEach((bar, index) => {
        const sourceIndex = Math.min(data.length - 1, Math.floor(index * data.length / bars.length));
        const height = 8 + (data[sourceIndex] / 255) * 58;
        bar.style.height = `${height}px`;
      });
      state.animation = requestAnimationFrame(draw);
    };
    draw();
  }

  function resetVisualizer() {
    [...ui.visualizer.children].forEach((bar, i) => bar.style.height = `${8 + (i % 4) * 3}px`);
  }

  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Não foi possível ler a gravação.'));
      reader.onload = () => resolve(String(reader.result).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  }

  function formatDate(value) {
    try { return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(value)); }
    catch { return ''; }
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  }

  function toast(message) {
    ui.toast.textContent = message;
    ui.toast.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => ui.toast.classList.remove('show'), 2400);
  }

  function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(console.warn));
  }
})();
