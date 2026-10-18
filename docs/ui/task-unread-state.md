# Task Unread State

## Restrições atuais

- A fonte de verdade de não lidas da task é unificada no `unreadAt` da tasks-index membership
- O ponto azul da UI, o badge do Dock e a limpeza de lida após selecionar a task funcionam apenas em torno do `unreadAt`
- A task query row consome o `unreadAt` via membership join; o antigo `taskUnreadByTaskId`, o
  `taskListCache` e o `optimisticTaskListByTaskId` não são mais base de decisão da barra lateral
- O `lastActivityAt` responde apenas pela ordenação de Updated e não participa da dedução nem da
  limpeza de não lidas

## Cadeias principais

### Marcação ativa de não lida

- Entrada: menu de contexto da task, menu more do Header
- Ação: chamar `zcodeTaskService.setTaskUnread(..., true)`
- O renderer aplica o overlay de campo `{ unreadAt }` apenas na query row; após o sucesso, ele
  reconcilia com a tasks-index membership, e é proibido sobrescrever a session activity/status
  com o meta de task inteiro retornado

### Marcação passiva de não lida

- Entrada: `task_complete` / `task_error` / `task_warning` de task em background
- Ação: primeiro marcar o membership overlay da query row da task atual como `unreadAt`
- Depois chamar `zcodeTaskService.setTaskUnread(..., true)` de forma assíncrona para persistir no
  índice de task/session
- Após a refatoração do v4 sessions-index, o estado de execução em background não é mais mantido
  pelo antigo renderer monitor; o `taskIndexSyncer` do host apenas converte estados finais de
  phase em `task_status_changed`, sem verificar se algum renderer está atualmente visualizando
  aquela task.
- Portanto, quando o renderer recebe `workspace_task_list_changed(reason="task_status_changed")`,
  ele recupera a semântica antiga: se a task não é a `activeTaskId` do workspace atual, primeiro
  marca o ponto azul localmente e depois chama `setTaskUnread(..., true)` para persistir; se for
  justamente a active task, nenhuma não lida é gerada.
- O próprio `task_status_changed` ainda não dispara um novo carregamento de membership; apenas o
  `task_meta_changed` emitido em seguida pelo `setTaskUnread` faz o task-index membership join
  recarregar o `unreadAt`.

### Limpeza de lida após visualizar a task

- Entrada desktop: `useWorkspaceTaskNavigation`
- Ação: ativar primeiro a tab de destino e depois resolver a instância de serviço exata pelo
  `remoteSessionId` da tab ativa no momento
- Ler o `unreadAt` da task query row atual; se existir, aplicar primeiro o overlay de campo
  `{ unreadAt: undefined }` e só então chamar `zcodeTaskService.setTaskUnread(..., false)`
- Após o sucesso, reconciliar pela tasks-index membership e remover o overlay; em caso de falha,
  remover o overlay, recarregar a membership e permitir que o ponto azul volte
- Sessões de execução de tarefas agendadas do desktop seguem o mesmo contrato de leitura: quando o
  usuário está na rota Automations, o estado final em background do scheduler marca como não lida
  a sessão de execução com `cronAutomationId`; uma automation escolhida explicitamente como "não
  trabalhando no projeto" precisa placingar a sessão de execução na seção "Tarefas" da
  conversation workspace canônica. Clicar no ponto azul ou na linha da task deve ler o `unreadAt` da
  query row clicada, limpar pelo par exato `workspaceKey + taskId`, sem depender da session ativa
  atual e sem ser pulado por causa da identidade do cron.
- Esse fluxo precisa preservar o `lastActivityAt` do sessions-index; abrir uma task ou limpar uma
  não lida não pode fazer uma task antiga pular para o topo
- Entrada do Web remoto no celular: o `WebRemoteControlTaskTarget.unreadAt` tocado na página inicial
  de tasks é o snapshot visível ao usuário nesta rodada. Se existir, no mesmo workspace usar o
  bridge atual e entre workspaces criar no bridge de destino antes de chamar
  `zcodeTaskService.setTaskUnread(..., false, expectedUnreadAt=task.unreadAt)`; não é permitido
  depender do estado de hidratação do query cache da Root do celular.
- A leitura no celular usa compare-and-clear: só limpa se o `unreadAt` atual da tasks-index ainda
  for igual a `expectedUnreadAt`; se a task tiver gerado uma nova não lida de estado final após o
  clique, a limpeza antiga e atrasada precisa ser um no-op e retornar o meta atual. Essa comparação
  e a escrita devem ficar na mesma fronteira atômica do repository, não podem ser um
  ler-depois-escrever no Web/UI.
- O `unreadAt` também funciona como o marcador CAS da não lida atual; a cada gravação de não lida da
  mesma task, o repository precisa gerar um valor estritamente crescente dentro da transação de
  escrita do SQLite. Quando o relógio do sistema não avança ou volta, usa-se o valor anterior mais
  um, e é proibido que o chamador trate `Date.now()` como a única versão. Limpar o `unreadAt` apenas
  muda a membership de não lida e não pode resetar o marcador de última alocação persistido pelo
  repository.
- Falha na escrita de leitura no celular não impede abrir a task; ao voltar à página inicial, o
  snapshot autoritativo da tasks-index é adotado novamente; o overlay de query-cache existente do
  `useWorkspaceTaskNavigation` no desktop e a cadeia `desktop-continuous` permanecem inalterados.

## Critério de leitura da UI

- Ponto azul da lista de tasks: o `membership.unreadAt` juntado na task query row
- Badge do Dock: `countAllUnreadTasks()`

Ambos os pontos de entrada consomem apenas o `unreadAt` da tasks-index; durante a migração é
permitido reutilizar helpers de agregação, mas não é permitido voltar ao antigo
`taskUnreadByTaskId` como fato de negócio.