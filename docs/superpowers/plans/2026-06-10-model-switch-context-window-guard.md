# Plano de Implementação do Guard de Janela de Contexto na Troca de Modelo

> Status (2026-07-15):方案 histórico, substituído pelas decisões da migração do composer
> V4; o guard de "compressão automática antes de trocar de modelo" ainda não foi restaurado.
> A semântica de produto V4 ainda a implementar está em
> `docs/superpowers/specs/2026-06-10-model-switch-context-window-guard-design.md`; os fatos
> da migração estão em `docs/v4-refactor/m5-composer-parity.md` e
> `docs/v4-refactor/m6-model-selection-parity.md`.
> O caminho antigo `ChatView` / `ChatInputToolbar` abaixo serve apenas para rastreabilidade.

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use
> superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para
> implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`)
> para acompanhamento.

**Objetivo:** Impedir trocas de modelo em tarefa ativa quando a janela de contexto do modelo
alvo é menor que o contexto atual da sessão, oferecendo compressão primeiro e só trocando
se a compressão trouxer o uso para dentro da janela alvo.

**Arquitetura:** Adicionar um helper puro de guard de janela de contexto sob o domínio da
barra de ferramentas de input do chat, testá-lo primeiro e então ligá-lo a
`useToolbarModelChange` antes dos ramos existentes de seleção native/custom/local. Reaproveitar
o caminho de envio `/compact` já existente para que as semânticas desktop continuous e
mobile replayable permaneçam inalteradas.

**Stack técnico:** React 19, Zustand, Vitest, TypeScript, componentes de UI existentes do
ZCode, helpers existentes de metadados de model provider.

---

### Estrutura de arquivos

- Criar: `packages/ui/src/chat-input-toolbar/modelSwitchContextWindowGuard.ts`
  - Helpers puros para resolver a janela de contexto do modelo alvo e executar a decisão de
    comprimir antes de trocar.
- Criar: `packages/ui/test/modelSwitchContextWindowGuard.test.ts`
  - Testes unitários do resolver e do fluxo de decisão do guard.
- Modificar: `packages/ui/src/chat-input-toolbar/useToolbarModelChange.ts`
  - Invocar o guard antes de despachar para os ramos existentes de troca de modelo.
- Modificar: `packages/ui/src/chat-input-toolbar/modelChangeActions.ts`
  - Estender `ToolbarModelChangeDependencies` com um callback de compressão opcional.
- Modificar: `packages/ui/src/ChatInputToolbar.tsx`
  - Aceitar e repassar o callback de compressão da troca de modelo.
- Modificar: `packages/ui/src/ChatView/ChatViewComposer.tsx`
  - Aceitar e repassar o callback de compressão da troca de modelo para `ChatInputToolbar`.
- Modificar: `packages/ui/src/hooks/useChatComposer.ts`
  - Expor um callback `/compact` que retorna Promise reutilizando `sendPrompt("/compact", [])`.
- Modificar: `packages/ui/src/ChatView.tsx`
  - Obter o novo callback da ponte do composer e repassá-lo a `ChatViewComposer`.
- Modificar: `packages/ui/src/ConfirmDialog.tsx`
  - Renderizar diálogos de confirmação `warning` com uma ação com estilo de warning.
- Modificar: `packages/ui/src/components/ui/button.tsx`
  - Adicionar uma variant de botão `warning` usando tokens semânticos de warning.
- Modificar: `packages/ui/src/i18n/locales/zh-CN.ts`
  - Adicionar mensagens chinesas do guard de janela de contexto.
- Modificar: `packages/ui/src/i18n/locales/en-US.ts`
  - Adicionar mensagens em inglês do guard de janela de contexto.

---

### Tarefa 1: Adicionar o Resolver de Janela de Contexto

**Arquivos:**
- Criar: `packages/ui/src/chat-input-toolbar/modelSwitchContextWindowGuard.ts`
- Teste: `packages/ui/test/modelSwitchContextWindowGuard.test.ts`

- [ ] **Passo 1: Escrever os testes do resolver que devem falhar**

Crie `packages/ui/test/modelSwitchContextWindowGuard.test.ts` com:

```ts
import { describe, expect, it } from "vitest";
import {
  encodeCustomModelValue,
  type ModelProviderConfig,
  type ZCodeConfigOption,
} from "@zcode/shared";
import { resolveTargetModelContextWindow } from "@/chat-input-toolbar/modelSwitchContextWindowGuard.js";

function createModelOption(
  value: string,
  providerId = "builtin:zai",
): ZCodeConfigOption {
  return {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "builtin:zai/glm-4.7",
    options: [
      {
        value,
        name: value,
        modelProviderId: providerId,
        modelProviderName: providerId,
      },
    ],
  };
}

function createProvider(): ModelProviderConfig {
  return {
    id: "builtin:zai",
    name: "Z.AI",
    type: "builtin",
    enabled: true,
    apiKey: "",
    endpoints: {
      baseURL: "https://api.z.ai/api/anthropic",
      paths: { anthropic: "/v1/messages" },
    },
    models: [
      {
        id: "glm-4.7",
        name: "GLM 4.7",
        kinds: ["anthropic"],
        modalities: { input: ["text"], output: ["text"] },
        contextWindow: 128_000,
      },
      {
        id: "glm-5",
        name: "GLM 5",
        kinds: ["anthropic"],
        modelIdByKind: { anthropic: "glm-5-runtime" },
        modalities: { input: ["text"], output: ["text"] },
        contextWindow: 200_000,
      },
      "legacy-model",
      "wide-model[1m]",
    ],
  };
}

describe("resolveTargetModelContextWindow", () => {
  it("resolves native model metadata context window", () => {
    const result = resolveTargetModelContextWindow({
      modelProviders: [createProvider()],
      option: createModelOption("builtin:zai/glm-4.7"),
      selectedProvider: "glm",
      value: "builtin:zai/glm-4.7",
    });

    expect(result).toEqual({
      contextWindow: 128_000,
      modelId: "glm-4.7",
      providerId: "builtin:zai",
    });
  });

  it("resolves custom model metadata context window", () => {
    const result = resolveTargetModelContextWindow({
      modelProviders: [createProvider()],
      option: createModelOption(encodeCustomModelValue("builtin:zai", "glm-4.7")),
      selectedProvider: "glm",
      value: encodeCustomModelValue("builtin:zai", "glm-4.7"),
    });

    expect(result?.contextWindow).toBe(128_000);
    expect(result?.providerId).toBe("builtin:zai");
    expect(result?.modelId).toBe("glm-4.7");
  });

  it("matches runtime modelIdByKind values back to source metadata", () => {
    const result = resolveTargetModelContextWindow({
      modelProviders: [createProvider()],
      option: createModelOption("builtin:zai/glm-5-runtime"),
      selectedProvider: "glm",
      value: "builtin:zai/glm-5-runtime",
    });

    expect(result?.contextWindow).toBe(200_000);
    expect(result?.modelId).toBe("glm-5");
  });

  it("uses legacy fallback for string model entries that exist in provider metadata", () => {
    const result = resolveTargetModelContextWindow({
      modelProviders: [createProvider()],
      option: createModelOption("builtin:zai/legacy-model"),
      selectedProvider: "glm",
      value: "builtin:zai/legacy-model",
    });

    expect(result?.contextWindow).toBe(200_000);
    expect(result?.modelId).toBe("legacy-model");
  });

  it("uses one million context for [1m] string model entries", () => {
    const result = resolveTargetModelContextWindow({
      modelProviders: [createProvider()],
      option: createModelOption("builtin:zai/wide-model[1m]"),
      selectedProvider: "glm",
      value: "builtin:zai/wide-model[1m]",
    });

    expect(result?.contextWindow).toBe(1_000_000);
  });

  it("returns null when no provider metadata can identify the model", () => {
    const result = resolveTargetModelContextWindow({
      modelProviders: [],
      option: createModelOption("unknown/unknown-model", "unknown"),
      selectedProvider: "glm",
      value: "unknown/unknown-model",
    });

    expect(result).toBeNull();
  });
});
```

- [ ] **Passo 2: Rodar os testes do resolver para verificar o RED**

Execute:

```bash
pnpm exec vitest run packages/ui/test/modelSwitchContextWindowGuard.test.ts
```

Esperado: FAIL porque `@/chat-input-toolbar/modelSwitchContextWindowGuard.js` não existe.

- [ ] **Passo 3: Implementar o helper do resolver**

Crie `packages/ui/src/chat-input-toolbar/modelSwitchContextWindowGuard.ts`:

```ts
import {
  isModelProviderModelConfig,
  resolveModelProviderContextWindow,
  type ModelProviderConfig,
  type ModelProviderModelEntry,
  type ZCodeConfigOption,
  type ZCodeProvider,
} from "@zcode/shared";
import { decodeCustomModelValue } from "@/lib/zcodeCustomModelValue.js";

export interface TargetModelContextWindow {
  contextWindow: number;
  modelId: string;
  providerId: string;
}

export interface ResolveTargetModelContextWindowParams {
  modelProviders: readonly ModelProviderConfig[];
  option: ZCodeConfigOption;
  selectedProvider: ZCodeProvider;
  value: string;
}

function normalizeModelId(value: string): string {
  return value.trim().toLowerCase();
}

function stripVariant(value: string): string {
  const trimmed = value.trim();
  const colonIndex = trimmed.lastIndexOf(":");
  return colonIndex > 0 ? trimmed.slice(0, colonIndex) : trimmed;
}

function modelIdCandidates(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }

  const candidates = new Set<string>([trimmed, stripVariant(trimmed)]);
  const slashIndex = trimmed.indexOf("/");
  if (slashIndex > 0 && slashIndex < trimmed.length - 1) {
    const afterSlash = trimmed.slice(slashIndex + 1);
    candidates.add(afterSlash);
    candidates.add(stripVariant(afterSlash));
  }

  return [...candidates].filter(Boolean);
}

function resolveOptionProviderId(option: ZCodeConfigOption, value: string): string | null {
  if (option.type !== "select") {
    return null;
  }
  const selected = option.options?.find((entry) => entry.value === value);
  return selected?.modelProviderId?.trim() || null;
}

function findProvider(
  modelProviders: readonly ModelProviderConfig[],
  providerId: string | null,
  selectedProvider: ZCodeProvider,
): ModelProviderConfig | null {
  if (providerId) {
    const exact = modelProviders.find((provider) => provider.id === providerId);
    if (exact) {
      return exact;
    }
  }

  return modelProviders.find((provider) => provider.id === selectedProvider) ?? null;
}

function modelEntryMatches(entry: ModelProviderModelEntry, candidate: string): boolean {
  const normalizedCandidate = normalizeModelId(candidate);
  if (typeof entry === "string") {
    return normalizeModelId(entry) === normalizedCandidate;
  }

  if (normalizeModelId(entry.id) === normalizedCandidate) {
    return true;
  }

  return Object.values(entry.modelIdByKind ?? {}).some(
    (runtimeModelId) => normalizeModelId(runtimeModelId ?? "") === normalizedCandidate,
  );
}

function resolveModelEntryContextWindow(
  provider: ModelProviderConfig,
  candidates: readonly string[],
): TargetModelContextWindow | null {
  for (const candidate of candidates) {
    const entry = provider.models.find((model) => modelEntryMatches(model, candidate));
    if (!entry) {
      continue;
    }

    if (isModelProviderModelConfig(entry)) {
      return {
        contextWindow: resolveModelProviderContextWindow(entry.id, entry.contextWindow),
        modelId: entry.id.trim(),
        providerId: provider.id,
      };
    }

    const modelId = entry.trim();
    return {
      contextWindow: resolveModelProviderContextWindow(modelId, undefined),
      modelId,
      providerId: provider.id,
    };
  }

  return null;
}

export function resolveTargetModelContextWindow(
  params: ResolveTargetModelContextWindowParams,
): TargetModelContextWindow | null {
  if (params.option.category !== "model" || params.option.type !== "select") {
    return null;
  }

  const customSelection = decodeCustomModelValue(params.value);
  if (customSelection) {
    const provider = findProvider(
      params.modelProviders,
      customSelection.providerId,
      params.selectedProvider,
    );
    if (!provider) {
      return null;
    }
    return resolveModelEntryContextWindow(
      provider,
      customSelection.modelName ? [customSelection.modelName] : [],
    );
  }

  const provider = findProvider(
    params.modelProviders,
    resolveOptionProviderId(params.option, params.value),
    params.selectedProvider,
  );
  if (!provider) {
    return null;
  }

  return resolveModelEntryContextWindow(provider, modelIdCandidates(params.value));
}
```

- [ ] **Passo 4: Rodar os testes do resolver para verificar o GREEN**

Execute:

```bash
pnpm exec vitest run packages/ui/test/modelSwitchContextWindowGuard.test.ts
```

Esperado: PASS em todos os testes do resolver.

- [ ] **Passo 5: Commitar o helper do resolver**

```bash
git add packages/ui/src/chat-input-toolbar/modelSwitchContextWindowGuard.ts packages/ui/test/modelSwitchContextWindowGuard.test.ts
git commit -m "test: add model switch context window resolver"
```

---

### Tarefa 2: Adicionar o Executor da Decisão do Guard

**Arquivos:**
- Modificar: `packages/ui/src/chat-input-toolbar/modelSwitchContextWindowGuard.ts`
- Teste: `packages/ui/test/modelSwitchContextWindowGuard.test.ts`

- [ ] **Passo 1: Adicionar os testes que devem falhar da decisão do guard**

Acrescente a `packages/ui/test/modelSwitchContextWindowGuard.test.ts`:

```ts
import { runModelSwitchContextWindowGuard } from "@/chat-input-toolbar/modelSwitchContextWindowGuard.js";

describe("runModelSwitchContextWindowGuard", () => {
  it("proceeds immediately when current usage fits the target window", async () => {
    const confirmCompression = vi.fn().mockResolvedValue(true);
    const runCompression = vi.fn().mockResolvedValue(true);

    await expect(
      runModelSwitchContextWindowGuard({
        confirmCompression,
        currentUsed: 64_000,
        isTaskBusy: false,
        notifyCompressionStillTooLarge: vi.fn(),
        notifyRunningBlocked: vi.fn(),
        readContextUsedAfterCompression: vi.fn(),
        runCompression,
        targetContextWindow: 128_000,
      }),
    ).resolves.toBe("proceed");

    expect(confirmCompression).not.toHaveBeenCalled();
    expect(runCompression).not.toHaveBeenCalled();
  });

  it("cancels and reports running task when compression is required but task is busy", async () => {
    const notifyRunningBlocked = vi.fn();

    await expect(
      runModelSwitchContextWindowGuard({
        confirmCompression: vi.fn().mockResolvedValue(true),
        currentUsed: 200_001,
        isTaskBusy: true,
        notifyCompressionStillTooLarge: vi.fn(),
        notifyRunningBlocked,
        readContextUsedAfterCompression: vi.fn(),
        runCompression: vi.fn().mockResolvedValue(true),
        targetContextWindow: 200_000,
      }),
    ).resolves.toBe("cancel");

    expect(notifyRunningBlocked).toHaveBeenCalledTimes(1);
  });

  it("cancels when user rejects compression", async () => {
    const runCompression = vi.fn().mockResolvedValue(true);

    await expect(
      runModelSwitchContextWindowGuard({
        confirmCompression: vi.fn().mockResolvedValue(false),
        currentUsed: 200_001,
        isTaskBusy: false,
        notifyCompressionStillTooLarge: vi.fn(),
        notifyRunningBlocked: vi.fn(),
        readContextUsedAfterCompression: vi.fn(),
        runCompression,
        targetContextWindow: 200_000,
      }),
    ).resolves.toBe("cancel");

    expect(runCompression).not.toHaveBeenCalled();
  });

  it("proceeds after confirmed compression brings usage under target window", async () => {
    await expect(
      runModelSwitchContextWindowGuard({
        confirmCompression: vi.fn().mockResolvedValue(true),
        currentUsed: 200_001,
        isTaskBusy: false,
        notifyCompressionStillTooLarge: vi.fn(),
        notifyRunningBlocked: vi.fn(),
        readContextUsedAfterCompression: vi.fn(() => 128_000),
        runCompression: vi.fn().mockResolvedValue(true),
        targetContextWindow: 200_000,
      }),
    ).resolves.toBe("proceed");
  });

  it("cancels after compression when usage is still above target window", async () => {
    const notifyCompressionStillTooLarge = vi.fn();

    await expect(
      runModelSwitchContextWindowGuard({
        confirmCompression: vi.fn().mockResolvedValue(true),
        currentUsed: 250_000,
        isTaskBusy: false,
        notifyCompressionStillTooLarge,
        notifyRunningBlocked: vi.fn(),
        readContextUsedAfterCompression: vi.fn(() => 210_000),
        runCompression: vi.fn().mockResolvedValue(true),
        targetContextWindow: 200_000,
      }),
    ).resolves.toBe("cancel");

    expect(notifyCompressionStillTooLarge).toHaveBeenCalledTimes(1);
  });

  it("cancels when compression fails or does not confirm latest usage", async () => {
    await expect(
      runModelSwitchContextWindowGuard({
        confirmCompression: vi.fn().mockResolvedValue(true),
        currentUsed: 250_000,
        isTaskBusy: false,
        notifyCompressionStillTooLarge: vi.fn(),
        notifyRunningBlocked: vi.fn(),
        readContextUsedAfterCompression: vi.fn(() => 128_000),
        runCompression: vi.fn().mockResolvedValue(false),
        targetContextWindow: 200_000,
      }),
    ).resolves.toBe("cancel");

    const notifyCompressionStillTooLarge = vi.fn();
    await expect(
      runModelSwitchContextWindowGuard({
        confirmCompression: vi.fn().mockResolvedValue(true),
        currentUsed: 250_000,
        isTaskBusy: false,
        notifyCompressionStillTooLarge,
        notifyRunningBlocked: vi.fn(),
        readContextUsedAfterCompression: vi.fn(() => null),
        runCompression: vi.fn().mockResolvedValue(true),
        targetContextWindow: 200_000,
      }),
    ).resolves.toBe("cancel");

    expect(notifyCompressionStillTooLarge).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Passo 2: Rodar os testes do guard para verificar o RED**

Execute:

```bash
pnpm exec vitest run packages/ui/test/modelSwitchContextWindowGuard.test.ts
```

Esperado: FAIL porque `runModelSwitchContextWindowGuard` não é exportado.

- [ ] **Passo 3: Implementar o executor do guard**

Acrescente a `packages/ui/src/chat-input-toolbar/modelSwitchContextWindowGuard.ts`:

```ts
export type ModelSwitchContextWindowGuardResult = "proceed" | "cancel";

export interface RunModelSwitchContextWindowGuardParams {
  confirmCompression: () => Promise<boolean>;
  currentUsed: number;
  isTaskBusy: boolean;
  notifyCompressionStillTooLarge: () => void;
  notifyRunningBlocked: () => void;
  readContextUsedAfterCompression: () => number | null;
  runCompression: () => Promise<boolean>;
  targetContextWindow: number;
}

export async function runModelSwitchContextWindowGuard(
  params: RunModelSwitchContextWindowGuardParams,
): Promise<ModelSwitchContextWindowGuardResult> {
  if (params.currentUsed <= params.targetContextWindow) {
    return "proceed";
  }

  if (params.isTaskBusy) {
    params.notifyRunningBlocked();
    return "cancel";
  }

  const confirmed = await params.confirmCompression();
  if (!confirmed) {
    return "cancel";
  }

  const compressed = await params.runCompression();
  if (!compressed) {
    return "cancel";
  }

  const nextUsed = params.readContextUsedAfterCompression();
  if (typeof nextUsed === "number" && Number.isFinite(nextUsed) && nextUsed > 0) {
    if (nextUsed <= params.targetContextWindow) {
      return "proceed";
    }
  }

  params.notifyCompressionStillTooLarge();
  return "cancel";
}
```

- [ ] **Passo 4: Rodar os testes do guard para verificar o GREEN**

Execute:

```bash
pnpm exec vitest run packages/ui/test/modelSwitchContextWindowGuard.test.ts
```

Esperado: PASS nos testes do resolver e do executor do guard.

- [ ] **Passo 5: Commitar o executor do guard**

```bash
git add packages/ui/src/chat-input-toolbar/modelSwitchContextWindowGuard.ts packages/ui/test/modelSwitchContextWindowGuard.test.ts
git commit -m "test: add model switch context guard runner"
```

---

### Tarefa 3: Expor um Callback `/compact` Baseado em Promise

**Arquivos:**
- Modificar: `packages/ui/src/hooks/useChatComposer.ts`
- Modificar: `packages/ui/src/ChatView.tsx`
- Modificar: `packages/ui/src/ChatView/ChatViewComposer.tsx`
- Modificar: `packages/ui/src/ChatInputToolbar.tsx`
- Modificar: `packages/ui/src/chat-input-toolbar/modelChangeActions.ts`

- [ ] **Passo 1: Escrever o teste de callback orientado a tipos que deve falhar**

Acrescente este teste de uso em tempo de compilação a
`packages/ui/test/modelSwitchContextWindowGuard.test.ts`:

```ts
import type { ToolbarModelChangeDependencies } from "@/chat-input-toolbar/modelChangeActions.js";

describe("ToolbarModelChangeDependencies compression callback", () => {
  it("accepts a promise-returning compression callback for model switch guard", async () => {
    const deps = {
      onRequestContextCompressionForModelSwitch: async () => true,
    } satisfies Partial<ToolbarModelChangeDependencies>;

    await expect(deps.onRequestContextCompressionForModelSwitch?.()).resolves.toBe(true);
  });
});
```

- [ ] **Passo 2: Rodar o teste de tipo do callback para verificar o RED**

Execute:

```bash
pnpm typecheck
```

Esperado: FAIL porque `onRequestContextCompressionForModelSwitch` não faz parte de
`ToolbarModelChangeDependencies`.

- [ ] **Passo 3: Estender as dependências de troca de modelo**

Modifique `packages/ui/src/chat-input-toolbar/modelChangeActions.ts`, dentro de
`ToolbarModelChangeDependencies`:

```ts
  onRequestContextCompressionForModelSwitch?: () => Promise<boolean>;
```

- [ ] **Passo 4: Expor o callback a partir do hook do composer**

Em `packages/ui/src/hooks/useChatComposer.ts`, adicione ao lado de
`handleSendContextCompressionCommand`:

```ts
  const handleRequestContextCompressionForModelSwitch = useCallback(async () => {
    // 修复原因：模型切换 guard 的压缩必须复用现有 `/compact` 控制命令路径，
    // 才能保留 timeline 横条、desktop continuous 与手机 replayable 路由语义。
    return sendPrompt("/compact", []);
  }, [sendPrompt]);
```

Retorne-o do resultado do hook, perto de `handleSendContextCompressionCommand`:

```ts
    handleRequestContextCompressionForModelSwitch,
```

- [ ] **Passo 5: Passar o callback pelo ChatView e pelo composer**

Em `packages/ui/src/ChatView.tsx`, desestruture o novo callback de
`useChatViewComposerBridge`:

```ts
    handleRequestContextCompressionForModelSwitch,
```

Passe-o para `ChatViewComposer`:

```tsx
            handleRequestContextCompressionForModelSwitch={
              handleRequestContextCompressionForModelSwitch
            }
```

Em `packages/ui/src/ChatView/ChatViewComposer.tsx`, adicione a prop à desestruturação e ao
tipo:

```ts
  handleRequestContextCompressionForModelSwitch,
```

```ts
  handleRequestContextCompressionForModelSwitch: () => Promise<boolean>;
```

Passe-o para `ChatInputToolbar`:

```tsx
          onRequestContextCompressionForModelSwitch={
            handleRequestContextCompressionForModelSwitch
          }
```

Em `packages/ui/src/ChatInputToolbar.tsx`, adicione o tipo da prop:

```ts
  onRequestContextCompressionForModelSwitch?: () => Promise<boolean>;
```

Desestruture-a e passe-a para `useToolbarModelChange`:

```ts
    onRequestContextCompressionForModelSwitch,
```

- [ ] **Passo 6: Rodar o teste do callback para verificar o GREEN**

Execute:

```bash
pnpm typecheck
pnpm exec vitest run packages/ui/test/modelSwitchContextWindowGuard.test.ts
```

Esperado: os dois comandos passam.

- [ ] **Passo 7: Commitar a passagem do callback**

```bash
git add packages/ui/src/hooks/useChatComposer.ts packages/ui/src/ChatView.tsx packages/ui/src/ChatView/ChatViewComposer.tsx packages/ui/src/ChatInputToolbar.tsx packages/ui/src/chat-input-toolbar/modelChangeActions.ts packages/ui/test/modelSwitchContextWindowGuard.test.ts
git commit -m "feat: expose compact callback for guarded model switch"
```

---

### Tarefa 4: Adicionar Mensagens de UI e Estilo do Diálogo de Warning

**Arquivos:**
- Modificar: `packages/ui/src/components/ui/button.tsx`
- Modificar: `packages/ui/src/ConfirmDialog.tsx`
- Modificar: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modificar: `packages/ui/src/i18n/locales/en-US.ts`

- [ ] **Passo 1: Adicionar o teste de chaves i18n que deve falhar**

Acrescente a `packages/ui/test/modelSwitchContextWindowGuard.test.ts`:

```ts
import zhCN from "@/i18n/locales/zh-CN.js";
import enUS from "@/i18n/locales/en-US.js";

describe("model switch context window guard i18n", () => {
  it("defines localized dialog and toast messages", () => {
    for (const messages of [zhCN, enUS]) {
      expect(messages["chat.modelSwitch.contextWindowGuard.title"]).toBeTruthy();
      expect(messages["chat.modelSwitch.contextWindowGuard.description"]).toContain("{used}");
      expect(messages["chat.modelSwitch.contextWindowGuard.compress"]).toBeTruthy();
      expect(messages["chat.modelSwitch.contextWindowGuard.runningBlocked"]).toBeTruthy();
      expect(messages["chat.modelSwitch.contextWindowGuard.stillTooLarge"]).toBeTruthy();
    }
  });
});
```

- [ ] **Passo 2: Rodar o teste i18n para verificar o RED**

Execute:

```bash
pnpm exec vitest run packages/ui/test/modelSwitchContextWindowGuard.test.ts
```

Esperado: FAIL porque as novas chaves i18n estão faltando.

- [ ] **Passo 3: Adicionar a variant de botão warning**

Em `packages/ui/src/components/ui/button.tsx`, adicione esta entrada de `variant`:

```ts
        warning:
          "bg-warning text-warning-foreground hover:bg-warning/90 focus-visible:border-warning/40 focus-visible:ring-warning/20 aria-expanded:bg-warning aria-expanded:text-warning-foreground",
```

- [ ] **Passo 4: Usar a variant warning no ConfirmDialogHost**

Em `packages/ui/src/ConfirmDialog.tsx`, adicione:

```ts
  const confirmVariant =
    variant === "danger" ? "destructive" : variant === "warning" ? "warning" : "default";
```

Substitua a variant do botão de confirmação:

```tsx
            variant={confirmVariant}
```

Substitua o ramo de cor da dica de teclado por:

```tsx
                variant === "danger" || variant === "warning"
                  ? "text-foreground-subtle"
                  : "text-primary-foreground/60",
```

- [ ] **Passo 5: Adicionar as mensagens localizadas**

Em `packages/ui/src/i18n/locales/zh-CN.ts`, adicione perto das chaves existentes
`chat.toolbar.modelSwitch.*`:

```ts
  "chat.modelSwitch.contextWindowGuard.title": "需要压缩上下文后再切换模型",
  "chat.modelSwitch.contextWindowGuard.description":
    "当前会话已使用 {used} tokens，上下文窗口已超过目标模型 {modelName} 的 {target} tokens。\n请先使用当前模型压缩上下文。压缩完成且上下文用量小于目标模型窗口后，会继续切换模型。",
  "chat.modelSwitch.contextWindowGuard.compress": "压缩",
  "chat.modelSwitch.contextWindowGuard.runningBlocked":
    "目标模型的上下文窗口小于当前会话已使用的上下文，需要先压缩当前会话后才能切换。但当前任务正在运行，无法执行上下文压缩。请等待任务结束后再切换模型。",
  "chat.modelSwitch.contextWindowGuard.stillTooLarge":
    "压缩完成后，当前会话已使用的上下文仍大于目标模型的上下文窗口，模型切换已取消。",
```

Em `packages/ui/src/i18n/locales/en-US.ts`, adicione:

```ts
  "chat.modelSwitch.contextWindowGuard.title": "Compress context before switching models",
  "chat.modelSwitch.contextWindowGuard.description":
    "This conversation has used {used} tokens, which exceeds {modelName}'s context window of {target} tokens.\nCompress the current conversation with the current model first. If the compressed context fits, ZCode will continue switching models.",
  "chat.modelSwitch.contextWindowGuard.compress": "Compress",
  "chat.modelSwitch.contextWindowGuard.runningBlocked":
    "The target model's context window is smaller than the context already used by this conversation. The conversation must be compressed before switching models, but the current task is still running and context compression cannot run now. Wait for the task to finish, then switch models again.",
  "chat.modelSwitch.contextWindowGuard.stillTooLarge":
    "After compression, the context used by this conversation is still larger than the target model's context window. Model switching was canceled.",
```

- [ ] **Passo 6: Rodar o teste i18n para verificar o GREEN**

Execute:

```bash
pnpm exec vitest run packages/ui/test/modelSwitchContextWindowGuard.test.ts
```

Esperado: PASS.

- [ ] **Passo 7: Commitar o suporte de mensagens de UI**

```bash
git add packages/ui/src/components/ui/button.tsx packages/ui/src/ConfirmDialog.tsx packages/ui/src/i18n/locales/zh-CN.ts packages/ui/src/i18n/locales/en-US.ts packages/ui/test/modelSwitchContextWindowGuard.test.ts
git commit -m "feat(ui): add model switch context guard messages"
```

---

### Tarefa 5: Ligar o Guard à Seleção de Modelo

**Arquivos:**
- Modificar: `packages/ui/src/chat-input-toolbar/useToolbarModelChange.ts`

- [ ] **Passo 1: Adicionar o teste de integração do guard que deve passar/falhar**

Acrescente a `packages/ui/test/modelSwitchContextWindowGuard.test.ts`:

```ts
import { runModelSwitchContextWindowGuard } from "@/chat-input-toolbar/modelSwitchContextWindowGuard.js";

describe("model switch guard integration contract", () => {
  it("requires a compression callback before a guarded switch can proceed", async () => {
    await expect(
      runModelSwitchContextWindowGuard({
        confirmCompression: vi.fn().mockResolvedValue(true),
        currentUsed: 250_000,
        isTaskBusy: false,
        notifyCompressionStillTooLarge: vi.fn(),
        notifyRunningBlocked: vi.fn(),
        readContextUsedAfterCompression: vi.fn(() => 100_000),
        runCompression: vi.fn().mockResolvedValue(false),
        targetContextWindow: 200_000,
      }),
    ).resolves.toBe("cancel");
  });
});
```

Execute:

```bash
pnpm exec vitest run packages/ui/test/modelSwitchContextWindowGuard.test.ts
```

Esperado: já PASS, porque a Tarefa 2 implementou este contrato. Este é um teste de
caracterização intencional antes da ligação.

- [ ] **Passo 2: Extrair o despacho dos ramos existentes para um helper local**

Em `packages/ui/src/chat-input-toolbar/useToolbarModelChange.ts`, dentro do callback
retornado, crie esta função local antes de qualquer await do guard:

```ts
      const runExistingModelSelection = () => {
        if (
          shouldSwitchNativeModelFromCustomSelection(
            selectedProvider,
            option,
            value,
            selectedSupplierKey,
          )
        ) {
          handleNativeModelSelection(
            params,
            option,
            value,
            nextModelLabel,
            modelChangeNotice,
          );
          return;
        }
        if (decodeCustomModelValue(value)) {
          handleCustomProviderSelection(
            params,
            option,
            value,
            nextModelLabel,
            modelChangeNotice,
          );
          return;
        }
        handleLocalOrTaskSelection(
          params,
          option,
          value,
          nextModelLabel,
          modelChangeNotice,
        );
      };
```

Substitua as chamadas de ramos duplicados existentes no fim do callback por:

```ts
      runExistingModelSelection();
```

- [ ] **Passo 3: Importar as dependências do guard**

No topo de `useToolbarModelChange.ts`, adicione:

```ts
import { toast } from "@/components/ui/toast.js";
import { useConfirmDialog } from "@/hooks/useConfirmDialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { isTaskRuntimeBusy } from "@/lib/zcodeTaskRuntimeMonitorTypes.js";
import { getTaskRuntimeState, useZCodeSessionStore } from "@/store/zcodeSessionStore.js";
import {
  resolveTargetModelContextWindow,
  runModelSwitchContextWindowGuard,
} from "./modelSwitchContextWindowGuard.js";
```

Remova a linha de import duplicada existente de `useZCodeSessionStore`, se necessário, para
que o arquivo o importe apenas uma vez.

- [ ] **Passo 4: Inicializar os hooks de diálogo e de formatação**

Dentro de `useToolbarModelChange`, antes do `useCallback` retornado, adicione:

```ts
  const { intl, locale } = useZCodeIntl();
  const confirmDialog = useConfirmDialog();
  const numberFormatter = new Intl.NumberFormat(locale);
```

- [ ] **Passo 5: Rodar o guard antes do despacho da seleção existente**

Dentro do callback retornado, depois que `modelChangeNotice` e `runExistingModelSelection`
estiverem disponíveis, adicione:

```ts
      const targetContext = resolveTargetModelContextWindow({
        modelProviders,
        option,
        selectedProvider,
        value,
      });

      if (params.taskId && targetContext) {
        const workspaceState = useZCodeSessionStore
          .getState()
          .getWorkspaceState(params.workspacePath, params.workspaceIdentity);
        const taskRuntime = getTaskRuntimeState(workspaceState, params.taskId);
        const currentUsed = taskRuntime.usage?.used;
        if (
          typeof currentUsed === "number" &&
          Number.isFinite(currentUsed) &&
          currentUsed > 0 &&
          currentUsed > targetContext.contextWindow
        ) {
          void (async () => {
            const decision = await runModelSwitchContextWindowGuard({
              confirmCompression: () =>
                confirmDialog({
                  title: intl.formatMessage({
                    id: "chat.modelSwitch.contextWindowGuard.title",
                  }),
                  description: intl.formatMessage(
                    { id: "chat.modelSwitch.contextWindowGuard.description" },
                    {
                      modelName: nextModelLabel?.trim() || targetContext.modelId,
                      target: numberFormatter.format(targetContext.contextWindow),
                      used: numberFormatter.format(currentUsed),
                    },
                  ),
                  confirmLabel: intl.formatMessage({
                    id: "chat.modelSwitch.contextWindowGuard.compress",
                  }),
                  cancelLabel: intl.formatMessage({ id: "common.cancel" }),
                  variant: "warning",
                }),
              currentUsed,
              isTaskBusy: isTaskRuntimeBusy(taskRuntime.status),
              notifyCompressionStillTooLarge: () => {
                toast(
                  intl.formatMessage({
                    id: "chat.modelSwitch.contextWindowGuard.stillTooLarge",
                  }),
                );
              },
              notifyRunningBlocked: () => {
                toast(
                  intl.formatMessage({
                    id: "chat.modelSwitch.contextWindowGuard.runningBlocked",
                  }),
                );
              },
              readContextUsedAfterCompression: () => {
                const latestWorkspaceState = useZCodeSessionStore
                  .getState()
                  .getWorkspaceState(params.workspacePath, params.workspaceIdentity);
                const latestUsage = getTaskRuntimeState(
                  latestWorkspaceState,
                  params.taskId!,
                ).usage;
                return typeof latestUsage?.used === "number" &&
                  Number.isFinite(latestUsage.used) &&
                  latestUsage.used > 0
                  ? latestUsage.used
                  : null;
              },
              runCompression: async () =>
                params.onRequestContextCompressionForModelSwitch?.() ?? false,
              targetContextWindow: targetContext.contextWindow,
            });
            if (decision === "proceed") {
              runExistingModelSelection();
            }
          })();
          return;
        }
      }
```

Mantenha o `runExistingModelSelection();` final existente para os casos sem guard.

- [ ] **Passo 6: Rodar os testes focados**

Execute:

```bash
pnpm exec vitest run packages/ui/test/modelSwitchContextWindowGuard.test.ts packages/ui/test/modelChangeActions.test.ts
```

Esperado: PASS.

- [ ] **Passo 7: Commitar a ligação do guard**

```bash
git add packages/ui/src/chat-input-toolbar/useToolbarModelChange.ts packages/ui/test/modelSwitchContextWindowGuard.test.ts
git commit -m "feat(ui): guard model switch by context window"
```

---

### Tarefa 6: Verificação Completa

**Arquivos:**
- Nenhum arquivo de produção esperado, a menos que a verificação exponha um bug.

- [ ] **Passo 1: Rodar os testes de UI focados**

Execute:

```bash
pnpm exec vitest run packages/ui/test/modelSwitchContextWindowGuard.test.ts packages/ui/test/modelChangeActions.test.ts packages/ui/test/chatInputToolbarModelGroups.test.ts
```

Esperado: PASS.

- [ ] **Passo 2: Rodar o typecheck obrigatório**

Execute:

```bash
pnpm typecheck
```

Esperado: PASS.

- [ ] **Passo 3: Rodar o lint obrigatório**

Execute:

```bash
pnpm lint
```

Esperado: PASS.

- [ ] **Passo 4: Inspecionar o git diff**

Execute:

```bash
git diff --stat
git diff -- packages/ui/src/chat-input-toolbar/modelSwitchContextWindowGuard.ts packages/ui/src/chat-input-toolbar/useToolbarModelChange.ts packages/ui/src/hooks/useChatComposer.ts packages/ui/src/ChatInputToolbar.tsx packages/ui/src/ChatView.tsx packages/ui/src/ChatView/ChatViewComposer.tsx
```

Esperado: o diff se limita ao guard de janela de contexto, à passagem do callback, ao estilo
do diálogo, aos i18n e aos testes.

- [ ] **Passo 5: Commitar correções de verificação, se houver**

Se a verificação exigir correções, commite-as:

```bash
git add <fixed-files>
git commit -m "fix(ui): stabilize model switch context guard"
```

Se nenhuma correção foi necessária, não crie um commit vazio.