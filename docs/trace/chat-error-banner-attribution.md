# Atribuição estruturada ARMS do banner de erro do chat

Data de registro: 2026-08-06

## Objetivo

`chat_error_banner` é o ponto de entrada de envio de erros visíveis na UI para o ARMS. Ele é responsável apenas por registrar o fato da exposição do erro e não pode alterar
a retentativa da requisição ao modelo, o código do erro, o texto do erro, o estado da sessão ou as ações de negócio do provider.

Atualmente `failure_reason` é obtido diretamente de `ErrorAttribution.reason`. O adapter de modelo mantém o valor `unknown` por compatibilidade com chamadas antigas e com os
códigos de negócio do provider, o que impede a seguinte agregação no ARMS:

- o texto `ERROR_RATE_LIMITED` retornado pelo proxy upstream;
- BigModel `1309` (expiração do Coding Plan);
- HTTP 402 + `Insufficient Balance`;
- a mesma causa-raiz 402 ser dividida entre o adapter wrapper e o `invalid_request_error` upstream em razões de exibição diferentes.

Para wrappers de erro antigos que não carregam `ErrorAttribution`, a fronteira de instrumentação também deve preservar/preencher fatos de baixa cardinalidade comprováveis:

- `model_config_missing` → `error_source=runtime`, `failure_reason=model_config_missing`;
- `StreamRecoveryDiscarded` → `error_source=runtime`, `failure_reason=stream_recovery_discarded`;
- `ERR_SQLITE_ERROR` → `error_source=runtime`, `failure_reason=storage_error`;
- erros de adapter que contenham explicitamente semântica de provider/network: derivar source/reason pelo código de erro estável ou por texto controlado.

2026-08-17: foram preenchidos os fatos de rejeição por provider ainda comprováveis nos wrappers de erro antigos de provider: `1301`, `1213`, `3012`
e `BAD_REQUEST` sob o source de provider são unificados como `invalid_request`; o HTTP `405` também é classificado como
`invalid_request` do provider. Essas regras só valem na fronteira de atribuição de telemetria e não alteram o retry do adapter, o texto do erro
ou as ações de negócio. Quando o SSE já entrou em `response_body`, ou uma requisição não-stream já entrou nas fases `response`/`parse`, mesmo sem
HTTP status/provider code, o `source` é tratado como provider; a fase de preparação da requisição mantém a atribuição de runtime.

O `Model request failed.` sem response/stream boundary ou outra evidência upstream continua com `unknown`, sem ser
forjado como causa-raiz de provider/network por regras de fallback.

Esse tipo de dedução ocorre apenas na fronteira do payload ARMS, não altera o código de erro da UI, o retry ou o estado de runtime; quando não é possível comprovar a causa-raiz, o valor continua vazio e o registro segue entrando em "Novo Schema · atribuição pendente".

2026-08-19: a versão 3.8.1 expondo acumuladamente quatro categorias de lacunas remanescentes; a implementação seguinte corrige em camadas conforme o owner de cada fato de erro:

- a validação de model capability / option antes do envio da requisição é escrita na fronteira de model
  como `error_source=runtime`, `failure_reason=invalid_request`; não se pode esperar que a UI deduza pelo texto;
- quando o transcript antigo não tem atribuição, a telemetria só pode consumir provider code de allowlist, wrappers de erro estáveis e
  textos controlados; o `Model request failed.` / `openai_error` nus ainda não podem ser presumidos;
- eventos antigos com `source=provider` já definido, mas com reason vazio ou `unknown`, se carregarem evidência de rede forte como EPIPE,
  a evidência forte deve gerar atomicamente `network/network_error`, sem deixar que um source mais grosseiro a sobrescreva;
- `ZCode Protocol session stopped` é o sinal histórico de cancelamento gerado pelo próprio ZCode; o cold hydration deve restaurá-lo como
  cancelled e não pode voltar a formar um erro visível. `off-peak-ticket-expired`, enquanto a UI ainda não sabe se o requeue teve sucesso,
  nesta rodada é classificado apenas como `runtime/offpeak_ticket_expired`, sem esconder o Banner pelo texto.

Os códigos de cota em estado terminal do builtin `1304` / `1308` / `1310` / `1313` etc. ainda podem seguir usando
`rate_limited` no adapter como classificação de falha/retry de runtime; o telemetry reason de `chat_error_banner` é normalizado
para `quota_exhausted`. Essa exceção só aceita provider identity builtin confiável, ou um envelope
`[code][message][request-id]` de correspondência estrita no histórico do ZCode; não trata o code numérico homônimo de um provider customizado como código de negócio oficial.

2026-08-19 segunda rodada: a verificação cumulativa de `failure_reason=unknown` continua convergindo apenas os erros comprováveis por evidência independente de baixa cardinalidade:

- `UPSTREAM_NOT_FOUND`, `quota_limit`, `invalid_input`, `validation_error`,
  `internal_server_error` e outros provider codes explícicos retornam diretamente a atribuição atômica correspondente;
- falhas de DNS `getaddrinfo`, stream encerrado/truncado precocemente, server disconnected e outros textos de transporte explícitos são classificados como
  `network/network_error`;
- limites explícitos de in-flight/concurrency, responsabilidade do lado servidor do provider, saldo/dívida/orçamento, tool/input/model inválidos e
  erros HTTP embutidos 400/500 vão para os reasons padrão já existentes;
- o envelope legacy de três segmentos ainda pode consumir o code de allowlist quando o error code externo já é igual ao code do envelope,
  mas não aceita conflito entre o code do envelope e um code externo que não seja wrapper.

Esta rodada ainda não trata entradas sem evidência estável de causa-raiz como o `Model request failed.` nus, `get_channel_failed`, `Provider returned a business error.`,
`gateway_survival_resume_blocked`, `openai_error` nus, `Request could not be completed`, `terminated`,
`aborted`; esses valores permanecem `unknown`, aguardando que o adapter/owner forneça campos estruturados.

2026-08-19: o `Model request failed.` genérico não é mais "eliminado" do unknown acrescentando reasons de fallback. O runner deve gravar na atribuição de erro final a fase de falha
de baixa cardinalidade já usada em ModelNetworkStatus / OTel, e normalizar a exceção original para um `exceptionKind` controlado:

- `errorPhase` reaproveita `prepare | configuration | connect | response | stream | parse | validation | unhandled`;
- `exceptionKind` só permite `api_call | provider_business | transport | validation | protocol | type_error |
  generic`; é proibido repassar nomes arbitrários de exception;
- um stream comum que falha antes da criação do iterator é `prepare`; depois da criação é `stream`; generate continua distinguindo
  `prepare/response`; retry sleep é `connect`;
- `failure_reason=unknown` pode permanecer, mas os novos eventos devem poder ser agrupados por phase/exceptionKind e descer até o OTel de model-attempt pelo
  `trace_id` existente, sem enviar message, stack ou requestId originais.

## Restrições e não objetivos

- A validação local determinística antes do envio da requisição pode usar os campos existentes de `ErrorAttribution` para gravar fatos na fronteira de model; a normalização de negócio de business code/message de provider ocorre apenas na telemetry de `chat_error_banner`. Nenhuma das duas altera o
  vocabulário `ModelFailureReason` do adapter, a decisão de retry, o code/message de erro ou o texto principal do ChatErrorBanner.
- Reasons estruturados já não `unknown` mantêm o valor original, para não quebrar as agregações existentes no ARMS; a única exceção são os
  trusted builtin terminal quota codes listados acima, que só são normalizados de `rate_limited` para `quota_exhausted` na telemetria.
- `failure_reason` e `error_source` devem ser decididos na mesma atribuição, pela mesma evidência; é proibido, depois de perder
  o provider code, o HTTP status ou a origem do texto controlado, inferir qualquer reason não vazio como provider.
- Reasons ambíguos que podem representar ao mesmo tempo validação local e rejeição por provider, como `invalid_request`, quando faltam source
  estruturado ou evidência upstream, ficam só com o reason e `error_source` permanece vazio.
- Só reportam-se reasons padrão de baixa cardinalidade; não se envia a mensagem completa do provider, URL, header, credenciais ou entrada do usuário.
- O error detail do protocolo antigo, a projeção de sessão e a task meta podem carregar um `attribution` opcional; quando o dado antigo não tem esse campo
  ele continua sendo tratado pelo caminho de compatibilidade existente, e live e cold hydration não podem apresentar drift de atribuição.
- `error_message` continua usando o texto atual visível no banner; esse campo já é, por natureza, o fato da exposição do erro ao usuário.

## Prioridade de atribuição

```text
reason estruturado já não unknown
        ↓
normalização de trusted builtin terminal quota codes
        ↓
derivação por código/wrapper de erro local estável
        ↓
business code de provider confiável / code semântico genérico sob source provider
        ↓
combinação de HTTP status + message/code
        ↓
envelope legacy estrito / padrão controlado de texto de erro visível
        ↓
unknown
```

Cada nível deve retornar o mesmo `{ errorSource, failureReason }` determinado pela mesma evidência. Só quando o reason original é vazio ou
`unknown` a evidência de rede forte, como EPIPE e ECONNABORTED, pode corrigir o source provider mais grosseiro.
Códigos de transporte estáveis usam uma allowlist controlada, cobrindo os códigos de rede e timeout de Node/Undici já reconhecidos pelo adapter;
mesmo que um evento antigo só mantenha `providerErrorCode` e o texto visível não repita esse code, é preciso restaurar atomicamente
`network/network_error` ou `network/timeout` pelo code. O BigModel `1234`, embora venha de um envelope de business de provider,
tem semântica de falha de rede, portanto o legacy `[1234][message][request-id]` precisa ser restaurado como
`network/network_error` e não pode gerar a combinação contraditória `provider/network_error`.
O HTTP `413` não decide o reason sozinho: evidência de token/context vai para `context_exceeded`, evidência de estrutura de request body/tool/media
vai para `invalid_request`, e o restante permanece `unknown`.

A padronização ocorre apenas dentro do payload ARMS. `unknown` significa ausência de evidência confiável e não é mais alterado no fluxo de erros do produto
por causa da aparição de um novo erro de provider.

## Reasons padrão

Mantêm-se os valores existentes e complementam-se os erros desconhecidos identificáveis com segurança:

`rate_limited`, `quota_exhausted`, `balance_insufficient`, `plan_expired`、
`plan_access_denied`, `model_not_found`, `context_exceeded`, `server_error`、
`network_error`, `timeout`, `stream_idle_timeout`, `tls_error`, `auth_failed`、
`invalid_request`, `provider_not_configured`, `provider_overloaded`、
`offpeak_ticket_expired`.

O provider code serve apenas como entrada de regras locais; o code original continua sendo reportado pelo campo existente `provider_error_code`.

## Invariantes

```text
requisição do usuário → adapter / retry / session state   （mantém o caminho original）
       └→ TurnError → ChatErrorBanner
                       └→ buildChatErrorBannerTelemetryPayload
                          └→ resolução única de evidence → failure_reason + error_source
```

A falha de envio ao ARMS continua sendo tratada pelo desvio existente e não pode bloquear a UI nem a requisição ao modelo.

## Verificação

- Cobrir o texto de rate limit do proxy, 1309, 402 Insufficient Balance, 429, 5xx e erros desconhecidos.
- Cobrir a pré-validação local de model capability/option, o envelope legacy estrito 1210/1211/1214/1301/1305/1308/1310,
  o envelope legacy de rede 1234, EPIPE/ECONNABORTED/ECONNRESET/ECONNREFUSED/ENOTFOUND,
  ETIMEDOUT/UND*ERR*\* timeout, o desvio 413 entre context e request-body, e o marcador off-peak.
- Cobrir DNS, terminação de stream, in-flight/concurrency, servidor do provider,
  saldo/orçamento/dívida, tool/input inválido, UPSTREAM_NOT_FOUND e evidência embutida 400/500 na segunda rodada de unknown, mantendo contraexemplos para os não objetivos explícitos acima.
- Cobrir as phases de stream comum prepare/stream, generate prepare/response e retry connect, o
  exceptionKind controlado, a equivalência live/cold hydration e a expansão ARMS de `failure_phase` / `failure_exception_kind`.
- Afirmar que os reasons existentes não `unknown` não mudam.
- Afirmar que os trusted builtin terminal quota codes só mudam o reason de telemetria, sem alterar o retry do adapter nem a ação da UI.
- Afirmar que, quando o source está ausente, reasons explícitos de network/runtime ainda entram no source correto e reasons ambíguos permanecem vazios.
- Afirmar que o histórico `ZCode Protocol session stopped` é restaurado como cancelled e que textos semelhantes de provider continuam sendo erro.
- Afirmar que `error_message`, `error_code` e os campos mascarados de provider/model permanecem inalterados.
- Executar os testes de UI focados, `pnpm typecheck` e `pnpm lint`.
