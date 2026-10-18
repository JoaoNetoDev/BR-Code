# Matriz Cruzada Conversation Session × Tool

Objetivo: completar a cobertura de compact, fork e goal da conversation-session no cenário “com histórico de chamadas de ferramentas”. A abordagem antiga usava apenas `Read /tmp/zcode-e2e-readonly-tool.txt` para provar que existe uma única ferramenta somente-leitura, o que não representa edição de arquivos, comandos, estados de falha de rede, modo de planejamento, perguntas ao usuário, estado local da sessão nem tool block em estado de falha.

## Fronteira de cobertura

Os nomes de ferramentas do叉乘 forte têm como fronteira `packages/shared/src/tool-identity.ts`, `apps/zcode-cli/packages/core/src/tool/handlers/index.ts` e as ferramentas do modo de planejamento. Ferramentas ativas por padrão precisam cobrir o estado de sucesso; ferramentas de registro condicional ou atualmente não registradas também entram no叉乘 da UI, mas podem ser fechadas com um estado de falha rápida, sem misturar a taxa de sucesso de negócio da ferramenta na spec de UI de conversation. Ferramentas não expostas neste encadeamento ficam fora desta matriz.

| Ferramenta             | Estado padrão                     | Estratégia de entrada E2E                                           | Forma do resultado               | Requisito de limpeza                  |
| ---------------------- | --------------------------------- | ------------------------------------------------------------------- | -------------------------------- | ------------------------------------- |
| `Read`                 | active                            | ler um arquivo fixture dedicado                                     | success                          | apagar o diretório dedicado           |
| `Write`                | active                            | criar um arquivo dedicado                                           | success                          | apagar o diretório dedicado           |
| `Edit`                 | active                            | criar arquivo dedicado com `old_string` vazio                      | success                          | apagar o diretório dedicado           |
| `Bash`                 | active                            | `printf` de um marker                                                | success                          | sem escrita de arquivo                |
| `Glob`                 | active                            | casar arquivos fixture em um diretório dedicado                    | success                          | apagar o diretório dedicado           |
| `Grep`                 | condicional no ramo de busca      | ramo direct buscando fixture dedicado; ramo de busca embedded com falha rápida por registry miss | success / failed tool result | apagar o diretório dedicado           |
| `WebFetch`             | active                            | usar uma URL loopback válida mas não pública para disparar uma falha rápida controlada; o ciclo de sucesso de negócio é coberto por `WF/O10` | failed tool result | sem escrita externa                    |
| `TodoRead`             | active                            | ler o todo da sessão atual                                          | success                          | session-local; após o goal, afirmar o histórico de toolCalls pelo renderer store |
| `TodoWrite`            | active                            | escrever no todo da sessão atual                                    | success                          | session-local                         |
| `GoalRead`             | atualmente não registrado         | entrada vazia; se vier a ser registrado, ler o goal da sessão atual | failed tool result / success     | session-local                         |
| `EnterPlanMode`        | active                            | entrada vazia para entrar em plan mode                              | success                          | redefinir `yolo` antes da ação seguinte e do próximo case |
| `ExitPlanMode`         | active                            | chamado fora do plan mode, validando um tool block de falha rápida  | failed tool result               | nenhum                                |
| `AskUserQuestion`      | active                            | uma pergunta com duas opções, o teste escolhe automaticamente a primeira | success                  | session-local                         |
| `ReadSessionContext`   | active                            | ler um session id inexistente                                       | success fallback                 | session-local                         |
| `SendMessage`          | condicional                       | apontar para um `agent_*` inexistente, ou falha rápida quando não registrado | failed tool result    | session-local                         |
| `Agent`                | condicional / subagent padrão     | `subagent_type` inválido, evitando realmente derivar um subagent    | failed tool result               | nenhum                                |
| `Skill`                | active                            | carregar um skill inexistente, validando um tool block de falha rápida | failed tool result           | nenhum                                |
| `Workflow`             | atualmente não registrado         | entrada vazia; se vier a ser registrado, também falha rápido por falta de script/name/resumeFromId | failed tool result | nenhum                                |

Estados de falha rápida entram nesta matriz porque ela valida a estabilidade da UI de conversation diante de tool block + compact/fork/goal subsequente, e não a taxa de sucesso de negócio da rede externa, do subagent ou do registry de skills. A semântica de sucesso da própria ferramenta deve ser coberta nos testes da tool/service correspondente.

## Fechamento de estado terminal de ferramenta não registrada

Se uma ferramenta aparece no schema do provider e no registry em tempo de execução são fatos de dois momentos distintos. O modelo ainda pode devolver um nome de ferramenta que foi ocultado por um ramo de capability, que ficou inválido após uma troca quente de configuração, ou que ele mesmo gerou; um registry miss não pode retornar apenas um erro visível ao provider, é preciso fechar a projection da conversation de forma sincronizada.

```text
provider tool_use(id)
  -> projection tool row: inputStreaming
  -> executor registry lookup: missing
  -> ToolCallError(id)
  -> projection tool row: error
  -> TurnComplete(success)
  -> cold snapshot / replay profile: terminal
```

| Case ID | Estado representado | Asserções-chave | Camada de cobertura |
| --- | --- | --- | --- |
| TLT-01 | `Grep` não registrado no ramo de busca embedded | a falha antes do handler ainda publica um `ToolCallError` com o mesmo `toolCallId` | core executor focused test |
| TLT-02 | ainda há ferramenta de foreground em `inputStreaming/pendingApproval/running` antes do terminal, ou o turn pai termina antes da ferramenta child de um subagent em background | `TurnComplete` fecha as rows de foreground esquecidas como error/cancelled; a ferramenta child de background explícita não é falsamente fechada, e um terminal tardio pode fechar a mesma row | bootstrap projection/profile test |
| TLT-03 | um único turn passa de 60 linhas e o cold tail não tem `turnHeader` | o `session.phase` terminal pressiona o fallback de running por linha, sem exibir ChatLoading | UI focused test + desktop cold snapshot E2E |

Poda: o E2E de desktop usa 60 registry misses de `Grep` em embedded-search mais 1 sentinel de Grep garantidamente não registrado para representar todas as ferramentas não registradas, e 61 chamadas do mesmo tipo para cruzar de forma estável a janela final de 60 linhas; `Workflow` continua fora do conjunto oficial de ferramentas do TX. O replayable do celular reaproveita apenas a convergência de profile do TLT-02, sem replicar arranjos de GUI ou reconexão via relay.

## Cenários de叉乘

| Cenário                | Ação inicial                                                                 | Ações subsequentes                        | Asserções-chave                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `compact-after-tool`   | enviar um prompt com marker de ferramenta, o replay devolve o `tool_use` especificado e depois `upstream-e2e-ok` | `/compact`                                 | o tool block original existe; marker de compact `started` -> `completed`; a requisição de compact contém o marker da ferramenta |
| `fork-after-tool`      | idem                                                                           | fork contendo a assistant message com `upstream-e2e-ok` | novo task/session id diferente; a sessão derivada preserva o user prompt original, o token de assistant e o tool block correspondente |
| `goal-after-tool`      | idem                                                                           | `/goal E2E_TOOL_CROSS_PRODUCT_GOAL_*`       | o target objective é atualizado; o histórico original de ferramentas continua existindo; `/goal` não vaza a continuação interna do goal como uma user message comum visível; `EnterPlanMode` mantém a semântica de estado de planejamento, apenas afirmando a atualização do target, sem exigir continuação do provider; `TodoRead` vazio pode permanecer apenas como toolCalls no renderer store |

## Cobertura Guide × Tool Result Batch

O guard de consumo do guide depende de “o batch completo de tool result de um model step já foi commitado”, e não do nome concreto da ferramenta. Por isso não fazemos o produto cartesiano completo de cada ferramenta da tabela acima com o guide; provamos o invariante comum com três classes de equivalência: ferramenta única com sucesso, batch paralelo com sucesso e tool result com falha.

```text
tool calls emitted: T1, T2, ... Tn
  -> commit result(T1)
  -> ...
  -> commit result(Tn), success or failure
  -> batch terminal
  -> drain at most one guide
  -> next provider request in the same product turn
```

| Case ID | Forma das ferramentas | Momento do guide | Asserções-chave | Estado |
| --- | --- | --- | --- | --- |
| GTB-01 | `Read` somente-leitura única com sucesso | guide já admitido antes da chamada de ferramenta | `ToolCallResult` vem antes de `TurnSteerDrained`; só após o drain a próxima provider request é enviada | pendente: GS/P06 controlled-stream |
| GTB-02 | duas chamadas de ferramenta somente-leitura em paralelo | já havia guide durante a execução dos dois siblings | a conclusão de um único sibling não faz drain; depois que todos os results são commitados, no máximo um guide é drenado | ausente |
| GTB-03 | tool result com falha determinística | já havia guide antes da chamada ou durante a execução | o result com falha ainda faz parte do batch terminal; o fato de falha é commitado primeiro e só então um guide é drenado | ausente |
| GTB-04 | model step apenas de texto, sem ferramenta | guide já admitido | o assistant apenas de texto é commitado primeiro; em seguida no máximo um guide é drenado, anexado com role de user, e a próxima provider request é iniciada no mesmo turn ativo | coberto no core; pendente no desktop: GS/P06 |
| GTB-05 | dois guides + dois batches de ferramentas | ambos os guides admitidos antes do terminal do batch correspondente | no máximo um por batch, em FIFO por admissão; nenhum batch pode drenar os dois | ausente |

Poda: ferramentas concretas como `Write/Edit/Bash/WebFetch/AskUserQuestion/Agent` continuam provadas pela estabilidade de tool block através do叉乘 de compact/fork/goal original desta matriz; o guide acrescenta apenas o invariante de ordenação de batch. O estado de espera do usuário em ferramentas de interação não é combinado separadamente: até formar um tool result ele entra no mesmo batch terminal. O desktop contínuo prova a temporização com um E2E controlled-stream, e o replayable do celular é representado por um teste de equivalência de projection cold/live sobre os mesmos CLI facts, sem replicar a matriz de negócio das ferramentas.

## Restrições de replay

`provider-conversation-tool-cross-product.json` usa as abreviações `response.toolUse` e `response.text` para gerar SSE da Anthropic. O primeiro fixture casa com `E2E_TOOL_CROSS_PRODUCT_<TOOL>` na latest user message; o segunda fixture final genérico casa com `E2E_TOOL_CROSS_PRODUCT` + `toolu_e2e_tool_cross_product` e exclui a continuação de compact/title/goal. Assim não há falso positivo com o texto `tool_result` do prompt de sistema, e cada nome de ferramenta pode ser reutilizado nos três cenários (compact, fork e goal) sem depender do número de `maxMatches`.

## Restrições de limpeza

Todos os efeitos colaterais no sistema de arquivos precisam cair em:

```text
/tmp/zcode-e2e-tool-cross-product
```

O teste cria fixtures antes de cada turn de ferramenta, e tanto `afterEach` quanto `after` executam uma limpeza recursiva. Qualquer nova ferramenta que escreva arquivos ou novo caso de escrita via shell precisa primeiro entrar nesse diretório e depois ter a nota de limpeza correspondente adicionada à matriz.