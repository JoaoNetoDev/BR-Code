# Timeline de Tarefas do Web Remote Control no Celular

> **Estado: descontinuado (confirmado em 2026-10, durante a consolidação do staging).** Após a refatoração de
> projects virtuais, o home do celular e o desktop compartilham o `ProjectSidebar`
> (ver `docs/superpowers/specs/2026-09-09-virtual-project-design.md` §6.0.3 e o registro de desvios D64);
> a página inicial de tarefas exclusiva do celular, o snapshot de tasks do desktop→celular e o código
> correspondente foram removidos. O texto abaixo serve apenas como histórico, e não como base de implementação.

A lista comum da página inicial de tarefas do controle remoto no celular oferece duas formas de organização, alternadas pelo controle segmentado «Mais recentes | Workspaces» à direita da linha «Todas as tarefas» (a preferência é gravada localmente):

- Mais recentes (padrão): exibe as tarefas lado a lado entre workspaces, agrupadas pela timeline do desktop (hoje / ontem / esta semana / mais antigos etc.), com os grupos de data diretamente como seções de mesmo nível, e não mais aninhados sob «Mais recentes».
- Por workspace: mantém o agrupamento por workspace, expandir/recolher e a entrada de reconexão de workspaces remotos desconectados.

As duas vistas afetam apenas a lista comum; acima permanece somente a seção «Fixadas», e as tarefas fixadas não aparecem de novo na lista comum; os estados em execução e pendente permanecem dentro da linha de tarefa, sem uma seção própria e sem filtro de estado (as regras estão na [home de tarefas do celular](../web-remote-control/mobile-task-home-design.md#homepage)).

A linha de tarefa da timeline deve preservar a identificação do workspace, evitando confusão entre tarefas com o mesmo nome em workspaces diferentes; a linha da vista por workspace omite o nome do workspace. As tarefas de workspaces remotos desconectados também não podem ser abertas diretamente na timeline; as regras de interação permanecem iguais às do modo de agrupamento por workspace.

A forma de ordenação (hora de atualização / hora de criação) fica no menu «Mais» do cabeçalho. A lógica de ordenação está centralizada em `packages/ui/src/lib/webRemoteControlMobileTaskHome.ts`, com o padrão decrescente por `updatedAt`; ao alternar para a hora de criação, a ordenação é decrescente por `createdAt`, mantendo o outro campo de tempo e o `taskId` como desempate estável.

Durante a permanência nesta tela, a ordem das tarefas existentes e os buckets de data permanecem estáveis, e o estado e os textos de tempo passam a usar o novo snapshot; as novas tarefas são inseridas no topo do grupo ao qual pertencem, e os novos grupos são anexados ao final. A organização é refeita em um refresh bem-sucedido, ao voltar à home, ao trocar a forma de organização ou a ordenação. O título de cada workspace agrega a quantidade de tarefas em execução/pendentes do grupo, sem as tarefas fixadas; os detalhes e as exceções estão na especificação da home de tarefas.
