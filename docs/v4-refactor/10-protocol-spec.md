# ZCode Protocol v4: especificação em nível de campo

Nova query somente leitura `v4/conversation/backgroundBashOutput`: `sessionId`/`workId` localizam o Bash em segundo plano do runtime atual e retornam apenas `kind`/`workId`/`status`/`output`/`truncated`/`outputPath`, onde `output` é uma janela final fixa de no máximo 8 KiB de bytes brutos; não transmite comando, horário, código de saída nem tamanho do arquivo, e não gera topic event nem recupera sessão.
Os campos, erros e o contrato de ciclo de vida estão em [Detalhes da saída do Bash em segundo plano](../background-bash-output-details.md).

- Estado: **fato atual (2026-07-11, ciclo fechado de target/action/edit/retry)**. Esta versão eleva o wire para v3 sobre o schema de projection existente, conectando assinatura de conexão confiável, fragmentação física/resync limitado, entrada autoritativa do CLI e `commands/query`, row target composto e fork estável de assistant em execução. Detalha [09-protocol-schema.md](./09-protocol-schema.md); a semântica de assinatura/recuperação/contra-pressão segue [04](./04-sync-and-recovery.md)/[05](./05-transport-and-backpressure.md).
- Absorve todas as conclusões R/G/D e as duas decisões de [design-review.md](./design-review.md) (queue não persistida, inbox em memória).
- §9.2 já adota a **Opção B**: o log de eventos é um log limitado em memória do processo, e `logEpoch` muda a cada geração do runtime do CLI; entre reinícios, um novo snapshot é gerado por hydration do transcript/fatos de entrada persistidos, sem restaurar a epoch antiga.
- O ⚠ no texto é um marcador de decisão da fase de design; §10 registra as decisões finais e não pode mais ser interpretado como item pendente de decisão.
- Os tipos usam a notação TypeScript como base de discussão; na implementação são realizados com zod schema; `?` = opcional, e a semântica do padrão está nos comentários.

Escopo: camada comum de conexão/assinatura + topic conversation + topic sessions-index + camada command/query. Outros domínios como terminal/git/workspace não estão no escopo deste documento; não se deve inferir que eles já migraram para o mesmo schema de topic.

---

## 1. Identidade e relógio

| Identidade                                   | Tipo                                            | Produtor                                | Ciclo de vida                                                 | Uso                                                                              |
| -------------------------------------------- | ----------------------------------------------- | --------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `sessionId`                                  | `string`                                        | CLI (ao criar a sessão)                 | permanente                                                     | identidade da sessão                                                             |
| `workspaceId`                                | `string`                                        | host                                    | permanente                                                     | chave de identidade do workspace (R-16: **não é o path cru**, inclui identidade SSH/WSL/container) |
| `clientId`                                   | `string`                                        | gerado na primeira instalação do cliente, localStorage | persistente entre conexões                       | exibição de atribuição de command, telemetria. **Não participa do roteamento**   |
| `connectionId`                               | `string`                                        | host (atribuído ao criar o attachment) | uma conexão                                                    | roteamento de envelope, atribuição de assinatura (R-08: separado do clientId)   |
| `clientMode`                                 | `desktop-continuous \| web-remote-replayable`   | host (injetado conforme o tipo de attachment) | uma conexão                                          | fronteira confiável desktop/mobile; o cliente não pode sobrescrever               |
| `subscriptionId`                             | `string`                                        | host (atribuído ao aceitar o subscribe) | uma assinatura                                                 | geração de quadros, evita intercalação de fluxos antigos (R-01)                 |
| `logicalFrameId`                             | `string`                                        | publisher/encoder de wire               | um quadro lógico                                               | montagem e verificação de fragmentos físicos                                   |
| `logicalFrameOrdinal`                        | `positive safe integer`                        | publisher (por assinatura)              | monótona dentro da assinatura, começando em 1                 | descarta replay lógico atrasado; mesmo ordinal com id diferente = conflito de protocolo |
| `logEpoch`                                   | `string`                                        | CLI (gerado na inicialização do processo, ex.: ULID) | ciclo de vida do processo do CLI                   | validade de `base`: epoch diferente → apenas snapshot                            |
| `seq`                                        | `number`                                        | log de eventos do CLI                   | monótona na sessão, válida dentro da epoch                     | contabilidade de intervalos de quadro, retomada                                 |
| `revision`                                   | `number`                                        | derivado pelo reducer do CLI (§4.5)     | monótona na sessão, **estável entre reinícios**                | CAS de command                                                                |
| `rowId`                                      | `number`                                        | derivado pelo reducer do CLI             | monótona na sessão, nunca reutilizada, **função pura determinística do log de eventos** (R-04) | identidade da linha, chave de scroll virtual, paginação por cursor |
| `turnId`                                     | `string`                                        | CLI                                    | permanente (persistido na mensagem)                             | rótulo de agrupamento de linhas                                                  |
| `commandId`                                  | `string` (uuid v7)                              | cliente                                 | imutável durante as retentativas                               | identidade idempotente                                                          |
| `interactionId` / `queueItemId` / `workId`   | `string`                                        | CLI                                    | ciclo de vida do objeto                                        | `queueItemId` é atribuído no admission e não muda em edit/reserve/drain          |

Regras de relógio (eliminam os remendos de relógio do tipo P1-11):

- `type Timestamp = number` (Unix ms, **sempre o relógio do CLI**). O cliente está proibido de subtrair o relógio local de um Timestamp do protocolo.
- Cada envelope de quadro carrega `sentAt` (§3.2); o cliente mantém com isso `clockOffset ≈ sentAt - localNow`, e um valor animado em tempo real como "trabalhando há N segundos" = `localNow + clockOffset - startedAt`.
- O tempo de trabalho autoritativo (`turnHeader.activeMs`, §4.4) é enviado pelo CLI na conclusão; o valor animado do cliente é apenas exibição transitória e o valor final segue o autoritativo.

Relação entre `revision` e `seq`: `revision` é a contagem de "eventos estruturais" (definida em §4.5) e `seq` é a contagem de todos os eventos; ambos são derivados deterministicamente do log, com `revision ≤ seq`.

---

## 2. Conexão e handshake

```ts
// 连接建立后 host 主动下发第一条消息
interface HelloMessage {
  kind: "hello";
  protocolVersion: 3; // V4 wire version；snapshot schema 独立版本化
  connectionId: string;
  clientMode: "desktop-continuous" | "web-remote-replayable";
  deliveryProfile: "continuous" | "replayable";
  serverTime: Timestamp; // 首次时钟校准
  capabilities: HostCapabilities; // 平台能力协商（与 delivery profile 正交，05）
  auth: { userId?: string }; // ⚠ 鉴权细节属 G-13，本文只留位
}

interface HostCapabilities {
  nativeDialogs: boolean; // 桌面原生对话框
  localTerminal: boolean;
  binaryFrames: boolean; // ws binary（relay 链路探测用）
  compression: "none" | "permessage-deflate";
  workflowRunDeltas?: boolean; // 能发 §4.5 的 workflowRun.* 键化 op；缺省等价 false，调用方按 `=== true` 判定
}

// 客户端回应（连接级注册，一次）
interface ClientHello {
  kind: "clientHello";
  protocolVersion: 3;
  clientId: string;
  clientKind?: "desktop" | "web" | "mobileRemote" | "mobileApp"; // 仅遥测/展示，不能覆盖可信 clientMode
  appVersion: string;
  capabilities?: { workflowRunDeltas?: boolean }; // strict 对象：只有 host 在 hello 里宣告过的能力才允许声明
}
```

Regras:

- `connectionId`/`clientMode`/`deliveryProfile` vêm do contexto confiável de attachment do host: desktop (incluindo SSH/WSL/Docker) = `desktop-continuous`/`continuous`; mobile remote/WebSocket = `web-remote-replayable`/`replayable`. Nem a UI nem o `clientHello` podem escolher.
- A negociação de capacidades é um fato por conexão: o host anuncia em `hello`, o cliente só declara em `clientHello` o que o host anunciou, e a facade injeta a conclusão, pelo mesmo caminho de injeção conforme `clientMode`, no subscribe daquela conexão (§3.1). É ortogonal ao delivery profile: tanto `continuous` quanto `replayable` podem ser declarante ou não declarante.
- Cada attachment precisa de handshake próprio e de registro de assinaturas próprio; assinaturas desktop/mobile da mesma sessão podem coexistir.
- A saúde da conexão (connecting/reconnecting/degraded) é **estado local de UI do cliente**, proibido de se misturar a qualquer semântica de sessão de topic (R-13).
- A classificação do motivo de desconexão é transportada pelo close code da camada rpc: `authFailed` / `kicked` / `serverShutdown` / `unknown`. Os dois primeiros fazem o cliente **parar de reconectar automaticamente** e entrar na página de estado terminal correspondente (G-08); os demais reconectam com backoff (0,1,2,5,10… com teto de 30s, por um único ponto de entrada).

---

## 3. Camada comum de assinatura (compartilhada por todos os topics)

### 3.1 Ciclo de vida da assinatura

```text
client                    connection facade                    CLI/服务域
  │ subscribe(topic, base?) ────►│                                  │
  │                              │── inject connection/profile ────►│
  │◄─ SubscribeAck{subId, mode} ─│◄───── subscription decision ────│
  │   （ACK response 写出后）     │                                  │
  │◄═ initial/online TopicWireFrame(subId) owned notifications ════│
  │                              │
  │ 断档检测 → resync(subId, base={logEpoch, seq})         ← single-flight
  │                              │ same-sub 恢复；profile/topic 由 owned registry 决定
  │                              │ 下行只写 owner(subscriptionId) 的 attachment port
```

```ts
interface SubscribeParams {
  topic: TopicKey; // "conversation/<sessionId>" | "sessions-index/<workspaceId>" | ...
  base?: { logEpoch: string; seq: number }; // 水位不变量：仅当客户端真持有该时刻一致状态才允许带
  visibility?: "foreground" | "background"; // QoS hint，只影响调度，不影响语义
  // connectionId/clientMode/deliveryProfile 禁止由 UI 传入；facade 从可信 connection context 注入。
  workflowRunDeltas?: boolean; // 同上：facade 按该连接 clientHello 的声明注入，UI-facing subscribe 不能自选
}

interface SubscribeAck {
  subscriptionId: string;
  mode: "snapshot" | "resume"; // resume = base 有效，从 base.seq 续传增量
  logEpoch: string; // 当前日志代际
}

interface UnsubscribeParams {
  subscriptionId: string;
}
interface UpdateSubscriptionParams {
  subscriptionId: string;
  visibility: "foreground" | "background";
}
interface ConversationResyncParams {
  subscriptionId: string;
  base: { logEpoch: string; seq: number } | null;
  forceSnapshot?: boolean; // resume 再 gap / fragment 校验失败时强制 true
}
interface ConversationResyncResult {
  ack: SubscribeAck; // same subscriptionId；公共 response 仍 ACK-only
}
```

Decisão do servidor (CLI): `base.logEpoch === epoch atual` e `base.seq` dentro da janela de retenção e sem pedido de `forceSnapshot` → `resume`; caso contrário → `snapshot`. O resync regenera o quadro de recuperação com base no base do cliente e não pode adivinhar o estado do cliente pelo `sentSeq` do publisher; ele mantém o `subscriptionId`/`topic`/`profile` owned e descarta reservations in-flight antigas, e um delayed commit antigo retorna false.

O fechamento da conexão deve executar `unsubscribeAll(connectionId)` e liberar o buffer, o fragment assembly e o listener de flow control daquela conexão. Após o restart do runtime do CLI ou a reconstrução do attachment, o cliente reassina automaticamente os topics ativos assim que conclui o novo handshake; é proibido fazer broadcast no workspace e descartar no receptor os subId que não lhe pertencem.

A resposta de subscribe só pode carregar um `SubscribeAck` pequeno. O snapshot/resume inicial não pode ser embutido como `frame` lógico nem colocado no mesmo response em `frames[]`; depois de escrever o ACK, os quadros de wire físicos são enviados por notificação no owned port.

`SubscribeAck.logEpoch` é metadado de admission/route e não cria uma base com seq=0. Os três tipos de topic mantêm `hasAppliedBase`: uma projection que realmente existia antes do pedido pode ser preservada quando o ACK=`resume` e a epoch é a mesma; um ACK=`snapshot` invalida o base antigo até que um snapshot owned completo seja aplicado atomicamente. Sem um base válido, nenhum delta pode ser aplicado; falha de montagem inicial/overflow no staging do ACK deve enviar `base:null, forceSnapshot:true` (ou trocar por um snapshot novo), e é proibido construir um base falso a partir do ACK; qualquer snapshot owned completo (inclusive um overflow snapshot online) pode reestabelecer o base.
Essa restrição vale igualmente para sessions-index/config; um cold seed pode não estar no log incremental, e um resume vazio não substitui o snapshot inicial.

O portão de implementação 04B usa uma outbox de pós-resposta com escopo de request para garantir ordem de bytes e marca d'água: internamente o dispatch do servidor transporta `{ack, physicalMessages[], commit}`, e o result público continua sendo estritamente apenas `{ack}`. A conexão primeiro retira a outbox daquele request id, depois escreve a linha de response, coloca em ordem todas as linhas de notificação física na fila de escrita owned da conexão atual e só então faz o commit da reservation do publisher. Falha de codificação ou de enqueue síncrono não avança a marca d'água; EPIPE/close assíncrono após o enqueue encerra toda a epoch da conexão, e subscriptions/outboxes antigas não são reutilizadas entre attachments. É proibido usar microtask/timer ou a fragmentação de rede subjacente para inferir a ordem entre response e initial.

### 3.2 Quadros lógicos e envelope físico do wire v3

```ts
type TopicKey = string;

interface TopicFrame<S, D> {
  topic: TopicKey;
  subscriptionId: string; // R-01：代际标识
  fromSeq: number; // 区间记账 (fromSeq, toSeq]；snapshot 帧 fromSeq 固定为 0
  toSeq: number; // 本帧覆盖到权威日志的位置
  sentAt: Timestamp; // CLI 时钟，供 clockOffset 估计
  payload:
    | { kind: "snapshot"; snapshot: S } // 整体替换
    | { kind: "deltas"; deltas: D[] };
}

type TopicWireFrame<S, D> =
  | {
      wireVersion: 3;
      kind: "complete";
      deliveryKind: "initial" | "online" | "recovery";
      logicalFrameId: string;
      logicalFrameOrdinal: number;
      topic: TopicKey;
      subscriptionId: string;
      frame: TopicFrame<S, D>;
    }
  | {
      wireVersion: 3;
      kind: "fragment";
      deliveryKind: "initial" | "online" | "recovery";
      logicalFrameId: string;
      logicalFrameOrdinal: number;
      topic: TopicKey;
      subscriptionId: string;
      fragmentIndex: number; // 0-based
      fragmentCount: number;
      logicalBytes: number; // canonical logical JSON 的 UTF-8 byte 数
      checksum: { algorithm: "crc32"; value: string }; // 传输完整性，不用于安全认证
      dataBase64: string;
    };
```

```ts
interface ReservedTopicFrame<F> {
  deliveryKind: "initial" | "online" | "recovery";
  logicalFrameId: string;
  logicalFrameOrdinal: number;
  frame: F;
  commit(): boolean; // false = unsubscribe/re-subscribe 后的 stale reservation
}
```

Restrições:

- Um `TopicFrame` é um quadro lógico que deve ser aplicado atomicamente; um fragmento não é um quadro de seq independente e não pode alterar `(fromSeq,toSeq]`.
- `deliveryKind` é o fato autoritativo da reservation do publisher: o initial do subscribe = `initial`, o flush online normal (inclusive o overflow snapshot iniciado pelo próprio publisher) = `online`, e o resync explícito na mesma assinatura = `recovery`. O encoder copia o valor da mesma reservation para cada fragmento, e o assembler verifica que todos os fragmentos concordam e o entrega ao consumer junto do evento de complete/fault. Campo ausente, valor falso ou divergência entre fragmentos do mesmo grupo são rejeitados; a UI não pode inferir isso pelo timing do RPC, por continuação de Promise ou pelo "primeiro quadro após o resync".
- **Cada quadro JSON/RPC físico, junto com o envelope, é estritamente `<= maxFrameBytes = 1 MiB`** (R-12). O encoder de topic deve tomar o máximo entre CLI NDJSON, binário Channel/Socket e o JSON externo base64 do relay mobile, descontando primeiro o overhead real do envelope e do base64 e só então fatiando; o upload de anexo não pode reutilizar o RPC de dados completos, e deve ser fatiado em requisições pequenas e independentes pela transação begin/chunk/commit de §6.5, medindo com parâmetros reais tanto na entrada Channel quanto na entrada CLI NDJSON.
- O buffer do subscriber após profile filter + coalesce deve ser simultaneamente `<=500 ops` e `<=max(1 MiB, limite superior conservador do snapshot de wire atual)` (o motivo da revisão do limite em bytes está em 05 §3); se qualquer um dos limites for excedido, o buffer daquela assinatura é esvaziado, a assinatura é marcada para resync e o próximo envio é apenas o snapshot mais recente — nunca dividindo o delta excedente em vários quadros lógicos que ainda poderiam ficar inconsistentes.
- Quadro lógico snapshot/resume muito grande usa o envelope `fragment`; o limite por montagem é 16 MiB e no máximo 1.024 fragmentos; por consumidor há no máximo 32 montagens concorrentes, 32 MiB de staging decodificado e timeout de 30s contados do primeiro fragmento. O service só valida o candidato externo roteável; o assembler, depois do filtro de ownership, valida range/base64/checksum/schema lógico e produz uma fault tipada — é proibido descartar silenciosamente quadros ruins antes disso.
- O publisher atribui um `logicalFrameOrdinal` estritamente crescente por assinatura; numa nova tentativa da mesma reservation, tanto o ordinal quanto o id permanecem. Um wire atrasado abaixo do tombstone é descartado silenciosamente, e o mesmo ordinal com id diferente gera `proto.frameAssemblyOrdinalConflict`; complete, fault, timeout e abort do consumer preservam o tombstone até o unsubscribe ou a troca de geração.
- O `reserve` do publisher não limpa o buffer nem avança o `sentSeq`; o commit só ocorre depois que todo o wire físico foi aceito pela fila da conexão atual. Uma falha de codificação no initial deve reverter a assinatura, a reservation in-flight e o estado de flush; um re-subscribe que falhou também precisa restaurar a assinatura/mapeamento antigo para que o cliente que ainda tem o subId antigo continue recebendo fluxo. Depois de um cancelamento/resubscribe bem-sucedido, um commit atrasado retorna false.
- Se a admission de nova entrada/anexo fizer a projection transmitível exceder 16 MiB, é obrigatório `rejected/failed` explicitamente; um tool output grande em execução vira uma referência de artifact ou head+tail, e se o texto do modelo ainda ultrapassar o limite o turno termina com uma protocol fault explícita. Nenhum caminho pode truncar snapshot silenciosamente.
- **A prioridade existe apenas entre topics** (controle/ACK > sessions-index > conversation rows > área de rollback do terminal); **dentro do mesmo topic os quadros são estritamente seriais por seq**, e nenhuma implementação pode deixar um quadro da área A ultrapassar um frame de rows (R-11).

### 3.3 Algoritmo de apply no cliente (pseudocódigo normativo)

```ts
function onWireFrame(store, wireFrame) {
  const { frame, deliveryKind } = assembleAndValidateAtomically(wireFrame, {
    maxBytes: 16 * 1024 * 1024,
  });
  if (!frame) return; // 未集齐时 store 不变；assembly 失败由该函数 single-flight resync
  if (frame.subscriptionId !== store.subscriptionId) return; // ① 旧代际帧：静默丢弃
  if (frame.payload.kind === "snapshot") {
    store.replaceAll(frame.payload.snapshot); // ② 整体替换，绝不 merge
    store.seq = frame.toSeq;
    store.hasAppliedBase = true;
    // online overflow snapshot 可建立 base，但只有 recovery 信封能证明本 flight 已交付。
    if (deliveryKind === "recovery") markRecoveryFrameSeen(store);
    refetchAroundScrollAnchor(store); // R-18：按锚点 rowId 回填可视范围
    return;
  }
  if (frame.toSeq <= store.seq) {
    // aligned `(N,N]` / fully-subsumed recovery 不改 projection，但仍完成 recovery 交付条件。
    if (deliveryKind === "recovery") markRecoveryFrameSeen(store);
    return; // ③ 迟到/重复帧：静默丢弃
  }
  if (deliveryKind === "online" && store.recoveryFlight) {
    // recovery 已 apply 后的 non-duplicate online 记作 ACK 后 successor；此前到达的
    // online 已由 recovery 区间覆盖。online 不能清除当前 flight。
    if (store.recoveryFlight.validFrameSeen) markSuccessorRecoveryNeeded(store);
    return;
  }
  if (frame.fromSeq !== store.seq) {
    resyncOnce(store, {
      forceSnapshot: deliveryKind === "recovery" && store.recoveryMode === "resume",
    });
    return;
  } // ④ gap：single-flight；resume 再 gap 强制 snapshot
  applyDeltasAtomically(store, frame.payload.deltas); // ⑤ §4.5 的 op 语义
  store.seq = frame.toSeq;
  store.hasAppliedBase = true;
  if (deliveryKind === "recovery") markRecoveryFrameSeen(store);
}
```

Os três ramos (②substituição completa / ③descarte / ④reassinatura) formam um conjunto fechado; não existe no cliente nenhum caminho de código de "compensação por cache / reordenação fora de ordem / adivinhação de lacuna". Após a reconstrução do attachment ou uma mudança de `logEpoch` do CLI há reassinatura automática; todos os quadros antigos anteriores ao novo subId efetivo são descartados silenciosamente.

Um flight de recuperação por gap/fault é isolado por `(topic,subscriptionId)` e dura até que um quadro lógico com `deliveryKind="recovery"` seja completamente verificado e aceito; o ACK do RPC em si não encerra o flight. Se um quadro de recuperação com `mode="resume"` tiver gap novamente, o flight original é promovido a um pedido de `forceSnapshot=true`. As marcas d'água/flights de conversation, sessions-index e workspace-config não são compartilhadas; a recuperação de um topic não pode substituir a assinatura irmã.

`markRecoveryFrameSeen` apenas registra que um quadro lógico de recuperação completo e validado chegou; o flight só é encerrado quando ele e o ACK correspondente são satisfeitos. Mesmo que o quadro seja um `(N,N]` alinhado, ou que seu `toSeq` esteja totalmente coberto por um snapshot autoritativo mais novo, a marcação precisa ser feita sem modificar novamente a projection, para que uma recuperação de mudança zero não fique pendurada para sempre.

Quando uma falha de montagem do initial do subscribe original vira um resync na mesma assinatura, o consumer deve antes limpar o `awaitingInitial` daquela assinatura. A decisão de um recovery frame/fault tem prioridade sobre o estado do subscribe initial; caso contrário um gap de recuperação seria interpretado erroneamente como um novo subscribe. Um `online` duplicado tardio, mesmo que apareça antes do ACK do resync, só pode ser descartado silenciosamente como duplicata e não pode limpar nem consumir o flight de recuperação.

Após o ACK do resync e até o primeiro quadro lógico de recuperação completo há outro prazo de 30s (diferente do timeout de montagem, que só começa ao "receber o primeiro fragmento"). Se a notificação for totalmente perdida quando o prazo expirar, o resume só pode ser promovido uma única vez a force snapshot; uma nova tentativa de force pela UI que também expirar entra em ERROR explícito, e o task-index faz fresh-subscribe daquele topic. Se o recovery frame já foi aplicado mas, antes da continuação do ACK, chegar um gap online residual não duplicado, o ACK só pode encerrar o flight antigo e logo em seguida deve-se iniciar um resync sucessor normal a partir do novo base; o gap não pode ser engolido em silêncio nem ser promovido indevidamente a um force do tipo recovery.

Um restart do runtime é a fronteira de full re-subscribe: o emissor de quadros de nível workspace permanece vivo quando o runtime é invalidado, e os conversation stores active/keep-warm da SessionDataLayer, o SessionsIndexStore e o task-index reassinam exatamente uma vez ao receber a epoch de restart. Apenas um teardown real de workspace/service destrói o emissor.

### 3.4 Envelope do transporte Channel raw no mobile

Uma mensagem raw de Channel do attachment mobile shared-host usa uma camada de fragmentação de transporte própria: não se pode tratar um fragmento de topic como fragmento de raw RPC, nem contornar a admission com compressão de WebSocket:

```ts
type RpcTransportPayload =
  | {
      zcode_type: "rpc-frame";
      bridgeSessionId: string;
      bridgeGeneration?: number;
      recoveryId?: string;
      seq: number;
      messageSeq: number;
      fragmentIndex: number;
      fragmentCount: number;
      messageBytes: number;
      checksum: { algorithm: "crc32"; value: string };
      dataBase64: string;
    }
  | {
      zcode_type: "rpc-frame-ack";
      bridgeSessionId: string;
      bridgeGeneration?: number;
      recoveryId?: string;
      ackMessageSeq: number;
    };
```

`seq` é o número de sequência da peça física e `messageSeq` é o número de sequência da mensagem raw de Channel atômica; ambos são inteiros seguros dentro da mesma identidade de bridge. O encoder precisa medir com precisão o JSON de dados do relay final não comprimido, com peça única `<=1 MiB` e mensagem lógica `<=16 MiB / 64 fragmentos`. O RX faz staging de apenas uma mensagem por direção, com timeout de 30s a partir do primeiro fragmento; um mismatch de identidade não consome o orçamento de montagem; fragmentos repetidos active/last-settled não são entregues de novo, e conflito, gap, base64 inválido, comprimento ou CRC divergentes geram uma fault tipada; um seq físico anterior é um no-op conforme a marca d'água cumulativa de entrega. Uma mensagem raw completa só pode ser entregue atomicamente 0 ou 1 vez. Depois que `seq`/`messageSeq` atingirem `Number.MAX_SAFE_INTEGER`, só se permite fechar nesse limite, e o tráfego sucessor precisa usar uma nova bridge generation, sem wrap-around.

O ACK cumulativo raw pertence apenas à contabilidade de replay de transporte e não equivale ao ACK de command de §6.2 nem a um fato de transcript; enquanto a primeira mensagem não estiver completa, uma duplicata não gera ACK de wire, e somente um `ackMessageSeq` positivo já completado pode confirmar cumulativamente. O resultado de execução de um gap raw é desconhecido: é preciso um hard rebuild do attachment, e não é permitido fazer resync por conta própria depois de interpretar o topic em relay/main.

04D-3 já migrou atomicamente o desktop main/mobile web para um adapter acknowledged de escopo bridge e bidirecional; o parser global do app passou a aceitar oficialmente o novo fragment/ACK estrito e o branch legado de `rpc-frame` de peça única foi removido. O payload de transporte raw só é entregue ao adapter de bridge atual e não pode ser consumido por um app requester comum nem pela rota antiga de Channel peça a peça.

O estado normativo do adapter acknowledged em produção é:

```text
TX reserve(batch, exactOuterBytes, queuedAt)
  -> replay total <=8MiB
  -> immutable FIFO send / same-bridge replay
  -> cumulative ACK releases batch prefix

RX assemble(one message, firstSeenAt)
  -> synchronous raw Channel delivery
  -> latest cumulative ACK, control-first flush
```

- Cada lote conclui a admission dos outer bytes finais antes do envio do primeiro fragmento; é proibido emitir parte de uma mensagem lógica e só então descobrir um replay de `8MiB+1`. `unacknowledgedBytes` conta apenas lotes de dados não ACKados, não os ACKs.
- O `measureFrameBytes(frame)` do adapter em produção e o `sendFrame` estão ligados ao mesmo serializer/cache imutável do envelope final; o envio inicial e o replay no mesmo bridge reutilizam exatamente os mesmos bytes de JSON, e é proibido que a admission e a escrita no WebSocket sejam medidas separadamente ou que a variação de timestamp faça o razão de contas derivar.
- high/low padrão `1MiB/256KiB`, com bordas de estado em `> high` e `<= low` respectively; saturação contínua ou ACK repetido não notificam de novo.
- As entradas reserve/flush/replay e cada ACK/data physical send verificam sincronamente a idade de 45s; o timer é apenas um mecanismo de despertar e não pode ser o único enforcement.
- As opções de replay bytes/grace e de timeout de montagem só podem restringir os hard caps `8MiB/45s/30s`, nunca afrouxá-los.
- O limite superior de um ACK futuro é o maior `messageSeq` já aceito integralmente pelo transporte local; lotes reserved/partial não podem ser ACKados.
- O ACK cumulativo pendente mantém apenas o valor máximo e tem prioridade no flush; a idade de 45s do primeiro ACK pendente não é renovada por um valor cumulativo maior. Quando a entrega completa lança erro, não se deve ACK; entra-se diretamente em um único estado terminal degraded; o replay no mesmo bridge mantém os mesmos physical/message seq e a idade original de 45s.
- O adapter precisa tolerar `sendFrame` reentrando sincronamente um ACK para o próprio lado e garantir que as mutações de estado sejam serializadas.
- O `ConnectionFlowControl` público expõe em modo somente leitura bytes e eventos de saturated/drained; o mobile em produção leva o estado até o CLI pelo sideband MessagePort `connection-flow-v1` e pelo `v4/connection/flow` confiável. Um service method orientado a UI precisa rejeitar caller terminal; apenas host scope fora do plano de controle RPC e o namespace trusted-host-relay podem injetar connectionId.
- O `pausedConnections` do CLI só afeta a conexão correspondente: SAT limpa o timer daquela conexão e faz uma segunda checagem antes do reserve; o ingest e as conexões irmãs continuam. DRN só faz flush naquela conexão, e overflow/needsResync enviam naturalmente o snapshot mais recente; closed limpa o pause, e o unsubscribe owned limpa o estado do publisher separadamente.
- Um payload comum de app do desktop main ainda pode entrar num buffer curto e limitado, mas quadros e ACKs raw ignoram esse buffer, e o adapter é o único dono do replay. Em ambos os lados, as mensagens raw de WebSocket passam por um gate UTF-8 de 1 MiB antes do `JSON.parse`; a compressão não altera a admission. Uma fault raw dispara apenas uma recuperação hard de bridge, e a nova bridge não herda lotes não ACKados antigos.

### 3.5 Declaração do quinteto de topic

```ts
interface TopicDeclaration<S, D> {
  keyPattern: string; // "conversation/*"
  snapshotSchema: ZodSchema<S>;
  deltaSchema: ZodSchema<D>;
  coalesce: (deltas: D[]) => D[]; // 纯函数，@zcode/protocol 内，黄金测试复用
  resync: "snapshot"; // 溢出/断号时的重对齐动作（当前所有 topic 均为 snapshot）
}
```

### 3.6 Delivery profile

```ts
interface DeliveryProfile {
  flushWindowMs: number; // 通道层唯一合并点的窗口
  streamPaths: Record<StreamablePath, boolean>; // 哪些路径流式下发
  streamOutputCapBytes: number; // 流式期 output.text 上限（0 = 不流式）
  toolProgress: boolean; // 运行中是否下发 ToolProgress
}

const DELIVERY_PROFILES = {
  continuous: {
    flushWindowMs: 30,
    streamPaths: { text: true, inputText: true, "output.text": true, summaryText: true },
    streamOutputCapBytes: 262144,
    toolProgress: false,
  },
  replayable: {
    flushWindowMs: 150,
    streamPaths: { text: true, inputText: false, "output.text": false, summaryText: false },
    streamOutputCapBytes: 0,
    toolProgress: true,
  },
} satisfies Record<string, DeliveryProfile>;
```

- O profile é injetado apenas pelo `clientMode` confiável: desktop/SSH/WSL/Docker=`continuous`; mobile remote/WebSocket=`replayable`. `SubscribeParams` e a API orientada a UI não expõem a escolha.
- **O estado final é independente do profile** (R-10): em qualquer profile, na conclusão da ferramenta o `output` de `row.upserted` usa o mesmo conjunto de parâmetros de truncamento final (§8), e por isso o teste dourado de convergência pode afirmar "identical byte a byte no estado final".
- É proibido que o código do cliente contenha variáveis de profile (a pedra de toque de 05).
- Um evento filtrado pelo profile tem de ser encerrado por algum evento não filtrável (invariante de 05).

---

## 4. Topic conversation

`TopicKey = "conversation/<sessionId>"`. Snapshot = `ConversationSnapshot`, Delta = `ConversationDelta`.

### 4.1 Visão geral do snapshot

```ts
interface ConversationSnapshot {
  protocolVersion: 1; // projection schema version；不等于 wire protocolVersion=3
  sessionId: string;
  logEpoch: string;
  seq: number; // 快照对齐水位（= 所在帧 toSeq；从内存投影原子取值，R-03）
  revision: number;

  // ── A 区：小对象区。更新语义 = 字段级整体替换（state.updated），绝不深合并 ──
  control: SessionControl;
  availability: SessionActionAvailability;
  inputRouting: InputRouting;
  config: SessionConfigState; // G-01
  usage: SessionUsageState; // G-02
  queue: QueueState;
  pendingInteractions: PendingInteraction[];
  pendingCommands: CommandStateSummary[];
  backgroundWorks: BackgroundWorkSummary[]; // G-03
  workflowRuns?: WorkflowRunsState; // dwf 运行态；唯一另有键化增量 op 的键（§4.5）
  goal: GoalState | null;
  plan: PlanState | null; // G-04

  // ── B 区：rows。唯一使用 patch 的集合 ──
  rows: RowsWindow;
}

interface RowsWindow {
  window: ConversationRow[]; // 尾部窗口，rowId 升序（大小见 §8）
  totalCount: number; // 当前全序行数（截断后会减小；仅用于滚动条估计）
  firstRowId: number | null; // 全序第一行 rowId；window 首行等于它 ⇔ 已到顶（游标分页判定，R-06）
}
```

### 4.2 Campos da área A

#### 4.2.1 SessionControl

```ts
interface SessionControl {
  phase: "draft" | "prewarming" | "running" | "completedSuccess" | "completedInterrupted" | "error";
  // 裁决（2026-07-05，推翻 P2）：保留 "draft"——产品需要「先建空会话再输入」。
  // draft 生命周期（默认口径，可调）：纯内存态 + sessions-index 可见；无任何 turn/row；
  // 不落盘，CLI 重启即消失；firstInput 到达（sendText）→ prewarming/running。
  // 与客户端 null pane 区分：pane 绑 null 是纯本地布局态，尚未 createSession；
  // pane 绑 draft session 则服务端已有会话实体，多端可见。
  sessionEnded: boolean; // = phase ∈ completed*（派生值，为 UI 便利保留；见 §10-D7）
  canStop: boolean;
  stopState: "idle" | "stoppable" | "stopping";
  stopTargetKind:
    | "assistant"
    | "tool"
    | "subagent"
    | "compact"
    | "goalVerifier"
    | "goalContinuation"
    | "turnSteer"
    | "mixed"
    | "unknown"; // + turnSteer（D-02）
  activeWorks: ActiveWorkSummary[]; // 轻量证据/悬浮提示用，UI 不得据此推导 flag
  lastError: SessionErrorInfo | null;
  apiRetry: ApiRetryState | null; // provider 请求重试提示（P2-12）
}

interface ActiveWorkSummary {
  kind:
    | "primaryTurn"
    | "foregroundSubagent"
    | "compact"
    | "goalVerifier"
    | "goalContinuation"
    | "turnSteer";
  startedAt: Timestamp;
}

interface SessionErrorInfo {
  code: string; // fault catalog 命名空间（G-12），如 "provider.rateLimited"
  message: string; // 已本地化的展示文案由客户端按 code 生成；此处为兜底英文
  recoverable: boolean; // true → UI 提供重试入口（配合 rows 上的 canRetry）
  at: Timestamp;
  source: "provider" | "runtime" | "tool" | "network";
}

interface ApiRetryState {
  attempt: number; // 当前第几次重试
  maxAttempts: number;
  nextRetryAt: Timestamp; // 客户端可倒计时
  reasonCode: string;
}
```

- `hasBackgroundWork` foi removido de control: = `backgroundWorks.some(w => w.status === "running")`, derivado em uma linha pelo cliente (§10-D7).
- Qualquer alteração em um campo de `control` reenvia o objeto inteiro (no máximo uma mensagem por janela de flush após a conflação).

#### 4.2.2 SessionActionAvailability e InputRouting

```ts
type ActionAvailability = { allowed: true } | { allowed: false; reasonCode: string }; // reasonCode = product-protocol guard id，驱动禁用态 tooltip

interface SessionActionAvailability {
  fork: ActionAvailability; // session 级 operation lock；具体目标资格看 row.actions.canFork
  compact: ActionAvailability; // manualCompact / runningCompactQueues / *OperationLock
  switchModelConfig: ActionAvailability;
  setFollowupMode: ActionAvailability;
  queueEdit: ActionAvailability; // editQueueItem / reorderQueueItem / deleteQueueItem（queueContentIndependence）
  sendQueuedNow: ActionAvailability; // sendQueuedNowStopsBeforeDrain / *OperationLock
  resumeGoal: ActionAvailability;
}

interface InputRouting {
  mode: "startNow" | "enqueue" | "guide" | "reject" | "choice";
  reasonCode?: string; // mode=reject 必带；mode=enqueue/guide/choice 可带（如 guide 不合格回退原因）
}
```

- `choice` (decisão de 2026-07-05, heldQueueInputRequiresChoice): no estado held (completed + queue>0 + autoDrain=false), a entrada no composer não é enfileirada silenciosamente — o cliente apresenta "enviar após limpar a queue / enviar mantendo a queue", e a disposition escolhida pelo usuário sobe junto do payload de `sendText`/`sendGoalCommand` (`heldQueueDisposition`), com o CLI decidindo conforme ela.
- Entrada durante compactação = `enqueue` (compactingAcceptsFutureInput, F04/F05/G05/G06): acrescenta à queue sem interromper o compact; `/compact` continua sendo rejeitado (duplicateCompactRejected → `compactOperationLock`).
- `mode=guide` é uma rota submeter, não disabled/reject. O Composer do V4 precisa manter o botão normal de envio e o Enter; o rascunho só é limpo depois que o CLI aceita e que o intent pode ser conciliado.
- `guide` só significa entrega inline no turn atual; o `enqueue` comum só significa um turn futuro. Os dois não podem ser consumidos pelo mesmo drain genérico de round-trip.

`availability.fork` só expressa o lock de sessão/global (especialmente compact); a legitimidade da linha de destino depende apenas de `RowActions.canFork` (§4.4.1). A UI precisa consumir esses dois campos autoritativos e é proibido inferir localmente por phase, posição no array ou raw message. edit/retry continuam tendo apenas qualificação em nível de linha.

#### 4.2.3 SessionConfigState (G-01)

```ts
interface SessionConfigState {
  provider: string; // provider id（model-provider catalog 命名空间）
  model: string; // model id
  thought: string; // 思考深度档位 id（catalog 定义的枚举值）
  thoughtLevels: string[]; // 当前 provider/model 的实际可选档位；与模型选型原子更新
  followupMode: "queue" | "guide";
  mode: string; // agent 协作模式（core CollaborationMode；M5 additive，schema 带 default="build"）
}
```

- Caminho de escrita por evento: command `switchModelConfig` / `setFollowupMode` / `switchCollaborationMode` (M5 aditivo) → guard → evento (ModelSelected / FollowupModeChanged / SessionModeChanged) → reenvio deste campo inteiro. `ModelSelected` precisa carregar o `thoughtLevels` e o `contextWindow` do runtime após a troca, de modo que `provider/model/thought/thoughtLevels` e a janela real daquele modelo convirjam atomicamente na mesma revision. O UI dos seletores no cliente é um overlay otimista (pendurado por commandId) e converge assim que o valor autoritativo chega — **não existe lógica de merge entre "valor escolhido localmente" e "valor refletido"** (isso elimina o grupo de remendos P2-10).
- A dica de timeline da troca de modelo é gerada pelo CLI, no início do próximo turn, como uma linha marker `modelChange` (R-17); no protocolo não existe estado de "marker pendente".
  - **Detalhes de momento do R-17 (decisão de cinco medições em 2026-07-07, fronteira de thought-only ratificada em 2026-07-08)**: a base de comparação do marker = **a identidade de modelo usada pelo último turn efetivamente iniciado**, e a identidade de modelo contém apenas `provider/model`, sem `thought`. Consequências: ① mexer em qualquer seletor no estado de rascunho/antes do primeiro turno não gera marker (o primeiro turno inicia com a escolha final, e "usar X pela primeira vez" não é uma "mudança"); ② trocar A→B→A durante a edição tem mudança líquida zero e o próximo turno não gera marker; ③ mudar apenas a profundidade de pensamento (por exemplo `high → max`) atualiza `config.thought` e os parâmetros da requisição, mas não gera `modelChange`; ④ o feedback imediato da ação de troca é **lógica puramente de UI** (toast) e não entra na timeline. Posição do marker: imediatamente antes da linha turnHeader do novo turn.
  - **Detalhes de exibição do R-17 (2026-07-29, correção de texto em 2026-07-29)**: `fromProvider/fromModel/toProvider/toModel` do marker são a identidade de modelo completa, e a semântica de comparação não muda por causa de recorte de exibição. O renderer usa o snapshot de provider atual para mapear o ID de provider em `provider.name`; fornecedores embutidos Z.ai / BigModel mostram apenas o modelId, outros fornecedores são exibidos como `provider.name/modelId`, e quando a configuração foi removida ou ainda não foi hidratada há fallback para `providerId/modelId`. Essa regra é consistente com o disparador de modelo e com o toast, e não muda o schema do marker, o momento de geração nem a semântica de replay.

**Semântica de seed do config (R-19, decisão de 2026-07-07; encerra o TODO de M6 "canal de seed sem revision na fase draft")**:

- **O `config` do primeiro snapshot precisa ser igual ao valor real do runtime**: `provider/model/thought` = a escolha de modelo atual do runtime (incluindo o modelo padrão do catálogo do workspace na inicialização / o resultado da resolução de preferências persistidas), `thoughtLevels` = o resultado de `listThoughtLevels()` para o modelo atual desse runtime, e `mode` = o modo de colaboração atual do runtime (incluindo a preferência de permission mode persistida no projeto). É proibido usar `provider/model` vazio, `mode="build"` fixo ou os cinco níveis genéricos do cliente como valor inicial.
- **O canal de seed = a construção do snapshot, não um delta de evento**: o seed é lido do runtime e injetado na inicialização da projection (`getModelRef()` / `getMode()` / nível de pensamento), não gera `state.updated` nem incrementa a revision — a decisão de draft "sem delta visível, sem bump de revision" (§4.2.1) não é quebrada. A regra de progressão de revision do R-04 permanece: apenas uma **mudança** em config incrementa; o seed é valor inicial, não mudança.
- **Recuperação fria com o mesmo critério**: ao reconstruir a projection por hydration do transcript / cold resume, ela é primeiro semeada pelo valor real do runtime e então sobrescrita pela reprodução de ModelSelected / SessionModeChanged do log (a reprodução vem depois do seed, e o valor final segue o log).
- **A hydration não perde a live tail**: a primeira reconstrução é single-flight por sessão; os raw events que chegam entre a leitura do snapshot do memory eventStore e a substituição pelo publisher vão para um buffer temporário. A raw sequence pode chegar fora de ordem por causa dos awaits de persistência de cada evento, então é preciso fazer staging por `sourceEventSeq+1` e drenar continuamente, sem descartar fatos tardios de queue/stream com o critério "já vi um seq maior". A sequência sintetizada e o raw seq do runtime estabelecem um offset monotônico pelo cursor do snapshot, e eventId + cursor servem apenas para remover duplicatas reais já presentes no snapshot.
- **O momento da primeira assinatura não pode alterar o snapshot final**: se a primeira resposta do turno já tiver sido concluída antes do primeiro `subscribe` do cliente, a hydration fria precisa reconstruir a partir das mensagens/partes duráveis exatamente o mesmo estado final visível do caminho live com assinatura antecipada, incluindo o corpo de user e assistant já persistido. `providerVisibility` e `uiVisibility` / `transcriptVisibility` são dimensões ortogonais; um `assistant_response` normal é visível ao provider, à UI e ao transcript ao mesmo tempo e não pode ser classificado como provider-context-only só porque `providerVisibility=visible`. O desktop `desktop-continuous` e o mobile `web-remote-replayable` podem ter estratégias diferentes de entrega de quadros intermediários, mas o primeiro snapshot completo do mesmo transcript durável precisa ser idêntico. É proibido mascarar essa invariante com provider atrasado, assinatura antecipada, retry ou preenchimento de quadros pelo cliente.
- **Fontes de seed por cenário (prioridade fixada, para evitar que a implementação uniformemente leia o default do workspace e sobrescreva o histórico da sessão)**:
  - Nova sessão (primeiro envio no rascunho): `createSession.config` (a escolha prévia do usuário) > default de inicialização do runtime (modelo padrão do catálogo do workspace / preferência de mode persistida no projeto).
  - Recuperação de sessão histórica: **a seleção histórica da própria sessão tem precedência** — `derivePersistedRuntimeSettings` obtém, das mensagens persistidas em ordem inversa, o último model usado (com o thought carregado em `modelRef.variant`) e o mode, e os grava de volta no runtime via `reconcileResumedRuntimeSettings`. O modelo precisa ser resolvido no Registry do Environment atual; o Provider Refactor já removeu a sobrescrita autoritativa `runtimeModel` enviada pelo App. O gateway do V4 usa uma promise READY para serializar a ativação do runtime com a hydration da projection; não é permitido construir nem retornar um legacy session snapshot completo para o V4. O antigo `session/resume` continua compatível embrulhado em `activation + legacy snapshot`. **A leitura do seed precisa acontecer depois da activation concluída** (a ordem do gateway é activation → hydrate), e a semântica de produto é "abrir uma sessão histórica seleciona por padrão o modelo e a profundidade de pensamento anteriores". Os limites completos estão em [17-cold-resume-runtime-activation.md](./17-cold-resume-runtime-activation.md).
  - Troca dentro da sessão: eventos de command (ModelSelected / SessionModeChanged) sobrescrevem, conforme o caminho de escrita acima.
- **O `createSession.config` precisa ser consumido**: quando o payload carrega config parcial (a escolha antecipada da UI no estado de rascunho, ver m5-composer-parity §cinco), o CLI, na criação da sessão, combina "config solicitada sobrepõe o default do runtime" para obter o valor inicial e depois injeta esse valor na projection pelo canal de seed acima; campos ausentes voltam ao valor real do runtime. A implementação atual apenas recebe o campo no schema e o handler não o consome — é uma lacuna de implementação.
- **Um ACK de troca com o mesmo valor precisa ser distinguível**: quando `switchModelConfig` / `switchCollaborationMode` atingem o valor atual do runtime, respondem `noop` + `reasonCode="config.unchanged"`, e não podem ser absorvidos silenciosamente como accepted (sem result). Depois do alinhamento do seed, "valor exibido na UI = valor real do runtime" vale, e só então a semântica de noop é precisa.
- Registro de bug (2026-07-07, primeiro teste do desktop do v4): a falta do seed causou duas falhas visíveis ao usuário — ① o seletor de modelo da nova sessão aparecia vazio (`ModelSelected` só era reemitido depois de um switchModelConfig, sem nenhum momento inicial em toda a cadeia); ② com mode=yolo persistido no projeto, a UI mostrava build ("confirmar antes de mudar") conforme o seed, e clicar em yolo caía no retorno antecipado de mesmo valor do handler (sem evento), de modo que a UI nunca convergia. Mesma raiz: **a comparação de mesmo valor usa o valor real do runtime, a exibição da UI usa o seed da projection e não havia momento de alinhamento entre os dois lados**.
- Registro de bug (2026-07-16, E11/FX11): o snapshot antigo só projeta o `thought` atual, e não projeta "quais thoughts o modelo atual suporta". A sessão pai ainda pode ler o catálogo do cache legado de task config, mas o child de fork, sem esse cache, volta aos cinco níveis fixos da UI, fazendo até o GLM-5.2 mostrar cinco níveis. A capacidade faz parte da tupla de configuração do modelo e precisa entrar no mesmo snapshot/evento a partir do runtime do child; não pode ser adivinhada por localStorage, pelo catálogo do workspace ou por fallback do cliente.

#### 4.2.4 SessionUsageState (G-02)

```ts
interface SessionUsageState {
  contextWindow: {
    usedTokens: number;
    maxTokens: number;
    autoCompactThresholdTokens: number | null; // null = auto compact 关闭
  } | null; // null = 尚无一次模型往返
  cumulative: {
    // 会话累计（跨 compact 累计，不回退）
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  };
}
```

Semântica de conflação: valores inalterados não são enviados (P-05); a substituição inteira da área A garante que bugs do tipo "sobrescrever um used positivo com 0" não tenham onde crescer. Faturamento/cota (coding plan) não pertence ao topic conversation, e sim ao domínio de usage.

**Semântica de janela na troca de modelo (2026-07-17)**: `usedTokens` representa o uso atual do contexto histórico e não é recalculado ao trocar de modelo; `maxTokens` representa a janela do modelo já aplicado pelo runtime e precisa ser substituído imediatamente junto com `ModelSelected.contextWindow`, atualizando ao mesmo tempo o `contextWindowMax` interno da projection usado no fallback de `ModelComplete`. Eventos persistidos antigos podem não ter esse campo; nesse caso se mantém a janela existente e se espera a calibração por um evento posterior do runtime que traga a janela. É proibido que o renderer sobrescreva esse campo a partir do catálogo de modelos, senão o override de runtime da sessão, o registry remoto e o catálogo da UI voltam a formar uma corrida de múltiplas fontes.

- Registro de bug (2026-07-17): depois de trocar do modelo A para o B em uma sessão histórica, o runtime aplicou corretamente a context window de B, mas o `ModelSelected` antigo publicava apenas o modelo e as capacidades de pensamento, e a projection do V4 só via a janela de B no `ModelComplete` seguinte, fazendo a barra de ferramentas mostrar por muito tempo o denominador de capacidade de A. A causa raiz é a publicação incompleta da tupla de capacidades do modelo, não um cache do React nem uma falha na troca do runtime.

#### 4.2.5 QueueState (D-03 / R-07)

```ts
interface QueueState {
  items: QueueItem[]; // 消费顺序 = 数组顺序
  autoDrain: boolean; // stop 后 = false（held）；setAutoDrain 恢复
}

interface ConversationInputIntent {
  sourceCommandId: string; // 原始 commandId，queue/runtime/transcript 全程不换
  queueItemId: string; // admission 时分配，edit/reorder/reserve/drain 均不变
  clientId: string;
  kind: "sendText" | "sendGoalCommand";
  text: string; // 用户原文（R-07：/goal 存原文，objective 解析后放 goal 状态）
  attachments: AttachmentRef[]; // 无附件为 []，避免 queue/drain 路径漏字段
  delivery: {
    requested: "auto" | "startNow" | "queue" | "guide";
    admitted: "startNow" | "queue" | "guide";
    fallbackReasonCode?: string;
  };
  order: {
    admissionSeq: number; // CLI CommandInbox 串行 admission 顺序
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
  admittedAt: Timestamp;
}

type QueueItem = ConversationInputIntent & {
  dispatch: ConversationInputIntent["dispatch"] & {
    state: "queued" | "reserved" | "promoting";
  };
};
```

Regras de conservação da entrada e de fallback:

- Toda entrada busy/running já submetida por desktop/mobile entra primeiro no mesmo FIFO `CommandInbox` do CLI, com a ordem definida por `order.admissionSeq`; o mobile V4 não usa mais uma segunda fila no host runtime.
- Quando guide não se aplica, quando há anexos, ou quando compact/verifier está busy, o mesmo intent (texto original, anexos, clientId e sourceCommandId inalterados) volta para a queue comum, registrando `delivery.fallbackReasonCode`/`steer.state="fellBack"`.
- Um guide elegível pode esperar antes de surgir uma chamada de ferramenta; depois que todos os tool results irmãos de um model step (com sucesso ou falha) forem submetidos, o runtime pode drenar no máximo um guide inline antes de iniciar a próxima requisição ao provider do mesmo product turn. A conclusão de um único sibling em paralelo não pode drenar antes da hora, e vários guides não podem ser esvaziados de uma vez no mesmo batch.
- Se o turn atual text-only completar, for parado ou interrompido e não tiver formado um batch de tool results utilizável, o guide não drenado precisa ser redirecionado no lugar para a queue por um fato explícito de delivery/fallback; `sourceCommandId`/`queueItemId`/`clientId`/`admissionSeq`/`payload` permanecem todos iguais, e a projeção live/cold converge de forma idêntica.
- A promoção automática da queue comum exige simultaneamente `autoDrain=true`, sessão pronta/sem controller ativo e `target` inexistente ou com `target.status=complete`. Esse guard cobre todos os kinds: texto, goal command e compact; um marker de verificação sozinho não destrava.
- Um verifier explicitamente aprovado e o fail-open gravam primeiro `passed=true` e atualizam o target para complete, e só então reavaliam a queue normalmente; um Stop/abort manual é cancelled/failed + target paused + `autoDrain=false`, e não conta como aprovação. A reservation + barreira de Stop do `sendQueuedNow` é a exceção explícita.
- Rejeição por vazio/excedente/runtime devolve `rejected/failed` explícito; a UI preserva o texto e os anexos e não pode limpar primeiro e depois falhar em silêncio.
- `editQueueItem` atualiza no lugar, preservando ID, posição, anexos e command de origem; `reorderQueueItem`/`deleteQueueItem`/`drain` operam o mesmo intent por `queueItemId`.
- O drain e as row/message anchors de guided precisam reutilizar o `sourceCommandId` original e não podem passar a usar o commandId da promoção ou do send-now.
- `sendQueuedNow` é fixo como `reserve → stop barrier → start/promote → remove`; a remoção ocorre só se a inicialização tiver sucesso. Timeout/falha libera a reservation e o item original fica intacto; cliques consecutivos e cliques de vários dispositivos só podem ter um dono da reservation.

A reservation de `sendQueuedNow` é mantida pelo runtime do CLI por `queueItemId`, e `TurnSteerDispatchChanged` projeta `queued/reserved/promoting` no QueueItem. A cabeça da fila em estado reserved proíbe o drain comum de round-trip, e um delete comum também precisa manter a mesma reservationId; na promoção a entrada só pode ser restaurada a partir do QueueItem completo, `inputId` continua usando o `sourceCommandId` original, e é proibido degradar para text-only ou usar o commandId do send-now. Uma falha antes da barreira de start volta a `queued`; depois do start admitted, se o remove lançar erro o estado permanece `promoting`, e é proibido liberar e executar de novo.

O motivo `promoted` do `remove` só retira o item da projeção da queue e não pode colocar o session-input ledger em cancelled: a user message de um turn de texto só é gravada no início da execução em segundo plano, e um cancelled antecipado recriaria a janela de crash "a queue já sumiu → o transcript ainda não foi persistido". O ledger permanece admitted até que message/parts e ledger sejam submetidos na mesma transação; depois da submissão envia-se `SessionInputPromoted`, o gateway invalida primeiro o seed da query de transcript antiga e só então libera o pin live do CommandInbox. Se o CLI sair antes da submissão, a varredura de recuperação de restart coloca explicitamente os admitted em `discarded(session_resumed)`.

A fila só é confiável dentro do processo CLI atual. Depois de um restart do CLI, uma entrada admitted que não entrou no transcript não retoma a execução: ela deixa um tombstone no ledger de inputs descartados; `commands/query` devolve `failed/fault.command.inputDiscardedOnRestart`, com o `delivery` persistente no resultado tipado. `queue/guide` e o `unknown` sem conclusão autoritativa são liquidados em silêncio pelo cliente, sem erro de UI; apenas um `startNow` que não entrou no transcript pode ser reenviado pelo usuário, com confirmação e um novo commandId.

`ConversationInputIntent` é o único fato de entrada após a admission do CLI e precisa ser validado por um schema estrito; `attachments` ausente é normalizado como `[]`. `inFlight` (em execução), `liveInputFacts` (ainda em queue/guide) e o `settled LRU` (512 entradas por sessão) são três tabelas: as duas primeiras são pinned e não podem ser descartadas pelo churn do LRU. O CLI aloca `order.admissionSeq` serialmente por sessão, e sessões diferentes podem correr em paralelo.

O limite de persistência fica congelado assim: `metadata.conversationInputIntent` da user message e `payload.conversationInputIntent` do session-input ledger guardam o objeto estrito completo; `message.anchor.sourceCommandId` guarda a âncora de deduplicação rápida. Um command de entrada grava o ledger antes de o handler de negócio executar (incluindo startNow/createSession.firstInput) e só então a UI pode receber accepted; os eventos de roteamento reais de queue/guide corrigem delivery/fallback de forma idempotente pelo mesmo `queueItemId`. A admission antes da execução também faz pin no CommandInbox, e só uma promoção atômica, um cancelamento/falha explícito ou o descarte podem liberá-la; ela não pode ser evictada pelo churn do LRU de 512. O primeiro envio no rascunho precisa passar antes pela fronteira unificada de persistência do runtime para estabelecer a FK da sessão, e só depois gravar o ledger; não se pode depender inversamente do startPromptTurn em segundo plano para criar a sessão, senão a admission falha na fronteira de FK e perde o registro autoritativo. O command key de `createSession.firstInput` pertence ao balde global `sessionId=null`, mas o ledger/transcript pertence à sessão recém-criada; o ledger precisa guardar adicionalmente `sourceCommandType="createSession"` e permitir reencontrar a sessão real, com `sessionId` desconhecido, pelo `queue_<sourceCommandId>` globalmente único. Depois da promoção atômica, uma retentativa com o mesmo commandId devolve o `result.sessionId` da primeira; no restart, um item ainda admitted é primeiro posto como discarded e devolve `fault.command.inputDiscardedOnRestart`, e é proibido criar uma segunda sessão.
O `metadata.inputIntent` de transcripts antigos serve apenas como seed de leitura de compatibilidade, e novas gravações não podem salvar só o seed. Internamente o runtime pode usar um portador em camadas `TurnInputIntentMetadata + input + unresolved attachments` para evitar dependência do pacote de wire, mas isso só pode produzir o objeto completo acima pelo mesmo adapter canônico; projection e hydration não podem deduzir delivery, steer ou dispatch por conta própria.

Efeitos bem-sucedidos sem user message usam `session_entry(type="v4/command_fact")` para guardar timeline/child ACK; o part de timeline do compact grava também `sourceCommandId`. Depois de um restart do CLI, os session-inputs antigos ainda admitted são fechados atomicamente como `discarded(session_resumed)` na primeira consulta persistida/recuperação, e `commands/query` precisa devolver `failed/fault.command.inputDiscardedOnRestart`, nunca unknown nem replay automático.

```text
query / execute 同 key
        |
        v
key gate(sessionId|null, commandId)
        |
        +--> inFlight / liveInputFacts / settled LRU
        |
        `--> persistent index fallback
                 |
                 `--> 新命令才进入 per-session admission gate
                              -> 分配 admissionSeq -> pin inFlight
```

#### 4.2.6 PendingInteraction (interação bloqueante → estado)

```ts
interface PendingInteraction {
  interactionId: string;
  kind: "permission" | "userInput";
  anchorRowId: number | null; // 挂在哪个 toolCall row 旁；null = 会话级（如 provider 交互）
  createdAt: Timestamp;
  payload: PermissionRequestPayload | UserInputRequestPayload;
}

interface PermissionRequestPayload {
  kind: "permission";
  toolCallId: string;
  toolName: string;
  summary: string; // 一行摘要（"运行 rm -rf dist"）
  detail: unknown; // 结构化详情（命令全文/路径/diff 预览 ref），按 toolName 渲染
  options: PermissionOption[];
}
interface PermissionOption {
  optionId: string;
  label: string;
  kind: "allowOnce" | "allowAlways" | "deny" | "custom";
}

interface UserInputRequestPayload {
  kind: "userInput";
  prompt: string;
  freeText: boolean; // 允许自由文本
  options?: { optionId: string; label: string }[];
  sensitive?: boolean; // true → 输入框按密码处理，客户端不入草稿/历史
  toolName?: string; // AskUserQuestion / ExitPlanMode 等触发源工具
  toolCallId?: string;
  traceId?: string;
  input?: unknown; // 原始 tool input，供 UI/恢复诊断保留
  schema?: unknown; // 例如 { interaction: "plan_approval", toolName: "ExitPlanMode" }
  questions?: {
    question: string;
    header: string;
    options: { value: string; label: string; description?: string; preview?: string }[];
    multiSelect?: boolean;
  }[];
  currentQuestionIndex?: number; // 远控恢复时可选同步当前题号
  answerDrafts?: Record<string, string[]>; // 远控恢复时可选同步草稿答案
  origin?: InteractionRequestOrigin; // subagent 代理等来源归因
}
```

Ciclo de vida: tanto o aparecimento quanto o desaparecimento passam por `state.updated.pendingInteractions` com substituição inteira. A resposta = command `resolveInteraction`; se o outro lado já respondeu, o item desaparece no próximo quadro deste lado, sem necessidade de lógica de sincronização dedicada. Um restart do CLI → o turn em execução morre → o array se esvazia naturalmente (§9.3).

Tanto `AskUserQuestion` quanto `ExitPlanMode` são `userInput` / elicitation, e não permission comum. Eles continuam sendo emitidos pelo core como o estado de espera `permission_requested`, mas a projection do v4 precisa mapear essas ferramentas com backing de user input para `pendingInteractions.userInput`, preservando `questions[]` e `schema`, para que o cliente reutilize o `ElicitationDialog` ao responder. Permissões comuns de ferramenta continuam passando por `pendingInteractions.permission` e pelo `PermissionDialog`.

Restrição de layout de UI: `pendingInteractions[0]` é a interação bloqueante do bottom dock da sessão atual e precisa compartilhar o sticky dock e a largura da coluna principal do `ConversationTimeline` com o composer; não pode ser renderizada como uma área inferior de largura total independente na camada externa do `SessionPane`. Durante o bloqueio o composer continua montado, mas oculto (por exemplo via `blockingRequestId` com `aria-hidden=true` e `display:none`), para evitar perder rascunho, instância do editor e anexos ao alternar entre permission e elicitation. O painel de queue é um aviso de envio pendente dentro do mesmo dock e pode continuar aparecendo antes da interação bloqueante.

#### 4.2.7 CommandStateSummary e BackgroundWorkSummary

```ts
interface CommandStateSummary {
  // 所有客户端在途 command 的可见性
  commandId: string;
  clientId: string;
  type: CommandType;
  state: "accepted" | "executing";
  at: Timestamp;
  // 完成/失败即从数组消失；失败的用户可见后果由效果本身承载
  // （row 状态 / lastError / ACK failed 回发起端），其他端不弹错误（第一轮 y 项的裁决）
}

interface BackgroundWorkSummary {
  // G-03：背景抽屉数据源
  workId: string;
  kind: "bash" | "subagent";
  title: string; // 命令行摘要或 subagent 描述
  status: "running" | "resultPending" | "failed" | "cancelled";
  // resultPending = 已完成、结果在 continuation inbox 等待前台空闲（product-protocol backgroundResultContinuation）
  // 结果投递后条目消失（结果本体成为 origin=backgroundResult 的 userInput row）
  startedAt: Timestamp;
  endedAt?: Timestamp;
  anchorRowId: number | null; // 发起它的 toolCall/subagent row
  childSessionId?: string; // kind=subagent 时
}
```

#### 4.2.8 GoalState e PlanState

```ts
interface GoalState {
  objective: string; // 当前目标文本（解析后）
  status: "active" | "paused" | "verifying" | "verified" | "notSatisfied" | "failed";
  // paused：stop 作用于任何 foreground work 时 target 强制进入（stopPausesActiveGoalTarget）
  // notSatisfied 与 failed 分离：前者是有效结论，后者是验证过程失败（goalVerificationOutcomeSeparation）
  iteration: number; // 第几轮验证循环
  verifications: GoalVerificationSummary[]; // 最近 N 条（§8），完整历史在 rows 的 goalVerify marker
}
interface GoalVerificationSummary {
  iteration: number;
  outcome: "pass" | "notSatisfied" | "failed";
  at: Timestamp;
  anchorRowId: number | null; // 对应 goalVerify marker row
}

interface PlanState {
  // todo/plan 面板（G-04；todo 表已持久，此处是投影）
  items: PlanItem[];
  updatedAt: Timestamp;
}
interface PlanItem {
  id: string;
  content: string;
  status: "pending" | "inProgress" | "completed";
}
```

### 4.3 Paginação de linhas (por cursor, R-06)

- O snapshot carrega apenas a janela final; o histórico mais antigo é buscado com `rows/range` (§7.1) usando o cursor `beforeRowId`.
- **Não há nenhuma semântica de índice**: a ordem total das linhas é o rowId ascendente; toda mesclagem no cliente usa o rowId como chave de ordenação.
- Um patch que acerta um rowId não carregado (já rolado para fora e descartado pelo cliente / em um trecho de histórico ainda não buscado) = **no-op**, e uma linha descartada só pode ser recuperada buscando de novo com `rows/range`.
- `row.removed(fromRowId)` vale para todas as linhas com `rowId >= fromRowId` no conjunto já carregado pelo cliente (incluindo o histórico já buscado), de modo que o truncamento é naturalmente consistente e não precisa de gate por seq.

### 4.4 ConversationRow (8 tipos, autossuficientes, com todos os campos)

#### 4.4.1 RowBase

```ts
interface RowBase {
  rowId: number; // §1 确定性规则
  turnId: string; // 兼容字段；新投影与 productTurnId 同值
  entityId?: string; // 新 CLI 必传；持久实体身份，旧帧可缺
  productTurnId?: string; // 新 CLI 必传；UI 禁止从行位置重建
  visibility?: "visible"; // 新 CLI 必传；modelOnly/stateOnly 事实不进 rows
  createdAt: Timestamp; // G-05
  createdAtSeq: number;
  actions?: RowActions; // 缺省全 false；只下发为 true 的键
}
interface RowActions {
  canFork?: true; // resolveStableForkTarget 可唯一解析的稳定最终 assistant
  canEdit?: true; // 仅最后一轮 realUser userInput row（latestQueryEditOnly / editUserOnly）
  canRetry?: true; // 仅最后一轮 assistantText row（latestAssistantRetryOnly）
  canRewindFiles?: true; // turnHeader 文件变化可安全 preview/apply；与 conversation rewind 正交
  editDisposition?: "rewind" | "fork"; // legacy decode only；新 projection 不再下发，edit 始终原 session rewind
}
```

#### 4.4.2 turnHeader (novo tipo de linha, ponto de chegada de G-05)

```ts
interface TurnHeaderRow extends RowBase {
  kind: "turnHeader";
  // 一个 product turn 的边界：权威工时 + 每轮文件摘要；guide 内部视觉边界见 workSegments。
  // 普通 turn 仍只有一个「已工作 N 秒」折叠头；guide turn 按 workSegments 渲染多个独立折叠头。
  origin: "userInput" | "backgroundResult" | "goalContinuation" | "editRerun";
  state: "running" | "completedSuccess" | "completedInterrupted" | "failed";
  startedAt: Timestamp;
  endedAt?: Timestamp;
  activeMs?: number; // 权威工时：排除权限等待/用户输入等待/verifier 等待（P1-11 语义上收）
  outputTokens?: number; // 当前 product turn 的主链路 ModelComplete output usage 累计；optional 兼容旧快照
  // 仅 guide turn 需要显式下发；普通 turn 缺省并沿用 turn 级工时。
  // accepted guide 关闭上一段并以 guided user entity 开启下一段，但不切 product turn。
  workSegments?: Array<{
    segmentId: string;
    triggerEntityId?: string;
    startedAt: Timestamp;
    endedAt?: Timestamp;
    activeMs?: number;
  }>;
  fileChanges?: {
    // 每轮文件变更摘要（P3-6 落点），turn 结束时随 row.upserted 出现
    additions: number;
    deletions: number;
    files: number;
  };
}
```

Cobre P1-12b: a atribuição de coisas como auto compact, que "se anexam ao bloco de trabalho anterior", é decidida pelo CLI quanto a qual turnHeader recebe a linha de compact, e o cliente não tem nenhuma lógica de atribuição.

#### 4.4.3 userInput

```ts
interface UserInputRow extends RowBase {
  kind: "userInput";
  text: string; // 用户原文（R-07）
  origin: "realUser" | "backgroundResult" | "goalContinuation" | "mailbox" | "synthetic";
  originMeta?: {
    // origin ≠ realUser 时的结构化来源（消灭 P1-8 文本嗅探）
    backgroundSource?: "bash" | "subagent";
    workId?: string;
    senderSessionId?: string; // mailbox：来自哪个 session/agent
    senderLabel?: string; // mailbox：展示名
  };
  guided?: true; // 经 turn-steer 注入（guideModeTurnSteer）
  sourceCommandId?: string; // realUser/guided 必带；系统来源缺省
  queueItemId?: string; // 从 queue/guided drain 而来时保留
  clientId?: string; // realUser/guided 必带，来源端不丢失
  attachments?: AttachmentRef[];
}
```

#### 4.4.4 assistantText / reasoning

```ts
interface AssistantTextRow extends RowBase {
  kind: "assistantText";
  text: string; // 流式：path="text"
  state: "streaming" | "complete" | "interrupted" | "failed";
  model?: string; // 产出该段的模型（切换模型后的历史标注）
  feedback?: "like" | "dislike"; // 用户反馈；setAssistantFeedback 成功后持久化并随 snapshot 恢复
}

interface ReasoningRow extends RowBase {
  kind: "reasoning";
  text: string; // 流式：path="text"
  state: "streaming" | "complete" | "interrupted";
  durationMs?: number; // 完成时出现
}
```

Invariantes (preservados de 09§3): o append só pode entrar em uma linha com `state="streaming"`; uma nova resposta normal do modelo necessariamente tem um novo `rowId`. A única exceção é o Continue de output-token dentro do mesmo product turn: quando a requisição anterior é encerrada por `ModelComplete(stopReason="length", toolCallCount=0)` e o próximo trecho de conteúdo visível ainda é adjacente ao `assistantText` anterior, o ProductProjection precisa colocar a linha original de volta em `streaming` e continuar o append no fim do mesmo corpo Markdown. Qualquer tool, reasoning, user visível, fronteira de timeline, troca de product turn ou fechamento diferente de `length` cancela essa elegibilidade de reuso. Durante o reuso o `rowId` permanece estável, enquanto `entityId`, `assistantResponseId` e a âncora de message action avançam para a mensagem assistant mais recente; a recuperação fria reconstrói o mesmo resultado usando o `assistant.info.finish` persistido.

#### 4.4.5 toolCall

```ts
interface ToolCallRow extends RowBase {
  kind: "toolCall";
  toolCallId: string;
  toolName: string;
  status: "inputStreaming" | "pendingApproval" | "running" | "success" | "error" | "cancelled";
  inputText: string; // 流式：path="inputText"（仅 continuous 档）
  input?: unknown; // 结构化 input，进入 running 时出现
  output?: ToolOutput; // 终态出现（success/error 均可有）
  error?: { code: string; message: string }; // status=error 时必带
  progress?: ToolProgress; // 仅 replayable 档运行中出现，终态清除
  approvalInteractionId?: string; // status=pendingApproval 时指向 pendingInteractions 项
  backgrounded?: true; // 已转后台；后续在 backgroundWorks 跟踪
  workId?: string; // backgrounded 时必带
  startedAt?: Timestamp; // 进入 running 时
  endedAt?: Timestamp; // 终态时
}

interface ToolOutput {
  text: string; // 终态：全档统一 head+tail 截断（R-10，参数见 §8）
  display?: ToolResultDisplay; // 结构化工具卡载荷；**不设门**，见下
  truncated?: {
    totalBytes: number;
    ref: string; // artifact store 引用，toolOutput/get 按需拉（§7.2）
  };
}
interface ToolProgress {
  bytes: number;
  previewLine?: string; // 最后一行预览
  updatedAt: Timestamp;
}
```

**O display não tem portão no nível do envelope.** Os quatro pontos de embutição — `ToolCallRow.display`, `ToolOutput.display`, `pendingInteractions[].payload.display` (prévia de confirmação) e `turnHeader/userInput.workflowLaunch.display` (preview do grafo da linha de inicialização) — usam carga com `.optional().catch(undefined)`: um display não reconhecido é **descartado**, o quadro é entregue normalmente e o cartão decai para texto puro. O schema dos membros em si continua `.strict()` (eles definem "os formatos que este lado reconhece"); campos desconhecidos, valores de enum desconhecidos e `kind` desconhecidos (tipos de cartão novos que um cliente mais novo adicione) descartam apenas a carga daquele cartão.

A razão é a desigualdade de peso: display é carga decorativa, mas cresce dentro do envelope crítico para a liveness. Uma chave a mais já fez um quadro inteiro ser rejeitado por `proto.frameAssemblyInvalidPayload` → a escada de recuperação retentou sobre o mesmo conteúdo → a sessão fechou em fail closed, e como cada snapshot reproduzia a mesma carga já existente, a sessão nunca se curava sozinha (o `providerStop` de 2026-09-17 e a chave de lineage `list_workflow_runs` de 2026-09-21, a mesma forma duas vezes). O rigor não se perdeu, apenas foi movido para a camada de renderização: `readToolResultDisplay` já faz parsing estrito por `kind` e cai para texto puro em caso de falha — exatamente o comportamento que as specs sempre prometeram; aquele portão no nível do envelope era uma segunda porta redundante, e seu único efeito exclusivo era matar a sessão.

O custo é que o desvio entre os dois schemas de membro fica **silencioso** (o cartão decai calmamente para texto). A compensação são testes de paridade no lado de construção e no lado espelho, e não deixar a assinatura de produção descobrir isso. Um desvio em campo obrigatório não tem cartão para descartar e ainda rejeita o quadro — o reserva para esse caminho está na regra fechada 11 de 04-sync-and-recovery. A regressão está em
`packages/shared/test/zcodeProtocolV4DisplayTolerance.test.ts`.

#### 4.4.6 subagent

```ts
interface SubagentRow extends RowBase {
  kind: "subagent";
  parentToolCallId?: string; // 触发它的 Agent/Task toolCallId；新投影必须携带
  subagentType: string;
  status: "running" | "success" | "failed" | "cancelled";
  summaryText: string; // 流式：path="summaryText"（仅 continuous 档）
  childSessionId?: string; // 存在 → UI 可下钻订阅 conversation/<childSessionId>
  backgrounded?: true;
  workId?: string;
  startedAt?: Timestamp;
  endedAt?: Timestamp;
}
```

Premissa R-05: os eventos espelho de subagent precisam entrar no log de eventos, para que o streaming desta linha e a contabilidade de intervalos façam sentido.

Decisão de renderização na UI (revisão de 2026-07-16): a projection da sessão pai ainda mantém o fato das duas linhas — o `toolCall` de `Agent`/`Task` que a disparou e a linha `subagent` correspondente; a projection precisa preservar o `parentToolCallId` do evento até o `SubagentRow`, e a camada de renderização só pode fazer o pareamento exato por `toolCallId === parentToolCallId`. A ordem de spawn/conclusão de ferramentas concorrentes não é garantida como a ordem dos tool calls na saída do modelo, e é proibido adivinhar por posição da linha, título ou tempo. Para compatibilizar dados históricos sem esse campo, só se permite um fallback um-para-um quando no mesmo turno restar exatamente uma linha Agent/Task não pareada e uma linha subagent não associada; havendo ambiguidade, as linhas independentes são mantidas. Um `subagent` já pareado com precisão deixa de gerar um bloco de timeline próprio, e o drill-down de `childSessionId` e a entrada "abrir à direita" vão para a área expandida do bloco de ferramenta "subagente" que o disparou. A semântica de P9 não muda: o conteúdo do drill-down é obtido assinando `conversation/<childSessionId>`, sem escrever as rows do child de volta na projection do pai.

#### 4.4.7 timelineMarker

```ts
interface TimelineMarkerRow extends RowBase {
  kind: "timelineMarker";
  sourceCommandId?: string; // 用户触发的 marker 必带（R-07：compact/fork/goalSet/modelChange）
  marker:
    | {
        type: "compact";
        origin: "manual" | "auto";
        status: "running" | "success" | "failed" | "noop" | "cancelled";
        tokensBefore?: number;
        tokensAfter?: number;
        summaryRef?: string;
      } // compact summary 全文按 ref 拉（同 toolOutput/get）
    | {
        type: "forkNotice"; // 出现在 child 会话首部（forkTimelineIsBoundary）
        parentSessionId: string;
        parentRowId: number;
      }
    | {
        type: "forkCreated"; // 出现在 parent（可选展示）
        childSessionId: string;
        atRowId: number;
      }
    | {
        type: "modelChange"; // 只表示 provider/model 身份变化；thought-only 不产 marker
        fromProvider: string; // UI 映射为 provider.name，缺失时直接展示此 ID
        fromModel: string;
        toProvider: string; // UI 映射为 provider.name，缺失时直接展示此 ID
        toModel: string;
        toThought: string;
      }
    | { type: "goalSet"; objective: string; previousObjective?: string }
    | {
        type: "goalVerify";
        iteration: number;
        outcome: "running" | "pass" | "notSatisfied" | "failed";
        detail?: string;
      }
    | { type: "retryNotice"; attempt: number; reasonCode: string }
    | { type: "checkpointRestored"; checkpointId: string }; // workspace 域动作在时间线上的回执
}
```

#### 4.4.8 StableForkTarget e fork em execução

Todos os alvos de fork do V4 precisam passar pelo resolvedor único, e a UI não pode varrer raw messages por conta própria:

```ts
interface StableForkTarget {
  productTurnId: string;
  transcriptTurnId: string;
  orderedMessageIds: string[];
  boundaryMessageId: string;
}

interface MessageAnchorMetadata {
  sourceCommandId?: string;       // user row / marker 的 transcript 查重锚点
  productTurnId?: string;
  orderedMessageIds?: string[];
  boundaryMessageId?: string;
  goalBoundary?:
    | { kind: "none" }
    | {
        kind: "snapshot";
        target: SessionGoal;
        verificationEntryIds: string[];
      };
}

interface ForkChildMetadata {
  parentSessionId: string;
  sourceCommandId: string;        // duplicate fork 返回同一 child
  forkTarget: StableForkTarget;
}

resolveStableForkTarget(target: { rowId: number; entityId: string }, baseLogEpoch: string):
  | {
      ok: true;
      target: StableForkTarget;
      goalBoundary: NonNullable<MessageAnchorMetadata["goalBoundary"]>;
    }
  | { ok: false; reasonCode:
      | "guard.forkAssistantOnly"
      | "guard.forkTargetNotStable"
      | "guard.forkTargetAmbiguous"
      | "guard.compactOperationLock" };
```

Decisões normativas:

1. O alvo precisa ser o último trecho assistant com `state="complete"` de um product turn `completedSuccess`; os ids de turn/message/boundary devolvidos são fixos entre retentativas.
2. Dados novos usam como base o turn anchor persistido; dados antigos só fazem fallback quando a fronteira message/turn é inequívoca, caso contrário `guard.forkTargetAmbiguous`.
3. Com primary turn, foreground subagent, goal continuation ou goal verifier em execução, é possível fazer fork de um turno estável mais antigo; o compact continua sendo operation lock.
4. Streaming/interrompido/falho parcial atual, trechos assistant intermediários e linhas user/tool/timeline são sempre rejeitados.
5. Um fork em execução não entra no legacy bridge com `ensureNoActiveTurn`: copia apenas o transcript estável, o config no ponto do fork e o goal anterior ao ponto do fork; não copia queue, trabalho ativo/de segundo plano nem continuation inbox, não faz rewind do workspace compartilhado, e o pai continua rodando como estava.
6. O comportamento existente de checkpoint de workspace em completed/idle não é ampliado nesta rodada.
7. E10/FX08 copia blocos de ferramenta, o assistant final após o resultado da ferramenta e os fatos de arquivo já produzidos por esse turno com base na fronteira lógica de turno, e não truncando pela "última raw assistant message".
8. Os metadados do child precisam persistir `sourceCommandId` e `StableForkTarget`; uma retentativa com o mesmo commandId devolve o mesmo child.
9. Dados novos precisam concluir a persistência do anchor do assistant final antes de `TurnComplete` ficar visível para os assinantes; o anchor fixa o segmento de raw message, a fronteira e um `goalBoundary` explícito. Um `goalBoundary` ausente significa apenas legacy e não permite ler o goal atual do pai como se fosse um snapshot histórico.

### 4.5 Delta: sete operações + coalesce + progressão de revision

```ts
type ConversationDelta =
  | { op: "row.appended"; row: ConversationRow } // 追加到尾部（99%）
  | { op: "row.upserted"; row: ConversationRow } // 按 rowId 整行替换（状态机迁移）
  | { op: "row.removed"; fromRowId: number } // 删除该行及之后所有（rewind/edit）
  | { op: "row.delta"; rowId: number; path: StreamablePath; append: string }
  | { op: "state.updated"; patch: StatePatch }
  | {
      op: "workflowRun.updated"; // 按 runId 的键化增量；只有 workflowRuns 有
      runId: string;
      revision: number; // 本次变化之后的 workflowRuns.revision（绝对值，非负整数）
      run?: Partial<WorkflowRunHeader>; // header 键级整体替换，绝不深合并
      cleared?: WorkflowRunHeaderKey[]; // 变为缺省的 header 键（该键的约定是「空即缺省」）
      removedActors?: { siteId: string; ordinal: number }[]; // 被淘汰的条目，键 = (siteId, ordinal)
      removedNodes?: { siteId: string; ordinal: number }[]; // 同上
      actors?: WorkflowRunActor[]; // 整条目，同一个键
      nodes?: WorkflowRunNode[]; // 同上
    }
  | { op: "workflowRun.removed"; runId: string; revision: number };

type StreamablePath = "text" | "inputText" | "output.text" | "summaryText"; // 封闭白名单（09§9）

interface StatePatch {
  // 键级整体替换（Object.assign），键集合封闭
  revision?: number;
  control?: SessionControl;
  availability?: SessionActionAvailability;
  inputRouting?: InputRouting;
  config?: SessionConfigState;
  usage?: SessionUsageState;
  queue?: QueueState;
  pendingInteractions?: PendingInteraction[];
  pendingCommands?: CommandStateSummary[];
  backgroundWorks?: BackgroundWorkSummary[];
  workflowRuns?: WorkflowRunsState; // 整键形式；仍是 snapshot 与未声明能力订阅者的唯一形式
  goal?: GoalState | null;
  plan?: PlanState | null;
}
```

`workflowRuns` é a única chave de estado que também tem um delta com chaves: um evento do motor altera apenas poucos campos de header e poucos itens de um run, enquanto reenviar a chave inteira a cada evento seria O(N²) em bytes. A fronteira de itens não desaparece por isso — o snapshot ainda carrega a chave inteira, e a fronteira é o seu orçamento (ver [presentation.md](../dynamic-workflow/presentation.md), "The run state the pane draws").
`WorkflowRunHeader` = `WorkflowRunState` sem `actors`/`nodes`, derivado por `.omit` do schema em vez de copiado à mão. Semântica:

- As chaves de header são substituídas inteiramente por `run` e removidas por `cleared`; os pequenos coleções dentro do header (`reports`/`artifacts`/`phases`/`pendingQuestions` …) continuam sendo valores de substituição inteira, sem delta de segundo nível.
- `removedActors`/`removedNodes` removem itens por `(siteId, ordinal)` (uma chave que não casa é no-op), e `actors`/`nodes` fazem upsert pela mesma chave: casa → substitui, não casa → acrescenta ao fim. Itens **não são reordenados** — o produtor só expulsa ao atingir a fronteira ([presentation.md](../dynamic-workflow/presentation.md), "Reduction"), e a expulsão precisa ser dita por essas duas chaves; mudanças de ordem além da remoção continuam não expressáveis neste modelo. Os limites dos quatro arrays = `WORKFLOW_RUNS_LIMITS.maxActors` / `maxNodes`.
- A ordem de aplicação dentro de uma op é fixa em **header → remoção → upsert**: quando a mesma chave é removida e adicionada numa única op, ela fica no fim da tabela, o que coincide com o resultado de aplicar duas ops em sequência.
- apply: quando `workflowRuns` está ausente, parte-se de `{revision: 0, runs: []}`. Um run casado é atualizado conforme acima; um run não casado em que `run` é um **header completo** (todos os campos obrigatórios do header presentes) = nascimento, acrescentado ao fim de `runs`; não casado com header incompleto = um no-op bem definido (a mesma regra de um `row.upserted` que acerta uma linha não carregada), sem erro. `workflowRun.removed` filtra aquele run e, quando não casa, apenas avança a revision. A `revision` do contêiner é `max(atual, op.revision)` (o coalesce move para frente as ops do mesmo run, ver abaixo). Runs e itens inalterados preservam a identidade de objeto; runs alterados e o container são objetos novos.
- **O cliente nunca executa fronteiras** (`maxRuns`, fronteiras de itens, orçamento total): a expulsão é feita só pelo produtor e dita explicitamente — o run inteiro via `workflowRun.removed`, os itens da tabela via `removedActors` / `removedNodes`.
- Um evento do motor gera no máximo um `updated` para um run (nós, estado de ator derivado, usage e `lastEventSequence` caem juntos atomicamente), mais o `removed` dos runs expulsos.
- Nenhum dos dois ops passa pelo profile filter (são da mesma família que `state.updated`, §3.6), e nenhum incrementa a conversation revision: `workflowRuns` tem a própria revision monotônica, e nenhum command faz CAS de baseRevision sobre ela.
- Assinantes que não declaram `workflowRunDeltas` (§2) não recebem nenhum desses dois ops: o publisher rebaixa para elas todo o lote `workflowRun.*` em uma única `state.updated{workflowRuns}` de chave inteira e aplica o clamp do limite antigo ([05 §1.1](./05-transport-and-backpressure.md)).

Regras de coalesce (função pura em `@zcode/protocol`):

1. `row.delta` adjacentes com o mesmo `(rowId, path)` → concatenação de append;
2. `state.updated` adjacentes → merge raso das chaves de patch (substituição inteira dentro da chave, seguro);
3. `row.delta` seguido de `row.upserted` do mesmo rowId → o primeiro é descartado;
4. `row.removed` é uma barreira que nenhuma regra pode atravessar;
5. Se o quadro único resultante exceder `maxFrameBytes` → fatiado conforme §3.2;
6. Um `workflowRun.updated` do mesmo runId funde para frente na **última** `workflowRun.updated` do mesmo runId dentro da janela e não separada por barreira: chaves de header com last-wins reconciliadas com `cleared` (uma atribuição posterior tira a chave de `cleared`, uma remoção posterior tira a chave de `run`), itens com last-wins por `(siteId, ordinal)` mantendo a ordem de primeira aparição, e `revision` é a do último. As remoções e upserts decorrem de "a fusão equivale à aplicação sequencial": `removedActors` / `removedNodes` recebem a união dos dois lados (deduplicada pela primeira aparição), e **toda chave removida pelo segundo que ainda exista no upsert do primeiro é retirada**, e só então se sobrepõe o upsert do segundo conforme as regras acima. Assim uma chave removida e depois adicionada fica no fim da tabela — que é exatamente a posição obtida aplicando as duas ops em sequência. Existem duas categorias de barreira: um `state.updated` cujo patch contém `workflowRuns` (substituição de chave inteira) e um `workflowRun.removed` do mesmo runId; um `removed` também engole todos os `updated` daquele run desde a última barreira (nasceu e foi removido dentro da mesma janela, o cliente nunca viu esse run, o que é equivalente).
   **Se qualquer uma das quatro tabelas de itens resultante exceder o limite online, não funde**: as duas ops ficam como estavam, sem mudança de ordem. Na verdade, só duas tabelas de **remoção** podem exceder: pela regra de fusão acima, toda chave que permanece em um upsert ainda estará na tabela depois de esta op ser aplicada, e a própria tabela é limitada; as tabelas de remoção não têm essa salvaguarda — a fusão não consegue distinguir "chave que acabou de nascer e foi expulsa dentro da janela" de "chave que o cliente já tinha", e cada expulsão libera uma vaga, de modo que numa janela larga o número de chaves distintas removidas pode superar o limite da tabela (antes da expulsão isso é impossível: a tabela só cresce). As quatro são verificadas só porque essa barreira é barata e a argumentação acima não deve ser considerada válida para sempre.
   A carga que excede o limite não perde uma chave — ela faz o patch inteiro falhar no parse e o quadro ser descartado. A fusão é uma otimização, e recusar a fusão não muda o estado final. A escolha do alvo como a **última** op, e não uma anterior, é exatamente para esse caso: quando a fusão dá certo o tempo todo, depois de uma barreira resta apenas um `updated`, e "a mais antiga" e "a mais recente" são a mesma; assim que uma é recusada, fundir na anterior faz o upsert posterior saltar para **antes** da remoção do meio, e uma chave removida e depois adicionada desaparece.
O avanço da regra 6 atravessando ops de row intermediárias, ops de outro runId e `state.updated` sem `workflowRuns` é comutativo: elas atuam sobre estados disjuntos, e o nascimento de um run entra em `runs` pela ordem de primeira aparição, que não muda. A única coisa não comutativa é a `revision` do container — quando as ops de dois runs se alternam, a última op da sequência de saída após a fusão ainda precisa carregar a revision mais alta, o que é garantido pelo apply ao tomar `max` (a revision é monotônica por contrato). O critério continua sendo a igualdade dos testes dourados existentes: `applyAll(s, coalesce(ds))` e `applyAll(s, ds)` são idênticos byte a byte. Após a fusão, cada run em voo tem no máximo cerca de 2 ops por janela (algumas a mais quando a fusão é recusada por limite de item), independentemente da largura do fan-out, de modo que o limite de 500 ops de §3.2 não é ameaçado por esses dois ops.

**Regra de progressão de revision (R-04, definição fechada)**: os eventos abaixo somam +1 cada; todos os outros (fluxo de texto só `row.delta`, mudanças em `usage`, mudanças em `pendingCommands`, mudanças em `workflowRuns` (incluindo os dois ops `workflowRun.*`) e atualizações de `ToolProgress`) **não incrementam**:

| Eventos que incrementam a revision                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------- |
| row.appended / row.upserted / row.removed (qualquer mudança de estrutura de linha ou de máquina de estados)                 |
| qualquer mudança em control / availability / inputRouting / config / queue / pendingInteractions / backgroundWorks / goal / plan |

Regra de carregamento: qualquer quadro que contenha um evento que incrementa a revision precisa ter `state.updated.revision` em seus deltas (o que é naturalmente satisfeito depois da conflação: pelo menos a chave de revision está presente). O CAS (§6.2) fica assim semanticamente definido: **revision inalterada ⇔ nenhuma mudança de estado visível por guard**.

---

## 5. Topic sessions-index

`TopicKey = "sessions-index/<workspaceId>"`. Fonte autoritativa dos pontos de atividade/status da lista; estado mais recente conflado, nunca transborda. Não lidas pertencem à membership do tasks-index e não são derivadas do tempo de atividade.

```ts
interface SessionsIndexSnapshot {
  protocolVersion: 1;
  workspaceId: string;
  logEpoch: string; // host 级列表日志代际（与各 session 的 logEpoch 无关）
  sessions: SessionSummary[]; // 无序；排序是客户端展示逻辑
}

type SessionsIndexDelta =
  | { op: "session.upserted"; session: SessionSummary } // conflation key = sessionId
  | { op: "session.removed"; sessionId: string };

interface SessionSummary {
  sessionId: string;
  workspaceId: string;
  parentSessionId?: string; // fork 树
  title: string;
  phase: SessionControl["phase"];
  sessionEnded: boolean;
  hasBackgroundWork: boolean; // 列表小圆点用（此处保留布尔，避免为侧栏订阅整个 backgroundWorks）
  goalStatus?: GoalState["status"];
  lastActivityAt: Timestamp; // Updated 排序唯一权威；tasks-index mutation 不得覆盖
  pendingInteractionSummary?: {
    // optional 兼容扩展；不含敏感 interaction payload
    permissionCount: number;
    userInputCount: number;
  };
  lastAssistantPreview?: string; // ≤120 字符
  createdAt: Timestamp;
}
```

---

## 6. Camada de commands

### 6.1 Envelope

```ts
interface CommandEnvelope<T extends CommandType = CommandType> {
  commandId: string; // uuid v7，客户端生成，重试不变
  clientId: string;
  sessionId: string | null; // createSession 时为 null
  baseRevision?: number; // 表格标「CAS ✓」的命令必带
  type: T;
  payload: CommandPayloadMap[T];
  issuedAt: Timestamp; // 客户端时钟，仅遥测；服务端不用于任何裁决
}
```

### 6.2 ACK

```ts
interface CommandAck {
  commandId: string;
  status: "accepted" | "rejected" | "stale" | "duplicate" | "noop" | "failed";
  reasonCode?: string; // rejected/stale/noop/failed 必带；= guard id 或 fault code
  message?: string; // 兜底英文；展示文案客户端按 reasonCode 本地化
  revisionAtDecision: number;
  result?: CommandResult; // duplicate 回放缓存结果；accepted 亦可即时带（fork）
}

type CommandResult =
  | { type: "createSession" | "forkAssistant"; sessionId: string }
  | { type: "resolveInteraction"; resolvedBy: { clientId: string; optionId?: string } };
```

| status      | Semântica                                                                                                                                                                                            | Encerramento na UI                                                   |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `accepted`  | O CLI aceitou o command; para commands de entrada, o admission serial já foi concluído e a entrada entrou no input ledger/inbox. **Não há promessa de que a entrada continue em execução entre processos do CLI**; o encerramento final depende de `sourceCommandId` acertar um QueueItem/row/transcript ou de um discarded explícito | Mantém o registro otimista e de pendentes, aguardando o estado autoritativo |
| `rejected`  | Recusado por guard                                                                                                                                                                                  | Reverte o otimista, exibe conforme o reasonCode                       |
| `stale`     | baseRevision muito antigo                                                                                                                                                                            | Reverte o otimista; o usuário reenvia depois de puxar a projection mais recente |
| `duplicate` | **Mesmo commandId** já processado                                                                                                                                                                    | Encerra com o result, sem repetir efeitos colaterais                 |
| `noop`      | O command é válido mas não há nada a fazer (R-09): stop-while-stopping, resolveInteraction já respondido pelo outro lado                    | Encerramento silencioso; o result traz a conclusão existente          |
| `failed`    | Falha de execução após accepted                                                                                                                                                                     | Exibe conforme o reasonCode; combinado com lastError/status da row    |

Idempotência e retentativa (critério após as decisões de §9.3):

- Ordem de deduplicação no servidor: LRU em memória → `sourceCommandId` da âncora de user/message do transcript, do timeline marker e dos metadados de fork child → ledger de inputs descartados → `unknown`. Um acerto em discarded devolve `failed/fault.command.inputDiscardedOnRestart` e não pode degradar para unknown.
- Query e execute do mesmo `{sessionId,commandId}` compartilham a entrada single-flight/mutualmente excludente, eliminando a janela "a execução já começou mas ainda não escreveu no LRU/transcript"; duplicate/fork duplicate concorrentes só podem executar o efeito colateral uma vez.
- Registro de pendentes de 24h no cliente: texto/goal comuns guardam o payload reenviável, e interações sensíveis guardam apenas o digest. O registro é removido assim que aparecem o QueueItem ou a projection guided; na reconexão, primeiro se concilia com `commands/query`, e `queue/guide` descartado e `unknown` são liquidados em silêncio, com apenas `startNow` exigindo confirmação manual; nenhum ramo **nunca reenvia automaticamente**.
- O registro é gravado no armazenamento persistente do renderer com a chave `{sessionId,commandId}`, e a gravação precisa ocorrer antes do primeiro envio de `v4/command`; o TTL é fixo em 24h contados da primeira gravação, e refresh, reconstrução de attachment ou troca de geração do runtime do CLI não podem estendê-lo. `sendText`, `sendGoalCommand` e `createSession` com `firstInput` guardam o payload reenviável; `resolveInteraction` guarda apenas o digest do payload, e é proibido persistir em disco respostas de permissão, freeText ou conteúdo de elicitation.
- Um command de entrada que recebe `accepted/duplicate` só prova o admission e não remove o registro sozinho; a remoção acontece quando aparece a projection QueueItem/guided com o mesmo `sourceCommandId`, ou uma row user do transcript, ou um rejected/stale/noop/failed/cancelled explícito, ou um `queue/guide` descartado, ou o TTL expira. Uma interação sensível pode ser removida assim que recebe um ACK definitivo, ou após o query de reconexão quando o ACK é incerto; `unknown` também é removido em silêncio.
- A cada subscribe de conversation entrando em live (inclusive um fresh snapshot após restart do runtime), o registro é consultado em lotes por sessão, com no máximo 64 itens por lote. `unknown` e `failed/fault.command.inputDiscardedOnRestart` com delivery=`queue/guide` são liquidados diretamente, sem exibir erro de UI; apenas delivery=`startNow` gera um aviso recuperável uma única vez. A UI só submete o payload de entrada salvo, com um **novo commandId**, depois que o usuário clica em "reenviar". Uma interação sensível sem payload que encontre `unknown` também é liquidada em silêncio. queryUnavailable mantém os itens e espera a conciliação da próxima conexão, sem se passar por unknown.
- Quadros perdidos durante a vida da conexão são cobertos pelo replay do rpc, e o cliente não faz reenvio temporizado no nível da aplicação.

### 6.3 Decisão de concorrência entre dispositivos (encerramento de 03, reescrito com enumeração de ACK)

| Cenário                                    | Quem chega primeiro | Quem chega depois (commandId diferente)                                   |
| ------------------------------------------ | ------------------- | -------------------------------------------------------------------------- |
| Dois dispositivos param ao mesmo tempo      | accepted            | **noop** (reasonCode=alreadyStopping, result vazio)                       |
| Dois dispositivos respondem à mesma interação | accepted            | **noop** (reasonCode=alreadyResolved, result.resolvedBy traz o primeiro) |
| Operação baseada em uma revision antiga     | accepted            | stale                                                                   |
| Retentativa de rede do mesmo commandId     | accepted            | duplicate (reproduz o result)                                            |

### 6.4 Conjunto completo de commands (campos de payload)

CAS ✓ = o envelope precisa carregar `baseRevision`. Todos os commands que visam linhas precisam também carregar `baseLogEpoch`, e o payload usa `target: { rowId, entityId }`; o CLI valida estritamente na ordem epoch → revision → entity → action, e o cliente não pode submeter uma ação apenas pela posição da linha exibida. A coluna guard traz os ids de guard/invariante do product-protocol.

| type                   | payload                                                                                                                                   | CAS | Efeito (visível na projection)                                                                                                                                                                                                                                                                               | guard                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSession`        | `{ workspaceId: string; firstInput?: { text: string; attachments?: AttachmentRef[] }; config?: Partial<SessionConfigState> }`             | –   | Decisão (2026-07-05): `firstInput` é opcional. Ausente → phase=draft, sessão vazia (ver o ciclo de vida de draft em §4.2.1); presente → direto turnHeader+userInput rows. ACK result.sessionId                                                                                                                                        | `firstSend`                                                                                                                                                                             |
| `sendText`             | `{ text: string; attachments?: AttachmentRef[]; heldQueueDisposition?: "clearQueueAndSend" \| "keepQueueAndSend" }`                       | –   | O admission gera primeiro o `ConversationInputIntent` completo; startNow → user row, enqueue → QueueItem, guide → espera um batch completo de tool results e então no máximo uma linha guided inline. guide sem fronteira de tool/não aplicável/com anexos/compact/verifier busy volta à queue comum com o mesmo intent; rejeição por vazio/excedente/runtime devolve rejected/failed explícito | `runningPromptQueues` / `guideModeTurnSteer` / `guideDrainsAfterCompletedToolBatch` / `guideFallbackPreservesIntent` / `unfinishedSessionPromptQueues` / `heldQueueInputRequiresChoice` |
| `sendGoalCommand`      | `{ text: string; heldQueueDisposition?: "clearQueueAndSend" \| "keepQueueAndSend" }`                                                      | –   | enqueue é kind=sendGoalCommand; no consumo faz set/update do goal + marker goalSet; em held, igual a sendText, passa por choice                                                                                                                                                                                           | `unfinishedSessionGoalQueues` / `heldQueueInputRequiresChoice`                                                                                                                          |
| `stop`                 | `{}`                                                                                                                                      | –   | Encerra todo o trabalho que bloqueia completion → phase=completedInterrupted; a queue é preservada com autoDrain=false; goal active→paused                                                                                                                                                                                   | `stopBusySessionCancelsForegroundWork`                                                                                                                                                  |
| `compact`              | `{}`                                                                                                                                      | –   | startNow → compact marker; running/goal verifier/held → QueueItem de kind=compact, executado na promoção FIFO; não gera user row; compact active/queued repetido é rejeitado                                                                                                                                     | `manualCompact` / `runningCompactQueues` / `heldCompactQueues` / `compactOperationLock`                                                                                                 |
| `forkAssistant`        | `{ target: { rowId: number; entityId: string } }`                                                                                         | ✓   | Primeiro o resolvedor de target unificado; durante a execução, cópia apenas da conversation do turno lógico estável, o pai continua e o workspace compartilhado não sofre rewind; o mesmo commandId devolve o mesmo child                                                                                                                                                  | `runningStableAssistantForkAllowed` / `forkAssistantOnly` / `forkTargetAmbiguous` / `compactOperationLock`                                                                              |
| `applyFileRewind`      | `{ target: { rowId: number; entityId: string } }`                                                                                         | ✓   | Só `turnHeader.actions.canRewindFiles=true` permite preview/apply das mudanças de arquivo do workspace; não trunca o histórico da conversation                                                                                                                                                                                        | `fileRewindTargetOnly` / `fileRewindUnavailable` / `compactOperationLock`                                                                                                               |
| `editUserQuery`        | `{ target: { rowId: number; entityId: string }; newText: string; attachments?: AttachmentRef[]; workspaceMode?: "preserve" \| "rewind" }` | ✓   | Com a latest query em execução, primeiro a barreira de stop; antes e depois do compact, corta o branch append-only na sessão original e reproduz pelo intent canônico. `workspaceMode=rewind` pré-verifica e restaura os arquivos com segurança dentro do mesmo command; unsafe/ignored devolve blocked sem alterar branch/arquivo                                                                 | `latestQueryEditPreemptsActiveTurn` / `compactCoveredLatestEditRewindsInPlace` / `editUserOnly` / `editKeepsQueue`                                                                      |
| `retryTurn`            | `{ target: { rowId: number; entityId: string } }`                                                                                         | ✓   | Reexecuta o último assistant turn com canRetry=true a partir do `ConversationInputIntent` canônico, preservando o kind de input, os anexos e a proveniência                                                                                                                                                                              | `latestAssistantRetryOnly`                                                                                                                                                              |
| `setAssistantFeedback` | `{ target: { rowId: number; entityId: string }; feedback: "like" \| "dislike" \| null }`                                                  | ✓   | Só assistantText é gravável; um valor não nulo é persistido na mensagem/row do assistant, e null remove o feedback; o mesmo valor pode encerrar como accepted/noop idempotente                                                                                                                                                                           | `assistantFeedbackTargetOnly`                                                                                                                                                           |
| ~~`rewind`~~           | —                                                                                                                                         | —   | **Comando independente removido.** O rewind da conversation é a entrada de UI de `editUserQuery`; o que é só workspace continua passando por `applyFileRewind`, e a semântica combinada é coordenada atomicamente dentro do Agent por `editUserQuery.workspaceMode`                                                                                                                         | —                                                                                                                                                                                       |
| `sendQueuedNow`        | `{ queueItemId: string }`                                                                                                                 | ✓   | `reserve → stop barrier → start/promote → remove`; só remove em caso de inicialização bem-sucedida; falha/timeout libera a reservation e o item original fica intacto; competição entre dispositivos tem um único vencedor                                                                                                                                                                   | `sendQueuedNowStopsBeforeDrain` / `*OperationLock`                                                                                                                                      |
| `editQueueItem`        | `{ queueItemId: string; newText: string }`                                                                                                | ✓   | Item de texto/goal atualizado no lugar e a queue reenviada inteira; preserva ID, posição, attachments, clientId e sourceCommandId; kind=compact não é editável                                                                                                                                                                               | `queueContentIndependence` / `queueItemNotEditable`                                                                                                                                     |
| `reorderQueueItem`     | `{ queueItemId: string; beforeQueueItemId: string \| null }`                                                                              | ✓   | O mesmo (null = mover para o fim)                                                                                                                                                                                                                                                                          | o mesmo                                                                                                                                                                                    |
| `deleteQueueItem`      | `{ queueItemId: string }`                                                                                                                 | ✓   | O mesmo                                                                                                                                                                                                                                                                                             | o mesmo                                                                                                                                                                                    |
| `setAutoDrain`         | `{ autoDrain: boolean }`                                                                                                                  | ✓   | Atualização de queue.autoDrain (entrada de recuperação de held, G-07)                                                                                                                                                                                                                                                      | contexto de `heldQueueInputRequiresChoice`                                                                                                                                                     |
| `resolveInteraction`   | `{ interactionId: string; answer: { optionId?: string; freeText?: string } }`                                                             | –   | O item desaparece de pendingInteractions; o status da toolCall row avança                                                                                                                                                                                                                                           | quem chega primeiro vence, quem chega depois é noop                                                                                                                                                                     |
| `switchModelConfig`    | `{ provider: string; model: string; thought: string }`                                                                                    | ✓   | Substituição inteira de config; a partir do próximo turno gera um marker modelChange conforme a mudança de identidade provider/model; thought-only não gera marker                                                                                                                                                                                         | `sessionConfigScoped` / PB-AUTO-COMP-MODEL-N06                                                                                                                                          |
| `setFollowupMode`      | `{ mode: "queue" \| "guide" }`                                                                                                            | ✓   | Atualização de config.followupMode                                                                                                                                                                                                                                                                         | `followupInputModeExplicit`                                                                                                                                                             |
| `resumeGoal`           | `{}`                                                                                                                                      | ✓   | goal.status paused→active (G-07)                                                                                                                                                                                                                                                                | o inverso de `stopPausesActiveGoalTarget`                                                                                                                                                   |
| `cancelBackgroundWork` | `{ workId: string }`                                                                                                                      | –   | O BackgroundWorkSummary correspondente → cancelled; não altera sessionEnded                                                                                                                                                                                                                                        | `backgroundWorkDoesNotBlockSessionEnd`                                                                                                                                                  |
| `renameSession`        | `{ title: string }`                                                                                                                       | –   | Atualização de SessionSummary.title no sessions-index                                                                                                                                                                                                                                                      | –                                                                                                                                                                                       |
| `deleteSession`        | `{}`                                                                                                                                      | –   | `session.removed` no sessions-index; para os clientes assinantes: sinal de término de assinatura + pane volta ao estado vazio (a limpeza coordenada do G-07 é feita pelo cliente com GC do estado local)                                                                                                                                                                               | –                                                                                                                                                                                       |

### 6.5 Upload de anexos (G-07)

```ts
attachment/begin {
  connectionId: string;         // trusted host 注入，UI 不可选择
  uploadId: string;
  sessionId: string;
  fileName: string;
  mime: string;
  totalBytes: number;           // 0..20 MiB
  totalChunks: number;
  checksum: `sha256:${string}`;
} -> { uploadId: string; state: "staging"; nextChunkIndex: number }
   | { uploadId: string; state: "committed"; nextChunkIndex: number; ref: string }

attachment/chunk {
  connectionId: string;
  sessionId: string;
  uploadId: string;
  chunkIndex: number;
  dataBase64: string;           // 单片 decoded <= 512 KiB
} -> { uploadId: string; nextChunkIndex: number }

attachment/commit { connectionId: string; sessionId: string; uploadId: string }
  -> { ref: string }

attachment/abort { connectionId: string; sessionId: string; uploadId: string }
  -> {}

interface AttachmentRef {
  ref: string;                   // artifact store 引用
  fileName: string;
  mime: string;
  bytes: number;
  previewRef?: string;           // 图片缩略图等
}
```

```text
renderer/mobile bytes
  -> begin
  -> chunk[0..N)（顺序、逐片 ACK、每个物理 envelope <= 1 MiB）
  -> commit（全量 bytes + sha256 校验）
  -> stable artifact ref
  -> sendText/createSession AttachmentRef
```

A chave da transação é no mínimo `(trusted connectionId, sessionId, uploadId)`. Uma retentativa de begin com os mesmos metadados devolve o `nextChunkIndex` atual / a ref já submetida; metadados conflitantes são rejeitados. O chunk só aceita o próximo índice esperado; o mesmo índice com os mesmos bytes é no-op, e um duplicate conflitante ou um gap futuro falha explicitamente. O commit só grava o artifact atomicamente depois que a contagem de fragmentos, o total de bytes e o SHA-256 inteiro conferem; uma retentativa com ACK perdido devolve a mesma ref. O abort é idempotente. Uploads ativos, bytes staged globais, TTL, fechamento de conexão, fechamento de sessão e restart do CLI têm limites de limpeza rígidos, e uma carga incompleta nunca entra no artifact store.

O nível alto da UI continua sendo "colocar anexo → ref", mas o wire de produção não tem mais o fallback `v4/attachment/put` carregando um `dataBase64` completo. Uma falha de upload não limpa o texto/anexos do composer; após um restart do CLI também não há replay automático de bytes. Uma ref não referenciada por nenhuma mensagem é reciclada por TTL (§8).

---

## 7. Camada de queries (somente leitura, sem estado, segura para reenvio com timeout)

### 7.1 rows/range (por cursor, R-06)

```ts
rows/range {
  sessionId: string;
  beforeRowId?: number;          // 取 rowId < beforeRowId 的行；缺省 = 从当前尾部向前
  limit: number;                 // 1..200
} -> {
  rows: ConversationRow[];       // rowId 升序
  atSeq: number;                 // 服务端取值时的水位
  atLogEpoch: string;
  hasMore: boolean;              // beforeRowId 方向是否还有更早的行
}
```

Especificação de mesclagem (cliente): inserção controlada por rowId; naturalmente consistente com o `row.upserted/removed` do fluxo de assinatura (§4.3); um resultado cujo `atLogEpoch` difere da epoch atual do store é **descartado por inteiro** (leitura obsoleta de um CLI reiniciado).

### 7.2 toolOutput/get, attachment/read e artifactd

```ts
toolOutput/get { ref: string; byteRange?: { start: number; end: number } }
  -> { bytes: binary; totalBytes: number }

attachment/read {
  sessionId: string;
  ref: string;
  offset: number;
  limit: number;       // 1..512 KiB decoded bytes
} -> {
  dataBase64: string;  // NDJSON-safe chunk
  mediaType: string;
  totalBytes: number;
  nextOffset: number | null;
}
```

`attachment/read` é uma query estritamente de somente leitura: o servidor precisa primeiro hidratar a sessão até a projection atual, e só então confirmar que a ref é igual ao `previewRef ?? ref` de algum anexo de imagem de uma user row daquela sessão; não-imagem, ref de outra sessão, qualquer caminho arbitrário e offset fora dos limites devolvem uma fault estruturada. Um único chunk decodificado não pode passar de 512 KiB, para não estourar o envelope NDJSON de 1MiB depois do base64; o cliente busca em ordem seguindo `nextOffset` e verifica que `totalBytes`/`mediaType` permanecem iguais entre os chunks. O servidor pode manter um cache de leitura de 30 segundos e limitado em volume para o mesmo session/ref, que precisa ser limpo no dispose da sessão e no dispose do CLI.

A validade de uma ref = o ciclo de vida da mensagem correspondente (persistida no artifact store, válida entre reinícios). O `summaryRef` do compact continua passando por `toolOutput/get`; o `previewRef` de um anexo tem prioridade em `attachment/read`. Um anexo histórico que tem apenas `ref` permite ler essa ref, mas ainda precisa ser autorizado pela row da sessão atual. A query não cria conversation events, snapshots, filas nem estado de negócio em relay/main; o desktop `desktop-continuous` e o mobile `web-remote-replayable` compartilham este contrato de leitura.

### 7.3 commands/query (conciliação na reconexão)

```ts
interface CommandKey { sessionId: string | null; commandId: string }

commands/query { commands: CommandKey[] }      // 1..64 个
  -> { results: Array<{ key: CommandKey; result: CommandAck | "unknown" }> }
```

Cada chave é consultada na ordem `LRU em memória → âncora de transcript/message → timeline marker → metadados de fork child → ledger de inputs descartados → unknown`. Query e execute da mesma chave são single-flight. Um acerto no ledger descartado devolve `failed/fault.command.inputDiscardedOnRestart`; só quando todas as fontes de fato falham o resultado é `unknown`. O comportamento do cliente está em §6.2.

Restrições adicionais:

- `commands` precisa ter de 1 a 64 itens e os resultados mantêm estritamente a ordem de entrada; `sessionId=null` consulta somente o balde global/de idempotência do `createSession`. Um command create com firstInput reencontra com precisão o ledger da nova sessão pelo `queue_<sourceCommandId>`; promoted devolve o `result.sessionId` original e admitted-on-restart devolve discarded.
- A ordem exata na memória é `inFlight → liveInputFacts → settled LRU`; a ordem exata no persistente é `message anchor → timeline marker → child metadata → discarded ledger`, casando apenas por `sourceCommandId` exatamente igual, e é proibido adivinhar por texto ou timestamp.
- Query e execute compartilham o mesmo gate por chave; a ordem fixa de aquisição de travas é key gate → per-session admission gate. Depois que o execute já fez pin, uma query concorrente não pode devolver `unknown`; o admission de commandIds diferentes na mesma sessão é estritamente FIFO, e sessões diferentes não bloqueiam umas as outras.
- Quando a sessão já tem um V4 cold READY flight em andamento, query/execute precisam esperar primeiro e só então consultar os fatos persistentes atuais pela prioridade de sempre; é proibido consultar uma marca d'água antiga e depois consultar de novo, e é proibido ativar ativamente uma sessão histórica.
- Uma falha de leitura persistente devolve `failed/fault.command.queryUnavailable` por chave e não pode degradar para `unknown`; `unknown` não é cacheado. O índice persistente é construído de forma preguiçosa por sessão e atualizado incrementalmente, e a chave de isolamento do workspace é fixada em `workspaceIdentity?.trim() || workspacePath`; é proibido varrer o transcript inteiro a cada query.

### 7.4 Bootstrap da primeira tela

Sem camada intermediária de agregação (05): depois que a conexão é estabelecida, o cliente dispara **em paralelo** `subscribe(sessions-index/<ws>)` + `subscribe(conversation/<sessionId ativo>)` + as queries de settings, tudo concluído em um único RTT multiplexado no ws. Não existe um método de bootstrap dedicado.

### 7.5 Feed de telemetria live da conversation

A telemetria da conversa usa um live feed efêmero e separado, que não pertence ao topic conversation nem participa de snapshot, fragment, recovery ou `rows/range`. Os fatos são desviados apenas do ingest live do runtime do processo CLI atual:

```ts
interface ConversationTelemetryFactBase {
  version: 1;
  eventId: string;
  eventSeq: number;
  occurredAt: Timestamp;
  sessionId: string;
  sourceCommandId?: string;
  turnId?: string;
}

type ConversationTelemetryFact = ConversationTelemetryFactBase &
  (
    | { kind: "turn.started" /* metadata only */ }
    | { kind: "model.request.status" /* allowlisted request fields + hostname */ }
    | { kind: "stream.chunk"; streamKind: "thought" | "text"; chunkLength: number }
    | { kind: "tool.lifecycle" /* ids/status/allowlisted perf; no input/output */ }
    | { kind: "permission.lifecycle" /* request/response timing */ }
    | { kind: "usage.delta" /* token counters only */ }
    | { kind: "turn.terminal" /* success/fail/interrupted */ }
    | { kind: "compaction.terminal" /* old /report compaction fields */ }
  );
```

Fronteiras obrigatórias:

- A hydration persistida, o initial de subscribe, o snapshot frio e o recovery de gap não produzem fatos; um evento live do runtime que chega durante a hydration ainda produz um fato.
- Um fato não entra no transcript, na ConversationRow, no log de eventos, no relay nem no estado de negócio do main.
- Chunks de prompt/texto não carregam o corpo; ferramentas não carregam input/output; URLs de modelo guardam apenas o hostname já resolvido.
- O host libera a assinatura conforme o `clientMode` confiável do attachment, e apenas o renderer `desktop-continuous` instala o reporter real; o `web-remote-replayable` não pode ampliar o escopo antigo de coleta do desktop forçando campos falsos.
- A chave do supervisor do workspace usa `endpoint + remoteSessionId + (workspaceIdentity?.trim() || workspacePath) + serviceGeneration`; o ciclo de vida do pane/SessionDataLayer não pode ser dono desse estado.
- O eventId usa um LRU limitado de cerca de 2000 entradas; terminal e compact têm ainda exactly-once por chave de negócio.

Os nomes completos dos eventos, a compatibilidade de campos e a matriz de primeiro plano/segundo plano estão em
[`docs/monitoring/conversation-telemetry-v4.md`](../monitoring/conversation-telemetry-v4.md).

---

## 8. Constantes e limites (valores iniciais, ajustados por medição)

| Parâmetro                                      | Valor                                                                        | Origem               |
| --------------------------------------------- | ---------------------------------------------------------------------------- | -------------------- |
| `maxFrameBytes`                                | 1 MiB (JSON/RPC físico incluindo o envelope)                                 | R-12                 |
| `maxLogicalAssemblyBytes`                      | 16 MiB; acima disso a admission recusa explicitamente                         | 05/§3.2              |
| `maxLogicalAssemblyFragments`                  | 1.024                                                                         | 05/§3.2              |
| Montagem concorrente / staging decodificado / timeout | 32 / 32 MiB / 30s                                                     | 05/§3.2              |
| flushWindowMs                                  | continuous 30ms / replayable 150ms (pode se adaptar ao RTT até 200ms)         | 05                   |
| Buffer de canal por assinante                  | após filter+coalesce, ≤500 ops e ≤1 MiB simultaneamente; qualquer um excedido → esvazia + snapshot resync | 05                   |
| Janela de retenção de eventos (log em memória)  | 2000 entradas por sessão (critério das questões abertas de 08)              | 05/§9.2B             |
| Janela final do snapshot                       | 60 rows                                                                      | parametrização "uma tela" de 02 |
| Limite de `rows/range`                         | ≤ 200                                                                        | §7.1                 |
| Teto de streaming do tool output               | continuous 256 KiB; replayable 0 (sem streaming)                             | 05                   |
| **Truncamento final do tool output (unificado)** | head 32 KiB + tail 32 KiB; o excedente vai para `truncated.ref`                | R-10                 |
| Retenção de GoalState.verifications            | as 20 mais recentes                                                          | §4.2.8               |
| Teto de exibição de pendingCommands           | 32 entradas (as mais antigas são cortadas)                                   | §4.2.7               |
| Heartbeat/morte sutil/grace do rpc             | 5s / 20s / 45s·4MiB                                                          | 05 (vale após o complemento R-02) |
| Backoff de reconexão                           | 0,1,2,5,10… com teto de 30s, por um único ponto de entrada                   | 05                   |
| TTL de pendentes de command no cliente         | 24h                                                                          | C-02                 |
| Tabela de idempotência em memória do servidor  | LRU de 512 por sessão + reserva transcript/marker/child/discarded            | §6.2/§7.3            |
| Timeout de query                               | 10s no domínio conversation; operações de deploy de workspace têm timeout próprio nesse domínio (G-14) | §7                   |
| Teto por anexo / TTL de anexo não referenciado | 20 MiB / 24h                                                                 | §6.5                 |

---

## 9. Especificação de reasonCode

- Namespaces: `guard.*` (incluindo `guard.forkTargetAmbiguous`, `guard.forkTargetNotStable`, `guard.compactOperationLock`), `fault.*` (incluindo `fault.command.inputDiscardedOnRestart`) e `proto.*` (camada de protocolo: `proto.staleRevision`, `proto.unknownTargetRow`, `proto.alreadyResolved`, `proto.alreadyStopping`, `proto.sessionNotFound`, `proto.payloadTooLarge`, `proto.invalidPayload`, `proto.missingBaseRevision`).
- O cliente consulta uma tabela de textos localizados pelo reasonCode; o campo `message` serve apenas como fallback e para logs.
- Contrato de evidência (product-protocol §Evidence): o e2e afirma o reasonCode e não o texto.

---

## 10. Diferenças em relação a 09/às conclusões da revisão e lista de pendências

### Implementado conforme as conclusões da revisão (marcar durante a review)

| #   | Decisão                                                                                                                            | Origem           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| 1   | `TopicFrame.subscriptionId` + os três ramos do apply + reassinatura single-flight + reassinatura substitutiva no servidor               | R-01             |
| 2   | `base = { logEpoch, seq }`; a revision não participa da recuperação (o par {R,W} de 04 é decidido assim)                                 | C-05/R-04        |
| 3   | Paginação de rows totalmente por cursor, semântica de índice `firstIndex/totalCount` removida (totalCount permanece só para estimar a barra de rolagem) | R-06             |
| 4   | `sourceCommandId` em tudo: QueueItem/drain/user row/message anchor/timeline marker/metadados de fork child                            | R-07/fechamento central |
| 5   | ACK ganha `noop`; a semântica de quem chega depois entre dispositivos passa a ser noop+reasonCode, e `duplicate` fica restrito ao mesmo commandId | R-09           |
| 6   | Truncamento final unificado em todos os perfis (head+tail 32K); só o teto de streaming é por perfil                                    | R-10             |
| 7   | Quadro físico wire v3 com envelope ≤1 MiB; montagem por fragmentos de snapshot/resume ≤16 MiB, com apply atômico após a validação           | R-12/fechamento central |
| 8   | Regra de progressão de revision em enumeração fechada; revision/rowId/seq de forma determinística em §1                                  | R-04             |
| 9   | Área A ganha config/usage/backgroundWorks/plan/goal(verifications)/apiRetry                                                          | G-01~04          |
| 10  | RowBase.createdAt + frame.sentAt + regra de clockOffset + turnHeader(activeMs/fileChanges)                                            | G-05             |
| 11  | userInput.origin ganha mailbox/goalContinuation + originMeta estruturado                                                             | G-06             |
| 12  | Commands completados: retryTurn/resumeGoal/setAutoDrain/cancelBackgroundWork/renameSession/deleteSession/upload de anexos                  | G-07             |
| 13  | A queue só é confiável no processo; no restart grava-se um tombstone discarded e commands/query devolve failed explícito, sem replay automático | §9.3/fechamento central |
| 14  | ConversationInputIntent autossuficiente atravessando queue/runtime/transcript, com estado de steer/dispatch                              | D-03/fechamento central |
| 15  | stopTargetKind ganha turnSteer; activeWorks mantido de forma leve                                                                    | D-02             |
| 16  | Todos os tipos indefinidos de D-05 completados (QueueItem/GoalState/SessionErrorInfo/Availability/AttachmentRef/marker payloads/Permission/UserInput) | D-05             |
| 17  | O host injeta clientMode/profile confiáveis por attachment; roteamento de assinatura owned e unsubscribe all no fechamento de porta           | portão 1 do fechamento central |
| 18  | commands/query consulta `{sessionId,commandId}` em LRU→transcript/marker/child→discarded, com query/execute single-flight                 | portão 2 do fechamento central |
| 19  | `resolveStableForkTarget` + fork em execução apenas de conversation; o pai continua e o workspace não sofre rewind                            | portão 3 do fechamento central |

### ⚠ Decisões que tomei no seu lugar (todas decididas em 2026-07-05, ver as anotações em cada linha)

> P1, P4–P11 foram aceitos em bloco pelo usuário em 2026-07-05; P2/P3 foram decididos à parte, como visto abaixo. O usuário confirmou ao mesmo tempo que a semântica de fork em execução (`forkAssistant` disponível para uma row assistant estável enquanto o turno roda, `runningStableAssistantForkAllowed`) é a direção de produto desejada — isso é uma liberação de comportamento em relação ao estado atual e foi registrada na tabela de mudanças semânticas C-07.

| #   | Decisão                                                                                                                                                                    | Razão / alternativa                                                                                                                           |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **Novo tipo de linha `turnHeader`** para carregar o cabeçalho recolhido, o tempo de trabalho autoritativo e o resumo de arquivos por turno (**confirmado**)           | O 09 só tem a "adjacência de turnId", que não expressa tempo de trabalho nem atribuição de grupo recolhido (G-05/P1-12b). Alternativa: um map turnsMeta na área A — rejeitada, crescimento sem limite e violação de "só rows usam patch" |
| P2  | ~~Remover phase="draft"~~ **Decidido: manter draft**; o firstInput de createSession passa a ser opcional; o ciclo de vida de draft está em §4.2.1 (só em memória, não persistido, some com o restart do CLI) | O produto precisa de "criar antes uma sessão vazia e só depois digitar"                                                                                                                                    |
| P3  | ~~Espaço reservado para o command rewind~~ **Decidido: remover o comando independente**; rewind = entrada de UI de editUserQuery, e o poder de ação reaproveita canEdit             | Um caminho único por assunto                                                                                                                                                                                |
| P4  | **`hasBackgroundWork` removido de control** (o booleano permanece no SessionSummary do sessions-index)                                                                     | backgroundWorks[] já está na área A e a derivação custa uma linha de código; mantê-lo seria uma verdade redundante que pode divergir                                                                                      |
| P5  | **`forkOf` removido de createSession**; o fork passa só por forkAssistant                                                                                                   | Um caminho único por assunto; as duas entradas de 09§10 eram redundantes                                                                                                                                    |
| P6  | **rowId/`revision` são number, Timestamp é Unix ms**; rowId não ganha prefixo de string                                                                                    | Ordenação e comparação sem custo. Se for reservado espaço para ids compostos, pode virar string, com a regra de comparação de cursor mudando em conjunto                                                                            |
| P7  | **usage fica na área A de conversation**, e não em um topic separado                                                                                                       | É por sessão, de baixa frequência (após a conflação), e compartilha o ciclo de vida com a sessão. Alternativa: topic de domínio usage — a considerar quando existir uma página de agregação entre sessões       |
| P8  | **O envelope de command deixa de carregar clientMode**; o clientMode confiável é injetado pelo host no attachment, e o ClientHello só reporta o clientKind de telemetria           | A declaração do cliente não pode servir de fronteira de entrega desktop/mobile; além disso, repetir isso em cada command não tem sentido                                                                                        |
| P9  | **Comportamento de deep link**: o drill-down de subagent = assinar o topic conversation da sessão child, sem embutir child rows na projection do pai; a UI da sessão pai pode anexar de volta o `subagent` pareado ao bloco de ferramenta Agent/Task que o disparou | O princípio de line autossuficiente; o child é uma sessão comum                                                                                                                       |
| P10 | **A coordenação entre dispositivos de deleteSession** define apenas "sinal de término de assinatura + GC do estado local do cliente", sem lixeira/restauração                                                                              | Fechamento mínimo do G-07; exclusão lógica é uma decisão de produto                                                                                                                                      |
| P11 | Valores concretos como teto de 32 em pendingCommands, LRU de 512 na tabela de idempotência e anexos de 20MiB                                                                              | Todos marcados em §8 e ajustados por medição                                                                                                                                                        |

### Pendências externas das quais isto depende (parcialmente decididas em 2026-07-05)

- ~~Log de eventos A/B em §9.2~~ **Decidido: Opção B** (log limitado em memória + logEpoch, sem tabela nova; após o restart do CLI o cliente faz um snapshot).
- ~~Prevenção de duplicidade na janela de crash de fork/createSession~~ **Decidido: a sessão child grava `source_command_id`** (uma coluna ou metadata, prevenir duplicidade por completo).
- ~~Permissões de ação entre dispositivos (C-01)~~ **Decidido: paridade total** — qualquer cliente conectado pode parar / responder a um popup de permissão, e conflitos são encerrados pela idempotência. A superfície de autorização (G-13) ainda precisa ser escrita.
- ~~Catálogo de faults (G-12)~~ **Vocabulário definido**: os reasonCodes `fault.*` e a enumeração de `SessionErrorInfo.code` estão em [12-fault-catalog.md](./12-fault-catalog.md) (vocabulário de codes congelado; o comportamento de produto de cada fault continua sendo decidido lote a lote na decision worksheet, e as decisões só mudam ramos do reducer, não o code).
- ~~PB-\*~~ **Decidido (2026-07-05, fechamento das decisões de M0)**: F09 compact manual que falha permanece completed + failed marker (entrada de retry); G11 três falhas seguidas continuam executando sem compactação + circuit breaker; G12 um stop de goal e o stop comum ficam alinhados, com marker em `cancelled`; N06 permite trocar de modelo durante o compact, e o pendingAction lê o snapshot de config no instante do consumo. **Verificação da conclusão: o enum `status` do compact marker neste documento (running/success/failed/noop/cancelled) e a expressividade de `attempt`/`retryNotice` são suficientes, sem necessidade de ampliar o enum**. O registro item a item está em `docs/conversation-product-protocol.md`, em "Pending Product Boundaries".
