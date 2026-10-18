# Todo 99: Transição confiável para a arquitetura de conexão única — entrega do estado de conta e consumo da seleção efetiva

> Verificação de atribuição atualizada (2026-09-09): a dívida residual de subteste/falha/promoção manual deste documento é transferida para [Todo102](todo-102-verification-debt-closeout.md), encerrando o agendamento de verificação independente aqui; as evidências históricas são preservadas, e a transferência não significa que os testes passaram.

> Status: implementação e re-revisão do escopo de decisão desta rodada concluídas; 2026-09-09. As cinco correções, a revisão entrada por entrada e as duas condições de corrida locais foram fechadas em ciclo, e a requisição real de Worker no Pro e a validação no Electron passaram. A W99-E05, de validação conjunta real em celular com shared-host e SSH, foi explicitamente adiada pelo usuário (a página de teste Web da mesma versão ainda não está pronta); isso não conta como critério de conclusão desta rodada e também não se afirma que foi verificado. Os commits e as verificações finais estão no registro ao final e no livro de re-revisão.
> Baseline: 86bbe157c88e8e599694afb53c39f6dac125ac08. Base factual: [relatório de investigação do Todo100](../research/todo100-account-provider-selection-investigation.md). O antigo Todo99 ("complementar apenas states/Subagent, sem ajustar o momento da sincronização") é substituído por este plano; o relatório de investigação é preservado como evidência histórica.
> Redução de escopo (segunda decisão do usuário em 2026-09-09): a sincronização passa a reutilizar o momento, a fila, as checagens e os caminhos de falha já existentes; são cancelados a reestruturação do ciclo de vida, um novo sistema de retry, uma fila de merge latest e a remoção em massa de ensure. Só se corrigem campos perdidos no transporte, confirmações erradas e problemas determinísticos e locais. As fases, os casos e os critérios de conclusão abaixo já foram reduzidos de forma correspondente.
> Esta rodada entra em produção com o produto de conexão única atual; o [Todo101, Providers de Account concorrentes](./todo-101-concurrent-account-providers-draft.md) continua como Draft adiado, não é implementado antecipadamente e não altera o formato de persistência/migração.
> Re-revisão de segunda rodada entrada por entrada, reprodução determinística de condições de corrida e registro contínuo de verificação: [livro de re-revisão da implementação do Todo99](../research/todo99-implementation-review.md). O E2E de produto continua com os mesmos critérios de conclusão para evidências; números de teste unitário não substituem essas evidências.

## 1. Objetivos, não objetivos e prioridades

Fazer a cadeia atual de seleção de modelos funcionar de forma confiável: fatos completos, snapshots autoconsistentes, nova intenção corretamente resolvida, despacho sem perder a seleção e execução fixa sem reinterpretação. O mecanismo de sincronização é transporte temporário de dados e não deve virar uma segunda plataforma de estado.

- **Tem que ser corrigido**: P100-01 perde os states de Account; P100-02 recebe uma versão falsificada como aplicada; P100-03 Subagent explícito burla a resolução comum; P100-05 o ramo com anexos perde Selection/contexto de execução.
- **Completar dentro dos limites já decididos**: P100-04, novos turnos ociosos de tarefas já existentes do Bot. A sincronização mantém os gatilhos e checagens existentes; não é preciso completar todo o ciclo de vida de Worker para considerar concluído.
- **Verificação local e correção conforme o possível**: R100-01, corrida de publicação ao trocar conexão/identidade durante a consulta de conta; R100-02, risco de ordenação ao ler o snapshot antes de enfileirar. Prioriza o que já tem teste determinístico; quando exigir uma reestruturação ampla de orquestração, registrar e adiar, sem que isso vire pré-requisito desta correção de consumo.
- **Revisar sem reescrita mecânica**: Composer, tarefas agendadas, Wiki, título, Compact, Memory ecrianças distintass. Distinguir nova intenção, execução herdada e Submission já aceita.

Não faz parte deste item: múltiplas pessoas/Teams conectados ao mesmo tempo, páginas de Configurações puramente de navegação, novo formato de identidade de Provider, migração de persistência, unificação de capacidade de conta do CLI de terminal independente, remoção da sincronização temporária, perseguir a configuração mais recente a cada envio, troca automática de Provider dentro de Factory/bind, reescrita do provisioning SSH ou do attachment do celular.

A única conta de login conectada decide o domínio ocioso de BigModel/Z.ai; um Ticket já vinculado não é revinculado entre contas/domínios. Esta rodada não adiciona a escolha de "de qual pessoa/Team descontar no modo ocioso".

### 1.1 Lista final de decisões (entrada de implementação e revisão)

Os sete itens abaixo são o escopo completo desta rodada. O design, as fases e os casos posteriores servem a essa lista e não podem retransformar em obrigatórios a refatoração de sincronização já cancelada.

| Categoria / item | Problema confirmado ou objeto de revisão | Tratamento e limites desta rodada | Base de aceitação |
| --- | --- | --- | --- |
| Correção 1 / P100-01 | Host -> Worker perde states, deixando passar pacote de conta não atual | completar a entrega integral; não estender current a Provider comum/Off-Peak | conjuntos reais do Registry e ida e volta pelo protocolo, W99-01/02/05 |
| Correção 2 / P100-02 | versão de entrada se passa por versão aplicada; reenvio do mesmo valor pode pular a reexecução após falha | corrigir局部mente a semântica de confirmação e a condição de repinagem, sem reconstruir o sistema de entrega | conferência de versões de Source/Registry, casamento após divergência, recuperação de falha, W99-06/07/08 |
| Correção 3 / P100-03 | Subagent explícito não usa a Effective Selection comum | resolução comum local do Worker, cobrindo montagem direta/aninhada/Workflow/Script; execução precisa depois de fixada | requisição real de child, profile original inalterado, contraste herança/override, W99-03/04/12/13 |
| Correção 4 / P100-05 | o ramo com anexos perde Selection e modelExecution | completar até o lado de execução, mantendo o mesmo contrato de escolha do texto puro; não contornar antes alterando o modelo da Session | comando/requisição reais, ordem dos anexos, escopo de execução/Ticket, W99-14 |
| Correção 5 / P100-04 | novo turno ocioso de tarefa existente do Bot não obtém uma seleção efetiva válida | resolver antes do despacho e realmente passar o resultado; não reescrever entradas busy/Guide/queue já aceitas | requisição real do novo turno e config original do Bot inalterada, W99-15 |
| Revisão 1 / entradas de consumo | Composer, tarefas agendadas, Wiki, título, Compact, Memory,crianças distintas | distinguir nova intenção de execução fixa/herdada; verificar se o resultado se perde e se a intenção persistente é sobrescrita por engano; manter o que está correto | conclusões entrada por entrada da seção 3 e W99-16; não modificar mecanicamente semânticas novas |
| Revisão 2 / condições de corrida locais | R100-01/02: mistura de identidades nova/velha, posse de resultado/confirmação obsoleta | só corrigir com evidência determinística e reparo local de baixo risco; adiando reformulações grandes | teste/log local ou registro explícito de não verificado, sem portão de saneamento global de sincronização |

Mantêm-se três limites específicos:

- "usar o resultado de resolução antigo" significa fazer a resolução comum com o **snapshot completo antigo** que o Worker já tinha aplicado, e não continuar permitindo que o Subagent explícito burle o algoritmo comum.
- "pequena mudança cautelosa" permite que a sincronização continue com atualidade insuficiente, mas não permite recriar nesta modificação fatos de conta misturados, sucesso falso, troca silenciosa de modelo ou perda de intenção persistente. Riscos que só podem ser resolvidos com uma grande mudança devem ser registrados com impacto concreto para uma segunda decisão, e não escondidos como já corrigidos.
- Mantêm-se o momento da sincronização, a fila, o ensure e os caminhos de falha já existentes; não se adiciona espera ao envio comum, não se unifica o ciclo de vida, não se adiciona retry periódico/merge latest, não se altera Factory/bind, não se altera persistência/migração e não se implementam o Todo101 nem a reformulação de conta do CLI independente.

## 2. As duas cadeias que precisam ser preservadas

### 2.1 Produção, entrega e aplicação de fatos

~~~text
Host 设置/账号查询                     Host/Worker 各自的配置来源
        |                                        |
        v                                        |
一次完整 Account 结果                            |
[revision + basedOnBuiltin + overlays + states]   |
        |                                        |
        +--> Host Registry 完整应用快照           |
        |                                        |
        '--> 既有 Host -> Worker 同步              |
                  |                              |
                  v                              v
             Account Source ------------> Worker Registry
             接收事实                     匹配来源、整体应用
                  |                              |
                  v                              v
             receivedRevision             已应用完整快照
             只证明已送达                 供 View/解析/执行读取
~~~

Essa correspondência de origem e a preservação do snapshot antigo são um mecanismo já existente do Registry, e não uma máquina de estado de sincronização criada por este item. Aqui, "configuração correspondente" significa especificamente que o basedOnZCodeBuiltinRevision do Account bate com o zcodeBuiltinRevision do Config, e não que todo o conteúdo de configuração ou a versão global dos dois lados precisam ser idênticos instantaneamente.

É permitido que o Host já tenha aplicado B enquanto o Worker ainda aplica o A completo. Não é permitido que o Worker misture os modelos de A com os fatos de conta de B, nem que reporte B aplicado quando o que vale é A. Quando inicialmente não há resultado completo utilizável, a indisponibilidade é explícita e não se forja executabilidade de conta.

A revision reaproveita a identificação de conteúdo já existente e inclui fonte Built-in, Overlays e states; mudar apenas current também produz um resultado diferente. Ela não é um relógio incremental, é proibido inferir ordem por comparação de tamanho de string, e não se cria um segundo conjunto global de revision.

### 2.2 Nova intenção, seleção fixa e criação de Model

~~~text
原配置/原草稿/显式子任务模型意图
                |
                v
公共解析（目标执行环境的一份已应用快照）
                |
                v
临时有效选择 + 不完整/不可用原因
                |
        完整才进入既定提交/派发边界
                |
                v
固定本次 Selection / 已接纳 Submission
                |
                v
ModelFactory 精确校验 -> 创建 Model -> 请求
       不再 remap            不因后台变化换模型
~~~

- Falha de resolução, refresh e abertura de menu não limpam a intenção persistente. A escrita de volta continua sendo responsabilidade dos limites já existentes de accepted/salvamento explícito de cada negócio, e não é unificada em "grava ao ler" nem em "todos os negócios gravam após o envio".
- Uma seleção já fixada é validada diretamente com precisão. Se o usuário mais tarde submeter explicitamente uma troca de modelo/Guide, essa é uma nova entrada legítima e não significa que o backend possa reescrever a requisição antiga.
- A escolha de conta original mapeia para o mesmo modelo/mesmo nível do Account Provider comum atual; sem o mesmo modelo, não se escolhe o primeiro modelo, e quando o nível não é suportado não se completa com um nível default. O Provider comum mantém a identidade original.
- A autenticação por requisição e a validação final do Factory são mantidas; uma resolução bem-sucedida não promete que a requisição futura terá sucesso. Em caso de falha não se troca de Provider em segredo para tentar de novo.

## 3. Superfície de impacto e tratamento entrada por entrada

A proteção local de publicação de R100-01: as configurações e a identidade de conta lidas nesta rodada são validadas novamente quando a consulta termina. Se houve mudança no meio, o resultado desta rodada é rejeitado e o previousScopes do Resolver não é avançado (caso contrário um resultado não publicado poluiria o julgamento last-known-good da próxima rodada). Mantêm-se os caminhos de refresh/erro já existentes do AccountService, sem polling, retry ou transação global novos. Só se garante que mudanças de escopo observáveis não sejam publicadas, e não se afirma resolver a corrida global de identidades A→B→A que não tem versão de identidade monotônica.

| Entrada / owner | Entrada e resultado | Tratamento nesta rodada | Limite de salvamento/fixação |
| --- | --- | --- | --- |
| Host AccountService | configurações, identidade, entitlement -> Overlay + states | produção completa; verificação de mistura entre escopos | publica apenas fatos em memória, sem novo current persistente |
| Host -> Worker comum/Wiki | envelope de Account completo | completa campos e confirmação no caminho já existente; não reestrutura o momento de disparo | não escreve configuração do usuário |
| Worker Registry / Facade | config + account -> snapshot aplicado | reaproveita correspondência de origem, generation e resolução comum | publicação inteira, sem notificação por campo |
| Composer / hook de UI | rascunho original -> View + seleção efetiva | regressão de assinatura, isolamento de alvo, descarte de respostas antigas | limite original de accepted; não muda histórico por leitura |
| Subagent explícito | seleção estruturada do profile -> seleção efetiva | obrigatório, resolução comum local do Worker; percorre a montagem de child | fixado antes da execução do filho; profile/Markdown não mudam |
| Subagent implícito / override interno | Active Model pai / override fixo | mantém herança e prioridade de override | não remapeia a execução pai, não usa herança para mascarar falha explícita |
| Tarefas agendadas | seleção salva -> seleção do novo run | auditoria/regressão da resolução de despacho já existente | após fixar o run não resolve mais; config original da tarefa inalterada |
| Criação inicial do Bot | rascunho do Bot -> nova tarefa | regressão da View comum já integrada | limite original de criação/accepted |
| Novo turno ocioso de tarefa existente do Bot | intenção original -> seleção efetiva desta vez | completa a resolução e passa o resultado de verdade, não apenas validar e descartar o resultado | fixado antes do despacho da nova entrada |
| Bot busy / Guide / queue | Submission já aceita | mantém CommandInbox, seleção fixa original e ordenação | não faz remap automático no enfileiramento/desenfileiramento |
| Envio de tarefa com/sem anexos | Selection + modelExecution + payload | corrige a perda do ramo de anexos, mantendo o contrato | não contorna alterando antes o modelo global da Session |
| Wiki | nova geração / retry após fixação | a primeira já tem resolução comum; a segunda permanece fixa | retry não troca de modelo |
| Título / Compact / Memory | Model em escolha independente ou herdado | classificar caso a caso; sem chamada de Facade não se classifica bug automaticamente | execução herdada não muda; trabalho novo independente exige contrato confirmado antes |
| Off-Peak | seleção + escopo de Ticket | regressão sem perda de contexto e com vínculo inalterado | não troca de ticket entre contas/domínios |
| SSH / celular | Host alvo + workspaceIdentity | isolamento de alvo e regressão de protocolo | não cria runtime de celular novo, não muda nenhum dos dois deliveries |

Verificar se os Workers que consomem o modelo recebem o envelope corrigido pelos caminhos existentes; tanto os caminhos comuns quanto os de Wiki precisam de regressão, sem forçar a unificação em uma entrada única de ciclo de vida. Não adicionar gate de conta a Plugin/MCP nem a Client somente leitura.

## 4. Design de implementação concreto

### A. Contrato de Account completo, sem ampliar o significado de current

1. Verificar ao mesmo tempo a serialização do Host, o schema estrito do protocolo compartilhado, a decodificação do Worker, a Mutable Source e a entrada do Registry. Não basta um teste com mock enxergando o campo.
2. O envelope carrega states explicitamente, e "Worker antigo não conhece/o remetente não enviou" não pode ser tratado como fato completo de conta. O fail-closed inicial pode não ter pacote utilizável, mas isso não pode autorizar a passagem de um pacote de conta comum com entitled=true e current perdido.
3. Template comum/Provider customizado e Off-Peak não precisam de current. A verificação de ausência fica restrita ao contrato de fato de conta comum dos Workers gerenciados e não pode atingir CLI independente nem Provider que não seja de conta por meio de uma alteração global do Resolver.
4. states não são credenciais; não colocar token OAuth nem segredo de Key em novos campos ou logs. A identidade de conexão segue os canais confiáveis já existentes, e o diagnóstico é mascarado.
5. Quando Host e Worker usam a mesma base de configuração, comparar o conjunto final executável; quando a base está temporariamente diferente, validar cada snapshot completo, sem exigir igualdade instantânea.

Entradas principais: sources, registry-service e resolver de packages/provider/src; zcodeAgentService de services; shared/zcode-protocol; process-provider-registry-runtime e zcode-protocol/account-provider-config de bootstrap.

### B. A sincronização mantém o mecanismo antigo e corrige apenas erros locais determinados

Complemento de ordenação local (R100-02): a fila serial já existente de cada Client deve incluir o Source.read, e não apenas o RPC; caso contrário um read iniciado antes, mas retornado depois, inseria resultado antigo depois do novo. Mover a leitura para a fila original, sem adicionar merge, retry ou entrada de espera de negócio. Aceitar com um teste determinístico de Source atrasado.

**Cancelado: o plano de reestruturação de ciclo de vida da versão anterior.** Manter o push de mudança de source já existente, os ensures de cada entrada, a fila serial por Client e a deduplicação por revision. Não adicionar registradores, fila de merge latest, sistema de retry com backoff limitado nem remoção em massa de checagens pré-operação. Remover depois a sincronização temporária não vale a pena acabando com uma plataforma independente nesta rodada.

O envio comum de mensagens não ganha uma barreira de "esperar a sincronização de conta mais recente". As checagens de sincronização que já existem em pontos como criação/restauração são mantidas temporariamente, e não se afirma ter eliminado toda dependência de sincronização de negócio. Continua permitido resolver com um snapshot completo antigo, ou falhar explicitamente quando o modelo escolhido ainda não está disponível; sem trocar de modelo em segredo e sem limpar a intenção original.

Mantêm-se três correções pequenas:

1. A entrega completa de states de ponta a ponta da seção A.
2. O recibo não pode passar a revision de entrada como appliedRevision. O alinhamento local vira confirmação de recebimento (como receivedRevision), com a alteração correspondente do cache/chamador; a versão realmente aplicada pelo Registry continua saindo do snapshot já existente. Não adicionar notificação reversa de aplicação, handshake de espera de aplicação nem uma segunda máquina de estado.
3. Source inalterado não significa que o refresh anterior do Registry teve sucesso: quando o mesmo resultado é reenviado, ainda é possível repetir o refresh incompleto. Falha não registra sucesso falso, e a recuperação posterior segue as entradas/chamadas já existentes, sem retry periódico novo.

Se o ajuste do recibo do protocolo revelar um impacto muito maior que a cadeia local de envio/recebimento/cache, registrar primeiro o impacto real e só então discutir; não se aproveita para ampliar a plataforma de protocolo. Verificações de versão/capacidade seguem o mecanismo de deploy já existente, sem inventar um esquema de upgrade automático.

O comportamento já existente do Registry é o seguinte:

~~~text
当前已应用完整 A
    |
Account B 到 Source，标明它基于 Built-in B
    |
Registry 刷新：本地 Built-in 还是 A，不匹配
    |
保留已应用 A（不发布拼接结果）
    |
已有 Config Source change：Built-in B 到达
    |
再次刷新：来源匹配 -> 一次性应用完整 B
~~~

Isso não exige guardar uma fila de múltiplas versões: o Account Source mantém o fato mais recente recebido, e o Registry mantém o último resultado aplicado por completo. Config/Account já têm assinatura de mudança nos dois lados, e qualquer mudança em um dos lados dispara refresh. Quando a configuração correspondente nunca chega, não se garante o acompanhamento automático e apenas o resultado completo antigo é mantido; quando ainda não há snapshot antigo pela primeira vez, também não se finge ter uma conta já executável. Esses limites são mantidos e não são expandidos nesta rodada para uma engenharia de espera/recuperação na inicialização.

Foco da regressão: divergência não publica, após o casamento pode-se aplicar, o recibo não mente, e o reenvio do mesmo valor consegue atualizar. Falha de envio/falha de aplicação não promete cura imediata, e esta correção não introduz espera infinita nem retry.

### C. Entradas de nova intenção reutilizam a resolução, sem afundar no Factory/bind

Subagents explícicos obtêm a porta de resolução somente leitura do mesmo processo por injeção de dependência e reutilizam internamente a ModelSelectionFacade comum e o mesmo snapshot aplicado. O Core não importa serviços do Host nem implementações concretas de Runtime, e não faz RPC reverso ao Host.

1. Preservar a seleção efetiva e o motivo do problema no resultado comum, sem devolver apenas selection ou null e perder o significado do erro; não duplicar um segundo conjunto de DTO/algoritmo.
2. Workers gerenciados precisam montar a porta, e a ausência não pode burlar a resolução em silêncio. O CLI independente mantém o status quo dentro do escopo já decidido: essa é uma diferença explícita de montagem, não algo determinado por uma passagem faltando por acaso.
3. O Markdown do usuário e o JSON de Subagent embutido já chegam estruturados ao Core e compartilham o ramo explícito; não reler campos antigos nem modificar arquivos do usuário.
4. Child direto, child aninhado, workflow e script child atravessam a dependência. Validar a cadeia real de criação e a requisição, não apenas o helper.
5. Herança implícita, override interno e execução fixa permanecem iguais; uma seleção explícita incompleta falha pelo mecanismo de erro original, sem recorrer ao modelo pai, ao primeiro modelo do pacote ou ao nível mais alto.

Prioridade já confirmada: primeiro decidir o override interno desta execução interna e só então decidir se é preciso resolver o profile. Quando há override, o resolvedor de profile não é chamado, evitando que uma execução já fixa no modo ocioso seja bloqueada por um profile inválido e irrelevante; o próprio override continua sendo validado com precisão pelo Factory. O caminho de Subagent que retoma um child já existente também precisa validar a seleção final de execução, e não pode substituir sucesso de restauração por sucesso de criação.

Entradas principais: runtime/methods/subagent e deps do Core do Runtime; create-app de bootstrap, entrypoint de protocolo e montagem de child de workflow/script. Factory e bind mantêm o significado de execução precisa, sem criar um sistema temporário de "fábrica dupla".

### D. Corrigir os pontos de quebra de consumo e despacho

**Anexos:** rastrear Selection/modelExecution por task adapter -> Agent Service -> protocolo -> runtime. A semântica é a mesma do texto puro, e a ordem dos anexos e o escopo de execução não mudam. Ao precisar completar campos de protocolo, sincronizar o schema estrito; não fazer setModel e depois enviar contornando a perda, nem reescrever todo o transporte de anexos.

Complemento da revisão de implementação: o envio antigo em background tratava o retorno de admission do `sendInput` como o fim da rodada inteira, liberando cedo o controller ativo e a posse do turno de Bot/automation. Só se corrige esse erro de ciclo de vida: o ACK continua retornando imediatamente; em background, a limpeza passa a esperar `started_turn.completion`, tratando explicitamente a rejection de admission. Reaproveitar as validações de Restrição busy/execução do Core, sem adicionar fila nem espera de conta mais recente.

**Bot: vincular à Session e reaproveitar os mecanismos já existentes da Session, sem contornar.** Essa é a decisão final do usuário, e não se espera mais a discussão sobre "configuração default":

1. Quando não está vinculado, é permitido criar um rascunho; depois de vinculado, o ModelSelection persistente daquela mesma Session é a única intenção original. O Bot não mantém uma segunda configuração de modelo vinculada e não sobrescreve a Session a partir de defaults do Bot.
2. `/status`, o menu de modelos e de níveis lêem essa Session; desktop e Bot modificam a mesma Session. O comportamento de herança já existente de `/new` é mantido, e não pode ser confundido com a escolha do default a cada envio em uma Session antiga.
3. `/model` e a mudança isolada de nível de raciocínio são comandos de configuração já submetidos da Session, têm efeito imediato e são salvos, **com o usuário já tendo confirmado que é permitido**. Não virar rascunho não submetido do Composer e não adicionar pending selection no Bot.
4. Corrigir a perda da seleção completa: o Bot já enviava provider/model/reasoning, mas o antigo `session/setModel` formatava tudo como string, e o setter da Session só guardava a identidade. A entrada compartilhada de modificação da Session precisa validar, aplicar e salvar a seleção por completo; o Bot não pode corrigir em patch com dois comandos, nem só corrigir o texto do status enquanto a execução real ainda perde o nível.
5. Uma nova mensagem ociosa em tarefa existente resolve o valor efetivo a partir da **seleção original da Session** pela View comum, na fronteira de despacho já estabelecida, e o passa de fato para aquela entrada. Falha não muda o modelo default nem limpa a intenção original; a resolução em si não grava dados persistentes. O salvamento posterior à submissão segue os limites já existentes da Session.
6. Entradas busy/Guide/queue já aceitas não são reinterpretadas, a admission do CLI é autoritativa e não se adiciona fila no Host. Anexos também carregam Selection/modelExecution; não modificar antes a Session e depois enviar contornando a perda. O alvo remoto continua roteado pelo Task Service já existente e isolado por workspaceIdentity.

Limite de leitura da implementação: o Task Service fornece `getTaskModelSelection` somente leitura e devolve, pela leitura da Session do Agent alvo, a seleção original estruturada; o `model.current` das configurações da Session preserva o valor original completo (incluindo níveis temporariamente inválidos), e a validação de candidatos/exibição continua a cargo da View correspondente. Não é possível inferir a intenção original a partir das opções do menu nem de um thoughtLevel já filtrado. Isso não acrescenta campo persistente nem um segundo estado de modelo.

~~~text
未绑定 Bot：创建草稿 -> 公共解析 -> 创建 Session -> 清理创建草稿
已绑定 Bot：同一个 Session 原选择
               +-> /model 配置命令 -> 完整校验/应用/立即保存 -> 既有状态投影
               +-> 空闲新输入 -> 公共有效解析 -> 固定本次输入 -> 既有 admission/执行/保存
已固定执行、继承子任务、已接纳输入：不重新映射
~~~

**Demais entradas:** registrar item a item como "já correto/lacuna confirmada/semântica indefinida", anexando cadeia de chamadas e testes. Título, Compact manual e Dream, caso tenham intenção de modelo independente, explicam primeiro a origem e o limite de fixação; não trocar todas as chamadas de ModelFactory pelo resolver.

**A inicialização default do Bot mantém o status quo:** "usar a configuração default" não é a configuração inteligente da página de edição de modelo. Apenas quando se cria um rascunho sem Selection, se usa o preferredSelection do Host alvo (um default configurado válido, ou o primeiro modelo inicializável pela ordem do Registry junto com o nível mais alto); uma Selection existente que falhou não pode cair para preferredSelection. Depois de vincular à Session, essa regra de inicialização deixa de sobrescrever a escolha da Session. Esta rodada não desenha uma estratégia de default separada.

### E. Princípio de preservar o snapshot completo, tratamento cuidadoso de corridas adicionais

Não adicionar uma camada de transação global. Consolidar nas fronteiras já existentes: o resultado de uma rodada de Account é publicado inteiro; o Registry aplica inteiro depois de casar configuração/conta; consumidores de fatos combinados leem uma única vez o snapshot aplicado.

- R100-01: com promises controláveis, trocar a conexão/conta B durante a consulta A e intercalar a conclusão das respostas de identidade, entitlement e configuração, verificando scope/current/models/LKG. O A completo antigo pode existir por instantes, mas os fatos de A não podem ser colados na identidade de B. Se houver reprodução de mistura ou de resposta antiga sobrescrevendo um escopo novo, capturar a origem na camada de produção e rejeitar submissões obsoletas, sem adicionar um remendo de timeout na UI.
- R100-02: priorizar a verificação da posse de respostas antigas por meio dos testes de fila/Client já existentes, sem tratar a revision de conteúdo como timestamp. Adiar qualquer proposta que exija um novo mecanismo global de merge latest, de ciclo de vida ou de ordenação; não é requisito de aceitação desta rodada.

Se a investigação só conseguir revelar insuficiência de atualidade da sincronização antiga, basta registrar a limitação; se ela confirmar mistura de identidade ou liberação indevida, avaliar um reparo local. Riscos que exigem uma grande mudança devem ser registrados como não corrigidos, com impacto, e levados à decisão do usuário, sem ampliar silenciosamente esta rodada.

## 5. Ordem de implementação e condição de saída das fases

Cada fase: conferir a spec -> teste vermelho -> implementação mínima -> verificação direcionada -> review completo -> escrever registro de execução. Bloqueios de ambiente pequeno são registrados e os itens independentes seguem; apenas mudanças de semântica de produto/permissão pausam para discussão. Uma fase aprovada não significa que o Todo inteiro está concluído.

| Fase | Trabalho | Condição de saída |
| --- | --- | --- |
| D99-0 baseline/experimentos | freshness, posse de dirty, diff em pausa, alinhamento de spec/catalog/matrix | lista do que foi adotado/reescrito/removido, sem misturar mudanças do usuário |
| D99-1 integridade de estado | A + correção de ACK/refresh repetido | W99-01/02/05/06/07/08; comparação real do Registry, não apenas teste de JSON |
| D99-2 regressão da sincronização existente (escopo reduzido) | manter gatilhos/fila/ensure atuais, verificar caminhos comum e Wiki; sem reestruturar ciclo de vida | W99-09/10 por regressão do mecanismo original; W99-11 adiada; sem nova barreira de envio |
| D99-3 Subagent explícito | C: porta comum, child real e todas as montagens | W99-03/04/12/13; requisição real correta, herança/override inalteradas |
| D99-4 outros pontos de quebra de consumo | D: anexos, novo turno ocioso do Bot; auditoria entrada por entrada | W99-14/15/16; semânticas indefinidas listadas à parte, sem ampliar limites busy/Ticket |
| D99-5 riscos locais e review de toda a cadeia | E; regressões de SSH/celular/reinício relacionadas a esta mudança; devolução de fatos à documentação | W99-17/19; W99-18 avança se puder ser verificado localmente, caso contrário registra adiamento; sem saneamento global de sincronização como portão |

**Publicação não pode ser quebrada:** completar states pode expor falhas de Subagent explícito que antes estavam mascaradas pela liberação indevida. Portanto D99-1 e D99-3 precisam ser aceitas em conjunto para se declarar usabilidade externa; os commits podem ser separados, mas "estado corrigido" não substitui a conclusão da cadeia de consumo.

Revisão dos experimentos pausados:

| Experimentação já existente | Plano de tratamento |
| --- | --- |
| envelope/entrega de states e testes de round-trip | a direção é reutilizável; completar a semântica faltante, as asserções de Registry e o ACK, sem declarar conclusão automaticamente |
| Facade compartilhada, callbacks do Core, propagação para child | revisar conforme C; manter algoritmo único, resultado de problema completo e montagem gerenciada explícita, removendo helpers sinônimos |
| retorno apenas de effectiveSelection ou null | completar o contrato de erro de resultado incompleto, evitando herança indevida |
| fixtures/dependências antigas de bootstrap quebrando | atualizar fixtures isoladas com o schema real, construir as dependências necessárias e testar de novo, sem afrouxar validações de produção |
| documentação de "ensure antes da operação" e "Host deve fazer contrapergunta" | ensure permanece como fato existente, sem exigência de limpeza; child explícito reutiliza a resolução local e não ganha contrapergunta ao Host |
| arquivos dirty de outras pessoas, testes/artefatos temporários sem relação | não reverter nem empacotar nos commits deste item |

## 6. Contrato de verificação e poda combinada

Mantêm-se as numerações existentes para não perder a trilha de decisões; W99-11 está explicitamente adiada e W99-18 é a investigação local que pode avançar, e o restante é verificado segundo o contrato reduzido. Nada abaixo constitui nova evidência de aprovação; os 52 testes unitários já existentes do Todo100 e a reprodução de ACK em memória não provam que esta correção passou.

| Case | Setup -> Action | O que precisa ser asserido / camada de evidência |
| --- | --- | --- |
| W99-01 | dois pacotes entitled, apenas Team current -> ida e volta pelo protocolo real | states sem perda; sob a mesma base, conjuntos executáveis dos dois lados iguais, e o pessoal não é liberado |
| W99-02 | muda só current -> publicação/entrega | a revision muda; modelo e current vêm do mesmo snapshot aplicado |
| W99-03 | escolha pessoal explícita, Team tem o mesmo modelo/nível -> Subagent | requisição real do child usa o mesmo modelo/nível do Team e a intenção original do profile não muda |
| W99-04 | modelo ausente, nível inválido, não especificado, override interno -> child | os dois primeiros falham por incompletude; os dois últimos mantêm herança/override, sem completar escolha |
| W99-05 | states ruim/ausente, sem entitlement inicial, API, Off-Peak -> aplicação | envelope ruim não é liberado frouxamente; fail-closed legítimo é expressável; não-conta/ocioso não precisa de current |
| W99-06 | já aplicado A; Account B chega antes, Built-in B ainda não -> sincronização | Source B, Registry A; confirma apenas received B, sem falso applied B |
| W99-07 | dá sequência em 06, Built-in B chega -> notificação de configuração | aplica B completo sem reenviar Account B, e a Facade se atualiza junto com a aplicação |
| W99-08 | após replace B o refresh lança erro -> reenvia B; depois testa recuperação no lado de aplicação | não cacheia sucesso falso, changed=false não bloqueia a recuperação, e o resultado completo antigo continua legível |
| W99-09 | inicialização/reconstrução de Worker existente -> sincroniza pela entrada original | campos/recibo corrigidos agem sobre o novo Client; sem novo registrador nem timer |
| W99-10 | caminho comum/Wiki pelo gatilho original -> sincronização/execução de conta | os dois caminhos existentes entregam o estado completo; sem novo gate somente leitura e sem nova barreira latest no envio comum |
| W99-11 | plano original: fila de merge latest, backoff limitado, ciclo de vida unificado | **adiada/não feita nesta rodada**; mantém-se a numeração para registrar a decisão de redução do usuário, sem entrar no portão de conclusão |
| W99-12 | requisição pai fixada, troca de conta em background -> child implícito/retry | Model/escopo originais inalterados, sem remap oculto |
| W99-13 | child direto/aninhado/workflow/script -> escolha explícita | montagem real atravessada, e não apenas teste de helper |
| W99-14 | mesma escolha, com/sem anexos -> runtime | Selection/modelExecution equivalentes, anexos ordenados e escopo de Ticket preservado |
| W99-15 | tarefa existente do Bot ociosa, troca de pacote -> próxima mensagem | valor efetivo realmente despachado, config original do Bot inalterada; entrada busy já fixada não é remapeada |
| W99-16 | intenção de Composer/agendado/Wiki inválida ou desconhecida -> refresh/despacho | intenção original preservada, novo despacho falha explicitamente; run fixado/retry de Wiki não troca de modelo |
| W99-17 | SSH + attachment de celular + reinício do Worker -> envio | workspaceIdentity não se mistura, celular reaproveita o Host alvo e os dois deliveries não se misturam |
| W99-18 | troca de conexão/identidade/configuração durante consulta atrasada -> conclusões intercaladas (investigação que pode avançar) | registra o resultado se puder ser verificado localmente; se exigir uma grande mudança, registra o risco e adia, sem exigir saneamento global de ordenação nesta rodada |
| W99-19 | Worker/protocolo de protocolo antigo, falha de protocolo -> início da entrega | incompatibilidade explícita/redeploy já existente, sem fallback silencioso nem confirmação falsa |
| W99-20 | Bot vinculado, `/model` entre modelos e escolha de reasoning, depois leitura de estado, recuperação fria e envio | Selection completa salva imediatamente e requisição real consistente; nível explícito ilegal não gera meia modificação; sem novo tipo persistido de seleção no Bot |

Poda e arranjo de evidências:

- Conta comum pessoal -> Team com o mesmo modelo representa o remap; identidades diferentes de Team e BigModel/Z.ai são cobertas por classificação concentrada/testes de protocolo, sem permutação completa de pacotes, temas e idiomas.
- Ordenação com promises controladas/injeção de falha, sem depender de sorte na rede real nem de sleeps longos. Nova intenção, Submission fixa, herança implícita, override interno e Ticket não podem ser podados em um único caso de sucesso.
- UI e requisição/protocolo/dados persistentes são asseridos em conjunto; testes unitários de helper de Bot/anexos/child não passam por E2E.
- Registrar os casos de interação representativos na seção específica do Todo99 do [Case Catalog](../../../conversation-session-case-catalog.md) e do [Coverage Matrix](../../../testing/conversation-session-e2e-coverage-matrix.md). Atualmente todos estão missing/planned, e não são cobertura formal.
- Novos E2E entram primeiro em manual-review/pending, reaproveitando helpers do V4 e fixtures/manifests locais do caso. Texto comum usa fast-text; janela de execução usa controlled-stream com o motivo registrado. Só após a evidência de revisão eles são promovidos pelo fluxo já existente, com fixture check, replay e admissão em Docker isolated; mover de diretório não significa aprovação.
- Preferir na máquina de E2E o MacBook Air disponível; o Pro pode substituir, registrando a máquina real. SSH/celular avançam quando o ambiente estiver disponível, e o que não foi executado fica explicitamente reservado, sem usar o desktop como representante de todos os lados. Isolar os dados de teste e não alterar contas/tarefas reais nem limpar dados remotos sem autorização.

## 7. Documentação, grafo e revisão por fase

Antes da implementação, conferir as specs atuais correspondentes, em especial os fatos de Account/Registry, Model/Submission, montagem de Subagent e controle remoto. A seção de Model do conversation-protocol-declaration ainda tem tipos antigos e uma redação antiga de readiness/fallback, e não se pode usar isso para adicionar barreira de sincronização ou troca de modelo; o ensure já existente é mantido nesta rodada. Só corrigir as cláusulas de fato confirmadamente afetadas por este item, sem reescrever todo o protocolo de sessão.

O codegraph não está disponível no momento; adota-se a cadeia de chamadas direcionada do Todo100 e as sementes do grafo funcional, sem alegar que a indexação automática de todo o repositório foi concluída. Depois da implementação, devolver à documentação os fatos confirmados: resolução comum local do Worker; criação inicial e posteriores do Bot separadas; Source received e Registry applied separados. Não é possível registrar antes do tempo o design alvo como implementação.

Toda revisão por fase precisa responder:

1. foi corrigida a causa raiz ou foi accumulating remendo? Algum algoritmo duplicado ou ligação temporária pode ser removido dentro desta mudança? Isso não autoriza uma limpeza em massa dos ensures de sincronização já existentes.
2. De qual fato completo veio o resultado? Houve junção de valor novo do Source com valor antigo do Registry?
3. A entrada é nova intenção ou execução fixa? Quem salva e quando? Está sendo limpa ou substituída em segredo?
4. Worker comum/Wiki e child estão todos cobertos? Protocolo/montagem ainda perdem campos ou burlam algo?
5. Não-conta, Ticket, workspaceIdentity, desktop continuous/mobile replayable e o escopo do CLI foram respeitados?
6. Quais testes falhando, requisições reais ou logs provam a aprovação? O que ficou sem verificação? Marcar o status de cada cláusula do Todo.

## 8. Registro de execução e definição de conclusão

Complemento real de W99-E04 (2026-09-09): quando o ModelFactory lança um erro no tratamento de erro interno do Turn, a implementação antiga apenas registrava uma exceção em background, o comando aceito não tinha evento de estado final e a interface não mostrava erro. Nesta rodada, falhas na criação do Model passam a ser reportadas reaproveitando o evento de outcome de Turn já existente (mesmo inputId), sem fabricar requisição de modelo, sem trocar a seleção e sem esperar a entrega de conta. Falhas já tratadas pela camada interna não podem ser reportadas duas vezes; cancelamento continua mantendo a semântica de cancelamento. Não se aproveita para reescrever todo o tratamento de erro das outras etapas de inicialização.

Status: aguardando implementação, em implementação, verificado, aguardando verificação de ambiente, aguardando decisão, explicitamente não alterado. Registrar achados, evidências, decisões, mudanças, commit/run/artifact; não registrar análise concluída como correção feita.

| Item | Status atual | Evidência / próximo passo |
| --- | --- | --- |
| Correções finais e revisões das duas categorias | em implementação | 2026-09-09, ver seção 1.1; a decisão final de redução prevalece sobre o plano antigo |
| P100-01 estado completo | verificado | envelope estrito, conjunto real do Built-in Registry, requisição após troca de Team no Host→Worker do Pro; deploy entre versões não foi fingerado como verificado |
| P100-02 confirmação/repinagem após falha | verificado | received do protocolo separado de applied do Registry; repinagem do mesmo valor; recuperação real com A antigo→entrega B→novo envio no Pro |
| P100-03 Subagent explícito | verificado | DI percorre Core/Workflow/Script; requisição real de child, execução filha de Workflow e integração de resume; profile pessoal→Team/high no Pro, com escolha pai e profile inalterados |
| P100-05 despacho de anexos | verificado | protocolo estrito/Task adapter/requisição real de Worker; anexos ordenados, execução high não sobrescreve Session low, contrato de isolamento de Ticket inalterado |
| P100-04 novo turno ocioso do Bot | verificado | entrada do Bot→Task adapter de produção→requisição real de Worker do Team; `/model`, nível e recuperação fria do processo mantêm a Session autoritativa |
| Revisão das demais entradas de consumo | concluída, item a item no livro de re-revisão | Composer, agendado, Wiki, título, Compact, Memory,crianças distintas, Bot busy e Off-Peak classificados por nova intenção/execução fixa, sem modificação mecânica |
| Revisão de condições de corrida locais | correções locais concluídas | conferência de identidade/configuração antes e depois em R100-01; read incluído na fila original do Client em R100-02. Atomicidade global não é declarada implementada |
| D99-0 baseline e revisão dos experimentos pausados | impacto deste lote revisado | freshness de 2026-09-09 aprovado; outros arquivos dirty preservados |
| D99-1 a D99-5 (versão reduzida) | fechado no escopo desta rodada | evidências de testes em camadas, requisições no Pro e recuperação de falha no livro; validação conjunta real em múltiplos dispositivos adiada e listada à parte |
| Autoridade da Session do Bot / momento de submissão dos comandos de configuração | verificado | modelo e nível completos validados/salvos de uma vez; nível ilegal com zero atualização parcial; preservados após reinício do Worker no Pro, observação no celular da mesma versão fica nas pendências adiadas |
| W99-E05 validação conjunta real em múltiplos dispositivos | explicitamente adiada pelo usuário | resposta do usuário em 2026-09-09: "ainda não, deixa isso"; não se faz deploy do pacote Web nem se registra a validação real como aprovada |
| Unificação de ciclo de vida / remoção em massa de ensure / merge latest / novo backoff periódico | explicitamente fora desta rodada | segunda decisão do usuário em 2026-09-09: pequenas mudanças cautelosas na sincronização temporária |
| W99-11 / saneamento global de ordenação do R100 | adiado | só considerado quando um problema局部 tiver reparo de baixo risco; não é portão de publicação |
| Nova intenção em Bot busy / semântica extra de chamadas auxiliares | limites originais mantidos; novas necessidades aguardam decisão | não afeta corrigir primeiro o novo turno ocioso e as lacunas já verificadas |
| Todo101 / CLI independente | explicitamente fora desta rodada | será desenhado em separado depois |

A conclusão exige simultaneamente: P100-01 a 05 fechadas dentro do escopo acordado; as pequenas correções de sincronização com regressão correspondente e as demais limitações explicitamente registradas; todas as entradas de consumo com conclusão de auditoria; sem ACK applied falso, sem novo gate por envio e sem remap de execução fixa; spec/testes/grafo correspondentes alinhados. Não se exige unificar o ciclo de vida, um sistema de retry adicional nem o saneamento global de condições de corrida.

Após a implementação, executar testes direcionados, `pnpm typecheck` e `pnpm lint`; alterações em E2E também exigem `desktop typecheck:e2e` e as checagens de fixture/replay correspondentes. Não se pode endossar nova implementação com testes antigos aprovados. Registrar os IDs reais e conhecidos das sessões de agente conforme a norma (sem adivinhar); o commit lista com clareza itens não aprovados/não executados e não se usa `--no-verify`.

Falta evidência real em múltiplos dispositivos e isso não pode ser registrado como verificado. Em 2026-09-09 o usuário adiou explicitamente a W99-E05 como portão de conclusão desta rodada, de modo que ela pode ser considerada concluída dentro do restante do escopo acordado; o item continua como "aguardando verificação de ambiente" e não se pode deduzir a verificação de todos os lados a partir da conclusão desta rodada. Quando for preciso ampliar a semântica de produto, apenas os subitens relacionados são pausados, listando impacto e sugestão para uma segunda decisão.

### Registro de implementação e verificação do primeiro lote (2026-09-09)

- Cadeia modificada: envelope/recibo de Account compartilhado -> cache de entrega do Host -> decodificação de Account do bootstrap/runtime de processo. Os gatilhos de sincronização, a fila serial e os ensures existentes foram mantidos. Nenhuma barreira de envio ou timer de retry foi adicionado.
- Testes falharam primeiro e depois foram corrigidos: states ausentes ainda eram aceitos, recibo applied antigo, ausência de current liberava, e entrega do mesmo valor não atualizava mais; os novos `accountProviderSnapshotProtocol.test.ts` e `account-config-delivery.test.ts` cobrem isso. O segundo chama o método de entrega de produção por um Server de protocolo real e observa Source B e Registry A, e não apenas um recibo com mock.
- `createNodeModelSelectionFacade` reaproveita a classificação de identidade já existente do Host/Worker; o Core só aceita a porta de resolução. `EffectiveModelSelectionResult`, antes um tipo local, foi movido para shared/model-selection e reexportado pela entrada original do Provider, sem copiar um segundo DTO/algoritmo de resolução. Resultados parciais por nível ausente mantêm `selectionIssue` e bloqueiam a execução do filho.
- Novos testes de requisição real de runtime filho do Core: profile explícito, herança implícita, override interno e indisponibilidade explícita; verificam resolução, requisição e profile/Selections pai originais inalterados. Factory/bind não ganharam correspondência de conta nova. Child direto passando não significa que aninhado/workflow/script/resume passaram; esses pontos finais continuam pendentes.
- Resultados direcionados: 20 casos de shared/Host aprovados; 7 casos de entrega de conta do bootstrap, troca real de Built-in current e protocolo aprovados (execução com filtro, 117 pulados); 20 casos de helper do Core, requisição real de filho e escopo de execução aprovados.
- Regressão mais ampla: os dois arquivos de teste originais do bootstrap mais os testes de entrega somaram 117 aprovados e 5 falhas naquela execução. As falhas incluem fixtures antigas de template do process runtime sem nameMap/config, asserções de credenciais/import do Standalone e a asserção de denylist de Cron remoto; houve ainda uma limpeza com falha ENOTEMPTY. Não se pode alegar regressão verde de todo o pacote com base na aprovação direcionada, e essas falhas não foram transformadas por conta própria em nova semântica de CLI/Cron.
- Checagens: `pnpm typecheck` e `pnpm lint` da raiz aprovados (o lint tem avisos já existentes); build/lint do Core e typecheck do Bootstrap aprovados. O script de lint original do Bootstrap reporta "no files" por causa do ignore; `oxlint src --no-ignore` expõe erros já existentes como max-lines, e não se aproveitou para reestruturar o pacote. As checagens após a modificação final continuam registradas.
- Verificação complementar final: depois de consolidar o tipo de resultado comum, o typecheck da raiz, o build do Core e o typecheck do Bootstrap passaram novamente; os 20 casos do Core e os 20 de shared/Host passaram de novo. O lint direcionado com no-ignore nos arquivos modificados do Bootstrap continua bloqueado pelos erros de max-lines já existentes em types.ts/create-app.ts, e nenhuma nova regra de ignore foi adicionada para fingir aprovação. `git diff --check` passou.
- Ainda não foram executados os E2E de produto de desktop/celular/SSH, nem houve commit ou push. O protocolo mudou, e a publicação precisa usar artefatos de Host/Worker correspondentes; um Worker antigo não pode ser compatível de forma frouxa com estado completo, e a regressão de deploy continua pendente de verificação.
- Na época, o comportamento default de produto do Bot aguardava discussão; em seguida o usuário decidiu que, após o vínculo, a Session é a autoridade, como detalhado na seção D e no segundo lote. A herança existente de `/new`, as tarefas já existentes e a escolha explícita inválida são ramos diferentes e não podem ser agrupados em "usar o default a cada mensagem".

### 2026-09-09 segundo lote: cadeia de Bot e anexos

- Decisão: o Bot é apenas uma entrada da Session; depois de vinculado, não guarda outro modelo, não burla a resolução comum, o protocolo, a admission nem o mecanismo de salvamento. O salvamento imediato de `/model` e do comando de nível foi confirmado pelo usuário; o rascunho do Composer continua sendo salvo só na fronteira de submissão. A estratégia default de inicialização não vinculada não muda.
- Motivo da correção: o antigo `session/setModel` formatava a Selection completa como string de provider/model, e o raciocínio era descartado pelo setter compartilhado. Agora a entrada estruturada é validada por inteiro e só então é atualizada e salva de uma vez; a entrada de string original, que só altera a identidade, mantém sua semântica. `session-facade.test.ts` prova o salvamento completo e a escrita zero com seleção ilegal; um Server de protocolo real prova que o payload não se perde.
- O Bot lê o `getTaskModelSelection` do Task Service, com o valor original vindo de `settings.model.current` completo do snapshot da Session alvo; modelo/nível indisponíveis não passam pelo filtro do menu. Novos testes cobrem o workspaceIdentity remoto no mesmo caminho; não se cria uma segunda seleção persistente.
- A nova entrada ociosa passa de fato o resultado efetivo comum para sendPrompt; indisponível/sem seleção original é rejeitado, e preferredSelection não serve de reserva. A criação inicial continua fixando a seleção efetiva daquela vez. `botsService.messageFlow.test.ts` passou nos 85 casos do arquivo inteiro, incluindo estado existente, comandos, reenvio por stream, busy, criação e os três novos casos de entrada posterior.
- O caminho antigo de sessão/envio com anexos passou a enviar Selection/modelExecution; V4 e o protocolo antigo compartilham o schema estrito de restrições de execução e a construção de dependências de credenciais. Credenciais só entram como dependência não persistente desta rodada e não entram no intent. O Host não pode apagar esses dois campos por retry de compatibilidade com parâmetros antigos.
- A revisão de execução encontrou o backend antigo tratando admission como completion e limpando controller e posse de Bot/automation cedo. Um teste vermelho provou que uma segunda mensagem ainda era aceita enquanto a primeira hadn't ended; após a correção, o backend espera started_turn.completion, o ACK externo continua retornando imediatamente e `rejected` segue para um estado final de falha. A fixture antiga prompt_completed usava rejected para fingir sucesso e passou a usar a forma real started_turn/completion, sem afrouxar o julgamento de produção.
- Verificação: grupos shared/adapter/Bot config/status aprovados; 62 casos de protocolo de Selection do bootstrap, comandos nativos V4 e escopo de execução do Core aprovados; 1 caso direcionado de parâmetros de envio de subprocesso real do Host aprovado. A regressão completa do protocolo chegou a 111 aprovados e 2 falhas: a denylist de Cron é um problema já registrado antes, e a outra era a fixture errada acima; depois da correção, o teste direcionado de prompt_completed passou. O resultado final da regressão completa é registrado à parte.
- O messageFlow completo do arquivo já deu OOM duas vezes antes; desta vez o mesmo código de produto rodou com um único worker/verbose e os 85 casos passaram em cerca de 4 segundos. Não foi localizada a causa raiz do OOM nem se afirma que foi corrigido, e nenhuma configuração de concorrência/memória de teste foi alterada.
- Sob a exigência da skill de E2E, primeiro foi completado o catalog/matrix do Bot e depois foram estendidos os casos sintéticos SR99 e o harness do `manual-review/pending/bot-effective-selection.test.ts` já existente; isso só prova a fronteira de consumo do serviço e não substitui as evidências reais de Worker, recuperação fria e múltiplos dispositivos de W99-E03/E06. Não foi promovido.
- Typecheck da raiz e `desktop typecheck:e2e` aprovados; lint final, typecheck do bootstrap e checagem de diff continuam registrados. Ainda não houve commit/push, e a aprovação deste lote não é registrada como conclusão de todo o Todo99.

Verificação complementar final deste lote:

- `botsService.messageFlow.test.ts`: 85/85; schema de anexo compartilhado, Task adapter, Bot config/status: 110/110; os novos casos de adapter confirmam valor original de nível inválido e leitura literal do workspaceIdentity, sem escrever modelo.
- `session-selection-protocol` + `session-facade` + `zcode-protocol` original: 112 aprovados, 1 falha; resta apenas a diferença já existente de denylist de Cron remoto, e não se pode marcar o pacote inteiro como verde. Não foi adicionada nenhuma estratégia de desabilitar tarefas agendadas remotas por causa disso.
- `account-config-delivery`, escolha explícita/execução real de filho/escopo de execução do Core e script-workflow original: 31/31; caso extra de resume real do Core 1/1: um child já concluído que recebe nova entrada resolve novamente o profile explícito, o Provider de cada uma das requisições antes e depois está correto e o profile original não muda. Esse caso não é um remapeamento de turn em execução.
- A spec de pending do Bot já existente passou 5/5 sob o harness Vitest em Node (três SR87 e duas SR99); não é execução real em Electron/WDIO nem com modelo real, e não houve promoção manual.
- Typecheck da raiz, `desktop typecheck:e2e`, typecheck do Bootstrap e lint aprovados; lint com 39 warnings já existentes e 0 error. `git diff --check` passou. Sem commit/push; não havia um SessionStart ID confirmado e atual para escrever como trailer de commit, e a aceitação real de produto continua pendente.

Registro de revisão continuous (não apresentado como nova evidência de execução):

| Limite | Resultado verificado agora | Verificação restante |
| --- | --- | --- |
| Leitura de Session / despacho posterior do Bot | current original completo -> View comum -> mesmo Task send; a leitura não escreve | requisição de Worker real, recuperação fria e observação no desktop |
| Ensure antigo do protocolo de anexos | `ensureSessionModelAvailableUnlocked` hoje é um no-op que preserva a intenção original e não bloqueia a nova entrada válida com uma Selection antiga; sem espera de conta nova | W99-E02 real |
| Resume de child do Core | a mesma montagem resolve novamente o profile explícito; modelo fixo em execução não é reinterpretado e o teste de requisição real passou | evidência de produto de recuperação entre processos |
| Aninhamento de child do Core / Script child | a configuração atual explicita `subagents.enabled=false`; não se habilita aninhamento por conta própria para testar. A porta de resolução já é atravessada, mas não se pode afirmar que um caminho de produto inexistente foi executado | o caminho Workflow que pode ser habilitado ainda exige um teste de requisição real dedicado; o `opts.model` do Script é outra API explícita independente, e não equivale ao profile |
| Hook comum de UI | já existem generation/requestId/revision, isolamento de entrada alvo e dispose; sem nova plataforma de hook/assinatura de Bot | múltiplos dispositivos W99-E05, preservando a limite de atraso瞬时 já existente |

Trilha final de decisões: a primeira versão chegou a planejar unificar o ciclo de vida de Worker, fundir resultados pendentes e adicionar backoff; o usuário então foi explícito com "pequenas mudanças cautelosas na sincronização temporária", e esses trabalhos saíram desta rodada. A confirmação final fica com cinco correções concretas como principal e duas revisões como apoio. O registro de implementação completa item a item com arquivos alterados/commit, comandos e resultados de teste, evidências de requisição ou log e riscos restantes; não se pode substituir a aceitação das novas correções por "análise concluída" nem pelos 52 testes unitários já existentes.