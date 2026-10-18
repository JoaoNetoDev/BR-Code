# Catálogo de Cases de Plugin MCP Skill

Objetivo: expandir a semântica de produto do "MCP skill fornecido por plugin" no desktop do ZCode, da importação ao fechamento, em cases e2e para review de produto, QA e desenvolvimento. Este diretório v1 cobre apenas os três estados de happy path mais básicos (não instalado / instalado e habilitado / instalado mas desabilitado); os caminhos de múltiplas etapas das ações de importação, o desligamento por skill, a herança entre workspaces e a limpeza de estado após desinstalação são mantidos como incrementos separados do catálogo.

## Nomenclatura e Marcadores Fixos

- Namespace de ferramenta (runtime): depois que o agent carrega o plugin MCP server, `apps/zcode-cli/packages/adapters/src/mcp/descriptor.ts` reescreve `plugin:<plugin-name>:<server>` como o nome compatível com anthropic `mcp__plugin_<plugin-name>_<server>__<tool>`, que é o tool name realmente enviado ao modelo. Os cases deste diretório usam sempre:
  - Plugin: `e2e-plugin-mcp-ping` (caminho do fixture `packages/desktop/test/e2e/fixtures/plugin-mcp-skill/e2e-plugin-mcp-ping/`)
  - server: `ping`
  - namespace do plugin (interno ao plugin): `plugin:e2e-plugin-mcp-ping:ping` (usado apenas em log de debug / `getEnabledMcpServers`)
  - Nome real no array tools do modelo: `mcp__plugin_e2e-plugin-mcp-ping_ping__ping`
  - plugin id (id dentro de installed_plugins.json): `e2e-plugin-mcp-ping@e2e-fixture`
- Prefixo dos marcadores e2e: `E2E_PLUGIN_MCP_PING_<STATE>_<runId>`
- Estado A: `not-installed`; estado B: `installed-enabled`; estado C: `installed-disabled`

## Limites de Enumeração

| Dimensão                  | Classe de equivalência                                                                                          |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Estado de instalação      | `not-installed`、`installed-enabled`、`installed-disabled`                                                          |
| Superfície de gatilho     | `installed_plugins.json` presente/ausente、`config.json#plugins.enabledPlugins[id]` verdadeiro/falso/ausente          |
| Inicialização do MCP server | `lazy` (spawn apenas no listTools); `eager` (spawn assim que o plugin é habilitado)                                |
| Exposição de tool na camada de conversa | o array `tools[]` contém o nome de ferramenta com namespace / não contém                       |
| Evidência fraca           | o chat exibe o block `chat-tool-call-block-<toolName>` / não exibe                                                 |
| Reuso de fixture          | `fixtures/upstream/plugin-mcp-skill/conversation-session-plugin-mcp-skill-{baselines,installed-enabled}.json`        |

## Status de Review

| Status          | Significado                                              |
| --------------- | -------------------------------------------------------- |
| accepted        | A expectativa de produto está clara, já pode gerar teste |
| undefined       | A expectativa de produto não está definida, pendente    |
| bug-candidate   | A implementação atual conflita com o case, e nem sempre é um problema de protocolo |

## Lista de Cases

| ID  | Pré-condição                                        | Evento do usuário/sistema                        | Regra atingida                                                       | Resultado esperado                                                                                    | Review   |
| --- | --------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | -------- |
| P01 | `installed_plugins.json` não contém este plugin      | O usuário envia texto comum no chat               | baseline `not-installed`                                             | A requisição `tools[]` não contém `mcp__plugin_e2e-plugin-mcp-ping_ping__ping`; o chat não tem o tool-call block correspondente | accepted |
| P02 | `installed_plugins.json` contém este plugin, `enabledPlugins[id] = true` | O usuário envia um prompt "chamar ferramenta" | evidência forte `installed-enabled` | A requisição `tools[]` contém `mcp__plugin_e2e-plugin-mcp-ping_ping__ping`; o chat exibe o tool-call block dessa ferramenta | accepted |
| P03 | `installed_plugins.json` contém este plugin, `enabledPlugins[id] = false` | O usuário envia texto comum      | `installed-disabled`                                                 | A requisição `tools[]` não contém `mcp__plugin_e2e-plugin-mcp-ping_ping__ping`; o chat não tem o tool-call block correspondente | accepted |

## Registro de Validação v1

- 2026-07-05: em macOS local (Apple M4 Pro) + Electron desktop com start real, os três specs passaram:
  - P01 baseline não instalado (marcador `E2E_PLUGIN_MCP_PING_NOT_INSTALLED_*`, replay deepseek retornando texto puro) → passou em 9s.
  - P02 instalado e habilitado (marcador `E2E_PLUGIN_MCP_PING_INSTALLED_ENABLED_*`, replay deepseek retornando `toolUse.name="mcp__plugin_e2e-plugin-mcp-ping_ping__ping"`) → passou em 9s; o lado do chat renderizou com sucesso o tool-call block correspondente.
  - P03 instalado mas desabilitado (marcador `E2E_PLUGIN_MCP_PING_DISABLED_*`) → passou em 7s; `enabledPlugins[id] = false` surtiu efeito, com a requisição `tools[]` contendo 0 plugin MCP.
- Fixes principais (v1 → passou):
  1. `installed_plugins.json` precisa cair em `<E2E_HOME>/.zcode/cli/plugins/` e não em `cli/` (o bootstrap define `pluginStorageRoot = cli/plugins`, e `listInstalledPluginRecords(pluginStorageRoot)` lê `<pluginStorageRoot>/installed_plugins.json`).
  2. Plugins do tipo instalação têm `defaultEnabled = false`; é preciso definir explicitamente `config.plugins.enabledPlugins[id] = true`; o campo delete é tratado como false por padrão.
  3. O nome de ferramenta que o agent injeta no modelo é `mcp__plugin_<plugin-name>_<server>__<tool>`, e não `plugin:<plugin-name>:<server>` (o último só é usado no namespace interno do plugin). O fixture de replay e as asserções do chat devem usar o primeiro.

## Contrato de Fixtures

### Escrito por wdio.conf.ts antes do start do e2e

- `<E2E_HOME>/.zcode/cli/plugins/installed_plugins.json`:
  - Estado A: `resetE2EHome()` já limpou o E2E home, sem gravar registro de instalação de plugin
  - Estados B/C: renderizado a partir de `fixtures/plugin-mcp-skill/installed-plugins.{enabled,disabled}.template.json` (placeholder `__INSTALL_PATH__` substituído por caminho absoluto), name=`e2e-plugin-mcp-ping`, marketplace=`e2e-fixture`, scope=`user`
- `<E2E_HOME>/.zcode/cli/config.json` (precisa ser patcheado depois de `seedUpstreamE2EModelConfig`):
  - Estado B: `plugins.enabledPlugins["e2e-plugin-mcp-ping@e2e-fixture"] = true` (tem que ser explicitamente true, porque plugins do tipo instalação têm `defaultEnabled = false` em `NodePluginAdapter.resolveCandidates`)
  - Estado C: `plugins.enabledPlugins["e2e-plugin-mcp-ping@e2e-fixture"] = false`

### Fixture de replay do deepseek

- `fixtures/upstream/plugin-mcp-skill/conversation-session-plugin-mcp-skill-baselines.json`: compartilhado por A e C, casa com `E2E_PLUGIN_MCP_PING_{NOT_INSTALLED,DISABLED}` e retorna texto puro `deepseek-e2e-ok`
- `fixtures/upstream/plugin-mcp-skill/conversation-session-plugin-mcp-skill-installed-enabled.json`: exclusivo de B, casa com `E2E_PLUGIN_MCP_PING_INSTALLED_ENABLED`, retorna primeiro `toolUse.name="mcp__plugin_e2e-plugin-mcp-ping_ping__ping"` e depois, no turno de resultado da ferramenta, texto puro `deepseek-e2e-ok`

## Reuso de Helpers Existentes

- `prepareConversationE2E()` / `startNewTask()` / `sendPrompt()` / `waitForUserMessageContaining()` / `waitForUpstreamRequestContaining()` / `waitForAssistantMessageContaining()` / `waitForChatState()` — `helpers/conversation-session.ts`
- `ensureToolCrossProductFullAccessMode()` / `respondToToolCrossProductBlockers()` — `helpers/conversation-session-tool-cross-product.ts` (usado apenas no estado B, para evitar que os popups de Full access / permission interceptem a tool-call)
- `getToolCallBlockByToolName()` — o mesmo helper acima
- Novo `helpers/plugin-mcp-skill.ts`: `PLUGIN_MCP_TOOL_NAME`, `captureArtifactAdvertisesToolName`, `findUpstreamRequestContaining`

## Não Reutilizado / Fora do Que É Feito Agora

- O回路 de resposta `tools/call` de um MCP server real (no v1 confiamos no replay forjado do deepseek; o fixture `server.mjs` só garante que o agent consegue subir com sucesso e fazer listTools no estado enabled)
- Desligamento por skill (desligar individualmente vários skills dentro de um plugin)
- Teste end-to-end de buscar plugins reais no marketplace (não pertence a este diretório, apenas ao ciclo de vida da skill "depois que o plugin foi instalado")
- Limpar cache / data dir / re-scan de skillRoot após a desinstalação
- Herança das ferramentas MCP na troca de workspace identity entre workspaces

## Guia Rápido de Localização de Falhas

- Se o `installed_plugins.json` for ignorado pelo agent no start do wdio (caminho deslocado) → veja o `ZCODE_STORAGE_DIR` / `homedir()` em `apps/zcode-cli/packages/adapters/src/exec/index.ts:78` e confirme que o processo do agent realmente lê `<E2E_HOME>/.zcode/cli/`
- Se o namespace de `tools[]` não for `plugin:<name>:<server>` → faça grep direto de `toNamespacedServerName` para confirmar a implementação
- Se o capture artifact do deepseek não pegar o `requestJson` → use o fallback de varredura textual em `record.requestBody` (evidência fraca, apenas prova que o marcador entrou no body da requisição)