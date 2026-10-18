# Compact Stream-first → Fallback Non-stream: design

## Status

- Data: 2026-07-15
- Baseline: ZCode `feat/streamable-compact`
- Tipo de mudança: ajuste de transport da requisição auxiliar de compact summary
- Não objetivos explícitos: fork de cache-sharing, summarizer independente, estado de produto do compact ou ajuste de semântica de prompt

## Contexto

Antes da mudança, o ZCode chamava
`modelAdapter.generateText(...)` diretamente em `compactActiveConversation()`. Portanto, mesmo que a requisição principal comum use SSE, o compact summary continuava fixado em requisições HTTP
non-stream.

O comportamento desejado é que a requisição de compact summary tente streaming primeiro; quando o streaming ainda falha após retry interno, pode-se recuar para non-streaming na fronteira em que um bloco completo de assistant content ainda não foi submetido. `thinking_delta` / `content_block_delta`
continuam sendo conteúdo in-flight, e `content_block_stop` é a fronteira de commit.

Este design ajusta apenas essa ordem de transport e essa fronteira de segurança, sem alterar as demais semânticas do compact.

## Objetivo

Um compact attempt lógico executa de forma fixa:

```text
streamText(compactRequest)
  ├─ sucesso → retorna o resultado agregado oculto
  └─ falha terminal antes do bloco submetido
       → generateText(o mesmo compactRequest)
```

Garantindo simultaneamente:

1. o delta de streaming do compact não entra em session event, UI nem realtime stream;
2. o fallback não altera o prompt, as tools, o thinking, a selection, o preserve nem a persistence do compact;
3. a retry policy interna de SSE/HTTP do adapter e as três tentativas lógicas externas do auto compact permanecem inalteradas;
4. abort, context exceeded e media too large continuam seguindo o tratamento dedicado já existente e não são engolidos pelo fallback de transport.

## Relação com o fork de cache-sharing

O fork de cache-sharing é um ramo de execução auxiliar interno do compact: serve para reaproveitar o prefixo de cache da sessão principal e isolar a geração do
summary do estado da sessão principal. Ele não é pré-requisito do stream transport e também não é um fork de sessão visível ao usuário.

Desta vez esse ramo não é introduzido, e o system prompt de summarizer independente após falha do cache-sharing fork também não é implementado. O gap P32
direct-summarizer/cache-sharing existente continua postponed.

## Fronteira da implementação antes da mudança

### Compact no Core

`apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts` é atualmente responsável por:

- criar um `ModelRequest(querySource=compact)`;
- montar mensagens projetadas, compact tools, provider options, status sink, trace e o hook de refresh de headers;
- chamar `modelAdapter.generateText(...)` diretamente;
- tratar abort, media too large, context exceeded, usage fact, validação do summary e persistence;
- o auto trigger executa no máximo 3 compact attempts lógicos, e o manual trigger executa apenas 1.

### Retry do Adapter

`runner-stream.ts` e `runner-generate.ts` já possuem, respectivamente, retry de SSE/HTTP. O Core não duplica esses dois loops
de retry. O adapter de stream não continua reproduzindo SSE depois de já ter emitido um retry boundary event para o upstream; o helper de
compact pode alternar com segurança para HTTP porque todos os deltas ainda estão ocultos e ainda não há um content block completo.

### Visibilidade de eventos

O coletor de streaming da requisição principal comum produz `ModelStreaming`. O compact não pode reutilizar esse coletor visível;
caso contrário, o rascunho do summary poluiria o transcript da sessão, o desktop continuous e o estado replayable do web-remote.

## Design

### Novo helper

Adicionado:

`apps/zcode-cli/packages/core/src/runtime/methods/compact-summary-model-request.ts`

Interface principal:

```ts
runCompactSummaryModelRequest({
  logger,
  modelAdapter,
  request,
}): Promise<RuntimeModelTextResult>
```

Responsabilidades:

1. iterar primeiro `modelAdapter.streamText(request)`;
2. agregar em memória, por bloco de conteúdo, o text submetido, as tool calls, o finish reason, o usage e os provider metadata de topo que o compact realmente consome;
   o reasoning registra apenas se houve delta e se o bloco foi concluído, sem manter o corpo nem o metadata do bloco;
3. não chamar `createModelStreamingEventQueue()` e não publicar nenhum `ModelStreaming`;
4. quando o stream termina normalmente, retornar um `RuntimeModelTextResult` com a mesma forma de `generateText()`;
5. em falha de stream elegível, registrar um warn de baixa frequência e chamar `modelAdapter.generateText(request)`;
6. quando o fallback falha, lançar o erro de fallback, mantendo o erro de stream original preservado no network status e nos logs de degradação.

### Identidade da requisição

`compact-active.ts` constrói apenas um request object. A perna de stream e a perna de HTTP reutilizam os seguintes campos semânticos:

- `abortSignal`
- `model`
- `maxOutputTokens` / `maxOutputTokensSource`
- `messages`
- `metadata`
- `providerOptions`
- `statusSink`
- `traceContext`
- `tools`
- `refreshRuntimeHeadersBeforeAttempt`

O hook de refresh de headers ainda pode produzir headers novos em cada attempt físico; os testes comparam apenas as entradas semânticas visíveis ao provider
e não exigem que headers dinâmicos ou request id do adapter sejam idênticos.

### Agregação oculta do stream

O compact summary continua carregando o runtime/MCP tool schema existente, para manter o request visível ao provider e o
formato de cache; mas `formatCompactSummaryOrThrow()` rejeita qualquer tool call antes do executor, e o compact não executa ferramentas.
Portanto o compact não precisa da otimização das requisições principais comuns de "publicar a tool call assim que o JSON de argumentos fica completo". O Compact request faz
apenas um opt-in unidirecional: definir o campo somente de runtime `preserveProviderStreamBoundaries: true`. Esse campo preserva de forma unificada três grupos de
proveniência de stream do provider: o primeiro evento real do provider encerra a elegibilidade de retry de SSE; o response start do provider, o
start/delta/stop de content block do provider com mesmo index e legalidade de tipo, e o fato de o stop reason final ser truthy decidem se o stream forma um resultado aceitável; o
stop de um content block real forma o commit que não pode ser reproduzido por HTTP. O `start` sintetizado localmente pelo AI SDK antes de ler o stream do provider não conta como evento do
provider e ainda pode usar o retry de adapter existente; o opt-in do compact precisa estar habilitado e observar apenas os raw provider chunks
dentro do adapter, de modo a cobrir o response start, o block start/delta/stop e o stop reason que podem ser engolidos ou sintetizados pelo AI SDK. Cada provider
`message_delta` sobrescreve o stop reason atual, e um `null` subsequente limpa o valor anterior; um raw `ping` não forma fronteira,
e a chegada de qualquer outro raw event encerra o retry de SSE, mas, desde que ainda não haja um block stop real, o Core ainda pode descartar o partial oculto e seguir para
o fallback non-stream. O raw chunk em si não é projetado para Core/UI; o adapter envia ao coletor do compact apenas eventos de fronteira semântica sem corpo.
O Core registra o block type de `content_block_start` pelo raw block index e valida apenas a compatibilidade de delta (sem fazer parsing do corpo): `text_delta→text`, `input_json_delta→tool_use/server_tool_use`,
`signature_delta→thinking`, `thinking_delta→thinking/redacted_thinking`, e `citations_delta` e deltas futuros desconhecidos passam quando o bloco já existe. `content_block_stop` só pode ser submetido
quando o mesmo index já foi estabelecido, o tipo do delta não está em conflito e a response já começou. As requisições principais comuns que não definem esse campo continuam com o comportamento existente de
eager tool-call, prelude retry-safe e final best-effort; aqui não se adiciona um segundo booleano nem uma política de transport genérica.
Raw start/delta/stop ilegais lançam imediatamente; o gate de fallback decide apenas pelo commit anterior existente, sem manter um estado intermediário de "continuar drenando e depois julgar".

Tratamento de eventos:

| `ModelStreamEvent`                                    | Ação de agregação oculta                      | Elegibilidade de retry SSE       | Commit de fallback HTTP          |
| ----------------------------------------------------- | ------------------------------------ | ------------------------- | -------------------------------- |
| `start` sintético do AI SDK                              | não salvo                              | preservada                      | não                               |
| raw provider event (exceto `ping`)                     | apenas observado; o corpo raw não é projetado para Core/UI    | encerrada                      | não                               |
| fronteira semântica `response_start` do provider                    | registra que a response do provider foi estabelecida        | encerrada                      | não                               |
| fronteira semântica `content_block_start(index,type)` do provider   | registra o raw block index/type            | encerrada                      | não                               |
| fronteira semântica `content_block_delta(index,type)` do provider   | valida a existência do bloco e a compatibilidade de tipo de delta     | encerrada                      | não                               |
| fronteira semântica `content_block_stop(index)` do provider         | fixa o commit real do bloco quando o mesmo index é válido | encerrada                      | sim                               |
| fronteira semântica `message_delta.stop_reason` do provider         | sobrescreve o estado truthy do stop reason atual     | encerrada                      | não                               |
| `text_start` / `reasoning_start` / `tool_input_start` | apenas observa o provider event                | encerrada                      | não                               |
| `text_delta`                                          | acrescenta ao pending text block correspondente        | encerrada                      | não                               |
| `reasoning_delta`                                     | registra apenas que houve partial delta           | encerrada                      | não                               |
| `tool_input_delta`                                    | não projeta para a UI e aguarda o input end real     | encerrada                      | não                               |
| `tool_input_end` / `tool_call` completo do provider          | agrega a tool call que será negada             | encerrada                      | inferido apenas sem raw block provenance |
| `text_end` / `reasoning_end`                          | fecha o bloco; o text só entra no summary agora  | encerrada                      | inferido apenas sem raw block provenance |
| `tool_call`                                           | normaliza, deduplica por id e salva          | encerrada                      | inferido apenas sem raw block provenance |
| `finish`                                              | salva usage/finish/provider metadata  | encerrada                      | não; também precisa satisfazer o gate de integridade do stream |
| `error`                                               | entra no fallback gate após normalização           | preservada apenas para stale/watchdog antes do primeiro event; erros de protocol/business SSE encerram | depende do estado de commit               |

`text_delta` / `reasoning_delta` e JSON de tool já analisável mas que ainda não chegou ao provider block stop, mesmo quando já chegaram, não
ficam visíveis externamente; eles encerram a elegibilidade de retry deste SSE físico, mas, enquanto o stream inteiro ainda não tiver completado nenhum content
block de provider, o Core ainda pode descartar o hidden partial e executar o fallback non-stream. Esses correspondem respectivamente à fronteira first-provider-event e à fronteira
de commit `content_block_stop`. O critério não é se uma parte isolada contém texto nem se o texto final do summary fica vazio. Para providers que fornecem raw message-block provenance, o
`text_end` / `reasoning_end` / `tool_input_end` sintetizado pelo AI SDK não pode substituir um `content_block_stop` real; a inferência de end normalizado existente só é mantida para providers
sem esse raw provenance. Mesmo que um `finish` clean chegue depois, um pending text que não passou por
`text_end` não pode entrar no summary; quando há um bloco de text completo e depois surge um bloco de cauda não fechado, apenas o bloco
concluído é mantido.

Aqui, "vazio" é julgado pela response inteira do provider e não por uma parte isolada: um bloco
text/reasoning vazio já concluído ainda chega ao commit do bloco e portanto não gera mais retry de SSE nem pode ser reproduzido por HTTP; se, após um
clean EOF de todo o stream, não houver response/block/stop reason legítimo, não se acrescenta retry de SSE e sim um fallback non-stream
único. Um `text_delta` vazio, um fragmento de JSON vazio ou uma parte local sem corpo não podem disparar retry sozinhos.
Se o stream quebrar após um delta de JSON de tool completo e antes do input end real, o adapter não pode sintetizar antecipadamente um
`tool_call` submetido; se um `finish` normal chegar, qualquer tool call real continua sendo rejeitado pela validação de deny do compact e jamais entra no
tool executor.

O `content_block_stop` real do provider é o commit do bloco de tool de um message-block provider. O AI SDK pode sintetizar localmente
`tool_input_end/tool_call` a partir de `message_start.content`; esse tipo de evento não tem provider block stop e não pode
impedir o fallback antecipadamente. Para providers que não fornecem raw message-block provenance, um `tool_call` direto completo continua sendo uma
inferência de commit utilizável; mesmo que a validação de name/input dele falhe, o adapter precisa primeiro entregar o commit marker ao Core e encerrar o
retry de SSE antes de propagar o erro, evitando que um bloco já submetido seja reproduzido por HTTP. Em seguida, qualquer tool call agregada com sucesso continua rejeitada pelo deny
unificado do compact, e nenhuma ferramenta é executada. Um `finish` sozinho apenas salva o resultado e não pode sintetizar
`tool_input_end/tool_call` para um bloco de tool não fechado nem se passar por `content_block_stop`.

O flush unificado do assembler só é julgado pelo opt-in do compact: o main comum mantém o final best-effort já existente para blocos de tool não fechados;
o compact, ao encontrar `finish` do provider ou EOF do iterator, nunca pode sintetizar commit no lugar de um input end real ausente.
Aqui não se mantêm mais dois pontos de entrada de flush de comportamento idêntico nem o parâmetro `source/includeUnended`.

Sob o opt-in do compact, o Adapter dirige `fullStream.next()` manualmente; apenas `next.done=true` é um EOF natural. Retry,
erro terminal, falha de validação de direct tool-call ou saída antecipada do consumer devem, no `finally`, abortar primeiro o linked signal deste attempt físico,
e depois chamar, em best-effort, o `return()` do iterator subjacente. Apenas `return()` não cancela o provider stream retido pelo
`tee()` do AI SDK; a saída antecipada do consumer também precisa publicar uma vez o estado final cancelled non-retryable, evitando
um SSE `model_request_started` pendente antes do fallback. Essa limpeza não altera a decisão de retry/fallback nem aborta
o signal do caller em sentido inverso. O stream main comum não habilita essa lógica de cancelamento ativo/complemento de estado final e continua
com o ciclo de vida existente em que o iterator só é fechado em best-effort quando o caller já tiver abortado ou estiver ocioso.

O Adapter só marca o `streamFailurePhase` interno em terminal error quando há evidência dura e armazena o status de transport duro separadamente
como `httpResponseStatus`: iterator ainda não construído, ou response non-2xx real que ainda não entrou no corpo SSE, pertence a
`request_setup`; boundary de provider já observado, status real da response subjacente 2xx, chunk `error` do fullStream já recebido, ou
`content-type` da response `text/event-stream`, pertence a `response_body`. O status real de transport tem prioridade sobre o header da response;
`ProviderBusinessError.responseStatus` tem prioridade sobre o `statusCode` que pode já ter sido sobrescrito pelo código de negócio, e o
`response.status` do payload de finish também é extraído como status de transport; um `RetryError` precisa ser desembrulhado antes da comparação com a evidência interna.
Um socket reset antes do primeiro event e sem evidência de status/response permanece desconhecido e não pode ser presumido como
setup. Um `EPIPE` lógico mesmo em body HTTP 200 real não pode se passar por transport stale. Esses campos existem apenas no contexto de erro
do adapter e não entram em contracts/protocol/UI.

### Gate de fallback

Quando há stream error (incluindo o iterator tail error depois do `finish`), o iterator não produz um finish utilizável, ou um clean finish
não satisfaz as condições de integridade do stream, o julgamento segue esta ordem:

1. `isTurnCancellationError(error, request.abortSignal)`: lançar diretamente;
2. `isModelContextExceededError(error)`: lançar diretamente, entregando à reselection/truncation de compact já existente;
3. `isModelMediaTooLargeError(error)`: lançar diretamente, entregando ao retry de strip-media já existente;
4. já ter recebido um provider content block stop real com o mesmo index do raw start, ou ter concluído um bloco text/reasoning/tool normalizado sem raw message-block provenance: lançar diretamente, proibindo a reprodução por HTTP;
5. `streamFailurePhase=request_setup`: pode-se usar primeiro o retry de adapter/API já existente; depois de esgotado, apenas um `httpResponseStatus=404` real continua para o fallback non-stream, enquanto outros HTTP 4xx/5xx, erros síncronos de runtime/setup e erros de validação de provider/model/config/request são lançados diretamente;
6. erros de protocol/business SSE com `streamFailurePhase=response_body` não fazem mais inner SSE retry; desde que ainda não haja
   bloco submetido, o fallback non-stream é permitido. `ECONNRESET` / `EPIPE` / `ConnectionClosed` antes do primeiro provider event e o
   stream idle watchdog ainda podem usar primeiro o retry de SSE existente; quando o caller já cancelou, a semântica de cancelamento tem prioridade e
   nenhum retry é publicado;
7. quando não havia bloco submetido antes, o raw message-block provenance sem response start, um delta/stop cujo start do mesmo index não é encontrado, um delta com tipo em conflito com o do bloco, ou um clean finish sem bloco submetido e sem provider stop reason final truthy: tratar como stream-no-events;
8. outra falha terminal de stream elegível: descartar o estado parcial oculto e chamar `generateText(request)`.

Depois que o stream recebe `finish` e o iterator chega a um clean EOF, só há sucesso se pelo menos um destes for verdadeiro — "há bloco submetido" ou "o stop reason real final é truthy" — e o message-block
provider tiver observado o response start. Um summary vazio sob stop reason normal, um bloco vazio submetido ou uma tool call submetida continuam sendo entregues a `createCompactContextExceededFinishError()` e
`formatCompactSummaryOrThrow()`; o `finishReason:other` sintetizado por padrão pelo AI SDK sem raw stop reason não pode, sozinho,
provar sucesso.

### Temporalidade e contagem

```text
CompactStarted(operationId, logicalAttempt)
  └─ ModelRequest（um evento lógico）
      ├─ SSE physical attempts（adapter-owned）
      └─ HTTP physical attempts（após o fallback, adapter-owned）
  └─ ModelComplete ou compact failure/retry existente
```

- `ModelRequest`: cada compact request lógico ainda é criado apenas uma vez;
- `ModelNetworkStatusEvent`: preserva cada request físico, com transport `sse` / `http` respectivamente;
- `ModelComplete`: é criado uma única vez, apenas para o resultado final bem-sucedido;
- auto compact: continua com no máximo 3 attempts lógicos, e o número de requisições físicas ao provider não pode substituir essa asserção.

### Logs

O fallback é uma degradação recuperável e registra no máximo um `warn` por attempt lógico:

```text
event=compact.summary.stream_to_non_stream_fallback
module=core.runtime
```

O log registra apenas trace, model, um resumo do erro e se houve observação de partial delta, e não registra prompt, summary nem o conteúdo
por delta. É proibido adicionar logs info de alta frequência.

## Explicitamente não feito

- não modificar `shouldStreamModelText()` nem o transport da requisição principal comum.
- não modificar o número de retries do adapter, o backoff, o timeout de SSE idle nem a retry policy geral da requisição principal comum; apenas fazer o opt-in
  do compact preservar um end real de content-block, de modo que o retry do adapter e o fallback do Core vejam a mesma proveniência de commit.
- não implementar cache-sharing fork, summarizer independente nem modelo de compact fixo.
- não modificar o prompt do compact, a superfície/política de deny de tools, o thinking, o cache control nem a projeção de mídia.
- não modificar o ciclo de vida manual/auto/reativo, a selection, o preserved tail, a fronteira nem os lembretes pós-compact.
- não adicionar schema de protocolo, estado de UI, mensagens de desktop/web remote nem campos de snapshot.
- não adicionar ao código de produção um ramo de compatibilidade de teste do tipo "se o model adapter não tiver `streamText`, vá direto para HTTP".
- não usar fakes de teste para sintetizar um `text_end` sem origem que impeça o fallback; os fakes antigos só continuam mapeando resultados bem-sucedidos para stream, e as falhas
  devem ser passadas adiante como um erro pre-commit real.

## Contrato de testes

### Helper do Core

`compact-summary-model-request.test.ts` cobre:

- sucesso de stream, sem chamar generate;
- falha de first-event, EOF sem finish, SSE vazio e fallback de `response_start → response_stop` sem block/stop reason;
- um provider stop reason final truthy aceita clean finish sem block, e um `null` subsequente remove essa elegibilidade; response start ausente, block start do mesmo index ausente ou tipo de delta em conflito fazem fallback quando não havia commit anterior; um bloco ruim após um commit de block existente mantém o commit e proíbe a reprodução;
- o tool end sintetizado pelo AI SDK a partir do payload de response-start não se passa por provider block stop;
- fallback após delta de text/reasoning e antes do fim do bloco;
- sem fallback após commit de content block/tool call, incluindo o bloco vazio sem delta;
- abort/context/media sem fallback;
- erros síncronos de request setup e HTTP 400/401/403/429/500 não fazem fallback nem mesmo após passarem pelo retry de API existente, e
  esgotados; o HTTP 404 permanece como caso especial de fallback; status HTTP real e status lógico do corpo SSE são separados;
- o error lógico 500/1234 em corpo SSE com HTTP 200 não faz um segundo retry de SSE e faz fallback quando está pre-commit;
- resultado vazio/tool call no finish do stream retornando à validação já existente;
- sucesso/falha de fallback e reutilização do objeto de request;
- deduplicação de tool call, observação de delta/commit de reasoning e agregação de usage/provider metadata.

### Runner do Adapter

`runner.test.ts` cobre:

- a ordem de eager tool-call da requisição main comum permanece inalterada;
- o JSON de tool completo do compact só é publicado no input end, mas o commit é definido pelo block stop real do provider;
- o compact para o retry de SSE após o primeiro start/delta real do provider, e o Core decide diretamente o fallback HTTP;
- erros de protocol/business SSE com HTTP 200 do compact vão direto para o fallback do Core; o setup mantém o retry de API existente,
  e no stream interno apenas stale transport/watchdog antes do primeiro event mantém o retry de SSE, com a cancelamento do caller tendo prioridade;
  a requisição main comum fica inalterada;
- o status HTTP real tem prioridade sobre o header `event-stream`, e o status lógico de um chunk de erro do fullStream não se passa por
  request setup; o `response.status` de finish e o status interno de RetryError continuam preservados; quando o HTTP 404 e o lógico 500
  conflitam, o fallback ainda segue pelo 404 real, e um lógico 404 sem 404 real não faz fallback;
- o `start` sintetizado localmente pelo AI SDK não se passa por evento do provider, e o retry de adapter existente antes do evento permanece inalterado;
- sem raw provenance, o fim de um bloco text/reasoning vazio do compact também representa um bloco completo: encerra imediatamente o retry de SSE
  e proíbe o fallback HTTP; no caminho raw das Anthropic Messages, somente o `content_block_stop` correspondente vale como commit;
- o mesmo bloco vazio, sem o opt-in do compact definido, mantém o comportamento de retry existente da requisição main comum;
- um throw do iterator ou um EOF antes do input end real não sintetizam commit de tool call;
- mesmo uma falha de validação de name/input de direct tool call fixa primeiro o commit provável, sem disparar retry do adapter nem reprodução por HTTP;
- um EOF não natural do compact aborta este attempt físico, fecha o iterator subjacente e completa o estado final cancelled; um EOF normal
  não cancela duas vezes, e o signal do caller não sofre impacto inverso; o fechamento do consumer main comum mantém o ciclo de vida existente;
- response start real, content block start/delta/stop com index/type, e a sobrescrita de cada stop reason são projetados como fronteiras semânticas exclusivas do compact, e o corpo raw não vaza.
- protocolo raw inválido falha imediatamente no ponto de observação; sem commit existente há fallback, e com commit existente o erro sobe diretamente;

### Compact do Runtime

`runtime-compact.test.ts` cobre:

- manual/auto/reactive usando em conjunto o helper stream-first;
- um `ModelRequest` lógico e um `ModelComplete` final;
- o compact não produz `ModelStreaming`;
- as asserções existentes de prompt, tools, thinking, media/context, timeline, retry e persistence continuam passando.

### Integração com provider roteirizado

`openai-responses-compact` executa de forma fixa:

1. main setup: sucesso de SSE, com asserção direta de que a requisição correspondente a esse marker é `stream:true`;
2. perna de stream do compact: `stream:true`, retornando 404 non-retryable;
3. perna HTTP do compact: retorna um JSON de sucesso sem `id` de message e sem `annotations` de output_text;
4. main pós-compact: sucesso de SSE, com asserção direta de que a requisição correspondente a esse marker é `stream:true` e com o
   summary marker observado na provider request.

As duas requisições main precisam ser localizadas separadamente pelos markers setup / post-compact; não é permitido usar a asserção frouxa de "existe
`stream:true` em qualquer provider request", porque a própria primeira perna do compact também é streaming.

Essa fixture é a evidência complementar de provider/transport do F08 e não adiciona estado de produto de conversation. F09/C01 apenas atualizam
a terminologia de "attempt lógico e perna de transport física"; o estado final de produto permanece inalterado.

### Evidência deligação formal do Desktop

`conversation-session-compact-stream-fallback.test.ts` acrescenta apenas um caminho representativo, sem expandir o estado de produto:

```text
desktop /compact
  -> runtime compact summary
     -> stream:true / synthetic non-retryable failure
        -> non-stream / JSON success
           -> manual compact success marker
```

A primeira perna da fixture precisa casar explicitamente com `stream:true`, e a segunda precisa excluir `stream:true`; o spec afirma ao mesmo tempo que as requisições de provider do compact são
exatamente duas e verifica a partir do capture artifact que a última perna é 2xx non-stream. O sucesso de stream normal continua sendo provado pelo
`conversation-session-v4-compact.test.ts` já existente. Ramos como abort/context/media/commit boundary permanecem nos testes
unitários do core, sem expansão cartesiana para desktop/provider.

## Critérios de aceitação

- a primeira requisição física do compact é SSE; quando há sucesso de stream não há requisição HTTP;
- há fallback HTTP após uma falha de stream elegível;
- partial delta não entra em sessão/UI, e o fallback de summary é concluído apenas uma vez;
- as semânticas de abort/context/media/commit/tool validation permanecem inalteradas;
- o auto compact continua com no máximo 3 attempts lógicos;
- a integração roteirizada de Responses prova a ordem `stream:true → non-stream JSON`;
- o E2E formal do Desktop prova aligação `/compact → stream failure → non-stream success → success marker`;
- a fixture de compact success do Desktop reutiliza uniformemente o gerador de SSE `response.text` do replay server, sem escrever frames de protocolo manualmente;
  o JSON non-stream do fallback mantém o raw body por carregar o contrato de transport;
- os testes de core/adapters, o typecheck de agent/root, o lint e o build dos pacotes alvo passam;
- o conversation coverage audit precisa ser executado e, se for bloqueado por lacunas preexistentes do repositório, o erro de baseline deve ser registrado e deve-se confirmar que este diff não adicionou erros.