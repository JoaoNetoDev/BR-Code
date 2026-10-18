# Colaboração em grupo do Feishu

A nova implementação dos materiais de entrada de tópico segue
[Talk input materials refactor](bots-topic-input-materials.md);
as referências por concatenação de corpo de texto e a injeção automática de
bot_topic_context mentioned nos registros históricos abaixo serão substituídas por
referências padrão e anexos de texto.

## Identidade e ativação

Um grupo habilitado tem uma conversa padrão, mais conversas de tópico independentes.
A chave padrão permanece `(botId, chatId)` por compatibilidade retroativa; tópicos usam
`(botId, chatId, threadId)`. Cada conversa tem uma tarefa atual.
`sender.open_id` é o ator, nunca a identidade da conversa. Callbacks de cartão usam
`context.open_chat_id`. Grupos diferentes e chats privados têm estado independente de
tarefa, workspace, modelo, interação pendente e histórico. Arquivos de workspace
compartilhados não são isolados: a ativação divulga que grupos concorrentes podem editar
os mesmos arquivos. Nenhum worktree automático é criado.

Apenas o owner vinculado privadamente pode `/enable` um grupo. A ativação inicial copia o
workspace/modelo/nível de pensamento privado para um novo rascunho, mas não sua tarefa,
conversa ou concessões automáticas de permissão. Workspace ausente rejeita a ativação.
Ativação repetida é idempotente. `/disable` para a entrada, os callbacks e a entrega,
sem cancelar trabalho já aceito. Reativar preserva o contexto, não a saída perdida.
Remoção do grupo, desvinculação ou troca de owner revoga o acesso ao grupo; entrar de novo
exige ativação explícita do owner. Grupos comuns de Feishu/Lark e grupos de tópico
dedicados são suportados. Outros providers ficam de fora.

## Colaboração em tópico (contrato de implementação)

Esta seção é o contrato de implementação atual do comportamento de tópico, substituindo
os caminhos antigos de @ turno a turno, alias de task padrão, queue e Steer.
A sessão padrão de grupos comuns e os chats privados mantêm a semântica original.

### Onboarding, isolamento e saída

Um tópico é onboarded quando um usuário comum faz a primeira menção @ ao bot atual em uma
mensagem raiz; ele também é onboarded automaticamente quando o usuário responde em forma de
tópico a uma mensagem do bot atual no chat principal. É preciso verificar o sender, o chat e
o native thread ID reais; a identidade do bot não pode ser inferida pelo nome de exibição nem
pelo corpo do texto. Um tópico onboarded recebe todas as mensagens posteriores de pessoas
reais, e discussões comuns em tópicos não onboarded não são executadas. Tópicos onboarded
também recebem mensagens nativas de outros bots, disparando o mesmo tratamento, o mesmo
retomada após interrupção em execução e as mesmas respostas das pessoas reais; as próprias
mensagens do bot atual são excluídas pelo open_id nativo, e a igualdade não pode ser decidida
pelo nome. Outros bots não podem fazer o primeiro onboarding nem reativar um tópico do qual se
saiu; o chat principal de um grupo comum já habilitado só recebe mensagens quando há um @
nativo do bot atual. Eventos recebidos com sender_type igual a bot (compatibilidade com
testes antigos do app e entradas históricas) são mapeados uniformemente pelo Provider para o
app interno. O app da interface histórica não pode ser confundido com o bot do evento recebido.
Eventos de bot sem thread_id em um grupo de tópico dedicado continuam não sendo onboarded.
O aplicativo precisa ter `im:message.group_at_msg.include_bot:readonly` habilitado para receber
@ de bots, ou `im:message.group_msg.include_bot:read` para receber mensagens de grupo que
incluem bots, e publicado para valer; o `im:message.group_msg` comum não prova que a permissão
de push de mensagens de bot está habilitada.
O corpo das mensagens de bot (incluindo comandos slash e textos de aprovação) serve apenas como
entrada comum e não pode executar comandos de controle nem submeter respostas de interação. A
deduplicação por ID de mensagem, a revogação de autorização e a barreira de parada seguem o
fluxo existente, sem criar uma segunda fila. O histórico retém mensagens de pessoas e de bots
(inclusive o senderType nativo); o conteúdo do histórico continua não disparando execução
independente. Callbacks de estado não são entradas comuns. Cada `(botId, chatId, threadId)`
(contado separadamente para o chat principal) recebe no máximo 5 mensagens novas consecutivas
de outros bots; a partir da 6ª são silenciosamente ignoradas, sem parar a execução atual, sem
preparar materiais e sem submeter à CLI. Uma mensagem nova de pessoa real que passa pelo portão
de onboarding existente zera a contagem; callbacks de cartão/estado não restauram a contagem.
Mensagens duplicadas (incluindo mensagens antigas de pessoas reais) não consomem tentativas nem
zeram a contagem. O Bot Host persiste a contagem e os IDs das mensagens recebidas na escrita de
estado serializada existente, e só então entra no fluxo de parada/preparo; callbacks concorrentes,
writes de estado atrasados e reinícios não podem contornar o limite. Uma falha de preparo após o
recebimento ainda conta como uma tentativa, evitando que um reenvio por falha dispare tudo de
novo. Estados antigos v3 sem o campo começam do zero.

```text
真人首次接入 → active 话题
其他机器人原生消息 → Provider 排除自身 → 校验 active → 去重/持久化连续次数（最多 5）→ 现有停止/材料准备 → CLI admission → 回复
当前机器人原生消息 → 丢弃
inactive / leave 后的机器人消息 → 丢弃（即使 @）
```

Aceitação: mensagens de outros bots do Feishu/Lark podem ser submetidas e respondidas no
tópico original, e callbacks duplicados são processados apenas uma vez; mensagens do próprio
bot, tópicos não onboarded e mensagens de bot após a saída são silenciosamente ignorados;
`/stop`, `/reconnect` e textos de aprovação de bots não executam operações de controle; o corpo
das mensagens de bot no histórico e os anexos autorizados são legíveis. Apenas mensagens
realmente enviadas pela plataforma são processadas, limitadas pelas permissões do aplicativo e
pelo escopo de eventos da plataforma; testes com eventos sintéticos não provam a capacidade de
push de um tenant real.

Cada `(botId, chatId, threadId)` vincula uma task independente, inclusive tópicos formados por
respostas de bots. A fronteira é congelada na primeira vez, o histórico é lido e os materiais
necessários são preparados; só depois de sucesso a task é criada e submetida. Um snapshot da
configuração do grupo é herdado, mas não o contexto nem as aprovações de outras tasks; arquivos
continuam compartilhados no mesmo workspace e nenhum worktree é criado automaticamente.
Mensagens concorrentes durante o onboarding não podem ser perdidas nem criar tasks duplicadas.
Identidade de tópico desconhecida é rejeitada, sem fallback para o chat principal.

`/stop` para o turno atual e cancela entradas não submetidas, mantendo o onboarding; `/leave`
do usuário vinculado para e sai. Um novo @ restaura a task original e completa o histórico.
`/history off` pausa o tópico; a falta da permissão de histórico bloqueia o onboarding,
apresentando o link de permissões do aplicativo e as instruções de publicação. Desabilitar o
grupo, desvincular ou sair do grupo revoga o onboarding, os cartões e as autorizações de entrega.

### Parada e retomada do onboarding

```text
inactive --首次触发--> preparing initial materials --成功--> active/idle
active/idle --消息准备完成--> running(runId)
running --真人或其他机器人新消息--> stopping(runId) + preparing pending messages
stopping --停止已确认 AND 全部材料就绪--> running(nextRunId)
active --/leave--> inactive（保留任务）
```

Uma nova mensagem solicita a parada imediatamente, e o preparo dos materiais pode correr em
paralelo. A solicitação de parada usa o protocolo existente expectedForegroundExecutionId para
amarrar à execução antiga (vinda de activeWorks); o traceId dos logs não pode ser usado como
identidade de execução; a próxima rodada só é submetida após um estado terminal autoritativo.
Durante a parada todas as mensagens são agrupadas na ordem de onboarding, e cada mensagem
original é preservada; a mesma run é parada apenas uma vez. Uma corrida entre conclusão natural
e parada avança apenas uma vez; notificações atrasadas não afetam a nova rodada. Efeitos colaterais
de ferramentas já concluídos não são revertidos e não se promete otomada de controle forçada de ferramentas.

O agrupamento salva em botGroupSource.messages o messageId, senderId, senderName, o corpo, as
referências e o índice achatado de anexos de cada mensagem; a última mensagem é a fronteira de
recebimento e os IDs de mensagem não podem se repetir. A UI exibe essas estruturas de texto
original uma a uma, sem analisar corpos concatenados.

O cache de preparo guarda apenas entradas não aceitas, e o CLI CommandInbox continua sendo a
única fila de aceitação. É proibido criar uma accepted queue na camada de Bot. A submissão usa um
commandId estável; numa confirmação perdida consulta-se o comando original, sem reexecutar. O
Host registra antes da recuperação a frio e do upload de anexos uma geração de cancelamento
isolada por task e remoteSessionId e revalida após o upload; `/stop` e `/leave` incrementam a
geração, impedindo que entradas antigas cheguem atrasadas. Essa geração não guarda entradas
aceitas.

O cancelamento e o envio de comandos compartilham uma barreira serial em nível de
task/workspace/remoteSessionId. O envio revalida a geração de preparo ao obter a barreira; o
cancelamento invalida imediatamente as gerações antigas ainda não enviadas e só retorna depois de
esperar o fechamento reconciliado das ordens de comando já iniciadas e de seus ACKs. Ordens já
iniciadas são linearizadas antes do cancelamento e não se promete revogá-las; um stop posterior lê
o estado de execução autoritativo após o fechamento. A barreira gerencia apenas as chamadas em
voo do Host, não guarda entradas aceitas e não substitui o CLI CommandInbox.

```text
准备(代次 N) → 串行屏障内复核 N → 发送/ACK 对账 → 释放屏障
取消 → 代次 N+1（拒绝未发送的 N）→ 等待在途发送收口 → 取消完成 → 权威 stop
```

A regressão precisa cobrir: cancelamento não pode concluir cedo enquanto um envio sem anexo está
suspenso internamente; uma geração antiga à espera da barreira é rejeitada; a barreira é liberada
após uma falha de envio; uma entrada de nova geração e a idempotência de passagem com o mesmo
commandId na CLI; e o isolamento da identidade de sessão remota.
Comandos de controle, aprovações e perguntas e respostas usam um canal dedicado, não
disparam interrupção de mensagens comuns e não são bloqueados pelo preparo dos materiais.
Resultados não entregues após a interrupção de uma rodada antiga não podem ser enviados como
resultado final; o conteúdo já enviado é preservado.

### Materiais de entrada e exibição

Na primeira exibição mostram-se a referência raiz (texto original real, remetente, horário) e um
anexo de texto do histórico do tópico que pode ser aberto. O corpo desta mensagem é mantido como
está; um @ sem nada mais não cria corpo placeholder nem balão vazio. Mensagens posteriores exibem
remetente, corpo e anexos de forma independente, mesmo quando executadas no mesmo lote, e não são
fundidas em um único balão de UI. root_id não representa uma referência explícita: uma
referência é adicionada apenas quando o usuário cita explicitamente outra mensagem. Não se
repete a referência raiz nem se injeta bot_topic_context.

O histórico é lido na primeira vez e as mensagens contínuas são coletadas por evento;
reconexões e lacunas fazem uma busca incremental. Cada leitura automática traz no máximo 200
mensagens e mantém a mensagem raiz separadamente, deduplica por ID de mensagem e registra a
cobertura e as lacunas. O texto do histórico inclui horário, nome e ID do remetente, ID da
mensagem, corpo e nome/tipo/referência dos anexos. Os anexos necessários da mensagem atual e das
citações explícitas são preparados pelo fluxo de upload existente e submetidos de uma só vez;
outros recursos do histórico são consultados de volta dentro do escopo de autorização da task.
Não se depende de o usuário instalar o lark-cli; comandos e textos de aprovação do histórico não
podem servir de entrada de controle.

Preparo/espera de parada usam OneSecond, execução usa OnIt, a conclusão da rodada usa CheckMark e
a falha usa CrossMark. Interrupção/cancelamento removem as reações incompletas; cada entrada é
associada independentemente à sua run, e uma conclusão posterior não pode marcar mensagens
antigas. A UI usa estados leves de preparo/espera de parada/retry; a resposta interrompida é
mantida e marcada como “已被新消息中断”. Não se restaurarão cartões de fila, BotGroupTaskNotice
nem corpos de origem duplicados.

### Limite de protocolo da atribuição de interrupção

O App não infere interrupções automáticas pela ordem das mensagens. O activeWorks da CLI carrega
um sourceCommandId opcional quando há atribuição de entrada, identificando esta execução junto
com o foregroundExecutionId; sem atribuição de entrada a exibição de parada comum é mantida.
Quando o Bot solicita a parada por uma nova mensagem, ele registra a entrada interrompida
conforme esse mapeamento autoritativo; `/stop` manual e `/leave` não escrevem o motivo da
interrupção automática. A UI lê o motivo pela mesma assinatura de estado de Bot da task, sem
criar runtime independente nem accepted queue, e o celular mantém sua fronteira replayable
original.

```text
CLI activeWorks(executionId, sourceCommandId)
  → Bot 新消息停止指定 executionId
  → 原输入的自动中断原因
  → App 对应 sourceCommandId 的停止标签
```

### Limite de exibição do estado de preparo

O serviço de Bot mantém temporariamente as mensagens não submetidas e o estado de preparo;
getBotStates projeta apenas messageId, remetente, corpo e o estado
preparing/waitingStop/failed, sem transmitir binários de anexo nem credenciais. O App projeta as
mensagens em preparo no fluxo da conversa e, após uma falha, remove a linha temporária sem
mostrar bloco de erro nem retry. A CLI remove imediatamente a exibição temporária assim que
recebe, e a mensagem formal é exibida pela linha da CLI; cancelamento, saída, revogação e
fechamento limpam o estado temporário. Esse cache não é persistido, não roda automaticamente e
não é uma accepted queue; após reiniciar o serviço, os materiais são reconstruídos conforme os
limites de histórico existentes.

### Balão das mensagens em preparo

Cada entrada de pessoa real em preparo pertence ao fluxo da conversa. A linha de origem mostra
「飞书/Lark · 发送者」 e um ícone de carregamento que não encolhe; ao passar o mouse ou focar o
ícone pelo teclado, o tooltip mostra 「正在准备材料」 ou 「等待当前执行停止」. Nenhum texto de
preparo fica permanente dentro ou abaixo do balão. O corpo continua reutilizando o componente
completo de mensagem formal com contração/expansão; um corpo vazio mostra apenas a origem e o
ícone de estado, sem criar balão vazio. Quando o preparo dos materiais falha, a linha temporária
é removida, sem bloco de erro vermelho, botão de retry ou rótulo de origem órfão; o registro de
falha no servidor, a execução e a resposta no lado do Feishu não são alterados. Nomes longos são
truncados sem empurrar o ícone de estado. O provider vem da configuração do bot vinculado
atualmente ou da origem já recebida, e não se presume que Lark seja Feishu.

```text
Bot 未接受材料（messageId） → 时间线 render unit → 正式正文组件 + 来源行加载图标
CLI 正式消息（botGroupSource.messageId / messages[].messageId） → 正式气泡
                           └→ 同 ID 准备气泡不再展示
```

As mensagens em preparo entram no ConversationTurnGroup e participam da medição de altura e da
rolagem existentes no fluxo de mensagens, sem pendurar um aviso no fim da Timeline. O
running live tail é preservado e um turno em execução não é movido para a lista virtual de
histórico por causa do estado de preparo. A exibição deriva apenas da timeline atual e do estado
de Bot, sem adicionar cache nem accepted queue; as mensagens continuam publicadas por seus
respectivos owners. Quando a mensagem formal com o mesmo ID original chega, o estado de preparo
atrasado é ocultado e a deduplicação não é feita por correspondência de corpo. Reutilizar o mesmo
componente de balão não significa manter o mesmo nó DOM entre owners. Desktop continuous e
celular replayable mantêm o caminho original. A aceitação cobre múltiplas entradas, corpo em
branco, preparo/espera/falha, retry, a janela de sobreposição em que a mensagem formal chega
primeiro, além de chinês/inglês, temas claro/escuro e larguras desktop/celular; evidência de
navegador do componente não substitui a validação ponta a ponta no Feishu real e no controle
remoto do celular.

### Registro de implementação e aceitação desta rodada

- O cancelamento de materiais atrasados no dispose do serviço, na remoção do bot do grupo e na
  troca do usuário vinculado já tem testes de regressão do serviço de grupo; a validação
  completa entre pontas ainda depende de aceitação manual.
- O App já passou a expor os estados leves de preparo/espera de parada/retry de falha e distingue
  interrupção automática de parada manual; os testes de componente e de serviço passam, mas a
  exibição real em Desktop/celular ainda depende de validação manual.
- O retry precisa casar com o taskId e o workspaceIdentity atuais; a fase de espera de parada
  cobre mensagens cuja autorização é concluída depois, e callbacks antigos após o cancelamento
  não podem atualizar o estado de uma nova geração.
- A referência raiz inicial e seus anexos são deduplicados de forma unificada na submissão, e o
  índice de anexos da mensagem original é recalculado; os anexos das mensagens seguintes são
  preservados. Os testes de regressão cobrem recursos raiz preparados antecipadamente.
- Eventos antigos de descarte de fila/Steer de tópico atualizam apenas o estado da entrada
  original e não enviam aviso de fila; a interrupção de tópico não envia mais notificações de
  parada duplicadas.
- A raiz de tópico dedicado valida thread_id e a mensagem raiz do mesmo grupo pela interface de
  mensagens nativas; o alias antigo só é lido na migração em tempo ocioso e, após o sucesso, é
  removido e o vínculo independente é salvo. Os testes de serviço/Provider existentes cobrem
  esses caminhos.
- Os testes de replay de eventos do Agent verificam que remetente original, referências e índice
  de anexos são preservados após passarem pelo schema de snapshot; a persistência real com
  reinício e a exibição no celular replayable ainda dependem de aceitação manual.
- Automação: 81 itens do serviço de grupo, 177 itens da projeção do Agent; o coordenador de
  parada, a barreira de parada do runtime, o estado de preparo, a exibição de mensagens originais
  e os rótulos de interrupção têm testes dedicados. Typecheck da raiz, do bootstrap do Agent e do
  E2E passam.
- Verificação antes do commit: `NODE_OPTIONS=--max-old-space-size=8192 pnpm verify:pre-push`
  passou (43 warnings de Lint já existentes, 0 erros). O script apenas enumera diferenças já
  commitadas, então o conteúdo staged desta rodada foi verificado separadamente: 15 arquivos de
  teste modificados passaram; o conjunto completo relacionado aos 24 arquivos de código-fonte
  modificados usou `vitest related --run --pool=forks --maxWorkers=2`, com 893 arquivos de teste
  e 9.916 testes passando e 4 pulados.
- Registro de ambiente: o pool de testes com threads do Node 24.14.0 sofreu SIGSEGV várias vezes
  na thread de coleta de memória do V8 (com relatório nativo do macOS disponível); aumentar o
  limite de heap ainda reproduz sporadicamente; ao final passou-se a isolamento por processos
  independentes, e o mesmo escopo de testes relacionado passou por completo, sem desativar
  nenhuma regra de verificação.
- O dev não foi iniciado e o E2E de UI não foi executado. Feishu/Lark real, Desktop/celular,
  entre sistemas e recuperação com reinício real permanecem pendentes de aceitação manual pelo
  usuário conforme os passos do documento de materiais; os testes automatizados não substituem
  esses resultados.

### Limites de migração e verificação

As tasks independentes antigas são preservadas; topicAliases que apontam para a task padrão são
usados apenas para uma migração única, criando uma task independente num limite ocioso seguro,
salvando o vínculo independente e removendo o alias antigo como registro de migração concluída. A
task original é preservada, sem copiar todo o contexto antigo. O roteamento de alias residente é
removido e não se mantêm duas implementações de execução de tópico.

Desktop continuous, celular replayable, owner/lease, workspaceIdentity e remoteSessionId mantêm
os limites existentes. A validação automática inclui corrida de parada, onboarding concorrente,
deduplicação de mensagens, falha de materiais, revogação e migração; Feishu/Lark real, Desktop e
exibição no celular são aceitos manualmente pelo usuário, e o dev não é iniciado nesta rodada. A
verificação real incompleta precisa ser listada explicitamente na entrega.

### Recuperação histórica de anexos (integração local/stdio/WebSocket em verificação, 2026-09-08)

O encaminhamento remoto usa um canal reverso privado na conexão stdio existente entre
Desktop e servidor. Somente o Desktop Host dono da credencial autoriza/baixa o
recurso. A conexão de origem precisa validar o workspace lógico e o remoteSessionId
atuais antes de invocar a autorização de Bot. O modelo não pode escolher um Host,
URL, credenciais ou destino de transferência. Os perfis de stream do Desktop e do
mobile permanecem inalterados.

A transferência de recursos usa begin/chunk/finish/cancel, no máximo 384 KiB por chunk
decodificado e o limite de anexos de 20 MiB existente. No máximo dois downloads vivos
por conexão são retidos por 120 segundos; o excedente é rejeitado de imediato, sem
enfileiramento. Cada chunk e o finish reconferem a autorização original. Cancelamento,
timeout e fechamento de conexão abortam downloads e apagam os bytes retidos. O receptor
confere a contagem de bytes declarada e o SHA-256 antes de passar o arquivo ao seu
uploader de CLI existente. Esse estado de transferência de recursos de vida curta não é
uma entrada aceita nem uma fila de execução.

Para um WebSocket Server compartilhado, registre um peer de recurso privado somente na
conexão `/ws/host` existente, autenticada por capacidade. Vincule workspaceIdentity +
remoteSessionId a partir de chamadas da facade V4 confiáveis, nunca de corpos de
mensagem. Dois peers vivos não podem reivindicar a mesma rota; fechar um peer remove suas
rotas. Uma conexão `/ws` normal de mobile/browser não pode registrar um peer de recurso.
Cada requisição reversa resolve exatamente um peer, e então o Desktop revalida sua própria
sessão lógica atual e a autorização de Bot. Não há fallback para o último cliente,
sondagem por broadcast, reconexão nem novo runtime.

```text
Remote CLI -> remote Host -> same stdio reverse channel -> Desktop Host
                                                        authorize + download
Remote CLI <- existing attachment uploader <- bounded chunks + final authorization
```

A verificação nativa encontrou que uma resposta de arquivo na UI de tópico dedicado
oferecia ações de encaminhar, revogar e selecionar, mas nenhuma ação de citar-resposta no
cliente inspecionado. O arquivo mantém um placeholder de arquivo; o seletor opcional de
anexos de tópico do `ReadSessionContext` agora solicita o recurso original por meio de uma
entrada confiável e de uma geração de autorização.

A integração local, SSH/WSL/Docker por stdio e WebSocket Server standalone está em
verificação; testes de transporte controlados não estabelecem aceitação nativa ponta a
ponta.

O serviço `readTopicResource` do Host agora resolve um id de entrada confiável até seu
arquivo aceito de task/tópico e valida a geração de autorização fornecida, o opt-in de
histórico de grupo e a identidade de workspace. Ele reconfere a autorização em torno do
I/O nativo e devolve um único anexo com tamanho conferido, pronto para transporte. A
consulta de metadata do provider suporta mensagens de arquivo, imagem e imagem de texto
rico; o cancelamento alcança o download nativo. Este serviço é o limite de download. A
requisição reversa do Agent local usa o upload em chunks existente para sua própria CLI,
valida os bytes e escreve um artefato binário de sessão. Uma verificação final de
autorização roda depois do upload, antes de devolver a referência. Callbacks por stdio usam
o canal reverso privado limitado descrito acima. A materialização nativa local/remota de
arquivos e a entrega no tópico original permanecem pendentes de verificação.

A capacidade de recuperação precisa se vincular à task em execução, não à identidade de
bot/chat fornecida pelo modelo. Um modelo pode selecionar uma referência de
mensagem/recurso já presente no background de tópico admitido dessa task; ele não pode
solicitar histórico de grupo arbitrário. O Host valida a identidade atual de
task/workspace, a geração de autorização do pai e do tópico, e o chat/thread da mensagem
nativa original antes de baixar. Reconfira a autorização após o I/O de rede, antes de
expor bytes. Tópicos desabilitados, revinculados ou sem relação falham de forma fechada.

```text
current task tool -> typed Agent/Host request (archived message reference)
                  -> Host task + workspace + group/topic authorization
                  -> native message/resource verification and download
                  -> existing chunked target-runtime attachment transport
                  -> bounded tool result / target-local resource reference
```

Reutilize as portas de Agent injetadas por dependência e as requisições do protocolo
reverso; mantenha as credenciais de provider no Host. Preserve o cancelamento, o tempo de
vida do recurso e a semântica de falha atômica. Requisições remotas carregam
workspaceIdentity e remoteSessionId e retornam recursos acessíveis ao alvo, nunca caminhos
absolutos do Desktop. Esta consulta é trabalho de leitura da task, não uma nova fila de
entrada, resposta de aprovação nem mudança de política de execução.

Regressão obrigatória: um arquivo arquivado do mesmo tópico pode ser lido sob demanda; uma
referência não arquivada, de outra task/chat/thread, com autorização revogada, download
falho ou transferência interrompida devolve uma falha explícita sem expor dados parciais. A
aceitação nativa deve pedir um valor encontrado apenas dentro do arquivo, verificar o
conteúdo em runtime e a entrega no tópico original, e registrar separadamente a cobertura
de workspace remoto.

Ativar/desativar grupo é escopo do grupo inteiro. Dentro de um tópico, new/clear mandam o
owner abrir outro tópico; a task exibe sua task vinculada sem troca entre tópicos. Parada,
configuração e controles de interação afetam apenas a conversa vinculada, sujeitos às
restrições existentes de papel/ocupação. A reautorização do grupo rotaciona a versão para
todos os contextos de tópico; entregas pendentes são invalidadas, não reproduzidas. Cada
ação de envio/cartão verifica a autorização do grupo mais a identidade de tópico/task/run/
requisição. Uma mensagem de origem indisponível pode recorrer apenas ao mesmo thread; nunca
ao chat principal ou a outra task.

A UI reutiliza as superfícies de lista de task/conversa/fila/aprovação. O título tem como
padrão grupo mais título do tópico. A barra de ações de resposta não expõe detalhes do
tópico nem um diálogo de contexto de tópico. Correções de resumo são entrada comum de task.
Apenas entregas falhas ou desconhecidas expõem controles de recuperação nas ações de
resposta; não restaure BotGroupTaskNotice nem painéis de resultado no composer. Os limites
de desktop continuous e mobile replayable, owner/lease e identidade de workspace permanecem
inalterados.

A aceitação inclui dois tópicos comuns, grupos de tópico dedicados, follow-up de resultado do
bot, silêncio de mensagem comum, sobreposição incremental/corridas de ACK, conflito de
contexto longo/lacuna/resumo, ataques de cartão entre tópicos, desativação/reinício/
desconexão remota, anexos e entrega. Rode testes de protocolo/serviço, regressão de E2E do
Desktop/mobile e `pnpm dev:desktop` CUA real contra o Feishu; registre as limitações de
Lark/cross-platform separadamente. Fixtures automatizadas não são evidência de permissões
reais de tenant nem de comportamento nativo de tópico.

A aceitação de cartões em nível de serviço verifica explicitamente ataques de tópico irmão:
um cartão de fila do tópico A usado em B, em outro chat, com outra task ou com uma versão
antiga de autorização precisa devolver uma rejeição só com toast antes de chamar o
cancelamento da CLI. Um membro sem relação não pode cancelar a entrada de A nem com seu
cartão, por mais válido que ele esteja. O autor original pode cancelar a entrada
correspondente de A; a entrada de B permanece aceita. Reativar o grupo pai não pode tornar
válidos de novo os cartões anteriores de qualquer dos tópicos. Esses testes controlados
estabelecem apenas a autoridade do serviço, não a entrega nativa de callback nem o timing
multidispositivo.

## Entradas e comandos

Apenas mensagens de usuário que mencionam o bot atual são admitidas. Remova apenas a
menção desse bot; preserve as outras. Deduplique pelo id de mensagem do provider, não
por texto nem por id de evento. Texto e imagens de texto rico são suportados. Uma resposta
que menciona o bot pode anexar a imagem/arquivo explicitamente referenciado do mesmo chat
(e do mesmo tópico quando aplicável). O histórico de tópico segue o contrato de opt-in
acima. O preparo de anexos é tudo-ou-nada e usa as regras existentes de tamanho/tipo.

Todos podem submeter prompts e usar ajuda/status. Apenas o ator que iniciou ou o owner
pode responder perguntas comuns ou cancelar a requisição enfileirada daquele ator. Apenas
o owner pode ativar/desativar, new/clear, parar, workspace/project, model, mode, think,
reconnect, task, ou aprovar/negar permissões e planos. A política de comandos existente
também se aplica. O bind permanece apenas privado; a granularidade de resposta é fixa em
summary em grupos. A ajuda tem ciência do papel; cancelar apenas cancela um menu. Texto
comum nunca responde implicitamente a uma interação de grupo. Perguntas de Desktop/mobile
pertencem ao owner. A primeira resposta válida vence; callbacks obsoletos ou não
autorizados não alteram cartões. A autorização do owner é verificada no serviço, não na
marcação do cartão.

`/new` cria um rascunho; o próximo prompt cria a task. Tasks antigas mantêm o histórico,
mas perdem a entrega ativa. O histórico/seleção de tasks fica restrito a este grupo.
Execução, interação pendente ou entrada enfileirada bloqueiam a troca de task/workspace.
Parar mantém a semântica canônica de fila do Desktop. O cancelamento de fila atua sobre
o item da CLI; uma execução em corrida não pode parar a task inteira. Edições/recall de
mensagens não cancelam, editam nem desfazem automaticamente uma entrada aceita.

## Uma única fila de entrada e entrega

```text
group mention -> verify/deduplicate/prepare attachments --+
desktop/mobile input -----------------------------------+-> owner route
                                                          -> CLI CommandInbox
                                                               |       |
                                                     UI projection   group result
```

Entradas de grupo pedem entrega FIFO, nunca steering automático. A ordem é a ordem de
admissão da CLI, não os carimbos de tempo do cliente nem o início do download de
anexos. Confirme apenas depois da admissão; respostas enfileiradas oferecem
cancelamento. Ids de comando estáveis permitem recuperação de ACK sem execução
duplicada. Interações e cancelamento contornam o enfileiramento comum de entrada. Texto e
referências de anexos sobrevivem a operações de fila, promoção e persistência da
transcrição. Nenhuma segunda fila de entrada aceita no Host, serviço de Bot, renderer ou
relay.

Grupos recebem resumos finais por entrada, perguntas/aprovações necessárias e status
terminal de falha/parada/descarte, nunca progresso de streaming ou de ferramenta. As
respostas referenciam a mensagem original quando possível. Não prefixe o nome do remetente
nem o open_id aos corpos de resposta, inclusive nas notificações de parada/falha/descarte.
Rótulos de origem de Desktop/mobile permanecem para entradas desses dispositivos. Uma
origem recalled recorre apenas ao mesmo grupo autorizado. Entradas de Desktop/mobile também
entregam ao grupo atualmente anexado. Respostas privadas mantêm cartões em streaming.

As reações a mensagens de grupo refletem o ciclo de vida canônico da entrada, em vez de um
OK permanente. Só depois da admissão da CLI uma entrada enfileirada pode mostrar
aguardando; execução direta mostra trabalhando. O início da execução troca aguardando por
trabalhando, a conclusão mostra sucesso e a falha mostra erro. Cancelamento/parada remove
a reação de status do bot e mantém a explicação textual existente. Confirmações de
admissão atrasadas não podem sobrescrever estado em execução ou terminal. Eventos
repetidos não podem acumular reações. Apenas as reações deste aplicativo podem ser
substituídas; reações de membros não são tocadas. Falhas de provider são falhas de
apresentação e nunca resubmetem nem rejeitam uma entrada aceita. Mapeamento nativo de
emoji: aguardando `OneSecond`, trabalhando `OnIt`, sucesso `CheckMark`, erro `CrossMark`,
cancelado/parado sem reação. Em mutação, liste as reações da mensagem para reconciliar o
status deste aplicativo após reinício; nunca delete reações de membros/de outros apps.
Isso não retoma trabalho descartado.
O reconhecimento de fila usa uma linha compacta com texto localizado de espera e um botão
de cancelar, preservando a autorização e o payload de comando existentes.
O mesmo cartão de fila acompanha o ciclo de vida da entrada: aguardando (cancelar
habilitado), trabalhando, concluído, falho, parado, cancelado ou descartado (todos sem
controles de cancelamento).
Persista o id da mensagem do cartão e o estado da entrada por entrada canônica. Um cartão
cuja criação termina depois do início/conclusão da execução precisa se atualizar
imediatamente para o estado mais recente; a admissão atrasada e os eventos repetidos não
podem reverter o cartão. Serialize as mutações de cartão por entrada e reconfirme a
autorização do grupo/a task atual antes de cada atualização. Falhas de cartão nunca
reproduzem execução. Cartões existentes sem id de mensagem salvo não são descobríveis por
varredura do histórico do grupo.

Persista a associação de task/grupo e os registros de entrega de resultado, incluindo ids
de envio estáveis e payload, para apoiar a recuperação do Host e o retry somente de
resultado. Revalide bot, grupo e task ativa antes de cada envio/retry. Desativação/troca
de task invalida entregas pendentes antigas. Resultados de envio desconhecidos exigem
reconciliação; retries não podem reexecutar a task. Respeite limites de taxa e divida
resultados grandes demais. A saída agendada também reconfere a autorização do grupo. Não
há reprodução de saída suprimida durante a desativação.

## UI, autoridade e recuperação

Reutilize os componentes existentes de task, transcrição, fila e aprovação de
Desktop/mobile. Mostre grupo/origem/remetente na task e na transcrição. O composer não
mostra uma faixa persistente de sincronização de grupo ou workspace compartilhado (atualização
de produto de 2026-09-07).
Apenas falhas de entrega não resolvidas e resultados desconhecidos mostram o painel de
recuperação; ele desaparece quando todos os resultados estão resolvidos. Falha de entrega
tem retry somente de resultado. O status usa nomes de exibição de workspace, nunca
caminhos absolutos internos ou credenciais.

A execução de grupo por padrão exige aprovação, sem concessões automáticas privadas
herdadas; apenas mudanças de configuração/aprovação controladas pelo owner mudam a
política. Metadata de origem é dado de anexo confiável, nunca autoridade derivada de
prompts. Dados novos de protocolo têm schemas de runtime estritos e permanecem
retrocompatíveis para entradas privadas. Persista o estado de grupo separadamente do
estado privado do bot, serializando escritas de arquivos compartilhados.

Mantenha separados desktop-continuous, web-remote-replayable e assinaturas de bot.
Preserve o roteamento de owner/lease/run obsoleto, workspaceIdentity e remoteSessionId.
Remotos desconectados só reconectam por reconexão explícita; não rode localmente.
Reconstruções de UI usam a recuperação de fila existente; o reinício da CLI mantém a
semântica explícita existente de descarte. Logs de runtime omitem segredos/conteúdo; logs
de alta frequência são de debug.

## Aceitação

Os testes cobrem ativação/revogação do owner; dois grupos e isolamento privado; menções
exatas; entrega duplicada; anexos e rejeição entre chats; uma fila de fontes mistas;
corridas de cancelar/iniciar; regras de interação de ator/owner; cartões obsoletos de
multi-cliente; isolamento de aprovação; troca rascunho/novo/histórico; parada/desativação/
remoção; resumo por entrada e entrega no Desktop; limites de taxa/resultados
desconhecidos/retry somente de resultado; reinício de Host/CLI e limites remotos; mobile,
temas e idiomas. Implemente os testes antes do código. Rode typecheck, lint, testes
unitários/integrados focados e E2E do Desktop. Resultados reais de Feishu e entre
plataformas devem ser relatados separadamente dos testes de fixture.

### Conferência das permissões de interface do Feishu (2026-09-07)

O recebimento de eventos de @ em grupo usa `im:message.group_at_msg:readonly`. Ler uma
mensagem explicitamente citada e seus anexos exige também, para a identidade do aplicativo,
`im:message:readonly` ou `im:message`; isso é uma permissão diferente de
`im:message.group_msg`, usada para assinar eventos de todas as mensagens do grupo. Configurar
apenas a permissão de @ não garante o download de anexos. O robô precisa continuar no grupo da
mensagem original e passar na validação de mesmo grupo no servidor; quando falta permissão, a
mensagem não está visível ou o anexo não pode ser baixado, a entrada inteira falha e o texto
restante não é executado.

Base: [Obter o conteúdo de uma mensagem especificada](https://open.feishu.cn/document/server-docs/im-v1/message/get)
(atualizado em 2026-04-10) e
[Obter arquivos de recursos em mensagens](https://open.feishu.cn/document/server-docs/im-v1/message/get-2)
(atualizado em 2026-08-27). A interface de consulta do histórico completo do grupo não foi usada.

### Reconciliação de entrega

Um envio incerto nunca é repetido automaticamente. Desktop/mobile expõem a recuperação de
entrega ao lado do carimbo de hora na barra de ações da resposta concluída
correspondente. Nenhum painel de recuperação é montado acima do composer ou da fila, e os
corpos de resultado salvos e os ids de remetente não são repetidos. Um ícone compacto
localizado abre um popover com ações de retentativa ou reconciliação; envios bem-sucedidos
e em voo não renderizam nada. Persista um `sourceCommandId` opcional, a partir do inputId
de evento de task confiável, em cada segmento de entrega. Case-o com as linhas canônicas
de input de usuário no turno de produto; o turnId de runtime não é o id de turno de
produto. Registros sem comando de origem não são adivinhados em outra resposta.
O serviço projeta a entrega em voo como pendente, preservando a persistência de
desconhecidos segura contra crash; depois que a operação se acerta, difunde o estado
final. O operador pode marcá-la como recebida, ou confirmar que ela não foi recebida; este
último caminho a transforma em uma falha definida e expõe a ação de reenvio existente. Esta
reconciliação não executa uma task nem lê o histórico do grupo. Tanto a reconciliação
quanto o reenvio reconferem a autorização atual do grupo e a associação de task. Uma
entrega concorrente ainda em voo não pode ser reconciliada. Mudanças de estado usam o
mesmo caminho de persistência serializada das mudanças de ciclo de vida do grupo.

Rótulos de origem de entrada usam um `inputOrigin` opcional (`desktop` / `mobile`)
injetado pelo anexo de comando confiável do Host, nunca inferido do texto do prompt nem de
um id de cliente fornecido pelo cliente. Ele viaja com a entrada canônica pela fila, pelo
retry e pela restauração da transcrição; a metadata de remetente do bot tem precedência nas
respostas de grupo. Esse campo de exibição não muda os modos de entrega continuous/
replayable.

Cada task de grupo histórica também retém seu caminho de workspace e sua identidade
opcional. Depois de mudar o workspace atual, `/task` ainda pode listar as tasks locais ou
conectadas anteriores desse grupo, e o Desktop pode rotular uma task anterior como pausada.
O mapa de histórico não é uma concessão de acesso para tasks sem relação nem um pedido
para conectar um workspace remoto desconectado. Registros mais antigos recorrem ao
workspace atual.

A associação de entrada por mensagem persiste seu resultado de admissão. Um evento
repetido de provider para uma entrada aceita nunca emite uma nova admissão, inclusive após
reinício de Host/CLI. Uma admissão não resolvida é reconciliada pela consulta de comando
estável existente enquanto a requisição original está ativa; a reentrega posterior não
adivinha que um comando desconhecido nunca foi executado. Ela relata que o operador precisa
verificar a task, em vez de submeter aquela mensagem de novo depois da expiração da
dedupe.

Controles de grupo remoto usam o escopo de anexo já validado:

```text
Bot group input / queue control
  -> existing remote MessagePort attachment
  -> Host injects workspaceIdentity + remoteSessionId
  -> task adapter validates the loaded task's workspace identity
  -> existing Agent owner route / CLI CommandInbox
```

Os três métodos de serviço de fila de grupo carregam campos opcionais de alvo remoto para
compatibilidade. Um alvo de outro workspace é rejeitado antes de subir qualquer anexo ou
ler/alterar sua fila. Chamadas locais mantêm seu alvo existente.

Entregas salvas retêm a geração de autorização do grupo que as criou. Desativar/reativar,
remoção do bot e revinculação não podem tornar válido de novo um retry em voo apenas porque
a mesma task continua atual. Cada retry verifica imediatamente antes de enviar tanto o
status de invalidação salvo quanto essa geração.

A criação de task de grupo pede `permissionScope: session` no comando de criação do V4.
Apenas este caminho persiste a task imediatamente e inicializa um ruleset de sessão vazio
em modo build antes de confirmar a criação; rascunhos normais do Desktop permanecem
adiados. A configuração de rascunho de grupo é aplicada depois, de modo que a escolha
explícita de modo do owner é retida e não pode atualizar o ruleset compartilhado do
projeto. A guarda de primeira entrada permanece para tasks de grupo mais antigas, mas não
redefine uma sessão já isolada.

## Nomes de exibição de membros de grupo

A atribuição de grupo resolve nomes pelo diretório de membros do chat atual usando
`GET /im/v1/chats/{chat_id}/members?member_id_type=open_id`, com a permissão de aplicativo
`im:chat.members:read`. A busca de contatos de chat privado permanece inalterada.
O provider segue a paginação, coalesce requisições concorrentes e mantém em cache os nomes
por provider, bot, aplicativo, referência de credencial e chat por um minuto.
Falhas recebem um curto backoff de retentativa; diretórios parciais nunca são publicados.

Um serviço somente leitura autoriza o acesso ao diretório contra o bot e o grupo
habilitados, incluindo uma segunda verificação de autorização após o I/O de rede. A UI
compartilha uma única busca entre mensagens históricas e entradas enfileiradas sem
reescrever os ids de origem salvos.
Nomes atuais têm precedência sobre nomes salvos. Nomes ausentes usam apenas os últimos
seis caracteres do id, sem um rótulo genérico de membro; hover e clique/toque revelam o id
completo. Nomes nunca participam da autorização. Falha de diretório não pode rejeitar uma
entrada por outra válida nem atrasar a renderização de status da task/entrega. Nenhuma
semântica de fila de task ou de desktop continuous / mobile replayable muda.

A validação cobre paginação, coalescência de requisições, backoff de falha, isolamento
bot/chat, acesso desabilitado/revinculado, atribuição de histórico e fila, fallback e
divulgação do id completo. A verificação em tenant real é separada do E2E controlado.

A atribuição de conversa tem um espaçamento de 8px antes do balão da mensagem, usando a
escala de espaçamento compartilhada. Isso vale para linhas de conversa de Desktop e mobile;
a atribuição de fila mantém seu layout compacto.

# Contrato de implementação da consulta do texto original de tópicos

O Agent reutiliza a estratégia `topic` do `ReadSessionContext` para consultar o texto original
de tópicos salvo nas entradas já recebidas; só pode ler a sessão atual, filtrando por ID de
mensagem ou palavra-chave e paginando. O texto original vem do confiável
`conversationInputIntent.botGroupSource.topicContext`, com compatibilidade com o antigo
`inputIntent` apenas quando o campo autoritativo não existe; a identidade não é analisada a
partir do corpo do texto e um resumo nunca é tratado como texto original. Limites de leitura,
lacunas e truncamentos precisam ser devolvidos ao modelo; mensagens ainda não obtidas não podem
ser declaradas como arquivadas. A leitura limitada pela API nativa no próximo @ continua
responsável por arquivar o que for novo.

Essa estratégia não chama modelos adicionais, não executa comandos ou aprovações do histórico,
não altera a fila e mantém as permissões de ferramenta somente leitura, o cancelamento, o trace,
o orçamento de resultados e a projeção de tool result já existentes. O resumo da task vem dos
registros model-only de bot_topic_context, e tanto o texto original quanto o resumo preservam a
base da referência.

Limites de implementação: a cobertura é representada por IDs de mensagens arquivadas, pelo
checkpoint atual de chamada e por `hasGap`, e não se infere a quantidade de mensagens em
intervalos ilegíveis. A barra de ações de resposta não oferece entrada de detalhes do tópico nem
popup de resumo; remover essa UI não altera o arquivamento de tópicos no servidor nem a
capacidade de consultar o texto original. A consulta de texto original cobre apenas o contexto de
entradas já lidas e recebidas; o histórico inicial ainda não lido não é buscado automaticamente
pela rede por essa ferramenta. O estado de aceitação em tenants reais e entre plataformas está
registrado em `docs/testing/bots-e2e-coverage-matrix.md`.

## Citações explícitas e apenas menções (2026-09-08)

- Uma mensagem comum no chat principal não dispara execução. Quando o chat principal tem apenas
  @, sem citação nem anexo, retorna-se um aviso pedindo Complementar a necessidade, sem criar task
  nem reação de execução.
- Depois de citar explicitamente um texto e fazer apenas @: a necessidade atual é tratar a mensagem
  citada, e o texto original é preservado como material de referência com ID de mensagem. Se
  houver uma nova exigência depois do @, a nova exigência prevalece. Comandos dentro da citação
  não passam pelo parser de comandos.
- O texto, o rich text e os anexos citados precisam ser legíveis e pertencer ao mesmo grupo e ao
  mesmo tópico; quando ilegíveis, revogados ou em formato não suportado, a citação é rejeitada
  explicitamente e nunca ignorada em silêncio.
- Dentro de um tópico, quando há apenas @: a necessidade “结合讨论处理明确问题，意图不明则询问”
  só é submetida se o grupo já tiver a leitura de histórico habilitada e houver contexto de tópico
  utilizável; sem contexto disponível, avisa-se para complementar a necessidade. Uma falha na
  leitura do histórico não executa uma necessidade vazia.
- A citação explícita não depende da chave de histórico; um `@ hello` no chat principal não lê
  implicitamente mensagens vizinhas. Anexos e o corpo citado entram na fila de uma só vez, e
  nenhuma reação de execução/fila é exibida antes da confirmação da CLI.

```text
可信 @ → 原生引用校验 → 保留当前要求 + 引用材料
       → 空需求：明确引用 / 已授权话题背景 / 补充需求提示
       → 一次 CLI admission → 表情及原位置回复
```

### Entradas de grupo após o cold start

Após reiniciar o ambiente de desenvolvimento real, a task padrão do grupo continua existindo no
banco de dados, mas quando o Bot submete o comando V4 diretamente o runtime ainda não carregou e
`proto.sessionNotFound` é retornado. Antes do upload de anexos e do admission, as entradas de
grupo obtêm o snapshot autoritativo da task original na CLI por meio da assinatura de background
já existente, reutilizando a barreira READY da recuperação a frio; em caso de falha, a entrada é
rejeitada, sem criar nova task e sem repetir entradas históricas. A identidade do workspace e a
sessão remota são passadas como estão. Os caminhos Desktop continuous e celular replayable não
mudam.

A recuperação a frio também precisa obter o snapshot autoritativo antes de estabelecer a
assinatura de resultados continuous do Bot. Caso contrário, a assinatura da sessão antiga esgota
as retentativas porque a sessão ainda não foi carregada, e as entradas seguintes executam com
sucesso sem ter resultado devolvido. Essa recuperação apenas lê estado, sem submeter nem repetir
entradas; no remoto, a conexão existente continua sendo verificada primeiro.

Uma entrada de modelo invocada apenas por citação delega explicitamente “responder à pergunta da
mensagem citada ou concluir o pedido que está nela”, e o trecho citado apenas identifica a origem
do texto original. O isolamento dos comandos é feito pelo servidor antes de anexar a citação; um
aviso ambíguo do tipo “isso não é uma instrução” não deve ser usado para impedir que o modelo
trate de uma necessidade explicitamente citada pelo usuário.

## Validade do token de acesso

Na validação real de um @ apenas dentro de um grupo, o evento é recebido normalmente, mas a
entrega da reação retorna `99991663`. O Provider mantinha em cache por 90 minutos fixos cada token
obtido, ignorando os segundos restantes de validade devolvidos pelo campo `expire` da interface;
obter um token que já existe não significa recuperar toda a validade. O cache precisa usar o
horário de início da requisição somado ao `expire` devolvido, mantendo a renovação 60 segundos antes.
Uma validade ausente ou inválida não é cacheada e não se adivinha a validade; o token legítimo
desta requisição ainda pode ser usado nesta requisição. Esta correção não repete a necessidade que
falhou e não altera a fila nem a cadeia Desktop continuous/celular replayable.

```text
读取缓存 → 剩余有效期超过 60 秒 → 使用
         → 否 → 获取令牌 → 按 expire 保存有效期 → 本次调用
```

### Correção da identidade de conexão no admission de anexos do Bot (2026-09-08)

Uma mensagem nativa de rich text dispara `fault.attachment.connectionUntrusted`: o task adapter
do Bot chamava a interface de anexos do Agent diretamente, sem passar pelo connection scope V4
existente que injeta a identidade de conexão confiável. A correção passa a reutilizar um
connection scope próprio para o onboarding do Bot, conforme a identidade do workspace e o
remoteSessionId, de modo que snapshot, anexos, admission, reconciliação de comandos e
cancelamento do Bot para o mesmo alvo compartilhem a mesma conexão; não se adicionam runtime nem
fila, e os anexos próprios do Desktop continuous e do celular replayable não são modificados. A
identidade do workspace e o remoteSessionId continuam sendo repassados.

```text
Bot task adapter → Bot trusted connection scope → existing Agent client → CLI CommandInbox
                    └ attachment begin/chunk/commit use the same connection
Desktop / mobile → existing own connection scopes ────────────────────┘
```

### Regressão na entrega de cartões de interação de tópico (2026-09-08)

Em um tópico CEDAR real, o cartão de aprovação aparece no chat do dono do grupo. Cartões
temporários de aprovação/pergunta devem usar a mesma resolução de âncora de tópico das respostas
comuns: replyToMessageId tem prioridade, depois rootMessageId; quando há threadId mas não há
âncora, o envio falha e não pode recorrer ao chat do dono do grupo. A criação do cartão precisa
passar reply_in_thread, e atualizações posteriores mantêm o mesmo cartão. Tanto a criação quanto
a atualização dos cartões de interação preservam no groupCard o grupo, o tópico, a task e a versão
de autorização; o caminho de cartão temporário não pode contornar as restrições de identidade dos
cartões comuns de grupo, e a normalização do modo de permissão para streaming_card não deve perder
esses campos.

### Regressão de recurso reverso do Server standalone

Ambos os entrypoints HTTP do Server exigem testes de transporte em WebSockets reais de
loopback: apenas o /ws/host autenticado por capacidade anexa um peer de recurso; o /ws
comum não. Duas conexões Desktop simultâneas com valores distintos de remoteSessionId
devem receber apenas as próprias requisições reversas de validação. Fechar uma conexão
remove sua rota sem remover a da outra. Esses testes usam leitores de recurso sintéticos,
não um tenant real.

## Grupos já vinculados ao aplicativo (primeira fase)

Nos configurações do bot, abaixo do escopo de acesso ao workspace do bot atual do
Feishu/Lark, exibe-se uma lista plana de grupos. O visual reaproveita o SettingsGroupCard das
configurações do bot, com título e linhas unificados em px-4/py-3 e borda, fundo e raio
consistentes com as configurações vizinhas. Cada grupo ocupa uma única linha: nome do grupo (nome
longo truncado com title preservado), quantidade de tópicos registrados e interruptor de grupo;
não são exibidos tasks, detalhes de tópicos, seta de expansão ou entrada de detalhes. A
quantidade de tópicos é o número de threadId distintos já registrados sob o usuário vinculado
atualmente, incluindo tópicos dos quais se saiu, e não representa o total real de tópicos do grupo
no Feishu. Apenas os registros padrão de grupo do botId e do ownerId atuais são exibidos, com os
tópicos agregados por chatId e chats privados não entram.

```text
群列表 hook -> getBotStates -> 群默认记录 + 去重话题计数
群开关 -> setGroupEnabled -> 既有群授权 owner -> bots:group-state -> 重新读取
```

A UI não modifica o estado de autorização de forma otimista; o interruptor fica desabilitado
durante o salvamento e uma falha mostra um erro que pode ser repetido. Após trocar de bot ou
fechar a página, leituras atrasadas não atualizam a nova página. A lista é renovada ao receber o
broadcast de estado do grupo, e reativar não reenvia histórico. Desligar o grupo preserva as
tasks e mantém a semântica de invalidação de entradas, cartões e retornos push de `/disable`.
Quando o interruptor geral do bot está desligado, a configuração dos grupos é preservada, mas o
interruptor de grupo fica desabilitado com o motivo explicado; o bot nunca é ligado
automaticamente por meio do interruptor de grupo. Sem grupos vinculados, orienta-se a fazer @ do
bot no grupo para enviar /enable. Uma falha de carregamento não pode ser exibida como lista de
grupos vazia. Os services/RPC existentes são reutilizados e a cadeia de tasks desktop continuous
e mobile replayable não muda.

Aceitação manual: chinês/inglês, temas claro/escuro, truncamento de linha única em tela estreita;
dois robôs/dois grupos sem serialização; contagem de 0/vários tópicos; sincronização de estado ao
trocar e reabrir a página; desligar/religar sem apagar tasks e sem reenvio; recuperação de falha
com repetição. Nesta fase o dev não é iniciado, conforme pedido do usuário, e a interface real e o
controle remoto do celular são verificados manualmente pelo usuário.

## Citações nas respostas de grupo e lembretes de remetente (2026-09-23)

Respostas diretas dentro do grupo (resultado de task, comando, necessidade complementar, aviso
de erro, cartões de aprovação e de pergunta/resposta) usam a citação nativa do Feishu e
mencionam no início do cartão o autor desta pergunta com o ID real de usuário. Quando o usuário
cita outra pessoa e faz uma nova pergunta, tanto a citação quanto o @ apontam para o autor
atual da pergunta, e não para o autor do material citado. Dentro de um tópico, o remetente só é
mencionado quando a mensagem que disparou o comportamento faz @ explícito ao robô; mensagens
comuns de tópico apenas são citadas, sem @. A conversa do dono do grupo e os chats privados
mantêm o comportamento original.

A cada rodada, o inputs.source existente é lido conforme o inputId confiável; não se adivinha o
alvo pelo último participante, pelo owner do grupo ou pela origem da rodada anterior. O agrupamento
de tópico cita source.messageId (a última mensagem do lote), e a resposta do primeiro corpo @
com os remetentes distintos que mencionaram explicitamente o robô no lote, na ordem de entrada;
participantes sem menção explícita não são alertados. Respostas longas citam a mesma mensagem em
cada trecho e mencionam apenas no primeiro; cartões de interação independentes geram um alerta
separado, e um PATCH no cartão original não cria novas mensagens de alerta. O @ é apenas para
exibição e não altera as permissões originais de aprovação/pergunta.

```text
群消息 → 既有输入来源（消息/发送者/合批列表）→ CLI 接受输入
      → 带 inputId 的结果 → Bot 确定回复对象 → 既有 delivery 持久化
      → 同一群/话题授权检查 → 飞书原生 reply + 卡片 at
```

As entradas e a fila continuam sendo geridas pelo owner existente; a delivery guarda apenas a
referência do resultado gerado, mentionedUserIds, os trechos e o ID estável de entrega. Um retry
parte desse registro e não reinterpreta o remetente no estado atual do grupo. Tasks de
Desktop/remoto continuam usando bot-channel-continuous, e a fronteira replayable do celular não
muda. Resultados de clientes sem entrada de grupo confiável ou de tarefas agendadas não geram
citação pessoal nem @; a posição no tópico continua usando a âncora original do tópico. Entregas
antigas sem mentionedUserIds mantêm o comportamento original, sem adivinhar nem reenviar lembretes
de histórico.

A invalidação da mensagem original só sofre downgrade após uma rejeição explícita: em um grupo
comum a citação é removida e o @ é mantido no grupo original; em um tópico tenta-se uma única vez
uma âncora raiz diferente e válida, e se a âncora raiz também for rejeitada a operação falha, sem
degradar para o chat do dono do grupo nem entrar em repetição. Resultados incertos, como timeout,
permanecem unknown e não são reenviados automaticamente; com rate limit ou após reinício, o retry
permitido mantém o destinatário original; desativação ou rebinding continuam invalidando a
entrega pela versão de autorização original. Comandos e cartões temporários seguem as mesmas
regras de downgrade de citação.

Aceitação: uma pessoa, várias pessoas intercaladas, citação de outra pessoa, agrupamento de
tópico, respostas longas em trechos, comandos e cartões de interação independentes são associados
corretamente; ausência de origem e chats privados não geram alertas; revogação, âncora raiz
inválida, rate limit, timeout e reinício não misturam pessoas, não dão laço e não duplicam
entregas. Os testes unitários verificam roteamento, cartões e persistência; o salto de citação, a
exibição do @ e as notificações no cliente real do Feishu precisam ser medidos de forma
independente e não podem ser inferidos de um mock aprovado.

### Limite de herança de modelo do tópico (correção em 2026-09-23)

Um tópico novo lê o snapshot estruturado de modelo do getTaskModelSelection da task atual do
grupo, preservando providerId, modelId e options.reasoningLevel; não é permitido derivá-los do
menu de configuração de modelo nem do valor de exibição de task.model. Por exemplo, o valor de
exibição GLM-5.3-Flash$max deve herdar o modelo GLM-5.3-Flash e o nível de raciocínio max
independente. Quando o grupo ainda é um rascunho, os draftOptions explícitos dele são herdados;
depois que o tópico é criado, ele mantém o próprio snapshot e não muda automaticamente com a
seleção de modelo posterior do grupo. Rascunhos existentes e errados precisam de uma correção
explícita, e esta rodada não introduz compatibilidade em tempo de execução para um modelId errado.

## Lembretes de pendências de administrador (2026-09-23)

Quando um chat de grupo ou um tópico precisa de ação do administrador, um @ real é gerado usando
o bot.providerUserId vinculado como único destinatário: rejeição de uma operação exclusiva de
administrador, aprovação de permissão, aprovação de plano, grupo não habilitado, histórico
desabilitado, seleção de modelo não resolvível, workspace indisponível ou fora dos limites,
desconexão remota ou falha de reconexão. Perguntas comuns, resultados de task e erros de ferramentas
gerais não são promovidos a pendência de administrador. Falta de permissão do aplicativo Feishu
fornece apenas instruções de configuração para o administrador do aplicativo e não implica que o
usuário vinculado tenha permissão de administração do aplicativo.

O lembrete de administrador substitui o lembrete comum de remetente, preservando a citação nativa
e a posição original no tópico. Cliques em cartões não autorizados continuam gerando apenas um
toast, e a primeira vez que for necessária a assistência do administrador uma notificação
independente é enviada, sem atualizar o cartão de aprovação compartilhado e sem conceder
permissões a quem clicou.

```text
服务识别管理员待办 → 当前绑定身份 + 群/话题 + 原因/审批请求
                   → 本进程通知去重 → 原有发送/交互卡链路
成功接收新输入/对应阻塞恢复 → 清除阻塞提醒记录 → 后续再次阻塞可重新提醒
```

A deduplicação é apenas um registro de notificação em memória e limitado, sem criar filas de
task/entrada; reiniciar o serviço ou a expulsão do registro por capacidade permite um novo aviso.
Durante a mesma pendência, avisos posteriores mantêm o texto, mas não repetem o @; tópicos,
administradores ou solicitações de aprovação diferentes são independentes. Um PATCH do cartão de
aprovação não gera novo lembrete, e uma pergunta complementar comum não ocupa o registro de
lembrete de administrador.
A aceitação cobre os cenários positivos e negativos acima, operações repetidas por várias
pessoas, isolamento entre tópicos, novo lembrete após a recuperação e a rejeição por botão que
não modifica o cartão original.

## Nós nativos de menção e respostas por canal (2026-09-23)

Esta rodada não acrescenta regras de desvio. Menções nativas confiáveis do Feishu são salvas em
BotGroupInputSource.contentParts na ordem original e, no agrupamento, mensagem a mensagem; o
appId, junto com os existentes botId/chatId/threadId/messageId, delimita o aplicativo e a
sessão. O text continua sendo uma projeção de compatibilidade e precisa ser igual ao resultado da
concatenação dos nós; o cliente renderiza apenas a partir dos nós confiáveis e não recupera a
identidade a partir do texto @name. Texto comum, nomes e o próprio material citado não constituem
endereço de envio; um nome só pode ser enviado depois de resolvido pela consulta do Host
descrita abaixo. Tipos de alvo desconhecidos podem receber menção nativa, e @todos não entra em
nós pessoais.

输入 → Provider 节点 → 既有 inputs.source / canonical intent → queue / transcript / desktop continuous / mobile replayable
执行 → ReplyToChannel(refId, text parts) → CLI 执行输入标识 → 已鉴权 Host 反向请求 → Bot 任务绑定检查 → 既有 delivery → 飞书回执

ReplyToChannel é usado apenas para respostas nativas extras solicitadas explicitamente pelo
usuário e não pode especificar um grupo, robô ou ID cru arbitrário. O serviço resolve de forma
única o chat de grupo/tópico vinculado atual conforme o workspace e a task, validando a versão de
autorização e o appId; não é exigido que a entrada atual carregue botGroupSource. Os nós de
citação podem vir de mensagens nativas já recebidas por essa task sob o mesmo vínculo válido,
suportando no Desktop e no celular a continuação “再 @ 一下他”. O resultado distingue
sent/failed/unknown/invalidated e apenas sent confirma o envio; um toolCallId estável corresponde
a um registro de entrega. O corpo nodulizado gera ats nativos em ordem e não pode interpretar
@name ou Markdown da saída comum do modelo como comando de envio. Os lembretes de
iniciador/administrador são deduplicados em relação às menções do corpo, e as menções do corpo
não alteram as permissões de aprovação. Mensagens antigas sem nós mantêm o texto, sem adivinhar
IDs; nós de outras tasks, chats de grupo, tópicos, autorizações antigas ou de outro aplicativo
vinculado não podem ser destino de envio.

A ferramenta obtém o inputId de execução pelo assistant.parentID do toolCall já gravado, e o
vínculo de canal e a resolução de destino são exclusivos do Bot Host; uma entrada de fila que
chega depois não pode substituir o destinatário de um envio em execução. Antes do envio, também
se verifica que a entrada não foi parada/cancelada e que o aplicativo não foi revinculado. O
corpo é limitado a 1–2000 caracteres, com entrega única; um retry do mesmo toolCall devolve o
recibo persistido e resultados incertos não são reenviados automaticamente. O cancelamento impede
a submissão antes do pedido ao Host; depois que o pedido saiu, não é possível revogar uma
mensagem já entregue, e um cancelamento/desconexão do chamador não pode ser tratado como não
enviado. O trace é preservado na requisição reversa, no encaminhamento remoto e nos registros de
entrega.

As mensagens formais do cliente, o estado de preparo e a fila compartilham o chip de canal
(@nome + Feishu/Lark); mensagens antigas sem nós mantêm a exibição original. Depois de copiadas
ou revertidas para um editor de texto comum, não carregam autorização de envio por canal e não
reconstroem uma identidade enviável a partir da string. Quando o texto da camada de exibição é
inconsistente com a projeção de nós, o corpo comum é usado como fallback, evitando exibir uma
associação de alvo obsoleta após uma edição.

ReplyToChannel é isento de aprovação de ferramenta por padrão: nos modos build, edit e plan,
responder a uma sessão já autorizada não abre um novo pedido de permissão; ainda assim é marcado
como um efeito de rede real e não se passa por ferramenta somente leitura. Regras explícitas de
deny/ask do projeto mantêm a precedência. A isenção vale apenas para esta ferramenta embutida e
seu contrato channel.reply; as demais ferramentas de envio de rede mantêm as regras atuais. Antes
do envio, o Host continua validando vínculo de task, sessão, aplicativo e refId, e um vínculo
ausente, ambíguo ou inválido falha diretamente com um erro explicável.

Aceitação: após um @ nativo bem-sucedido no Feishu, acrescentar “再 @ 一下他” pelo
cliente/celular continua enviando para o mesmo grupo/tópico; ausência de vínculo, múltiplos
vínculos, rebinding, desativação, referências de outras tasks/tópicos e entradas canceladas não
podem enviar.
CLI → 已鉴权反向请求 → Bot 状态唯一 owner 解析绑定及历史节点 → 既有 delivery 幂等投递。
Não se adicionam cache nem accepted queue, e as cadeias de entrada e recuperação de desktop
continuous e mobile replayable permanecem inalteradas.

### Menção por nome (2026-10-08)

Quando o usuário pedir explicitamente “@pessoa/robô” e não houver um nó nativo, o
ReplyToChannel aceita `{type: "mentionName", name, candidateRef?}`. O texto @ de uma saída final
comum não dispara envio automaticamente. O Host forma candidatos usando o diretório de membros
do grupo vinculado validamente à task atual (paginação completa, reaproveitando o cache de 60
segundos) e os nós de menção confiáveis já recebidos sob a mesma autorização da task; os nomes
são normalizados por Unicode NFKC, remoção de espaços nas pontas e normalização de caixa, e a
correspondência é por substring; com um único candidato o envio é direto, e com vários candidatos
prevalece a correspondência de nome completo e única, ou então a seleção é solicitada. IDs de
plataforma vindos do modelo não são analisados nem aceitos. Espaços internos de nomes em inglês
são preservados; vírgulas, vírgulas chinesas, quebras de linha e outros separadores explícitos de
lista formam múltiplos mentionName, e nomes não são separados apenas por espaços. Todos os
nomes precisam ser consultados; o resultado da esclarecimento lista todos os itens não resolvidos,
não pula os nomes seguintes porque o primeiro falhou e nunca descreve como sucesso algo não
consultado ou não enviado.
A interface de membros do grupo não inclui robôs; um robô nunca mencionado nativamente e sem
identidade confiável precisa que o usuário o mencione nativamente uma vez. Uma falha na consulta
do diretório não pode pressupor “não há outras pessoas com o mesmo nome” e enviar.

```text
用户明确要求 → CLI ReplyToChannel(名字) → Host 校验任务绑定 → 查询群成员 + 可信节点
  → 唯一候选：解析真实 ID → 再次校验绑定/输入/凭据 → 现有 delivery → 回执
  → 多个候选：needs_clarification + 有界候选（名称、类型、区分标签、opaque ref），零发送
  → 无候选/查询失败：needs_clarification + 原因，零发送，请用户原生 @
用户选择 → 新 toolCall，名字 + candidateRef → 重新查询并核验候选 → 发送
```

Não é permitido que o modelo escolha sozinho entre candidatos com o mesmo nome. Os candidatos
vinculam-se apenas ao aplicativo, às credenciais, ao grupo e à autorização atuais e não podem ser
reaproveitados entre grupos ou autorizações; o identificador de escolha não contém IDs crus e
nenhuma fila de confirmação pendente é criada. Se qualquer alvo múltiplo ficar sem resolução, nada
é enviado. São exibidos no máximo 10 candidatos; ao exceder isso, é preciso um @ nativo. Uma lista
comum de candidatos não gera notificação de @.
A impressão digital da requisição e os nós resolvidos do mesmo toolCall são salvos com a
delivery existente; uma releitura do recibo não resolve novamente o destinatário pelo diretório
atual e não reenvia; o mesmo toolCall com outro nome ou outro corpo é rejeitado. Registros de
entrega antigos permanecem compatíveis. Consultas assíncronas antes do envio não podem contornar
rebinding, desativação, parada de entrada e o isolamento por workspaceIdentity. App e CLI
compartilham um schema estrito; desktop continuous, celular replayable e o owner de entrega do
Bot permanecem inalterados.

Aceitação: usuário único, robô conhecido, nomes duplicados e escolha explícita, sem resultado,
sem permissão, falha de paginação, mesmo nome com IDs diferentes, revogação de autorização durante
a consulta, replay após renomeação no diretório para a mesma chamada e rejeição de candidatos de
outro aplicativo/grupo/workspace; Feishu/Lark e grupo/tópico são cobertos. As permissões reais da
plataforma e a limitação de diretórios sem robôs são explicadas nas evidências de entrega.

### Limite de preparação de citações e replay de entrega (2026-10-09)

Quando um outro robô faz um @ nativo e cita a mensagem pai em um grupo comum, tanto a preparação da
citação quanto a análise da mensagem repassam o open_id real do sender; sem thread_id, o texto e
os anexos citados são preservados, e o próprio robô continua não recebendo. Um replay de
ReplyToChannel com a mesma impressão digital, havendo um envio ativo, precisa entrar na espera do
owner de delivery existente: a plataforma envia apenas uma vez e as duas chamadas recebem o recibo
final. Um unknown gravado é uma marca de recuperação de crash e só é devolvido quando não há envio
ativo; um replay nunca dispara reenvio automático. Nenhuma fila é adicionada aqui, e a fronteira
desktop continuous / mobile replayable não muda.

### Limite de identidade multi-robô e atribuição (2026-10-09)

A cada rodada o Host injeta o nome da configuração atual do Bot e o próprio open_id verificado
pelo Provider (sem adivinhar quando uma entrada antiga não tem ID), preservando mentionedBot e
mentioned nativas.message a message. A identidade é determinada por metadados confiáveis; o nome
serve apenas para exibição e não muda por corpo de texto, falas anteriores ou autodenominação do
robô. O contexto de modelo na CLI explicita que compartilhar uma discussão não significa
compartilhar uma task: só se assume a parte atribuída quando há um @ explícito de si mesmo; com
várias pessoas se seguindo, cada uma respeita a divisão explícita; uma continuação sem @ apenas
estende a própria task e, quando irrelevante, não chama ferramentas nem produz resposta; e não se
anuncia a conclusão da task de outra pessoa. Um @ digitado manualmente sem nó confiável não passa
por filtragem rígida.

Mensagens que contêm apenas outras menções nativas e não mencionam o Bot atual entram na entrada
do Host como contexto: não executam controle slash, não param o run atual, não preparam materiais
nem submetem à CLI, e não resetam nem consomem a cota de resposta mútua. Um tópico já onboarded
guarda apenas um checkpoint de backgroundHistory e um marcador de versão (não é uma fila de
entrada), e a próxima entrada real relê o histórico nativo. O checkpoint é fixado na última
mensagem recebida antes da chegada do primeiro contexto; atualizações posteriores de contexto mudam
a versão sem avançar o checkpoint, evitando que uma entrada em preparação/submissão pule o
contexto. O marcador só é limpo quando o recebimento tem sucesso e a versão relida ainda
corresponde; falhas e reinícios o preservam. Tópicos inativos não são ativados por causa do
contexto. Rodadas de modelo sem @ e sem saída visível não recebem um “任务已完成” adicional; @ 
explícitos, erros e a produção real mantêm o retorno original. Não há novo robô coordenador nem
banco de dados de divisão de trabalho, e o diálogo existente guarda a responsabilidade.

```text
Provider 身份与原生 mention → Host 入口
  只 @ 他人 → 持久化历史检查点 → 原任务继续
  @ 自己 / 无 @ 续聊 → 补读待处理背景 → CLI 注入身份与逐条指向 → 处理自己的职责或静默
```

desktop continuous / mobile replayable, workspaceIdentity e o owner único de admission da CLI
permanecem inalterados. A aceitação cobre o mesmo nome com IDs diferentes, @ apenas em texto,
@ de várias pessoas, preparação de histórico concorrente, recuperação após reinício, tópicos não
onboarded e respostas vazias.

### Preservação das menções ao próprio robô no texto original (2026-10-09)

Todas as menções em mensagens nativas (inclusive as do robô atual) são preservadas como
channelMention ordenadas, mantendo nome, posição, ID de alvo e refId, para uso da interface, da
persistência de entrada e do modelo. Antes, a menção ao próprio robô era trocada por string
vazia, o que fazia com que entradas reais de divisão de trabalho entre várias pessoas perdessem o
destinatário atribuído a cada trecho de trabalho.
O Provider passa a fornecer um commandText temporário que remove apenas as menções nativas
consecutivas ao próprio robô no início e os espaços adjacentes; o reconhecimento de comandos de
controle e de wake-up puro usa essa cópia, enquanto mensagens comuns sempre usam o texto original.
Menções no meio do corpo, outros destinatários e @ digitados manualmente não são removidos. Os
dois formatos de entrada, text e post, seguem a mesma regra; o filtro de eco do próprio robô, o
limite de resposta mútua entre robôs e a validação de identidade de grupo não mudam.

### Exclusão dos cartões interativos de robô (2026-10-09)

Cartões de robô que carregam apenas controles de operação como botões, seletores, campos de
entrada e formulários não servem como entrada de resposta automática. `interactive` é apenas o
portador do cartão do Feishu, e cartões de conversa em markdown/text puro continuam participando
normalmente da discussão. Mensagens de confirmação de robôs que citam um cartão operacional também
são filtradas; respostas que citam um cartão de conversa comum não são filtradas. Isso não depende
do texto de confirmação em chinês ou inglês.
O Provider usa as menções nativas e os nós at ordenados dentro do cartão para recuperar menções
confiáveis; quando os IDs do corpo no lado de envio e no lado de recebimento são diferentes, usam-
se as menções ordenadas fornecidas pela plataforma, e o ID do corpo original nunca é tratado como a
identidade local. Quando um evento de cartão contém apenas conteúdo placeholder de upgrade do
cliente, o cartão real é lido pela interface de mensagens nativas do mesmo grupo e tópico; se a
leitura falhar, nada é submetido à CLI. O histórico filtra cartões operacionais, por meio da
classificação opcional controlCard, e também as respostas de confirmação de robôs que os citam
neste lote; cartões de conversa comuns são preservados, e os limites de varredura e o checkpoint
permanecem iguais. Citações ativas de cartões por pessoas reais e cliques de pessoas reais
continuam pelo fluxo de autorização existente. Eco do próprio robô, o limite de cinco mensagens
consecutivas, desktop continuous e celular replayable não mudam.

### Silêncio ao parar uma tarefa no grupo (2026-10-09)

Depois de uma parada bem-sucedida de uma task no chat do dono do grupo ou em um tópico (incluindo
cancelamento e interrupção), nenhuma notificação de parada ou cartão de estado é enviado. A
execução da parada, o estado da entrada, as reações e a atualização da lista de tasks continuam
sendo concluídos normalmente; falhas de parada e a ausência de task ativa mantêm a mensagem de
erro. O comportamento de sessões privadas não muda, e a cadeia de admission da CLI, desktop
continuous ou celular replayable não é alterada.

### Busca de nomes entre tasks (2026-10-09)

Os candidatos de nome reaproveitam as menções nativas de entradas históricas já recebidas com o
mesmo bot, app, provider, chat/thread e autorização no vínculo de grupo atual, e candidatos não
são removidos por taskId nem por estado final. A identidade de uma task antiga participa apenas da
resolução de mentionName, e um refId antigo não pode ser usado para envio direto; a autorização de
envio da task atual, a revogação, a revalidação concorrente e a política de falha do diretório não
mudam. Não se lêem outros grupos nem outras autorizações, e IDs da configuração local do robô não
são tratados como IDs nativos locais.

### Limite de regressão da revisão (2026-10-09)

A paginação do histórico usa primeiro os metadados nativos para determinar o limite/checkpoint da
chamada e excluir mensagens excluídas, e só então expande os cartões dentro da janela. Uma falha
de leitura de um cartão fora da janela não pode bloquear a entrada; uma falha de leitura de
material necessário dentro da janela continua proibindo a submissão. Durante a parada, a validade
de um lote agrupado é julgada mensagem a mensagem pelo commandText/corpo, pelas citações e pelos
anexos, sem usar a cópia de comando da última mensagem para representar o lote inteiro e sem
reanalisar o corpo agrupado como comando de controle. A projeção de menções confiáveis do modelo
calcula isCurrentBot pelo ID de alvo nativo, permitindo que a posição concreta de um destinatário
homônimo seja associada à própria identidade e sem expor os IDs dos outros destinatários.

```text
历史元数据 → 边界筛选 → 必要卡片展开 → CLI admission
逐条输入 → 停止屏障 → 全批次有效性判断 → 保留原始消息提交
原生 mention targetId + 当前 bot openId → isCurrentBot → 模型分工
```

A autorização atual, o owner de persistência do Host, a admission única da CLI e
desktop continuous/mobile replayable permanecem inalterados.

Complemento de localização de identidade para o modelo: além da lista de menções, cada entrada
projeta nós ordenados text/channelMention, de modo que um @ nativo possa ser distinguido de um
texto digitado à mão com aparência idêntica; cada menção contém apenas ref, nome, canal e
isCurrentBot. Os lotes são agrupados por messageId e menções repetidas preservam cada posição de
ocorrência; o texto canônico e a estrutura persistida não mudam.