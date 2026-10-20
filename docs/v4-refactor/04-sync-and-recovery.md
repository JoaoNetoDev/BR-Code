# Assinatura e recuperação: o resync de nível de conexão é o único caminho de recuperação

> Fato atual (V4 wire v3): refresh, gap, overflow de assinante lento, reconexão de relay, reconstrução de attachment e restart do CLI runtime convergem para a recuperação com escopo de conexão. Gap/fault de uma subscription ativa seguem o resync da mesma sub; apenas reconstruções de geração de attachment/runtime resultam em fresh-subscribe. A recuperação não altera as fronteiras desktop `continuous` / mobile `replayable`.

## 1. Ciclo de vida da assinatura

O cliente não escolhe profile. O host injeta `connectionId/clientMode/profile` a partir de um contexto de attachment confiável, e entrega os frames de volta apenas à porta que possui a subscription.

```text
client                  connection facade               CLI publisher
  │ hello(v2, connectionId, trusted clientMode)              │
  │ clientHello(clientId, version, telemetry kind)            │
  │ subscribe(topic, base?) ─►│                                │
  │                            │ inject connection/profile ───►│
  │◄─ SubscribeAck{subId,mode,logEpoch} ───────────────────────│
  │   （ACK response 写出后）                                  │
  │◄════════ initial/online TopicWireFrame(subId) only ═══════│
  │                                                            │
  │ gap / fragment loss ── v4/conversation/resync{subId,base} ►│
  │                         （同连接 single-flight）             │
  │◄──────────── resume；若再次 gap 则 forceSnapshot ──────────│
  │                                                            │
  │ attachment close          │ unsubscribeAll(connectionId) ─►│
```

Decisão do servidor:

- `base.logEpoch` igual ao epoch atual do CLI, e `base.seq` ainda dentro da janela de retenção: `mode="resume"`, transmitindo a continuação de `(base.seq, now]`.
- sem base, epoch diferente, base fora da janela de retenção ou cliente pedindo `forceSnapshot`: `mode="snapshot"`.
- resubscribe no mesmo `(connectionId, topic)` substitui apenas a subscription antiga daquela conexão; a subscription do mesmo topic em outra conexão não é afetada.
- o `v4/conversation/resync` de uma subscription ativa precisa acertar exatamente o `subscriptionId` do connection registry atual, mantendo o mesmo subId/profile/topic; o cliente não pode escolher topic, connection ou delivery profile por meio do resync. Um base legítimo é decidido novamente a partir da marca d'água do cliente daquele assinante, sem usar o `sentSeq` do publisher como substituto.

A response de subscribe só pode carregar um ACK pequeno, sem embutir snapshot lógico nem retornar `frames[]` (o array inteiro ainda pode passar de 1 MiB). Depois que o ACK é escrito, o initial snapshot/resume é enviado como uma wire notification comum da porta que possui a subscription; o cliente mantém o store antigo ou o estado de loading até completar o assembly.

`SubscribeAck.logEpoch` só prova a admissão desta subscription e a decisão do servidor; ele **não cria do nada um base de resume**. Se o cliente realmente detinha uma projection consistente antes da requisição e o ACK=`resume` confirma o mesmo epoch, ele pode continuar usando esse base antigo já provado; um ACK=`snapshot` invalida imediatamente o base antigo, até que um owned snapshot completo seja aplicado atomicamente. Conversations, sessions-index e workspace-config sem base existente só podem estabelecer `{logEpoch,seq}` depois que o logical snapshot completar o assembly, a validação de schema/checksum e o apply. Se o initial fault/overflow acontecer antes disso, o cliente precisa se recuperar com `base:null + forceSnapshot:true` (ou um fresh snapshot subscribe); é proibido fabricar `{epoch,0}` a partir do epoch do ACK. Em particular, o cold seed do sessions-index não entra no delta log, e um seq=0 forjado pode resultar em um resume vazio porém legítimo, perdendo para sempre o baseline de sessões frias. Sem base válido, nenhum delta é aplicado; um owned snapshot completo (incluindo o online overflow snapshot) ainda pode estabelecer base.

### 1.1 physical batch pós-ACK e reservation do publisher (04B)

O result schema comum das três assinaturas (conversation, sessions-index, workspace-config) é sempre strict `{ ack }`. O CLI publisher primeiro estabelece uma reservation que não quebra a marca d'água; o gateway codifica esse frame lógico como um physical notification batch completo e o server salva `{messages, commit}` como uma outbox pós-response de uma só vez, por request id. A NDJSON connection executa mecanicamente, por requisição:

```text
publisher reserve R(frame, stable logicalFrameId, deliveryKind)
                         │
gateway encode R -> { ack, physical notifications[0..k], commit }
                         │
                         ├─ response.result = { ack }
                         └─ requestId outbox = { messages[0..k], commit }

connection: take(requestId)
  -> write(response line)
  -> write every physical notification in order
  -> commit R only after every line entered this connection-owned write queue
```

Falha de codificação, erro no enqueue síncrono ou fechamento da connection no meio da admissão do batch não podem gerar commit; o próximo reserve precisa devolver o mesmo `logicalFrameId` e o mesmo conteúdo lógico. O retorno normal de `Writable.write()` do Node (inclusive o sinal de backpressure `false`) significa que a line já foi assumida pela connection atual e o commit pode ocorrer; se mais tarde vier um EPIPE/close assíncrono, a epoch inteira daquela connection termina, subscriptions/outboxes antigas não migram para o novo pipe e o cliente precisa se resubscrever no novo attachment. Eventos novos enquanto há reservation em voo vão para o buffer seguinte e não podem ser consumidos pelo commit atual; unsubscribe/resubscribe invalidam a reservation antiga, e um commit tardio devolve false; mas, se um novo initial encode falhar antes da admissão do ACK, o replacement precisa fazer rollback para o subscription/mapping/flush state antigo, para que o cliente antigo não fique sem fluxo. Sem initial frame, a outbox é vazia e apenas a response é escrita. O online frame usa a mesma pipeline reserve → encode → emit-all → commit.

Cada reservation precisa ter `deliveryKind` atribuído autoritativamente pelo publisher, e o encoder o escreve tal e qual em cada physical notification: a admissão de subscribe gera `initial`, o flush normal (incluindo o snapshot de buffer-overflow autônomo do publisher) gera `online`, e o `v4/conversation/resync` explícito gera `recovery`. Todos os fragments do mesmo frame lógico precisam carregar o mesmo valor, e o assembler falha fechado diante de inconsistência. A UI é proibida de adivinhar o tipo a partir de "acabei de chamar subscribe/resync", de continuações de Promise ou da posição do frame no array; um duplicate online tardio também não pode consumir a marca de recovery.

O host facade, o transport da UI e o task-index syncer armazenam temporariamente a wire física antes de o ACK valer: no máximo 1.024 frames e 32 MiB de transport bytes. A determinação de ownership precisa acontecer antes do assembly; um `subscriptionId` estrangeiro não pode consumir memória de assembly. O overflow do armazenamento temporário precisa limpar o lote inteiro e falhar explicitamente / marcar `fault.subscription.initialFrameStagingOverflow`, é proibido descartar apenas o fragmento mais antigo com shift. Geração obsoleta, unsubscribe e close limpam juntos o staging, o assembly e as referências de timeout.

### 1.2 resync da mesma sub e invalidação de reservation

Os parâmetros/resultado públicos de `v4/conversation/resync` são fixos em:

```ts
interface ConversationResyncParams {
  subscriptionId: string;
  base: { logEpoch: string; seq: number } | null;
  forceSnapshot?: boolean;
}
interface ConversationResyncResult {
  ack: SubscribeAck; // subscriptionId 保持不变
}
```

server e subscribe usam a mesma outbox pós-response: primeiro escreve a response strict `{ack}`, depois escreve em ordem o physical recovery batch completo, e só faz commit depois que tudo entrou na fila pertencente à connection. A admissão de resync imediatamente supersede a reservation antiga daquela sub; o commit tardio da reservation antiga precisa devolver `false`. Eventos autoritativos que entrarem depois da reservation antiga continuam cobertos pelo novo recovery snapshot/replay e não podem se perder por causa do supersede.

Quando `base` casa com o epoch, está dentro da janela de retenção e `forceSnapshot` não foi pedido, a resposta é `mode="resume"`, regerando o replay de `(base.seq,currentSeq]`; nos demais casos é `mode="snapshot"`. Outro topic da mesma conexão e outra conexão do mesmo topic não são afetados.

## 2. Apply normativo no cliente

O cliente primeiro reconstitui os physical fragments da wire v3 em um único logical topic frame, preservando o `deliveryKind` autoritativo do envelope; só aplica atomicamente quando envelope, tipo, comprimento, total de fragments e checksum passam todos. Fragment faltando, conflito de duplicatas, checksum incompatível ou assembly acima do limite não podem modificar parcialmente o store.

Antes do assembly é executada a comporta monotônica de `logicalFrameOrdinal` por subscription: wires com ordinal menor que o de um ordinal já concluído/fault/timed-out são descartados silenciosamente; no mesmo ordinal só são permitidos fragments duplicados com o mesmo `logicalFrameId`, e trocar de id precisa produzir `proto.frameAssemblyOrdinalConflict`; um ordinal maior pode superseder o fragmento residual atual, mas quando o consumer aborta por fault do mesmo lote é preciso manter o tombstone do ordinal até a limpeza por unsubscribe.

```ts
function onLogicalFrame(store, frame, deliveryKind) {
  if (frame.subscriptionId !== store.subscriptionId) return; // 旧代际

  if (frame.payload.kind === "snapshot") {
    store.replaceAll(frame.payload.snapshot);                // 整体替换
    store.logEpoch = frame.payload.snapshot.logEpoch;
    store.seq = frame.toSeq;
    store.hasAppliedBase = true;
    // online overflow snapshot 是权威全量，可建立 base，但不能冒充 recovery 收口 flight。
    if (deliveryKind === "recovery") markRecoveryFrameSeen(store);
    return;
  }

  if (frame.toSeq <= store.seq) {
    // aligned `(N,N]` 或已被更新 snapshot 覆盖的 recovery 仍是有效 logical frame。
    if (deliveryKind === "recovery") markRecoveryFrameSeen(store);
    return;                                                   // 迟到/重复，不改 projection
  }

  if (deliveryKind === "online" && store.recoveryFlight) {
    // recovery 已 apply 后的 residual online 交给 ACK 后 successor；此前的 online
    // 已被本次 recovery 的权威区间覆盖。两者都不能消费当前 recovery flight。
    if (store.recoveryFlight.validFrameSeen) markSuccessorRecoveryNeeded(store);
    return;
  }

  if (frame.fromSeq !== store.seq) {
    requestResyncOnce(store, {
      base: { logEpoch: store.logEpoch, seq: store.seq },
      forceSnapshot: store.lastSubscribeMode === "resume",
    });
    return;
  }

  applyDeltasAtomically(store, frame.payload.deltas);
  store.seq = frame.toSeq;
  store.hasAppliedBase = true;
  if (deliveryKind === "recovery") markRecoveryFrameSeen(store);
}
```

Regras de fechamento:

1. Um snapshot sempre substitui tudo por completo, nunca faz merge.
2. `toSeq <= localSeq` nunca modifica novamente a projection nem gera resubscribe adicional; se for um recovery logical frame completo e válido, ainda precisa marcar que aquele flight recebeu a entrega.
3. O primeiro gap cria apenas um resync em voo; antes de o logical frame com `deliveryKind="recovery"` ser completamente validado e aceito, gaps/faults seguintes reutilizam o mesmo flight, em vez de limpá-lo cedo quando o ACK do RPC chega.
4. Somente um frame `resume` com `deliveryKind="recovery"` que quebrar novamente promove o mesmo flight e reenvia uma vez `forceSnapshot=true`; o estado precisa sobreviver à ativação síncrona do ACK, proibindo um loop infinito de resume.
5. Durante a fragmentação de um logical frame snapshot/resume, o store antigo continua legível; a substituição/o apply acontece de uma só vez após o assembly completar e ser validado.
6. `base` e a projection nascem e morrem juntos: um refresh que perde a projection em memória não pode manter apenas o seq; o subscribe ACK também não pode estabelecer base sozinho. Só o epoch/seq após o apply atômico de um logical frame initial/recovery/online permitem a continuação.
7. Um fault de assembly no initial do subscribe original precisa limpar `awaitingInitial` ao entrar em same-sub recovery; o gap de recovery seguinte sobe pela regra de recovery, sem assumir um fresh subscribe por engano.
8. O ACK do resync não é conclusão de recuperação. Se, em 30s após o ACK, nem um recovery logical frame completo tiver chegado (zero wire/perda do lote inteiro também conta), a tentativa de resume normal é promovida uma vez a force snapshot; na UI, uma nova tentativa de force que também estoura vira um ERROR explícito, e no task-index apenas o topic com faulty faz fresh-subscribe, sem afetar os siblings.
9. Depois que o recovery logical frame foi completamente validado e aceito (mark seen), mas antes da continuação do ACK, se surgir no mesmo lote um online frame/gap não duplicado, ele não pode ser engolido pelo flight antigo; logo após o ACK fechar o flight antigo, um resync successor normal é iniciado a partir do novo base aplicado.
10. `markRecoveryFrameSeen` apenas marca que o recovery logical frame autoritativo chegou por completo; o flight só é fechado quando essa condição e a do ACK forem satisfeitas. Um recovery alinhado `(N,N]` ou coberto por um snapshot mais recente também não modifica a projection, mas precisa ser marcado, para que uma recuperação de mudança zero não fique pendurada para sempre.
11. **Fault determinístico de conteúdo não segue a escada transitória.** O fault padrão das regras 3/4/8 é transitório (fragment perdido, timeout, checksum incompatível — uma reentrega pode resolver). `proto.frameAssemblyInvalidPayload` não é: os bytes já passaram pelas quatro barreiras de length/checksum/UTF-8/JSON, e a rejeição significa que o cliente não consegue ler o **conteúdo** enviado pelo outro lado, enquanto o nível `resume` apenas reentregaria o mesmo lote de deltas. Portanto esse fault envia direto uma vez `forceSnapshot=true` (o único meio capaz de produzir bytes diferentes — o snapshot é regenerado e pode já não conter aquele conteúdo), **pulando o nível resume**; se o snapshot forçado ainda for rejeitado por conteúdo, o processo para, o estado terminal grava `fault.subscription.contentRejected` em vez de `recoveryFailed`, e o sessions-index não entra em backoff de resubscribe (para uma falha determinística isso seria um ciclo que nunca converge: limpar projection → resubscribe → ser rejeitado de novo). O caminho de autocura continua existindo: troca de runtime, fresh connect e reconexão do usuário voltam a se subscrever. A função de decisão e os dois codes estão em `packages/shared/src/zcode-protocol-v4/wire-fault.ts`; todos os demais reason codes continuam sendo tratados como transitórios — classificar um transitório como determinístico deixaria um gap autocurável parado no lugar, o que é pior que uma retry inútil a mais.

    Custo medido (2026-09-21, sess_4142de31): um payload de card de ferramenta com duas chaves a mais fez a escada queimar três frames no mesmo conteúdo antes de falhar fechado; o usuário clicou manualmente em "reconectar" duas vezes, queimando mais três frames por vez, e a sessão nunca mais abriu. O fallback para o próprio payload decorativo está em 10-protocol-spec §4.4.5 (display não tem portão na camada de envelope); esta regra é o reserva para skew em campos obrigatórios.

## 3. Matriz de gatilhos de recuperação automática

| Gatilho | Ação do cliente/host | Resultado autoritativo da recuperação |
| --- | --- | --- |
| Recarregar a página, novo pane, novo dispositivo | Sem base legítimo, faz subscribe | snapshot |
| Queda breve, projection em memória ainda presente | subscribe com `{logEpoch,seq}` | resume ou snapshot |
| delta gap | `v4/conversation/resync` single-flight | resume; novo gap força snapshot |
| `sendText` já `accepted|duplicate` e, após uma breve tolerância, o queue item / real-user row do mesmo `sourceCommandId` continua invisível | `v4/conversation/resync` single-flight na owned subscription atual | resume ou snapshot; só recupera a projection, não reexecuta o command |
| Fragment faltando / checksum falho | Descarta o assembly inteiro + resync | Não gera estado meio aplicado |
| Buffer do assinante acima do limite | Publisher limpa o buffer daquela sub e marca resync | A próxima envia apenas o snapshot mais recente |
| Reconstrução de relay/attachment | Resubscribe automático de todos os topics ativos após o handshake v2 | Novo subId; frames antigos descartados |
| Restart do CLI runtime | Novo `logEpoch`; o cliente se resubscreve automaticamente | snapshot; o base antigo não continua |
| Port close | host `unsubscribeAll(connectionId)` | Libera buffer/assembly, sem afetar outras conexões |

O relay/main do celular apenas repassa o payload e o ciclo de vida da conexão; `onSaturated/onDrained` do raw adapter são escritos pelo desktop main no MessagePort sideband `connection-flow-v1` do attachment que os possui, e então entregues pelo host ao CLI com o connectionId confiável. main/relay não podem cachear snapshot, completar gap, manter seq nem escolher por conta própria o pause target.
O MessagePort do desktop usa a mesma distinção estrita entre control/binário; apenas que a cadeia local continuous normalmente não aciona congestão de nível de rede.

conversation, sessions-index e workspace-config mantêm cada um seu próprio
`{subscriptionId,appliedBase,recoveryFlight,recoveryFrameDeadline}`. Um gap/fault de assembly de um topic só pode se recuperar a si mesmo e não pode limpar um sibling saudável; o pre-ACK overflow do task-index precisa sair do estado paused e fazer fresh-subscribe, não pode congelar para sempre. O restart do CLI runtime invalida apenas o runtime e as subscriptions antigas, sem destruir os persistent frame emitters de nível de workspace; os listeners existentes, ao receberem o sinal de restart, fazem exatamente um full re-subscribe nos stores ativos. Apenas um teardown real de workspace/service descarta emitter e listener.

## 4. Três estados voláteis, que não são fila offline

```text
1. subscriber flush buffer（每 subscription，毫秒级）
   filter + coalesce 后 ≤500 ops 且 ≤max(1 MiB, snapshot 上界)；连接关闭即丢

2. fragment assembly（每 logical frame）
   ≤16 MiB；完整校验后原子 apply；失败即丢并 resync

3. session event log / projection（CLI 权威）
   event log 有界；projection 始终能生成最新 snapshot
```

O servidor não acumula filas de eventos persistentes por cliente para clientes offline. Um cliente que volta após uma queda longa ou reproduz o event log autoritativo ainda dentro da janela, ou recebe direto um snapshot. O overflow do flush buffer de uma assinatura de celular lenta só pode fazer aquele assinante se recuperar, sem bloquear o desktop ou outros panes da mesma janela.

O "sem fila de eventos offline" aqui não significa "sem fila de entrada": todas as entradas busy/running já submetidas entram na FIFO única `CommandInbox` do CLI/runtime; essa fila de entrada é o fato de negócio da conversation, ver [10-protocol-spec.md](./10-protocol-spec.md) §4.2.5/§6.

## 5. Command e recuperação de entrada

A UI mantém, por 24h, um registro de pending commands para o texto/goal comum já enviado, incluindo o payload reenviável; interactions sensíveis guardam apenas o digest. O registro é apagado quando o QueueItem/projection guiada aparece; ele cobre apenas a janela de entrega autoritativa desconhecida e não é uma segunda queue.

```text
send(commandId, payload)
        │
        ├─ ACK / queue / row 到达 ──> 用 sourceCommandId 对账
        │
        └─ 重连或 ACK 丢失 ────────> commands/query[{sessionId,commandId}]
                                      │
                                      ├─ duplicate/noop/failed -> 收口
                                      ├─ discarded queue/guide -> 静默清账
                                      ├─ discarded startNow    -> 用户确认后才能用新 command 重发
                                      └─ unknown               -> 静默清账，不呈现 UI 错误
```

A queue do CLI só garante confiabilidade dentro do processo atual. No restart do CLI, a input já admitida mas que ainda não entrou no transcript não volta automaticamente a ser uma queue executável; em vez disso, é gravado um tombstone no discarded input ledger; `commands/query` devolve `failed` + `fault.command.inputDiscardedOnRestart` + `delivery` persistente. O ledger serve apenas para provar que "esta entrada foi descartada explicitamente" e não pode carregar semântica de execução automática. A UI faz fechamento silencioso de contas para `queue/guide` e para o `unknown` sem conclusão autoritativa, sem apresentar erro; apenas o `startNow` que não entrou no transcript preserva o texto original e as referências de anexos, aguardando a confirmação do usuário para reenvio com um **novo commandId**.

A estratificação idempotente em memória do servidor é `in-flight pinned / live queue-or-guide pinned / settled LRU`; o limite de 512/session só incide sobre settled. query e execute usam o mesmo key gate, e o fallback de persistência cria um índice lazy por session, atualizado incrementalmente pelos novos fatos de anchor/marker/child/discarded. Qualquer falha de leitura persistente precisa devolver `fault.command.queryUnavailable` e não pode se passar por `unknown`; o próprio `unknown` não é cacheado.

Invariante final: toda entrada submetida precisa estar, e apenas estar, em um destes estados: `queue / guided row / transcript / explicit rejected|failed|discarded`. ACK perdido, gap, reconexão ou restart não podem produzir "a UI limpou, mas a camada autoritativa não tem registro".

Invariante espelho (lado do renderer): assim que uma input é assumida pela camada autoritativa (ACK accepted/duplicate, ou a reconciliação pelo `sourceCommandId` de queue/row/marker), o corpo do composer pertencente a essa submissão precisa ser limpo, e essa obrigação não desaparece com a instância do componente composer. Falha na camada de transporte (como o dispose remoto do ChannelClient) significa apenas "ACK desconhecido", e não "não admissionada": o corpo pode ser restaurado para o rascunho, mas o `{commandId, text}` precisa ser registrado em `composerSubmissionSettlement` (nível de módulo, apenas em memória), que mantém a assinatura de registry resolution; quando o pane é desmontado e recriado por desconexão, o novo composer reivindica a liquidação ao repreencher o rascunho. Quando o usuário já tiver seguido editando o corpo reposto, o corpo não é limpo; nos estados terminais failed/unknown/discarded o registro é removido e o corpo é preservado.
