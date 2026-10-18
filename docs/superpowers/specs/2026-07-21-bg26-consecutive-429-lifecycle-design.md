# Design de Isolamento da Projeção de Falhas 429 do BG26

## Objetivo

Estabilizar o replay sintético `429` local ao case do BG26 e verificar que o erro original do provider entra na notificação de falha do background subagent, no hover de falha e na restauração de snapshot. O BG26 não adiciona nem altera a semântica de retry do modelo principal do produto, de fila ou de recuperação de stream.

## Evidência de runtime e causa raiz

No run de falha inicial `desktop-e2e-20260721-110945-241`, as child attempts 1 a 6 chegaram ao replay server, mas a attempt 7 teve apenas `model.request.started` / `model.network.started`; em outros runs o ponto de parada deriva. Os experimentos a seguir foram todos refutados por E2E real:

1. Depois de ajustar a ordem de cleanup/abort do stream no lado do produto, o teste focado passou, mas o BG26 continua travando antes do envio da requisição física.
2. Depois de fechar explicitamente a conexão da resposta 429, o run `desktop-e2e-20260721-121455-420` recebeu o primeiro 429, mas travou antes do envio da attempt 2.
3. Depois de definir apenas o retry do BG26 como 0, o run `desktop-e2e-20260721-122552-864` já registrou child `attempt=1/maxAttempts=1`, mas a primeira requisição física ainda não chegou ao replay server.

Portanto a falha não está na projeção, no hover, na restauração de snapshot nem na conversão de erros do produto. Como case de projeção, o BG26 também herda o retry padrão do produto e o canal global de fetch em nível de processo; depois que a requisição pai termina, a requisição child pode parar antes do replay server nesse canal de teste compartilhado. Reduzir o retry para uma única tentativa apenas estreita a semântica do case, sem isolar sozinho o canal instável.

```text
cadeia antiga
  parent title / launch / ACK
    -> canal global de fetch em nível de processo
  child 429 (por padrão ainda sofre retry)
    -> alguma tentativa, ou a primeira, tem apenas network.started
    -X-> replay server
    -> child sem failed terminal
    -> notificação pai nunca chega

cadeia alvo
  worker do BG26
    -> retry = 0
    -> ZCODE_HTTP_PROXY = replay server atual
    -> Node http + ProxyAgent independente da requisição atual
    -> 1 429 real
    -> child terminal failed
    -> notificação de falha no parent
    -> hover ao vivo
    -> restauração de snapshot após trocar de tarefa
```

## Solução

Adotar isolamento com um worker local ao case, sem modificar o código de rede do produto:

1. O `beforeSession` do WDIO identifica o BG26 com base nos worker specs atuais; apenas esse worker define `ZCODE_MODEL_RETRY_MAX_RETRIES=0`.
2. Depois que o replay server sobe e obtém a porta dinâmica, apenas o worker do BG26 define `ZCODE_HTTP_PROXY` como a base URL desse server e limpa o `ZCODE_NO_PROXY` explícito. O `ProxyAgent` envia HTTP URL em absolute-form, e o replay server já suporta esse formato.
3. Workers que não são BG26 e o modo capture restauram a configuração de proxy/no-proxy anterior ao start do WDIO, evitando interferência em outros cases ou no ambiente do desenvolvedor.
4. A fixture do BG26 mantém um `429 AccountRateLimitExceeded` real, a mensagem original do provider e `retry-after: 0`, removendo as fixtures de retry que não pertencem ao contrato deste case.
5. A mensagem do provider, o status code, o marcador child, o matcher de notificação e as asserções de UI/restauração permanecem inalterados.

Essa fronteira é consistente com a semântica já confirmada do BG26 no conversation case catalog: `429` serve apenas como representante de uma falha real e não define a semântica de retry/fila do modelo principal. O retry padrão do produto continua coberto pelos testes focados de adapters.

## Fronteira de impacto

- Modifica apenas a infraestrutura de testes, as fixture/manifest do BG26 e os testes direcionados.
- Não modifica `apps/zcode-cli`, `packages/ui`, `product-projection.ts`, a conversation projection nem timeouts de E2E.
- Os limites de runtime, snapshot e recuperação do `continuous` no desktop e do `web-remote-replayable` no celular não mudam.

## Resultados da verificação

- Isolamento de worker e testes focados do replay server: `8 passed`.
- Contrato de fixtures do BG26: `5 fixtures`, aprovado.
- Duas rodadas consecutivas do BG26 como está:
  - `desktop-e2e-20260721-123822-673`
  - `desktop-e2e-20260721-124220-804`
- As duas rodadas de capture tiveram 5 requisições completas, com apenas um `429` no child; o log do Agent registra `attempt=1/maxAttempts=1/statusCode=429`, seguido de `turn.failed`, `subagent.background.failed` e da requisição de notificação ao pai, com a mensagem original do provider preservada.