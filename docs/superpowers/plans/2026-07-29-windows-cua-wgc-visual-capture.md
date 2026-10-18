# Plano de Implementação de Captura Visual WGC para CUA no Windows

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Fazer com que o Helper de origem no Windows conclua, via WGC, a captura de tela do monitor, a captura de janela com oclusão, a imagem anexada ao `get_app_state` e o ciclo fechado de coordenadas de `state_image` / `screenshot`.

**Arquitetura:** Adicionar ao `ax_native.node` existente um módulo independente de captura de quadro único em C++/WinRT + D3D11 + WIC, expondo a ABI de Promise por três exports N-API additive e agrupados. O TypeScript valida capability/outcome por um bridge exclusivo de Windows; a captura de monitor entra no backend existente, a captura de janela é injetada em `createAxWinReadOnlySource`, e os bounds reais da captura percorrem o broker, o state cache e o mapeamento de coordenadas visuais.

**Stack técnico:** TypeScript 5.9, Vitest 4, Node-API / node-addon-api, C++17, C++/WinRT, Windows Graphics Capture, D3D11, WIC, MSVC / node-gyp, Sharp, broker de named pipe do Windows.

## Restrições Globais

- Escrever o teste primeiro e observar RED, depois escrever a implementação mínima e observar GREEN; cada tarefa é um commit independente.
- Modificar apenas o Helper local de origem do Windows em `C:\Users\dev\zcode-cua` e os documentos de fatos/plano em `C:\Users\dev\z-code`; não iniciar nem modificar SSH, WSL, Docker, remote workspace ou o `/remote` do celular.
- Reutilizar o addon C++ existente; não adicionar sidecar em Rust, processo residente nem dependência de Electron.
- A única fonte de pixels pode ser o WGC; são proibidos BitBlt, PrintWindow, captura via PowerShell, comandos externos de captura, o `desktopCapturer` do Electron e fallbacks em binários privados.
- O desenvolvimento de origem aceita a borda padrão de captura WGC do sistema Windows; não solicitar nem contornar a capability restrita de captura sem borda.
- Este plano não cobre pacote instalador, assinatura, manifest, identidade de loja nem artefatos pré-compilados x64/arm64; isso fica para o fechamento de produto após a validação do runtime de origem.
- A ABI additive é fixa em `isScreenCaptureSupported()`, `captureMonitorPngAsync(bounds)` e `captureWindowPngVerifiedAsync(windowId,pid,expectedCanonicalBundleId,expectedBounds?)`; os três exports devem existir em conjunto.
- O sucesso nativo retorna sempre `{ok:true,format:"png",data,width,height,bounds}`; a falha retorna apenas um error code fixo, sem vazar texto de HRESULT, título de janela, caminho de executável, conteúdo de imagem, token ou pipe.
- A captura deve ser executada em `Napi::AsyncWorker`; exceções de C++/WinRT são capturadas dentro do worker e não podem atravessar a N-API.
- Usar um `std::timed_mutex` dedicado; admission de no máximo 250ms; primeiro quadro de no máximo 2000ms; lado máximo de 16384; total máximo de pixels de 33554432; PNG máximo de 128 MiB.
- D3D11 prefere hardware, com fallback para WARP em caso de falha; ainda assim deve passar por WGC. O frame pool usa `CreateFreeThreaded` e copia apenas `ContentSize`.
- A captura de HWND deve reverificar `IsWindow`, PID, exe canônico, nível de integridade, `IsIconic` e `GetWindowRect` antes e depois; qualquer mudança retorna `target_changed`, e é proibido juntar uma árvore UIA com imagens de instantes de observação diferentes.
- Falhar de forma fechada (fail closed) em desktop não interativo, tela de bloqueio (LockApp/Winlogon), secure desktop, alvos de alta integridade e janelas minimizadas.
- `bounds` é o intervalo de coordenadas físicas do desktop já revalidado; `width/height` são as dimensões em pixels do PNG. Quando houver divergência, a escala é explícita e é proibido assumir 1:1.
- Reutilizar o `state_id` existente e o visual-frame mais recente; não adicionar `screenshotId` e não modificar a surface de 30 tools, o tier ou as annotations.
- Só é possível ter `supportsScreenCapture=true` com os três exports completos no Windows mais suporte de runtime; addons antigos, incompletos ou malformados falham de forma fechada.
- `invalid_target` / `target_changed` fazem a observação do app falhar e exigem uma nova observação; demais falhas transitórias de captura de janela preservam a árvore UIA, mas com `screenshot=null`, `screenshot_error` não vazio e sem estabelecer um target de `state_image`.
- Os caminhos de captura existentes de macOS/Linux permanecem compatíveis; o SystemSurface do Windows continua sendo um fallback sem captura.
- Por padrão os testes não podem iniciar GUI nem ler a tela; o live smoke exige opt-in explícito e valida um desktop comum já desbloqueado antes de iniciar o Helper/fixture.
- O live smoke só pode controlar o processo de fixture que ele mesmo iniciou, e o `finally` deve restaurar/fechar todos os recursos; a saída não pode conter capturas, marcadores, títulos de janela, caminhos, tokens ou pipes.
- É obrigatório executar os testes focados/completos do zcode-cua, o rebuild nativo, build, typecheck e lint; o ZCode executa a integração com o Helper de origem, os testes focados de CUA, o teste do plugin oficial, typecheck e lint.
- A baseline não-CUA atual do `pnpm test:unit:affected` do ZCode precisa ser reexecutada e registrada item a item; não se pode chamar um resultado diferente de zero de aprovado.

---

## Estrutura de Arquivos

### `C:\Users\dev\zcode-cua`

- Create `src/native/windowsScreenCapture.ts` — gate dos três exports do Windows em conjunto, validação de outcome em runtime e tipos de erro fixos.
- Modify `src/native/types.ts` — outcome de screen capture do Windows, DTO de sucesso e métodos nativos additive.
- Modify `src/broker/server/nativeAxSource.ts` — ABI Windows additive do addon bruto do Helper, além dos campos broker-neutral `screenshot_bounds` / `screenshot_error`.
- Modify `src/broker/server/nodeAutomationAdapter.ts` — captura de monitor no Windows, capability/status e mapeamento de erro nativo → erro do broker.
- Modify `src/native/win.ts` — `captureApp` assíncrono com PNG de janela WGC verificado anexado, distinguindo falha de identidade de falha transitória.
- Modify `src/broker/server/platformAxSource.ts` — injetar o callback do bridge do Windows em `createAxWinReadOnlySource`.
- Modify `src/broker/server/axReadOnly.ts` — repassar `screenshot_bounds` / `screenshot_error`.
- Modify `src/targeting/types.ts` — `image_bounds` independente para state image.
- Modify `src/targeting/snapshot.ts` — ingerir `screenshot_bounds`.
- Modify `src/targeting/resolver.ts` — `state_image` usa `image_bounds ?? window.bounds`.
- Modify `src/broker/server/electronNativeBackend.ts` — anexar à resposta de screenshot os bounds do display selecionado atual.
- Modify `src/backend/broker-client.ts` — preservar os bounds additive de screenshot.
- Modify `src/tools/observation.ts` — o visual-frame usa os bounds/origem do selected-display retornados pelo broker e exibe `screenshot_error`.
- Create `src/native/screen_capture_win.h` — entrypoint N-API do WGC e seam de shutdown.
- Create `src/native/screen_capture_win.cc` — validação de target do WGC, quadro único D3D11, PNG via WIC e worker/outcome.
- Modify `src/native/ax_win.cc` — referenciar o módulo WGC, estado, exports e shutdown terminal.
- Modify `binding.gyp` — fontes do Windows, exceções C++ e libraries D3D/WIC/WinRT.
- Create `test/windows-native-screen-capture-adapter.test.ts` — bridge, capability do adapter, outcome e isolamento de plataforma.
- Create `test/windows-app-state-screen-capture.test.ts` — imagem anexada no Windows source, erros e bounds.
- Modify `test/windows-capability-truthfulness.test.ts` — veracidade das novas capabilities e screenshot do broker.
- Modify `test/observation-tools.test.ts` — origem do selected-display.
- Modify `test/targeting-resolver.test.ts` — mapeamento de `screenshot_bounds` → state image.
- Create `test/native/windows-wgc-screen-capture.test.ts` — source contract nativo e ABI compilada.
- Create `scripts/fixtures/windows-capture-smoke-window.ps1` — target/occluder WPF controlado, usado apenas pelo smoke com opt-in.
- Create `scripts/windows-screen-capture-live-smoke.mjs` — monitor, HWND com oclusão, app state, state-image, minimização e saída limpa.
- Create `test/windows-screen-capture-live-smoke.test.ts` — desligamento padrão e evidência de preflight.
- Modify `package.json` — `smoke:windows:screen-capture`.
- Modify `docs/platforms.md` — capacidade atual e limitações do WGC no Windows.
- Regenerate `dist/**` only through `pnpm build`.

### `C:\Users\dev\z-code`

- Modify `docs/cua/windows-source-development.md` — build de origem, portões automáticos, live smoke e riscos conhecidos.

## Fluxo de Dados e de Erros

```text
screenshot
  |
  +--> backend selected display bounds
         |
         +--> WindowsScreenCaptureBridge.captureMonitor(bounds)
                |
                +--> native WGC AsyncWorker
                +--> PNG + width/height + verified bounds
         |
         +--> broker reply {format,data,bounds}
                |
                +--> visual-frame
                       pointer = bounds width/height
                       origin  = bounds x/y

get_app_state(include_screenshot=true)
  |
  +--> UIA snapshot {pid, exe, hwnd, window bounds}
         |
         +--> WindowsScreenCaptureBridge.captureWindow(...)
                |
                +--> pre-validate identity/bounds
                +--> WGC first frame
                +--> post-validate identity/bounds
         |
         +--> {screenshot,screenshot_bounds}
                |
                +--> state_id
                       |
                       +--> state_image:
                              image pixel -> screenshot_bounds -> screen point
```

```text
native error             app-state behavior                    screenshot behavior
invalid_target           fail observation / reobserve          explicit broker error
target_changed           fail observation / reobserve          explicit broker error
unsupported              capability false                      not_authorized
unavailable              screenshot=null + warning             internal
busy / timeout           screenshot=null + warning             timeout
device_lost              screenshot=null + warning             retryable internal
too_large                screenshot=null + warning             invalid_request
capture/encode_failed    screenshot=null + warning             sanitized internal
malformed / rejection    screenshot=null + warning             sanitized internal
```

---

### Task 1: Adicionar o bridge tipado de screen capture do Windows

**Files:**

- Create: `C:\Users\dev\zcode-cua\src\native\windowsScreenCapture.ts`
- Modify: `C:\Users\dev\zcode-cua\src\native\types.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\nativeAxSource.ts`
- Test: `C:\Users\dev\zcode-cua\test\windows-native-screen-capture-adapter.test.ts`

**Interfaces:**

- Produz `AxWinScreenCaptureOutcome`, `WindowsScreenCaptureError`, `createWindowsScreenCaptureBridge(native)`.
- `bridge.available` é true apenas quando os três exports são funções e `isScreenCaptureSupported() === true`.
- `bridge.captureMonitor(bounds)` e `bridge.captureWindow(...)` retornam DTOs de sucesso validados ou lançam um `WindowsScreenCaptureError` com código fixo.

- [ ] **Step 1: Escrever os testes falhando do bridge**

Crie fakes para addons completos, parciais, malformados e rejeitantes. Fixe estas asserções:

```ts
expect(createWindowsScreenCaptureBridge(complete).available).toBe(true);
expect(
  createWindowsScreenCaptureBridge({
    ...complete,
    captureWindowPngVerifiedAsync: undefined,
  }).available,
).toBe(false);

await expect(bridge.captureMonitor([-1920, 0, 1920, 1080])).resolves.toMatchObject({
  format: "png",
  width: 1920,
  height: 1080,
  bounds: [-1920, 0, 1920, 1080],
});

await expect(malformed.captureMonitor([0, 0, 1, 1])).rejects.toMatchObject({
  name: "WindowsScreenCaptureError",
  code: "capture_failed",
});
```

- [ ] **Step 2: Executar o novo teste e verificar RED**

Run:

```powershell
pnpm exec vitest run test/windows-native-screen-capture-adapter.test.ts
```

Expected: FAIL porque `windowsScreenCapture.ts` e os três métodos nativos não existem.

- [ ] **Step 3: Adicionar os DTOs nativos exatos**

Adicione a `src/native/types.ts` e replique os métodos em `HelperNativeAddon`:

```ts
export type AxWinScreenCaptureErrorCode =
  | "unsupported"
  | "unavailable"
  | "busy"
  | "timeout"
  | "invalid_target"
  | "target_changed"
  | "too_large"
  | "device_lost"
  | "capture_failed"
  | "encode_failed";

export type AxWinScreenCaptureOutcome =
  | {
      ok: true;
      format: "png";
      data: Uint8Array;
      width: number;
      height: number;
      bounds: [number, number, number, number];
    }
  | { ok: false; error: AxWinScreenCaptureErrorCode };

isScreenCaptureSupported?(): boolean;
captureMonitorPngAsync?(
  bounds: [number, number, number, number],
): Promise<AxWinScreenCaptureOutcome>;
captureWindowPngVerifiedAsync?(
  windowId: number,
  pid: number,
  expectedCanonicalBundleId: string,
  expectedBounds?: [number, number, number, number],
): Promise<AxWinScreenCaptureOutcome>;
```

- [ ] **Step 4: Implementar validação estrita em runtime**

`createWindowsScreenCaptureBridge` deve:

```ts
const hasCompleteAbi =
  typeof native.isScreenCaptureSupported === "function" &&
  typeof native.captureMonitorPngAsync === "function" &&
  typeof native.captureWindowPngVerifiedAsync === "function";

const available = hasCompleteAbi && safeSupported(native) === true;
```

A validação de sucesso exige um `Uint8Array` não vazio com assinatura de PNG, dimensões inteiras seguras e positivas, bounds finitos com quatro números e format exatamente `"png"`. A validação de falha aceita apenas os dez códigos fixos. Throw síncrono, rejeição de Promise e outcome malformado viram `WindowsScreenCaptureError("capture_failed")`; nenhuma mensagem original é retida.

- [ ] **Step 5: Executar os testes do bridge e o typecheck**

Run:

```powershell
pnpm exec vitest run test/windows-native-screen-capture-adapter.test.ts
pnpm typecheck
```

Expected: PASS; typecheck exit 0.

- [ ] **Step 6: Commit**

```powershell
git add -- src/native/types.ts src/native/windowsScreenCapture.ts src/broker/server/nativeAxSource.ts test/windows-native-screen-capture-adapter.test.ts
git commit -m "feat(windows): define native screen capture bridge"
```

---

### Task 2: Rotear o Screenshot do Selected-Display pelo Bridge Nativo

**Files:**

- Modify: `C:\Users\dev\zcode-cua\src\broker\server\nodeAutomationAdapter.ts`
- Modify: `C:\Users\dev\zcode-cua\test\windows-native-screen-capture-adapter.test.ts`
- Modify: `C:\Users\dev\zcode-cua\test\windows-capability-truthfulness.test.ts`
- Modify: `C:\Users\dev\zcode-cua\test\broker\windowsSystemSurface.test.ts`

**Interfaces:**

- Consumes `createWindowsScreenCaptureBridge`.
- Produces `ElectronAutomationAdapter.supportsScreenCapture`, status e `captureScreenPng(area)` verídicos.

- [ ] **Step 1: Adicionar testes RED do adapter**

Afirme:

```ts
expect(adapter.supportsScreenCapture).toBe(true);
expect(adapter.getScreenMediaAccessStatus()).toBe("granted");
await expect(
  adapter.captureScreenPng({
    x: -1920,
    y: 0,
    width: 1920,
    height: 1080,
  }),
).resolves.toEqual(PNG_BYTES);
expect(native.captureMonitorPngAsync).toHaveBeenCalledWith([-1920, 0, 1920, 1080]);
```

Fixe também:

- ABI parcial → false e sem dispatch nativo;
- `busy` → `BrokerError.code === "timeout"`;
- `too_large` → `invalid_request`;
- `unsupported` → `not_authorized`;
- outros erros fixos/malformados → `internal` sanitizado;
- darwin/linux continuam usando `system.captureScreenPng`.

- [ ] **Step 2: Executar e observar RED**

```powershell
pnpm exec vitest run test/windows-native-screen-capture-adapter.test.ts test/windows-capability-truthfulness.test.ts test/broker/windowsSystemSurface.test.ts
```

Expected: as novas asserções de capability e de dispatch do Windows falham.

- [ ] **Step 3: Implementar o ramo do adapter exclusivo de Windows**

Dentro de `createNodeAutomationAdapter`:

```ts
const windowsCapture =
  platform === "win32"
    ? createWindowsScreenCaptureBridge(native as unknown as AxWinNativeAddon)
    : null;

const supportsScreenCapture =
  platform === "win32"
    ? windowsCapture?.available === true
    : system.supportsScreenCapture !== false;
```

Para o Windows, `getScreenMediaAccessStatus` retorna `"granted"` somente quando o bridge está disponível; caso contrário o `"denied"` nativo é preservado e todos os outros casos são `"unknown"`. `captureScreenPng(area)` escolhe a área informada ou os bounds do display primário atual, aguarda `captureMonitor` e retorna apenas o `data` dele. Não chame `WindowsNodeSystemSurface.captureScreenPng`.

- [ ] **Step 4: Implementar o mapeamento fixo de erros do broker**

Adicione `screenCaptureError(operation, code)`:

```ts
busy | timeout       -> BrokerError("timeout")
too_large            -> BrokerError("invalid_request")
unsupported          -> BrokerError("not_authorized")
invalid_target |
target_changed       -> BrokerError("element_unavailable")
unavailable |
device_lost |
capture_failed |
encode_failed        -> BrokerError("internal")
```

As mensagens podem nomear apenas a operação e o código fixo.

- [ ] **Step 5: Executar os testes focados e o typecheck**

```powershell
pnpm exec vitest run test/windows-native-screen-capture-adapter.test.ts test/windows-capability-truthfulness.test.ts test/broker/windowsSystemSurface.test.ts
pnpm typecheck
```

Expected: PASS; o Windows SystemSurface continua false enquanto o adapter nativo completo é true.

- [ ] **Step 6: Commit**

```powershell
git add -- src/broker/server/nodeAutomationAdapter.ts test/windows-native-screen-capture-adapter.test.ts test/windows-capability-truthfulness.test.ts test/broker/windowsSystemSurface.test.ts
git commit -m "feat(windows): route monitor capture through native WGC"
```

---

### Task 3: Anexar Imagens WGC Verificadas ao Estado de App do Windows

**Files:**

- Modify: `C:\Users\dev\zcode-cua\src\native\win.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\platformAxSource.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\axReadOnly.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\ax-types.ts`
- Modify: `C:\Users\dev\zcode-cua\src\targeting\types.ts`
- Modify: `C:\Users\dev\zcode-cua\src\targeting\snapshot.ts`
- Modify: `C:\Users\dev\zcode-cua\src\targeting\resolver.ts`
- Test: `C:\Users\dev\zcode-cua\test\windows-app-state-screen-capture.test.ts`
- Modify: `C:\Users\dev\zcode-cua\test\targeting-resolver.test.ts`

**Interfaces:**

- `createAxWinReadOnlySource(native, {captureWindowPngVerified})`.
- `AxRawSnapshot.screenshot_bounds?: Bounds`.
- `AxRawSnapshot.screenshot_error?: string`.
- `AppState.image_bounds?: Bounds`.

- [ ] **Step 1: Escrever testes RED de source/state**

Teste um snapshot UIA nativo com HWND 42, pid 4321, caminho de exe e bounds. Afirme:

```ts
const result = await source.captureApp({ pid: 4321, window_id: 42 }, { includeScreenshot: true });
expect(captureWindowPngVerified).toHaveBeenCalledWith({
  windowId: 42,
  pid: 4321,
  expectedCanonicalBundleId: "C:\\Apps\\Target.exe",
  expectedBounds: [100, 80, 800, 600],
});
expect(result).toMatchObject({
  screenshot: { format: "png" },
  screenshot_bounds: [102, 82, 796, 596],
});
```

Afirme também:

- `includeScreenshot:false` nunca invoca WGC;
- HWND/PID/exe ausente retorna a árvore UIA sem imagem;
- `invalid_target` / `target_changed` rejeitam toda a observação;
- `busy` / `timeout` / `device_lost` / falha de captura ou encode retornam a árvore UIA, `screenshot:null` e um `screenshot_error` fixo;
- os bytes de imagem viram base64 exatamente uma vez;
- o resolver mapeia os cantos do state-image por `image_bounds`, e não por `window.bounds`.

- [ ] **Step 2: Executar e verificar RED**

```powershell
pnpm exec vitest run test/windows-app-state-screen-capture.test.ts test/targeting-resolver.test.ts
```

Expected: FAIL porque o callback e os campos de image bounds não existem.

- [ ] **Step 3: Estender os contratos de raw snapshot e de state**

Adicione:

```ts
interface AxRawSnapshot {
  screenshot?: AxImagePayload | null;
  screenshot_bounds?: [number, number, number, number];
  screenshot_error?: string;
}

interface AppState {
  image_bounds?: Bounds;
}
```

`ingestCaptureAppResult` valida `screenshot_bounds` com `asBounds` somente quando existe uma imagem não vazia e decodificável. `resolveStateImageCoordinate` usa:

```ts
const [wx, wy, ww, wh] = state.image_bounds ?? state.window.bounds;
```

- [ ] **Step 4: Tornar assíncrono o caminho de captura do Windows source**

O source captura a UIA primeiro e então invoca o callback injetado usando a identidade exata do snapshot:

```ts
captureApp: async (appRef, options) => {
  const snap = native.captureApp(pid, requestedWindowId);
  const adapted = adaptSnapshot(snap);
  if (options?.includeScreenshot === false) return adapted;
  const captured = await options.captureWindowPngVerified?.({
    windowId: snap.window.window_id,
    pid: snap.app.pid,
    expectedCanonicalBundleId: snap.app.bundle_id,
    expectedBounds: snap.window.bounds,
  });
  return {
    ...adapted,
    screenshot: {
      format: "png",
      data: Buffer.from(captured.data).toString("base64"),
    },
    screenshot_bounds: captured.bounds,
  };
};
```

Capture apenas `WindowsScreenCaptureError`. Relance `invalid_target` e `target_changed` como `elementUnavailable`; retorne um `screenshot_error` fixo para códigos transitórios. Nunca capture erros de UIA nem erros arbitrários de programação.

- [ ] **Step 5: Injetar o bridge e expor os avisos**

`selectPlatformAxSource` cria um bridge do Windows e passa `captureWindow` apenas quando disponível. `axReadOnly` copia `screenshot_bounds` e `screenshot_error` para a resposta do broker. `mapRawCaptureAppResult` adiciona um bloco de texto:

```text
[screenshot_error] Windows window pixels were unavailable (<fixed-code>).
The accessibility tree is still valid; call get_app_state again before using state_image coordinates.
```

Ele não pode ecoar mensagens nativas arbitrárias.

- [ ] **Step 6: Executar os testes focados e o typecheck**

```powershell
pnpm exec vitest run test/windows-app-state-screen-capture.test.ts test/targeting-resolver.test.ts test/observation-tools.test.ts test/native/capture-app-window-id.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```powershell
git add -- src/native/win.ts src/broker/server/platformAxSource.ts src/broker/server/axReadOnly.ts src/broker/ax-types.ts src/targeting/types.ts src/targeting/snapshot.ts src/targeting/resolver.ts src/tools/observation.ts test/windows-app-state-screen-capture.test.ts test/targeting-resolver.test.ts test/observation-tools.test.ts
git commit -m "feat(windows): attach verified window images to app state"
```

---

### Task 4: Preservar os Bounds do Selected-Display nos Visual Frames de Screenshot

**Files:**

- Modify: `C:\Users\dev\zcode-cua\src\broker\server\electronNativeBackend.ts`
- Modify: `C:\Users\dev\zcode-cua\src\backend\broker-client.ts`
- Modify: `C:\Users\dev\zcode-cua\src\tools\observation.ts`
- Modify: `C:\Users\dev\zcode-cua\test\observation-tools.test.ts`
- Modify: `C:\Users\dev\zcode-cua\test\targeting-screenshot-space.test.ts`
- Modify: `C:\Users\dev\zcode-cua\test\windows-capability-truthfulness.test.ts`

**Interfaces:**

- O resultado de screenshot do broker se torna o additive `{format,data,bounds:[x,y,w,h]}`.
- Respostas antigas do Helper sem bounds mantêm o fallback atual do display primário.

- [ ] **Step 1: Adicionar testes RED de origem negativa**

Defina o display 2 como `[-1920,0,1920,1080]`, chame `set_display({index:2})` e então afirme que o screenshot do backend retorna esses bounds. Passe a resposta ao handler de screenshot do MCP e afirme:

```ts
expect(getDefaultSession().getVisualFrame()).toMatchObject({
  pointer: { width: 1920, height: 1080 },
  origin: { x: -1920, y: 0 },
});
expect(visualFrameToScreen(frame, frame.agent.width - 1, frame.agent.height - 1)).toEqual({
  x: -1,
  y: 1079,
});
```

- [ ] **Step 2: Executar e observar RED**

```powershell
pnpm exec vitest run test/observation-tools.test.ts test/targeting-screenshot-space.test.ts test/windows-capability-truthfulness.test.ts
```

Expected: o backend/client descarta os bounds e o handler registra a origem `(0,0)`.

- [ ] **Step 3: Carregar os bounds additive ponta a ponta**

Backend:

```ts
const selected = displaySelection.current();
const png = await adapter.captureScreenPng(selected.bounds);
return {
  format: "png",
  data: toBase64(png),
  bounds: [selected.bounds.x, selected.bounds.y, selected.bounds.width, selected.bounds.height],
};
```

O client valida bounds finitos e positivos quando presentes e os preserva. O handler usa width/height dos bounds como `pointer` e x/y como `origin`; somente bounds legados ausentes/inválidos chamam `fetchMainDisplaySize` e usam `(0,0)`.

- [ ] **Step 4: Executar os testes focados e o typecheck**

```powershell
pnpm exec vitest run test/observation-tools.test.ts test/targeting-screenshot-space.test.ts test/windows-capability-truthfulness.test.ts
pnpm typecheck
```

Expected: PASS, incluindo a resposta legada sem bounds.

- [ ] **Step 5: Commit**

```powershell
git add -- src/broker/server/electronNativeBackend.ts src/backend/broker-client.ts src/tools/observation.ts test/observation-tools.test.ts test/targeting-screenshot-space.test.ts test/windows-capability-truthfulness.test.ts
git commit -m "fix(cua): preserve selected display screenshot origin"
```

---

### Task 5: Implementar a Captura Nativa WGC de Quadro Único

**Files:**

- Create: `C:\Users\dev\zcode-cua\src\native\screen_capture_win.h`
- Create: `C:\Users\dev\zcode-cua\src\native\screen_capture_win.cc`
- Modify: `C:\Users\dev\zcode-cua\src\native\ax_win.cc`
- Modify: `C:\Users\dev\zcode-cua\binding.gyp`
- Test: `C:\Users\dev\zcode-cua\test\native\windows-wgc-screen-capture.test.ts`
- Modify: `C:\Users\dev\zcode-cua\test\native\windows-capability-truthfulness.test.ts`

**Interfaces:**

- O header exporta `IsScreenCaptureSupportedNow`, os três callbacks N-API e `BeginScreenCaptureShutdown`.
- O worker nativo sempre resolve um outcome estruturado; entrada inválida nunca provoca crash nem vaza erros brutos.

- [ ] **Step 1: Escrever testes RED de source/ABI nativos**

Leia o novo source/header/binding como UTF-8 e fixe:

```ts
expect(binding).toContain('"src/native/screen_capture_win.cc"');
expect(binding).toContain('"d3d11.lib"');
expect(binding).toContain('"windowscodecs.lib"');
expect(binding).toContain('"runtimeobject.lib"');
expect(source).toContain("IGraphicsCaptureItemInterop");
expect(source).toContain("CreateForMonitor");
expect(source).toContain("CreateForWindow");
expect(source).toContain("CreateFreeThreaded");
expect(source).toContain("D3D11_CPU_ACCESS_READ");
expect(source).toContain("GUID_ContainerFormatPng");
expect(source).toContain("std::timed_mutex");
expect(source).toContain("milliseconds(250)");
expect(source).toContain("milliseconds(2000)");
expect(source).not.toContain("BitBlt");
expect(source).not.toContain("PrintWindow");
```

As verificações compiladas exigem as três funções e verificam que bounds/HWND inválidos resolvem `{ok:false}` sem lançar.

- [ ] **Step 2: Executar os testes de source e observar RED**

```powershell
pnpm exec vitest run test/native/windows-wgc-screen-capture.test.ts test/native/windows-capability-truthfulness.test.ts
```

Expected: FAIL porque o módulo nativo e os exports não existem.

- [ ] **Step 3: Adicionar as entradas de build**

`binding.gyp` do Windows:

```text
sources += src/native/screen_capture_win.cc
libraries += d3d11.lib, dxgi.lib, runtimeobject.lib, windowscodecs.lib, WindowsApp.lib
VCCLCompilerTool.ExceptionHandling = 1
```

Mantenha `NAPI_DISABLE_CPP_EXCEPTIONS`, `/utf-8`, C++17 e todas as libraries existentes. `/EHsc` é necessário apenas para que as exceções de C++/WinRT possam ser capturadas dentro do worker.

- [ ] **Step 4: Implementar a validação de target e a sondagem de suporte**

`IsScreenCaptureSupportedNow` deve exigir:

- input desktop interativo chamado `default`;
- processo em primeiro plano diferente de `LockApp.exe`, `LogonUI.exe` ou `winlogon.exe`;
- `GraphicsCaptureSession::IsSupported()`;
- consulta à activation factory de `IGraphicsCaptureItemInterop`.

A resolução do monitor enumera os displays e exige igualdade exata de `RECT`. A validação de janela roda antes e depois da captura e retorna apenas:

```cpp
struct VerifiedWindow {
  HWND hwnd;
  DWORD pid;
  std::wstring executable;
  RECT bounds;
};
```

Ela rejeita o próprio PID, PID elevado, janela inválida/minimizada/de área zero e divergência de identidade/bounds esperada.

- [ ] **Step 5: Implementar o caminho de quadro D3D/WGC**

Ciclo de vida exato:

```text
CoInitializeEx(COINIT_MULTITHREADED)
try_lock_for(250ms)
D3D11CreateDevice(HARDWARE, BGRA)
  -> retry D3D_DRIVER_TYPE_WARP
CreateDirect3D11DeviceFromDXGIDevice
CreateForMonitor / CreateForWindow
Direct3D11CaptureFramePool::CreateFreeThreaded(..., B8G8R8A8, 2, item.Size())
FrameArrived + Closed signals
StartCapture
wait_until(now + 2000ms)
TryGetNextFrame
copy ContentSize to staging D3D11_TEXTURE2D
Map(D3D11_MAP_READ)
WIC PNG encoder -> IStream/HGLOBAL -> bounded vector
Unmap + session.Close + pool.Close + release
post-validate target
CoUninitialize when owned
```

Toda a limpeza usa RAII. Verificar a flag de shutdown terminal antes de criar a session e após receber o quadro.

- [ ] **Step 6: Implementar o glue de worker/outcome/export**

`ScreenCaptureWorker` possui apenas primitivas copiadas; nenhum valor N-API é lido em `Execute`. `OnOK` cria um destes:

```cpp
{ ok: true, format: "png", data: Buffer, width, height, bounds }
```

ou:

```cpp
{ ok: false, error: "<fixed code>" }
```

`ax_win.cc`:

```cpp
exports.Set("isScreenCaptureSupported",
            Napi::Function::New(env, IsScreenCaptureSupported));
exports.Set("captureMonitorPngAsync",
            Napi::Function::New(env, CaptureMonitorPngAsync));
exports.Set("captureWindowPngVerifiedAsync",
            Napi::Function::New(env, CaptureWindowPngVerifiedAsync));
```

`ScreenCaptureStatus` retorna granted apenas quando `IsScreenCaptureSupportedNow()`; `CancelPendingInputHolds` também chama `BeginScreenCaptureShutdown()`.

- [ ] **Step 7: Rebuild e execução dos testes compilados**

```powershell
pnpm rebuild:native
pnpm exec vitest run test/native/windows-wgc-screen-capture.test.ts test/native/windows-capability-truthfulness.test.ts
```

Expected: node-gyp exit 0; os testes de export compilado e de target inválido PASSam.

- [ ] **Step 8: Executar todos os testes visuais focados**

```powershell
pnpm exec vitest run test/windows-native-screen-capture-adapter.test.ts test/windows-app-state-screen-capture.test.ts test/windows-capability-truthfulness.test.ts test/observation-tools.test.ts test/targeting-resolver.test.ts test/targeting-screenshot-space.test.ts test/native/windows-wgc-screen-capture.test.ts test/native/windows-capability-truthfulness.test.ts
pnpm typecheck
```

Expected: PASS.

- [ ] **Step 9: Commit**

```powershell
git add -- binding.gyp src/native/screen_capture_win.h src/native/screen_capture_win.cc src/native/ax_win.cc test/native/windows-wgc-screen-capture.test.ts test/native/windows-capability-truthfulness.test.ts
git commit -m "feat(windows): implement WGC visual capture"
```

---

### Task 6: Adicionar uma Aceitação Live Autônoma com Opt-In

**Files:**

- Create: `C:\Users\dev\zcode-cua\scripts\fixtures\windows-capture-smoke-window.ps1`
- Create: `C:\Users\dev\zcode-cua\scripts\windows-screen-capture-live-smoke.mjs`
- Create: `C:\Users\dev\zcode-cua\test\windows-screen-capture-live-smoke.test.ts`
- Modify: `C:\Users\dev\zcode-cua\package.json`

**Interfaces:**

- Gate de ambiente: `ZCODE_CUA_WINDOWS_SCREEN_CAPTURE_LIVE=1`.
- O fixture grava apenas PID/HWND/bounds em um arquivo temporário privado criado pelo chamador e sai mediante um sinal privado de fechamento.
- O smoke controla apenas os seus dois processos de fixture.

- [ ] **Step 1: Escrever testes RED de guard**

Execute o smoke sem opt-in e afirme que o código de saída é 2, que não há marcador de Helper/fixture e que a mensagem nomeia apenas a variável de opt-in. Adicione um override de preflight somente para testes que simule a tela de bloqueio e afirme que ele sai antes de gerar qualquer processo.

- [ ] **Step 2: Executar e observar RED**

```powershell
pnpm exec vitest run test/windows-screen-capture-live-smoke.test.ts
```

Expected: FAIL porque o smoke não existe.

- [ ] **Step 3: Implementar o fixture WPF**

O modo target renderiza um checkerboard determinístico verde/magenta mais um botão seguro; o modo occluder renderiza azul opaco. Ambos usam a geometria fornecida pelo chamador e arquivos privados de handshake independentes de título. Não ler a área de transferência, janelas do usuário ou documentos do usuário.

- [ ] **Step 4: Implementar o preflight live e a limpeza**

Antes de qualquer spawn:

```text
win32
AND opt-in == 1
AND dist/windows-helper.js exists
AND build/Release/ax_native.node exists
AND current input desktop == default
AND foreground pid exists
AND foreground exe not LockApp/LogonUI/winlogon
```

Use caminhos temporários aleatórios e um token de broker aleatório. No `finally`, sinalize e encerre apenas os PIDs de fixture/helper criados por esta execução, remova os arquivos temporários privados e verifique que o PID do Helper desapareceu.

- [ ] **Step 5: Implementar a sequência de aceitação**

O smoke deve provar automaticamente:

1. `broker_info.capabilities.screen === true` e `screenshot === true`;
2. o screenshot do monitor selecionado é um PNG válido e não vazio, com bounds correspondentes;
3. a captura direta por HWND do fixture target é válida;
4. o occluder opaco cobre completamente o target por geometria;
5. a captura do target ocluído permanece perceptivelmente equivalente ao target não ocluído e distinta do occluder;
6. `capture_app(include_screenshot=true)` retorna imagem/bounds;
7. depois que o `get_app_state` oficial do MCP retorna `state_id`, o clique em `left_click(space:"state_image")` no botão seguro altera somente o state pertencente ao fixture;
8. um target minimizado retorna falha fixa;
9. o Helper e os fixtures saem de forma limpa.

Apenas booleanos, dimensões, códigos de resultado fixos e fatos de saída de processos podem ser impressos.

- [ ] **Step 6: Adicionar o comando de package e rodar o teste de guard**

```json
"smoke:windows:screen-capture": "node scripts/windows-screen-capture-live-smoke.mjs"
```

Run:

```powershell
pnpm exec vitest run test/windows-screen-capture-live-smoke.test.ts
```

Expected: PASS; sem opt-in nenhum processo de GUI é iniciado.

- [ ] **Step 7: Tentar o live smoke**

```powershell
$env:ZCODE_CUA_WINDOWS_SCREEN_CAPTURE_LIVE='1'
pnpm smoke:windows:screen-capture
Remove-Item Env:ZCODE_CUA_WINDOWS_SCREEN_CAPTURE_LIVE
```

Expected em um desktop comum já desbloqueado: exit 0 e todos os booleanos fixos de aceitação verdadeiros. Em LockApp/desktop não interativo: exit 2 antes do início do Helper/fixture; registrar como bloqueado pelo ambiente, e não como aprovado.

- [ ] **Step 8: Commit**

```powershell
git add -- package.json scripts/fixtures/windows-capture-smoke-window.ps1 scripts/windows-screen-capture-live-smoke.mjs test/windows-screen-capture-live-smoke.test.ts
git commit -m "test(windows): add WGC live acceptance"
```

---

### Task 7: Atualizar os Fatos de Desenvolvimento de Origem e os Artefatos Gerados

**Files:**

- Modify: `C:\Users\dev\zcode-cua\docs\platforms.md`
- Modify: `C:\Users\dev\z-code\docs\cua\windows-source-development.md`
- Regenerate: `C:\Users\dev\zcode-cua\dist\**`

- [ ] **Step 1: Atualizar os fatos de plataforma**

Documentar os caminhos implementados de monitor/janela/app-state via WGC, a borda padrão do sistema, a limitação SDR/HDR, o fail-closed para janelas minimizadas, a ABI nativa, o comando com opt-in e o status apenas-de-origem. Reter explicitamente remoto/mobile/packaging como fora de escopo.

- [ ] **Step 2: Construir os artefatos gerados**

```powershell
pnpm build
```

Expected: exit 0; `dist/windows-helper.js` contém o novo caminho TypeScript enquanto o source nativo permanece nos arquivos do package.

- [ ] **Step 3: Verificar que os docs não contêm afirmações obsoletas de "WGC não implementado"**

```powershell
rg -n "WGC|screen capture|screenshot|截图|未实现|pending" docs README.md
```

Expected: as afirmações pending restantes referem-se apenas a packaging/HDR/borda ou a outros non-goals explícitos.

- [ ] **Step 4: Commitar em cada repositório**

Em `zcode-cua`:

```powershell
git add -- docs/platforms.md dist
git commit -m "docs(windows): record WGC visual support"
```

Em `z-code`:

```powershell
git add -- docs/cua/windows-source-development.md
git commit -m "docs(cua): record Windows WGC source flow"
```

---

### Task 8: Executar a Verificação Completa e a Auditoria de Conclusão

**Files:**

- Sem edições de source planejadas. Qualquer falha segue `superpowers:systematic-debugging`; não corrigir por suposição.

- [x] **Step 1: Executar a verificação focada do zcode-cua**

```powershell
pnpm exec vitest run test/windows-native-screen-capture-adapter.test.ts test/windows-app-state-screen-capture.test.ts test/windows-capability-truthfulness.test.ts test/observation-tools.test.ts test/targeting-resolver.test.ts test/targeting-screenshot-space.test.ts test/native/windows-wgc-screen-capture.test.ts test/native/windows-capability-truthfulness.test.ts test/windows-screen-capture-live-smoke.test.ts
pnpm rebuild:native
pnpm build
pnpm typecheck
pnpm lint
```

Expected: every command exit 0.

- [x] **Step 2: Executar a suíte completa do zcode-cua**

```powershell
pnpm test
```

Expected: exit 0; platform/live skips are explicit.

- [x] **Step 3: Executar os portões de integração do ZCode**

Use o ambiente de source-helper existente e execute:

```powershell
pnpm exec vitest run packages/services/test/cuaPermissionBroker.server.win32.test.ts packages/services/test/cuaPermissionBrokerNodeHelper.test.ts packages/services/test/cuaPermissionBroker.platformAxSource.test.ts packages/services/test/cuaPermissionBroker.electronBackend.test.ts
pnpm --filter @zcode/zcode-cua-plugin test
pnpm typecheck
pnpm lint
pnpm test:unit:affected
```

Expected: focused/plugin/typecheck/lint exit 0. Record `test:unit:affected` exact failures; only previously evidenced non-CUA baseline may remain.

- [x] **Step 4: Repetir todas as aceitações live autônomas**

Em um desktop comum já desbloqueado:

```powershell
$env:ZCODE_CUA_WINDOWS_SCREEN_CAPTURE_LIVE='1'
$env:ZCODE_CUA_WINDOWS_POINTER_LIVE='1'
$env:ZCODE_CUA_WINDOWS_CLIPBOARD_LIVE='1'
pnpm smoke:windows:screen-capture
pnpm smoke:windows:pointer
pnpm smoke:windows:clipboard
```

Remova as três variáveis de ambiente no `finally`. Esperado: exit 0; a área de transferência restaura o texto original; os testes de ponteiro e visual mutam apenas fixtures gerados; nenhum Helper órfão.

- [x] **Step 5: Auditar a surface real de 30 tools do Windows**

Para cada família de capability/tool do broker, coletar a evidência atual:

```text
observation: list_apps, list_windows, get_app_state, screenshot, zoom,
             list_displays, switch_display, cursor_position
pointer:     click variants, move, scroll, drag, mouse down/up
keyboard:    type, press, key down/up, hold
elements:    press, focus, set_value, select_text, perform_action
system:      clipboard read/write, open_application, access/readiness
```

Marcar cada uma como provada, contradita, ausente ou apenas coberta indiretamente. Não marcar o objetivo como concluído enquanto qualquer operação local exigida do Windows não tiver source, teste automatizado e evidência de runtime em desktop comum.

- [x] **Step 6: Status final**

Se todos os requisitos e as evidências live passarem, atualizar o objetivo persistente para concluído. Se apenas o desktop estiver bloqueado, deixar o objetivo ativo e reportar a aceitação live pendente exata, sem redefinir a conclusão da implementação.

---

### Task 9: Fechar as Lacunas de Evidência de Runtime das 30 Tools do Windows

A auditoria da Task 8 verificou que toda tool pública tem source e cobertura automatizada, mas várias operações locais do Windows ainda têm apenas evidência indireta em desktop comum. Adicionar uma aceitação com opt-in que exercita os handlers oficiais do MCP contra uma janela WPF pertencente ao fixture; reutilizar os smokes dedicados de visual, ponteiro e área de transferência como evidência independente, em vez de controlar apps ou arquivos do usuário.

**Files:**

- Create: `C:\Users\dev\zcode-cua\scripts\fixtures\windows-tool-surface-smoke-window.ps1`
- Create: `C:\Users\dev\zcode-cua\scripts\windows-tool-surface-live-smoke.mjs`
- Create: `C:\Users\dev\zcode-cua\test\windows-tool-surface-live-smoke.test.ts`
- Modify: `C:\Users\dev\zcode-cua\package.json`
- Modify: `C:\Users\dev\zcode-cua\docs\platforms.md`
- Modify: `C:\Users\dev\z-code\docs\cua\windows-source-development.md`

**Cadeia de estado e eventos:**

```text
opt-in parent
  |
  +--> fixture-owned WPF window
  |      +--> UIA elements: text box + action button
  |      +--> pointer/key event counters
  |      `--> private JSON state + close signal
  |
  +--> source windows-helper.js
  |      `--> named pipe -> Windows native UIA / SendInput / WGC
  |
  `--> official buildServer + in-memory MCP client
         |
         +--> observation/runtime tool results
         +--> element tokens from one get_app_state
         `--> pointer/keyboard/semantic actions
                    |
                    `--> fixture event/state change -> bounded verification
```

O smoke deve manter a fronteira local do desktop: sem SSH, WSL, Docker, remote workspace, `/remote` do celular, documentos do usuário ou limpeza de processos não controlados. Ele pode mover o ponteiro apenas dentro da própria janela, deve restaurar o cursor e o texto da área de transferência originais, liberar qualquer input retido no `finally`, fechar apenas os filhos que gerou e imprimir somente booleanos/contagens/códigos de status fixos.

- [x] **Step 1: Escrever testes RED de guard**

Travar:

- `ZCODE_CUA_WINDOWS_TOOL_SURFACE_LIVE=1` explícito antes de qualquer spawn de filho;
- saída `2` para desktop bloqueado simulado antes de qualquer spawn de filho;
- deadlines fixos de total e por operação;
- caminhos privados do fixture e limpeza de filhos pertencentes à execução;
- todos os 30 nomes canônicos de tools são cobertos por invocação direta ou por um smoke live companheiro explicitamente nomeado;
- restauração da área de transferência e do cursor são campos obrigatórios de sucesso.

- [x] **Step 2: Implementar o fixture WPF**

Expor nomes e bounds de UIA determinísticos para:

- uma text box editável cujo valor e seleção são escritos no state privado;
- um botão invocável cujos efeitos semântico e bruto de clique são contados;
- um pad de ponteiro que registra move, down/up esquerdo/direito/central, contagem de cliques, delta da roda e distância de arrasto;
- contadores de preview de key down/up.

O fixture precisa usar DPI awareness PMv2 antes de criar o primeiro HWND e gravar PID/HWND/bounds físicos no seu handshake privado.

- [x] **Step 3: Implementar a aceitação oficial do MCP**

Chamar toda operação pública antes apenas indireta através de `buildServer`:

- observation: `list_apps`, `open_application` em forma de PID, `list_windows`, `get_app_state`, `screenshot`, `zoom`, `list_displays`, `switch_display`, `cursor_position`;
- pointer: todos os cinco perfis de clique, `scroll` não zero, `left_click_drag`, `mouse_move`, `left_mouse_down`, `left_mouse_up`;
- keyboard/semântico: `type`, `set_value`, `select_text`, `key`, `hold_key`, `perform_action`;
- runtime: `request_access`, `wait` limitado, `stop_computer_control`.

O smoke dedicado de área de transferência continua sendo a autoridade para `read_clipboard`/`write_clipboard`, e o smoke dedicado de visual continua sendo a prova autoritativa de `state_image`/WGC/janela minimizada. O novo smoke registra esses comandos companheiros como evidência obrigatória e falha se o seu próprio conjunto de invocações oficiais do MCP mais os dois nomes companheiros não for igual ao manifesto canônico de 30 tools.

- [x] **Step 4: Executar a aceitação live e os smokes companheiros**

```powershell
$env:ZCODE_CUA_WINDOWS_TOOL_SURFACE_LIVE='1'
pnpm smoke:windows:tool-surface
Remove-Item Env:ZCODE_CUA_WINDOWS_TOOL_SURFACE_LIVE
```

Depois reexecutar os smokes live de screen capture, pointer e clipboard com seus opt-ins existentes. Esperado: todos os booleanos verdadeiros; área de transferência/cursor restaurados; nenhum Helper ou fixture órfão.

- [x] **Step 5: Atualizar a matriz de evidências e commitar**

Registrar uma linha por tool canônica com evidência de source, automatizada e de runtime em desktop comum. Não substituir evidência ausente explícita por afirmações em nível de grupo. Commitar a aceitação e a documentação antes de reexecutar os portões completos de repositório da Task 8.

**Evidência de conclusão (2026-07-29):**

- o rebuild/build/typecheck/lint do source nativo saíram todos com `0`; a verificação focada do Windows foi de 16 arquivos / 158 testes, e a suíte completa foi de 122 arquivos passed / 6 skipped com 2105 testes passed / 67 skipped / 18 todo;
- a aceitação de screen capture passou em três execuções consecutivas após a correção, incluindo bounds de selected-display, pixels WGC ocluídos, entrada de evento `state_image`, fail-closed de janela minimizada, restauração do cursor e saída limpa dos filhos;
- as aceitações de ponteiro, área de transferência somente-texto e da surface de 30 tools saíram todas com `0`; o texto da área de transferência e o cursor foram restaurados, e nenhum Helper/fixture pertencente à execução permaneceu;
- a integração focada do ZCode foi de 4 arquivos / 175 passed / 1 skipped; os 6 testes do package oficial do plugin, o typecheck da raiz e o lint saíram todos com `0`;
- `pnpm test:unit:affected` permaneceu como uma baseline de repositório não-CUA documentada: 13 arquivos failed / 20 testes failed, 940 arquivos passed / 8132 testes passed. Nenhum dos arquivos que falharam era source de CUA nem teste de CUA.

Ambos os fixtures PowerShell devem manter um BOM UTF-8. O Windows PowerShell 5.1, do contrário, decodifica comentários chineses em UTF-8 sem BOM pela code page ANSI legada; com entrada em LF, uma cauda multibyte pode engolir a quebra de linha seguinte e transformar a próxima instrução em parte do comentário. Callbacks do dispatcher também usam estado explícito de HWND/window/timer no escopo do script, porque delegates de evento em StrictMode não fornecem um limite de closure de variável local confiável.