# Plano de implementação: orçamento de saída de requisição de modelo e compatibilidade de provider

> Status: os limites de produto foram confirmados; este documento pode ser executado como está. Ele trata apenas do orçamento de saída do modelo e dos campos padrão de requisição, sem alterar o estado de conclusão, o estado de erro ou a semântica de nova tentativa do resultado retornado pelo modelo.

**Objetivo:** unificar o cálculo do orçamento de saída do modelo com a lógica de compatibilidade de provider já validada, mantendo o limite padrão atual do ZCode em 64.000: `limit.output` na configuração de provider do usuário representa o limite de capacidade do modelo e tem precedência sobre o catálogo; requisições normais de modelo são limitadas por um limite global de requisição independente, e enviam seus campos padrão próprios via AI SDK para OpenAI Compatible, OpenAI Responses e Anthropic; para as combinações já validadas o limite de requisição é omitido, e o nome do campo é reescrito no limite final da requisição do Snowflake Cortex.

**Arquitetura:** no lado do App, `modelProviderService` garante que a configuração do usuário tem precedência e que o catálogo só preenche lacunas; o core usa o `maxOutputTokensSource` interno para distinguir o orçamento de capacidade normal do modelo do orçamento derivado internamente pelo Compact; o adapter calcula de forma centralizada o orçamento de saída efetivo das requisições normais e aplica regras de compatibilidade de provider de escopo estreito antes da serialização pelo AI SDK; o AI SDK mapeia o `maxOutputTokens` genérico retido para o campo final de cada protocolo.

**Stack tecnológico:** TypeScript, Vitest, Vercel AI SDK, pnpm, turbo.

## Contexto e problemas atuais

A implementação atual tem dois problemas ao mesmo tempo:

1. tanto o core quanto o adapter truncam a capacidade de saída do modelo previamente para 64.000; além disso, o `runtime-default` do OpenAI Compatible é omitido no adapter, de modo que gateways customizados podem recair no pequeno valor padrão do fornecedor.
2. Quando o App lê `~/.zcode/v2/config.json`, o `maxOutputTokens` do catálogo pode sobrescrever o `model.limit.output` já configurado pelo usuário, o que contraria a precedência de configuração já confirmada.

A lógica de orçamento da requisição é:

```ts
effectiveMaxOutputTokens = Math.min(
  model.limit.output ?? globalOutputTokenMax,
  globalOutputTokenMax,
);
```

Para reduzir mudanças de comportamento, o ZCode continua usando os 64K existentes como padrão e oferece uma variável de ambiente independente para sobrescrever.

## Limites confirmados

### Incluídos nesta correção

- `model.limit.output` da configuração de provider do usuário tem precedência; catálogo/models.dev apenas completa fatos de capacidade ausentes.
- Novo limite global independente de requisição `ZCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX`, que aceita apenas inteiros positivos; quando não configurado ou inválido, o padrão é 64.000.
- O orçamento efetivo das requisições normais é `min(modelLimit ?? globalCap, globalCap)`.
- O turno principal e a Target Completion Verification são ambos requisições normais de modelo e usam a mesma política de orçamento.
- OpenAI Compatible, OpenAI Responses e Anthropic entram no AI SDK pelo `maxOutputTokens` genérico, e os campos do corpo final da requisição são validados.
- OpenAI Compatible envia `max_tokens` por padrão; apenas para modelos GPT cujo provider id contenha `github-copilot`, o campo é omitido na fronteira de parâmetros de requisição do adapter.
- Quando o provider id é exatamente `openai`, `maxOutputTokens` é omitido antes da serialização pelo AI SDK; outros providers customizados que usam o protocolo Responses continuam enviando o `max_output_tokens` padrão.
- `snowflake-cortex` renomeia `max_tokens` para `max_completion_tokens` na fronteira do corpo final de requisição JSON; quando o campo não existe, o body não é reescrito.
- O fixed thinking do Anthropic continua usando a conversão existente "descontar o thinking budget do orçamento de saída visível e deixar o SDK formar a requisição de protocolo", que é a diferença de adaptação de protocolo mantida pelo ZCode.

### Não incluídos nesta correção

- Não alterar o comportamento de texto vazio, `finishReason=length`, estado de conclusão, estado de erro, fila ou novas tentativas automáticas.
- Não modificar a janela do Compact, o summary budget de 20K, a configuração de thinking ou a estratégia de envio atual; `runtime-default` continua usando a proteção fixa e independente de 64K, sem impacto do global cap genérico.
- Não modificar as regras de merge, expansão ou sobrescrita de `extra_body`.
- Não adicionar nem substituir fatos de capacidade hardcoded de modelos específicos como GLM e DeepSeek.
- Não fazer sondagem em runtime, re-tentativa em caso de falha nem aprendizado automático de regras de compatibilidade para providers desconhecidos.
- Não adicionar entradas de configuração na página de configurações ou em outra UI.
- Não modificar o continuous do desktop, o replayable do mobile, o workspace remoto ou o protocolo externo do app-agent.

## Contrato de comportamento

### Precedência de configuração

```text
model.limit.output da configuração de provider do usuário
  > valor de capacidade já existente no catálogo / models.dev
  > modelo desconhecido
```

O catálogo só preenche valores ausentes e não sobrescreve valores já configurados explicitamente pelo usuário; o preenchimento e a persistência de metadata existentes permanecem inalterados.

### Orçamento da requisição

```ts
const globalCap = positiveInteger(adapterEnv.ZCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX) ?? 64_000;
const modelLimit = positiveInteger(model.maxOutputTokens);
const effectiveMaxOutputTokens = Math.min(modelLimit ?? globalCap, globalCap);
```

| `limit.output` do modelo | Limite global | Orçamento da requisição normal |
| ------------------: | -------: | -----------: |
|              32,768 |   64,000 |       32,768 |
|             131,072 |   64,000 |       64,000 |
|             131,072 |  131,072 |      131,072 |
|          não configurado |   64,000 |       64,000 |

### Campo final do protocolo

| Provider kind         | Campo final da requisição            | Comportamento padrão em requisições normais             |
| --------------------- | ----------------------- | ---------------------------------- |
| `openai-compatible`   | `max_tokens`            | enviado por padrão; uma combinação validada omite       |
| `openai`（Responses） | `max_output_tokens`     | omitido quando o provider id é `openai`                |
| `anthropic`           | `max_tokens`            | enviado explicitamente; conversão de fixed thinking mantida |
| `snowflake-cortex`    | `max_completion_tokens` | renomeação exata do `max_tokens` final                  |

`gateway` / `custom` não são mais omitidos uniformemente por causa do provider kind; eles recebem o `maxOutputTokens` genérico do AI SDK, e a projeção concreta de protocolo continua sendo responsabilidad da implementação de cada provider.

As regras de compatibilidade usam apenas combinações já validadas de provider id e model id, e não alteram o comportamento de envio padrão dos demais providers.
A omissão de campos acontece antes da serialização pelo AI SDK; a renomeação de campo do Snowflake Cortex acontece na fronteira do corpo final de requisição JSON.

---

### Tarefa 1: atualizar primeiro a spec de orçamento de saída e de config de provider

**Arquivos:**

- Modify: `docs/model-request-output-tokens.md`
- Modify: `docs/model-provider-config-overrides.md`
- Modify: `docs/model-provider-json-schema.md`

- [x] Documentar em `model-request-output-tokens.md` o padrão de 64K, a sobrescrita por variável de ambiente, a fórmula `min(modelLimit ?? globalCap, globalCap)`, os três campos de protocolo padrão e a diferença de thinking do Anthropic.
- [x] Remover de `model-provider-config-overrides.md` a regra antiga de o catálogo sobrescrever o `maxOutputTokens` do usuário, passando a dizer que o catálogo apenas completa lacunas.
- [x] Corrigir em `model-provider-json-schema.md` a descrição antiga de que "`maxOutputTokens` não entra automaticamente na requisição OpenAI Compatible"; não ajustar o design das demais provider options.
- [x] Verificar que não existem afirmações conflitantes entre os três documentos, como "modelo conhecido vai direto e não é afetado pelo cap global", "Responses continua omitindo" ou "o catálogo sobrescreve o valor do usuário".

### Tarefa 2: corrigir a precedência do provider config no App

**Arquivos:**

- Modify: `packages/services/src/model-provider/modelProviderServiceStorage.ts`
- Test: `packages/services/test/modelProviderService.test.ts`

- [x] Alterar primeiro o teste existente de leitura de config: o `limit.output` já configurado pelo usuário deve permanecer inalterado tanto no valor retornado pelo service quanto no arquivo de persistência.
- [x] Adicionar caso de valor ausente: quando o modelo do usuário não tem `limit.output` configurado, o catálogo ainda pode completar `maxOutputTokens`.
- [x] Executar o teste alvo e confirmar que ele falha antes da alteração:

```bash
pnpm exec vitest run packages/services/test/modelProviderService.test.ts
```

- [x] Remover de `readZCodeConfigProviders` a lista de permissões de override de `maxOutputTokens` do catálogo; apagar os tipos, constantes e ramos condicionais que existiam apenas para esse comportamento de override, fazendo com que `applyCatalogModelMetadata` volte a ser fill-only para esse campo.
- [x] Manter inalterado o caminho de migração antigo de `model-providers.json` e a outra lógica de preenchimento de metadata.
- [x] Reexecutar o teste alvo do service e confirmar que passa.

### Tarefa 3: implementar a fórmula de orçamento e a fronteira de origem da requisição

**Arquivos:**

- Modify: `apps/zcode-cli/packages/contracts/src/model/index.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/turn-model-step.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/model.ts`
- Delete: `apps/zcode-cli/packages/core/src/runtime/methods/model-output-tokens.ts`
- Add: `apps/zcode-cli/packages/core/src/runtime/methods/compact-output-tokens.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/target-completion-verification.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/model-request-output-tokens.ts`
- Test: `apps/zcode-cli/packages/adapters/tests/runner-options.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-model-anomaly.test.ts`
- Test: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`

- [x] Adicionar primeiro ao adapter um teste de tabela-verdade do orçamento, com generate/stream compartilhando o mesmo conjunto de expectativas:
  - modelo 32,768 + global padrão 64,000 → 32,768;
  - modelo 131,072 + global padrão 64,000 → 64,000;
  - modelo 131,072 + variável de ambiente 131,072 → 131,072;
  - modelo não configurado + global padrão 64,000 → 64,000;
  - variável de ambiente `0`, negativa, não numérica ou não inteira → recuo para 64,000.
- [x] Estender o tipo interno de origem para `"runtime-default" | "model-capability"`, sincronizando o tipo TypeScript e o JSON schema; esse campo continua pertencendo apenas ao modelo de requisição interno core→adapter, sem modificar o ZCode Protocol externo.
- [x] O turno principal define `maxOutputTokensSource: "model-capability"`.
- [x] A Target Completion Verification passa a transmitir o valor bruto de capacidade do modelo e a definir `maxOutputTokensSource: "model-capability"`, sem pré-truncar para 64K no core.
- [x] `model.ts` não chama mais o precap fixo de 64K do core para `model-capability`, deixando o cálculo por conta do adapter; as demais chamadas não marcadas permanecem como estão.
- [x] Restringir o cap fixo original à proteção de 64K exclusiva do Compact em `compact-output-tokens.ts`; requisições normais não reutilizam mais essa constante.
- [x] Resolver `ZCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX` de forma centralizada no adapter, calculando o orçamento das requisições normais conforme o contrato de comportamento; não omitir o orçamento normal de `openai`, `openai-compatible`, `gateway` ou `custom` com base em `providerKind`.
- [x] O Anthropic continua executando o desconto existente do fixed thinking budget após o cálculo do orçamento efetivo; no ambiente padrão, o comportamento atual de 64K permanece inalterado.
- [x] `compact-active.ts` passa apenas a chamar a função de recorte exclusiva do Compact, e os testes de compact confirmam que o summary budget continua em 20,000 e a origem continua sendo `runtime-default`.
- [x] Usar os testes do core para confirmar que a origem do turno principal e da Target Completion Verification é `model-capability`, e que as asserções existentes de tratamento de anomalia de modelo não mudaram.

Testes alvo:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters test -- runner-options
pnpm --dir apps/zcode-cli --filter @zcode/core test -- runtime-model-anomaly runtime-tool-loop runtime-compact
```

### Tarefa 4: validar o corpo final de requisição dos três protocolos

**Arquivos:**

- Add: `apps/zcode-cli/packages/adapters/tests/model-output-tokens-wire.test.ts`
- Modify only if reusable setup is needed: existing adapter test helpers

- [x] Usar um fake fetch local para capturar o corpo final de requisição JSON produzido pelo AI SDK, em vez de apenas afirmar sobre o objeto intermediário de `runner-options`.
- [x] OpenAI Compatible: orçamento efetivo 64,000 resulta em `max_tokens: 64000`.
- [x] OpenAI Responses: orçamento efetivo 64,000 resulta em `max_output_tokens: 64000`.
- [x] Anthropic: o orçamento padrão resulta em `max_tokens: 64000`; adicionar ainda um caso de fixed thinking, validando que a conversão de thinking existente não empurra o orçamento total final acima do cap global.
- [x] Adicionar um caso wire com a variável de ambiente elevada para 131,072, provando que o cap global pode ser explicitamente aumentado em vez de permanentemente truncado em 64K.
- [x] Não adicionar a este teste asserções sobre resposta vazia do modelo, novas tentativas, UI ou comportamento do Compact.

Run:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters test -- model-output-tokens-wire
```

### Tarefa 4.1: incluir as exceções de provider já validadas

**Arquivos:**

- Add: `apps/zcode-cli/packages/adapters/src/model/model-request-output-token-compat.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/runner-options.ts`
- Add: `apps/zcode-cli/packages/adapters/tests/model-output-token-provider-compat.test.ts`

- [x] Adicionar casos de comportamento exatos para provider/model family.
- [x] generate/stream aplicam as regras na mesma função de compatibilidade do adapter:
  - provider id contendo `github-copilot` + model id contendo `gpt` → omitir;
  - outros OpenAI Compatible → manter.
- [x] Reexecutar os testes portados, a suíte completa do adapter e o typecheck da CLI.

### Tarefa 4.2: completar a compatibilidade de requisição de OpenAI e Snowflake Cortex

**Arquivos:**

- Modify: `apps/zcode-cli/packages/adapters/src/model/model-request-output-token-compat.ts`
- Add: `apps/zcode-cli/packages/adapters/src/model/model-request-body-compat.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/model/registry.ts`
- Modify: `apps/zcode-cli/packages/adapters/tests/model-output-token-provider-compat.test.ts`
- Modify: `apps/zcode-cli/packages/adapters/tests/model-output-tokens-wire.test.ts`

- [x] Quando o provider id é exatamente `openai`, omitir `maxOutputTokens`; provider id semelhante mas não igual continua enviando.
- [x] `snowflake-cortex` renomeia para `max_completion_tokens` apenas quando `max_tokens` existe no body JSON final.
- [x] Quando o body não é uma string JSON ou não contém `max_tokens`, a requisição original permanece inalterada.
- [x] Complementar as asserções do corpo final de requisição para Chat Compatible, Responses, Anthropic e Snowflake Cortex.
- [x] Gemini, Bedrock e o runtime nativo atualmente não têm implementação de adapter/provider correspondente; não introduzir SDK não usado por causa dos testes; registrar como action de integração de provider independente.

Testes alvo:

```bash
pnpm --dir apps/zcode-cli --filter @zcode/adapters test -- model-output-token-provider-compat
pnpm --dir apps/zcode-cli --filter @zcode/adapters test
pnpm --dir apps/zcode-cli typecheck
```

### Tarefa 5: verificação completa e commit

- [x] Executar os testes afetados:

```bash
pnpm exec vitest run packages/services/test/modelProviderService.test.ts
pnpm --dir apps/zcode-cli --filter @zcode/adapters test
pnpm --dir apps/zcode-cli --filter @zcode/core test
pnpm --dir apps/zcode-cli --filter @zcode/contracts test
```

- [x] Executar as verificações mecânicas dos dois workspaces:

```bash
pnpm typecheck
pnpm lint
pnpm --dir apps/zcode-cli typecheck
pnpm --dir apps/zcode-cli lint
```

- [x] A verificação final do diff deve satisfazer:
  - nenhuma mudança de estado de `finishReason=length` ou de resposta vazia;
  - nenhuma mudança na implementação de `extra_body`;
  - nenhum hardcode de capacidade dos modelos GLM/DeepSeek;
  - `compact-active.ts` apenas passa a usar o recorte de 64K exclusivo do Compact, sem modificar janela, summary budget, thinking ou estratégia de envio;
  - precedência do provider config, tabela-verdade do orçamento e testes wire dos três protocolos estão todos cobertos.
- [ ] Quando o usuário pedir explicitamente o commit, commitar apenas os arquivos deste plano e usar Conventional Commit; não incluir outras alterações já existentes no workspace.

Resultado da execução: o typecheck e o lint do workspace raiz e as 20 tasks de typecheck do workspace da CLI passaram; o lint raiz ficou em 75 warnings / 0 errors. O lint completo da CLI continua bloqueado por erros de baseline pré-existentes como max-lines; o lint direcionado do código de requisição do adapter ficou em 0 warning / 0 error. A suíte completa do adapter teve 47 files passed, 657 tests passed e 2 skipped; o bootstrap `model-config` teve 16 tests passed; o provider service teve 105 tests passed; o contracts completo teve 147 tests passed; os 186 testes do core afetados passaram todos. A suíte completa da CLI foi executada em modo continue, permanecendo falhas de baseline fora deste escopo, como guardas de fronteira do core, bootstrap session, recursos SEA da CLI e timeouts de concorrência.

## Critérios de aceitação

- Quando o usuário configura `limit.output = 131072`, o App não o reescreve mais para 64000 do catálogo.
- Sob o cap global padrão, uma requisição normal de um modelo com capacidade 131072 envia 64000; após definir `ZCODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX=131072`, envia 131072.
- Quando não há capacidade de modelo informada, a requisição normal envia o padrão 64000.
- O corpo final de requisição de OpenAI Compatible, OpenAI Responses e Anthropic apresenta respectivamente os campos padrão corretos.
- As combinações de provider/model OpenAI Compatible já validadas, assim como as requisições cujo provider id é `openai`, omitem o limite de saída; o OpenAI Compatible genérico e os providers Responses customizados continuam enviando.
- O Snowflake Cortex envia finalmente `max_completion_tokens`, sem manter `max_tokens` ao mesmo tempo.
- O comportamento de fixed thinking do Anthropic permanece compatível.
- O orçamento, a janela e o comportamento de thinking do Compact não mudam.
- Não há mudança de comportamento na resposta vazia, no `extra_body`, nos fatos de modelo nem na UI.