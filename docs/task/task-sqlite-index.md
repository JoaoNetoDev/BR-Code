# Índice SQLite de Tarefas

> Documento histórico: a refatoração de projetos virtuais de 2026-09 substituiu o modelo de
> runtime descrito neste documento. O comportamento atual segue o
> [design de projeto virtual](../superpowers/specs/2026-09-09-virtual-project-design.md). A
> tabela de agrupamento voltou a ser estado de runtime por meio da
> [visão agrupada](../ui/task-grouped-view.md), e o novo `task_group_admissions` registra a
> primeira associação a um grupo e o placement de criação; o bootstrap de workspace não é mais
> executado. A CLI é dona dos fatos de sessão, e o Host é dono do estado de projeto e de
> organização. Abaixo, apenas como registro histórico de design.

## Escopo

`~/.zcode/v2/tasks-index.sqlite` é o índice do lado do app/host para consultas de lista de
tarefas. O ZCode Agent é dono do conteúdo central das sessões e do estado de runtime; o índice
sqlite é dono dos metadados de listagem rápidos e do estado do shell do produto.

O índice não substitui os snapshots de sessão do ZCode Protocol.

## Migrações em nível de banco (Todo109)

`tasks-index.sqlite` também hospeda as tabelas de Automation e Off-Peak. Os três repos
reaproveitam `runTasksDatabaseMigrations` antes de abrir para leitura/escrita; a migração de
nível de banco `tasks_schema_migration` faz a verificação somente-leitura do checksum das
migrações já registradas; havendo migrações pendentes, reexamina e aplica de forma serializada
através de `BEGIN IMMEDIATE`, com rollback em caso de falha e sem registrar sucesso.
`0001_adopt_task_schema` adota oito tabelas existentes, colunas e índices históricos;
`0002_provider_selection` consolida as conversões de Automation já decididas. Depois disso
apenas novas migrações podem ser acrescentadas, e SQL já publicado, a implementação de
conversão congelada ou sua versão semântica não podem ser modificados. O checksum cobre o
SQL/declarativo de colunas e a versão semântica das conversões, e não o texto de funções que
o empacotador reescreveria.

### Tabelas adicionais do R3 incluídas no razão de nível de banco

Motivo da correção: os repos Controller/Source do R3 criavam tabelas e colunas por conta
própria, contornando o checksum e a barreira de transação de `tasks_schema_migration`. A
atualização estrutural passou a ser executada de forma unificada por
`runTasksDatabaseMigrations`, com a seleção do conjunto de migrações conforme o uso da
chamada:

- O `base` padrão mantém os `0001`–`0003` existentes; não cria tabelas exclusivas de
  Controller/Source.
- `controller-remote` aplica `0004_controller_remote_identity`, assumindo
  `controller_remote_identity_migrations`; os registros de auditoria existentes são preservados.
- `source-server` aplica `0005_source_server_workspace_schema`, assumindo a estrutura atual de
  alias, ledger de mesclagem e conflicts, além das atualizações das antigas versões v1/v2/v3.
  O antigo `workspace_migration_schema_version=3` é mantido apenas para compatibilidade com
  binários antigos; o registro oficial de execução é o `tasks_schema_migration`; na assunção, uma
  versão futura de formato antigo é explicitamente rejeitada.

Os três conjuntos compartilham o razão e o executor `BEGIN IMMEDIATE` do mesmo banco físico,
podem aplicar seus respectivos conjuntos em qualquer ordem de inicialização e não disparam
conversões de tabelas de negócio ou de seleção de modelo sem relação ao ler apenas informações
de gerenciamento do Source. Todas as novas migrações são compatíveis com «tabela já existente,
mas não registrada no razão oficial»; as migrations/checksums existentes não mudam e, em caso de
falha, a estrutura e o registro são revertidos juntos, sem registrar sucesso manualmente. O
checksum deve cobrir o SQL congelado e a semântica das conversões estruturais.

#### Reabertura somente-leitura de migrações já concluídas

Com `dc16292fa1`, a entrada de migração passou a ser acionada a cada reconexão do Controller e
após cada resolução de workspace do Source, de modo que migrações já registradas também
passavam a solicitar o lock de escrita, contornando o caminho somente-leitura original quando
não havia dados de migração pendentes. Em um banco WAL real com outra conexão segurando o lock
de escrita, a versão-pai concluía em cerca de 1–2 ms, enquanto a versão-alvo esperava cerca de 5
segundos e reportava `database is locked`.

O limite da correção é o executor de migrações do banco do App e a entrada de migração de
session identity do Source:

- O razão do banco físico continua sendo o único estado de aplicação; não se adiciona cache em
  nível de processo nem se modificam SQL histórico, checksum ou identity.
- Quando todas as migrações selecionadas já estão registradas e o checksum confere, a
  verificação somente-leitura retorna sem solicitar o lock de escrita.
- Quando o razão ou as migrações estão ausentes, o razão é relido após obter `BEGIN IMMEDIATE`;
  a inicialização concorrente é serializada por essa transação, e a estrutura e o registro de
  sucesso são submetidos atomicamente. Um checksum divergente ainda falha explicitamente, sem
  ser mascarado por erro de lock.
- A migração completa de inicialização do Agent continua mantendo a transação de nível de banco
  original; desta vez muda apenas a condição de aquisição do lock na reabertura, sem alterar
  workspace identity, plano de mesclagem, UI/RPC ou os limites de desktop continuous / celular
  replayable.

```text
Reconexão / consulta ao Source → razão e checksum somente-leitura
                      ├─ tudo já registrado → retorna
                      └─ há pendências → lock de escrita → reexame dentro do lock → atualização estrutural + registro → commit
```

A regressão é coberta por `remoteSchemaMigrations.test.ts` com duplo conexão SQLite real: a
reconexão de um Controller já migrado sem linhas de origem, as consultas de gerenciamento do
Source e a resolução de sessão com alias existente têm sucesso mesmo quando outra conexão
mantém o lock de escrita WAL; o razão bem-sucedido e a auditoria de negócio permanecem
inalterados, e um checksum divergente continua sendo rejeitado. Seguem em execução os casos de
inicialização concorrente de banco novo e de rollback por falha. O contrato de operação do E2E
de reconexão remota existente permanece inalterado; conforme a matriz remota `R3A-P-02`, o
ramo de lock de migração é coberto por integração com armazenamento real, sem duplicar casos
Electron para cada estado do banco.

Verificação da correção em 2026-09-15: os três casos novos reproduzem `database is locked` em
`dc16292fa1` antes da alteração da entrada; seis arquivos de teste de App/Source com 60 casos e
três arquivos de armazenamento/migração do Agent com 57 casos passaram. A checagem de tipos da
raiz, o lint (57 avisos existentes, 0 erros) e a checagem de arquitetura (0 violações) passaram.
Não foram executados E2E reais de desktop/celular nem regressões em Windows/Linux; a evidência
se limita à integração com SQLite real no macOS com Node 24.14.0.

```text
Controller / Source com migrações pendentes → lock de transação no mesmo banco → atualização estrutural + razão de sucesso
                                                     ↓ após o commit
                             migração de dados de workspace (com backup, progresso e registros de recuperação independentes)
```

O `zcode_database_identity` do `db.sqlite` da CLI entra no `schema_migration` por meio da
definição compartilhada `0024_session_database_identity`. A inicialização do Agent e a assunção
antes da mesclagem pelo Source reutilizam o mesmo SQL, checksum e primitivas de aplicação; o
Source aplica apenas essa migração de tabela adicional independente e não executa as outras
migrações do Agent. A criação da tabela não gera nem sobrescreve o identity; seu valor continua
sendo gerenciado pelo plano de mesclagem congelado. A assunção de backups antigos passa pela
mesma barreira, e uma entrada registrada com estrutura corrompida falha explicitamente, sem
recriar a tabela para simular a recuperação.

A numeração das migrações ainda não publicadas é distribuída de forma unificada pela lista da
CLI: `0023_session_soft_delete_outcome` seguido de `0024_session_database_identity`, ambos
introduzidos na versão `0.16.9` da CLI. Os testes de migração verificam o ID completo, a
unicidade da numeração de quatro dígitos e o crescimento da lista por número, evitando que
branches diferentes ocupem o mesmo número após uma mesclagem. Desta vez apenas o número do
identity foi corrigido, sem alteração de SQL ou checksum e sem alias do ID antigo. No banco de
desenvolvimento, o processo antigo de escrita é interrompido e um backup é feito antes de, em
uma única transação, conferir ID, checksum e versão antiga, corrigir o ID do identity e o
soft-delete `3.12.0` preenchido por engano; o tempo de execução e os dados de negócio são
preservados e execuções repetidas não reexecutam a migração.

A verificação cobre, com SQLite real, o banco novo, a assunção de tabelas existentes, colunas
ausentes na v2, aberturas repetidas, checksum divergente, rollback por falha, inicialização
com múltiplas conexões e as duas ordens possíveis de Agent/Source. Apenas a inicialização da
estrutura de armazenamento foi alterada, sem mudanças em UI/RPC, workspace key, decisões de
mesclagem ou no encadeamento desktop continuous / celular replayable.

#### Registro de verificação de 2026-09-15

- Baseline da correção `b7881b4c2fe08e5f2b50d89db3e9dea96521c795`. Em um SQLite temporário
  real, reproduziu-se primeiro a falta de registro oficial em Controller/Source/Agent e a
  ausência de supressão de falha de razão no Source; após a correção, os casos passam. Foi
  acrescentado o caso de falha «marcador de versão antiga ausente, mas generation já
  existente», confirmando que a assunção não pode limpar a geração congelada.
- 7 arquivos de teste de App/Source com 54 casos passaram; 4 arquivos de teste de
  armazenamento/migração do Agent com 76 casos passaram; após a reconstrução dos contracts,
  mais 16 casos de runtime reasoning replay passaram, totalizando 146 verificações específicas
  sem repetição. Inclui a recuperação de colunas realmente ausentes na v2 antiga, a exclusão
  de banco vazio tardio, a inicialização multithread, o checksum, o rollback transacional e as
  ordens de inicialização Agent/Source. Comparando com os módulos reais do HEAD, as 22
  definições antigas do Agent são idênticas e os 3 registros antigos do razão do App (com
  checksum/tempo) não mudam.
- `pnpm typecheck` da raiz, `pnpm lint`, `pnpm architecture:check --changed` e a checagem de
  formatação dos arquivos alterados passaram; `npm run typecheck` dos adapters do Agent passou
  após reconstruir o dist de contracts desatualizado.
- Executado `npm test -- --run` dos adapters conforme pedido do Agent: 11 falhas em 120
  arquivos, com 87 falhas, 1659 sucessos e 4 pulados em 1750 casos; há ainda uma config suite
  com módulo ausente. Isso não é um registro de aprovação específico desta rodada. Com um loader
  Vitest temporário restaurando os dois módulos de migração do HEAD, os 5 arquivos com falha
  relacionados ainda reproduzem 51 falhas (fixture de options de modelo, configuração de
  assinatura, ambiente MCP e módulo de catalog ausente). As falhas de runtime replay causadas
  por artefatos antigos desapareceram após a reconstrução; o timeout de concorrência de sessão
  sob carga total passou na reexecução focada. As demais falhas de testes estendidos não
  receberam atribuição completa de baseline, e a correção não foi ampliada.
- O `npm run lint` dos adapters do Agent continua sendo bloqueado pelo limite de `max-lines` de
  arquivos existentes; inclui o arquivo original de definição de migração com mais de 900
  linhas. Nesta rodada o SQL antigo não foi modificado para dividir ou contornar essa barreira.
- Nenhum banco real de usuário foi manipulado, e não houve regressão conjunta em desktop/celular
  reais nem em Windows/Linux; esta rodada não tem mudança de interação em UI/RPC, e os passos
  de operação do E2E de interação remota existente permanecem inalterados. Antes da publicação
  do schema do Agent, é necessário:
  - Ao reverter o código desta rodada, manter as novas tabelas/razão e as marcas de compatibilidade
    antigas; não remover linhas de schema nem reexecutar a consolidação de dados já concluída.
    Falhas de migração de dados continuam usando o backup original e a entrada de recuperação de
    negócio, sem liberar o bloqueio por registro manual de sucesso.

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
