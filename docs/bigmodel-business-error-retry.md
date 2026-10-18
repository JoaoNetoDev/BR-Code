# Estratégia de Retry para Erros de Negócio BigModel

Data de registro: 2026-06-08

## Contexto

A interface compatível BigModel / Z.AI retorna parte das falhas recuperáveis embrulhada em códigos de erro de negócio, e isso pode aparecer até mesmo em frames de erro SSE dentro de HTTP 200. O adapter do ZCode já normaliza esse tipo de resposta como `ProviderBusinessError` no limite de fetch do provider, e então o model runner classifica e entra no retry budget unificado.

Desta vez a mudança é conservadora: não refatorar o diretório de retry, não adicionar campos de protocolo, apenas complementar os códigos de negócio BigModel na tabela de classificação existente e reutilizar os eventos de falha, eventos de retry e logs já existentes. Se o error chunk SSE não tiver um campo `code` estruturado e retornar apenas em message um prefixo de formato forte BigModel como `[1302][...][request_id]`, o adapter também extrai primeiro o código de negócio de quatro dígitos antes de entrar na mesma tabela de classificação.

Documento de referência: [FAQ de códigos de erro da API BigModel](https://docs.bigmodel.cn/cn/faq/api-code)

## Pontos de Implementação

- `apps/zcode-cli/packages/adapters/src/model/failure-provider-business-codes.ts`
- `apps/zcode-cli/packages/adapters/src/model/failure-classifier.ts`
- `apps/zcode-cli/packages/adapters/src/model/failure-inspection.ts`
- `apps/zcode-cli/packages/adapters/src/model/provider-finish-business-error.ts`
- `apps/zcode-cli/packages/adapters/src/model/runner-generate.ts`
- `apps/zcode-cli/packages/adapters/src/model/runner-retry.ts`
- `apps/zcode-cli/packages/adapters/src/model/runner-stream.ts`
- `apps/zcode-cli/packages/adapters/src/model/runner-status.ts`

A implementação continua reutilizando o retry loop existente, os limites de retry de stream e o caminho de publicação de logs; a classificação de códigos de negócio, a inspeção de objetos de erro, a reconstrução do error chunk SSE e o cálculo do delay permanecem cada um nos arquivos acima, evitando espalhar casos específicos de provider pelo core runtime.

## Códigos de Negócio BigModel que Serão Repetidos

| Código de negócio | Semântica | Classificação ZCode | retry reason |
| --- | --- | --- | --- |
| `1120` | Anomalia temporária de acesso à conta, a documentação recomenda tentar mais tarde | `model_request_failed` | `server_error` |
| `1230` | Anomalia no fluxo de chamada da API | `model_request_failed` | `server_error` |
| `1234` | Erro de rede | `model_request_failed` | `network_error` |
| `1302` | Concorrência muito alta | `model_rate_limited` | `rate_limited` |
| `1303` | Frequência de chamada muito alta | `model_rate_limited` | `rate_limited` |
| `1305` | Limite de tráfego da plataforma ou sobrecarga | `model_rate_limited` | `rate_limited` |
| `1312` | Carga de acesso a modelos muito alta | `model_request_failed` | `provider_overloaded` |

Esses erros só são repetidos automaticamente quando ainda não foi produzido um evento de modelo confirmado para o upstream. Se a requisição de streaming já produziu `text_delta`, `tool_call` ou `finish`, ela continua não sendo reproduzida automaticamente, evitando texto duplicado ou chamadas de ferramenta duplicadas.

## Header Retry-After

Quando o provider retorna `retry-after-ms` ou `retry-after`, o adapter prioriza o tempo de espera especificado pelo provider; um limite razoável é 5 minutos. Se a mesma resposta tiver `x-should-retry: false` ou `x-should-retry: 0`, o `retry-after` não é usado para dirigir a espera e apenas a decisão local de retry é mantida.

Os headers de resposta devem atravessar os três caminhos: o `ProviderBusinessError` lançado diretamente pela camada de fetch, o `ProviderBusinessError` reconstruído a partir do error chunk / finish metadata do AI SDK, e o erro de negócio embrulhado em `APICallError.cause`. Caso contrário o adapter vai considerar `retry-after` ausente e recorrer ao backoff exponencial local.

## Limite de Limpeza do Attempt de Stream

Todo attempt de falha que se prepara para entrar na próxima requisição física deve primeiro abortar a requisição atual e aguardar, dentro de uma barreira limitada, a limpeza do iterator e das branches retidas pelo tee do AI SDK. Essa restrição se aplica tanto ao caminho em que `iterator.next()` lança erro diretamente quanto ao caminho em que o AI SDK produz um chunk `type: "error"` e o adapter agenda internamente o retry.

Exceções ou timeout na limpeza não podem sobrescrever o erro original do provider nem bloquear o retry indefinidamente; mas antes de a limpeza terminar ou de o timeout limitado estourar, o próximo `streamText()` não pode ser iniciado.

## Códigos de Negócio BigModel que Não São Repetidos

| Código de negócio | Motivo |
| --- | --- |
| `1113` | Erro de negócio terminal retornado explicitamente pelo provider; retry automático não muda o resultado |
| `1304` | Limite diário de chamadas; retry em curto intervalo não muda o resultado |
| `1308` | Limite de uso atingido, é preciso aguardar o horário de reset |
| `1309` | Coding Plan expirado |
| `1310` | Limite de cota semanal/mensal atingido, é preciso aguardar o horário de reset |
| `1311` | O plano não tem permissão de acesso aos modelos |
| `1313` | fair usage restriction; continuar o retry tende a amplificar tráfego anômalo |

Esses erros permanecem sem retry mesmo quando são transportados por HTTP 429. A razão é que não são problemas transitórios de concorrência ou de carga da plataforma; o retry automático desperdiçaria budget e também poderia agravar o rate limiting do lado do provider.

## Logs

Nenhum novo ponto de log; continua-se reutilizando os eventos de estado estruturados do model runner:

- `model_request_failed`: falha de uma tentativa, registra `requestId`, `traceId`, `attempt`, `maxAttempts`, `reason`, `retryable`, `statusCode`, mensagens de erro seguras etc.
- `model_retry_scheduled`: preparação para a próxima tentativa, registra `nextAttempt`, `delayMs`, `reason`, `statusCode` etc.

Esses dois eventos são registrados pelo logger em `runner-status.ts` no nível `warn`. São eventos de lifecycle de baixa frequência, não logs de alta frequência por chunk.

## Cobertura de Testes

- `failure-classifier.test.ts` cobre que códigos transitórios BigModel são classificados como retryable.
- `failure-classifier.test.ts` cobre que códigos de quota, de plano e de limitação de longo prazo permanecem sem retry.
- `failure-classifier.test.ts` cobre que o `retry-after` é preservado após a reconstrução do error chunk e o embrulho em `APICallError.cause`.
- `runner-provider-business-network.test.ts` cobre que um erro de negócio `1305` no SSE publica evento de falha e evento de agendamento de retry quando o replay é seguro, e a requisição seguinte tem sucesso.
- `runner-provider-business-network.test.ts` cobre que o `retry-after` no error chunk SSE determina o tempo de espera da próxima requisição física.
- `runner-provider-business-network.test.ts` cobre que, depois de um retry agendado por error chunk SSE, a próxima requisição física precisa aguardar o abort do round anterior, o `iterator.return()` e a limpeza limitada das branches retidas pelo tee.

## Direções Futuras

Se mais adiante se quiser centralizar ainda mais a lógica de retry, o mapeamento de provider business codes, o fallback de status HTTP, a inspeção de rede e a configuração de retry budget podem ser convergidos para `apps/zcode-cli/packages/adapters/src/model/retry/`. Desta vez não fazemos a movimentação em nível de diretório, para não ampliar a superfície da mudança.
