# Status de Estágio de Agrupamento de Ferramentas Explore

## Status de Publicação

A funcionalidade está ativada por padrão nas configurações do usuário. A opção "agrupar ferramentas de exploração" em Settings é persistida como `toolGroupingExploreEnabled` no nível do app; quando ausente, `ENABLE_EXPLORE_TOOL_CALL_GROUPING=true` atua como fallback. Quando desativado, Read/Search e Shell somente-leitura mantêm suas linhas de ferramenta independentes originais; a categorização de ferramentas, o ciclo de vida, o protocolo e a persistência de sessão não mudam.

## Resumo da Feature

| Campo                 | Valor                                                                               |
| --------------------- | ----------------------------------------------------------------------------------- |
| Mudança               | O agrupamento pai Explore passa de "agregação de status das sub-ferramentas" para "limites de estágio visíveis + status do work segment atual" |
| Superfícies visíveis ao usuário | desktop `desktop-continuous`, Web comum, `/remote` em celular, renderizador de conversa v4 compartilhado |
| Owner do estado       | A projection V4 mantém as rows originais e o turn header; o renderer apenas deriva o estado de exibição do pai Explore |
| Fora de escopo        | Não altera o status das sub-ferramentas, o status de Execute, o protocolo, o runtime, o snapshot, o replay ou a persistência |

## Problema

Uma ferramenta somente-leitura isolada mantém sua linha de ferramenta original; o agrupamento pai Explore só é criado depois que a segunda ferramenta somente-leitura consecutiva chega. Depois que o agrupamento pai é criado, se todos os children atuais já concluíram e a próxima ferramenta somente-leitura ainda não apareceu, a implementação antiga salta brevemente de "explorando" para "concluído" e depois volta para "explorando". Explore expressa um estágio de investigação do modelo; o nível pai não deve interpretar o intervalo entre sub-ferramentas como o fim do estágio.

```text
Read completed
     |
     +-- work segment still running + no visible boundary --> Explore in_progress
     |
     `-- visible non-Explore boundary / segment terminal ----> Explore completed
```

## Decisões de Limite

| Limite              | Decisão                                                                          | Inclui                                                                          | Exclui / poda                                        |
| ------------------ | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Limiar de agrupamento | Só cria o agrupamento pai com pelo menos duas rows consecutivas compatíveis com Explore; item único mantém a linha original | Combinações consecutivas de Read/Search/Shell somente-leitura                  | Agrupamento pai vazio com apenas um child             |
| Running            | Explore fica no fim do chunk de trabalho visível atual, e esse chunk ainda é o fim de um segment em execução | Intervalo de modelo em que todos os children estão completed | Não exige nenhum child em running                   |
| Completed          | Aparece qualquer row visível não-Explore depois de Explore, ou o segment já está em estado terminal | Execute, Write/Edit, Agent/Todo, assistant text, reasoning visível | Reasoning oculto que não seja o primeiro não constitui limite |
| Ciclo de vida do child | Cada child continua exibindo seu próprio pending/running/success/error/cancelled | Detalhes de falha, aprovação, saída                                          | O status do child não decide mais o running do pai Explore |
| Fallback de stopped | Quando children Explore terminais incluem cancelled, o pai pode exibir stopped | Nenhum segment em execução                                                    | Não adiciona campo de protocolo próprio de turn-stop  |
| Simetria com Execute | Execute usa o mesmo limite de estágio visível para derivar o status pai            | Cauda running, limite visível, segment terminal                               | Categorização e resumo continuam independentes        |

## Fluxo de Estado e Evento

```text
visible assistant work rows
          |
          v
collect consecutive Explore rows
          |
          +-- next visible row is non-Explore ------> completed
          |
          +-- group is chunk tail, but a later flow
          |   item/text ends the visual stage ------> completed
          |
          +-- group is true segment tail
          |   && segment state is running ----------> in_progress
          |
          `-- segment terminal ---------------------> completed/stopped
```

O chamador deve informar explicitamente ao row builder se o chunk atual é a "cauda real de um segment ainda em execução". Passar apenas `segment.workStatus.state === running` não basta, porque o chunk do histórico do assistant pode já ter assistant text, rows seguintes ou outros flow items depois dele.

## Casos Aceitos

| Case ID | Configuração                                                     | Ação                | Asserções                                                                                | Evidência         | Status       |
| ------- | ---------------------------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------- | ----------------- | ------------ |
| ETS01   | Dois Read completed consecutivos no fim real de um segment em execução | Construir work items | O Explore é criado após a chegada do segundo item e o pai permanece in_progress          | UI unit           | covered-unit |
| ETS02   | Execute/Write/outra ferramenta visível depois de Explore         | Construir work items | O Explore anterior fica completed                                                        | UI unit           | covered-unit |
| ETS03   | Assistant text ou reasoning visível depois de Explore            | Construir flow/chunk | Explore completed                                                                         | UI unit           | covered-unit |
| ETS04   | Apenas reasoning oculto não-primeiro entre os children Explore, segment ainda em execução | Desligar reasoning | O Explore ainda agrega e permanece in_progress                                           | UI unit           | covered-unit |
| ETS05   | Child ainda running, mas um limite não-Explore já apareceu depois | Construir work items | O pai Explore fica completed; o próprio child segue running                              | UI unit           | covered-unit |
| ETS06   | Explore no fim de um segment em estado terminal                  | cold/live render    | Pai completed; stopped quando há child cancelled                                         | UI unit           | covered-unit |
| ETS07   | Children Execute running/completed                               | Regressão da mesma mudança | Execute usa os mesmos limites de estágio, e classificação e detalhe continuam independentes | UI unit       | covered-unit |
| ETS08   | desktop/replayable obtêm as mesmas rows e o mesmo fato de segment terminal | Construção do renderer | Mesmo status pai Explore; não altera delivery/recovery                                 | shared invariant  | partial      |
| ETS09   | Row de Shell em execução cujo command ainda não chegou depois de Explore | Preenchimento de command por streaming | Estágio não classificado é totalmente transparente; readonly entra no Explore original; o Explore só termina quando execute aparece | UI unit | covered-unit |

## Decisões de Poda

| Decision ID | Combinações podadas                    | Guarda/invariante                                      | Cobertura representativa       |
| ----------- | -------------------------------------- | ------------------------------------------------------ | ----------------------------- |
| ETS-P01     | Todas as permutações de nomes de ferramenta Shell/Read/Search | O `isExploreToolCall` existente cuida da classificação | Read + readonly Bash representar |
| ETS-P02     | Tipos de theme/locale/OS/workspace     | A derivação de estado não tem texto, tema ou branch de plataforma | focused UI unit         |
| ETS-P03     | Permutações de rede continuous/replayable | Usa rows/turn facts já projetados, sem modificar transport | shared renderer + STIP03 existente |
| ETS-P04     | Todas as permutações de tipo e status de ferramenta Execute | Execute reutiliza a função de limite de estágio; classificação/resumo são verificados à parte | Execute representative unit |

## E2E Handoff

- A primeira versão usa testes focados com row/chunk builder determinístico.
- O E2E oficial pode usar um stream controlado: primeiro concluir Read e Grep consecutivos para estabelecer o Explore, depois atrasar a terceira ferramenta somente-leitura e afirmar que o Explore não aparece como completed dentro do intervalo; em seguida enviar um Bash não-Explore e afirmar que o Explore fecha.
- O gap/snapshot real do celular continua sendo provado pelo case replayable existente, sem substituição por fixture de desktop.