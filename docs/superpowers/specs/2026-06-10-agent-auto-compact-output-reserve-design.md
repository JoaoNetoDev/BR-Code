# Design da reserva de output do Auto Compact do Agent

## Contexto

O runtime do Agent usa `contextWindow - outputReserve` como orçamento de compactação automática do lado de entrada antes de enviar a requisição ao modelo. Quando `maxOutputTokens` está configurado explicitamente, a política de compactação automática usa essa configuração; quando não está, a lógica antiga fazia fallback para `32_000`.

Quando não recebe `maxOutputTokens`, o adapter da Anthropic completa a requisição do modelo principal com um default de `64_000` output tokens. Com o thinking habilitado, o corpo final da requisição da Anthropic ainda pode somar o thinking budget em cima de `max_tokens`, por exemplo `64_000 + 1_024`.

Portanto, quando `limit.output` do modelo não está configurado, há uma inconsistência de defaults entre o orçamento de compactação automática e o orçamento real da requisição ao modelo: o lado do compact reserva output com `32_000`, enquanto o lado da requisição envia `64_000`, deixando o limiar do lado de entrada frouxo demais.

O catálogo de modelos também contém muitos modelos com `limit.output > 64_000`, alguns até iguais ou maiores que `limit.context`. Se o limiar do auto compact usar diretamente esses limites de output enormes, o `effectiveContextWindow` será reduzido a valores mínimos ou até zero, fazendo a sessão compactar cedo demais ou repetidamente mesmo com mensagens suficientes. O cálculo do limiar precisa usar uma reserva de output estratégico, em vez de tratar o limite máximo de output declarado pelo provider como reserva permanente de cada turno.

## Objetivos

- Quando `maxOutputTokens` não está configurado, o output reserve padrão do agent auto compact passa a ser `64_000`.
- O `maxOutputTokens` explicitamente configurado continua tendo prioridade sobre o valor padrão, mas tanto o limiar do auto compact quanto o limite de output na requisição real ao modelo são calculados no máximo como `64_000`.
- `summaryReserveTokens` ainda pode servir como item de override para testes ou estratégia, mas o valor padrão e o teto passam a acompanhar `64_000`.
- `effectiveContextWindow`, `inputBudgetTokens` e `outputReserveTokens` nos logs de compactação refletem a reserva limitada usada no limiar de compactação; `maxOutputTokens` continua registrando a configuração real do modelo.

## Não objetivos

- Não modificar o formato do arquivo de configuração do usuário.
- Não obrigar a escrever `limit.output` para todos os modelos customizados.
- Não alterar o comportamento default de `64_000` da Anthropic que o adapter já possui.
- Não implementar, nesta mudança, medição de usage do provider somada à estimativa incremental de entrada.

## Comportamento

Quando `maxOutputTokens` está ausente na runtime config:

```text
outputReserveTokens = 64_000
effectiveContextWindow = contextWindow - min(64_000, contextWindow)
autoCompactThreshold = floor(effectiveContextWindow * 90%)
```

Quando `maxOutputTokens` está presente na runtime config:

```text
rawOutputReserveTokens = maxOutputTokens
outputReserveTokens = min(rawOutputReserveTokens, 64_000)
effectiveContextWindow = contextWindow - min(outputReserveTokens, contextWindow)
```

Exemplo: `contextWindow = 200_000` sem `limit.output`:

- Lógica antiga: `effectiveContextWindow = 168_000`, limiar `151_200`
- Lógica nova: `effectiveContextWindow = 136_000`, limiar `122_400`

Isso faz o auto compact disparar mais cedo sob o orçamento de output padrão da Anthropic, evitando que o orçamento do lado de entrada seja mais frouxo que a requisição real.

Exemplo: `contextWindow = 200_000` com `limit.output = 131_072`:

- Lógica antiga: `effectiveContextWindow = 68_928`, limiar `62_035`
- Lógica nova: `effectiveContextWindow = 136_000`, limiar `122_400`

Isso evita que um limite de output enorme consuma o orçamento do lado de entrada; o catálogo de modelos ainda pode manter `maxOutputTokens = 131_072` como informação de capacidade original, mas a requisição em runtime será limitada conforme a regra abaixo.

O mesmo teto também é aplicado quando a requisição do mesmo modelo é enviada ao provider:

```text
requestMaxOutputTokens = min(configuredMaxOutputTokens, 64_000)
provider max_tokens <= 64_000
```

A requisição de thinking da Anthropic precisa preservar a dedução existente do thinking budget: primeiro limitar o max output configurado a `64_000` e depois deduzir o thinking budget fixo, evitando que o `max_tokens` final montado pelo AI SDK ultrapasse `64_000`.

## Verificação

- `apps/zcode-cli/packages/core/tests/compact-policy.test.ts` cobre que, sem `maxOutputTokens` configurado, a reserva padrão é `64_000`.
- `apps/zcode-cli/packages/core/tests/compact-policy.test.ts` cobre que, com `maxOutputTokens > 64_000`, a reserva do auto compact é limitada a `64_000`.
- `apps/zcode-cli/packages/core/tests/runtime-model-anomaly.test.ts` cobre o teto do `maxOutputTokens` passado pelo runtime ao model adapter.
- `apps/zcode-cli/packages/adapters/tests/runner-options.test.ts` cobre o teto do `maxOutputTokens` nas options de requisição do AI SDK, bem como a requisição final da Anthropic com thinking não excedendo `64_000` após a dedução.
- Execução de regressão:
  - `pnpm --dir apps/zcode-cli/packages/adapters exec vitest run tests/runner-options.test.ts tests/runner.test.ts`
  - `pnpm --dir apps/zcode-cli/packages/core exec vitest run tests/runtime-model-anomaly.test.ts tests/compact-policy.test.ts`
  - `pnpm typecheck`
  - `pnpm lint`