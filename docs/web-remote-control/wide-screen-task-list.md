# Lista de tarefas do remote Web em tela larga

## Contexto

O `/remote` em tela estreita do celular já tem uma home de tarefas própria, usando o `WebRemoteControlWorkspaceListResult` retornado por `listWorkspaces()` como fonte de verdade de tarefas entre workspaces. O `/remote` em tela larga ainda reutiliza o shell da sidebar do desktop, mas a área da lista de tarefas do lado esquerdo precisa obedecer à mesma fonte de verdade do remote; caso contrário, as tarefas, a busca, a troca de visão e as entradas de arquivamento vista pelo usuário no remote em tela larga ficam inconsistentes entre si.

## Escopo

- Afeta apenas a área da lista de tarefas do shell de remote control Web em tela larga.
- A sidebar do desktop continua usando as existentes `WorkspaceGroupedTasksSection`, `WorkspaceTimelineTasksSection`,
  `WorkspaceArchivedTasksFlatSection`, `WorkspacePinnedTasksSection` e o链路 em tempo real continuous.
- Não altera relay, desktop main, processo de host, task realtime, snapshot, queue nem a semântica de owner command.
- O remote Web em tela larga continua acessando o desktop host existente por shared-host attachment, sem iniciar um runtime independente.

## Comportamento

O remote Web em tela larga mantém, dentro da barra de ferramentas de tarefas, as entradas existentes de visão, ordenação, busca e arquivamento, mas essas entradas, no modo remote, devem consumir o mesmo índice de tarefas retornado por `listWorkspaces()`:

1. A visão `workspace` agrupa pela ordem de workspaces retornada pelo desktop e mostra apenas tarefas não fixadas; tarefas fixadas aparecem somente na seção de fixadas, evitando duplicação.
2. A visão `timeline` mostra tarefas não fixadas de todos os workspaces visíveis, usando a mesma ordenação em dois níveis do desktop: running antes de non-running, running ordenadas de forma estável por `createdAt` em ordem decrescente, e non-running ordenadas pelo campo `created` ou `updated` escolhido pelo usuário. Membro da camada running = `displayStatus === "running"` ou `hasBackgroundWork === true` (adendo de 2026-09-09: quando a sessão tem um workflow run em background pendente, apenas `updatedAt` avança, o ícone não muda, e não uni-la à camada running faz a tarefa trocar de posição a cada evento de progresso).
   A linha da tarefa desenha, abaixo do título, a linha de execução de workflow igual à do desktop (`WebRemoteControlTaskTarget.workflowActivity`, adendo de 2026-09-14): ícone de Workflow + luz de trilho compacta + nome da phase atual; as linhas de run encerradas são colapsadas pelo conjunto já confirmado do próprio remote, sem depender do localStorage do desktop.
3. A visão de arquivamento mostra as tarefas arquivadas do índice de tarefas do remote. As tarefas arquivadas continuam ordenadas pelo mesmo campo de ordenação e preservam o label de workspace, evitando voltar ao bridge workspace atual.
4. A busca filtra apenas as tarefas e os labels de workspace da área de tarefas do remote em tela larga e não abre o Command Center do desktop; quando o termo de busca está vazio, a lista completa é restaurada.
5. Recolher/expandir tudo na visão `workspace` controla apenas o estado de expansão dos grupos do remote em tela larga e não escreve nem reutiliza o estado de expansão da sidebar do desktop.
6. Trocar ordenação, visão, termo de busca ou estado de arquivamento não pode alterar o comportamento da lista de tarefas do desktop.
7. Linhas de tarefas normais e fixadas mostram, após hover, as entradas de fixar/desafixar e arquivar, com semântica de interação alinhada à sidebar do desktop: fixar alterna a membership diretamente; arquivar entra primeiro em estado de confirmação e só no segundo clique arquiva.
8. As operações de tarefa são executadas pelo `zcodeTaskService` resolvível pelo bridge de shared-host atual. Workspaces locais passam pelos base services; workspaces remotos só permitem operação quando já há remote session services registradas, evitando entregar um `workspacePath` remoto ao host local por engano.
9. Após sucesso da operação, o índice local de tarefas do remote em tela larga é atualizado imediatamente conforme a membership retornada, aguardando a convergência pelo task snapshot subsequente do desktop renderer; em caso de falha, o índice original é mantido e o usuário é avisado.
10. Fixar, Desafixar, Arquivar e Desarquivar são mudanças de membership na task list. A camada de serviço precisa transmitir um reason de membership explícito, e o desktop renderer, ao recebê-lo, precisa recarregar a task list correspondente, sem tratar esse tipo de evento como um `task_meta_changed` incremental que preserva a membership.
11. Depois que o desktop renderer sincroniza o task snapshot atualizado do Web remote para o desktop main, o desktop main apenas notifica, pelo canal de app payload já existente, os Web remotes conectados para adotarem o `WebRemoteControlWorkspaceListResult` mais recente. Relay e main não adicionam estado de negócio de tasks; apenas encaminham o snapshot do índice de tarefas sincronizado pelo renderer.

## Convenção de dados

Em `WebRemoteControlTaskTarget`, `pinned` indica que a task pertence à seção de fixadas; `archived` indica que a task pertence à seção de arquivadas. Clientes antigos podem não ter o campo `archived`, e por padrão são tratados como tarefas normais. O modelo do remote em tela larga filtra esses dois marcadores na camada de UI, sem alterar o protocolo nem o fluxo de dados realtime.

As ações de fixar/arquivar do remote em tela larga não adicionam protocolo de negócio ao relay nem empurram o estado de task para baixo do desktop main. O Web mobile continua chamando o serviço de tarefas pelo host/service já anexado; o desktop main continua fornecendo apenas o snapshot de índice de `workspace-list-request` e o repasse de `rpc-frame`.
Quando o desktop renderer chama `syncWebRemoteControlTasks` devido a uma mudança de membership na task list, o desktop main pode enviar o app payload `workspace-list-updated`, empurrando o mesmo snapshot de `buildWorkspaceListResult()` para o Web remote e evitando que o lado Web continue exibindo a lista antiga.

## Requisitos de teste

- Testes unitários cobrindo troca de campo de ordenação, desduplicação de fixadas, timeline entre workspaces, arquivamento entre workspaces, filtro de busca, recolhimento de grupos e atualização da task membership após operações.
- Testes unitários cobrindo que `task_archived` / `task_unarchived` / `task_pinned` / `task_unpinned` disparam a atualização da lista entre as pontas, e cobrindo que o serviço transmite esses reasons explícitos.
- Testes unitários cobrindo que o desktop main empurra `workspace-list-updated` após mudança de membership no task snapshot, e que o schema do payload Web aceita essa mensagem.
- Testes de layout cobrindo que a linha de tarefa do remote em tela larga renderiza as entradas de ação de fixar e arquivar.
- Executar `pnpm typecheck` e `pnpm lint`.