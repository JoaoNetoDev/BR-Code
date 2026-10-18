# Continuação automática de cinco minutos do AskUserQuestion

## Objetivo

Um `AskUserQuestion` comum não deve bloquear indefinidamente uma task em execução. Cada pergunta
comum que chega ao início da fila de interação recebe uma janela de cinco minutos gerenciada pelo
CLI/runtime; se o usuário não responder, o runtime conclui com sucesso usando respostas vazias,
deixando o modelo seguir com o melhor julgamento. A barra lateral apenas projeta esse estado
autoritativo e não decide timeout por conta própria.

Solicitações comuns de permissão e a aprovação de plano do `ExitPlanMode` não participam da
conclusão automática.

O usuário pode desativar「提问自动继续」na página de configurações. A configuração vem habilitada
por padrão para preservar a compatibilidade de atualização; quando desativada, todos os
`AskUserQuestion` comuns atuais e as perguntas registradas durante o período desativado esperam
permanentemente pela resposta do usuário. Reativar afeta apenas as perguntas novas registradas
depois da reativação e não pode restaurar deadlines de perguntas antigas.

## Sequência de produto

```text
0:00                    1:00                              5:00
 │──── 静默等待 60s ────│──── 可见进度胶囊 240s ─────────│
 │   静态满底标签        │   填充右边界持续向左收缩         │
 │                      │                                  └─ answers: {}，继续
 └────── 用户首次有效操作：永久暂停本次自动结束 ──────────────┘
```

- `0..60s`: a barra lateral exibe o rótulo estático com preenchimento total「等待确认」, sem
  expressar tempo restante.
- `60..300s`: o tamanho da cápsula e a posição do texto permanecem iguais; o preenchimento azul de
  destaque encolhe linearmente de 100% a 0%, com a borda esquerda fixa e a borda direita recuando
  para a esquerda.
- `240..300s`: o canto superior direito do painel de perguntas exibe adicionalmente a contagem
  discreta em segundos `59秒..1秒` (em inglês `59s..1s`); `60` e `0` não são exibidos, e clicar nos
  segundos apenas pausa a contagem.
- `>=300s`: o runtime envia `{ answers: {} }`; o resultado da ferramenta diz explicitamente ao
  modelo que o usuário não respondeu e que ele deve seguir com o melhor julgamento.
- Após a primeira ação efetiva do usuário em qualquer estágio, o estado se torna permanentemente
  `snoozed`, e a cápsula volta ao preenchimento total estático. Esta interação não termina mais de
  forma automática.

## Configuração do usuário

- O campo de AppSettings é `askUserQuestionAutoResolutionEnabled`, com padrão `true`; quando um
  arquivo de configurações antigo não tem o campo, ele é interpretado como habilitado, sem
  migração.
- O grupo「交互」da página de configurações usa a chave「提问自动继续」。A ação de desativar primeiro
  persiste o AppSettings e então notifica todas as janelas para levar a preferência ao host
  local/remote ao qual cada uma está conectada.
- A desativação precisa ter efeito imediato sobre o Agent principal já em execução, tarefas em
  segundo plano, bots e subagents; não se pode esperar a próxima criação de session nem apenas
  esconder a animação da UI.
- Ao desativar, os `hiddenGrace` / `visibleCountdown` existentes passam para o `snoozed`
  persistido; perguntas antigas que ainda não chegaram ao início da fila são registradas como não
  cronometráveis e, mesmo depois de uma reativação, não recebem deadline.
- Reativar muda apenas a elegibilidade das perguntas novas; perguntas já pausadas manualmente pelo
  usuário, pausadas pela configuração ou registradas durante o período desativado continuam
  esperando permanentemente.
- Alternâncias rápidas em sequência são aplicadas serialmente pela ordem real de envio ao CLI por
  host, e uma requisição antiga não pode chegar depois e sobrescrever o valor novo.

## Modelo de estado

`PendingInteraction.autoResolution` é um estado opcional; a ausência do campo significa que não há
cronometragem.

```text
                      visibleAt
registered ──> hiddenGrace ─────────> visibleCountdown
                    │                         │
                    │ meaningful input /      │ meaningful input /
                    │ setting disabled        │ setting disabled
                    └──────────────┬──────────┘
                                   v
                                snoozed

visibleCountdown ── deadlineAt ──> resolved(answers: {})
任意 pending ── normal answer / stop / turn close ──> resolved / removed
setting disabled ──> 当前与关闭期间注册的 Ask 永久无计时资格
setting re-enabled ──> 仅之后新注册的 Ask 可进入 hiddenGrace
```

- `hiddenGrace`: `startedAt`, `visibleAt`, `deadlineAt`.
- `visibleCountdown`: reutiliza os mesmos três tempos absolutos; a mudança de estágio é um evento
  recuperável e não um estado de negócio inferido localmente pela UI.
- `snoozed`: `startedAt`, `snoozedAt`; não contém mais deadline.
- As constantes de produção são fixas em `visibleAt = startedAt + 60_000` e
  `deadlineAt = startedAt + 300_000`. Os testes encurtam a espera por injeção de clock/scheduler e
  não podem alterar os valores de produto.
- O Registry registra a elegibilidade de cronometragem de cada pergunta no momento do registro. A
  desativação global da configuração revoga a elegibilidade de todas as perguntas atuais; a
  reativação não pode preencher de volta registrations já existentes.

Somente um `AskUserQuestion` comum no início da fila recebe `startedAt`. As interações pending
seguintes só começam seus próprios cinco minutos completos depois que a anterior sai da fila,
evitando que o tempo de fila consuma a janela de resposta.

## Cadeia autoritativa e fronteira de restauração

```text
Settings Switch ──> AppSettings ──> cross-window broadcast
                                           │
                                           v
                                  each connected host service
                                           │ strict workspace protocol
                                           v
AskUserQuestion tool ───────────> CLI interaction coordinator
        │ requestUserInput                  │ timer / setting gate / snooze / resolve
        │                                   ├──────────────> tool result
        │                                   │
        │                                   └─ durable autoResolution event
        │                                                   │
        │                                                   v
        └──────────────────────────────────────────> product projection
                                                            │
                                                            ├─ task snapshot
                                                            └─ sessions-index summary
                                                                     │
                                                                     v
                         desktop-continuous live / web-remote-replayable snapshot+gap
                                                                     │
                                                                     v
                                              UI pending dialog + sidebar badge
```

- deadline, resposta do usuário e comando de pausa são atendidos primeiro a chegar, primeiro a ser
  processado, conforme a ordem real da fila de comandos do CLI.
- A corrida entre desativação da configuração e o deadline também é resolvida pela ordem real de
  processamento do CLI: se a desativação for aplicada primeiro, a pending é mantida e o `snoozed`
  é persistido; se o deadline já tiver concluído primeiro, a sincronização de configuração tardia
  não pode produzir um segundo tool result.
- Resposta normal, stop, término de turn e remoção da interação precisam limpar o timer.
- Após reconexão de CLI/UI ou restauração do processo, usa-se a restauração pelos tempos absolutos
  persistidos; o estágio mais recente é gravado com sobrescrita pela session entry
  `runtime/user_input_auto_resolution` por interactionId e, se na restauração o deadline já tiver
  passado, conclui-se imediatamente com respostas vazias.
- Se na restauração a configuração global estiver desativada, qualquer deadline active persistido
  precisa virar `snoozed` primeiro, sem auto-conclusão breve na janela de restauração.
- `snoozeInteractionAutoResolution { interactionId }` é idempotente: pausa repetida, interação já
  concluída ou sem suporte a cronometragem retornam noop.
- `workspace/updateInteractionPreferences` é o método de plano de controle estrito do host para o CLI
  do workspace correspondente. Os parâmetros carregam o workspace ref completo; o CLI só dá ACK
  depois de persistir todas as interações afetadas.
- `userInput.autoResolutionUpdated` é um evento recuperável, que registra o início, a entrada na
  fase visível e a pausa; o snapshot é o fato atual e o evento serve para a recuperação de incremento
  continuous e de gap replayable.
- `SessionSummary.pendingInteraction` carrega apenas o `kind` leve, o `toolName` e o estado de
  auto-resolution de que a barra lateral precisa, para que uma task em segundo plano possa
  distinguir permissão comum, `AskUserQuestion` e `ExitPlanMode` sem abrir os detalhes.

### Multiplataforma e isolamento de identidade

- O renderer do desktop continua usando a cadeia principal `desktop-continuous` e não concatena
  mensagens de runtime replayable do celular.
- O `/remote` do celular continua se anexando ao host do desktop já existente; não inicia outro
  runtime de Agent e não baixa o estado de timer para o relay/main.
- O celular usa a recuperação snapshot/gap de `web-remote-replayable` para o mesmo deadline
  autoritativo ou estado `snoozed` e não pode reiniciar os cinco minutos por conta própria. Um
  deadline desativado pela configuração durante a desconexão do celular continua em espera
  permanente após a reconexão.
- O roteamento de owner/lease, origin, `workspaceIdentity`, `workspacePath` e `remoteSessionId` da
  interaction permanece inalterado. A chave de identidade continua sendo
  `workspaceIdentity?.trim() || workspacePath`.
- background task, bot, subagent e task comum passam pelo mesmo coordinator; a origin de um
  subagent não se perde por causa da conclusão automática.
- O bot local reutiliza o Agent service do host da janela; o bot remoto mantém uma porta RPC de
  remote runtime desktop-attached separada. A sincronização de configurações precisa ser enviada
  simultaneamente para esses runtimes de bot **já em cache**, e é proibido criar um novo Host/Agent
  remoto apenas para sincronizar a preferência; um novo bot runtime aplica a preferência mais recente
  antes de expor o service de task/session.
- A sincronização de configurações não bifurca por `clientMode`; ela altera o mesmo registry
  autoritativo do shared-host runtime. Os fatos das interactions alteradas continuam sendo entregues
  separadamente pelo `continuous` do desktop e pelo `replayable` do celular.

## Ações efetivas do usuário

As ações abaixo enviam um comando de pausa:

- o mouse entra pela primeira vez em todo o painel de `AskUserQuestion` comum;
- clicar em uma opção, ou selecionar uma opção pelo teclado;
- digitar ou colar em uma entrada personalizada;
- navegar para a pergunta anterior/seguinte;
- o bot registra pela primeira vez uma resposta válida de pergunta dividida;
- clicar nos segundos do último minuto no canto superior direito do painel de perguntas;
- clicar na cápsula「停止计时」do AskUserQuestion na barra lateral.

Abrir a task, o focus automático programático, rolar ou a janela voltar a ficar visível não
constituem ação efetiva. Passar o mouse sobre a cápsula de AskUserQuestion na barra lateral apenas
substitui「等待确认」por「停止计时」, sem enviar comando; somente o clique na cápsula envia a pausa.
O mouse entrando no painel de perguntas é uma intenção explícita de leitura/resposta e pausa
imediatamente. A UI envia apenas a primeira pausa; o runtime continua responsável pela idempotência,
evitando efeitos colaterais duplicados por reconexão ou corrida multiplataforma.

## Aviso de último minuto no painel de perguntas

- Somente um `AskUserQuestion` comum que ainda tenha `deadlineAt` exibe os segundos quando o tempo
  restante é estritamente menor que 60 segundos; `snoozed`, permissões comuns e `ExitPlanMode` não
  exibem.
- Os segundos são derivados do `deadlineAt` absoluto: primeiro um timeout único aguarda a entrada no
  último minuto e depois apenas o painel de perguntas atualmente aberto é calibrado por segundo; as
  linhas de task da barra lateral não recebem um novo JS interval.
- Clicar nos segundos envia apenas o comando de pausa, sem selecionar opção e sem enviar resposta
  vazia; depois que a projeção autoritativa entra em `snoozed` os segundos desaparecem e a barra
  lateral volta ao「等待确认」azul estático.
- O celular não tem hover e continua pausando por clique em opção, digitação, navegação ou clique
  nos segundos; tanto o desktop continuous quanto o web remote replayable restauram o mesmo deadline
  absoluto.

## Fronteira de progresso local da pergunta

O CLI/runtime gerencia autoritativamente o ciclo de vida da interaction e o estado de conclusão
automática; a pergunta atual, o foco e o rascunho de respostas não submetido do renderer já
montado são estado local de formulário. Os dois usam `interactionId/requestId` como fronteira de
identidade e não podem decidir se há uma pergunta nova pela mudança ou não da referência do objeto
snapshot.

```text
同一 requestId
hiddenGrace ── 首次有效操作 ──> snoozed
     │                              │
     └──── CLI 投影更新 metadata ───┘
                                    │
                                    └─ UI 保留 questionIndex / drafts / focus

新 requestId ──> 新建问答实例 ──> 按 currentQuestionIndex / answerDrafts 初始化
```

- Uma atualização de snapshot de `autoResolution`, owner/lease, origin ou de qualquer outro ciclo de
  vida que não seja o da pergunta, para o mesmo `requestId`, não pode resetar a tab atual, as
  respostas selecionadas, a entrada personalizada ou a marca de primeira ação.
- Durante uma troca de task, se o `sessionId` já mudou mas o snapshot da task anterior ainda não foi
 geracional trocado, esse snapshot antigo não pode renderizar as perguntas da task atual nem
  participar da limpeza dos rascunhos da task atual; apenas a projeção com
  `snapshot.sessionId === sessionId` pode valer como pending interaction autoritativa.
- Um novo `requestId` precisa criar uma nova instância local de pergunta e não pode herdar o rascunho
  da rodada anterior.
- Na primeira abertura da página, na reconexão ou na remontagem de um snapshot replayable, a
  inicialização continua usando o `currentQuestionIndex` / `answerDrafts` trazidos pela requisição;
  atualizações comuns de metadata após a montagem não sobrescrevem o progresso local de edição.
- Desktop e celular mantêm cada um seus rascunhos não submetidos renderer-local por
  `workspaceKey + taskId + requestId`; quando a troca de task desmonta o componente de pergunta, o
  retorno à mesma task precisa restaurar a pergunta atual e as respostas já preenchidas. O
  `resolveInteraction` final continua seguindo o primeiro a chegar primeiro a ser processado do
  runtime; depois que a requisição conclui com sucesso, o rascunho local correspondente é limpo. Se
  no futuro for exigida sincronização em tempo real de rascunhos de perguntas divididas entre
  plataformas, será preciso adicionar um estado de protocolo explícito, sem se apoiar em
  reconstrução implícita de objetos para sincronizar.

## Semântica de ferramenta e histórico

- A saída de sucesso de `AskUserQuestion` permite que `answers` seja um objeto vazio.
- Resposta vazia não é recusa do usuário, não seleciona um item padrão e não gera permission deny.
- O tool result visível ao modelo usa a semântica explícita de que o usuário não respondeu e que é
  preciso seguir com o melhor julgamento.
- O histórico na UI exibe「未回答，已自动继续」, sem gerar uma user message falsa.
- Resposta normal, recusa ativa, permissões comuns e `ExitPlanMode` mantêm a semântica existente.

## Exibição na barra lateral

- Permissões comuns, `ExitPlanMode` e outras interações bloqueantes não-Ask: rótulo estático verde
  「等待确认」, sem animação e sem ação de「停止计时」.
- Pergunta em `hiddenGrace` / `snoozed`: surface azul-clara independente com texto azul-escuro e
  「等待确认」 estático com preenchimento total. Em `hiddenGrace` ainda há deadline, e o hover exibe
  「停止计时」em cinza permitindo clicar para pausar; em `snoozed` o azul「等待确认」é mantido, mas
  não é mais clicável.
- Pergunta em `visibleCountdown`: track azul fixo + fill azul interno; o texto padrão é fixo e
  centralizado como「等待确认」e, em hover/focus-visible, o fill é ocultado e o texto é trocado no
  lugar por「停止计时」em cinza, sem alterar a largura da cápsula; o clique envia o comando de pausa
  idempotente já existente.
- Não se reaproveita o `brand` preto/branco do tema Zai nem se toma emprestado `success` para
  expressar o estado de espera; Ask e confirmação comum usam tokens de semântica de interaction
  estáveis distintas.
- task row comum, timeline row e grouped task row reutilizam o mesmo componente de badge.
- O progresso é restaurado com tempo absoluto e `transform: scaleX(...)`/animation em CSS, sem criar
  um JS interval de alta frequência por task.
- Sob `prefers-reduced-motion` a animação contínua é desativada e a proporção é atualizada por tempo
  absoluto apenas nas mudanças de estado de protocolo, focus ou visibility.
- Desktop e celular, larguras, temas claro e escuro e os idiomas chinês e inglês usam os mesmos
  tokens semânticos e as mesmas chaves de i18n.

## Aceitação e podas

Obrigatório cobrir:

- os estágios 0s, 59s, 60s, 180s, o último minuto `59秒..1秒` e 300s com fake clock, e a conclusão
  com resposta vazia;
- pausa durante o período silencioso/visível, pausa repetida noop e limpeza por resposta normal,
  stop e turn close;
- mouseenter do painel de perguntas, clique nos segundos do canto superior direito, focus
  programático que não pausa e hover na barra lateral que não pausa;
- múltiplas pendentes obtendo em série a janela completa;
- o resumo de segundo plano do sessions-index e a recuperação de desktop continuous / web replayable;
- os três tipos de row da barra lateral, os dois temas, os idiomas chinês e inglês e os layouts
  desktop/celular;
- padrão habilitado, registro antes da desativação, desativação durante a cronometragem, registro
  durante o período desativado e reativação sem retroação;
- Q09–Q14, Q23–Q25 conversation cases.

Podas explícitas:

- Permissões e `ExitPlanMode` não fazem permutação completa com a contagem regressiva, porque não há
  `autoResolution` no protocolo.
- Não se faz cruzamento de cronometragem por número concreto de opções, de perguntas e por método de
  entrada; a cobertura é feita pela fronteira da primeira ação efetiva.
- Não se exige espera real de cinco minutos; clock/scheduler são injetados na automação e as
  constantes de produção têm asserções estáticas próprias.
- relay/main não guarda timer de negócio; a restauração valida apenas o snapshot/gap do runtime do
  shared-host.
- Agent principal, tarefas em segundo plano, bots e subagents não duplicam E2E completo de GUI; o
  registry compartilhado é coberto por fake-clock/testes de protocolo, a GUI do desktop mantém apenas
  um caminho representativo e o mobile replayable é coberto por testes de integração de restauração.

O candidato de GUI está em
`packages/desktop/test/e2e/conversation-session/manual-review/pending/conversation-session-ask-user-question-auto-resolution-setting.test.ts`.
Ele só pode usar `ZCODE_E2E_ASK_USER_QUESTION_CLOCK_SCALE=20` sob `ZCODE_ENV=test` para escalar as
janelas de 60 segundos/300 segundos do runtime; a produção ignora essa injeção. O candidato não é
promovido a E2E formal antes da confirmação manual.