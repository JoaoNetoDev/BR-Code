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

- Entrada: o sinal de conclusão em tempo real que o Host carrega explicitamente como
  `background_terminal`; status comuns, leituras de histórico e replay não geram não lida.
- Ação: o único writer de diretório do desktop base avalia o estado de visualização e depois
  escreve no tasks-index pela rota de mutation original; após a persistência bem-sucedida, a
  árvore é atualizada, sem criar antes uma não lida exclusiva da UI.
- Após a refatoração do v4 sessions-index, o estado de execução em background não é mais mantido
  pelo antigo renderer monitor; o `taskIndexSyncer` do host apenas converte estados finais de
  phase em `task_status_changed`, sem verificar se algum renderer está atualmente visualizando
  aquela task.
- O estado de visualização reconhece o endereço de navegação completo do desktop, ou a mesma
  tarefa efetivamente exibida pelo Web em primeiro plano já conectado. Home, background, rascunho, chats
  encobertos e desconexões não contam como visualização; não é permitido decidir apenas pelo
  `activeTaskId` ou pela última posição de navegação.
- O `mobileTaskView` transitório do Main é enviado por evento após validação de geração de conexão,
  número de sequência e identidade do bridge; as telas larga e estreita compartilham o
  reportamento, e o Web não se torna um segundo escritor automático. O `mobileViewState` é mantido
  para a restauração de navegação.
- A escrita de conclusão da mesma tarefa e a leitura/CAS de nova visualização são serializadas
  dentro do writer único: a escrita em trânsito usa o marker devolvido por ela mesma; quando a
  escrita já terminou, o marker é lido com precisão a partir do owner pertence e então sofre CAS.
  Uma leitura lenta não pode limpar uma conclusão nova ocorrido após a saída; um estado de
  visualização válido repetido não apaga a não lida manual. O contrato detalhado de sequência e de
  troca de owner está em [semântica de refresh da lista de tasks](../task-list-refresh-semantics.md).
- O próprio `task_status_changed` ainda não dispara um novo carregamento de membership; apenas o
  `task_meta_changed` emitido em seguida pelo `setTaskUnread` faz o task-index membership join
  recarregar o `unreadAt`.
- Complemento de conclusão em foreground e limpeza automática: quando o sinal de conclusão chega e o
  usuário está visualizando (endereço de navegação completo do desktop ou foreground Web válido),
  não se escreve a não lida imediatamente, apenas se registra essa «conclusão em foreground»; quando
  a janela perde o foco, é minimizada ou a página fica oculta, a não lida é escrita
  retroativamente, para que a bolha da barra de tasks, o ponto vermelho da bandeja e o ponto azul
  acendam depois que o usuário saiu (cobre o cenário «viu a task completar → minimizou e foi
  embora»). Quando o usuário volta à janela (reganhou o foco ou a visibilidade) e a task ainda está
  à frente, a limpeza automática usa o marker preciso devolvido pela escrita retroativa — não se
  pode deixar o ponto azul preso na task que está aberta, obrigando o usuário a sair e voltar; se o
  usuário foi ver outra task enquanto estava fora, a não lida é mantida como lembrete para tratar
  ao voltar. Nunca se escreve retroativamente durante o foco; após a escrita retroativa, abrir a
  task limpa pela contrato de leitura existente. Limites conhecidos: reabrir a mesma task antes da
  escrita retroativa e sair de novo ainda faz a escrita no momento da saída; uma escrita
  retroativa em trânsito antes de fechar todo o aplicativo é best-effort, sem garantia de
  persistência. A implementação está em `useProjectUnreadSignals`.

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