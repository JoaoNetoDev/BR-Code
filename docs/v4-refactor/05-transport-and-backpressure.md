# Transporte e contrapressão: isolamento de subscriber, frame físico de 1 MiB e resync atômico

> Fato atual (V4 wire v3): profile filter, coalesce, buffer de subscriber limitado, fragmentação física e recuperação formam o mesmo pipeline de envio. Qualquer limite é calculado sobre os bytes reais de wire após serialização UTF-8, nunca por estimativa de contagem de caracteres JavaScript.

## 1. Fronteiras de camadas

```text
CLI 权威 event log / projection
          │
          v
per subscription publisher
  profile filter -> coalesce -> 计算 op/UTF-8 bytes
          │
          ├─ ≤500 ops 且 ≤max(1 MiB, snapshot 上界) ──> logical TopicFrame
          └─ 超限 ──────────────────────────────> 清空 buffer + needsResync
                                                    下一次只生成最新 snapshot
          │
          v
wire v3 encoder
  logical ≤ physical budget ──> complete envelope
  oversized snapshot/resume ──> fragment envelopes（每个 ≤1 MiB）
          │
          v
connection transport
  onSaturated / onDrained、ACK、心跳、短断重放
          │
          v
owning attachment port only
```

O sinal de disparo fica no nível de connection/transport, e a decisão de degradação de conversation fica no nível de subscription publisher:

- o transport apenas reporta `onSaturated/onDrained` e não interpreta topic, seq ou snapshot;
- o publisher sabe quais deltas podem ser combinados e quando um snapshot é obrigatório;
- relay/main apenas repassa sinais de flow control e payload, sem manter buffer de conversation nem estado de recuperação;
- o buffer, o resync ou a montagem de uma subscription nunca podem bloquear outra subscription.

O publisher não avança a marca d'água ao "gerar o frame lógico". Ele precisa manter uma reserva estável e só fazer commit depois que todos os envelopes físicos forem aceitos pelo transport:

```text
committed sentSeq=N
  -> reserve R(frame=(N,M], logicalFrameId=L)
  -> encode R -> wire[0..k]
  -> emit every wire
       sync enqueue failure: keep R, sentSeq remains N
       all admitted to this connection queue: commit R, sentSeq becomes M
```

A mesma reserva, ao ser tentada novamente antes do commit, precisa manter `logicalFrameId` e o JSON lógico inalterados. Eventos novos entram no buffer pós-reserva; a reserva antiga não pode referenciar buffer mutável. Cancelar assinatura ou assiná-la de novo invalida commits tardios por meio de um generation token. `Writable.write() === false` indica apenas contrapressão, não recusa; um EPIPE assíncrono que só apareça depois do enqueue encerra diretamente o epoch da connection, e a subscription antiga não continua enviando no novo attachment — a nova conexão se recupera por subscribe/resync.

### 1.1 Codificação por subscription e limite superior de crescimento de workflowRuns

O log retido armazena op nativas. Cada subscription registra se declarou `workflowRunDeltas` no seu handshake ([10-protocol-spec.md](./10-protocol-spec.md) §2), e a codificação é decidida por subscription no momento do fan-out, ortogonal ao profile:

- quem declara recebe diretamente `workflowRun.updated / workflowRun.removed` (mesmo documento §4.5).
- quem não declara é achatado em cada lote: todos os op `workflowRun.*` do lote são descartados, e na posição do último deles é inserido um único `state.updated{workflowRuns}` de chave completa, com valor vindo da projeção autoritativa atual e limitado pelos limites antigos — cada run mantém apenas os primeiros 256 nodes e os primeiros 256 actors, e qualquer corte define `truncated: true`. "Os primeiros N" é justamente o produto da semântica antiga de rejeição de novos termos do reducer, de modo que o `.max(256)` dos leitores antigos passa exatamente. O frame de snapshot enviado a quem não declara aplica o mesmo limite.
- Na reprodução a partir do log retido, o estado "atual" consultado é mais novo que os op históricos: isso é aceitável — o estado terminal é consistente e apenas os estados intermediários são pulados, exatamente como o coalesce sempre fez.

A diferença entre as duas pontas está na codificação, não no profile: sob a mesma codificação, continuous e replayable continuam consistentes campo a campo no estado terminal (§2).

Quando o publisher ingere um evento de progresso de workflow, não precisa fazer `JSON.stringify` de todo o snapshot autoritativo para decidir o limite de 16 MiB: enquanto `limite superior de bytes do snapshot + bytes UTF-8 do op atual + constante <= limite`, ele deixa passar pelo limite superior e acumula no local (um upsert/patch aumenta o snapshot no máximo em tantos bytes quanto o próprio op, então o limite se sustenta); caso contrário, cai no caminho lento de medição precisa, que recalibra o limite superior. É o mesmo critério do caminho rápido de append em streaming já existente, não um segundo sistema de contabilidade.

## 2. Delivery profile injetado pela conexão confiável

A UI e os parâmetros de subscribe não contêm profile. A facade de escopo de connection escolhe um único profile conforme o `clientMode` confiável injetado pelo host:

```ts
const DELIVERY_PROFILES = {
  continuous: {
    // desktop，包括 SSH/WSL/Docker 窗口
    flushWindowMs: 30,
    streamPaths: { text: true, inputText: true, "output.text": true, summaryText: true },
    streamOutputCapBytes: 262_144,
    toolProgress: false,
  },
  replayable: {
    // mobile remote / WebSocket
    flushWindowMs: 150,
    streamPaths: { text: true, inputText: false, "output.text": false, summaryText: false },
    streamOutputCapBytes: 0,
    toolProgress: true,
  },
} satisfies Record<string, DeliveryProfile>;
```

O profile afeta apenas os frames intermediários, não o schema, command/ACK, guard, algoritmo de recuperação ou estado terminal. Dada a mesma sequência autoritativa de eventos, continuous/replayable podem ter frames intermediários diferentes, mas o estado final do cliente precisa ser consistente campo a campo. Eventos de streaming filtrados pelo profile precisam ser fechados pelo estado de conclusão não filtrável `row.upserted` ou por um snapshot.

## 3. Limites rígidos do buffer de subscriber

Cada subscription mantém um buffer volátil independente; o momento da contagem é fixo como **depois do profile filter, depois do coalesce**:

```ts
const MAX_BUFFER_OPS = 500;
const MAX_BUFFER_BYTES = 1_048_576; // 1 MiB
```

A condição necessária e suficiente para um drain normal é que os dois limites sejam satisfeitos ao mesmo tempo:

```text
coalescedOps <= 500
AND serializedLogicalPayloadUtf8Bytes <= min(max(1 MiB, wireSnapshotBytesUpperBound), 16 MiB - 64 KiB)
```

Os casos `500/501 op` e `byte anterior/ exato /byte seguinte` do limite de bytes são decididos mecanicamente pela fórmula acima. Caracteres UTF-8 multibyte precisam usar o byte length após codificação; é proibido usar `string.length`.

O limite de bytes é `min(max(1 MiB, wireSnapshotBytesUpperBound), 16 MiB - 64 KiB)` (revisão de 2026-09-30):

- `wireSnapshotBytesUpperBound` é o limite superior conservador atual, mantido pelo publisher para o portão de montagem de 16 MiB, do logical frame de wire snapshot (as últimas 60 linhas). Por fora ele é ainda limitado a `16 MiB - 64 KiB` (isto é, a reserva `PROJECTION_TERMINAL_RESERVE_BYTES`), garantindo que o logical frame de deltas emitido pelo buffer mais o envelope do frame ainda fique `<= 16 MiB`, o teto de montagem; acima do frame físico, segue-se normalmente para fragment.
- Razão da revisão: todo o sentido do overflow é "trocar um backlog de deltas por um snapshot menor". Quando um único delta grande (por exemplo, o upsert de um tool row com 3 MiB de saída de bash) já ultrapassa 1 MiB, o snapshot que o substituiria seria ainda maior (a mesma linha ainda está na janela final), mas faria o cliente substituir tudo, perdendo linhas de histórico já carregadas por paginação, e o turn navigator em seguida recarrega tudo por paginação; em sessões longas isso se repete a cada rodada (medido: CPU do host a 100%, mais de 15 s por rodada). Degradar quando o snapshot não é menor que o buffer não traz benefício, só custo.
- A degradação só ocorre quando o buffer é realmente maior que o limite superior do snapshot (por exemplo, um backlog de atualizações caindo sobre uma grande quantidade de linhas fora da janela final). O limite de op não muda.

Quando qualquer um dos limites é excedido, executa-se uma transição de estado atômica:

```text
draining
   │ buffer > limit
   v
needsResync
   ├─ 立即清空该 subscription 的 delta buffer
   ├─ 丢弃此前待发 logical delta frame
   ├─ 禁止继续发 delta
   └─ onDrained/可发送时只取最新权威 snapshot
          │ snapshot 成功写入 transport
          v
draining（新水位之后续流）
```

O "descarte" aqui ocorre antes de entrar no RPC transport e é recuperado por snapshot; physical frames já aceitos pelo transport não sofrem descarte semântico. Se a conexão permanecer saturada, o publisher mantém apenas a flag `needsResync` e não acumula múltiplos snapshots por causa dela.

## 4. TopicWireFrame: separação entre logical e physical

`TopicFrame<S,D>` continua expressando um logical frame aplicável atomicamente. O wire v3 usa o envelope físico `TopicWireFrame`:

```ts
type TopicWireFrame<S, D> =
  | {
      wireVersion: 3;
      kind: "complete";
      logicalFrameId: string;
      logicalFrameOrdinal: number;
      topic: string;
      subscriptionId: string;
      frame: TopicFrame<S, D>;
    }
  | {
      wireVersion: 3;
      kind: "fragment";
      logicalFrameId: string;
      logicalFrameOrdinal: number;
      topic: string;
      subscriptionId: string;
      fragmentIndex: number; // 0-based
      fragmentCount: number;
      logicalBytes: number; // canonical logical JSON 的 UTF-8 byte 数
      checksum: { algorithm: "crc32"; value: string }; // 传输完整性，不用于安全认证
      dataBase64: string; // canonical logical bytes 的当前分片
    };
```

Limites normativos:

- O tamanho serializado em UTF-8 de cada physical frame JSON/RPC **junto com o envelope completo** precisa ser `<= 1_048_576` bytes. O valor medido é o maior entre os três carregamentos reais: notificação NDJSON do CLI (incluindo a quebra de linha), binário de Channel/Socket event e o JSON externo do mobile relay `data.payload.rpc-frame` (com os bytes de Channel em base64 por dentro).
- O mobile relay é hoje o envelope externo mais restritivo. O encoder precisa decidir a fragmentação usando o medidor de envelope real/busca binária; ids de transport como `bridgeSessionId/recoveryId` têm no máximo 256 caracteres, e a medição usa esse teto e a largura numérica pessimista.
- O encoder precisa calcular primeiro o overhead do envelope e só então decidir o comprimento de cada fragmento de `dataBase64`; não pode partir 1 MiB de payload e depois encaixar o envelope.
- O logical frame de delta normal é limitado pelo teto de bytes do buffer de subscriber: normalmente `<=1 MiB` envia `complete`; quando um único delta grande faz o buffer passar de 1 MiB (mas não ultrapassar o limite superior do snapshot), ele segue `fragment` tal como um snapshot gigante.
- Logical frame de snapshot gigante ou de resume usa `fragment`; fragment só muda o transporte físico, não muda `(fromSeq,toSeq]` nem a semântica de apply.
- Um único logical frame pode conter no máximo `1_024` fragments; schema, encoder e reassembler devem todos falhar de forma fechada (fail closed), evitando alocações ilimitadas de missing-index/assembly por `fragmentCount` forjado.
- O publisher atribui a cada subscription um `logicalFrameOrdinal` estritamente crescente começando em 1; ao repetir a mesma reserva, ordinal e id permanecem. Wires tardios com ordinal abaixo do já aceito são descartados silenciosamente; trocar `logicalFrameId` no mesmo ordinal é uma typed protocol fault.
- Os fragments do mesmo logical frame precisam ter o mesmo `logicalFrameId/logicalFrameOrdinal/topic/subscriptionId/fragmentCount/logicalBytes/checksum`.
- O encoder pode fatiar no meio de um code point do stream lógico de bytes UTF-8; cada fatia faz base64 válido de forma independente, e o cliente precisa remontar os bytes originais e só então fazer um único decode UTF-8 — é proibido decodificar texto fatia a fatia.

## 5. Atomicidade da montagem e o limite de 16 MiB

O cliente mantém uma única montagem ativa por `(topic, subscriptionId)`, identificando o logical frame por `(logicalFrameOrdinal, logicalFrameId)`, com no máximo:

```ts
const MAX_LOGICAL_ASSEMBLY_BYTES = 16 * 1_048_576;
const MAX_LOGICAL_ASSEMBLY_FRAGMENTS = 1_024;
const MAX_CONCURRENT_ASSEMBLIES = 32;
const MAX_STAGED_DECODED_BYTES = 32 * 1_048_576;
const ASSEMBLY_TIMEOUT_MS = 30_000;
```

```text
fragment 0 ─┐
fragment 2 ─┼─> staging assembly（store 不变）
fragment 1 ─┘        │
                     ├─ 全片 + bytes + checksum 正确 ─> parse/schema validate ─> 原子 apply
                     └─ 缺片/冲突/超限/校验失败 ─────> 丢整个 assembly ─> resync
```

São sempre proibidos: aplicar parte do snapshot antes, tratar fragment como frame de seq independente, truncar depois de a montagem exceder o limite e ainda tentar merge quando o checksum falha.

O assembler incremental faz base64 decode de cada fragment exatamente uma vez, acumula em slots fixos de fragmento e só concatena uma vez no final, de modo que a complexidade total é O(n). O timeout é contado desde a primeira fatia e fatias repetidas não o estendem; conclusão, fault, timeout e abort fail-closed do consumer devem manter o tombstone de ordinal daquela rota até o unsubscribe/limpeza de geração, proibindo que fatias antigas tardias ressuscitem. Um ordinal mais alto pode despejar uma montagem ativa antiga; depois disso, um ordinal baixo tardio não pode superseder de volta. Fragmento idêntico repetido é no-op, e fragmento repetido conflitante libera aquela montagem e produz uma typed fault. Quando um novo `logicalFrameId` chega para o mesmo `topic/subscriptionId`, a montagem antiga é encerrada explicitamente com `proto.frameAssemblySuperseded`; exceder o número concorrente, o budget total de staging ou o limite de um único logical frame falha de forma fechada, proibindo despejar silenciosamente uma montagem saudável.

Quando nova entrada/admissão de attachment faz a projeção autoritativa transmitível ultrapassar 16 MiB, o CLI precisa retornar explicitamente `rejected` ou `failed` antes de admitir (`proto.payloadTooLarge` ou o fault correspondente). Saídas grandes de tool/model geradas em execução não podem ser contornadas truncando o snapshot inteiro: a saída de tool vira referência de artifact e mantém o head/tail previsto no protocolo; se o texto do modelo ainda romper o limite, o turno termina com uma protocol fault explícita. Nenhum caminho pode gerar metade de um estado autoritativo não transmitível.

## 6. Gap e resync automático

`v4/conversation/resync` é o caminho de produção, não um método auxiliar de teste:

```ts
interface ConversationResyncParams {
  subscriptionId: string;
  base: { logEpoch: string; seq: number } | null;
  forceSnapshot?: boolean;
}
```

As condições de disparo incluem gap de seq, falha de montagem de fragments, overflow do publisher e reconstrução do transport. Regras do cliente:

1. `toSeq <= localSeq` é descartado silenciosamente.
2. O primeiro gap dispara apenas um resync; não se pede de novo enquanto ele está em trânsito.
3. Se houver gap novamente após o resume, sobe-se para `forceSnapshot=true`.
4. Depois da reconstrução do attachment ou de mudança de epoch do CLI, reassina-se automaticamente; não se recebe o fluxo antigo até que o novo subscriptionId entre em vigor.
5. Snapshot é substituído por inteiro após montagem completa; o store não muda antes de todos os fragments chegarem.
6. `proto.frameAssemblyInvalidPayload` (recusa de schema) é uma **falha determinística de conteúdo**, e não se submete à escala transiente das regras 2/3: envia-se direto um `forceSnapshot=true`; se ainda houver recusa de conteúdo, para-se e escreve-se `fault.subscription.contentRejected`. A semântica completa está na regra fechada 11 de 04-sync-and-recovery.

## 7. Envelope físico de RPC raw do mobile

A promessa de 1 MiB do wire de topic não substitui os limites físicos próprios do transport Channel raw do mobile. 04D-3 já migrou atomicamente o desktop main e o mobile web para o shared acknowledged adapter: uma mensagem de Channel precisa ser codificada no seguinte payload exclusivo de transport antes de entrar no relay externo, e o parser global do app só aceita o novo fragment/ACK strict; o `rpc-frame` legacy de fatia única não é mais um branch de compatibilidade de produção. O relay continua tratando-o apenas como `data.payload` opaco:

```ts
type WebRemoteControlRpcTransportPayload =
  | {
      zcode_type: "rpc-frame";
      bridgeSessionId: string;
      bridgeGeneration?: number;
      recoveryId?: string;
      seq: number; // physical fragment seq
      messageSeq: number; // raw Channel message seq
      fragmentIndex: number; // 0-based
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

Fronteiras normativas:

- O schema precisa ser strict; campos extras, inteiros não seguros e transport id/base64/checksum ilegais são rejeitados.
- `bridgeSessionId/recoveryId` têm no máximo 256 caracteres ASCII JSON-safe.
- O encoder faz medição UTF-8 real do JSON final e não comprimido `{type:"data",payload,client_ts,server_ts}` e usa busca binária para decidir o tamanho do chunk decodificado; ids de transport e números são medidos na largura máxima do protocolo.
- Cada JSON final de relay `<=1_048_576` bytes; mensagem lógica Channel raw `<=16 MiB` e `<=64` fragments.
- No lado receptor, apenas uma montagem de mensagem raw ativa por direção, com timeout de 30s a partir da primeira fatia; payload com identity incompatível é rejeitado antes de ocupar/avançar a montagem.
- Fragmento duplicado idêntico active/last-settled é no-op; duplicado conflitante, physical gap, divergência em metadata/length/base64/CRC ou excedente produzem typed transport fault; physical seq mais antigo é apenas no-op conforme a marca d'água cumulativa de delivery e nunca é entregue duas vezes. Só após a verificação bem-sucedida de todas as fatias os bytes lógicos são entregues atomicamente uma única vez.
- Depois que `seq/messageSeq` alcança `Number.MAX_SAFE_INTEGER`, só é permitido encerrar a fatia/mensagem atual; qualquer nova fatia ou nova mensagem exige uma nova bridge generation por meio de typed exhaustion fault, e é proibido dar wrap ou continuar acumulando em inteiros não seguros.

O `rpc-frame-ack` raw confirma apenas que a mensagem Channel completa foi entregue ao parser/enqueue do par. Não é um ACK de command do V4, não prova que a entrada foi admitida, não limpa o registro de pending commands e não substitui o resync de topic. Enquanto a primeira mensagem ainda não foi entregue por completo, um duplicado ativo apenas retorna no-op e não gera ACK de wire; só quando já existe mensagem concluída se reenvia o último `ackMessageSeq` positivo cumulativo.

### 7.1 Production acknowledged adapter

O mesmo adapter carrega simultaneamente o replay de TX de uma direção e a montagem de RX da outra direção, mas continua guardando apenas fatos de transport. Tanto o desktop main quanto o mobile web conectam diretamente o MessagePort/Channel da bridge proprietária ao adapter:

```text
Channel send(raw)
  -> encode immutable physical batch
  -> reserve exact final outer bytes before first send
  -> local transport accepts frames
  -> wait cumulative rpc-frame-ack

rpc-frame fragments
  -> one-message assembler
  -> complete + synchronous Channel delivery succeeds
  -> queue latest cumulative ACK (ACK always flushes before data)
```

- O TX faz admissão sobre os bytes finais de todo o lote de relay JSON e só então mantém o lote imutável; `send=false` não altera `seq/messageSeq`, o resume na mesma bridge reproduz desde a primeira fatia o lote nunca ACKado e não renova o tempo da reserva mais antiga.
- O transport cria uma única vez o JSON final de relay imutável por payload; `measureFrameBytes` e `sendFrame` referenciam o mesmo serializer/cache, e o replay não ACKado reaproveita a mesma string de bytes — é proibido "medir um JSON e enviar outro" ou alterar a contabilidade por deriva de timestamp.
- `unacknowledgedBytes` são os bytes finais não comprimidos do JSON externo de todos os lotes sem ACK cumulativo; os limiares default high/low são `1 MiB / 256 KiB`, e a notificação ocorre uma única vez em cada borda de estado `> high` e `<= low`.
- O replay é limitado simultaneamente por `8 MiB` e por `45s` após a primeira mensagem sem ACK; sair dessas bordas entra em degraded tipado antes de enviar meia mensagem lógica. As entradas de reserve/flush/replay e o envio de cada payload físico precisam checar a idade sincronamente, sem depender apenas de callback de timer. O deadline de montagem de `30s` após a primeira fatia em RX existe de forma independente, e duplicados não renovam.
- `8MiB / 45s / 30s` são limites superiores rígidos; options de teste ou de chamador só podem apertar, nunca afrouxar.
- Um ACK `K` libera de uma vez todos os `messageSeq <= K`; ACK antigo é no-op, e exceder o maior messageSeq para o qual "todos os physical frames do lote foram aceitos pelo transport local" é typed fault. O payload de ACK em si não entra na contabilidade de replay.
- Os bytes completos só podem enfileirar ACK depois que a entrega `onMessage` síncrona retornar normalmente; erro na entrega, fault de fragment, ACK futuro e overflow de bytes/idade disparam apenas uma vez o terminal degraded.
- O ACK enfileirado guarda apenas o maior valor positivo cumulativo e tem prioridade sobre o flush de dados; o primeiro ACK pendente também fica sujeito ao deadline de idade de 45s, e valores cumulativos posteriores mais altos não renovam. O callback de send pode reentrar de forma síncrona para o ACK, e o adapter precisa tratar esse caminho reentrável serialmente, sem classificar por engano um ACK futuro ou remover um lote em envio.
- Nova identidade de bridge, terminal degraded e dispose limpam timers antigos, referências de montagem, ACK pendente e lotes sem ACK; não é permitido replay automático entre bridge generations.

## 8. Flow control da connection

O transport expõe uma interface de congestion somente leitura:

```ts
interface ConnectionFlowControl {
  readonly unacknowledgedBytes: number;
  onSaturated(listener: () => void): Disposable;
  onDrained(listener: () => void): Disposable;
}
```

- `onSaturated`: pausa o drain dos publishers daquela connection e continua fazendo coalesce dentro dos limites próprios de cada subscription; subscriptions excedidas passam a `needsResync`.
- `onDrained`: retoma o drain de forma justa; uma subscription em `needsResync` envia primeiro um snapshot atual, e as outras subscriptions não são reiniciadas.
- O relay do celular repassa o sinal até o attachment do shared host; relay/main não guardam eventos de conversation sem ACK.
- O MessagePort local pode degradar para uma implementação passante que nunca fica saturada, mas ainda usando a mesma interface e o roteamento com dono.
- O fechamento da port precisa limpar o registry de connections, buffers, montagens e listeners.
- `PersistentProtocol` apenas declara uma estrutura que satisfaz o `ConnectionFlowControl` público; o mobile de produção não se reconecta a ele.
- A borda de flow do mobile de produção percorre um sideband estrito até o CLI, sem entrar no deserialize de Channel:

```text
raw adapter SAT/DRN
  -> desktop main owning MessagePortProtocol.sendFlowState
  -> host attachment MessagePort sideband（只消费 control object）
  -> ZCodeAgentConnectionScope per-scope serial chain
  -> trusted v4/connection/flow {connectionId,state}
  -> CLI pausedConnections
  -> 只 pause/resume 该 connection 的 conversation/index/config subscriptions
```

- O sideband só tem `saturated|drained`; o host injeta um `closed` quando a port fecha. Um caller de RPC terminal não pode chamar diretamente o método de transport-control; o remote trusted-host-relay continua aplicando um namespace inequívoco ao connectionId do downstream.
- `saturated` limpa o pending flush timer daquela connection e ingest/coalesce continuam; `drained` faz drain imediato apenas daquela connection, e subscriptions em `needsResync` recebem naturalmente prioridade do publisher para produzir o snapshot mais atual; `closed` limpa apenas o estado de pausa, e o dispose da facade proprietária continua responsável pelo unsubscribe/limpeza do registry.
- Um SAT→DRN→close rápido no mesmo scope é serializado por promise chain, e states repetidos não geram RPC; enquanto já saturated, uma nova subscription sincroniza o state atual imediatamente para a rota confiável de connection/workspace assim que seu ACK chega.
- O pending buffer de 50 itens do desktop main guarda apenas payloads pequenos de app, como bootstrap/workspace/platform; `rpc-frame`/ACK têm ownership de replay exclusivo do adapter e nunca entram num buffer de segunda camada.
- As duas pontas aplicam um portão rígido `<=1 MiB` por bytes UTF-8 raw antes do `JSON.parse`. Oversize permanente e socket indisponível temporário são resultados diferentes; oversize dispara imediatamente typed fault/hard bridge recovery, sem buffer repetido.
- Quando o desktop notifica ao mobile que deve reconstruir a bridge, envia apenas o genérico `bridge-degraded: rpc-transport-fault`; reasonCodes tipados específicos como checksum, gap, ACK futuro e oversize vão apenas para o log local seguro, sem se disfarçar uniformemente como frame gap.

### 8.1 Upload de attachment não é fragmentação de logical frame

Os bytes de attachment seguem uma transação de negócio separada; não se pode enfiar 20 MiB de `dataBase64` em uma única requisição Channel/NDJSON e depois esperar que o mobile raw adapter fragmente de novo: isso só restringiria o envelope externo do relay, não o NDJSON host→CLI.

```text
UI high-level put(bytes)
  -> attachment/begin
  -> attachment/chunk x N       decoded <= 512 KiB / physical request <= 1 MiB
  -> attachment/commit
  -> artifact ref
```

- O comprimento padrão de fatia do transport da UI é 384 KiB (divisível por 3, sem padding em base64 exceto na última), deixando espaço de envelope suficiente para workspace, method/header de Channel e trusted carrier; o teto rígido do protocolo continua sendo 512 KiB decodificado.
- Requests Channel renderer→host e requests NDJSON host→CLI são medidos pelos parâmetros reais; qualquer um acima de 1 MiB dispara imediatamente `proto.frameTooLarge`, e não se entrega requisição oversized ao relay inferior para que ele aquebre.
- O staging do CLI só guarda bytes decodificados e obedece a três limites rígidos: `20 MiB/upload`, quantidade de uploads ativos e bytes staged globais; chunk duplicado mantém apenas digest/bytes já existentes, sem contar duas vezes.
- O `connectionId` confiável participa da upload key. `closed` limpa aquela connection, `disposeSession` limpa aquela session, o TTL limpa transactions expiradas, e o restart do CLI limpa naturalmente pela memória do processo; nenhuma dessas limpezas gera artifact.
- O commit valida a contagem completa de chunks, totalBytes e SHA-256 e então escreve o artifact da session de uma só vez; o conteúdo do artifact mantém a forma de data-URL legível pelos providers existentes, mas esse base64 só é gerado na fronteira de memória/storage do CLI e não passa mais por RPC. O resultado bem-sucedido é mantido como tombstone de idempotência, e repetir o commit cujo ACK se perdeu devolve a mesma ref sem gravar de novo em disco.
- Abort é idempotente; falha de upload é lançada para cima pela pilha de chamadas do composer, e como o command commitado ainda não ocorreu, o texto e o attachment precisam ser preservados.

ACK, heartbeat e replay de queda curta do RPC servem apenas para sondar e trocar de pipeline: nunca se reenvia no lugar na mesma TCP/ws travada; em um novo socket, reproduz-se o physical frame não ACKado com o mesmo msgId e o par deduplica. Queda longa ou estouro da janela de tolerância ainda volta a subscribe/resync.

## 9. Fronteiras de aceite

Os testes de ouro do protocolo cobrem mecanicamente, no mínimo:

- frames intermediários diferentes em continuous/replayable com estado terminal consistente campo a campo;
- o estado terminal de quem declara `workflowRunDeltas` é igual à projeção autoritativa, o de quem não declara é igual à codificação antiga de chave completa (após o limite), e o snapshot e o fluxo seguinte da mesma subscription usam o mesmo conjunto de limites;
- buffer `500/501 op`;
- physical JSON/RPC `1 MiB-1 / 1 MiB / 1 MiB+1`;
- restauração atômica de 1/2/muitas fatias de RPC raw do mobile, tombstone de duplicado, incompatibilidade de identity, `16 MiB/+1`, `64/65` fatias e timeout de 30s;
- UTF-8 multibyte exatamente cruzando o limite;
- fragments chegando fora de ordem, repetição da mesma fatia, fatia faltante, conflito de campos e falha de checksum;
- montagem em `16 MiB` exatos e com um byte a mais;
- após overflow, enviar apenas o snapshot mais atual;
- quando um único delta grande passa de 1 MiB mas não ultrapassa o limite superior do snapshot, continuar enviando deltas (sem substituição integral), com estado terminal do cliente consistente com a reprodução completa; e ainda degradar quando o buffer ultrapassa o limite superior do snapshot;
- com duas connections assinando a mesma subscription na mesma session, o resync do celular lento não afeta o desktop, e o link do celular nunca mostra o `subscriptionId` do desktop.
- attachment de 20 MiB exatos, rejeição pré-admissão de 20 MiB+1, envelope por fatia Channel/NDJSON `<=1 MiB`, e limpeza de empty/missing/future/duplicate-conflict/checksum/ACK-loss/abort/TTL/close/restart.

Essas fronteiras são portões de correção do protocolo, não itens de ajuste de performance.