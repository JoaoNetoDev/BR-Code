# Plano de Implementação da Projeção de Capacidade de Mídia do Modelo

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** para modelos que explicitamente não suportam entrada de imagem ou mídia, substituir o conteúdo de mídia por um placeholder de texto estável antes da construção final da requisição visível ao provider, evitando que requisições seguintes falhem com 400 por conta de imagens históricas ou imagens de tool.

**Arquitetura:** não impor restrições nos ramos de entrada como enviar imagem, arrastar imagem ou saída de tool Read/Bash/MCP; o histórico real da session preserva a mídia original, e as mensagens visíveis ao provider são projetadas em texto no último salto do core runtime. O lado do adapter mantém uma segunda barreira de segurança, garantindo que chamadas que contornem o core também não enviem mídia explicitamente não suportada ao provider do AI SDK.

**Stack técnico:** TypeScript, runtime de `@zcode/core`, adapter do AI SDK de `@zcode/adapters`, schemas de catálogo de modelo/protocolo de `@zcode/contracts`, Vitest, pnpm.

## Restrições Globais

- Não fazer commit automaticamente durante a execução, a menos que o usuário solicite explicitamente.
- Ao corrigir bugs, deixar comentários em chinês explicando a causa do problema e por que a correção é essa.
- Não alterar o comportamento das entradas de UI, nem proibir o usuário de enviar, arrastar ou gerar mídia por tool.
- Não textualizar permanentemente o histórico real da session; o impacto é apenas na requisição visível ao provider, no model-io e no corpo da requisição registrado na trilha.
- A verificação de capacidade precisa usar semântica de três estados: `true` significa suporte explícito, `false` significa não suportado explicitamente, `undefined` significa desconhecido e portanto sem remoção, evitando atingir providers de visão customizados por engano.
- Os logs usam `debug` e não podem registrar data URL nem payload de mídia.
- Após a modificação é obrigatório executar `pnpm typecheck` e `pnpm lint`; se for demorado ou o ambiente bloquear, relatar ao final os itens não verificados.

---

## Causa Raiz Atual

A implementação atual tem duas etapas de capacidade, mas não as conecta em um ciclo fechado:

- `apps/zcode-cli/packages/core/src/runtime/helpers/media-budget.ts` só remove mídia histórica com base no orçamento de bytes do corpo da requisição, protegendo por padrão a mídia mais recente do usuário, e não sabe se o modelo atual suporta imagens.
- `apps/zcode-cli/packages/adapters/src/model/transform.ts` já suporta `supportsImages` / `supportsPdf` / `stripMedia`, mas `apps/zcode-cli/packages/adapters/src/model/runner-options.ts` não passa a capacidade do modelo resolvida ao chamar `toAiSdkMessages`.
- `apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts` na troca dinâmica de modelo só atualiza `contextWindow`, `maxOutputTokens` e `modelProviderOptions`, sem atualizar a capacidade de entrada de mídia.
- `ModelCapability.supportsImages` é booleano; ler diretamente a capability mesclada pode classificar incorretamente como false modelos customizados que apenas não declaram a capacidade.

---

## Estrutura de Arquivos

- Create: `apps/zcode-cli/packages/core/src/runtime/helpers/media-capability.ts`
  - Responsável pela projeção de capacidade de mídia da requisição ao provider, geração do texto placeholder e contexto de log debug.
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/index.ts`
  - Exporta o helper de capacidade de mídia.
- Modify: `apps/zcode-cli/packages/core/src/runtime/types.ts`
  - Adiciona a capacidade de mídia de entrada do modelo atual em `AgentRuntimeConfig`.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`
  - `updateConfig` passa a suportar a atualização dinâmica da capacidade de mídia.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/model.ts`
  - Aplica a projeção de capacidade antes de `projectMessagesForMediaBudget`.
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
  - A requisição de compact continua apenas com texto; pode reutilizar a projeção de capacidade, mas no fim `maxMediaBytes: 0` garante a ausência de mídia.
- Modify: `apps/zcode-cli/packages/contracts/src/model/catalog.ts`
  - Expande o campo de capacidade de entrada em PDF do override/capability do catálogo.
- Modify: `packages/shared/src/zcode-protocol/index.ts`
  - Se a UI ou o protocolo remoto precisar exibir/transmitir a capacidade de PDF, acrescenta o campo opcional de schema.
- Modify: `apps/zcode-cli/packages/bootstrap/src/app/model-selection.ts`
  - Acrescenta `resolveRuntimeModelInputCapabilities`, resolvendo a capacidade de mídia do modelo atual com três estados.
- Modify: `apps/zcode-cli/packages/bootstrap/src/app/runtime-config.ts`
  - Injeta a capacidade de mídia do modelo principal atual ao inicializar o runtime.
- Modify: `apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts`
  - Atualiza a capacidade de mídia do runtime de forma sincronizada ao usar `setModel`.
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`
  - Atualiza a capacidade de mídia de forma sincronizada quando a atualização a quente do catálogo do provider afeta o modelo atual.
- Modify: `apps/zcode-cli/packages/bootstrap/src/model-config.ts`
  - Carrega o índice de capacidade de mídia dos modelos ao criar a config de registry do AI SDK.
- Modify: `apps/zcode-cli/packages/adapters/src/model/registry.ts`
  - `AiSdkResolvedModel` ganha `inputMediaCapabilities`.
- Modify: `apps/zcode-cli/packages/adapters/src/model/runner-options.ts`
  - Passa a capacidade de mídia resolvida para `toAiSdkMessages`.
- Modify: `apps/zcode-cli/packages/adapters/src/model/transform.ts`
  - Muda o texto de fallback da mídia não suportada para um placeholder neutro, sem induzir o modelo a pedir desculpas a cada turno.
- Test: `apps/zcode-cli/packages/core/tests/media-capability.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/media-budget.test.ts`
- Test: `apps/zcode-cli/packages/adapters/tests/model-transform.test.ts`
- Test: `apps/zcode-cli/packages/adapters/tests/model-transform-tool-media.test.ts`
- Test: `apps/zcode-cli/packages/bootstrap/tests/model-selection.test.ts`
- Test: `apps/zcode-cli/packages/bootstrap/tests/model-config.test.ts`
- Test: `apps/zcode-cli/packages/bootstrap/tests/runtime-config.test.ts`

---

### Tarefa 1: Adicionar a Projeção de Capacidade de Mídia no Core

**Arquivos:**
- Create: `apps/zcode-cli/packages/core/src/runtime/helpers/media-capability.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/index.ts`
- Test: `apps/zcode-cli/packages/core/tests/media-capability.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ModelInputMediaCapabilities {
    supportsImages?: boolean;
    supportsPdf?: boolean;
  }

  export interface MediaCapabilityProjection {
    messages: ModelInputMessage[];
    omittedMediaCount: number;
    omittedImageCount: number;
    omittedPdfCount: number;
    retainedMediaCount: number;
  }

  export function projectMessagesForMediaCapabilities(
    messages: ModelInputMessage[],
    capabilities: ModelInputMediaCapabilities | undefined,
  ): MediaCapabilityProjection;

  export function logMediaCapabilityProjection(
    logger: Logger | undefined,
    traceContext: TraceContext,
    projection: MediaCapabilityProjection,
    options: { event: string; message: string; model: string },
  ): void;
  ```
- Consumes: `modelMessageContentToText`, `traceContextToLogContext`, `ModelInputMessage`, `ModelMessageContentBlock`.

- [ ] **Passo 1: Escrever testes falhando**

  Adicionar `apps/zcode-cli/packages/core/tests/media-capability.test.ts` com os casos:

  ```ts
  import { describe, expect, it } from "vitest";
  import type { ModelInputMessage } from "@zcode/contracts";
  import { projectMessagesForMediaCapabilities } from "../src/runtime/helpers/media-capability.js";

  describe("model request media capability projection", () => {
    it("replaces user image blocks when the model explicitly does not support images", () => {
      const messages: ModelInputMessage[] = [
        {
          role: "user",
          content: [
            { type: "text", text: "describe this" },
            {
              type: "image",
              mediaType: "image/png",
              dataUrl: "data:image/png;base64,aW1hZ2U=",
              source: { id: "image-1", kind: "inline", placeholder: "[image #1]" },
            },
          ],
        },
      ];

      const result = projectMessagesForMediaCapabilities(messages, { supportsImages: false });

      expect(result.omittedMediaCount).toBe(1);
      expect(result.omittedImageCount).toBe(1);
      expect(result.retainedMediaCount).toBe(0);
      expect(result.messages).not.toBe(messages);
      expect(result.messages[0]?.content).toEqual([
        { type: "text", text: "describe this" },
        {
          type: "text",
          text: "[Attached image/png: [image #1]]\n[Media omitted from provider request because the selected model does not support image input.]",
        },
      ]);
    });

    it("keeps image blocks when support is true or unknown", () => {
      const image = {
        type: "image" as const,
        mediaType: "image/png",
        dataUrl: "data:image/png;base64,aW1hZ2U=",
      };
      const messages: ModelInputMessage[] = [{ role: "user", content: [image] }];

      expect(projectMessagesForMediaCapabilities(messages, { supportsImages: true }).messages).toBe(
        messages,
      );
      expect(projectMessagesForMediaCapabilities(messages, {}).messages).toBe(messages);
      expect(projectMessagesForMediaCapabilities(messages, undefined).messages).toBe(messages);
    });

    it("replaces PDF file data when PDF support is explicitly false", () => {
      const messages: ModelInputMessage[] = [
        {
          role: "user",
          content: [
            {
              type: "file",
              mediaType: "application/pdf",
              name: "report.pdf",
              dataUrl: "data:application/pdf;base64,cGRm",
            },
          ],
        },
      ];

      const result = projectMessagesForMediaCapabilities(messages, { supportsPdf: false });

      expect(result.omittedPdfCount).toBe(1);
      expect(result.messages[0]?.content).toEqual([
        {
          type: "text",
          text: "[Attached application/pdf: report.pdf]\n[Media omitted from provider request because the selected model does not support PDF input.]",
        },
      ]);
    });
  });
  ```

- [ ] **Passo 2: Executar os testes e verificar que falham**

  Executar:

  ```bash
  pnpm --filter @zcode/core exec vitest run tests/media-capability.test.ts
  ```

  Esperado: falha porque `media-capability.ts` não existe.

- [ ] **Passo 3: Implementar o helper**

  Implementar as interfaces e funções exportadas em `media-capability.ts`.

  Comportamento obrigatório:
  - Se `capabilities?.supportsImages === false`, substituir todo bloco `image` por um bloco de texto.
  - Se `capabilities?.supportsPdf === false`, substituir blocos `file` cujo `mediaType` é `application/pdf` e cujo payload visível ao provider é `dataUrl` sem `text` extraído.
  - Se a capacidade for `true` ou `undefined`, manter a mídia sem alterações.
  - Clonar apenas quando algum bloco mudar; devolver o array `messages` original quando nenhuma mídia for omitida.
  - Preservar `toolCalls` e `cacheControl` com shallow clone somente quando o conteúdo da mensagem mudar.
  - Usar comentários de código em chinês apenas para a justificativa de correções de bug não óbvias.

- [ ] **Passo 4: Exportar o helper**

  Adicionar esta linha em `apps/zcode-cli/packages/core/src/runtime/helpers/index.ts`:

  ```ts
  export * from "./media-capability.js";
  ```

- [ ] **Passo 5: Executar os testes focados**

  Executar:

  ```bash
  pnpm --filter @zcode/core exec vitest run tests/media-capability.test.ts
  ```

  Esperado: todos os testes passam.

---

### Tarefa 2: Aplicar a Projeção nas Requisições do Provider no Runtime

**Arquivos:**
- Modify: `apps/zcode-cli/packages/core/src/runtime/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/model.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- Test: `apps/zcode-cli/packages/core/tests/media-budget.test.ts`

**Interfaces:**
- Consumes: `ModelInputMediaCapabilities`, `projectMessagesForMediaCapabilities`, `logMediaCapabilityProjection`.
- Produces: `AgentRuntimeConfig.modelInputMediaCapabilities?: ModelInputMediaCapabilities`.

- [ ] **Passo 1: Escrever testes de runtime falhando**

  Estender `apps/zcode-cli/packages/core/tests/media-budget.test.ts` com:

  ```ts
  it("textifies current user media for text-only models before applying media budget", async () => {
    const requests: ModelInputMessage[][] = [];
    const runtime = new AgentRuntime(
      createSessionId("runtime-media-capability-text-only"),
      {
        mode: "plan",
        modelInputMediaCapabilities: { supportsImages: false },
        workingDirectory: "/tmp/zcode-runtime-media-capability-text-only",
      },
      {
        eventStore: createTestSessionEventStore(),
        modelAdapter: {
          async generateText(request: { messages: ModelInputMessage[] }) {
            requests.push(request.messages);
            return {
              finishReason: "stop",
              text: "ok",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          },
        } as never,
      },
    );

    await runtime.executeTurn("describe [image #1]", [
      { type: "image", path: "[image #1]", content: imageDataUrl(5 * 1024 * 1024) },
    ]);

    expect(requestImageBlocks(requests[0] ?? [])).toHaveLength(0);
    expect(requestTextBlocks(requests[0] ?? []).join("\n")).toContain(
      "does not support image input",
    );
  });

  it("keeps current user media for models with unknown image support", async () => {
    const requests: ModelInputMessage[][] = [];
    const runtime = new AgentRuntime(
      createSessionId("runtime-media-capability-unknown"),
      {
        mode: "plan",
        modelInputMediaCapabilities: {},
        workingDirectory: "/tmp/zcode-runtime-media-capability-unknown",
      },
      {
        eventStore: createTestSessionEventStore(),
        modelAdapter: {
          async generateText(request: { messages: ModelInputMessage[] }) {
            requests.push(request.messages);
            return {
              finishReason: "stop",
              text: "ok",
              usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
            };
          },
        } as never,
      },
    );

    await runtime.executeTurn("describe [image #1]", [
      { type: "image", path: "[image #1]", content: imageDataUrl(128) },
    ]);

    expect(requestImageBlocks(requests[0] ?? [])).toHaveLength(1);
  });
  ```

- [ ] **Passo 2: Executar os testes e verificar que falham**

  Executar:

  ```bash
  pnpm --filter @zcode/core exec vitest run tests/media-budget.test.ts
  ```

  Esperado: falha de TypeScript ou de runtime porque `modelInputMediaCapabilities` não está definido e a projeção não é aplicada.

- [ ] **Passo 3: Adicionar o campo de config do runtime**

  Em `apps/zcode-cli/packages/core/src/runtime/types.ts`, importar ou reexportar o tipo de capacidade e adicionar:

  ```ts
  modelInputMediaCapabilities?: ModelInputMediaCapabilities;
  ```

  a `AgentRuntimeConfig`.

- [ ] **Passo 4: Permitir atualização dinâmica de config**

  Em `apps/zcode-cli/packages/core/src/runtime/methods/config.ts`, incluir `"modelInputMediaCapabilities"` na união `Pick<AgentRuntimeConfig, ...>` e aplicar:

  ```ts
  if ("modelInputMediaCapabilities" in patch) {
    this.config.modelInputMediaCapabilities = patch.modelInputMediaCapabilities;
  }
  ```

- [ ] **Passo 5: Aplicar a projeção antes do orçamento em `runModelTextRequest`**

  Em `apps/zcode-cli/packages/core/src/runtime/methods/model.ts`, mudar a ordem de projeção da requisição para:

  ```ts
  const capabilityProjection = projectMessagesForMediaCapabilities(
    options.messages,
    this.config.modelInputMediaCapabilities,
  );
  logMediaCapabilityProjection(this.logger, options.traceContext, capabilityProjection, {
    event: "model.request.media_capability_projection",
    message: "Model request media capability projection",
    model: formatModelRef(this.defaultModelRef),
  });
  const mediaProjection = projectMessagesForMediaBudget(capabilityProjection.messages, {
    latestRealUserMessageIndex: options.latestRealUserMessageIndex,
  });
  ```

  Depois, derivar `projectedOptions` a partir de `mediaProjection.messages`, e não de `options.messages` cru.

- [ ] **Passo 6: Manter a requisição de compact apenas com texto**

  Em `compact-active.ts`, manter o comportamento existente de `projectMessagesForMediaBudget(..., { maxMediaBytes: 0, preserveLatestUserMedia: false })`. Opcionalmente aplicar a projeção de capacidade antes dele para manter os logs consistentes; não enfraquecer a remoção de toda a mídia do compact.

- [ ] **Passo 7: Executar os testes focados do core**

  Executar:

  ```bash
  pnpm --filter @zcode/core exec vitest run tests/media-capability.test.ts tests/media-budget.test.ts
  ```

  Esperado: todos os testes passam.

---

### Tarefa 3: Resolver as Capacidades de Runtime a Partir do Catálogo de Modelos

**Arquivos:**
- Modify: `apps/zcode-cli/packages/contracts/src/model/catalog.ts`
- Modify: `packages/shared/src/zcode-protocol/index.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/app/model-selection.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/app/runtime-config.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`
- Test: `apps/zcode-cli/packages/bootstrap/tests/model-selection.test.ts`
- Test: `apps/zcode-cli/packages/bootstrap/tests/runtime-config.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function resolveRuntimeModelInputCapabilities(
    modelRef: { modelId: string; providerId: string } | undefined,
    modelCatalog: ModelCatalogConfig,
  ): ModelInputMediaCapabilities | undefined;
  ```
- Consumes: `modelCatalog.overrides`, política default determinística para famílias de modelos conhecidas, metadados de modelo do protocolo.

- [ ] **Passo 1: Escrever testes falhando de model-selection**

  Adicionar casos em `apps/zcode-cli/packages/bootstrap/tests/model-selection.test.ts`:

  ```ts
  it("resolves explicit text-only image capability as false", () => {
    expect(
      resolveRuntimeModelInputCapabilities(
        { providerId: "zai", modelId: "glm-text" },
        { overrides: { "zai/glm-text": { supportsImages: false } } },
      ),
    ).toEqual({ supportsImages: false });
  });

  it("does not treat missing image capability as unsupported", () => {
    expect(
      resolveRuntimeModelInputCapabilities(
        { providerId: "custom", modelId: "vision-maybe" },
        { overrides: { "custom/vision-maybe": { contextWindow: 128000 } } },
      ),
    ).toEqual({});
  });

  it("uses deterministic defaults for known text-only models", () => {
    expect(
      resolveRuntimeModelInputCapabilities(
        { providerId: "deepseek", modelId: "deepseek-v4-flash" },
        { overrides: {} },
      )?.supportsImages,
    ).toBe(false);
  });
  ```

- [ ] **Passo 2: Executar os testes e verificar que falham**

  Executar:

  ```bash
  pnpm --filter @zcode/bootstrap exec vitest run tests/model-selection.test.ts
  ```

  Esperado: falha porque `resolveRuntimeModelInputCapabilities` não existe.

- [ ] **Passo 3: Estender os contracts para a capacidade de PDF**

  Em `apps/zcode-cli/packages/contracts/src/model/catalog.ts`, adicionar os campos opcionais de suporte a PDF:

  ```ts
  supportsPdf?: boolean;
  ```

  a `ModelCapabilityOverride` e a `ModelCapability`. Mantê-los opcionais para não alterar registros de catálogo existentes.

- [ ] **Passo 4: Estender o schema do protocolo apenas como metadado opcional**

  Em `packages/shared/src/zcode-protocol/index.ts`, adicionar `supportsPdf: z.boolean().optional()` ao lado dos campos `supportsImages` existentes, caso os consumidores da lista de modelos precisem exibi-lo. Isso precisa continuar opcional por compatibilidade retroativa.

- [ ] **Passo 5: Implementar o resolver de três estados**

  Em `model-selection.ts`, implementar `resolveRuntimeModelInputCapabilities` de modo que ele:
  - devolva `undefined` quando `modelRef` for undefined;
  - leia primeiro `modelCatalog.overrides["provider/model"].supportsImages` e `.supportsPdf`;
  - só recorra a defaults determinísticos para modelos conhecidos;
  - nunca converta uma capacidade customizada ausente em `false`.

- [ ] **Passo 6: Injetar a capacidade durante o bootstrap do runtime**

  Em `runtime-config.ts`, definir:

  ```ts
  modelInputMediaCapabilities: options.runtimeConfig?.modelInputMediaCapabilities ??
    resolveRuntimeModelInputCapabilities(initialModelRef, configResult.config.modelCatalog),
  ```

- [ ] **Passo 7: Atualizar a capacidade quando o modelo da session muda**

  Em `session-facade.ts`, no `setModel`, incluir:

  ```ts
  modelInputMediaCapabilities: resolveRuntimeModelInputCapabilities(
    modelRef,
    effectiveModelCatalog,
  ),
  ```

  no patch de `deps.runtime.updateConfig(...)`.

- [ ] **Passo 8: Atualizar a capacidade quando os metadados do catálogo do workspace mudam**

  Em `workspace-model-catalog.ts`, fazer o helper que hoje devolve `contextWindow` e `maxOutputTokens` devolver também `modelInputMediaCapabilities`. A chamada existente `record.app.runtime.updateConfig(modelLimits)` passa então a atualizar os três campos juntos.

- [ ] **Passo 9: Executar os testes do bootstrap**

  Executar:

  ```bash
  pnpm --filter @zcode/bootstrap exec vitest run tests/model-selection.test.ts tests/runtime-config.test.ts
  ```

  Esperado: todos os testes passam.

---

### Tarefa 4: Conectar a Guarda de Capacidade no Lado do Adapter

**Arquivos:**
- Modify: `apps/zcode-cli/packages/bootstrap/src/model-config.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/registry.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/runner-options.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/transform.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/tool-result-media-projection.ts`
- Test: `apps/zcode-cli/packages/bootstrap/tests/model-config.test.ts`
- Test: `apps/zcode-cli/packages/adapters/tests/model-transform.test.ts`
- Test: `apps/zcode-cli/packages/adapters/tests/model-transform-tool-media.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface AiSdkModelInputMediaCapabilities {
    supportsImages?: boolean;
    supportsPdf?: boolean;
  }

  export interface AiSdkModelRegistryConfig {
    inputMediaCapabilities?: Record<string, AiSdkModelInputMediaCapabilities>;
  }

  export interface AiSdkResolvedModel {
    inputMediaCapabilities?: AiSdkModelInputMediaCapabilities;
  }
  ```
- Consumes: resolver de capacidade de bootstrap/model-selection ou entrada equivalente de config de registry local.

- [ ] **Passo 1: Escrever testes falhando do adapter**

  Em `model-transform.test.ts`, mudar a expectativa de imagem não suportada para texto neutro:

  ```ts
  expect((messages[0] as any).content).toEqual([
    {
      type: "text",
      text: "[Attached image/png]\n[Media omitted from provider request because the selected model does not support image input.]",
    },
  ]);
  ```

  Em `model-transform-tool-media.test.ts`, adicionar:

  ```ts
  it("does not project OpenAI-compatible tool images when images are explicitly unsupported", () => {
    const messages = toAiSdkMessages(
      [
        {
          role: "tool",
          content: [
            {
              type: "image",
              mediaType: "image/png",
              dataUrl: "data:image/png;base64,aW1hZ2U=",
            },
          ],
          toolCallId: "call_image",
          toolName: "Read",
        },
      ],
      { providerKind: "openai-compatible", supportsImages: false },
    );

    expect(messages).toHaveLength(1);
    expect((messages[0] as any).content[0].output).toEqual({
      type: "text",
      value: "[Attached image/png]",
    });
  });
  ```

- [ ] **Passo 2: Executar os testes e verificar as falhas esperadas**

  Executar:

  ```bash
  pnpm --filter @zcode/adapters exec vitest run tests/model-transform.test.ts tests/model-transform-tool-media.test.ts
  ```

  Esperado: o teste de imagem não suportada falha por causa do texto atual `ERROR: Cannot read...`.

- [ ] **Passo 3: Adicionar o campo de capacidade no registry**

  Em `registry.ts`, estender a config do registry e o modelo resolvido com `inputMediaCapabilities`. Armazenar o registro em `AiSdkModelRegistry` e incluir o valor resolvido com base em `formatModelRef(ref)` ou na chave `"provider/model"`.

- [ ] **Passo 4: Passar a capacidade para a transformação de mensagens do AI SDK**

  Em `runner-options.ts`, passar:

  ```ts
  supportsImages: input.resolved.inputMediaCapabilities?.supportsImages,
  supportsPdf: input.resolved.inputMediaCapabilities?.supportsPdf,
  ```

  para `toAiSdkMessages`, tanto em `createGenerateTextOptions` quanto em `createStreamTextOptions`.

- [ ] **Passo 5: Neutralizar a redação do fallback do adapter**

  Em `transform.ts`, substituir as strings `ERROR` de imagem/PDF não suportada pelo mesmo texto neutro de omissão usado no core. Isso mantém o comportamento do adapter alinhado caso o core seja contornado.

- [ ] **Passo 6: Manter a projeção de mídia de tool limitada**

  Em `tool-result-media-projection.ts`, preservar o comportamento atual em que `supportsImages === false` não adiciona partes de imagem adicionais. Garantir que o resultado textual da tool continue disponível via `modelMessageContentToText`.

- [ ] **Passo 7: Conectar a config do registry a partir do bootstrap**

  Em `model-config.ts`, adicionar a opção `modelCatalog?: ModelCatalogConfig` em `CreateAiSdkModelRegistryConfigOptions`. Construir `inputMediaCapabilities` para os alvos `main`, `lite` e `available` usando o mesmo resolver de três estados. Não colocar esses dados em providerOptions.

- [ ] **Passo 8: Executar os testes focados do adapter/bootstrap**

  Executar:

  ```bash
  pnpm --filter @zcode/adapters exec vitest run tests/model-transform.test.ts tests/model-transform-tool-media.test.ts
  pnpm --filter @zcode/bootstrap exec vitest run tests/model-config.test.ts
  ```

  Esperado: todos os testes passam.

---

### Tarefa 5: Verificação de ponta a ponta do Formato da Requisição

**Arquivos:**
- Modify if needed: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`
- Modify if needed: `apps/zcode-cli/packages/core/tests/runtime-trace.test.ts`

**Interfaces:**
- Consumes: projeção de runtime da Tarefa 2 e capacidade de catálogo da Tarefa 3.
- Produces: evidência de teste de que a mídia de anexo do usuário e a mídia de resultado de tool somem das requisições de provider apenas com texto.

- [ ] **Passo 1: Adicionar uma regressão de tool-loop**

  Estender `runtime-tool-loop.test.ts` ou adicionar um teste focado que:
  - crie o runtime com `modelInputMediaCapabilities: { supportsImages: false }`;
  - faça uma tool retornar um bloco de imagem;
  - deixe a próxima requisição de modelo acontecer;
  - verifique que a próxima requisição de modelo não tem bloco de conteúdo `image` e contém o texto neutro de omissão.

- [ ] **Passo 2: Adicionar regressão de trace/log, se o helper de trace existente tornar isso barato**

  Estender `runtime-trace.test.ts` para verificar que o evento debug contém contagens como `omittedImageCount: 1` e não contém a data URL.

- [ ] **Passo 3: Executar as regressões do core**

  Executar:

  ```bash
  pnpm --filter @zcode/core exec vitest run tests/runtime-tool-loop.test.ts tests/runtime-trace.test.ts
  ```

  Esperado: todos os testes passam.

---

### Tarefa 6: Validação Completa

**Arquivos:**
- Nenhum arquivo de código esperado, a menos que tarefas anteriores exponham falhas de integração.

- [ ] **Passo 1: Executar os testes focados de pacote**

  Executar:

  ```bash
  pnpm --filter @zcode/core exec vitest run tests/media-capability.test.ts tests/media-budget.test.ts tests/runtime-tool-loop.test.ts tests/runtime-trace.test.ts
  pnpm --filter @zcode/adapters exec vitest run tests/model-transform.test.ts tests/model-transform-tool-media.test.ts
  pnpm --filter @zcode/bootstrap exec vitest run tests/model-selection.test.ts tests/model-config.test.ts tests/runtime-config.test.ts
  ```

  Esperado: todos os testes listados passam.

- [ ] **Passo 2: Executar as verificações obrigatórias do repositório**

  Executar:

  ```bash
  pnpm typecheck
  pnpm lint
  ```

  Esperado: ambos os comandos saem com código 0.

- [ ] **Passo 3: Smoke test manual do formato da requisição**

  Usar uma entrada de config de modelo com `supportsImages: false` explícito, enviar uma imagem do usuário e então inspecionar o model-io / a trilha de debug. Espera-se que a requisição visível ao provider contenha a omissão neutra em texto e nenhum payload de mídia de imagem/arquivo.

- [ ] **Passo 4: Resumir o risco residual**

  O resumo final da implementação precisa declarar:
  - os pontos de entrada de mídia permanecem inalterados;
  - o histórico bruto da session permanece inalterado;
  - as requisições visíveis ao provider são higienizadas somente quando a capacidade é explicitamente false;
  - modelos customizados desconhecidos mantêm o comportamento anterior;
  - se `pnpm typecheck` e `pnpm lint` passaram.