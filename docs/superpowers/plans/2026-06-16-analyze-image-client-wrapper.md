# Plano de Implementação do Client Wrapper AnalyzeImage

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** adicionar a ferramenta ZCode client-side `AnalyzeImage`, que internamente envia uma requisição de modelo separada carregando apenas a ferramenta provider-native `analyze_image`, evitando que o transcript de `analyze_image` emitido espontaneamente pelo provider seja tratado por engano como uma execução de ferramenta ZCode comum.

**Arquitetura:** a superfície pública de ferramentas expõe apenas `AnalyzeImage`, sem expor o `analyze_image` provider-native ao turno principal. O handler de `AnalyzeImage` reutiliza as capacidades existentes de leitura/compressão de imagens e envia a imagem local e a pergunta do usuário para uma requisição interna de modelo em streaming com `querySource: "analyze_image_tool"`; o adapter projeta a ferramenta de função como `analyze_image` provider-native somente quando o nome da ferramenta dessa requisição interna for `analyze_image`. Um `server_tool_use analyze_image` não solicitado no turno principal continua sendo isolado como anomalia do provider e não entra no despacho do Bash nem de qualquer ferramenta local arbitrária.

**Stack tecnológico:** TypeScript、Zod、Vercel AI SDK v6、`@zcode/contracts`、tool runtime do `@zcode/core`、Vitest、cadeia de validação model-io/fake-fetch existente.

---

## Fronteiras de Design

- `AnalyzeImage` é uma built-in tool client-side do ZCode, e o nome visível ao modelo usa PascalCase: `AnalyzeImage`.
- `analyze_image` é o nome de server tool provider-native e só pode aparecer na side request interna de `AnalyzeImage`.
- A entrada da v1 usa explicitamente o caminho local da imagem: `image_path` e `prompt` opcional. A v1 não implementa a seleção implícita de imagem «adivinhando a imagem atual a partir de todo o histórico», evitando misturar três origens: prompt attachment, Read image result e MCP image artifact.
- A leitura de imagens reaproveita `inferImageMimeFromPath()` e `readImageFile()` de `apps/zcode-cli/packages/core/src/tool/handlers/read-image.ts`, herdando a semântica atual de leitura de arquivos multiplataforma, limite de dimensões, compressão e erros.
- A lógica de habilitação é alinhada a `WebSearch`: o pool principal de ferramentas só expõe `AnalyzeImage` quando a conexão do provider satisfaz `providerKind === "anthropic"` e o baseURL está na allowlist.
- A superfície de aceitação visível ao provider é o corpo final da requisição HTTP, e não o `ModelToolContract` intermediário:
  - `request.body.tools` do turno principal contém a function tool `AnalyzeImage` e não contém o `analyze_image` provider-native.
  - A requisição interna com `querySource: "analyze_image_tool"` tem em `request.body.tools` apenas `{"type":"analyze_image","name":"analyze_image"}`.
  - Um `server_tool_use analyze_image` não autorizado no turno principal não produz nenhuma tool call ZCode executável.

## Estrutura de Arquivos

- Create: `apps/zcode-cli/packages/contracts/src/tools/analyze-image.ts`
  - Define `AnalyzeImageInputSchema`、`AnalyzeImageOutputSchema`、a spec provider-native、a allowlist de baseURL e a conversão de argumentos.
- Modify: `apps/zcode-cli/packages/contracts/src/tools/index.ts`
  - Exporta `analyze-image.ts`.
- Create: `apps/zcode-cli/packages/core/src/tool/handlers/analyze-image.ts`
  - Implementa o tool handler client-side, a side request interna e a formatação do resultado.
- Create: `apps/zcode-cli/packages/core/src/tool/handlers/analyze-image-support.ts`
  - Implementa a verificação de habilitação do provider, o statusSink e o helper de trace, com estrutura alinhada a `websearch-support.ts`.
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/index.ts`
  - Registra `analyzeImageToolEntry`.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`
  - Filtra a exposição de ferramentas com `supportsProviderNativeAnalyzeImage()`.
- Modify: `apps/zcode-cli/packages/adapters/src/model/tool-transform.ts`
  - Gera a sentinel function tool `analyze_image` para o contrato provider-native interno de `AnalyzeImage`.
- Modify: `apps/zcode-cli/packages/adapters/src/model/anthropic-stream-compat.ts`
  - Reescreve a sentinel function tool como `analyze_image` provider-native antes de enviar ao provider compatível com Anthropic.
  - Isola blocos de stream `server_tool_use analyze_image` não autorizados no turno principal.
- Create: `apps/zcode-cli/packages/contracts/tests/analyze-image.test.ts`
- Create: `apps/zcode-cli/packages/core/tests/analyze-image.test.ts`
- Modify: `apps/zcode-cli/packages/adapters/tests/websearch.test.ts`
- Modify: `apps/zcode-cli/packages/adapters/tests/registry.test.ts`
- Modify: `apps/zcode-cli/packages/adapters/tests/runner.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/main-tool-pool.test.ts`

---

### Tarefa 1: Adicionar os contracts do AnalyzeImage

**Arquivos:**
- Create: `apps/zcode-cli/packages/contracts/src/tools/analyze-image.ts`
- Modify: `apps/zcode-cli/packages/contracts/src/tools/index.ts`
- Test: `apps/zcode-cli/packages/contracts/tests/analyze-image.test.ts`

- [ ] **Passo 1: Escrever o teste failing de contracts**

```ts
import {
  AnalyzeImageInputSchema,
  isAnalyzeImageCapableBaseURL,
  toAnalyzeImageProviderNativeArgs,
} from "../src/index.js";

describe("analyze-image contracts", () => {
  it("accepts explicit local image path input", () => {
    expect(
      AnalyzeImageInputSchema.safeParse({
        image_path: "/tmp/screen.png",
        prompt: "读出图片中的错误信息",
      }).success,
    ).toBe(true);
  });

  it("rejects missing image_path", () => {
    expect(AnalyzeImageInputSchema.safeParse({ prompt: "看图" }).success).toBe(false);
  });

  it.each([
    "https://open.bigmodel.cn/api/anthropic/v1",
    "https://zcode.z.ai/api/v1/zcode-plan/anthropic",
    "https://api.z.ai/anthropic",
  ])("allows AnalyzeImage-capable host %s", (baseURL) => {
    expect(isAnalyzeImageCapableBaseURL(baseURL)).toBe(true);
  });

  it.each([
    undefined,
    "",
    "https://api.openai.com/v1",
    "https://example.test/anthropic",
  ])("denies AnalyzeImage-incapable host %s", (baseURL) => {
    expect(isAnalyzeImageCapableBaseURL(baseURL)).toBe(false);
  });

  it("maps prompt to provider-native args", () => {
    expect(
      toAnalyzeImageProviderNativeArgs({
        image_path: "/tmp/screen.png",
        prompt: "提取文字",
      }),
    ).toEqual({ prompt: "提取文字" });
  });
});
```

- [ ] **Passo 2: Executar os testes para confirmar a falha**

Run:

```bash
pnpm --filter @zcode/contracts test -- analyze-image.test.ts
```

Expected: fail, com erro contendo `Cannot find module` ou `AnalyzeImageInputSchema` não exportado.

- [ ] **Passo 3: Criar o arquivo de contract**

Create `apps/zcode-cli/packages/contracts/src/tools/analyze-image.ts`:

```ts
import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";
import type { ProviderNativeToolSpec, ToolContractDeclaration } from "./contract.js";

const ANALYZE_IMAGE_CAPABLE_BASE_HOSTS = ["bigmodel.cn", "z.ai", "z.ai"];

export const AnalyzeImageInputSchema = z
  .object({
    image_path: z
      .string()
      .trim()
      .min(1)
      .describe("Local image file path to analyze"),
    prompt: z
      .string()
      .trim()
      .min(1)
      .max(4000)
      .optional()
      .describe("Question or instruction for analyzing the image"),
  })
  .strict();

export type AnalyzeImageInput = z.infer<typeof AnalyzeImageInputSchema>;

export const AnalyzeImageInputJsonSchema = toToolJsonSchema(AnalyzeImageInputSchema);

const AnalyzeImageModelUsageSchema = z
  .object({
    inputTokens: z.number().optional(),
    outputTokens: z.number().optional(),
    totalTokens: z.number().optional(),
    cacheReadTokens: z.number().optional(),
    cacheWriteTokens: z.number().optional(),
    reasoningTokens: z.number().optional(),
  })
  .strict();

export const AnalyzeImageOutputSchema = z
  .object({
    imagePath: z.string(),
    prompt: z.string().optional(),
    analysis: z.string(),
    durationMs: z.number().nonnegative(),
    modelUsage: AnalyzeImageModelUsageSchema.optional(),
  })
  .strict();

export type AnalyzeImageOutput = z.infer<typeof AnalyzeImageOutputSchema>;

export const AnalyzeImageOutputJsonSchema = toToolJsonSchema(AnalyzeImageOutputSchema);

export interface AnalyzeImageProviderNativeArgs extends Record<string, unknown> {
  prompt?: string;
}

export function toAnalyzeImageProviderNativeArgs(
  input: AnalyzeImageInput,
): AnalyzeImageProviderNativeArgs {
  return input.prompt ? { prompt: input.prompt } : {};
}

export function isAnalyzeImageCapableBaseURL(baseURL: string | undefined): boolean {
  const host = hostnameFromBaseURL(baseURL);
  if (!host) return false;
  return ANALYZE_IMAGE_CAPABLE_BASE_HOSTS.some(
    (allowedHost) => host === allowedHost || host.endsWith(`.${allowedHost}`),
  );
}

function hostnameFromBaseURL(baseURL: string | undefined): string | undefined {
  const trimmed = baseURL?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed).hostname.toLowerCase();
  } catch {
    try {
      return new URL(`https://${trimmed}`).hostname.toLowerCase();
    } catch {
      return undefined;
    }
  }
}

export const ANALYZE_IMAGE_PROVIDER_NATIVE_SPEC: ProviderNativeToolSpec = {
  kind: "provider_native",
  logicalName: "AnalyzeImage",
  providerToolName: "analyze_image",
  fallback: "disabled",
};

export const ANALYZE_IMAGE_TOOL_CONTRACT: ToolContractDeclaration = {
  capability: "analyze_image",
  executionMode: "client",
  inputSchema: AnalyzeImageInputJsonSchema,
  outputSchema: AnalyzeImageOutputJsonSchema,
  permission: {
    permission: "read",
    reason: "AnalyzeImage reads a local image file and sends it to an internal provider-native image analysis request",
    riskLevel: "low",
    sideEffectScope: "network",
    needsApproval: false,
    patternSources: ["toolName", "input", "path"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 10_000,
    maxModelBytes: 20_000,
    strategy: "truncate",
    preview: {
      maxLines: 30,
      direction: "head",
    },
  },
  timeout: {
    defaultMs: 60_000,
    maxMs: 120_000,
    allowCallOverride: true,
  },
  cancellation: {
    supported: true,
    cleanup: "bestEffort",
    userVisibleMessage: "AnalyzeImage was cancelled",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "full",
    recordOutput: "summary",
  },
};
```

- [ ] **Passo 4: Exportar o contract**

Modify `apps/zcode-cli/packages/contracts/src/tools/index.ts`:

```ts
export * from "./analyze-image.js";
```

- [ ] **Passo 5: Executar os testes de contracts para confirmar que passam**

Run:

```bash
pnpm --filter @zcode/contracts test -- analyze-image.test.ts
```

Expected: pass。

- [ ] **Passo 6: Commit**

```bash
git add apps/zcode-cli/packages/contracts/src/tools/analyze-image.ts apps/zcode-cli/packages/contracts/src/tools/index.ts apps/zcode-cli/packages/contracts/tests/analyze-image.test.ts
git commit -m "feat(zcode-cli): add analyze image tool contract"
```

### Tarefa 2: Adicionar o tool handler AnalyzeImage no core

**Arquivos:**
- Create: `apps/zcode-cli/packages/core/src/tool/handlers/analyze-image-support.ts`
- Create: `apps/zcode-cli/packages/core/src/tool/handlers/analyze-image.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/index.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`
- Test: `apps/zcode-cli/packages/core/tests/analyze-image.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/main-tool-pool.test.ts`

- [ ] **Passo 1: Escrever o teste failing do handler**

Adicionar em `apps/zcode-cli/packages/core/tests/analyze-image.test.ts`:

```ts
import { AgentRuntime } from "../src/runtime/agent-runtime.js";
import { createSessionId } from "@zcode/contracts";
import { SessionEventType, ModelRole, type ModelRef } from "@zcode/contracts";
import { createTestSessionEventStore } from "./helpers/session-event-store.js";

const modelRef: ModelRef = {
  providerId: "builtin:bigmodel" as never,
  modelId: "glm-5.1" as never,
  role: ModelRole.Main,
};

describe("AnalyzeImage client wrapper", () => {
  it("runs an internal streaming provider-native analyze_image request", async () => {
    const sessionId = createSessionId("runtime-analyze-image-handler-side-request");
    const eventStore = createTestSessionEventStore();
    const requests: any[] = [];
    let mainRequestCount = 0;

    const runtime = new AgentRuntime(
      sessionId,
      { modelRef },
      {
        eventStore,
        fileSystem: {
          async readBinaryFile() {
            return { content: Buffer.from("png-data"), sizeBytes: 8 };
          },
        } as never,
        imageProcessorPort: {
          async prepareForModel() {
            return {
              data: Buffer.from("prepared-png"),
              mediaType: "image/png",
              originalWidth: 1,
              originalHeight: 1,
              width: 1,
              height: 1,
              resized: false,
              compressed: false,
              transformedSizeBytes: 12,
              strategy: "preserve-format",
            };
          },
        } as never,
        modelAdapter: {
          async generateText(request: any) {
            if (request.metadata?.querySource === "analyze_image_tool") {
              throw new Error("AnalyzeImage side request must use streamText");
            }
            mainRequestCount++;
            if (mainRequestCount === 1) {
              return {
                finishReason: "tool-calls",
                model: request.model,
                text: "",
                toolCalls: [
                  {
                    id: "call_analyze_image",
                    input: {
                      image_path: "screen.png",
                      prompt: "图片里写了什么",
                    },
                    name: "AnalyzeImage",
                  },
                ],
                usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
              };
            }
            return {
              finishReason: "stop",
              model: request.model,
              text: "最终答案",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          },
          async *streamText(request: any) {
            requests.push(request);
            if (request.metadata?.querySource !== "analyze_image_tool") {
              throw new Error("Unexpected streaming request");
            }
            yield { type: "start" };
            yield { id: "text_1", type: "text_start" };
            yield {
              id: "text_1",
              text: "图片中显示：您尚未登录",
              type: "text_delta",
            };
            yield { id: "text_1", type: "text_end" };
            yield {
              finishReason: "stop",
              providerMetadata: { rawFinishReason: "end_turn" },
              type: "finish",
              usage: { inputTokens: 5, outputTokens: 7, totalTokens: 12 },
            };
          },
          resolveConnection() {
            return {
              baseURL: "https://open.bigmodel.cn/api/anthropic/v1",
              model: modelRef,
              providerId: "builtin:bigmodel",
              providerKind: "anthropic",
            };
          },
        } as never,
      },
    );

    await runtime.executeTurn("分析 screen.png");

    const innerRequest = requests.find(
      (request) => request.metadata?.querySource === "analyze_image_tool",
    );
    expect(innerRequest).toBeDefined();
    expect(innerRequest.tools.map((tool: any) => tool.name)).toEqual(["analyze_image"]);
    expect(innerRequest.messages[1].content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "text" }),
        expect.objectContaining({ type: "image", mediaType: "image/png" }),
      ]),
    );
    expect(innerRequest.tools[0]).toMatchObject({
      executionMode: "providerNative",
      providerNative: expect.objectContaining({
        logicalName: "AnalyzeImage",
        providerToolName: "analyze_image",
      }),
    });

    const storedEvents = await eventStore.getEvents(sessionId);
    expect(
      storedEvents.some(
        (event: any) =>
          event.type === SessionEventType.ToolCallStarted &&
          event.payload?.toolName === "AnalyzeImage",
      ),
    ).toBe(true);
  });
});
```

- [ ] **Passo 2: Escrever o teste de exposição da ferramenta**

Adicionar em `apps/zcode-cli/packages/core/tests/analyze-image.test.ts`:

```ts
it("exposes AnalyzeImage only for supported Anthropic-compatible hosts", () => {
  const supported = createRuntime("analyze-image-supported", {
    baseURL: "https://open.bigmodel.cn/api/anthropic/v1",
    providerKind: "anthropic",
  });
  expect(supported.getTools().some((tool) => tool.name === "AnalyzeImage")).toBe(true);

  const unsupported = createRuntime("analyze-image-unsupported", {
    baseURL: "https://example.test/v1",
    providerKind: "anthropic",
  });
  expect(unsupported.getTools().some((tool) => tool.name === "AnalyzeImage")).toBe(false);
});
```

Usar a mesma forma do helper local `createRuntime(...)` dos testes de WebSearch em `apps/zcode-cli/packages/core/tests/websearch.test.ts`; manter `modelConnectionPort.resolveConnection()` retornando o `baseURL` e o `providerKind` informados.

- [ ] **Passo 3: Executar os testes para confirmar a falha**

Run:

```bash
pnpm --filter @zcode/core test -- analyze-image.test.ts
```

Expected: fail, com erro indicando que `AnalyzeImage` não está registrado ou que o arquivo do handler não existe.

- [ ] **Passo 4: Criar o support helper**

Create `apps/zcode-cli/packages/core/src/tool/handlers/analyze-image-support.ts`:

```ts
import {
  CoreErrorType,
  SessionEventType,
  createCoreError,
  isAnalyzeImageCapableBaseURL,
  type ModelConnectionInfo,
  type ModelNetworkStatusEvent,
  type ModelStatusSink,
  type TraceContext,
} from "@zcode/contracts";
import type { ToolExecutionContext } from "../types.js";

const ANALYZE_IMAGE_TOOL_NAME = "AnalyzeImage";

export function resolveAnalyzeImageModelConnection(
  context: ToolExecutionContext,
): ModelConnectionInfo {
  if (!context.modelConnectionPort || !context.modelRef) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "ModelConnectionPort is required to check AnalyzeImage provider support",
      {
        context: { toolCallId: context.toolCallId, toolName: ANALYZE_IMAGE_TOOL_NAME },
        recoverable: false,
      },
    );
  }

  try {
    return context.modelConnectionPort.resolveConnection(context.modelRef);
  } catch (error) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "Failed to resolve AnalyzeImage model",
      {
        cause: error instanceof Error ? error : undefined,
        context: { toolCallId: context.toolCallId, toolName: ANALYZE_IMAGE_TOOL_NAME },
        recoverable: false,
      },
    );
  }
}

export function assertProviderSupportsAnalyzeImage(
  connection: ModelConnectionInfo,
  toolCallId: string,
): void {
  if (!supportsProviderNativeAnalyzeImage(connection)) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "Current provider/model does not support native AnalyzeImage",
      {
        context: {
          baseURL: connection.baseURL,
          providerKind: connection.providerKind,
          toolCallId,
          toolName: ANALYZE_IMAGE_TOOL_NAME,
        },
        recoverable: true,
      },
    );
  }
}

export function supportsProviderNativeAnalyzeImage(
  connection: Pick<ModelConnectionInfo, "baseURL" | "providerKind">,
): boolean {
  return (
    connection.providerKind === "anthropic" &&
    isAnalyzeImageCapableBaseURL(connection.baseURL)
  );
}

export function createAnalyzeImageModelStatusSink(
  context: ToolExecutionContext,
): ModelStatusSink | undefined {
  if (!context.emitEvent) return undefined;

  return {
    publish: async (statusEvent: ModelNetworkStatusEvent) => {
      await context.emitEvent?.({
        id: crypto.randomUUID() as never,
        sessionId: context.sessionId,
        turnId: context.turnId,
        type: SessionEventType.ModelNetworkStatus,
        timestamp: new Date(),
        traceId: context.traceId,
        sequenceNumber: 0,
        payload: statusEvent,
      });
    },
  };
}

export function analyzeImageTraceFromContext(context: ToolExecutionContext): TraceContext {
  return {
    traceId: context.traceId,
    spanId: context.spanId,
    parentSpanId: context.parentSpanId,
    sessionId: context.sessionId,
    turnId: context.turnId,
    attributes: {
      toolCallId: context.toolCallId,
      toolName: ANALYZE_IMAGE_TOOL_NAME,
    },
  };
}
```

- [ ] **Passo 5: Criar o handler**

Create `apps/zcode-cli/packages/core/src/tool/handlers/analyze-image.ts`:

```ts
import path from "node:path";
import {
  ANALYZE_IMAGE_PROVIDER_NATIVE_SPEC,
  ANALYZE_IMAGE_TOOL_CONTRACT,
  AnalyzeImageInputJsonSchema,
  AnalyzeImageInputSchema,
  AnalyzeImageOutputJsonSchema,
  AnalyzeImageOutputSchema,
  CoreErrorType,
  ModelRole,
  createCoreError,
  hasModelUsage,
  toAnalyzeImageProviderNativeArgs,
  type AnalyzeImageInput,
  type AnalyzeImageOutput,
  type ModelStreamEvent,
  type ModelTextRequest,
  type ModelTextResult,
  type ModelUsage,
  type ModelToolCall,
  type ModelToolContract,
} from "@zcode/contracts";
import type { ToolEntry, ToolHandler } from "../types.js";
import { inferImageMimeFromPath, readImageFile } from "./read-image.js";
import {
  analyzeImageTraceFromContext,
  assertProviderSupportsAnalyzeImage,
  createAnalyzeImageModelStatusSink,
  resolveAnalyzeImageModelConnection,
} from "./analyze-image-support.js";

const ANALYZE_IMAGE_TOOL_NAME = "AnalyzeImage";
const PROVIDER_ANALYZE_IMAGE_TOOL_NAME = "analyze_image";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_PROMPT = "Analyze the attached image and return the relevant visual details.";

const analyzeImageHandler: ToolHandler<AnalyzeImageInput, AnalyzeImageOutput> = async (
  input,
  context,
) => {
  const startedAt = Date.now();
  if (!context.modelPort || !context.modelRef) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "ModelPort and modelRef are required for AnalyzeImage",
      {
        context: { toolCallId: context.toolCallId, toolName: ANALYZE_IMAGE_TOOL_NAME },
        recoverable: false,
      },
    );
  }

  const connection = resolveAnalyzeImageModelConnection(context);
  assertProviderSupportsAnalyzeImage(connection, context.toolCallId);

  const absolutePath = path.isAbsolute(input.image_path)
    ? input.image_path
    : path.resolve(context.workingDirectory, input.image_path);
  const mimeType = inferImageMimeFromPath(absolutePath);
  if (!mimeType) {
    throw createCoreError(CoreErrorType.ToolExecutionFailed, "Unsupported image file type", {
      context: {
        imagePath: input.image_path,
        toolCallId: context.toolCallId,
        toolName: ANALYZE_IMAGE_TOOL_NAME,
      },
      recoverable: true,
    });
  }

  const image = await readImageFile(absolutePath, mimeType, context);
  const prompt = input.prompt?.trim() || DEFAULT_PROMPT;
  const request: ModelTextRequest = {
    model: {
      ...context.modelRef,
      role: context.modelRef.role ?? ModelRole.Main,
    },
    messages: [
      {
        role: "system",
        content: "You are an assistant for performing an image analysis tool use.",
      },
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          {
            type: "image",
            mediaType: image.mimeType,
            dataUrl: `data:${image.mimeType};base64,${image.base64}`,
            source: {
              id: `analyze-image:${context.toolCallId}`,
              kind: "local_file",
              path: absolutePath,
              mimeType: image.mimeType,
              sizeBytes: image.transformedSize ?? image.originalSize,
              placeholder: input.image_path,
            },
          },
        ],
      },
    ],
    tools: [createProviderNativeAnalyzeImageContract(input)],
    maxOutputTokens: 4096,
    abortSignal: context.abortSignal,
    metadata: {
      traceId: context.traceId,
      sessionId: context.sessionId,
      turnId: context.turnId,
      toolCallId: context.toolCallId,
      toolName: ANALYZE_IMAGE_TOOL_NAME,
      querySource: "analyze_image_tool",
    },
    statusSink: createAnalyzeImageModelStatusSink(context),
    traceContext: analyzeImageTraceFromContext(context),
  };

  const result = await collectAnalyzeImageStreamResult({
    events: context.modelPort.streamText(request),
    model: request.model,
  });
  const analysis = result.text.trim();
  if (!analysis) {
    throw createCoreError(CoreErrorType.ModelError, "AnalyzeImage returned no analysis text", {
      context: { toolCallId: context.toolCallId, toolName: ANALYZE_IMAGE_TOOL_NAME },
      recoverable: true,
    });
  }

  return {
    imagePath: input.image_path,
    prompt: input.prompt,
    analysis,
    durationMs: Date.now() - startedAt,
    modelUsage: hasModelUsage(result.usage) ? result.usage : undefined,
  };
};
```

Completar o mesmo arquivo com as funções helper:

```ts
export const analyzeImageToolEntry: ToolEntry = {
  ...ANALYZE_IMAGE_TOOL_CONTRACT,
  providerNative: undefined,
  metadata: {
    name: ANALYZE_IMAGE_TOOL_NAME,
    description:
      "Analyze a local image file using the provider's native image analysis capability.",
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    maxOutputBytes: 20_000,
    sideEffectScope: "network",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: analyzeImageHandler as ToolHandler,
  formatModelContent: formatAnalyzeImageModelContent,
  inputSchema: AnalyzeImageInputJsonSchema,
  outputSchema: AnalyzeImageOutputJsonSchema,
  runtimeInputSchema: AnalyzeImageInputSchema,
  runtimeOutputSchema: AnalyzeImageOutputSchema,
};

function createProviderNativeAnalyzeImageContract(input: AnalyzeImageInput): ModelToolContract {
  return {
    name: PROVIDER_ANALYZE_IMAGE_TOOL_NAME,
    capability: "analyze_image",
    description: "Provider-native image analysis used internally by the AnalyzeImage tool",
    executionMode: "providerNative",
    providerNative: {
      ...ANALYZE_IMAGE_PROVIDER_NATIVE_SPEC,
      args: toAnalyzeImageProviderNativeArgs(input),
    },
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: true,
    },
    outputSchema: { type: "object" },
  };
}

function formatAnalyzeImageModelContent(output: unknown): string {
  const parsed = AnalyzeImageOutputSchema.safeParse(output);
  if (!parsed.success) return JSON.stringify(output) ?? "";
  const data = parsed.data;
  return [
    `Image analysis for: ${data.imagePath}`,
    data.prompt ? `Prompt: ${data.prompt}` : undefined,
    "",
    data.analysis,
  ]
    .filter((line): line is string => line !== undefined)
    .join("\n")
    .trim();
}

async function collectAnalyzeImageStreamResult(input: {
  events: AsyncIterable<ModelStreamEvent>;
  model: ModelTextRequest["model"];
}): Promise<ModelTextResult> {
  let text = "";
  let finishReason = "unknown";
  let providerMetadata: Record<string, unknown> | undefined;
  let usage: ModelUsage = {};
  const toolCalls: ModelToolCall[] = [];

  for await (const event of input.events) {
    switch (event.type) {
      case "text_delta":
        text += event.text;
        break;
      case "tool_call":
        toolCalls.push(event.toolCall);
        break;
      case "finish":
        finishReason = event.finishReason;
        usage = event.usage;
        providerMetadata = event.providerMetadata;
        break;
      case "error":
        throw normalizeStreamError(event.error);
    }
  }

  return {
    finishReason,
    model: input.model,
    providerMetadata,
    text,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    usage,
  };
}

function normalizeStreamError(error: unknown): Error {
  if (error instanceof Error) return error;
  return createCoreError(CoreErrorType.ModelError, "AnalyzeImage stream failed", {
    context: { error },
    recoverable: true,
  });
}
```

- [ ] **Passo 6: Registrar a built-in tool**

Modify `apps/zcode-cli/packages/core/src/tool/handlers/index.ts`:

```ts
import { analyzeImageToolEntry } from "./analyze-image.js";
```

Adicionar perto de `webSearchToolEntry`:

```ts
  webFetchToolEntry,
  webSearchToolEntry,
  analyzeImageToolEntry,
```

- [ ] **Passo 7: Adicionar o filtro de visibilidade no runtime**

Modify `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`:

```ts
import { supportsProviderNativeAnalyzeImage } from "../../tool/handlers/analyze-image-support.js";
```

Substituir o corpo da função de filter por:

```ts
  return tools.filter((tool) => {
    if (tool.name === "WebSearch") return shouldExposeWebSearch.call(this);
    if (tool.name === "AnalyzeImage") return shouldExposeAnalyzeImage.call(this);
    return true;
  });
```

Adicionar:

```ts
function shouldExposeAnalyzeImage(this: AgentRuntimeInternal): boolean {
  if (!this.modelConnectionPort) return false;

  try {
    const connection = this.modelConnectionPort.resolveConnection(this.defaultModelRef);
    return supportsProviderNativeAnalyzeImage(connection);
  } catch {
    return false;
  }
}
```

- [ ] **Passo 8: Atualizar as asserções do main tool pool**

Modify `apps/zcode-cli/packages/core/tests/main-tool-pool.test.ts` no caso de provider suportado:

```ts
expect(toolNames).toContain("AnalyzeImage");
```

Adicionar uma nova asserção para provider não suportado:

```ts
expect(
  createRuntime("runtime-analyze-image-provider-deny", {
    modelConnectionPort: {
      resolveConnection: () => ({
        baseURL: "https://example.test/v1",
        model: modelRef,
        providerId: "test",
        providerKind: "anthropic",
      }),
    },
  }).getTools().some((tool) => tool.name === "AnalyzeImage"),
).toBe(false);
```

- [ ] **Passo 9: Executar os testes do core para confirmar que passam**

Run:

```bash
pnpm --filter @zcode/core test -- analyze-image.test.ts main-tool-pool.test.ts
```

Expected: pass。

- [ ] **Passo 10: Commit**

```bash
git add apps/zcode-cli/packages/core/src/tool/handlers/analyze-image.ts apps/zcode-cli/packages/core/src/tool/handlers/analyze-image-support.ts apps/zcode-cli/packages/core/src/tool/handlers/index.ts apps/zcode-cli/packages/core/src/runtime/methods/config.ts apps/zcode-cli/packages/core/tests/analyze-image.test.ts apps/zcode-cli/packages/core/tests/main-tool-pool.test.ts
git commit -m "feat(zcode-cli): add AnalyzeImage client wrapper"
```

### Tarefa 3: O adapter projeta o analyze_image provider-native

**Arquivos:**
- Modify: `apps/zcode-cli/packages/adapters/src/model/tool-transform.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/anthropic-stream-compat.ts`
- Test: `apps/zcode-cli/packages/adapters/tests/websearch.test.ts`
- Test: `apps/zcode-cli/packages/adapters/tests/registry.test.ts`
- Test: `apps/zcode-cli/packages/adapters/tests/runner.test.ts`

- [ ] **Passo 1: Escrever o teste failing do tool-transform**

Adicionar em `apps/zcode-cli/packages/adapters/tests/websearch.test.ts` ou criar um novo `analyze-image.test.ts` no mesmo package:

```ts
function createInternalProviderNativeAnalyzeImageContract(): ModelToolContract {
  return {
    name: "analyze_image",
    capability: "analyze_image",
    description: "Provider-native image analysis used internally by AnalyzeImage",
    executionMode: "providerNative",
    providerNative: {
      kind: "provider_native",
      logicalName: "AnalyzeImage",
      providerToolName: "analyze_image",
      fallback: "disabled",
      args: { prompt: "读图" },
    },
    inputSchema: { type: "object", properties: {} },
    outputSchema: { type: "object" },
  };
}

it("keeps the public AnalyzeImage model-facing tool as AnalyzeImage", () => {
  const tools = toAiSdkTools([
    {
      name: "AnalyzeImage",
      description: "Analyze a local image file",
      inputSchema: { type: "object", properties: {} },
    } as ModelToolContract,
  ]);

  expect(Object.keys(tools ?? {})).toEqual(["AnalyzeImage"]);
});

it("maps internal AnalyzeImage to an analyze_image sentinel function tool", () => {
  const tools = toAiSdkTools([createInternalProviderNativeAnalyzeImageContract()], {
    baseURL: "https://open.bigmodel.cn/api/anthropic/v1",
    providerKind: "anthropic",
  });

  expect(Object.keys(tools ?? {})).toEqual(["analyze_image"]);
  expect(tools?.analyze_image).toMatchObject({
    description: "Provider-native image analysis used internally by AnalyzeImage",
  });
});

it("omits internal AnalyzeImage for unsupported provider hosts", () => {
  expect(
    toAiSdkTools([createInternalProviderNativeAnalyzeImageContract()], {
      baseURL: "https://example.test/v1",
      providerKind: "anthropic",
    }),
  ).toBeUndefined();
});
```

- [ ] **Passo 2: Escrever o teste failing de rewrite do request body**

Adicionar em `apps/zcode-cli/packages/adapters/tests/registry.test.ts`:

```ts
it("rewrites internal analyze_image function tools to Anthropic provider-native tools", async () => {
  const fetch = createAnthropicCompatFetch(async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ body }), {
      headers: { "content-type": "application/json" },
    });
  });

  const response = await fetch("https://example.test/v1/messages", {
    headers: { "content-type": "application/json" },
    method: "POST",
    body: JSON.stringify({
      model: "glm-5.1",
      messages: [],
      tools: [
        {
          name: "analyze_image",
          description: "Provider-native image analysis used internally by AnalyzeImage",
          input_schema: { type: "object", properties: {} },
        },
      ],
    }),
  });

  const data = await response.json();
  expect(data.body.tools).toEqual([{ type: "analyze_image", name: "analyze_image" }]);
});

it("does not rewrite public AnalyzeImage function tools", async () => {
  const fetch = createAnthropicCompatFetch(async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    return new Response(JSON.stringify({ body }), {
      headers: { "content-type": "application/json" },
    });
  });

  const response = await fetch("https://example.test/v1/messages", {
    headers: { "content-type": "application/json" },
    method: "POST",
    body: JSON.stringify({
      model: "glm-5.1",
      messages: [],
      tools: [
        {
          name: "AnalyzeImage",
          description: "Public client-side tool",
          input_schema: { type: "object", properties: {} },
        },
      ],
    }),
  });

  const data = await response.json();
  expect(data.body.tools[0]).toMatchObject({ name: "AnalyzeImage" });
  expect(data.body.tools[0]).not.toHaveProperty("type", "analyze_image");
});
```

- [ ] **Passo 3: Executar os testes do adapter para confirmar a falha**

Run:

```bash
pnpm --filter @zcode/adapters test -- websearch.test.ts registry.test.ts
```

Expected: fail, porque o branch provider-native de `AnalyzeImage` não existe e o rewrite do request body não existe.

- [ ] **Passo 4: Modificar o tool transform**

Modificar os imports de `apps/zcode-cli/packages/adapters/src/model/tool-transform.ts`:

```ts
import {
  isAnalyzeImageCapableBaseURL,
  isWebSearchCapableBaseURL,
  type JsonSchema,
  type ModelToolContract,
} from "@zcode/contracts";
```

Substituir o dispatch provider-native:

```ts
function toAiSdkProviderNativeTool(
  contract: ModelToolContract,
  options: AiSdkToolTransformOptions,
): ToolSet[string] | undefined {
  switch (contract.providerNative?.logicalName) {
    case "WebSearch":
      return toAiSdkProviderNativeWebSearchTool(contract, options);
    case "AnalyzeImage":
      return toAiSdkProviderNativeAnalyzeImageTool(contract, options);
    default:
      return undefined;
  }
}
```

Manter a lógica de WebSearch existente em `toAiSdkProviderNativeWebSearchTool(...)` e adicionar:

```ts
function toAiSdkProviderNativeAnalyzeImageTool(
  contract: ModelToolContract,
  options: AiSdkToolTransformOptions,
): ToolSet[string] | undefined {
  if (options.providerKind !== "anthropic") {
    return undefined;
  }
  if (!isAnalyzeImageCapableBaseURL(options.baseURL)) {
    return undefined;
  }

  // AI SDK Anthropic provider only allowlists known provider-defined tool ids.
  // ZCode sends a normal function-shaped sentinel here and rewrites it to
  // provider-native analyze_image at the Anthropic-compatible fetch boundary.
  return tool<unknown, never>({
    description: contract.description,
    inputSchema: jsonSchema<unknown>(contract.inputSchema as JsonSchema),
    needsApproval: contract.needsApproval,
    providerOptions: {
      anthropic: {
        eagerInputStreaming: false,
      },
    },
  }) as ToolSet[string];
}
```

- [ ] **Passo 5: Modificar o request rewrite do fetch Anthropic compat**

Modify `apps/zcode-cli/packages/adapters/src/model/anthropic-stream-compat.ts`:

```ts
const PROVIDER_NATIVE_ANALYZE_IMAGE_TOOL_NAME = "analyze_image";
```

Modificar `createAnthropicCompatFetch`:

```ts
export function createAnthropicCompatFetch(baseFetch: ProviderFetch): ProviderFetch {
  return async (input, init) => {
    const rewrittenInit = rewriteAnthropicAnalyzeImageRequest(init);
    const response = await baseFetch(input, rewrittenInit);
    return rewriteAnthropicJsonThinkingResponse(filterAnthropicStream(response));
  };
}
```

Adicionar os helpers de rewrite do request:

```ts
function rewriteAnthropicAnalyzeImageRequest(init: RequestInit | undefined): RequestInit | undefined {
  if (typeof init?.body !== "string") return init;
  const parsed = safeParseRecord(init.body);
  if (!parsed || !Array.isArray(parsed.tools)) return init;

  let changed = false;
  const tools = parsed.tools.map((toolValue) => {
    const toolRecord = safeRecord(toolValue);
    if (!toolRecord || toolRecord.name !== PROVIDER_NATIVE_ANALYZE_IMAGE_TOOL_NAME) {
      return toolValue;
    }
    if (!("input_schema" in toolRecord)) {
      return toolValue;
    }
    changed = true;
    return {
      type: PROVIDER_NATIVE_ANALYZE_IMAGE_TOOL_NAME,
      name: PROVIDER_NATIVE_ANALYZE_IMAGE_TOOL_NAME,
    };
  });

  if (!changed) return init;
  return {
    ...init,
    body: JSON.stringify({
      ...parsed,
      tools,
    }),
  };
}
```

- [ ] **Passo 6: Isolar o server_tool_use analyze_image não autorizado do turno principal**

Modificar `shouldEmitFrame(...)` em `apps/zcode-cli/packages/adapters/src/model/anthropic-stream-compat.ts`.

Adicionar no transform o estado `suppressedProviderToolUseIds`, usado para suprimir `server_tool_use analyze_image` e o `tool_result` cru correspondente que apareça na saída do provider (quando ele não faz parte da side request). A implementação inicial pode decidir apenas pelo conteúdo do stream:

```ts
const suppressedProviderToolUseIds = new Set<string>();
```

No tratamento de `content_block_start`:

```ts
const contentBlock = safeRecord(parsed.content_block);
if (
  type === "content_block_start" &&
  contentBlock?.type === "server_tool_use" &&
  contentBlock.name === PROVIDER_NATIVE_ANALYZE_IMAGE_TOOL_NAME
) {
  const toolUseId = typeof contentBlock.id === "string" ? contentBlock.id : undefined;
  if (toolUseId) suppressedProviderToolUseIds.add(toolUseId);
  suppressedIndexes.add(index);
  return false;
}

if (
  type === "content_block_start" &&
  contentBlock?.type === "tool_result" &&
  typeof contentBlock.tool_use_id === "string" &&
  suppressedProviderToolUseIds.has(contentBlock.tool_use_id)
) {
  suppressedIndexes.add(index);
  suppressedProviderToolUseIds.delete(contentBlock.tool_use_id);
  return false;
}
```

Depois desse branch específico, manter a lógica genérica existente de supressão do `tool_result` cru. Assim, o comportamento tipado de `web_search_tool_result` é preservado.

- [ ] **Passo 7: Adicionar a verificação do request body final**

Adicionar em `apps/zcode-cli/packages/adapters/tests/runner.test.ts` um teste com fake-fetch que executa `streamText` com uma side request contendo apenas o `AnalyzeImage` provider-native interno e afirma o corpo JSON capturado:

```ts
expect(capturedBody.tools).toEqual([{ type: "analyze_image", name: "analyze_image" }]);
expect(capturedBody.tools).not.toContainEqual(expect.objectContaining({ name: "AnalyzeImage" }));
```

Adicionar uma segunda asserção do request body do turno principal:

```ts
expect(JSON.stringify(capturedMainBody.tools)).toContain("AnalyzeImage");
expect(JSON.stringify(capturedMainBody.tools)).not.toContain('"type":"analyze_image"');
```

- [ ] **Passo 8: Executar os testes do adapter para confirmar que passam**

Run:

```bash
pnpm --filter @zcode/adapters test -- websearch.test.ts registry.test.ts runner.test.ts
```

Expected: pass。

- [ ] **Passo 9: Commit**

```bash
git add apps/zcode-cli/packages/adapters/src/model/tool-transform.ts apps/zcode-cli/packages/adapters/src/model/anthropic-stream-compat.ts apps/zcode-cli/packages/adapters/tests/websearch.test.ts apps/zcode-cli/packages/adapters/tests/registry.test.ts apps/zcode-cli/packages/adapters/tests/runner.test.ts
git commit -m "feat(zcode-cli): route analyze image through provider-native side request"
```

### Tarefa 4: Regressão de provider anomaly e tool input corrompido

**Arquivos:**
- Modify: `apps/zcode-cli/packages/adapters/tests/registry.test.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/anthropic-stream-compat.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/streaming-tool-call-assembler.ts`
- Test: `apps/zcode-cli/packages/adapters/tests/registry.test.ts`

- [ ] **Passo 1: Escrever o teste de isolamento de transcript não autorizado**

Substituir as asserções atuais em `filters assistant-side bare tool_result content blocks from Anthropic SSE`, para que não esperem mais que `server_tool_use` permaneça visível:

```ts
expect(text).toContain("Output already summarized");
expect(text).toContain("The image says");
expect(text).not.toContain('"type":"server_tool_use"');
expect(text).not.toContain('"name":"analyze_image"');
expect(text).not.toContain('"type":"tool_result"');
expect(text).not.toContain('"index":2');
expect(text).not.toContain('"index":4');
```

Adicionar um novo teste de regressão com entrada corrompida:

```ts
it("drops malformed provider-injected analyze_image input before tool input normalization", async () => {
  const fetch = createAnthropicCompatFetch(async () =>
    sseResponse([
      sseFrame("content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: {
          type: "server_tool_use",
          id: "call_image",
          name: "analyze_image",
          input: {},
        },
      }),
      sseFrame("content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: "{\"" },
      }),
      sseFrame("content_block_stop", { type: "content_block_stop", index: 0 }),
    ]),
  );

  const response = await fetch("https://example.test/v1/messages");
  const text = await response.text();
  expect(text).not.toContain("analyze_image");
  expect(text).not.toContain("partial_json");
});
```

- [ ] **Passo 2: Executar os testes para confirmar a falha ou a necessidade de atualização**

Run:

```bash
pnpm --filter @zcode/adapters test -- registry.test.ts
```

Expected before implementation: fail, pois a implementação atual ainda preserva `server_tool_use analyze_image`.

- [ ] **Passo 3: Completar a supressão do stream**

Se a supressão do Passo 6 da Tarefa 3 ainda não tiver sido feita, concluí-la aqui. O comportamento final precisa suprimir todos os quadros do bloco `server_tool_use analyze_image` e do bloco `tool_result` correspondente. Adicionar no local da supressão um comentário explicativo:

```ts
// 修复原因：部分 Anthropic-compatible provider 会在未请求 analyze_image 时返回
// server_tool_use transcript；这不是 ZCode 注册的工具调用，必须在进入 AI SDK
// tool input normalization 前隔离，避免损坏参数继续流向 Bash 或普通工具调度。
```

- [ ] **Passo 4: Adicionar uma defesa no assembler**

Adicionar em `streaming-tool-call-assembler.ts` uma camada de proteção em nível de adapter, para que um `analyze_image` executado pelo provider não se torne uma chamada de ferramenta executável pelo ZCode mesmo que, no futuro, alguma forma de resposta do provider contorne a supressão de quadros na camada de fetch:

```ts
const UNAUTHORIZED_PROVIDER_TOOL_NAMES = new Set(["analyze_image"]);

private handleToolInputStart(
  event: Extract<ModelStreamEvent, { type: "tool_input_start" }>,
): ModelStreamEvent[] {
  if (
    event.providerExecuted === true &&
    UNAUTHORIZED_PROVIDER_TOOL_NAMES.has(event.toolName)
  ) {
    this.logger?.warn("Unauthorized provider-executed tool input suppressed", {
      event: "model.provider_tool.unauthorized_suppressed",
      module: "adapters.model.streaming-tool-call-assembler",
      toolCallId: event.id,
      toolName: event.toolName,
    });
    this.emittedToolCallIds.add(event.id);
    return [];
  }
  ...
}
```

A side request não depende de eventos de `tool_call` vindos do `analyze_image` provider-native, e sim do texto final. Portanto, suprimir esse tool input executado pelo provider no assembler é seguro tanto para a saída de anomaly do turno principal quanto para a requisição interna de `AnalyzeImage`.

- [ ] **Passo 5: Executar os testes de anomaly para confirmar que passam**

Run:

```bash
pnpm --filter @zcode/adapters test -- registry.test.ts
```

Expected: pass, e a saída dos testes não contém `model.tool_input.normalize_failed`.

- [ ] **Passo 6: Commit**

```bash
git add apps/zcode-cli/packages/adapters/src/model/anthropic-stream-compat.ts apps/zcode-cli/packages/adapters/src/model/streaming-tool-call-assembler.ts apps/zcode-cli/packages/adapters/tests/registry.test.ts
git commit -m "fix(zcode-cli): isolate unauthorized analyze_image provider tool output"
```

### Tarefa 5: Aceitação visível ao provider de ponta a ponta

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/tests/analyze-image.test.ts`
- Modify: `apps/zcode-cli/packages/adapters/tests/runner.test.ts`
- Optional generated evidence: local model-io debug JSONL, not committed

- [ ] **Passo 1: Verificar a superfície de ferramentas do turno principal**

Run:

```bash
pnpm --filter @zcode/core test -- analyze-image.test.ts main-tool-pool.test.ts
```

Expected:

```text
PASS apps/zcode-cli/packages/core/tests/analyze-image.test.ts
PASS apps/zcode-cli/packages/core/tests/main-tool-pool.test.ts
```

- [ ] **Passo 2: Verificar o request body final do adapter**

Run:

```bash
pnpm --filter @zcode/adapters test -- runner.test.ts registry.test.ts websearch.test.ts
```

Expected:

```text
PASS apps/zcode-cli/packages/adapters/tests/runner.test.ts
PASS apps/zcode-cli/packages/adapters/tests/registry.test.ts
PASS apps/zcode-cli/packages/adapters/tests/websearch.test.ts
```

As asserções de `runner.test.ts` precisam provar:

```ts
expect(capturedAnalyzeImageSideRequest.tools).toEqual([
  { type: "analyze_image", name: "analyze_image" },
]);
expect(JSON.stringify(capturedMainTurn.tools)).toContain("AnalyzeImage");
expect(JSON.stringify(capturedMainTurn.tools)).not.toContain('"type":"analyze_image"');
```

- [ ] **Passo 3: Executar os packages focados**

Run:

```bash
pnpm --filter @zcode/contracts test -- analyze-image.test.ts
pnpm --filter @zcode/core test -- analyze-image.test.ts main-tool-pool.test.ts
pnpm --filter @zcode/adapters test -- runner.test.ts registry.test.ts websearch.test.ts
```

Expected: all pass。

- [ ] **Passo 4: Executar a verificação mecânica obrigatória**

Run a partir da raiz do repositório:

```bash
pnpm typecheck
pnpm lint
```

Expected: os dois comandos terminam com exit 0. Se algum comando falhar por arquivos pré-existentes e não relacionados, registrar primeiro a lista de arquivos que falharam, depois executar os comandos mais estreitos no nível do package cobrindo os arquivos alterados e, só então, reportar as falhas remanescentes no nível da raiz.

- [ ] **Passo 5: Verificar request.body.tools com model-io real ou fake**

Executar um fake-fetch local ou uma captura de model-io em torno de um prompt que chama a ferramenta assim:

```text
请用 AnalyzeImage 分析 ./screen.png 中的文字
```

Aceitação:

```json
{
  "main_turn": {
    "tools_contains": ["AnalyzeImage"],
    "tools_not_contains": ["\"type\":\"analyze_image\""]
  },
  "analyze_image_tool": {
    "tools": [{ "type": "analyze_image", "name": "analyze_image" }]
  }
}
```

Não considerar suficientes testes de `ModelToolContract` em nível de objeto que passem sem essa verificação final do request body.

- [ ] **Passo 6: Commit**

```bash
git add apps/zcode-cli/packages/contracts apps/zcode-cli/packages/core apps/zcode-cli/packages/adapters
git commit -m "test(zcode-cli): verify AnalyzeImage provider-visible request bodies"
```

## Riscos e Tratamento

| Risco | Impacto | Tratamento |
| --- | --- | --- |
| O AI SDK não suporta qualquer tool provider-defined do Anthropic | `tool({ type: "provider", id: "anthropic.analyze_image" })` seria descartado por prepare-tools | Usar a sentinel function tool `analyze_image` e reescrever o body de saída como tool provider-native em `createAnthropicCompatFetch` |
| O provider injeta `server_tool_use analyze_image` não autorizado no turno principal | Produz tool input corrompido, podendo continuar contaminando o despacho do Bash ou de ferramentas comuns | Suprimir, na camada de compat SSE do Anthropic, o bloco `analyze_image` não autorizado e o `tool_result` correspondente, como anomalia do provider |
| O handler seleciona imagens do histórico de forma implícita | Fácil escolher o prompt attachment / Read result / MCP artifact errado | A v1 só suporta `image_path` explícito; se for preciso suportar attachment id mais adiante, criar antes uma spec independente |
| Expor AnalyzeImage em providers não suportados | O modelo principal chamaria uma ferramenta inexequível | Lógica de habilitação alinhada ao WebSearch: `providerKind === "anthropic"` e allowlist de baseURL |
| Caminhos do Windows e working directory | Resolução incorreta de caminhos relativos | Usar `path.isAbsolute` + `path.resolve(context.workingDirectory, input.image_path)`; a leitura do arquivo continua passando pelo `FileSystemPort` |
| Log de produção inundado | Deltas de streaming de alta frequência gravados em info | Toda diagnóstico chunk a chunk usa apenas os logs debug existentes de adapter/core; a anomalia do provider gera somente um warn no ponto de supressão |

## Self-Review

- Cobertura do spec: `AnalyzeImage` client-side, side request interna de ferramenta única, enable gating, projeção no request body, isolamento de provider anomaly, reaproveitamento da leitura de imagens, testes e verificação obrigatória estão todos cobertos por tarefas.
- Varredura de placeholders: este plano não contém `TBD`, `TODO` nem passos vagos do tipo «adicionar testes»; cada tarefa de mudança de código informa o arquivo alvo, o código essencial e os comandos.
- Consistência de tipos: o nome público da ferramenta é uniformemente `AnalyzeImage`; o nome provider-native é uniformemente `analyze_image`; o querySource interno é uniformemente `analyze_image_tool`.
- Verificação de escopo: a v1 não implementa a seleção automática de imagens do histórico, não altera o formato de saída de imagem do `Read` e não altera a estrutura de request já existente do `WebSearch`.