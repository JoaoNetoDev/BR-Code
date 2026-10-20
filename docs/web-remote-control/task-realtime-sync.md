# Sincronização de Tasks em Tempo Real

> Status: explicação vigente do wire v3 do V4.
>
> Desktop e celular se anexam ao mesmo host/service/CLI runtime, mas conexão, assinatura e
> delivery profile ficam isolados entre si.
> `TaskRealtimeBus` continua sendo responsável por owner lease, stale-run e roteamento de comandos
> entre hosts; ele não guarda uma segunda cópia da conversation queue, projection ou do estado
> de negócio replayable.

Este documento descreve a assinatura em tempo real de tasks/sessões do ZCode, snapshot/resync,
entrada entre dispositivos e os limites de recuperação após desconexão.

## Invariantes centrais

- A janela desktop local e via SSH/WSL/Docker é sempre `desktop-continuous`, passando pelo
  fluxo de dados continuous direct completo.
- O `/remote` do celular e o Web remote são sempre `web-remote-replayable`, passando pelo fluxo
  de recuperação replayable por gap/snapshot.
- `clientMode` e profile são injetados de forma confiável pelo host attachment; o subscribe
  voltado à UI não pode escolher nem sobrescrever.
- Cada conexão tem seu próprio subscription registry, buffer, montagem de fragmentos e ciclo de
  vida de resync.
- Toda entrada busy/running já submetida em qualquer dispositivo entra em um único `CommandInbox` FIFO,
  na ordem de admissão serial do CLI.
- relay/main apenas faz autenticação, pareamento, heartbeat, encaminhamento de
  `rpc-frame`/payload de app e sinais de flow control de nível de conexão.
- owner/lease/stale-run continuam garantindo owner único, requisições bloqueantes e correção de
  comandos entre hosts, mas não são dona do fato da conversation.

Invariante final de entrada: cada entrada submetida deve estar, e apenas estar, em um de
`queue / guided row / transcript / explicit rejected|failed|discarded`.

## Process Model

```text
Desktop attachment A                       Mobile /remote attachment B
{connectionId=A, desktop-continuous}       {connectionId=B, web-remote-replayable}
            │                                           │
            │ MessagePort                                │ relay rpc-frame
            └─────────────────┐             ┌────────────┘
                              v             v
                    one Window Host owning local/remote workspace scopes
                    ├─ connection facade A -> sub-a*
                    ├─ connection facade B -> sub-b*
                    ├─ owner / lease / stale-run routing
                    └─ services -> one CLI runtime
                                      ├─ event log / projection
                                      └─ CommandInbox FIFO
```

O celular só se anexa a um scope local/remote de workspace já existente no único Window Host da
janela desktop alvo; ele não pode iniciar outro Agent runtime, Host ou sessão SSH/WSL/Docker.
A desconexão do celular libera o attachment de curta duração, sem destruir o Host/CLI que
continua em execução.

O encadeamento de workspace remoto deve atravessar `workspaceIdentity` e `remoteSessionId`. A chave
de identidade usa `workspaceIdentity?.trim() || workspacePath`; somente leitura/escrita de arquivos
e cwd de processo usam `workspacePath`.

- O relay só faz pareamento, heartbeat e encaminhamento de `data.payload`; não interpreta task,
  session, stream, permission nem snapshot.
- O desktop main só faz workspace bridge, attachment via MessagePort, roteamento de frame RPC e
  coordenação do realtime bus; não lê nem grava diretamente o task repo.
- O que o celular libera ao reconectar é o `BridgeAttachment` de curta duração; não pode destruir
  `HostEntry`, services ou Agent runtime ainda em execução.
- Apenas o fechamento real da janela, o quit do app e a instalação de update entram no Host
  shutdown barrier; minimizar para a bandeja e desconectar o attachment do celular não entram.
- Tanto workspace local quanto remoto se anexam ao Host único da janela; o scope remoto primeiro
  localiza a logical session por `remoteSessionId + workspaceIdentity/workspaceKey` e depois o
  Host registry valida path/identity. Várias logical sessions SSH podem compartilhar a mesma
  conexão dentro do Host da janela, mas o celular não pode acessar outro workspace através de
  outra logical session nem criar uma nova sessão SSH/WSL/Docker.
- O Window Host registra um único `hostId` no `TaskRealtimeBus`; owner/lease/session route
  continuam isolados por `workspaceKey + taskId`, e o scope é rederivado no bind/detach de
  sessão, sem afundar o estado replayable no main.

## Trusted Connection And Owned Subscription

O host atribui um `connectionId` distinto a cada attachment e injeta o contexto de conexão
confiável na facade de serviço do V4:

| attachment                   | trusted clientMode      | profile      |
| ---------------------------- | ----------------------- | ------------ |
| janela desktop local/SSH/WSL/Docker | `desktop-continuous`    | `continuous` |
| `/remote` do celular / Web remote  | `web-remote-replayable` | `replayable` |

`hello/clientHello` é usado para negociar o wire v3, confirmar a identidade da conexão e registrar
um `clientId` estável; os valores reportados pelo cliente não podem sobrescrever a
conexão/profile injetada pelo host. O registry mantém no mínimo:

```text
connectionId -> subscriptionId -> {topic, profile, state}
subscriptionId -> owning attachment port
```

A capacidade negociada por conexão e o `clientMode` passam pelo mesmo caminho de injeção: o host
declara `workflowRunDeltas` no `hello`, o cliente só declara em `clientHello` algo mais novo do que
o host declarou, e a facade injeta a conclusão no subscribe daquela conexão. Isso é ortogonal a
`clientMode`/`deliveryKind` — tanto `continuous` quanto `replayable` podem ser declarante ou não.
Assinantes que não declaram (como uma página antiga do celular em que o guarda de versão ainda não
trocou o usuário para o novo bundle) continuam recebendo a chave completa `workflowRuns` e são
limitados pelo antigo teto de 256 entradas por run, de modo que a validação estrita de frames
continua passando. O recorte preserva **os que ainda estão se movendo**: atores cujo estado não é
`completed` e nodes ainda não liquidados entram primeiro; o saldo é preenchido com as entradas
mais antigas na ordem da tabela, e a saída mantém a ordem original da tabela
([presentation.md](../dynamic-workflow/presentation.md) «The run state the pane draws»).

Rescrever a assinatura do mesmo topic na mesma conexão substitui apenas a assinatura antiga daquela
conexão. Frames de downlink do CLI são escritos apenas na porta proprietária; é proibido fazer
broadcast no workspace e deixar o celular descartar frames do desktop por subId. Quando a porta
fecha, todas as assinaturas daquela conexão são canceladas de uma vez e buffer/assembly são
liberados. Uma assinatura lenta do celular não pode afetar o desktop nem outro pane.

## Buffer, Frame e Resync

O publisher calcula o buffer de cada assinante após o filtro de profile e o coalesce:

- `<= 500 ops` e `<= 1 MiB`: drain normal.
- Qualquer limite excedido: limpa imediatamente o buffer daquele assinante, marca resync e, na
  próxima vez, envia apenas o snapshot mais recente.
- Cada frame físico JSON/RPC, incluindo o envelope, deve ter `<= 1 MiB`; logical snapshot/resume
  grandes demais usam fragmentação.
- O encoder de topic toma o máximo do envelope efetivo para CLI NDJSON, Channel/Socket e o JSON
  externo base64 do relay mobile, portanto tanto o continuous do desktop quanto o replayable do
  celular nunca recebem uma notificação de topic acima de 1 MiB.
- A montagem de fragmentos tem limite de 16 MiB / 1.024 fragmentos por frame, no máximo 32
  concorrentes, 32 MiB de staging e 30 s por consumidor; o `logicalFrameOrdinal` de cada assinatura é
  estritamente monotônico, replay de ordinal antigo é descartado silenciosamente, mesmo ordinal com
  id diferente gera conflito, e após fault/timeout o tombstone é mantido; fragmento faltante,
  conflito, checksum/schema divergente ou excesso de limite descarta a montagem inteira — é
  proibido aplicar parcialmente.
- O publisher usa reserva não destrutiva: o nível d'água só é confirmado depois que todos os wires
  físicos foram aceitos pelo transport; uma falha no meio do caminho retenta o mesmo id/conteúdo
  lógico sem limpar junto os eventos novos.

`onSaturated/onDrained` são sinais de nível de conexão. O link do celular pode encaminhá-los via
relay/main até o attachment proprietário, mas relay/main não interpreta topic, seq ou snapshot. O
desktop main escreve a borda do adapter apenas como sideband `connection-flow-v1` na MessagePort
proprietária; o host scope serializa e deduplica e então chama `v4/connection/flow` com o
`connectionId` confiável. Quando o CLI está saturado, apenas o reserve/flush daquela conexão é
pulado; ingest e o sibling continuous do desktop continuam; drained restaura apenas aquela conexão,
closed limpa o pause e a assinatura é cancelada pelo registry proprietário.

Regras de aplicação do cliente:

1. Snapshot, após montagem completa, substitui o estado inteiro; nunca há merge.
2. Frames atrasados/duplicados com `toSeq <= localSeq` são descartados silenciosamente.
3. Quando `fromSeq != localSeq`, inicia-se apenas um `v4/conversation/resync` em voo na mesma sub;
   o owned registry decide topic/profile e o cliente não pode sobrescrever.
4. O voo de recuperação dura até o frame lógico ser aplicado com sucesso; se o resume perder o
   eixo de novo, o mesmo voo promove uma vez `forceSnapshot`. É proibido limpar o voo no ACK ou
   retomar indefinidamente.
5. Após reconstruir o attachment ou mudar o `logEpoch` do CLI, reassinar automaticamente todos os
   topics ativos.

O `logEpoch` do ACK de subscribe é apenas metadata de admissão e não cria base; uma projection
existente só pode ser mantida quando o ACK=`resume` e o epoch é o mesmo, e ACK=`snapshot` a
invalida até o snapshot completo ser aplicado. Delta sem base válida não é aplicado; fault/overflow
exige `base:null + forceSnapshot:true`; um snapshot online completo ainda pode criar a base. Se
passarem 30 s após o ACK sem um frame lógico de recuperação completo, o resume promove uma vez
para force, e se o force também expirar a UI mostra ERROR explicitamente e faz fresh-subscribe
topic-local do task-index. Depois que a recuperação é aplicada, gaps online residuais do mesmo
lote iniciam um voo sucessor.

conversation, sessions-index e workspace-config usam níveis d'água e voos de recuperação
independentes; um gap/fault do celular em certo topic não pode pausar o sibling do desktop nem
limpar um topic de index/config saudável. Um restart do runtime invalida apenas o
runtime/subscription antigos; o emissor de frames do Local/Remote Host que hospeda aquele scope de
workspace permanece vivo, deixando os listeners existentes conduzirem um full re-subscribe; apenas
um teardown real do workspace libera o emissor.

## Blocking Events And Owner Routing

permission, elicitation, terminal e invalidação de snapshot bloqueiam o runtime ou decidem o
fechamento na UI; precisam estar visíveis às conexões online da mesma task por meio de owned
subscription, ou disparar o alinhamento por snapshot, e não podem ser engolidos pelo filtro de
conteúdo owner-only.

Os comandos que precisam ser roteados para o owner do runtime incluem:

- `stop_generation`
- `respond_permission`
- `respond_elicitation`
- conversation commands de workspace remoto / bot / proxy fallback

Um owner command precisa carregar `workspacePath`, `workspaceIdentity` opcional, `workspaceKey`,
`taskId` e o `runId` atual. O main procura o lease por `workspaceKey + taskId` e rejeita runs stale.
O caminho principal do shared-host normalmente acerta o mesmo host manager diretamente, mas isso
não permite remover owner/lease: workspace proxy remoto, owner entre hosts, bot/proxy e respostas
bloqueantes ainda dependem dele.

## Canonical Input Queue

O V4 não divide mais filas por dispositivo:

```text
desktop send ─┐
              ├─> CLI serialized admission -> CommandInbox FIFO
mobile send ──┘                  |
                                  ├─ queue item
                                  ├─ guided row
                                  ├─ transcript
                                  └─ explicit rejected/failed/discarded
```

O V4 do celular contorna a host runtime command queue de
`IZCodeTaskService.enqueueTaskCommand`; a entrada busy aceita no desktop também não fica mais numa
fila local do renderer. O owner route só entrega o command ao CLI correto, sem alterar a ordem de
admissão do CLI. Cada `ConversationInputIntent` guarda de forma autocontida `sourceCommandId`,
`queueItemId`, `clientId`, kind, texto original, attachments, delivery, ordem e estado
steer/dispatch.

Quando o guide não se aplica, há attachments, compact/verifier está busy ou o runtime rejeita o
steer, há fallback para a queue comum preservando os campos originais. Entradas vazias, acima do
limite ou rejeitadas pelo runtime retornam `rejected/failed` explicitamente; a UI preserva o texto
e os attachments. `editQueueItem` atualiza no lugar, preservando ID, posição, attachments e o
command de origem.

`sendQueuedNow` executa sempre:

```text
reserve(item) -> stop barrier -> start/promote(item) -> remove(item)
     |                                  |
     └─ timeout/failure -> release ─────┘  # item original preservado no lugar
```

Cliques múltiplos ou consecutivos no mesmo item, em qualquer dispositivo, têm apenas um
reservation owner.

## Reconciliação de ACK e restart de processo

Depois que um QueueItem aparece, a UI ainda mantém o registro de pending-command por 24 horas,
até transcript, cancelamento, falha ou descarte. Textos/goals comuns podem guardar payload para
reenvio; interações sensíveis guardam apenas digest.

Quando o ACK se perde ou na reconexão, a UI chama `commands/query`, no máximo 64 pares
`{sessionId, commandId}` por vez. A ordem de busca no CLI é:

```text
in-flight pinned -> live queue/guide pinned -> settled LRU (512/session)
  -> transcript / message anchor sourceCommandId
  -> timeline marker sourceCommandId
  -> fork child metadata sourceCommandId
  -> discarded input ledger
  -> unknown
```

Consultas com a mesma chave e a execução compartilham single-flight, evitando efeitos duplicados na
janela assíncrona de verificação de duplicidade.

`commands/query` e execute compartilham `keyGate(sessionId|null, commandId)`; um novo command
adquire então o admission gate da sessão em ordem fixa. In-flight e live input não participam da
evicção LRU; apenas comandos settled podem ser evictados e voltar à origem. A admissão é serial
dentro da mesma sessão e paralela entre sessões diferentes. O índice persistido é construído de
forma preguiçosa por sessão, atualizado incrementalmente e isolado por
`workspaceIdentity?.trim() || workspacePath`; é proibido varrer o transcript inteiro a cada
consulta.

A queue só garante confiabilidade dentro do processo CLI atual. Após um restart do CLI, a entrada
admitida que não entrou no transcript nem atingiu estado terminal retorna explicitamente
`fault.command.inputDiscardedOnRestart` junto do `delivery` persistido; `queue/guide` são
liquidados silenciosamente depois que o runtime antigo é invalidado, e apenas `startNow` que não
entrou no transcript ou `unknown` pedem confirmação do usuário para reenvio — nunca há
restauração ou replay automático. Uma queda de rede comum continua recuperando a queue autoritativa
do runtime atual a partir do snapshot replayable; relay, main e host não mascaram esse limite com
filas privadas.

## Running Stable Fork

Quando o primary turn, um foreground subagent, uma continuação de goal ou um goal verifier está
rodando, é possível fazer fork do último trecho completed assistant de um product turn anterior
`completedSuccess`; compact continua sendo o operation lock.

O fork em execução copia apenas o transcript estável, a configuração do ponto de fork e o estado
de goal anterior ao ponto de fork; não copia queue, trabalho active/background nem inbox de
continuação, não rewinda o workspace compartilhado, e a sessão pai segue rodando como está. Um
retry do mesmo `sourceCommandId` devolve o mesmo child. O comportamento existente de checkpoint de
workspace completed/idle não é ampliado nesta rodada.

## Current Implementation Boundaries

Pontos de implementação principais:

- `packages/desktop/src/main/webRemoteControlSharedHostAttachments.ts`: o celular se anexa a um
  host já existente.
- `packages/desktop/src/host/windowRemoteConnectionRegistry.ts`: autoridade para conexão/logical
  session remota dentro da janela.
- `packages/desktop/src/host/windowHostAttachmentRegistry.ts`: clientMode confiável e ciclo de vida
  do attachment com escopo.
- `packages/desktop/src/main/taskRealtimeBus.ts`: owner lease, stale-run e roteamento entre hosts.
- `packages/shared/src/zcode-protocol-v4/`: wire, topics, commands e schema de runtime do V4.
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/`: gateway, publisher, projection e
  CommandInbox.
- `packages/services/src/zcode-agent/`: facade de serviço V4 com escopo de conexão.
- `packages/ui/src/v4/`: aplicação do owned subscription no cliente, reconciliação de
  pending-command e projection store.

relay/main não podem ganhar novo estado de negócio de session/task stream, queue, snapshot ou
fork; esses estados precisam ser recuperáveis a partir da projection/event log do CLI e da busca de
commands.

### 2026-09 Navegação de catálogo de projetos virtuais

Na Web, a última posição de navegação é separada do estado real de visualização: `mobileViewState` continua servindo para a restauração, e `mobileTaskView` representa apenas o endereço completo da task exibido de fato em primeiro plano na conexão atual. Telas largas e estreitas compartilham o reporte; Home, segundo plano, rascunho, sobrescrita ou desconexão cancelam imediatamente; novos pairings e as gerações do bridge rejeitam mensagens antigas, e a reconexão exige uma nova declaração. O Main guarda apenas os fatos transitórios de conexão/visualização e os propaga, sem escrever task não lida. O writer único do desktop base trata os eventos de conclusão e de visualização pelo endereço completo, convergindo pelo CAS do marker do tasks-index original; o contrato detalhado está em `../task-list-refresh-semantics.md`, no estado de visualização real da Web conectada.

O catálogo da barra lateral do bridge replayable remoto usa o grupo de serviços de catálogo da janela negociado explicitamente (`window-project`, `window-remote-projects` e o `window-project-changes` somente leitura). O owner de negócio continua sendo o mesmo Window Host; os canais originais de project/broadcast do workspace continuam pertencendo ao Source. O consumidor do catálogo seleciona leitura, escrita e eventos de mudança ao mesmo tempo, e não usa o catálogo da janela para substituir os serviços de workspace de arquivos, configuração e menções. A ausência do grupo de capacidades mantém o caminho antigo do lado; a falha de prontidão depois de declarar suporte é reportada explicitamente. Essa capacidade não adiciona attachment, cópia de estado em tempo real nem Agent. O contrato completo está em `wide-screen-task-list.md`, na fronteira atual do catálogo de projetos.

O home do celular reaproveita o ProjectSidebar e lê o conjunto de linhas de projetos do Host pelo base attachment atual; o shell do celular possui apenas os estados home/chat e de retorno do navegador. `workspace-bridge-open.project` é uma intenção estrita de projectId/hostId, encaminhada pelo main ao ProjectService do Host da janela para preparar o catálogo de execução. Ela permite criar ou reaproveitar o escopo lógico do catálogo em um Source físico já online, e não permite criar implicitamente uma nova conexão física, Host ou Agent. A geração dos membros da conexão, a entrada do projeto e o objeto da conexão física são verificados antes e depois da preparação; o main guarda apenas a promise RPC da navegação atual, e um retry com a mesma identidade de bridge não realoca o catálogo, enquanto cancelamento, fechamento da janela ou navegação posterior invalidam os resultados atrasados.

Depois que o Host retorna workspaceIdentity, remoteSessionId e cwd confiáveis, o bridge replayable do celular é estabelecido pelo shared-host attachment original. Projeto/provider/entrada inicial são passados apenas na entrega do Root da Web, e o main não guarda rascunho nem estado de negócio de task. O continuous direto do desktop, a restauração snapshot/gap do celular e as regras de owner/lease e de fila única do CLI CommandInbox permanecem inalteradas.

O rascunho de projeto não submetido no celular reaproveita a persistência existente do composer no Renderer: um projectId opcional é salvo no scope `__draft__` por workspaceKey e restaurado junto com o corpo e o modelo. A reconstrução do Root ou o reload da página restaura essa escolha antes do prewarm; um rascunho novo e não classificado grava NULL, e uma abertura histórica com taskId explícito tem prioridade. Depois de virar uma task persistente, o projectId não é copiado para o scope do composer da sessão; a posse das tasks já submetidas continua sendo exclusiva da biblioteca de apps do Host. Nem main, nem relay, nem shared-host transport mantêm esse rascunho.
