# Monitoramento de Performance

> Este documento cobre estabilidade, rede e performance de UI; o contrato de recursos de processo está em
> [Monitoramento de CPU / memória de processo completo](./process-resource-telemetry.md). A qualidade de negócio está
> em [business-monitoring.md](./business-monitoring.md).
>
> A referência rápida de nomes de evento / value / campos de todos os pontos de medição de performance (incluindo
> `agent_trace` de `/report` no encadeamento de mensagens) está em
> [performance-telemetry-catalog.md](./performance-telemetry-catalog.md).
>
> **Dica de integração da V4**: as métricas de estabilidade, recursos e rede do ARMS em main/renderer permanecem
> inalteradas; as métricas de conversation são ligadas pelo supervisor de workspace live-only definido em
> [conversation-telemetry-v4.md](./conversation-telemetry-v4.md) e não entram em snapshot/recovery.

## Escopo

- **P0 (atual)**: métricas de **estabilidade**, **consumo de recursos** e **rede e comunicação** do cliente
  desktop Electron, com dados indo para **ARMS `@arms/rum-electron`** (`sendCustom`, `group` =
  `stability` / `resource` / `network`).
- **Não feito**: RUM de Web/mobile com controle remoto, ANR de processos Host/Agent, pontos de negócio de
  `/report` (`app_launch` não serve de denominador para a taxa de crash). Saída inesperada do Agent é complementada
  ativamente pelo desktop main com `perf_agent_crash`; o controle remoto mobile reusa o host compartilhado e não
  reporta de novo.

## Fronteira com o monitoramento de negócio

| Pertence a este documento                                   | Pertence a [business-monitoring.md](./business-monitoring.md) |
| ----------------------------------------------------------- | ----------------------------------------------------------------- |
| Taxa de crash, ANR, Crash-Free, travamento, códigos de saída | Pontos de produto, biblioteca de observabilidade do Agent, painel de confiabilidade de App Usage |

## Métricas de estabilidade P0

### Dimensões comuns

Todos os eventos custom P0 (`sendCustom`) carregam:

| Campo                    | Descrição                                                                                 |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `platform`               | `macos` / `windows` / `linux`                                                            |
| `app_version`            | `ZCODE_VERSION`                                                                           |
| `arms_env`               | `prod` / `local` (`mapZCodeEnvToArmsRumEnv(runtimeEnv)`; em desenvolvimento local é fixo `local`) |
| `device_mid`             | Identificador de dispositivo desktop (hash do caminho `userData`)                         |
| `telemetry_schema_version` | Versão do critério de medição dos eventos de estabilidade; após esta correção, o evento é fixo em `2` |
| `scene_lifecycle`        | Ver tabela abaixo                                                                        |
| `scene_window`           | Ver tabela abaixo                                                                        |

**Cena — lifecycle**

| Valor            | Significado                          |
| ---------------- | ------------------------------------ |
| `cold_start`     | Cold start do processo, `perf_app_start` |
| `runtime`        | Execução normal (padrão)             |
| `app_quit`       | Saída por usuário/sistema            |
| `update_install` | Saída por instalação de update via `quitAndInstall` |

**Cena — window (primeira versão)**

| Valor             | Significado                             |
| ----------------- | --------------------------------------- |
| `main`            | Janela principal de negócio             |
| `process_monitor` | Janela singlet do Resource Manager (gerenciador de recursos) |
| `other`           | Outras `BrowserWindow`                  |

### 1. Taxa de Crash

- **Taxa de Renderer Crash**:
  `count(perf_crash where crash_scope=main_window_renderer) / app_start_count`.
- **Taxa de Native Crash**:
  `count(crashReporter where crash_scope=app_native_process and native_dump_process_role=main) /
app_start_count`.
- **Denominador**: `perf_app_start`, uma vez por processo (depois de `await armsInitPromise`, com atraso de cerca
  de 3,2s após o `did-finish-load` da primeira tela da janela principal).
- **Proibido somar**: Renderer Crash e Native Crash devem ser contabilizados por origem. Um dump de renderer no
  Windows também pode conter o exe do produto; o mesmo incidente gera ao mesmo tempo um callback do Electron e um
  dump do crashReporter; os dois não têm um ID de incidente estável compartilhado, e somá-los diretamente contaria
  em duplicidade.
- **Não entra em Renderer Crash**: `auxiliary_window_renderer`, `embedded_webview` (Page Crash), `host`, Agent
  Crash, saídas recuperáveis de GPU/Utility.
- **Contagem**: um reporte por callback `render-process-gone` / `child-process-gone` do Electron, sem a
  deduplicação de cinco minutos no cliente por `crash_kind`. O retry de rede do ARMS é tratado pela identificação
  de evento do servidor; não se pode engolir um crash real com uma janela de tempo grosseira dentro do processo.

```text
Mesmo renderer crash do Windows
        │
        ├─ render-process-gone ── perf_crash / electron_callback
        │                              └─ Taxa de Renderer Crash
        │
        └─ Crashpad dump ─────── crashReporter / crash_reporter_dump
                                   │
                                   ├─ role=main ── app_native_process ── Taxa de Native Crash
                                   └─ unknown/helper ── native_dump_unattributed
                                                        └─ apenas diagnóstico, não entra no Crash-Free

Dois eventos de origem distinta ── união por device_mid ── Crash-Free
             └─ proibido somar direto pelo número de eventos
```

**Classificação de crash**

`crash_scope` indica "qual processo/página do produto caiu", `crash_cause` indica "por que caiu". Os dois não podem
mais misturar `js` / `native`.

| Origem                                        | `crash_scope`               | `crash_cause`                                   | `crash_source`        |
| --------------------------------------------- | --------------------------- | ----------------------------------------------- | --------------------- |
| `render-process-gone` da janela principal de negócio | `main_window_renderer`      | `oom` / `process_crashed` / `abnormal_exit` / … | `electron_callback`   |
| Janelas auxiliares (Resource Manager / update / About etc.) | `auxiliary_window_renderer` | idem                                             | `electron_callback`   |
| `render-process-gone` do `<webview>` do navegador embutido | `embedded_webview`          | idem                                             | `electron_callback`   |
| `child-process-gone` do ZCode Host           | `host`                      | `process_crashed` / `abnormal_exit` / …         | `electron_callback`   |
| crash dump do ARMS, explicitamente marcado como processo principal | `app_native_process`        | `native_crash`                                  | `crash_reporter_dump` |
| crash dump do ARMS, apenas confirmado como vindo do binário do produto | `native_dump_unattributed`  | `native_crash`                                  | `crash_reporter_dump` |
| `reason=killed` / `clean-exit`                | —                           | não conta como crash, segue `perf_process_exit` | —                     |

`reason=memory-eviction` e `reason=oom` do Electron são classificados uniformemente como `crash_kind=oom`,
`crash_cause=oom`; o primeiro indica que o Chromium despejou o processo sob pressão de memória.

`crash_kind` é mantido apenas por compatibilidade com consultas históricas: no schema v2, `oom` continua sendo
`oom` e os demais crashes de processo são unificados como `native`; o valor histórico `js` não recebe novos casos.
Page Crash é consultado diretamente como `perf_crash AND crash_scope=embedded_webview`, sem criar um segundo
`perf_page_crash`, evitando reportar o mesmo incidente duas vezes.

O `crashReporter` do ARMS varre o diretório compartilhado de crash dumps. Antes de reportar, valida-se primeiro que
`binary_images` contém o executável do produto ZCode atual; dumps de programas externos como `hdc`,
`plugin-container`, `chrome-headless-shell` são descartados diretamente. Esse filtro apenas percorre os metadados
já existentes do lote de crash, sem adicionar amostragem, arquivos ou subprocessos. O conjunto de nomes confiáveis
deve conter o nome do aplicativo do produto e `basename(process.execPath)` cobrindo o `Electron` do modo de
desenvolvimento e o `zcode-preview` do Linux Preview.

Acertar apenas o binário do produto não prova que o dump veio do processo principal: sub-processos do Electron no
Linux/Windows podem compartilhar o mesmo executable. O evento só deve usar `crash_scope=app_native_process` quando
for explicitamente marcado como `main` por `native_dump_process_role` (ou pelos metadados de process-role
compatíveis); com papel desconhecido ou pertencente a sub-processo, o evento original é preservado, mas com
`crash_scope=native_dump_unattributed`, fora do App Crash / Crash-Free.

A cadeia de metadados de papel é fixa: `process_type` / `ptype` estruturado do Crashpad →
`meta.process_type` extraído pelo crash collector do `@arms/rum-electron` a partir do info do minidump do Crashpad
e do RVA de annotation → `readNativeDumpProcessRole()`; nele, `browser` é normalizado para `main`. O collector não
deve varrer o dump inteiro procurando bytes de key/value adjacentes; bytes homônimos não referenciados pela estrutura
de annotation não podem participar da determinação de papel. É proibido usar `meta.process` (esse campo é o nome
do aplicativo) para adivinhar o papel. Atualizações de dependência ou patch do SDK devem preservar esse contrato de
transparência, caso contrário todos os dumps sem papel continuam caindo em `native_dump_unattributed`.

No Windows e no Linux, o processo principal do Electron e alguns sub-processos podem compartilhar o mesmo nome de
executável do produto, e apenas `binary_images` não subdivide os papéis de processo de forma confiável. Dumps sem
marcação do processo principal não podem ser usados diretamente no Crash-Free; Native Crash e Renderer Crash devem
usar suas respectivas taxas por origem, sem compor um `app_crash_count`.

### 1.1 Crash do processo Agent

- **Evento de inicialização**: após receber com sucesso o Node `spawn`, reporta `perf_agent_start(value=1)`, uma
  vez por runtime; uma falha no spawn não gera evento de inicialização.
- **Evento de prontidão**: na primeira vez em que o mesmo runtime passa pelo gate de provider/model, reporta
  `perf_agent_ready(value=1)` carregando `startup_duration_ms`; um runtime somente leitura não conta como ready
  antecipadamente.
- **Evento**: `perf_agent_crash`, `value=1`, contabilizado por número de eventos ou `sum(value)`.
- **Critério**: o Agent é um processo de longa duração; um exit que ocorre sem intenção de saída ativa do Host é,
  mesmo com `exit_code=0`, uma saída inesperada.
- **Exclusões**: a reciclagem ativa por workspace/app não reporta; a reciclagem por request timeout é registrada
  como `watchdog_recycle` e não entra como crash; `protocol-close` é um resultado de crash e não pode servir como
  condição de exclusão.
- **Proteção contra saída do app**: depois que o desktop main emite `perf_app_exit`, ele mantém continuamente
  `app_quit` / `update_install`; um exit de Agent que chega depois de forma assíncrona não entra como crash.
- **Classificação compatível de término controlado**: o RUM do desktop local exclui `exit_code=0x40010004` do
  Windows e `signal=SIGTERM` no POSIX somente quando falta uma causa estruturada de saída. `protocol-close` não
  estabelece intenção de saída ativa, mas o Host passa a primeira causa de cleanup como `termination_reason`; mesmo
  que a reciclagem posterior da árvore de processos produza características de saída de sistema controlada, o crash
  continua reportado como falha de protocolo.
- **Diagnóstico**: reporta o tail de stderr desidentificado, com no máximo 4000 caracteres, junto de
  `error_name/error_code/error_fingerprint`, `crash_phase`, `termination_class`,
  `termination_reason`,
  `diagnostic_class`. O resumo prioriza a identificação de OOM, SQLite, errno e exclui ruído estrutural como
  `[Object]`, títulos de GC e endereços de native stack. É proibido subir caminhos de workspace, argumentos de
  comando, credentials e conteúdo de sessão; API keys `sk-...` em claro precisam ser desidentificadas tanto em
  services quanto no desktop main.
- **Correlação de instância**: `perf_agent_start` / `perf_agent_ready` / `perf_agent_crash` /
  `perf_agent_spawn_error`
  usam o mesmo `runtime_instance_id` aleatório; esse ID não contém workspace, PID nem informação de
  dispositivo.
- **Falha de inicialização**: segue um caminho separado via `perf_agent_spawn_error(value=1)`.
- **Contrato detalhado**: [ARMS de crash do processo Agent](./agent-process-crash-arms.md).

### 2. ANR / taxa de não resposta

- **Fórmula**: `anr_count / app_start_count` (plataforma × versão).
- **Critério**: `unresponsive` do `webContents` inicia a contagem; `responsive` ou a destruição a encerra; duração
  ≥ **`STABILITY_ANR_THRESHOLD_MS` (5000)** reporta `perf_anr`.
- **Windows**: depende de `unresponsive` do Electron/Chromium, coerente com o "aplicativo não está respondendo" do
  sistema; não se conecta a uma API Win32 separada.

### 3. Taxa Crash-Free

- **Fórmula**: `1 - (affected_users / active_users)`, baseline da indústria **≥ 99,5%**.
- **Chave de usuário**: `device_mid` (propriedades `properties` do ARMS + vínculo com `perf_app_start`).
- **Dispositivos afetados**: união deduplicada de `device_mid` que, na janela de tempo, apresenta
  `main_window_renderer` ou `app_native_process` com `native_dump_process_role=main` validado pelo binário do
  produto. `native_dump_unattributed` e crashes de janela auxiliar/Page/Host/Agent não entram nesse conjunto.
- **Periodicidade**: configurada no lado do ARMS para painéis diários/semanais; o cliente garante que os eventos
  carreguem `device_mid`.

### 4. Taxa de travamento / congelamento

- **Fórmula**: `freeze_count / app_start_count` (plataforma × versão).
- **Critério**: `unresponsive` com duração ≥ **`STABILITY_FREEZE_THRESHOLD_MS` (30000)** e sem crash nessa
  ocorrência → `perf_freeze`.
- Se um crash acontecer depois, conta apenas o crash, não o freeze.

### 5. Distribuição de códigos de saída

| Evento               | Descrição                                                             |
| -------------------- | --------------------------------------------------------------------- |
| `perf_app_exit`      | Saída do app (`before-quit`, `exit_kind=normal`, `exit_code=0`)       |
| `perf_process_exit`  | Saída anormal de sub-processo/processo de renderização (`exit_code`, `exit_reason`, `process_role`) |

Painel: histograma por `exit_code` × `process_role`; `exit_kind=normal` fica em um bucket separado.

## Métricas de consumo de recursos P0

A amostragem de CPU / memória do processo completo, os três eventos de recurso, os limites vermelhos e a aceitação
PRT-023 / PRT-024 estão unificados em
[Monitoramento de CPU / memória de processo completo](./process-resource-telemetry.md). O evento de volume do
diretório de dados continua em
[ARMS de ocupação do diretório de dados do ZCode](./zcode-data-size-arms-telemetry.md).

---

## Métricas de rede e comunicação P0

Reporte agregado de **5min** no processo principal (1min em desenvolvimento). Cada janela `transport + interface`
envia apenas um `group=network/name=perf_network_window`; taxa de sucesso, taxa de erro e taxa de retry são derivadas
por consulta de counts, sem dividir eventos nem enviar espelhos de taxa de erro globais. Depois de mesclar as
propriedades globais, cada evento não pode ultrapassar 20 atributos.

### Fontes de dados

| Camada de transporte | Ponto de coleta                                                                                                                                                      | Dimensão de interface    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| HTTP                 | ARMS `beforeReport` parseia os eventos `api` (`dns_duration` / `connect_duration` / `ssl_duration` / `first_byte_duration` / `download_duration`) | `host+path`               |
| RPC                  | `NetworkTelemetryChannelServer` do Host envolve o `ChannelServer`; o lote volta ao main via `HostResponseTypes.NetworkTelemetryBatch`                 | `channel.command`         |
| WebSocket            | `WebRemoteControlDeviceTransport`: conexão/desconexão/reconexão do relay de controle remoto                                                                   | `web_remote_control.relay` |

### Visão geral dos eventos

| Evento               | Métrica                                                                                                                       | Dimensões do painel                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `perf_network_window` | `value`=média de duração; counts de success/fail/retry, pico/p95 de duração; para HTTP apenas a média por fase; para erros apenas o tipo principal da janela e sua contagem | plataforma×`transport`×`interface` |

`primary_error_kind` é fixo em: `timeout`, `dns_failure`, `connection_reset`, `proxy_error`,
`tls_error`, `server_error`, `client_error`, `other`, e carrega `primary_error_count`. Quando a janela tem
vários erros, toma-se o de maior contagem; em caso de empate, decide a ordem fixa da enumeração; qualquer valor
estranho cai em `other`.

No path HTTP só se mantém, explicitamente registrado no código, o segmento de rota estático e de baixa cardinalidade;
números, UUIDs, e-mails, slug de usuário, tokens longos e segmentos não registrados são todos templateizados como
`:id`. URL de arquivo, caminhos com letra de unidade do Windows e quaisquer caminhos absolutos POSIX locais
iniciados por `/` são unificados em `local_file`; é proibido adivinhar o escopo de caminhos locais enumerando
diretórios raiz comuns. Cada transport tem um teto rígido de buckets de memória, e o excedente cai em `other`; o
flush continua mantendo apenas as 40 interfaces de maior volume.

Constantes: `NETWORK_REPORT_INTERVAL_MS` em produção 300000 / desenvolvimento 60000; flush de lotes do Host em 30s /
no máximo 200 itens.

## Métricas de performance de UI no cliente P0

Pontos de medição no renderer (UI), reportados via `reportArmsCustomEvent` → IPC → `armsRum.sendCustom`. Eventos
`group=ui_perf`, com prefixo de nome `perf_ui_`. Amostragem total (100%). As dimensões comuns são preenchidas
automaticamente pelo IPC handler do main (`app_version` / `arms_env` / `device_mid` / `platform` / `renderer_id`).

### Visão geral dos eventos

| Evento                              | `value`                     | Origem                                                  | Propriedades-chave                                                                                                                                                                  |
| ----------------------------------- | --------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `perf_ui_launch_to_input`           | Tempo total até poder digitar em ms | Criação do processo(`getCreationTime`)→ limpeza do gate de startup, campo de entrada disponível | `session_id`                                                                                                                                                                         |
| `perf_ui_launch_electron_init_ms`   | ms de init do Electron      | Criação do processo → JS do main                         | `session_id`                                                                                                                                                                         |
| `perf_ui_launch_app_ready_ms`       | ms de init do main          | JS do main → `app.whenReady`                             | `session_id`                                                                                                                                                                         |
| `perf_ui_launch_window_ms`          | ms de orquestração da janela | `whenReady` → `loadURL`                                  | `session_id`                                                                                                                                                                         |
| `perf_ui_launch_renderer_load_ms`   | ms de load do renderer      | `loadURL` → execução do bundle                           | `session_id`                                                                                                                                                                         |
| `perf_ui_launch_react_commit_ms`    | ms de render do React       | bundle → primeiro commit do React                        | `session_id`                                                                                                                                                                         |
| `perf_ui_launch_startup_gate_ms`    | ms do gate de startup       | React commit → campo de entrada disponível (auth/provider/recuperação de workspace) | `session_id`                                                                                                                                                                         |
| `perf_ui_session_open_start`        | contagem de início de abertura de session | Início lógico da abertura após o acquire do pane pelo renderer | `session_open_id` / `session_id` / `open_kind` / `open_trigger` / `client_mode`                                                                                                      |
| `perf_ui_session_open_result`       | Tempo total da primeira tela até interativo em ms | Primeiro snapshot pintado e Composer interativo; também reporta em falha/timeout | `status` / `session_open_id` / `session_id` / durações das fases Host/CLI/Renderer                                                                                                 |
| `perf_ui_first_token`               | ms de latência do primeiro token | Espelha o `time_to_first_token` de `message_completion` | `model` / `talk_id` / `message_id`                                                                                                                                                   |
| `perf_ui_message_complete`          | ms de mensagem ponta a ponta | Espelha o `duration_ms` de `message_completion`           | `result` / `talk_id` / `message_id`                                                                                                                                                  |
| `perf_ui_stream_stall`              | ms de stall real             | Intervalo entre chunks de corpo consecutivos no stream > 3000ms | `stall_ms` / `waiting_tool` / `talk_id` / `message_id`                                                                                                                               |
| `perf_ui_tool_call_detail`          | ms de estado final da tool  | `raw.result.perf` do estado final de `tool_call_update`   | `tool_name` / `status` / `talk_id` / `message_id` / `tool_call_id` / `parent_tool_call_id` / `child_tool_call_id` / `child_session_id` / `agent_id` / `agent_type` / campos de fase interna da tool |

### Explicações e fronteiras

- **Startup por fases**: as 7 fases reportam uma vez cada por cold start de processo, com `value` em ms por fase
  (`Math.max(0,...)` garante não-negativo). A âncora é `process.getCreationTime()`; T0-T3 do main são injetados
  no renderer via query de loadURL da janela principal (`zcodeLaunchMarks`) e reportados de forma unificada quando o
  gate de startup é liberado (`isStartupRenderBlocked` vira false). Sem login (WelcomeScreen) não há reporte; duração
  total > 300000ms é descartada pelo sentinela. `session_id` correlaciona as fases da mesma inicialização. O antigo
  `perf_ui_first_screen` foi descontinuado, com a semântica absorvida por `perf_ui_launch_react_commit_ms`.
- **Primeira abertura de session**: `perf_ui_session_open_start` / `perf_ui_session_open_result` têm no máximo
  dois registros por abertura lógica; o timing das fases é carregado pelo ACK de `v4/conversation/subscribe`, sem
  dividir em eventos ARMS por fase; o reporter Web/mobile fica vazio. Campos completos e fronteiras em
  [Telemetria ARMS da primeira abertura de session](./session-open-telemetry.md).
- **Primeiro token / duração da mensagem**: o supervisor V4 reusa o builder `messageTelemetry`; a âncora de tempo
  continua sendo o clock de recebimento no renderer; initial/recovery não fazem reporte retroativo.
- **Detalhamento do estado final das tools**: `perf_ui_tool_call_detail` só é reportado quando a tool conclui,
  falha ou é rejeitada e `raw.result.perf` existe. Bash traz `command_run_ms` / `first_output_ms` / `no_output_ms` /
  `timed_out` / `command_category` etc.; Edit/Write traz `fs_read_ms` / `fs_write_ms` / `patch_match_ms` / tamanho do
  arquivo etc. O espelho de subagent para sub-tools adiciona `parent_tool_call_id` / `child_tool_call_id` /
  `child_session_id` / `agent_id` / `agent_type`, usado para descer do step pai `Agent` até a duração das
  sub-tools.
- **Duração por step**: `agent_step` mantém o critério antigo de `/report`; o ARMS **RUM Custom Event**
  continua fazendo apenas atribuição de baixa frequência por turno e no estado final das tools; é proibido
  espelhar item a item o `/report agent_step` como eventos RUM.
  O OTel Span `zcode.agent.step` do CLI Agent Loop é outro Trace de execução fortemente tipado, cuja estrutura
  alvo está em [Guia de desenvolvimento de Telemetria do CLI Agent](../trace/cli-agent-telemetry.md); ele não passa
  pelo IPC do Renderer e não reutiliza o Schema antigo de `agent_step`.
- **Stall de streaming**: `value` é o intervalo real entre chunks (não o threshold), e o threshold
  `STREAM_STALL_REPORT_THRESHOLD_MS=3000` serve apenas como porta de reporte. **Não conta durante chamadas de
  tool**: quando `tool_call`/`tool_call_update` chega, `clearStreamStallTracking` é chamado, o primeiro chunk de
  corpo após a tool é considerado o primeiro e não é comparado com os chunks anteriores à tool, evitando classificar
  a execução normal de uma tool como stall. A causa raiz de um intervalo >3s pode estar a montante (inferência do
  modelo/rede) e não necessariamente em travamento de renderização do cliente; mas do ponto de vista do usuário
  "a interface fica parada por muito tempo" é perceptível, então é reportado. O threshold será apertado depois
  conforme a distribuição em produção. `waiting_tool` é fixo em `false` nesta fase.
- **Travamento de renderização (longTask)**: coletado automaticamente pelo Browser SDK do ARMS
  (`browserCollectors.longTask`), sem ponto de medição manual aqui. O `beforeReport` do processo principal extrai
  do `snapshots` do SDK as atribuições LoAF/rAF de top-5 como campos de baixa cardinalidade e as funde nas
  `properties` da mesma longTask: `loaf_script_count`, `loaf_top_duration_ms`,
  `loaf_top_invoker_type`, `loaf_top_share_pct`. Não reporta nomes de script, URLs, caminhos ou trechos de código
  originais; quando `snapshots` está ausente ou falha ao ser interpretado, o passo é ignorado sem afetar o
  reporte original da longTask.

Constantes (código): `STREAM_STALL_REPORT_THRESHOLD_MS=3000` (`packages/ui/src/lib/uiPerfArmsTelemetry.ts`).

## Sugestões de painéis ARMS

- Eventos históricos como o de estabilidade podem ser filtrados por `properties.event_name`; para economizar orçamento
  de atributos, os eventos de recurso e de rede `perf_network_*` devem ser filtrados direto pelo custom `name`.
- Taxa de crash: no schema v2, o numerador de App Crash é filtrado por `crash_scope` e depois agrupado por
  `crash_cause`; o denominador é `perf_app_start`.
- O painel de Native Crash também precisa filtrar
  `json_extract_scalar(properties, '$.native_dump_process_role')='main'`; caso contrário, historicamente, dumps que
  apenas acertaram o binário do produto sem conseguir confirmar o papel do processo ainda poluiriam Native Crash /
  Crash-Free.
- Dimensões: `platform`, `app_version`, `scene_lifecycle`, `scene_window`,
  `crash_scope`, `crash_cause`, `telemetry_schema_version`.
- Ambiente: build de desenvolvimento com `arms_env=local`, produção com `prod`.

## Índice de implementação

| Módulo                       | Caminho                                                     |
| ---------------------------- | ----------------------------------------------------------- |
| Reporte de estabilidade P0   | `packages/desktop/src/main/desktopStabilityTelemetry.ts`    |
| Reporte de recursos P0       | `packages/desktop/src/main/desktopResourceTelemetry.ts`     |
| Reporte de rede P0           | `packages/desktop/src/main/desktopNetworkTelemetry.ts`      |
| Reporte de performance de UI no cliente P0 | `packages/ui/src/lib/uiPerfArmsTelemetry.ts`   |
| Agregação de rede            | `packages/desktop/src/main/networkTelemetryAggregator.ts`   |
| Middleware de rede RPC       | `packages/rpc/src/network-telemetry-middleware.ts`          |
| Lotes de rede do Host        | `packages/desktop/src/host/hostNetworkTelemetry.ts`         |
| Utilitários de agregação     | `packages/desktop/src/main/resourceMetricsStats.ts`         |
| Inicialização do ARMS        | `packages/desktop/src/main/appARMSBootstrap.ts`             |
| Arquivamento de crashes      | `packages/desktop/src/main/desktopCrashCapture.ts`          |
| Ligação no processo principal | `packages/desktop/src/main/index.ts`                       |
| ID da janela do Resource Manager | `packages/desktop/src/main/resourceManagerWindow.ts`    |

## Checklist de verificação local

1. Build de desenvolvimento: log do processo principal `[stability] perf_app_start reported` (ou o `beforeReport`
   do ARMS contendo o evento custom).
2. Disparar uma exception JS comum pelo DevTools: deve aparecer apenas a exception, sem se passar por crash de
   processo; ao simular `render-process-gone` deve aparecer `perf_crash` com o `crash_scope` /
   `crash_cause` corretos.
3. Simular travamento: loop síncrono longo na thread principal ≥5s → `perf_anr`; ≥30s e sem crash → `perf_freeze`.
4. Console do ARMS: selecionar o ambiente `local`, agrupar por `app_version` × `platform` e conferir
   numerador/denominador.
5. Regressão: o `app_launch` de `/report` continua sendo reportado de forma independente, e a contagem não precisa
   ser igual à de `perf_app_start`.
6. Recursos: log `[resource] sampling started`; cerca de 1min (dev / E2E) depois aparece
   `[resource] perf_process_window + perf_system_window flushed`; o `beforeReport` contém um
   `custom:perf_process_window` por papel e um `custom:perf_system_window`.
7. Rede: log `[network] reporting started`; após disparar uma chamada RPC ou HTTP, cerca de 1min depois aparece
   `[network] perf_network flushed` e `custom:perf_network_window`.
8. A ingestão no ARMS pode ter atraso de minutos; consulte usando a âncora de tempo do `beforeReport`.