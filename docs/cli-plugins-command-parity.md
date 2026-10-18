# Subcomando `zcode plugins` da CLI

> Status: fase 1 MR1 (superfície de subcomandos). A fase 2 MR2 acrescentará o carregamento de plugins em nível de sessão via `--plugin-dir`.

## Contexto e objetivos

O ambiente externo precisa usar o modo headless para automatizar a avaliação de plugins em contêineres Docker (todos os plugins internos + o mercado oficial do zcode, modelos reais).
A orquestração da avaliação, o desenho das tarefas, a pontuação e a injeção de credenciais ficam no ambiente externo; o núcleo da CLI só precisa garantir que "a imagem consiga instalar todos os plugins,
cada execução consiga selecionar plugins e os resultados possam ser lidos de forma estruturada". A superfície de eventos stream-json e o modo de permissão headless (yolo por padrão) já são suficientes;
desta vez apenas se acrescenta a árvore de subcomandos `zcode plugins`; a superfície de comandos é compatível com o `claude plugin` do Claude Code, de modo que os scripts de avaliação externos podem ser reutilizados apenas trocando o binário da CLI.

## Superfície de comandos

| Subcomando | Comportamento | Ponto de implementação |
|---|---|---|
| `list [--json] [--available]` | Lista os plugins carregados (internos + instalados); `--available` acrescenta o catálogo do mercado | `listZCodePlugins` / `getZCodePluginsOverview` |
| `install <plugin>[@marketplace] [-s <scope>]` | Um name sem marketplace só instala se houver correspondência única em todos os mercados; nomes duplicados geram erro exigindo `@marketplace` | `installZCodeMarketplacePlugin` |
| `uninstall <plugin> [-s <scope>] [--keep-data] [--force]` | `--keep-data` remove apenas o cache de instalação e mantém `data/<plugin-id>`; em terminal não-TTY sem `--force` a execução é recusada | `uninstallZCodeMarketplacePlugin` (novo `keepData`) |
| `enable <plugin> [-s <scope>]` / `disable [plugin] [-a\|--all] [-s <scope>]` | `--all` desativa um a um os plugins atualmente habilitados; `--all` não pode ser usado junto com nome de plugin ou `--scope` | `setZCodePluginEnabled` |
| `update <plugin> [-s <scope>]` | Atualiza primeiro o catálogo do mercado de pertencimento e depois reinstala a mesma entrada; preserva `installedAt` e as chaves de usuário | novo `updateZCodeMarketplacePlugin` |
| `validate <path>` | Validação somente leitura de diretório de plugin local / plugin.json / catálogo de mercado / marketplace.json | novo `validateZCodePluginPath` → adapters `validateLocalPluginPath` |
| `marketplace add <source> [--scope] [--sparse <path>]` | `--sparse` é repetível e só tem efeito em fontes git/github (reaproveita o `sparsePaths` existente) | `addZCodePluginMarketplace` (novo `sparsePaths`) |
| `marketplace list [--json]` / `remove <name>` / `update [name]` | Lista, remove e atualiza mercados conhecidos | `getZCodePluginsOverview` / `removeZCodePluginMarketplace` / `updateZCodePluginMarketplace` |
| Alias `zcode plugin ...` | Alias no singular, com o mesmo comportamento de `zcode plugins` | `run.ts` |

## Contrato de saída JSON

Os campos mantêm a nomenclatura existente do zcode, com a seguinte estrutura:

- `list --json` emite por padrão um **array** (sem o wrapper `{cwd, diagnostics, plugins}`); cada entrada ganha um
  array `diagnostics` adicional, contendo apenas os diagnósticos cujo `pluginId` pertence a ela.
- `list --available --json` emite `{ installed, available, diagnostics }`.
- O JSON de `install` / `update` / `validate` / `marketplace update` traz `ok` e `diagnostics`;
  qualquer diagnóstico com `severity: "error"` resulta em `ok: false` e código de saída 1.

## Explicação de parâmetros e comportamento

| Item | Comportamento no zcode | Motivo |
|---|---|---|
| Valores de scope | `user` / `project` (project mapeia para o `workspace` interno); `local` dá erro direto | o zcode não tem uma camada de settings local |
| `uninstall --force` | Terminal não interativo recusa a desinstalação sem `--force` | válvula de segurança já existente no zcode, mantida |
| `marketplace add --scope` / `uninstall -s` | Valida apenas a grafia, sem mudar o comportamento | marketplaces conhecidos e registros de instalação são todos inventário do Host User |
| `marketplace add --sparse` | Não suporta argumentos variádicos; é preciso repetir `--sparse a --sparse b` | o parser global é um `parseArgs` estrito |
| Campos das entradas de `list --json` | Campos já existentes no zcode + `diagnostics` | não quebra os consumidores atuais |

## Pontos de implementação

- As flags de subcomando (`--available`, `-s/--scope`, `-a/--all`, `--keep-data`, `--sparse`) são registradas no parser global estrito de `run.ts`, coletadas em `PluginsCommandFlags` e repassadas, sem afetar outros comandos.
- `plugins-command.ts` usa a tabela `BOOTSTRAP_EXPORTS` para mapear nomes de dependências da CLI para nomes de exportação do bootstrap: os testes injetam implementações falsas pelo nome da dependência e a produção faz lazy load do bootstrap pelo nome da exportação.
- `update` não adiciona capacidade nova ao adapter: `cacheMarketplacePlugin` sobrescreve no lugar registros já existentes preservando `installedAt`, e `enablePluginsByDefaultInFileConfig` só completa valores padrão para ids não declarados explicitamente, portanto a atualização não inverte as chaves do usuário.

## Uso típico na avaliação externa

```bash
# Stage de build da imagem: instala tudo do mercado oficial
zcode plugins marketplace update
zcode plugins list --available --json | jq -r '.available[] | select(.installed==false) | .id' \
  | xargs -n1 zcode plugins install

# Contêiner de cada tarefa: habilita apenas o plugin avaliado
zcode plugins disable --all
zcode plugins enable <plugin-id>
zcode --prompt "<task>" --output-format stream-json
```

## Verificação

- Testes unitários: `apps/zcode-cli/packages/cli/tests/plugins-command.test.ts` (roteamento de subcomandos, mapeamento de scope,
  exclusão mútua de `--all`, repasse de `--keep-data`, formato do JSON, alias `plugin` e coleta de flags).
- Smoke test real (2026-09-14, `HOME`/`ZCODE_DATA_BASE_DIR`/`ZCODE_STORAGE_DIR` isolados, ZAPI GLM-5.3-Highspeed):
  `marketplace list` → `marketplace update zcode-plugins-official` (8 → 27 entradas) → `list --available --json`
  → `install lark-cli` → `plugin disable --all` → `enable lark-cli` → `update lark-cli` (already up to date)
  → `--prompt` exigindo o carregamento da skill de setup do lark-cli, com `tool.updated` e `toolName: "Skill"`
  aparecendo no stream-json, `skill: "lark-cli:setup"`, e o turno concluindo normalmente → após
  `uninstall lark-cli --keep-data --force`, `data/lark-cli@…` é preservado e o registro de cache é removido →
  `validate` retorna 0 / 0 / 1 para, respectivamente, diretório de plugin embarcado, arquivo plugin.json e caminho inexistente.
- Armadilhas do smoke test: no headless, o modelo padrão só lê `config.defaultModelSelection` de `~/.zcode/v2/provider_config.json`
  e precisa trazer `options.reasoningLevel`, caso contrário cai silenciosamente no primeiro modelo do primeiro provider.
