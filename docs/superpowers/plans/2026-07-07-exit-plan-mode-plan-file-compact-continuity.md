# Plano de Implementação do Hack de Continuidade Compacta do Plan File no ExitPlanMode

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use `superpowers:executing-plans` para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento. Este plano proíbe commit automático; ao final, apenas output os resultados de verificação e `git status --short`, a menos que o usuário exija explicitamente o commit novamente.

**Objetivo:** mantendo a forma atual de entrada `ExitPlanMode({ plan, allowedPrompts? })`, fazer com que o plan aprovado seja gravado de forma síncrona em `.zcode/plans/*.md` sob o workspace e, após um compact bem-sucedido, persistir a restauração do plan completo por meio de `plan_file_reference`, garantindo que o plan não se perca após compact/resume.

**Arquitetura:** esta é uma solução mínima de transição para garantir a continuidade de `plan_file_reference`, sem uma reformulação completa do schema visível ao provider. Depois que `ExitPlanMode` é aprovado, o tool handler grava o plan file determinístico através do `FileSystemPort.writeTextFile({ createParents: true, atomic: true })` existente; `compactActiveConversation()` lê o mesmo arquivo ao construir `postCompactReminderEntries` e acrescenta o reminder model-only `plan_file_reference`, reutilizando o caminho existente de persistência atômica de compact summary/reminder. Sessões sem plan file não recebem esse reminder.

**Atualização de review:** a implementação final converge, conforme o feedback de review, o efeito do plan file visível ao provider: `plan_file_reference` usa texto fixo, o plan file grava a string `plan` original e falha ao salvar não bloqueia a saída do plan mode já aprovado. Os trechos de código nas etapas iniciais abaixo são mantidos apenas como rastro de implementação; o contrato final é o de `docs/plan-mode-plan-file-compact-continuity.md` e o código-fonte.

**Stack Tecnológico:** TypeScript, Vitest, runtime core do ZCode, `FileSystemPort`, registro de fontes de system reminder, E2E de conversation-session do desktop via WDIO, fluxo de promoção de fixtures com revisão manual.

## Restrições Globais

- Este plano implementa apenas o pequeno hack de continuidade do plan após compact/resume; não remove o `ExitPlanMode.plan` visível ao provider, não adiciona runtime injected input, não altera o schema do permission broker e não implementa a reformulação completa do schema de plan-file.
- O caminho do plan file é fixo em `${workspaceRoot}/.zcode/plans/plan-${sanitizedSessionId}.md`; a semântica de caminho usa `workspaceRoot`, e não `workingDirectory`, que muda com `cd` do Bash.
- A gravação do plan file deve acontecer depois da aprovação do usuário e do input final de plan; salva a string `plan` original, sem trim nem quebra de linha acrescentada. Falha ao salvar não bloqueia `sessionModePort.exitPlanMode()`.
- O compact só acrescenta `plan_file_reference` quando o plan file determinístico existir e tiver conteúdo não vazio; uma sessão comum sem plan file não pode falhar no compact por causa da leitura de um arquivo ausente.
- O conteúdo de `plan_file_reference` deve conter o texto fixo: `A plan file exists from plan mode at: ${planFilePath}`, `Plan contents:`, o corpo completo do plan e `If this plan is relevant to the current work and not already complete, continue working on it.`.
- Não misturar o plan file ao generic read-state reminder; manter o skip guard de `compact-post-reminders.ts` para `docs/superpowers/plans/`.
- Não alterar a arquitetura de controle desktop/web/remoto, não adicionar estado de negócio em relay/main e não mudar a semântica de queue/stream/snapshot.
- Para novas funcionalidades, escrever primeiro docs/spec, depois os testes, e só então o código.
- Ao final, é obrigatório executar testes direcionados, a verificação visual da janela do conversation E2E, `typecheck:e2e`, `pnpm typecheck` e `pnpm lint`; não fazer commit automático.

---

## Estrutura de Arquivos

- Criar: `docs/plan-mode-plan-file-compact-continuity.md`
  - Registra os limites de produto do pequeno hack atual, o contrato de caminho, o contrato do reminder de compact e os não objetivos.
- Modificar: `apps/zcode-cli/docs/design/v2/tool/16-plan-mode.md`
  - Atualiza a descrição atual do design de plan mode do ZCode: `ExitPlanMode.plan` permanece, mas após a aprovação o plan file é gravado e, após o compact, é restaurado com `plan_file_reference`.
- Criar: `apps/zcode-cli/packages/core/src/runtime/helpers/plan-file-continuity.ts`
  - Encapsula o caminho do plan file, a escrita, a leitura e a construção da entry `plan_file_reference`.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/helpers/index.ts`
  - Exporta `plan-file-continuity.ts`.
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode.ts`
  - Depois que `ExitPlanMode` é aprovado, grava o plan file em best-effort e só então sai do plan mode; falha na gravação não bloqueia a saída.
- Modificar: `apps/zcode-cli/packages/core/src/system-reminder/source.ts`
  - Nova source persistida: `plan_file_reference`.
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
  - Em compact bem-sucedido, coloca a plan file reference entry em `postCompactReminderEntries`, antes dos read-state reminders.
- Criar: `apps/zcode-cli/packages/core/tests/plan-file-continuity.test.ts`
  - Cobre caminho, escrita, leitura e corpo do reminder.
- Modificar: `apps/zcode-cli/packages/core/tests/plan-mode-tool.test.ts`
  - Cobre a gravação do plan file após a aprovação de `ExitPlanMode` e a saída do plan mode mesmo quando a gravação falha.
- Modificar: `apps/zcode-cli/packages/core/tests/system-reminder-source.test.ts`
  - Cobre o agrupamento de source, o descriptor e o wrapper de `plan_file_reference`.
- Modificar: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`
  - Cobre que o runtime history/provider context após o compact contém o `plan_file_reference` com o plan completo.
- Modificar: `docs/conversation-session-case-catalog.md`
  - Novo caso accepted de plan approval + compact continuity.
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`
  - Nova abreviatura de teste e mapeamento de cobertura.
- Criar: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-plan-file-compact-continuity.test.ts`
  - Valida, por uma janela real do desktop, plan approval, gravação do plan file, `/compact` e a continuidade do plan na requisição seguinte ao provider.
- Após a revisão manual, mover: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-plan-file-compact-continuity.test.ts` -> `packages/desktop/test/e2e/conversation-session/conversation-session-plan-file-compact-continuity.test.ts`
  - A movimentação e a geração do scaffolding são feitas com `pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-plan-file-compact-continuity.test.ts --reviewed --apply`.

---

## Fase 0: Spec primeiro

### Tarefa 0.1: Escrever o feature spec e fixar os limites do pequeno hack

**Arquivos:**
- Criar: `docs/plan-mode-plan-file-compact-continuity.md`
- Modificar: `apps/zcode-cli/docs/design/v2/tool/16-plan-mode.md`

**Interfaces:**
- Consome: o `ExitPlanModeInputSchema` atual ainda exige `plan: string`.
- Produz: o contrato de caminho do plan file e o contrato do corpo do reminder que a implementação seguinte deve respeitar.

- [ ] **Etapa 1: Criar o feature spec**

Crie `docs/plan-mode-plan-file-compact-continuity.md` com este conteúdo:

```markdown
# Plan Mode Plan File Compact Continuity

## Contexto

Atualmente, o `ExitPlanMode` do ZCode ainda carrega o plan completo pelo campo `plan` do tool input. Se um compact for disparado logo após a aprovação de `ExitPlanMode`, o summary pode não preservar o plan completo, e após compact/resume o modelo não consegue recuperar de forma estável o plan já aprovado.

## Objetivo

O `ExitPlanMode.plan` aprovado deve ser gravado de forma síncrona em um plan file determinístico sob a raiz do workspace. Após um compact bem-sucedido, o runtime deve persistir o caminho e o conteúdo completo desse plan file como um reminder model-only `plan_file_reference` no histórico posterior ao compact.

## Contrato de caminho

O caminho do plan file é:

```text
${workspaceRoot}/.zcode/plans/plan-${sanitizedSessionId}.md
```

`workspaceRoot` representa o caminho da raiz do workspace; não é permitido usar `workingDirectory`, que pode mudar com `cd` do Bash. `sanitizedSessionId` mantém apenas `A-Z`, `a-z`, `0-9`, `.`, `_`, `-`; os demais caracteres viram `-`, e os `-` iniciais e finais são removidos.

## Contrato de escrita

`ExitPlanMode` grava o plan file depois que o usuário aprova e que o input final retornado pelo permission broker é aplicado. A gravação usa `FileSystemPort.writeTextFile()`, e os parâmetros devem incluir `createParents: true`, `atomic: true` e `encoding: "utf8"`. Se a gravação falhar, `ExitPlanMode` falha e a sessão permanece em plan mode.

## Contrato de compact

Após um compact bem-sucedido, se o plan file determinístico existir e não estiver vazio, o runtime acrescenta em `postCompactReminderEntries` um reminder model-only com source `plan_file_reference`, no seguinte formato:

```text
A plan file exists from plan mode at: ${planFilePath}

${planContent}
```

Esse reminder vem antes dos generic read-state reminders e é persistido junto com o compact summary pelo `persistCompactSummary()` existente; se qualquer passo da persistência falhar, vale o rollback de persistência de compact já existente.

## Não objetivos

- Não alterar o input schema de `ExitPlanMode` visível ao provider.
- Não implementar `plan` / `planFilePath` injetados pelo runtime.
- Não alterar o output shape de `ExitPlanMode`.
- Não adicionar exibição na UI.
- Não adicionar o plan file ao generic read-state reminder.
- Não tratar a recuperação após o usuário apagar manualmente `.zcode/plans`.
```

- [ ] **Etapa 2: Atualizar o documento de design do plan mode**

Em `apps/zcode-cli/docs/design/v2/tool/16-plan-mode.md`, mantenha a afirmação atual de que o `ExitPlanMode` do ZCode recebe `plan` no tool input e acrescente uma subseção chamada `Continuidade do plan file após a aprovação` contendo:

```markdown
### Continuidade do plan file após a aprovação

A implementação transitória atual ainda preserva a forma de input visível ao provider `ExitPlanMode({ plan, allowedPrompts? })`. Após a aprovação, o runtime grava o plan final aprovado em `.zcode/plans/plan-${sanitizedSessionId}.md` sob a raiz do workspace.

Este arquivo não é um novo input visível ao provider nem uma reformulação completa do schema de plan-file; ele existe apenas para a continuidade de compact/resume. Quando o compact é concluído com sucesso, se o plan file existir e não estiver vazio, o runtime persiste um reminder model-only `plan_file_reference` no histórico posterior ao compact:

```text
A plan file exists from plan mode at: ${planFilePath}

${planContent}
```

Assim, mesmo que o compact ocorra imediatamente após `ExitPlanMode`, o próximo contexto de provider após a retomada ainda obtém o plano aprovado completo.
```

- [ ] **Etapa 3: Verificar que o spec não se expandiu para uma reformulação completa do schema de plan-file**

Execute:

```bash
rg -n "runtime injected|provider-visible.*allowedPrompts|remove.*plan|filePath output|EnterPlanMode.*draft|schema parity" docs/plan-mode-plan-file-compact-continuity.md apps/zcode-cli/docs/design/v2/tool/16-plan-mode.md
```

Esperado: nenhuma linha que exija remover o `plan` visível ao provider ou adicionar input injetado. Linhas dentro da seção de não objetivos são aceitáveis apenas quando dizem explicitamente que o item não é implementado.

---

## Fase 1: Helper de Plan File

### Tarefa 1.1: Escrever primeiro os testes unitários do helper de plan-file continuity

**Arquivos:**
- Criar: `apps/zcode-cli/packages/core/tests/plan-file-continuity.test.ts`
- Usar existente: `apps/zcode-cli/packages/core/tests/memory-test-utils.ts`

**Interfaces:**
- Produz as assinaturas esperadas:
  - `resolveApprovedPlanFilePath(input: { sessionId: string; workspaceRoot: string }): string`
  - `writeApprovedPlanFile(input: { abortSignal?: AbortSignal; fileSystemPort: FileSystemPort; plan: string; sessionId: string; traceContext?: TraceContext; workspaceRoot: string }): Promise<{ path: string }>`
  - `readApprovedPlanFileReferenceEntry(input: { abortSignal?: AbortSignal; fileSystemPort: FileSystemPort; sessionId: string; traceContext?: TraceContext; workspaceRoot: string }): Promise<RuntimeMessageEntry | undefined>`
  - `formatPlanFileReference(input: { planContent: string; planFilePath: string }): string`

- [ ] **Etapa 1: Adicionar testes de helper que falham**

Crie `apps/zcode-cli/packages/core/tests/plan-file-continuity.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createRootTraceContext, createSessionId } from "@zcode/contracts";
import { MemoryFileSystem } from "./memory-test-utils.js";
import {
  formatPlanFileReference,
  readApprovedPlanFileReferenceEntry,
  resolveApprovedPlanFilePath,
  writeApprovedPlanFile,
} from "../src/runtime/helpers/plan-file-continuity.js";

describe("plan file continuity", () => {
  it("resolves approved plan file under workspace root with sanitized session id", () => {
    const path = resolveApprovedPlanFilePath({
      sessionId: "session:with/slashes",
      workspaceRoot: "/workspace/project",
    });

    expect(path.replace(/\\/g, "/")).toBe(
      "/workspace/project/.zcode/plans/plan-session-with-slashes.md",
    );
  });

  it("writes the approved plan through FileSystemPort using the deterministic path", async () => {
    const fileSystemPort = new MemoryFileSystem({});
    const sessionId = createSessionId("plan-file-write");
    const traceContext = createRootTraceContext({ sessionId, turnId: "turn-plan-file-write" });

    const result = await writeApprovedPlanFile({
      fileSystemPort,
      plan: "1. Read current code\n2. Add compact reminder",
      sessionId,
      traceContext,
      workspaceRoot: "/workspace/project",
    });

    expect(result.path.replace(/\\/g, "/")).toBe(
      "/workspace/project/.zcode/plans/plan-plan-file-write.md",
    );
    expect(fileSystemPort.files[result.path]).toBe(
      "1. Read current code\n2. Add compact reminder",
    );
  });

  it("formats the plan_file_reference reminder body", () => {
    expect(
      formatPlanFileReference({
        planFilePath: "/workspace/project/.zcode/plans/plan-session.md",
        planContent: "1. Keep the approved plan\n2. Verify after compact",
      }),
    ).toBe(
      [
        "A plan file exists from plan mode at: /workspace/project/.zcode/plans/plan-session.md",
        "",
        "1. Keep the approved plan\n2. Verify after compact",
      ].join("\n"),
    );
  });

  it("returns a model-only plan_file_reference entry when the plan file exists", async () => {
    const sessionId = createSessionId("plan-file-reference");
    const fileSystemPort = new MemoryFileSystem({
      "/workspace/project/.zcode/plans/plan-plan-file-reference.md":
        "1. Preserve plan marker E2E_PLAN_FILE_CONTINUITY",
    });

    const entry = await readApprovedPlanFileReferenceEntry({
      fileSystemPort,
      sessionId,
      workspaceRoot: "/workspace/project",
    });

    expect(entry).toMatchObject({
      content: expect.stringContaining("A plan file exists from plan mode at:"),
      metadata: { source: "plan_file_reference" },
    });
    expect(entry?.content).toContain("E2E_PLAN_FILE_CONTINUITY");
  });

  it("returns undefined when the deterministic plan file does not exist", async () => {
    const entry = await readApprovedPlanFileReferenceEntry({
      fileSystemPort: new MemoryFileSystem({}),
      sessionId: createSessionId("no-plan-file"),
      workspaceRoot: "/workspace/project",
    });

    expect(entry).toBeUndefined();
  });
});
```

- [ ] **Etapa 2: Executar os testes do helper e confirmar que falham porque o helper não existe**

Execute:

```bash
pnpm --filter @zcode/core test -- plan-file-continuity.test.ts
```

Esperado: FAIL com erro de resolução de módulo para `../src/runtime/helpers/plan-file-continuity.js`.

### Tarefa 1.2: Implementar o helper de plan-file continuity

**Arquivos:**
- Criar: `apps/zcode-cli/packages/core/src/runtime/helpers/plan-file-continuity.ts`
- Modificar: `apps/zcode-cli/packages/core/src/runtime/helpers/index.ts`

**Interfaces:**
- Consome: `FileSystemPort`, `PLAN_MODE_MAX_PLAN_CHARS`, `systemReminderAttachmentEntry`.
- Produz: as quatro funções de helper usadas pela Tarefa 1.1 e pelas fases seguintes.

- [ ] **Etapa 1: Adicionar a implementação do helper**

Crie `apps/zcode-cli/packages/core/src/runtime/helpers/plan-file-continuity.ts`:

```ts
import { join } from "node:path";
import {
  CoreErrorType,
  PLAN_MODE_MAX_PLAN_CHARS,
  createCoreError,
  isFileSystemPortError,
  type FileSystemPort,
  type SessionId,
  type TraceContext,
} from "@zcode/contracts";
import {
  systemReminderAttachmentEntry,
  type RuntimeMessageEntry,
} from "../../agent/message-history.js";

const PLAN_FILE_REFERENCE_MAX_BYTES = PLAN_MODE_MAX_PLAN_CHARS * 4 + 1024;

export function resolveApprovedPlanFilePath(input: {
  sessionId: SessionId | string;
  workspaceRoot: string;
}): string {
  return join(
    input.workspaceRoot,
    ".zcode",
    "plans",
    `plan-${sanitizePlanFileSessionId(input.sessionId)}.md`,
  );
}

export async function writeApprovedPlanFile(input: {
  abortSignal?: AbortSignal;
  fileSystemPort: FileSystemPort;
  plan: string;
  sessionId: SessionId | string;
  traceContext?: TraceContext;
  workspaceRoot: string;
}): Promise<{ path: string }> {
  const plan = input.plan.trim();
  if (!plan) {
    throw createCoreError(CoreErrorType.InvalidInput, "ExitPlanMode plan cannot be empty", {
      recoverable: true,
    });
  }

  const path = resolveApprovedPlanFilePath(input);
  await input.fileSystemPort.writeTextFile(
    {
      atomic: true,
      content: plan,
      createParents: true,
      encoding: "utf8",
      path,
      trace: input.traceContext,
    },
    { signal: input.abortSignal },
  );
  return { path };
}

export async function readApprovedPlanFileReferenceEntry(input: {
  abortSignal?: AbortSignal;
  fileSystemPort: FileSystemPort;
  sessionId: SessionId | string;
  traceContext?: TraceContext;
  workspaceRoot: string;
}): Promise<RuntimeMessageEntry | undefined> {
  const path = resolveApprovedPlanFilePath(input);
  let content: string;
  try {
    const read = await input.fileSystemPort.readTextFile(
      {
        maxBytes: PLAN_FILE_REFERENCE_MAX_BYTES,
        path,
        trace: input.traceContext,
      },
      { signal: input.abortSignal },
    );
    content = read.content.trim();
  } catch (error) {
    if (isFileSystemPortError(error) && error.code === "not_found") {
      return undefined;
    }
    throw error;
  }

  if (!content) return undefined;
  return systemReminderAttachmentEntry(
    "plan_file_reference",
    formatPlanFileReference({ planContent: content, planFilePath: path }),
  );
}

export function formatPlanFileReference(input: {
  planContent: string;
  planFilePath: string;
}): string {
  return [
    `A plan file exists from plan mode at: ${input.planFilePath}`,
    "",
    input.planContent,
  ].join("\n");
}

function sanitizePlanFileSessionId(sessionId: SessionId | string): string {
  const sanitized = String(sessionId)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (!sanitized) {
    throw createCoreError(CoreErrorType.InvalidInput, "Session id cannot produce a plan file name", {
      recoverable: false,
    });
  }
  return sanitized;
}
```

- [ ] **Etapa 2: Exportar o helper**

Acrescente ao final de `apps/zcode-cli/packages/core/src/runtime/helpers/index.ts`:

```ts
export * from "./plan-file-continuity.js";
```

- [ ] **Etapa 3: Executar os testes do helper e confirmar que passam**

Execute:

```bash
pnpm --filter @zcode/core test -- plan-file-continuity.test.ts
```

Esperado: PASS nos cinco testes.

---

## Fase 2: ExitPlanMode grava o Plan File

### Tarefa 2.1: Escrever primeiro os testes de gravação/falha do ExitPlanMode

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/tests/plan-mode-tool.test.ts`

**Interfaces:**
- Consome: `writeApprovedPlanFile()` da Fase 1.
- Produz: o caminho aprovado de `ExitPlanMode` grava o plan final modificado pelo broker antes de sair do plan mode.

- [ ] **Etapa 1: Estender o helper de teste para passar FileSystemPort e caminhos de workspace**

No tipo de input do helper de teste `createPlanModeExecutor()`, acrescente:

```ts
  fileSystemPort?: import("@zcode/contracts").FileSystemPort;
  workingDirectory?: string;
  workspaceRoot?: string;
```

Na chamada `createToolExecutor()`, passe:

```ts
    fileSystemPort: input.fileSystemPort,
    workingDirectory: input.workingDirectory ?? "/workspace/project",
    workspaceRoot: input.workspaceRoot ?? "/workspace/project",
```

- [ ] **Etapa 2: Atualizar o teste de aprovação existente para verificar o conteúdo final do plan file modificado**

No teste existente chamado `requests approval before exiting plan mode and returns the approved plan`, crie um sistema de arquivos em memória antes do executor:

```ts
    const fileSystemPort = new MemoryFileSystem({});
```

Passe-o para `createPlanModeExecutor({ ... })`:

```ts
      fileSystemPort,
      workspaceRoot: "/workspace/project",
```

Depois das verificações existentes de output/modelContent, acrescente:

```ts
    expect(
      fileSystemPort.files[
        "/workspace/project/.zcode/plans/plan-exit-plan-mode.md"
      ],
    ).toBe("1. Update the service boundary\n2. Add tests");
```

Acrescente o import perto do topo:

```ts
import { MemoryFileSystem } from "./memory-test-utils.js";
```

- [ ] **Etapa 3: Adicionar teste de falha de gravação**

Acrescente este teste em `describe("plan mode tools", ...)`:

```ts
  it("does not exit plan mode when approved plan file write fails", async () => {
    const sessionId = createSessionId("exit-plan-write-fails");
    const turnId = createTurnId("exit-plan-write-fails");
    const traceContext = createRootTraceContext({ sessionId, turnId });
    const events: SessionEvent[] = [];
    let mode: CollaborationMode = "plan";
    let prePlanMode: Exclude<CollaborationMode, "plan"> | undefined = "build";
    const sessionModePort = createSessionModePort({
      getMode: () => mode,
      getPrePlanMode: () => prePlanMode,
      setMode: (nextMode) => {
        mode = nextMode;
      },
      setPrePlanMode: (nextMode) => {
        prePlanMode = nextMode;
      },
    });
    const permissionBroker: PermissionBrokerPort = {
      async requestPermission() {
        return { decision: "allow", reason: "approved" };
      },
    };
    const fileSystemPort = {
      ...new MemoryFileSystem({}),
      async writeTextFile() {
        throw new Error("disk is read-only for plan file");
      },
    };

    const result = await createPlanModeExecutor({
      events,
      fileSystemPort,
      mode: () => mode,
      permissionBroker,
      sessionId,
      sessionModePort,
      traceContext,
      turnId,
      workspaceRoot: "/workspace/project",
    }).execute(
      {
        id: createToolCallId("exit-plan-write-fails"),
        input: {
          plan: "1. This plan should not exit if file persistence fails.",
        },
        name: "ExitPlanMode",
      },
      { traceContext },
    );

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain("disk is read-only for plan file");
    expect(mode).toBe("plan");
    expect(prePlanMode).toBe("build");
  });
```

- [ ] **Etapa 4: Executar os testes direcionados e confirmar que as novas asserções falham**

Execute:

```bash
pnpm --filter @zcode/core test -- plan-mode-tool.test.ts
```

Esperado: FAIL porque `ExitPlanMode` ainda não grava o plan file.

### Tarefa 2.2: Gravar o approved plan file e só então sair do plan mode

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode.ts`

**Interfaces:**
- Consome: `writeApprovedPlanFile()`.
- Produz: `ExitPlanMode` preserva o output shape atual e grava o plan file antes de `sessionModePort.exitPlanMode()`.

- [ ] **Etapa 1: Importar o helper**

Em `apps/zcode-cli/packages/core/src/tool/handlers/plan-mode.ts`, acrescente:

```ts
import { writeApprovedPlanFile } from "../../runtime/helpers/plan-file-continuity.js";
```

- [ ] **Etapa 2: Adicionar helper de asserção de FileSystemPort**

Abaixo de `assertSessionModePort()`, acrescente:

```ts
function assertFileSystemPort(
  context: ToolExecutionContext,
): asserts context is ToolExecutionContext & {
  fileSystemPort: NonNullable<ToolExecutionContext["fileSystemPort"]>;
} {
  if (context.fileSystemPort) return;

  throw createCoreError(
    CoreErrorType.ConfigurationError,
    "FileSystemPort is not configured for ExitPlanMode plan file persistence",
    {
      context: {
        toolCallId: context.toolCallId,
        toolName: EXIT_PLAN_MODE_TOOL_NAME,
      },
      recoverable: false,
    },
  );
}
```

- [ ] **Etapa 3: Gravar o plan antes da transição de modo**

Em `exitPlanModeHandler`, depois da verificação de modo e antes de `context.sessionModePort.exitPlanMode(...)`, insira:

```ts
  assertFileSystemPort(context);
  await writeApprovedPlanFile({
    abortSignal: context.abortSignal,
    fileSystemPort: context.fileSystemPort,
    plan: parsed.plan,
    sessionId: context.sessionId,
    traceContext: {
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId: context.parentSpanId,
      turnId: context.turnId,
    },
    workspaceRoot: context.workspaceRoot,
  });
```

- [ ] **Etapa 4: Executar os testes direcionados**

Execute:

```bash
pnpm --filter @zcode/core test -- plan-mode-tool.test.ts plan-file-continuity.test.ts
```

Esperado: PASS. O output shape existente ainda inclui `plan`, `approved`, `previousMode`, `mode` e `allowedPrompts`; nenhum campo de output `planFilePath` é introduzido.

---

## Fase 3: Registro de Source `plan_file_reference`

### Tarefa 3.1: Escrever primeiro os testes de source de system reminder

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/tests/system-reminder-source.test.ts`

**Interfaces:**
- Produz: `plan_file_reference` como source de reminder meta, provider-visible, persistido, de `history_continuity` / `resume_history`.

- [ ] **Etapa 1: Adicionar a source à lista esperada e às asserções do bucket persistido**

Em `EXPECTED_SOURCES`, insira `"plan_file_reference"` imediatamente depois de `"resume_referenced_session_context"`.

Na asserção `SYSTEM_REMINDER_PERSISTED_SOURCES`, insira `"plan_file_reference"` imediatamente depois de `"resume_referenced_session_context"`.

- [ ] **Etapa 2: Adicionar asserção explícita de descriptor**

Acrescente esta asserção ao teste chamado `classifies sources by explicit source instead of reminder text`:

```ts
    expect(getSystemReminderDescriptor("plan_file_reference")).toMatchObject({
      channel: "history_continuity",
      evidenceLabel: "sr.plan_file_reference",
      isMeta: true,
      lifecycle: "resume_history",
      providerVisibility: "provider_visible",
    });
```

- [ ] **Etapa 3: Adicionar asserção de wrapper**

Acrescente:

```ts
  it("wraps plan_file_reference without nested reminder metadata", () => {
    const reminder = wrapSystemReminderForSource(
      "plan_file_reference",
      "A plan file exists from plan mode at: /workspace/.zcode/plans/plan-session.md\n\n1. approved plan",
    );

    expectExactlyOneSystemReminderWrapper(reminder);
    expect(reminder).toContain("A plan file exists from plan mode at:");
    expect(reminder).toContain("1. approved plan");
  });
```

- [ ] **Etapa 4: Executar os testes de source e confirmar a falha**

Execute:

```bash
pnpm --filter @zcode/core test -- system-reminder-source.test.ts
```

Esperado: FAIL porque `plan_file_reference` ainda não está registrada.

### Tarefa 3.2: Registrar `plan_file_reference`

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/src/system-reminder/source.ts`

**Interfaces:**
- Consome: source de metadados da entry de reminder de compact persistida.
- Produz: descriptor de source utilizável pela projeção para o provider e pela hidratação de reminder model-only persistido.

- [ ] **Etapa 1: Adicionar a source persistida**

Em `SYSTEM_REMINDER_PERSISTED_SOURCES`, insira:

```ts
  "plan_file_reference",
```

imediatamente depois de:

```ts
  "resume_referenced_session_context",
```

- [ ] **Etapa 2: Manter o comportamento não-MCS alinhado aos reminders de continuidade de resume**

Em `NON_MID_CONVERSATION_SYSTEM_SOURCES`, insira:

```ts
  "plan_file_reference",
```

imediatamente depois de:

```ts
  "resume_referenced_session_context",
```

Isso mantém o reminder projetado pelo mesmo caminho não-mid-conversation do contexto atual de continuidade de resume.

- [ ] **Etapa 3: Adicionar o descriptor**

Em `SYSTEM_REMINDER_DESCRIPTORS`, acrescente:

```ts
  plan_file_reference: descriptor(
    "history_continuity",
    "resume_history",
    true,
    "sr.plan_file_reference",
  ),
```

imediatamente depois de `resume_referenced_session_context`.

- [ ] **Etapa 4: Executar os testes de source**

Execute:

```bash
pnpm --filter @zcode/core test -- system-reminder-source.test.ts
```

Esperado: PASS.

---

## Fase 4: Injetar Plan Reference após o Compact

### Tarefa 4.1: Escrever primeiro o teste de regressão de compact do runtime

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`

**Interfaces:**
- Consome: `readApprovedPlanFileReferenceEntry()`.
- Produz: após o compact de um plan aprovado, `plan_file_reference` fica no histórico de runtime pós-compact e na próxima requisição ao provider.

- [ ] **Etapa 1: Adicionar teste de regressão perto dos testes existentes de post-compact reminder**

Em `apps/zcode-cli/packages/core/tests/runtime-compact.test.ts`, acrescente este import perto dos imports de helper de teste existentes:

```ts
import { MemoryFileSystem } from "./memory-test-utils.js";
```

Depois acrescente este teste perto dos testes existentes de post-compact read-state reminder:

```ts
it("persists approved plan file reference after compact so resume keeps the full plan", async () => {
  const sessionId = createSessionId("runtime-compact-plan-file-reference");
  const eventStore = createTestSessionEventStore();
  const store = createRecordingSessionStore();
  const requests: Array<{ messages: Array<{ content: unknown; role: string }> }> = [];
  const planMarker = "E2E_PLAN_FILE_COMPACT_CONTINUITY_MARKER";
  const fileSystemPort = new MemoryFileSystem({
    "/workspace/project/.zcode/plans/plan-runtime-compact-plan-file-reference.md":
      `1. Preserve ${planMarker}\n2. Continue after compact`,
  });
  const modelAdapter = {
    async generateText(request: { messages: Array<{ content: unknown; role: string }> }) {
      requests.push({ messages: request.messages });
      return {
        finishReason: "stop",
        model: request.model,
        text: "<summary>Compact summary keeps older conversation short.</summary>",
        usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110 },
      };
    },
  };

  const runtime = new AgentRuntime(
    sessionId,
    {
      systemPrompt: "You are a compact plan-file reference test agent.",
      workingDirectory: "/workspace/project",
    },
    {
      eventStore,
      fileSystemPort,
      modelAdapter: modelAdapter as never,
      sessionStore: store,
    },
  );

  await runtime.executeTurn("first setup before plan approval");
  await runtime.executeTurn("second setup before compact");

  const runtimeInternals = runtime as unknown as {
    compactActiveConversation(
      customInstructions: string | undefined,
      traceContext: { traceId: string },
      events: unknown[],
      options: {
        compactReason: CompactReason;
        phase: CompactPhase;
        trigger: CompactTrigger;
      },
    ): Promise<unknown>;
  };

  await runtimeInternals.compactActiveConversation(
    undefined,
    { traceId: "trace-plan-file-compact-reference" },
    [],
    {
      compactReason: CompactReason.UserRequested,
      phase: CompactPhase.StandaloneTurn,
      trigger: CompactTrigger.Manual,
    },
  );

  const resumedRuntime = new AgentRuntime(
    sessionId,
    {
      systemPrompt: "You are a compact plan-file reference test agent.",
      workingDirectory: "/workspace/unused-before-resume",
    },
    {
      eventStore,
      fileSystemPort,
      modelAdapter: modelAdapter as never,
      sessionStore: store,
    },
  );

  await resumedRuntime.resumeFromStore();
  await resumedRuntime.executeTurn("continue after compact");

  const postResumeContext = requests
    .at(-1)
    ?.messages.map((message) => message.content)
    .join("\n");

  expect(postResumeContext).toContain("A plan file exists from plan mode at:");
  expect(postResumeContext).toContain(planMarker);
});
```

- [ ] **Etapa 2: Executar o teste de compact e confirmar a falha**

Execute:

```bash
pnpm --filter @zcode/core test -- runtime-compact.test.ts -t "persists approved plan file reference after compact"
```

Esperado: FAIL porque hoje `compactActiveConversation()` apenas acrescenta read-state reminders.

### Tarefa 4.2: Acrescentar a plan file reference antes dos generic read-state reminders

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`

**Interfaces:**
- Consome: `readApprovedPlanFileReferenceEntry()`.
- Produz: `postCompactReminderEntries` inclui `plan_file_reference` primeiro quando o plan file existe.

- [ ] **Etapa 1: Importar o helper**

Em `compact-active.ts`, importe:

```ts
  readApprovedPlanFileReferenceEntry,
```

de `../helpers/index.js`.

- [ ] **Etapa 2: Construir a plan reference entry antes das read-state entries**

Substitua:

```ts
      const postCompactReminderEntries = buildPostCompactReadStateReminderEntries({
        preservedEntries,
        readFileState: this.readFileState,
      });
```

por:

```ts
      const planFileReferenceEntry = this.fileSystemPort
        ? await readApprovedPlanFileReferenceEntry({
            abortSignal: options.abortSignal,
            fileSystemPort: this.fileSystemPort,
            sessionId: this.sessionId,
            traceContext: modelTraceContext,
            workspaceRoot: this.workspaceRoot,
          })
        : undefined;
      const postCompactReminderEntries = [
        ...(planFileReferenceEntry ? [planFileReferenceEntry] : []),
        ...buildPostCompactReadStateReminderEntries({
          preservedEntries,
          readFileState: this.readFileState,
        }),
      ];
```

- [ ] **Etapa 3: Executar os testes de compact direcionados**

Execute:

```bash
pnpm --filter @zcode/core test -- runtime-compact.test.ts -t "persists approved plan file reference after compact"
```

Esperado: PASS.

- [ ] **Etapa 4: Executar a suíte direcionada de reminder/helper/plan-mode**

Execute:

```bash
pnpm --filter @zcode/core test -- plan-file-continuity.test.ts plan-mode-tool.test.ts system-reminder-source.test.ts runtime-compact.test.ts
```

Esperado: PASS nos quatro arquivos direcionados.

---

## Fase 5: Guardrails de Regressão

### Tarefa 5.1: Confirmar que o schema de tool visível ao provider não foi alterado pelo pequeno hack

**Arquivos:**
- Modificar: `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`

**Interfaces:**
- Consome: o `ExitPlanModeInputSchema` existente.
- Produz: uma proteção garantindo que o schema visível ao provider ainda expõe `plan` até o início do trabalho completo de schema de plan-file.

- [ ] **Etapa 1: Adicionar ou atualizar a asserção de contrato de tool**

Na parte de plan mode de `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`, garanta que exista uma asserção equivalente a:

```ts
expect(exitPlanModeContract.inputSchema).toHaveProperty("properties.plan");
expect(exitPlanModeContract.inputSchema).not.toHaveProperty("properties.planFilePath");
expect(exitPlanModeContract.inputSchema).not.toHaveProperty("properties.filePath");
```

- [ ] **Etapa 2: Executar o teste de contrato**

Execute:

```bash
pnpm --filter @zcode/core test -- tool-contracts.test.ts
```

Esperado: PASS. Qualquer falha bloqueia a conclusão até que sua origem seja identificada; não edite arquivos sem relação enquanto diagnostica este gate.

### Tarefa 5.2: Verificação de evidência de compact visível ao provider

**Arquivos:**
- Nenhuma alteração de arquivo.

**Interfaces:**
- Produz: evidência de que a aceitação está no contexto do provider, e não apenas na saída do helper.

- [ ] **Etapa 1: Inspecionar a saída do teste de compact direcionado**

Execute:

```bash
pnpm --filter @zcode/core test -- runtime-compact.test.ts -t "persists approved plan file reference after compact" --reporter verbose
```

Esperado: PASS. A asserção precisa inspecionar as mensagens da requisição ao provider após a retomada e deve conter tanto `A plan file exists from plan mode at:` quanto `E2E_PLAN_FILE_COMPACT_CONTINUITY_MARKER`.

---

## Fase 6: Spec de Conversation E2E e Validação Visual da Janela

### Tarefa 6.1: Completar primeiro o catálogo e a matriz de cobertura

**Arquivos:**
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`

**Interfaces:**
- Produz: caso de produto accepted antes do código E2E, como exige o fluxo de conversation-session.

- [ ] **Etapa 1: Adicionar o caso ao catálogo**

Em `docs/conversation-session-case-catalog.md`, adicione uma nova linha accepted na área de plan approval / tool interaction com estes campos:

```markdown
| P01 | fluxo `completed(success)` ou `plan`, em que o usuário aprova `ExitPlanMode` e dispara `/compact` imediatamente depois | approve plan -> `/compact` -> resume/continue | planFileReferenceAfterCompact | o plan aprovado é gravado em `.zcode/plans/plan-${sessionId}.md`; após o compact bem-sucedido, o contexto do provider seguinte contém o caminho `plan_file_reference` e o conteúdo completo do plan; nenhum banner de erro aparece na UI e a sessão pode concluir o próximo turno | accepted |
```

Antes de editar, execute:

```bash
rg -n "^\\| P01 \\|" docs/conversation-session-case-catalog.md docs/testing/conversation-session-e2e-coverage-matrix.md
```

Esperado: nenhuma saída. Uma correspondência significa que o ID de plano já está ocupado e a implementação deve parar para uma decisão do usuário, em vez de inventar outro ID.

- [ ] **Etapa 2: Adicionar a abreviatura na matriz**

Em `docs/testing/conversation-session-e2e-coverage-matrix.md`, acrescente:

```markdown
| `PFC` | `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-plan-file-compact-continuity.test.ts` |
```

Depois acrescente a linha de cobertura para o ID de catálogo escolhido acima:

```markdown
| P01 | covered | PFC | manual-review pending: a janela visível valida a aprovação do plan, a gravação do plan file, o compact manual concluído e a presença de `plan_file_reference` e do plan marker único na requisição seguinte ao provider; após a aprovação do review, o spec é movido para o conversation E2E padrão |
```

- [ ] **Etapa 3: Executar a auditoria de cobertura**

Execute:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --json
```

Esperado: PASS. Se a auditoria relatar divergência de contagem, atualize as estatísticas da matriz com as contagens exatas impressas pela auditoria e repita este comando até passar.

### Tarefa 6.2: Escrever o E2E pending de revisão manual

**Arquivos:**
- Criar: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-plan-file-compact-continuity.test.ts`

**Interfaces:**
- Consome: helpers existentes de `conversation-session-plan-approval-feedback-user-message.test.ts` e `conversation-session-compact.test.ts`.
- Produz: um E2E que conduz a janela visível do desktop e verifica a continuidade do plan após o compact.

- [ ] **Etapa 1: Criar o spec de E2E**

Crie `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-plan-file-compact-continuity.test.ts`:

```ts
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  DEFAULT_WORKSPACE,
  clearAppData,
} from "../../../helpers/desktop-app.js";
import {
  prepareConversationE2E,
  sendPrompt,
  waitForAssistantMessageContaining,
  waitForComposerText,
  waitForUpstreamRequest,
  waitForToolCallBlockByToolName,
  waitForUserMessageContaining,
} from "../../../helpers/conversation-session.js";

const PROMPT_MARKER = "E2E_PLAN_FILE_COMPACT_CONTINUITY_PROMPT";
const PLAN_MARKER = "E2E_PLAN_FILE_COMPACT_CONTINUITY_MARKER";
const ENTER_MARKER = "E2E_PLAN_FILE_COMPACT_CONTINUITY_ENTER";
const EXIT_MARKER = "E2E_PLAN_FILE_COMPACT_CONTINUITY_EXIT";
const COMPACT_COMMAND = "/compact";

describe("conversation session plan file compact continuity", () => {
  after(async () => {
    await browser.electron.restoreAllMocks();
    await clearAppData();
  });

  it("keeps approved ExitPlanMode plan available after manual compact", async function () {
    this.timeout(180000);

    await prepareConversationE2E();

    const runId = Date.now();
    const prompt = [
      `${PROMPT_MARKER}_${runId}: enter plan mode and request approval.`,
      `${ENTER_MARKER}: call EnterPlanMode before drafting.`,
      `${EXIT_MARKER}: call ExitPlanMode with an implementation plan containing ${PLAN_MARKER}_${runId}.`,
    ].join(" ");

    await sendPrompt(prompt);
    await waitForComposerText("", "composer should clear after sending plan prompt");
    await waitForUserMessageContaining(PROMPT_MARKER);

    await waitForUpstreamRequest(
      {
        includes: [PROMPT_MARKER, ENTER_MARKER, EXIT_MARKER],
        excludes: ["Generate a concise title", "CRITICAL: Respond with TEXT ONLY"],
      },
      "initial plan mode request",
      60000,
    );
    await waitForToolCallBlockByToolName("EnterPlanMode", 60000);

    await waitForUpstreamRequest(
      {
        includes: [EXIT_MARKER, "toolu_e2e_plan_approval_enter_plan_mode"],
        excludes: ["Generate a concise title", "CRITICAL: Respond with TEXT ONLY"],
      },
      "exit plan mode request",
      60000,
    );
    await waitForToolCallBlockByToolName("ExitPlanMode", 60000);

    await approvePlan();
    await waitForAssistantMessageContaining("deepseek-e2e-ok");

    const planFile = await waitForPlanFileContaining(`${PLAN_MARKER}_${runId}`, 30000);
    expect(planFile.path).toContain(".zcode");
    expect(planFile.path).toContain("plans");

    await sendPrompt(COMPACT_COMMAND);
    await waitForComposerText("", "/compact should clear composer");
    await waitForUpstreamRequest(
      {
        includes: ["CRITICAL: Respond with TEXT ONLY"],
        excludes: ["Generate a concise title"],
      },
      "manual compact summary request",
      90000,
    );

    await sendPrompt(`continue after compact and mention ${PLAN_MARKER}_${runId}`);
    await waitForUpstreamRequest(
      {
        includes: [
          "A plan file exists from plan mode at:",
          `${PLAN_MARKER}_${runId}`,
        ],
        excludes: ["Generate a concise title", "CRITICAL: Respond with TEXT ONLY"],
      },
      "post compact continuation request",
      90000,
    );
    await waitForAssistantMessageContaining("deepseek-e2e-ok");
  });
});

async function approvePlan() {
  const approveButton = await $("//button[contains(., 'Approve') or contains(., '批准')]");
  await approveButton.waitForClickable({ timeout: 30000 });
  await approveButton.click();
}

async function waitForPlanFileContaining(
  marker: string,
  timeoutMs: number,
): Promise<{ content: string; path: string }> {
  let latestError = "";
  await browser.waitUntil(
    async () => {
      try {
        const result = await readLatestPlanFile();
        if (result.content.includes(marker)) return true;
        latestError = `latest plan file did not include marker: ${result.path}`;
        return false;
      } catch (error) {
        latestError = error instanceof Error ? error.message : String(error);
        return false;
      }
    },
    {
      timeout: timeoutMs,
      timeoutMsg: `Timed out waiting for plan file containing ${marker}: ${latestError}`,
    },
  );

  return readLatestPlanFile();
}

async function readLatestPlanFile(): Promise<{ content: string; path: string }> {
  const planDir = join(DEFAULT_WORKSPACE, ".zcode", "plans");
  const planFiles = await browser.electron.execute((dir) => {
    const { readdirSync, statSync } = require("node:fs");
    const { join } = require("node:path");
    return readdirSync(dir)
      .filter((name: string) => name.endsWith(".md"))
      .map((name: string) => {
        const path = join(dir, name);
        return { mtimeMs: statSync(path).mtimeMs, path };
      })
      .sort((left: { mtimeMs: number }, right: { mtimeMs: number }) => right.mtimeMs - left.mtimeMs);
  }, planDir);
  const latest = planFiles[0];
  if (!latest) throw new Error(`No plan file found under ${planDir}`);
  return {
    content: await readFile(latest.path, "utf8"),
    path: latest.path,
  };
}
```

- [ ] **Etapa 2: Executar a verificação de TypeScript do E2E**

Execute:

```bash
pnpm --filter @zcode/desktop typecheck:e2e
```

Esperado: PASS.

### Tarefa 6.3: Executar o E2E pending com janela visual e confirmar manualmente

**Arquivos:**
- Usa: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-plan-file-compact-continuity.test.ts`

**Interfaces:**
- Produz: evidência visual de que o diálogo de aprovação de plan, o marcador de compact e a conclusão final do assistente se comportam como esperado.

- [ ] **Etapa 1: Executar o E2E pending no modo visual/de revisão manual**

Execute:

```bash
ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/manual-review/pending/conversation-session-plan-file-compact-continuity.test.ts'
```

Esperado:
- Uma janela do app desktop abre.
- O chat visível mostra o prompt original do usuário.
- Os blocos de tool `EnterPlanMode` e `ExitPlanMode` são renderizados.
- O diálogo de aprovação de plan aparece e é aprovado pelo teste.
- Nenhum `ChatViewErrorBanner` ou `ChatErrorBanner` aparece.
- Após `/compact`, o marcador de compact chega a completed.
- A continuação final termina com uma mensagem do assistente contendo `deepseek-e2e-ok`.
- O processo de teste sai com PASS.

- [ ] **Etapa 2: Inspecionar os artefatos da execução visual**

Verifique o caminho de saída do E2E impresso pelo WDIO e confirme:

```bash
rg -n "A plan file exists from plan mode at:|E2E_PLAN_FILE_COMPACT_CONTINUITY_MARKER|ChatViewErrorBanner|ChatErrorBanner" packages/desktop/.e2e-artifacts packages/desktop/.e2e-home
```

Esperado:
- Pelo menos uma captura de provider contém `A plan file exists from plan mode at:`.
- Pelo menos uma captura de provider contém `E2E_PLAN_FILE_COMPACT_CONTINUITY_MARKER`.
- Nenhuma linha de artefato indica um `ChatViewErrorBanner` ou `ChatErrorBanner` visível para este caso positivo.

### Tarefa 6.4: Promover, preencher fixtures, reexecutar e rodar os gates finais

**Arquivos:**
- Mover após a aprovação visual:
  - De: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-plan-file-compact-continuity.test.ts`
  - Para: `packages/desktop/test/e2e/conversation-session/conversation-session-plan-file-compact-continuity.test.ts`
- Modificar após a movimentação:
  - `docs/testing/conversation-session-e2e-coverage-matrix.md`

**Interfaces:**
- Produz: cobertura estável de conversation E2E padrão e reexecução de fixtures.

- [ ] **Etapa 1: Mover o spec para fora do pending de revisão manual**

Execute:

```bash
pnpm --filter @zcode/desktop e2e:promote -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-plan-file-compact-continuity.test.ts --reviewed --apply
```

Esperado:
- o spec é movido para `packages/desktop/test/e2e/conversation-session/conversation-session-plan-file-compact-continuity.test.ts`;
- a promoção cria shells de fixture em `packages/desktop/test/e2e/fixtures/upstream/conversation-session/` e `packages/desktop/test/e2e/fixtures/cases/conversation-session/`;
- o caminho `PFC` na matriz de cobertura é atualizado para:

```markdown
| `PFC` | `packages/desktop/test/e2e/conversation-session/conversation-session-plan-file-compact-continuity.test.ts` |
```

Atualize a nota da linha de cobertura para remover `manual-review pending` e mencionar o id do artefato da execução visual verde da Etapa 6.3.

- [ ] **Etapa 2: Preencher a fixture determinística de reexecução a partir da captura revisada**

Abra o artefato de captura da execução visual impresso na Etapa 6.3 e classifique as requisições:

```bash
rg -n "E2E_PLAN_FILE_COMPACT_CONTINUITY|A plan file exists from plan mode at:|CRITICAL: Respond with TEXT ONLY|Generate a concise title" packages/desktop/.e2e-artifacts packages/desktop/.e2e-home
```

Escreva a fixture de provider local do caso em:

```text
packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-plan-file-compact-continuity.json
```

A fixture deve incluir exatamente estas requisições principais:
- requisição inicial de plan mode contendo `E2E_PLAN_FILE_COMPACT_CONTINUITY_PROMPT`;
- requisição de saída do plan mode contendo `E2E_PLAN_FILE_COMPACT_CONTINUITY_EXIT`;
- requisição de summary do compact manual contendo `CRITICAL: Respond with TEXT ONLY`;
- requisição de continuação pós-compact contendo `A plan file exists from plan mode at:` e `E2E_PLAN_FILE_COMPACT_CONTINUITY_MARKER`.

A fixture pode reutilizar `packages/desktop/test/e2e/fixtures/upstream/common.json` para as respostas de geração de título e não deve depender de fixtures de provider compartilhadas legadas para as quatro requisições principais.

- [ ] **Etapa 3: Verificar a consistência da fixture**

Execute:

```bash
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec './test/e2e/conversation-session/conversation-session-plan-file-compact-continuity.test.ts'
```

Esperado: PASS.

- [ ] **Etapa 4: Reexecutar o E2E promovido pelo WDIO**

Execute:

```bash
pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/conversation-session/conversation-session-plan-file-compact-continuity.test.ts'
```

Esperado: PASS. A reexecução precisa verificar `plan_file_reference` na requisição ao provider pós-compact, e não apenas a conclusão visível na UI.

- [ ] **Etapa 5: Executar a auditoria da documentação de conversation**

Execute:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --json
```

Esperado: PASS.

- [ ] **Etapa 6: Executar os gates finais obrigatórios**

Execute:

```bash
pnpm --filter @zcode/core test -- plan-file-continuity.test.ts plan-mode-tool.test.ts system-reminder-source.test.ts runtime-compact.test.ts
pnpm --filter @zcode/desktop typecheck:e2e
pnpm typecheck
pnpm lint
```

Esperado:
- Testes core direcionados PASS.
- Typecheck do E2E PASS.
- Typecheck do repositório PASS.
- Lint do repositório PASS.

- [ ] **Etapa 7: Parar sem commitar**

Execute:

```bash
git status --short
```

Esperado: mostra os arquivos de docs, core, testes e E2E alterados por esta implementação. Não execute `git commit`. O handoff final deve incluir:
- o caminho do plan file gravado nesta etapa de planejamento,
- os arquivos de implementação alterados,
- o comando do E2E visual e o id do artefato,
- os comandos e resultados da verificação final,
- uma nota explícita: nenhum commit foi criado.

---

## Critérios de Aceitação

- O input schema provider-visible de `ExitPlanMode` ainda inclui o `plan` obrigatório.
- O plan final aprovado por `ExitPlanMode` é gravado em `${workspaceRoot}/.zcode/plans/plan-${sanitizedSessionId}.md`.
- Falha na gravação de arquivo de `ExitPlanMode` impede a saída do modo.
- O compact após a aprovação do plan persiste um reminder model-only `plan_file_reference` com o conteúdo completo do plan.
- O resume após o compact preserva o reminder no próximo contexto visível ao provider.
- Os generic read-state reminders permanecem independentes e continuam ignorando `docs/superpowers/plans/`.
- O catálogo e a matriz de cobertura de conversation-session incluem o novo caso accepted antes da implementação do E2E.
- O E2E é executado por uma janela visível do desktop, passa, é promovido e passa nas verificações de reexecução/fixture.
- `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck` e `pnpm lint` passam ou têm falhas preexistentes sem relação claramente documentadas.
- Nenhum commit é criado automaticamente.

## Superfície de Mudança e Custo

- Helper do core + registro de sources: baixo risco, cerca de 0,5 dia.
- Caminho de escrita do handler `ExitPlanMode` e testes: risco baixo a médio, cerca de 0,5 dia, porque altera o comportamento de falha da aprovação.
- Injeção no compact do runtime e teste de regressão de provider-context: risco médio, cerca de 0,5 dia, porque a persistência/resume do compact precisa ser validado na fronteira visível ao provider.
- Docs de conversation + E2E visual + promoção de fixtures: custo médio, cerca de 0,5 a 1 dia, dependendo da estabilidade da captura do E2E.
- Custo total esperado para este pequeno hack com testes/docs/E2E: 1,5 a 2,5 dias de engenharia.
- O redesenho completo do schema de plan-file permanece fora deste plano e deve usar o plano completo de plan-file existente como um projeto separado.

## Checklist de Auto-Revisão

- [ ] Toda tarefa de implementação tem arquivos e comandos exatos.
- [ ] O plano mantém intacto o schema atual `ExitPlanMode.plan`.
- [ ] O plano grava através do `FileSystemPort`, e não de `node:fs` dentro do runtime do core.
- [ ] O plano usa `workspaceRoot`, e não `workingDirectory`, para o caminho do plan file.
- [ ] A source do reminder de compact é explicitamente `plan_file_reference`, e não read-state genérico.
- [ ] A fase de E2E começa pelo catálogo/matriz de docs e termina com uma execução em janela visível mais a reexecução.
- [ ] A etapa final para em `git status --short` e não faz commit.