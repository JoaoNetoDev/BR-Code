# Plano de Implementação do Lembrete de Migração para Git Bash no Bash Resume

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** corrigir o problema em que sessões Windows legadas, após o resume, realmente executam a ferramenta Bash com Git Bash, mas o modelo continua usando a sintaxe CMD histórica e escreve arquivos `nul`.

**Arquitetura:** manter inalterado o contrato atual de shell snapshot no session-start: mudanças nas configurações de shell continuam valendo apenas para novas sessões. Apenas quando, em um cold resume, se descobre que a sessão antiga não tem um shell snapshot utilizável e a execução acaba sendo assumida pelo Git Bash automático atual, inserir uma vez um lembrete de migração de sintaxe pelo attachment `shell_environment_change` provider-visible já existente. A implementação fica concentrada no runtime shell owner, sem alterar o executor, o schema de protocolo ou a UI de configurações.

**Stack técnico:** TypeScript, Vitest, runtime de `@zcode/core`, `MessageHistory.addAttachment()` existente, fonte de system reminder `shell_environment_change` existente.

## Restrições globais

- Não criar nova semântica de hot update de shell; trocar as configurações de shell dentro da mesma sessão continua não afetando a sessão atual.
- Não criar novos campos de protocolo, nem de configuração, nem alterar a ordem de resolução de shell do executor Bash.
- Não criar uma nova fonte de system reminder; reutilizar a `shell_environment_change` existente, evitando uma superfície extra de migração em provider projection / hydrate / classificação MCS.
- O lembrete vale apenas para quando, após um resume legacy/sem snapshot utilizável, a execução é assumida por uma seleção com `source: "auto-detected"` e `dialect: "git-bash"`.
- O texto do lembrete apenas informa que comandos Bash futuros passam a ser executados com Git Bash; não ensina como escrever comandos para um badcase específico.
- O lembrete precisa ser idempotente; quando já existe um attachment `shell_environment_change` no histórico da mesma sessão, não inserir de novo.
- Continuar preservando a capacidade existente de lembrete de display drift, mas mudando o texto de “changed by the user” para uma descrição neutra no cenário de resume.
- Manter os comentários em chinês, explicando a causa raiz do problema em produção e por que o lembrete só é inserido em cenários de resume/migração.

---

## Estrutura de arquivos

- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/shell-environment.ts`
  - Responsável pela decisão pura e a construção do texto do shell resume notice.
  - Novo `ShellEnvironmentResumeNoticeKind`, convergindo “display drift” e “Windows auto Git Bash migration” em uma única função de decisão.

- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts`
  - Mantém a responsabilidade de runtime shell owner.
  - Refatora `announceSessionShellEnvironmentDriftAfterResume()` para `announceSessionShellEnvironmentNoticeAfterResume()`.
  - Chama as funções de decisão e de texto de `shell-environment.ts` e, antes de inserir, verifica se já existe um attachment `shell_environment_change`.

- Modify: `apps/zcode-cli/packages/core/tests/runtime-persistence.test.ts`
  - Cobre o lembrete de migração do Git Bash automático legacy do Windows.
  - Cobre a idempotência do lembrete.
  - Atualiza o texto dos testes existentes de drift/stale shell snapshot.

- Modify: `apps/zcode-cli/packages/core/tests/runtime-trace.test.ts`
  - Atualiza as asserções negativas de texto antigo, garantindo que a inicialização do Git Bash em uma nova sessão não insira por engano um lembrete de migration/drift.

- Modify: `docs/runtime-tools/bash-effective-shell-snapshot.md`
  - Atualiza a explicação da semântica de resume: legacy/sem snapshot utilizável + Git Bash automático insere uma vez um lembrete de migração de sintaxe.
  - Esclarece que isso não é hot update de shell.

---

### Tarefa 1: Travar com testes o lembrete de migração do Git Bash automático legacy do Windows

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/tests/runtime-persistence.test.ts`

**Interfaces:**
- Consumes:
  - `AgentRuntime.resumeFromStore(): Promise<ResumeSessionResult>`
  - `AgentRuntime.executeTurn(input: string): Promise<unknown>`
  - `providerMessagesToText(messages: readonly ModelInputMessage[]): string`
  - helpers de teste existentes `createRecordingSessionStore()`, `createTestSessionEventStore()`
- Produces:
  - Um teste que falha, provando que após o resume de uma sessão legacy o Git Bash automático produz um shell reminder provider-visible.
  - Um teste que falha, provando que resumes repetidos não inserem o mesmo tipo de lembrete novamente.

- [ ] **Passo 1: adicionar o teste que falha em `runtime-persistence.test.ts`, perto dos casos de Bash shell persistence**

Adicionar este teste depois de `announces legacy cold-resume Bash shell drift when no shell snapshot exists`:

```ts
  it("announces Windows Git Bash syntax migration for legacy cold-resume sessions", async () => {
    const sessionId = createSessionId("runtime-persistence-windows-git-bash-migration");
    const store = createRecordingSessionStore();
    const workingDirectory = "/tmp/zcode-runtime-windows-git-bash-migration";
    const firstRuntime = new AgentRuntime(
      sessionId,
      {
        currentDate: "2026-06-26",
        envInfo: {
          cwd: workingDirectory,
          platform: "win32",
          shell: "CMD",
          osVersion: "Windows 11",
          nodeVersion: "v24.14.0",
        },
        workingDirectory,
      },
      {
        eventStore: createTestSessionEventStore(),
        modelAdapter: {
          async generateText() {
            return {
              text: "first answer",
              finishReason: "stop",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          },
        } as never,
        sessionStore: store,
      },
    );
    await firstRuntime.executeTurn("persisted prompt");

    let resumedMessages: ModelInputMessage[] = [];
    const resumedRuntime = new AgentRuntime(
      sessionId,
      {
        bashShellSelection: {
          dialect: "git-bash",
          display: { name: "Git Bash" },
          id: "auto:git-bash",
          label: "Git Bash",
          path: "C:\\Program Files\\Git\\bin\\bash.exe",
          source: "auto-detected",
        },
        currentDate: "2026-06-26",
        workingDirectory,
      },
      {
        eventStore: createTestSessionEventStore(),
        modelAdapter: {
          async generateText(request) {
            resumedMessages = request.messages;
            return {
              text: "resumed answer",
              finishReason: "stop",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          },
        } as never,
        sessionStore: store,
      },
    );

    await resumedRuntime.resumeFromStore();
    await resumedRuntime.executeTurn("resumed prompt");

    const providerText = providerMessagesToText(resumedMessages);
    expect(providerText).toContain("- Shell: CMD");
    expect(providerText).toContain(
      "The Bash tool shell is Git Bash.",
    );
  });
```

- [ ] **Passo 2: rodar o novo teste e verificar que ele falha**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-persistence.test.ts -t "Windows Git Bash syntax migration"
```

Expected: FAIL porque o texto do provider não contém o novo lembrete de migração do Git Bash.

- [ ] **Passo 3: adicionar o teste que falha de idempotência**

Adicionar este teste depois do teste de migração:

```ts
  it("does not duplicate the Windows Git Bash migration reminder after repeated resume", async () => {
    const sessionId = createSessionId("runtime-persistence-windows-git-bash-migration-once");
    const store = createRecordingSessionStore();
    const workingDirectory = "/tmp/zcode-runtime-windows-git-bash-migration-once";
    const firstRuntime = new AgentRuntime(
      sessionId,
      {
        currentDate: "2026-06-26",
        envInfo: {
          cwd: workingDirectory,
          platform: "win32",
          shell: "CMD",
          osVersion: "Windows 11",
          nodeVersion: "v24.14.0",
        },
        workingDirectory,
      },
      {
        eventStore: createTestSessionEventStore(),
        modelAdapter: {
          async generateText() {
            return {
              text: "first answer",
              finishReason: "stop",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          },
        } as never,
        sessionStore: store,
      },
    );
    await firstRuntime.executeTurn("persisted prompt");

    const createResumedRuntime = (capture: (messages: ModelInputMessage[]) => void) =>
      new AgentRuntime(
        sessionId,
        {
          bashShellSelection: {
            dialect: "git-bash",
            display: { name: "Git Bash" },
            id: "auto:git-bash",
            label: "Git Bash",
            path: "C:\\Program Files\\Git\\bin\\bash.exe",
            source: "auto-detected",
          },
          currentDate: "2026-06-26",
          workingDirectory,
        },
        {
          eventStore: createTestSessionEventStore(),
          modelAdapter: {
            async generateText(request) {
              capture(request.messages);
              return {
                text: "resumed answer",
                finishReason: "stop",
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              };
            },
          } as never,
          sessionStore: store,
        },
      );

    let firstResumeMessages: ModelInputMessage[] = [];
    const firstResume = createResumedRuntime((messages) => {
      firstResumeMessages = messages;
    });
    await firstResume.resumeFromStore();
    await firstResume.executeTurn("first resumed prompt");

    let secondResumeMessages: ModelInputMessage[] = [];
    const secondResume = createResumedRuntime((messages) => {
      secondResumeMessages = messages;
    });
    await secondResume.resumeFromStore();
    await secondResume.executeTurn("second resumed prompt");

    const firstProviderText = providerMessagesToText(firstResumeMessages);
    const secondProviderText = providerMessagesToText(secondResumeMessages);
    const reminder =
      "The Bash tool shell is Git Bash.";
    expect(firstProviderText.match(new RegExp(escapeRegExp(reminder), "g")) ?? []).toHaveLength(1);
    expect(secondProviderText.match(new RegExp(escapeRegExp(reminder), "g")) ?? []).toHaveLength(1);
  });
```

Adicionar também este helper perto de `providerMessagesToText()`:

```ts
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

- [ ] **Passo 4: rodar os dois novos testes e verificar que eles falham**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-persistence.test.ts -t "Git Bash migration"
```

Expected: FAIL porque a implementação ainda não insere o lembrete de migração e ainda não tem lógica de idempotência.

---

### Tarefa 2: Refatorar a decisão e o texto do lembrete de shell resume

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/shell-environment.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts`

**Interfaces:**
- Consumes:
  - `BashShellSnapshotRestore["status"]`
  - `ExecutionShellSelection`
  - `runtime.messageHistory.toRuntimeEntries()`
  - `runtime.messageHistory.addAttachment("shell_environment_change", body)`
- Produces:
  - `getShellEnvironmentResumeNoticeKind(options): ShellEnvironmentResumeNoticeKind | undefined`
  - `buildShellEnvironmentResumeNotice(kind, selection): string`
  - `announceSessionShellEnvironmentNoticeAfterResume(runtime, options): void`

- [ ] **Passo 1: substituir os helpers de lembrete de shell em `shell-environment.ts`**

Mudar `apps/zcode-cli/packages/core/src/runtime/methods/shell-environment.ts` para esta forma:

```ts
import type { ExecutionShellSelection } from "../deps.js";
import type { BashShellSnapshotRestore } from "./bash-shell-snapshot.js";

export type ShellEnvironmentResumeNoticeKind =
  | "display_change"
  | "windows_git_bash_auto_migration";

export function getShellEnvironmentResumeNoticeKind(options: {
  persistedShell: string | undefined;
  restoreStatus: BashShellSnapshotRestore["status"];
  selection: ExecutionShellSelection | undefined;
}): ShellEnvironmentResumeNoticeKind | undefined {
  if (!options.selection || options.restoreStatus === "restored") {
    return undefined;
  }

  if (isWindowsGitBashAutoMigration(options.selection)) {
    return "windows_git_bash_auto_migration";
  }

  return hasShellDisplayChanged(options.persistedShell, options.selection)
    ? "display_change"
    : undefined;
}

export function buildShellEnvironmentResumeNotice(
  kind: ShellEnvironmentResumeNoticeKind,
  selection: ExecutionShellSelection,
): string {
  if (kind === "windows_git_bash_auto_migration") {
    return "The Bash tool shell is Git Bash.";
  }

  return `The Bash tool shell is ${selection.display.name}.`;
}

export function hasShellDisplayChanged(
  previousShell: string | undefined,
  selection: ExecutionShellSelection | undefined,
): selection is ExecutionShellSelection {
  const previousDisplayName = normalizeShellDisplayName(previousShell);
  const nextDisplayName = normalizeShellDisplayName(selection?.display.name);
  return previousDisplayName !== undefined && nextDisplayName !== undefined
    ? previousDisplayName !== nextDisplayName
    : false;
}

function isWindowsGitBashAutoMigration(selection: ExecutionShellSelection): boolean {
  return selection.dialect === "git-bash" && selection.source === "auto-detected";
}

function normalizeShellDisplayName(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}
```

- [ ] **Passo 2: refatorar a função announce de `session-shell-environment.ts`**

Atualizar os imports:

```ts
import {
  buildShellEnvironmentResumeNotice,
  getShellEnvironmentResumeNoticeKind,
} from "./shell-environment.js";
```

Substituir `announceSessionShellEnvironmentDriftAfterResume()` por:

```ts
export function announceSessionShellEnvironmentNoticeAfterResume(
  runtime: AgentRuntimeInternal,
  options: {
    persistedEnvInfo: EnvInfo | undefined;
    restore: BashShellSnapshotRestore;
  },
): void {
  const selection = getSessionShellSelection(runtime);
  const noticeKind = getShellEnvironmentResumeNoticeKind({
    persistedShell: options.persistedEnvInfo?.shell,
    restoreStatus: options.restore.status,
    selection,
  });
  if (!selection || !noticeKind || hasShellEnvironmentChangeAttachment(runtime)) {
    return;
  }

  // 修复原因：旧 Windows 会话没有可用 shell snapshot 时，升级后可能由 auto Git Bash
  // 接管 Bash 执行。历史上下文仍可能让模型继续沿用旧 shell 习惯，因此必须在
  // resume 后补一个 provider-visible shell 提醒；可用 snapshot 恢复时不插，避免
  // 破坏“shell 设置变更只对新 session 生效”的契约。
  runtime.messageHistory.addAttachment(
    "shell_environment_change",
    buildShellEnvironmentResumeNotice(noticeKind, selection),
  );
}

function hasShellEnvironmentChangeAttachment(runtime: AgentRuntimeInternal): boolean {
  return runtime.messageHistory
    .toRuntimeEntries()
    .some((entry) => entry.metadata?.source === "shell_environment_change");
}
```

- [ ] **Passo 3: atualizar quem chama no resume**

Em `apps/zcode-cli/packages/core/src/runtime/methods/resume.ts`, substituir o import e a chamada:

```ts
import {
  announceSessionShellEnvironmentNoticeAfterResume,
  getSessionShellSelection,
  restoreSessionShellEnvironmentSelectionForResume,
} from "./session-shell-environment.js";
```

E:

```ts
  announceSessionShellEnvironmentNoticeAfterResume(this, {
    persistedEnvInfo,
    restore: shellRestore,
  });
```

- [ ] **Passo 4: rodar os novos testes**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-persistence.test.ts -t "Git Bash migration"
```

Expected: PASS nos dois testes de migração.

---

### Tarefa 3: Atualizar os testes existentes de shell drift, mantendo a capacidade antiga mas com texto neutro

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/tests/runtime-persistence.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/runtime-trace.test.ts`

**Interfaces:**
- Consumes:
  - novo texto de `buildShellEnvironmentResumeNotice("display_change", selection)`:
    `The Bash tool shell is ${selection.display.name}.`
- Produces:
  - O comportamento existente de display drift legacy continua coberto.
  - A inicialização do Git Bash em sessão nova não emite por engano um lembrete de resume.

- [ ] **Passo 1: atualizar a expectativa de drift de snapshot ausente**

Em `runtime-persistence.test.ts`, atualizar:

```ts
expect(providerText).toContain(
  "The Bash tool shell was changed by the user. Future Bash commands will run using CMD.",
);
```

para:

```ts
expect(providerText).toContain(
  "The Bash tool shell is CMD.",
);
```

- [ ] **Passo 2: atualizar a expectativa de drift de snapshot obsoleto**

Em `runtime-persistence.test.ts`, atualizar:

```ts
expect(providerText).toContain(
  "The Bash tool shell was changed by the user. Future Bash commands will run using zsh.",
);
```

para:

```ts
expect(providerText).toContain(
  "The Bash tool shell is zsh.",
);
```

- [ ] **Passo 3: atualizar a asserção negativa do runtime trace**

Em `runtime-trace.test.ts`, substituir a antiga asserção negativa:

```ts
expect(requestText).not.toContain(
  "The Bash tool shell was changed by the user. Future Bash commands will run using Git Bash.",
);
```

por:

```ts
expect(requestText).not.toContain(
  "The Bash tool shell is Git Bash.",
);
expect(requestText).not.toContain(
  "The Bash tool shell is Git Bash.",
);
```

- [ ] **Passo 4: rodar os testes focados de shell persistence e trace**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-persistence.test.ts -t "shell"
pnpm --filter @zcode/core exec vitest run tests/runtime-trace.test.ts -t "Shell"
```

Expected: PASS. Se `runtime-trace.test.ts -t "Shell"` não casar com nenhum teste porque os nomes mudaram, rodar o arquivo inteiro:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-trace.test.ts
```

Expected: PASS.

---

### Tarefa 4: Atualizar a documentação, esclarecendo que a migração legacy do Windows Git Bash não é hot update de shell

**Arquivos:**
- Modify: `docs/runtime-tools/bash-effective-shell-snapshot.md`

**Interfaces:**
- Consumes:
  - Seções existentes do documento `核心契约`, `Prompt 与缓存`, `非目标`
- Produces:
  - Documentação de contrato do runtime atualizada, explicando o novo gatilho do lembrete e os casos em que ele não dispara.

- [ ] **Passo 1: atualizar o bullet de resume legacy em `核心契约`**

Substituir:

```md
- legacy session 如果没有持久化 selection，或持久化 selection 已失效，只能按当前自动解析逻辑 best-effort 恢复；当历史 `# Environment` 的 Shell 与当前执行 shell 不一致时，必须通过 `shell_environment_change` attachment 告知模型。
```

por:

```md
- legacy session 如果没有持久化 selection，或持久化 selection 已失效，只能按当前自动解析逻辑 best-effort 恢复；当历史 `# Environment` 的 Shell 与当前执行 shell 不一致时，必须通过 `shell_environment_change` attachment 告知模型。Windows legacy session 被当前 auto Git Bash 接管时，即使历史 `# Environment` 没有可靠 Shell 字段，也会插入一次 Git Bash shell 提醒，避免模型继续沿用旧 shell 习惯。
```

- [ ] **Passo 2: atualizar `Prompt 与缓存`**

Depois de:

```md
切换 shell 不会向已有 session 追加 `shell_environment_change` attachment。因为 Bash 执行仍然使用 session-start selection，模型看到的初始 `# Environment` 和真实 Bash 执行环境保持一致。
```

Adicionar:

```md
例外是 legacy/no-usable snapshot 的 cold resume：这类会话没有稳定的 session-start shell selection 可恢复，runtime 只能用当前解析出的 selection 继续执行。若 Windows 上最终由 auto Git Bash 接管，会通过 `shell_environment_change` 插入一次短提醒，告诉模型后续 Bash command 当前使用 Git Bash 执行。这不是同 session 内 shell hot update，也不会读取用户最新设置覆盖已有可用 snapshot。
```

- [ ] **Passo 3: rodar a revisão do diff da documentação**

Run:

```bash
git diff -- docs/runtime-tools/bash-effective-shell-snapshot.md
```

Expected: o diff documenta apenas o comportamento do lembrete de resume legacy/sem snapshot utilizável e não afirma que sessões existentes fazem hot update de shell.

---

### Tarefa 5: Verificação final

**Arquivos:**
- Apenas verificação; nenhuma modificação adicional esperada.

**Interfaces:**
- Consumes:
  - Todas as alterações das Tarefas 1-4
- Produces:
  - Evidência de que o comportamento do runtime, a projeção do lembrete provider-visible e a documentação são coerentes.

- [ ] **Passo 1: rodar os testes focados**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-persistence.test.ts -t "shell"
pnpm --filter @zcode/core exec vitest run tests/runtime-trace.test.ts
```

Expected: PASS.

- [ ] **Passo 2: rodar os testes da fonte de system reminder**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/system-reminder-source.test.ts
```

Expected: PASS. Isso verifica que reutilizar `shell_environment_change` não quebrou as premissas do descriptor.

- [ ] **Passo 3: rodar o typecheck do pacote**

Run:

```bash
pnpm --filter @zcode/core typecheck
```

Expected: PASS.

- [ ] **Passo 4: rodar as verificações exigidas pelo repositório antes do commit**

Run:

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS. Se forem lentas demais ou forem bloqueadas por mudanças de workspace não relacionadas, registrar a falha exata e não afirmar verificação completa.

- [ ] **Passo 5: inspecionar o diff preparado**

Run:

```bash
git diff -- apps/zcode-cli/packages/core/src/runtime/methods/shell-environment.ts \
  apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts \
  apps/zcode-cli/packages/core/src/runtime/methods/resume.ts \
  apps/zcode-cli/packages/core/tests/runtime-persistence.test.ts \
  apps/zcode-cli/packages/core/tests/runtime-trace.test.ts \
  docs/runtime-tools/bash-effective-shell-snapshot.md
```

Expected:

- Nenhuma mudança na ordem de resolução de shell do executor.
- Nenhum campo novo de protocolo/configurações.
- Nenhuma nova fonte de system reminder.
- Existe apenas um caminho de anúncio de resume em `session-shell-environment.ts`.
- O texto do lembrete de migração do Git Bash fica restrito aos caminhos de resume legacy/sem snapshot utilizável.

- [ ] **Passo 6: commitar**

Run:

```bash
git add apps/zcode-cli/packages/core/src/runtime/methods/shell-environment.ts \
  apps/zcode-cli/packages/core/src/runtime/methods/session-shell-environment.ts \
  apps/zcode-cli/packages/core/src/runtime/methods/resume.ts \
  apps/zcode-cli/packages/core/tests/runtime-persistence.test.ts \
  apps/zcode-cli/packages/core/tests/runtime-trace.test.ts \
  docs/runtime-tools/bash-effective-shell-snapshot.md
git commit -m "fix(cli): remind legacy windows sessions about git bash syntax"
```

Expected: o commit é bem-sucedido contendo apenas os arquivos planejados.

---

## Auto-revisão

- Cobertura da spec: o plano cobre resume legacy/sem snapshot utilizável, migração do Git Bash automático do Windows, idempotência, preservação do display drift existente, documentação e verificação.
- Varredura de placeholders: não restam marcadores de placeholder nem passos abertos do tipo "handle edge cases".
- Consistência de tipos: o plano reutiliza `ExecutionShellSelection`, `BashShellSnapshotRestore`, `MessageHistory.addAttachment()` e a fonte `shell_environment_change` existentes. Não introduz campos de protocolo/configurações/schema.
- Checagem de complexidade: o plano evita deliberadamente novas entradas de sessão persistentes e evita adicionar uma segunda fonte de lembrete. A lógica repetida de `if` fica centralizada em `getShellEnvironmentResumeNoticeKind()`, deixando `session-shell-environment.ts` como o único runtime owner que decide se anexa um lembrete de resume.