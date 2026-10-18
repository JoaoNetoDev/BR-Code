# Diagnóstico E2E de Stall SSE em Sessão de Conversa

## Objetivo e escopo

Este documento define um conjunto de diagnósticos E2E da cadeia real do Desktop, usando um replay provider local para interromper o envio de events em diferentes fronteiras semânticas de SSE e observar idle timeout, recuperação automática, projeção na UI, requisições de rede e efeitos colaterais de ferramentas.

A cadeia executada não é um teste de adapter/core, mas:

```text
Desktop renderer (desktop-continuous)
  -> window-scoped Local Host
    -> ZCode CLI runtime
      -> provider adapter
        -> local replay HTTP/SSE server

first request:  event...event...<cut point>........(silence > idle timeout)
                                                   |
                                                   v
                                      adapter/core recovery boundary
                                                   |
second request:                          provider request -> success SSE
                                                   |
                                                   v
                         runtime event -> Host -> renderer -> V4 timeline
```

Esta rodada valida apenas a cadeia principal `desktop-continuous` do desktop local; não modifica as fronteiras de recuperação gap/snapshot de `web-remote-replayable` do mobile `/remote`, nem adiciona novos estados de negócio em relay/main. Remote workspace, competição queue/Stop, recuperação após reinício, esgotamento de retries e ferramentas com efeitos colaterais não são cruzados com esta matriz de diagnóstico.

## Por que é um diagnóstico

O contrato de produto final de `S02/S03/S06` no nível superior continua sendo `decision-needed`: por exemplo, se o texto parcial ao final deve ser mantido, recolhido ou marcado com erro, se após esgotar os retries o resultado deve ser failed ou interrupted, e como botões e queue devem ser tratados — nada disso foi decidido ainda. Por isso este spec fica em `manual-review/pending`:

- As asserções rígidas cobrem apenas invariantes já confirmadas ou estritamente necessárias por segurança;
- UI/estados finais ainda não decididos são apenas amostrados, sem transformar a implementação atual em contrato de produto;
- Os fatos observados na execução são realimentados na seção "Resultados medidos" deste documento, para a decisão posterior de produto;
- Diagnósticos pendentes não contam como `covered` para a fault de nível superior.

O `S02-R1` já confirmado continua valendo: um corte de stream retry-safe apenas com reasoning ou um idle timeout deve descartar a cauda de reasoning incompleta e retomar a partir de uma âncora segura com uma nova identidade de assistant, sem alterar queue, Stop ou a fronteira de entrega.

## Matriz de pontos de interrupção

| Case      | Posição de corte da primeira SSE                                                                                | Fronteira semântica                                            | Asserções rígidas                                                                                                                | Amostragem de diagnóstico                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| SSE-ST-01 | Apenas `message_start`                                                                                          | prelúdio retry-safe                                             | sucesso final; requisição principal exatamente 2 vezes; sem chamada de ferramenta                                               | `canStop/runtimeStatus/timeline` durante o stall; row/timeline após o fechamento                |
| SSE-ST-02 | Dentro do bloco de thinking, já com `thinking_delta`                                                              | fronteira visível apenas de reasoning                          | sucesso final; requisição principal exatamente 2 vezes; reasoning incompleto não entra no histórico da requisição de recuperação; sem chamada de ferramenta | se o marcador de thinking é visível no estado em execução e como é projetado após a recuperação |
| SSE-ST-03 | Dentro do bloco de texto, já com `text_delta`                                                                     | fronteira de texto visível ao usuário                          | o marcador parcial já apareceu na UI ao vivo; o stall deve sair de forma limitada; se houver recuperação, sucesso final; sem chamada de ferramenta | comportamento atual do parcial (mantido/recolhido/removido) após a recuperação                 |
| SSE-ST-04 | Dentro do bloco de ferramenta, `input_json_delta` é JSON não fechado                                                  | ferramenta ainda não commitada                                 | o stall deve sair de forma limitada; a ferramenta não é executada; se houver recuperação, a requisição não contém a chamada de ferramenta incompleta | se o bloco de ferramenta não fechado entra na UI/store                                           |
| SSE-ST-05 | O bloco de ferramenta já tem `content_block_stop`, mas não há `message_delta/message_stop`                          | bloco de ferramenta commitado / mensagem não commitada         | a ferramenta executa uma vez após `content_block_stop`; a requisição de recuperação carrega o `tool_result` de sucesso; o mesmo toolCallId não é executado duas vezes | projeção do bloco de ferramenta completo na UI/runtime após a recuperação                       |
| SSE-ST-06 | A primeira stream já terminou normalmente e o `Read` somente-leitura foi executado com sucesso; a próxima continuação do modelo para de enviar após `message_start` | fronteira de continuação pós-ferramenta                        | a ferramenta é executada apenas uma vez; as três requisições principais são, na ordem, tool call, stalled continuation e recovered continuation; as duas últimas carregam o mesmo `tool_result` de sucesso | projeção de loading/runtime do stall após a conclusão da ferramenta                               |

Cada resposta em stall agenda, após o ponto de corte, um event sentinela mais tardio que o idle timeout do E2E. O cliente deve cancelar a tentativa primeiro por causa do idle timeout; a fixture seguinte retorna imediatamente um marcador único de conclusão. O worker E2E reduz o idle timeout do stream do modelo para `1000ms` apenas para este spec; isso não entra na configuração de produção nem se espalha para outros workers.

## Evidências e julgamento

Cada case deve coletar simultaneamente:

| Camada        | Evidência                                                                                |
| ------------- | ---------------------------------------------------------------------------------------- |
| UI            | marcador de corte, `canStop`, texto da timeline, número de rows; marcador de conclusão da recuperação e estado idle |
| Rede          | sequência de requisições principais, `fixtureId/status` e histórico de mensagens da requisição de recuperação |
| Runtime/store | snapshots de `runtimeStatus/state/activeInputId` no stall e após a conclusão              |
| Ferramenta    | quantidade de toolCallId no DOM/store; `tool_result` realmente recebido pelo provider e `isError` |

Os critérios de falha são: nenhuma requisição real de recuperação ao provider, impossibilidade de concluir após a recuperação, requisição de recuperação contaminada por parcial antigo, execução de ferramenta não commitada, não execução de ferramenta já commitada, execução duplicada de ferramenta já executada com sucesso, ou o resultado da ferramenta não ter se tornado a âncora de recuperação. Como a UI atual exibe o parcial descartado e se o histórico interrupted é exibido ao final são apenas fatos registrados; o diagnóstico não falha por causa disso.

O replay capture só preenche `responseEvents` quando o response handler termina normalmente. Neste grupo, a tentativa em stall é abortada antes pelo watchdog de idle do cliente, portanto o registro correspondente no capture permanece `pending` com `responseEventCount=0`; isso não significa que o event de corte não tenha chegado. A chegada do corte é comprovada pelo cruzamento entre fixtureId, marcador de corte na UI ao vivo, estado de streaming do runtime e logs de streaming do Agent; a nova requisição ao provider que surge em seguida prova que o watchdog cancelou a tentativa antiga e entrou em recuperação.

## Fixture e spec

- fixture do provider: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-sse-stall-diagnostic.json`
- manifest de cases: `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-sse-stall-diagnostic.json`
- spec pendente: `packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-sse-stall-diagnostic.test.ts`

Comando de execução:

```bash
desktop_dir="$PWD/packages/desktop"
E2E_PROVIDER_REPLAY_FIXTURE_PATH="$desktop_dir/test/e2e/fixtures/upstream/common.json,$desktop_dir/test/e2e/fixtures/upstream/conversation-session/conversation-session-sse-stall-diagnostic.json" \
  pnpm --filter @zcode/desktop test:e2e:serial -- \
  --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-sse-stall-diagnostic.test.ts
```

## Resultados medidos

Em 2026-08-27 foi concluída uma execução real via WDIO no macOS, com 6/6 aprovados. O idle timeout base do worker de teste era `1000ms`, e o event sentinela de cada fixture em stall era `5000ms`; os seis cases entraram em recuperação antes da chegada do sentinela e voltaram finalmente ao idle. Nesta rodada, o tempo observado do watchdog até a requisição de recuperação/estado terminal foi de aproximadamente `0.9s~2.8s`; a diferença inclui o ponto de corte do evento, o agendamento do runtime e o backoff de retry, e não deve ser interpretada como SLA de produção.

| Case      | Fatos medidos da implementação atual                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SSE-ST-01 | Ao receber apenas `message_start`, a UI permanece em streaming/com Stop disponível; após o idle timeout, a 2ª requisição ao modelo é iniciada a partir da âncora segura do usuário e tem sucesso, retornando finalmente ao idle. |
| SSE-ST-02 | O parcial de thinking é visível na UI ao vivo; a requisição de recuperação não carrega esse reasoning incompleto, e após a conclusão o parcial deixa de ser exibido; a 2ª requisição ao modelo tem sucesso. |
| SSE-ST-03 | O parcial de texto é visível na UI ao vivo; a implementação atual ainda inicia automaticamente a 2ª requisição ao modelo e tem sucesso, e após a conclusão o parcial deixa de ser exibido. Esse comportamento de descarte ainda é um item pendente de decisão de produto. |
| SSE-ST-04 | O `input_json_delta` não fechado não é commitado, não executa `Read`, e a requisição de recuperação também não carrega essa chamada de ferramenta; a 2ª requisição ao modelo tem sucesso. |
| SSE-ST-05 | Após receber `content_block_stop` da ferramenta, mesmo sem `message_delta/message_stop` do assistant, o `Read` é executado imediatamente e com sucesso; após o idle timeout, a 2ª requisição carrega o `tool_result` de sucesso, sem execução duplicada. |
| SSE-ST-06 | A primeira stream do modelo é submetida normalmente e o `Read` é executado com sucesso; depois que a 2ª continuation, carregando o `tool_result` de sucesso, trava, apenas a continuação do modelo é reaplicada como 3ª requisição, e a ferramenta não é executada de novo. |

Todos os snapshots de stall em todos os pontos de corte foram `canStop=true/state=streaming`, e após a conclusão `canStop=false/state=idle`. Os logs do Agent do SSE-ST-05 provam ainda mais que `content_block_stop` é a fronteira real de commit da ferramenta: o mesmo toolCallId aparece apenas uma vez com `tool.call.started/completed`, e o resultado bem-sucedido em seguida se torna a stream recovery anchor.

O idle timeout base padrão de produção é `600000ms`; o idle timeout da primeira recovery request é `630000ms`, com acréscimo de `30000ms` a cada nova tentativa. Este E2E apenas reduz o valor base do worker atual; o que se verifica são os limites da máquina de estados e dos efeitos colaterais, e não significa que em produção a recuperação ocorra após 1 segundo.