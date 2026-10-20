# Bots E2E Case Catalog

## Topic collaboration additions

- BOT-E2E-TP-01 (also covers mention-only guidance without admission and quoted text in one CLI queue input): a native-topic-bound task uses the real Host/CLI queue; Desktop
  source and attachments survive cancellation; resolving its saved delivery through
  the reply action bar targets that topic and works at narrow viewport widths.
- BOT-E2E-TP-02: two ordinary topics and a dedicated topic-group root create distinct
  tasks; ordinary discussion is silent; the next mention sees only the incremental
  background up to its own message. Requires real Feishu CUA evidence in addition to
  provider/service tests. No fixture can prove tenant permissions or native routing.

Este documento registra o contrato de comportamento de ponta a ponta do canal de Bot. Os casos de Bot são independentes de conversation-session: eles reutilizam o task stream do ZCode, mas o ponto de entrada, o dono do estado e a evidência externa ficam em `BotsService` e na API do provider.

## Decisões de escopo

| Limite               | Decisão                                      | Motivo                                                          |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------- |
| Escopo principal desta rodada         | Ciclo de vida completo de `streaming_card` do Feishu/Lark | É o comportamento visível ao usuário e de maior risco entre camadas nesta branch                        |
| Ambiente de provider      | CI usa mock da HTTP API do Feishu              | Evita instabilidade causada por tenant, credenciais e rede reais                            |
| Temporização de task          | `controlled-stream`                       | É preciso observar a expansão em execução e o recolhimento no estado terminal; `fast-text` não prova estados intermediários    |
| Semântica do cliente         | `bot-channel-continuous`                  | O stream de Bot não entra na semântica de recuperação `web-remote-replayable` do celular        |
| Lock de runtime multi-host | Depois, como process E2E independente                      | Já existe regressão de service integration; fixtures de múltiplos processos não são misturados à semântica de card |
| Plan approval UI   | Excluído                                      | Não tem cruzamento de estado direto com o ciclo de vida do canal de Bot                             |

## Casos aceitos

### BOT-E2E-MN-03: menção por nome sem ID nativo

- Setup: grupo/tópico já autorizado, com diretório de membros do grupo e histórico de menções confiáveis a bots; a entrada contém apenas o nome em texto.
- Action: ReplyToChannel faz consulta por nome com correspondência inclusiva; candidato único ou correspondência completa única envia direto, múltiplos são resolvidos separadamente.
- Assert: nomes em inglês preservam os espaços; todos os nomes não resolvidos são retornados de uma vez, e não se pode relatar sucesso para o que não foi consultado.
- Assert: alvo único vira at nativo; em homônimos/sem resultado/sem permissão, zero envios; o mesmo toolCall é entregue apenas uma vez.
- Evidence: MN-01 cobre os dois canais e grupo/tópico via E2E de serviço/plataforma; MN-02 busca membros do grupo por nome na continuação de conversa via CLI real.
- Status: formal; `bots/feishu-channel-mention.test.ts`,(o usuário confirmou a promoção em 2026-10-08. Permissões de tenant reais e UI de celular ainda aguardam validação, e o substituto de plataforma não é tratado como prova de produção.

### BOT-E2E-SR87: seleção válida no rascunho e primeiro despacho

- Setup: Bot vinculado com modelo/high do plano pessoal salvo; o serviço de seleção de destino retorna a seleção válida de Team do mesmo modelo/high.
- Action: consultar `/model`, `/think` e então enviar a primeira mensagem comum; em outro momento, tentar alterar o nível e despachar com um resultado expirado.
- Assert: o menu mostra a identidade e o nível válidos, mas não altera o rascunho; a primeira task adota a seleção válida; a intenção original expirada não é substituída pelo modelo padrão e nenhuma task é criada.
- Evidence: chamadas ao serviço de seleção controlado e ao serviço de tasks, e escrita do estado do Bot. O algoritmo público de resolução é coberto por testes de integração do Provider; não se afirma que este caso enviou uma requisição real de modelo.
- Status: manual-review pending; escopo baseado no Todo87, sem participação da rede externa do Feishu.

### BOT-E2E-SR99: seleção seguinte da Session vinculada

- Setup: Bot já vinculado a uma Session ociosa; a seleção original da Session é o modelo/high do plano pessoal, a View pública retorna o mesmo modelo/high de Team ou indisponível; o Bot não guarda uma segunda seleção após a vinculação.
- Action: o Bot recebe a próxima mensagem comum.
- Assert: usa apenas a seleção original da Session para chamar a View pública e, quando disponível, leva a seleção válida completa para os parâmetros reais de envio; quando indisponível, não envia, não substitui por padrão e não reescreve a seleção original nem o rascunho do Bot.
- Evidence: harness sintético prova a fronteira de consumo do Bot; W99-E03/E06 já passaram em Pro com o Task adapter de produção, requisições reais via stdio Worker e recuperação a frio. A API de IM ainda é um substituto isolado e não representa um tenant real do Feishu; ver o registro de revisão do Todo99.
- Status: accepted, manual-review pending. `/model` já foi decidido como modificação imediata e gravação na mesma Session; o contrato completo do caminho está em W99-E06.

### BOT-E2E-SC-01 ciclo de vida de timeline de card único do Feishu

- Setup: Bot de conversa privada do Feishu vinculado, com `replyMode=streaming_card` e locale chinês; o mock do provider devolve token, message id e reaction id fixos.
- Action: o callback do Feishu envia uma mensagem comum marcada com `E2E_BOT_STREAMING_CARD_LIFECYCLE`; a task produz sucessivamente texto, início/fim de ferramenta, texto, início/fim de ferramenta, texto final e `task_complete`.
- Assert:
  - o callback entra no pipeline de negócio comum e cria uma task;
  - o provider cria um único Card JSON 2.0 e depois apenas faz PATCH no mesmo message id;
  - a timeline é estritamente `message → tools → message → tools → message → terminal status`;
  - o bloco de ferramenta em execução mais recente fica expandido e, no estado terminal, todos os blocos de ferramenta ficam recolhidos;
  - as ferramentas mostram apenas um resumo compacto; é permitido que o formatter do resumo extraia dicas seguras de caminho/comando, mas sem expandir o objeto input completo e sem vazar output, stdout, stderr ou marcadores JSON brutos;
  - a reaction de digitação é criada na fase de execução e removida após o evento terminal;
  - a assinatura usa `bot-channel-continuous`, sem solicitar recuperação por snapshot/gap replayable.
- Evidence: chamadas ao task service, parâmetros da assinatura de stream, sequência de requests HTTP do mock do Feishu e o Card JSON final.
- Fixture: `packages/desktop/test/e2e/fixtures/bots/feishu-streaming-card-lifecycle.json`.
- Status: `formal`.

## Casos complementares aceitos e já automatizados

| Case ID       | Candidato                                         | Status   | Motivo                                                    |
| ------------- | -------------------------------------------- | ------ | ------------------------------------------------------- |
| BOT-E2E-AQ-01 | AskUserQuestion com múltipla escolha/customizado atualizado no mesmo card | formal | elicitation controlado e fixture de callback              |
| BOT-E2E-IL-01 | Interação bloqueante interrompe o card em streaming e preserva o card final de interação | formal | stream controlado + sequência de requests HTTP do Feishu                |
| BOT-E2E-RT-01 | Dois hosts locais disputam o mesmo runtime lock do Feishu   | formal | evidência de owner/contender/takeover com lock real de arquivo              |
| BOT-E2E-RT-02 | remote host anexado não inicia o runtime do provider | formal | evidência do estado de startup e de zero requests de rede do provider                      |
| BOT-E2E-PV-01 | Isolamento de domínio Feishu/Lark                      | formal | asserções completas de origin no mesmo mock HTTP                       |
| BOT-E2E-RW-01 | Sem reconexão e sem fallback local quando o workspace remoto desconecta | formal | contagem de chamadas do remote service e evidência de zero chamadas de task               |
| BOT-E2E-CR-01 | Resultado da execução de task agendada criada pelo Bot é devolvido à conversa original | formal | injeção do Host, reabertura por persistência, assinar antes de despachar e evidência de saída do provider |
| BOT-E2E-CF-01 | Exibe estado diagnosticável quando a conexão longa do Feishu falha     | formal | UI real do Desktop, estado de runtime e vínculo de binding combinados         |

## Podas

| Decision     | Combinação                                           | Classificação    | Base                                                                              |
| ------------ | ---------------------------------------------- | ------- | --------------------------------------------------------------------------------- |
| BOT-PRUNE-01 | streaming card × Telegram/Weixin               | pruned  | `streaming_card` é uma capacidade do provider Feishu/Lark; os demais providers mantêm a semântica de resposta original       |
| BOT-PRUNE-02 | streaming card × mobile replayable recovery    | pruned  | O task stream de Bot é fixado em `bot-channel-continuous`                                   |
| BOT-PRUNE-03 | Renderização de card único × lock de runtime multi-host                | pruned  | Os dois têm donos de estado e evidências de falha diferentes; combiná-los reduziria a capacidade de localizar falhas                              |
| BOT-PRUNE-04 | Bot lifecycle × plan approval dialog rendering | ignored | Commits adjacentes nesta branch, não pertencem ao contrato de entrega do provider de Bot                                  |
| BOT-PRUNE-05 | automation de retorno × mensagens intermediárias de streaming                 | pruned  | Tarefas agendadas apenas devolvem o estado terminal `summary_changes`, evitando que o grupo ou a conversa privada sejam inundados pelo processo das ferramentas               |
| BOT-PRUNE-06 | automation de retorno × mobile replayable recovery   | pruned  | O retorno continua assinando `bot-channel-continuous` e não entra na cadeia de recuperação gap/snapshot do celular           |
| BOT-PRUNE-07 | UI de falha de conexão × cobertura repetida do Desktop para Bot não vinculado   | pruned  | O ramo não vinculado já tem contrato de componente; o E2E de Desktop foca no estado de conflito em que a relação de vínculo e o runtime error coexistem |

### BOT-E2E-CF-01 estado de falha da conexão longa do Feishu vinculado

O caso atual carrega a partir de um `bot-config.v3.json` local do caso; após habilitar pela UI real, verifica-se a escrita v3 e a preservação do vínculo.
A importação única do arquivo antigo, o Reader estrito antigo e os bytes de rollback continuam verificados por `botsStorageV3.test.ts`.

- Setup: em uma configuração isolada de Desktop E2E, preparar um Bot do Feishu que já tenha `providerUserId`, mas sem fornecer sua credencial, de modo que o runtime do provider entre em error de forma determinística; sem acessar a rede real do Feishu.
- Action: entrar no dialog real do Desktop por "controle remoto do celular → gerenciamento de bots", habilitar o Bot e, após a atualização do runtime, reabrir o dialog.
- Assert: o resumo à esquerda mostra falha de conexão com o Feishu; o status à direita mostra "conexão interrompida" em vez de "conectado"; os detalhes do erro indicam limite de conexão longa ou serviço do Feishu ocupado e sugerem vincular um novo bot em caso de falhas persistentes, mantendo a entrada de "desvincular".
- Evidence: configuração de Bot sob HOME isolado, status real de runtime do Host, DOM do renderer do Desktop e screenshot da falha.
- Boundary: valida apenas a projeção de runtime da interface de gerenciamento `desktop-continuous` do Desktop, sem criar session `web-remote-replayable` no celular e sem depender de WebSocket real do Feishu.
- Status: `formal`, aprovado por aceite manual no Desktop e promovido.

### BOT-E2E-CR-01 retorno do estado terminal de task agendada originada de Bot

- Setup: preparar um Bot de conversa privada do Feishu vinculado e, em um workspace real, enviar uma mensagem que dispare `CronCreate`; o mock do provider do Feishu registra todas as requisições de saída. O Weixin reutiliza o mesmo contrato de delivery target / watcher, com a saída de estado terminal em `/sendmessage` provada separadamente por provider service integration test.
- Action: criar a automation, fechar e reabrir o repository de automations para provar que o destino foi persistido; o scheduler retoma a task vinculada e, após registrar o watcher de Bot, envia um único prompt de automation controlado, injetando `task_complete` e `task_error` separadamente.
- Assert:
  - o turno de prompt de Bot carrega o `{ provider, botId, providerUserId, chatType }` injetado pelo Host, enquanto um prompt comum de UI não carrega;
  - os parâmetros de `CronCreate` não expõem o destino do Bot, e o protocolo de automation lê e persiste apenas a partir do turno ativo;
  - após reabrir o repository, o destino ainda pode ser lido por `automationId + workspaceKey`, e JSON sujo degrada para "sem destino";
  - o scheduler conclui a assinatura `bot-channel-continuous` antes do `sendPrompt`;
  - a conclusão envia apenas o resultado final e o resumo de mudanças para a conversa original, e o erro envia uma única mensagem de falha;
  - exclusão, desativação do Bot, provider incompatível ou falha de saída do provider apenas registram warning e não alteram o despacho nem a liquidação da execução da automation;
  - `workspaceIdentity` atravessa o workspace remoto, e a correspondência não pode ser feita apenas por `workspacePath`.
- Evidence: E2E de Desktop formal prova o payload dos protocolos V4/legacy, a leitura ao reabrir o sqlite, a ordem das chamadas ao task service, os parâmetros da assinatura de stream e os requests HTTP do mock do provider do Feishu; o `/sendmessage` do Weixin é provado pelo provider service integration test em `packages/services/test/botsService.messageFlow.test.ts`.
- Boundary: o retorno de Bot não cria um runtime independente; o desktop continua `desktop-continuous` e o controle remoto do celular continua `web-remote-replayable`.
- Status: `formal`.

### BOT-E2E-IL-01 ciclo de vida segmentado de interação e card em streaming no Feishu/Lark

- Setup: Bot de conversa privada do Feishu/Lark, com `replyMode=streaming_card`; a task produz primeiro o corpo normal do Agent e depois um AskUserQuestion ou um Plan approval.
- Action: o usuário avança a pergunta e conclui a interação, e o Agent continua emitindo o corpo; cobre-se também task error/stop durante a espera pela interação.
- Assertions: o card em streaming antigo mantém apenas o conteúdo do Agent anterior à interação e entra em um estado de fechamento sem status Running; durante o AskUserQuestion, a exibição acumula como "resposta já enviada → separador → pergunta atualmente pendente", e o rascunho da pergunta atual não entra na área já respondida; o action handler de WebSocket precisa gerar um único `card.raw` de forma síncrona a partir do outbound completo retornado pelo callback de negócio, contendo o token da nova pergunta, sem executar novamente `card_update_token`, PATCH de message, POST ou DELETE; após a conclusão, o cancelamento ou o término da task, o card de interação permanece como um card somente leitura e sem botões; o conteúdo do Agent após a interação cria um novo card em streaming; nenhuma pergunta, resposta ou corpo de Plan é preenchido de volta no card em streaming antigo/novo.
- Evidence: sequência de POST/PATCH/DELETE de message do Feishu, payload de Card JSON 2.0, segmentação por message id e eventos do task stream.
- Boundary: o Bot usa sempre `bot-channel-continuous`; não se estende à semântica de recuperação de sessão de `desktop-continuous` no desktop ou `web-remote-replayable` no celular.

## BOT-E2E-DT-01 criação automática de task excluída (ZCT-2096089929570893824)

- Status: pending; caso `packages/desktop/test/e2e/bots/manual-review/pending/bot-deleted-task-recovery.test.ts`.
- Setup: Bot do Feishu vinculado apontando para a task antiga no tombstone de exclusão, preservando o estado de interação antigo; o mock do provider registra as requisições de notificação.
- Action: uma mensagem comum entra pelo callback do provider e, em seguida, o mesmo message id é reenviado.
- Assert: a task antiga não é restaurada; apenas uma task é criada e vinculada no mesmo workspace; a interação antiga é limpa; um único aviso explica a exclusão, a criação e a não herança de contexto; a mensagem original é despachada uma única vez; o broadcast de criação do Desktop aponta para a nova task; a assinatura continua sendo bot-channel-continuous.
- Fixture: metadados sintéticos locais do caso, com estado de exclusão e HTTP do provider fornecidos por fixtures determinísticos; sem acessar o bot do usuário.
- Unit boundary: identidade local/remota, não excluída mas invisível na lista (incluindo arquivada/pinada), falha de leitura de índice, falha de criação, falha de notificação e zh/en. Apenas o comportamento de arquivamento permanece como está.

### BOT-E2E-DF-01 falha e recuperação de entrega de reply no Feishu

- Status: pending. Spec: `packages/desktop/test/e2e/bots/manual-review/pending/feishu-delivery-error.test.ts`.
- Setup: bound private Feishu bot; synthetic HTTP business failure with code/msg/log_id.
- Action: private command reply fails, then a subsequent reply succeeds; group input is rejected.
- Assert: status exposes deliveryError without misreporting a WebSocket failure; error clears after successful delivery; private outbound uses open_id; group creates no task.
- Evidence: service/provider HTTP and status projection; UI rendering is separately unit-tested. No claim of live Feishu tenant reproduction, mobile device validation, or DOM end-to-end coverage.

Verificação de DF-01 (2026-09-07): o WDIO de Desktop no macOS passou (`desktop-e2e-20260907040958265-p60496-c535b8967f7e59a1`). Falhas de negócio HTTP 200/400, log ID de body/header, rejeição de atualização, status do circuito de streaming e renderização de erro localizada são cobertos por 124 testes unitários passando. Typecheck, typecheck de Desktop E2E e lint passaram (43 warnings, 0 errors). O caso pendente não é promovido. Feishu real, Windows/Linux, dispositivos móveis e interação de DOM com falha de entrega permanecem não verificados; a regressão de DOM de erro de conexão existente CF-01 passou no WDIO de Desktop no macOS.

## BOT-E2E-RW-02: identidade R3 stable / legacy do Bot

- accepted: a Source já passou pelo handshake e a sessão remota da janela atual está online, e o snapshot de fallback ainda é legacy; os pontos de entrada de modelo/tarefa são requisitados separadamente com o Bot context stable e o legacy.
- Asserção: os dois pontos de entrada são normalizados para o mesmo stable scope; sem reportar desconexão indevidamente, sem chamar task local e sem criar Host/Agent extra; a identidade antiga apenas autorizada continua limitada à mesma Source mesmo depois do upgrade.
- Contraste: mesmo path com Source diferente, religação de linha antiga, preferred Profile diferente da linha online, troca por desconexão/reconexão, lookup concorrente de task/model, port tardio e dispose.
- A evidência principal é a sonda de encadeamento dos módulos reais e o E2E sintético do Bot service; não se afirma que a entrega real no Feishu/Telegram foi verificada.

## Colaboração em grupo do Feishu (aceito, automação pendente)

- BOT-E2E-GR-01: dois grupos habilitados e a conversa privada mantêm task/configuração separadas; comandos de membros não podem trocar de task nem aprovar. Prompts de grupo carregam a origem confiável até a admissão canônica; sem sendPrompt legado.
- BOT-E2E-GR-02: entradas de owner/membro entram na fila durante a execução; o cancelamento afeta apenas o item da CLI; a troca para uma task ocupada reporta motivos de running/queue/interaction. Após o stop no Desktop, registros antigos de aprovação de Bot não bloqueiam um novo rascunho. Desktop e mobile mostram origem/anexos a partir das mesmas linhas canônicas e da mesma fila.
- BOT-E2E-GR-03: resumos finais são persistidos por segmento de entrega; resultados desconhecidos não são reproduzidos; grupos desativados/trocados rejeitam o reenvio de resultado salvo. Nenhuma saída de ferramenta ou de streaming entra no grupo.
- BOT-E2E-GR-04: a barra de ações de reply concluída mostra recuperação compacta apenas para as suas próprias entregas não resolvidas; clicar abre as ações sem repetir o corpo do resultado e resolver oculta o ícone; sem banner persistente de sync de grupo/workspace compartilhado. O retry de resultado salvo nunca reenvia um prompt. Os rótulos de origem suportam zh-CN/en-US e layouts estreitos.
- BOT-E2E-GR-05: a admissão de fila confirmada pela CLI mostra OneSecond, o start a substitui por OnIt, a conclusão/erro a substitui por CheckMark/CrossMark, e o cancelamento/stop a remove. Admissão tardia não pode sobrescrever o estado terminal; as reações dos demais membros permanecem. Cards de fila têm uma única linha localizada de espera/cancelamento. As asserções de payload do provider e de transição de serviço e a evidência visual real do Feishu devem ser reportadas separadamente.

Correção do queue card em GR-05: persistir o message ID do card e acompanhar a
entrada pelos estados running e terminal no mesmo card, removendo os controles de
cancelamento depois que a admissão de fila terminar. Verificar a promoção normal da
fila até a conclusão, a criação tardia do card após a conclusão, eventos duplicados/tardios,
o reuso do destino persistido e o no-op de grupo revogado. O aceite real precisa deixar a
segunda entrada executar normalmente; cancelar apenas a segunda entrada não cobre esta
regressão.

Estes casos implementam o contrato aceito de `bots-feishu-group-collaboration.md`. HTTP de provider sintético e eventos de task controlados são permitidos como evidência determinística de integração de serviço. A admissão pela CLI real e as asserções de DOM do renderer precisam ser reportadas separadamente; métodos de task com mock não são evidência do comportamento do CommandInbox. Permissões de tenant reais do Feishu, menções, referências de anexo, remoção e restrições de mensagem exigem um grupo de teste real.

Revisão de exibição de membro de grupo: GR-02/04 também verifica o nome de quem enviou
da fila e o identificador completo exibido ao clicar. Os testes de provider cobrem
diretórios paginados e os domínios Feishu/Lark; os testes de UI cobrem sobreposições de
nome histórico e isolamento de grupo. Permissão de tenant real e a renderização real do
nome de membro exigem evidência separada.

### BOT-UI-TP-PREPARATION: bubble de mensagem em estado de preparação

- Setup: componente real de estado de preparação e o bubble formal compartilhado, incluindo corpo comum, texto muito longo, corpo em branco, aguardando parada e falha.
- Action: alternar zh/en e tema claro/escuro e larguras desktop/mobile; mudar a entrada de preparação para falha; publicar primeiro a mensagem formal e depois limpar o estado de preparação.
- Assert: a mensagem de preparação pertence ao ConversationTurnGroup; a linha de origem mostra canal, nome e loading, e o tooltip de hover/focus mostra o estado de preparação, com apenas o corpo dentro do bubble; reutiliza o colapso/expansão do corpo formal, sem gerar bubble vazio nem overflow horizontal; a linha temporária de falha é removida por inteiro, sem exibir erro, retry, origem órfã ou turno em branco; quando a mensagem formal com o mesmo ID chega, o estado de preparação some e as outras entradas são preservadas.
- Status: candidato de componente no navegador; não representa E2E de Desktop real, de replayable do celular ou da plataforma Feishu.

### BOT-E2E-PS-01 retorno contínuo entre entradas na conversa privada

- Setup: HTTP de provider de Feishu, Telegram e WeChat isolados; vínculo de task persistente e assinatura de serviço via bot-channel-continuous.
- Action: a mesma task recebe sucessivamente turnos de IM, desktop e mobile, roda de novo após a conclusão e, após desativação, recebe saída tardia injetada.
- Assert: uma resposta por turno, o card do Feishu não sobrescreve o turno anterior, a assinatura é mantida após o estado terminal e não há saída após a desativação.
- Evidence: casos de runner do Desktop do serviço controlado até o HTTP do provider; inputOrigin sintético não vale como evidência de entrada real de celular/CLI.
- Status: pending, `bots/manual-review/pending/bot-private-task-sync.test.ts`.

### BOT-E2E-MN-01 reply de menção em canal nativo

- Status: formal; `bots/feishu-channel-mention.test.ts`, o usuário confirmou a promoção em 2026-10-08.
- Setup: grupo do Feishu/Lark habilitado; nó de alvo nativo determinístico e admissão de task.
- Action: citar explicitamente o refId dessa entrada em um reply adicional, repetir o mesmo toolCallId e depois solicitar um ref desconhecido.
- Assert: no mesmo grupo/tópico, quote nativo + at no corpo; recibo estável, chamadas repetidas não aumentam o HTTP; alvo desconhecido não gera envio.
- Evidence: service → entrega durável → HTTP do provider; não representa o modelo escolhendo a ferramenta por conta própria nem notificação de cliente real do Feishu.

BOT-UI-MN: bubble formal real, bubble de preparação e componente de fila mostram o chip de canal em 390/1200px e nos temas claro/escuro;
texto @ comum não tem nó de canal, sem overflow horizontal e sem exibir o ID da plataforma. Teste de componente no navegador não equivale a validação em aparelho real com replayable do celular.

## Complemento de aceite da branch (2026-09-23, aceito)

Escopo: grupo, tópico, materiais, retorno, UI de configurações e ferramentas de canal da branch de colaboração em grupo do Feishu, em relação à staging.
O usuário confirmou a implementação da cobertura de toda a branch; o recibo de sucesso repetido é mantido como está, sem adicionar asserções de deduplicação.
Dono do estado: o CLI CommandInbox cuida da admissão/execução, o Bot Host cuida do vínculo, dos materiais e da delivery, e a UI apenas projeta; nenhuma fila adicional é criada.

| Case | Setup → Action → Assert | Evidência e status |
| --- | --- | --- |
| BOT-E2E-TP-04 | Execução real de CLI em tópico → Bot recebe nova mensagem → para automaticamente o run antigo, o estado terminal autoritativo retoma, zero enfileiramento, saída antiga não se passa por turno novo | Host/CLI/HTTP do modelo, pending |
| BOT-E2E-TP-05 | Índice de arquivos históricos recebido → ReadSessionContext real → Host verifica e baixa, a CLI recebe o arquivo correto; outras tasks/autorizações inválidas não baixam | Host/CLI/HTTP de plataforma simulada, pending |
| BOT-E2E-FN-01 | Estado terminal com corpo completo após saída de ferramenta → conciliação pelo adapter → o resultado completo é devolvido apenas uma vez; a conversa comum continua normal | adapter/stream real/saída de plataforma, pending |
| BOT-E2E-MN-02 | CLI real dispara ReplyToChannel → menção nativa bem-sucedida → a continuação pelo cliente busca o novo alvo por nome, sem botGroupSource e sem diálogo padrão de aprovação | Host/CLI/HTTP de plataforma simulada, pending |
| BOT-E2E-GR-02 | Entrada de grupo recebida durante a execução → cancelamento e promoção normal executados separadamente → FIFO, origem original, estado terminal no mesmo card e entrada sem duplicidade | Ajuste de runtime case existente |
| BOT-E2E-GR-UI-01 | Dois bots/dois grupos → toggle de configuração, falha e recuperação → isolamento, persistência, sem reenvio | Novo candidato de UI |
| BOT-E2E-PS-01 | Task de conversa privada vinculada → turnos contínuos de IM/desktop/mobile e reinício → um retorno por turno, falha com retry explícito | Extende candidato existente, origin simulado não conta como UI de celular |
| BOT-E2E-MN-01/TP-03 | Grupo/tópico e múltiplas identidades → reply e ações de administrador → quote, @ condicional, lembrete ao administrador e idempotência | Estende candidatos de serviço existentes |

Podas: as diferenças de plataforma Feishu/Lark são cobertas pelos candidatos de serviço nas duas plataformas, e o caminho principal real de CLI prioriza o Feishu; não se cruza mecanicamente todas as plataformas com todos os temas.
Tema/largura são verificados por componente no navegador; replayable em celular real, identidade SSH e notificações de tenant de plataforma são registrados separadamente e não podem ser substituídos por tela estreita ou stub.
Os casos novos da fase inicial de validação permanecem em manual-review/pending; após a confirmação do usuário em 2026-09-23, as quatro specs novas abaixo foram promovidas e ainda não entraram no Docker/CI.
Concluir primeiro o fixture local do caso e o manifesto canônico, depois executar a reprodução controlada; todas as requisições de plataforma ficam isoladas, sem usar o Bot do usuário.

Novos casos formais desta rodada (confirmação do usuário em 2026-09-23):

- `conversation-session/conversation-session-bot-channel-worker.test.ts`: MN-02 + FN-01, menção nativa pela CLI real, continuação pelo cliente sem origem e preenchimento do estado terminal com text delta perdido.
- `conversation-session/conversation-session-bot-topic-worker.test.ts`: TP-04 + TP-05, parada automática e retomada durante a execução real, resultado de ferramenta e verificação de bytes de anexos gerenciados.
- `conversation-session/conversation-session-bot-continuous-worker.test.ts`: GR-02 promoção normal + assinatura contínua PS-01 de IM/desktop.
- `bots/feishu-bound-groups-ui.test.ts`: GR-UI-01 com RPC real do Desktop, persistência e isolamento de grupo/bot.

Todos os caminhos acima são relativos a `packages/desktop/test/e2e/`. Os novos casos formais de worker usam CLI real e serviços de Host de produção; o repo de Bot e o HTTP de plataforma são fixtures isolados, e não podem ser chamados de validação de UI Electron ou de tenant real.
O reinício, o retry de falha e a troca de vínculo do PS-01 continuam cobertos por `botsService.privateSync.test.ts`; origem mobile simulada não é elevada a prova de celular real.
As falhas/concorrências/callbacks tardios e o bot desativado do GR-UI-01 continuam cobertos por `botBoundGroupsInteraction.test.ts`; o caso de Desktop desta rodada só prova o caminho real de sucesso ao salvar.
MN-01 ganha continuação de desktop na mesma task e rejeição entre tasks; TP-03 é estendido para quatro cenários de Feishu/Lark × @ condicional, cobrindo referência à mensagem atual, lembrete de aprovação ao administrador e lembrete condicional em perguntas comuns; a herança de modelo continua verificada por `botsService.groups.test.ts`.

### BOT-E2E-TP-06: entrada de tópico de outro bot

- Setup: uma pessoa real já entrou no tópico e iniciou uma task em streaming controlada.
- Action: as mensagens de tópico de outro bot são resolvidas pelo Provider real e, em seguida, a própria mensagem do bot atual é enviada.
- Assert: a mensagem de outro bot para a execução antiga e então é submetida à mesma task, com resposta; a mensagem do próprio bot não gera entrada.
- Evidence: reutiliza o Host/CLI reais, o modelo controlado e o substituto de plataforma do TP-04; push nativo e permissões de tenant reais aguardam validação manual.
- Status: aceito; implementação e evidências de regressão estão na matriz de cobertura.

Regressão de eventos recebidos por bot: o evento real com sender_type=bot é mapeado para app interno; @ nativo em grupo comum habilitado
pode ser submetido, não habilitado/sem @ não é submetido; a continuação de tópico mantém validação de active, deduplicação, eco do próprio bot e isolamento de comandos de controle.
TP-04 usa eventos de bot atravessando Provider → Host → CLI → reply da plataforma; a interface histórica continua usando app.