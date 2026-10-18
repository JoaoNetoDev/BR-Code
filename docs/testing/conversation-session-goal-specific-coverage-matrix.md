# Matriz de Cobertura Específica de Goal por Sessão de Conversa

Este documento conta apenas as combinações específicas de goal, evitando contabilizar a cobertura genérica de running/queue/compact como cobertura de goal.

Atenção: as specs relacionadas a goal estão sendo migradas junto com o caminho principal de conversation para `packages/desktop/test/e2e/conversation-session/manual-review/pending/`. Neste arquivo, `covered` significa que já existe setup/action/assert histórico específico; antes da revisão manual e da promoção de volta ao caminho padrão, isso não significa que o gate de qualidade padrão de conversation já esteja consolidado.

As combinações cruzadas entre Goal e fork são podadas pelos invariantes de fork; veja [conversation-session-fork-cross-product-matrix.md](./conversation-session-fork-cross-product-matrix.md).

Significado dos status:

| Status      | Significado                                                    |
| ----------- | -------------------------------------------------------------- |
| `covered`   | Já existe setup/action/assert específico de goal               |
| `partial`   | Parcialmente coberto por cases genéricos vizinhos, mas sem asserção específica de goal |
| `missing`   | A expectativa do produto já está definida, mas ainda não há automação |
| `failing`   | Já existe uma sondagem, mas a implementação atual não atende    |
| `undefined` | Expectativa do produto ou semântica de falha ainda não confirmada |

## Estatísticas Específicas Atuais

| Escopo                   | covered | partial | missing | failing | undefined |
| ------------------------ | ------: | ------: | ------: | ------: | --------: |
| Goal estados básicos     |      10 |       2 |       0 |       0 |         0 |
| Goal + queue             |      11 |       2 |       1 |       0 |         0 |
| Goal + compact           |       4 |       1 |       0 |       1 |         3 |
| Goal + fork/edit         |       3 |       1 |       1 |       0 |         3 |
| Goal + session/model     |       4 |       1 |       0 |       0 |         0 |
| Goal meios de verificação |       1 |       5 |       0 |       0 |         0 |
| Goal anomalias de ambiente |       0 |       0 |       0 |       0 |         7 |
| Goal sincronização de recuperação |       2 |       0 |       0 |       0 |         0 |

## G0. Goal Estados Básicos

| ID    | Cenário                            | Expectativa                                                                 | Status   | Automatização                                                        |
| ----- | ---------------------------------- | ------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------- |
| G0-01 | completed + sem goal + `/goal`     | Define o goal; o comando original aparece imediatamente como real-user query; a UI exibe o objetivo; não aparece o bloqueio `validating` | covered | bootstrap live/cold projection regression + `conversation-session-goal.test.ts` |
| G0-02 | completed + goal existente + `/goal replace` | Substitui pelo novo objetivo sem o prefixo; o comando original continua exibido literalmente; não gera dois objetivos conflitantes | covered | bootstrap command/persistence regression + `conversation-session-goal.test.ts` |
| G0-03 | running + sem goal + `/goal`       | Apenas entra na fila, sem enviar imediatamente a requisição de objetivo; ao ser consumido, o comando original aparece como real-user query | covered | bootstrap command regression + `conversation-session-goal.test.ts` |
| G0-04 | running + goal existente + `/goal` | Apenas entra na fila; ao ser consumido, atualiza o objetivo e exibe a query do comando original | covered | bootstrap command regression + `conversation-session-goal.test.ts` |
| G0-05 | goal continuation interrompido por stop | Sai do streaming; a fila é preservada; por padrão não é consumida automaticamente; não aparece o estado de produto paused | covered | `conversation-session-goal-session-model.test.ts` |
| G0-06 | fase de verificação do goal        | Não gera estado de prohibiting `validating` independente, nem desabilita adicionalmente compact/fork/edit | covered | `conversation-session-goal.test.ts` |
| G0-07 | clique em pause no resumo do goal ativo | `pauseGoal` isolado fecha o tempo decorrido e entra em paused; encerra quando há trabalho ativo e também pode pausar quando não há; não reaproveita a disposição de stop da fila | covered | bootstrap command/projection + UI focused + `conversation-session-v4-goal.test.ts` |
| G0-08 | clique em resume no resumo do goal pausado | `resumeGoal` preserva o tempo acumulado e abre um novo intervalo ativo; continua o goal existente | covered | bootstrap command/projection + UI focused + `conversation-session-v4-goal.test.ts` |
| G0-09 | múltiplas rodadas de todo/verifier no mesmo target | Cada rodada exibe action/status/progress; o círculo numerado verde só aparece quando o todo não está vazio e está todo concluído | partial | projection/UI focused; aguardando case formal de replay do provider |
| G0-10 | resumo de goal verified           | Congela o tempo decorrido, mostra o círculo verde com check, oculta pause/resume; consistente entre cold/live | partial | projection/UI focused; aguardando gate formal de desktop + replayable |
| G0-11 | modo Plan submete `/goal` ou alias de goal pelo composer | Apenas um toast; mantém a entrada; não cria/atualiza/retoma goal, não despacha command | covered | `v4SessionPaneModelSwitchRecovery.test.ts` + `v4ConversationComposerPromptHistory.test.ts` |
| G0-12 | troca de modelo em histórico completed e `/goal` imediato | O marcador de troca de modelo continua exibido, mas o turno control-only da query original não exibe “trabalhando/trabalhou”; a continuação real exibe apenas um estado de trabalho; consistente entre live/cold | covered | bootstrap live/cold projection + UI render-unit/component focused regression |

## G1. Goal + Queue

| ID    | Cenário                                                   | Expectativa                                                                                                                                                                  | Status   | Automatização                                                |
| ----- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- | ------------------------------------------------------------- |
| G1-01 | múltiplos `/goal` na fila                                 | Mantém FIFO durante running; após stop, a fila retida não é consumida automaticamente; a sobreposição de objetivo em consumos consecutivos é coberta pelos casos específicos send-now/goal-run | covered | `conversation-session-goal-queue.test.ts` |
| G1-02 | fila misturando texto comum e `/goal`                     | Mantém FIFO; os kinds são `text` / `goal`                                                                                                                                    | covered | `conversation-session-goal-queue.test.ts` |
| G1-03 | `/compact` digitado durante running                       | Entra na fila como `kind=compact`, sem disparar requisição de compact paralela e sem gerar user row                                                                              | planned  | Falta o case de compact em queue accepted                     |
| G1-04 | goal editável na fila                                     | Atualiza apenas aquele item da fila; o kind continua `goal`; não dispara requisição                                                                                            | covered  | `conversation-session-goal-queue.test.ts` |
| G1-05 | goal removível na fila                                    | Remove apenas o item de queue do objetivo; não dispara requisição                                                                                                             | covered  | `conversation-session-goal-queue.test.ts` |
| G1-06 | goal reposicionável na fila                               | Apenas muda a ordem da fila; não dispara requisição                                                                                                                           | covered  | `conversation-session-goal-queue.test.ts` |
| G1-07 | “enviar imediatamente” em um goal                         | Ao clicar em enviar imediatamente num goal enfileirado durante running, a própria ação se encarrega de parar a sessão atual e executar a requisição de goal; sobreposição de objetivo por goals enfileirados consecutivos não entra no gate GQ | covered | `conversation-session-running-send-now.test.ts` |
| G1-08 | troca de modelo após o goal entrar na fila                | Na consumição, usa o modelo e a profundidade de raciocínio mais recentes da sessão                                                                                            | covered  | `conversation-session-goal-session-model.test.ts` |
| G1-09 | fila misturando `/compact`, texto comum e `/goal`         | Os três kinds seguem FIFO estrito conforme a admissão do CLI; na consumição, text/goal/compact seguem suas semânticas originais e compact não gera user row                      | planned  | Precisa de asserções de UI + kind/FIFO no protocolo             |
| G1-10 | fila aguardando target complete enquanto o goal ativo não atingiu o resultado | Um único `goal_verification completed`, `task_complete` ou `setAutoDrain(true)` não dispara o consumo da fila; enquanto o target estiver active/paused/budget_limited, text/goal/compact são todos preservados; tanto o pass explícito quanto o fail-open primeiro escrevem `passed=true` e atualizam o target para `complete`, e só então o consumo segue FIFO; encerrar o verifier manualmente é cancelled/paused e não conta como pass | partial | BG34 já cobre o representative de notificação de background verifier com explicit-pass + text em queue; fail-open, permanência quando não atingido e cancel ainda aguardam cases específicos |
| G1-11 | clicar em executar imediatamente num item da fila durante a saída de um goal ativo comum | Equivale a Stop: encerra a continuação automática do target ativo e a saída atual do assistant; o item clicado vira o próximo active input e o restante da fila mantém a ordem relativa | covered | `conversation-session-goal-run-cases.test.ts` |
| G1-12 | clicar em executar imediatamente num item da fila durante o verifier de um goal | Equivale a Stop: encerra o verifier atual e a continuação de goal seguinte; o resultado do verifier do target antigo não pode sobrescrever o item de queue clicado nem disparar continuações automáticas extras | covered | `conversation-session-goal-run-cases.test.ts` |
| G1-13 | enviar texto de steer no modo guide durante output/continuation de goal ativo | Após o batch completo de tool result, no máximo uma guided user message entra no mesmo turno; não pode executar Stop, pausar ou encerrar o target ativo; a própria requisição de verifier não faz steer, caindo no fallback de queue de G1-14 | covered | `conversation-session-running-guide-steer.test.ts` cobre o V4 Composer, a ordem completa do tool-batch e o target ativo não ser parado |
| G1-14 | enviar guide/texto comum/`/goal`/`/compact` durante o verifier de um goal ativo | O guide, por causa do verifier ocupado, cai via fallback de queue com o mesmo intent; os demais entram direto na future queue; nada interrompe o verifier; um único terminal de verification não drena antecipadamente, e o consumo por kind/FIFO só ocorre após o target complete | partial | O formal `conversation-session-running-guide-steer.test.ts` já cobre o fallback de queue do guide e o target não ser parado; BG34 cobre o representative de texto comum; `/goal` e `/compact` continuam compartilhando o typed controlled-stream case com G1-10 |
| G1-15 | clicar em Stop durante o verifier de um goal ativo e depois enviar texto comum | O Stop cancela a mesma execução de goal conforme o `foregroundExecutionId` no momento do clique; verifier cancelled, target paused, queue `autoDrain=false`. É noop se a execução antiga já foi encerrada e trocada por uma nova execução não relacionada; após um Stop bem-sucedido, o texto comum inicia uma nova requisição ao provider | partial | Runtime, handler do V4 e regressões de projection/UI já foram adicionados; `conversation-session-goal-interruptions.test.ts` ainda está em manual-review/pending, e o replay isolado precisa ser refeito quando o ambiente Docker for restabelecido e revisado manualmente |
| G1-16 | task inativa com goal ativo, passando por turno comum em estado terminal, continuation notSatisfied e, ao final, explicit pass/fail-open; também seizing representantes de Stop/cancel e error | Turno comum, notSatisfied, continuation e Stop/cancel não geram não-lido de conclusão; explicit pass/fail-open gera apenas uma vez o não-lido de task/Dock depois que o target é projetado como `verified`; error continua sendo um lembrete de falha | covered | `zcodeTaskIndexSyncer.test.ts`, `taskStatusUnreadSync.test.ts`; reutiliza a semântica de target-complete de G1-10 para explicit pass/fail-open, sem nova permutação completa com os kinds da fila |

## G2. Goal + Compact

| ID    | Cenário                                       | Expectativa                                          | Status    | Automatização                                         |
| ----- | --------------------------------------------- | ---------------------------------------------------- | --------- | ----------------------------------------------------- |
| G2-01 | `/goal` durante compact manual                | Entra na fila, sem disparar requisição extra ao modelo | covered   | `conversation-session-compact-actions.test.ts`      |
| G2-02 | queued goal após stop do compact manual        | A fila é preservada e não é consumida automaticamente por padrão | covered | `conversation-session-compact-actions.test.ts` |
| G2-03 | queued goal após falha do compact manual       | O compact manual não é retentado; como tratar o queued goal ainda precisa ser definido | undefined | F09 |
| G2-04 | auto compact bem-sucedido antes do queued goal | Após o sucesso do compact, segue consumindo o queued goal | covered | `conversation-session-compact-auto.test.ts` |
| G2-05 | auto compact com falha antes do queued goal    | Se o goal é preservado após a falha e se o consumo continua ainda precisa ser definido | undefined | G11 |
| G2-06 | auto compact ainda falhando após 3 retentativas | O tratamento do pending goal ainda precisa ser definido | undefined | G11 |
| G2-07 | usuário envia `/goal` durante auto compacting  | `/goal` entra na fila e não interrompe o compact       | failing   | `conversation-session-compact-auto-actions.test.ts` |
| G2-08 | `/compact` repetido + `/goal` durante auto compacting | `/compact` repetido é rejeitado; `/goal` entra na fila sem gerar nova requisição ao modelo | covered | `conversation-session-compact-auto-actions.test.ts` |
| G2-09 | queued goal após stop do auto compact          | O tratamento de pendingAction/queued goal ainda precisa ser definido | undefined | G12 |

## G3. Goal + Fork/Edit

| ID    | Cenário                                                              | Expectativa                                                                                                                                                            | Status    | Automatização                                                                 |
| ----- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------- | ------------------------------------------------------------------------------ |
| G3-01 | assistant fork durante goal continuation ou goal verifier em running | Pode fazer fork do último trecho completed assistant de um turn `completedSuccess` mais antigo; o turn atual não consolidado continua sendo rejeitado; o child não copia trabalho/continuation inbox de goal ativo, e o target pai continua | missing | A asserção global de desativação do antigo `conversation-session-goal-session-model.test.ts` está desatualizada; aguardando `PV4-08/FX06` |
| G3-02 | edit da última user query durante goal continuation em running | Permitido; ao submeter, para primeiro o trabalho ativo do goal atual e então reexecuta a partir da última query, preservando a fila como está | planned   | Precisa de cobertura específica de latest edit |
| G3-03 | recuperação por fork/compact/edit após goal completed                 | Recupera pelas regras gerais de completed                                                                                                                            | partial   | O `fork/edit/compact` genérico tem cobertura; falta específico de goal completed |
| G3-04 | edit de user query antiga, com goal existente                        | Se atualiza o objetivo, preserva o antigo ou apenas reexecuta o conteúdo ainda precisa ser definido                                                                       | undefined | Precisa de definição de produto |
| G3-05 | edit de user query antiga, sem goal                                  | Se equivale a definir um goal ainda precisa ser definido                                                                                                                 | undefined | Precisa de definição de produto |
| G3-06 | entrada de user edit durante goal continuation em running             | Mostra edit apenas na última real user query; não mostra em user queries do histórico                                                                                   | planned   | Precisa de cobertura específica de latest edit |
| G3-07 | sessão pai já com goal/target antes do fork, com queue pai não vazia   | O child herda o goal target, a iteração e a timeline do verifier de antes do ponto de fork; a queue do pai é preservada e a queue do child fica vazia | covered | `conversation-session-fork.test.ts`; correspondente a `FX03` |
| G3-08 | sessão pai com Goal cria um selection side chat nos estados active, paused ou complete | A criação é permitida nos três estados; o child preserva o corpo do provider e não copia `goalBoundary`, target, verifier entries, queue ou trabalho ativo | covered | `session-fork.test.ts`; correspondente a `SSC23`; `budget_limited` e paused são podados como snapshot incompleto |

## G4. Goal + Session / Model

| ID    | Cenário                              | Expectativa                                                       | Status   | Automatização                                            |
| ----- | ------------------------------------ | ----------------------------------------------------------------- | -------- | -------------------------------------------------------- |
| G4-01 | goal A em running, troca para B       | A visão principal, o target e a queue de B não vazam para A      | covered  | `conversation-session-goal-session-model.test.ts`        |
| G4-02 | A com queued goal, troca para B e volta a A | O target e o queued goal de A são restaurados             | covered  | `conversation-session-goal-session-model.test.ts`        |
| G4-03 | sessão do histórico com goal          | Após abrir, o estado do objetivo acompanha a sessão atual        | covered  | `conversation-session-goal-session-model.test.ts`        |
| G4-04 | criação de nova sessão               | Não herda goal/queue de sessão do histórico; herança de modelo e profundidade de raciocínio fica por conta de I03/`conversation-session-model-config.test.ts` | covered | `conversation-session-goal-session-model.test.ts` |
| G4-05 | sidebar direito acompanha o goal da sessão atual | Não vaza entre sessões                                              | partial  | Hoje só há asserções no chat root/store; falta um test-id dedicado da sidebar |

## G5. Goal Meios de Verificação

| ID    | Camada de evidência                                                         | Estado atual                                                             | Status   |
| ----- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| G5-01 | UI `data-testid` / data attrs                                               | `chat-view` tem `data-target-*`; o item de queue tem `data-kind=goal`    | partial  |
| G5-02 | test-id dedicado para target/objective/status de goal                       | Ainda não existe um test-id independente                                | partial  |
| G5-03 | camada de protocolo: `/goal` preserva simultaneamente a semântica dupla de comando de controle e de visible real-user query | O command intent persiste o objective canônico; message/part e a live row preservam o texto de exibição original | covered |
| G5-04 | logs de goal set/update/queued/consumed                                    | Ainda não há asserções de log estáveis                                    | partial  |
| G5-05 | persistência em arquivo/session snapshot                                   | A troca de sessão tem asserções em memória/recuperação; faltam asserções em nível de arquivo | partial |
| G5-06 | rede distingue goal continuation / auto compact / requisição comum         | O capture consegue differentiate pelo body; ainda não há um campo unificado de request kind | partial |

## G6. Goal Anomalias de Ambiente

Estes ainda não têm E2E estável e entram primeiro na fila de decisões de produto do catálogo de falhas de ambiente.

| ID    | Cenário                                    | Status    | Origem     |
| ----- | ------------------------------------------ | --------- | ---------- |
| G6-01 | requisição de goal retorna 429             | undefined | `N03`      |
| G6-02 | requisição de goal retorna 503             | undefined | `N04`      |
| G6-03 | interrupção do SSE do goal                 | undefined | `S02/S03`  |
| G6-04 | falha na requisição não-streaming/sidecar do goal | undefined | `N09/C01` |
| G6-05 | fila de goal preservada após queda de rede | undefined | `N06/L07`  |
| G6-06 | recuperação de goal/queue após reabrir o app | undefined | `L02/L03` |
| G6-07 | falha na escrita do snapshot do goal por falta de espaço em disco | undefined | `D01` |

## G7. Goal Sincronização de Recuperação

| ID    | Cenário                                                                                                                                        | Expectativa                                                                                                                          | Status   | Automatização                                                  |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------- |
| G7-01 | ao restaurar uma task do histórico, o `session_target` do agent já está paused/complete, mas a meta da task no app ainda aparece como active e já há item na fila | O snapshot/agent target restaurado é a autoridade e contorna o active obsoleto; ao clicar em “enviar imediatamente”, o item de queue clicado é enviado diretamente e o verifier de goal não continua | covered | `conversation-session-goal-resume-stale-target.test.ts` |
| G7-02 | o primeiro `/goal` já foi submetido e persistido; depois há nova assinatura ou cold recovery | Tanto a live projection quanto a cold hydration mostram apenas uma real-user query com o `/goal` original; o objective do target permanece canônico; o continuation reminder não gera bolha de usuário | covered | bootstrap session persistence + transcript hydration regression |

Podas: `/target`, variations de caixa e `replace` entram apenas como classes de equivalência de display/parse canônico nos testes unitários de command/parser; para o queued goal, escolhe-se apenas um representante de consumo FIFO. desktop continuous e mobile replayable não repetem a permutação dos estados terminais de negócio; o último é provado pela equivalência de cold projection sobre o mesmo transcript persistente, sem modificar as fronteiras de attachment/relay do shared host.