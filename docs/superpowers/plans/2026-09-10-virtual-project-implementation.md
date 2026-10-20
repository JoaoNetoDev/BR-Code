# Registro de implementação do projeto virtual

Situações em que o desenvolvimento divergiu do previsto são registradas separadamente em [Registro de desvios de desenvolvimento](2026-09-11-virtual-project-development-deviations.md), atualizado continuamente ao longo do tempo.

## Resumo da feature

| Campo      | Decisão                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| Objetivo   | Implementar `2026-09-09-virtual-project-design.md`, entregando na ordem da seção 8                                             |
| Camadas    | presentation, option-source, draft-default, validation, commit-effect, persistence, recovery                              |
| Modo       | planning → implementation                                                                                                 |
| Sementes   | `taskIndexRepo`, `createZCodeTaskIndexSyncer`, `IZCodeTaskService`, `WorkspaceSidebar`, `V4Gateway`, `SqliteSessionStore` |
| Fora de escopo | workbench split groups, fila de owner, identidade de bridge, hash de diretório, cadeia de resolução de configuração de sessão comum |

## Matriz de superfície de UI

| Cenário / entrada                   | Implementação compartilhada     | Rascunho / padrão                 | Validação e commit              | Local de autoridade             | Limite de modo / isolamento                                    |
| ----------------------------------- | ------------------------------- | -------------------------------- | ------------------------------- | ------------------------------ | --------------------------------------------------------------- |
| Projeto na barra lateral / linha do tempo / fixado | Consulta de projetos, componentes de linha de tarefa | A UI só guarda estado de recolhimento e preferência de ordenação | Host project CRUD / move | app SQLite | Mesma titularidade no desktop, Web e celular; Host remoto independente |
| Nova tarefa                         | Cadeia createSession existente  | Diretório principal do projeto; diretório global separado | Criação após resolução de roots pelo Host | Sessão no CLI + titularidade no app | cwd fixado após a criação |
| Abrir histórico / reconectar        | V4 subscribe e cold resume      | Tarefa com project_id explícito  | Mesmo snapshot de leitura do Host resolve o diretório | Runtime single-flight do CLI | continuous / replayable assinam cada um por conta própria, sem recarregar live roots |
| Arquivos / skills / subagentes no composer | Descoberta de capacidades e listas de sugestão existentes | Escopo de diretório da tarefa atual | qualifiedName / caminho | Catálogo de capacidades do CLI | Não mescla settings, MCP e hooks de diretórios adicionais |
| Configuração de Agent na página de settings | Seletor de diretório | Todos os roots deduplicados | Serviço de configuração de diretórios existente | Configuração por diretório | Não usa projeto virtual como identidade de caminho ou de configuração |
| Agendadas / ociosas / Bots         | Editores de configuração próprios | Diretório principal do projeto e demais roots | Configuração de execução fixada na criação | Repo próprio de cada Host | Não acompanha edições de roots do projeto depois |
| Projeto remoto offline              | Lista de entradas local          | Cache das últimas informações básicas bem-sucedidas | Remove apenas a entrada; edição online passa pelo remoto | entries local / projects remoto | Refresh tardio só faz UPDATE, proíbe recriar a entrada |

## Comportamento compartilhado e divergente / Relacionamentos entre features

- must-inspect: store do CLI → sessions-index → syncer do Host → índice de tarefas. O único escritor dos fatos de sessão é o CLI, o Host apenas espelha.
- must-inspect: serviço de projetos → create / resume / V4 cold subscribe. Resolução de diretório unificada, sem montar roots na UI.
- must-inspect: schema runner → startup do desktop / servidor remoto / startup do CLI. Backup em nível de tabela e falha de transação fecha o processo.
- should-inspect: opções de diretório e padrões de criação de composer, settings, automations, off-peak e Bots.
- conditional: reconexão de SSH/WSL/Docker/server e degradação do root único do remoto legado.
- invariant-only: CommandInbox, owner/lease, workspaceIdentity, replayable do celular, continuous do desktop.
- evidence-only: testes unitários existentes de session-store, v4-cold-resume, sessions-index, task index, task title/unread e a série E2E TSL.

## Donos de estado e destinos de commit

```text
CLI db.sqlite ── facts / sessions-index ──> Host syncer ── cli_* ──> app SQLite
                                           ↑                         ↑
                                 rename/delete commands      project/pin/archive/read

task + project roots（mesmo snapshot de leitura）→ Host → create/resume/cold subscribe
                                             ↓
                                    Inicialização da instância de runtime única do CLI
desktop continuous ───────────────────┤
mobile replayable ─ snapshot/gap ─────┘
```

A organização mantém apenas as colunas originais; o tempo do CLI não pode ser sintetizado por `Date.now()` do Host. A intenção de renomear / a intenção de excluir persistem até a confirmação da entrega; a ausência em um snapshot é tratada por consulta de reconcile e não pode ser tomada como exclusão. O diretório da sessão, a workspace identity e o remoteSessionId não mudam quando o projeto é movido.

Os comandos de título / exclusão offline reutilizam a recuperação fria READY do CLI: o CommandInbox consulta primeiro o resultado idempotente e obtém a admission de sessão, depois inicializa a instância de runtime e, por fim, executa os comandos existentes. Uma exclusão repetida retorna primeiro o resultado já registrado e não restaura a sessão de novo só porque ela foi excluída; o Host não mantém uma segunda fila de comandos.

```text
rename/delete → CLI CommandInbox（dedup、FIFO）→ READY → handler original → fatos persistidos no CLI → espelho no Host
```

## Limites da refatoração e lista de remoções (2026-09-11)

O usuário deixou explícito que desta vez trata-se de refatoração: primeiro rastrear as dependências do antigo gerenciamento de tarefas, depois remover as implementações substituídas, sem manter escritores paralelos. Os diretórios `session` / `services` atuais são apenas uma divisão de diretórios não gerenciada (unmanaged) e não podem servir como evidência de conclusão de novas abstrações.

| Implementação antiga                                                        | Tratamento                                   | Nova responsabilidade                                     |
| ------------------------------------------------------------------------ | -------------------------------------- | ----------------------------------------------------- |
| TaskOverlay / overlays / applyOverlayToMeta                              | Remover                                     | O estado organizacional do Host SQLite é lido por serviço; a UI só mantém rascunhos não submetidos |
| adapter.updateTaskIndexFromStreamEvent                                   | Remover                                     | sessions-index / reconcile é a única ingestão de fatos |
| applyAgentPatch, merge de status do snapshot, shouldPreserveNewerTerminalStatus | Remover                                     | O CLI define explicitamente last_outcome; a phase em tempo real serve só para exibição de atividade |
| Escrita prévia no Host de rename/delete e sincronização best-effort no CLI | Remover                                     | Confirmação do comando no CLI → syncer lê o fato; em falha o valor é preservado |
| closeTask escrevendo deleted                                             | Remover                                     | close só libera o runtime; delete é um comando independente |
| Gestão de task_groups, ordenação mista e criação automática de grupos por workspace | Remover API de runtime / UI / cache de ordenação após a migração | project / roots / task.project_id; tabelas antigas servem só para a primeira migração |
| Reescrita completa de title/status/time a partir do snapshot               | Remover a escrita de fatos; corpo de busca e informação de exibição independentes | O cache de exibição não pode escrever cli\_\* |
| Compatibilidade com dados de versões antigas                              | Limitada à migração de startup e à entrega lazy | Não criar fallback permanente nem uma segunda implementação de runtime |

```text
CLI command / session store                         Host organization
  title / deleted / activity / outcome                project / pin / archive / read
                |                                                  |
      sessions-index + reconcile                         project service contract
                |                                                  |
        one facts projector ----------------------> app read model
                |                                                  |
       generic topic transport                         project tree / timeline
                |
 desktop continuous / mobile replayable（cada um preserva seu próprio limite de recuperação）
```

`CommandInbox`, owner/lease, remote attachment e a adaptação de protocolo do estado de runtime da sessão ficam separados desta refatoração de estado organizacional; antes de remover, confirmar por evidência de referências, sem tratar como estado inútil o código que ainda serve ao celular, a bots ou ao roteamento entre Hosts. Cada módulo novo deve fornecer, conforme a skill de arquitetura, o conjunto de cinco itens, a validação de entrada em runtime, a semântica de falha e testes de contrato. Ao concluir, reportar os itens removidos e o total líquido de linhas, sem alegar refatoração concluída apenas pela contagem de módulos novos.

## Invariantes que devem ser preservados

Executar session-management I1–I17 (o texto antigo de I17, "apenas linha do tempo", obedece às decisões A5/F3: titularidade vazia entra na área de tarefas). O banco só recebe colunas/tabelas/índices; o checksum das migrations históricas não muda; na recuperação, desabilita-se as chaves estrangeiras e a validação é feita tabela a tabela antes do commit, sem apagar o corpo. Depois que a instância de runtime comum é inicializada, o escopo de diretórios fica fixo; arrastar entre hosts é recusado e diretório ausente exige confirmação antes da escrita atômica.

## Evidência de CodeGraph / Candidatos de graph drift / Graph delta

O CodeGraph retornou que não há índice neste workspace, portanto não foi executada a varredura de superfície de impacto do CodeGraph; foi usada a busca direcionada a partir das sementes acima, restrita a entradas de chamada, owners autoritativos e testes adjacentes. O grouped-task-list existente do graph será substituído pela árvore de projetos; após a implementação, atualizar as sementes verificadas e as arestas semânticas, sem tomar alcance estático como dependência funcional.

## Log de esclarecimentos / Decisões de fronteira

- As decisões da seção 3 têm precedência: corrigir o texto antigo de 6.1, "múltiplos matches são atribuídos pelo diretório principal" e "sem match, apenas linha do tempo".
- O código atual já tem `0019_dwf_journal` (2026-09-10); a nova migration de soft delete usa o próximo número, `0020_session_soft_delete_outcome`, sem alterar migrations já ocupadas.
- Portão de arquitetura inicial: 0 baseline / 0 new. O fetch do freshness completo retorna HTTP 504; a checagem com `--no-fetch` passou, ahead main 1095 / behind 6; a atualidade do remoto ainda não foi confirmada.
- Já existe `packages/remote-desktop/` não rastreado, sem relação com esta tarefa; não entra em modificação nem em commit.

## Dimensões / Casos aceitos

| ID   | Setup → Action                                         | Asserção                                                   | Camada de evidência           |
| ---- | ------------------------------------------------------ | ---------------------------------------------------------- | ------------------------ |
| VP01 | Banco antigo com corpo → upgrade / restauração de backup | Apenas touchedTables muda; message/part intactos; checksum inalterado | Fixture SQLite / unit    |
| VP02 | Upgrade → escritor antigo exclui, renomeia título, cria → novo upgrade | Entrega da intenção, orphan, titularidade vazia julgada só uma vez | Fixture SQLite / service |
| VP03 | Semente fria omite / evento de exclusão perdido → reconcile | exists/deleted diferenciados; ausência não apaga linha | protocol / CLI / Host    |
| VP04 | 0 / 1 / múltiplos roots → criação e edição, soft delete, restauração do mesmo conjunto | cwd fixo, nome único, mesmo host, cancelamento sem efeito colateral | service / UI E2E         |
| VP05 | Titularidade NULL, 0/1/múltiplos matches → primeira descoberta / reinício | Só o match único é posicionado; depois disso não é reposicionado; qualquer cwd entra na área de tarefas | service / UI E2E         |
| VP06 | Projeto A+B → create / explicit resume / subscribe com cold resume | skills/subagents/escopo gravável de B disponíveis; AGENTS/config só de A | CLI / Host / E2E         |
| VP07 | B live muda para C / troca de diretório principal / dois projetos com o mesmo cwd / assinaturas concorrentes | Escopo live fixo; reconstrução pela titularidade; sem uso cruzado; single-flight | unit / E2E               |
| VP08 | Exclusão de entrada offline + refresh tardio / reconexão após reinício → readição manual | Sem ressurreição, sem alterar projetos e sessões remotos; adição ativa com o ID original | repo / service / E2E     |
| VP09 | Tarefa antiga não fixada fora do prazo (sem olhar resultado/não lida) → varredura periódica do Host / varredura complementar por mudança de settings (a partir de 2026-09-14 não é disparada pelo carregamento nem pelo clique na árvore de projetos) | Qualquer cwd é arquivado automaticamente; fixadas e em execução, excetuadas; operações organizacionais não reordenam; clicar na tarefa não altera archived | unit / E2E               |
| VP10 | Projeto cria agendada/ociosa/Bot → altera roots → execução na restauração | Segue usando o cwd/additionalDirectories fixado | unit / E2E               |

## Decisões de poda / Questões em aberto

A movimentação entre hosts é excluída por D2/G2; a atualização de roots durante a execução é excluída por B15; a criação automática de projeto para titularidade vazia é excluída por F3; a exclusão definitiva de projeto é excluída por E1b. O comportamento central foi decidido pelo spec indicado pelo usuário e não precisa de confirmação repetida. Casos representativos são mantidos separadamente para desktop e celular, local e remoto; verificações de Linux/Windows/SSH real que ainda não rodaram não são marcadas como aprovadas.

## Entrega do planejamento / Preenchimento da matriz / Notas de handoff de E2E

Primeiro contract / spec, depois testes de falha, depois a implementação. Novos casos de GUI vão para manual-review/pending; usar HOME isolado, SQLite real e fixtures determinísticas de provider. Reutilizar os helpers de E2E existentes, sem promotion automática. Ao fim de cada etapa, preencher este arquivo e o catálogo/matriz de conversas com as evidências reais.

## Resultado da implementação e verificação (2026-09-11)

A implementação central e o portão final de código foram concluídos; abaixo são listados separadamente o ambiente externo e os escopos ainda não verificados em máquina real. Já foram conectados: migration de banco, ingestão unidirecional dos fatos de tarefa, projeto/roots, barra lateral, saída do Group antigo, cwd global separado, arquivamento por atividade do CLI, navegação desktop/celular, Composer, diretório de configuração e vínculo de agendadas/ociosas/Bot. Agendadas/ociosas mantêm a restrição existente de "só é permitido criar em projeto local"; projetos remotos e sessões remotas comuns podem criar. O celular mantém o limite de produto existente de não ter página de settings.

### Resultados de arquitetura e remoções

| Módulo gerenciado                                    | Responsabilidade única e owner de estado                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| sqlite-migrations / startup-storage                 | Migration runner assíncrono compartilhado pelos dois bancos, backup em nível de tabela, restauração verificada e falha que fecha o processo antes de abrir as janelas |
| project-storage / project                           | Persistência de projeto/roots/titularidade de tarefa no Host; resolução unificada de diretório em create/resume/cold |
| task-facts                                          | Ingestão e entrega de fatos do CLI, único owner; o estado organizacional não escreve cli\_\* |
| remote-projects                                     | Membros de conexão do Controller, entradas de projeto e cache básico; o estado organizacional remoto continua no Source |
| project-catalog / bot-project-runtime               | Candidatos de projeto e vínculo de execução fixado do Bot; roteamento pelo Source/Registry já existente |
| project-workspace-navigation                        | Admission de rascunho/tarefa histórica do shared-host e proteção por geração |
| project-sidebar / workspace-config-catalog          | Exibição de projeto e candidatos de diretório de configuração, ambos lidos por contrato de serviço |

Foram removidos TaskOverlay, a escrita de status de tarefa a partir de eventos de stream, a renomeação/exclusão prévia no Host seguida de sincronização best-effort, a API/UI de gestão de Group, a criação automática de grupo por workspace antigo, as implementações antigas de timeline/pinned/archived na barra lateral, o cache de tarefas remotas sem consumidores, a cadeia de callbacks do pop-up de Scratch e o Bot main bridge. Mantidos as projeções de consulta usadas pelos consumidores atuais, o CLI CommandInbox, owner/lease, workspaceIdentity e o remote attachment. O escopo de diretórios da instância de runtime comum fica fixo; tarefas de classe de definição guardam um snapshot de execução imutável.

Segundo o numstat da área de staging, código/testes/SQL/scripts somam 24.859 linhas adicionadas e 39.226 removidas, net −14.367 linhas (sem docs e configuração).

Os módulos novos foram todos registrados em policy e fornecem o conjunto de cinco itens e o contrato de runtime; o baseline de arquitetura não expandiu. O CodeGraph não tem índice de workspace, portanto não foi executada a varredura de superfície de impacto do CodeGraph; foram usadas referências de dependência e busca direcionada, e não se pode alegar isso como evidência do CodeGraph.

### Evidências de verificação

| Verificação                  | Resultado real e limites                                                                                                                                                                                           |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Suíte completa de testes afetados | Na 9ª rodada final, 1724 arquivos / 14942 testes passaram; 2 arquivos / 14 testes pulados por configuração, 341,12 s. Inclui todas as alterações de código-fonte de D84～D89                                                                                              |
| Schema dos dois bancos       | Na 3ª rodada, o artefato real de migration e a checagem de restrição apenas-inclusiva passaram; SQL/checksum históricos do CLI preservados                                                                                                                                        |
| Portão de arquitetura        | Na 69ª rodada final: 0 violations / baseline 0 / new 0                                                                                                                                                           |
| Tipos e lint                 | typecheck final: 87 passaram; lint 32: 48 warnings / 0 errors; checagem de formato de 460 arquivos candidatos alterados passou (oxfmt verificou de fato 459 arquivos)                                                                                   |
| Desktop e remoto por URL     | Na 53ª rodada, 8/8 passaram: razão de migrations, cwd global único/titularidade NULL, CRUD/restauração dos mesmos roots, entrada offline, metadados de URL/Agent real/root adicional/reabertura/cold resume, definição de agendadas, roots de configuração, JSON de autorização de Bot                                      |
| Composer e arrastar          | Na 52ª rodada, VP14/15 passaram: arquivo de múltiplos roots com mesmo nome, referência de agrupamento de projeto, cancelamento/confirmação por falta de root no arrastar nativo, cwd fixo, reabertura do corpo após mover                                                                                               |
| Celular shared-host          | Nas rodadas 34/36/40/48: 390px, relay real, reload de rascunho de projeto, envio/troca de tarefa e reabertura, verificando taskId/projectId/cwd/corpo e o número de tab/Host do desktop. As rodadas 52/54 foram bloqueadas antes da navegação por erro de certificado do relay WSS, portanto a combinação mais recente não pode ser registrada como rodada inteira aprovada |
| Cold resume local com múltiplos diretórios | Nas rodadas 42/48/52: CREATE/LIVE usam A+B; após sair completamente do Electron/Host/CLI, o COLD com o mesmo taskId/cwd usa A+C; AGENTS permanece sempre só em A                                                                                 |
| Cold resume de Agent remoto por URL | Nas rodadas 52/53, VP18 passou: CLI antigo sai, nova runtime identity, requisição de modelo COLD real contendo o skill de C e não o de B; taskId/cwd/projectId fixos, o Controller sem cópia autoritativa da task remota                                        |
| Upgrade/downgrade/novo upgrade de código-fonte antigo | Quatro fases passaram com um checkout antigo independente e o código-fonte atual, ver a reprodução abaixo; não equivale a upgrade de instalação do binário do aplicativo antigo                                                                                                                             |
| Runtime de Bot                | 193 testes unitários direcionados e 3 E2E synthetic na 52ª rodada passaram; envio real a terceiro remoto e assinatura de stream não executados                                                                                                                        |

A 52ª rodada `desktop-e2e-20260911030401818-p18811-a137ff2609ad1117` teve 14 casos, 12 pass / 2 fail: VP11 leu o texto cedo demais durante a animação do menu e VP13 falhou no handshake TLS do relay. Depois de corrigir a condição de espera de VP11, a 53ª rodada `desktop-e2e-20260911030852184-p21904-e7779266b9d13bb3` passou 8/8 no arquivo principal (42 s). Não se deve reescrever essas evidências como "a rodada mais recente inteira passou". Os novos casos de interação permanecem em manual-review/pending, sem promotion automática e sem entrada no preset Docker verified.

O timeout de espera esporádico do Web transport em D82 fica registrado: tanto o checkout atual quanto o anterior à refatoração passaram 27 casos de forma independente, e a 8ª rodada passou o conjunto completo em série. A relação com carga continua sendo especulação; não se afrouxou o timeout nem se declarou a causa raiz corrigida. O erro de WSS do celular em D91 já tem evidência de CDP/captura de tela; o HTTPS isolado funcionou e o certificado veio do Proxyman local, sem alteração de proxy ou configuração de confiança TLS, portanto não se pode afirmar que a anomalia de certificado foi eliminada.

### Reprodução da verificação de dados entre versões

O checkout antigo é `ad1fc7d414ee71c58d3539efdeb028b5d6e2e8f4`. Primeiro, no checkout antigo, executar `pnpm install --offline --ignore-scripts --frozen-lockfile` e `pnpm exec tsc -b apps/zcode-cli/packages/contracts`; não criar symlink dos novos pacotes de workspace para o código antigo. Executar, pelo loader Node tsx existente, `scripts/verify-project-upgrade.mts <raiz do checkout correspondente> <phase> <diretório isolado>`, com as quatro phases em sequência: `old-seed`, `upgrade`, `old-write`, `reupgrade`.

O nome do diretório isolado deve começar com `zcode-project-upgrade-`, e HOME/USERPROFILE/ZCODE_DATA_BASE_DIR devem apontar para esse diretório antes do início de cada processo. A versão antiga cria dados com o TaskIndexRepo/SqliteSessionStore reais, a nova versão faz o upgrade, a antiga de fato renomeia/exclui/cria e a nova faz o upgrade de novo. Corpo/FK, checksum antigo, titularidade já existente, primeira atribuição das linhas novas, entrega de intenções antigas e limpeza de posição passaram. A porta do CLI é conectada em processo ao Store real; o CLI antigo ainda listar as novas sessões com soft delete é uma limitação de degradação aceita.

### Escopos não verificados e encerramento

Ainda não há evidência de execução para o binário real de Server antigo, SSH/WSL, GUI Windows/Linux, Bot remoto real, execução remota pelo celular, reinício do processo Source Server, interação de permissões durante execução remota e preset Docker; o E2E de requisição de modelo com múltiplos diretórios local não substitui asserções independentes de permissão de ferramenta/settings/MCP/hooks. A 9ª rodada final da suíte completa de testes afetados, o typecheck/lint/arquitetura e a checagem de formato dos arquivos alterados passaram. O HOME isolado de teste e os artefatos de diagnóstico foram preservados para revisão; o serviço Vite desta rodada e o checkout antigo independente foram limpos. O runtime atual fornece explicitamente CODEX_SESSION_ID, e ele foi conferido como igual ao session_meta.id / cwd desta sessão; o commit usa esse ID real, sem adivinhar nem reutilizar outros IDs de sessão.

Acidentes de desenvolvimento, rodadas com falha e causas raiz estão preservados no [Registro de desvios de desenvolvimento](2026-09-11-virtual-project-development-deviations.md). D50 contém a falha de isolamento de teste que levou a settings reais a serem escritos e o limite de restauração; isso não pode ser apagado do relatório de conclusão.

## Limpeza residual (2026-09-12)

Após a revisão do usuário, ficou claro que a "lista de remoções" não estava limpa. Esta rodada fez uma auditoria cruzada com três tipos de evidência: auditoria manual por área (camada de fatos dos services / armazenamento e identidade / UI / shared-desktop-web / CLI / testes e documentação), knip e uma análise de alcançabilidade por import que "não trata teste unitário como entrada" (comparando cada arquivo com os importers de produção da árvore em 58c1b0d484 e da árvore atual). O último tipo pegou uma classe inteira que o knip deixou passar: o código-fonte foi removido e seus helpers só restaram importados por testes unitários.

### Removidos

| Lote               | Conteúdo                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Local principal                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Módulos órfãos     | 27 módulos de UI sem consumidores de produção (cerca de 2.900 linhas) e 23 testes unitários que existiam só para eles: WebRemoteControlTaskIndex(.Row), buildTaskListResultFromSessions, taskStatusUnreadSync, workspaceTaskListDisplayGroups / OptimisticOverlay / RefreshSignatures, taskListRefreshPolicy, taskListWorkspaceEventCoordinator, WorkspaceSourceGroupHeader, workspaceSourceGroups, CollapsedRail, workspaceSidebarSelection, taskTimelineGroups, workspaceRemovalSafety, chatStatus, workspaceSourceConnection, sidebarTaskPreferences, workspaceRuntimeRelease, restrictVerticalDragWithinContainer, workspacePurpose, workbenchNewTaskTarget, chatActionHelpers, useLocalWorkspaceScopes, TaskListRemoteSyncHint, taskRuntimeDisplayStatus; taskListMetaSync mantém apenas as duas funções ainda usadas pela broadcast de Bot | packages/ui                       |
| Cadeia de snapshot de tarefas do celular | Três useGlobalTaskList na Root → IPC SyncWebRemoteControlTasks → main availableTasksByWindowId → campo tasks em workspace-list/bootstrap; o único leitor foi removido junto com a homepage antiga do celular; displayStatus/pinned/archived no task target, usados só pela assinatura da homepage antiga, também foram removidos                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | shared, desktop main/preload, web |
| Interfaces mortas dos services | closeTask, createTask.draftSessionId (incluindo sameModelSelection), taskIndexRepo.listSessionsByAutomation, TaskIndexWriteRecord.writeUnreadAt/searchableText e o CASE @write_unread_at, refreshSessionFacts na interface do syncer e ensureSessionSubscription.includeSnapshot, ISettingService.ensureDefaultProject, ProjectCatalogContract, resolveStartupWorkspacePath                                                                                                                                                                                                                                                                                                                                                                                                 | packages/services, desktop main   |
| Cadeia de campos de arquivamento do CLI | SessionInfo.time.archived / timeArchived / includeArchived / archivedAt (incluindo protocolo shared e parâmetros dos services), escrita explícita de time_archived=null em createSession, ensureParentDir / SchemaMigrationRow órfãos do runner antigo, chamada ternária de compatibilidade em três camadas do cold-session-resume                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | apps/zcode-cli, shared, services |
| Textos e comentários             | 116 chaves i18n sem referência × 2 idiomas; dezenas de comentários que ainda descreviam grouped / overlay / applyAgentPatch / closeSession                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ui, services, CLI                 |
| Documentação         | sidebar-task-view-switcher.md, CLI multi-workspace.md com banner de depreciação; a matriz de cobertura de e2e e o catálogo de casos perderam os casos de semântica de Group (TSL22/27/37、CWP05)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | docs                              |

### Correções feitas de passagem

- A verificação de ocupado da sessão vinculada a uma tarefa ociosa estava inválida: depois da convergência da titularidade, o status da linha em tasks-index espelha apenas o last_outcome do CLI e nunca será running, então a guarda do host `listTasks(...).status === "running"` ficou sem efeito. Foi adicionado `IZCodeTaskService.listActiveTaskIds` (vindo do conjunto ativo do syncer) e o host passou a usá-lo; o teste offPeakHostDispatch passa a afirmar ocupado pelo conjunto ativo.
- Dois testes antigos que já estavam inválidos no branch: pinnedTaskFileTreeAction afirmava o botão de árvore de arquivos removido em 79de8c7fab (removido); o mock de TabStoreProvider em workspaceShellRemoteMobileLayout não tinha useTabStore (após 8d06343e22 o useProjectTree assina diretamente), e 24 casos falhavam (mock adicionado).
- O core resume passou a recusar a restauração de sessões com soft delete (a verificação antiga de time.archived era sempre false).

### Verificação

Antes de cada lote de commits: `tsc -b` dos pacotes correspondentes, oxlint / oxfmt nos arquivos alterados, `pnpm architecture:check --changed` (0 violations), `pnpm test:unit:affected` com três rodadas todas verdes (1715 arquivos / 14789 casos); no lado do CLI, `pnpm -r run typecheck` passou, e os testes unitários de adapters / bootstrap / core passaram. O caso "Core admission ACK não espera TurnStarted projection" de `v4-gateway.test.ts` já falhava no HEAD antes da limpeza e não tem relação com esta rodada, portanto não foi tratado.

### E2E migrado para os novos testids da barra lateral

O src já não renderiza `TID_WORKSPACE_ITEM / LIST / CLOSE / FILE_TREE_BUTTON / OPEN_BUTTON` nem `TID_CONVERSATION_NEW_TASK`, mas 47 arquivos de e2e (incluindo 15 specs oficiais) ainda dependem deles via helper, e a evidência de e2e no registro de implementação cobre apenas a série VP. Esta rodada migrou o helper inteiro para a barra lateral de projetos: `ensureProjectExpanded` / `waitForRestoredProjects` / `openWorkspaceDraftFromSidebar` (hover na linha do projeto → create-task) / `openProjectFileTree` / `removeRemoteProjectEntry` / `reconnectRemoteProjectHost` / `readTaskRowInProject`, com a linha do projeto localizada por `data-project-name` = basename do diretório (o workspace antigo migrou na primeira vez para um projeto root com o mesmo nome); `selectTaskOrganizeMode` e os getters tabBar / workspaceList de app.page foram removidos; test-ids.ts remove 9 constantes mortas e adiciona `TID_VIRTUAL_PROJECT_*` / `TID_PROJECT_PINNED_TASKS` / `TID_REMOTE_PROJECT_HOST`, registradas no contrato de testid. Foram removidos os e2e exclusivos da visão de Group (grouped-archive-resurrection, grouped-header-pin-visibility) e seus 4 fixtures json; o fixture marquee perdeu as três tabelas de group; em wdio.conf, o ramo de fixture desses dois specs foi removido.

Execução real: `desktop-e2e-20260912125729585-p62209-5ccdd017382630da` passou workspace-file-tree-refresh, task-list-archive-confirmation, conversation-session-conversation-workspace, conversation-session-task-title-marquee, repo-wiki-generation-settings; `desktop-e2e-20260912130133547-p67653-79b12a4ab84b4780` passou workspace-agent-warmup-small-set / -lifecycle, workspace-passive-agent-startup, workspace-provider-save-dormant-agent, browser-tab-close-cross-workspace (o fixture de aquecimento passou a esperar 1 em vez de 3 conforme o spec F13, com TSL29/31/36 documentados em sincronia). Não executados de fato: a série SSH (sem ambiente SSH real, o helper foi alterado só até consistência semântica), as outras três de repo-wiki / workspace-file-tree/\* / configurable-data-directory / pasted-image-path-projection / markdown-preview-selection (o mesmo caminho de helper já foi validado pelos casos acima) e cerca de 30 specs sob manual-review/pending, que receberam apenas substituição mecânica. `workspace-removal-runtime-release` foi rebaixado para pending porque a barra lateral não tem mais entrada "remover workspace": se a exclusão de projeto deve liberar o runtime de Agent daquele diretório, isso aguarda decisão. Pendente no lado do src: a seção de projeto precisa de `data-primary-root` (hoje projetos com diretórios de mesmo nome não podem ser diferenciados); o project-sidebar ainda tem strings de testid hardcoded e deve passar a usar as novas constantes.

### Mantido para decisão (não removido, precisa de decisão de produto/design)

- Em `taskIndexRepo.applyCliFacts`, a mescla de `cli_updated_at=max(...)` e `cli_last_outcome=coalesce(...)`, de "ficar com o mais novo / preservar o estado terminal antigo": o merge de status do snapshot que a lista de remoções exigia apagar ainda existe na forma de SQL, e D15 já resolveu o problema de atraso com a geração da requisição; por isso os dois testes unitários que pressupõem o applyAgentPatch removido (zcodeTaskIndexSyncer.test.ts:1839-1922) ainda passam.
- Duas fontes de não lidas coexistem: o badge da janela lê do store taskUnreadByTaskId / optimisticTaskListByTaskId / taskListCache, e a barra lateral lê o unreadAt do cache de consulta de tasks; a nova barra lateral não lê o primeiro, mas o WorkspaceHeaderSections ainda escreve nele.
- Manutenção em runtime das quatro tabelas antigas de group: controllerRemoteIdentityMigration.ts e sourceServerWorkspaceAliasRepo.ts ainda reescrevem as três tabelas task*group*\_ dentro da transação de migração de identidade (cerca de 150 linhas), e o spec F2/F4 determina leitura única após a migração; taskIndexRepo.initialize ainda cria essas quatro tabelas para bancos novos; mergeTaskDatabase só mescla as colunas antigas e não mescla cli\_\_ / project_id.
- Pequenos itens de violação da leitura das colunas antigas: listDeletedTaskIds lê só deleted e não cli_deleted; o índice antigo usa updated_at enquanto a consulta já usa cli_updated_at (completar o índice exige nova migration); a migration legacy ACP lê as colunas antigas a cada startup e não está no runner.
- Fallback permanente de três formatos antigos em bots/workspaceHelpers.resolveCanonicalWorkspaceId; seis stubs unsupported no adapter e checkCodexConnectivity / getTaskTokenUsage (superfície de API legacy ACP, zero chamadas); a coluna `apply` da migration 0020 do CLI tem ramo de compatibilidade; o nome de diretório `packages/ui/src/workspace-grouped-tasks/` (resta apenas um arquivo vivo; ProjectNode.tsx tem alterações do usuário ainda não commitadas, então fica por enquanto); em TaskList.tsx, os ramos inalcançáveis sob a chamada de uma linha só e a variante timeline de TaskListItem.
