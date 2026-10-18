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

- profile 只由 trusted `clientMode` 注入：desktop/SSH/WSL/Docker=`continuous`；mobile remote/WebSocket=`replayable`。`SubscribeParams` 和 UI-facing API 不暴露选择项。
- **完成态与 profile 无关**（R-10）：任何 profile 下，工具完成时 `row.upserted` 的 `output` 采用同一份终态截断参数（§8），收敛性黄金测试因此可断言「终态逐字节一致」。
- 客户端代码禁止出现 profile 变量（05 试金石）。
- 被 profile 过滤的事件必须最终被某个不可过滤事件收口（05 不变量）。

---

## 4. conversation topic

`TopicKey = "conversation/<sessionId>"`。Snapshot = `ConversationSnapshot`，Delta = `ConversationDelta`。

### 4.1 Snapshot 总览

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

### 4.2 A 区字段

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

- `hasBackgroundWork` 从 control 移除：= `backgroundWorks.some(w => w.status === "running")`，客户端一行派生（§10-D7）。
- `control` 任一字段变化即整体重发（conflation 后每 flush 窗口最多一条）。

#### 4.2.2 SessionActionAvailability 与 InputRouting

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

- `choice`（2026-07-05 裁决，heldQueueInputRequiresChoice）：held 状态（completed + queue>0 + autoDrain=false）下 composer 输入不静默入队——客户端呈现「清空 queue 后发送 / 保留 queue 立即发送」，用户所选 disposition 随 `sendText`/`sendGoalCommand` payload 上行（`heldQueueDisposition`），CLI 按其裁决执行。
- compacting 期间输入 = `enqueue`（compactingAcceptsFutureInput，F04/F05/G05/G06）：追加 queue，不打断 compact；`/compact` 仍 reject（duplicateCompactRejected → `compactOperationLock`）。
- `mode=guide` 是可提交路由，不是 disabled/reject。V4 Composer 必须保留正常发送按钮与 Enter；CLI accepted 且 intent 可对账后才清空草稿。
- `guide` 只表示当前 turn 的 inline delivery；普通 `enqueue` 只表示 future turn。两者不能由同一个 generic round-trip drain 消费。

`availability.fork` 只表达 session/global lock（尤其 compact）；目标行是否合法只看 `RowActions.canFork`（§4.4.1）。UI 必须消费这两个权威字段，禁止按 phase、数组位置或 raw message 本地推断。edit/retry 仍只有行级资格。

#### 4.2.3 SessionConfigState（G-01）

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

- 事件写入路径：`switchModelConfig` / `setFollowupMode` / `switchCollaborationMode`（M5 additive）command → guard → 事件（ModelSelected / FollowupModeChanged / SessionModeChanged）→ 本字段整体替换下发。`ModelSelected` 必须携带切换完成后 runtime 的 `thoughtLevels` 与 `contextWindow`，使 `provider/model/thought/thoughtLevels` 和该模型实际窗口在同一 revision 原子收敛。客户端选择器 UI 是 optimistic overlay（按 commandId 挂起），权威值到达即收口——**没有「本地已选值 vs 回显值」的合并逻辑**（消灭 P2-10 补丁群）。
- 模型切换的 timeline 提示由 CLI 在下一个 turn 开始时生成 `modelChange` marker row（R-17），协议上没有「暂存的 marker」状态。
  - **R-17 时机细则（2026-07-07 五测裁决，2026-07-08 追认 thought-only 边界）**：marker 的比较基准 = **上一个实际启动的 turn 使用的模型身份**，模型身份只包含 `provider/model`，不包含 `thought`。推论：① 草稿态/首轮前任意拨动选择器不产 marker（首轮以最终选型启动，「第一次用什么」不构成「变化」）；② 编辑期切 A→B→A 净变化为零，下一 turn 不产 marker；③ 仅思考深度变化（例如 `high → max`）更新 `config.thought` 与请求参数，但不产 `modelChange`；④ 切换动作的即时反馈是**纯 UI 逻辑**（toast），不进 timeline。marker 位置：紧邻新 turn 的 turnHeader row 之前。
  - **R-17 展示细则（2026-07-29，2026-07-29 文案修正）**：marker 的 `fromProvider/fromModel/toProvider/toModel` 是完整模型身份，比较语义不因展示裁剪而改变。renderer 使用当前 provider snapshot 将 provider ID 映射为 `provider.name`；Z.ai / BigModel 内置供应商只显示 modelId，其他供应商按 `provider.name/modelId` 展示，配置已删除或尚未水合时回落为 `providerId/modelId`。该规则与模型触发器和 toast 一致，不改变 marker schema、生成时机或 replay 语义。

**config 种子语义（R-19，2026-07-07 裁决；落掉 M6 TODO「draft 期免 revision 种子通道」）**：

- **首个 snapshot 的 `config` 必须等于 runtime 真值**：`provider/model/thought` = runtime 当前模型选型（含启动时 workspace catalog 默认模型 / 持久化偏好的解析结果），`thoughtLevels` = `listThoughtLevels()` 对该 runtime 当前模型的结果，`mode` = runtime 当前协作模式（含项目持久化 permission mode 偏好）。禁止以空 `provider/model`、写死 `mode="build"` 或客户端通用五档作为初值。
- **种子通道 = snapshot 构造，不是事件 delta**：种子在投影初始化时从 runtime 读取注入（`getModelRef()` / `getMode()` / thought level），不产生 `state.updated`、不递增 revision——draft「无可见 delta、不 bump revision」的裁决（§4.2.1）不被破坏。R-04 的 revision 递进规则不变：config 的**变化**才递增，种子是初值不是变化。
- **冷恢复同一口径**：transcript hydration / cold resume 重建投影时，先按 runtime 真值种子，再被日志中的 ModelSelected / SessionModeChanged 重放覆盖（重放序在种子之后，最终值以日志为准）。
- **hydration 不丢 live tail**：首次重建按 session single-flight；读取 memory eventStore
  快照后到 publisher 替换前的 raw event 进入临时 buffer。raw sequence 可因各事件
  持久化 await 乱序到达，必须按 `sourceEventSeq+1` 暂存并连续 drain，禁止用
  “已见更大 seq”丢弃迟到的 queue/stream 事实。合成序列与 runtime raw seq 通过
  snapshot cursor 建立单调 offset，eventId + cursor 只用于去除已在快照中的真重复。
- **首次订阅时机不得改变终态快照**：若首轮回复在客户端首次 `subscribe` 之前已经完成，
  cold hydration 必须从 durable message/part 重建出与提前订阅 live path 相同的可见终态，
  包含已持久化的 user 与 assistant 正文。`providerVisibility` 与 `uiVisibility` /
  `transcriptVisibility` 是正交维度；正常 `assistant_response` 同时对 provider、UI、
  transcript 可见，不得因为 `providerVisibility=visible` 被归为 provider-context-only。
  desktop `desktop-continuous` 与手机 `web-remote-replayable` 可拥有不同的中间帧交付策略，
  但同一 durable transcript 的首次完整 snapshot 必须一致。禁止用延迟 provider、提前订阅、
  retry 或客户端补帧掩盖这一不变量。
- **种子来源分场景（优先级钉死，防实现时统一读 workspace 缺省冲掉会话历史）**：
  - 新建会话（草稿首发）：`createSession.config`（用户先行选择）＞ runtime 启动缺省（workspace catalog 默认模型 / 项目持久化 mode 偏好）。
  - 历史会话恢复：**会话自身的历史选型优先**——`derivePersistedRuntimeSettings` 从持久化消息倒序取最后使用的 model（thought 承载于 `modelRef.variant`）与 mode，经 `reconcileResumedRuntimeSettings` 写回 runtime。模型必须在当前 Environment 的 Registry 中解析；Provider Refactor 已删除 App 下发的 `runtimeModel` 权威覆盖。V4 gateway 用一个 READY promise 串起 runtime activation 与 projection hydration；不得为 V4 构建或返回 legacy 全量 session snapshot。旧 `session/resume` 继续以 `activation + legacy snapshot` 包装保持兼容。**种子取值必须在 activation 完成之后**（gateway 顺序 activation → hydrate），产品语义即「打开历史会话默认选中之前的模型和思考深度」。完整边界见 [17-cold-resume-runtime-activation.md](./17-cold-resume-runtime-activation.md)。
  - 会话内切换：命令事件（ModelSelected / SessionModeChanged）覆盖，同 §上文写入路径。
- **`createSession.config` 必须被消费**：payload 携带 partial config 时（草稿态 UI 的先行选择，见 m5-composer-parity §五），CLI 在会话创建时以「请求 config 覆盖 runtime 缺省」归并出初值，再按上述种子通道注入投影；缺省字段回落 runtime 真值。当前实现只在 schema 收下该字段、handler 未消费，属实现缺口。
- **同值切换 ACK 必须可判别**：`switchModelConfig` / `switchCollaborationMode` 命中 runtime 当前值时回 `noop` + `reasonCode="config.unchanged"`，不得以 accepted（无 result）静默吞掉。种子对齐后「UI 显示值 = runtime 真值」成立，noop 语义才是准确的。
- Bug 记录（2026-07-07，v4 桌面首测）：种子缺失导致两个用户可见故障——① 新会话模型选择器显示空（`ModelSelected` 仅在 switchModelConfig 后补发，全链路无初始时机）；② 项目持久化 mode=yolo 时 UI 按种子显示 build（"变更前确认"），点击 yolo 命中 handler 的同值提前返回（不发事件），UI 永远无法收敛。两者同根：**同值判断用 runtime 真值、UI 显示用投影种子，两边没有对齐时机**。
- Bug 记录（2026-07-16，E11/FX11）：旧 snapshot 只投影当前 `thought`，不投影“当前模型支持哪些 thought”。父会话尚可能从 legacy task config cache 读到目录，fork child 没有该缓存时则退回 UI 写死的五档，造成 GLM-5.2 也显示五档。能力是模型配置元组的一部分，必须从 child runtime 进入同一 snapshot/event；不能由 localStorage、workspace 目录或客户端 fallback 猜测。

#### 4.2.4 SessionUsageState（G-02）

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

conflation 语义：值未变不下发（P-05）；A 区整体替换保证「不会把正数 used 覆盖成 0」类 bug 无处生长。计费/配额（coding plan）不在 conversation topic，归 usage 域。

**模型切换窗口语义（2026-07-17）**：`usedTokens` 表示当前历史上下文占用，切换模型时不重算；
`maxTokens` 表示当前 runtime 已应用模型的窗口，必须随 `ModelSelected.contextWindow` 立即替换，同时更新
投影内部供后续 `ModelComplete` 回退使用的 `contextWindowMax`。旧持久化事件允许缺少该字段，此时保持
既有窗口，等待后续带窗口的 runtime 事件校准。禁止 renderer 从模型目录覆盖该字段，否则 session runtime
override、远端 registry 与 UI 目录会重新形成多源竞态。

- Bug 记录（2026-07-17）：历史会话从模型 A 切到 B 后，runtime 已正确应用 B 的 context window，
  但旧 `ModelSelected` 只发布模型和思考能力，V4 投影直到下一次 `ModelComplete` 才看到 B 的窗口，导致
  工具条长期显示 A 的容量分母。根因是模型能力元组发布不完整，不是 React 缓存或 runtime 切换失败。

#### 4.2.5 QueueState（D-03 / R-07）

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

输入守恒与回退规则：

- desktop/mobile 已提交的 busy/running 输入都先进入同一个 CLI `CommandInbox` FIFO，顺序以 `order.admissionSeq` 为准；手机 V4 不再走 host runtime 第二队列。
- guide 不适用、携带附件、compact/verifier busy 时，将同一 intent（原文、附件、clientId、sourceCommandId 不变）回退普通 queue，并记录 `delivery.fallbackReasonCode/steer.state="fellBack"`。
- eligible guide 可以在 tool call 出现前等待；一次 model step 的全部 sibling tool results（成功或失败）提交后，runtime 最多内联 drain 一条 guide，再开始同一 product turn 的下一 provider request。单个 parallel sibling 完成不能提前 drain，多条 guide 不能在同一 batch 一次清空。
- 当前 turn text-only complete、stop 或 interrupted，且没有形成可用 tool result batch 时，未 drain guide 必须通过明确的 delivery/fallback fact 原地改投 queue；`sourceCommandId/queueItemId/clientId/admissionSeq/payload` 全部不变，live/cold projection 收敛一致。
- 普通 queue 自动提升必须同时满足 `autoDrain=true`、session ready/no active controller，以及 `target` 不存在或 `target.status=complete`。该 guard 覆盖 text、goal command、compact 全部 kind；一次 verification marker 不能单独解锁。
- verifier 显式 pass 与 fail-open 都先写 `passed=true` 并更新 target complete，再正常重新评估 queue；手动 Stop/abort 是 cancelled/failed + target paused + `autoDrain=false`，不算 pass。`sendQueuedNow` 的 reservation + Stop barrier 是显式例外。
- empty/oversize/runtime reject 返回明确 `rejected/failed`；UI 保留文本与附件，不能先清空再静默失败。
- `editQueueItem` 原地更新，保留 ID、位置、附件和来源命令；`reorderQueueItem/deleteQueueItem/drain` 都以 `queueItemId` 操作同一 intent。
- drain/guided row/message anchor 必须沿用原 `sourceCommandId`，不能改用 promotion 或 send-now commandId。
- `sendQueuedNow` 固定为 `reserve → stop barrier → start/promote → remove`；只有启动成功才移除。timeout/失败释放 reservation、原项不变；连续点击与多端点击只能有一个 reservation owner。

`sendQueuedNow` 的 reservation 由 CLI runtime 按 `queueItemId` 持有，`TurnSteerDispatchChanged`
把 `queued/reserved/promoting` 投影到 QueueItem。reserved 队首禁止普通 roundtrip drain，普通
delete 也必须持有同一 reservationId；提升时只能从完整 QueueItem 还原输入，`inputId` 继续使用原
`sourceCommandId`，禁止退化为 text-only 或改用 send-now commandId。start barrier 之前失败回到
queued；start admitted 后若 remove 异常保持 promoting，禁止释放后重复执行。

`remove` 的 `promoted` 原因只从 queue 投影摘除，不能把 session-input ledger 置 cancelled：
text turn 的 user message 在后台开始阶段才写入，提前 cancelled 会重新制造
`queue 已消失 → transcript 尚未落盘` 的崩溃窗口。ledger 保持 admitted，直到
message/parts 与 ledger 在同一事务提交；提交后发 `SessionInputPromoted`，gateway 先失效旧
transcript query seed，再解除 CommandInbox live pin。若提交前 CLI 退出，恢复清扫把 admitted
明确置 `discarded(session_resumed)`。

队列只保证当前 CLI 进程内可靠。CLI restart 后未进入 transcript 的 admitted input 不恢复执行，而是在 discarded input ledger 留 tombstone；`commands/query` 返回 `failed/fault.command.inputDiscardedOnRestart`，并在 typed result 中带持久 `delivery`。`queue/guide` 与无权威结论的 `unknown` 由客户端静默结算且不呈现 UI 错误；只有未进入 transcript 的 `startNow` 才允许用户确认后以新 commandId 重发。

`ConversationInputIntent` 是 CLI admission 后唯一的输入事实，必须按严格 schema 校验；`attachments`
缺省时规范化为 `[]`。`inFlight`（正在执行）、`liveInputFacts`（仍在 queue/guide）与
`settled LRU`（每 session 512 条）是三张表：前两者 pinned、不可被 LRU churn 淘汰。CLI
为每个 session 串行分配 `order.admissionSeq`，不同 session 可并行。

持久边界冻结如下：user message 的 `metadata.conversationInputIntent` 和 session-input ledger 的
`payload.conversationInputIntent` 保存完整严格对象；`message.anchor.sourceCommandId` 保存快速查重锚点。
输入命令在业务 handler 执行前先写 ledger（含 startNow/createSession.firstInput），再允许 UI 收到
accepted；Queue/guide 的实际路由事件以同 `queueItemId` 幂等修正 delivery/fallback。执行前 admission
同时 pin 进 CommandInbox，只有原子 promotion、显式取消/失败或 discarded 才能解除，不能被 512 LRU
churn 淘汰。draft 首发必须先经 runtime 统一持久化边界建立 session 外键，再写 ledger；不能反过来
依赖后台 startPromptTurn 才建 session，否则 admission 会在 FK 边界失败且失去权威记录。
`createSession.firstInput` 的 command key 属于 `sessionId=null` 全局桶，但 ledger/transcript 属于
新建 session；ledger 必须额外保存 `sourceCommandType="createSession"`，并允许用全局唯一
`queue_<sourceCommandId>` 在未知 sessionId 时找回真实 session。原子 promotion 后同 commandId
重试返回第一次的 `result.sessionId`；restart 时仍为 admitted 则先置 discarded 并返回
`fault.command.inputDiscardedOnRestart`，禁止再创建第二个 session。
早期 transcript 的 `metadata.inputIntent` 只作为兼容读取 seed，新写入不得只保存 seed。runtime 内部可用
`TurnInputIntentMetadata + input + unresolved attachments` 的分层载体避免依赖 wire package，但只能通过同一
canonical adapter 生成上述完整对象，projection/hydration 禁止各自推断 delivery、steer 或 dispatch。

无 user message 的成功副作用使用 `session_entry(type="v4/command_fact")` 保存 timeline/child ACK；
compact timeline part 同时写 `sourceCommandId`。CLI 重启后，尚为 admitted 的旧 session-input 在首次
持久查询/恢复时原子收口为 `discarded(session_resumed)`，`commands/query` 必须返回
`failed/fault.command.inputDiscardedOnRestart`，不能返回 unknown 或自动重放。

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

#### 4.2.6 PendingInteraction（阻塞交互 → 状态）

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

生命周期：出现/消失都走 `state.updated.pendingInteractions` 整体替换。应答 = `resolveInteraction` command；他端已答 → 本端下一帧该项消失，无需专门同步逻辑。CLI 重启 → running turn 死亡 → 数组自然清空（§9.3）。

`AskUserQuestion` 和 `ExitPlanMode` 都属于 `userInput` / elicitation，而不是普通
permission。它们仍由 core 发出 `permission_requested` 等待态，但 v4 projection 必须把
这些 user-input-backed 工具映射为 `pendingInteractions.userInput`，保留 `questions[]`
和 `schema`，由客户端复用 `ElicitationDialog` 回答。普通工具权限继续走
`pendingInteractions.permission` 与 `PermissionDialog`。

UI 布局约束：`pendingInteractions[0]` 是当前会话 bottom dock 的阻塞交互，必须和
composer 共用 `ConversationTimeline` 的 sticky dock 与主列宽度；不能作为
`SessionPane` 外层的独立全宽底部区域渲染。阻塞期间 composer 仍保持挂载但隐藏
（例如通过 `blockingRequestId` 设置 `aria-hidden=true` 与 `display:none`），避免切换
权限 / elicitation 时丢失草稿、编辑器实例和附件状态。Queue panel 属于同一 dock 内的
待发送提示，可继续显示在阻塞交互之前。

#### 4.2.7 CommandStateSummary 与 BackgroundWorkSummary

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

#### 4.2.8 GoalState 与 PlanState

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

### 4.3 行分页（游标制，R-06）

- snapshot 只带尾部窗口；更早历史用 `rows/range`（§7.1）按 `beforeRowId` 游标拉取。
- **没有任何 index 语义**：行的全序 = rowId 升序；客户端合并一律以 rowId 为排序键。
- patch 命中未加载 rowId（已滚出并被客户端逐出 / 在未拉取的历史段）= **no-op**，被逐出的行只能通过重新 `rows/range` 取回。
- `row.removed(fromRowId)` 作用于客户端已加载集合中所有 `rowId >= fromRowId` 的行（含已拉取的历史段），因此截断天然一致，无需 seq 门控。

### 4.4 ConversationRow（8 种，自包含，全字段）

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

#### 4.4.2 turnHeader（新增行类型，G-05 的落点）

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

覆盖 P1-12b：auto compact 等「附着在上一工作块」的归属由 CLI 决定 compact 行落在哪个 turnHeader 之后，客户端零归属逻辑。

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

不变量（09§3 保留）：追加只能进 `state="streaming"` 的行；普通的新模型 response 必然新
`rowId`。唯一例外是同一 product turn 内的 output-token Continue：上一请求以
`ModelComplete(stopReason="length", toolCallCount=0)` 收口，且下一段可见内容仍紧邻上一条
`assistantText` 时，ProductProjection 必须把原行重新置为 `streaming` 并在同一 Markdown 正文末尾
继续追加。任何 tool、reasoning、可见 user、timeline boundary、product turn 切换或非 `length` 收口
都会取消该复用资格。复用期间 `rowId` 保持稳定，`entityId`、`assistantResponseId`、message action
锚点推进到最新 assistant message；冷恢复使用持久化 `assistant.info.finish` 重建相同结果。

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

**display 在信封层不设门。** 四个嵌入点——`ToolCallRow.display`、`ToolOutput.display`、
`pendingInteractions[].payload.display`（确认预览）、`turnHeader/userInput.workflowLaunch.display`
（启动行图）——的载荷都是 `.optional().catch(undefined)`：认不出来的 display 被**丢掉**，帧照常
交付，卡片退化成纯文本。成员 schema 本身仍是 `.strict()`（它们定义「本端认得的形状」），未知
字段、未知枚举值、未知 `kind`（新客户端新增的卡种）一律只丢这一张卡的载荷。

理由是分量不对等：display 是装饰载荷，却长在 liveness 关键的信封里。一个多出来的键曾让整帧被
`proto.frameAssemblyInvalidPayload` 拒 → 恢复阶梯在同一份内容上重试 → 会话 fail closed，而每次
快照都重放同一份存量载荷，会话永不自愈（2026-09-17 的 `providerStop`、2026-09-21 的
`list_workflow_runs` lineage 键，同一形状两次）。严格性没有丢，只是挪到了渲染层：`readToolResultDisplay`
本来就按 `kind` 逐个 strict 解析并在失败时回退纯文本——这正是各 spec 一直承诺的行为，信封层那道
门是重复的第二道门，唯一的独有效果是杀死会话。

代价是两侧 schema 偏斜变**静默**（卡片安静地退化成文本）。补偿手段是构造侧与镜像侧的 parity
测试，不是让线上订阅去发现它。必填字段偏斜没有卡可丢，仍会拒帧——那条路的后备见
04-sync-and-recovery 封闭规则 11。回归见
`packages/shared/test/zcodeProtocolV4DisplayTolerance.test.ts`。

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

前提 R-05：subagent 镜像事件必须进事件日志，本行的流式与区间记账才成立。

UI 渲染裁决（2026-07-16 修订）：父会话投影仍保留触发它的 `Agent`/`Task`
`toolCall` 行与对应 `subagent` 行两条事实；投影必须把事件中的 `parentToolCallId`
保留到 `SubagentRow`，渲染层只能用 `toolCallId === parentToolCallId` 精确配对。
并发工具的 spawn/完成顺序不保证与模型输出的 tool call 顺序一致，禁止按行位置、
标题或时间猜测。兼容缺少该字段的历史数据时，仅在同一 turn 恰好剩余一个未配对
Agent/Task 行和一个未关联 subagent 行时允许一对一降级；存在歧义则保留独立行。
已精确配对的 `subagent` 不再单独生成 timeline 块，而是把 `childSessionId` 下钻和
「在右侧打开」入口放进触发它的「子智能体」工具块展开区。P9 语义不变：下钻
内容通过订阅 `conversation/<childSessionId>` 获取，不把 child rows 写回父投影。

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

#### 4.4.8 StableForkTarget 与 running fork

所有 V4 fork 目标必须经过唯一解析器，UI 不得自行扫描 raw message：

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

规范性裁决：

1. 目标必须是 `completedSuccess` product turn 的最后一段 `state="complete"` assistant；返回的 turn/message/boundary id 在重试间固定。
2. 新数据以持久化 turn anchor 为准；旧数据仅在 message/turn 边界无歧义时 fallback，否则 `guard.forkTargetAmbiguous`。
3. primary turn、foreground subagent、goal continuation、goal verifier running 时，可以 fork 更早的稳定 turn；compact 仍是 operation lock。
4. 当前 streaming/interrupted/failed partial、中间 assistant 段、user/tool/timeline 一律拒绝。
5. running fork 不进入带 `ensureNoActiveTurn` 的 legacy bridge：只复制稳定 transcript、fork 点 config 和 fork 点前 goal；不复制 queue、active/background work、continuation inbox，不 rewind shared workspace，parent 原样继续 running。
6. completed/idle 的既有 workspace checkpoint 行为本轮不扩大。
7. E10/FX08 以 logical turn boundary 复制工具块、工具结果后的最终 assistant 与该 turn 已产生的文件事实，不按“最后一条 raw assistant message”截断。
8. child metadata 必须持久化 `sourceCommandId` 与 `StableForkTarget`；同 commandId 重试返回同一 child。
9. 新数据必须在 `TurnComplete` 对订阅者可见前完成最终 assistant anchor 的持久化；anchor 固定 raw message segment、boundary 与显式 `goalBoundary`。缺省 `goalBoundary` 仅表示 legacy，不能读取 parent 当前 goal 冒充历史快照。

### 4.5 Delta：七个操作 + coalesce + revision 递进

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

`workflowRuns` 是唯一另有键化增量的状态键：一次引擎事件只改一个 run 的少数 header 字段和少数条目，
整键按事件重发则是 O(N²) 字节。条目界不因此消失——snapshot 仍整键携带，界是它的预算
（见 [presentation.md](../dynamic-workflow/presentation.md)「The run state the pane draws」）。
`WorkflowRunHeader` = `WorkflowRunState` 去掉 `actors`/`nodes`，由 schema `.omit` 派生而非手抄词表。语义：

- header 键按 `run` 整体替换、按 `cleared` 删除；header 内的小集合（`reports`/`artifacts`/`phases`/
  `pendingQuestions` …）仍是整体替换的值，不做二级增量。
- `removedActors`/`removedNodes` 按 `(siteId, ordinal)` 删除条目（未命中的键是 no-op），`actors`/`nodes`
  按同一个键 upsert：命中替换、未命中追加到尾部。条目**不重排**——生产者只在触界时淘汰
  （[presentation.md](../dynamic-workflow/presentation.md)「Reduction」），淘汰必须用这两个键说出来，
  而删除之外的顺序变化这个模型仍然表达不了。四个数组的界 = `WORKFLOW_RUNS_LIMITS.maxActors` / `maxNodes`。
- 一条 op 内的施加序固定为 **header → 删除 → upsert**：同一个键在一条 op 里被删又被加时，它落在表尾，
  与逐条施加两条 op 的结果一致。
- apply：`workflowRuns` 缺省时按 `{revision: 0, runs: []}` 起算。命中 run 按上面几条更新；未命中 run 而
  `run` 是**完整 header**（必填 header 字段齐全）= 新生，追加到 `runs` 末尾；未命中且 header 不完整 =
  定义明确的 no-op（与 `row.upserted` 命中未加载行同一条规则），不得报错。`workflowRun.removed` 过滤掉
  该 run，未命中时只推进 revision。容器 `revision` 取 `max(当前, op.revision)`（coalesce 会把同 run 的
  op 前移，见下）。未变的 run 与未变的条目保持对象身份，变化的 run 与容器是新对象。
- **客户端永不执行界**（`maxRuns`、条目界、总预算）：淘汰只由 producer 做，并明说——整条 run 用
  `workflowRun.removed`，表内条目用 `removedActors` / `removedNodes`。
- 一次引擎事件对一个 run 最多产生一个 `updated`（节点、派生的 actor 状态、usage 与 `lastEventSequence`
  原子落在一起），外加被淘汰 run 的 `removed`。
- 两个 op 都不进 profile filter（与 `state.updated` 同类，§3.6），也都不递增 conversation revision：
  `workflowRuns` 自带单调 revision，且没有任何 command 的 baseRevision CAS 读它。
- 未声明 `workflowRunDeltas`（§2）的订阅者收不到这两个 op：publisher 为它把整批 `workflowRun.*` 降级
  成一条整键 `state.updated{workflowRuns}`，并按旧界钳位（[05 §1.1](./05-transport-and-backpressure.md)）。

coalesce 规则（`@zcode/protocol` 纯函数）：

1. 相邻同 `(rowId, path)` 的 `row.delta` → append 拼接；
2. 相邻 `state.updated` → patch 键浅合并（键内整体替换，安全）；
3. `row.delta` 后随同 rowId 的 `row.upserted` → 前者丢弃；
4. `row.removed` 是屏障，任何规则不得跨越；
5. 合并后单帧超过 `maxFrameBytes` → 按 §3.2 切分；
6. 同 runId 的 `workflowRun.updated` 向前合并进窗口内**最后**一条、未被屏障隔开的同 runId
   `workflowRun.updated`：header 键 last-wins 并与 `cleared` 对账（后来的赋值把该键移出 `cleared`，
   后来的清除把它移出 `run`），条目按 `(siteId, ordinal)` last-wins 且保持首次出现顺序，`revision`
   取最后一个。删除与 upsert 按「合并等于顺序施加」推出来：`removedActors` / `removedNodes` 取两侧的
   并集（按首次出现去重），而**先者的 upsert 里凡是被后者删掉的键一律去掉**，再按上面的规则叠加
   后者的 upsert。于是一个先删后加的键落在表尾——顺序施加两条 op 得到的正是这个位置。屏障有两类：
   patch 含 `workflowRuns` 的 `state.updated`（整键替换）、同 runId 的 `workflowRun.removed`；
   `removed` 同时吞掉该 run 自上一个屏障以来的全部 `updated`（同一窗口内生又删，客户端从未见过
   这个 run，等价）。
   **合并出来的四张条目表任一超过线上界时不合并**，两条 op 照原样留着、次序不变。会超界的其实
   只有两张**删除**表：按上面的合并规则，留在 upsert 里的每个键在这条 op 施加完之后都还在表里，
   而表本身有界；删除表没有这条护栏——合并分不出「窗口里刚出生又被淘汰的键」和「客户端早就
   拿着的键」，而每次淘汰都让出一个位子，所以一个够宽的窗口里被删掉的不同键可以多于表界
   （淘汰之前不可能：表只增不减）。四张都查只是因为这道闸便宜，不该依赖那条论证一直成立。
   超界的载荷不会被剥掉一个键——它让整个 patch 解析失败、整帧被丢。合并是优化，拒绝合并不改变
   终态。目标取**最后**一条而不是更早的，正是为了这种情形：合并一路成功时屏障之后只剩一条
   `updated`，「最早」与「最后」是同一条；一旦有一次被拒，往更早那条合会让后来的 upsert 跳到
   中间那条的删除**之前**，一个先删后加的键就此消失。

规则 6 的前移跨越中间的 row op、别的 runId 的 op 和不含 `workflowRuns` 的 `state.updated` 是可交换的：
它们作用在不相交的状态上，且 run 新生按首次出现顺序进 `runs`，顺序不变。唯一不可交换的是容器
`revision`——两个 run 的 op 交错时，合并后输出序列的最后一个 op 必须仍携带最高 revision，这由 apply 取
`max` 保证（revision 按契约单调）。判据仍是既有黄金测试的那条等式：`applyAll(s, coalesce(ds))` 与
`applyAll(s, ds)` 逐字节一致。合并后每个在飞 run 每窗口至多约 2 个 op（撞上条目界而拒绝合并时多
几个），与 fan-out 宽度无关，§3.2 的 500 op 边界因此不受这两个 op 威胁。

**revision 递进规则（R-04，封闭定义）**：以下事件各 +1，其余（纯 `row.delta` 文本流、`usage` 变化、`pendingCommands` 变化、`workflowRuns` 变化（含两个 `workflowRun.*` op）、`ToolProgress` 更新）**不递增**：

| 递增 revision 的事件                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------- |
| row.appended / row.upserted / row.removed（任何行结构与状态机变化）                                                   |
| control / availability / inputRouting / config / queue / pendingInteractions / backgroundWorks / goal / plan 任一变化 |

携带规则：任何含 revision 递增事件的帧，其 deltas 必含 `state.updated.revision`（conflation 后自然满足：至少 revision 键在场）。CAS（§6.2）由此语义明确：**revision 不变 ⇔ 没有任何 guard 可见的状态变化**。

---

## 5. sessions-index topic

`TopicKey = "sessions-index/<workspaceId>"`。列表 activity/状态点的权威数据源；conflated 最新态，永不溢出。未读属于 tasks-index membership，不从 activity time 推导。

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

## 6. Command 层

### 6.1 信封

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

| status      | 语义                                                                                                                                                                                                 | UI 收口                                         |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `accepted`  | CLI 已受理命令；其中输入命令已完成串行 admission 并进入 input ledger/inbox。**输入不承诺跨 CLI 进程继续执行**；最终收口以 `sourceCommandId` 命中 QueueItem/row/transcript 或 explicit discarded 为准 | 保留 optimistic 与 pending registry，等权威状态 |
| `rejected`  | guard 拒绝                                                                                                                                                                                           | 撤 optimistic，按 reasonCode 提示               |
| `stale`     | baseRevision 过旧                                                                                                                                                                                    | 撤 optimistic；拉最新投影后由用户重发           |
| `duplicate` | **同 commandId** 已处理                                                                                                                                                                              | 用 result 收口，不重放副作用                    |
| `noop`      | 命令有效但无事可做（R-09）：stop-while-stopping、resolveInteraction 已被他端答掉                                                                                                                     | 静默收口；result 携带既有结论                   |
| `failed`    | accepted 后执行失败                                                                                                                                                                                  | 按 reasonCode 展示；配合 lastError/row 状态     |

幂等与重试（§9.3 裁决后的口径）：

- 服务端查重顺序：内存 LRU → transcript user/message anchor、timeline marker、fork child metadata 的 `sourceCommandId` → discarded input ledger → `unknown`。discarded 命中返回 `failed/fault.command.inputDiscardedOnRestart`，不能退化成 unknown。
- 同 `{sessionId,commandId}` 的 query 与 execute 共用 single-flight/互斥入口，消除“执行已开始、尚未写 LRU/transcript”窗口；并发 duplicate/fork duplicate 均只能执行一次副作用。
- 客户端 24h pending registry：普通文本/goal 保存可重发 payload，敏感 interaction 只保存 digest。QueueItem/guided projection 出现即删除记录；重连先 `commands/query` 对账，discarded `queue/guide` 与 unknown 静默清账，只有 `startNow` 保留人工确认；任何分支都**永不自动重发**。
- registry 以 `{sessionId,commandId}` 为键写入 renderer 持久存储，写入必须早于第一次
  `v4/command` 上行；TTL 从首次写入起固定为 24h，刷新、attachment 重建或 CLI runtime
  换代不得延长。`sendText`、`sendGoalCommand` 与携 `firstInput` 的 `createSession` 保存可重发
  payload；`resolveInteraction` 只保存 payload digest，禁止落盘权限答案、freeText 或 elicitation
  content。
- input 命令收到 `accepted/duplicate` 只证明 admission，不单独删除 registry；带相同
  `sourceCommandId` 的 QueueItem/guided projection 或 transcript user row、显式
  rejected/stale/noop/failed/cancelled、discarded `queue/guide` 或 TTL 到期才删除。敏感 interaction 收到确定
  ACK 后即可删除，ACK 不明时在重连 query 得到结果后删除；`unknown` 同样静默删除。
- 每次 conversation subscribe 进入 live（含 runtime restart 后 fresh snapshot）先按 session 分批
  查询 registry，单批最多 64 项。`unknown` 与 delivery=`queue/guide` 的
  `failed/fault.command.inputDiscardedOnRestart` 直接清账且不呈现 UI 错误；只有 delivery=`startNow`
  生成一次 recoverable notice。UI 只在用户点击“重新发送”后用**新 commandId**提交保存的 input
  payload。无 payload 的敏感 interaction 遇到 `unknown` 也静默清账。queryUnavailable 保留条目并
  等待下次连接对账，不伪装成 unknown。
- 连接存续期内的丢帧由 rpc 重放兜底，客户端不做应用层定时重发。

### 6.3 多端并发裁决（03 收口，用 ACK 枚举重述）

| 场景                     | 先到者   | 晚到者（不同 commandId）                                             |
| ------------------------ | -------- | -------------------------------------------------------------------- |
| 两端同时 stop            | accepted | **noop**（reasonCode=alreadyStopping，result 空）                    |
| 两端同答同一 interaction | accepted | **noop**（reasonCode=alreadyResolved，result.resolvedBy 携带先到者） |
| 基于旧 revision 的操作   | accepted | stale                                                                |
| 同 commandId 网络重试    | accepted | duplicate（回放 result）                                             |

### 6.4 命令全集（payload 字段级）

CAS ✓ = 信封必带 `baseRevision`。所有 row-targeting 命令还必须带 `baseLogEpoch`，payload
使用 `target: { rowId, entityId }`；CLI 严格按 epoch → revision → entity → action 顺序校验，
客户端不得只凭 display row 位置提交动作。guard 列为 product-protocol 的 guard/invariant id。

| type                   | payload                                                                                                                                   | CAS | 效果（投影可见）                                                                                                                                                                                                                                                                                 | guard                                                                                                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createSession`        | `{ workspaceId: string; firstInput?: { text: string; attachments?: AttachmentRef[] }; config?: Partial<SessionConfigState> }`             | –   | 裁决（2026-07-05）：`firstInput` 可选。缺省 → phase=draft 空会话（见 §4.2.1 draft 生命周期）；携带 → 直接 turnHeader+userInput rows。ACK result.sessionId                                                                                                                                        | `firstSend`                                                                                                                                                                             |
| `sendText`             | `{ text: string; attachments?: AttachmentRef[]; heldQueueDisposition?: "clearQueueAndSend" \| "keepQueueAndSend" }`                       | –   | admission 先生成完整 `ConversationInputIntent`；startNow → user row，enqueue → QueueItem，guide → 等完整 tool-result batch 后最多一条 inline guided row。guide 无 tool boundary/不适用/附件/compact/verifier busy 以同 intent 回退普通 queue；empty/oversize/runtime reject 明确 rejected/failed | `runningPromptQueues` / `guideModeTurnSteer` / `guideDrainsAfterCompletedToolBatch` / `guideFallbackPreservesIntent` / `unfinishedSessionPromptQueues` / `heldQueueInputRequiresChoice` |
| `sendGoalCommand`      | `{ text: string; heldQueueDisposition?: "clearQueueAndSend" \| "keepQueueAndSend" }`                                                      | –   | enqueue 为 kind=sendGoalCommand；消费时 set/update goal + goalSet marker；held 下同 sendText 走 choice                                                                                                                                                                                           | `unfinishedSessionGoalQueues` / `heldQueueInputRequiresChoice`                                                                                                                          |
| `stop`                 | `{}`                                                                                                                                      | –   | 终止全部 completion-blocking work → phase=completedInterrupted；queue 保留 autoDrain=false；goal active→paused                                                                                                                                                                                   | `stopBusySessionCancelsForegroundWork`                                                                                                                                                  |
| `compact`              | `{}`                                                                                                                                      | –   | startNow → compact marker；running/goal verifier/held → kind=compact 的 QueueItem，FIFO promotion 时执行；不生成 user row；重复 active/queued compact reject                                                                                                                                     | `manualCompact` / `runningCompactQueues` / `heldCompactQueues` / `compactOperationLock`                                                                                                 |
| `forkAssistant`        | `{ target: { rowId: number; entityId: string } }`                                                                                         | ✓   | 先统一 target resolver；running 时 conversation-only 复制稳定 logical turn，parent 继续且 shared workspace 不 rewind；同 commandId 返回同 child                                                                                                                                                  | `runningStableAssistantForkAllowed` / `forkAssistantOnly` / `forkTargetAmbiguous` / `compactOperationLock`                                                                              |
| `applyFileRewind`      | `{ target: { rowId: number; entityId: string } }`                                                                                         | ✓   | 仅 `turnHeader.actions.canRewindFiles=true` 可 preview/apply workspace 文件变化；不截断 conversation 历史                                                                                                                                                                                        | `fileRewindTargetOnly` / `fileRewindUnavailable` / `compactOperationLock`                                                                                                               |
| `editUserQuery`        | `{ target: { rowId: number; entityId: string }; newText: string; attachments?: AttachmentRef[]; workspaceMode?: "preserve" \| "rewind" }` | ✓   | latest query running 时先 stop barrier；compact 前后都在原 session append-only branch cut 并按 canonical intent 重放。`workspaceMode=rewind` 在同一 command 内安全预检并恢复文件，unsafe/ignored 返回 blocked 且不改 branch/file                                                                 | `latestQueryEditPreemptsActiveTurn` / `compactCoveredLatestEditRewindsInPlace` / `editUserOnly` / `editKeepsQueue`                                                                      |
| `retryTurn`            | `{ target: { rowId: number; entityId: string } }`                                                                                         | ✓   | 从 canonical `ConversationInputIntent` 重跑 canRetry=true 的最后 assistant turn，保留 input kind、附件和 provenance                                                                                                                                                                              | `latestAssistantRetryOnly`                                                                                                                                                              |
| `setAssistantFeedback` | `{ target: { rowId: number; entityId: string }; feedback: "like" \| "dislike" \| null }`                                                  | ✓   | 仅 assistantText 可写；非 null 值持久化到 assistant message/row，null 删除 feedback；同值可作为幂等 accepted/noop 收口                                                                                                                                                                           | `assistantFeedbackTargetOnly`                                                                                                                                                           |
| ~~`rewind`~~           | —                                                                                                                                         | —   | **删除独立命令**。conversation rewind 是 `editUserQuery` 的 UI 入口；workspace-only 仍走 `applyFileRewind`，组合语义由 `editUserQuery.workspaceMode` 在 Agent 内原子协调                                                                                                                         | —                                                                                                                                                                                       |
| `sendQueuedNow`        | `{ queueItemId: string }`                                                                                                                 | ✓   | `reserve → stop barrier → start/promote → remove`；启动成功才移除，失败/timeout 释放 reservation 且原项不变，多端竞争单 winner                                                                                                                                                                   | `sendQueuedNowStopsBeforeDrain` / `*OperationLock`                                                                                                                                      |
| `editQueueItem`        | `{ queueItemId: string; newText: string }`                                                                                                | ✓   | 文本/goal 项原地更新并整体下发 queue；保留 ID、位置、attachments、clientId、sourceCommandId；kind=compact 不可编辑                                                                                                                                                                               | `queueContentIndependence` / `queueItemNotEditable`                                                                                                                                     |
| `reorderQueueItem`     | `{ queueItemId: string; beforeQueueItemId: string \| null }`                                                                              | ✓   | 同上（null = 移到队尾）                                                                                                                                                                                                                                                                          | 同上                                                                                                                                                                                    |
| `deleteQueueItem`      | `{ queueItemId: string }`                                                                                                                 | ✓   | 同上                                                                                                                                                                                                                                                                                             | 同上                                                                                                                                                                                    |
| `setAutoDrain`         | `{ autoDrain: boolean }`                                                                                                                  | ✓   | queue.autoDrain 更新（held 恢复入口，G-07）                                                                                                                                                                                                                                                      | `heldQueueInputRequiresChoice` 语境                                                                                                                                                     |
| `resolveInteraction`   | `{ interactionId: string; answer: { optionId?: string; freeText?: string } }`                                                             | –   | 该项从 pendingInteractions 消失；toolCall row 状态推进                                                                                                                                                                                                                                           | 先到先得，晚到 noop                                                                                                                                                                     |
| `switchModelConfig`    | `{ provider: string; model: string; thought: string }`                                                                                    | ✓   | config 整体替换；下一 turn 起按 provider/model 身份变化生成 modelChange marker；thought-only 不产 marker                                                                                                                                                                                         | `sessionConfigScoped` / PB-AUTO-COMP-MODEL-N06                                                                                                                                          |
| `setFollowupMode`      | `{ mode: "queue" \| "guide" }`                                                                                                            | ✓   | config.followupMode 更新                                                                                                                                                                                                                                                                         | `followupInputModeExplicit`                                                                                                                                                             |
| `resumeGoal`           | `{}`                                                                                                                                      | ✓   | goal.status paused→active（G-07）                                                                                                                                                                                                                                                                | `stopPausesActiveGoalTarget` 的逆操作                                                                                                                                                   |
| `cancelBackgroundWork` | `{ workId: string }`                                                                                                                      | –   | 对应 BackgroundWorkSummary → cancelled；不改 sessionEnded                                                                                                                                                                                                                                        | `backgroundWorkDoesNotBlockSessionEnd`                                                                                                                                                  |
| `renameSession`        | `{ title: string }`                                                                                                                       | –   | sessions-index 的 SessionSummary.title 更新                                                                                                                                                                                                                                                      | –                                                                                                                                                                                       |
| `deleteSession`        | `{}`                                                                                                                                      | –   | sessions-index `session.removed`；对已订阅客户端：订阅终止信号 + pane 回空态（G-07 联动清理由客户端执行本地态 GC）                                                                                                                                                                               | –                                                                                                                                                                                       |

### 6.5 附件上行（G-07）

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

事务 key 至少为 `(trusted connectionId, sessionId, uploadId)`。同 metadata 的 begin 重试返回当前
`nextChunkIndex`/已提交 ref；冲突 metadata 拒绝。chunk 只接受 expected next index；相同 index +
相同 bytes 是 no-op，冲突 duplicate 或 future gap 明确失败。commit 只在片数、总字节和 whole SHA-256
全部吻合后原子写 artifact；ACK 丢失重试返回同一 ref。abort 幂等。active uploads、全局 staged bytes、
TTL、connection close、session close 与 CLI restart 都有硬清理边界，半成品不进入 artifact store。

UI 高层仍是“put attachment → ref”，但 production wire 不再存在承载完整 `dataBase64` 的
`v4/attachment/put` fallback。上传失败不清 composer 文本/附件；CLI restart 后也不自动 replay bytes。
ref 未被任何 message 引用时按 TTL 回收（§8）。

---

## 7. Query 层（只读、无状态、超时重发安全）

### 7.1 rows/range（R-06 游标制）

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

合并规范（客户端）：按 rowId 键控插入；与订阅流的 `row.upserted/removed` 天然一致（§4.3）；`atLogEpoch` 不等于 store 当前 epoch 的结果**整体丢弃**（跨 CLI 重启的陈旧读）。

### 7.2 toolOutput/get、attachment/read 与 artifactd

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

`attachment/read` 是严格只读 query：服务端必须先把 session 水合到当前 projection，再确认 ref
等于该 session 任一 user row 图片附件的 `previewRef ?? ref`；非图片、跨 session ref、任意路径和
越界 offset 都返回结构化 fault。单次 decoded chunk 不得超过 512 KiB，避免 base64 后突破
1MiB NDJSON envelope；客户端按 `nextOffset` 顺序拉取并校验 `totalBytes`/`mediaType` 在各 chunk
间保持不变。服务端可对同 session/ref 做 30 秒、总量有界的读取缓存，session dispose 和 CLI
dispose 时必须清理。

ref 有效期 = 对应 message 生命周期（artifact store 落盘，跨重启有效）。compact `summaryRef`
继续走 `toolOutput/get`；attachment `previewRef` 优先走 `attachment/read`。历史附件只有 `ref` 时
允许读取该 ref，但仍必须通过当前 session row 授权。query 不新增 conversation event、snapshot、
queue 或 relay/main 业务状态；桌面 `desktop-continuous` 与手机 `web-remote-replayable` 共用该
读取合同。

### 7.3 commands/query（重连对账）

```ts
interface CommandKey { sessionId: string | null; commandId: string }

commands/query { commands: CommandKey[] }      // 1..64 个
  -> { results: Array<{ key: CommandKey; result: CommandAck | "unknown" }> }
```

每个 key 按 `内存 LRU → transcript/message anchor → timeline marker → fork child metadata → discarded input ledger → unknown` 查询。query 与 execute 同 key single-flight。discarded ledger 命中返回 `failed/fault.command.inputDiscardedOnRestart`；只有全部事实源未命中才是 `unknown`。客户端行为见 §6.2。

补充约束：

- `commands` 必须为 1..64 个，结果严格保持输入顺序；`sessionId=null` 只查询全局/
  `createSession` 幂等桶。携 firstInput 的 create 命令通过 `queue_<sourceCommandId>` 精确找回
  新 session 的 ledger；promoted 返回原 `result.sessionId`，admitted-on-restart 返回 discarded。
- memory 的精确顺序为 `inFlight → liveInputFacts → settled LRU`；persistent 的精确顺序为
  `message anchor → timeline marker → child metadata → discarded ledger`，只按完全相等的
  `sourceCommandId` 命中，禁止用文本或时间戳猜测。
- query 与 execute 共享同一 per-key gate；固定加锁序为 key gate → per-session admission gate。
  execute 已 pin 后并发 query 不得返回 `unknown`，同 session 不同 commandId 的 admission
  严格 FIFO，不同 session 互不阻塞。
- 该 session 已有 V4 cold READY flight 时，query/execute 必须先等待，再按原有优先级查询当前
  持久事实；不得先查询旧水位后重查，也不得主动激活历史 session。
- persistent 读取失败返回逐 key 的 `failed/fault.command.queryUnavailable`，不能降级成
  `unknown`；`unknown` 不缓存。持久化索引按 session 惰性构建并增量更新，workspace 隔离键
  固定为 `workspaceIdentity?.trim() || workspacePath`，禁止每次 query 全量扫描 transcript。

### 7.4 首屏 bootstrap

无聚合中间层（05）：连接建立后客户端**并行**发起 `subscribe(sessions-index/<ws>)` + `subscribe(conversation/<活跃 sessionId>)` + settings 类 query，ws 多路复用一个 RTT 内完成。无专门 bootstrap 方法。

### 7.5 Live conversation telemetry feed

对话埋点使用独立的 ephemeral live feed，不属于 conversation topic，也不参与 snapshot、fragment、
recovery 或 `rows/range`。事实只从当前 CLI 进程的 runtime live ingest 分流：

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

强制边界：

- persisted hydration、subscribe initial、cold snapshot 和 gap recovery 不产生 fact；hydration 期间新到达
  的 live runtime event 仍产生一次。
- fact 不进入 transcript、ConversationRow、事件日志、relay 或 main 业务状态。
- prompt/text chunk 不携正文；tool 不携 input/output；模型 URL 只保留解析后的 hostname。
- Host 根据 attachment 的可信 `clientMode` 开放订阅，只有 `desktop-continuous` renderer 安装实际
  reporter；`web-remote-replayable` 不得通过伪造字段扩大旧桌面采集口径。
- workspace supervisor key 使用
  `endpoint + remoteSessionId + (workspaceIdentity?.trim() || workspacePath) + serviceGeneration`；
  pane/SessionDataLayer 生命周期不得拥有该状态。
- eventId 使用约 2000 条有界 LRU；terminal 与 compact 另按业务 key exactly-once。

完整事件名、字段兼容和前后台矩阵见
[`docs/monitoring/conversation-telemetry-v4.md`](../monitoring/conversation-telemetry-v4.md)。

---

## 8. 常量与限额（初始值，实测调参）

| 参数                                      | 值                                                                        | 出处                  |
| ----------------------------------------- | ------------------------------------------------------------------------- | --------------------- |
| `maxFrameBytes`                           | 1 MiB（physical JSON/RPC 含 envelope）                                    | R-12                  |
| `maxLogicalAssemblyBytes`                 | 16 MiB；超限 admission 明确拒绝                                           | 05/§3.2               |
| `maxLogicalAssemblyFragments`             | 1,024                                                                     | 05/§3.2               |
| 并发 assembly / decoded staging / timeout | 32 / 32 MiB / 30s                                                         | 05/§3.2               |
| flushWindowMs                             | continuous 30ms / replayable 150ms（可按 RTT 自适应至 200ms）             | 05                    |
| 每订阅者通道缓冲                          | filter+coalesce 后同时 ≤500 op、≤1 MiB；任一超限 → 清空 + snapshot resync | 05                    |
| 事件保留窗（内存日志）                    | 每 session 2000 条（08 开放问题口径）                                     | 05/§9.2B              |
| snapshot 尾部窗口                         | 60 rows                                                                   | 02「一屏」参数化      |
| `rows/range` limit                        | ≤ 200                                                                     | §7.1                  |
| tool output 流式上限                      | continuous 256 KiB；replayable 0（不流）                                  | 05                    |
| **tool output 终态截断（全档统一）**      | head 32 KiB + tail 32 KiB，超出进 `truncated.ref`                         | R-10                  |
| GoalState.verifications 保留              | 最近 20 条                                                                | §4.2.8                |
| pendingCommands 显示上限                  | 32 条（超出裁旧）                                                         | §4.2.7                |
| rpc 心跳/判死/宽限                        | 5s / 20s / 45s·4MiB                                                       | 05（R-02 补课后生效） |
| 重连退避                                  | 0,1,2,5,10…封顶 30s，单一入口                                             | 05                    |
| command 客户端 pending TTL                | 24h                                                                       | C-02                  |
| 服务端内存幂等表                          | 每 session 512 条 LRU + transcript/marker/child/discarded 兜底            | §6.2/§7.3             |
| query 超时                                | conversation 域 10s；workspace 部署类操作由该域自定义（G-14）             | §7                    |
| attachment 单个上限 / 未引用 TTL          | 20 MiB / 24h                                                              | §6.5                  |

---

## 9. reasonCode 规范

- 命名空间：`guard.*`（含 `guard.forkTargetAmbiguous`、`guard.forkTargetNotStable`、`guard.compactOperationLock`）、`fault.*`（含 `fault.command.inputDiscardedOnRestart`）、`proto.*`（协议层：`proto.staleRevision`、`proto.unknownTargetRow`、`proto.alreadyResolved`、`proto.alreadyStopping`、`proto.sessionNotFound`、`proto.payloadTooLarge`、`proto.invalidPayload`、`proto.missingBaseRevision`）。
- 客户端按 reasonCode 查本地化文案表；`message` 字段仅兜底与日志。
- 证据契约（product-protocol §Evidence）：e2e 断言 reasonCode，不断言文案。

---

## 10. 与 09/评审结论的差异与待决清单

### 已按评审结论落实（review 时对照勾选）

| #   | 决定                                                                                                                            | 来源           |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 1   | `TopicFrame.subscriptionId` + apply 三分支 + 重订阅 single-flight + 服务端替换式重订阅                                          | R-01           |
| 2   | `base = { logEpoch, seq }`，revision 不参与恢复（04 的 {R,W} 由此裁决）                                                         | C-05/R-04      |
| 3   | rows 分页全面游标化，`firstIndex/totalCount` 索引语义删除（保留 totalCount 仅供滚动条估计）                                     | R-06           |
| 4   | `sourceCommandId` 铺满：QueueItem/drain/user row/message anchor/timeline marker/fork child metadata                             | R-07/核心闭环  |
| 5   | ACK 增 `noop`；跨端晚到者语义改用 noop+reasonCode，`duplicate` 严格限同 commandId                                               | R-09           |
| 6   | 终态截断全档统一（head+tail 32K），流式上限才按 profile                                                                         | R-10           |
| 7   | wire v3 physical 帧含 envelope ≤1 MiB；snapshot/resume fragment assembly ≤16 MiB、校验后原子 apply                              | R-12/核心闭环  |
| 8   | revision 递进规则封闭枚举；revision/rowId/seq 确定性写入 §1                                                                     | R-04           |
| 9   | A 区新增 config/usage/backgroundWorks/plan/goal(verifications)/apiRetry                                                         | G-01~04        |
| 10  | RowBase.createdAt + frame.sentAt + clockOffset 规则 + turnHeader(activeMs/fileChanges)                                          | G-05           |
| 11  | userInput.origin 增 mailbox/goalContinuation + originMeta 结构化                                                                | G-06           |
| 12  | 命令补齐：retryTurn/resumeGoal/setAutoDrain/cancelBackgroundWork/renameSession/deleteSession/attachment 上行                    | G-07           |
| 13  | queue 仅进程内可靠；restart 写 discarded tombstone，commands/query 返回显式 failed，禁止自动重放                                | §9.3/核心闭环  |
| 14  | 自包含 ConversationInputIntent 贯穿 queue/runtime/transcript，含 steer/dispatch 状态                                            | D-03/核心闭环  |
| 15  | stopTargetKind 增 turnSteer；activeWorks 轻量保留                                                                               | D-02           |
| 16  | D-05 全部未定义类型补齐（QueueItem/GoalState/SessionErrorInfo/Availability/AttachmentRef/marker payloads/Permission/UserInput） | D-05           |
| 17  | host 为每 attachment 注入可信 clientMode/profile；owned subscription routing，port close unsubscribe all                        | 核心闭环门禁 1 |
| 18  | commands/query 以 `{sessionId,commandId}` 查询 LRU→transcript/marker/child→discarded，query/execute single-flight               | 核心闭环门禁 2 |
| 19  | `resolveStableForkTarget` + running conversation-only fork；父继续、workspace 不 rewind                                         | 核心闭环门禁 3 |

### ⚠ 我替你做的决定（2026-07-05 已全部裁决，见各行标注）

> P1、P4–P11 于 2026-07-05 由用户整批确认接受；P2/P3 单独裁决见下。用户同时确认了 running fork 语义（`forkAssistant` 在 running 时对稳定 assistant row 可用，`runningStableAssistantForkAllowed`）是期望的产品方向——这是相对现状的行为放开，记入 C-07 语义变更表。

| #   | 决定                                                                                                                                                                    | 理由 / 备选                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| P1  | **新增 `turnHeader` 行类型**承载折叠头/权威工时/每轮文件摘要（**已确认**）                                                                                              | 09 只有「turnId 相邻性」表达不了工时与折叠组归属（G-05/P1-12b）。备选：A 区 turnsMeta map——被否，无界增长且违反「只有 rows 用 patch」 |
| P2  | ~~删除 phase="draft"~~ **已裁决：保留 draft**，createSession 的 firstInput 改为可选；draft 生命周期见 §4.2.1（纯内存、不落盘、CLI 重启即消失）                          | 产品需要「先建空会话再输入」                                                                                                          |
| P3  | ~~rewind 命令占位待决~~ **已裁决：删除独立命令**，rewind = editUserQuery 的 UI 入口，行为力复用 canEdit                                                                 | 一件事一条路                                                                                                                          |
| P4  | **`hasBackgroundWork` 从 control 删除**（sessions-index 的 SessionSummary 保留布尔）                                                                                    | backgroundWorks[] 已在 A 区，派生一行代码；保留则是可分叉的冗余真相                                                                   |
| P5  | **`forkOf` 从 createSession 删除**，fork 只走 forkAssistant                                                                                                             | 一件事一条路；09§10 两处入口冗余                                                                                                      |
| P6  | **rowId/`revision` 用 number，Timestamp 用 Unix ms**；rowId 不做字符串前缀                                                                                              | 排序/比较零成本。若要预留复合 id 空间可改 string，需同步改游标比较规则                                                                |
| P7  | **usage 放 conversation A 区**而非独立 topic                                                                                                                            | 它是 per-session、低频（conflation 后）、UI 与会话同生命周期。备选：usage 域独立 topic——跨 session 汇总页再考虑                       |
| P8  | **command 信封删除 clientMode**；可信 clientMode 由 host attachment 注入，ClientHello 只上报 telemetry `clientKind`                                                     | 客户端声明不可作为 desktop/mobile 投递边界；每条命令重复携带也无意义                                                                  |
| P9  | **深链行为**：subagent 下钻 = 订阅 child session 的 conversation topic，不在父投影内嵌 child rows；父会话 UI 可把已配对 `subagent` 下钻挂回触发它的 Agent/Task 工具块内 | row 自包含原则；child 是普通 session                                                                                                  |
| P10 | **deleteSession 的多端联动**只定义「订阅终止信号 + 客户端本地态 GC」，不定义回收站/恢复                                                                                 | G-07 最小闭环；软删除属产品决策                                                                                                       |
| P11 | pendingCommands 上限 32、幂等表 512 LRU、附件 20MiB 等具体数值                                                                                                          | 全部标在 §8，按实测调                                                                                                                 |

### 依赖的外部未决项（2026-07-05 部分已裁决）

- ~~§9.2 事件日志 A/B~~ **已裁决：方案 B**（内存有界日志 + logEpoch，零新表；CLI 重启后客户端走一次 snapshot）。
- ~~fork/createSession 崩溃窗口防重~~ **已裁决：child session 记 `source_command_id`**（一列或 metadata，彻底防重）。
- ~~多端动作权限（C-01）~~ **已裁决：全权对等**——任何已连接客户端都能 stop / 答权限弹窗，冲突靠幂等收口。鉴权面（G-13）仍待成文。
- ~~fault catalog（G-12）~~ **词表已定**：`fault.*` reasonCode 与 `SessionErrorInfo.code` 枚举见 [12-fault-catalog.md](./12-fault-catalog.md)（code 词表冻结；各 fault 的产品行为仍按 decision worksheet 逐批裁决，裁决只改 reducer 分支不改 code）。
- ~~PB-\*~~ **已裁决（2026-07-05，M0 决策清收）**：F09 手动 compact 失败保持 completed + failed marker（retry 入口）；G11 三连败继续无压缩执行 + circuit breaker；G12 被 stop 与普通 stop 对齐、marker 置 `cancelled`；N06 允许 compact 中切模型、pendingAction 消费瞬间读 config 快照。**结论验证：本文 compact marker 的 `status` 枚举（running/success/failed/noop/cancelled）与 `attempt`/`retryNotice` 表达力足够，无需扩枚举**。逐项记录见 `docs/conversation-product-protocol.md`「Pending Product Boundaries」。
