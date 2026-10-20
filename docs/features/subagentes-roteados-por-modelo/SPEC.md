# SPEC — Sub-agentes roteados por modelo

- **PRD:** [`PRD.md`](./PRD.md) · **TECH:** [`TECH.md`](./TECH.md)
- **Data:** 2026-10-18 · **Slug:** `subagentes-roteados-por-modelo`
- **Escopo:** Release 1 (catálogo, roteamento, origem do modelo, toggle). Release 2 não faz parte deste documento.

---

## 1. Resumo e escopo

Quatro papéis de sub-agente, prontos para uso, com roteamento bom pelo agente principal. Tudo entregue como um plugin oficial novo do fork, mais três melhorias de runtime e duas de UI.

O que **não** é escopo: degradação de modelo (Release 2, bloqueada por Q1), sub-agentes recursivos, worktrees, broker de delegação, conceito de tier/faixa de modelo, e qualquer alteração em `agentProfileSchema`.

| Componente | RF | Arquivos |
|---|---|---|
| A — pacote do catálogo | RF-01, RF-02, RF-03, RF-15, RF-16 | novo `agent-catalog-plugin/` + 5 registros |
| B — verificação de registro | RF-15 | teste |
| C — roteamento e delta por conteúdo | RF-06, RF-07, RF-08, RF-09 | `agent-listing-metadata.ts`, `listing.ts`, `profile.ts` |
| D/D2 — origem do modelo e desativação | RF-04, RF-05, RF-10 | `subagent-runtime-config.ts`, `subagents.ts`, `create-app.ts`, `subagentRuntimeConfig.ts`, `SubagentsSection.tsx`, locales |

---

## 2. Desenho detalhado por componente

### 2.1 Componente A — Pacote do catálogo

#### 2.1.1 Arquivos a criar

**`apps/zcode-cli/packages/agent-catalog-plugin/package.json`** — mesma forma de `pdf-plugin/package.json` (sem `scripts`, sem `dependencies`, sem build):

```json
{
  "$schema": "https://json.schemastore.org/package.json",
  "name": "@zcode/agent-catalog-plugin",
  "version": "0.1.0",
  "private": true,
  "license": "Apache-2.0",
  "description": "Curated role-based sub-agents, published as an official BR-Code plugin."
}
```

**`apps/zcode-cli/packages/agent-catalog-plugin/.zcode-plugin/plugin.json`** — é o portão de existência da raiz (`bootstrap/src/app/bundled-plugins.ts:345-353`) e a origem do manifest (`adapters/src/plugins/index.ts:935-948`):

```json
{
  "name": "agent-catalog",
  "version": "0.1.0",
  "description": "Curated role-based sub-agents for routing by model.",
  "author": { "name": "BR-Code" },
  "license": "Apache-2.0",
  "agents": "agents"
}
```

Sem `skills` — o plugin não tem skills. `author` é o fork, **não** `ZAI_AUTHOR`, pela razão da Seção 6 do TECH.

**`apps/zcode-cli/packages/agent-catalog-plugin/agents/{code-reviewer,repo-researcher,test-triager,long-form-summarizer}.md`**

Frontmatter, validado contra o parser que de fato carrega `agents/*.md` de plugin — `parsePluginAgentProfile` (`apps/zcode-cli/packages/bootstrap/src/subagents.ts:166-207`) → `packages/shared/src/subagent-profile-parser.ts:33-106`. `packages/services/src/subagents/subagentMarkdown.ts:47-90` é o parser de Settings/UI e aceita os mesmos campos, mas é a autoridade da UI, não do carregamento do plugin.

```yaml
---
name: code-reviewer
description: "<papel + quando usar + quando NÃO usar + exemplo de invocação, no estilo de Explore>"
color: purple
permissionMode: default
tools: [Read, Grep, Glob, Bash]
disallowedTools: [Write, Edit]
---
<system prompt do papel>
```

Regras contratuais, verificadas por T-02:

- **sem `model:`** e **sem `thoughtLevel:`** (RF-03);
- **sem `bypassPermissions`** em `permissionMode` (RNF-06);
- `tools` sempre explícito, nunca `["*"]` (Seção 6 do TECH);
- `description` no estilo de `Explore` (`core/src/subagent/profile.ts:27-29`), **incluindo a cláusula de anti-disparo**, que `general-purpose` não tem (Seção 1.6 do TECH).

**Sobre `permissionMode` — correção de uma redação anterior.** A primeira versão deste documento especificava `permissionMode: plan` para o `code-reviewer`. Isso é **inoperante**: `isWriteTool` e `isDestructiveTool` incluem `"Bash"` (`core/src/permission/service.ts:619`, `:623`), e `checkPlanMode` só autoriza `capability.readOnly && !destructive` (`:447-489`), caindo no deny `mode.plan.nonReadOnly` (`:478-483`). O revisor ficaria com `Bash` declarado e efetivamente negado — e sem `Bash` ele não roda `git diff`, que é a tarefa que RF-07 exige.

Adotado: `permissionMode: default` com `disallowedTools: [Write, Edit]`. O revisor lê e executa comandos, não escreve arquivos — coerente com RNF-06 e mais honesto que `plan`. Os outros três papéis seguem a mesma regra: `permissionMode` explícito, nunca `bypassPermissions`, nunca `plan` com `Bash`.

#### 2.1.2 Assinaturas alteradas — registro nos cinco repositórios

Nenhuma assinatura muda. São **entradas de dados** em cinco listas.

**R1** — `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts`. Entrada literal no array `OFFICIAL_PLUGIN_DEFINITIONS`, fora do `.map()` de `:198-227` (cujo shape de tupla é `[name, skillDir, displayName, zhName]` e exige `skillDir` e ícone de documento):

```ts
{
  defaultEnabled: true,
  listing: {
    author: { name: "BR-Code" },
    category: "productivity",
    displayName: "Agent Catalog",
    displayName_i18n: { "zh-CN": "智能体目录" },
    description_i18n: { "zh-CN": "按角色划分的子智能体，每个都已配置好适用范围。" },
  },
  name: "agent-catalog",
  requiredSeedPaths: [
    "agents/code-reviewer.md",
    "agents/repo-researcher.md",
    "agents/test-triager.md",
    "agents/long-form-summarizer.md",
  ],
  rootCandidates: [
    "packages/agent-catalog-plugin",
    "../agent-catalog-plugin",
    "../../agent-catalog-plugin",
    "../../../agent-catalog-plugin",
  ],
  version: "0.1.0",
}
```

Sem `icon`: `OfficialPluginListingSeed` (`official-plugin-definitions.ts:6-19`) tem todos os campos opcionais, e o comentário em `:3-5` registra que falha de ícone degrada para um ícone padrão. `defaultEnabled: true` é o que cumpre "sem configuração do usuário" (RF-01).

**R2** — `apps/zcode-cli/packages/cli/scripts/sea-official-plugin-assets.mjs`, array `officialSeaPlugins` (`:95-104`):

```js
{
  marketplace: "zcode-plugins-official",
  name: "agent-catalog",
  packageName: "@zcode/agent-catalog-plugin",
  requiresRuntime: false,
  requiredSeedPaths: [ /* os quatro agents/*.md */ ],
  rootPath: join("packages", "agent-catalog-plugin"),
  version: "0.1.0",
}
```

**R3** — `packages/desktop/scripts/prepare-agent-node-bundle.mjs`, array `officialPluginPackages` (`:95-124`):

```js
{
  packageName: "@zcode/agent-catalog-plugin",
  relativePath: "apps/zcode-cli/packages/agent-catalog-plugin",
  requiresRuntime: false,
  requiredSeedPaths: [ /* os quatro agents/*.md */ ],
  stagedPath: "packages/agent-catalog-plugin",
},
```

**R4** — `scripts/prepare-prebuilds.mjs`, array `remoteOfficialPluginPackages` (`:102-128`): mesma forma de R3 **sem** `requiredSeedPaths` — o registro remoto não carrega contrato de seed.

**R5** — `packages/server/src/remote/zcodeAgentOfficialPluginAssets.ts`, array `REMOTE_AGENT_OFFICIAL_PLUGIN_PACKAGE_NAMES` (`:5-21`): adicionar `"agent-catalog-plugin"` — **nome de diretório**, não `packageName`.

> `pnpm-workspace.yaml` já cobre `apps/zcode-cli/packages/*`; nenhum ajuste de glob é necessário.

---

### 2.2 Componente B — Verificação de registro

**Sem mudança de código de produção.** Um teste acrescentado a `apps/zcode-cli/packages/bootstrap/tests/plugins.test.ts` (que já verifica versão e `requiredSeedPaths` em `:196-227`) que, para `agent-catalog` especificamente, afirma:

1. presença com o mesmo `name` em R1, R2, R5;
2. presença pelo `packageName` em R3, R4;
3. `definition.version === manifest.version === package.version`;
4. todo item de `requiredSeedPaths` existe sob a raiz.

**Não** é teste de igualdade de conjunto entre R1–R5 — a divergência pré-existente (`computer-use` ausente de R2, nomes de pacote não deriváveis por convenção) o deixaria vermelho no primeiro dia. Ver Seção 12.2 do TECH.

---

### 2.3 Componente C — Roteamento e delta por conteúdo

#### 2.3.1 `apps/zcode-cli/packages/core/src/agent/agent-listing-metadata.ts`

**Alteração:** adicionar um campo ao `AgentListingDelta` e as invariantes correspondentes ao parser estrito.

```ts
export interface AgentListingDelta {
  addedTypes: string[];
  addedLines: string[];
  removedTypes: string[];
  isInitial: boolean;
  showConcurrencyNote: boolean;
  /**
   * Nome anunciado → texto já anunciado. Persistido para que uma mudança de
   * descrição, ferramentas ou modelo reemita a linha; ausente em deltas
   * gravados antes deste campo.
   */
  announcedLines?: Record<string, string>;
}
```

O campo é **opcional** e **é escrito** (ver 2.3.2): deltas já persistidos não o têm e continuam parseando (Seção 3 do TECH).

No corpo de `parseAgentListingDelta` (`:12-34`), acrescentar validação quando presente: objeto não-array, não nulo, com chaves e valores string. Invariante nova, **verificável dentro do próprio delta**: para todo `i`, `announcedLines[addedTypes[i]] === addedLines[i]`. O parser valida um delta isolado, então qualquer invariante que dependa de "apareceu antes" é inverificável ali. Registrar ao lado das existentes (`:22-25`) e copiar no retorno (`:28-34`).

#### 2.3.2 `apps/zcode-cli/packages/core/src/subagent/listing.ts`

**Alteração:** `Set<string>` de nomes → `Map<string, string>` nome→texto; filtro por conteúdo; **e emissão do campo novo**.

**Reconstrução** (hoje `:21-30`). `announced` vira `Map<string, string>`. Cada entrada histórica com `metadata.agentListingDelta` contribui:

```ts
// Delta novo: campo explícito, que também cobre nomes já removidos depois.
if (delta.announcedLines) for (const [name, line] of Object.entries(delta.announcedLines)) announced.set(name, line);
// Delta antigo: deriva nome→texto dos pares. A garantia vem da invariante
// `addedTypes.length === addedLines.length` do parser estrito, não de um contrato próprio.
else for (const [i, name] of delta.addedTypes.entries()) announced.set(name, delta.addedLines[i]);
for (const name of delta.removedTypes) announced.delete(name);
```

A remoção apagar a chave é obrigatória: sem isso, um perfil desabilitado e reabilitado com a mesma linha nunca seria re-anunciado.

**Filtro** (hoje `:33`) muda de "não anunciado" para "anunciado com outro texto":

```ts
const added = active.filter(
  (profile) => announced.get(profile.name) !== formatAgentProfileForPrompt(profile, input),
);
```

**`removedTypes`** (hoje `:34-37`): mantém `current` — é ele que faz a checagem de atividade — e muda apenas a fonte da iteração, de `announced` para `announced.keys()`. **A substituição de `Set` por `Map` é no-op para esta linha**: `current` continua sendo um `Set<string>` de nomes ativos. Declarado explicitamente para que a sprint não gaste esforço num refactor sem efeito.

**Emissão** (hoje `:41-47`). Sem este passo, `announcedLines` nunca existe em disco e toda a validação de 2.3.1 vira código morto:

```ts
// 1) Atualiza o mapa com o texto novo, ANTES de serializar.
for (const profile of added) announced.set(profile.name, formatAgentProfileForPrompt(profile, input));
// 2) Só então serializa.
announcedLines: Object.fromEntries(announced),
```

O passo 1 é obrigatório e não é cosmético: sem ele o perfil alterado volta a estar em `added` **em todo turno seguinte**, porque `announced` nunca passa a conter o texto novo. O early-return de `:38` nunca voltaria a disparar e o catálogo seria re-anunciado indefinidamente — o oposto de RF-08 e RNF-07. Com o passo 1 o estado converge no mesmo delta, como o TECH §3 pressupõe.

**Tamanho:** `announcedLines` serializa o mapa inteiro — todos os nomes já anunciados na sessão. Com 4 papéis isso são ~8 linhas, o mesmo teto analisado na Seção 7 do TECH, muito abaixo do orçamento de 40 (RNF-01). Se o catálogo crescer, este é o primeiro campo a medir.

`isInitial` (`:45`) passa a ser `announced.size === 0` sobre o **mesmo mapa** — duas estruturas paralelas divergiriam silenciosamente. O early-return de `:38` permanece e agora dispara de fato quando nada mudou (RF-08).

#### 2.3.3 `apps/zcode-cli/packages/core/src/subagent/profile.ts`

**Alteração:** `formatAgentProfileForPrompt` (`:102-113`) acrescenta sufixo de custo relativo e, só quando há override, o `modelId`.

Regras, nesta ordem de segmentos:

1. `Tools: ...` — inalterado. A ordem é fixada por `EXPLORE_AGENT_DESCRIPTION_TOOL_PRIORITY` (`explore-tools.ts:24-32`); nenhuma linha nova entra no meio desse segmento.
2. **custo relativo, sempre presente**, com comportamento definido por caso:

| Caso | Sufixo |
|---|---|
| `modelSelection` ausente (comum — catálogo não fixa modelo) | `(herda o modelo atual)` |
| `modelSelection` presente via override do usuário | `(modelo definido pelo usuário: ${modelId})` |
| `tools` explícito e não-total | acrescer `; escopo restrito a ${n} ferramentas` |
| `tools === ["*"]` (só `general-purpose`, `profile.ts:85`) | **sem** contagem de ferramentas — `filterSubagentChildToolNames` (`tool-policy.ts:23-30`) não expande `*`, então "escopo restrito a 1 ferramentas" seria factualmente errado |
| `tools` ausente (`AgentProfile.tools` é opcional, `subagent-profile.ts:24`) | sufixo sem contagem; o segmento `Tools:` simplesmente não é renderizado |
| `isBuiltInExploreAgentProfile` (`profile.ts:106-107`) | a lista de ferramentas vem de `formatExploreAllowedToolsForAgentDescription`, **não** de `profile.tools`; a contagem do sufixo usa a lista **já resolvida** que a função acabou de calcular, nunca `profile.tools` direto |

3. **`providerId` nunca é impresso** — proibido por RF-15/O4. É exatamente o valor reescrito por `effective-model-selection.ts:27-40` conforme a conta conectada.

Como o texto muda, aplica-se integralmente a Seção 3 do TECH (derivação retrocompatível + o re-anúncio único aceito após upgrade).

---

### 2.4 Componente D/D2 — Origem do modelo e desativação

#### 2.4.1 `packages/shared/src/subagent-runtime-config.ts`

**Alteração:** o ramo `ready` de `subagentRuntimeConfigSchema` (`:23-31`), hoje `.strict()` e sem `disabledAgentIds`, ganha o campo — reusando a forma do schema de estado, como o arquivo já faz para os outros dois campos:

```ts
kind: z.literal("ready"),
profiles: z.array(agentProfileSchema.refine((profile) => profile.source !== "built-in")),
disabledAgentIds: subagentRuntimeStateSchema.shape.disabledAgentIds,
builtInModelSelectionOverrides: subagentRuntimeStateSchema.shape.builtInModelSelectionOverrides,
pluginAgentModelSelectionOverrides: subagentRuntimeStateSchema.shape.pluginAgentModelSelectionOverrides,
```

`resolveSubagentRuntimeProfiles` (`:37-51`) ganha **uma linha**: repassa `state.disabledAgentIds` no retorno, junto dos outros três campos. É pass-through puro — o estado já tem o campo (`subagentRuntimeStateSchema`, `:8`) e a função só o consumia para filtrar.

**Por que isso basta.** O literal `kind: "ready"` é montado em `packages/services/src/subagents/subagentRuntimeConfig.ts:110-116`, por **spread** de `resolveSubagentRuntimeProfiles(...)`. Ao repassar o campo, o snapshot passa a carregá-lo sem nenhuma alteração naquele arquivo. `readRuntimeConfig` (`subagentsService.ts:592`) apenas devolve o snapshot — também sem alteração.

**O snapshot é em memória** (um `Map` de workspace, `subagentRuntimeConfig.ts:94`, clonado por `structuredClone` em `:219`), não um documento persistido. O que é persistido é `agents-state.json`, validado por `subagentRuntimeStateSchema`, que **já tem `disabledAgentIds` obrigatório** (`:8`). Portanto **não existe snapshot legado sem o campo**, e o campo pode ser **obrigatório** no schema sem risco de parse: um snapshot sempre é construído a partir do estado, que sempre o tem. Sem migração, e sem tocar no schema `.strict()` de `agentProfileSchema` (RNF-05).

#### 2.4.2 `apps/zcode-cli/packages/bootstrap/src/subagents.ts`

**Assinatura alterada 1** — `LoadZCodeAgentProfilesResult` (`:25-30`) expõe o estado que a função **já lê** em `:70` (`readAgentState`) e hoje descarta:

```ts
interface LoadZCodeAgentProfilesResult {
  builtInModelSelectionOverrides: BuiltInSubagentModelSelectionOverrides;
  pluginAgentModelSelectionOverrides: PluginSubagentModelSelectionOverrides;
  diagnostics: AgentProfileParseDiagnostic[];
  profiles: AgentProfile[];
  /** Estado de desativação já materializado no startup; repassado ao loader de plugin. */
  disabledAgentIds: readonly string[];
}
```

Populado a partir de `agentState.disabledAgentIds` (`:78-84`). Sem leitura adicional de disco.

**Assinatura alterada 2** — `LoadPluginAgentProfilesInput` (`:32-38`, interface **interna**, não exportada) ganha:

```ts
/** Snapshot de startup já materializado; o loader de plugin não relê disco nem consulta conta. */
modelSelectionOverrides?: PluginSubagentModelSelectionOverrides;
/** Subagentes desativados por `createPluginAgentStateId`; remove o perfil e o alias. */
disabledAgentIds?: Iterable<string>;
```

**Corpo alterado** — `resolvePluginAgentProfiles` (`:112-164`), no laço `for (const parsed of parsedProfiles)`, antes de `profiles.push(canonical)`:

```ts
const disabled = new Set(input.disabledAgentIds ?? []);
…
if (disabled.has(createPluginAgentStateId(parsed.plugin.id, parsed.bareName))) continue;
```

O `continue` vem **antes** de `canonical`, removendo o nome qualificado **e** o alias de `:134-137` de uma vez — o alias é derivado de `canonical`, e nenhum dos dois deve sobreviver.

O retorno da função (`:158-163`) é um `LoadZCodeAgentProfilesResult`, que por 2.4.2 passa a exigir `disabledAgentIds`. O literal de retorno precisa populá-lo com `[]`: este loader resolve perfis de plugin e não é quem aplica a desativação, apenas a repassa.

**Compatibilidade:** o campo é opcional, então os chamadores existentes (`create-app.ts:247`, `:800` e o helper de teste `bootstrap/tests/helpers/subagents.ts`) continuam compilando.

#### 2.4.3 `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`

**Dois pontos de chamada**, ambos de `resolvePluginAgentProfiles`:

- **`:247`** — carga inicial. A entrada `zcodeSubagentProfiles` vem de `subagentProfilesFromSnapshot(snapshot)` quando existe `readSubagentRuntimeConfig` (`:229`, o caminho normal do Host), e de `loadZCodeAgentProfiles` apenas no CLI standalone (`:230`). **O caminho normal é o snapshot**, que passa a carregar o campo por 2.4.1; `loadZCodeAgentProfiles` continua necessário para o outro chamador e ganha o mesmo campo por 2.4.2, para que os dois caminhos concordem.
- **`:800`** — refresh de runtime. A entrada `parsed` vem de `subagentProfilesFromSnapshot(snapshot)`, que passa a devolver `disabledAgentIds` por 2.4.1.

> Uma redação anterior desta SPEC indicava `:263` como ponto de chamada. **`:263` não é uma chamada** — é a concatenação `const subagentProfiles = [...zcodeSubagentProfiles, ...pluginSubagentProfiles]`. As chamadas reais são `:247` e `:800`.

O refresh é o caminho que um toggle de UI usa, então sem a propagação de `:800` o RF-04 não fecharia no cenário principal.

#### 2.4.4 `packages/services/src/subagents/subagentsService.ts`

**Sem mudança de lógica.** A derivação `enabled: agent.scope === "user" ? !disabledSet.has(agent.id) : true` (`:298`), com `agent.id = createPluginAgentStateId(...)` (`:340`), fica correta assim que D2 popular a chave. O que muda é que a chave passa a existir.

O `readRuntimeConfig` deste serviço passa a incluir `disabledAgentIds` no snapshot "ready" que monta (2.4.1).

Ressalva registrada na Seção 2 do Componente D2 do TECH: plugin semeado em escopo `workspace` cai no ramo `: true` e ficaria sempre habilitado. Fora do Release 1.

#### 2.4.5 `packages/ui/src/settings/SubagentsSection.tsx`

**`supportsEnabledToggle`** (`:144-146`) deixa de excluir linhas de plugin. Hoje:

```ts
function supportsEnabledToggle(agent: AgentSummary): boolean {
  return isEditableUserAgent(agent) && agent.scope === "user";
}
```

Novo: habilitar o toggle quando `source === "plugin"`. `isEditableUserAgent` (`:132-138`) continua governando **edição de conteúdo** — linhas de plugin seguem `readOnly: true` e não editáveis, o que é correto: o markdown do plugin é sobrescrito no upgrade. Toggle e edição são coisas distintas e devem ser desbloqueados separadamente.

**`handleToggle`** (a chamada a `setEnabled` está em `:1496`) grava a chave que D2 consulta: para linhas de plugin, `agent.id`, que já é `plugin:<pluginId>:<bare>`; para as demais, inalterado.

**RF-10** — rótulo de origem do modelo na linha, com **dois** estados: `modelSelectionOverride` presente → "sobrescrito manualmente"; senão → "herdado do pai". Chaves novas em `packages/ui/src/i18n/locales/`, **nos locales existentes** — `en-US.ts` e `zh-CN.ts`. Este repositório **não tem locale `pt-BR`**, e uma chave para ele ficaria inerte (RNF-04).

---

## 3. Fluxo principal e fluxos de erro

### 3.1 Fluxo principal — primeiro uso

```
App inicia
  → seedBundledOfficialPlugins  (bundled-plugins.ts:91-100)
  → semeia agent-catalog (defaultEnabled: true)
  → componentes kind:"agent" varrem agents/*.md  (plugin-components.ts:31-32)
  → snapshot do Host (caminho normal, create-app.ts:224-229) OU loadZCodeAgentProfiles (CLI standalone, :230)
  → resolvePluginAgentProfiles  (aplica overrides de modelo; descarta desativados)
  → create-app.ts:263 concatena com os perfis de usuário/projeto
  → turn-loop.ts:126, 1x por turno:
       formatAgentProfileForPrompt por perfil → linha com quando usar + custo relativo
       delta por conteúdo → só o que mudou, com announcedLines emitido
  → pai vê o catálogo e roteia
```

### 3.2 Fluxos de erro

| Situação | Comportamento esperado |
|---|---|
| `agents/*.md` malformado | `parsePluginAgentProfile` (`:166-207`) emite `AgentProfileParseDiagnostic`; o perfil é ignorado, o resto do plugin carrega |
| Falta um `requiredSeedPaths` | `isSeedUsable` recusa gerar cache parcial (`bundled-plugins.ts:467-480`) — o plugin inteiro não semeia |
| Versão desalinhada entre R1/R2/package/manifest | T-10 falha no build |
| Alias em conflito com nome reservado | Já emite `agent_ambiguous_name` e não cria o alias (`subagents.ts:139-148`) |
| `disabledAgentIds` com id órfão | Sem efeito — é um `Set` e ids desconhecidos não filtram nada |
| Snapshot sem `disabledAgentIds` | Não ocorre: o snapshot é em memória e sempre nasce do estado, que tem o campo obrigatório |
| Sub-agente desabilitado, depois reabilitado | `announced.delete` na remoção + filtro por conteúdo ⇒ **re-anunciado** |
| Sessão retomada com histórico antigo | Re-anúncio único e convergência (Seção 3 do TECH); sem laço |
| Catálogo ausente/desabilitado | `resolveFilesystemPluginRoot` devolve `undefined`; nada semeia; o produto funciona sem o catálogo (`bundled-plugins.ts:345-353`) |

---

## 4. Casos de borda

- **Concorrência:** D2 lê um snapshot já materializado no startup — não há leitura extra por chamada. O toggle surte efeito no próximo refresh de runtime, o mesmo regime do restante do estado de sub-agentes.
- **Dados legados:** `agents-state.json` sem chave `plugin:` em `disabledAgentIds` é o estado "tudo habilitado" — o default, sem migração. O campo em si nunca está ausente: `subagentRuntimeStateSchema` o exige (`:8`).
- **Nome do plugin muda:** desativações e overrides ficam órfãos. Risco pré-existente para overrides, agora compartilhado (TECH D2).
- **Colisão catálogo × agente do usuário:** `reservedProfileNames` (`:118-121`) resolve; o alias não é criado e um diagnóstico é emitido.
- **Limite de linhas:** 4 papéis × 2 (qualificado + alias) + 2 built-ins ≈ 8 linhas, abaixo do teto de 40 (RNF-01). Paginação fora de escopo.
- **`tools: ["*"]`:** ver a tabela em 2.3.3 — sem contagem de ferramentas no sufixo.
- **`tools` ausente:** sem segmento `Tools:`, sem contagem no sufixo.
- **Ordem das ferramentas no texto:** preservada por `EXPLORE_AGENT_DESCRIPTION_TOOL_PRIORITY`; nenhuma linha nova entra no meio do segmento.

---

## 5. Mudanças arquivo a arquivo

| # | Caminho | Ação | O que muda |
|---|---|---|---|
| 1 | `apps/zcode-cli/packages/agent-catalog-plugin/package.json` | criar | manifesto npm mínimo, `@zcode/agent-catalog-plugin@0.1.0` |
| 1 | `apps/zcode-cli/packages/agent-catalog-plugin/.zcode-plugin/plugin.json` | criar | manifest do plugin; portão de existência da raiz |
| 2 | `apps/zcode-cli/packages/agent-catalog-plugin/agents/code-reviewer.md` | criar | papel + prompt |
| 3 | `…/agents/repo-researcher.md` | criar | papel + prompt |
| 4 | `…/agents/test-triager.md` | criar | papel + prompt |
| 5 | `…/agents/long-form-summarizer.md` | criar | papel + prompt |
| 6 | `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts` | alterar | entrada R1 |
| 7 | `apps/zcode-cli/packages/cli/scripts/sea-official-plugin-assets.mjs` | alterar | entrada R2 |
| 8 | `packages/desktop/scripts/prepare-agent-node-bundle.mjs` | alterar | entrada R3 |
| 9 | `scripts/prepare-prebuilds.mjs` | alterar | entrada R4 |
| 10 | `packages/server/src/remote/zcodeAgentOfficialPluginAssets.ts` | alterar | entrada R5 |
| 11 | `packages/shared/src/subagent-runtime-config.ts` | alterar | `disabledAgentIds` no ramo `ready` do snapshot (2.4.1) |
| 12 | `apps/zcode-cli/packages/core/src/agent/agent-listing-metadata.ts` | alterar | campo `announcedLines?` + invariantes no parser |
| 13 | `apps/zcode-cli/packages/core/src/subagent/listing.ts` | alterar | `Set`→`Map`, derivação retrocompatível, filtro por conteúdo, emissão de `announcedLines` |
| 14 | `apps/zcode-cli/packages/core/src/subagent/profile.ts` | alterar | sufixo de custo relativo; `modelId` só com override; nunca `providerId` |
| 15 | `apps/zcode-cli/packages/bootstrap/src/subagents.ts` | alterar | `LoadZCodeAgentProfilesResult.disabledAgentIds`; `LoadPluginAgentProfilesInput.disabledAgentIds`; descarte em `resolvePluginAgentProfiles` |
| 16 | `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts` | alterar | propaga `disabledAgentIds` em `:247` e `:800` |
| 17 | `packages/services/src/subagents/subagentRuntimeConfig.ts` | verificar | **nenhuma edição**: o snapshot pega o campo por spread de `resolveSubagentRuntimeProfiles` (`:110-116`). Listado como ponto de verificação, não de mudança |
| 18 | `packages/ui/src/settings/SubagentsSection.tsx` | alterar | toggle para plugin; chave correta; rótulos de RF-10 |
| 19 | `packages/ui/src/i18n/locales/en-US.ts`, `zh-CN.ts` | alterar | chaves dos rótulos de RF-10 |
| 20 | `packages/ui/test/subagentsSectionI18n.test.ts` | criar | T-16 |
| 21 | `packages/ui/test/subagentsSectionCatalog.test.ts` | criar | T-08 |
| 22 | `apps/zcode-cli/packages/bootstrap/tests/plugins.test.ts` | alterar | T-09, T-10 |
| 23 | `apps/zcode-cli/packages/bootstrap/tests/helpers/subagents.ts` | alterar | helper aceita `disabledAgentIds` |
| 24 | `apps/zcode-cli/packages/bootstrap/tests/plugin-agent-disable.test.ts` | criar | T-07, T-13 |
| 25 | `apps/zcode-cli/packages/core/tests/agent-listing.test.ts` | alterar | T-03, T-04, T-05, T-15 |
| 26 | `apps/zcode-cli/packages/core/tests/agent-listing-runtime.test.ts` | alterar | T-05 (retomada a frio) |
| 27 | `apps/zcode-cli/packages/core/tests/subagent-profile.test.ts` | alterar | T-02 |
| 28 | `apps/zcode-cli/packages/core/tests/subagent-catalog-integration.test.ts` | criar | T-01 |
| 29 | `apps/zcode-cli/packages/adapters/tests/agent-listing-wire.test.ts` | alterar | T-06 + medição M3 |
| 30 | `apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts` | alterar | T-14 |
| 31 | `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-catalog.test.ts` | criar | T-11, T-12 |
| 32 | `docs/conversation-session-case-catalog.md` | alterar | registro do caso E2E novo |
| 33 | `docs/testing/conversation-session-e2e-coverage-matrix.md` | alterar | registro do caso E2E novo |

Nenhum arquivo é removido. Nenhuma assinatura pública é removida. `formatAgentProfilesForPrompt` (plural, sem consumidor de produção) **não é alterado** — consolidá-lo é escopo de outra feature.

---

## 6. Critérios de aceitação

| CA | Critério verificável | RF/RNF |
|---|---|---|
| CA-01 | O catálogo semeia e os 4 perfis aparecem em `activeAgents` sem configuração do usuário | RF-01 |
| CA-02 | Cada papel tem `name`, `description` com anti-disparo, `tools` explícito e `permissionMode` ≠ `bypassPermissions` | RF-02, RNF-06 |
| CA-03 | Nenhum `agents/*.md` declara `model:`, `thoughtLevel:` ou `tools: ["*"]` | RF-03, RF-15 |
| CA-04 | `agent-catalog` presente em R1–R5; versão igual em package.json, plugin.json, R1 e R2; todo `requiredSeedPaths` existe | RF-15 |
| CA-05 | A listagem do plugin não aponta `ZAI_AUTHOR` nem ícone de CDN da Z.ai, e não declara nenhum provedor como oficial | RF-16 |
| CA-06 | A linha injetada de cada papel contém quando usar, quando não usar, ferramentas e custo relativo | RF-06 |
| CA-07 | A linha **nunca** contém `providerId`; com override, contém só `modelId` | RF-06, RF-15 |
| CA-08 | As três tarefas de RF-07 têm linha correspondente no delta inicial | RF-07 |
| CA-09 | Sem alteração de perfis entre dois turnos, nenhum attachment de listagem é produzido | RF-08 |
| CA-10 | Alterar o modelo de um perfil reemite a linha no turno seguinte, sem ação do usuário | RF-09 |
| CA-11 | Um `plugin:…:<bare>` em `disabledAgentIds` remove o perfil qualificado **e** o alias de `activeAgents` | RF-04 |
| CA-12 | O toggle aparece em linhas de plugin, grava a chave que o runtime consulta, e o efeito sobrevive ao reload do runtime | RF-04 |
| CA-13 | Dois rótulos de origem de modelo distintos, estáveis após reload | RF-05, RF-10 |
| CA-14 | Delta gravado no formato antigo continua parseando; na retomada cada nome é anunciado no máximo uma vez e o estado converge | RF-08, RNF-07 |
| CA-15 | `announcedLines` não vaza para o payload do provedor | RNF-03 |
| CA-21 | O modelo efetivo de cada sub-agente continua ecoado no evento `SubagentSpawned` (`core/src/subagent/runner.ts:240-256`) | RNF-03 |
| CA-16 | 0 operações de arquivo por chamada de `Agent`; montagem do delta < 2 ms p95 | RNF-02 |
| CA-17 | Razão listagem/system prompt ≤ 3% | RNF-01, M3 |
| CA-18 | Todo texto novo de UI existe em `en-US.ts` e `zh-CN.ts`; nenhuma chave referencia locale inexistente | RNF-04 |
| CA-22 | T-01 e T-02 localizam `agents/*.md` por caminho relativo à raiz do repo, e falham de forma explícita se o diretório não existir — em vez de passar por conjunto vazio | RNF-05 |
| CA-19 | Nenhum perfil de usuário/projeto existente muda de comportamento ao carregar | RNF-05 |
| CA-20 | `pnpm typecheck`, `pnpm --filter zcode-cli typecheck` e `pnpm lint` passam | — (gate de build) |

**Cobertura verificada:** cada CA mapeia para ao menos um RF/RNF (CA-20 é o gate de build, por natureza). Cada RF do Release 1 (01–10, 15, 16) e cada RNF (01–07) tem ao menos um CA:

| Requisito | CA |
|---|---|
| RF-01 | CA-01 |
| RF-02 | CA-02 |
| RF-03 | CA-03 |
| RF-04 | CA-11, CA-12 |
| RF-05 | CA-13 |
| RF-06 | CA-06, CA-07 |
| RF-07 | CA-08 |
| RF-08 | CA-09, CA-14 |
| RF-09 | CA-10 |
| RF-10 | CA-13 |
| RF-15 | CA-03, CA-04, CA-07 |
| RF-16 | CA-05 |
| RNF-01 | CA-17 |
| RNF-02 | CA-16 |
| RNF-03 | CA-15, CA-21 |
| RNF-04 | CA-18 |
| RNF-05 | CA-19 |
| RNF-06 | CA-02 |
| RNF-07 | CA-14 |

---

## 7. Plano de testes

Numeração **renumerada** em relação à Seção 9.2 do TECH, que é o plano de alto nível. Esta tabela é a autoritativa para as sprints; o mapa TECH→SPEC está na Seção 7.1.

| ID | Teste | Cobre | Tipo | Arquivo |
|---|---|---|---|---|
| T-01 | Os 4 `agents/*.md` parseiam e os perfis chegam a `activeAgents` sem configuração do usuário | CA-01, CA-08, CA-22 | integração | `core/tests/subagent-catalog-integration.test.ts` — caminho relativo à raiz do repo; falha explícita se o diretório não existir |
| T-02 | nenhum declara `model:`/`thoughtLevel:`/`bypassPermissions`/`tools: ["*"]`; cada `description` contém anti-disparo | CA-02, CA-03, CA-22 | unit | `core/tests/subagent-profile.test.ts` — caminho relativo à raiz do repo |
| T-03 | a linha injetada tem quando usar, quando não usar, ferramentas e custo relativo; `tools:["*"]` e `tools` ausente não geram contagem errada | CA-06 | unit | `core/tests/agent-listing.test.ts` |
| T-04 | mudar o modelo reemite a linha no turno seguinte sem mudar o conjunto de nomes | CA-10 | unit | `core/tests/agent-listing.test.ts` |
| T-05 | nada alterado ⇒ nenhum attachment; retomada com histórico antigo anuncia no máximo uma vez e converge | CA-09, CA-14 | unit | `core/tests/agent-listing.test.ts`, `agent-listing-runtime.test.ts` |
| T-06 | `announcedLines` não vaza no payload do provedor; razão listagem/system prompt ≤ 3% | CA-15, CA-17 | integração | `adapters/tests/agent-listing-wire.test.ts` |
| T-07 | `plugin:…:<bare>` remove qualificado **e** alias; sobe pelo caminho real (Host snapshot → `resolvePluginAgentProfiles` → merge → `activeAgents`) e **não** por `resolveSubagentRuntimeProfiles` | CA-11 | integração | `bootstrap/tests/plugin-agent-disable.test.ts` |
| T-08 | toggle visível em linha de plugin; dois rótulos de origem distintos e estáveis após reload | CA-12, CA-13 | render | `packages/ui/test/subagentsSectionCatalog.test.ts` |
| T-09 | `agent-catalog` presente em R1–R5 com nomes e caminhos corretos; sem `ZAI_AUTHOR` nem CDN da Z.ai | CA-04, CA-05 | unit | `bootstrap/tests/plugins.test.ts` |
| T-10 | versão alinhada em package.json / plugin.json / R1 / R2; todo `requiredSeedPaths` existe | CA-04 | unit | `bootstrap/tests/plugins.test.ts` |
| T-11 | E2E: `Agent` com `subagent_type` de catálogo despacha; o modelo efetivo é o resolvido; a linha aparece no catálogo injetado | CA-01, CA-21 | E2E | `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-catalog.test.ts` |
| T-12 | E2E: tempo de spawn medido contra baseline | M4 | E2E | mesmo arquivo |
| T-13 | o snapshot "ready" carrega `disabledAgentIds` por spread de `resolveSubagentRuntimeProfiles`, sem alteração em `subagentRuntimeConfig.ts:110-116` | CA-12 | unit | `bootstrap/tests/plugin-agent-disable.test.ts` |
| T-14 | nenhum perfil de usuário/projeto existente muda de comportamento ao carregar | CA-19 | unit | `bootstrap/tests/subagents.test.ts` |
| T-15 | nenhum acesso a arquivo no caminho da chamada de `Agent`; montagem do delta sob o orçamento | CA-16 | unit | `core/tests/agent-listing.test.ts` |
| T-16 | chaves de i18n novas presentes em `en-US.ts` e `zh-CN.ts`; nenhuma referencia locale inexistente | CA-18 | unit | `packages/ui/test/subagentsSectionI18n.test.ts` |

### 7.1 Mapa TECH → SPEC

O TECH (§9.2) lista 14 testes de alto nível. Este documento os renumera, funde e amplia:

| TECH | SPEC | Observação |
|---|---|---|
| T-01, T-02 | T-02 | — |
| T-03 | T-01 | **redefinido** — o TECH-era "os papéis de RF-07 no delta inicial"; a asserção de conteúdo da linha vira T-03 (CA-06) e a presença no delta inicial vira CA-08, coberto por T-01 |
| T-04 | T-04 | — |
| T-05, T-06 | T-05 | fundidos |
| T-07 | T-06 | — |
| T-08, T-09 | **T-07** | **fundidos.** T-09 do TECH ("o consumidor é `resolvePluginAgentProfiles`") é uma afirmação sobre o código, não um comportamento: como teste independente passaria trivialmente mesmo com o defeito inteiro. Passou a ser uma asserção dentro de T-07, que sobe pelo caminho real |
| T-10, T-11 | T-09, T-10 | — |
| T-12 | T-08 | — |
| T-13, T-14 | T-11, T-12 | — |
| — | T-13 a T-16 | **novos**, introduzidos pela validação adversarial: propagação do estado pelo snapshot (T-13), não-regressão de perfis existentes (T-14), ausência de I/O e orçamento (T-15), e locales (T-16) |

**Comandos de verificação** (confirmados no manifesto, Seção 9.3 do TECH):

```bash
pnpm typecheck
pnpm --filter zcode-cli typecheck
pnpm lint
pnpm test:unit:affected
```

Comandos de teste E2E: a sprint declara os reais do pacote alvo — a raiz não tem script unificado de E2E.