# Parâmetros de empacotamento do Desktop

`pnpm bundle:desktop` agora aceita especificar por parâmetro o sistema operacional e a arquitetura de CPU alvo, para dirigir o empacotamento do desktop em diferentes plataformas.

## Experimento de bytecode do Agent stdio do desktop

`pnpm dev:desktop:bytecode` reaproveita a build completa do Dev normal e depois pré-compila
`apps/zcode-cli/packages/cli/dist/zcode.cjs` com o modo Node do Electron atualmente
instalado, gerando no mesmo diretório o loader `zcode.bytecode.cjs`,
`zcode.bytecode-<sha256>.jsc` e `zcode.bytecode-runtime-<sha256>.cjs`. O
`pnpm dev:desktop` normal continua rodando JS, para comparação A/B na mesma versão e na
mesma carga de trabalho. Para regenerar apenas o bytecode executável
`pnpm build:desktop-agent:bytecode` (assegure antes que o bundle normal da CLI já foi
atualizado).

O formato de build/bytecode é mantido pelo script de build do desktop; a escolha do ponto de
entrada continua sendo mantida pelo Agent command resolver existente. O launcher de Dev
passa a opção ao Host via `ZCODE_DESKTOP_AGENT_BYTECODE=1`; isso afeta apenas o workspace
CLI bundle dentro do Electron, e não o Agent command explícito, o Agent nativo de SSH/WSL
nem o processo oficial de empacotamento. Essa variável não é um parâmetro de produto da
CLI; o contrato completo está em
[Agent Server spec](../../apps/zcode-cli/docs/design/v2/zcode-protocol-agent-server.md).

```text
Dev 构建 → 普通 zcode.cjs → 匹配的 Electron Node 编译 → 字节码 + 加载器
Host command resolver → Electron Node 加载器 → 原 app-server --stdio
                                         └→ 原 session/queue/stream owner
Host storage Worker → 普通 zcode.cjs --prepare-storage → 原存储启动门禁
```

O loader precisa validar Electron/Node/V8, plataforma, arquitetura, o identificador de
cache do V8 e o resumo do bytecode antes de executar a CLI; divergência, ausência ou recusa
de cache precisam gerar erro, sem fallback silencioso para JS. A pré-compilação proíbe
executar a CLI do usuário; o loader não imprime diagnóstico em stdout e não altera argv,
cwd, caminhos relativos de módulos nem o ciclo de vida do stdio.
O worker de preparação de armazenamento mantém a entrada JS, evitando incompatibilidade de
snapshot entre tipos diferentes de processo Electron; as fronteiras de owner/recuperação do
continuous do desktop e do replayable do celular seguem a convenção original.

Este experimento usa placeholder de espaços ASCII de comprimento igual e desliga compilação
preguiçosa e coleta de bytecode; a referência ao código-fonte do V8 ainda não foi removida.
Não há promessa de redução de uso de heap, e isto não é uma solução de criptografia de
código-fonte; o JS normal continua no diretório de desenvolvimento para comparação e para a
preparação de armazenamento.
A aceitação precisa cobrir CommonJS/dynamic import, caminhos de argv/recursos, toString de
funções geradas dinamicamente, caminhos de erro, incompatibilidade/corrupção do runtime,
handshake stdio real e EOF. Registrar na comparação o runtime, o resumo do bundle, o tempo
de inicialização, heapUsed após GC e RSS; a categorização de Strings da captura de tela do
usuário não pode ser igualada ao uso de código-fonte.

## Comportamento Padrão

Sem parâmetros, os valores padrão atuais são mantidos: `mac` + `arm64`.

```bash
pnpm bundle:desktop
```

## Especificar a Plataforma Alvo Explicitamente

Parâmetros nomeados:

```bash
pnpm bundle:desktop -- --os mac --arch x64
pnpm bundle:desktop -- --os win --arch x64
pnpm bundle:desktop -- --os linux --arch arm64
```

Parâmetros posicionais:

```bash
pnpm bundle:desktop -- win arm64
```

## Valores Suportados

- `os`: `mac` / `win` / `linux`
- `arch`: `x64` / `arm64`

Também são aceitos aliases comuns: `macos`, `darwin`, `windows`, `amd64`, `aarch64`.

## Cenário de CI / Scripts

Se não for conveniente passar parâmetros de CLI, também é possível usar variáveis de ambiente:

```bash
ZCODE_TARGET_OS=linux ZCODE_TARGET_ARCH=x64 pnpm bundle:desktop

O empacotamento oficial de release não injeta mais um update feed genérico configurável. O novo cliente em execução usa o manifest provider do servidor; o `publish.url` genérico do `electron-builder` é mantido apenas como placeholder local, e a interface real de verificação de atualização é sobrescrita pelo endpoint padrão ou por `ZCODE_UPDATE_FEED_URL`.
```

## Pré-verificação

Se você quiser apenas confirmar qual combinação de alvo será executada, rode primeiro um dry run:

```bash
pnpm bundle:desktop -- --os linux --arch x64 --dry-run
```

## Empacotamento por Fases no CI

No GitLab CI, a preparação de assets e a build do desktop são executadas primeiro em
separado, e só então o bundle é chamado para realmente produzir o instalador.
Nesse caso é possível pular as etapas repetidas com os dois parâmetros abaixo:

```bash
pnpm bundle:desktop -- --os mac --arch arm64 --skip-prepare --skip-build
```

Variáveis de ambiente equivalentes:

```bash
ZCODE_SKIP_PREPARE=1 ZCODE_SKIP_BUILD=1 pnpm bundle:desktop
```

## Fechamento de Segurança dos Artefatos de Produção

- `packages/desktop/scripts/run-production-build.mjs` precisa injetar explicitamente
  `NODE_ENV=production` para `tsup` e `vite build`.
- Antes do início da build de produção, é preciso limpar `out/main`, `out/host`, `out/preload`, `out/renderer` e os dev ready markers, preservando `out/metadata`. A razão é que o tsup não remove automaticamente chunks antigos, e artefatos históricos não comprimidos seriam rec reintroduzidos no instalador pelo `out/**/*` do `electron-builder`.
- `packages/desktop/tsup.config.ts`, em produção, precisa habilitar `minify` para os três conjuntos de artefatos Node `main`, `host` e `preload`, desabilitar `sourcemap` e definir `legalComments: "none"`, evitando que o pacote publicado mantenha comentários de código-fonte ou entradas `sourceMappingURL=*.map`.
- O `afterPack` de `packages/desktop/electron-builder.config.js` precisa continuar limpando os `*.map` e os comentários JS/CSS `sourceMappingURL` nos assets finais. A razão é que o recorte de `files` do electron-builder só cobre os arquivos do pacote principal; a injeção de dependências em tempo de execução do afterPack, o `app.asar.unpacked` e as `extraResources` ainda podem reintroduzir anotações de sourcemap de terceiros.
- O `requiredRuntimeModules` de `packages/desktop/scripts/bundle.mjs` (validação mecânica dos artefatos) precisa ser um subconjunto do `REQUIRED_ASAR_RUNTIME_MODULES` de `packages/desktop/electron-builder.config.js` (injetado no afterPack). A razão é que a validação só verifica se o módulo está no app.asar; quem de fato completa o fechamento de dependências nos artefatos é a injeção do afterPack; ao adicionar apenas a validação sem a injeção, nenhuma etapa fica responsável por completar as subdependências daquele módulo, e a falha só apareceria no fim do empacotamento.
  A lista de injeção é expandida recursivamente a partir do fechamento de dependências do `package.json`; módulos já presentes nos artefatos são ignorados, e registros duplicados não alteram os artefatos.
- No estado de desenvolvimento o sourcemap do tsup é mantido, para facilitar o debug local de main/host/preload; em produção nenhum sourcemap é gerado nem exposto.
