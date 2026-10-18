# Bots

Bots permite que um chat privado de terceiros conduza o mesmo fluxo de tarefas do ZCode que a caixa de entrada da UI. O modelo v2 remove a antiga forma aninhada de allowed-users: cada `bot` é uma instância de acesso completa, com provider, credenciais, um ator vinculado, escopo de workspace, política de comandos, opções atuais e modo de resposta.

## Arquivos

- `bot-config.v3.json`: configuração persistente de bots. A forma de topo é `{ "version": 3, "bots": [] }`.
- `bot-state.v3.json`: estado de runtime atual, chaveado por id de bot. Armazena o workspace ativo, o modo rascunho/tarefa, a tarefa ativa, permissões pendentes, o offset do Telegram e a hora de atualização.
- `bot-config.json` / `bot-state.v2.json` / `bot-state.json`: entradas de upgrade único, mantidas sem alteração para rollback.
- Os antigos arquivos `bots-model-cache*.json` não são mais lidos nem escritos. As escolhas de modelo vêm do Model Selection Service do Environment proprietário.

Os segredos continuam morando no `CredentialService`; os arquivos de configuração só guardam referências como `credentialRef` e `webhookSecretRef`.

O isolamento de workspace usa:

```ts
workspaceKey = workspaceIdentity?.trim() || workspacePath;
```

A execução e a exibição de caminhos continuam usando `workspacePath`.

A execução em workspace remoto é protegida por um conector de runtime injetável. Um workspace remoto desconectado nunca reconecta como efeito colateral de uma mensagem comum, de um comando de tarefa, de um comando de configuração ou de uma resposta de permissão. Esses comandos devolvem uma resposta estável de "remoto desconectado" e não executam. Apenas `/reconnect` / `/重连` pede ao conector de runtime que reconecte o workspace remoto selecionado. Isso evita que uma mensagem de um bot remoto caia silenciosamente em um workspace local com o mesmo caminho ou abra inesperadamente um runtime remoto.

## Config do Bot

Cada bot contém:

- `id`, `name`, `provider`, `enabled`
- Credenciais do provider e campos específicos do provider, como `credentialRef`, `webhookUrl`, `feishuAppId`
- Um único ator vinculado: `providerUserId` e `displayName`
- `allowedWorkspaces`, onde `["*"]` permite qualquer workspace conhecido
- `allowedCommands`: `status`, `new`, `workspace`, `model`, `mode`, `thoughtLevel`, `sandboxMode`, `approvalPolicy`, `reply`
- `currentOptions`: `modelSelection`, `mode`, `sandboxMode`, `approvalPolicy`; o raciocínio é armazenado em `modelSelection.options.reasoningLevel`.
- `replyMode`: `assistant_changes`, `assistant_toolcalls_changes`, `summary_changes` ou `streaming_card`. Feishu / Lark suportam apenas `streaming_card`; configs antigas de Feishu / Lark com outro valor são normalizadas de volta para `streaming_card`. Todos os outros providers suportam apenas as três granularidades sem cartão; `streaming_card` é excluído das Settings e de `/reply`, e valores copiados ou legados são normalizados para `assistant_changes`.

## Carregamento do SDK do Feishu / Lark

O provider compartilhado de Feishu/Lark carrega `@larksuiteoapi/node-sdk` apenas ao iniciar uma
conexão WebSocket com um App ID válido e credenciais disponíveis. Importar o
provider, construir adaptadores, renderizar cartões e usar os caminhos de requisição
HTTP existentes não devem carregar o SDK. O cache de módulos do Node é dono do módulo
carregado; o provider não mantém um segundo cache de SDK nem um ciclo de vida de promises.

```text
channel runtime starts connection
  → validate App ID and load credentials
  → check cancellation → import SDK → check cancellation
  → construct SDK client → existing ready/reconnect/close lifecycle
```

Se o cancelamento chegar enquanto o módulo está carregando, a inicialização rejeita sem
construir um client. Feishu e Lark mantêm seus respectivos domínios e compartilham o
mesmo caminho de carregamento. Fechar uma conexão libera seus recursos existentes, mas
não promete descarregar o módulo do SDK. Isso altera apenas o custo de carregamento; Bot,
desktop continuous e o roteamento mobile replayable permanecem inalterados.

Aceitação: operações apenas de provider e HTTP/cartão não avaliam o SDK;
a primeira conexão válida o carrega; credenciais inválidas e inicialização
pré-cancelada não o carregam; cancelamento durante o carregamento nunca inicia um
client tardio; ambos os domínios e os caminhos existentes de ready/reconnect/timeout/close
continuam funcionando.

## Bind

`/bind <code>` vincula um ator privado a um id de bot específico. Revincular sobrescreve o `providerUserId` e o `displayName` daquele bot; não acrescenta outro usuário. Bots não vinculados aceitam apenas `/bind`; mensagens comuns e outros comandos são ignorados ou rejeitados.

Em runtime, a autorização resolve exatamente um bot habilitado por:

```ts
provider + providerUserId;
```

Grupos comuns de Feishu/Lark e grupos de tópico dedicados suportam sessões colaborativas explicitamente habilitadas. Tópicos vinculam tarefas independentes; apenas menções @ disparam trabalho, e `/history on` coloca um grupo em background incremental de tópico. Outros providers mantêm seu comportamento existente. Veja
[colaboração em grupo do Feishu](bots-feishu-group-collaboration.md) para o contrato normativo
de autorização de grupo, entrada, fila, entrega e ciclo de vida.

## UI de Settings

O painel direito do diálogo de Bots segue a mesma estrutura de linhas de Settings General: cada configuração é uma linha de largura total com o rótulo e a descrição à esquerda, e o input, select ou grupo de botões à direita. Setup de provider, workspaces permitidos, identidade e modo de resposta reutilizam os componentes compartilhados de linha de settings, para que a altura dos controles e o espaçamento permaneçam consistentes. O modo de resposta mostra um subtítulo dinâmico que explica a granularidade selecionada: respostas padrão focam no texto do assistente e nas alterações de arquivo, respostas completas incluem o progresso das chamadas de ferramenta, respostas de resumo enviam apenas o resultado final mais o resumo de alterações, e respostas de cartão em streaming atualizam um único cartão do Feishu / Lark no lugar. Uma tarefa do Feishu / Lark usando respostas de cartão em streaming mantém a saída comum do Agent independente de interações bloqueantes. AskUserQuestion, permissões e aprovação de plano usam uma única mensagem de interação atual. Antes de uma interação ser exibida, o cartão de streaming atual é selado: seu conteúdo acumulado continua visível, seu status em execução é removido, e a saída posterior do Agent precisa criar um novo cartão de streaming. O progresso de perguntas apenas substitui a mensagem de interação atual e nunca copia a pergunta, as respostas ou o plano de volta para qualquer dos cartões de streaming. Um cartão de AskUserQuestion pendente lista somente perguntas já submetidas e suas respostas, seguido de um divisor e da pergunta atual sem resposta; seleções de rascunho para a pergunta atual ficam em seus controles, em vez de aparecerem como histórico respondido. O cartão concluído lista todas as perguntas e respostas submetidas. Para uma ação de cartão WebSocket do Feishu/Lark, o BotService primeiro avança o estado autoritativo da interação e devolve a mensagem de saída completa ao transporte. O handler da ação renderiza sincronamente essa mensagem exata como `card.raw`, incluindo respostas acumuladas, a pergunta atual, os controles e o novo token da pergunta. Essa resposta síncrona é a única escrita de cartão para o clique: ela também não chama `card_update_token`, não faz PATCH da mensagem, não sintetiza um cartão a partir de `zcodeCardText`, não envia uma mensagem substituta e não revoga a original. Resolver ou cancelar a interação devolve o mesmo cartão como um resultado somente leitura e sem botões, e o mantém no chat. O encerramento da tarefa também mantém o último cartão de interação como resultado terminal somente leitura. Feishu e Lark mostram apenas cartão em streaming neste seletor, porque seu caminho de resposta de bot de alta qualidade depende de atualizações Card JSON 2.0. Telegram, Weixin, webhook e todos os outros providers mostram apenas respostas padrão, completas e de resumo; nunca expõem cartão em streaming. Os nomes de canal de Feishu e Lark no diálogo de Bots e nos cartões de canal de bot do Controle Remóvel Mobile mostram as mesmas tags compactas de região da Welcome Screen: Feishu usa a tag `中国` / `CN` da BigModel, e o Lark usa a tag `全球` / `Global` da Z.AI. Essas tags são apenas de exibição e não afetam o roteamento por provider.

O setup de provider esconde deliberadamente os valores de segredos armazenados. O Telegram mostra um QR code fixo do BotFather ao lado do input do token antes de um segredo ser salvo; após salvar, avança automaticamente para o código de bind de chat privado até o bot ser conectado. Feishu / Lark começam com autorização por QR para credenciais do app e depois mostram automaticamente o código de bind de chat privado. Weixin começa com login por QR; um login por QR bem-sucedido salva o token do bot e limpa o painel de detalhes do QR. Como o login por QR do Weixin retorna credenciais do bot em vez do id de chat entregável do usuário que escaneou, o usuário precisa enviar qualquer primeira mensagem no Weixin para ativar o chat. Essa primeira mensagem de ativação recebe uma resposta de boas-vindas/ajuda e não é enviada ao fluxo de tarefas do ZCode como um prompt.

O setup de webhook está disponível na nova lista de providers de bot e na superfície de configurações de provider. Feishu e Lark são ambas entradas de primeira classe na nova lista de bots. Elas compartilham a mesma implementação de provider e o mesmo fluxo de registro, mas o id de provider selecionado precisa ser preservado, porque ele escolhe o domínio da OpenAPI (`open.feishu.cn` para Feishu, `open.larksuite.com` para Lark). O DingTalk aparece ali apenas como um canal "em breve".

## Comandos

- `/status`: relata o workspace, o modelo, a tarefa e o estado de runtime atuais. Providers de modelo customizados são exibidos com seu nome de exibição, por exemplo `My Provider/my-model`, em vez do id interno do provider.
- `/new` / `/clear`: limpa a tarefa ativa em `bot-state.v3.json` e volta para rascunho.
- `/project` / `/workspace` / `/项目`: lista os workspaces permitidos. Selecionar um atualiza os campos de workspace resolvidos em `bot-state.v3.json`.
- `/reconnect` / `/重连`: reconecta o workspace remoto atualmente selecionado. Este é o único comando com efeitos colaterais de conexão remota.
- `/model`: lista e atualiza `currentOptions.model`. As escolhas de provider/modelo são construídas a partir do `ModelSelectionService.getView()` do Environment alvo a cada abertura de menu. Workspaces locais leem a Local Environment View; workspaces remotos leem a Remote Environment View. `/model` mantém um fluxo de dois níveis provider -> modelo; ele não deve sintetizar um provider a partir do nome de CLI ativo, desserializar um snapshot do Provider Registry, nem renderizar diretamente a partir de caches de bot persistidos. Os callbacks de provider e modelo carregam a identidade real do Registry. Um callback de um cartão expirado é rejeitado e pede ao usuário para reabrir `/model`. `bots-model-cache.v2.json` armazena apenas as opções de configuração do workspace; configuração e credenciais de Provider/Model não são persistidas pelo serviço de Bot. Uma Selection View vazia bem-sucedida limpa o menu de provider de bot em memória. Apenas uma falha real de leitura pode reutilizar a última View em memória; uma View vazia não pode manter modelos excluídos ou desabilitados selecionáveis.
- `/mode` / `/模式`: lista e atualiza `currentOptions.mode`. Esta é a mesma superfície de modo de tarefa do ZCode usada pelo composer da UI; os internos do provider são dono de qualquer mapeamento de sandbox ou aprovação.
- `/think` / `/thoughtLevel` / `/思考`: lista e atualiza `currentOptions.thoughtLevel`.
- `/cli`: lista e atualiza `currentOptions.cli`.
- `/reply` / `/回复`: lista e atualiza `replyMode`.
- `/stop` / `/停止`: interrompe a geração da tarefa ativa.

Comandos de configuração escrevem em `bot-config.v3.json`, de modo que a próxima mensagem de terceiros já usa as opções atualizadas. O fluxo de runtime, como tarefa ativa, permissões pendentes e offset do Telegram, escreve apenas em `bot-state.v3.json`.

Mensagens comuns se comportam como o input da UI:

- No modo rascunho, ou quando não existe tarefa ativa, a mensagem cria uma nova tarefa do ZCode e se torna o primeiro prompt.
- A seleção de modelo do rascunho invalida o nível de pensamento herdado anteriormente. Quando a primeira mensagem cria uma tarefa, a validação de modo e nível de pensamento usa as opções de configuração específicas do modelo daquela tarefa, em vez do snapshot do modelo anterior do workspace. Valores herdados não suportados são ignorados. Se a configuração inicial ainda falhar, a tarefa provisória é apagada antes de o estado do Bot sair do modo rascunho, para que trocar de provider de modelo não possa deixar uma tarefa ativa vazia.
- No modo tarefa, a mensagem é enviada para a tarefa ativa.
- Antes de uma mensagem comum reutilizar uma tarefa ativa, consulte as lápides de tarefas excluídas do workspace selecionado através do serviço de tarefas dele (incluindo `workspaceIdentity`). Uma tarefa excluída confirmada devolve o Bot ao rascunho, limpa permissões/perguntas/seleções pendentes e cria uma tarefa nova para esta mesma mensagem. Uma tarefa ausente de uma lista filtrada, ou apenas arquivada/pinada, não é evidência de exclusão; falhas de leitura não devem disparar criação.
- Uma vez que a substituição é criada e vinculada, envie um único aviso localizado: “原任务已删除，已为你新建任务。本条消息将在新任务中处理，不会继承原任务的对话上下文。” Depois processe a mensagem original exatamente uma vez. A entrega do aviso é de melhor esforço: registre falhas sem liberar a reivindicação de deduplicação de entrada nem reexecutar o modelo. Registre os ids de tarefa antigo/novo no log do host e use as difusões existentes de criação/prompt para a visibilidade no Desktop. Uma falha de configuração de nova tarefa mantém o estado de rascunho e não pode afirmar que a substituição teve sucesso.
- Essa recuperação se aplica apenas a mensagens comuns. Callbacks antigos de permissão/cartão mantêm seu comportamento de sessão expirada. Ela não reconecta workspaces remotos nem altera os limites de entrega desktop continuous / mobile replayable.
- Integração do Todo103: a criação da substituição precisa reutilizar a inicialização atual do rascunho e a Model Selection View pública, e então congelar essa seleção efetiva ao longo de create/configure/primeiro envio do V4. Não restaure os campos de staging model/thoughtLevel nem uma segunda seleção vinculada pertencente ao Bot. Uma Session vinculada que não foi excluída continua seguindo a seleção persistida na Session do Todo99 para sua próxima entrada ociosa.

```text
ordinary message -> authorized workspace task service -> deleted-task tombstone?
  no  -> existing task flow
  yes -> draft (clear old interaction state) -> create/configure/bind replacement
      -> created broadcast -> one best-effort notice -> original prompt once
```

- Se a tarefa ativa está em execução, a mensagem é rejeitada até que a tarefa fique pronta ou até que `/new` seja usado.
- Se o workspace selecionado é remoto e está desconectado, a mensagem é rejeitada e informa ao usuário para enviar `/reconnect` primeiro. A mensagem original não é reproduzida após a reconexão.

## Entrega de resultado de tarefa agendada

Quando um turno de Bot do Feishu, Lark ou Weixin cria uma automação através de `CronCreate`, o Host registra um alvo de entrega privado junto com a definição da automação. O alvo de entrega contém apenas o provider, o id do Bot, o alvo de chat estável e o tipo de chat privado/grupo. Nunca contém o id da mensagem de entrada nem o token temporário de contexto do provider, porque esses valores pertencem à mensagem de criação e não são identificadores de roteamento válidos para uma execução futura.

O alvo de entrega é metadata de turno confiável injetada por `BotsService`; não faz parte dos argumentos de `CronCreate` visíveis pelo modelo, e o modelo não pode escolher outro Bot ou chat. Um turno normal de UI desktop/mobile não injeta essa metadata e portanto não adquire entrega de Bot como efeito colateral.

```text
Feishu / Weixin inbound message
  -> BotsService injects trusted delivery target into this prompt turn
  -> CronCreate reads the active turn target
  -> automation/create persists definition + delivery target

Scheduler claims a run
  -> Host restores/creates the target task
  -> BotsService subscribes with bot-channel-continuous
  -> Host sends the automation prompt
  -> task_complete / task_error
  -> final result or failure is sent to the original Bot chat
```

Semântica de entrega:

- Execuções agendadas e manuais de uma automação originada em um Bot entregam seu resultado terminal ao chat original.
- O scheduler registra a assinatura do Bot antes de enviar o prompt, para que um evento terminal rápido não chegue antes do listener.
- A entrega de automação usa `summary_changes`: chunks intermediários do assistente e rastros de ferramenta não criam mensagens de chat extras; a conclusão envia o resultado final do assistente mais o resumo de alterações, e a falha envia uma única mensagem localizada de falha.
- O alvo persistido sobrevive ao reinício do aplicativo. O isolamento de workspace ainda usa `workspaceIdentity?.trim() || workspacePath`; a execução no sistema de arquivos continua usando `workspacePath`.
- Se o Bot foi apagado, desabilitado, teve o provider alterado, perdeu credenciais, ou o envio pelo provider falhou, o serviço registra um aviso com limitação de frequência e deixa o despacho da automação e o acerto de desfecho intactos. A entrega de Bot é de melhor esforço e não é uma autoridade de retry do scheduler.
- Este caminho mantém o stream `bot-channel-continuous` existente. Não cria um segundo runtime de Agent e não reutiliza nem enfraquece a recuperação por snapshot/lacuna do `web-remote-replayable` do mobile.

## AskUserQuestion / Elicitation

O AskUserQuestion do ZCode Agent é conectado por eventos de requisição/resposta de elicitation do ZCode Protocol. O runtime de bot armazena a requisição pendente em `bot-state.v3.json` com o id da tarefa, o id da requisição, o id do run, as perguntas normalizadas, o índice da pergunta atual e as respostas coletadas. O payload de resposta tem a mesma forma da UI:

```json
{
  "answers": { "Pick a path?": "Fast" },
  "answer_0": "Fast",
  "answer": "Fast"
}
```

`ExitPlanMode` usa o mesmo mecanismo de resposta com uma apresentação dedicada em cada canal. Feishu / Lark renderizam o plano completo em um cartão, seguido por um divisor nativo, o prompt de revisão localizado (`请审阅此实施计划。` / `Review this implementation plan.`) e os botões localizados de aprovação e de resposta customizada. O Telegram renderiza o mesmo conteúdo como texto de mensagem com botões inline nativos. O Weixin renderiza como texto simples numerado, e o webhook inclui tanto o texto completo quanto o schema de elicitation estruturado. A aprovação de plano não renderiza os títulos genéricos `提问` / `Plan` nem uma linha separada de descrição de aprovação. Apenas o campo `plan` é projetado no schema de elicitation do Bot; input de permissão arbitrário não é exposto, e o diálogo de aprovação do desktop mantém seu limite de apresentação independente.

A requisição de protocolo ao vivo carrega a metadata em `schema` e o corpo do plano separadamente em `input`. A projeção do serviço precisa mesclar apenas `input.plan` em uma elicitation com `schema.interaction === "plan_approval"`. Uma escolha genérica `schema ?? input` descarta o plano sempre que houver metadata presente e faz Feishu / Lark recorrerem ao cartão incorreto `Question / Plan`.

A metadata de renderização da aprovação de plano faz parte do estado de elicitation pendente persistido. Toda atualização de cartão no lugar, incluindo a expansão da resposta customizada, a validação do formulário, a recuperação após reinício, a aprovação e o cancelamento, reconstrói o mesmo schema restrito `{ interaction: "plan_approval", plan }` a partir desse estado. Input de permissão bruto nunca é persistido como metadata de renderização do Bot.

Interação por provider:

- O Telegram usa botões inline. Respostas de seleção única submetem imediatamente; respostas de múltipla seleção alternam as opções e usam `Done` para submeter. O callback data carrega apenas índices numéricos curtos. Quando o texto interativo excede o limite de mensagem única do Telegram, o teclado inline é anexado ao chunk final que contém o prompt de decisão, nunca a um chunk de contexto anterior.
- Feishu / Lark usam um único cartão interativo Card JSON 2.0 para todo o ciclo de vida do AskUserQuestion. A pergunta atual é renderizada como escolhas planas em vez de dropdowns. Perguntas de seleção única usam linhas com estilo de rádio: clicar em uma resposta predefinida a submete imediatamente, enquanto clicar em `自定义回答` apenas atualiza o cartão original e expande o input customizado inferior com controles de enviar/cancelar. Perguntas de múltipla seleção usam linhas com estilo de checkbox: clicar em uma resposta predefinida alterna o rascunho e atualiza o cartão original, enquanto clicar em `自定义回答` alterna o input customizado; os usuários submetem todas as respostas marcadas com o botão de envio do formulário. Enviar o formulário manda `/elicitation <token> __form__:<payload>` de volta pelo caminho normal de callback, de modo que cartões obsoletos são rejeitados pela mesma verificação de token que os callbacks de escolha. Para perguntas de múltipla seleção, o input customizado não vazio é anexado às escolhas de checkbox marcadas. A seção `<answers>` superior renderiza as respostas concluídas como títulos markdown h4, como `#### 1/2 Question`, seguidos do texto da resposta. Blocos de resposta são separados apenas por espaçamento. Se um cartão pendente já tem respostas, um divisor nativo Card JSON 2.0 `hr` separa `<answers>` da área `#### 提问` atual. Quando todas as perguntas são respondidas, o mesmo cartão é atualizado para um estado final apenas com as respostas completas: sem formulário, sem botões e sem texto extra de conclusão.
- O Weixin usa texto simples numerado. Os usuários respondem com um número para seleção única, números separados por vírgula ou texto para múltipla seleção/respostas customizadas, e `0` cancela.
- O webhook envia mensagens de saída estruturadas com `type: "zcode.bot.elicitation_request"` e um objeto `elicitation` contendo `requestId`, `taskId`, `runId`, `currentQuestionIndex`, `questions` e `schema` opcional.
- O webhook pode responder com:

```json
{
  "type": "zcode.bot.elicitation_response",
  "botId": "webhook-1",
  "userId": "user-1",
  "requestId": "elicit-1",
  "action": "accept",
  "content": {
    "answer": "Fast"
  }
}
```

Discord e WeCom permanecem providers reservados. O suporte futuro a Discord deve usar menus de seleção e modais; o suporte futuro a WeCom deve preferir botões de cartão e recorrer ao fluxo de texto numerado do Weixin.

## Anexos

Bots aceitam anexos de entrada de todos os providers implementados. Os adaptadores de provider convertem payloads de mídia nativa em uma forma comum de anexo de bot; o serviço baixa ou decodifica os bytes, armazena-os sob o diretório de dados do app do ZCode em `bot-attachments/` e nunca os escreve no workspace do usuário.

O tratamento de anexos segue o modelo de capacidade de prompt do ZCode:

- Imagens viram entradas `ZCodePromptAttachment` com `kind: "image"` e são enviadas como conteúdo de imagem do ZCode quando o Agent ativo suporta prompts de imagem.
- Áudio vira entrada `ZCodePromptAttachment` com `kind: "audio"` e é enviado como conteúdo de áudio do ZCode quando o Agent ativo suporta prompts de áudio.
- Vídeo e arquivos genéricos são armazenados localmente e anexados ao prompt como contexto de arquivo, com nome de arquivo, tipo MIME, tamanho e caminho do cache local.
- Uma mensagem pode incluir até 4 anexos, com limite de 5MB por anexo.
- Se o usuário envia anexos sem texto, o bot usa o prompt padrão: `请查看附件并根据内容协助我。`

## Providers

O texto de bot voltado ao usuário segue o idioma atual do app vindo das settings. As respostas da camada de serviço são formatadas pelo catálogo compartilhado de mensagens de bot antes de chegarem aos providers. Os adaptadores de provider não devem introduzir novos rótulos fixos voltados ao usuário ao renderizar UI nativa, como botões, placeholders de cartão, texto de status Card JSON 2.0 ou dicas de seleção só em texto; esses rótulos devem ser pré-formatados pelo serviço ou receber o idioma da mensagem de saída. Por isso, as respostas Card JSON 2.0 de Feishu / Lark carregam o idioma junto com a mensagem de saída ou o estado de cartão em streaming, para que controles pertencentes ao provider, formulários de AskUserQuestion e linhas de status em streaming permaneçam no mesmo idioma do resto da resposta do bot. Nomes de comando de protocolo como `/status`, `/workspace`, payloads de callback e diagnósticos de erro de API do provider permanecem identificadores estáveis em inglês.

Os adaptadores de provider existentes são reutilizados:

- Telegram: long polling no lado do host; o offset é persistido em `bot-state.v3.json` sob o id do bot. Mensagens de foto, documento, vídeo, áudio e voz são convertidas em anexos e baixadas com `getFile`.
- Weixin / 微信: cliente iLink embutido baseado na referência de protocolo openclaw-weixin da Tencent. O ZCode inicia o login por QR através de `/ilink/bot/get_bot_qrcode`, salva o `bot_token` retornado como credencial do bot, faz long polling em `/ilink/bot/getupdates`, envia texto com `/ilink/bot/sendmessage` usando o payload `msg.item_list`, normaliza respostas de saída multilinha em quebras de linha rígidas, busca `typing_ticket` com `/ilink/bot/getconfig` antes de `/ilink/bot/sendtyping` e persiste `get_updates_buf` mais o estado de ativação de primeira mensagem em `bot-state.v3.json`. Itens de texto e mídia reconhecíveis em `item_list` são divididos em texto de mensagem e anexos. Não exige rodar um gateway openclaw-weixin externo.
- Webhook: callback HTTP de entrada e resposta opcional de webhook de saída.
- Feishu e Lark são providers de bot separados que compartilham o mesmo adaptador. O id de provider seleciona o domínio da OpenAPI (`open.feishu.cn` ou `open.larksuite.com`), então a config de bot não carrega um campo `feishuDomain` separado. Ambos usam eventos WebSocket persistentes, respostas em cartão interativo Card JSON 2.0, reações de mensagem `Typing` como indicador de digitação transitório e downloads de recursos da OpenAPI para anexos de imagem/arquivo/mídia. A API de mensagens ainda envia `msg_type: "interactive"` com `content` como uma string JSON, enquanto o payload do cartão declara `schema: "2.0"` e armazena markdown/botões de resposta em `body.elements`.

Quando `replyMode` é `streaming_card`, apenas Feishu e Lark usam a renderização específica do modo. O stream da tarefa cria uma mensagem Card JSON 2.0 e atualiza esse cartão à medida que o texto do assistente chega e as chamadas de ferramenta começam ou terminam. Uma interação bloqueante sela o cartão atual e inicia um novo segmento de cartão para qualquer saída posterior do Agent; a própria interação nunca faz parte de uma timeline de cartão em streaming. O corpo do cartão é uma timeline de blocos ordenados, em vez de uma área de texto global mais uma área de ferramentas global: chunks do assistente são anexados ao bloco `message` atual; o primeiro evento de ferramenta depois de texto abre um bloco `tools`; chamadas de ferramenta consecutivas permanecem no mesmo bloco `tools`; o próximo chunk do assistente abre um novo bloco `message`. Chamadas de ferramenta nunca são expandidas em inputs brutos, outputs, stdout, stderr, JSON ou campos de trace; elas são resumidas com o mesmo formatador de resumo compacto usado pelas respostas de chamada de ferramenta do bot. Cada sequência contígua de ferramentas é renderizada dentro de um único contêiner recolhível de resumo de ferramenta, para que o cartão seja lido como `message`, `resumos de ferramenta`, `message`, `resumos de ferramenta`, `message` sem virar mensagens de chat separadas. O contêiner usa o `collapsible_panel` do Card JSON 2.0 como shell `<tools>`: o cabeçalho mostra `🛠️ Tool summaries (n)` com uma seta de expansão à direita, o conteúdo traz a lista compacta de bullets, e o painel tem fundo neutro mais borda cinza para temas claros e escuros. O bloco de ferramentas mais recente fica expandido enquanto seu segmento de cartão está em execução; blocos de ferramentas antigos, segmentos selados e cartões terminais ficam recolhidos. Outros providers mantêm seu comportamento de reply-mode existente se receberem esse valor de config antiga ou copiada.

```text
Agent output A -> streaming card A (running)
                         |
                         +-- AskUserQuestion / permission / Plan
                               |
                               +-> card A (sealed, retained)
                               +-> interaction card (active)
                                      |
                                      +-> question progress: update the same message_id only
                                      +-> resolved/cancelled/terminated: read-only, retained
                               |
                               +-> later Agent output -> streaming card B (running)
```

Falhas de provider no cartão em streaming seguem o contrato de backoff local ao turno e de
disjuntor em
[Confiabilidade do Cartão em Streaming do Feishu](./bots-feishu-streaming-card-reliability.md).
Atualizações forçadas de ferramenta ou terminais não podem contornar esse limite de
recuperação, e os logs de produção identificam o evento de tarefa que disparou cada escrita
falhada ou abriu o circuito.

Feishu / Lark não expõe uma API nativa de estado de digitação de bot. O provider lê o `message_id` de entrada, adiciona uma reação `Typing` enquanto a tarefa do ZCode está em execução e remove a reação quando a tarefa é concluída, gera erro, é interrompida ou espera uma requisição de permissão. Se o payload do callback não tiver `message_id`, a digitação é ignorada em vez de enviar um sinal de nível de chat enganoso.

Requisições de entrada do webhook continuam passando por:

```text
POST /api/bots/webhook
```

O serviço, o serviço RPC, a rota HTTP, os dados persistidos e a UI usam todos a nomenclatura Bots.

### Diagnóstico de entrega de resposta do Feishu (ZCT-2096089929570893824)

- Apenas mensagens de entrada privadas podem criar ou avançar tarefas; mensagens de grupo mantêm a resposta existente de chat privado apenas. A entrega privada usa `open_id`; sem fallback especulativo de `chat_id` nem novas retentativas.
- Falhas de criação/atualização de mensagens mantêm o status HTTP, o `code` de negócio, `msg` e `log_id` (corpo da resposta primeiro, header da resposta como reserva). Os diagnósticos de criação incluem o tipo de receive ID, nunca credenciais ou conteúdo de mensagem.
- `BotRuntimeInfo.deliveryError` rastreia a escrita de mensagem do Feishu/Lark que falhou mais recentemente, independentemente do status de conexão. Uma escrita de mensagem bem-sucedida a limpa; uma reconexão WebSocket não. Esse estado é volátil e exibido nas configurações de Bot com um rótulo localizado de falha de entrega e detalhe de diagnóstico. Enquanto o diálogo está aberto, o status é atualizado serialmente a cada dois segundos após a leitura anterior terminar; fechá-lo cancela o polling posterior e ignora resultados atrasados.
- A retentativa de streaming limitada existente e o comportamento de conclusão de tarefa permanecem inalterados. Esta mudança melhora o diagnóstico; não afirma resolver a rejeição upstream.
- Os streams de Bot permanecem `bot-channel-continuous`; os limites de `desktop-continuous` do desktop e `web-remote-replayable` do mobile e o roteamento de workspace não mudam.

```text
message write -> failure -> deliveryError -> Bot settings
              -> success -> clear deliveryError
WebSocket status ------------------------> connection status (independent)
```

Referências: [send](https://open.feishu.cn/document/server-docs/im-v1/message/create.md), [reply](https://open.feishu.cn/document/server-docs/im-v1/message/reply.md). A documentação oficial de send recomenda open_id para destinatários usuário; nenhuma resolução documentada foi encontrada para o texto de erro deste ticket.

## Refatoração de providers, upgrade e rollback

A versão atual tanto da configuração quanto do conteúdo de estado é 3. Quando o arquivo v3 correspondente não existe, o Repository importa em uma única direção os antigos `bot-config.json` e `bot-state.v2.json` (estado anterior em `bot-state.json`) e grava v3 imediatamente. Os arquivos antigos são mantidos apenas para rollback, sem modificação, sem remoção e sem escrita dupla contínua. Depois que o v3 existe, apenas os novos campos são lidos, e erros de parsing ou de IO são expostos diretamente, sem voltar secretamente para os arquivos antigos. Modelos antigos são convertidos conforme a identidade explícita do Todo 72; quando não for possível determinar, o campo fica vazio e o Bot é preservado. O App antigo, após o rollback, vê o snapshot de bots de antes do upgrade e não promete ver bots adicionados, removidos ou modificados na versão nova.

### Ações de entrega de respostas em grupo (2026-09-07)

Desktop e mobile não exibem mais a faixa persistente de sincronização de grupo/workspace compartilhado acima do composer. A sincronização de grupo e os rótulos de origem continuam ativos.
O composer não tem painel de entrega. Entregas falhas ou incertas expõem um pequeno ícone localizado ao lado do carimbo de hora da resposta concluída correspondente; clicar abre ações de retentativa ou reconciliação sem repetir o corpo da resposta nem o id do remetente.
Envios bem-sucedidos e em voo permanecem ocultos. A resposta de ativação de grupo mantém sua divulgação de arquivo compartilhado. Veja a especificação de colaboração em grupo para a associação por turno e a projeção de entrega segura contra crash.

### Troca de tarefa em grupo após parada (2026-09-07)

A troca em grupo lê a fase de controle da CLI, a fila e as interações pendentes. Cartões de permissão/pergunta de bot em cache não podem bloquear independentemente um novo rascunho após a parada.
Uma CLI ociosa limpa registros de interação obsoletos antes de trocar; estados em execução, enfileirados e bloqueados por interação devolvem orientações localizadas distintas. Workspaces remotos desconectados ainda exigem reconexão explícita. Os limites de desktop continuous e mobile replayable e a fila única da CLI permanecem inalterados.

Rótulos de membros de grupo usam o diretório atual de membros do chat. Habilite a permissão de aplicativo `im:chat.members:read` e publique-a para mostrar nomes sem exigir acesso a contatos de toda a organização. A ausência da permissão preserva o tratamento de mensagens e mostra um identificador curto e estável de membro. Veja a especificação de colaboração em grupo.