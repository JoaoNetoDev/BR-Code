# Sincronização do Cache de Membership da Lista de Tasks

## Contexto

Depois que o usuário arquiva, desarquiva, fixa, desfixa ou exclui uma task, a lista de tarefas da barra lateral ou
do controle remoto sofre uma atualização da tabela inteira. A causa é que essas operações fazem broadcast de
`workspace_task_list_changed`, mas a UI não tem uma cadeia unificada de tratamento local de mudança de membership;
ao receber o evento, ela só consegue invalidar o query cache e solicitar a lista novamente.

## Objetivos

- No fluxo principal `desktop-continuous` do desktop, arquivar / desarquivar / fixar / desfixar / excluir uma task
  não dispara atualização da tabela inteira.
- No controle remoto `web-remote-replayable` do celular, ao receber pushes do shared-host, a sincronização da
  relação de membros da lista continua sendo feita a partir dos eventos de broadcast, sem contornar a boundary de
  restauração do task snapshot do replayable.
- Caches cuja pertinência não pode ser determinada com precisão apenas pelo task meta, como os resultados de
  busca, podem ser marcados como stale, mas não esvaziam a lista visível.
- Metadados de tasks-index não carregados pelo sessions-index (atualmente `unreadAt`, estado final histórico,
  título manual e `cronAutomationId`) precisam ser preenchidos por um join unificado, evitando perder pontos não
  lidos, status, títulos ou o clock icon de tarefas agendadas ao trocar a fonte de dados da lista.

## Solução

- Ao excluir uma task, o service faz broadcast explícito do reason `task_deleted`, evitando que a UI interprete a
  exclusão como um `task_meta_changed` comum.
- Ao receber `task_archived` / `task_unarchived` / `task_pinned` / `task_unpinned` com `taskMeta`, a UI infere o
  membership anterior a partir da lista onde a task está no query cache atual e usa o
  `applyTaskQueryCacheMutation` existente para movê-la para a lista de destino.
- Ao receber `task_deleted`, a UI remove a task de todos os query caches por `workspace + taskId` e limpa também o
  cache da lista de tasks do workspace e o meta otimista.
- `workspace_task_list_changed` é tratado por um coordinator de nível de evento compartilhado entre a lista global
  e a linha do workspace; os broadcasts de membership/delete executam a mutação do query cache apenas uma vez, e
  os assinantes seguintes reutilizam a decisão de atualização da primeira vez, evitando que um evento de exclusão
  já processado seja interpretado como exclusão de item oculto.
- Broadcasts comuns de meta / status não participam da deduplicação do coordinator; essas escritas são idempotentes,
  e reaplicá-las é mais seguro do que engolir atualizações consecutivas de título, detalhe de erro ou resumo em
  até 2 segundos.
- Quando um evento de exclusão acerta o query cache visível atual, não há atualização da tabela inteira; itens
  ocultos/paginados que não acertam o cache visível não permitem inferir o membership a partir do `taskId`, e o
  fallback de atualização é mantido para corrigir `total` / `hasMore`.
- O fallback de atualização só permanece quando o evento não traz informações necessárias da task, ou quando o item
  excluído não acerta o cache visível.
- `task_meta_changed` invalida a geração do cache de membership join; depois que uma sessão existente recebe
  `cronAutomationId` pela primeira vez, as listas workspace, grouped, timeline e pinned/archived precisam ver essa
  identidade na mesma rodada de atualização.
- O `deleted=1` do tasks-index é um membership negativo persistente. A leitura de membership precisa retornar
  explicitamente o conjunto de task ids deleted, e todas as listas derivadas do sessions-index devem excluí-lo de
  forma unificada antes da determinação de kind; não é válido inferir que uma task ainda é membro comum por “não
  aparecer em archivedIds”.
- Além de remover imediatamente o query cache visível, `task_deleted` precisa invalidar a geração do cache de
  membership join. Assim, upserts live posteriores no sessions-index, o cold start do App/CLI e a restauração
  mobile replayable não ressuscitam a task correspondente ao tombstone mesmo ao verem novamente uma sessão CLI
  ainda existente.

## Decisão de Boundary sobre o Tombstone de Exclusão

| Boundary | Decisão | Justificativa da poda |
| --- | --- | --- |
| Propriedade dos dados | O CLI session store continua possuindo o conteúdo das sessões; o `deleted` do tasks-index possui a invisibilidade da task nas listas | Excluir uma task arquivada não equivale a apagar fisicamente o session store, evitando ampliar o alcance de destruição de dados |
| Superfícies de lista | regular, pinned, archived, timeline, workspace e grouped excluem todas as deleted | `deleted` é um guard negativo antes de qualquer kind de lista, sem implementação duplicada por kind |
| Contraste com arquivamento | `archived=1, deleted=0` continua aparecendo apenas na lista de arquivados | Evita que a correção esconda também o arquivamento normal |
| session type | interactive, fork e workflow parent compartilham o mesmo guard de deleted; side chat/subagent/workflow child continuam excluídos pelo guard de task-type | O task type determina se algo pode virar task, e deleted determina se, já sendo task, continua visível: duas dimensões ortogonais |
| client/delivery | desktop continuous e mobile replayable convergem para o mesmo membership final | Delivery apenas muda a forma como o fato chega, sem criar um segundo estado de deleted |
| Workspace | Leitura e eventos continuam usando `workspaceIdentity?.trim() || workspacePath` | Workspaces remotos com o mesmo path não podem compartilhar o tombstone |

Rastro de confirmação: o usuário relatou que “as conversas arquivadas e depois excluídas voltaram todas depois do
reinício” e confirmou a modificação direta. Adota-se a solução de manter o conteúdo das sessões no CLI e adicionar um
campo de membership deleted; nenhuma exclusão física é executada.

## Pontos de Verificação

- Arquivar/fixar/excluir localmente no desktop não deve fazer a linha do workspace ou a lista global recarregarem
  a tabela inteira.
- Após uma mudança de membership iniciada pelo controle remoto, a lista do desktop deve sincronizar incrementalmente
  por evento.
- Depois de excluir uma task arquivada, a lista de arquivados deve remover o item imediatamente e não restaurá-lo
  para a lista comum.
- Após reiniciar o App/CLI ou restaurar via mobile replayable, uma task excluída não pode aparecer em nenhuma lista
  de tarefas, mesmo que ainda exista no CLI session store; uma task comum arquivada de mesmo scope continua na
  lista de arquivados.
- Quando o tasks-index já tiver persistido `cronAutomationId` e o summary do sessions-index não tiver esse campo,
  as listas ainda devem mostrar o clock icon à esquerda do tempo.