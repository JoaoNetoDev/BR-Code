# Protocol Schema: ciclo central de conversa do V4

Este documento é um guia rápido de estrutura de [10-protocol-spec.md](./10-protocol-spec.md), que define a forma comum do wire v3 do V4, do conversation topic, da intenção de entrada, da deduplicação e do fork. A semântica dos campos, os limites e os guards são definidos em 10; a recuperação de assinatura e a contrapressão são vistas em [04](./04-sync-and-recovery.md) e [05](./05-transport-and-backpressure.md), respectivamente.

## 0. Posição de projeto

1. A UI apenas aplica a projection autoritativa da CLI, sem inferir o estado de queue/fork a partir de phase, posições em array ou mensagens brutas.
2. Objetos pequenos são substituídos por inteiro; rows permitem apenas cinco deltas fechados; snapshot sempre é substituído atomicamente.
3. Todas as entradas já submetidas compartilham uma única FIFO `CommandInbox` da CLI; a UI mantém apenas draft e optimistic overlay.
4. transport/profile só podem alterar quadros intermediários, nunca a semântica de command, queue, row ou do estado final.

## 1. Handshake do wire v3 e conexão confiável

```ts
interface HelloMessage {
  kind: "hello";
  protocolVersion: 3; // versão do wire; o schema do snapshot de projection continua versionado à parte
  connectionId: string;
  clientMode: "desktop-continuous" | "web-remote-replayable";
  deliveryProfile: "continuous" | "replayable";
  serverTime: number;
  capabilities: HostCapabilities;
  auth: { userId?: string };
}

interface ClientHello {
  kind: "clientHello";
  protocolVersion: 3;
  clientId: string;
  clientKind?: "desktop" | "web" | "mobileRemote" | "mobileApp"; // apenas telemetria/exibição
  appVersion: string;
}
```

`connectionId/clientMode/deliveryProfile` são atribuídos pelo host conforme o tipo de attachment, e o cliente não pode sobrescrevê-los: desktop (incluindo SSH/WSL/Docker) = `continuous`, celular remote/WebSocket = `replayable`.

```ts
interface SubscribeParams {
  topic: string;
  base?: { logEpoch: string; seq: number };
  visibility?: "foreground" | "background";
  // proibido clientMode / deliveryProfile / connectionId: a facade de conexão injeta automaticamente.
}

interface SubscribeAck {
  subscriptionId: string;
  mode: "snapshot" | "resume";
  logEpoch: string;
}

interface ConversationResyncParams {
  subscriptionId: string;
  base: { logEpoch: string; seq: number } | null;
  forceSnapshot?: boolean;
}
```

Nomes de métodos: `v4/conversation/subscribe`, `v4/conversation/unsubscribe`, `v4/conversation/resync`. O fechamento da porta equivale a executar unsubscribe em todas as subscriptions daquele `connectionId`.

A response de subscribe retorna apenas `SubscribeAck`. Depois que o ACK é escrito, o snapshot/resume inicial e os quadros online usam uniformemente a notification `TopicWireFrame` do attachment proprietário; é proibido embutir snapshot lógico ou `frames[]` na response.

## 2. TopicFrame lógico e TopicWireFrame físico

```ts
interface TopicFrame<S, D> {
  topic: string;
  subscriptionId: string;
  fromSeq: number;
  toSeq: number;
  sentAt: number;
  payload:
    | { kind: "snapshot"; snapshot: S }
    | { kind: "deltas"; deltas: D[] };
}

type TopicWireFrame<S, D> =
  | {
      wireVersion: 3;
      kind: "complete";
      logicalFrameId: string;
      frame: TopicFrame<S, D>;
    }
  | {
      wireVersion: 3;
      kind: "fragment";
      logicalFrameId: string;
      subscriptionId: string;
      fragmentIndex: number;
      fragmentCount: number;
      logicalBytes: number;
      checksum: { algorithm: "crc32"; value: string };
      dataBase64: string;
    };
```

- Cada quadro físico JSON/RPC, com envelope, deve ter estritamente `<=1 MiB`.
- O buffer do subscritor, após o filtro de profile e o coalesce, deve respeitar simultaneamente `<=500 ops` e `<=max(1 MiB, limite superior do snapshot)` (ver 05 §3); ao exceder, limpa-se o buffer e inicia-se um resync, e a próxima vez envia apenas o snapshot mais recente.
- Quadros lógicos de snapshot/resume podem ser fragmentados, com montagem `<=16 MiB`; após a verificação de integridade são aplicados atomicamente; fragmento faltante/conflito/excesso dispara resync.
- `toSeq <= localSeq` é descartado silenciosamente; gap gera resync single-flight; gap após o resume força snapshot.

## 3. ConversationSnapshot e ações autoritativas

```ts
interface ConversationSnapshot {
  protocolVersion: 1; // versão do schema de projection, separada do wire v3
  sessionId: string;
  logEpoch: string;
  seq: number;
  revision: number;
  control: SessionControl;
  availability: SessionActionAvailability;
  inputRouting: InputRouting;
  config: SessionConfigState;
  usage: SessionUsageState;
  queue: QueueState;
  pendingInteractions: PendingInteraction[];
  pendingCommands: CommandStateSummary[];
  backgroundWorks: BackgroundWorkSummary[];
  goal: GoalState | null;
  plan: PlanState | null;
  rows: RowsWindow;
}

type ActionAvailability =
  | { allowed: true }
  | { allowed: false; reasonCode: string };

interface SessionActionAvailability {
  fork: ActionAvailability; // lock de operação de sessão/global; a elegibilidade do alvo ainda depende de row.actions.canFork
  compact: ActionAvailability;
  switchModelConfig: ActionAvailability;
  setFollowupMode: ActionAvailability;
  queueEdit: ActionAvailability;
  sendQueuedNow: ActionAvailability;
  resumeGoal: ActionAvailability;
}

interface RowActions {
  canFork?: true;
  canEdit?: true;
  canRetry?: true;
}
```

A condição para a UI exibir fork vem de `availability.fork` e de `actions.canFork` da linha alvo; é proibido inferir por conta própria a partir de `control.phase`, de o assistant estar no fim do array ou do tipo de mensagem bruta.

## 4. ConversationInputIntent: conservação total dos campos da entrada

```ts
interface ConversationInputIntent {
  sourceCommandId: string;      // commandId original do submit, percorre todos os fatos posteriores
  queueItemId: string;          // atribuído na admission; inalterado em edit/reorder/reserve/drain
  clientId: string;
  kind: "sendText" | "sendGoalCommand";
  text: string;                 // texto original, sem substituir por resumo já analisado
  attachments: AttachmentRef[]; // [] quando não há anexos, evitando perda de campo por undefined no caminho
  delivery: {
    requested: "auto" | "startNow" | "queue" | "guide";
    admitted: "startNow" | "queue" | "guide";
    fallbackReasonCode?: string;
  };
  order: {
    admissionSeq: number;       // ordem serial de admission da CLI
    queuePosition?: number;
  };
  steer: {
    state: "notRequested" | "submitting" | "steering" | "guided" | "fellBack";
    reasonCode?: string;
  };
  dispatch: {
    state: "admitted" | "queued" | "reserved" | "promoting" | "drained";
    reservationId?: string;
  };
  admittedAt: number;
}

type QueueItem = ConversationInputIntent & {
  dispatch: ConversationInputIntent["dispatch"] & {
    state: "queued" | "reserved" | "promoting";
  };
};

interface QueueState {
  items: QueueItem[]; // ordem = FIFO autoritativa após admission/reorder da CLI
  autoDrain: boolean;
}
```

A mesma intent percorre:

```text
CommandInbox admission
  -> QueueItem(sourceCommandId=S, queueItemId=Q)
  -> drain/guided event(sourceCommandId=S, queueItemId=Q)
  -> UserInputRow(sourceCommandId=S, attachments, guided, clientId)
  -> transcript message anchor(sourceCommandId=S)
```

Quando o guide não se aplica, há anexos, ou compact/verifier está ocupado, a intent completa precisa ser preservada e voltar para a queue comum. Rejeições por vazio/oversize/runtime devem retornar `rejected/failed`; não se pode limpar a UI antes e depois descartar o payload.

`editQueueItem` atualiza no lugar, preservando `queueItemId/sourceCommandId/clientId/order/attachments`; altera somente os campos novos explicitamente submetidos. `sendQueuedNow` é:

```text
reserve(Q) -> stop barrier -> start/promote(Q) -> remove(Q)
   │                              │
   └─ timeout/failure -> release ─┘（item original, posição original, campos preservados）
```

Cliques consecutivos no mesmo Q ou concorrência entre múltiplos clientes só podem ter um único dono da reserva.

## 5. Row, marker e âncoras persistentes

```ts
interface UserInputRow extends RowBase {
  kind: "userInput";
  text: string;
  origin: "realUser" | "backgroundResult" | "goalContinuation" | "mailbox" | "synthetic";
  sourceCommandId?: string; // obrigatório em realUser/guided
  queueItemId?: string;
  clientId?: string;
  guided?: true;
  attachments?: AttachmentRef[];
}

interface TimelineMarkerRow extends RowBase {
  kind: "timelineMarker";
  sourceCommandId?: string; // obrigatório em markers gerados por comando do usuário
  marker: TimelineMarker;
}

interface MessageAnchorMetadata {
  sourceCommandId?: string;
  productTurnId?: string;
  orderedMessageIds?: string[];
  boundaryMessageId?: string;
}

interface ChildSessionMetadata {
  parentSessionId: string;
  sourceCommandId: string; // o fork duplicate retorna o mesmo child
  forkTarget: StableForkTarget;
}
```

QueueItem, drain event, user row, message anchor, markers gerados pelo usuário e fork child metadata devem preservar o `sourceCommandId` original; é proibido trocar por um novo command id durante promotion/send-now.

## 6. ACK de commands, consultas e single-flight

```ts
interface CommandKey {
  sessionId: string;
  commandId: string;
}

interface CommandsQueryParams {
  commands: CommandKey[]; // 1..64
}

interface CommandsQueryResult {
  results: Array<{
    key: CommandKey;
    result: CommandAck | "unknown";
  }>;
}
```

A ordem de consulta de cada key é fixa:

```text
in-memory LRU
  -> transcript user/message anchor sourceCommandId
  -> timeline marker sourceCommandId
  -> fork child metadata sourceCommandId
  -> discarded input ledger
  -> unknown
```

Um acerto em discarded retorna `CommandAck{status:"failed", reasonCode:"fault.command.inputDiscardedOnRestart", result:{type:"inputDisposition",delivery}}`, e não `unknown`. `command execute` e `commands/query` da mesma key compartilham a entrada single-flight/mutex: a consulta não pode reportar `unknown` por engano na janela entre "já começou a executar" e "ainda não escreveu no LRU/transcript", nem disparar um segundo efeito colateral.

O TTL do pending registry da UI é de 24h: texto/goal comuns guardam o payload reenviável; interactions sensíveis guardam apenas digest; assim que a projection de QueueItem/guided aparece, o registro é removido. Após restart da CLI, entradas discarded de `queue/guide` são silenciosamente zeradas, e apenas `startNow` que não entrou no transcript ou `unknown` pedem confirmação do usuário para reenvio; nunca restaurar nem reproduzir automaticamente uma discarded input.

## 7. Fork estável do assistant

```ts
interface StableForkTarget {
  productTurnId: string;
  transcriptTurnId: string;
  orderedMessageIds: string[];
  boundaryMessageId: string;
}

type StableForkGoalBoundary =
  | { kind: "none" }
  | {
      kind: "snapshot";
      target: SessionGoal;
      verificationEntryIds: string[];
    };

resolveStableForkTarget(target: { rowId: number; entityId: string }, baseLogEpoch: string):
  | {
      ok: true;
      target: StableForkTarget;
      goalBoundary: StableForkGoalBoundary;
    }
  | { ok: false; reasonCode:
      | "guard.forkAssistantOnly"
      | "guard.forkTargetNotStable"
      | "guard.forkTargetAmbiguous"
      | "guard.compactOperationLock" };
```

O único alvo legítimo é o **último bloco completed assistant** de um product turn `completedSuccess`. Para dados novos, vale a âncora de turn persistida; dados antigos só fazem fallback quando o limite message/turn é único.

A âncora final de assistant dos dados novos precisa ser persistida antes de publicar `TurnComplete`, junto do segmento de mensagem bruta, do limite e do `goalBoundary` explícito. Um `goalBoundary` ausente significa apenas que são dados históricos; dados novos sem goal devem gravar `{ kind: "none" }` e não adivinhar o estado do goal no ponto do fork a partir do goal atual do parent. `snapshot.verificationEntryIds` contém somente as verifier entries já persistidas antes daquele limite do transcript.

- Quando há primary turn, foreground subagent, goal continuation ou goal verifier em execução, é possível fork para um alvo estável mais antigo.
- compact continua sendo um lock de operação global.
- Streaming/interrupted/failed parcial, blocos intermediários de assistant e user/tool/timeline são sempre rejeitados.
- Um fork em execução copia apenas o transcript estável, a config no ponto do fork e o goal anterior ao fork; não copia queue, trabalhos active/background, continuation inbox, não faz rewind do shared workspace, e o parent continua rodando.
- O comportamento já existente de checkpoint de workspace em completed/idle não é ampliado nesta rodada.
- Uma nova tentativa com o mesmo `sourceCommandId` devolve o mesmo child.
- E10/FX08 copiam blocos de ferramentas, o assistant final após o resultado das ferramentas e os fatos de arquivos já produzidos naquele turn segundo o limite lógico de turn; não podem truncar apenas pela "última mensagem bruta de assistant".

## 8. Delta e invariantes finais

```ts
type ConversationDelta =
  | { op: "row.appended"; row: ConversationRow }
  | { op: "row.upserted"; row: ConversationRow }
  | { op: "row.removed"; fromRowId: number }
  | { op: "row.delta"; rowId: number; path: StreamablePath; append: string }
  | { op: "state.updated"; patch: StatePatch };
```

O coalesce não pode cruzar `row.removed`; `state.updated` faz apenas substituição integral por chave; o stream path é uma whitelist fechada. Sempre que uma estrutura não puder ser expressa com segurança, o buffer exceder o limite ou o seq não for contíguo, envia-se um snapshot resync, sem introduzir reducer de compensação na UI.

Invariante final: cada entrada submetida deve estar, e somente estar, em um destes estados: `queue / guided row / transcript / explicit rejected|failed|discarded`; em nenhum momento pode haver "UI já limpa, mas a camada autoritativa sem registro".