# Layout de Artefatos do CI Desktop

## Contexto

O CI desktop grava primeiro os pacotes de instalação do Electron em um diretório compartilhado, e depois os jobs
seguintes de upload / publish leem esse diretório. Na estrutura antiga, os artefatos de macOS eram gravados na raiz do
release, enquanto Windows e Linux gravavam simultaneamente na raiz e em subdiretórios de arquitetura, fazendo com que
a raiz misturasse instaladores de várias plataformas, manifests de atualização, manifest remoto de runtime e
components. Em builds paralelos também era mais frequente haver sobrescrita de `latest*.yml` ou a validação manual
pegar o diretório errado.

## Estrutura desejada

`TARGET_OUTPUT_DIR` continua sendo definido uniformemente pelo workflow, por exemplo um MR para `staging` usa
`@electron/dev/$CI_MERGE_REQUEST_SOURCE_BRANCH_NAME/`. Os instaladores desktop, blockmaps, manifests de atualização e o
`manifest.json` local da plataforma são gravados apenas no diretório de plataforma/arquitetura; a raiz do release
mantém apenas os remote assets:

```text
<shared-root>/<TARGET_OUTPUT_DIR>/
  macos-arm64/
  macos-x64/
  windows-x64/
  windows-arm64/
  linux-x64/
  linux-arm64/
  source-server-release.json
  zcode-server-linux-x64.tar.gz
  zcode-server-linux-arm64.tar.gz
  zcode-server-darwin-x64.tar.gz
  zcode-server-darwin-arm64.tar.gz
```

Dentro de cada subdiretório `<platform>-<arch>/` ficam somente o instalador daquela plataforma/arquitetura, o blockmap,
o `latest*.yml` e o `manifest.json` do próprio diretório. O descriptor/archive do Source Server permanece na raiz do
release, para o upload junto de `release:upload:macos:arm64`.

## Regras de leitura

- `release:upload:macos:*` lê o subdiretório correspondente `macos-* /`.
- `release:upload:macos:arm64` lê adicionalmente os remote assets da raiz do release via `EXTRA_UPLOAD_SOURCE_DIR`.
- `release:upload:windows:*` lê o subdiretório correspondente `windows-* /`.
- `release:upload:linux:*` lê o subdiretório correspondente `linux-* /`.
- `release:preload:cdn` depende simultaneamente dos uploads x64/arm64 de macOS, Windows e Linux, garantindo que os
  diretórios de plataforma/arquitetura já tenham sido pré-aquecidos na CDN antes da publicação do manifest no
  servidor.
- `release:publish:gray` e `release:publish:stable` consomem apenas o `release-meta-*.json` produzido na etapa de upload,
  sem reler o diretório compartilhado nem fazer upload do feed stable.

## Pontos de verificação

- cada build job de plataforma só pode gravar instalador, blockmap, `latest*.yml` e `manifest.json` no diretório
  correspondente de plataforma/arquitetura.
- ao reutilizar o diretório compartilhado, o build job deve limpar as cópias históricas de instaladores da raiz, mas
  não pode remover o descriptor/archive do Source Server desta rodada.
- o `SOURCE_DIR` do upload job deve apontar para o subdiretório de plataforma/arquitetura.
- o upload dos remote assets lê apenas o `source-server-release.json` e o `zcode-server-*.tar.gz` da raiz do release.
