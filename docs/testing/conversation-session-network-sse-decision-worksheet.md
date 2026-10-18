# Folha de Decisão de Rede e SSE de Sessões de Conversa

Objetivo: decompor as falhas de requisição de model/API `N01-N09` e as falhas de streaming SSE `S01-S07` em contratos de produto confirmáveis, que possam ser devolvidos ao documento de origem e automatizados. Este documento apenas define as perguntas e as superfícies de verificação; não decide o comportamento final por produto.

Documentos relacionados:

- Catálogo de falhas de ambiente: [conversation-session-environment-fault-catalog.md](./conversation-session-environment-fault-catalog.md)
- Backlog de decisões: [conversation-session-decision-backlog.md](./conversation-session-decision-backlog.md)
- Protocolo de gravação/replay de SSE: [e2e-sse-capture-replay.md](./e2e-sse-capture-replay.md)
- Replay server: `packages/desktop/test/e2e/helpers/upstream-replay-server.ts`
- Helper de asserções de rede: `packages/desktop/test/e2e/helpers/conversation-session-network.ts`

## Limites Atuais da Infraestrutura

O replay server de DeepSeek existente já consegue expressar a maioria das falhas de rede e de SSE:

| Capacidade | Cases cobertos |
| --- | --- |
| `statusCode` + JSON body | `401/403`, `429`, `500`, `502/503`, erro JSON do provider |
| `delayMs` | requisição lenta, janela de espera antes do timeout não-streaming, janela de stop do usuário |
| `events` + `offsetMs` | stream SSE normal, stream lento, ordem dos eventos antes/depois de um stream stall |
| `closeMode=destroy` | queda anormal do stream SSE após headers de resposta/parciais de evento já enviados |
| `maxMatches` | sequências de retry, por exemplo N falhas seguidas de uma sucesso |
| artefato de captura `replay.fixtureId` | provar qual fixture o teste acertou, evitando falso positivo |

O que ainda não está definido é a decisão de produto: estado final na UI, preservação da fila, restauração dos botões, texto de erro, se haverá retry automático e se o usuário pode continuar digitando.

## Estatísticas Atuais

| Métrica | Quantidade |
| --- | ---: |
| Cases de Network/SSE | 15 |
| Questões de protocolo Network/SSE | 15 |
| respondidas | 0 |
| sem resposta | 15 |

## Dimensões Gerais de Decisão

Cada case N/S precisa confirmar pelo menos as seguintes dimensões. Só depois disso `decision-needed` pode virar `accepted`.

| Dimensão | O que precisa ser confirmado |
| --- | --- |
| Estado final de task/session | `failed/error`, `completed(interrupted)`, continuando em `running/retrying`, ou apenas exibindo um aviso |
| user message | mantida como turno de usuário no histórico, revertida para rascunho, ou mantida mas marcada como interrupted |
| placeholder de assistant | se gera assistant de erro, assistant parcial, assistant interrupted, ou não gera assistant |
| fila | se a fila atual é preservada; se é permitido continuar enfileirando durante o retry; se é consumida automaticamente após a falha |
| Botões de ação | retry, edit, fork, compact, stop e continuar envio: quais ficam disponíveis |
| Exibição de erro | toast, banner inline, bloco de mensagem, estado de retry na toolbar e orientação na página de configurações: como cada um é usado |
| Comportamento de rede | se há retry automático; número de retries; se distingue por status code/tipo de erro |
| Persistência/restauração | como erro, texto parcial, fila e estado de retry são restaurados após reload/relançamento |

## Índice de Questões de Protocolo P0

Esta tabela é a superfície de protocolo em nível de case, destinada ao script de auditoria. `Status=unanswered` significa que o fault case ainda não pode ser devolvido como `accepted` nem receber asserções E2E estáveis; nesse caso `产品结论` deve permanecer `待确认`. Depois que o produto confirmar, escreva primeiro uma conclusão explícita, depois mude a linha correspondente para `answered` e, por fim, devolva ao fault catalog / coverage matrix.

| Questão | Case | Status | 产品结论 | O que precisa ser confirmado | Palavras-chave de verificação | Alvo do write-back |
| --- | --- | --- | --- | --- | --- | --- |
| N01.1 | N01 | unanswered | 待确认 | estado final após `401/403`, orientação em configurações, se user message e fila são preservados | auth error、settings entry、queue snapshot | fault N01、fault coverage N01 |
| N02.1 | N02 | unanswered | 待确认 | provider/API Key ausente é bloqueio antes do envio ou falha depois do envio; se o rascunho é preservado | no network request、composer draft、settings entry | fault N02、fault coverage N02 |
| N03.1 | N03 | unanswered | 待确认 | estratégia de retry do `429`, enfileirar durante o retry, estado e fila após a falha final | retry count、toolbar retry、queue | fault N03、fault coverage N03 |
| N04.1 | N04 | unanswered | 待确认 | se `502/503` são distinguidos, estratégia de retry, se retry/edit/fork/compact ficam disponíveis após a falha | status code、retry、action buttons | fault N04、fault coverage N04 |
| N06.1 | N06 | unanswered | 待确认 | user message, estado de rede caída e regras de fila após falha de DNS/conexão/proxy/TLS | network error、message retention、queue | fault N06、fault coverage N06 |
| N07.1 | N07 | unanswered | 待确认 | limiar de timeout da requisição, semântica de stop, falha automática ou retry após o timeout | delay fixture、stop、timeout | fault N07、fault coverage N07 |
| N08.1 | N08 | unanswered | 待确认 | resposta 200 malformada é erro de protocolo/provider/ignorável, e se há retry | malformed body、normalized error、log | fault N08、fault coverage N08 |
| N09.1 | N09 | unanswered | 待确认 | texto de fallback quando title/sidecar falha, se é visível ao usuário, se afeta o turno principal | title fallback、warn、main turn completed | fault N09、fault coverage N09 |
| S01.1 | S01 | unanswered | 待确认 | queda com SSE vazio: retry ou erro, placeholder de assistant, user message e fila | empty SSE、retry boundary、queue | fault S01、fault coverage S01 |
| S02.1 | S02 | unanswered | 待确认 | queda após `message_start` gera interrupted/error/sem assistant; a fila é drenada automaticamente | prelude close、assistant placeholder、queue | fault S02、fault coverage S02 |
| S03.1 | S03 | unanswered | 待确认 | preservação do partial após text delta, estado final, disponibilidade de fork/edit/compact | partial text、failed/interrupted、buttons | fault S03、fault coverage S03 |
| S04.1 | S04 | unanswered | 待确认 | evento SSE malformado: terminar, ignorar ou recuperar, e classificação no log | bad event、protocol log、event ordering | fault S04、fault coverage S04 |
| S05.1 | S05 | unanswered | 待确认 | evento de erro do provider no SSE: mostrar texto original, retry, gerar assistant de erro | provider error frame、retry、assistant error | fault S05、fault coverage S05 |
| S06.1 | S06 | unanswered | 待确认 | UI de stream stall, limiar de timeout, stop do usuário e estratégia de retry/falha automática | stalled event、toolbar state、timeout | fault S06、fault coverage S06 |
| S07.1 | S07 | unanswered | 待确认 | evento SSE tardio após stop: ignorar, emitir warn e como provar o isolamento por inputId | late event、activeInputId、new turn isolation | fault S07、fault coverage S07 |

### Subdecisões já confirmadas que não fecham as perguntas de primeiro nível

| Decision | Parent cases | 产品结论 | Palavras-chave de verificação | Alvo do write-back |
| --- | --- | --- | --- | --- |
| S02-R1 | S02 / S06 | stream interrompido apenas com reasoning ou idle timeout é retentável: o core descarta o rabo de reasoning incompleto e retoma automaticamente a partir do último anchor seguro com um novo assistant message id; não altera fila, Stop nem fronteira de entrega | reasoning-only recovery、safe anchor、new request id、no tool side effect | fault catalog / focused runtime and projection tests |

Essa subdecisão apenas fixa o retry seguro “dentro do orçamento e com recuperação bem-sucedida”; não responde o estado de falha final, a fila, os botões nem a semântica de exaustão de S02/S06, portanto as 15 perguntas de primeiro nível acima continuam unanswered.

### Diagnóstico pendente

[conversation-session-sse-stall-e2e-diagnostic.md](./conversation-session-sse-stall-e2e-diagnostic.md) usa Desktop E2E reais para provocar stalls sem evento no prelude, no thinking, no text, em tool input não fechado, em bloco de tool completo mas mensagem não terminal e na continuação depois de a ferramenta já ter sido executada com sucesso. Esse probe só faz asserções rígidas de que a recuperação é segura, de que não polui uma nova requisição e de que a ferramenta não é executada duas vezes; a UI de partial/estado terminal é coletada como evidência de decisão, sem mudar o estado unanswered de `S02/S03/S06`.

Complemento medido em 2026-08-27: a implementação atual descarta partials de reasoning/text e retoma a partir do anchor seguro; tool input não fechado não é executado; e `content_block_stop` já é a fronteira de submissão da ferramenta, portanto mesmo sem `message_delta/message_stop` posterior do assistant, a ferramenta somente leitura ainda é executada uma única vez e usa o `tool_result` bem-sucedido como âncora de recuperação. Essas são evidências do estado atual e não substituem a decisão de produto sobre UI, exaustão e política de preservação de partial.

## N. Falhas de requisição de Model/API

| ID | Falha | Observação no código atual | Conclusão de produto obrigatória | Fixture / asserção E2E sugerida |
| --- | --- | --- | --- | --- |
| N01 | requisição ao model principal `401/403` | normalizado como `ProviderNotConfigured/auth_failed`, não retentável; runtime `turn.failed`, UI task runtime `failed` | se há orientação obrigatória para as configurações; se a user message é preservada; se a fila é preservada; após corrigir a key, de onde o retry parte | fixture JSON `401/403`; afirmar ausência de retry automático, erro na UI, entrada de configurações, snapshot da fila |
| N02 | provider não configurado / API Key ausente | falha na fase de resolve do registry, normalmente sem requisição real ao model | desabilitar antes do envio, abrir configurações ao clicar, ou gerar turno de erro; se o rascunho de entrada é preservado | setup sem key; afirmar ausência de requisição ao DeepSeek; composer, entrada de configurações, rascunho |
| N03 | requisição ao model principal `429` | `ModelRateLimited/rate_limited`, retentável por padrão; haverá retry agendado; padrão de no máximo 10 retries | se o retry padrão é aceito; se é possível enfileirar durante o retry; estado/fila após a falha final | fixture de retry com `429` + `maxMatches`; afirmar número de retries, retry na toolbar, comportamento da fila |
| N04 | requisição ao model principal `502/503` | `5xx` normalizado como `server_error`, retentável por padrão; `503` não tem semântica própria | se 502/503 são distinguidos; se retry/edit/fork/compact são permitidos após a falha final | fixture `503`; afirmar retry, erro final, botões de ação |
| N05-code | erro JSON `500` | o parser do provider pode preservar a mensagem/code do provider; caso contrário `server_error` | exibir o texto original do provider ou uma mensagem unificada; quais codes de provider exigem tratamento especial | fixture de body de erro JSON; afirmar texto do erro, traceId, logs, fila |
| N06 | DNS/conexão recusada/proxy/TLS | rede/proxy retentáveis por padrão, TLS não retentável | se a user message é preservada; se o estado de rede caída é exibido; se é possível continuar enviando após a falha | fixture de replay server indisponível ou falha de proxy; afirmar network error, mensagem/fila/snapshot |
| N07 | timeout da requisição | timeout não-streaming normalizado como `ModelRequestTimeout`; stall de SSE conta à parte como `model_stream_stalled` | limiar de timeout; durante ele, se o stop vira interrupted; se há retry automático após o timeout | `delayMs` acima do limiar ou timer controlável; afirmar stop, timeout, retry |
| N08 | 200 com resposta inválida | normalmente lançado por adapter/AI SDK como falha do model ou falha de negócio do provider | malformed é erro de protocolo, erro do provider ou ignorar trechos ruins; se é retentável | body/SSE malformed com `statusCode=200`; afirmar erro normalizado e logs |
| N09 | falha em title/sidecar | fire-and-forget, falha gera warn e não afeta o turno principal; o title do goal summary tem fallback | texto de fallback do título da lista; se precisa de aviso visível ao usuário; se não afeta de todo o turno principal | requisição principal com sucesso + falha no fixture de title; afirmar mensagem principal completed, fallback do title, warn |

### Modelo de resposta do grupo N

```text
N01 = 状态 / user message / queue / UI 引导 / retry：
N02 = 发送前还是发送后失败 / draft / 设置入口：
N03 = retry 策略 / retry 期间入队 / 最终失败：
N04 = 是否区分 502/503 / retry / 失败后按钮：
N05 = provider 原文还是统一文案 / 特殊 code：
N06 = user message / 断网状态 / queue：
N07 = timeout 阈值 / stop / 自动失败或 retry：
N08 = protocol/provider/ignore / retry：
N09 = 标题 fallback / 用户是否可见：
```

## S. Falhas de streaming SSE

A divisão central do grupo SSE é o retry boundary: enquanto ainda não apareceu nenhum delta visível ao usuário, em tese é possível retry; assim que aparece `text_delta`, `reasoning_delta` ou tool call, o retry pode gerar saída duplicada ou ferramentas fora de ordem.

| ID | Falha | Observação no código atual | Conclusão de produto obrigatória | Fixture / asserção E2E sugerida |
| --- | --- | --- | --- | --- |
| S01 | headers de resposta já retornados, mas queda sem nenhum evento SSE | ainda está na região retry-safe; se for retentável, faz retry, senão `task_error` | se equivale a erro do model; se gera placeholder de assistant; se user message/fila são preservados | `events=[]` + `closeMode=destroy`; afirmar retry/erro, user message, fila |
| S02 | queda após `message_start` | `message_start/start` é o prelude retry-safe e não conta como corpo visível | na falha final, se há assistant interrupted/error; se a fila é drenada automaticamente | enviar só `message_start` e destruir; afirmar placeholder de assistant e fila |
| S03 | queda após alguns text delta | já cruzou a fronteira visível, não faz mais retry; o texto recebido permanece no fluxo da mensagem | se o texto parcial é preservado; se o estado final é failed ou interrupted; se fork/edit são permitidos | destroy após text delta; afirmar texto parcial, estado, botões de ação |
| S04 | evento SSE com JSON malformed | não há classificação de produto específica para evento malformed, normalmente lança falha do model | evento ruim é terminar, ignorar ou tentar recuperar; se o erro de protocolo é registrado | fixture de evento malformed; afirmar tipo de erro, log, se eventos posteriores são ignorados |
| S05 | evento de erro do provider dentro do SSE | o transform do registry o converte em `ProviderBusinessError` antes da classificação de falha | se o texto original do provider é exibido; se há retry; se gera assistant de erro | `event:error` ou frame de business error; afirmar erro de UI normalizado |
| S06 | stream stall | primeiro publica `model_stream_stalled`; se ainda não cruzou a fronteira visível e for retentável, aumenta o idle timeout e retenta | qual das opções de UI “lento/reconectando/parar” aparece; em quanto tempo falha; se o usuário pode parar | stream lento com offsetMs grande; afirmar estado da toolbar, stop, retry |
| S07 | evento SSE tardio após stop | o handler terminal da UI ignora o terminal antigo por `activeInputId`; o evento tardio não deve poluir o novo turno | se é preciso um warn; se o novo turno precisa provar o isolamento por inputId; se o parcial fica congelado | fixture de destroy/evento tardio após stop; afirmar que a entrada antiga não é anexada à nova mensagem |

### Modelo de resposta do grupo S

```text
S01 = retry or error / assistant 占位 / user message / queue：
S02 = interrupted/error/no assistant / queue：
S03 = partial 保留策略 / final state / fork-edit-compact：
S04 = terminate/ignore/recover / 日志：
S05 = provider 原文 / retry / error assistant：
S06 = stall UI / timeout / stop：
S07 = late event 处理 / warn / inputId 断言：
```

## Camadas de Verificação

Depois de confirmada a decisão de produto, o E2E de cada case precisa cobrir pelo menos os itens-chave destes sinais:

| Camada | Asserções |
| --- | --- |
| UI | estado de runtime `TID_CHAT_VIEW`, barra de erro/toast, retry/stop na toolbar, botões desabilitados, assistant partial/erro |
| Network | statusCode, fixtureId, número de retries, ordem dos eventos SSE, `closeMode`, se houve repetição da requisição principal |
| Runtime/Store | limpeza de `activeInputId`, `apiRetry`, contagem da fila, stopRequested, erro da task |
| Log | se UI/service/agent têm registros de failure/retry/stall com o mesmo traceId/inputId |
| Files | se user/assistant/error/partial/timeline são persistidos no session snapshot conforme a decisão de produto |

## Ordem de Implementação Sugerida

1. `N02`: sem key / provider não configurado, com menor dependência do replay.
2. `N01`: falha de autenticação 401/403, que define a orientação em configurações e o estado de erro.
3. `N03/N04/N05`: retry por status code e texto de erro.
4. `S01/S02/S03`: o trio do retry boundary de SSE.
5. `S06/S07`: stall e evento tardio após stop, que expõem mais facilmente a poluição por inputId.
6. `N06/N07/N08/S04/S05/N09`: completar rede inacessível, timeout, malformed, provider error e sidecar.

Regras de write-back após a confirmação:

1. Atualizar as expectativas de produto e o Review do case correspondente em `docs/testing/conversation-session-environment-fault-catalog.md`.
2. Atualizar `docs/testing/conversation-session-decision-backlog.md`, removendo as linhas já confirmadas ou marcando-as como aceitas.
3. Adicionar as abreviações das fault specs em `docs/testing/conversation-session-e2e-coverage-matrix.md` e mover o fault case correspondente de decision-needed para o rastreamento `missing/covered`.
4. Escrever o replay fixture e a spec WDIO.
5. Rodar `pnpm audit:conversation-session-coverage`, a spec alvo, `pnpm typecheck` e `pnpm lint`.
