# Telemetria de mensagens de tarefas agendadas / tarefas off-peak

> Status: o MVP de atribuição de origem das mensagens de tarefas agendadas já está integrado; a tarefa off-peak V1 usa a mesma cadeia de eventos de mensagem, com contrato em
> `docs/monitoring/off-peak-task-telemetry-v1.md`. O 「futuro de tarefas off-peak」 e o conteúdo de
> telemetry outbox neste documento são um plano histórico de evolução; em caso de conflito, o contrato V1
> prevalece, e o V1 não implementa outbox/retry/restart replay.

## Objetivos

1. Tarefas agendadas e as futuras tarefas off-peak são turnos de entrada reais do Agent e devem reutilizar o
   `message_completion` e o `agent_step` da conversa comum, para que latência, uso de ferramentas, tokens e taxa de sucesso possam ser comparados de forma unificada.

 Só é adicionada uma dimensão mínima de origem; prompt, caminho de arquivo ou input/output de ferramenta não são enviados. O turno de criação da tarefa agendada e as execuções seguintes usam

2. Na criação da ferramenta de tarefa agendada, usar o `automationId` já existente para associar `agent_step.tool_name=croncreate` ao `message_completion`; se a cadeia de relato não permitir enviar o UUID original, enviar um hash estável dele, mas sem introduzir outro conjunto de IDs de domínio.

```text
chat comum
UI commandId/inputId
        |
        +-- SessionPane ACK -> seed de telemetria da UI
        |
        +-- message_completion / agent_step -> /event/report

tarefa agendada (implementado)
automation_runs.runId -> Host traceId -> inputId/sourceCommandId
        |                         |
        +-- trigger: schedule/manual
        +-- automationId（chave de associação estável em nível de regra；contexto de execução deste turno）
                                  |
                                  +-- CLI TurnStarted estabelece um seed de telemetria confiável

tarefa off-peak (não implementado)
Spec: offPeakTaskId -> futuro Host sendPrompt -> inputId/sourceCommandId
```

## 1. Especificação dos eventos de mensagem comum

Campos de associação comuns:

| Campo                            | Significado                                                                                      |
| --- | --- |
| `talk_id`                       | ID de task / session.                                                                            |
| `message_id`                    | ID do turno de entrada atual; no V4 corresponde a `sourceCommandId` / `inputId`. O completion e o step do mesmo turno precisam ser iguais. |
| `model_name` / `model_provider` | Modelo e provider efetivamente usados neste turno.                                               |

### `message_completion`

Resumo final de uma entrada do Agent; no máximo um por `talk_id + message_id`.

| Grupo de campos                      | Campos                                                                                                                 | Significado                                                                                                                                                                       |
| --- | --- | --- |
| Latência                              | `request_time`、`duration_ms`、`time_to_first_token`、`waiting_ms`                                                     | Momento do envio, duração ponta a ponta, latência do primeiro token, acúmulo de esperas por permissão.                                                                            |
| Uso                                   | `input_tokens`、`output_tokens`、`reasoning_tokens`、`cached_input_tokens`、`cache_write_input_tokens`、`total_tokens` | Uso do Agent principal neste turno.                                                                                  |
| Passos e ferramentas                  | `agent_step_cnt`、`tool_call_total`、`tool_call_failed`                                                                | Número de steps já consolidados no turno atual e estatísticas de chamadas de ferramenta.                             |
| Resultado                             | `status`、`error_type`、`error_msg`                                                                                    | `success` / `fail` / `user_interrupt`; a atribuição da falha usa `error_type`; texto original não vazio de `error_msg` é uniformizado como `[redacted]` e string vazia permanece vazia. |
| Identidade do plano                   | `plan_status`、`plan_product_id`                                                                                       | Identidade do plano do usuário congelada no envio: `coding_plan` / `start_plan` / `no_plan` / `unknown`; ID de produto estável do backend do plano atual. |
| Origem e associação (novo)            | `message_source`、`task_trigger`、`automation_id` / `off_peak_task_id`                                                 | Escrito em `event_extra_detail`; explicita a origem, se a execução foi agendada ou imediata e associa o turno de criação da tarefa agendada às execuções seguintes. |
| Temporização de execução agendada (novo, só tarefas agendadas) | `scheduled_at`、`schedule_lag_ms`                                                                                      | Escrito em `event_extra_detail`; respectivamente o timestamp Unix em milissegundos do disparo planejado desta execução e o instante de aceitação pelo Host menos `scheduled_at`. Só tem valor com `task_trigger=schedule`; execução manual fica vazio e não é copiado para cada step. |
| Métricas de compatibilidade           | `file_change_cnt`、`generated_code_lines`、`ask_mode`、`retry_cnt`                                                     | Campos legados de compatibilidade dos relatórios; em parte herdados da especificação histórica fixa.                                                                              |

### `agent_step`

Passo de execução já consolidado dentro de um turno; `message_completion.agent_step_cnt` precisa ser igual à quantidade realmente reportada com sucesso nesse turno.

| Grupo de campos         | Campos                                                                        | Significado                                                                                                                                 |
| --- | --- | --- |
| Ordem e tipo            | `step_id`、`loop_index`、`step_type`、`is_tool_call`                        | `step_id` é o identificador único e estável de um step já consolidado dentro do mesmo `message_id`, e `loop_index` é a sequência dentro do turno; os tipos são `reasoning` / `generation` / `tool_call`. |
| Ferramenta              | `tool_name`、`tool_call_id`                                                 | Nome e ID de chamada de um step de ferramenta; vazio quando não é ferramenta.                                                               |
| Latência e resultado    | `duration_ms`、`waiting_ms`、`generation_tail_finalize_ms`、`status`        | Duração do step, espera por permissão, latência de consolidação do último quadro de texto e sucesso/falha/timeout.                             |
| Uso e erro              | `input_tokens`、`output_tokens`、`cached_tokens`、`error_type`、`error_msg` | Uso do step na especificação de compatibilidade atual; a atribuição da falha usa `error_type`, texto original não vazio de `error_msg` é uniformizado como `[redacted]` e string vazia permanece vazia. |
| Origem e associação (novo) | `message_source`、`task_trigger`、`automation_id` / `off_peak_task_id`      | Igual à entrada comum e ao mesmo `message_completion`; a decomposição de origem do completion deflagrado por um background subagent independente. |

`send_btn` é o evento de clique/submissão do usuário e não deve ser falsificado por tarefas automáticas em segundo plano; tarefas automáticas só reutilizam completion e step.

`step_id` não é apenas um campo de relatório: um mesmo turno de entrada pode legalmente produzir vários `agent_step` e, após um retry ou um reinício do Host, um mesmo step já consolidado
precisa manter o mesmo `step_id`. Por isso, na entrega confiável, a identidade da instância do evento de step / a chave lógica de idempotência do Outbox / a restrição única são
`message_id + agent_step + step_id`; não se pode usar apenas `message_id + event_type`.

## 2. Distinção mínima de origem

Ambos os eventos mantêm os campos de origem:

```ts
message_source: "chat" | "background_subagent" | "background_task" | "scheduled_task" | "off_peak_task";
task_trigger: "schedule" | "manual" | "";
automation_id?: string; // tarefa agendada: usa diretamente o automationId existente
off_peak_task_id?: string; // tarefa off-peak: futuramente usa diretamente o offPeakTaskId existente
```

Apenas `message_completion` acrescenta, quando `message_source=scheduled_task`:

```ts
scheduled_at?: number; // automation_runs.scheduledAt, Unix ms; vazio em manual
schedule_lag_ms?: number; // instante de aceitação dessa entrada pelo Host - scheduled_at; vazio em manual
```

Esses dois campos descrevem uma execução e não um step do Agent qualquer, por isso não são escritos em `agent_step`; todos os steps da mesma execução podem ser ligados de volta
a esse completion pelo `message_id=runId` já existente.

- Entrada comum: `chat` + `task_trigger` vazio.
- Execução agendada do scheduler: `scheduled_task` + `schedule`.
- 「Executar agora」 de tarefa agendada: `scheduled_task` + `manual`.
- Futura tarefa off-peak: `off_peak_task` + `task_trigger` vazio; se futuramente houver semântica de 「executar imediatamente」, o enum de disparo é estendido separadamente.

`message_source` é o campo de filtro do data warehouse; `task_trigger` apenas complementa como uma tarefa agendada foi iniciada. A origem de entradas comuns, tarefas agendadas e
tarefas off-peak é determinada no prompt admission e congelada para aquele `inputId`. O `agent_step` de main de uma notificação background independente mantém a origem de admission `background_task` existente; somente quando o resultado de um background subagent é explicitamente consumido e a origem de admission é claramente subagent, o `message_completion` final é decomposto em
`background_subagent`; quando a origem concreta não pode ser identificada, mantém-se
`background_task`.

Os turnos de main deflagrados por uma notificação background independente continuam usando o mesmo detalhamento do campo `message_source`:
`background_subagent` indica um completion deflagrado por admission metadata explicitamente identificada como subagent; quando a origem background concreta não pode ser identificada, mantém-se `background_task`. Quando resultados background são consumidos em conjunto durante uma query do usuário,
o turno atual mantém `message_source=chat`, sem reescrever a origem conforme o resultado consumido.
Quando múltiplas notificações background são mescladas em um turno, o `originMeta` de exibição ainda pode manter a tarefa representativa; a origem causal só é congelada quando todos os membros do lote têm a mesma origem, e origem mista ou ausente uniformiza para `background_task`, sem influência da ordem de chegada das notificações.

> **Não é possível determinar a origem apenas pelo ID.** `talk_id` e `message_id` só respondem 「de quem é este turno de execução」; o julgamento de origem lê
> `event_extra_detail.message_source`, e o modo de disparo das tarefas agendadas lê
> `event_extra_detail.task_trigger`.

```text
origem calculada pelo Host confiável (e não inferida pela sessão)
    |
    +-- Entrada comum da UI          -> chat
    +-- automation_runs.runId       -> scheduled_task + schedule/manual
    +-- futuro offPeakTaskId        -> off_peak_task
    |
    v
agent_step + message_completion do mesmo inputId reutilizam a mesma origem
```

### IDs, turno de criação e turno de execução das tarefas agendadas

Tarefas agendadas e futuras tarefas off-peak devem produzir `talk_id` e `message_id` padrão. Hoje as tarefas agendadas já produzem o fato de telemetria confiável `prompt.accepted` pelo
`TurnStarted` do CLI, estabelecendo um seed para o turno de execução e emitindo os eventos padrão de completion /
step. Criar uma regra e uma execução posterior são turnos de entrada diferentes e não podem compartilhar `message_id`; eles são associados pelo `automationId` já existente.

Os IDs mais centrais do domínio de tarefas agendadas são apenas dois:

```text
automationId = uma regra de agendamento já persistida
       |
       +-- runId #1 = uma execução no horário
       +-- runId #2 = a próxima execução no horário
       +-- runId #3 = o usuário clicando em “Executar agora”

relação: automationId 1 : N runId
```

Para uma mesma execução agendada, o `runId` é reutilizado tal e qual no Host, no Agent e na telemetria como identificador da entrada; eles não são IDs diferentes:

```text
automation_runs.runId
  = Host sendPrompt.traceId
  = V4 commandId
  = Agent inputId
  = telemetry sourceCommandId
  = message_id do /event/report
```

Essa igualdade vale para os dois caminhos de disparo: 「reaproveitar uma sessão já vinculada」 e 「criar uma nova sessão para uma tarefa não vinculada criada manualmente pela UI」.
O session trace gerado pelo próprio `createTask` descreve apenas a operação de criação da sessão e não pode continuar servindo como `traceId/inputId` do primeiro prompt de automation;
caso contrário o CLI não consegue identificar `manual` / `schedule` pelo ID de entrada, o renderer não estabelece um
telemetry seed para aquele turno de execução e o turno inteiro fica sem `agent_step` e `message_completion`. Ao enviar o prompt após criar a sessão, é obrigatório sobrescrever explicitamente
com o `runId` desta execução.

`talk_id` é outro eixo: indica 「em qual sessão/task esta execução rodou」. Regras com sessão vinculada reutilizam seu
`targetTaskId`; regras não vinculadas criam uma nova task. Portanto uma telemetria completa pode ser lida como:

```text
talk_id    = em qual sessão a execução ocorreu
message_id = qual execução agendada daquela sessão (runId)
```

| Campo               | Escopo e forma de geração                                                             | Uso                                                                                                                                                |
| --- | --- | --- |
| `automationId`     | Um por regra de agendamento, permanece constante entre cada execução schedule / manual. | `event_extra_detail.automation_id` do turno de criação e de todos os turnos de execução; **não é** o `message_id`.                                |
| `runId`            | Um por execução agendada: `automationId:scheduledAt` ou `automationId:manual:uuid`.   | `traceId` do Host, mapeado para o `inputId/sourceCommandId/message_id` do turno de execução; é o namespace de idempotência da telemetria deste turno. O completion se distingue por ele, e o step ainda precisa somar `step_id`. |
| `scheduledAt`      | O momento de disparo teórico desta execução em `automation_runs` (Unix ms); vazio em run manual. | Escrito no `message_completion.event_extra_detail.scheduled_at` desta execução e usado para calcular o atraso de agendamento; **não é** a expressão cron da regra. |
| `talk_id`          | ID da sessão/task onde esta execução ocorreu; regra vinculada reutiliza a target task, regra não vinculada cria nova task. | Atribui o completion e os steps do turno atual à sessão de execução; **não é** o ID da regra de agendamento.                                     |
| `cronAutomationId` | Marcador de pertencimento da sessão no meta da task.                                       | Apenas agrupamento na UI/isolamento de ferramentas; não serve para origem de mensagem nem para associação criação-execução.                        |

```text
turno de criação: chat comum
talk_id = T0
message_id = M0
agent_step { tool_name=CronCreate, status=success, automation_id=A }
                                      |
                                      | automation_runs referencia A várias vezes depois
                                      v
N-ésimo turno de execução: tarefa agendada
talk_id = T0(sessão vinculada) ou nova task
message_id = runId=R1
message_completion / agent_step {
  message_source=scheduled_task,
  task_trigger=schedule|manual,
  automation_id=A
}
```

O data warehouse faz join do step de criação `CronCreate` com as execuções seguintes por `automation_id=A`; o `M0` do turno de criação e o `R1` do turno de execução
permanecem diferentes, evitando que várias execuções de uma regra sejam mescladas indevidamente na mesma message.

As futuras tarefas off-peak reutilizam diretamente o `offPeakTaskId`: o `message_id` de execução usa o ID de sua execução única (na implementação, se houver outro run ID, usa-se o
run ID) e a associação entre turnos escreve `off_peak_task_id=offPeakTaskId`. Hoje as tarefas off-peak não estão implementadas e a métrica de `CronCreate` não pode ser
chamada de 「usuários que configuraram tarefas off-peak」.

### Número de usuários que criaram tarefas agendadas pela conversa (MVP)

Não é criado um novo evento `task_configuration_created`. O step de ferramenta do Agent já existente é usado como fato de criação bem-sucedida:

```text
element_name = agent_step
event_extra_detail.tool_name = CronCreate
event_extra_detail.status = success
event_extra_detail.automation_id = A（não vazio）
```

O data warehouse filtra por essa condição e calcula `count(distinct user_id)`, obtendo o **「número de usuários que configuraram tarefas agendadas com sucesso pela conversa」**.
`automation_id` serve para fazer join desse step de criação com os dados de execução seguintes, e não para deduplicar usuários.

Esse MVP atual não inclui tarefas agendadas criadas manualmente nem tarefas off-peak: as tarefas off-peak ainda não foram implementadas e o Spec atual cria as tarefas ligando o composer
diretamente ao serviço, o que não gera naturalmente um agent step de `CronCreate`. Se no futuro as tarefas off-peak mantiverem essa entrada, não será permitido forjar um
`agent_step`; é preciso definir à parte o business telemetry de criação bem-sucedida. Se o produto passar a criar as tarefas por ferramenta do Agent, deve-se usar um
`tool_name=OffPeakCreate` independente com `off_peak_task_id`, sem reutilizar `CronCreate`.

A especificação atual de eventos não tem um `agent_id` independente como chave de associação de mensagem. `talk_id + message_id` já bastam para associar uma execução; para associar
Agent/provider, continue usando `agent`, `model_provider`, `model_name` e não finja que `automationId` ou `runId` são um `agent_id`.

### Usabilidade dos campos existentes

| Campo existente                    | Conclusão                                | Motivo                                                                                                                                           |
| --- | --- | --- |
| `runId` da tarefa agendada          | Message ID e namespace de idempotência dos turnos de execução | Hoje `runId -> Host traceId -> inputId/sourceCommandId`; único por execução. `message_completion` o usa para deduplicar, e vários `agent_step` ainda precisam ser diferenciados por `step_id`. |
| `trigger` da tarefa agendada        | Pode servir de origem de `task_trigger`  | Já persistido como `schedule` / `manual`.                                                                                                          |
| `automationId` da tarefa agendada   | Chave de associação do turno de criação e do turno de execução | Escrito em `event_extra_detail.automation_id`; hoje também usado para isolamento de ferramentas deste turno.                                            |
| `cronAutomationId` (meta da task)  | Não serve para classificar mensagens    | Isso é pertencimento no nível da task; mensagens comuns do usuário naquela sessão também podem carregá-lo.                                           |
| `inputId` / `sourceCommandId`       | Só para associação, não para classificação | Todas as entradas têm esse ID.                                                                                                                  |
| `clientMode=desktop-continuous`     | Não classifica                            | O chat comum do desktop e as tarefas agendadas são iguais.                                                                                          |
| `querySource`                       | Não reutilizado                           | É a origem interna da requisição ao modelo, não a origem de mensagem no nível do produto.                                                          |
| `offPeakTaskId`                     | Futuramente pode servir de chave interna de associação | As tarefas off-peak têm apenas o Spec, sem implementação de runtime, repo, scheduler ou UI.                                                     |

## 3. Cadeia de execução e limites do MVP atual

Uma entrada V4 comum estabelece um telemetry seed no `SessionPane` do renderer depois de receber o accepted ACK; em seguida os live facts são consolidados em `agent_step` e `message_completion`.

Para as tarefas agendadas, o scheduler chama `dispatchCronRun -> sendPrompt` do Host, passando o `runId` como
`traceId/inputId`. O CLI publica, no admission confiável, um fato `prompt.accepted` sem corpo, e o supervisor de workspace do desktop continuous
estabelece o lifecycle a partir dele, reutilizando a agregação e o relato existentes da UI para `/event/report`.

```text
scheduler / Run now
  -> Host sendPrompt(runId, automationId)
  -> CLI TurnStarted（fato de admission confiável）
  -> prompt.accepted telemetry fact（sem corpo）
  -> desktop-continuous workspace supervisor
  -> agent_step* + message_completion
```

Esse MVP reutiliza apenas o live telemetry attachment do desktop `desktop-continuous` e não entra na cadeia de recuperação por snapshot/gap do `web-remote-replayable` do Web no celular.
Ainda pode haver perda de relato quando o renderer não existe ou o attachment não está pronto; para uma entrega confiável sem supervisão seria preciso implementar um telemetry outbox no Host,
e não é permitido afundar o estado de negócio no main ou no relay.

## 4. Esquema implementado e evolução futura

### Divisão das tarefas de implementação

O objetivo de produto pode ser resumido em duas coisas: fazer a execução de tarefas agendadas/off-peak reutilizar a telemetria de mensagens comuns e fazer o step de criação `CronCreate`
existente poder ser associado às execuções agendadas seguintes. A implementação de engenharia é recomendada ser dividida em três itens, com fronteiras mais claras:

```text
Tarefa 1: origem da execução e repasse de IDs
  scheduled: runId -> traceId/inputId/sourceCommandId/message_id
  off-peak: futuro offPeakTaskId（ou seu runId）-> mesma cadeia de entrada
  junto com message_source、task_trigger、automation_id/off_peak_task_id
  o completion de um schedule run recebe também scheduled_at、schedule_lag_ms
  runId é o namespace de idempotência dos eventos: completion usa runId, step usa runId + step_id

Tarefa 2: fiação da telemetria das mensagens de execução
  dispatch do scheduler / futuro off-peak pelo Host
    -> estabelecer telemetry seed ou reporter no Host
    -> message_completion + agent_step padrão

Tarefa 3: campos de associação no step de criação CronCreate já existente
  sucesso do commit do repo no CronCreate
    -> agent_step { tool_name=CronCreate, status=success, automation_id }
    -> pode fazer join com as execuções seguintes da Tarefa 2 por automation_id
```

A Tarefa 1 resolve 「de onde vem esta execução, como os IDs ficam consistentes」; a Tarefa 2 resolve 「como reportar sem passar pela UI em segundo plano」; a Tarefa 3 resolve
「como associar a ação de criação às execuções seguintes e como contar os usuários que criaram tarefas agendadas pela conversa」.

Os três esquemas precisam antes complementar a mesma cadeia de associação de criação: o estado terminal da ferramenta `CronCreate` só anexa `automationId` ao fato de telemetria
`tool.lifecycle` do V4 depois que o repo de automation grava com sucesso (só o ID, sem prompt nem output da ferramenta); o supervisor
o mapeia para o `agent_step.event_extra_detail.automation_id` daquela linha. Em seguida, quando o Host despacha a execução, o mesmo
`automationId` é congelado no completion e em cada step daquela execução. O schema de fatos existente é strict, então esse campo precisa ser
declarado explicitamente no protocolo de telemetria do shared; não pode ser adivinhado temporariamente pela UI nem inferido do meta da task.

```text
CronCreate repo commit
  -> terminal tool.lifecycle { toolName=CronCreate, automationId=A }
  -> agent_step { tool_name=CronCreate, status=success, automation_id=A }

dispatchCronRun { runId=R, automationId=A }
  -> message_completion / agent_step { message_id=R, automation_id=A }
```

### Esquema A: o Host completa o seed confiável no supervisor de renderer existente (MVP já implementado)

Após o `sendPrompt` ser aceito, o Host publica um fato `automation prompt accepted` sem corpo, contendo
`sessionId`, `inputId/runId`, `message_source`, `task_trigger` e `automation_id`; o run de schedule também contém
`scheduled_at` e `schedule_lag_ms`. O supervisor do renderer
o usa para estabelecer o mesmo lifecycle da UI e então consome os live facts existentes.

- Vantagens: menor mudança, reaproveita diretamente a agregação `messageTelemetry` atual e o relato para `/event/report`.
- Limitações: ainda pode haver perda de relato em reload do renderer, janela inexistente ou attachment não pronto.
- Aplicação: o MVP para validar primeiro a escala das tarefas agendadas e a especificação dos campos.

### Esquema B: o Host reutiliza diretamente o ciclo de vida de mensagens do `/event/report`

Extrair a lógica de agregação source-neutral da UI atual para um módulo que possa ser chamado pelo Host. Para entradas de automation / off-peak, o Host
reporta `agent_step` / `message_completion` padrão em três momentos: accepted, consolidação do step e terminal, congelando a origem e
`automation_id` / `off_peak_task_id`; o completion de um schedule run congela `scheduled_at` e
`schedule_lag_ms`; a UI mantém apenas o reporter do chat comum.

- Vantagens: não depende do renderer, e tanto tarefas agendadas quanto futuras tarefas off-peak podem entrar.
- Limitações: é preciso definir claramente o owner do reporter, evitando duplo relato da UI e do Host para o mesmo `inputId`.
- Regra mínima: `chat` é reportado pela UI; `scheduled_task` / `off_peak_task` só pelo Host.

### Esquema C: Esquema B + telemetry outbox no Host (recomendado para o lançamento oficial)

Adicionar um outbox leve no mesmo banco do registro de execuções de automation: cada um de accepted, de cada step já consolidado e do terminal correspondente
ao `message_completion` grava um registro pendente. Os registros carregam `runId`, `automationId` e um
`outbox_event_id` no nível da instância do evento; a marcação de conclusão ocorre após o envio bem-sucedido em lote.

`automationId` serve apenas para associação entre turnos e não pode ser a condição de distinção de um registro de outbox. `runId` é igual ao `inputId` deste turno,
mas uma mesma execução pode ter vários `agent_step`, então a chave de idempotência precisa incluir a identidade da instância do evento:

```text
accepted seed:       runId + ":accepted"
agent_step:          runId + ":agent_step:" + step_id
message_completion:  runId + ":message_completion"
```

Nesses casos, o terminal deixa de gerar uma segunda evento de estado final em `/event/report`; ele é consolidado no único
`message_completion`. Se a camada de precisar persistir o fato terminal original, ele também precisa usar um fact ID independente,
e não compartilhar a chave de idempotência de nível `event_type` com o `agent_step`.

```text
accepted / step finalizado / terminal
        -> SQLite telemetry outbox（outbox_event_id no nível da instância do evento）
        |      |- runId:accepted
        |      |- runId:agent_step:step_id # um por step já consolidado
        |      `- runId:message_completion
        -> /event/report em lote
        -> marcar como delivered após sucesso; retry assíncrono em falha
```

- Vantagens: não bloqueia o scheduler nem o stream do modelo; continua retentável após reinício do Host ou falha de rede; cobre execução sem supervisão.
- Custo: nova lógica de persistência e de limpeza da entrega.
- Limites: não gravar no banco por chunk de streaming; registrar apenas accepted, cada step final e uma completion; detalhes de alta frequência de log usam
  `debug`. Em retry ou reinício do Host, o mesmo `outbox_event_id` não é entregue de novo; `step_id` diferentes precisam ser entregues separadamente.

## 5. Ordem sugerida de implantação e aceitação

1. Já foi adicionado ao contrato de prompt context / live fact do shared `message_source`, `task_trigger` e
   `automation_id` / `off_peak_task_id`; o completion de um schedule run ganhou também `scheduled_at` e
   `schedule_lag_ms`. O chat comum usa `chat` por padrão e mantém a compatibilidade com as chamadas antigas.
2. A execução de tarefa agendada já usa o `runId` como message ID da execução e o `automationId` para associação entre turnos; a futura tarefa off-peak usa
   o `offPeakTaskId` pela mesma interface.
3. Hoje adota-se o Esquema A para validar campos e o payload do evento; se for exigida estatística confiável sem supervisão, adota-se o Esquema C.
4. Completar as seguintes asserções:
   - `CronCreate` só é consolidado como `agent_step(tool_name=CronCreate,
status=success)` depois que o repo de automation grava com sucesso, e carrega um `automation_id` não vazio; falha, cancelamento ou replay duplicado não podem ser contados como criação bem-sucedida;
   - schedule run: o completion e todos os steps do mesmo `inputId` são `scheduled_task/schedule` e carregam o
     `automation_id` correspondente; o `scheduled_at` do completion é igual ao do registro `automation_runs` e
     `schedule_lag_ms >= 0`;
   - Run Now: é `scheduled_task/manual`, ainda usa o mesmo `automation_id` e um `message_id=runId` diferente;
     `scheduled_at` e `schedule_lag_ms` ficam ambos vazios;
   - o step `CronCreate` do turno de criação pode ser feito join com cada execução seguinte pelo mesmo `automation_id`; o inputId do turno de criação
     não pode ser reutilizado no turno de execução;
   - mensagens manuais posteriores na mesma sessão cron: continuam como `chat` e não carregam o `automation_id` desta execução de automation;
   - uma execução contendo reasoning, duas chamadas de ferramenta e generation persiste quatro registros de step distintos
     `runId:agent_step:step_id`; após falha de envio, reinício do Host ou terminal duplicado, os quatro steps
     são reportados exatamente uma vez e o `agent_step_cnt=4` do completion;
   - reconexão de Host/renderer ou terminal duplicado: o `outbox_event_id` da mesma instância de evento não é reportado de novo; não é permitido deduplicar apenas por
     `inputId + event type`;
   - depois que a tarefa off-peak for implementada: deve ser `off_peak_task` e a origem não pode ser inferida por provider, session ID ou workspace path.