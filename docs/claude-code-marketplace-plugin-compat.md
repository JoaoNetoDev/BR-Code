# Especificação de implementação da compatibilidade de plugins do Claude Code Marketplace

## Objetivo

O ZCode precisa fazer o melhor esforço de compatibilidade com plugins do Claude Code Marketplace, mas não pode trazer diretamente para o runtime atual do ZCode a semântica de runtime de alto privilégio do Claude. A primeira fase implementa o ciclo de vida do marketplace, o estado de instalação, o estado de habilitação, o diagnóstico de compatibilidade e a projeção de recursos de baixo risco; capacidades que faltem modelo de segurança ou base de execução precisam ser identificáveis, exibíveis e diagnosticáveis, mas não podem rodar silenciosamente.

## Escopo por fases

### V1a: ciclo fechado de instalação

- Suportar marketplace `add/list/update/remove`.
- Suportar plugin `install/uninstall/update`.
- Registrar por padrão a source de marketplace oficial da Claude: `claude-plugins-official` apontando para `anthropics/claude-plugins-official`. O mercado padrão fornece apenas a origem do catálogo, sem instalar nem habilitar automaticamente nenhum plugin da Claude.
- Adicionar `installed_plugins.json` para guardar o estado de instalação; continuar usando o `plugins.enabledPlugins` existente para o estado de habilitação.
- A discovery lê as raízes de cache instaladas e preserva os plugins inline já existentes em `plugins.dirs`.
- Compatibilidade com a estrutura padrão do Claude Marketplace: ler preferencialmente `.claude-plugin/marketplace.json`, mantendo ao mesmo tempo `marketplace.json` na raiz como fallback de ZCode/dados antigos.
- Emitir diagnostics de compatibilidade, incluindo capacidades unsupported / diagnostic-only; plugins disabled também precisam exibir esses diagnostics na página de gerenciamento, e não só descobrir depois de habilitado.

### V1b: projeção de execução de baixo risco

- Executar `skills`, a raiz de commands, `mcpServers` e defaults de `userConfig` não sensíveis. Artefatos instalados de `zcode-plugins-official` e `claude-plugins-official` podem injetar hooks; `hooks` de V1 de outros plugins de marketplace de terceiros são apenas analisados e diagnosticados por padrão, sem injeção no runtime, e só poderão ser habilitados depois de um gate explícito de confiança/permissão.
- Suportar aliases de variáveis de template Claude/ZCode.
- A key de MCP server usa o namespace do plugin, evitando que múltiplos plugins declarem servers com o mesmo nome e se sobrescrevam.
- `userConfig` sensível só pode entrar em MCP env / credential / runtime secret path; não pode entrar em command, skill ou conteúdo markdown visível ao modelo.

### V1c: compatibilidade reforçada

- Suportar dependency resolver: resolver closure, dependências ausentes e ciclos na instalação.
- Bloquear por padrão dependency entre marketplaces; só um allowlist explícito deixa passar.
- Suportar o object mapping de commands da Claude e `content` inline; os arquivos gerados precisam ficar dentro da plugin cache/data root.
- Adicionar na UI uma entrada para configurar userConfig.

### V2

- Plugin agents executando por completo.
- LSP, outputStyles, channels, MCPB/DXT, enterprise policy, seed marketplace, GCS mirror, daemon de auto-update.

## Modelo de domínio

`marketplace` e `source` são dois eixos diferentes e não podem ser misturados:

- `marketplace` representa o mercado ao qual a identidade do plugin pertence, por exemplo `zcode-plugins-official`, `claude-plugins-official`, `inline` ou um id de marketplace customizado.
- `source` representa a posição/origem de carregamento local atual, por exemplo `official`, `inline`, `cache`.

Por isso V1 não adiciona `"marketplace"` a `PluginSource`. Se for necessário distinguir depois um "produto em cache instalado pelo usuário a partir de um marketplace", deve-se adicionar um valor semanticamente claro, como `"installed"` ou `"managed-cache"`, em vez de reutilizar o conceito de marketplace.

O id do plugin continua sendo:

```text
<plugin-name>@<marketplace>
```

Plugins inline locais usam o marketplace `inline`. Plugins do Claude Marketplace usam o id do seu marketplace, por exemplo `claude-plugins-official`.

## Layout de armazenamento

```text
~/.zcode/cli/plugins/
  known_marketplaces.json
  installed_plugins.json
  marketplaces/
    {marketplace}/marketplace.json
  cache/
    {marketplace}/{plugin}/{version}/
      .zcode-plugin/plugin.json
      .claude-plugin/plugin.json
      .mcp.json
      skills/
      commands/
  data/
    {pluginId}/
```

`cache` é o artefato de instalação substituível e `data` são os dados persistentes do plugin. Ao desinstalar um plugin, o artefato de instalação é removido por padrão e o `data` não é apagado; somente um purge explícito apaga o `data`.

O `zcode-plugins-official` do próprio ZCode é o único mercado oficial: as fatias de diretório embutidas no pacote de instalação e as fatias de diretório entregues pela source CDN oficial são mescladas pelo nome do plugin em um mesmo manifest de marketplace, e em caso de conflito a entrada de mercado do CDN tem precedência. O `claude-plugins-official` oficial da Claude embute apenas a source de marketplace e atualiza o catálogo sob demanda na primeira exibição, instalação ou validação; uma falha na atualização precisa retornar diagnóstico e manter a página de gerenciamento de plugins utilizável, sem bloquear a gerenciamento de plugins instalados por indisponibilidade de rede.

### Claude Official Marketplace como dependência fraca

`claude-plugins-official` é uma origem de catálogo opcional e não pode se tornar uma dependência rígida do gerenciamento de plugins ou de outras operações de mercado:

- Cada atualização do catálogo do mercado Claude usa um timeout total independente de 30 segundos e aborta as requisições HTTP/Archive subjacentes via `AbortSignal`; após o timeout, retorna imediatamente `plugin_archive_fetch_failed` (ou o diagnóstico da origem correspondente).
- A atualização completa ainda é executada mercado a mercado entre os mercados conhecidos, mas timeout/falha do Claude apenas registra `lastRefreshFailure` e preserva o último snapshot bem-sucedido; os outros mercados continuam sendo atualizados e não podem ser abortados antecipadamente por causa do Claude.
- Os caminhos que carregam o catálogo Claude de forma lazy, como o primeiro carregamento da página de configurações, os detalhes do mercado e a validação, também são protegidos pelo orçamento de 30 segundos; quando já existe manifest local, continua lendo offline e não força conexão de rede só para a leitura de visão geral.
- Todas as requisições HTTP de catálogo de marketplace, ícones da Claude e GitHub Archive precisam passar por um adapter unificado de egress HTTP web, obedecendo a `ZCODE_HTTP_PROXY` / `ZCODE_NO_PROXY`, e caindo para o proxy de sistema capturado depois que o Agent sela o shell do usuário; é proibido que esses caminhos chamem diretamente o `fetch` nativo sem proxy configurado.
- Esse orçamento restringe apenas o **catálogo do marketplace** da Claude. As origens de plugins de terceiros realmente instaladas pelo usuário continuam sendo executadas conforme seu próprio tipo de source, e um timeout de catálogo não pode ser tratado como timeout de instalação de plugin.

Cadeia de estados:

```text
Requisição de catálogo Claude
  ├─ concluída em 30s ──> atualiza manifest / lastUpdated
  └─ timeout ou falha ──> aborta a requisição subjacente -> preserva o snapshot antigo + lastRefreshFailure
                                      └─> outros marketplaces continuam
```

Ao registrar um marketplace, a posição canônica do manifest do repositório/diretório de origem é `.claude-plugin/marketplace.json`; o cache local do ZCode pode continuar gravando o manifest normalizado em `marketplaces/{marketplace}/marketplace.json`, mas a leitura de fontes externas não pode reconhecer apenas o `marketplace.json` da raiz.

## Compatibilidade de Marketplace Source

V1 precisa reconhecer o schema de source do Claude Marketplace e tratá-lo por nível de suporte:

| source | Comportamento em V1 |
| --- | --- |
| `url` | Suporta leitura direta do marketplace JSON; preserva headers mas V1 não envia header sensível |
| `github` | Suporta repo/ref/path; GitHub HTTPS público prefere baixar Archive e funciona mesmo sem Git do sistema; path padrão é `.claude-plugin/marketplace.json` |
| `git` | Suporta url/ref/path; GitHub HTTPS público normalizável prefere baixar Archive e outras origens usam o Git do sistema; lê `.claude-plugin/marketplace.json` ou path |
| `file` | Suporta apontar para o arquivo de marketplace JSON |
| `directory` | Suporta `.claude-plugin/marketplace.json` dentro do diretório e o fallback do `marketplace.json` da raiz |
| `settings` | Pode ser analisado e normalizado em marketplace sintético |
| `npm` | Reconhecido e retorna diagnostic unsupported; não executa install |
| `hostPattern` / `pathPattern` | Usados apenas em cenário de enterprise policy; V1 reconhece como diagnostic unsupported |

O seed de marketplace padrão só é escrito quando `known_marketplaces.json` não tem um mercado com o mesmo nome. Se o usuário já tiver um registro de marketplace com o mesmo nome, o registro do usuário precisa ser preservado e não pode sobrescrever `source`, `addedAt` ou `lastUpdated`. Depois de remover o marketplace padrão, a próxima leitura da lista de marketplaces o restaura; ocultar permanentemente o mercado padrão não faz parte de V1.

Escopo de suporte de `source` da entrada de plugin em V1:

| plugin source | Comportamento em V1 |
| --- | --- |
| `"./relative"` | Suporta, resolvendo a partir da raiz do marketplace |
| `{source:"directory"}` | Suporta diretório local |
| `{source:"github"}` / `{source:"git"}` / `{source:"url"}` | Suporta ref/sha; `commit` é fallback de `sha`; GitHub HTTPS público prefere baixar Archive por `sha/commit > ref > HEAD` e funciona sem Git do sistema; quando a entry traz `path`, instala só o subdiretório. Outras URLs mantêm a semântica Git legada |
| `{source:"url", type:"git"}` | Origem Git explícita; GitHub HTTPS público ainda pode ser materializado por Archive e privados/SSH/não-GitHub usam o Git do sistema |
| `{source:"url", type:"zip"}` | Suporta download de zip do CDN, verificação de `sha256`, extração segura e instalação segundo o diretório de cache existente; o CDN remoto precisa ser HTTPS e o fixture local pode usar HTTP loopback |
| `{source:"git-subdir"}` | Suporta ref/sha; `commit` é fallback de `sha`; GitHub HTTPS público instala o subdiretório especificado via Archive e outras origens usam o Git do sistema |
| `{source:"npm"}` / `{source:"pip"}` | Reconhecidos e retornam diagnostic unsupported; não executa package manager |

## Matriz de compatibilidade de Manifest

| Campo | Comportamento em V1 |
| --- | --- |
| `name` / `version` / `description` / `author` / `license` | Lidos e exibidos |
| `skills` | Executa em V1b |
| `commands` | V1b suporta diretório; V1c suporta object mapping / inline content |
| `hooks` | V1 analisa e diagnostica; marketplaces de terceiros não rodam por padrão e oficial/inline mantêm o comportamento confiável atual |
| `mcpServers` | Executa em V1b; server key força namespace |
| `userConfig` | V1b suporta defaults e required; sensible não pode ter configure em texto claro antes de conectar ao credential |
| `dependencies` | Resolver em tempo de install na V1c; em load-time deixa de reportar unsupported |
| `agents` | Somente diagnóstico, não registrado como Agent tool |
| `lspServers` / `outputStyles` / `channels` / `settings` | Somente diagnóstico |
| source `npm` / `pip` / `hostPattern` / `pathPattern` | V1 reconhece mas emite diagnostic unsupported |

O parse do Manifest precisa preservar a informação original desses campos ou declará-los explicitamente como `unknown`; caso contrário não é possível fazer diagnóstico visível de capacidades somente-diagnóstico.

## Interfaces de protocolo

Os novos métodos precisam ter schema Zod de runtime em `packages/shared/src/zcode-protocol/index.ts` e reutilizar a mesma fronteira de protocolo em desktop / web / mobile.

- `plugins/overview`
- `plugins/marketplace/list`
- `plugins/marketplace/add`
- `plugins/marketplace/remove`
- `plugins/marketplace/update`
- `plugins/install`
- `plugins/uninstall`
- `plugins/update`
- `plugins/configure`
- `plugins/validate`

`plugins/describe` é a interface somente leitura de enumeração de componentes da página de detalhes do plugin, usada para retornar os nomes e descrições opcionais de skills, commands, agents, hooks e MCP servers de um único plugin. Ela não inicia MCP, não executa hooks e não resolve variáveis de runtime. Plugins instalados precisam ler primeiro o cache/diretório de instalação local; candidatos não instalados só podem ter a source de marketplace analisada sob demanda.

Restrição de correção de bug: o escopo de enumeração de MCP e hook de `plugins/describe` precisa estar alinhado ao plugin loader real e não pode ler apenas campos inline de `plugin.json`. O nome de MCP server precisa vir da união de `.mcp.json` na raiz do plugin com `manifest.mcpServers`; o nome de evento de hook precisa vir da união de `hooks/hooks.json` com `manifest.hooks`. Caso contrário, plugins do Claude Marketplace que declaram capacidades por arquivos convencionais (por exemplo `airtable`, que declara MCP via `.mcp.json`) deixariam de mostrar componentes nos detalhes do mercado, enquanto os detalhes de um plugin instalado conseguiriam mostrar por causa de `plugins/list` usar metadata do loader, produzindo uma contagem de componentes inconsistente entre os dois lados.

Os plugins descobertos retornados por `plugins/list` e `plugins/overview` precisam conter um `hookDetails` serializável. Cada detalhe é expandido por item individual de execução de hook e contém no mínimo:

- `event`: nome do evento de Hook Claude/ZCode, por exemplo `PreToolUse`, `PostToolUse`, `Stop`.
- `matcher`: string de matcher opcional; quando não declarada representa o matcher padrão daquele evento.
- `type`: `command` ou `process`.
- `command` / `args`: comando de execução e argumentos.
- `timeoutMs` / `timeout`, `async`, `shell`, `statusMessage`: parâmetros de execução que o ZCode já reconhece na configuração original do hook.
- `sourcePath`: se o detalhe vem de `.claude-plugin/plugin.json`, `.zcode-plugin/plugin.json` ou `hooks/hooks.json`.
- `runnable`: se o runtime atual injeta aquele hook na execução. Plugins confiáveis de marketplace oficial / inline podem ser `true`; marketplaces de terceiros devem ser `false` por padrão em V1, apenas exibidos como diagnóstico.

A exibição de detalhes de hook não pode mudar a fronteira de segurança: análise e exibição podem ocorrer com o plugin não habilitado, mas um Hook não confiável não pode ser injetado no runtime só porque a página de detalhes o torna visível.

`plugins/validate` é um dry-run somente leitura: não grava estado de instalação, não habilita plugin, não inicia MCP e não executa hooks/commands. Ele não pode retornar apenas a matriz estática de compatibilidade, senão a UI anunciará incorretamente que o plugin é compatível.

A profundidade de varredura do validate é distinguida por tipo de alvo:

- validate de source de marketplace varre o manifest do marketplace, o shape das entries, o closure de dependências e a plugin root local existente junto com o repositório do marketplace. Para diretórios agregadores como o Claude Marketplace oficial, uma entry pode apontar para centenas de repositórios git externos; o validate de source não clona um a um esses plugins remotos e, em vez disso, retorna o diagnóstico `plugin_validation_deferred`, indicando que no install ou no validate de um plugin isolado eles serão puxados e escaneados em profundidade sob demanda.
- validate de entry de marketplace / plugin instalado precisa varrer profundamente a plugin root alvo, retornando manifest, path, compatibilidade, userConfig e diagnósticos de namespace/variável de MCP.

Essa camada garante que a "sonda antes de adicionar o mercado" da UI não trava com as 236 sources externas do marketplace oficial, enquanto o ciclo fechado de instalação continua fazendo um diagnóstico de compatibilidade completo antes de realmente usar um plugin.

## Fronteiras de segurança

- Plugin agents não rodam em V1. O runtime de Agent atual do ZCode é somente Explore, e conectar diretamente os plugin agents da Claude contornaria o tool allowlist, o permission broker e a política de isolamento.
- `userConfig` sensível não pode ser substituído dentro de texto visível ao modelo.
- `userConfig` sensível não pode ser escrito em texto claro na config comum via `plugins/configure` antes de estar conectado ao credential store.
- Hooks de marketplaces de terceiros não são injetados no runtime por padrão; apenas o marketplace oficial do ZCode, o marketplace oficial da Claude ou plugins inline explicitamente confiáveis mantêm o comportamento de hook.
- O dependency resolver bloqueia por padrão dependency entre marketplaces.
- O caminho de geração de command inline precisa ser restringido a cache/data root via `resolveInside`.
- Web/mobile remote lê e escreve o estado de plugin apenas pelo shared-host/agent protocol, sem afundar o estado de runtime de session/task/plugin do ZCode no relay ou no processo main.
- A materialização sem Git de origens públicas do GitHub, o fallback de Git do sistema e a ativação atômica de cache seguem a [Especificação de instalação de plugin source GitHub público sem Git](./plugin-github-archive-source.md). A discovery de plugins instalados lê apenas o cache local e uma falha na atualização do Marketplace não pode afetar a execução dos plugins existentes.

## Aceitação

- Testes unitários cobrem marketplace storage, migração de estado instalado, matriz de compatibilidade de manifest, namespace de MCP, userConfig sensível e diagnósticos de dependência.
- O schema de protocolo cobre parse de success/failure.
- A UI cobre o gerenciamento básico de marketplace / installed / diagnostics.
- Executar `pnpm typecheck` e `pnpm lint`.
- Depois de iniciar o dev local, verificar via CDP que a página de gerenciamento de plugins não tem console error e que as interações básicas funcionam.
- Selecionar os plugins top atuais do Claude Marketplace para teste de compatibilidade de instalação/diagnóstico/carregamento de recursos de baixo risco; capacidades de alto risco precisam exibir diagnostic-only, em vez de falhar ou executar silenciosamente.

## Registro de verificação do Claude Marketplace oficial

Em 2026-06-24 foram selecionados 5 plugins reais de `claude-plugins-official` para verificação temporária de storage de instalação e projeção de runtime:

| Plugin | Capacidades cobertas | Conclusão da verificação |
| --- | --- | --- |
| `commit-commands` | commands | Descobriu `/commit`, `/commit-push-pr`, `/clean_gone` |
| `claude-md-management` | commands, skills | Descobriu `/revise-claude-md` e 1 skill |
| `hookify` | commands, skills, hooks | Descobriu `/hookify`, `/configure`, `/help`, `/list`; injetou hooks `PreToolUse` / `PostToolUse` / `Stop` / `UserPromptSubmit`; `pretooluse.py` executou com sucesso com JSON stdin real |
| `context7` | MCP stdio | Projeção em runtime `plugin:context7:context7`; após conectar pelo MCP SDK, `listTools` retorna `query-docs`, `resolve-library-id` |
| `playwright` | MCP stdio | Projeção em runtime `plugin:playwright:playwright`; após conectar pelo MCP SDK, `listTools` retorna 23 browser tools |

Descobertas e correções durante a verificação:

- Nomes de arquivo de comando oficiais da Claude podem conter `_`, por exemplo `clean_gone.md`. O padrão de nome de command customizado passou a ser compatível com `_`.
- Entries de marketplace oficiais e de terceiros podem usar `commit` para indicar um pin git. O Installer trata `commit` como fallback de `sha`, mas continua priorizando o `sha` do schema oficial.
- Os hooks nos artefatos instalados de `claude-plugins-official` precisam ser executáveis; hooks de marketplaces de terceiros não oficiais continuam sendo somente-diagnóstico.