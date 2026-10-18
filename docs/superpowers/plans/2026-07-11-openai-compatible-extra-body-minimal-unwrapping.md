# Plano de Implementação de Minimal Unwrapping do `extra_body` Compatível com OpenAI

> **Para workers agentivos:** SUB-SKILL OBRIGATÓRIO: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Expandir superficialmente o `openaiCompatible.extra_body` canônico para o body real de Chat Completions, sem alterar as policies de modelo existentes, o namespace pass-through nem o dialeto do provider.

**Arquitetura:** Adicionar um helper de desempacotamento superficial apenas na fronteira de projeção existente canonical → provider-name em `runner-options.ts`, reutilizando o `mergePlainRecords` já existente. Wrapper inválido reaproveita o fechamento de falha existente de generate/stream; o E2E formal atualiza apenas os cases I14/I15 existentes, com I17 como controle de campo direto.

**Stack técnico:** TypeScript, Vitest, AI SDK `@ai-sdk/openai-compatible`, WebdriverIO, fixture de replay DeepSeek local ao case.

## Restrições globais

- Não adicionar casos especiais de modelo ou provider, allowlist de campos, alias snake/camel, retry de 400 ou model-io.
- Não modificar a policy de reasoning/default nem o snapshot models-dev.
- O `extra_body` canônico e os campos diretos só fazem merge superficial de primeiro nível; o campo direto tem precedência.
- O merge generic → raw provider-name já existente antes da correção e todo pass-through de namespace irmão permanecem inalterados.
- Seguir a ordem do TDD: ver primeiro o teste de wire real do AI SDK falhar, e só então modificar o código de produção.

---

### Task 1: Fixar o contrato mínimo de requisição

**Arquivos:**

- Modify: `docs/conversation-session-case-catalog.md`
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Modify: `apps/zcode-cli/packages/adapters/tests/runner-options.test.ts`
- Create: `apps/zcode-cli/packages/adapters/tests/openai-compatible-extra-body-wire.test.ts`
- Modify: `packages/desktop/test/e2e/conversation-session/conversation-session-glm52-reasoning-request-shape.test.ts`
- Modify: `packages/desktop/test/e2e/conversation-session/conversation-session-deepseek-v4-reasoning-request-shape.test.ts`
- Modify: `packages/desktop/test/e2e/conversation-session/conversation-session-gpt-openai-compatible-reasoning-effort.test.ts`
- Modify: `packages/desktop/test/e2e/helpers/upstream-capture.ts`
- Modify: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-glm52-reasoning-request-shape.json`
- Modify: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-deepseek-v4-reasoning-request-shape.json`
- Modify: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-gpt-openai-compatible-reasoning-effort.json`

**Interfaces:**

- Consumes: `createGenerateTextOptions()` / `createStreamTextOptions()` e os casos de replay I14/I15/I17 existentes.
- Produces: contrato executável de que o wire final não contém `extra_body` e de que os campos estendidos de GLM/DeepSeek ficam no primeiro nível.

- [ ] **Step 1: Atualizar o contrato NL**

Mudar I14 para `chat_template_kwargs` de primeiro nível e I15 para `thinking` de primeiro nível,
deixando explícito nos dois que o body final não contém `extra_body`; I17 fica explicitamente como
controle de não regressão do `reasoning_effort` direto. O coverage matrix recebe a mesma semântica.

- [ ] **Step 2: Alterar as expectativas do teste unitário de options**

O caso GLM existente precisa esperar:

```ts
expect(options.providerOptions).toEqual({
  openaiCompatible: {
    extra_body: {
      chat_template_kwargs: { reasoning_effort: "max" },
    },
  },
  "GLM52 E2E": {
    chat_template_kwargs: { reasoning_effort: "max" },
  },
});
```

Adicionar um caso de pass-through, com entrada canônica, raw provider-name, sibling em camel e
outro namespace, verificando apenas que o resultado raw após a projeção de desempacotamento do canônico
mantém a semântica de override já existente antes da correção, e que os outros siblings ficam
intactos.

Adicionar ainda um caso com `extra_body: []`, verificando que a construção das options lança um
`AiSdkModelAdapterError` com code `InvalidModelRequest` e mensagem
`openaiCompatible.extra_body 必须是对象`.

- [ ] **Step 3: Escrever o teste de falha de wire real do SDK**

Usar `createOpenAICompatible({ fetch })`, uma fake API key e `generateText()`, com a entrada:

```ts
openaiCompatible: {
  extra_body: { thinking: { type: "enabled" } },
  reasoningEffort: "max",
}
```

Assertar que o body capturado contém `thinking` de primeiro nível, `reasoning_effort: "max"` e não
contém `extra_body`.

- [ ] **Step 4: Executar RED**

Run:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters test -- --run tests/openai-compatible-extra-body-wire.test.ts tests/runner-options.test.ts
```

Expected: FAIL; o código existente copia `extra_body` como está para o namespace de provider-name, e o
body de wire ainda contém o wrapper.

- [ ] **Step 5: Atualizar o contrato E2E existente sem ainda declarar a aprovação**

I14/I15 passam a ler campos de primeiro nível e a asserir `extra_body` como `undefined`; I17
continua asseverindo o `reasoning_effort` direto. Os seis matchers de fixture de main recebem
`extra_body` em `bodyExcludes`. O `upstream-capture.ts` compartilhado passa, no branch de OpenAI Chat,
a ler `thinking.type` de primeiro nível.

### Task 2: Implementar o desempacotamento superficial único

**Arquivos:**

- Modify: `apps/zcode-cli/packages/adapters/src/model/runner-options.ts`

**Interfaces:**

- Consumes: `Record<string, unknown>` canônico e o `mergePlainRecords()` já existente.
- Produces: `unwrapOpenAiCompatibleExtraBody(options): Record<string, unknown>`.

- [ ] **Step 1: Adicionar o helper mínimo**

```ts
function unwrapOpenAiCompatibleExtraBody(
  options: Record<string, unknown>,
): Record<string, unknown> {
  if (options.extra_body === undefined) {
    return options;
  }

  const extraBody = asPlainRecord(options.extra_body);
  if (!extraBody) {
    throw new AiSdkModelAdapterError(
      ModelErrorCode.InvalidModelRequest,
      "openaiCompatible.extra_body 必须是对象",
      { context: { namespace: "openaiCompatible", option: "extra_body" } },
    );
  }

  const { extra_body: _extraBody, ...directOptions } = options;
  return { ...extraBody, ...directOptions };
}
```

- [ ] **Step 2: Substituir apenas a base da projeção**

```ts
[providerOptionsName]: mergePlainRecords(
  unwrapOpenAiCompatibleExtraBody(openAiCompatibleOptions),
  existingProviderOptions,
),
```

É proibido remover `...input.providerOptions`, ler alias em camel ou modificar `mergePlainRecords()`.

- [ ] **Step 3: Executar GREEN**

Run:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters test -- --run tests/openai-compatible-extra-body-wire.test.ts tests/runner-options.test.ts
```

Expected: os dois arquivos de teste passam inteiros e o wire real não tem `extra_body`.

### Task 3: Fechar o ciclo de vida do wrapper inválido

**Arquivos:**

- Modify: `apps/zcode-cli/packages/adapters/src/model/failure-classifier.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/runner-generate.ts`
- Modify: `apps/zcode-cli/packages/adapters/tests/runner.test.ts`

**Interfaces:**

- Consumes: `AiSdkModelAdapterError(ModelErrorCode.InvalidModelRequest)`.
- Produces: contrato de falha `invalid_request` não repetível consistente entre generate e stream.

- [ ] **Step 1: Escrever os testes de falha de generate/stream**

Os dois testes passam `openaiCompatible.extra_body: []` e assertam:

```ts
expect(runtimeCallCount).toBe(0);
expect(retryStatusCount).toBe(0);
expect(startedStatusCount).toBe(0);
expect(failedStatus).toMatchObject({
  type: "model_request_failed",
  reason: "invalid_request",
  retryable: false,
  message: "openaiCompatible.extra_body 必须是对象",
});
```

O chamador recebe `AiSdkModelAdapterError` com code `InvalidModelRequest`; não se verifica nem se
adiciona model-io.

- [ ] **Step 2: Executar RED**

Run:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters test -- --run tests/runner.test.ts
```

Expected: o stream ainda não preserva uma mensagem explícita de invalid-request; a exceção de options
do generate ainda não entra no catch unificado.

- [ ] **Step 3: Ajuste mínimo no classifier e na fronteira de try do generate**

`classifyModelFailure()` devolve, para `InvalidModelRequest`, a mensagem original do erro,
`invalid_request` e não repetível.
`runGenerateText()` mantém `resolveModelForAttempt()` fora do try e coloca apenas a construção das
options, a publicação de started e a chamada de runtime dentro do try já existente; quando as options
não são construídas, `recordGenerateTextDebug()` é pulado.

- [ ] **Step 4: Executar GREEN**

Run:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters test -- --run tests/runner.test.ts
```

Expected: os dois novos testes de generate/stream passam e os runner tests existentes não regressam.

### Task 4: E2E e verificação do repositório

**Arquivos:**

- Verify only: all files above。

**Interfaces:**

- Consumes: fixtures locais ao case I14/I15/I17.
- Produces: correção mínima pronta para commit e registro de verificação.

- [ ] **Step 1: Verificar o contrato das três fixtures**

```bash
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-glm52-reasoning-request-shape.test.ts
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-deepseek-v4-reasoning-request-shape.test.ts
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-gpt-openai-compatible-reasoning-effort.test.ts
```

- [ ] **Step 2: Rodar os três E2E de replay default**

```bash
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-glm52-reasoning-request-shape.test.ts'
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-deepseek-v4-reasoning-request-shape.test.ts'
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-gpt-openai-compatible-reasoning-effort.test.ts'
```

- [ ] **Step 3: Rodar os portões estáticos e de cobertura**

```bash
pnpm --filter @zcode/desktop typecheck:e2e
pnpm audit:conversation-session-coverage
pnpm typecheck
pnpm lint
```

- [ ] **Step 4: Revisar o diff final e commitar**

Somente spec/plan, runner options/error boundary, testes de adapter direcionados, I14/I15/I17 e suas
fixtures existentes podem mudar. Mensagem de commit:

```bash
git commit -m "fix(model): unwrap OpenAI-compatible extra body"
```