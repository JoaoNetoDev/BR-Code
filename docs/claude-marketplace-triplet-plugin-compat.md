# Especificação de verificação de compatibilidade de plugins do Claude Marketplace (três recursos)

## Contexto

Após `docs/hooks-implementation-analysis.md`, é necessário continuar verificando plugins do marketplace do
Claude Code que contenham simultaneamente **skills, commands e MCP servers**, confirmando se a descoberta, instalação,
runtime projection de plugins do ZCode e os adapters downstream de skill/command/MCP são totalmente compatíveis.

Esta rodada verifica apenas a projeção de recursos de baixo risco: não inicia MCP servers reais, não executa commands e não roda hooks.

## Origem das amostras

As amostras vêm do marketplace manifest `claude-plugins-official` já em cache na Claude CLI local:

```text
~/.claude/plugins/marketplaces/claude-plugins-official/.claude-plugin/marketplace.json
```

Critério de seleção: ler o `tree` do GitHub da entry do marketplace e confirmar que o diretório raiz do plugin possui ao mesmo tempo:

- `skills/*/SKILL.md`
- `commands/*.md`
- a configuração de MCP apontada por `.mcp.json` ou por `mcpServers` no manifest

As 10 amostras fixadas são:

| Plugin | Forma do source | skills | commands | MCP |
| --- | --- | ---: | ---: | --- |
| `appwrite` | repo root | 11 | 2 | `.mcp.json` |
| `aws-agents-for-devsecops` | `git-subdir` | 13 | 9 | `.mcp.json` |
| `bigdata-com` | `git-subdir` | 1 | 27 | `.mcp.json` |
| `cloudflare` | repo root | 11 | 2 | `.mcp.json` |
| `confidence` | repo root | 11 | 5 | `.mcp.json` |
| `convex` | repo root + manifest paths | 2 | 1 | `.mcp.json` |
| `dominodatalab` | repo root | 23 | 4 | `.mcp.json` |
| `fiftyone` | repo root | 16 | 2 | `.mcp.json` |
| `legalzoom` | `git-subdir` | 1 | 1 | `.mcp.json` |
| `logfire` | `git-subdir` | 3 | 4 | `.mcp.json` / `mcp.json` |

Amostras reservas: `mercadopago`, `nimble`, `notion`.

## Estratégia de teste local

Adicionar testes offline de fixture na camada de adapter, sem depender de rede e sem ler o cache real do marketplace:

1. Construir em um diretório temporário um marketplace manifest contendo os 10 plugins acima.
2. Para cada plugin, escrever `.claude-plugin/plugin.json`, `skills/`, `commands/` e `.mcp.json`.
3. Simular a instalação do marketplace via `addMarketplace()` + `installMarketplacePlugin()`.
4. Habilitar os 10 plugins com `createNodePluginAdapter().discoverPlugins()`.
5. Verificar a saída da camada de plugin:
   - os 10 plugins estão enabled.
   - cada plugin tem `skillRoots`, `commandRoots` e `mcpServers`.
   - a key do MCP server é namespaced como `plugin:<plugin-name>:<server-name>`.
6. Continuar chamando os adapters downstream para verificar:
   - `createNodeSkillAdapter().discoverSkills({ roots })` descobre as skills de cada plugin.
   - `createNodeCustomCommandAdapter().discoverCommands({ roots })` descobre os commands de cada plugin.

## Critérios de compatibilidade

Considerado compatível:

- `.claude-plugin/plugin.json` pode ser lido.
- Os diretórios padrão `skills/` / `commands/` podem ser projetados para runtime roots.
- A forma de path no manifest (por exemplo `skills: "./skills/"`, `commands: "./commands/"`,
  `mcpServers: "./.mcp.json"`) pode ser projetada.
- `.mcp.json` pode ser lido e convertido em `McpServerConfig` do ZCode.
- Variáveis como `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}` e `${ZCODE_PROJECT_DIR}`
  no env do MCP podem ser substituídas.

Considerado incompatível ou que exige diagnóstico separado:

- Apenas um `mcp.json` na raiz, sem referência no manifest via `mcpServers`, não é lido automaticamente pelo ZCode hoje.
- Se um MCP server real consegue iniciar está fora do escopo desta rodada de testes; aqui só se verifica a projeção de configuração.

## Semântica do campo `skills` (problema de diretório extra já corrigido)

Na especificação de plugins do Claude, os itens do array `skills` do manifest apontam para «o próprio diretório da skill»
(dentro do item está o `SKILL.md` diretamente, como `./skills/engineering/tdd`); a forma string aponta para «o diretório
coleção de skills» (cujas subpastas de um nível são, cada uma, uma skill). As duas formas são tratadas de maneira unificada pelas regras compartilhadas de varredura
(`apps/zcode-cli/packages/adapters/src/skills/scan.ts`):

- Quando a raiz da skill contém o próprio `SKILL.md`, a própria raiz é uma skill (semântica de item de array, consistente com a saída depth-0 do
  `skillDiscoveryWalk` do lado de services do desktop);
- Em seguida varre-se mais um nível de subdiretórios (forma string / layout de um nível do ZCode para o diretório padrão `skills/`), e os diretórios encontrados precisam
  de `SKILL.md` realmente existente para contar, de modo que diretórios de classificação (como `skills/engineering/`) não sejam contados por engano;
- Quando o root declarado e o root padrão atingem o mesmo `SKILL.md`, a deduplicação é feita por caminho de arquivo, e a contagem e os resultados de descoberta não dobram;
- Quando os paths de skills declarados explicitamente no manifest são varridos e resultam em 0 skills, é emitido o diagnóstico de warning `plugin_skill_root_empty`
  (o path declarado entra na message; o wire schema do protocolo não carrega campo path), exibido na área «Avisos» da página de detalhes do plugin, em vez de continuar em
  silêncio. A message diferencia a causa: `does not exist` (manifest configurado errado, só aceita ENOENT/ENOTDIR) e `does not contain any skills` (conteúdo vazio, incluindo o
  caso em que links foram recusados por segurança e a varredura terminou vazia).
- Limite de confiança: o conteúdo de um plugin não é confiável, então a varredura em plugin-scope **nunca segue links simbólicos** (incluindo junction do
  Windows) — recusa de link nas três granularidades: raiz própria, candidatos de subdiretório e o arquivo `SKILL.md`; escape em nível de diretório
  (`skills/evil-link -> ../../outside`) e em nível de arquivo (`SKILL.md -> ~/.aws/
  credentials`) são bloqueados com o mesmo padrão; recusar o link já elimina o escape, sem depender de decidir para onde o link aponta (sem predicado `relative` entre
  unidades de disco, sem ramificação por plataforma). A enumeração de componentes (`collectSkillComponents`) aplica a mesma regra incondicionalmente à raiz do
  plugin, sem depender de o manifest ter sido analisado com sucesso. A defesa lexical (`resolveInside`, que recusa caminhos absolutos e travessias com `..`) continua valendo. Roots de
  skills em nível de usuário (a importação por symlink em `~/.zcode/skills` é um recurso suportado) mantém o comportamento padrão de seguir links, sem alterações.

## Comandos de verificação

```bash
pnpm --filter @zcode/adapters test plugins
pnpm typecheck
pnpm lint
```