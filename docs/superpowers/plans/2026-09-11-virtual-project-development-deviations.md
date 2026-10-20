# Refatoração do projeto virtual: registro de desvios de desenvolvimento

Design relacionado: [Design do projeto virtual](../specs/2026-09-09-virtual-project-design.md).
Progresso relacionado: [Registro de implementação](2026-09-10-virtual-project-implementation.md).

Este arquivo registra, de forma isolada e com acréscimos contínuos, os casos em que o desenvolvimento divergiu do design, da compreensão original ou das expectativas da primeira implementação. **"Corrigido" significa apenas que o problema já tem uma implementação específica e verificação; não significa que a refatoração inteira esteja concluída.** Verificações de GUI, de remoto real e entre plataformas que não foram executadas não contam como aprovadas.

## Desvios confirmados e tratados

### D01: A regra de atribuição inicial é inconsistente dentro do mesmo design

- Expectativa original: a regra de primeira atribuição de sessões sem dono era consistente entre a spec e a skill.
- Realidade: o texto antigo do design continha "com múltiplas correspondências, priorizar o diretório principal" e "sem classificação, visível apenas na linha do tempo"; a decisão final da seção 3 exige correspondência única para atribuir, e todo o restante vai para a área de tarefas. O I17 do session-management também mantinha o resíduo "apenas linha do tempo".
- Tratamento: prevalecer a decisão final da spec especificada pelo usuário, corrigindo o corpo do design, e registrar no documento de implementação o limite de aplicação do texto antigo da skill. Usar um bit de atribuição já decidida para distinguir "NULL legítimo" de "ainda não decidido", evitando que arranques posteriores movam a sessão automaticamente.
- Verificação: os testes de contrato de armazenamento de projetos cobrem zero/uma/múltiplas correspondências, migrações repetidas e NULL explícito; o cenário de GUI ainda aguarda aceitação.

### D02: O índice de tarefas não tem registro de migrações versionado, e o número de plano do CLI já estava ocupado

- Expectativa original: ambos os bancos poderiam receber o schema desta rodada na sequência de migrações existente.
- Realidade: o `tasks-index.sqlite` do app só tinha lógica de criação de tabela / adição de colunas, sem registro de migrações; o CLI já tinha `0019_dwf_journal` e não podia ocupar esse número do plano antigo.
- Tratamento: extrair um migration runner compartilhado pelos dois bancos; o app ganha `schema_migration` e `0001_projects` (nome original durante o desenvolvimento `v3_projects`, renomeado ver D98); o CLI usa `0020_session_soft_delete_outcome`, sem modificar SQL/checksum históricos.
- Verificação: migração SQLite real, execução repetida, checksum, rollback em falha — testes aprovados; a aceitação de GUI para atualizar → escrever na versão antiga → atualizar de novo ainda está pendente.

### D03: Ao restaurar um backup de nível de tabela, as chaves estrangeiras afetam tabelas de corpo não incluídas no backup

- Expectativa original: bastava executar DELETE/INSERT na tabela de backup para restaurar.
- Realidade: as chaves estrangeiras em cascata de `message`/`part` do CLI faziam com que apagar `session` sem cuidado corrisse o risco de esvaziar o corpo; desativar foreign_keys dentro da transação também não serve como proteção.
- Tratamento: desativar as chaves estrangeiras antes da restauração e, dentro da transação, restaurar as colunas do backup verificando contagem de linhas, hash e chaves estrangeiras; limpar apenas os registros de migração correspondentes a esta restauração, preservando o schema novo.
- Verificação: fixture SQLite temporário executando de fato o comando de restauração do projeto: restauração da tabela pai, preservação das tabelas filhas e rollback dos registros de migração — aprovados. Nenhuma restauração foi executada sobre o banco de dados real do usuário.

### D04: A declaração de tabelas afetadas de cada migração nem sempre é completa

- Expectativa original: depois de completar `touchedTables` nas migrações históricas, a declaração cobriria todas as escritas reais.
- Realidade: os testes de hash por tabela revelaram que `0019_dwf_journal` também escreve em `dwf_actor`, omitida na primeira declaração.
- Tratamento: apenas complementar as declarações de tabelas afetadas, sem alterar o SQL das migrações históricas; construir fixture pré-migração para cada migração e comparar o hash de conteúdo de todas as tabelas antes e depois.
- Verificação: 20 testes de fronteira de migração do CLI aprovados; há ainda um teste de hash de todas as tabelas para as migrações do app.

### D05: O SQLite embutido do Node é renomeado para o nome de um módulo de terceiros após o empacotamento real

- Expectativa original: `node:sqlite` no código-fonte e nos testes unitários podia ser usado diretamente no bundle do Node.
- Realidade: o tsup remove `node:` por padrão e o artefato passa a ser `sqlite`; esse não é um módulo embutido do Node, e a importação do bundle real falha.
- Tratamento: a configuração de build do Node em questão passa a definir `removeNodeProtocol: false`, preservando o identificador do módulo embutido.
- Verificação: 3 arquivos de teste e 22 testes relacionados ao bundle real aprovados; este problema não foi descoberto apenas por checagem estática de tipos.

### D06: A workspace identity no banco remoto não é igual a uma identidade física de host estável

- Expectativa original: a partir da workspace identity do banco era possível deduzir diretamente o host ao qual o projeto pertence.
- Realidade: o Source Server ainda pode guardar rotas canônicas SSH/WSL históricas, e múltiplos endereços de conexão antigos do mesmo Server seriam julgados como hosts diferentes.
- Tratamento: o ponto de entrada de inicialização do Server confiável injeta um `host_id` estável do Source Server; preservam-se a workspace key canônica histórica, o cwd real e o hash de configuração, sem reescrever em lote as identidades de workspace.
- Verificação: dois endereços de conexão históricos do mesmo Server podem ser agrupados em um mesmo host de projeto; os testes de resolução de movimentação e criação de diretório foram aprovados. A conexão real entre máquinas ainda aguarda aceitação.

### D07: A ordem de inicialização original do Server Core contornava a barreira de migração

- Expectativa original: reutilizar as migrações do repositório de projetos bastava para garantir que o remoto atualizasse antes de atender.
- Realidade: o Server Core criava os serviços de negócio antes de determinar a identidade do Source; podia abrir a capacidade de negócio antes da conclusão das migrações/preparação da identidade.
- Tratamento: resolver primeiro a identidade estável do Source e aguardar o sucesso das migrações do banco do app antes de criar os serviços e abrir o RPC; em caso de falha, manter fechado.
- Verificação: barreira assíncrona, fechamento em falha de migração e testes do bundle ESM real aprovados (2 arquivos, 8 testes naquela rodada).

### D08: A atribuição de uma nova sessão não pode esperar pelos primeiros fatos chegarem para ser completada

- Expectativa original: bastava escrever a atribuição do projeto depois que a criação pelo CLI tivesse sucesso.
- Realidade: a primeira entrada ou o fato do sessions-index pode chegar antes, disparando a primeira atribuição padrão; a reiteração também pode sobrescrever uma atribuição que o usuário já tiver movido.
- Tratamento: o Host reserva um session ID estável conforme a identidade do comando e escreve a atribuição de forma atômica antes de enviar ao CLI; linhas reservadas sem `cli_created_at` ficam invisíveis; reserva repetida não altera uma atribuição já existente.
- Verificação:approved nos testes de repositório/serviço de reserva, ingestão de fatos, operações de organização concorrentes e não-regressão da atribuição após reiteração. Outros pontos de entrada de criação ainda precisam ser integrados, ver U03.

### D09: A condição de inicialização pelos primeiros fatos da linha reservada é larga demais e sobrescreve a configuração de exibição

- Expectativa original: todas as linhas sem `cli_created_at` podiam ser inicializadas com os primeiros facts para estabelecer a base de exibição.
- Realidade: a primeira implementação redefinia as informações de exibição existentes (modelo, modo etc.) para os valores padrão dos facts.
- Tratamento: inicializar apenas linhas inexistentes ou linhas reservadas explicitamente vazias (sem tempo de CLI e com created_at antigo igual a 0); preservar fixar, arquivar, não lido e a intenção de título ocorridas no intervalo.
- Verificação: o problema foi exposto pelos testes de regressão do task-index; após estreitar a condição, o sincronizador e os testes de linha reservada foram aprovados.

### D10: Fixar um projeto carrega o conjunto completo de roots e sobrescreve edições concorrentes

- Expectativa original: ao salvar o projeto, devolver os roots atuais da UI junto não tinha efeito.
- Realidade: depois que outra janela edita os roots, a operação de fixar nesta janela pode reescrever os roots antigos.
- Tratamento: `saveProject.roots` passa a ser opcional; fixar submete apenas id e pinned, preservando dentro da transação os roots existentes e a propriedade do nome.
- Verificação: o teste de contrato de editar os roots e depois fixar com a visão antiga foi aprovado.

### D11: O resultado final do CLI não pode ser reconstruído a partir dos turn headers já podados

- Expectativa original: o sessions-index podia deduzir o resultado a partir do último turn da projeção atual.
- Realidade: em poda histórica ou recuperação a frio, a projeção pode estar em draft/sem turns antigos, causando a perda do resultado persistido.
- Tratamento: `last_outcome` do store do CLI passa a ser a única fonte; a recuperação a frio lê o valor persistido e os eventos de estado final atualizam os metadados da projeção após a persistência no core.
- Verificação: aprovado o teste em que a projeção podada mantém o resultado de erro antigo; as regressões de projeção do CLI, comandos nativos e migrações foram aprovadas.

### D12: Depois de remover as escritas no stream antigo, o writer genérico de linha inteira continua deixando um segundo ponto de entrada de fatos

- Expectativa original: remover `applyAgentPatch`, a derivação de estado do Host e a escrita de eventos de stream já havia centralizado a propriedade dos fatos.
- Realidade: `syncTaskMeta` ainda é chamada pela restauração, importação, criação e marcação de automação; o parâmetro de metadata completo permite misturar novamente fatos e estado organizacional. Há ainda um caminho de importação Claude que só faz backup de JSON e pode criar índices de forma independente.
- Tratamento: remover `syncTaskMeta` e as seed API sem chamadas; dividir as escritas em fatos do CLI, estado organizacional e cache de exibição. A importação Claude deve criar primeiro uma sessão CLI real, com o JSON apenas como backup. Remover as antigas APIs de arquivamento automático e de arquivamento em lote de workspace sem chamadores em produção.
- Verificação: 4 arquivos (sincronizador, adapter, task-facts, importação Claude) com 162 testes aprovados. As fixtures de teste do repositório passaram a definir explicitamente fatos do CLI e estado organizacional separadamente, sem manter writer de produção exclusivo para testes.

### D13: Depois que a exibição de metadados passa a usar novas colunas, a ordenação e a busca no SQL ainda leem as colunas antigas

- Expectativa original: `rowToMeta` usar `cli_*` completava a migração do caminho de leitura da V1.
- Realidade: o SQL de listagem ainda ordena pelo `updated_at` antigo e busca pelo title antigo; ao contaminar de propósito as colunas antigas e o meta_json, mesmo com o espelho correto, a listagem sai na ordem errada.
- Tratamento: listagem, busca e ordenação de sessões de automação passam a usar o espelho do CLI; as colunas antigas de fato ficam restritas à migração e à escrita dupla de downgrade, preservando a regra legítima de exibição do override de título do Host; linhas reservadas sem fato persistente não entram nos resultados da consulta.
- Verificação: o novo teste de regressão reproduz primeiro a inversão de ordenação e só então a consulta é alterada; os testes direcionados do repositório foram aprovados.

### D14: Testes antigos tratam comportamento já removido como premissa de asserção

- Expectativa original: após a refatoração, os testes existentes precisariam apenas de pequenos ajustes de import.
- Realidade: alguns testes dependem da persistência de running pelo Host, da escrita de rascunho vazio no índice, da estrutura de Group e de trechos do código-fonte do Sidebar antigo; outros mocks não têm o método de reconcile do CLI, agora obrigatório. Não é possível satisfazer essas asserções restaurando o código antigo.
- Tratamento: distinguir regressões de comportamento de produto de asserções sobre a implementação antiga. Manter continuamente as coberturas válidas de deduplicação, ordenação, CAS de não lido, fila de controle remoto e restauração de modelo; atualizar fixtures para fornecer explicitamente os fatos do CLI; os testes do Group removido saem junto com a funcionalidade antiga.
- Verificação: na primeira execução completa dos testes unitários afetados foram 1711 arquivos, com 16 falhas; naquela rodada os itens foram corrigidos um a um e a aceitação final completa ainda não foi refeita. Não se pode atribuir todas as falhas desta rodada apenas a testes desatualizados.

### D15: A reconciliação sob demanda pode chegar atrasada em relação a fatos de streaming mais novos

- Expectativa original: como o resultado da requisição vem do CLI, ele poderia sobrescrever com segurança o espelho local.
- Realidade: durante a espera da requisição de reconciliação, fatos de streaming mais novos podem chegar primeiro; a resposta antiga ainda sobrescreve o novo título ou resultado. Um novo teste reproduziu primeiro as duas escritas.
- Tratamento: o ponto de entrada de fatos mantém apenas a geração da requisição em trânsito; quadros novos, remoções ou requisições mais novas revogam a elegibilidade de gravação da resposta antiga, e a limpeza ocorre ao fim da requisição, sem novo cache de estado da sessão.
- Verificação: o teste de resposta atrasada e as regressões do sincronizador e do repositório foram aprovados (3 arquivos, 78 testes naquela rodada).

### D16: A build pré-requisito do E2E desktop encontrou que a lista de alias do CLI omitia um novo subpath de migração

- Expectativa original: como os exports do shared já declaravam o módulo de migração, o build do CLI também deveria conseguir resolvê-lo.
- Realidade: o primeiro E2E desktop falhou após o build do app, ao montar o bundle do CLI: o alias manual concatena `@zcode/shared/sqlite-migrations` em `src/index.ts/sqlite-migrations`. Naquela rodada não se chegou à GUI, portanto não foi registrado como falha nem aprovação de teste de interface.
- Tratamento: remover a lista manual de subpaths do shared e derivar os alias exatos diretamente dos exports do pacote shared, colocando o entry point genérico por último; adicionar testes de contrato de build cobrindo todos os exports.
- Verificação: 11 testes de contrato de build aprovados; a build pré-requisito completa passou e os dois casos posteriores de E2E desktop reais passaram, ver D18.

### D17: A árvore de projetos em estado frio ainda marca resultados desconhecidos como completed

- Expectativa original: depois de remover as escritas de estado antigo, a listagem em estado frio deixa de inferir o resultado da sessão.
- Realidade: a projeção da árvore de projetos usa completed por padrão para linhas sem `last_outcome`, e a primeira migração também tratava o running histórico como completed; a ingestão de facts ainda tem um ramo de compatibilidade que completa o resultado pelo phase em tempo real.
- Tratamento: a migração mapeia apenas estados terminais históricos explícitos, o resto fica NULL; novos fatos aceitam somente o `lastOutcome` do CLI e a projeção em estado frio permanece desconhecida. Também é proibido que a identidade JSON antiga sobrescreva a identidade de chave primária da linha.
- Verificação: após adicionar o caso de falha, a correção foi feita; migração de projetos/repositório, facts, sincronizador e UI relacionada somam 6 arquivos e 95 testes aprovados.

### D18: A condição de prontidão do E2E antigo dependia de um nó da barra lateral de workspace já removido

- Expectativa original: reutilizar `waitForWorkspaceApp` permitiria validar a inicialização da nova barra lateral.
- Realidade: o Electron abriu o workspace normalmente, o runtime mostrou o activeWorkspacePath correto e o pane de sessão visível, sem erros de página, mas o helper ainda esperava o antigo nó da árvore de workspace, fazendo os dois casos expirarem.
- Tratamento: a nova estrutura considera a aplicação pronta com base no cwd alvo do tab store real e no pane visível, preservando as verificações já existentes da página antiga. O caso de criação espera o botão de ação, sem depender do cwd que o caso anterior já trocou.
- Verificação: dois casos reais de E2E Electron passaram: cwd independente/NULL de atribuição em criações globais consecutivas; criação, renomeação, soft delete e restauração com os mesmos roots de um projeto com roots vazios, mantendo o ID. O run ID do artefato é `desktop-e2e-20260910181124116-p44201-cdce8d980fbeec75`. Não cobre múltiplos roots, remoto real ou celular.

### D19: O repositório de projetos pode ser apontado pelo chamador para outro Host

- Expectativa original: o serviço de projeto naturalmente só operava seu próprio banco autoritativo.
- Realidade: a primeira implementação permitia que `saveProject.hostId` especificasse diretamente um host remoto, e a consulta de árvore também retornava linhas-sombra antigas da máquina local; isso misturava "cache" com "projeto remoto autoritativo".
- Tratamento: leitura e escrita do repositório restritas ao owner do banco; requisições entre Hosts são roteadas pela camada de serviço via hostId explícito pelo gerenciador de conexões existente, falhando quando offline. A leitura da árvore remota reutiliza o resolvedor de workspace identity para registrar o mapeamento; não se cria attachment de source-settings no celular nem runtime independente.
- Verificação: 3 arquivos (migração, repositório, entrada local) com 20 testes aprovados; 5 testes de roteamento de todas as operações de projeto e de vínculo de identity aprovados; portão de arquitetura 0 baseline / 0 new. A UI remota e a conexão real ainda aguardam aceitação.

### D20: A antiga entrada de criação nativa e a proteção de ID impedem que a reserva de atribuição se propague

- Expectativa original: com a V4 conectada à reserva, todas as criações usariam o mesmo ponto de entrada de atribuição.
- Realidade: a antiga `session/create` não reservava; o CLI ainda só permitia importar um ID especificado, e passar um ID para a criação nativa comum falhava. A importação antiga especificava o ID por hash externo e podia sobrescrever registros já removidos ou que seguiram em conversa.
- Tratamento: as criações native/V4 do Host passam todas pela reserva (com NULL explícito por padrão); todas as criações do CLI compartilham a verificação de ocupação de ID, rejeitando ID duplicado em persistência, memória e trânsito, ocupando antes do materialize assíncrono e liberando ao final. A importação explícita aloca uma nova identidade CLI; o hash antigo serve apenas para reparo de backup histórico.
- Verificação: o arquivo inteiro da V4 com 49 testes aprovado; o teste direcionado do wire nativo aprovado; os testes de criação/concorrência do CLI aprovados. Na primeira execução do arquivo inteiro do protocolo CLI, 111/112 passaram, e a outra falha era uma asserção antiga sobre ProviderConfigMap.toJSON depois de o objeto virar array de rules; agora a verificação é feita pela interface pública get, e a rodada completa passou 112/112.

### D21: A definição de agendamento/tempo ocioso só tem cwd, e a criação reservada relê os roots atuais

- Expectativa original: depois que o schema ganhou campos de projeto, a cadeia de despacho existente passaria a usar naturalmente o diretório da criação.
- Realidade: Repo, scheduler → main → mensagens do Host e o task adapter precisam passar explicitamente os diretórios adicionais; a criação V4 ainda sobrescrevia o diretório do chamador com o resultado da resolução do projeto atual. Depois que o projeto remove o cwd antigo ou sofre soft delete, a criação comum passa a rejeitar a próxima execução de uma definição já existente.
- Tratamento: a criação da definição é resolvida pelo Host, que salva projeto, owner, cwd e o snapshot de diretórios; a falha de resolução vem antes da obtenção do número. Despacho/reiteração/resume passam os valores salvos, com array vazio explícito sem fallback. A reserva de atribuição com snapshot continua validando projetos existentes do mesmo Host, mas não revalida os roots atuais; a criação comum mantém a validação original e o conceito de projeto não entra no CLI.
- Verificação: os novos testes reproduzem primeiro 5 falhas de serviço/armazenamento e 3 falhas de propagação; após corrigir a fixture do mock da V4 que não persistia, serviço/armazenamento, mensagens de agendamento e adapter somam 5 arquivos com 197 testes aprovados. O caso puramente lógico da tabela reproduziu primeiro a mesclagem de projetos do mesmo cwd e passou após passar a usar o ID do projeto; a seleção e submissão pela GUI de um projeto com roots vazios foi aprovada: no SQLite real a atribuição está correta, o cwd padrão foi criado e os diretórios adicionais são []; o agendamento remoto completo ainda aguarda aceitação.

### D22: A nova barra lateral passa o evento de clique do React para o automationId da navegação

- Expectativa original: o callback de abertura sem parâmetros da barra lateral podia ser usado diretamente como onClick do botão.
- Realidade: o Electron real capturou `TypeError: e?.trim is not a function`. O primeiro parâmetro opcional da implementação de navegação é o automationId; passar a função diretamente faz o React MouseEvent ser tratado como ID, e após clicar em Automations a página não abria.
- Tratamento: na fronteira de evento do botão a chamada explícita sem parâmetro é feita ao callback de negócio; não se adiciona fallback de adivinhação de tipos na navegação.
- Verificação: nas duas execuções reais os dois primeiros casos passaram e o novo caso de Automations falhou; na segunda execução a pilha da exceção e o texto da página foram preservados. Após a correção, os três casos reais de desktop passaram, run ID `desktop-e2e-20260910190747339-p59006-eb792156746a45ba`. Em uma execução posterior o clique no menu encontrou interceptação de coordenadas do WDIO e, ao reutilizar o helper de clique em DOM visível já existente nos casos automatizados, a execução foi concluída; não se apresenta isso como aceitação de celular/remoto.

### D23: Depois que o despacho automático fixa os diretórios, a restauração manual a frio ainda lê o projeto atual

- Expectativa original: passar diretórios fixos para scheduler/create/resume bastava para atender H1.
- Realidade: quando o usuário mais tarde abre pela lista histórica uma sessão gerada automaticamente, não há parâmetros de requisição de agendamento; a resolução comum de diretórios lê os roots atuais. E, se a definição for buscada por automationId, após a remoção física da definição a configuração ainda se perde.
- Tratamento: a reserva de atribuição de primeira para a sessão gerada escreve, na mesma transação, o `tasks.execution_directories` imutável; os três pontos de entrada de restauração a frio leem o mesmo valor. Sessões comuns ficam com NULL, preservando a resolução dinâmica do projeto; reiteração e remoção da definição não alteram o snapshot de inicialização. Definições antigas são migradas para [] explícito, sem ampliar o escopo de permissões antigas com os roots de um projeto novo.
- Verificação: os novos testes de restauração manual, remoção de definição e reserva repetida falharam primeiro e, após a correção, projeto/repositório/serviço/migração somam 3 arquivos com 20 testes aprovados; a checagem de schema dos dois bancos passou e a baseline revisável foi atualizada, sem alterar a migration histórica do CLI.

### D24: Hosts-sombra históricos ocupam vagas de conexão, e a atualização de mudanças vazias retransmite em duplicidade

- Expectativa original: linhas não-locais em hosts representavam conexões remotas salvas, e a retransmissão após a atualização podia dirigir a releitura da UI diretamente.
- Realidade: a migração das sombras antigas de task gera marcadores de identidade com target_json=NULL; eles aparecem como conexões fantasma e ocupam as 20 vagas. Outro teste mostra que o mesmo cache também é retransmitido, o que, ligado à atualização automática, forma um ciclo de releitura.
- Tratamento: apenas registros com alvo de conexão são tratados como conexões salvas; a alteração de um marcador para conexão também revalida a capacidade. O consumo do mesmo cache usa a versão CAS para rejeitar respostas atrasadas, mas não emite transmissão de mudança de projeto.
- Verificação: os dois novos testes falharam primeiro e, após a correção, passaram 8/8; a integração entre registro de conexão e Source Directory continua pertencendo a U01.

### D25: A reconexão existente no arranque descarta conexões salvas que não subiram há sete dias

- Expectativa original: a "conexão automática no arranque com hosts salvos" do design podia reutilizar a enumeração existente de candidatos.
- Realidade: a antiga API de candidatos filtra por padrão pelos últimos sete dias, então dispositivos não usados por muito tempo nunca participam e o projeto também não consegue se atualizar.
- Tratamento: remover o filtro de idade das conexões físicas de Source e os parâmetros inúteis, mantendo a ordenação por atividade recente e preservando a chave global de desligamento, as credenciais silenciosas e as fronteiras de concorrência do gerenciador de conexões existente. A estratégia de restauração independente do histórico lógico de workspace não foi misturada à enumeração de conexões físicas.
- Verificação: o teste antigo de candidatos por timestamp falhou primeiro; após a correção, Source Directory e portão de arranque somam 2 arquivos com 42 testes aprovados. Em seguida foi adicionado o teste de candidato "salvo mas nunca handshake bem-sucedido", reproduzindo outra omissão, já incluído no mesmo caminho de enumeração.

### D26: A mescla de identidade de endereço carece de geração de membro, e as configurações antigas reacionam conexões removidas

- Expectativa original: bastava alinhar o gerenciador de conexões existente com a nova tabela de pontos de entrada pelo Source ID.
- Realidade: antes do primeiro handshake há apenas a identidade de endereço SSH/WSL/Docker, e o Source estável só existe depois do handshake; remover/readicionar durante a conexão faz a resposta antiga ser escrita no novo membro. O antigo Source Directory também enumerava sozinho registros das settings antigas.
- Tratamento: a primeira migration importa os Profiles/Sources salvos e mescla os aliases de endereço; persiste-se membership_id. O ConnectionManager existente obtém o membro antes do probe e faz commit condicional antes de publicar online; no arranque e na recuperação automática só permanecem membros, e os candidatos do Host são intersectados com a tabela de membros do SQLite. A troca de identidade, após a confirmação já existente, cria um Source separado, e as entradas de projeto antigas mantêm o dono original.
- Verificação: os três novos casos do gerenciador de conexões falharam primeiro e, após a correção, o arquivo inteiro passou com 37 testes; admission de membro e transação de entrada somam 2 arquivos com 15 testes aprovados; a migration de conexões salvas e a regressão de entrada tinham passado antes com 17 casos. O handshake remoto real e a corrida de remoção ainda aguardam E2E e não podem ser substituídos por teste unitário.

### D27: A nova tarefa global remota ainda recebe o diretório default compartilhado

- Expectativa original: depois que a criação global passou a usar project.prepareSession, o remoto também herdaria o comportamento.
- Realidade: o serviço de gerenciamento do Source ainda chama fileService.ensureConversationWorkspace, que devolve sempre o mesmo diretório default; isso contorna o novo serviço de projetos.
- Tratamento: usando a conexão com o Source online no momento, passa-se a chamar o projectService.prepareSession remoto; cada criação tem cwd independente e projectId=NULL. O protocolo de retorno original e o registro de caminhos do Source são preservados, sem abrir outro runtime.
- Verificação: o novo teste de duas alocações consecutivas de diretório falhou primeiro e, após a correção, gerenciamento do Source, conexão, Directory, entrada e migration somam 6 arquivos com 112 testes aprovados. Em seguida foi removido o ramo do Renderer que ativa um tab de conversation existente; tanto projeto vinculado quanto conversation criam uma sessão lógica independente, e a regressão parametrizada nova passou (protocolo remoto/workspace/HTTP, 4 arquivos com 89 casos). O remoto real de ponta a ponta ainda precisa ser verificado.

### D28: Vários pontos de entrada de diretórios antigos que resolvem para o mesmo projeto de múltiplos diretórios colidem com a restrição de unicidade

- Expectativa original: bastava preencher remote_project_id entrada por entrada no caminho antigo para concluir a resolução após a conexão.
- Realidade: quando um projeto de múltiplos diretórios corresponde a vários pontos de entrada antigos de workspace, a segunda atualização dispara a restrição de unicidade (host_id, remote_project_id).
- Tratamento: após o CAS de ID/versão da entrada, na mesma transação preserva-se a entrada já resolvida e remove-se a entrada antiga duplicada atual. Quando o cwd antigo corresponde a vários projetos, mantém-se pendente de escolha, sem adivinhar a atribuição. A barra lateral usa Host + ID do projeto para agregação, seleção e ordenação.
- Verificação: o novo caso de deduplicação em SQLite e o caso de agregação entre Hosts falharam primeiro; após a correção, 2 arquivos com 17 testes passaram. Em seguida foram complementados os testes de ambiguidade de diretório e de remoção tardia pelo reader da UI; os 3 arquivos mais recentes da barra lateral passaram com 9 casos.

### D29: A barra lateral inicialmente lia apenas a árvore local, e o cache remoto não tinha fronteira de operação offline

- Expectativa original: depois que o serviço de projeto passasse a rotear por Host, a barra lateral poderia reutilizar o mesmo nó diretamente.
- Realidade: a barra lateral não lia a tabela de entradas local; ao conectar o cache, os nós antigos ainda exibiam expandir, criar e editar, e as operações não carregavam hostId. O caso real de Electron offline falhou na primeira execução (os outros três passaram).
- Tratamento: a tabela de entradas controla o conjunto visível remoto, e o owner online fornece apenas seus projetos/tarefas; offline há só cache básico, e remover uma entrada não toca nos dados remotos. Antes de confirmar a leitura, a geração do membro é reconferida; as operações de nó passam hostId, e offline resta apenas a remoção local. Mudanças no estado de conexão reutilizam a notificação de difusão já existente para reler.
- Verificação: os testes unitários de componente e reader passaram; após a reconstrução completa em série, os 4 casos de desktop passaram, run ID `desktop-e2e-20260910195101440-p67448-3e05911527984db6`, incluindo cache offline, impossibilidade de expandir/criar/editar, remoção de entrada local, não ressurreição ao recarregar e preservação de host. Adição remota explícita, navegação de nova tarefa, shared-host do celular e operações reais online continuam no escopo não concluído.

### D30: O typecheck paralelo sobrescreve o bundle do Host do E2E, fazendo o processo de arranque sair

- Expectativa original: a checagem de tipos e a build completa/verificação de GUI eram independentes e podiam ser executadas em paralelo.
- Realidade: packages/desktop/tsconfig.host.json habilita emit, e o outDir é out/host tanto para o tsup quanto para ele. O typecheck sobrescreve o index.js empacotado por uma versão que importa o código-fonte. O fork do Host no Electron sai com code 1 após cerca de 126ms, e a página mostra apenas root-startup-loading. Inspecionar o artefato e rodá-lo com HOME isolado reproduziu ERR_MODULE_NOT_FOUND (@zcode/rpc/src/foundation.js).
- Tratamento: nesta verificação o typecheck → build completa → E2E é executado em série, e durante as execuções de E2E seguintes ficam proibidos typecheck/build que reescrevam out. Não se mascarou a falha de arranque do Host prolongando a espera da UI.
- Verificação: o run desktop-e2e-20260910194608389-p65882-0bfd4916e3bf8f3b falhou no arranque e não pode servir para a aceitação de negócio; após o typecheck em série e a reconstrução forçada, o run `desktop-e2e-20260910195101440-p67448-3e05911527984db6` passou com quatro casos.

### D31: A resolução de diretório só valida a consistência entre linha e projeto, e não o Host atual detentor do banco

- Expectativa original: `row.host_id` igual a `project.hostId` já garantiria a atribuição correta do diretório.
- Realidade: as linhas-sombra remotas antigas continuam no banco local, e a consulta local consegue ler diretórios de projetos remotos, mesmo com a leitura de árvore e a criação já restritas ao owner.
- Tratamento: na mesma transação de leitura, a resolução de diretório compara primeiro row.host_id com o owner do repositório e só então devolve o diretório de inicialização; a criação em reiteração reutiliza o mesmo caminho.
- Verificação: após completar a fixture com a chave estrangeira do Host, o teste direcionado reproduziu a não rejeição; após a correção, o arquivo inteiro do repositório passou com 11 testes. Os facts do CLI e o alias canônico de workspace existente não são reescritos.

### D32: O cliente owner-only não tem tabela de entradas do Controller, mas a leitura agregada falha na árvore inteira

- Expectativa original: remote-projects só estaria disponível para o Controller local, e rejeitar todos os owners remotos bastaria.
- Realidade: a UI conectada diretamente ao owner remoto ainda precisa ler a árvore de projetos autoritativa daquele owner; o reader agregado consulta primeiro a tabela de entradas, e a exceção controller-only bloqueia a árvore inteira.
- Tratamento: a mesma fábrica de serviços, por parâmetro de montagem confiável, proíbe a escrita pelo Controller; o readDirectory owner-only devolve diretório vazio e não acessa o banco. O projectService continua lendo a árvore autoritativa do owner atual, sem criar cópia de dados do Controller.
- Verificação: o novo teste de consulta owner-only falhou primeiro e, após a correção, o arquivo inteiro do serviço de entradas passou com 14 testes; o editor ganhou um teste de restauração do owner atual, para evitar escrita forçada no Host local. A UI multi-dispositivo e a cadeia de encaminhamento remoto ainda não foram aceitas.

### D33: O encaminhamento secundário do workspace perde o novo canal de projetos, e o objeto proxy não prova suporte remoto

- Expectativa original: ter um projectService no accessor remoto já indicava que a função estava conectada.
- Realidade: o conjunto de serviços de workspace montado manualmente pelo Host não registra o canal de projetos; o cliente ainda gera um proxy para o canal desconhecido, o que não permite concluir a capacidade do Server antigo.
- Tratamento: o handshake do Server declara a capacidade opcional virtualProjects, e o novo Host encaminha project/remote-projects com base nela; o conjunto de canais obrigatórios da v1 não muda. A adaptação de root único do Server antigo ainda não foi implementada, e conectabilidade não pode ser equiparada à conclusão de G1.
- Verificação: o encaminhamento, o schema de capacidade e o diretório de conversas remoto tiveram três novas asserções que falharam primeiro e, após a correção, 4 arquivos com 89 testes passaram.

### D34: O prepareSession remoto devolve o diretório, mas perde a identidade estável necessária à navegação

- Expectativa original: passar projectId bastava para reutilizar o fluxo local de criação.
- Realidade: o antigo hook de criação ignorava hostId e passava o caminho real remoto ao addTab local; a resolução de diretório remoto só devolvia cwd, sem a identity do attachment.
- Tratamento: o montador de identity do Host registra e devolve workspaceIdentity no prepareSession; o Root roteia explicitamente por hostId, e o remoto vincula o logical attachment pelo conector existente antes de escrever o rascunho sob essa identity, com fallback local só por caminho proibido. O celular chama apenas o switcher shared-host já existente, nunca o connect nativo.
- Verificação: as novas asserções de serviço e do Root falharam primeiro e, após a correção, 2 arquivos com 11 casos passaram; 3 novos casos passaram para reuso de logical attachment, isolamento de mesmo cwd entre Sources e falha que só recicla o attachment próprio. O cenário em que o novo cwd do celular ainda não aparece na lista de workspaces do desktop continua a precisar de integração.

### D35: A ativação do workspace pré-aquece rascunhos sem atribuição de projeto

- Expectativa original: primeiro vinculava o workspace remoto e só depois definia o projectId do rascunho.
- Realidade: o callback onWorkspaceActivated já existente chamava startDraft durante a vinculação, e na espera posterior pela atualização da lista podia iniciar um pré-aquecimento com atribuição vazia.
- Tratamento: a intenção de open-project carrega um draftProjectId opcional, definido no mesmo callback da ativação vinculada; evita-se iniciar uma instância com roots errados para depois sobrescrever. O CLI create continua consumindo apenas o diretório resolvido pelo Host e não recebe ID de projeto.
- Status: o código já está integrado e os testes unitários de serviço/Root passaram; ainda é necessário verificar com o envio real da primeira mensagem no remoto, e isso não é registrado como conclusão de ponta a ponta.

### D36: No E2E de edição de projeto, o clique durante o fechamento do diálogo é interceptado pelo elemento raiz

- Evidência real: no run `desktop-e2e-20260910201812675-p72179-d846d2e013673374`, VP08/VP05 passaram, mas o clique no menu após a edição e os cliques subsequentes de criação foram interceptados pelo elemento html raiz; os elementos existiam e estavam visíveis.
- Investigação: foi adicionado um teste de ciclo de vida em jsdom para menu→editar→salvar (aprovado); o E2E coleta body pointerEvents / dialog / menu após confirmar a saída do diálogo. O run seguinte `desktop-e2e-20260910202050479-p73151-d269934d33e60ab1` imprimiu `auto / 0 / 0`, e os 4 casos passaram.
- Tratamento e nova evidência: o teste passa a esperar explicitamente a saída do diálogo antes da próxima interação, sem sleep fixo nem contorno do clique em DOM. O run `desktop-e2e-20260910204013338-p98809-9f9638cd48e4d620` falhou novamente, medindo `bodyPointerEvents=none / dialogs=0 / menus=0`, e o caso seguinte também não conseguia clicar. Ficou confirmado que resta um lock global de ponteiro. Depois de adicionar um teste de interanimação, a reprodução ficou estável: o diálogo fecha primeiro, a animação de saída do menu termina depois, e o body continua em none. O menu de projeto passou a ser não modal, e o diálogo de edição passou a exclusivelyuer a restrição modal; o teste saiu de falha para aprovação. O run real `desktop-e2e-20260910204902586-p1481-2c14bfd9e5025eaf` passou com quatro casos. O diagnóstico com setter de estilo do run 15 falhou porque o Chromium não oferece esse descriptor, portanto não vale como validação de negócio, e o diagnóstico foi removido.

### D37: Tarefas remotas sem tab aberto não podem usar as operações de lista com escopo de workspace

- Expectativa original: depois de a árvore de projetos exibir as tarefas, seria possível reutilizar o scoped service do TaskList original.
- Realidade: uma tab não aberta não tem remoteSessionId; o Controller antigo exigia antes consultar sua própria lista para ter a linha de source, e a mutation direta lançava "não há source correspondente ao endereço da tarefa".
- Tratamento: reutilizar o mutateTask do Window Controller; consultar primeiro a linha de Source owner único para validar o endereço e então chamar o task service original, com a intenção de rename repassada ao CLI. O scope de lista de Source físico pode não deter o logical attachment, mas precisa ter Source ID e workspaceIdentity; não se forja remoteSessionId nem se troca de tab. Remover a interface getGroupedTaskFacts, usada apenas pelo Group antigo. Só a tarefa realmente aberta chama a cadeia existente de conexão/vínculo; o celular usa o switcher shared-host.
- Verificação: os novos testes de tarefa não aberta, de não consulta prévia de lista e de recusa de Source diferente falharam primeiro e, após a correção, Controller/projeção passaram com 22 casos; os comandos de tarefa da UI validam o endereço completo, o CAS de não lido e não chamam o rename local. Ainda falta a GUI remota real e a regressão no celular.

### D38: Depois que a nova barra lateral substituiu a antiga, a agregação de listas e os componentes antigos continuam inteiros no repositório

- Realidade: o knip encontrou as partições antigas sem uso; o dep:refs retornou 0 referências estáticas de produção para Timeline, Pinned e useWorkspaceTaskLists, e o Sortable só tem o próprio displayName. A busca direcionada também encontrou os módulos WorkspaceSidebarItem e de arrastar que só se referenciam entre si, além de testes que só afirmam sobre esses componentes antigos.
- Tratamento: remover Timeline/Pinned/Archived antigos, Sortable/WorkspaceSidebarItem, o hook de agregação de tarefas do workspace, os helpers antigos de ordenação/dobra de workspace/group e seus testes exclusivos. Preservar workbench, busca, linha de tarefa pública e Controller, sem remover capacidades de consulta global que ainda têm consumidor em produção. Novos testes cobrem a limitação de canal do Controller, a seleção de Host, a atribuição NULL explícita, o CAS de não lido, o attachment remoto e a estabilização de referências.
- Verificação: antes da limpeza a execução completa foi de 1708 arquivos aprovados / 11 arquivos com falha, e as 21 falhas correspondiam a asserções de UI antiga; esse número não representa a aprovação após a limpeza. Os novos testes de estabilização de referências de projeto e de estabilidade do callback de navegação falharam primeiro; reutiliza-se o taskListItemStabilization existente e mantém-se a identidade das funções de evento, evitando redesenhar todas as linhas de tarefa ao refrescar a árvore. A 3ª rodada completa passou: 1709 arquivos / 14873 testes, com 2 arquivos / 14 testes pulados. Funcionalidades adicionadas depois são verificadas à parte.

### D39: Falta uma verificação unificada de propriedade entre o commit assíncrono do membro e a publicação no socket

- Realidade: ao reutilizar uma conexão existente, após esperar o commit do membro retornava-se diretamente o objeto capturado; um disconnect explícito era sobrescrito como online. Com socket novo, uma falha na escrita do diretório não liberava o recurso, e fechar durante a escrita do diretório ainda podia publicar. Outro novo teste comprovou que, após remover um Profile, um erro de admission tardio recriava a linha failed.
- Tratamento: após cada espera de admission, verificar cancelamento e o owner físico; todas as conexões não publicadas são liberadas em finally, e só a publicação bem-sucedida transfere a posse ao map. O callback de close só afeta o objeto online realmente possuído, e um fechamento não publicado é recusado diretamente; erros posteriores à remoção não recriam estado.
- Verificação: os três primeiros testes de regressão falharam primeiro e, após a correção, o gerenciador de conexões passou o arquivo inteiro com 40 casos; o quarto caso, de erro tardio após remoção, também falhou primeiro e, após a correção, o gerenciador passou com 41 casos, e junto com o adaptador de membros e de arranque somam 3 arquivos com 49 casos aprovados. O teste remoto real ainda não foi concluído.

### D40: O antigo draftSessionId não tem mais escrita em produção, mas ainda mantém serviço remoto e ramo de fechamento

- Realidade: a busca em todo o repositório encontrou apenas a declaração/implementação no store e escritas de teste; o ID de pré-aquecimento da V4 existe apenas no pane. O App, porém, trata a atribuição do painel lateral por esse campo sempre NULL, e a falha de skill/plugin/hooks ainda injeta session service e mantém o ramo antigo de close direto.
- Tratamento: remover o campo, o setter, a lógica antiga de fechamento e o scoped session service de que a interface de configuração não precisa mais. Preservar a versão de falha isolada por workspaceIdentity, com o lifecycle de pré-aquecimento exclusivo do pane V4; o painel lateral segue a semântica já existente de activeTaskId formal e de rascunho com atribuição vazia.
- Verificação: os testes de comportamento válido reescritos antes da remoção passaram; após a remoção, store, skills, plugin de navegador, hooks, refresh de plugin remoto e dicas de sugestão somam 7 arquivos com 104 casos aprovados. Criar projeto/alterar skill não duplica IDs de estado de execução. A barreira real de arranque e o E2E de criação global passaram; a regressão completa de GUI da edição de skill ainda precisa ser complementada.

### D42: A restauração antiga de arranque tratava todos os diretórios de conversation como o mesmo canonical cwd

- Realidade: com o novo modelo, criações globais consecutivas alocam cw independentes, mas o restaurador antigo substituía o caminho de conversation salvo pelo default e restaurava ainda mais essa tab default. Um novo teste confirmou que o diretório ativo era substituído incorretamente.
- Tratamento: a nova versão restaura apenas por lastActiveWorkspace, preservando o cwd já atribuído; a limpeza do canonical antigo serve só para settings antigos ainda não migrados. O main também lê o novo campo, removendo a lógica de escolher três alvos de pré-aquecimento do Agent a partir de recentProjects.
- Verificação: as novas regressões do main e do Renderer falharam primeiro e passaram após a correção; o run real `desktop-e2e-20260910213246795-p10401-c6c90180f685d4a0` validou duas criações globais consecutivas, o salvamento do cwd ativo e, após o recarregamento, o mesmo cwd/atribuição NULL.

### D41: O lock de arquivo do settings só protege a escrita final, e múltiplos Hosts ainda podem se sobrescrever

- Expectativa original: a updateQueue de instância única e o lock de arquivo do atomicWriteText bastavam para serializar o salvamento de settings.
- Realidade: a leitura e a mesclagem da configuração acontecem fora do lock de arquivo; cada Host monta o JSON inteiro a partir de valores antigos e, mesmo com o rename serializado, quem escreve depois apaga o patch anterior. A derivação de entradas do F5 também precisa estar dentro dessa fronteira de leitura-modificação-escrita para evitar a escrita de entradas antigas.
- Tratamento: o teste com dois SettingService independentes reproduziu primeiro o locale sobrescrito; o lock de arquivo foi estendido para todo o ciclo de leitura-modificação-escrita, removendo-se a fila de rename duplicada. O conjunto de projetos é derivado do mesmo snapshot do SQLite, e o Renderer escreve apenas o diretório ativo.
- Verificação: o serviço de settings passou com 36 casos e os dez arquivos relacionados com 176 casos; o run real `desktop-e2e-20260910213246795-p10401-c6c90180f685d4a0` passou com cinco casos, validando que as entradas antigas de settings desaparecem após a remoção da entrada. O cache de entradas remoto e o estado organizacional não têm sincronização reversa.

### D43: O histórico de diretórios do Server antigo é insuficiente para restaurar as entradas já mantidas pelo Controller

- Realidade: os registros de abertura de workspace do remoto antigo podem estar salvos no Source directory do Controller; o setting.json remoto não tem o diretório correspondente. Consultar apenas os settings remotos impede que o projeto de root único ainda mantido localmente seja resolvido, e o novo teste de Host reproduziu o resultado vazio.
- Tratamento: o adaptador do Server antigo recebe, por porta somente de leitura, os roots/old cwd das entradas ainda mantidas localmente, como informação de endereçamento para a antiga API de tasks; após a remoção da entrada, ela não é reconstruída a partir do history antigo. Após a atualização, a resolução do ID real de projeto usa o CAS de ID/versão da entrada, e múltiplos projetos de mesmo root permanecem não resolvidos. A edição/arrastar de projeto é desabilitada na UI, mas os comandos de tarefa continuam indo ao owner remoto.
- Verificação: 21 casos de root único/Host/CAS de entrada/UI passaram, com checagem de tipos e portão de arquitetura aprovados. A regressão em que um pin durante a consulta do partition antigo produzia linhas duplicadas falhou primeiro e foi corrigida com deduplicação em consulta única. O binário real do Server antigo e a GUI remota ainda não foram verificados, portanto G1 não pode ser registrado como totalmente concluído.

### D44: O URL Server contorna o SourceManager, e a identidade de endereço é misturada com a identidade estável

- Realidade: a conexão por URL é mantida pelo WindowRemoteConnectionRegistry e não entra no SourceManager; a nova conexão/consulta de projetos consulta apenas o SourceManager e não consegue conectar um Host URL salvo. URLs com serverId desconhecido também usam o prefixo remote:server, e julgar a identidade estável apenas pelo prefixo rejeitaria o vínculo do primeiro handshake.
- Em andamento: reutilizar o Registry acrescentando pontos de entrada de conexão/leitura que não criam workspace, mantendo o CAS de membro e o CredentialService; o primeiro handshake fixa o serverId, que depois é elevado a restrição de identidade estável. Não se pode criar outro map de conexões nem uma falsa logical session.
- Verificação: Registry/credenciais/CAS de entrada/HTTP+WebSocket reais/portão de arranque somam 73 casos aprovados, com checagem de tipos aprovada. Há asserções tanto para a inclusão/liberação de conexão sem tab quanto para respostas tardias de membro; a GUI de metadados de URL desktop já passou (D46/D49). O portão de arquitetura da primeira rodada apontou testes de contrato e arquivo de serviço longo demais; a divisão por responsabilidade (testes de URL e validação de parâmetros) foi feita sem modificar o baseline.

### D45: O portão de schema deixa passar UNIQUE automático, CHECK e letras maiúsculas/minúsculas de literais

- Realidade: em sqlite_schema o sql=NULL dos índices automáticos era ignorado pelo portão, e PRAGMA table_info não retorna CHECK. Lowercasing todo o SQL do índice também engolia mudanças de caixa em valores de string do WHERE. Os três novos testes falharam primeiro.
- Tratamento: comparar a ordem das colunas/collation/direção do CHECK da tabela antiga e do UNIQUE automático; a comparação de tokens do SQL preserva strings. Restrições novas na tabela antiga também são recusadas, evitando escritas restritas no downgrade.
- Verificação: 8 testes de restrição passaram, e `pnpm db:schema:check` passou tanto para os artefatos de migração reais de app/CLI quanto para a baseline; o checksum histórico não foi modificado.

### D46: As asserções da GUI tratavam por engano o ID de instância do tab como identidade de diretório após recarregar

- Realidade: o run de GUI de URL `desktop-e2e-20260910221055895-p38398-c86a3a77954c832f` já havia concluído a conexão, a adição explícita, a renomeação no SQLite remoto e a remoção local, mas após o recarregamento o ID do tab é atualizado e a asserção antiga reportou falha falsa; os outros cinco casos passaram.
- Tratamento: as asserções passam a usar a identidade de diretório estável workspaceIdentity/workspacePath, mantendo as asserções de conexão real, escrita remota e não cópia do estado organizacional. Este item é uma correção de premissa de teste e não altera o lifecycle de tab de produção.
- Verificação: a reexecução `desktop-e2e-20260910221338304-p39472-6fe360a12a99df8d` passou com seis casos; a conexão URL real, a renomeação no SQLite remoto, a ausência de cópia autoritativa de projeto local e a não ressurreição após a remoção têm todas asserções.

### D47: A assinatura em tempo real da nova árvore de projetos ainda cobre apenas o scope local

- Realidade: useProjectTree cria o scope sessions-index apenas para hostId=local; projetos remotos conseguem exibir linhas persistidas, mas não têm estado de executando/aguardando; conectar diretamente ao owner remoto também é excluído por essa condição.
- Tratamento: reutilizar o snapshot existente do WindowControllerTaskListRegistry compartilhado, lendo apenas a atividade online; tarefas com cwd/roots preservados são registradas pelo caminho de observação listTaskList original, e as linhas devolvidas não entram na árvore de projetos. O owner direto sem Controller continua usando o próprio sessions-index.
- Verificação: 9 casos de observador puro/compartilhado e 1 caso do hook passaram, incluindo não serializar paths iguais com identidades diferentes, não adicionar linha para task desconhecida, título/ordenação/atribuição inalteradas, acesso de scope sem tab e ausência de refresh em loop. A regressão completa de interação está pendente.
- Verificação incremental: 48 casos em nove arquivos relacionados e root typecheck com 42 aprovados; o run de GUI `desktop-e2e-20260910222201616-p41037-1e080f212e2ed73b` passou com seis casos. Essa GUI não gerou uma task remota realmente em execução, portanto não é registrada como conclusão da interação remota de running/permission.

### D48: O ponto de entrada de desenvolvimento HTTP comum ainda não está alinhado à identidade de owner de projetos do ServerCore

- Realidade: o ServerCore já define projectStorageHostId como o Source estável, mas o packages/server/src/entry-http.ts comum ainda inicializa como local, e http.ts também não declara a capacidade virtualProjects. A validação GUI real da URL usa o ServerCore, então não se pode afirmar que o ponto de entrada HTTP comum esteja concluído.
- Tratado: unificar a montagem de createServerHostServices, o owner de armazenamento, a capacidade de handshake e o mapeamento de identidade de workspace; 6 arquivos com 83 casos aprovados. A execução real de Agent via URL ainda precisa ser verificada.

### D49: O evento de mudança de projeto remoto não está ligado à cadeia de leitura de entradas local

- Realidade: ao modificar localmente um projeto remoto há um refresh ativo, mas quando outro cliente modifica não há notificação local; a coleção de workspace usa broadcast local e não pode receber o state:projects remoto por essa via.
- Tratamento: SourceManager e o Registry de URL mantêm, separadamente para cada conexão física, a assinatura de difusão de projetos remotos, encaminhando apenas a notificação de releitura; eventos tardios são descartados por connection owner, e a assinatura é liberada na desconexão/atualização, sem salvar estado extra de projeto.
- Verificação: os novos testes de notificação/liberação falharam primeiro e, após a correção, o SourceManager passou com 42 casos; o run de GUI de URL `desktop-e2e-20260910222620788-p42289-56623f89164f78e0` passou com seis casos, incluindo a atualização automática local após renomeação externa pelo owner remoto. O root typecheck passou com 43. O teste do hook importava o Emitter do RPC diretamente e foi recusado pelo portão de arquitetura; passou-se a usar um porto de eventos local do teste, sem adicionar dependência UI → RPC.

## Ainda não resolvido ou ainda não verificado

### U01: Limite entre dados remotos antigos na máquina local e o "banco remoto autoritativo"

- Descoberta: o task index histórico da máquina local pode conter linhas de sombra remotas/Grupos manuais; a primeira implementação gerou com isso projetos de host remoto na máquina local (já corrigido, ver D19). O projeto exige que o estado organizacional remoto exista apenas no banco remoto, e a máquina local guarda somente a entrada e o cache básico.
- Estado: a migração cria apenas os projetos autoritativos do owner atual; as sombras remotas antigas e os membros de Grupo permanecem nas tabelas originais como evidência. A remoção/recriação de entrada, o refresh por CAS, os membros de conexão e a derivação das configurações do F5 já foram conectados; os metadados de URL e a GUI local de shared-host do celular passaram. O binário real do Server antigo, SSH/WSL e a execução real remota pelo celular ainda carecem de evidência de aceite; não se pode declarar a migração remota completa.
- Aceite: após conectar, ler o projeto remoto autoritativo; remover a entrada local não apaga os dados remotos; refresh tardio e reinício não podem recriar a entrada.

### U02: Ponto de aplicação da barreira de migração entre a main do desktop e a inicialização da CLI

- Descoberta: o banco do app já é atualizado no main antes de criar serviço/janela; o banco da CLI é atualizado na inicialização da CLI. O texto de projeto exige "os dois bancos antes da criação da janela no main". A ordem dos dois não é exatamente a mesma.
- Tratamento: o main reaproveita o resolver de executável existente para executar um storage-migrate pontual, e a CLI usa o mesmo Store/runner para atualizar e fechar o banco; só libera a passagem após JSON estrito e saída com código zero. Em caso de falha, reaproveita a interação de retry/backup/saída. Cinco casos do adaptador de subprocesso e três casos de comando da CLI (incluindo processo real com caminho customizado/idempotência/falha de checksum) passaram; o run real `desktop-e2e-20260910210656230-p6013-8e20a30e8015402d` com cinco casos passou, e a primeira janela já conseguia ler o ledger dos dois bancos, com a conclusão da barreira no log do main anterior à criação da janela. O caminho da CLI continua sendo resolvido pelo storage.sessionDbPath / ZCODE_SESSION_DB_PATH já existente; ZCODE_DATA_BASE_DIR não é substituto do caminho histórico de banco da CLI, e arquivos antigos não são migrados.

### U03: Progresso de implementação e aceite das entradas de produto

- Descoberta: o caminho de projeto da barra lateral já começou a usar o novo serviço, mas a criação global/de sessão, a antiga create API, automação/ociosidade/Bots, configurações e composer, o agregado remoto e do celular ainda têm partes não conectadas.
- Estado atual: criação global/native/V4, vínculo de projeto local de temporização/ociosidade, vínculo de projeto de Bot e roteamento de Host, diretório de roots nas configurações, referência de projeto do Composer e candidatos de arquivo de múltiplos roots, e navegação de projetos no desktop e no celular já foram conectados. O Grupo antigo, o ID de session em rascunho, o Bot main bridge e as duas caches de listas remotas sem leitor foram removidos. Temporização/ociosidade só pode criar no local e o celular não tem página de configurações: são limitações de produto já existentes (D72/D76), que não podem ser confundidas com "não é possível criar projeto remoto". A 49ª rodada com criação real de Agent remoto por URL/anexo de root/reabertura de tarefa e dual ownership dos dois bancos passou, a 42ª rodada de recuperação completa de processo local multi-diretório passou, e a verificação de upgrade isolado do código antigo/escrita antiga/re-upgrade passou; a 52ª/53ª rodada de recuperação a frio do Agent remoto por URL passou; os testes unitários finais, typecheck, lint, arquitetura e o gate de formato das mudanças passaram. A regressão mais recente no celular está limitada pelo ambiente de D91.

### U04: Limite de evidência entre GUI e verificação remota real

- Descoberta: já foram adicionados casos manual-review/pending, mas ainda não houve uma execução completa das interações de projeto do desktop/celular, de SSH/WSL real, nem das combinações de upgrade e downgrade.
- Estado atual: a 27ª rodada da combinação de projetos do desktop passou com 11 casos (8 GUI, 3 Bot synthetic), incluindo metadados de URL, root de configurações não aberto e autorização de Bot; a 33ª rodada do Composer com dois roots passou com 1 caso; a 34ª rodada, com relay real, passou com 1 caso de reload, submissão, troca e reabertura de rascunho de celular a 390px. Todos ainda são manual-review/pending. A 49ª rodada posterior completou a execução real de Agent remoto por URL, a 42ª rodada completou a recuperação completa de processo local multi-diretório, e a verificação isolada do código antigo em quatro etapas completou o re-upgrade após escrita da versão antiga. Bot remoto real, binário do Server antigo, SSH/WSL e execução remota pelo celular continuam sem verificação; os testes unitários não substituem esses aceites.

### U05: A evidência de ambiente tem limites

- Frescor da baseline: o primeiro fetch remoto retornou HTTP 504 e, naquele momento, só foi confirmado o `--no-fetch` local; a execução final da checagem normal passou (`/tmp/zcode-project-freshness-final.log`), o branch atual não tem upstream, está 6 commits atrás de origin/main, abaixo do limiar de 50.
- Superfície de impacto: o CodeGraph não tem índice do workspace, então foram usados busca dirigida e dep:refs; a varredura de superfície de impacto do CodeGraph não foi executada.
- Testes da CLI: parte do bootstrap referencia o artefato de build do adapter; depois de alterar o código-fonte é preciso reconstruir o pacote correspondente primeiro, e o resultado do dist antigo não pode ser tomado como evidência da nova implementação.
- Workspace: o diretório não rastreado pré-existente `packages/remote-desktop/` não pertence a esta tarefa e não foi incluído nesta refatoração.

## Formato dos registros seguintes

Novos itens continuam usando Dxx (problema confirmado) ou Uxx (não resolvido/não verificado), registrando a expectativa original, a situação real, a causa, o tratamento, a verificação e a mudança de status. Novas decisões de design atualizam primeiro a spec e depois são referenciadas aqui; não se escreve "ainda não implementado" como se fosse uma mudança de design já aceita.

### D50: o serviço de settings lê HOME dinamicamente em operações assíncronas, e a limpeza dos testes dispara escrita fora do escopo

- Fenômeno: após a saída do teste de integração do Server Host e a restauração do HOME, a projeção de settings em background continuou escrevendo e o log passou a mostrar o setting.json do usuário real; a limpeza do diretório temporário também reportou ENOTEMPTY.
- Causa: o SettingService recalcula o caminho a partir do ambiente do processo atual a cada IO; o fim do ciclo de vida não significa que todas as chamadas externas já ficaram silenciosas. O isolamento de variáveis de ambiente em nível de teste não é suficiente para conter tarefas assíncronas de background.
- Impacto e correção: foi confirmado que o recentProjects/lastWorkspaceSession real foi substituído pelo diretório de teste. Os arquivos afetados foram salvos em um backup temporário local, e esses dois campos foram restaurados com base no log mais recente de settings do app (2026-09-10 19:17:11); o lastActiveWorkspace atual e as demais configurações foram mantidos, e o índice de atividade foi recalculado. Esse log não é um snapshot completo de antes do teste, então não se pode afirmar que todas as listas históricas são idênticas palavra por palavra ao estado anterior ao teste. A partir daí, adota-se caminho de settings fixo por instância e isolamento por subprocesso, sem usar atrasos para adivinhar a conclusão do background.
- Verificação: regressão de dois HOME temporários entre instâncias e a suíte completa do SettingService com 37 casos passaram; a verificação em subprocesso do Server passou. A restauração não envolve session/banco de corpo de texto.

### D51: o diretório de trabalho de um Server URL novo não tem uma canonical identity inicial aceitável

- Evidência: após um subprocesso de Host independente concluir com sucesso a migration/create do projeto, resolveWorkspace lançou legacyRouteHint required para um diretório sem histórico; o repositório só aceita hints de SSH/WSL/Docker, e o hint de server do URL também é rejeitado.
- Tratamento: a montagem do Server fornece sua própria identity estável quando o hint está ausente; novos aliases aceitam server route legítimo, e a prioridade de aliases/histórico já existentes não muda. O GUI de metadados de projeto URL já ter passado não significa que a primeira criação pelo Agente remoto já passou.
- Verificação: o novo caso de URL route sem histórico rodou primeiro em vermelho e depois foi regressado junto com o subprocesso de Host independente.

Retorno de verificação de D48/D51: a montagem unificada do Host, a declaração de capacidade HTTP comum, o primeiro canonical de URL e o comportamento do alias original somaram 6 arquivos e 83 casos passando. A execução real do Agente por URL ainda aguarda E2E, e não se declara aprovação com base no teste de metadados.

### D52: o escopo de configuração ainda é determinado pela tab aberta, e a configuração remota sem tab não tem admissão de identidade

- Evidência: Plugins/Hooks/Subagents enumeram candidatos a partir das connected tabs cada um por conta própria, e Plugins ainda cria uma active workspace tab; quando o projeto ganha um root novo mas nenhuma tab é aberta, ele não aparece. O Command scope ainda tem uma função antiga de deduplicação de tabs chamada apenas por testes.
- Tratamento: novo workspace-config-catalog gerenciado, usando readProjects e a entrada local retida, deduplicando por diretório real/identity completa; fechar a tab não remove o root; remoção do getCommandWorkspaceTabs, que já não tinha chamada em produção. O alvo da configuração é um tipo de endereço, não se cria tab/session. A configuração remota reaproveita o Source settings attachment e, antes de escrever, vincula a canonical key pelo contrato de workspace alias já existente.
- Corrida: validar membership/entrada antes e depois da leitura do diretório; o retorno do vínculo só vale para o diretório e o attachment originais. Quando o celular não tem permissão de Source settings, o limite original do shared-host workspace é mantido.
- Verificação: 3 casos de Catalog, 2 casos de binding React real (primeiro vermelho, depois verde) e regressão dirigida de Source attachment e do formulário de settings original; o GUI do VP11 foi registrado como pending e está em execução. Não se declara implementado o acesso do celular a um root não aberto.

### D53: definições de agendamento criadas durante um downgrade escapam da primeira migration

- Evidência: a migration v3 só completa automations/off_peak_tasks na primeira execução; a cada inicialização, reconcileLegacy só processa tasks. Depois que uma versão antiga cria novas definições, todas as colunas novas ficam NULL; ao reverter o upgrade, v3 não roda de novo, e a definição fica sem owner/primeiro projeto de pertencimento.
- Tratamento: a cada inicialização, a mesma transação transfere as definições de agendamento com host_id IS NULL; a correspondência com root único decide apenas uma vez, e diretórios adicionais mantêm [] da versão antiga; projetos já tratados com NULL, snapshots salvos e cwd/canonical key são preservados.
- Verificação: novo caso de escrita em coluna antiga → novo upgrade → mudança de roots do projeto → nova inicialização, mais 3 casos com owner remoto de repositório, rodaram primeiro em vermelho e só depois foram implementados.

### D54: no início da animação do menu, getElementText devolve texto vazio e a asserção do GUI lê cedo demais

- Evidência: a deduplicação de diretório de Commands/seleção de root não aberto do VP11 já passou; o menu de Hooks encontrou 4 radio items, mas dentro do mesmo milissegundo getElementText devolveu string vazia para todos, e a asserção obtive 0 correspondências. O run `desktop-e2e-20260910230329344-p70290-54b2a0a4f04adf9d` teve 6 pass / 1 fail.
- Tratamento: a asserção espera o texto do root alvo ficar visível e então verifica que há exatamente um item; sem adicionar sleep fixo e sem modificar o estado de produção ou a animação do menu. Em execução na verificação de reexecução.

Retorno de GUI de D52/D54: o run `desktop-e2e-20260910230731227-p71459-4419b0f2ce0a071f` passou nos sete casos; depois de esperar o texto visível em Hooks, foi confirmado que cada um dos dois roots tem exatamente um item, e que diretórios de tabs não abertas são selecionáveis. D53: project-storage e Server Host somaram 21 casos passando, a validação de schema nos dois bancos e o typecheck 51 passaram.

### D55: os candidatos do Bot dependem do histórico de tabs antigas, e ler o context reescreve o cwd

- Evidência: listWorkspaceRefs é construído a partir de lastWorkspaceSession e cacheado por 5 segundos; readContext atualiza workspacePath/workspaceIdentity conforme o candidato mais recente. Somente adicionar projectId à API de criação não basta para satisfazer H1.
- Direção de tratamento: os candidatos reutilizam o contrato de diretório de projeto, e o Repo do Bot guarda apenas o snapshot de execução; o context antigo é transferido uma única vez, preservando o cwd, e atribuições ambíguas permanecem NULL. Remoção do cache de candidatos antigo e da reescritapermanente de cwd; detalhes na spec 6.0.1.
- Status: regressão adicionada, implementação em andamento.

Retorno de verificação: na 5ª rodada, os testes unitários afetados tiveram 1717 arquivos passando e 1 arquivo falhando; 14904 casos passaram, 2 falharam e 14 foram pulados. As duas falhas eram testes de trust de Hooks que ainda faziam mock do hook antigo, causando falta de export; passaram a mockar a fronteira pública do diretório de configurações e os dois casos passaram. Não se pode registrar esta aprovação direção como aprovação de execução completa.

### D56: reescrever o state inteiro do Bot perde vínculos concorrentes

- Correção de evidência: a primeira rodada de regressão usou o mesmo usuário autorizado, o segundo Bot foi rejeitado pela autenticação, e esse resultado não prova perda de atualização. Passou-se a usar usuários legítimos diferentes e a afirmar que os dois /status foram bem-sucedidos; a execução de controle que restaura o writer antigo, `/tmp/zcode-bot-state-race-confirmed-red.log`, deixou apenas o webhook-2, confirmando que a reescrita do snapshot inteiro perde o webhook-1. Depois do controle, a nova implementação foi restaurada. O stub de teste antigo em memória compartilha referências de objeto e mascara essa corrida.
- Tratamento: um lock de arquivo único no Repo cobre a leitura-modificação-escrita de um mesmo context; a inicialização CAS, a atualização por comando e o cursor do provider compartilham essa entrada, e o comando não sobrescreve o campo de cursor independente. A remoção também deixa de reescrever o state antigo inteiro.
- Status: a regressão falhou primeiro, e a verificação da correção está em andamento.

Limite de verificação de D56: uma rodada de testes em conjunto apresentou OOM de heap no worker, o que não pode ser registrado como aprovação; o mesmo arquivo messageFlow, rodando isolado, passou 85 casos. É preciso rodar a verificação combinada novamente; não se pode atribuir uma falha de recursos diretamente a um defeito do produto.

Retorno de verificação de D55/D56: os testes combinados de candidatos de projeto, vínculo, atribuição de tarefa e escrita concorrente real em dois Repos somaram 15 arquivos e 149 casos passando; typecheck 55 e architecture 49 (baseline 0, novos 0) passaram. O OOM do worker combinado não reapareceu. O bridge do Bot remoto e o GUI do VP12 continuam incompletos.

### D57: a regressão de GUI do Bot codificou o acesso remoto em texto fixo em chinês

- Evidência: o run `desktop-e2e-20260910233907955-p99005-70d98236032233d7` criou o projeto do VP12 com sucesso, mas não encontrou o aria-label em chinês; os outros sete casos passaram. O ambiente de teste tem localePreference=system, então não se pode assumir que a interface esteja em chinês.
- Tratamento: a entrada e as opções de modo de projeto passam a ser reconhecidas pelo texto existente em português e em inglês; sem alterar o estado de idioma do produto e sem adicionar espera fixa.
- Verificação: o run `desktop-e2e-20260910234135216-p700-9ed05502a4283931` passou nos oito casos; o JSON real do Bot contém dois IDs de projeto diferentes, sem mesclagem por mesmo cwd e sem criação de tab. Permanece pending, e não cobre execução de rede real do Bot nem do celular.

### D58: o bridge principal do Bot ainda usa workspace lógico e histórico antigo como origem de conexão

- Evidência: o bridge antigo restaura o RemoteTarget a partir de lastWorkspaceSession, mantém caches de conexão/runtime, três tabelas de requisição e timeouts; o main cria uma sessão lógica e dá ao Bot um MessagePort separado, e o Renderer preenche tab/histórico de volta. Isso conflita com o owner único de conexão do Host de projeto.
- Tratamento: passar a injetar no Host da janela a conexão Source existente, com connectHost explícito e admissão de membership/geração física; remover o bridge antigo, o adapter de porta de runtime, o IPC dedicado e o preenchimento de volta na UI, sem mexer no owner/lease original de tarefa, no CommandInbox nem no attachment shared-host do celular.
- Verificação: com a remoção dolink antigo, os 5 arquivos e 104 casos relacionados passaram, e o typecheck 57 passou; a checagem de arquitetura do novo roteamento deu baseline 0 e novos 0. A execução real do Bot remoto aguarda verificação posterior.

### D59: o canonical legacy do Bot não é mapeado para o Host estável, e o vínculo compara apenas o ID de projeto

- Evidência: as três novas regressões falharam: o canonical SSH foi tratado por engano como host de repositório, e o projeto foi transferido para NULL; depois de remover e readicionar a entrada, o resultado antigo de prepare ainda é escrito no context; uma legacy identity já consolidada, ao sair da entrada, não consegue ser roteada por host. Ver /tmp/zcode-bot-legacy-admission-red.log.
- Tratamento: a primeira transferência usa a entrada para resolver o hostId estável, preservando o canonical/cwd original; as-transferências seguintes passam o hostId já consolidado e não dependem mais de inferir pela entrada. Identity de server estável em conflito com hostId é rejeitada. membershipId e o ID da entrada são validados antes e depois do vínculo.
- Status: primeiro vermelho, depois correção, em verificação.

Retorno de verificação de D59: 13 casos de vínculo e roteamento passaram. Em seguida, a suíte completa do Bot teve 146 dos 149 casos passando; as três falhas eram asserções antigas de parâmetro exato sem o novo hostId, e as asserções foram atualizadas mantendo o contrato, aguardando reexecução.

### D60: ao substituir a barra lateral de projeto, o workspaceIdentity atual não era repassado

- Evidência: a regressão de renderização real do Shell usou o mesmo cwd com duas remote identity, e as identity capturadas pela barra lateral foram todas undefined, enquanto o ID do attachment estava normal; a barra lateral antiga inferia a identity pela tab, e após a substituição esse caminho implícito desapareceu.
- Tratamento: Shell → ProjectSidebar → Footer repassam explicitamente a identity atual, e a entrada de controle remoto reaproveita o scope existente; não se infere mais pelo cwd.
- Status: regressão falhou primeiro, e a verificação da correção está em andamento; não se pode declarar, com base em testes unitários, que o controle remoto pelo celular foi verificado ponta a ponta.

Retorno de verificação de D58–D60: Bot/barra lateral/footer somaram 14 arquivos e 193 casos passando; typecheck 59 e architecture 53 (baseline 0, novos 0) passaram; o lint 21 ficou em 60 warnings / 0 errors. O run Electron `desktop-e2e-20260911000411622-p5101-6894ef9b748866aa` passou nos 11 casos (8 de GUI de projeto, 3 Bot synthetic); não inclui envio/recebimento de rede real do Bot remoto nem olink de novo diretório no celular.

### D61: o novo diretório de projeto no celular não está na lista do bridge antigo, e o rascunho se perde na troca de Root

- Evidência: o ramo de Root no celular apenas faz switchWorkspace(identity), e o bridge do main só corresponde a workspaces já existentes na janela; um cwd recém-atribuído sem scope lógico é rejeitado. A troca de Root no Web passa apenas taskId/navigationIntent e não passa o rascunho do projeto; o Root antigo continua gravando o rascunho após o await da troca. Este é um evidência de caminho de código, e ainda não se afirma reprodução real no celular.
- Limite de tratamento: a spec 6.0.3 define primeiro o prepare unificado do Host e a admissão de conexão online; o main apenas repassa o descriptor, e o celular continua replayable. Os três novos casos gerenciados de project-workspace-navigation e os de Registry/Bot somaram 55 casos passando, cobrindo Source online sem tab, connector proibido quando offline, rollback de scope preservando o owner do desktop e mudanças de entrada/geração física.
- Status: Host/main/Web/Root já estão conectados; o projeto/rascunho global e a contagem de tab/Host do desktop passaram no relay real local do VP13 (`desktop-e2e-20260911004852556-p11949-7e2838ab53de5f5b`), mas a execução remota real ainda falta. O primeiro adopt falhou por diretório não criado e passou depois de criar o diretório vazio; a primeira rodada do teste do app falhou por módulo ausente, e o novo caso de comportamento do Registry falhou antes de passar.

### D62: a requisição de navegação sai do pending cedo demais, depois que o Host devolve o diretório

- Evidência: na nova regressão do main, o diretório já havia sido devolvido, mas a primeira sincronização de configuração do Provider ainda não tinha terminado; depois de fechar a janela, a resposta de configuração bem-sucedida chegou e a navegação ainda retornou success. `/tmp/zcode-mobile-project-window-close-red.log` ficou em 38 pass / 1 fail. O caso anterior de saída do Host já passava e não pode servir como evidência de falha deste problema.
- Tratamento: a requisição permanece até o fim da admissão completa/sincronização inicial de configuração; fechar a janela, cancelar, a saída do Host e o shutdown encerram o pending. Resultados atrasados só podem ser entregues ao chamador que ainda detiver a mesma requisição e o mesmo scope, sem criar um segundo estado de tarefa.
- Status: primeiro vermelho, depois correção; 132 testes passaram nos módulos main/Registry/aplicativo/protocolo (`/tmp/zcode-mobile-project-admission-green.log`). Em seguida passaram 94 testes do bridge/protocolo do main e 14 do rascunho do Root; Host, main, Web e Root já estão conectados, e o E2E real no celular ainda awaits execução.

### D63: o bridge antigo do celular não tem intenção de projeto nem deduplicação de navegação

- Evidência: os novos testes de protocolo e do main apareceram primeiro com 5 fail / 89 pass (`/tmp/zcode-mobile-project-manager-red.log`); a troca de Root teve 2 fail / 5 pass (`/tmp/zcode-mobile-project-draft-red.log`), porque o protocolo antigo removia os campos de projeto e o Root preparava o rascunho no scope original.
- Tratamento: a intenção estrita de projeto leva apenas projectId/hostId; a mesma identidade de transporte do bridge reutiliza o promise de admissão inteiro, uma nova navegação invalida a requisição antiga, e o cancelamento afeta apenas o requestId correspondente. O novo Root inicializa projeto/provider/entrada antes de liberar o bootstrap; o peer antigo do celular sem admissão é explicitamente rejeitado, sem criar implicitamente outro conjunto de runtime.
- Verificação: main/protocolo 94 pass, Root e navegação 14 pass. O typecheck completo da primeira rodada encontrou dois erros de tipo, currentWorkspaceKey anulável e a dedução de parâmetro default de randomUUID estreita demais, corrigidos conforme o contrato, aguardando reexecução; o GUI do celular ainda não foi concluído.

### D64: a home real do celular ainda monta a página inicial de tarefas do workspace antigo

- Evidência: o ramo de tela estreita do WorkspaceShellLayout monta o WebRemoteControlMobileShell, que renderiza diretamente o WebRemoteControlMobileTaskHome; o teste unitário do celular da nova ProjectSidebar verificou apenas o componente isolado, não a entrada real de tela estreita. A página inicial antiga ainda possui agrupamento/ordenação/model e requisições de lista, e os resultados anteriores não podem ser tratados como cobertura de projeto no celular inteiro.
- Tratamento: primeiro complementar a spec 6.0.3, fazendo a tela estreita e o desktop compartilharem a mesma entrada de renderização da barra lateral; o shell do celular passa a ter apenas a navegação home/chat e as camadas sobrepostas, com remoção da página inicial antiga e da lógica derivada usada só por ela. A varredura de referências estáticas vem antes da remoção.
- Status: a regressão da montagem real do Shell em tela estreita falhou e depois passou; 44 testes de Shell/barra lateral compartilhada passaram (`/tmp/zcode-mobile-project-home-green.log`), e a página inicial antiga do celular, o model e os testes específicos do model antigo foram removidos. A 28ª rodada do GUI de rascunho do VP13 passou; a extensão de tarefas existentes ainda awaits aprovação, ver D67/D68.

### D65: dep:refs subnotifica o consumo deste alias

- Evidência: antes da remoção, `pnpm dep:refs packages/ui/src/WebRemoteControlMobileTaskHome.tsx:WebRemoteControlMobileTaskHome` retornou 0 references, mas o `rg` encontrou claramente o import `@/WebRemoteControlMobileTaskHome.js` do MobileShell e o consumo em JSX.
- Tratamento: não se tomou 0 como prova de que dá para remover; a varredura de imports/símbolos de todo o repositório completou os chamadores, e primeiro migrou-se o Shell e os testes de navegação, só então a remoção. O problema do próprio ferramenta dep:refs não é corrigido nesta refatoração, e remoções futuras continuam exigindo verificação cruzada.

### D66: a junção e os limites de invalidação do scope de diretório do celular foram esquecidos

- Evidência: depois que o caminho principal do celular passou no E2E, a verificação continuou nos ciclos de vida cruzados, e as 3 novas regressões falharam todas (`/tmp/zcode-mobile-project-join-red.log`, 3 fail / 97 pass): a segunda navegação contornou cedo a primeira sincronização do Provider, o desktop adotou o scope do celular sem registrar o sucesso da conexão, e o retry do bridge antigo ainda devolveu um descriptor já invalidado após a substituição do Source.
- Tratamento: a junção compartilha a mesma barreira de configuração e a validação de owner do pending; o desktop segue o commit original de renderer-ready; a deduplicação não pode sobrescrever uma invalidação de bridge já existente.
- Status: após a correção, 100 regressões do main passaram (`/tmp/zcode-mobile-project-join-green.log`). A evidência do ciclo de vida do Source vem deste conjunto de testes independentes e não pode ser substituída pela passagem do caminho principal do VP13.

Nota de verificação desta rodada: o typecheck completo da 67ª rodada passou; os testes unitários combinados deram 234 pass, e os 100 pass do main correspondem à nova regressão de D66; a architecture da 57ª rodada deu baseline 0 / new 0; o lint da 22ª rodada saiu com 0, ainda com warnings não limpos. O GUI de celular local do VP13 deu 1 pass, usando o Web :5173 do repositório atual, o external relay real e um HOME isolado, sem enviar mensagem de usuário e sem declarar cobertura de execução remota real ou de agendamento.

### D67: abrir tarefas existentes no celular ainda depende da lista antiga de workspace

- Evidência: a árvore de projeto compartilhada mostra tarefas de diretórios sem tab, mas o getAvailableWorkspaces do main só é composto pela lista de workspaces do Renderer e pelo bridge atual; a bridge-open de tarefa comum ainda exige que o alvo apareça ali. A admissão de criação de projeto novo foi completada, mas a abertura de tarefas históricas ainda não está integrada. Esta é uma evidência estática de caminho, ainda não declarada como reprodução real no celular.
- Tratamento: estender a mesma admissão de diretório do Host para ler e checar endereços de tarefas já existentes, restaurando o diretório vinculado ao longo de resolveSessionDirectories, proibindo que prepareSession aloque diretório; o main apenas repassa a intenção da tarefa e o descriptor do Host.
- Status: as novas regressões da camada de aplicativo e do protocolo falharam e depois passaram, e os 110 testes relacionados e o typecheck completo da 70ª rodada passaram. Na 31ª rodada, o GUI de extensão do VP13 passou (`desktop-e2e-20260911012737140-p19784-1fbf5aa543752f59`): relay real, celular de 390px, resposta fixa case-local criando uma tarefa real persistida, troca para o novo diretório global e reabertura do taskId/cwd/resposta originais, sem aumento de tab/Host no desktop. Não é verificação de processo frio do CLI nem de execução remota real.

### D68: a regressão de extensão do VP13 estoura o tempo na etapa de pareamento do relay

- Evidência: a 29ª rodada, o run `desktop-e2e-20260911010438954-p14956-f84ac66c1ea4d4d2` estourou o tempo de 120 segundos. O Desktop entrou em waiting_terminal, o console do Web mostrou `External relay terminal socket error` e não houve entrada na navegação de projeto. A rodada anterior, a 28ª, passou na navegação de rascunho com o mesmo relay real.
- Tratamento: acrescentar marcadores de etapa e diagnóstico desidentificado de origin/open/close do WebSocket antes de reexecutar; não se pode, com base nisso, julgar D67 como correto ou incorreto, nem atribuir o problema de rede diretamente à implementação do produto.
- Status: a 30ª rodada confirmou que o estouro ocorre na admissão do mobile relay, e que a limpeza do receptor loopback mascarava a exceção original. Um Chromium independente conseguiu o handshake nos dois origins do relay, o que impede atribuir o problema à indisponibilidade da rede externa. Depois da correção da limpeza e da inclusão do CDP, a 31ª rodada passou diretamente, com o origin do handshake sendo `wss://zcode.z.ai`. A causa raiz das duas primeiras rodadas de falha de pareamento não foi determinada, e não se afirma, com base em uma passagem, que o problema intermitente de rede/serviço de desenvolvimento foi eliminado.

### D69: o Composer ainda usa o caminho antigo de candidatos de workspace/sessions-index

- Evidência: o sessionsMentionProvider enumera workspaces pela tab e pelo store de remoteSession, e deixa o sessions-index decidir as linhas candidatas; o fileMentionProvider só lê workspacePath e usa relativePath como chave. Tarefas de projetos com diretório não aberto não podem ser mencionadas, arquivos de outros roots ficam ausentes, e a simples concatenação de múltiplos roots sobrescreve arquivos de mesmo nome.
- Tratamento: primeiro complementar a spec 6.0.4; reutilizar o contrato público do ProjectService do Host atual, removendo a enumeração antiga por tab e o caminho de conjunto de linhas do sessions-index. Os arquivos continuam sendo lidos pelo fileService do mesmo Host, com a deduplicação por caminho absoluto separada do nome de root exibido.
- Status: as 8 novas regressões de provider deram na primeira rodada 7 fail / 1 pass; a regressão isolada de título falhou primeiro. Após a integração, 6 arquivos e 84 testes passaram, incluindo a seleção do attachment remoto pelo resolver de workspace real e zero requisições locais. O typecheck 73 e a architecture 59 (baseline 0 / new 0) passaram. Na 33ª rodada, o GUI do VP14 passou (`desktop-e2e-20260911013146831-p21568-5a8a51dea879dad3`), com asserções sobre exibição de root, links relativos/absolutos, chip ID e título de projeto/tarefa entre diretórios; permanece pending, e a cobertura local não substitui menções reais no celular e em host remoto.

### D70: o VP14 usa clear nativo sem confirmar que o Lexical foi limpo

- Evidência: na 32ª rodada já foram exibidos dois candidatos de root e o link relativo de A foi selecionado com sucesso; em seguida, com WebDriver elementClear/sendKeys e um clique em B, o chip de A continuava sendo lido. O teste não confirmou que o estado do editor foi substituído, então a asserção não pode ser atribuída diretamente ao mapeamento de root. O setInputValueByTestIdDom já existente no repositório trata explicitamente a inconsistência entre o clear do DOM nativo e o estado do Lexical.
- Tratamento: reutilizar o bridge E2E de Lexical já existente para gravar e confirmar o estado do corpo, mantendo as asserções de link absoluto e de identidade de chip de B, sem modificar a lógica de mapeamento do produto.
- Status: só depois de corrigir o driver do teste a 33ª rodada passou, e as asserções de link e identidade de A/B foram preservadas. Não se modificou o mapeamento de arquivos do produto com base nisso.

### D71: a reconstrução do Root no celular não restaura a atribuição de projeto do rascunho não submetido

- Evidência: o primeiro render de openProjectDraft carrega initialTaskDraft, mas depois de recoverVisibleSession/bootstrapPairedSession o render não o carrega; o useRootPlatformEffects chama startDraft sem parâmetro de projeto, o que limpa draftProjectId. O store em memória de um reload completo da página também não tem esse campo, e a persistência atual do composer só salva corpo e modelo.
- Tratamento: primeiro complementar a spec 6.0.3; salvar a atribuição opcional de projeto no scope de rascunho da workspaceKey já existente, restaurando-a no celular antes do prewarm. Reaproveitar a promoção/limpeza original, sem adicionar estado de negócio em main/relay.
- Status: as regressões de persistência da atribuição e de reconstrução do Root falharam primeiro; a regressão que impede a promoção de copiar o estado de organização para o rascunho da Session também falhou primeiro. Após a correção, 8 arquivos e 85 testes, o typecheck 75 e a architecture 60 passaram. Na 34ª rodada, o VP13 passou com reload real da página + submissão + reabertura (`desktop-e2e-20260911013709698-p23351-af24792bba497b51`, 14,3 segundos), com asserções sobre corpo, projectId, cwd e taskId final.

### D72:.listar a criação remota de tarefas agendadas/ociosas como item obrigatório sem conferir as limitações existentes do produto

- Evidência: `docs/off-peak-task/spec.md` (itens multi-dispositivo) e `docs/ui/scheduled-tasks-main-view.md` determinam explicitamente que a criação de Scheduled/Idle-time é restrita a projetos locais, que as tarefas remotas antigas continuam sendo gerenciadas e que o celular oculta essa entrada; o H1 de projeto virtual apenas arbitra a vinculação a projeto virtual e a consolidação do diretório, sem abolir explicitamente a restrição remota. O registro de implementação anterior listou a abertura da criação remota como lacuna, sem base suficiente.
- Tratamento: confirmar de forma assíncrona com o usuário se o escopo deve ser ampliado; até a confirmação, continuar a migração de projeto dentro do limite existente de criação local, sem transformar o Source settings attachment em um canal de Agente/agendamento.
- Status: o usuário perguntou se "não se pode criar projeto remotamente", e ficou esclarecido que a restrição afeta apenas o alvo de criação de tarefas agendadas/ociosas, sem afetar projetos remotos e conversas comuns. O escopo de agendamento existente é mantido por ora, e essa restrição não é registrada como algo introduzido nesta rodada nem a ausência de agendamento remoto novo é vista como lacuna de functionality.

### D73: a auditoria de limpeza ainda encontra a antiga cadeia de criação de estado vazio sem consumidores

- Evidência: o ScratchWorkspaceDialog já não tem consumo em JSX/import, e apenas o ChatEmptyState reexporta dois helpers para testes antigos; o callback createScratchWorkspace do Root continua passando pelo App até o Shell, mas o Shell não o usa. O dep:refs usou pela primeira vez o nome do arquivo em vez do export real; depois de ler o export, a consulta foi refeita e cross-confirmada com rg de todo o repositório. Além disso, três testes de store existentes têm apenas setup, sem asserções, e não contribuem com cobertura efetiva.
- Tratamento: remover o diálogo antigo, os testes dos helpers e a cadeia de callbacks vazia; remover importações/parâmetros não usados deixados por esta alteração; manter os métodos públicos de IO do fileService, e este item não usa a UI morta para afirmar que o antigo RPC de cliente não existe.
- Status: o diálogo antigo e a cadeia de callbacks foram removidos, os 6 arquivos e 102 casos relacionados passaram, e o typecheck 78 passou; a execução completa do conjunto afetado da 6ª rodada está em andamento.

### D74: dois caches de listas do Renderer remoto ainda são apenas escritos, nunca lidos

- Evidência: a busca em todo o repositório por remotePinnedTaskStore / remoteTimelineTaskStore mostra que os únicos chamadores em produção são o refresh após a conexão e o upsert/remove de rename/pin/archive do Header; nenhum componente assina ou lê os items. A conclusão da conexão ainda espera a leitura desses dois caches, o Header ainda mantém cópias otimistas/de rollback adicionais, e a nova ProjectSidebar e o Controller global não os consomem.
- Tratamento: primeiro complementar a spec e remover os caches e as chamadas de escrita/portões de refresh. Manter a projeção de consulta de tarefas realmente consumida pelo Header e pela busca global, sem estender esta limpeza para mudar a semântica da busca global do H4.
- Status: os dois caches, a espera na conexão e as cópias otimistas/de rollback do Header foram removidos. A primeira limpeza esqueceu uma chamada quebrada em linha, detectada pelo typecheck 77; depois de completar, a confirmação em todo o repositório confirmou nenhuma referência de UI, e o typecheck 78 passou. A regressão de tempo de conexão falhou primeiro e, depois da remoção do portão de refresh antigo, 4 arquivos e 67 casos passaram junto com o Header e as opções; attachment/identidade/roteamento por owner foram preservados.

### D75: a seleção de projeto agendado/ocioso ainda lê a árvore inteira de tarefas

- Evidência: o useAutomationProjectOptions usa apenas projects, mas chama readTree, o que lê tarefas extras e entra no caminho de arquivamento automático. O contrato de leitura somente de diretório readProjects já existe.
- Tratamento: a nova regressão de leitura de candidatos falha primeiro e passa a usar readProjects; por enquanto, o escopo de criação mantém projetos locais conforme a documentação atual do produto, e a ausência de resposta sobre a confirmação de escopo não é tratada como autorização para adicionar capacidade remota de agendamento.
- Status: a regressão de leitura de diretório falhou primeiro e, depois da troca por readProjects, 4 arquivos e 67 casos passaram junto com a limpeza dos caches remotos; o typecheck 78 passou.

### D76: o catálogo de settings do celular (H2) foi listado por engano como interação a implementar

- Evidência: `docs/ui/settings-sidebar-layout.md` deixa claro que o celular em `/remote` atualmente não tem entrada para página de settings; o Source settings attachment existente também é a superfície de configuração do desktop, e já existe regressão proibindo que o celular obtenha a conexão de configuração do desktop por essa via. Listar "seleção de settings do celular com root não aberto" como lacuna também ultrapassou a superfície de produto existente.
- Tratamento: H2 mantém os candidatos de diretório de roots de projeto da página de settings existente de desktop/web; o celular só verifica as tarefas/rascunhos existentes e o limite replayable, sem adicionar página de settings nem ampliar a permissão de Source settings.
- Status: o escopo de aceitação foi corrigido; a configuração real remota com múltiplos roots continua pertencendo à verificação de settings do desktop.

### D77: a reprodução combinada de pending omitiu parâmetros explícitos de fixture

- Evidência: a 35ª rodada foi rejeitada pelo runner de E2E antes de iniciar; o manual-review captura por padrão, e usar replay exige especificar explicitamente a fixture; a aplicação nem foi acessada, e isso não é registrado como falha de produto.
- Tratamento: usar as fixtures case-local já existentes de common, VP13 e VP14, preservando o comando completo que pode ser reexecutado.
- Verificação: a 36ª rodada combinada passou, `desktop-e2e-20260911020045948-p49055-2d26d5dab6dde052`, 5 arquivos e 13 casos (10 GUI, 3 Bot synthetic), incluindo os projetos de desktop após a limpeza, o Composer com dois roots, e o reload/submissão/reabertura de rascunho no celular de 390px. Permanece pending, não promovido a formal.

### D78: a linha de tarefa permite apenas copy, e o navegador rejeita o drop de move de projeto

- Evidência: na 37ª rodada, o arrasto nativo real não exibiu a caixa de confirmação; os eventos de DOM foram registrados como dragstart allowed=copy → alvo dragover effect=move → dragend effect=none, sem drop. A linha de tarefa antiga só definia permissão de cópia para o workbench, enquanto o novo alvo de projeto exige movimento, e o navegador rejeita as duas operações incompatíveis.
- Tratamento: primeiro complementar a spec de D2; a linha de tarefa permite copyMove; o move de projeto e a cópia do workbench mantêm suas respectivas semânticas. A regressão verifica que o cancelamento por falta de root não altera a atribuição/roots, confirma de novo o movimento atômico e mantém o cwd da session.
- Status: a 38ª rodada passou, `desktop-e2e-20260911020808906-p52221-4f812704888105ce`, 1 pass, 10 segundos; o drop apareceu nas duas arrastagens, e as asserções reais de SQLite de atribuição/roots/cwd no cancelamento e na confirmação passaram..Split/drag preview/linha de tarefa/projeto offline somaram 4 arquivos e 14 casos passando, e o typecheck 79 passou. Depois, a asserção de abertura do corpo após o movimento foi acrescentada, aguardando a próxima rodada de GUI.

### D79: o helper de teste de reinício frio força a espera por um diretório padrão que não deveria mais ser aberto

- Evidência: na 39ª rodada do VP16, a requisição real ao modelo já provou que CREATE/LIVE usam a capacidade de A+B e leem apenas o AGENTS de A; mas após o reinício completo do processo, o helper esperava primeiro por ZCodeProject e reportava "a tela principal não mudou para o workspace". F5/F13 só restaura o A que estava ativo por último e não deveria criar uma tab padrão extra. O parâmetro de destino do helper já é A, mas a espera prévia continua fixa no diretório padrão.
- Tratamento: os dois helpers de reinício esperam apenas pelo workspacePath que solicitaram explicitamente, reutilizando a saída do processo original e a barreira de flush do profile; o comportamento de inicialização do produto não muda por causa dos testes.
- Verificação: as duas regressões parametrizadas falharam primeiro e, depois da correção, 2 arquivos e 3 casos passaram; na 42ª rodada, a restauração completa de processo frio passou, ver D81.

### D80: o launcher de testes do checkout antigo independente não tem entrada de comando tsx

- Evidência: nas duas primeiras execuções da sonda entre versões, o startup falhou respectivamente porque `pnpm exec tsx` não existe no checkout antigo e por ter assumido erroneamente que `apps/zcode-cli/node_modules/.bin/tsx` existia; a lógica de escrita do repositório nunca foi alcançada.
- Tratamento: usar explicitamente o loader tsx já instalado para carregar o script, e os módulos de negócio continuam sendo resolvidos a partir do checkout antigo/novo passado; os contratos antigos do CLI são compilados separadamente no checkout antigo, sem criar soft link dos pacotes de workspace novos para o código antigo. As três variáveis de ambiente de caminho de dados são fixadas antes do início do processo no mesmo HOME isolado, e o script tem asserções de prefixo de diretório e de consistência de ambiente.
- Verificação: o script de persistência `scripts/verify-project-upgrade.mts` passou nas quatro fases da 5ª rodada; o writer antigo de fato renomeou, deletou e criou, e o novo facts owner foi confirmado pelo CLI Store real injetado e liberado; corpo/chave estrangeira/checksum de histórico/atribuição foram preservados. Este item não declara cobertura do binário antigo do Server nem do transporte stdio.

### D81: o follow-up da restauração completa a frio foi rejeitado pelo serviço de replay, e os artefatos combinados não bastam para explicar o motivo da correspondência

- Evidência: na 40ª rodada, as asserções de capacidade CREATE/LIVE passaram e o reinício completo já entrou nas tarefas históricas de A; a requisição COLD devolveu `Missing DeepSeek e2e fixture for POST /anthropic/v1/messages` e a resposta esperada não apareceu. O arquivo de captura compartilhado da combinação foi depois resetado por outro caso, faltando a evidência completa de correspondência da requisição que falhou. Os outros 13 casos passaram e isso não permite computar a restauração a frio como aprovada.
- Tratamento: reexecutar o caso isoladamente, salvando as requisições ao modelo e as capturas de tela em outro local antes de limpar os dados; confirmar primeiro os fatos de correspondência/execução, sem ampliar o matcher nem alterar a lógica de restauração do produto para eliminar a falha.
- Causa raiz: as requisições e os logs do CLI salvos na 41ª rodada confirmam que o manual-review injeta por padrão contextWindow de 240 tokens / 80 de saída, o que disparou o auto compact não coberto por este caso. O que não correspondeu foi a requisição de resumo de manutenção com `CRITICAL: Respond with TEXT ONLY`, que ainda não chegou à resposta COLD comum; essa requisição já contém a capacidade de A+C e apenas o AGENTS de A. Não se pode engolir a requisição de resumo afrouxando o matcher de resposta comum.
- Ajuste de tratamento: reaproveitar a condição de poda em nível de caso já existente no WDIO; este caso usa a janela comum de 128k, evitando misturar auto compact na aceitação do ciclo de vida multi-diretório. Complementar a preservação de artefatos de rede independentes. Na 42ª rodada, `desktop-e2e-20260911022115498-p80539-9be2fa2abb7679cb` passou (1 caso, 13,4 segundos); as requisições comuns ao modelo em CREATE/LIVE são de A+B, COLD é de A+C, o AGENTS é sempre apenas o de A, com o mesmo taskId/cwd.

### D82: com o conjunto completo de testes afetados rodando em paralelo com o GUI, duas esperas de transporte Web existentes estoura o tempo

- Evidência: na 7ª rodada, 1723 arquivos passaram e 1 arquivo falhou; dois casos de webRemoteControlTransport estouraram o tempo em waitUntil, sem diferença de asserções de tipo/protocolo. Essa rodada rodou a build Electron completa em paralelo com o GUI; o arquivo contém esperas reais de socket de 500ms/2s, e a 6ª rodada completa tinha passado antes.
- Tratamento: reexecutar primeiro o arquivo isoladamente e depois rodar o conjunto afetado completo em série; não alterar a duração das esperas nem modificar o transporte por causa disso. Cargarelated é apenas a hipótese atual; não se pode escrever que uma nova execução bem-sucedida significa que a causa raiz foi corrigida.
- Controle independente: na primeira rodada, a versão atual estourou o tempo em outro caso de deadline de ACK; em seguida, a versão atual e o checkout antigo independente passaram ambos os 27 casos. O código-fonte do transporte e seus testes não foram modificados nesta rodada, e ainda não é possível determinar a causa raiz do estouro. Na 8ª rodada, o conjunto afetado completo em série passou: 1724 arquivos / 14937 testes, 2 arquivos / 14 testes pulados por configuração, 303,55 segundos. Nenhuma falha foi eliminada afrouxando timeouts ou modificando o transporte.

### D83: o servidor de teste de metadados de URL não abriu o canal de sincronização inicial do Provider

- Evidência: na 43ª rodada, a criação de tarefa remota nova do VP17 falhou antes do workspace attachment; o log do desktop mostrou falha na primeira sincronização do Provider Provisioning, e o log do Server independente mostrou `Unknown channel: provider-provisioning-target`; os 7 casos originais passaram. Até então, os casos de URL só acessavam metadados de projeto e não passavam pela admissão do Provider.
- Causa raiz: a fixture de teste não passou `providerProvisioningTargetEnabled: true`, enquanto o ServerCore de produção já passava essa opção. Não foi falha de diretório de projeto nem de execução do Agente.
- Tratamento: a fixture abre o canal original conforme o ServerCore de produção, removendo a cópia manual do arquivo de configuração do Provider e dependendo da sincronização inicial original; manter os logs de rede e do Server e as capturas de tela em caso de falha, e continuar a verificação de execução real.

### D84: o cwd autoritativo do projeto remoto é realpath'd de novo pela seleção comum de diretório

- Evidência: na 44ª rodada, a sincronização do Provider já estava aplicada, mas o Host religou `/tmp/.../repo` como `/private/tmp/.../repo`; o Renderer criou o attachment lógico por um instante  e revogou imediatamente, terminando em branco. A identity do prepare do projeto segue o cwd original, mas o ramo comum de open-project canonicaliza de novo, e então a checagem exata de identity da navegação do projeto falha.
- Causa raiz: o par diretório/identity já existente do Host foi tratado como um caminho de usuário não resolvido, e cada etapa decidiu o cwd por conta própria.
- Limite da correção: o rascunho do projeto e as tasks históricas atravessam a identidade original pelo open-project/Host bind existente, pulando a segunda resolução de caminho do Renderer; a seleção comum de pasta mantém o canonical resolver. O cwd de tasks existente, a admissão do Host, a checagem exata de identidade e o desktop continuous/mobile replayable não mudam. Primeiro complementar a regressão de alias de caminho, depois corrigir a implementação e continuar a execução do caso remoto real.

Retorno de D84: a regressão de alias de caminho falhou primeiro (57 pass / 1 fail) e, depois da correção, 5 arquivos e 69 casos de navegação remota/Controller/histórico passaram; o typecheck 83, a architecture 65 (baseline 0/new 0) e o lint 28 (48 warnings/0 errors) passaram. Continua na 45ª rodada a execução remota real.

### D85: a execução real por URL funcionou, mas a atribuição de projeto e os diretórios adicionais estão faltando

- Evidência: na 45ª rodada, já se entrou no cwd remoto e se recebeu a resposta real do Agente; a requisição ao modelo capturada não tinha o skill do root adicional, e a consulta da linha da tarefa remota antes da limpeza do teste mostrou project_id como NULL. Ainda não passou pela aceitação de atribuição/reabertura nos dois bancos.
- Localização: acrescentar a observação dos parâmetros de createSession recebidos pelo Source e do owner do rascunho no Renderer, distinguindo primeiro perda antes do envio de perda no roteamento do serviço. O log do método RPC comum não é suficiente para localizar esse campo. A limpeza após a falha apaga o banco isolado, e a evidência do banco precisa ser salva dentro do finally do caso, antes da limpeza; não se pode ler em paralelo com o cleanup e concluir errado sobre caminho ou corrupção de SQLite.

Resultado da localização de D85: na 47ª rodada, o rascunho do Renderer tinha projectId/cwd/identity corretos, mas nas rodadas 46/47 o Source recebeu createSession sem projectId. Localizado estaticamente que `ReplaceableConversationTransport.sendCommand` ainda tinha apenas a assinatura antiga de um parâmetro e descartava o novo context; os casos locais e de celular com transporte direto não passam por esse proxy, e por isso o teste original não encontrou. Primeiro complementar a regressão de encaminhamento entre gerações de proxy e só então repassar os parâmetros originais, sem novas inferências nem escrita compensatória no servidor.

### D86: o ramo antigo que reaproveita tab remota cancela incondicionalmente o attachment recebido

- Como foi descoberto: ao verificar o ramo de vínculo existente na segunda metade do VP17 ("trocar de lugar e reabrir"), viu-se que `selectRemoteWorkspaceProjectFromDialog` cancela incondicionalmente cancel(sessionId) depois de reaproveitar a tab com sucesso, sem distinguir o attachment temporário do owner atual da tab. A navegação de projeto explicitamente reaproveita o sessionId atual, então essa lógica antiga revoga uma conexão ainda em uso.
- Tratamento: primeiro parametrizar a verificação de que "uma conexão temporária extra deve ser cancelada / o owner atual não deve ser cancelado", e acrescentar apenas a comparação de igualdade de owner; a reabertura real da tarefa é verificada pelo VP17 depois, e não conta como cobertura de GUI antes de ser executada.

Retorno de testes unitários de D85/D86: os dois problemas apresentaram primeiro regressões com falha e, depois da correção, 3 arquivos e 72 casos de runtime/proxy V4, histórico remoto e navegação de projeto passaram. Na 47ª rodada foram preservados de forma independente o rascunho do Renderer, os parâmetros de createSession do Source e o JSON de fatos da tarefa, o que prova que a perda de atribuição está no transport; a execução remota completa e a reabertura ainda aguardam a confirmação da 48ª rodada.

### D87: o E2E remoto selecionou, na tabela tasks bruta, uma linha de reserva de pré-aquecimento não publicada

- Evidência: na 48ª rodada, a requisição remota ao modelo continha o skill adicional, o createSession do Source trazia o projectId correto e as asserções de owner nos dois bancos passaram; mas a reabertura da tarefa procurou outro taskId. O JSON de fatos do finally mostrou que o SQL `WHERE project_id=?` pegou a linha de reserva de pré-aquecimento anterior (cli_last_outcome=NULL), enquanto a tarefa concluída de fato é a linha seguinte. Por contrato, a interface não exibe linhas de reserva não publicadas.
- Tratamento: esperar e ler com a mesma condição `cli_last_outcome=completed` a tarefa realmente executada e só então fazer a reabertura pela UI; não fazer a UI exibir linhas de reserva para agradar o teste.

Retorno de GUI de D83～D87: na 49ª rodada, `desktop-e2e-20260911025248939-p13972-1d10009d9a508916` passou nos 8 casos originais. A requisição remota real de criação carrega o projectId, o contexto do modelo tem o skill adicional, a persistência de task/project/host/cwd/corpo no Source, o Controller não tem cópia da task deste Host, a troca e reabertura da task original e a remoção da entrada não apagam o corpo foram todos verificados. Na 48ª rodada, os outros 5 arquivos passaram (restauração a frio, referência/arrasto, celular, Bot synthetic); o novo VP18 de restauração a frio do CLI remoto ainda awaits execução.

Nota sobre a infraestrutura de teste do VP18: o runtime lifecycle é uma capacidade opcional na interface pública e a primeira checagem de tipos do E2E rejeitou a chamada direta; depois de a fixture ganhar uma asserção explícita de capacidade, o typecheck:e2e e a checagem de fixture case-local passaram. Essa asserção limita apenas as condições de observação do caso de restauração a frio e não transforma a interface do produto em capacidade obrigatória.

### D88: o teste de restauração a frio clica no botão de envio ainda desabilitado logo após ver o corpo em cache

- Evidência: na 50ª rodada, o Source já tinha concluído a escrita de roots B→C e o descarte do Agente antigo, e a nova runtime identity apareceu; após o corpo histórico ser restaurado, o botão de envio clicado pelo teste ainda tinha o atributo disabled, e o WebDriver reportou click intercepted. A requisição COLD do usuário ainda não tinha sido enviada, o que impede tratar isso como falha de capacidade do modelo.
- Tratamento: seguir a barreira real de estado de envio da interface, esperando o botão ficar enabled antes de clicar; sem mudar o tempo do produto nem adicionar sleep fixo.

### D89: depois que um ACK atrasado entre runtimes é rejeitado, a classificação de recuperação existente não cobre esse erro

- Evidência: na 51ª rodada, a runtime identity já tinha mudado; o Renderer recebeu um ACK de outra geração, registrou stale_ack e `fault.subscription.runtimeRestarted`, e a interface ficou travada numa página de erro (VP17-final.png), com o botão de envio desaparecendo. A correção de D88, que esperava enabled, revelou que a falha real de recuperação já não pode ser atribuída ao momento do clique.
- Causa raiz: o transport rejeita corretamente o ACK de outra geração; o evento available do ProjectionStore evita duplicar a assinatura em trânsito, mas a classificação conhecida de reciclagem de runtime capturada depois no catch não inclui esse erro, e por isso o fluxo de resubscription já existente não foi acionado.
- Limite da correção: manter o descarte de ACK antigo, o owner único de assinatura e o retry budget original; apenas classificar o erro exato runtimeRestarted dentro do fluxo de recuperação original, sem criar temporizadores/filas e sem reproduzir comandos. Primeiro reproduzir com um teste combinado de transport real + lifecycle/restart + ACK em trânsito. A regressão determinística falhou e depois passou, e os 37 itens relacionados passaram; na 52ª rodada, a execução remota real, a reabertura e a restauração a frio do VP17/18 passaram.

### D90: o E2E do catálogo de Hooks esperou apenas o texto do último item durante a animação

- Evidência: na 52ª rodada, o VP17/18 remoto e a restauração a frio local passaram, e o VP11 falhou com a contagem de A igual a 0. O WebDriver registrou 5 menuitemradio já existentes, mas o getText concorrente retornou vazio nos quatro primeiros, e só o último item, B, tinha texto; a condição de espera original só verificava B, saindo imediatamente, sem esperar todos os roots aparecerem.
- Tratamento: continuar usando a espera condicional de 10 segundos já existente e, após o texto de A/B ficar visível, afirmar estritamente um item em cada; manter a UI original do menu, o owner do diretório e a implementação de deduplicação, sem adicionar atraso ao produto.
- Verificação: a 52ª rodada é a evidência de falha; na 53ª rodada, o mesmo caso de interação real passou, e o arquivo principal completo passou em 8/8.

### D91: a regressão do celular foi rejeitada pela validação de certificado TLS do relay externo

- Evidência: na 52ª rodada, o CDP recebeu `net::ERR_CERT_AUTHORITY_INVALID` no handshake em `wss://zcode.z.ai`, e o VP13 parou na admissão do mobile relay; a captura de tela mostra "não foi possível conectar ao serviço de relay", ainda sem entrar na navegação de projeto ou de sessão. Isso é registrado separadamente das falhas de pareamento de causa desconhecida anteriores do D68.
- Tratamento: manter a validação de TLS e não modificar o comportamento de conexão/recuperação do produto; conferir a conexão de certificado de forma independente e reexecutar o caso representativo do celular, e não se pode declarar essa rodada como completamente aprovada antes disso. O curl HTTPS teve sucesso, o Chrome HTTPS independente devolveu 200 e o emissor do certificado é a Proxyman CA local; o user agent, a confiança em certificados e a validação TLS do usuário não foram alterados. O sucesso do HTTPS não significa que a anomalia anterior de certificado WSS foi eliminada.

- Reverificação de D91: na 54ª rodada, a execução isolada do celular ainda falhou no mesmo handshake TLS do relay; a sonda WSS sem pareamento do Chrome independente não conseguiu estabelecer o handshake da aplicação, o que não serve como aprovação da regressão do celular. O registro de passagem da interação completa do celular na 48ª rodada é preservado, e as falhas das duas últimas rodadas não podem sobrescrever nem ser reescritas como aprovação.

Retorno final de testes unitários: na 9ª rodada, o conjunto afetado completo em série passou, 1724 arquivos / 14942 testes (2 arquivos / 14 testes pulados por configuração), 341,12 segundos; inclui as correções de D84～D89. A anomalia de certificado do relay externo do celular em D91 continua registrada como limitação de verificação de ambiente, e a aprovação de testes unitários não substitui a aceitação da interação no celular.

Retorno final dos portões: typecheck 87 passou; lint 32 ficou em 48 warnings / 0 errors; architecture 69 ficou em violations 0 / baseline 0 / new 0; a formatação dos arquivos alterados e o git diff --check passaram.

### D92 a aceitação do usuário encontrou a UI e o fluxo de criação divergindo da versão antiga

A criação ficou sem a escolha entre local e remoto, o colapso por seções/arrasto e as operações de hover foram perdidos, a linha de projeto mantém permanentemente o menu de reticências e apareceu uma entrada de conexão na parte inferior. Conforme as capturas do usuário e a restauração de interação do z-code-2, preserva-se a abstração de atribuição de dados do Host; a linha do tempo apenas oculta a entrada.

### D93 Grupo vazio migrado reversamente como projeto vazio

migrateGroups cria explicitamente um projeto vazio quando hosts.length === 0, o oposto de "não migrar sem session". A primeira migração trata apenas membros não excluídos; o contêiner local é conferido contra o backup pela origem, e Groups manuais não são removidos pelo nome do Group. SQL/checksum inalterados.

Correção local de D93: no backup original, 19 Groups manuais e 19 projetos migrados com nomes sobrepostos correspondem item a item na mesma ordem, dos quais 11 têm zero membros e zero root. Depois de conferir que as linhas atuais não mudaram e que não há referência a tarefas/agendamento/Bot/entrada remota, fez-se backup e removeu-se esses 11 contêineres gerados indevidamente em uma transação. Backup: `~/.zcode/backup/empty-group-repair-20260911-gq2grh`. 4101 tarefas foram preservadas e o hash das outras 15 tabelas não mudou; os 41 projetos úteis foram preservados, e o quick_check e a checagem de chaves estrangeiras passaram.

### D94 problema de teste da regressão de correção e ciclo de vida da conexão

Na 55ª rodada, o teste escreveu o seletor de texto do WDIO como um CSS composto e casava apenas com o chinês; foi corrigido para um seletor válido e bilíngue. Na 56ª rodada, a UI local e a seleção de diretório passaram, mas a fixture offline, após o primeiro reload, não esperou o workspace ficar pronto, e a seleção remota posterior escolheu por engano o primeiro Host offline da lista, encadeando falhas; acrescentaram-se diagnósticos de DOM/layout em runtime e a seleção pelo Host alvo, preservando as asserções de negócio originais. O assistente de criação também passou a incluir o callback de conexão concluída e a liberação do attachment temporário, evitando entrar no fluxo de vinculação de sessão/diretório ao reutilizar o diálogo de conexão antigo.

### D95 limite cross-plataforma da seleção de diretório de projeto

A versão inicial, reutilizando o Source settings attachment, só podia ser chamada no desktop, porque o celular não tem essa interface. Consolidou-se em uma rota projectService.readDirectory(hostId), com a camada de montagem do Host reutilizando fileService/systemService, e a UI DirectoryBrowser deixou de adivinhar o owner pelo tab atual ou pela plataforma; não lê nem escreve o banco de projetos e não cria workspace/Agent. Na 57ª rodada, 8/9 itens passaram (falta de prontidão no reload da fixture offline); na 58ª rodada, o item offline passou, e a nova checagem de cartão de tipo falhou por não esperar a animação de abertura, trocando-se por espera de visibilidade, sem afrouxar as asserções de negócio.

Consolidação arquitetural de D95: depois que o serviço público de projeto ganhou 1 intenção de consulta de diretório, verificou-se que os 4 portas internos do antigo adaptador somente-leitura também estavam expostos no contract público. O dep:refs confirmou que elas são usadas apenas por legacy-single-root e foram movidas de volta para a implementação privada; a porta de injeção de IO de arquivo permanece igualmente na implementação de montagem, o serviço público mantém 9 métodos e o limiar de portões não é elevado.

### D96 a aceitação do celular após a correção continua limitada pelo TLS do relay

Na 59ª rodada, o arquivo principal do desktop passou em 9/9. Na 60ª rodada, após a reconstrução final, rodaram 6 arquivos com 14/15 itens passando, cobrindo criação/edição no desktop, criação/seleção de diretório/execução/reabertura/restauração a frio no remoto, referência com múltiplos roots e Bot; o VP13 do celular recebeu `net::ERR_CERT_AUTHORITY_INVALID` na admissão do mobile relay, o caso de 120 segundos estourou o tempo e não chegou às novas asserções de criação e seleção de diretório no celular. Não se desliga a validação de TLS e não se considera as capturas em tela estreita do desktop como aprovação da funcionalidade shared-host do celular. Evidência: `desktop-e2e-20260911041509471-p81756-b19a03b8965c1300/summary.md`.

### D97 as capturas responsivas precisam restaurar o tema e o estado reais da barra lateral

Ao acrescentar as capturas de 390px na 61ª rodada, disparou-se o recolhimento automático da barra lateral pelo WorkspaceShellLayout existente; limpar o override de viewport não expande automaticamente, e os cliques seguintes caíram na área recolhida de 4px de largura. Só alternar a classe dark também não basta para alternar as variáveis de tema Zai, e a verificação manual mostrou que a captura marcada como light continuava escura. O teste passou a usar a entrada de teste setTheme já existente, esperou theme-zai-light/dark fazer efeito e, após restaurar a largura da janela, expandiu pelo botão real da barra lateral; a política responsiva do produto não muda.

A revisão final encontrou ainda que, com uma conexão de Host já salva, era possível clicar em "Adicionar conexão", entrando simultaneamente em um segundo fluxo. Primeiro adicionou-se uma regressão de Promise pendente para obter a falha e depois reutilizou-se o estado connecting existente para desabilitar essa entrada, sem novo estado nem nova fila.

Verificação final desta correção de UI: na 62ª rodada, após a reconstrução, `desktop-e2e-20260911042339326-p86585-46199afefdcc6fd0` passou em 9/9 no desktop, incluindo criação e seleção de diretório remotas reais, execução/reabertura de tarefa/restauração a frio do CLI; as asserções de layout de criação/edição em 1200/390px e nos temas claro/escuro do Zai passaram, com verificação manual das capturas. Os testes unitários passaram em 29 arquivos / 129 itens; o typecheck raiz passou em 5; o lint 3 ficou em 48 warnings / 0 errors; a architecture 6 ficou em baseline 0 / new 0 / violations 0; a formatação dos 39 arquivos alterados e o git diff --check passaram. A falha de TLS do celular no conjunto completo de 6 arquivos da 60ª rodada continua sem solução, e a passagem do desktop na 62ª rodada não a substitui.

Impacto arquitetural: o project-sidebar é responsável pelo estado de UI dos formulários e do colapso, o serviço de projeto pelo roteamento de intenções do Host, e o project-storage pela primeira conversão de dados antigos; o IO de diretório reutiliza o serviço de arquivos da montagem do Host, e as conexões ficam a cargo do gerenciador de conexões existente. Salvar e depois adicionar uma entrada, desconectar e não voltar ao local; não foi introduzida cópia de tarefas nem fila, e oslink desktop continuous / mobile replayable permanecem inalterados.

Este código (incluindo testes unitários/E2E) adicionou 1487 linhas e removeu 463, liquido de 1024 linhas; o novo formulário por etapas e a adaptação de diretório reutilizam a UI e o mecanismo de conexão existentes. Depois de staged dos novos arquivos, a architecture foi executada novamente e baseline/new/violations continuam todos em 0.

### D98 o Migration ID deve seguir a regra de numeração do CLI

O usuário apontou que `v3_projects` mistura o código de schema no ID de migration. O CLI usa número de quatro dígitos com zeros à esquerda mais um nome semântico, e o task-index antes não tinha um razão versionada, então o primeiro deveria ser `0001_projects`, com incremento próprio em cada banco. Apenas a declaração de renomeação e as expectativas nos testes de inicialização/upgrade são alteradas; o texto SQL (inclusive o comentário v3 que entra no checksum) permanece como está, e novas asserções de checksum fixo são acrescentadas. Não se adiciona alias nem uma segunda lógica de migração ao runner público para nomes temporários de desenvolvimento.

Localmente, fez-se backup, renomeou-se em uma cópia e chamou-se o projectStorage.migrate atual, confirmando applied=[] e hashes de todas as tabelas de negócio inalterados; só então, em uma transação no banco real, atualizou-se apenas o schema_migration.id. O checksum, o app_version e o applied_at não mudaram; 4102 tarefas, 41 projetos e o conteúdo das 15 tabelas de negócio seguem inalterados, e o quick_check e a checagem de chaves estrangeiras passaram. Backup e relatório: `~/.zcode/backup/migration-id-20260911-cppLK7/`. A primeira asserção na cópia falhou porque a linha null-prototype devolvida pelo SQLite do Node tem um protótipo diferente do de um objeto comum; isso aconteceu antes de qualquer modificação no banco real e, após unificar os objetos de linha na comparação, a verificação passou sem afrouxar as asserções de campo.

Verificação de D98: 5 arquivos / 34 testes unitários passaram (incluindo primeira atualização, inicialização repetida, downgrade e o runner público); o typecheck raiz passou, o lint ficou em 48 warnings / 0 errors, a architecture deu baseline/new/violations todos em 0, e a formatação e a checagem de diff passaram. Na 63ª rodada, `desktop-e2e-20260911044122173-p94329-bf236dca664095c7` passou em 9/9 de E2E de desktop após a reconstrução, e a primeira janela confirmou que o app `0001_projects` e o CLI `0020_session_soft_delete_outcome` foram concluídos. O módulo afetado é a declaração de migration do project-storage; o schema_migration continua sendo exclusivo do runner público, e a ordem de inicialização e a temporização desktop/celular não mudam. O código, com testes, adicionou 15 linhas e removeu 8, líquido de 7 linhas.

### D99 a reprodução da linha de projeto omitiu o estado dos ícones e os botões de atalho

O usuário esclareceu ainda mais: a antiga WorkspaceSidebarItem não tinha seta própria, e sim Folder/FolderOpen; o hover precisa preservar os três botões de atalho Ellipsis/ListTree/MessageCirclePlus, e o menu de contexto é apenas um complemento. Na ocasião anterior, o menu de contexto foi tomado por engano como substituto da operação por hover, e a árvore de arquivos não foi reconectada. Desta vez, os ícones e a área de operações da linha antiga são conferidos diretamente, fornecendo as mesmas definições de operação para mais(dropdowns) e para o menu de contexto; a árvore de arquivos reutiliza os componentes existentes e o binding do Host; root único abre direto, múltiplos roots abrem seleção e zero root fica desabilitado. A regressão de componente obteve primeiro 5 falhas; o TooltipProvider pertence à camada externa real da aplicação, e o teste complementou o mesmo Provider para verificar o ciclo de vida do ponteiro do menu, sem modificar a implementação de produção do tooltip.

### D100 voltar da árvore de arquivos perde o estado de recolhimento do projeto

O E2E real `desktop-e2e-20260911044927627-p7359-cb8e4a4e218a1954` já passou por mais edições, leitura de arquivos de dois roots e leitura por menu de contexto, mas no fim se descobriu que o aria-expanded do projeto voltou de false para true. A causa raiz é que a árvore de arquivos, ao substituir a lista, desmonta o ProjectNode e o useState interno dele é reiniciado no retorno; não é o bubbling do evento do botão de novo. O valor de recolhimento, com Host + ID de projeto, é transferido para a barra lateral permanente, e a linha de projeto apenas renderiza o valor controlado e emite o comando de alternância, mantendo um único owner de UI. O teste também repôs a navegação real do projeto padrão, para que o novo caso não deixe poluição em um novo root e contamine os casos existentes seguintes.

A segunda rodada `desktop-e2e-20260911045203103-p11417-ebd0e1c6d11d98d5` passou em 9/10: a interação completa da linha de projeto, a árvore de arquivos com múltiplos roots, a leitura real de arquivos de um root remoto não aberto, a tarefa remota e a restauração a frio passaram. A única falha foi a fixture offline antiga, que após o refresh entra na página de boas-vindas da API Key, com apenas oauth/login test id no diagnóstico e sem chegar às asserções de projeto offline. Reutiliza-se a preparação de teste loginWithApiKey existente, executada apenas quando a página de boas-vindas realmente aparece, sem modificar a lógica de login do produto e sem enfraquecer as asserções de cache offline.

A terceira rodada `desktop-e2e-20260911045528228-p14085-79b286cd69402942` passou em 10/10 no arquivo principal, incluindo recarregamento de cache offline, operação completa da nova linha de projeto, leitura de arquivos multi-root/remota e restauração a frio de tarefa; houve verificação manual dos ícones e dos três botões em `VP20-project-row-hover.png`. Os testes unitários relacionados passaram em 19 arquivos / 54 itens; o typecheck raiz e a checagem de tipos de saída não-E2E final passaram, o lint ficou em 48 warnings / 0 errors, e a architecture deu baseline/new/violations todos em 0. O ramo shared-host do celular tem testes de roteamento, mas nesta rodada não foi concluída a verificação real da árvore de arquivos no celular, e as limitações de ambiente existentes de D91/D96 não são reescritas como aprovação.

Consolidação de owner desta rodada: o project-sidebar mantém o recolhimento e o alvo de arquivo, e o menu compartilha as definições de ação; ver arquivos remotos reutiliza a conexão existente e o binding de workspace. Não há nova fila de tarefas, cópia de banco, protocolo ou migration, e os limites desktop continuous / mobile replayable permanecem inalterados.

O código, com testes unitários/E2E, adicionou 685 linhas e removeu 123, líquido de 562 linhas; o código novo é principalmente a restauração da navegação de arquivos e as regressões correspondentes. A checagem de formatação de 18 arquivos desta tarefa e a checagem de diff passaram, e depois de staged dos novos arquivos o portão de arquitetura continua com baseline/new/violations todos em 0.

### D101 o editor não tinha a listagem de diretórios existentes nem a entrada de remoção

A captura do usuário revelou que, depois de adicionar o primeiro root, a tela continuava mostrando o cartão grande de estado vazio, e os diretórios apareciam com caminho completo e caixas de seleção nativas; o diálogo de edição não tinha botão de remoção. O rastreamento estático confirmou que o primaryRoot já era salvo pelo editor, persistido pelo Host e usado por prepareSession para definir o cwd de novas tarefas, ou seja, a capacidade principal de diretório existe, mas a entrada não segue a implementação de referência. desta vez foi acrescentado o list compacto de diretórios, a definição do diretório principal e a remoção suave no rodapé, reutilizando o serviço e o ownership originais, sem reescrever a lógica de remoção de diretórios/tarefas; primeiro vêm os testes unitários e o E2E real.

Regressão de D101: os 6 novos cenários de componente falharam todos antes da correção, e depois da correção passaram 19 arquivos / 63 testes unitários relacionados. Na primeira rodada, o desktop VP22 já completou o salvamento do diretório principal, a reabertura, a remoção por cancelamento, a entrada de nova tarefa em B e a remoção pelo editor, mas a asserção final no banco de teste escreveu a coluna real project_id como o campo de domínio id, gerando no such column: id; a asserção somente-leitura foi corrigida conforme o schema existente, sem alterar o produto. Evidência: `desktop-e2e-20260911051307158-p24991-fd711d370419e0ee`.

Verificação final de D101: na segunda rodada, `desktop-e2e-20260911051449253-p26668-5ffc16408305af4f` passou em 11/11 no arquivo principal do desktop; as capturas em 1200/390px e nos temas claro/escuro do Zai foram verificadas manualmente, e a lista de diretórios, o estado de principal, a adição na última linha e a entrada de remoção à esquerda estão visíveis. O salvamento do diretório principal B no banco, a reabertura no editor, a remoção por cancelamento sem gravação em disco, o cwd=B da tarefa nova e a preservação dos arquivos e roots originais após a remoção suave têm todas asserções reais. Passaram 63 testes unitários, o typecheck raiz, a checagem de tipos de saída não-E2E e a fixture check; o lint ficou em 48 warnings / 0 errors, e a architecture deu baseline/new/violations todos em 0. Esta rodada não concluiu a aceitação real do controle remoto pelo celular e não adicionou mudanças de protocol/Host/CLI/banco de dados.

O escopo arquitetural é project-sidebar (estado de rascunho/submissão do ProjectEditor, com o estado persistido do Host inalterado) e i18n; reutiliza-se getPathLeaf e o saveProject/deleteProject/prepareSession originais. O código, com testes, adicionou 371 linhas e removeu 44, líquido de 327 linhas. A checagem de formatação e de diff dos 11 arquivos desta tarefa passou.

### 2026-09-11 regressão de preservação da experiência de produto

- Expectativa original: a refatoração de projeto virtual substitui o modelo de dados e preserva as interações antigas que não foram explicitamente canceladas. A revisão encontrou que a prioridade de ordenação/preferência, paginação, memória de recolhimento, realce de seleção, saída de arquivamento, feedback de fixação, árvore de arquivos e marcação de celular, menu/diagnóstico remoto e estado selecionado no topo não conectados; o ponto de não lida recolhido também ficou de fora.
- Decisão do usuário: Groups antigos não são restaurados, projetos expandidos não entram no rascunho de diretório; o restante da experiência antiga é preservado, e o ponto de não lida recolhido à direita do nome do projeto é restaurado. Primeiro reescrever a spec e VP23–VP27 e só então implementar. O workspace atual já tem outra correção de roots no editor; preservam-se as modificações dela, sem misturá-las com o resultado desta rodada.
- Limites: a atribuição de dados de CLI/Host, o checksum de migration e continuous/replayable não mudam; restaurar o feedback de UI em trânsito não restaura o antigo cache factual de escrita dupla. Os testes reais e as exceções posteriores são reescritos item a item.

- Verificação complementar: ProjectTaskRows passava apenas as tasks fixadas no topo (pinnedTasks) ao TaskList, que só renderiza tasks, de modo que a área de fixados não só não tinha título, como também perdia linhas. Acrescenta-se uma regressão de montagem real do TaskList. A omissão no diagnóstico remoto inclui ainda o fato de a montagem do Host apenas projetar o estado e descartar o erro atual; pelo owner de conexão original, acrescenta-se uma projeção somente-leitura e correlação de logs, sem que a UI armazene a verdade da conexão.

- A regressão de fiação encontrou ainda mais: a árvore de arquivos de tarefa no celular não pode trocar de caminho de exibição diretamente, é preciso esperar a troca do attachment shared-host já existente; resultados atrasados após o fechamento são descartados. O connectProfile do serviço de gestão não carregava TransportContext.onLog, o que fazia a reconexão de projeto ficar sem o progresso real de probe/upload; agora o Host injeta o callback de progresso original, e o gerenciador de conexões continua sendo o owner único.
- Desvios de teste registrados à parte: a primeira criação de session do Electron WebDriver estourou o tempo e nem entrou no caso; a reexecução passou. Os novos casos escreveram o texto fixo em chinês na primeira vez e falharam no ambiente em inglês, passando a usar o texto bilíngue existente. O arquivo principal antigo fazia toggle incondicional da barra lateral após a captura, e tratava a largura fixa do aside interno como a largura do painel visível, ended fechando o painel em 4px; passa-se a ler a largura real do painel do Shell e a operar condicionalmente. Nada disso foi resolvido modificando o comportamento do produto para adaptar o teste.
- Executado: 16 arquivos / 72 testes unitários relacionados passaram; cobrindo ordenação estável de running/prewarming, preferência de duplo horário, paginação, isolamento de não lida por Host, realce entre workspaces, retenção em falha de arquivamento, ACK de pin e as duas ordens de consulta com rollback em falha, resultado atrasado da árvore de arquivos no celular, limite de entrada de sincronização remota e isolamento de logs de membros de conexão. O portão de arquitetura deu baseline/new/violations todos em 0; o typecheck raiz e o typecheck de E2E passaram; o lint ficou em 48 warnings / 0 errors (avisos originais, sem avisos novos nos arquivos desta rodada).
- O arquivo principal do desktop `desktop-e2e-20260911054217420-p41656-43031825c9424f42` passou em 11/11, incluindo o novo VP25 com cancelamento de realce após sair de uma tarefa remota real, reabertura, saída de arquivamento do corpo, arquivamento que escreve apenas no tasks-index remoto e a preservação do corpo no CLI. O novo arquivo de lista `desktop-e2e-20260911053640514-p37956-70e68e684c250479` passou em 3/3 (VP23/24 e a árvore de arquivos de VP25/26, cancelamento de fixação, seleção na navegação, 1200/390px e temas claro/escuro). Atualizou-se o invariante de ordenação da skill session-management, para evitar continuar interpretando "origem do tempo do CLI" como "somente por tempo de atualização".

- A revisão final de concorrência encontrou que, se o pin em trânsito for liberado quando "houver ACK e o valor consultado for igual ao valor esperado", o cancelamento da fixação no outro ladoimediatamente encobriria permanentemente o fato mais recente. Acrescenta-se um contraexemplo que falha primeiro e depois é corrigido, removendo-se a marca committed e o efeito de igualdade, e liberando assim que o comando e a atualização corrente terminam; nenhum estado de sincronização novo foi adicionado.
- O VP13 do celular nesta rodada `desktop-e2e-20260911054347850-p42852-87fc8addca4cc9d8` já iniciou o pareamento usando o Web :5173 atual, mas a captura de tela da página mostrou `AUTH_FAILED / 手机连接已失效` e não entrou na página inicial de projeto (esta rodada não é o erro TLS anterior). A criação real/árvore de arquivos/marca de acesso no celular continua não aceita, e não se conta a tela estreita do desktop nem o teste de componente como aprovação dolink do celular; a autenticação não foi alterada nem o limite de shared-host contornado.

Revisão final: depois de simplificar o estado de pin em trânsito, os testes unitários relacionados passaram em 16 arquivos / 73 itens, e o typecheck raiz passou novamente. O E2E de lista reconstruído `desktop-e2e-20260911054637517-p44337-88f4615fa4853a48` passou em 3/3, incluindo continuar visível depois de cancelar a fixação, a não lida recolhida, o recarregamento de preferências e as capturas atualizadas em 1200/390 nos temas claro/escuro. Combinado com os 11/11 do arquivo principal, 14 casos passaram no desktop; as limitações do AUTH_FAILED no celular e da sincronização real por SSH/WSL permanecem registradas.

Registro de consolidação arquitetural: os módulos alterados são project-sidebar (UI), remote-projects (contract de adapter e projeção somente-leitura) e a montagem existente do Host. CLI/Host mantêm o escritor único original; a UI possui apenas preferências, alvo de exibição e intenção em trânsito. O caminho de comando segue o windowController/zcodeTaskService, a limpeza de UI de arquivamento e os diálogos de sincronização remota, e desktop continuous / mobile replayable não muda. O portão final deu baseline/new/violations todos em 0; nesta rodada, o TypeScript com testes adicionou 2085 linhas e removeu 391, líquido de 1694 linhas. A checagem de formatação e de diff dos 44 arquivos desta tarefa passou; a modificação de espaçamento do ProjectNode já existente no workspace não foi incluída neste commit.

### D103 a primeira migração perde a ordem dos projetos das settings antigas

O usuário espera que, após o upgrade, os primeiros projetos ainda sejam os da lista antiga de setting.json. A UI antiga restaurava a ordem a partir de lastWorkspaceSession, mas a primeira migração colocava primeiro a consulta DISTINCT sem ordenação de tasks dentro de um Map e só depois anexava as settings; o set do Map não altera a ordem de inserção para uma key já existente, o que empurra os diretórios históricos para a frente. A correção dá prioridade à ordem de settings apenas na primeira conversão de dados do project-storage e depois anexa de forma estável os diretórios históricos e os Groups válidos; projects.position continua sendo o único fato de ordem do Host, e a UI não ganha um segundo estado de ordenação. recentProjects não é a origem da ordem da barra lateral. Bancos que já têm ledger não são migrados de novo nem têm a ordem de arrastar do usuário sobrescrita, e SQL/checksum não mudam.

Verificação: primeiro foi adicionada a regressão, e os dois casos (owner local e do Server) reproduziram o erro de ordem; após a correção, 4 arquivos / 24 testes de armazenamento passaram, incluindo salvar projeto vazio, diretório duplicado, exclusão de conversation, Group posteriore e preservação da ordenação manual na nova inicialização. O novo cold start real VP28 passou em 1/1 em `desktop-e2e-20260911060959726-p55732-d1c9097e6416a7e4`, com asserções de ordem no DOM/SQLite e de refresh, e verificação manual das capturas; o typecheck raiz, o typecheck de E2E, a fixture check e o lint (48 avisos existentes / 0 errors) passaram. Apenas a atualização local do desktop foi verificada; o owner do Server tem evidência de teste unitário, e esta verificação não foi contada como aceitação de pareamento de celular ou de composição remota.

Desvio de desenvolvimento: a nova asserção, colocada no contract.test original, ultrapassou o limite de 300 linhas da arquitetura e foi movida para migration-order/contract.test.ts dentro do módulo, sem elevar o limiar. Na divisão, tentou-se comparar o objeto inteiro de readTree, e a fixture antiga, sem traceId, gerou valores temporários diferentes; passou-se a comparar diretamente as linhas persistidas antes e depois da migração, sem afrouxar a asserção de persistência inalterada. O primeiro E2E reusado tinha uma build sem o bridge de teste; após reconstruir, o WebDriver estourou o tempo na criação de session e ainda não entrou no caso; depois disso, a reexecução com um HOME independente passou, sem ajustar as asserções de negócio nem aumentar timeouts do produto.

Consolidação arquitetural: a única alteração de produção é em project-storage/adapters, o escritor único da ordem é o repositório do Host, e a leitura das settings antigas ocorre apenas dentro da transação de migration já existente; o rollback em falha e o limite de idempotência na nova inicialização seguem o runner. desktop continuous / mobile replayable, o protocolo e os caminhos de comportamento da UI não mudam. Depois do staging, o portão deu baseline/new/violations todos em 0, e a checagem de formatação e de diff dos 12 arquivos passou. O código de execução adicionou 12 linhas e removeu 8, líquido de 4 linhas; o TypeScript com testes adicionou 199 linhas e removeu 8, líquido de 191 linhas.

### D104 o local precisa restaurar a entrada antiga para o usuário retestar a primeira migração

A auditoria somente-leitura confirmou que a position local ainda é o resultado da migração antiga, com default, DEMO e ZCodeProject na frente; nas settings de 10 de setembro preservadas, test-2, z-m, ios-demo e zcode-v4-ios ocupam hoje as posições 22, 29, 18 e 30 no banco atual. O setting.json atual foi derivado na ordem inversa a partir do erro e não pode servir de entrada anterior ao upgrade. O usuário exigiu explicitamente não editar a ordem na mão e aceitou reverter parte dos dados recentes, preferindo restaurar o backup antigo e fazer a própria validação na inicialização.

O snapshot completo disponível é `~/.zcode/backup/session-projects-20260909-141705/`: o índice de tarefas antigo tem 4078 linhas, sem tabela projects e sem schema_migration; os cinco primeiros projetos das settings antigas são z-m, ios-demo, test-2, zcode-v4-ios e ios-demo-2. Antes do rollback, o índice tinha 4111 linhas (33 novas, nenhuma linha antiga faltando), e entre as tarefas comuns 1 título, 1518 marcas de arquivamento e 17 valores de não lida diferem. A integridade da cópia original e a checagem de chaves estrangeiras passaram. Os dois backups automáticos de nível de tabela do tasks_index existentes têm zero linhas e não podem ser usados para a restauração local.

O snapshot antigo do CLI revelou ainda que o checksum de `0019_dwf_journal` difere do banco atual e que ele contém o `0020_dwf_run_result` de outro branch; como desta vez só se retesta a migração de projetos do app, o corpo atual do CLI é preservado, sem reverter seu schema e sem modificar o checksum. O CLI atual tem 5076 sessions e o snapshot antigo tem 5054; desta vez não houve sobrescrita de corpo.

Antes da execução, confirmou-se que não há processo segurando o app/banco, salvou-se um snapshot consistente do SQLite atual e das settings e só então se substituiu o índice de tarefas e o setting.json pelos arquivos completos do backup antigo; os arquivos originais e o WAL/SHM foram mantidos, e position, project_id e o ledger de migration não foram editados à mão. Backup e auditoria: `~/.zcode/backup/project-migration-retest-20260911-Siq1ag/manifest.json`. O SHA-256 dos arquivos restaurados é idêntico ao do backup antigo, palavra por palavra, o quick_check e a checagem de chaves estrangeiras passaram, o banco atual tem 4078 linhas e não tem projects nem ledger; o hash do arquivo principal do CLI e do WAL não mudou antes e depois.

Status: rollback feito, aguardando o usuário iniciar com o código atual; a migration não foi executada antecipadamente, e a checagem de restauração não pode ser contada como aprovação desta aceitação manual de upgrade. O snapshot de 9 de setembro é mais antigo que as settings de 10 de setembro preservadas, e a ordem original dos projetos deve ser aceita pelo setting.json de 9 de setembro restaurado nestaem conjunto. Apenas houve operações de dados local e atualização de documentação, sem alteração de código de produção.

### Correção da animação de recolhimento do projeto e da entrada de árvore de arquivos na linha de tarefa

O usuário apontou que a animação de recolhimento ficou de fora e que não é preciso o botão de árvore de arquivos à direita da session. A linha de projeto antiga controlava altura e fade por um Collapsible compartilhado, e a nova linha monta/desmonta diretamente conforme a condição expanded, o que contorna a animação compartilhada e o processo de saída. Reutiliza-se o componente original e a preferência original de recolhimento; remove-se a cadeia de callbacks que existia só para o botão de arquivo da tarefa, e a visualização de arquivos na linha de projeto é mantida. Primeiro se atualiza a spec, as asserções de componente e o E2E de animação real, e só então se implementa.

Revisão da evidência de animação: na primeira rodada, 4/4 E2E passaram, mas o registro de quadros mostra que o primeiro recolhimento partiu de 31.9px (altura completa de 188px), o que indica que incluía o quadro final da expansão do caso anterior e não permite confirmar de forma independente o fade-out de fechamento. O teste passa a esperar o Web Animations finished do próprio alvo e da camada de opacidade antes de clicar/amostrar, e salva a trajetória de fechamento antecipadamente; a lógica de temporização do produto não foi modificada.

Na segunda rodada, o fechamento partiu de 188px estáveis e a altura caiu continuamente até 0, mas a opacidade foi apenas 1→0 após a desmontagem, e o animationName interno permaneceu como enter quando closed. A causa raiz é que o seletor de grupo de mesmo nome do Collapsible compartilhado ainda casa com o open da seção externa do projeto, cobrindo o exit do projeto atual; passou-se a selecionar o filho diretamente pelo data-state do content atual. Evidência de falha: `desktop-e2e-20260911063306405-p72094-97c1a6aba044b6f0/project-collapse-close.json`. A segunda falha é que o projeto permanecia recolhido após a falha anterior e a linha de tarefa não era encontrada; não se mudou o produto para contornar isso.

Verificação final: depois de corrigir o seletor aninhado, `desktop-e2e-20260911063454327-p73583-868e8aab51e45e6a` passou em 4/4. O fechamento vai de 188px estáveis até 0, com exit e 35 quadros intermediários de opacidade; a expansão vai de 0 a 188px, com os mesmos 35 quadros intermediários de opacidade; e o clique reverso restaura a altura completa, a contagem de tarefas e a navegação. O ID de regressão foi reorganizado como VP29 (o relatório antigo da execução usava VP28), para evitar colisão com o caso já existente de ordem de upgrade. Os testes unitários relacionados passaram em 28 arquivos / 101 itens, e o typecheck raiz, o typecheck de E2E e a fixture check passaram; o lint ficou em 48 avisos existentes / 0 errors, e a architecture deu baseline 0 / new 0. A baseline do knip tem itens não usados já existentes e não foi registrada como aprovação; antes de remover o parser específico de tarefas, a confirmação de referências combinou rg de todo o repositório com dep:refs, e a checagem de tipos confirmou que a cadeia de chamadas foi limpa.

Escopo: apenas project-sidebar e a exibição do ui compartilhado foram modificados; a preferência de recolhimento e o request owner da árvore de arquivos não mudam; nenhum timeout, fila, cópia persistida, schema ou migration foi adicionado. O roteamento desktop continuous e mobile replayable não foi modificado; os testes de tela estreita/tema claro-escuro usam o renderer compartilhado e não contam como pareamento real de celular, Host remoto ou aceitação em outras plataformas.

Consolidação arquitetural: project-sidebar/ui e componentes do ui compartilhado, com baseline/new/violations em 0; o TypeScript de produção adicionou 199 linhas e removeu 368, líquido de menos 169 linhas. A checagem de formatação e de diff passou, preservando as mudanças não commitadas de outras tarefas do workspace.

### Omissão do seletor de projetos no campo de entrada (2026-09-11)

A captura do usuário mostrou que a barra lateral e o composer divergem nos candidatos de projeto. A leitura via CDP em runtime confirmou que a barra lateral tem 44 itens, enquanto o antigo ChatEmptyWorkspacePreviewMenu só recebeu a tab z-m já aberta; o filtro antigo ainda truncava nos 5 primeiros, comparava por cwd e mostrava o nome folha do diretório. A causa é que a refatoração não conectou essa entrada. Conforme a spec, o catálogo e a ordenação de projeto são compartilhados, o menu passa a buscar por identidade de projeto, nome e roots, e o texto de busca muda para "Buscar projeto". Não é preciso modificar banco de dados ou migration.

Depois que o menu passou a exibir tudo, a captura do desktop expôs que a altura fixa original do menu cortava a entrada do rodapé: passou-se a ter a lista de candidatos com rolagem própria e o footer sem encolher. Na verificação, o clearValue do WebDriver não disparou o input do React e o uso de teclado real foi adotado para limpar a busca; as coordenadas do clique direito nativo após o Emulation de layout ficaram instáveis, e a checagem de layout foi movida para depois da verificação de interação normal. No final, o E2E VP30 deu 1/1, os 54 testes unitários e as checagens de arquitetura/tipos/lint passaram, e o detalhe está na coverage matrix. `pnpm knip` continua reportando uma grande quantidade de itens não usados já existentes em todo o repositório, e nenhum código alheio a esta tarefa foi removido com esse pretexto.

### Ilusão de não lida em tarefas históricas de mesmo nome e título ausente no detalhe (2026-09-11, investigação somente-leitura)

O usuário relatou que o ponto de não lida de `sess_c9fe3101-8917-4968-9bcc-62452a655837` não sai e que a lista mostra `1111` enquanto o detalhe mostra "Nova tarefa". A leitura somente-leitura do SQLite, dos props React do Renderer e dos logs do dia deu:

- O CLI session.title e o Host tasks.cli_title são ambos `1111`, e o título não se perdeu. O Renderer tem realmente aberta outra sessão do mesmo diretório, `sess_92389c86-7b37-4966-9114-1a38617bbb0a`, com `resolvedActiveTaskMeta=null`; o `zcode-session.readSession` das 15:01:49.795 reportou `Session is not active` e, em seguida, a subscription de conversation do V4 das 15:01:50.945 teve sucesso. O cabeçalho ainda depende dos metadados antigos de workspace/query-cache e não consome a nova projeção da árvore de projetos; o failure do snapshot leve é capturado e posto como null, e o sucesso da subscription do corpo não volta a disparar esta leitura de título, o que resulta no título padrão.
- A configuração tem o arquivamento automático ligado, com retenção de 7 dias. A sessão `sess_92389…` aberta agora já está com `unread_at=NULL, archived=1`; `sess_c9fe…` continua não lida e não arquivada. Nos logs, entre 15:01:19–49 há aberturas consecutivas de várias tarefas históricas de mesmo nome com IDs diferentes, cada setTaskUnread com sucesso e sem chamada explícita a archiveTask. As linhas em memória do Provider de projeto são coerentes com os valores acima no banco, o que exclui que desta vez seja resíduo antigo de JSON de não lida ou cache de interface não atualizado.
- A cadeia é: clicar na tarefa antiga -> CAS limpa a não lida -> a árvore de projetos é refrescada -> o readTree executa archiveInactive -> a tarefa de 28 dias já lida, concluída e de 7 dias atende à condição de arquivamento -> a próxima tarefa de mesmo nome e não lida ocupa o lugar. O activeTaskRefs do Host contém apenas tarefas em estado não terminal e não inclui "a tarefa concluída que está sendo visualizada". Por isso o usuário percebe que o ponto azul na posição original nunca desaparece e o lado direito continua em uma tarefa já arquivada; se a tarefa em visualização precisa ser protegida tem de ficar explícito no contrato de interação do arquivamento automático, e não se pode resolver restaurando o cache antigo de não lida.

Arquivos localizados: `packages/services/src/project/index.ts` (readTree/autoArchive), `packages/services/src/zcode-agent/zcodeTaskIndexSyncer.ts` (activeTaskRefs), `packages/ui/src/hooks/useWorkspaceActiveTaskState.ts` e `useActiveTaskSnapshotMeta.ts`. Nesta rodada não se modificou a implementação nem o banco de dados do usuário.

### Registro de implementação do gerenciamento de arquivamento

A camada de settings e o WorkspaceShellLayout são nós irmãos, e o ProjectDirectoryProvider original só cobre a barra lateral/composer, de modo que embrulhar as settings em outro provider criaria dois owners de leitura. Elevou-se para o RootWorkspaceContent comum e deixou-se o Provider aninhado reutilizá-lo, mantendo a possibilidade de montar camadas shell independentes. O codegraph reportou duas vezes no such table: unresolved_refs, e a checagem de código-fonte limitada foi usada como substituta, sem corrigir o índice da ferramenta. A interface deleteTask do TaskService, cujo comentário antigo dizia ser apenas ocultação na lista, hoje delega a mutateSessionFacts(delete) do CLI; a implementação segue o fato de soft delete atual do CLI e não cria um novo tombstone local.

Na primeira rodada de Electron, 1/3: as asserções de gravação de arquivamento e remoção já passaram, mas depois se entendeu por engano que browser.refresh traria de volta a página de settings, e por isso a página de arquivamento nunca chegava. O log de execução confirmou que o app voltou ao workspace; o teste passou a reabrir as settings e então afirmar que as tarefas removidas não ressuscitam. Essa correção não alterou a navegação do app. O usuário então esclareceu explicitamente que o dropdown intermediário é o modo de ordenação, e a classificação por tipo de tarefa foi removida, mantendo apenas hora de atualização/hora de criação.

Verificação: os testes unitários relacionados passaram em 12 arquivos / 67 itens; o Electron final `desktop-e2e-20260911073549408-p8673-2d528e9e7a8486a5` passou em 3/3, incluindo ordenação real inversa por hora de criação/atualização, filtro de projeto virtual, reescrita ao desarquivar, cancelamento da confirmação de exclusão, time_deleted do CLI e cli_deleted do Host, resultado persistido após reabrir, exclusão em lote por escopo de busca, desarquivamento em grupo, além de capturas em 1200/390px claro/escuro e checagem de overflow. O typecheck raiz, o typecheck de E2E, a fixture check, o lint (48 avisos existentes / 0 errors) e o portão de arquitetura (baseline 0 / new 0) passaram. O pareamento real do celular, o Host remoto e Windows/Linux não foram executados, e as capturas em tela estreita não podem substituí-los.

O grafo semântico ganhou a nova surface de arquivamento, o owner compartilhado de diretório e a relação entre o adapter de mutação de tarefas; o YAML não tem ID duplicado, e o novo arquivo/símbolo de seeds existe. As quatro referências pendentes são idênticas às do HEAD e não há nenhuma nova nesta rodada; a varredura do codegraph continua indisponível por erro de índice, e a checagem estática não foi registrada como sucesso de análise de chamada do grafo.

Consolidação arquitetural: a implementação de arquivamento fica em managed project-sidebar/ui, com settings e Root apenas montando a entrada, compartilhando o owner de leitura de diretório e um único adapter de roteamento. O TypeScript de produção adicionou 617 linhas e removeu 42, líquido de 575 linhas; os arquivos novos foram todos incluídos no módulo, sem aumento de sincronização entre bancos ou migration.

### Correção do título da tarefa atual e do arquivamento automático (2026-09-11)

O usuário confirmou que, após a correção, vale a regra de rastreio de sete dias já existente, sem nova exceção de "a tarefa em visualização não é arquivada": quando a árvore do Host aceita uma mudança explícita de não arquivada para arquivada, ela reutiliza removeTaskState, e lista e detalhe atual saem juntos; a primeira leitura de um histórico já arquivado ainda permite a visualização explícita, e a ausência de linha offline não pode ser tratada como arquivamento. O CAS de não lida não tinha defeito nesta rodada, e a lógica original foi mantida.

O detalhe removeu o antigo useActiveTaskSnapshotMeta e a antiga concatenação de lista/query-cache, passando a ler o índice do Host pelo getTaskMeta existente com escopo de workspace. O CLI continua sendo o único escritor de título, e o Host é apenas um espelho; a restauração do corpo no V4 foi desacoplada da leitura de título, sem mudança de schema/migration. A árvore de projetos continua sendo o único owner de leitura de lista, e os dois snapshots aceitos comparados não são um novo armazenamento de estado de arquivamento.

Descoberta adicional durante o desenvolvimento: decidir a elegibilidade da requisição de título apenas por objeto de service + workspaceKey + taskId não cobre o caso de attachment reconstruído que reutiliza o service. Primeiro se acrescentou um teste unitário com falha e depois o remoteSessionId passou a integrar a identidade de leitura; a atualização fora de ordem da mesma tarefa e a limpeza do primeiro quadro ao trocar de tarefa também estão cobertos.

Evidência de execução: o primeiro E2E isolado concluiu o getTaskMeta às 15:35:09.849 (0.6ms) e o subscribe do V4 só às 15:35:12.339 (2484.8ms), com o corpo histórico real e o E2E_AMT_COLD_TITLE exibidos normalmente; não houve requisição readSession de título. A primeira falha da segunda rodada foi porque o teste usava um ID de sidebar-settings inexistente, e a troca para o TID_TASK_SETTINGS_BUTTON público fez os dois casos do desktop passarem. Todos os fixtures gravaram no HOME isolado zcode-active-task-e2e-*, sem modificar o banco de dados do usuário. A verificação final e os artefatos estão na AMT coverage matrix.

### Pedido adicional do usuário para restaurar o banco original do CLI (2026-09-11)

Depois de restaurar novamente o índice/settings do app, o usuário exigiu explicitamente que cli/db/db.sqlite também voltasse ao mesmo backup de 9 de setembro às 14:17. Confirmou-se que não há processo de app usando o banco, salvou-se primeiro um snapshot consistente e só então o arquivo completo do CLI foi substituído offline; o arquivo original e o WAL/SHM foram mantidos, sem apagar corpo tabela por tabela e sem modificar migration ID/checksum. Backup e auditoria: `~/.zcode/backup/cli-migration-retest-20260911-EQXKVM/`. Antes da restauração, session/message/part eram 5076/71350/239427, e depois 5054/71269/239180; o SHA-256 do arquivo restaurado é igual ao do backup antigo, e o quick_check e o foreign_key_check passaram. O hash do índice de tarefas do app e das settings não mudou antes e depois.

As migrations em comum entre o banco antigo e o anterior à restauração ainda mostram diferença de checksum em `0019_dwf_journal`, e o banco antigo contém também o `0020_dwf_run_result` de outro branch; por exigência do usuário a entrada real antiga foi preservada, sem modificar o ledger para contornar a checagem. O app não foi iniciado nem a migration executada, aguardando o teste manual do usuário; a restauração bem-sucedida não representa aprovação da verificação de upgrade desta versão antiga do CLI.

### Nova restauração em conjunto do índice de tarefas e do CLI (2026-09-11)

O usuário pediu novamente a restauração dos dois bancos, usando o snapshot completo `session-projects-20260909-141705` e restaurando junto o setting.json antigo correspondente. Após o backup offline, o tasks-index.sqlite voltou de 4092 para 4078 linhas e sem a tabela projects; e o CLI voltou a 5054 sessions, 71269 messages e 239180 parts (os mesmos contagens de antes desta restauração). Os arquivos restaurados dos dois bancos têm SHA-256 igual ao da origem, e o quick_check e a checagem de chaves estrangeiras passaram; na fase do CLI foi confirmado que o arquivo do app recém-restaurado não mudou. O snapshot atual, os arquivos originais e os arquivos anexos foram salvos separadamente em `~/.zcode/backup/project-migration-retest-20260911-ZeaZCj/` e `~/.zcode/backup/cli-migration-retest-20260911-PBjmXq/`, com o README e o manifest registrando esta auditoria. O ledger de migration não foi modificado nem a ordem ajustada à mão, e o app não foi iniciado nem a migration executada, ficando para o usuário testar.

### O ponto de disparo do arquivamento automático se desliga da consulta da árvore de projetos (2026-09-14)

O usuário relatou que `sess_aa1fce05-2987-4915-86f7-69a5fd18f669` não abre. As linhas dos dois bancos, o projeto e o diretório estão normais; o CDP reproduziu no app dev: 22:08:04.86 setTaskUnread limpa a não lida → 22:08:05.10 a subscription do V4 começa → 22:08:05.34 o refresh da barra lateral com readTree dispara archiveInactive → 22:08:06.28 a árvore de projetos vai de false→true chamando removeTaskState, e o detalhe volta ao rascunho. Essa sessão foi concluída em 24 de julho e o usuário tinha o arquivamento automático de 7 dias ligado; até então só escapava do arquivamento por estar não lida. Outras quatro sessões de mesmo nome abertas por volta das 22:00 daquele dia foram igualmente arquivadas. Decisão do usuário: tarefas que atendem ao critério já não deveriam estar na lista, e a decisão de arquivamento não pode ser disparada pelo clique em uma session.

Tratamento: novo varredor periódico do Host `packages/services/src/project/autoArchiveScheduler.ts` (primeira rodada após a montagem do serviço + a cada hora + varredura adicional após mudança de `taskAutoArchiveEnabled` / `taskAutoArchiveOlderThanDays`, com varredura serial e as concorrentes mescladas em uma única varredura adicional, sem iniciar em desktop-attached-remote), e o `readTree` perde o efeito colateral de `autoArchive`; também foram removidos a entrada `beforeRead`, sem injeção de ninguém, e os valores `auto_archive` / `realtime_sync` de `workspace_task_list_changed.reason`, que não tinham emissor. Não se cria a exceção "a tarefa em visualização não é arquivada", seguindo a decisão de 09-11. O AMT02 foi reescrito como: com o arquivamento de sete dias ligado, a tarefa antiga já lida é arquivada pela varredura da mudança de settings e sai da lista; abrir uma tarefa antiga não lida apenas limpa a não lida e a mantém aberta.

Verificação: 5 testes unitários do varredor (primeira rodada/intervalo/dispose, política desligada e broadcast só quando há mudança, mesclagem concorrente de varredura adicional, continuação do intervalo após falha, determinação pela chave de settings) mais 4 arquivos e 27 testes relacionados de serviço/projeto/repositório/UI de limpeza de arquivamento passaram; o conjunto afetado de testes unitários passou em 1772 arquivos / 15405 itens, com a única falha sendo a asserção de lista de migration de `taskIndexRepoWorkspaceIdentity.test.ts`, que não tinha o `0006_default_workspace_tasks` já registrado no branch (fd0061d734, sem relação com esta rodada). O E2E de desktop `desktop-e2e-20260914-143027-962` passou em AMT01/AMT02 2/2, e os AMT-facts foram: tarefa antiga já lida com archived=1, tarefa antiga não lida com unread_at preservado ao ser aberta e archived=0, e activeTask ainda apontando para aquela tarefa. O typecheck raiz, o desktop typecheck:e2e e o lint (48 avisos existentes / 0 errors) passaram; a única violação nova do portão de arquitetura é o arquivo não gerenciado `packages/ui/src/root/resolveConversationWorkspaceTarget.ts`, já existente no branch e sem relação com esta rodada. O controle remoto real pelo celular e o Host remoto por SSH/WSL não foram reexecutados; o Host remoto e o local passam pelo mesmo código de montagem, e o attached-remote não inicia o varredor.

### O critério do arquivamento automático passa a ser puramente temporal (2026-09-15)

Depois do reinício para o novo Host, as tarefas antigas abertas pelo usuário abriram normalmente e não foram mais limpas (11:18, seis subscribe OK, sem "limpeza após arquivamento"), mas na captura a `113413423` de 31 dias atrás continuava na lista. Consulta ao banco: essas linhas têm `cli_last_outcome='error'`; entre as tarefas locais lidas e não arquivadas fora do prazo há 324 com error e 346 sem resultado no CLI (no lado do CLI também NULL, e não uma falta de espelhamento), e as completed são apenas 6, todas lidas no mesmo dia. O critério antigo só arquivava as completed, então essas tarefas nunca sairiam da lista. Decisão do usuário: arquivar puramente por tempo, e a fixação no topo não é afetada.

Tratamento: `archiveInactive` deixa de usar `unread_at IS NULL` e `cli_last_outcome='completed'`, mantendo os filtros de pinned / deleted / cli_deleted / host e a proteção de `activeTasks` em execução; o intervalo de varredura foi de 1 hora para 5 minutos; e o texto em português e inglês da página de settings passou a ser "a última atividade que ultrapasse o período de retenção é arquivada, e a fixação no topo e a execução em andamento não são afetadas". O AMT02 foi reescrito como a combinação de 28 dias antes lida/não lida/fixada no topo + 6 dias antes não lida.

Verificação: 5 arquivos e 38 testes unitários de repositório/varredor/serviço de projeto/UI de limpeza de arquivamento passaram; o E2E de desktop `desktop-e2e-20260915-035508-416` passou em AMT01/AMT02 2/2, e os AMT-facts foram: tarefas lidas e não lidas de 28 dias antes com archived=1 (a não lida preserva unread_at), tarefa antiga fixada no topo com archived=0/pinned=1, tarefa de 6 dias antes com unread_at=NULL e archived=0 ao ser aberta, e activeTask ainda apontando para aquela tarefa. O typecheck raiz, o desktop typecheck:e2e e o lint (48 avisos existentes / 0 errors) passaram. No momento do commit, outra sessão estava fazendo stage no mesmo workspace da funcionalidade de invalidação do diretório principal, e desta rodada usou um index temporário para commitar apenas os hunks desta sessão, sem envolver as mudanças dela.
