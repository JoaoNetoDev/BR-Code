# Cache da Lista de Tasks Remotas

## Contexto

As visões globais de pinned e de timeline precisam exibir simultaneamente as tasks do workspace local e do workspace remoto. Depois que o workspace remoto conecta com sucesso, os active services da janela atual podem apontar para o remoto; se a lista global reutilizar diretamente o `useServices()` atual, a lista local será afetada pelo contexto de serviços remoto, causando timeline local vazia ou cache gravado no escopo errado.

## Cadeia atual

- A lista de tasks local é lida por `useGlobalTaskList`, que internamente usa `useBaseWorkspaceServices()`, e recebe apenas os workspace scopes locais retornados por `useLocalWorkspaceScopes()`.
- O pinned remoto usa `remotePinnedTaskStore` e o timeline remoto usa `remoteTimelineTaskStore`; ambos geram a workspace key por `workspaceIdentity?.trim() || workspacePath`.
- Depois que o workspace remoto conecta ou reconecta, a camada root pré-carrega os dados da primeira tela de pinned e de timeline separadamente.
- Quando a view de timeline clicar em show more, o limit de leitura do timeline local e do remoto é aumentado em degraus de 10, por exemplo 10, 20, 30; não lê tudo de uma vez.
- Operações de task como pin / unpin / archive / rename / unread mantêm sincronizados os dois stores, o pinned remoto e o timeline, evitando que as duas listas globais mantenham relações de membros desatualizadas.

## Restrições

- A consulta de tasks do workspace remoto precisa passar `workspaceIdentity`, e não pode depender apenas de `workspacePath` para o isolamento.
- A camada de UI não chama o repo diretamente; todas as leituras e escritas de tasks continuam passando pelo `zcodeTaskService` do workspace correspondente.
- Uma falha na leitura suplementar remota registra apenas warn e store error, sem bloquear a recuperação do workspace.