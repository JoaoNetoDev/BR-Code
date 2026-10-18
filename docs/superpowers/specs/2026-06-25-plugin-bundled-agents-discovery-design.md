# Descoberta de agents inclusos em plugins (plugin-bundled agents discovery) — design

Data: 2026-06-25
Branch: feature-harness-improve

## Limite entre nomes de runtime e projeção de recursos de UI em 2026-07-18

A implementação posterior passou a incluir agents de plugins habilitados na lista de runtime. Um arquivo de agent de plugin sempre corresponde a um recurso canônico,
cujo nome canônico é `<plugin-name>:<agent-name>`; quando o nome cru é único entre embutidos, usuário, workspace e outros plugins,
o runtime ainda pode fornecer o alias de compatibilidade `<agent-name>`.

Esses dois nomes são pontos de entrada de chamada do mesmo arquivo, não dois recursos instalados, portanto o contrato de lista precisa distinguir:

- `AgentsListResult.agents` é a projeção de chamada do runtime e pode conter simultaneamente o nome canônico e o alias de nome cru único.
- `AgentsListResult.pluginAgents` é a projeção de recursos do plugin e retorna apenas uma entrada, com o nome canônico, por arquivo de agent.
- Settings > Subagents deve usar `pluginAgents` para exibir os recursos do plugin; não pode tratar novamente os aliases de runtime de `agents` como linhas de recursos do plugin.
- O detalhe do plugin continua usando `pluginAgents` e o `path` real para atribuir o componente.

Esse limite preserva a compatibilidade de chamada pelo nome cru e ao mesmo tempo corrige o vazamento de identidade "instalar um agent de plugin e a página de configurações mostrar duas linhas".
Esta seção sobrepõe as restrições históricas "não entra no runtime" e "a semântica de `agents` não muda" do design original abaixo.

## Todo103 em 2026-09-09: cache oficial e continuidade da sobrescrita de plugin

- Complementa a descoberta de cache oficial sem registro de instalação, respeitando a prioridade do registro de instalação, a supressão por desabilitação explícita/desinstalação e a seleção por versão válida do manifest.
- Os IDs habilitados por padrão são unificados no contrato de mercado compartilhado, e a varredura de diretórios apenas-Node entra no ponto de entrada Node compartilhado; o "cada um copia uma terceira cópia" abaixo é uma solução histórica e não deve fundamentar novas dependências de implementação concretas entre domínios.
- Agents de plugin podem salvar sobrescritas de modelo/raciocínio do usuário por ID estável, e o nome canônico e o nome cru carregam a mesma sobrescrita, sem reescrever o arquivo do plugin.
  O armazenamento, a migração offline, o cold start e a semântica de seleção válida seguem o G04-B de `docs/subagents-built-in-model-overrides.md`.

## Contexto e problema

Após a instalação de um plugin, o pacote do plugin (diretório instalado no formato `<storageRoot>/cache/<marketplace>/<plugin>/<version>/`) pode conter simultaneamente diretórios de componentes irmãos como `commands/`, `hooks/`, `skills/` e `agents/`.

O commit `41bb6b7af` (`fix(plugins): include installed marketplace resources`) já fez com que `skillsService` e `commandsService` **escaneiem no local** os subdiretórios `skills/` e `commands/` de cada pacote de plugin instalado, exibindo-os agrupados por plugin na interface de gerenciamento de plugins.

Mas **o diretório `agents/` não é escaneado por nenhum código**. Como resultado:

- O campo `AgentsListResult.pluginAgents` retornado por `subagentsService.list()` está **fixado como `[]`** (`subagentsService.ts:338`).
- O agrupamento "Agents" na interface de gerenciamento de plugins é sempre vazio, mesmo que o pacote do plugin traga um agent.

Objetivo: fazer `subagentsService.list()` escanear o diretório `agents/` dos pacotes de plugin instalados, preencher a projeção canônica de recursos `pluginAgents` e gerar nomes de chamada sem conflito para o runtime.

## Escopo (alinhado com o usuário)

- **Fazer**: descoberta (discovery) + exibição na interface de gerenciamento de plugins + projeção de chamada de runtime com nome canônico / nome cru único.
- **Não fazer**: não copiar fisicamente arquivos para `~/.zcode/agents` — adota-se escaneamento no local, então a desinstalação os faz sumir, sem problema de cópia duplicada ou obsoleta.

## Fatos arquiteturais-chave (conclusões da exploração)

- **A UI já está pronta**, sem necessidade de alterações:
  - `PluginsSection.tsx:114` já lê `agentsResult.value.pluginAgents`.
  - `pluginManagedResourceGroups.ts:74-78` já atribui o agent ao plugin por "agent.source === "plugin" e `agent.path` sob `plugin.rootPath`".
  - `InstalledPluginManagement.tsx:46,54` já tem a cor e a i18n key do agrupamento "agent" (`settings.plugins.detail.component.agent` = "Agents", presente em zh/en).
- **Os contratos já estão prontos**, sem necessidade de alterações:
  - O tipo `AgentSummary.source` já é `"user" | "plugin"` (`packages/shared/src/subagents-types.ts:3`).
  - O campo `AgentsListResult.pluginAgents` já existe (mesmo arquivo, `:28`).
- **A única lacuna**: ninguém escaneia o diretório `agents/` do pacote do plugin e preenche `pluginAgents`.
- **O estilo do projeto é "cada um copia"**: `skillsService` e `commandsService` copiaram cada uma uma cópia idêntica do helper de descoberta de plugins (`PluginRootCandidate`, `readPluginConfigFromConfig`, `resolvePluginStorageRoot`, `scanOfficialPluginCacheRoots`, `readPluginManifest`/`findPluginManifestPath`, `parsePathList`, `resolveInside`, `DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS`, constantes `ZCODE_*_MARKETPLACE`), e **apenas `readInstalledPluginRoots` (`packages/services/src/plugins/installedPluginRoots.ts`) é um módulo compartilhado**. Os agents seguem o mesmo caminho: copiar o mesmo conjunto de lógica de descoberta dentro de `subagentsService.ts`, trocando o diretório de componentes de `skills`/`commands` por `agents`.
- `subagentsService.ts` já possui primitivas de parsing de agent reutilizáveis: `collectAgentMarkdownPaths(rootPath)` (suporta os layouts `<name>.md`, `<name>/agent.md` e `<name>/index.md`) e `readAgentFrontmatter(content)` (parseia name/description/color/model/tools/systemPrompt, compatível com CRLF e dois-pontos em chinês).

## Solução

Apenas um arquivo de origem mais testes são alterados.

### 1. `packages/services/src/subagents/subagentsService.ts`

**(a) Copiar os helpers de descoberta de plugins** (alinhado às implementações privadas de `skillsService.ts` / `commandsService.ts`):

- `readCliConfigFile()`, `readPluginConfigFromConfig(config)` — ler a configuração de plugins da config da CLI (`enabled`, `dirs`, `storageDir`, `enabledPlugins`).
- `resolvePluginStorageRoot(storageDir)`, `resolveConfigPath(path)` — resolver a raiz de armazenamento de plugins.
- `scanOfficialPluginCacheRoots(pluginStorageRoot)` — escanear os diretórios `<plugin>/<version>` sob o cache do marketplace oficial.
- `readPluginManifest(rootPath)` / `findPluginManifestPath(rootPath)` — compatibilidade com os três tipos de manifest `.zcode-plugin/plugin.json`, `.claude-plugin/plugin.json` e `.codex-plugin/plugin.json`, com fallback na mesma ordem de prioridade; o manifest precisa ler os campos `name` e `agents`.
- `parsePathList(value)`, `resolveInside(rootPath, rawPath)` — resolver o campo `agents` do manifest como lista de caminhos e impedir escape do diretório (caminho absoluto ou `..` fora do limite retorna `null`).
- Constantes `DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS`, `ZCODE_OFFICIAL_PLUGIN_MARKETPLACE`, `ZCODE_INLINE_PLUGIN_MARKETPLACE`.
- Reutilizar o módulo compartilhado existente `readInstalledPluginRoots(pluginStorageRoot)` (lê `installed_plugins.json`).

> Nota de implementação: esses helpers já existem em duas cópias em skills/commands; desta vez seguimos o estilo já estabelecido no projeto copiando uma terceira cópia para subagents, sem extrair um módulo comum no meio do caminho (evitando refatoração não relacionada). A forma de `PluginManifestSummary` neste arquivo é `{ name: string; agents?: unknown }`.

**(b) Novo `resolvePluginAgentRoots({ manifest, rootPath })`** (alinhado a `resolvePluginSkillRoots`):

- Resolver `manifest.agents` via `parsePathList` + `resolveInside` em uma lista de raízes.
- Se o campo `agents` não for declarado (`manifest.agents === undefined`) e o diretório padrão `<rootPath>/agents` existir, recorrer a esse diretório padrão (consistente com o fallback de `<rootPath>/skills` do skills).

**(c) Novo `discoverPluginAgents()`** (alinhado a `resolvePluginSkillRootDescriptors`):

1. Ler a configuração de plugins; `enabled === false` retorna diretamente `[]`.
2. Montar as raízes candidatas de plugin: inline (`config.dirs`) + cache oficial (`scanOfficialPluginCacheRoots`) + instalados (`readInstalledPluginRoots`).
3. Para cada candidato, ler o manifest e deduplicar por `<name>@<marketplace>`; considerar habilitado conforme `config.enabledPlugins[pluginId] ?? (defaultEnabled || DEFAULT_ENABLED_OFFICIAL_PLUGIN_IDS.has(pluginId))` e saltar os não habilitados.
4. Para cada diretório de agent dos plugins habilitados, reutilizar `collectAgentMarkdownPaths` + `readAgentFrontmatter` para produzir o `AgentSummary`:
   - `source: "plugin"`
   - `scope: "user"`
   - `path`: caminho absoluto real do markdown do agent (a UI usa isso para atribuí-lo ao rootPath do plugin, e **precisa ser um caminho real sob a raiz do plugin**)
   - `id`: `plugin:<nome-do-plugin>:<nome-do-agent>` (distinto do `user:<name>` dos agents de usuário, evitando colisão de id)
   - `name` / `description` / `systemPrompt` / `color` / `model` / `tools`: vindos do frontmatter
   - `enabled: true`
5. Quando a leitura de um agent individual falhar, ignorar essa entrada (alinhado à tolerância dos agents de usuário).

**(d) Modificar `list()`**:

- Chamar `discoverPluginAgents()` depois do `discoverUserAgents(...)` existente.
- O nome canônico sempre entra em `agents` e `pluginAgents`; o nome cru só entra em `agents` quando não há conflito.
- `pluginAgents` devolve apenas o recurso canônico, uma entrada por arquivo, e não pode conter o alias de runtime de nome cru.
- Agents de usuário, workspace e embutidos têm prioridade na ocupação do nome cru; em caso de conflito, manter o nome canônico do plugin e emitir um diagnóstico.
- Settings > Subagents combina `agents` não-plugin com `pluginAgents` canônico, evitando exibição duplicada de aliases.

### 2. `packages/services/test/subagentsService.test.ts`

Seguir o estilo de fixture de `packages/services/test/skillsService.test.ts` (usando um HOME temporário, escrevendo `installed_plugins.json` e `.zcode-plugin/plugin.json` ou `.claude-plugin/plugin.json`):

- **Descoberta de agents de plugin instalados**: criar um plugin instalado com `agents/foo.md` (com frontmatter) + `installed_plugins.json`, e afirmar que `list().pluginAgents` contém esse agent, com `source === "plugin"`, `path` apontando para o arquivo e `name`/`description` vindos do frontmatter.
- **Separação entre projeção de recurso e de runtime**: afirmar que `list().agents` contém simultaneamente o nome canônico e o nome cru único, enquanto
  `list().pluginAgents` contém apenas o nome canônico para o mesmo arquivo.
- **Sem duplicação na página de configurações**: quando o serviço devolve as duas projeções, Settings > Subagents renderiza apenas a linha do recurso de plugin canônico.
- **Plugin não habilitado não produz saída**: quando o plugin está como `false` em `enabledPlugins`, `pluginAgents` não contém seus agents.
- **Manifest declarando explicitamente o caminho de agents**: com o manifest contendo `"agents": "custom-agents"`, afirmar que o escaneamento é de `custom-agents/` e não do `agents/` padrão.
- **Prioridade do agent de usuário**: havendo um agent com o mesmo nome no diretório de usuário e no pacote do plugin, afirmar que no resultado esse nome vem do usuário (`source === "user"`) e o homônimo do plugin é pulado.
- **Fallback para o diretório padrão**: quando o manifest não declara o campo `agents` mas existe o diretório `agents/`, a descoberta funciona.

## Tratamento de erros

- Configuração ausente / `installed_plugins.json` inexistente / ilegível: reutilizar o `try/catch` de fallback dos helpers existentes, retornando vazio e sem lançar.
- Falha de leitura ou parsing de um markdown de agent individual: ignorar essa entrada, sem afetar os demais agents.
- Escape do diretório (caminho `agents` do manifest fora dos limites): `resolveInside` retorna `null` e o caminho é descartado.

## O que não será feito (YAGNI)

- Não modificar o formato do arquivo de agent nem o protocolo de execução do subagent.
- Não alterar i18n nem estender os contratos `AgentSummary` / `AgentsListResult`.
- Não copiar fisicamente para `~/.zcode/agents`.
- Não extrair os helpers de descoberta de plugin para um módulo comum (mantendo o mesmo estilo "cada um copia" de skills/commands).

## Verificação

Antes de concluir a alteração, executar `npm run lint` e `npm test` (pelo menos cobrindo os testes de subagents de `packages/services`).