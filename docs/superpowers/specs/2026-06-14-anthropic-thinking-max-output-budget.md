# Anthropic Thinking Max Output Budget

## Contexto

Nas requisições MiMo compatíveis com Anthropic, quando `thinking.type = "enabled"` está habilitado, o AI SDK soma o `maxOutputTokens` da camada de requisição ao `thinking.budgetTokens` fixo para compor o `max_tokens` final visível ao provider. Quando o `maxOutputTokens` do metadata do modelo já é igual ao limite máximo de saída do provider, continuar somando o thinking budget faz o `max_tokens` final ultrapassar a faixa suportada pelo provider.

Requisição que falhou em produção:

- provider/model: `default-mimo/mimo-v2.5-pro`
- requestId: `d19aedba-9da4-477a-9765-696c9cb5eb00`
- `maxOutputTokens` da requisição: `131072`
- `thinking.budgetTokens` da requisição: `1024`
- erro do provider: `max_tokens 132096 is out of supported range (0, 131072]`

## Objetivo

- No transporte Anthropic, o `maxOutputTokens` escolhido pelo core é o orçamento total compartilhado entre o thinking e a saída visível, e o `max_tokens` final do provider não pode exceder esse valor.
- Quando o thinking fixo for maior que o orçamento total, apenas o thinking budget da requisição atual é limitado, sem modificar as opções compartilhadas do provider.
- Em transportes não-Anthropic o comportamento atual não muda.
- Sem thinking budget fixo habilitado, o comportamento atual não muda.

## Esquema

O thinking budget fixo precisa ser menor que o `max_tokens` final, ou seja, ser limitado a `min(configuredBudget, max_tokens - 1)`.
O ZCode envia as requisições pelo AI SDK, e o AI SDK soma o `maxOutputTokens` ao thinking budget; por isso, na etapa de construção das opções de requisição do adapter, os dois valores são projetados de forma unificada:

```text
effectiveThinkingBudget = min(configuredThinkingBudget, requestedMaxOutputTokens - 1)
aiSdkMaxOutputTokens = requestedMaxOutputTokens - effectiveThinkingBudget
```

Quando o orçamento total normalizado é menor que 2, o thinking fixo e a saída visível não conseguem obter pelo menos 1 token cada. O adapter
deve lançar `InvalidModelRequest` antes da requisição de rede, sem sintetizar um thinking budget zero ou negativo e sem desligar silenciosamente o
thinking configurado pelo usuário. Aqui não é introduzido o piso oficial de 1.024 token do Anthropic; orçamentos maiores ou iguais a 2 continuam
sendo projetados pela fórmula acima, preservando o espaço de protocolo do endpoint Anthropic-compatible BYOK.

Por exemplo, com orçamento total Compact de 20.000 e fixed thinking de 32.000, esta requisição usa
`thinking.budgetTokens=19.999` e `maxOutputTokens=1`, e o AI SDK envia no final
`max_tokens=20.000`. A projeção precisa clonar as opções Anthropic da requisição atual; a requisição principal seguinte continua usando a configuração original de thinking de 32K.

Nelas, `requestedMaxOutputTokens` continua seguindo as regras atuais:

- o `maxOutputTokens` explícito da requisição tem prioridade.
- no transporte Anthropic, quando ausente, continua sendo usado o padrão do adapter `32000`.
- em transportes não-Anthropic, quando ausente, continua não sendo enviado.

Não se modifica a escolha de candidate/baseline do preflight, não se desliga o Compact thinking e não se adiciona minimum, retry,
fallback nem casos especiais de side-request.

## Verificação

- Testes unitários cobrem `generateText` e `streamText` do Anthropic com fixed thinking budget descontando o orçamento.
- Testes unitários cobrem orçamento total de 0.5 e 1 retornando `InvalidModelRequest` antes do envio da requisição, e orçamento total de 2 ainda sendo projetado como
  1 token de thinking e 1 token de saída visível.
- Testes unitários cobrem o fixed thinking maior que o orçamento total limitando sincronamente as options desta requisição, com as options originais inalteradas.
- Um wire test cobre o cenário Compact enviando no final `max_tokens=20000` e `thinking.budget_tokens=19999`.
- Testes unitários cobrem o transporte OpenAI-compatible não sendo afetado.
- Executar `pnpm typecheck` e `pnpm lint`.