# Verificação de Atualização Automática em Modo de Desenvolvimento no Desktop

## Objetivo

Por padrão, a atualização automática não é inicializada em modo de desenvolvimento, evitando que a integração diária dispare inadvertidamente fluxos de download, instalação e reinicialização. Quando for necessário verificar a interação de atualização automática, é possível habilitar explicitamente a atualização automática em modo de desenvolvimento, para que o dev app solicite diretamente a interface de manifest do servidor do ambiente de teste.

O ambiente de teste já oferece:

```text
GET /api/v1/releases/electron/manifest
```

Dessa forma, a verificação local não depende mais de um mock manifest server.

## Como iniciar

```bash
ZCODE_AUTO_UPDATE_DEV=1 \
ZCODE_AUTO_UPDATE_DEV_VERSION=3.3.1 \
pnpm dev:desktop:test
```

- `pnpm dev:desktop:test` injeta `ZCODE_ENV=test`, e o manifest provider solicita o endpoint do ambiente de teste.
- `ZCODE_AUTO_UPDATE_DEV=1` habilita explicitamente a atualização automática apenas em modo de desenvolvimento; quando não definido, o modo de desenvolvimento continua sem verificar atualizações.
- `ZCODE_AUTO_UPDATE_DEV_VERSION` é usado para simular a versão atual do cliente; por exemplo, se a versão atual for comparada como `3.3.1`, o stable do ambiente de teste retornando `3.3.2` e o preview retornando `3.3.3` já permitem verificar a troca de canal.

## Limites de comportamento

- O pacote de produção não lê essas flags de modo de desenvolvimento e continua verificando atualizações conforme a configuração de empacotamento e o manifest provider do servidor.
- Em modo de desenvolvimento é definido o `forceDevUpdateConfig` do `electron-updater`, e `packages/desktop/dev-app-update.yml` é lido como placeholder de inicialização de cache local; a URL real de download continua vindo da resposta do manifest do ambiente de teste.
- Em modo de desenvolvimento, clicar em "reiniciar para atualizar" reinicia apenas o dev app atual, usado para verificar o ciclo completo de estados da UI, sem tentar que um aplicativo não empacotado assuma o instalador real.