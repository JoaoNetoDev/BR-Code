# Plano de implementação de captura de tela automática no relato de problema

> **Para trabalhadores agentivos:** SUB-SKILL OBRIGATÓRIA: use
> superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para
> implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para
> acompanhamento.

**Objetivo:** ao clicar em "问题上报" (relato de problema) no menu de ajuda, capturar primeiro a imagem
da janela atual da task e colocar a captura na área de screenshot do popup "提交反馈".

**Arquitetura:** adicionar um pequeno helper na camada de UI que converte a capacidade opcional de
captura de tela da plataforma em `FeedbackAttachmentDraft[]`; o `WorkspaceHelpMenuButton` chama o helper
antes de abrir o feedback. O popup de feedback, a cadeia de upload e a implementação de captura via
Electron IPC permanecem inalteradas.

**Stack técnico:** React 19, Zustand, Vitest, TypeScript, `IPlatformService.captureWindowScreenshot`
existente.

## Restrições globais

- preservar primeiro o spec e só depois implementar o código; o spec já foi submetido em
  `docs/superpowers/specs/2026-06-17-issue-report-auto-screenshot-design.md`.
- ao modificar `packages/ui`, ler e respeitar o `DESIGN.md` da raiz; este plano não adiciona estilo de
  UI visível.
- novos logs de UI, se necessários, devem passar por `packages/ui/src/logger.ts`; este plano não
  adiciona logs.
- usar `@/` ou caminho absoluto com nome de pacote nos imports.
- na Web/celular, quando `captureWindowScreenshot` não existir, retornar `null` ou falhar, degradar
  silenciosamente e ainda abrir o popup de feedback.
- não alterar o relay de controle remoto, o processo main, o stream de session/task, o snapshot, a
  fila nem a semântica de recuperação replayable.
- ao concluir, executar `pnpm typecheck` e `pnpm lint`.

---

### Task 1: Helper de draft de screenshot do feedback

**Arquivos:**
- Criar: `packages/ui/src/feedback/feedbackScreenshotDraft.ts`
- Teste: `packages/ui/test/feedbackScreenshotDraft.test.ts`

**Interfaces:**
- Consome: `IPlatformService.captureWindowScreenshot?(): Promise<WindowScreenshotResult | null>`
- Produz: `captureFeedbackScreenshotDraft(platform): Promise<FeedbackAttachmentDraft[]>`

- [x] **Step 1: Escrever o teste que falha**

```ts
import { describe, expect, it, vi } from "vitest";
import type { IPlatformService, WindowScreenshotResult } from "@zcode/shared";
import { captureFeedbackScreenshotDraft } from "@/feedback/feedbackScreenshotDraft.js";

const screenshot: WindowScreenshotResult = {
  dataBase64: "base64-image",
  filename: "zcode-error-2026-06-17.png",
  contentType: "image/png",
  size: 12,
};

describe("captureFeedbackScreenshotDraft", () => {
  it("returns a feedback attachment draft when platform screenshot succeeds", async () => {
    const platform = {
      captureWindowScreenshot: vi.fn(async () => screenshot),
    } as Pick<IPlatformService, "captureWindowScreenshot">;

    await expect(captureFeedbackScreenshotDraft(platform)).resolves.toEqual([screenshot]);
    expect(platform.captureWindowScreenshot).toHaveBeenCalledTimes(1);
  });

  it("returns an empty draft when platform screenshot is unavailable", async () => {
    const platform = {} as Pick<IPlatformService, "captureWindowScreenshot">;

    await expect(captureFeedbackScreenshotDraft(platform)).resolves.toEqual([]);
  });

  it("returns an empty draft when platform screenshot fails", async () => {
    const platform = {
      captureWindowScreenshot: vi.fn(async () => {
        throw new Error("capture failed");
      }),
    } as Pick<IPlatformService, "captureWindowScreenshot">;

    await expect(captureFeedbackScreenshotDraft(platform)).resolves.toEqual([]);
  });
});
```

- [x] **Step 2: Executar o teste para verificar que falha**

Run: `pnpm exec vitest run packages/ui/test/feedbackScreenshotDraft.test.ts`

Esperado: FAIL porque `@/feedback/feedbackScreenshotDraft.js` não existe.

- [x] **Step 3: Escrever a implementação mínima**

```ts
import type { IPlatformService } from "@zcode/shared";
import type { FeedbackAttachmentDraft } from "@/feedback/feedbackStore.js";

export async function captureFeedbackScreenshotDraft(
  platform: Pick<IPlatformService, "captureWindowScreenshot">,
): Promise<FeedbackAttachmentDraft[]> {
  const screenshot = await platform.captureWindowScreenshot?.().catch(() => null);
  return screenshot ? [screenshot] : [];
}
```

- [x] **Step 4: Executar o teste para verificar que passa**

Run: `pnpm exec vitest run packages/ui/test/feedbackScreenshotDraft.test.ts`

Esperado: PASS.

---

### Task 2: O menu de ajuda do workspace usa o draft de screenshot

**Arquivos:**
- Modificar: `packages/ui/src/WorkspaceHelpMenuButton.tsx`
- Modificar: `packages/ui/test/workspaceHeaderActionSection.test.ts`

**Interfaces:**
- Consome: `captureFeedbackScreenshotDraft(platform)`
- Produz: draft de relato de problema do menu de ajuda com `screenshots: FeedbackAttachmentDraft[]`

- [x] **Step 1: Escrever o teste que falha**

Atualizar `packages/ui/test/workspaceHeaderActionSection.test.ts`:

```ts
const screenshot = {
  dataBase64: "base64-image",
  filename: "zcode-error-2026-06-17.png",
  contentType: "image/png",
  size: 12,
};

const capturedHeaderHelp = vi.hoisted(() => ({
  openCommunity: vi.fn(),
  openExternal: vi.fn(),
  exportLogs: vi.fn(async () => ({ success: true })),
  captureWindowScreenshot: vi.fn(async () => screenshot),
  openSubmit: vi.fn(),
  openFeatureRequest: vi.fn(),
  menuItems: [] as Array<{
    onSelect: (() => void | Promise<void>) | undefined;
  }>,
}));
```

Mockar `usePlatform` com `captureWindowScreenshot` e então atualizar o teste de roteamento:

```ts
capturedHeaderHelp.captureWindowScreenshot.mockClear();
capturedHeaderHelp.captureWindowScreenshot.mockResolvedValue(screenshot);

await capturedHeaderHelp.menuItems[0]?.onSelect?.();
capturedHeaderHelp.menuItems[1]?.onSelect?.();
capturedHeaderHelp.menuItems[2]?.onSelect?.();
capturedHeaderHelp.menuItems[3]?.onSelect?.();
capturedHeaderHelp.menuItems[4]?.onSelect?.();

expect(capturedHeaderHelp.captureWindowScreenshot).toHaveBeenCalledTimes(1);
expect(capturedHeaderHelp.openSubmit).toHaveBeenNthCalledWith(
  1,
  expect.objectContaining({
    type: "bug",
    includeLogs: true,
    screenshots: [screenshot],
  }),
);
```

Adicionar uma segunda asserção para o caminho de falha:

```ts
it("opens issue report without screenshots when window screenshot fails", async () => {
  capturedHeaderHelp.menuItems = [];
  capturedHeaderHelp.openSubmit.mockClear();
  capturedHeaderHelp.captureWindowScreenshot.mockReset();
  capturedHeaderHelp.captureWindowScreenshot.mockRejectedValue(new Error("capture failed"));
  const { WorkspaceHeaderActionSection } =
    await import("@/WorkspaceHeaderSections/WorkspaceHeaderActionSection.js");

  renderToStaticMarkup(
    createElement(WorkspaceHeaderActionSection, {
      workspaceAbsPath: "/workspace",
      isTerminalOpen: false,
      isSidePaneOpen: false,
      onToggleTerminal: vi.fn(),
      onToggleSidePane: vi.fn(),
    }),
  );

  await capturedHeaderHelp.menuItems[0]?.onSelect?.();

  expect(capturedHeaderHelp.openSubmit).toHaveBeenCalledWith(
    expect.objectContaining({
      type: "bug",
      includeLogs: true,
      screenshots: [],
    }),
  );
});
```

- [x] **Step 2: Executar o teste para verificar que falha**

Run: `pnpm exec vitest run packages/ui/test/workspaceHeaderActionSection.test.ts`

Esperado: FAIL porque o handler atual de relato de problema não chama `captureWindowScreenshot` e não
passa `screenshots`.

- [x] **Step 3: Escrever a implementação mínima**

Atualizar `packages/ui/src/WorkspaceHelpMenuButton.tsx`:

```ts
import { captureFeedbackScreenshotDraft } from "@/feedback/feedbackScreenshotDraft.js";
```

Substituir `handleOpenIssueReport`:

```ts
const handleOpenIssueReport = async () => {
  const screenshots = await captureFeedbackScreenshotDraft(platform);
  openFeedbackSubmit({
    type: "bug",
    module: "其它",
    severity: "P2-中",
    includeLogs: true,
    screenshots,
  });
};
```

Manter o binding do menu como `onSelect={handleOpenIssueReport}`.

- [x] **Step 4: Executar os testes focados para verificar que passam**

Run:

```bash
pnpm exec vitest run packages/ui/test/feedbackScreenshotDraft.test.ts packages/ui/test/workspaceHeaderActionSection.test.ts
```

Esperado: PASS.

---

### Task 3: Verificação completa e commit

**Arquivos:**
- Verificar todos os arquivos alterados pelas Tasks 1-2.

**Interfaces:**
- Consome: implementação das Tasks 1-2.
- Produz: implementação da feature submetida.

- [x] **Step 1: Executar o typecheck obrigatório**

Run: `pnpm typecheck`

Esperado: PASS.

- [x] **Step 2: Executar o lint obrigatório**

Run: `pnpm lint`

Esperado: PASS.

- [x] **Step 3: Inspecionar o git diff**

Run: `git diff --stat && git diff -- packages/ui/src/feedback/feedbackScreenshotDraft.ts packages/ui/src/WorkspaceHelpMenuButton.tsx packages/ui/test/feedbackScreenshotDraft.test.ts packages/ui/test/workspaceHeaderActionSection.test.ts`

Esperado: apenas o helper, o menu de ajuda, os testes focados e este plano de implementação foram
alterados.

- [x] **Step 4: Commit**

```bash
git add docs/superpowers/plans/2026-06-17-issue-report-auto-screenshot.md packages/ui/src/feedback/feedbackScreenshotDraft.ts packages/ui/src/WorkspaceHelpMenuButton.tsx packages/ui/test/feedbackScreenshotDraft.test.ts packages/ui/test/workspaceHeaderActionSection.test.ts
git commit -m "feat: attach screenshot to issue reports"
```