# TECH — Sub-agentes roteados por modelo

- **PRD:** [`PRD.md`](./PRD.md) (aprovado em 2026-10-18)
- **Slug:** `subagentes-roteados-por-modelo`
- **Escopo deste documento:** Release 1 (catálogo + roteamento + origem do modelo na UI). Release 2 (degradação) está desenhada na Seção 10 e **bloqueada pela questão Q1 do PRD**.

---

## 1. Estado atual da arquitetura nos pontos tocados

### 1.1 Como um sub-agente chega ao catálogo do pai

O caminho é um único, e é curto:

```
bootstrap/src/subagents.ts   → AgentProfile[]
   ↓  core/src/subagent/definitions.ts  (snapshot do turno)
   ↓  core/src/subagent/listing.ts:43    (formatAgentProfileForPrompt por perfil)
   ↓  core/src/runtime/helpers/agent-listing.ts:15  (coleta)
   ↓  core/src/runtime/methods/turn-loop.ts:126     (1x por turno, se a tool Agent existe)
   ↓  attachment sintético persistido como "user notice"
   ↓  entra no prompt do pai
```

Pontos verificados:

- A coleta só roda se a tool `Agent` estiver registrada (`core/src/subagent/listing.ts:20`).
- A renderização é uma linha por perfil: `` `- ${profile.name}: ${profile.description}${toolText ? ` (Tools: ${toolText})` : ""}` `` (`core/src/subagent/profile.ts:102-113`).
- O texto é **pré-renderizado** e persistido em `addedLines` (`core/src/agent/agent-listing-metadata.ts:4`), não re-derivado na leitura.
- `formatAgentProfilesForPrompt` (`core/src/subagent/profile.ts:89-100`) — o plural, com o heading `"Available agent types and the tools they have access to:"` — **não tem nenhum consumidor em produção**. Só testes: `core/tests/subagent-profile.test.ts:238,331,403` e `core/tests/persistent-agent-memory.test.ts:93`.

### 1.2 O diff é só de nomes — e isso é uma lacuna real (RF-09)

`collectAgentListingAttachment` (`core/src/subagent/listing.ts:14-46`) decide o que anunciar assim:

```ts
const delta: AgentListingDelta = {
  addedTypes: added.map((profile) => profile.name),
  addedLines: added.map((profile) => formatAgentProfileForPrompt(profile, input)),
  removedTypes,
  isInitial: announced.size === 0,
  showConcurrencyNote: true,
};
```

`announced` é reconstruído do histórico lendo **apenas `addedTypes`/`removedTypes`** (`listing.ts:22-30`), e `added` é `active.filter((profile) => !announced.has(profile.name))` (`listing.ts:33`) — um filtro **por nome**. Consequência: se o usuário muda o modelo de um sub-agente, o conjunto de nomes não muda, `added` fica vazio, e o early-return de `listing.ts:38` (`if (added.length === 0 && removedTypes.length === 0) return undefined;`) cancela tudo. **O pai continua vendo a linha antiga até algo mudar de nome.** Esse é o defeito que RF-09 precisa fechar.

### 1.3 Empacotamento de plugin: cinco registros manuais, e eles já divergem

Um plugin oficial é registrado em **cinco lugares independentes**, e nenhum teste garante que eles carreguem o mesmo conjunto:

| # | Registro | Local | Chaves |
|---|----------|-------|--------|
| R1 | Definição de seeding | `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts:198-227` (`.map()` para os 4 de documento) | `name` (ex.: `"pdf"`) |
| R2 | Embedding no CLI SEA | `apps/zcode-cli/packages/cli/scripts/sea-official-plugin-assets.mjs:95-104` | `name` + `packageName` (ex.: `"pdf"` + `"@zcode/pdf-plugin"`) |
| R3 | Bundle do desktop | `packages/desktop/scripts/prepare-agent-node-bundle.mjs:95-124` | `packageName` + `relativePath` + `stagedPath` |
| R4 | Prebuild remoto | `scripts/prepare-prebuilds.mjs:102-128` | `packageName` + `relativePath` + `stagedPath` |
| R5 | Allowlist do servidor remoto | `packages/server/src/remote/zcodeAgentOfficialPluginAssets.ts:5-21` | **nome de diretório** (ex.: `"pdf-plugin"`) |

**Os conjuntos já divergem hoje, e a divergência não é derivável por convenção.** Verificado nesta rodada: R1 declara `computer-use` (`official-plugin-definitions.ts:378`) e R2 **não tem** essa entrada. Além disso, a correspondência `name ↔ packageName` não é mecânica — `computer-use` corresponde a `@zcode/zcode-cua-plugin`, e `node-repl-host` a `@zcode/node-repl-host`, **sem** o sufixo `-plugin` que os outros seguem.

Verificação de consistência que **existe**: `bootstrap/tests/plugins.test.ts:196-227` (`definition.version === manifest.version === package.version` + existência de cada `requiredSeedPaths`) e `cli/tests/build-sea.test.mjs:640-664`. **Verificação que não existe:** igualdade de conjunto entre R1–R5.

O marketplace oficial é **hard-pinned**: `adapters/src/plugins/official-marketplace.ts:121-127` lança se o manifest não se chamar `zcode-plugins-official`, e o id de plugin é mintedado como `` `${name}@${OFFICIAL_PLUGIN_MARKETPLACE}` `` (`bootstrap/src/app/bundled-plugins.ts:108`). Não há como um fork semear um marketplace próprio por esse caminho.

O manifest do plugin vem de `.zcode-plugin/plugin.json` (`adapters/src/plugins/index.ts:935-948` — ordem: `.zcode-plugin` → `.claude-plugin` → `.codex-plugin`), e esse arquivo também é o **portão de existência** da raiz (`bundled-plugins.ts:345-353`). Os `agents/*.md` entram como componente `kind: "agent"` por varredura do diretório default (`adapters/src/plugins/plugin-components.ts:31-32`).

Detalhe crítico: `bootstrap/src/subagents.ts:102` lê o arquivo de `join(plugin.rootPath, "agents", ...)` **sempre** desse caminho literal. Agente declarado em caminho customizado no manifest é enumerado mas não carregável.

### 1.4 Desabilitar sub-agente de plugin não funciona hoje (RF-04)

`resolveSubagentRuntimeProfiles` (`packages/shared/src/subagent-runtime-config.ts:37-51`) filtra apenas perfis de escopo usuário:

```ts
profiles: profiles.filter(
  (profile) =>
    profile.source !== "user" ||
    !disabled.has(createAgentStateId({ name: profile.name, scope: "user", source: "user" })),
),
```

E o perfil de plugin **é parseado como `source: "user"`** (`bootstrap/src/subagents.ts:172-177`, `source: "user"` literal), com `namespacePluginAgentProfile` renomeando para `` `${plugin.name}:${bareName}` `` e **preservando `source: "user"`** (`subagents.ts:209-214`).

Resultado: a chave de filtro seria `user:user:<plugin>:<name>`, mas **nenhum escritor produz essa chave** — os escritores usam `createPluginAgentStateId` = `plugin:<pluginId>:<bare>` (`packages/shared/src/subagents-types.ts:152-154`), e esse formato só alimenta `pluginAgentModelSelectionOverrides`. Na UI, `supportsEnabledToggle` (`packages/ui/src/settings/SubagentsSection.tsx:144-146`) exige `source === "user" && readOnly !== true`, e linhas de plugin chegam com `source: "plugin"` e `readOnly: true` (`packages/services/src/subagents/subagentsService.ts:340-351`) — **o toggle nem é renderizado**.

### 1.5 Origem do modelo já existe em runtime, não na UI

`AgentSummary` carrega três campos de modelo (`packages/shared/src/subagents-types.ts:54-56`): `modelSelection`, `defaultModelSelection`, `modelSelectionOverride`. A distinção "herdado / do catálogo / manual" já é representável. O que falta é a apresentação.

### 1.6 Estilo de casa para descrição de roteamento

Já existe, mas **só em um dos dois built-ins**:

- `Explore` (`core/src/subagent/profile.ts:27-29`, ~380 chars) é o padrão completo: papel → condição de disparo ("use when…") → **anti-disparo** ("it doesn't review or audit it") → exemplo concreto de invocação.
- `general-purpose` (`profile.ts:77-78`, ~215 chars) é mais fraco: papel + condição de disparo, **sem anti-disparo e sem exemplo de invocação**.

A consequência é prática: **o estilo de casa para "quando não usar" existe, mas não é uniforme.** Como RF-06 exige explicitamente "quando **não** usar", os papéis do catálogo devem seguir o padrão de `Explore`, e não a média dos dois — a segunda redação desta seção afirmava que ambos seguiam o padrão completo, o que é otimista demais e mediria errado a autoria de prompt.

Ainda assim, **RF-06 é majoritariamente autoria de prompt, não engenharia**: a mudança de engenharia é o que acrescentar (custo relativo) e o diff por conteúdo.

Não há truncamento em nenhum ponto: nem no formatter, nem no parser.

---

## 2. Arquitetura proposta — Release 1

Quatro componentes, em ordem de dependência.

### Componente A — Pacote do catálogo (RF-01, RF-02, RF-15)

Novo pacote de workspace `apps/zcode-cli/packages/agent-catalog-plugin/`, com a mesma forma de `pdf-plugin` (sem build, assets brutos):

```
apps/zcode-cli/packages/agent-catalog-plugin/
  package.json                  # @zcode/agent-catalog-plugin, private, version
  .zcode-plugin/plugin.json     # name, version, description, agents: "agents"
  agents/code-reviewer.md
  agents/repo-researcher.md
  agents/test-triager.md
  agents/long-form-summarizer.md
```

`pnpm-workspace.yaml` já cobre `apps/zcode-cli/packages/*`, então o pacote entra no workspace sem edição de glob.

**Registro nos cinco repositórios.** O item R1 é uma entrada literal em `OFFICIAL_PLUGIN_DEFINITIONS` (fora do `.map()` dos documentos, porque os papéis não têm `skillDir` nem ícone de documento). `requiredSeedPaths` lista os quatro `agents/*.md`. `defaultEnabled: true` é obrigatório para o objetivo do PRD — catálogo sem configuração.

**Sobre identidade e o fork.** `OFFICIAL_PLUGIN_DEFINITIONS` usa `ZAI_AUTHOR` e `OFFICIAL_PLUGIN_ASSETS_BASE_URL` (`official-plugin-definitions.ts:57-58`). Publicar um catálogo do BR-Code como plugin oficial **com autoria e ícone da Z.ai** contradiz diretamente o PRD `paridade-provider-zai-ui`, que remove tratamento preferencial. O `listing` do novo plugin deve portanto usar identidade do fork (autor BR-Code, sem ícone apontando para CDN da Z.ai) — `listing` é inteiramente opcional (`OfficialPluginListingSeed`, `official-plugin-definitions.ts:6-19`, todos os campos `?`), e o comentário em `:3-5` registra que falha de ícone degrada para um ícone padrão. **Esta é a decisão que evita reintroduzir a preferência de provedor pelo outro lado.**

**Contrato do conteúdo do catálogo.** Cada `agents/*.md` segue o schema de frontmatter já existente (`packages/services/src/subagents/subagentMarkdown.ts:47-90`) com:
- `name`, `description` (no estilo de casa da Seção 1.6, incluindo "quando não usar"), `color`, `tools`, `permissionMode`, `systemPrompt` no corpo;
- **sem `model`** (RF-03) e **sem `thoughtLevel`**;
- `permissionMode` nunca `bypassPermissions` (RNF-06).

### Componente B — Verificação de registro do catálogo (qualidade de entrega)

Um plugin registrado só em R1 funciona no dev e falha em SEA, desktop e remoto — falha de runtime, não de build.

**Proposta original, rejeitada:** teste de igualdade de conjunto entre R1–R5. Seria vermelho no primeiro dia, porque a divergência pré-existente da Seção 1.3 (`computer-use` ausente de R2; `node-repl-host` sem sufixo `-plugin`) não é derivada de convenção e exigiria um mapa explícito `name → packageName` para todo o catálogo existente. Isso é um trabalho de higiene de um repositório de terceiros, **fora do escopo desta feature**.

**Proposta adotada:** teste de registro **escopado ao catálogo novo** — afirmar que `agent-catalog-plugin` está presente em R1, R2, R3, R4 e R5, com `packageName`/nome de diretório corretos e `version` igual em `package.json`, `.zcode-plugin/plugin.json`, R1 e R2 (mesma invariante já usada por `bootstrap/tests/plugins.test.ts:196-227`), e que todo `requiredSeedPaths` existe.

**A divergência pré-existente da Seção 1.3 fica registrada como risco conhecido e fora de escopo.** Ela é uma fragilidade real do fork e merece uma feature própria de higiene; amensar isso aqui seria ampliar escopo sem necessidade para o objetivo do PRD.

### Componente C — Roteamento e delta por conteúdo (RF-06, RF-07, RF-08, RF-09)

Mudanças em `core/src/subagent/`:

1. **Rota de modelo na linha (RF-06).** `formatAgentProfileForPrompt` (`profile.ts:102-113`) passa a incluir uma indicação de custo relativo **sempre**, e o identificador do modelo **apenas quando houver override do usuário**.

   Como o catálogo **não fixa modelo** (RF-03), o caso comum é herança. O pai já conhece o próprio modelo, então a linha ganha um rótulo neutro e curto — por exemplo `(herda o modelo atual; escopo restrito a <n> ferramentas)` — que entrega a metade de RF-06 sobre custo relativo sem repetir texto redundante a cada turno (RNF-01).

   **Proibido imprimir `providerId`.** A versão anterior deste desenho renderizava `provider/model`, e isso foi rejeitado: `providerId` é exatamente o valor que `packages/provider/src/effective-model-selection.ts:27-40` reescreve conforme a conta conectada, e imprimi-lo no prompt expõe ao pai um id de conta que o PRD trata como não-confiável (RF-15/O4). Quando há override do usuário, renderiza-se **apenas `modelId`** (sem provedor) mais o rótulo de origem.

2. **Diff por assinatura de conteúdo (RF-09).** `AgentListingDelta` ganha um campo que representa o *conteúdo* anunciado por nome, não só o nome. Sem isso, mudança de override é invisível ao pai (Seção 1.2).

   O tipo tem parser estrito com invariantes (`core/src/agent/agent-listing-metadata.ts:10-37`): `addedTypes.length === addedLines.length`, sem duplicatas, sem interseção added/removed. Qualquer campo novo entra no tipo **e** no parser, com sua própria invariante.

   Desenho: `announcedLines: Record<string, string>` — nome → última linha anunciada. `added` passa a ser `active.filter(p => announcedLines[p.name] !== render(p))`; `removedTypes` continua por nome, e a remoção **também apaga a chave correspondente** em `announcedLines` (senão um perfil desabilitado e reabilitado com a mesma linha renderizada nunca é re-anunciado).

   Custo: o delta inicial continua sendo um por linha; deltas posteriores passam a carregar só o que mudou, o que é *menos* contexto que hoje em caso de churn de nomes.

3. **Sem campo novo em `AgentProfile`.** O texto de rota é derivado do que já existe (`description`, `tools`, `modelSelection`). Isso evita mexer em `agentProfileSchema`, que é `.strict()` (`packages/shared/src/subagent-profile.ts:39-62`) e portanto quebraria o carregamento de perfis de usuário existentes ao receber chave desconhecida (RNF-05).

### Componente D — Origem do modelo e toggle na UI (RF-04, RF-10)

Em `packages/ui/src/settings/SubagentsSection.tsx`:

- **RF-10:** rótulo de origem do modelo por linha. **Dois rótulos, não três:** `modelSelectionOverride` presente → "sobrescrito manualmente"; senão → "herdado do pai". O terceiro rótulo previsto no PRD ("definido no catálogo") é **inalcançável no Release 1**, porque RF-03 proíbe o catálogo de fixar modelo — nenhum agente de catálogo terá `modelSelection` definido. Ver limitação registrada na Seção 12.
- **RF-04:** o toggle hoje não é renderizado para linhas de plugin. `supportsEnabledToggle` (`SubagentsSection.tsx:143-145`) é `isEditableUserAgent(agent) && agent.scope === "user"`, e `isEditableUserAgent` (`:131-137`) exige `scope ∈ {user, workspace}` **e** `source === "user"` **e** `readOnly !== true`. Linhas de plugin chegam com `source: "plugin"` e `readOnly: true` (`packages/services/src/subagents/subagentsService.ts:340-351`), então os dois portões fecham.

### Componente D2 — Desativação de agente de plugin (RF-04)

**A segunda redação deste documento afirmava que D2 era uma mudança só de UI, porque o filtro de runtime "já estaria correto". Isso estava errado**, e a verificação direta mostra por quê.

Traçado real do `disabledAgentIds` — `grep` por `disabledAgentIds` em `apps/zcode-cli/packages/*/src` retorna **um único** produtor (`bootstrap/src/subagents.ts:231-266`):

| Passo | Local | Aplica o filtro? |
|---|---|---|
| Leitura do estado | `bootstrap/src/subagents.ts:70` (`readAgentState`) → `:231-266` | não — só materializa o `Set` |
| Único consumo | `bootstrap/src/subagents.ts:71-84` → `parseRuntimeSubagentConfig(...)` | **sim**, mas só sobre os perfis de usuário/projeto |
| Perfis de plugin | `create-app.ts:263` — `[...zcodeSubagentProfiles, ...pluginSubagentProfiles]` | **nunca passam pelo filtro** |
| Refresh de runtime | `create-app.ts:800-815` — `resolvePluginAgentProfiles(...)` recebe `parsed.profiles` já filtrado e anexa `pluginProfiles` | **nunca passam pelo filtro** |

`resolvePluginAgentProfiles` (`bootstrap/src/subagents.ts:112-164`) **não consulta `disabledAgentIds`**. O defeito é estrutural: um sub-agente de plugin não tem caminho de desativação por agente, e a UI reflete isso — `supportsEnabledToggle` (`SubagentsSection.tsx:143-145`) fecha porque linhas de plugin têm `source: "plugin"` e `readOnly: true` (`subagentsService.ts:340-351`).

**Correção, em três partes:**

1. **Chave.** Adotar `createPluginAgentStateId(pluginId, bareName)` → `plugin:<pluginId>:<bare>` (`subagents-types.ts:154-156`). É a **mesma família que a UI já usa hoje** para `agent.id`, para `attachEnabledState` (`subagentsService.ts:294-299`, `:340-351`) e para o override de modelo (`bootstrap/src/subagents.ts:126`) — mantém produtor e consumidor no mesmo formato, e não introduz um terceiro esquema de id.
   - Onde a chave é calculável: dentro de `resolvePluginAgentProfiles`, que já tem `parsed.plugin` (com `.id`) em mãos. **Não** em `packages/shared`, que não conhece identidade de plugin — e adicionar essa noção a `AgentProfile` é proibido por RNF-05 (`agentProfileSchema` é `.strict()`, `packages/shared/src/subagent-profile.ts:39-62`).

2. **Ponto de aplicação.** `resolvePluginAgentProfiles` passa a receber `disabledAgentIds` e descartar, para cada perfil de plugin, tanto o nome qualificado quanto o **alias de nome cru** (`subagents.ts:134-136` emite `{...canonical, name: bareName}`). Sem isso, desabilitar `agent-catalog:code-reviewer` deixaria `code-reviewer` despachável pelo nome curto e ainda listado no catálogo injetado — o toggle seria enganoso e RF-04 não fecharia.

3. **Estado na UI.** `attachEnabledState` deriva `enabled` como `agent.scope === "user" ? !disabledSet.has(agent.id) : true` (`subagentsService.ts:298`), com `agent.id = createPluginAgentStateId(...)` (`:340-351`). Com a chave de (1), o caminho de escopo `user` fica correto sem alteração de lógica — mas **não** está correto hoje, porque nada popula `disabledSet` com chaves `plugin:`. A UI precisa passar a gravar essa chave, e `supportsEnabledToggle` precisa deixar de excluir linhas de plugin.
   - **Ressalva de escopo:** um plugin de escopo `workspace` recebe `scope: "workspace"` (`subagentsService.ts:333`) e cai no ramo `: true` da derivação — ou seja, ficaria sempre habilitado mesmo com o toggle funcionando. O catálogo do Release 1 é `defaultEnabled: true` e semeado no escopo de usuário, então isso **não afeta a Release 1**; fica registrado como limite a resolver se algum dia um plugin de catálogo for semeado em workspace.

**Consequência de escopo:** D2 toca `apps/zcode-cli` (`bootstrap/src/subagents.ts`), `packages/services` e `packages/ui`. **Não é só UI.** A Seção 4.2 está errada e é corrigida abaixo.

Risco residual, aceito: a chave embute `pluginId = <name>@<marketplace>`. Se o nome ou o marketplace do plugin mudar, a desativação fica órfã e o agente volta a "habilitado". É o mesmo risco já existente para o override de modelo — a mudança unifica, não introduz.

**Garantia (T-08/T-09 reescritos):** o teste sobe pelo caminho real — snapshot do Host → `resolvePluginAgentProfiles` → merge → `activeAgents` — e afirma que um `plugin:…:<bare>` em `disabledAgentIds` remove **o perfil qualificado e o alias** da lista injetada. Um teste que compare apenas strings de chave não pega nada e foi descartado.

---

## 3. Modelo de dados e migrações

Sem migração de schema. O único formato persistido que muda é `AgentListingDelta`, dentro de histórico de sessão já gravado.

**Compatibilidade com histórico — e duas armadilhas já identificadas.** `parseAgentListingDelta` é validador estrito (`core/src/agent/agent-listing-metadata.ts:10-37`), com as invariantes `addedTypes.length === addedLines.length`, sem duplicatas e sem interseção entre added e removed.

**Armadilha 1 — default ingênuo.** O default óbvio para o campo novo é `{}`, e ele está **errado**. Com `announcedLines` vazio, `announcedLines[p.name] !== render(p)` é verdadeiro para **todo** perfil ativo, `added` volta a ser o catálogo inteiro e o early-return de `listing.ts:38` não dispara.

**Default correto:** derivar `announcedLines` dos pares **já presentes** no delta histórico. O índice-i de `addedTypes[i]`/`addedLines[i]` **é** a correspondência nome→conteúdo — é a mesma invariante de comprimento que o parser já exige. Cada entrada histórica contribui `announcedLines[addedTypes[i]] = addedLines[i]`.

Isso exige alterar a reconstrução de `listing.ts:22-30`, que hoje mantém um `Set<string>` de nomes. A mudança é de **`Set` → `Map<string, string>`**, e `removedTypes` e `isInitial` passam a ler do **mesmo mapa** (`listing.ts:34-37` e `:45`) — duas estruturas paralelas divergem silenciosamente.

**Armadilha 2 — a derivação sozinha não basta.** A retrocompatibilidade só é perfeita se o **texto anunciado não mudar**. Mas o Release 1 muda o renderizador (o rótulo de custo de C.1 entra na linha). Então, no primeiro turno após o upgrade, `announcedLines["general-purpose"]` = texto antigo e `render(p)` = texto novo, logo `added` = catálogo inteiro: **um re-anúncio completo acontece de todo modo**.

Isso é aceito, com custo e teste honestos:
- **Custo:** um delta extra, uma vez, por sessão retomada com histórico em formato antigo. Não há risco de laço — o `announcedLines` converge para o texto novo no mesmo delta e o turno seguinte não re-anuncia. RF-08 e RNF-07 seguem válidos no regime permanente.
- **Não** é migração de dados e não exige versão de formato. Nenhum estado de usuário é reescrito.
- **Critério de teste correto (T-06):** *cada sub-agente é anunciado no máximo uma vez na retomada e o estado converge* — não "zero re-anúncio". Um teste que exigisse zero re-anúncio falharia com histórico real em formato antigo e só passaria com fixture já nascido no formato novo, ou seja, não testaria nada.

`disabledAgentIds` continua sendo `z.array(z.string())` (`subagent-runtime-config.ts:6-18`) — a forma não muda, só **quem escreve** e **quem consome** (Componente D2). Arquivos de estado antigos continuam legíveis: ids desconhecidos não filtram nada, o que equivale ao default "habilitado".

---

## 4. Contratos

### 4.1 Protocolo

Nenhuma mensagem nova em Release 1. `AgentListingDelta` é interno ao CLI e atravessa a fronteira como metadata de attachment (`core/src/agent/message-history.ts:15,47,457-459`), com re-hidratação em `session-history-hydrator.ts:553-555`. A política de projeção já classifica `agent_listing_delta` como "provider context only, does not trigger a new turn" (`packages/shared/src/zcode-protocol/index.ts:697`), e **RF-08 depende desse comportamento permanecer**.

O teste de fio existente afirma que o metadata **nunca** vaza para o payload do provedor — só a string renderizada (`adapters/tests/agent-listing-wire.test.ts:141`). O Componente C precisa preservar isso: o novo campo é metadata, não texto.

### 4.2 UI

Para RF-10, **nenhuma chamada nova a serviço**: a informação de origem já chega em `AgentSummary` (`packages/shared/src/subagents-types.ts:54-56`) e `createAgent`/`updateAgent` já existem no caminho (`:114-132`). É apresentação pura.

Para RF-04, **há mudança em `packages/services`** — a redação anterior ("nenhuma chamada nova a serviço") era errada. `attachEnabledState` deriva `enabled` como `agent.scope === "user" ? !disabledSet.has(agent.id) : true` (`subagentsService.ts:298`), com `agent.id = createPluginAgentStateId(...)` (`:340-351`); com a chave escolhida no Componente D2 o caminho de escopo `user` fica correto sem mudança de lógica, mas **é preciso que a UI passe a produzir essa chave**, e `supportsEnabledToggle` (`SubagentsSection.tsx:143-145`) precisa deixar de excluir linhas de plugin. O caso de plugin semeado em workspace fica por conta própria (ver a ressalva no Componente D2). Não há endpoint novo — a gravação continua no caminho de `setEnabled` já existente.

### 4.3 i18n

Novas chaves de rótulo de origem do modelo em `packages/ui/src/i18n/locales/`, nos locales existentes. Nenhuma chave nova é necessária para o texto injetado no pai: esse texto é gerado em `core/src/subagent/profile.ts`, fora do sistema de i18n, como já é hoje (RNF-04 pede ponto único de construção — `formatAgentProfileForPrompt` **é** esse ponto único).

---

## 5. Alternativas consideradas e rejeitadas

| Alternativa | Por que rejeitada |
|---|---|
| Catálogo em `.zcode/agents/` versionado neste repo | Só vale neste workspace; não é produto distribuível. Descartada. |
| Catálogo hardcoded em `core/src/subagent/profile.ts` junto dos built-ins | Mistura conteúdo de produto em código; não é versionado como artifact; os built-ins são gerados em memória e não têm arquivo. Descartada. |
| Catálogo em marketplace próprio do fork | `official-marketplace.ts:121-127` lança para qualquer id ≠ `zcode-plugins-official`; exigiria writer/reader/caching novos. Custo desproporcional ao objetivo. Descartada. |
| Plugin com autoria/ícone da Z.ai (padrão dos 4 existentes) | Contradiz o PRD `paridade-provider-zai-ui`. **Rejeitada deliberadamente.** |
| Novo campo `cost`/`tier`/`routingHint` em `AgentProfile` | `agentProfileSchema` é `.strict()` (RNF-05): campo novo quebra perfis de usuário existentes. Derivar o texto dos campos existentes evita o schema. Rejeitada. |
| `formatAgentProfilesForPrompt` (plural) como vehicle | Sem consumidor em produção (Seção 1.1). Consolidar em vez de propagar. |
| Tool `call_subagent` separada, como no Raspagem | Duplicaria a tool `Agent` e o `Task` alias, e exigiria um segundo caminho de despacho. O `Agent` já aceita `subagent_type` aberto (`contracts/src/tools/agent.ts:21-24`) e a listagem injetada é o mecanismo de catálogo. Rejeitada. |
| Auto-tier de modelo (barato para mecânico) | Confirmado na fase de reconhecimento que **não existe** conceito de família/tier: `parseModelPickerValue` exige `providerId/modelId` absoluto (`packages/shared/src/model-selection.ts:45-52`). Seria produto novo. Rejeitada, e registrado como lacuna conhecida no PRD (nota de viabilidade do RF-03). |

---

## 6. Segurança, permissões e privacidade

- **Nenhum segredo novo.** O catálogo é texto estático.
- **`permissionMode`:** RNF-06 exige que nenhum papel use `bypassPermissions`. Papel de escrita deve usar `acceptEdits` ou `default`; papéis de leitura, `plan` ou equivalente. Verificação: teste que falha se algum `agents/*.md` do catálogo declarar `bypassPermissions`.
- **Superfície de escrita:** papéis com `tools` de escrita amplos herdados do pai ampliam a superfície de escrita. Cada papel declara `tools` explicitamente, nunca `["*"]` — que é o que `general-purpose` faz (`profile.ts:85`).
- **Provider account:** RF-15 — nenhum `providerId` de plano de conta em frontmatter do catálogo. Verificação por teste, conforme PRD.
- **Não há dado de usuário em log novo.**

---

## 7. Performance e escala

| Medida | Origem | Alvo |
|---|---|---|
| I/O de disco por chamada de `Agent` | RNF-02 | **0** — o catálogo é semeado em cache no startup (`bundled-plugins.ts:618`, `officialPluginCacheRoot`), não lido por chamada |
| Montagem do delta | RNF-02 | < 2 ms p95 |
| Overhead de contexto | RNF-01 / M3 | ≤ 3% do system prompt; teto de 40 linhas injetadas |

Análise de escala, com o multiplicador correto: o mecanismo é **O(n) em perfis ativos, uma vez por turno**, já filtrado por delta (`listing.ts:38`).

**Cada agente de plugin gera até DUAS linhas.** Quando o nome é único e não reservado, `resolvePluginAgentProfiles` (`bootstrap/src/subagents.ts:134-137`) emite também um alias de nome cru (`{...canonical, name: bareName}`) além do perfil qualificado. Com 4 papéis de catálogo, o delta inicial carrega **8 linhas**, não 4 — mais os 2 built-ins e quaisquer agentes locais do usuário. O `announcedLines` do Componente C.2 também registra as duas entradas.

Mesmo com o multiplicador, a conta fica em uma dezena de linhas, muito abaixo do teto de 40 do RNF-01. **Decisão de escopo: paginação não entra no Release 1** e passa a ser acionada por um número real de papéis. O mecanismo de delta já é a defesa natural — deltas posteriores carregam só o que mudou.

O custo real é o **delta inicial**, que cresce com o catálogo inteiro.

**Pontos de medição de M1 e M3** (PRD): ambos são medidos em testes, sem instrumentação de produção nova.
- **M1** — contagem de `SubagentSpawned` cujo `agentType` corresponde a um nome do catálogo, no caso E2E (T-13). Não há telemetria de produção; a métrica é de produto e precisa de instrumentação dedicada, declarada **fora do escopo do Release 1**.
- **M3** — razão entre o tamanho do campo de mensagens que carrega a listagem e o system prompt do mesmo payload. O ponto de captura já existe no teste de fio (`adapters/tests/agent-listing-wire.test.ts`), que monta o payload do provedor — T-07 o estende para medir a razão.

---

## 8. Observabilidade

- O modelo efetivo de cada sub-agente **já é ecoado** no evento `SubagentSpawned` (`core/src/subagent/runner.ts:240-256`; o campo `model` é montado em `:252`). Nenhuma mudança necessária em Release 1 — RNF-03 permanece satisfeito.
- Release 2 adiciona o evento de degradação no mesmo caminho (PRD RF-12/RNF-03).
- Não há log novo a adicionar em Release 1. O formato da linha do catálogo é o único artefato novo, e ele é observável diretamente na conversa.

---

## 9. Estratégia de testes

### 9.1 Testes que quebram com o Componente C (mudança de formato)

| Arquivo | O que fixa |
|---|---|
| `core/tests/agent-listing.test.ts:38-47` | deep-equal do delta com strings literais `"- A: Description A (Tools: Read)"` |
| `adapters/tests/agent-listing-wire.test.ts:85-141` | constante `EXPECTED_LISTING` com o texto literal + ausência de vazamento de metadata |
| `core/tests/subagent-profile.test.ts:238-410` | `toContain("Tools: ...")` e ausência de `Glob`/`Grep` no ramo de embedded search |
| `core/tests/agent-listing-runtime.test.ts:153-183` | ida e volta de compact/resume; o deep-equal do delta inteiro está em `:171` |

A ordem de texto das ferramentas é garantida por `EXPLORE_AGENT_DESCRIPTION_TOOL_PRIORITY` (`core/src/subagent/explore-tools.ts:24-32`) — não alterar.

### 9.2 Testes novos

| ID | Cobre | Tipo |
|---|---|---|
| T-01 | Catálogo: cada `agents/*.md` parseia e `name`/`description`/`tools`/`permissionMode` presentes | unit |
| T-02 | Catálogo: **nenhum** arquivo declara `model:` nem `bypassPermissions` (RF-15, RNF-06) | unit |
| T-03 | Catálogo: os 3 papéis de RF-07 aparecem no delta inicial com seção de quando usar | unit |
| T-04 | Delta: mudar o modelo de um perfil reemite a linha no turno seguinte, **sem** mudar o conjunto de nomes (RF-09) | unit |
| T-05 | Delta: nada alterado ⇒ nenhum attachment (RF-08) | unit, **já coberto** por `agent-listing.test.ts` — estender |
| T-06 | `AgentListingDelta` antigo (sem campo novo) continua parseando; **na retomada, cada sub-agente é anunciado no máximo uma vez e o estado converge** para o texto novo (Seção 3) | unit |
| T-07 | Metadata novo não vaza para o payload do provedor; **e** razão listagem/system prompt medida para M3 | integração — estende `agent-listing-wire.test.ts` |
| T-08 | Chave de desativação de agente de plugin escrita pela UI filtra no runtime (RF-04) | integração |
| T-09 | O consumidor real de D2 é `resolvePluginAgentProfiles` (não `resolveSubagentRuntimeProfiles`, que nunca vê perfis de plugin): `disabledAgentIds` populado com a chave `plugin:…` remove o perfil qualificado e o alias | integração |
| T-10 | `agent-catalog-plugin` presente em R1, R2, R3, R4 e R5, com nomes e caminhos corretos (Componente B) | unit |
| T-11 | Versão do novo plugin alinhada em package.json / plugin.json / R1 / R2, e todo `requiredSeedPaths` existe | unit, padrão de `bootstrap/tests/plugins.test.ts:196-227` |
| T-12 | UI: **dois** rótulos de origem de modelo distintos e estáveis após reload (RF-10) | render |
| T-13 | E2E: `Agent` com `subagent_type` de catálogo despacha e o filho roda com o modelo resolvido | E2E |
| T-14 | E2E: medição de tempo de spawn para M4 | E2E — **é entregável, não existe hoje** |

### 9.3 Comandos de verificação (reais, conferidos no manifesto)

| Comando | O que cobre | Observação |
|---|---|---|
| `pnpm typecheck` | `packages/*`, `packages/ui`, `packages/web`, `packages/desktop` | **Não cobre `apps/zcode-cli`** — ver Seção 13 |
| `pnpm --filter zcode-cli typecheck` | `apps/zcode-cli/packages/*` (30 tasks) | **É este que cobre os Componentes A, B e C** |
| `pnpm lint` | oxlint, repo inteiro | baseline: 62 warnings, 0 errors |
| `pnpm test:unit:affected` | `node scripts/run-affected-unit-tests.mjs` — testes unitários dos pacotes afetados | existe de fato; executado por `verify:pre-push` |
| `pnpm verify:pre-push` | `lint` + `architecture:check --changed` + `test:unit:affected` | **não** inclui typecheck |

Os comandos de teste E2E devem ser declarados pela sprint a partir do `package.json` do pacote alvo — não há comando unificado de E2E na raiz.

> **Correção em relação à primeira redação deste documento:** a afirmação anterior de que "não existe comando unificado de unit test na raiz" era falsa; `pnpm test:unit:affected` existe (`package.json:36`) e é o gate adequado.

---

## 10. Release 2 — degradação (bloqueada por Q1)

**Não entra em Release 1.** Desenhada aqui para a TECH estar completa, a implementation depende da decisão do dono.

Ponto de intervenção: `resolveSubagentSelection` (`apps/zcode-cli/packages/core/src/runtime/helpers/subagent-selection.ts:26-53`) hoje lança `ConfigurationError` para qualquer um dos seis `selectionIssue` de `packages/shared/src/model-selection.ts:21-29`.

Recomendação do PRD (Q1): degradar **apenas** `account-connection-unavailable`; manter falha dura para os outros cinco.

Classificação explícita de **todos os seis** reasons de `packages/shared/src/model-selection.ts:22-29`:

| `selectionIssue` | Política | Justificativa |
|---|---|---|
| `account-connection-unavailable` | **degrada** (Q1) | Evento de ambiente, reversível, do próprio usuário |
| `selection-missing` | falha dura | Não há modelo algum configurado; degradar para "qualquer" seria adivinhar |
| `provider-not-found` | falha dura | Erro de configuração; o provedor guardado não existe mais |
| `model-not-found` | falha dura | Erro de configuração; degradar esconderia que o modelo sumiu do provedor |
| `reasoning-level-missing` | falha dura | Idem |
| `reasoning-level-not-supported` | falha dura | Idem |

Invariante a preservar em qualquer política: **RF-14** — um sub-agente que herda não pode degradar por seleção própria; e **RF-12** — degradação é sempre visível, com o modelo configurado, o modelo usado e o motivo. Nunca silenciosa.

Ponto de emissão do aviso: o mesmo caminho que já ecoa o modelo no spawn (`core/src/subagent/runner.ts:240-256`).

---

## 11. Rollout, feature flag e rollback

**Sem feature flag.** O plugin é `defaultEnabled: true` e sua ausência é um estado normal — `resolveFilesystemPluginRoot` devolve `undefined` e o plugin simplesmente não é semeado (`bundled-plugins.ts:345-353`). Desabilitar o plugin na UI é o rollback operacional, e já é suportado.

Isso vale porque o catálogo é **aditivo**: ele acrescenta perfis e linhas de catálogo. Nenhum caminho existente muda de comportamento quando o plugin está ausente.

**Rollback:** desabilitar o plugin. Sem migração a desfazer, sem estado a limpar. A chave de desativação por agente (D2) também é reversível — remover a entrada de `disabledAgentIds` reabilita.

---

## 12. Rastreabilidade PRD → TECH

| Requisito | Componente | Seção |
|---|---|---|
| RF-01, RF-02 | A | 2 |
| RF-03 | A (contrato de conteúdo) | 2, 5 |
| RF-04 | D + D2 (toca `apps/zcode-cli`, `packages/services` e `packages/ui` — **não** é só UI) | 2 |
| RF-05 | D (usa `modelSelectionOverride` existente) | 1.5, 2 |
| RF-06 | C.1 (custo relativo sempre; `modelId` só com override; **`providerId` nunca**) | 2 |
| RF-07 | C.1 + testes T-03 | 2, 9.2 |
| RF-08 | C.2 + Seção 3 | 2, 3 |
| RF-09 | C.2 (difundido no turno seguinte; limite documentado na Seção 12) | 1.2, 2, 12 |
| RF-10 | D — **parcial**: 2 rótulos, não 3 | 2, 12 |
| RF-11 a RF-14 | **Release 2** | 10 |
| RF-15, RF-16 | A + B | 2, 6 |
| RNF-01 | **parcial**: teto respeitado; paginação fora de escopo no Release 1 | 7, 12 |
| RNF-02 | A (seed em cache, sem I/O por chamada) | 7 |
| RNF-03 | já satisfeito (Seção 8); degradação em Release 2 | 8 |
| RNF-04 | D e C.1 | 4.3 |
| RNF-05 | C.3 (sem campo novo) | 2 |
| RNF-06 | A + T-02 | 6 |
| RNF-07 | C.2 (delta por conteúdo, sem loop de refresh) | 2 |
| M1 | ponto de medição definido; instrumentação de produção **fora de escopo** | 7 |
| M3 | T-07, sobre o payload de fio existente | 7 |
| M4 | T-14 | 9.2 |
| M2 | **fora de escopo do Release 1** — a métrica depende da degradação (Release 2). Mede "despachos sem erro de seleção com conta desconectada", e no Release 1 a degradação não existe. | 10 |

### 12.1 Limitações assumidas e aceitas

Três requisitos ficam **parcialmente atendidos** no Release 1, com o motivo:

1. **RF-10** — 2 rótulos em vez de 3. O terceiro ("definido no catálogo") é inalcançável porque RF-03 proíbe o catálogo de fixar modelo; um rótulo que nunca apareceria é pior que a ausência dele.
2. **RNF-01** — paginação não é entregue. O teto de 40 linhas é respeitado com folga larga (8 linhas de catálogo com o multiplicador de alias). Paginação vira trabalho futuro, acionado por um número real de papéis.
3. **RF-09** — a mudança aparece no turno seguinte, não dentro do turno em que foi salva, porque o snapshot de definições é congelado no início do turno (`core/src/subagent/definitions.ts:15-29`). O usuário não precisa pedir nada.

Nenhuma dessas limitações decorre de recorte de esforço dentro do que é construível; duas decorrem de restrição real do runtime (RF-09, RF-10) e uma é adiamento consciente (RNF-01).

### 12.2 Risco herdado, fora de escopo

A divergência pré-existente entre R1–R5 (Seção 1.3, `computer-use` ausente de R2; nomes de pacote não deriváveis por convenção) é uma fragilidade real do fork. **Não é corrigida aqui** e não deve ser corrigida como efeito colateral desta feature: exigeria um mapa explícito `name → packageName` de todo o catálogo de terceiros. Registrada para feature própria de higiene.

---

## 13. Gate de código — resultado real, verificado

Executado nesta máquina, com saída real:

| Gate | Comando | Resultado |
|---|---|---|
| Typecheck raiz | `pnpm typecheck` | **PASSA.** Sem erros. |
| Typecheck do CLI | `pnpm --filter zcode-cli typecheck` | **PASSA.** 30 tasks, 30 successful, 0 failed (10m25s) |
| Lint | `pnpm lint` | **PASSA.** 62 warnings, **0 errors** (6014 arquivos) |

Os warnings de lint são pré-existentes e não relacionados (ex.: `packages/desktop/scripts/node-pty-rebuild.mjs:3` importa `join` sem uso). Nenhum está em arquivo tocado por esta feature.

**Cobertura do gate — ponto que a primeira redação deste documento errou.** `pnpm typecheck` (`package.json:57`) compila `packages/rpc`, `packages/provider`, `packages/provider-node`, `packages/shared`, `packages/services`, `packages/client`, `packages/server`, `packages/zcode-server-cli`, `packages/ui`, `packages/web`, `apps/dev-docs`, `packages/e2e-report` e dois projetos do `packages/desktop` — **`apps/zcode-cli` não está na lista**. Como os Componentes A, B e C vivem em `apps/zcode-cli/packages/` (e, para B, em `packages/desktop/scripts` e `scripts/`), o gate raiz sozinho **não os cobre**. Por isso `pnpm --filter zcode-cli typecheck` é gate obrigatório de toda sprint deste TECH, e não um extra.

**Ressalva de ambiente:** Node `v22.23.2` contra `>=24.0.0` exigido por `package.json` e fixado em `mise.toml` (`node = "24.14.0"`). O repositório emite `WARN Unsupported engine`. O `mise` não está instalado nesta máquina, então o runner oficial não pôde ser usado — os comandos foram rodados direto via `pnpm`. Os typechecks passaram mesmo assim, mas isso é uma divergência de ambiente que qualquer sprint deve considerar.

**Histórico do gate, para auditoria:** a primeira execução de `pnpm typecheck` falhou com `'tsc' não é reconhecido` — o repositório estava com `node_modules` não populado. `pnpm install --ignore-scripts` produziu 399 binários mas deixou `node_modules/vite/client.d.ts` ausente, causando `error TS2688: Cannot find type definition file for 'vite/client'`. O `pnpm install` completo reparou a base, e os três gates acima passaram. Nenhuma alteração de código do projeto foi feita durante essa preparação.