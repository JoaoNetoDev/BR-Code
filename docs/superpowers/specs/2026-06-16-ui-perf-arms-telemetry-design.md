# Design de telemetria de performance de UI do lado do cliente via ARMS

> Status (2026-07-15): implementado; este documento é mantido como registro histórico de design. O catálogo atual de eventos e a semântica de campos têm como referência
> `docs/monitoring/performance-telemetry-catalog.md`; os pontos de integração antigos de stream hook abaixo não representam mais o caminho principal do V4.

> Data: 2026-06-16　Responsável: responsável de dados e observabilidade
> Escopo: adicionar quatro pontos de instrumentação de performance no lado do renderer (UI) do Electron, reportados via ARMS `sendCustom`.

## Contexto

O sistema existente de reporte de performance do ARMS (ver `docs/monitoring/performance-monitoring.md`) já cobre três grandes categorias de métricas de sistema, todas coletadas no **processo main**:

- `group=stability`: inicialização, crash, ANR, freeze, código de saída (`desktopStabilityTelemetry.ts`)
- `group=resource`: CPU, memória, GPU, disco, handles, threads (`desktopResourceTelemetry.ts`)
- `group=network`: qualidade de HTTP/RPC/WebSocket (`desktopNetworkTelemetry.ts`)

**Lacuna**: performance de UI em nível de negócio no lado do renderer. Hoje o renderer só tem a coleta automática de webvitals/longTask do ARMS Browser SDK e um helper de instrumentação de negócio existente em nível de módulo. Não há reporte dedicado para a performance de UI perceptível pelo usuário (primeira tela, primeiro token, duração da mensagem, pausas de streaming).

Este design preenche essa lacuna; tudo entra em `group=ui_perf` do ARMS, com prefixo de nome de evento `perf_ui_`.

## Objetivos e não objetivos

**Objetivos**

- Adicionar quatro eventos de performance de UI, reutilizando a cadeia existente `reportArmsCustomEvent` → IPC → `armsRum.sendCustom`.
- Primeiro token / duração da mensagem reutilizam os valores já calculados em `messageTelemetry.ts`, com envio espelhado para o ARMS, sem mexer na cadeia `/report` existente.
- Coleta total (100%), sem switch de amostragem.

**Não objetivos**

- Não alterar o reporte existente de `message_completion` (`/report`), nem afetar os dashboards atuais.
- Não instrumentar manualmente travamentos de renderização (longTask da thread principal é coletado automaticamente pelo ARMS Browser SDK, com `browserCollectors.longTask` já habilitado em `appARMSBootstrap.ts`).
- Não tocar em main / preload / definições de canal IPC — a cadeia `PlatformChannels.ReportArmsCustomEvent` existente já atende à necessidade.

## Cadeia de reporte (já existente, reutilizada)

```
UI chama reportXxx(...)
  → reporter singleton uiPerfArmsTelemetry.reportArmsCustomEvent({name, group, value, properties})
  → window.zcode.reportArmsCustomEvent (packages/desktop/src/renderer/src/main.tsx:147)
  → IPC PlatformChannels.ReportArmsCustomEvent
  → packages/desktop/src/main/desktopMainIpcRemote.ts:119 handler
     preenche automaticamente as dimensões comuns: event_name / app_version / arms_env / device_mid / platform / renderer_id / metric_value
  → armsRum.sendCustom({ name, type: "custom", group, value, properties })
```

As dimensões comuns são preenchidas uniformemente pelo handler do main; o lado da UI não as duplica.

## Arquitetura: encapsulamento em um único ponto + chamadas em vários pontos

Criar `packages/ui/src/lib/uiPerfArmsTelemetry.ts`, imitando totalmente o padrão do helper de instrumentação de negócio existente:

- **Reporter singleton**: `let armsReporter: ArmsReporter | null` em nível de módulo, com `ArmsReporter = Pick<IPlatformService, "reportArmsCustomEvent">`.
- `setUiPerfArmsReporter(reporter | null)`: injeção/limpeza em `Root.tsx` (ao lado da injeção de reporter existente).
- `clearUiPerfArmsReporterForTest()`: para testes.
- Para cada evento, exportar uma função `reportXxx(...)`, com `buildPayload` + `reportArmsCustomEvent` internamente.
- **try/catch engolindo erros em todo o caminho**: falha de instrumentação apenas gera `logger.warn`, nunca bloqueando o fluxo principal (o helper existente já segue essa convenção).
- Constantes centralizadas: `UI_PERF_ARMS_GROUP = "ui_perf"`, constantes de nome de evento, `STREAM_STALL_REPORT_THRESHOLD_MS = 3000`.

**Por que usar um singleton de módulo em vez do hook `usePlatform`**: a maioria dos pontos de disparo dos quatro eventos não está no contexto de um componente React — a primeira tela está no nível de módulo de `main.tsx`, o primeiro token/duração no nível de módulo de `messageTelemetry.ts`, e a pausa no nível do handler de stream. `usePlatform()` só pode ser chamado dentro de componentes/hooks e não consegue cobrir tudo de forma unificada. Um singleton de módulo (o reporter é injetado uma vez no Root, e cada lugar importa e chama diretamente) é a única forma consistente e viável, além de ser totalmente isomórfico ao helper de instrumentação de negócio existente.

## Os quatro eventos

Todos os eventos usam `group = "ui_perf"`; `value` é a métrica principal (duração em ms), com os detalhes em `properties`.

| name                       | value                    | Gatilho / fonte de dados                                                                                             | properties                                                     |
| -------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `perf_ui_first_screen`     | duração da primeira tela em ms | início registrado no carregamento do módulo `main.tsx` → evento existente `"zcode-react-startup-ready"` como fim  | `phase` (opcional)                                              |
| `perf_ui_first_token`      | `time_to_first_token` ms | reutiliza o valor já calculado por `finalizePromptTelemetry()`, envio espelhado                             | `model`, `talk_id`, `message_id`                               |
| `perf_ui_message_complete` | `duration_ms` ms         | reutiliza o resultado do cálculo existente de `message_completion`, envio espelhado                              | `result`(success/fail/user_interrupt), `talk_id`, `message_id` |
| `perf_ui_stream_stall`     | duração real da pausa em ms | intervalo entre chunks adjacentes > `STREAM_STALL_REPORT_THRESHOLD_MS`(3000) durante o streaming              | `stall_ms`, `waiting_tool`, `talk_id`                          |

### 1. perf_ui_first_screen (tempo até a primeira tela interativa)

- **Início**: registro de timestamp no início do carregamento do módulo `packages/desktop/src/renderer/src/main.tsx` (`performance.now()`, variável de módulo).
- **Fim**: o evento de `window` `"zcode-react-startup-ready"` disparado pelo `StartupReadyNotifier` existente após o commit do React (main.tsx:217-224). Dentro de `main.tsx`, escuta-se esse evento, calcula-se `endNow - startNow` e chama-se `reportUiFirstScreen(elapsedMs)`.
- **Atenção (causa raiz já corrigida)**: o effect de `StartupReadyNotifier` executa **antes** do effect de `RootInner` que injeta o reporter (subárvores irmãs anteriores executam seus effects primeiro), de modo que, no momento do disparo, o reporter ainda é null — se descartado silenciosamente, `perf_ui_first_screen` **não seria reportado em 100% dos casos**. Como a primeira tela ocorre apenas uma vez por processo e a perda é irrecuperável, `reportUiFirstScreen` **armazena temporariamente o payload** quando o reporter ainda não foi injetado e o **reenvia uma vez** após a injeção em `setUiPerfArmsReporter` (ver `pendingFirstScreenPayload` em `uiPerfArmsTelemetry.ts`).
- `value` = duração da primeira tela em ms.

### 2. perf_ui_first_token (latência do primeiro token, envio espelhado)

- **Sem nova temporização**. `finalizePromptTelemetry()` em `messageTelemetry.ts` já calcula `time_to_first_token` (`firstTokenAt - sendTime`).
- No ponto do fluxo de finalize que produz esse valor, chamar adicionalmente `reportUiFirstToken({ ttftMs, model, talkId, messageId })`.
- O `message_completion` de `/report` não é alterado.

### 3. perf_ui_message_complete (duração ponta a ponta da mensagem, envio espelhado)

- Do mesmo modo, reutiliza o `duration_ms` de `finalizePromptTelemetry()` (`finishedAt - sendTime`).
- No ponto de finalize, chamar adicionalmente `reportUiMessageComplete({ durationMs, result, talkId, messageId })`.
- `result` assume o estado de conclusão existente: success / fail / user_interrupt (do parâmetro de status de `reportPromptCompletionTelemetry`).

### 4. perf_ui_stream_stall (pausa de streaming)

- **Detecção**: durante o recebimento de chunks de conteúdo em streaming, registra-se `lastChunkAt`. Quando o próximo chunk chega, se `now - lastChunkAt > STREAM_STALL_REPORT_THRESHOLD_MS`(3000), reporta-se uma vez.
- **value = duração real da pausa em ms** (`now - lastChunkAt`), não o limiar. O limiar serve apenas como portão de reporte, bloqueando a variação normal.
- **Local do estado**: manter `lastChunkAt` por task na lógica de recebimento de chunks de `taskStreamEventHandlers.ts`; o estado é limpo ao final da mensagem (handler terminal).
- **Não conta durante chamadas de ferramenta**: ao chegar `tool_call` / `tool_call_update`, chamar `clearStreamStallTracking(taskId)`; o primeiro chunk de conteúdo após a execução da ferramenta é considerado o primeiro e não é comparado com os chunks anteriores à ferramenta — evitando classificar erroneamente o tempo normal de execução da ferramenta como pausa.
- `properties.waiting_tool`: nesta rodada fixado em `false` (apenas intervalo entre chunks). A atribuição com consciência de ferramenta fica para depois.
- **Limite semântico** (registrado na documentação de monitoramento): a causa raiz de um intervalo entre chunks >3s geralmente está a montante (raciocínio do modelo / rede), e nem sempre é um travamento de renderização do cliente; mas do ponto de vista do usuário, “a interface fica parada por muito tempo” é uma pausa perceptível, então o reporte tem valor. `waiting_tool` ajuda a distinguir.

## Lista de arquivos alterados

| Arquivo                                                       | Alteração                                                                                                                       |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `packages/ui/src/lib/uiPerfArmsTelemetry.ts`                   | **Novo**: reporter singleton + `setUiPerfArmsReporter` + 4 funções de reporte + constantes                                       |
| `packages/ui/src/Root.tsx`                                     | injeção/limpeza do reporter (ao lado da injeção existente perto da L150)                                                        |
| `packages/desktop/src/renderer/src/main.tsx`                   | registra o início da primeira tela no nível de módulo; escuta `zcode-react-startup-ready` para calcular e reportar                    |
| `packages/ui/src/hooks/useZCodeChat.ts`                        | espelha primeiro token/conclusão para o ARMS dentro de `reportPromptCompletionTelemetry` (reutilizando `completionTelemetry.eventExtraDetail`, mantendo messageTelemetry como puro calculador) |
| `packages/ui/src/hooks/taskStreamEventHandlers.ts`             | mantém `lastChunkAt`, reporta pausa acima do limiar                                                                           |
| `packages/ui/src/hooks/taskStreamEventTerminalHandlers.ts`     | limpa o estado `lastChunkAt` ao final da mensagem                                                                             |
| `docs/monitoring/performance-monitoring.md`                    | nova seção “P0 端侧 UI 性能 / group=ui_perf”                                                                                    |
| `packages/ui/src/lib/uiPerfArmsTelemetry.test.ts`              | **Novo**: testes unitários (imitando os testes do helper existente), cobrindo injeção do reporter, engolimento de erros e construção do payload |

## Tratamento de erros

- Todos os `reportXxx` fazem try/catch internamente; em caso de falha apenas `logger.warn`, sem lançar e sem bloquear o fluxo principal.
- Quando o reporter não foi injetado (null), retorna silenciosamente.
- Consistente com a instrumentação de negócio existente: o ARMS pertence à cadeia de observabilidade; o fluxo principal (envio, renderização, inicialização) não pode ser interrompido por falha de instrumentação.

## Testes

- **Testes unitários** (`uiPerfArmsTelemetry.test.ts`):
  - Chamar reportXxx com o reporter não injetado não lança erro nem chama nada.
  - Após a injeção, os campos do payload estão corretos (name / group / value / properties).
  - Quando o reporter lança, o erro é engolido e não se propaga.
- **Verificação local** (build de desenvolvimento `arms_env=local`):
  - Iniciar → o log main `beforeReport` mostra `custom:perf_ui_first_screen`.
  - Enviar uma mensagem → aparecem `custom:perf_ui_first_token`, `custom:perf_ui_message_complete`.
  - Construir um intervalo entre chunks >3s (modelo lento ou breakpoint) → aparece `custom:perf_ui_stream_stall`, com value igual ao intervalo real.
  - Regressão: o `message_completion` de `/report` continua sendo reportado de forma independente, sem alteração na contagem.

## Constantes

| Constante                            | Valor         | Posição                           |
| ------------------------------------ | ------------- | ---------------------------------- |
| `UI_PERF_ARMS_GROUP`                 | `"ui_perf"`   | uiPerfArmsTelemetry.ts            |
| `STREAM_STALL_REPORT_THRESHOLD_MS`   | `3000`        | uiPerfArmsTelemetry.ts (ajustável) |

## Design complementar de atribuição de 2026-06-25

### Contexto

O RUM completo da 3.1.5 mostra que os pontos mais lentos do caminho Agent/UI se concentram em Bash, reasoning, generation, Write e Edit. Os `perf_ui_first_token`, `perf_ui_message_complete` e `perf_ui_stream_stall` atuais conseguem localizar o primeiro token, o ponta a ponta e as pausas, mas ainda não respondem de forma estável “onde está o atraso: na fila, na requisição ao modelo, no retry, na espera de permissão de ferramenta, na execução da ferramenta, na pausa de streaming ou na conclusão ponta a ponta”. O detalhe por step permanece na cadeia `agent_step` de `/report` e não é espelhado item a item no ARMS, para evitar que mensagens longas ampliem o volume de eventos.

### Restrições de performance

Este reforço deve respeitar as seguintes restrições, para que a cadeia de observabilidade não atrapalhe o app:

- Não reportar por token e não gerar evento para cada chunk comum; `perf_ui_stream_stall` continua reportando apenas quando o gap ultrapassa o limiar.
- O breakdown ponta a ponta é reportado uma vez por turno, reutilizando os campos já calculados por `finalizePromptTelemetry()`.
- Não espelhar `agent_step` item a item no ARMS; `/report` mantém o detalhe por etapa, e o ARMS mantém apenas o breakdown por turno, o estado final das ferramentas e os eventos de pausa.
- O status de rede do modelo espelha apenas os eventos de estado de baixa frequência já produzidos pelo runtime: started / completed / failed / retry_scheduled / stream_stalled.
- Campos de alta cardinalidade reportam apenas chaves de correlação estáveis ou valores anonimizados/normalizados; não reportar comandos brutos, caminhos de arquivo, headers de requisição nem body de resposta.
- Todos os reportes continuam assíncronos, fire-and-forget; falhas geram apenas warn e não bloqueiam envio, renderização ou processamento de stream.

### Eventos novos/reforçados nesta rodada

| name                     | value                | Gatilho                                           | properties principais                                                                                                                                                                                                                   |
| ------------------------ | -------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `perf_ui_turn_breakdown` | `duration_ms`        | uma vez ao final de cada prompt completion       | `talk_id`, `message_id`, `model`, `result`, `ttft_ms`, `waiting_ms`, `tool_call_total`, `tool_call_failed`, `agent_step_cnt`, `retry_cnt`, `file_change_cnt`, `generated_code_lines`                                              |
| `plan_request`           | `1` ou `duration_ms` | todos os status de rede de `task_network_debug_status` | `request_status`, `request_id`, `task_id`, `input_id`, `query_id`, `event_key`, `attempt`, `max_attempts`, `status_code`, `duration_ms`, `delay_ms`, `idle_ms`, `timeout_ms`, `retryable`, `reason`, `transport`, `provider_kind` |
| `perf_ui_stream_stall`   | gap ms               | gap entre chunks adjacentes de conteúdo/pensamento acima do limiar | adiciona `chunk_type`, distinguindo `message` / `thought`; ainda não registra chunks comuns                                                                                                                                                                 |

### Campos fora desta rodada, mas que precisam de suporte do runtime

Os campos a seguir são chave para localizar com mais precisão Bash / Write / Edit e devem ser produzidos pelo runtime de agente/ferramenta; a UI apenas os repassa/espelha, evitando confundir o tempo total observado pela UI com o tempo interno da ferramenta.

- Bash: `permission_wait_ms`, `command_run_ms`, `first_output_ms`, `no_output_ms`, `exit_code`, `timeout`, `output_bytes`, `command_category`, `command_name`, `command_count`, `command_status`.
- Write/Edit: `permission_wait_ms`, `fs_read_ms`, `fs_write_ms`, `patch_match_ms`, `file_count`, `total_bytes`, `max_file_bytes`, `hunk_count`, `match_attempts`, `workspace_kind`.

### Complemento de fases de ferramenta no runtime em 2026-06-25

A segunda fase converge esses campos para o campo estruturado `perf` do resultado da ferramenta e os entrega à UI pela cadeia existente `tool_call_result` / `tool_call_update.raw.result.perf`. O texto visível ao modelo não contém esses campos; eles servem apenas para UI, debug, RUM e projeções estruturadas de sessão.

Eventos novos no ARMS:

| name                       | value                                      | Gatilho                                                            | properties principais                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------------------- | ------------------------------------------ | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `perf_ui_tool_call_detail` | `total_ms` ou `command_run_ms/fs_write_ms` | estado final da chamada de ferramenta `completed/failed/denied` e existência de `raw.result.perf` | `tool_name`, `status`, `talk_id`, `message_id`, `tool_call_id`, `permission_wait_ms`, `command_run_ms`, `first_output_ms`, `no_output_ms`, `exit_code`, `timeout`, `output_bytes`, `command_name`, `command_category`, `command_count`, `command_status`, `fs_read_ms`, `fs_write_ms`, `patch_match_ms`, `file_count`, `total_bytes`, `max_file_bytes`, `hunk_count`, `match_attempts`, `workspace_kind` |

Restrições de volume de eventos:

- Cada chamada de ferramenta é reportada no máximo uma vez, no estado final.
- Não reportar comandos brutos, caminhos brutos, conteúdo de arquivo, conteúdo de diff nem headers.
- Após a revisão de privacidade de 2026-07-27, deixou-se de reportar `command_hash` para RUM/ARMS. Comandos comuns podem ser revertidos por busca em dicionário e o campo geraria alta cardinalidade; no lado remoto ficam apenas o `command_name` normalizado pelo Registry público, o `command_category` de baixa cardinalidade, `command_count` e `command_status`.
- `workspace_kind` usa apenas os valores de baixa cardinalidade `local` / `remote` / `unknown`.

### Semântica de atribuição

- `perf_ui_message_complete` permanece como métrica total de experiência.
- `perf_ui_turn_breakdown` nivela no ARMS os campos já existentes de um mesmo turno — TTFT, espera por permissão, total de ferramentas, ferramentas com falha, retry etc. — ajudando a atribuir além do tempo total.
- `plan_request` passa de apenas started para um espelho completo de status de rede de baixa frequência, para responder “a lentidão vem de retry, falha, latência de cauda do provider ou stream stall?”.
- `perf_ui_stream_stall` continua representando os intervalos de streaming a montante observados pela UI, e não travamentos de renderização do React; React/longTask ainda depende das métricas automáticas do ARMS Browser SDK.

## Resumo de atribuição de longTask de baixa cardinalidade em 2026-07-01

### Contexto

O evento `longTask` do ARMS Browser SDK grava a atribuição LoAF / rAF em `snapshots`, e a origem LoAF inclui o `duration` do trecho de script principal e o `invokerType`. `snapshots` é um campo de metadados do SDK que, por padrão, cai de forma instável nas dimensões consultáveis do SLS; reportar diretamente nome de script, URL ou caminho traz alta cardinalidade e risco de vazamento de caminhos. Por isso o `beforeReport` do processo main, sem criar eventos novos, extrai a atribuição top-5 já coletada em campos de baixa cardinalidade e a mescla nas `properties` do mesmo `longTask`.

### Semântica dos campos

| campo de properties     | tipo   | Semântica                                                                                                                                                        |
| ----------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `loaf_script_count`     | number | quantidade de entradas de atribuição em `snapshots` do SDK, no máximo 5.                                                                                          |
| `loaf_top_duration_ms`  | number | maior `duration` da atribuição, arredondado em ms, com valores negativos fixados em 0.                                                                           |
| `loaf_top_invoker_type` | string | tipo de origem da atribuição principal: `user-callback` / `event-listener` / `script` / `unknown`. Fontes rAF sem `invokerType` são classificadas como `script`; enumerações inválidas, como `unknown`. |
| `loaf_top_share_pct`    | number | percentual inteiro de `loaf_top_duration_ms / longTask.duration`; quando a duração total está ausente, não é numérica ou é menor ou igual a 0, registra 0.                      |

### Limites

- Reforça apenas o evento automático do SDK com `event_type="longTask"`; não cria novos eventos customizados do ARMS via `sendCustom` nem altera o volume de eventos de `group=ui_perf`.
- Falha de parsing, `snapshots` ausente ou ausência de atribuição válida resulta em skip silencioso, sem afetar o reporte original do longTask.
- Não grava nome de script, URL de script, caminho de arquivo, stack, selector ou trechos de código-fonte; as consultas no SLS usam apenas os campos de baixa cardinalidade acima.
- Esta atribuição descreve apenas a atribuição amostrada com maior tempo dentro de um longTask e não pode ser equated à causa raiz completa da renderização do React; é preciso combinar `duration`, `fps`, `source` e os eventos `perf_ui_*` para julgar o impacto na experiência do usuário.

## Itens ajustáveis no futuro (fora desta rodada)

- Após o portão de pausa de 3000ms ir para produção, apertar conforme a distribuição real (p50/p90/p99).
- Se o volume de eventos de alta frequência for grande demais, adicionar um switch de amostragem no cliente.
- A primeira tela pode ser subdividida em fases (main ready / criação da window / commit do React), via extensão da dimensão `phase`.