# Plano de Implementação de Overrides de Modelo para Subagents Integrados

> **Para o agente executor:** é obrigatório usar `superpowers:executing-plans` para executar as tarefas. Os passos deste plano usam a sintaxe de checklist `- [ ]`; durante a execução, marque cada item individualmente.

**Objetivo:** permitir que o usuário configure modelos persistentes para os subagents integrados `general-purpose` e `Explore`, assim como já faz com subagents customizados.

**Arquitetura:** em vez de transformar os subagents integrados em custom agents editáveis, adicionamos uma camada de override de modelo para integrados sobre o estado de subagents existente. Settings só expõe a seleção de modelo dos agentes integrados; o runtime, na inicialização, lê o mesmo estado e injeta o built-in profile; a superfície de ferramentas de `Explore` precisa ser calculada com o mesmo effective model do child model final.

**Stack técnico:** TypeScript, React, Vitest, contrato de ferramentas Zod/JSON Schema, serviço de subagents existente, runtime/bootstrap zcode-cli existente.

## Limites de execução desta rodada

- Sem commit automático; os passos de `git commit` do plano servem apenas de referência para commit manual e não são executados nesta rodada.
- Não modificar `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` nem a topologia de build; se a entrada de build E2E falhar por problemas preexistentes de workspace, registrar apenas como bloqueio de verificação.
- E2E não verifica "após salvar a caliente em Settings, agentes já inicializados passam a valer imediatamente". O agente desktop atual inicializa no início da abertura da janela, então o E2E oficial verifica apenas o cenário em que existe uma sobrescrita em `agents-state.json` antes do início: reflexo em Settings, leitura no bootstrap e requisição child provider-visible usando o modelo sobrescrito.
- Salvar/limpar a sobrescrita em Settings é coberto por testes unitários de UI/service; a eficácia no runtime provider-visible é coberta por testes unitários de core/bootstrap e por um caso WDIO de cold start.
- Cobrir apenas o override de modelo dos integrados `general-purpose` / `Explore`; não estender prompt/tools/description/delete/disable, nem introduzir override em nível de workspace nem semântica de replay mobile `/remote`.
- As asserções da superfície de ferramentas de `Explore` devem usar o child model efetivo; sem override, o child model efetivo herda o modelo principal, e não pode mais ser calculado pelo antigo valor padrão `lite`.

## Restrições globais

- Novas funcionalidades primeiro recebem spec em `docs`, depois vêm a implementação do código.
- Mudanças de UI que envolvam `packages/ui` devem respeitar o `DESIGN.md` da raiz antes de serem feitas.
- Os integrados `general-purpose` / `Explore` continuam somente leitura; este plano só abre o override de modelo, não abre prompt, tools, description, delete, disable.
- O formato de modelo já existente dos custom subagents continua sendo `custom:provider-id:model-id`; não criar um segundo formato de model id.
- `general-purpose` sem override configurado continua herdando o modelo principal da sessão pai.
- `Explore` sem override configurado herda o modelo principal da sessão pai.
- As ferramentas child provider-visible de `Explore` devem decidir o ramo de embedded-search pelo child model efetivo final.
- Não afundar o estado de subagent/session/task em relay ou Electron main.
- Se a execução alterar o schema provider-visible da ferramenta `Agent`, é preciso atualizar junto `apps/zcode-cli/docs/design/v2/tool/00-tool-change-chain.md` e `apps/zcode-cli/docs/design/v2/tool/07-subagent.md`.
- Rodar testes direcionados ao fim de cada phase; ao final, rodar `pnpm typecheck` e `pnpm lint`.

---

## Fatos Atuais

- O `AgentProfile` em `apps/zcode-cli/packages/core/src/subagent/profile.ts` já suporta `model?: string`.
- O custom markdown profile já suporta salvar `model: custom:provider:model`.
- `createBuiltInExploreAgentProfile()` hoje não escreve mais o campo `model` padrão; em runtime equivale a herdar o main model.
- `createBuiltInGeneralPurposeAgentProfile()` hoje não tem campo `model`; em runtime equivale a herdar o main model.
- `apps/zcode-cli/packages/core/src/subagent/runner.ts` já mescla `request.model` com `profile.model` e passa para o child runtime.
- `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts` já consegue resolver `custom:provider:model` em `ModelRef`.
- `packages/services/src/subagents/subagentsService.ts` hoje retorna os agentes integrados como summary com `readOnly: true`.
- `packages/ui/src/settings/SubagentsSection.tsx` hoje só permite edição/exclusão/toggle de user agent e esconde o badge de modelo do built-in.

## Responsabilidades dos Arquivos

- Criar `docs/subagents-built-in-model-overrides.md`: spec da funcionalidade e da semântica de runtime.
- Modificar `docs/ui/subagents-built-in-model-badge.md`: de "esconder o badge de modelo do built-in" para "controle de configuração somente leitura do modelo integrado".
- Modificar `packages/shared/src/subagents-types.ts`: tipo compartilhado de override de integrado e parâmetros de service.
- Modificar `packages/services/src/subagents/subagents.ts`: novos métodos de service.
- Modificar `packages/services/src/subagents/subagentsService.ts`: ler/escrever estado e projetar o effective model dos integrados.
- Modificar `packages/services/test/subagentsService.test.ts`: testes de estado e de listagem do lado do service.
- Modificar `apps/zcode-cli/packages/bootstrap/src/subagents.ts`: ler overrides de integrados na inicialização.
- Modificar `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`: passar os overrides para a config do runtime.
- Modificar `apps/zcode-cli/packages/bootstrap/src/app/runtime-config.ts`: mesclar overrides de config.
- Modificar `apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts`: testes do loader do bootstrap.
- Modificar `apps/zcode-cli/packages/core/src/runtime/types.ts`: runtime config ganha `subagents.builtInModelOverrides`.
- Modificar `apps/zcode-cli/packages/core/src/subagent/profile.ts`: built-in profile recebe os overrides ao ser criado.
- Modificar `apps/zcode-cli/packages/core/src/subagent/runner.ts`: allowed tools de `Explore` recebem o contexto de effective model.
- Modificar `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`: extrair o resolvedor compartilhado de effective model, usado tanto pelo child runtime quanto pela allowlist.
- Modificar `apps/zcode-cli/packages/core/tests/subagent-profile.test.ts`: testes de override de profile.
- Modificar `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`: testes de child model provider-visible e do ramo de ferramentas de `Explore`.
- Modificar `packages/ui/src/settings/SubagentsSection.tsx`: adicionar controle de modelo na linha de integrado.
- Modificar `packages/ui/test/subagentsSection.test.ts`: testes de renderização e de comportamento de salvamento da UI.
- Modificar os arquivos de i18n existentes: adicionar o modelo padrão dos integrados e o texto de falha ao salvar.

## Phase 0: escrever o spec e travar os limites

### Task 1: escrever o spec da funcionalidade

**Arquivos:**
- Criar `docs/subagents-built-in-model-overrides.md`
- Modificar `docs/ui/subagents-built-in-model-badge.md`

**Interfaces de saída:**
- Deixar explícito `BuiltInSubagentName = "general-purpose" | "Explore"`.
- Deixar explícito que `builtInModelOverrides` fica no arquivo de estado de subagents existente.
- Deixar explícito que os agentes integrados só abrem o override de modelo.

- [ ] **Step 1: criar o spec da funcionalidade**

Criar `docs/subagents-built-in-model-overrides.md`, escrevendo:

````markdown
# Overrides de Modelo para Subagents Integrados

## Objetivo

O usuário pode configurar overrides de modelo persistentes para os subagents integrados `general-purpose` e `Explore`.

## Não objetivos

- Não é permitido editar nome, descrição, system prompt, tools, permissões ou estado de exclusão dos agentes integrados.
- Não é permitido desabilitar os agentes integrados.
- Não criar override de integrado em nível de workspace.
- Não mudar a semântica do campo de modelo em markdown dos custom subagents.

## Comportamento padrão

- `general-purpose` sem override configurado herda o main model da sessão pai.
- `Explore` sem override configurado herda o main model da sessão pai.
- Depois de limpar o override, volta o comportamento padrão acima.

## Formato de armazenamento

Estender o estado de subagents existente:

```json
{
  "disabledAgentIds": [],
  "builtInModelOverrides": {
    "general-purpose": "custom:custom-openai:gpt-5.4",
    "Explore": "custom:custom-openai:glm-5.2"
  }
}
```

A ausência de `builtInModelOverrides` significa que não há override.

## Semântica de runtime

```ts
type BuiltInSubagentName = "general-purpose" | "Explore";
type BuiltInSubagentModelOverrides = Partial<Record<BuiltInSubagentName, string>>;
```

Após ler o estado, o bootstrap do runtime injeta os overrides na construção do built-in profile. O carregamento e a precedência existentes de profiles custom / project / plugin permanecem iguais.

## Superfície de ferramentas do Explore

Os allowed tools de `Explore` precisam usar o child model efetivo final para decidir o ramo de embedded-search. Ou seja, sem override o cálculo é pelo main model herdado, e com override configurado é pelo modelo sobrescrito.

## Aceitação

- Em Settings, os agentes integrados têm um controle de modelo.
- Em Settings, os agentes integrados continuam sem entradas de edição, exclusão ou desativação.
- Depois de salvar o override de `general-purpose`, a requisição child provider-visible usa o modelo sobrescrito.
- Depois de salvar o override de `Explore`, a requisição child provider-visible usa o modelo sobrescrito.
- As ferramentas child de `Explore` são coerentes com as capacidades do modelo sobrescrito.
- Limpar o override restaura o modelo padrão.
````

- [ ] **Step 2: atualizar a documentação de UI**

Reescrever `docs/ui/subagents-built-in-model-badge.md` como:

```markdown
# Controle de Modelo dos Subagents Integrados

O Settings exibe um controle de modelo para os subagents integrados, mas os demais campos continuam somente leitura.

- `general-purpose` por padrão herda o main model da sessão pai.
- `Explore` por padrão herda o main model da sessão pai.
- Quando o usuário escolhe um modelo concreto, isso é gravado como built-in model override.
- Depois de limpar o override, volta o comportamento padrão do integrado.
- Agentes integrados não exibem edit, delete, enabled switch, prompt editor nem tools editor.
- Subagents de usuário e de plugin continuam usando o resumo de modelo já existente.

Essa regra afeta a exibição em `packages/ui`, o estado do settings service e o built-in profile injetado no runtime pelo bootstrap.
```

- [ ] **Step 3: autoverificação da documentação**

Executar:

```bash
node -e 'const fs=require("node:fs"); for (const file of ["docs/subagents-built-in-model-overrides.md","docs/ui/subagents-built-in-model-badge.md"]) { const text=fs.readFileSync(file,"utf8"); for (const marker of ["T"+"BD","TO"+"DO","implement "+"later","fill "+"in"]) { if (text.includes(marker)) { console.error(`${file}: ${marker}`); process.exitCode=1; } } }'
```

Esperado: sem saída, código de saída 0.

- [ ] **Step 4: commitar o spec**

```bash
git add docs/subagents-built-in-model-overrides.md docs/ui/subagents-built-in-model-badge.md
git commit -m "docs: specify built-in subagent model overrides"
```

## Phase 1: tipos compartilhados e estado do service

### Task 2: adicionar os tipos compartilhados e a interface do service

**Arquivos:**
- Modificar `packages/shared/src/subagents-types.ts`
- Modificar `packages/services/src/subagents/subagents.ts`

**Interfaces de saída:**

```ts
export type BuiltInSubagentName = "general-purpose" | "Explore";
export type BuiltInSubagentModelOverrides = Partial<Record<BuiltInSubagentName, AgentProfileModel>>;

export interface BuiltInSubagentModelOverrideParams {
  agentName: BuiltInSubagentName;
  model?: AgentProfileModel;
}
```

- [ ] **Step 1: modificar os tipos compartilhados**

Adicionar na área de tipos de agente em `packages/shared/src/subagents-types.ts`:

```ts
export type BuiltInSubagentName = "general-purpose" | "Explore";

export type BuiltInSubagentModelOverrides = Partial<Record<BuiltInSubagentName, AgentProfileModel>>;
```

Estender `AgentSummary`:

```ts
  defaultModel?: AgentProfileModel;
  modelOverride?: AgentProfileModel;
```

Adicionar os parâmetros do service:

```ts
export interface BuiltInSubagentModelOverrideParams {
  agentName: BuiltInSubagentName;
  model?: AgentProfileModel;
}
```

- [ ] **Step 2: modificar a interface do service**

Importar `BuiltInSubagentModelOverrideParams` em `packages/services/src/subagents/subagents.ts` e adicionar em `ISubagentsService`:

```ts
  setBuiltInModelOverride(params: BuiltInSubagentModelOverrideParams): Promise<void>;
```

- [ ] **Step 3: rodar a checagem de tipos**

```bash
pnpm typecheck
```

Esperado: erro de tipo apontando que a implementação não tem `setBuiltInModelOverride`.

### Task 3: implementar a leitura e escrita do estado no service

**Arquivos:**
- Modificar `packages/services/src/subagents/subagentsService.ts`
- Modificar `packages/services/test/subagentsService.test.ts`

**Interfaces consumidas:**
- `BuiltInSubagentModelOverrides`
- `BuiltInSubagentModelOverrideParams`

**Interfaces de saída:**
- `createSubagentsService().setBuiltInModelOverride(...)`
- `list()` devolve `model`, `defaultModel` e `modelOverride` dos agentes integrados

- [ ] **Step 1: escrever o teste que falha**

Adicionar dentro de `describe("createSubagentsService", ...)` em `packages/services/test/subagentsService.test.ts`:

```ts
  it("persists model overrides for built-in subagents without making them editable", async () => {
    const home = await makeTempHome();
    const workspacePath = join(home, "workspace");
    const service = createSubagentsService({ homeDir: home, isDesktopRuntime: true });

    await service.setBuiltInModelOverride({
      agentName: "general-purpose",
      model: "custom:custom-openai:gpt-5.4",
    });
    await service.setBuiltInModelOverride({
      agentName: "Explore",
      model: "custom:custom-openai:glm-5.2",
    });

    const result = await service.list({
      workspacePath,
      provider: "glm",
      mode: "settingsUserOnly",
    });

    expect(result.agents.find((agent) => agent.name === "general-purpose")).toMatchObject({
      model: "custom:custom-openai:gpt-5.4",
      modelOverride: "custom:custom-openai:gpt-5.4",
      readOnly: true,
    });
    expect(result.agents.find((agent) => agent.name === "Explore")).toMatchObject({
      defaultModel: "lite",
      model: "custom:custom-openai:glm-5.2",
      modelOverride: "custom:custom-openai:glm-5.2",
      readOnly: true,
    });
  });

  it("clears a built-in subagent model override and restores the built-in default", async () => {
    const home = await makeTempHome();
    const workspacePath = join(home, "workspace");
    const service = createSubagentsService({ homeDir: home, isDesktopRuntime: true });

    await service.setBuiltInModelOverride({
      agentName: "Explore",
      model: "custom:custom-openai:glm-5.2",
    });
    await service.setBuiltInModelOverride({
      agentName: "Explore",
      model: undefined,
    });

    const result = await service.list({
      workspacePath,
      provider: "glm",
      mode: "settingsUserOnly",
    });

    expect(result.agents.find((agent) => agent.name === "Explore")).toMatchObject({
      model: undefined,
      modelOverride: undefined,
      readOnly: true,
    });
  });
```

- [ ] **Step 2: confirmar que o teste falha**

```bash
pnpm --filter @zcode/services test -- --run test/subagentsService.test.ts
```

Esperado: falha, porque `setBuiltInModelOverride` ainda não foi implementado.

- [ ] **Step 3: estender a estrutura de estado**

Modificar os imports em `packages/services/src/subagents/subagentsService.ts`:

```ts
  type BuiltInSubagentModelOverrideParams,
  type BuiltInSubagentModelOverrides,
```

Modificar a interface de estado:

```ts
interface AgentsStateFile {
  builtInModelOverrides: BuiltInSubagentModelOverrides;
  disabledAgentIds: string[];
}
```

Adicionar o helper de estado vazio:

```ts
function emptyAgentsState(): AgentsStateFile {
  return {
    builtInModelOverrides: {},
    disabledAgentIds: [],
  };
}
```

- [ ] **Step 4: compatibilizar arquivos antigos ao ler o estado**

Trocar o fallback de `readAgentStateFile()` por `emptyAgentsState()` e passar a parsear os overrides:

```ts
const builtInModelOverrides = isRecord(parsed.builtInModelOverrides)
  ? normalizeBuiltInModelOverrides(parsed.builtInModelOverrides)
  : {};

return {
  builtInModelOverrides,
  disabledAgentIds: Array.isArray(parsed.disabledAgentIds)
    ? parsed.disabledAgentIds.filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [],
};
```

Adicionar perto das funções utilitárias já existentes no fim do arquivo:

```ts
function normalizeBuiltInModelOverrides(input: Record<string, unknown>): BuiltInSubagentModelOverrides {
  const result: BuiltInSubagentModelOverrides = {};
  const generalPurpose = scalarModel(input["general-purpose"]);
  const explore = scalarModel(input.Explore);
  if (generalPurpose) result["general-purpose"] = generalPurpose;
  if (explore) result.Explore = explore;
  return result;
}

function scalarModel(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}
```

Se este arquivo não tiver `isRecord()`, adicionar:

```ts
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 5: projetar o override no summary do built-in**

Mudar `createBuiltInAgents()` para:

```ts
function createBuiltInAgents(overrides: BuiltInSubagentModelOverrides = {}): AgentSummary[] {
  const generalPurposeOverride = overrides["general-purpose"]?.trim();
  const exploreOverride = overrides.Explore?.trim();
  return [
    {
      id: createAgentStateId({
        name: "general-purpose",
        scope: "built-in",
        source: "built-in",
      }),
      name: "general-purpose",
      description:
        "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks.",
      color: "blue",
      ...(generalPurposeOverride
        ? { model: generalPurposeOverride, modelOverride: generalPurposeOverride }
        : {}),
      systemPrompt: "",
      tools: ["*"],
      path: "built-in:general-purpose",
      scope: "built-in",
      source: "built-in",
      enabled: true,
      readOnly: true,
    },
    {
      id: createAgentStateId({
        name: "Explore",
        scope: "built-in",
        source: "built-in",
      }),
      name: "Explore",
      description: "Read-only search agent for broad fan-out searches.",
      color: "cyan",
      defaultModel: "lite",
      model: exploreOverride || "lite",
      ...(exploreOverride ? { modelOverride: exploreOverride } : {}),
      systemPrompt: "",
      tools: ["Bash", "Glob", "Grep", "Read", "WebFetch", "WebSearch", "TodoWrite"],
      path: "built-in:Explore",
      scope: "built-in",
      source: "built-in",
      enabled: true,
      readOnly: true,
    },
  ];
}
```

Em `list()`, ler o estado antes de criar os built-ins:

```ts
const state = await readAgentStateFile(storageOptions);
const builtInAgents = createBuiltInAgents(state.builtInModelOverrides);
```

Remover a leitura duplicada de estado logo abaixo, mantendo `attachEnabledState(discoveredAgents, state)`.

- [ ] **Step 6: implementar o método de salvamento**

Adicionar no objeto do service:

```ts
async setBuiltInModelOverride(params: BuiltInSubagentModelOverrideParams): Promise<void> {
  const runUpdate = async () => {
    const state = await readAgentStateFile(storageOptions);
    const builtInModelOverrides = { ...state.builtInModelOverrides };
    const model = params.model?.trim();
    if (model) {
      builtInModelOverrides[params.agentName] = model;
    } else {
      delete builtInModelOverrides[params.agentName];
    }
    await writeAgentStateFile(
      {
        ...state,
        builtInModelOverrides,
      },
      storageOptions,
    );
  };

  const queued = writeQueue.then(runUpdate, runUpdate);
  writeQueue = queued.catch(() => {});
  await queued;
},
```

- [ ] **Step 7: rodar os testes do service**

```bash
pnpm --filter @zcode/services test -- --run test/subagentsService.test.ts
```

Esperado: passa.

- [ ] **Step 8: commitar**

```bash
git add packages/shared/src/subagents-types.ts packages/services/src/subagents/subagents.ts packages/services/src/subagents/subagentsService.ts packages/services/test/subagentsService.test.ts
git commit -m "feat(subagents): persist built-in model overrides"
```

## Phase 2: consumo pelo bootstrap e pelo runtime

### Task 4: ler os overrides de integrados na inicialização

**Arquivos:**
- Modificar `apps/zcode-cli/packages/bootstrap/src/subagents.ts`
- Modificar `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`
- Modificar `apps/zcode-cli/packages/bootstrap/src/app/runtime-config.ts`
- Modificar `apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts`
- Modificar `apps/zcode-cli/packages/core/src/runtime/types.ts`

**Interfaces de saída:**

```ts
subagents: {
  builtInModelOverrides?: BuiltInSubagentModelOverrides;
}
```

- [ ] **Step 1: escrever o teste que falha**

Adicionar em `describe("loadZCodeAgentProfiles", ...)` dentro de `apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts`:

```ts
it("loads built-in model overrides from shared subagent state", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-subagents-built-in-model-"));
  const storageRoot = join(root, "home");
  const workingDirectory = join(root, "workspace");
  try {
    await mkdir(join(storageRoot, "v2"), { recursive: true });
    await writeFile(
      join(storageRoot, "v2", "agents-state.json"),
      JSON.stringify({
        disabledAgentIds: [],
        builtInModelOverrides: {
          "general-purpose": "custom:custom-openai:gpt-5.4",
          Explore: "custom:custom-openai:glm-5.2",
        },
      }),
      "utf8",
    );

    const result = loadZCodeAgentProfiles({ storageRoot, workingDirectory });

    expect(result.builtInModelOverrides).toEqual({
      "general-purpose": "custom:custom-openai:gpt-5.4",
      Explore: "custom:custom-openai:glm-5.2",
    });
  } finally {
    await rm(root, { force: true, recursive: true });
  }
});
```

- [ ] **Step 2: confirmar que o teste falha**

```bash
pnpm --filter @zcode/bootstrap test -- --run tests/subagents.test.ts
```

Esperado: falha, porque o loader ainda não retorna `builtInModelOverrides`.

- [ ] **Step 3: estender o loader do bootstrap**

Importar o tipo compartilhado em `apps/zcode-cli/packages/bootstrap/src/subagents.ts`:

```ts
import type { BuiltInSubagentModelOverrides } from "@zcode/shared";
```

Estender o resultado:

```ts
interface LoadZCodeAgentProfilesResult {
  builtInModelOverrides: BuiltInSubagentModelOverrides;
  diagnostics: AgentProfileParseDiagnostic[];
  profiles: AgentProfile[];
}
```

Trocar o antigo `readDisabledAgentIds()` por `readAgentState()`:

```ts
const state = readAgentState(input.storageRoot);
const disabledAgentIds = state.disabledAgentIds;
```

Retornar:

```ts
return {
  builtInModelOverrides: state.builtInModelOverrides,
  diagnostics,
  profiles,
};
```

Adicionar o helper:

```ts
function readAgentState(storageRoot: string): {
  builtInModelOverrides: BuiltInSubagentModelOverrides;
  disabledAgentIds: Set<string>;
} {
  try {
    const raw = readFileSync(join(storageRoot, "v2", "agents-state.json"), "utf8");
    const parsed = JSON.parse(raw) as { builtInModelOverrides?: unknown; disabledAgentIds?: unknown };
    return {
      builtInModelOverrides: isRecord(parsed.builtInModelOverrides)
        ? normalizeBuiltInModelOverrides(parsed.builtInModelOverrides)
        : {},
      disabledAgentIds: new Set(
        Array.isArray(parsed.disabledAgentIds)
          ? parsed.disabledAgentIds.filter(
              (id): id is string => typeof id === "string" && id.trim().length > 0,
            )
          : [],
      ),
    };
  } catch {
    return { builtInModelOverrides: {}, disabledAgentIds: new Set() };
  }
}

function normalizeBuiltInModelOverrides(input: Record<string, unknown>): BuiltInSubagentModelOverrides {
  const result: BuiltInSubagentModelOverrides = {};
  const generalPurpose = scalarModel(input["general-purpose"]);
  const explore = scalarModel(input.Explore);
  if (generalPurpose) result["general-purpose"] = generalPurpose;
  if (explore) result.Explore = explore;
  return result;
}

function scalarModel(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [ ] **Step 4: passar os overrides para a config do runtime**

Manter o resultado do loader em `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`:

```ts
const zcodeSubagentProfileOutcome = loadZCodeAgentProfiles({
  logger,
  storageRoot,
  workingDirectory,
});
const zcodeSubagentProfiles = zcodeSubagentProfileOutcome.profiles;
```

Passar ao chamar `resolveAppRuntimeConfig()`:

```ts
builtInSubagentModelOverrides: zcodeSubagentProfileOutcome.builtInModelOverrides,
```

Adicionar ao tipo de input em `apps/zcode-cli/packages/bootstrap/src/app/runtime-config.ts`:

```ts
builtInSubagentModelOverrides: BuiltInSubagentModelOverrides;
```

Mesclar na config do runtime:

```ts
subagents: {
  ...options.runtimeConfig?.subagents,
  builtInModelOverrides: {
    ...input.builtInSubagentModelOverrides,
    ...options.runtimeConfig?.subagents?.builtInModelOverrides,
  },
  enabled: options.runtimeConfig?.subagents?.enabled ?? configResult.config.features.subagent,
  outputRootDir: options.runtimeConfig?.subagents?.outputRootDir ?? subagentOutputRootDir,
  profiles: [
    ...(options.runtimeConfig?.subagents?.profiles ?? []),
    ...subagentProfiles,
  ],
},
```

- [ ] **Step 5: estender os tipos de runtime do core**

Adicionar a `subagents` em `apps/zcode-cli/packages/core/src/runtime/types.ts`:

```ts
builtInModelOverrides?: Partial<Record<"general-purpose" | "Explore", string>>;
```

Não deixar o core depender de services. Se o core já puder depender de `@zcode/shared`, pode-se usar o tipo compartilhado; caso contrário, manter o tipo local do core acima.

- [ ] **Step 6: rodar os testes do bootstrap**

```bash
pnpm --filter @zcode/bootstrap test -- --run tests/subagents.test.ts
```

Esperado: passa.

### Task 5: aplicar o override de modelo no profile integrado

**Arquivos:**
- Modificar `apps/zcode-cli/packages/core/src/subagent/profile.ts`
- Modificar `apps/zcode-cli/packages/core/src/subagent/runner.ts`
- Modificar `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- Modificar `apps/zcode-cli/packages/core/tests/subagent-profile.test.ts`
- Modificar `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`

- [ ] **Step 1: escrever o teste de profile que falha**

Adicionar em `apps/zcode-cli/packages/core/tests/subagent-profile.test.ts`:

```ts
it("applies built-in model overrides when normalizing built-in profiles", () => {
  const profiles = normalizeAgentProfiles([], {
    builtInModelOverrides: {
      "general-purpose": "custom:custom-openai:gpt-5.4",
      Explore: "custom:custom-openai:glm-5.2",
    },
  });

  expect(profiles.find((profile) => profile.name === "general-purpose")?.model).toBe(
    "custom:custom-openai:gpt-5.4",
  );
  expect(profiles.find((profile) => profile.name === "Explore")?.model).toBe(
    "custom:custom-openai:glm-5.2",
  );
});
```

- [ ] **Step 2: modificar a construção do built-in profile**

Adicionar em `apps/zcode-cli/packages/core/src/subagent/profile.ts`:

```ts
export type BuiltInSubagentModelOverrides = Partial<
  Record<typeof GENERAL_PURPOSE_AGENT_TYPE | typeof EXPLORE_AGENT_TYPE, AgentProfileModel>
>;
```

Modificar `createBuiltInExploreAgentProfile()`:

```ts
export function createBuiltInExploreAgentProfile(
  options: { model?: AgentProfileModel } = {},
): AgentProfile {
  return {
    name: EXPLORE_AGENT_TYPE,
    description:
      'Read-only search agent for broad fan-out searches - when answering means sweeping many files, directories, or naming conventions and you only need the conclusion, not the file dumps. It reads excerpts rather than whole files, so it locates code; it doesn\'t review or audit it. Specify search breadth: "medium" for moderate exploration, "very thorough" for multiple locations and naming conventions.',
    color: "cyan",
    model: options.model?.trim() || "lite",
    source: "built-in",
    systemPrompt: "",
    tools: ["Bash", "Glob", "Grep", "Read", "WebFetch", "WebSearch", "TodoWrite"],
  };
}
```

Modificar `createBuiltInGeneralPurposeAgentProfile()`:

```ts
export function createBuiltInGeneralPurposeAgentProfile(
  options: { model?: AgentProfileModel } = {},
): AgentProfile {
  const model = options.model?.trim();
  return {
    name: DEFAULT_SUBAGENT_TYPE,
    description:
      "General-purpose agent for researching complex questions, searching for code, and executing multi-step tasks. When you are searching for a keyword or file and are not confident that you will find the right match in the first few tries use this agent to perform the search for you.",
    color: "blue",
    ...(model ? { model } : {}),
    source: "built-in",
    systemPrompt: buildGeneralPurposeSystemPrompt(),
    tools: ["*"],
  };
}
```

Modificar `normalizeAgentProfiles()`:

```ts
export function normalizeAgentProfiles(
  profiles: readonly AgentProfile[],
  options: { builtInModelOverrides?: BuiltInSubagentModelOverrides } = {},
): AgentProfile[] {
  const active = new Map<string, AgentProfile>();
  active.set(
    DEFAULT_SUBAGENT_TYPE,
    createBuiltInGeneralPurposeAgentProfile({
      model: options.builtInModelOverrides?.[DEFAULT_SUBAGENT_TYPE],
    }),
  );
  active.set(
    EXPLORE_AGENT_TYPE,
    createBuiltInExploreAgentProfile({
      model: options.builtInModelOverrides?.[EXPLORE_AGENT_TYPE],
    }),
  );
  for (const profile of profiles) {
    active.set(profile.name, profile);
  }
  return Array.from(active.values());
}
```

- [ ] **Step 3: passar a config do runtime para a port**

Adicionar em `ExploreSubagentPortOptions`, em `apps/zcode-cli/packages/core/src/subagent/runner.ts`:

```ts
builtInModelOverrides?: BuiltInSubagentModelOverrides;
```

Mudar a criação dos profiles para:

```ts
const profiles = normalizeAgentProfiles(options.profiles ?? [], {
  builtInModelOverrides: options.builtInModelOverrides,
});
```

Adicionar ao criar a port em `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`:

```ts
builtInModelOverrides: this.config.subagents?.builtInModelOverrides,
```

- [ ] **Step 4: escrever os testes de modelo provider-visible no runtime**

Adicionar o teste de `general-purpose` em `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`:

```ts
it("runs built-in general-purpose on configured concrete model override", async () => {
  const sessionId = createSessionId("runtime-general-purpose-built-in-model-override");
  const eventStore = createTestSessionEventStore();
  const childRequests: any[] = [];
  let parentCallCount = 0;

  const runtime = new AgentRuntime(
    sessionId,
    {
      mode: "build",
      modelRef: {
        providerId: createModelProviderId("provider-main"),
        modelId: createModelId("main-model"),
        role: ModelRole.Main,
        source: ModelRefSource.Config,
      },
      workingDirectory: "/workspace/project",
      subagents: {
        builtInModelOverrides: {
          "general-purpose": "custom:custom-openai:gpt-5.4",
        },
      },
    },
    {
      eventStore,
      modelAdapter: {
        async generateText(request: any) {
          const toolNames = (request.tools ?? []).map((tool: any) => tool.name);
          if (toolNames.includes("Agent")) {
            parentCallCount++;
            if (parentCallCount === 1) {
              return {
                finishReason: "tool-calls",
                model: request.model,
                providerMetadata: undefined,
                text: "",
                toolCalls: [
                  {
                    id: "call_general_purpose_override",
                    name: "Agent",
                    input: {
                      description: "Inspect defaults",
                      prompt: "Inspect the default agent model.",
                    },
                  },
                ],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              };
            }
            return {
              finishReason: "stop",
              model: request.model,
              providerMetadata: undefined,
              text: "done",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          }

          childRequests.push(request);
          return {
            finishReason: "stop",
            model: request.model,
            providerMetadata: undefined,
            text: "general-purpose used override.",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      } as never,
    },
  );

  await runtime.executeTurn("Use the default Agent");

  expect(childRequests[0].model).toMatchObject({
    providerId: "custom-openai",
    modelId: "gpt-5.4",
    role: ModelRole.Subagent,
  });
});
```

Adicionar também o teste de `Explore`:

```ts
it("runs built-in Explore on configured concrete model override", async () => {
  const sessionId = createSessionId("runtime-explore-built-in-model-override");
  const eventStore = createTestSessionEventStore();
  const childRequests: any[] = [];
  let parentCallCount = 0;

  const runtime = new AgentRuntime(
    sessionId,
    {
      mode: "build",
      modelRef: {
        providerId: createModelProviderId("provider-main"),
        modelId: createModelId("main-model"),
        role: ModelRole.Main,
        source: ModelRefSource.Config,
      },
      workingDirectory: "/workspace/project",
      subagents: {
        builtInModelOverrides: {
          Explore: "custom:custom-openai:glm-5.2",
        },
      },
    },
    {
      eventStore,
      modelAdapter: {
        async generateText(request: any) {
          const toolNames = (request.tools ?? []).map((tool: any) => tool.name);
          if (toolNames.includes("Agent")) {
            parentCallCount++;
            if (parentCallCount === 1) {
              return {
                finishReason: "tool-calls",
                model: request.model,
                providerMetadata: undefined,
                text: "",
                toolCalls: [
                  {
                    id: "call_explore_override",
                    name: "Agent",
                    input: {
                      description: "Inspect search",
                      prompt: "Inspect the Explore model.",
                      subagent_type: "Explore",
                    },
                  },
                ],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              };
            }
            return {
              finishReason: "stop",
              model: request.model,
              providerMetadata: undefined,
              text: "done",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          }

          childRequests.push(request);
          return {
            finishReason: "stop",
            model: request.model,
            providerMetadata: undefined,
            text: "Explore used override.",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      } as never,
    },
  );

  await runtime.executeTurn("Use Explore");

  expect(childRequests[0].model).toMatchObject({
    providerId: "custom-openai",
    modelId: "glm-5.2",
    role: ModelRole.Subagent,
  });
});
```

- [ ] **Step 5: rodar os testes direcionados do core**

```bash
pnpm --filter @zcode/core test -- --run tests/subagent-profile.test.ts tests/subagent-explore.test.ts
```

Esperado: passa.

### Task 6: corrigir o limite de effective model nos allowed tools do Explore

**Arquivos:**
- Modificar `apps/zcode-cli/packages/core/src/subagent/runner.ts`
- Modificar `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- Modificar `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`

**Objetivo:** qualquer que seja o modelo usado pela requisição child de `Explore`, é por esse modelo que os allowed tools de `Explore` devem ser decididos.

- [ ] **Step 1: escrever o teste que falha**

Adicionar um novo teste em `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`. O nome do modelo deve ser uma fixture que hoje faça o capability resolver cair no fallback direto; se o provider/model abaixo não bater com a tabela de capabilities atual, alterar apenas as strings de provider/model, sem mexer no alvo das asserções:

```ts
it("resolves Explore allowed tools from the effective overridden model", async () => {
  const sessionId = createSessionId("runtime-explore-override-tool-branch");
  const eventStore = createTestSessionEventStore();
  const childRequests: any[] = [];
  let parentCallCount = 0;

  const runtime = new AgentRuntime(
    sessionId,
    {
      mode: "build",
      modelRef: {
        providerId: createModelProviderId("provider-main"),
        modelId: createModelId("main-model"),
        role: ModelRole.Main,
        source: ModelRefSource.Config,
      },
      liteModelRef: {
        providerId: createModelProviderId("provider-lite"),
        modelId: createModelId("lite-model"),
        role: ModelRole.Lite,
        source: ModelRefSource.Config,
      },
      workingDirectory: "/workspace/project",
      subagents: {
        builtInModelOverrides: {
          Explore: "custom:direct-search-provider:direct-search-model",
        },
      },
    },
    {
      eventStore,
      modelConnectionPort: {
        resolveConnection(modelRef) {
          return {
            baseURL: "https://example.test",
            providerId: modelRef.providerId,
            providerKind: "anthropic",
          };
        },
      },
      modelAdapter: {
        async generateText(request: any) {
          const toolNames = (request.tools ?? []).map((tool: any) => tool.name);
          if (toolNames.includes("Agent")) {
            parentCallCount++;
            if (parentCallCount === 1) {
              return {
                finishReason: "tool-calls",
                model: request.model,
                providerMetadata: undefined,
                text: "",
                toolCalls: [
                  {
                    id: "call_explore_direct_branch",
                    name: "Agent",
                    input: {
                      description: "Inspect search branch",
                      prompt: "Inspect the Explore search branch.",
                      subagent_type: "Explore",
                    },
                  },
                ],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              };
            }
            return {
              finishReason: "stop",
              model: request.model,
              providerMetadata: undefined,
              text: "done",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          }

          childRequests.push(request);
          return {
            finishReason: "stop",
            model: request.model,
            providerMetadata: undefined,
            text: "Explore branch checked.",
            usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
          };
        },
      } as never,
    },
  );

  await runtime.executeTurn("Use Explore");

  expect(childRequests[0].model).toMatchObject({
    providerId: "direct-search-provider",
    modelId: "direct-search-model",
    role: ModelRole.Subagent,
  });
  expect(childRequests[0].tools.map((tool: any) => tool.name)).toEqual(
    expect.arrayContaining(["Glob", "Grep"]),
  );
});
```

- [ ] **Step 2: extrair o helper de effective model**

Adicionar em `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`:

```ts
function resolveEffectiveSubagentModelRef(input: {
  agentType: string;
  defaultModelRef: ModelRef;
  liteModelRef?: ModelRef;
  model: string | undefined;
  profileModel: string | undefined;
}): { modelRef: ModelRef; useLiteModel: boolean } {
  const concreteModelRef = resolveConcreteSubagentModelRef(
    input.model,
    input.defaultModelRef.providerId,
  );
  const useLite =
    !concreteModelRef &&
    (input.model === "lite" ||
      (input.model === undefined &&
        input.profileModel === undefined &&
        input.agentType === EXPLORE_AGENT_TYPE));
  const selected =
    concreteModelRef ?? (useLite ? (input.liteModelRef ?? input.defaultModelRef) : input.defaultModelRef);
  return {
    modelRef: {
      ...selected,
      role: ModelRole.Subagent,
    },
    useLiteModel: useLite,
  };
}
```

Mudar `resolveSubagentModelRef()` para chamá-lo:

```ts
return resolveEffectiveSubagentModelRef({
  agentType: request.agentType,
  defaultModelRef: this.defaultModelRef,
  liteModelRef: this.config.liteModelRef,
  model: request.model,
  profileModel: request.profile.model,
});
```

- [ ] **Step 3: passar o contexto de modelo do runner para a allowlist**

Mudar o tipo de `getAllowedTools` em `apps/zcode-cli/packages/core/src/subagent/runner.ts`:

```ts
getAllowedTools?: (input: {
  agentType: string;
  model?: AgentProfile["model"];
  profile: AgentProfile;
}) => readonly string[];
```

Mudar `resolveAllowedTools()` para:

```ts
function resolveAllowedTools(
  profile: AgentProfile,
  options: ExploreSubagentPortOptions,
  request?: Pick<SubagentRunRequest, "agentType" | "model">,
): readonly string[] {
  const profileTools =
    profile.name === EXPLORE_AGENT_TYPE
      ? options.getAllowedTools?.({
          agentType: request?.agentType ?? profile.name,
          model: resolveRequestedModel(request?.model, profile.model),
          profile,
        }) ?? getExploreAllowedTools(options)
      : profile.tools;
  const baseTools = [...(profileTools ?? [])];
  const disallowed = new Set(profile.disallowedTools ?? []);
  if (profile.skills && profile.skills.length > 0 && !disallowed.has("Skill")) {
    baseTools.push("Skill");
  }
  return baseTools.filter((tool) => !disallowed.has(tool));
}
```

Mudar os pontos de chamada para:

```ts
allowedTools: [...resolveAllowedTools(profile, options, request)],
```

e:

```ts
allowedTools: resolveAllowedTools(lifecycle.profile, options, request),
```

- [ ] **Step 4: usar o effective model na closure da allowlist do runtime**

Mudar `getAllowedTools` em `createDefaultSubagentPort()`:

```ts
getAllowedTools: (input) => {
  const childModel = resolveEffectiveSubagentModelRef({
    agentType: input.agentType,
    defaultModelRef: this.defaultModelRef,
    liteModelRef: this.config.liteModelRef,
    model: input.model,
    profileModel: input.profile.model,
  }).modelRef;
  return buildExploreAllowedTools({
    embeddedSearchEnabled: resolveSubagentEmbeddedSearchEnabled(this, childModel),
  });
},
```

- [ ] **Step 5: rodar os testes do runtime**

```bash
pnpm --filter @zcode/core test -- --run tests/subagent-explore.test.ts
```

Esperado: passa.

- [ ] **Step 6: commitar o runtime**

```bash
git add apps/zcode-cli/packages/bootstrap/src/subagents.ts apps/zcode-cli/packages/bootstrap/src/app/create-app.ts apps/zcode-cli/packages/bootstrap/src/app/runtime-config.ts apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts apps/zcode-cli/packages/core/src/runtime/types.ts apps/zcode-cli/packages/core/src/subagent/profile.ts apps/zcode-cli/packages/core/src/subagent/runner.ts apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts apps/zcode-cli/packages/core/tests/subagent-profile.test.ts apps/zcode-cli/packages/core/tests/subagent-explore.test.ts
git commit -m "feat(agent): apply built-in subagent model overrides"
```

## Phase 3: UI de Settings

### Task 7: adicionar o controle de modelo aos subagents integrados

**Arquivos:**
- Modificar `packages/ui/src/settings/SubagentsSection.tsx`
- Modificar `packages/ui/test/subagentsSection.test.ts`
- Modificar os arquivos de i18n existentes

**Interfaces consumidas:**
- `AgentSummary.defaultModel`
- `AgentSummary.modelOverride`
- `subagentsService.setBuiltInModelOverride(...)`

- [ ] **Step 1: reconfirmar as restrições de design da UI**

```bash
sed -n '1,220p' DESIGN.md
```

Esperado: confirmar o uso de UI de negócio compacta, semantic tokens, compatível com i18n e com light/dark.

- [ ] **Step 2: completar o mock do service**

Adicionar no mock de `subagentsService` em `packages/ui/test/subagentsSection.test.ts`:

```ts
setBuiltInModelOverride: vi.fn(),
```

- [ ] **Step 3: escrever o teste de UI que falha**

Adicionar em `packages/ui/test/subagentsSection.test.ts`:

```ts
it("shows a model control for built-in subagents without edit or delete actions", async () => {
  stateOverrides = new Map<number, unknown>([
    [
      1,
      [
        {
          id: "built-in:built-in:general-purpose",
          name: "general-purpose",
          description: "General-purpose agent",
          systemPrompt: "",
          path: "built-in:general-purpose",
          scope: "built-in",
          source: "built-in",
          enabled: true,
          readOnly: true,
          tools: ["*"],
        },
        {
          id: "built-in:built-in:Explore",
          name: "Explore",
          description: "Search broadly",
          systemPrompt: "",
          defaultModel: "lite",
          model: "custom:custom-openai:gpt-5.4",
          modelOverride: "custom:custom-openai:gpt-5.4",
          path: "built-in:Explore",
          scope: "built-in",
          source: "built-in",
          enabled: true,
          readOnly: true,
          tools: ["Read"],
        },
      ],
    ],
    [2, { userScopeAvailable: true }],
  ]);

  const html = await renderSubagentsSection();

  expect(html).toContain("general-purpose");
  expect(html).toContain("Explore");
  expect(html).toContain("gpt-5.4");
  expect(capturedModelConfigSelects.length).toBeGreaterThan(0);
  expect(html).not.toContain("settings.subagents.edit");
  expect(html).not.toContain("common.delete");
});
```

- [ ] **Step 4: adicionar os helpers de modelo do built-in**

Adicionar em `packages/ui/src/settings/SubagentsSection.tsx`:

```ts
function canConfigureBuiltInModel(agent: AgentSummary): boolean {
  return isBuiltInAgent(agent);
}

function getBuiltInDefaultModelValue(agent: AgentSummary): string {
  return agent.defaultModel?.trim() || INHERIT_MODEL_VALUE;
}

function getBuiltInModelValue(agent: AgentSummary): string {
  return agent.modelOverride?.trim() || getBuiltInDefaultModelValue(agent);
}
```

- [ ] **Step 5: adicionar o grupo de opções padrão do built-in**

Adicionar:

```ts
function createBuiltInSubagentModelSelectGroups(
  defaultLabel: string,
  defaultValue: string,
  modelGroups: readonly ModelSelectGroup[],
): ModelSelectGroup[] {
  return [
    ...modelGroups,
    {
      key: "subagent-model:built-in-default",
      label: defaultLabel,
      directItems: true,
      items: [
        {
          key: "subagent-model:built-in-default:item",
          value: defaultValue,
          name: defaultLabel,
        },
      ],
    },
  ];
}
```

- [ ] **Step 6: criar o componente de controle de modelo do built-in**

Adicionar perto de `AgentListRow`:

```tsx
function BuiltInModelControl({
  agent,
  disabled,
  modelSelectGroups,
  onChange,
  onManageModels,
}: {
  agent: AgentSummary;
  disabled: boolean;
  modelSelectGroups: readonly ModelSelectGroup[];
  onChange: (agent: AgentSummary, model: string) => void;
  onManageModels?: () => void;
}) {
  const { intl } = useZCodeIntl();
  const defaultValue = getBuiltInDefaultModelValue(agent);
  const defaultLabel = intl.formatMessage({ id: "settings.subagents.model.builtInDefault" });
  const groups = createBuiltInSubagentModelSelectGroups(defaultLabel, defaultValue, modelSelectGroups);
  const value = getBuiltInModelValue(agent);
  const label = resolveSubagentModelLabel(defaultLabel, groups, value);

  if (disabled) {
    return <AgentBadge>{label}</AgentBadge>;
  }

  return (
    <ModelConfigSelect
      modelGroups={groups}
      normalizedValue={value}
      triggerLabel={label}
      showManageModelsAction={Boolean(onManageModels)}
      lockReasonMessage=""
      isItemLocked={MODEL_ITEM_NEVER_LOCKED}
      onValueChange={(nextValue) => onChange(agent, nextValue)}
      tooltipTitle={intl.formatMessage({ id: "settings.subagents.form.model.label" })}
      manageModelsLabel={intl.formatMessage({ id: "chat.toolbar.model.manageModels" })}
      onManageModels={onManageModels}
      contentSide="bottom"
      focusSelectorOnClose={null}
      labelVisibilityClassName="inline-flex min-w-0"
      triggerClassName="h-7 w-fit max-w-full min-w-0 justify-between rounded-md border border-input-border bg-input px-2 py-1 text-sm text-foreground hover:border-input-border-hover hover:bg-input focus-visible:border-input-border-focused focus-visible:bg-input-focused"
      triggerLabelClassName="inline-flex min-w-0 truncate text-left"
    />
  );
}
```

- [ ] **Step 7: integrar ao AgentListRow**

Estender as props de `AgentListRow`:

```ts
onBuiltInModelChange: (agent: AgentSummary, model: string) => void;
onManageModels?: () => void;
```

Renderizar na área de badges:

```tsx
{canConfigureBuiltInModel(agent) ? (
  <BuiltInModelControl
    agent={agent}
    disabled={isOperating}
    modelSelectGroups={modelSelectGroups}
    onChange={onBuiltInModelChange}
    onManageModels={onManageModels}
  />
) : showModelBadge ? (
  <AgentBadge>{modelLabel}</AgentBadge>
) : null}
```

Manter a guarda `editable` de edit/delete/switch, para que o built-in não entre no formulário de edição completo.

- [ ] **Step 8: salvar o override de modelo do built-in**

Adicionar em `SubagentsSection`:

```ts
const handleBuiltInModelChange = async (agent: AgentSummary, nextValue: string) => {
  if (!isBuiltInAgent(agent)) return;
  setOperatingAgentId(agent.id);
  try {
    const defaultValue = getBuiltInDefaultModelValue(agent);
    const model = nextValue === defaultValue ? undefined : toPersistedModel(nextValue);
    await subagentsService.setBuiltInModelOverride({
      agentName: agent.name as "general-purpose" | "Explore",
      model,
    });
    await refreshAgents({ silent: true });
  } catch (error) {
    toast({
      title: intl.formatMessage({ id: "settings.subagents.model.overrideFailed" }),
      description: error instanceof Error ? error.message : String(error),
      variant: "destructive",
    });
  } finally {
    setOperatingAgentId(null);
  }
};
```

Passar `handleBuiltInModelChange` e `onManageModels` para cada `AgentListRow`.

- [ ] **Step 9: adicionar i18n**

Adicionar em inglês nos arquivos de locale existentes:

```json
{
  "settings.subagents.model.builtInDefault": "Inherit default",
  "settings.subagents.model.overrideFailed": "Failed to update subagent model"
}
```

Chinês:

```json
{
  "settings.subagents.model.builtInDefault": "继承默认",
  "settings.subagents.model.overrideFailed": "更新子智能体模型失败"
}
```

- [ ] **Step 10: rodar os testes de UI**

```bash
pnpm --filter @zcode/ui test -- --run test/subagentsSection.test.ts
```

Esperado: passa.

- [ ] **Step 11: commitar a UI**

```bash
git add packages/ui/src/settings/SubagentsSection.tsx packages/ui/test/subagentsSection.test.ts
git add packages/ui/src/i18n packages/ui/src/**/locales 2>/dev/null || true
git commit -m "feat(ui): configure built-in subagent models"
```

## Phase 4: verificação e limpeza

### Task 8: verificação de ponta a ponta

**Arquivos:**
- Não há alteração de código planejada. Se a verificação expor problemas, alterar apenas os arquivos da cadeia com falha.

- [ ] **Step 1: rodar os testes direcionados**

```bash
pnpm --filter @zcode/services test -- --run test/subagentsService.test.ts
pnpm --filter @zcode/bootstrap test -- --run tests/subagents.test.ts
pnpm --filter @zcode/core test -- --run tests/subagent-profile.test.ts tests/subagent-explore.test.ts
pnpm --filter @zcode/ui test -- --run test/subagentsSection.test.ts
```

Esperado: todos passam.

- [ ] **Step 2: conferir as asserções provider-visible**

Confirmar que existe em `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`:

```ts
expect(childRequests[0].model).toMatchObject({
  providerId: "custom-openai",
  modelId: "gpt-5.4",
  role: ModelRole.Subagent,
});
```

e também:

```ts
expect(childRequests[0].tools.map((tool: any) => tool.name)).toEqual(
  expect.arrayContaining(["Glob", "Grep"]),
);
```

- [ ] **Step 3: rodar os portões mecânicos**

```bash
pnpm typecheck
pnpm lint
```

Esperado: tudo passa.

- [ ] **Step 4: procurar descrições desatualizadas na documentação**

```bash
rg -n "hide built-in subagent model|内置.*不展示模型|built-in.*不展示模型|first version does not support.*Agent.*model" docs apps/zcode-cli/docs packages -S
```

Esperado: os documentos de design atuais não têm descrição vencida; registros históricos no changelog podem ser mantidos.

- [ ] **Step 5: commitar a limpeza de documentação, se necessário**

Se o Step 4 tiver modificado a documentação atual:

```bash
git add docs apps/zcode-cli/docs
git commit -m "docs: align subagent model override references"
```

Se nada foi modificado, não criar commit vazio.

## Phase 5: entrega final

### Task 9: estado final e limites de commit

- [ ] **Step 1: conferir o workspace**

```bash
git status --short
```

Esperado: só aparecem mudanças relacionadas a esta funcionalidade; não reverter mudanças não relacionadas que o usuário já tinha.

- [ ] **Step 2: portão final**

```bash
pnpm typecheck
pnpm lint
```

Esperado: tudo passa.

- [ ] **Step 3: modelo de descrição final**

Usar na entrega:

```markdown
Overrides de modelo para subagents integrados implementados.

- `general-purpose` pode receber um modelo concreto; sem configuração, herda o main model.
- `Explore` pode receber um modelo concreto; sem configuração, herda o main model.
- Agentes integrados continuam somente leitura, com apenas a seleção de modelo aberta.
- Os allowed tools de `Explore` já são calculados pelo effective child model.

Verificação:
- `pnpm --filter @zcode/services test -- --run test/subagentsService.test.ts`
- `pnpm --filter @zcode/bootstrap test -- --run tests/subagents.test.ts`
- `pnpm --filter @zcode/core test -- --run tests/subagent-profile.test.ts tests/subagent-explore.test.ts`
- `pnpm --filter @zcode/ui test -- --run test/subagentsSection.test.ts`
- `pnpm typecheck`
- `pnpm lint`
```

## Riscos e salvaguardas

- Não remover o `readOnly: true` dos agentes integrados.
- Não permitir que `createAgent` / `updateAgent` escrevam markdown de usuário chamado `general-purpose` ou `Explore`.
- Não deixar os allowed tools de `Explore` continuarem decidindo pelo antigo lite model.
- Não adicionar neste plano um override de built-in específico por workspace; se isso for feito no futuro, a chave de isolamento de identidade deve ser `workspaceIdentity?.trim() || workspacePath`.
- Não alterar o limite de controle remoto remote/mobile shared-host.
- Não alterar o schema provider-visible de `Agent.model`, a menos que a mesma phase atualize o spec de ferramentas, o contrato e os testes do adapter.

## Ordem sugerida de commits

1. `docs: specify built-in subagent model overrides`
2. `feat(subagents): persist built-in model overrides`
3. `feat(agent): apply built-in subagent model overrides`
4. `feat(ui): configure built-in subagent models`
5. `docs: align subagent model override references`

## Checklist de autoverificação

- [ ] O spec em docs foi escrito primeiro.
- [ ] O override de `general-purpose` está coberto.
- [ ] O override de `Explore` está coberto.
- [ ] O comportamento de modelo do custom subagent não mudou.
- [ ] O agente integrado continua somente leitura além do modelo.
- [ ] A leitura e escrita de estado do service têm teste.
- [ ] O carregamento dos overrides no bootstrap tem teste.
- [ ] O model provider-visible do child tem asserção.
- [ ] Os allowed tools de `Explore` estão alinhados ao effective model.
- [ ] A UI tem textos de i18n.
- [ ] Os testes direcionados, `pnpm typecheck` e `pnpm lint` estão no plano.