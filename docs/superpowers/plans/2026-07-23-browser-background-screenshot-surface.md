# Browser Background Screenshot Surface Implementation Plan

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Sem trocar a tab ativa atual da barra lateral do usuário, sem roubar foco e sem piscar, estabelecer para o `<webview>` browser-use em segundo plano uma superfície de composição de screenshot verificável, eliminando a geração de screenshots `1274 × 720` por ladrilhamento da surface antiga `800 × 450` pelo Chromium.

**Arquitetura:** `BrowserGuestManager`, antes de qualquer comando de screenshot realmente entrar no CDP, inicia um handshake de preparação com escopo completo de browser via um `BrowserScreenshotSurfaceCoordinator` injetável para o renderer owner. O renderer coloca temporariamente a tab browser-use inativa alvo em uma capture layer abaixo da área de conteúdo atual da barra lateral, aguarda `<webview>` estabilizar em dois animation frames consecutivos e então faz ACK; o main valida janela, sender, request, guest id e viewport antes de permitir `Page.captureScreenshot`, e faz release idempotente depois que o backend real assentar.

**Stack tecnológico:** TypeScript 6, Electron 41 `<webview>`/IPC/CDP, React 19, Radix Tabs, Tailwind CSS, Vitest + Testing Library, smoke de compositor Electron isolado.

## Restrições Globais

- Os fatos de design têm como autoridade `docs/superpowers/specs/2026-07-23-browser-background-screenshot-surface-design.md`; atualize primeiro o BCP-213 em `docs/testing/browser-use-codex-parity-coverage-matrix.md` e só então modifique a implementação. BCP-209 já foi usado pelo `release/v3.5.0` mais recente para "caminho absoluto de screenshot explícito"; esta correção foi adiada para o próximo número não ocupado.
- A árvore de trabalho atual contém modificações não commitadas de outra tarefa de crash-recovery de browser guest em
  `browserGuestManager.ts`, `browserGuestManager.test.ts`, `AnimatedSidePanePanel.tsx`,
  `UnifiedBrowserView.tsx`, `BrowserViewportSurface.tsx`, `electron-webview.d.ts` e seus testes;
  antes de executar é obrigatório esperar esses arquivos estabilizarem e reler o diff final, proibindo sobrescrever ou reverter essas mudanças.
- Não modificar `@zcode/protocol`, não adicionar relay, task, stream, queue, snapshot ou estado replayable; prepare/ready/release são apenas IPC transitório de plataforma entre o main do desktop e o renderer owner.
- A identidade de workspace continua usando `workspaceKey = workspaceIdentity?.trim() || workspacePath`; as mensagens devem carregar simultaneamente `workspaceKey`, `sessionId`, `browserId`, `browserGeneration`, `tabId`, `webContentsId` e `requestId`.
- O orçamento total padrão de prepare é fixo em `3000ms`; o main passa o `timeoutMs` real pelo payload de prepare para o renderer, e o deadline local de verificação de segurança do renderer é `timeoutMs + 1000ms`. A comparação de viewport permite no máximo `1px` de erro de arredondamento por lado.
- A capture layer de segundo plano deve ser `pointer-events: none`, `inert`, `aria-hidden=true`, não pode alterar o active value do Radix Tabs e não pode chamar `.focus()`.
- Logs de handshake de alta frequência da UI usam apenas `logger.debug` de `packages/ui/src/logger.ts`; o main usa apenas o `logger.debug` existente e não registra imagem em base64, corpo da página ou URL completa.
- Quando a preparação do screenshot falhar, não deve chamar `Page.captureScreenshot`; o screenshot explícito retorna falha estruturada, e o screenshot automático de fim de turno mantém a semântica existente de skip best-effort.
- Cor, camada e fundo da capture layer reutilizam apenas os tokens semânticos de `DESIGN.md`; não adicionar cor específica de plataforma, dica visível ou texto novo, portanto não gerar nova chave de i18n.
- Os fatos persistentes de imagem existentes de desktop `desktop-continuous` e mobile `web-remote-replayable` não mudam;
  o celular continua chamando a janela desktop owner via shared-host attachment e não cria um runtime de browser separado.
- Windows, macOS e Linux compartilham a mesma interface; a implementação concluída deve executar `pnpm typecheck` e `pnpm lint`.

---

## Estrutura de Arquivos

### Arquivos novos

- `packages/desktop/src/main/browserView/browserScreenshotSurfaceCoordinator.ts`
  - Responsável apenas pela correlação de requests prepare/ready/release no main, timeout padrão de `3000ms`, abort, validação de janela/sender/viewport e limpeza idempotente.
- `packages/desktop/test/browserScreenshotSurfaceCoordinator.test.ts`
  - Cobre a máquina de estados do coordenador com sender/callback de envio falsos, sem iniciar o Electron.
- `packages/ui/src/browser-use/BrowserUseSidePaneContent.tsx`
  - Responsável apenas pelo layout da capture-layer do `TabsContent` de browser-use e pelo isolamento de interação.
- `packages/ui/src/browser-use/useBrowserScreenshotSurfaceRequest.ts`
  - Responsável apenas pela assinatura de prepare/release na raiz da barra lateral, pelo casamento de escopo completo e pelo estado de request único.
- `packages/ui/src/browser-use/useBrowserScreenshotSurfaceReady.ts`
  - Responsável apenas por observar o `<webview>` atual, aguardar dois animation frames estáveis e enviar ready.
- `packages/ui/test/BrowserUseSidePaneContent.test.ts`
  - Prova que a tab inativa é temporariamente compostável, mas continua não interativa e não focalizável, voltando a hidden após release.
- `packages/desktop/scripts/browser-screenshot-surface-smoke.mjs`
  - Usa um `<webview>` Electron real e sentinelas nos quatro cantos para verificar que a captura em segundo plano não repete mais `800 × 450` periodicamente.

### Arquivos modificados

- `docs/testing/browser-use-codex-parity-coverage-matrix.md`
  - Adiciona BCP-213, fixando a fronteira de aceitação desta correção.
- `packages/shared/src/platform.ts`
  - Define os três payloads estritos e estende o `IPlatformService`.
- `packages/shared/src/channels.ts`
  - Acrescenta três `PlatformChannels` e o contrato request/response.
- `packages/desktop/src/preload/index.ts`
  - Expõe o listener prepare/release e o sender de ready.
- `packages/desktop/src/renderer/src/main.tsx`
  - Injeta a bridge do preload no `IPlatformService` da UI.
- `packages/desktop/src/main/desktopBrowserViewIpc.ts`
  - Só aceita ready de sender window confiável e entrega `windowId + senderWebContentsId` ao coordenador.
- `packages/desktop/src/main/desktopMainIpcPlatform.ts`
  - Passa o callback de ready para a função de registro de IPC do browser.
- `packages/desktop/src/main/index.ts`
  - Cria o coordenador, injeta no `BrowserGuestManager` e conecta o envio main→renderer e o ready renderer→main.
- `packages/desktop/src/main/browserView/browserGuestManager.ts`
  - Adiciona o portão "ler viewport CSS → prepare → capture → release" para screenshot/elementScreenshot.
- `packages/desktop/test/desktopBrowserViewIpc.test.ts`
  - Cobre a association de janela confiável do ready.
- `packages/desktop/test/preloadDisposer.test.ts`
  - Cobre o novo disposer de listener e o sender de ready.
- `packages/desktop/test/browserGuestManager.test.ts`
  - Cobre ordem de chamada, falha sem capture, release em sucesso/exceção/abort e o backpressure in-flight existente.
- `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx`
  - Adiciona uma pilha de conteúdo com posicionamento relativo e entrega o branch browser-use ao novo componente.
- `packages/ui/src/browser-use/UnifiedBrowserView.tsx`
  - Recebe o surface request transitório; durante a preparação em segundo plano apenas restaura o layout, sem mudar a semântica de interação de `isVisible`.
- `packages/ui/test/UnifiedBrowserView.test.ts`
  - Cobre os portões de guest id, frame estável e casamento de viewport.
- `packages/desktop/package.json`
  - Acrescenta um comando explícito e não padrão de smoke com Electron real.

---

### Task 1: Congelar BCP-213 e o contrato de plataforma entre processos

**Arquivos:**
- Modify: `docs/testing/browser-use-codex-parity-coverage-matrix.md:108-111`
- Modify: `packages/shared/src/platform.ts:52-68`
- Modify: `packages/shared/src/platform.ts:535-566`
- Modify: `packages/shared/src/channels.ts:202-212`
- Modify: `packages/shared/src/channels.ts:626-655`
- Modify: `packages/desktop/src/preload/index.ts:20-35`
- Modify: `packages/desktop/src/preload/index.ts:364-432`
- Modify: `packages/desktop/src/renderer/src/main.tsx:215-230`
- Test: `packages/desktop/test/preloadDisposer.test.ts`

**Interfaces:**
- Consumes: `BrowserViewOperationPayload`, `BrowserViewportSize`, `IPlatformService` e `PlatformChannels` já existentes.
- Produces:

```ts
export interface BrowserViewScreenshotSurfacePreparePayload
  extends BrowserViewOperationPayload {
  requestId: string;
  webContentsId: number;
  viewport: BrowserViewportSize;
  timeoutMs?: number;
}

export interface BrowserViewScreenshotSurfaceReadyPayload
  extends BrowserViewScreenshotSurfacePreparePayload {}

export type BrowserViewScreenshotSurfaceReleasePayload = Omit<
  BrowserViewScreenshotSurfacePreparePayload,
  "viewport" | "timeoutMs"
>;
```

`IPlatformService` ganha:

```ts
onBrowserViewScreenshotSurfacePrepare?(
  handler: (payload: BrowserViewScreenshotSurfacePreparePayload) => void,
): () => void;
onBrowserViewScreenshotSurfaceRelease?(
  handler: (payload: BrowserViewScreenshotSurfaceReleasePayload) => void,
): () => void;
browserViewScreenshotSurfaceReady?(
  payload: BrowserViewScreenshotSurfaceReadyPayload,
): void;
```

- [ ] **Step 1: Escrever primeiro o contrato de produto pré-falha na matriz de cobertura**

Adicionar depois de BCP-208 em `docs/testing/browser-use-codex-parity-coverage-matrix.md`:

```markdown
| BCP-213 | 后台 browser-use 截图合成表面 | inactive `<webview>` 截图前必须在 owner renderer 的后台 capture layer 完成当前 CSS viewport 合成；不切 tab、不抢焦点；ready 前和 prepare 失败后禁止 `Page.captureScreenshot`；成功、异常、取消和 late settle 均幂等 release；四角 sentinel 不得出现旧 `800 × 450` surface 的周期重复 | 自动化：shared/preload/main IPC + coordinator/manager/UI component；真实 Electron compositor smoke |
```

- [ ] **Step 2: Escrever o teste falho da bridge do preload**

Adicionar em `packages/desktop/test/preloadDisposer.test.ts`:

```ts
it("browser screenshot surface bridge 转发 prepare/release，并用 send 上报 ready", async () => {
  const api = await loadPreload();
  const prepare = vi.fn();
  const release = vi.fn();
  const disposePrepare = api.onBrowserViewScreenshotSurfacePrepare(prepare) as () => void;
  const disposeRelease = api.onBrowserViewScreenshotSurfaceRelease(release) as () => void;
  const payload = {
    requestId: "shot-1",
    workspaceKey: "remote:ssh:dev:/repo",
    sessionId: "sess-1",
    browserId: "browser-1",
    browserGeneration: 3,
    tabId: "tab-1",
    webContentsId: 42,
    viewport: { width: 1274, height: 720 },
  };

  for (const handler of listeners.get(PlatformChannels.BrowserViewScreenshotSurfacePrepare) ?? []) {
    handler({}, payload);
  }
  const { viewport: _viewport, ...releasePayload } = payload;
  for (const handler of listeners.get(PlatformChannels.BrowserViewScreenshotSurfaceRelease) ?? []) {
    handler({}, releasePayload);
  }
  api.browserViewScreenshotSurfaceReady(payload);

  expect(prepare).toHaveBeenCalledWith(payload);
  expect(release).toHaveBeenCalledWith(expect.objectContaining({ requestId: "shot-1" }));
  expect(mockIpcSend).toHaveBeenCalledWith(
    PlatformChannels.BrowserViewScreenshotSurfaceReady,
    payload,
  );

  disposePrepare();
  disposeRelease();
  expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
    PlatformChannels.BrowserViewScreenshotSurfacePrepare,
    expect.any(Function),
  );
  expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
    PlatformChannels.BrowserViewScreenshotSurfaceRelease,
    expect.any(Function),
  );
});
```

- [ ] **Step 3: Executar o teste e confirmar que o contrato ainda não existe**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/preloadDisposer.test.ts -t "browser screenshot surface bridge"
```

Expected: FAIL, com erro contendo `BrowserViewScreenshotSurfacePrepare` ou `api.onBrowserViewScreenshotSurfacePrepare is not a function`.

- [ ] **Step 4: Adicionar payloads do shared, canais e contrato de IPC**

Em `packages/shared/src/platform.ts`, adicionar os três tipos de `Interfaces` desta tarefa logo após `BrowserViewViewportChangedPayload`, e adicionar os três métodos na área de métodos de BrowserView do `IPlatformService`.

Adicionar em `packages/shared/src/channels.ts`:

```ts
/** Main → Renderer：截图前请求 owner renderer 准备后台 guest 合成表面。 */
BrowserViewScreenshotSurfacePrepare: "zcode:browser-view-screenshot-surface-prepare",
/** Renderer → Main：目标 guest 连续两个 animation frame 的 viewport 已稳定。 */
BrowserViewScreenshotSurfaceReady: "zcode:browser-view-screenshot-surface-ready",
/** Main → Renderer：截图结束或准备失败，释放临时后台合成层。 */
BrowserViewScreenshotSurfaceRelease: "zcode:browser-view-screenshot-surface-release",
```

E adicionar em `PlatformIpcContract`:

```ts
[PlatformChannels.BrowserViewScreenshotSurfacePrepare]: {
  request: BrowserViewScreenshotSurfacePreparePayload;
  response: void;
};
[PlatformChannels.BrowserViewScreenshotSurfaceReady]: {
  request: BrowserViewScreenshotSurfaceReadyPayload;
  response: void;
};
[PlatformChannels.BrowserViewScreenshotSurfaceRelease]: {
  request: BrowserViewScreenshotSurfaceReleasePayload;
  response: void;
};
```

- [ ] **Step 5: Implementar o preload e o platform adapter do renderer**

Importar os três payload types em `packages/desktop/src/preload/index.ts` e adicionar em `exposeInMainWorld("zcode", …)`:

```ts
onBrowserViewScreenshotSurfacePrepare: (
  callback: (payload: BrowserViewScreenshotSurfacePreparePayload) => void,
): (() => void) => {
  const handler = (_event: unknown, payload: BrowserViewScreenshotSurfacePreparePayload) =>
    callback(payload);
  ipcRenderer.on(PlatformChannels.BrowserViewScreenshotSurfacePrepare, handler);
  return () =>
    ipcRenderer.removeListener(PlatformChannels.BrowserViewScreenshotSurfacePrepare, handler);
},
onBrowserViewScreenshotSurfaceRelease: (
  callback: (payload: BrowserViewScreenshotSurfaceReleasePayload) => void,
): (() => void) => {
  const handler = (_event: unknown, payload: BrowserViewScreenshotSurfaceReleasePayload) =>
    callback(payload);
  ipcRenderer.on(PlatformChannels.BrowserViewScreenshotSurfaceRelease, handler);
  return () =>
    ipcRenderer.removeListener(PlatformChannels.BrowserViewScreenshotSurfaceRelease, handler);
},
browserViewScreenshotSurfaceReady: (payload: BrowserViewScreenshotSurfaceReadyPayload): void => {
  ipcRenderer.send(PlatformChannels.BrowserViewScreenshotSurfaceReady, payload);
},
```

Adicionar no platform adapter de `packages/desktop/src/renderer/src/main.tsx`:

```ts
onBrowserViewScreenshotSurfacePrepare: (handler) =>
  window.zcode.onBrowserViewScreenshotSurfacePrepare?.(handler) ?? (() => {}),
onBrowserViewScreenshotSurfaceRelease: (handler) =>
  window.zcode.onBrowserViewScreenshotSurfaceRelease?.(handler) ?? (() => {}),
browserViewScreenshotSurfaceReady: (payload) =>
  window.zcode.browserViewScreenshotSurfaceReady?.(payload),
```

- [ ] **Step 6: Executar o teste da bridge e o typecheck de shared/desktop**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/preloadDisposer.test.ts
pnpm exec tsc -p packages/desktop/tsconfig.json --noEmit
```

Expected: suite do preload PASS; o TypeScript não reporta mais canais novos nem métodos `window.zcode` ausentes.

- [ ] **Step 7: Commitar o contrato de plataforma**

```powershell
git add docs/testing/browser-use-codex-parity-coverage-matrix.md packages/shared/src/platform.ts packages/shared/src/channels.ts packages/desktop/src/preload/index.ts packages/desktop/src/renderer/src/main.tsx packages/desktop/test/preloadDisposer.test.ts
git commit -m "feat(browser-use): add screenshot surface IPC contract"
```

Expected: commit bem-sucedido e sem conter os arquivos da tarefa concorrente de crash-recovery.

---

### Task 2: Coordenador de screenshot surface no main e entrada de ready confiável

**Arquivos:**
- Create: `packages/desktop/src/main/browserView/browserScreenshotSurfaceCoordinator.ts`
- Create: `packages/desktop/test/browserScreenshotSurfaceCoordinator.test.ts`
- Modify: `packages/desktop/src/main/desktopBrowserViewIpc.ts:1-65`
- Modify: `packages/desktop/src/main/desktopMainIpcPlatform.ts:35-90`
- Modify: `packages/desktop/test/desktopBrowserViewIpc.test.ts`

**Interfaces:**
- Consumes: os três payloads da Task 1, `webContents.id` do sender Electron e o `BrowserWindow.fromWebContents(event.sender)` confiável.
- Produces:

```ts
export interface BrowserScreenshotSurfaceLease {
  webContentsId: number;
  viewport: BrowserViewportSize;
  release(): void;
}

export interface BrowserScreenshotSurfaceCoordinator {
  prepare(input: {
    requestId: string;
    windowId: number;
    workspaceKey: string;
    sessionId: string;
    browserId: string;
    browserGeneration: number;
    tabId: string;
    webContentsId: number;
    viewport: BrowserViewportSize;
    signal: AbortSignal;
  }): Promise<BrowserScreenshotSurfaceLease>;
}

export class DesktopBrowserScreenshotSurfaceCoordinator
  implements BrowserScreenshotSurfaceCoordinator {
  constructor(options: {
    timeoutMs?: number;
    sendPrepare(windowId: number, payload: BrowserViewScreenshotSurfacePreparePayload): boolean;
    sendRelease(windowId: number, payload: BrowserViewScreenshotSurfaceReleasePayload): void;
    log?(message: string): void;
  });
  handleReady(input: {
    windowId: number;
    senderWebContentsId: number;
    payload: BrowserViewScreenshotSurfaceReadyPayload;
  }): void;
  handleWindowDestroyed(windowId: number): void;
  dispose(): void;
}
```

Adicionar em `desktopBrowserViewIpc.ts`:

```ts
export type ReportBrowserScreenshotSurfaceReady = (
  windowId: number,
  senderWebContentsId: number,
  payload: BrowserViewScreenshotSurfaceReadyPayload,
) => void;
```

- [ ] **Step 1: Escrever os testes falhos da máquina de estados do coordenador**

Criar `packages/desktop/test/browserScreenshotSurfaceCoordinator.test.ts`, cobrindo:

```ts
import { describe, expect, it, vi } from "vitest";
import { DesktopBrowserScreenshotSurfaceCoordinator } from "../src/main/browserView/browserScreenshotSurfaceCoordinator.js";

const input = {
  requestId: "shot-1",
  windowId: 7,
  workspaceKey: "remote:ssh:dev:/repo",
  sessionId: "sess-1",
  browserId: "browser-1",
  browserGeneration: 4,
  tabId: "tab-1",
  webContentsId: 42,
  viewport: { width: 1274, height: 720 },
};

describe("DesktopBrowserScreenshotSurfaceCoordinator", () => {
  it("只接受同 window/sender/request/guest 且 viewport 误差不超过 1px 的 ready", async () => {
    const sendPrepare = vi.fn(() => true);
    const sendRelease = vi.fn();
    const coordinator = new DesktopBrowserScreenshotSurfaceCoordinator({
      sendPrepare,
      sendRelease,
      timeoutMs: 100,
    });
    const pending = coordinator.prepare({ ...input, signal: new AbortController().signal });
    coordinator.handleReady({
      windowId: 7,
      senderWebContentsId: 700,
      payload: { ...input, viewport: { width: 1275, height: 719 } },
    });

    const lease = await pending;
    expect(lease).toMatchObject({
      webContentsId: 42,
      viewport: { width: 1275, height: 719 },
    });
    lease.release();
    lease.release();
    expect(sendRelease).toHaveBeenCalledTimes(1);
  });

  it("默认 3000ms timeout 会 release，迟到 ready 不能复活请求", async () => {
    vi.useFakeTimers();
    const sendRelease = vi.fn();
    const coordinator = new DesktopBrowserScreenshotSurfaceCoordinator({
      sendPrepare: () => true,
      sendRelease,
    });
    const pending = coordinator.prepare({ ...input, signal: new AbortController().signal });
    await vi.advanceTimersByTimeAsync(3000);
    await expect(pending).rejects.toThrow("timed out");
    coordinator.handleReady({
      windowId: 7,
      senderWebContentsId: 700,
      payload: input,
    });
    expect(sendRelease).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
```

Adicionar ainda três `it` independentes no mesmo arquivo: sender/window errados são ignorados; depois do primeiro viewport mismatch o segundo ready tem sucesso; tanto `handleWindowDestroyed` quanto `dispose` rejeitam o pending e fazem release só uma vez.

- [ ] **Step 2: Escrever o teste falho do IPC de ready do renderer confiável**

Adicionar em `packages/desktop/test/desktopBrowserViewIpc.test.ts`:

```ts
it("只把可信 sender window 的 screenshot surface ready 交给协调器", async () => {
  const reportReady = vi.fn();
  const sender = { id: 700 };
  h.fromWebContents.mockReturnValue({ id: 17, isDestroyed: () => false });
  const { registerBrowserViewIpcHandlers } =
    await import("../src/main/desktopBrowserViewIpc.js");
  registerBrowserViewIpcHandlers(undefined, undefined, reportReady);
  const handler = h.listeners.get(PlatformChannels.BrowserViewScreenshotSurfaceReady);
  const payload = {
    requestId: "shot-1",
    workspaceKey: "workspace-1",
    sessionId: "sess-1",
    browserId: "browser-1",
    browserGeneration: 2,
    tabId: "tab-1",
    webContentsId: 42,
    viewport: { width: 1274, height: 720 },
  };

  handler?.({ sender }, payload);

  expect(reportReady).toHaveBeenCalledWith(17, 700, payload);
});
```

Ao mesmo tempo, estender o mock de Electron desse teste para:

```ts
listeners: new Map<string, IpcHandler>(),
ipcMain: {
  handle: vi.fn((channel: string, handler: IpcHandler) => h.handlers.set(channel, handler)),
  on: vi.fn((channel: string, handler: IpcHandler) => h.listeners.set(channel, handler)),
},
```

- [ ] **Step 3: Executar os dois testes e confirmar que o arquivo e a entrada IPC ainda não existem**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/browserScreenshotSurfaceCoordinator.test.ts packages/desktop/test/desktopBrowserViewIpc.test.ts
```

Expected: FAIL, contendo ao menos
`Cannot find module '../src/main/browserView/browserScreenshotSurfaceCoordinator.js'`.

- [ ] **Step 4: Implementar a máquina de estados mínima do coordenador**

Criar `packages/desktop/src/main/browserView/browserScreenshotSurfaceCoordinator.ts`. A implementação central deve usar um `pendingByRequestId` e limpar timer e abort listener de forma unificada por `finishError` / `finishReady`:

```ts
import { BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS } from "@zcode/shared";

const DEFAULT_SCREENSHOT_SURFACE_TIMEOUT_MS =
  BROWSER_SCREENSHOT_SURFACE_PREPARE_TIMEOUT_MS;
const VIEWPORT_TOLERANCE_PX = 1;

function sameViewport(
  expected: BrowserViewportSize,
  actual: BrowserViewportSize,
): boolean {
  return (
    Math.abs(expected.width - actual.width) <= VIEWPORT_TOLERANCE_PX &&
    Math.abs(expected.height - actual.height) <= VIEWPORT_TOLERANCE_PX
  );
}

function releaseOnce(callback: () => void): () => void {
  let released = false;
  return () => {
    if (released) return;
    released = true;
    callback();
  };
}
```

`prepare` deve:

1. registrar o pending antes de chamar `sendPrepare`, para impedir que um ready síncrono falso seja perdido;
2. chamar o mesmo release idempotente em `sendPrepare=false`, timeout, abort, window destroyed e dispose;
3. usar a mensagem de erro de abort fixa `browser screenshot surface preparation cancelled`;
4. usar o formato fixo de mensagem de timeout
   `browser screenshot surface preparation timed out after ${timeoutMs}ms`, onde o número vem do
   `timeoutMs` real atual do coordenador, com mensagem padrão
   `browser screenshot surface preparation timed out after 3000ms`;
5. registrar viewport mismatch apenas em debug e continuar aguardando o próximo ready do mesmo request, sem liberar mais cedo.

`handleReady` deve comparar item a item:

```ts
entry.windowId === input.windowId
entry.senderWebContentsId === undefined || entry.senderWebContentsId === input.senderWebContentsId
entry.payload.requestId === input.payload.requestId
entry.payload.workspaceKey === input.payload.workspaceKey
entry.payload.sessionId === input.payload.sessionId
entry.payload.browserId === input.payload.browserId
entry.payload.browserGeneration === input.payload.browserGeneration
entry.payload.tabId === input.payload.tabId
entry.payload.webContentsId === input.payload.webContentsId
sameViewport(entry.payload.viewport, input.payload.viewport)
```

O primeiro ready confiável congela `senderWebContentsId` no sender atual; ready posteriores de outros renderers devem ser ignorados.

- [ ] **Step 5: Registrar o IPC de ready confiável e passar o callback ao platform handler**

Em `packages/desktop/src/main/desktopBrowserViewIpc.ts`:

```ts
ipcMain.on(
  PlatformChannels.BrowserViewScreenshotSurfaceReady,
  (event, payload: BrowserViewScreenshotSurfaceReadyPayload) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return;
    reportBrowserScreenshotSurfaceReady?.(win.id, event.sender.id, payload);
  },
);
```

Passar `reportBrowserScreenshotSurfaceReady` como terceiro parâmetro opcional de `registerBrowserViewIpcHandlers` e `registerDesktopBrowserIpcHandlers`.

Adicionar o callback de mesmo nome nas options de `packages/desktop/src/main/desktopMainIpcPlatform.ts` e passá-lo a `registerDesktopBrowserIpcHandlers`.

- [ ] **Step 6: Executar os testes do coordenador e de IPC**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/browserScreenshotSurfaceCoordinator.test.ts packages/desktop/test/desktopBrowserViewIpc.test.ts
```

Expected: as duas suites PASS; o teste com timer falso não deixa rejection não tratado ao sair.

- [ ] **Step 7: Commitar o coordenador**

```powershell
git add packages/desktop/src/main/browserView/browserScreenshotSurfaceCoordinator.ts packages/desktop/src/main/desktopBrowserViewIpc.ts packages/desktop/src/main/desktopMainIpcPlatform.ts packages/desktop/test/browserScreenshotSurfaceCoordinator.test.ts packages/desktop/test/desktopBrowserViewIpc.test.ts
git commit -m "feat(browser-use): coordinate screenshot surfaces"
```

---

### Task 3: Portão pré-screenshot no BrowserGuestManager

**Arquivos:**
- Modify: `packages/desktop/src/main/browserView/browserGuestManager.ts:18-115`
- Modify: `packages/desktop/src/main/browserView/browserGuestManager.ts:220-252`
- Modify: `packages/desktop/src/main/browserView/browserGuestManager.ts:808-860`
- Modify: `packages/desktop/src/main/index.ts:237-285`
- Modify: `packages/desktop/src/main/index.ts:1726-1745`
- Test: `packages/desktop/test/browserGuestManager.test.ts`

**Interfaces:**
- Consumes: `BrowserScreenshotSurfaceCoordinator` e `BrowserScreenshotSurfaceLease` da Task 2.
- Produces: a sétima dependência opcional do constructor de `BrowserGuestManager`:

```ts
constructor(
  log?: (msg: string) => void,
  attachTimeoutMs?: number,
  onCloseTabRequested?: (
    tabId: string,
    owner?: BrowserGuestExecutionContext,
  ) => void,
  onOpenTabRequested?: (
    tabId: string,
    owner: BrowserGuestExecutionContext,
  ) => void,
  onVisibilityChanged?: (
    visible: boolean,
    owner: BrowserGuestExecutionContext,
    tabId?: string,
  ) => void,
  onViewportChanged?: (
    viewport: BrowserViewportSize | null,
    owner: BrowserGuestExecutionContext,
    tabId: string,
  ) => void,
  screenshotSurfaceCoordinator?: BrowserScreenshotSurfaceCoordinator,
)
```

`GuestWebContents` ganha `id: number` somente leitura.

- [ ] **Step 1: Dar id real ao fake de guest e escrever o teste falho de ordem de chamada**

Mudar `makeGuest` para `makeGuest(id: number, spy: GuestSpy)`, adicionando `id` como primeiro campo do objeto retornado; mudar `registerGuest` para `makeGuest(id, spy)`.

Adicionar em `packages/desktop/test/browserGuestManager.test.ts`:

```ts
it("background screenshot 必须 prepare ready 后才进入 CDP，并在 settle 后 release", async () => {
  registerGuest(209);
  const order: string[] = [];
  const release = vi.fn(() => order.push("release"));
  const coordinator = {
    prepare: vi.fn(async (input: {
      webContentsId: number;
      viewport: { width: number; height: number };
    }) => {
      order.push("prepare");
      expect(input.webContentsId).toBe(209);
      expect(input.viewport).toEqual({ width: 800, height: 600 });
      return {
        webContentsId: 209,
        viewport: { width: 800, height: 600 },
        release,
      };
    }),
  };
  const guest = guestRegistry.get(209)!;
  const sendCommand = guest.debugger.sendCommand;
  guest.debugger.sendCommand = async (method, params) => {
    if (method === "Page.captureScreenshot") order.push("capture");
    return sendCommand(method, params);
  };
  const mgr = new BrowserGuestManager(
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    coordinator,
  );
  mgr.attachGuest("tab-209", 209);

  await expect(mgr.execute("tab-209", { method: "screenshot" })).resolves.toMatchObject({
    ok: true,
    image: { base64: "PNGDATA" },
  });

  expect(order).toEqual(["prepare", "capture", "release"]);
});
```

O teste também deve usar `expect.objectContaining` para afirmar que o coordenador recebeu o `requestId` do contexto legacy, `windowId=0`, `tabId="tab-209"` e `signal: expect.any(AbortSignal)`.

- [ ] **Step 2: Escrever os testes falhos de falha de prepare/abort/substituição de guest**

Adicionar três `it`:

```ts
it("prepare 失败时返回 backend_unavailable 且不调用 Page.captureScreenshot", async () => {
  const { spy } = registerGuest(210);
  const coordinator = {
    prepare: vi.fn(async () => {
      throw new Error("surface unavailable");
    }),
  };
  const mgr = new BrowserGuestManager(
    undefined, undefined, undefined, undefined, undefined, undefined, coordinator,
  );
  mgr.attachGuest("tab-210", 210);
  await expect(mgr.execute("tab-210", { method: "screenshot" })).resolves.toMatchObject({
    ok: false,
    error: { code: "backend_unavailable", sideEffect: "none" },
  });
  expect(spy.cdpCalls.some((call) => call.method === "Page.captureScreenshot")).toBe(false);
});

it("prepare 期间 abort 返回 cancelled，协调器收到同一 signal", async () => {
  registerGuest(211);
  let observedSignal: AbortSignal | undefined;
  const coordinator = {
    prepare: vi.fn(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          observedSignal = signal;
          signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
        }),
    ),
  };
  const mgr = new BrowserGuestManager(
    undefined, undefined, undefined, undefined, undefined, undefined, coordinator,
  );
  mgr.attachGuest("tab-211", 211);
  const controller = new AbortController();
  const pending = mgr.execute("tab-211", { method: "screenshot" }, controller.signal);
  await vi.waitFor(() => expect(observedSignal).toBeDefined());
  controller.abort();
  await expect(pending).resolves.toMatchObject({
    ok: false,
    error: { code: "cancelled", sideEffect: "none" },
  });
});
```

O teste de substituição de guest faz `attachGuest(tabId, newId)` de novo enquanto o `prepare` está pending e então resolve o lease antigo; espera-se que o lease antigo faça `release` uma vez e que nenhum dos dois guests tenha `Page.captureScreenshot`.

- [ ] **Step 3: Executar os testes de screenshot do manager e confirmar que o coordenador ainda não é chamado**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/browserGuestManager.test.ts -t "screenshot|prepare"
```

Expected: os novos testes FAIL, faltando `prepare` na ordem, ou o constructor não aceita o coordenador.

- [ ] **Step 4: Envolver o backend de screenshot no ciclo de vida de prepare**

Em `browserGuestManager.ts`, importar a interface, adicionar `id` ao `GuestWebContents` e criar o método privado:

```ts
private async executeScreenshotWithPreparedSurface(
  context: InternalExecutionContext,
  tab: ManagedTab,
  guest: GuestWebContents,
  command: BrowserCommand,
  running: RunningRequest,
  startedAt: number,
): Promise<BrowserCommandResult> {
  let lease: BrowserScreenshotSurfaceLease | undefined;
  try {
    if (!this.screenshotSurfaceCoordinator) {
      throw new Error("browser screenshot surface coordinator is unavailable");
    }
    const viewport = await this.readTabViewport(tab);
    lease = await this.screenshotSurfaceCoordinator.prepare({
      requestId: context.requestId,
      windowId: context.windowId,
      workspaceKey: context.workspaceKey,
      sessionId: context.sessionId,
      browserId: context.browserId,
      browserGeneration: context.browserGeneration,
      tabId: tab.tabId,
      webContentsId: guest.id,
      viewport,
      signal: running.controller.signal,
    });
    if (
      running.controller.signal.aborted ||
      tab.guest !== guest ||
      guest.isDestroyed() ||
      lease.webContentsId !== guest.id
    ) {
      throw new Error("browser guest changed while preparing screenshot surface");
    }
    running.dispatched = true;
    return await executeBrowserCommandOnView(this.toControlledView(guest), command, {
      signal: running.controller.signal,
    });
  } catch (error) {
    const cancelled = running.controller.signal.aborted;
    return {
      ok: false,
      error: {
        code: cancelled ? "cancelled" : "backend_unavailable",
        message: cancelled
          ? "browser screenshot surface preparation cancelled"
          : error instanceof Error
            ? error.message
            : String(error),
        sideEffect: "none",
      },
      elapsedMs: Date.now() - startedAt,
    };
  } finally {
    lease?.release();
  }
}
```

O comentário de bugfix em português deve ficar acima desse método, explicando com clareza: `display:none` inativo faz o Electron manter a surface antiga do compositor e o CDP ladrilha a surface antiga pelo novo viewport, portanto é obrigatório aguardar o ACK do renderer antes do capture, sem poder contar com recorte de imagem como rede de proteção.

No branch original de screenshot:

```ts
const execution = screenshotCommand
  ? this.executeScreenshotWithPreparedSurface(
      context,
      tab,
      guest,
      command,
      running,
      startedAt,
    )
  : executeBrowserCommandOnView(this.toControlledView(guest), command, {
      signal: running.controller.signal,
    });
if (!screenshotCommand) running.dispatched = true;
```

`inFlightScreenshots` continua acompanhando essa `execution` real que contém prepare + CDP + release, e o `raceBackendExecution` externo não pode removê-la antes do tempo no cancel.

- [ ] **Step 5: Atualizar os fakes dos testes existentes de screenshot/backpressure**

Injetar nos testes existentes de "screenshot explícito" e "preservar o in-flight subjacente após cancelamento de screenshot":

```ts
function createReadyScreenshotSurfaceCoordinator() {
  return {
    prepare: vi.fn(async (input: { webContentsId: number; viewport: BrowserViewportSize }) => ({
      webContentsId: input.webContentsId,
      viewport: input.viewport,
      release: vi.fn(),
    })),
  };
}
```

O teste de backpressure afirma ainda mais: após o primeiro abort externo o lease ainda não foi liberado; o release só ocorre depois que o `Page.captureScreenshot` subjacente resolve; o segundo capture continua sendo recusado; e após o late settle o terceiro é recuperado.

- [ ] **Step 6: Criar e injetar o coordenador real no main do desktop**

Criar antes do `BrowserGuestManager` em `packages/desktop/src/main/index.ts`:

```ts
const browserScreenshotSurfaceCoordinator =
  new DesktopBrowserScreenshotSurfaceCoordinator({
    sendPrepare: (windowId, payload) => {
      const win = BrowserWindow.fromId(windowId);
      if (!win || win.isDestroyed()) return false;
      win.webContents.send(PlatformChannels.BrowserViewScreenshotSurfacePrepare, payload);
      return true;
    },
    sendRelease: (windowId, payload) => {
      const win = BrowserWindow.fromId(windowId);
      if (!win || win.isDestroyed()) return;
      win.webContents.send(PlatformChannels.BrowserViewScreenshotSurfaceRelease, payload);
    },
    log: (message) => logger.debug(message),
  });
```

Passar como sétimo argumento de `BrowserGuestManager`. Adicionar nas options de `registerPlatformIpcHandlers`:

```ts
reportBrowserScreenshotSurfaceReady: (windowId, senderWebContentsId, payload) =>
  browserScreenshotSurfaceCoordinator.handleReady({
    windowId,
    senderWebContentsId,
    payload,
  }),
```

Chamar `handleWindowDestroyed(win.id)` na saída de ciclo de vida existente de destruição de janela; chamar `dispose()` na saída unificada de limpeza do app quit, sem adicionar um segundo conjunto de listeners de ciclo de vida de janela para isso.

- [ ] **Step 7: Executar a regressão de manager, IPC e executor**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/browserGuestManager.test.ts packages/desktop/test/browserScreenshotSurfaceCoordinator.test.ts packages/desktop/test/desktopBrowserViewIpc.test.ts packages/desktop/test/browserCommandExecutor.test.ts
```

Expected: tudo PASS; as asserções existentes de screenshot, clip, fullPage, elementScreenshot e backpressure in-flight permanecem inalteradas.

- [ ] **Step 8: Commitar o portão do main**

```powershell
git add packages/desktop/src/main/browserView/browserGuestManager.ts packages/desktop/src/main/index.ts packages/desktop/test/browserGuestManager.test.ts
git commit -m "fix(browser-use): gate screenshots on compositor readiness"
```

---

### Task 4: Capture layer de segundo plano no renderer e ACK de frames estáveis

**Arquivos:**
- Create: `packages/ui/src/browser-use/BrowserUseSidePaneContent.tsx`
- Create: `packages/ui/src/browser-use/useBrowserScreenshotSurfaceRequest.ts`
- Create: `packages/ui/src/browser-use/useBrowserScreenshotSurfaceReady.ts`
- Create: `packages/ui/test/BrowserUseSidePaneContent.test.ts`
- Modify: `packages/ui/src/app-shell/AnimatedSidePanePanel.tsx:910-1160`
- Modify: `packages/ui/src/browser-use/UnifiedBrowserView.tsx:1-70`
- Modify: `packages/ui/src/browser-use/UnifiedBrowserView.tsx:560-640`
- Modify: `packages/ui/test/UnifiedBrowserView.test.ts`

**Interfaces:**
- Consumes: os payloads prepare/release da Task 1; `BrowserUseSidePaneTab`, `UnifiedBrowserView` e `TabsContent` do Radix já existentes.
- Produces:

```ts
export interface BrowserUseSidePaneContentProps {
  tab: BrowserUseSidePaneTab;
  isPanelVisible: boolean;
  isSelected: boolean;
  screenshotSurfaceRequest: BrowserViewScreenshotSurfacePreparePayload | null;
  initialUrl?: string;
  workspacePath: string;
  workspaceIdentity?: string;
  onUrlChange(url: string): void;
  onPageMetadataChange(metadata: BrowserSidePaneMetadata): void;
}
```

`UnifiedBrowserView` ganha:

```ts
screenshotSurfaceRequest?: BrowserViewScreenshotSurfacePreparePayload | null;
```

`useBrowserScreenshotSurfaceRequest`:

```ts
export function useBrowserScreenshotSurfaceRequest(
  tabs: readonly WorkspaceSidePaneTab[],
): BrowserViewScreenshotSurfacePreparePayload | null;
```

`useBrowserScreenshotSurfaceReady`:

```ts
export function useBrowserScreenshotSurfaceReady(options: {
  request: BrowserViewScreenshotSurfacePreparePayload | null;
  webview: ElectronWebviewTag | null;
}): void;
```

- [ ] **Step 1: Escrever o teste de componente falho do estado da capture layer**

Criar `packages/ui/test/BrowserUseSidePaneContent.test.ts` (`@vitest-environment jsdom`, usando `createElement` em vez de JSX). Fazer mock de `usePlatform` e `UnifiedBrowserView`, guardar os listeners de prepare/release e então:

```ts
it("inactive browser-use prepare 时进入底层 capture layer，但不改变 active tab 或焦点", () => {
  const userInput = document.createElement("input");
  document.body.append(userInput);
  userInput.focus();
  const browserUseTab: BrowserUseSidePaneTab = {
    id: "browser-use:tab-1",
    type: "browser-use",
    ownerTaskId: "sess-1",
    workspaceKey: "workspace-1",
    sessionId: "sess-1",
    tabId: "tab-1",
    browserId: "browser-1",
    browserGeneration: 2,
  };
  const view = render(
    createElement(
      Tabs,
      { value: "active-tab" },
      createElement(TabsContent, { value: "active-tab" }, "active"),
      createElement(BrowserUseSidePaneContent, {
        tab: browserUseTab,
        isPanelVisible: true,
        isSelected: false,
        screenshotSurfaceRequest: preparePayload,
        workspacePath: "C:\\repo",
        onUrlChange: vi.fn(),
        onPageMetadataChange: vi.fn(),
      }),
    ),
  );

  const content = view.container.querySelector(
    '[data-browser-screenshot-surface-state="preparing"]',
  );
  expect(content).not.toBeNull();
  expect(content).toHaveClass("absolute", "inset-0", "pointer-events-none");
  expect(content).not.toHaveClass("hidden");
  expect(content).toHaveAttribute("inert");
  expect(content).toHaveAttribute("aria-hidden", "true");
  expect(document.activeElement).toBe(userInput);
  expect(view.container.querySelector('[data-state="active"]')).toHaveTextContent("active");

  view.rerender(
    createElement(
      Tabs,
      { value: "active-tab" },
      createElement(TabsContent, { value: "active-tab" }, "active"),
      createElement(BrowserUseSidePaneContent, {
        tab: browserUseTab,
        isPanelVisible: true,
        isSelected: false,
        screenshotSurfaceRequest: null,
        workspacePath: "C:\\repo",
        onUrlChange: vi.fn(),
        onPageMetadataChange: vi.fn(),
      }),
    ),
  );
  expect(
    view.container.querySelector('[data-browser-use-tab-id="tab-1"]'),
  ).toHaveClass("hidden");
});
```

No mesmo arquivo, cobrir `useBrowserScreenshotSurfaceRequest` com um harness de hook: retorna `null` quando workspace/session/browser/generation/tab não casam; o release de um request antigo não pode limpar um novo request; enquanto um request diferente ainda estiver ativo não pode sobrescrever; e o prepare ainda entra no estado da raiz quando a conversa atual não tem tab visível.

- [ ] **Step 2: Escrever os testes falhos de dois frames estáveis e do portão de guest id**

Adicionar no platform hoisted de `packages/ui/test/UnifiedBrowserView.test.ts`:

```ts
const screenshotSurfaceReady = vi.fn();
browserViewScreenshotSurfaceReady: screenshotSurfaceReady,
```

Usar uma fila de RAF que pode ser avançada manualmente e fazer o webview falso:

```ts
Object.defineProperties(el, {
  offsetWidth: { configurable: true, value: 1274 },
  offsetHeight: { configurable: true, value: 720 },
});
vi.spyOn(el, "getBoundingClientRect").mockReturnValue({
  x: 0,
  y: 0,
  top: 0,
  left: 0,
  right: 1274,
  bottom: 720,
  width: 1274,
  height: 720,
  toJSON: () => ({}),
});
```

Adicionar o teste:

```ts
it("后台 surface 连续两个稳定 frame 后才 ready，并回传当前 guest id", () => {
  const request = createScreenshotSurfaceRequest({ webContentsId: 42 });
  render(createViewElement("tab-1", "sess-1", undefined, false, undefined, request));
  const webview = stubWebview(screen.getByTestId(TID_BROWSER_WEBVIEW));
  fireDomReady(webview);
  FakeResizeObserver.instances.at(-1)?.emit(1274, 720);

  flushOneAnimationFrame();
  expect(h.screenshotSurfaceReady).not.toHaveBeenCalled();
  flushOneAnimationFrame();
  expect(h.screenshotSurfaceReady).toHaveBeenCalledWith({
    ...request,
    viewport: { width: 1274, height: 720 },
  });
});
```

Adicionar ainda três cases: `getWebContentsId() !== request.webContentsId` não fica ready; com primeiro frame `1274×719` e segundo frame `1274×720` continua esperando o próximo conjunto de frames estáveis; e após o request ser limpo/unmount o observer e o RAF pendente são cancelados.

- [ ] **Step 3: Executar os dois testes de UI e confirmar que o componente/hook ainda não existe**

Run:

```powershell
pnpm exec vitest run packages/ui/test/BrowserUseSidePaneContent.test.ts packages/ui/test/UnifiedBrowserView.test.ts
```

Expected: FAIL, contendo
`Cannot find module '@/browser-use/BrowserUseSidePaneContent.js'` ou a nova prop/ready sem efeito.

- [ ] **Step 4: Implementar o hook de frames estáveis**

Criar `packages/ui/src/browser-use/useBrowserScreenshotSurfaceReady.ts`. A leitura de dimensões deve ser compatível tanto com o viewport natural quanto com o transform responsivo existente:

```ts
function roundViewport(width: number, height: number): BrowserViewportSize | null {
  const viewport = { width: Math.round(width), height: Math.round(height) };
  return viewport.width > 0 && viewport.height > 0 ? viewport : null;
}

function withinOnePixel(left: BrowserViewportSize, right: BrowserViewportSize): boolean {
  return (
    Math.abs(left.width - right.width) <= 1 &&
    Math.abs(left.height - right.height) <= 1
  );
}

function readSurfaceViewport(
  webview: ElectronWebviewTag,
  expected: BrowserViewportSize,
): BrowserViewportSize | null {
  const rect = webview.getBoundingClientRect();
  const transformed = roundViewport(rect.width, rect.height);
  const layout = roundViewport(webview.offsetWidth, webview.offsetHeight);
  if (transformed && withinOnePixel(transformed, expected)) return transformed;
  if (layout && withinOnePixel(layout, expected)) return layout;
  return transformed ?? layout;
}
```

O fluxo do effect é fixo como:

```ts
useEffect(() => {
  if (!request || !webview) return;
  if (safeWebviewCall(() => webview.getWebContentsId(), 0) !== request.webContentsId) return;

  let disposed = false;
  let firstFrame: BrowserViewportSize | null = null;
  let rafId = 0;
  const verify = () => {
    rafId = window.requestAnimationFrame(() => {
      const current = readSurfaceViewport(webview, request.viewport);
      if (!current || !withinOnePixel(current, request.viewport)) return;
      if (!firstFrame || !withinOnePixel(firstFrame, current)) {
        firstFrame = current;
        verify();
        return;
      }
      if (disposed) return;
      platform.browserViewScreenshotSurfaceReady?.({ ...request, viewport: current });
    });
  };
  const observer = new ResizeObserver(() => {
    firstFrame = null;
    window.cancelAnimationFrame(rafId);
    verify();
  });
  observer.observe(webview);
  verify();
  return () => {
    disposed = true;
    observer.disconnect();
    window.cancelAnimationFrame(rafId);
  };
}, [platform, request, webview]);
```

A implementação final usa `safeWebviewCall` como import explícito e registra mismatch/ready com `logger.debug`; é proibido registrar URL. A recursão acima deve manter o observer ativo no mismatch, para que um resize posterior possa disparar de novo, e não pode gerar spin infinito de RAF.

- [ ] **Step 5: Implementar a máquina de estados de request de escopo completo na raiz da barra lateral**

Criar `packages/ui/src/browser-use/useBrowserScreenshotSurfaceRequest.ts`:

```ts
export function findScreenshotSurfaceTab(
  tabs: readonly WorkspaceSidePaneTab[],
  payload: BrowserViewScreenshotSurfacePreparePayload,
): BrowserUseSidePaneTab | undefined {
  return tabs.find(
    (tab): tab is BrowserUseSidePaneTab =>
      tab.type === "browser-use" && matchesTab(tab, payload),
  );
}

function matchesTab(
  tab: BrowserUseSidePaneTab,
  payload: BrowserViewScreenshotSurfacePreparePayload,
): boolean {
  return (
    tab.workspaceKey === payload.workspaceKey &&
    tab.sessionId === payload.sessionId &&
    tab.browserId === payload.browserId &&
    tab.browserGeneration === payload.browserGeneration &&
    tab.tabId === payload.tabId
  );
}
```

O hook usa `usePlatform()` para assinar prepare/release e um local state para guardar o request atual.
O prepare só define o request quando `findScreenshotSurfaceTab(tabs, payload)` casa; se já houver um `requestId` diferente em preparação, mantém o request antigo e registra o conflito em debug. O release só limpa com casamento de escopo completo e `requestId` igual.

Criar `BrowserUseSidePaneContent.tsx`. O componente não assina IPC, apenas consome o `screenshotSurfaceRequest` já casado pela raiz da barra lateral e renderiza:

```tsx
<TabsContent
  value={tab.id}
  forceMount
  aria-hidden={!isSelected}
  inert={!isSelected ? true : undefined}
  data-browser-use-tab-id={tab.tabId}
  data-browser-screenshot-surface-state={
    screenshotSurfaceRequest ? "preparing" : undefined
  }
  className={cn(
    "h-full min-h-0 bg-background",
    isSelected
      ? "relative z-10 flex"
      : screenshotSurfaceRequest
        ? "pointer-events-none absolute inset-0 z-0 flex overflow-hidden"
        : "hidden",
  )}
>
  <UnifiedBrowserView
    browserKey={tab.tabId}
    isVisible={isPanelVisible && isSelected}
    screenshotSurfaceRequest={screenshotSurfaceRequest}
    initialUrl={initialUrl}
    workspacePath={workspacePath}
    workspaceIdentity={workspaceIdentity}
    sessionId={tab.sessionId}
    browserUseOperationUntil={tab.browserUseOperationUntil}
    browserResizeBaselineVersion={tab.browserUseResizeBaselineVersion}
    onUrlChange={onUrlChange}
    onPageMetadataChange={onPageMetadataChange}
  />
</TabsContent>
```

- [ ] **Step 6: Tornar o conteúdo da barra lateral um stacking context explícito**

Em `AnimatedSidePanePanel.tsx`, chamar depois de `tabs`/`visibleTabs`:

```ts
const screenshotSurfaceRequest = useBrowserScreenshotSurfaceRequest(tabs);
const screenshotSurfaceTab = screenshotSurfaceRequest
  ? findScreenshotSurfaceTab(tabs, screenshotSurfaceRequest)
  : undefined;
```

A condição original de "esconder os Tabs quando a conversa atual não tem tab visível" passa a ser:

```tsx
<div
  className={cn(
    "h-full min-h-0",
    visibleTabs.length === 0 && !screenshotSurfaceRequest && "hidden",
  )}
>
```

Assim a tab browser-use de A ainda consegue completar a composição em segundo plano quando B não tem tab visível, mas
`visibleActiveTabId` continua sendo string vazia, sem ativar A em B.

Manter `Tabs` como:

```tsx
className="relative h-full gap-0"
```

E envolver todo o conteúdo após o `TabsList` em:

```tsx
<div className="relative min-h-0 flex-1 isolate">
  {sidePaneTabContents}
</div>
```

Onde `sidePaneTabContents` é extraído, antes do return, da expressão completa `tabs.map` atualmente em `AnimatedSidePanePanel.tsx:1017-1160`.
O início do map callback ganha somente este early return:

```tsx
if (tab.type === "browser-use") {
  return (
    <BrowserUseSidePaneContent
      key={tab.id}
      tab={tab}
      isPanelVisible={isVisible}
      isSelected={tab.id === visibleActiveTabId}
      screenshotSurfaceRequest={
        screenshotSurfaceTab?.id === tab.id ? screenshotSurfaceRequest : null
      }
      initialUrl={browserRestoreUrls[tab.id]}
      workspacePath={workspaceAbsPath}
      workspaceIdentity={workspaceIdentity}
      onUrlChange={(url) => onBrowserUrlChange(tab.id, url)}
      onPageMetadataChange={(metadata) => onBrowserPageMetadataChange(tab.id, metadata)}
    />
  );
}
```

Depois retornar diretamente o switch original de `TabsContent` genérico e remover dele o branch de browser-use, que agora é inalcançável;
os outros branches de tab mantêm o código original, sem introduzir um segundo registry ou uma nova abstração de renderização.

O `TabsContent` não browser-use fica uniformizado como:

```tsx
className="relative z-10 h-full min-h-0 data-[state=inactive]:hidden"
```

`tab.type === "browser-use"` faz early branch fora do `TabsContent` genérico, renderizando
`BrowserUseSidePaneContent`; `screenshotSurfaceRequest` só é passado quando
`screenshotSurfaceTab?.id === tab.id`, e `null` nos demais casos. Remover o branch de browser-use do switch genérico original. O `z-10 bg-background` do conteúdo ativo precisa cobrir a capture layer, e é proibido adicionar opacidade ou animação.

- [ ] **Step 7: Fazer o UnifiedBrowserView apenas restaurar layout durante a preparação em segundo plano**

Em `UnifiedBrowserView`, chamar:

```ts
useBrowserScreenshotSurfaceReady({
  request: screenshotSurfaceRequest ?? null,
  webview,
});
const shouldComposeSurface = Boolean(screenshotSurfaceRequest);
```

E mudar a raiz para:

```tsx
<div
  aria-hidden={!isVisible}
  className={cn(
    isVisible || shouldComposeSurface ? "flex" : "hidden",
    "h-full min-h-0 w-full min-w-0 flex-col overflow-hidden bg-background",
  )}
>
```

`isVisible` continua sendo a única fonte de toda semântica de active/report/focus/operação; `shouldComposeSurface` afeta apenas o layout e não pode ser passado a `reportBrowserGuest(true)`, ao element picker, ao focus da toolbar ou ao estado active do side-pane.

Adicionar ao lado dessa raiz um comentário de bug em português explicando que `display:none` inativo mantém a surface antiga do Electron, que o `flex` temporário existe apenas para a composição do screenshot e que o isolamento de interação é garantido pelo `inert + pointer-events-none + aria-hidden` externo.

- [ ] **Step 8: Executar os testes de componente de UI e de regressão da barra lateral**

Run:

```powershell
pnpm exec vitest run packages/ui/test/BrowserUseSidePaneContent.test.ts packages/ui/test/UnifiedBrowserView.test.ts packages/ui/test/animatedSidePanePanelLayout.test.ts packages/ui/test/workspaceSidePane.test.ts packages/ui/test/sidePaneToggleEmptyState.test.ts
```

Expected: tudo PASS; as asserções existentes de crash recovery, viewport responsivo, mount em segundo plano e troca de conversa sem roubo de foco continuam passando.

- [ ] **Step 9: Commitar a capture layer do renderer**

```powershell
git add packages/ui/src/browser-use/BrowserUseSidePaneContent.tsx packages/ui/src/browser-use/useBrowserScreenshotSurfaceRequest.ts packages/ui/src/browser-use/useBrowserScreenshotSurfaceReady.ts packages/ui/src/app-shell/AnimatedSidePanePanel.tsx packages/ui/src/browser-use/UnifiedBrowserView.tsx packages/ui/test/BrowserUseSidePaneContent.test.ts packages/ui/test/UnifiedBrowserView.test.ts
git commit -m "fix(browser-use): compose inactive tabs before screenshots"
```

---

### Task 5: Smoke de regressão com compositor Electron real

**Arquivos:**
- Create: `packages/desktop/scripts/browser-screenshot-surface-smoke.mjs`
- Modify: `packages/desktop/package.json:8-30`

**Interfaces:**
- Consumes: `app` e `BrowserWindow` do Electron 41, `<webview>`, `webContents.debugger` do guest e `nativeImage`.
- Produces: script de pacote `test:browser-screenshot-surface-smoke`; em caso de sucesso o stdout imprime apenas:

```json
{"width":1274,"height":720,"periodicRepeat":false,"corners":"distinct"}
```

- [ ] **Step 1: Criar o script de smoke com Electron real**

`packages/desktop/scripts/browser-screenshot-surface-smoke.mjs` deve:

1. criar uma `BrowserWindow` de teste com `webviewTag` habilitado e área de conteúdo de `1274 × 720`; a janela usa `showInactive()` para participar da composição real do compositor sem roubar foco, e pode ser posicionada na borda da tela de teste, sem poder usar `show: false` para contornar a composição real;
2. o HTML do host contém um `<webview>` exibido primeiro a `800 × 450` e uma active cover opaca;
3. o HTML do guest usa quatro sentinelas fixos de `96 × 96`: vermelho no canto superior esquerdo, verde no superior direito, azul no inferior esquerdo, amarelo no inferior direito, com fundo em gradiente por coordenadas, garantindo que `x+800/y+450` não possam ser legitimamente iguais;
4. após o `dom-ready` do guest, esperar primeiro um frame para formar a surface histórica de `800 × 450`;
5. colocar o webview numa capture layer com `position:absolute; inset:0; z-index:0; width:1274px; height:720px; pointer-events:none`, mantendo a active cover em `z-index:1`;
6. aguardar dois `requestAnimationFrame` consecutivos e confirmar que `getBoundingClientRect()` é `1274 × 720`;
7. executar `Page.captureScreenshot({format:"png",fromSurface:true})` no guest;
8. validar com `nativeImage.createFromBuffer` as dimensões do PNG e o RGBA dos quatro cantos; fazer amostragem de pixel a pixel para conferir que `(x,y)` e `(x+800,y)`, `(x,y+450)` não formam uma proporção alta de igualdade;
9. no `finally`, fazer detach do debugger, destruir a janela e chamar `app.quit()`.

A detecção de periodicidade fica fixa como:

```js
function periodicMatchRatio(bitmap, width, height, stride, dx, dy) {
  let compared = 0;
  let equal = 0;
  for (let y = 0; y + dy < height; y += stride) {
    for (let x = 0; x + dx < width; x += stride) {
      const a = (y * width + x) * 4;
      const b = ((y + dy) * width + x + dx) * 4;
      compared += 1;
      if (
        bitmap[a] === bitmap[b] &&
        bitmap[a + 1] === bitmap[b + 1] &&
        bitmap[a + 2] === bitmap[b + 2]
      ) {
        equal += 1;
      }
    }
  }
  return compared === 0 ? 0 : equal / compared;
}
```

Detectar `(dx=800,dy=0)` e `(dx=0,dy=450)` separadamente; qualquer ratio `>= 0.95` é falha.

- [ ] **Step 2: Adicionar o comando explícito de smoke**

Adicionar em scripts de `packages/desktop/package.json`:

```json
"test:browser-screenshot-surface-smoke": "electron scripts/browser-screenshot-surface-smoke.mjs"
```

Esse script não deve ser ligado ao `test:unit` padrão, porque exige GUI/compositor reais.

- [ ] **Step 3: Executar o smoke com Electron real**

Run:

```powershell
pnpm --filter @zcode/desktop test:browser-screenshot-surface-smoke
```

Expected:

```text
{"width":1274,"height":720,"periodicRepeat":false,"corners":"distinct"}
```

Repetir a execução em pelo menos duas das escalas de exibição do Windows 125%, 150% e 160%; a saída deve ser idêntica a cada vez, o código de saída do processo deve ser 0 e o foco atual da barra lateral do usuário não pode ficar retido pela janela de teste.

- [ ] **Step 4: Commitar a evidência de composição real**

```powershell
git add packages/desktop/scripts/browser-screenshot-surface-smoke.mjs packages/desktop/package.json
git commit -m "test(browser-use): cover background screenshot compositor"
```

---

### Task 6: Reverificação de runtime de cadeia completa, portões estáticos e commit final

**Arquivos:**
- Modify only if evidence requires: arquivos já listados nas Tasks 1-5
- Verify: `docs/superpowers/specs/2026-07-23-browser-background-screenshot-surface-design.md`
- Verify: `docs/testing/browser-use-codex-parity-coverage-matrix.md`

**Interfaces:**
- Consumes: a implementação completa das Tasks 1-5 e o comando de smoke.
- Produces: evidência de runtime do cenário do usuário, typecheck/lint de todo o repositório e uma cadeia final de commits limpa e auditável.

- [ ] **Step 1: Executar a reverificação de runtime do ZCode contra as dimensões originais da falha**

Iniciar o build de desenvolvimento do desktop atual:

```powershell
pnpm dev:desktop:prod
```

Abrir com o navegador embutido a página local de sentinelas nos quatro cantos, de modo que a última dimensão visível da tab browser-use seja `800 × 450`; trocar para outra tab da barra lateral, ajustar a área de conteúdo da barra lateral para `1274 × 720` e então disparar um screenshot explícito da mesma tab. Validar pelo PNG retornado pela Browser API existente:

```text
PNG width=1274
PNG height=720
horizontal periodic match at dx=800 < 0.95
vertical periodic match at dy=450 < 0.95
current side-pane active tab unchanged
document.activeElement unchanged
```

Ao mesmo tempo, observar que a ordem dos logs de debug precisa ser:

```text
prepare -> renderer ready -> Page.captureScreenshot -> release
```

Os logs não podem conter imagem em base64, corpo da página web nem URL completa.

- [ ] **Step 2: Verificar os portões de falha**

Manter a tab browser-use alvo inativa, bloquear temporariamente no DevTools o retorno do ready do renderer e executar um screenshot explícito. Esperado:

```text
3000ms 后返回 backend_unavailable/timeout 结构化失败
Page.captureScreenshot 调用数为 0
release 只发送一次
当前侧栏 tab、焦点、网页滚动位置不变
```

Depois de restaurar o ready, um novo screenshot deve ter sucesso; não pode sobrar request pendente nem capture layer permanente.

- [ ] **Step 3: Executar o conjunto de testes focado**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/preloadDisposer.test.ts packages/desktop/test/desktopBrowserViewIpc.test.ts packages/desktop/test/browserScreenshotSurfaceCoordinator.test.ts packages/desktop/test/browserGuestManager.test.ts packages/desktop/test/browserCommandExecutor.test.ts packages/ui/test/BrowserUseSidePaneContent.test.ts packages/ui/test/UnifiedBrowserView.test.ts packages/ui/test/animatedSidePanePanelLayout.test.ts packages/ui/test/workspaceSidePane.test.ts packages/ui/test/sidePaneToggleEmptyState.test.ts
```

Expected: tudo PASS, sem novos casos skipped, sem unhandled rejection e sem avisos de React `act(...)`.

- [ ] **Step 4: Executar os portões estáticos obrigatórios do repositório**

Run:

```powershell
pnpm typecheck
pnpm lint
```

Expected: ambas as linhas de comando terminam com código 0.

- [ ] **Step 5: Auditar o diff e as fronteiras**

Run:

```powershell
git diff --check
git status --short
git log --oneline -8
```

Expected:

- `git diff --check` sem saída;
- a árvore de trabalho não contém arquivos não commitados desta tarefa;
- a cadeia de commits contém pelo menos cinco Conventional Commits: platform contract, coordinator, manager gate, renderer capture layer e Electron smoke;
- não houve modificação de `packages/shared/src/zcode-protocol/index.ts`, relay, remote snapshot, task queue ou conversation persistence.

- [ ] **Step 6: Se a reverificação exigir correções pequenas necessárias, commitar em separado**

Executar apenas se a evidência de runtime provar que a correção é necessária; primeiro copiar item a item de `git diff --name-only` os nomes de arquivo realmente desta tarefa para o `git add`, por exemplo, se só o coordenador e seu teste forem corrigidos:

```powershell
git add packages/desktop/src/main/browserView/browserScreenshotSurfaceCoordinator.ts packages/desktop/test/browserScreenshotSurfaceCoordinator.test.ts
git commit -m "fix(browser-use): finalize background screenshot surface"
```

Executar de novo o Step 3 e o Step 4 antes de commitar; é proibido trazer tarefas concorrentes ou modificações já existentes do usuário para o commit.

---

## Evidência de Conclusão

O relatório de entrega após concluir a implementação deve conter:

- Causa raiz: `display:none` inativo faz o guest do Electron continuar segurando a surface antiga do compositor, e o CDP ladrilha a surface antiga pelo novo viewport.
- Fronteira da correção: ACK da capture layer do renderer owner; sem troca de tab, sem recorte/estiramento de imagem e sem mudar fatos da conversa.
- Automação: Vitest focado, sentinelas reais de quatro cantos em `1274 × 720` no Electron e detecção de periodicidade `800/450`.
- Portões estáticos: `pnpm typecheck`, `pnpm lint`.
- Nota multiplataforma: a cadeia principal desktop continuous só ganhou IPC transitório; o mobile replayable continua lendo o fato de imagem persistido com sucesso, sem introduzir novo estado de recuperação.
- Plataformas/DPI não totalmente verificados em máquina real (se houver) devem ser listados explicitamente como risco restante, sem escrever genericamente "compatível com todas as plataformas".