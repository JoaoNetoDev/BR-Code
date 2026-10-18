# Monitoramento de qualidade de negócio

> **Complemento atual de 2026-09-11 (Todo129)**: o V4 ConversationTelemetrySupervisor já consome facts de requisições reais e reporta step/completion. A identidade oficial após o refactor do Provider é restaurada apenas no ponto de construção dos campos do evento; pessoal/Team compartilham o bucket antigo do Coding Plan, Start é independente e, em período ocioso, as duas organizações compartilham o bucket ocioso antigo. UUID e identidades desconhecidas não são inferidos; codificação de nome de modelo, usage, atribuição, deduplicação e dados históricos permanecem inalterados. O mapeamento detalhado e os critérios de aceitação estão em [Todo129](../working-memory/provider-refactor/steps/todo-129-impact-and-cases.md). A descrição abaixo sobre "o V4 ainda não foi religado" representa apenas um estado histórico.

> **Status**: desenho das métricas / escopo histórico. O caminho principal do V4 `SessionPane` + projection ainda não religou a agregação de
> `message_completion` / `agent_step` descrita neste documento; as entradas antigas `useZCodeChat` e `taskStreamEventHandlers` foram removidas.
> Antes que o telemetry do V4 seja conectado e validado, os campos abaixo não devem ser tratados como dados de coleta estáveis e atuais.

## Escopo (a complementar)

<!-- comportamento do produto, qualidade de sessão/tarefa, eventos de instrumentação, exibição local de estatísticas etc. -->

## Limite com o monitoramento não relacionado a negócio

| Pertence a este documento | Não pertence a este documento (ver [performance-monitoring.md](./performance-monitoring.md)) |
| ---------- | --------------------------------------------------------------------------- |
| A complementar     | Desempenho de página, erros de JS, crashes, RUM, Profiling em desenvolvimento                              |

## Envio e armazenamento (a complementar)

<!-- por exemplo /report, biblioteca de observabilidade do agent, exibição na página de configurações — escopo e campos definidos pelo requisito -->

## Lista de métricas e eventos (a complementar)

### `send_btn`

Evento de clique/envio de mensagem pelo usuário. No envio, é lido um snapshot da identidade do plano do domínio de identidade do usuário logado, e o resultado é congelado na telemetry de prompt deste turno; na sequência, o mesmo `message_completion` do turno deve reutilizar exatamente o mesmo conjunto de campos, sem reler o estado da conta na conclusão.

| Campo              | Tipo   | Novo? | Descrição                         | Escopo / Exemplo                                                                                                                                                                                |
| ----------------- | ------ | -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `plan_status`     | string | Sim       | Identidade do plano no momento em que o usuário envia a mensagem deste turno | `coding_plan` / `start_plan` / `no_plan` / `unknown`                                                                                                                                       |
| `plan_product_id` | string | Sim       | ID estável de produto no backend do plano atual    | O Coding Plan usa o `productId` da assinatura; o Start Plan usa o `plan_id` do pacote active com a primeira prioridade na ordenação do servidor dentro de `plans[]` da API de saldo (isto é, entitlement `subscription.details[0]`); string vazia quando não há pacote active |

A prioridade de determinação da identidade do plano é fixa: `Coding Plan > Start Plan > No Plan > Unknown`. Em caso de falha na requisição, carregamento em andamento, exceção de autenticação, provider não configurado ou snapshot expirado além do TTL do cache de entitlement, é obrigatório reportar `unknown`; nunca classificar erroneamente como `no_plan`.
Os domínios de identidade de login mutuamente exclusivos Z.AI e BigModel são determinados por `providerFamilyDomain`; esse campo serve apenas para escolher o snapshot de Coding Plan / Start Plan do domínio de identidade atual, não é reportado como campo de instrumentação de negócio e não acompanha a troca de `message_completion.model_provider`.

Escopo com múltiplos Start Plans active: `subscription.details` agora carrega todos os pacotes active e mantém a ordem de prioridade do servidor; `plan_product_id` assume `details[0]` (o pacote active primeiro na ordenação do servidor). Quando o servidor ajusta a ordenação dos pacotes ou a quantidade de pacotes, essa dimensão pode se inverter; trata-se de um escopo explícito, não de uma troca de identidade. Ao comparar funis ou retenção por essa dimensão, é preciso alinhar essa regra com o lado de dados.

### `message_completion`

O desenho histórico do evento de conclusão de mensagem de um turno do Agent é agregado pelo lado de UI em `finalizePromptTelemetry()` e reportado a `/event/report` por `reportAppTelemetryEvent()`; atualmente o caminho principal do V4 não chama esse ponto de consolidação.

| Campo                   | Tipo          | Novo? | Descrição                              | Escopo / Exemplo                                                         |
| ---------------------- | ------------- | -------- | --------------------------------- | ------------------------------------------------------------------- |
| `time_to_first_token`  | string(float) | Não       | Tempo até o primeiro token desde o envio, em milissegundos     | `firstTokenAt - sendTime`                                           |
| `waiting_ms`           | string(float) | Não       | Tempo de espera do usuário, como espera por permissões, em milissegundos      | Valor acumulado de cada tool permission request até a response/terminação neste turno             |
| `duration_ms`          | string(float) | Não       | Tempo total de parede do turno, incluindo `waiting_ms` | `finishedAt - sendTime`                                             |
| `request_time`         | string(float) | Não       | Carimbo de tempo do envio pelo usuário                    | `sendTime`                                                          |
| `input_tokens`         | string(float) | Não       | Quantidade de tokens de entrada                     | Reportado quando há usage no estado de sucesso                                               |
| `output_tokens`        | string(float) | Não       | Quantidade de tokens de saída                     | Reportado quando há usage no estado de sucesso                                               |
| `reasoning_tokens`     | string(float) | Não       | Quantidade de reasoning tokens                | `0` quando não há valor                                                        |
| `cached_input_tokens`  | string(float) | Não       | Quantidade de tokens de entrada atendidos por cache           | `0` quando não há valor                                                        |
| `total_tokens`         | string(float) | Não       | Quantidade total de tokens                       | Reportado quando há usage no estado de sucesso                                               |
| `agent_step_cnt`       | string(int)   | Não       | Quantidade de passos do Agent                      | Quantidade de `agent_step` efetivamente consolidados e reportados no ciclo de vida da message atual             |
| `file_change_cnt`      | string(int)   | Não       | Quantidade de arquivos alterados                        | Deduplicação de path por fileChanges deste turno                                        |
| `generated_code_lines` | string(int)   | Não       | Quantidade de linhas de código adicionadas                      | Contagem de added com base no diff before/after                                   |
| `ask_mode`             | string        | Não       | Modo atual da conversa                      | `chat` / `plan` / outros mode id                                      |
| `retry_cnt`            | string(int)   | Sim       | Quantidade de retentativas de modelo/API neste turno             | O caminho atual de completion ainda não expõe eventos de retry de forma estável; assume `0` por enquanto               |
| `tool_call_total`      | string(int)   | Sim       | Total de chamadas de ferramenta neste turno                  | Quantidade de steps `tool_call` efetivamente consolidados na message atual                       |
| `tool_call_failed`     | string(int)   | Sim       | Quantidade de chamadas de ferramenta com falha neste turno                | Steps `tool_call` na message atual com estado fail/timeout ou que possuem error |
| `error_type`           | string        | Sim       | Classificação da falha                          | Vazio em sucesso; `TOOL_CALL_FAILED` quando há ferramenta com falha; `UNKNOWN` para outras falhas     |
| `error_msg`            | string        | Sim       | Mensagem da falha                          | Vazio em sucesso; `[redacted]` quando o texto original da falha não é vazio, vazio quando o original é vazio; a atribuição usa `error_type`                        |
| `plan_status`          | string        | Sim       | Identidade do plano no momento em que o usuário envia a mensagem deste turno      | Reutiliza o valor congelado de `send_btn` do mesmo turno; não é recalculado na ocorrência do completion              |
| `plan_product_id`      | string        | Sim       | ID estável de produto no backend do plano atual         | Reutiliza o valor congelado de `send_btn` do mesmo turno; string vazia quando não é possível confirmar                    |
| `workspace_kind`       | string        | Sim       | Tipo de workspace deste turno               | `local` / `remote`, congelado pelo workspace attachment                    |
| `remote_kind`          | string        | Sim       | Tipo de workspace remoto               | `ssh` / `wsl` / `docker` / `server`; string vazia em caso local ou quando não é possível resolver     |

Locais de implementação:

- Agregação de campos: `packages/ui/src/lib/messageTelemetry.ts`
- Envio no estado de conclusão: a entrada antiga foi removida, o V4 ainda será conectado
- Encapsulamento de envio da UI: `packages/ui/src/lib/appTelemetry.ts`

### `agent_step`

Evento de execução de um único passo do Agent. Sua granularidade é mais fina que a de `message_completion`: um
`message_completion` corresponde à conclusão completa de uma mensagem do usuário, e uma única mensagem do usuário pode gerar várias
`agent_step`.

Atualmente são usados apenas três tipos de step: `reasoning`, `tool_call` e `generation`; não se adiciona permission step;
a espera por permissão de ferramenta é expressada separadamente em `tool_call.waiting_ms`, sem enviar o conteúdo da pergunta do usuário.

| Campo                          | Tipo        | Novo? | Descrição                                  | Escopo / Exemplo                                                                                                                                                                            |
| ----------------------------- | ----------- | -------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `talk_id`                     | string      | Não       | id da sessão / task                        | Mapeado pelo `talkId` do payload de envio                                                                                                                                                      |
| `message_id`                  | string      | Não       | id da mensagem atual do usuário                       | Mapeado pelo `messageId` do payload de envio                                                                                                                                                   |
| `step_id`                     | string      | Sim       | id globalmente único deste Agent step         | `uuid`                                                                                                                                                                                 |
| `is_tftt_cached`              | string(int) | Sim       | Se o primeiro token veio do cache                 | Atualmente sem sinal estável; fixado em `0` por enquanto                                                                                                                                                             |
| `loop_index`                  | string(int) | Sim       | Ordem do step atual dentro desta message     | Incrementa a partir de `1`                                                                                                                                                                        |
| `step_type`                   | string      | Sim       | Tipo do passo atual                          | `reasoning` / `tool_call` / `generation`                                                                                                                                               |
| `is_tool_call`                | string(int) | Sim       | Se é chamada de ferramenta                          | `1` para `tool_call`, `0` para os demais                                                                                                                                                         |
| `tool_name`                   | string      | Sim       | Nome da ferramenta                              | `read_file` / `bash`; vazio para não ferramentas                                                                                                                                                       |
| `tool_call_id`                | string      | Sim       | id da chamada de ferramenta                           | Escrito apenas em steps `tool_call`, para associar aos eventos de desempenho de estado final da ferramenta; vazio para não ferramentas                                                                                                                       |
| `agent_id`                    | string      | Sim       | id de associação do Subagent em primeiro plano                 | O step `Agent` pai e sua ferramenta child espelho escrevem o mesmo valor; outros steps omitem                                                                                                                        |
| `duration_ms`                 | string(int) | Sim       | Tempo de parede do step atual, incluindo `waiting_ms` | Hora de consolidação do step - hora de início do step                                                                                                                                                          |
| `waiting_ms`                  | string(int) | Sim       | Valor acumulado de espera por permissão dentro do step atual          | Em `tool_call`, acumula da request até a response/terminação; `0` em outros steps                                                                                                                          |
| `generation_tail_finalize_ms` | string(int) | Sim       | Tempo de consolidação de cauda, do último pacote do corpo até o estado final da task  | Escrito apenas quando o `generation` do agent principal é consolidado por `task_complete` / `task_error` no desktop `desktop-continuous`; string vazia em outros steps, em recuperação replayable do celular, em generation interrompida por ferramenta/pensamento ou em sub-saída de ferramenta |
| `status`                      | string      | Sim       | Estado final do passo atual                    | `success` / `fail` / `timeout`                                                                                                                                                         |
| `model_request_id`            | string      | Sim       | Requisição de modelo à qual os tokens pertencem                    | Vazio quando o step atual não detém request usage                                                                                                                                                  |
| `model_request_count`         | string(int) | Sim       | Quantidade real de requisições de modelo agregadas no step atual        | `1` para request do Agent principal; pode ser maior que `1` no ciclo de vida de um child em primeiro plano; `0` sem usage                                                                                                                |
| `token_usage_scope`           | string      | Sim       | Escopo de tokens                            | `model_request` para uma única requisição do Agent principal; `subagent_requests` para o agregado de children em primeiro plano; vazio caso contrário                                                                                                     |
| `input_tokens`                | string(int) | Sim       | Tokens de entrada de uma única requisição                    | Provider request usage; uma mesma request pertence a apenas um step                                                                                                                                   |
| `output_tokens`               | string(int) | Sim       | Tokens de saída de uma única requisição                    | Provider request usage; uma mesma request pertence a apenas um step                                                                                                                                   |
| `reasoning_tokens`            | string(int) | Sim       | Reasoning tokens de uma única requisição              | `0` quando o provider não retorna                                                                                                                                                                |
| `cached_tokens`               | string(int) | Sim       | Tokens atendidos por cache em uma única requisição                | Correspondente ao cache read do provider; `0` quando não é retornado                                                                                                                                               |
| `cache_write_input_tokens`    | string(int) | Sim       | Tokens gravados em cache em uma única requisição                | `0` quando o provider não retorna                                                                                                                                                                |
| `total_tokens`                | string(int) | Sim       | Total de tokens de uma única requisição                      | Total explícito do provider; quando ausente, calculado pelas regras unificadas de usage                                                                                                                                       |
| `error_type`                  | string      | Sim       | Classificação da falha                              | `TOOL_EXEC_ERROR` para falha de ferramenta; falhas de task usam o código de erro; vazio em sucesso                                                                                                                              |
| `error_msg`                   | string      | Sim       | Mensagem da falha                              | `[redacted]` quando o texto original do erro não é vazio, vazio quando o original é vazio; vazio em sucesso, a atribuição usa `error_type`                                                                                                                                                       |
| `workspace_kind`              | string      | Sim       | Tipo de workspace deste passo                 | Consistente com o `message_completion` do mesmo `talk_id + message_id`; `local` / `remote`                                                                                                     |
| `remote_kind`                 | string      | Sim       | Tipo de workspace remoto                   | `ssh` / `wsl` / `docker` / `server`; string vazia em caso local ou quando não é possível resolver                                                                                                                        |

Critério de determinação de `step_type`:

- `agent_thought_chunk` inicia um step `reasoning`.
- Ao encontrar `tool_call` / `agent_message_chunk` comum / `task_complete` / `task_error`, o `reasoning` atual é consolidado.
- `tool_call` inicia um step `tool_call`; `tool_call_update` o consolida ao chegar a `completed` / `failed` / `denied`.
- Um `agent_message_chunk` do agent principal sem `zcodeTimeline` e sem `parentToolUseId` inicia um step `generation`; ele é consolidado ao encontrar um `tool_call` / `agent_thought_chunk` / `task_complete` / `task_error` subsequente.
- `generation_tail_finalize_ms` responde apenas à latência de cauda de finalize entre o último pacote do corpo e o estado final da task no caminho principal continuous do desktop; se houver chamadas de ferramenta após o corpo, entrada em novo reasoning, reprodução vinda da recuperação replayable do celular, ou se o chunk tiver `parentToolUseId` e pertencer a sub-saída de ferramenta, o campo é string vazia — evitando misturar na latência de cauda o custo da próxima etapa, o tempo de processamento da reprodução de recuperação ou a saída de sub-agent.
- Se `agent_message_chunk` for timeline do sistema (como context compaction), não é contabilizado como `generation`.
- Os campos de modelo são congelados na criação do step a partir do `model_request_started` real do momento; não se pode sobrescrever steps históricos com a última requisição do prompt.
  Como o provider fornece usage apenas no nível da request, o usage completo de uma mesma request é escrito somente no último step de saída de modelo quando a requisição termina, e as demais fases permanecem em `0`. Veja os detalhes em
  [Agent Step 真实模型与 Token 归属](./agent-step-model-token-attribution.md).
- O usage de child requests de Subagents em primeiro plano é atribuído, via `childSessionId + parentToolCallId`, ao step da ferramenta `Agent` da message correspondente; o ciclo de vida assíncrono de Subagents em segundo plano está fora do escopo atual.

Escopo de contagem:

- Quando `activatePromptTelemetry()` ativa uma nova message, `loop_index` reinicia em `1`.
- A cada `agent_step` consolidado, as métricas de completion da message atual são acumuladas sincronamente.
- Sob o mesmo `talk_id + message_id`, `message_completion.agent_step_cnt` deve ser igual à quantidade real de `agent_step` reportados; não se deve varrer nem acumular mensagens assistant históricas da mesma session.

Locais de implementação:

- Máquina de estados e agregação de campos: `packages/ui/src/lib/messageTelemetry.ts`
- Entrada de eventos de stream e envio: a entrada antiga foi removida, o V4 ainda será conectado
- Encapsulamento de envio da UI: `packages/ui/src/lib/appTelemetry.ts`

## Multiplataforma e clientMode

O escopo de uso de workspaces remotos e do Web Remote Control no celular está em
[远程场景使用量埋点 V1](./remote-usage-telemetry-v1.md); a contagem de sessions lógicas concorrentes em workspace remoto, o motivo de desconexão e a duração observável de conexão estão em
[远程工作区连接 ARMS 自定义事件](./remote-usage-arms-telemetry.md).

A instrumentação de controle remoto apenas observa os estados finais do ciclo de vida já existente, sem alterar a semântica de transporte: o desktop permanece `desktop-continuous`, o celular permanece
`web-remote-replayable`; o relay não interpreta `rpc-frame` e o Web bundle não ganha um reporter dedicado. O uso real no celular é
determinado pelo sucesso no estabelecimento de uma bridge via shared-host attachment do desktop.

## Índice de implementação (fatos de código, não especificação)

Antes de o requisito ser finalizado, serve apenas como referência de localização; o código prevalece:

- Envio da instrumentação de negócio: `packages/services/src/telemetry/telemetryCore.ts` (`https://zcode.z.ai/api/v1/event/report`)
- Encapsulamento do lado de UI: `packages/ui/src/lib/appTelemetry.ts`, `packages/ui/src/lib/messageTelemetry.ts`
- Persistência de uso do Agent: `apps/zcode-cli/docs/design/v2/usage-observability.md` (spec de design do CLI, não um documento deste diretório)
- Agregação de App Usage: `docs/superpowers/specs/2026-06-02-app-usage-db-migration-design.md` (spec funcional, não um documento deste diretório)

## Adendo (2026-09-14): subagentes de workflow entram em `agent_step` / `agent_composition`

spec: `apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`, seção「Token telemetry for subagents». Incrementos de escopo dos campos:

| Campo | Mudança |
| --- | --- |
| `agent_step.agent_role` | Novo valor `workflow subagent` (os existentes `foreground subagent` / `background subagent` permanecem) |
| `agent_step.agent_id` | Para subagentes de workflow, `siteId@ordinal` |
| `agent_step.workflow_run_id` / `child_session_id` / `workflow_tool_call_id` | Novos; presentes apenas em steps de subagentes de workflow |
| `agent_step.tool_call_id` | Subagente de workflow: step de ferramenta `tool_workflow_<agentId>_<childToolCallId>`, step de agregação `tool_workflow_<agentId>_<runId>` |
| `agent_step.message_id` | Subagentes de workflow ficam sob o inputId do turno que iniciou o run; quando iniciados diretamente pelo hub, usam um UUID v7 sintético exclusivo do run, e essa message não tem `message_completion` |
| `message_completion.agent_composition` | Novos `main_plus_wf` / `main_plus_fg_wf` / `main_plus_bg_wf` / `main_plus_fg_bg_wf`: definidos quando a notificação do run é consumida por algum turno da conversa principal |
| `message_completion.message_source` | Turnos independentes evocados por notificação de workflow são registrados como `background_workflow` |