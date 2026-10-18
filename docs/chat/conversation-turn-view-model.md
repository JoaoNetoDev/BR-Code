# Conversation Turn View Model

## Contexto

A área de chat não pode mais comprimir mensagens reais, comandos do usuário, entradas exclusive de runtime e o ciclo de vida do timeline em um único fluxo de fatos `ChatMessage[]`. A UI precisa primeiro normalizar por transação de turn e só então gerar as linhas de renderização.

## Modelo de domínio

Uma `Conversation` é composta por vários `Turn`. Um turn é uma transaction de conversation aceita pela session principal e que entra na CLI/runtime, e não uma mensagem de usuário isolada, nem uma mensagem de assistant, nem o N-ésimo conjunto de mensagens do array da UI.

A identidade autoritativa de um turn é o `turnId` produzido pela CLI/runtime. O `turnOrdinal` usado na exibição da UI e o campo de compatibilidade histórica `turnIndex` só podem expressar "qual turno é", e não podem servir como mutation target, timeline anchor ou fonte de verdade de restauração no novo protocolo. Capacidades que precisam de identidade estável, como fork, edit, rewind, file summary e timeline placement, devem preferir `messageId`, `turnId`, `anchorTurnId` ou `anchorMessageId`.

```ts
interface ConversationView {
  turns: TurnView[];
  rows: ConversationRenderRow[];
  lineageEvents: ConversationLineageEvent[];
}

interface TurnView {
  turnId: string;
  ordinal: number; // display only
  origin:
    | "user_prompt"
    | "queue_drain"
    | "turn_steer"
    | "goal_continuation"
    | "background_result"
    | "manual_compact";
  status: "running" | "settling" | "completed" | "interrupted" | "failed";
  visibleInputs: ConversationInput[];
  // 同一 product turn 内，原始输入与每条 accepted steer 分别开启一个视觉工作段。
  // 这不是 turn 边界；command target、fork/retry 仍锚定 product turn 的最终正文。
  workSegments: TurnWorkSegmentView[];
  modelOnlyInputs: RuntimeInput[];
  workLog: WorkLogItem[];
  assistantOutput?: AssistantOutput;
  postTurnEvents: PostTurnEvent[];
  actionTargets: TurnActionTargets;
}

interface TurnWorkSegmentView {
  segmentId: string;
  triggerInputId?: string;
  startedAt: number;
  endedAt?: number;
  activeMs?: number;
}
```

`status=settling` significa que a saída principal do assistant já foi concluída, mas o trabalho pós-turn que bloqueia a conclusão deste turn ainda não foi fechado, por exemplo o goal verifier, a verificação prévia da goal continuation ou outro trabalho active em primeiro plano. Nesse momento a UI não deve mais mostrar o assistant produzindo saída, mas a session ainda pode estar com `sessionEnded=false`, e o botão de parar continua sendo decidido pela session control projection quanto à disponibilidade.

```text
turn t1
|-- visibleInputs[]
|-- assistantOutput completed
`-- postTurnEvents[]
    `-- goal verify running

session control:
  sessionEnded = false
  canStop = true
  stopTargetKind = goalVerifier
```

## Projeção de linhas

Ao renderizar a conversation, a UI deve consumir `rows[]`, em vez de agrupar diretamente o `ChatMessage[]` plano por role + posição no array. `rows[]` é o índice de linhas de renderização do produto: ele pode referenciar uma transcript message, um timeline event, um workLog item ou um lineage event, mas ele próprio não é uma message do provider.

```ts
type ConversationRowPlacement =
  | "inside_turn_input"
  | "inside_turn_assistant"
  | "inside_turn_worklog"
  | "after_turn"
  | "session_lineage";

interface ConversationRenderRow {
  rowId: string;
  turnId?: string;
  placement: ConversationRowPlacement;
  kind:
    | "input"
    | "assistant_output"
    | "tool"
    | "compact"
    | "goal_verification"
    | "fork"
    | "model_change"
    | "background_result";
  messageIds?: string[];
  timelineEventId?: string;
  workItemId?: string;
  anchorMessageId?: string;
  order: number;
}
```

Exemplo:

```text
ConversationView
|-- turns
|   |-- t1 origin=user_prompt
|   `- t2 origin=background_result
|
`-- rows
    |-- row:t1:input:user-msg-1             inside_turn_input
    |-- row:t1:assistant:assistant-msg-2    inside_turn_assistant
    |-- row:t1:compact:compact-op-1         inside_turn_worklog
    |-- row:t1:goal:target-a:1              after_turn
    |-- row:t2:input:bg-result-1            inside_turn_input
    `-- row:t2:assistant:assistant-msg-9    inside_turn_assistant
```

Em dados novos, não é permitido que a UI determine a atribuição de uma row por "a última assistant", "o último user" ou `Math.floor(index / 2)`. Em dados antigos sem anchor, a camada de compatibilidade pode gerar uma fallback row, mas a fallback precisa ser marcada como compatibility recovery e não pode servir de fato para o novo protocolo.

## Regras de entrada do usuário

Todos os comandos explicitamente enviados pelo usuário são conversation events. O efeito colateral de status de um comando não substitui a própria entrada do usuário.

- Primeiro `/goal <objective>`: registra uma visible user query visível e define a goal.
- replace `/goal <objective>`: também registra uma visible user query visível e atualiza a goal.
- queued `/goal <objective>`: permanece como queue item; ao ser realmente consumido, registra a visible user query e atualiza a goal.
- goal continuation reminder: pertence ao `modelOnlyInputs` de runtime e não pode ser renderizado como um balão do usuário.
- turn steering accepted: pertence aos `visibleInputs` do turn atual e é exibido como complemento do usuário dentro do turn atual.
- Cada turn steering accepted abre simultaneamente um novo visual work segment; o segment anterior é fechado na fronteira de injeção, mas os dois segmentos continuam compartilhando o mesmo `turnId` / `productTurnId`.
- turn steering rejected ou fallback queue: pertence às pending inputs de um turn futuro e não deve ser escrito antecipadamente no turn atual.
- background result retornando à session principal: pertence a um novo turn com `origin=background_result`; do lado do provider ele pode aparecer como `role=user`, mas a camada de produto precisa preservar `humanAuthored=false` e a origem de background, sem abrir a semântica de edição de usuário comum.

## Classificação do timeline

O timeline não é o nó pai dos dados de negócio nem deve se passar por uma message comum de assistant. Ele é informação de posicionamento das render rows e um product lifecycle event. Cada timeline row precisa declarar identidade estável, política de dobra, placement e anchor.

```ts
type TimelineFoldPolicy = "worklog" | "never";

interface TimelineRenderRow {
  key: string;
  timelineEventId: string;
  placement: "inside_turn_worklog" | "after_turn" | "session_lineage";
  foldPolicy: TimelineFoldPolicy;
  anchor:
    | { type: "inside_turn"; turnId: string }
    | { type: "after_turn"; turnId: string; assistantMessageId?: string }
    | { type: "after_message"; messageId: string }
    | { type: "session_start" };
}
```

| Timeline | placement | foldPolicy | Descrição |
| --- | --- | --- | --- |
| context compact | `inside_turn_worklog` | `worklog` ou visível enquanto running | assistant worklog, não troca de turn |
| goal verification | `after_turn` | `never` | evento de arbitragem pós-turn do turn verificado |
| session fork | `session_lineage` | `never` | conversation lineage event, não pertence ao assistant worklog |
| model change | `session_lineage` ou `after_turn` | `never` | depende de estar ancorado em algum turn; dados novos devem ter placement explícito |

### Compact

A compactação de contexto é um processo intermediário do turn do assistant e pertence ao `workLog`:

- auto compact completed pode ser recolhido em “já trabalhou por xxx”.
- compact em running / retrying precisa permanecer visível, para que o usuário não perca o estado atual.
- a identidade estável da compact row prefere `operationId`; o optimistic local e o agent lifecycle são mesclados por `inputId` / `operationId`.

### Goal Verify

O goal verify é um evento de arbitragem posterior à saída do assistant e pertence aos `postTurnEvents`:

- precisa aparecer depois da saída do assistant verificada.
- não pode entrar na dobra “já trabalhou por xxx”.
- a UI row key precisa ser `goal:${targetId}:iteration:${goalIteration}`.
- `verificationId` é o id de attempt do verifier, e só pode ser usado no detalhe de attempts, nunca como row key.
- started / completed / failed / cancelled do mesmo `targetId + goalIteration` precisam atualizar a mesma row.
- quando o verifier retorna explicitamente `passed: false`, exibe-se como não aprovado; falha de parsing do JSON do verifier é uma falha da cadeia de arbitragem, com fail-open padrão para `passed: true`, mas o reason precisa preservar a causa do erro de formato para facilitar a investigação.

### Fork

O fork é um conversation lineage event e não pertence ao assistant worklog:

- não pode ser recolhido em “já trabalhou por xxx”.
- quando há `targetMessageId`, pode navegar de volta à message de origem da session pai.
- dados antigos que possuem apenas `parentSessionId` só podem ser recuperados como fallback row sem navegação.

## Restauração de histórico

Dados novos devem fornecer um anchor forte:

- message: `turnId`, ou algo que a projection possa atribuir explicitamente a algum `turnId`
- timeline: `timelineEventId`, `anchorTurnId` e, opcionalmente, `anchorMessageId`
- goal verify: `anchorTurnId` e, opcionalmente, `anchorAssistantMessageId`
- fork: `targetMessageId` e, opcionalmente, o `anchorTurnId` da session atual

Quando dados antigos não têm anchor, a UI pode usar tempo e a assistant mais recente como fallback, mas o fallback só pode ser usado para compatibilidade com o histórico antigo e não pode ser a fonte de verdade para dados novos.

## Invariantes fortes

- `turnId` é a identidade autoritativa da CLI/runtime; `turnIndex` / `ordinal` só podem ser usados para exibição.
- No novo protocolo, o history target prefere `messageId` ou `turnId`; o fallback para `turnIndex` só acontece na compatibilidade com dados antigos.
- O placement de timeline precisa vir da projection; é proibido que a UI deduza a posição no timeline pelo índice do array ou pela mensagem mais recente.
- Uma row só pode ter um placement explícito; atualizações de started/completed/failed/cancelled da mesma identidade de timeline precisam cair na mesma row.
- Trabalho em background não bloqueia a conclusão do turn atual; um background result que volta para a main abre um novo turn em primeiro plano.

## Fronteira entre plataformas

Este modelo não altera a propriedade de realtime da task:

- O desktop continua usando o realtime direto `desktop-continuous`.
- O controle remoto Web do celular continua usando a recuperação por snapshot / gap do `web-remote-replayable`.
- O relay e o main process não possuem o estado de negócio de session, stream, queue, snapshot ou timeline.