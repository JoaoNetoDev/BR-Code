# Spec da imagem Docker do Web App

## Objetivo

Fornecer uma imagem Docker do Web App completa e executável localmente, contendo os assets estáticos do Web, o serviço HTTP/WS `@zcode/server` e o app-server do agente ZCode. A imagem é usada para validação local com Docker e não substitui a arquitetura de shared-host do controle remoto do desktop.

## Estrutura de execução

```text
browser
  |
  | http://localhost:3030
  v
Node gateway
  |-- static files: packages/web/dist
  |-- /api/* proxy
  `-- /ws* proxy
       |
       v
@zcode/server entry-http
  |
  | stdio
  v
zcode.cjs app-server
  |
  | app data
  v
/data/.zcode
  |-- v2        app settings, task index
  `-- cli       agent session DB, logs, rollout
```

## Conteúdo da imagem

- A imagem base é especificada pelo build arg `NODE_BASE_IMAGE`, com padrão `node:24-bookworm-slim`.
- O estágio builder executa:
  - `pnpm install --frozen-lockfile`
  - `packages/desktop/scripts/prepare-agent-node-bundle.mjs`
  - `pnpm --filter @zcode/server build`
  - `pnpm --filter @zcode/web build`
- O estágio de runtime expõe apenas uma porta, por padrão `3030`.
- O estágio de runtime mantém as dependências de runtime do server via pnpm, porque `entry-http.js` externaliza pacotes como `ssh2`, `node-pty` e `undici`.

## Dados e workspace

- `HOME=/data`
- `ZCODE_DATA_BASE_DIR=/data`
- `ZCODE_STORAGE_DIR=/data/.zcode`
- O workspace padrão é `/workspace`

O script de inicialização faz seed de `/workspace` somente quando `setting.json` está ausente ou a lista de workspaces está vazia; ele não sobrescreve dados de modelos, contas ou tarefas já existentes no volume.

## Uso local

```bash
pnpm docker:build:web-app
pnpm docker:run:web-app
```

Variáveis que podem ser sobrescritas:

```bash
IMAGE=zcode-web-app:dev NODE_BASE_IMAGE=node:24-bookworm-slim pnpm docker:build:web-app
PORT=3030 DATA_VOLUME=zcode-web-data WORKSPACE_DIR="$PWD" pnpm docker:run:web-app
```

Acesse `http://localhost:3030/`.