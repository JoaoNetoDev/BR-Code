# Atribuição de modelo real e de tokens ao Agent Step

## Escopo

Esta versão corrige apenas o `agent_step` dentro do ciclo de vida de messages já existente:

- o step usa o model/provider/hostname efetivamente solicitados, sem reutilizar os campos compartilhados sobrescritos
  pelo último request da message.
- O usage de um request completo do Provider pertence a um único step, garantindo que os tokens do step sejam
  somáveis.
- O usage de Subagent em primeiro plano é agregado no step da tool `Agent` do pai correspondente.
- O `thought/text` do child em foreground não gera step diretamente; os steps relacionados vêm do ciclo de vida de
  mirror de Agent/tool na session do pai.
- As tools do child em background continuam sendo reportadas uma a uma; além disso, no estado terminal do child é
  reportada uma step `Agent` que carrega o usage acumulado das requests de modelo concluídas daquele child, reutilizando
  o construtor de campos do foreground.
  Não se consome o `thought/text` do child para gerar reasoning/generation.
- Não é adicionado um `message_completion` separado para o child em background.
- O `message_completion` da main ganha `agent_composition`: `main_only` indica que nenhuma resultado de Subagent foi
  consumido nesta rodada, `main_plus_fg` indica que só há resultados de foreground, `main_plus_bg` indica que só há
  resultados de background, e `main_plus_fg_bg` indica que ambos existem.

```text
用户 message M1
  |
  +-- 主请求 R1(model=A)
  |     +-- reasoning step   model=A, tokens=0
  |     `-- generation step  model=A, tokens=usage(R1)
  |
  +-- Agent tool step         model=B, tokens=sum(child requests), agent_id=child
  |     |
  |     +-- child request C1  model=B
  |     `-- mirrored WebFetch model=B, tokens=0, agent_id=child
  |
  `-- 主请求 R2(model=A)
        `-- generation step  model=A, tokens=usage(R2)

background child B
  +-- child thought/text     -> não gera agent_step diretamente
  +-- child tool lifecycle   -> tool_call step, model=B, tokens=0, agent_id=child
  `-- primeiro terminal/stopped  -> Agent step, tokens=sum(child requests já recebidos), default 0 sem usage

main wake round from background notification
  `-- main message_completion -> agent_composition=main_plus_bg
```

## Regras de atribuição

1. Todos os steps gerados pela mesma request congelam a identidade real do modelo daquela request.
2. O usage de uma request completa é escrito apenas no último step de saída de modelo no momento em que a request termina.
3. O reasoning step encerrado mais cedo da mesma request e o step de execução puramente de ferramenta mantêm token `0`.
4. O modelo e o usage acumulado do child em primeiro plano são escritos incrementalmente no step `Agent` do pai
   conforme os request facts chegam; não se pode esperar `SubagentStopped` para fazer o primeiro preenchimento.
5. A tool espelhada do child mantém `tool_call_id` próprio e token `0`; ela usa o mesmo `agent_id` do step `Agent` do
   pai, e o modelo é o modelo real de request do child.
6. O usage do child em background pertence apenas ao seu próprio step `Agent` e não é preenchido retroativamente no
   completion de uma rodada do pai já encerrada.
   A tool do child mantém token `0`; o step `Agent` é acrescentado no primeiro terminal do child ou em
   SubagentStopped, usando o próximo loop_index local do child.
   O tool_call_id do step `Agent` usa `tool_subagent_<agentId>_<parentToolCallId>`; o step de lançamento do Agent já
   existente na sessão pai continua descrevendo apenas a ação de lançamento. O usage acumulado não é um snapshot
   so-far a cada fim de ferramenta.
   Quando um child ativo recebe qualquer um desses estados terminais, mesmo sem usage, o status, o erro e o modelo
   conhecido do step `Agent` são preservados; token/request count seguem o default `0` do foreground, sem fabricar
   requestId ou escopo de usage.
   Isso alinha o snapshot de usage já conhecido no fechamento anormal do foreground, sem resumir em duplicidade e sem
   complementar o usage recebido após o fechamento.
7. Os fatos de tool/permission do background mirror devem carregar `background=true` e são filtrados antes do telemetry
   do prompt da main, evitando que a mesma tool do child ou espera de permission seja contada duas vezes na main.
8. O report do child em background usa parent session, `sourceCommandId`, `parentToolCallId` e `childSessionId` para
   estabelecer a atribuição; quando faltam campos de atribuição necessários, o report não é inferido.
9. `message_completion.agent_composition` descreve apenas os resultados já consumidos pelo main turn atual: o child em
   foreground é marcado quando o resultado é fechado; a notificação de background é marcada quando é dequeued em um
   wake independente, ou quando realmente conflui em um limite legal do active-loop. Falhas e cancelamentos preservam
   os fatos já consumidos; não pode ser marcado só porque o child foi spawned/stopped.

## Cadeia de fatos e atribuição

```text
model_request_started/completed + ModelComplete(usage)
          |
          v
normalizer: requestId + model identity + usage
          |
          +-- main session  ------> step de saída de modelo atual
          |
          `-- child session ------> acumulado por childSessionId
                                      |
SubagentSpawned(childSessionId, parentToolCallId, agentId)
                                      |
                                      +--> parent Agent step
                                      `--> mirrored child tool
```

Fontes autoritativas dos campos:

| Campo            | Fonte do fato                                                                 |
| ---------------- | ---------------------------------------------------------------------------- |
| `model_name`     | `ModelNetworkStatus.modelId`, mantendo a codificação de report `<provider>/<model>` |
| `model_provider` | `ModelNetworkStatus.providerId`                                              |
| `provider_name`  | `ModelNetworkStatus.baseURL` recortada para hostname                        |
| token usage      | `ModelComplete.usage` adjacente àquela request concluída                     |
| atribuição do child | `SubagentSpawned.childSessionId + parentToolCallId + agentId`              |

`ModelComplete` não tem requestId próprio, então o normalizer só o associa à request concluída mais recente dentro da
mesma session e no mesmo `querySource`; quando não é possível associar, ele ainda pode servir ao total de message
completion, mas não pode fabricar a atribuição de modelo do step.

## Campos de `agent_step`

Manter os campos existentes e completar com:

| Campo                       | Semântica                                                                                                                   |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `model_request_id`         | a request real de modelo à qual o usage pertence; vazio em steps que não são donos de token                             |
| `model_request_count`      | número de requests reais agregados pelo step atual; `1` para uma main Agent request comum, pode ser maior que `1` no step de Agent de subagent |
| `token_usage_scope`        | `model_request` para uma request única do main Agent; `subagent_requests` para o agregado do ciclo de vida de child foreground/background; vazio caso contrário |
| `input_tokens`             | input do request usage                                                                                                      |
| `output_tokens`            | output do request usage                                                                                                     |
| `reasoning_tokens`         | reasoning do request usage                                                                                                  |
| `cached_tokens`            | cache read do request usage, mantendo o nome de campo antigo                                                                 |
| `cache_write_input_tokens` | cache write do request usage                                                                                                |
| `total_tokens`             | total do request usage                                                                                                      |
| `agent_id`                 | identificador de agent estável do Subagent; o step `Agent` do pai, a tool mirror do foreground e a tool do child em background usam o próprio valor de child |
| `agent_role`               | papel de origem do step de Subagent: `foreground subagent` ou `background subagent`; não é preenchido no step de agent da main |
| `tool_call_id`             | o mirror do foreground usa o scoped ID já gerado pelo Runtime; o child em background usa `tool_subagent_<agentId>_<childToolCallId>` |

## `message_completion.agent_composition`

Este campo representa a composição de Agents do main turn atual:

| Valor             | Significado                                                                  |
| ----------------- | ---------------------------------------------------------------------------- |
| `main_only`       | nenhum resultado de Subagent de foreground ou background                    |
| `main_plus_fg`    | somente resultados de Subagent de foreground                                |
| `main_plus_bg`    | somente resultados de Subagent de background, e a notificação já entrou no main turn atual |
| `main_plus_fg_bg` | existem resultados de foreground e de background                             |

A conclusão do child em background por si só não marca este campo; ele só passa a contar na rodada correspondente
depois que sua notificação sintetizada é dequeued e inicia um main turn independente, ou depois de ser realmente
consumida no active-loop atual. Notificações de Bash não contam como resultado de Subagent.

A religação do Todo103 preserva o fato de modelo de request plano atual e a fronteira de execução do ModelSelection; a
estatística não lê a configuração de Provider para adivinhar o modelo nem chama a resolução de seleção efetiva para
substituir uma segunda vez um modelo já executado. O artefato de E2E submitted na origem é apenas evidência histórica e
não indica que o branch de integração já foi reverificado.

Todos os campos numéricos continuam usando codificação em string. Um step sem usage real precisa escrever `0` e nunca
estimar.

## Temporização e anomalias

- request status, fato de usage e step são todos deduplicados por `eventId/requestId`, e a reprodução não pode acumular
  em duplicidade.
- A identidade do modelo é congelada na criação do step; requests posteriores do main Agent ou do child não podem
  sobrescrever steps históricos.
- Quando o modelo principal devolve `tool_use` diretamente e não há corpo, um step de generation de duração zero é
  acrescentado para receber o usage da main request; o usage do modelo principal não pode ser misturado nos steps de
  tool seguintes.

```text
child request started(B) -> child usage -> parent Agent failed -> SubagentStopped
          |                    |
          `-------- preenchimento incremental do parent Agent(model=B, usage=child) -------->
```

- Sucesso, falha, activity timeout e abort do runner de foreground emitem uniformemente `SubagentStopped`; a tool externa
  `Agent` tem um timeout próprio. Quando os dois estados terminais reais chegarem, o fechamento usa o usage de child já
  conhecido, sem adicionar um novo grace timer do próprio telemetry. Depois que o `turn.terminal` do pai chega, é
  obrigatório reportar primeiro os `agent_step` restantes e, em seguida, o `message_completion`.

```text
SubagentStopped ─┐
                 ├─ first terminal wins -> Agent step -> remaining normal steps -> message_completion
Agent timeout ───┘
```

- `sendQueuedNow` encerra primeiro o turn atual e então inicia o próximo turn com o `sourceCommandId` original do item
  da fila. Se o terminal da message anterior está aguardando o fechamento de um Subagent em primeiro plano, o
  `turn.started` da message seguinte e os facts posteriores devem ser armazenados temporariamente por command; a message
  seguinte só pode ser ativada depois que a anterior completa `agent_step -> message_completion`. Essa barreira existe
  apenas na janela real de terminal diferido e não pode virar um serializador genérico de messages.

```text
message A turn.terminal -> wait SubagentStopped -> A agent_step -> A message_completion
                                 |
message B turn.started/facts ----+---- buffer ----------> activate/replay B
```

- Assim que o child emitiu um `model_request_started` real, o step da tool Agent do pai usa o modelo do child; mesmo que
  a request não tenha usage, não é possível voltar ao modelo da message do pai. Falha ou cancelamento preserva apenas o
  usage das requests concluídas antes do estado terminal, sem estimativas.
- Após `SubagentStopped`, a associação do child com o fechamento da message do pai é mantida, para tratar estados
  terminais de tools espelhadas que chegam atrasados.
- reload/recuperação do renderer não fabrica eventos de telemetria históricos, mantendo o limite live-only atual.
- desktop continuous e web remote replayable compartilham o schema de fatos sem corpo; as regras de produto atuais ainda
  permitem que apenas um attachment desktop continuous confiável consuma o telemetry do workspace, e a reprodução de
  recuperação não reporta fatos faltantes.
- O `model.request.status(started)` do child em background congela o modelo da tool; o `usage.delta` é acumulado após
  deduplicação por requestId. `turn.terminal` e `SubagentStopped` compartilham um fechamento de resumo Agent único, que
  usa o usage recebido até o primeiro fechamento; sem usage, ele ainda reporta, com token default `0`. Parar não
  significa que o child já saiu, portanto, após o fechamento por stopped, apenas as tools já iniciadas e seus estados de
  espera por permissão são mantidos, para que os estados terminais atrasados sejam reportados um a um; a limpeza ocorre
  quando todas as tools são fechadas ou quando o terminal do child chega, e não mais ao adivinhar o momento da limpeza
  com base na existência de requests/usage de modelo.
- Apenas eventos de Runtime existentes são consumidos: o normalizer mantém o `SubagentStopped.error` existente como
  `errorMessage`.
  Nenhum evento de Runtime novo é adicionado, e execução, cancelamento, notificação, main wake ou comportamento de
  foreground não mudam; nenhum timer é acrescentado e nenhum completion de child é completado. O usage que chega tarde
  após um fechamento anormal não é contado no resumo já emitido e não se promete consumo completo da cauda.

## Main turn ID

Turns de usuário comuns e o wake de notificação de background independente compartilham o gerador de UUID v7. Cada wake
batch gera seu próprio `inputId` novo, reportado ao longo de `TurnStarted.inputId -> sourceCommandId -> message_id`, e
os steps/completion da mesma rodada compartilham esse valor sem reutilizar o ID da rodada original do usuário. Os IDs
sintéticos `msg_*` persistidos mantêm sua função original e não podem mais ser usados pelo normalizer como telemetry
inputId. O consumo no active-loop não cria uma nova rodada nem um novo ID de telemetry.

## Verificação

Cada novo draft do E2E do ciclo de vida de background precisa selecionar explicitamente o acesso total (yolo) antes do
commit; definir uma única vez no início da suite não substitui a pré-condição dos drafts seguintes. O log de execução do
BG13 já provou que o build padrão faz o child Bash e afins passarem por aprovação, e não se pode interpretar a espera de
permissão como notificação perdida ou perda de estatística; a lógica de aprovação do produto não muda por causa disso.

Cobrir no mínimo:

1. reasoning + generation de uma única request: os dois steps têm o modelo real da request e o usage aparece apenas uma
   vez.
2. Modelo principal A → Subagent de primeiro plano com modelo B → modelo principal A: os modelos e tokens dos três
   blocos de steps não se sobrescrevem.
3. Usage da mesma request chegando repetido: é acumulado apenas uma vez.
4. Subagent em background: o thought/text do child não gera step; o ciclo de vida de tools do child gera tool steps no
   mesmo formato do mirror de foreground, com token `0`. O step `Agent` após o terminal do child possui o usage
   acumulado de forma exclusiva, com o `agent_id` e o `agent_role` do child; o report HTTP final verifica a contagem de
   requests, o total de tokens e a ordem.
5. O hostname do provider reporta apenas o hostname, sem vazar path/query/credentials da URL.
6. Child cancelado com o step `Agent` do pai falhando antes: o usage já concluído do child e o modelo real são
   preservados.
7. WebFetch espelhado: tem o mesmo `agent_id` do step `Agent` do pai, o modelo do child e token `0`.
8. Child em background ativo sem usage: o terminal ou o stopped de sucesso/falha/cancelamento ainda produz um step Agent
   de token zero; diferenciado de um usage totalmente zero received em request count/scope. Cobre apenas stopped, com e
   sem usage, as duas ordens de estados terminais, estados terminais duplicados e tools que chegam atrasadas após o
   stopped; o resumo é reportado apenas uma vez, o texto original do erro é preservado, nenhum `message_completion`
   separado é produzido, o usage atrasado não é complementarizado e o término de tools já iniciadas não se perde na
   limpeza.
9. O `loop_index` de múltiplos tool steps do child em background incrementa dentro do child, e children paralelos começam
   de forma independente em `1`.
10. Reasoning, generation, tool_call comuns e o step `Agent` de primeiro plano permanecem todos na mesma message, e
    `agent_step_cnt` corresponde à quantidade realmente reportada.
11. `message_completion.duration_ms` mantém a semântica de relógio de parede visível ao usuário, isto é
    `turn terminal - sendTime`, cobrindo naturalmente o main Agent da rodada, o Subagent de primeiro plano, a espera
    por tools e a geração final.
12. `message_completion.agent_composition` é calculado apenas na geração do main completion e não altera a quantidade de
    `agent_step` nem o report independente do child em background.
13. Ao clicar em "enviar agora" na fila enquanto a message anterior aguarda o fechamento do Subagent de primeiro plano: a
    message anterior conclui primeiro com seu próprio `request_time`, sua duration real de relógio de parede e sua
    contagem de steps; em seguida a message seguinte reporta steps e completion de forma independente usando o
    `sourceCommandId` original.

## Retrospectiva (2026-09-14): a terceira origem — subagentes de workflow dinâmico

As regras estão em `apps/zcode-cli/packages/dynamic-workflow/docs/execution-engine.md`, em "Token telemetry for
subagents". As diferenças em relação às duas primeiras origens são apenas três:

- o fato de registro não é `subagent.lifecycle`, e sim o `workflow.lifecycle` derivado do
  `DynamicWorkflowRunProgress` da sessão pai (`actor-spawned` / `run-settled`); a chave de atribuição é
  `runId + childSessionId`, e o `message_id` é o `run-launched.inputId` do run (não o de nenhuma chamada da tool
  `Agent`).
- o estado terminal é a **execução do run** e não o próprio `turn.terminal` da subsessão: uma sessão de subagente pode
  atender a vários asks, e cada ask é um turn; o step de resumo é emitido apenas em `run-settled`, uma vez para cada
  subagente daquele run.
- `agent_role = "workflow subagent"`, com `workflow_run_id` / `child_session_id` / `workflow_tool_call_id`
  adicionais; o `token_usage_scope` continua reaproveitando `subagent_requests`.

As demais regras (token `0` nos steps de tool, deduplicação por requestId, nada de complemento após o estado terminal,
live-only, e resumo com valores zero mesmo sem usage) são adotadas literalmente.