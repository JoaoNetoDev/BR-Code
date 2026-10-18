# Performance de Hidratação a Frio de Conversas V4

## Resumo da Funcionalidade

| Campo                  | Valor                                                                                                                                                    |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mudança                | Alterar a restauração a frio da primeira `v4/conversation/subscribe` de sessões longas, de transação de projeção completa evento a evento para replay em lote limitado, eliminando clones repetidos, varreduras completas de ações por linha e serialização de snapshot que crescem com o tamanho do histórico |
| Superfícies visíveis ao usuário | Abrir sessões longas já persistidas; tempo de espera até o primeiro snapshot de conversa chegar                                               |
| Documentação existente  | `docs/v4-refactor/02-projection.md`、`docs/v4-refactor/05-transport-and-backpressure.md`、`docs/v4-refactor/07-persistence.md`                         |
| Responsáveis pelo código existente | CLI `V4Gateway`、`ConversationTopicPublisher`、`ProductProjection`                                                                   |
| Fora de escopo         | Otimizações de renderização no renderer, mudanças de wire schema, migração de SQLite, checkpoint de projeção persistente, runtime independente de celular, alteração do perfil de entrega desktop/mobile |

## Registro de Esclarecimentos

| Rodada | Pergunta                                                | Resposta do usuário                             | Fronteira fixada                                                                 | Necessário acompanhamento |
| ----- | ------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------- |
| 1     | Construir 2000 turnos com chamadas de ferramenta e medir o carregamento | O usuário exigiu medição direta                 | O alvo é a abertura a frio com histórico longo, não a vazão comum de streaming      | não                        |
| 2     | O gargalo está no V4 ou na leitura de dados pelo CLI     | O usuário exigiu continuar localizando          | Evidência segmentada entre resume do SQLite/runtime e hidratação da projeção V4     | não                        |
| 3     | Aceitar a complexidade atual O(N) que cresce com o histórico | "Essa complexidade O(N) não é confiável"        | Isto é uma correção de bug de implementação, não aumentar timeout nem reduzir a fidelidade do histórico | não     |
| 4     | Entrar em desenvolvimento via worktree                    | "Se você já tem a solução, tente desenvolver na worktree" | Implementar em uma worktree independente; esta rodada não introduz migration de persistência/schema por padrão | não |

## Decisões de Fronteira

| Fronteira        | Decisão                                                                   | Inclui                                                                          | Exclui / poda                                                                        | Fonte                                                |
| ---------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Semântica quente/frio | Manter `reduce(transcript) ≡ reduce(events)`                            | O transcript continua sendo sintetizado primeiro em eventos canônicos e depois entra no mesmo reducer | Um segundo projetor direto `message/part -> row`                                      | `docs/v4-refactor/07-persistence.md`                 |
| Atomicidade      | Adotar o candidate de uma só vez após sucesso completo                    | Em caso de exceção no reducer, a projection/log/reservation de assinatura antiga são preservadas integralmente | Replay parcial no lugar, sobre o publisher autoritativo                              | contrato atual do publisher                           |
| Portão de payload | O caminho normal em lote deve provar que não é possível ultrapassar 16 MiB; quando não for possível provar, voltar à admissão estrita evento a evento | terminal reserve, skip de evento histórico oversized, terminal subsequente continua sendo reduzido | Aumentar o limite, truncar o snapshot, aceitar silenciosamente projection intransferível | `docs/v4-refactor/05-transport-and-backpressure.md` |
| Perfil de entrega | Otimizar apenas a materialização fria compartilhada do CLI                 | desktop continuous e mobile replayable obtêm a mesma projection final             | Espalhar regras de gap/snapshot replayable para desktop continuous                  | protocolo de conversa                                  |
| Persistência     | Nesta rodada não mudar o schema do banco de dados                        | Reutilizar as leituras existentes de message/part/session_entry                    | checkpoint de projeção, migração de row ordinal, store-backed lazy range             | implementação de escopo autorizada pelo usuário     |
| Portão de performance | Os limiares de performance são porteiras de regressão, não contrato funcional de produto | fixture representativo de 2000 turnos com uso intenso de ferramentas e benchmark sintético focado | E2E pass/fail estrito entre máquinas dependente de relógio de parede                | escopo PERF do catálogo                               |

## Escopo de Domínio

| Domínio                            | Inclui? | Por que pode mudar comportamento                                              | Fontes primárias                       |
| ---------------------------------- | ------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| Comportamento de conversa/sessão    | sim     | cold/live projection, row actions e command target devem ser equivalentes     | declaração de conversa, PV4-09        |
| Persistência/índice/snapshot       | sim     | O transcript é a autoridade do body completed; a cold subscription precisa ler e sintetizar os eventos | `docs/v4-refactor/07-persistence.md` |
| Renderização/performance           | sim     | A CPU do CLI fica saturada antes do primeiro frame; o renderer ainda não recebeu o body | medição de runtime de 2000 turnos     |
| Remoto mobile/replayable           | apenas fronteira | Compartilha a mesma projection do CLI, mas a semântica de recuperação da entrega deve ficar isolada | invariantes de entrega confiável |
| Implementação de UI/render         | não     | O custo desta rodada ocorre antes da geração do frame inicial                 | trace de runtime                       |

## Mapa Conceitual

```text
persisted message / part / session_entry
                |
                v
loadPersistedConversationMaterialization
                |
                v
synthesize + merge canonical SessionEvent[]
                |
                v
ConversationTopicPublisher.rehydrate
                |
                +-- candidate ProductProjection (not externally visible)
                |      |
                |      +-- batch reduce through the same normalizer/reducer
                |      +-- materialize row actions once at the end
                |      +-- measure the bounded wire tail in fixed event windows
                |
                +-- success: one atomic adopt + snapshot recovery boundary
                `-- failure/uncertain size: discard or strict fallback
                                |
                                v
              desktop-continuous / web-remote-replayable subscribe
```

| Conceito                      | Por que importa                                                                                                       | Fonte                            |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| publisher candidate            | O estado autoritativo antigo já está isolado na camada externa; o clone evento a evento é uma transação redundante        | `conversation-topic-publisher.ts` |
| Materialização de ações       | Hoje cada evento varre todas as rows, e o ramo de assistant contém `find/some` aninhados                                   | `product-projection.ts`          |
| Aplicação de delta imutável   | Durante o replay, cada append/upsert copia o array de rows em crescimento                                                  | `apply.ts` compartilhado          |
| Cauda de wire                 | O snapshot inicial envia apenas as últimas 60 rows; o histórico completo continua sendo preservado pelo CLI para range/targets | limites de protocolo / docs de projeção |
| Fronteira de recuperação       | O batch adia a derivação de ações; após o rehydrate o base intermediário antigo precisa de snapshot, e novos eventos após a marca atual ainda podem retomar | contrato de retenção do publisher |

## Donos do Estado

| Estado / fato                          | Autoridade                                | Espelhos / caches                         | Evidência                                                     |
| -------------------------------------- | ----------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| Fatos persistidos da conversa          | session store do CLI                      | histórico de mensagens do runtime         | contagens de DB, log de cold resume                           |
| Projeção canônica da conversa         | CLI `ProductProjection`                   | snapshot/log do publisher, store do renderer | golden strict-vs-batch                                      |
| Propriedade/perfil de assinatura        | publisher do CLI + conexão confiável do host | store do renderer/mobile                | testes existentes de publisher/gateway                        |
| Limite de payload                      | limites V4 compartilhados + admissão do CLI | assembler de wire                       | medição de bytes lógicos e testes de fallback oversized       |

## Dimensões

| Dimensão            | Valores / classes de equivalência                        | Inclui?               | Justificativa                                                                    |
| ------------------- | -------------------------------------------------------- | --------------------- | -------------------------------------------------------------------------------- |
| fonte de persistência | transcript durável, publisher live saudável existente  | sim                   | Só o transcript durável precisa de cold replay em lote; um publisher live saudável já é pulado pelo guard |
| tamanho do histórico | pequeno, 2000 turnos com uso intenso de ferramentas, proporção de crescimento | sim          | Valida simultaneamente a semântica e a tendência de complexidade                  |
| payload da projeção | com limite seguro, incerto/acima do limite              | sim                   | Determina o fast path ou o strict fallback                                        |
| resultado do replay  | sucesso, erro comum do reducer, evento payload grande demais | sim             | Atomicidade e fail-closed                                                        |
| perfil de entrega    | continuous, replayable                                    | apenas representativo | A projeção final é a mesma; o perfil só afeta filtragem/recuperação, sem repetir todas as permutações |
| tipo de workspace    | local, SSH/WSL/Docker                                    | podado                 | O algoritmo de hidratação só consome fatos de sessão e não executa operações de caminho; a identidade do workspace não muda |
| forma das ferramentas | text/reasoning + ferramentas terminal/pending/error misturadas | sim             | O fixture com uso intenso de ferramentas é o principal objeto de reprodução     |

## Combinações Candidatas

| ID do Candidato | Estado                                                       | Evento                                | Guard/efeito esperado                                                        | Status                   | Observações                                |
| --------------- | ------------------------------------------------------------ | ------------------------------------- | ----------------------------------------------------------------------------- | ------------------------ | ------------------------------------------ |
| V4HYD-01        | transcript durável completed, projection com limite seguro  | primeira assinatura                   | replay em lote, mesmo reducer, uma única adoção final                       | aceito                   | Principal correção de performance           |
| V4HYD-02        | mesmos fatos                                                 | strict replay vs batch replay         | snapshot, row actions, command target, seq/revision idênticos                | aceito                   | golden semântico                           |
| V4HYD-03        | o histórico pode ultrapassar 16 MiB                          | primeira assinatura                   | a prova rápida não se sustenta; volta à admissão estrita de payload por evento | aceito                | Preserva skip de evento ruim + terminal posterior |
| V4HYD-04        | o reducer candidate lança um erro comum                     | primeira assinatura                   | lança o erro e a projection/log/subscription reservation antigas ficam intactas | aceito               | Regressão existente estendida ao caminho em lote |
| V4HYD-05        | publisher live saudável                                     | assinar                               | reutiliza o publisher live, sem cold replay                                  | podado                   | Guard existente do gateway                  |
| V4HYD-06        | desktop vs mobile com os mesmos fatos                       | assinar/recuperar                     | compartilham o mesmo estado final; mantêm entrega continuous/replayable respectivamente | podado para representativo | Invariantes de protocolo já têm cobertura dedicada |
| V4HYD-07        | persistir checkpoint de projeção/lazy rows                  | cold subscribe                        | desacopla totalmente o custo da primeira tela do histórico total              | ignorado                 | Fase de arquitetura posterior, exige migration |
| V4HYD-08        | cliente mantém base intermediário do mesmo epoch pré-rehydrate | assinar após rehydrate               | passa pela fronteira de recuperação por snapshot; eventos novos após o seq atual ainda retomam | aceito             | O delta de ações não é aberto para bases antigas |

## Decisões de Poda

| ID da Decisão | Combinações podadas                                | Guard/invariante                  | Razão de produto                                 | Cobertura representativa                            |
| ------------- | -------------------------------------------------- | --------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| V4HYD-P1      | perfil de cliente × forma de histórico/ferramentas, todas as permutações | canonical projection compartilhada | O perfil não altera o estado final do reducer      | golden strict-vs-batch + testes de perfil existentes |
| V4HYD-P2      | tipo de workspace × hidratação                       | sem execução de caminho            | Fatos de sessão isolados do transporte de workspace | bootstrap unit representative                         |
| V4HYD-P3      | casos de CPU/render do renderer                     | frame inicial não emitido          | A causa raiz desta rodada está na projeção do CLI  | trace de runtime existente de 2000 turnos            |
| V4HYD-P4      | aumentar o timeout de assinatura                    | invariante de complexidade         | Falha tardia não reduz CPU/RSS                     | ignorado                                                |

## Casos Aceitos

| ID do Caso | Setup                                                                        | Ação                                        | Asserções                                                                                                        | Camadas de evidência                                    | Status E2E             |
| ---------- | ---------------------------------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ---------------------- |
| PERF03-A   | sessão persistente gerada com 2000 turnos, 4000 mensagens e estados de ferramenta misturados | primeira assinatura em processo frio | snapshot inicial chega; a CLI não dá timeout de 180s; cauda de tool/user/assistant visível; tempo e RSS deixam artefato | log da CLI + CPU/RSS do processo + ACK/frame de protocolo + UI/CDP | execução manual de performance |
| PERF03-B   | logs de eventos sintéticos pequenos/médios/grandes                            | replay estrito e em lote                   | snapshot final, target de mensagem, row action, seq/revision idênticos; a taxa de crescimento não é quadrática       | teste unitário/perf focado                              | coberto                 |
| PERF03-C   | histórico normal e histórico muito grande                                   | hydrate em lote                           | histórico normal no fast path; strict fallback quando o limite não é provável; comportamento de 16 MiB igual ao da implementação antiga | teste unitário do publisher                  | coberto                 |
| PERF03-D   | projection/subscription reservation existentes; candidate lança erro no meio | rehydrate                                 | projection/log/reservation antigas não são modificadas                                                          | teste unitário do publisher                              | coberto/estendido       |
| PERF03-E   | cauda ativa de compactação do provider com 939 messages / 3523 parts; ramo ativo da UI com pelo menos 10621 messages; mais 1805 checkpoints de workspace | primeiro rehydrate + subscribe após o cold merge | validar simultaneamente a cauda do provider e a escala do ramo ativo completo da UI; snapshot inicial completo chega; registrar tempos segmentados e a estrutura do primeiro frame | spec perf opt-in da CLI + fixture de produção | corrigido; produção verificada |
| PERF03-H   | fixture de produção do PERF03-E                                             | ativação fria V4 → frame inicial          | no caminho normal as mensagens do pai são lidas por completo apenas uma vez; assinaturas concorrentes compartilham a mesma materialização de operação; o caminho de correção de compactação atualiza uma vez | testes focados de bootstrap/core + A/B de produção | corrigido; produção verificada |

## Backfill de Matriz

| Arquivo                                                        | Mudança                                                                 |
| -------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `docs/conversation-session-case-catalog.md`                   | Adicionar o caso de performance de hidratação fria PERF03               |
| `docs/testing/conversation-session-e2e-coverage-matrix.md`    | Registrar benchmark focado + fixture manual de 2000 turnos, evitando se passar por E2E GUI oficial |

## Contrato de Implementação

1. O transcript continua sendo sintetizado em `SessionEvent[]`; não é permitido criar um row reducer cold-only.
2. `rehydrate` faz primeiro um replay em lote sobre um candidate invisível; ao final, faz uma única convergência de ações sobre todas as rows.
3. O fast path mede com precisão a cauda de wire de 60 linhas fixada pelo protocolo, em janelas fixas de eventos; dentro da janela só acumula deltas que ainda estão na cauda e reserva o limite superior completo de schema para as ações adiadas; linhas históricas que saem da cauda deixam de ser acumuladas. Quando o limite superior não se sustenta, parte de um candidate limpo pelo caminho estrito existente.
4. Erro comum do reducer não faz fallback nem engole o erro; o publisher antigo permanece como está.
5. O snapshot final, os command targets de linha e a sequência/revisão de batch e strict devem ser comparados campo a campo por um golden test.
6. Como o batch adia a derivação de ações, um snapshot recovery boundary é estabelecido após um rehydrate bem-sucedido; o base intermediário antigo não continua o log de batch, e o delta live após o seq atual continua retomando normalmente.
7. Detalhes de produção de alta frequência por evento não geram novos logs `info`; se for necessário registrar a duração das fases, ela deve ser agregada em um único evento do ciclo de vida da hidratação.

## Aceitação de Performance

- Registrar wall time com amostras representativas de 500/1000/2000 turnos; o objetivo é que o custo por turno tenda à estabilidade, com a razão 2000/1000 significativamente abaixo de 4.
- O mesmo fixture de 2000 turnos não dispara mais o timeout de 180 segundos de `v4/conversation/subscribe`.
- Números de performance registram ambiente e artefatos e não são escritos como SLAs de produto entre máquinas.
- Yield em blocos ou um scheduler de hidratação só podem servir como proteção de responsividade/concorência, não substituir a eliminação do trabalho repetido.

### Contrato de Reprodução da Forma do Ticket PERF03-E (2026-08-11)

Este caso inicialmente fixava apenas a reprodução; após a correção, continua sendo um caso de equivalência e observação de performance. Ele tem como alvo o intervalo de CPU do CLI no ticket
`ZCT-2087119663734751232`, entre a conclusão de `hydrate_three_source_merge` e o retorno de `v4/conversation/subscribe`;
o preenchimento automático de histórico pelo renderer, a query de resumo de arquivos e as requisições ao provider não entram na medição central do caso focado.

```text
SQLite full active branch (>= 10621 messages)
              |
              +-- runtime/provider history applies latest compact boundary
              |      -> 939 messages / 3523 parts
              |
              +-- UI cold projection retains the full active branch
                     +-- timeline + rows/range history
                     +-- checkpoint_created x 1805
                              |
                              v
                     three-source merge
                              |
                              v
             ConversationTopicPublisher.rehydrate
                              |
                              v
                     initial snapshot frame
```

Dados de reprodução e requisitos de observação:

1. O `session.resumed.messageCount=939 / partCount=3523` do ticket é a cauda provider-active após a compactação, não o total do SQLite. Em seguida, o log de rewind da mesma sessão registra `keptMessageCount=10621`, provando que o ramo efetivo antes da compactação tinha pelo menos 10621 messages. A reprodução deve fixar as duas ordens de grandeza simultaneamente e não pode tratar 939 como o transcript completo.
2. O fixture usa um compact boundary ativo real, de modo que o `activeSessionMessages()` do provider/runtime obtenha exatamente 939 messages / 3523 parts; a entrada da projeção fria mantém o ramo efetivo completo acima de 10621, para restaurar a timeline da UI e o histórico `rows/range`. Esta é a semântica em camadas da produção: `loadPersistedConversationMaterialization()` trata rewind/branch cut via `selectActiveConversationBranch()`, mas não usa indevidamente a cauda compactada do provider como fronteira histórica da projeção da UI.
3. Os 1805 checkpoints são distribuídos em mensagens de usuário do histórico, mas não introduzem ciclo de vida de subagent; essa dimensão preserva a forma do event-store do ticket e não mistura child query na medição central.
4. A spec opt-in da CLI executa em sequência `mergeColdConversationEvents`, `ConversationTopicPublisher.rehydrate` e a primeira `subscribe`, e sai com as contagens full/active de messages e parts, os tempos merge/rehydrate/subscribe/total, as contagens de event/row e os bytes/hash do initial frame; não usa relógio de parede absoluto como asserção entre máquinas.
5. O app-server de produção do build de produção é usado apenas como evidência de ponta a ponta; as ferramentas de teste e de fixture ficam no escopo de test/skill e não entram no caminho de inicialização da produção.

Poda de combinações de estado: cobre-se apenas a primeira cold subscribe local `desktop-continuous` como caso representativo; a equivalência final do mobile `web-remote-replayable` reaproveita a cobertura existente de PERF03-B/PV4. A paginação de histórico completo da UI, o workspace remoto, a continuação do provider e o conteúdo real dos arquivos de artefato não pertencem a esta reprodução de projeção.

Fronteira da correção: apenas dentro do acumulador de hidratação fria, onde `tryBatchHydration()` já está habilitado, o derivado de subagent passa a ser invalidado conforme o delta produzido pelo reducer. Somente a criação, atualização, mudança por streaming e remoção de qualquer sufixo em subagent row, além de mudanças em `pendingInteractions` e `backgroundWorks`, reexecutam `materializeSubagentProjection()`; os demais eventos continuam fazendo normalize/reduce normalmente e avançando `snapshot.seq`, mas sem varrer todas as conversation rows. O `ingest()` live, o strict fallback após falha na prova de payload, o cold merge, o EventStore, o consumo de resumos de arquivos de checkpoint/rewind e o seed de subagent verificado no store após a hidratação permanecem intactos. Os bytes/hash do initial frame, as contagens de event/row, o seq final e os estados finais nos dois perfis de entrega devem ser equivalentes antes e depois da otimização.

O `TurnComplete` do mesmo caso ainda precisa fixar a capacidade de fork da última mensagem de assistant. Essa busca só pode percorrer o array original em ordem inversa após o header do product turn atual, parando na primeira ocorrência; é proibido copiar e inverter a janela inteira de rows a cada turno. Se o histórico antigo não tiver turn header, a busca parte do início da janela. Essa otimização substitui apenas o algoritmo de busca, não adiciona índices mutáveis e não altera a semântica de cold/live, rewind, clone ou stable-fork.

O `TurnComplete` ainda precisa manter o fechamento de contingência para foreground tool sem terminal event, mas sem varrer todas as rows a cada turno. A projeção mantém um índice derivado `openForegroundToolCallIds`: a tool row é adicionada quando está em `inputStreaming`, `pendingApproval`, `running` e não é background, e removida ao entrar em qualquer estado terminal ou em background; `row.removed` limpa de forma sincronizada os itens rewindados. O índice é derivado apenas dos deltas de tool row já materializados, o estado autoritativo continua sendo o snapshot; antes de fechar, é obrigatório revalidar com a row atual. clone/adopt, atomic reject, cold batch e strict replay devem manter o isolamento do índice e a equivalência do snapshot final, e um upsert tardio que cause closed → open precisa readicionar a entrada.

A prova de payload de wire do mesmo cold batch deixa de serializar com precisão de forma incondicional em janelas fixas de 32 eventos. Eventos sem delta apenas avançam `snapshot.seq` e devem manter um limite superior de crescimento seguro para esse campo usando a variação do número de dígitos; não se deve construir o conjunto de rowIds do wire tail nem serializar delta vazio. `state.updated` e `row.appended` podem entrar diretamente no crescimento conservador; somente `row.upserted` e `row.delta` precisam construir preguiçosamente o conjunto de rowIds do tail para decidir se afetam a janela de wire de 60 rows. `row.removed` pode trazer linhas antigas para o tail e exige remedição imediata e precisa; o evento final precisa de remedição precisa após a convergência das ações; os demais eventos só são remedidos com precisão quando o limite superior conservador toca o limite de payload terminal/não-terminal atual, e só se volta à admissão estrita quando, mesmo após a remedição, a reserva segura junto com as ações não convergidas ainda não prova que é transferível. Essa otimização só pode reduzir o custo da prova e não pode alterar o fail-closed de 16 MiB, o terminal reserve, o fato de continuar até o estado final após pular um único evento histórico oversized, os bytes/hash do initial frame nem o snapshot final de cold/live.

O crescimento de delta cold-only acima ainda precisa ser medido com precisão em bytes JSON UTF-8 reais, mas não é necessário criar um `Uint8Array` temporário para isso: o bootstrap da CLI pode usar o Node `Buffer.byteLength(json, "utf8")` sobre o mesmo resultado de `JSON.stringify`. Essa substituição é limitada à contagem de crescimento de `tryBatchHydration()`; o encoder compartilhado/browser, o delta live, a medição precisa do snapshot, o limite de 16 MiB e a decisão de terminal reserve mantêm a implementação original. Os testes devem cobrir valor a valor ASCII, chinês, emoji, aspas/barras invertidas, caracteres de controle e `undefined` de nível superior, e provar que os resultados antigo e novo são iguais; 1 byte antes e depois do limite de payload, o strict fallback após exceed temporário e a estrutura final do frame continuam cobertos pelos testes de fronteira do publisher.

O derivado de subagent precisa ver o estado prospectivo "snapshot atual após aplicar o delta deste evento", mas não pode copiar o array completo de rows a cada materialização. O materializer compartilhado entre cold e live deve percorrer as rows atuais diretamente e construir um overlay local apenas para os `row.appended`, `row.upserted`, `row.delta` e `row.removed` envolvidos neste evento; `pendingInteractions` e `backgroundWorks` leem a última substituição de valor de `state.updated` do mesmo batch. Essa otimização elimina apenas a cópia do array, preservando a varredura de tabela completa existente, o latest-row-wins, o filtro de child fantasma, as prioridades waiting/blocked, a revisão e a ordem dos deltas. strict replay e cold batch devem ser deep-equal evento a evento e no snapshot final sob combinações de spawn/message/stop, waiting, blocked, rewind, child duplicado e child fantasma; se a própria varredura continuar sendo um ponto quente, então profiling independente decide se vale introduzir um índice.

Após remover a cópia do array prospectivo, o mesmo fixture de produção ainda dispara 2180 materializações, com mediana de 255.7ms nas varreduras de tabela restantes — acima do limiar de otimização de 50ms. O próximo passo é reutilizar apenas o `subagentRowIdByAgentId` e o `rowIndexById` existentes: deduplicar os rowIds de subagent atuais, restaurar a ordem original da timeline pelo índice de row atual e então sobrepor as novas rows appends deste evento; não se deve criar um segundo conjunto autoritativo de índices de row/child. Depois que `row.removed` for aplicado, os mapeamentos stale de agentes cuja row alvo já não existe devem ser removidos de uma só vez, com o snapshot atual como autoridade; eventos comuns não devem percorrer `subagentRowIdByAgentId` por causa disso. Alias sintéticos/reais de agentes devem ser deduplicados por rowId, e `row.upserted` que converte uma row não-subagent em subagent ainda precisa entrar neste overlay local. Os testes de performance devem provar que rows de conversa comuns não entram mais no cálculo prospectivo de subagent e que rewind repetido não faz o número de aliases crescer continuamente com o histórico removido.

## Resultados Medidos

### 2026-08-14 exact byte length + indexed subagent overlay

Ambiente: Apple M4, Node 24.14.0. Mantendo primeiro o bundle de produção pré-modificação, usando um banco de dados de backup somente leitura e o mesmo fixture `sess_perf_large_20260811150224_4929c823`; cada grupo faz um aquecimento prévio e então inicia 5 processos `app-server --stdio` novos. Em seguida, força-se a reconstrução das 15/15 tarefas de produção da CLI e roda-se exatamente o mesmo runner.

| Fronteira de produção                | Amostras / mediana antes da mudança | Amostras / mediana finais | Variação da mediana |
| ----------------------------------- | ----------------------------------- | ------------------------- | ------------------: |
| process → provider-registry ready     | 464.6 / 442.7 / 442.7 / 438.2 / 473.3 / **442.7ms** | 441.6 / 453.4 / 445.2 / 442.0 / 457.4 / **445.2ms** | +2.5ms; ruído de startup |
| ready → complete initial frame        | 1889.7 / 1950.2 / 1922.2 / 1927.9 / 1879.8 / **1922.2ms** | 1443.6 / 1497.7 / 1418.7 / 1463.2 / 1455.7 / **1455.7ms** | **-466.5ms (-24.3%)** |
| process → complete initial frame      | 2354.2 / 2392.9 / 2364.9 / 2366.0 / 2353.1 / **2364.9ms** | 1885.2 / 1951.1 / 1863.9 / 1905.1 / 1913.0 / **1905.1ms** | **-459.8ms (-19.4%)** |

Apenas alternando para o `Buffer.byteLength` exato e para o overlay prospectivo sem cópia, a mediana de `ready → frame` caiu primeiro para 1662.5ms (-259.7ms); depois que o perfil comprovou que a varredura de tabela completa ainda era o ponto quente, reutilizando o índice subagent/row existente, caiu mais 206.8ms. Os 10 amostras formais antes e depois mantiveram initial frame de 157745 bytes, snapshot de 157547 bytes, 29950 total rows, janela de wire de 60 rows e `seq=74164`; após remover o `logEpoch` aleatório por processo, o SHA-256 do snapshot foi sempre `5c8290e8489b2951be8cfc2fc03556f806a691200f4f3697ab5a0663b4b1e11d`.

A divisão de pontos quentes do mesmo replay de 74164 eventos, via instrumentação temporária em produção, ficou como abaixo; os números incluem o custo da instrumentação e servem apenas para direção na mesma máquina:

| Implementação                          | subagent materialization (2180 vezes) | contagem exata de bytes do wire-delta (72357 vezes) | publisher rehydrate |
| -------------------------------------- | -------------------------------------: | ---------------------------------------------: | -------------------: |
| Registrado antes da mudança            | 324.1ms                                | 354.5ms                                        | 1014.0ms             |
| Buffer exato + overlay sem cópia       | 255.7ms                                | 226.4ms                                        | 781.3ms             |
| Mais enumeração de subagent indexada    | **68.2ms**                             | **225.3ms**                                    | **589.5ms**         |

A camada de índice já eliminou a varredura das rows de conversa comuns; os ~68ms restantes são o cálculo completo do derivado de subagent, e não se adiciona mais cache para ficar abaixo do antigo limiar de 50ms de "varredura de tabela completa". A contagem de bytes continua precisa e ainda é o ponto quente atual de ~225ms; nesta rodada ela não passa a contagem aproximada e o 16 MiB/terminal reserve/strict fallback não muda.

O fixture focado PERF03-E sem rows de subagent valida a slice de contagem de bytes separadamente: antes da mudança o rehydrate foi 264.5 / 264.8 / 266.3 / 266.9 / 269.4ms, mediana 266.3ms; depois foi 235.0 / 251.3 / 240.0 / 239.8 / 238.1ms, mediana 239.8ms (-26.5ms, -10.0%). Nos dois grupos o initial frame foi de 25016 bytes, com 30500 rows, e o hash foi
`2ff4f3816dc88f2f050f1ec52c1772fa137f35192f3bd5ec6a55c42afdf8c881`.

Depois do patch de limpeza de alias stale de rewind, o mesmo fixture focado sem rewind foi medido novamente em 235.6 / 233.8 / 237.7 / 235.8 / 236.0ms, mediana 235.8ms; os bytes/hash do initial frame são os mesmos. Essa limpeza está diretamente presa ao ramo `row.removed` existente e eventos comuns não recebem nova travessia de aliases; os testes estruturais também fixam um trecho de replay de 16 eventos que limpa apenas uma vez em cada um dos dois rewinds e, após remoções repetidas, mantém apenas os aliases que ainda apontam para a row atual do snapshot.

Exceto pelo PERF03-E indicado abaixo, os resultados históricos têm ambiente Apple M2 Pro, 10 CPU lógicos, 16 GiB de RAM, Electron 41.0.3; o renderer usa o dev server do Vite e a CLI usa `ZCODE_ENV=production`. Os números abaixo são evidência de diagnóstico local, não SLA entre máquinas.

### PERF03-H Materialização única de restauração fria (2026-08-12; reverificado em 2026-08-13)

Os dados de leitura única vêm de um diagnóstico pontual com um backup local somente leitura do banco de dados; esse probe não permanece no repositório de produção ou de teste e não serve como portão de CI portátil.

Primeiro, um spy de integração fixou o fato das chamadas: com o fake app sem executar leituras reais de runtime, uma cold subscribe V4 chama `messages()` da sessão pai **4 vezes**; o runtime real lê mais 1 vez, totalizando **5 vezes** no caminho normal de produção. Em seguida, após um aquecimento no backup somente leitura do mesmo banco de dados, as 5 amostras de leitura única foram 293.9 / 385.1 / 400.3 / 441.5 / 349.8ms, mediana **385.1ms**. Derivando pelo mesmo custo de leitura única, 5 materializações completas correspondem a cerca de 1925.7ms, das quais cerca de 1540.6ms são 4 leituras repetidas; esse número serve apenas para explicar o limite superior e não deve ser somado item a item ao relógio de parede de ponta a ponta.

A implementação passa apenas as messages/parts da primeira leitura dentro da operação de cold-resume atual; settings, resume do runtime, transcript do V4, manifesto de subagents do pai e seed de uso tardio reutilizam o mesmo array. Não foi adicionado cache de sessão, TTL, schema nem API de store. Se o resume do runtime corrigir a timeline compactada `started/retrying`, a lista é atualizada uma vez e então entregue ao V4; apenas o caminho de correção de compactação interrompida permite atualizar até uma segunda leitura.

Com o mesmo fixture de produção, Node 24.14.0 e cache de arquivos aquecido, iniciando um `app-server --stdio` novo a cada execução, os 5 resultados são:

| Implementação                                                | 5 subscribe → initial frame                     | Mediana | Variação                       |
| ----------------------------------------------------------- | ------------------------------------------------ | ------: | ------------------------------ |
| Antes da otimização: materialização completa das mensagens do pai 5 vezes | 4131.1 / 4121.8 / 3849.3 / 3818.9 / 3991.9ms    | **3991.9ms** | -                     |
| Depois da otimização: materialização única por operação no caminho normal | 2874.4 / 2714.3 / 2517.5 / 2681.6 / 2531.7ms     | **2681.6ms** | **-1310.3ms (-32.8%, ~1.49x)** |

Os 10 resultados no total mantêm frame físico de 158038 bytes, 29950 total rows, janela de wire de 60 rows, `toSeq=74164`, 0 subagents em execução e stderr vazio. O `logEpoch/subscriptionId` aleatório dentro do frame faz o SHA-256 do frame inteiro diferir por processo, então a equivalência estrutural é validada em conjunto pelos campos estáveis acima e pelo teste de deep-equal do snapshot de cold-resume focado; o hash do envelope aleatório não é usado como portão de regressão.

O bundle final de produção teve mais uma verificação com 5 processos novos após aquecimento, com amostras de 2162.3 / 2019.0 / 1887.3 / 1980.7 / 2020.9ms, mediana **2019.0ms**; a estrutura do primeiro frame continua idêntica. Como este conjunto não está no mesmo estado de cache que a linha de base pré-otimização, ele serve apenas como smoke do build final e não substitui a conclusão de ganho do A/B nas mesmas condições da tabela acima.

Em 2026-08-13, usando o código-fonte mais recente do workspace e o Node 24.14.0 declarado no repositório, foi executado um rebuild de produção forçado de todo o grafo de dependências da CLI (15/15 build tasks com sucesso, 0 cache hit) e o mesmo fixture PERF03-E foi verificado novamente. O banco de dados recebeu antes um backup somente leitura, e cada amostra criou uma cópia independente a partir desse backup; foi feito um aquecimento e então 5 processos `app-server --stdio` novos foram iniciados. O fixture permanece em 10622 messages / 35811 parts / 1805 checkpoints.

Para se alinhar estritamente ao A/B histórico de 3991.9ms / 2681.6ms, mantém-se a ordem de requisições do runner da época: após o start do processo, escreve-se consecutivamente o provider registry e a subscribe, contando da escrita da subscribe até o initial frame completo. As 5 amostras são 2615.2 / 2612.1 / 2663.0 / 2649.4 / 3637.6ms, mediana **2649.4ms**. Isso é 32.2ms (-1.2%) abaixo da mediana pós-correção de 2681.6ms em 2026-08-12, confirmando a estabilidade de magnitude pós-otimização; 3991.9ms continua sendo o baseline histórico pré-correção, e como a implementação antiga não foi reconstruída nesta rodada, os dois não podem ser escritos como um novo A/B da mesma rodada. Se usado apenas como referência histórica, 3991.9ms → 2649.4ms corresponde a -1342.5ms (-33.6%).

Adicionalmente, seguindo a ordem real de preflight da produção atual — esperar o ACK do provider registry e só então assinar — mediu-se:

| Fronteira de produção                | 5 amostras (ms)                                  | Mediana       |
| ----------------------------------- | ------------------------------------------------ | ------------: |
| process → provider-registry ready   | 450.4 / 538.9 / 442.5 / 441.4 / 453.0           | **450.4ms**   |
| ready → complete initial frame      | 2006.4 / 2063.9 / 1785.4 / 1781.1 / 1775.3       | **1785.4ms**  |
| process → complete initial frame    | 2456.8 / 2602.8 / 2227.9 / 2222.6 / 2228.3       | **2228.3ms**  |

Ambas as leituras mantêm 29950 total rows, janela de wire de 60 rows, `toSeq=74164`, 0 subagents em execução e stderr vazio. A notificação física NDJSON completa mais recente tem 158037 bytes, enquanto o registro histórico do A/B tem 158038 bytes; o artefato físico antigo não foi preservado, então não é possível localizar essa diferença de um byte e, por isso, esta rodada apenas confirma a equivalência estrutural estável acima, sem alegar igualdade byte a byte entre processos novos e sem usar hash de envelope aleatório/dinâmico como portão de regressão.

### PERF03-E compact full-history reproduction

Medido em 2026-08-11 em Apple M4, 10 CPU lógicos, 16 GiB de RAM, macOS 15.3.1. A spec focada `compacted-full-history-cold-hydration.perf.test.ts` inicia um processo Vitest independente por execução, com 5 resultados:

| Métrica                 | Amostras (ms)                                | Mediana  |
| ---------------------- | -------------------------------------------- | -------: |
| cold merge             | 119.8 / 135.1 / 130.5 / 120.3 / 121.6         | 121.6 ms |
| publisher rehydrate    | 10067.3 / 12876.1 / 10061.3 / 9997.1 / 10392.3 | 10067.3 ms |
| merge → initial frame  | 10189.4 / 13013.9 / 10195.5 / 10119.8 / 10516.2 | 10195.5 ms |

O caso focado fixa 10623 persisted messages / 35811 parts, 939 active messages / 3523 parts, 1805 checkpoints, 77372 merged events e 30500 rows; os cinco initial frames têm 25016 bytes e o hash é sempre `2ff4f3816dc88f2f050f1ec52c1772fa137f35192f3bd5ec6a55c42afdf8c881`.

Em 2026-08-11, imediatamente antes da correção, uma nova execução independente de 5 vezes deu merge → initial frame de 10.28～13.63s, mediana 10.92s; nela, a mediana do rehydrate foi 10.79s. Somente após o dirty-check das entradas derivadas de subagent na cold batch hydration, o código final foi executado em 2026-08-12 com 5 processos Vitest independentes por rodada:

| Métrica                 | Amostras (ms)                                | Mediana  | Em relação à mediana imediatamente pré-correção |
| ---------------------- | -------------------------------------------- | -------: | --------------------------------------------- |
| cold merge             | 117.9 / 135.2 / 119.9 / 119.3 / 120.9         | 119.9 ms | fora do intervalo da correção                 |
| publisher rehydrate    | 756.8 / 775.5 / 767.4 / 767.6 / 762.0         | 767.4 ms | -92.9% (~14.1x)                                |
| merge → initial frame  | 876.9 / 913.0 / 889.5 / 889.2 / 885.2         | 889.2 ms | -91.9% (~12.3x)                                |

As cinco saídas mantêm 77372 merged events, 30500 rows, initial frame de 25016 bytes e o mesmo hash; isso mostra que o ganho vem de pular a materialização de todas as rows de subagent para eventos irrelevantes, e não de podar eventos, linhas ou o snapshot de wire.

Em seguida, trocando apenas `markStableForkAssistant()` de "copiar e inverter as rows completas" por "array original em ordem inversa após o header do turn atual, parando na primeira ocorrência", e rodando 5 processos Vitest independentes antes e depois da modificação no mesmo workspace. O shell atual usa Node 25.6.0 e o repositório declara Node 24.14.0, portanto o que segue serve apenas como diagnóstico incremental na mesma máquina:

| Métrica                 | Amostras/mediana antes (ms) | Amostras/mediana depois (ms) | Variação da mediana |
| ---------------------- | ---------------------------- | ---------------------------- | ------------------: |
| publisher rehydrate    | 777.0 / 767.7 / 773.2 / 809.6 / 783.5 / **777.0** | 643.8 / 641.4 / 652.9 / 642.2 / 644.6 / **643.8** | -17.1% (-133.2ms) |
| merge → initial frame  | 902.1 / 889.5 / 895.5 / 926.8 / 902.5 / **902.1** | 809.7 / 770.4 / 774.0 / 786.5 / 762.6 / **774.0** | -14.2% (-128.1ms) |

Ambos os grupos mantêm 77372 events, 30500 rows, initial frame de 25016 bytes e o mesmo SHA-256; esta slice não alterou a varredura de estado terminal de tools nem nenhuma máquina de estados da projeção.

Continuando pela substituição da varredura de todas as rows em `closeOpenToolRows()` por um índice derivado de foreground-aberto mantido por deltas de tool row, e repetindo com 5 processos independentes:

| Métrica                 | Amostras/mediana antes (ms) | Amostras/mediana depois (ms) | Variação da mediana |
| ---------------------- | ---------------------------- | ---------------------------- | ------------------: |
| publisher rehydrate    | 643.8 / 641.4 / 652.9 / 642.2 / 644.6 / **643.8** | 352.6 / 354.6 / 351.8 / 355.5 / 358.0 / **354.6** | -44.9% (-289.2ms) |
| merge → initial frame  | 809.7 / 770.4 / 774.0 / 786.5 / 762.6 / **774.0** | 470.4 / 479.3 / 471.6 / 481.3 / 482.4 / **479.3** | -38.1% (-294.7ms) |

As cinco execuções ainda mantêm 77372 events, 30500 rows, initial frame de 25016 bytes e o mesmo SHA-256; reabertura tardia, rewind, atomic reject/adopt e a equivalência cold batch/strict são cobertos por testes de estado independentes. Em relação ao estado imediatamente antes de todas as correções, com rehydrate em 10.79s e merge → initial frame em 10.92s, as medianas caíram cumulativamente para 354.6ms / 479.3ms, aproximadamente -96.7% (30.4x) e -95.6% (22.8x).

Continuando a remover a medição precisa em janela fixa de 32 eventos da prova de payload do cold batch, e adicionando caminhos sob demanda para no-delta, pertencimento ao tail e estimativa conservadora próxima ao limite, e reexecutando com o Node 24.14.0 declarado no repositório em 5 processos Vitest independentes:

| Métrica                 | Amostras (ms)                                | Mediana    |
| ---------------------- | -------------------------------------------- | ---------: |
| cold merge             | 112.4 / 115.4 / 129.6 / 117.5 / 115.7         | 115.7 ms   |
| publisher rehydrate    | 257.9 / 257.3 / 261.7 / 257.8 / 256.1         | **257.8 ms** |
| merge → initial frame  | 374.8 / 375.0 / 393.7 / 377.6 / 374.1         | **375.0 ms** |

Em relação aos 354.6 / 479.3ms registrados na etapa anterior no Node 25, a mediana cai direcionalmente em 96.8 / 104.3ms; como as versões de Node diferem, essa diferença não é tratada como A/B estrito. As cinco execuções ainda mantêm 77372 events, 30500 rows, initial frame de 25016 bytes e o mesmo SHA-256.

Em 2026-08-12, após um rebuild de produção forçado de todo o grafo de dependências da CLI, o mesmo fixture PERF03-E foi reexecutado em 5 processos independentes Node 24.14.0 / Vitest. O cold merge foi 123.2 / 115.8 / 118.8 / 145.4 / 137.7ms, mediana **123.2ms**; o publisher rehydrate foi 384.5 / 260.6 / 282.5 / 341.4 / 302.3ms, mediana **302.3ms**. Mesmo com o primeiro processo mais frio, o rehydrate foi apenas 384.5ms; portanto os ~0.95s dos diagnósticos anteriores não representam mais o ponto quente atual do rehydrate. As cinco execuções ainda mantêm 77372 events, 30500 rows, initial frame de 25016 bytes e o mesmo SHA-256.

O bundle de produção do mesmo rebuild forçado, usando um banco de dados de backup somente leitura, com um aquecimento e então 5 processos `app-server --stdio` novos; cada execução completa primeiro o preflight do provider registry e então conta `ready → v4/conversation/subscribe → initial frame`. As amostras formais foram 1875.7 / 2992.4 / 1899.5 / 2875.8 / 2043.0ms, mediana **2043.0ms**; a mediana de `process → initial frame` foi **2531.8ms**. Esta rodada teve ruído de agendamento evidente na máquina, então a tabela abaixo mantém as cinco amostras e a mediana; cada linha é uma fronteira de log/protocolo e não deve ser somada diretamente em uma timeline única fictícia:

| Estágio de produção                                       | 5 amostras (ms)                                   | Mediana  | Observação                                                        |
| --------------------------------------------------------- | ------------------------------------------------- | -------: | ----------------------------------------------------------------- |
| process → provider-registry ready                          | 455.7 / 427.8 / 463.4 / 454.4 / 488.7             | **455.7** | processo novo e preflight de protocolo/registry                  |
| subscribe → runtime preferences request                    | 309.6 / 590.9 / 306.3 / 322.1 / 307.9             | **309.6** | a primeira materialização completa de message/part e a dedução de settings ocorrem antes desta requisição |
| runtime preferences response → app startup start           | 2 / 20 / 2 / 2 / 2                               | **2**     | o app é construído imediatamente após a resposta do host         |
| app startup                                                | 116 / 567 / 141 / 125 / 123                       | **125**   | construção de config/plugins/adapters/runtime; uma rodada afetada por jitter de agendamento |
| app completed → user-execution preferences request          | 56 / 107 / 59 / 72 / 58                           | **59**    | entra na fronteira do resume shell após o reconcile de model/settings |
| user-execution preferences response → `session.resumed`   | 187 / 291 / 157 / 178 / 157                       | **178**   | inicializa o contexto e reutiliza a cauda ativa já materializada, restaurando 939 messages / 3523 parts |
| `session.resumed` → three-source merge completed           | 197 / 322 / 181 / 198 / 257                       | **198**   | síntese do transcript/event durável e cold merge; o ponto de log fica após o merge |
| merge completed → subscribe ACK                            | 995.7 / 1088.4 / 1040.3 / 1961.6 / 1125.4         | **1088.4** | intervalo composto: rehydrate, seed de subagent/usage, codificação de snapshot/ACK; não é um rehydrate puro |
| ACK → complete initial frame                               | 13.0 / 15.1 / 13.1 / 17.2 / 13.6                  | **13.6**  | frame NDJSON físico saindo                                       |

Os cinco primeiros frames têm 157746 bytes, 29950 total rows, janela de wire de 60 rows, `toSeq=74164`, 0 subagents em execução; o `logEpoch/subscriptionId` aleatório ainda torna o hash do envelope diferente por processo. Uma amostra única de `messages()` do SQLite em backup somente leitura foi 315.9 / 340.4 / 312.4 / 366.0 / 296.1ms, mediana **315.9ms**, em concordância de magnitude com o intervalo da primeira materialização antes da subscribe. O maior intervalo restante visível na produção atual é o trabalho composto de ~1.09s após o merge, que não pode mais ser rotulado como rehydrate de 0.95s; o rehydrate focado deve ser registrado como **~0.26～0.38s, mediana 0.30s** nesta rodada.

O que segue registra apenas o baseline de produção anterior às três otimizações de projeção desta rodada, não o resultado da implementação atual. O fixture persistente `sess_perf_large_20260811150224_4929c823` tem 10622 messages / 35811 parts, cauda ativa exatamente de 939 messages / 3523 parts e 1805 checkpoints. Com o cache de arquivos do `app-server --stdio` de produção aquecido, iniciando um processo novo por execução, os 5 cold subscribe → initial frame foram 17523.7 / 16875.4 / 17984.8 / 17560.2 / 17101.6 ms, mediana **17523.7 ms**. Cada execução recebeu o snapshot completo de 157745 bytes, 29950 total rows, janela de wire de 60 rows, 0 subagents em execução. O log de runtime também confirma que o resume aplica apenas a cauda ativa 939/3523, enquanto o cold merge ainda mantém 1805 checkpoints; portanto este fixture reproduz de forma estável, no caminho real de SQLite + protocolo de produção, o mesmo travamento de ~20 segundos percebido pelo usuário.

Concluídas as três otimizações de projeção, usando Node 24.14.0 com o mesmo bundle de produção; com o cache de arquivos aquecido, iniciando um `app-server --stdio` novo por execução, os 5 cold subscribe → initial frame foram 5802.0 / 5721.8 / 5449.4 / 5467.4 / 5356.8 ms, mediana **5467.4 ms**. Isso é 12056.3 ms abaixo da mediana pré-correção (-68.8%, ~3.2x). As cinco execuções mantêm snapshot de 157745 bytes, 29950 total rows, janela de wire de 60 rows, 0 subagents em execução e `toSeq=74164`; o resultado de ponta a ponta com fresh process de produção foi verificado. A diferença entre os 479.3 ms focados e os 5467.4 ms de produção ainda inclui ativação do runtime do Agent, leituras reais de SQLite, síntese de transcript/event e inicialização do processo de protocolo, e não é uma asserção de tempo restante para os três pontos quentes de projeção desta rodada.

### Fixture persistido de 2000 turnos

O fixture `sess_perf_large_20260714130421_2dee7a7b` contém 2000 turnos, 4000 messages, 13339 parts, 4000 tool parts e 60 todos. Os artefatos de baseline estão em `packages/desktop/.e2e-artifacts/large-task-2000-turns-20260714/`.

| Marco de implementação                                | `subscribeConversationV4` | Observação                                                                                          |
| ----------------------------------------------------- | -------------------------: | -------------------------------------------------------------------------------------------------- |
| Implementação original                                  |        > 180023.4 ms       | timeout de 180 s; resume/read persistido levou apenas 737 ms, CPU de núcleo único da CLI saturada, o renderer ainda não recebeu o conversation body |
| Apenas removendo a varredura aninhada de ações, prova de payload volta ao caminho estrito | 67913.4 ms | prova que o custo restante principal ainda é o apply/serialização de snapshot imutável por evento |
| Medição precisa por evento da cauda de wire de 60 rows | 12571.5 ms | a serialização do snapshot de histórico completo foi eliminada, mas a frequência de medição ainda é alta demais |
| Janela fixa de 32 eventos medindo a cauda de wire limitada | 1817.2 ms | resume de persistência ~624 ms; o CDP de primeira tela já recebeu o body, com 21 rows virtualizadas no viewport |

Em relação ao limite inferior de 180 s de timeout, o mesmo fixture final é pelo menos ~99x mais rápido; além disso, o estágio de subscribe do V4 não mascara mais o custo de leitura persistida de ~0.6-0.7 s.

### Escala sintética com uso intenso de ferramentas

Cada turno sintetiza 8 eventos: user, assistant text, tool input, tool scheduled, tool result e terminal; primeiro um warm-up, depois 3 execuções cada para obter a mediana.

| Turnos | Eventos | Mediana   | Amostras (ms)          | Razão de crescimento |
| -----: | ------: | --------: | --------------------- | -------------------: |
|   500  |   4001  |  37.4 ms  | 39.5 / 37.4 / 35.8     |                    - |
|  1000  |   8001  |  68.2 ms  | 70.7 / 68.2 / 66.7     |                1.82x |
|  2000  |  16001  | 137.6 ms  | 142.7 / 136.8 / 137.6  |                2.02x |

Ao dobrar turnos/eventos, o tempo praticamente dobra e não mostra mais a tendência de crescimento quadrático original. Os números sintéticos medem apenas `ConversationTopicPublisher.rehydrate` e portanto são menores que os números de ponta a ponta que incluem SQLite, RPC, agendamento do Electron e primeiro frame do renderer.

### 2026-07-24 desaclopamento runtime activation / legacy snapshot

Outro fixture de 1.000 turnos `sess_perf_large_20260724034221_af2e36b8` contém 2.000 messages, 6.671 parts, 2.000 tool parts, 334 reasoning, 200 patches e 60 todos. Cada medição inicia um `app-server` de produção novo; o HEAD anterior à mudança e o código atual foram construídos separadamente, com cache de arquivos aquecido e três execuções cada.

| Implementação                                       | 3 cold subscribe → initial frame | Mediana  | bytes do frame |
| -------------------------------------------------- | -------------------------------- | -------: | -------------: |
| Snapshot legado completo × 2 antes da mudança     | 3352.1 / 3169.5 / 3070.2 ms      | 3169.5 ms |      143,690  |
| Somente activation + projeção estreita de uso      | 2704.8 / 2701.5 / 2607.6 ms      | 2701.5 ms |      143,690  |

A mediana caiu 468.0 ms (14.8%) e os bytes do primeiro frame são idênticos. Este resultado prova apenas o ganho local de remover a projeção legada duplicada; os ~2.7s restantes ainda incluem ativação do runtime do Agent, leitura/síntese do transcript persistente, rehydration da projeção V4 e codificação de wire, e não devem ser atribuídos a um único estágio. Os limites de responsabilidade e os invariantes funcionais estão em
[`17-cold-resume-runtime-activation.md`](../v4-refactor/17-cold-resume-runtime-activation.md).

## Notas de Handoff E2E

- Fixture de provider: não é necessário; use `zcode-large-task-fixture` para construir diretamente uma conversa persistente.
- Fixture de sistema de arquivos: nenhum.
- Estratégia de timing: execução manual de performance separada; o benchmark focado protege apenas a tendência de complexidade, evitando jitter de relógio absoluto no CI.
- Preset Docker: não entra no conjunto de conversas de rotina.
- Riscos de revisão: fallback de payload, fronteira de recuperação de snapshot, equivalência strict-vs-batch de row actions/command target.