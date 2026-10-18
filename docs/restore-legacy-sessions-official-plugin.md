# Plugin oficial Restore Legacy Sessions

## Contexto

Os snapshots de sessão da versão antiga do ZCode são salvos em `~/.zcode/v2/sessions`. A capacidade de migração já foi validada como skill local, capaz de listar agents, workspaces e conversations antigos e de restaurar as conversas históricas selecionadas para o índice de tarefas e o DB de sessões do CLI do novo ZCode.

Para evitar que a sessão padrão exponha uma capacidade local de migração de alto risco, é necessário empacotar essa skill como plugin oficial, mas desativado por padrão. Somente após o usuário habilitá-la explicitamente as novas sessões passam a ver a skill e o comando de migração.

## Identidade do Plugin

- Nome do plugin: `restore-legacy-sessions`
- id do plugin: `restore-legacy-sessions@zcode-plugins-official`
- Versão: `0.1.0`
- Tipo: plugin oficial bundled
- Estado padrão: desativado

Este plugin não entra em `DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS`, portanto, assim como `ios-simulator` / `android-emulator`, só injeta capacidades depois de habilitado explicitamente pelo usuário.

## Conteúdo

O pacote do plugin fica em:

```text
apps/zcode-cli/packages/restore-legacy-sessions-plugin/
```

Contém:

```text
.zcode-plugin/plugin.json
README.md
package.json
skills/restore-legacy-sessions/SKILL.md
skills/restore-legacy-sessions/scripts/scan-legacy-sessions.mjs
skills/restore-legacy-sessions/scripts/restore-conversation.mjs
commands/restore-legacy-sessions.md
```

Este é um plugin apenas de skill / comando; não declara `mcpServers` e não inicia um MCP server de longa duração. Os scripts de migração são executados pelo agent sob demanda via Node.js local.

## Limites de comportamento

- O diretório de origem padrão é `~/.zcode/v2/sessions`.
- Só quando o usuário pedir explicitamente para ler outro diretório é que `--legacy-dir <path>` substitui a origem padrão.
- O destino permanece:
  - `~/.zcode/v2/tasks-index.sqlite`
  - `~/.zcode/cli/db/db.sqlite`
- Deve ser criado um backup com timestamp antes da restauração.
- O provider gravado para sessões restauradas da versão antiga é sempre `glm`.
- Não grava `migration_source` nem `meta_json.migrationSource`.
- Não inicia o runtime antigo.
- Não reescreve as mensagens de continuação do usuário em tarefas novas já existentes.

## Como habilitar

CLI:

```sh
zcode plugins enable restore-legacy-sessions
```

Dentro da sessão:

```text
/plugins enable restore-legacy-sessions
```

A mudança vale para novas sessões. Depois de habilitado, é possível usar:

```text
/restore-legacy-sessions
```

ou simplesmente solicitar `$restore-legacy-sessions`.

## Empacotamento

A lógica de seed dos plugins oficiais precisa encontrar o plugin ao rodar a partir do código-fonte, no layout empacotado do Electron e em runtime SEA.

- `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts` registra os candidatos de root dos plugins oficiais.
- `apps/zcode-cli/packages/cli/scripts/sea-official-plugin-assets.mjs` registra o asset SEA, `requiresRuntime: false`.
- Como não há runtime MCP, a fase de seed não precisa reescrever `.zcode-plugin/plugin.json`.

## Verificação

- `zcode plugins list` mostra `restore-legacy-sessions@zcode-plugins-official`, desativado por padrão.
- O estado desativado não injeta skill roots nem command roots.
- Após habilitar, `skillCount = 1`, `commandRootCount = 1`.
- O manifesto de assets SEA contém `skills/restore-legacy-sessions/SKILL.md`, os dois scripts e `commands/restore-legacy-sessions.md`.
- `pnpm typecheck`
- `pnpm lint`