# Skill de Restauração de Sessions Legadas

## Contexto

Os registros de sessions da versão antiga do ZCode foram salvos em `~/.zcode-bak/v2/sessions`; a versão atual do ZCode passou a usar `~/.zcode/cli/db/db.sqlite` como armazenamento real de session/message/part e `~/.zcode/v2/tasks-index.sqlite` como índice da lista de tasks no lado do app. Para restaurar tarefas históricas, o usuário precisa primeiro escolher o agent antigo, depois o workspace a ser restaurado e por fim a conversa específica.

## Objetivo

- Adicionar a skill de workspace `restore-legacy-sessions`, para orientar o Agente nas seleções e verificações anteriores à restauração de sessions antigas.
- Fornecer um script de varredura somente leitura, listando candidatos em três níveis: agent, workspace e conversation.
- Cada candidato mostra o estado do snapshot antigo, o estado do CLI DB novo e o estado do task-index, evitando importações duplicadas.
- A skill faz por padrão apenas dry-run/planejamento; antes de realmente escrever no banco, é obrigatório confirmar o escopo alvo e o backup de rollback.

## Não objetivos

- Não reiniciar nenhum runtime antigo.
- Não migrar estados antigos de task stream/queue/owner para o relay ou o processo principal.
- Não escrever em `db.sqlite` ou `tasks-index.sqlite` no script de varredura.

## Mapeamento de dados

- Fonte antiga: `~/.zcode-bak/v2/sessions/{workspaceHash}/{legacyTaskId}.json`
- A nova session prefere o session id estável do snapshot antigo; quando ausente, faz fallback para o task id antigo.
- Snapshot ID antigo: `meta.taskId`
- Chave de isolamento de workspace: `workspaceIdentity?.trim() || workspacePath`
- Acerto no CLI DB: `session.id = restoredTaskId`
- Acerto no task-index: `tasks.task_id = restoredTaskId and tasks.workspace_path = workspacePath`
- O provider de runtime após a restauração é gravado uniformemente como `glm`. O `meta.provider` do snapshot antigo indica apenas a origem histórica e não é gravado no `provider` do task-index nem no `providerID` da mensagem do CLI.
- A restauração de session antiga não grava `migration_source` no task-index nem `migrationSource` em `meta_json`. Esse campo hoje é usado apenas pela via dedicada `claudeCode` da importação nativa do Claude Code, evitando introduzir semânticas não modeladas como `legacy-session`.
- `meta_json.taskId` do task-index precisa ser igual a `restoredTaskId`; não se pode manter o `meta.taskId` do snapshot antigo, senão a UI lerá um legacy task id ao acessar o meta.
- O CLI DB precisa gravar `message` e `part`. A página de detalhes reconstrói o corpo visível e a ordem das chamadas de ferramentas a partir da tabela `part`; apenas `message.data.content` faria a task abrir com o histórico em branco.

## Workflow da skill

Por padrão só a fonte de backup `~/.zcode-bak/v2/sessions` é varrida; o destino continua sendo o `~/.zcode/cli/db/db.sqlite` e o `~/.zcode/v2/tasks-index.sqlite` atuais. Para inspecionar o diretório original é obrigatório passar explicitamente `--legacy-dir ~/.zcode/v2/sessions`.

1. Varrer agents:
   `node .agents/skills/restore-legacy-sessions/scripts/scan-legacy-sessions.mjs agents`
2. Depois da escolha do agent, varrer workspaces:
   `node .agents/skills/restore-legacy-sessions/scripts/scan-legacy-sessions.mjs workspaces --agent glm`
3. Depois da escolha do workspace, varrer conversas:
   `node .agents/skills/restore-legacy-sessions/scripts/scan-legacy-sessions.mjs conversations --agent glm --workspace /path/to/workspace`
4. Fazer a classificação dry-run da conversation selecionada:
   - `ready`: já existe tanto no CLI DB quanto no task-index.
   - `needs-cli-db`: o task-index já existe, mas falta a session no CLI DB; é preciso reconstruir a session real a partir do snapshot antigo.
   - `needs-task-index`: o CLI DB já existe, mas falta o índice no task-index; é preciso completar o índice.
   - `needs-full-import`: faltam os dois lados; é preciso uma importação completa.
5. Depois de confirmar que uma conversa específica será restaurada, executar o script de restauração:
   `node .agents/skills/restore-legacy-sessions/scripts/restore-conversation.mjs --snapshot ~/.zcode-bak/v2/sessions/<workspaceHash>/<legacyTaskId>.json`

## Restrições de segurança

- Antes de escrever no banco, é obrigatório fazer backup dos dois bancos: `tasks-index.sqlite` e `db.sqlite`.
- Execuções repetidas precisam ser idempotentes: uma session real já existente não pode sobrescrever conversas posteriores do usuário.
- A atualização do task-index precisa preservar os valores existentes de `pinned`, `archived`, `deleted` e `title_overridden`.
- Em caso de conflito na atualização do task-index, é preciso limpar o `migration_source` gravado por engano pelo fluxo antigo de restauração e manter `provider = "glm"`.
- A restauração no CLI DB precisa gravar pelo menos um part `text` para cada legacy message; mensagens de assistant também devem preservar os parts de ferramenta que puderem ser mapeados e receber o `parentID` da mensagem de usuário anterior.
- Implementações relacionadas à restauração em UI / remote não podem espalhar a semântica de recuperação `web-remote-replayable` para a cadeia principal desktop `desktop-continuous`.

## Verificação

- O script de varredura consegue outputting as listas de três níveis (agent, workspace, conversation) no caminho padrão.
- A saída JSON pode ser parseada por `jq`.
- A estrutura da skill passa em `quick_validate.py`.
- Após a modificação, executar `pnpm typecheck` e `pnpm lint`.
