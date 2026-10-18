# Timeline de Tarefas do Web Remote Control no Celular

A página inicial de tarefas do controle remoto no celular oferece duas formas de organização:

- Por workspace: mantém o agrupamento original por workspace, expandir/recolher e a entrada de reconexão de workspaces remotos desconectados.
- Por timeline: exibe as tarefas lado a lado entre workspaces, com suporte à visualização em ordem decrescente por hora de atualização ou de criação.

A linha de tarefa da timeline deve preservar a identificação do workspace, evitando confusão entre tarefas com o mesmo nome em workspaces diferentes. As tarefas de workspaces remotos desconectados também não podem ser abertas diretamente na timeline; as regras de interação permanecem iguais às do modo de agrupamento por workspace.

A lógica de ordenação está centralizada em `packages/ui/src/lib/webRemoteControlMobileTaskHome.ts`, com o padrão decrescente por `updatedAt`; ao alternar para a hora de criação, a ordenação é decrescente por `createdAt`, mantendo o outro campo de tempo e o `taskId` como desempate estável.