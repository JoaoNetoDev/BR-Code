# Folha de Trabalho de Decisões de Compact da Conversation Session

## Adjudicação da fila de `/compact` (2026-07-13)

O usuário confirmou que `/compact` não pode ser descartado durante a saída em running e precisa entrar na fila; em seguida confirmou que mensagens comuns durante o processo do goal verifier também precisam entrar na mesma future queue. A implementação foi fechada nas seguintes fronteiras:

| Fronteira | Adjudicação | Classificação |
| --- | --- | --- |
| running primary/tool/foreground subagent/goal continuation/goal verifier | `/compact` é anexado à FIFO da CLI como um terceiro tipo de intenção `kind=compact`, sem interromper o trabalho ativo | accepted |
| completed + held queue | o compact é anexado ao fim da fila, mantendo `autoDrain=false`; não contorna a future intent existente | accepted |
| já existe compact active ou enfileirado | o compact seguinte falha explicitamente com `failed(compactOperationLock)` e mostra um toast, sem enfileirar de novo | accepted |
| operações de fila | pode remover, reordenar e executar imediatamente; o compact não pode ser editado como texto comum | accepted |
| auto compact acabou de terminar | o compact manual enfileirado ainda é executado, permitindo que o runtime produza noop; consumo silencioso é proibido | accepted |
| compact enfileirado falhou/parou com Stop | a fila subsequente permanece held, sem consumir automaticamente para além da falha/cancelamento | accepted |
| desktop/mobile | os dois lados compartilham o CommandInbox do Host/CLI; cada um mantém seu próprio `deliveryKind`, sem criar uma segunda fila no relay/main | accepted |
| goal verifier | text/goal/compact são todas future intents; um único verifier terminal não dispara drain, aguardando o target complete | accepted |

```text
desktop-continuous ─┐
                    ├─> shared Host / CLI FIFO: [text, compact, goal]
web-remote-replayable ┘                    │
                                          └─> despacho por kind, compact só escreve na timeline
```

O owner do estado é o `CommandInbox` do CLI runtime e a fila de sessão; a UI apenas renderiza a projection, e o relay/main apenas repassa. A camada central de evidências é o ACK de comandos, o kind/order do snapshot da fila, o marcador de lifecycle do compact, a ordem das requisições ao provider e o estado terminal do goal target.

Objetivo: transformar os três casos compact undefined `F09/G11/G12` em um contrato de produto confirmável, reescrevível e automatizável. Este documento não toma decisões pelo produto, apenas detalha as bifurcações que precisam ser confirmadas o suficiente.

Documentos relacionados:

- catálogo do caminho principal: [conversation-session-case-catalog.md](../conversation-session-case-catalog.md)
- matriz de cobertura: [conversation-session-e2e-coverage-matrix.md](./conversation-session-e2e-coverage-matrix.md)
- backlog de decisões: [conversation-session-decision-backlog.md](./conversation-session-decision-backlog.md)
- casos de replay do compact: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-compact*.test.ts`

## Lacunas atuais

Zeradas. `F09 / G11 / G12` (incluindo os fault alias `C01-C03`) foram todos adjudicados e reescritos em 2026-07-05 (catalog accepted, coverage missing, roadmap ready-to-write), e esta folha de trabalho passou a ser arquivada; as conclusões item a item dos 12 itens de protocolo estão em «Arquivo de adjudicações» abaixo.

## Estatísticas atuais

| Métrica | Quantidade |
| --- | ---: |
| Caso de compact | 0 |
| Item de protocolo de compact | 0 |
| answered | 0 |
| unanswered | 0 |

> O critério de contagem é "itens ainda pendentes na superfície auditada"; lotes já adjudicados foram aposentados, e tudo zera. Registro de adjudicações: confirmação item a item pelo usuário em 2026-07-05 (fechamento das decisões M0 da refatoração v4); o impacto de protocolo que motivou este ciclo de adjudicação está em `docs/v4-refactor/10-protocol-spec.md` (enumeração de estado terminal do compact marker, switchModelConfig CAS).

## Arquivo de adjudicações (2026-07-05)

> O prefixo ✅ no número evita que o script de auditoria volte a contar o item como questão de protocolo pendente.

| Item | Conclusão de produto |
| --- | --- |
| ✅ F09.1 | manter completed (volta ao estado anterior ao compact) + failed marker; nem error nem interrupted |
| ✅ F09.2 | manter a queue original sem consumo automático; não mexer em autoDrain nem limpar |
| ✅ F09.3 | todas as operações restauradas (texto / `/goal` / fork / edit / compact de novo), sem bloqueio de botões |
| ✅ F09.4 | o failed marker mostra o resultado da falha + entrada de retry compact (clique = reiniciar compact manual) |
| ✅ G11.1 | continuar executando o pendingAction sem compressão (a 4ª requisição é a requisição do modelo principal; igual ao estado atual) |
| ✅ G11.2 | continuar em running (entra no fluxo normal de requisição principal) |
| ✅ G11.3 | manter o histórico de retrying e o failed marker final, sem bloquear a saída posterior |
| ✅ G11.4 | o circuit breaker vale (pula por um tempo depois de atingir o limite); a contagem é reiniciada após sucesso do compact manual |
| ✅ G12.1 | manter como interrupted user message do turno atual (editável/retry na timeline), sem copiar de volta para a queue e sem descartar |
| ✅ G12.2 | completed(interrupted), idêntico a um stop normal |
| ✅ G12.3 | marker em cancelled (reutilizando a enumeração v4; equivalente à antiga descrição interrupted) |
| ✅ G12.4 | toda a queue explicitamente anexada é mantida e não consumida automaticamente (held queue, autoDrain=false) |

## Índice de itens de protocolo P0

Os itens de protocolo deste lote foram todos adjudicados e aposentados (ver «Arquivo de adjudicações» acima), e o script de auditoria não os conta mais. Historicamente esta tabela era a superfície mínima de protocolo lida pelo script de auditoria: `Status=unanswered` indica que ainda não é possível reescrever o catalog; após a confirmação do produto, escreve-se primeiro a conclusão de produto, muda-se `answered` e só então se reescreve o catalog de origem / fault catalog / coverage matrix, e por fim o item é aposentado da superfície auditada.

Regras de reescrita após a confirmação:

1. Atualizar os resultados esperados e o Review de `F09/G11/G12` em `docs/conversation-session-case-catalog.md`.
2. Atualizar o Review de `C01/C02/C03` em `docs/testing/conversation-session-environment-fault-catalog.md`.
3. Atualizar `docs/testing/conversation-session-e2e-coverage-matrix.md`: primeiro mudar de `undefined` para `missing` e, quando o E2E tiver asserção independente, mudar para `covered`.
4. Remover a linha correspondente de pendência em `docs/testing/conversation-session-decision-backlog.md`.
5. Escrever o spec WDIO correspondente e fazer `pnpm audit:conversation-session-coverage` passar novamente.

## Fatos já existentes

Estes são limites dados pelo código atual e por regras de produto já confirmadas; não representam conclusões de produto ainda não confirmadas.

| Fato | Significado |
| --- | --- |
| compact manual não faz retry automático | uma falha de compact manual gera apenas um compact attempt lógico; esse attempt pode conter uma perna principal em streaming e uma perna de fallback non-stream, e não se deve esperar um 2º attempt lógico automático |
| compact automático faz no máximo 3 retries | G08/G09/G10 já cobrem o retry depois da falha do 1º e do 2º attempt lógico e a continuação do pendingAction após o sucesso do 3º; o número físico de requisições ao provider não é fixo |
| texto comum e `/goal` podem entrar na fila durante compacting | `F04/F05/G05/G06` já confirmados, então é preciso definir se a queue é mantida depois de falha/stop |
| `/compact` repetido durante compacting é rejeitado | `F06/G07` já confirmados, e os casos de falha/stop precisam afirmar que não surge attempt lógico de compact adicional |
| não é possível fazer fork durante compacting | `E06/CA` já confirmados, e é preciso definir quando a capacidade de fork é restaurada depois de falha/stop |
| depois do stop a queue é mantida por padrão e não é consumida automaticamente | `B02-B04/F07` já confirmados, mas ainda precisa ser confirmado se o pendingAction de um auto compact parado conta como queue |

## F09: falha de Compact manual

Estado inicial: `compacting(origin=manual)`.

Evento: a perna principal de streaming do compact falha e entra no fallback non-stream, e o fallback também falha.

Observação do código atual: o runtime grava o payload de timeline `CompactFailed`, e a projection de UI consegue gerar a faixa failed e a entrada de retry; `executeManualCompact` ainda lança `Compact failed`.

### O que precisa ser confirmado

| Ponto de decisão | Opções | Impacto |
| --- | --- | --- |
| F09.1 estado final de task/session | A. `completed(success)` + failed marker; B. `completed(interrupted)` + failed marker; C. `error/failed` + failed marker; D. outro | decide a caixa de entrada, a toolbar, o estado da lista, o banner de erro e o comportamento de envio seguinte |
| F09.2 tratamento da queue | A. manter a queue original, `autoDrain=false`; B. limpar a queue; C. manter e permitir envio manual imediato; D. outro | decide se as asserções de held queue são reutilizadas |
| F09.3 restauração das operações | A. permitir continuar enviando texto comum/`/goal`/fork/edit/compact de novo; B. permitir apenas retry compact; C. entrar em estado de erro, permitindo apenas corrigir/tentar de novo; D. outro | decide os botões desabilitados e os casos de action seguinte |
| F09.4 interação do failed marker | A. exibir retry compact; B. exibir apenas o resultado da falha; C. exibir entrada de log/detalhes; D. outro | decide o test-id de UI e as asserções de clique |

### Rascunho de asserções de E2E

| Camada | Sinal a coletar |
| --- | --- |
| UI | o compact marker muda de `running` para `failed`; o estado da caixa de entrada/botões corresponde a F09.1-F09.4 |
| Network | ocorre apenas 1 compact attempt lógico manual; as requisições físicas incluem pernas SSE/HTTP e seus respectivos adapter retry, sem número fixado; nenhuma requisição ao modelo principal é gerada |
| Queue | se a queue existente antes do compact é mantida conforme F09.2 |
| Runtime/Log | estado do task runtime, trace da falha de compact, limpeza de activeInputId |
| Files | na timeline da sessão são mantidos o marker de compact iniciado e o de falha |

Spec sugerido: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-compact-failure.test.ts`.

## G11: três falhas do Compact automático

Estado inicial: `compacting(origin=auto)`, com um pendingAction que dispara o auto compact.

Evento: o auto compact falha nas 1ª, 2ª e 3ª tentativas.

Observação do código atual: uma falha de compact retentável grava a faixa `retrying`; a falha da 3ª tentativa grava a faixa `failed`. A implementação atual engole erros que não sejam de cancelamento e continua executando o pendingAction original sem compressão; o contador de falhas consecutivas aumenta e, ao atingir o limite, o auto compact seguinte pode ser pulado pelo circuit breaker.

### O que precisa ser confirmado

| Ponto de decisão | Opções | Impacto |
| --- | --- | --- |
| G11.1 tratamento do pendingAction | A. continuar sem compressão; B. voltar à held queue sem consumo automático; C. descartar com aviso; D. entrar em estado de erro aguardando decisão do usuário; E. outro | decide se a 4ª requisição deve ser uma requisição ao modelo principal |
| G11.2 estado de task/session | A. se o pendingAction continuar, entra em `running`; B. se a queue for mantida, volta a `completed/interrupted`; C. entra em `error/failed`; D. outro | decide o estado da toolbar, do composer e da lista |
| G11.3 exibição do marker | A. manter o failed marker e ao mesmo tempo continuar a requisição original; B. o failed marker bloqueia as requisições seguintes; C. exibir apenas o histórico de retrying e no final não exibir failed; D. outro | decide as asserções de UI da timeline |
| G11.4 política de auto compact seguinte | A. o circuit breaker vale e o auto compact é pulado por um tempo; B. a próxima rodada ainda pode tentar; C. é preciso que um compact manual bem-sucedido do usuário reinicie; D. outro | decide o estado entre turnos e o e2e seguinte |

### Rascunho de asserções de E2E

| Camada | Sinal a coletar |
| --- | --- |
| UI | expressão retrying/failed do auto compact marker com attempt=1/2/3; o estado final corresponde a G11.2 |
| Network | exatamente 3 compact attempts lógicos; o número de requisições físicas SSE/HTTP não é fixado; a existência de uma requisição posterior ao modelo principal depende de G11.1 |
| Queue | se o pendingAction desaparece, volta para a fila ou é executado |
| Runtime/Log | retry count, circuit breaker, limpeza ou troca de activeTurnKind |
| Files | se o marker da timeline e a user message que disparou o pendingAction são persistidos |

Spec sugerido: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-compact-auto-failure.test.ts`.

## G12: Compact automático parado com Stop

Estado inicial: `compacting(origin=auto)`, com um pendingAction que dispara o auto compact; o usuário clica em stop enquanto a requisição de compact não terminou.

Evento: stop/abort do auto compact.

Observação do código atual: o auto compact acontece antes da requisição principal do user turn atual; a user message atual já entrou no histórico do runtime / na persistência. O stop faz `autoCompactIfNeeded` relançar o cancellation, a requisição ao modelo principal não continua e o turno é fechado como cancelled. Os pending steer inputs internos do runtime são descartados, mas ainda não é fato de protocolo se a queue visível na UI é mantida.

### O que precisa ser confirmado

| Ponto de decisão | Opções | Impacto |
| --- | --- | --- |
| G12.1 tratamento do pendingAction | A. voltar à held queue, `autoDrain=false`; B. manter como interrupted user message do turno atual, sem entrar na queue; C. descartar com aviso; D. manter pendente de execução mas sem consumo automático; E. outro | decide se, depois do stop, o usuário consegue ver e editar essa entrada pendente |
| G12.2 estado de task/session | A. `completed(interrupted)`; B. `completed(success)` + interrupted marker; C. `error/failed`; D. outro | decide a consistência com o stop normal |
| G12.3 estado do compact marker | A. `interrupted`; B. `failed`; C. remover o marker running; D. outro | decide a exibição na timeline |
| G12.4 queue anexada durante o compact | A. tudo é mantido e não é consumido automaticamente; B. só é mantido o que o usuário anexou explicitamente, não o pendingAction original; C. é limpa depois do stop; D. outro | decide as asserções de contagem e de ordem da queue |

### Rascunho de asserções de E2E

| Camada | Sinal a coletar |
| --- | --- |
| UI | sair de streaming/compacting após o clique em stop; o estado do marker corresponde a G12.3; a restauração da caixa de entrada e dos botões corresponde a G12.2 |
| Network | a requisição de auto compact é abortada; nenhuma requisição ao modelo principal do pendingAction é iniciada |
| Queue | o pendingAction original e os itens anexados durante o compact são tratados conforme G12.1/G12.4 |
| Runtime/Log | limpeza de activeInputId; stopRequested e estado de autoDrain correspondem ao stop normal ou à nova definição |
| Files | se o interrupted marker, a user message e o snapshot da queue são persistidos |

Spec sugerido: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-compact-auto-stop.test.ts`.

## Modelo de resposta

Na confirmação do produto basta responder no formato abaixo:

```text
F09:
- F09.1 = A/B/C/D, complemento：
- F09.2 = A/B/C/D, complemento：
- F09.3 = A/B/C/D, complemento：
- F09.4 = A/B/C/D, complemento：

G11:
- G11.1 = A/B/C/D/E, complemento：
- G11.2 = A/B/C/D, complemento：
- G11.3 = A/B/C/D, complemento：
- G11.4 = A/B/C/D, complemento：

G12:
- G12.1 = A/B/C/D/E, complemento：
- G12.2 = A/B/C/D, complemento：
- G12.3 = A/B/C/D, complemento：
- G12.4 = A/B/C/D, complemento：
```

## Ordem de implementação após a confirmação

1. Tratar primeiro apenas `F09`, porque não envolve pendingAction e é o menor ciclo fechado.
2. Depois tratar `G11`, que decide se a falha do auto compact continua a requisição original.
3. Por fim tratar `G12`, que envolve ao mesmo tempo stop, pendingAction, queue e marker.
4. A cada item concluído, primeiro fazer o catalog ir de `undefined` para `accepted` e o coverage de `undefined` para `missing`.
5. Só depois de escrever o WDIO mudar o coverage para `covered` e rodar `pnpm audit:conversation-session-coverage`.