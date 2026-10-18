# Semântica de atualização da lista de tarefas (taxonomia do reason `workspace_task_list_changed`)

> Fechado em 2026-07. Contexto: depois que M5 migrou a fonte de dados da lista lateral para o sessions-index, apareceu uma sequência de sintomas em que "operar o campo de entrada (trocar de modelo) / concluir uma tarefa / abrir uma tarefa histórica" faz a lista lateral de tarefas recarregar por inteiro e a tarefa pular para o topo da lista. A causa raiz é que as duas semânticas de consumo nunca foram definidas como contrato: ① a taxonomia de reason de `workspace_task_list_changed`; ② a definição de "atividade" do `lastActivityAt` do sessions-index. Este documento é a fonte de verdade dessas duas semânticas; a implementação de política está em `packages/ui/src/lib/taskListRefreshPolicy.ts` e os testes de guarda em `packages/ui/test/taskListRefreshPolicy.test.ts`.

## 1. Matriz reason → nível de atualização na UI

Ponto de emissão: `taskIndexSyncer.emitWorkspaceTaskListChanged(target, meta, reason)` — **reason é obrigatório** (correção de design: o valor padrão ausente `task_meta_changed` fazia com que todo ponto de emissão que não se manifestasse caísse silenciosamente na semântica de atualização mais pesada, o que foi a raiz de toda a sequência de defeitos).

| reason                                           | Semântica                                                   | Recarrega a tabela inteira¹ | Refaz o membership² | Reescrita incremental de meta³ | Ponto de emissão típico                             |
| ------------------------------------------------ | ----------------------------------------------------------- | -------------------------- | ------------------- | ------------------------------ | --------------------------------------------------- |
| `task_pinned` / `task_unpinned`                  | Inversão de pertencimento de fixo                          | ✅                          | ✅                   | —                              | setTaskPinned                                       |
| `task_archived` / `task_unarchived`              | Inversão de pertencimento de arquivamento                  | ✅                          | ✅                   | —                              | archiveTask/unarchiveTask                           |
| `task_meta_changed`                              | Meta relacionada a pertencimento (unread) ou fallback sem categoria mais fina | ❌ (com meta)                | ✅                   | preserve-membership            | setTaskUnread, operações de grupo, arquivamento em massa, difusão inicial |
| `task_status_changed`                            | Convergência de status/snapshot (conclusão, resync, abrir/retomar tarefa, compact/goal) | ❌                            | ❌                   | preserve-membership            | applyTerminalTransition, resync, resumeSession       |
| `task_model_changed`                             | Troca de modelo (puramente configuração)                   | ❌                            | ❌                   | preserve-membership            | zcodeSessionService.setModel                        |
| `task_title_changed`                             | Título (primeira mensagem/título automático/renomeação manual) | ❌                            | ❌                   | preserve-membership            | applyTitleChange, renameTask                        |
| `task_created`                                   | Nova tarefa (o conjunto de linhas diretas do tasks-index cresce) | ✅ (sem meta)                | ✅                   | insert-active                  | adapter/create, primeiro envio de ordem agrupada     |
| `user_message_saved` / `assistant_message_saved` | Gravação de mensagem em disco                              | ❌ (com meta)                | ❌                   | preserve-membership            | Caminho do protocolo antigo                         |
| `task_deleted`                                   | Tombstone de exclusão                                     | ✅                          | ✅                   | —                              | deleteTask; remove do cache na hora e gera nova geração do membership deleted |
| `stream_mirror_*`                                | Fallback de recuperação de stream                         | ✅                          | ❌                   | —                              | Caminho de recuperação do controle remoto            |
| `auto_archive`                                   | Aviso de arquivamento automático                          | ❌                            | ❌                   | —                              | Mantido por compatibilidade                         |

¹ `shouldRefreshTaskListForWorkspaceEvent`; ² `shouldRefetchTaskListMembershipForWorkspaceEvent` →
`bumpTaskListMembershipVersion` (um número de versão global; um único bump faz todas as instâncias de
lista refazerem o join de pin/archive/unread, com deduplicação pelo conteúdo do evento para evitar
entrega duplicada pelas duas cadeias de assinatura); ³ `getTaskMetaWorkspaceEventSyncMode`.

`task_status_changed` também pode carregar o sinal opcional `unreadSignal="background_terminal"`. O host
syncer do sessions-index v4 não sabe qual task cada janela está visualizing, então o Host é responsável
apenas por decidir "vale a pena lembrar sobre este estado terminal"; o renderer executa depois o active-task
guard. Estados terminais comuns de background, `verified` do Goal e erros reais carregam o sinal; os
estados `active/paused/verifying/notSatisfied/failed` do Goal não carregam. Broadcasts comuns de status,
como abrir/retomar tarefa histórica e convergência de snapshot de compact/goal, também não carregam, e é
proibido adivinhar uma nova conclusão apenas com base no status terminal. Quando o renderer recebe o sinal e
a task não é a active task atual, ele chama `setTaskUnread(true)`; essa mudança de pertencimento emite um
`task_meta_changed`, que por sua vez dispara o refetch do join de membership de unread.

O recarregamento integral da tabela em `task_deleted` continua sendo a salvaguarda dos campos ocultados
`total/hasMore`; para uma task que já atingiu o cache visível, pode-se antes fazer a remoção incremental.
Independentemente de atingir ou não o cache visível, ele precisa fazer bump da versão de membership, porque o
sessions-index ainda pode devolver a mesma CLI session em frames live posteriores ou no seed de cold start, e
só o conjunto negativo de ids deletados do tasks-index impede que ela volte para a lista comum.

`task_created` também precisa fazer bump da versão de membership. O tasks-index agora é a tabela à esquerda
das linhas persistidas de Project/Timeline/Pinned/Archived/Grouped; mesmo que o evento carregue `taskMeta` e o
sessions-index já tenha publicado atividade, não se pode manter a antiga política de "apenas reescrever meta
incrementalmente". O evento ocorre depois que a task row e a ordem agrupada inicial foram enviadas, e só a
leitura de nova geração completa a convergência `optimistic -> persisted row` e permite que tarefas criadas por
outras janelas ou pelo celular entrem na lista atual.

**Regra de decisão para novos pontos de emissão**: a mudança afeta o pertencimento de pin/archive/unread?
Se não → nunca use `task_meta_changed`; escolha um reason preciso ou crie um novo reason e atualize esta
matriz e os testes de guarda. O custo de classificar errado um caminho de alta frequência (que roda a cada
mensagem/conclusão/abertura) é = todas as instâncias de lista × RPC de membership × re-renderização da
lista inteira.

## 2. lastActivityAt: "o que conta como atividade da tarefa"

O `lastActivityAt` do sessions-index = `record.updatedAt` do CLI (`getSessionIndexMeta` do v4-bridge), e a barra
lateral da UI ordena por ele em ordem decrescente. **Somente atividade de sessão perceptível pelo usuário pode
fazer bump**:

- ✅ Conta como atividade: envio e recebimento de mensagens, ciclo de vida de turn, execução de ferramentas,
  tarefas em background, e os SessionEvents de bloqueio de permission/userInput recém-produzidos e perceptíveis
  pelo usuário.
- ❌ Não conta (`isNonActivitySessionEvent`, server-operations.ts):
  - `ModelSelected` / `SessionModeChanged`: mudança puramente de configuração (trocar modelo/trocar modo);
  - `SessionResumed`: abrir/retomar sessão é leitura, não atividade (o caminho de cold recovery acabou de
    preencher o store com o tempo real; isso não pode ser sobreposto).
- ❌ refresh/snapshot/resume/replay da mesma interação pendente não produz atividade nova; apenas um novo evento
  de requisição de bloqueio pode fazer bump uma vez.
- ❌ Mutations de configuração (`CONFIG_ONLY_MUTATION_REASONS`: model/thought_level/mode changed) e
  `updateRuntimeModelConfig` não fazem bump de `record.updatedAt`.
- ❌ Mutations de membership/meta do tasks-index (unread, pin/archive, group, rename) não podem mesclar o seu
  `updatedAt` do SQLite de volta no `lastActivityAt` do sessions-index. A ordenação por Updated só reconhece
  este último; a visão agrupada só reconhece o `sort_order` explícito.

Consequência de violar: operações de configuração/abertura de task empurram a task para o topo da lista e
disparam um reordenamento completo da coluna.

## 3. Defesa contra degradação no cold recovery do sessions-index (janela seed↔live)

No cold start o seed da lista vem do store (`getStoredSessionSummaries`); ao abrir uma task a projeção live
sobrescreve o seed. Antes da conclusão da hydration a projeção live está incompleta, então os campos abaixo não
podem ser sobrescritos com valores degradados sobre uma linha de base não vazia
(`SessionsIndexProjection.upsertFromConversation`):

- `title` vazio → manter a linha de base; `createdAt` atualizado → manter o valor mais antigo;
  `lastAssistantPreview` vazio → manter a linha de base;
- `phase === "draft"` com linha de base não draft → manter o phase/sessionEnded/goalStatus da linha de base
  (uma sessão que já tem conteúdo não pode voltar a draft).

Com a defesa completa, "abrir uma tarefa histórica sem mudanças" produz delta zero (teste de guarda:
sessions-index-projection.test.ts「冷恢复 draft 窗口快照与基线等价时不产 delta」).

## 4. Pipeline diferencial no renderer (impede que "uma mudança em um frame" vire recarregamento da lista toda)

A forma atual é "recálculo integral em memória + curto-circuito por equivalência de referência + cache de IO por
versão" (com milhares de sessões o recálculo leva ~ms; um store diferencial materializado de verdade é a
direção do refactor seguinte, ver §6):

- `useWorkspaceSessionsIndexItems`: a camada de agregação compara campo a campo e reaproveita o objeto antigo
  quando equivalente; quando a tabela inteira é equivalente, reaproveita o array antigo — assim os effects
  dependentes da identidade do array (grouped refresh, invalidação de cache do workspace, republish) fazem curto
  natural.
- `useWorkspaceTaskLists`: mudanças no sessions-index apenas marcam como sujo o escopo de workspace em que o
  diff encontrou mudança, em vez de invalidar tudo.
- **Semântica de exibição do refresh**: workspaces que já têm query cache usam stale-while-revalidate — apenas
  marca como `stale` o escopo atingido e mantém as linhas de task atuais, substituindo no lugar quando o
  recálculo em background termina; apenas a primeira hydration, quando o query cache está totalmente ausente,
  entra em blocking loading. É proibido expressar um refresh comum de sessions-index/membership como
  "limpar a lista existente → loading → preencher de volta", senão uma simples seleção ou retomada de tarefa
  ainda seria percebida pelo usuário como recarregar a barra lateral inteira.
- `useGroupedTaskView`: `stabilizeGroupedView` reaproveita em nível de nó; quando a árvore inteira é
  equivalente, o setState recebe a mesma referência e faz bail.
- `taskQueryCacheStore.setQueryResult(s)`: pula o setState quando o resultado equivale ao cache atual;
  `mergeIncomingTaskListItem` preserva a referência antiga quando o conteúdo é equivalente.
- **IO diferencial**: membership (pin/archive/unread) e estrutura agrupada não mudam com os frames de conteúdo
  do sessions-index; ficam em cache por `membershipVersion + assinatura`
  (`fetchTaskListMembershipSetsForEndpointsCached`, `remoteDataCacheRef` do grouped), enquanto os frames de
  conteúdo (title/status/lastActivity) fazem apenas join em memória, com zero RPC; o caminho de mutation de
  grupo invalida o cache explicitamente.

### 4.1 Isolamento de assinatura por escopo de workspace

`useWorkspaceSessionsIndexItems` consome o conjunto de vários workspaces, mas a posse da assinatura precisa
cair em um único `endpoint + workspaceKey`. Mudanças no conjunto de escopos só podem ser reconciliadas de
forma incremental por key; é proibido interpretar diretamente a mudança de assinatura do array como
"liberar todas as assinaturas antigas e reassinar todos os escopos novos". Caso contrário, remover um workspace
esvaziaria o snapshot, a marca d'água e as linhas de task dos demais workspaces, amplificando uma operação
local de navegação em uma reconstrução de estado entre workspaces.

```text
before = [A, B, C]             after = [B, C]
             │                         │
             └── reconcile by key ─────┤
                                       ├─ release A
                                       ├─ retain B store/subscription/watermark
                                       └─ retain C store/subscription/watermark
```

| Mudança de escopo                             | Efeito colateral permitido      | Efeito colateral proibido                  | Classificação          |
| --------------------------------------------- | ------------------------------- | ------------------------------------------ | ---------------------- |
| Remover A                                    | unsubscribe/release de A        | reconstruir ou esvaziar B/C                  | accepted               |
| Adicionar D                                  | adquirir D; hydration independente de D | esvaziar as linhas A/B/C existentes e esperar por D | accepted               |
| Apenas reordenar escopos                     | nenhum                          | qualquer subscribe/unsubscribe              | pruned: identidade do conjunto inalterada |
| Geração de endpoint/service de B troca       | substituir apenas B             | reconstruir outros workspaces do mesmo endpoint | accepted               |
| Desmontagem real do hook                     | liberar todas as entradas atuais | manter referências vazadas                 | accepted               |

Invariante principal: depois de ir de `[A, B, C]` para `[B, C]`, as instâncias de `SessionsIndexStore`, a
assinatura, a marca d'água e o conjunto de sessões de B/C precisam manter seus valores; o renderer não pode
publicar um estado intermediário vazio para B/C. O desktop continua usando `desktop-continuous`, e o escopo de
controle remoto do celular continua usando o `web-remote-replayable` do endpoint correspondente; esta mudança
apenas isola o ciclo de vida de assinatura, sem alterar nenhuma das duas semânticas de entrega. A chave de
identidade continua sendo `workspaceIdentity?.trim() || workspacePath`; `workspacePath` é usado apenas como
parâmetro de transporte e para exibição/execução.

### 4.2 Proibição de frames em branco na visão grouped (2026-08)

`Grouped` é a única visão da barra lateral que mantém a "lista autoritativa" em `useState` de instância de
componente e ainda tem gate de primeira tela; timeline/pinned/archived renderizam a partir do
`taskQueryCacheStore` de nível de módulo. Portanto, dentro do mesmo frame de conteúdo, apenas grouped expressa
"atualizando" como um bloco em branco — o usuário percebe "a lista agrupada da esquerda pisca inteira".
Quatro invariantes:

- **O gate só barra a primeira tela**: `isGroupedTaskViewInitialized` precisa ser um latch de uso único. É
  proibido ler diretamente o `loading` da lista atual do Controller — em uma tarefa em execução, cada nó de
  streaming (envio do prompt, primeira tool, conclusão da saída) dispara uma nova busca, o gate voltaria a
  fechar e a árvore inteira de grouped seria desmontada.
- **Uma vez desenhado, não pode voltar a branco**: `shouldHideGroupedTaskContent` precisa aceitar
  `hasPaintedOnce`. Depois de renderizar uma lista não vazia, qualquer frame de loading / não inicializado /
  estado vazio transitório continua renderizando a lista anterior.
- **A visão autoritativa sobrevive ao remontagem**: a última visão autoritativa é cacheada por assinatura de
  escopo em nível de módulo (`groupedViewCacheBySignature` em `useGroupedTaskView`), de forma que um
  remontagem de ancestral ou um HMR já desenhe em seguida; o RPC fica só com a convergência; o latch de
  inicialização também é semeado a partir do cache, senão o primeiro frame após o remontagem ainda fecharia a
  porta.
- **O memo de escopo precisa usar assinatura por valor**: `scopes` / `sessionsIndexScopes` é proibido fazer
  memo pela identidade do array de tabs. O pai reconstruindo um array de mesmo valor troca a identidade do
  `refresh`, e o effect "`refresh` mudou, então atualiza" faz setState e dispara o próximo render — formando um
  ciclo de refresh autoexcitado que emite RPC a cada frame e cria janelas de piscada para o gate e para o
  estado vazio. A convenção é a mesma de `workspaceSignature` em `useGlobalTaskList`.

```txt
Controller activity frame（phase/lastActivityAt 变化）
   │
   ├─ timeline/pinned/archived ─> 模块级 query cache ─> stale-while-revalidate，无空白
   └─ grouped ─> 实例 state + 首屏门禁 ─> 闩锁/hasPaintedOnce/模块缓存 缺一即整块空白
```

Dica de verificação: esse tipo de correção depende de "semear o estado inicial na montagem + latch dentro do
componente"; o vite HMR preserva o estado antigo dos componentes já montados, então é preciso **reiniciar o
aplicativo por completo** para retestar, e observações feitas sob hot reload não servem como conclusão.

## 5. Cadeia histórica de causas raiz (reconciliação das correções de 2026-07)

O mesmo sintoma (piscar/recarregar/pular para o topo na lista da esquerda) era resultado de quatro defeitos
independentes sobrepostos, com correções em:

1. reaproveitamento indevido do valor padrão de reason → reason obrigatório + classificação precisa dos caminhos
   de alta frequência (este §1);
2. configuração/retomada contada como atividade → o conjunto de eventos não-atividade do §2;
3. degradação para draft no cold recovery → defesa de phase do §3;
4. referência instável na camada de agregação/no query cache → estabilização do §4.

### 5.1 flash de bloco inteiro em grouped (reconciliação das correções de 2026-08)

O sintoma tem a mesma origem do acima, mas aparece apenas na visão `Group`: trocando para Group e rodando uma
tarefa com várias tools, há um flash **no envio do prompt, na exibição da primeira tool e na conclusão da saída
final**; trocando para Project/Timeline não há flash.

Três defeitos independentes reproduzidos e confirmados por testes
(`packages/ui/test/groupedTaskViewStreamingStability.test.ts`):

1. **O gate acompanha um loading transitório**: `initialized` é derivado diretamente do `loading` da lista do
   Controller, e cada nó de streaming refaz uma busca e fecha o gate → a árvore inteira de grouped é
   desmontada e remontada.
2. **Ciclo de refresh autoexcitado**: o memo de `scopes` fica na identidade do array, e o pai reconstruindo o
   array dispara render→refresh→setState→render (o caso de guarda chegaria a 200+ renders antes da mudança).
3. **Remontagem volta ao estado vazio**: a visão autoritativa existe apenas no state da instância do componente,
   então depois de remontar volta-se para "visão vazia + gate fechado", e é preciso esperar por dois RPCs para
   recuperar; essa é também a razão estrutural de "só grouped pisca".

Na mesma época foram descartados dois caminhos antes suspeitos: virtualização de topo/grupo (medido
`nodeCount 67 < 80`, ou seja, o limiar não foi atingido e não está ativo) e compressão da largura da barra lateral
pelo conteúdo da direita (o painel da barra lateral é `flex-none` + largura por variável CSS).

Contraexemplo (não introduzir de novo): outrora alguém usou "o Controller live ainda reporta a task" como
evidência de que "a linha não deveria sumir", para compensar a perda transitória de linhas. O critério daquela
abordagem é `kind:"active"` = `!archived`, o que **inclui tasks fixadas**, enquanto o critério de grouped é
"não fixada e não arquivada"; o resultado é que tasks fixadas eram ressuscitadas pelo guard e ficavam presas no
grupo. A restrição está em `docs/ui/task-grouped-view.md`, em「可见性真相源与删除收敛」.

## 6. Direção futura: store diferencial materializado

O pipeline atual reconstrói tudo a cada frame e depois faz curto por equivalência, o que é correto, mas tem custo
de recálculo e comparação O(N). A forma final é a diferencial e materializada: o delta do sessions-index cai
direto em um store de entidades por id (o renderer já é um Map), e cada visão (timeline/pinned/grouped/agrupamento
por workspace) mantém seu próprio índice ordenado e o mantém incrementalmente a partir do delta
(inserção/movimentação/remoção de um item por vez), removendo de vez o map/sort/comparação integrais. A mudança
envolve reorganizar o plano de dados de todos os hooks de lista, e deve ser um refactor independente (primeiro
escrever os testes de guarda e2e desta matriz, e só depois mexer).

## 7. Observação passiva e ciclo de vida do runtime

A escuta de `workspace_task_list_changed` e a aquisição de escopo do sessions-index são comportamentos de
observação, não intenção de uso do workspace. Elas precisam satisfazer:

- `onDynamicWorkspaceEvent` devolve apenas o emitter do workspace, sem estabelecer assinatura upstream;
- o sessions-index de task-list e o syncer de task-index do Host assinam/resincronizam apenas na forma
  `existing-only`;
- quando o runtime está ausente, entra em dormante: não registra erro de nível de produção, não inicia timer de
  backoff e não dispara Agent;
- quando o runtime fica disponível, cria uma única geração de assinatura apenas para os observers cujo
  workspaceKey corresponde; quando o estado dormante do task-index do Host é ativado pela primeira vez, precisa
  instalar de forma idempotente o listener de frames do workspace antes de enviar o subscribe, garantindo que um
  initial frame que chegue dentro da mesma leitura de stdio, depois do resolve da promise de ACK e antes do await
  continuation / da posse de assinatura assumir, não seja perdido; a troca de runtime apenas reassina, sem
  reinstalar o listener;
- após ficar indisponível, limpa a posse, os frames pendentes e as tentativas, e esconde as atividades em running
  que perderam a prova de vida;
- um reload do renderer pode reutilizar um runtime que já existe no Host, mas não deve fazer warm-up de outros
  workspaces restaurados.

O warm-up de cold start do app é uma intenção de inicialização explicitamente emitida pelo Main e não pertence à
observação passada acima. Ao restaurar vários workspaces locais em uma única janela, o Main escolhe apenas o
workspace ativado da última vez como target único (limite 1) e o entrega ao Host no primeiro `InitLocal` para
seguir o caminho de warm-up completo já existente `initializeWorkspace`; os outros workspaces de `recentProjects`
não são aquecidos e permanecem dormentes até o usuário abrir explicitamente / enviar / acionar uma entrada de
tarefa em background. Entradas de workspace único, como não ter sessão recuperável ou cold start por
open-workspace/deep-link explícito, também aquecem apenas o próprio target; uma falha no warm-up não varre
outros workspaces para substituir. Essa lista é calculada apenas quando o Host é criado pela primeira vez; um
reload do renderer reutiliza o Host original e não amplia a lista novamente.

> Em 2026-09-30 isso foi reduzido de no máximo 3 para 1: a CLI de sessão não tem coleta por ociosidade, então
> subir 3 processos de Agent no start deixa 3 cópias de memória da CLI residentes por janela, e o ganho de
> cold start ao trocar para o projeto recente não compensa esse custo de permanência.

```text
startup restore ─> explicit warmup target (active only, max 1) ─> Agent runtime available
                                                        │
sidebar mount/reconcile ─> passive observers ─> tasks-index rows
                                      │                 │
runtime available(workspaceKey) ──────┴─────────────────┴─> install listener -> attach sessions-index
runtime unavailable(workspaceKey) ─────────────────────────> dormant; no retry spawn
```

Em log de produção, mantém-se apenas runtime available/unavailable e o ciclo de vida real de assinatura; o
reconcile de observers, acertos de dormente e detalhes por frame usam `debug`, evitando que a quantidade de
workspaces multiplicada pelos consumidores de listas forme uma nova enxurrada de log.