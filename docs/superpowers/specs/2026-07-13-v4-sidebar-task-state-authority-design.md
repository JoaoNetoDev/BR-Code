# Design de convergência da autoridade de estado de tarefa da barra lateral V4

## Objetivo

Corrigir a dessincronização de estado da lista de tarefas da barra lateral V4 e impedir que a correção
reintroduza a regressão de ordenação "abrir uma tarefa histórica faz pular para o topo":

- Depois de abrir uma tarefa, o ponto azul de não lida é limpo imediatamente e fica consistente com o
  tasks-index final;
- Uma sessão em background que entra em `prewarming/running` exibe o spinner, e `error` exibe o estado de erro;
- Requisições de bloqueio de permission e userInput aparecem na barra lateral como uma tag leve de atenção;
- Título, não lida, pin/archive, abrir/resume e replay de snapshot não podem falsificar a atividade da sessão;
- Depois de reiniciar, ao clicar em "Nova conversa" em um workspace que não é o atual, a intenção explícita de
  rascunho tem prioridade sobre a restauração last-session/group/pane daquele workspace;
- O desktop `desktop-continuous` e o mobile `web-remote-replayable` restauram o estado terminal a partir do
  mesmo campo de autoridade, mantendo seus respectivos limites de entrega.

Isto não é a remoção do Zustand. O Zustand continua carregando `activeTaskId`, o histórico de navegação, o
rascunho e a UI local do renderer; desta vez só se remove a dependência de leitura dos fatos de negócio da
barra lateral em relação aos antigos `taskRuntimeByTaskId`, `taskUiByTaskId`, `taskUnreadByTaskId` e
`taskListCache`.

## Causa raiz e natureza

Isto é uma omissão de design somada a bugs de implementação:

1. O sessions-index do V4 já substituiu o antigo monitor de runtime, mas `TaskListItem` ainda lê `running` do
   mapa antigo de runtime do Zustand, então o `SessionSummary.phase` em tempo real não faz o spinner aparecer
   mesmo depois de chegar à lista.
2. `useWorkspaceTaskNavigation`, ao limpar não lida, ainda consulta primeiro o `taskListCache`/cache otimista
   antigo; a tarefa atual está de fato no task query cache, o que fazia um item já aberto não encontrar
   `unreadAt`.
3. O active pane renderiza os cartões de bloqueio a partir de `ConversationSnapshot.pendingInteractions`,
   enquanto a barra lateral ainda lê o antigo `taskUiByTaskId`; e `SessionSummary` não tem campo leve de
   atenção, então requisições de permissão e de entrada do usuário não podem ser sincronizadas.
4. `mapSessionSummaryToTaskMeta` coloca `phase/lastActivityAt` em tempo real dentro de
   `status/updatedAt`, que têm semântica persistida, e o whole-meta merge do query cache usa "o `updatedAt`
   mais novo vence". Uma mutation do tasks-index acaba podendo mexer na ordenação da lista, e o `unreadAt`
   otimista antigo também pode sobrepor o resultado autoritativo da limpeza.
5. O `usePaneSessionPersistence` do V4 interpreta `activeTaskId=null` simultaneamente como "ainda não restaurou
   no cold start" e como "o usuário entrou explicitamente em um novo rascunho". Quando o usuário clica em "Nova
   conversa" no workspace B, que não é o atual, a partir do workspace A, B primeiro executa `startDraft` e em
   seguida o effect de restauração, na primeira montagem, ainda lê `zcode-v4-last-session` e escolhe a tarefa
   antiga. A entrada de linha do workspace também contornava o `deactivateActiveGroup + resetToPrimaryPane` já
   existente na criação global, de modo que last-session, group primary binding e pane layout podiam sobrepor a
   intenção de criar algo novo.

A correção existente de "configuração/abertura de task não faz bump de activity" está correta; este design a
mantém e vai além, proibindo que mutations de membership/meta entrem nos campos de ordenação por atividade.

## Limites de produto confirmados

1. Requisições de permission/userInput recém-produzidas são atividade perceptível pelo usuário e podem atualizar
   `lastActivityAt`; refresh, resume e replay da mesma requisição pendente não atualizam.
2. Project / Timeline usam ordenação em duas camadas: tarefas `prewarming/running` formam primeiro a camada
   superior de execução, e dentro dessa camada a ordem é fixa por `createdAt` decrescente; só a camada não
   em execução é ordenada pela regra `Created` / `Updated` escolhida pelo usuário. O `lastActivityAt` de uma
   tarefa em execução ainda pode atualizar a exibição e o fato de atividade, mas não participa da ordenação
   interna da camada de execução, evitando que duas tarefas concorrentes troquem de posição de forma alternada
   por eventos de streaming. Mutations do tasks-index como limpar não lida, mudar título, pin/archive não
   alteram a ordem; a grouped view continua reconhecendo apenas o `sort_order` explícito.
3. Selecionar uma tarefa limpa o ponto azul de forma otimista imediatamente; quando a persistência falha, o
   overlay é desfeito e a dados são recarregados — o ponto azul pode voltar, mas a UI não pode mentir por muito
   tempo.
4. A prioridade do leading icon principal é `error > unread > running > none`. permission/userInput usam uma
   tag de atenção separada, que pode coexistir com o leading icon.
5. O spinner só reconhece `prewarming/running` do snapshot/projeção em tempo real do sessions-index atual; o
   `status=running` histórico do tasks-index não pode, sozinho, disparar o spinner.
6. O desktop valida por completo o ciclo de interação continuous; o celular valida a consistência de campos após
   snapshot/gap replayable, sem fazer permutação completa com split view, queue ou subagent.
7. A intenção explícita do usuário ao clicar em "Nova conversa" tem prioridade sobre a restauração local. No cold
   start com `draftFocusVersion=0`, é permitido restaurar a última sessão; quando `startDraft` já incrementou a
   versão, é preciso manter o rascunho, limpar o last-session correspondente e sair do desktop workbench group /
   resetar o primary pane. A ativação comum de workspace (sem clicar em novo) ainda pode restaurar a tarefa
   anterior.
8. Uma task comum em background pode gerar não lida no estado terminal de turn; quando existe Goal, apenas a
   entrada da projeção autoritativa em `verified` é a fronteira de lembrete de conclusão. `notSatisfied`,
   continuation automática, Stop/cancelamento e verificadores reprovados não geram não lida de conclusão; um
   error real ainda gera não lida como lembrete de falha.
9. Quando um workspace é recolhido, o estado de não lida de suas tasks comuns (não fixadas, não arquivadas) é
   agregado; expandir apenas devolve o ponto azul para a linha concreta da task, o que não equivale a leitura. A
   agregação precisa ser calculada antes do recorte de paginação, sem deixar de fora nenhuma task oculta ainda
   não renderizada.

## Posse do estado

```text
CLI conversation projection
  └─ sessions-index/<workspaceKey>
       ├─ phase --------------------------┐
       ├─ lastActivityAt (唯一排序权威) --┤
       ├─ hasBackgroundWork --------------┤
       └─ pendingInteractionSummary -------┤
                                           v
tasks-index.sqlite ----------------> TaskListRowState ------> TaskListItem
  ├─ pinned / archived / group             ^
  └─ unreadAt ------------------------------┤
                                           │
renderer field overlay --------------------┘
  └─ 仅覆盖正在提交的 owned field，不覆盖整行

Zustand（继续保留）
  ├─ activeTaskId / navigation / draft / local UI
  └─ draftFocusVersion（显式新建意图代次）

localStorage layout persistence
  ├─ last-session（仅冷启动、无显式 draft intent 时恢复）
  └─ workbench group / pane layout（显式新建时退出/重置）
```

### Complemento de autoridade da existência da linha (2026-07-20)

O diagrama acima apenas arbitra o owner de cada campo e não permite que o `sessions-index` seja expandido para
o conjunto completo de linhas de tarefa persistidas. O conjunto unificado de linhas persistidas de Project,
Timeline, Pinned, Archived e Grouped é decidido pelo tasks-index, e o sessions-index apenas sobrescreve os
campos de activity/detail atingidos; quando o summary ainda não existe, a linha de tarefa estática é mantida.
Janelas criadas que ainda não foram persistidas continuam usando o overlay otimista do renderer, e depois da
persistência a task row assume. Os limites e casos completos estão em
`docs/superpowers/specs/2026-07-20-sidebar-task-row-authority-design.md`.

A key de identidade sempre usa `workspaceKey = workspaceIdentity?.trim() || workspacePath`; a exibição de
caminho de arquivo e o caminho de execução nas chamadas de serviço continuam usando `workspacePath`. A seleção
de serviço remoto também precisa preservar `remoteSessionId`, sem acertar apenas por caminho.

## Contrato de dados

### Resumo de atividade

O sessions-index mantém um tópico leve e conflado, e adiciona a `SessionSummary` um resumo opcional de
interações de bloqueio. O resumo contém apenas kind/count, sem comando, pergunta, resposta ou qualquer outro
payload sensível. Quando um frame antigo não tem o campo, equivale a não haver atenção.

```ts
type PendingInteractionSummary = {
  permissionCount: number;
  userInputCount: number;
};
```

`SessionSummary.phase`, `lastActivityAt`, `hasBackgroundWork` e esse resumo são derivados do mesmo conversation
projection; o active pane continua renderizando os cartões de interação a partir do
`ConversationSnapshot.pendingInteractions` completo. Se os dois tipos de requisição existirem ao mesmo tempo, a
barra lateral mantém os dois contadores, a camada de exibição prioriza o texto de userInput e expressa a
quantidade pendente pelo total; o fato de permission não se perde.

### Projeção da linha da barra lateral

Novo `TaskListRowState` só para UI (o nome final pode ser ajustado conforme a convenção de diretórios existente),
sem esconder mais a proveniência em tempo real dentro de `ZCodeTaskMeta.status/updatedAt` persistido:

```ts
type TaskListRowState = {
  taskId: string;
  workspacePath: string;
  workspaceIdentity?: string;
  title: string;
  createdAt: number;
  activity: {
    phase: SessionSummary["phase"];
    lastActivityAt: number;
    hasBackgroundWork: boolean;
    pendingInteractions?: PendingInteractionSummary;
  };
  membership: {
    pinned: boolean;
    archived: boolean;
    unreadAt?: number;
  };
  persistedMeta: ZCodeTaskMeta;
};
```

O query cache pode continuar cacheando as entidades da lista e os resultados de consulta, mas a mutation API
precisa fazer patch por owner de campo. É proibido sobrescrever campos de activity com o `ZCodeTaskMeta`
inteiro devolvido por `setTaskUnread`, rename ou pin/archive; é proibido ordenar a view Updated com o
`updatedAt` do tasks-index.

### Derivação dos indicadores

```text
phase=error                         -> error icon
else membership.unreadAt is set    -> unread dot
else phase in prewarming|running   -> spinner
else                               -> none

pending userInput/permission       -> separate attention tag
```

`completedInterrupted` não exibe error; o terminal error histórico do tasks-index só pode servir como fallback
estático de erro enquanto o sessions-index ainda não fez hydration, e nunca pode gerar um spinner de running.
Assim que o snapshot chega, todos os campos de activity são substituídos pelo sessions-index.

## Sequência de geração e agregação de não lida

```text
sessions-index terminal summary
  ├─ phase=error ---------------------------------> unreadSignal
  ├─ no goal + completed/interrupted -------------> unreadSignal
  ├─ goalStatus=verified --------------------------> unreadSignal
  └─ active/paused/verifying/notSatisfied/failed --> status refresh only

unreadSignal
  -> renderer exact workspaceKey + inactive-task guard
  -> setTaskUnread(true)
  -> task row blue dot + Dock badge
  -> collapsed workspace aggregate dot
```

`task_status_changed` é apenas um evento de convergência de estado e não significa mais implicitamente "nova
conclusão". Apenas o `unreadSignal` carregado explicitamente pelo Host, depois de observar o
`SessionSummary.phase + goalStatus` autoritativo, pode gerar não lida. O patch do task-index e a resolução por
snapshot do mesmo estado terminal podem carregar o signal em no máximo uma broadcast, e o renderer mantém uma
reconciliação idempotente.

O agregado do workspace calcula `hasUnread` a partir do membership completo de regular tasks e só então recorta
para a janela de paginação atual. Um workspace recolhido mostra o ponto azul com o mesmo tamanho e cor da task
row logo após o nome e antes da área de ações; um workspace expandido não mostra ponto agregado e não executa
nenhuma mutation de não lida.

## Sequência de limpeza de não lida

```text
select task
  -> activate exact workspace tab / resolve workspaceIdentity + remoteSessionId
  -> read membership.unreadAt from current task query row
  -> apply renderer overlay { unreadAt: undefined }
  -> setTaskUnread(unread=false)
       ├─ success: reconcile tasks-index membership; remove overlay
       └─ failure: remove overlay; refetch membership; warn through UI logger
  -> set activeTaskId
```

O overlay descreve apenas `unreadAt`. O `updatedAt/status/title` da resposta de sucesso não participa da
combinação de activity, então limpar o ponto azul não muda a ordenação. Selecionar de novo uma task já lida é
operação idempotente e não gera escrita inútil.

## Sequência de atividade e ordenação

Project / Timeline (inclusive desktop e controle remoto Web) usam uniformemente um comparator em duas camadas:

```text
第一层：运行状态
  prewarming/running --------------------------> 位于非运行任务之前

第二层：层内排序
  running tasks -------------------------------> createdAt DESC, taskId tie-break
  non-running + Created -----------------------> createdAt DESC, updatedAt DESC
  non-running + Updated -----------------------> updatedAt DESC, createdAt DESC
```

A camada de execução é proibida de usar `updatedAt` como tie-break. Mesmo que duas tasks sejam criadas no mesmo
milissegundo, é preciso usar um `taskId` estável para desempatar, senão eventos de streaming ainda podem gerar
trocas de posição pela chave de ordenação secundária. Ao entrar em running, a task vai para a camada de
execução; enquanto está running, a posição fica estável; ao entrar em completed/error, sai da camada de
execução e é posicionada de novo pela regra de ordenação não-em-execução atual.

```text
new PermissionRequested / userInput request
  -> projection pendingInteractions changes
  -> record.lastActivityAt bumps once
  -> sessions-index upsert
  -> running task stays in its createdAt slot
  -> non-running task in Updated view may move row

refresh / SessionResumed / replay same request
  -> rebuild identical summary
  -> no activity bump, no reorder

rename / unread / pin / archive
  -> tasks-index membership/meta patch
  -> lastActivityAt preserved
  -> Updated order unchanged

new message / tool / turn lifecycle
  -> real session activity
  -> lastActivityAt advances
  -> running peers do not reorder
  -> non-running Updated order may change
```

A grouped view não consome essa cadeia de ordenação e continua tendo sua posição determinada pelo `sort_order`
explícito do group item do SQLite.

### Adendo de 2026-09-09: trabalho em background entra na camada de execução

Fenômeno: duas sessões rodando um dynamic workflow run cada uma fazem as duas linhas trocarem de posição
rapidamente conforme o progresso do run.

Causa raiz: a pertenança à camada de execução só era decidida por `phase ∈ {prewarming, running}`, mas um
workflow run é **trabalho em background** — depois que o turno de lançamento fecha, o `phase` da sessão pai já
voltou a `completedSuccess`, e só `hasBackgroundWork` fica verdadeiro. Ao mesmo tempo, cada evento
`DynamicWorkflowRunProgress` passa por `onSessionEvent` e avança `record.updatedAt` (= `lastActivityAt`),
disparando imediatamente um frame incremental do sessions-index (só `ModelStreaming` é pulado). Assim as duas
sessões caem na camada não-em-execução, que é ordenada por `updatedAt`, e trocam de posição na frequência dos
eventos do engine. O `BackgroundTaskUpdated` de bash em background / subagente separado também avança o tempo
de atividade, só que de forma mais curta e silenciosa.

```text
engine RunEvent ──▶ DynamicWorkflowRunProgress ──▶ record.updatedAt = now
                                                   └─▶ sessions-index upsert (lastActivityAt)
UI: isRunning(phase) = false  ──▶ 非运行层 ──▶ 按 updatedAt 排 ──▶ 两行互换
```

Decisão: a pertenança à camada de execução passa a ser **`prewarming/running` ou `hasBackgroundWork`**
(desktop `isTaskListRowActive`; controle remoto do celular `displayStatus === "running" || hasBackgroundWork`).
A semântica de `lastActivityAt` não muda (continua sendo o fato de atividade e a base do unread), apenas as
sessões com trabalho em background ficam fixas por `createdAt` dentro da camada de execução e, quando o
trabalho em background termina, saem da camada e são posicionadas pela preferência vigente. O ícone de spinner
continua reconhecendo apenas `phase` (o limite 5 não muda). A alternativa "listar os eventos de progresso de
run como eventos não-atividade e parar de avançar `lastActivityAt`" foi rejeitada: ela mudaria o significado de
"última atividade" e faria sessões com run em andamento parecerem silenciosas na lista.

### Adendo de 2026-09-14: linha de workflow em execução (workflow run line)

Fenômeno: quando uma sessão tem um dynamic workflow run pendente, a barra lateral só mostra mudança de posição
de ordenação e nenhum indicador visível, então o usuário não consegue distinguir "qual sessão está rodando um
workflow e em que etapa está".

Decisão: o resumo do sessions-index ganha o `workflowActivity` opcional (no máximo 4 runs por sessão: os em
execução na ordem de início, seguidos dos encerrados mais recentemente; cada um contém
`runId/toolCallId?/name?/status/stopReason?/startedAt?/phases[]/currentPhase?/agentsWorking`), derivado pelo
projeção do CLI a partir de `workflowRuns` + `backgroundWorks` do mesmo snapshot e entregue junto pelo sidecar
`TaskListRowActivity.workflowActivity`, pelo host controller `taskActivity` do desktop e por
`WebRemoteControlTaskTarget` do controle remoto. O estado de phase só é derivado pelas regras de fluxo (em
execução: phase atual running, já concluídas done, as demais pending; completed: as já concluídas done; errored:
a atual failed; stopped: a atual pending), e a lista de etapas vem de `run.phaseNames` (carried pelo evento
`run-launched`, preenchido pelo submissor a partir do grafo causal); caso contrário, degrada para as phases já
concluídas.

UI: `TaskListItem` / grouped row / timeline row / linha de controle remoto acrescentam abaixo do título uma linha
com "ícone de Workflow + mini trilho de luzes + nome da phase atual", e a altura da linha vai de 32 → 52 (+20
por linha extra, no máximo duas, o resto vira `+n`). O slot frontal de 16px (error > unread > spinner) não
muda — a linha de execução é um segundo canal, não um quarto nível de prioridade. Linhas de run encerrados
**não** são colapsadas por timer: o lado de render mantém um conjunto limitado (256) e persistido de runIds
confirmados, e abrir a sessão confirma na hora todos os runs encerrados naquele momento; dentro de uma sessão
ativa, um run que termina é confirmado imediatamente. O cabeçalho do grupo de projeto colapsado mostra uma luz
pulsante ao lado do ponto de não lida (com a contagem quando >1), contando apenas os runs em execução. Clicar
numa linha de execução = selecionar a sessão + abrir o pane do run (mesmo salto que o badge do composer).

Limites inalterados: `hasBackgroundWork` continua sendo o critério de ordenação da camada de execução;
`workflowActivity` serve apenas para desenhar e não participa de ordenação nem da decisão de não lida.
`summariesEqual` inclui esse campo na comparação de JSON, então viradas de phase / liquidação / variação no
número de subagentes em execução nunca são engolidas pela conflação; isso não deixa a lista mais silenciosa —
cada evento de progresso de run já avança `lastActivityAt` (o mesmo critério de igualdade é o campo comparado, a semântica do
adendo de 2026-09-09 não muda). A virtualização da grouped list passa a medir a altura real da linha com
`measureElement`, e o valor estimado de 32 serve apenas como valor inicial.
Veja os detalhes em `docs/dynamic-workflow/presentation.md`, em「The sidebar run line」.

Entre plataformas: `WebRemoteControlTaskTarget` ganha o `hasBackgroundWork` opcional (o renderer preenche a
partir do sidecar do sessions-index; a assinatura de snapshot do celular no desktop main o conta, então o início
e o fim de um run empurra um snapshot novo mesmo com `displayStatus` inalterado; snapshots antigos sem o campo
são considerados false).

## Sequência de restauração após reinício e de criação explícita

`activeTaskId=null` não é um critério de restauração suficiente. A entrada de restauração também precisa ler o
`draftFocusVersion` do workspace store: o valor padrão `0` significa que este ciclo de vida do renderer não
recebeu nenhuma intenção explícita de criação; cada `startDraft` incrementa e significa que o usuário já
escolheu um rascunho. Essa versão pertence apenas ao estado de navegação local do renderer, não entra em
sessions-index/tasks-index e não persiste entre reinícios do renderer.

```text
冷启动 + 普通激活 workspace B
  activeTaskId=null, draftFocusVersion=0
  -> restore last-session(B)
  -> select old session（允许）

冷启动后从 workspace A 点击 B 的“新建对话”
  -> activate exact B by workspaceKey
  -> deactivate desktop workbench group
  -> reset pane layout to primary
  -> startDraft(B), draftFocusVersion: 0 -> 1
  -> B shell mount sees explicit draft intent
  -> clear last-session(B), skip restore
  -> activeTaskId remains null（必须）
```

Todas as entradas de criação do desktop (linha do workspace, botão global, menu, Cmd/Ctrl+N, seletor de
workspace de rascunho) precisam convergir para a mesma transação de navegação; não pode ser que um componente de
folha componha diretamente `activateTab + startDraft`. A transação localiza exatamente por
`workspaceKey = workspaceIdentity?.trim() || workspacePath`; workspaces remotos com o mesmo `workspacePath` não
podem limpar o last-session um do outro. O `/remote` do celular não restaura, não consome o localStorage de
workbench group/pane do desktop, e navega apenas pelas intenções de workspace/task/draft vindas da bridge
`web-remote-replayable`.

## Limites de restauração entre plataformas

```text
desktop-continuous              web-remote-replayable
  sessions-index delta             snapshot / resume / gap resync
           │                                  │
           └──────── TaskListRowState ─────────┘
                    field-level reconcile
```

- O desktop continuous não emenda mensagens de restauração de estado de execução do mobile replayable; ao
  receber um delta, atualiza o activity direto.
- O mobile replayable substitui o activity inteiro depois da montagem completa do snapshot; durante gap/resync
  mantém a última base válida e não adivinha running/attention por conta própria a partir do tasks-index.
- relay/main continuam apenas repassando, sem guardar estado de negócio de task/session/sidebar.
- O resumo de permission/userInput é restaurado no mesmo tópico dos demais campos do sessions-index e não usa
  `task_meta_changed` para disparar RPC de membership.

## Tratamento de erros e logs

- Falha na escrita de unread: UI logger em `warn`, desfaz o field overlay e invalida a consulta de membership do
  workspace correspondente; nenhuma falsa já-lida local permanente é mantida.
- Gap/fault no sessions-index: segue o resync de owned-subscription existente; sem voltar para o antigo mapa de
  runtime/ui do Zustand.
- Campo opcional de attention ausente: interpretado como "sem pendências", compatível com producer/frame
  antigos.
- Identity/serviço remoto não resolvido com precisão: segue a proteção de falha de navegação existente, sem
  adivinhar outra sessão remota com o mesmo `workspacePath`.
- Restauração de last-session: apenas quando `activeTaskId=null && draftFocusVersion=0`; um rascunho explícito
  precisa limpar de forma sincronizada a chave persistida do workspaceKey exato e pular a restauração.
- Não adicionar logs `info` de alta frequência; detalhes de frame/stream que precisarem de diagnóstico só podem
  passar pelo caminho debug existente.

## Contrato de commit concorrente do join entre fontes

A linha do workspace precisa ler de forma assíncrona o membership do tasks-index; esse RPC não está na mesma
transação que a atualização de activity do sessions-index. Cada rodada de join precisa capturar as seguintes
versões de entrada:

```text
sessions-index {scope, logEpoch, seq, serviceGeneration}
tasks-index    {membershipVersion}
renderer query {requestGeneration}
                    │
                    v
             async membership join
                    │
      任一版本变化 ──┴──> 丢弃旧结果，不清 stale，自动重算
```

- Uma nova invalidação não pode ser simplesmente descartada por dedupe enquanto uma requisição com a mesma query
  signature está em trânsito; é preciso registrar a intenção de rerun.
- Uma requisição antiga só pode fazer commit enquanto a revision de activity, a versão de membership e a request
  generation ainda coincidirem.
- `stale` não pode carregar a única geração de invalidação; invalidações consecutivas precisam ser observáveis,
  e uma resposta antiga não pode marcar como fresh uma query já atualizada.
- A revision coordena apenas o read model dentro do renderer, sem novo campo de wire compartilhado e sem mudar
  o schema do SQLite.
- Desktop continuous e mobile replayable compartilham a mesma portão de commit; o snapshot/gap do mobile
  continua sendo restaurado apenas pela owned subscription.

## Testes e evidências

### Unitários/de componente

- schema/projeção do sessions-index: phase, attention counts, request/resolution, snapshot/cold hydration e
  replay equivalente não produzir atividade nova;
- projeção de linha: activity e membership unidos por owner, e mutations do tasks-index não sobrescrevem
  phase/lastActivityAt;
- indicador: prioridade de error/unread/running e coexistência de attention;
- navegação de unread: julgamento pela linha do query, limpeza otimista, reconciliação no sucesso, rollback com
  refetch na falha e roteamento exato por workspaceIdentity/remoteSessionId;
- criação de unread: estados terminais comuns/Goal verified/error geram signal explícito, enquanto estados
  terminais intermediários do Goal e eventos de resume/status-only não geram;
- agregado do workspace: estado recolhido, não lida fora da janela de paginação, limpeza individual de várias não
  lidas, poda de pinned/archived e isolamento por workspaceIdentity;
- ordenação: running sempre antes das não running; várias running em `createdAt` decrescente e sem reordenação
  quando `updatedAt` alterna; ao terminar, volta para a ordem Created/Updated escolhida; title/unread/pin/archive
  não reordenam; sort_order da grouped não muda;
- restart/new-draft: com last-session persistido em um workspace não atual, a criação pela linha do workspace
  mantém o rascunho; a ativação comum ainda restaura; a criação explícita sai do group ativo e reseta o pane;
  workspaces distintos com o mesmo path e workspaceIdentity diferente ficam isolados;
- guarda estática: TaskListItem/navegação não leem mais os quatro mapas legados de fatos da barra lateral.

### Poda de E2E

- O desktop `desktop-continuous` como representante completo: execução em background exibe spinner,
  permission/userInput exibe atenção, error exibe estado vermelho, e abrir um unread limpa o ponto azul sem pular
  a ordem.
- O TSL18 usa um membership gate exclusivo de E2E para pausar com precisão a resposta de `listTasks` do
  tasks-index: primeiro confirma a linha running e o spinner, depois inicia e confirma que o refresh antigo de
  membership já está em trânsito, deixa o Stop convergir para `completedInterrupted` e só então libera a resposta
  antiga; por fim espera a query do workspace correspondente voltar a fresh e afirma que o spinner não reapareceu
  na janela de liberação. O gate só é exposto por `window.__testActions` quando
  `VITE_ZCODE_E2E_STORE_BRIDGE=1` e não entra no renderer de produção comum.
- Para Goal, take-se apenas as fronteiras de notificação de `ordinary terminal / notSatisfied / verified /
  cancelled / error`, sem fazer produto cartesiano com kind de queue, provider ou split view.
- O restart de desktop é representado assim: primeiro persiste-se last-session para o workspace B, depois, a
  partir de A, clica-se em "Nova conversa" na linha do workspace B e afirma-se que a intenção de rascunho vence
  e que nenhuma sessão antiga é reescrita; em separado, prova-se que a ativação comum de B ainda restaura o
  last-session.
- O mobile `web-remote-replayable` só prova que a projeção de phase/attention/unread é consistente após a
  restauração por snapshot/gap, e valida o isolamento de workspace identity.
- Não fazer permutação completa com queue, compact, fork, subagent, split view, modelo/provider, tema/locale;
  essas dimensões não alteram o owner dos campos e são cobertas por testes unitários/casos já existentes.

## Não objetivos

- Não remover o pacote do Zustand nem todo o `zcodeSessionStore`.
- Não mover pin/archive/group/unread para o sessions-index.
- Não colocar o payload completo de pending interaction no tópico da lista.
- Não reescrever a virtualização da task list, a busca, o drag de agrupamento nem o sistema global de
  notificações.
- Não remover a capacidade de restauração por atualização do last-session; apenas separar "permitir restaurar" e
  "usuário criou explicitamente" em dois estados decidíveis.
- Não mudar os perfis de entrega de desktop/mobile, owner/lease nem a command queue.

## Ordem de implementação

1. Primeiro adicionar os casos de protocolo/projeção, de falha de row/indicator/unread e de restart/new-draft,
   fazendo o comportamento errado atual falhar.
2. Convergir a transação de navegação de criação explícita, fazendo `draftFocusVersion` impedir a restauração de
   last-session, e unificar a saída do group do desktop / reset do pane.
3. Adicionar o resumo leve de attention e propagá-lo por CLI → shared → services → UI sessions-index.
4. Estabelecer a row projection com field-owned e mutations otimistas em nível de campo, migrando a ordenação e
   o TaskListItem.
5. Migrar a limpeza de não lida na seleção de task e remover os pontos de leitura das quatro fontes legadas de
   fato da barra lateral; só remover actions/types mortos depois de confirmar que as referências chegaram a zero.
6. Adicionar o E2E representativo de desktop e o contrato de restauração do mobile replayable, e rodar typecheck,
   lint e os testes relacionados.