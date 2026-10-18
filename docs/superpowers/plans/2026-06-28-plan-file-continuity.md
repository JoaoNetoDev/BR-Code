# Plano de Implementação do Plan File no Plan Mode

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use `superpowers:executing-plans` para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Transformar o design `ExitPlanMode(plan)` do Plan mode do ZCode em um design baseado em plan file: o corpo do plano é gravado em um plan file, garantindo que após compact / resume / pending approval replay o plano completo ainda possa ser recuperado a partir do plan file.

**Arquitetura:** O contrato do plan file — composto por provider-visible tool schema, tool prompt, runtime injected input, tool output e plan-file reminder — é o único objetivo. O modelo vê apenas `ExitPlanMode({ allowedPrompts? })`; o runtime injeta `{ plan, planFilePath }` a partir do plan file atual antes de permission/hook/handler; após a aprovação, o tool output usa o shape `{ plan, isAgent, filePath, hasTaskTool?, planWasEdited?, awaitingLeaderApproval?, requestId? }`. O próprio plan file é a fonte de verdade do corpo do plano; eventos de sessão registram apenas o path/status do plan file para suportar compact, resume e snapshot.

**Stack técnico:** TypeScript, Zod, Vitest, `@zcode/contracts`, runtime/tool executor do core do ZCode, session events/reducer, prompt trajectory provider-visible, projeção de sessão replayable desktop continuous e web-remote.

## Restrições Globais

- O contrato comportamental tem como única fonte de verdade o «Target Contract» abaixo e o `docs/plan-mode-plan-file.md` escrito na Task 0.
- O escopo alvo cobre somente o design de plan-file do Plan mode: schemas de `EnterPlanMode` / `ExitPlanMode`, prompt, plan file path, permission approval, tool result, continuidade de compact/resume, snapshot/replay de UI. Não altere Read/PDF, Agent.model, TodoWrite.activeForm, fragmentos dinâmicos de Bash, server compact, team/agent swarm, ultraplan, auto-mode gate e outros itens adiados.
- Não mantenha caminhos de compatibilidade legados de `plan` provider-visible. O novo `ExitPlanMode.inputSchema` provider-visible só pode conter `allowedPrompts?`; não pode conter `plan`, `planFilePath`, `filePath`.
- O runtime pode ter um internal injected input schema: `allowedPrompts?` + `plan?` + `planFilePath?`. Esse schema serve apenas para normalize / permission / hooks / handler e não pode vazar para `registry.toContracts()`.
- Os campos do output schema são fixos: `plan`, `isAgent`, `filePath`, `hasTaskTool?`, `planWasEdited?`, `awaitingLeaderApproval?`, `requestId?`. Não adicione o campo de output `planFilePath`.
- O plan file path usa o padrão de nomenclatura `.claude/plans/plan-session-id.md` sob a raiz do workspace. A implementação real usa `plan-<session id sanitizado>.md` com sufixo numérico para garantir unicidade; essa já é a localização de artefatos de plano existente neste repositório. Não mude para `.zcode/plans`, artifact store, session sqlite, docs/superpowers/plans ou diretórios temporários.
- A gravação de plan file só é permitida para o plan file reservado atualmente. O Plan mode continua proibindo modificações normais não somente-leitura; a liberação vale apenas para o path exato do plan file atual em `Write` / `Edit`. Não permita Bash redirect, ApplyPatch, qualquer escrita arbitrária no workspace nem qualquer escrita em `.claude`.
- `EnterPlanMode` apenas reserva o plan file path, sem pré-criar o arquivo. Assim o modelo pode criar o arquivo com `Write` sem disparar o guard de Write stale de arquivo ainda não lido.
- `ExitPlanMode` não pode ler o plan file só no handler, porque permission, hooks e a UI de aprovação pendente acontecem antes do handler. O runtime input enrichment deve ser concluído antes do hook PreToolUse, para que PreToolUse, PermissionRequest, broker, pending snapshot e PostToolUse enxerguem o injected input.
- Se o plan file atual não existir ou estiver vazio, `ExitPlanMode` retorna um erro de ferramenta recuperável e mantém o plan mode; não use parâmetros de toolcall, summary, read-state ou artifact store como fallback.
- Compact / resume devem restaurar o plan file path e o conteúdo completo através de um producer `plan_file_reference` explícito. Não reutilize o generic read-state reminder nem remova o skip guard de read-state para `docs/superpowers/plans/`.
- As fronteiras desktop `desktop-continuous` e mobile `web-remote-replayable` permanecem inalteradas: relay/main apenas repassa, sem salvar estado de negócio do plano; o payload de snapshot/replay de sessão deve conter o injected input necessário para a aprovação pendente.
- Operações de arquivo em workspace remoto usam `workspacePath` / diretório de trabalho do runtime; o isolamento de identidade continua sendo feito por session/workspace owner usando `workspaceIdentity?.trim() || workspacePath`; não trate `workspaceIdentity` como caminho de arquivo.
- Antes de modificar `packages/ui`, leia o `DESIGN.md` da raiz. A UI faz apenas parsing de campos e exibição de blocos existentes, sem grandes novas experiências de UI.
- Logs novos seguem as regras de logger existentes: detalhes de alto volume de payload provider/tool só podem ir para debug/model-io, nunca para info de produção.
- Cada tarefa de implementação começa com um teste falhando, depois a implementação, depois testes focados. Ao final é obrigatório rodar `pnpm typecheck` e `pnpm lint`.
- Ao fim de cada tarefa, faça um commit pequeno seguindo Conventional Commits; não faça push.

---

## Lista Explícita de Omissões

- Não implemente team lead / teammate mailbox / agent swarm approval: `awaitingLeaderApproval` e `requestId` permanecem apenas no output schema, e o fluxo ZCode main-agent comum não os define.
- Não implemente ramificação de identidade de agente: o `ExitPlanMode` do ZCode comum retorna `isAgent: false`.
- Não implemente a UI de edição de plano com `Ctrl+G`; implemente apenas que, quando o arquivo já existe, o usuário possa modificá-lo por um editor externo, e o runtime usa o conteúdo em disco como autoridade.
- Não implemente resumo do conteúdo do plan file, snapshot aprovado truncado ou fallback de artifact. O tool result entregue ao modelo continua sujeito ao result budget existente, mas o plan file em si não é gravado de forma truncada.
- Não altere a fronteira de aprovação de `ExitPlanMode`: continuam valendo as semânticas de confirmação do usuário, parada do turno em rejeição e continuação da revisão em caso de rejeição com feedback, conforme `docs/plan-mode-approval-boundary.md`.
- Não adicione regra em `.gitignore` para esconder `.claude/plans`. Este repositório já rastreia `.claude/plans/*.md`; se artefatos de plano são versionados é um fato existente do repositório e não é alterado por este plano.
- Não atualize o catálogo de casos E2E de conversa, a menos que a implementação de fato mude o comportamento E2E de conversa/sessão. Se apenas testes unitários de snapshot/projeção de sessão existentes forem alterados, não ampliar para uma nova matriz E2E de conversa.

## Contrato Alvo

Estes contratos são escritos na spec na Task 0 e a implementação posterior não pode divergir:

- O provider input schema de `ExitPlanMode` é `strictObject({ allowedPrompts }).passthrough()`, sem `plan` provider-visible.
- O internal schema estende isso com `{ plan?: string, planFilePath?: string }`, injetado pelo runtime a partir do disco antes de permission / hooks.
- O output schema é `{ plan, isAgent, filePath, hasTaskTool?, planWasEdited?, awaitingLeaderApproval?, requestId? }`.
- O texto do tool result do flow comum não-agente contém:
  - `User has approved your plan. You can now start coding. Start with updating your todo list if applicable`
  - `Your plan has been saved to: ${filePath}`
  - `You can refer back to it if needed during implementation.`
  - `## ${planWasEdited ? "Approved Plan (edited by user)" : "Approved Plan"}:`
- O texto do system reminder `plan_file_reference` é:
  - `A plan file exists from plan mode at: ${planFilePath}`
  - linha em branco
  - `Plan contents:`
  - linha em branco
  - `${planContent}`
  - linha em branco
  - `If this plan is relevant to the current work and not already complete, continue working on it.`
- `plan_mode_exit` acrescenta quando o plano existe: ` The plan file is located at ${planFilePath} if you need to reference it.`
- Este repositório já tem `.claude/plans/*.md` como localização local do artefato de plan file.

## Mapa de Arquivos

- Create: `docs/plan-mode-plan-file.md`
  - spec semântico: plan file path, provider schema, runtime injected input, approval, compact/resume, fronteiras de UI/replayable.
- Modify: `apps/zcode-cli/docs/design/v2/tool/16-plan-mode.md`
  - remover o contrato antigo de que o corpo do plano era passado diretamente por `ExitPlanMode.plan`, sem Introducing plan file, e substituir pelo contrato de plan file.
- Modify: `docs/plan-mode-approval-boundary.md`
  - manter a fronteira de aprovação e complementar que a origem do conteúdo aprovado passa de `input.plan` para o conteúdo do plan file injetado.
- Modify: `apps/zcode-cli/packages/contracts/src/tools/plan-mode.ts`
  - separar o provider input schema do internal injected input schema; adicionar campos de plan file ao output.
- Modify: `apps/zcode-cli/packages/contracts/src/events/session.events.ts`
- Modify: `apps/zcode-cli/packages/contracts/src/events/event-reducer.ts`
- Modify: `packages/shared/src/zcode-protocol/index.ts`
  - adicionar campos de plan file state / snapshot, preservando o pending permission input.
- Modify: `apps/zcode-cli/packages/core/src/tool/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/validation.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/permission-flow.ts`
  - adicionar validação de provider input, preparação de input antes dos hooks, validação do input de execução, e fazer o permission request usar o injected input.
- Modify: `apps/zcode-cli/packages/core/src/permission/service.ts`
  - adicionar exceção de escrita do plan file atual exato.
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/write.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/edit.ts`
  - liberar Write/Edit somente no plan mode e somente para o path exato do plan file atual.
- Create: `apps/zcode-cli/packages/core/src/runtime/helpers/plan-file.ts`
  - geração de plan file path, geração de slug, path join entre POSIX/Windows, leitura de disco, formatter do system reminder.
- Modify: `apps/zcode-cli/packages/core/src/runtime/internal.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/session-mode-port.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/runtime-reminders.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/turn-loop.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/resume.ts`
  - manter o plan file path atual / aprovado e injetar os reminders de plan mode / exit.
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/compact-post-reminders.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
  - referência explícita ao plan file após o compact.
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode-prompts.ts`
  - `ExitPlanMode` lê o injected input e emite `filePath`.
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts`
- Modify: `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`
- Modify: `packages/ui/src/lib/zcodeSessionProjection.ts`
- Modify: `packages/ui/src/lib/toolDisplay.ts`
- Modify: `packages/ui/src/ToolCallBlocks/ToolCallBody.tsx`
  - snapshot/replay/UI usam `filePath`; o schema de aprovação pendente preserva o injected input.
- Test: `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/plan-mode-tool.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/permission-service.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-persistence.test.ts`
- Test: `packages/ui/test/toolDisplay.test.ts`
- Test: `packages/ui/test/zcodeSessionProjection.test.ts`
- Test: `packages/services/test/zcodeAgentService.test.ts`
- Test: `packages/services/test/zcodeSessionService.test.ts`
- Test: prompt trajectory fixture em `apps/zcode-cli/tools/prompt-trajectory/testcases/`

---

### Task 0: Escrever a Spec de Contrato do Plan File

**Files:**
- Create: `docs/plan-mode-plan-file.md`

**Interfaces:**
- Produces: `## Tool Contract` em `docs/plan-mode-plan-file.md`; as tarefas seguintes só podem referenciar os contratos de lá.

- [ ] **Step 1: Escrever o documento de spec**

Create `docs/plan-mode-plan-file.md` with this content:

```markdown
# Plan Mode Plan File

## Target

ZCode Plan mode keeps the plan body in a reserved plan file; `ExitPlanMode` reads the plan from disk instead of taking it as a tool parameter.

## Tool Contract

- Provider-visible `ExitPlanMode` input has only `allowedPrompts?`.
- Internal runtime input may include `plan?` and `planFilePath?`, injected from disk before permission and hooks.
- Output schema includes `plan`, `isAgent`, `filePath`, `hasTaskTool?`, `planWasEdited?`, `awaitingLeaderApproval?`, and `requestId?`.
- Normal main-agent approval output uses `isAgent: false`, `filePath`, and the plan content read from the plan file.
- `plan_file_reference` re-injects the plan file path and complete plan contents after compact/resume.
- `plan_mode_exit` tells the model that edits/tools are allowed and includes the plan file path when a plan exists.

## ZCode Contract

- `EnterPlanMode` reserves a unique plan file path under the workspace root, using the `.claude/plans/plan-session-id.md` naming pattern.
- `EnterPlanMode` does not create the file.
- Plan mode allows only read-only tools plus `Write` or `Edit` targeting the exact reserved plan file path.
- `ExitPlanMode` provider input does not contain plan text.
- Before PreToolUse hooks, runtime reads the reserved plan file and injects `{ plan, planFilePath }`.
- User approval sees the injected plan content and plan file path.
- Approval exits plan mode and returns `{ plan, isAgent: false, filePath }`.
- Rejection without feedback stops the current turn and keeps plan mode.
- Rejection with `reasonSource: "plan_approval_feedback"` keeps plan mode and lets the model revise the same plan file.
- Compact and resume re-inject `plan_file_reference` from the plan file. If a referenced plan file is missing or empty, the operation fails explicitly instead of silently dropping the plan.
- Desktop continuous and web remote replayable both consume session events/snapshots; relay and main process do not own plan state.

## Out Of Scope

- Team lead / teammate mailbox approval.
- Agent swarm `isAgent: true` behavior.
- Ctrl+G or web UI plan editor.
- Plan summary fallback.
- Other postponed surfaces unrelated to plan files.
```

- [ ] **Step 2: Commit da Task 0**

Run:

```bash
git add docs/plan-mode-plan-file.md
git commit -m "docs: record plan file contract"
```

Expected: commit succeeds.

---

### Task 1: Atualizar a Documentação Semântica Existente do Plan Mode

**Files:**
- Modify: `apps/zcode-cli/docs/design/v2/tool/16-plan-mode.md`
- Modify: `docs/plan-mode-approval-boundary.md`

**Interfaces:**
- Consumes: `docs/plan-mode-plan-file.md`.
- Produces: docs que não afirmam mais que `ExitPlanMode.plan` é o contrato atual.

- [ ] **Step 1: Atualizar `16-plan-mode.md`**

Substitua o escopo antigo da primeira versão por:

```markdown
ZCode 当前版本采用 plan-file 语义：计划正文写入 workspace root 下的 `.claude/plans/plan-session-id.md`，`ExitPlanMode` 的 provider-visible 输入只包含 `allowedPrompts?`，runtime 在 permission / hook / handler 前从 plan file 注入 `plan` 与 `planFilePath`。
```

Na seção `ExitPlanMode`, deixe os bullets de input/output assim:

```markdown
- Provider-visible 输入：
  - `allowedPrompts?: { tool: "Bash"; prompt: string }[]`
- Runtime injected 输入：
  - `plan?: string`：从当前 plan file 读取，供 permission、hooks、approval UI 和 handler 使用。
  - `planFilePath?: string`：当前 plan file 的绝对路径。
- 输出：
  - `plan: string | null`
  - `isAgent: false`
  - `filePath?: string`
  - `hasTaskTool?: boolean`
  - `planWasEdited?: boolean`
  - `awaitingLeaderApproval?: boolean`
  - `requestId?: string`
```

Remova todas as afirmações que dizem:

```text
工具必须通过 plan 参数传入完整计划
模型不要假设存在 plan file
ExitPlanMode 的 plan 留在 tool input / result payload
从 yolo 进入 plan mode 时直接 allow
```

Mantenha a fronteira de aprovação atual de `docs/plan-mode-approval-boundary.md`: `ExitPlanMode` ainda pede aprovação do usuário no plan mode.

- [ ] **Step 2: Atualizar `docs/plan-mode-approval-boundary.md`**

Adicione este parágrafo sob `## 语义`:

```markdown
审批内容来源是 runtime injected `ExitPlanMode` input：runtime 在进入 permission broker 前读取当前 plan file，将 `{ plan, planFilePath }` 注入 tool input。UI、hook、pending snapshot 和 tool result 均消费这个 injected input，而不是 provider-visible toolcall 参数。
```

- [ ] **Step 3: Verificar que os docs não contêm mais o contrato obsoleto**

Run:

```bash
rg -n 'DOES take the plan content|required plan parameter|计划正文通过 `ExitPlanMode.plan` 直接传入|不做 `ExitPlanMode` V2|保留 ZCode 当前 `ExitPlanMode\(plan\)`|工具必须通过 `plan` 参数' apps/zcode-cli/docs docs
```

Expected: no hits except historical completed-plan files under `apps/zcode-cli/docs/plan/trajectory/completed/` if those files are explicitly describing old completed work. Do not edit completed historical plans.

- [ ] **Step 4: Commit da Task 1**

Run:

```bash
git add apps/zcode-cli/docs/design/v2/tool/16-plan-mode.md docs/plan-mode-approval-boundary.md
git commit -m "docs: align plan mode docs with plan files"
```

Expected: commit succeeds.

---

### Task 2: Separar Provider Schema do Runtime Injected Schema

**Files:**
- Modify: `apps/zcode-cli/packages/contracts/src/tools/plan-mode.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/validation.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
- Test: `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/plan-mode-tool.test.ts`

**Interfaces:**
- Produces: `ExitPlanModeInputSchema` para o provider input: `{ allowedPrompts? }`.
- Produces: `ExitPlanModeInjectedInputSchema` para o runtime input: `{ allowedPrompts?, plan?, planFilePath? }`.
- Produces: `ToolEntry.executionInputSchema?: JsonSchema`.
- Produces: `ToolEntry.prepareInput?: (input, context) => Promise<unknown>`.

- [ ] **Step 1: Escrever o teste de contrato falhando**

Em `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`, substitua o teste de contrato atual do ExitPlanMode por:

```ts
it("matches the ExitPlanMode plan-file provider contract", () => {
  const registry = createToolRegistry();
  registerBuiltInTools(registry);
  const contract = registry.toContracts().find((item) => item.name === "ExitPlanMode");

  expect(contract?.description).toContain("finished writing your plan to the plan file");
  expect(contract?.description).toContain("does NOT take the plan content as a parameter");
  expect(contract?.description).toContain("read the plan from the file you wrote");
  expect(contract?.description).not.toContain("required plan parameter");
  expect(contract?.inputSchema).toHaveProperty("properties.allowedPrompts");
  expect(contract?.inputSchema).not.toHaveProperty("properties.plan");
  expect(contract?.inputSchema).not.toHaveProperty("properties.planFilePath");
});
```

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/tool-contracts.test.ts -t "ExitPlanMode plan-file provider contract"
```

Expected: FAIL porque o schema atual expõe `plan`.

- [ ] **Step 2: Escrever o teste falhando do injected schema**

Em `apps/zcode-cli/packages/core/tests/plan-mode-tool.test.ts`, adicione:

```ts
it("keeps injected ExitPlanMode plan fields out of provider schema", () => {
  expect(exitPlanModeToolEntry.inputSchema).toHaveProperty("properties.allowedPrompts");
  expect(exitPlanModeToolEntry.inputSchema).not.toHaveProperty("properties.plan");
  expect(exitPlanModeToolEntry.inputSchema).not.toHaveProperty("properties.planFilePath");
  expect(exitPlanModeToolEntry.executionInputSchema).toHaveProperty("properties.plan");
  expect(exitPlanModeToolEntry.executionInputSchema).toHaveProperty("properties.planFilePath");
});
```

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/plan-mode-tool.test.ts -t "injected ExitPlanMode plan fields"
```

Expected: FAIL porque `executionInputSchema` não existe.

- [ ] **Step 3: Implementar os schemas de contrato**

Em `apps/zcode-cli/packages/contracts/src/tools/plan-mode.ts`, substitua o `ExitPlanModeInputSchema` atual por:

```ts
export const ExitPlanModeInputSchema = z
  .object({
    allowedPrompts: z
      .array(ExitPlanModeAllowedPromptSchema)
      .optional()
      .describe(
        "Prompt-based permissions needed to implement the plan. These describe categories of actions rather than specific commands.",
      ),
  })
  .strict()
  .catchall(z.unknown());
export type ExitPlanModeInput = z.infer<typeof ExitPlanModeInputSchema>;
export const ExitPlanModeInputJsonSchema = toToolJsonSchema(ExitPlanModeInputSchema);

export const ExitPlanModeInjectedInputSchema = ExitPlanModeInputSchema.extend({
  plan: z.string().optional().describe("The plan content (injected by the runtime from the plan file)"),
  planFilePath: z.string().optional().describe("The plan file path (injected by the runtime)"),
});
export type ExitPlanModeInjectedInput = z.infer<typeof ExitPlanModeInjectedInputSchema>;
export const ExitPlanModeInjectedInputJsonSchema = toToolJsonSchema(
  ExitPlanModeInjectedInputSchema,
);
```

Atualize o output schema para o shape de plan file:

```ts
export const ExitPlanModeOutputSchema = z
  .object({
    plan: z.string().nullable().describe("The plan that was presented to the user"),
    isAgent: z.boolean(),
    filePath: z.string().optional().describe("The file path where the plan was saved"),
    hasTaskTool: z.boolean().optional().describe("Whether the Agent tool is available in the current context"),
    planWasEdited: z
      .boolean()
      .optional()
      .describe("True when the user edited the plan; determines whether the plan is echoed back in tool_result"),
    awaitingLeaderApproval: z
      .boolean()
      .optional()
      .describe("When true, the teammate has sent a plan approval request to the team leader"),
    requestId: z.string().optional().describe("Unique identifier for the plan approval request"),
  })
  .strict();
```

Não exporte `PLAN_MODE_MAX_PLAN_CHARS`; ele não se aplica mais ao provider input.

- [ ] **Step 4: Adicionar o plumbing do execution input schema**

Em `apps/zcode-cli/packages/core/src/tool/types.ts`, adicione:

```ts
export interface ToolInputPreparationContext {
  abortSignal: AbortSignal;
  fileSystemPort?: FileSystemPort;
  getCurrentPlanFilePath?: () => string | undefined;
  logger?: Logger;
  sessionId: SessionId;
  toolCallId: string;
  traceContext: TraceContext;
  workingDirectory: string;
  workspaceRoot: string;
}
```

Adicione ao `ToolEntry`:

```ts
executionInputSchema?: JsonSchema;
prepareInput?: (
  input: unknown,
  context: ToolInputPreparationContext,
) => Promise<unknown>;
```

Adicione os campos correspondentes a `ToolExecutorOptions` / `ToolExecutorDeps` em `executor/types.ts`:

```ts
getCurrentPlanFilePath?: () => string | undefined;
```

- [ ] **Step 5: Separar as fases de validação**

Em `apps/zcode-cli/packages/core/src/tool/executor/validation.ts`, mude `validateInput` para:

```ts
export function validateInput(
  input: unknown,
  entry: ToolEntry,
  phase: "provider" | "execution" = "execution",
): Error | undefined {
  const schema = phase === "provider" ? entry.inputSchema : entry.executionInputSchema ?? entry.inputSchema;
  const validation = validateJsonSchemaValue(input, schema);
  if (validation.valid) return undefined;

  return createCoreError(
    CoreErrorType.ToolExecutionFailed,
    `Tool input failed ${phase} schema validation`,
    {
      context: {
        errors: validation.errors.slice(0, 20),
        toolName: entry.metadata.name,
      },
      recoverable: true,
    },
  );
}
```

- [ ] **Step 6: Chamar `prepareInput` antes dos hooks e da permission**

Em `call-runner.ts`, use esta ordem:

```ts
let executionInput = normalizeToolExecutionInput({ entry, input: toolCall.input, logger: deps.logger, source: "initial" });
const providerInputValidation = validateInput(executionInput, entry, "provider");
if (providerInputValidation) return createErrorResult(toolCall, providerInputValidation);

if (entry.prepareInput) {
  executionInput = await entry.prepareInput(executionInput, {
    abortSignal: options?.signal ?? new AbortController().signal,
    fileSystemPort: deps.fileSystemPort,
    getCurrentPlanFilePath: deps.getCurrentPlanFilePath,
    logger: deps.logger,
    sessionId: deps.sessionId,
    toolCallId: toolCall.id,
    traceContext,
    workingDirectory: deps.getWorkingDirectory(),
    workspaceRoot: deps.getWorkspaceRoot(),
  });
  executionInput = normalizeToolExecutionInput({ entry, input: executionInput, logger: deps.logger, source: "initial" });
}

const executionInputValidation = validateInput(executionInput, entry, "execution");
if (executionInputValidation) return createErrorResult(toolCall, executionInputValidation);
```

Quando PreToolUse ou permission modificarem o input, normalize e valide com a phase `"execution"`.

- [ ] **Step 7: Conectar a entry do ExitPlanMode**

Em `plan-mode.ts`, defina:

```ts
inputSchema: ExitPlanModeInputJsonSchema,
executionInputSchema: ExitPlanModeInjectedInputJsonSchema,
runtimeInputSchema: ExitPlanModeInjectedInputSchema,
```

Não implemente `prepareInput` ainda; a Task 3 o adiciona.

- [ ] **Step 8: Rodar os testes focados**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/tool-contracts.test.ts tests/plan-mode-tool.test.ts
```

Expected: only tests that require actual plan file enrichment may still fail; schema tests pass.

- [ ] **Step 9: Commit da Task 2**

Run:

```bash
git add apps/zcode-cli/packages/contracts/src/tools/plan-mode.ts apps/zcode-cli/packages/core/src/tool/types.ts apps/zcode-cli/packages/core/src/tool/executor/types.ts apps/zcode-cli/packages/core/src/tool/executor/validation.ts apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts apps/zcode-cli/packages/core/src/tool/handlers/plan-mode.ts apps/zcode-cli/packages/core/tests/tool-contracts.test.ts apps/zcode-cli/packages/core/tests/plan-mode-tool.test.ts
git commit -m "feat: split plan mode provider and injected schemas"
```

Expected: commit succeeds.

---

### Task 3: Implementar o Ciclo de Vida do Plan File Path e a Exceção de Escrita no Plan Mode

**Files:**
- Create: `apps/zcode-cli/packages/core/src/runtime/helpers/plan-file.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/internal.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/session-mode-port.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/impl.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
- Modify: `apps/zcode-cli/packages/core/src/permission/service.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/write.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/edit.ts`
- Test: `apps/zcode-cli/packages/core/tests/plan-mode-tool.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/permission-service.test.ts`

**Interfaces:**
- Produces: `runtime.currentPlanFilePath?: string`.
- Produces: `runtime.approvedPlanFilePath?: string`.
- Produces: `buildPlanFilePath({ workspaceRoot, sessionId, now, exists })`.
- Produces: `PermissionToolCapability.allowInPlanMode?: boolean`.

- [ ] **Step 1: Escrever os testes falhando do plan file path**

Em `plan-mode-tool.test.ts`, adicione:

```ts
it("reserves a .claude/plans markdown file when entering plan mode", async () => {
  const result = await enterPlanModeHandler({}, createPlanModeToolContextWithFileSystem({
    mode: "build",
    workspaceRoot: "/workspace/project",
  }));

  expect(result.mode).toBe("plan");
  expect(testRuntime.currentPlanFilePath).toMatch(/^\/workspace\/project\/\.claude\/plans\/[a-z0-9-]+\.md$/u);
});

it("does not create the plan file when entering plan mode", async () => {
  await enterPlanModeHandler({}, createPlanModeToolContextWithFileSystem({
    mode: "build",
    workspaceRoot: "/workspace/project",
  }));

  expect(fakeFileSystem.writeTextFile).not.toHaveBeenCalled();
});
```

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/plan-mode-tool.test.ts -t "plan file"
```

Expected: FAIL porque nenhum plan path é reservado.

- [ ] **Step 2: Implementar o helper de plan file**

Crie `apps/zcode-cli/packages/core/src/runtime/helpers/plan-file.ts`:

```ts
import path from "node:path";
import type { FileSystemPort, SessionId } from "@zcode/contracts";

export interface PlanFilePathInput {
  fileSystemPort: FileSystemPort;
  sessionId: SessionId;
  workspaceRoot: string;
}

export function workspacePathApi(workspaceRoot: string): typeof path.posix | typeof path.win32 {
  return /^[A-Za-z]:[\\/]/u.test(workspaceRoot) || workspaceRoot.includes("\\")
    ? path.win32
    : path.posix;
}

export function buildPlanFileCandidate(workspaceRoot: string, slug: string): string {
  const pathApi = workspacePathApi(workspaceRoot);
  return pathApi.join(workspaceRoot, ".claude", "plans", `${slug}.md`);
}

export function slugFromSessionId(sessionId: SessionId): string {
  return `plan-${String(sessionId).replace(/[^a-zA-Z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").toLowerCase()}`;
}

export async function reservePlanFilePath(input: PlanFilePathInput): Promise<string> {
  const baseSlug = slugFromSessionId(input.sessionId);
  for (let index = 0; index < 100; index += 1) {
    const slug = index === 0 ? baseSlug : `${baseSlug}-${index + 1}`;
    const candidate = buildPlanFileCandidate(input.workspaceRoot, slug);
    const stat = await input.fileSystemPort.stat({ path: candidate }).catch((error) => {
      if (error && typeof error === "object" && "code" in error && error.code === "not_found") {
        return undefined;
      }
      throw error;
    });
    if (!stat || stat.kind === "missing") return candidate;
  }
  throw new Error("Unable to reserve a unique plan file path after 100 attempts");
}
```

Use o nome determinístico `plan-<sessionId>.md` em vez de nomes aleatórios extravagantes. O invariante é a localização `.claude/plans/*.md`; a nomenclatura com palavras aleatórias é cosmética e não é provider-visible.

- [ ] **Step 3: Adicionar o estado no runtime**

Em `AgentRuntimeInternal` adicione:

```ts
currentPlanFilePath?: string;
approvedPlanFilePath?: string;
```

Inicialize ambos como `undefined` em `agent-runtime.ts`.

Passe para `createToolExecutor`:

```ts
getCurrentPlanFilePath: () => runtime.currentPlanFilePath,
```

- [ ] **Step 4: Reservar o path na entrada**

Em `session-mode-port.ts`, antes de trocar o modo para `plan`, exija `runtime.fileSystemPort` e chame `reservePlanFilePath`. Armazene:

```ts
runtime.currentPlanFilePath = reservedPath;
runtime.approvedPlanFilePath = undefined;
```

Se já estiver em plan mode e `currentPlanFilePath` existir, mantenha o mesmo path.

- [ ] **Step 5: Escrever o teste falhando de permissão para escrita no plan file**

Em `permission-service.test.ts`, adicione:

```ts
it("allows Write to the exact current plan file while in plan mode", () => {
  const service = new PermissionService();
  const decision = service.checkPermission(
    {
      input: { file_path: "/workspace/.claude/plans/plan-session.md", content: "# Plan" },
      mode: "plan",
      riskLevel: "medium",
      toolName: "Write",
    },
    {
      allowInPlanMode: true,
      destructive: false,
      needsApproval: false,
      readOnly: false,
      riskLevel: "medium",
      sideEffectScope: "workspace",
    },
  );

  expect(decision).toMatchObject({
    allowed: true,
    decision: "allow",
    ruleId: "mode.plan.planFileWrite",
  });
});

it("still denies non-plan-file writes while in plan mode", () => {
  const service = new PermissionService();
  const decision = service.checkPermission(
    {
      input: { file_path: "/workspace/src/app.ts", content: "x" },
      mode: "plan",
      riskLevel: "medium",
      toolName: "Write",
    },
    {
      destructive: false,
      needsApproval: true,
      readOnly: false,
      riskLevel: "medium",
      sideEffectScope: "workspace",
    },
  );

  expect(decision).toMatchObject({
    allowed: false,
    decision: "deny",
    ruleId: "mode.plan.nonReadOnly",
  });
});
```

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/permission-service.test.ts -t "plan file"
```

Expected: FAIL porque `allowInPlanMode` não existe.

- [ ] **Step 6: Adicionar o campo de capability de permissão**

Em `PermissionToolCapability` adicione:

```ts
allowInPlanMode?: boolean;
```

Em `checkPlanMode`, antes do allow somente-leitura:

```ts
if (capability.allowInPlanMode === true) {
  return this.allow(
    context,
    capability,
    "mode.plan.planFileWrite",
    "Plan mode allows writing the current plan file",
  );
}
```

- [ ] **Step 7: Adicionar modo e plan file atual ao contexto de capability de permissão**

Em `ToolRuntimePermissionCapabilityContext`, adicione:

```ts
currentPlanFilePath?: string;
mode?: CollaborationMode;
```

Em `resolveRuntimePermissionCapability`, passe:

```ts
currentPlanFilePath: deps.getCurrentPlanFilePath?.(),
mode: deps.getMode(),
```

- [ ] **Step 8: Marcar o path exato do plano em Write/Edit como permitido**

Em `write.ts` e `edit.ts`, adicione `resolvePermissionCapability` às tool entries:

```ts
resolvePermissionCapability: (input, context) => {
  const currentPlanFilePath = context?.currentPlanFilePath;
  if (context?.mode !== "plan" || !currentPlanFilePath) return undefined;
  const parsed = WriteInputSchema.safeParse(input);
  if (!parsed.success) return undefined;
  const filePath = resolveWorkspacePath({
    inputPath: parsed.data.file_path,
    operation: "write",
    workingDirectory: context.workingDirectory ?? ".",
    workspaceRoot: context.workspaceRoot ?? ".",
  });
  if (filePath !== currentPlanFilePath) return undefined;
  return {
    allowInPlanMode: true,
    needsApproval: false,
    permission: { needsApproval: false },
    riskLevel: "medium",
    sideEffectScope: "workspace",
  };
},
```

Use `EditInputSchema` em `edit.ts`. Não adicione isso a `ApplyPatch` nem a `Bash`.

- [ ] **Step 9: Rodar os testes focados**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/plan-mode-tool.test.ts tests/permission-service.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit da Task 3**

Run:

```bash
git add apps/zcode-cli/packages/core/src/runtime/helpers/plan-file.ts apps/zcode-cli/packages/core/src/runtime/internal.ts apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts apps/zcode-cli/packages/core/src/runtime/session-mode-port.ts apps/zcode-cli/packages/core/src/tool/executor/types.ts apps/zcode-cli/packages/core/src/tool/executor/impl.ts apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts apps/zcode-cli/packages/core/src/permission/service.ts apps/zcode-cli/packages/core/src/tool/handlers/write.ts apps/zcode-cli/packages/core/src/tool/handlers/edit.ts apps/zcode-cli/packages/core/tests/plan-mode-tool.test.ts apps/zcode-cli/packages/core/tests/permission-service.test.ts
git commit -m "feat: reserve plan files in plan mode"
```

Expected: commit succeeds.

---

### Task 4: Injetar o Input do ExitPlanMode a Partir do Plan File e Emitir o Tool Result de Plan File

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode-prompts.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/session-mode-port.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/runtime-reminders.ts`
- Test: `apps/zcode-cli/packages/core/tests/plan-mode-tool.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`

**Interfaces:**
- Produces: `prepareExitPlanModeInput(input, context)`.
- Produces: model result content para o flow comum main-agent.

- [ ] **Step 1: Escrever o teste falhando de enriquecimento de input antes da aprovação**

Em `plan-mode-tool.test.ts`, adicione:

```ts
it("injects plan and planFilePath from disk before requesting approval", async () => {
  const permissionRequests: unknown[] = [];
  const executor = createPlanModeExecutor({
    fileSystemFiles: {
      "/workspace/.claude/plans/plan-session.md": "# Build plan\n\n1. Add tests.",
    },
    getCurrentPlanFilePath: () => "/workspace/.claude/plans/plan-session.md",
    mode: "plan",
    permissionBroker: {
      requestPermission: async (request) => {
        permissionRequests.push(request.input);
        return { decision: "allow", reason: "approved" };
      },
    },
  });

  const result = await executor.execute({
    id: "toolu_exit",
    name: "ExitPlanMode",
    input: { allowedPrompts: [{ tool: "Bash", prompt: "run tests" }] },
  });

  expect(permissionRequests[0]).toMatchObject({
    allowedPrompts: [{ tool: "Bash", prompt: "run tests" }],
    plan: "# Build plan\n\n1. Add tests.",
    planFilePath: "/workspace/.claude/plans/plan-session.md",
  });
  expect(result.output).toMatchObject({
    filePath: "/workspace/.claude/plans/plan-session.md",
    isAgent: false,
    plan: "# Build plan\n\n1. Add tests.",
  });
});
```

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/plan-mode-tool.test.ts -t "injects plan"
```

Expected: FAIL porque `prepareInput` não está implementado.

- [ ] **Step 2: Implementar `prepareExitPlanModeInput`**

Em `plan-mode.ts`, adicione:

```ts
async function prepareExitPlanModeInput(
  input: unknown,
  context: ToolInputPreparationContext,
): Promise<ExitPlanModeInjectedInput> {
  const parsed = ExitPlanModeInputSchema.parse(input);
  const planFilePath = context.getCurrentPlanFilePath?.();
  if (!planFilePath) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "No plan file is registered for the current plan mode session.", {
      context: { toolCallId: context.toolCallId, toolName: EXIT_PLAN_MODE_TOOL_NAME },
      recoverable: true,
    });
  }
  if (!context.fileSystemPort) {
    throw createCoreError(CoreErrorType.ConfigurationError, "FileSystemPort is not configured for ExitPlanMode", {
      context: { toolCallId: context.toolCallId, toolName: EXIT_PLAN_MODE_TOOL_NAME },
      recoverable: false,
    });
  }
  const read = await context.fileSystemPort.readTextFile(
    { path: planFilePath, trace: context.traceContext },
    { signal: context.abortSignal },
  ).catch((error) => {
    throw createCoreError(
      CoreErrorType.ToolExecutionFailed,
      `No plan file found at ${planFilePath}. Please write your plan to this file before calling ExitPlanMode.`,
      { cause: error instanceof Error ? error : undefined, recoverable: true },
    );
  });
  const plan = read.content.trim();
  if (!plan) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, `No plan file found at ${planFilePath}. Please write your plan to this file before calling ExitPlanMode.`, {
      recoverable: true,
    });
  }
  return { ...parsed, plan, planFilePath };
}
```

Defina na entry:

```ts
prepareInput: prepareExitPlanModeInput,
```

- [ ] **Step 3: Atualizar o handler**

Mude `exitPlanModeHandler` para fazer parse de `ExitPlanModeInjectedInputSchema`, exigir `parsed.plan?.trim()` e `parsed.planFilePath`, e então retornar:

```ts
return {
  filePath: parsed.planFilePath,
  isAgent: false,
  plan: parsed.plan,
} satisfies ExitPlanModeOutput;
```

Após a transição, defina:

```ts
context.sessionModePort.approvePlanFile?.({
  planFilePath: parsed.planFilePath,
  toolCallId: context.toolCallId,
  traceContext: { traceId: context.traceId, spanId: context.spanId, parentSpanId: context.parentSpanId, turnId: context.turnId },
});
```

Se adicionar `approvePlanFile` ao `SessionModePort` for grande demais, estenda `exitPlanMode(input)` para aceitar `planFilePath?: string` e atualize o estado do runtime ali.

- [ ] **Step 4: Atualizar o formatter do result**

Substitua `formatExitPlanModeModelContent` pelo conteúdo do main-agent comum:

```ts
function formatExitPlanModeModelContent(output: unknown): string {
  const result = output as ExitPlanModeOutput;
  const plan = result.plan?.trim();
  if (!plan) {
    return "User has approved exiting plan mode. You can now proceed.";
  }

  const taskNote = result.hasTaskTool
    ? `\n\nIf this plan can be broken down into multiple independent tasks, consider using the Agent tool to create a team and parallelize the work.`
    : "";
  return `User has approved your plan. You can now start coding. Start with updating your todo list if applicable

Your plan has been saved to: ${result.filePath}
You can refer back to it if needed during implementation.${taskNote}

## ${result.planWasEdited ? "Approved Plan (edited by user)" : "Approved Plan"}:
${plan}`;
}
```

Use `Agent tool` apenas se `hasTaskTool` for true; caso contrário omita `taskNote`.

- [ ] **Step 5: Atualizar o texto do prompt do ExitPlanMode**

Em `plan-mode-prompts.ts`, substitua o prompt atual pelo prompt de plan file:

```text
Use this tool when you are in plan mode and have finished writing your plan to the plan file and are ready for user approval.

## How This Tool Works
- You should have already written your plan to the plan file specified in the plan mode system message
- This tool does NOT take the plan content as a parameter - it will read the plan from the file you wrote
- This tool simply signals that you're done planning and ready for the user to review and approve
- The user will see the contents of your plan file when they review it
...
```

Mantenha a newline final.

- [ ] **Step 6: Atualizar o reminder de saída do plan mode**

Mude `buildPlanModeExitReminderBody` para aceitar `{ planFilePath?: string }` e emitir:

```ts
export function buildPlanModeExitReminderBody(input: { planFilePath?: string } = {}): string {
  const suffix = input.planFilePath
    ? ` The plan file is located at ${input.planFilePath} if you need to reference it.`
    : "";
  return `## Exited Plan Mode

You have exited plan mode. You can now make edits, run tools, and take actions.${suffix}`;
}
```

Atualize `turn-loop.ts` para passar `this.approvedPlanFilePath`.

- [ ] **Step 7: Rodar os testes focados**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/plan-mode-tool.test.ts tests/tool-contracts.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit da Task 4**

Run:

```bash
git add apps/zcode-cli/packages/core/src/tool/handlers/plan-mode.ts apps/zcode-cli/packages/core/src/tool/handlers/plan-mode-prompts.ts apps/zcode-cli/packages/core/src/runtime/session-mode-port.ts apps/zcode-cli/packages/core/src/runtime/helpers/runtime-reminders.ts apps/zcode-cli/packages/core/src/runtime/methods/turn-loop.ts apps/zcode-cli/packages/core/tests/plan-mode-tool.test.ts apps/zcode-cli/packages/core/tests/tool-contracts.test.ts
git commit -m "feat: read exit plans from plan files"
```

Expected: commit succeeds.

---

### Task 5: Restaurar o Estado do Plan File com Session Event / Snapshot

**Files:**
- Modify: `apps/zcode-cli/packages/contracts/src/events/session.events.ts`
- Modify: `apps/zcode-cli/packages/contracts/src/events/event-reducer.ts`
- Modify: `packages/shared/src/zcode-protocol/index.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/session-mode-port.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/resume.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-persistence.test.ts`
- Test: `packages/services/test/zcodeSessionService.test.ts`

**Interfaces:**
- Produces: `SessionEventType.PlanFileChanged`.
- Produces: `SessionProjection.planFile?: { currentPath?: string; approvedPath?: string; status: "none" | "draft" | "approved" }`.
- Produces: campo de snapshot do protocolo `planFile`.

- [ ] **Step 1: Escrever o teste falhando do reducer**

Adicione um teste de reducer perto dos testes existentes do reducer de session events:

```ts
it("projects current and approved plan file paths", () => {
  const reducer = new EventReducer();
  const projection = reducer.reduce([
    makeEvent(SessionEventType.PlanFileChanged, {
      planFilePath: "/workspace/.claude/plans/plan-session.md",
      status: "draft",
    }),
    makeEvent(SessionEventType.PlanFileChanged, {
      planFilePath: "/workspace/.claude/plans/plan-session.md",
      status: "approved",
    }),
  ]);

  expect(projection.planFile).toEqual({
    approvedPath: "/workspace/.claude/plans/plan-session.md",
    currentPath: undefined,
    status: "approved",
  });
});
```

Run the exact reducer test file. Expected: FAIL porque o evento não existe.

- [ ] **Step 2: Adicionar o contrato do evento**

Em `session.events.ts`:

```ts
PlanFileChanged: "plan_file_changed",
```

Payload:

```ts
export interface PlanFileChangedPayload {
  planFilePath: string;
  status: "draft" | "approved" | "cleared";
  toolCallId?: ToolCallId;
}
```

Adicione à union de payloads.

- [ ] **Step 3: Adicionar o estado de projeção**

Nos tipos de projeção do event reducer, adicione:

```ts
planFile?: {
  approvedPath?: string;
  currentPath?: string;
  status: "none" | "draft" | "approved";
};
```

Comportamento do reducer:

```ts
if (payload.status === "draft") {
  planFile = { currentPath: payload.planFilePath, approvedPath: p.planFile?.approvedPath, status: "draft" };
}
if (payload.status === "approved") {
  planFile = { approvedPath: payload.planFilePath, currentPath: undefined, status: "approved" };
}
if (payload.status === "cleared") {
  planFile = { approvedPath: undefined, currentPath: undefined, status: "none" };
}
```

- [ ] **Step 4: Emitir eventos**

Em `session-mode-port.ts`:

- Após reservar o path na entrada, anexe `PlanFileChanged(status: "draft")`.
- Na saída aprovada, anexe `PlanFileChanged(status: "approved")`.

Não emita conteúdo no evento.

- [ ] **Step 5: Retomar o estado do runtime**

Em `resume.ts`, após reduzir a projeção:

```ts
this.currentPlanFilePath = projection.planFile?.currentPath;
this.approvedPlanFilePath = projection.planFile?.approvedPath;
```

- [ ] **Step 6: Mapear o snapshot do protocolo**

No schema de protocolo compartilhado e no session mapper do bootstrap, exponha:

```ts
planFile: z.object({
  approvedPath: z.string().optional(),
  currentPath: z.string().optional(),
  status: z.enum(["none", "draft", "approved"]),
}).optional()
```

A UI e os serviços devem receber isso sob a projeção de sessão, e não como estado de relay/main.

- [ ] **Step 7: Rodar os testes focados**

Run:

```bash
pnpm --filter @zcode/contracts exec vitest run
pnpm --filter @zcode/core exec vitest run tests/plan-mode-tool.test.ts tests/runtime-persistence.test.ts
pnpm vitest run packages/services/test/zcodeSessionService.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit da Task 5**

Run:

```bash
git add apps/zcode-cli/packages/contracts/src/events/session.events.ts apps/zcode-cli/packages/contracts/src/events/event-reducer.ts packages/shared/src/zcode-protocol/index.ts apps/zcode-cli/packages/bootstrap/src/zcode-protocol/session-mapper.ts apps/zcode-cli/packages/core/src/runtime/session-mode-port.ts apps/zcode-cli/packages/core/src/runtime/methods/resume.ts
git commit -m "feat: persist plan file session state"
```

Expected: commit succeeds.

---

### Task 6: Injetar `plan_file_reference` em Compact / Resume

**Files:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/plan-file.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/compact-post-reminders.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`

**Interfaces:**
- Produces: `buildPlanFileReferenceEntry({ planFilePath, planContent })`.
- Produces: `buildPostCompactPlanFileReminderEntries(runtime)`.

- [ ] **Step 1: Escrever o teste falhando de preservação no compact**

Em `runtime-compact.test.ts`, adicione:

```ts
it("re-injects approved plan file contents after compact", async () => {
  const runtime = createRuntimeForCompactTest({
    approvedPlanFilePath: "/workspace/.claude/plans/plan-session.md",
    files: {
      "/workspace/.claude/plans/plan-session.md": "# Approved plan\n\n1. Keep this exact plan.",
    },
  });

  await runtime.compactActiveConversation({ trigger: CompactTrigger.Manual });
  const entries = runtime.messageHistory.toRuntimeEntries();
  const planReference = entries.find((entry) => entry.metadata?.source === "plan_file_reference");

  expect(planReference?.message.content).toContain("A plan file exists from plan mode at: /workspace/.claude/plans/plan-session.md");
  expect(planReference?.message.content).toContain("# Approved plan\n\n1. Keep this exact plan.");
});
```

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-compact.test.ts -t "approved plan file"
```

Expected: FAIL porque nenhum plan reminder existe.

- [ ] **Step 2: Adicionar o formatter**

Em `plan-file.ts`, adicione:

```ts
import { systemReminderAttachmentEntry } from "../../agent/message-history.js";
import type { RuntimeMessageEntry } from "../../agent/message-history.js";

export function formatPlanFileReference(input: {
  planFilePath: string;
  planContent: string;
}): string {
  return `A plan file exists from plan mode at: ${input.planFilePath}

Plan contents:

${input.planContent}

If this plan is relevant to the current work and not already complete, continue working on it.`;
}

export function buildPlanFileReferenceEntry(input: {
  planFilePath: string;
  planContent: string;
}): RuntimeMessageEntry {
  return systemReminderAttachmentEntry("plan_file_reference", formatPlanFileReference(input));
}
```

- [ ] **Step 3: Ler o plan file durante o compact**

Em `compact-active.ts`, ao construir `postCompactReminderEntries`, anexe a referência do plan file antes dos generic read-state reminders:

```ts
const postCompactPlanEntries = await buildPostCompactPlanFileReminderEntries.call(this, {
  traceContext: modelTraceContext,
});
const postCompactReminderEntries = [
  ...postCompactPlanEntries,
  ...buildPostCompactReadStateReminderEntries({
    preservedEntries,
    readFileState: this.readFileState,
  }),
];
```

Comportamento do helper:

```ts
async function buildPostCompactPlanFileReminderEntries(this: AgentRuntimeInternal, input: { traceContext: TraceContext }) {
  const planFilePath = this.currentPlanFilePath ?? this.approvedPlanFilePath;
  if (!planFilePath) return [];
  if (!this.fileSystemPort) {
    throw createCoreError(CoreErrorType.ConfigurationError, "FileSystemPort is required to restore plan file context after compact", { recoverable: false });
  }
  const read = await this.fileSystemPort.readTextFile({ path: planFilePath, trace: input.traceContext });
  const planContent = read.content.trim();
  if (!planContent) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, `Plan file is empty at ${planFilePath}`, { recoverable: true });
  }
  return [buildPlanFileReferenceEntry({ planFilePath, planContent })];
}
```

Não capture nem degrade o arquivo ausente/vazio.

- [ ] **Step 4: Preservar o skip guard existente de read-state**

Mantenha `shouldSkipPostCompactReadStatePath()` inalterado para `.codex/memories`, `docs/superpowers/plans` e `.git`. Não adicione `.claude/plans` lá; o producer explícito de plan file é o dono da continuidade do plan file.

- [ ] **Step 5: Adicionar o teste de compact no plan mode ativo**

Adicione:

```ts
it("re-injects draft plan file contents when compact runs during plan mode", async () => {
  const runtime = createRuntimeForCompactTest({
    currentPlanFilePath: "/workspace/.claude/plans/plan-session.md",
    files: {
      "/workspace/.claude/plans/plan-session.md": "# Draft plan\n\nStill planning.",
    },
    mode: "plan",
  });

  await runtime.compactActiveConversation({ trigger: CompactTrigger.Manual });
  expect(runtime.messageHistory.toRuntimeEntries().some((entry) =>
    entry.metadata?.source === "plan_file_reference" &&
    String(entry.message.content).includes("# Draft plan")
  )).toBe(true);
});
```

- [ ] **Step 6: Rodar os testes focados**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-compact.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit da Task 6**

Run:

```bash
git add apps/zcode-cli/packages/core/src/runtime/helpers/plan-file.ts apps/zcode-cli/packages/core/src/runtime/helpers/compact-post-reminders.ts apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts apps/zcode-cli/packages/core/tests/runtime-compact.test.ts
git commit -m "feat: restore plan files after compact"
```

Expected: commit succeeds.

---

### Task 7: Corrigir o Plan Payload de Pending Approval / UI / Snapshot Replayable

**Files:**
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts`
- Modify: `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`
- Modify: `packages/ui/src/lib/zcodeSessionProjection.ts`
- Modify: `packages/ui/src/lib/toolDisplay.ts`
- Modify: `packages/ui/src/ToolCallBlocks/ToolCallBody.tsx`
- Test: `packages/ui/test/zcodeSessionProjection.test.ts`
- Test: `packages/ui/test/toolDisplay.test.ts`
- Test: `packages/services/test/zcodeAgentService.test.ts`
- Test: `packages/services/test/zcodeSessionService.test.ts`

**Interfaces:**
- Produces: o `schema` da elicitation de ExitPlanMode pendente inclui o injected input original mais `{ interaction: "plan_approval", toolName }`.
- Produces: o plan result da UI lê `output.filePath`.

- [ ] **Step 1: Ler o DESIGN.md antes de editar a UI**

Run:

```bash
sed -n '1,220p' DESIGN.md
```

Expected: o arquivo é lido. Aplique apenas mudanças de campos/display; não redesenhe o bloco de plano.

- [ ] **Step 2: Escrever o teste falhando de pending snapshot**

Em `packages/ui/test/zcodeSessionProjection.test.ts`, atualize o teste de aprovação pendente de ExitPlanMode para afirmar:

```ts
expect(elicitation.schema).toMatchObject({
  interaction: "plan_approval",
  toolName: "ExitPlanMode",
  plan: "# Plan",
  planFilePath: "/workspace/.claude/plans/plan-session.md",
});
```

Run:

```bash
pnpm vitest run packages/ui/test/zcodeSessionProjection.test.ts -t "ExitPlanMode"
```

Expected: FAIL porque o schema atualmente descarta `permission.input`.

- [ ] **Step 3: Preservar o injected input na projeção da UI**

Em `pendingExitPlanModeToElicitationEvent`, mude o schema para:

```ts
schema: {
  ...(isRecord(permission.input) ? permission.input : {}),
  interaction: "plan_approval",
  toolName: permission.toolName,
},
```

Use o helper local `isRecord` existente ou adicione um no arquivo.

- [ ] **Step 4: Preservar o injected input no adapter de services**

Aplique o mesmo merge de schema em `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`.

- [ ] **Step 5: Atualizar o interaction broker**

Em `interaction-broker.ts`, mantenha `input: request.input` e mude o schema para:

```ts
schema: {
  ...(typeof request.input === "object" && request.input !== null && !Array.isArray(request.input)
    ? request.input as Record<string, unknown>
    : {}),
  interaction: "plan_approval",
  toolName: request.toolName,
},
```

Isso mantém o replay da aprovação autossuficiente.

- [ ] **Step 6: Atualizar o tool display para usar `filePath`**

Em `toolDisplay.ts`, mude a extração:

```ts
const rawPlanFilePath = value["filePath"];
```

Mantenha a propriedade do modelo de display local chamada `planFilePath` se isso evitar churn nos componentes; o campo de origem deve ser `filePath`.

Atualize `packages/ui/test/toolDisplay.test.ts`:

```ts
output: { plan: "# Plan", filePath: ".claude/plans/plan-session.md", isAgent: false }
```

O path de display esperado resolve para `/workspace/.claude/plans/plan-session.md`.

- [ ] **Step 7: Rodar os testes focados de UI/services**

Run:

```bash
pnpm vitest run packages/ui/test/zcodeSessionProjection.test.ts packages/ui/test/toolDisplay.test.ts
pnpm vitest run packages/services/test/zcodeAgentService.test.ts packages/services/test/zcodeSessionService.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit da Task 7**

Run:

```bash
git add packages/ui/src/lib/zcodeSessionProjection.ts packages/ui/src/lib/toolDisplay.ts packages/ui/src/ToolCallBlocks/ToolCallBody.tsx packages/ui/test/zcodeSessionProjection.test.ts packages/ui/test/toolDisplay.test.ts packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts packages/services/test/zcodeAgentService.test.ts packages/services/test/zcodeSessionService.test.ts apps/zcode-cli/packages/bootstrap/src/zcode-protocol/interaction-broker.ts
git commit -m "fix: preserve plan approval payloads in snapshots"
```

Expected: commit succeeds.

---

### Task 8: Trajectory Provider-Visible e Aceitação da Request

**Files:**
- Modify: `apps/zcode-cli/tools/prompt-trajectory/testcases/system-reminder-sr9-runtime/expect.json`
- Create: `apps/zcode-cli/tools/prompt-trajectory/testcases/plan-file-exit/fixture.json`
- Create: `apps/zcode-cli/tools/prompt-trajectory/testcases/plan-file-exit/expect.json`
- Test: `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`
- Test: prompt trajectory tests

**Interfaces:**
- Produces: evidência provider-visible de que o schema de `ExitPlanMode` não tem `plan`.
- Produces: evidência provider-visible de que a request pós-compact inclui `plan_file_reference`.

- [ ] **Step 1: Adicionar o fixture de prompt trajectory**

Crie um fixture que entra em plan mode, escreve `.claude/plans/plan-session-id.md`, chama `ExitPlanMode({ allowedPrompts })`, aprova e então faz compact.

Asserções esperadas em `expect.json`:

```json
{
  "mustContain": [
    "finished writing your plan to the plan file",
    "does NOT take the plan content as a parameter",
    "Your plan has been saved to:",
    "A plan file exists from plan mode at:"
  ],
  "mustNotContain": [
    "DOES take the plan content as the required plan parameter",
    "\"plan\":{\"type\":\"string\"",
    "required plan parameter"
  ]
}
```

- [ ] **Step 2: Reconstruir as dependências de trajectory**

Run:

```bash
pnpm --filter @zcode/contracts build
pnpm --filter @zcode/core build
pnpm --filter @zcode/bootstrap build
```

Expected: all build commands exit `0`.

- [ ] **Step 3: Rodar os testes de trajectory**

Run:

```bash
pnpm --filter @zcode/prompt-trajectory run:testcases -- plan-file-exit
```

Expected: new plan-file fixture passes and old SR9 runtime fixture is updated for plan file wording.

- [ ] **Step 4: Verificar diretamente o contrato final de tool provider-visible**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/tool-contracts.test.ts -t "ExitPlanMode"
```

Expected: PASS and no provider-visible `properties.plan`.

- [ ] **Step 5: Commit da Task 8**

Run:

```bash
git add apps/zcode-cli/tools/prompt-trajectory/testcases/system-reminder-sr9-runtime apps/zcode-cli/tools/prompt-trajectory/testcases/plan-file-exit apps/zcode-cli/packages/core/tests/tool-contracts.test.ts
git commit -m "test: cover plan file provider trajectory"
```

Expected: commit succeeds.

---

### Task 9: Full Validation

**Files:**
- No planned source edits.

**Interfaces:**
- Produces: final validation evidence.

- [ ] **Step 1: Verificar a working tree**

Run:

```bash
git status --short
```

Expected: nenhuma mudança não commitada e não relacionada a este plano. Se houver WIP do usuário, deixe intocado e mencione no handoff final.

- [ ] **Step 2: Rodar a suíte de testes focada**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/tool-contracts.test.ts tests/plan-mode-tool.test.ts tests/permission-service.test.ts tests/runtime-compact.test.ts
pnpm vitest run packages/ui/test/zcodeSessionProjection.test.ts packages/ui/test/toolDisplay.test.ts
```

Expected: PASS.

- [ ] **Step 3: Rodar as verificações obrigatórias do repositório**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: both commands exit `0`.

- [ ] **Step 4: Inspecionar o diff provider-visible**

Run:

```bash
rg -n "DOES take the plan content|required plan parameter|properties\\.plan|planFilePath.*output|ExitPlanMode\\(plan" apps/zcode-cli/packages apps/zcode-cli/docs docs packages
```

Expected:

- Nenhum hit em código ativo/prompt de provider para o contrato obsoleto `ExitPlanMode(plan)`.
- Documentos históricos concluídos podem mencionar o estado antigo apenas quando claramente rotulados como concluídos/histórico.

- [ ] **Step 5: Confirmar que a validação não editou arquivos**

Run:

```bash
git status --short
```

Expected: working tree limpa exceto pelo WIP pré-existente do usuário. A Task 9 não deve introduzir edições; se a validação revelar uma atualização necessária de fixture ou doc, pare e adicione uma nova tarefa focada em vez de commitar mudanças ad hoc desta tarefa de validação.

---

## Checklist de Aceitação

- [ ] O `ExitPlanMode.inputSchema` provider-visible tem `allowedPrompts?` e não tem `plan`.
- [ ] O prompt de `ExitPlanMode` diz que o plano foi gravado no plan file e que a ferramenta o lê do arquivo.
- [ ] O injected input do runtime inclui `plan` e `planFilePath` antes dos hooks PreToolUse, dos hooks de PermissionRequest, do permission broker e do snapshot de aprovação pendente.
- [ ] `ExitPlanMode` falha no plan mode quando o plan file reservado está ausente ou vazio.
- [ ] `Write` / `Edit` só podem gravar o plan file reservado exato enquanto no plan mode.
- [ ] `Bash`, `ApplyPatch`, `Write` arbitrário e `Edit` arbitrário permanecem bloqueados no plan mode.
- [ ] O shape do output de aprovação usa `filePath`, `isAgent: false` e o conteúdo do plano aprovado.
- [ ] O model content do tool result inclui `Your plan has been saved to:`.
- [ ] `plan_mode_exit` inclui o plan file path quando existe um plano.
- [ ] O compact após a aprovação injeta `plan_file_reference` com o conteúdo completo do plan file.
- [ ] O compact durante o plan mode com plano em rascunho injeta `plan_file_reference` com o conteúdo atual do rascunho.
- [ ] O resume reidrata o plan file path atual/aprovado a partir da projeção de sessão.
- [ ] O replay de aprovação pendente no snapshot desktop e web-remote preserva o plano e o plan file path.
- [ ] O bloco de plano da UI lê `filePath` e mostra o display de plano existente sem redesenho.
- [ ] `pnpm typecheck` passa.
- [ ] `pnpm lint` passa.