# Worklog — Redesign da navegação do Marketplace de Plugins + Detalhes de Componentes Sob Demanda

- **Data:** 2026-06-26
- **Branch:** `feature-harness-improve`
- **Autor:** desenvolvimento front-end do marketplace de plugins
- **Spec:** [`docs/plugin-marketplace-ui-ux.md`](../../plugin-marketplace-ui-ux.md) (seção revisada em 2026-06-25)

## Objetivo

Redesenhar a aba de navegação do **Marketplace** de plugins como um seletor de marketplace à esquerda, uma grade de cartões de plugin à direita e um alternador lista↔detalhe. A visão de detalhe deve mostrar o **nome + descrição** de cada componente (Skills / Subagents / Commands / Hooks / MCPs) — mesmo para plugins **não instalados**.

## Restrição principal e a decisão que moldou tudo

A restrição original era "não mudar o protocolo de dados". Mas a investigação provou que o protocolo do marketplace (`ZCodeAvailablePluginSummary`) carrega apenas um array grosseiro `componentTypes` — **sem nomes de componentes, sem descrições, sem RPC de manifesto por plugin**. Portanto, exibir nome + descrição por componente é impossível sem um novo canal de dados CLI→UI.

Verificamos o formato do marketplace:
- O schema da entrada do marketplace *permite* um manifesto embutido, mas arquivos `marketplace.json` reais carregam apenas um **ponteiro** (`"source": "./plugins/<name>"`).
- Portanto, os nomes e descrições dos componentes só estão disponíveis lendo o diretório do plugin (cache instalado ou origem) sob demanda.

**Decisões do usuário:** (1) adicionar um RPC sob demanda; (2) incluir nomes e descrições dos componentes lendo o frontmatter de cada componente. Esta é a única mudança de protocolo.

## O que foi construído

### 1. Novo método de protocolo `plugins/describe` (a única mudança de protocolo)
`packages/shared/src/zcode-protocol/index.ts`
- `zcodeProtocolMethods.pluginsDescribe = "plugins/describe"`
- params `{ workspace, marketplace, pluginName }`
- result `{ components: Array<{ kind: agent|command|skill|hook|mcp, items: Array<{ name, description? }> }>, diagnostics? }`
- registrado na tabela de contrato de session methods.

### 2. Handler no CLI (apps/zcode-cli)
- `adapters/src/plugins/marketplace.ts` → `describeMarketplacePlugin({ marketplace, name, storageRoot })`:
  - instalado → `resolveInstalledPluginRoot` (diretório de cache local, offline);
  - não instalado → `resolvePluginSourceRoot` (clone temporário via `mkdtemp`, limpo no `finally`) — espelha `validateMarketplacePlugin`.
- `adapters/src/plugins/plugin-components.ts` (**novo, 201 linhas**): enumerador puro de componentes
  sobre uma raiz resolvida + manifesto. Lê `commands/`, `agents/` (frontmatter `.md`),
  `skills/` (frontmatter `SKILL.md`), hooks (eventos do manifesto), mcp (nomes de servidores do manifesto).
  Extraído de marketplace.ts para impedir que esse arquivo cresça mais (ele já excede
  a linha de base `max-lines` do repo — preexistente).
- `bootstrap/src/plugins.ts` → wrapper `describeZCodePlugin`.
- `bootstrap/src/zcode-protocol/plugins.ts` → handler `describePlugin` (mapeia o resultado do adapter para o shape do protocolo).
- `bootstrap/src/zcode-protocol/server.ts` → roteou o novo método.

### 3. Camada de services
`packages/services/src/zcode-agent/{zcodeAgent.ts,zcodeAgentService.ts}` →
`describePlugin(params)` seguindo o padrão de chamada `pluginsValidate`.

### 4. UI (packages/ui)
- **`PluginMarketplaceManagement.tsx`** (reescrito): card de origem do marketplace (mantido) → busca →
  `MarketplaceSwitcher` à esquerda (vertical, degrada para chips horizontais em larguras estreitas) +
  área de conteúdo à direita que alterna entre `MarketplaceGrid` (visão A: grade de cartões) e
  `MarketplaceDetailView` (visão B: `← Voltar`). Abrir os detalhes dispara o describe sob demanda;
  loading / erro / vazio degradam com elegância (fallback para badges de `componentTypes` + retry).
- **`PluginComponentGroups.tsx`** (novo): renderer compartilhado "nome — descrição" em duas linhas, usado tanto
  pela visão de detalhe do marketplace quanto pelo diálogo de detalhe de plugin instalado, para uma saída consistente.
- **`pluginManagedResourceGroups.ts`**: `describeResultToDisplayGroups()` mapeia o resultado do describe
  para grupos de exibição ordenados (agent→command→skill→hook→mcp).
- **`InstalledPluginManagement.tsx`**: passou a usar o componente compartilhado para a renderização dos grupos.
- **`store/pluginManagementStore.ts`**: `describeCache` (chaveado por pluginId, loading/loaded/error)
  + ação `describePlugin`; acertos de cache evitam refetch, `force` retenta.
- **i18n**: chaves en-US + zh-CN para o switcher, o botão Get e os estados de loading/erro/vazio.

### Fora de escopo (YAGNI)
Uma navegação de categorias à esquerda (Destaques / Infraestrutura / …) — o protocolo não tem
campo `category`, adiado. install/uninstall/CRUD de marketplace intocados.

## Verificação

- `tsc -b` limpo para todos os pacotes tocados (shared, services, ui, cli adapters+bootstrap).
  Observação: um erro istanbul-types preexistente em `packages/desktop/test/e2e/reporting/e2e-ui-coverage.ts`
  existe na linha de base (confirmado via `git stash`) — sem relação com esta mudança.
- `oxlint` limpo para todos os arquivos novos/modificados. Os erros de `max-lines` em
  `marketplace.ts`/`index.ts`/`plugins.ts` são violações preexistentes da linha de base (confirmadas via
  stash); a extração de `plugin-components.ts` reduziu o crescimento líquido de marketplace.ts.
- **Testes unitários:** suíte completa via hook pre-push — **656 arquivos / 5262 testes aprovados**.
- **Capturas de tela via CDP** (app desktop real, dev:desktop:test, porta 9229) em `tmp/shots/`:
  - `00-current.png`: a grade de cartões e o seletor de marketplace renderizam corretamente.
  - `01-detail.png`: o alternador da visão de detalhe funciona; "← Voltar", badge de não instalado, linha de
    origem e **seção de componentes mostrando "技能 6 项" (badge verde)** — confirmando que `plugins/describe`
    funciona ponta a ponta e renderiza grupos com nome+descrição.

### Correção de bug durante a verificação
A captura de tela do usuário expôs um texto de cartão embaralhado. Causa raiz: o grid externo do
`MarketplacePluginCard` usava `grid-cols-[auto_minmax(0,1fr)_auto]` (3 colunas) com apenas 2 filhos diretos,
então o botão "Get" caía na coluna `1fr` do meio e sobrepunha o texto. Corrigido para 2 colunas
`[minmax(0,1fr)_auto]`. Reverificado por captura de tela.

## Commits (todos em origin/feature-harness-improve)
- `bdd833ddf` docs(plugins): spec marketplace browse redesign and on-demand plugins/describe
- `443dc16b8` feat(plugins): add plugins/describe to enumerate marketplace plugin components
- `30bb48bdf` feat(ui): redesign plugin marketplace browse with switcher, card grid and detail view

## Pendências / riscos
- **Windows/Linux:** o caminho describe do CLI usa apenas `node:path`/`node:fs`/`mkdtemp(tmpdir())`,
  sem separadores escritos à mão — mas o git-clone-on-describe para plugins não instalados foi
  exercitado apenas no macOS. Clone/limpeza multiplataforma ainda precisa de uma passada no Windows.
- **Custo de rede:** descrever um plugin não instalado clona sua origem para um diretório temporário a cada
  vez (e depois limpa). O resultado é cacheado pela UI por pluginId por sessão, mas uma abertura a frio de muitos
  plugins não instalados = muitos clones. Considerar um cache de curta duração no CLI se isso incomodar.
- **Parsing de frontmatter** em `plugin-components.ts` é um extrator leve de nome/descrição
  (duplica o idioma dos adapters de skills/commands em vez de importá-lo). Se surgir um terceiro consumidor
  de frontmatter, extrair um util compartilhado.
- A navegação de categorias foi adiada aguardando um campo `category` no protocolo.

## Artefatos descartáveis (não commitados)
- `tmp/cdp-shot.mjs` — auxiliar de captura de tela via CDP (`ws` puro sobre o page target; o puppeteer trava no Electron).
- `tmp/shots/*.png` — capturas de tela de verificação.
- `.claude/plans/plugin-ui-redesign-notes.md` — notas de uma sessão anterior (uma tarefa diferente: o
  redesign da lista de instalados), deixado sem rastreio de propósito.