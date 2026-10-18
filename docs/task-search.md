# Task Search

Abaixo de "Nova tarefa" na barra lateral há a entrada "Buscar", com o atalho `Cmd/Ctrl+K`. A entrada abre o Command Center unificado; com a busca vazia, são exibidas as alterações recentes da tarefa atual, as tarefas recentes e os comandos agrupados. Depois de digitar uma palavra-chave, a busca faz correspondência por comando, corpo da tarefa e arquivo nas tarefas ativas e nos arquivos do workspace aberto, usando os comandos, o corpo da tarefa e o nome do arquivo como chaves.

Os dados de busca continuam sendo obtidos por meio de `zcodeTaskService.listTaskList` correspondente a cada escopo de workspace: o workspace local usa o Local Host compartilhado por esta janela, com as consultas isoladas por workspaceKey; o workspace remoto consulta o Remote Host ao qual pertence a remote session correspondente.
O escopo de workspace não representa um processo de Host independente. A UI não lê o JSON da session diretamente, evitando contornar os limites de serviço de desktop / web remote.

Para viabilizar a busca no corpo das tarefas, o índice sqlite de tasks ganhou o campo `searchable_text`. Ao salvar uma task, o corpo das mensagens é sincronizado; sessões antigas são preenchidas a partir do snapshot da session na schema migration 3. O índice de corpo guarda no máximo 200000 caracteres, evitando que sessões longas expandam indefinidamente o `tasks-index.sqlite`.