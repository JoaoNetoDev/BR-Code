# Subagent RespondToCoordinator

## Objetivo

Após um subagent comum receber do main, via `SendMessage`, uma mensagem de coordinator, ele pode
entregar a resposta ao runtime pai com `RespondToCoordinator`, continuando a tarefa original.

## Contrato de Produto

- `SendMessage` permanece exclusivo do main.
- `RespondToCoordinator` permanece exclusivo do child, e o input do provider tem apenas `summary` e `message`.
- child session, agent identity e parent route são vinculados pelo closure do runtime; o modelo não pode escolher nem sobrescrever o destino.
- A ferramenta só é registrada quando `taskType === "subagent_child"`, a coordinator port está configurada e não está desabilitada pelo `toolDisallowlist` global; as diretrizes de uso aparecem apenas junto da descrição real da ferramenta.
- Sucesso significa somente que o response command foi sincronizado na fila de comandos do runtime pai; não significa que o modelo pai já leu, aceitou ou respondeu.
- Quando o parent está active, o primeiro model step não lê comandos do runtime; somente quando o turno atual entra em um model step subsequente o active-loop lê uma vez, antes do compact e do preparo da requisição, um snapshot de comandos com `priority <= next`, mesclando os `task-notification` / `subagent-message` do snapshot com o resultado de ferramenta atual.
- O active-loop não varre a queue novamente antes do compact, da inicialização de MCP ou da requisição ao provider, nem consome continuamente comandos enfileirados durante o processamento do snapshot. Respostas perdidas neste snapshot ficam para o próximo model step; se o turno atual terminar, um model-only turn é iniciado serialmente pela outer runtime command queue.
- `prompt` comuns e target continuation não são consumidos pelo snapshot do active-loop e continuam na outer queue.
- O carrier visível ao provider do pai é um `<subagent-message>` user-like, com source persistido `subagent_message` e visibility `model-only`.
- O carrier sintético não aparece como mensagem de usuário de nível superior, não participa do título da sessão e não entra no `ReadSessionContext`. O espelho do ciclo de vida de ferramentas do child continua disponível para consumidores compatíveis e diagnóstico, mas o ProductProjection V4 pai não materializa o espelho comum de ferramentas do child em `ToolCallRow`; o card dedicado de `RespondToCoordinator` só é exibido na conversa da child session, e a sessão pai continua mostrando apenas o resumo de Agent/Task.
- O texto final do assistant do child ainda representa o resultado final da tarefa; `RespondToCoordinator` não encerra a tarefa.

## Persistência e Visibilidade

- Quando o response command é drenado pelo runtime pai, o carrier `<subagent-message>` completo é gravado no histórico de modelo do pai e no session store, contendo o `summary` e a `message` validados pelo schema, com escape XML e sem truncamento semântico adicional. Assim, a entrega active/idle, o hydrate da sessão e o resume do pai usam o mesmo contexto de modelo; o sucesso do enqueue em si ainda não representa persistência.
- A synthetic user message de source `subagent_message` aqui mencionada e o lifecycle/progress event `SessionEventType.SubagentMessage` são duas estruturas distintas. O segundo é usado apenas para o resumo de progresso; o primeiro é o input de modelo completo da resposta do coordinator e não pode ser truncado a resumo com base em progress events históricos.
- `model-only` é um limite de exibição e de projeção de contexto, não uma marca de "não persistir". A projeção de mensagens visíveis ao usuário, o título da sessão e o `ReadSessionContext` devem filtrar esse carrier; exportações, diagnóstico, revisão de privacidade e orçamento de armazenamento que leem o session store bruto do pai devem tratar os dados como podendo conter a resposta completa.
- Antes do compact, esse carrier pode entrar no histórico de provider do pai; depois do compact não é exigido que a mensagem original model-only seja mantida tal qual no compact tail, mas seu conteúdo semântico pode entrar no compact summary. Ocultar na UI não pode ser interpretado como dado já removido.
- O transcript comum de tool/model/turn do child continua sendo salvo apenas na child session; este canal persiste somente a resposta única que o child envia explicitamente via `RespondToCoordinator`, sem copiar o transcript completo do child.

## Agendamento

`RespondToCoordinator` usa `concurrentSafe: true`. Ela pode entrar no mesmo parallel group que ferramentas
concurrent-safe como `Read`, `Glob`, `Grep`; `Bash`, `Write`, `Edit` continuam seguindo as regras de segurança
existentes do scheduler. O modelo deve emitir primeiro a chamada de resposta e, no mesmo assistant step,
continuar emitindo a próxima chamada de ferramenta de trabalho.

O tool batch que o child está executando não é interrompido pelo input do coordinator; o steer drain
acrescenta o input `Message from coordinator:` após o fim do batch e antes da próxima requisição ao provider
do child. Se o input do coordinator chegar enquanto o model step atual do child está fechando normalmente
apenas com texto, primeiro persistimos esse assistant e depois acrescentamos o input do coordinator com role
`user`, continuando com a próxima requisição ao provider no mesmo active turn; só se recorre à fila future
comum quando um estado terminal como stop/cancel/interrupted impede continuar o turno atual, ou quando uma
barreira FIFO existente impede o inline seguro.

## Permissão

- A ferramenta mantém `readOnly: false`, `destructive: false`, `sideEffectScope: "session"`.
- O Plan mode permite essa action de controle local à sessão, não destrutiva e sem necessidade de aprovação, por meio de uma capability explícita `allowedInPlanMode`.
- Disallow global, project deny e project ask continuam prevalecendo sobre a capability de Plan mode.
- Não é permitido disfarçar mutação de sessão como read-only.

## Semântica de Resultado

- O result de sucesso usa o texto de "enfileirado" e lembra o child de continuar a tarefa atual, a menos que o coordinator tenha explicitamente modificado ou encerrado o objetivo.
- Falha no enqueue síncrono retorna result failed; o texto de falha também lembra o child de continuar a tarefa atual.
- Sem coordinator port a ferramenta não é registrada; chamada forçada em caso de anomalia retorna erro de configuração.
- O response command e a notificação de conclusão do Agent que ocorre em seguida usam `priority: "next"`. Os dois podem aparecer na mesma requisição ao provider ou em requisições adjacentes, mas a primeira posição visível ao provider da resposta deve ser anterior à notificação de conclusão.

## Semântica de Falha

- O enqueue do command é o único limite de acknowledgement síncrono.
- O corpo do resumo do card exclusivo do child exibe apenas o input `summary` e o estado de falha, sem copiar `message`, `responseId`, `error` ou o result original; o motivo real de falha de execução de ferramenta só é exibido pelo tooltip genérico de estado de falha do `ToolLayout` no hover/copy, e o `status: "failed"` de negócio não gera detalhes de erro nem seção expansível por conta própria.
- Falhas de persistência do pai, requisição ao provider ou do processo após o enqueue não modificam retroativamente o tool result do child já concluído.
- O snapshot do active-loop é um limite de turno best-effort, não uma barreira de entrega de requisição ao provider; um `subagent-message` que chega depois do snapshot não tem garantia de entrar na requisição atual e pode ser consumido por uma requisição active subsequente ou pela outer queue.
- O P0 não oferece retry durável, inbox/outbox, recibo de leitura ou recuperação após restart de processo.
- Enquanto uma ferramenta longa ainda não retorna, o modelo do child não tem controle e não pode chamar a ferramenta de resposta imediatamente.

## Fora de Escopo

- Agent Teams completos, mailbox de teammates, roster de time ou roteamento para irmãos.
- `SendMessage` completo do lado do child.
- `replyTo`, recibos de leitura de mensagem ou mailbox durável.
- Interromper uma ferramenta individual em execução.
- Modificar o scheduler para forçar paralelismo entre ferramentas unsafe e a ferramenta de resposta.
- Restaurar ou adicionar rows comuns de tool do child dentro do card de Agent do pai.
- Novos RPCs app-to-agent, ou alteração da propriedade de runtime desktop/mobile, workspace identity, remote session routing e client command queue.

## Verificação

- contracts: schema estrito de input/output, limite de 20.000 caracteres e rejeição de campos de roteamento.
- core: superfície de tool exclusiva do child, permissão de Plan mode, intake de comandos em active/idle/terminal-race, concorrência máxima de modelos 1, ordenação FIFO, continuação após falha de enqueue e paridade de hydrate.
- shared: protocol source, visibility model-only, fallback source-only e filtragem de título.
- session context: `subagent_message` não entra nos local relevant snippets.
- E2E `BG25`: `SendMessage -> RespondToCoordinator + continued work -> parent model-only wake -> child completion`, verificando simultaneamente a observabilidade da conversa do child, que a sessão pai não materializa row comum de tool do child e que não há bubble de synthetic user de nível superior.
- E2E `O19`: sob um erro real de validação de schema, o corpo do card do child já coberto exibe apenas o input `summary` e "falha na resposta", sem exibir o wrapper do provider nem o corpo do erro original, e o card não é expansível. A asserção WDIO de que o tooltip genérico mostra o `context.errorText` correspondente após hover no estado de falha ainda não foi completada; o status de cobertura atual permanece `partial`.