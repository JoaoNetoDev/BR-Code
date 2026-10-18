# Plano de Implementação da Seleção de Modelos GLM Responses

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Mostrar provedores de modelos apenas-Responses na seleção de modelos do chat GLM e na seleção `/model` do Bot.

**Arquitetura:** Manter inalterada a semântica compartilhada de formatos: `responses` mapeia para o tipo de provider `openai`, enquanto Chat Completions compatível com OpenAI permanece `openai-compatible`. Alterar apenas os dois filtros de seleção que hoje definem GLM como `anthropic/openai`, para que também aceitem `responses`.

**Stack tecnológico:** TypeScript, helpers de seleção de modelos da UI React, helpers de seleção de modelos dos services do Bot, Vitest, docs markdown existentes.

---

### Tarefa 1: Adicionar testes de seleção da UI que falham

**Arquivos:**
- Modificar: `packages/ui/test/chatInputToolbarModelGroups.test.ts`

- [ ] **Step 1: Adicionar o teste de regressão que falha**

Adicione este teste dentro de `describe("shouldIncludeModelProviderInSelection", ...)`, após o caso existente "ZCode Agent 下 custom provider 只配置 openai endpoint 时也展示":

```ts
  it("ZCode Agent 下 custom provider 只配置 responses endpoint 时也展示", () => {
    const provider = createModelProviderConfig({
      id: "provider-glm-custom-responses",
      endpoints: {
        baseURL: "https://example.com",
        paths: { openai: "/responses" },
      },
      apiFormat: "openai-responses",
      defaultKind: "openai",
      apiKey: "sk-glm-custom",
      models: ["glm-5"],
      modelSupportedFormats: {
        "glm-5": ["responses"],
      },
    });

    expect(getProviderModelsForSelection("glm", provider)).toEqual(["glm-5"]);
    expect(shouldIncludeModelProviderInSelection("glm", provider)).toBe(true);
  });
```

- [ ] **Step 2: Verificar RED**

Executar:

```bash
pnpm vitest run packages/ui/test/chatInputToolbarModelGroups.test.ts -t "responses endpoint"
```

Esperado: FAIL porque os formatos exigidos pelo GLM e as verificações de endpoint não incluem `responses`.

### Tarefa 2: Adicionar testes de seleção do Bot que falham

**Arquivos:**
- Modificar: `packages/services/test/botsModelSelectionHelpers.test.ts`

- [ ] **Step 1: Adicionar o teste de regressão que falha**

Adicione este teste após "GLM /model 入口允许只配置 openai endpoint 的供应商":

```ts
  it("GLM /model 入口允许只配置 responses endpoint 的供应商", () => {
    const provider = createModelProviderConfig({
      endpoints: {
        baseURL: "https://example.com",
        paths: { openai: "/responses" },
      },
      apiFormat: "openai-responses",
      defaultKind: "openai",
      apiKey: "sk-glm",
      models: ["glm-5"],
      modelSupportedFormats: {
        "glm-5": ["responses"],
      },
    });

    expect(getProviderModelsForSelection("glm", provider)).toEqual(["glm-5"]);
    expect(isModelProviderSelectableForZCodeProvider("glm", provider)).toBe(true);
  });
```

- [ ] **Step 2: Verificar RED**

Executar:

```bash
pnpm vitest run packages/services/test/botsModelSelectionHelpers.test.ts -t "responses endpoint"
```

Esperado: FAIL porque a seleção GLM do Bot não inclui `responses`.

### Tarefa 3: Atualizar os filtros de seleção do GLM

**Arquivos:**
- Modificar: `packages/ui/src/chat-input-toolbar/modelSelection.ts`
- Modificar: `packages/services/src/bots/modelSelectionHelpers.ts`

- [ ] **Step 1: Atualizar a seleção de modelo do chat**

Em `packages/ui/src/chat-input-toolbar/modelSelection.ts`, altere o retorno de formato exigido do GLM para:

```ts
    // Bugfix: GLM runtime supports Anthropic-compatible, OpenAI-compatible, and OpenAI Responses upstreams.
    // The chat model menu must expose Responses-only providers now that GLM Agent can send that protocol.
    return ["anthropic", "responses", "openai"];
```

Também altere a verificação de endpoint para inclusão de provider do GLM para:

```ts
    return hasEndpointForSupportedFormats(provider, ["anthropic", "responses", "openai"]);
```

- [ ] **Step 2: Atualizar a seleção de modelo do Bot**

Em `packages/services/src/bots/modelSelectionHelpers.ts`, altere o retorno de formato exigido do GLM para:

```ts
    // Bugfix: GLM runtime supports Anthropic-compatible, OpenAI-compatible, and OpenAI Responses upstreams.
    // Bot /model selection must stay aligned with the chat model menu.
    return ["anthropic", "responses", "openai"];
```

Também altere a verificação de endpoint para inclusão de provider do GLM para:

```ts
    return hasEndpointForFormat(provider, "anthropic") ||
      hasEndpointForFormat(provider, "responses") ||
      hasEndpointForFormat(provider, "openai");
```

- [ ] **Step 3: Verificar GREEN**

Executar:

```bash
pnpm vitest run packages/ui/test/chatInputToolbarModelGroups.test.ts packages/services/test/botsModelSelectionHelpers.test.ts
```

Esperado: PASS.

### Tarefa 4: Documentar a Seleção GLM Responses

**Arquivos:**
- Modificar: `docs/ui/chat-model-select-menu.md`

- [ ] **Step 1: Adicionar nota de compatibilidade**

Adicione este bullet em "兼容边界":

```md
- GLM/ZCode Agent 的自定义 provider 模型菜单按 Agent 当前可发送协议过滤，当前支持 Anthropic-compatible、OpenAI-compatible Chat Completions 和 OpenAI Responses；Bot `/model` 入口使用同一能力边界。
```

- [ ] **Step 2: Executar a verificação obrigatória**

Executar:

```bash
pnpm vitest run packages/ui/test/chatInputToolbarModelGroups.test.ts packages/services/test/botsModelSelectionHelpers.test.ts
pnpm typecheck
pnpm lint
```

Esperado: todos os comandos saem com 0.

- [ ] **Step 3: Commitar**

Executar:

```bash
git status --short
git add docs/superpowers/specs/2026-06-08-glm-responses-model-selection-design.md docs/superpowers/plans/2026-06-08-glm-responses-model-selection.md docs/ui/chat-model-select-menu.md packages/ui/src/chat-input-toolbar/modelSelection.ts packages/ui/test/chatInputToolbarModelGroups.test.ts packages/services/src/bots/modelSelectionHelpers.ts packages/services/test/botsModelSelectionHelpers.test.ts
git commit -m "feat(model-provider): support glm responses selection"
```

Esperado: o commit é bem-sucedido.
