# CUA sem pop-up de autorização do sistema (arrastar + ímã) — plano de implementação

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIO: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** Fazer com que a primeira autorização do ZCode CUA não abra nenhum pop-up de permissão do sistema macOS, trocando por um onboarding do tipo arrastar-e-soltar: "modal de lista de permissões na janela principal → abrir a página de Ajustes do sistema → janela flutuante ímã faz o usuário arrastar o Helper.app para a lista de permissões".

**Architecture:** Remover do onboarding as chamadas `requestHelper*PermissionViaLaunchServices`, que disparam o native prompt, e migrar para antes do dragstart a verificação final síncrona de assinatura que elas carregavam; restaurar a cadeia de IPC `Prepare/StartCuaHelperPermissionDrag` removida pela auditoria de 2026-08 (`663f58e7e7`) (pré-aquecimento do caminho já verificado + cache de fingerprint, e o dragstart faz apenas uma comparação síncrona de microssegundos antes do `startDrag`); adicionar uma nova janela flutuante Electron sem foco e sempre no topo para hospedar o tile arrastável, com posição comandada pelos bounds da janela de Ajustes do sistema fornecidos por uma CLI Swift persistente. O coordenador de sessão, a cadeia de verificação de assinatura e o mecanismo de reinício do Helper após a autorização são todos mantidos.

**Tech Stack:** Electron 41.0.3 (`webContents.startDrag`), TypeScript, React, Vitest, Swift (`CGWindowListCopyWindowInfo`), electron-builder extraResources

**Spec:** a seção "Base de design" deste documento (brainstorming confirmado na sessão; não houve arquivo de spec separado)

---

## Base de design

### Por que arrastar é obrigatório, e não decoração

A **única função substantiva** do pop-up do sistema é fazer o app aparecer na lista de permissões do TCC. Sem pop-up → a lista de um usuário novo não tem este app → não há como marcar. Arrastar é o único caminho alternativo.

**Validado empiricamente** (2026-08-20, macOS Darwin 25.5.0 nesta máquina): depois de usar `webContents.startDrag({file, icon})` do Electron para arrastar `Calculator.app` (baseline: zero entradas no TCC) para a lista de "Acessibilidade":

```
kTCCServiceAccessibility | com.apple.calculator | auth_value=2 | 17:34:58
```

A entrada foi **criada do nada e já diretamente como granted(2)**, um passo a menos que o pop-up do sistema (que apenas cria a entrada, e o usuário ainda precisa encontrá-la e marcá-la). Após a verificação, foi limpo com `tccutil reset`.

### Fontes de disparo de pop-up (a remover nesta mudança)

| API | Pop-up |
|---|---|
| `AXIsProcessTrustedWithOptions({prompt: true})` | **aparece** — a montante `ax_macos.mm:2967` `PromptTrust` |
| `CGRequestScreenCaptureAccess()` | **aparece** |
| `AXIsProcessTrusted()` / `{prompt: false}` | Não aparece — a montante `FreshAXIsTrusted` |
| `CGPreflightScreenCaptureAccess()` | Não aparece |

Cadeia: `openCuaPermissionOnboarding` → `requestHelper*PermissionViaLaunchServices` (a montante `dist/broker/server/helperLauncher.js:563`) → `/usr/bin/open` sobe o Helper no modo de requisição de permissão único → dentro do processo do Helper as APIs de pop-up acima são atingidas.

### Por que a janela flutuante não pode ser feita dentro do Helper

O Helper é **Node SEA + `LSUIElement=true`** (`NODE_SEA_BLOB` presente, `LSUIElement=true` no Info.plist, verificado); a parte "nativa" é apenas a extensão Node `Resources/ax_native.node`, não é um app AppKit. Comentário original de `ax_macos.mm`: *"does not run a normal NSApplication event loop"*. Exibição de NSPanel e `beginDraggingSession` exigem run loop. Mais crítico é a **dependência circular**: o propósito da UI de autorização é autorizar o Helper; se a UI for hospedada pelo Helper, quando o Helper não sobe o onboarding cai junto — exatamente a forma do incidente `lockf` no macOS ≤14 (`broker_unavailable` → ferramenta não registrada → o onboarding de autorização nunca aparece).

### Por que o ímã precisa de um novo binário

`CGWindowListCopyWindowInfo` obtém os bounds das janelas **sem nenhuma permissão**, mas o Electron não tem binding. Resultado da exclusão de três caminhos: `osascript` + System Events exige permissão de Acessibilidade (beco sem saída, exatamente o que falta agora); `desktopCapturer` só dá o nome da janela, não os bounds; FFI como `koffi` é ele mesmo um native addon e exige electron-rebuild. Por isso, uma CLI Swift persistente. Validado: artefato de 57KB, compilação em 1,5s, sem permissão, obtendo `{"w":723,"x":134,"h":752,"y":157,"owner":"System Settings","layer":0}`.

---

## Restrições globais

- **Plataforma**: todas as novas capacidades são apenas `darwin`; ramos não-darwin devem retornar de forma fail-safe em vez de lançar erro.
- **Invariante central**: o onboarding em nenhum momento **nunca** chama `requestHelperAccessibilityPermissionViaLaunchServices` / `requestHelperScreenRecordingPermissionViaLaunchServices`, e também nunca chama o `promptTrust` do upstream. Esse é o objetivo desta mudança e precisa ser travado por testes.
- **Estado de exibição de permissão**: qualquer verificação de permissão em UI persistente usa `isCuaPermissionTccGranted` (`packages/ui/src/lib/cuaPermissionStatusStore.ts`); é **proibido** usar a verificação com `includeFunctionalProbes` — o `screenCaptureProbeOk`, atualizado apenas por leitura, é sempre `false`, e usá-lo faria todo usuário autorizado aparecer sempre como "aguardando autorização".
- **Restrição síncrona do dragstart**: `event.sender.startDrag()` precisa ser chamado **sincronamente** dentro da cadeia de eventos dragstart, e é **proibido** fazer `await` de qualquer I/O no meio, senão a janela de gesto de arrasto do OS é perdida e o usuário não arrasta arquivo nenhum. install/verify precisam estar previamente concluídos e em cache na etapa de prepare.
- **Portão TOCTOU**: antes de arrastar é obrigatório comparar sincronamente `cuaHelperBundleFingerprintUnchanged` (`ino:ctimeNs:size`, o ctime não pode ser revertido pelo espaço de usuário); se não bater, o arrasto é recusado e o cache é limpo — jamais arrastar para a lista de permissões um bundle que possa ter sido substituído.
- **fail-closed vs fail-open**: tudo relacionado a verificação de assinatura/fingerprint é fail-closed (recusa da operação); falha na obtenção dos bounds da janela é sempre fail-open (cai para centralizado na parte inferior da tela), já que o ímã é um ganho, não um requisito de usabilidade.
- **Efeito após autorização**: ambas as permissões só passam a valer depois de reiniciar o Helper (o SR não vale para processos em execução; accessibility tem cache de nível de processo em `AXIsProcessTrusted`). O mecanismo `restartHelperAfterReturn` é mantido.
- **Idioma seguindo o ZCode**: a janela flutuante de arrasto de permissão não pode ler por conta própria o `localStorage` do navegador nem o idioma do sistema operacional; a cada `show(permission)` o idioma atual da interface do ZCode é lido de `currentApplicationLocale` no processo main e passado ao renderer via IPC de state da janela. O renderer só suporta `zh-CN` / `en-US`, já declarados no `Locale` compartilhado, e atualiza sincronamente os textos explicativos, o tooltip de arrasto, o `document.title` e o `<html lang>`. O state precisa ser enviado antes de `showInactive()`, para evitar que a interface em inglês pisque primeiro um fallback em chinês.
- **git**: `--no-verify` é proibido. O upstream `@zcode/zcode-cua` **não** é modificado nesta mudança; todas as alterações ficam no repositório a jusante.
- **Versão de API macOS**: `CGWindowListCopyWindowInfo` está disponível desde a 10.5, é seguro. Antes de adicionar qualquer comando de sistema é obrigatório verificar a versão mínima suportada (`/usr/bin/lockf` existe desde a 15+ e já deixou todo o macOS ≤14 indisponível).

Cadeia de estado de idioma:

```text
ZCode 设置 / System default
             │
             ▼
main.currentApplicationLocale
             │  lido a cada panel.show(permission)
             ▼
zcode:cua-permission-panel-state { permission, locale, iconDataUrl }
             │
             ▼
renderer da janela flutuante: texto + tooltip + title + html lang
```

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `packages/shared/src/cuaAccessibilitySettings.ts` | novo tipo `PrepareCuaHelperPermissionDragResult` |
| `packages/shared/src/channels.ts` | duas novas constantes de canal IPC + schema |
| `packages/shared/src/platform.ts` | duas novas declarações de método de plataforma |
| `packages/desktop/src/main/cuaAccessibilitySettings.ts` | remove chamadas request*; novo `prepareCuaHelperPermissionDrag` |
| `packages/desktop/src/main/desktopCuaPermissionIpc.ts` | novos handlers de IPC de drag (cache + portão TOCTOU + startDrag síncrono) |
| `packages/desktop/src/main/cuaPermissionDragPanel.ts` | **novo** gerenciamento do ciclo de vida da janela flutuante |
| `packages/desktop/src/main/cuaPermissionPanelPositioner.ts` | **novo** cálculo de posição em função pura (testável isoladamente) |
| `packages/desktop/src/main/cuaSystemSettingsWindowWatcher.ts` | **novo** spawn/parse/fail-open da CLI Swift residente |
| `packages/desktop/native/macos-window-bounds/main.swift` | **novo** CLI que emite os bounds da janela de ajustes do sistema |
| `packages/desktop/scripts/build-macos-window-bounds.mjs` | **novo** script de build swiftc |
| `packages/desktop/electron-builder.config.js` | empacota + assina a nova CLI |
| `packages/desktop/src/renderer/permission-panel/` | **nova** página de conteúdo da janela flutuante (tile arrastável) |
| `packages/ui/src/cua/CuaPermissionChecklistModal.tsx` | **novo** primeiro modal (lista de permissões) |

---

## Task 1: contrato shared — restaurar os dois canais IPC e o tipo de resultado

**Files:**
- Modify: `packages/shared/src/cuaAccessibilitySettings.ts`
- Modify: `packages/shared/src/channels.ts:279` (constantes de canal) e `:818` por perto (schema)
- Modify: `packages/shared/src/platform.ts:643` por perto
- Test: `packages/shared/test/channels.test.ts`

**Interfaces:**
- Produces: `PlatformChannels.PrepareCuaHelperPermissionDrag = "zcode: prepare-cua-helper-permission-drag"`,`PlatformChannels.StartCuaHelperPermissionDrag = "zcode: start-cua-helper-permission-drag"`; tipo `PrepareCuaHelperPermissionDragResult { success: boolean; error?: string; helperAppPath?: string; helperDisplayName?: string; helperBundleId?: string }`(**Atenção**: `helperBundleFingerprint` deliberadamente não entra no shared —— ele só pode ser consumido na memória do processo main e não deve ser exposto ao renderer via IPC); platform método `prepareCuaHelperPermissionDrag?(): Promise<PrepareCuaHelperPermissionDragResult>`,`startCuaHelperPermissionDrag?(): void`

- [ ] **Step 1: escrever teste que falha**

Adicionar em `packages/shared/test/channels.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PlatformChannels } from "../src/channels.js";

describe("CUA helper permission drag channels", () => {
  it("声明 prepare 与 start 两个通道", () => {
    expect(PlatformChannels.PrepareCuaHelperPermissionDrag).toBe(
      "zcode:prepare-cua-helper-permission-drag",
    );
    expect(PlatformChannels.StartCuaHelperPermissionDrag).toBe(
      "zcode:start-cua-helper-permission-drag",
    );
  });
});
```

- [ ] **Step 2: executar o teste e confirmar a falha**

Run: `pnpm --filter @zcode/shared test -- channels`
Expected: FAIL — `PrepareCuaHelperPermissionDrag` é `undefined`

- [ ] **Step 3: implementação**

Adicionar em `packages/shared/src/cuaAccessibilitySettings.ts` (**não** adicionar campos a `CuaAccessibilitySettingsResult`, para não poluir o formato do resultado de onboarding):

```ts
/**
 * 拖拽预热结果。helperBundleFingerprint 故意不在此声明：它是 main 进程内存缓存的同步 TOCTOU
 * 证据，跨 IPC 暴露给 renderer 既无用又扩大攻击面。
 */
export interface PrepareCuaHelperPermissionDragResult {
  success: boolean;
  error?: string;
  helperAppPath?: string;
  helperDisplayName?: string;
  helperBundleId?: string;
}
```

Adicionar em `packages/shared/src/channels.ts`, ao lado da constante `OpenCuaPermissionOnboarding`:

```ts
  PrepareCuaHelperPermissionDrag: "zcode:prepare-cua-helper-permission-drag",
  StartCuaHelperPermissionDrag: "zcode:start-cua-helper-permission-drag",
```

Adicionar na seção de schema do mesmo arquivo (ao lado de `[PlatformChannels.OpenCuaPermissionOnboarding]`) e incluir o novo tipo no import do topo:

```ts
  [PlatformChannels.PrepareCuaHelperPermissionDrag]: {
    request: undefined;
    response: PrepareCuaHelperPermissionDragResult;
  };
  [PlatformChannels.StartCuaHelperPermissionDrag]: {
    request: undefined;
    response: void;
  };
```

Adicionar em `packages/shared/src/platform.ts`, ao lado da declaração `openCuaPermissionOnboarding`:

```ts
  /**
   * 预热并缓存已验证的 Helper 路径 + 指纹，使随后的 dragstart 能同步 startDrag。
   * 必须在浮窗挂载时调用；dragstart 期间不允许任何异步 I/O。Desktop only。
   */
  prepareCuaHelperPermissionDrag?(): Promise<PrepareCuaHelperPermissionDragResult>;
  /** 从权限浮窗拖拽 Helper.app 到 macOS 权限列表。Desktop only。 */
  startCuaHelperPermissionDrag?(): void;
```

Exportar `PrepareCuaHelperPermissionDragResult` em `packages/shared/src/index.ts`.

- [ ] **Step 4: executar o teste e confirmar a passagem**

Run: `pnpm --filter @zcode/shared test -- channels`
Expected: PASS

Run: `pnpm typecheck`
Expected: sem erros (o mapeamento de schema de `channels.ts` é um tipo exaustivo; um import faltante falha imediatamente)

- [ ] **Step 5: commit**

```bash
git add packages/shared/src packages/shared/test
git commit -m "feat(cua): restore helper permission drag IPC contract"
```

---

## Task 2: remover os pop-ups nativos de permissão (mudança central)

**Files:**
- Modify: `packages/desktop/src/main/cuaAccessibilitySettings.ts` (loop de stages dentro de `runSession`)
- Test: `packages/desktop/test/cuaAccessibilitySettings.test.ts`

**Interfaces:**
- Consumes: nada (esta tarefa apenas remove chamadas)
- Produces: `OpenCuaAccessibilitySettingsOptions` deixa de ter os dois pontos de injeção `requestHelperAccessibilityPermission` / `requestHelperScreenRecordingPermission`; `HelperPermissionRequestContext` deixa de ser construído neste arquivo. O `launchFingerprint` retornado por `verifyHelperPermissionIdentityUnchanged` passa a ser consumido pelo cache do Task 4.

- [ ] **Step 1: escrever teste que falha — travar o invariante central**

Adicionar em `packages/desktop/test/cuaAccessibilitySettings.test.ts`:

```ts
it("绝不触发 native 权限请求（不弹系统弹窗）", async () => {
  const requestCalls: string[] = [];
  const openedUrls: string[] = [];
  const result = await openCuaPermissionOnboarding({
    platform: "darwin",
    requiredPermissions: ["screen_recording", "accessibility"],
    ensureHelperInstalled: async () => "/tmp/helper/ZCode Computer Use.app",
    verifyHelperInstalled: async () => {},
    resolveHelperIdentity: async (appPath) => ({
      appPath,
      executablePath: `${appPath}/Contents/MacOS/ZCode Computer Use`,
      displayName: "ZCode Computer Use",
      bundleId: "dev.zcode.cua-helper",
    }),
    // 这两个注入点在改造后不应存在；若实现回退到调用它们，本测试立刻失败
    requestHelperAccessibilityPermission: async () => {
      requestCalls.push("accessibility");
    },
    requestHelperScreenRecordingPermission: async () => {
      requestCalls.push("screen_recording");
    },
    openSettingsUrl: async (url) => {
      openedUrls.push(url);
    },
    openSettingsAndWaitForReturn: async ({ openSettings }) => {
      await openSettings();
    },
  } as never);

  expect(requestCalls).toEqual([]);
  expect(openedUrls).toEqual([
    "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
  ]);
  expect(result.success).toBe(true);
});
```

- [ ] **Step 2: executar o teste e confirmar a falha**

Run: `pnpm --filter @zcode/desktop exec vitest run test/cuaAccessibilitySettings.test.ts -t "绝不触发"`
Expected: FAIL — `requestCalls` é `["screen_recording", "accessibility"]`

- [ ] **Step 3: implementação — remover as chamadas de request e manter a verificação de assinatura**

No loop de stages de `runSession` em `cuaAccessibilitySettings.ts`, apagar todo o trecho de `const requestContext: HelperPermissionRequestContext = {` até `await request(session.identity.appPath, requestContext);`, bem como o `if (controller.signal.aborted) throw controller.signal.reason;` imediatamente seguinte (isto é, apagar também a linha `const request = permission === "accessibility" ? ... : ...;`).

A chamada `verifyHelperPermissionIdentityUnchanged(session.identity, options, "launch")` **deve ser mantida**, mas seu valor de retorno passa a ser registrado na sessão, para reutilização pelo cache de drag do Task 4. Adicionar um campo à interface `ActiveOnboardingSession`:

```ts
  /** 每 stage 重新建立的验签指纹证据；拖拽缓存据此判断"自验签以来字节未变"。 */
  launchFingerprint?: CuaHelperBundleFingerprint;
```

E trocar o `const launchFingerprint = await verifyHelperPermissionIdentityUnchanged(...)` original por:

```ts
        // 保留每 stage 重新验签：用户停留设置页期间同 UID 进程可能替换安装目录。
        // 原先这份指纹交给 requestHelper*ViaLaunchServices 在 open(2) 前同步终检；
        // 改造后 native 请求已删除，终检下沉到 dragstart（见 desktopCuaPermissionIpc）。
        session.launchFingerprint = await verifyHelperPermissionIdentityUnchanged(
          session.identity,
          options,
          "launch",
        );
```

Remover da interface `OpenCuaAccessibilitySettingsOptions` os dois pontos de injeção opcionais `requestHelperAccessibilityPermission` e `requestHelperScreenRecordingPermission`, e remover do topo do arquivo os imports de `requestHelperAccessibilityPermissionViaLaunchServices`, `requestHelperScreenRecordingPermissionViaLaunchServices` e `HelperPermissionRequestContext`. Remover também o `DEFAULT_PERMISSION_REQUEST_TIMEOUT_MS` e a opção `permissionRequestTimeoutMs`, já sem referências.

Acrescentar uma linha de comentário no topo do arquivo explicando a mudança:

```ts
// 2026-08-20：授权引导不再触发任何 native 权限弹窗（AXIsProcessTrustedWithOptions{prompt:true} /
// CGRequestScreenCaptureAccess）。Helper 进入 TCC 列表改由用户从浮窗拖拽 .app 完成，
// 每 stage 的验签指纹交由 dragstart 前的同步比对消费。
```

- [ ] **Step 4: executar o teste e confirmar a passagem**

Run: `pnpm --filter @zcode/desktop exec vitest run test/cuaAccessibilitySettings.test.ts`
Expected: PASS.**Atenção**: as asserções originais de que request* é chamado vão falhar; altere uma a uma para asseverar a não chamada; os casos que asseveram a ordem de `openSettingsUrl`, a coordenação de sessão e o direito de recovery devem continuar passando.

- [ ] **Step 5: commit**

```bash
git add packages/desktop/src/main/cuaAccessibilitySettings.ts packages/desktop/test/cuaAccessibilitySettings.test.ts
git commit -m "feat(cua): stop triggering native permission prompts in onboarding"
```

---

## Task 3: restaurar `prepareCuaHelperPermissionDrag`

**Files:**
- Modify: `packages/desktop/src/main/cuaAccessibilitySettings.ts`
- Test: `packages/desktop/test/cuaAccessibilitySettings.test.ts`

**Interfaces:**
- Consumes: `PrepareCuaHelperPermissionDragResult` do Task 1
- Produces: `prepareCuaHelperPermissionDrag(options?: PrepareCuaHelperPermissionDragOptions): Promise<PrepareCuaHelperPermissionDragResult & { helperBundleFingerprint?: CuaHelperBundleFingerprint }>`;`PrepareCuaHelperPermissionDragOptions { env?; platform?; logger?; ensureHelperInstalled?; bundledHelperAppPath?; verifyHelperInstalled?; resolveHelperIdentity? }`

- [ ] **Step 1: escrever teste que falha**

```ts
it("验签期间 bundle 被改则拒绝预热", async () => {
  let verifyCount = 0;
  const result = await prepareCuaHelperPermissionDrag({
    platform: "darwin",
    ensureHelperInstalled: async () => helperFixturePath,
    verifyHelperInstalled: async () => {
      verifyCount += 1;
      // 在验签过程中改动 bundle 字节，指纹必须失配
      writeFileSync(join(helperFixturePath, "Contents", "Info.plist"), `<plist/>${verifyCount}`);
    },
    resolveHelperIdentity: async (appPath) => ({
      appPath,
      executablePath: `${appPath}/Contents/MacOS/x`,
      displayName: "ZCode Computer Use",
      bundleId: "dev.zcode.cua-helper",
    }),
  });
  expect(result.success).toBe(false);
  expect(result.error).toMatch(/changed while its drag signature was being verified/);
});

it("预热成功返回路径与身份，但不泄漏指纹给 renderer 形状", async () => {
  const result = await prepareCuaHelperPermissionDrag({
    platform: "darwin",
    ensureHelperInstalled: async () => helperFixturePath,
    verifyHelperInstalled: async () => {},
    resolveHelperIdentity: async (appPath) => ({
      appPath,
      executablePath: `${appPath}/Contents/MacOS/x`,
      displayName: "ZCode Computer Use",
      bundleId: "dev.zcode.cua-helper",
    }),
  });
  expect(result.success).toBe(true);
  expect(result.helperAppPath).toBe(helperFixturePath);
  expect(result.helperDisplayName).toBe("ZCode Computer Use");
  expect(result.helperBundleFingerprint).toBeTruthy();
});
```

Criar `helperFixturePath` com `mkdtempSync`, um bundle falso contendo `Contents/MacOS/x`,`Contents/Info.plist`,`Contents/_CodeSignature/CodeResources`,`Contents/Resources/` ; limpar em `afterEach`.

- [ ] **Step 2: executar o teste e confirmar a falha**

Run: `pnpm --filter @zcode/desktop exec vitest run test/cuaAccessibilitySettings.test.ts -t "预热"`
Expected: FAIL — `prepareCuaHelperPermissionDrag is not a function`

- [ ] **Step 3: implementação**

Adicionar em `cuaAccessibilitySettings.ts` (a ordem é crucial: **capturar primeiro o snapshot da impressão digital, depois verify, e reconferir uma vez após a verificação de assinatura e uma vez após a leitura da identidade**; a implementação antiga só capturava a impressão após ensure/verify retornarem, o que permitia ao atacante substituir o .app entre os dois e fazer com que bytes maliciosos se tornassem a "impressão verificada"):

```ts
export interface PrepareCuaHelperPermissionDragOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  logger?: OpenCuaAccessibilitySettingsOptions["logger"];
  ensureHelperInstalled?: () => Promise<string>;
  bundledHelperAppPath?: string;
  verifyHelperInstalled?: (appPath: string) => Promise<void>;
  resolveHelperIdentity?: (appPath: string) => Promise<HelperPermissionSubjectIdentity>;
}

export interface PrepareCuaHelperPermissionDragMainResult
  extends PrepareCuaHelperPermissionDragResult {
  /** 只允许 main 内存缓存消费，绝不跨 IPC 返回 renderer。 */
  helperBundleFingerprint?: CuaHelperBundleFingerprint;
}

// 拖拽授权与 onboarding 最终引向同一个 TCC 授权主体，安全校验必须一致：磁盘上被旧版 / 坏签名 /
// 错误 Team / 同用户可写内容替换的 .app 若被拖进权限列表，TCC 授权会落到错误主体，绕过整个
// Team-pin 设计。所以拖拽前必须走同一条 install+verify。但 Electron 原生拖拽要求 dragstart 里
// *同步* 调用 startDrag，等不了这些异步 I/O —— 故拆到本函数预热，dragstart 只读缓存。
export async function prepareCuaHelperPermissionDrag(
  options: PrepareCuaHelperPermissionDragOptions = {},
): Promise<PrepareCuaHelperPermissionDragMainResult> {
  const platform = options.platform ?? process.platform;
  if (platform !== "darwin") {
    return { success: false, error: "ZCode Computer Use permissions are only available on macOS." };
  }
  const env = options.env ?? process.env;
  const defaultInstaller = options.ensureHelperInstalled
    ? null
    : createDesktopCuaHelperInstaller({
        logger: toInstallerLogger(options.logger),
        env,
        bundledHelperAppPath: options.bundledHelperAppPath,
        platform,
      });
  try {
    const helperAppPath = await (
      options.ensureHelperInstalled ?? defaultInstaller!.ensureInstalled
    )();
    const verifiedFingerprint = captureCuaHelperBundleFingerprint(helperAppPath);
    await (options.verifyHelperInstalled ?? defaultInstaller?.verifyInstalled)?.(helperAppPath);
    if (!cuaHelperBundleFingerprintUnchanged(helperAppPath, verifiedFingerprint)) {
      throw new Error("ZCode Computer Use changed while its drag signature was being verified");
    }
    const identity = await (
      options.resolveHelperIdentity ?? resolveHelperPermissionSubjectIdentity
    )(helperAppPath);
    if (!cuaHelperBundleFingerprintUnchanged(helperAppPath, verifiedFingerprint)) {
      throw new Error("ZCode Computer Use changed while its drag identity was being resolved");
    }
    return {
      success: true,
      helperAppPath,
      helperDisplayName: identity.displayName,
      helperBundleId: identity.bundleId,
      helperBundleFingerprint: verifiedFingerprint,
    };
  } catch (error) {
    const message = messageOf(error);
    options.logger?.warn(
      "[cua-permission-onboarding] helper install/verify failed; refusing to prepare drag of an unverified Helper",
      message,
    );
    return { success: false, error: message };
  }
}
```

Remover também o comentário de auditoria obsoleto no fim do arquivo (o comentário `// 2026-08 审计：openCuaAccessibilitySettings / prepareCuaHelperPermissionDrag 已删除…`), e substituí-lo por um registro do motivo desta restauração.

- [ ] **Step 4: executar o teste e confirmar a passagem**

Run: `pnpm --filter @zcode/desktop exec vitest run test/cuaAccessibilitySettings.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/desktop/src/main/cuaAccessibilitySettings.ts packages/desktop/test/cuaAccessibilitySettings.test.ts
git commit -m "feat(cua): restore verified helper drag preparation"
```

---

## Task 4: restaurar os handlers de IPC de drag e a ponte do renderer

**Files:**
- Modify: `packages/desktop/src/main/desktopCuaPermissionIpc.ts`
- Modify: `packages/desktop/src/preload/index.ts:616` por perto
- Modify: `packages/desktop/src/renderer/src/desktopPlatform.ts:48` por perto
- Modify: `packages/client/src/globals.d.ts:220` por perto
- Test: `packages/desktop/test/desktopCuaPermissionIpc.test.ts`

**Interfaces:**
- Consumes: as constantes de canal do Task 1 e `prepareCuaHelperPermissionDrag` do Task 3
- Produces: dois handlers de IPC; no renderer,  `platform.prepareCuaHelperPermissionDrag()` / `platform.startCuaHelperPermissionDrag()`

- [ ] **Step 1: escrever teste que falha**

```ts
it("指纹在 prepare 之后被篡改时拒绝拖拽", async () => {
  const startDragCalls: unknown[] = [];
  const sender = { startDrag: (item: unknown) => startDragCalls.push(item) };
  registerCuaPermissionIpc({ ipcMain: fakeIpcMain, logger, /* … */ });

  await fakeIpcMain.invoke(PlatformChannels.PrepareCuaHelperPermissionDrag);
  // 篡改 bundle：dragstart 的同步指纹比对必须拦住
  writeFileSync(join(helperFixturePath, "Contents", "Info.plist"), "<plist>tampered</plist>");
  fakeIpcMain.emit(PlatformChannels.StartCuaHelperPermissionDrag, { sender });

  expect(startDragCalls).toEqual([]);
  expect(logger.warn).toHaveBeenCalledWith(
    expect.stringContaining("refusing to drag a possibly-tampered bundle"),
  );
});

it("预热后未被篡改则同步发起拖拽", async () => {
  const startDragCalls: Array<{ file: string }> = [];
  const sender = { startDrag: (item: { file: string }) => startDragCalls.push(item) };
  registerCuaPermissionIpc({ ipcMain: fakeIpcMain, logger, /* … */ });

  await fakeIpcMain.invoke(PlatformChannels.PrepareCuaHelperPermissionDrag);
  fakeIpcMain.emit(PlatformChannels.StartCuaHelperPermissionDrag, { sender });

  expect(startDragCalls).toHaveLength(1);
  expect(startDragCalls[0]!.file).toBe(helperFixturePath);
});
```

- [ ] **Step 2: executar o teste e confirmar a falha**

Run: `pnpm --filter @zcode/desktop exec vitest run test/desktopCuaPermissionIpc.test.ts -t "拖拽"`
Expected: FAIL — o canal não tem handler

- [ ] **Step 3: implementação**

Adicionar aos imports do topo de `desktopCuaPermissionIpc.ts` `nativeImage` (de `electron`), `cuaHelperBundleFingerprintUnchanged` e `prepareCuaHelperPermissionDrag` (de `./cuaAccessibilitySettings.js`), e incluir a constante e o cache:

```ts
// 1x1 透明 PNG。startDrag 在 macOS 上要求 icon 非空（electron.d.ts: "The image must be
// non-empty on macOS"），拿不到系统图标时用它兜底，避免 startDrag 抛异常导致完全拖不动。
const CUA_HELPER_DRAG_ICON_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";
```

Adicionar o cache e o refresh dentro do escopo de `registerCuaPermissionIpc`:

```ts
  // 原生文件拖拽必须在 dragstart 链路里*同步*调用 startDrag，不能等 install/verify 这类异步 I/O
  // （否则错过 OS 拖拽手势窗口，用户拖不出任何文件）。故浮窗挂载时预热并缓存已验证路径 + 指纹。
  let verifiedHelperAppPath: string | null = null;
  let verifiedHelperFingerprint: string | null = null;

  function cacheVerifiedHelper(helperAppPath: string, verifiedFingerprint: string): void {
    verifiedHelperAppPath = helperAppPath;
    verifiedHelperFingerprint = verifiedFingerprint;
  }

  function clearVerifiedHelper(): void {
    verifiedHelperAppPath = null;
    verifiedHelperFingerprint = null;
  }

  async function refreshVerifiedHelperAppPath(): Promise<void> {
    const result = await prepareCuaHelperPermissionDrag({ logger: options.logger });
    if (result.success && result.helperAppPath && result.helperBundleFingerprint) {
      cacheVerifiedHelper(result.helperAppPath, result.helperBundleFingerprint);
    } else {
      clearVerifiedHelper();
      options.logger.warn("[cua-permission-onboarding] prepare helper drag failed", result.error);
    }
  }

  ipcMain.handle(PlatformChannels.PrepareCuaHelperPermissionDrag, async () => {
    const result = await prepareCuaHelperPermissionDrag({ logger: options.logger });
    if (result.success && result.helperAppPath && result.helperBundleFingerprint) {
      cacheVerifiedHelper(result.helperAppPath, result.helperBundleFingerprint);
    } else {
      clearVerifiedHelper();
      options.logger.warn("[cua-permission-onboarding] prepare helper drag failed", result.error);
    }
    // 指纹绝不跨 IPC 返回 renderer
    return {
      success: result.success,
      ...(result.error !== undefined ? { error: result.error } : {}),
      ...(result.helperAppPath !== undefined ? { helperAppPath: result.helperAppPath } : {}),
      ...(result.helperDisplayName !== undefined
        ? { helperDisplayName: result.helperDisplayName }
        : {}),
      ...(result.helperBundleId !== undefined ? { helperBundleId: result.helperBundleId } : {}),
    };
  });

  ipcMain.on(PlatformChannels.StartCuaHelperPermissionDrag, (event) => {
    const helperAppPath = verifiedHelperAppPath;
    const fingerprint = verifiedHelperFingerprint;
    if (!helperAppPath || !fingerprint) {
      // 尚未预热：这里绝不能做异步 install/verify（会错过拖拽手势）。后台补一次让下次可用。
      options.logger.warn(
        "[cua-permission-onboarding] helper drag not prepared yet; verifying in background for next drag",
      );
      void refreshVerifiedHelperAppPath();
      return;
    }
    // TOCTOU 门：prepare(验签) 到此刻之间，同 UID 攻击者可能覆写 Helper.app，而 TCC 绑定的是被拖入的
    // bundle 身份。同步比对字节指纹（微秒级，不会错过手势）；不符即拒拖 + 清缓存重新 prepare。
    if (!cuaHelperBundleFingerprintUnchanged(helperAppPath, fingerprint)) {
      options.logger.warn(
        "[cua-permission-onboarding] cached helper changed since verification; refusing to drag a possibly-tampered bundle",
      );
      clearVerifiedHelper();
      void refreshVerifiedHelperAppPath();
      return;
    }
    const namedIcon = nativeImage.createFromNamedImage("NSApplicationIcon");
    const icon = namedIcon.isEmpty()
      ? nativeImage.createFromDataURL(CUA_HELPER_DRAG_ICON_DATA_URL)
      : namedIcon;
    try {
      event.sender.startDrag({ file: helperAppPath, icon });
    } catch (error) {
      options.logger.warn(
        "[cua-permission-onboarding] helper drag failed",
        error instanceof Error ? error.message : String(error),
      );
    }
    void refreshVerifiedHelperAppPath();
  });
```

Inserir antes do `return result;` no handler `OpenCuaPermissionOnboarding` existente (o onboarding inclui a longa espera do usuário na página de ajustes, então a evidência antiga de verificação do início do stage não pode ser tratada como "impressão verificada"; após o sucesso, iniciar um novo prepare):

```ts
    if (result.success) void refreshVerifiedHelperAppPath();
```

Adicionar em `preload/index.ts`:

```ts
  prepareCuaHelperPermissionDrag: () =>
    ipcRenderer.invoke(PlatformChannels.PrepareCuaHelperPermissionDrag),
  startCuaHelperPermissionDrag: () =>
    ipcRenderer.send(PlatformChannels.StartCuaHelperPermissionDrag),
```

Adicionar em `renderer/src/desktopPlatform.ts`:

```ts
    prepareCuaHelperPermissionDrag: window.zcode.prepareCuaHelperPermissionDrag
      ? () =>
          window.zcode.prepareCuaHelperPermissionDrag?.() ??
          Promise.resolve({ success: false, error: "not_supported" })
      : undefined,
    startCuaHelperPermissionDrag: window.zcode.startCuaHelperPermissionDrag
      ? () => window.zcode.startCuaHelperPermissionDrag?.()
      : undefined,
```

Adicionar em `packages/client/src/globals.d.ts` as duas declarações opcionais correspondentes (mesmo formato do preload).

- [ ] **Step 4: executar o teste e confirmar a passagem**

Run: `pnpm --filter @zcode/desktop exec vitest run test/desktopCuaPermissionIpc.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/desktop/src packages/client/src/globals.d.ts packages/desktop/test
git commit -m "feat(cua): restore helper permission drag IPC handlers"
```

---

## Task 5: CLI de bounds da janela de ajustes do sistema (fonte dos dados de encaixe)

**Files:**
- Create: `packages/desktop/native/macos-window-bounds/main.swift`
- Create: `packages/desktop/scripts/build-macos-window-bounds.mjs`
- Create: `packages/desktop/src/main/cuaSystemSettingsWindowWatcher.ts`
- Modify: `packages/desktop/electron-builder.config.js`
- Modify: `packages/desktop/package.json` (encadeia o script de build na chain de prepare)
- Test: `packages/desktop/test/cuaSystemSettingsWindowWatcher.test.ts`

**Interfaces:**
- Produces: `createSystemSettingsWindowWatcher(options): { start(): void; stop(): void; latest(): SettingsWindowBounds | null }`, onde `SettingsWindowBounds = { x: number; y: number; width: number; height: number }`

- [ ] **Step 1: escrever teste que falha**

```ts
it("解析 CLI 输出的 JSON 行并暴露最新 bounds", () => {
  const watcher = createSystemSettingsWindowWatcher({
    spawnProcess: () => fakeChild,
    logger,
  });
  watcher.start();
  fakeChild.stdout.emit("data", '[{"x":134,"y":157,"w":723,"h":752,"layer":0}]\n');
  expect(watcher.latest()).toEqual({ x: 134, y: 157, width: 723, height: 752 });
});

it("CLI 崩溃或输出损坏时 fail-open 返回 null，不抛错", () => {
  const watcher = createSystemSettingsWindowWatcher({
    spawnProcess: () => fakeChild,
    logger,
  });
  watcher.start();
  fakeChild.stdout.emit("data", "not-json\n");
  expect(watcher.latest()).toBeNull();
  fakeChild.emit("exit", 1);
  expect(() => watcher.latest()).not.toThrow();
  expect(watcher.latest()).toBeNull();
});

it("忽略非 layer-0 窗口（面板/浮层不是主窗口）", () => {
  const watcher = createSystemSettingsWindowWatcher({ spawnProcess: () => fakeChild, logger });
  watcher.start();
  fakeChild.stdout.emit("data", '[{"x":0,"y":0,"w":100,"h":40,"layer":25}]\n');
  expect(watcher.latest()).toBeNull();
});
```

- [ ] **Step 2: executar o teste e confirmar a falha**

Run: `pnpm --filter @zcode/desktop exec vitest run test/cuaSystemSettingsWindowWatcher.test.ts`
Expected: FAIL — o módulo não existe

- [ ] **Step 3: implementação**

`native/macos-window-bounds/main.swift`(**não precisa de nenhuma permissão TCC**; somente obter a *imagem* da janela exige Screen Recording):

```swift
import CoreGraphics
import Foundation

// 输出 System Settings 主窗口几何。CGWindowListCopyWindowInfo 自 macOS 10.5 起可用，
// 且取 bounds 不需要 Accessibility / Screen Recording —— 这一点是本方案成立的前提：
// 授权引导运行时恰恰还没有这两个权限。
let intervalMs = UInt32(CommandLine.arguments.dropFirst().first.flatMap { UInt32($0) } ?? 150)
let owners = ["System Settings", "System Preferences", "系统设置", "系統設定"]
setvbuf(stdout, nil, _IOLBF, 0)  // 行缓冲：父进程要逐行读

while true {
    var out: [[String: Any]] = []
    if let list = CGWindowListCopyWindowInfo(
        [.optionOnScreenOnly, .excludeDesktopElements], kCGNullWindowID
    ) as? [[String: Any]] {
        for w in list {
            guard let owner = w[kCGWindowOwnerName as String] as? String,
                  owners.contains(where: { owner.contains($0) }),
                  let dict = w[kCGWindowBounds as String] as? [String: Any],
                  let rect = CGRect(dictionaryRepresentation: dict as CFDictionary)
            else { continue }
            out.append([
                "x": rect.origin.x, "y": rect.origin.y,
                "w": rect.size.width, "h": rect.size.height,
                "layer": w[kCGWindowLayer as String] as? Int ?? -1,
            ])
        }
    }
    if let data = try? JSONSerialization.data(withJSONObject: out),
       let line = String(data: data, encoding: .utf8) {
        print(line)
    }
    usleep(intervalMs * 1000)
}
```

`scripts/build-macos-window-bounds.mjs`: pular direto em não-darwin; `swiftc -O native/macos-window-bounds/main.swift -o resources/macos-window-bounds/zcode-window-bounds`; adicionar o diretório de artefato ao `.gitignore` (`ci-repo-hygiene.mjs` recusa versionar artefatos de build).

`src/main/cuaSystemSettingsWindowWatcher.ts`: fazer `spawn` de uma única CLI (**não iniciar um processo por frame**), parsear o stdout linha a linha e pegar a primeira janela com `layer === 0`; `exit`/`error`/falha de parse zeram `latest()` e **não lançam erro**; `stop()` precisa matar o processo filho. Todos os timers usam `unref()`, mas observe que o próprio vitest mantém o event loop vivo durante a validação, então é preciso uma sonda de subprocesso em tsx para provar que ele realmente não impede a saída.

`electron-builder.config.js`: seguindo o padrão de `shouldPackageWindowsBrowserImportHelper`, no target darwin adicionar `resources/macos-window-bounds/` ao `extraResources`; no lado macOS não há passo extra de assinatura (é coberto pela varredura de assinatura do app), mas é preciso registrar esse caminho como recurso nativo permitido em `assertPackagedNativeResourcePolicy`.

- [ ] **Step 4: executar o teste e confirmar a passagem**

Run: `pnpm --filter @zcode/desktop exec vitest run test/cuaSystemSettingsWindowWatcher.test.ts`
Expected: PASS

Run: `node packages/desktop/scripts/build-macos-window-bounds.mjs && ./packages/desktop/resources/macos-window-bounds/zcode-window-bounds 150 | head -2`
Expected: com os ajustes do sistema abertos, ver uma linha no formato `[{"x":134,"y":157,"w":723,"h":752,"layer":0}]`

- [ ] **Step 5: commit**

```bash
git add packages/desktop/native packages/desktop/scripts packages/desktop/src/main/cuaSystemSettingsWindowWatcher.ts \
        packages/desktop/electron-builder.config.js packages/desktop/package.json packages/desktop/test .gitignore
git commit -m "feat(cua): add macOS system settings window bounds watcher"
```

---

## Task 6: janela flutuante de arrasto

**Files:**
- Create: `packages/desktop/src/main/cuaPermissionPanelPositioner.ts`
- Create: `packages/desktop/src/main/cuaPermissionDragPanel.ts`
- Create: `packages/desktop/src/renderer/permission-panel/index.html`
- Test: `packages/desktop/test/cuaPermissionPanelPositioner.test.ts`,`packages/desktop/test/cuaPermissionDragPanel.test.ts`

**Interfaces:**
- Consumes: `createSystemSettingsWindowWatcher` do Task 5 e os canais do Task 1
- Produces: `resolvePanelBounds({ settings, display, panel }): Rect`;`createCuaPermissionDragPanel(options): { show(permission: CuaPermissionKind): void; hide(): void; destroy(): void }`

- [ ] **Step 1: escrever teste que falha**

```ts
// positioner：纯函数，覆盖吸附与 fail-open
// 全部输出必须是整数（Electron setBounds 要求），统一用 Math.round。
// 本例特意选不触发下缘夹回的 settings：吸附 y = 157+600-6 = 751，
// 751+124 = 875 ≤ 可视区下缘 33+949 = 982，故能纯粹验证吸附公式本身。
it("有 settings bounds 时吸附到其底部居中", () => {
  expect(
    resolvePanelBounds({
      settings: { x: 134, y: 157, width: 720, height: 600 },
      display: { x: 0, y: 33, width: 1512, height: 949 },
      panel: { width: 560, height: 124 },
    }),
  ).toEqual({ x: 214, y: 751, width: 560, height: 124 });
});

it("无 settings bounds 时退回屏幕底部居中（fail-open）", () => {
  expect(
    resolvePanelBounds({
      settings: null,
      display: { x: 0, y: 33, width: 1512, height: 949 },
      panel: { width: 560, height: 124 },
    }),
  ).toEqual({ x: 476, y: 830, width: 560, height: 124 });
});

it("吸附位置超出屏幕下缘时夹回可视区内", () => {
  const bounds = resolvePanelBounds({
    settings: { x: 0, y: 800, width: 700, height: 400 },
    display: { x: 0, y: 33, width: 1512, height: 949 },
    panel: { width: 560, height: 124 },
  });
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(33 + 949);
});
```

```ts
// 浮窗：所有终态都必须销毁，避免像 PiP 那样凭空常驻
it.each(["success", "canceled", "timeout", "origin-destroyed"])(
  "%s 终态必须销毁浮窗",
  (terminal) => {
    const panel = createCuaPermissionDragPanel({ createWindow: () => fakeWindow, watcher, logger });
    panel.show("accessibility");
    panel.destroy();
    expect(fakeWindow.destroy).toHaveBeenCalledTimes(1);
    expect(watcher.stop).toHaveBeenCalledTimes(1);
  },
);
```

- [ ] **Step 2: executar o teste e confirmar a falha**

Run: `pnpm --filter @zcode/desktop exec vitest run test/cuaPermissionPanelPositioner.test.ts test/cuaPermissionDragPanel.test.ts`
Expected: FAIL — o módulo não existe

- [ ] **Step 3: implementação**

`cuaPermissionPanelPositioner.ts`: função pura, sem dependência de Electron (facilita teste unitário). Com `settings`, x é `settings.x + (settings.width - panel.width)/2` e y é `settings.y + settings.height - 6` (leve sobreposição com a borda inferior da janela de ajustes, o que dá a sensação de encaixe); sem ele, x é centralizado no display e y é `display.y + display.height - panel.height - 28`; por fim, limitar tudo à área visível do display.

`cuaPermissionDragPanel.ts`: implementar literalmente a combinação de propriedades já validada no spike:

```ts
const win = new BrowserWindow({
  width, height,
  frame: false,
  transparent: true,
  hasShadow: true,
  resizable: false,
  focusable: false,   // 关键：一点就把 System Settings 踢到后台就毁了整个流程
  skipTaskbar: true,
  show: false,
  webPreferences: { preload, contextIsolation: true },
});
win.once("ready-to-show", () => {
  win.showInactive();                                    // 显示但不激活
  win.setAlwaysOnTop(true, "screen-saver");              // 需压过 System Settings
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
});
```

A posição é dirigida pelo `latest()` do watcher, com throttle de ~150ms, chamando `setBounds` apenas quando o retângulo de destino muda (para não disparar movimento de janela a cada tick). `destroy()` também precisa chamar `watcher.stop()` e deve ser idempotente para uma janela já destruída.

`renderer/permission-panel/index.html`: um tile arrastável + o texto ("把 ZCode Computer Use 拖到上面的列表"). No `dragstart`, após `event.preventDefault()`, chamar `platform.startCuaHelperPermissionDrag()`; na montagem, chamar primeiro `prepareCuaHelperPermissionDrag()` para pré-aquecer.

- [ ] **Step 4: executar o teste e confirmar a passagem**

Run: `pnpm --filter @zcode/desktop exec vitest run test/cuaPermissionPanelPositioner.test.ts test/cuaPermissionDragPanel.test.ts`
Expected: PASS

- [ ] **Step 5: commit**

```bash
git add packages/desktop/src/main/cuaPermissionPanelPositioner.ts \
        packages/desktop/src/main/cuaPermissionDragPanel.ts \
        packages/desktop/src/renderer/permission-panel packages/desktop/test
git commit -m "feat(cua): add draggable permission panel anchored to system settings"
```

---

## Task 7: primeiro modal (lista de permissões) e a integração

**Files:**
- Create: `packages/ui/src/cua/CuaPermissionChecklistModal.tsx`
- Modify: `packages/ui/src/settings/ComputerUseSection.tsx:330-400`
- Modify: `packages/ui/src/cua/CuaPermissionGateController.tsx`
- Modify: `packages/desktop/src/main/desktopCuaPermissionIpc.ts` (show/hide da janela flutuante durante o onboarding)
- Test: `packages/ui/test/cuaPermissionChecklistModal.test.tsx`

**Interfaces:**
- Consumes: `isCuaPermissionTccGranted`(`packages/ui/src/lib/cuaPermissionStatusStore.ts`),`platform.openCuaPermissionOnboarding`
- Produces: `<CuaPermissionChecklistModal open onContinue onCancel />`

- [ ] **Step 1: escrever teste que falha**

```tsx
it("两项权限都列出，且状态取自 TCC 判定而非功能探针", () => {
  // 严格复刻上游门控语义：只读刷新时 screenCaptureProbeOk 恒 false
  const status = {
    accessibility: "granted",
    screenRecording: "granted",
    accessibilityProbeOk: false,
    screenCaptureProbeOk: false,
  };
  render(<CuaPermissionChecklistModal open status={status} onContinue={noop} onCancel={noop} />);
  expect(screen.getByText("辅助功能")).toBeInTheDocument();
  expect(screen.getByText("屏幕录制")).toBeInTheDocument();
  // 若误用带 probe 的判定，这里会显示「待授权」
  expect(screen.queryByText("待授权")).not.toBeInTheDocument();
  expect(screen.getAllByText("已授权")).toHaveLength(2);
});

it("点击继续时只请求仍缺失的权限", async () => {
  const onContinue = vi.fn();
  render(
    <CuaPermissionChecklistModal
      open
      status={{ accessibility: "denied", screenRecording: "granted" }}
      onContinue={onContinue}
      onCancel={noop}
    />,
  );
  await userEvent.click(screen.getByRole("button", { name: "继续" }));
  expect(onContinue).toHaveBeenCalledWith(["accessibility"]);
});
```

- [ ] **Step 2: executar o teste e confirmar a falha**

Run: `pnpm --filter @zcode/ui exec vitest run test/cuaPermissionChecklistModal.test.tsx`
Expected: FAIL — o componente não existe

- [ ] **Step 3: implementação**

`CuaPermissionChecklistModal.tsx`: duas linhas de permissão (辅助功能 / 屏幕录制), cada linha com estado derivado de `isCuaPermissionTccGranted`, **sem ler** `*ProbeOk`. O callback 「继续」 recebe apenas o array das permissões que ainda faltam. Os textos passam por `react-intl`, com ids novos no namespace `cuaPermission.*` já existente.

`ComputerUseSection.tsx`: exibir o modal antes de `openPermissionSettings` e só chamar `platform.openCuaPermissionOnboarding({ requiredPermissions })` depois que o usuário clicar em 「继续」. As proteções existentes de concorrência/invalidação (`permissionStatusCheckTokenRef`, `helperContextKeyRef`, `returnRecoveryRef`, a revalidação depois de ceder uma macrotask) **devem ser mantidas literalmente** — elas impedem que «outra janela acabou de autorizar / refresh em voo / troca de workspace A→B» abra a página de ajustes no contexto errado.

`desktopCuaPermissionIpc.ts`: no adaptador `openSettingsAndWaitForReturn` de `openCuaPermissionOnboarding`, chamar `panel.show(permission)` depois de abrir a página de ajustes; chamar `panel.hide()` quando aquele stage terminar ou quando a sessão entrar em qualquer estado final (sucesso/cancelamento/timeout/origin destroyed) e `panel.destroy()` no `finally`.

- [ ] **Step 4: executar o teste e confirmar a passagem**

Run: `pnpm --filter @zcode/ui exec vitest run test/cuaPermissionChecklistModal.test.tsx`
Expected: PASS

Run: `pnpm typecheck && pnpm lint`
Expected: sem erros. Atenção: o `pnpm typecheck` da raiz **não cobre** os tsconfigs de renderer/main do desktop, e os `test/*.test.ts` de desktop e ui sequer têm tsconfig; é preciso validar à parte com a receita temporária para o ponto cego do typecheck.

- [ ] **Step 5: commit**

```bash
git add packages/ui/src packages/ui/test packages/desktop/src/main/desktopCuaPermissionIpc.ts
git commit -m "feat(cua): add permission checklist modal and wire drag panel"
```

---

## Task 8: validação manual ponta a ponta

**Files:** nenhum (tarefa de validação)

- [ ] **Step 1: criar um estado de TCC limpo**

```bash
tccutil reset Accessibility dev.zcode.cua-helper.dev
tccutil reset ScreenCapture dev.zcode.cua-helper.dev
sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
  "select service,auth_value from access where client='dev.zcode.cua-helper.dev';"
```
Expected: sem saída (zero entradas = simular um usuário novo)

- [ ] **Step 2: subir o dev**

```bash
nohup env ZCODE_CUA_DEV_MODE=1 ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
  pnpm run dev:desktop > /tmp/zcode-desktop-dev.log 2>&1 < /dev/null & disown
```
Critério de prontidão: `grep -a "cua helper ready at" /tmp/zcode-desktop-dev.log`.**não** iniciar o dev pelo background do harness (a limpeza da tarefa levaria a cadeia de dev inteira junto); só considerar falha um `ELIFECYCLE` / `exited with code [1-9]`.

- [ ] **Step 3: percorrer o fluxo de autorização conferindo item a item**

- [ ] em momento algum **não** há pop-up de sistema "would like to control this computer" / de gravação de tela
- [ ] o primeiro modal lista os dois itens: acessibilidade + gravação de tela
- [ ] depois de clicar em continuar os ajustes do sistema abrem na página correspondente, a janela flutuante aparece e **encaixa na parte inferior da janela dos ajustes**
- [ ] ao clicar/arrastar a janela flutuante os ajustes do sistema **não** vão para segundo plano
- [ ] arrastar o tile consegue soltar o Helper na lista e o `auth_value` vai direto a 2
- [ ] após o arrasto a janela flutuante dá feedback imediato de autorizado e avança para o próximo item
- [ ] no estado final da sessão a janela flutuante é destruída e o subprocesso `zcode-window-bounds` sai junto (`pgrep -f zcode-window-bounds` vazio)

- [ ] **Step 4: conferir o resultado no TCC**

```bash
sqlite3 "/Library/Application Support/com.apple.TCC/TCC.db" \
  "select service,auth_value from access where client='dev.zcode.cua-helper.dev';"
```
Expected: dois registros com `auth_value=2`

- [ ] **Step 5: commitar o registro de validação**

Acrescentar os resultados medidos ao final deste plano e commitar.

---

## Autoverificação

**Cobertura da spec**: sem pop-up → Task 2; arrastar para a lista → Task 3/4; primeiro modal lista as duas permissões → Task 7; encaixe (snap) → Task 5/6; preservar a coordenação de sessão / verificação de assinatura / reinício → Task 2 preserva explicitamente + Task 7 preserva as proteções de concorrência.

**Consistência de tipos**: `PrepareCuaHelperPermissionDragResult` (shared, sem fingerprint) e `PrepareCuaHelperPermissionDragMainResult` (main, com fingerprint) são estritamente distintos; o handler do Task 4 só devolve ao renderer depois de remover explicitamente o campo de fingerprint. `captureCuaHelperBundleFingerprint` / `cuaHelperBundleFingerprintUnchanged` reaproveitam as exportações existentes de `cuaAccessibilitySettings.ts`, sem redefinição.

**Riscos conhecidos**: sem pop-up, um usuário novo **só consegue entrar na lista arrastando** — não há segunda via; se não vir a janelinha ou não souber arrastar, trava. As mitigações são o encaixe do Task 6 (deixar a janelinha colada no foco do olhar do usuário) e o modal de lista do Task 7 (explicar antes quais duas permissões serão concedidas). Se os testes posteriores mostrarem taxa de arrasto insuficiente, pode-se acrescentar na janela flutuante uma orientação estática do tipo "não conseguiu abrir? clique aqui para ver o diagrama», mas **não** se deve voltar ao pop-up do sistema — é exatamente o que esta mudança elimina.