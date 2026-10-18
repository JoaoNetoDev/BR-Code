# Comportamento de interação do ZCode

## Contexto

Quando o turno atual do ZCode ainda está em execução, o usuário continua enviando conteúdo e há duas semânticas de produto:

- Fila: tratar as entradas seguintes como mensagens pendentes, enviadas automaticamente após o fim do turno anterior.
- Guia: entregar ao turn steering do ZCode CLI, injetado no turno atual no próximo limite válido de model-step.

`AppSettings.zcodeInteractionBehavior` controla essa preferência, com valor padrão `queue`. O Composer
não expõe mais a alternância de "modo de acréscimo" por sessão; `config.followupMode` na projeção da sessão é apenas o resultado atual da sincronização dessa preferência de app por parte do CLI/runtime. Após o usuário alternar na página de configurações, a session v4 já aberta é sincronizada ao CLI pelo comando
`setFollowupMode`; sessões novas ou pré-aquecidas herdam a preferência atual do app por
`createSession.config.followupMode`.

## Comportamento

`queue` é o comportamento padrão. No desktop e no mobile, as entradas busy/running já submetidas passam pela admission serial do `CommandInbox` do CLI/runtime; renderer, host, relay e desktop main não mantêm uma segunda fila autoritativa de conversation. O desktop recebe os fatos diretamente por `desktop-continuous`, e o controle remoto Web mobile recupera o mesmo conjunto de fatos da CLI por snapshot/gap `web-remote-replayable`; os dois delivery profiles não alteram as regras de consumo.

O limite para o consumo da fila é a session pronta, e não a conclusão de uma barra qualquer da timeline. O `started` / `retrying` de `context_compaction` e o `started` de `goal_verification` indicam que a session atual ainda tem atividade de manutenção ou de arbitragem em execução, e a queue comum não pode drenar automaticamente nesses estados. Depois que um `/compact` manual for concluído, se a session já estiver pronta, o consumo da fila pode continuar; o `completed` de compact auto/pre-request indica apenas que a compressão prévia terminou, e o prompt original ainda pode continuar em execução, portanto não pode ser tratado como limite de fila pronta.

No Goal mode ainda é preciso que "o goal inteiro tenha sido atingido": `goal_verification completed` é apenas o estado terminal de uma tentativa do verifier. Quando o verifier retorna explicitamente `passed: false`, o fluxo continua para a próxima iteração de goal continuation; quando o próprio verifier tem erro de formato, exceção na requisição ou chama ferramenta de forma incorreta, adota-se fail-open, gravando `passed: true`, para que uma falha ocasional da cadeia de arbitragem não trave um goal já entregue. Depois de `passed: true` também é preciso esperar que o target da session seja atualizado para `status: "complete"` para consumir a queue comum.
Enquanto houver no task meta / projection algum target diferente de `complete`, as mensagens da fila continuam aguardando; target vazio significa que não há goal no momento e não é afetado por esse guard. Quando o usuário continua inserindo durante um goal não atingido, a entrada também deve entrar primeiro na queue comum, em vez de contornar o goal loop e enviar imediatamente. Esse guard cobre `sendText`, `/goal` enfileirado e `/compact` enfileirado, e preserva a admission FIFO original. Parar o verifier manualmente não é fail-open: ele encerra a verification como cancelled/failed, coloca o target como paused, e faz a queue ser mantida e por padrão não consumida automaticamente.

A ordem de consumo automático da queue comum é fixa:

```text
queue head
  -> autoDrain=true ?
  -> session ready ?
  -> target absent OR target.status=complete ?
       no  -> keep the whole FIFO unchanged
       yes -> promote exactly one head item by its original kind
```

O "enviar imediatamente" de um item da fila é o caminho explícito de preempção do usuário e continua usando reservation + Stop barrier; não faz parte do guard de consumo automático acima.

`guide` é uma capacidade de runtime independente de modelo/provider: ela não reescreve requisições in-flight já enviadas ao provider e só tenta turn steering quando a task está em streaming, sem anexos e sem requisição de stop. Uma queue comum existente já expressa a intenção do usuário para um futuro product turn e não bloqueia a entrada explícita de guide no turno ativo atual; os dois tipos de entrada seguem trilhas separadas por delivery, e a ordem relativa da queue comum permanece inalterada.

O guide pode ser submetido e ficar aguardando antes da ocorrência de um tool call; o runtime só consome no máximo um guide, e somente depois que todos os sibling tool results do model step atual foram submetidos, usando-o na próxima requisição ao provider do mesmo product turn. Não pode ser consumido quando uma tool paralela individual termina cedo, nem mais de um guide por vez.

Enquanto o guide aguarda um limite válido de model-step, ele continua sendo carregado pela persistência do CLI em `pendingInputs` / `TurnSteerQueued`,
mas o renderer não exibe `admittedDelivery=guide` como uma future queue comum. Ele deve exibir imediatamente a mensagem do usuário no fim do fluxo atual da conversa e mostrar "aguardando para guiar a task atual…" abaixo do balão. Após receber `TurnSteerDrained(delivery=guide)`,
o `UserInputRow(guided=true)` oficial assume a exibição com o mesmo `sourceCommandId` e a dica de espera desaparece; se o runtime rebaixar essa entrada para `admittedDelivery=queue`, a mensagem temporária no fluxo da conversa desaparece e o mesmo item autoritativo volta ao painel da fila comum.
O renderer faz apenas a roteação da projection e não mantém uma segunda fila de inputs aceitos.

Os balões das mensagens aguardando guia, as dicas de espera e os botões de ação devem compartilhar a coluna de conteúdo e as margens horizontais de 16px de cada lado do campo de entrada inferior,
mantendo o alinhamento com a borda direita tanto no desktop quanto na Web mobile. Essa lista temporária renderiza as linhas de mensagem diretamente, sem passar pelo contêiner comum de turno,
portanto a lista em si carrega as margens horizontais e não pode encostar na borda da coluna de conteúdo.

```text
TurnSteerQueued(admitted=guide)
  -> CLI queue fact 保留
  -> renderer pending guide（对话流 + 等待提示）
  -> TurnSteerDrained(guide) -> 正式 guided user row
  -> delivery fallback(queue) -> 普通 queue panel
```

No desktop, durante a execução da task, `Cmd+Enter` ou segurar `Cmd` e clicar no botão de envio (macOS), assim como
`Ctrl+Enter` ou segurar `Ctrl` e clicar no botão de envio (Windows/Linux),
aplicam a semântica de entrega oposta ao `followupMode` da sessão apenas para esta mensagem:

| `followupMode` | `Enter`       | `Cmd/Ctrl+Enter`                                                                      |
| -------------- | ------------- | ------------------------------------------------------------------------------------- |
| `queue`        | Fila comum      | Envio imediato: `sendText(requestedDelivery=startNow)` atômico preempta o turno atual, sem criar QueueItem |
| `guide`        | Guiar o turno atual | Fila comum                                                                              |

A combinação de teclas ou o clique com modificador sobrescreve somente esta entrada; não chama
`setFollowupMode` nem reescreve a configuração persistente. `Enter` comum, `Shift+Enter` e o clique comum no botão de envio continuam com o comportamento atual. No estado ocioso (inclusive um draft de nova task), `Cmd/Ctrl+Enter` envia normalmente como o Enter;
`Cmd/Ctrl+Shift+Enter` preserva a quebra de linha. A capacidade das combinações é desativada apenas no viewport de entrada móvel do controle remoto Web mobile;
o Electron desktop, mesmo com janela mais estreita que 768px ou com um dispositivo Windows reportando `hover: none` / `pointer: coarse`,
deve preservar o envio pela tecla modificadora principal da plataforma; não se pode substituir a fronteira de produto desktop / Web remote por uma media query genérica.

No desktop, quando o composer em execução já tem conteúdo enviável e o botão de envio está habilitado, pressionar a tecla modificadora principal da plataforma deve abrir automaticamente o
Tooltip do botão de envio, sem exigir hover. O título mostra o comportamento oposto para esta mensagem: com queue como padrão exibe "envio imediato",
com guide como padrão exibe "adicionar à fila"; a área de atalho mostra `⌘ + Enter` no macOS e `Ctrl + Enter` no Windows/Linux.
Solta da modificadora principal, perda de foco da janela, início do envio, entrada que se torna não enviável, mudança para idle/mobile ou desmontagem do componente fecham a dica automática. O Tooltip de hover comum continua exibindo o comportamento de envio original, e a dica de modificador não é gravada em configuração nem no protocolo.

```text
keydown(Cmd/Ctrl)
  -> running && canSend && desktop ?
  -> open tooltip(opposite action, Cmd/Ctrl + Enter)
keyup / blur / submit / !canSend
  -> close modifier tooltip
```

```text
running composer Cmd/Ctrl+Enter OR Cmd/Ctrl+click send
  -> queue mode: sendText(requestedDelivery=startNow)
  -> guide mode: sendText(requestedDelivery=queue)
  -> CLI CommandInbox 串行 admission
  -> 只改变这一条 input intent
```

O `startNow` no modo queue deve obter atomicamente dentro da CLI o foreground promotion lease, executar o Stop barrier,
aguardar o foreground antigo ficar totalmente idle e então iniciar diretamente o novo turno. Esse caminho não pode chamar a admission da queue comum, não pode criar nem
projetar temporariamente um QueueItem e não pode depender de o renderer observar a fila e então enviar um segundo promotion command. Depois que a CLI aceita
`sendText(startNow)`, o lado emissor limpa o Composer imediatamente; se o comando for rejeitado antes de ser aceito, o draft original e os anexos permanecem inalterados.
`sendQueuedNow` é usado apenas para o usuário promover explicitamente um QueueItem já existente e não responde mais pelo envio imediato de novas entradas.

```text
guide admitted
  -> wait for next tool result batch
  -> commit every sibling ToolCallResult
  -> drain exactly one guide inline
  -> persist guided user fact
  -> start the next provider request in the same product turn
```

Se o turno atual completar apenas com texto, parar ou for interrompido sem formar um lote de tool result utilizável,
o guide não consumido deve redirecionar no lugar o mesmo `ConversationInputIntent` para a queue comum; o texto original, os anexos, o clientId,
`sourceCommandId`, `queueItemId` e a admission FIFO permanecem iguais. Quando anexo/compact/verifier ocupado não satisfaz a eligibility, ou quando o runtime rejeita o steer, o mesmo fallback também vale e nada pode ser perdido silenciosamente.

A dimensão modelo/provider é podada por invariantes: todos os modelos já integrados reutilizam o mesmo message history e a mesma próxima requisição comum ao provider,
e não pode haver uma whitelist de guide por nome de modelo, nome de provider ou formato de protocolo upstream.

## Limites

Essa configuração muda apenas se, durante o busy, o turn steering é tentado primeiro; não muda a semântica de transporte realtime da task:

- O caminho principal do desktop continua sendo `desktop-continuous`.
- O controle remoto mobile continua sendo `web-remote-replayable`.
- relay e desktop main não possuem estado de negócio de session, stream, queue ou snapshot.
- O guard de produto guide/queue no CLI não se bifurca por delivery profile; o replayable cuida apenas da recuperação e não é dono da fila de negócio.