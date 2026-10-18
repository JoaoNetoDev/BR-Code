# Todo104: Fronteira de Impacto e Casos

## Correção das Evidências Finais de Migração do B5

Complemento de aceitação multiplataforma: o diretório de cache precisa ser construído com `node:path` e as asserções feitas por segmentos; nos testes não se pode tratar o `/` POSIX como separador de path de arquivo do Windows. Manter todas as asserções de ambiente, plataforma, versão, hash de Endpoint e nome de arquivo; isso corrige apenas a portabilidade dos testes e não significa que a execução no Windows já tenha ocorrido.

Depois de reconstruir todas as dependências da CLI, os testes de recuperação a frio de App/Protocol da nova versão não podem semear a identidade antiga pelo novo `saveSessionEntry`: essa interface agora grava `data.modelSelection`, e nesse momento o ID antigo não deve mais ser migrado novamente. Os ramos da versão antiga precisam semear diretamente no SQLite achatado `providerId/modelId/thoughtLevel` e então verificar a recuperação completa de App/Protocol; o ramo da seleção atual continua passando pelo writer oficial, sem alterar suas asserções de invalidação/limpeza/não retrocesso de mensagem. O teste de cobertura da seleção padrão comum passa a usar o novo `options.reasoningLevel`, sem alimentar campos antigos de nível à interface nova de lógica. Este item corrige a origem dos dados de teste e não adiciona compatibilidade não publicada.

## B4 Caminhos e Identificação de Origem (2026-09-10, complemento antes da implementação)

Compartilha o build final e a regressão Pro com B2/B3. O caminho de download/refresh é unificado em `runtime/provider/<platform>/<version>/<endpoint-key>/`, com o registro de distribuição em `runtime/provider/provisioning.json`; o entrypoint liberado junto com o pacote reutiliza o materializer do Node, recebe a raiz de configuração de ambiente e grava sempre `runtime/provider/bundled/zcode-builtin.json`. A atualização acontece depois de encerrar normalmente o programa antigo; não se migra cache não publicado, não se apaga diretório antigo e não se refaz o lease de refresh.

A identificação de origem segue o caminho do arquivo Active já injetado: esse caminho contém a key de isolamento do Endpoint normalizado. O Node Source aplica hash ao caminho absoluto normalizado e, junto com a revision numérica de publicação, forma a revision de runtime; o Host e o Worker que leem o mesmo arquivo Active usam o mesmo algoritmo, sem um segundo campo de conta nem um protocolo de transporte. O Source de arquivo direto também tem seu escopo determinado pelo próprio caminho. A revision de publicação dentro do arquivo continua sendo o inteiro seguro original, sem renumeração por caminho.

```text
Endpoint → plataforma/versão/caminho de origem normalizado → revision do Host Source
                                      |
                             injeção de caminho existente no Worker
                                      |
                             mesmo caminho → mesma revision
Endpoint A/B com mesmo número de publicação → escopos de caminho distintos → Config/Account/Registry diferenciam corretamente
```

| Case   | Contrato verificado                                                                                                                    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| B4-01 | Isolamento de caminho em três níveis e normalização de Origin preservados; nome de arquivo/caminho do registro de distribuição conforme a decisão final |
| B4-02 | Conteúdo do arquivo fixo junto ao pacote igual não escreve; mudança faz substituição atômica; leitura concorrente só vê o arquivo antigo/novo completo; falha de escrita mantém o arquivo antigo e limpa os temporários |
| B4-03 | Dois Endpoints com mesmo número de publicação e modelos diferentes: Config e Registry não podem reutilizar resultado antigo; o Account segue conforme a identificação, e o Worker lendo o mesmo arquivo obtém a mesma identificação |
| B4-04 | CLI SEA e Server reutilizam a mesma interface de materialização, sem duplicar lógica de hash de arquivo; novo diretório na inicialização, controle de refresh e os cinco schemaVersion=1 finais coerentes |

A correção dos testes antigos de integridade do GLM segue §6.3.1: os testes de conta usam o Endpoint real do Provider e não podem substituir por `/api/coding/paas/v4`, que está fora do escopo declarado; o modelo em si e a cobertura do site são afirmados separadamente. Aplicar cobertura de mídia a uma API Key comum do mesmo Endpoint é comportamento já aprovado e não é uma capacidade nova criada para o teste.

## Lote de Leitura/Escrita Completa das Regras B2/B3 (2026-09-10, complemento antes da implementação)

Este lote conecta de uma vez o conjunto de regras, a atribuição de nomes/templates e o arquivo Personal dos itens §6.1–6.9 do Todo104. O novo schema estrito de dados é validado primeiro com testes direcionados e, no mesmo lote, substitui o codec existente, as regras de comportamento, o Resolver, a escrita de Settings e os consumidores de importação/distribuição; não se pode anunciar conclusão apenas adicionando um schema novo que ninguém usa. O schema amplo de Match antigo, o agrupamento adivinhado por campo, os booleanos de modo fixo e os campos de identidade aninhada são removidos das entradas finais de leitura e escrita.

```text
Arquivo de origem → schema estrito do conjunto de origem → regras/índices com hierarquia preservada
                                 → Resolver de prioridade original → visão de Settings/Registry
Salvamento/importação de Settings → mesmo schema de regras de origem → atualização atômica no lock do arquivo Personal
                                      └─ deduplicação de nomes/seleção padrão/ demais configs preservadas
```

| Case   | Contrato a provar                                                                                                      | Evidência                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| B2R-01 | Isolamento estrito em três níveis do Match; regex de API/URL ilegais, campos antigos/type todos rejeitados; o escopo válido de casamento original é preservado | schema + testes direcionados do Resolver |
| B2R-02 | Manual completo só flexibiliza enabled; folha ausente/null, valores numéricos/Map ilegais rejeitados; inteligente permite sparse; declaração do mesmo modelo em dois grupos é rejeitada | schema + testes de salvamento/restart |
| B2R-03 | Identidade de Provider/Template fica na camada externa da regra, duplicata no mesmo nível é rejeitada; chave de Template, membros pessoais de Builtin e Personal Account access não podem ultrapassar | testes da entrada de dados |
| B2R-04 | A ordem de cada conjunto sobrevive à ida e volta, sem regrajar a camada por campo; Manual não herda parâmetros, só herda enabled; trocar de conjunto não deixa resíduo do outro | codec + Resolver + ConfigService |
| B2R-05 | Fallback de nomenclatura do template no idioma atual/en-US/ID, deduplicação por caixa/espaços, criação concorrente dentro do lock sem nomes duplicados; mudança de idioma posterior não altera o nome já gravado | atualização real do Repository e aceitação de Settings |
| B2R-06 | Os quatro providerMatch viram Endpoint preciso, API Key comum pode atingir mídia; Off-Peak e a busca de Start não se ampliam sem necessidade | comparação com a resolução real do Builtin |
| B2R-07 | Array vazio final/wrapper de arquivo estrito; modificar o Provider preserva a seleção padrão, limpar o padrão preserva as demais configs; importação de versão antiga publicada produz a estrutura final | testes de arquivo/distribuição/concorrência |

Complemento de consumidores deste lote: o formulário de Settings distingue nome de exibição do patch de renomeação desta ação; ao alterar apenas a API não se salva o nome herdado, e ao renomear apenas não se materializam campos de conexão nem se perdem headers. A criação de template recebe locale, e o serviço usa a nomenclatura de template atual; a sincronização de Account continua usando o protocolo original do dicionário de Providers e não o array de regras em disco. A inicialização e o login da CLI compartilham o arquivo Personal, e a primeira importação lê uma vez os Providers e o modelo padrão antigos; o Protocol não importa sozinho a configuração antiga da CLI. Os casos ficam em `providerRuleForm`, `providerRuleFileIntegration` e `personal-config-default-integration`, enquanto as regressões antigas de `process-provider-registry-runtime`, `account-config-delivery` e `auth-login` assumem o ciclo de vida anterior. Os E2E SC90/F98/W89 existentes ainda precisam ser sincronizados com a estrutura final e executados em lote, sem substituir a aceitação no desktop por testes de função pura.

Fechamento de distribuição do B3: o Source lê o snapshot completo do único Personal Repository e depois confere o hash do conteúdo em disco; arquivo ruim ou alterado durante a leitura não pode sobrescrever o valor remoto com um fallback em memória. O Target reutiliza o update com lock do mesmo Repository; a substituição de progresso e o rollback happens dentro do lock comparando o Personal completo, e a seleção padrão não é mais lida/escrita separadamente. O rollback restaura a semântica completa de configuração (formatada pelo codec, igual a uma gravação comum) e não altera entradas antigas já publicadas; se o usuário já tiver escrito um C diferente, o rollback desse domínio é pulado com um rollback_failed explícito, sem reverter para A a nova seleção padrão ou o Provider contidos em C. Estado/credenciais mantêm as fronteiras de domínio existentes, sem introduzir um sistema de transação global.

```text
Personal completo A → o Source valida o conteúdo → envelope Personal B (contém a seleção padrão)
                                      ↓
Target no mesmo lock de arquivo: confirma que o atual ainda é A → substitui tudo por B → refresh/verificação
                                               ↓ falha
Mesmo lock de arquivo: atual é B → restaura A; atual já é C → mantém C e reporta conflito de rollback
```

Casos de distribuição: envelope sem sourceRevision/configuredDefault externo resulta em configRevision correspondente à origem real do Config; aplicação uma vez e syncId repetido; limpeza do padrão por omissão; restauração de Provider e do padrão em caso de falha; escritas concorrentes de Provider/padrão protegidas separadamente em caso de falha; notificação de mesmo arquivo chegando ao consumidor de padrão; dois processos reais modificando Provider/padrão sem sobrescrever um ao outro.

A fronteira do grafo segue a Surface Matrix já existente neste arquivo; não há novo owner de UI, sequência de mensagens ou mecanismo de sincronização de conta. A ferramenta de codegraph continua não disponível, e usa-se busca por símbolo exato até ConfigService / Facade / Resolver / codec do Node e Repository, com profundidade 2, complementando até o sink em disco a persistência e a distribuição entre camadas. Não se roda regressão de todo o repositório nem se constrói o Pro no meio; depois que todas essas cadeias estiverem conectadas, a verificação final é compartilhada.

## Resumo da Funcionalidade

| Campo                 | Conteúdo                                                                                              |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| Intenção/capacidade   | Preservar a semântica de produto existente de Provider e Selection e implementar o schema de persistência final |
| Camada/modo           | persistence, validation, draft-default, option-source; planning                                     |
| Entradas principais   | ProviderSettingsFacade / ProviderConfigResolver / createNodeModelSelectionFacade / OffPeakTaskRepo / RepoWikiStorage / SessionRepository |
| Fora de escopo        | Conexão simultânea de múltiplas contas, refatoração da montagem de conta da CLI, gate de envio síncrono, reformatação do Markdown de Subagent, função antiga de orçamento |

## Matriz de Superfície de UI

| Cenário/entrada                  | Implementação compartilhada              | Rascunho/padrão                | Validação                    | Commit / ponto de autoridade           | Modo e isolamento                                |
| --------------------------------- | ---------------------------------------- | ------------------------------ | ---------------------------- | -------------------------------------- | ------------------------------------------------ |
| Settings de Provider             | SettingsFacade/ConfigService             | Rascunho do formulário, regras recomendadas | schema de origem/integridade | atualização única do PersonalRepository | serviços locais/remotos injetados; não grava Session |
| Composer                         | SelectionFacade                          | Rascunho/Recent/padrão        | seleção válida / Factory final | seleção da Session após envio bem-sucedido | não persiste antecipadamente, não altera execução congelada |
| Automação/Bot/Subagent           | Dados de Selection compartilhados        | regras de herança próprias inalteradas | fronteiras de commit existentes | task / Session vinculada / MD do usuário | não compartilham o momento de gravação por terem campos compartilhados |
| Wiki/Draft                       | RepoWikiStorage                          | gera o rascunho de settings    | nova seleção autoritativa   | salvamento dentro do lock de arquivo existente | não restaura o limite de saída manual |
| Edição em tempo ocioso OffPeakEditView | OffPeakTaskService.updateTask → Repo | rascunho do formulário   | queued/paused, seleção completa | off_peak_tasks.model_selection         | mantém só as colunas antigas, sem mexer em Ticket, Session ou workspace |

## Comportamento Compartilhado e Divergente

Identidade de modelo, capacidade e schema de opções são compartilhados; cada negócio possui seus próprios limites de rascunho, commit e gravação. O ponto de gravação da seleção padrão muda, mas a diferença entre seleção padrão e persistência da sessão permanece. A seleção válida comum de Account continua seguindo as regras atuais; o Ticket vinculado ao Off-Peak não é resolvido de novo entre contas.

## Relacionamentos da Funcionalidade / Donos de Estado e Destinos de Commit

| Prioridade      | Relação                                       | Owner / destino                  | Evidência e motivo                                                                       |
| --------------- | --------------------------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| must-inspect    | edição em tempo ocioso → salvamento único no Repo | OffPeakTaskRepo / SQLite        | updateEditableFields hoje apaga ativamente colunas antigas; o Service só normaliza campos já submetidos |
| must-inspect    | salvamento de Wiki → atualização atômica do arquivo | RepoWikiStorage                | O objeto em execução não pode carregar valores antigos como segunda autoridade; a camada de salvamento preserva o valor original |
| must-inspect    | seleção de Session → entry.data               | Agent SessionRepository          | Recuperação/atualização/fork precisam reconhecer o novo wrapper de forma consistente     |
| must-inspect    | origem de config → Resolver → Registry         | camada de Provider; camada Node responsável pelo IO | dependência de schema unidirecional, admissão de config completa, mesmo snapshot de origem |
| must-inspect    | atualização de seleção padrão/Provider → mesmo arquivo | PersonalRepository             | Não podem se sobrescrever, e uma falha de distribuição só reverte o que não foi substituído concorrentemente |
| conditional     | novo caminho → empacotamento/inicialização do host | cada host injeta o caminho da camada Node | Desktop/CLI/Server precisam todos de verificação real do artefato                    |
| invariant-only  | entrega de mensagens no celular/desktop         | mesmo owner de Session          | Não altera o isolamento continuous/replayable nem workspaceIdentity                     |

## Invariantes a Preservar

- Valores antigos publicados servem apenas como snapshot de rollback; havendo uma nova seleção, os campos antigos não voltam a ser lidos por invalidação/limpeza.
- Leitura e escrita passam pelos owners existentes; a UI não acessa o Repo diretamente, o Service não referencia um Runtime concreto e o IO não entra no domínio de Provider.
- Colunas antigas e novas do Off-Peak diferentes não significam nova migração; Ticket, reivindicação de fila e desativação remota permanecem iguais.

```text
Submissão do formulário → validação existente do Service → atualização da nova seleção/campos de negócio no Repo → SQLite
                              └─ valor antigo de model/thought_level permanece intocado
Leitura nova ──────────────────────────→ model_selection
Leitura de rollback da versão antiga ────→ snapshot das colunas antigas
```

## Evidência de Codegraph / Graph Drift / Graph Delta

A ferramenta atual não oferece entrada de codegraph, e o repositório também não configura scripts para isso; usa-se a busca por símbolo exato como alternativa, sem tratar acerto textual como dependência semântica. O primeiro grupo expande com profundidade 2: `OffPeakTaskService.updateTask` chama unicamente `Repo.updateEditableFields`, a conversão de linhas do Repo lê só a nova seleção, e as colunas antigas são lidas pelo diagnóstico do problema de migração. O grupo completo de Schema complementará depois com as evidências reais de chamada.

Alguns campos de Provider e descrições antigas de estratificação no grafo serão atualizados depois das modificações do B2; neste momento não se escreve campo futuro como fato já implementado. B1a apenas acrescenta o invariante de preservar as colunas antigas, e as demais arestas de produto existentes não mudam.

## Perguntas em Aberto / Log de Esclarecimentos

O usuário autorizou explicitamente nesta rodada a implementação da decisão final. B1a não tem nova questão de produto; as limpezas de B1b/B1c significam que é preciso seguir as restrições de camada já existentes, registradas após a investigação, sem criar por conta própria um novo schema genérico de null. Se alguma outra escopo exigir nova decisão, apenas os itens relacionados são parados.

## Handoff de Planejamento / Escopo de Domínio / Dimensões

Este arquivo e o Todo104 são o entrypoint de spec/case. O primeiro grupo trata apenas de armazenamento e migração, sem mudar interação; o teste de integração de banco de dados cobre gravação real e restart. O grupo de UI de Settings recebe um handoff de E2E separado, e a aprovação deste grupo não substitui a verificação de todos os dispositivos.

Dimensões: com/sem coluna antiga, edição de título/nova seleção, estados queued/paused/outros, antes/depois do restart; as combinações de rede e tema não são expandidas porque este grupo não muda requisições nem exibição. Os campos de Ticket são conferidos conforme o invariante.

## Combinações Candidatas / Decisões de Poda / Casos Aceitos

| ID     | Estado e ação                        | Asserção/evidência                                                          | Decisão                            |
| ------ | ------------------------------------ | --------------------------------------------------------------------------- | ---------------------------------- |
| B1a-01 | registro existente em dois formatos; altera apenas o título | colunas antigas inalteradas valor a valor; nova seleção/Ticket inalterados | accepted, integração SQLite        |
| B1a-02 | altera modelo e nível no mesmo registro e reinicia | o novo leitor usa a nova seleção; a forma das colunas de staging congeladas ainda lê valores antigos | accepted, integração SQLite |
| B1a-03 | altera a seleção depois de criar    | colunas antigas permanecem NULL, sem fabricar formato antigo                | accepted, integração SQLite        |
| B1a-04 | seleção null / edição em runtime    | segue a rejeição existente, sem nova semântica de limpeza                   | accepted, testes existentes de Service/Repo |
| B1a-P1 | combinações de requisição de modelo, cota, rede e tema | mudanças da camada de salvamento não tocam esses estados; reutiliza a evidência existente, sem revalidar função antiga | pruned |

## Matrix Backfill / Notas de Handoff de E2E

Complemento de B1b: o Wiki já tem a migração de gravação única do Todo97 e a marcação de vazio por null; o texto original do Todo104 «converter em memória a cada leitura» está desatualizado. Reutilizar essa marcação já satisfaz a limpeza sem ressurreição, e não é preciso uma nova decisão de schema genérico. Migração, salvamento normal e remoção continuam compartilhando o lock de arquivo, e o reader oficial filtra os campos antigos.

| ID     | Cenário                                      | Asserção                                                                        | Decisão                     |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------- | --------------------------- |
| B1b-01 | primeira migração do Wiki/Draft e modificações seguintes | valores antigos de modelo/nível/orçamento preservados, corpo/gráfico/nova seleção atualizados, reader não devolve campos antigos | accepted, arquivos temporários reais |
| B1b-02 | limpeza de documento em dois formatos / salvamento e restart após seleção nova inválida | a marcação de vazio permanece autoritativa e a seleção antiga não ressuscita | accepted, arquivo real     |
| B1b-03 | nova pasta com campos antigos               | não grava valores antigos fabricados e não restaura orçamento                  | accepted                    |
| B1b-04 | falha de salvamento em rename, concorrência entre migração/salvamento/remoção | o texto original não é corrompido e a releitura dentro do lock respeita o fato mais recente | accepted, barreiras/injeção de falha |

Não há nova interação de UI nem regra de geração, e B1b não adiciona E2E; as asserções de modelo/Limit do Service existente entram na regressão do grupo. Os tipos de armazenamento privado envolvidos não vazam para o protocolo e a UI.

Os testes de B1a ficam em `services/test/offPeakTaskRepo.test.ts`; não há mudança de comportamento de UI e não se cria um E2E novo. Usa-se SQLite temporário, sem tocar em dados reais, sem precisar de fixture de modelo e sem usar espera por tempo. Os demais grupos acrescentam casos e a matriz de E2E necessária antes da implementação.

## B1c: Fronteira de Armazenamento da Session (confirmado antes da implementação)

O único owner de persistência é o SessionStore adapter do SQLite. `SessionEntryInfo.data` é o payload lógico do port: a seleção de modelo continua sendo o ModelSelection público (fork sem seleção segue usando null); o `session_entry.data` em disco é que é o wrapper que preserva o snapshot antigo. A fronteira de codec existente é reutilizada para empacotar/desempacotar, e core/bootstrap não escrevem um tratamento próprio cada um para os campos de rollback do SQLite. Salvamento comum, salvamento pelo runtime e o fork bundle atômico compartilham `saveSessionEntry`, e a recuperação passa unificada por `decodeSessionEntryRow`. Não mudam table/schema, momento de commit, protocolo ou linhas de mensagem.

```text
Seleção atual de core/bootstrap → SessionStore.saveSessionEntry
                        → um único UPSERT: JSON antigo + novo modelSelection
Leitura de recuperação a frio/fork ← codec apenas desempacota modelSelection ← SQLite
Primeira migração de dados antigos → reconsulta transacional dos candidatos originais → o mesmo UPSERT
```

O UPSERT, dentro do banco, só substitui o novo membro, evitando a janela de read-modify-write na camada de aplicação, e preserva todos os outros membros do objeto em disco. Registros novos gravam apenas o novo membro. A migração lê somente o providerId/modelId/thoughtLevel achatado já publicado, incluindo Providers customizados sem thoughtLevel; não transforma o formato não publicado de options em contrato de compatibilidade. A presença do novo membro (inclusive null ou valor inválido) bloqueia o fallback para campos/mensagens antigas. O codec não expõe o snapshot antigo ao negócio, e um registro antigo não migrado não pode ser tratado como seleção oficial. Registros filhos de fork carregam apenas a própria seleção atual, sem copiar campos de rollback do pai.

| ID     | Cenário                                                 | Asserção                                                                                     | Decisão                                        |
| ------ | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| B1c-01 | entry antigo de Account/custom, com ou sem thoughtLevel | id/type/campos antigos/membros desconhecidos preservados valor a valor, novo membro correto, migração idempotente | accepted, SQLite real                         |
| B1c-02 | salvamento comum, limpeza e restart após a migração    | apenas o novo membro muda; novo null/valor ruim não ressuscita valores antigos; o tempo de atividade da session não é tocado | accepted                                      |
| B1c-03 | migração a partir de mensagens antigas                  | novo entry tem só o novo membro e os bytes das mensagens antigas ficam inalterados            | accepted                                      |
| B1c-04 | troca em runtime, recuperação a frio, fork bundle       | contrato do port ModelSelection continua idêntico na ida e volta, escolha do filho isolada da do pai | accepted, regressão conjunta adapter/core/bootstrap |
| B1c-05 | concorrência entre migração e escritas seguintes, e falha de escrita | transação única/UPSERT único, sem sobrescrita por leitura antiga, e os dados antigos continuam completos em caso de falha | accepted, transação/injeção de falha |
| B1c-P1 | todas as combinações de UI/rede/tema/queue            | não muda interaction, continuous/replayable nem admission de entrada; representado pela regressão da camada de runtime existente | pruned |

Fato adicional sobre a ferramenta de arquitetura: `architecture:check --changed` sem violações; `cli-adapters` ainda não é um módulo gerenciado por architecture-policy e o comando de context retorna módulo desconhecido, então usam-se o SessionStorePort existente e o AGENTS da CLI como base de fronteira, sem expandir módulos de governança por causa disso.

Sincronização do contrato E2E de B1c: o unbound-resume existente semeia a seleção atual por SQL cru, e o caso de sessão do OffPeak já existente verifica a seleção por SQL cru; ambos precisam ler e gravar `data.modelSelection` em disco e não passar pelo port lógico. A semântica dos casos não muda, apenas o caminho de fixture/asserção. Permanece pending, e não se conta atualização de contrato estático como passagem em máquina real; a reverificação conjunta acontece depois do build Pro final.

## B2a: Fonte Única de Schema de Dados de Model

Primeiro, separar as restrições de dados de Model do codec que hoje usa class transform. O schema completo de dados declara as folhas; a cobertura sparse é derivada dele (pode faltar/pode ser null, e o aninhamento também permanece sparse). Os tipos de entrada de construção/serialização são derivados dos respectivos schemas; as classes de comportamento mantêm overlay/freeze, `validateComplete` chama apenas o schema completo e traduz os caminhos de problema já existentes. O tipo completo do Registry reutiliza o mesmo resultado derivado. Não há novo IO, owner de estado, subscription, seleção de execução ou interação de UI.

```text
schema de dados puro → tipos derivados + validação completa/sparse
       ↑                  ↑
classe de comportamento overlay/freeze    codec parse → classe de comportamento
       └──── admissão completa → Registry
```

Este passo não publica uma mudança de formato separadamente; os renomes/groupings de campos do B2 posterior alteram diretamente o mesmo schema e seus consumidores, sem formato temporário compatível. A configuração completa atual inclui enabled; a exceção de enabled no modo manual é derivada pelo schema de regras manual posterior. O parse permite sparse, mas não aceita valores inválidos; a admissão completa precisa rejeitar folhas aninhadas ausentes, inteiros não positivos/não seguros, níveis em branco/duplicados e map inválido. A classificação de erro distingue campo ausente, opção inválida e outra configuração inválida, preservando os caminhos atuais; não se modifica a política de negócio como falha de rede.

| ID     | Configuração/ação                                    | Asserção                                                                  | Decisão                              |
| ------ | ---------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------ |
| B2a-01 | sparse parse e admissão de instância completa recebem a mesma folha inválida | ambos rejeitam; não se pode passar por asserção de tipo                    | accepted, teste unitário            |
| B2a-02 | remoção/null folha a folha de um dado completo      | a admissão completa rejeita; o overlay sparse permite e aplica a semântica de limpeza original | accepted, schema/overlay            |
| B2a-03 | configuração completa válida, arrays e maps           | ida e volta de class/toJSON/parse, freeze e resultado do Registry inalterados | accepted, regressão de regras existente |
| B2a-04 | dependências de módulo e tipos derivados              | o schema base não importa classes de comportamento; codec/classe/Registry não mantêm tipos de campo paralelos | accepted, checagem de tipos + review |

O contexto de Provider já foi gerado: o módulo atual é unmanaged e não tem contract próprio, então a implementação continua pela entrada pública de config existente e não expande módulos de governança. O novo arquivo de schema é usado apenas internamente ao Provider e a camada de domínio não tem IO.

## B2b: Fonte Única de Schema de Dados de Provider

Dando continuidade à dependência unidirecional de B2a, os campos e enums de Provider/API/Access são definidos em schema de dados puro, e os tipos de entrada/JSON/Registry da classe de comportamento são derivados.

A completude de Provider mantém o escopo obrigatório já existente: group, api.type/baseURL e os campos de execução do ramo correspondente de Access; label/logo/membros/headers/URL de administração não recebem novos requisitos obrigatórios.

`entitled=false` é completo, mas sem direito, e não se disfarça como tendo direito por causa da checagem de completude; `hidden` continua isento da checagem. A troca do tipo de Access substitui o conjunto inteiro e não mistura as duas credenciais.

As permissões de escrita por origem do Provider são limitadas por pick/omit/extend do mesmo schema, preservando as restrições de Account apenas com membros/direitos, Template sem Key real e Personal sem Access de conta fixa.

O endpoint Personal ainda pode temporariamente guardar um texto que ainda não foi preenchido corretamente, e o Registry final rejeita; um único endpoint ruim não pode bloquear o arquivo Personal inteiro por causa do schema unificado.

Não se alteram serviço/sincronização de conta, estado do Provider nem a temporização das mensagens; o lote básico atual ainda não muda os nomes de campo publicados.

| ID     | Cenário                                                          | Asserção                                                                       | Decisão                        |
| ------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------ |
| B2b-01 | construir API type/group desconhecidos e URL de administração inválida fora da fronteira de tipo | a checagem completa rejeita e não pode aceitar só por não estar vazio        | accepted, teste vermelho primeiro |
| B2b-02 | completo/sparse/limpeza/troca dos dois Access                  | só exige os obrigatórios do ramo, optional ainda pode faltar/ser null, direito false inalterado | accepted                    |
| B2b-03 | endpoint Personal inválido + Provider válido no mesmo arquivo   | o item errado permanece editável, bloqueia apenas a própria admissão no Registry; o item válido continua executável | accepted, regressão existente preservada |
| B2b-04 | permissões de origem e serialização                            | derivado do mesmo schema, campos fora do escopo rejeitados, comportamento de class/JSON/freeze inalterado | accepted                    |

## B2c: Remoção do type Redundante em OptionSpec

Executa §5.5: reasoningLevel fica fixado pelo nome do membro como values/map, maxOutputTokens fixado como max/map, e cada type é removido; não são removidos o discriminator ainda usado pela API/Access do Provider nem pelas regras da camada externa.

A definição única de campo fica no schema de dados de B2a; a classe de comportamento não mantém nem grava de volta campos redundantes. A importação de Providers antigos publicados ainda é convertida pela entrada original, e o type antigo em Config não publicado não recebe compatibilidade.

O contrato de CLI ModelOptionSpecs permanece estruturalmente consistente com o Provider, o formulário de Settings não cria mais esse campo, e o Built-in padrão é atualizado no mesmo lote com uma revision de conteúdo; o comportamento de map de reasoning/max token em requisições reais não muda.

```text
Rascunho de Settings / Built-in / importação de formato antigo
              → OptionSpec sem type redundante
              → mesma checagem de completude → Registry → Map original → campo de requisição original
```

| ID     | Cenário                                              | Asserção                                                                        | Decisão                             |
| ------ | ---------------------------------------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| B2c-01 | OptionSpec completo novo sem type                   | parse/class/serialize/Registry funcionam e o valor de map da requisição não muda | accepted, teste vermelho + regressão de config/requisição |
| B2c-02 | type antigo não publicado ainda na Config           | o parse estrito rejeita, sem strip silencioso e sem mudar o contrato de entrada de migração publicado | accepted                        |
| B2c-03 | SC90-01 adiciona config manual e volta para inteligente | os dois opções salvos ficam sem type, e as asserções de rascunho que falhavam/desativado/recomendação restaurada permanecem | accepted, E2E pending existente ganha asserção |
| B2c-P1 | novo produto cartesiano de UI, tema e protocolo de requisição | não muda layout, eventos nem temporização de mensagens; reutiliza o formulário comum e a matriz existente da camada de requisição | pruned |

A entrada atual de Settings de Model ainda é submetida por ProviderModelMetadata com config pessoal sparse ou completa; não há necessidade de novo estado de UI, subscription ou requisição assíncrona. Este lote não assume a persistência da seleção padrão nem altera a fronteira de commit de Session. A fixture none-provider local de caso dos cases SC90/F98 existentes continua sendo reutilizada e não é promovida automaticamente; o Pro é validado construindo o código atual em um diretório isolado.

## B2d: Contrato Único de Dados de Model entre Camadas e Campos Finais

Executa os campos restantes de §5: inputFormat/outputFormat, supportsText/Image/Video/Audio/Pdf; `requiresMfjsToolSchema` vai para properties. Os significados completo/sparse não mudam, nomes antigos não publicados não são aceitos e não há leitura dupla. Todas as configurações atuais, formulários de UI, atributos de modelo da CLI e a projeção de mídia do protocolo são atualizados juntas; o body de requisição bruto do SDK, o Tool Schema e strings de mesmo nome em comandos externos não são alvos de renomeação.

Atribuição do contrato de dados: o schema de dados puro de Model precisa ser usado em conjunto por Provider, contracts da CLI e protocolo shared, e o schema único de B2a é movido para um subcaminho model-config independente no shared (sem introduzir classes de comportamento de Provider). O shared ganha apenas a dependência da biblioteca de compilação de expressões puras model-option-map; essa biblioteca não tem dependências de Provider/shared nem IO. A definição interna original no Provider é removida, sem schema paralelo nem compatibilidade de repasse. A classe de comportamento do Provider continua sendo a única responsável por overlay/freeze/admissão no Registry, e os tipos de dados de Model da CLI e a projeção de formato do protocolo são derivados do mesmo schema.

```text
shared/model-config（schema puro + validação de conteúdo; depende de biblioteca de expressões sem IO）
       ├─ classe de comportamento do Provider / codec de Config / Registry
       ├─ projeção de campos de mídia do protocolo shared
       └─ contracts da CLI (derivação de tipos) → core / adapters
```

Essa direção de dependência evita que o shared importe a implementação do Provider e evita ciclos no nível de pacote; não mudam owner de estado, subscription, seleção efetiva, frequência de sincronização nem momento de despacho/persistência de tarefas. `ModelRequest.maxOutputTokens` continua sendo uma opção real de requisição e não faz parte da migração de Selection.

| ID     | Cenário                                              | Asserção                                                                   | Decisão                             |
| ------ | ---------------------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------- |
| B2d-01 | entrada completa/sparse final do ModelConfig e ausência/null por folha | admissão completa com a nova estrutura; null mantém a limpeza; nomes antigos e MFJS top-level são estritamente rejeitados | accepted, teste vermelho/config do Node |
| B2d-02 | cobertura MFJS explícita true/false, salvamento manual/inteligente | escrita única em properties; o controle booleano, a marca de override pessoal e o valor na reabertura permanecem iguais | accepted, teste unitário do formulário + SC90 |
| B2d-03 | filtro de mídia/PDF/geração/stream da CLI e candidatos do modelo no protocolo | a mesma capacidade é lida das novas propriedades, e o map da requisição e o conteúdo da mensagem não mudam | accepted, testes de contrato/adapter/core |
| B2d-04 | gravação do Built-in novo e comparação de conteúdo | apenas renome/movimentação de campo e mudança de revision, com map/limite/valores de capacidade preservados valor a valor | accepted, comparação semântica de JSON |
| B2d-P1 | refazer UI, conexão de conta, sincronização remota e compatibilidade de configs publicadas | não é mudança semântica deste item, os limites atuais são preservados e Config antiga não publicada fica incompatível | pruned |

A implementação é dividida em dois passos verificáveis: primeiro, B2d-contrato move o schema puro e elimina definições duplicadas na CLI/no protocolo, mantendo campos e valores completamente inalterados; depois, B2d-campos atualiza simultaneamente cada consumidor e o Built-in. O primeiro passo não anuncia a conclusão dos campos finais nem upgrade da revision do Built-in. Os testes do subcaminho público verificam que o protocolo real usa o mesmo objeto de schema de campo, as restrições sparse/completas, a validação de expressões e o round-trip do Provider; os tipos da CLI são restringidos por asserções de igualdade bidirecional de tipos. Não há novo estado de negócio nem interação de UI e não se cria um caso de desktop novo; o passo de campos continua atualizando e executando SC90.

A primitiva comum sparseShape é movida para o subcaminho shared/config-schema, referenciada tanto pelo schema de Model quanto pelo de Provider; esse módulo apenas deriva campos nullish e não contém permissão de origem nem regra de negócio. A camada shared exporta o tipo de dados de Model derivado, e a CLI mantém o nome público original do tipo com alias type-only; não se exige que os contracts da CLI com Zod 3 derivem localmente de novo um schema Zod 4.

No lockfile real, shared=Zod4.3.6 e provider/provider-node=4.4.3; a mesma declaração `^4.3.6` não garante tipos de Schema combináveis. A checagem de tipos já provou que os tipos internos das duas versões são incompatíveis. Apenas esses três pacotes que combinam diretamente schemas de configuração são fixados em 4.3.6, a versão já usada pelo shared; sem upgrade de dependências de todo o repositório, sem modificar o Zod 3 da CLI e sem usar any/forçar tipos ou um segundo schema para contornar. A regressão de config completa e de classificação de erros precisa ser reexecutada no lockfile final.

Os campos de B2d continuam sendo fechados na granularidade do contrato: primeiro, os sete campos antigos de formato de mídia são substituídos pelo nome final (revision do Built-in 14→15), com atualização simultânea de cada ponta e das fixtures atuais; em seguida, a movimentação estrutural do MFJS trata à parte a semântica de cobertura booleana e não pode ser misturada a este lote por substituição simples de texto. As entradas de migração publicadas não mudam, e apenas a fixture atual de Model nos scripts é atualizada. Formatos antigos não publicados são rejeitados com um caso negativo explícito. Os tipos de Draft de entrada/saída da UI também referenciam o tipo derivado compartilhado, evitando nova interface sinônima escrita à mão; layout e textos de controle não mudam.

O rebuild Pro revelou que os dois novos subcaminhos shared do B2d-contrato estavam sem o alias exato de esbuild da CLI, e o prefixo genérico montaria index.ts/model-config erroneamente. Este round completa a entrada de build existente e seu teste de contrato de alias, sem refazer o sistema de build; só se continua para o E2E depois que um Agent real for reconstruído com sucesso, e um build bem-sucedido do Renderer do desktop não substitui a verificação de fechamento do Agent.

A nova dependência da biblioteca compartilhada de expressões puras também afeta o contexto de build Dockerpodado: todo Dockerfile que faz COPY explícito de shared precisa copiar também o manifest e o código-fonte de model-option-map. O v4 já faz isso, mas o Share e o modelo remoto antigo estão faltando; este round apenas completa a nova dependência e não conserta por oportunidade outras lacunas antigas dos modelos. Como o Share não importa classes de comportamento do Provider, seu alias shared genérico ainda não consome o novo subcaminho e não se altera a configuração sem evidência; a construção local real do Share e o teste de fronteira estática de dependências são a verificação, e o build real da imagem Docker não é substituído por «aprovado».

### B2d-MFJS: atribuição única em properties

`requiresMfjsToolSchema` sai do topo do ModelConfig para properties; em ModelProperties completo o boolean é obrigatório, e em properties sparse ainda pode faltar/ser null. O Built-in apenas move o valor original (revision 15→16), sem nova capacidade. O ModelConfig não faz mais overlay/serialização desse campo separadamente, e o ModelPropertiesConfig o trata uniformemente. O CLI Adapter não copia mais um segundo valor de MFJS no ResolvedAiSdkModel, e as duas projeções de ferramentas, generate e stream, leem das properties do Model de execução fixado; as opções privadas do transform de ferramenta mantêm o parâmetro booleano original e o conteúdo real do schema MFJS não muda.

A UI inclui MFJS na marca de origem do grupo de propriedades e na escrita sparse; um false não tocado pelo modo inteligente não pode gerar cobertura do nada, e true/false explícito e null preservam suas respectivas semânticas. Desligar a configuração inteligente ainda materializa properties completas e não habilita o modelo por causa da mudança de lugar; a limpeza ao voltar para o inteligente e a reedição continuam pelo fluxo de rascunho existente. Os testes provam primeiro false/true/null, ausência no completo, rejeição do topo antigo e os ramos de salvamento inteligente/manual, reabertura, destaque e o valor verdadeiro/falso do tool schema na requisição. O SC90 do Pro ganha as asserções reais de troca de MFJS e reabertura, e o comportamento de borda/layout que F98 já cobre permanece.

## B2e: Nomenclatura de Membros e Endpoint do Provider

A nova configuração usa uniformemente `personalModelIds` e `api.baseUrl`, e Builtin/Personal/Account/Registry/página de Settings consomem o mesmo contrato de dados. A propriedade dos membros não muda: `builtinModelIds` são membros de origem que não podem ser removidos nem alterados, `personalModelIds` são apenas os membros adicionados pelo usuário e `modelOrder` é a ordem de exibição dos dois. Os parâmetros de criação do SDK `baseURL`, os `endpoints.baseURL`/`options.baseURL` de Providers antigos publicados e os parâmetros locais de ordenação de negócio `modelIds` não são alvos de renomeação; as entradas de migração antigas são lidas como são, e o novo ProviderConfig convertido usa os campos novos. Os parâmetros de consulta/Match das regras de Model ficam para a religação unificada do grupo de regras e não são modificados aqui.

Primeiro são testados o round-trip completo/sparse dos campos novos, a limpeza por null e a rejeição estrita de campos antigos não publicados; só então todos os consumidores são modificados. Reutilizam-se os testes de adição/remoção/edição de membros, membros de conta dinâmicos, ordenação, preservação de headers no formulário e migração; e é acrescentada uma asserção real da URL de saída do SDK, provando que o novo `api.baseUrl` ainda mapeia para o `baseURL` exigido pelo SDK. A página de Settings mantém as interações e os casos Pro existentes, e a renomeação do contrato de configuração não muda o texto nem o layout da página. A comparação do conteúdo do Built-in apenas move campos e a revision 16→17, sem mudar a lista de modelos, o Map ou os valores de endpoint; a atribuição de label/template e o array de regras são tratados em outro grupo, e a estrutura final do Provider não é anunciada como concluída.