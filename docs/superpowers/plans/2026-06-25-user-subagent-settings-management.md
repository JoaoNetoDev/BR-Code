# Plano de Implementação de Gerenciamento de User Subagents

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** adicionar ao painel de Settings uma interface de gerenciamento de subagents em nível de usuário, com suporte a visualizar, criar, editar, excluir, habilitar e desabilitar user agents globais, garantindo que o Markdown gravado pela GUI seja realmente carregado e consumido pelo runtime zcode-cli atual.

**Arquitetura:** primeiro convergir o caminho de arquivo de subagent em nível de usuário, os campos de profile e o estado de habilitação, hoje implementados de forma temporária na UI/service, para a fronteira efetivamente consumida pelo runtime; só então conectar a UI de Settings. O P0 gerencia apenas agents global/user; agents de workspace/project, agents de plugin, o editor de objetos MCP estruturado e o ajuste dotransportador de dados interno da lista de agents visível ao provider não entram neste plano.

**Stack tecnológico:** TypeScript、React、Zustand、@zcode/services、@zcode/shared、zcode-cli bootstrap/core、Vitest、Tailwind semantic tokens、componentes existentes das páginas de Settings.

## Restrições Globais

- O P0 suporta apenas gerenciamento de subagents em nível de usuário/global; criação/edição em nível de workspace não é suportada.
- A raiz de runtime padrão do Markdown de agent em nível de usuário é `~/.zcode/agents`, e não `~/.zcode/cli/agents`.
- O estado enabled/disabled da GUI precisa ser consumido pelo runtime do zcode-cli na inicialização; não pode afetar apenas a lista de Settings ou o painel de menções.
- Os built-in agents `general-purpose` e `Explore` são apenas exibidos em modo somente leitura no P0, sem suporte a edição/exclusão.
- Se os agents de workspace/project precisarem continuar disponíveis para menção, eles precisam ser lidos do caminho real do runtime, `<workspace>/.zcode/agents`; o P0 de Settings não oferece entrada de edição.
- Não deixar `packages/services` depender diretamente de `@zcode/core` ou de implementações concretas do runtime.
- Tudo que envolver `packages/ui` precisa obedecer ao `DESIGN.md` da raiz: usar semantic color tokens, os primitives existentes de Button/Input/Switch/Select/Dialog, layout compacto de settings, suporte a Zai Light/Dark e responsividade.
- Os textos de UI precisam passar por i18n: `packages/ui/src/i18n/locales/zh-CN.ts` e `packages/ui/src/i18n/locales/en-US.ts` precisam ser completados em sincronia.
- Não commitar automaticamente; ao executar este plano, só fazer commit quando o usuário permitir explicitamente.

---

## Linha de Base de Fatos Atual

- A entrada de carregamento de profiles no CLI runtime é `apps/zcode-cli/packages/bootstrap/src/subagents.ts`.
- O CLI runtime atualmente lê:
  - user root: `join(storageRoot, "agents")`
  - project root: `join(workingDirectory, ".zcode", "agents")`
- `storageRoot` vem por padrão de `DefaultRuntimeConfig.storage.dir = "~/.zcode"`.
- O App service atual, em `packages/services/src/subagents/subagentsService.ts`, ainda deriva `~/.zcode/cli/agents` e `<workspace>/.zcode/cli/agents` a partir de `ZCODE_AGENT_RUNTIME.nativeConfigDir`, o que é inconsistente com o loader do runtime.
- O App service atual apenas resolve/grava `name`, `description`, `color`, `model`, `tools` e body; o profile de runtime também suporta `disallowedTools`、`skills`、`permissionMode`、`maxTurns`、`background`、`mcpServers`.
- O `agents-state.json` hoje é lido e gravado apenas pelo service; o runtime não o consome.

## Estrutura de Arquivos

### Fronteira de dados e service

- Modify: `packages/shared/src/subagents-types.ts`
  - Estender os campos de `AgentSummary` / `SubAgentConfig` necessários ao P0 de Settings.
  - Manter a compatibilidade dos campos antigos, mas passar campos como `tools` para a semântica de string array.
- Create: `packages/services/src/subagents/subagentMarkdown.ts`
  - Helper de parse/serialize de Markdown do lado do service.
  - Não depende de `@zcode/core`.
- Create: `packages/services/src/subagents/subagentStorage.ts`
  - Resolver de forma unificada o user/global agent root, o project agent root e o caminho do state file.
  - Ler o `storage.dir` de `~/.zcode/cli/config.json`, com fallback para `~/.zcode`.
- Modify: `packages/services/src/subagents/subagents.ts`
  - Estender a interface do service, com list user-only de settings e create/update/delete no escopo de usuário.
- Modify: `packages/services/src/subagents/subagentsService.ts`
  - Usar o novo storage helper, lendo as roots alinhadas ao runtime.
  - A listagem suporta built-in readonly + user editable + workspace readonly opcional.
  - create/update/delete escrevem apenas no user/global root.
  - O estado enabled é gravado no state file consumido pelo runtime.

### Consumo pelo runtime

- Modify: `apps/zcode-cli/packages/bootstrap/src/subagents.ts`
  - Ler o mesmo estado de desabilitação.
  - Filtrar os user profiles desabilitados depois de carregar o Markdown de user/project.
  - Manter o carregamento dos project profiles, que não são gerenciados pela UI do P0.
- Modify: `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`
  - Se necessário, passar o caminho do state file ou o conjunto de desabilitados para `loadZCodeAgentProfiles`.
- Modify: `apps/zcode-cli/packages/core/src/subagent/profile.ts`
  - Se for preciso expor um helper de summary dos builtins, mantê-lo interno ao core, sem deixar o service depender do core.

### Settings UI

- Create: `packages/ui/src/settings/SubagentsSection.tsx`
  - Entrada principal da seção de Settings: lista, busca, refresh, abrir diretório e entrada de novo agente.
- Create: `packages/ui/src/settings/SubagentForm.tsx`
  - Form view de criação/edição de user agent.
- Create: `packages/ui/src/settings/SubagentCard.tsx`
  - Row/card da lista: ponto de cor, nome, descrição, badges de model/tools/background/permission, switch de enabled e ações de edição/exclusão.
- Modify: `packages/ui/src/settings/settingsPageConfig.ts`
  - Adicionar a seção de sidebar `subagents`.
- Modify: `packages/ui/src/lib/settingsNavigation.ts`
  - Adicionar `SettingsSectionId = "subagents"`.
- Modify: `packages/ui/src/SettingsPage.tsx`
  - Renderizar `<SubagentsSection />`.
- Modify: `packages/ui/src/store/subagentsStore.ts`
  - Se a store existente bastar, estendê-la; caso contrário, manter estado local do hook, evitando colocar o rascunho do form no store global.
- Modify: `packages/ui/src/hooks/useSubagents.ts`
  - Suportar a passagem de um list mode no cenário de settings.
- Modify: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modify: `packages/ui/src/i18n/locales/en-US.ts`
- Modify: `packages/shared/src/test-ids.ts`
  - Adicionar test ids para a página de subagents nas Settings e para as interações principais.

### Testes

- Create or modify: `packages/services/test/subagentsService.test.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/subagent-profile.test.ts`
- Create: `packages/ui/test/subagentsSettingsSection.test.tsx`
- Modify: `packages/ui/test/settingsPageConfig.test.ts`
- Modify: `packages/ui/test/settingsNavigation.test.ts`
- Modify: `packages/ui/test/subagentsMentionProvider.test.ts`

---

## Interfaces

### Tipos compartilhados

```ts
export type AgentScope = "built-in" | "workspace" | "user";

export type AgentSource = "built-in" | "user" | "plugin";

export type AgentProfileModel = "inherit" | "main" | "lite";

export type AgentPermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan";

export type AgentColor =
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "purple"
  | "orange"
  | "pink"
  | "cyan";

export interface AgentSummary {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  color?: AgentColor;
  model?: AgentProfileModel;
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  permissionMode?: AgentPermissionMode;
  maxTurns?: number;
  background?: boolean;
  mcpServers?: unknown[];
  path: string;
  scope: AgentScope;
  source: AgentSource;
  enabled: boolean;
  readOnly: boolean;
  projectPath?: string;
}

export interface SubAgentConfig {
  name: string;
  description: string;
  systemPrompt: string;
  color?: AgentColor;
  model?: AgentProfileModel;
  tools?: string[];
  disallowedTools?: string[];
  skills?: string[];
  permissionMode?: AgentPermissionMode;
  maxTurns?: number;
  background?: boolean;
  mcpServers?: unknown[];
}

export type SubagentsListMode = "allRuntimeScopes" | "settingsUserOnly";
```

### Parâmetros de listagem do service

```ts
interface SubagentsListParams {
  workspacePath: string;
  workspaceIdentity?: string;
  provider?: ZCodeProvider;
  mode?: SubagentsListMode;
}
```

Semântica:

- `allRuntimeScopes`: é usado pelo mention provider e por futuras superfícies cientes do runtime. Inclui profiles built-in, user e workspace em modo somente leitura.
- `settingsUserOnly`: é usado pelo P0 de Settings. Inclui apenas built-in readonly e user editable. Os workspace profiles são ocultados de forma intencional.

### State id estável

```ts
function createAgentStateId(input: {
  source: AgentSource;
  scope: AgentScope;
  name: string;
}): string {
  return `${input.source}:${input.scope}:${input.name.trim().toLowerCase()}`;
}
```

O runtime do P0 consome os state ids de user desabilitados. Os ids de built-in são estáveis para uso futuro, mas não são alternados na UI do P0.

---

### Tarefa 1: Estender os tipos de subagent compartilhados

**Arquivos:**

- Modify: `packages/shared/src/subagents-types.ts`

**Interfaces:**

- Produces: `AgentProfileModel`、`AgentPermissionMode`、`AgentColor`、`SubagentsListMode` e o `AgentSummary` e `SubAgentConfig` estendidos.
- Consumes: os `AgentSummary` e `SubAgentConfig` existentes nos service/store/hook.

- [ ] **Passo 1: Modificar os tipos compartilhados**

Ajustar `packages/shared/src/subagents-types.ts` para suportar o conjunto completo de campos de profile do P0. Manter `workspace` em `AgentScope`, porque o mention provider ainda pode precisar exibir os project profiles do runtime; o P0 de Settings passa apenas `settingsUserOnly`.

Forma central:

```ts
export type AgentScope = "built-in" | "workspace" | "user";
export type AgentSource = "built-in" | "user" | "plugin";
export type AgentProfileModel = "inherit" | "main" | "lite";
export type AgentPermissionMode =
  | "acceptEdits"
  | "auto"
  | "bypassPermissions"
  | "default"
  | "dontAsk"
  | "plan";
export type AgentColor =
  | "red"
  | "blue"
  | "green"
  | "yellow"
  | "purple"
  | "orange"
  | "pink"
  | "cyan";
export type SubagentsListMode = "allRuntimeScopes" | "settingsUserOnly";
```

- [ ] **Passo 2: Corrigir os pontos de chamada do TypeScript**

Atualizar o conjunto mínimo de erros de compilação:

- `packages/ui/src/mentions/providers/subagentsMentionProvider.ts`
- `packages/ui/src/store/subagentsStore.ts`
- `packages/services/src/subagents/subagentsService.ts`

Para as leituras antigas de `tools?: string`, trocar por:

```ts
const toolSummary = agent.tools?.length ? agent.tools.join(", ") : "";
```

- [ ] **Passo 3: Executar a verificação de tipos**

Run:

```bash
pnpm --filter @zcode/shared lint
pnpm --filter @zcode/ui test -- --run test/subagentsMentionProvider.test.ts
```

Expected:

- `@zcode/shared lint` PASS.
- O teste do mention provider passa após atualizar os campos de fixture, caso haja erros de compilação.

---

### Tarefa 2: Adicionar o helper de Markdown de profile no lado do service

**Arquivos:**

- Create: `packages/services/src/subagents/subagentMarkdown.ts`
- Test: `packages/services/test/subagentsService.test.ts`

**Interfaces:**

- Consumes: `SubAgentConfig` de `@zcode/shared`。
- Produces:
  - `parseSubagentMarkdown(content: string, path: string, scope: AgentScope): AgentSummary | SubagentMarkdownDiagnostic`
  - `serializeSubagentMarkdown(config: SubAgentConfig): string`

- [ ] **Passo 1: Escrever o teste failing de parser/serializer**

Adicionar em `packages/services/test/subagentsService.test.ts` testes no nível de helper, cobrindo campos de array e fidelidade do body:

```ts
it("serializes user subagent markdown with runtime profile fields", () => {
  const markdown = serializeSubagentMarkdown({
    name: "code-reviewer",
    description: "提交前审查代码",
    systemPrompt: "你是严格的代码审查员。",
    color: "cyan",
    model: "lite",
    tools: ["Read", "Grep", "Bash(git diff *)"],
    disallowedTools: ["Write"],
    skills: ["code-review"],
    permissionMode: "acceptEdits",
    maxTurns: 7,
    background: true,
  });

  expect(markdown).toContain('name: "code-reviewer"');
  expect(markdown).toContain("tools:");
  expect(markdown).toContain("- Read");
  expect(markdown).toContain("- Bash(git diff *)");
  expect(markdown).toContain("permissionMode: acceptEdits");
  expect(markdown).toContain("maxTurns: 7");
  expect(markdown).toContain("background: true");
  expect(markdown).toContain("你是严格的代码审查员。");
});
```

- [ ] **Passo 2: Implementar o serializer**

`serializeSubagentMarkdown` usa estilo YAML frontmatter, mas não introduz uma dependência de service para core. Recomenda-se reutilizar o package `yaml`, evitando escapes escritos à mão que deixem casos de fora.

```ts
import YAML from "yaml";
import type { SubAgentConfig } from "@zcode/shared";

export function serializeSubagentMarkdown(config: SubAgentConfig): string {
  const frontmatter: Record<string, unknown> = {
    name: config.name.trim(),
    description: config.description.trim(),
  };
  if (config.color) frontmatter.color = config.color;
  if (config.model && config.model !== "inherit") frontmatter.model = config.model;
  if (config.tools?.length) frontmatter.tools = config.tools;
  if (config.disallowedTools?.length) frontmatter.disallowedTools = config.disallowedTools;
  if (config.skills?.length) frontmatter.skills = config.skills;
  if (config.permissionMode) frontmatter.permissionMode = config.permissionMode;
  if (config.maxTurns !== undefined) frontmatter.maxTurns = config.maxTurns;
  if (config.background !== undefined) frontmatter.background = config.background;
  if (config.mcpServers?.length) frontmatter.mcpServers = config.mcpServers;

  return `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n\n${config.systemPrompt.trim()}\n`;
}
```

- [ ] **Passo 3: Implementar o parser**

O parser precisa aceitar os formatos que o loose parser atual do runtime aceita. O P0 não suporta o editor de objetos MCP aninhados, mas o parser pode preservar o array `mcpServers`.

```ts
export interface SubagentMarkdownDiagnostic {
  code: "agent_missing_frontmatter" | "agent_missing_required_frontmatter" | "agent_invalid_frontmatter";
  message: string;
  path: string;
}
```

Não lançar exceção em caso de falha de parsing; devolver o diagnostic para que a página de Settings consiga exibi-lo.

- [ ] **Passo 4: Executar os testes do service**

Run:

```bash
pnpm --filter @zcode/services test -- --run test/subagentsService.test.ts
```

Expected:

- Os novos testes de parser/serializer passam.
- Caso `@zcode/services` ainda não tenha script de teste, usar o comando da raiz:

```bash
pnpm test -- --run packages/services/test/subagentsService.test.ts
```

---

### Tarefa 3: Unificar o user root do service com o root do runtime

**Arquivos:**

- Create: `packages/services/src/subagents/subagentStorage.ts`
- Modify: `packages/services/src/subagents/subagentsService.ts`
- Test: `packages/services/test/subagentsService.test.ts`

**Interfaces:**

- Produces:
  - `resolveUserSubagentRoot(): Promise<string>`
  - `resolveWorkspaceSubagentRoot(workspacePath: string): string`
  - `resolveSubagentStateFile(): Promise<string>`
- Consumes: o `storage.dir` de `~/.zcode/cli/config.json`, com fallback `~/.zcode`.

- [ ] **Passo 1: Escrever o teste failing de resolução de root**

Usar um HOME temporário e criar `~/.zcode/cli/config.json`:

```ts
it("uses runtime storage.dir agents root for user subagents", async () => {
  const home = await mkdtemp(join(tmpdir(), "zcode-subagents-home-"));
  const storageRoot = join(home, "custom-storage");
  await mkdir(join(home, ".zcode", "cli"), { recursive: true });
  await writeFile(
    join(home, ".zcode", "cli", "config.json"),
    JSON.stringify({ storage: { dir: storageRoot } }),
    "utf8",
  );

  const root = await resolveUserSubagentRoot({ homeDir: home });

  expect(root).toBe(join(storageRoot, "agents"));
});
```

- [ ] **Passo 2: Implementar o storage helper**

`subagentStorage.ts` não deriva o agent root diretamente de `ZCODE_AGENT_RUNTIME.nativeConfigDir`. Ele usa o native config path apenas para ler o arquivo de config:

```ts
const DEFAULT_STORAGE_DIR = "~/.zcode";
const ZCODE_CONFIG_PATH = join(resolveUserHomeDir(), ".zcode", "cli", "config.json");

export async function resolveUserSubagentRoot(): Promise<string> {
  const storageDir = await readStorageDirFromCliConfig();
  return join(resolveConfigPath(storageDir), "agents");
}

export function resolveWorkspaceSubagentRoot(workspacePath: string): string {
  return join(workspacePath, ".zcode", "agents");
}

export async function resolveSubagentStateFile(): Promise<string> {
  const storageDir = await readStorageDirFromCliConfig();
  return join(resolveConfigPath(storageDir), "v2", "agents-state.json");
}
```

- [ ] **Passo 3: Atualizar list/create/update/delete do service para usar a nova root**

`createAgent` / `updateAgent` escrevem apenas em `resolveUserSubagentRoot()`. O `list` pode ler a workspace root por padrão, mas o P0 de Settings oculta o workspace via `mode: "settingsUserOnly"`.

- [ ] **Passo 4: Manter leitura de compatibilidade para migração**

Para não fazer os usuários existentes de `~/.zcode/cli/agents` desaparecerem de imediato, o P0 pode ler o legacy root, mas parar de gravar nele. Implementado como:

```ts
const roots = [
  { scope: "user" as const, rootPath: await resolveUserSubagentRoot(), writable: true },
  { scope: "user" as const, rootPath: resolveLegacyUserSubagentRoot(), writable: false },
];
```

Em caso de mesmo nome, a runtime root tem prioridade e a legacy root fica sombreada e não editável. Se o produto decidir não migrar o caminho antigo, esta etapa pode ser removida; mas isso precisa ficar explícito na nota final.

- [ ] **Passo 5: Executar os testes do service**

Run:

```bash
pnpm test -- --run packages/services/test/subagentsService.test.ts
```

Expected:

- O teste de resolução de root passa.
- create/update/delete gravam em `${storage.dir}/agents/<name>.md`.

---

### Tarefa 4: O runtime consome user agents desabilitados

**Arquivos:**

- Modify: `apps/zcode-cli/packages/bootstrap/src/subagents.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`
- Test: `apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts`

**Interfaces:**

- Consumes: `${storageRoot}/v2/agents-state.json`
- Produces: `loadZCodeAgentProfiles(...)` retornando os user profiles desabilitados já filtrados.

- [ ] **Passo 1: Escrever o teste failing de desabilitado no runtime**

Adicionar em `apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts`:

```ts
it("does not load disabled user agent profiles into runtime config", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-subagents-disabled-"));
  const storageRoot = join(root, "home");
  const workingDirectory = join(root, "workspace");
  await mkdir(join(storageRoot, "agents"), { recursive: true });
  await mkdir(join(storageRoot, "v2"), { recursive: true });
  await writeFile(
    join(storageRoot, "agents", "reviewer.md"),
    `---
name: reviewer
description: review code
---
review prompt`,
    "utf8",
  );
  await writeFile(
    join(storageRoot, "v2", "agents-state.json"),
    JSON.stringify({ disabledAgentIds: ["user:user:reviewer"] }),
    "utf8",
  );

  const result = loadZCodeAgentProfiles({ storageRoot, workingDirectory });

  expect(result.profiles.map((profile) => profile.name)).not.toContain("reviewer");
});
```

- [ ] **Passo 2: Implementar o leitor de state**

Adicionar um helper puro local no lado do bootstrap, evitando depender do app service:

```ts
function readDisabledAgentIds(storageRoot: string): Set<string> {
  const path = join(storageRoot, "v2", "agents-state.json");
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { disabledAgentIds?: unknown };
    return new Set(
      Array.isArray(parsed.disabledAgentIds)
        ? parsed.disabledAgentIds.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}
```

- [ ] **Passo 3: Filtrar os user profiles**

Após carregar o profile, calcular:

```ts
const stateId = `${result.profile.source}:${result.profile.source === "project" ? "workspace" : "user"}:${result.profile.name.trim().toLowerCase()}`;
if (result.profile.source === "user" && disabledAgentIds.has(stateId)) {
  continue;
}
```

No P0, apenas user disabled afeta o runtime. Project disabled fica reservado para o P1.

- [ ] **Passo 4: Confirmar que a lista visível ao provider não inclui os desabilitados**

Adicionar ou atualizar em `apps/zcode-cli/packages/core/tests/subagent-profile.test.ts`: ao passar profiles sem os user desabilitados, `formatAgentProfilesForPrompt` não deve exibir aquele agent.

Run:

```bash
pnpm --filter @zcode/bootstrap test -- --run tests/subagents.test.ts
pnpm --filter @zcode/core test -- --run tests/subagent-profile.test.ts
```

Expected:

- O user profile desabilitado não entra nos runtime profiles.
- O formatter de prompt do provider não exibe o profile desabilitado.

---

### Tarefa 5: Aprimorar o comportamento do SubagentsService

**Arquivos:**

- Modify: `packages/services/src/subagents/subagents.ts`
- Modify: `packages/services/src/subagents/subagentsService.ts`
- Test: `packages/services/test/subagentsService.test.ts`

**Interfaces:**

- `list({ mode: "settingsUserOnly" })` retorna built-in readonly + user editable.
- `list({ mode: "allRuntimeScopes" })` retorna built-in + user + workspace readonly.
- `createAgent` / `updateAgent` / `deleteAgent` permitem apenas o escopo de usuário.

- [ ] **Passo 1: Escrever os testes de list mode**

```ts
it("settings user-only list hides workspace agents", async () => {
  const result = await service.list({
    workspacePath,
    provider: "glm",
    mode: "settingsUserOnly",
  });

  expect(result.agents.every((agent) => agent.scope !== "workspace")).toBe(true);
  expect(result.agents.some((agent) => agent.source === "built-in")).toBe(true);
  expect(result.agents.some((agent) => agent.scope === "user")).toBe(true);
});
```

- [ ] **Passo 2: Adicionar summaries de built-in em somente leitura**

O service não pode depender de `@zcode/core`. Definir dentro do service as constantes de summary com os mesmos nomes dos built-ins do runtime:

```ts
const BUILT_IN_AGENT_SUMMARIES: AgentSummary[] = [
  {
    id: "built-in:built-in:general-purpose",
    name: "general-purpose",
    description: "General-purpose agent for researching complex questions...",
    systemPrompt: "",
    tools: ["*"],
    path: "built-in:general-purpose",
    scope: "built-in",
    source: "built-in",
    enabled: true,
    readOnly: true,
  },
  {
    id: "built-in:built-in:Explore",
    name: "Explore",
    description: "Read-only search agent for broad fan-out searches...",
    model: "lite",
    tools: ["Bash", "Glob", "Grep", "Read", "WebFetch", "WebSearch", "TodoWrite"],
    systemPrompt: "",
    path: "built-in:Explore",
    scope: "built-in",
    source: "built-in",
    enabled: true,
    readOnly: true,
  },
];
```

Se a duplicação ficar desconfortável mais adiante, mover os metadados de built-in para um package puro compartilhado. Não fazer o services importar o runtime core nesta tarefa.

- [ ] **Passo 3: Validação de create/update/delete**

Validação do P0:

```ts
const NAME_REGEX = /^[a-zA-Z0-9-]+$/;
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 50;
```

Validar:

- name com comprimento de 3..50
- apenas letras/números/hífen
- description não vazia
- systemPrompt não vazio
- model precisa ser `inherit/main/lite` quando presente
- maxTurns precisa ser inteiro positivo quando presente

- [ ] **Passo 4: O estado enabled grava os ids consumidos pelo runtime**

`setEnabled({ agentId, enabled })` deve armazenar ids como `user:user:code-reviewer`. Por compatibilidade com o passado, ao ler um `user:code-reviewer` antigo, normalizá-lo uma vez para o novo id na gravação.

- [ ] **Passo 5: Executar os testes**

Run:

```bash
pnpm test -- --run packages/services/test/subagentsService.test.ts
pnpm --filter @zcode/ui test -- --run test/subagentsMentionProvider.test.ts
```

Expected:

- A lista de Settings oculta os agents de workspace.
- O mention provider ainda recebe os agents de workspace quando o service é chamado com o modo default/all.
- Os ids de estado enabled correspondem ao teste de runtime da Tarefa 4.

---

### Tarefa 6: Atualizar o hook/store de subagents para suportar o modo de Settings

**Arquivos:**

- Modify: `packages/ui/src/hooks/useSubagents.ts`
- Modify: `packages/ui/src/store/subagentsStore.ts`
- Test: `packages/ui/test/subagentsMentionProvider.test.ts`

**Interfaces:**

- Produces: `useSubagents(workspacePath, provider, { mode })`
- Consumes: `ISubagentsService.list({ mode })`

- [ ] **Passo 1: Estender a assinatura do hook**

```ts
export function useSubagents(
  workspacePath: string | null,
  provider: ZCodeProvider,
  options: { mode?: SubagentsListMode } = {},
) {
  // existing logic
}
```

- [ ] **Passo 2: Adicionar o mode à chave de cache do store**

A chave atual é workspace + provider. Mudar para:

```ts
function getAgentLoadKey(
  workspacePath: string,
  provider: ZCodeProvider,
  mode: SubagentsListMode,
  workspaceIdentity?: string,
): string {
  return `${workspaceIdentity?.trim() || workspacePath}::${provider}::${mode}`;
}
```

- [ ] **Passo 3: O mention provider permanece em allRuntimeScopes**

`useSubagentsMentionProvider` não passa mode ou passa explicitamente `allRuntimeScopes`, garantindo que os workspace readonly profiles não sejam afetados pela lógica de ocultação do P0 de Settings.

- [ ] **Passo 4: Executar os testes**

Run:

```bash
pnpm --filter @zcode/ui test -- --run test/subagentsMentionProvider.test.ts
```

Expected:

- Os testes de menção existentes passam.
- Acrescentar um teste confirmando que agents desabilitados continuam fora dos mention items.

---

### Tarefa 7: Adicionar a seção de sidebar em Settings

**Arquivos:**

- Modify: `packages/ui/src/settings/settingsPageConfig.ts`
- Modify: `packages/ui/src/lib/settingsNavigation.ts`
- Modify: `packages/ui/src/SettingsPage.tsx`
- Modify: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modify: `packages/ui/src/i18n/locales/en-US.ts`
- Modify: `packages/shared/src/test-ids.ts`
- Test: `packages/ui/test/settingsPageConfig.test.ts`
- Test: `packages/ui/test/settingsNavigation.test.ts`

**Interfaces:**

- Produces: settings section id `"subagents"`。
- Consumes: existing Settings section rendering branch。

- [ ] **Passo 1: Escrever os testes failing de config**

Atualizar `settingsPageConfig.test.ts`:

```ts
expect(SETTINGS_SECTIONS.map((section) => section.id)).toContain("subagents");
```

Atualizar `settingsNavigation.test.ts`:

```ts
expect(navigation.resolveSettingsSection("subagents", "general")).toBe("subagents");
```

- [ ] **Passo 2: Atualizar SettingsSectionId**

`packages/ui/src/lib/settingsNavigation.ts`:

```ts
export type SettingsSectionId =
  | "general"
  | "codePreview"
  | "migration"
  | "indexing"
  | "modelProvider"
  | "mcp"
  | "plugins"
  | "usage"
  | "skills"
  | "commands"
  | "subagents"
  | "hooks";
```

Atualizar `isSettingsSectionId` em sincronia.

- [ ] **Passo 3: Adicionar a config da sidebar**

`packages/ui/src/settings/settingsPageConfig.ts` importa um ícone lucide, recomendando `Bot` ou `UsersRound`:

```ts
{
  id: "subagents",
  icon: Bot,
  titleId: "settings.subagents.title",
}
```

A posição recomendada é depois de `skills` e antes de `mcp`.

- [ ] **Passo 4: Renderizar a seção placeholder no SettingsPage**

Conectar primeiro `<SubagentsSection />`; o componente é implementado na Tarefa 8.

```tsx
) : activeSection === "subagents" ? (
  <SubagentsSection workspacePath={activeWorkspacePath} workspaceIdentity={activeWorkspaceIdentity} />
) : activeSection === "skills" ? (
```

- [ ] **Passo 5: i18n**

`zh-CN.ts`:

```ts
"settings.subagents.title": "子代理",
"settings.subagents.description": "管理全局用户子代理。子代理由 Markdown 文件定义，运行时会在 Agent 工具中使用这些定义。",
```

`en-US.ts`:

```ts
"settings.subagents.title": "Subagents",
"settings.subagents.description": "Manage global user subagents. Subagents are defined by Markdown files and are consumed by the Agent tool at runtime.",
```

- [ ] **Passo 6: Executar os testes**

Run:

```bash
pnpm --filter @zcode/ui test -- --run test/settingsPageConfig.test.ts test/settingsNavigation.test.ts
```

Expected: PASS。

---

### Tarefa 8: Implementar a página de lista SubagentsSection

**Arquivos:**

- Create: `packages/ui/src/settings/SubagentsSection.tsx`
- Create: `packages/ui/src/settings/SubagentCard.tsx`
- Modify: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modify: `packages/ui/src/i18n/locales/en-US.ts`
- Test: `packages/ui/test/subagentsSettingsSection.test.tsx`

**Interfaces:**

- Consumes: `useSubagents(activeWorkspacePath, ZCODE_AGENT_PROVIDER, { mode: "settingsUserOnly" })`
- Produces: pontos de entrada de busca/filtro/lista/toggle/edição/exclusão。

- [ ] **Passo 1: Escrever o teste failing de render**

Usar o padrão de teste de UI existente. Fazer mock de `useServices().subagentsService.list` para retornar built-in + user:

```tsx
it("renders built-in and user subagents in settings user-only mode", async () => {
  render(<SubagentsSection workspacePath="/repo" />);

  expect(await screen.findByText("general-purpose")).toBeInTheDocument();
  expect(await screen.findByText("code-reviewer")).toBeInTheDocument();
  expect(screen.queryByText("workspace-reviewer")).not.toBeInTheDocument();
});
```

- [ ] **Passo 2: Implementar o header da seção**

Forma da UI:

- texto de descrição à esquerda
- botões de ícone à direita: novo, abrir pasta, refresh
- input de busca compacto abaixo

Usar:

- `Button` variant `ghost` size `icon-sm`
- `Input` size `lg`
- `ControlHintTooltip`
- `Plus`, `FolderOpen`, `RefreshCw`

- [ ] **Passo 3: Implementar a lista agrupada**

Ordem dos grupos:

1. Built-in
2. User agents

Props de `SubagentCard`:

```ts
interface SubagentCardProps {
  agent: AgentSummary;
  operating: boolean;
  onToggle: (agent: AgentSummary, enabled: boolean) => void;
  onEdit: (agent: AgentSummary) => void;
  onDelete: (agent: AgentSummary) => void;
}
```

Regras:

- `agent.readOnly === true`: ocultar editar/excluir, desabilitar o switch ou ocultá-lo nos built-ins.
- User agent: exibir switch, ícone de edição e ícone de exclusão.
- Exibir badges de model/tools/background/permissionMode quando presentes.
- Usar a amostra de cor apenas a partir do enum do runtime, com fallback para um ponto neutro.

- [ ] **Passo 4: Abrir a pasta de user agents**

Usar o `subagentsService.getPrimaryUserAgentsDirectory({ provider: ZCODE_AGENT_PROVIDER })` existente e então `platform.openInFileManager(path)`. O toast de falha usa o `appHeader.openInFileManagerFailed` existente。

- [ ] **Passo 5: Alternar enabled**

Chamar `setEnabled(agent.id, enabled)` no store/hook. Em caso de falha, exibir toast e manter a lista atualizada a partir do service.

- [ ] **Passo 6: Executar os testes de UI**

Run:

```bash
pnpm --filter @zcode/ui test -- --run test/subagentsSettingsSection.test.tsx
```

Expected:

- Os built-ins são renderizados como somente leitura.
- O user agent renderiza ações editáveis.
- A fixture de workspace fica oculta no modo de settings.
- O toggle chama `subagentsService.setEnabled` com o id esperado。

---

### Tarefa 9: Implementar a página de criação/edição SubagentForm

**Arquivos:**

- Create: `packages/ui/src/settings/SubagentForm.tsx`
- Modify: `packages/ui/src/settings/SubagentsSection.tsx`
- Modify: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modify: `packages/ui/src/i18n/locales/en-US.ts`
- Test: `packages/ui/test/subagentsSettingsSection.test.tsx`

**Interfaces:**

- Consumes: `SubAgentConfig`
- Produces: `SubAgentConfig` validado para `createAgent` / `updateAgent`

- [ ] **Passo 1: Escrever o teste failing do form de criação**

```tsx
it("creates a user subagent from the settings form", async () => {
  render(<SubagentsSection workspacePath="/repo" />);

  await user.click(screen.getByLabelText("新建子代理"));
  await user.type(screen.getByLabelText("名称"), "code-reviewer");
  await user.type(screen.getByLabelText("描述"), "提交前审查代码");
  await user.type(screen.getByLabelText("系统提示词"), "你是严格的代码审查员。");
  await user.click(screen.getByRole("button", { name: "保存" }));

  expect(subagentsService.createAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      config: expect.objectContaining({
        name: "code-reviewer",
        description: "提交前审查代码",
        systemPrompt: "你是严格的代码审查员。",
      }),
    }),
  );
});
```

- [ ] **Passo 2: Campos do formulário**

Campos do P0:

- name
- description
- model select: inherit/main/lite
- amostras de cor: red/blue/green/yellow/purple/orange/pink/cyan
- editor de tools:
  - toggles rápidos para ferramentas comuns: Read, Grep, Glob, Bash, Edit, Write, WebFetch, WebSearch, TodoWrite
  - campo de texto avançado por vírgula/nova linha preservando padrões customizados como `Bash(git diff *)`
- switch de background
- select de permissionMode
- input numérico de maxTurns
- textarea de systemPrompt

Campos avançados recolhidos no P0:

- campo de texto de disallowedTools
- campo de texto de skills
- campo de texto de mcpServers apenas como string separada por vírgula/nova linha

- [ ] **Passo 3: Validação**

Validação:

```ts
const NAME_REGEX = /^[a-zA-Z0-9-]+$/;
const MIN_NAME_LENGTH = 3;
const MAX_NAME_LENGTH = 50;
```

Erros:

- name obrigatório e com comprimento de 3..50
- name apenas com letras/números/hífen
- description obrigatória
- systemPrompt obrigatório
- maxTurns inteiro positivo, se definido

- [ ] **Passo 4: Comportamento de gravação**

Criação:

```ts
await createAgent(config, ZCODE_AGENT_PROVIDER, subagentsService);
```

Edição:

```ts
await updateAgent(agent.id, config, agent.path, ZCODE_AGENT_PROVIDER, subagentsService);
```

Após o sucesso:

- fechar a form view
- atualizar a lista
- exibir o toast de salvo

- [ ] **Passo 5: Layout responsivo**

Seguir `DESIGN.md`:

- container do form: `rounded-xl border border-border bg-card p-4`
- usar `text-sm`
- `grid gap-3 md:grid-cols-2` para os campos do topo
- altura mínima do `Textarea` para o prompt, sem valores de cor brutos
- sem cards aninhados

- [ ] **Passo 6: Executar os testes**

Run:

```bash
pnpm --filter @zcode/ui test -- --run test/subagentsSettingsSection.test.tsx
```

Expected:

- O form de criação chama o service com arrays normalizados.
- O form de edição pré-preenche os campos.
- Os erros de validação são localizados.

---

### Tarefa 10: Exclusão e estados de erro

**Arquivos:**

- Modify: `packages/ui/src/settings/SubagentsSection.tsx`
- Modify: `packages/ui/src/settings/SubagentCard.tsx`
- Modify: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modify: `packages/ui/src/i18n/locales/en-US.ts`
- Test: `packages/ui/test/subagentsSettingsSection.test.tsx`

**Interfaces:**

- Consumes: existing `useConfirmDialog` pattern from `CommandsSection`。
- Produces: delete confirm flow and diagnostics/error display。

- [ ] **Passo 1: Escrever o teste de confirmação de exclusão**

```tsx
it("confirms before deleting a user subagent", async () => {
  render(<SubagentsSection workspacePath="/repo" />);

  await user.click(await screen.findByLabelText("删除子代理"));
  await user.click(screen.getByRole("button", { name: "删除" }));

  expect(subagentsService.deleteAgent).toHaveBeenCalledWith(
    expect.objectContaining({
      agentId: "user:user:code-reviewer",
      filePath: expect.stringContaining("code-reviewer.md"),
    }),
  );
});
```

- [ ] **Passo 2: Implementar a confirmação**

Usar:

```ts
const confirmed = await confirmDialog({
  title: intl.formatMessage({ id: "settings.subagents.delete.title" }),
  description: intl.formatMessage(
    { id: "settings.subagents.delete.description" },
    { name: agent.name },
  ),
  confirmLabel: intl.formatMessage({ id: "common.delete" }),
});
```

- [ ] **Passo 3: Exibição de diagnostics**

Se o service retornar diagnostics para Markdown inválido, exibir um bloco de aviso expansível perto do topo:

- resumo com a contagem
- label do code
- path em fonte mono

Não bloquear a renderização dos agents válidos.

- [ ] **Passo 4: Executar os testes**

Run:

```bash
pnpm --filter @zcode/ui test -- --run test/subagentsSettingsSection.test.tsx
```

Expected:

- A exclusão exige confirmação.
- O botão de excluir não é renderizado nos built-ins.
- O bloco de diagnostics renderiza sem ocultar os user agents válidos。

---

### Tarefa 11: Cobertura de regressão visível ao provider / de runtime

**Arquivos:**

- Modify: `apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/subagent-profile.test.ts`
- Optional Modify: 历史差异审计文档（已删除）

**Interfaces:**

- Consumes: service-written markdown shape from Task 2.
- Produces: confidence that GUI-created profiles are runtime-loadable and disabled profiles are provider-invisible.

- [ ] **Passo 1: Adicionar um teste de compatibilidade de Markdown da GUI no bootstrap**

Usar uma fixture de Markdown gerada pelo formato do serializer do service:

```ts
await writeFile(
  join(storageRoot, "agents", "code-reviewer.md"),
  `---
name: code-reviewer
description: 提交前审查代码
model: lite
tools:
  - Read
  - Grep
  - Bash(git diff *)
disallowedTools:
  - Write
skills:
  - code-review
permissionMode: acceptEdits
maxTurns: 7
background: true
color: cyan
---
你是严格的代码审查员。`,
  "utf8",
);
```

Esperar:

```ts
expect(result.profiles[0]).toMatchObject({
  name: "code-reviewer",
  model: "lite",
  tools: ["Read", "Grep", "Bash"],
  disallowedTools: ["Write"],
  skills: ["code-review"],
  permissionMode: "acceptEdits",
  maxTurns: 7,
  background: true,
  color: "cyan",
});
```

- [ ] **Passo 2: Adicionar o teste da lista visível ao provider**

`formatAgentProfilesForPrompt` com os profiles carregados deve incluir o user agent habilitado e omitir o desabilitado.

- [ ] **Passo 3: Atualização opcional de documentação**

Se a implementação mudar os fatos atuais de diff, atualizar 历史差异审计文档（已删除）:

- O Service/UI agora grava no user root alinhado ao runtime.
- A GUI do P0 exclui de propósito a edição de workspace.
- O estado enabled agora afeta o carregamento de profiles do runtime.

- [ ] **Passo 4: Executar os testes**

Run:

```bash
pnpm --filter @zcode/bootstrap test -- --run tests/subagents.test.ts
pnpm --filter @zcode/core test -- --run tests/subagent-profile.test.ts
```

Expected: PASS。

---

### Tarefa 12: Validação completa

**Arquivos:**

- No new files unless prior tasks require snapshots.

**Interfaces:**

- Consumes: all prior tasks.
- Produces: final verification evidence.

- [ ] **Passo 1: Testes direcionados**

Run:

```bash
pnpm --filter @zcode/ui test -- --run \
  test/settingsPageConfig.test.ts \
  test/settingsNavigation.test.ts \
  test/subagentsMentionProvider.test.ts \
  test/subagentsSettingsSection.test.tsx
```

Expected: PASS。

- [ ] **Passo 2: Testes de service/runtime**

Run:

```bash
pnpm test -- --run packages/services/test/subagentsService.test.ts
pnpm --filter @zcode/bootstrap test -- --run tests/subagents.test.ts
pnpm --filter @zcode/core test -- --run tests/subagent-profile.test.ts
```

Expected: PASS。

- [ ] **Passo 3: Verificações obrigatórias do repo**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS。

- [ ] **Passo 4: Smoke manual**

Iniciar o app usando o comando de dev normal do repo para este worktree. Depois:

1. Abrir Settings.
2. Abrir a seção Subagents.
3. Criar o user agent `code-reviewer`.
4. Confirmar que o arquivo existe em `~/.zcode/agents/code-reviewer.md` ou no `${storage.dir}/agents/code-reviewer.md` configurado.
5. Desabilitar `code-reviewer`.
6. Iniciar uma nova sessão de agent.
7. Inspecionar o request model-io/visível ao provider e confirmar que `code-reviewer` está ausente da lista de agents disponíveis.
8. Habilitar `code-reviewer`.
9. Iniciar outra nova sessão de agent e confirmar que `code-reviewer` aparece na lista de agents visível ao provider.

Expected:

- A lista de Settings e o corpo visível ao provider do runtime concordam.
- Nenhuma UI de edição de agent de workspace é exposta.
- Os built-in agents são visíveis, mas somente leitura。

---

## Riscos e Não-objetivos

- Este plano não altera a questão separada dotransportador de dados visível ao provider: o ZCode hoje injeta a lista de agents por `context_prefix` e não pelo prompt da ferramenta Agent.
- Este plano não adiciona criação ou edição de agents de workspace/project.
- Este plano não adiciona agents de plugin.
- Este plano não implementa edição de objetos YAML aninhados para `mcpServers`; o P0 preserva valores de array simples e pode expor apenas texto bruto.
- Este plano não altera o schema da ferramenta `Agent` / `Task` nem o comportamento do SendMessage.

## Checklist de Self-Review

- [ ] Cada requisito do P0 mapeia para pelo menos uma tarefa.
- [ ] A GUI de Settings grava no user agent root consumido pelo runtime.
- [ ] O runtime consome o estado de desabilitação.
- [ ] O mention provider não é restringido por engano ao modo settings user-only.
- [ ] A edição de workspace não é exposta na UI.
- [ ] Os built-in agents são somente leitura.
- [ ] Nenhum import de `@zcode/core` no service.
- [ ] As chaves de i18n existem em zh-CN e en-US.
- [ ] `pnpm typecheck` e `pnpm lint` estão incluídos na validação.