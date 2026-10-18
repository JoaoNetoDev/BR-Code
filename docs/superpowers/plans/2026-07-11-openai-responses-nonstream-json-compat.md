# Plano de Implementação da Compatibilidade JSON Non-stream do OpenAI Responses

> Nota de supersessão 2026-07-15: este documento registra o processo de implementação já concluído na época; o item “compact fixo em non-stream” é a linha de base histórica e já não é o contrato de transport atual. A implementação de compatibilidade JSON continua mantida e é reutilizada como leg de HTTP fallback por `2026-07-15-compact-stream-first-nonstream-fallback.md`.

> **Para workers agentivos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** permitir que um provider OpenAI Responses de terceiros, cujo JSON non-stream omite o `id` da message e as `annotations` de `output_text`, ainda conclua o compact, mantendo inalterados o SSE da sessão principal, o compact non-stream e os demais protocolos.

**Arquitetura:** adicionar no adapter um wrapper dedicado de fetch JSON para Responses e combiná-lo apenas na factory explícita `provider.responses` para `providerKind === "openai"`. O wrapper preenche somente os dois campos cuja ausência já foi comprovada; o fetch compartilhado de business-error, Chat Completions, Anthropic, Gateway e o ciclo de vida de retry permanecem inalterados.

**Stack técnico:** TypeScript, Vitest, AI SDK `@ai-sdk/openai`, fake server HTTP em Node, harness de E2E de compact do ZCode.

## Restrições globais

- O critério de protocolo usa apenas o `providerKind === "openai"` do ZCode e a factory `provider.responses` do AI SDK; não verificar URL, método, nome de modelo, nome de provider ou baseURL.
- Preencher apenas `message.id === undefined` e `output_text.annotations === undefined`; outros problemas de schema estão fora do escopo desta vez.
- Message ID ausente é gerado com o `node:crypto.randomUUID()` do Node no formato `msg_<UUIDv4>`; não adicionar dependência de UUID nem resolvedor de colisão.
- Não modificar a chamada non-stream do compact, não fazer stream fallback, não adicionar requisições, retries, model-io, telemetria ou eventos de protocolo.
- `createProviderBusinessErrorFetch()` continua responsável apenas pelo proxy de rede compartilhado e pela identificação de business errors.
- Usar fake API key e fake server local; não chamar provider real.
- Código de produção segue estritamente RED → GREEN; primeiro provar que o AI SDK atual falha na cadeia real do adapter.

---

### Task 1: Camada de compatibilidade Responses do Adapter via TDD

**Arquivos:**

- Create: `apps/zcode-cli/packages/adapters/tests/openai-responses-json-compat.test.ts`
- Create: `apps/zcode-cli/packages/adapters/src/model/openai-responses-json-compat.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/registry.ts`

**Interfaces:**

- Consumes: `ProviderFetch = typeof globalThis.fetch`, `AiSdkModelRegistry`, `AiSdkModelAdapter.generateText()`.
- Produces: `createOpenAIResponsesJsonCompatFetch(baseFetch: ProviderFetch): ProviderFetch`.
- Produces: `normalizeOpenAIResponsesJson(value: unknown): Record<string, unknown> | undefined`; `undefined` indica body inalterado.

- [x] **Step 1: escrever o teste de falha na cadeia real do adapter**

Adicionar primeiro apenas o teste de integração, sem referenciar o módulo de compatibilidade que ainda não existe. O servidor HTTP local retorna o seguinte em `/responses`:

```ts
{
  id: "resp_compact",
  model: "gpt-5.5-e2e",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [
        {
          type: "output_text",
          text: "RESPONSES_COMPACT_SUMMARY_MARKER",
        },
      ],
    },
  ],
  usage: { input_tokens: 1, output_tokens: 1 },
}
```

O teste dispara a requisição pelo caminho real abaixo:

```ts
const registry = new AiSdkModelRegistry({
  env: {},
  providers: {
    responses: {
      kind: "openai",
      apiKey: "sk-e2e-fake",
      baseURL,
    },
  },
});
const adapter = new AiSdkModelAdapter({
  registry,
  retry: { maxAttempts: 1 },
});

const result = await adapter.generateText({
  model: "responses/gpt-5.5-e2e",
  messages: [{ role: "user", content: "compact" }],
});

expect(result.text).toBe("RESPONSES_COMPACT_SUMMARY_MARKER");
expect(requests).toHaveLength(1);
expect(requests[0]?.url).toBe("/responses");
```

- [x] **Step 2: rodar RED**

Run:

```bash
pnpm --dir apps/zcode-cli exec vitest run packages/adapters/tests/openai-responses-json-compat.test.ts
```

Expected: FAIL com adapter `Model request failed.`; cause sendo `AI_APICallError: Invalid JSON response`, com validation issues apontando para `output[0].id` e `output[0].content[0].annotations`. Não pode ser erro de server, de caminho ou de API key.

- [x] **Step 3: acrescentar os testes de fronteira do wrapper no mesmo arquivo de teste**

Depois que o RED estiver confirmado, adicionar as seguintes asserções para a interface alvo:

```ts
expect(
  normalizeOpenAIResponsesJson(missingFieldsBody),
).toMatchObject({
  output: [
    {
      id: expect.stringMatching(
        /^msg_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
      ),
      content: [{ annotations: [] }],
    },
  ],
});

expect(normalizeOpenAIResponsesJson(validBody)).toBeUndefined();
```

O wrapper de fetch ainda precisa provar: JSON válido, SSE, não-2xx e JSON inválido retornam a instância `Response` original; quando há reescrita, preserva status, statusText e headers comuns, e remove `content-length` e `content-encoding`.

- [x] **Step 4: implementar o wrapper mínimo**

```ts
type ProviderFetch = typeof globalThis.fetch;

export function createOpenAIResponsesJsonCompatFetch(
  baseFetch: ProviderFetch,
): ProviderFetch {
  return async (input, init) => {
    const response = await baseFetch(input, init);
    if (!response.ok || isEventStream(response)) return response;

    const body = await parseResponseJsonObject(response);
    if (!body) return response;
    const normalized = normalizeOpenAIResponsesJson(body);
    if (!normalized) return response;

    const headers = new Headers(response.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(JSON.stringify(normalized), {
      headers,
      status: response.status,
      statusText: response.statusText,
    });
  };
}
```

A normalização percorre apenas os message items de `output`: quando o `response.id` de topo é uma string não vazia, preenche o message ID ausente com `msg_<UUIDv4>` via `node:crypto.randomUUID()` do Node; quando `output_text` está sem annotations, preenche com `[]`. Usar cópia rasa, estabelecendo contrato de compatibilidade apenas para os dois campos ausentes já confirmados; outros problemas de schema estão fora do escopo desta vez.

- [x] **Step 5: compor apenas na factory Responses explícita**

```ts
case "openai": {
  const provider = createOpenAI({
    apiKey,
    baseURL: providerConfig.baseURL,
    fetch: createOpenAIResponsesJsonCompatFetch(fetch),
    headers,
  });
  return provider.responses as LanguageModelFactory;
}
```

Nenhum outro branch de factory é modificado. Adicionar ao teste um fake server OpenAI-compatible como controle, afirmando que ele ainda requisita `/chat/completions` e tem sucesso.

- [x] **Step 6: rodar GREEN e a regressão adjacente do adapter**

Run:

```bash
pnpm --dir apps/zcode-cli exec vitest run \
  packages/adapters/tests/openai-responses-json-compat.test.ts \
  packages/adapters/tests/registry.test.ts
pnpm --dir apps/zcode-cli --filter @zcode/adapters typecheck
pnpm --dir apps/zcode-cli --filter @zcode/adapters lint
```

Expected: os dois arquivos de teste, o typecheck do adapter e o lint direcionado aos arquivos alterados passam; se o lint de nível de pacote atingir falhas de linha de base em arquivos não alterados, registrar isso com fidelidade na Task 3.

### Task 2: registrar a evidência complementar de F08 e adicionar o E2E de compact com Responses fake

**Arquivos:**

- Modify: `docs/conversation-session-case-catalog.md`
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Modify: `apps/zcode-cli/e2e/compact-microcompact/constants.mjs`
- Modify: `apps/zcode-cli/e2e/compact-microcompact/suite-cases.mjs`
- Modify: `apps/zcode-cli/e2e/compact-microcompact/case-utils.mjs`
- Modify: `apps/zcode-cli/e2e/compact-microcompact/run.mjs`
- Modify: `apps/zcode-cli/e2e/compact-microcompact/scripted-provider.mjs`
- Modify: `apps/zcode-cli/e2e/compact-microcompact/README.md`
- Create: `apps/zcode-cli/e2e/compact-microcompact/case-openai-responses-compact.mjs`

**Interfaces:**

- Consumes: `startScriptedProvider()`, `writeProviderConfig()`, `createApp()`, `compactBoundaries()`.
- Produces: fake case `openai-responses-compact`, como evidência complementar de compatibilidade de provider do F08 existente.
- Extends: o handler scripted pode opcionalmente retornar `{ bodyText: string, headers: Record<string, string>, status?: number }`; o `{ body, status? }` existente continua compatível.
- Produces: o dry-run mantém o `model/baseURL` de topo existente e o resultado do suite mantém o `model` de topo existente; um case individual pode sobrescrever o valor de topo com um model local ao case, e um suite misto expressa a exceção pelo `model` opcional do case específico.

- [x] **Step 1: atualizar a fronteira NL→E2E já confirmada**

Responses com campos ausentes é uma variante de entrada de provider do F08 (compact manual bem-sucedido), e não cria um novo estado de produto de sessão. O catalog registra a fronteira de compatibilidade sob o grupo F08, e a nota de F08 na coverage matrix referencia diretamente `apps/zcode-cli/e2e/compact-microcompact/case-openai-responses-compact.mjs` como evidência complementar.
Não criar F10, abreviações automatizadas, estatísticas de produto ou regras genéricas de coverage audit; também não expandir JSON malformado, manual/auto, remote ou permutações de nome de provider.

- [x] **Step 2: fazer o fake server existente suportar SSE cru**

`scripted-provider.mjs` escolhe body e headers conforme a saída do handler:

```js
const responseBody = scripted.bodyText ?? JSON.stringify(scripted.body);
const responseHeaders = scripted.headers ?? { "content-type": "application/json" };

response.writeHead(scripted.status ?? 200, responseHeaders);
response.end(responseBody);
```

O capture salva igualmente os responseBody/responseHeaders reais. O comportamento dos handlers JSON existentes não pode mudar.

- [x] **Step 3: permitir configuração de provider Responses local ao case**

`writeProviderConfig()` passa a usar:

```js
kind: input.kind ?? "openai-compatible",
options: {
  ...(input.apiKey ? { apiKey: input.apiKey } : {}),
  apiKeyRequired: input.apiKeyRequired ?? true,
  baseURL: input.baseURL,
},
```

Os fake cases existentes continuam usando o default `openai-compatible`; o novo case passa explicitamente `kind: "openai"` e `apiKey: "sk-e2e-fake"`.

- [x] **Step 4: adicionar o cenário main SSE + compact JSON**

O turno principal retorna o seguinte SSE mínimo de Responses, com cada frame separado por linha em branco:

```text
data: {"type":"response.created","response":{"id":"resp-main-1","created_at":1,"model":"gpt-5.5-e2e","service_tier":null}}

data: {"type":"response.output_item.added","output_index":0,"item":{"type":"message","id":"msg-main-1","phase":"final_answer"}}

data: {"type":"response.output_text.delta","item_id":"msg-main-1","delta":"RESPONSES_COMPACT_SETUP_ACK"}

data: {"type":"response.output_item.done","output_index":0,"item":{"type":"message","id":"msg-main-1","phase":"final_answer"}}

data: {"type":"response.completed","response":{"incomplete_details":null,"usage":{"input_tokens":10,"input_tokens_details":{"cached_tokens":0},"output_tokens":1,"output_tokens_details":{"reasoning_tokens":0}},"service_tier":null}}

data: [DONE]
```

O output text da resposta non-stream de compact é fixo como:

```text
<analysis>compat e2e</analysis><summary>RESPONSES_COMPACT_SUMMARY_MARKER: compact succeeded.</summary>
```

Essa resposta omite apenas os dois campos já confirmados. O case afirma:

- todos os pathnames das requisições de modelo são `/responses` e não existe `/chat/completions`;
- a request principal tem `stream === true` e retorna com sucesso o setup marker;
- a request de compact tem `stream !== true`, e o response capture original realmente está sem os dois campos;
- há apenas uma requisição de compact ao provider;
- `CompactBoundary` é manual/standalone/user-requested;
- o `ModelComplete` do compact tem no content o summary marker, e a resposta final é `Compacted`.

- [x] **Step 5: registrar o fake case e atualizar as instruções de execução**

Adicionar `openai-responses-compact` a `CASE_NAMES`, `FAKE_CASE_NAMES` e `suite-cases.mjs`; o README ganha:

```bash
pnpm --filter zcode-cli exec tsx ../../apps/zcode-cli/e2e/compact-microcompact/run.mjs \
  --case=openai-responses-compact
```

- [x] **Step 6: buildar e rodar o E2E direcionado**

Run:

```bash
pnpm --dir apps/zcode-cli build
pnpm --filter zcode-cli exec tsx \
  ../../apps/zcode-cli/e2e/compact-microcompact/run.mjs \
  --case=openai-responses-compact
pnpm audit:conversation-session-coverage
```

Expected: case status `passed`, com as provider requests capturadas provando simultaneamente o main SSE e o compact non-stream; coverage audit aprovado.
O coverage audit deve manter as estatísticas de product/covered já existentes, e o documento gerado deve continuar com `0 stale, 0 missing`.

### Task 3: verificação completa e consistência da documentação

**Arquivos:**

- Modify: `docs/superpowers/specs/2026-07-11-openai-responses-nonstream-json-compat-design.md`
- Create: `docs/superpowers/plans/2026-07-11-openai-responses-nonstream-json-compat.md`
- Verify only: os arquivos de código de produção e de teste das Tasks 1 e 2.

**Interfaces:**

- Consumes: os testes do adapter aprovados e o fake E2E `openai-responses-compact`.
- Produces: spec/plan consistente com o critério da factory tipada e o resultado dos portões estáticos.

- [x] **Step 1: autoverificar que spec/plan não usam mais o critério de URL**

Run (verifica apenas a implementação de produção; as asserções de E2E sobre o pathname real no wire não são critério de protocolo):

```bash
if rg -n 'pathname|endsWith\(.*/responses|request\.method' \
  apps/zcode-cli/packages/adapters/src/model/openai-responses-json-compat.ts; then
  exit 1
fi
```

Expected: sem saída e código de saída 0; o wrapper de produção não tem guard de URL/método.

- [x] **Step 2: rodar os portões estáticos exigidos pelo repositório**

Run:

```bash
pnpm --dir apps/zcode-cli typecheck
pnpm --dir apps/zcode-cli lint
pnpm typecheck
pnpm lint
git diff --check
```

Expected: todos os comandos com código de saída 0; se existirem falhas de linha de base não relacionadas a esta mudança, preservar a saída completa e distingui-las claramente, sem afirmar que passaram.

Resultado da execução: os dois typecheck, o lint do repositório raiz, o build da CLI, o lint/sintaxe/formatação direcionados aos arquivos alterados e `git diff --check` passaram; o lint completo da CLI continua bloqueado por falhas de linha de base em arquivos não alterados, como `max-lines`, que não foram limpas de passagem nesta tarefa.

- [x] **Step 3: revisar o diff final**

Confirmar:

- o `createProviderBusinessErrorFetch()` compartilhado não tem código de normalização de Responses;
- `openai` retorna explicitamente `provider.responses`, e nenhuma outra factory foi modificada;
- não há allowlist de URL/provider/model, stream fallback, retry extra ou model-io;
- o E2E serve apenas como evidência complementar de provider para o F08, sem criar novo case de produto nem ampliar a declaração de cobertura de remote/auto/malformed JSON;
- o workspace não tem alterações não relacionadas.