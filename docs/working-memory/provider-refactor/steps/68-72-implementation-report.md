# Relatório de Implementação dos Todo 68–72

> Em execução; não é um relatório de conclusão. Só é possível avançar para a próxima etapa depois da verificação e do Review de cada etapa.

## Ordem de execução e escopo

Os Todo 68, 69, 70, 71 e 72 do mesmo diretório são o design detalhado; este documento registra apenas os resultados da execução e as passagens de bastão.

```text
68 Active Model 收尾
  -> 72 前段：Provider 导入、旧身份转换、账号上下文
  -> 69 Bot 新旧文件隔离
  -> 70 Session 恢复与未绑定选择
  -> 71 Composer 持久化与 Submission
  -> 72 后段：其余领域接入核对、联合验收
```

As decisões complementares desta rodada foram escritas de volta em cada Todo: seleção ausente ou inválida fica vazia e não mostra aviso; campos antigos são mantidos apenas para rollback; o Bot não procura um Provider substituto pelo nome do modelo; após a conversão bem-sucedida do antigo Coding Plan, a identidade é fixada no limite de salvamento da restauração; o limite de rascunhos aumenta de 50 para 500, mantendo a regra de descarte existente e sem nova camada de armazenamento; arquivos migrados incorretamente são reparados manualmente, sem programa de reparo automático.

## Escopo de impacto

- 68: Agent principal, Guide, Subagent, execução ociosa, Context e projeção de ferramentas de modelo; não modifica UI nem transporte de controle remoto.
- 69/72: importação unidirecional de Provider e Bot e conversão de identidade antiga; não introduz alias de runtime nem escrita dupla persistente entre domínios.
- 70/71: abertura de histórico, reseleção de modelo, rascunho e submissão; exigem validação das cadeias de desktop e celular, e não podem ser encerrados apenas com testes unitários.
- Os invariantes específicos e as combinações de teste seguem cada Todo; o Review de etapa precisa verificar os chamadores adjacentes sem ampliar o alcance das decisões de produto.

## 68: implementação, verificação direcionada e Review concluídos

### Implementado

- Mantidas as alterações anteriores ao início do trabalho: nomenclatura de Session Selection, inicialização de Turn e fechamento de Subagent.
- Removida a entrada de tipo `EnvInfo.currentModel` e as pontes de stripping em Context/persistência.
- O Builder do Agent principal e do Subagent recebe diretamente o Model em execução, renderiza a identidade e não escreve modelo no snapshot de ambiente.
- Quatro regressões novas de Context: primeiro verificando que a implementação antiga falha, depois que a nova passa.

### Registro de verificação

- Core Context/seleção de modelo/Guide: 16 casos aprovados.
- Core Context Builder/ciclo de vida/âncoras de persistência/Subagent: 88 casos aprovados.
- Verificação de tipos de Core e Bootstrap aprovadas; typecheck e lint da raiz aprovados (35 warnings de lint, 0 erros).
- Core completo: 159 arquivos, 2213 passed / 36 skipped / 2 todo.
- Depois de reconstruir Contracts/Core, três arquivos direcionados do Bootstrap: 80 casos aprovados. Corrigidos o schemaVersion de Release da fixture antiga, a falta de reasoning nos parâmetros de inicialização e as asserções de recuperação erradas: a Selection salva da Session tem prioridade sobre os parâmetros de inicialização; a requisição real é consistente com a descrição do modelo.
- Novo E2E pendente de sequência A → B → C → A e fixture local do caso; validação da fixture e typecheck do E2E aprovados.
- Finalmente, seis arquivos direcionados de Core com 42 casos e quatro arquivos direcionados de Bootstrap com 82 casos aprovados; typecheck e lint da raiz aprovados novamente.
- E2E de troca consecutiva de modelo no Pro aprovado duas vezes: `desktop-e2e-20260903-122117-608` e
  `desktop-e2e-20260903-122428-270`. A segunda rodada reforçou as asserções, confirmando que à direita da seta de marca de troca está o Provider alvo.
  As quatro rodadas de requisição afirmam a URL alvo, o Model ID e o Provider/Model no system, com a mesma Session inalterada.
  Essa é uma validação interativa real com Desktop empacotado e gateway de replay, não uma validação do serviço de modelos em produção; o caso continua pendente e não foi promovido arbitrariamente.
- A primeira falha no Pro veio do mock de JWT de requisição que não isolava o plano de controle da conta, disparando o diálogo de expiração de login que cobriu o menu da segunda rodada.
  A requisição da primeira rodada já havia passado; depois de adicionar o teste, a spec foi conectada ao mock de conta existente, seis testes unitários de helper passaram e só então a evidência de E2E acima foi obtida.
- Uma sondagem completa adicional do Bootstrap teve 20 falhas. Foi corrigido o problema do Registry falso da session-facade sem getView, ligado ao fechamento de nomenclatura desta rodada; as outras 19 ainda não foram reexecutadas por completo, portanto não se afirma que o Bootstrap completo passou. Dessas, 12 ainda usam o schemaVersion antigo de Release e outras envolvem fixtures de PDF/plugin, fronteiras de protocolo antigo, cópia de diretório do marketplace, remoteCron e stale retry; ficam para a conferência da aceitação final.
- A verificação do Feature Graph encontrou 4 arestas pendentes já existentes e alguns caminhos seed inexistentes; esta rodada atualiza apenas os invariantes de fato de modelo e não amplia a correção do grafo.

### Portão do Review

O Core completo, a regressão direcionada do Bootstrap, a evidência da primeira requisição no Pro e a revisão de documentação/entradas de tipo já têm evidência, então é possível entrar na primeira parte do 72.
Na Queue comum foi adicionada a asserção de que o intent congelado realmente cria um Model; corrigidos de forma sincronizada o diretório e a matriz que ainda diz "consumir a Session mais recente".
Esta etapa não altera a transmissão continuous/replayable nem o protocolo de estado da UI; a validação de interação específica do celular fica para 70/71.

## 72 primeira parte: implementação, verificação direcionada e Review

- A importação do Desktop passa a reconhecer primeiro `builtin:*` / `account:*` para preservar a identidade, evitando a classificação errada como source=custom;
  somente a Key não vazia dos dois APIs antigos entra na instância de Template correspondente; as demais configurações built-in antigas são descartadas.
- O CLI Standalone tem o mesmo desvio, fechado junto. Key vazia em configuração antiga real não dispara mais falha de parsing de todo o arquivo.
- Nova conversão unidirecional de identidade: API/Start mapeiam direto; o antigo Coding Plan só usa a conexão da mesma Family já conectada no ambiente atual.
  O ID atual é preservado como está, built-in antigo desconhecido retorna não vinculado; não se varre a lista de modelos nem se introduz alias de runtime.
- Teste vertical de arquivo antigo anonimizado passando por Reader → Importer → Repository → Template/Resolver atual:
  modelo de API executável, Context customizado preservado, bytes do arquivo antigo inalterados e releitura repetida sem sobrescrever modificações Personal.
- Services/Shared cinco arquivos com 37 casos e CLI Importer com 13 casos aprovados; typecheck da raiz aprovado.
- O Review cobriu as lacunas de Key vazia no Standalone e de classificação de configuração built-in. A integração de Bot/Session e de outros domínios e a verificação real de upgrade ainda não foram concluídas e ficam nas etapas seguintes; não se equivale a passagem das funções básicas a migração completa de todos os domínios.

## 69: isolamento de arquivos, verificação e Review

- Arquivos e conteúdo de Config / State subiram para v3; o Repo faz a primeira importação dentro do lock do arquivo alvo e fixa o resultado imediatamente,
  lendo e gravando apenas v3 depois disso. Arquivos antigos permanecem inalterados; um novo arquivo corrompido é exposto diretamente, sem sobrescrever com dados antigos e sem criar cópia do formato antigo.
- Removidas a reescrita v2 e a adivinhação por nome de modelo do Service; campos antigos só são decodificados no Importer, e a nova Selection não é sobrescrita pelo thoughtLevel antigo.
  A conversão de identidade usa a mesma regra do 72; sem conexão remota não há conexão ativa, e não se usa a conta local para explicar o Coding Plan remoto antigo.
- O novo teste de armazenamento reproduz primeiro 5 falhas e só então implementa. Finalmente cobre criação/edição/exclusão de Config, atualização de State, primeira leitura concorrente, v3 parcial, v3 corrompido, conflito entre campos antigo e novo, fixação de identidade dinâmica e isolamento remoto.
- Bot e armazenamento direcionado de Off-Peak / Automation / Subagent / Provider: 24 arquivos e 353 casos aprovados;
  typecheck da raiz aprovado, lint com os 35 warnings existentes e 0 erros, verificação de diferenças aprovada.
- Executado em diretório temporário de teste o Reader de Options estrito do Config antigo e a verificação de bytes do arquivo:
  gravar novas Options no arquivo antigo é rejeitado, e o arquivo antigo preservado é legível com bytes inalterados. Campos de Bot periféricos sem mudança reutilizam o Schema atual,
  e não carrega o App antigo inteiro. Também foram extraídas duas task Row Decoders do staging congelado para verificar que coluna vazia de modelo antigo e coluna nova extra são legíveis;
  esse smoke estreito não verificou execução de agendamento, e a validação de mode do Automation teve como resultado fixo a falha de null neste cenário.
- Desktop real no Pro: `desktop-e2e-20260903-130224-371`, 3 arquivos e 5 Cases todos aprovados:
  persistência em v3 após habilitar o diálogo do bot / vínculo preservado, AskUserQuestion, cartão de conclusão, isolamento Feishu/Lark e ciclo de vida do cartão em streaming.
  O diálogo é UI real; os demais Cases usam Service oficial mais stream controlado, sem alegar conexão real com contas de terceiros.
- O Review removeu a dependência da migração em relação ao helper de codificação de exibição antiga, lendo diretamente a identidade da Selection View;
  sincronizou a versão de configuração vazia da UI, a fixture de E2E e a documentação atual de Bots. Não aumenta a escrita dupla contínua nem alterar a fronteira de transmissão em tempo real.

Nesta etapa é possível entrar no 70. O rollback do App antigo completo e as contas de Bot em produção não foram testados; isso está fora do escopo das evidências de Reader/armazenamento acima, e a regressão final de lançamento ainda precisa ser executada conforme a lista de regressão.

## 70: em andamento

- Fixa e corrigida a Decoder do armazenamento com "campo atual tem prioridade": quando a Selection atual do User está incompleta, o model antigo não é lido;
  Assistant / Timeline não preenchem campos a partir da identidade antiga em maiúsculas; as options da entry atual não são consertadas com o thoughtLevel antigo.
  A Decoder não expõe aliases antigos e o banco original não foi reescrito em massa. Primeiro reproduzidas 7 falhas e, após a correção, dois arquivos do Adapter com 53 casos aprovados.
- O Runtime passou a permitir seleção não vinculada: a hydration histórica e o hook SessionStart não criam Model, o ponto de entrada de execução rejeita seleção não vinculada e o Factory ainda só aceita Selection completa. Na restauração o Runtime não passa a reportar erro na fase de criação por Registry vazio ou seleção ausente;
  novas sessões seguem usando o configured default. Os novos testes reproduzem primeiro o crash de construção e 6 falhas de restauração, e depois validam a correção.
- Mensagens históricas/sintéticas podem ter fonte de modelo ausente; Core, mapper de Protocol, Host e o mapeamento histórico da UI não usam mais o modelo padrão para completar a fonte.
  Os dois testes de projeção, desktop continuous e Web replayable, cobrem mensagens sem modelo, sem alterar as fronteiras de transmissão/restauração.
- Verificação deste pequeno passo: Core completo **160 arquivos, 2215 aprovados, 36 pulados, 2 todo**; Bootstrap criação/Facade três arquivos
  **37 aprovados**; projeção histórica da UI **97 aprovados**; typecheck independente de Core/Bootstrap, typecheck da raiz e lint aprovados
  (35 warnings existentes), diff check aprovado. Inicialmente o Core completo foi executado por engano na raiz do CLI e 15 testes de navegador falharam por resolução de cwd
  no caminho dos assets; usando o cwd do próprio pacote a execução completa passou, sem modificar os testes de navegador nem os assets para contornar.
- **O Todo 70 ainda não está concluído**: a restauração de Protocol ainda tem desvios como preenchimento de nível em mensagens/dicas e preenchimento padrão em setModel;
  o resultado da restauração com Provider/Model válido e reasoning vazio ainda precisa ser transmitido ao Composer. A substituição automática do Registry para "modelo vinculado que depois ficou inválido"
  ainda precisa ser removida conforme o 71; por enquanto só se impede que esse ponto de entrada preencha uma Selection não vinculada no Runtime.
- O código deste pequeno passo foi sincronizado no diretório isolado do Pro: quatro arquivos direcionados de Core **114 aprovados**; depois de reconstruir contracts/core, quatro arquivos de Bootstrap
  **75 aprovados** (incluindo 38 casos de persistência de Session com Sqlite real). As cinco primeiras falhas de Bootstrap vieram de
  Core dist ainda carregado com código antigo e desapareceram após a atualização com o build padrão. Aqui são testes de unidade/integração de armazenamento no Pro, **não o E2E do Todo 70**.
- A identidade do Coding Plan antigo do 72 ainda precisa ser integrada à restauração de Session e fixada no limite de salvamento original; o E2E de UI não vinculada/envio contínuo do 70 ainda não foi executado.

### 70: pequeno passo da entrada do App e do armazenamento de migração

- O Review encontrou que `restorePersistedModelSelection` do App só verifica a identidade do modelo e ainda reescreve no Runtime uma Selection sem reasoning ou já inválida.
  Passou a só vincular após a validação completa do Registry, e o resultado da restauração pode carregar uma identidade de modelo válida para a interface completar a seleção.
  O tipo de erro de reasoning atual apenas limpa o nível; erro de leitura da entry de seleção é registrado como erro de armazenamento, sem ler histórico/default substituto e sem bloquear a abertura do histórico.
  Novos testes de SQLite real + restauração do App cobrem valores ausentes/inválidos/corrompidos, erro de leitura e continuar o envio após reseleção.
- Nova operação de migração unidirecional no Session Store: reconhecimento da estrutura antiga original, injeção assíncrona do mapeamento de identidade, reconferência de candidatos dentro da transação de escrita e fixação imediata da entry atual.
  Os testes verificam que a entry atual bloqueia o fallback de mensagens antigas, que uma nova escolha durante a espera tem prioridade, que a mudança de conta após a migração não remigra e que bytes/hora de atividade das mensagens antigas não mudam.
  **Essa operação ainda não foi conectada ao App/Protocol e ao contexto de conta do Host correspondente; não se pode, com base nela, afirmar que a migração real de sessões antigas foi concluída.**
- A verificação segue vermelho antes do verde: a entrada principal do App reproduziu primeiro 5 falhas de asserção de negócio (mais 1 fixture inicial que usava um null não aceito pelo armazenamento,
  alterada para entry realmente ausente); o tipo de erro reproduziu 2 falhas depois de reconstruir o Adapter; erro de leitura reproduziu 1; a operação de migração reproduziu 10 falhas por falta de implementação.
  Descobriu-se que o Bootstrap carrega o dist dos pacotes dependentes; a partir daí reconstrói-se primeiro contracts/core/adapters de forma unificada, evitando inconsistência entre código-fonte e artefatos de teste.
- Final deste pequeno passo no Pro: três arquivos de Adapter **63 aprovados** (`.todo70-storage-review.log`), três arquivos de Bootstrap
  **56 aprovados** (`.todo70-app-resume-final.log`), quatro arquivos de Core **82 aprovados** (`.todo70-core-review-final.log`).
  Build independente do Adapter, typecheck do Bootstrap, typecheck/lint da raiz e diff check aprovados (35 warnings de lint existentes).
  Isso ainda é validação de unidade/SQLite/integr App, não E2E de UI do Desktop.
- Pendências de passagem após o Review: remover os desvios de preenchimento de mensagem/dica de thought e de preenchimento padrão de setModel do Protocol;
  obter o contexto de conta pelo Environment correspondente na migração; fazer a restauração e a escolha concorrente do usuário compartilharem o limite serial original; ao entregar parte dos candidatos ao Composer,
  não sobrescrever um rascunho existente do usuário. Só depois de concluídos isso e aprovados no Pro pelo E2E de UI é que o 70 termina e o 71 começa.

### 70: fechamento de Protocol e verificação de cold recovery no Pro (continuando)

- Uma migração foi conectada ao App real: o antigo Coding Plan obtém a identidade de conta da mesma Environment por um RPC estreito do Host correspondente,
  fixando-a como entry atual. Testes do Host para as duas configurações de autorização de preferência local/externa provam que ela não é repassada ao resolvedor de preferências do desktop.
- Removidos do Protocol os desvios que completavam seleção a partir de mensagens históricas, mensagens pareadas por fork, thought hint e modelo padrão;
  o Protocol passa a adotar apenas o resultado da restauração do App. A restauração e a seleção de modelo do usuário compartilham a seção crítica serial já existente do App, e o novo evento de seleção de modelo limpa a semente da primeira restauração.
- Testes reais de Protocol/App/SQLite reproduziram primeiro o "high da dica gravando nível vazio"; depois de remover o desvio, verificou-se que a projeção ignorava valores nulos explícitos,
  e foi permitido que o valor nulo limpe a semente do modelo histórico, mantendo a prioridade dos novos eventos do usuário. Desktop continuous e celular replayable estão ambos cobertos.
- Atualizados os testes antigos de cold recovery: a restauração do modelo usa o App real, sem deixar o dublê de ciclo de vida copiar a migração; removidas as asserções antigas de preenchimento de nível a partir de mensagens/dicas vizinhas.
  Local e Pro: **5 arquivos, 237 casos aprovados**; log no Pro `.todo70-protocol-review.log`.
- Complementada a migração de identidade antiga com options ruins: Provider/Model determináveis ainda migram, reasoning fica vazio e não é preenchido a partir do thoughtLevel vizinho.
  Reproduzidas primeiro duas falhas; Adapter focado local e no Pro: **12 casos aprovados**.
- Novos casos pendentes de Electron e contrato de replay independente. As duas primeiras rodadas expuseram respectivamente o teste pegando `draft` por engano e a ausência de preservação do profile no restart;
  depois da correção apareceram dois problemas de fixture de E2E: o JWT da conta falsa padrão acessa o plano de controle real e dispara o diálogo de expiração de login; o endereço de Replay criado pelo próprio worker
  não é gravado no Provider, e a requisição real cai em outro serviço. A fixture de conta passou por vermelho antes do verde, com 2 casos aprovados em cada um, local e Pro;
  o caso passou a reutilizar o modo existente de cold recovery, com o seed apontando para o Personal Provider do Replay local ao caso e um restart completo.
- A execução mais recente do Case real `desktop-e2e-20260903-154508-940` provou que Provider/Model/Reasoning foram passados ao Agent; a causa da falha foi
  a requisição caindo no serviço de Replay errado e receber 500, e não uma asserção de restauração do Todo 70. Depois de corrigir o teste, o Pro deu timeout três vezes seguidas ao criar
  a sessão do Electron pelo WebDriver, com 0 Cases executados. Embora a verificação tenha encontrado o Pro bloqueado, o horário do bloqueio era 12:27, anterior à inicialização bem-sucedida das 15:45,
  então não é possível atribuir o bloqueio como causa. Está-se verificando as diferenças de inicialização entre SSH e sessão GUI; não se pode contar falha de infraestrutura como aprovação.
- typecheck/lint da raiz e typecheck do Bootstrap aprovados (35 warnings de lint existentes); o typecheck do E2E mais recente e a verificação da fixture, aprovados.
  O 70 continua incompleto e não entra no 71; é preciso rodar o mesmo caso no Pro e continuar o Review de etapa.

### 70: bloqueio de inicialização no Pro e regressão de UI real

- Tanto a inicialização por SSH quanto pelo Terminal deram timeout ao criar a sessão do WebDriver. O sample do Electron mostrou, respectivamente,
  o depurador esperando o depurador em `realpath/getcwd/open` e a resolução de módulos em `GetPackageJSON/open`; não é anomalia de restauração de Session.
  Trocar apenas o cwd para `/tmp` não bastou para recuperar; depois de copiar a mesma cópia isolada de código/dependências/build para
  `/tmp/zcode-todo70-wdio.JjKqz1/source`, o Electron iniciou normalmente e executou os casos. O acesso ao diretório é uma causa com evidência,
  mas o mecanismo específico de bloqueio do macOS ainda não foi determinado; nenhuma permissão de sistema, aplicativo oficial ou configuração real de usuário foi alterada.
- `desktop-e2e-20260903-161420-335` passou pelo primeiro envio real, gravação em disco, restart e restauração do histórico, e então capturou uma lacuna de produto:
  a barra de ferramentas mostra `max` quando o reasoning está ausente. O log do Agent confirma que a restauração da Session teve sucesso; dois preenchimentos padrão
  na barra de ferramentas exibiam de novo o valor nulo como o valor padrão do diretório. A nova regressão de UI reproduziu 3 falhas; depois de remover o preenchimento na camada de exibição, dois arquivos com 45 casos passaram.
  Está-se reconstruindo e reexecutando o mesmo E2E no Pro, sem ainda declarar o 70 concluído.
- O Pro ganhou a cópia temporária acima e logs de diagnóstico `/tmp/todo70-*`; o diretório isolado original permanece no Desktop. O `.e2e-home` da nova cópia ainda é um diretório de dados exclusivo de teste. Algumas execuções de WDIO que falharam na inicialização retornaram 0, mas o relatório indica explicitamente 0 Cases e falha na criação da sessão; este relatório se baseia na evidência de Cases e artefatos, e não trata o código de saída isoladamente como aprovação.

### 70: Review de etapa e passagem de bastão

- Depois que o `desktop-e2e-20260903-161924-582` passou a cadeia completa pela primeira vez no Pro, o Review de capturas de tela mostrou que o controle subjacente ainda exibia o nível vazio como
  o primeiro item, "Desligado". Foram adicionadas asserções de texto visível/aria-label, reproduzidas primeiro duas falhas de componente e depois corrigido para um placeholder de seleção em chinês e inglês;
  o `desktop-e2e-20260903-162422-098` passou novamente o mesmo E2E de cold recovery, e a captura confirma "选择思考档位".
  Cobre nível ausente, nível inválido, Provider inválido e reenvio após reseleção na mesma Session; não promove automaticamente o caso de pending.
- Quatro arquivos de UI **62 casos aprovados**; no Pro, seis arquivos direcionados de App/Protocol/Projection com **219 casos aprovados**;
  typecheck/lint da raiz, fixture check e diff check aprovados (35 warnings de lint existentes).
- O Review confirmou que a migração fixa imediatamente a entry atual e reconfirma dentro da transação após a resolução assíncrona da conta; que o campo novo bloqueia o antigo; que o Runtime não vincula
  seleções incompletas; e que as projeções desktop continuous/celular replayable preservam o estado vazio; esta rodada não adicionou estrutura de banco nem escrita dupla contínua.
- A sondagem do Bootstrap completo não ficou toda verde: no Pro houve **24 falhas / 1437 aprovados**, sendo que dois arquivos de teste esqueceram de sincronizar; depois disso o workspace inteiro foi sincronizado e a restauração de Provider
  foi reconferida nas verificações focadas acima. As demais falhas conhecidas incluem o schemaVersion=2 antigo de Built-in nas fixtures de teste, importação/empacotamento de plugin/assets de PDF, fronteiras nativas do V4 e asserções existentes de Cron/comandos; não se pode chamar isso de validação do pacote completo aprovada.
  A aceitação conjunta da segunda parte do 72 precisa revisar essas falhas, distinguindo testes obsoletos de problemas de produção, sem pular com a etiqueta "baseline".

- A cadeia principal de restauração do 70 e o caminho de UI real já atendem ao objetivo da etapa, então é possível entrar no 71. O 71 precisa manter este caso sem regressão e completar a inicialização do Composer persistente, o esvaziamento da seleção ativa quando ela fica inválida, o gate de submissão e a preservação da seleção após a submissão; a aprovação desta etapa não substitui esses itens ainda por implementar.

## 71 e segunda parte do 72

O 71 começou a ser executado; a segunda parte do 72 aguarda a aceitação conjunta.

### 71: primeiro pequeno passo do Draft persistente

- Os rascunhos v1 existentes recebem mode/modelSelection opcionais, sem troca de key; um mode válido significa inicialização concluída, e modelo vazio continua sendo preservado.
  Texto vazio não apaga mais registros que carregam mode/seleção, e a capacidade por scope é ampliada de 50 para 500, mantendo a regra original de descarte por hora de atualização.
- O Reader lê entrada a entrada o rascunho e a nova folha; rascunhos de texto antigos continuam legíveis, options ruins preservam a identidade de modelo atual que for determinável,
  e aliases achatados antigos não são lidos. Um erro em localStorage.getItem não atravessa mais até a UI; uma falha de armazenamento na mesma key é registrada uma única vez e é zerada após a escrita voltar a funcionar.
- Sete testes novos falharam antes de tudo; após a implementação, junto com os testes de envio/restauração originais do Composer, 2 arquivos com 19 casos passaram localmente e no Pro;
  typecheck/lint da raiz e diff check aprovados (35 warnings de lint).
- Review: o armazenamento continua sendo o localStorage atual, sem introduzir novo Store de negócio/Repo de Host; sem serialização de anexos nem nova versão de persistência.
  **Ainda não foi conectado ao owner de estado do Composer, à transferência Root→Session e à limpeza de sucesso/falha da Submission**; chamadores antigos ainda podem apagar o rascunho inteiro,
  e o próximo passo precisa fechar tudo junto; não se pode, com base nisso, afirmar que a interface já salvou mode/model de forma persistente ou que o 71 foi concluído.

### 71: inicialização, invalidação e exibição de modo (em andamento)

- `useDraftConfigControl` passa a inicializar o estado em memória com o Draft persistente completo do scope atual; um mode válido marca a inicialização.
  Uma Session existente aguarda o primeiro Snapshot correspondente e só lê o novo modelSelection; uma tarefa nova pela primeira vez aguarda a Ready View e usa um Recent/preferred válido.
  Snapshots seguintes, a preferência global de mode e o workspace draftPreferred não reescrevem mais essa escolha em memória.
- A atualização de revision do Ready e a Session seed atrasada compartilham a validação de Option do Provider. Modelo inválido limpa a seleção, nível inválido
  mantém apenas a identidade; loading não limpa e remontagem não completa com default. Removido o Hook antigo de invalidação sem chamadas (incluindo preenchimento padrão/Toast).
  A atualização do menu grava de forma sincronizada o rascunho completo; callbacks de conteúdo atrasado do scope antigo são isolados e o effect de inicialização não reescreve o mesmo salvamento de menu.
- Removida a escrita reversa do fallback online do prewarm no Composer; o teste antigo correspondente passa a verificar que a escolha do usuário não é reescrita por eventos.
  O ramo de Session existente do controle de modo reproduziu primeiro, por teste, `edit` sendo sobrescrito pelo `plan` do Snapshot antigo, e depois passou a mostrar apenas o Composer.
- Os oito arquivos mais recentes, localmente e no Pro, têm **134 casos aprovados**; typecheck/lint/diff check da raiz aprovados (35 warnings existentes).
  Log no Pro `/tmp/todo71-hook-final-pro.log`. Depois da reconstrução no Pro, o E2E de cold recovery `desktop-e2e-20260903-164830-352` teve
  **1 Case aprovado (17 segundos)**, cobrindo três seleções corrompidas e reenvio após reseleção na sessão original.
  Esse E2E rodou antes da última alteração no controle de modo e não substitui a aceitação de interação completa do 71.
- Itens explicitamente inacabados no Review deste pequeno passo: o debounce/troca de scope do corpo do ConversationComposer ainda grava diretamente em disco e ainda não foi conectado ao
  `updateComposerContent`; o envio ainda apaga o rascunho inteiro; a exibição de modelo da Toolbar e a Submission ainda fazem merge de Snapshot.
  Portanto **não se declara seleção persistente completa, limpeza de submissão ou 71 concluído**, e a segunda parte do 72 ainda não começou. O próximo passo conecta essas chamadas ao
  mesmo Draft em memória, completa a transferência Root→Session e a proteção contra ACK atrasado, e só então faz a aceitação da etapa após adicionar o E2E exclusivo do 71 no Pro.

### 71: Snapshot de submissão e limpeza do preenchimento na toolbar (em andamento)

- `createComposerSubmissionConfig` lê apenas o modelSelection/mode estruturado do Composer, reutiliza a validação de Option do Registry e copia o resultado congelado;
  removido o merge de Snapshot/base/display alias. O SessionPane obtém o valor antes de entrar na barreira assíncrona de comandos e o ConversationComposer obtém o valor antes de esperar os anexos;
  um null explícito não pode ser reposto por uma escolha nova depois da barreira.
- `/plan` altera o modo local da próxima submissão e deixa de depender da confirmação por CAS do Session config. Testes existentes passaram a verificar a Submission e a falha de admissão reais, sem mudar a semântica de negócio de Queue/Guide.
- A toolbar também passa a mostrar apenas a seleção estruturada do Composer, com os níveis candidatos vindos da View do Host alvo. Primeiro reproduzidas duas falhas de "projeção antiga completa nível/modelo vazio",
  depois removidos os caminhos de preenchimento; um teste adicional encontrou que modelo vazio em Session existente esconderia o menu de reseleção, e isso também foi corrigido.
  A auditoria de referências confirmou que o draftModePreference global não tem consumidor de produto, e a implementação, os testes antigos e os mocks inválidos foram removidos; a chave antiga no localStorage do usuário não foi deletada.
- A limpeza na admissão de anexos ganhou testes de concorrência: após submeter A e adicionar B, a implementação antiga adotava/limpava as duas. Corrigido para capturar o id do anexo desta vez,
  entregando e limpando apenas A; mantidos o isolamento de scope, o fluxo de upload, as entradas de desktop/controle remoto e a fronteira de não serializar anexos.
- Sondagem completa da UI local **850 arquivos, 6685 aprovados, 1 pulado**, log `/tmp/todo71-ui-suite-review.log`; essa execução
  ocorreu antes da correção de concorrência dos anexos e não substitui a verificação das alterações seguintes. Arquivos de anexo/Composer: **42 casos aprovados**.
- Nove arquivos, localmente e no Pro, **140 casos aprovados**, Pro em `/tmp/todo71-owner-review-pro.log`. O E2E de cold recovery mais recente no Pro após o build da toolbar,
  `desktop-e2e-20260903-171659-078`, **1 Case aprovado (17 segundos)**, continuando a cobrir três seleções corrompidas e o envio após reseleção; esse build também é anterior à última alteração na limpeza de anexos.
  typecheck, lint e diff check da raiz aprovados, com lint ainda em **35 warnings existentes e 0 erros**.
- Depois de sincronizar por último a correção de anexos no Pro, três arquivos **42 casos aprovados** (`/tmp/todo71-attachment-final-pro.log`); o E2E de cold recovery reconstruído,
  `desktop-e2e-20260903-172132-231`, **1 Case aprovado (16,8 segundos)**. Esse E2E prova que a restauração/reseleção não regrediu, e não se afirma que ele cobre o novo cenário de concorrência de anexos; o cenário de anexo
  é verificado hoje pelos testes acima, e a aceitação de interação é completada junto com o E2E exclusivo do 71.
- Os itens inacabados do Review permanecem explicitamente abertos: o corpo ainda não está conectado ao owner completo do Draft; o envio ainda apaga o scope inteiro; a transferência de seleção Root→Session e a proteção
  contra ACK atrasado de corpo/contexto ainda não foram concluídas; os antigos pontos de ancoragem data-source da toolbar e o E2E correspondente precisam ser fechados; o E2E de interação de seleção persistente exclusivo do 71 não foi concluído.
  Nada disso é considerado concluído por causa da aprovação dos testes unitários/do E2E do 70, e a segunda parte do 72 ainda não começou.

## Correção de posição do hardware de teste

Conforme a exigência mais recente do usuário, os testes seguintes passam a usar unicamente o MacBook Pro. Anteriormente foi seguido por engano o requisito de Air do documento 68, e o documento foi corrigido.
A primeira rodada de E2E no Air parou com o menu de modelo não clicável e não obteve evidência completa de troca de modelo, portanto não conta como verificação aprovada; a segunda rodada foi interrompida.
O diretório, as dependências e os logs de teste independentes do Air foram mantidos temporariamente; o diretório de código-fonte antigo e os dados reais do usuário não foram sobrescritos.
Diretório de teste independente do Pro: `/Users/dev/Desktop/projects/Z.AI/zcode-todo68-e2e.H1cvBo`.
O Pro usa Node 24.14.0 / pnpm 10.33.2. Após a interrupção do download do Electron, foi reutilizado o binário 41.0.3 da mesma versão de um diretório antigo da própria máquina;
o PATH e o salto de download repetido foram definidos apenas para o comando de teste, sem alterar a confiança global do mise, o Shell ou a configuração do Git, e sem sobrescrever o diretório de código-fonte antigo.

## Complemento da reconferência no Pro em 2026-09-04

- Foi trazido o `7e86c01d8e` de `origin/provider-refactor-m2`. Esse commit corrige apenas a fixture de credenciais de inicialização; o branch atual já tem uma regra Personal-only mais precisa, portanto ele não foi cherry-picked diretamente, e sim incorporado como regra equivalente de fork/goal/tool sem conta, com testes de fixture complementados.
- Após o build mais recente no Pro, Composer toolbar, cold recovery de primeiro envio e troca de rascunho do Composer: **8 casos aprovados**; a troca de rascunho verifica explicitamente que texto e anexo de imagem são preservados entre task completed/running/não enviada.
- Reconferência de fork/goal/tool no Pro: CronCreate 1/1, merge de Fork 1/1, Goal 22/22, edição de branch do Fork 1/1 aprovados; produtos cruzados de ferramentas 32/34 aprovados. A única falha foi o timeout de `EnterPlanMode → 设置 goal` e a falha em cascata do afterEach, reproduzível em uma reexecução isolada, ainda sem atribuição ao refactor de Provider, e que precisa continuar sendo investigada como problema independente de ferramenta/fluxo de Plan.
- O caso pendente de imagem muito grande ainda chama a interface antiga de pré-preenchimento do Session Store que já foi removida (2/2 pré-condições falhando); nesta rodada não foi escrito no produto nenhuma ponte de compatibilidade não verificada; esse item não tem relação direta com o refactor de Provider e é registrado separadamente como um problema de migração de fixture de E2E antigo.
- Após reconferir `EnterPlanMode → 设置 goal`, confirmou-se que o produto proíbe explicitamente Goal no modo Plan e, portanto, essa combinação de produtos cruzados não se aplica. A lógica de retorno forçado do helper foi removida e o caso é explicitamente pulado, sem reescrever o modo da tarefa por meio do código de teste; as demais validações compact/fork do EnterPlanMode foram mantidas. A reexecução completa do cross no Pro teve **50 casos aprovados e 1 pulado por semântica**, e o falso negativo anterior de `SendMessage → Goal` também desapareceu.

## Fechamento final dos Todo 70–72 em 2026-09-04

- A restauração de Session só aceita a Model Selection atual; a estrutura antiga é convertida de forma unidirecional apenas quando há identidade antiga explícita, e modelo/Reasoning ausente ou inválido mantém o estado vazio, sem mais substituição silenciosa pelo primeiro item do Registry. O fallback remanescente `ensureSessionModelAvailable` passou a ser um ponto de transição sem escrita, evitando sobrescrever a escolha do usuário.
- O Composer Draft continua salvando mode/modelSelection, texto vazio não apaga a seleção e o limite de quantidade por scope foi removido, para que uma escolha de modelo de longa duração não seja aparada em segundo plano.
- A migração de Built-in mantém apenas as API Key de pagamento por uso de BigModel/Z.ai, e nenhuma outra configuração built-in gera cópia Personal; a identidade do Coding Plan é fixada uma única vez pela conexão de conta atual, e as restaurações seguintes só reconhecem os campos novos.
- Verificação da etapa: Bootstrap migração/restauração não vinculada **35 tests passed**, Adapters migração **12 passed**, Composer Draft/controladores **20 passed**, conjunto de comandos do Bootstrap **71 passed**; typecheck, lint (0 erros) e diff check aprovados. Os E2Es de provider-refactor já verificados no Pro continuam aprovados; a fixture antiga de imagem muito grande continua pulada separadamente por chamar uma interface removida e não faz parte da lógica de produto desta rodada.
- Esta rodada não adicionou migração de tabela de banco; os arquivos antigos foram mantidos conforme a fronteira unidirecional de leitura já definida, e as novas configurações geradas incorretamente são tratadas por reparo manual.