# Dicionário de Eventos de Telemetria de Performance

> Lista de consulta rápida entre canais, respondendo "quais eventos de performance existem e o que cada um reporta".
> A definição detalhada e os limites estão em [performance-monitoring.md](./performance-monitoring.md); esta tabela serves apenas de índice e consulta rápida de campos.
> A observabilidade unificada via OTel da API de modelos do ZCode CLI Agent está em
> [Guia de Desenvolvimento do CLI Agent Telemetry](../trace/cli-agent-telemetry.md); entra em vigor após configurar o OTLP do ARMS no lado de deploy.
>
> Os dados seguem quatro canais:
>
> - **ARMS (main process)**: `@arms/rum-electron` `sendCustom`, estabilidade / recursos / rede em nível de processo; os recursos do ZCode CLI são autoamostrados pelo CLI e repassados ao main.
> - **ARMS (renderer/UI)**: `reportArmsCustomEvent` → IPC → main `sendCustom`, `group=ui_perf`.
> - **ARMS (CLI Agent)**: `@zcode/telemetry` → OTLP/HTTP protobuf, Logical Call / Physical Attempt de modelo.
> - **`/report` (agent_trace)**: `reportAppTelemetryEvent`, qualidade e latência do encadeamento de mensagens, **não ARMS**.
>
> **Especificação de integração V4**: a calibração de recuperação do `/report` de chat e do ARMS do renderer está em
> [conversation-telemetry-v4.md](./conversation-telemetry-v4.md). A implementação precisa usar o live-only fact feed,
> e não pode reenviar a partir das projeções initial/recovery.

## Limite de logs locais do `/report`

- `TelemetryCore` não imprime nos logs locais requisições, payload completo, respostas, corpos de resposta ou erros brutos.
- Depois que todas as tentativas falharem finalmente, registra-se apenas um warn redigido; os campos ficam limitados ao nome do evento, event ID, número de tentativas, classificação de status e
  latência. Cada retentativa usa somente debug em modo de desenvolvimento. O contrato completo de entrega está em
  [event-report-delivery-reliability.md](./event-report-delivery-reliability.md).
- Falhas de envio continuam sendo entregues ao chamador pela via de rejeição original da Promise; retentativas limitadas não podem alterar a semântica de persistência de `device_mid` nem a
  deduplicação de daily-active.
- `message_completion` / `agent_step` são eventos de alta frequência que crescem com mensagens e passos; é proibido adicionar log local de console ou em disco para cada envio.

## Dimensões públicas

| Canal                  | Dimensões carregadas automaticamente                                                                                                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ARMS main             | `platform` / `app_version` / `arms_env` / `device_mid` (+ dimensões exclusivas de cada group, ver abaixo)                                                                                                    |
| ARMS ui_perf          | as mesmas + `renderer_id` (preenchido pelo handler IPC do main)                                                                                                                                           |
| `/report` agent_trace | `model_name` / `model_provider` / `ask_mode` / `agent` / `talk_id` / `message_id` / `workspace_kind` / `remote_kind` (version é injetada pelo backend)            |
| ARMS CLI Agent        | `service.name=zcode-cli-agent` + `uid` (hash)/ `device_mid` / `session_id` / `turn_id` / `trace_id` / `rid` / `operation` / `provider` / `model`                 |

---

## 1. Estabilidade ARMS `group=stability`

Dimensões exclusivas: `scene_lifecycle` (cold_start / runtime / app_quit / update_install), `scene_window` (main / process_monitor / other).

| Evento                     | value             | Conteúdo reportado                                                                                                                                                                                           | Condição de disparo                                                                              |
| -------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `perf_app_start`           | —                 | contagem de cold start (denominador de Crash-Free, vinculada a `device_mid`)                                                                                                                                  | **3,2s** após o `did-finish-load` da janela principal (`PERF_APP_START_AFTER_VIEW_MS`)            |
| `perf_crash`               | `1`               | `crash_scope` / `crash_cause` / `crash_source=electron_callback` / `crash_id` / campo de compatibilidade `crash_kind`                                                                                       | `render-process-gone` / `child-process-gone` do ZCode Host; reportado uma vez por callback do Electron |
| `perf_agent_start`         | `1`               | `runtime_instance_id` / `runtime_generation` / `provider`                                                                                                                                                    | spawn de Node do subprocesso do Agent disparado com sucesso                                         |
| `perf_agent_ready`         | `1`               | `runtime_instance_id` / `runtime_generation` / `provider` / `startup_duration_ms`                                                                                                                            | runtime do Agent passa pela primeira vez pelo gate de provider/model                               |
| `perf_agent_crash`         | `1`               | `runtime_instance_id` / `error_name` / `error_code` / `error_message` / `error_stack` / `error_fingerprint` / `exit_code` / `signal` / `uptime_ms` / `crash_phase` / `termination_class` / `diagnostic_class` | exit de um Agent gerenciado pelo Host sem intenção de saída ativa e sem atingir as condições de exclusão de terminação controlada; reportado uma vez por runtime |
| `perf_agent_spawn_error`   | `1`               | `runtime_instance_id` / `error_name` / `error_code` / `error_message` / `error_stack` / `error_fingerprint` / `runtime_generation` / `diagnostic_class`                                      | falha de spawn do command/cwd do Agent                                                              |
| `perf_mcp_process_start`   | `1`               | `mcp_id` / `mcp_instance_id` / `mcp_source` / `mcp_isolation` / `runtime_surface`                                                                                                                            | MCP stdio oficial conclui conexão e `tools/list`; probes de detecção de versão não contam              |
| `perf_mcp_process_crash`   | `1`               | identificadores de start + `exit_code` / `signal` / `uptime_ms` / `affected_session_count`                                                                                                                   | MCP stdio que já reportou start sai de forma inesperada; reciclagem ativa não conta                    |
| `perf_mcp_session_startup` | `process_count`   | `session_id` / `configured_count` / `connected_count` / `process_count` / `failed_count`                                                                                                                       | primeiro snapshot de MCP startup de cada lease de session                                            |
| `perf_anr`                 | `duration_ms`     | duração sem resposta                                                                                                                                                                                        | `unresponsive` de `webContents` por ≥ **5s** (`STABILITY_ANR_THRESHOLD_MS`)                          |
| `perf_freeze`              | `duration_ms`     | duração do freeze (sem crash no período)                                                                                                                                                                   | `unresponsive` por ≥ **30s** (`STABILITY_FREEZE_THRESHOLD_MS`)                                       |
| `perf_app_exit`            | `exit_code` (=0)  | `exit_kind=normal`                                                                                                                                                                                           | `before-quit`                                                                                      |
| `perf_process_exit`        | `exit_code`       | `exit_reason` / `process_role`                                                                                                                                                                               | saída anormal de subprocesso / processo de renderização                                            |

Crashes nativos do SDK não passam por `sendCustom(group=stability)` e usam um contrato de evento separado:

| `event_type` | `type`  | `source`        | Conteúdo reportado                                                                                                                                                                             | Condição de                                                                                                                                       |
| ------------ | ------- | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `exception`  | `crash` | `crashReporter` | `crash_scope=app_native_process` (apenas `native_dump_process_role=main`) ou `native_dump_unattributed` / `crash_cause=native_crash` / `crash_source=crash_reporter_dump` / `crash_id` | o `binary_images` do dump corresponde ao nome do app de produto ou ao nome real do exe de runtime; quando apenas o binário do produto é confirmado sem marcador de papel do processo principal, mantém-se como `native_dump_unattributed` |

Implementação: `packages/desktop/src/main/desktopStabilityTelemetry.ts`,
`packages/desktop/src/main/appARMSBootstrap.ts`

---

## 2. Recursos ARMS `group=resource`

O encadeamento de recursos está implementado desde a v3.12.1; amostragem completa, agregação, semântica de falha e aceitação estão em
[Monitoramento de CPU / memória de todos os processos](./process-resource-telemetry.md). A janela de agregação em produção é de 5 minutos,
em dev build e E2E é de 1 minuto; eventos de conclusão de Bash são enviados imediatamente. Coleta em todos os dispositivos e todos os papéis.
Os três eventos compartilham os quatro atributos globais `platform`, `app_version`, `arms_env`, `device_mid`;
com os atributos abaixo resultam em no máximo 20 itens; undefined não é enviado. CPU é porcentagem normalizada da máquina inteira, memória em KB.
`platform` / `arch` / `logical_cpu_count` / `total_memory_gb` descrevem a máquina em que o processo realmente roda, e CLI / MCP remotos sobrescrevem os padrões do desktop; `app_version` é a versão do desktop responsável pelo envio.

Vocabulário de papéis: `main`, `renderer_main`, `renderer_guest`, `gpu`, `chromium_other`, `host`,
`scheduler`, `cli_chat`, `cli_aux`, `mcp`. `getAppMetrics()` do main fornece CPU / RSS do Chromium a cada 10 segundos,
o heap de Node e do renderer principal é autoamostrado a cada 60 segundos; o CLI é autoamostrado a cada 60 segundos e o MCP usa o probe de processo genérico a cada 5 minutos.
main não tem processo externo; número de threads, memória de GPU, IO de disco e amostragem de papéis em 10% foram removidos.
O log local `[memory]` continua reutilizando as leituras da telemetria, ver [log de diagnóstico local de memória de processo](./memory-diagnostics-log.md).

### `perf_process_window`

Um registro a cada 5 minutos por papel / runtime surface / máquina agrupados; MCP agrupa ainda por mcp_id.
`value=cpu_percent_mean`. Node e renderer_main têm no máximo 20 atributos (heap é omitido quando não há leitura),
mcp tem 19 atributos e outros papéis do Chromium têm 18; a união da whitelist de 21 itens não significa que um único envio tenha 21 itens.

| Categoria | Atributo                 | Descrição                                                                             |
| --------- | ------------------------ | ------------------------------------------------------------------------------------ |
| Dimensão  | `process_role`           | os 10 valores enumerados da tabela acima                                             |
| Dimensão  | `runtime_surface`        | `local` / `remote`                                                                    |
| Dimensão  | `arch`                   | arquitetura da máquina                                                                |
| Dimensão  | `logical_cpu_count`      | número de núcleos lógicos da máquina                                                  |
| Dimensão  | `total_memory_gb`        | memória física da máquina, em GB arredondados                                        |
| Dimensão  | `mcp_id`                 | apenas para o papel `mcp`                                                            |
| Estado    | `background_ratio`       | de 0 a 1, com duas casas decimais                                                     |
| Estado    | `uptime_minutes`         | minutos de execução do processo mais antigo dentro daquele papel                       |
| CPU       | `cpu_percent_p95`        | p95 da CPU total do papel na janela                                                   |
| CPU       | `cpu_percent_peak`       | máximo da CPU total do papel na janela                                                 |
| Memória   | `rss_kb_total_mean`      | média da soma do RSS de todos os processos do papel                                   |
| Memória   | `rss_kb_total_peak`      | máximo da soma do RSS de todos os processos do papel                                   |
| Memória   | `rss_kb_max_process_peak`| máximo do RSS de um único processo na janela                                           |
| Memória   | `heap_used_kb_mean`      | apenas Node e renderer_main; com vários processos, tira a média do maior processo único de cada leitura recebida |
| Memória   | `heap_used_kb_peak`      | o mesmo, tomando o máximo                                                             |
| Qualidade | `process_count_peak`     | maior número de processos vivos simultaneamente para o papel na janela                |
| Qualidade | `sample_count`           | número de amostras na janela; no main espera-se 30, em papéis CLI 5, em mcp 1          |

### `perf_system_window`

Um registro a cada 5 minutos por dispositivo desktop, `value=app_cpu_percent_mean`, com 17 atributos fixos.
O Chromium usa a soma exata do mesmo tick; CLI / MCP usam a amostra mais recente (expiração de 120 / 600 segundos); remoto não entra.

| Categoria | Atributo                                            | Descrição                                                                          |
| --------- | --------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Dimensão  | `arch`, `logical_cpu_count`, `total_memory_gb`     | máquina desktop                                                                    |
| Estado    | `background_ratio`, `app_uptime_minutes`           | `background_ratio` tem a mesma origem do evento de papel; uptime é a duração do processo main |
| Máquina   | `system_cpu_percent_p95`                            | diferença de `os.cpus()`                                                           |
| Máquina   | `system_free_memory_kb_min`                         | mínimo de `os.freemem()` na janela                                                 |
| App      | `app_cpu_percent_p95`                               | soma de todos os processos ZCode locais                                             |
| App      | `app_rss_kb_total_mean`, `app_rss_kb_total_peak`   | soma exata a cada 10 segundos do sistema Chromium, mais a última amostra conhecida de CLI e MCP |
| App      | `process_count_total_peak`                          | pico do número de processos ZCode locais                                            |
| Qualidade | `sample_count`                                      | o primeiro tick sem baseline de CPU não gera amostra; espera-se 29 em janela de 5 minutos |
| Qualidade | `telemetry_self_ms`                                 | milissegundos acumulados de parede do código de amostragem e agregação no lado main na janela, medidos com `performance.now()` |

### `perf_tool_exec_resource`

Cada Bash que roda por 15 segundos completos é reportado imediatamente na conclusão, com `value=duration_ms`.
Fora do Windows são 12 atributos; no Windows, sem os dois itens de tree, são 10 atributos e sample_count=0.

| Categoria | Atributo               | Descrição                                                      |
| --------- | ---------------------- | ---------------------------------------------------------------- |
| Dimensão  | `runtime_surface`      |                                                                 |
| Dimensão  | `tool_name`            | fixo em `bash` na primeira fase                                  |
| Dimensão  | `exit_kind`            | `completed` / `timeout` / `killed` / `error`                    |
| Comando   | `tree_rss_kb_peak`     | pico da soma do RSS da árvore de processos do comando            |
| Comando   | `tree_cpu_time_ms`     | tempo de CPU acumulado da árvore; dividido por `duration_ms` dá a razão busy/idle |
| Comando   | `sample_count`         | número de amostras coletadas                                     |
| Contexto  | `cli_rss_kb`           | RSS do próprio CLI no fim do comando                            |
| Contexto  | `system_free_memory_kb`| memória restante da máquina no fim do comando                    |

### Eventos de recurso desativados

| Evento                  | Versão de desativação e substituto                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------ |
| `perf_resource_window`  | **desativado desde a v3.12.1**; substituído pelo `perf_process_window` por papel e pelo `perf_system_window` por dispositivo |
| `perf_resource_agent`   | **desativado desde a v3.12.1**; substituído pelos papéis `cli_chat` / `cli_aux` do `perf_process_window` |
| `perf_mcp_memory`       | **desativado desde a v3.12.1**; substituído pelo papel `mcp` do `perf_process_window`                   |

### Eventos de recurso independentes

`perf_resource_zcode_data_size` mantém a métrica de bytes lógicos da raiz de dados local do ZCode, no máximo uma vez a cada 24 horas por dispositivo,
ver [Ocupação do diretório de dados do ZCode reportada ao ARMS](./zcode-data-size-arms-telemetry.md). `perf_resource_cpu` e eventos anteriores são usados apenas para consultas históricas. Os três eventos de ciclo de vida de estabilidade do MCP estão em [Observabilidade ARMS de processo MCP](./mcp-process-arms-telemetry.md).

---

## 3. Rede ARMS `group=network`

**Agregação de 5min** (1min em dev). Cada `{transport, interface}` envia apenas um
`perf_network_window`; após unir as properties globais, no máximo 20 atributos. No HTTP, o path mantém apenas os segmentos de rota estáticos explicitamente registrados e os demais são templatizados; qualquer caminho absoluto local é classificado como `local_file`; RPC=`channel.command`;
WS=`web_remote_control.relay`.

| Evento              | value            | Descrição                                                                      |
| ------------------- | ---------------- | ------------------------------------------------------------------------------ |
| `perf_network_window` | duration mean ms | counts + duration peak/p95; média por fase HTTP; principal tipo de erro e contagem |

Fontes de dados: HTTP analisando os eventos `api` do `beforeReport` do ARMS; RPC retornado pelo `NetworkTelemetryChannelServer` do Host; WS vindo do relay de controle remoto.
Implementação: `desktopNetworkTelemetry.ts`, `networkTelemetryAggregator.ts`, `packages/rpc/src/network-telemetry-middleware.ts`, `hostNetworkTelemetry.ts`

---

## 4. Performance de UI do lado do cliente ARMS `group=ui_perf`

Telemetria do lado do renderer, coleta total (100%).

### 4.1 Fases de inicialização (7 segmentos, uma vez cada por cold start, `session_id` associa a mesma inicialização)

| Evento                              | Segmento medido por value                                                       |
| ----------------------------------- | ------------------------------------------------------------------------------ |
| `perf_ui_launch_to_input`           | **total**: criação do processo (`getCreationTime`) → campo de entrada utilizável |
| `perf_ui_launch_electron_init_ms`   | criação do processo → main JS                                                   |
| `perf_ui_launch_app_ready_ms`       | main JS → `app.whenReady`                                                       |
| `perf_ui_launch_window_ms`          | `whenReady` → `loadURL`                                                         |
| `perf_ui_launch_renderer_load_ms`   | `loadURL` → execução do bundle                                                  |
| `perf_ui_launch_react_commit_ms`    | bundle → primeiro commit do React                                               |
| `perf_ui_launch_startup_gate_ms`    | commit do React → campo de entrada utilizável (autenticação / provider / workspace) |

### 4.2 Primeira abertura de Session (no máximo duas por abertura lógica)

| Evento                         | value      | properties-chave                                                                  |
| ------------------------------ | ---------- | ---------------------------------------------------------------------------------- |
| `perf_ui_session_open_start`   | `1`        | `session_open_id` / `session_id` / `open_kind` / `open_trigger` / `client_mode`  |
| `perf_ui_session_open_result`  | `total_ms` | `status` / `session_open_id` / `session_id` / campos de duração das fases Host/CLI/Renderer |

Sentinela: se qualquer segmento for negativo (desvio de relógio entre processos) ou a duração total for > **300000ms** (`LAUNCH_TO_INPUT_SANITY_MAX_MS`) → **o lote inteiro é descartado**. Sem login (WelcomeScreen) não há envio. O antigo `perf_ui_first_screen` foi descontinuado, com sua semântica incorporada a `perf_ui_launch_react_commit_ms`.

### 4.3 Encadeamento de mensagens (espelha o `message_completion` do `/report`, sem novos cronômetros)

| Evento                        | value                                                        | properties                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `perf_ui_first_token`         | latência até o primeiro token em ms                         | `model` / `talk_id` / `message_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `perf_ui_message_complete`    | latência ponta a ponta da mensagem em ms                     | `result` / `model` / `talk_id` / `message_id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `perf_ui_stream_stall`        | stall real em ms (intervalo entre chunks de corpo adjacentes do stream > **3000ms**) | `stall_ms` / `waiting_tool` / `model` / `talk_id` / `message_id` (o chunk que encerra o stall; fica vazio se não for obtível)                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `perf_ui_tool_call_detail`    | latência até o estado final da ferramenta em ms             | `tool_name` / `status` / `talk_id` / `message_id` / `tool_call_id` / `parent_tool_call_id` / `child_tool_call_id` / `child_session_id` / `agent_id` / `agent_type` / `total_ms` / `permission_wait_ms` / `command_run_ms` / `first_output_ms` / `no_output_ms` / `timed_out` / `command_name` / `command_category` / `command_count` / `command_status` / `fs_read_ms` / `fs_write_ms` / `patch_match_ms` / `file_count` / `total_bytes` / `max_file_bytes` / `hunk_count` / `match_attempts` / `workspace_kind` |

Limite de `perf_ui_stream_stall`: não conta durante chamadas de ferramenta (`clearStreamStallTracking` quando chegam `tool_call`/`tool_call_update`); o limiar `STREAM_STALL_REPORT_THRESHOLD_MS=3000` serve apenas como barreira de envio, e o value é o intervalo real. `model` vem do `model_name` do prompt ativo (`getActivePromptModelName`, o chunk em si não traz o modelo) e fica vazio quando não há prompt ativo. Stalls de renderização (longTask) são coletados automaticamente pelo ARMS Browser SDK e não são pontuados aqui manualmente.

O detalhe de `agent_step` é mantido apenas na cadeia `agent_trace` do `/report`; o ARMS RUM não envia mais em duplicidade a cada step,
evitando que uma longa mensagem amplifique a quantidade de IPC e de eventos customizados conforme o número de steps. No lado RUM, a atribuição de baixa frequência é feita por
`perf_ui_turn_breakdown.agent_step_cnt`, primeiro token, ponta a ponta, stall de stream e eventos de estado final de ferramenta.
O OTel Span `zcode.agent.step` reportado diretamente pelo CLI pertence ao
[Guia de Desenvolvimento do CLI Agent Telemetry](../trace/cli-agent-telemetry.md), não passa por esta cadeia IPC/RUM
e também não equivale a `/report agent_step`.
`perf_ui_tool_call_detail` espelha apenas estados finais de ferramenta com `raw.result.perf`. O espelho de subtools de subagent traz os campos de correlação pai-filho; com o `tool_call_id` do `Agent` pai em mãos, o warehouse pode descer até a subtool no ARMS por `parent_tool_call_id`; para ferramentas que não são de subagent, esses campos ficam vazios.

`command_name` só permite nomes de arquivo executáveis estáticos do Registry público de comandos ou os baldes fixos `empty` / `compound` /
`other`. `command_hash` não entra mais no RUM/ARMS desde 2026-07-27: mesmo truncado, ainda gera alta cardinalidade e pode ser revertido por dicionários comuns de comandos; esse campo é mantido apenas nos objetos de diagnóstico estruturado locais do CLI. O CLI OTel Agent Trace é a nova fonte primária de fatos sobre confiabilidade de ferramentas; os eventos RUM existentes rodam em paralelo por compatibilidade no curto prazo, e os campos/eventos duplicados serão desativados após a migração completa dos dashboards.

`model` e `chat_error_banner.model_id` compartilham a mesma whitelist: só são permitidos IDs de modelos embutidos estáveis explicitamente listados no telemetry de whitelist;
modelos de provider customizado (valor codificado `custom:<providerId>:<modelName>`), a parte não embutida de valores compostos `<providerId>/<modelId>` e
modelos sob provider embutido que não constam na whitelist são gravados uniformemente como `custom`; quando ausente, fica vazio. A implementação é centralizada em `sanitizeTelemetryModelValue` de `@zcode/shared`, e `uiPerfArmsTelemetry.emit` reescreve uniformemente a propriedade `model` antes do envio, de modo que os chamadores não precisam tratar disso individualmente. A origem da whitelist e as regras de julgamento do duplo namespace de providers embutidos (runtime `account:*` e identidade antiga de relatórios `builtin:*`) estão em [plan-usage-arms-telemetry](./plan-usage-arms-telemetry.md).
Implementação: `packages/ui/src/lib/uiPerfArmsTelemetry.ts`; a entrada V4 é conduzida pelo workspace telemetry supervisor.

### 4.4 Eventos automáticos de longTask do SDK ARMS

| Campo                                | Definição                                                                                            |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `event_type=longTask`                | evento de stall da main thread de renderização coletado automaticamente pelo Browser SDK.              |
| `duration` / `fps` / `source`        | campos originais do SDK; `source` é `LoAF` ou `rAF`.                                                 |
| `properties.loaf_script_count`       | número de entradas de attribution dentro de `snapshots` do SDK, no máximo 5.                         |
| `properties.loaf_top_duration_ms`    | duração do attribution principal em ms, arredondada e com piso em zero.                               |
| `properties.loaf_top_invoker_type`   | `user-callback` / `event-listener` / `script` / `unknown`; rAF sem `invokerType` é classificado como `script`. |
| `properties.loaf_top_share_pct`      | percentual inteiro do attribution principal sobre o `duration` total do longTask; 0 quando a duração total é inválida. |

Limite de privacidade: não gravar em `properties` nomes de script brutos, URLs de script, caminhos de arquivo, selectors, stack ou trechos de código-fonte; quando `snapshots` estiver ausente ou o parsing falhar, nenhum campo é preenchido.

---

## 5. Erros de UI visíveis ARMS `group=ui_error`

| Evento              | `surface`                     | Critério de disparo                                     | Critério de deduplicação                                        |
| ------------------- | ----------------------------- | -------------------------------------------------------- | --------------------------------------------------------------- |
| `chat_error_banner` | `chat_input_error_banner`     | banner de erro acima do campo de entrada realmente visível após suppression | impressão task/code/trace/message do mesmo mount do Composer, uma vez |
| `chat_error_banner` | `session_subscription_error`  | página de falha de assinatura de conversation de uma Session oficial realmente visível em primeiro plano | impressão session/code/message do mesmo mount do SessionPane, uma vez |

Falha de assinatura continua reutilizando `chat_error_banner`, evitando que o dashboard tenha uma segunda métrica de "erro de chat visível ao usuário";
`surface` distingue o erro do campo de entrada do erro de assinatura de página inteira. O evento precisa manter um `error_code` estruturado;
reasonCode como `fault.subscribe.sessionNotFound` não pode ficar apenas dentro da message. Panes em segundo plano,
o fallback silencioso de draft pré-aquecido e erros suprimidos pela lógica de produto não são expostos.

Os campos de atribuição de erro são campos incrementais opcionais: `error_source` / `failure_reason` / `provider_scope` /
`provider_id` / `model_id` / `provider_kind` / `transport` / `status_code` /
`provider_error_code` / `failure_retryable` / `failure_phase` / `failure_exception_kind`. Onde
`provider_scope` é apenas
`builtin | custom | unknown`; o `provider_id` de provider customizado é sempre gravado como `custom`. `model_id` só permite
IDs de modelos embutidos estáveis dentro da whitelist de telemetry; modelos customizados ou fora da whitelist são sempre gravados como `custom`, e provider/model
ausentes são gravados como string vazia. É proibido gravar nomes de provider/model customizados, base URL/URL completa, header/token, corpo da requisição ou
resposta, conteúdo de prompt/tool, stack, detail completo ou requestId. A ausência de campos não afeta o envio do evento nem muda o
comportamento de exibição e recuperação do erro.

`failure_phase` é uma enumeração fixa das fases da Model API, e `failure_exception_kind` é a família de exceção de baixa cardinalidade após a allowlist do adapter;
não é permitido enviar o nome bruto da exceção. O Dashboard deve separar a cobertura de reason da cobertura de diagnóstico.

Implementação: `packages/ui/src/lib/chatErrorBannerTelemetry.ts`, `packages/ui/src/v4/ConversationComposer.tsx`,
`packages/ui/src/v4/SessionPane.tsx`.

### 5.1 Error boundary do React `group=react_error`

| Evento             | value | properties                                                                           |
| ------------------ | ----- | ------------------------------------------------------------------------------------- |
| `perf_react_error` | `1`   | `error_name` / `error_message` / `error_stack` / `component_stack` / `boundary_scope` |

Os error boundaries do React interceptam exceções de renderização da subárvore e impedem que elas borbulhem para `window.onerror`, e a coleta automática do
Browser RUM SDK não enxerga essa classe de erro, por isso é adicionado um evento customizado separado. `boundary_scope` é o `app` de nível raiz ou o nome de cada boundary com escopo.

Limite de privacidade: `error_message`, `error_stack`, `component_stack` precisam passar por `redactTelemetryText` de `@zcode/shared` antes do envio, seguindo o mesmo conjunto de regras da coleta automática de eventos de exceção do ARMS
([limite de redação](./arms-browser-monitoring.md#自动采集事件的脱敏边界)): caminhos absolutos são normalizados para
`{path}`, e-mails para `{email}`, URLs mantêm apenas `protocol//host` e rota normalizada, e credenciais são normalizadas para
`{redacted}` / `{secret}`. `error_stack` e `component_stack` têm ainda um limite de 4000 caracteres, garantindo que o componente que lançou o erro mais recentemente sempre suba. A redaction afeta apenas a cópia enviada; logs locais e a recuperação por fallback continuam usando os valores originais.

Implementação: `packages/ui/src/lib/reactErrorArmsTelemetry.ts`, `packages/ui/src/ErrorBoundary.tsx`.

---

## 6. Encadeamento de mensagens (`/report` agent_trace, não ARMS)

`messageTelemetry.ts` continua fornecendo o builder do formato antigo; o workspace telemetry supervisor do V4 consome apenas fatos vivos e
então chama `reportAppTelemetryEvent(eventType="agent_trace")`.

| elementName          | Natureza do value | Campos-chave reportados                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `message_completion` | ponta a ponta     | `duration_ms` (tempo de parede visível ao usuário, de sendTime até o terminal do turn, incluindo Subagent em primeiro plano e esperas) / `time_to_first_token` (-1 se o primeiro token não chegou) / `waiting_ms` (soma de todas as esperas de permissão de tool) / `input_tokens`·`output_tokens`·`reasoning_tokens`·`cached_input_tokens`·`cache_write_input_tokens`·`total_tokens` / `agent_step_cnt` (quantos steps realmente foram fechados nesta message) / `tool_call_total`·`tool_call_failed` (steps de ferramenta realmente fechados nesta message) / `generated_code_lines` / `file_change_cnt` / `status` / `error_type` (atribuição de falha)·`error_msg` (se o texto original não for vazio, `[redacted]`, senão string vazia) / `request_time`                                                                                                                                                                                                                          |
| `agent_step`         | por step          | `step_type` (reasoning / tool_call / generation) / `loop_index` / `duration_ms` (tempo de parede do step, incluindo esperas) / `waiting_ms` (soma das esperas de permissão de tool; 0 para não-tool) / `generation_tail_finalize_ms` (apenas no `desktop-continuous` do desktop, quando a generation do agente principal é fechada por `task_complete` / `task_error`; representa a latência de cauda do último chunk de corpo comum sem `parentToolUseId` até o evento terminal; fica como string vazia no replay recuperável do mobile e em cenários não aplicáveis) / `status` (success / fail / timeout) / `tool_name` / `tool_call_id` (apenas steps de ferramenta) / `agent_id` (id de correlação por igualdade entre o `Agent` pai e as child tools espelhadas) / `is_tool_call` / `model_name`·`model_provider`·`provider_name` (dimensões reais do modelo de requisição associado ao step) / `model_request_id`·`model_request_count`·`token_usage_scope` (a requisição principal é `model_request`, a agregação de child em primeiro plano é `subagent_requests`) / `input_tokens`·`output_tokens`·`reasoning_tokens`·`cached_tokens`·`cache_write_input_tokens`·`total_tokens` (o usage completo da requisição pertence a apenas um step). Vai apenas pelo `/report`, sem espelhar item a item no ARMS RUM; o Step Span do CLI OTel está em outra especificação, Agent Turn Trace |
| `context_compaction` | resultado da compactação | `status` (completed / failed / interrupted) / `trigger` / `reason` / `attempt` / `duration_ms` / `pre_compact_tokens`·`post_compact_tokens`·`true_post_compact_tokens` / `compact_ratio` (post/pre). A taxa de sucesso é agregada pelo warehouse a partir do status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

`message_completion` e `agent_step` também precisam carregar o mesmo conjunto de dimensões de cenário: `workspace_kind` (`local` /
`remote`) e `remote_kind` (`ssh` / `wsl` / `docker` / `server`; string vazia quando local ou não resolvível).
Ambos são congelados pelo workspace attachment; não é permitido enviar `remoteSessionId`, caminho do workspace, endereço do host ou outras identidades de alta cardinalidade.

Campos da fase de entrada (`queuePromptTelemetry` injeta em `message_completion`): `input_start_time` / `input_first_char_time` / `input_send_time`.
`agent_step_cnt`, `tool_call_total`, `tool_call_failed` e cada `agent_step` individual usam o mesmo
ciclo de vida do prompt ativo; mensagens de assistant antigas da mesma session não participam da contagem de completion deste turno.
Steps de ferramenta Skill sempre carregam `skill_name` (apenas o nome já resolvido que passa pela validação de telemetria, senão `unknown`, sem ler os parâmetros da requisição), e podem ainda carregar `skill_qualified_name`, `skill_plugin_id`, `skill_source`; são escritos apenas quando
`tool_name=Skill` e o runtime resolve os metadados com sucesso, e não incluem o corpo nem a description do Skill.
Tanto o handler de primeiro plano quanto o runtime monitor de background precisam primeiro alimentar os eventos de step/terminal recebidos nesse ciclo de vida
e só então reportar `message_completion`; trocar de task não pode zerar nem fazer perder a contagem de background da mesma volta nem os `agent_step` individuais.
Todo step stream event que carrega `inputId` precisa ser consistente com o `activeInputId` atual do runtime; eventos de reasoning / generation / tool / terminal atrasados do input antigo não podem fechar nem poluir o estado e as contagens de steps do novo prompt. Quando o protocolo antigo não carrega `inputId`, um caminho de compatibilidade é mantido; mesmo ao reassociar o inputId real no envio de um prompt enfileirado, o `activeInputId` do runtime é a fonte de fato de ownership, e não se pode rejeitar indevidamente o evento atual usando o pending inputId da etapa de enfileiramento.
Implementação do formato: `packages/ui/src/lib/messageTelemetry.ts`; o ciclo de vida e os limites multiplataforma estão em
[conversation-telemetry-v4.md](./conversation-telemetry-v4.md).

---

## 6. Model API do CLI Agent via ARMS (OTLP Trace)

`service.name=zcode-cli-agent`, não passa pelo Electron RUM `/rum/web/v2` e não cria novas tabelas de banco no cliente.

| span.name             | Granularidade                                | Campos-chave                                                                                                                                       |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `zcode.model.call`    | um Logical Call de `generateText/streamText` | `operation` / `actor` / `provider_id/kind/origin/route` / `model` / requested/effective thinking / status / duration / TTFT / token/cache / retry recovery / error / `uid/rid/sid` |
| `zcode.model.attempt` | uma requisição HTTP/SSE real ao Provider    | as dimensões públicas acima + attempt/max / transport / previous request / retry delay / provider request ID                                            |

Uma chamada bem-sucedida normal gera 1 Call + 1 Attempt; Adapter Retry apenas aumenta Attempt, e o fallback Compaction SSE → HTTP gera dois Calls correlacionados por `previous_logical_call_id`. Todos os eventos são Terminal Spans e não reportam Prompt, Header, Provider Options, conteúdo de ferramentas ou cada chunk SSE.

Padrão: batch gzip protobuf de 5 segundos / 100 itens, com limite de fila de 2.000 itens ou 4MiB; No-op quando o OTLP não está configurado. App RUM, SQLite Usage e `/report` continuam em dual write por enquanto, aguardando a reconciliação em gradual release para decidir o escopo de substituição de longo prazo.

Implementação: `apps/zcode-cli/packages/telemetry`, `apps/zcode-cli/packages/adapters/src/model/runner-status.ts`.

## Cobertura e lacunas conhecidas

- ✅ **Estabilidade / recursos / rede**: completas em nível de processo (CPU / memória / GPU / crash / ANR / freeze / exit code / latência de rede por camada).
- ✅ **Cadeia de inicialização**: da criação do processo até "pode digitar", em 7 segmentos, permitindo percentis.
- ✅ **Encadeamento de mensagens**: entrada → primeiro token → `/report` por step → stall → ponta a ponta → compactação de contexto;
  o ARMS RUM mantém eventos de baixa frequência por volta e por estado final de ferramenta, e o CLI OTel Agent Turn Trace evolui de forma independente.
- ✅ **Model API do CLI**: chamadas de modelo do Agente principal/Subagent/Workflow, Compaction, Sidecar e dentro de ferramentas formam todos Call/Attempt; tráfego, taxa de sucesso, latência, Token/Cache, Retry/Fallback e erros redigidos podem ser agregados no ARMS.
- ⚠️ **Dashboard de modelos do CLI aguardando deploy**: o código já suporta injeção OTLP padrão, mas o repositório não embute credenciais OTLP do ARMS; dashboards de Workspace, alarmes e reconciliação RUM/SQLite ainda dependem do gradual release do lado de deploy.
- ⚠️ **Renderização do último frame não coberta**: o fim de `message_completion.duration_ms` / `time_to_first_token` é o momento em que `task_complete` chega ao handler, **sem incluir** o trecho de re-render do React → paint na tela do navegador; a latência de "renderização concluída" na perspectiva do usuário continua sendo uma zona cega.
- ⚠️ **Recursos não atribuídos a mensagens**: a amostragem de recursos é agregada a cada 5 min e não responde "qual foi o pico de CPU/memória ao enviar determinada mensagem".