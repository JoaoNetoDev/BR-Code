# Catálogo de Falhas de Ambiente da Conversation Session

Objetivo: listar separadamente o espaço de estados da área de sessão sob anomalias do ambiente externo, evitando misturar falhas como 429, 503, queda de rede, disco cheio e fechamento do app no caminho principal de sessão `A-J`. Este documento faz apenas enumeração e desenho de validação; a menos que um protocolo de produto existente confirme explicitamente, não se marca nenhum resultado como accepted por conta própria.

Documentos relacionados:

- Catálogo do caminho principal: [conversation-session-case-catalog.md](../conversation-session-case-catalog.md)
- Matriz de cobertura do caminho principal: [conversation-session-e2e-coverage-matrix.md](./conversation-session-e2e-coverage-matrix.md)
- Matriz de cobertura de Fault: [conversation-session-fault-e2e-coverage-matrix.md](./conversation-session-fault-e2e-coverage-matrix.md)
- Protocolo de captura/replay de SSE: [e2e-sse-capture-replay.md](./e2e-sse-capture-replay.md)
- Protocolo de injeção de falha de FS: [e2e-fs-fault-injection.md](./e2e-fs-fault-injection.md)

## Limites da enumeração

O espaço infinito continua reduzido por classes de equivalência:

| Dimensão | Classes de equivalência |
| --- | --- |
| session.phase | `prewarming`、`running`、`compacting(manual)`、`compacting(auto)`、`completed(success)`、`completed(interrupted)` |
| queue.length | `0`、`1`、`2`、`3+` |
| active visibility | sessão atual visível, sessão atual invisível mas rodando em segundo plano |
| network phase | requisição não enviada, enviada mas sem response header, com response header mas sem SSE event, com alguns SSE events, perna principal de compact streaming, perna de fallback compact non-stream |
| retry count | `0`、`1`、`2`、`3+` |
| storage target | arquivos do workspace, session history, model provider settings, logs/artifacts |
| app lifecycle | alternar para outro app, fechar a janela, sair do app, reload/crash do renderer, crash de host/agent, retomada do sono do sistema |

Estado de Review:

| Estado | Significado |
| --- | --- |
| `decision-needed` | expectativa de produto não confirmada; não se pode escrever asserção estável de pass/fail |
| `accepted` | expectativa de produto confirmada; a automação pode ser escrita |
| `infra` | comportamento da infraestrutura de teste, não é um case de produto |
| `invalid` | a combinação é podada por regras anteriores |
| `ignored` | não coberto na versão atual |

## Sinais de aceitação globais padrão

Não são regras que substituem a definição de produto, e sim a camada de evidências que todo fault case precisa coletar:

| Camada de evidência | Sinais obrigatórios |
| --- | --- |
| UI | `data-state`, `data-runtime-status`, `data-queue-count` de `TID_CHAT_VIEW`, barra de erro/toast, estado disabled dos botões |
| Runtime/Store | se `activeInputId` é limpo, se a queue se perde, se stopRequested/autoDrain está conforme o esperado |
| Network/SSE | status code da requisição, ordem dos SSE events, se houve queda de stream, se houve retry, se a requisição principal foi reenviada |
| Protocol | se `session/send`, `session/compact`, `session/goal`, `session/stop` aparecem ou não como esperado |
| Log | se UI/service/agent têm registros de erro e recuperação para o mesmo `sessionId/inputId` |
| Files | se o snapshot da sessão, as provider settings e os arquivos do workspace foram gravados em disco ou preservados |

## N. Falhas de requisição de modelo/API

| ID | Estado anterior | Injeção de falha | Expectativa de produto a confirmar | Verificação sugerida | Review |
| --- | --- | --- | --- | --- | --- |
| N01 | `running`, queue arbitrária | Requisição do modelo principal retorna 401/403 | Se entra em `error`, se avisa para reconfigurar a API Key, se a queue é preservada | UI error + network status + session snapshot | decision-needed |
| N02 | `draft` ou `completed` | provider não configurado / API Key ausente | Se bloqueia o envio ou entra no guia de configurações; se a entrada do usuário é preservada | UI disabled/error + ausência de requisição de modelo | decision-needed |
| N03 | `running`, queue arbitrária | Requisição do modelo principal retorna 429 | Se há retry automático; se dá para continuar enfileirando durante o retry; como a queue é tratada após a falha final | network retry timeline + queue snapshot | decision-needed |
| N04 | `running`, queue arbitrária | Requisição do modelo principal retorna 502/503 | Se há retry automático; se a falha permite retry/edit/fork | network status + UI runtime + botões de ação | decision-needed |
| N05 | `running`, queue arbitrária | Requisição do modelo principal retorna 500 com JSON de erro | Entra em `error`; a queue já recebida é preservada como está e tem o consumo automático pausado (`autoDrain=false`); ao clicar em "continuar", a recuperação segue FIFO, sem limpeza silenciosa por causa deste erro | UI error + network body + snapshot + requisição de recuperação | accepted |
| N06 | `prewarming` | DNS/connection refused, sem response header | Se a user message é preservada; se ainda é possível enviar mensagens; como a queue é tratada | network error + UI phase + files | decision-needed |
| N07 | `prewarming` ou `running` | Timeout da requisição, sem response header por muito tempo | Limiar de timeout, se o stop é permitido, se há falha automática | fixture controlada por timer + ação de stop | decision-needed |
| N08 | `running` | 200 mas a resposta não é JSON/SSE de modelo válido | Se é tratado como erro de modelo ou erro de protocolo; se há retry | fixture malformado + UI error | decision-needed |
| N09 | Turno principal bem-sucedido | Falha na requisição de title/sidecar | Se afeta completamente a sessão principal; se basta um warn no log | mensagem principal completed + registro de falha do title | decision-needed |

## S. Falhas de streaming SSE

| ID | Estado anterior | Injeção de falha | Expectativa de produto a confirmar | Verificação sugerida | Review |
| --- | --- | --- | --- | --- | --- |
| S01 | `prewarming` | Response header devolvido, mas queda sem nenhum SSE event | Se equivale a erro de modelo; se a user message é preservada | responseEvents vazio + UI error | decision-needed |
| S02 | `running` | Queda depois de `message_start` | Se gera assistant interrupted/error; se a queue faz drain automático | assistant parcial + queue snapshot | decision-needed |
| S03 | `running` | Queda depois de alguns text deltas | Se o texto parcial é preservado; se fork/edit são permitidos; se a queue é preservada | assistant text + botões de ação + files | decision-needed |
| S04 | `running` | JSON de SSE event malformado | Se encerra como erro de protocolo ou ignora o event ruim | evento malformado + log + UI error | decision-needed |
| S05 | `running` | Provider envia error event no SSE | Se exibe o erro do provider; se há retry | error event + UI error normalizado | decision-needed |
| S06 | `running` | Stall do stream, sem event novo por muito tempo | Limiar de timeout de stall; se exibe "retry/parar" | events atrasados + runtime status | decision-needed |
| S07 | Após stop | Provider continua emitindo SSE events atrasados | Se o event tardio precisa ser ignorado, sem poluir o novo turno | inputId do stop + event tardio + ordem das mensagens | decision-needed |

### Sub-limites de recuperação de S02/S06 já confirmados

| ID | Pré-condição e falha | Conclusão de produto já confirmada | Evidência | Estado |
| --- | --- | --- | --- | --- |
| S02-R1 | `running`, ainda sem corpo e sem `tool_call`; após alguns `reasoning_delta` exibidos em tempo real ocorre queda retryable ou idle timeout, e o orçamento de recovery do core ainda não foi esgotado | O turno `running` atual é mantido; a cauda de reasoning incompleta da attempt que falhou é descartada e não entra no histórico do provider; a recuperação SSE é iniciada automaticamente com um novo assistant message id a partir do anchor provider-safe anterior. Queue, Stop e as fronteiras de entrega desktop continuous e mobile replayable não mudam; cancelamento do usuário, erros não retryable e esgotamento de orçamento não entram neste sub-caso | Core request/history + stream recovery events + protocol retry state | accepted |

`S02-R1` é um ramo de recuperação limitado dos S02/S06 existentes; não cria uma nova linha de fault de nível superior e não substitui as perguntas em aberto de S02/S06 sobre falha final, queue e botões de ação.

## C. Falhas de Compact

Estas se relacionam diretamente com o caminho principal `F/G`; as definições de resultado seguem o catálogo principal e não são repetidas aqui. Este grupo foi decizido junto com os cases de origem em 2026-07-05.

| ID | Origem | Injeção de falha | Expectativa de produto a confirmar | Review |
| --- | --- | --- | --- | --- |
| C01 | F09 | A perna principal de streaming e a perna de fallback non-stream do compact manual falham | Decidido (2026-07-05): manter completed + failed marker (com entrada de retry); queue preservada sem consumo automático; todas as operações recuperadas | accepted |
| C02 | G11 | 3 falhas consecutivas do compact automático | Decidido (2026-07-05): continuar executando o pendingAction sem compactação (mantendo running); o failed marker não bloqueia; circuit breaker em vigor, reset pelo compact manual bem-sucedido | accepted |
| C03 | G12 | Compact automático interrompido por stop | Decidido (2026-07-05): alinhado com o stop comum — pendingAction preservado como interrupted user message (não volta para a queue); `completed(interrupted)`; marker marcado cancelled; o append explícito de queue é preservado sem consumo automático | accepted |

## D. Falhas de sistema de arquivos/armazenamento

| ID | Estado anterior | Injeção de falha | Expectativa de produto a confirmar | Verificação sugerida | Review |
| --- | --- | --- | --- | --- | --- |
| D01 | Turno principal concluído e gravado | Escrita da session history falha com ENOSPC | Se a UI avisa; se o estado em memória é preservado; como recuperar após reiniciar | erro de fs injetado + snapshot + relaunch | decision-needed |
| D02 | Tool escrevendo arquivo do workspace | Disco do workspace cheio | Como o tool error é exibido; se o assistant continua resumindo a falha | status do bloco de tool + file tree | decision-needed |
| D03 | Página de configurações salvando o provider | Permission denied no diretório de app data | Se bloqueia o salvamento e preserva a entrada; se escreve log | UI error de settings + arquivo do provider | decision-needed |
| D04 | Recuperando sessão na inicialização | Arquivo de snapshot da sessão corrompido | Se pula a sessão ruim, mostra erro de recuperação, ou bloqueia a entrada no workspace | fixture corrompido + lista de tasks | decision-needed |
| D05 | Streaming de logs por muito tempo | Falha na escrita de logs/artifact | Se o fluxo de produto continua; se a falha de log é só warn | falha no log sink + turno principal completed | decision-needed |

## L. Falhas de ciclo de vida do app/processo

| ID | Estado anterior | Evento do usuário/sistema | Expectativa de produto a confirmar | Verificação sugerida | Review |
| --- | --- | --- | --- | --- | --- |
| L01 | `running` | Usuário alterna para outro app / minimiza | Se a sessão continua rodando; se a UI追上 o stream mais recente ao voltar | background + snapshot em foreground | decision-needed |
| L02 | `running` | Fecha a janela atual sem sair do app | Se host/agent continuam; como recuperar ao reabrir a janela | close/open de janela + logs | decision-needed |
| L03 | `running` | Sai do app e reabre | Se o turno atual continua, é recuperado ou marcado como interrupted | relaunch + snapshot + network | decision-needed |
| L04 | `running` | Reload/crash do renderer | Se a cadeia continuous é reconectada; se a queue se perde | reload do renderer + rehydrate do store | decision-needed |
| L05 | `running` | Crash/restart do processo host | Se o host é reconstruído; como o estado da sessão é recuperado | kill host + service logs | decision-needed |
| L06 | `running` | Crash/saída do processo agent | Se a UI entra em error; se a queue é preservada; se há retry | kill agent + UI error | decision-needed |
| L07 | `running` | Sleep/wake do sistema | Como tratar a queda do SSE; se há recuperação automática | simulação de sleep / network stall | decision-needed |
| L08 | `compacting` | App fechado/saída | Se o compact marker após restart é running, interrupted, failed ou unknown | relaunch + snapshot do marker | decision-needed |

## W. Mudanças externas em Workspace / Tool

| ID | Estado anterior | Injeção de falha | Expectativa de produto a confirmar | Verificação sugerida | Review |
| --- | --- | --- | --- | --- | --- |
| W01 | session open | Diretório do workspace é deletado ou renomeado | Se bloqueia a entrada, avisa para reselecionar, ou mantém o histórico somente leitura | mutação de fs + estado da UI | decision-needed |
| W02 | Tool em read/write | Arquivo é modificado/deletado externamente | Se o tool error é exibido com precisão; se o assistant seguinte sabe da falha | bloco de tool + snapshot de arquivos | decision-needed |
| W03 | Capacidade relacionada a git | Repositório inexistente ou dirty state alterado | Se degrada para um workspace de arquivos comum | tool/log + estado de capacidade da UI | decision-needed |
| W04 | remote workspace | Conexão SSH/WSL/Docker cai | Como cada um de mobile replayable e desktop continuous se recupera | desconexão remote + clientMode | decision-needed |
| W05 | Requisição de permissão pendente | Usuário fecha/troca de sessão | Se a requisição pendente é preservada, expira ou é rejeitada automaticamente | UI de permissão + protocol | decision-needed |

## X. Isolamento de falhas entre Sessions

| ID | Estado anterior | Injeção de falha | Expectativa de produto a confirmar | Verificação sugerida | Review |
| --- | --- | --- | --- | --- | --- |
| X01 | A `running`, B active | Falha na requisição do modelo principal de A | A visão principal de B não pode ser sobrescrita pelo erro de A; como o estado da lista de A é exibido | DOM ativo + estado do item de task | decision-needed |
| X02 | A `compacting`, B active | Compact de A falha | Toolbar/sidebar de B não são afetados pelo compact marker de A | DOM ativo + snapshot de A | decision-needed |
| X03 | A em error, B active | Volta para A | Como o error, a queue e os botões de ação de A voltam a ser exibidos | troca de sessão + estado da UI | decision-needed |

## T. Falhas da infraestrutura de teste

Não são cases de produto, mas precisam entrar na capacidade de teste enginerada, senão o fault E2E acaba com falsos positivos com facilidade.

| ID | Falha | Expectativa | Review |
| --- | --- | --- | --- |
| T01 | Fixture de replay ausente | O teste deve falhar como infra error, sem se passar por um 500 de produto | infra |
| T02 | Ordem de correspondência de fixture errada | O artifact precisa mostrar qual fixture id foi atingido e a ordem das requisições | infra |
| T03 | Artifact de captura contém segredos | Segredos de headers/body precisam ser redacted | infra |
| T04 | Container `replay-isolated` sai para a rede por acidente | O teste precisa falhar; a CI só pode depender de fixtures | infra |

## Estatísticas atuais

| Escopo | Quantidade |
| --- | ---: |
| Linhas de fault de produto | 40 |
| Destas: novos cases de produto de falha externa | 37 |
| Destas: aliases undefined do caminho principal | 3 |
| Cases de infraestrutura de teste | 4 |
| accepted | 4 |
| decision-needed | 36 |
| infra | 4 |

`C01-C03` são aliases da perspectiva de falha de ambiente de `F09/G11/G12` e não aumentam a contagem de cases do caminho principal A-J. `C01-C03` passaram a accepted em 2026-07-05 junto com a decisão dos cases de origem. A semântica de queue de N05 é o invariante comum de recuperação para todos os estados terminais `TurnError` de turnos principais comuns: o erro encerra apenas o turno atual e não desfaz entradas subsequentes já accepted; a projeção de erro coloca a fila em estado pausado, evitando que o auto drain pós-erro ultrapasse a confirmação do usuário. O número de retries de 429/503, a exibição de texto parcial em queda de SSE etc. continuam decizidos por suas respectivas linhas de fault.

Após a consolidação e deduplicação, a lacuna atual de decisões de produto distintas é: 36 novas falhas externas.

## Próxima ordem de confirmação

Para transformar logo os fault cases em E2E, recomenda-se confirmar primeiro estas semânticas P0:

1. `N03/N04`: se 429 e 333 fazem retry; estado da queue e dos botões após a falha final.
2. `S02/S03`: após queda de SSE no meio, o texto parcial do assistant é preservado como interrupted ou entra em error.
3. `D01`: em ENOSPC na escrita da session history, o usuário precisa ver um erro, e como recuperar após reiniciar.
4. `L03/L06`: semântica de recuperação/interrupção do turno em running ao sair do app ou em crash do agent.
5. ~~`C01/C02/C03`~~ decididos (2026-07-05), entram na fila de escrita de E2E.

## Rascunho de mapeamento para specs de E2E

Estas specs servem primeiro como limites de implementação e não representam expectativa de produto já confirmada. Só depois que o case correspondente passar de `decision-needed` para `accepted` as asserções podem ser fixadas.

| Spec sugerida | Cobertura | Infraestrutura existente | O que ainda falta |
| --- | --- | --- | --- |
| `conversation-session-network-fault.test.ts` | N01-N08 | Replay DeepSeek já suporta statusCode, body, delayMs | Precisa de confirmação de produto sobre a semântica de UI e de queue para 401/429/503/timeout |
| `conversation-session-sidecar-fault.test.ts` | N09 | O replay já permite simular falha por body no request de title | Precisa confirmar se a falha de title não afeta de todo o turno principal |
| `conversation-session-sse-fault.test.ts` | S01-S07 | O replay já suporta SSE events, offsetMs, `closeMode=destroy` para queda anormal; `upstreamReplayServer.test.ts` já fixa a diferença de artifact entre EOF normal e queda anormal | Precisa confirmar o estado de produto após cada tipo de queda de SSE |
| `conversation-session-compact-failure.test.ts` | C01-C03 | As pernas de transporte do compact e o fixture de auto retry já existem | ~~Semântica de produto~~ decidida (2026-07-05), dá para escrever asserções estáveis conforme a conclusão; as asserções contam separadamente as tentativas lógicas de compact e as requisições físicas ao provider |
| `conversation-session-storage-fault.test.ts` | D01-D05 | Já existe o protocolo de fs fault injection e testes unitários de helper, com suporte a retorno de erros no estilo Node (`ENOSPC`, `EACCES`) por path / operation; já estão conectados o `config.json` do provider, `setting.json`, a ordem de exibição dos providers, open/write do SQLite de sessão, criação de diretório pai / escrita não atômica / remoção das tools de workspace, escrita de artifact de tool, escrita de log JSONL do CLI e append de log do desktop main; o caminho padrão de temp/rename atômico do workspace não entra no fault hook | Precisa confirmar a expectativa de produto e decidir se a falha de criação do diretório de logs no startup também passa a ser engolida |
| `conversation-session-lifecycle-fault.test.ts` | L01-L08 | WDIO controla janela, processo Electron e relaunch | Falta definir a semântica de recuperação de running/compact após relaunch |
| `conversation-session-workspace-fault.test.ts` | W01-W05 | WDIO pode modificar a árvore de arquivos do workspace | A desconexão remote e a permissão pendente exigem um harness adicional |
| `conversation-session-cross-session-fault.test.ts` | X01-X03 | Já existem helpers de múltiplas sessions e fixtures de replay | Falta determinar primeiro o estado-alvo de um fault de sessão única e então validar o isolamento |

## Lacunas de capacidade de Fixture / Harness

| Capacidade | Cases alvo | Descrição |
| --- | --- | --- |
| Fixture de status HTTP | N01、N03-N05 | Já suportado; o fixture devolve diretamente 401/429/503/500 com JSON body |
| Fixture de atraso de resposta | N07、S06 | Já suporta `delayMs` / SSE `offsetMs`; falta unificar os limiares de timeout |
| Fixture de SSE parcial | S01-S05 | Já suporta escrever um conjunto limitado de events e depois encerrar, e também `closeMode=destroy` simulando queda anormal; testes unitários cobrem os artifacts de `complete/end` e `error/destroy` |
| SSE tardio após stop | S07 | Precisa de um fixture que continue escrevendo events após o stop e use o inputId para provar que a UI ignora o event obsoleto |
| Injeção de falha de fs | D01-D05 | Já foram fixados o protocolo `ZCODE_E2E_FS_FAULTS` e o helper; provider/config, settings, ordem de exibição dos providers, open/write do SQLite de sessão, criação de diretório pai / escrita não atômica / remoção das tools de workspace, escrita de artifact de tool, escrita de log JSONL do CLI e append de log do desktop main já estão conectados; o caminho padrão de temp/rename atômico do workspace não entra no fault hook; o próximo passo é confirmar a semântica de produto e escrever as asserções de e2e concretas |
| Controle de ciclo de vida de processo | L03-L08 | Precisa de um helper WDIO padronizando quit/relaunch, kill host, kill agent e reload do renderer |
| Harness de desconexão remote | W04 | Precisa de simulação de queda de conexão para hosts remotos SSH/WSL/Docker |