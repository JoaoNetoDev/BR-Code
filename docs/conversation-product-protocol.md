# Protocolo de Produto de Sessão de Conversa (spec atual)

Data de atualização: 2026-07-15

Este documento é o protocolo de produto atual da conversation V4. O schema tem como
autoridade `packages/shared/src/zcode-protocol-v4/`, as arbitragens e projeções do CLI têm
como autoridade `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/`, e o consumo
pela UI tem como autoridade `packages/ui/src/v4/`. O antigo `@zcode/protocol`, o legacy task
stream e o renderer conversation reducer existem apenas em documentos históricos ou camadas de
compatibilidade e não podem sobrepor a semântica deste documento.

Objetivo: definir o comportamento de produto da conversation session como um protocolo estável,
para que produto, desenvolvimento, QA e E2E discutam estado, ações, arbitragens, efeitos
colaterais e evidências com a mesma linguagem. Este documento define apenas a camada de
protocolo, não-expande a rule table completa e não declara a cobertura de automação como
concluída.

Este documento prioriza integrar a semântica comum dos documentos existentes; caso já exista
conflito entre documentos existentes, este documento não escolhe um lado silenciosamente, mas
coloca o item em "fronteiras pendentes de confirmação". Após a confirmação, o resultado é
escrito de volta na rule table, no case catalog e na coverage matrix.

## Documentos de Origem

| Documento | Responsabilidade atual |
| --- | --- |
| [conversation-protocol-declaration.md](./conversation-protocol-declaration.md) | Terminologia e histórico de arbitragem antes da V4; em caso de conflito não serve de base para a implementação atual |
| [conversation-product-state-space.md](./conversation-product-state-space.md) | Espaço de estados e método de poda por guard; os campos concretos seguem o schema da V4 |
| [conversation-session-case-catalog.md](./conversation-session-case-catalog.md) | Case catalog existente em linguagem natural, contendo os cases accepted, undefined e de extensão atuais |
| [testing/conversation-session-e2e-coverage-matrix.md](./testing/conversation-session-e2e-coverage-matrix.md) | Matriz de cobertura de automação; descreve apenas o estado das evidências e não é a primeira fonte da semântica de produto |
| [testing/conversation-session-compact-decision-worksheet.md](./testing/conversation-session-compact-decision-worksheet.md) | Ficha de decisão para falhas de compact e pendingAction |
| [testing/conversation-session-fork-cross-product-matrix.md](./testing/conversation-session-fork-cross-product-matrix.md) | Matriz específica de fork, convergindo se é possível fazer fork, fronteiras de histórico e herança de estado futuro |
| `packages/shared/src/validationAppSettings.ts` | Validação e valor padrão do app setting `zcodeInteractionBehavior = queue | guide` |
| `packages/shared/src/zcode-protocol-v4/` | Schema atual de command, snapshot, delta, topic e ACK |
| `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/` | Fonte de fatos atual para command inbox, guard, projection, publicação de topic e recuperação |
| `packages/ui/src/v4/ConversationComposer.tsx`, `conversationStatusPanelModel.ts`, `SessionPane.tsx` | Controle do composer, painel de parada/status, despacho de comandos e lógica de consumo de projection |
| `packages/formal-proof/src/model.ts` | Protótipo atual do enumerador formal, como referência para a execucibilidade do protocolo |

## Forma do Protocolo

O protocolo de comportamento da conversation session é definido pela seguinte função de
arbitragem:

```text
ProductContext x InputEvent x TargetObject -> Guard -> Decision -> Effect -> Evidence
```

Significado:

- `ProductContext`: contexto de produto observável pela session antes da ação do usuário.
- `InputEvent`: ação do usuário ou evento assíncrono do sistema.
- `TargetObject`: objeto sobre o qual a ação incide, como composer, queue item, assistant turn, user query.
- `Guard`: regra de produto ou condição de poda atingida pela combinação atual.
- `Decision`: resultado da arbitragem de produto.
- `Effect`: transição de estado, alteração de dados, feedback de UI e efeitos colaterais proibidos.
- `Evidence`: sinais de UI, store, protocol, network, file ou log que provam a correção da arbitragem.

O protocolo não é um diagrama de fluxo linear. No GUI o próximo passo do usuário é imprevisível,
por isso primeiro enumeram-se as combinações candidatas e só então a arbitragem ocorre pelo guard.
O case catalog e o E2E só podem derivar de guards/efeitos já confirmados, não podem substituir o
protocolo de produto.

## Posse de Estado e Projection de Produto

O estado central de produto da conversation já tem como fonte de verdade posterior o
CLI / agent runtime: canonical transcript, runtime work, command inbox e conversation product
projection; a UI mantém apenas o estado de interação local que não pode ser posterizado ou que
precisa responder imediatamente.

O projection aqui não é um "GUI virtual" nem estado de DOM. É a visão de produto de conversation
que o CLI/runtime entrega ao renderer/web depois de normalizar transcript, runtime facts e guards
de produto. Ele responde "o que é este turno, onde a timeline vai, quais ações estão disponíveis,
se a session terminou, como a entrada deve ser roteada", e não responde "qual painel está aberto,
onde está a barra de rolagem, sobre quem o mouse está".

```text
CLI / agent runtime
|-- canonical transcript
|   |-- messages[]
|   `-- parts[]
|-- runtime facts
|   |-- activeWorks[]
|   |-- backgroundWorks[]
|   |-- pending permissions / elicitations
|   `-- active turn / compact / goal / fork facts
|-- command inbox
|   |-- accepted commands
|   |-- running commands
|   `-- failed / rejected / duplicate commands
`-- conversation product projection
    |-- turns[]
    |-- rows[]
    |-- timeline events
    |-- action availability
    |-- input routing
    `-- session control
          |
          | @zcode/shared/zcode-protocol-v4 semantics
          v
Host / service
|-- trusted connection context
|-- owned-subscription routing
|-- owner / lease / stale-run routing
|-- continuous / replayable recovery facade
|-- latest projection cache (soft state)
`-- no new conversation semantics
          |
          | @zcode/rpc transport
          v
Renderer / Web UI
|-- render projection
|-- send user intents as commands
|-- optimistic overlay before ACK
`-- local-only UI state
```

O schema atual de conversation está no módulo `zcode-protocol-v4` de `@zcode/shared`. O antigo
`packages/shared/src/zcode-protocol/index.ts` ainda atende a superfície de compatibilidade não-V4,
mas não é novo ponto de entrada da semântica de produto de conversation V4. `@zcode/rpc` é
responsável apenas por channel, call/listen, request/response, conexão, logs e telemetria e não
possui a semântica de produto da conversation. `productTurnId`, phase, actions, inputRouting,
revision, seq e command ACK pertencem ao protocol/projection V4 e não ao RPC.

| Camada | O que deve possuir | O que não deve possuir |
| --- | --- | --- |
| CLI / agent runtime | transcript, identidade de turn/runtime, active/background work, command guard, conversation projection | DOM, scroll, hover, abertura de painel |
| Host / service | contexto de conexão confiável, roteamento de owned subscription, owner/lease, recuperação continuous/replayable, cache de projection | novas ou modificadas arbitragens de produto de conversation, segunda fila de conversation |
| Renderer / Web UI | draft, cursor, scroll, hover, focus, painel aberto, overlay otimista pending/stopping | fatos de agrupamento de turno, atribuição de timeline, session endedness, disponibilidade de ações |

### Forma do Projection

O Conversation Product Projection já é a entrada autoritativa da UI. Nova semântica de produto
deve recair prioritariamente no projection, e não ser inferida no renderer pela posição do array
de mensagens e flags locais.

```ts
interface ConversationProductProjection {
  projectionVersion: number;
  revision: number;
  eventSeq: number;
  generatedAt: number;
  session: ConversationSessionProjection;
  turns: ConversationTurnProjection[];
  rows: ConversationRowProjection[];
  activeWorks: ConversationActiveWork[];
  backgroundWorks: ConversationBackgroundWork[];
  queue: ConversationQueueProjection;
  pendingCommands: ConversationCommandState[];
  actionAvailability: ConversationActionAvailability;
  inputRouting: ConversationInputRouting;
}
```

`rows[]` é o índice de camada de produto que resolve turnos perdidos e desalinhamentos de
timeline. A UI deve renderizar a conversation por rows, e não redescobrir as fronteiras
user/assistant/timeline a partir do `messages[]` plano. Quando dados antigos não têm âncora
forte, a camada de compatibilidade pode gerar fallback rows, mas o fallback só serve à
recuperação histórica e não pode ser protocolo para dados novos.

Os metadados de paginação também descrevem apenas o active branch atual: `totalCount` é o número
de linhas em ordem total do active branch, `firstRowId` é a primeira linha em ordem total do
active branch, e não o menor `rowId` já atribuído nesta session. A atribuição de `rowId` permanece
monotônica e após um rewind é permitido deixar buracos; quando `row.removed(fromRowId)` corta a
partir de `firstRowId` ou de posição anterior e portanto corta o active branch inteiro, o
resultado da redução deve zerar `totalCount` e esvaziar `firstRowId`, e o próximo `row.appended`
do novo branch establish um novo `firstRowId`. O "carregar mais antigo" da UI só pode significar
que existe um prefixo não carregado no active branch; é proibido interpretar branches antigos
de um armazenamento append-only ou buracos de rowId como histórico paginável.

```text
projection.rows
|-- turn:t1/input:user-msg-1
|-- turn:t1/assistant:msg-2
|-- turn:t1/worklog:compact-op-1
|-- turn:t1/post:goal-target-a-iteration-1
`-- turn:t2/assistant:msg-9              # background model-only wake independente vira turno próprio, sem row de trigger user visível
```

### Autoridade Persistente, Fatos Canônicos e Identidade Endereçável

A autoridade persistente da conversation é fixada em `message`, `part`, session metadata e goal
state; projection row, renderer store, eventStore em memória, `rowId` e ordem de DOM não são uma
segunda autoridade desses fatos. Evento live e cold hydration devem primeiro ser normalizados
para o mesmo conjunto de fatos canônicos, e só então um único resolver/materializer gera turn,
row, action e command target:

```text
live SessionEvent --------------------\
                                       +-> CanonicalFact[] -> resolver -> projection
cold message/part/session/goal facts -/
```

- Corpo já persistido, timeline, session metadata e goal seguem os fatos persistentes; o live
  apenas completa facts in-flight/efêmeros ainda não persistidos, deduplicando pela chave da
  entidade persistente.
- `rowId` só é usado para apresentação, scroll virtual e diff dentro de uma mesma
  projection/materialização; ele pode mudar após refresh, cold recovery, fork ou rewind e é
  proibido como alvo de negócio de edit/retry/fork.
- Row acionável deve carregar simultaneamente `entityId` estável e `productTurnId`; o payload
  do command endereça pela identidade estável da entidade, e o CLI gera `row.actions` e o
  command target atomicamente na mesma revision.
- A equivalência entre live e cold não compara apenas texto visível: deve comparar também a
  entidade canônica, a atribuição de turno, a disponibilidade de ações, o command target, a
  intenção de goal e o session metadata final.
- O cancelamento de requisição ao modelo causado pelo stop do usuário é `completed(interrupted)`,
  não `TurnError`. Mesmo que a assistant message de underlie tenha persistido um `error` para
  preservar informação de debug do provider, o typed cancellation code/result contido nela deve
  ser normalizado como `TurnComplete(cancelled)` no cold hydration; os erros de cancelamento
  padronizados gerados pelo próprio ZCode em dados históricos precisam de recuperação compatível.
  É proibido reconstruir o cancelamento como `phase=error` ou preencher `control.lastError` apenas
  porque existe `assistant.info.error`.
- desktop `continuous` e mobile `replayable` podem ter quadros intermediários diferentes; após a
  convergência das duas pontas, os fatos canônicos e a projection de estado final são idênticos
  campo a campo. Essa diferença de entrega não se expande em uma repetição de estados finais
  para cada case de produto.

### Modelo de Command e ACK

Ações de sessão originadas pelo Renderer/Web devem ser expressas como command intent, e não como
alteração direta de fatos locais da conversation. O CLI/runtime arbitra conforme a revision
atual do projection, o guard e a chave de idempotência, devolve o ACK e a UI converge com
projection/event posteriores. O host pode rotear commands por owner/lease, mas não pode criar uma
segunda fila de entradas aceitas fora do CLI.

```text
UI local intent
  -> command(commandId, clientId, baseRevision, type, payload)
  -> transport by @zcode/rpc
  -> host attachment injects {connectionId, trusted clientMode}
  -> guard / dedupe / enqueue / execute in CLI CommandInbox
  <- ACK accepted | rejected | stale | duplicate | failed
  -> projection revision increases
  -> UI reconciles optimistic overlay with projection
```

| ACK | Significado | Resultado na UI |
| --- | --- | --- |
| `accepted` | o command já entrou no command inbox autoritativo ou já foi executado imediatamente | mantém a exibição otimista e aguarda confirmação do projection |
| `rejected` | o guard atual rejeitou explicitamente o command | remove a exibição otimista e mostra o reason fornecido pelo protocolo |
| `stale` | o command foi baseado em projection muito antigo; é preciso atualizar antes de repetir ou deixar o usuário confirmar | busca o projection mais recente, sem replay silencioso de ações não idempotentes |
| `duplicate` | o mesmo `commandId` já foi processado | usa o resultado de processamento já existente, evitando mensagens ou stops duplicados pelo reenvio |
| `failed` | o command foi aceito mas a execução falhou | exibe o erro conforme o fault catalog e mantém estado recuperável |

Todo command que altera a conversation precisa ter identidade idempotente: `commandId`,
`clientId`, `sessionId`, `baseRevision` opcional e o alvo de negócio. O `clientMode` é injetado
de forma confiável pelo host attachment e a UI não pode escolhê-lo. No enlace web de latência de
segundos, é permitido que a UI fique stale; não se exige sincronia em tempo real de todo estado
local do renderer. A fronteira de correção é `revision + eventSeq + snapshot/projection`, que
permite reconvergir a UI ao estado autoritativo.

### Conexão, Subscription e Fronteiras de Recuperação

Janelas desktop (incluindo SSH/WSL/Docker) usam fixamente `desktop-continuous`; `/remote` no
celular e o Web remote usam fixamente `web-remote-replayable`. Os dois podem assinar a mesma
session, mas cada attachment tem um `connectionId` próprio atribuído pelo host e um registry de
subscription próprio; subscribe voltado à UI não pode sobrescrever o profile.

```text
Desktop attachment A (continuous) ── sub-a ──┐
                                             ├─> CLI 同一份 projection/event log
Mobile attachment B (replayable) ── sub-b ──┘

frame(subscriptionId=sub-a) -> only port A
frame(subscriptionId=sub-b) -> only port B
port B saturated/resync      -> 不影响 A
```

Quadros de downlink devem ser enviados apenas à porta proprietária conforme o `subscriptionId`;
é proibido fazer broadcast no workspace e deixar o cliente descartar quadros alheios. Um snapshot
substitui o conjunto inteiro; quadros atrasados com `toSeq <= localSeq` são descartados
silenciosamente; um gap dispara apenas um resync em trânsito, e um resume com nova lacuna sobe
para snapshot obrigatório. Após reconstrução de attachment ou mudança de epoch do CLI runtime, a
renovação da assinatura é automática. relay/main apenas repassa payload RPC e o sinal de nível de
conexão `saturated/drained`, e não mantém estado de negócio de conversation como session, stream,
queue ou snapshot.

Em caso de ACK perdido ou reconexão, a UI reconcilia via `commands/query` (no máximo 64 pares
`{sessionId, commandId}` por vez). O CLI procura sempre na ordem "LRU em memória -> anchor de
transcript/message -> marker de timeline -> metadata de fork child -> ledger de input descartado
-> unknown"; consultas e execuções com a mesma chave compartilham single-flight, evitando que a
janela de consulta provoque execução duplicada.

Quando o mesmo `commandId` já está em execução, tanto o duplicate request quanto `commands/query`
aguardam a mesma promise de resultado final do command em trânsito; é proibido devolver
previamente um ACK de admissão sem `result`. Seja accepted, failed ou noop no resultado final, a
promise só libera a FIFO de admissão da session depois de resolvida, e os caminhos de exceção
também precisam liberar, para evitar deadlock em commands posteriores.

```text
first request ── execute once ──> final ACK(result=child-X) ──> release session FIFO
duplicate    ── await same promise ─────────────────────────> duplicate(result=child-X)
commands/query ─ await same promise ────────────────────────> accepted(result=child-X)
```

## Contexto de Produto

### Session Phase

| Valor | Significado |
| --- | --- |
| `draft` | a session formal ainda não foi criada; o usuário ainda está digitando a primeira query |
| `prewarming` | o primeiro envio foi submetido; a session está se preparando ou o primeiro turno ainda não entrou em running estável |
| `running` | a session atual tem um active turn em foreground ou um active work bloqueante de conclusão em execução, incluindo assistant/tool/subagent em foreground/compact/goal verifier/goal continuation/turn-steer |
| `completed(success)` | todo active work bloqueante de conclusão da session atual foi encerrado normalmente e o próximo passo pode ser aceito; ainda pode haver background work pendente |
| `completed(interrupted)` | o stop do usuário ou interrupção equivalente já encerrou o active work bloqueante de conclusão e o próximo passo pode ser aceito; ainda pode haver background work pendente |
| `error` | a session entrou em estado de erro; a semântica específica de recuperação é definida pelo fault catalog |

`compacting` e `goalVerifying` não são phases de nível superior equivalentes a `running`; são
active work kinds internos a `running`. Caso este documento precise expressar esses dois
contextos mais adiante, usa `activeWork.kind=compact` e `activeWork.kind=goalVerifier`.

Não existe um estado de produto `paused` independente. Depois de interromper a geração, é
obrigatório encerrar primeiro o active work bloqueante de conclusão da session atual, e só então
entrar em `completed(interrupted)`; se houver mensagens na queue, a queue é preservada e
`autoDrain=false`. Cancelamento somente de background não é session stop.

### Active Work e Completion Gate

Se a session está concluída não pode ser decidido apenas pelo fim do stream do assistant, e sim
pelo esvaziamento do conjunto de active work bloqueante de conclusão pertencente à session. Neste
documento, `activeWork` significa por padrão o foreground work que bloqueia `sessionEnded`;
background bash e background subagent são background work pertencente à session e não bloqueiam a
conclusão da session.

Um conversation session pode ser entendido como uma pasta como a seguinte. Cada item sob
`foreground-work/` pertence ao completion gate da session atual; somente quando esse diretório
está vazio `sessionEnded` pode ser `true`. `background-work/` ainda pertence à session atual, mas
não trava a session em running.

```text
session/
|-- identity-and-config/
|   |-- sessionId
|   |-- workspace identity
|   |-- provider/model/thought config
|
|-- queue/
|   |-- deferred sendText
|   |-- deferred sendGoalCommand
|   `-- other future input allowed by guards
|
|-- foreground-work/                  # decides sessionEnded
|   |-- primary-turn/
|   |   |-- assistant/model stream
|   |   |-- tool calls and blocking requests
|   |   `-- tool results
|   |
|   |-- subagents/
|   |   `-- foreground subagent
|   |
|   |-- compact/
|   |   |-- manual compact
|   |   `-- auto compact pendingAction
|   |
|   |-- goal/
|   |   |-- goal verifier
|   |   `-- goal continuation
|   |
|   `-- turn-steer/
|       `-- guide-mode follow-up not yet drained
|
|-- background-work/                  # does not decide sessionEnded
|   |-- background bash
|   `-- background subagent
|
|-- continuation-inbox/
|   `-- backgroundResult -> synthetic user input for a future foreground run
|
`-- lifecycle/
    |-- draft
    |-- busy: prewarming/running while foreground-work/ is not empty
    `-- completed(success/interrupted) once foreground-work/ is empty
```

| Active Work Bloqueante de Conclusão | Significado | Limiar de conclusão |
| --- | --- | --- |
| `primaryTurn` | o assistant turn principal, stream de modelo, chamada de ferramenta ou requisição bloqueante disparados pela entrada atual do usuário | recebimento de conclusão normal, encerramento por falha ou encerramento interrompido por stop |
| `foregroundSubagent` | subagent derivado do turno principal que precisa ser consolidado dentro da resposta atual do assistant | sub agent em foreground concluído, falho ou encerrado por stop |
| `compact` | requisição de compactação de compact manual ou auto compact e manutenção preparatória do pendingAction | compact concluído, noop, falho ou encerrado por stop |
| `goalVerifier` | requisição de verificação de atingimento do target do goal | verifier retornando pass/notSatisfied, failed ou encerrado por stop |
| `goalContinuation` | cadeia de execução seguinte disparada automaticamente quando o goal não foi concluído | continuação concluída, entrada no próximo active work ou encerrada por stop |
| `turnSteer` | guidance seguinte submetido ao runtime em modo guide mas ainda não confirmado como drenado | confirmado pelo runtime, rejeitado, revertido para a queue ou encerrado por stop |

| Background Work | Significado | Encerramento de produto |
| --- | --- | --- |
| `backgroundBash` | bash/process work derivado do turno principal mas declarado para execução em background | não bloqueia `sessionEnded`; ao concluir produz um background result |
| `backgroundSubagent` | subagent derivado do turno principal mas declarado para execução em background | não bloqueia `sessionEnded`; ao concluir produz um background result |
| `backgroundResultContinuation` | entrada seguinte disparada quando o background result retorna à session principal | entra em `continuation-inbox`; pode iniciar um novo foreground run ou ficar na fila em estado busy/held |

`BackgroundTaskStarted/Updated/Completed` devem carregar o `taskKind: "bash" | "subagent"` já
arbitrado pelo runtime; `toolName` é mantido apenas como origem da ferramenta e para compatibilidade
com eventos antigos, e deixa de ser a autoridade de classificação de produto para novos
projections. Na compatibilidade com eventos antigos, aliases históricos como `Agent`, `Task` e
`subagent` devem ser reconhecidos pelo mesmo legacy resolver; é proibido que reducer, service e
UI mantenham cada um seu próprio julgamento por string. `backgroundWorks[].kind`, a capacidade de
cancelamento e os ícones da UI são materializados a partir desse fato canônico, garantindo
classificação final consistente entre o snapshot desktop continuous e o web replayable.

Tanto `completed(success)` quanto `completed(interrupted)` exigem `activeWork=empty` para o work
bloqueante de conclusão. Se `assistantComplete` chega e ainda há foreground subagent, compact,
goal verifier, goal continuation ou turn-steer não encerrado, a session continua busy, não pode
entrar em completed e não abre operações exclusivas de completed. Background bash/subagent não
participam desse completion gate; continuam pertencendo à session pai, mas só são expostos por
`hasBackgroundWork`, pelo background drawer ou pelo continuation inbox.

Quando o background result retorna ao main, a perspectiva do provider pode usar `role=user` como
entrada do próximo turno, mas a camada de produto/protocolo deve preservar as informações
equivalentes `origin=backgroundResult`, `backgroundSource=bash|subagent`,
`humanAuthored=false`. Não é uma query digitada pelo usuário, não pode herdar automaticamente a
semântica de entrada de edit user query nem de retry comum; se já tiver sido materializado como
transcript visível anterior ao ponto de fork, participa do fork como histórico estável comum, caso
contrário o background result pendente não é copiado para o fork child.

O retry comum deve primeiro fixar o `assistantText` mais recente de toda a timeline e só então
verificar se o mesmo product turn tem uma entrada de usuário canônica com `origin=realUser`.
Background result, goal continuation, mailbox e outros turnos model-only/synthetic, mesmo quando
se tornam o assistant mais recente, não exibem retry comum; e um assistant anterior disparado
pelo usuário real também não recupera o retry. O retry só transfere para o novo turno mais recente
depois que a próxima entrada real do usuário completar um novo assistant turn.

```text
真实用户 Q1 -> assistant A1 [retry]
                       |
                       +-- background 完成 -> synthetic wake -> assistant B1
                                                     |             |
                                                     |             +-- no retry
                                                     +-- A1 no retry（不回退复活）

真实用户 Q2 -> assistant A2 [retry]  # A2  becoming新的全时间线最新 assistant，且有 realUser cause
```

Quando o background result dispara a continuação do main, a gaveta "há quanto tempo está
trabalhando" da UI usa um novo intervalo de foreground work e não soma o tempo de espera em
background ao intervalo do assistant anterior. A percepção de produto pode ser "a session de repente
começou de novo", mas no estado é um novo foreground run disparado por background result.

`sessionBusy` neste documento significa `prewarming`, `running`, ou qualquer contexto com
`activeWork!=empty` bloqueante de conclusão. Com apenas `backgroundWork!=empty`,
`sessionBusy=false` e as operações exclusivas de completed podem abrir conforme seus guards.

### Session Endedness e Input Routing

`sessionEnded` é um valor derivado do estado de produto que responde a uma única pergunta: a
entrada atual do composer pode se tornar imediatamente o próximo active turn. Ele não redefine o
momento de disparo dos hooks de agent/runtime, nem trata algum hook como limiar de conclusão de
produto. Ele deve vir dos fatos do CLI/agent runtime ou da projeção normalizada desses fatos pelo
host/service; a UI não pode decidir sozinha apenas pelo fluxo de texto do assistant, pela barra de
timeline ou pelo estado local `streaming`.

| Veredito | Condição | Significado de produto |
| --- | --- | --- |
| `sessionEnded=false` | `prewarming`, `running`, ou qualquer `activeWork!=empty` bloqueante de conclusão | a session atual ainda não terminou; a nova entrada do composer é intenção futura e não pode iniciar diretamente um segundo active turn |
| `sessionEnded=true` | `completed(success)` ou `completed(interrupted)`, com `activeWork=empty` bloqueante de conclusão; `backgroundWork` pode estar não vazio | a session atual terminou; operações exclusivas de completed abrem e a entrada comum pode iniciar o próximo turno conforme o estado da queue |

Quando `sessionEnded=false`, o `sendText` comum vai por padrão para a queue; se estiver em
`running + followupInput.mode=guide` e satisfizer as condições de turn-steer, é submetido ao
runtime conforme as regras de guide, caso contrário volta para a queue. `sendGoalCommand` também
entra na queue, e o goal é definido ou atualizado apenas no consumo.

`/compact`, fork, edit e `sendQueuedNow` não entram automaticamente na queue por causa de
`sessionEnded=false`. Eles precisam atingir seus guards: por exemplo, `/compact` em busy continua
rejected; `sendQueuedNow` só pode parar e depois drenar em contextos que permitam explicitamente o
consumo com preempção; o fork é arbitrado conforme o assistant turn alvo ser estável e não é
rejected de forma indiscriminada só porque a session pai está em running comum. `activeWork.kind=compact`
mantém o lock de operações; `activeWork.kind=goalVerifier` não é um lock de operações independente,
mensagens comuns continuam sendo enfileiradas, e o stop pode interromper o verifier.

### Runtime Facts e Control Projection

O estado do ciclo de vida da session se divide em três camadas. A primeira são os fatos e o
product projection do CLI/agent runtime; a segunda é o transporte, o owner routing, o cache e a
recuperação replayable do host/service; a terceira é a renderização e o overlay otimista da UI.

```text
CLI / agent runtime facts + product projection
  |-- activeWorks[]                  # completion-blocking foreground work
  |-- backgroundWorks[]              # background bash/subagent, does not block sessionEnded
  |-- backgroundResult facts
  |-- activeTurnKind
  |-- activeInputId / runId
  |-- compact timeline fact
  |-- goal target / verifier / continuation fact
  |-- foreground subagent fact
  |-- background bash/subagent fact
  |-- pending requests / permissions / tool calls
  |-- sessionEnded
  |-- hasBackgroundWork
  |-- canStop
  |-- stopState: idle | stoppable | stopping
  |-- stopTargetKind
  `-- inputRouting: startNow | enqueue | guide | reject

Host / service transport and recovery layer
  |-- expose latest projection over RPC
  |-- route owner commands
  |-- preserve replayable watermarks / snapshots
  `-- cache but do not invent conversation semantics

UI
  |-- render stable stop button from canStop/stopState
  |-- route composer submit from inputRouting/sessionEnded
  |-- show detail text from stopTargetKind, not from local guessing
  `-- keep local-only draft / scroll / focus / optimistic overlay
```

A camada de fatos deve ser produzida pelo CLI/agent runtime. O host/service pode normalizar,
cachear e repassar o projection a partir do snapshot do CLI, do event stream e da recuperação de
gap replayable, mas não pode definir de forma independente novas arbitragens de produto da
conversation. A UI pode exibir um `stopping` otimista breve, mas não pode declarar a session como
encerrada; um encerramento real só ocorre quando chega `activeWorks=[]` bloqueante de conclusão ou
uma projeção equivalente `sessionEnded=true`. `backgroundWorks[]` só pode afetar o background
drawer, o continuation inbox e a entrada de cancelamento em background, e não pode voltar a
colocar `sessionEnded` como `false` por conta própria.

A camada de controle de produto existe para que a UI mantenha uma casca de interação grosseria e
estável sem perder detalhes internos:

| Campo | Valores | Significado |
| --- | --- | --- |
| `sessionEnded` | `true` / `false` | se a entrada do composer pode imediatamente se tornar o próximo active turn |
| `hasBackgroundWork` | `true` / `false` | se a session atual ainda tem background bash/subagent pendente; não decide o botão de stop principal |
| `canStop` | `true` / `false` | se a session atual possui active work bloqueante de conclusão que o stop do usuário pode encerrar |
| `stopState` | `idle`, `stoppable`, `stopping` | estado estável de exibição do botão de parada; após o clique pode entrar otimisticamente em `stopping` até a projeção autoritativa convergir |
| `stopTargetKind` | `assistant`, `tool`, `subagent`, `compact`, `goalVerifier`, `goalContinuation`, `mixed`, `unknown` | sobre qual tipo de work o stop atual atuará principalmente; afeta apenas tooltip, log, telemetria e textos de detalhe, e não decide se o botão pisca |
| `inputRouting` | `startNow`, `enqueue`, `guide`, `reject` | resumo da arbitragem de produto da entrada atual do composer, que precisa ser rastreável até um guard da rule table |

O botão de parar não deve piscar durante transições de active work como
`assistant -> compact -> goalVerifier -> goalContinuation`. Enquanto `canStop=true` ou
`stopState=stopping`, a UI mantém o mesmo botão de parada; mudanças em `stopTargetKind` só podem
atualizar tooltip/texto auxiliar, e nunca fazer o botão sumir e reaparecer.

O `stop` em si continua sendo uma ação de usuário no nível da session. Depois do clique, o
CLI/agent runtime executa com precisão conforme o active work bloqueante de conclusão atual:
assistant aborta assistant/tool/foreground subagent, compact aborta o compact, goal verifier
aborta o verifier, goal continuation aborta a continuação. Com apenas background work pendente,
o botão de parada principal da session não deve continuar visível; o cancelamento de
background bash/subagent passa pelo background task control e não altera `sessionEnded`. Se o
goal target estiver `active`, qualquer stop em foreground deve colocar o target num estado de
pausa não ativo, e só um resume explícito o reativa.

### Prioridade do Stop

`stop` é a ação de usuário de maior prioridade dentro da session. Enquanto a session atual não
estiver completed, `stop` tem prioridade sobre o drain da queue, a injeção de guide, a
continuação automática de goal, o pendingAction de compact e eventos terminais tardios do runtime.

| Cenário | Protocolo |
| --- | --- |
| `running + stop` | encerra o primary turn, as ferramentas/requisições bloqueantes, todos os foreground subagent em execução, a goal continuation, o goal verifier e o turn-steer não confirmado |
| `running + activeWork.kind=compact + stop` | encerra o compact atual; compact manual/auto não pode continuar gravando resultado bem-sucedido, e o pendingAction do auto compact não pode executar automaticamente após o stop |
| `running + activeWork.kind=goalVerifier + stop` | encerra o verifier atual; este verifier é classificado como `failed(cancelled)` e não pode mais disparar ações de pass/notSatisfied |
| `running + sendQueuedNow` | equivale a executar primeiro o `stop` de maior prioridade e, após o active work bloqueante de conclusão ser esvaziado, consumir o queue item clicado; `activeWork.kind=compact + sendQueuedNow` continua rejeitado pelo lock de operações; `activeWork.kind=goalVerifier + sendQueuedNow` pode passar pela barreira de stop e então drenar |
| `stop requested + late terminal event` | eventos de conclusão tardios de foreground subagent/compact/verifier/assistant só podem encerrar o trabalho antigo parado e não podem recolocar a session como success nem sobrescrever uma nova entrada ativa |
| `backgroundWork only + stop` | o botão de parada principal fica indisponível; se o usuário cancelar pelo background drawer, isso é cancel de background task e não equivale a session stop |

`stop` não é um queue item comum e não pode ficar na fila esperando. Na implementação pode existir
uma marcação transitória `stopRequested` ou uma exibição "stopping" na UI, mas isso não é uma
phase de produto independente; no fim só existe `completed(interrupted)` após o active work
bloqueante de conclusão ser esvaziado, `error` após uma falha explícita, ou um novo active turn
iniciado posteriormente.

### Queue

| Dimensão | Valores | Significado |
| --- | --- | --- |
| `queue.length` | `0`, `1`, `2`, `3+` | classes de equivalência de comprimento usadas na exibição do GUI e na convergência de cases |
| `queue.autoDrain` | `true`, `false` | se a cabeça da fila é consumida automaticamente após o turno atual terminar |

A queue representa intenção futura do usuário e não pertence ao histórico já concluído. Todas as
entradas vindas do desktop ou do celular, já submetidas e que não conseguem iniciar imediatamente
em busy/running, entram pelo mesmo `CommandInbox` do CLI/runtime em ordem de admissão serial no
FIFO autoritativo; a queue local do renderer desktop e a queue de commands do host runtime no
celular não são uma segunda fonte de fatos na V4. A UI mantém apenas o draft não submetido e o
overlay otimista transitório.

Cada queue item deve ser um `ConversationInputIntent` autocontido, conservando no mínimo
`sourceCommandId`, `queueItemId`, `clientId`, o kind da entrada, o texto original, attachments,
delivery/fallback, a ordem de admissão e o estado de steer/dispatch. O queue item, o evento de
drain/guided, a user row e a âncora de transcript message usam o mesmo `sourceCommandId` original;
edit, promotion ou send-now não podem trocar por um novo id do command operacional.

Por exemplo: `running + sendText` pode entrar na fila como `sendText` deferido; `running +
sendGoalCommand` pode entrar como `sendGoalCommand` deferido; `running +
sendCompactCommand/clickCompact` precisa ser rejected, e não entra na queue só porque `/compact`
também é um slash command. Para commands novos no futuro, também é obrigatório declarar
previamente na rule table se em cada estado ele é `allow`, `enqueue` ou `reject`, sem herdar
automaticamente a semântica de enfileiramento de `/goal`.

edit, compact e fork não devem reescrever o conteúdo da queue; a nova session do fork não copia a
queue do pai. É no consumo real da queue que a execução usa o contexto, o modelo e a profundidade
de pensamento mais recentes da session no momento do consumo.

`editQueueItem` modifica o item autoritativo no lugar, preservando ID, posição, attachments,
client e command de origem. `sendQueuedNow` usa `reserve -> stop barrier -> start/promote ->
remove`: só remove se o início for bem-sucedido; em timeout ou falha libera a reservation e o
item original permanece no lugar; cliques consecutivos ou competição entre pontas só podem ter um
único dono de reservation.

A queue só garante confiabilidade dentro do processo CLI atual. Após um restart do CLI runtime,
entradas admitidas pelo processo anterior que ainda não entraram no transcript vão para o discarded
ledger, e `commands/query` retorna `fault.command.inputDiscardedOnRestart` junto do `delivery`
persistente. O registry de pending-command de 24 horas da UI só cobre a janela de entrega
desconhecida (interações sensíveis guardam apenas digest): queue/guided projection liquida a
conta assim que chega; o `queue/guide` da query de restart e o `unknown` sem conclusão autoritativa
são liquidados silenciosamente sem exibir erro na UI; apenas o `startNow` que não entrou no
transcript pede ao usuário que confirme o reenvio, e é proibido recuperar ou repetir
automaticamente.

Se um background result retorna enquanto o foreground está busy, em compact, em goal verifier ou
na fase de queue held, ele precisa entrar primeiro no `continuation-inbox` ou em um queue item
deferido equivalente. Ele pode aparecer em uma requisição posterior ao provider com `role=user`,
mas queue/event precisa preservar `origin=backgroundResult`, evitando que seja tratado como
query digitada pelo usuário, que edit seja aberto indevidamente ou que o fork child o copie como
input futuro pendente.

Quando um background result realmente dispara um model-only wake, tanto live quanto cold é
obrigatório criar um `productTurnId` independente. Esse turno não tem row de trigger user visível,
apenas exibe seus próprios rows de assistant/work; é proibido uni-lo ao turno anterior de um
usuário real por causa de reuso de runtime turn, ordem de chegada ou recuperação por refresh.

### Follow-up Input Mode

`followupInput.mode` define como é tratado o conteúdo comum que o usuário continua digitando no
composer enquanto a mesma session está `running`. Não é o tipo de um queue item, e sim a estratégia
de roteamento do follow-up em running.

| Valor | Padrão | Significado |
| --- | --- | --- |
| `queue` | sim | o texto comum seguinte entra na queue autoritativa do CLI e aguarda a conclusão do active turn atual ou um `sendQueuedNow` explícito do usuário |
| `guide` | não | o texto comum seguinte que se qualifica entra como turn steering do lado do agent, como guidance seguinte do active turn atual; quando não se qualifica, volta para a queue do CLI |

O modo `guide` não significa poder reescrever a requisição in-flight já enviada ao provider. Ele só
permite submeter o input intent completo ao mecanismo de turn-steer do runtime e aguardar a
confirmação de injeção, rejeição ou reversão do runtime. Quando guide não se aplica, há
attachments, compact/verifier está busy ou o runtime rejeita o steer, é obrigatório reverter para
a queue do CLI com os campos originais. Entrada vazia, acima do limite ou reject de
admission/runtime precisa retornar `rejected/failed` explícito, para que a UI preserve o texto e
os attachments. Seja em `queue` ou `guide`, a entrada do usuário precisa ser preservada: não pode
desaparecer do composer ou de um estado transitório sem estar na queue/guided row/transcript e
sem um resultado explícito de `rejected/failed/discarded`.

Depois que o runtime confirma a injeção de um guide, o turno de produto não muda, mas o CLI deve
fechar o visual work segment anterior em `turnHeader.workSegments` e abrir um novo segment com o
ID estável da guided user. A UI exibe e recolhe "trabalhou/trabalhando" de forma independente por
segment; isso é apenas uma fronteira de área de trabalho e não muda a atribuição de
fork/retry/action do assistant final.

`followupInput.mode` só decide se, no estado comum de assistant em execução, o texto comum é
enfileirado ou tenta guide. Para contextos com `sessionEnded=false` mas sem steer possível, como
`activeWork.kind=compact` e `activeWork.kind=goalVerifier`, o guide não se aplica e tanto o texto
comum quanto `/goal` entram na queue como input deferido.

Fronteiras já confirmadas:

| Cenário | Protocolo |
| --- | --- |
| `running + followupInput.mode=queue + sendText` | entra na fila como `sendText` deferido, sem interromper o active turn atual |
| `running + followupInput.mode=queue + sendGoalCommand` | entra como `sendGoalCommand` deferido; no consumo o goal é definido ou atualizado |
| `running + followupInput.mode=guide + sendText + guide eligible` | entra em estado turn-steer submitting/queued, ou é projetado como guided user message após confirmação do runtime |
| `running + followupInput.mode=guide + sendText + guide ineligible` | reverte para um queue item `sendText` deferido |
| `running + followupInput.mode=guide + sendGoalCommand` | continua seguindo as regras de estado de `sendGoalCommand`; a semântica atual é entrar como `sendGoalCommand` deferido, a menos que a rule table passe a aceitar explicitamente goal steering |
| `activeWork.kind=compact/goalVerifier + sendText/sendGoalCommand` | entra como input deferido, não inicia novo turno e não interrompe o active work atual |
| `running + sendCompactCommand/clickCompact` | não é afetado pelo modo follow-up, é sempre rejected, não entra na fila, não vira mensagem comum e não inicia compact |
| `sendQueuedNow` | é uma ação explícita de consumo com preempção da queue, que a UI em chinês pode chamar de "立即引导"; não equivale a `followupInput.mode=guide` |

### Compact

| Dimensão | Valores | Significado |
| --- | --- | --- |
| `compact.origin` | `manual`, `auto` | disparado pelo usuário ou pela manutenção preparatória do sistema |
| `compact.memory` | `never`, `compactable`, `justCompacted`, `notNeeded` | se o contexto atual precisa ou pode continuar a compactação |
| `compact.canCompactAgain` | `true`, `false` | se, logo após um compact, compactar de novo ainda pode produzir uma compactação efetiva |
| `compact.pendingAction` | envio comum, queue item, goal enfileirado, rerun de edit etc. | ação a continuar após um auto compact bem-sucedido |

O auto compact é um passo de manutenção preparatória inserido pelo sistema e não ocupa a queue do
usuário. Ele gira em torno de um `pendingAction`; após o sucesso continua com o `pendingAction`.
Depois que o auto compact é interrompido por stop, ele não pode continuar executando o
`pendingAction`; se o `pendingAction` volta para a queue held, se é mantido aguardando confirmação
do usuário ou se é descartado continua sendo confirmado pelo compact decision worksheet.

### Goal

| Valor | Significado |
| --- | --- |
| `none` | a session atual não tem goal target |
| `active` | a session atual tem um target não concluído |
| `verifying` | o verifier está julgando se o target foi atingido |
| `verified` | o verifier julgou que foi atingido |
| `notSatisfied` | o verifier concluiu normalmente, mas julgou que o target atual ainda não foi atingido |
| `failed` | o verifier foi cancelado no meio, a interface falhou, houve timeout ou exceção interna, e não produziu um julgamento válido de atingimento |

`notSatisfied` e `failed` precisam ser separados. `notSatisfied` é uma conclusão válida de
verificação e indica que o objetivo ainda não foi concluído, permitindo continuar a execução
automática, aguardar entrada do usuário ou tratar a queue conforme as regras de goal; `failed`
indica que o processo de verificação falhou, ou seja, este verifier não teve conclusão confiável
e não pode ser tratado como julgamento de negócio de "objetivo não concluído".

`/goal xxx` significa definir ou atualizar o goal da session. Sem goal, é definição; com goal
existente, é atualização. Um `/goal` em running é intenção futura e deve entrar na queue, e o
goal é definido ou atualizado apenas no consumo.

O fato de lifecycle/state `goalSet` atualiza apenas o estado do goal e não gera isoladamente um
marker/row de timeline; ele e o goal input submetido pelo usuário são dois fatos diferentes. Cada
goal input de usuário aceito e materializado precisa gerar uma real-user row canônica e visível,
usando a action/target unificada `editUserQuery` assim como uma query de texto comum. Apenas o
latest real-user input do active branch atual é editável; quando ele é um goal input, o
`entityId/productTurnId` estável precisa ser usado para voltar ao
`ConversationInputIntent(kind=goal)` original, e o reenvio continua roteado como
`sendGoalCommand`, sem degenerar em `sendText` comum. A cold recovery do estado do goal tem como
autoridade o fato de goal persistente e não pode ser deduzida apenas do texto visível `/goal`.

### Fork

Fork deriva uma child session a partir de um assistant turn estável da session pai. Não é uma
cópia do estado atual da janela, nem uma cópia da fila de ações futuras do pai ou do live
background work. A session pai pode estar executando um novo foreground turn ou background work;
desde que o alvo do fork já seja um histórico de assistant estável, o fork é possível.

| Dimensão | Protocolo |
| --- | --- |
| `fork.sourceSession` | a session pai que disparou o fork |
| `fork.target` | precisa ser o último segmento completed assistant de um product turn `completedSuccess`; partial de streaming/interrupted/failed atual e segmentos intermediários de assistant não são alvos de fork |
| `fork.historyBoundary` | o único resolver do CLI retorna fixamente turnId, messageIds ordenados e boundaryMessageId; a child herda apenas o transcript estável até a fronteira e antes dela |
| `fork.configSnapshot` | a child herda a configuração de provider, model e profundidade de pensamento persistida no ponto do fork, e não lê a configuração posterior da session pai no momento do fork |
| `fork.goalSnapshot` | a child herda o goal target, a iteração e a timeline do verifier anteriores ao ponto do fork |
| `fork.queuePolicy` | a queue do pai é preservada; a queue da child fica vazia |
| `fork.backgroundPolicy` | o live background bash/subagent da session pai, o background result pendente e o continuation inbox não são copiados para a child; só o background result já materializado como transcript estável antes do ponto do fork é copiado junto do histórico |
| `fork.workspacePolicy` | um fork em running copia apenas a conversa e não faz rewind do workspace compartilhado; o comportamento de checkpoint existente para completed/idle não é ampliado nesta rodada |
| `fork.timeline` | o fork notice é uma fronteira de turno, não entra no histórico de trabalho do assistant e não é recolhido pelo "já trabalhou" |

A permissão de fork é arbitrada pelo critério "o histórico é estável":

| Pré-condição | Alvo | Decision | Explicação |
| --- | --- | --- | --- |
| `completed(success)` ou `completed(interrupted)` | assistant message/turn | `allow` | cria a child session herdando o histórico anterior ao ponto do fork e a configuração persistida no ponto do fork |
| `running + activeWork.kind=primaryTurn/foregroundSubagent/goalContinuation/turnSteer` | assistant message/turn histórico estável | `allow` | o fato de a session pai estar rodando não significa que o alvo do fork é instável; a child herda apenas o histórico anterior ao ponto do fork e não copia o active work atual |
| `backgroundWork!=empty`, independentemente de a session pai estar completed ou não | assistant message/turn estável | `allow` | background bash/subagent não bloqueia o fork; handles de background live e results pendentes continuam pertencendo apenas à session pai |
| `prewarming` e sem assistant target estável | qualquer assistant message/turn | `reject` | ainda não existe histórico de assistant estável que sirva de fronteira de fork |
| `activeWork.kind=compact` | qualquer assistant message/turn | `reject` | o compact está reescrevendo/ mantecendo a fronteira de contexto e não pode criar uma child ao mesmo tempo |
| `activeWork.kind=goalVerifier` | assistant message/turn estável | `allow` | o verifier em execução não significa que o alvo histórico é instável; a child herda apenas o histórico estável anterior ao ponto do fork e não copia o verifier nem o goal loop posterior |
| qualquer estado | partial de assistant em streaming | `reject` | o partial ainda não é uma fronteira estável de transcript e não pode servir de ponto de fork |
| `error` ou partial failed/error sem ter formado o estado final de produto `completed(interrupted)` | assistant partial | `reject` | o histórico de partial é instável e não pode servir de ponto de fork |
| qualquer estado | user message, tool message, timeline marker | `reject` ou entrada inexistente | o ponto de fork só é definido sobre assistant message/turn |

A session pai continua seguindo sua própria queue, goal, config, foreground/background work e
estado de execução, sem ser afetada pela child session. Um fork em running não passa pela legacy
bridge que exige idle, e também não restaura, reverte ou copia checkpoint do workspace
compartilhado; a child recebe apenas o transcript estável, a configuração persistida no ponto do
fork e o estado do goal anterior ao ponto do fork. As requisições posteriores da child session usam
a config snapshot do ponto do fork e depois evoluem conforme as próprias mudanças de config da
child. Se o background bash/subagent do pai retornar depois do fork, ele só pode despertar a
session pai; não pode chamar a child nem gerar synthetic user input na child.

Dados novos seguem a âncora de turno persistida; o transcript antigo só permite fallback quando a
fronteira lógica de turno é inequívoca, caso contrário retorna `guard.forkTargetAmbiguous`. Um
turn que contém chamadas de ferramenta copia, pelo limite lógico, os blocos de ferramenta, os
resultados de ferramenta, o assistant final e os fatos de arquivo já produzidos nesse turn; não
basta truncar pelo último raw assistant. Uma repetição com o mesmo `sourceCommandId` precisa
retornar a mesma child.

A criação de um fork estável é uma operação de persistência atômica: session metadata da child,
message/part copiados, goal snapshot/entrada do verifier, proveniência do fork, âncoras
necessárias à projection da child, admissão do initial input da child e o fato do command aceito
do pai precisam ter sucesso todos na mesma transação antes de a child ser registrada/iniciada.
Esse bundle serve apenas ao fork explícito; um edit coberto por compact faz branch cut na session
original e não cria uma child oculta. Todas as referências child-local de
message/part/tool/timeline/compact/goal precisam ser reescritas como entidades da child pela
mesma tabela de mapeamento; apenas `originRef`/proveniência explícita pode continuar apontando
para o pai. Qualquer referência child-local que não possa ser resolvida ou remapeada faz o fork
falhar sem publicar uma child pela metade, e não pode ser corrigida por fallback do renderer.
Se, após a transação, a inicialização do runtime da child falhar, o ACK de edit do pai e o
`commands/query` permanecem accepted/apontando para a mesma child; o initial input da child
precisa ser persistido como `failed(fault.command.childStartFailed)` e produzir na projection da
child um `TurnError` recuperável, e no restart esse estado final failed não pode ser reescrito
novamente como discarded.

`ForkIdentityMap` pré-aloca de uma só vez, antes da transação, a identidade de
session/message/part/tool-call/turn/product-turn/goal-target/verifier-entry/verification; o fork
estável serve apenas ao `forkAssistant` explícito e não pode ser reutilizado implicitamente por
edit/retry.

Message parent, `MessageInfo.anchor`, referências de timeline/compact, referências de
goal/verifier e o fork notice só podem consumir essa map. O legacy workspace fork pode manter a
política de checkpoint original, mas a entrada V4 não pode chamar o caminho de compatibilidade que
cria child-only metadata ou que copia/insere goal/facts item a item.

Essa atomicidade não amplia a semântica de rewind do workspace: um fork estável em running é
apenas de conversa e não restaura checkpoint do workspace compartilhado; o comportamento de
checkpoint existente para fork completed/idle não muda nesta rodada.

### Edit e Retry

- O `editUserQuery` unificado só permite a última entrada real do usuário
  (`humanAuthored=true`) do active branch atual; ela pode ser uma query de texto comum ou um goal
  input submetido pelo usuário. Entradas reais de usuário mais antigas, resultados
  synthetic/model-only/background, assistant, tool e timeline não oferecem edit.
- O latest real-user input, independentemente de já ter sido coberto por um compact summary, é
  rewindado na session original por um branch cut append-only até aquele intent e então reexecutado
  com o intent completo editado; texto continua passando por `sendText` e goal continua passando
  por `sendGoalCommand`. As mensagens/partes antigas não são fisicamente removidas, mas deixam de
  pertencer à projection ativa, ao contexto do modelo ou ao branch de cold recovery; o
  `forkAssistant` explícito é a única entrada que cria uma child.
- O branch cut precisa ser aplicado antes do escopo de compact: primeiro se obtém o `kept prefix +
  as novas mensagens após o branch cut`, e só então se escolhe, dentro desse active branch, o
  último compact boundary para construir o histórico do modelo. Todos os compact summaries
  cruzados e o estado derivado de full/microcompact ficam inválidos; o compact mais recente que
  ainda está no active branch antes do alvo é preservado.
- O conversation rewind não acrescenta um `rewind_notice` visível ao provider; o modelo só vê o
  prefixo preservado e o intent canônico substituído. A camada de persistência usa
  `branchCutAfterMessageID + branchGeneration` para identificar o novo branch e mantém
  compatibilidade com dados antigos de `createdMessageID`.
- `editUserQuery.workspaceMode=preserve|rewind` distingue "apenas resetar a conversa" de
  "conversa + arquivos". O modo combinado revalida no mesmo command e restaura checkpoints em
  ordem inversa; qualquer coisa unsafe, ignored shell, unsupported ou sem checkpoint seguro
  retorna um blocked estruturado, e arquivo, conversa e requisição ao provider permanecem
  inalterados.
- Quando o primary turn, a goal continuation ou o goal verifier está em execução, o edit do
  latest real-user input (inclusive do latest goal input) entra primeiro na stop barrier; o rewind
  na session original só é executado depois que todo o trabalho antigo bloqueante de conclusão
  chega a um estado terminal. Se a barrier falhar, não pode haver rewind, não pode ser iniciada uma
  nova intenção de text/goal, e o active work antigo, a entrada original e o branch atual precisam
  ser preservados, sem enviar a requisição editada ao provider.
- `activeWork.kind=compact` é o lock de operações do edit unificado, do fork, do retry e do
  `sendQueuedNow`; todos essas ações são rejected, e não podem parar o compact, não podem entrar
  na fila e não podem produzir efeitos colaterais parciais de command target.
- O retry precisa restaurar a partir da causa canônica do product turn alvo o
  `ConversationInputIntent` original completo (kind, text, attachments, goal intent,
  delivery/fallback e a causa de origem); é proibido remontar a requisição a partir do texto de
  usuário visível; a nova identidade de command produzida pelo command de retry não pode
  sobrescrever a causa/proveniência do intent original. Um retry-de-retry precisa reutilizar o
  `provenance.sourceCommandId/queueItemId/clientId` iniciais e não pode ser sobrescrito pela
  queue/client de um retry intermediário.
- A row action é a única fonte de elegibilidade para o handler: em running comum o edit pode
  passar pela stop barrier e o fork de histórico estável está disponível; retry e rewind de
  arquivos ficam indisponíveis em qualquer active work bloqueante de conclusão; compact como
  active work bloqueia totalmente edit/fork/retry/rewind de arquivos. O handler não pode fazer uma
  segunda arbitragem por `activeAbortController`.
- A admissão de command `startNow` precisa segurar o gate do CommandInbox da mesma session até
  que o `TurnStarted` canônico tenha sido persistido, o raw reorder buffer tenha sido drenado
  continuamente, a aplicação da projection tenha sido concluída e a mesma materialização tenha
  avançado revision, active work e row actions, antes de devolver o ACK. O input facade ver um
  evento de runtime significa apenas "notificado" e não pode servir de prova de commit da
  projection; a camada de command precisa aguardar o commit waiter, independente de conexão, por
  `{sessionId,eventId}`. Assim, mesmo com delta ainda não entregue/aplicado na UI, um retry ou
  rewind de arquivo com `baseRevision` antigo só pode retornar stale; é proibido executar
  conversation/workspace rewind na janela em que o runtime controller já está active mas a
  projection ainda está idle.
- Uma falha antes do `TurnStarted` precisa limpar primeiro o active lock do runtime, depois
  encerrar o command como failed e cancelar a admissão durável de input; é proibido retornar
  accepted deixando um ghost input sem fato canônico de usuário. Se a barreira de commit passar de
  25 segundos sem produzir `TurnStarted`, é obrigatório um abort fail-closed, limpar os locks e
  retornar uma falha explícita de timeout.
- Quando o renderer encontra erro de transporte no envio de `sendText` para cima, ele só pode
  concluir que o resultado do command é desconhecido; não pode tratar isso como "não admitido de
  forma explícita" e reenviar automaticamente com um novo command/session. É preciso preservar os
  vestígios de recuperação do commandId original e convergir via `commands/query` ou via
  queue/guide/transcript projection com o mesmo `sourceCommandId`; antes que o resultado
  autoritativo seja determinado, um único envio do usuário pode produzir no máximo um admission
  de Agent.
- Uma vez que a barreira de commit do `TurnStarted` dá timeout e o command entra em estado final
  failed/cancelled, o eventId e o sourceCommandId correspondentes precisam entrar em um estado
  terminal não committable. Mesmo que um raw reorder gap seja preenchido depois, não se deve mais
  aplicar aquele `TurnStarted` à projection canônica; caso contrário o renderer reenviaria com base
  no ACK failed, o turno antigo apareceria atrasado e a restrição de conservação de "um único
  resultado autoritativo de input por envio do usuário" seria quebrada.
- O commit waiter de event da projection precisa satisfazer: eventId já aplicado resolve com
  sucesso imediatamente; raw gap pendente não resolve com sucesso; só resolve após o seq ausente
  chegar e o drain/apply contínuo ser concluído; e projection apply error, rehydrate,
  session/gateway dispose, abort ou timeout de 25 segundos rejeitam explicitamente e limpam
  timer/listener/waiter. O point-of-no-return do timeout é determinado pelo commit real da
  projection e não pode ser marcado como committed só porque o sink do runtime já viu o evento.
- Quando um row command ou uma file changes/preview query encontra stale revision, stale epoch ou
  stale entity target, o cliente precisa disparar a recuperação/resync da projection da mesma
  subscription; a ação só pode ser submetida de novo sob a nova authority de
  revision/epoch/entity, e é proibido continuar reutilizando o target da projection antiga.
- O `accepted` do ACK de fork navega igual ao `duplicate` com resultado de child já existente; o
  ACK de edit é sempre vinculado à session atual e não navega para child. failed/rejected/stale
  não navegam; um blocked de arquivo mantém o rascunho na linha e permite degradar para
  `workspaceMode=preserve` com um novo commandId.
- A UI só consome `visibility/origin/marker/actions` do CLI. É proibido esconder action/row por
  posição no array, por `lastFlowRow` ou por texto raw de `/compact`; quando o histórico antigo não
  tem campos canônicos, a normalização é feita pela hydration do CLI.

### Objeto Alvo

| Valor | Significado |
| --- | --- |
| `composer` | o conteúdo submetido pelo campo de entrada atual |
| `queueItem` | um item do painel de queue |
| `latestUserQuery` | o latest real-user input; pode ser uma query de texto comum ou um goal input submetido pelo usuário |
| `oldUserQuery` | um real-user input histórico não latest (text/goal) |
| `latestAssistantTurn` | o assistant turn mais recente |
| `oldAssistantTurn` | um assistant turn histórico |
| `toolMessage` | bloco de ferramenta ou resultado de ferramenta |
| `timelineMarker` | marker de timeline como compact, fork, goal verification, model change etc. |

O alvo de fork só é definido sobre assistant message/turn. O alvo de edit só é definido sobre
user query. Tool message e timeline marker não oferecem entrada de fork/edit, a menos que o
protocolo os defina separadamente mais adiante.

## Eventos de Entrada

### Eventos de Usuário

| Event ID | Superfície | Payload | Alvo comum |
| --- | --- | --- | --- |
| `sendText` | composer | texto comum | `composer` |
| `sendGoalCommand` | composer ou controle de goal | `/goal xxx` ou texto de goal | `composer` |
| `sendCompactCommand` | composer | `/compact` | `composer` |
| `clickCompact` | toolbar ou action menu | intenção de compact | session atual |
| `stop` | toolbar | parar a atividade da session atual | active work da session atual |
| `forkAssistant` | turn actions | intenção de fork | assistant turn latest/old |
| `retryTurn` | entrada de compatibilidade do protocolo (oculta na UI de produto) | intenção de retry | assistant turn mais recente |
| `editUserQuery` | real-user row actions | texto de text/goal editado; preserva o kind original do intent | latest real-user input |
| `sendQueuedNow` | queue actions | id do queue item | `queueItem` |
| `editQueueItem` | queue actions | conteúdo da queue editado | `queueItem` |
| `reorderQueueItem` | queue actions | nova ordem | `queueItem` |
| `deleteQueueItem` | queue actions | id do queue item | `queueItem` |
| `switchModelConfig` | toolbar/seletor de modelo | config de provider/model/thought | session atual |

### Eventos de Sistema

| Event ID | Origem | Contextos aplicáveis |
| --- | --- | --- |
| `assistantComplete` | runtime/model stream | `running` |
| `assistantFailed` | runtime/model stream | `running` |
| `compactStarted` | runtime | compact auto/manual |
| `compactComplete` | runtime | `activeWork.kind=compact` |
| `compactNoop` | runtime | `activeWork.kind=compact` ou compact novamente após completed |
| `compactFailed` | runtime | `activeWork.kind=compact` |
| `goalVerifyStart` | goal runtime | entrada no verifier após o goal ficar active |
| `goalVerifyPass` | goal runtime | `activeWork.kind=goalVerifier` |
| `goalVerifyNotSatisfied` | goal runtime | `activeWork.kind=goalVerifier`, verifier retorna normalmente "objetivo ainda não atingido" |
| `goalVerifyFailed` | goal runtime | `activeWork.kind=goalVerifier`, verifier cancelado, falha de interface, timeout ou exceção interna |
| `foregroundSubagentStarted` | runtime/tool | `running`, sub agent em foreground derivado do primary turn |
| `foregroundSubagentComplete` | runtime/tool | `running`, encerramento do active work do foreground subagent correspondente |
| `foregroundSubagentFailed` | runtime/tool | `running`, o active work do foreground subagent correspondente falhou ou foi encerrado por stop |
| `backgroundWorkStarted` | runtime/tool | início de background bash/subagent; não bloqueia `sessionEnded` |
| `backgroundWorkComplete` | runtime/tool | conclusão de background bash/subagent; produz um background result ou um no-op |
| `backgroundWorkFailed` | runtime/tool | falha de background bash/subagent ou cancelamento em background |
| `backgroundResultQueued` | runtime/tool | o background result já entrou no continuation inbox ou na queue deferida |
| `sessionRestored` | restore/snapshot | app reload, troca de session, remote replayable |

## Tipos de Decision

| Decision | Significado | O que precisa ser explicado |
| --- | --- | --- |
| `allow` | a ação passa a valer imediatamente | o próximo estado, a requisição de protocolo gerada ou a mudança de estado local |
| `reject` | a ação foi explicitamente rejeitada | o feedback ao usuário, os efeitos colaterais proibidos e o que permanece sem mudança de estado |
| `enqueue` | a ação não executa imediatamente e entra na queue | o deferred input event, o payload, a ordem e se há autoDrain |
| `noop` | a ação pode ser disparada, mas não muda o estado de negócio | o feedback ao usuário e por que nenhuma ação é necessária |
| `system-transition` | um evento de sistema avança o estado | a atribuição do evento, o próximo estado e se dispara ações seguintes |
| `undefined` | a semântica de produto não está definida | as perguntas a confirmar e as interpretações candidatas |
| `bug-candidate` | a implementação atual parece violar um protocolo já confirmado | o protocolo confirmado, o conflito observado e o ponto de entrada da evidência |

`reject` não é um erro genérico de fallback. Cada reject precisa declarar o feedback e os efeitos
colaterais proibidos, por exemplo "não entra na fila, não vira user message comum, não envia
requisição de compact".

`undefined` não pode virar um E2E estável. Precisa entrar no decision worksheet ou no backlog e
só depois da confirmação o resultado é escrito de volta na rule table e no case catalog.

## Invariantes Globais

Esses invariantes têm prioridade sobre qualquer case individual. Se o effect de uma rule violar um
invariante, ela deve ser marcada como `bug-candidate` ou `undefined` e não pode ser tratada como um
case accepted comum.

| Invariant ID | Descrição | Estado atual |
| --- | --- | --- |
| `sameSessionActiveTurnExclusive` | a mesma session não pode executar dois active turns ao mesmo tempo; entradas seguintes na mesma session precisam passar por queue, turn-steer ou regras explícitas de stop/drain | accepted |
| `sessionCompletionRequiresNoForegroundWork` | `completed(success/interrupted)` exige que primary turn, foreground subagent, compact, goal verifier, goal continuation e turn-steer tenham todos encerrado; background work não participa do completion gate | accepted |
| `foregroundSubagentKeepsSessionBusy` | depois que o assistant stream ou o turno principal termina localmente, enquanto houver um foreground subagent pertencente à session atual em execução, a session não pode entrar em completed | accepted |
| `backgroundWorkDoesNotBlockSessionEnd` | com background bash/subagent em execução, a session ainda pode entrar em completed depois que o foreground work é esvaziado e pode abrir as operações exclusivas de completed | accepted |
| `sessionEndedDrivesImmediateStart` | só um contexto completed com `sessionEnded=true` permite que a entrada comum do composer se torne imediatamente o próximo active turn; com `sessionEnded=false` é obrigatório acertar um guard de queue, guide, reject ou stop/drain | accepted |
| `runtimeFactsAreAuthoritative` | `sessionEnded`, `canStop`, `stopState` e `stopTargetKind` devem vir dos fatos do CLI/runtime ou da projeção normalizada do host/service; a UI não pode adivinhar apenas pelo message stream, timeline ou estado `streaming` local | accepted |
| `persistentConversationFactsAreAuthoritative` | message, part, session metadata e goal são a autoridade persistente; live/cold devem ser normalizados primeiro para os mesmos fatos canônicos e só então gerar o projection | accepted |
| `rowIdentityIsDisplayOnly` | `rowId` serve apenas para exibição; as actions e command targets de edit/retry/fork precisam estar vinculados a `entityId/productTurnId` | accepted |
| `trustedDeliveryBoundary` | desktop (incluindo SSH/WSL/Docker) é continuous fixo; mobile/Web remote é replayable fixo; o profile é injetado de forma confiável pelo host attachment e não é selecionável pela UI | accepted |
| `subscriptionOwnedByConnection` | cada conexão tem um registry de subscription próprio; o frame vai apenas para a porta proprietária e um assinante lento não pode contaminar outras conexões | accepted |
| `acceptedInputHasSingleAuthority` | todas as entradas já submetidas em busy/running em qualquer ponta entram no mesmo FIFO pela ordem de admissão do CLI; host/runtime/UI não mantêm uma segunda fila autoritativa | accepted |
| `acceptedInputAlwaysAccountedFor` | cada entrada submetida precisa estar, de forma única e exclusiva, em um destes estados: queue, guided row, transcript, rejected/failed/discarded explícito | accepted |
| `sourceCommandIdEndToEnd` | queue item, evento de drain/guided, user row, âncora de mensagem, marker e metadata de fork child preservam o sourceCommandId original | accepted |
| `restartDiscardRespectsDeliveryLifetime` | após restart do CLI, a entrada admitted incompleta é explicitamente discarded; o `queue/guide` do runtime antigo e o `unknown` sem conclusão autoritativa são liquidados silenciosamente sem erro na UI, e apenas o `startNow` que não entrou no transcript pede confirmação de reenvio, com reenvio automático proibido | accepted |
| `stopButtonStableAcrossActiveWork` | em transições entre active work como assistant, compact, goal verifier, goal continuation e foreground subagent, desde que a session ainda possa ser parada, o botão de stop da UI precisa permanecer estável e não pode pisar por causa da troca de fase interna | accepted |
| `stopPausesActiveGoalTarget` | quando o goal target está active, o stop do usuário, seja acting sobre assistant, compact, goal verifier ou goal continuation, precisa colocar o target num estado de pausa não ativo | accepted |
| `cancelledTurnColdHydrationParity` | o cancelamento typed/legacy do ZCode gerado pelo stop do usuário precisa ser reduzido como `TurnComplete(cancelled)` tanto no live quanto após o cold hydration; é proibido gerar `TurnError`, `phase=error` ou `control.lastError` | accepted |
| `followupInputModeExplicit` | uma entrada comum seguinte durante o running precisa ser arbitrada pelo modo `queue` ou `guide`; o padrão é `queue` | accepted |
| `runningPromptQueues` | com `running` e follow-up mode `queue`, o texto comum entra na queue sem interromper a requisição in-flight atual | accepted |
| `unfinishedSessionPromptQueues` | com `sessionEnded=false` e sem acertar o guide allow, o texto comum entra na queue e não inicia um segundo active turn | accepted |
| `unfinishedSessionGoalQueues` | com `sessionEnded=false`, `/goal xxx` entra na queue e define ou atualiza o goal no consumo; essa é a rule específica do `/goal` e não significa que todo command pode ser enfileirado | accepted |
| `guideModeEligibilityGuard` | o modo `guide` só vale quando as condições de turn-steer são satisfeitas; quando não são, é obrigatório reverter para a queue | accepted |
| `guideModePreservesMessage` | em modo `guide`, o texto seguinte precisa ser preservado no turn-steer/guided history ou na queue de fallback, sem perda | accepted |
| `runningCompactQueues` | em `running`, `/compact` entra no FIFO unificado como typed maintenance intent; não pode virar mensagem comum nem iniciar compact em paralelo | accepted |
| `runningStableAssistantForkAllowed` | em `running` é possível fazer fork do último segmento completed assistant de um turno `completedSuccess` mais antigo; partial de streaming/interrupted/failed e segmentos intermediários de assistant não podem ser forked | accepted |
| `latestQueryEditPreemptsActiveTurn` | apenas a última entrada real do usuário (text ou goal) pode ser editada; em running, submeter o edit equivale a parar primeiro o active work atual e reexecutar a partir daquela entrada preservando o kind original do intent | accepted |
| `compactCoveredLatestEditRewindsInPlace` | quando o latest real-user input já foi coberto por um compact summary estável, a session original faz branch cut append-only, reseta o estado derivado de compact atravessado e reproduz com o kind original; não cria child nem acrescenta lembrete de rewind | accepted |
| `latestAssistantRetryOnly` | a capacidade de baixo nível primeiro fixa a última row `assistantText` de toda a timeline na projection atual e depois exige que o mesmo product turn tenha uma entrada de usuário canônica com `origin=realUser`; turnos synthetic como background result/goal continuation/mailbox e turnos anteriores de usuários reais não obtêm a capacidade. A UI de produto esconde uniformemente a entrada de retry de assistant comum no desktop, Web e celular, e `canRetry`/`retryTurn` permanecem apenas por compatibilidade de protocolo | accepted |
| `retryPreservesFullIntent` | o retry restaura a partir da causa canônica o kind do input, o texto, os attachments, a intenção de goal, o delivery/fallback e a causa de origem, sendo proibido reconstruir apenas a partir do texto visível | accepted |
| `goalInputUsesUnifiedEditTarget` | o lifecycle `goalSet` não produz marker; o goal input do usuário produz uma real-user row canônica visível e compartilha o target `editUserQuery` com a text query; o reenvio continua sendo `sendGoalCommand` | accepted |
| `stopHighestPriorityCancelsForegroundWork` | o stop tem a maior prioridade e precisa encerrar o primary turn, o foreground subagent, o compact, o goal verifier, a goal continuation e o turn-steer não confirmado da session atual | accepted |
| `stopEndsAsInterruptedCompleted` | depois que o stop encerra todo active work bloqueante de conclusão, a session entra em `completed(interrupted)`, e não existe estado de produto paused | accepted |
| `stopKeepsQueueAndDisablesAutoDrain` | após o stop a queue é preservada e `autoDrain=false` | accepted |
| `lateTerminalEventsAfterStopDoNotRevive` | estados terminais tardios de assistant/foreground subagent/compact/verifier após o stop não podem devolver o trabalho antigo a success nem sobrescrever uma nova entrada ativa | accepted |
| `heldQueueInputRequiresChoice` | em `completed` com held queue (queue>0 + autoDrain=false), a nova entrada do composer não entra silenciosamente na fila: o usuário escolhe entre "limpar a queue e enviar" ou "manter a queue e enviar agora" (rearbitragem de 2026-07-05, que substitui o antigo heldQueueCapturesNewInput) | accepted |
| `queueContentIndependence` | a queue é intenção futura e não fica presa a um trecho de histórico concluído; edit, compact e fork não reescrevem a queue | accepted |
| `forkAssistantOnly` | só assistant message pode ser forked; user/tool/timeline não oferecem fork | accepted |
| `forkDoesNotCopyQueue` | a nova session de fork não copia a queue do pai; a queue do pai é preservada | accepted |
| `forkStableHistoryOnly` | a child herda apenas o último segmento completed assistant de um turno `completedSuccess` e o histórico estável anterior; o running da session pai não proíbe fork automaticamente, mas o partial atual, o assistant intermediário e o lock de operação de compact não podem servir de fronteira estável de fork | accepted |
| `runningForkDoesNotRewindWorkspace` | um fork em running é apenas de conversa; não restaura checkpoint do workspace compartilhado e a session pai continua rodando; o comportamento de workspace existente para completed/idle não é ampliado | accepted |
| `forkDoesNotCopyBackgroundWork` | o fork não copia o live background bash/subagent, o background result pendente nem o continuation inbox da session pai; só copia o background result que já entrou no transcript antes do ponto do fork | accepted |
| `forkInheritsSessionFutureState` | a child herda o provider/model/profundidade de pensamento persistidos no ponto do fork e o estado do goal anterior a ele, mas não herda a config nem a queue posteriores da session pai | accepted |
| `forkTimelineIsBoundary` | o fork notice é uma fronteira de turno e não entra no recolhimento do histórico de trabalho do assistant | accepted |
| `editUserOnly` | só o latest real-user input (text query ou goal input do usuário) pode ser editado; assistant/tool/timeline não oferecem edit | accepted |
| `editKeepsQueue` | editar o latest real-user input reexecuta o branch com o kind original do intent, mas a queue é preservada como está | accepted |
| `sessionConfigScoped` | modelo, provider e profundidade de pensamento são configuração futura no nível da session e não podem vazar entre sessions | accepted |
| `queuedSubmissionPreservesSelection` | a queue guarda a Submission completa; no consumo continuam sendo usados o Provider, o Model e a profundidade de pensamento fixados no momento do enfileiramento, e a config do Provider é lida dos fatos mais recentes ao criar o Model | accepted |
| `crossSessionUnlimitedConcurrency` | sessions diferentes podem rodar realmente em paralelo, com queue/model/sidebar isolados entre si | accepted |
| `autoCompactIsSystemTurnPrefix` | o auto compact é um passo de manutenção preparatória do pendingAction e, após o sucesso, continua com o pendingAction | accepted |
| `goalVerificationOutcomeSeparation` | um veredito normal do verifier de "não atingido" precisa ser marcado como `notSatisfied`; só cancelamento, falha de interface, timeout ou exceção interna geram `failed` | accepted |
| `compactActiveWorkOperationLock` | `activeWork.kind=compact` é um estado de manutenção interno do running; texto comum e `/goal` entram na fila, e compact, fork, edit, retry e sendQueuedNow precisam ser rejected | accepted |
| `goalVerifierBusyRouting` | `activeWork.kind=goalVerifier` é um estado de verificação interno do running; texto comum, `/goal` e `/compact` entram todos como intenção futura na fila, o stop pode interromper o verifier; o edit do latest user query passa pela stop barrier e reexecuta, fork de histórico estável é permitido e sendQueuedNow passa pela stop barrier e drena | accepted |
| `backgroundWakeStartsIndependentProductTurn` | um background model-only wake cria um product turn independente tanto em live quanto em cold; não tem row de trigger user visível e não pode ser unido ao turno real de usuário anterior | accepted |
| `stableForkIsAtomicAndFullyRemapped` | o fork estável só é publicado depois que os child metadata, o histórico, o goal/provenance e todas as referências child-local foram escritos atomicamente e remapeados; na falha não sobra uma child pela metade | accepted |

## Guards Estáveis Conhecidos

Esses guards têm consenso estável nos documentos atuais e podem servir de primeira fonte para a
rule table futura.

| Guard ID | Casamento | Decision | Effect principal |
| --- | --- | --- | --- |
| `firstSend` | `draft + sendText` | `allow` | cria a session, entra na página de detalhe e a primeira user message fica visível |
| `runningPromptQueues` | `running + followupInput.mode=queue + sendText` | `enqueue` | o `sendText` deferido cresce em FIFO, sem enviar um segundo active turn da mesma session |
| `guideModeTurnSteer` | `running + followupInput.mode=guide + sendText + guide eligible` | `allow` | o texto seguinte entra no turn-steer ou em uma guided user message e não dispara um novo turno comum |
| `guideModeFallbackPreservesMessage` | `running + followupInput.mode=guide + sendText + guide ineligible` | `enqueue` | reverte para `sendText` deferido sem perder a entrada do usuário |
| `unfinishedSessionPromptQueues` | `sessionEnded=false + sendText + guide ineligible/not applicable` | `enqueue` | o `sendText` deferido cresce em FIFO, sem iniciar um segundo active turn |
| `unfinishedSessionGoalQueues` | `sessionEnded=false + sendGoalCommand` | `enqueue` | o `sendGoalCommand` deferido preserva a intenção de goal e define/atualiza o goal no consumo |
| `runningCompactQueues` | `running + sendCompactCommand/clickCompact` | `enqueue` | anexa um queue item com kind=`compact`; não vira user message comum; é executado estritamente em FIFO após o fim do trabalho atual |
| `runningStableAssistantForkAllowed` | `running + forkAssistant + stable historical assistant target` | `allow` | cria a child; o active work atual, a queue e o background work da session pai permanecem na session pai |
| `latestQueryEditPreemptsActiveTurn` | `running + editUserQuery + latest real-user input(text/goal)` | `allow` | executa primeiro a stop barrier; depois que o trabalho antigo é esvaziado, rewind e reexecuta com o kind original; se a barrier falhar, preserva o trabalho/entrada/branch antigo e não inicia text/goal |
| `compactCoveredLatestEditRewindsInPlace` | `editUserQuery + latest real-user input + coveredByStableCompact` | `allow` | branch cut append-only na session original; reseta o estado de compact/microcompact atravessado, reproduz com o kind original e não cria nem navega para child |
| `goalInputUsesUnifiedEditTarget` | `editUserQuery + latest real-user input(kind=goal)` | `allow` | rewind pelo target de entidade estável; reenvia o intent `sendGoalCommand`, a row do goal input continua visível e nenhum marker `goalSet` é gerado |
| `latestQueryEditOnly` | `editUserQuery + non-latest real-user input` | `reject` | inputs text/goal históricos não oferecem edit, evitando que o active branch retroceda a um contexto antigo |
| `latestAssistantRetryOnly` | `retryTurn + non-latest assistantText row`, ou o turno do assistant mais recente não tem entrada de usuário canônica com `origin=realUser` | `reject` | respostas históricas de assistant e turnos de resultado background/synthetic não obtêm a capacidade de retry; é proibido pular o assistant synthetic mais recente para voltar a um contexto antigo. Nenhuma capability de retry de assistant comum é renderizada como entrada de UI de produto |
| `activeWorkBlocksCompletion` | `assistantComplete + activeWork!=empty` | `system-transition` | encerra o trabalho já concluído, mas a session continua busy e não abre operações exclusivas de completed |
| `controlProjectionKeepsStopVisible` | `canStop=true OR stopState=stopping` | `system-transition` | a UI mantém o mesmo botão de parada; mudanças em `stopTargetKind` só atualizam o texto de detalhe |
| `stopBusySessionCancelsForegroundWork` | `prewarming/running/activeWork!=empty + stop` | `allow` | encerra o active work bloqueante de conclusão da session atual; ao esvaziar, entra em `completed(interrupted)`, com a queue preservada e `autoDrain=false` |
| `sendQueuedNowStopsBeforeDrain` | `running + queue>0 + sendQueuedNow` | `allow` | reserva o item alvo e executa a stop barrier; só remove se o início for bem-sucedido, e em caso de falha libera a reservation mantendo o item no lugar |
| `compactActiveWorkOperationLock` | `activeWork.kind=compact + sendCompactCommand/clickCompact/forkAssistant/editUserQuery/retryTurn/sendQueuedNow` | `reject` | está compactando; não é possível iniciar um segundo compact, nem fazer fork/edit/retry, nem precipar o drain da queue |
| `goalVerifierBusyRouting` | `activeWork.kind=goalVerifier + sendText/sendGoalCommand/sendCompactCommand` | `enqueue` | está verificando o goal; a entrada do usuário e a intenção de manutenção são salvas como typed queue item, sem iniciar um segundo active turn e sem interromper o verifier |
| `goalVerifierStopBarrierDrain` | `activeWork.kind=goalVerifier + sendQueuedNow` | `allow` | para primeiro o verifier (marker failed/cancelled, goal paused) e depois drena o item alvo conforme as regras explícitas de consumo da queue |
| `completedCanStartNextTurn` | `completed + sendText + queue=0` | `allow` | inicia imediatamente o próximo turno |
| `backgroundOnlyCompletedCanForkOrCompact` | `completed + backgroundWork!=empty + forkAssistant/clickCompact` | `allow` | o background work não bloqueia as operações exclusivas de completed; fork/compact continuam agindo apenas sobre o transcript estável |
| `heldQueueInputRequiresChoice` | `completed + queue>0 + autoDrain=false + sendText/sendGoalCommand` | `choice` | o cliente apresenta a escolha: `clearQueueAndSend` (limpar a queue e enviar) ou `keepQueueAndSend` (manter a queue e enviar agora); a repetição do command carrega a disposition escolhida |
| `manualCompact` | `completed + clickCompact/sendCompactCommand` | `allow` | entra em `running + activeWork.kind=compact` e insere o timeline de compact |
| `forkAssistantOnly` | `stable assistant target + forkAssistant` | `allow/reject` | assistant permite fork; user/tool/timeline são proibidos |
| `editUserOnly` | `editUserQuery` | `allow/reject` | o latest real-user input (text/goal) permite edit; real-user input que não é o último, assistant/tool/timeline são proibidos |
| `forkDoesNotCopyQueue` | `forkAssistant` | `allow` | a child herda o histórico estável e a configuração do ponto do fork e não copia a queue do pai |
| `forkDoesNotCopyBackgroundWork` | `forkAssistant` | `allow` | a child não copia o live background work nem o background result pendente da session pai |
| `queueContentIndependence` | `editQueueItem/reorderQueueItem/deleteQueueItem` | `allow` | altera apenas a queue e não dispara consumo |

## Fronteiras de Produto Pendentes

Os quatro limites foram todos arbitrados em 2026-07-05 (fechamento das decisões M0 do refactor
v4); esta seção preserva o registro das arbitragens. As conclusões dos subproblemas detalhados
estão em [decision-answers](./testing/conversation-session-decision-answers.md) e no compact
decision worksheet.

| Boundary ID | Conclusão da arbitragem | Origem |
| --- | --- | --- |
| `PB-COMP-FAIL-F09` | mantém completed (volta ao estado original anterior ao compact) + failed marker (com entrada de retry); a queue é preservada e não é consumida automaticamente, e autoDrain não muda; todas as operações são restauradas | compact worksheet F09.1–F09.4 |
| `PB-AUTO-COMP-FAIL-G11` | continua executando o pendingAction sem compressão (mantém running, o 4º request é o request ao modelo principal); o histórico retrying e o failed marker são preservados mas não bloqueiam; o circuit breaker passa a valer e a contagem é resetada após um compact manual bem-sucedido | compact worksheet G11.1–G11.4 |
| `PB-AUTO-COMP-STOP-G12` | idêntico ao stop comum: o pendingAction é preservado como a user message interrupted do turno atual (editável/retryable na timeline, sem copiar de volta para a queue e sem descartar); a session fica `completed(interrupted)`; o marker de compact vai para cancelled; todos os itens de queue explicitamente adicionados são preservados e não consumidos automaticamente | compact worksheet G12.1–G12.4 |
| `PB-AUTO-COMP-MODEL-N06` | troca permitida: não interrompe o compact já emitido e a config passa a valer imediatamente; a fronteira de corrida é a leitura da config snapshot mais recente no instante do consumo do pendingAction (o switchModelConfig do v4 usa revision CAS) | case catalog N06 |

## Contrato de Evidências

Cada rule ou case posterior precisa declarar ao menos uma evidência visível ao usuário e uma
evidência fora da UI.

| Camada | Uso |
| --- | --- |
| UI | a mensagem realmente vista pelo usuário, a queue, botões disabled, toast, timeline marker |
| Runtime/Store | `sessionId`, phase, queue, target, activeInputId, activeWork, backgroundWork, sessionEnded, canStop, stopState, stopTargetKind, autoDrain, model config |
| Protocol | commands de app/agent, como send, compact, goal, fork, stop, activity terminal event, runtime facts snapshot, product control projection |
| Network/SSE | requisições ao provider, requisições de compact, timing do stream, retry |
| Files | session snapshot, task index, compact summary, fork history |
| Logs | UI logger, service logger, agent log, obrigatoriamente com atribuição de case/session/input |

Para rules da classe reject, a evidência precisa provar simultaneamente que os efeitos colaterais
proibidos não ocorrem. Por exemplo, um `/compact` em running rejeitado precisa mostrar não só o
toast, mas também provar que a queue não mudou, que não houve user message comum e que nenhuma
requisição de compact foi enviada.

Para rules da classe completed, a evidência precisa provar que o active work bloqueante de
conclusão pertencente à session foi esvaziado. Por exemplo, não basta afirmar que a assistant
message aparece concluída; é preciso também provar que não há foreground subagent, goal verifier,
compact, goal continuation não encerrado ou turn-steer ainda em execução. Background
bash/subagent precisam ser provados separadamente como fato de `backgroundWork` ou pelo background
drawer; eles podem continuar pendentes, mas não podem voltar a colocar `sessionEnded` como
`false`.

Para rules da classe control projection, a evidência precisa provar que a cadeia dos fatos do
CLI/runtime até a projection do host/service e até a UI é consistente. Por exemplo, enquanto
`canStop=true` ou `stopState=stopping`, o botão de parada não pode desaparecer brevemente por
causa da troca interna de fase `assistant -> compact -> goalVerifier`; mudanças em
`stopTargetKind` só podem alterar tooltip, log ou texto auxiliar.

Para rules da classe `sessionEnded=false` com enfileiramento, a evidência precisa provar que a
entrada do usuário foi salva como queue item e que nenhuma segunda active turn foi iniciada. Se o
contexto atual for `activeWork.kind=compact` ou `activeWork.kind=goalVerifier`, é preciso também
provar que o active work de compact/verifier existente não foi interrompido e que a queue só
drena no momento posterior em que o consumo é permitido.

Para rules da classe fork, a evidência precisa provar que o alvo do fork é uma fronteira de
transcript estável do último segmento completed assistant de um product turn `completedSuccess` e
que a child não copiou a queue do pai, o live background bash/subagent, o background result
pendente nem o continuation inbox. Se a session pai ainda estiver running no momento do fork, a
evidência precisa ainda provar que o active work do pai continua pertencendo à session pai, que o
workspace compartilhado não sofreu rewind e que a child recebeu apenas o histórico estável
anterior ao ponto do fork.

Para rules da classe stop do usuário, a evidência precisa provar que o command de stop foi aplicado
a todo active work bloqueante de conclusão, especialmente incluindo o foreground subagent; quando
o goal target está active, precisa provar também que o target foi colocado em pausa; e que os
estados terminais tardios de assistant/foreground subagent/compact/verifier após o stop não
reviveram a session como success, não dispararam pendingAction e não sobrescreveram uma nova
entrada ativa. O cancelamento somente de background passa pelo background task control e não
serve como evidência de session stop.

## Próximo Passo

Se for criado um `docs/conversation-session-rule-table.md`, ele deve expandir em regras apenas os
invariantes com status `accepted` e os guards estáveis deste arquivo. Esse arquivo ainda não
existe; as fronteiras marcadas `needs-decision` entram primeiro em confirmações de pequenos lotes
e não entram como rule accepted.

<!-- SECTION-EDIT-AND-RETRY -->