# Declaração do Protocolo de Comportamento de Conversa

Objetivo: primeiro deixar claro o "protocolo de comportamento de produto de conversa" declarado, e só depois discutir as ferramentas de entrada e geração. A declaração do protocolo precisa fazer com que produto, QA e desenvolvimento alinhem a mesma semântica: como um case nasce, o que cada nó da árvore representa, quais caminhos são podados por regra de produto e quais caminhos ainda não estão bem definidos.

## Camadas do protocolo

O protocolo não é um JSON, nem um fluxograma. É uma composição de algumas camadas de semântica de produto.

| Camada           | O que declara                            | Exemplo                                                                                                    |
| ---------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Dimensão de estado | O contexto observável do produto em um dado momento | `runPhase=running`、`queue=empty`、`goal=active`                                            |
| Evento de entrada | O que o usuário ou o sistema pode fazer a seguir | Usuário digita `/compact`, o sistema retorna `assistantComplete`                                  |
| Objeto alvo      | Em qual objeto a ação incide             | latest turn、old turn、composer、goal control                                                          |
| Regra guard      | Se determinada combinação pode prosseguir | Não é possível compactar enquanto running; fork de assistant target estável enquanto running pode ser permitido |
| effect           | O resultado de produto após permitido ou recusado | enqueue、reject toast、entrar em compacting                                                          |
| Invariante       | Princípios de produto que nunca podem ser violados | Um edit durante running precisa passar antes pelo stop barrier; fork só copia histórico assistant estável, não queue/background work |
| trace case       | Um caminho revisável e conversível em teste | Given running, when `/compact`, then reject                                             |

## Tipos de nó do Trace Tree

O Trace Tree é a visão expandida do protocolo. Ele não é o protocolo em si, mas precisa expressar fielmente a semântica do protocolo.

| Tipo de nó     | Significado                       | Responsabilidade                                                            | Conversível em E2E |
| --------------- | --------------------------------- | --------------------------------------------------------------------------- | ------------------- |
| `state`         | Um snapshot do contexto de produto | Descreve o valor de todas as dimensões de estado atuais                       | Não                  |
| `candidate`     | Uma entrada candidata             | Representa a entrada de uma ação do usuário ou evento do sistema na enumeração cartesiana | Não  |
| `guard`         | A regra de produto atingida        | Diz qual regra julga esta combinação                                         | Não                  |
| `effect`        | O resultado produzido pela regra   | Descreve os efeitos colaterais e o próximo contexto após allow/reject/enqueue/system/undefined | Parcial |
| `case`          | Uma folha que precisa de revisão humana | Consolida o caminho completo, as asserções e o status de review              | Sim                  |
| `summary`       | Nó de dobra do canvas por orçamento | Apenas indica "aqui ainda há muitos nós não expandidos"                      | Não                  |

A ordem básica entre os nós:

```text
state -> candidate -> guard -> effect -> state ...
                                 |
                                 -> case
```

## Tipos de evento de entrada

Os eventos de entrada se dividem em duas categorias; não as misture.

| Tipo            | Significado                                | Exemplos                                                                                        |
| --------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `user-action`   | Comportamento de GUI disparado pelo usuário | sendText、slashCompact、setGoal、forkOld、editLatest                                          |
| `system-event`  | Eventos assíncronos de avanço do sistema   | assistantComplete、compactComplete、autoCompactNeeded                                          |

Cada evento de entrada deve declarar no mínimo:

- `id`: identificador estável, como `slashCompact`.
- `actor`: `user` ou `system`.
- `surface`: em qual entrada do produto acontece, como composer, toolbar, turn actions.
- `target`: objeto sobre o qual incide, como latest turn, old turn, current session.
- `payload class`: categoria do conteúdo de entrada, como normal text, slash command, goal text.
- `applicability`: em quais contextos este evento deve ser enumerado.

## Tipos de decision

O resultado de um `guard` precisa cair em um tipo de decision explícito.

| decision    | Significado                                    | Exemplo                                    |
| ----------- | ---------------------------------------------- | ------------------------------------------- |
| `allow`     | A ação vale imediatamente e segue para o próximo contexto | fork de old turn após completed    |
| `reject`    | A ação é recusada explicitamente, podando o caminho | `/compact` enquanto running                   |
| `enqueue`   | A ação não executa agora, mas é enfileirada   | Enviar mais texto enquanto running            |
| `system`    | Um evento de sistema avança o estado          | assistantComplete leva a completed           |
| `undefined` | A expectativa de produto não foi declarada   | Ninguém definiu aquela combinação            |

`reject` não é um fallback de erro. Precisa ter um feedback de produto explícito, como toast, disabled reason, inline error, e precisa declarar "quais efeitos colaterais não podem ocorrer".

`undefined` é a principal porta de entrada do review. Indica que o modelo enumerou uma combinação realmente possível, mas o protocolo ainda não definiu como tratá-la.

## Declaração de Command ACK

Ações de conversa disparadas pelo usuário em renderer/web não devem reescrever diretamente o estado autoritativo da conversa. Devem entrar primeiro como command intent, decididas pelo CLI/runtime conforme a projection revision atual, o guard e a chave de idempotência; o owner host é responsável apenas pelo contexto de conexão confiável, owned-subscription e roteamento owner/lease, e não deve manter uma segunda conversation queue. O ACK e a projection/event subsequente fecham a UI.

```text
user action
  -> ConversationCommand
     |-- commandId
     |-- clientId
     |-- sessionId
     |-- baseRevision?
     |-- type
     `-- payload
  -> host injects {connectionId, trusted clientMode}
  -> CLI guard / dedupe / execute
  <- CommandACK
  -> projection revision update
```

| ACK         | Significado                                                            | Efeitos colaterais que precisam ser declarados             |
| ----------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| `accepted`  | O command foi aceito pela camada autoritativa, já pode ter executado ou entrado na command queue | O command state pode ser recuperado; a UI espera o fechamento pela projection |
| `rejected`  | O guard recusou explicitamente o command                              | reason、feedback ao usuário、efeitos proibidos                 |
| `stale`     | `baseRevision` está atrasado, o estado atual pode ter mudado            | A UI deve atualizar a projection antes; ações não idempotentes não podem ser reaplicadas silenciosamente |
| `duplicate` | O mesmo `commandId` já foi processado                                 | Retorna o resultado existente, não pode executar de novo      |
| `failed`    | O command foi aceito mas falhou na execução                           | fault catalog、entrada de recuperação、se queue/command state são mantidos |

`@zcode/rpc` carrega apenas call/listen, conexão, timeout, logs e telemetria; `commandId`, `baseRevision`, `projectionRevision`, `eventSeq`, `deliveryKind`, `accepted/rejected/stale/duplicate` são semântica do conversation protocol.

Janelas desktop (incluindo SSH/WSL/Docker) são marcadas pelo host com trusted como `desktop-continuous`; `/remote` no celular e Web remote são marcados como `web-remote-replayable`. O subscribe voltado à UI não pode escolher o profile por conta própria; cada attachment tem `connectionId`, registro de subscription e ciclo de vida de limpeza próprios.

```text
desktop A / continuous ── owned sub-a ──┐
                                        ├─> one CLI projection / CommandInbox
mobile  B / replayable ── owned sub-b ──┘

sub-a frame -> port A only        sub-b overflow/resync -X-> port A
```

Em caso de ACK perdido ou de reconexão, `commands/query` consulta no máximo 64 `{sessionId, commandId}` por vez. A ordem de busca do CLI é fixa: memória LRU, transcript/message anchor, timeline marker, fork child metadata, discarded input ledger, `unknown`; consulta e execução com a mesma chave devem ser single-flight.

O shared strict schema de `turn.steerQueued` e `turn.steerDrained` precisa cobrir por completo os fatos aditivos emitidos pelo CLI runtime. O payload queued inclui `delivery`, `intent` e `toolDisallowlist` opcionais; o payload drained inclui `drainedInputs[]` opcional, em que cada item preserva `pendingInputId`, `messageId` persistido, texto e os mesmos metadados de entrega. O Agent Service não pode descartar eventos gerando `unrecognized_keys` por causa desses campos já declarados; o estado autoritativo de queue/guide continua sendo mantido apenas pelo CLI runtime.

`SessionResumed` é um limite explícito de epoch de runtime na sequência de eventos raw. O Gateway, mesmo que já detenha o publisher contínuo do runtime antigo, precisa limpar o gap pendente do epoch antigo ao receber um novo `SessionResumed` e reconstruir o cursor contínuo a partir da raw sequence desse evento. Eventos de cauda perdidos pelo runtime antigo na janela de unsubscribe/reconstrução não podem mais ser repostos, e é proibido deixar esses gaps bloqueando a autoridade de projection de `TurnStarted` do novo epoch; ao mesmo tempo, esta regra local de desktop continuous não pode substituir o protocolo de recuperação snapshot/gap do celular `web-remote-replayable`.

Para `fault.command.inputDiscardedOnRestart`, `commands/query` precisa retornar simultaneamente o `delivery=startNow|queue|guide` presente nos fatos de entrada persistidos. O ledger de recuperação de submissões do renderer cobre apenas a janela curta de "a ligação foi aceita pela camada autoritativa", e não é uma segunda queue entre runtimes: assim que um snapshot surgir com um item queue/guided de mesmo `sourceCommandId`, remova imediatamente o registro correspondente no localStorage; se o App/CLI reiniciar exatamente entre o ACK e a projection, o query retornando `queue|guide` também limpa a conta silenciosamente; quando a camada autoritativa retorna `unknown`, remova também a pista de recuperação do renderer sem exibir erro na UI. Somente `startNow` que após o reinício ainda não entrou no transcript mantém uma entrada explícita de reenvio; o replay automático é proibido.

```text
renderer pre-uplink journal
  |-- queue/guided projection -------------> settle + remove localStorage
  |-- restart query: delivery=queue|guide --> settle silently
  |-- transcript sourceCommandId ----------> settle + remove localStorage
  |-- restart query: unknown -------------> settle silently
  `-- restart query: delivery=startNow ---> show explicit resend decision
```

O aviso de recuperação é renderizado de forma fixa no conversation sticky bottom dock, reutilizando as cores padrão `surface + border + foreground`, raio, espaçamento e wrapping do error banner da área de chat; não deve usar fundo amarelo de warning nem adicionar sombra.

`v4/conversation/plans` é uma query somente leitura e sem estado que consulta, por session, o catálogo de planos vigentes: a requisição é `{ sessionId }` e a resposta é `{ plans, atSeq, atLogEpoch }`. O CLI precisa primeiro reutilizar o cold-resume/hydration da conversa para estabelecer a projection completa, e então filtrar, no branch atual, `ToolCallRow` com `toolName=ExitPlanMode`, status em `success/error/cancelled` e com corpo presente, retornando em ordem decrescente de `rowId`. Ele não pode apenas varrer a tail window do wire snapshot nem entregar ao renderer o histórico comum completo. O renderer usa `atLogEpoch` e a revision local do catálogo para descartar leituras tardias; `row.removed` precisa invalidar o catálogo antigo. Essa query é repassada pelo workspace attachment existente, a key de identidade continua sendo `workspaceIdentity?.trim() || workspacePath` e a semântica de subscription, owner, queue e snapshot/gap do desktop continuous e do web remote replayable não muda.

## Declaração de Rule

Uma rule é composta por quatro partes.

| Campo            | Função                                              |
| ---------------- | --------------------------------------------------- |
| `match.context`  | Casa o contexto de produto                          |
| `match.input`    | Casa a ação do usuário ou o evento do sistema       |
| `decision`       | allow/reject/enqueue/system/undefined               |
| `assertion`      | O resultado que o E2E precisa verificar depois     |

Exemplo:

```text
rule runningCompactQueues
when:
  context.runPhase = running
  input.id in [slashCompact, compact]
then:
  decision = enqueue
  feedback = 已加入队列
  forbidden side effects:
    - 不作为普通消息发送
    - 不打断当前 active work
    - 不在轮到该 queue item 前启动 compact
assert:
  compact queue item is visible
  sourceCommandId and FIFO position are preserved
  run remains running
```

## Declaração de invariantes

Os invariantes são princípios de produto de nível acima de uma única rule. Servem para verificar se as regras conflitam entre si e para descobrir caminhos que faltam definição.

Primeiro lote de invariantes de conversa:

| Invariante | Descrição |
| --- | --- |
| sameSessionActiveTurnExclusive | A mesma session não pode rodar duas active turn ao mesmo tempo; a concorrência acontece apenas entre sessions diferentes |
| runningStableAssistantForkAllowed | Durante running é possível fazer fork do último trecho assistant completed de um turn anterior `completedSuccess`; o partial atual streaming/interrupted/failed e os trechos assistant intermediários não podem ser forked |
| latestQueryEditPreemptsActiveTurn | Só a última real user query pode ser editada; durante running, submeter o edit equivale a parar antes o active work atual e reexecutar a partir da última query |
| latestAssistantRetryOnly | A capacidade de retry do runtime ainda bloqueia primeiro a última row `assistantText` de toda a timeline na projeção atual e só então exige que exista um canonical user input com `origin=realUser` no mesmo product turn; rodadas de resultado sintético como background result/goal continuation/mailbox e rodadas reais de usuário mais antigas não podem obter a capacidade. Decisão de produto de 2026-07-15: desktop, Web e celular ocultam de forma unificada a entrada comum de retry de assistant, mas mantêm a projeção `canRetry`, o comando `retryTurn` e o gate, para evitar que o recuo de UI se espalhe como remoção da semântica de protocolo/recuperação |
| runningPromptQueues | Com running e `followupMode=queue`, enviar mensagem comum precisa entrar na queue daquela session, sem interromper a rodada atual |
| runningGoalQueues | Durante running, enviar `/goal xxx` precisa entrar na queue daquela session e, no consumo, define ou atualiza o goal |
| acceptedInputHasSingleAuthority | Entradas busy/running já submetidas no desktop e no celular entram, pela ordem de admissão serial do CLI, em um único CommandInbox/FIFO; host e UI não mantêm uma segunda fila autoritativa |
| acceptedInputAlwaysAccountedFor | Uma entrada submetida precisa estar, e só pode estar, em um destes estados: queue, guided row, transcript, explicit rejected/failed/discarded |
| acceptedInputProjectionSilenceRecovers | Após `sendText` receber ACK `accepted` ou `duplicate`, o originador precisa aguardar o queue item de mesmo `sourceCommandId` ou a row `userInput` de real user. Se dentro de uma curta janela de carência ainda não houver nenhum fato autoritativo visível, o cliente só dispara um resync single-flight de mesma subscription da owned subscription atual; não pode fabricar row de usuário, criar queue no renderer nem reaplicar o command automaticamente. A recuperação continua ao longo do attachment confiável preservando a fronteira desktop continuous / mobile replayable; o goal state direto de `sendGoalCommand` não usa row de usuário como condição de confirmação |
| promptRequiresTextOrAttachment | Para `sendText`, `createSession.firstInput`, `createSelectionSideSession.firstInput` e `editUserQuery`, corpo e anexos válidos precisam ter pelo menos um presente; entrada de anexo comum pode usar corpo vazio, o primeiro envio do child desta feature só permite corpo não vazio, e ambos vazios devem ser explicitamente rejeitados |
| sourceCommandIdEndToEnd | queue item, evento drain/guided, user row, message anchor, marker e fork child metadata preservam o `sourceCommandId` original |
| guideDrainsAfterCompletedToolBatch | Um guide elegível pode esperar antes de a tool aparecer; só depois que todos os resultados de tools irmãs de um model step foram submetidos é que no máximo um guide é consumido inline, e o product turn continua |
| acceptedGuideStartsWorkSegment | Um guide aceito não troca o product turn, mas precisa fechar o visual work segment anterior e abrir um segmento independente de tempo/colapso com uma guided user entity; o action target final não muda |
| guideFallbackPreservesIntent | Quando o turn atual chega a um estado final sem tool batch utilizável, ou o guide não se aplica/é recusado, o mesmo intent é redirecionado no lugar para a queue comum; payload, client, IDs, admissionSeq e FIFO permanecem |
| incompleteGoalBlocksQueueDrain | O consumo automático da queue comum exige simultaneamente session ready e target inexistente ou com `target.status=complete`; target active/paused/budget_limited bloqueia todas as kinds: text, goal, compact |
| verifierFailOpenCompletesTarget | Exceções de infraestrutura do verifier, de formato de saída ou de uso indevido de tool adotam fail-open com `passed=true` e liberam a queue pelo caminho normal de target complete; é proibido adicionar um ramo de drain que contorne a atualização do target |
| verifierCancelDoesNotPass | Stop/abort manual do verifier é cancelled/failed + target paused, a queue é mantida com `autoDrain=false`; não pode ser tratado como fail-open nem como pass. Mesmo que um model provider não responda imediatamente ao `AbortSignal`, o adapter precisa encerrar imediatamente a espera local de `generateText` via corrida de abort; é proibido esperar o retorno natural do upstream para só então fechar o verifier |
| restartDiscardRespectsDeliveryLifetime | Após restart do CLI, a entrada admitted que não chegou a um estado terminal é marcada discarded; `queue/guide` pertencem ao ciclo de vida do runtime antigo e são liquidados silenciosamente conforme o delivery persistido, sem manter cópia de reenvio no renderer; `unknown` também limpa a conta em silêncio e não mostra erro na UI; apenas `startNow` que não entrou no transcript pede confirmação ao usuário, e o replay automático é proibido |
| runningCompactQueues | Durante running, `/compact` é anexado como intenção de manutenção com `kind=compact` ao FIFO do CLI; não interrompe o active work atual e não pode virar mensagem comum |
| stopEndsAsInterruptedCompleted | Depois de parar a geração não existe "estado pausado"; o turno atual termina como `completed(interrupted)` |
| stopKeepsQueueAndDisablesAutoDrain | Depois do stop, a queue é mantida como está e, por padrão, não é consumida automaticamente |
| pausedQueueInputRequiresConfirmation | Com `completed` e `queue>0` e `autoDrain=false` (fila pausada), mensagens comuns e `/goal <novo objetivo>` não entram na fila silenciosamente: o botão normal de envio é preservado e, após o submit, uma caixa de confirmação permite escolher entre "limpar a fila e enviar" ou "manter a fila e enviar agora"; `/compact` continua sendo anexado direto à fila pausada (redecisão de UI de 2026-07-15; na v4 ainda é expresso como `inputRouting.mode=choice`) |
| pausedQueueResumeDrainsFifo | O "continuar" da fila pausada é um comando de recuperação autoritativo do CLI: apenas define `autoDrain=true`; em seguida continua sujeito aos guards de session ready e `target absent/complete`. Sem target incompleto, no estado ocioso ele inicia imediatamente a partir do início da fila; no estado ocupado, apenas arma e inicia quando o active work atual fechar; quando o target não está complete, apenas arma e não consome. Satisfeitas as guards, consome automaticamente por FIFO até esvaziar; interrupções como Stop/compact falho voltam para `autoDrain=false` |
| queueContentIndependence | Mensagens da queue são intenção futura do usuário e não ficam vinculadas a nenhum trecho de histórico; editar query de histórico, compact e fork não reescrevem o conteúdo da queue |
| queuedEditRestoresComposerAfterAuthoritativeRemoval | Ao editar um queue item na UI de primeira parte, remove de forma autoritativa primeiro com `deleteQueueItem(baseRevision)`; só após `accepted/duplicate` o originator restaura idempotentemente a entrada completa no composer da session/workspace de origem; falha/noop/stale não restauram |
| compactingAcceptsFutureInput | Durante compacting, mensagens comuns e `/goal xxx` são anexados à queue |
| duplicateCompactRejected | Se a mesma session já tem compact running ou enfileirado, compactar de novo deve ser rejected, sem enfileirar duplicado |
| compactCanBeStopped | Durante compacting é permitido parar; o timeline do compact é marcado como interrupted e a session volta para `completed(interrupted)` |
| forkAssistantOnly | Só é possível fazer fork de assistant message; não de user nem de tool message |
| forkDoesNotCopyQueue | Ao fazer fork de uma nova session, a queue da session pai não é copiada |
| forkDoesNotCopyBackgroundWork | Ao fazer fork de uma nova session, não são copiados o bash/subagent de background ativo da session pai nem o resultado de background pendente |
| runningForkDoesNotRewindWorkspace | Um fork durante running copia apenas o histórico de conversa estável; não faz rewind do workspace compartilhado e a session pai continua rodando |
| editUserOnly | Só é possível editar user query; assistant e tool não podem ser editados |
| editKeepsQueue | Editar a última real user query reexecuta a partir daquele turno, mas a queue é mantida como está |
| sessionConfigScoped | Modelo e profundidade de pensamento são armazenados no nível da session; trocar para uma session histórica mostra a configuração de cada uma |
| providerRetryUsesLiveTurnTail | `control.apiRetry` é um fato de runtime em memória com escopo de session, exibido apenas no fim do turn running atual e substituindo o loading genérico; é limpo após progresso válido do modelo ou estado terminal e não é restaurado por cold start do CLI. Um child somente-leitura pode exibir esse estado, mas isso não pode abrir o comando de retry manual |
| freshSubagentInitialModelIsDurable | Um child novo persiste o modelo efetivamente resolvido `model_change(undefined -> X)` antes da primeira entrada; a primeira rodada exibe "正在使用 X" sem seta de troca e pode ser reconstruída no cold start; Main comum é silencioso na primeira rodada, resume não reescreve, child antigo não é preenchido retroativamente e a timeline pai não espelha |
| newSessionInheritsLastSelection | Uma nova session usa a tupla de configuração `provider + model + thought` que o usuário escolheu explicitamente por último e que o runtime confirmou como vigente; o thought não pode ser herdado de forma independente do seu modelo |
| draftCollaborationModeUsesRendererGlobalPreference | A memória de `build/edit/plan/yolo` só vale para rascunhos não enviados: um novo rascunho do mesmo renderer lê a preferência global do localStorage, e abrir ou trocar de uma session existente não pode reescrever essa preferência |
| queuedSubmissionPreservesSelection | O queue item salva a Submission completa; no consumo são usados o Provider, o Model e a profundidade de pensamento já fixados no momento da entrada na fila, e mudanças posteriores de Session Selection não reescrevem a intenção já enfileirada; a configuração do Provider é lida no momento da criação do Model |
| acceptedGuideSwitchesAtModelStepBoundary | Quando o guide é aceito pelo Loop atual, a entrada, a Session Selection e o Active Model seguinte valem em conjunto; requisições de modelo já despachadas continuam até o fim e o próximo model step usa a Selection do guide |
| crossSessionUnlimitedConcurrency | Sessions diferentes podem rodar com concorrência real e não há limite de concorrência na camada de produto |
| sessionResidencyTargetIsSoft | Cada CLI pode manter, com LRU, um alvo suave de sessions resident; sessions active/queued/background/pending/subscribed/operation-leased devem ter prioridade de manter viva, é permitido exceder o alvo quando há sessions protegidas, e é proibido cancelar trabalho para acomodar capacidade |
| deactivatedSessionEqualsColdSession | A evicção de uma session resident remove apenas o record/publisher/runtime da memória do CLI, sem remover a session persistente ou o índice de tasks e sem emitir `session.removed`; acessos posteriores e sessions não carregadas após o restart do CLI compartilham o cold-resume, e o renderer não recebe notificação de negócio de desativação |
| sessionContextFollowsActiveSession | Depois que o usuário troca para uma session histórica, a sidebar direita, as tasks e o contexto devem acompanhar a active session |
| autoCompactIsSystemTurnPrefix | O compact automático é um passo de manutenção prefixal inserido pelo sistema, não ocupa a queue do usuário e, após o sucesso, continua a ação que normalmente seria executada |
| cliOwnsConversationProjection | A conversation product projection é produzida pelo CLI/runtime a partir dos CLI facts; o owner host apenas mantém cache, roteia e recupera a projeção, e a UI não inventa fatos de produto com um array local de mensagens |
| productRowsRequireCompleteConsumerContract | O CLI só pode materializar um runtime fact como conversation product row quando a identidade da row, sua colocação em session/turn/tool, a posição de recuperação cold e o Renderer já formam um contrato completo. `HookRun*` projeta apenas o resumo client-safe `hookInvocation`: entra na ação de fim de turno pelo `turnId` autoritativo, e um `SessionStart` sem turnId durante o resume espera a próxima real user-intent turn; é proibido construir synthetic turn `session-hooks:*`, e um admission-only blocked não pode ser exibido como "executou". live/cold, desktop continuous, mobile replayable e Renderer precisam fechar o ciclo na mesma mudança; não basta mesclar apenas os tipos de protocolo ou o producer |
| v4ColdResumeSeparatesActivationFromProjection | A cold subscription de sessão histórica na V4 reutiliza apenas a activation do session runtime; rows/goal/plan/queue/interaction históricas e o primeiro frame vêm da materialization durável da V4 e da ProductProjection. É proibido construir um legacy snapshot completo que ninguém consome só para ativar o runtime ou ler uso; o legacy `session/resume` continua usando activation + legacy snapshot para manter a compatibilidade de resposta |
| turnIdAuthoritative | `turnId` é a identidade autoritativa de turn no CLI/runtime; `turnIndex` / `ordinal` são apenas para exibição |
| stableHistoryTargetsPreferMessageId | Operações de histórico como fork, edit, rewind e file summary preferem o `messageId` ou `turnId` estáveis; dados antigos só fazem fallback para `turnIndex` |
| timelinePlacementFromProjection | A posição na timeline precisa vir de `anchorTurnId` / `anchorMessageId` / `placement` da projeção, e não pode ser inferida do user/assistant mais próximo nem do índice do array |
| commandIdempotencyRequired | Todo command que altera a conversa precisa ter `commandId`, suportar ACK duplicate e evitar que um retry gere mensagens duplicadas ou paradas duplicadas |
| stopTargetsObservedForegroundExecution | O Stop precisa carregar o `foregroundExecutionId projetado no momento do clique; o primary turn, o goal verifier e o goal continuation dentro do mesmo command de runtime compartilham a identidade. O runtime cancela apenas a execution atual cuja identidade bate; quando a execution antiga já terminou e o sistema mudou para uma nova execution sem relação, retorna noop, para não parar a nova requisição por engano. Depois de atingir a execution, o cancelamento do trabalho ativo local não pode depender de o provider respeitar o abort; um resultado tardio do provider só pode ser descartado, sem atrasar o fechamento de UI/runtime nem ressuscitar trabalho antigo |
| trustedDeliveryBoundary | Desktop (incluindo SSH/WSL/Docker) é fixo continuous; mobile/Web remote é fixo replayable; o client não pode forjar profile |
| subscriptionOwnedByConnection | Subscription e buffer são isolados por conexão, e o frame é enviado apenas ao attachment dono; um celular lento não pode afetar o desktop |

Se o effect de uma rule violar um invariante, o Trace Tree deve gerar um `violation case`, e não um accepted case comum.

## Semântica já confirmada da área de conversa

Esta seção registra a semântica ideal de produto já confirmada, sem se basing na implementação atual de código. A enumeração de cases, a poda e a geração de E2E devem se alinhar aqui primeiro.

### Dimensões de estado

```text
session.phase =
  draft
  prewarming
  running
  completed(success)
  completed(interrupted)
  error

activeWork.kind =
  primaryTurn
  foregroundSubagent
  compact
  goalVerifier
  goalContinuation
  turnSteer

followupMode =
  queue | guide

toolResultBatch =
  none | pending | committed

queue.length =
  0 | 1 | 2 | 3+

queue.autoDrain =
  true | false

compact.origin =
  manual | auto

collaborationMode =
  build | edit | plan | yolo
```

Quando `collaborationMode=plan`, o parser de comandos de controle de goal já reconhecido pelo composer precisa ser rejeitado no limite de admissão da UI: mostrar "goal 无法在 Plan 模式下使用，请切换模式", preservar o texto original da entrada e não criar session, não enviar `sendGoalCommand` / `resumeGoal` e não escrever no histórico de prompts. Esse guard ocorre antes da promoção do draft, da queue running e da decisão da fila pausada, portanto a phase de runtime e o estado da queue não ampliam mais esta combinação.

Não existe uma phase de session `paused` independente. Depois que o usuário para a geração, o turno atual entra em `completed(interrupted)`; se ainda houver mensagens na queue, ela é mantida com `autoDrain=false`. A UI chama essa combinação de "fila pausada" e exibe uma barra de retomada acima dos itens da fila; o texto de produto não expõe mais o termo interno `held queue`.

Quando um turn principal comum entra em `error`, isso também encerra apenas o turno atual, sem desfazer as entradas subsequentes já aceitas: a queue é mantida como está e passa para `autoDrain=false`, e o motivo do aviso de pausa é marcado como erro; o usuário pode clicar em "continuar" para retomar a partir do início da fila por FIFO. O caminho de erro proíbe emitir `TurnSteerDiscarded(reason=turn_failed)` e proibe disparar auto drain em um estado terminal de erro. Esse invariante de recuperação também se aplica à admissão CLI compartilhada do desktop `desktop-continuous` e do celular `web-remote-replayable`, e este último ainda deve respeitar a fronteira de snapshot/gap do replayable.

Sequência de confirmação e recuperação da fila pausada:

```text
Stop
  -> payload.expectedForegroundExecutionId = 当前 control.activeWorks 的 executionId
  -> CLI Runtime 校验当前 execution 身份并原子标记 stopRequested
  -> 身份已切换: noop，不得取消后续无关 turn
  -> 身份匹配: abort 当前 execution
  -> completed(interrupted)
  -> queue 保留, autoDrain=false
  -> UI: 队列已暂停 [继续]

普通消息或 /goal <新目标>
  -> 打开发送确认框（草稿、附件保持原样）
  -> 清空队列: 校验确认时的 queueItemId 集合未变化 -> 清空旧队列 -> 发送当前输入
  -> 发送消息: 校验确认时的 queueItemId 集合未变化 -> 保留旧队列暂停 -> 发送当前输入

点击继续
  -> setAutoDrain(true)
  -> idle + target absent/complete: 提升当前队首
  -> target active/paused/budget_limited: 只武装，等待 target complete
  -> busy: 仅武装，当前 active work 收口后提升队首
  -> Q1 -> Q2 -> ... -> queue 为空
```

A validação do conjunto de `queueItemId` na caixa de confirmação é uma proteção de concorrência entre dispositivos: se, depois de a confirmação ser aberta, itens forem adicionados ou removidos da fila pelo desktop ou pelo celular, a confirmação original fica inválida e é preciso confirmar novamente com base na projeção mais recente; não se pode limpar junto itens de queue que o usuário não viu. Uma edição desfeita remove o `queueItemId` antigo e portanto precisa invalidar a confirmação antiga; apenas reordenar o mesmo conjunto de IDs não amplia o conjunto a ser limpo, e a execução pode prosseguir. Uma chamada de compatibilidade de baixo nível que, via `editQueueItem`, mantém os mesmos IDs no lugar também não invalida a confirmação.

`compacting` e `goalVerifying` não são phases de nível superior equivalentes a `running`. São active works internos a `running` que bloqueiam a conclusão, expressos respectivamente como `activeWork.kind=compact` e `activeWork.kind=goalVerifier`.

O compact automático roda em torno de um `pendingAction`. `pendingAction` é a ação pendente que disparou o compact automático e não necessariamente uma mensagem.

Origens típicas de `pendingAction`:

- Mensagem comum que o usuário enviou direto quando estava em `completed, queue=0`.
- A mensagem do início da fila retirada no consumo automático da queue.
- O `/goal xxx` retirado no consumo automático da queue.
- A entrada do turno que vai reexecutar após um edit de user query.

### Running

| Pré-condição                                                                                                    | Ação do usuário                           | Resultado de produto                                                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `running, followupMode=queue`                                                                                    | Enviar mensagem comum                     | Anexa à queue, sem interromper o turno atual                                                                                                                           |
| `running, followupMode=guide`, com runtime eligibility independente de modelo/provider | Enviar mensagem comum                     | A admissão é guide; aguarda o batch completo de tool result para consumir no máximo uma inline, sem iniciar um segundo turno                                          |
| `running, followupMode=guide`, já com queue comum                                       | Enviar mensagem comum                     | O guide ainda entra no active turn atual; a queue existente permanece como FIFO de turnos futuros na mesma ordem relativa e não constitui guard de fallback          |
| `running, followupMode=guide`, sem tool batch e estado final, ou sem eligibility por anexo/Stop/active work não steerável | Enviar mensagem comum                     | O mesmo intent volta para a queue no lugar; payload, IDs e FIFO de admissão são preservados; modelo/provider não podem servir de guard de fallback                          |
| `running`                                                                                                       | Enviar `/goal xxx`                        | Anexa à queue; no consumo, atualiza se já houver goal e define se não houver                                                                                            |
| `running`                                                                                                       | Enviar `/compact`                         | Anexa à queue com `kind=compact`, sem interromper o active work atual; o compact só inicia quando chegar a vez                                                        |
| `running`                                                                                                       | stop                                      | O turno atual termina como `completed(interrupted)`; a queue é mantida como está; `autoDrain=false`                                                                    |
| `running`                                                                                                       | fork de assistant estável                 | allow; o alvo precisa ser o último trecho assistant completed de um turn `completedSuccess` anterior; o child copia só o histórico de conversa estável, a session pai continua rodando e o workspace compartilhado não sofre rewind |
| `running`                                                                                                       | fork do partial assistant em streaming    | reject                                                                                                                                                              |
| `running`                                                                                                       | edit da última real user query            | Para antes o active work atual e reexecuta a partir daquela query; a queue é mantida como está e não é consumida automaticamente                                        |
| `running`                                                                                                       | edit de user query que não é a última     | reject ou entrada ausente; não pode reverter turnos históricos nem iniciar um segundo active turn                                                                       |

### Completed

| Pré-condição                                                       | Ação do usuário              | Resultado de produto                                                                                                                                        |
| ------------------------------------------------------------------ | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `completed(success), queue=0`                                      | Enviar mensagem comum        | Inicia o próximo turno imediatamente                                                                                                                         |
| `completed(interrupted), queue=0`                                  | Enviar mensagem comum        | Inicia o próximo turno imediatamente                                                                                                                         |
| `completed(interrupted), queue>0, autoDrain=false`                 | Enviar mensagem comum        | Mantém o botão normal de envio; após o submit abre a caixa de confirmação. Escolher limpar limpa a queue antiga já confirmada e envia; escolher enviar mantém a queue antiga pausada e envia |
| `completed, queue>0, autoDrain=false`                              | `/goal <novo objetivo>`      | Igual à mensagem comum: abre a caixa de confirmação e decide entre limpar/manter; comandos de controle de goal como `/goal resume` não entram nesta caixa                             |
| `completed, queue>0, autoDrain=false`                              | "Enviar agora" na fila       | Reserva o item alvo e inicia o promote; só o item é removido se o início tiver sucesso, e numa falha a reserva é liberada e o item permanece no lugar                                      |
| `completed, queue>0, autoDrain=false`                              | Desfazer edição de queue item | Com o composer vazio, apaga de forma autoritativa primeiro e só então restaura a entrada completa apenas para o originator na session/workspace de origem; não dispara consumo                 |
| `completed, queue>0, autoDrain=false`                              | Reordenar ou remover da queue | Só modifica a queue, sem disparar consumo                                                                                                                    |
| `completed, queue>0, autoDrain=false`                              | compact                     | Não abre a caixa de confirmação; anexa ao fim da fila pausada, mantendo o FIFO e sem consumo automático                                                            |
| `completed, queue>0, autoDrain=false, target absent/complete`      | Clicar em "continuar" na barra da fila | `autoDrain=true`; inicia imediatamente a partir do início e consome por FIFO até esvaziar                                                          |
| `running, queue>0, autoDrain=false, target absent/complete`        | Clicar em "continuar" na barra da fila | `autoDrain=true` e arma; não sequestra o active work atual e, ao fechar, consome por FIFO até esvaziar                                   |
| `queue>0, autoDrain=false, target active/paused/budget_limited`    | Clicar em "continuar" na barra da fila | Apenas define `autoDrain=true`; não promove o início da fila e espera o target ficar complete para então consumir por FIFO; exceto pelo `sendQueuedNow` explícito            |

### Queue

O queue item é uma intenção futura do usuário ou de manutenção e não fica vinculado a nenhum trecho de histórico. Portanto:

- Editar a última real user query não limpa a queue.
- O compact não reescreve o conteúdo da queue.
- O fork não copia a queue.
- Quando a entrada comum do usuário entra na fila, é salva a Submission completa, e o modelo e a profundidade de pensamento nela expressam a intenção do usuário daquela submissão; no consumo real só se relê a configuração mais recente do Provider e se cria o Model, sem trocar para o modelo escolhido depois pela Session.

Todas as entradas busy/running já submetidas em qualquer dispositivo entram no mesmo FIFO `CommandInbox` do CLI/runtime, e a ordem segue a admissão serial do CLI. O queue item guarda de forma autossuficiente o `sourceCommandId` original, o `queueItemId` estável, o `clientId`, a kind (`sendText` / `sendGoalCommand` / `compact`), o texto original, os attachments, o delivery, a ordem e o estado de steer/dispatch. Quando o guide não se aplica, quando há attachments, quando compact/verifier está busy ou quando o runtime recusa o steer, há fallback para a queue comum com os campos originais; quando fica vazio, quando ultrapassa o limite ou quando o runtime recusa, é preciso `rejected/failed` explícito, e a UI não pode limpar o payload antes. O consumo de `compact` precisa passar pelo ciclo de vida do compact, produzindo apenas timeline marker, sem gerar real-user row e sem entrar na semântica de transcript query/edit/retry.

A edição de queue na UI de primeira parte é fixamente `deleteQueueItem(baseRevision) -> accepted/duplicate -> local composer restore`. O payload de restauração contém a kind de entrada, o texto visível e o `AttachmentRef[]` ordenado; o texto visível de um goal é `/goal ...`, e o compact não oferece entrada. Se qualquer um entre texto do composer, attachments, contexto de página, referência de sessão ou estado de upload em andamento estiver não vazio, o desfeito é rejeitado no limite de admissão da UI e nenhum command é enviado. Durante a requisição, a row alvo e o composer ficam travados ao mesmo tempo, evitando clique duplo ou escrita de um novo rascunho antes do ACK.

O `sourceCommandId` original do desfeito é liquidado junto com a remoção da queue; reenviar é uma nova submissão do usuário, produzindo novo commandId, novo queueItemId e novo horário/ordenação de submissão. O rascunho restaurado pertence apenas ao renderer de origem, não entra em snapshot nem no estado replayable, e os outros dispositivos só veem a remoção da queue. A requisição precisa estar ligada ao sessionId do clique e a `workspaceKey = workspaceIdentity?.trim() || workspacePath`; restaurações repetidas são idempotentes e, após trocar de session/workspace, não pode haver escrita cruzada. Quando o alvo não existe, `deleteQueueItem` retorna um noop discriminável; stale/noop/rejected/failed não restauram a projeção antiga.

As referências de attachment restauradas mantêm a ordem original e todos os campos, e são marcadas como session-owned; como já foram assumidas pela session, o reenvio não pode fazer upload/adopt de novo, e remoção, restart do runtime e staged cleanup também não podem limpá-las por engano. Imagens sem object URL local degradam para mostrar o nome do arquivo e um ícone de tipo, sem estender o protocolo de download.

Guide e queue comum compartilham apenas os fatos de entrada e o FIFO de admissão, e não o gatilho de consumo:

```text
guide: tool batch committed -> drain at most one inline -> same product turn continues
queue: session ready -> target absent/complete -> promote one head item as a future turn
```

É válido enviar o guide antes de aparecer o tool call; o runtime aguarda o próximo batch completo de tool result. Uma parallel tool call precisa esperar que todos os resultados irmãos (com sucesso ou falha) virem fato antes de consumir um guide. Quando o guide é aceito, o `ModelSelection` que ele carrega se torna também a Session Selection e cria o novo Active Model no próximo model step; as requisições já despachadas antes da aceitação continuam usando o Model original. Quando o turn atual de texto puro completa, é parado ou é interrompido sem batch utilizável, o runtime precisa redirecionar a mesma Submission no lugar para a queue com um fato explícito de delivery/fallback, preservando Selection, payload, IDs e ordem de admissão; a projeção live e a cold hydration precisam concordar e não podem reentrar na fila com novos IDs.

A promoção automática da queue comum precisa julgar em cadeia as guards a seguir, tratando todas as kinds da mesma forma:

```text
head.dispatch=queued
  AND queue.autoDrain=true
  AND no active controller / session ready
  AND (target is absent OR target.status=complete)
```

Um único marker de `goal_verification completed` ou um `passed=false` não bastam para liberar a guard. Tanto o pass explícito quanto o fail-open escrevem primeiro `passed=true` e só então atualizam o target para `complete`, e só depois a promoção normal da queue é permitida. Encerrar o verifier manualmente leva a cancelled/failed + target paused e mantém a queue sem consumo automático. `sendQueuedNow` é um caminho explícito de reservation + Stop barrier e não pertence às guards de promoção automática.

O wire schema da V4 não adiciona commands. O `editQueueItem` de baixo nível continua mantido como capacidade de compatibilidade e pode atualizar no lugar preservando IDs, posição, attachments e command de origem, mas as UIs de primeira parte (desktop, Web, celular) deixam de chamá-lo. `sendQueuedNow` é fixamente `reserve -> stop barrier -> start/promote -> remove`; entre vários dispositivos só pode haver um dono da reservation.

Atomicidade de agendamento: quando a promoção automática encontra Bootstrap ou a fila foreground/runtime do Core ocupada, ela não pode reservar/parar e só reavalia quando estiver realmente ociosa; o `sendQueuedNow` explícito precisa obter, antes do Stop, uma promotion lease única dentro do processo do Core e fazer o command promovido sair antes das notificações já aguardadas, respeitando o `sourceCommandId/inputId` original. A lease não é persistida, não é projetada e não muda a fronteira de entrega entre desktop continuous e mobile replayable.

A queue só é confiável dentro do processo CLI atual. Após o restart do CLI, a entrada admitted que não entrou em transcript/estado terminal vai para o discarded ledger, e `commands/query` retorna `fault.command.inputDiscardedOnRestart` junto do `delivery` persistido. O pending registry de 24 horas da UI cobre apenas a janela em que a entrega autoritativa é desconhecida: queue/guided projection, `queue/guide` no restart query ou `unknown` limpam a conta imediatamente; apenas `startNow` que não entrou no transcript mantém a confirmação manual de reenvio, e o replay automático é proibido.

Se `completed, queue>0, autoDrain=false` e o usuário submeter uma mensagem comum ou `/goal <novo objetivo>` pela caixa de entrada, a UI precisa mostrar primeiro uma caixa de confirmação e não pode substituir o botão normal de envio por dois botões inline dentro do composer. Fechar a caixa, apertar Esc ou clicar no overlay só cancelam esta submissão, sem transferência de rascunho, attachments ou histórico de prompts; `/compact` é a exceção e é anexado direto ao fim da fila, mantendo a pausa.

### Edit

| Pré-condição                                      | Ação do usuário                        | Resultado de produto                                                            |
| ------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------- |
| `completed(success), queue=0`                     | Editar a última real user query        | Reexecuta a partir daquele turno e o histórico seguinte é substituído pelo novo branch |
| `completed(interrupted), queue=0`                 | Editar a última real user query        | Reexecuta a partir daquele turno e o resultado interrupted atual é substituído pelo novo branch |
| `completed(interrupted), queue>0, autoDrain=false` | Editar a última real user query        | Reexecuta a partir daquele turno, a queue é mantida como está e `autoDrain` continua false |
| O reexecute do edit levou a `running`             | Enviar mensagem comum                  | Anexa à queue                                                                    |
| O reexecute do edit levou a `running`             | Enviar `/goal xxx`                     | Anexa à queue                                                                    |
| O reexecute do edit levou a `running`             | Enviar `/compact`                      | Anexa à queue; na vez dele executa o compact sem interromper o reexecute do edit    |
| O reexecute do edit levou a `running`             | Editar novamente a última real user query | Para antes o reexecute atual do edit e reexecuta com o texto editado mais recente; a queue é mantida como está |
| O reexecute do edit levou a `running`             | Editar uma user query que não é a última | reject ou entrada ausente; evita que o branch histórico seja revertido de novo dentro do active turn |

Só é possível editar user query. Assistant e tool não podem ser editados.

Os attachments do edit inline fazem parte do canonical input intent. A UI de primeira parte só permite remover itens do `AttachmentRef[]` ordenado já existente, sem adicionar nem reenviar; na submissão carrega explicitamente o array completo atual: campo ausente significa manter os attachments originais, array não vazio significa substituir e `[]` significa limpar. Corpo vazio mas com attachments ainda pode reexecutar; corpo e effective attachments simultaneamente vazios precisam ser rejeitados antes do branch cut. A remoção só afeta o novo active branch e não limpa fisicamente o conteúdo de attachments do branch antigo.

O edit inline não reutiliza a máquina de estado de colagem longa para converter em attachment do composer comum; uma colagem que atinja 5120 caracteres continua sendo `editUserQuery.newText`, evitando introduzir um novo timing de upload host/remote por causa da capacidade de remoção.

### Fork

Só é possível fazer fork do último trecho assistant completed de um product turn `completedSuccess`. Não é possível forkar user, tool, timeline, o partial atual streaming/interrupted/failed ou trechos assistant intermediários do mesmo turno. Dados novos são resolvidos pelo turn anchor persistido; dados antigos só fazem fallback quando não houver ambiguidade, caso contrário retornam `guard.forkTargetAmbiguous`.

Ao fazer fork de uma nova session, copiam-se o histórico de mensagens anterior ao ponto de fork, a configuração persistida no ponto de fork e o estado de goal anterior ao fork, mas não a configuração posterior da session pai, a queue, o bash/subagent de background ativo, o resultado de background pendente ou a inbox de continuation. É possível fazer fork de histórico estável mais antigo enquanto primary turn, foreground subagent, goal continuation ou goal verifier está rodando; o compact é um operation lock. Se a session pai ainda estiver running, o active work atual continua pertencendo à session pai; o child só evolui a partir da fronteira estável do fork e não faz rewind do workspace compartilhado. O comportamento existente de checkpoint de workspace completed/idle não é ampliado nesta rodada. Um retry do mesmo `sourceCommandId` devolve o mesmo child.

O aviso model-only do fork de conversa na V4 é recuperado como um Attachment `conversation_fork`: o texto persistido não contém a tag e, na projeção do provider, tudo é envolvido uniformemente em `<system-reminder>`. Assim como no side chat, ele não participa do MCS, é sempre mantido na fronteira histórica do fork e antes da nova pergunta da sub-sessão; a UI continua exibindo apenas o timeline `session_fork`. O caminho `rewind_notice` do fork legacy/checkpoint existente mantém o comportamento anterior, sem migrar mensagens antigas nem injetar repetidamente a cada turno.

```text
fork bundle: inherited history -> raw notice + Attachment metadata -> timeline boundary
hydrate:     inherited history -> conversation_fork Attachment
child send:  inherited history -> user <system-reminder>notice</system-reminder> -> user question
                                 (MCS / non-MCS 均保持此位置)
```

### Compact

O compact se divide em compact manual e compact automático.

Compact manual:

| Pré-condição                                                                           | Ação do usuário                   | Resultado de produto                                                                                                  |
| -------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `completed, queue=0`                                                                    | `/compact` ou botão de compact    | Inicia o compact e insere o timeline started                                                                         |
| `completed, queue>0, autoDrain=false`                                                   | `/compact` ou botão de compact    | Anexa ao fim da fila pausada; `autoDrain=false` e o compact não inicia até o usuário retomar o drain ou clicar em executar imediatamente |
| `running` (incluindo primary/tool/foreground subagent/goal continuation/goal verifier)  | `/compact` ou botão de compact    | Anexa à queue em FIFO estrito; não interrompe o active work atual                                                     |
| `compacting`                                                                            | Enviar mensagem comum            | Anexa à queue                                                                                                         |
| `compacting`                                                                            | Enviar `/goal xxx`               | Anexa à queue                                                                                                         |
| `compacting`                                                                            | Enviar `/compact` de novo        | reject, sem enfileirar                                                                                                 |
| `compacting`                                                                            | stop                             | Interrompe a compressão; o timeline é marcado como interrupted; a session entra em `completed(interrupted)`; a queue é mantida e não é consumida automaticamente |

Compact automático:

```text
某个 pendingAction 即将执行
  -> 系统判断 needsCompact=true
  -> 先进入 compacting(origin=auto)
  -> 插入自动 compact timeline marker
  -> compact 成功后继续 pendingAction
```

O compact automático é um passo de manutenção prefixal inserido pelo agendamento do sistema e não ocupa a queue do usuário. Pode aparecer antes de qualquer turno, inclusive antes de um envio direto do usuário, de um consumo de queue, de um consumo de goal e de um reexecute por edit.

Um compact manual enfileirado continua sendo executado como intenção explícita do usuário mesmo que um auto compact tenha acabado de acontecer antes de sua vez; o runtime pode retornar um noop marker, mas a UI/CLI não pode removê-lo silenciosamente. Se o compact manual enfileirado falhar ou for parado pelo Stop, as queue items seguintes entram em held e não podem continuar o consumo automático atravessando a falha/cancelamento da manutenção.

Semântica de retry:

- O compact automático faz no máximo 3 retries.
- O compact manual não tem retry automático.
- Depois que o compact automático tem sucesso, é preciso continuar executando o `pendingAction` que o disparou, a menos que o usuário o pare durante o compact.

 Ramos de compact automático ainda pendentes de confirmação:

- O que fazer com o `pendingAction` depois que o compact automático falha mesmo após 3 retries.
- O que fazer com o `pendingAction` depois que o compact automático é parado pelo usuário.

### Goal

A semântica de `/goal xxx` é definir ou atualizar o goal da session:

- No modo Plan, comandos de controle de goal não estão disponíveis; o composer apenas mostra um toast e preserva a entrada original, sem criar ou atualizar goal.
- Se não havia goal antes, está definindo o goal.
- Se já havia goal antes, está atualizando o objetivo.
- Não existe um estado de produto `goal validating` que precise bloquear o usuário.
- Enviar `/goal xxx` durante running ou compacting não executa na hora e é anexado à queue.

### Modelo e profundidade de pensamento

Modelo e profundidade de pensamento são armazenados no nível da session:

- Quando `ZCodeModelRef` precisa ser representado temporariamente como string em renderer/configOptions, usa-se uniformemente `providerId/modelId$variant`; o `$` é o separador reservado da variant nessa codificação de exibição. O `:` sempre pertence ao `modelId` original do provider e nunca pode ser interpretado como variant pelo renderer; por exemplo, no OpenRouter, `nvidia/nemotron-3-ultra-550b-a55b:free` precisa permanecer completo de ponta a ponta. Os commands da V4, o snapshot do Agent e a persistência continuam usando `provider` / `model` / `thought` separados ou um `ZCodeModelRef` estruturado, e essa string de exibição não pode virar um novo protocolo entre processos.
- Ao trocar para uma session histórica, a configuração do topo/da área de entrada mostra o modelo e a profundidade de pensamento daquela própria session.
- Ao criar uma nova session, usa-se a tupla de configuração `provider + model + thought` que o usuário escolheu explicitamente por último e que o runtime confirmou como vigente. O renderer persiste uma tupla indivisível e não pode restaurar model e thought como duas preferências globais sem relação entre si.
- Abrir ou trocar para uma session histórica apenas exibe o snapshot daquela session e não pode reescrever a tupla de configuração "última escolha explícita"; do contrário, apenas navegar pelo histórico mudaria silenciosamente o modelo padrão do próximo rascunho novo.
- Quando o usuário troca entre modelos, o thought do modelo de origem não representa a intenção do modelo de destino. O runtime precisa primeiro escolher o thought real conforme a capacidade do modelo de destino, e o renderer só persiste a nova tupla por inteiro depois de receber o resultado autoritativo; valores de requisição que falharam, ficaram stale ou ainda não foram projetados não podem ser gravados antes.
- O `createSession.config` do prewarm de rascunho só pode referenciar modelos da atual Environment Model Selection View. O Host precisa primeiro aguardar o Provider Registry readiness deste Environment antes de emitir `createSession`; não é permitido preencher a janela de não prontidão com snapshot do Desktop, `runtimeModel` ou pushes de Registry entre Environments. Só depois que o Registry atual confirmar a remoção ou desativação do Provider original é que se entra no caminho normal de fallback do Worker e persistência compare-and-set.
- Uma mudança de identidade de modelo precisa limpar sincronamente, na configuração do rascunho e no default do workspace, o thought que ainda pertence ao modelo de origem. Mesmo que o modelo de destino aceite uma faixa com o mesmo nome, só pode ser adotado o default/faixa real do destino; só um switch explícito do usuário no modelo de destino depois disso pode sobrescrever.
- O localStorage antigo separado de model/thought serve apenas como entrada de migração: só migra se os dois conseguirem formar a mesma configuração de modelo; um thought isolado não pode ser aplicado a outros modelos.
- A Submission comum do usuário na queue usa o modelo e a profundidade de pensamento fixados no momento da entrada na fila; configuração de Provider, credenciais e definição de modelo são resolvidas de novo a partir dos fatos atuais do Environment no momento da execução.
- A primeira rodada de uma session comum usa a baseline de modelo initial silent e não gera `modelChange`. Um child de Subagent novo publica `ModelSelected(previousModelRef=null, modelRef=X)` e gera, no início da primeira rodada, um `modelChange` de source ausente com a fronteira genérica de modelo `∅→X`, recuperável a frio pelo transcript. A projeção pública só reconhece três estados de baseline de modelo — silent initial, source-less e known — e não reconhece a identidade de Subagent; não é permitido inferir uma nova fronteira apenas de metadados antigos de child ou de campos de source ausentes.
- `modelChange.fromProvider/fromModel` precisam existir juntos ou faltar juntos; o primeiro representa um A→B comum e o segundo representa somente o modelo real inicial do Subagent. O renderer só usa essa estrutura para escolher entre o texto "modelo trocado" e "usando"; quando o source está ausente, não exibe seta de troca e não acrescenta "模型" depois dos rótulos de provider/model, e a exibição do A→B comum permanece inalterada.

### Default do modo de colaboração do rascunho

A memória global de `build/edit/plan/yolo` pertence apenas ao estado de rascunho do renderer; não é default de workspace nem fato de restauração de session:

- No mesmo renderer, depois que o usuário escolhe explicitamente um modo em qualquer rascunho não enviado, o renderer grava uma preferência de localStorage sem sufixo de workspace; rascunhos novos locais ou de workspace SSH/WSL/Docker são inicializados com esse valor.
- O prewarm do rascunho e o `createSession.config.mode` do primeiro envio precisam carregar explicitamente esse valor, sem usar antes o mode antigo do Agent do workspace/projeto e trocar de forma assíncrona, para evitar corrida entre o primeiro frame e o primeiro envio.
- Abrir uma session histórica, trocar de modo em uma session existente e restaurar o snapshot da session afetam apenas aquela session e não podem reescrever a preferência global do rascunho.
- Quando o localStorage está ausente, ilegível ou com valor inválido, o fallback determinístico é `build`; o mode antigo do workspace não participa do fallback.
- O localStorage do desktop renderer e o do Web renderer do celular são independentes. Esta regra não declara sincronização entre dispositivos; um rascunho novo no celular só herda a preferência do próprio navegador do celular.

### Concorrência entre múltiplas sessions

Entre sessions diferentes há concorrência real:

- Com a Session A running, o usuário pode trocar para a Session B.
- A Session B pode continuar enviando mensagens e entrar em running.
- Não há limite de concorrência na camada de produto.
- A queue, o modelo, a profundidade de pensamento, o contexto e o estado da sidebar direita de cada session são isolados entre si.

## Estados de review de case

Cada nó `case` precisa ser marcado por uma pessoa ao final.

| Estado      | Significado                                     |
| ----------- | ----------------------------------------------- |
| accepted    | A expectativa de produto está clara e o teste pode ser gerado |
| undefined  | Falta complementar o protocolo                   |
| invalid     | Essa combinação deve ser podada pela pré-condição |
| ignored     | A combinação existe, mas não é coberta nesta versão |
| bug         | A implementação atual conflita com a expectativa do protocolo |

A saída do review não é "se a árvore está bonita", e sim estes artefatos:

- Protocolo de produto confirmado.
- Lista de cases undefined.
- Condições de poda invalid.
- Candidatos a bug.
- Cases aceitos dos quais é possível gerar E2E.

## Próximos passos

Não fazer ainda uma UI de entrada complexa. O próximo passo deve alinhar os nós e as descrições de regras da ferramenta atual a esta declaração de protocolo:

- O primeiro lote de cases em linguagem natural está em: [conversation-session-case-catalog.md](./conversation-session-case-catalog.md).
- A matriz de validação do MVP está em: [conversation-session-validation-matrix.md](./conversation-session-validation-matrix.md).
- O contrato de test id da UI da área de conversa está em: [conversation-session-ui-testid-contract.md](./conversation-session-ui-testid-contract.md).
- O popover de nós do Trace Tree mostra `node type`, `input type`, `decision` e `rule id`.
- A lista de rules é classificada por `decision` e `invariant`.
- A exportação de case leva os campos completos do protocolo, e não apenas o texto do título.
- Se aparecer um `undefined`, dá para ver diretamente qual camada do protocolo falta: estado, entrada, regra, effect ou invariante.