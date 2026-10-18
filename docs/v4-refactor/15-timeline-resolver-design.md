# Design do Conversation Timeline Resolver

> **Estado: já arbitrado e implementado por [16-timeline-authority-plan.md](./16-timeline-authority-plan.md).** Este documento mantém
> a análise de causa raiz, as estruturas alternativas e as recomendações de migração; a implementação atual adota um canonical fact normalizer, âncoras persistentes,
> endereçamento por `entityId/productTurnId`, um ledger de `session_input` e um timeline placement restrito, e não implementou literalmente todas as ideias genéricas de graph/resolver deste texto. Os fatos atuais são os da implementação do 16, das especificações atuais 02/07 e do código.

## Estado

- Objetivo: explicar a causa raiz dos problemas de mensagem fora de ordem, de mensagens “engolidas” e de posição instável no timeline que permanecem após o refactor da conversation do v4, e apresentar um design de estrutura de ordenação autoritativa e implementável.
- Escopo: transcript visível da conversation session, queue drain, compact timeline, goal verify timeline, model change timeline, fork timeline, múltiplos segmentos de assistant e o wake de conclusão de Bash/subagent em background.
- Não objetivo: este documento não modifica a implementação diretamente, não define o estilo final de UI e não substitui o catálogo de cases E2E. Antes da implementação posterior, a semântica aceita ainda precisa ser reescrita no catálogo de cases e na coverage matrix.

## Contexto e problema

Um dos objetivos do refactor v4 era convergir o estado da conversation para uma projeção virtual no CLI, para que a UI não tivesse mais que adivinhar o estado do runtime. Mas a projeção atual ainda se parece mais com um gerador de rows “gera uma row quando o evento chega” do que com um timeline resolver completo. O resultado é que, embora a UI esteja próxima de uma renderização sem pensar, as rows recebidas já contêm atribuição e ordenação erradas.

As 4 ordens que hoje se confundem mais facilmente:

```text
eventSeq
  事件到达 / 持久化顺序

runtimeTurnId
  runtime loop、trace、provider roundtrip 归属

productTurnId
  用户可见的逻辑轮次，queue drain、model-only continuation、background wake 都可能创建新轮次

visualPlacement
  UI timeline 上应该出现的位置，例如 assistant work 内部、turn tail boundary、下一轮之前的 light boundary
```

Essas 4 ordens não podem compartilhar um mesmo `turnId`, `rowId` ou append order. `event.turnId` é um fato de runtime e não equivale ao container de turn da UI; `row.appended` é uma otimização de transporte e não equivale à autoridade de ordenação visual.

## Evidências da semântica atual

Os docs atuais já contêm alguns arbitramentos importantes mostrando que o timeline não pode mais ser tratado com um template fixo de turn:

- O `role=user` de uma synthetic user message indica apenas o papel físico provider/store, e não entrada do usuário na UI. fork, rewind, goal-continuation, goal_state_change, background_task, subagent e compact summary precisam ser classificados por projection policy.
- O fork só pode atingir uma assistant message estável; a child copia o transcript estável anterior ao ponto de fork e a configuração da sessão, mas não copia a queue do pai, o bash/subagent live em background, um resultado de background pendente nem a inbox de continuation.
- O mesmo turn lógico pode ter vários assistant text row; a ação de fork/retry só pode aparecer na última assistant row em estado completed.
- `context_compaction` é atividade de assistant e pode aparecer dentro do assistant work; `session_fork`, `goal_verification` e model change são turn boundary e não entram no histórico de assistant.
- Agent/Bash em background pode permitir que o turn pai já esteja completed e, após a conclusão em background, acordar o main agent por `<task-notification>` para continuar o processamento. Esse wake é um trigger model-only e não é exibido como bolha de usuário.

Esses arbitramentos apontam para uma estrutura: é preciso primeiro estabelecer uma typed semantic entity e só então deixar o resolver calcular o product turn e o visual placement.

## Por que mensagens são “engolidas”

A maioria dos casos de “mensagem engolida” não é o fato subjacente realmente inexistente, mas rows da UI após a projeção sofrendo de agrupamento errado, sobrescrita ou ocultação.

```text
Case A: queue drain 仍落在同一个 runtime turn

T1 user Q1
T1 assistant A1
T1 drained user Q2
T1 assistant A2

如果 UI 只把同 turn 最后一条 assistant 当正文，A1 会被折进 history，
用户感觉上一轮 assistant 没渲染。
```

```text
Case B: queue item 被移除，但没有稳定 userInput entity 承接

Q[Q2] -> remove queue item
没有 userInput(sourceCommandId=Q2)

用户看到 queue 消失，transcript 也没有。
```

```text
Case C: boundary marker 没有 anchor/placement

assistant A1 final
goalVerify started event 晚到或 trace turnId 不等于 A1 turnId

如果只能 append 到尾部，marker 会落到错误轮次后面。
```

```text
Case D: 多个 assistant segment 被当作一个 latest assistant 模板

assistant A1.1 before tool
tool result
assistant A1.2 final

如果投影只保留 latest，或 fork target 绑定早段 raw assistant，
就会丢最终回复、工具结果或文件引用。
```

A causa raiz não é a UI faltar um `if`, e sim a projeção do CLI não ter concluído antes a conservação semântica e a ordenação autoritativa.

## Objetivos de design

1. A UI consome somente o timeline autoritativo já resolvido e não infere mais a estrutura a partir de `turnId + latestAssistantTextRow`.
2. Cada entrada de usuário visível, segment de assistant, ciclo de vida de compact, ciclo de vida de goal verify, marker de fork e wake de background têm uma identidade de negócio estável.
3. `eventSeq` serve apenas como ordem de entrada de fatos, e não como autoridade de ordenação visual.
4. `runtimeTurnId` expressa apenas a atribuição de trace de runtime e não decide diretamente o product turn.
5. Todo placement não-caudal é tratado pelo resolver do CLI; quando o delta append-only não consegue expressá-lo, envia-se um snapshot resync.
6. desktop continuous e web remote replayable compartilham a mesma semântica de snapshot autoritativa, mas o delivery profile afeta apenas os frames intermediários e não muda o timeline final.

## Princípios de camadas

A estratificação do timeline segue três pontos:

1. **A ordem autoritativa é a aggregate sequence dentro da sessão**, e não timestamp, ordem de append de row ou posição do array da UI.
2. **O ciclo de vida da entrada é independente da execução do modelo**. O prompt é primeiro admitted de forma durable e só depois é promovido a transcript message em um safe boundary; a queue não depende da memória do renderer para provar que existiu.
3. **O banco guarda fatos de domínio, e não layout de UI**. A projeção de transcript é um fato de domínio, e não um schema de UI do tipo “qual é o número do bubble/qual é o card/qual é a faixa”.

A camada de compatibilidade que mescla message/part por id pertence apenas ao legacy client merge e não é a autoridade de ordenação. O ZCode adota `event_sequence + input ledger + domain projection`, em vez de continuar tratando as UI rows como fonte de fatos.

## Arquitetura geral

```text
Raw Event Journal / Persisted Facts
  SessionEvent, message, part, target entry, task notification
        |
        v
Event Normalizer
  把 provider/runtime/legacy 数据归一为语义事件
        |
        v
Semantic Ledger
  维护 typed entities，不直接输出 UI row
        |
        v
Timeline Constraint Graph
  用 cause / anchor / lifecycle / copy / wake 建边
        |
        v
Timeline Resolver
  计算 productTurnId、lane、placement、orderKey、visibility
        |
        v
Materializer
  生成 ResolvedTimelineSnapshot，兼容期可再降级为 rows.window
        |
        v
UI
  无脑渲染 resolved snapshot，不再猜 turn tail 或 hidden message
```

## Campos físicos mínimos e semântica de domínio

Os `sourceCommandId`, `anchorMessageId`, `lifecycleKey`, `visibility` etc. que aparecem adiante não precisam necessariamente se tornar novas colunas físicas. A forma de persistência mais recomendada é poucos campos físicos estáveis mais refs tipadas em JSON:

```text
session_event / message / part
  id
  session_id
  sequence
  kind/type
  data JSON
```

A semântica de domínio é guardada claramente no `data JSON`:

```json
{
  "refs": {
    "parentMessageId": "msg_user_1",
    "sourceCommandId": "cmd_queue_2",
    "anchorMessageId": "msg_assistant_1",
    "originSessionId": "sess_parent",
    "originMessageId": "msg_parent_assistant"
  },
  "lifecycle": {
    "state": "promoted"
  },
  "visibility": {
    "ui": "visible",
    "provider": "hidden"
  }
}
```

Não é possível comprimir essa semântica em um único `pid`. O `pid` só consegue expressar a relação pai-filho em árvore, mas o conversation timeline tem pelo menos as seguintes relações ortogonais simultâneas:

```text
id
  我是谁

sequence
  我在当前 session 事实流里的权威顺序

parent / response-to
  assistant 回应哪个 user message

cause
  我由哪个 command / queue item / background wake 触发

anchor
  marker 显示上应该锚到哪个 message 或 turn 附近

lifecycle
  command 是 admitted、promoted、completed 还是 failed

origin
  fork/copy 后来自哪个原 session / 原 message

visibility
  UI 可见、仅 provider 可见，还是只影响状态
```

Se se tentar reutilizar à força um único `pid`, o campo passa a significar `response-to`, `display-after`, `caused-by`, `fork-from` ou `compact-before` conforme o cenário. O número de campos diminui, mas a semântica é contaminada e o resolver continua obrigado a adivinhar.

## Modelo central de entidades

O Semantic Ledger não é centrado em UI row, e sim em entidade de negócio.

```ts
interface TimelineEntityBase {
  entityId: string;
  kind: TimelineEntityKind;
  lifecycleKey?: string;
  cause?: TimelineCause;
  anchor?: TimelineAnchor;
  visibility: "visible" | "modelOnly" | "stateOnly";
  lane: TimelineLane;
  productTurnId?: string;
  orderKey?: TimelineOrderKey;
  sourceCommandId?: string;
  copyPolicy: CopyPolicy;
}
```

Tipos de entidade sugeridos:

| Entity | Descrição |
| --- | --- |
| `UserIntent` | entrada real do usuário, entrada do usuário após queue drain, model-only continuation e wake de notificação de background |
| `ProductTurn` | container de turno lógico visível ao usuário ou model-only |
| `AssistantSegment` | uma saída com role de assistant. Um product turn pode ter vários segments |
| `WorkActivity` | tool, reasoning, subagent, compact etc., atividades dentro do assistant work |
| `TimelineBoundary` | goalVerify, fork, modelChange etc., fronteiras de turno |
| `QueueItem` | intenção futura do usuário, que não é transcript |
| `BackgroundWork` | trabalho de runtime detached de Bash/subagent, pertencente à sessão pai e não à queue |

## Lane e Placement

O timeline não tem mais apenas duas categorias, “mensagem do usuário” e “mensagem do assistant”. O resolver primeiro atribui uma lane a cada entidade:

```text
queue
  QueueItem，只显示在 queue UI，不进入 transcript

trigger
  visible UserIntent 或 modelOnly UserIntent，创建 product turn

assistantWork
  assistant text / reasoning / tool / subagent / compact activity

turnTailBoundary
  goalVerify / fork，锚定某个 logical turn 的结尾

lightBoundary
  modelChange，作为轻量轮次边界

detachedState
  BackgroundWork 状态，通常由 summary/control surface 展示

stateOnly
  只影响状态，不进入 timeline rows
```

Ranks de lane típicos:

```text
0 lightBoundaryBeforeTurn
1 trigger
2 assistantWork
3 turnTailBoundary
4 detachedState
5 stateOnly
```

`stateOnly` não pode entrar em `rows.window`. Se um marker opta por não ser renderizado, ele não deveria influenciar a rolagem virtual, o agrupamento de turnos ou o colapso de histórico como uma hidden row.

## Ordenação autoritativa

O resolver gera um `orderKey` determinístico:

```ts
interface TimelineOrderKey {
  branchEpoch: number;
  productTurnOrdinal: number;
  laneRank: number;
  entityOrdinal: number;
  lifecycleOrdinal: number;
}
```

A origem da ordenação não é timestamp nem ordem de append de row, e sim o grafo de restrições:

```text
cause edge
  queue item -> drained UserIntent
  background work completed -> background wake UserIntent

anchor edge
  AssistantSegment A1 -> goalVerify(targetId, iteration)
  AssistantSegment A1 -> forkCreated/forkNotice

lifecycle edge
  compact started -> compact completed/failed/interrupted
  goalVerify started -> goalVerify completed/cancelled

turn edge
  ProductTurn trigger -> AssistantSegment / WorkActivity

copy edge
  fork source assistant -> child copied graph
```

O resolver faz um deterministic topological placement sobre o grafo de restrições. Entidades na mesma posição são ordenadas de forma estável por `entityOrdinal`, sem depender da ordem lexicográfica de ids do banco.

## Regras semânticas-chave

### Queue Drain

A queue é uma intenção futura do usuário e não fica presa ao runtime turn atual. Depois do drain, é preciso criar um novo product turn.

```text
T1
  user Q1
  assistant A1 final

Q[Q2]

T2
  user Q2
  assistant A2
```

Se a implementação de runtime ainda concluir o roundtrip dentro do mesmo activeTurn, a projeção também precisa extrair um novo `productTurnId`. `runtimeTurnId` não pode virar diretamente o turn da UI.

### Assistant em múltiplos segmentos

Um product turn pode conter vários segments de assistant:

```text
T1
  trigger: user Q1
  assistantWork:
    AssistantSegment A1.1
    ToolCall Bash
    ToolResult
    AssistantSegment A1.2 final
```

Todos os segments precisam ser mantidos. A UI pode colapsar segmentos iniciais, mas o resolver não pode sobrescrevê-los. fork/retry/action target fica pendurado apenas no último segment de assistant concluído de forma estável.

### Compact

Compact é atividade de assistant, e não uma bolha de usuário nem um turn boundary obrigatório.

```text
T1
  user Q1
  assistantWork:
    assistant before compact
    compact running
    compact success
    assistant after compact
```

O comando manual `/compact` é uma entrada de comando e não é exibido como uma user query comum. Se não houver assistant seguinte, o compact pode ser exibido como uma timeline fraca independente, mas ainda assim não é um turn de usuário vazio.

### Goal Verify

Goal verify é um turn tail boundary. A identidade é principalmente `targetId + goalIteration`, e `verificationId` só pode servir como alias de uma tentativa individual.

```text
T1
  user Q1
  assistant A1 final

BM goalVerify(target-1, iteration-1) running -> notSatisfied

T2
  trigger: modelOnly goal continuation
  assistant A2 final

BM goalVerify(target-1, iteration-2) running -> pass
```

Goal verify precisa ter âncora:

```text
anchor = anchorAssistantMessageId || anchorTurnId || explicit fallback placement
```

Se o turn apontado pela âncora já estiver no meio da janela e o delta atual só puder fazer append, não é possível forçar o append ao final: deve-se enviar um snapshot resync.

### Model Change

Model change é uma light boundary, e não assistant work. O usuário apenas alternar o modelo do rascunho não contamina o transcript; a boundary só é gerada quando o próximo turno aceito realmente usa o novo modelo.

```text
T1 assistant A1

BM modelChange(old -> new)

T2 user Q2
T2 assistant A2 using new model
```

A primeira vez que um modelo é usado não constitui model change. Se o produto decidir que modelChange não é visível no transcript, ele deve ser `stateOnly` ou um banner state separado e não deve entrar em `rows.window`.

### Fork

O fork deve ser um graph cut, e não uma row de DOM nem o assistant latest atual.

```text
parent:
T1 user Q1
T1 assistant A1 final  <-- fork source
BM goalVerify #1
Q[pending]
BG[background running]
T2 active running

child:
copy graph <= A1 final
copy session config
copy eligible goal state / verifier entries
do not copy queue
do not copy background work
do not copy continuation inbox
do not copy active run fields
```

O parent session acrescenta:

```text
BM forkCreated(childSessionId, anchor=A1)
```

A child session acrescenta:

```text
BM forkNotice(parentSessionId, anchor=A1-copy)
```

O goal fork state precisa copiar o target e a timeline de verifier anteriores ao ponto de fork, reescrevendo o `anchorAssistantMessageId` do verifier copiado para o id de message da child. Não se pode recriar um target vazio com `setTarget` na camada bootstrap/protocol.

O núcleo do fork não é apenas copiar, e sim **copy by value + provenance**:

```text
parent session S1
  seq 1  U1
  seq 2  A1
  seq 3  U2
  seq 4  A2  <-- fork point

child session S2
  seq 1  fork.created {
           originSessionId: S1,
           originMessageId: A2,
           originSequence: 4
         }
  seq 2  U1' { originMessageId: U1 }
  seq 3  A1' { originMessageId: A1 }
  seq 4  U2' { originMessageId: U2 }
  seq 5  A2' { originMessageId: A2 }
```

Portanto, depois do fork, cada message copiada tem duas identidades:

```text
local identity
  child session 内的新 id / 新 sequence
  用于排序、渲染、继续对话、anchor 解析

origin provenance
  parent session / parent message / parent sequence
  只用于追溯来源、展示来源、debug，不参与 child 的 UI placement
```

Todas as referências locais copiadas precisam ser remapeadas para os ids locais da child session:

```text
parent:
  S1.A2.parentMessageId = S1.U2

child:
  S2.A2'.parentMessageId = S2.U2'
  S2.A2'.originMessageId = S1.A2

错误:
  S2.A2'.parentMessageId = S1.U2
```

Essa regra também vale para `anchorMessageId`, `sourceCommandId`, a âncora de goal verifier e a âncora de compact. Se o objeto referenciado não foi copiado, ele não pode continuar como âncora local da child e só pode ser rebaixado a `originRef` ou a um diagnostics fallback.

### Background Bash / Subagent

Background work é trabalho de runtime detached, e não queue nem mensagem de usuário comum.

```text
T1
  user Q1
  assistantWork:
    Agent(run_in_background=true)
    tool result: backgrounded
    assistant A1 final
  completed

BackgroundWork BG1 running

BG1 completed
  -> BackgroundWakeCommand

T2
  trigger: modelOnly backgroundNotification(BG1)
  visible user bubble: none
  assistantWork:
    assistant A2 handles <task-notification>
```

Decisão do usuário: a notificação de background não precisa ser exibida como bolha de usuário. Aqui ela é modelada como um `UserIntent` com `visibility=modelOnly`, que pode criar um product turn mas não gera uma visible user row. Se exibir adicionalmente uma system boundary leve está fora do design desta rodada; por padrão ela não entra nas transcript rows.

A conclusão de background continua sendo consumida pela command queue do runtime e não adiciona um `executeTurn` concorrente na mesma sessão. Se o loop ativo ainda tiver um roundtrip legítimo, a notificação pode convergir; quando ocioso, a continuação é serializada por um wake model-only.

## Snapshot Contract

O consumo ideal pela UI final é um snapshot estruturado, e não rows achatados:

```ts
interface ResolvedTimelineSnapshot {
  revision: number;
  branchEpoch: number;
  nodes: TimelineNode[];
  queue: QueueState;
  backgroundWorks: BackgroundWorkSummary[];
  controls: SessionActionAvailability;
}

type TimelineNode =
  | ResolvedTurnNode
  | ResolvedBoundaryNode
  | ResolvedMaintenanceNode;

interface ResolvedTurnNode {
  productTurnId: string;
  trigger?: ResolvedTrigger;
  assistantSegments: ResolvedAssistantSegment[];
  workActivities: ResolvedWorkActivity[];
  tailBoundaries: ResolvedBoundaryNode[];
}
```

Durante o período de compatibilidade, ainda se pode materializar em `rows.window`, mas as rows precisam carregar o resultado do resolver:

```text
entityId
productTurnId
lane
placement
anchor
orderKey
visibility
lifecycleKey
sourceCommandId
```

A UI pode reutilizar temporariamente os componentes existentes, mas deixa de inferir a estrutura lógica a partir de `turnId + latestAssistantTextRow`.

## Delta e Resync

O delta append-only existente pode ser mantido, mas a semântica precisa ser apertada:

```text
尾部新增
  row.appended

生命周期状态更新
  row.upserted

分支删除
  row.removed

文本增量
  row.delta

非尾部插入 / 重排 / late placement 修正
  snapshot.resync
```

Não se deve deixar o cliente simular movimentação com `row.upserted`, porque o apply atual só substitui por rowId e não muda a posição. Assim que o resolver perceber que o `orderKey` de uma entidade visível está no meio da janela já enviada, ele deve enviar um snapshot resync ou entrar em um novo snapshot epoch.

## Invariantes de conservação

Depois de gerar cada snapshot, o resolver precisa rodar as verificações de conservação. Em caso de falha, não se deve enviar um snapshot quebrado para a UI: é preciso registrar o error e expor o diagnóstico em ambiente de desenvolvimento.

```text
输入守恒
  每个 visible inputId 必须在 QueueItem 或 UserIntent row 中二选一。
  不能两边都没有，不能两边都有。

assistant 守恒
  每个 assistantMessageId 必须对应一个 AssistantSegment。
  后来的 assistant 不能覆盖前一个 assistant。

compact 守恒
  每个 compact operationId/inputId 对应一个 WorkActivity。
  started/success/failed/interrupted 更新同一实体。

goal verify 守恒
  同一 targetId + iteration 只有一个 boundary entity。
  verificationId 是 alias，不是 UI 主身份。

fork 守恒
  fork source 必须是稳定 assistant segment。
  child 不能包含 parent queue、live background work、pending background result、continuation inbox、active run fields。

background 守恒
  每个 completed background notification 要么 pending wake，要么已生成 modelOnly wake turn。
  不生成 visible user bubble。

渲染守恒
  visible entity 必须有 renderer。
  stateOnly entity 不得进入 timeline rows。
  hidden/modelOnly trigger 不得影响 visible user turn count。
```

## Estrutura real de persistência

Após uma inspeção somente leitura dos dados persistidos reais da máquina em 2026-07-07, confirmou-se que os dados relacionados a conversation não têm uma única fonte de fato em banco, e sim três camadas:

```text
UI v4 virtual projection
  <- zcode protocol snapshot/live
    <- CLI transcript store: ~/.zcode/cli/db/db.sqlite
       - session
       - message(id, session_id, time_created, time_updated, data JSON, sequence)
       - part(id, message_id, session_id, time_created, time_updated, data JSON, sequence)
       - session_entry(...)

App metadata store: ~/Library/Application Support/ai.z.zcode/zcode.db
  - sessions / workspaces / follow_up_queue / session_notifications
  - 不存完整 transcript

Task list/search index: ~/.zcode/v2/tasks-index.sqlite
  - tasks / task_groups / searchable_text
  - 只服务列表、分组、搜索，不应作为消息顺序真相源
```

O DB real do CLI é o banco autoritativo do corpo da sessão. A escala observada nesta inspeção:

| Store | Count / Schema fact |
| --- | --- |
| `session` | 2.989 rows |
| `message` | 26.942 rows, `data` em JSON, coluna física já tem `sequence` |
| `part` | 96.112 rows, `data` em JSON, coluna física já tem `sequence` |
| `session_entry` | 1.402 rows, principalmente `target_completion_verification` e `runtime/bash_shell_selection` |
| app `follow_up_queue` | atualmente 0 rows, estrutura `session_id + position + payload`, não é fonte de ordem do transcript |

A ordem de leitura atual do repository de `message` / `part` é:

```text
message:
  order by sequence is null, sequence, time_created, rowid

part:
  order by message_id, sequence is null, sequence, time_created, id
```

Isso mostra que o código já trata `sequence` como o novo campo de ordenação principal dos dados e preserva um fallback para dados sem `sequence`.

## Riscos expostos pelos dados reais

O cenário atual não é “o banco não tem nenhum campo de ordenação”, e sim que tanto o campo de ordenação quanto as âncoras semânticas não são confiáveis o bastante.

```text
0014_message_part_sequence migration
  applied at 2026-06-29 06:50:36 EDT

NULL sequence rows observed after migration
  message.sequence null: 1,690 rows
  part.sequence null:    5,933 rows
  affected sessions:       331
  range: 2026-06-29 07:50:30 EDT -> 2026-07-07 09:01:35 EDT
```

Portanto, `sequence` NULL não é apenas uma herança de dados antigos. Ainda há, no presente ou no passado recente, escritas, importações, scripts de reparo, raw SQL ou outros caminhos não localizados que contornaram a forma unificada de escrita `saveMessage` / `savePart`, ou escreveram direto por SQL antigo. O caminho principal de fork já verificado, quando passa por `persistMessage` / `persistPart` / pelo session-store repository, não deve mais ser o suspeito padrão de NULL sequence; é preciso continuar usando logs e invariantes do DB para achar os caminhos reais que contornam.

A cobertura dos campos semânticos também é claramente insuficiente:

| Field / fact | Count |
| --- | ---: |
| `message.data.semantics` | 569 / 26.942 |
| `message.data.anchor` | 432 / 26.942 |
| `message.data.anchor.turnId` | 425 / 26.942 |
| `part.type = timeline` | 45 / 96.112 |
| timeline `anchorMessageId` | 21 / 45 |
| timeline `anchorTurnId` | 10 / 45 |

Distribuição dos tipos de timeline:

| `timelineType` | Count |
| --- | ---: |
| `model_change` | 24 |
| `goal_verification` | 10 |
| `session_fork` | 6 |
| `context_compaction` | 5 |

Isso explica por que markers como goal verify, fork e compact tendem a derivar: nos dados reais, muitos markers não têm âncora suficiente, e se o resolver só inferir pela posição de append, pelo timestamp ou pelo turn atual, haverá desalinhamento após cold recovery, late event, fork copy e queue drain.

## Campos de persistência e relação com o banco

Este documento não exige que todos os campos do resolver virem diretamente colunas do banco. A estratificação correta deve ser:

1. `session/message/part/session_entry` de `~/.zcode/cli/db/db.sqlite` é a fonte de fato autoritativa do conversation transcript.
2. O `zcode.db` do app guarda apenas metadados do app, notificações e a queue renderer-local, e não é fonte de ordem do transcript.
3. O `tasks-index.sqlite` guarda apenas a lista, a busca e o agrupamento de tarefas, e não é fonte de ordem do transcript.
4. As novas escritas de `message` / `part` precisam passar pelo repository unificado, garantindo `sequence` não nulo e monotônico estável dentro da mesma sessão/message.
5. Ao escrever um novo timeline part, é preciso registrar âncora e campos semânticos, como `anchorMessageId`, `anchorTurnId`, `lifecycleKey`, `visibility` e `timelineType`.
6. Ao escrever novas intenções de usuário, queue drain e background wake, é preciso preservar `sourceCommandId` / `cause` / `origin` / `turnId`; caso contrário a UI não consegue distinguir entrada real do usuário, consumo de fila e wake model-only.
7. O cold resume do CLI precisa devolver os persisted facts ao mesmo resolver, em vez de escrever um conjunto próprio de lógica de ordenação de hydration.
8. O snapshot materializado pode cachear `entityId/productTurnId/orderKey`, mas o cache não é fonte de fato.

A questão de o banco precisar de novas colunas físicas precisa ser tratada com camadas de risco:

```text
必须先修
  所有未来 message / part 写入都带 sequence。
  没有 sequence 的历史/异常数据在读取时必须可推导，不得丢弃。

建议新增或等价实现
  session_command / session_input 账本。
  至少表达 command/input admitted -> promoted -> cancelled/failed 的 durable 生命周期。
  可以是独立表，也可以是 session_event 里的 command.* events；
  但不能只存在 renderer-local queue 或 runtime 内存里。

建议补强 JSON contract
  semantics / anchor / sourceCommandId / cause / visibility / lifecycleKey。
  这些字段是 resolver 语义锚点，适合增量写入 JSON，保持老数据兼容。

暂不优先加物理列
  productTurnId / orderKey / lane / placement。
  这些是 resolver 输出，不是原始事实。可以缓存，但不应成为唯一事实。
```

Fronteira mínima de persistência recomendada:

```text
event_sequence 或 session_sequence
  session_id
  next_sequence

session_command / session_input
  id
  session_id
  kind
  delivery_kind
  client_mode
  payload_json
  admitted_sequence
  promoted_sequence
  promoted_message_id
  status
  time_created
  time_updated

message / part
  sequence 非空
  data JSON 带 typed refs / semantics
```

Se já existir um allocator unificado capaz de garantir que todos os transcript facts usem a mesma sequência monotônica dentro da sessão, a tabela `session_sequence` pode ser dispensada; caso contrário, um allocator novo ou equivalente deve ser adicionado, para evitar que message, part, session_entry e command gerem ordens incomparáveis entre si.

A causa raiz não é simplesmente “faltou um campo de ordenação no banco”. O problema real é que `sequence` já existe, mas a cobertura é incompleta, e a cobertura das âncoras semânticas também é baixa; por isso o snapshot de projeção precisa se tornar o resolver autoritativo, sem deixar a UI ou a hydration deduzirem a ordem a partir da ordem das rows, do role ou do turnId.

## Camadas de teste e aceite

Primeiro estabilize o resolver com L1/L2 e então escolha E2E representativos. O E2E antigo não precisa ficar verde de uma vez, mas cada case aceito precisa ter setup/action/assert explícitos.

```text
L1: Semantic Ledger / Resolver golden
  输入事件序列 -> typed entities -> resolved orderKey/nodes

L2: Materializer / profile convergence
  continuous/replayable 最终 snapshot 一致
  late placement 触发 resync

L3: UI render unit
  UI 只按 resolved nodes 渲染，不重新猜 turn tail

L4: E2E representative
  queue drain 两轮 assistant 都可见
  compact 不产生用户气泡，不切碎 assistant work
  goal verify 按 anchor 落 turn tail
  modelChange 不污染首轮和草稿切换
  fork graph cut 不复制 queue/background
  merged assistant fork 只允许最后稳定 segment
  background completion model-only wake 不显示用户气泡
```

## Recomendações de migração

1. Arbitrar e congelar nos docs as quatro camadas `eventSeq/runtimeTurn/productTurn/visualPlacement`.
2. Auditar primeiro todos os caminhos de escrita de `message` / `part`, proibindo contornar o session-store repository; depois de corrigir, adicionar um DB invariant para evitar que a migração continue produzindo NULL `sequence`.
3. Fazer um backfill compatível ou uma dedução estável em tempo de leitura para o `sequence` NULL existente. A dedução em tempo de leitura não pode alterar fatos históricos, mas precisa garantir que várias hydrations da mesma sessão obtenham a mesma ordem.
4. Adicionar ou implementar de forma equivalente `session_command` / `session_input`, persistindo o ciclo de vida admitted/promoted de queued prompt, background wake e resume input.
5. Completar `semantics`, `anchor`, `sourceCommandId`, `cause`, `origin`, `visibility` e `lifecycleKey` nos facts v4 novos. Quando faltarem campos em dados antigos, o resolver deduz, sem migração destrutiva.
6. Gerar id local / sequence local para a message copiada de fork e remapear as refs internas da child; os ids do parent só podem entrar na provenance `origin*`.
7. Adicionar `entityId/productTurnId/lane/placement/anchor/visibility/lifecycleKey/orderKey` às rows/snapshots do v4.
8. Adicionar o Semantic Ledger e o Timeline Resolver, cobrindo primeiro apenas queue, assistant segment, compact, goalVerify, fork, modelChange e background wake.
9. O materializer continua emitindo o formato antigo de rows, mas essas rows passam a vir do grafo resolvido; qualquer message/part visível que não possa ser agrupado precisa entrar em uma diagnostics fallback row, e não pode ser descartada em silêncio.
10. Mudar os render units da UI para consumir o resultado do resolver, removendo progressivamente a lógica de inferência `turnId + latest assistant`.
11. Fazer cold resume, desktop continuous e web remote replayable passarem pelo mesmo resolver.
12. Adicionar logs na camada de serviço e diagnóstico em desenvolvimento para falhas de conservação, evitando que um snapshot quebrado entre na UI em silêncio.

## Questões que exigem arbitragem posterior

1. Se a notificação de background precisa de uma system boundary leve. Arbitragens atual: não exibir como bolha de usuário e não entrar por padrão nas transcript rows.
2. Se modelChange será finalmente uma timeline row ou um SessionPane/banner state. Qualquer que seja a escolha, não se pode poluir rows.window com uma hidden row.
3. Se goal verifying continua sendo um lock de compact/fork. O catálogo de cases mais recente expressa que não gera um lock de validating independente, mas o formal-proof e parte da implementação ainda têm a semântica antiga e precisam de uma arbitragem reescrita à parte.
4. Se o delta append-only será estendido com `row.inserted/row.moved`. Este documento recomenda não estender: mudanças não caudas unificadas em snapshot resync, reduzindo a superfície de erro do cliente.

## Conclusão

Para resolver de fato o problema de ordem de mensagens e de mensagens engolidas, não se pode continuar tratando a projeção do CLI como um “row append reducer”. O CLI precisa se tornar uma verdadeira autoridade de timeline:

```text
事实归一
  raw events -> typed semantic entities

顺序归一
  constraint graph -> productTurnId / lane / orderKey

显示归一
  resolved snapshot -> UI 无脑渲染

守恒归一
  输入、assistant、compact、goal、fork、background 全部有 invariant
```

Só ao chegar nesse nível a UI poderá de fato parar de adivinhar, complementar e engolir.