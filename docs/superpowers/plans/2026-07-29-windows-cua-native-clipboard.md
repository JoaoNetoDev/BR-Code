# Plano de Implementação da Área de Transferência Nativa do Windows CUA

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** adicionar ao Helper de origem para Windows uma cadeia real, assíncrona e fail-closed de leitura/escrita `CF_UNICODETEXT`, e fazer com que `broker_info.capabilities.clipboard` só seja `true` quando as duas exportações nativas estiverem presentes.

**Arquitetura:** `ax_win.cc` executa a API síncrona de área de transferência do Win32 por meio de duas exportações aditivas `Napi::AsyncWorker`; `createNodeAutomationAdapter` só escolhe esse caminho quando `win32` e as exportações de leitura e escrita estiverem ambas presentes, mapeando o resultado nativo estruturado para um erro de broker estável. `electronNativeBackend` unifica com `await` o adapter de área de transferência síncrono/assíncrono, portanto o comportamento da superfície de sistema existente em macOS/Linux não muda e o addon antigo do Windows continua fail closed.

**Stack Tecnológico:** TypeScript 5.9, Vitest 4, Node-API / node-addon-api, C++17, API de Área de Transferência do Win32, MSVC / node-gyp, broker de named pipe do Windows.

## Restrições Globais

- Altere primeiro os testes e depois a implementação; cada tarefa deve observar RED antes de chegar a GREEN.
- Modifique somente a cadeia local do Helper de origem para Windows em `C:\Users\dev\zcode-cua`, bem como a documentação factual em `C:\Users\dev\z-code`; não inicie nem modifique SSH, WSL, Docker, remote workspace, `/remote` móvel.
- A área de transferência do Windows deve usar o `CF_UNICODETEXT` do Win32; são proibidos PowerShell, shell, comandos externos e fallback de área de transferência do Electron.
- A ABI aditiva é fixa em `readClipboardTextAsync(): Promise<NativeClipboardReadOutcome>` e `writeClipboardTextAsync(text): Promise<NativeClipboardWriteOutcome>`; a ausência de qualquer uma das exportações deve tornar `supportsClipboard=false` no Windows.
- `ElectronAutomationAdapter.readClipboardText` retorna `string | Promise<string>`; `writeClipboardText` retorna `void | Promise<void>`; a superfície de sistema síncrona de macOS/Linux permanece compatível.
- Use um `std::timed_mutex g_clipboardMutex` independente; a espera pelo lock interno do Helper é de no máximo 250 ms; `OpenClipboard(nullptr)` no máximo 8 vezes, com 10 ms de intervalo entre cada tentativa.
- O limite de texto é fixo em 8 Mi code units UTF-16; a leitura deve ser restringida por `GlobalSize` e procurar o primeiro NUL dentro do limite, proibindo `wcslen` sem limite.
- A escrita deve concluir a conversão para UTF-16, a alocação do `HGLOBAL` e a cópia do conteúdo antes de `OpenClipboard` / `EmptyClipboard`; a posse só é transferida ao Windows depois que `SetClipboardData` tem sucesso.
- O resultado nativo ou o erro de broker não pode conter conteúdo da área de transferência, marcador, token, pipe, caminho de processo ou texto de erro bruto do Win32.
- Não adicionar logs `info` por operação de área de transferência; se diagnóstico for realmente necessário durante a implementação, usar apenas status de baixa frequência sem conteúdo ou `debug` em modo de desenvolvimento, sem registrar em produção com base no tamanho do texto ou no volume de chamadas.
- `busy` mapeia para `timeout`; `too_large` mapeia para `invalid_request`; `unavailable`, `invalid_data`, `write_failed` e resultados malformados mapeiam para `internal`, sem relatar falsamente erro de permissão.
- `write_clipboard` mantém a semântica de action / `possibly_sent`; `write_failed` não deve ser repetido automaticamente.
- Nomes de ferramenta, tier, annotation, método de broker e o manifesto de 30 ferramentas permanecem inalterados.
- O live smoke é desabilitado por padrão; sem opt-in explícito, deve sair com exit code 2 antes de iniciar o Helper, ler ou modificar a área de transferência.
- O live smoke só restaura o texto puro original; não consegue restaurar formatos adicionais como HTML ou imagens que tenham sido substituídos pela escrita de teste; uma restauração falha deve sair com código diferente de zero e avisar claramente que a área de transferência ainda pode conter o valor de teste.
- `zcode-cua` deve executar testes focados, rebuild nativo, typecheck, lint, build e a suíte completa de testes; `z-code` deve executar a integração do Helper de origem para Windows, a suíte focada de CUA, o teste do plugin oficial, typecheck e lint.
- O `pnpm test:unit:affected` de todo o repositório no Windows do `z-code` tem uma baseline não-CUA já registrada; ainda assim deve ser executado e registrado item a item, sem chamar resultado não-zero de aprovado.

---

## Estrutura de Arquivos

### `C:\Users\dev\zcode-cua`

- Modificar: `src/broker/server/nativeAxSource.ts` — resultado de área de transferência do addon bruto neutro de broker e ABI aditiva.
- Modificar: `src/native/types.ts` — resultado público de área de transferência e tipos de exportação do addon bruto do Windows.
- Modificar: `src/broker/server/electronNativeBackendTypes.ts` — seam de área de transferência do adapter compatível com sync/Promise.
- Modificar: `src/broker/server/nodeAutomationAdapter.ts` — gate de capability das duas exportações no Windows, validação de resultado nativo e mapeamento de erro de broker.
- Modificar: `src/broker/server/electronNativeBackend.ts` — handlers de área de transferência assíncronos do broker.
- Modificar: `src/native/ax_win.cc` — worker `CF_UNICODETEXT`, lock, retentativas, RAII e posse de memória.
- Criar: `test/windows-native-clipboard-adapter.test.ts` — as duas exportações do adapter, fallback de plataforma, todos os resultados e as restrições de vazamento.
- Modificar: `test/windows-capability-truthfulness.test.ts` — verdade da capability do broker e do handler assíncrono.
- Criar: `test/native/windows-clipboard.test.ts` — contrato do código nativo e verificação das exportações compiladas.
- Criar: `scripts/windows-clipboard-live-smoke.mjs` — round-trip real de broker via opt-in e restauração no `finally`.
- Criar: `test/windows-clipboard-live-smoke.test.ts` — teste de regressão que garante desligado por padrão e que não ultrapassa o preflight.
- Modificar: `package.json` — comando `smoke:windows:clipboard`.
- Modificar: `docs/platforms.md` — capacidade atual, limites e comando real da área de transferência do Windows.
- Modificar depois que todos os testes de código passem: `dist/**` — artefatos de release gerados por `pnpm build` e incluídos no commit.

### `C:\Users\dev\z-code`

- Modificar: `docs/cua/windows-source-development.md` — build, verificação, riscos e registro real do desktop de origem.

## Fluxo de Dados e de Erros

```text
read_clipboard
  |
  +-- backend async handler
        |
        +-- win32 + read/write native exports both present
        |     |
        |     +-- await readClipboardTextAsync()
        |           |
        |           +-- Helper timed_mutex (<=250ms)
        |           +-- OpenClipboard retry (8 x 10ms)
        |           +-- CF_UNICODETEXT + GlobalSize bounded scan
        |           +-- strict UTF-16 -> UTF-8
        |
        +-- darwin/linux -> existing system.readClipboardText()

write_clipboard
  |
  +-- backend marks action as possibly-sent and awaits adapter
        |
        +-- strict UTF-8 -> UTF-16 + preallocate HGLOBAL
        +-- Helper timed_mutex (<=250ms)
        +-- OpenClipboard retry (8 x 10ms)
        +-- EmptyClipboard -> SetClipboardData
        +-- ownership transfers only after SetClipboardData succeeds
```

```text
native outcome        broker code       side-effect/retry meaning
busy                  timeout           falha antes da mutação; o chamador pode decidir de novo
too_large             invalid_request   entrada/resultado excede o limite fixo
unavailable           internal          indisponível em runtime; não é uma permissão de usuário
invalid_data          internal          dados lidos corrompidos; não se forja texto vazio
write_failed          internal          possibly-sent; prohibited automatic replay
malformed outcome     internal          ABI do addon não confiável; fail closed
```

---

### Tarefa 1: Fixar a ABI TypeScript aditiva e o contrato de erro do adapter

**Arquivos:**

- Criar: `C:\Users\dev\zcode-cua\test\windows-native-clipboard-adapter.test.ts`
- Modificar: `C:\Users\dev\zcode-cua\src\broker\server\nativeAxSource.ts`
- Modificar: `C:\Users\dev\zcode-cua\src\native\types.ts`
- Modificar: `C:\Users\dev\zcode-cua\src\broker\server\electronNativeBackendTypes.ts`
- Modificar: `C:\Users\dev\zcode-cua\src\broker\server\nodeAutomationAdapter.ts`

**Interfaces:**

- Consome: `createNodeAutomationAdapter({ native, system, platform })` existente, `NodeSystemSurface`, `BrokerError`.
- Produz:
  - `NativeClipboardReadOutcome`
  - `NativeClipboardWriteOutcome`
  - `HelperNativeAddon.readClipboardTextAsync` opcional
  - `HelperNativeAddon.writeClipboardTextAsync` opcional
  - adapter do Windows com `supportsClipboard=true` apenas quando ambas as funções existem.

- [ ] **Etapa 1: Escrever os testes de contrato do adapter que falham**

Crie `test/windows-native-clipboard-adapter.test.ts` com factories que fazem cast apenas do seam do addon bruto, não do comportamento sob teste:

```ts
import { describe, expect, it, vi } from "vitest";

import { createNodeAutomationAdapter } from "../src/broker/server/nodeAutomationAdapter.js";
import type {
  HelperNativeAddon,
  NativeClipboardReadOutcome,
  NativeClipboardWriteOutcome,
} from "../src/broker/server/nativeAxSource.js";
import type { NodeSystemSurface } from "../src/broker/server/nodeSystemSurface.js";

function nativeWithClipboard(overrides: Record<string, unknown> = {}): HelperNativeAddon {
  return {
    isTrusted: () => true,
    promptTrust: () => true,
    screenCaptureStatus: () => "unknown",
    displays: () => [{ id: 1, bounds: [0, 0, 800, 600], main: true }],
    cursorPoint: () => ({ x: 0, y: 0 }),
    readClipboardTextAsync: async () => ({ ok: true, text: "" }),
    writeClipboardTextAsync: async () => ({ ok: true }),
    ...overrides,
  } as unknown as HelperNativeAddon;
}

function systemSurface(): NodeSystemSurface {
  return {
    supportsScreenCapture: false,
    supportsClipboard: false,
    captureScreenPng: async () => null,
    captureWindowPng: async () => null,
    readClipboardText: vi.fn(() => "system-text"),
    writeClipboardText: vi.fn(),
    resolveApplicationBundleId: async () => null,
    openApplication: async () => undefined,
  };
}

describe("Windows native clipboard adapter", () => {
  it("enables clipboard only when both native async exports exist", () => {
    const both = createNodeAutomationAdapter({
      native: nativeWithClipboard(),
      system: systemSurface(),
      platform: "win32",
    });
    const readOnly = createNodeAutomationAdapter({
      native: nativeWithClipboard({ writeClipboardTextAsync: undefined }),
      system: systemSurface(),
      platform: "win32",
    });
    const writeOnly = createNodeAutomationAdapter({
      native: nativeWithClipboard({ readClipboardTextAsync: undefined }),
      system: systemSurface(),
      platform: "win32",
    });
    const neither = createNodeAutomationAdapter({
      native: nativeWithClipboard({
        readClipboardTextAsync: undefined,
        writeClipboardTextAsync: undefined,
      }),
      system: systemSurface(),
      platform: "win32",
    });

    expect(both.supportsClipboard).toBe(true);
    expect(readOnly.supportsClipboard).toBe(false);
    expect(writeOnly.supportsClipboard).toBe(false);
    expect(neither.supportsClipboard).toBe(false);
  });

  it("uses the native pair on Windows and preserves a real empty string", async () => {
    const readClipboardTextAsync = vi.fn<() => Promise<NativeClipboardReadOutcome>>(async () => ({
      ok: true,
      text: "",
    }));
    const writeClipboardTextAsync = vi.fn<(text: string) => Promise<NativeClipboardWriteOutcome>>(
      async () => ({ ok: true }),
    );
    const system = systemSurface();
    const adapter = createNodeAutomationAdapter({
      native: nativeWithClipboard({
        readClipboardTextAsync,
        writeClipboardTextAsync,
      }),
      system,
      platform: "win32",
    });

    await expect(Promise.resolve(adapter.readClipboardText())).resolves.toBe("");
    await expect(Promise.resolve(adapter.writeClipboardText("文本🙂"))).resolves.toBeUndefined();
    expect(writeClipboardTextAsync).toHaveBeenCalledWith("文本🙂");
    expect(system.readClipboardText).not.toHaveBeenCalled();
    expect(system.writeClipboardText).not.toHaveBeenCalled();
  });

  it.each(["darwin", "linux"] as const)(
    "keeps the existing %s system clipboard surface",
    async (platform) => {
      const system = systemSurface();
      const nativeRead = vi.fn(async () => ({ ok: true, text: "native" }) as const);
      const adapter = createNodeAutomationAdapter({
        native: nativeWithClipboard({ readClipboardTextAsync: nativeRead }),
        system: { ...system, supportsClipboard: true },
        platform,
      });

      expect(adapter.supportsClipboard).toBe(true);
      await expect(Promise.resolve(adapter.readClipboardText())).resolves.toBe("system-text");
      expect(nativeRead).not.toHaveBeenCalled();
    },
  );
});
```

Adicione no mesmo arquivo casos orientados por tabela para os mapeamentos exatos:

```ts
it.each([
  [{ ok: false, error: "busy" }, "timeout"],
  [{ ok: false, error: "too_large" }, "invalid_request"],
  [{ ok: false, error: "unavailable" }, "internal"],
  [{ ok: false, error: "invalid_data" }, "internal"],
] as const)("maps read outcome %j to %s without content leakage", async (outcome, code) => {
  const adapter = createNodeAutomationAdapter({
    native: nativeWithClipboard({ readClipboardTextAsync: async () => outcome }),
    system: systemSurface(),
    platform: "win32",
  });
  await expect(Promise.resolve(adapter.readClipboardText())).rejects.toMatchObject({ code });
});

it.each([
  [{ ok: false, error: "busy" }, "timeout"],
  [{ ok: false, error: "too_large" }, "invalid_request"],
  [{ ok: false, error: "unavailable" }, "internal"],
  [{ ok: false, error: "write_failed" }, "internal"],
] as const)("maps write outcome %j to %s without content leakage", async (outcome, code) => {
  const secret = "DO-NOT-LEAK-CLIPBOARD-TEXT";
  const adapter = createNodeAutomationAdapter({
    native: nativeWithClipboard({ writeClipboardTextAsync: async () => outcome }),
    system: systemSurface(),
    platform: "win32",
  });
  try {
    await Promise.resolve(adapter.writeClipboardText(secret));
    throw new Error("expected clipboard write to fail");
  } catch (error) {
    expect(error).toMatchObject({ code });
    expect(String((error as Error).message)).not.toContain(secret);
  }
});

it("fails closed on malformed native outcomes", async () => {
  const adapter = createNodeAutomationAdapter({
    native: nativeWithClipboard({
      readClipboardTextAsync: async () => ({ ok: true, text: 42 }),
    }),
    system: systemSurface(),
    platform: "win32",
  });
  await expect(Promise.resolve(adapter.readClipboardText())).rejects.toMatchObject({
    code: "internal",
  });
});
```

- [ ] **Etapa 2: Executar o teste focado e verificar RED**

Execute:

```powershell
cd C:\Users\dev\zcode-cua
pnpm exec vitest run test/windows-native-clipboard-adapter.test.ts
```

Esperado: FAIL porque os tipos de resultado e os métodos assíncronos de `HelperNativeAddon` não existem, e o adapter do Windows ainda delega à superfície de sistema não suportada.

- [ ] **Etapa 3: Adicionar a ABI TypeScript exata**

Em `src/broker/server/nativeAxSource.ts`, imediatamente antes de `HelperNativeAddon`:

```ts
export type NativeClipboardReadOutcome =
  | { ok: true; text: string }
  | {
      ok: false;
      error: "busy" | "unavailable" | "invalid_data" | "too_large";
    };

export type NativeClipboardWriteOutcome =
  | { ok: true }
  | {
      ok: false;
      error: "busy" | "unavailable" | "too_large" | "write_failed";
    };
```

Adicione a `HelperNativeAddon`:

```ts
readClipboardTextAsync?(): Promise<NativeClipboardReadOutcome>;
writeClipboardTextAsync?(text: string): Promise<NativeClipboardWriteOutcome>;
```

Espelhe as formas públicas do Windows, estruturalmente idênticas, em `src/native/types.ts`:

```ts
export type AxWinClipboardReadOutcome =
  | { ok: true; text: string }
  | {
      ok: false;
      error: "busy" | "unavailable" | "invalid_data" | "too_large";
    };

export type AxWinClipboardWriteOutcome =
  | { ok: true }
  | {
      ok: false;
      error: "busy" | "unavailable" | "too_large" | "write_failed";
    };
```

Adicione a `AxWinNativeAddon`:

```ts
readClipboardTextAsync?(): Promise<AxWinClipboardReadOutcome>;
writeClipboardTextAsync?(text: string): Promise<AxWinClipboardWriteOutcome>;
```

Altere apenas as formas de retorno da área de transferência em `ElectronAutomationAdapter`:

```ts
readClipboardText(): string | Promise<string>;
writeClipboardText(text: string): void | Promise<void>;
```

- [ ] **Etapa 4: Implementar o gate do par exclusivo do Windows e o mapeamento de resultados**

Em `nodeAutomationAdapter.ts`, adicione `NativeClipboardReadOutcome` e `NativeClipboardWriteOutcome` ao import de tipos existente de `nativeAxSource.ts`. Imediatamente depois de `const platform = options.platform ?? process.platform` existente, envolva as duas exportações opcionais, calcule o gate do par e use estes validadores exatos:

```ts
const readClipboardTextAsync = wrapOptionalNativeMethod(native.readClipboardTextAsync);
const writeClipboardTextAsync = wrapOptionalNativeMethod(native.writeClipboardTextAsync);
const hasNativeClipboard =
  platform === "win32" &&
  typeof readClipboardTextAsync === "function" &&
  typeof writeClipboardTextAsync === "function";

function clipboardError(
  operation: "read_clipboard" | "write_clipboard",
  error: string,
): BrokerError {
  if (error === "busy") {
    return new BrokerError(
      "timeout",
      `${operation}: native clipboard was busy before mutation admission; no clipboard mutation occurred`,
    );
  }
  if (error === "too_large") {
    return new BrokerError(
      "invalid_request",
      `${operation}: clipboard text exceeds 8388608 UTF-16 code units`,
    );
  }
  if (error === "write_failed") {
    return new BrokerError(
      "internal",
      `${operation}: native clipboard write failed after admission; the action is possibly-sent and must not be retried automatically`,
    );
  }
  if (error === "invalid_data") {
    return new BrokerError("internal", `${operation}: native clipboard text was invalid`);
  }
  if (error === "unavailable") {
    return new BrokerError(
      "internal",
      `${operation}: native Windows clipboard is unavailable in this interactive session`,
    );
  }
  return new BrokerError("internal", `${operation}: native clipboard returned an invalid outcome`);
}
```

Use verificações estruturais estritas em vez de truthiness:

```ts
async function readNativeClipboardText(
  read: () => Promise<NativeClipboardReadOutcome>,
): Promise<string> {
  const outcome = await read();
  if (
    outcome &&
    typeof outcome === "object" &&
    outcome.ok === true &&
    typeof outcome.text === "string"
  ) {
    return outcome.text;
  }
  if (
    outcome &&
    typeof outcome === "object" &&
    outcome.ok === false &&
    typeof outcome.error === "string"
  ) {
    throw clipboardError("read_clipboard", outcome.error);
  }
  throw clipboardError("read_clipboard", "malformed");
}

async function writeNativeClipboardText(
  write: (text: string) => Promise<NativeClipboardWriteOutcome>,
  text: string,
): Promise<void> {
  const outcome = await write(text);
  if (outcome && typeof outcome === "object" && outcome.ok === true) return;
  if (
    outcome &&
    typeof outcome === "object" &&
    outcome.ok === false &&
    typeof outcome.error === "string"
  ) {
    throw clipboardError("write_clipboard", outcome.error);
  }
  throw clipboardError("write_clipboard", "malformed");
}
```

No objeto adapter retornado, substitua apenas os três campos de área de transferência:

```ts
supportsClipboard: hasNativeClipboard
  ? true
  : platform === "win32"
    ? false
    : system.supportsClipboard !== false,
readClipboardText: hasNativeClipboard
  ? () => readNativeClipboardText(readClipboardTextAsync!)
  : () => system.readClipboardText(),
writeClipboardText: hasNativeClipboard
  ? (text: string) => writeNativeClipboardText(writeClipboardTextAsync!, text)
  : (text: string) => system.writeClipboardText(text),
```

Adicione acima do gate do par um comentário de causa raiz em chinês: o antigo addon de exportação única/parcial poderia, caso contrário, anunciar uma área de transferência meio funcionando e cair em um placeholder do Windows.

- [ ] **Etapa 5: Executar o teste focado e o typecheck**

Execute:

```powershell
cd C:\Users\dev\zcode-cua
pnpm exec vitest run test/windows-native-clipboard-adapter.test.ts test/broker/windowsSystemSurface.test.ts
pnpm typecheck
```

Esperado: ambos os comandos saem com 0; os testes de placeholder do Windows permanecem fail closed sem o par, enquanto as exportações duplas falsas passam.

- [ ] **Etapa 6: Commitar o contrato do adapter**

```powershell
git add src/broker/server/nativeAxSource.ts src/native/types.ts src/broker/server/electronNativeBackendTypes.ts src/broker/server/nodeAutomationAdapter.ts test/windows-native-clipboard-adapter.test.ts
git commit -m "feat(windows): add native clipboard adapter contract"
```

---

### Tarefa 2: Fazer os handlers do broker aguardar o trabalho da área de transferência e reportar capability verdadeira

**Arquivos:**

- Modificar: `C:\Users\dev\zcode-cua\test\windows-capability-truthfulness.test.ts`
- Modificar: `C:\Users\dev\zcode-cua\src\broker\server\electronNativeBackend.ts`

**Interfaces:**

- Consome: métodos de adapter da Tarefa 1 que retornam valores síncronos ou Promises.
- Produz: handlers `read_clipboard` e `write_clipboard` que sempre aguardam a conclusão antes de retornar.

- [ ] **Etapa 1: Adicionar testes de broker assíncronos que falham**

Estenda o helper de teste para aceitar sobrescritas de `supportsClipboard`, `readClipboardText` e `writeClipboardText`. Adicione:

```ts
it("awaits native clipboard read/write and advertises the complete pair", async () => {
  let resolveWrite: (() => void) | undefined;
  const writePending = new Promise<void>((resolve) => {
    resolveWrite = resolve;
  });
  const readClipboardText = vi.fn(async () => "");
  const writeClipboardText = vi.fn(() => writePending);
  const backend = createElectronNativeBackend({
    adapter: {
      supportsScreenCapture: false,
      supportsClipboard: true,
      isTrustedAccessibilityClient: () => true,
      getScreenMediaAccessStatus: () => "unknown",
      getPrimaryDisplay: () => DISPLAY,
      getAllDisplays: () => [DISPLAY],
      getCursorScreenPoint: () => ({ x: 0, y: 0 }),
      captureScreenPng: async () => null,
      readClipboardText,
      writeClipboardText,
    },
    brokerInfo: {
      bundle_id: "dev.zcode.cua.helper",
      display_name: "ZCode Computer Use",
      permission_mode: "product",
      version: "0.0.0-test",
      platform: "win32",
    },
  });

  const info = (await backend.broker_info({})) as {
    capabilities: { clipboard: boolean };
  };
  expect(info.capabilities.clipboard).toBe(true);
  await expect(backend.read_clipboard({})).resolves.toBe("");

  let settled = false;
  const write = Promise.resolve(backend.write_clipboard({ text: "marker" })).then(() => {
    settled = true;
  });
  await Promise.resolve();
  expect(settled).toBe(false);
  resolveWrite!();
  await expect(write).resolves.toBeUndefined();
  expect(writeClipboardText).toHaveBeenCalledWith("marker");
});
```

Mantenha o teste existente que prova que `supportsClipboard=false` rejeita antes do despacho ao adapter. Não altere contagens de ferramentas, tiers ou annotations.

- [ ] **Etapa 2: Executar o teste focado e verificar RED**

```powershell
cd C:\Users\dev\zcode-cua
pnpm exec vitest run test/windows-capability-truthfulness.test.ts
```

Esperado: a Promise de escrita resolve cedo demais porque o handler atual não aguarda `adapter.writeClipboardText`.

- [ ] **Etapa 3: Converter ambos os handlers do broker para async

Substitua os handlers por:

```ts
read_clipboard: async () => {
  if (!supportsClipboard) {
    throw notAuthorized(
      "read_clipboard is unavailable in this ZCode Computer Use build.",
    );
  }
  return await adapter.readClipboardText();
},
write_clipboard: async (params) => {
  if (!supportsClipboard) {
    throw notAuthorized(
      "write_clipboard is unavailable in this ZCode Computer Use build.",
    );
  }
  const text = typeof params.text === "string" ? params.text : "";
  await adapter.writeClipboardText(text);
  return null;
},
```

Mantenha a derivação de capability `adapter.supportsClipboard !== false` inalterada; a Tarefa 1 agora é a fonte da verdade da capability do Windows.

- [ ] **Etapa 4: Executar os gates de broker, superfície de ferramentas e tipos**

```powershell
cd C:\Users\dev\zcode-cua
pnpm exec vitest run test/windows-capability-truthfulness.test.ts test/windows-native-clipboard-adapter.test.ts test/annotations.test.ts test/broker/types.brokerMethods.test.ts test/broker/types.readOnlyMethods.test.ts
pnpm typecheck
```

Esperado: exit 0; o manifesto continua com 30 ferramentas, `read_clipboard` continua read-only e `write_clipboard` continua sendo uma action.

- [ ] **Etapa 5: Commitar a fronteira assíncrona do broker**

```powershell
git add src/broker/server/electronNativeBackend.ts test/windows-capability-truthfulness.test.ts
git commit -m "feat(windows): await native clipboard operations"
```

---

### Tarefa 3: Implementar workers Win32 `CF_UNICODETEXT` com limites

**Arquivos:**

- Criar: `C:\Users\dev\zcode-cua\test\native\windows-clipboard.test.ts`
- Modificar: `C:\Users\dev\zcode-cua\src\native\ax_win.cc`

**Interfaces:**

- Consome: strings de resultado da Tarefa 1 e nomes de função do addon bruto.
- Produz:
  - `readClipboardTextAsync(): Promise<{ok:true,text:string}|{ok:false,error:string}>`
  - `writeClipboardTextAsync(text): Promise<{ok:true}|{ok:false,error:string}>`

- [ ] **Etapa 1: Escrever testes RED de contrato do código nativo e das exportações compiladas**

Crie `test/native/windows-clipboard.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../../src/native/ax_win.cc", import.meta.url), "utf8");
const readStart = source.indexOf("void ExecuteReadClipboard");
const readEnd = source.indexOf("class ClipboardReadWorker", readStart);
const readSection = source.slice(readStart, readEnd);

describe("Windows native clipboard source contract", () => {
  it("uses independent bounded worker synchronization", () => {
    expect(source).toContain("std::timed_mutex g_clipboardMutex");
    expect(source).toContain("std::chrono::milliseconds(250)");
    expect(source).toContain("kClipboardOpenAttempts = 8");
    expect(source).toContain("kClipboardOpenRetryDelayMs = 10");
    expect(source).toContain("class ClipboardReadWorker : public Napi::AsyncWorker");
    expect(source).toContain("class ClipboardWriteWorker : public Napi::AsyncWorker");
    expect(source).not.toContain("execFile");
    expect(source).not.toContain("PowerShell");
  });

  it("bounds read memory and closes every opened clipboard", () => {
    expect(source).toContain("class ClipboardCloseGuard");
    expect(source).toContain("GlobalSize");
    expect(source).toContain("kMaxClipboardUtf16CodeUnits = 8 * 1024 * 1024");
    expect(source).toContain("CF_UNICODETEXT");
    expect(readStart).toBeGreaterThanOrEqual(0);
    expect(readEnd).toBeGreaterThan(readStart);
    expect(readSection).not.toContain("wcslen");
  });

  it("allocates before mutation and transfers HGLOBAL ownership only on success", () => {
    const writeStart = source.indexOf("void ExecuteWriteClipboard");
    const writeEnd = source.indexOf("class ClipboardWriteWorker", writeStart);
    const writeSection = source.slice(writeStart, writeEnd);
    expect(writeSection.indexOf("GlobalAlloc")).toBeLessThan(writeSection.indexOf("OpenClipboard"));
    expect(writeSection.indexOf("GlobalLock")).toBeLessThan(writeSection.indexOf("EmptyClipboard"));
    expect(writeSection).toContain("SetClipboardData(CF_UNICODETEXT");
    expect(writeSection).toContain("memory.release()");
  });

  it("exports only the additive async clipboard pair", () => {
    expect(source).toContain(
      'exports.Set("readClipboardTextAsync", Napi::Function::New(env, ReadClipboardTextAsync))',
    );
    expect(source).toContain(
      'exports.Set("writeClipboardTextAsync", Napi::Function::New(env, WriteClipboardTextAsync))',
    );
    expect(source).not.toContain('exports.Set("readClipboardText",');
    expect(source).not.toContain('exports.Set("writeClipboardText",');
  });
});

const loader = require("../../src/native/win.cjs") as {
  available: boolean;
  native: Record<string, unknown> | null;
};
const describeIfNative = loader.available ? describe : describe.skip;

describeIfNative("compiled Windows clipboard ABI", () => {
  it("exports the async pair without touching the live clipboard", () => {
    expect(typeof loader.native!.readClipboardTextAsync).toBe("function");
    expect(typeof loader.native!.writeClipboardTextAsync).toBe("function");
  });
});
```

- [ ] **Etapa 2: Executar o teste de código e verificar RED**

```powershell
cd C:\Users\dev\zcode-cua
pnpm exec vitest run test/native/windows-clipboard.test.ts
```

Esperado: as asserções de código falham porque os workers, as constantes e as exportações não existem.

- [ ] **Etapa 3: Adicionar primitivas de área de transferência do Win32**

Adicione `<algorithm>`, `<chrono>`, `<memory>`, `<thread>` e `<vector>` se ainda não estiverem presentes. Perto do estado global de entrada existente, adicione:

```cpp
constexpr size_t kMaxClipboardUtf16CodeUnits = 8 * 1024 * 1024;
constexpr int kClipboardOpenAttempts = 8;
constexpr DWORD kClipboardOpenRetryDelayMs = 10;
std::timed_mutex g_clipboardMutex;

class ClipboardCloseGuard {
 public:
  ClipboardCloseGuard() : opened_(false) {}
  ClipboardCloseGuard(const ClipboardCloseGuard&) = delete;
  ClipboardCloseGuard& operator=(const ClipboardCloseGuard&) = delete;
  ~ClipboardCloseGuard() {
    if (opened_) CloseClipboard();
  }
  void MarkOpened() { opened_ = true; }

 private:
  bool opened_;
};

struct GlobalMemoryDeleter {
  void operator()(void* memory) const {
    if (memory) GlobalFree(static_cast<HGLOBAL>(memory));
  }
};
using OwnedGlobalMemory = std::unique_ptr<void, GlobalMemoryDeleter>;

bool OpenClipboardBounded(ClipboardCloseGuard* guard) {
  for (int attempt = 0; attempt < kClipboardOpenAttempts; ++attempt) {
    if (OpenClipboard(nullptr)) {
      guard->MarkOpened();
      return true;
    }
    if (attempt + 1 < kClipboardOpenAttempts) {
      Sleep(kClipboardOpenRetryDelayMs);
    }
  }
  return false;
}
```

Use um enum local cuja conversão para string seja exaustiva:

```cpp
enum class ClipboardError {
  kNone,
  kBusy,
  kUnavailable,
  kInvalidData,
  kTooLarge,
  kWriteFailed,
};

const char* ClipboardErrorText(ClipboardError error) {
  switch (error) {
    case ClipboardError::kBusy: return "busy";
    case ClipboardError::kUnavailable: return "unavailable";
    case ClipboardError::kInvalidData: return "invalid_data";
    case ClipboardError::kTooLarge: return "too_large";
    case ClipboardError::kWriteFailed: return "write_failed";
    case ClipboardError::kNone: return "";
  }
  return "unavailable";
}
```

- [ ] **Etapa 4: Implementar conversões estritas e a operação de leitura com limite**

Implemente helpers de conversão com `WC_ERR_INVALID_CHARS` / `MB_ERR_INVALID_CHARS`; nenhum helper pode tocar valores N-API:

```cpp
bool Utf16ToUtf8(const wchar_t* text, size_t length, std::string* out) {
  if (length == 0) {
    out->clear();
    return true;
  }
  if (length > static_cast<size_t>(INT_MAX)) return false;
  int size = WideCharToMultiByte(
      CP_UTF8, WC_ERR_INVALID_CHARS, text, static_cast<int>(length),
      nullptr, 0, nullptr, nullptr);
  if (size <= 0) return false;
  out->resize(static_cast<size_t>(size));
  return WideCharToMultiByte(
             CP_UTF8, WC_ERR_INVALID_CHARS, text, static_cast<int>(length),
             out->data(), size, nullptr, nullptr) == size;
}

bool Utf8ToUtf16(const std::string& text, std::wstring* out) {
  if (text.empty()) {
    out->clear();
    return true;
  }
  if (text.size() > static_cast<size_t>(INT_MAX)) return false;
  int size = MultiByteToWideChar(
      CP_UTF8, MB_ERR_INVALID_CHARS, text.data(), static_cast<int>(text.size()),
      nullptr, 0);
  if (size <= 0) return false;
  out->resize(static_cast<size_t>(size));
  return MultiByteToWideChar(
             CP_UTF8, MB_ERR_INVALID_CHARS, text.data(),
             static_cast<int>(text.size()), out->data(), size) == size;
}
```

A execução do worker de leitura deve seguir esta ordem:

```cpp
void ExecuteReadClipboard(
    ClipboardError* error,
    std::string* text) {
  std::unique_lock<std::timed_mutex> lock(
      g_clipboardMutex, std::defer_lock);
  if (!lock.try_lock_for(std::chrono::milliseconds(250))) {
    *error = ClipboardError::kBusy;
    return;
  }
  ClipboardCloseGuard close_guard;
  if (!OpenClipboardBounded(&close_guard)) {
    *error = ClipboardError::kUnavailable;
    return;
  }
  if (!IsClipboardFormatAvailable(CF_UNICODETEXT)) {
    text->clear();
    return;
  }
  HANDLE handle = GetClipboardData(CF_UNICODETEXT);
  if (!handle) {
    *error = ClipboardError::kInvalidData;
    return;
  }
  SIZE_T bytes = GlobalSize(handle);
  if (
      bytes < sizeof(wchar_t) ||
      bytes % sizeof(wchar_t) != 0) {
    *error = ClipboardError::kInvalidData;
    return;
  }
  const wchar_t* data = static_cast<const wchar_t*>(GlobalLock(handle));
  if (!data) {
    *error = ClipboardError::kInvalidData;
    return;
  }
  const size_t capacity = bytes / sizeof(wchar_t);
  const size_t scan_limit = std::min(
      capacity, kMaxClipboardUtf16CodeUnits + 1);
  size_t length = 0;
  while (length < scan_limit && data[length] != L'\0') ++length;
  if (length == scan_limit) {
    GlobalUnlock(handle);
    *error = capacity > kMaxClipboardUtf16CodeUnits
        ? ClipboardError::kTooLarge
        : ClipboardError::kInvalidData;
    return;
  }
  if (length > kMaxClipboardUtf16CodeUnits) {
    GlobalUnlock(handle);
    *error = ClipboardError::kTooLarge;
    return;
  }
  const bool converted = Utf16ToUtf8(data, length, text);
  GlobalUnlock(handle);
  if (!converted) *error = ClipboardError::kInvalidData;
}
```

Use estes construtores de resultado e o worker:

```cpp
Napi::Object ClipboardReadOutcomeObject(
    Napi::Env env,
    ClipboardError error,
    const std::string& text) {
  Napi::Object outcome = Napi::Object::New(env);
  const bool ok = error == ClipboardError::kNone;
  outcome.Set("ok", Napi::Boolean::New(env, ok));
  if (ok) {
    outcome.Set("text", Napi::String::New(env, text));
  } else {
    outcome.Set("error", Napi::String::New(env, ClipboardErrorText(error)));
  }
  return outcome;
}

class ClipboardReadWorker : public Napi::AsyncWorker {
 public:
  explicit ClipboardReadWorker(Napi::Env env)
      : Napi::AsyncWorker(env, "ClipboardReadWorker"),
        error_(ClipboardError::kNone),
        deferred_(Napi::Promise::Deferred::New(env)) {}

  void Execute() override {
    ExecuteReadClipboard(&error_, &text_);
  }

  void OnOK() override {
    deferred_.Resolve(ClipboardReadOutcomeObject(Env(), error_, text_));
  }

  void OnError(const Napi::Error& /*error*/) override {
    deferred_.Resolve(ClipboardReadOutcomeObject(
        Env(), ClipboardError::kUnavailable, std::string()));
  }

  Napi::Promise Promise() const { return deferred_.Promise(); }

 private:
  ClipboardError error_;
  std::string text_;
  Napi::Promise::Deferred deferred_;
};
```

`OnError()` intencionalmente resolve `unavailable` e nunca expõe uma mensagem de exceção nativa.

- [ ] **Etapa 5: Implementar posse pré-alocada na escrita e pontos de entrada assíncronos**

A execução da escrita deve copiar e alocar antes de `OpenClipboard`:

```cpp
void ExecuteWriteClipboard(
    const std::string& input,
    ClipboardError* error) {
  std::wstring text;
  if (!Utf8ToUtf16(input, &text)) {
    *error = ClipboardError::kWriteFailed;
    return;
  }
  if (text.size() > kMaxClipboardUtf16CodeUnits) {
    *error = ClipboardError::kTooLarge;
    return;
  }
  const size_t units_with_nul = text.size() + 1;
  if (units_with_nul > SIZE_MAX / sizeof(wchar_t)) {
    *error = ClipboardError::kTooLarge;
    return;
  }
  OwnedGlobalMemory memory(
      GlobalAlloc(GMEM_MOVEABLE, units_with_nul * sizeof(wchar_t)));
  if (!memory) {
    *error = ClipboardError::kUnavailable;
    return;
  }
  void* destination = GlobalLock(static_cast<HGLOBAL>(memory.get()));
  if (!destination) {
    *error = ClipboardError::kUnavailable;
    return;
  }
  memcpy(destination, text.c_str(), units_with_nul * sizeof(wchar_t));
  GlobalUnlock(static_cast<HGLOBAL>(memory.get()));

  std::unique_lock<std::timed_mutex> lock(
      g_clipboardMutex, std::defer_lock);
  if (!lock.try_lock_for(std::chrono::milliseconds(250))) {
    *error = ClipboardError::kBusy;
    return;
  }
  ClipboardCloseGuard close_guard;
  if (!OpenClipboardBounded(&close_guard)) {
    *error = ClipboardError::kUnavailable;
    return;
  }
  if (!EmptyClipboard()) {
    *error = ClipboardError::kWriteFailed;
    return;
  }
  if (!SetClipboardData(
          CF_UNICODETEXT,
          static_cast<HGLOBAL>(memory.get()))) {
    *error = ClipboardError::kWriteFailed;
    return;
  }
  memory.release();
}
```

Use o resultado de escrita e o worker abaixo; ele armazena um `std::string` copiado, nunca um `Napi::String`:

```cpp
Napi::Object ClipboardWriteOutcomeObject(
    Napi::Env env,
    ClipboardError error) {
  Napi::Object outcome = Napi::Object::New(env);
  const bool ok = error == ClipboardError::kNone;
  outcome.Set("ok", Napi::Boolean::New(env, ok));
  if (!ok) {
    outcome.Set("error", Napi::String::New(env, ClipboardErrorText(error)));
  }
  return outcome;
}

class ClipboardWriteWorker : public Napi::AsyncWorker {
 public:
  ClipboardWriteWorker(Napi::Env env, std::string input)
      : Napi::AsyncWorker(env, "ClipboardWriteWorker"),
        input_(std::move(input)),
        error_(ClipboardError::kNone),
        deferred_(Napi::Promise::Deferred::New(env)) {}

  void Execute() override {
    ExecuteWriteClipboard(input_, &error_);
  }

  void OnOK() override {
    deferred_.Resolve(ClipboardWriteOutcomeObject(Env(), error_));
  }

  void OnError(const Napi::Error& /*error*/) override {
    deferred_.Resolve(ClipboardWriteOutcomeObject(
        Env(), ClipboardError::kUnavailable));
  }

  Napi::Promise Promise() const { return deferred_.Promise(); }

 private:
  std::string input_;
  ClipboardError error_;
  Napi::Promise::Deferred deferred_;
};
```

Adicione helpers sem lançamento para falha de alocação e os pontos de entrada N-API:

```cpp
Napi::Promise ResolvedClipboardReadFailure(
    Napi::Env env,
    ClipboardError error) {
  Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
  deferred.Resolve(ClipboardReadOutcomeObject(env, error, std::string()));
  return deferred.Promise();
}

Napi::Promise ResolvedClipboardWriteFailure(
    Napi::Env env,
    ClipboardError error) {
  Napi::Promise::Deferred deferred = Napi::Promise::Deferred::New(env);
  deferred.Resolve(ClipboardWriteOutcomeObject(env, error));
  return deferred.Promise();
}

Napi::Value ReadClipboardTextAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto* worker = new (std::nothrow) ClipboardReadWorker(env);
  if (!worker) {
    return ResolvedClipboardReadFailure(
        env, ClipboardError::kUnavailable);
  }
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}

Napi::Value WriteClipboardTextAsync(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() != 1 || !info[0].IsString()) {
    Napi::TypeError::New(
        env, "writeClipboardTextAsync(text) expects one string")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  std::string input = info[0].As<Napi::String>().Utf8Value();
  auto* worker = new (std::nothrow) ClipboardWriteWorker(
      env, std::move(input));
  if (!worker) {
    return ResolvedClipboardWriteFailure(
        env, ClipboardError::kUnavailable);
  }
  Napi::Promise promise = worker->Promise();
  worker->Queue();
  return promise;
}
```

Registre:

```cpp
exports.Set(
    "readClipboardTextAsync",
    Napi::Function::New(env, ReadClipboardTextAsync));
exports.Set(
    "writeClipboardTextAsync",
    Napi::Function::New(env, WriteClipboardTextAsync));
```

Adicione comentários em chinês explicando:

- Causa raiz: a API de área de transferência do Win32 é síncrona e pode ser ocupada brevemente por outros processos, portanto não pode bloquear o thread do broker/N-API.
- Causa raiz: depois que `SetClipboardData` tem sucesso o Windows assume o `HGLOBAL`; nos caminhos anteriores ele ainda é liberado pelo worker, evitando double free ou vazamento.
- Causa raiz: um `wcslen` sem limite passaria além de um bloco de área de transferência malicioso/corrompido, então é obrigatório usar `GlobalSize` como limite superior.

- [ ] **Etapa 6: Reconstruir e verificar o código mais a ABI compilada**

```powershell
cd C:\Users\dev\zcode-cua
pnpm rebuild:native
pnpm exec vitest run test/native/windows-clipboard.test.ts test/windows-native-clipboard-adapter.test.ts test/windows-capability-truthfulness.test.ts
pnpm typecheck
```

Esperado: rebuild exit 0; o addon compilado exporta ambas as funções; os testes não chamam nenhuma das funções contra a área de transferência real.

- [ ] **Etapa 7: Commitar a implementação nativa**

```powershell
git add src/native/ax_win.cc test/native/windows-clipboard.test.ts
git commit -m "feat(windows): implement native text clipboard"
```

---

### Tarefa 4: Adicionar um round-trip real via broker, com opt-in, da área de transferência

**Arquivos:**

- Criar: `C:\Users\dev\zcode-cua\scripts\windows-clipboard-live-smoke.mjs`
- Criar: `C:\Users\dev\zcode-cua\test\windows-clipboard-live-smoke.test.ts`
- Modificar: `C:\Users\dev\zcode-cua\package.json`

**Interfaces:**

- Consome: `dist/windows-helper.js`, `build/Release/ax_native.node`, `PermissionBrokerClient`, named pipe real do Windows.
- Produz: `pnpm smoke:windows:clipboard`.

- [ ] **Etapa 1: Escrever o teste RED desligado por padrão**

Crie `test/windows-clipboard-live-smoke.test.ts`:

```ts
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const scriptUrl = new URL("../scripts/windows-clipboard-live-smoke.mjs", import.meta.url);
const scriptPath = fileURLToPath(scriptUrl);
const source = readFileSync(scriptUrl, "utf8");

describe("Windows clipboard live smoke guard", () => {
  it("checks explicit opt-in before invoking the live run", () => {
    const guard = source.indexOf('process.env[OPT_IN_ENV] !== "1"');
    const invocation = source.indexOf("await runLiveSmoke()");
    expect(guard).toBeGreaterThanOrEqual(0);
    expect(invocation).toBeGreaterThan(guard);
  });

  it("exits 2 without opt-in", async () => {
    try {
      await execFileAsync(process.execPath, [scriptPath], {
        env: {
          SystemRoot: process.env.SystemRoot,
          PATH: process.env.PATH,
        },
      });
      throw new Error("expected disabled smoke to exit non-zero");
    } catch (error) {
      expect(error).toMatchObject({ code: 2 });
      expect(String((error as { stderr?: string }).stderr)).toMatch(/disabled|requires win32/i);
    }
  });
});
```

- [ ] **Etapa 2: Executar o teste focado e verificar RED**

```powershell
cd C:\Users\dev\zcode-cua
pnpm exec vitest run test/windows-clipboard-live-smoke.test.ts
```

Esperado: FAIL porque o script de smoke não existe.

- [ ] **Etapa 3: Implementar o live smoke com restauração incondicional**

Baseie o ciclo de vida, pipe/token aleatório, verificação de prontidão e encerramento limpo em `windows-pointer-live-smoke.mjs`, mas use esta superfície de resumo exata:

```js
const OPT_IN_ENV = "ZCODE_CUA_WINDOWS_CLIPBOARD_LIVE";
const summary = {
  platform: process.platform,
  helperReady: false,
  clipboardCapability: false,
  originalRead: false,
  markerWritten: false,
  markerReadBack: false,
  originalRestored: false,
  restorationVerified: false,
  cleanHelperExit: false,
};
```

O corpo da operação real deve ser:

```js
let originalText;
let markerWritten = false;
try {
  failureStage = "broker-info";
  const brokerInfo = await client.call("broker_info", {});
  summary.clipboardCapability = brokerInfo?.capabilities?.clipboard === true;
  if (!summary.clipboardCapability) {
    throw new Error("native clipboard capability is unavailable");
  }

  failureStage = "read-original";
  originalText = await client.call("read_clipboard", {});
  if (typeof originalText !== "string") {
    throw new Error("original clipboard text was not a string");
  }
  summary.originalRead = true;

  const marker = `zcode-cua-clipboard-smoke-${randomBytes(16).toString("hex")}`;
  failureStage = "write-marker";
  await client.call("write_clipboard", { text: marker });
  markerWritten = true;
  summary.markerWritten = true;

  failureStage = "read-marker";
  const observed = await client.call("read_clipboard", {});
  summary.markerReadBack = observed === marker;
  if (!summary.markerReadBack) {
    throw new Error("clipboard marker did not round-trip");
  }
} finally {
  if (summary.originalRead && typeof originalText === "string") {
    failureStage = "restore-original";
    await client.call("write_clipboard", { text: originalText });
    summary.originalRestored = true;
    const restored = await client.call("read_clipboard", {});
    summary.restorationVerified = restored === originalText;
    if (!summary.restorationVerified) {
      throw new Error("clipboard restoration could not be verified");
    }
  } else if (markerWritten) {
    throw new Error("clipboard marker may remain because the original text was unavailable");
  }
}
```

O `finally` mais externo deve sempre solicitar o encerramento do Helper e verificar exit code 0. O stdout final deve ser apenas `JSON.stringify(summary)`; o stderr pode conter a etapa de falha, mas não o texto original, o marcador, o token ou o pipe. Se a restauração falhar, o stderr deve incluir: `clipboard may still contain the smoke marker`.

Antes de chamar `runLiveSmoke()`:

```js
if (process.platform !== "win32") {
  failPreflight("Windows clipboard live smoke requires win32.");
} else if (process.env[OPT_IN_ENV] !== "1") {
  failPreflight(`Windows clipboard live smoke is disabled; set ${OPT_IN_ENV}=1 to opt in.`);
} else {
  await runLiveSmoke();
}
```

Adicione ao `package.json`:

```json
"smoke:windows:clipboard": "node scripts/windows-clipboard-live-smoke.mjs"
```

- [ ] **Etapa 4: Verificar que o caminho padrão não pode tocar a área de transferência**

```powershell
cd C:\Users\dev\zcode-cua
Remove-Item Env:ZCODE_CUA_WINDOWS_CLIPBOARD_LIVE -ErrorAction SilentlyContinue
pnpm exec vitest run test/windows-clipboard-live-smoke.test.ts
pnpm smoke:windows:clipboard
```

Esperado: Vitest sai com 0; o smoke direto sai com 2 antes de iniciar o Helper e imprime apenas a instrução de opt-in.

- [ ] **Etapa 5: Executar uma vez o live smoke explícito

Avise o usuário imediatamente antes desta etapa que a substituição por texto puro descarta quaisquer formatos de área de transferência não textuais existentes. Então execute:

```powershell
cd C:\Users\dev\zcode-cua
pnpm build
$env:ZCODE_CUA_WINDOWS_CLIPBOARD_LIVE='1'
pnpm smoke:windows:clipboard
Remove-Item Env:ZCODE_CUA_WINDOWS_CLIPBOARD_LIVE
```

Esperado, booleanos JSON: todos os campos exceto `platform` são `true`; exit 0; o texto puro original é restaurado e relido exatamente. Se algum campo for false, interrompa a conclusão do recurso, preserve um registro da etapa de falha com dados censurados e não alegue aceitação real.

- [ ] **Etapa 6: Commitar o smoke**

```powershell
git add scripts/windows-clipboard-live-smoke.mjs test/windows-clipboard-live-smoke.test.ts package.json
git commit -m "test(windows): add clipboard live smoke"
```

---

### Tarefa 5: Atualizar a verdade das plataformas e o runbook de desenvolvimento da origem

**Arquivos:**

- Modificar: `C:\Users\dev\zcode-cua\docs\platforms.md`
- Modificar: `C:\Users\dev\z-code\docs\cua\windows-source-development.md`

**Interfaces:**

- Consome: resultados verificados das Tarefas 1–4.
- Produz: fatos atuais para desenvolvedores e para o fechamento futuro do produto.

- [ ] **Etapa 1: Atualizar `zcode-cua/docs/platforms.md`**

Tire a área de transferência nativa de “capacidade não implementada”. Registre:

```text
O Windows source Helper lê e grava CF_UNICODETEXT por meio da ABI async
aditiva do ax_native.node. broker_info.capabilities.clipboard só é true quando
readClipboardTextAsync e writeClipboardTextAsync existem ao mesmo tempo; com o
addon antigo ou faltando qualquer uma das exportações, continua false. O Helper
usa um timed mutex independente e retentativas limitadas de OpenClipboard, com
teto de 8 Mi code units UTF-16 por texto.
```

Documente o mapeamento de resultados, a ausência de fallback para shell/Electron, a semântica de substituição por texto puro e o comando exato de opt-in. Mantenha WGC e isolamento de workers UIA listados como pendentes.

- [ ] **Etapa 2: Atualizar `z-code/docs/cua/windows-source-development.md`**

Adicione build da origem e verificação real:

```powershell
cd C:\Users\dev\zcode-cua
pnpm rebuild:native
pnpm build
$env:ZCODE_CUA_WINDOWS_CLIPBOARD_LIVE='1'
pnpm smoke:windows:clipboard
Remove-Item Env:ZCODE_CUA_WINDOWS_CLIPBOARD_LIVE
```

Registre estes limites:

- apenas o Helper de origem contínuo do desktop local;
- nenhuma mudança em SSH/WSL/Docker/remoto/móvel;
- nenhuma dependência do gate de pointer em foreground;
- a inicialização em Sessão 0/não interativa continua fail closed;
- a tela de bloqueio não autoriza entrada de pointer, ainda que a mesma sessão logada possa expor a área de transferência;
- o live smoke substitui todos os formatos da área de transferência por texto puro durante o teste e restaura apenas o texto puro;
- o empacotamento/assinatura do produto continua sendo um fechamento posterior.

Adicione os resultados reais de máquina/data/build/teste da Tarefa 4 sem registrar texto, token ou pipe.

- [ ] **Etapa 3: Revisar a documentação contra os fatos de runtime

Execute:

```powershell
rg -n "clipboard|CF_UNICODETEXT|PowerShell|WGC|UIA worker|remote|smoke:windows:clipboard" C:\Users\dev\zcode-cua\docs\platforms.md C:\Users\dev\z-code\docs\cua\windows-source-development.md
```

Esperado: a área de transferência nativa é descrita como implementada apenas para o Helper de origem do Windows; worker WGC/UIA e empacotamento do produto continuam pendentes; nenhuma alegação remota é ampliada.

- [ ] **Etapa 4: Commitar a documentação em seus repositórios de origem**

```powershell
cd C:\Users\dev\zcode-cua
git add docs/platforms.md
git commit -m "docs(windows): record native clipboard support"

cd C:\Users\dev\z-code
git add docs/cua/windows-source-development.md
git commit -m "docs(cua): record Windows clipboard source flow"
```

---

### Tarefa 6: Regenerar artefatos e executar gates de regressão proporcionais

**Arquivos:**

- Modificado pelo gerador: `C:\Users\dev\zcode-cua\dist\**`
- Apenas verificar: os dois worktrees e todos os arquivos das Tarefas 1–5.

**Interfaces:**

- Consome: todos os commits de tarefas anteriores.
- Produz: artefatos distribuíveis de desenvolvimento da origem mais um relatório de gates com evidências.

- [ ] **Etapa 1: Executar todos os gates focados do `zcode-cua`**

```powershell
cd C:\Users\dev\zcode-cua
pnpm rebuild:native
pnpm exec vitest run test/windows-native-clipboard-adapter.test.ts test/windows-capability-truthfulness.test.ts test/native/windows-clipboard.test.ts test/windows-clipboard-live-smoke.test.ts test/broker/windowsSystemSurface.test.ts test/annotations.test.ts test/broker/types.brokerMethods.test.ts test/broker/types.readOnlyMethods.test.ts
pnpm typecheck
pnpm lint
```

Esperado: todos os comandos saem com 0; o lint pode imprimir apenas a baseline de avisos já conhecida, com zero erros.

- [ ] **Etapa 2: Fazer build e executar a suíte completa do `zcode-cua`**

```powershell
cd C:\Users\dev\zcode-cua
pnpm build
pnpm test
```

Esperado: exit 0. Registre as quantidades exatas de passed, skipped e pendentes desta execução em vez de copiar contagens antigas.

- [ ] **Etapa 3: Verificar a integração da origem do ZCode sem caminhos remotos**

```powershell
cd C:\Users\dev\z-code
$env:ZCODE_CUA_DEV_ROOT='C:\Users\dev\zcode-cua'
pnpm exec vitest run packages/services/test/windowsCuaDevHelper.integration.test.ts
pnpm exec vitest run packages/services/test/cua
pnpm --filter @zcode/zcode-cua-plugin test
Remove-Item Env:ZCODE_CUA_DEV_ROOT
pnpm typecheck
pnpm lint
```

Esperado: a integração do Helper, a suíte focada de CUA, o plugin oficial, typecheck e lint saem com 0. Confirme que nenhum processo SSH/WSL/Docker/remoto/móvel foi iniciado.

- [ ] **Etapa 4: Executar e classificar a baseline completa de unidades afetadas do ZCode**

```powershell
cd C:\Users\dev\z-code
pnpm test:unit:affected
```

Esperado: capturar o exit code exato e os nomes de arquivos/testes que falharam. Qualquer falha de CUA, ciclo de vida do Helper, broker, área de transferência, vazamento de processo ou nova falha de tipo/lint bloqueia a conclusão. Falhas de baseline do Windows sem relação com CUA já documentadas podem ser reportadas separadamente, mas não podem ser rotuladas como “aprovado”.

- [ ] **Etapa 5: Verificar mudanças geradas e higiene de processos**

```powershell
cd C:\Users\dev\zcode-cua
git status --short
git diff --check

cd C:\Users\dev\z-code
git status --short
git diff --check

Get-CimInstance Win32_Process |
  Where-Object {
    $_.CommandLine -match 'windows-helper\.js|__zcode-plugin-host'
  } |
  Select-Object ProcessId, ParentProcessId, Name
```

Esperado: `git diff --check` sai com 0; restam apenas mudanças geradas em `zcode-cua/dist/**`; nenhum processo órfão de Helper/plugin-host permanece. Não encerre processos não relacionados do usuário.

- [ ] **Etapa 6: Commitar os artefatos gerados**

```powershell
cd C:\Users\dev\zcode-cua
git add dist
git commit -m "build(windows): regenerate clipboard artifacts"
```

- [ ] **Etapa 7: Auditoria final de árvore limpa e commits**

```powershell
cd C:\Users\dev\zcode-cua
git status --short --branch
git log -5 --oneline

cd C:\Users\dev\z-code
git status --short --branch
git log -3 --oneline
```

Esperado: os dois worktrees limpos. O relatório final deve distinguir:

- os gates de unidade/build da origem;
- o round-trip real da área de transferência e sua restauração;
- a integração do Helper de origem do ZCode;
- a baseline conhecida da suíte completa não-CUA;
- WGC, isolamento de workers UIA e empacotamento/assinatura do produto ainda pendentes;
- aceitação real do pointer ainda pendente se o foreground permanecer `LockApp`.

## Checklist de Auto-Revisão

- [x] Cobertura da spec: cada requisito de ABI, temporização, tamanho, posse, capability, erro, logging, ciclo de vida, plataforma e smoke corresponde a uma tarefa acima.
- [x] Varredura de placeholders: o plano não contém nenhum marcador de implementação adiado; cada etapa que altera código nomeia arquivos, interfaces, comandos e resultados esperados exatos.
- [x] Consistência de tipos: `NativeClipboardReadOutcome` / `NativeClipboardWriteOutcome`, nomes das exportações assíncronas e nomes dos handlers do broker são idênticos nas Tarefas 1–4.
- [x] Limite de plataforma: a seleção do par nativo do Windows está isolada em `createNodeAutomationAdapter`; a superfície de sistema de macOS/Linux e a arquitetura remota/móvel permanecem inalteradas.
- [x] Limite de segurança: o smoke padrão sai antes de iniciar o Helper; o smoke real restaura no `finally`; nenhum conteúdo da área de transferência entra na saída.
- [x] Verdade do produto: 30 ferramentas permanecem inalteradas; WGC/worker UIA/fechamento do produto permanecem explicitamente pendentes.