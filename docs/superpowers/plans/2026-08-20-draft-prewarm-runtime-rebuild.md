# Plano de Implementação da Reconstrução do Runtime de Pré-aquecimento de Rascunho

> **Para agentes de trabalho:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Após o CUA Helper ficar pronto e disparar a reciclagem do agent runtime, o estado de rascunho consegue reconstruir automaticamente a sessão de pré-aquecimento e reenviar as imagens para a nova sessão, com o envio proibido durante a reconstrução.

**Arquitetura:** Reutiliza o canal de reconstrução já existente `invalidateDraftRuntime` + `invalidationVersion` — na troca de runtime, o número da versão é incrementado e o coordinator faz o retire das sessões antigas e reconstrói automaticamente. O gate é extraído para um hook independente (alinhado ao padrão `useDraftModelReadinessGate`), sem acumular lógica no SessionPane, que já excedeu max-lines. No lado dos anexos, as cadeias de "invalidação" e "despertar" são desacopladas, com o `restartEpoch` unificando o despertar.

**Stack tecnológico:** React 19 + zustand + vitest; `packages/ui` é o principal campo de batalha.

**Spec:** `docs/superpowers/specs/2026-08-20-draft-prewarm-runtime-rebuild-design.md`

## Restrições globais

- Branch `fix/draft-prewarm-runtime-rebuild`, baseada em `feat/cua-merge-0819`. Não commitar direto na branch de merge.
- Proibido usar `--no-verify` para pular os git hooks.
- Os testes rodam a partir da **raiz do repositório**: `pnpm exec vitest run <path> -t "<nome do caso>"`. Rodar a partir do diretório `packages/ui` esbarra na configuração de workspace da raiz e falha.
- O escopo cobre apenas o **estado de rascunho** (`sessionId === null`). O estado de sessão oficial (troca de runtime após o envio) não é objetivo — não altere por conta própria.
- Não modificar a semântica de reciclagem de `packages/services`, nem tocar em `hasActiveTurnRef`.
- Limite de tempo de reconstrução **5000ms**; limite de `runtimeRebuildRetryCount` **5**; `autoRetryCount` mantém o limite **1** sem alteração.
- SessionPane.tsx já tem `oxlint-disable eslint(max-lines)`; toda lógica nova deve ser extraída para um hook, sem adicionar blocos grandes de lógica dentro dele.

---

### Tarefa 1: Travar a premissa de reconstrução do coordinator

Todo o esquema repousa sobre uma premissa: incrementar `invalidationVersion` depois de `binding.discard()` libera `blockedInvalidationVersion` e reconstrói a sessão de pré-aquecimento. A leitura do código conclui que `useDraftSessionPrewarm.ts:297-302` limpa essa trava quando a versão muda, mas não há teste travando isso. Prove primeiro com um teste; se a premissa não se sustentar, todo o esquema precisa ser refeito.

**Esta tarefa não deve exigir alteração de código de produto** — apenas adicionar testes. Se o teste falhar inesperadamente, pare e reporte; não altere o teste para se adaptar à implementação.

**Arquivos:**
- Teste: `packages/ui/test/v4DraftSessionPrewarm.test.ts` (adicionar casos dentro de `describe("useDraftSessionPrewarm workspace owner")`)

**Interfaces:**
- Consome: `PrewarmHarness`, `acceptedCreateAck`, `flushMicrotasks`, `installMinimalDom`, `mountedRoots` já existentes no arquivo
- Produz: nada (apenas teste)

- [ ] **Passo 1: Escrever o caso**

Insira no `packages/ui/test/v4DraftSessionPrewarm.test.ts`, após o último `it(...)` e antes do `});` final:

```ts
  it("discard 后递增 invalidationVersion → 解除 blocked 并重建预热会话", async () => {
    const calls: Array<{ type: string; sessionId: string | null }> = [];
    let createCount = 0;
    const dispatch = vi.fn(async (type: string, _payload: unknown, sessionId: string | null) => {
      calls.push({ type, sessionId });
      if (type === "createSession") {
        createCount += 1;
        return acceptedCreateAck(`draft-${createCount}`);
      }
      return { status: "accepted" as const };
    });
    const transportIdentity = {};
    const observed: Array<{ sessionId: string; discard(): void } | null> = [];
    const root = createRoot(installMinimalDom());
    mountedRoots.push(root);
    const renderVersion = (invalidationVersion: number) =>
      createElement(PrewarmHarness, {
        workspaceKey: "/local/workspace",
        paneId: "workspace-main",
        invalidationVersion,
        transportIdentity,
        dispatchCommand: dispatch,
        onRender: (binding) => observed.push(binding),
      });

    await act(async () => {
      root.render(renderVersion(0));
      await flushMicrotasks();
    });
    expect(observed.at(-1)?.sessionId).toBe("draft-1");

    // 订阅失败路径：SessionPane 会调 discard()，它把当前版本标记为 blocked。
    await act(async () => {
      observed.at(-1)?.discard();
      await flushMicrotasks();
    });
    expect(observed.at(-1)).toBeNull();

    // 同版本不重建（blocked 生效）。
    await act(async () => {
      root.render(renderVersion(0));
      await flushMicrotasks();
    });
    expect(calls.filter((call) => call.type === "createSession")).toHaveLength(1);

    // 递增版本 → 解除 blocked → 重建。
    await act(async () => {
      root.render(renderVersion(1));
      await flushMicrotasks();
    });
    expect(calls.filter((call) => call.type === "createSession")).toHaveLength(2);
    expect(observed.at(-1)?.sessionId).toBe("draft-2");
  });
```

- [ ] **Passo 2: Rodar o caso**

```bash
pnpm exec vitest run packages/ui/test/v4DraftSessionPrewarm.test.ts -t "discard 后递增 invalidationVersion"
```

Esperado: PASS (a premissa se sustenta). Se falhar, **pare e reporte** — isso indica que a condição de limpeza de `blockedInvalidationVersion` diverge da conclusão da leitura de código e o esquema precisa ser reformulado.

- [ ] **Passo 3: Commitar**

```bash
git add packages/ui/test/v4DraftSessionPrewarm.test.ts
git commit -m "test(ui): 锁定 discard 后按 invalidationVersion 重建预热会话的行为"
```

---

### Tarefa 2: Adicionar useDraftRuntimeRebuildGate

Dispara a reconstrução quando o runtime é trocado e expõe `rebuilding=true` durante a reconstrução para uso pelo gate de envio. Motivo para extrair um hook independente: o SessionPane já excedeu max-lines e `composer/useDraftModelReadinessGate.ts` já estabeleceu o padrão de hook de gate.

**Arquivos:**
- Criar: `packages/ui/src/v4/composer/useDraftRuntimeRebuildGate.ts`
- Teste: `packages/ui/test/v4DraftRuntimeRebuildGate.test.ts`

**Interfaces:**
- Consome: `invalidateDraftRuntime(workspacePath, workspaceIdentity?)` de `useZCodeSessionStore` (`@/store/zcodeSessionStore.js`); `onRuntimeRestart: (listener: () => void) => () => void`
- Produz:
  ```ts
  export const DRAFT_RUNTIME_REBUILD_TIMEOUT_MS = 5000;
  export interface DraftRuntimeRebuildGate { rebuilding: boolean }
  export function useDraftRuntimeRebuildGate(params: {
    enabled: boolean;
    workspacePath: string;
    workspaceIdentity?: string;
    prewarmSessionId: string | null;
    onRuntimeRestart?: (listener: () => void) => () => void;
    timeoutMs?: number;
  }): DraftRuntimeRebuildGate;
  ```

- [ ] **Passo 1: Escrever o teste que falha**

Crie `packages/ui/test/v4DraftRuntimeRebuildGate.test.ts`:

```ts
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DRAFT_RUNTIME_REBUILD_TIMEOUT_MS,
  useDraftRuntimeRebuildGate,
  type DraftRuntimeRebuildGate,
} from "@/v4/composer/useDraftRuntimeRebuildGate.js";

const mocks = vi.hoisted(() => ({
  invalidateDraftRuntime: vi.fn(),
}));

vi.mock("@/store/zcodeSessionStore.js", () => ({
  useZCodeSessionStore: {
    getState: () => ({ invalidateDraftRuntime: mocks.invalidateDraftRuntime }),
  },
}));

interface ProbeOptions {
  enabled: boolean;
  prewarmSessionId: string | null;
  onRuntimeRestart?: (listener: () => void) => () => void;
}

let latest: DraftRuntimeRebuildGate | null = null;

function Probe(options: ProbeOptions) {
  latest = useDraftRuntimeRebuildGate({
    enabled: options.enabled,
    onRuntimeRestart: options.onRuntimeRestart,
    prewarmSessionId: options.prewarmSessionId,
    workspaceIdentity: undefined,
    workspacePath: "/workspace",
  });
  return null;
}

function installMinimalDom(): HTMLElement {
  const container = document.createElement("div");
  document.body.appendChild(container);
  return container;
}

function renderProbe(options: ProbeOptions) {
  const root = createRoot(installMinimalDom());
  act(() => root.render(createElement(Probe, options)));
  return {
    rerender(next: ProbeOptions) {
      act(() => root.render(createElement(Probe, next)));
    },
    root,
  };
}

/** 捕获 hook 注册的 restart 监听器，供测试主动触发。 */
function createRestartHook() {
  const listeners = new Set<() => void>();
  return {
    fire() {
      for (const listener of [...listeners]) listener();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

beforeEach(() => {
  latest = null;
  mocks.invalidateDraftRuntime.mockReset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useDraftRuntimeRebuildGate", () => {
  it("草稿态换代 → 触发 invalidateDraftRuntime 并进入 rebuilding", () => {
    const restart = createRestartHook();
    renderProbe({ enabled: true, onRuntimeRestart: restart.subscribe, prewarmSessionId: "draft-1" });

    expect(latest?.rebuilding).toBe(false);
    act(() => restart.fire());

    expect(mocks.invalidateDraftRuntime).toHaveBeenCalledWith("/workspace", undefined);
    expect(latest?.rebuilding).toBe(true);
  });

  it("新预热会话到达 → 解除 rebuilding", () => {
    const restart = createRestartHook();
    const probe = renderProbe({
      enabled: true,
      onRuntimeRestart: restart.subscribe,
      prewarmSessionId: "draft-1",
    });
    act(() => restart.fire());
    expect(latest?.rebuilding).toBe(true);

    probe.rerender({
      enabled: true,
      onRuntimeRestart: restart.subscribe,
      prewarmSessionId: "draft-2",
    });

    expect(latest?.rebuilding).toBe(false);
  });

  it("超时未重建 → 解除 rebuilding 回落无预热发送", () => {
    const restart = createRestartHook();
    renderProbe({ enabled: true, onRuntimeRestart: restart.subscribe, prewarmSessionId: "draft-1" });
    act(() => restart.fire());
    expect(latest?.rebuilding).toBe(true);

    act(() => {
      vi.advanceTimersByTime(DRAFT_RUNTIME_REBUILD_TIMEOUT_MS);
    });

    expect(latest?.rebuilding).toBe(false);
  });

  it("非草稿态换代 → 不触发 invalidate，不禁用发送", () => {
    const restart = createRestartHook();
    renderProbe({
      enabled: false,
      onRuntimeRestart: restart.subscribe,
      prewarmSessionId: null,
    });
    act(() => restart.fire());

    expect(mocks.invalidateDraftRuntime).not.toHaveBeenCalled();
    expect(latest?.rebuilding).toBe(false);
  });

  it("重建中再次换代 → 计时器重置，不提前解除", () => {
    const restart = createRestartHook();
    renderProbe({ enabled: true, onRuntimeRestart: restart.subscribe, prewarmSessionId: "draft-1" });
    act(() => restart.fire());

    act(() => {
      vi.advanceTimersByTime(DRAFT_RUNTIME_REBUILD_TIMEOUT_MS - 1000);
      restart.fire();
    });
    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(latest?.rebuilding).toBe(true);
  });
});
```

- [ ] **Passo 2: Rodar o teste e confirmar a falha**

```bash
pnpm exec vitest run packages/ui/test/v4DraftRuntimeRebuildGate.test.ts
```

Esperado: FAIL — não é possível resolver `@/v4/composer/useDraftRuntimeRebuildGate.js`.

- [ ] **Passo 3: Implementar o hook**

Crie `packages/ui/src/v4/composer/useDraftRuntimeRebuildGate.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from "react";
import { useZCodeSessionStore } from "@/store/zcodeSessionStore.js";

/**
 * 重建上限：实测 agent start→ready 约 550-650ms，createSession 再数百 ms，
 * 5s 有充分余量。超时只解除门禁，不取消重建——迟到的 binding 仍会正常生效。
 */
export const DRAFT_RUNTIME_REBUILD_TIMEOUT_MS = 5000;

export interface DraftRuntimeRebuildGate {
  /** 预热会话正在重建；true 时必须禁止发送，避免附件还挂在已消失的会话上。 */
  rebuilding: boolean;
}

/**
 * CUA Helper 就绪等原因会回收 agent runtime（workspace-dispose），把草稿态尚未持久化的
 * 预热会话一并冲掉。此 hook 在换代时递增 draftRuntimeInvalidationVersion 触发重建，
 * 并在重建窗口内给出 rebuilding=true 供发送门禁使用。
 */
export function useDraftRuntimeRebuildGate(params: {
  /** 仅草稿态（sessionId === null）启用；正式会话由 CLI cold-session-resume 负责。 */
  enabled: boolean;
  workspacePath: string;
  workspaceIdentity?: string;
  /** 当前预热会话 id；变为新的非空值即视为重建完成。 */
  prewarmSessionId: string | null;
  onRuntimeRestart?: (listener: () => void) => () => void;
  timeoutMs?: number;
}): DraftRuntimeRebuildGate {
  const {
    enabled,
    onRuntimeRestart,
    prewarmSessionId,
    timeoutMs = DRAFT_RUNTIME_REBUILD_TIMEOUT_MS,
    workspaceIdentity,
    workspacePath,
  } = params;
  const [rebuilding, setRebuilding] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 换代时的预热会话 id；用于判定「新的会话已到达」。 */
  const pendingFromRef = useRef<string | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  useEffect(() => clearTimer, [clearTimer]);

  useEffect(() => {
    if (!onRuntimeRestart) return;
    return onRuntimeRestart(() => {
      if (!enabled) return;
      pendingFromRef.current = prewarmSessionId;
      setRebuilding(true);
      clearTimer();
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        // 超时只解除门禁：重建仍在进行，迟到的 binding 会照常更新 effectiveSessionId。
        setRebuilding(false);
      }, timeoutMs);
      useZCodeSessionStore.getState().invalidateDraftRuntime(workspacePath, workspaceIdentity);
    });
  }, [
    clearTimer,
    enabled,
    onRuntimeRestart,
    prewarmSessionId,
    timeoutMs,
    workspaceIdentity,
    workspacePath,
  ]);

  useEffect(() => {
    if (!rebuilding) return;
    if (prewarmSessionId === null || prewarmSessionId === pendingFromRef.current) return;
    clearTimer();
    pendingFromRef.current = null;
    setRebuilding(false);
  }, [clearTimer, prewarmSessionId, rebuilding]);

  return { rebuilding };
}
```

- [ ] **Passo 4: Rodar o teste e confirmar que passa**

```bash
pnpm exec vitest run packages/ui/test/v4DraftRuntimeRebuildGate.test.ts
```

Esperado: 5 passed.

- [ ] **Passo 5: Commitar**

```bash
git add packages/ui/src/v4/composer/useDraftRuntimeRebuildGate.ts packages/ui/test/v4DraftRuntimeRebuildGate.test.ts
git commit -m "feat(ui): 新增草稿预热会话换代重建门禁 hook"
```

---

### Tarefa 3: Integrar ao SessionPane e aos textos

Conectar o hook da Tarefa 2 ao SessionPane e incluir `rebuilding` no `disabled` do composer.

**Arquivos:**
- Modificar: `packages/ui/src/v4/SessionPane.tsx` (conectar o hook perto de `:1483`, somar a condição no `disabled` de `:3494`)
- Modificar: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modificar: `packages/ui/src/i18n/locales/en-US.ts`

**Interfaces:**
- Consome: `useDraftRuntimeRebuildGate` da Tarefa 2; `onRuntimeRestart` já existente no SessionPane (props, `:446`), `prewarmSessionId` (`:1483`), `sessionId`, `workspacePath`, `workspaceIdentity`
- Produz: nenhuma nova exportação

- [ ] **Passo 1: Adicionar os textos**

Em `packages/ui/src/i18n/locales/zh-CN.ts`, insira **depois** da linha `"chat.attachments.upload.runtimeRestarted"`:

```ts
  "chat.composer.draftRuntimeRebuilding": "会话正在重建，请稍候",
```

Em `packages/ui/src/i18n/locales/en-US.ts`, insira depois do `"chat.attachments.upload.runtimeRestarted"` correspondente:

```ts
  "chat.composer.draftRuntimeRebuilding": "Rebuilding session, please wait",
```

- [ ] **Passo 2: Conectar o hook**

Em `packages/ui/src/v4/SessionPane.tsx`, insira após `const prewarmSessionId = prewarmBinding?.sessionId ?? null;` (`:1483`):

```tsx
  // runtime 换代（CUA Helper 就绪、liveness 恢复等触发 workspace-dispose）会冲掉草稿态
  // 尚未持久化的预热会话；重建期间禁止发送，避免附件挂在已消失的会话上。
  const { rebuilding: draftRuntimeRebuilding } = useDraftRuntimeRebuildGate({
    enabled: sessionId === null,
    onRuntimeRestart,
    prewarmSessionId,
    workspaceIdentity,
    workspacePath,
  });
```

E adicione na área de imports do topo do arquivo:

```ts
import { useDraftRuntimeRebuildGate } from "@/v4/composer/useDraftRuntimeRebuildGate.js";
```

- [ ] **Passo 3: Conectar ao disabled**

Em `packages/ui/src/v4/SessionPane.tsx:3494`, troque

```tsx
      disabled={connecting || queueEditActiveForCurrentComposer || quotaBanner.state.blocksSubmit}
```

por

```tsx
      disabled={
        connecting ||
        draftRuntimeRebuilding ||
        queueEditActiveForCurrentComposer ||
        quotaBanner.state.blocksSubmit
      }
```

- [ ] **Passo 4: Rodar os testes existentes do SessionPane para confirmar ausência de regressão**

```bash
pnpm exec vitest run packages/ui/test/v4SessionPaneComposerContinuity.test.ts packages/ui/test/v4SessionPaneLayoutParity.test.ts packages/ui/test/v4SessionPaneReadOnly.test.ts
```

Esperado: todos PASS.

- [ ] **Passo 5: typecheck**

```bash
pnpm exec tsc -p packages/ui/tsconfig.json --noEmit
```

Esperado: sem saída (este comando já foi verificado como limpo antes das alterações; qualquer saída foi introduzida por esta tarefa).

- [ ] **Passo 6: Commitar**

```bash
git add packages/ui/src/v4/SessionPane.tsx packages/ui/src/i18n/locales/zh-CN.ts packages/ui/src/i18n/locales/en-US.ts
git commit -m "feat(ui): 重建预热会话期间禁用发送"
```

---

### Tarefa 4: Desacoplar invalidação e despertar dos anexos

O callback de troca em `useComposerAttachments.ts:461` lê `targetsRef.current` — o valor antigo escrito durante a renderização; no momento da troca ele ainda contém um sessionId já inválido, então enfileira com o id antigo, exatamente a causa do `sessionNotFound` nos logs de produção. Alterar para "sempre colocar em `waitingSession`, com o despertar unificado pelo `restartEpoch`".

**Arquivos:**
- Modificar: `packages/ui/src/v4/composer/useComposerAttachments.ts` (effect de despertar em `:437-451`, callback de troca em `:461-515`)
- Teste: `packages/ui/test/useComposerAttachmentsUpload.test.ts`

**Interfaces:**
- Consome: `enqueueUpload`, `updateItem`, `readComposerAttachmentScope` já existentes no arquivo
- Produz: nenhuma nova exportação (`restartEpoch` é state interno do hook)

- [ ] **Passo 1: Escrever o teste que falha**

Ao final do `describe` em `packages/ui/test/useComposerAttachmentsUpload.test.ts`, adicione:

```ts
  it("换代后不拿旧 sessionId 入队，等新会话到达再重传", async () => {
    const transfer = createTransferService();
    mocks.service = transfer.service;
    const restartListeners = new Set<() => void>();
    const onRuntimeRestart = (listener: () => void) => {
      restartListeners.add(listener);
      return () => restartListeners.delete(listener);
    };
    const probe = renderProbe({
      attachmentSessionId: "draft-1",
      localDesktop: true,
      onRuntimeRestart,
      scopeId: "rebuild-requeue",
    });
    await addPaths(["/tmp/a.png"]);
    await vi.waitFor(() => expect(latestApi?.attachments[0]?.uploadStatus).toBe("ready"));

    act(() => {
      for (const listener of [...restartListeners]) listener();
    });

    // 换代后必须是 waitingSession——不能带着已失效的 draft-1 去入队。
    expect(latestApi?.attachments[0]?.uploadStatus).toBe("waitingSession");
    expect(latestApi?.attachments[0]?.attachmentRef).toBeUndefined();

    probe.rerender({
      attachmentSessionId: "draft-2",
      localDesktop: true,
      onRuntimeRestart,
      scopeId: "rebuild-requeue",
    });

    await vi.waitFor(() =>
      expect(latestApi?.attachments[0]?.uploadStatus).not.toBe("waitingSession"),
    );
    probe.root.unmount();
  });

  it("sessionId 未变的换代也能被 restartEpoch 唤醒，不永久卡在 waitingSession", async () => {
    const transfer = createTransferService();
    mocks.service = transfer.service;
    const restartListeners = new Set<() => void>();
    const onRuntimeRestart = (listener: () => void) => {
      restartListeners.add(listener);
      return () => restartListeners.delete(listener);
    };
    const probe = renderProbe({
      attachmentSessionId: "session-1",
      localDesktop: true,
      onRuntimeRestart,
      scopeId: "rebuild-same-session",
    });
    await addPaths(["/tmp/b.png"]);
    await vi.waitFor(() => expect(latestApi?.attachments[0]?.uploadStatus).toBe("ready"));

    act(() => {
      for (const listener of [...restartListeners]) listener();
    });

    // sessionId 不变，:441 的 effect 不会因依赖变化重跑；restartEpoch 必须补上唤醒。
    await vi.waitFor(() =>
      expect(latestApi?.attachments[0]?.uploadStatus).not.toBe("waitingSession"),
    );
    probe.root.unmount();
  });
```

- [ ] **Passo 2: Rodar o teste e confirmar a falha**

```bash
pnpm exec vitest run packages/ui/test/useComposerAttachmentsUpload.test.ts -t "换代后不拿旧 sessionId 入队"
```

Esperado: FAIL — a implementação atual segue para `queued` com o sessionId antigo.

- [ ] **Passo 3: Adicionar restartEpoch e mudar o effect de despertar**

Insira em `packages/ui/src/v4/composer/useComposerAttachments.ts`, após `const [attachmentError, setAttachmentError] = useState<string | null>(null);` (`:186`):

```ts
  /** runtime 换代计数：换代后 sessionId 可能不变，仅靠它做依赖会漏掉唤醒。 */
  const [restartEpoch, setRestartEpoch] = useState(0);
```

Troque o array de dependências do effect de despertar em `:437-451` de

```ts
  }, [
    attachmentSessionId,
    enqueueUpload,
    remoteSessionId,
    scopeKey,
    updateItem,
    workspaceIdentity,
  ]);
```

por

```ts
  }, [
    attachmentSessionId,
    enqueueUpload,
    remoteSessionId,
    restartEpoch,
    scopeKey,
    updateItem,
    workspaceIdentity,
  ]);
```

- [ ] **Passo 4: Mudar o callback de troca para não usar mais o sessionId obsoleto no enfileiramento**

Troque, em `:497-511`:

```ts
          updateItem(targetScopeKey, item.id, (current) => ({
            ...current,
            uploadStatus: target?.sessionId ? "queued" : "waitingSession",
            uploadProgress: 0,
            uploadError: intl.formatMessage({
              id: "chat.attachments.upload.runtimeRestarted",
            }),
            uploadErrorKind: "runtimeRestarted",
            attachmentRef: undefined,
            staged: false,
            adopted: false,
            showComplete: false,
            autoRetryCount: current.autoRetryCount + 1,
          }));
          if (target?.sessionId) enqueueUpload(targetScopeKey, item.id);
```

por

```ts
          // 换代后 targetsRef 里的 sessionId 必然陈旧（渲染期写入），拿它入队会直撞
          // sessionNotFound。一律降到 waitingSession，由 restartEpoch 驱动的唤醒 effect
          // 在新会话到达后统一入队。
          updateItem(targetScopeKey, item.id, (current) => ({
            ...current,
            uploadStatus: "waitingSession",
            uploadProgress: 0,
            uploadError: intl.formatMessage({
              id: "chat.attachments.upload.runtimeRestarted",
            }),
            uploadErrorKind: "runtimeRestarted",
            attachmentRef: undefined,
            staged: false,
            adopted: false,
            showComplete: false,
            autoRetryCount: current.autoRetryCount + 1,
          }));
```

E adicione nesse callback, antes do fim do laço `for` e do `}` de fechamento (ou seja, após o `}` de `:513` e antes do `});`):

```ts
      setRestartEpoch((current) => current + 1);
```

Sobre o ponto da spec de "não reenviar repetidamente dentro do mesmo `restartEpoch`": ele é garantido naturalmente pelo incremento monotônico de `restartEpoch` — a cada troca, `onRuntimeRestart` dispara apenas uma vez, `restartEpoch` incrementa só +1 e o effect de despertar roda só uma vez. Não é criado um caso separado, porque para assertá-lo exigiria observar o número de enfileiramentos internos no modo `localDesktop`, com custo de teste maior que o valor de proteção.

- [ ] **Passo 5: Rodar o teste e confirmar que passa**

```bash
pnpm exec vitest run packages/ui/test/useComposerAttachmentsUpload.test.ts
```

Esperado: todos PASS (incluindo os casos existentes; atenção: a mudança de comportamento em `:499` pode afetar asserções existentes; se algum caso existente falhar, verifique se ele afirma justamente o comportamento "após a troca vai direto para queued", que é justamente o comportamento derrubado por esta tarefa — nesse caso, atualize a asserção e mencione isso na mensagem de commit).

- [ ] **Passo 6: Commitar**

```bash
git add packages/ui/src/v4/composer/useComposerAttachments.ts packages/ui/test/useComposerAttachmentsUpload.test.ts
git commit -m "fix(ui): 换代后附件不再用陈旧 sessionId 入队，改由 restartEpoch 唤醒"
```

---

### Tarefa 5: Contagem separada para o reenvio após troca

A condição `autoRetryCount >= 1` em `:481` faz com que uma única troca consuma a cota de retentativas de upload visível ao usuário. Em dev, mediu-se que o mesmo workspace já chegou a `runtimeGeneration=4` (3 trocas); a contagem combinada reporta falha indevidamente no uso normal. Dividir em dois contadores.

**Arquivos:**
- Modificar: `packages/ui/src/store/composerAttachmentUploadStore.ts` (adicionar campo em `ComposerAttachmentUploadItem`)
- Modificar: `packages/ui/src/v4/composer/useComposerAttachments.ts` (condição em `:481`, incremento em `:509`, três inicializações em `:556`/`:842`/`:896`)
- Teste: `packages/ui/test/useComposerAttachmentsUpload.test.ts`

**Interfaces:**
- Consome: `restartEpoch` da Tarefa 4
- Produz: `ComposerAttachmentUploadItem.runtimeRebuildRetryCount: number`

- [ ] **Passo 1: Escrever o teste que falha**

Adicione ao final de `packages/ui/test/useComposerAttachmentsUpload.test.ts`:

```ts
  it("连续 5 次换代仍重传，第 6 次才判失败，且不消耗 autoRetryCount", async () => {
    const transfer = createTransferService();
    mocks.service = transfer.service;
    const restartListeners = new Set<() => void>();
    const onRuntimeRestart = (listener: () => void) => {
      restartListeners.add(listener);
      return () => restartListeners.delete(listener);
    };
    const probe = renderProbe({
      attachmentSessionId: "draft-1",
      localDesktop: true,
      onRuntimeRestart,
      scopeId: "rebuild-quota",
    });
    await addPaths(["/tmp/c.png"]);
    await vi.waitFor(() => expect(latestApi?.attachments[0]?.uploadStatus).toBe("ready"));

    for (let round = 0; round < 5; round += 1) {
      act(() => {
        for (const listener of [...restartListeners]) listener();
      });
      expect(latestApi?.attachments[0]?.uploadStatus).toBe("waitingSession");
      expect(latestApi?.attachments[0]?.autoRetryCount).toBe(0);
    }

    act(() => {
      for (const listener of [...restartListeners]) listener();
    });
    expect(latestApi?.attachments[0]?.uploadStatus).toBe("failed");
    probe.root.unmount();
  });
```

- [ ] **Passo 2: Rodar o teste e confirmar a falha**

```bash
pnpm exec vitest run packages/ui/test/useComposerAttachmentsUpload.test.ts -t "连续 5 次换代仍重传"
```

Esperado: FAIL — na implementação atual, já na 2ª troca o item é marcado como failed por causa de `autoRetryCount >= 1`.

- [ ] **Passo 3: Adicionar o campo**

Em `packages/ui/src/store/composerAttachmentUploadStore.ts`, insira após `autoRetryCount: number;` (`:25`):

```ts
  /** 因 runtime 换代触发的重传次数；与上传失败重试分开计，避免换代烧掉用户可见配额。 */
  runtimeRebuildRetryCount: number;
```

- [ ] **Passo 4: Mudar a condição e as inicializações**

Em `packages/ui/src/v4/composer/useComposerAttachments.ts`:

Troque `if (item.autoRetryCount >= 1) {` em `:481` por

```ts
          if (item.runtimeRebuildRetryCount >= COMPOSER_ATTACHMENT_REBUILD_RETRY_LIMIT) {
```

Troque `autoRetryCount: current.autoRetryCount + 1,` (naquele bloco alterado na Tarefa 4) por

```ts
            runtimeRebuildRetryCount: current.runtimeRebuildRetryCount + 1,
```

Adicione na região de declaração de constantes do arquivo (perto de `export const ATTACHMENT_UPLOAD_CHUNK_BYTES`, junto da definição de `COMPOSER_ATTACHMENT_COMPLETE_VISIBLE_MS`):

```ts
/** 换代重传兜底上限：dev 实测同一 workspace 可到 generation 4，取 5 留余量。 */
export const COMPOSER_ATTACHMENT_REBUILD_RETRY_LIMIT = 5;
```

Nas três inicializações de item (`:556`, `:842`, `:896`, todas com `autoRetryCount: 0,`), acrescente:

```ts
        runtimeRebuildRetryCount: 0,
```

- [ ] **Passo 5: Rodar toda a suíte de anexos da ui**

```bash
pnpm exec vitest run packages/ui/test/useComposerAttachmentsUpload.test.ts packages/ui/test/chatAttachments.test.ts packages/ui/test/v4ConversationComposerAttachmentProgress.test.ts
```

Esperado: todos PASS. Se algum caso existente construir um literal `ComposerAttachmentUploadItem`, acrescente `runtimeRebuildRetryCount: 0`.

- [ ] **Passo 6: Fazer o typecheck e commitar**

```bash
pnpm exec tsc -p packages/ui/tsconfig.json --noEmit
git add packages/ui/src/store/composerAttachmentUploadStore.ts packages/ui/src/v4/composer/useComposerAttachments.ts packages/ui/test/useComposerAttachmentsUpload.test.ts
git commit -m "fix(ui): 换代重传独立计数，不再烧掉上传失败重试配额"
```

---

## Verificação final

- [ ] Rodar os testes unitários do escopo afetado

```bash
pnpm exec vitest run packages/ui/test/v4DraftSessionPrewarm.test.ts packages/ui/test/v4DraftRuntimeRebuildGate.test.ts packages/ui/test/useComposerAttachmentsUpload.test.ts packages/ui/test/v4SessionPaneComposerContinuity.test.ts
```

- [ ] Validação manual ponta a ponta em dev (os testes unitários não cobrem a temporização real das trocas)

```bash
ZCODE_CUA_DEV_MODE=1 pnpm run dev:desktop
```

Logo após o cold start, cole uma captura de tela no estado de rascunho (**precisa ser colar, não arrastar um arquivo local** — arquivos locais passam por `localZeroCopy` sem upload, o que não reproduz o problema) e espere aparecer o log `cua helper ready`. Esperado: o botão de envio fica cinza por um instante exibindo "会话正在重建，请稍候", depois se recupera automaticamente, a imagem é reenviada e concluída, e clicar em enviar não reporta mais `sessionNotFound`.

- [ ] Confirmar que `fault.subscribe.sessionNotFound` não aparece mais nos logs

---

## Riscos conhecidos

- Este esquema **não elimina a reciclagem em si**; o usuário ainda passa por uma troca de sessão e um reenvio, apenas com autocura.
- O estado de sessão oficial (troca de runtime após o envio) está fora do escopo e ainda falha — isso é responsabilidade do CLI `cold-session-resume`, que retorna `notFound` para sessões não persistidas. É um item subsequente independente.
- A alteração do SessionPane na Tarefa 3 não tem cobertura direta por teste unitário (o componente tem 3787 linhas e o custo de teste é alto); depende do teste do hook da Tarefa 2 e da validação manual final.