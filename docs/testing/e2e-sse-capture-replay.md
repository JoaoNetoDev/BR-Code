# Captura e Replay de SSE no E2E

Objetivo: as interfaces de modelos externos dos E2E de desktop devem poder ser gravadas primeiro e depois
reproduzidas em ambiente totalmente isolado, respeitando a semântica de streaming. Respostas JSON comuns
podem continuar sendo reproduzidas com o body completo; `text/event-stream` precisa preservar a ordem e o
tempo relativo dos SSE events.

## Protocolo de Artifact

O registro de captura de rede continua sendo gravado em `E2ENetworkCaptureArtifact.records`. Quando a resposta
é SSE, um único record contém também:

```json
{
  "responseEvents": [
    {
      "sequence": 0,
      "offsetMs": 0,
      "byteLength": 356,
      "text": "event: message_start\ndata: {...}\n\n"
    }
  ]
}
```

- `sequence`: ordem dos SSE events dentro da mesma resposta.
- `offsetMs`: tempo relativo entre os primeiros dados de resposta SSE e o momento em que o event fica
  inteiramente disponível.
- `byteLength`: tamanho do event em bytes UTF-8.
- `text`: texto completo do SSE event, incluindo o separador de linha em branco final.

A camada de captura faz o parse por separadores de SSE event, e não por chunks TCP. A razão é que a fronteira
dos chunks é instável, e a semântica real do produto se importa com a ordem e o ritmo de events como
`message_start`, `content_block_delta` e `message_stop`.

## Protocolo de Fixture

O campo `response` da fixture de replay suporta duas formas:

```json
{
  "response": {
    "statusCode": 200,
    "headers": { "content-type": "text/event-stream; charset=utf-8" },
    "closeMode": "end",
    "events": [
      { "sequence": 0, "offsetMs": 0, "byteLength": 100, "text": "event: ...\n\n" }
    ],
    "body": "event: ...\n\n"
  }
}
```

- Com `events`, o replay server escreve a resposta em segmentos conforme `offsetMs`, sem definir
  `content-length`.
- Sem `events`, mantém-se o comportamento antigo, gravando `body` de uma só vez.
- `body` pode permanecer como campo para inspeção manual e compatibilidade com ferramentas antigas, mas a
  automação deve preferir `events`.
- `closeMode` só tem significado para o replay em streaming de `events`. O padrão `end` significa EOF normal;
  `destroy` significa destruir o socket depois de escrever os events declarados, usado para simular uma queda
  anormal no meio do SSE. O network artifact gerado por `destroy` marca o record como `status="error"` e grava
  `replay.closeMode="destroy"`.

O nível superior da fixture também aceita um `maxMatches` opcional:

```json
{
  "id": "upstream-auto-compact-retry-empty-1",
  "maxMatches": 1,
  "match": {
    "bodyIncludes": ["CRITICAL: Respond with TEXT ONLY"]
  }
}
```

`maxMatches` afeta apenas a ordem de matching do replay server local, para expressar sequências de teste do tipo
“as primeiras N requisições do mesmo tipo retornam A e depois as seguintes continuam casando com fixtures
posteriores e retornam B”. Por exemplo, o retry automático de compactação faz as duas primeiras requisições de
summary retornarem texto vazio e a terceira retornar um summary bem-sucedido. Não é um campo de protocolo do
produto e não entra em requisições online.

O replay server também grava no artifact de captura a fixture que foi casada:

```json
{
  "replay": {
    "fixtureId": "upstream-sse-disconnect-after-delta",
    "closeMode": "destroy"
  }
}
```

Isso serve para diagnosticar a ordem de matching das fixtures e o tipo de injeção de falha; não é um campo de
capture online.

## Modos de execução

- `replay`: modo padrão, todas as requisições do DeepSeek vão para o replay server local, usando as respostas
  das fixtures. Adequado para execução totalmente isolada em Docker.
- `capture`: habilitado ao definir explicitamente `E2E_PROVIDER_HTTP_MODE=capture`, ativa um MITM proxy, acessa
  o upstream real e gera um artifact com `responseEvents`. Os artefatos gravados passam por review antes de serem
  convertidos em fixtures.

## Replay em Docker

O ponto de entrada do contêiner é `pnpm test:e2e:container`, orquestrado por
`scripts/test-desktop-e2e-container.sh`. O modo de rede padrão é `E2E_NETWORK_MODE=replay-isolated`:

```bash
E2E_NETWORK_MODE=replay-isolated \
E2E_SPEC=./test/e2e/conversation-session/manual-review/pending/conversation-session-compact.test.ts \
pnpm test:e2e:container
```

`replay-isolated` adiciona `--network none` ao contêiner de teste e força `E2E_PROVIDER_HTTP_MODE=replay`.
Nesse caso WDIO, Electron, app, agent e o replay server do DeepSeek rodam todos no mesmo contêiner, e a
interface de modelos externos não sai para a rede.

O JSON de capture/replay do DeepSeek é montado em `network-capture/` dentro do diretório do relatório atual, com
o arquivo padrão `network-capture/upstream-provider.json`. Esse JSON registra as requisições do app ao DeepSeek,
as respostas e a linha do tempo dos `responseEvents` de SSE, podendo servir de base para o review de fixtures e
para replays posteriores.

Modos opcionais:

- `E2E_NETWORK_MODE=replay-isolated`: padrão, replay sem rede, apenas loopback dentro do contêiner.
- `E2E_NETWORK_MODE=bridge`: usa a rede padrão do Docker, mas o DeepSeek continua em replay por padrão.
- `E2E_NETWORK_MODE=capture`: gravação com saída de rede controlada; o script força
  `E2E_PROVIDER_HTTP_MODE=capture` e exige uma `E2E_PROVIDER_API_KEY` real.

Exemplo de comando de gravação:

```bash
E2E_NETWORK_MODE=capture \
E2E_PROVIDER_API_KEY=sk-... \
E2E_SPEC=./test/e2e/conversation-session/manual-review/pending/conversation-session-compact.test.ts \
pnpm test:e2e:container
```

Os artefatos de `capture` saem em `network-capture/upstream-provider.json` e, após o review, são convertidos em
fixtures; o CI e a regressão diária devem usar `replay-isolated`.