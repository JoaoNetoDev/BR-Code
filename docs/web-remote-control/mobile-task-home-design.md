# Plano de reformulação da homepage de tarefas do controle remoto no celular

> **Status: implementado.** Os pontos de entrada atuais no código são
> `packages/ui/src/WebRemoteControlMobileShell.tsx`,
> `WebRemoteControlMobileTaskHome.tsx` e `hooks/useWebRemoteControlTaskOpen.ts`; a seção
> “Recomendação/ordem de implementação” abaixo preserva o rastro do design e não indica estado
> pendente.
>
> O caminho (chain) de controle remoto atual usa o app payload `data.payload` de um relay externo. As
> interações envolvendo a homepage de tarefas e a troca de workspace neste documento continuam
> válidas; as suposições antigas de relay token, bootstrap HTTP e `bridgeToken/wsUrl` estão
> obsoletas e não são mais uma base para a implementação.

A visão geral de produto e arquitetura está em
[Web remote control overview](./web-remote-control-architecture.md). Este documento registra o
contrato de interação da homepage e da página de chat no celular; linha do tempo, temas e listas em
telas largas são navegados de forma unificada pela visão geral.

## Contexto (antes da reformulação)

Antes da reformulação, o controle remoto Web no celular reaproveitava o `WorkspaceSidebar` e a área
de chat do desktop:

1. Em tela pequena, a página do celular era transformada pelo `WorkspaceShellLayout` em uma
   estrutura vertical.
2. A metade superior continuava sendo uma versão recortada da sidebar do desktop, com workspace,
   entradas de tarefas e algumas capacidades da barra lateral do desktop.
3. A metade inferior reutilizava a área de chat do desktop.

Essa estrutura permite reaproveitar rapidamente a lógica existente, mas não serve à nova
arquitetura de informação do celular. O novo objetivo é transformar o celular em duas páginas
claras:

1. Homepage: a lista de workspaces e tarefas do dispositivo atual.
2. Página de chat: a interface de chat depois que uma tarefa é selecionada, continuando a
   reaproveitar os componentes de chat do desktop.

A mudança central é: o celular deixa de reutilizar a UI de lista de tarefas do desktop, mas a lógica
de negócio — clique na tarefa, troca entre workspaces, reporte de mobile view state — continua
reaproveitando a cadeia de controle remoto existente do desktop.

## Objetivos

1. A homepage de controle remoto no celular exibe workspace cards; o card pode ser expandido e, ao
   expandido, mostra as tarefas daquele workspace.
2. Ao clicar em uma tarefa, entra-se na página de chat, que continua reaproveitando o header
   existente e a V4 session chat surface.
3. A lógica de clique na tarefa reaproveita a lógica Web remota existente:
   - tarefa do mesmo workspace: seleciona a tarefa diretamente e reporta o mobile view state.
   - tarefa de outro workspace: solicita um novo workspace bridge e depois entra na tarefa
     correspondente.
4. O estado inicial de leitura do QR code não entra mais automaticamente na página de chat.
5. Se o ponto de entrada do QR code trouxer uma tarefa inicial, a homepage expande automaticamente o
   workspace card ao qual a tarefa pertence e exibe a linha da tarefa correspondente como
   selecionada.
6. Mantém-se a separação entre o estado selecionado do desktop e do celular; uma ação no celular não
   troca de volta a tab/task atual do desktop.
7. Respeita-se a regra de isolamento de identidade
   `workspaceKey = workspaceIdentity?.trim() || workspacePath`.

## Não objetivos

A primeira versão não faz:

1. Criar workspace no celular.
2. Criar SSH / WSL / Docker remote session no celular.
3. Gerenciar, no celular, workspaces fora da janela do desktop.
4. Vários celulares controlando a mesma janela do desktop ao mesmo tempo.
5. Refazer os componentes de chat, o runtime do ZCode ou o caminho principal do protocolo de relay.
6. Fazer o desktop mudar para a task escolhida no celular.

## Complemento de 2026-05-02: entrada de criação de task no nível do workspace

Para completar o ciclo de operação no celular, cada workspace card da homepage de tarefas recebe um
botão “新建任务” à direita, com o seguinte comportamento:

1. Mesmo workspace:
   - chama `startDraft(workspacePath, workspaceIdentity)` para entrar no estado de rascunho;
   - reporta `updateMobileViewState(workspaceKey)` (sem taskId), evitando continuar realçando a task
     antiga;
   - entra na página de chat.
2. Outro workspace:
   - segue por `switchWorkspace(workspaceKey, { mobileNavigationIntent: "chat" })`, sem passar
     `taskId`;
   - o Root de destino inicia com `initialTaskId=undefined`, entrando no estado de rascunho daquele
     workspace.
3. O `switcher` do controle remoto Web ganha a capacidade opcional
   `startDraft(workspaceKey, { mobileNavigationIntent })`, para o celular chamar de forma uniforme;
   implementações que não suportam essa capacidade ainda podem recorrer a
   `switchWorkspace + updateMobileViewState`.

Este complemento mantém a regra de isolamento de identidade existente:
`workspaceKey = workspaceIdentity?.trim() || workspacePath`.

## Solução recomendada

Adotar um shell dedicado ao mobile, em vez de continuar reformulando o `WorkspaceSidebar`.

Recomenda-se adicionar uma camada de UI de controle remoto do celular:

```text
WebRemoteControlMobileShell
  ├── home: WebRemoteControlMobileTaskHome
  │     └── workspace card list
  │           └── task rows
  └── chat: existing chat header + V4 session chat surface
```

O desktop e o controle remoto Web em tela larga continuam usando o layout de desktop existente do
`WorkspaceShellLayout`. O shell de duas páginas do mobile só entra em uso quando
`webRemoteControlWorkspaceSwitcher` é satisfeito e o breakpoint de tela pequena é atingido.

Os benefícios dessa abordagem:

1. A UI da homepage pode ser projetada inteiramente para a experiência do celular, sem ficar limitada
   pela estrutura histórica da sidebar do desktop.
2. A página de chat continua reaproveitando a capacidade de chat existente, reduzindo o risco.
3. O clique na tarefa, o workspace bridge e o mobile view state não são reinventados; apenas são
   extraídos como um hook compartilhado.
4. Se a homepage do celular evoluir depois, por exemplo com busca, filtro por status ou estado de login
   de dispositivo, isso não contamina a sidebar do desktop.

## Modelo de página

### Homepage

A homepage serve para navegar pelos workspaces e tasks já abertos dentro da janela atual do desktop.

Estrutura de informações:

1. Marca e status do dispositivo no topo:
   - `ZCode Remote Control`
   - a primeira versão mostra o estado da conexão e não adiciona um campo de protocolo para o nome
     do dispositivo
2. Área de aviso dispensável:
   - explica que esta conexão via QR code permite ver os projetos, tarefas e sessões do dispositivo
     atual
   - depois que o QR code expira, é preciso voltar ao desktop para reconectar
3. Área de workspaces e tarefas:
   - título: os workspaces e as tarefas no dispositivo atual
   - texto secundário: contagem total de workspaces/tasks
   - ações: recolher tudo, atualizar
4. Workspace card:
   - nome do workspace
   - caminho do workspace
   - rótulos leves como local / SSH remote / Docker / WSL; na primeira versão pode começar com
     local / remote
   - horário de atualização mais recente, derivado do maior `updatedAt` entre as tasks daquele
     workspace; não é exibido quando não há tasks
   - quantidade de tasks
   - botão de expandir/recolher
5. Linha de task:
   - título da tarefa
   - provider CLI
   - horário de atualização
   - pill de status
   - indicadores como não lida, em execução, erro
   - a task atualmente selecionada usa o estilo selected

Complemento de 2026-05-28: a homepage do celular ganha uma seção global pinned no topo. Quando o
renderer do desktop sincroniza o snapshot de tarefas, ele lê simultaneamente as duas listas sqlite
`kind: "pinned"` e `kind: "timeline"`; ao receber os task targets unificados, a homepage do mobile
separa primeiro a seção de fixados por `pinned === true` e depois entrega as tarefas não fixadas às
listas normais por workspace/timeline. As tarefas fixadas não aparecem mais duplicadas em workspace
cards comuns nem na lista de timeline, mas a validação de task ativa e o estado selecionado precisam
casar simultaneamente com a seção pinned e com o agrupamento comum.

A homepage tem sua própria área de rolagem e não pode depender do container de rolagem da sidebar do
desktop.

### Página de chat

A página de chat reutiliza o conteúdo principal existente do workspace:

1. No topo, mantém-se o chat header simplificado para mobile.
2. Adiciona-se uma entrada para voltar à homepage.
3. O corpo continua usando o V4 chat content injetado pelo Root (finalmente hospedado por
   `packages/ui/src/v4/SessionPane.tsx`, que carrega a sessão).
4. As regras de exibição móvel de terminal, browser e side pane seguem a estratégia de controle
   remoto existente; a primeira versão não as estende ativamente.

### Limite das camadas flutuantes de interação na página de chat

A página de chat do controle remoto no celular reutiliza os componentes de sessão do desktop e
mantém a mesma hierarquia de camadas e as mesmas formas de interação do desktop; o celular apenas
estreita as dimensões das camadas, evitando introduzir outro comportamento de seleção de modelo só
por causa da viewport estreita.
Em `web-remote-replayable` e em uma viewport de celular com ponteiro grosso, as camadas flutuantes de
interação precisam satisfazer:

1. Depois de abertas, o conteúdo interativo fica inteiro dentro da viewport visível atual e não pode
   ser cortado nas laterais pela raiz da página.
2. A seleção de modelo continua usando o menu primário de provider e o menu secundário de model,
   iguais aos do desktop; no celular o menu secundário de model tem uma largura máxima menor e encolhe
   automaticamente até a borda da viewport conforme o available width do Radix na direção atual; ao
   encolher, o limite de largura mínima do menu compartilhado é cancelado e nomes longos de modelo são
   truncados dentro do item do menu, sem transformar o conteúdo primário e secundário em uma única
   lista longa de coluna única.
3. A seleção de branch e a pré-visualização de colapso de Todo dentro do painel de status à direita
   abrem preferencialmente na vertical, com o Radix alternando entre cima/baixo; é proibido fixá-los
   no lado esquerdo do painel de status.
4. A largura de uma única camada flutuante não pode ultrapassar `calc(100vw - 2rem)`; nomes longos de
   modelo, nomes de branch e textos em chinês/inglês são truncados dentro da camada ou absorvidos por
   rolagem, e a própria página não pode gerar rolagem horizontal.

Limite de apresentação atual e depois da correção:

```text
当前（手机）
provider root menu -> desktop-width model submenu -> viewport clip
status panel row    -> forced left popover             -> viewport clip

修复后（手机）
provider root menu -> narrow model submenu（保持二级交互）
                   -> min(desired width, Radix available width) -> viewport edge
status panel row    -> bottom/top popover                       -> viewport collision handling

桌面 / 宽屏 Web
provider root menu -> desktop-width model submenu（保持现状）
status panel row    -> left popover（保持现状）
```

Esse limite pertence apenas à apresentação do renderer; não altera a navegação do shell do mobile,
a projeção de task/session, o `CommandInbox`, owner/lease, o relay nem a semântica de entrega
`desktop-continuous` / `web-remote-replayable`.

## Estado inicial de leitura do QR code

No caminho atual, o desktop main retorna o workspace/task do momento da leitura do QR code por
`initialViewState`.

Novo comportamento:

1. O bootstrap continua escolhendo `mobileViewState -> initialViewState -> primeiro workspace`.
2. O web continua abrindo o workspace bridge correspondente, garantindo que o Root/App atual tenha um
   serviço de workspace disponível.
3. A página inicial do mobile shell é sempre `home`.
4. A homepage expande o workspace card correspondente conforme `activeWorkspaceKey`.
5. A homepage marca a linha da task correspondente como selecionada conforme `activeTaskId`.
6. Não entra automaticamente na página de chat.

Nesta etapa, `initialTaskId` expressa apenas o «estado selecionado da homepage»; ele não pode
disparar `onNavigateToChat` nem reutilizar o fluxo de abertura por clique numa task.

Assim, depois de ler o QR code, o usuário vê primeiro uma visão geral de todos os workspaces/tasks do
dispositivo atual e ainda sabe claramente em qual workspace estava a task correspondente quando o
desktop gerou o QR code.

## Fluxo de clique numa tarefa

A lógica de abertura de tarefa é extraída do `WebRemoteControlTaskIndex` existente e forma um hook
compartilhado:

```text
useWebRemoteControlTaskOpen
  input:
    switcher
    activeWorkspacePath
    activeWorkspaceIdentity
    activeTaskId
    onSelectTask
    onNavigateToChat
    onSwitchingChange

  output:
    openTask(task)
    switchingTaskKey
    error
```

Entrar na página de chat depois de trocar de workspace exige uma intenção de navegação de uso único,
que não pode ser deduzida a partir de `initialTaskId`:

```ts
type WebRemoteControlMobileNavigationIntent = "chat";

interface WebRemoteControlWorkspaceSwitchOptions {
  taskId?: string;
  mobileNavigationIntent?: WebRemoteControlMobileNavigationIntent;
  markTaskReadExpectedUnreadAt?: number;
}

interface WebRemoteControlMobileShellProps {
  initialNavigationIntent?: WebRemoteControlMobileNavigationIntent;
}
```

Regras:

1. O segundo parâmetro de `WebRemoteControlWorkspaceSwitcherApi.switchWorkspace()` é estendido para
   `WebRemoteControlWorkspaceSwitchOptions`; as chamadas antigas que não passam
   `mobileNavigationIntent` mantêm o comportamento.
2. A entrada web armazena o `mobileNavigationIntent` como pending intent em memória antes de chamar
   `openWorkspaceBridge()`.
3. Quando o novo bridge renderiza o Root/MobileShell, o pending intent é passado como
   `initialNavigationIntent` e consumido e limpo após o primeiro mount do MobileShell.
4. O pending intent não é escrito na URL nem no `mobileViewState`, e não é repassado ao desktop main;
   ele existe apenas para resolver o ponto de chegada da página no browser atual após um remount do
   Root entre workspaces.
5. O `initialTaskId` inicial da leitura do QR code não define pending intent, portanto apenas expande
   o card da homepage e seleciona a linha da task.

Task do mesmo workspace:

1. Calcula `taskWorkspaceKey`.
2. Verifica se é igual ao `activeWorkspaceKey` atual.
3. Se a task do snapshot da homepage tiver `unreadAt`, chama explicitamente
   `setTaskUnread(..., false)` via `switcher.markTaskRead(task)` do bridge Web remoto atual; essa
   ação não pode depender de o task query cache interno do Root do celular já estar hidratado.
4. Chama `onSelectTask(task.workspacePath, task.taskId, task.workspaceIdentity)`.
5. Chama `switcher.updateMobileViewState(taskWorkspaceKey, task.taskId)`.
6. Troca o mobile shell para a página `chat`.

Task de outro workspace:

1. Define o estado de switching.
2. Chama `switcher.switchWorkspace(taskWorkspaceKey, { taskId: task.taskId,
   mobileNavigationIntent: "chat", markTaskReadExpectedUnreadAt: task.unreadAt })`.
3. Depois que o lado web conecta o shared-host bridge do workspace de destino, usa o
   `workspacePath/workspaceIdentity` do bridge de destino e o `unreadAt` do snapshot da homepage para
   chamar `setTaskUnread(..., false, expectedUnreadAt)`; uma falha apenas registra log e não pode
   impedir a abertura da tarefa.
4. Depois que o novo bridge finishes de renderizar, o Root recebe `initialTaskId` e seleciona a
   tarefa.
5. O MobileShell consome a intenção de navegação de uso único trazida por este fluxo de clique e entra
   na página `chat`.
6. Em caso de falha, registra `logger.error` e permanece na homepage exibindo o erro.

Atenção: a task inicial do QR code afeta apenas o estado selecionado da homepage e não chama este
fluxo de clique.

### Limite de limpeza de não lida após abrir uma tarefa no celular

O ponto azul da homepage de tarefas do celular vem do snapshot `WebRemoteControlTaskTarget.unreadAt`
empurrado pelo desktop renderer; o task query cache dentro do Root do celular é outro plano de dados
que hidrata de forma assíncrona conforme o bridge atual. Ao clicar numa tarefa, não se pode usar
novamente «o query cache tem `unreadAt`» como condição para limpar a não lida, porque assim a mesma
task já ativa, um cache frio ou um remount entre Roots pulariam a persistência.

```text
mobile home snapshot task.unreadAt
  │
  ├─ same workspace -> current bridge markTaskRead(expectedUnreadAt)
  │                     -> tasks-index compare-and-clear
  │
  └─ cross workspace -> switch option markTaskReadExpectedUnreadAt
                         -> target bridge connected
                         -> target service compare-and-clears tasks-index unreadAt

desktop task selection -> existing query-cache optimistic clear（保持不变）
```

Restrições:

1. A escrita só é iniciada quando o clique veio da homepage do celular e o snapshot traz claramente
   `unreadAt`; uma task já lida não gera uma mutation sem sentido.
2. No mesmo workspace usa-se o service do bridge atual; em outro workspace é preciso esperar o bridge de
   destino ser estabelecido e usar o service de destino. É proibido que main/relay mantenha ou modifique
   o estado de negócio das tasks.
3. Os parâmetros de destino precisam atravessar `workspaceIdentity`; a semântica de execução por
   caminho continua usando `workspacePath`.
4. Falhar ao marcar como lida não pode impedir a navegação. Ao voltar à homepage, o snapshot
   autoritativo do tasks-index decide se o ponto azul reaparece.
5. O `useWorkspaceTaskNavigation`, o overlay de query cache, a ordenação e a lógica de `lastActivityAt`
   do `desktop-continuous` do desktop não mudam; esta ação existe apenas no switcher de controle
   remoto Web do celular.
6. A leitura do celular confirma apenas a notificação correspondente ao snapshot atual da homepage: o
   repository precisa comparar o `unreadAt` atual com o `expectedUnreadAt` dentro da mesma fronteira
   de escrita atômica. Se forem iguais, limpa; se não forem, devolve o meta atual sem emitir evento de
   mudança, proibindo que um clique antigo e atrasado sobrescreva a não lida de conclusão ou de erro
   gerada depois.

## Divisão de componentes

Sugere-se adicionar ou ajustar os seguintes arquivos de UI:

1. `packages/ui/src/WebRemoteControlMobileShell.tsx`
   - shell de duas páginas do controle remoto do celular.
   - gerencia o estado de página `home/chat`.
   - gerencia o retorno à homepage.
   - consome o `mobileNavigationIntent` de uso único trazido pelo clique entre workspaces.
   - mantém o overlay de switching.
2. `packages/ui/src/WebRemoteControlMobileTaskHome.tsx`
   - renderiza a homepage.
   - carrega o snapshot de workspaces/tasks.
   - gerencia o estado de expansão dos workspace cards.
   - inicializa expansão e seleção conforme o workspace/task ativos.
3. `packages/ui/src/hooks/useWebRemoteControlTaskOpen.ts`
   - extrai a lógica de abertura de task do `WebRemoteControlTaskIndex` existente.
   - é reaproveitado pela homepage do mobile e pelo antigo task index.
4. `packages/ui/src/lib/webRemoteControlTaskIndex.ts`
   - preserva e estende o cálculo de agrupamento, ordenação e chaves de expansão padrão.
5. `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`
   - renderiza `WebRemoteControlMobileShell` no breakpoint de controle remoto do celular.
   - remove a dependência do controle remoto do celular em relação ao arraste de altura da sidebar
     superior.
   - o layout de controle remoto do desktop permanece como está.

## Complementos no modelo de dados

O `WebRemoteControlTaskTarget` atual já contém os campos básicos necessários à homepage:

1. `taskId`
2. `title`
3. `workspacePath`
4. `workspaceIdentity`
5. `remoteSessionId`
6. `workspaceLabel`
7. `workspaceKind`
8. `createdAt`
9. `updatedAt`
10. `provider`
11. `unreadAt`
12. `pinned`

Campos de exibição derivados na homepage:

1. A área de dispositivo no topo não adiciona, na primeira versão, um campo de protocolo `deviceLabel`
   e mostra apenas o estado da conexão de controle remoto atual. Se depois for necessário exibir o nome
   real do dispositivo, é preciso estender explicitamente
   `WebRemoteControlWindowBootstrapResult` / `WebRemoteControlWorkspaceListResult` com um
   `deviceLabel` opcional e fornecer o texto de status da conexão como fallback.
2. O horário de atualização mais recente do workspace card não adiciona um campo de protocolo
   `workspaceUpdatedAt`: a homepage do mobile o deriva agrupando por workspace e tomando o maior
   `updatedAt` do grupo. Um workspace sem tasks não exibe horário de atualização.

Para suportar o pill de status da captura de tela, sugere-se acrescentar um campo de exibição
opcional:

```ts
displayStatus?: "idle" | "running" | "completed" | "error";
// 2026-09-09 追记：会话是否挂着后台工作（动态工作流 run / 后台 bash / 分离子代理）。
// 只参与列表运行层排序，不影响 displayStatus；来源是 sessions-index sidecar 的 hasBackgroundWork。
hasBackgroundWork?: boolean;
// 2026-09-14 追记：工作流运行摘要（≤ 4 条 run：在跑优先，其后最近结束的），来源是 sidecar 的 workflowActivity。
// 手机行在标题下绘制 Workflow 图标 + 迷你轨道灯 + 当前 phase 名（24px，13px 文字）；只绘制，不参与排序或状态 pill。
workflowActivity?: SessionWorkflowActivity;
```

A origem dos campos é stratified por nível de autoridade; não se pode tratar vários caches como
fatos de mesmo nível:

1. Quando a linha da task traz o activity sidecar do sessions-index, o `phase` em tempo real é a
   única autoridade para o estado exibido:
   - `prewarming` / `running` → `running`
   - `completedSuccess` / `completedInterrupted` → `completed`
   - `error` → `error`
   - `draft` não gera linha de task persistente; se dados compatíveis trouxerem `draft` por
     engano, ele não é tratado como estado terminal e segue para o próximo nível de fallback
2. Sem activity do sessions-index, só então lê-se o task runtime cache do renderer atual:
   - status live como `creating` / `queued` / `streaming` / `waiting_permission` /
     `waiting_user_input` → `running`
   - `failed` → `error`
   - `completed` → `completed`
3. Sem um estado explícito também no runtime cache, só então lê-se o estado terminal persistido do
   tasks-index:
   - `completed` → `completed`
   - `error` → `error`
4. Um `status=running` persistido isolado indica apenas que um processo antigo pode não ter finalizado
   corretamente e não prova que o host atual ainda esteja em execução; o fallback é `idle`.

Essa precedência precisa cobrir todas as direções de conflito, e não apenas corrigir `running`:

| sessions-index activity | 旧 runtime / 持久缓存 | 手机展示 |
| --- | --- | --- |
| `prewarming` / `running` | `completed` / `failed` / `error` | `running` |
| `completedSuccess` / `completedInterrupted` | live / `failed` / `running` | `completed` |
| `error` | live / `completed` / `running` | `error` |
| 缺失或兼容 `draft` | 任意 | 保持现有 runtime → 持久终态 fallback |

Assim, um novo frame do sessions-index tanto consegue promover um cache antigo `completed/error` para
`running` quanto consegue encerrar um cache live antigo como `completed/error`. A homepage do celular
não combina essas origens por conta própria.

Limites de agregação:

1. `displayStatus` é calculado pelo desktop renderer ao construir o snapshot
   `WebRemoteControlTaskTarget`; `buildWebRemoteControlTaskTargets()` lê primeiro o activity do
   sessions-index carregado pela linha da task e só então faz fallback, na ordem acima, para o task
   runtime state do Zustand e para `ZCodeTaskMeta.status`.
2. A homepage do mobile consome apenas `WebRemoteControlTaskTarget.displayStatus` e não pode ler
   diretamente o runtime do ZCode, o Repo, o Service ou a implementação de persistência.
3. A cadeia de sincronização continua sendo renderer `syncWebRemoteControlTasks()` -> desktop main ->
   relay -> mobile bootstrap/listWorkspaces, sem nova entrada de consulta de estado no lado do mobile.
4. Tanto mudanças no activity do sessions-index quanto no task runtime state compatível precisam
   disparar a reconstrução e a sincronização do snapshot de tarefas, evitando que o pill de
   `running` / `completed` / `error` fique atrasado até a próxima atualização da lista de tasks.
5. Esse campo é usado apenas para exibição na homepage do celular e não altera a origem real do
   estado no runtime do ZCode. Quando os dados antigos não têm o campo, o frontend do mobile faz
   fallback para `idle`.

### Limite de deduplicação do push do snapshot da homepage

O desktop main faz apenas deduplicação de transporte sobre o `WebRemoteControlWorkspaceListResult`
já construído pelo renderer; ele não possui nem reinterpreta o estado de negócio das tasks. A
assinatura de deduplicação precisa cobrir os campos que a homepage do celular precisa adotar
imediatamente, mas que só mudam em pontos do ciclo de vida ou em ações do usuário:

1. task: `title`, `unreadAt`, `displayStatus`, `pinned`, `archived`, `remoteSessionId`;
2. estado de conexão do workspace: `kind`, `connectionState`, `remoteSessionId`,
   `lastConnectionError`;
3. os campos de identidade estáveis de task/workspace continuam participando da assinatura, garantindo
   que adições, remoções e mudanças de pertencimento entre workspaces fiquem visíveis.

Os campos são normalizados conforme a semântica de exibição do celular: `displayStatus` ausente
equivale a `idle`, `connectionState` ausente equivale a `connected`, string opcional ausente equivale
a string vazia e pertencimento booleano ausente equivale a `false`. Qualquer mudança em um desses
valores válidos precisa enviar um novo `workspace-list-updated`.

O `updatedAt` vem do `lastActivityAt` do sessions-index e muda com alta frequência durante texto em
streaming e eventos de ferramentas. Esta rodada não o inclui na assinatura de push imediato; se for
necessário atualizar o tempo relativo e a ordenação por tempo em tempo real, uma estratégia de
throttle/agregação precisa ser desenhada à parte, para que cada evento de streaming não empurre a
snapshot inteira da homepage de tarefas.

```text
低频展示/连接字段变化 ──> main 快照签名变化 ──> workspace-list-updated ──> 手机立即采用
高频 updatedAt 变化 ────> 本轮不触发整表即时推送（保留后续节流/合并边界）
```

### Limite de impacto da projeção de status

Esta correção pertence a presentation / state-source precedence e não altera o command de sessão, o
runtime, a persistência nem o protocolo de recuperação.

```text
sessions-index phase (实时 activity) ───────────────┐
                                                     ├─> desktop renderer target projection
renderer runtime cache (仅 activity 缺失时 fallback) ┤       └─> relay payload ─> 手机状态 pill
tasks-index terminal status (最后 fallback) ─────────┘

desktop task list ── sessions-index continuous projection（保持原链路）
mobile /remote ───── renderer task snapshot + replayable delivery（只修正 payload 字段）
```

É preciso manter:

1. relay, desktop main e shared-host attachment continuam apenas repassando e não possuem estado de
   negócio de task/session.
2. As semânticas de snapshot/gap, owner e queue do `desktop-continuous` do desktop e do
   `web-remote-replayable` do celular não mudam.
3. O tasks-index continua sendo dono das rows persistentes e do pertencimento; o activity do
   sessions-index é dono apenas do phase em tempo real.
4. `workspaceIdentity?.trim() || workspacePath`, o `remoteSessionId` e o pertencimento
   pinned/archived não são afetados pela combinação de estados.
5. A ordenação running-first do celular continua consumindo o `displayStatus` final, de modo que um
   cache obsoleto não coloca mais uma linha terminal no topo nem rebaixa uma linha realmente em
   execução para a ordenação temporal comum.

A regressão focada cobre todas as combinações de phase e cache conflitante; esta rodada não adiciona
E2E de conversa, porque não há nova interação, comando ou comportamento de entrega, e o NDJSON de
runtime já provou que o sessions-index publica o phase correto continuamente na janela do defeito,
que estava na projeção de targets puramente do renderer.

Para suportar a seção pinned, `WebRemoteControlTaskTarget` ganha um campo opcional:

```ts
pinned?: boolean;
```

Origem do campo:

1. O desktop renderer lê as tarefas no `Root` separadamente através de `useGlobalTaskList({ kind: "pinned" })`
   e `useGlobalTaskList({ kind: "timeline" })`.
2. `buildWebRemoteControlTaskTargets()` marca `pinned: true` no resultado da consulta de pinned e não
   marca o resultado da consulta de timeline.
3. A homepage do mobile consome apenas esse campo de exibição para fazer a divisão; ela não lê
   diretamente o task repo, o sqlite, o service do ZCode nem o runtime.
4. O evento incremental `workspace_task_list_changed`, que carrega mudanças de metadados da task meta
   como título, horário e status, não indica mudança de pertencimento pinned/archived. A atualização
   do cache no frontend precisa preservar a lista existente, evitando que uma atualização de status
   tire uma tarefa fixada da seção pinned.

## Estado e roteamento

A primeira versão não precisa introduzir roteamento real por URL; pode usar React state dentro do
shell do mobile:

```text
currentMobilePage: "home" | "chat"
```

Entrar no chat:

1. O usuário clica numa task.
2. A seleção da task tem sucesso.
3. Define-se `currentMobilePage = "chat"`.
4. Se o history state atual não for `{ zcodeMobilePage: "chat" }`, adiciona-se uma camada de chat
   history state.

Voltar à homepage:

1. Clica-se no botão de retorno do header.
2. Se o history state atual for `{ zcodeMobilePage: "chat" }`, chama-se `history.back()`, e o
   `popstate` volta para home.
3. Se não houver chat history state, define-se diretamente `currentMobilePage = "home"` como
   fallback.
4. Preserva-se o estado selecionado da task ativa.

Botão de voltar do navegador:

1. Quando o mobile shell entra inicialmente em `home`, nenhum history é escrito, preservando a pilha
   de histórico original do ponto de entrada do QR code.
2. Só quando o usuário clica numa task em `home` e entra com sucesso em `chat` chama-se uma vez
   `history.pushState({ zcodeMobilePage: "chat" }, "")`.
3. Se o estado atual já for esse state de `chat`, não se faz push de novo, evitando que cliques
   repetidos na mesma task empilhem histórico.
4. Quando o `popstate` atinge `{ zcodeMobilePage: "chat" }`, define-se
   `currentMobilePage = "chat"`; ao clicar no botão de voltar a partir do chat, usa-se
   `history.back()` para voltar a home, em vez de alterar o state diretamente.
5. Quando o `popstate` volta a um state diferente de `zcodeMobilePage`, define-se
   `currentMobilePage = "home"` e o comportamento padrão de retorno do navegador é liberado.
6. Quando o clique numa task de outro workspace tem sucesso e o Root é remontado, ainda se adiciona
   uma camada de state `chat` conforme a regra «o usuário clicou e entrou no chat»; essa camada vem do
   `mobileNavigationIntent` de uso único do fluxo de clique, e o `initialTaskId` inicial do QR code não
   adiciona essa camada.
7. Quando o mobile shell é desmontado, remove-se o listener de `popstate`.

Não se deve colocar o estado de workspace/task na URL, evitando acoplá-lo ao ponto de entrada do QR
code e ao estado de pareamento.

## Regras de estilo

A UI precisa seguir o `DESIGN.md` da raiz:

1. Usar tokens semânticos, por exemplo `bg-background`, `bg-card`, `border-card-border`,
   `text-foreground-subtle`.
2. Cards usam `rounded-lg`; não use raios grandes demais.
3. A homepage é uma interface de ferramenta de negócio: mantê-la compacta, clara e legível, sem cara de
   página de marketing.
4. Suportar light, dark, Zai light e Zai dark.
5. Suportar o comprimento dos textos em chinês e inglês, sem depender de frases curtas fixas em
   inglês.
6. Botões usam o componente `Button` existente e ícones lucide.
7. A rolagem da homepage, a altura dos cards e a altura das linhas de task precisam ser estáveis, e
   expandir/recolher não pode causar transbordo horizontal descontrolado.

## Logs

Quando houver problemas de interação, é preciso registrar logs para ajudar a localizar, sem adivinhar o
estado.

A camada de UI usa uniformemente:

```ts
import { logger } from "@/logger.js";
```

Pontos de log sugeridos:

1. Falha ao carregar o snapshot de workspaces/tasks da homepage: `error`.
2. Falha ao atualizar o mobile view state após clicar numa task do mesmo workspace: `error`.
3. Início da troca ao clicar numa task de outro workspace: `info`.
4. Falha na troca ao clicar numa task de outro workspace: `error`.
5. Estado inicial do QR code sem correspondência de workspace/task: `warn`.

Renderizações de alta frequência e hovers comuns não geram log.

## Implementação e testes de regressão

É preciso executar:

```bash
pnpm typecheck
pnpm lint
```

Entradas de teste atuais:

1. `packages/ui/test/webRemoteControlMobileTaskHome.test.ts`
   - workspaces agrupados na ordem retornada pelo desktop.
   - expansão padrão do `activeWorkspaceKey`.
   - a task correspondente ao `activeTaskId` aparece como selected.
   - após clicar em recolher tudo, todos os workspace cards ficam recolhidos.
2. `packages/ui/test/useWebRemoteControlTaskOpen.test.ts`
   - task do mesmo workspace chama `onSelectTask` e `updateMobileViewState`.
   - task de outro workspace chama `switchWorkspace` com `{ taskId, mobileNavigationIntent: "chat" }`.
   - em caso de falha na troca, o erro é preservado e o estado de switching é limpo.
3. `packages/ui/test/workspaceShellRemoteMobileLayout.test.ts`
   - o breakpoint de controle remoto do celular renderiza o mobile shell.
   - fora do breakpoint de celular, continua renderizando o shell/sidebar existente.
   - a task inicial do QR code apenas expande o card da homepage e seleciona a linha da task, sem
     entrar no chat.
   - quando o usuário clica numa task e entra no chat, apenas uma camada de history state é
     adicionada, e o retorno do browser volta para home.
   - após um clique entre workspaces remontar o Root, o `mobileNavigationIntent` de uso único é
     consumido para entrar no chat e é limpo após o consumo.
4. `packages/shared/test/webRemoteControl.test.ts`
   - se `displayStatus` for novo, acrescentar testes de compatibilidade de schema/tipo.
5. `packages/ui/test/webRemoteControlTaskIndex.test.ts`
   - `buildWebRemoteControlTaskTargets()` calcula `displayStatus` pela prioridade activity do
     sessions-index → task runtime → `ZCodeTaskMeta.status`.
   - cobre os conflitos entre phase live e cache runtime/persistido obsoleto nas três direções
     running, completed e error.
   - quando o activity está ausente ou é o `draft` compatível, o fallback runtime/persistido original
     é mantido, e um `running` persistido ainda não pode fabricar um running falso.
6. `packages/desktop/test/webRemoteControlManagerExternalRelay.test.ts`
   - quando apenas `title`, `unreadAt`, `displayStatus`, `pinned`, `archived` ou `remoteSessionId`
     mudam na mesma task, é preciso enviar `workspace-list-updated`.
   - quando apenas `connectionState`, `remoteSessionId` ou `lastConnectionError` mudam no mesmo
     workspace, é preciso enviar; um snapshot de campos válidos totalmente idêntico ainda deve ser
     deduplicado.
   - mudar apenas o `updatedAt` de alta frequência não faz parte do contrato de push imediato desta
     rodada.

## Ordem histórica de implementação

Sugere-se a seguinte ordem de execução:

1. Extrair `useWebRemoteControlTaskOpen`, mantendo o comportamento do `WebRemoteControlTaskIndex`
   existente inalterado.
2. Adicionar o componente de homepage do mobile, usando primeiro os campos de task target existentes
   para completar os workspace cards e as task rows.
3. Adicionar o mobile shell e integrá-lo no modo de controle remoto em tela pequena.
4. Ajustar o estado inicial do QR code: permanecer por padrão na homepage, expandindo e selecionando
   apenas a task correspondente.
5. Acrescentar o campo `displayStatus` e o pill de status.
6. Remover ou contornar a lógica antiga de arrastar e recolher o topo da sidebar no controle remoto do
   celular.
7. Acrescentar os testes e executar `pnpm typecheck` e `pnpm lint`.
8. Atualizar a descrição atual da UI móvel em
   `docs/web-remote-control/web-remote-control-architecture.md`.

## Riscos

1. Clicar numa task de outro workspace recria o bridge, e o estado do primeiro frame do novo Root
   precisa se articular bem com o estado de página do mobile shell, evitando piscar a homepage antes
   de entrar no chat.
2. O estado inicial do QR code ainda precisa abrir o workspace bridge, porque a página de chat
   depende dos serviços existentes; mas a UI não deve pular automaticamente para o chat.
3. Workspace remoto precisa usar sempre `workspaceIdentity` como key e nunca apenas `workspacePath`.
4. `WorkspaceShellLayout` já tem bastante lógica histórica de layout de controle remoto no celular, e
   é preciso ter cuidado ao integrar o mobile shell para preservar o comportamento de controle
   remoto do desktop.
5. Se uma rota real por URL for adicionada depois, é preciso evitar misturar o `remoteControlToken` de
   curto prazo com o estado interno de página de task.