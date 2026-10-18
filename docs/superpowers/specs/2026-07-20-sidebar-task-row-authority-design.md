# Design de convergência de autoridade da linha de task da barra lateral

## Resumo da feature/mudança

| Campo                  | Valor                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Mudança                | todas as listas persistentes de tasks da barra lateral passam a ter o conjunto de linhas decidido por `tasks-index.sqlite`, e `sessions-index` só complementa campos em tempo real da session                                                     |
| Superfícies visíveis ao usuário | Project/workspace, Timeline, Pinned, Archived, Grouped, resultados de busca                                                                                       |
| Docs existentes         | `docs/v4-refactor/14-sessions-index.md`、`docs/superpowers/specs/2026-07-13-v4-sidebar-task-state-authority-design.md`、`docs/ui/task-grouped-view.md` |
| Owners de código existentes  | `taskListMembershipSets.ts`、`buildTaskListResultFromSessions.ts`、`useGlobalTaskList.ts`、`useWorkspaceTaskLists.ts`、`useGroupedTaskView.ts`         |
| Fora de escopo          | autoridade de transcript/rows, conversation command, schema do CLI session store, estado de negócio do relay/main, protocolo de delivery entre clientes                                          |

Esta é uma correção de comportamento da migração da fonte de dados das listas na 3.4.0. Os logs de runtime mostram que, após a atualização para a 3.4.0 e antes da execução do arquivamento automático, o Grouped já apresentava tarefas históricas ausentes; ao voltar para a 3.3.6 tudo voltou. No backup feito antes da atualização do SQLite, as tarefas relevantes e o group membership continuavam completos, o que mostra que a linha de task persistente não pode desaparecer só porque o snapshot atual de `sessions-index` não inclui o summary correspondente.

## Registro de esclarecimentos

| Rodada | Pergunta                           | Resposta do usuário                                                              | Fronteira fixada                                    | Necessário acompanhamento |
| ----- | ---------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- | ---------------- |
| 1     | o problema era apenas o Grouped mostrando no máximo 5 itens | não; falta na versão mais recente, e a 3.3.6 mostra tudo completo                                         | não é cap de UI, é regressão de fonte de dados por versão                   | no               |
| 2     | corrigir apenas o Grouped                   | todas as listas da barra lateral devem usar a mesma lógica, incluindo projetos   | Project/Timeline/Pinned/Archived/Grouped todos incluídos | no               |
| 3     | quem responde pela existência da linha e pelos campos em tempo real       | exige explicitamente que o task index seja a autoridade e que o session index forneça mais dados detalhados               | tasks-index decide a linha persistente; sessions-index só enriquece  | no               |
| 4     | janela curta entre a criação e a gravação no task index   | manter o overlay optimistic/live existente, sem tratar o resumo frio só de session como o conjunto completo de tasks persistentes | linhas temporárias e linhas persistentes em camadas                                | no               |
| 5     | por que uma task nova, já gravada, não entrou no Project               | o usuário confirma que uma conversa nova no workspace atual precisa aparecer na lista "projetos"                      | `task_created` precisa rotacionar o snapshot de linhas do tasks-index        | no               |
| 6     | a linha de task SSH/WSL existe mas o spinner de execução some | corrigir a normalização da leitura do task-index, sem afrouxar o join por caminho remoto e sem ler `running` histórico como fallback | as colunas de localização da linha SQLite são a autoridade; o isolamento por workspace identity é preservado | no               |

O Case ID começa em `TSL23`; `TSL22` já foi reservado pelo trabalho paralelo de single-flight de dados remotos do Grouped.

## Decisões de fronteira

| Fronteira      | Decisão                               | Inclui                                                         | Exclui / poda                          | Origem                                        |
| ------------- | -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------- |
| Existência da linha persistente    | o resultado de list do `tasks-index` é a autoridade positiva      | active, pinned, archived, group member, ordenação                     | não inferir remoção a partir da ausência de snapshot de sessions        | usuário + evidência de runtime                       |
| Visibilidade negativa    | o tombstone `deleted` tem prioridade máxima         | todos os kinds de lista, live/restart/replay                               | não apagar fisicamente o transcript do CLI                      | TSL20                                         |
| Activity em tempo real | cobertura em nível de campo do `sessions-index`            | phase, lastActivityAt, background, pending interaction, título ao vivo | não sobrescrever membership/sort/unread              | spec V4 existente                              |
| Task nova temporária    | overlay optimistic/live pertencente ao renderer | da criação/aceitação do envio até a gravação da linha de task             | resumo frio só de session não pode contornar o task index | contrato existente de promoção grouped/workspace |
| Fronteira de convergência na criação  | `task_created` rotaciona o snapshot da linha de task  | task ativa criada pela janela atual, por outras janelas e pelo shared-host do celular             | não esperar o frame de conteúdo do sessions-index trazer a linha implicitamente     | usuário + invariante de autoridade da linha de task           |
| Busca          | a consulta do tasks-index decide o conjunto de resultados           | searchable_text/snippets; linhas que casam podem somar activity já conhecida              | não tratar o filtro por title das sessions como busca de texto completo | caminho de busca existente                          |
| Multicliente          | mesma semântica de existência de linha                         | local, SSH/WSL/Docker, desktop continuous, web remote replayable | não alterar o delivery de snapshot/gap de cada um           | invariante de arquitetura                        |
| Normalização da leitura do índice | `task_id`, `workspace_path` da linha SQLite e a chave primária `workspace_key` decidem a localização da entidade; uma remote key legítima tem prioridade sobre as colunas de projeção de identity | linhas remotas de histórico com coluna de identity ausente ou com identity antiga remanescente em `meta_json` | não permitir que campos de projeção reescrevam a chave de isolamento; não fazer join por path entre remotos | TSL25 + invariante de workspace identity |

## Escopo de domínio e cross-products de alto risco

| Domínio                     | Inclui?       | Por que pode mudar o comportamento                                   | Fontes primárias                   |
| -------------------------- | -------------- | ------------------------------------------------------------ | --------------------------------- |
| Persistence/index/snapshot | sim            | decide se uma tarefa desaparece quando os dois índices divergem breve ou permanentemente                   | task sqlite, spec do sessions-index  |
| UI rendering/state         | sim            | os cinco tipos de lista compartilham query cache, paginação e optimistic overlay           | hooks/store da UI                    |
| Workspace identity/remote  | sim            | o join precisa usar `workspaceIdentity?.trim() || workspacePath` | arquitetura + invariante de identity |
| Mobile remote/replayable   | representativa | mesma semântica de linha, fronteira de recuperação de entrega inalterada                         | docs de recuperação V4                  |

Combinações de alto risco:

```text
task row present/absent
  × session summary present/absent/stale
  × active/pinned/archived/deleted/grouped
  × local/remote workspace identity
  -> row existence + field owner + sort/order
```

Não se faz o produto cartesiano com provider, Goal, queue, compact, theme ou locale; essas dimensões não alteram o membership de task.

## Mapa de conceitos e owners de estado

```text
CLI session store/runtime
  -> sessions-index summary ----------------------┐
       phase / activity / attention / live title  │
                                                  v
Host tasks-index.sqlite --------------------> TaskListRowState -> Sidebar
  task rows / pin / archive / delete / group      ^
  unread / cron / manual title / explicit order   │
                                                  │
Renderer optimistic task overlay -----------------┘
  only uncommitted create/send placement

create/send accepted -> optimistic row -> tasks-index commit -> task_created
                                                       |
                                                       v
                                      invalidate task-row snapshot -> Project row
```

| Estado/fato                           | Autoridade                                          | Espelhos/caches              | Evidência                             |
| ------------------------------------ | -------------------------------------------------- | --------------------------- | ------------------------------------ |
| Linha de task persistente e isolamento por workspace        | tasks-index                                        | cache de consulta de task            | SQLite/list RPC/contagem da UI             |
| pinned/archived/deleted/group/unread | tasks-index                                        | snapshot/overlay de membership | SQLite + evento de workspace             |
| phase/lastActivity/attention         | sessions-index                                     | sidecar de entidade da consulta        | snapshot/delta V4 + ícone/ordem na UI    |
| transcript/session config            | projection/store de conversa do CLI                  | projection do painel ativo      | snapshot de conversa                |
| Task nova ainda não gravada                       | optimistic overlay do renderer, depois o tasks-index assume | store local                 | ACK de create/send + evento task-created |

## Dimensões e combinações candidatas

| Candidate ID | linha do tasks-index       | summary de sessions                | membership      | Efeito esperado                                            | Status          |
| ------------ | --------------------- | ------------------------------- | --------------- | ---------------------------------------------------------- | --------------- |
| TSL23-A      | presente               | ausente                          | active/grouped  | mantém a linha estática; sem spinner/attention; a ordem explícita de grupo não muda    | accepted        |
| TSL23-B      | presente               | presente                         | qualquer um não deleted  | a linha vem do task index, e activity/title são enriquecidos conforme o owner de cada campo    | accepted        |
| TSL23-C      | presente               | stale                           | deleted         | o tombstone exclui, sem ressuscitar por causa do summary                          | pruned by TSL20 |
| TSL24-A      | ausente                | completed armazenado                | nenhum            | não transforma um resumo frio diretamente em linha de lista persistente; o syncer adiciona primeiro a task row | accepted        |
| TSL24-B      | ausente                | recém-entra no live                | create pendente  | só o overlay optimistic/live existente pode exibir temporariamente, com reconciliação após a gravação    | accepted        |
| TSL25-A      | presente na identity A | summary na identity B do mesmo path | grouped/project | sem join e sem misturar workspaces; A mantém a linha estática                      | accepted        |
| TSL25-B      | presente               | presente                         | pinned/archived | o membership decide a partição, e os campos de sessions não podem mudar a partição             | accepted        |
| TSL25-C      | a linha SQLite pertence à remote identity A, mas `meta_json` está ausente ou com identity antiga remanescente | summary na identity A | grouped/project | na leitura, normaliza a identity pelas colunas de entidade do SQLite antes do join; não pode degradar para match por path | accepted |
| TSL26-A      | recém-gravada        | presente ou pendente              | active/project  | `task_created` rotaciona o snapshot da task row; a linha nova entra no workspace atual  | accepted        |
| TSL26-B      | ausente                | apenas rascunho                      | nenhum            | um rascunho não enviado não forja linha de task persistente                               | pruned          |

## Decisões de poda

| Decision ID | Combinações podadas                     | Guard/invariante                                       | Cobertura representativa                                 |
| ----------- | --------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------- |
| P1          | desktop/mobile × cada kind de membership | o perfil de delivery não altera o membership final da linha            | unit de desktop + testes existentes de scope/recovery do replayable |
| P2          | produto cartesiano local/SSH/WSL/Docker             | `workspaceKey` unificado, e o endpoint usa seu próprio task service | testes focados em identity                                  |
| P3          | session phase × provider/Goal/queue     | a phase afeta apenas o campo de activity, não a existência da linha persistente          | dois valores representativos, running/completed                            |
| P4          | deleted × todos os task type/list kind      | o invariante negativo do tombstone TSL20 já cobre                      | testes existentes de TSL20                                    |

## Casos aceitos

| Case ID | Setup                                                                          | Ação                                    | Asserções                                                            | Camadas de evidência                         | Status do E2E                          |
| ------- | ------------------------------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------- | --------------------------------------- | ----------------------------------- |
| TSL23   | o tasks-index tem 25 tasks active/grouped e o sessions-index só tem summary de 5 delas | construir Project/Timeline/Grouped             | ainda exibe 25 linhas; 5 têm activity, as demais usam meta persistente; a ordem dos grupos não muda            | teste de projection puro + integração de hook | focused covered; desktop planned    |
| TSL24   | a task row e o session summary existem simultaneamente e depois phase/title/activity são atualizados           | aplicar o delta de sessions e o refresh de membership | a identidade/partição da linha não muda; os campos em tempo real são atualizados; mutações de pin/unread não alteram a ordenação de activity | teste de projection/store                   | focused covered                     |
| TSL25   | mesmo path com identity diferente, identity do JSON do índice desatualizada, ou session summary ausente/atrasada | cold load, restauração remota, chegada do summary | as colunas de entidade do SQLite normalizam a identity primeiro; sem mistura de linhas; sem sumir quando falta summary; a linha original enriquece no lugar quando o summary correto chega | repo + identity + integração de hook | focused covered; remote GUI planned |
| TSL26   | o workspace atual já tem um snapshot antigo de task-row e a conversa nova grava sua task row no primeiro envio        | receber `task_created`                       | a leitura de membership/task-row é rotacionada; o Project mostra imediatamente a linha nova e ela não some em refreshes seguintes   | política de evento + integração de hook         | focused covered; desktop planned    |

## Backfill de matriz e handoff de E2E

| Arquivo                                                       | Mudança                                                         |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| `docs/conversation-session-case-catalog.md`                | adicionar TSL23-TSL26                                               |
| `docs/testing/conversation-session-e2e-coverage-matrix.md` | marcar focused tests + desktop regression representative planned |

- Provider fixture: sem requisição de modelo; usar task SQLite pré-configurado e snapshots de sessions-index controláveis.
- File-system fixture: conter pelo menos o representante local de "25 task rows / 5 summaries"; a remote identity usa mock focado.
- Estratégia de timing: afirmar antes e depois do snapshot, sem usar sleep; usar store frame/hydration gate.
- Risco de review: não tratar `status=running` histórico do task-index como spinner em tempo real; não deixar um resumo frio só de session contornar `deleted` ou o membership persistente.

## Regressão do indicador running em SSH/WSL de 2026-07-23

### Resumo de impacto

| Campo            | Valor                                                                                                           |
| ---------------- | --------------------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | corrigir a linha de task SSH/WSL existente com o spinner running ausente                                                                 |
| Capacidade       | Task persistence / workspace identity / task-list row projection                                                |
| Camada de mudança     | persistence                                                                                                     |
| Modo de operação   | planning                                                                                                        |
| Sementes primárias    | `TaskIndexRepo.rowToMeta`、`buildTaskEntityKey`、`mergeTaskIndexRowsWithSessions`、`deriveTaskLeadingIndicator` |
| Fora de escopo     | afrouxar o join na UI, fabricar activity a partir de `status=running` persistente, semântica de protocolo e delivery, reescrita completa do SQLite                      |

```text
tasks row(workspace_key = remote identity)
        |
        | rowToMeta normaliza pelas colunas de entidade do SQLite
        v
task meta(identity A) + sessions summary(identity A, phase=running)
        |
        | join por workspaceKey exato + taskId
        v
activity sidecar -> loading spinner
```

O `(workspace_key, task_id)` do SQLite já decide o escopo de consulta e isolamento; `workspace_identity` e `meta_json` são projeções de campos da entidade e não podem reescrever o isolamento da chave primária. Depois que o resolvedor unificado confirma uma `workspace_key` remota legítima, ele a restaura diretamente como identity; para linhas não remotas, lê a coluna de identity, e linhas locais ainda fazem fallback para `workspacePath`. Isso corrige o enrichment de SSH/WSL e preserva ao mesmo tempo o invariante TSL25 de que "mesmo path com remotos diferentes nunca faz join".

### Cobertura focada

| Caso     | Setup                                                            | Asserção                                             |
| -------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| TSL25-C1 | a coluna de identity da linha SSH está correta e `meta_json` não tem identity                | `listTaskMetas` retorna a identity da coluna                       |
| TSL25-C2 | a coluna de identity da linha WSL está vazia, mas `workspace_key` é uma remote identity legítima | na leitura, a identity é restaurada a partir de `workspace_key`                |
| TSL25-C3 | mesmo path, mesmo taskId, SSH identity diferente                            | casa apenas com identity totalmente igual; o summary errado não anexa activity |

Este ciclo não adiciona nenhum caso de E2E: TSL25 já define o representante de GUI remota, e a lacuna atual é a cobertura focada da camada de leitura do repo.

## Handoff de implementação de E2E de 2026-07-22

O usuário pediu continuar completando em lote os E2E deste bugfix por prioridade, sem pausar a cada dois casos. A semântica de produto e as podas existentes de TSL23-TSL26 permanecem inalteradas; este ciclo apenas leva os dois representantes faltantes de GUI desktop continuous para `manual-review/pending`, sem se expandir para remote/mobile ou para o produto cartesiano de outros kinds de lista.

### Impact Brief

| Campo            | Valor                                                                                                                |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| Intenção do desenvolvedor | dar evidência real de regressão de GUI do Desktop para "task-index é a autoridade da linha persistente" e "a troca de generations no primeiro task_created"                                       |
| Capacidade       | Task persistence / Project task list                                                                                 |
| Camada de mudança     | persistence + recovery                                                                                               |
| Modo de operação   | implementation-handoff                                                                                               |
| Sementes primárias    | `useWorkspaceTaskLists`、`buildTaskListResult`、`bumpTaskListMembershipVersionForWorkspaceEvent`、`WorkspaceSidebar` |
| Fora de escopo     | implementação de produto, GUI remota, mobile replayable, produto cartesiano das entradas Pinned/Archived/Grouped                                          |

| Cenário do usuário      | Entrada de UI                    | Implementação compartilhada                        | Owner de display/draft                         | Ação de commit                | Autoridade/persistência                              | Fronteira de modo           | Deve permanecer isolado de                           |
| ------------------ | --------------------------- | -------------------------------------------- | ------------------------------------------- | ---------------------------- | -------------------------------------------------- | ----------------------- | --------------------------------------------------- |
| Ver tarefas históricas na cold start | Project workspace task rows | `useWorkspaceTaskLists` + cache de consulta de task   | projection de task-list do renderer               | apenas hydration somente leitura               | `tasks-index.sqlite` decide a linha; sessions-index enriquece | representante desktop continuous | conteúdo de session, runtime config, outra identity do mesmo path |
| Primeiro envio de um rascunho       | V4 composer + linha do Project   | optimistic overlay + refresh por evento de workspace | projection de draft; depois a projection de task-list | `createSession` / primeiro envio | depois do commit da task row, `task_created` rotaciona a leitura | representante desktop continuous | rascunho não enviado, semântica de recuperação do mobile replayable            |

| Rank           | De               | Borda semântica | Para                         | Por que inspecionar                            | Evidência                                  |
| -------------- | ------------------ | ------------- | -------------------------- | ----------------------------------------- | ----------------------------------------- | -------------- | ------------------------------ |
| must-inspect   | Lista de tasks do Project  | projects-from | linha/membership do tasks-index | a ausência de summary não pode apagar linha persistente                 | `useWorkspaceTaskLists`, TSL23            |
| must-inspect   | `task_created`     | invalida   | cache de task-row/membership  | a linha nova precisa ser vista com e sem meta                | `taskListRefreshPolicy.test.ts`, TSL26    |
| should-inspect | sessions-index     | enriquece      | linha da task-list            | só atualiza activity/detail, não possui membership | `buildTaskListResultFromSessions.test.ts` |
| invariant-only | workspace key      | isola      | join/cache de linha             | precisa usar `workspaceIdentity?.trim()       |                                           | workspacePath` | TSL25, spec de workspace identity |
| invariant-only | desktop continuous | isolado de | mobile replayable          | a GUI deste ciclo não altera a cadeia de recuperação de snapshot/gap     | poda TSL07                                |

```text
cold start: tasks-index 25 rows ─┐
                                 ├─ join ─> Project first 5 ─> Show more ─> all 25
            sessions-index 1 row ┘

first send: draft(no row) -> optimistic row -> tasks-index commit -> task_created
                                                            |
                                                            v
                                              invalidate + persisted one row
```

| Estado/fato         | Owner autoritativo          | Espelho/cache                | Prova                                       |
| ------------------ | ---------------------------- | --------------------------- | ------------------------------------------- |
| Conjunto de linhas persistentes e total | tasks-index                  | cache de consulta de task            | SQLite real + exibição paginada de 25 linhas no Project          |
| Resumo em tempo real           | sessions-index               | enrichment da linha              | 1 com summary e 24 sem summary, todos ainda visíveis |
| Task nova ainda não gravada       | optimistic overlay do renderer  | overlay local de task-list     | zero linhas antes do primeiro envio; depois do envio, exatamente uma linha com o mesmo taskId        |
| Task nova já gravada       | tasks-index + `task_created` | geração de membership/query            | continua existindo e sem duplicação após o reload do renderer            |

O Codegraph expande a partir de `useWorkspaceTaskLists` para `buildWorkspaceGroupsFromSessions`, `fetchTaskListMembershipSetsForEndpointsCached` e `WorkspaceSidebar`, seis pontos de chamada; os fatos de implementação são consistentes com a spec existente. O grafo de semântica de funcionalidades atual declara apenas task persistence e SQLite, e ainda falta a superfície Project, a projection de task-list e as relações de service; este ciclo devolve ao grafo essas relações já confirmadas.

### Representantes de desktop aceitos

| Caso  | Setup                                              | Ação                             | Asserções                                                                           | Por que este representante                                                         |
| ----- | -------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| TSL23 | tasks-index real com 25 linhas; sessions-index só com 1 summary | cold start do Project, clicando em Show more repetidamente | 25 taskId únicos exibidos; a última linha sem summary existe; `running` persistente não forja spinner             | o teste focado já cobre 25/5 com precisão; a GUI usa a divisão 1/24 para cobrir as duas classes equivalentes de "summary presente/ausente" |
| TSL26 | o Project atual já está hidratado e o painel V4 é um rascunho não enviado  | primeiro envio aguardando o commit da task         | antes do envio não existe a task; depois do envio há só uma linha por taskId; continua só uma linha após o assistant concluir e após o reload do renderer | cobre optimistic→persisted e a troca de generation em `task_created`, sem repetir as combinações de entrega remote/mobile |

Os dois casos entram primeiro em `manual-review/pending`; mesmo após a verificação de fixture e o replay local estrito, continuam aguardando o review manual em lote, para então serem promovidos em conjunto.

### Resultados do replay local

| Caso  | Verificação de fixture | Replay estrito | Artefato                                                                     |
| ----- | ------------- | ------------- | ---------------------------------------------------------------------------- |
| TSL23 | passed        | 1/1 passed    | `packages/desktop/.e2e-artifacts/desktop-e2e-20260722-135334-434/summary.md` |
| TSL26 | passed        | 1/1 passed    | `packages/desktop/.e2e-artifacts/desktop-e2e-20260722-135432-692/summary.md` |

## Handoff da regressão de restart TSL19/TSL20 de 2026-07-22

Depois que o replay dos dois representantes de Project passou, seguem mais dois bugs P0 diretamente ligados ao membership na cold start. A semântica de produto e as podas de TSL19/TSL20 já estão confirmadas no catalog principal, e este ciclo não introduz combinações de estado novas: escolhe-se apenas a entrada de UI real do `desktop-continuous` local, mantendo remote/mobile no mesmo invariante de task-type/tombstone.

```text
fork: parent completed -> Fork -> child(task_type=fork,parent_id=parent)
                                  -> switch to draft -> App restart
                                  -> cold sessions-index -> Project child row -> click/hydrate

delete: task -> archive(confirm) -> Archived -> delete(confirm)
                 -> tasks-index deleted=1 ----┐
                 -> CLI session retained -----+-> App restart -> sessions-index has summary
                                              └-> Project/Archived both hide task
```

| Caso  | Setup                                                                                  | Ação                                                                                | Asserções                                                              | Combinações podadas                                                                                    |
| ----- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| TSL19 | criar o parent e bifurcar a partir do assistant concluído; o CLI usa `task_type=fork` e `parent_id=parent` | trocar para um rascunho não enviado, reiniciar o App e abrir o diretório da sessão `#` antes de retomarem o child      | `session:<childId>` exato visível, o que prova que o sessions-index da cold start já recuperou o child   | a linha do Project agora é mantida pelo tasks-index, e o fork que não cai em task row é uma lacuna independente; workflow/child auxiliar são cobertos por testes focados |
| TSL20 | arquivar um task comum a partir do Project e depois deletá-lo permanentemente de Archived                                      | afirmar o tombstone/a sessão do CLI e depois reiniciar o App, aguardando o diretório de menções de sessions raw ver a session | nem Project nem Archived ressuscitam; tasks-index `deleted=1`; a sessão do CLI é mantida | fork/live/replayable/todos os kinds de lista são cobertos pelos mesmos testes focados de tombstone; a GUI usa apenas interactive + restart      |

Os dois casos entram primeiro em `manual-review/pending`, usando provider fixture local ao caso; após a verificação de fixture e o replay estrito passes, continuam aguardando o review manual unificado deste lote.

### Resultados do replay local

| Caso  | Verificação de fixture | Replay estrito | Artefato                                                                     |
| ----- | ------------- | ------------- | ---------------------------------------------------------------------------- |
| TSL19 | passed        | 1/1 passed    | `packages/desktop/.e2e-artifacts/desktop-e2e-20260722-141321-231/summary.md` |
| TSL20 | passed        | 1/1 passed    | `packages/desktop/.e2e-artifacts/desktop-e2e-20260722-141719-802/summary.md` |

O replay estrito de TSL19 também expôs uma lacuna atual que não pertence ao commit original `3270dcc2c2`: o sessions-index da cold start já recupera o fork, mas o tasks-index não tem a task row do fork correspondente, e por isso o Project ainda não mostra o child. Este lote não disfarça essa lacuna como se o bugfix original estivesse coberto; o caso pending passa a usar a menção exata `session:<childId>` para provar o membership de sessions-index declarado pelo commit original, e a matriz continua marcando a linha do Project como partial.

## Commit de task-row de fork live em 2026-07-24

Estado final de produto confirmado pelo usuário: um fork explícito é uma task principal persistente e, assim que o comando tem sucesso, o child precisa aparecer imediatamente no Project, sem depender de reinício do App/CLI, de reabrir o child ou de um próximo runtime event se curar sozinho.

A falha não está no join da barra lateral, e sim na fronteira de hydration não publicar o resumo atual:

```text
fork commit -> child record/resume -> 暂态 draft publisher
                                      |
                                      v
                         synthesized conversation hydration
                                      |
                         [旧] 只 flush conversation subscriber
                                      X
                            sessions-index 无 visible upsert
                                      X
                         task-index syncer 无法创建 child row

                         [新] hydration commit
                                      |
                                      v
                         publish current non-draft summary
                                      |
                                      v
                     task-index row + task_created -> Project
```

O ponto de correção precisa ficar no hydration commit do gateway, e não em adicionar um overlay session-only na UI:

- hydration é a fronteira atômica em que o publisher transitório vira uma projection autoritativa completa, e não pode esperar por um evento seguinte que não tem garantia de existir.
- o sessions-index continua carregando apenas o summary leve; o tasks-index segue sendo o único dono das linhas persistentes e do membership.
- o filtro `isDraftSession` continua valendo, e um rascunho não enviado não é escrito por engano como task.
- o reenvio do mesmo summary é idempotente graças ao diff do sessions-index e ao upsert do task-index.
- o desktop `desktop-continuous` recebe imediatamente o delta online; o mobile `web-remote-replayable` continua chegando ao mesmo estado final pela sua própria subscription ligada à conexão e pela recuperação de snapshot/gap, e isso não pode ser usado para mudar o protocolo de recuperação.

A combinação representativa é fixada por TSL28 como desktop local, parent concluído e ausência de eventos posteriores de hydration. Um parent running só muda o pré-requisito do fork e o trabalho ativo do pai precisa continuar; SSH/WSL/Docker só muda o workspaceKey; mobile só muda a entrega, e nenhuma delas faz produto cartesiano com o estado final persistente da task-row.