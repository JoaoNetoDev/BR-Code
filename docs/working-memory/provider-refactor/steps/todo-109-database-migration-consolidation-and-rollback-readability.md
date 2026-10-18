# Todo 109：Consolidação das migrações de banco de dados de todo o repositório e legibilidade do rollback

> 2026-09-11 descoberta posterior: o backfill de mensagens sem `entry` em 0020 omite o nível de pensamento já registrado para usuário antigo e não registrado para assistente. Foi reproduzido; a correção fica a cargo de [Todo121](./todo-121-repair-backfilled-session-reasoning-level.md), ainda não implementada; mantém-se o registro original de conclusão, mas essa lacuna não é contada como corrigida. Apenas acrescente migrações; não alterar a 0020 congelada.

> Status: em 2026-09-10 implementado e concluído com as aceitações-chave de armazenamento, protocolo e Pro desktop local; celular/telemetria conjunta em dispositivo real ainda não coberta, coordenação externa ainda não confirmada, ver [ledger de implementação](../research/todo109-database-implementation-ledger.md). Não se declara verde em todas as plataformas; nenhum banco de dados real de usuário foi modificado, nada é enviado automaticamente.
> Baseline antigo fixado: `staging_backup @ 790884b1ce4b990583ab40625b5f283e2169eb36`. Fixar o HEAD da branch atual antes da implementação e registrar; não usar main nem staging em movimento contínuo como substituto do baseline antigo.
> Mesclado em staging antes da implementação: `aaa486ed47ed08e522b7554d5e7d265c2475e2f1`; antes da mesclagem esta branch era `db5dfb7d401d1c8698d246cc04ed85e520cc7547`. O upstream já ocupou `0019_dwf_journal`; seu número, conteúdo e checksum são preservados como estão; as migrações do banco de sessões desta rodada são acrescentadas a partir de `0020`, verificando a numeração de novo antes do commit, sem renumerar e sem modificar migrações já existentes no upstream. O banco App tem numeração independente; não aplicar mecanicamente os números do banco de sessões.

## 1. Objetivos, prioridade e não objetivos

Revisão de 2026-09-10 concluída: o critério de aceitação mais alto é "rollback e reupgrade após rollback podem perder a seleção de modelo, mas sessão/tarefa devem abrir, e leitura/exibição não deve reportar erro por configuração ausente/inválida". As duas lacunas são Selection inválida de User vazando pelo protocolo, e o plugin de restore contornando a escrita mínima de compatibilidade; validações estruturais equivalentes de Timeline/Subtask são cobertas junto. Valores antigos não são mexidos, migrações não são reescritas, não se reexecuta, não se restaura leitura de campos antigos. SQL / Reader / protocolo reais e Reader antigo congelado passaram em um lote de 106 casos; as repetições complementares da Pro com cold start passaram; falhas de pré-envio e plataformas não cobertas foram registradas com fidelidade na seção E do ledger de implementação; não se pode substituir a aceitação por "apenas gravar em disco com sucesso".

Consolidar em migrações formais e versionadas toda a estrutura e a migração de conteúdo de banco de dados envolvida na refatoração do Provider. Todo banco de dados próprio relacionado e todas as tabelas precisam de uma conclusão de auditoria, não apenas as quatro tabelas de sessão listadas anteriormente. A migração preserva campos antigos e valores antigos; após upgrade, rollback e novo upgrade, o conteúdo de tarefas, o histórico de sessões e as mensagens não podem ficar inacessíveis por mudança no formato de configuração de modelo.

**Restrição primordial: mover para migração não equivale a redesenhar a semântica da migração.** Reutilizar as regras de conversão já decididas para identidade de Provider, Selection, níveis de raciocínio etc.; não se pode usar a migração padronizada para decidir novamente a que um Provider deve mapear. Só ajustar quando a implementação antiga violar princípios explícitos desta rodada (perder campos, deixar conteúdo inacessível, leitura em execução repetir a migração etc.), e registrar o motivo. Novas decisões de ambiguidade de produto ficam isoladas para pergunta; não se muda por conta própria para pessoal, Team, herdado ou outro modelo.

Não fazer:

- Não construir sincronização bidirecional completa entre versões nova e antiga, nem garantir que toda modificação de configuração durante o rollback seja restaurada no reupgrade; perder a seleção de modelo e precisar reselecionar é aceitável.
- Não proibir dual-write de forma absoluta, nem fazer dual-write em tudo; a necessidade é decidida pelo contrato de leitura de conteúdo da versão antiga, ver seção 4.
- Não mesclar bancos de dados físicos diferentes, não construir transações distribuídas entre bancos, não acoplar o serviço App diretamente à implementação concreta de armazenamento do Agent.
- Não aproveitar para mudar a arquitetura de Account/Provider, effective Selection, vínculo de modelo em execução, permissões ou política de Ticket.
- Não alterar bancos de dados de software externo (ex.: base de cookies do navegador). Migração de Provider JSON, arquivos de Bot, arquivos de Wiki, Markdown de Subagent etc. que não sejam banco de dados estão fora do escopo desta rodada; as fronteiras de importação do banco de dados ainda precisam ser conferidas.
- Não limpar dados antigos sem relação, não corrigir bugs preexistentes sem relação, não fazer ensaio de upgrade/downgrade no diretório real de usuário, não publicar nem enviar automaticamente.

Este Todo complementa/substitui, dentro do escopo de banco de dados, os requisitos conflitantes antigos de migração e rollback de Todo69 e Todo104; preserva-se a evidência histórica de implementação deles, sem estender para áreas fora de banco de dados. Em especial não se aceita mais "não importa se uma mensagem/tarefa nova não abre"; o que pode degradar é configuração reconstruível, não a acessibilidade do conteúdo.

## 2. Fatos confirmados e lista de auditoria de todo o repositório

Método de investigação: código atual, diff contra o baseline antigo fixado, testes com banco original/Reader real e buscas direcionadas de produtor/consumidor. A investigação inicial e a lista-semente abaixo são preservadas como registro histórico; as conclusões finais por tabela e a verificação estão no ledger de implementação. A ferramenta de grafo de código não está disponível neste ambiente; não se afirma que codegraph passou.

### 2.1 Banco de sessões do Agent

Caminho padrão `~/.zcode/cli/db/db.sqlite`, prevalecendo o caminho resolvido pela configuração real. Já existem migrações 0001–0018 e registros em `schema_migration`; esse SQL e o executor não têm diferenças em relação ao baseline antigo fixado. O executor usa transação IMMEDIATE, checksum, registro após sucesso e rollback em erro. O fato de a estrutura da tabela não ter mudado não significa que o conteúdo JSON não tenha mudado.

Execução em memória confirmou 18 tabelas de negócio, mais a tabela de registros de migração. Cada linha abaixo deve produzir uma conclusão "migrar/manter inalterado/explicitamente pendente de decisão" com evidência; a lista de nomes de tabela não é declaração de conclusão.

A frase acima é fato do staging_backup / pré-mesclagem. Após mesclar em staging em 2026-09-10 há ainda quatro tabelas de negócio `dwf_run`, `dwf_actor`, `dwf_node`, `dwf_event`, totalizando 22; o `sqlite_sequence` próprio do SQLite não conta como tabela de negócio. As quatro tabelas novas entram também na auditoria, preservando o design de durable journal do upstream, sem implementar antecipadamente a funcionalidade de workflow dinâmico e sem executar a operação de remoção de tabela da base de preview interna mencionada em seus comentários.

| Tabela              | Conteúdo obrigatório de verificação                              |
| ------------------- | ----------------------------------------------------------------- |
| session             | Metadados, resumo, estruturas de recuperação; conteúdo e vínculo de identidade preservados |
| session_entry       | Todos os type, incluindo runtime/model_selection; não basta verificar só a seleção atual |
| message             | Seleção do usuário, origem real do assistente, intenção de entrada, metadata aninhada |
| part                | Todos os tipos de Part, especialmente troca de modelo, Subtask e vínculo de resultado de ferramenta |
| session_input       | Payload de entrada, fatos persistidos de entrada (fila/Guide etc.); não adivinhar modelo/modo ausente |
| session_target      | Alvo, vínculo de execução, informação de recuperação                 |
| session_task_link   | Relação pai-filho de tarefas e campos como model                   |
| workflow_definition | Definição e meta_json                                               |
| workflow_run        | args_json, stats_json, failure_json e vínculos                      |
| workflow_activity   | opts_json, result_json, error_json e vínculo de subsessão           |
| workflow_event      | Tipo de evento, payload_json, ordem                                 |
| model_usage         | Origem do modelo, nível, uso bruto/metadata de fornecedor           |
| turn_usage          | Uso e vínculo com Turn                                               |
| tool_usage          | Uso de ferramenta e vínculo de chamada                              |
| local_setting       | namespace/key/value; registros obsoletos mantêm o valor original   |
| permission          | Se esta rodada afeta estruturas antigas de permissão, sem apagar de passagem mecanismos de compatibilidade não relacionados |
| input_history       | Entradas e estrutura de anexos                                       |
| todo                | Conteúdo, estado e ordenação                                        |
| schema_migration    | IDs/checksums/registros históricos não mudam; apenas acrescentar novas migrações |

Sementes conhecidas a consolidar: `codecs.ts` converte User/Assistant/Timeline/Subtask na leitura; `repositories/model-selection-migration.ts` migra a seleção na recuperação; `session-entries.ts` já tem empacotamento de novos membros e preservação de campos antigos. Parte de `usage.ts` é apenas mudança de nome TS; não se pode renomear colunas SQL nem fatos históricos com base nisso.

### 2.2 Banco de tarefas do App e outros bancos

Padrão `~/.zcode/v2/tasks-index.sqlite`. TaskIndexRepo, AutomationRepo e OffPeakTaskRepo compartilham esse banco; não se pode confundir com três bancos independentes nem com um conjunto próprio de versões de migração.

| Tabela/escopo                                                      | Situação conhecida e exigência de auditoria                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| tasks                                                        | Colunas, meta_json, conteúdo de busca, identidade de workspace; mesmo sem mudança em relação ao baseline antigo é preciso dar conclusão                |
| task_groups、task_group_members                              | Agrupamentos e relação de membros; a migração não pode perder a entrada de listagem                                                 |
| task_group_view_node_orders、task_group_workspace_bootstraps | Ordenação e vínculo de workspace                                                                     |
| automations                                                  | Novo model_selection contra antigo model/provider/thought_level; entradas de importação dispersas                   |
| automation_runs                                              | Novo model_selection; a origem histórica de execução não pode ser reinterpreta pela conta atual                                 |
| off_peak_tasks                                               | Novo model_selection; modelo/nível antigos e vínculo de Ticket, caminho de repair na leitura                    |
| Nova tabela de registro de migrações                         | Ledger único por banco; nome/implementação conforme o design final                                                |
| Outros bancos próprios                                               | Buscar criação de banco, driver, caminho e entradas de escrita, e incluir na lista; bancos sem relação com motivo explícito de exclusão, sem usar estes dois bancos como desculpa para deixar de verificar algo |

Hoje os Repos do App têm cada um seu próprio CREATE TABLE / ensureColumn; Automation importa a seleção antiga na cadeia de inicialização, e Off-Peak corrige a seleção antiga em caminhos como list/get. A implementação precisa unificar o mecanismo, mas não pode perder outros comportamentos necessários de criação de tabela / adição de coluna.

### 2.3 Método de auditoria e campos do ledger

Por banco registrar: origem do caminho real, owner, entrada de abertura, driver, migrações existentes, versão/lock, todas as tabelas e entradas de teste. Por tabela/campo registrar: produtor antigo → formato em disco → conversão existente → consumidor novo, commit de origem, novo campo de destino, campos preservados, origem da regra de conversão, se há escrita mínima de compatibilidade, evidência de teste, estado de implementação/verificação.

É obrigatório verificar produtor e entradas de recuperação/cópia/importação/atualização comum, não apenas fazer diff de Repository. Repositórios JSON comuns podem gravar novas formas mesmo sem alteração. Correções de camada de aplicação são permitidas apenas para garantir a consolidação do formato e a legibilidade do conteúdo; a UI não acessa Repos diretamente.

## 3. Contrato de execução da migração formal

```text
abrir o banco de dados real proprietário
    -> entrada de migração em nível de banco obtém o lock de transação
    -> verificar os IDs de migração em sequência
         já registrado -> validar checksum -> não reexecutar
         não registrado -> conversão de estrutura e dados -> registrar após sucesso
    -> commit dos dados e do registro de migração na mesma transação
    -> liberar o banco migrado para Repos / uso de negócio

falha real de execução/gravação -> rollback, sem deixar registro de sucesso parcial
rollback para versão antiga e novo upgrade -> migrações concluídas não reexecutam; configuração nova ausente é tratada como ausente
```

1. Reutilizar o mecanismo já existente no banco de sessões; completar as mesmas garantias nos outros bancos. Migrações históricas não são editadas nem renumeradas; conflitos de novos IDs são conferidos antes da implementação. Checksum divergente falha explicitamente.
2. Cada banco físico tem versão e transação independentes; qualquer ordem de inicialização entre vários Repos do mesmo banco precisa ser segura. Multi-janela/multi-processo se coordena por lock de banco e nova verificação da versão dentro da transação, sem depender de boolean em memória nem de adivinhar tempo de espera.
3. Bancos novos, bancos antigos completos e bancos onde Repos antes dispersos só inicializaram parte das tabelas devem entrar com segurança. A ausência do registro de migração não significa que tabela/coluna necessariamente não exista: a migração de inicialização verifica a estrutura real, não captura todos os erros de SQL para fingir sucesso, nem simplesmente acrescenta uma falsa versão "tudo migrado".
4. Criação de tabela, adição de coluna e consolidação das conversões de formato histórico desta rodada vão para a migração; os Repos deixam de repetir a atualização por conta própria. Comportamentos de upgrade de versões anteriores precisam ser preservados ou provados equivalentes, sem apagar de passagem migrações necessárias e sem relação com esta rodada.
5. A transação é mantida pelo executor; não chamar diretamente dentro dela entradas antigas de conversão que fazem BEGIN/COMMIT por conta própria. Preferir SQL claro e testável; quando for realmente necessário um passo em código local, fazer apenas a extensão mínima, fixando a verificação de passos/versão, sem depender de um Resolver online que possa reescrever a semântica histórica conforme o negócio muda.
6. Não consultar OAuth, benefícios, Registry de Providers ou serviços remotos dentro da transação. Bancos grandes usam travessia limitada/batch, mantendo a atomicidade necessária, sem carregar tudo em memória.
7. Readers de negócio normais não repetem a migração usando campos antigos desta rodada. Entradas explícitas de importação de dados antigos podem reutilizar conversões determinísticas, mas devem marcar a fronteira de importação, sem envolver cada inicialização/leitura como importação e sem criar mecanismo extra de detecção de degradação e re-migração automática.
8. Migração já registrada como concluída não reexecuta por causa de campo novo ausente; depois que a nova versão limpa a seleção, ela não pode ser ressuscitada pelo valor antigo.

## 4. Preservação de dados antigos e escrita mínima de compatibilidade

### 4.1 A migração apenas acrescenta a nova expressão

- Todas as colunas, campos e valores antigos existentes são preservados: sem renomeação no lugar, sem remoção e sem sobrescrever valor antigo de Provider com novo Provider ID. Campos extras desconhecidos também são preservados.
- Não sobrescrever a linha inteira com a saída de um Decoder de negócio que remove campos antigos. Quando o formato novo e o antigo ocupam objetos de mesmo nome, a camada de armazenamento usa membros novos sem conflito; por exemplo, Timeline pode considerar guardar fromModelSelection/toModelSelection, e Subtask pode considerar modelSelection — a nomeação final vem primeiro na spec de armazenamento. São candidatos de implementação, não exigência de mudar os nomes de campos do protocolo em toda a cadeia.
- A nova porta lógica pode manter a forma atual, e o adapter é responsável pelo mapeamento em disco; não criar outra autoridade de Selection de negócio só por compatibilidade.
- ID, chaves estrangeiras, ordem e tempo não são alterados sem motivo por causa da migração de formato; se a semântica existente exigir novos registros derivados, seguir as regras já decididas e deixar a origem explícita, sem adulterar registros antigos.
- Preservar significa manter a existência do campo e seu valor/conteúdo; não exige que o texto bruto da coluna inteira seja byte a byte idêntico após adicionar um membro JSON; linhas não modificadas devem permanecer inalteradas, e ordem de arrays, corpo do texto e referências de anexos não podem mudar.
- Enquanto esta migração não tiver sido executada, para registros com origem antiga clara é permitido reconstruir e sobrescrever os novos campos de destino desta rodada; não adaptar estados intermediários errados que nunca foram lançados, nem reescrever indiscriminadamente registros novos que não têm origem antiga. A versão da migração decide se executa; não se pode voltar a tratar "campo novo existe, sempre pula" como regra geral desta rodada.

### 4.2 Evitar dual-write na medida do possível; acessibilidade do conteúdo primeiro

```text
migração nova / criação / alteração de registro -> Reader real do staging_backup
    conteúdo abre, só perde configuração de modelo -> não dual-write
    conteúdo não abre por falta de campo antigo    -> acrescentar campos mínimos de compatibilidade, dual-write se necessário

uso da versão antiga e novo upgrade -> não reexecutar migrações concluídas
    configuração nova ausente -> conteúdo abre normalmente; reselecionar/completar config antes de executar
```

- Não se exige que todos os campos novos e antigos fiquem continuamente consistentes, nem recuperar modificações de configuração de modelo feitas durante o rollback; não fazer dual-write só por simples divergência de modelo.
- Se a versão antiga não consegue abrir o conteúdo de uma tarefa, mensagem ou sessão por falta de um campo obrigatório, é obrigatório corrigir — não basta evitar falha de banco inteiro ou de lista inteira.
- Verificar item a item com o Reader real da versão antiga congelada e com os caminhos de exibição posteriores. Não basta provar que o JSON.parse deu certo ou que o campo existe, nem validar só registros antigos pré-migração esquecendo registros novos criados/alterados.
- Substituição do objeto inteiro em salvamento comum e em cópia/fork não pode apagar de passagem o snapshot antigo já preservado. Preservar o valor antigo original e atualizar continuamente no sentido inverso são coisas diferentes; dual-write necessário deve registrar o caminho gatilho, os campos e o motivo de não poder mais reduzir; não construir um framework genérico de dual-write de domínio inteiro.
- O negócio da nova versão continua lendo só a estrutura nova; campos antigos servem apenas para migração e leitura pela versão antiga, sem restaurar fallback de execução em campo antigo. Não construir identidade histórica enganosa só para preencher campo; se um valor mínimo de compatibilidade não puder ser determinado pelas decisões existentes, isolar e perguntar.

## 5. Semântica de conversão e tratamento de configuração ausente

1. Mapeamentos determinísticos existentes de Provider ID / nível podem ser usados; mudar o formato de representação não muda o fato de negócio. Seguir as regras já decididas, sem redesenhar por causa da migração.
2. Distinguir "seleção salva para a próxima execução" de "origem real histórica de execução". A primeira migra conforme a regra do domínio; a segunda não pode ter a origem reescrita pela conta, Team ou lista de executáveis atuais.
3. Se um registro antigo não tem modelo/modo, não adivinhar; configuração reconstruível que não possa ser recuperada com reliability pode continuar ausente. Preservar a origem antiga, dar um resultado de tratamento explícito e permitir que a migração conclua normalmente; "concluída" significa tratamento conforme a regra, não que cada configuração de modelo foi recuperada com sucesso.
4. Configuração ausente não pode fazer a message/task/session inteira falhar ao ser analisada, nem engolir o conteúdo e devolver um registro vazio falso. Separação entre exibição/navegação do conteúdo e validação de execução: quando for necessário executar e faltarem configurações obrigatórias, pedir explicitamente a complementação, sem escolher modelo escondidamente. Semântica legítima de default/herança já existente no histórico não é redesenhada com esse pretexto.
5. Falha real de execução de banco, falha de conversão que corrompe conteúdo ou quebra estrutura deve dar rollback; não se pode simplesmente capturar e pular. Problemas como JSON malformado devem ser classificados pelo conteúdo afetado e pelo comportamento original, sem escalar para recriar um banco vazio nem promover a falta normal de configuração de modelo a falha de inicialização de todo o banco.
6. O repair em tempo ocioso já depende de resolução de conta: primeiro verificar as decisões existentes e o vínculo de Ticket. A parte determinável vai para a migração; configuração realmente sem fato a recuperar é tratada como ausente, sem revincular Ticket e sem esconder a complementação de volta em list/get. Se alguma decisão válida existente exigir outro comportamento automático de recuperação, manter esse item conflitante como pergunta; não revogar sozinho.
7. A migração não verifica elegibilidade de execução, o que não significa que a tarefa migrada obrigatoriamente rodará. As validações de execução existentes de Provider/benefício/modelo/Ticket continuam na fronteira de execução.

## 6. Superfície de impacto, owner e proteção de abstrações (Impact Brief)

Modo planning; camada alterada persistence / recovery, sem redesenho de UI. A migração de banco é responsabilidade da camada de armazenamento do processo proprietário; a projeção de UI/Host não pode ser uma segunda autoridade de conteúdo.

| Entrada/estado do usuário                    | Implementação compartilhada e ponto de autoridade                          | Limite de rascunho/padrão e commit                                                        | Padrão/isolamento que precisa ser mantido                                  |
| -------------------------------- | --------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------ |
| Lista de tarefas, busca, agrupamentos             | TaskIndexRepo / tasks-index.sqlite; autoridade dos metadados de listagem  | Não iniciar todos os Agents por navegar; não alterar rascunhos do usuário                          | workspaceIdentity e caminho não podem ser confundidos                         |
| Abrir sessão, mensagens históricas, subtarefas, alvos | Agent SessionStore; a UI consome a projeção do protocolo                 | Ler não exige modelo executável; a execução segue usando seleção/vínculo existentes                   | Bancos de dados locais/SSH/WSL/Docker são migrados pelo owner real          |
| Lista de automações, edição, registros de execução       | AutomationRepo / tasks-index.sqlite                 | Editar grava config da automação, não altera rascunho de Session; config ausente é tratada na entrada de execução existente | Não alterar autorun, agendamento nem estado de liga/desliga                         |
| Listas ociosas, edição, Ticket                   | OffPeakTaskRepo e Service existente / tasks-index.sqlite | Não trocar conta ou Ticket automaticamente em leitura comum                           | Preservar a semântica de execução do Ticket já vinculado                           |
| Abrir os mesmos conteúdos no celular                 | O mesmo shared-host e o SessionStore/Repo proprietário           | Não adicionar migração nem runtime separados para celular                                | desktop-continuous e web-remote-replayable não se espalham um no outro |

O que se compartilha são as garantias de migração e a conversão de armazenamento; o que difere é o owner de cada banco, o contrato das tabelas, o significado de Selection e o momento de commit/execução de cada negócio. Preservar a validação pública de API/Model, sem mudar geração de candidatos nem origem de default/herança; não transformar compatibilidade de armazenamento em fallback de execução.

Graduação de impacto e sementes de código (todas relativas à raiz do repositório):

- must-inspect: `apps/zcode-cli/packages/adapters/src/storage/session-store/{migrations,migration-runner,codecs,sqlite-session-store}.ts`, `repositories/{session-entries,model-selection-migration,messages,usage}.ts`; owner de formato, transação e leitura/escrita desta rodada.
- must-inspect: `packages/services/src/session/{taskIndexRepo,automationRepo,automationSelectionMigration,offPeakTaskRepo,offPeakTaskService}.ts`; entradas de abertura do mesmo banco e complementações de migração dispersas.
- must-inspect: produtores de mensagens/Part/entrada de Session e consumidores diretos de recuperação, fork, importação etc.; é preciso completar no ledger de implementação os símbolos e caminhos reais, sem usar a semente atual como substituto da auditoria completa.
- should-inspect: projeção de tarefas, hydration do histórico de sessão, dispatch de automações e ociosas; provar que configuração ausente não impede o conteúdo e que a semântica de execução não muda.
- conditional: shared-host desktop/celular, workspace remoto, locks de arquivo em diferentes OS; escolher validação representativa conforme a diferença de caminho, sem refazer o protocolo.
- invariant-only: Main/relay não assumem migração nem estado de negócio; a fronteira de armazenamento não depende da implementação concreta do Runtime; não mudar o momento de commit do rascunho de model selection.
- evidence-only: migrações de Session, Repos e testes de reader de rollback existentes servem só como evidência reutilizável; a existência de testes não autoriza alegar cobertura total.

Grafo: adicionar a entrada de planejamento deste Todo para capability.task-persistence; manter as relações de owner existentes. O antigo defaultModelRef/owner de fila antiga no grafo pode estar desatualizado, listados como graph-drift-candidate e não como base de redesenho nesta rodada; sem codegraph disponível, não se afirma ter percorrido todas as cadeias de chamada — a implementação precisa completar a verificação precisa dos chamadores.

## 7. Registro de decisões, combinações de estado e plano de testes

### 7.1 Limites confirmados

| Decisão      | Requisito final                                              | Opções descartadas                              |
| ------------ | ----------------------------------------------- | ------------------------------------ |
| D01 Escopo   | Todos os bancos de dados relacionados/todas as tabelas, contra o staging_backup fixado  | Verificar só as quatro tabelas de sessão ou só o diff de SQL        |
| D02 Semântica da migração | Consolidar o mecanismo, não redesenhar mapeamentos já decididos                    | Escolher automaticamente pessoal/Team/outro Provider pela migração |
| D03 Preservação | Campos e valores antigos preservados, novo formato guardado à parte             | Renomeação no lugar, cobertura do objeto inteiro pelo Decoder |
| D04 Estado intermediário | Não compatibilizar estados intermediários não lançados; com migração não executada, reconstruir o novo campo de destino | Proibir toda conversão só porque o campo novo existe      |
| D05 Ida e volta do rollback | Conteúdo legível, configuração pode ser reselecionada, migrações concluídas não reexecutam | Construir sistema de re-migração automática para alterações pós-rollback |
| D06 Dual-write | Se der para não fazer dual-write, não fazer; quando o conteúdo não abre, dual-write mínimo necessário      | Proibição absoluta/sincronização reversa total               |
| D07 Configuração ausente | A migração pode concluir com sucesso, navegação normal, execução tratada à parte      | Uma configuração de modelo ausente bloqueia o banco todo ou perde o registro inteiro |

Dimensões de teste: ordem de inicialização de banco/Repo; banco novo / banco antigo completo / banco antigo parcialmente inicializado; migração não executada/executada/falha com nova tentativa; registro antigo / novo criado / novo alterado; configuração completa/ausente/indeterminada; processo único/múltiplos processos; owner de conteúdo local/remoto. Não expandir para o produto cartesiano completo de modelos e contas: a conversão não depende do benefício atual, e prova-se com cenários representativos offline/com Provider vazio.

### 7.2 Cenários aceitos e linhas de cobertura

A tabela abaixo é a definição de aceitação; os resultados reais de 2026-09-10 estão na seção D do ledger de implementação. DB109-01～13 concluíram as asserções-chave; DB109-14 teve verificação parcial, e celular/telemetria conjunta em dispositivo real não conta como aprovado. Os IDs permanecem estáveis.

| ID       | Setup → Action                                                     | Asserção central                                                                      | Camada de evidência                            |
| -------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | --------------------------------- |
| DB109-01 | Semear todas as tabelas de todos os bancos do baseline antigo fixado → upgrade | Toda tabela tem conclusão; campos novos que deveriam ser convertidos estão corretos; campos antigos/desconhecidos/corpo/referências de anexos não se perdem; linhas sem relação não mudam | SQL/JSON original + Reader atual       |
| DB109-02 | Banco novo, banco onde parte das tabelas/colunas já existe mas sem ledger → inicialização                       | Converge para estrutura e registro corretos, sem sobrescrever conteúdo nem ignorar erros SQL reais                         | Integração SQLite                       |
| DB109-03 | Banco migrado, troca/limpeza de seleção → várias reaberturas                                         | Não reexecuta, não ressuscita seleção antiga, não depende da existência do campo novo para decidir a versão                            | Ledger + Reader                     |
| DB109-04 | Migração não executada, com origem antiga e valor de destino ainda não lançado → upgrade                  | Reconstrói o novo campo de destino pela origem antiga e pelas regras determinadas; valor antigo não muda; sem origem antiga não força nada                    | Teste unitário de conversão + dados originais               |
| DB109-05 | Injetar erro de escrita no meio da migração atômica → reabrir e tentar de novo                                | Dados e registro dão rollback juntos; nova tentativa bem-sucedida executa só uma vez                                        | Injeção de falha SQLite                   |
| DB109-06 | Múltiplos processos abrindo ao mesmo tempo, ordem de inicialização de Repos varia                               | Aplicado uma única vez no mesmo banco, sem expor estado meio migrado; espera por lock/erro conforme os limites existentes                       | Integração multi-conexão/processo                   |
| DB109-07 | Migration já aplicada com checksum alterado → abrir                                                        | Rejeição explícita, sem reexecutar em silêncio nem alterar o ledger                                                   | Teste do executor                        |
| DB109-08 | Offline/sem login/Provider vazio, com seleção convertível e indeterminada → upgrade/navegação          | Conversões determinísticas não mudam; configuração ausente não impede o conteúdo; sem chamadas de rede por conta                              | Armazenamento + Service                    |
| DB109-09 | Registros representativos novos migrados/criados/alterados → leitura e exibição reais na versão antiga                    | Conteúdo de cada tarefa/mensagem/sessão acessível; configuração de modelo pode ser perdida; dual-write ou não tem evidência concreta            | Reader congelado + projeção de conteúdo + E2E centralizado |
| DB109-10 | Após upgrade, rollback e dados novos criados/alterados na versão antiga → novo upgrade                               | Migrações concluídas não reexecutam; configuração nova ausente não causa falha de conteúdo; dá para continuar após reselecionar                 | Banco temporário de duas versões + UI/protocolo            |
| DB109-11 | Timeline/Subtask/entrada/alvo/Workflow/Usage históricos → migrar e recuperar/copiar | Vínculos/ordem/origem real de execução preservados; não reinterpreta pela conta atual                              | Banco original + consumidores de recuperação               |
| DB109-12 | Atualização/cópia/fork de seleção nova/importação de backup antigo → leitura normal                       | Não apaga snapshot antigo de passagem; Reader normal não usa campo antigo como fallback; fronteira explícita de importação não se espalha                | Writer/Reader + integração de importação          |
| DB109-13 | Registros ociosos antigos com Ticket, identidade insuficiente → migração/lista/checagem de execução                 | Não revincula, não grava complementação em list/get; trata configuração ausente pelas decisões existentes, sem iniciar tarefa real            | Fixture de Service/Repo              |
| DB109-14 | Mesmo caminho no desktop local e remoto com identidades diferentes, anexo no celular → abrir histórico           | Isolamento de identidade; o celular reutiliza o owner; não muda a semântica continuous/replayable                   | ponta a ponta centralizado                        |

Podas: não se exige consistência de ida e volta para toda configuração de modelo, não se pede um modelo real para validar o banco, não se faz upgrade atômico entre bancos e não se cobrem todos os formatos antigos sem relação com esta rodada. Comportamentos legítimos de produto já existentes de default/herança não são reescritos como bug.

### 7.3 Preenchimento de materiais antes da implementação e entrega de E2E

- Para mudanças de estrutura realmente encontradas, atualizar primeiro as specs correspondentes, como `apps/zcode-cli/docs/design/v2/local-setting-migrations.md`, `apps/zcode-cli/docs/design/v2/session-persistence.md`, `docs/task/task-sqlite-index.md`; não escrever os nomes de campo candidatos deste Todo como fato consumado.
- Antes da implementação, fazer a sincronização com o responsável de CLI sobre mudanças de estrutura de banco, conforme a instrução do Agent; desta vez nenhuma mensagem foi enviada externamente.
- Antes de escrever o E2E interativo, ler a declaração atual de conversation, o case catalog, a coverage matrix e o E2E workflow, e acrescentar as linhas de requisito/cobertura correspondentes aos cenários DB109, usando e2e-case-lifecycle; na fase de implementação reutilizar e estender os casos pendentes já existentes de histórico frio, sem promoção automática.
- Fixtures de arquivo: bancos temporários gerados pelo baseline antigo fixado, com SHA da origem congelada do Reader antigo quando necessário; não usar contas reais/biblioteca de usuário real. Usar fixture de Provider offline; execução de modelo não é obrigatória; se for realmente preciso validar que a execução funciona após reseleção, usar replay/modelo de teste controlável.
- Usar injeção de falha de transação, handshake de processos e barreiras explícitas no sequenciamento, em vez de sleep arbitrário. Concluir primeiro o lote central de testes de armazenamento e só então fazer a validação representativa desktop/remota na build compartilhada; registrar com fidelidade as limitações do ambiente de celular.
- Podem ser reutilizados `apps/zcode-cli/packages/adapters/tests/session-model-selection-migration.test.ts` etc.; o ledger de implementação lista arquivos e resultados concretos dos testes de executor, Repos e Reader antigo.

## 8. Lotes de execução, itens pendentes e critérios de conclusão

### Lotes de execução

- [x] A: fixar baselines novo e antigo; completar o ledger total de bancos/tabelas/campos/produtores/consumidores; fazer spec e testes primeiro; determinar a lista de escrita mínima de compatibilidade.
- [x] B: consolidar a entrada de migração versionada por banco; tratar banco existente sem ledger, inicialização parcial e concorrência; mover para a migração as conversões de estrutura/dados desta rodada, preservando a semântica das regras.
- [x] C: unificar Reader/Writer/recuperação/cópia/importação do novo armazenamento; remover lógica antiga substituída; acrescentar escrita mínima de compatibilidade necessária; separar configuração ausente da leitura de conteúdo.
- [x] D: Reader congelado das duas versões em lote, checagem de tipos, lint, arquitetura e E2E centralizado da Pro; review bidirecional de todas as tabelas e fechamento do commit. Falhas preexistentes e limitações de dispositivo em múltiplas plataformas ficam em item separado no ledger, não escritas como aprovados.

### Tratamento de itens pendentes

Os princípios gerais de produto já foram decididos e não serão perguntados de novo. Depende da auditoria de código determinar: se ainda faltam itens em algum banco, o novo nome de armazenamento de campos homônimos, quais Readers antigos realmente exigem dual-write mínimo, e se as regras existentes de identidade em tempo ocioso conflitam com as decisões atuais. O que puder ser decidido com base neste Todo é implementado direto; quando for preciso nova semântica de produto ou operação irreversível em dados reais, isolar e explicar, sem usar "pendente de migração" para manter bypass de leitura indefinidamente.

### Critérios de conclusão

- [x] Todos os bancos próprios relacionados, todas as tabelas e todas as mudanças de conteúdo persistido desta rodada têm conclusão rastreável; sem lacunas inexplicadas.
- [x] A migração formal cobre as conversões necessárias de estrutura/dados; as entradas antigas foram removidas ou a razão explícita de importação/relevância está registrada.
- [x] Campos/valores antigos e conteúdo preservados; a leitura normal da nova versão não usa mais os campos antigos desta rodada como fonte de dados.
- [x] Upgrade, rollback e novo upgrade com conteúdo acessível, cobrindo dados novos criados/alterados. Resseleção de configuração é permitida; mascarar falha de conteúdo com lista/mensagem vazia não é.
- [x] Todos os dual-writes são o mínimo necessário e têm evidência de Reader antigo; os itens sem dual-write também têm evidência de legibilidade.
- [x] Passaram execução única, rollback em falha, checksum, concorrência, configuração ausente e cenário offline; validação de elegibilidade para execução separada da migração.
- [x] A revisão completa cobriu a semântica de conversão decidida, as abstrações de Provider/Selection/owner e o isolamento entre plataformas; itens não testados e realmente pendentes de decisão estão registrados com fidelidade, sem tomar documento ou teste parcial como entrega concluída.
- [ ] Confirmação antes de publicar: coordenação com o responsável de CLI; DB109-14, shared-host de celular/telemetria conjunta em dispositivo real. Isso não afeta a declaração de implementação de código já concluída, mas não se pode chamar de verificação em todos os dispositivos concluída.

## 9. Registro atual em disco

2026-09-10: Todo criado com base na decisão mais recente do usuário; apenas planejamento registrado, ainda não implementado. Verificação inicial das 18 tabelas de negócio do banco de sessões e do mecanismo de migração original, dos três Repos do App no mesmo banco e das entradas de migração dispersas. Auditoria completa, Reader das duas versões, falhas/concorrência e validação em dispositivo real continuam pendentes.

2026-09-10 início da implementação: o staging fixado `aaa486ed47` foi mesclado normalmente numa branch de integração separada, sem conflito explícito e sem arquivo modificado por ambos os lados; os sete commits de documento exclusivos do branch atual foram todos mantidos. O upstream trouxe principalmente o journal DWF 0019, compartilhamento de anexos/pré-checagem, remoção de duplicação do lembrete de cota do Start, estilo de workspace e melhorias de inicialização de desenvolvimento/ferramentas de arquitetura; não se portam nem refazem commits do upstream. Passaram o lote de 328 testes unitários do App em 22 arquivos, 68 testes de armazenamento do Agent/migração de seleção/anexos em 3 arquivos, typecheck da raiz, lint (42 warnings/0 erros) e verificação de arquitetura. Com o runner real, validação em banco em memória do baseline antigo fixado: 18 → 19; o SQL/ledger/estrutura de tabela antiga e os dados de exemplo dos 18 originais inalterados, as quatro tabelas novas presentes, ledger inalterado em aberturas repetidas e verificação de chaves estrangeiras aprovada. Não foi feita validação em desktop/celular; essas validações combinadas não são tratadas como implementação do Todo109 nem aceitação total.

2026-09-10 fechamento da implementação: novas Agent 0020 e App 0001/0002; a proteção de todas as tabelas cobre 22 tabelas do Agent e 8 do App. Removidas as conversões antigas por leitura/recuperação e as escritas de complementação em tempo ocioso; acrescentados objetos mínimos de compatibilidade para User/timeline com evidência de Reader antigo congelado e proteção de snapshot de fork. Passaram o lote de 195 do Agent, o lote de 123 do App e 14 casos complementares; o caso de desktop isolado da Pro, encadeando quatro cenários de cold start/resseleção, passou. Faixas de comando específicas, asserções de texto de erro antigo, falhas preexistentes de lint/knip do Agent e as limitações remotas/celular estão no ledger de implementação, sem somar contagens nem esconder o que não foi testado.