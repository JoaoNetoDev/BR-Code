# Espaço de Estados do Produto de Conversa

Objetivo: combinar compact, fork, goal, fila de mensagens, edição de query e funcionalidades afins do produto de conversa em um modelo executável de espaço de estados de produto. O modelo primeiro enumera os próximos passos possíveis do usuário na GUI, depois poda com as regras de produto e, por fim, emite trace cases que podem ser revisados por pessoas e convertidos em E2E.

Os conceitos básicos declarados pelo protocolo estão em [Conversation Behavior Protocol Declaration](./conversation-protocol-declaration.md). Este documento define primeiro os tipos de nó, eventos de entrada, decision, rule, invariantes e a semântica de review de cases; a página de visualização é apenas uma vista dessa expansão do protocolo.

## Por que não é um fluxograma comum

A GUI de conversa não é um fluxo linear. A cada momento o usuário pode continuar digitando, acionar `/compact`, definir um goal, fazer fork de algum turno, editar a query, clicar em um turno do histórico; ao mesmo tempo o sistema pode concluir a execução, concluir um compact, entrar na verificação do goal ou retornar um erro assíncrono.

Portanto a forma básica do modelo é:

```text
Contexto de produto × Ação do usuário × Objeto alvo × Fase do sistema -> guard -> effect -> Próximo contexto de produto
```

Os comandos auxiliares de parâmetros de conversa são ações de criação com escopo de parent, e não entradas comuns do parent:

```text
parent composer `/btw <text>`
  -> App command parser (text-only, CLI same-name wins)
  -> createSelectionSideSession(parent, firstInput=<text>)
  -> child registration + child startNow
  -> open child tab
  -> parent active turn/queue unchanged
```

Isso não é um puro produto cartesiano de conjunto. O produto cartesiano serve apenas para expor combinações candidatas; guard e effect são a própria exigência de produto.

## Escopo de modelagem da primeira versão

Dimensões de estado. `compacting` e `goalVerifying` deixam de ser fases de nível superior; são active work bloqueante de conclusão dentro de `running`:

| Dimensão         | Valores                                                                                                |
| --------------- | ------------------------------------------------------------------------------------------------------ |
| runPhase        | draft、prewarming、running、completed(success/interrupted)、error                                       |
| activeWork      | none、primaryTurn、foregroundSubagent、compact、goalVerifier、goalContinuation、turnSteer               |
| queue           | empty、text、goal、compact、mixed                                                                       |
| queueAutoDrain  | true、false                                                                                             |
| queueAuthority  | cliCommandInbox（desktop/mobile compartilham; outros valores são podados como invalid）               |
| followupDelivery | queue、guide、guideFallbackQueue                                                                        |
| deliveryProfile | desktopContinuous、mobileReplayable                                                                    |
| forkTarget      | completedSuccessFinalAssistant、middleAssistant、streamingPartial、failedPartial、nonAssistant         |
| compactMemory   | never、compactable、justCompacted、notNeeded                                                            |
| canCompactAgain | true、false                                                                                             |
| goal            | none、active、paused、budgetLimited、complete                                                           |
| verifierTerminal | none、explicitPass、failOpenPass、failedContinue、manualCancel                                          |
| selectedTurn    | latest、old                                                                                             |
| toolShape       | none、singleReadonlyTool、parallelTools、activeTool、completedTool、failedTool、interactionTool           |
| toolResultBatch | none、pending、committed                                                                                |
| modelConfig     | native、customProvider、sameModelDifferentProvider                                                      |
| modelMarkerSource | adjacentTurnSwitch、explicitSourceLessBoundary、none                                                    |
| collaborationMode | build、edit、plan、yolo                                                                                 |

Ações do usuário:

| Ação           | Alvo                          |
| -------------- | ----------------------------- |
| sendText       | caixa de entrada atual        |
| slashCompact   | digitando `/compact` na caixa de entrada atual |
| setGoal        | controle de goal ou prompt    |
| compact        | botão/comando de compact      |
| fork           | latest turn、old turn         |
| editQuery      | latest turn、old turn         |
| sendQueuedNow  | item da fila                  |

Eventos do sistema:

| Evento            | Fase aplicável                              |
| ----------------- | ------------------------------------------- |
| assistantComplete | running                                     |
| compactComplete   | activeWork=compact                          |
| compactNoop       | activeWork=compact                          |
| goalVerifyPass    | activeWork=goalVerifier                     |
| goalVerifyFail    | activeWork=goalVerifier                     |
| goalVerifyFailOpen | activeWork=goalVerifier                   |
| goalVerifyCancel  | activeWork=goalVerifier                     |
| toolBatchComplete | activeWork=primaryTurn/goalContinuation     |

## Primeiro lote de regras de produto

Estas regras vêm das expectativas atuais do produto. No modelo elas não são comentários, mas guards executáveis.

| Cenário                                                            | Resultado                                                                                                                                                                    |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| running + sendText                                                  | entra na fila de mensagens                                                                                                                                                    |
| running + `/compact`                                                | entra no CLI FIFO com intenção de manutenção via compact, sem interromper o active work atual                                                                              |
| running + setGoal                                                   | entra na fila de mensagens                                                                                                                                                    |
| running + fork completedSuccessFinalAssistant                       | allow, fork somente de conversa; o pai continua rodando, o workspace compartilhado não sofre rewind                                                                       |
| running + fork middle/streaming/failed/nonAssistant                 | reject, o alvo não é uma fronteira de turno lógico estável                                                                                                                 |
| running + edit latest query                                         | allow, primeiro para o active work atual e depois reexecuta a partir da query do último turno                                                                              |
| running + edit old query                                            | reject, só a edição da última query real de usuário é permitida                                                                                                            |
| completed + fork                                                    | allow                                                                                                                                                                       |
| completed + compact                                                 | allow, entra em compacting                                                                                                                                                    |
| completed + compact after fork                                      | allow                                                                                                                                                                       |
| activeWork=goalVerifier + compact                                   | enqueue; só executa por FIFO depois que toda a cadeia de conclusão do goal terminar                                                                                         |
| activeWork=goalVerifier + fork stable                               | allow, é possível forkar um histórico estável mais antigo; o verifier não é copiado                                                                                       |
| activeWork=compact + compact                                        | reject, já está em compact                                                                                                                                                   |
| activeWork=compact + sendText/setGoal                               | enqueue no CLI FIFO, sem interromper o compact                                                                                                                             |
| activeWork=compact + fork                                           | reject, compact operation lock                                                                                                                                              |
| justCompacted + compact + canCompactAgain                           | allow, entra em compacting                                                                                                                                                    |
| justCompacted + compact + !canCompactAgain                          | reject, avisa que acabou de compactar e não é compactar de novo                                                                                                            |
| completedTool + compact                                             | allow, o histórico de ferramentas participa da compressão de contexto como um comum completed assistant turn                                                                  |
| completedTool + fork                                                | allow, o ponto de fork deve conter blocos de chamada de ferramenta e a projeção dos resultados                                                                              |
| completedTool + setGoal                                             | allow, a atualização do goal não reescreve o histórico de ferramentas existente                                                                                            |
| activeTool + sendText/setGoal                                       | enqueue, a chamada de ferramenta atual pertence ao active turn original                                                                                                    |
| sameModelDifferentProvider + session switch                         | allow, restaura a identidade de provider + model por session, não pode apenas reexibir pelo nome do model                                                                  |
| running + apiRetry                                                  | consome `control.apiRetry` apenas no fim do live turn atual; `attempt<=2` é tratado como loading comum, `attempt>=3` só exibe a contagem de retentativas e substitui o loading; progresso efetivo/estado terminal limpa, e o cold start do CLI não restaura                |
| modelMarkerSource=explicitSourceLessBoundary                        | `∅→X` explícito gera um `modelChange` sem source; child novo persiste essa fronteira, enquanto o primeiro turno do Main e children antigos não geram                                        |
| desktop/mobile busy + accepted input                                | entram no mesmo FIFO pela ordem de admission serial do CLI; não há race de fila dupla                                                                                     |
| guide ineligible/attachment/compact/verifier                        | mantém a Submission completa (incluindo ModelSelection) e faz fallback para a CLI queue; compact não entra em guided row; model/provider não participam da eligibility                                        |
| guide + ordinary queue nonempty                                     | o guide entra no active turn atual; a queue comum mantém o FIFO de turnos futuros e não constitui guard de eligibility do guide                                                    |
| guide + toolResultBatch=committed                                   | todos os tool results irmãos são primeiro fixados como fato e então, no máximo, um guide é consumido inline; o mesmo product turn continua, e Session Selection e o Active Model do próximo model step mudam para a Selection desta Submission  |
| accepted guide + current visual work segment                        | fecha o segment anterior e abre um novo segment no mesmo product turn com a guided user entity; a duração e o colapso de cada segmento são independentes                        |
| guide + parallelTools + toolResultBatch=pending                     | não consome; a conclusão de um único sibling não pode constituir a fronteira do guide                                                                                      |
| guide + turn terminal + toolResultBatch=none                        | o mesmo intent sofre fallback para queue no lugar; preserva IDs, payload e ordem de admission                                                                               |
| ordinary queue + session ready + goal=none/complete + autoDrain     | promove um item do início da fila por FIFO e executa conforme o kind original text/goal/compact                                                                            |
| ordinary queue + goal=active/paused/budgetLimited                   | mantém o FIFO completo; verification marker ou assistant terminal não podem consumir antecipadamente                                                                       |
| verifierTerminal=explicitPass/failOpenPass                          | primeiro target→complete, depois reavalia os guards da queue comum                                                                                                         |
| verifierTerminal=manualCancel                                       | target→paused, autoDrain=false; não consome a queue automaticamente                                                                                                       |
| activeWork=goalVerifier + stop                                     | cancela a mesma goal execution pelo `foregroundExecutionId` carregado na projeção; a troca de fase verifier→continuation não muda a identidade da execution; noop se já mudou para uma execution nova sem relação                                    |
| CLI restart + admitted nonterminal input                            | explicit discarded; `queue/guide` são liquidados silenciosamente, e apenas `startNow`/`unknown` que não entraram no transcript pedem confirmação de reenvio; não há replay automático                            |
| `sendText`/`editUserQuery` accepted input ACK + projection silent   | após o período de carência faz single-flight resync da subscription owned atual; encerra quando a queue/user row autoritativa chega; quando o edit já submeteu o branch cut, também não fabrica fatos de UI, não restaura o branch antigo e não reenvia automaticamente|
| edit/retry preflight passed + branch cut committed + Registry changed| o Core não repete a admissão de diretório mutável; quando a criação do modelo falha, ao longo do ciclo de vida do turno comum primeiro registra o `TurnStarted`/user row de replacement e depois o `TurnError(model_creation)`; se a gravação falhar, continua reportando o erro de criação original, o Stop fica `completed(cancelled)` e a interceptação por hook é tratada como um turno comum; o guide volta para a queue; o rewind do workspace pode ser preservado, mas o replacement não pode ser perdido|
| `/compact` + Registry changed                                       | não publica `TurnStarted` nem grava a user row de `/compact`; publica diretamente `TurnError(model_creation)`                                                                                                                      |
| sendQueuedNow                                                      | reserve -> stop barrier -> promote; remove só em caso de sucesso, e mantém no lugar original em caso de falha                                                               |
| collaborationMode=plan + goal command                               | admission rejeitada pela UI; toast; o texto original do composer é preservado; nenhuma session é criada e nenhum command é enviado                                                     |

A dimensão de transporte não é uma variável livre dos guards de produto. O host injeta o profile de forma confiável conforme o attachment e roteia por subscription pertencente à conexão:

```text
desktop attachment / continuous ── sub-a ──┐
                                            ├─> same terminal projection
mobile attachment  / replayable ── sub-b ──┘

slow/gapped sub-b -> resync sub-b only -> sub-a unchanged
```

O invariante final é: cada entrada submetida precisa cair, e cair apenas, em um entre `queue / guided row / transcript /
explicit rejected|failed|discarded`, preservando o `sourceCommandId` original em toda a cadeia.

Os níveis de estado de guide e da queue comum não podem ser colapsados em um único generic round-trip drain:

```text
Guide inline path
  admitted -> wait complete tool batch -> one guided drain -> same product turn
       \-> no batch before terminal -> same intent becomes ordinary queue

Ordinary queue path
  queued -> autoDrain -> session ready -> target absent/complete -> future turn
                                      \-> target noncomplete -> stay queued
```

`deliveryProfile` afeta apenas como os fatos chegam ao cliente. desktop continuous e mobile replayable deixam de fazer a permutação completa de negócio com `followupDelivery × toolResultBatch × goal`; essa dimensão é representada por testes de equivalência live/cold sobre a mesma CLI terminal projection.

Modelo/provider não participam da guide eligibility e também não estabelecem lista branca de nomes de model nem produto cartesiano com provider. ModelSelection pertence à
Submission: depois que o guide é aceito, o runtime acrescenta o histórico de usuário no limite de model-step, atualiza a Session Selection e cria o
Model correspondente para o próximo request comum de provider; requests já emitidos antes da aceitação mantêm o Model original.

Combinações não cobertas por regra precisam cair em `undefined`, para que uma pessoa decida se é um novo requisito, um estado inválido, um caminho ignorável ou um bug.

## Saída de Review

Cada case folha contém no mínimo:

- Contexto inicial.
- Ação do usuário ou evento do sistema.
- O guard que foi atingido.
- effect: allow、reject、enqueue、system-transition、undefined.
- Próximo contexto.
- Asserção de E2E sugerida.

Estados de review manual:

| Estado     | Significado                            |
| ---------- | -------------------------------------- |
| accepted   | a expectativa de produto está correta e pode virar teste |
| undefined  | falta definição de produto             |
| invalid    | essa combinação deve ser podada da entrada de produto |
| ignored    | a combinação existe, mas não é coberta por enquanto |
| bug        | a implementação atual não corresponde à expectativa |

## Visualização com Vite

Executar:

```sh
pnpm --filter @zcode/formal-proof dev
```

Abrir:

```text
http://127.0.0.1:4176/
```

A página adota um layout priorizando o canvas largo: um painel fixo à esquerda abriga a enumeração de parâmetros, as estatísticas semânticas e os acertos de regra; todo o espaço restante à direita é dedicado ao grafo do espaço de estados e à sua barra de ferramentas. Os detalhes de nó não ocupam uma coluna separada — ao clicar em um nó, eles são exibidos em uma camada flutuante sobre o canvas, evitando comprimir a área visual do grafo.

A visualização não usa mais um mapa mental comum, e sim um DAG de espaço de estados em camadas:

- Horizontalmente, expande-se na ordem `State -> Action -> Guard -> Effect -> Case/Next State`, e as próximas rodadas de enumeração continuam acrescentando à direita as mesmas colunas semânticas.
- Os nós `State`, `Guard` e `Effect` são mesclados por equivalência semântica, e o `×N` em um nó indica que N traces atingem o mesmo nó semântico.
- Ações do usuário e eventos do sistema são exibidos na camada `Action`, e os eventos do sistema usam a mesma entrada de protocolo, evitando esconder tarefas assíncronas longas em comentários.
- A camada `Guard` expressa a poda por regras de produto, a camada `Effect` expressa efeitos colaterais ou migrações de estado, e a camada `Case` preserva as folhas que exigem review manual ou podem ser convertidas em E2E.
- `Reject`、`Undefined`、`Queue`、`Allow`、`System` ainda podem ser filtrados por regra e resultado, e o que se destaca é o caminho do protocolo, e não um ramo de layout.