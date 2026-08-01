# BabyCry AI Care

PWA instalável para gravar um trecho curto de áudio, enviar o arquivo WAV a um backend protegido e organizar hipóteses de cuidado. O projeto não apresenta o resultado como diagnóstico e mantém o histórico no `localStorage` do aparelho.

## O que foi corrigido

- A gravação agora gera um arquivo **WAV de verdade**, em vez de apenas abrir o microfone.
- O áudio é efetivamente enviado para análise.
- A chave Gemini fica em um backend, nunca no GitHub Pages.
- O aplicativo possui tratamento de erros, limite de tamanho, CORS, histórico local, exportação, tema escuro e instalação como PWA.
- A comunicação deixa claro que o resultado é uma hipótese de cuidado, não uma tradução exata nem diagnóstico.

## Estrutura

```text
index.html
styles.css
app.js
manifest.webmanifest
sw.js
icons/
worker/
  worker.js
  wrangler.toml
```

## 1. Publique o frontend no GitHub Pages

1. Copie os arquivos da raiz deste projeto para o repositório `BabyCRY-AI`.
2. Não coloque nenhuma chave Gemini no `app.js`.
3. Faça o commit e aguarde o GitHub Pages atualizar.

## 2. Publique o backend no Cloudflare Workers

Instale o Wrangler:

```bash
npm install -g wrangler
wrangler login
```

Entre na pasta:

```bash
cd worker
```

Cadastre a chave secreta:

```bash
wrangler secret put GEMINI_API_KEY
```

Confira `ALLOWED_ORIGIN` em `wrangler.toml`. Para o endereço informado, mantenha:

```toml
ALLOWED_ORIGIN = "https://yirmire.github.io"
```

Publique:

```bash
wrangler deploy
```

O terminal exibirá uma URL parecida com:

```text
https://babycry-ai-care-api.SEUSUBDOMINIO.workers.dev
```

## 3. Conecte o aplicativo

Abra o site, acesse **Ajustes** e cole no campo “Endereço do backend” a URL completa do Worker. Dependendo da rota publicada, use a raiz do Worker; o código aceita POST diretamente nessa URL.

Desative o “Modo demonstração” e salve.

## Segurança obrigatória

A chave publicada anteriormente deve ser revogada e substituída. Uma chave Gemini exposta em HTML público pode ser copiada e usada por terceiros. Configure alertas de cobrança e restrições de uso.

## Teste local

O microfone exige contexto seguro. Use um servidor local:

```bash
python -m http.server 8080
```

Abra `http://localhost:8080`.

## Observação clínica

O aplicativo deve ser usado apenas como apoio observacional. Choro persistente ou diferente do habitual, dificuldade para respirar, alteração de cor, convulsão, sonolência importante, recusa alimentar e outros sinais de alerta exigem avaliação profissional.
