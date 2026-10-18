# Plano de implementação: completar as famílias de intensidade de pensamento padrão do zcode-cli

> **Para workers agentic:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** fazer o zcode-cli, quando um dynamic provider model não tiver reasoning metadata, fornecer capacidades padrão de intensidade de pensamento para Qwen, Kimi e MiMo.

**Architecture:** modificar apenas o overlay do workspace model catalog do bootstrap do zcode-cli. O reasoning padrão continua sendo carregado pelo agent catalog override; App/UI não participam desta inferência.

**Tech Stack:** TypeScript, Vitest, zcode protocol dynamic provider catalog overlay.

## Restrições globais

- Funcionalidades novas devem ter antes um spec em `docs`.
- Não modificar `packages/ui`.
- Manter o estilo atual de caminhos de import absolutos de pacote.
- Após a modificação, executar `pnpm typecheck` e `pnpm lint`.
- Ao terminar, criar um commit com Conventional Commit.

---

### Task 1: Adicionar testes falhos de reasoning padrão de dynamic provider

**Files:**
- Modify: `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`

**Interfaces:**
- Consumes: o método de protocolo `workspaceUpsertModelProvider`.
- Produces: expectativas de teste para `overlay.catalogOverrides[provider/model].reasoning`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar três testes próximos dos testes existentes de reasoning dinâmico:

```ts
it("synthesizes Qwen enable_thinking defaults for dynamic providers without reasoning metadata", async () => {
  // Upsert qwen-alibaba-model-studio-cn/qwen3.5-plus without reasoning.
  // Expect enabled/disabled levels and providerOptionsByLevel using enable_thinking.
});

it("synthesizes Kimi thinking toggle defaults for dynamic providers without reasoning metadata", async () => {
  // Upsert moonshot-kimi/kimi-k2.6 without reasoning.
  // Expect enabled/disabled levels and openaiCompatible.extra_body.thinking.type.
});

it("synthesizes Anthropic MiMo thinking toggle defaults for dynamic providers without reasoning metadata", async () => {
  // Upsert xiaomi-mimo/mimo-v2.5-pro without reasoning using anthropic kind.
  // Expect enabled/disabled levels and anthropic.thinking.
});
```

- [ ] **Step 2: Executar o teste para verificar que falha**

Executar:

```bash
pnpm --filter @zcode/bootstrap test -- tests/zcode-protocol.test.ts
```

Esperado: os novos testes falham porque os catalog overrides não contêm reasoning para Qwen/Kimi/MiMo sem metadata.

### Task 2: Implementar as famílias de reasoning padrão do zcode-cli

**Files:**
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`

**Interfaces:**
- Consumes: `ZCodeModelProviderConfig`, `ZCodeModelProviderModel`.
- Produces: `createDynamicProviderDefaultReasoning(provider, model)`.

- [ ] **Step 1: Atualizar a assinatura do helper**

Mudar:

```ts
createDynamicProviderDefaultReasoning(provider.kind, model.modelId)
```

para:

```ts
createDynamicProviderDefaultReasoning(provider, model)
```

- [ ] **Step 2: Adicionar o helper de reasoning padrão do Qwen**

Adicionar um helper que retorna:

```ts
{
  defaultLevel: "enabled",
  enabled: true,
  levels: ["enabled", "disabled"],
  providerOptionsByLevel: {
    enabled: { openaiCompatible: { extra_body: { enable_thinking: true } } },
    disabled: { openaiCompatible: { extra_body: { enable_thinking: false } } },
  },
}
```

- [ ] **Step 3: Ampliar a inferência padrão**

Para providers Anthropic, retornar o thinking toggle do Anthropic para `isCatalogThinkingToggleProtocolModel(provider, model)`.

Para providers compatíveis com OpenAI, retornar os padrões `enable_thinking` do Qwen antes do ramo genérico de thinking toggle do catálogo. Retornar o thinking toggle genérico compatível com OpenAI para Kimi/MiMo/GLM/DeepSeek não-V4.

- [ ] **Step 4: Executar o teste para verificar que passa**

Executar:

```bash
pnpm --filter @zcode/bootstrap test -- tests/zcode-protocol.test.ts
```

Esperado: todos os testes de `zcode-protocol.test.ts` passam.

### Task 3: Verificar as restrições do repositório e commitar

**Files:**
- Apenas os arquivos já alterados.

**Interfaces:**
- Produces: árvore de trabalho com commit feito.

- [ ] **Step 1: Executar as verificações obrigatórias**

Executar:

```bash
pnpm typecheck
pnpm lint
```

Esperado: os dois comandos passam.

- [ ] **Step 2: Commitar**

Executar:

```bash
git add docs/superpowers/specs/2026-06-29-zcode-cli-default-reasoning-families-design.md docs/superpowers/plans/2026-06-29-zcode-cli-default-reasoning-families.md apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts
git commit -m "feat: infer dynamic provider reasoning defaults"
```