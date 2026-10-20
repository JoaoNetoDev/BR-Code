# Planejamento de design de projetos virtuais

> A criação de rascunhos, os padrões de modelo e permissão e o ciclo de vida do diretório de tarefas não classificadas seguem o [design unificado](../../ui/project-task-draft-lifecycle.md): isolamento por cliente, host de destino e ID de projeto; após a aceitação no primeiro envio, o diretório de pendentes não classificados é consumido. As demais restrições de estado organizacional e de diretório de execução deste documento continuam valendo.

> Adjudicação de 2026-10-13 (substitui decisões anteriores): Project e Group coexistem. O filtro “por grouping” do menu de recuperação é restaurado; Group é uma visão organizacional entre projetos e entre dispositivos, salva no lado do controlador, e não determina o diretório de execução nem a atribuição de projeto. Na primeira atualização, mantém-se workspace → Project e cancela-se Group → Project; as tabelas de grupos antigos continuam como dados autoritativos. Não se restaura a criação automática de grupos por workspace nem o arquivamento forçado na consulta de grupos. O comportamento e os critérios de aceitação estão em [visão de tarefas agrupadas](../../ui/task-grouped-view.md). Todas as decisões posteriores deste documento sobre mesclar Group, as duas visões, a conversão manual de Group em projeto por F9/F10, a conversão de grupos por M6 e a descontinuação da API de grupos são substituídas por esta. Bancos de desenvolvimento que já executaram a conversão antiga não são limpos automaticamente em sentido inverso; não se modificam IDs de migration existentes nem o SQL checksum.
>
> Adjudicação complementar de 2026-10-15 (tarefas antigas remotas incorporadas a projetos): a lista de workspaces remotos legados controlada pelo desktop existe somente no setting.json do lado controlador (`kind=remote`); o `lastWorkspaceSession` do próprio Source Server remoto está vazio. F8/M5 originais liam apenas a lista do próprio Host que detém o banco, de modo que a primeira migração remota criava 0 projetos, todas as sessões antigas eram classificadas como não classificadas e as sessões remotas não classificadas não entram no painel lateral — após a atualização, selecionar o diretório original só permitiria criar um projeto vazio. Agora, por exceção de F8: quando o owner do banco detentor não é `local`, a primeira migração também cria um projeto de root único a partir dos diretórios de tarefas históricas e os incorpora. Bancos que já executaram `0005_projects` não são reprocessados nem corrigidos; o ID de migration e o SQL checksum permanecem inalterados.
>
> Adjudicação complementar de 2026-10-19 (contensão de contenção para múltiplos owners do mesmo banco na mesma máquina): na mesma máquina, o desktop local (owner=local) e o Source Server (owner=server) compartilham `~/.zcode/v2/tasks-index.sqlite`. `0005_projects` é executada uma única vez por banco e grava apenas a linha de host do primeiro a abrir; o owner que abre depois fica sem a própria linha em hosts, e a criação de projeto falha por causa da foreign key `projects.host_id`. A cada inicialização, cada owner repõe idempotentemente a própria linha de host em `reconcileLegacy` (`INSERT OR IGNORE`), sem alterar schema, ID de migration e checksum, e sem alterar o `host_id` nem a atribuição de projeto de nenhuma tarefa. Questão remanescente (não corrigida): linhas antigas com `host_id IS NULL` são reivindicadas pelo primeiro processador; `local` decide pela forma do workspace_key, `server` não olha a key e atribui tudo a si, de modo que sessões antigas da máquina A podem ser reivindicadas pelo Source Server e sessões antigas via SSH podem ser atribuídas pela máquina local ao host de endereço ssh. A regra de reivindicação e a correção de dados mal atribuídos serão adjudicadas à parte.

Status: **em implementação** (2026-09-10). A seção 3 é o registro de decisões (2026-09-09 a 09-10, alinhado item a item com o mantenedor), e a seção 4 em diante é o plano expandido conforme as decisões. Se, antes da implementação, for encontrado algum conflito com as decisões, o registro de decisões prevalece e este documento deve ser atualizado. Limites de implementação, testes e progresso estão em [registro de implementação](../plans/2026-09-10-virtual-project-implementation.md).

## 1. Conclusões de produto (entradas)

1. Group e Project são mesclados; no produto resta apenas Project.
2. Project deixa de equivaler a um Folder Path e passa a ser um contêiner que organiza Sessions por tema de tarefa; um Project pode ter 0 ou mais pastas locais (Repo / Worktree / Remote Workspace não são tratados nesta rodada).
3. A UI adota a hierarquia tradicional “projeto / pasta”, e não o estilo de grupos de abas do Chrome.
4. É possível criar uma Session não classificada sem antes criar um Project e depois arrastá-la para dentro ou para fora.
5. Remove-se a entrada pública de gerenciamento de group e project.
6. Sessions locais e remotas não são gerenciadas em conjunto; projetos remotos e locais são exibidos lado a lado, e o dispositivo serve apenas como identidade e informação de conexão.
7. A reformulação do banco é o núcleo: descarta-se `tasks-index.sqlite`, convergindo para uma única fonte de dados; a migração pode ser revertida, é capaz de atravessar versões e faz backup antes da migração.

## 2. Situação atual (conclusões da pesquisa)

### 2.1 Hoje a lista da esquerda tem 4 fontes de dados

```text
setting.json (~/.zcode/v2/settings/setting.json)
  ├─ recentProjects: string[]              histórico de caminhos locais (máx. 10)
  └─ lastWorkspaceSession: Entry[]          lista real de workspaces da barra lateral (ordem = ordem da barra lateral)
       ├─ {kind:"local",  workspacePath, workspacePurpose}
       └─ {kind:"remote", workspacePath, workspaceIdentity, target(snapshot), lastConnectionStatus...}

tasks-index.sqlite (~/.zcode/v2/tasks-index.sqlite, note que o nome do arquivo tem "s")
  ├─ tasks                      title / searchable_text / pinned / archived / deleted / unread / status
  │                              PK = (workspace_key, task_id)
  ├─ task_groups                 metadados de group (title/color)
  ├─ task_group_members          task ↔ group (uma task por group)
  ├─ task_group_view_node_orders ordem de mistura do nível superior
  ├─ task_group_workspace_bootstraps  marca de uso único de "criar group automaticamente por workspace"
  ├─ off_peak_tasks              tarefas ociosas
  └─ automations / automation_runs   tarefas agendadas

cli/db/db.sqlite (~/.zcode/cli/db/db.sqlite, db do próprio CLI, com migration runner de verdade)
  └─ session / message / part / local_setting / session_task_link ...  corpo das sessões e estado do lado do CLI

renderer localStorage
  └─ preferências de visualização, estado de recolhimento, group de split do workbench (sem relação com o group da barra lateral)
```

A UI faz o join no cliente em `useGroupedTaskView` / `useWorkspaceTaskLists`: `listGroupedTaskViewStructure` + `listTasks/listPinned/listArchived/...` + frames ao vivo do `sessions-index` v4 → montagem em memória. Essa é a raiz da abundância de bugs.

### 2.2 A contaminação de `workspace_key`

- Definição: `workspaceKey = workspaceIdentity?.trim() || workspacePath` (`packages/shared/src/task-realtime-core.ts:92`).
- O valor gravado para remote tem a forma `remote:ssh:dev.internal:22:developer:/work/demo`, ou seja, a conta ssh entra na chave primária.
- A mesma definição é usada em: `~/.zcode/v2/sessions/{hash}`, `agent-config/{provider}/{hash}`, hash de diretório de memória do CLI, chave do bridge web-remote e campo `workspaceKey` de automation/off-peak. **Ao mudar a chave primária, esses hashes derivados também mudam**, o que exige migrá-los em conjunto ou manter um mapa de compatibilidade.
- O `zcodeTaskService` do remote é um proxy RPC para o Host remoto e escreve no `tasks-index.sqlite` da própria máquina remota; a máquina local não tem cópia do índice das sessões remotas.

### 2.3 Infraestrutura de migração existente

- Lado do app: **não há** número de versão de schema nem registro de “última versão executada”. O sqlite usa `CREATE TABLE IF NOT EXISTS + ensureColumn`, e o setting.json usa uma cadeia de preprocess do zod para migrar no lugar.
- Lado do CLI: `schema_migration(id, checksum, app_version)` + 18 migrations sequenciais (`apps/zcode-cli/packages/adapters/src/storage/session-store/migration-runner.ts`), padrão que pode ser reutilizado diretamente.
- Backup/compressão: já existem `yazl` (exportLogs, feedback), `backupCorruptFile` e `copyDataDirectory` (usados na troca de basedir). **Não há** verificação de espaço em disco.
- Cadeia de inicialização: main `whenReady` → `mainSettingService.get()` → spawn do cron scheduler → criação da janela → na primeira abertura do sqlite durante o `InitLocal` do Host. O renderer tem `RootStartupLoading` (`shouldShowRootStartupLoading`), ao qual se pode adicionar uma entrada `isMigrating`.

### 2.4 Lista de configurações do agent com “resolução por diretório” (regras de raiz atuais)

| Configuração                                | Nível de usuário                                                      | Caminho em nível de projeto                                                   | Raiz de resolução                                         | Regra de mesclamento em múltiplos níveis                                                            |
| ----------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| settings (model/permission/ui/storage)     | `~/.zcode/cli/config.json`                                             | `<dir>/zcode.json`, `<dir>/.zcode/config.json`                               | do cwd até o git root, raiz primeiro e cwd depois            | merge profundo, o posterior sobrescreve                                                            |
| MCP servers                                 | o mesmo `mcp.servers`                                                  | o mesmo                                                                      | o mesmo                                                   | por name: system → project → **user** → env → cli (usuário sobrescreve projeto); fonte de projeto marcada untrusted |
| hooks                                       | `config.json.hooks` diretamente executável                            | o mesmo                                                                      | o mesmo                                                   | em nível de projeto só gera hookCandidate e passa pelo workspace hook trust                      |
| skills                                      | `~/.zcode/skills`, `~/.agents/skills`                                  | `<dir>/.zcode/skills`, `<dir>/.agents/skills`                                | do cwd até o git root, cada nível                           | todos visíveis; em caso de nome duplicado vence o primeiro descoberto (nível de usuário faz shadow do de projeto) |
| commands                                    | `~/.zcode/commands`, `~/.agents/commands`                              | `<dir>/.zcode/commands`, `<dir>/.agents/commands`                            | igual a skills                                             | em caso de nome duplicado vence o que chegar primeiro + duplicate diagnostic                    |
| subagents                                   | `~/.zcode/cli/agents/*.md`                                             | `<cwd>/.zcode/agents/*.md`                                                   | **apenas o nível do cwd, sem subir**                        | Map por name, o carregado depois sobrescreve (projeto sobrescreve usuário)                        |
| AGENTS.md                                   | `~/.zcode/AGENTS.md`                                                   | `<dir>/AGENTS.md`                                                            | do cwd até o git root, **apenas a primeira ocorrência**    | concatenação dos trechos user + workspace                                                        |
| memory escrita pelo próprio agent          | —                                                                       | `~/.zcode/cli/memories/projects/<slug>-<sha(identity‖path)>/memory`          | hash por workspaceKey                                      | um diretório por item                                                                              |
| permissions ruleset                         | —                                                                       | sqlite `local_setting(scope=project, scope_id=projectIdFromDirectory(cwd))`   | diretório exato do cwd                                     | um diretório por item                                                                              |
| plugins                                     | `~/.zcode/cli/plugins` + `config.json`                                 | seção plugin do config do projeto                                            | igual a settings                                           | `resolvePluginConfigSources`                                                                       |
| workspace-config topic (página de settings) | —                                                                       | —                                                                            | key = `workspace-config/<workspaceId>`                     | um por workspace                                                                                    |

O lado do CLI já tem um rascunho de multi-workspace em `apps/zcode-cli/docs/design/v2/multi-workspace.md` (`WorkspaceScope{primaryRoot, additionalRoots}`, `--add-dir`, roots em `local_setting(scope=workspace)`), ainda não implementado, que pode servir de ponto de apoio para as mudanças do lado do agent nesta rodada.

> 2026-10-10: a decisão mais recente — remote de diretório único, sem agrupamento de Hosts, projeto antes da sessão, mistura unificada no lado controlador — está em [spec de integração](2026-10-10-session-manage-upstream-integration.md). Os registros de processo históricos deste documento que conflitam com ela deixam de servir de base para a implementação.

## 3. Registro de decisões (2026-09-09 a 09-10, mantenedor)

### 3.1 Conceitos e limites

| #   | Questão                                    | Decisão                                                                                                                                                                                                     |
| --- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A1  | Duas formas da barra lateral               | Forma 1 = dois blocos “projeto / tarefa”; forma 2 = ordenação por tempo (linha do tempo)                                                                                                                     |
| A2  | O diretório real como nó visível           | Não é um nó, é apenas um atributo root do projeto                                                                                                                                                        |
| A3  | Remoção da gestão pública                  | Remove-se o alternador de visão Group/Project, o menu de gerenciamento de group e a entrada de novo group e a página de gerenciamento centralizado; a barra de ferramentas da figura 7 é removida por completo, e a ordenação (por tempo / por projeto) vai para o menu de contexto do título “projeto”; a linha do tempo mantém a implementação, mas oculta a entrada, e a entrada de arquivamento e todos os ícones de expandir/recolher deixam de existir |
| A4  | Modos de visualização                      | Mantém-se apenas a árvore de projetos + a linha do tempo                                                                                                                                                    |
| A5  | Área “tarefa”                              | Classificação das sessions não classificadas: `project_id IS NULL`, sem restringir o diretório vinculado; toda session tem workspace, e a criação global de tarefa cria por padrão `~/.zcode/workspace/<diretório único>` como cwd; sessions dentro de um projeto só podem ser arrastadas para outro projeto, nunca para fora de um projeto |
| A6  | Mesmo diretório real em vários projetos    | Permitido                                                                                                                                                                                                    |
| A7  | Session nova em projeto com 0 root         | Cria-se automaticamente `~/.zcode/workspace/<timestamp>`, que é adicionado como root do projeto e definido como diretório principal                                                                                |
| A8  | Diretório vinculado à session (cwd)        | Nunca muda após a criação                                                                                                                                                                                    |
| A9  | cwd de session nova dentro do projeto       | Fixo no diretório principal, sem opção de escolha                                                                                                                                                           |

### 3.2 Modelo de execução e configurações do lado do agent

| #   | Questão                                        | Decisão                                                                                     |
| --- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| B1  | Modelo de execução                             | cwd único (diretório vinculado à session) + os diretórios, entre os roots atuais do projeto, que não sejam esse cwd, como diretórios adicionais |
| B2  | O CLI conhece o projeto?                       | Não conhece, recebe apenas a lista de diretórios; o rascunho `multi-workspace.md` é cancelado e a estrutura de dados é redesenhada neste documento |
| B3  | AGENTS.md                                       | Lê apenas a cadeia do diretório vinculado à session                                       |
| B4  | skills / commands                               | Disponíveis em todos os roots; duplicatas coexistem com marcação de origem; o modelo também enxerga as skills de todos os roots |
| B5  | subagents                                       | Carregados de todos os roots; duplicatas coexistem com marcação de origem                  |
| B6  | MCP (mcp.servers em nível de projeto)           | Lê apenas a cadeia do diretório vinculado à session                                       |
| B7  | settings (model/permission/ui/storage)         | Lê apenas a cadeia do diretório vinculado à session                                       |
| B8  | hooks                                           | Na execução, roda apenas a cadeia do diretório vinculado à session; a exibição na página de settings e o trust seguem o workspace real |
| B9  | Configuração de plugins em nível de projeto    | Vale apenas pela cadeia do diretório vinculado à session; os demais roots são apenas escaneados e exibidos na página de settings |
| B10 | permissions ruleset                             | Pelo diretório vinculado à session                                                        |
| B11 | memory escrita pelo próprio agent              | Pelo diretório vinculado à session                                                        |
| B12 | Política de caminhos de ferramenta / sandbox    | Todos os roots são legíveis e graváveis                                                  |
| B13 | composer @arquivo                              | Todos os roots podem ser citados com @, e o nome do root é acrescentado à direita do nome do arquivo |
| B14 | Princípio de implementação                      | Mantém-se a cadeia de consumo de configuração do CLI por workingDirectory; os diretórios adicionais servem a skills, subagents e à faixa gravável, e no prompt de ambiente são listados apenas os caminhos |
| B15 | Momento de efeito da mudança de roots           | Vale na próxima reconstrução da instância de execução da sessão; subscribe comum, resubscribe e reconexão de rede não atualizam o alcance de diretórios da instância de execução (ver 4.3.1) |
| B16 | Marcar origem de skill com nome duplicado       | O CLI atribui um nome qualificado (`<rootName>/<skill>`), compartilhado entre prompt e UI |
| B17 | Origem dos diretórios adicionais                | O Host resolve os diretórios de forma unificada, cobrindo create / resume explícito / cold restore disparado por subscribe V4; tarefas comuns não guardam snapshot de diretórios da criação (ver 4.3.1) |
| B18 | Página de gerenciamento do agent / ociosidade programada | A troca de workspace do gerenciamento de capacidades do agent usa o workspace real; tarefas agendadas, tarefas ociosas e Bots usam projetos virtuais |

### 3.3 Lista e interação

| #   | Questão                       | Decisão                                                                                                                                                                                                        |
| --- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Fixar no topo                 | Mantém-se a área global de sessions fixadas; projetos também podem ser fixados, indo para a área global de fixados e abaixo das sessions; sessions remotas também podem ser fixadas |
| D2  | Arrastar                      | Arrastar session entre projetos, da área “tarefa” para um projeto e reordenar projetos; não há ordenação manual dentro do projeto nem arraste com multisseleção; quando o projeto de destino não contém o workspace real da session, exibe-se uma confirmação de inclusão |
| D3  | Entrada de nova tarefa        | A linha do projeto cria um rascunho no diretório principal daquele projeto; Cmd/Ctrl+N e o novo no canto superior esquerdo herdam o projeto da sessão ou rascunho atual, e sem projeto criam um rascunho não classificado em `~/.zcode/workspace/<diretório único>` criado automaticamente; o novo na seção de tarefas cria explicitamente um rascunho não classificado |
| D4  | Menu de contexto do projeto   | Editar projeto, fixar, excluir projeto; projetos remotos editáveis se comportam igual aos locais e não exibem “remover desta máquina” nem “adicionar projeto remoto”; “remover desta máquina” só aparece quando o projeto não é editável (offline / error, legacy de root único) (2026-10-16) |
| D5  | Controle remoto via Web / celular | Mostra a hierarquia de projetos                                                                                                                                                                                 |
| D6  | Group de split do workbench à direita | Não tem relação com esta rodada, não é tocado                                                                                                            |

Regras de criação e expansão na barra lateral em 2026-10-15:

- O botão de novo da seção de projetos e o da seção de tarefas alinham o canto direito com o botão de nova session da linha do projeto; o layout é compartilhado entre temas claro e escuro, desktop e celular.
- À esquerda do botão de novo da seção de projetos há “recolher todos os projetos / expandir todos os projetos”. Se houver algum projeto expansível expandido, recolhe-se tudo; caso contrário, expande-se tudo, incluindo os projetos fixados. Projetos offline continuam não expansíveis e não disparam conexão. O botão fica desabilitado quando não há projetos expansíveis.
- A operação em lote atualiza de uma só vez a preferência de expansão existente, indexada por Host + projectId, preservando o colapso, a ordenação e a sessão atual da própria seção, e mantendo o estado após a atualização.
- A atribuição de projeto da sessão atual vem do índice de tasks do Host, com busca exata por workspaceKey + taskId, sem adivinhar o projeto pelo cwd; o rascunho atual lê draftProjectId. Um projectId explícito (inclusive null) tem prioridade. Desktop e celular resolvem a intenção no mesmo ponto de entrada, e o celular ainda prepara os diretórios via bridge e faz a passagem; se, após a leitura assíncrona, a navegação tiver mudado, o resultado é descartado.

```text
atalho / novo no canto superior esquerdo → sessão ou rascunho atual → atribuição de projeto → Host prepareSession → rascunho
novo na seção de tarefas         → explicitamente sem projeto ────────────────┘
recolher tudo / expandir tudo    → preferência expanded existente → exibição nas linhas de projeto (sem navegação, sem conexão)
```

### 3.4 Criar / editar / excluir

| #   | Questão         | Decisão                                                                                                                                                                                                                                                                             |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E1  | Excluir projeto | Exclusão suave do contêiner: a linha do projeto é marcada como deleted, as sessions mantêm project_id e o banco do CLI não é afetado (mensagens e título intactos); a linha do tempo continua exibindo, permitindo abrir e arrastar para outros projetos; a exclusão de um projeto remoto offline remove apenas a entrada local (G5) e não executa esta exclusão suave remota |
| E1a | Restauração     | Entrada única: ao criar um projeto, se o conjunto de roots for exatamente igual ao de algum projeto já excluído do mesmo host (sem olhar ordem nem diretório principal), sugere-se restaurar; restaurar = deleted para 0 e atualização do nome / diretório principal conforme o preenchimento atual, e as sessions voltam como estavam; recusar cria um projeto vazio; readicionar a entrada de um projeto remoto removido desta máquina não conta como restauração de projeto remoto |
| E1b | Exclusão definitiva | Não existe; projetos excluídos suavemente são retidos permanentemente                                                                                                                                                                                                            |
| E2  | Remover root    | As sessions vinculadas a esse diretório permanecem no projeto                                                                                                                                                                                                                     |
| E3  | Confirmação em execução | Excluir projeto / remover root não exibe confirmação                                                                                                                                                                                                                       |
| E4  | Nome do projeto | Se não for editado manualmente, segue o nome do primeiro root (`name_overridden`); único dentro do mesmo host, nomes repetidos recebem um sufixo numérico; sem root e sem nome, chama-se “novo projeto”                                                                                                                                   |
| E5  | Validação de roots | Permite aninhamento pai-filho; remove duplicatas exatas; recusa adicionar diretórios inexistentes                                                                                                                                                                                                                    |

### 3.4.1 Projetos novos criados vêm primeiro (2026-09-15)

Projetos criados explicitamente, restaurados ou adicionados ficam em primeiro na área de exibição do controlador atual; locais e remotos são misturados de forma unificada. A chave de preferência é (hostId, projectId), e a posição é preservada em reconexão, atualização e renomeação. Fixados e área comum ficam separados, arrastar não altera o estado fixado e nada é gravado como position no lado remoto.

O único owner da ordenação é `projects.position` no repositório de projetos do Host. Na transação de criação existente, atribui-se `min(position) - 1` entre os projetos do mesmo Host, sendo 0 quando o Host não tem projetos; não se reordena histórico, não se ordena por tempo da UI em ordem inversa e não se dispara um reorder após a gravação. A falha sofre rollback na mesma transação; sob admission serial, uma criação submetida depois entra naturalmente à frente, e a leitura e o reinício reutilizam a ordem já persistida. Não há mudança de schema/migração, os repositórios local e remoto compartilham essa regra, e as identidades de workspace do desktop continuous, do celular replayable e dos limites de identidade permanecem inalteradas.

```text
salvar novo projeto → Host atribui atomicamente a position de primeira e grava → readTree → listas do desktop / Web / celular
arraste manual      → reorderProjects original → a mesma projects.position
```

PRO01 (accepted/pending): com projetos existentes, a criação de um novo projeto o coloca imediatamente em primeiro na barra lateral, e ele permanece em primeiro após a atualização; segue o caminho real de criação de `ui-shell/manual-review/pending/project-native-directory-picker.test.ts`. Os testes unitários do repositório cobrem banco vazio, criações consecutivas, criação após reordenação manual, preservação de ordem em edição/restauração e isolamento entre Hosts diferentes. Não se afirma, por meio de E2E local, que o transporte real para celular/remoto foi verificado.

Verificação de PRO01: `desktop-e2e-20260915130441227-p90013-a508c06fba08fa3a` 1/1 aprovado, com asserção da ordem real das linhas de projeto após a gravação e após a atualização; 8 arquivos de teste unitário relacionados / 54 casos aprovados, typecheck de root/E2E, lint (0 erros / 47 warnings preexistentes) e verificação de arquitetura relativa ao HEAD aprovados. A linha de base de staging padrão ainda tem o root resolver unmanaged-new-file preexistente ao início do trabalho; a cadeia real remota/de celular e a GUI em Windows/Linux não foram reexecutadas. Mantém-se como pending.

### 3.5 Propriedade dos dados

| #   | Questão                        | Decisão                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | Fonte única de dados           | Dois bancos coexistem, com atribuição única de cada campo: **os fatos da sessão pertencem ao CLI, o estado organizacional pertence ao Host**                                                                                                                                                                                |
| C2  | O CLI é o único escritor de db.sqlite | Existência e exclusão suave, title + title_source, time_created/updated, corpo, goal, fork, trace, last_outcome                                                                                                                                                                                                 |
| C3  | O Host é o único escritor do banco do app | `project_id`, pinned, archived, unread + CAS, `sort_order`, projetos / roots / hosts / agendamentos / ociosidade; esse estado organizacional existe só nas colunas originais, sem cópias. Os fatos do CLI ficam em colunas espelho `cli_*`, com o taskIndexSyncer como único escritor; o Host deixa de escrever qualquer tempo / status derivado. As colunas antigas `deleted` e `title_overridden+title` passam a significar, no novo design, a “intenção de exclusão / renomeação do Host”, a ser entregue ao CLI (ver 7.4) |
| C4  | Renomear offline               | Pelo comando renameSession do CLI, acionando o CLI se necessário; o espelho é atualizado só depois do sucesso                                                                                                                                                                                                |
| C5  | Arquivamento                   | Exclusivo do Host; o CLI remove a coluna morta `time_archived` (marcada como obsoleta por migration, sem remoção física)                                                                                                                                                                                  |
| C6  | Exclusão                      | Exclusão suave no CLI: nova coluna `time_deleted` e a semântica de deleteSession passa a ser exclusão; cold seed / listSessions / TUI filtram; a coluna `deleted` do app = intenção de exclusão do Host (oculta imediatamente e aguardando entrega), `cli_deleted` = já confirmado pelo CLI; a regra de exibição é `deleted OR cli_deleted`. A ausência em snapshot não equivale a exclusão: é preciso confirmar via `sessionsIndex/reconcile` (ver 5.2, 7.4) |
| C7  | Resultado de uma rodada       | O CLI ganha os campos `last_outcome` e summary; task_status do app passa a ser espelho                                                                                                                                                                                                                     |
| C8  | searchable_text               | Mantém-se como está                                                                                                                                                                                                                                                                                       |
| C9  | tasks-index e sessions-index    | Banco do app = conjunto de linhas + estado organizacional + espelho somente leitura dos fatos do CLI; sessions-index = fluxo ao vivo e autoritativo de atividade do CLI                                                                                                                                                              |
| C10 | Forma do banco do app          | Atualização no lugar do `tasks-index.sqlite` existente, com introduction de migrations versionadas                                                                                                                                                                                                           |
| C11 | Chave primária                 | A chave primária física permanece `(workspace_key, task_id)`; adiciona-se `UNIQUE(host_id, task_id)` como chave lógica; adiciona-se a tabela hosts                                                                                                                                                                   |
| C12 | Hash de diretório derivado     | Fica como está                                                                                                                                                                                                                                                                                           |
| C13 | Estado organizacional remoto   | O banco do app remoto guarda os dados autoritativos do conteúdo dos projetos, dos roots e da atribuição das sessions; a máquina local persiste o registro de conexão de hosts, a lista de entradas de projetos remotos adicionados e um cache de informações básicas como nome / roots / diretório principal. A lista de entradas pertence à máquina local e o cache não substitui o estado organizacional remoto; offline não é expansível, e a exclusão offline remove apenas a entrada e o cache locais (ver 4.2.1)     |
| C14 | Campos do projeto              | Nome, roots, diretório principal, fixado, ordenação, exclusão suave; sem cor / ícone / arquivamento / descrição                                                                                                                                                                                            |
| C15 | Ordenação de nível superior    | A área de projetos e a área de tarefas são independentes, sem mistura                                                                                                                                                                                                                                        |

### 3.6 Compatibilidade e migração

| #   | Questão                                                                                | Decisão                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | Disciplina de reversão                                                                 | Nos dois bancos só se adiciona, não se remove e não se muda a semântica das colunas antigas; o estado organizacional do Host (`pinned/archived/unread/title_overridden+title/deleted`) existe apenas nas colunas originais, sem cópia; os fatos do CLI ficam em colunas espelho `cli_*`; a cada inicialização faz-se a conciliação de tabela inteira entre “intenção da coluna antiga” e “espelho” (ver 7.4), e não apenas o preenchimento de NULL; `schema.baseline.sql` + CI só acumulam diff; o e2e cobre upgrade→downgrade (inclusive modificando linhas existentes)→upgrade novamente                                                                                                                                                                                                                                                           |
| F2  | Saída da compatibilidade                                                               | Três fases, sem carregar lastro permanentemente: V1 **lê apenas das novas colunas/novas tabelas**, e as colunas antigas são apenas escritas, nunca lidas (a escrita dupla serve só para versões anteriores a V1); V2 grava `schema_floor=V1`, recusa abrir abaixo do floor, interrompe a escrita dupla, a escrita de volta de derivados do setting.json e o preenchimento de NULL, e o upsert passa a usar `ON CONFLICT(host_id, task_id)`; V3 remove fisicamente as colunas antigas, as quatro tabelas antigas de group e o `time_archived` do CLI, reconstruindo a chave primária (host_id, task_id). O downgrade V2→V1 e V3→V2 continua plenamente utilizável                                                                                                                                                                                                                                  |
| F3  | Primeira colocação de session sem atribuição (resíduo da primeira migração, criadas durante o período de downgrade, sessions recém-descobertas pelo CLI etc.) | A decisão é tomada uma única vez, apenas na primeira migração ou no primeiro despertar: se o diretório vinculado for exatamente o root de um único projeto não excluído do mesmo host → é atribuído a ele; se casar com zero ou mais de um projeto → mantém `project_id = NULL` e aparece na área de tarefas. Não se escolhe projeto pelo diretório principal, não se cria projeto automaticamente e não se altera o cwd. A criação global de tarefa mantém explicitamente a condição não classificada; um NULL já decidido é um estado organizacional legítimo, e inicializações, conciliações ou novos projetos posteriores não reposicionam automaticamente                                                                                                                                                                              |
| F4  | Criação/alteração/exclusão de group durante o período de downgrade | Ignorada; group→projeto ocorre apenas uma vez, na primeira migração de upgrade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| F5  | setting.json                                                                            | Continua gravando lastWorkspaceSession / recentProjects em ambos os lados; as entradas remotas são derivadas das entradas de projetos remotos que ainda existem localmente, e ao remover uma entrada os antigos itens correspondentes são limpos; não se regenera a lista a partir da lista completa de projetos remotos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| F6  | Ponto de execução                                                                       | Executado de forma síncrona depois do `whenReady` do main e antes de subir o Host; em caso de falha, fail-closed (tentativa de novo / abertura do diretório de backup), sem uma segunda implementação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| F7  | Backup                                                                                  | Posicionamento: garante apenas a recuperação para o estado anterior ao upgrade quando “a migração falha / a migração estraga o banco”, não serve como mecanismo de reversão nem como seguro geral de dados; no fluxo normal, apenas produz e não consome. Método: backup genérico por tabela (ver 7.1); somente quando há migrations pendentes e antes da transação, exporta-se tabela a tabela os `touchedTables` declarados por essas migrations, dentro de uma mesma transação de leitura, para `~/.zcode/backup/<versão>-<horário>/<nome-do-banco>.sqlite`, grava-se backup.json e mantêm-se 2 cópias; não se faz snapshot do banco inteiro (medição local: banco inteiro 770MB/12s, gzip 160MB/19s; por tabela CLI 1.9MB/70ms, tasks-index 14MB/165ms). Se o volume atual não tiver espaço, tenta-se cada um dos outros volumes graváveis; se nenhum servir, o passo é pulado com um aviso, e nenhum rastro é apagado                                                                                                                                                                                                        |
| F8  | Workspaces antigos                                                                      | Local e remoto mantêm, cada um, apenas o projeto de root único derivado dos workspaces antigos preservados no lastWorkspaceSession, com todas as sessions abaixo dele atribuídas; diretórios que existem apenas em tasks históricos ou em recentProjects não geram projeto, e suas tarefas mantêm o cwd e o estado organizacional originais, permanecendo não classificadas quando não há projeto correspondente; as entradas remote do lastWorkspaceSession local são importadas, apenas na primeira migração, para as entradas locais de projetos remotos e para o cache de informações básicas, sem criar no local o projeto autoritativo remoto. Exceção remota (2026-10-15): quando o owner do banco detentor não é `local`, a primeira migração cria também, a partir dos roots de tarefas históricas que ainda tenham tarefas não excluídas, não estejam no diretório de sistema `*/.zcode/workspace/*` e não estejam marcados como conversation nos settings, um projeto de root único com o mesmo nome, atribuindo-lhe essas tarefas; projetos remotos só entram na barra lateral do desktop pela entrada local, e não se espera que entradas removidas sejam ressuscitadas                    |
| F9  | Groups criados manualmente                                                               | Só são migrados os groups criados manualmente que contenham sessions não excluídas (membros arquivados contam como válidos); groups vazios, pendentes ou com apenas membros já excluídos são ignorados; roots = diretórios dos membros válidos deduplicados, principal = o diretório com mais membros; o nome é mantido e marcado como name_overridden; a cor é descartada                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| F10 | Groups com hosts misturados                                                              | São divididos em vários projetos por host, com o nome do host como sufixo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| F11 | Groups de sistema (agendados / ociosos)                                                    | Não são convertidos em projetos; os membros vão para o projeto de seu workspace, preservando os ícones de cron / off-peak                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| F12 | Arquivamento automático                                                                  | O arquivamento forçado de 7 dias do bootstrap sai junto com a descontinuação da visão Group. O arquivamento automático da página de settings (`taskAutoArchiveEnabled` / `taskAutoArchiveOlderThanDays`) deve continuar valendo: o gatilho é a varredura periódica do Host (primeira rodada após o serviço iniciar, depois a cada hora e varredura complementar imediata quando as duas chaves de arquivamento automático mudam; decisão de 2026-09-14, ver o fim do documento), e não fica preso à consulta da árvore de projetos nem a qualquer ação de UI; o escopo = todos os roots de projetos do host atual e os diretórios vinculados às sessions da área de tarefas (deduplicados, incluindo cwds fora do diretório padrão; no remoto, executado no host remoto), e o critério (decisão de 2026-09-15) é puramente temporal: `cli_updated_at` anterior a N dias implica arquivamento; só ficam de fora as sessions fixadas e as sessões em execução observadas pelo syncer, e não se olha mais completed / error / não lidas                                                                            |
| F13 | Pré-aquecimento na inicialização                                                          | Pré-aquece-se apenas o diretório da última atividade                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

#### Correção da visibilidade de sessões do backend de execução antigo (2026-10-15)

A árvore de projetos e a lista de tarefas existente / o Controller usam a mesma regra de admissão do backend de execução: só são lidas as tarefas com `tasks.provider = ZCODE_AGENT_PROVIDER` (atualmente `glm`). Essa coluna é o backend de execução, não o fornecedor do modelo; sessões recém-importadas para o CLI atual continuam sendo preservadas e não podem ser filtradas por `migration_source` nem por título. Projeto, fixados, não classificadas, linha do tempo, arquivamento e exibição de não lidas consomem todos essa árvore de projetos do Host, e no remoto a mesma leitura é executada no Host de destino.

Causa raiz: depois que a migração preencheu `cli_*` para as linhas antigas, o repositório de projetos deixou de aplicar o filtro de provider da lista antiga, tornando visíveis as linhas do backend antigo, que a lista do Controller não encontrava antes de operar. A correção apenas fecha o caminho de leitura, não apaga linhas antigas, não reescreve provider/tempo/estado organizacional e não altera migrations/checksum já publicados; o efeito é imediato também em bancos que já têm ledger de migração. Não se oculta histórico normal com base na existência do diretório ou na abertura de uma aba.

```text
primeira migração / banco já migrado -> Host lê pelo backend de execução atual -> árvore de projetos compartilhada entre desktop e celular
                                      -> mesma admissão da lista de tarefas original -> operações de task do Controller
```

Complemento de aceitação VP28: linhas comuns, fixadas e arquivadas do backend antigo são invisíveis, e as linhas originais do banco são preservadas; sessões normais do CLI e sessões recém-importadas são visíveis e podem ser desafixadas e desarquivadas. Cobre a primeira atualização, o ledger existente e os owners local e remoto; uma fixture sem requisições de modelo não representa a execução real de um CLI antigo.

### 3.7 Remoto e capacidades relacionadas

| #   | Questão                        | Decisão                                                                                                                                                                                                                                                |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1  | Bancos remotos antigos         | Na atualização do server bundle remoto roda-se o mesmo conjunto de migrations; quando a máquina local nova se conecta a um remoto antigo, exibe-se em modo de compatibilidade, conforme o protocolo antigo, como projeto de root único                                                                                              |
| G2  | Remote com root único          | Na criação é obrigatório escolher um diretório válido, e ele é fixo depois de criado; no local ainda são permitidos de 0..n roots                                                                                                                     |
| G3  | Conexão automática              | Conecta-se automaticamente a todos os hosts salvos; após a conexão bem-sucedida, apenas se atualizam as entradas locais de projetos remotos adicionados, sem importar automaticamente todos os projetos remotos e sem readicionar projetos removidos da máquina local                                                             |
| G4  | Limite                         | Limite de 20 hosts remotos                                                                                                                                                                                                                             |
| G5  | Operações em estado offline / error | Projetos virtuais remotos não são expansíveis, não podem ser renomeados nem ter roots ou diretório principal editados, e as operações de projeto só permitem excluir a entrada e o cache salvos localmente; preservam-se o projeto remoto, os roots e as sessões, e não se cria operação de exclusão pendente de sincronização. No nível de conexão ainda são permitidos reconectar e excluir o registro de conexão do host local; excluir o host remove junto as entradas locais de seus projetos, sem apagar os dados remotos |
| G6  | Readicionar projeto remoto     | Depois que o usuário se conecta ativamente e escolhe um projeto já existente no remoto, a entrada local é recriada e as informações mais recentes são lidas; o acesso ao projeto original e às suas sessions continua. Após criar um projeto remoto com sucesso, a entrada também é adicionada explicitamente; reconexões ou atualizações comuns não executam a adição                          |
| H1  | Agendados / ociosos / Bots     | Ligados a projetos virtuais; na criação, o diretório principal vira o cwd e os demais roots viram diretórios adicionais, e isso é fixo                                                                                                                |
| H2  | Diretório de configuração do agent na página de settings | Todos os roots de todos os projetos, deduplicados e achatados                                                                                                                                |
| H3  | Menções # no composer          | Agrupadas por projeto                                                                                                                                                                                                                                 |
| H4  | Busca global                   | Mantém-se como está                                                                                                                                                                                                                                   |
| H5  | Bridge key do controle remoto pelo celular | Mantém-se o workspaceKey                                                                                                                                                                                                                |
| I1  | Lançamento                     | Dividido em MRs, publicado na mesma versão                                                                                                                                                                                                           |
| I2  | E2E                            | CRUD de projetos, arraste e recusa, upgrade/downgrade e backup, restauração com múltiplos diretórios de 4.3.2, arquivamento automático valendo na árvore de projetos; a atribuição na área de tarefas e a primeira colocação cobrem os cenários de aceitação de 6.1; o gerenciamento de entradas remotas offline cobre os cenários de aceitação de 6.2                                                  |

## 4. Arquitetura-alvo

G1 escolhe o adaptador conforme a capacidade `virtualProjects` do handshake, sem depender da existência de um RPC proxy e sem tratar erro de leitura da versão nova como se fosse versão antiga. A lista de projetos do Server antigo é projetada, a partir dos seus antigos settings, como um contêiner de root único somente leitura com ID estável, derivado de diretórios locais; as linhas de tarefas continuam lendo o índice `app` remoto; as tarefas do diretório `conversation` permanecem não categorizadas. A versão antiga só suporta criar/restaurar sessão dentro de projetos válidos de diretório único, com os diretórios adicionais fixados em vazio; não exibe capacidades de edição de projeto, fixar, ordenação, movimentação ou criação de múltiplos roots, nem armazena essas operações em cache localmente. Comandos normais de tarefa continuam passando pelo owner remoto existente.

O ID da entrada antiga de root único usa o prefixo explícito `legacy-single-root`, apenas como identificador do adaptador de leitura; após a atualização do Server, o root único da entrada retida corresponde de forma única ao projeto real e o ID é trocado pelo ID real via CAS sobre o ID/versão original da entry. Correspondências zero ou múltiplas permanecem não resolvidas, com escolha explícita do usuário; respostas tardias ainda não podem adicionar entradas. A máquina local não cria linhas de projeto autoritativas remotas.

O Server antigo nem sempre salva o registro de diretório aberto pelo Controller; os candidatos de diretório do adaptador aceitam simultaneamente os roots/o antigo cwd das entradas que ainda restam localmente. Essa entrada é apenas informação de endereçamento para a consulta do protocolo antigo: não cria projeto autoritativo remoto ou local e não reconstrói entradas a partir de settings/history já removidos.

Aplica-se à mesma conexão física e ao mesmo logical attachment:

```text
server handshake → virtualProjects=true  → remote project RPC
                 → absent/false         → single-root read adapter
retained entry + request version → remote read → CAS refresh retained entry
```

### 4.1 Modelo conceitual

```text
Host（máquina física）  local | remote:ssh:<host>:<port>:<user> | remote:wsl:<distro>[:<user>] | remote:docker:<c> | remote:server:<id>
 ├─ Project（local 0..n roots; remoto exatamente um root fixo）
 │    ├─ roots[]: {root_path, position, is_primary}
 │    ├─ name(+name_overridden) / position / pinned / deleted
 │    └─ sessions[]（project_id com atribuição única）
 └─ Área de Tarefas（「任务」）: sessão com project_id vazio, sem restrição de root_path

Session
 ├─ Diretório vinculado root_path（= CLI directory, nunca muda）  ├─ host_id  ├─ project_id?（anulável）
 ├─ Estado organizacional do Host: pinned / archived / unread_at / sort_order
 └─ Espelho dos fatos do CLI: cli_title / cli_title_source / cli_updated_at / cli_created_at / cli_last_outcome / cli_deleted
```

A partição comum é determinada pela atribuição de projeto; fixar, arquivar e a exclusão de sessão continuam filtrando pelas respectivas regras. `~/.zcode/workspace/*` é o diretório de execução padrão para criação global de novas tarefas, não um critério de filtro da área de tarefas.

```text
Session（cwd nunca muda）
  |
  +-- project_id aponta para um projeto normal --> área de projetos
  |
  +-- project_id = NULL ------> área de tarefas（qualquer cwd）
  |
  +-- project_id aponta para um projeto excluído -> linha do tempo（segue E1, preserva a atribuição）
```

### 4.2 Processos e fluxo de dados

```text
CLI（um processo por workspace, pode estar offline）          Host（um processo por janela）                     Renderer
────────────────────────────────                         ─────────────────────────                     ────────
db.sqlite  ── sessions-index / conversation snapshot ──►  taskIndexSyncer ──escreve colunas cli_*──► tasks-index.sqlite ──► useProjectTree()
  ▲                                                        ▲                                       ▲               （uma consulta: projects ⨝ tasks,
  │ renameSession / deleteSession / createSession           │ pin / archive / read / move / project CRUD │                sobrepõe campos em tempo real de sessions-index）
  └──────────── Host escreve fatos da sessão via comando v4 ◄──── Host escreve diretamente o estado organizacional ◄────────────┘
Proibido: CLI escreve na app lib; Host escreve em db.sqlite; Host escreve Date.now() ou valores derivados nas colunas cli_*.
```

#### 4.2.1 Entradas locais de projeto remoto e estado organizacional remoto

A máquina local guarda a "lista de projetos virtuais remotos que o usuário adicionou", usada para exibição no painel lateral; `hosts` guarda o alvo de conexão e as informações necessárias para reconectar. O nome, os roots e o diretório principal nas entradas de projeto são o cache da última leitura bem-sucedida, usados apenas para exibição offline e localização. O conteúdo dos projetos, a atribuição de tarefas e os diretórios de execução continuam sendo fornecidos de forma autoritativa pela app lib do Host remoto; o cache local não pode ser usado para executar edição de projeto remoto ou restauração de tarefas.

```text
registros de hosts locais ------------> reconectar o host indicado
                                                |
entradas locais de projetos remotos               v
  |                                  ler os projetos remotos dessas entradas
  +-- offline: mostra o cache, não expande       |
  |                                             v
  +-- excluir: remove a entrada e o cache local <- só atualiza o cache das entradas que ainda existem
                                                |
                        não insere nem restaura entradas removidas

projeto remoto / roots / atribuição de sessão: a exclusão local offline não altera esses dados
```

- O serviço de projetos local oferece uma operação explícita de remoção de entrada; ela não chama a soft delete de projetos remotos, a exclusão de sessão nem o encerramento de tarefas, e não escreve fila de exclusões pendentes de sincronização. Essa operação é separada da exclusão online de projetos autoritativos (E1); quando a exclusão online falha por desconexão, não se pode alternar automaticamente para a remoção local e reportar sucesso.
- A atualização de reconexão só atualiza o cache das entradas que ainda existem, sem usar upsert incondicional. Se o usuário remover a entrada após o envio da requisição, a resposta tardia também não pode reinseri-la; a escrita de volta em `setting.json` parte da lista de entradas já confirmadas localmente.

Fronteira de escrita de F5: `lastWorkspaceSession` / `recentProjects` / `lastActiveTabIndex` são derivados pelo Host, dentro do lock do arquivo de settings, a partir de projects/roots já confirmados e de `remote_project_entries` locais; o catálogo remoto completo, a lista de tabs e as respostas de reconexão não têm autoridade para escrever o conjunto de entradas. Campos antigos servem apenas para degradação; o startup da nova versão restaura somente o novo `lastActiveWorkspace` (anulável), e a lista de projetos é lida direto do SQLite. Esse campo expressa apenas o diretório de execução da última atividade: não cria projeto nem membro de conexão; na primeira atualização pode-se retirar uma única escolha do active index antigo, sem reler o campo antigo depois. A seleção remota ainda precisa ter um membro de conexão local; o diretório de um projeto comum ainda precisa pertencer a uma entrada de projeto retida, e o diretório `conversation` exige apenas que o membro de conexão ainda exista. Limpar a seleção usa null explícito, para evitar que o campo antigo a preencha de novo.

O lock de arquivo da atualização de settings cobre o fluxo completo "reler a configuração mais recente → aplicar o patch → derivar do SQLite → substituir atomicamente", e não apenas o rename; Hosts de várias janelas na mesma máquina não podem sobrescrever campos alheios a partir de snapshots antigos. A porta derivada lê apenas o banco local, sem chamar settings, gerenciador de conexões ou rede, evitando recursão e handshake dentro do lock. Após o commit de uma mutação de projeto/entrada, aguarda-se a derivação compatível antes do broadcast; se a escrita compatível falhar, o commit do SQLite continua válido, o erro é retornado explicitamente e a próxima leitura/atualização tenta a derivação de novo. Não há fila de exclusão remota. O canal de sessão e o owner do desktop continuous e do mobile replayable permanecem inalterados.

A seleção de diretório no startup do main, a restauração no Renderer e o pré-aquecimento do rascunho usam o cwd já vinculado ao `lastActiveWorkspace`. O cwd de conversation independente da nova versão não aplica mais a regra antiga de "normalizar para default"; o ponto de entrada em branco padrão só é preparado quando não há seleção ativa.

Quando o diretório principal do projeto fica inválido, o título no painel lateral é esmaecido, mas o histórico continua expansível, e as entradas de criar e de ver arquivos são desabilitadas; o estado é derivado em tempo real pelo Host de origem, e a entrada de edição é mantida. Os limites de comportamento, atualização e revalidação na criação estão em [disponibilidade do diretório principal do projeto](../../project-primary-root-availability.md).

```text
project / retained-entry mutation → SQLite commit → settings file lock
                                                    ├─ latest settings + latest catalog
                                                    └─ legacy projection → atomic replace → broadcast
renderer activation → lastActiveWorkspace ───────────┘
```

- A lista remota completa de projetos é usada apenas quando o usuário escolhe ativamente adicionar um projeto; projetos novos no remoto ou nomes/roots remotos idênticos ao cache não são critério para adicionar automaticamente uma entrada local. Remover uma entrada não remove o host nem as outras entradas do mesmo host, e remover a última entrada também não impede que o usuário reconecte depois e adicione manualmente.
- A remoção local de uma entrada não dispara a soft delete nem a lógica de restauração remotas de E1/E1a. Quando o usuário adicionar de novo o mesmo projeto remoto, usa-se o ID de projeto original, lendo o conteúdo e as sessões existentes.

Todas as conexões físicas salvas podem entrar no lote de reconexão existente no startup, sem descarte por tempo de último acesso online; continuam sendo respeitados `remoteStartupAutoReconnectEnabled=false` e a exigência de credenciais silenciosas, e nenhum Agent é criado para expandir projetos. O gate independente de tabs na lógica de restauração do workspace history antigo não altera esta elegibilidade de conexão física.

A relação de membro de conexão é separada do estado de execução da conexão: o `remote-projects` local é o único escritor de quais Hosts/entrada de projeto físicos estão salvos; o Source Directory existente continua sendo dono do roteamento de Profile e das referências a credenciais, e o ConnectionManager continua sendo dono das instâncias de conexão e das retentativas. Uma conexão nova ou readicionada explicitamente recebe um `hosts.membership_id` imutável; o handshake só pode, com base no membership ID do início, mesclar um Host de endereço antigo em um Source Host estável. Remover e readicionar gera um novo membership ID, e um handshake antigo não pode reviver nem religar a nova entrada. A mesclagem e o ajuste do host_id da entrada ocorrem na mesma transação da app lib; o projeto autoritativo remoto não é movido e o índice de tarefas não é copiado. Uma troca de identidade em um Source estável conhecido continua passando pela confirmação explícita existente, sem migrar as entradas de projeto do Source antigo para outra máquina.

```text
salvar explicitamente → Host membership ID → conexão/handshake do ConnectionManager existente
                              → comparar o membership ID → mesclar no Source ID estável
remover a conexão → apagar o membership + as entradas locais
handshake tardio → membership não corresponde → descartar, não pode fazer INSERT
```

O ConnectionManager obtém a instância membro por uma porta injetada antes do probe, e confirma o vínculo após a confirmação do handshake e antes de publicar `online`; em caso de rejeição, a conexão desta tentativa é liberada. Uma conexão explícita do usuário pode adicionar membros; a reconexão automática no startup e por falha só pode manter membros já existentes, sem ressalvar. Quando o usuário confirma a troca de identidade de um Source, é criada uma nova entrada de conexão de Source independente, desde que o membro antigo ainda seja válido; o Source antigo e suas entradas permanecem no lugar, e o novo Source calcula a capacidade separadamente. Essa verificação de condição e a escrita acontecem na mesma transação.

O `connectHost` do serviço local de entradas é uma entrada estreita de reconexão do conector existente, válida apenas para membros ainda retidos; sua porta de montagem usa a admission de retenção, sem salvar novos membros nem entradas. O estado de conexão é lido do ConnectionManager e anexado ao resultado de `readDirectory`, sem ir para o SQLite e sem criar outra máquina de estados. Quando o serviço no scope atual não suporta gerenciamento de conexões, a operação é explicitamente recusada.

A conexão física do URL Server continua sendo mantida exclusivamente pelo WindowRemoteConnectionRegistry. A consulta de projetos e a reconexão no startup passam pela entrada de conexão de Host do Registry, sem criar logical session nem Agent; o workspace attachment só é criado ao abrir o diretório de execução, reutilizando a mesma conexão física. O Registry oferece enumeração somente leitura da conexão atual e consulta de Source estável, sem novo armazenamento de estado de conexão. SSH/WSL/Docker continuam sendo mantidos pelo SourceManager original.

A partir do handshake de URL, salvar/obter o Host membership; o token vai apenas para o CredentialService, e `hosts` guarda apenas a credential key. A reconexão automática lê somente membros e credenciais já existentes; handshakes antigos de membros removidos/readicionados devem perder a validade. Quando o serverId do URL é desconhecido, a identidade de endereço pode ser vinculada a um Source estável após o primeiro handshake, e a vinculação fixa também `target.serverId`; um serverId existente que mude gera erro explícito, sem migrar projetos antigos. Uma falha de conexão libera sockets ainda não publicados; requisições concorrentes para a mesma URL/Source estável reutilizam o owner do Registry. Remover um membro não encerra tarefas existentes, mas proíbe novas conexões de diretório/projeto e a reconexão automática. O desktop continuous e o mobile replayable continuam passando pelo mesmo workspace owner existente.

```text
saved URL member → credential lookup → Registry physical connection → membership CAS
                                                       ├─ project read (no logical session)
                                                       └─ workspace attachment → existing task owner
```

A lista de conexões remotas enumera apenas os registros `hosts` locais que têm alvo de conexão utilizável; o placeholder de identidade com `target_json=NULL`, necessário para a sombra de tarefas históricas, não significa que o usuário salvou uma conexão, não é exibido e não ocupa uma das 20 vagas de conexão. A atualização de cache sempre avança a versão de compare-and-swap, e não emite broadcast de mudança de projeto quando o conteúdo não mudou, evitando o ciclo de feedback read → refresh → broadcast → read.

A entrada antiga de workspace da migração só resolve o ID de projeto quando o mesmo Host tem um único projeto que contém o antigo cwd; correspondências zero ou múltiplas mantêm a entrada aguardando escolha. Quando múltiplos antigos cwd resolvem para o mesmo projeto, mantém-se o ID da entrada já resolvida e removem-se as entradas antigas duplicadas; essa deduplicação e a atualização CAS ocorrem na mesma transação. O painel lateral agrega apenas os projetos e as tarefas remotos das entradas retidas localmente; tarefas não categorizadas sob um Host salvo entram na área de tarefas, e o histórico de projetos com soft delete continua entrando na linha do tempo. Offline, o índice de tarefas remoto não é exibido nem cacheado.

Para o Web/cliente que acessa diretamente o owner remoto, o projectService devolve a árvore autoritativa daquele owner, e a consulta de entradas `remote-projects` devolve um diretório vazio; não se pode forjar a tabela de membros do Controller, e os comandos de escrita de entradas são recusados. A consulta de Controller da janela desktop continua usando o base attachment local, separada do serviço remoto com escopo de workspace.

### 4.3 Interface com a CLI (incremento B14)

Diretórios adicionais são as outras pastas do projeto, além do diretório de trabalho padrão da sessão, usadas em conjunto por aquela tarefa. Por exemplo, se o projeto contém os diretórios de frontend e backend, e a tarefa está vinculada ao diretório de frontend, o backend é o diretório adicional. Tanto a criação de tarefa quanto a abertura de tarefa histórica após o restart devem carregar integralmente as capacidades fornecidas pelos diretórios correspondentes.

```text
createSession / resume explícito / v4/conversation/subscribe 参数新增（可选）
  additionalDirectories: string[]        // lista de diretórios resolvida pelo Host; caminho absoluto local ou caminho real remoto
                                        // consumida apenas ao inicializar a instância de execução; o live subscribe não atualiza o escopo de diretórios
Pontos de consumo na CLI
  1. skillPort.discoverSkills/loadSkill(roots?)  → acrescentar <dir>/.zcode/skills、<dir>/.agents/skills、<dir>/.zcode/commands para cada diretório adicional
                                                   skill.qualifiedName vinda do diretório adicional = `${basename(dir)}/${name}`; as listas de prompt e mention usam qualifiedName
  2. subagents roots                             → acrescentar <dir>/.zcode/agents; nomes iguais coexistem, qualifiedName idem
  3. tool path policy                            → mesclar additionalDirectories às raízes graváveis e legíveis
  4. prompt de ambiente                          → listar Additional directories depois do diretório principal, apenas caminhos; lista vazia não é impressa
Sem mudança: AGENTS.md、config(settings/mcp/hooks/plugins)、memory、permissions ainda são resolvidos apenas por workingDirectory.
```

O prompt de ambiente usa o `additionalDirectories` recebido na inicialização da instância de execução desta rodada, preservando os caminhos item a item, sem varrer o conteúdo dos diretórios adicionais e sem acrescentar explicações de permissão. Essa lista é apenas repassada ao ContextBuilder pela configuração do Runtime, sem gravar no snapshot de ambiente e sem criar campos persistentes novos; mudanças de diretório continuam valendo conforme 4.3.1, na reconstrução da instância de execução.

#### 4.3.1 Origem dos diretórios e momento de efeito

Sequência de criação: a UI envia apenas o `projectId` selecionado (NULL explícito na criação global); o Host atribui um session ID estável conforme o ID idempotente do comando de criação, reserva a atribuição e lê os diretórios na mesma transação do app, e só então envia create/firstInput ao CLI. A linha reservada tem `cli_created_at` vazio e fica oculta em todas as listas até o CLI publicar os fatos persistentes da sessão. Um create repetido não sobrescreve uma atribuição que já foi movida; uma falha não fabrica fatos de sessão. O CLI não recebe ID de projeto, apenas session ID e `additionalDirectories`, e recusa sobrescrever instâncias de execução ou sessões persistentes já existentes; novas tentativas de comando continuam deduplicadas pelo CommandInbox.

```text
selecionar o projeto → o Host reserva a atribuição da sessão + lê os roots (transação)
                         ↓
         deduplicação pelo CLI CommandInbox → criar o runtime → primeira entrada → fatos persistentes
                         ↓
                  visível na lista após o espelho no Host
```

A única fonte persistente da atribuição de projeto e dos roots continua sendo a app lib do Host. O serviço de projetos do Host oferece uma lógica unificada de resolução de diretórios, reutilizada pelas entradas de criação, restauração explícita e restauração fria V4; o CLI recebe apenas a lista de diretórios, não lê a app lib, não entende `project_id` e não ganha cópia persistente de roots para tarefas comuns nem protocolo de sincronização de diretórios. O novo Host passa explicitamente o array (incluindo `[]`) após a resolução bem-sucedida; o campo é opcional apenas por compatibilidade com chamadas antigas, e omitir o argumento não pode mascarar uma falha de consulta.

- Nova tarefa comum: o Host usa o projeto selecionado e validado nesta rodada; restauração de tarefa comum: consulta o `project_id` explícito da tarefa por workspaceKey + taskId e então lê os roots atuais do projeto. Não é possível adivinhar o projeto pelo cwd, porque o mesmo diretório real pode pertencer a vários projetos. A atribuição da tarefa e os roots de uma mesma leitura precisam vir do mesmo snapshot de leitura do banco.
- `additionalDirectories = roots atuais do projeto, deduplicados, excluindo o cwd fixo da sessão`. Exclui-se o diretório vinculado à sessão, não o diretório principal atual do projeto; trocar o diretório principal ou remover o cwd original do projeto não altera o cwd das tarefas históricas. A normalização de caminhos e a deduplicação seguem as regras de caminho da plataforma do Host em questão.
- Tarefas não categorizadas usam explicitamente `[]`; projetos com soft delete mantêm atribuição e roots, e as tarefas históricas reutilizam esses roots na restauração. Os três casos de ausência são tratados separadamente: a app lib não tem a linha da task (criação pelo TUI, sessions-index chegando antes do seed) é tratada como não categorizada e envia `[]`; a linha existe mas `project_id` aponta para um projeto inexistente gera erro explícito; falha de leitura da app lib gera erro explícito. Os erros precisam borbulhar até a UI (mensagem de erro + retry), e não podem ser tratados como `[]` para iniciar uma instância de execução incompleta, nem falhar silenciosamente.
- Tarefas agendadas, tarefas de ociosidade e Bots seguem H1: o Host fornece o cwd e os diretórios adicionais a partir da configuração fixada quando a capacidade foi criada, e também não busca os roots atuais do projeto na restauração. A reserva de atribuição de uma nova sessão grava, na mesma transação, um snapshot imutável em `tasks.execution_directories` (TEXT JSON anulável); uma sessão comum fica com NULL e continua sendo resolvida a partir dos roots atuais do projeto. Esse snapshot pertence à configuração de inicialização da sessão gerada, e seu único escritor é a reserva de criação do Host; excluir a definição de agendamento/Bot ou repetir a reserva não pode limpá-lo nem sobrescrevê-lo, e as três entradas de restauração de tarefas históricas abertas manualmente também o leem. Ele não é uma cópia sincronizada dos roots de um projeto comum. A definição de vínculo dentro da sessão continua usando a sessão existente, sem transformar a sessão de trabalho em diretório permanentemente congelado.
- O CLI usa a lista recebida apenas ao criar ou realmente reconstruir a instância de execução da sessão, como parâmetro fixo de inicialização desta rodada. Quando a instância de execução já existe, os caminhos de reuso de assinatura normal, ressubscrição, reconexão do celular e resume explícito não atualizam os diretórios; o efeito de edição de projeto ou movimentação de tarefa entra em vigor na próxima reconstrução. Múltiplas assinaturas restaurando a mesma sessão em paralelo reutilizam o READY / cold-resume single-flight existente; esta restauração adota uma lista de diretórios determinada, e as assinaturas seguintes não a mesclam nem sobrescrevem.
- Tarefas remotas são resolvidas pelo Host remoto que possui os dados organizacionais do projeto e passam os caminhos reais remotos; `workspaceIdentity`, `remoteSessionId` e o `clientMode` confiável continuam passando pela cadeia de attachment existente. O desktop mantém desktop-continuous, o celular mantém web-remote-replayable, e ambos compartilham a instância de execução de sessão original.

```text
app lib do Host: atribuição da tarefa + roots atuais do projeto (única origem de configuração)
                         |
                o Host resolve a lista de diretórios de forma unificada
                         |
          +--------------+-------------------+
          |              |                   |
       create        resume explícito   V4 subscribe
          |              |                   |
          +--------------+-------------------+
                         |
               a CLI já tem uma instância de execução?
                 /                 \
              não                  sim
               |                    |
      inicializa uma vez com a lista   reutiliza a instância e o escopo de diretórios
               |
     o escopo de diretórios é fixo durante esta execução
```

Ponto de implementação: chamar a mesma lógica de resolução de diretórios no `subscribeConversationV4` do Host antes de enviar a requisição; pode-se reaproveitar o caminho de passagem de parâmetros já existente de `resumeThoughtLevel`, mas erros na consulta de diretórios não podem ser engolidos silenciosamente. Atualizar em sincronia o schema de create/resume em `packages/shared/src/zcode-protocol/index.ts` e o schema de subscribe em `packages/shared/src/zcode-protocol-v4/transport.ts`; atravessar `additionalDirectories` por Gateway → `ColdSessionResumeCoordinator` → `resumePersistedSession` → `activateSessionForResume`, entregando-o aos pontos de consumo de capacidades e do prompt de ambiente antes da construção da instância de execução. O Host injeta a capacidade de resolução por interface de serviço; o Renderer não é responsável por montar a lista de diretórios.

Complemento de implementação (2026-09-10): consultas como `rowsRange` / `search` também podem disparar a restauração fria antes do subscribe. Esse caminho reutiliza a requisição de materialização de runtime já existente (`session/requestRuntimePreferences`), obtendo `additionalDirectories` pela mesma interface de resolução de diretórios do Host; não se cria outro cache de diretórios nem outro protocolo de sincronização. Os arrays de create/resume/subscribe explícitos continuam sendo usados apenas na inicialização de uma nova instância; uma falha de consulta do Host precisa recusar a inicialização. Essa requisição inversa já é coberta pelo READY single-flight, de modo que, quando consulta e assinatura disputam, o snapshot de diretórios é lido apenas uma vez.

#### 4.3.2 Aceitação de restauração local com múltiplos diretórios

Projetos remotos têm um único diretório fixo, de modo que os cenários da tabela que envolvem diretórios adicionais/troca de roots valem apenas para o local; a criação remota e a restauração fria exigem diretórios adicionais vazios, e não se pode validar a restauração remota alterando os diretórios do projeto.

| Cenário                                                                        | Esperado                                                                                |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Projeto tem diretório principal A e diretório adicional B; após criar a tarefa, reiniciar o CLI e abrir a tarefa histórica apenas via assinatura V4 | O cwd continua sendo A, e o escopo de skills, subagents e diretórios de ferramentas de B é o mesmo do resume explícito; não basta validar a exibição na lista |
| Em execução, mudar o diretório adicional B do projeto para C e depois trocar de aba ou reconectar o celular | A instância atual continua usando B; C só é usado após a reconstrução da instância de execução |
| Mudar o diretório principal do projeto de A para B e fazer a restauração fria de uma tarefa histórica vinculada a A | O cwd continua sendo A, e B é o diretório adicional; não se pode excluir B por causa do novo diretório principal |
| Dois projetos contêm A, mas adicionam B e C, respectivamente; as duas tarefas têm cwd A | Cada uma obtém os diretórios pelo project_id explícito; sessões diferentes no mesmo processo CLI também não compartilham o escopo de diretórios |
| Desktop e celular assinando a mesma sessão fria em paralelo | Apenas uma instância de execução é inicializada, as duas assinaturas compartilham o escopo de diretórios desta rodada e mantêm seus respectivos delivery profile |
| Tarefa não categorizada, tarefa histórica de projeto com soft delete, falha na consulta de projeto | Usam, respectivamente, diretórios adicionais vazios, os roots preservados do projeto e erro explícito; esses três casos não podem ser fundidos em um fallback de diretório vazio |
| Restaurar uma tarefa agendada, de ociosidade ou Bot já existente depois de modificar os roots do projeto | Continua usando o cwd e os diretórios adicionais fixados quando a capacidade foi criada                                           |

Testes de protocolo e de CLI cobrem a passagem de parâmetros, o consumo de diretórios e a restauração concorrente; testes de Host cobrem a resolução de atribuição, a deduplicação de caminhos e os ramos de falha. O E2E cobre as entradas de criação e de restauração fria no desktop e no celular, local e remoto, e verifica que os diretórios adicionais não alteram as regras de diretório de vínculo de AGENTS.md / settings / MCP / hooks. Todos os remotos têm um único root fixo; a degradação para capacidades de remoto antigo segue G1, sem exibir operações de múltiplos diretórios; todos esses pontos são itens de aceitação a executar na fase de implementação.

## 5. Modelo de dados

### 5.1 app lib `tasks-index.sqlite` (apenas adições, V1)

```sql
CREATE TABLE IF NOT EXISTS schema_migration (id TEXT PRIMARY KEY, checksum TEXT NOT NULL, app_version TEXT, applied_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS hosts (
  host_id TEXT PRIMARY KEY,            -- 'local' | remote authority（identity 去掉 path 部分）
  kind TEXT NOT NULL,                  -- local|ssh|wsl|docker|server
  target_json TEXT,                    -- RemoteTargetSnapshot（凭据仍在 credentials.json）
  position INTEGER NOT NULL DEFAULT 0, last_connection_status TEXT, last_connection_error TEXT, last_opened_at INTEGER);
CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY, host_id TEXT NOT NULL REFERENCES hosts(host_id),
  name TEXT NOT NULL, name_overridden INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, pinned_at INTEGER,
  deleted INTEGER NOT NULL DEFAULT 0, deleted_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS project_roots (
  project_id TEXT NOT NULL REFERENCES projects(project_id) ON DELETE CASCADE,
  root_path TEXT NOT NULL, position INTEGER NOT NULL, is_primary INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (project_id, root_path));
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_host_name ON projects(host_id, name) WHERE deleted = 0;
-- tasks：ensureColumn 追加，全部可空
ALTER TABLE tasks ADD COLUMN host_id TEXT;            -- 由 workspace_key 推导，NULL=旧版本写入
ALTER TABLE tasks ADD COLUMN root_path TEXT;          -- = workspace_path
ALTER TABLE tasks ADD COLUMN project_id TEXT;         -- 可空；软删除项目仍保留
ALTER TABLE tasks ADD COLUMN sort_order INTEGER;      -- 预留（本次不做手动排序）
ALTER TABLE tasks ADD COLUMN cli_title TEXT;          -- 镜像列；旧列 title/title_overridden/updated_at/task_status 继续按旧语义写
ALTER TABLE tasks ADD COLUMN handoff_pending INTEGER NOT NULL DEFAULT 0;  -- 位标志：1=删除意图待交接 2=手动标题待交接 4=CLI 无此 session(orphan) 8=空归属归位已判定
ALTER TABLE tasks ADD COLUMN cli_title_source TEXT;
ALTER TABLE tasks ADD COLUMN cli_created_at INTEGER;
ALTER TABLE tasks ADD COLUMN cli_updated_at INTEGER;
ALTER TABLE tasks ADD COLUMN cli_last_outcome TEXT;
ALTER TABLE tasks ADD COLUMN cli_deleted INTEGER;
CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_host_task ON tasks(host_id, task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id, archived, cli_updated_at DESC) WHERE deleted = 0;
```

Relação entre colunas de espelho e colunas antigas: o estado organizacional do Host (`pinned/archived/unread/title_overridden/deleted` — intenções) **tem apenas as colunas originais**, sem cópia. Fatos do CLI: o código lê apenas `cli_*`; as colunas antigas `title` (quando não é override), `updated_at` e `task_status` servem apenas às versões anteriores à V1, com escrita dupla pelo syncer. Regras de exibição: título = `title_overridden ? title : cli_title`; oculto = `deleted OR cli_deleted`; ordenação = `cli_updated_at`. `automations` / `off_peak_tasks` recebem `project_id` e `host_id` anuláveis.

A exclusão em runtime passa por uma entrada genérica de persistência que aceita o `TaskMeta` completo. O snapshot de restauração atualiza apenas modelo, alvo, detalhes de erro e corpo da busca; título, tempo, existência e resultado precisam antes passar pela ingestão de reconciliação do CLI. Rascunhos sem fato persistente retornam apenas valores temporários de exibição, sem entrar na lista. A importação do Claude precisa criar primeiro uma sessão CLI real e depois ingerir os fatos pelo mesmo ponto de entrada; o JSON de backup não assume a responsabilidade de escrita de índice nem de ressuscitar sessões excluídas. Uma nova importação explícita cria um novo ID de sessão CLI, sem sobrescrever sessões existentes ou já excluídas por hash da origem externa; os IDs determinísticos antigos servem apenas à leitura e ao reparo de backups existentes. O teste de regressão contamina artificialmente as colunas de fatos antigos e `meta_json`, verificando que ordenação, busca e exibição de todas as listas continuam lendo apenas o espelho.

O `session/create` antigo e a criação V4 compartilham a reserva de atribuição: o Host gera o session ID antes da requisição no wire e salva atomicamente o project_id (NULL quando não especificado); o CLI aceita o ID atribuído que ainda não existe e recusa uniformemente sobrescrever memória, persistência ou criação em andamento do mesmo ID. Durante a criação só permanece uma occupation curta do ID, liberada em caso de falha; ele não recebe entrada do usuário e não constitui uma segunda fila de comandos. O resultado idempotente da V4 continua sendo salvo pelo CommandInbox. Os diretórios adicionais da criação nativa antiga são resolvidos pela atribuição do Host, e configurações já fixadas (agendadas/de ociosidade etc.) são passadas por parâmetros explícitos.

### 5.2 CLI lib `db.sqlite` (nova migration 0020)

`0019_dwf_journal` já foi ocupado por versões históricas; desta vez usamos `0020_session_soft_delete_outcome`, sem alterar o SQL histórico nem o checksum.

```sql
ALTER TABLE session ADD COLUMN time_deleted INTEGER;   -- 软删除
ALTER TABLE session ADD COLUMN last_outcome TEXT;      -- completed|error|interrupted，turn 结束时写
-- time_archived 保留列，代码标记 @deprecated，不再读写
```

`listSessions` / sessions-index cold seed ganha o filtro `time_deleted is null`; `SessionSummary` recebe o novo `lastOutcome` opcional, e a fase do cold seed é derivada de `last_outcome` (NULL volta a completedSuccess). O `deleteSession` da v4 passa a gravar `time_deleted` e chamar closeSession, emitindo `session.removed`.

Novo comando por requisição `sessionsIndex/reconcile { workspaceId, sessionIds[] }` → para cada id devolve `{ exists, deleted, title, titleSource, updatedAt, lastOutcome }` (incluindo linhas com soft delete). Uso: o Host reconcilia, após assinar o snapshot, as linhas "não marcadas como deletadas localmente, mas ausentes do snapshot", e faz a verificação de releitura após a passagem de mão. A ausência no snapshot, por si só, nunca causa a remoção de linhas na app lib.

### 5.3 Entradas locais de projeto remoto e cache

As entradas e o cache de informações básicas são guardados separadamente na app lib local, para evitar que se tornem uma segunda cópia editável do estado organizacional dos `projects` / `project_roots` remotos. Os parâmetros de conexão continuam em `hosts.target_json`, e as credenciais continuam no armazenamento de credenciais existente.

```sql
CREATE TABLE IF NOT EXISTS remote_project_entries (
  entry_id TEXT PRIMARY KEY,              -- 本机入口身份，离线移除按它定位
  host_id TEXT NOT NULL REFERENCES hosts(host_id) ON DELETE CASCADE,
  remote_project_id TEXT,                 -- 远端项目 ID；旧 workspace 待解析时可空
  cached_name TEXT NOT NULL,
  cached_roots_json TEXT NOT NULL DEFAULT '[]', -- 最近读取的 roots / 顺序 / 主要目录
  legacy_workspace_json TEXT,             -- 首次迁移时保留原 workspace 路径与 identity
  last_synced_at INTEGER,
  UNIQUE (host_id, remote_project_id));
```

O workspace remoto antigo da primeira migração pode salvar a entrada e a identificação original mesmo sem estar conectado; após a conexão bem-sucedida, o ID do projeto remoto é resolvido apenas para as entradas que ainda existem e o cache é atualizado, com o remoto antigo mantendo a exibição de root único conforme G1. A criação de entradas vem apenas da primeira migração, da adição explícita do usuário ou da criação bem-sucedida de um projeto online; um refresh comum não tem permissão para criar entradas. Excluir uma entrada significa excluir essa linha e seu cache, e ela também não é reconstruída após o restart a partir do antigo `setting.json` ou da lista remota. Essa tabela não guarda índice de sessões remotas, conteúdo de tarefas nem intenções remotas de exclusão pendentes.

O serviço de projetos roteia pelo `hostId` explícito sobre o base attachment. As requisições do Host atual entram no próprio repositório; os demais Hosts obtêm um proxy de serviço de projetos online apenas do gerenciador de conexões existente, falhando direto em caso de desconexão, sem gravar no banco local. Depois de ler a árvore remota, o registro da resolução canonical/stable é feito pela identidade de workspace do Source existente. O celular também reutiliza esse roteamento por base attachment, sem solicitar o source-settings attachment proibido e sem criar um novo runtime.

O workspace attachment também encaminha o serviço de projetos remoto, e o diretório de entradas é sempre lido do base attachment do Controller. O novo serviço não entra no conjunto de canais obrigatórios da v1 antiga, evitando que o Server antigo falhe ao connectar por falta de canal; o handshake declara a nova capacidade de forma explícita via `capabilities.virtualProjects` opcional, e a ausência significa, por padrão, a versão antiga de root único: não é possível julgar o suporte remoto apenas com base no objeto proxy gerado pelo cliente. Cada criação global remota recebe um cwd independente, e uma logical session já vinculada a qualquer workspace não pode se revincular a um novo cwd; reutiliza-se a mesma conexão física e cria-se um novo logical attachment.

A árvore de projetos inclui tarefas remotas de abas não abertas. O comando de listagem reaproveita a rota `mutateTask` do Window Controller: localiza a conexão física online existente por Source estável + workspaceIdentity, lê primeiro a linha de tarefas daquele owner para validar o endereço e então executa o mesmo task service; a renomeação também é repassada ao comando original da CLI. Consultas e pin/archive/read não criam logical workspace, não trocam de aba e não iniciam Agent para a listagem. O workspace attachment é criado/reutilizado apenas ao abrir a sessão, e o celular continua passando pelo shared-host replayable switcher; não se pode fabricar um `remoteSessionId` para comandos de listagem de abas não abertas. Offline ou com identidade divergente, a operação é recusada direto, e nunca é gravada localmente.

O gerenciamento local de entradas é concentrado no contrato de serviço `remote-projects`: `readDirectory / saveHost / removeHost / addEntry / refreshEntry / removeEntry`. O serviço de projetos trata apenas os projetos autoritativos do Host que detém o banco; o serviço de entradas não recebe índice de tarefas nem operações de escrita remota. A adição de uma entrada produz um novo entry ID; o refresh do cache precisa carregar o entry ID e o lastSyncedAt do momento do envio da requisição, e o SQL faz apenas UPDATE com compare-and-swap. Depois da exclusão da entrada, a resposta tardia não tem mais alvo de escrita; adicionar de novo o mesmo project ID após a remoção produz um novo entry ID, e a resposta antiga continua sem poder sobrescrevê-lo. A exclusão do Host e a exclusão da entrada pertencente ocorrem na mesma transação do SQLite, e o limite de 20 hosts remotos é verificado dentro da transação de escrita. O estado de execução da conexão continua pertencendo ao gerenciador de conexões existente, e as credenciais continuam pertencendo ao serviço de credenciais, sem serem guardadas no target JSON.

```text
adição explícita → linha de entrada local (novo entry ID) → inicia a leitura remota
                                      │
remover a entrada ───────────────── DELETE │
                                      ↓
leitura tardia → UPDATE WHERE entry_id AND last_synced_at → 0 linhas, sem reconstrução
```

A admission de conexão precisa reavaliar o cancelamento e o owner atual a cada await: mesmo uma conexão online reutilizada não pode devolver um objeto antigo já desconectado depois de esperar pelo commit do membro. Um transport novo é exclusivo da chamada `connect` corrente antes de publicar `online`; se o registro de diretório, a confirmação de identidade ou o commit do membro falhar, a conexão ainda não publicada é liberada pelo mesmo caminho de limpeza. O close de uma conexão não publicada não pode disparar a lógica de recuperação de outra conexão já online; se ela foi fechada antes da publicação, a operação é recusada.

O `project_id` / `host_id` / `additional_directories` das definições de automação e de ociosidade são fixados no commit da criação. O formulário de seleção de projeto envia apenas o ID do projeto, e o Host usa o serviço de projetos para resolver o cwd e os diretórios adicionais; um projeto inválido ou já excluído precisa falhar antes da obtenção do ID e da gravação da definição. O agendamento, as novas tentativas e a restauração de ociosidade leem a configuração já salva, sem reavaliar pelos roots atuais do projeto; edições de roots feitas depois não alteram essas definições. A semântica existente de vínculo de tarefas dentro da sessão é preservada, e o vínculo não se transforma em criação de nova sessão por causa da remodelagem das opções de diretório. Tarefa vinculada e novo projeto selecionado não podem ser submetidos em conjunto. O despacho carrega os diretórios adicionais já salvos pelo Host (incluindo array vazio explícito), e a reserva de atribuição apenas verifica se o projeto ainda existe e é do mesmo Host, sem mais negar a definição existente pelos roots atuais ou pelo bit de soft delete; a criação comum continua validando os roots atuais e o projeto não excluído. O CLI recebe apenas diretórios, não recebe ID de projeto.

## 6. Pontos de comportamento da UI

### Selecionar o projeto de rascunho após a criação (2026-10-16)

O「新项目」(novo projeto) da barra lateral e o menu de projeto do canto superior esquerdo do rascunho compartilham o comportamento de conclusão da criação: depois que o projeto for salvo com sucesso (no remoto ainda é preciso registrar a entrada local) e o diretório for atualizado, se o chat que originou a ação ainda for o mesmo rascunho, o novo projeto é selecionado automaticamente. Reutiliza-se a navegação de projetos do Root/Host, preservando o corpo do rascunho atual, as menções em rich text, os anexos e a intenção de agrupamento, sem enviar mensagem. A seleção manual comum de projeto continua restaurando o rascunho por workspace. Sessões já existentes, falha de criação, cancelamento, adição de projeto existente e edição de projeto não disparam esta ação.

```text
ProjectEditor salva → ProjectCreation registra e atualiza → valida tab / workspace / geração do rascunho originais
                                               ├─ mesmo rascunho → lê o snapshot do editor → Root prepara o novo projeto → restaura corpo e anexos
                                               └─ já trocado ou enviado → mantém apenas o resultado da criação
```

Projeto e diretórios continuam pertencendo ao Host; a intenção de organização continua pertencendo ao session store, o corpo ao composer draft owner e os anexos ao owner de upload existente. O snapshot serve apenas como um comando de passagem único na memória do renderer; o corpo é escrito no rascunho de destino, os anexos são preparados novamente no destino usando o File/caminho original, sem reutilizar as referências de upload da sessão antiga e sem adicionar gravação de anexos em disco. Após a reconstrução do Root no celular, usa-se o mesmo comando de passagem; a passagem de anexos só pode ser consumida uma vez pela mesma geração do rascunho de destino. Quando a preparação falha, o rascunho de origem permanece intacto. Se durante o salvamento ou a atualização houver troca de workspace, seleção de sessão ou reconstrução do rascunho, um resultado tardio não pode trocar o workspace atual. Desktop e celular reutilizam a mesma ação de conclusão, cada um seguindo sua navegação continuous / replayable. A aceitação PCD01–03 cobre a conclusão local/remota, as duas entradas, a invalidação do rascunho e o isolamento de falhas.

Limpeza de implementação: a nova árvore de projetos substitui o antigo WorkspaceSidebarItem, o SortableWorkspaceSidebar, as antigas seções Timeline/Pinned/Archived e o useWorkspaceTaskLists; após a auditoria de referências confirmar que não há chamadas em produção, eles são removidos, sem manter agregação paralela de listas de tarefas nem estado de ordenação de workspace/group. A exibição compartilhada de linhas de tarefa, o arraste do workbench, a busca e o Header continuam usando as capacidades públicas originais. A estabilização de referências item a item continua reutilizando o taskListItemStabilization existente: o mesmo snapshot não reconstrói a árvore inteira, e só a linha correspondente é atualizada quando a atribuição de projeto ou a activity realmente mudam; Host + ID do projeto e workspaceKey + ID da tarefa servem como identidades.

O draftSessionId / setDraftSessionId do antigo workspace store já não têm escritor em produção e são removidos junto com os velhos caminhos de gestão de sessão. A sessão de pré-aquecimento é mantida apenas pela pane do V4; mudanças de projeto, skill ou plugin notificam a pane por meio de uma versão de invalidação isolada por workspaceIdentity, para que ela recolha e reconstrua. A UI de configuração não fecha diretamente a sessão de rascunho nem copia IDs de runtime para o store global; o painel lateral atribui apenas pelo activeTaskId formal, e o rascunho segue a semântica de atribuição vazia existente.

- Barra lateral: topo com a área global de fixados (session + projetos fixados) → área「项目」(menu de clique direito no título: ordenar por tempo / por projeto) → área「任务」. A implementação da linha do tempo é mantida, com a entrada de alternância atualmente oculta.
- Assistente de novo projeto: tipo (local / remoto) → no remoto, escolher a conexão primeiro → múltiplas pastas (opcional) → nome (padrão: nome do primeiro root /「新项目」) → diretório principal (padrão: o primeiro).
- Diálogo de edição: nome, adição/remoção de roots, definir o principal (se o principal for removido, o primeiro entra automaticamente). O menu de ações do projeto usa navegação não modal; somente o diálogo de edição tem o foco/pont.modal restrito; se o diálogo for aberto e salvo rapidamente enquanto a animação de saída do menu ainda não terminou, a interação com a página também deve ser restaurada, sem alterar manualmente o estilo do body nem destravar por timeout.
- Arraste: session → outro projeto (só é possível soltar no mesmo host; quando o alvo local não tem aquele root, aparece o diálogo「将文件夹加入项目」, e um diretório remoto incompatível é recusado diretamente); na área de tarefas, session → projeto (o mesmo, usando o diretório de vínculo real da session, permitindo cwd fora do diretório padrão); ordenação dos nós de projeto.
- Exclusão de projeto: projetos locais e projetos remotos autoritativos online seguem a soft delete do E1; a linha do tempo ainda mostra suas sessions; ao criar um projeto cujo conjunto de roots é exatamente igual (mesmo host), aparece o diálogo「发现已删除的项目 P（N 个会话），是否恢复」, e a restauração equivale ao undelete; não há outra entrada de restauração e não se oferece exclusão definitiva.
- Nó de projeto remoto: quando offline ou com falha de conexão, mostra o cache e o estado offline / error, não pode ser expandido, renomeado, nem ter seus roots ou diretório principal editados; as únicas ações de projeto permitidas são「删除」, com o sentido de remover a entrada e o cache local, preservando o projeto e as sessões remotas. No nível de conexão ainda é possível reconectar ou remover o host local; reconectar não restaura automaticamente as entradas de projeto removidas.
- composer: @arquivo recebe o sufixo do root quando atravessa roots; skill / subagent usam qualifiedName; menções com # são agrupadas por projeto.
- Gerenciamento da configuração de Agent na página de configurações: a lista suspensa de diretórios = todos os roots deduplicados e achatados; o hooks trust usa os diretórios reais.
- Agendamento / ociosidade / Bots: seleção de projeto; na criação, cwd = diretório principal e diretórios adicionais = os demais roots, fixados. Os candidatos do formulário vêm do serviço de projetos, sem relação com as abas de diretório abertas; múltiplos projetos com o mesmo cwd são escolhidos de forma independente pelo ID do projeto. Projetos sem roots podem ser selecionados diretamente, e o Host só cria o diretório padrão no momento do envio; a prévia da lista de modelos usa o serviço de modelos daquele Host. Editar uma definição existente preserva seu snapshot original de cwd/diretórios.

#### 6.0.1 Vinculação de projeto do Bot e passagem do estado antigo

A autorização multi-projeto do Bot continua usando o campo existente `allowedWorkspaces` e o comando `/workspace`, mas o ID de candidato da nova versão representa Host + projeto, e não mais cwd. Os candidatos compartilham o contrato de leitura de diretórios de projeto: os projetos do owner atual e os projetos remotos online para os quais a máquina local ainda mantém a entrada; não se criam projetos a partir de tab/history e não se inicia um Agent para enumeração. Múltiplos projetos com o mesmo cwd são exibidos separadamente; quando a entrada de diretório/nome é ambígua, exige-se a escolha de um projeto explícito.

O Bot context é a única fonte persistente do vínculo de execução do Bot. Na criação inicial do context (incluindo a primeira persistência do offset do provider) ou quando o usuário troca explicitamente de projeto, chama-se `prepareSession` daquele Host, salvando projectId, hostId, cwd, workspaceIdentity e additionalDirectories. A partir daí, `/new`, a leitura de status, a prévia de modelos e as reinicializações preservam esse snapshot, sem reescrever o cwd conforme os roots mais recentes. Tarefas novas geradas passam esse snapshot para a reserva existente de criação de tarefa; a retomada de tarefas existentes continua seguindo a reserva do seu próprio Host.

O Bot Repo lê e atualiza um único context sob o mesmo lock de arquivo, e comandos, cursor do provider e remoções passam todos por essa entrada, proibindo sobrescrever outros Bots com o state antigo inteiro lido na camada de serviço. A primeira vinculação usa o context atual dentro do Repo como base do CAS; a atualização de comandos preserva o cursor Telegram/WeChat do writer independente. O endereço do arquivo é fixado na criação da instância do Repo, e operações assíncronas não reinterpretam caminhos de ambiente.

O context histórico só é transferido uma única vez, quando falta o hostId: mantém-se o cwd original, completa-se a atribuição de identidade/projeto quando ela pode ser unicamente confirmada, e additionalDirectories fica como `[]`. Múltiplos projetos com o mesmo cwd não têm a atribuição adivinhada, e um NULL explícito é salvo; um NULL já tratado não entra automaticamente em projetos criados depois. A autorização por caminho antigo só é convertida em ID de projeto quando o candidato é único, e a ambiguidade não amplia permissões. Cliques tardios no menu de seleção devem validar novamente a autorização atual, a entrada de membro e a existência do projeto, não podendo executar diretamente o objeto de menu antigo.

Os candidatos de `/task` são lidos da árvore de projetos do Host pertence, incluindo apenas as tarefas com cwd/identity fixados e projectId explícito; outros projetos com o mesmo cwd não podem se misturar, e o ID da tarefa ou o menu antigo também não pode contornar essa validação. Trocar de tarefa existente altera apenas o activeTaskId, sem sobrescrever o ID de seleção de projeto do Bot nem o snapshot de diretório de execução.

```text
owner do projeto/entrada → lê candidatos (valida membro e entrada antes e depois)
escolha explícita → prepareSession → Bot Repo fixa o vínculo de execução → reserva existente de criação de tarefa
edição de roots ─────────────────╳ não altera o Bot context
desktop continuous / celular replayable → owner original, CommandInbox e cadeia de recuperação
```

- Arquivamento automático: o interruptor e o número de dias na página de configurações são mantidos; o scanner, dentro de um único write transaction, filtra apenas pelo espelho do último tempo de atividade da CLI e altera apenas `archived`; exclui somente as sessões fixadas e as sessões em estado não terminal já observadas pelo syncer (desde 2026-09-15 não olha mais resultado nem não lidas), sem iniciar a CLI para a consulta e sem persistir phase em tempo real. O gatilho é o scanner periódico do Host (primeira rodada na inicialização + a cada 5 minutos + varredura extra quando as configurações mudam); a consulta à árvore de projetos e o clique em uma tarefa não disparam mais isso; cobre todos os roots de projeto e os diretórios de vínculo das sessions da área de tarefas; após o arquivamento a linha entra no estado arquivado da linha do tempo, sem afetar a atribuição de projeto.

#### 6.0.2 Injeção de dependência do Host para execução remota do Bot

A execução remota do Bot usa diretamente os serviços SourceServerConnectionManager / URL Registry já online na janela do Host, sem passar pelo main para consultar workspace sessions, criar uma logical session do Bot ou repassar uma segunda MessagePort de runtime. `/reconnect` chama apenas o connectHost do host retido; requisições que falham após a remoção de um membro não leem settings antigos para ressuscitar a conexão. O próprio Bot do Server usa os serviços locais do Host ao qual pertence.

A identidade canônica antiga do Bot é resolvida pelo legacyWorkspace da entrada retida para o host que detém o banco, e o hostId é salvo apenas na primeira transferência; depois disso o roteamento usa o hostId salvo, e a remoção da entrada não reescreve o cwd/identity já vinculado. Recusa-se quando a identidade estável do server e o hostId explícito não coincidem. Antes e depois da vinculação de projeto, verificam-se simultaneamente o membershipId do host e o ID da entrada, de modo que remover e adicionar de novo não aceita resultados antigos de prepareSession.

O admission de diretórios remotos reutiliza o alias de workspace da Source; durante a espera, a validação é feita pelo objeto de conexão física e pelo membershipId, e resultados tardios são recusados. Os candidatos de configuração, a atribuição de projeto e o conteúdo da CLI continuam sendo determinados respectivamente pelos owners existentes, e o router não guarda cópias de projeto, TaskMeta ou estado de conexão. Os eventos dinâmicos do Bot mantêm `bot-channel-continuous`: a troca de conexão substitui apenas a subscrição ao vivo, sem emendar o snapshot/replay do celular; os comandos seguem o task service / owner lease / CommandInbox originais.

O Bot router pode manter o handle de subscrição dos seus próprios consumidores; a notificação da conexão de origem dirige a re-subscrição, e eventos tardios são descartados após o fechamento; não se pode usar temporizador para fazer polling da conexão nem criar uma segunda fila de entradas aceitas. As preferências de runtime do App são lidas das configurações existentes, e apenas os alvos online com vínculo de Bot já persistido participam da sincronização ativa.

```text
Bot context fixa o endereço → Host router → serviços Source/URL já existentes → mesmo owner da CLI
/reconnect explícito      → connectHost do host retido
troca da conexão Source   → substitui a subscrição ao vivo do Bot (sem replay)
desktop continuous / mobile replayable → seus attachments originais, sem impacto da troca de roteamento do Bot
```

#### 6.0.3 Admission de shared-host para novos diretórios de projeto no celular

O home do celular e a sidebar do desktop montam o mesmo ProjectSidebar e leem o conjunto de linhas do contrato de projetos do mesmo base attachment; removem-se o agrupamento de workspace exclusivo do celular, a derivação de título/status e o cache de lista duplicado. O shell do celular responde apenas por home/chat, o botão back do navegador e a camada de sobreposição da barra lateral, e não possui cópias de projetos/tarefas. O evento de abertura do ProjectSidebar entra no chat após o sucesso do switcher replayable original; novos rascunhos passam pelo Host admission descrito abaixo. Visualização/ordenação compartilham os controles da barra lateral de projetos, sem continuar lendo as preferências de agrupamento de workspace do celular que já saíram de cena.

No modo home-only (o workspace de destino inicial não pode criar bridge, o Root não tem projectService) não existe base attachment e, portanto, não existe contrato de projetos. Nesse caso, as áreas de projeto/tarefa do ProjectSidebar passam a exibir a lista de workspaces da janela do desktop retornada por `listWorkspaces` na camada de relay, compartilhada entre celular e tela larga; falhas na leitura da árvore de projetos não são exibidas aqui. Os fatos da lista vêm apenas do desktop: são solicitados uma vez na montagem e, depois, apenas os push de `workspace-list-updated` são adotados, sem polling. Se, depois do envio da requisição, chegar um push ou uma nova requisição, a resposta antiga tardia é descartada. Cada linha exibe o nome do workspace e o estado da conexão:

- Quando é possível criar bridge (local, ou remoto com workspaceIdentity + remoteSessionId): o clique abre, via `switchWorkspace`, o bridge Root daquele workspace, caindo na home, sem entrar automaticamente no chat.
- Quando não é possível criar bridge: exibe「未连接 · 连接」(com `lastConnectionError`, exibe falha de conexão); o clique é entregue via `reconnectWorkspace` ao owner de reconexão já existente no desktop; após o sucesso, a lista é solicitada novamente, a linha passa a ser abrível e não há troca automática.
- Quando o desktop reporta `reconnecting` ou a requisição desta página está em andamento: a linha fica desabilitada e exibe conectando. Falha na requisição gera um toast, e a lista mantém o fato mais recente vindo do desktop.

```text
home-only Root (sem projectService)
  ProjectSidebar → listWorkspaces ─┐   desktop workspace-list-updated ─┐
                                    └→ linha de workspace (respostas tardias descartadas)←───────┘
  linha com bridge → switchWorkspace → bridge Root (home)
  linha desconectada → reconnectWorkspace → owner de reconexão do desktop → lista traz remoteSessionId → linha com bridge
```

O celular emite a intenção de projeto/host, e o Host da janela chama o mesmo ProjectService.prepareSession para resolver o diretório. O celular não chama prepare uma vez para depois repetir a preparação pelo main. O main apenas repassa a requisição e o workspace descriptor higienizado retornado pelo Host, sem ler o banco de projetos/tarefas. Cada criação de tarefa global pelo usuário recebe um novo diretório, e a repetição de uma mesma requisição de navegação não pode criar diretórios em duplicidade. Quando múltiplas navegações fazem join no mesmo escopo de diretório, elas compartilham a primeira barreira de sincronização de configuração do Provider; a troca de escopo invalida imediatamente a identidade antiga do bridge. Quando um escopo criado no celular é depois adotado explicitamente pelo desktop, a conexão só é registrada como bem-sucedida depois que o desktop renderer estiver pronto.

O admission remoto só pode reutilizar a conexão física Source já online, criando ou reutilizando o escopo lógico do diretório correspondente no Registry daquela janela; não pode estabelecer implicitamente um novo transport SSH/WSL/Docker/URL, um Host separado ou um Agent. Antes e depois da preparação, validam-se o membershipId do host retido e o owner da conexão física, e após criar o escopo a validação é repetida, com resultados tardios de remoção/troca recusados. Offline, o bridge e o rascunho atuais são mantidos, e a reconexão explícita segue a entrada original.

O remoteSessionId, o workspaceIdentity e o cwd do escopo do celular precisam corresponder ao descriptor do Host. O escopo novo ainda passa pelo shared-host attachWorkspaceHost existente, criando uma subscrição independente via web-remote-replayable confiável; a cadeia continuous do desktop não muda. A substituição do Root no celular carrega o rascunho do projeto, o provider e a entrada inicial, concluindo primeiro a inicialização do rascunho e só depois permitindo o prewarm; o Root antigo não escreve no estado do Root novo depois de um retorno assíncrono.

A atribuição de projeto ainda não submetida pertence ao rascunho do navegador, assim como o corpo/modelo: no scope existente do composer do V4 (workspaceKey + `__draft__`) salva-se um projectId opcional (null significa explicitamente não classificado). Salvar texto/modelo comum não pode limpar a atribuição, uma criação explícita a sobrescreve, e ela é limpa junto com a promoção original do rascunho após a criação bem-sucedida da tarefa. A reconstrução do Root no replayable do celular e o reload da página leem a atribuição do mesmo rascunho, com o initialTaskDraft explícito tendo prioridade, e um initialTaskId existente não lê o rascunho; o desktop continuous continua entrando no novo rascunho com a semântica original de workspace inicial. Não se deve adicionar para isso uma cópia do estado de projeto no main/relay nem uma fila de entradas aceitas.

```text
edição de rascunho no mobile -> scope existente do composer do navegador (workspaceKey, __draft__)
recuperação do bridge / reload -> Root restaura o projectId antes do prewarm
primeiro envio -> Host valida o projeto -> CLI aceita -> promoção existente do rascunho
```

Abrir uma tarefa existente da árvore de projetos também usa esse admission: o cliente submete apenas taskId, workspaceKey e o hostId pertencente, e o Host confirma na árvore de tarefas autoritativa que aquele endereço realmente existe, antes de resolveSessionDirectories; não se pode chamar prepareSession nem atribuir um novo diretório a tarefas históricas. No remoto, verificam-se primeiro o Host retido e o owner físico online, e depois a entrada de projeto mantida localmente; abrir uma tarefa não classificada exige apenas que o membro do Host ainda esteja lá. Todos os resultados tardios passam pela mesma validação de membership/entry/physical owner. O workspaceKey do bridge continua sendo a identidade do diretório de execução original, e não passa a ser o ID do projeto.

```text
intenção de projeto no mobile -> roteamento de requisição no main -> Window Host ProjectService
                                                     | prepara o cwd
                                             verificação de lease da Source online
                                                     | escopo lógico no Registry
mobile replayable <- bridge shared-host existente <- descriptor confiável
```

#### 6.0.4 Limite de leitura dos candidatos de projeto do composer

O antigo pop-up de workspace scratch do estado vazio e a cadeia de callbacks de criação Root → App → Shell saem de cena. A criação de diretório passa a ser responsabilidade uniforme do prepareSession do projeto virtual selecionado ou da entrada de alocação de tarefa global, sem manter um segundo conjunto de ações de criação sem consumidor real de UI.

O `#` lê os candidatos do ProjectService.readTree do Host atual, incluindo as tarefas não excluídas de diretórios de tabs não abertos, agrupados por `(hostId, projectId)`; a atribuição vazia exibe um título localizado de área de tarefas, e as tarefas existentes sob contêineres em soft delete continuam exibidas com o nome daquele projeto. Só se lê o Host do attachment atual, e é proibido conectar outro Host só para obter candidatos ou agregar session IDs ilegíveis de outros Hosts. Cada grupo tem busca independente com no máximo 20 itens, e a ordenação vem do espelho do tempo de atividade da CLI. Os candidatos de sessão dentro do `@` continuam restritos ao workspaceKey atual, mas o conjunto de linhas passa a vir da mesma árvore de projetos autoritativa. Eventos de projeto fazem as consultas somente-leitura se atualizarem, e resultados tardios são descartados após mudanças de owner/endereço.

O `@` de arquivos cobre o cwd vinculado e os demais roots do projeto. Tarefas existentes usam resolveSessionDirectories, rascunhos usam o readProjects do projectId selecionado, e rascunhos não classificados têm apenas o cwd atual. A leitura de candidatos não pode chamar prepareSession, criar diretórios nem Agents. Tarefas antigas cujo root foi removido continuam com o próprio cwd. A busca de arquivos é executada pelo fileService do Host atual, usando o caminho absoluto real como chave de deduplicação; o relativePath original é preservado, links canônicos dentro do cwd atual continuam como caminho relativo, e os demais roots usam caminho absoluto, evitando que caminhos relativos de mesmo nome apontem para o arquivo errado. O nome do root é exibido à direita do candidato, sendo apenas informação de exibição, sem participar da identidade nem do caminho de execução.

```text
composer # -> ProjectService.readTree do Host atual -> grupos de projeto
composer @ -> diretórios da tarefa / roots do projeto selecionado -> mesmo fileService do Host
                identidade + owner da requisição alterados -> descarta resposta antiga
desktop continuous / mobile replayable -> attachment original, sem novo runtime
```

### 6.1 Atribuição da área de tarefas e aceitação da primeira posicionagem

A seleção de projeto do agendamento/ociosidade reutiliza readProjects, lendo apenas diretórios e projetos, sem carregar a task tree para exibir candidatos nem disparar arquivamento automático. Aqui, o「已打开的本地 workspace」original passa a ser「todos os projetos virtuais locais não excluídos», preservando o escopo de criação local da spec de produto existente, a fixação do diretório após a criação e a capacidade de gestão de tarefas remotas antigas; abrir a criação remota exige uma decisão explícita e separada.

| Cenário                                                                            | Expectativa                                                                  |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Nova tarefa global                                                                | Criada em `~/.zcode/workspace/<diretório único>`, com `project_id = NULL`, exibida na área de tarefas |
| Primeira descoberta de uma session histórica fora do diretório padrão, cujo diretório de vínculo corresponde a exatamente um projeto não excluído do mesmo host | Atribuída a esse projeto, com o cwd inalterado                              |
| Primeira descoberta de uma session histórica fora do diretório padrão, cujo diretório de vínculo corresponde a vários projetos não excluídos | Permanece não classificada, exibida na área de tarefas; sem escolher pelo diretório principal e sem criar projeto |
| Primeira descoberta de uma session histórica fora do diretório padrão, cujo diretório de vínculo não corresponde a nenhum projeto não excluído | Permanece não classificada, exibida na área de tarefas, sem criar projeto     |
| O mesmo diretório corresponde apenas a projetos excluídos ou a projetos de outro host | Não conta como correspondência válida: permanece não classificada, sem restaurar projeto excluído e sem atribuição entre hosts |
| Session não classificada já passou pela primeira decisão (bit 8); depois é criado um projeto que contém o seu cwd e a aplicação é reiniciada ou reconciliada | Continua na área de tarefas, sem ser atribuída automaticamente por o diretório ter passado a ser uma correspondência única |
| Session sem atribuição da linha do tempo arrastada para um projeto do mesmo host cujo destino não tem aquele diretório | Diálogo confirmando a inclusão do diretório de vínculo real; após a confirmação a session é movida, e a recusa não altera nem o diretório nem a atribuição |
| Session sem atribuição que satisfaz a condição de arquivamento automático do F12 | Dispara igualmente o arquivamento automático, sem omissão por não ter atribuição de projeto |
| Exclusão de um projeto local ou de um projeto remoto autoritativo online                 | A session mantém o `project_id` original, continua visível na linha do tempo e não migra para a área de tarefas |

Os cenários acima são consistentes no desktop e no controle remoto Web do celular; quando envolvem o remoto, vale a mesma limitação de host e o isolamento por workspaceIdentity, sem alterar os limites de recuperação do desktop continuous e do celular replayable.

### 6.2 Aceitação de entradas de projetos remotos offline

O `host_id` do Server remoto usa a identidade estável de Source Server injetada pela entrada de inicialização confiável. O `workspace_key` no banco ainda pode preservar a antiga chave canônica SSH/WSL, convertida pelo identity mapper existente para a identidade externa; não se pode inferir hosts físicos diferentes a partir desses endereços de conexão históricos, nem alterar o cwd, o hash de configuração da CLI ou a chave canônica. O Server Core conclui a migração do seu próprio banco app antes de criar os services / abrir o RPC.

| Cenário                                               | Expectativa                                                                                            |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Projeto remoto adicionado fica offline ou a conexão falha | As informações locais continuam visíveis; não pode expandir, renomear ou editar roots / diretório principal, e a única ação de projeto permitida é remover a entrada local |
| Após excluir offline um projeto remoto, reiniciar o aplicativo e reconectar ao mesmo host | A entrada e o cache locais foram removidos e o projeto não volta sozinho; o projeto remoto, os roots, a atribuição e o conteúdo das sessions não mudam, e não há operação de exclusão pendente para sincronizar |
| Uma requisição de atualização foi enviada, depois a entrada local do projeto é removida e a resposta chega por último | A resposta tardia não reconstrói a entrada nem o cache, e o setting.json não reescreve os itens remotos já removidos |
| Na reconexão do host, o remoto devolve projetos já removidos ou novos projetos | Só se atualizam as entradas ainda mantidas localmente; a lista completa não adiciona projetos automaticamente |
| O usuário adiciona ativamente o mesmo projeto remoto de novo | A entrada local é restaurada e as informações mais recentes são lidas, com acesso às sessions originais; não se cria um novo projeto remoto nem se dispara o undelete do E1a |
| Excluir a entrada de um projeto do mesmo host, ou excluir esse host | O primeiro caso mantém a conexão e as demais entradas de projeto; o segundo remove apenas a conexão local e as entradas pertencentes, e nenhum dos dois apaga dados remotos |
| A conexão cai durante a exclusão online de um projeto remoto, sem confirmação de sucesso | Relata-se explicitamente que não foi confirmado ou que falhou, sem trocar silenciosamente para a remoção da entrada local e sem criar a falsa impressão de que a exclusão remota teve sucesso |

As janelas do desktop e o controle remoto Web do celular usam a mesma fonte de dados de entradas locais, lida e escrita pelos serviços Host já existentes; o celular não mantém uma lista editável extra de entradas. A fase de implementação acrescenta os testes unitários do serviço correspondente e os E2E de desktop / celular, confirmando que a remoção de uma entrada local não altera o estado organizacional remoto nem o estado de execução das sessões.

## 7. Migração (gate de inicialização, reutilizando a mesma implementação de migração)

O módulo compartilhado de migração é exportado por `@zcode/shared/sqlite-migrations`; o mapeamento de subpath de build do CLI/desktop agent deve derivar dos exports do pacote shared, sem manter uma segunda lista manual de subpaths. A construção e a importação reais do bundle pertencem à verificação de entrega da migração, e não se pode verificar apenas o código-fonte TypeScript.

Após a mesclagem de 2026-10-10 adotou-se o gate de inicialização observável do upstream: o Host Worker prepara o banco app antes de inicializar os serviços de negócio e, em seguida, prepara o banco de sessões pela entrada de preparação de armazenamento do mesmo bundle da CLI. O Worker precisa ler as configurações antigas e repassá-las à migração de projetos, sem contabilizar primeiro e descartar depois as sementes de projeto antigas. Os dois lados reutilizam o SQL, o checksum, o backup em nível de tabela e o Repo existentes; a espera por lock é assíncrona, o ready só é publicado após o commit bem-sucedido, e não se cria uma segunda implementação de migração de sessões. A falha entra no fluxo de erro/retry da inicialização; o retry pula idempotentemente os bancos já concluídos pelo migration ID completo, sem supor que exista transação atômica entre os dois bancos. A abertura normal do banco pela CLI continua verificando a migração, cobrindo o TUI independente e a execução remota. Os dois 0004 de nomes diferentes e as migrações de ambos os lados da CLI são mantidos, sem sobrescrita por número de sequência; 0023_session_soft_delete_outcome identifica o registro 0020 de mesmo conteúdo já executado em desenvolvimento.

### 7.1 migration runner genérico (comum aos dois bancos, extraído do runner atual da CLI)

```text
definição de migration
  { id, appVersion, up: SQL | fn, touchedTables: string[] }   ← declara explicitamente as tabelas em que escreve

runner (o backup serve só para recuperar de migration falha; as tabelas não tocadas têm os mesmos dados antes e depois, portanto backup por tabela + tabelas não tocadas = estado completo anterior à atualização)
  pending = itens de SQLITE_MIGRATIONS não registrados em schema_migration (ids desconhecidos são ignorados, checksum divergente gera erro, mantendo a semântica existente)
  tables  = ∪ pending[i].touchedTables
  1. Backup: ATTACH <backupDir>/<db>.sqlite AS b; para cada table, CREATE TABLE b.<t> AS SELECT * FROM main.<t>; DETACH
     Espaço: necessário = soma dos volumes dessas tabelas; sem espaço no volume atual → outro volume gravável montado → sem espaço em ambos, pula e marca skipped em backup.json
  2. BEGIN IMMEDIATE → executa up em sequência → INSERT schema_migration → COMMIT
  3. Em caso de falha, ROLLBACK, o backup é mantido; o main exibe o erro (retry / abrir o diretório de backup)

Metadados do backup backup.json: lista de colunas por tabela, contagem de linhas, hash de conteúdo (as foreign keys da CLI ligam message/part/session_entry/session_target → session por ON DELETE CASCADE, a restauração precisa impedir cascatas)

Ferramenta de restauração (uso de engenharia, scripts/, é proibido DELETE manual)
  conexão de restauração PRAGMA foreign_keys=OFF → BEGIN IMMEDIATE
  para cada tabela tocada: DELETE main.t; INSERT INTO main.t(<lista de colunas do backup>) SELECT <mesmas colunas> FROM b.t (colunas novas da migration ficam com o default)
  PRAGMA foreign_key_check precisa estar vazio; contagem de linhas e hash por tabela devem ser iguais aos de backup.json
  COMMIT; apaga a linha correspondente em schema_migration; qualquer falha de verificação → ROLLBACK e o backup é mantido

Garantias mecânicas
  um teste unitário por migration: numa fixture de banco, compara o hash de conteúdo de todas as tabelas antes e depois; só as touchedTables podem mudar, caso contrário falha
  schema.baseline.sql + diff no CI: apenas tabelas / colunas / índices novos são permitidos
```

Declaração das migrations deste lote: CLI `0020_session_soft_delete_outcome` → `touchedTables: ["session"]`; app `0001_projects` → `touchedTables: ["tasks","task_groups","task_group_members","task_group_view_node_orders","task_group_workspace_bootstraps","automations","off_peak_tasks"]` (as tabelas de grupo são somente leitura, mas entram no backup para permitir a restauração completa).

### 7.2 Passos

Complemento de 2026-10-19 sobre a ordenação na primeira atualização: ao atualizar a partir de um terminal de controle que ainda não executou a migração de projetos da 3.15, a ordem mista local/remota do antigo `lastWorkspaceSession` é preservada. O local reutiliza `projects.position`, e a entrada remota guarda um `initial_position` anulável, usado apenas para a inicialização da primeira ordenação da barra lateral; a posição do terminal de controle não é gravada no projeto remoto. Adiciona-se uma migration apenas aditiva, que só escreve a posição inicial quando a mesma transação de migration executou de fato `0005_projects`; bancos que já têm `0005_projects` ou o ID antigo `0001_projects` não recebem a ordenação e o checksum antigo não muda. Somente as entradas remotas marcadas por esta migration, quando `legacy:<entryId>` é resolvida em um ID de projeto real, substituem a chave de ordenação no lugar; o algoritmo de ordenação existente e o owner das preferências são mantidos, sem trocar globalmente a identidade de ordenação. A primeira tela offline, a conexão concluída, a vinculação de identidade do Host, a atualização e o arraste manual após a atualização preservam a posição; após um rollback é possível repetir, e inicializações repetidas não sobrescrevem a nova ordenação.

```text
A → Remote R → B da 3.15 → primeira transação salva 0/1/2 → preferências existentes da barra lateral
                                      legacy:R → project:R (mesma ranhura de ordenação)
```

Verificação complementar do VP28: migração real de cold start com a mistura local/remote e atualização offline; regressão de SQLite e React cobrindo a substituição de identidade após a conexão, o mesmo caminho em Hosts diferentes, a ordenação manual, o não-preenchimento do ledger antigo e a idempotência da migração. Reutiliza-se o diretório do celular com shared-host e a mesma lógica de ordenação, sem alterar a CLI, a atribuição de sessão, continuous/replayable ou o agendamento de conexões.

```text
M0 Sonda: tasks-index sem schema_migration ou sem '0001_projects' → entra na migração; caso contrário pula
M1 Backup: backup por tabela dos dois bancos conforme 7.1 → ~/.zcode/backup/<ver>-<ts>/
M2 Criação de tabelas e colunas (5.1, 5.3); a entrada local de projeto remoto e o projeto remoto autoritativo são salvos separadamente
M3 hosts: 'local' + a autoridade remote resolvida dos itens remote de tasks.workspace_key / setting.json
M4 Preenchimento de tasks: host_id, root_path (= workspace_path), cli_* copiados das colunas antigas como valores iniciais; linhas com `deleted=1` recebem handoff_pending|=1, e linhas com `title_overridden=1` recebem handoff_pending|=2 (fatos de Host históricos a serem entregues à CLI, ver 7.4)
M5 Local e remoto, cada um apenas, convertem os projetos de workspace mantidos no antigo lastWorkspaceSession → projeto de root único (name = nome do diretório, name_overridden=0, primary = esse root);
    a position inicial é atribuída apenas pela ordem original dos itens de projeto deste Host no lastWorkspaceSession do setting.json (deduplicando o mesmo diretório, mantendo também projetos salvos sem session); itens de conversation não participam. tasks históricos, recentProjects e Group não podem ampliar o conjunto de projetos; diretórios removidos e diretórios de tarefas apenas arquivadas ou excluídas não recriam projetos por causa do histórico. Tarefas sem atribuição mantêm, conforme o F3, o cwd, o título, o tempo e o estado de arquivamento/exclusão/fixação/não lida originais; quando o settings está ausente ou a lista está vazia, também não se infere projeto a partir do registro de tarefas. Quando o owner do banco não é local, aplica-se a exceção remota do F8: depois dos itens do settings, por ordem decrescente da atividade recente das tarefas históricas, cria-se um projeto de root único para cada root não excluído, que não seja `*/.zcode/workspace/*`, que não seja item de conversation e que ainda não tenha projeto no mesmo diretório; a atribuição continua sendo feita pelo casamento único de diretório do M6a.
    position só é inicializada na primeira migração; com ledger existente não se reexecuta a conversão, não se reordena a partir do settings e não se limpa automaticamente os projetos já gerados, preservando as edições e a ordenação manual do usuário após a atualização. Os itens remotos continuam sendo importados pelos limites originais de Host/entrada, sem escrever a ordenação local como ordem autoritativa dos projetos remotos; o modo manual padrão lê position, e a escolha explícita de ordenar por atividade ou por fixação segue a regra de exibição correspondente.
    Sob eles, tasks.project_id = esse projeto; as definições de agendamento/ociosidade casam com os projetos salvos por mesmo Host + workspace_path, e a identidade remote não é usada como diretório real; as que não casam mantêm NULL e o escopo de execução original. O grupo de bootstrap (task_group_workspace_bootstraps) não cria mais projetos separados.
    Os itens remote do lastWorkspaceSession local só são importados para remote_project_entries na primeira migração, preservando as informações básicas e o identificador de workspace original, aguardando a resolução do ID do projeto remoto após a conexão; não se cria um projeto remoto autoritativo localmente. Source/Profile válidos salvos também importam a relação de membros da conexão, priorizando o Source ID estável já existente e o Profile preferido; entradas com endereço antigo são associadas ao mesmo Host estável, e endereços que nunca fizeram handshake mantêm a identidade de endereço temporária. Depois que existe ledger de migração, não se importa mais a partir do settings
M6 Converte somente os membros do Host atual que detém o banco; os membros remotos sombra legados permanecem na tabela antiga como evidência de migração, e não se cria projeto remoto autoritativo localmente.
    Grupo criado manualmente → projeto: roots = diretórios dos membros deduplicados, primary = o mais frequente entre os membros; grupos com múltiplos hosts são divididos por host com o sufixo do nome do host; o project_id dos membros passa a ser o novo projeto; grupos do sistema são pulados
M6a Julga uma vez, conforme o F3, as tasks históricas que continuam sem atribuição após M5/M6; não sobrescreve um project_id existente, e com zero ou múltiplos casamentos mantém NULL
M7 Preenche project_id em automations / off_peak_tasks (por workspaceKey → seu projeto de root único) e host_id, e fixa additional_directories das definições antigas como [] (a versão antiga vinculava apenas o cwd, sem ampliar permissões pelos roots de projeto posteriores)
M8 Grava schema_migration('0001_projects'); as quatro tabelas antigas de group são mantidas no lugar
A cada inicialização: dentro da mesma transação, identificar primeiro as linhas novas da versão antiga com host_id IS NULL; completar host_id/root_path dessas linhas e, apenas nas que ainda não têm atribuição, decidir uma vez conforme o F3, e então fazer o commit.
  project_id IS NULL, por si só, não indica pendência de migração; linhas não classificadas cujo host_id já foi completado não são decididas de novo.
  As novas sessions descobertas pela CLI recebem, na primeira inserção da linha app, a decisão conforme o F3 com escrita atômica de host_id/project_id; as novas tarefas globais gravam host_id e project_id=NULL diretamente.
  Em seguida, executa a reconciliação de fatos de 7.4 (sem recalcular o project_id de linhas já existentes); deriva de projects/hosts locais e das remote_project_entries ainda mantidas e grava de volta no setting.json (F5); não importa de novo os itens remotos antigos para a tabela de entradas
```

### 7.4 Reconciliação e entrega (a cada inicialização + a cada vez que a workspace CLI está disponível)

```text
Comparação completa de tabelas na inicialização (escala de 4085 linhas, nível de milissegundos)
  deleted=1 AND cli_deleted=0                         → handoff_pending |= 1   (intenção de exclusão de versão antiga ou histórica)
  title_overridden=1 AND (cli_title_source<>'custom' OR cli_title<>title) → handoff_pending |= 2
  updated_at / task_status divergentes do espelho     → ignora (V1 é espelho somente leitura)

Quando a CLI de um workspace está disponível por qualquer motivo (sem levantar um Agent só para a entrega)
  Em lote: bit1 → deleteSession; bit2 → renameSession(title)
  Sucesso → limpa o bit e o sessions-index reescreve o espelho; CLI responde not found → bit1 é limpo (considerado já excluído), bit2 vai para orphan(4) preservando o título do app

Ao assinar o sessions-index e receber um snapshot
  Linhas locais com cli_deleted=0 e ausentes do snapshot → sessionsIndex/reconcile
    deleted=true  → cli_deleted=1 (e escreve também deleted=1)
    exists=false  → handoff_pending |= 4, log de alerta, sem apagar a linha
    exists=true   → atualiza cli_* com o valor retornado (indica que o summary ainda não chegou)
```

As regras de exibição não dependem da conclusão da entrega: ocultar = `deleted OR cli_deleted`, título = `title_overridden ? title : cli_title`, de modo que o que o usuário vê é o mesmo antes e depois da entrega.

Medição local: M2～M8 totalizam 175 ms; backup por tabela da CLI 70 ms (1.9 MB), tasks-index 165 ms (14 MB).

## 8. MRs por fase (publicados na mesma versão)

| MR  | Conteúdo                                                                                                                                                                                                                                                    | Diretórios principais                                     | Verificação                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | migration 0020 da CLI, time_deleted / last_outcome, semântica de deleteSession, SessionSummary.lastOutcome, comando `sessionsIndex/reconcile`, ponto de consumo de additionalDirectories e parâmetros de cold restore do V4, qualifiedName de skill/subagent                                          | apps/zcode-cli                                       | teste unitário + teste de schema do protocolo                                                               |
| 2   | migration runner genérico (extraído da CLI, com touchedTables, backup por tabela, script de restauração e teste unitário de hash por tabela), schema de 5.1, guarda de espaço, execução antes da criação de janelas no main, schema.baseline.sql + diff no CI                                                                                            | packages/services、packages/desktop/main、scripts/ci | teste unitário: cada ramo + fixtures de upgrade/downgrade                                                    |
| 3   | Convergência da atribuição: o syncer escreve apenas cli\_\* e o espelho das colunas antigas; remoção de 3 usos de Date.now; renameTask / deleteTask passam pelo comando da CLI e gravam o bit de intenção; reconciliação da inicialização em 7.4, entrega preguiçosa, reconcile por ausência no snapshot                                                                                            | packages/services                                    | teste unitário + e2e de regressão de título / status                                                          |
| 4   | Serviço de projetos: CRUD de projects/hosts/roots, move session, soft delete e casamento de restauração, resolução unificada de diretórios de 4.3.1 e injeção dos três pontos de entrada, primeira posicionagem do F3 e preservação do estado organizacional NULL, double write do setting.json, prewarm passa a usar o diretório de última atividade, ponto de disparo do arquivamento automático migra para a consulta à árvore de projetos, entradas e cache de projeto remoto local, remoção offline e prevenção de reconstrução na reconexão | packages/services、packages/shared                   | teste unitário: incluindo primeira posicionagem, reinício repetido sem mudar a atribuição, arquivamento automático de tarefas fora do diretório padrão; incluindo remoção de entrada e atualização tardia |
| 5   | UI: árvore de projetos, área de tarefas, linha do tempo, assistentes de criação / edição, arraste e diálogos de confirmação, clique direito, projetos fixados, nós remotos, barra de remoção e UI de group                                                                                                                                            | packages/ui                                          | e2e: CRUD de projetos, arraste e recusa, cenários de atribuição da área de tarefas de 6.1, operações de entrada offline de 6.2                 |
| 6   | composer e página de configurações: sufixo de @arquivo, lista de qualifiedName, # por projeto, fonte de diretórios da página de configurações                                                                                                                                                                                | packages/ui                                          | e2e: capacidade de múltiplos roots de 4.3.2 e cold restore                                                      |
| 7   | Agendamento / ociosidade / Bots passam a selecionar projeto                                                                                                                                                                                                                             | packages/ui/settings、services                       | e2e: seleção de projeto em tarefa agendada                                                                  |
| 8   | Migração do bundle do server remoto + exibição degradada do remoto antigo + hierarquia de projetos na barra lateral do Web / celular                                                                                                                                                                                       | packages/server、web、desktop/main                   | e2e de controle remoto: incluindo subscrições concorrentes de 4.3.2 e recuperação de diretórios remotos; incluindo exclusão offline de 6.2 sem alterar dados remotos e readição manual |
| 9   | Escrita de volta da documentação: descontinuar grouped / bootstrap / task-sqlite-index e outras specs, apontando para este documento                                                                                                                                                                            | docs                                                 | —                                                                                    |

## 9. Riscos e itens a verificar

- Correção de 2026-09-10 na review: restauração com exclusão em cascata do corpo (foreign keys desligadas em 7.1 + verificação), modificação de linhas existentes no período de degradação (reconciliação de intenções na tabela inteira em 7.4), entrega dos fatos de Host históricos (marcação em M4 + entrega preguiçosa), fonte da reconciliação de exclusões (`sessionsIndex/reconcile`). Esses quatro pontos precisam de casos correspondentes nos testes unitários dos MR 2 / MR 3: após a restauração, o número de linhas de message/part não muda; após uma versão antiga escrever `deleted=1` e uma nova atualização, tudo continua oculto; tombstone antigo e orphan; perda de `session.removed` e convergência via reconcile.

- A exibição degradada na janela de incompatibilidade de versão entre o bundle do server remoto e a versão local precisa de verificação em máquina real (SSH, WSL).
- A mudança de visibilidade da soft delete da CLI para o TUI externo (o TUI antigo ainda exibe) foi aceita e precisa ser registrada nas notas de publicação.
- `UNIQUE(host_id, task_id)`: se os dados históricos contiverem o mesmo task_id com workspace_key diferente no mesmo host (herança da migração ACP), a criação do índice falhará, e é preciso sondar e registrar os conflitos antes do M4; em caso de conflito, o índice degrada para não único e dispara um alerta.
- O índice único de nome de projeto por host pode conflitar com nomes de diretório iguais de workspaces antigos (por exemplo, dois `z-code` em caminhos diferentes): o M5 adiciona um sufixo numérico automaticamente.

Complemento ao gate automático de schema: os CHECKs das tabelas existentes, o UNIQUE automático em nível de tabela/coluna e a ordenação/collation de índices pertencem ao contrato antigo de escrita; removê-los ou reescrevê-los deve ser recusado, e índices automáticos com sqlite_schema.sql=NULL não podem passar despercebidos. Novas constraints em tabelas antigas podem fazer a escrita degrada falhar, e o gate exige que o conjunto de CHECK/UNIQUE automático se mantenha consistente; tabelas novas podem declarar constraints livremente. A comparação de SQL normaliza apenas palavras-chave/espaçamento, preservando a capitalização dos literais de string para que mudanças de valor em WHERE não passem despercebidas. Esta verificação opera apenas sobre o banco em memória e não modifica o checksum do histórico de migration nem a baseline.

A atividade remota em tempo real reutiliza a subscrição compartilhada do WindowControllerTaskListRegistry. A árvore de projetos apenas sobrepõe phase/interação pendente por workspaceIdentity/workspacePath completo + taskId, sem alterar o conjunto de linhas retornado pelo SQLite, o título, o estado organizacional ou o tempo de ordenação da CLI. O cwd/roots da tarefa formam os escopos de observação, registrados por observadores de owner via o listTaskList existente, sem criar logical workspace nem Agent. Clientes owner direto sem Controller continuam usando o próprio sessions-index. Quando a origem fica offline ou o overlay é removido, os atributos em tempo real são retirado, e um running antigo não é tratado como estado terminal persistido.

Remover o Renderer remotePinnedTaskStore / remoteTimelineTaskStore, que já não têm leitores. A conclusão da conexão submete apenas o attachment, a identidade do diretório e o rascunho; a lista de tarefas remotas não é mais lida para essas duas caches antigas. Os comandos de organização do Header continuam passando pelo task service original do Host; a projeção de query necessária ao Header e à busca global é mantida, sem reescrever uma imagem espelho da lista remota que ninguém lê. A barra lateral de projetos é atualizada pelas consultas/eventos de mudança do seu ProjectService existente, e os limites de owner/lease e continuous/replayable permanecem inalterados.

D2 de arraste nativo: a linha de tarefa serve simultaneamente à cópia no workbench e à movimentação de atribuição de projeto, e o effectAllowed da origem do arraste precisa permitir copyMove; o workbench continua escolhendo copy e a seleção de projeto, move. O moveTask do Host só é enviado depois do drop, e o cancelamento da confirmação de root ausente não altera nenhum estado persistente. Não se pode substituir a aceitação de evento nativo do navegador por um teste de componente que apenas constrói DataTransfer.

2026-10-16, convergência do menu de projetos remotos: o menu de projetos remotos editáveis (online e não legacy de root único) fica igual ao dos projetos locais, sem exibir「从本机移除」e「添加远程项目」; a sincronização remota e as ações de conexão não mudam.「从本机移除」é mantido apenas como a única ação de gestão quando o projeto não é editável (G5). Apenas os itens de menu são ocultados; a lógica de `removeEntry`, RemoteProjectPicker e `addEntry` é mantida; adicionar projeto remoto continua disponível por outras entradas, como a criação de novo projeto e o seletor após conectar o dispositivo.

2026-10-14, ícones do menu de projeto: clique direito, "mais" e o menu de arquivos de múltiplos diretórios compartilham os ícones de ação: nova tarefa MessageCirclePlus, ver arquivos ListTree, editar Pencil, fixar Pin／desafixar PinOff, excluir Trash2, remover entrada FolderMinus, conectar Plug, adicionar projeto remoto FolderPlus, sincronizar RefreshCw. Os ícones ficam à esquerda do texto, com `size-4` unificado, sem encolher, com `aria-hidden`, reaproveitando o `gap-2` do menu e a cor do texto (inclusive em exclusão, desabilitado e hover). A ordem, o texto e as ações do menu não mudam; no desktop e em telas estreitas do celular, Zai Light / Zai Dark mantêm o alinhamento entre ícone e texto.

O nome do projeto fixado não exibe mais o prego permanentemente à direita. Em dispositivos com suporte a hover, quando o ponteiro entra na linha do projeto, o ícone original à esquerda muda para Pin no mesmo slot `size-4`, e ao sair volta o ícone de pasta atual ou de conexão remota; projetos não fixados e telas de toque sem hover mantêm o ícone original. A exibição é derivada por CSS, sem novo estado e sem alterar a expansão do título, o arraste ou a ação de fixar pelo menu. A aceitação cobre fixado／não fixado, entrada／saída, estado expandido de múltiplos diretórios, ícone remoto, temas claro e escuro e tela estreita, e as posições do texto e dos botões de ação não saltam.

2026-10-13, ícone de múltiplos diretórios: os projetos locais exibem diretamente a indicação de múltiplos diretórios conforme `project.roots.length > 1`, sem inferir pelo número de tarefas, de tabs abertas ou pelo cwd atual. Com 0/1 root, usa-se Folder / FolderOpen; com múltiplos roots, usam-se Lucide Folders / FoldersOpen correspondentes; a versão aberta mantém o contorno sobreposto e expande a pasta da frente. A barra lateral escolhe o ícone de aberto/fechado conforme o estado de expansão atual; o chip de projeto atual do composer e as opções de projeto usam o ícone recolhido, sem introduzir nova semântica de abertura/fechamento de menu. Os dois lugares compartilham o componente de ícone, que é redesenhado quando os roots são atualizados, sem cache independente ou campo persistido. Projetos remotos continuam usando o estado de conexão / ícone de nuvem existentes. Tamanho, espessura de linha, cor de tema e nome acessível seguem o controle em que se encontram. A aceitação cobre 0/1/múltiplos roots, expansão/colapso da barra lateral, item atual/candidatos do composer e roots passando de múltiplos para um; reutilizam-se os casos de desktop do VP14 e de celular do VP13, verificando o gráfico real e o caminho de seleção de projeto nos temas claro e escuro.

2026-10-13, feedback do alvo D2: ao arrastar uma session para dentro de um projeto editável, o contêiner inteiro do projeto exibe um contorno azul de 2px (`border-icon-blue`) e um fundo de destaque claro (`bg-accent`), com o raio de canto em `rounded-xl`. O escopo inclui o título e a lista de tarefas atualmente expandida; projetos recolhidos cobrem apenas o título atual, sem expandir automaticamente. A camada decorativa não recebe eventos e não altera as dimensões. O feedback reaproveita o payload nativo de session e as condições existentes de aceitação do projeto, sem misturar a linha de inserção da ordenação de projetos. O destaque é mantido ao se mover entre o título, as tarefas e os botões de ação do mesmo projeto; sair do projeto, dropar ou dragend (inclusive Escape) limpa imediatamente. Arrastes não relacionados de arquivo/texto e projetos offline/antigos somente leitura não exibem feedback.

```text
session drag -> dragenter/dragover do projeto -> projeto inteiro em destaque (apenas estado temporário do renderer)
              -> troca para nós internos -> mantém
              -> sai/drop/dragend -> limpa
              -> drop -> moveTask existente / confirmação de diretório ausente -> atribuição de projeto pelo Host
```

Reutiliza-se o caso de arraste nativo do VP15, complementando o limite de bloco inteiro, a ausência de deslocamento de layout, a limpeza ao sair/cancelar, a limpeza antes da confirmação, a movimentação bidirecional e as capturas de tela nos temas claro e escuro. O Escape nativo é coberto pela regressão de limpeza via dragend do componente; como o WebDriver não cancela o arraste nativo do Chromium, o E2E de desktop valida o cancelamento arrastando para fora do projeto e soltando, e esse passo não é registrado como verificação de Escape. O controle remoto do celular ainda não habilita o arraste nativo de session (controlado de forma unificada pela entrada de tela dividida do Shell); esta verificação confere a exibição do contêiner compartilhado de projeto no viewport estreito do celular nos temas claro e escuro, e afirma que essa entrada continua desligada, sem novos gestos de toque.

```text
project tree (SQLite rows) ---------------------+
existing Controller -> sessions-index activity -+-> keyed UI overlay
                 metadata cursor/gap repair; conversation delivery unchanged
```

A coordenação de snapshot/gap de metadados do Controller segue o protocolo existente; os limites de recuperação do desktop continuous e do celular replayable permanecem inalterados.

Notificações de mudança de projetos remotos: o owner da conexão física assina o state:projects da conexão após um handshake bem-sucedido e encaminha isso como uma notificação "precisa reler" do mesmo canal local; não repassa dados de projeto nem escreve cache. SourceManager e URL Registry mantêm e liberam cada um as assinaturas do seu próprio transport; após troca/desconexão, eventos tardios são descartados conforme a identidade do objeto de conexão original. Após o Controller reler o banco remoto autoritativo, ele executa a atualização CAS apenas nas entradas ainda mantidas localmente, sem poder adicionar entradas com base no broadcast. Outros canais de settings/state não entram nesta ponte.

Todas as entradas de Server independentes que oferecem RPC de projetos usam a mesma montagem de Host: serverId estável → app migration (owner hostId) → workspace identity mapper/alias service → createLocalServices(standalone-server) → HTTP/RPC. Essa montagem preserva a chave canônica de workspace da CLI, e tanto o HTTP quanto o ServerCore traduzem a identidade remote estável pelo mesmo mapper. Somente as entradas com essa montagem concluída declaram virtualProjects; se a migração falhar, a porta não é aberta. O diretório de configuração continua sendo calculado por cwd/identity, e o serverId não participa do cálculo de caminhos reais.

O endereço do arquivo de configuração do serviço de configurações é fixado, na criação da instância, no HOME daquele Host; projeções assíncronas, migração e fila de escrita leem/travam/substituem pelo mesmo caminho, sem escrita entre Hosts por mudança posterior de variáveis de ambiente. O teste de integração da montagem do Server independente precisa usar um HOME temporário em nível de subprocesso, sem o processo pai revogar o isolamento enquanto tarefas em segundo plano ainda podem estar em execução.

Uma URL Server totalmente nova, sem route hint de SSH/WSL/Docker, tem como chave canônica inicial a identidade estável de server da própria identidade, fornecida pelo Host independente; aliases já registrados e legacy keys com histórico têm sempre prioridade, sem reescrever a identidade antiga da CLI por causa da atualização da entrada. O novo alias permite rotas válidas de server, e a IO real continua usando o cwd.

Limite de implementação do H2: os candidatos da página de configurações passam pela leitura pura de diretórios de projeto (readProjects), com todos os roots dos projetos locais não excluídos e os roots dos projetos remotos ainda mantidos e online deduplicados por workspaceIdentity/path; não se lê a task tree e não se usa a membro de tab para inferir a existência de um diretório. A tab apenas complementa o remoteSessionId/localWorkspacePath já existente. Os candidatos usam o tipo de diretório de configuração, e é proibido sintetizar IDs de tab ou fake session. Antes de a resposta remota chegar, os membros/entradas são relidos, e a remoção seguida de readição também recusa resultados antigos por membership.

A configuração de hooks do Desktop pode solicitar o attachment existente de Source settings, e só o faz depois que um root é escolhido; a conexão física continua pertencendo ao Registry/SourceManager. O conjunto de configurações não expõe Agent e não pode servir como cadeia de recuperação de sessão. O celular mantém o attachment de workspace confiável original, e o limite de permissão de Source settings não muda.

Antes da escrita de configuração remota de um logical workspace não aberto, o attachment de configuração se vincula à chave canônica do cwd pelo sourceServerWorkspaceService existente. O route hint legado fornecido pelo Host serve apenas para recuperações históricas existentes; até a vinculação ser concluída, o destino permanece remote-waiting, e resultados antigos de depois da troca de destino/attachment não podem abrir escrita em um novo destino. Source settings continua não expondo escrita de Agent, task, arquivo ou provider.

As definições de agendamento/ociosidade adicionadas no período de degradação são identificadas por host_id IS NULL, ainda não entregues. A cada inicialização, na mesma transação da reconciliação de intenções de tarefas, o owner é preenchido e a atribuição de projeto é decidida uma única vez pelo root único do mesmo Host, com additional_directories fixado em [] (o suportado pela versão antiga); o escopo de execução das definições antigas não cresce com os múltiplos roots do projeto atual. Definições cujo host_id já foi preenchido (inclusive project_id NULL legítimo) não são recalculadas, seus snapshots de diretório existentes não são sobrescritos, e workspace_key/cwd e o checksum histórico de migration não são modificados.

Complemento ao invariante de escopo da interface: a entrada de controle remoto no footer da barra lateral de projetos continua recebendo o workspacePath, o workspaceIdentity e o remoteSessionId da execução atual; a refatoração da exibição de projetos não pode descartar essa cadeia de identidade nem inferir a atribuição remota pelo cwd.

Atribuição de diretórios na navegação remota de projetos: prepareSession / task histórica do ProjectService já fornecem o cwd e o workspaceIdentity do Host pertencente, e o Renderer entrega esse par ao bind já existente do Host, sem refazer realpath e reconstruir a identidade por outro caminho. A seleção comum de pasta continua sendo resolvida pelo navegador de diretórios original, com caminho canônico. O Host mantém a validação de identidade/membro e a UI mantém a verificação exata de identidade do resultado do vínculo; o julgamento de owner não é afrouxado por apelidos de caminho como `/tmp` e `/private/tmp`, nem o cwd histórico é reescrito.

```text
Host project/task -> cwd fixo + identity -> Host bind existente -> verificação exata de identity
folder picker     -> resolvedor canônico existente -> Host bind existente
```

O transport substituível do V4 no remoto precisa encaminhar integralmente o client context (projectId) de createSession, inclusive depois da troca do proxy de serviço. O projectId não faz parte do envelope da CLI, mas precisa chegar ao prepareSessionCreation do Host pertencente, para que a atribuição seja reservada atomicamente e os diretórios adicionais sejam resolvidos antes da criação na CLI; não se pode truncar esse parâmetro na camada de recuperação do proxy, nem o Server pode adivinhar a atribuição pelo cwd.

Ao reabrir uma tarefa histórica remota reutilizando uma tab já vinculada, só se pode liberar o attachment lógico temporário adicional pedido nesta ocasião; se o sessionId recebido for o owner da própria tab, ele precisa ser mantido. Não se pode cancelar o attachment que ainda carrega a tarefa atual por causa do sucesso da reutilização.

Cold restore e troca de runtime: o ACK de um subscribe em trânsito, depois de uma troca de geração, continua sendo descartado. `fault.subscription.runtimeRestarted` é uma interrupção de troca conhecida e entra no fluxo existente de recuperação de subscrição limitada, não pode virar um error permanente; não se reproduzem commands já submetidos e não se introduzem nova fila nem outro conjunto de temporizadores de retry, e as semânticas de subscrição e recuperação do desktop continuous / mobile replayable mantêm seus limites originais.

```text
subscribe in flight -> runtime available/restart -> old ACK rejected
                  -> existing bounded subscription recovery -> current owner ACK
```

## 2026-09-11 Correções de UI do usuário e complements de migração (substituem as decisões anteriores de UI)

- Reutiliza as interações de linha de projeto e de seção deste projeto: restaura o recolhimento de projetos/tarefas, a ordem de arrastar das seções e as ações de hover, preservando as preferências originais. A nova ação de projeto é `Plus`, a nova ação de tarefa é `MessageCirclePlus`. A capacidade de linha do tempo é mantida, mas o ponto de entrada fica oculto por enquanto; a ordenação de projetos passa para o menu de contexto do título. A linha de projeto não exibe uma seta independente: o estado de recolhimento é expresso por Folder/FolderOpen; hover/focus/touch mantêm os três botões "mais", "ver arquivos" e "nova tarefa". O menu de contexto contém todas as ações de "ver arquivos", "nova tarefa" e "mais", compatível com a tecla de menu do teclado/Shift+F10 e o toque longo em telas sensíveis ao toque.
- O assistente de criação primeiro escolhe local/remoto e depois preenche nome e pasta de origem. O nome usa um input composto com ícone de pasta; a pasta de origem usa uma área inteira clicável de adição; a entrada de caminho pertence apenas ao navegador de diretórios. Projeto com 0 root continua válido. No remoto é possível escolher uma conexão salva ou adicionar uma conexão dentro do assistente, selecionando um projeto existente ou criando um projeto remoto; a barra lateral não oferece uma ação independente "adicionar conexão".
- Quando o nome está em foco, mantém-se apenas o ring já existente na camada externa do input composto; o Input interno não soma um outline. Foco automático, clique com o mouse e retorno por Tab obedecem a essa regra, de forma consistente entre temas claro/escuro, tela estreita e modo de cores forçadas. O DIALOG-FOCUS-01 de `ui-shell/manual-review/pending/command-center-focus.test.ts` valida o diálogo compartilhado de criação e sai por cancelar, sem gravar projeto.
- Reutiliza o diálogo de conexão existente, o navegador de diretórios e os serviços do Host; não cria workspace tab nem Agent para navegar em diretórios. A conexão pertence ao gerenciador de conexões, o formulário apenas guarda o rascunho e a gravação pertence ao Host de destino; resultados de UI atrasados são rejeitados após cancelar ou trocar o alvo. Só se adiciona a entrada local quando um projeto existente é explicitamente selecionado ou quando o salvamento de um novo projeto tem sucesso. Desktop continuous e celular replayable permanecem inalterados.

```text
criação -> local/remoto -> gerenciador de conexões (remoto) -> serviço de arquivos escolhe diretório -> Host.saveProject
                                                            |
                                    entrada local <- salvamento remoto bem-sucedido --+
```

- Um Group criado manualmente só é migrado quando possui membros de session não deletados; Group vazio, apenas membros pendurados ou apenas membros já deletados não criam projeto. Membros arquivados, mas não deletados, continuam válidos. Nome e diretório de membros válidos são preservados; projetos vazios criados explicitamente não são afetados.
- O SQL/checksum já executado de `0001_projects` permanece imutável; apenas o ramo de conversão da primeira atualização é corrigido. Dados de versões de desenvolvimento já migrados não são apagados em lote por nome; o reparo local deve conferir a origem pelo Group antigo, pelos membros e pelo backup de migração, e depois do backup só limpa contêineres vazios comprovadamente migrados por engano e sem referência de tarefa/agendamento.

A seleção do diretório do projeto é roteada por `projectService.readDirectory` conforme o `hostId` até o Host de destino, reutilizando o `fileService`/`systemService` desse Host. O DirectoryBrowser da UI apenas se adapta a este contrato, compartilhado entre desktop e celular; não depende do attachment de Source settings exclusivo do desktop e não resolve/cria identidade de workspace. A consulta não lê nem grava o banco de dados de projetos e não inicia Agent; caminho inexistente/conexão desconectada gera erro explícito.

Quando o assistente de criação se conecta a um Host já salvo, as outras entradas e ações de retorno de conexão ficam suspensas e só são liberadas após a conexão terminar com sucesso ou falha, evitando entrar em dois fluxos de conexão ao mesmo tempo.

### Nomenclatura de Migration ID

Os dois bancos usam um número de quatro dígitos com zero à esquerda, sequencial dentro do banco, mais um nome semântico em `snake_case` (`NNNN_description`), sem misturar versão de produto ou código de schema no ID. A primeira migração versionada do task-index é unificada como `0001_projects`, e as seguintes incrementam a partir de `0002_...`; a faixa `0001_base_session_store` até `0020_session_soft_delete_outcome` da CLI permanece inalterada, cada banco com sua própria numeração.

Desta vez corrige-se apenas o nome `v3_projects`, usado durante o desenvolvimento; o texto SQL, o checksum, o app_version, o tempo de execução e a lógica de conversão de dados permanecem inalterados. A atualização oficial usa o novo ID; os bancos locais que já rodaram esta branch de desenvolvimento fazem a conferência do checksum antigo, fazem backup e então, dentro de uma transação, atualizam apenas o `schema_migration.id`. Não se adiciona alias histórico nem um segundo caminho de conversão no runner público, e dados já executados não são tratados como primeira atualização para remigrar; a manutenção local deve verificar que o conteúdo de todas as tabelas de negócio permanece inalterado.

### Complemento das ações rápidas na linha de projeto

O menu "mais" e o menu de contexto reutilizam a mesma definição de ações, e ambos são não modais; os botões de atalho não acionam o recolhimento da linha. "Ver arquivos" reutiliza o `WorkspaceFileTree` existente: com um único root abre diretamente; com múltiplos roots a escolha acontece no menu do botão de arquivos; com zero roots o botão permanece desabilitado e nenhum diretório ou tarefa é criado. Remoto offline ainda permite apenas remover a entrada local e não usa o serviço de arquivos local para ler caminhos remotos.

O alvo de exibição da árvore de arquivos pertence à UI da barra lateral; o estado de recolhimento do projeto é mantido na barra lateral persistente por Host + ID de projeto e é preservado ao voltar para a lista após ver arquivos. Conexão/binding remoto pertence ao gerenciador de conexões existente; apenas a ação explícita "ver arquivos" solicita o binding do workspace, e no celular só se usa a troca confiável de workspace do shared-host. Requisições de abertura antigas e atrasadas não podem sobrescrever a nova seleção; a atribuição de tarefas e a semântica continuous/replayable permanecem inalteradas.

```text
clique na linha do projeto / menu de contexto -> mesma definição de ações -> escolher root
  local    -> árvore de arquivos existente (path)
  desktop remoto -> conexão existente do Host e binding de workspace -> árvore de arquivos (path + identity + sessionId)
  celular  -> troca no shared-host -> árvore de arquivos já vinculada
```

### Lista de pastas de origem no editor de projeto (correção do usuário de 2026-09-11)

- Com zero roots, mostra o bloco inteiro "Adicionar pastas que o ZCode pode ler e editar"; depois que existe ao menos um root, passa a ser a mesma lista com borda, cuja última linha é FolderPlus + "Adicionar pasta", sem continuar exibindo o cartão grande de estado vazio. Cada linha de root mostra o ícone de pasta, o nome do diretório de último nível (o caminho completo fica no title), à direita a marca "principal" ou o botão "definir como principal" e o botão de remoção.
- "Definir como principal" altera apenas o rascunho do editor; só a gravação, via `saveProject(primaryRoot)` existente, escreve no Host de destino; cancelar não grava. O primeiro diretório é principal por padrão; ao remover o diretório principal, escolhe-se o primeiro restante; ao remover todos, não há principal. Novas tarefas usam o diretório principal mais recente via `prepareSession`; o cwd das tarefas existentes não muda.
- Ao editar um projeto existente, o botão de excluir o projeto é restaurado no canto inferior esquerdo; na criação não há botão de exclusão. Reutiliza-se a semântica de exclusão lógica de `deleteProject`, sem apagar arquivos ou tarefas e sem camada extra de confirmação; no remoto é obrigatório enviar o `hostId` original, e a falha mantém o diálogo aberto mostrando o erro, sem degradar para remoção local. Gravar/excluir compartilham o estado de exclusividade de submissão e, após o sucesso, a lista é atualizada e o editor fechado.
- O rascunho do formulário pertence ao ProjectEditor, o estado persistido pertence ao `projectService` do Host, e reutilizam-se o navegador de diretórios e a API já existentes; não são adicionados schema, migration ou fila de sincronização. Desktop e celular usam o mesmo caminho de UI/serviço, e os limites continuous/replayable não mudam. Temas claro/escuro, caminhos longos e layout de 390px precisam ser verificados.

```text
definir como principal / remover root -> rascunho do editor -> salvar -> Host.saveProject do destino
                                                 -> nova task prepareSession usa o diretório principal
                                                 -> cwd das tarefas antigas permanece
excluir projeto -> Host.deleteProject do destino -> atualizar -> fechar o editor
```

### Preservação da experiência antiga do produto (confirmação final do usuário de 2026-09-11)

#### Correções de regressão na barra lateral (2026-09-14)

- Estabilidade da ordem após exclusão (2026-10-15): o menu do projeto, a exclusão pelo editor e a remoção da entrada offline atualizam o diretório autoritativo apenas por meio dos comandos existentes. Entre o retorno do comando e a atualização do diretório, o projeto permanece na posição original; quando o novo diretório chega, ele desaparece diretamente e a ordem relativa dos demais projetos não muda. A exclusão não limpa antecipadamente as chaves de ordenação do lado controlador, caso contrário os projetos do diretório antigo seriam tratados como itens sem ordenação e anexados ao final. Reutiliza-se a regra de preferência que preserva a posição de projetos temporariamente invisíveis; se a atualização falhar, o diretório antigo e a ordem são mantidos. Não são adicionados cópias de exclusão, temporizadores nem compensações de animação. Desktop e celular continuam compartilhando o owner do diretório, e o comando remoto continua sendo roteado pelo `hostId` original.

```text
excluir / remover entrada -> comando do serviço dono -> atualização do diretório autoritativo -> o projeto some da posição original
preferência de ordenação do controlador -------------------------------> mantém a ordem relativa dos demais projetos
```

- "Fixado" restaura `text-ui-base font-medium text-foreground-subtlest`, alinhado à margem esquerda dos títulos de seção de projeto/tarefa (cerca de 18px). Tarefas fixadas restauram o padding horizontal externo de 8px. Os títulos de seção recuperam o padding externo de 8px, sem somá-lo às linhas de projeto.
- A lista de sessões da seção "Tarefas" compartilha o padding esquerdo de 8px das sessões dentro do projeto: fundo de hover da linha inteira, texto, estado vazio e entrada de paginação recuam juntos; temas claro/escuro e layout de 390px permanecem consistentes (correção de 2026-10-14).
- A lista de projetos restaura o deslocamento e a transição da ordenação vertical com dnd-kit, com suporte a ponteiro e teclado. Dentro da seção de fixados, é permitido trocar posições entre Hosts diferentes; grava-se apenas a preferência da barra lateral do controlador atual, sem alterar a `position` remota. Arrastar tarefas para dentro de um projeto continua passando pelo payload nativo de session e por `moveTask`, sem acionar a ordenação de projetos. Cliques, menus, criação e a entrada de arquivos não iniciam arrasto por engano, e cancelar com Escape não grava nada.
- O Host é o único owner da ordem dos projetos já submetida; durante o arrasto há apenas transformações de UI e, ao soltar, a ordem é submetida por `reorderProjects` e a lista é atualizada; em caso de falha, a árvore autoritativa é mantida e um aviso é exibido. Os limites de desktop continuous e de celular shared-host/replayable não mudam.
- Projetos expandidos e vazios e listas de tarefas vazias de Hosts online exibem a internationalização `taskList.noTasks` (em chinês "暂无任务"), preservando o recuo de texto das tarefas antigas; a seção de fixados vazia não exibe título nem estado vazio, e os estados offline/carregando não forjam "暂无任务".
- O `~/.zcode/workspace/default` do sistema às vezes foi criado como projeto pela primeira migração, por settings antigos ausentes ou com `purpose` gravado errado. A nova migração pontual `0006_default_workspace_tasks` não altera o SQL/checksum do 0005 já publicado: corrige apenas o projeto automático criado na migração antiga, com root único apontando para o default do sistema, sem renomeação/edição; o `project_id` das tarefas é esvaziado e o contêiner criado por engano é excluído logicamente. O default em caminhos comuns e os projetos criados manualmente/renomeados/com múltiplos roots são preservados. Só se grava nas tasks/projects do Host; o cwd das tarefas, o espelho da CLI, fixado/arquivado/não lida e os snapshots de execução agendada/periódica permanecem inalterados. A migração tem backup por tabela e rollback em caso de falha de transação; inicializações repetidas não recalculam a atribuição.

```text
arrastar -> deslocamento na UI -> reorderProjects no mesmo Host -> ordem do Host -> readTree
projeto default da migração antiga -> transação 0006 -> tasks.project_id=NULL -> área de tarefas original
                               -> projects.deleted=1 -> não exibe o projeto criado por engano
```

Aceitação: VP31 (tamanho de fonte/recuo/estado vazio, animação de ordenação por ponteiro, cancelamento/ordenação por teclado, ordem após atualização, temas claro/escuro e 390px); VP28 Complementa a atualização do system default com `purpose` marcado errado e a preservação das tarefas. Testes unitários de armazenamento cobrem o ledger existente, a primeira atualização, caminhos do Windows, arquivado/fixado/não lida e hash das outras tabelas, projetos criados manualmente com o mesmo nome e a idempotência. Quando a execução real em celular/SSH/WSL não for feita, isso é listado como limitação à parte.

Esta seção substitui as regras de ordenação e exibição simplificadas durante a implementação. Group antigo e suas cores, ordenação manual de membros e títulos fixos no topo não são restaurados; clicar no projeto apenas recolhe/expande e não entra no rascunho de diretórios. A linha do tempo, o arquivamento e a entrada independente de conexão, antes escondidos de forma explícita, não são restaurados. O restante preserva a experiência antiga do produto:

- As listas de projetos e de não classificados mostram 5 itens por padrão, somando 5 a cada vez; a seção de fixados mantém o título "Fixados", com 20 itens por padrão, e pode mostrar todos ou mostrar menos. A paginação não é reiniciada por atualizações com snapshots equivalentes.
- Tarefas running/prewarming têm prioridade nos projetos e nos fixados; a camada de execução é ordenada por data de criação da CLI em ordem decrescente e por taskId em ordem decrescente; a camada comum usa a preferência de criação/atualização, com o outro tempo como segunda chave e taskId em ordem decrescente. Reutiliza-se o comparador original e é proibido gravar o tempo de modificação da organização do Host ou `Date.now` na ordenação; a fonte de verdade da CLI e a política de ordenação da UI são dois limites distintos.
- A escolha de criação/atualização vai para o menu de contexto do título do projeto, claramente distinta da ordenação dos contêineres de projeto; a preferência de tempo das tarefas antigas continua sendo lida. O modo de ordenação dos contêineres de projeto e a preferência de recolhimento por Host+projectId são persistidos no navegador; projetos históricos locais de root único podem ler inicialmente a preferência de recolhimento do workspace original, e a preferência nova explícita tem precedência, sem ler o estado dos Groups antigos.
- O realce da tarefa atual precisa casar ao mesmo tempo com o workspaceKey atual do Shell e com o `activeTaskId` daquele workspace. O desktop reutiliza a assinatura de estado de controle remoto existente, exibindo a marca de acesso pelo celular conforme o workspaceKey+taskId completo, sem alterar o encadeamento desktop continuous / mobile replayable.
- Quando um projeto está recolhido e possui membros não arquivados e não lidos, exibe-se um ponto azul do tamanho original à direita do nome do projeto; isso inclui tarefas fixadas que ainda pertencem ao projeto e exclui IDs de projeto iguais de outros Hosts. Depois de expandir, a não lida é exibida pela linha da tarefa; clicar para expandir não limpa a não lida. A não lida é derivada do `readTree` do Host, sem nova tabela de contagem nem estado de sincronização; offline, sem fatos de tarefas, não se forja não lida.
- O arquivamento bem-sucedido limpa o estado de UI da tarefa correspondente, e a tarefa atual sai dos detalhes, em coerência com o Header; em caso de falha, a sessão é mantida e um aviso é exibido. Fixar/desafixar exibe primeiro a intenção em trânsito, que é revertida com aviso em caso de falha; a linha autoritativa continua vindo do Host. A intenção de fixação em trânsito é limitada pela direção completa da tarefa, e respostas antigas atrasadas não podem sobrescrever a nova árvore. A não lida continua usando o CAS `expectedUnreadAt`.
- Linhas de tarefas comuns não oferecem o botão de árvore de arquivos à direita; tarefas na seção de fixados recuperam a entrada "ver arquivos" (2026-10-12); linhas de projeto mantêm a entrada "ver arquivos". Botões de tarefa agendada/plugin recuperam o estado selecionado.
- Projetos remotos recuperam o menu rápido de sincronia de Skills/MCP/Plugins e o escopo de plataforma original (desktop online SSH/WSL; o celular não ganha capacidade nova de sincronia); a sincronia usa os dialogs, workspace services e fluxo de atualização já existentes. No remoto, o escopo de operação é o diretório único e fixo, e é proibido acrescentar ou mesclar a configuração de outros roots; attachments não prontos não enviam RPC.
- A linha de conexão reutiliza a exibição existente de log de reconexão e de detalhes de falha/cópia; o progresso de conexão pertence ao gerenciador de conexões e a UI não cria outra máquina de estados de conexão. Erros da lista e erros de uma conexão específica são apresentados separadamente.

Camadas: `project-sidebar` é o módulo de UI, e seletores puros apenas derivam dados; o hook de preferências gerencia apenas preferências de exibição; o hook de interação de tarefas apenas adapta comandos de tarefa existentes e intenções de UI em trânsito; os componentes de operações remotas apenas adaptam as interfaces existentes de conexão/sincronia. A atribuição de negócio, a validação de comandos e a gravação em disco permanecem no Host Service, sem criar novos Repository, cache de fatos ou filas de comandos aceitos na UI. O `TaskList` existente ganha apenas parâmetros opcionais de exibição/callback de arquivo necessários, mantendo compatibilidade com as demais chamadas.

```text
Host readTree + atividade da CLI -> seletor puro -> ordenação / exibição de recolhido e não lida
Shell active workspace + UI da tarefa -> estado selecionado; mobileViewState -> marca do celular
usuário fixa -> intenção em trânsito na UI -> comando Host existente -> atualização autoritativa -> libera a intenção
                          falha -> reverte a intenção + aviso
usuário arquiva -> sucesso do comando Host existente -> limpa a UI da tarefa + atualização
menu remoto -> attachment de workspace existente -> dialog/service de sincronização original
```

Desta vez não se modifica schema/migration nem o banco de dados local. A regressão inclui isolamento completo de identidade local/remota, atualização/falha/resultados atrasados, 390px e temas claro/escuro; se a execução real em celular/SSH/WSL não ocorrer, as limitações devem ser listadas à parte.

Complemento de implementação para o diagnóstico de conexões: `remote-projects.readDirectory` obtém o status/erro do gerenciador de conexões a partir da mesma porta de montagem, e a recuperação para `online` limpa o erro antigo, sem escrever no SQLite. O progresso da conexão do projeto reutiliza a cadeia de logs do `requestId` do AsyncLocalStorage existente, associando `hostId+membershipId`; a UI exibe apenas os logs do membro atual, e remover/re-adicionar não pode receber os logs do membro antigo. Não se cria um novo owner de conexão nem mecanismo de retry.

A porta de logs de conexão continua usando `TransportContext.onLog`: na montagem do Host injeta-se um callback unificado de relato, e o serviço de gerenciamento apenas repassa o callback ao connect context do manager existente; não se adiciona um novo owner de estado de conexão. A árvore de arquivos do projeto mantém o roteamento atual de root/Host e o attachment confiável do shared-host; fechar ou escolher um novo alvo invalida o alvo de arquivo atrasado.

Ciclo de vida da intenção de fixação: cobre apenas o comando do Host e o período em trânsito desta atualização autoritativa; a intenção é liberada quando a atualização termina (com sucesso ou falha), sem exigir que o valor consultado seja igual ao valor esperado. Outro cliente pode modificar o pin novamente nesse período, e é preciso mostrar o fato mais recente do Host, sem manter a intenção concluída como uma segunda cópia de estado.

### Correção da animação de recolhimento de projeto e das entradas na linha de tarefa (2026-09-11)

A expansão/recolhimento do projeto reutiliza o Collapsible, CollapsibleTrigger e CollapsibleContent usados pelo antigo WorkspaceSidebarItem: transição de altura de 300ms e fade do conteúdo, e a lista de tarefas só é desmontada depois de a animação de recolhimento terminar; cliques rápidos em sentido inverso são dirigidos pelo mesmo valor `open` controlado, sem temporizador adicional nem outra cópia do estado de recolhimento. A preferência de recolhimento continua pertencendo a `useProjectSidebarPreferences`; expandir não navega, não altera a não lida e não funciona offline.

As linhas de projeto, não classificado e linha do tempo não exibem o botão de árvore de arquivos. As tarefas na seção de fixados recuperam a entrada "ver arquivos" à direita: reutiliza-se `TaskRowActionButton` e o ícone `ListTree`, exibidos em hover/focus/touch; o clique não seleciona a tarefa, não modifica a não lida e abre o `workspacePath` fixado na tarefa, e não o diretório principal atual do projeto. Tarefas locais não dependem de uma tab aberta; tarefas remotas só oferecem a entrada quando existe uma session para a identity correspondente, e é proibido recorrer à leitura local de arquivos. No celular, primeiro reutiliza-se a troca confiável de workspace; a abertura/fechamento de arquivos de projeto e de tarefa compartilha um único número de requisição, e trocas atrasadas não podem sobrescrever a nova seleção nem fechá-la. Mantêm-se o "ver arquivos" da linha de projeto, o arquivamento/fixação e as ações originais de menu de contexto. Desktop e celular usam o mesmo ponto de renderização, sem modificar Host/CLI, `workspaceIdentity` ou o encadeamento continuous/replayable, e sem mudanças de schema/migration.

```text
clique no projeto -> owner original da preferência de recolhimento -> Collapsible.open
                             -> animação de altura/opacidade -> conteúdo desmontado ao final do recolhimento
clique reverso rápido ----------------> mesma atualização do valor open (sem timeout extra)
```

A animação de opacidade do Collapsible compartilhado deve ser aplicada diretamente pelo `data-state` do content atual à sua camada filha, e não por um seletor de grupo homônimo que possa atingir qualquer ancestral; quando há nós de projeto aninhados dentro da área de projetos, o externo manter-se `open` não pode sobrescrever o fade-out do `closed` interno. A altura continua sendo dirigida pelo próprio content atual, sem estado de animação adicional.

### Complemento de 2026-09-11: seletor de projeto do campo de entrada com a mesma origem da barra lateral

- O seletor de projeto lista os projetos virtuais completos e não deletados da barra lateral, incluindo diretórios não abertos, projetos com zero root, nomes customizados e entradas remotas retidas localmente; não lê mais as workspace tabs e não trunca nos 5 primeiros. A ordenação de projetos reutiliza as preferências da barra lateral; projetos fixados vêm antes dos comuns e a ordem dentro da área é preservada. O texto de busca é "搜索项目" / "Search projects", buscando por nome de projeto e por roots.
- O Provider de nível de janela de `project-sidebar` guarda sozinho a leitura da árvore de projetos e as preferências; a barra lateral e o composer leem a mesma projeção. O Host continua sendo a única autoridade sobre projetos, roots e entradas remotas; a UI não grava no banco e não cria um segundo cache de projetos. Erros de leitura são exibidos explicitamente, sem recorrer às tabs. Entradas remotas offline/não resolvidas são visíveis, mas não selecionáveis.
- O estado selecionado usa o `projectId` do rascunho e a identidade Host do workspace; projetos diferentes com o mesmo cwd são independentes. Sem atribuição de projeto, exibe-se "选择项目". A seleção chama apenas o `onCreateTask({projectId, hostId})` existente, e o `prepareSession` do Root/Host prepara o diretório principal (com zero root, completa automaticamente) antes de entrar no rascunho; não infere atribuição por diretório e não sobe um Agent só para exibir projetos. O cwd e a atribuição de sessões já submetidas não mudam.
- Mantêm-se a aparência original do menu, a busca, a conexão remota e as entradas "trabalhar fora do projeto"/"sair"; listas longas rolam dentro do menu. Renomeação, remoção e mudanças de ordem de projetos refletem-se nos dois lugares ao mesmo tempo.
- 2026-10-13: o "打开文件夹" do rodapé é substituído por "创建项目" / "Create project" (reutilizando `project.create`). Após a escolha, o menu fecha e o mesmo `ProjectCreation` da barra lateral é montado, reutilizando dispositivo/nome/roots, a confirmação de confiança do diretório, o fluxo de gravação e atualização. O dispositivo padrão também é o mesmo da barra lateral: sessões remotas existentes usam o dispositivo de destino e o padrão é local. Gravar ou cancelar não abre workspace, não cria sessão e não altera o projeto/rascunho atual; após gravar, o novo projeto pode ser selecionado explicitamente a partir da lista compartilhada. O celular também usa o serviço de projetos e não é afetado pela chave de capacidade nativa de abrir pastas; novos dispositivos remotos continuam sujeitos às limitações de capacidade originais. Depois que o chat cria uma conexão remota, ele entra no fluxo de diretório obrigatório via [#21](../../issues/remote-connection-ux/21-chat-settings-round-trip.md); a criação comum usa o dispositivo padrão acima e não herda o resultado da conexão.

- 2026-10-13: o cabeçalho do composer, depois do seletor de branch (que no modo escritório é a entrada de plugins), exibe um botão rápido `Plus`, com tooltip e nome de acessibilidade "编辑项目" / "Edit project". O botão só aparece para o projeto selecionado que seja editável; não aparece sem atribuição, para projeto deletado, offline ou em projetos antigos somente leitura. O projeto atual continua sendo resolvido pelo mesmo menu por `projectId` + Host, sem inferência por cwd. O clique abre diretamente o mesmo `ProjectEditor` da barra lateral, permitindo renomear e gerenciar diretórios, reutilizando as restrições originais de exclusão e de remoto. Gravar/excluir passam pelo serviço de projetos original e atualizam o diretório compartilhado; cancelar não grava, e editar não dispara criação de tarefa nem navegação de diretório, e o rascunho de texto é preservado. Quando a identidade do chat/rascunho muda, o editor antigo fica inválido e não pode ressuscitar ao voltar. Este atalho é habilitado apenas pelo shell de chat; automações e outros consumidores do seletor não ganham o botão.

```text
Host readTree + entradas remotas retidas -> ProjectDirectoryProvider -> sidebar / composer
criação pelo composer / sidebar + -> ProjectCreation -> ProjectEditor -> confirmação de diretório -> Host saveProject -> refresh
                         -> cancelar / gravação concluída -> sessão e rascunho atuais preservados
composer + -> projectId + Host atuais -> ProjectEditor -> Host saveProject / deleteProject -> refresh
           -> cancelar -> sessão e rascunho atuais preservados
usuário seleciona {hostId, projectId} -> createTask existente do Root -> Host prepareSession -> rascunho
 desktop: navegação continuous existente
 mobile: attachment shared-host existente -> navegação replayable
```

As leituras assíncronas reutilizam o número de requisição existente e a verificação remota de membership; não há novo stream, owner, fila de aceitação ou migração persistente. O celular reutiliza apenas o Source já online, passando pela admission original do shared-host, sem criar outro runtime.

### Metadados da tarefa atual e finalização do arquivamento automático (2026-09-11)

- Os metadados dos detalhes são lidos pelo `ZCodeTaskService.getTaskMeta` já escopado por workspace, que lê o índice do Host (espelho de fatos da CLI + estado organizacional do Host); não lê mais o `readSession` do runtime ativo da CLI e não depende de a lista/cache de consulta antiga conter por acaso a tarefa atual. Histórico já arquivado, aberto explicitamente, continua legível. Quando o índice ainda não existe na primeira versão, reutiliza-se apenas a metadata otimista ainda não submetida, sem novo escritor de fatos.
- A leitura dos detalhes é possuída pelo hook de tarefa ativa existente; escuta as mudanças de lista do workspace atual, o `taskListVersion` existente e o broadcast de projects para reler. As requisições são isoladas por service/attachment + workspaceKey + taskId; requisições posteriores têm precedência, e trocar de identidade ou desmontar descarta resultados atrasados. As falhas são registradas em log, e não se usa o título da tarefa anterior para preencher a atual, nem se restaura a CLI por causa do título.
- O critério de arquivamento automático, a vigência retroativa de sete dias e o CAS de não lida permanecem inalterados. Quando a árvore de projetos aceita um novo resultado, apenas para tarefas do mesmo Host + workspaceKey + taskId que passem de `archived=false` para `true`, chama-se o `removeTaskState` existente para limpar o estado selecionado/los detalhes desta janela; arquivamento manual, automático ou pelo outro lado produz o mesmo efeito. Ler um registro já arquivado pela primeira vez, linhas ausentes offline, a remoção da entrada de projeto ou respostas com falha não são tratados como evento de arquivamento; abrir explicitamente um histórico já arquivado continua visualizável.
- Quando o arquivamento automático ocorre, sai-se dos detalhes atuais para o rascunho do workspace original, sem selecionar automaticamente a próxima tarefa de mesmo nome. Navegação e rascunho continuam possuídos pelo store de UI de session existente; o hook de leitura de projetos compara apenas dois snapshots aceitos, sem persistir uma segunda cópia de `archived` nem adicionar temporizador de sincronização.
- Schema/migration da CLI/Host, owner/lease e o protocolo de fluxo de mensagens permanecem inalterados. Metadados remotos passam pelo service/attachment escopado existente; o desktop mantém continuous e o celular mantém shared-host + replayable; a limpeza do arquivamento não envia comandos de parada/exclusão de CLI.

```text
fato da CLI -> Host tasks-index <- comando de archive do Host / arquivamento automático
                 |                              |
         getTaskMeta + evento de mudança    resultado aceito do readTree
                 |                              |
           título da tarefa atual           false -> true -> removeTaskState
corpo: desktop continuous / mobile replayable, cada um seguindo a recuperação subscribe V4 original
```

Aceitação: AMT01 o título real pode ser lido antes da restauração do corpo do histórico frio, e é sincronizado após o rename; AMT02 (reescrito em 2026-09-14) uma tarefa antiga já lida e outra antiga não lida, com mesmo nome, com o arquivamento de sete dias ligado, a já lida é arquivada pela varredura de mudança de settings e sai da lista; ao abrir a não lida, apenas a não lida é limpa, ela permanece aberta e na lista, e a outra não muda; AMT03 um histórico arquivado aberto explicitamente é legível, e linhas ausentes/offline/consultas atrasadas não podem limpar por engano o estado selecionado atual; AMT04 identities remotas diferentes no mesmo caminho, troca de tarefa e retornos fora de ordem não misturam títulos/arquivamento. Testes unitários cobrem tempo e isolamento; E2E pendente cobre Host/SQLite/renderer reais, com a evidência de execução de desktop e de celular/remoto reportada separadamente.

### O ponto de disparo do arquivamento automático sai das ações de UI (2026-09-14, mantenedor)

Decisão do usuário: tarefas que atendem ao critério já deveriam ter desaparecido da lista, e a decisão de arquivar não pode ser disparada por "clicar em uma session". Antes, o ponto de disparo estava pendurado na consulta da árvore de projetos `readTree`: abrir uma tarefa antiga não lida → CAS limpa a não lida → a barra lateral atualiza conforme o taskListVersion → o readTree executa archiveInactive de passagem → a tarefa recém-aberta é arquivada em menos de 1 segundo e sai dos detalhes, e o usuário percebe como "não abre" (`sess_aa1fce05…`, reproduzido via CDP em 2026-09-14).

- O ponto de disparo passa a ser o agendador periódico do Host (`packages/services/src/project/autoArchiveScheduler.ts`): a varredura ocorre uma vez assim que a montagem do serviço termina e depois a cada 5 minutos (reduzido de uma hora em 2026-09-15); mudanças em `taskAutoArchiveEnabled` / `taskAutoArchiveOlderThanDays` disparam uma varredura complementar imediata. As varreduras são seriais, e requisições repetidas durante uma varredura em andamento são combinadas em uma única varredura complementar; desktop-attached-remote não inicia o agendador, e o Host remoto varre o próprio banco.
- `readTree` / `readProjects` são somente leitura, e o serviço de projetos não mantém mais entradas `autoArchive` / `beforeRead`; clicar, atualizar ou trocar de tarefa não altera nenhum `archived`.
- O critério permanece inalterado; continua havendo isenção para "tarefa concluída que está sendo visualizada" (decisão de 2026-09-11): quando a varredura periódica atinge os detalhes atuais, a limpeza existente da árvore de projetos para false → true sai dos detalhes normalmente.
- Remover os valores `auto_archive` / `realtime_sync` de `workspace_task_list_changed.reason`, que não tinham emissor.

```text
mudança de settings ──┐
primeira rodada ──────┼─► scheduler.scan() ─► archiveInactive(cutoff, activeTasks) ─► publishProjectChange ─► árvore de projetos false→true ─► removeTaskState
a cada 5 minutos ─────┘
clique na tarefa ─► setTaskUnread(CAS) ─► V4 subscribe            (não entra mais na cadeia da esquerda)
```

Aceitação: AMT02 passa a ser "ligar o arquivamento de sete dias → a tarefa antiga já lida é arquivada pela varredura de mudança de settings e sai da lista; abrir uma tarefa antiga não lida apenas limpa a não lida, e a tarefa permanece aberta e na lista"; a primeira rodada, o intervalo, a varredura complementar por mudança de settings, a combinação serial e o dispose do agendador são cobertos por testes unitários.

### O critério do arquivamento automático passa a ser puramente por tempo (2026-09-15, mantenedor)

O usuário viu uma tarefa `error` de 31 dias atrás ainda na lista e decidiu "puramente por tempo, fixadas não são afetadas". Dados locais: entre as tarefas vencidas, já lidas e não arquivadas, há 324 do tipo error e 346 sem resultado da CLI; o critério antigo (apenas completed) as mantinha para sempre na lista; e não lida deixou de ser condição de proteção.

- Critério de `archiveInactive`: `archived=0 ∧ pinned=0 ∧ deleted=0 ∧ cli_deleted=0 ∧ cli_updated_at < now − N dias ∧ host_id = este Host`, excluindo em seguida `activeTasks` (sessões em estado não terminal observadas pelo syncer, como rede de segurança). Linhas de reserva sem fato, com `cli_updated_at` NULL, não satisfazem a comparação e não são arquivadas.
- O arquivamento não altera a não lida nem os fatos da CLI; tarefas não lidas que são arquivadas continuam aparecendo com não lida na gestão de arquivamento.
- O intervalo de varredura passa de 1 hora para 5 minutos; os pontos de disparo continuam sendo a primeira rodada na inicialização, a varredura periódica e a varredura complementar por mudança de settings, sem ficar pendurado em nenhuma ação de UI.
- O texto da página de settings é sincronizado para "arquiva automaticamente as tarefas cuja última atividade ultrapassa o período de retenção; tarefas fixadas e em execução não são afetadas".

Aceitação: AMT02 passa a ser "ligar o arquivamento de sete dias → as tarefas já lidas e não lidas de 28 dias atrás são arquivadas, e as tarefas antigas fixadas e as de 6 dias atrás são preservadas; abrir a tarefa não lida de 6 dias atrás apenas limpa a não lida e a mantém aberta"; os testes unitários do repositório cobrem as exceções pinned / running / recent / nofacts e o arquivamento de unread / error / NULL.

### Reativação após a correção do arquivamento automático (2026-10-14)

Quando o arquivamento automático das versões antigas não funcionava, o usuário pode ter já ligado a opção. Depois da correção, não se pode arquivar em lote sessões históricas com base apenas no valor antigo durante a primeira varredura da atualização; o usuário precisa religar na nova versão.

- A migração de settings ganha a marca interna `taskAutoArchiveResetVersion: 1`. Quando o setting original não tem a marca, `taskAutoArchiveEnabled` é reposto uma única vez para `false` e a marca é gravada, preservando `taskAutoArchiveOlderThanDays` e os demais settings. Usuários novos continuam com o padrão desligado.
- Reutiliza-se o ponto de entrada de migração do schema completo de settings, junto com a fila de escrita, o lock de arquivo, a releitura dentro do lock e a escrita atômica do SettingService. O `get()` só retorna depois que a migração foi persistida; se a escrita falhar, a varredura falha e não lê o valor antigo de ligado para continuar arquivando. Leituras concorrentes não podem sobrescrever a escolha nova que o usuário acabou de salvar.
- Depois que o usuário religa na gestão de arquivamento, o evento de submissão de settings dispara a varredura imediata; reinícios posteriores, leituras repetidas e upgrades preservam a escolha do usuário. A marca de migração serve apenas para a migração de settings; o agendador continua consumindo apenas a opção e o número de dias de retenção, e a UI não ganha novo estado nem diálogo de confirmação.
- O SettingService de cada Host migra apenas a própria configuração; tarefas remotas são executadas pelo Host remoto, e desktop-attached-remote não migra settings remotos localmente. Os limites de desktop continuous e de celular shared-host/replayable não mudam.
- Não se alteram dados de sessão, não se restauram sessões antes arquivadas e não se ajustam critério, período ou dias de retenção do arquivamento.

```text
Host primeira rodada/varredura periódica → SettingService.get → releitura da config antiga dentro do lock
                                          ├─ sem marca: desliga a opção e grava a marca
                                          └─ com marca: mantém a escolha atual
                                      → persistência bem-sucedida → retorna a política → decide se arquiva
usuário religa → SettingService.update confirma → evento de settings → varredura imediata
```

Aceitação AMT05: config antiga ligada, com sessão vencida → cold start → opção desligada, dias preservados, sessão ainda presente; ativação manual → sessão antiga arquivada; novo cold start → a opção continua ligada. Testes unitários cobrem config nova, cada valor da opção antiga, migração repetida, leitura/escrita concorrentes, settings de Host independente e falha de persistência da migração; o E2E reutiliza o fixture de histórico isolado do AMT02, permanecendo pending.

Verificação: macOS Electron `desktop-e2e-20261014095631138-p83694-9cfbd531c2af7be8` 2/2 aprovado, cobrindo o desligamento no cold start com config antiga, o arquivamento real em SQLite após a ativação manual, a preservação da ativação no segundo cold start e os caminhos existentes de título/fixação/não lida. Capturas de tela e logs do Host confirmam que apenas duas sessões vencidas foram arquivadas, depois da ativação manual. Testes unitários do root: 1432 arquivos / 16280 casos aprovados, 6 pulados; typecheck de root/E2E, lint, arquitetura e fixture check aprovados. O pareamento real em celular, SSH/WSL e a GUI em Windows/Linux não foram testados; o isolamento de configuração por Host independente é coberto por testes unitários de serviço, e o caso permanece pending.

## Busca na barra lateral e troca de visualização (2026-09-15, SBV01–SBV06)

Esta seção substitui as regras anteriores de "entrada da linha do tempo oculta, ordenação de projetos/tarefas por menu de contexto, leitura das preferências de tempo antigas".

- A área de navegação (nova tarefa, automação, mercado de plugins) é separada da área de lista, e entre as duas usa uma linha divisória de 1px `border-border/50`, que se estende horizontalmente até a região de 4px de alargamento à direita da barra lateral; a decoração não recebe eventos de ponteiro e não altera o dimensionamento nem a interação de arrastar; ao alternar para a visualização de arquivos, a linha é ocultada junto com a lista de tarefas; o cabeçalho da lista fica a 12px da linha divisória e, abaixo do cabeçalho, há 8px até a área de rolagem da lista. A área de lista tem um cabeçalho fixo próprio, que não faz parte do componente de navegação nem entra na rolagem da lista nem no contêiner de fade; as seções de projeto/tarefa rolam independentemente abaixo do cabeçalho. O cabeçalho mostra o título e a linha com busca e ícone de filtro: à esquerda, o título geral exibe "任务列表" (os títulos de seção permanecem inalterados) e, à direita, Search e ListFilter, nessa ordem. Os dois botões de ícone são icon-sm (24px), com ícone de 14px e espaçamento de 4px; o título geral usa text-ui-lg (16px por padrão) e a cor de texto secundária text-foreground-subtle, e os títulos de seção mantêm text-ui-base (14px por padrão) e text-foreground-subtlest. A entrada de busca é um botão com `aria-label` internacionalizado e tooltip de atalho (o título do tooltip e o parâmetro de shortcut são passados separadamente, o atalho reutiliza `ControlShortcutBadge`, sem concatenar separadores); o clique continua chamando a busca global original do Shell, sem exibir campo de entrada nem texto de atalho permanente, e sem novo estado de busca nem listener de atalhos. Temas claro/escuro, desktop e celular usam o mesmo layout.
- O menu de filtro tem apenas dois itens, "按项目" / "Por projeto" e "最近更新" / "Atualizações recentes"; à esquerda são exibidos os ícones Folder e Clock, e à direita há a marcação do item da visão atual. São removidas as duas opções de ordenação do menu de contexto da seção de projetos; as demais ações de projeto/tarefa são preservadas.
- Por projeto: mantém as seções de fixados, projetos e tarefas, sem exibir agrupamento por Host; os projetos são ordenados manualmente pela preferência de identidade composta do controlador atual; tarefas running/prewarming têm prioridade, com a camada de execução em data de criação decrescente e taskId como desempate, e a camada comum em data de atualização decrescente. Projetos/não classificados 5/+5, fixados 20/todos/menos.
- Atualizações recentes: extrai de um mesmo ProjectTree todas as tarefas não arquivadas, incluindo fixadas, não classificadas e o histórico de projetos já deletados na árvore; não exibe agrupamento de projetos nem de Host, e restaura os títulos de data de hoje, ontem, 2/3 dias atrás, esta semana, semana passada, este mês, mês passado e mais antigo, sem seção de fixados independente e com cada linha aparecendo uma única vez. Ordem estritamente decrescente por `updatedAt`, depois `createdAt` e `taskId` em ordem decrescente, com desempate estável pelo Host/workspaceKey/taskId completos; o estado de execução não altera a ordem. Primeira tela de 20, +20 a cada vez, e a atualização dos dados não reseta a quantidade; ao entrar novamente na visão, recomeça pela primeira tela.
- Atualizações recentes reutilizam o estilo de tarefa de duas linhas da timeline existente: a primeira linha com status e título e a segunda com, à esquerda, o nome de último nível do diretório de trabalho vinculado à tarefa (não o nome do projeto virtual) e, à direita, o tempo relativo de atualização e os metadados originais. Tarefas sem status não exibem o ponto, mantendo o slot de ícone para alinhar o título; os estados de não lida/erro/execução/fixada/ativação no celular seguem as regras compartilhadas de linha. Por projeto continua usando a linha única compacta.
- Os títulos de data só aparecem antes do primeiro item de segmentos de data adjacentes já ordenados e paginados; não ocupam vaga de paginação, não criam grupos de tarefas duplicados e não alteram a key completa da tarefa. As datas são calculadas pelo calendário local e pelo idioma do cliente (en-US começa a semana no domingo, zh-CN no segunda-feira), e a virada de dia é determinada pela data de calendário, evitando erros de horário de verão; são rederivadas ao atualizar a projeção/reexibir. A paginação incremental não repete o título do mesmo segmento, mudanças de tempo podem reordenar entre segmentos e as linhas em operação permanecem estáveis pela identidade completa da tarefa.
- A camada de seleção e a de renderização recebem explicitamente o modo de exibição, para que a renderização não reaplique a prioridade de execução. O tempo de ordenação vem só do espelho da CLI, não do tempo de modificação da organização do Host nem de `Date.now`; o pin não influencia a ordem temporal, e após o arquivamento bem-sucedido a tarefa sai das duas visões.
- O único owner das preferências é `useProjectSidebarPreferences` dentro do ProjectDirectoryProvider. O `zcode-project-sidebar-preferences` existente ganha `view=projects|timeline`, com fallback para `projects` em caso de valor padrão/inválido; `expanded` continua sendo salvo. O `sort` antigo e o `zcode-sidebar-task-preferences.sortBy` deixam de ser lidos, o recolhimento antigo é preservado, a `position` do Host serve apenas como semente inicial e a ordem de exibição dos projetos passa a ser guardada no controlador como `order=[hostId,projectId]`. Com o localStorage indisponível, a janela atual ainda pode alternar, e desktop e celular salvam as preferências separadamente.
- A troca de visualização não altera a atribuição de tarefas, a tarefa atual nem o recolhimento de projetos; o seletor de projetos do composer continua compartilhando o diretório e exibindo pela ordem manual de projetos, sem reagir à troca de visualização da barra lateral. Não há mudanças de Host/CLI/RPC/SQLite.
- A origem de tarefas local/remota segue a visibilidade original da árvore de projetos, sem criar nova conexão nem cache de tarefas para a lista; a identidade continua sendo Host + (workspaceIdentity.trim() || workspacePath) + taskId. O desktop continuous e o web-remote-replayable do celular mantêm os limites originais de navegação e transmissão do shared-host.

```text
usuário escolhe -> owner de preferência compartilhado -> localStorage do cliente atual
                    |
Host readTree + espelho de tempo da CLI -> seletor puro -> lista de projetos / lista de atualizações recentes
clique na busca / atalho original -> Shell -> busca global existente
ação de tarefa -> comando Host existente -> atualização da árvore autoritativa -> rederivação da visão atual
```

Superfície de impacto: presentation / option-source / persistence. É preciso verificar a navegação, ProjectTaskRows, o seletor de view e as preferências do diretório compartilhado; o menu de projetos do composer é um consumidor da ordem compartilhada, e a gestão de arquivamento apenas faz regressão do limite do conjunto de linhas. As consultas ao grafo de código falharam duas vezes por erro de índice `unresolved_refs`; desta vez o rastreamento seguiu as referências reais; no grafo funcional, as seeds antigas de WorkspaceSidebarItem / Group / Pinned / projeção de linhas foram atualizadas para a entrada atual da barra lateral de projetos. Nenhum novo owner assíncrono, fila ou política de sincronização.

### Aceitação aceita

| Case  | Setup → Action → Assertion                                                                       | Evidência não-UI                     |
| ----- | ------------------------------------------------------------------------------------------------ | ------------------------------ |
| SBV01 | Navegação do mercado de plugins → clique no ícone de busca/atalho original → mesma busca global, menu com apenas dois itens,teclas de plataforma corretas                    | Callback do Shell / teste de teclado      |
| SBV02 | Expandir/recolher projeto e abrir tarefa → alternar visão/refresh → tarefa atual e recolhimento preservados, view restaurada                          | localStorage, store de navegação       |
| SBV03 | Projeto/não classificado/projeto deletado, fixada/execução/arquivada, tarefas do mesmo caminho em Hosts diferentes → atualizações recentes → só tempo, sem duplicatas, sem arquivadas | Fixture de seletor puro / árvore do Host     |
| SBV04 | Preferências antigas de created/updated e position manual → carregar → ignorar ordenação antiga, ordem de projetos do composer igual à da barra lateral          | localStorage, mesma contagem de leitura do diretório |
| SBV05 | Mais de 20 tarefas → mais/refresh/atualização de tempo/pin/archive → paginação contínua, reordenação, pin não move a linha, archive remove       | Espelho de fixture e resultado de comando         |
| SBV06 | Desktop e celular real com shared-host → busca/alternância/reabertura → mesma identidade de tarefa, sem aumento de tab/Host no desktop               | Processo do Host, store de navegação, identidade    |

Os casos entram primeiro em manual-review/pending, reutilizando HOME isolado e fixture case-local; as novas asserções de lista pura não disparam requisições de modelo. Capturas de tela de temas claro/escuro e 390px não substituem a validação em celular real. Poda já confirmada: a amplitude da busca global, as antigas opções de ordenação, a mistura com arquivadas, a estratégia de conexão remota e as combinações de modelo/provider não estão nesta mudança; não há questões de produto pendentes.

### Registro de validação SBV

Validação em desktop: `desktop-e2e-20260915131918480-p99856-ceccb6286a056017`, 8/8 aprovado; inclui SBV01–05, as interações antigas de projeto e capturas de tela em 1200/390px nos temas claro/escuro. Testes unitários relacionados: 7 arquivos / 45 casos aprovados; `pnpm typecheck`, `pnpm lint` (47 warnings existentes, 0 erros) e a checagem de tipos do E2E de desktop aprovados. Checagem de arquitetura em relação ao HEAD: 0 violações; em relação ao origin/staging padrão ainda há o erro pré-existente de arquivo não gerenciado `packages/ui/src/root/resolveConversationWorkspaceTarget.ts`, cuja atribuição de módulo não é alterada por esta mudança.

Validação em celular: `desktop-e2e-20260915133055419-p10183-be1302f33f03e81a`, 1/1 aprovado; Chrome for Testing a 390×844, com hasTouch/isMobile, acessando o Web deste repositório, completing pelo relay/shared-host reais a busca, as duas visões e a restauração após refresh, a reabertura de tarefa e a preservação da tarefa atual em trocas consecutivas, com as asserções de marca de tarefa no desktop e de contagem de Host/tab aprovadas. O caso usa HOME isolado e o fixture de provider sintético existente; a nova entrada usa tap por toque, e a continuação após o fechamento do menu segue para a próxima operação. Depois de colher a evidência do Host, o gerenciador de arquivos foi fechado para evitar que o inspetor continuasse amostrando e interferisse na inicialização da CLI. Através de `ZCODE_E2E_BROWSER_NO_PROXY=1` e `ZCODE_E2E_MOBILE_BROWSER_EXECUTABLE` escolheu-se o navegador de teste com conexão direta, sem desativar a validação de TLS.

Nota de escopo: a evidência de celular é a cadeia real de shared-host dentro de uma simulação de toque em navegador, e não um celular físico; os atalhos de Windows/Linux são cobertos por testes unitários, sem execução de GUI nos sistemas operacionais correspondentes. A identidade de ordenação de mesmo caminho/mesmo taskId entre Hosts é coberta por testes unitários, sem nova validação em máquina real SSH/WSL. O problema de baseline de arquitetura do staging padrão permanece registrado separadamente e não é contabilizado como aprovação do incremento.

## Transição de visualização da barra lateral ao ver arquivos

Após clicar em "ver arquivos" de um projeto, a navegação de projetos desliza para a esquerda e sai, e a árvore de arquivos entra pela direita; na volta, o deslizamento é invertido. Reutiliza-se a animação de transform com 200ms ease-out, e os dois painéis mantêm o DOM durante a troca, com o painel que sai proibido de interagir e oculto para tecnologias assistivas. A configuração de reduzir efeitos dinâmicos é respeitada. Ao fechar, o estado lógico de abertura passa imediatamente para false, e o último alvo de arquivo é mantido apenas até a animação de saída do navegador terminar; depois disso a árvore de arquivos é desmontada, liberando o watcher de diretório, cancelando tarefas de atualização pendentes e descartando resultados atrasados. Com redução de efeitos dinâmicos ou sem animação efetiva, a desmontagem é imediata, sem timeout fixo determinar o ciclo de vida de negócio. Reabrir durante a saída cancela a desmontagem antiga, e a troca de alvo reutiliza a limpeza de workspace da camada de dados; a resolução de diretório atrasada continua descartada pelo número de requisição original. Desktop e celular compartilham este comportamento, sem alterar a identidade de diretório, o tema ou o idioma.

## Fade nas bordas de rolagem da lista de Task

A visão de projetos e a linha do tempo de tasks compartilham o contêiner de rolagem e reutilizam a mask de 24px do ScrollFadeViewport. Sem overflow de conteúdo não há mask; no topo há fade apenas na borda inferior, no meio há fade nas bordas superior e inferior e embaixo há fade apenas na borda superior. Após mudança no conteúdo ou nas dimensões do contêiner o cálculo é refeito, e a barra de navegação e a área de conta do rodapé não participam da mask. Mantêm-se o espaçamento original da lista, a rolagem vertical e os limites de arrasto; desktop e celular e os temas claro/escuro compartilham o gradiente de opacidade, sem adicionar cores nem estados de negócio.

MR !2897 navegação de arquivos no celular: o mapeamento autoritativo de session da identity e o registro real dos services comprovam juntos que a conexão é válida, e não é exigido que a session grave novamente o campo de identity. O uso de `workspace-bridge-open` entre workspaces usa `fileTreeTaskId` e `taskHostId` para localizar o cwd confiável da tarefa, e não pode carregar simultaneamente o `taskId` da tarefa selecionada nem o rascunho de projeto. O Host reutiliza a preparação do diretório da tarefa e não define `initialTaskId`; o novo Root do celular abre inicialmente a árvore de arquivos, sem selecionar tarefa e sem limpar a não lida. As requisições de retorno pendentes do Root antigo continuam seguindo a limpeza por generation original. Depois de fechar a árvore de arquivos, a requisição de abertura já consumida pelo shell é limpa, e a remontagem da barra lateral não pode consumir de novo a entrada antiga.
