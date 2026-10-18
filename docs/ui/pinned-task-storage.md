# Armazenamento e Cache da Lista de Tasks em SQLite

> **Estado atual**: este documento descreve o limite atual do SQLite `tasks-index` e do cache da lista da barra lateral;
> o estado do corpo da conversa continua sendo fornecido pela projection V4.

Fixar e arquivar tasks não gravam mais em task meta.

> Observação: versões anteriores deste documento descreviam a solução `pinneds.json` / `archiveds.json`.
> A implementação atual convergiu para `tasks-index.sqlite` como fonte de verdade do índice; o conteúdo abaixo foi atualizado conforme a realidade atual.

## Regras de persistência

- Ao fixar (pin) uma task:
  - o arquivo de snapshot da task permanece `{taskId}.json`
  - atualiza o estado `pinned` da task correspondente em `~/.zcode/v2/tasks-index.sqlite`
- Ao desafixar (unpin) uma task:
  - o arquivo de snapshot da task permanece `{taskId}.json`
  - atualiza o estado `pinned` da task correspondente em `~/.zcode/v2/tasks-index.sqlite`
- Ao arquivar uma task:
  - o arquivo de snapshot da task permanece `{taskId}.json`
  - atualiza o estado `archived` da task correspondente em `~/.zcode/v2/tasks-index.sqlite`
  - se ela já estiver fixada, o estado `pinned` no sqlite também é limpo

## Regras de leitura

- a lista global de fixadas vem de `listTaskList({ kind: "pinned", workspaceScopes })`
- a lista global de timeline vem de `listTaskList({ kind: "timeline", workspaceScopes })`
- a lista global de arquivadas vem de `listTaskList({ kind: "archived", workspaceScopes })`
- a lista de tasks por workspace vem de `listWorkspaceTaskLists({ workspaceScopes })`
- todas as consultas acima passam uniformemente por `tasks-index.sqlite`
- a semântica das consultas no sqlite é fixa:
  - `pinned`: `pinned = 1 AND archived = 0`
  - `archived`: `archived = 1`
  - `timeline / workspace`: `pinned = 0 AND archived = 0`
- a determinação do estado de fixação não depende mais da antiga varredura local de tasks; Header e Sidebar passam a vir uniformemente das consultas de lista no sqlite
- o caminho do snapshot da task é uniformemente o `{taskId}.json` retornado por `getTaskSessionFilePath(workspacePath, taskId)`
- na migração de inicialização, os arquivos históricos `_pinned.json` / `_archived.json` são renomeados de volta para `{taskId}.json`

## Regras de cache do frontend

- A seção `pinned` da Sidebar não renderiza um placeholder bloqueante de "carregando tasks" ao adicionar ou trocar de workspace: tasks já em cache são exibidas direto e atualizadas em segundo plano; ao adicionar um novo workspace scope, as tasks dos scopes existentes são mantidas, e ao remover um scope, apenas as tasks do scope removido são filtradas — é proibido publicar um quadro intermediário vazio por causa da troca da query key global; a seção inteira só é ocultada temporariamente quando realmente não há tasks exibíveis, voltando a aparecer conforme o resultado da consulta.
- A área de ações no hover da linha de uma task fixada oferece entrada para a árvore de arquivos, abrindo a árvore do workspace ao qual a task pertence. A entrada não altera a pertença de pin no SQLite; tasks remotas devem corresponder a uma tab conectada com o mesmo `workspaceIdentity` e carregar o seu `remoteSessionId` — é proibido fazer crosstalk com um workspace local pelo mesmo `workspacePath`.
- A query cache key é composta pelas seguintes dimensões:
  - tipo de lista: `pinned / archived / timeline / workspace`
  - ordenação: `created / updated`
  - termo de busca
  - quantidade de itens visíveis no momento (por exemplo 5 / 10 / 15 para tasks de workspace)
  - conjunto de `workspaceKey` atualmente participantes da consulta
- Regras de cache do `show more`:
  - as tasks de workspace mostram 5 na primeira tela, e cada clique aumenta em 5 apenas o limite visível do workspace atual
  - enquanto o cache do novo limite ainda não estiver pronto, continua exibindo o snapshot do limite anterior, sem limpar as linhas de tasks nem trocar para loading bloqueante
  - depois que todas as tasks estiverem visíveis, a entrada é ocultada; quando o workspace é recolhido, o progresso da paginação volta para 5 e o cache existente continua sendo reaproveitado
- O `show more` das `workspace task` atualiza apenas o limite do `workspaceKey` atual, sem reconsultar todos os workspaces já abertos
- Regras de atualização do frontend após operações em tasks:
  - `rename / read / unread`: faz patch direto nos metadados de cache da task atual, sem invalidar a coluna inteira
  - `pin / unpin / archive / unarchive`: primeiro faz patch local nas consultas afetadas e depois só busca em segundo plano as consultas colapsadas realmente necessárias
- A busca em segundo plano serve apenas para cobrir o caso "a lista colapsada tem dados ocultos, então a fronteira pode mudar", evitando recarregar a sidebar inteira

## Implementações relacionadas

- Persistência: `packages/services/src/session/taskIndexRepo.ts`
- Interface de serviço: `packages/services/src/session/zcodeTaskService.ts`
- Listas globais da UI: `packages/ui/src/hooks/useGlobalTaskList.ts`
- Listas agrupadas por workspace da UI: `packages/ui/src/hooks/useWorkspaceTaskLists.ts`
- Query cache do frontend: `packages/ui/src/store/taskQueryCacheStore.ts`
- Query key / descriptor: `packages/ui/src/lib/taskQueryCache.ts`
- Seção pinned da Sidebar: `packages/ui/src/WorkspacePinnedTasksSection.tsx`
- Seção timeline da Sidebar: `packages/ui/src/WorkspaceTimelineTasksSection.tsx`
- Seção archived da Sidebar: `packages/ui/src/WorkspaceArchivedTasksFlatSection.tsx`
- Seção de tasks do Workspace agrupado: `packages/ui/src/WorkspaceSidebarItem.tsx`
- Menu "mais" do Header: `packages/ui/src/WorkspaceHeaderSections.tsx`