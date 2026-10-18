# Índice SQLite de Tarefas

## Escopo

`~/.zcode/v2/tasks-index.sqlite` é o índice do lado do app/host para consultas de lista de
tarefas. O ZCode Agent é dono do conteúdo central das sessões e do estado de runtime; o índice
sqlite é dono dos metadados de listagem rápidos e do estado do shell do produto.

O índice não substitui os snapshots de sessão do ZCode Protocol.

## Migrações em nível de banco (Todo109)

`tasks-index.sqlite` também hospeda as tabelas de Automation e Off-Peak. Os três repos
reaproveitam `runTasksDatabaseMigrations` antes de abrir para leitura/escrita; a migração de
nível de banco `tasks_schema_migration` verifica e aplica as migrações de forma serializada
através de `BEGIN IMMEDIATE`, com rollback em caso de falha e sem registrar sucesso.
`0001_adopt_task_schema` adota oito tabelas existentes, colunas e índices históricos;
`0002_provider_selection` consolida as conversões de Automation já decididas. Depois disso
apenas novas migrações podem ser acrescentadas, e SQL já publicado, a implementação de
conversão congelada ou sua versão semântica não podem ser modificados. O checksum cobre o
SQL/declarativo de colunas e a versão semântica das conversões, e não o texto de funções que
o empacotador reescreveria.

```text
Primeira abertura por qualquer repo → razão de nível de banco/transação → todas as tabelas
prontas → leitura/escrita normal pelo repo
Outros repos / outros processos → verificação pela mesma razão → pulam versões já aplicadas
```

Colunas antigas e timestamps não são sobrescritos pela conversão de Provider; Readers
normais/dispatch usam apenas as colunas novas. Na Automation, um JSON `null` significa uso
explícito da configuração padrão, enquanto SQL NULL significa configuração ausente, precisando
de nova seleção. Registros no formato antigo e novo produzidos pelo rollback não são
recuperados pela reexecução das migrações existentes; o conteúdo ainda precisa poder ser
listado e aberto. Seleções antigas de Off-Peak sem Provider não consultam a conta atual para
adivinhar, não alteram o Ticket nem fazem migração tardia na leitura; a configuração ausente
apenas afeta a elegibilidade para execuções futuras. A limpeza de associações e a manutenção
de projeções já existentes do TaskIndex não fazem parte da conversão de Provider.

## Responsabilidades

- Manter as consultas de lista de tarefas rápidas sem iniciar o agente de cada workspace.
- Persistir o estado do shell do produto, como título, fixado, arquivado, excluído, não lido e
  override de título.
- Armazenar um snapshot compacto de `ZCodeTaskMeta` em `meta_json` para renderização da lista.
- Armazenar texto pesquisável limitado para a busca global de tarefas.
- Manter o isolamento de identidade de workspaces remotos consistente através de
  `workspaceKey = workspaceIdentity?.trim() || workspacePath`.

## Tabela

A tabela `tasks` tem como chave `(workspace_key, task_id)`.

Colunas centrais:

- `workspace_key`
- `workspace_path`
- `workspace_identity`
- `task_id`
- `title`
- `task_status`
- `provider`
- `mode`
- `model`
- `migration_source`
- `forked_from_task_id`
- `created_at`
- `updated_at`
- `unread_at`
- `last_unread_at`
- `pinned`
- `archived`
- `deleted`
- `title_overridden`
- `searchable_text`
- `meta_json`

Os índices cobrem consultas de lista de workspaces ativos, listas de fixados, listas de
arquivados, listas de excluídos, linha do tempo global recente e busca de texto limitada.

## Regras de Runtime

- As escritas são serializadas por `(workspace_key, task_id)` para evitar sobrescritas
  concorrentes de metadados.
- `unread_at` é o marcador atual de pertencimento/CAS de não lido. `last_unread_at` é uma
  marca d'água interna de alocação que sobrevive à limpeza de `unread_at`; as escritas do
  repositório alocam cada novo marcador de não lido acima dessa marca d'água, de modo que
  escritas no mesmo milissegundo e retrocessos de relógio não reutilizem uma versão obsoleta
  de compare-and-clear.
- `unread_at` é autoritativo sobre a cópia em `meta_json`. Escritas que não mutam
  explicitamente o estado de não lido devem preservar o valor atual da linha no limite de
  conflito do SQLite, para que um snapshot obsoleto de outro Host não possa reverter um
  marcador mais novo.
- Toda conexão do task-index usa um busy timeout do SQLite limitado. Migrações aditivas de
  schema são idempotentes sob inicialização concorrente de Hosts: após contenção de lock, um
  resultado de coluna duplicada só é aceito quando a coluna está presente.
- `meta_json` é analisado com `zcodeTaskMetaSchema`; linhas inválidas caem para as colunas
  escalares e registram um aviso.
- As colunas de linha do SQLite são autoritativas para as coordenadas da entidade: as leituras
  devem sobrescrever os valores de `meta_json` com `task_id` e `workspace_path`. Como
  `(workspace_key, task_id)` é o limite real de consulta/chave primária, um
  `workspace_key` remoto válido é autoritativo sobre uma projeção de `workspace_identity`
  ausente ou obsoleta; linhas não remotas usam a coluna de identidade apenas quando ela é
  igual a `workspace_key`. Isso mantém as consultas de lista e os joins do sessions-index na
  mesma chave de isolamento, sem nunca recorrer a um caminho remoto.
- `searchable_text` tem um limite, para que tarefas longas não aumentem o arquivo sqlite sem
  limite.
- Os escopos de consulta devem passar `workspaceIdentity` para workspaces remotos;
  `workspacePath` permanece o caminho de execução/exibição.
- Consultas de lista de tarefas e listeners de eventos dinâmicos de workspace são observadores
  passivos. Registrar qualquer um dos dois não deve iniciar um runtime de agente de workspace,
  reconectar um workspace remoto nem promover uma retentativa de runtime dormente.
- O warmup de inicialização do Main do desktop é uma ação explícita de ciclo de vida, e não
  um efeito colateral de lista de tarefas. Quando múltiplos workspaces locais são restaurados,
  ele pode iniciar no máximo três alvos deduplicados, selecionados a partir do último workspace
  ativo e da ordem persistida de projetos recentes. Um warmup que falha não puxa um quarto alvo.
- As assinaturas de ingestão de `sessions-index` / `workspace-config` do task-index só são
  anexadas depois que uma operação explícita de workspace tornou disponível o runtime daquele
  `workspaceKey` exato. Seus caminhos de subscribe e retry usam uma política `existing-only`,
  de modo que um runtime parado volta ao estado dormente em vez de ser iniciado por observação.
- A disponibilidade de runtime é chaveada por `workspaceIdentity?.trim() || workspacePath`. Um
  evento disponível para uma identidade SSH, WSL ou Docker não deve anexar observadores
  pertencentes a outra identidade com o mesmo caminho de execução.
- O primeiro snapshot autoritativo de `sessions-index` é um limite silencioso de
  reconciliação: sessões não-rascunho apenas semeiam linhas de tarefas ausentes, o estado
  existente do shell do produto nunca é sobrescrito e nenhuma difusão de mudança de lista por
  linha é emitida. Isso mantém o anexo tardio/reconexão seguros sem reproduzir eventos terminais
  históricos nem causar uma tempestade de difusões na inicialização.

## Relação Com o Estado de Sessão

O estado de sessão do ZCode Agent permanece autoritativo para mensagens, configurações de
modelo/runtime, solicitações de permissão, eventos de stream e estado do turno ativo.

O índice de tarefas pode guardar metadados suficientes para a renderização da lista, mas não
deve se tornar a fonte da verdade para o conteúdo das sessões. Linhas ausentes são semeadas a
partir do resumo autoritativo de `sessions-index` durante a reconciliação inicial; abrir,
retomar ou concluir uma tarefa mais tarde enriquece essa linha a partir do snapshot completo
da sessão (incluindo o modelo e o texto de mensagens pesquisável).

### Perfil de leitura do índice (2026-09-30)

O resync do task-index junto ao Host (`resyncTaskIndexRowFromAgent`: `phase.completed/error`,
`meta.titleUpdated`, `session.became-visible`) chama `session/read` com
`contentProfile: "index"`:

```text
task-index syncer ──session/read {runtimePolicy: existing-only, contentProfile: "index"}──▶ CLI
                                                          │ primeiro constrói o snapshot completo como full (semântica inalterada)
                                                          │ depois só remove os campos de payload grandes (sem adicionar/remover message/part)
task-index syncer ◀── snapshot de mesma estrutura (dezenas de KB~centenas de KB, não 15 MB)──┘
   └─ buildMetaFromSnapshot / searchableText / hasUserVisibleContent: resultado idêntico byte a byte com full
```

- Regras de remoção (`elideSessionSnapshotForIndex`, `@zcode/shared`): `state.input` de tool
  part → `{}`, `state.output/raw/error` → `""`, `state.metadata` → `{}`; `text` de reasoning
  part → `""`; URL `data:` de file part → `data:,`. A quantidade e a ordem das messages,
  `info`, o `type/id/metadata` de todos os parts e os demais parts de
  text/compaction/timeline/subagent etc. são preservados como estão.
- Por que não usar `messageLimit`: ele preserva as N últimas mensagens, enquanto o searchable
  text usa os primeiros 200K caracteres, o fallback de título usa a primeira mensagem real do
  usuário e o julgamento de visibilidade considera todas as mensagens; truncar mudaria o resultado
  do índice.
- Motivo da revisão: a implementação antiga lia o snapshot completo a cada turno concluído, e
  uma sessão longa com uma única linha NDJSON de 15 MB (principalmente tool output na casa
  dos 3 MB), com o Host fazendo uma vez por turno uma análise de 15 MB de JSON/zod; o task
  index usa de fato apenas texto, info e a estrutura de parts.
- Esta é uma visão de leitura exclusiva do task index: outros chamadores de `session/read` não
  devem passar `index`, e o snapshot obtido também não deve ser gravado de volta no
  estado de UI/conversation. O comportamento padrão ou `full` permanece inalterado.

## Projeção de Status da Tarefa

`task_status` é um estado de tarefa do produto, e não um espelho direto de `session.status`.

- `session.status=running|waiting|paused` mapeia para `task_status=running` quando o snapshot
  ainda tem runtime ativo.
- `session.status=error|completed` mapeia diretamente para o mesmo status terminal de tarefa.
- `session.status=idle` significa apenas que o motor do agente não tem turno ativo. Se a última
  mensagem do assistente visível ao usuário tem um timestamp de conclusão e não é um limite
  de continuação de chamada de ferramenta, o status da tarefa é `completed`.
- `projection.lastError` tem precedência sobre uma mensagem do assistente previamente
  concluída, porque falhas de provider podem acontecer antes de uma nova mensagem do assistente
  ser persistida.

Todos os chamadores que projetam snapshot para status de tarefa devem usar o helper de
projeção compartilhado de `@zcode/shared`. A projeção da UI, o adaptador de serviço e a
sincronização do índice sqlite não devem carregar cópias separadas dessa lógica, caso contrário
trocar de workspace pode restaurar uma tarefa a partir de uma interpretação de status terminal
diferente daquela usada durante o streaming.

## Implementação

- `packages/services/src/session/taskIndexRepo.ts`
- `packages/services/src/session/zcodeTaskService.ts`
- `packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts`
- `packages/shared/src/zcode-task-types.ts`
- `docs/ui/pinned-task-storage.md`