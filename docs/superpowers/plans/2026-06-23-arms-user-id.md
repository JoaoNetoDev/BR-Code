# ARMS RUM user.id — plano de implementação para injetar o userId da conta conectada

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** Injetar o `userId` da conta conectada do desktop no `user.id` do ARMS RUM, preencher `device_mid` quando não houver login e sincronizar dinamicamente em login/logout/troca de conta.

**Architecture:** Adicionar um módulo de processo principal de responsabilidade única, `armsUserIdentity.ts`, que resolve «o user.id que deve ser reportado agora» por injeção de dependências (`loadUserId`, `deviceMid`, `setUser`) e grava com deduplicação em `armsRum.setConfig("user", { id })`. No processo principal de `index.ts` conectar três gatilhos: a primeira vez após o init do ARMS, um bypass no callback IPC de login e um fallback no foco da janela. Alterar apenas um ponto no processo principal já cobre principal + renderer (o autoInject propaga o user.id).

**Tech Stack:** TypeScript, processo principal do Electron, `@arms/rum-electron`, vitest.

## Restrições globais

- O SDK do ARMS só é inicializado no processo principal do electron; o hook de logout do OAuth roda no processo filho host derivado por fork, e o processo principal não recebe seus eventos — a sincronização dinâmica só pode depender de sinais alcançáveis no processo principal (após o init, o IPC de login e o window focus).
- `armsRum.setConfig("user", { id })` é o ponto de entrada de atualização em runtime; o `user.id` é propagado automaticamente ao renderer pelo autoInject, **sem alterar renderer/web**.
- Não alterar o processo filho host, o telemetry core próprio, nem os três pontos de `setConfig("properties", { device_mid })`.
- O `pnpm typecheck` da raiz não cobre o desktop main; é preciso validar o `packages/desktop` separadamente com tsc.
- Nos testes unitários, `@arms/rum-electron` já é apontado por `vitest.config.ts` para `armsRumElectronStub`; mas este módulo é testado injetando a dependência `setUser` e não depende diretamente do mock do SDK.
- Reutilizar as variáveis existentes: `createTelemetryUserIdLoader(appTelemetryCredentialService)` em `index.ts:229` e `deviceMid` em `index.ts:353`.

---

### Task 1: módulo armsUserIdentity + testes unitários

**Files:**
- Create: `packages/desktop/src/main/armsUserIdentity.ts`
- Test: `packages/desktop/test/armsUserIdentity.test.ts`

**Interfaces:**
- Consumes: nenhum (injeção de dependência pura).
- Produces:
  - `interface ArmsUserIdentitySyncDeps { loadUserId: () => Promise<string>; deviceMid: string; setUser: (user: { id: string }) => void; }`
  - `interface ArmsUserIdentitySync { refresh: () => Promise<void>; }`
  - `function createArmsUserIdentitySync(deps: ArmsUserIdentitySyncDeps): ArmsUserIdentitySync`

- [ ] **Step 1: Escrever o teste que falha**

Criar `packages/desktop/test/armsUserIdentity.test.ts`:

```typescript
import { describe, expect, it, vi } from "vitest";
import { createArmsUserIdentitySync } from "../src/main/armsUserIdentity.js";

const DEVICE_MID = "device-mid-abc";

describe("armsUserIdentity", () => {
  it("未登录时回填 device_mid 作为 user.id", async () => {
    const setUser = vi.fn();
    const sync = createArmsUserIdentitySync({
      loadUserId: async () => "",
      deviceMid: DEVICE_MID,
      setUser,
    });
    await sync.refresh();
    expect(setUser).toHaveBeenCalledTimes(1);
    expect(setUser).toHaveBeenCalledWith({ id: DEVICE_MID });
  });

  it("已登录时用账号 id 作为 user.id", async () => {
    const setUser = vi.fn();
    const sync = createArmsUserIdentitySync({
      loadUserId: async () => "acc-123",
      deviceMid: DEVICE_MID,
      setUser,
    });
    await sync.refresh();
    expect(setUser).toHaveBeenCalledWith({ id: "acc-123" });
  });

  it("id 未变化时去重，不重复 setUser", async () => {
    const setUser = vi.fn();
    const sync = createArmsUserIdentitySync({
      loadUserId: async () => "acc-123",
      deviceMid: DEVICE_MID,
      setUser,
    });
    await sync.refresh();
    await sync.refresh();
    expect(setUser).toHaveBeenCalledTimes(1);
  });

  it("登录后登出，回填 device_mid 并再次写入", async () => {
    const setUser = vi.fn();
    let current = "acc-123";
    const sync = createArmsUserIdentitySync({
      loadUserId: async () => current,
      deviceMid: DEVICE_MID,
      setUser,
    });
    await sync.refresh();
    current = "";
    await sync.refresh();
    expect(setUser).toHaveBeenCalledTimes(2);
    expect(setUser).toHaveBeenLastCalledWith({ id: DEVICE_MID });
  });

  it("loadUserId 抛错时按未登录处理，落 device_mid 且不抛", async () => {
    const setUser = vi.fn();
    const sync = createArmsUserIdentitySync({
      loadUserId: async () => {
        throw new Error("cred read failed");
      },
      deviceMid: DEVICE_MID,
      setUser,
    });
    await expect(sync.refresh()).resolves.toBeUndefined();
    expect(setUser).toHaveBeenCalledWith({ id: DEVICE_MID });
  });

  it("并发 refresh 不把旧值写回（末次值生效）", async () => {
    const setUser = vi.fn();
    const values = ["acc-1", "acc-2"];
    let i = 0;
    const sync = createArmsUserIdentitySync({
      loadUserId: async () => {
        const v = values[i] ?? "acc-2";
        i += 1;
        await new Promise((r) => setTimeout(r, v === "acc-1" ? 20 : 0));
        return v;
      },
      deviceMid: DEVICE_MID,
      setUser,
    });
    await Promise.all([sync.refresh(), sync.refresh()]);
    // 最终写入的 user.id 必须是 acc-2（末次），不能被慢的 acc-1 覆盖
    const lastCall = setUser.mock.calls.at(-1);
    expect(lastCall?.[0]).toEqual({ id: "acc-2" });
  });
});
```

- [ ] **Step 2: Executar o teste para verificar que ele falha**

Run: `pnpm vitest run packages/desktop/test/armsUserIdentity.test.ts`
Expected: FAIL — não é possível resolver `../src/main/armsUserIdentity.js` / `createArmsUserIdentitySync is not a function`.

- [ ] **Step 3: Escrever a implementação mínima**

Criar `packages/desktop/src/main/armsUserIdentity.ts`:

```typescript
export interface ArmsUserIdentitySyncDeps {
  /** 读当前登录账号 id；未登录返回空串 */
  loadUserId: () => Promise<string>;
  /** 未登录兜底用的设备维度 id */
  deviceMid: string;
  /** 写入 ARMS user 配置（默认包装 armsRum.setConfig("user", ...)） */
  setUser: (user: { id: string }) => void;
}

export interface ArmsUserIdentitySync {
  /** 解析当前应上报的 user.id 并在变化时写入 ARMS（带去重、并发末次生效） */
  refresh: () => Promise<void>;
}

/**
 * 主进程 ARMS RUM 用户身份同步：登录账号 id 优先，未登录回填 device_mid。
 * 注入式依赖，便于单测；并发 refresh 以「末次解析值」为准，避免慢请求把旧值写回。
 */
export function createArmsUserIdentitySync(
  deps: ArmsUserIdentitySyncDeps,
): ArmsUserIdentitySync {
  let lastWrittenId: string | null = null;
  // 并发序号：refresh 解析完成后只有「最新一次」允许写入
  let latestTicket = 0;

  async function refresh(): Promise<void> {
    const ticket = ++latestTicket;
    let resolvedId: string;
    try {
      resolvedId = (await deps.loadUserId()) || deps.deviceMid;
    } catch {
      // 读凭据失败按未登录处理，保证 user.id 始终非空
      resolvedId = deps.deviceMid;
    }

    // 有更晚的 refresh 已发起，放弃本次写入，避免旧值覆盖新值
    if (ticket !== latestTicket) {
      return;
    }
    if (resolvedId === lastWrittenId) {
      return;
    }
    lastWrittenId = resolvedId;
    deps.setUser({ id: resolvedId });
  }

  return { refresh };
}
```

- [ ] **Step 4: Executar o teste para verificar que ele passa**

Run: `pnpm vitest run packages/desktop/test/armsUserIdentity.test.ts`
Expected: PASS (os 6 casos passam).

- [ ] **Step 5: Commit**

```bash
git add packages/desktop/src/main/armsUserIdentity.ts packages/desktop/test/armsUserIdentity.test.ts
git commit -m "feat(desktop): armsUserIdentity 解析并去重写入 ARMS user.id"
```

---

### Task 2: ligação em index.ts (primeira vez + fallback de foco)

**Files:**
- Modify: `packages/desktop/src/main/index.ts` (área de import; construir o sync após a definição de `deviceMid`; acrescentar o refresh dentro de `syncAppTelemetryInteractiveState`; primeiro refresh após `await armsInitPromise`)

**Interfaces:**
- Consumes: o `createArmsUserIdentitySync` da Task 1; os já existentes `createTelemetryUserIdLoader(appTelemetryCredentialService)`, `deviceMid`, `armsRum` (`appARMSBootstrap` usa o export default de `@arms/rum-electron`).
- Produces: `armsUserIdentitySync` em nível de módulo (para a Task 3 chamar no bypass do callback IPC).

- [ ] **Step 1: Confirmar a disponibilidade de armsRum em index.ts**

Run: `grep -nE "^import armsRum|from \"@arms/rum-electron\"" packages/desktop/src/main/index.ts`
Expected: se não houver saída, index.ts ainda não importa armsRum diretamente; no Step 2 é preciso adicionar `import armsRum from "@arms/rum-electron";` (export default, igual a `appARMSBootstrap.ts:1`).

- [ ] **Step 2: Adicionar o import e construir o sync**

Adicionar na área de import do topo de `packages/desktop/src/main/index.ts` (pular essa linha se o Step 1 já mostrar um import de armsRum):

```typescript
import armsRum from "@arms/rum-electron";
import { createArmsUserIdentitySync } from "./armsUserIdentity.js";
```

Adicionar depois de `const deviceMid = createHash(...).slice(0, 32);` (aproximadamente `index.ts:353-356`):

```typescript
const armsUserIdentitySync = createArmsUserIdentitySync({
  loadUserId: createTelemetryUserIdLoader(appTelemetryCredentialService),
  deviceMid,
  setUser: (user) => armsRum.setConfig("user", user),
});
```

- [ ] **Step 3: Acrescentar a atualização de fallback dentro do handler de foco**

Alterar `syncAppTelemetryInteractiveState` (`index.ts:241-247`) para:

```typescript
function syncAppTelemetryInteractiveState(): void {
  appTelemetryRuntime.setInteractive(
    BrowserWindow.getAllWindows().some(
      (win) => !win.isDestroyed() && win.isVisible() && win.isFocused(),
    ),
  );
  // 登出/切号发生在 host 子进程，主进程无即时信号；窗口聚焦时兜底刷新 ARMS user.id
  void armsUserIdentitySync.refresh();
}
```

- [ ] **Step 4: Primeiro refresh após o init do ARMS**

Adicionar depois de `await armsInitPromise;` (`index.ts:1221`) e antes de `configureDesktopStabilityTelemetry({`:

```typescript
  // ARMS init 完成后首次写入 user.id（通常未登录 → 落 device_mid）
  void armsUserIdentitySync.refresh();
```

- [ ] **Step 5: typecheck**

Run: `cd packages/desktop && pnpm exec tsc -p tsconfig.main.json --noEmit`
(se esse nome de tsconfig não existir, rodar primeiro `ls packages/desktop/tsconfig*.json` e escolher o que cobre `src/main`; o desktop main usa o tsconfig do lado node.)
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/src/main/index.ts
git commit -m "feat(desktop): ARMS init 后与窗口聚焦时同步 user.id"
```

---

### Task 3: atualização imediata no callback de login (bypass do IPC)

**Files:**
- Modify: `packages/desktop/src/main/desktopMainIpcRemote.ts` (adicionar callback opcional às options de `registerRemoteIpcHandlers`; disparar dentro do listener de `OAuthCallbackHandled`)
- Modify: `packages/desktop/src/main/index.ts` (passar o callback no ponto de chamada)

**Interfaces:**
- Consumes: `armsUserIdentitySync.refresh` da Task 2.
- Produces: nova option `onOAuthCallbackHandledSideEffect?: () => void` em `registerRemoteIpcHandlers`.

- [ ] **Step 1: Adicionar o callback opcional ao tipo de options**

No tipo de `registerRemoteIpcHandlers(options: { ... })` em `desktopMainIpcRemote.ts`, adicionar uma linha depois do campo `appTelemetryRuntime`:

```typescript
  /** OAuth 回调处理完成后的额外副作用（如刷新 ARMS user.id）；不影响既有 runtime 流程 */
  onOAuthCallbackHandledSideEffect?: () => void;
```

- [ ] **Step 2: Disparar o efeito colateral dentro do listener**

Alterar o listener de `OAuthCallbackHandled` (`desktopMainIpcRemote.ts:157-159`) para:

```typescript
  ipcMain.on(PlatformChannels.OAuthCallbackHandled, (event) => {
    options.appTelemetryRuntime.onOAuthCallbackHandled({ rendererId: event.sender.id });
    options.onOAuthCallbackHandledSideEffect?.();
  });
```

- [ ] **Step 3: Passar o callback no ponto de chamada**

Na chamada `registerRemoteIpcHandlers({ ... })` em `index.ts` (`index.ts:1199`), adicionar uma linha depois de `appTelemetryRuntime,`:

```typescript
    onOAuthCallbackHandledSideEffect: () => {
      void armsUserIdentitySync.refresh();
    },
```

- [ ] **Step 4: typecheck**

Run: `cd packages/desktop && pnpm exec tsc -p tsconfig.main.json --noEmit`
Expected: sem erros.

- [ ] **Step 5: Rodar os testes existentes de IPC/telemetry para confirmar que não houve regressão**

Run: `pnpm vitest run packages/desktop/test/armsUserIdentity.test.ts packages/desktop/test/desktopNetworkTelemetry.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/desktop/src/main/desktopMainIpcRemote.ts packages/desktop/src/main/index.ts
git commit -m "feat(desktop): 登录回调完成后即时刷新 ARMS user.id"
```

---

### Task 4: Verificação completa

**Files:** sem alterações (apenas verificação).

- [ ] **Step 1: Rodar os testes unitários do novo módulo**

Run: `pnpm vitest run packages/desktop/test/armsUserIdentity.test.ts`
Expected: PASS.

- [ ] **Step 2: typecheck do desktop main**

Run: `cd packages/desktop && pnpm exec tsc -p tsconfig.main.json --noEmit`
Expected: sem erros.

- [ ] **Step 3: typecheck da raiz (confirmar que os tipos compartilhados não foram quebrados)**

Run: `pnpm typecheck`
Expected: sem erros.

- [ ] **Step 4: (Opcional) Nota de smoke test**

Após o start em dev, o backend do ARMS deve mostrar `user.id` = id da conta para uma sessão conectada; para uma sessão sem login, deve mostrar `device_mid`. Não há asserção automatizada; registrar como item de verificação manual.

---

## Self-Review

**1. Cobertura do spec:**
- Novo módulo `armsUserIdentity.ts` + deduplicação → Task 1 ✓
- Três gatilhos (após o init / fallback de foco / bypass do IPC de login) → Task 2 (init+focus), Task 3 (IPC) ✓
- Preenchimento com device_mid quando não há login e fallback de exceção → testes e implementação da Task 1 ✓
- Alterar apenas o processo principal, sem tocar em host/property/renderer/web → arquivos alterados somente `armsUserIdentity.ts`/`index.ts`/`desktopMainIpcRemote.ts` ✓
- 6 cenários de teste unitário → cobertos pela Task 1 (inclusive «última resolução vence» na concorrência, que vai além do spec mas corresponde à restrição de concorrência da implementação) ✓
- Verificação (tsc separado do desktop + vitest) → Task 4 ✓

**2. Varredura de placeholders:** nenhum TBD/TODO; o nome do tsconfig tem uma etapa de confirmação explícita com `ls` (Task 2 Step 5), que é um ramo explícito e não um placeholder. O import do armsRum é decidido pelo grep do Step 1, não é placeholder.

**3. Consistência de tipos:** `createArmsUserIdentitySync` / `ArmsUserIdentitySyncDeps` (`loadUserId`/`deviceMid`/`setUser`) / `ArmsUserIdentitySync.refresh` são definidos na Task 1 e referenciados de forma consistente nas Tasks 2/3; `onOAuthCallbackHandledSideEffect` é definido no Step 1 da Task 3 e usado no Step 3, com o mesmo nome.
