# Monitoramento ARMS no Electron

Atualmente `@arms/rum-electron` só é integrado ao Electron do desktop. O ARMS Browser SDK ainda não é integrado ao Web/controle remoto do celular. O SDK do ARMS é conectado apenas na entrada do processo main e não entra em `packages/ui`.

Referência: [Documentação de integração do ARMS Electron da Alibaba Cloud](https://www.alibabacloud.com/help/zh/arms/user-experience-monitoring/integrating-with-an-electron-application)

## Escopo do monitoramento

O ARMS é responsável pelo monitoramento da experiência de usuário do runtime Electron:

- Erros JS globais e Promise rejections (processo main + injeção automática do SDK no Renderer).
- Taxa de sucesso, taxa de falha, latência e status code das APIs XHR/fetch.
- Eventos de travamento da main thread renderer longTask / LoAF / rAF; no processo main, `beforeReport` apenas completa um resumo de atribuição de baixa cardinalidade, sem nomes de script nem URLs originais.
- Exceções do processo main do Electron, crashes nativos e eventos relacionados ao início do aplicativo (collector `application`).
- Chamadas RPC (collector `rpc`, requer `instrumentTRPC` no tRPC do processo main).

O ARMS não é responsável por: logs de negócio do Host/Agent, banco de dados de estatísticas de qualidade, telemetria de negócio de `/report` e RUM do controle remoto Web. Saídas não esperadas do Agent não dependem da coleta automática do SDK, e sim de o Host lifecycle bridge enviar ativamente os eventos customizados anonimizados `perf_agent_crash` / `perf_agent_spawn_error`.

## Limite de coleta de Console Error

O logger main do Desktop emite erros no formato `console.error(prefix, message, context)`, em que `prefix` é o
prefixo comum `[timestamp] [pid] [source]` e `source` inclui origens como `main` e `renderer`. O console collector
do SDK ARMS Electron precisa normalizar chamadas com múltiplos argumentos no limite de coleta, sem tratar apenas
o primeiro argumento como `exception.message`:

```text
console.error(prefix, message, context/Error)
                    │
                    ▼
          ARMS console collector
          ├─ Error：保留 name / message / stack
          └─ 非 Error：去掉公共 prefix，安全序列化其余参数
                    │
                    ▼
         有界、脱敏的 exception.message
```

Regras de normalização:

- Quando há um `Error` entre os argumentos, continuar priorizando o relato desse objeto, preservando o stack original.
- Em chamadas multi-argumento que não são `Error`, remover o prefixo comum do main logger (sources como `main` / `renderer`) e então concatenar strings e contexto na ordem da chamada.
- Fazer anonimização dos nomes de chaves de objetos e de textos comuns de token; referências circulares não podem fazer o coletor lançar erro.
- A message final tem no máximo 2000 caracteres; quando há apenas o prefixo comum e nenhum corpo de negócio, nenhum evento de exception é gerado.
- Saídas controladas como `clean-exit` / `killed` são informação de lifecycle e usam `info`; saídas de exceção recuperáveis usam
  `warn`; somente crash, OOM e falha de inicialização confirmados usam `error`.

## Restrições de instalação do patch de dependência

O repositório usa `node-linker=hoisted`, e o patch atual do ZCode é fixado em `@arms/rum-electron@0.0.3`. Ao modificar o patch, é
obrigatório regenerar o unified diff completo de uma só vez a partir do `dist/index.mjs` original daquela versão; é proibido
adicionar hunks diretamente ao patch existente; caso contrário, os números de linha de destino e o hash do blob de destino
dos hunks seguintes divergirão do resultado completo, e o segundo `pnpm install` do pnpm 10 aplicará o patch novamente ao
arquivo já corrigido e reportará `ERR_PNPM_PATCH_FAILED`. Após alterar o patch, é obrigatório validar que o blob de destino no
cabeçalho do patch corresponde ao artefato instalado e verificar que duas execuções consecutivas de `pnpm install` no mesmo
workspace têm sucesso.

## Configuração (hardcoded)

| Item | Localização / valor |
| --- | --- |
| Endpoint | `ZCODE_ARMS_RUM_ENDPOINT` (`packages/shared/src/env.ts`) |
| Ambiente de relato | `mapZCodeEnvToArmsRumEnv(runtimeEnv)`: o runtime de desenvolvimento local é sempre `local`; fora do local, apenas `ZCODE_ENV=production` resulta em `prod` |
| `sessionConfig.sampleRate` | `1` (amostragem de 100% das sessões) |
| `autoInject` | `true` (o SDK injeta o Browser SDK no `dom-ready`; não fazer init manual em preload/renderer) |
| `browserCollectors` | `perf/webvitals/exception/whiteScreen/api/staticResource/click/longTask: true` (ver `ARMS_BROWSER_COLLECTORS`) |
| `spaMode` | `false` (o Electron carrega a página inteira em uma única página, não é uma SPA com History) |
| `parseViewName` | em `file://`, usa o nome do arquivo html; no dev-server http, usa o pathname |
| `tracing` | com `arms_env=prod`, `enable: true`, `sample: 0.1` (0,1%); com `arms_env=local`, `sample: 1` |

Sem variáveis de ambiente `ZCODE_ARMS_*`.

## Resumo de atribuição do longTask

O collector `longTask` do Browser SDK grava a atribuição LoAF / rAF em `snapshots`. Para facilitar a consulta no SLS e evitar alta cardinalidade e vazamento de caminhos, o `appARMSBootstrap.beforeReport` do processo main funde apenas o resumo da atribuição principal nas `properties` da mesma longTask:

| Campo | Significado |
| --- | --- |
| `loaf_script_count` | Quantidade de entradas de atribuição em `snapshots`, no máximo 5. |
| `loaf_top_duration_ms` | Duração em ms da atribuição principal. |
| `loaf_top_invoker_type` | `user-callback` / `event-listener` / `script` / `unknown`. |
| `loaf_top_share_pct` | Percentual inteiro da duração da longTask `duration` atribuído ao topo. |

Essa melhoria não adiciona eventos nem altera a taxa de amostragem; quando `snapshots` estiver ausente ou o parsing falhar, ela é pulada. É proibido gravar nome de script original, URL, caminho de arquivo, selector, stack ou trechos de código-fonte nessas properties.

## Limite de anonimização dos eventos coletados automaticamente

Os campos coletados pelos collectors do SDK são determinados pelo ARMS, e seu conteúdo original pode conter textos da interface do usuário, caminhos da máquina local e URLs completas.
`appARMSBootstrap.beforeReport` é o único ponto de fechamento antes desses eventos saírem da máquina, e precisa anonimizar todo o lote de eventos depois do resumo de atribuição do longTask e antes de devolver o payload. A anonimização altera apenas a cópia relatada, sem mudar logs locais, exibição de erros, arquivamento de crash e o critério de agregação de `perf_network_window` (a agregação de rede conclui o ingest antes da anonimização, seguindo as regras de dimensão próprias do `normalizeHttpInterface`).

### `click`

O `name` do Browser SDK tem a forma `click on <type-><tag>: <primeiros 20 caracteres de innerText>...`,
e `snapshots` é um JSON de `{id,name,className,href,src}`. O texto clicável do ZCode inclui títulos de sessão,
nomes de diretório de workspace, nomes de arquivo, corpo de mensagens e e-mail da conta, portanto:

- `name` mantém apenas `click on <type-><tag>`, descartando o texto do elemento depois de `: `.
- Remover `snapshots` (`href` / `src` podem ser caminhos de arquivo locais, e `id` / `className` não têm valor diagnóstico).
- Manter `target_name` (o XPath expressa apenas posição estrutural, sem texto) e os campos não textuais de latência e view.

### `exception`

O `message` / `stack` / `file` / `snapshots` de `jsError` (`uncaughtException` / `unhandledRejection`), `consoleError`, `whiteScreen` e de exceptions do lado do renderer são tratados pelas regras unificadas de anonimização de texto: URLs mantêm apenas `protocol//host` e a rota normalizada, caminhos absolutos são normalizados para `{path}`, e-mails para `{email}`, credenciais e Authorization para `{redacted}` / `{secret}`, com truncamento limitado. A anonimização de console no patch da dependência cobre apenas palavras-chave de credenciais; os caminhos e e-mails são completados por este fechamento.
`file` é a URL de script coletada pelo SDK a partir de `ErrorEvent.filename`, e na instalação do Windows está em `C:\Users\<nome-de-usuário>\AppData\...`, portanto precisa ser tratada pelas mesmas regras do `stack`;
os eventos de dump nativo do `crashReporter` estão fora do escopo desta seção, e seus `binary_images` continuam usados para determinar binários do produto.

### `api` / `resource`

`url` e `name` mantêm apenas `protocol//host` mais a rota normalizada, descartando query e fragment; IDs, hashes e formas de e-mail nos segmentos de rota são normalizados para placeholders. `message` (statusText ou resumo do erro) é tratado pelas regras de anonimização de texto.

A implementação de texto dessas regras é o `redactTelemetryText` do `@zcode/shared`, mantendo o mesmo conjunto de padrões do [`error-sanitizer`](../trace/cli-agent-telemetry.md) do CLI;
ao adicionar um novo collector automático ou um novo campo com texto livre, é obrigatório estender esta seção e essa implementação em conjunto.

## Posição e ordem de inicialização

1. `desktopEarlyDataBaseDirBootstrap` (`dataBaseDir`)
2. `appCrashCaptureBootstrap` (`crashDumps` + archive local)
3. `appARMSBootstrap`: **inicia** `armsRum.init()` no carregamento do módulo e exporta `armsInitPromise`
4. Dentro de `app.whenReady()`, **antes de criar a janela principal**, faz `await armsInitPromise`
5. Renderer: o `autoInject` + `browserCollectors` do processo main injetam e fazem `RumSDK.init` no `dom-ready` (sem init manual em preload/renderer)

`init()` precisa ser chamado antes de `app.ready` (garantido pela cadeia de import de side-effect); ao mesmo tempo, é preciso **aguardar** sua conclusão antes de abrir a primeira janela. `browserCollectors` só se aplica aos collectors injetados no renderer; `collectors` do processo main continuam cuidando do lado Electron (crash, rpc etc.).

## Verificação local

1. Iniciar o Desktop em modo de desenvolvimento (`pnpm dev:desktop` ou comando equivalente).
2. Abrir a janela principal e interagir (trocar de página, disparar requisições).
3. Observar o log do processo main:
   - sucesso: `[arms] electron initialized env=local version=...`
   - em desenvolvimento, antes de cada relato: `[arms] beforeReport batch=N perf=1 ... [view:perf, ...]` (`perf` deve ser ≥1)
   - falha: `[arms] electron init failed:`
4. Aguardar cerca de 1 a 2 minutos e conferir no console do ARMS em **用户体验监控 > 应用列表**; o ambiente de relato do build de desenvolvimento é **`local`**, portanto não filtre apenas por `prod`.

## Diagnóstico quando o console continua sem dados

| Sintoma | Possível causa |
| --- | --- |
| Sem log `electron initialized` | `init` lançou erro (endpoint errado, falha de rede ao buscar a configuração remota etc.) |
| Com initialized, mas sem `beforeReport` | A sessão não foi amostrada (é preciso `sessionConfig.sampleRate: 1`) ou o processo renderer não gerou eventos |
| Com `beforeReport` mas `perf=0` (com `view:webvitals` e sem `view:perf`) | `autoInject` ocorreu depois de `load` e o perf-collector não fez `sendPerf`; `scheduleArmsBrowserPerfLoadNudge` da janela principal reenvia `load` |
| Com `beforeReport`, mas o console continua sem dados | Filtro de ambiente do console em `prod`, região diferente da aplicação, ou rede interna sem acesso a `*.aliyuncs.com` |
| `[RUM] Invalid bundle received from renderer, dropped` | O SDK relata o events[]; o preload frame do ARMS contorna o patch de ipc; é preciso sincronizar `patchArmsEventBridgeSend` no preload |
| `[RUM] ArmsEventBridge is not available` no console do Renderer | A primeira janela abriu antes da conclusão do init (já deveria ter sido corrigido com `await armsInitPromise`) |

## SourceMap

O build de produção usa sourcemap oculto. Não há upload automático via `@arms/rum-vite-plugin`; quando necessário, faça o upload manualmente no console do ARMS usando o ID de aplicação `arms-id-placeholder` e a `version` do `package.json` raiz.

## Impacto da remoção do Sentry

O Sentry do Desktop foi removido, e crashes de renderer/main e erros JS passaram a ser atendidos pelo ARMS. O utility host e o RUM do controle remoto Web não estão nesta cadeia; o CLI Agent reporta saídas inesperadas e erros de spawn apenas por eventos customizados de estabilidade do desktop main, sem coleta automática pelo crash collector do Electron.