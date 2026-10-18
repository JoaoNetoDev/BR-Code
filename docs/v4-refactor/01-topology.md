# Topologia de processos: isolamento de conexão e fatos autoritativos do CLI

> Fato atual (V4 wire v3): desktop e mobile compartilham a mesma fonte de fatos de session/runtime, mas têm conexões, assinaturas e estratégias de entrega isoladas entre si. relay, desktop main e renderer não são fontes de fatos de conversation.

## 1. Uma cadeia de fatos, dois limites de entrega

```text
Desktop renderer / SSH/WSL/Docker window
  attachment A
  { connectionId=A, clientMode=desktop-continuous }
  profile=continuous
          │
          │ owned subscriptions only
          v
┌──────────────────────── Host process ────────────────────────┐
│ connection-scoped service facade                            │
│   A registry: sub-a1, sub-a2                                │
│   B registry: sub-b1                                        │
│   route(frame) -> owner(subscriptionId) 的 attachment port   │
│                                                              │
│ owner / lease / stale-run: 只负责跨 host 命令和阻塞请求路由 │
│ relay/main: 鉴权、配对、心跳、payload/拥塞信号透传           │
└──────────────────────────┬───────────────────────────────────┘
                           │ stdio / @zcode/protocol-v4
                           v
┌──────────────────────── CLI runtime ─────────────────────────┐
│ event log -> Projection -> per-subscriber publisher          │
│ CommandInbox FIFO -> queue/guided row/transcript             │
│ transcript / marker / child metadata: sourceCommandId        │
└──────────────────────────────────────────────────────────────┘
                           ^
                           │ shared-host attachment（不另起 runtime）
Mobile / Web remote        │
  attachment B             │
  { connectionId=B, clientMode=web-remote-replayable }
  profile=replayable
```

A mesma sessão pode ser assinada por A e B ao mesmo tempo. Os quadros intermediários vistos por
cada lado podem diferir por causa do profile, mas a projeção final precisa ser idêntica campo a
campo; consumo lento, reassinatura ou fechamento em qualquer um dos lados não pode substituir nem
contaminar o outro.

## 2. Contexto de conexão confiável

Quando cada attachment de RPC é estabelecido, o host cria um contexto de conexão unforgeável:

```ts
interface TrustedConnectionContext {
  connectionId: string;
  clientMode: "desktop-continuous" | "web-remote-replayable";
  deliveryProfile: "continuous" | "replayable";
}
```

O mapeamento é um limite de produto fixo e não é inferido por parâmetro de UI ou tipo de socket
subjacente:

| attachment                            | `clientMode` confiável | profile      |
| ------------------------------------- | ----------------------- | ------------ |
| janela local de desktop               | `desktop-continuous`    | `continuous` |
| janela de desktop via SSH / WSL / Docker | `desktop-continuous`    | `continuous` |
| shared-host attachment de `/remote` no celular | `web-remote-replayable` | `replayable` |
| Web remote / relay WebSocket          | `web-remote-replayable` | `replayable` |

`zcode-server /ws` usa replayable de forma fixa para todas as conexões comuns; mesmo que o chamador
envie o header antigo `x-zcode-rpc-client-mode`, a conexão não pode ser promovida a continuous. O Node
host do server-remote de desktop precisa antes solicitar, via
`POST /api/rpc-host-capability` — protegido pelo middleware de autenticação de server existente —,
uma capability aleatória de curto prazo e de uso único, e depois colocá-la em um header exclusivo de
Node para conectar ao `/ws/host` dedicado. Só depois de consumir a capability o server estabelece o
relay attachment continuous confiável, e ainda assim atribui um novo `connectionId` a esse
attachment. O server open/no-token passa pelo mesmo fluxo explícito de solicitação e consumo único;
forjar isoladamente o header de papel ou repetir a replay de uma capability não concede trusted role.

```text
Desktop Node host
  │ POST /api/rpc-host-capability（沿用 server auth）
  v
短期 capability ── 首次消费 ──> GET /ws/host ──> continuous trusted relay
       │                              │
       └─ 过期 / 重放：拒绝          └─ server 生成 connectionId

Browser / 任意普通 client
  └─ GET /ws（旧 mode header 被忽略）──────────> replayable terminal
```

`hello/clientHello` apenas conclui a negociação do wire v3, confirma a identidade da conexão e
registra a identidade de telemetria. O cliente pode reportar um `clientId` estável, a versão e o
`clientKind` para fins de exibição, mas não pode sobrescrever o `connectionId/clientMode/profile`
injetado pelo host. O `subscribe` voltado à UI não aceita mais `deliveryProfile` nem `clientMode`.

A conexão, assinatura, comandos e cache de workspace remoto continuam atravessando `workspaceIdentity`
e `remoteSessionId`. A chave de identidade é sempre `workspaceIdentity?.trim() || workspacePath`;
somente leitura/escrita de arquivos e cwd de processo usam `workspacePath`.

## 3. Registro de assinaturas por conexão

O host mantém um registry separado para cada attachment, com o índice mínimo:

```text
connectionId -> subscriptionId -> { topic, profile, visibility, state }
subscriptionId -> owning attachment port
```

Regras normativas:

1. Reassinar o mesmo topic na mesma conexão substitui apenas a assinatura antiga daquela própria conexão; conexões diferentes nunca se substituem.
2. Quadros de downlink do CLI só podem ser escritos na porta que possui aquele `subscriptionId`. É proibido fazer broadcast por workspace e deixar o celular descartar quadros do desktop por subId.
3. Quando a porta do attachment é fechada, o handshake falha ou a conexão é reciclada, a facade deve cancelar de uma só vez todas as assinaturas daquele registry e liberar o fragment assembly e os buffers.
4. Quando o attachment é reconstruído ou muda o epoch do runtime do CLI, o cliente reassina automaticamente com a base legal vigente; em caso de epoch incompatível, passa por snapshot.
5. `onSaturated/onDrained` são sinais de flow control no nível da conexão. O link do celular pode repassá-los via relay/main até o attachment proprietário, mas relay/main não interpreta topic, seq, queue nem snapshot.
6. Antes do subscribe ser emitido, a propriedade pendente é estabelecida; o server coloca o quadro inicial em uma outbox pós-resposta de escopo da requisição, e a conexão escreve NDJSON sempre na ordem fixa `response -> initial notification`. Mesmo que as duas linhas estejam na mesma leitura, quadros anteriores ao ACK de host/UI/task-index só podem entrar em staging limitado; depois que o ACK vincula o `subscriptionId`, eles são liberados na ordem original para o único owner, e close / stale generation limpa as referências. Overflow de task-index limpa o staging daquela geração e marca recovery-needed; a semântica de falha de physical staging overflow de host/UI fica em 04B. O transport da UI ainda precisa aguardar a escrita do `subscriptionId` no store e a ativação explícita antes de entregar.
7. O unsubscribe precisa ser gerado pela entrada do registry proprietário, com a route completa `{ topic, subscriptionId, connectionId }`; o publisher do CLI só remove a assinatura em que os três coincidem exatamente, e não pode espalhar por vários topics usando um `subscriptionId` cru.

## 4. Propriedade do estado autoritativo

| Estado                                    | Local autoritativo único                                     | Responsabilidade das outras camadas                    |
| ----------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| session event log / projection            | CLI                                                           | o host apenas roteia e bufferiza com limite; a UI faz apply |
| entrada busy/running já submetida         | `CommandInbox` do CLI / fila do runtime                      | a UI mantém apenas overlay otimista                    |
| rascunho não submetido, posição de rolagem | cliente atual                                                 | não entra nos fatos do protocolo                      |
| resultado idempotente de command          | LRU do CLI + transcript/marker/child + discarded ledger     | registry de pendentes de 24h na UI para reconciliação  |
| subscription buffer / fragment assembly   | estado volátil por connection/subscriber                    | se perde ao fechar, recuperado por resync               |
| owner / lease / stale-run                 | camada de roteamento do host                                 | garante owner único, respostas bloqueantes e comandos cross-host corretos |

O mobile V4 não passa mais pela fila de comandos do runtime do host. Toda entrada submetida, venha do
desktop ou do celular, entra no mesmo FIFO `CommandInbox` seguindo a ordem de admissão serial do
CLI. owner/lease não pode ser removido por existir um caminho principal shared-host: workspace
remoto, bot/proxy, fallback cross-host e requisições bloqueantes ainda dependem dele, mas ele já não
possui uma segunda fila de conversation.

## 5. Limite de processo do fork

Ao fazer fork de um assistant estável anterior enquanto está running, apenas o CLI copia o
transcript estável, a configuração do ponto de fork e o estado de goal anterior ao ponto de fork:

```text
parent runtime (继续 running) ── stable boundary ──> child transcript
shared workspace             ── 不 rewind / 不复制 checkpoint ──> 原样共享
parent queue/active/background/continuation ──X──> child
```

O comportamento de checkpoint de workspace existente para fork completed/idle não é ampliado nesta
rodada. Fork running não entra no legacy bridge com `ensureNoActiveTurn`.

## 6. Três portões de implementação

Este ciclo fechado é entregue em ordem de dependência, e um portão posterior não pode entrar em
produção contornando o anterior:

1. **Conexão, assinatura, quadros e recuperação**: contexto de attachment confiável, owned routing, quadro físico de 1 MiB, buffer de subscriber e resync automático.
2. **Entrada autoritativa, fila e idempotência**: FIFO unificado do CLI, `ConversationInputIntent`, `commands/query`, `sourceCommandId` e reconciliação de discarded.
3. **Fork de assistant estável**: resolver de target único, fork running apenas de conversation e fechamento de child duplicado.

Invariante final: cada entrada submetida precisa estar, e só pode estar, em um destes estados
`queue / guided row / transcript / explicit rejected|failed|discarded`; não pode existir "a UI já
limpou, mas a camada autoritativa do CLI não tem registro".