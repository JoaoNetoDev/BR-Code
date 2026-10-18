# Design do Agent Query ID

## Contexto

`sessionId` identifica uma sessão inteira, `traceId` identifica a cadeia técnica de observabilidade e `inputId` é usado principalmente para o stop da UI, a fila e o fechamento de estado final. As requisições de modelo ainda carecem de um campo de atribuição com semântica de usuário: desde o consumo de uma entrada real do usuário até o consumo da próxima entrada real do usuário, todas as requisições de modelo intermediárias deveriam pertencer à mesma query.

## Objetivo

- adicionar `queryId`, que representa o ciclo de vida de "uma entrada real do usuário".
- prompt normal, drained de queued prompt e turn steer devem carregar queryId.
- múltiplas requisições de modelo disparadas por uma entrada do usuário, requisições seguintes do tool loop e stream retry continuam usando o mesmo queryId.
- a camada de adapter de modelo grava `x-query-id` no header das requisições de `generateText` e `streamText`.
- quando chamadas antigas não têm queryId, o lado do agent faz fallback para `inputId`, evitando que clientes históricos percam a atribuição no caminho principal.

## Não objetivos

- não substituir `traceId`, `sessionId` ou `inputId` por `queryId`.
- não alterar a semântica de `inputId` no fechamento de estado final da UI, no roteamento do stop e no task owner command.
- não fabricar uma nova query de usuário para requisições puramente auxiliares. Requisições de modelo auxiliares como título, compactação e goal verifier apenas herdam o queryId já presente no traceContext; podem ficar vazias quando não há query real de usuário.

## Semântica

Uma entrada real do usuário cria um queryId:

```text
user message/query A
  -> model request 1, x-query-id=A
  -> tool calls
  -> tool results
  -> model request 2, x-query-id=A
  -> retry/recovery request, x-query-id=A
até a próxima user message/query B consumida
```

Um steer é uma nova entrada real do usuário. Ele não modifica a requisição de modelo em andamento, e sim injeta uma nova user message depois do tool result e antes da próxima model request. Cada steer deve ter seu próprio queryId.

## Regras de propagação

- ao criar uma entrada normal, a UI cria `inputId` e `queryId` juntos.
- o queued prompt local do renderer guarda o queryId e continua usando o queryId original no momento do drain.
- a fila de host commands do web remote replayable guarda o queryId e o host owner continua usando o queryId original quando realmente envia.
- os parâmetros de protocolo `session/send` e `session/steer` ganham um `queryId` opcional, obrigatório nas chamadas do caminho principal.
- o agent runtime grava o queryId ao criar o traceContext do turn em `executeTurn`.
- `steerTurn` salva o queryId no input pendente; no drain, o traceContext da próxima model request é trocado para esse queryId.
- o model adapter lê o queryId do traceContext/metadata da requisição e grava `x-query-id`.

## Compatibilidade

O campo de protocolo permanece opcional porque clientes antigos, requisições auxiliares e caminhos de teste históricos podem temporariamente não ter queryId. Estratégia de compatibilidade:

- `session/send`: `queryId ?? inputId`.
- `session/steer`: `queryId ?? inputId`.
- adapter: grava `x-query-id` somente quando existe queryId no status context.

## Edge Cases

- múltiplos steers chegando em sequência: cada steer é uma query independente e não pode ser combinado em um único queryId.
- steer já drenado: o queryId já entrou na requisição de modelo e não pode ser desfeito com a semântica de "retirar o input pendente".
- steer ainda na fila pendente: no futuro pode ser adicionado um protocolo de retirada por `pendingInputId/queryId`.
- não é possível inserir uma user message entre uma tool call e seu tool result; o steer só pode ser injetado depois do tool result e antes da próxima requisição de modelo.