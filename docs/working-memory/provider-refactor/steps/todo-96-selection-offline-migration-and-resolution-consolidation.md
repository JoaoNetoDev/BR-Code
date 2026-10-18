# Tarefa 96: Migração offline de Model Selection e consolidação da resolução da seleção efetiva

> Estado: implementação consolidada; 2026-09-09. A migração offline, a proteção da intenção original e o despacho ao destino foram concluídos; a integração final de Subagent explícito foi feita pela Tarefa99 por meio da resolução pública local do Worker e injeção de dependência, com evidência de execução Pro, sem mais esperar a decisão sobre o antigo esquema de Host RPC. O processo consta em [registro de execução](../research/todo94-97-execution-and-review.md); a continuação consta em [ledger da Tarefa99](../research/todo99-implementation-review.md). A verificação residual entre dispositivos foi transferida de forma unificada para a Tarefa102, sem alegar aprovação em todos os dispositivos.
> Decisão central: exceto para tarefas ociosas, a migração da Selection antiga não depende da conexão atual, do login, dos direitos ou da configuração de modelos do Provider. A migração preserva a intenção original; a disponibilidade atual e o vínculo com a conta são obtidos de forma unificada via `getView({ selection })`, que retorna a View e a effectiveSelection. Uma falha temporária do Provider não pode destruir a seleção original, especialmente no cenário remoto SSH.

> Decisão posterior: a [Tarefa 97](todo-97-subagent-markdown-in-place-migration-and-legacy-read-audit.md) passou a migrar o Markdown de Subagent no diretório de dados do usuário dentro dos campos originais `model` / `thoughtLevel`, que são mantidos oficialmente, substituindo a restrição antiga deste documento de que o Markdown não é reescrito automaticamente no diretório do usuário; projetos, plugins e todas as outras origens não têm migração nem escrita de retorno automática. Formatos intermediários nunca publicados não recebem compatibilidade; os campos antigos servem apenas à migração, e toda a cadeia de migração da Selection é reavaliada em uma revisão dedicada. O “campo atual tem prioridade” deste documento vale apenas para o formato oficial final e não autoriza manter o estado intermediário `modelSelection` do Markdown. A integração da execução da seleção efetiva continua sob responsabilidade desta Tarefa.

## 1. Novas decisões e escopo

- BigModel / Z.ai Coding Plan antigo migra fixamente para o **Individual Provider do mesmo domínio**, sem decidir mais a identidade com base na conexão pessoal/Team vigente no momento da migração. Individual é apenas o ponto de chegada determinístico da intenção antiga; não significa que as requisições históricas usaram plano pessoal, e não ativa nem troca a conexão da conta.
- A resolução da seleção efetiva existente correlaciona depois ao Provider de Conta atual o mesmo modelo e o mesmo nível; não se cria um mecanismo substituto de Provider nem se deixa a validação do Registry trocar o Provider silenciosamente.
- Modelos ou níveis atualmente indisponíveis não impedem a migração da intenção antiga; o resultado efetivo temporário ainda pode estar vazio ou sem nível.
- A migração de tarefas ociosas e o vínculo Provider/Ticket ficam fora desta rodada; não migrar mecanicamente para plano pessoal.
- Não criar novas opções lógicas de Selection Account / Off-Peak; essa discussão está suspensa. Não criar formato de persistência de Selection nem versão de armazenamento para concluir este item.
- Não corrigir automaticamente registros novos que a implementação antiga já esvaziou, nem sobrescrever o campo atual a partir do arquivo antigo. Se for preciso recuperar dados corrompidos já existentes, confirmar o escopo exato separadamente.

Esta Tarefa altera as decisões em [Tarefa 72](todo-72-legacy-builtin-provider-and-model-selection-migration.md) §3.2/§4 sobre “migrar o Coding Plan antigo com base na conexão já conectada”; segue a resolução pública, a proteção da intenção original e a autoridade do Host de destino de [Tarefa 87](todo-87-selection-view-unified-resolution.md), e completa as entradas; conecta-se à recuperação histórica e à fronteira de Subagent da [Tarefa 88](todo-88-provider-audit-regression-repair.md). O documento antigo descreve decisões/implementações anteriores, portanto este plano não pode ser marcado como implementado.

## 2. Problemas atuais levantados na investigação

| Entrada/fronteira | Fato atual | Tratamento neste item |
| --- | --- | --- |
| Conversão de identidade antiga compartilhada | O ramo de Coding Plan antigo em `legacy-model-provider-identity.ts` depende de `currentAccountAccess` | Passar a um mapeamento determinístico, removendo o contexto de conta que existia só para a migração |
| Montagem no Host | `readMigrationAccountAccess` em `node.ts` passa pela preparação de configurações de conta e pela identidade de login; no Team antigo sem organização, ele ainda pode esperar indiretamente por consultas OAuth | A migração da Selection não passa mais por essa cadeia; a migração de conexão independente e a autenticação real são mantidas |
| Session | Após a migração de formato/identidade, o caminho de restauração em `create-app.ts` valida diretamente a Selection original e devolve vazio em caso de falha | A intenção original precisa chegar à resolução pública e não pode ser descartada antes da entrada; o vínculo de execução continua sendo validado estritamente |
| Tarefas agendadas | A importação das colunas antigas não consulta a lista de modelos, mas o callback Built-in antigo ainda depende da conta; SQL NULL preserva a fronteira de retry | Importação pura, prioridade do campo atual e CAS; o resultado efetivo atual é usado na fronteira de despacho original |
| Bot | A string antiga precisa acertar a lista de candidatos atual; a seleção estruturada de mesmo conteúdo não precisa. Após escrever v3 na primeira importação, o arquivo antigo não é mais lido | Remover o portão da lista de candidatos, evitando perder permanentemente uma intenção explícita apenas por indisponibilidade temporária |
| Armazenamento Wiki/Subagent | A ID de conta antiga é convertida por callback do Host; quando não é possível determinar, a intenção antiga pode ser mantida | Usar uma conversão pura; a integração real da execução é verificada à parte pela seção 5 |

Evidências da investigação somente leitura: a conversão pura/O SQLite em memória e o resolver injetado reproduziram o Coding Plan antigo variando com a conexão atual, a perda da seleção antiga em string quando a lista de candidatos do Bot está vazia, e a importação de Automation sem checar modelo/nível antigo após confirmar a identidade. Nenhuma escrita foi feita em dados reais de usuário; essas são reproduções do estado atual, não a aceitação de implementação desta Tarefa.

## 3. Camada de migração: converter apenas fatos antigos determinísticos

| Identidade de entrada | Saída fixa |
| --- | --- |
| `builtin:bigmodel-coding-plan` | `account:bigmodel-individual-coding-plan` |
| `builtin:zai-coding-plan` | `account:zai-individual-coding-plan` |
| `builtin:bigmodel` / `builtin:zai` | Mantém `bigmodel-api` / `zai-api` |
| IDs antigos de Start Plan dos dois domínios | Mantém o `account:<family>-start-plan` correspondente |
| ID atual formal, IDs customizados explícitos de Provider | Preservados como estão, sem exigir que o Provider atual exista |
| IDs indecodificáveis, identidade não confirmável, IDs aposentados sem correspondência | Mantém a fronteira não vinculada/incompleta existente; não adivinha Provider nem recorre ao padrão |

1. A ID do modelo é preservada como está; apenas níveis de raciocínio determináveis são trazidos de formatos
   realmente antigos. Não remover nem preencher nível padrão porque a configuração atual não o suporta.
2. A migração não pode ler a conexão de conta atual, a identidade de login, os direitos, o Registry, a Selection
   View nem os candidatos de modelo; ler registros antigos e mapeamentos estáticos de identidade é permitido.
3. A entrada de migração deixa de depender de um `ZCodeAccountAccess` completo; a conversão estática não espera
   login, rede, conectividade remota nem inicialização de Provider.
4. A validação de formato é preservada. JSON inválido ou tipos de campo errados não são “modelo temporariamente
   indisponível” e não podem ser engolidos por um parsing permissivo deste item.
5. A prioridade do campo atual já existe; um apagamento explícito não ressuscita, e um valor novo corrompido não
   é reparado pelo campo antigo ao lado. Identidades antigas `builtin:*` explícitas, mesmo armazenadas em campos
   estruturados, continuam sendo reconhecidas conforme a fronteira de upgrade estabelecida.
6. A migração é idempotente e preserva a fronteira de rollback já definida de arquivos/campos antigos e as
   proteções CAS/transação originais; não reescreve mensagens históricas em massa nem mantém escrita dupla
   contínua antiga/nova.
7. A migração das configurações de API/Team da conta atual, a consulta OAuth e o próprio pedido de credenciais
   não são cancelados. Remove-se apenas a dependência deles em relação à conversão de formato/identidade da Selection.

## 4. Resolução pública e os três estados

```text
Registro antigo
  |
  v
Migração de formato offline / identidade determinística
  |
  v
Selection original persistida / rascunho mais recente do usuário ------------ preserva a intenção original
  |
  + configuração e fatos de conta já aplicados no Host de destino
  v
getView({ selection })
  +--> View de candidatos
  `--> effectiveSelection / selectionIssue ---------------------- disponibilidade temporária
               |
               v
        aceitação / primeiro despacho, fixando a escolha concreta
               |
               v
        validação final por ModelFactory / Registry ------------ autoridade de execução
```

- A correspondência de conta, o esvaziamento por modelo indisponível e a remoção de nível indisponível limpam
  apenas o nível, reutilizando a semântica da resolução pública existente. Um Provider comum não ganha
  correspondência por nome entre Providers; ausência de modelo não pega o primeiro item e nível inválido não
  recebe o nível máximo.
- Remover verificações de disponibilidade duplicadas e esvaziamentos antecipados nas entradas de restauração/
  exibição; não basta apagar a validação e continuar perdendo a entrada original. A intenção original precisa
  chegar intacta ao `getView`.
- A validação final de construção do modelo e a proteção de vínculo em runtime são preservadas; é proibido
  enfiar uma seleção original inválida diretamente no Runtime só por “unificar”.
- Leitura, atualização e falha não escrevem vazio na intenção original. Ao salvar texto, título ou outros campos
  irrelevantes, não sobrescrever a seleção original com uma effectiveSelection temporariamente vazia.
- Limpar/alterar a escolha no Composer só muda a intenção do rascunho atual e resolve novamente imediatamente
  com o novo rascunho; apenas o clique no menu ou a atualização da View não pode escrever de volta a
  seleção/Recent formal da sessão.
- A seleção formal/Recent só é atualizada com a seleção efetiva realmente enviada quando o envio seguinte for
  aceito com sucesso, sem esperar a geração terminar. Envio não realizado ou envio com falha não sobrescrevem
  a seleção formal anterior. Um rascunho de limpeza ainda incompleto não pode receber automaticamente um modelo
  padrão e ser enviado.
- A persistência do próprio rascunho entre reinícios é outra camada: este item não remove o mecanismo existente
  de salvamento de Draft; mesmo salvando o rascunho, só se salva a intenção do rascunho do usuário, nunca uma
  effectiveSelection temporariamente vazia como substituta, e jamais se atualiza por isso a seleção formal da sessão.
- Página de configurações, edição de tarefas agendadas/Bot/Subagent continuam persistindo por suas próprias ações
  explícitas de salvar/enviar, sem serem forçadas a “aguardar o envio de mensagem”. A verificação de escrita de
  retorno após envio bem-sucedido confirma que a intenção original e o escopo não foram substituídos por edições
  posteriores; não se cria um mecanismo global de escrita de retorno automática.
- A configuração de longo prazo das tarefas agendadas só muda na fronteira original de edição e salvamento
  explícitos; a execução desta rodada é congelada na fronteira original de primeiro despacho. Execuções já fixadas,
  Active Model e requisições históricas não são reinterpretables.
- “Migração incompleta / intenção original indisponível” não equivale a “nunca foi especificado um modelo”; as
  regras originais de padrão/herança são preservadas, mas a primeira situação não pode entrar silenciosamente na
  execução padrão.

## 5. Lista de implementação por entrada (resolução compartilhada, sem efeitos colaterais de salvamento compartilhados)

| Nível / entrada | Ponto compartilhado, sementes de mudança | Exibição/intenção e ponto de gravação | Fronteira preservada |
| --- | --- | --- | --- |
| Obrigatório: Session/Composer | `model-selection-migration.ts` do Agent, `create-app.ts`, cadeia de retorno do Host, `SessionPane` e o hook de View compartilhado | Limpar/alterar a escolha só muda o rascunho; a seleção/Recent formal é atualizada após o envio ser aceito; a persistência do próprio Draft é tratada à parte | A seleção original não se perde porque o Runtime ainda não consegue vincular; edição concorrente vence resultado tardio |
| Obrigatório: Automation | `automationSelectionMigration.ts`, `automationRepo.ts`, `automationModelSelection.ts`, controle de seleção compartilhado da página de edição | Importa colunas antigas nas colunas atuais; separa configuração de longo prazo de cada execução | O primeiro despacho consome o resultado efetivo e não reinterpreta execuções já congeladas |
| Obrigatório: Bot | `storageMigration.ts`, `bots/repo.ts`, `botsService.ts`, interação de seleção | Config/State com armazenamento v3 próprio; o resultado efetivo é usado só pela interação/execução correspondente | Candidatos vazios não apagam a intenção já decodificada; perda de conexão remota não adota estado local |
| Obrigatório: Wiki | `repoWikiStorage.ts`, resolução da seleção de geração de Wiki e controle compartilhado | A leitura preserva a intenção; a nova geração usa o resultado efetivo | Não altera corpo/orçamento de saída (Tarefa 94); a migração do arquivo antigo em uma única gravação é retomada pela Tarefa97 §8; depois da leitura não há escrita de retorno |
| Obrigatório com integração à parte: Subagent | `subagentsService.ts`, inicialização do perfil do Agent, caminho de inicialização com modelo explícito | Separa a substituição interna/o Markdown da intenção original do modelo real desta subtarefa | Não basta alterar a página de configurações; modelo não especificado herda da tarefa pai e o Markdown não é reescrito automaticamente |
| Verificar: Recent/Default/outros rascunhos | Reader existente, caminho de salvamento após chamar a resolução pública | Preferência/proprietário de rascunho existente | Trata apenas o formato antigo realmente existente, não cria novo migrador por causa de tipos compartilhados nem altera o comportamento de padrões totalmente novos |
| Excluir: ocioso | Resolver, Repo e Ticket dedicados a Off-Peak existentes | Mantém o processo original | Não revincula entre domínios, não troca bilhete nem aplica a migração do Coding Plan comum |

**Fronteira adicional do Subagent:** o modelo explícito atual é validado de forma independente dentro do Agent e
não chama o `getView` do Host. Depois de migrar uniformemente para Individual, o cenário Team atual precisa
obter o resultado efetivo correto; não se pode considerar isso concluído como “remover uma verificação redundante”.
Primeiro é preciso esclarecer os pontos de integração reutilizáveis entre Host/Agent; se for necessário adicionar
ou estender o protocolo App–Agent, submeter o contrato concreto para decisão do usuário e só então implementar.
Não é permitido adicionar outro conjunto de resolução de conta dentro do Agent nem anunciar suporte de UI como
suporte de backend. Enquanto este item não for resolvido, todas as entradas não podem ser marcadas como unificadas
e concluídas.

## 6. Proteções em destaque para SSH / Web

```text
SSH desconectado / Provider ainda não sincronizado / estado da conta anormal
        |
        +--> dados antigos ainda podem ser migrados de forma pura, a intenção original é preservada
        `--> a View de destino não está pronta ou o resultado efetivo está incompleto: não executar

Host de destino se recupera / chega um evento de configuração
        |
        v
Chamar a leitura pública novamente com a Selection original preservada
        |
        v
Recuperar o resultado efetivo atual, em vez de depender de valores já esvaziados
```

- A UI e o backend consomem o resultado autoritativo do Host de destino, sem usar o Provider local para
  escolher por um remoto desconectado; a migração offline também não inicia ativamente uma conexão SSH.
- Separar View não pronta/erro de leitura de View pronta porém indisponível, seguindo o hook público de
  notificação e o mecanismo de recuperação, sem adicionar polling, espera infinita ou barreira de sincronização
  antes do envio.
- Preservar o isolamento `workspaceIdentity?.trim() || workspacePath` e a fronteira do remoteSessionId.
  Locais com o mesmo caminho e remotos diferentes não podem misturar seleções.
- Desktop continuous, celular web-remote replayable e shared-host attachment não mudam; este item não refaz a
  recuperação de mensagens nem o agendamento entre Hosts.

## 7. Casos de aceitação e ordem de execução

| Caso | Condição / ação | O que deve provar | Evidência |
| --- | --- | --- | --- |
| SM96-01 | A mesma seleção antiga, migrada separadamente sem login, pessoal, Team, Start, outro domínio de conta e configuração de Provider vazia | Nova Selection equivalente byte a byte; dependências de conta/Registry/rede não chamadas | Conversão pura parametrizada, testes unitários de cada importer |
| SM96-02 | Coding Plan antigo migra fixamente para Individual e o Team atual tem o mesmo modelo/nível | Seleção efetiva do Team obtida via `getView`; não é preciso Individual disponível | Resolução pública, integração de restauração de Session e E2E de UI |
| SM96-03 | Provider/modelo ausente temporariamente ou nível sem suporte; ler e salvar outro conteúdo e então restaurar a configuração | Intenção original preservada; resultado efetivo esvaziado por camada e recuperável; sem execução padrão | Comparação antes/depois do armazenamento, testes de UI/serviço |
| SM96-04 | Lista de candidatos vazia na primeira importação do Bot; usar seleção antiga em string e estruturada | Provider/modelo/nível explícitos preservados em v3, sem perda no reinício; arquivo antigo inalterado | Testes de importação/reinício de arquivos do Bot |
| SM96-05 | Leitura e despacho de tarefas agendadas, Wiki e Bot; execução já congelada | A leitura não produz escrita de retorno de seleção; cada fronteira de envio correta; registros congelados não mudam | Integrações de cada área, E2E de interação representativa |
| SM96-06 | Reconexão SSH, configuração ainda não sincronizada, falha de conta e posterior recuperação; modelo local diferente | A migração não espera SSH nem toma emprestado o local; registro original inalterado e nova resolução possível após recuperação | Fixture remota isolada, protocolo/armazenamento e seleção efetiva real |
| SM96-07 | Campo novo presente, apagamento explícito, campo corrompido; usuário altera a escolha durante a migração | Não relê campos antigos nem adivinha o padrão; CAS/transação não sobrescrevem edições novas | Testes de concorrência/prioridade de armazenamento |
| SM96-08 | Coding Plan antigo em Subagent explícito com Team atual; testar também modelo não especificado | A execução real do Agent adota o resultado efetivo unificado; comportamento de herança preservado | Integração do Agent após a decisão do esquema de integração, sem substituir por testes da página de configurações |
| SM96-09 | Tarefas ociosas, Ticket e requisições históricas já existentes | Nesta rodada não houve mudança de identidade/bilhete/registro de execução | Revisão de diferenças e regressões existentes |
| SM96-10 | Alterar/limpar a escolha no Composer sem enviar, envio com falha e depois envio bem-sucedido; editar o rascunho novamente nesse intervalo | Cliques e falhas não atualizam a seleção/Recent formal; só o envio aceito salva a escolha realmente enviada, e resultado tardio não sobrescreve o novo rascunho; o salvamento de Draft não se mistura com a seleção formal | Asserções em camadas de rascunho/Session/Recent e E2E de interação |

1. Atualizar a especificação de fatos relevante e as cláusulas substituídas da Tarefa 72/87/88, preservando o
   rastro das decisões históricas; registrar o esquema de integração do Subagent. UI/API/armazenamento não recebem
   novas opções lógicas suspensas na rodada anterior.
2. Escrever primeiro os testes de migração pura sem dependência do ambiente atual e então modificar a conversão
   compartilhada e cada chamador, removendo a validação de lista do Bot.
3. Conferir ao longo de cada entrada o caminho “entrada original -> View -> resultado efetivo -> salvagem/execução”,
   completando testes e consolidando a lógica duplicada. Não basta apagar todas as validações do Registry.
4. Integrar o Subagent (se houver mudança de protocolo, decidir antes); após a conferência, remover callbacks,
   parâmetros e RPCs de migração que realmente não têm consumidores. Consultar referências antes de limpar e
   proibir manter metade do comportamento de backend só para preservar um RPC.
5. Na fase de implementação usar os correspondentes AGENTS, UI DESIGN e E2E; atualizar o diretório/matriz de
   cobertura de Session e executar `pnpm typecheck`, `pnpm lint`, os testes unitários relacionados e E2E em
   MacBook Pro. Usar dados antigos isolados/conta simulada, sem validação destrutiva em dados reais de usuário.
6. Fazer uma segunda revisão da escrita de retorno de dados, do isolamento de identidade remota e da seleção
   realmente usada na requisição. Registrar o que passou, o que não foi executado, falhas de ambiente e itens
   pendentes de decisão, e só marcar como concluído após a submissão.

## 8. Registro de execução e decisões

| Item | Estado atual | Requisito de consolidação |
| --- | --- | --- |
| Migração offline unificada e ponto de chegada Individual fixo | Implementada, regressão direcionada aprovada | Substitui a antiga regra de vínculo com a conta atual; o resultado de todos os importers é independente do ambiente |
| Resolução pública de View e proteção da intenção original | Implementada; Subagent explícito concluído pela Tarefa99 | Remover regras duplicadas, preservando a validação final de execução e as fronteiras normais de salvamento |
| Primeira importação do Bot dependente de candidatos | Corrigido e verificado | Arquivos novos não cristalizam mais a indisponibilidade temporária como vazio |
| Integração de execução do Subagent explícito | Concluída e verificada pela Tarefa99 | Facade/DI público local do Worker; resolução explícita, herança implícita e override interno permanecem congelados; não se adota a antiga proposta de Host RPC por requisição |
| Tarefas ociosas / opções lógicas Account e Off-Peak | Excluídos | Não implementados como efeito colateral |
| Recuperação de registros novos já esvaziados | Excluída, decisão separada se necessário | Não reimporta automaticamente arquivos antigos |
| Testes unitários/integração/E2E Pro/segunda revisão | Núcleo aprovado; evidência posterior do Subagent explícito na Tarefa99 | A verificação SSH/celular residual foi transferida para a Tarefa102 e deixa de ser pendência independente desta Tarefa |

O mapeamento da superfície de impacto segue a semente model-selection do feature-boundary-planner e as cadeias de
chamada existentes. Não há ferramenta de codegraph neste momento; a investigação usou leitura de código
direcionada e reprodução em memória, sem alegar verificação de grafo de chamadas completo. O grafo funcional
apenas adiciona a referência a este plano, sem reescrever o plano como invariante já implementada; após a
implementação oficial, sincronizar o [Selection State](../design/interaction/selection-state.md) e a documentação
de cobertura relacionada. A compatibilidade da renomeação de níveis da Tarefa 95 continua sendo uma tarefa
independente; este item não altera os níveis de modelo por tabela.