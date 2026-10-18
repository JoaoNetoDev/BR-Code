# Design de telemetria de tempo por fase de «início do app → usuário pode digitar» no desktop

> Data: 2026-06-17　Responsável: responsável por dados e observabilidade
> Escopo: decompor a cadeia de inicialização «criação do processo → usuário consegue digitar» em 7 segmentos, cada um reportado de forma independente pelo ARMS `sendCustom`, para localizar pontos de otimização de desempenho mais adiante. Substitui o `perf_ui_first_screen` existente, que mede apenas a renderização interna do renderer.

## Contexto e problema

O `perf_ui_first_screen` atual (ver `docs/monitoring/performance-monitoring.md`) tem o intervalo de medição:

- início: início da execução do bundle JS do renderer (`performance.now()` no nível de módulo de `main.tsx`)
- fim: primeiro commit do React (evento `zcode-react-startup-ready`)

A média em produção é ≈ 75ms. Ele **cobre apenas aquele pequeno trecho de renderização interna do renderer**, deixando de fora a maior parte da percepção subjetiva do usuário:

- o cold start do próprio runtime do Electron (criação do processo → main JS)
- a inicialização do processo main e a orquestração de criação da janela (main JS → loadURL)
- o início do processo renderer, o shell HTML, o download/parse do bundle
- **os gates de inicialização depois do commit do React** (resolução de autenticação / start de provider / restauração de workspace) — durante esse período `RootStartupLoading` é exibido e a caixa de entrada ainda não está disponível

**Objetivo**: reportar a duração total de «criação do processo → caixa de entrada realmente disponível», decomposta em fases atribuíveis, para localizar os pontos de otimização.

## Objetivos e não objetivos

**Objetivos**
- Adicionar a duração total de «início até poder digitar» + 6 durações de subfase, todas indo para ARMS `group=ui_perf`.
- Replicar o padrão já existente de `perf_network_*_dns_ms`, de «um nome de evento por fase + seu próprio value», para que cada trecho gere mean/p50/p90/p99 de forma estável.
- Amostragem total (100%), uma única vez por cold start de processo renderer.

**Não objetivos**
- Não mudar as definições dos canais main / preload / IPC — reutilizar a cadeia existente `PlatformChannels.ReportArmsCustomEvent` e o mecanismo de injeção `additionalArguments`.
- Não tocar nos três eventos `perf_ui_first_token` / `perf_ui_message_complete` / `perf_ui_stream_stall`.
- Não cobrir janela secundária / reload de runtime (apenas a primeira cadeia de cold start da janela principal).

## Por que «um evento independente por fase» em vez de «um evento com vários campos»

Na cadeia de report do ARMS (`desktopMainIpcRemote.ts:126-148`), apenas `value` é mapeado para o indicador numérico padrão `metric_value`, que permite agregação estável de média/percentis; `properties` é usado como dimensão/contagem. A telemetria de rede existente (`performance-monitoring.md:155-156`) justamente usa **`perf_network_*_duration_ms` (total) + `perf_network_*_dns_ms` (por fase)** como eventos independentes para obter percentis por fase, sem apostar que números em properties consigam agregação. Este design segue o mesmo padrão já validado.

## Âncoras de tempo e relógio entre processos

O início está no **processo main** e o fim no **processo renderer**; os `performance.now()` dos dois processos têm origens diferentes e **não podem ser subtraídos**. Uniformiza-se em **milissegundos epoch**:

- âncora `T0 = process.getCreationTime()` (epoch ms de criação do processo, obtenível tanto em main quanto em renderer)
- os demais limites usam uniformemente `Date.now()`

Todas as fases são subtraídas em um único ponto do renderer e enviadas de uma vez em 7 eventos, evitando cálculos espalhados.

### Os sete instantes

| Marcador | Local de coleta | Processo | Significado |
|------|----------|------|------|
| `T0` | `process.getCreationTime()` | main | criação do processo (âncora) |
| `T1` | `Date.now()` na primeira linha do topo do módulo `main/index.ts` | main | início do main JS |
| `T2` | `Date.now()` na entrada do callback `app.whenReady().then` (index.ts:981) | main | framework pronto |
| `T3` | `Date.now()` antes da chamada de `loadURL` da janela principal | main | início do carregamento do renderer |
| `T4` | `Date.now()` no topo do módulo `renderer/src/main.tsx` | renderer | início da execução do bundle |
| `T5` | `Date.now()` no disparo de `zcode-react-startup-ready` | renderer | primeiro commit do React |
| `T6` | `Date.now()` quando o gate de inicialização `isStartupRenderBlocked` vai de `true→false` | renderer | caixa de entrada disponível |

### As sete fases (diferenças adjacentes)

| Nome do evento (`group=ui_perf`) | `value` | Intervalo | Para onde aponta a otimização |
|---------------------------|---------|------|----------|
| `perf_ui_launch_to_input` | **duração total** | `T6 - T0` | indicador principal do «início até ficar utilizável» na percepção do usuário |
| `perf_ui_launch_electron_init_ms` | `T1 - T0` | criação do processo → main JS | binário do Electron + start do V8 (basicamente não controlável, serve como baseline) |
| `perf_ui_launch_app_ready_ms` | `T2 - T1` | main JS → whenReady | inicialização síncrona do main |
| `perf_ui_launch_window_ms` | `T3 - T2` | whenReady → loadURL | orquestração de inicialização de janela/diretório de dados/política de rede etc. |
| `perf_ui_launch_renderer_load_ms` | `T4 - T3` | loadURL → execução do bundle | shell HTML, download/parse do bundle |
| `perf_ui_launch_react_commit_ms` | `T5 - T4` | bundle → commit do React | renderização interna do renderer (= semântica antiga de `perf_ui_first_screen`) |
| `perf_ui_launch_startup_gate_ms` | `T6 - T5` | commit do React → caixa de entrada disponível | restauração de autenticação / provider / workspace |

Cada `properties` carrega `session_id` (chave de associação da mesma inicialização, derivada de `T0` ou do renderer_id) para remontar as 7 partes em uma inicialização.

## Fluxo de dados

```
main 进程
  T0 = process.getCreationTime()        // 锚点
  T1 = Date.now()  (index.ts 模块顶部)
  T2 = Date.now()  (app.whenReady 回调入口)
  T3 = Date.now()  (主窗口 loadURL 前)
    └─ 序列化 {T0,T1,T2,T3} 注入 webPreferences.additionalArguments
       形如 --zcode-launch-marks=<json>（先例：desktopWindowChrome.ts:283 的 --device-id=）
         │
renderer 进程
  从 process.argv 解析出 {T0,T1,T2,T3}（先例：preload/index.ts:14 已读 argv）
  T4 = Date.now()  (renderer/src/main.tsx 模块顶部)
  T5 = Date.now()  (zcode-react-startup-ready, 一次性)
  T6 = Date.now()  (Root: isStartupRenderBlocked true→false)
    └─ 在 T6 处统一算 7 段 → reportUiLaunchStages(...)
       → uiPerfArmsTelemetry 单例 reporter.reportArmsCustomEvent × 7
       → window.zcode.reportArmsCustomEvent → IPC → armsRum.sendCustom
```

As dimensões comuns (app_version / arms_env / device_mid / platform / renderer_id) são preenchidas de forma unificada pelo handler do main; o lado de UI não as repete.

## Determinação e limites do ponto final T6

- **Definição de T6**: o instante em que o `isStartupRenderBlocked` de `Root.tsx` (L547, calculado por `shouldShowRootStartupLoading`) vira de `true→false` — nesse momento `RootStartupLoading` sai de cena, `LexicalChatInput` é montado e fica editável. Adicionar um `useEffect` no Root que observa essa virada booleana; ao virar `false`, registra T6 e dispara o report (usando ref para garantir disparo único por processo).
- **Limite de não logado / WelcomeScreen**: `shouldShowRootStartupLoading` retorna `false` quando `welcomeScreenOpen` está ativo (`rootStartupGate.ts:47`), ou seja, o gate é «limpo», mas o que aparece é a página de login, **sem caixa de entrada**. Essa inicialização **não reporta** a cadeia total `perf_ui_launch_to_input` (a premissa «pode digitar» não se Cumpre), evitando poluir a distribuição. Forma de decidir: ao disparar T6, se o estado for WelcomeScreen, o lote inteiro é pulado. Só inicializações com login que entram normalmente no workspace são reportadas.
- **Timing de injeção do reporter**: diferente do antigo `perf_ui_first_screen`, T6 ocorre depois do mount do Root, no momento da limpeza do gate, e o reporter já foi injetado por `setUiPerfArmsReporter`, portanto **não é necessário** `pendingFirstScreenPayload` para armazenar e reenviar (essa lógica é removida junto com o evento antigo).

## Robustez do relógio

- `Date.now()` é um relógio de parede; em teoria uma correção de hora do sistema no meio da inicialização pode gerar valores negativos/saltos. Cada `value` passa por `Math.max(0, Math.round(...))` (mantendo a convenção existente).
- Sentinela: se a duração total `T6 - T0` for > `LAUNCH_TO_INPUT_SANITY_MAX_MS` (por exemplo 300000ms / 5min), é considerada anômala, o lote inteiro é descartado com `logger.warn` e nada é reportado.
- `process.getCreationTime()` pode retornar `null`/`-1` em pouquíssimas plataformas; nesse caso o lote inteiro é pulado (não é possível alinhar a âncora), com `logger.warn`.

## Tratamento do `perf_ui_first_screen` existente: descontinuado, substituído por completo

Sua semântica é totalmente coberta por `perf_ui_launch_react_commit_ms` (`T5 - T4`). Limpeza junto:
- `uiPerfArmsTelemetry.ts`: remover `UI_PERF_EVENT_FIRST_SCREEN`, `reportUiFirstScreen`, `pendingFirstScreenPayload` e o ramo de reenvio dentro de `setUiPerfArmsReporter`.
- `renderer/src/main.tsx`: remover `uiFirstScreenStartedAt` e a parte que chama `reportUiFirstScreen` dentro do listener de `zcode-react-startup-ready` (o listener em si é mantido — T5 ainda precisa dele).
- As entradas de `perf_ui_first_screen` em testes/documentação são substituídas pelos novos eventos.

> Nota: o painel histórico do evento antigo Griffinará de receber dados. Já foi confirmado com o solicitante que isso é aceito (o objetivo é uma cadeia de inicialização mais completa, e o trecho antigo de 75ms passa a fazer parte da nova cadeia).

## Lista de arquivos alterados

| Arquivo | Alteração |
|------|------|
| `packages/desktop/src/main/index.ts` | registrar `T1` no topo do módulo; registrar `T2` na entrada do callback `whenReady`; obter `T0=process.getCreationTime()` |
| `packages/desktop/src/main/desktopWindowLifecycle.ts` | registrar `T3` antes do `loadURL`; injetar `{T0,T1,T2,T3}` no `additionalArguments` da janela principal |
| `packages/desktop/src/preload/index.ts` ou entrada do renderer | analisar as launch marks de `process.argv` e expor ao renderer |
| `packages/desktop/src/renderer/src/main.tsx` | registrar `T4`; registrar `T5` em `zcode-react-startup-ready` (removendo a chamada antiga de `reportUiFirstScreen`) |
| `packages/ui/src/Root.tsx` | `useEffect` observando a virada de `isStartupRenderBlocked` para registrar `T6`, montar as marks e chamar `reportUiLaunchStages` (incluindo a decisão de pular no WelcomeScreen) |
| `packages/ui/src/lib/uiPerfArmsTelemetry.ts` | adicionar `reportUiLaunchStages(marks)` enviando 7 eventos; remover `reportUiFirstScreen` e a lógica de armazenamento temporário; adicionar constantes |
| `packages/ui/src/lib/uiPerfArmsTelemetry.test.ts` | remover os casos antigos de first_screen; adicionar: payload correto das 7 partes, valor negativo fixado em 0, descarte pela sentinela, pulo no WelcomeScreen, erro absorvido quando o reporter não foi injetado |
| `docs/monitoring/performance-monitoring.md` | na visão geral de eventos, substituir `perf_ui_first_screen` pelos 7 eventos `perf_ui_launch_*` |

## Constantes

| Constante | Valor | Local |
|------|-----|------|
| `UI_PERF_ARMS_GROUP` | `"ui_perf"` (reutilizada) | uiPerfArmsTelemetry.ts |
| `UI_PERF_EVENT_LAUNCH_TO_INPUT` e outros 7 nomes de evento | ver tabela acima | uiPerfArmsTelemetry.ts |
| `LAUNCH_TO_INPUT_SANITY_MAX_MS` | `300000` | uiPerfArmsTelemetry.ts |
| `LAUNCH_MARKS_ARGV_PREFIX` | `"--zcode-launch-marks="` | constante compartilhada |

## Tratamento de erros

- Todo report é envolvido em try/catch internamente; em caso de falha apenas `logger.warn`, nunca bloqueando o fluxo principal de inicialização (mantendo a convenção existente).
- Retorno silencioso quando o reporter não foi injetado (em T6 ele já foi injetado; normalmente não ocorre).
- Qualquer âncora ausente (T0 inválido / argv sem marks analisadas) → o lote inteiro é pulado, sem enviar dados parciais.

## Testes

- **Testes unitários** (`uiPerfArmsTelemetry.test.ts`):
  - dado `{T0..T6}`, name/group/value corretos nas 7 payloads e cálculo correto das diferenças adjacentes.
  - alguma parte negativa (retrocesso de relógio) → o value daquela parte é fixado em 0 e as demais ficam normais.
  - duração total acima do limiar da sentinela → o lote inteiro não é enviado.
  - flag de WelcomeScreen verdadeira → o lote inteiro não é enviado.
  - reporter não injetado / reporter lança erro → não lança e não bloqueia.
- **Validação local** (`arms_env=local`):
  - cold start com login → no log `beforeReport` do main aparecem em sequência 7 ocorrências de `custom:perf_ui_launch_*`, com total ≈ soma das partes.
  - sanidade de ordem de grandeza por parte: `react_commit` deve ficar próximo dos ~75ms do antigo first_screen.
  - cold start sem login → `perf_ui_launch_to_input` não aparece.
  - regressão: `perf_ui_first_token` / `perf_ui_message_complete` / `perf_ui_stream_stall` não são afetados.

## Itens ajustáveis no futuro (fora deste ciclo)

- Se as partes `react_commit` / `startup_gate` se revelarem o grosso do tempo, elas podem ser subdivididas ainda mais (por exemplo, restauração de workspace vs start de provider).
- Depois que a ordem de grandeza estabilizar, definir alertas de baseline de desempenho de inicialização com base em p50/p90/p99.
- Se a cadeia de janela secundária / reload precisar de monitoramento, criar eventos separados, sem misturá-los à distribuição de cold start.