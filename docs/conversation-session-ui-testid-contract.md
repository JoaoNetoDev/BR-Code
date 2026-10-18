# Contrato de Test ID da UI de Sessão de Conversa

Objetivo: fornecer um protocolo de localização de UI estável e aplicado a todo o projeto para o E2E do MVP da área de sessão. O WDIO precisa afirmar o comportamento do produto por meio de `data-testid` e estados de DOM explícitos, sem depender de screenshots, CSS class, posição visual ou textos mutáveis para decidir aprovação.

## Especificação existente

O projeto já tem uma fonte única para test ids globais:

- `packages/shared/src/test-ids.ts`
- `docs/testing/testid-audit.md`
- `docs/architecture/architecture.md`

As regras existentes continuam válidas:

- Todas as constantes `data-testid` são declaradas de forma unificada em `packages/shared/src/test-ids.ts`.
- Constantes novas devem ter comentário em chinês.
- Componentes de UI são proibidos de codificar strings de test id na mão.
- O E2E usa `sel(tid)` ou helper equivalente de `packages/desktop/test/e2e/helpers/selectors.ts`.
- Itens de listas dinâmicas usam `testId(BASE, suffix)`.

## Princípios de asserção

Screenshot não é critério de aprovação. Screenshots e gravações servem apenas como artefatos de revisão manual após uma falha.

A aprovação da UI do MVP só pode vir destes sinais determinísticos:

| Sinal | Uso | Exemplo |
| --- | --- | --- |
| `data-testid` | localizar elementos estáveis | queue item, message, compact marker |
| `data-state` | verificar a projeção da máquina de estados | `running`, `completed-interrupted`, `compacting` |
| `data-status` | verificar o resultado de uma operação | `queued`, `started`, `completed`, `failed`, `interrupted` |
| `data-role` | verificar o papel da mensagem | `user`, `assistant`, `tool`, `timeline` |
| `data-session-id` | verificar a qual session o elemento pertence | active session, message list, queue panel |
| `data-message-id` | verificar a identidade da mensagem | fork target, edit target |
| `data-queue-item-id` | verificar a identidade do item da fila | send-now, edit, remove, reorder |
| `aria-disabled` / `disabled` | verificar se a operação é permitida | botões fork/edit/compact/send |
| input value / normalized text | verificar a entrada do usuário e o conteúdo das mensagens | texto do queue item, valor do composer |

O texto pode servir como asserção de conteúdo, mas não como meio de localização. Por exemplo, é válido afirmar que o texto do queue item contém "继续解释", mas não usar `button=继续解释` para encontrar o botão.

### Complemento de materialização canônica V4

O E2E formal do V4 lê a materialização do protocolo do produto e não reutiliza os textos das debug rows antigas de M3/M4:

- A raiz `timelineMarker` de `TID_V4_ROW-*` expõe `data-row-kind="timelineMarker"`, `data-marker-type` e `data-status`; o compact expõe ainda `data-origin`. O vocabulário de estado final do compact no V4 é `success/failed/noop/cancelled`, e `started/completed` da UI antiga só servem de fundo para o mapeamento legacy.
- `TID_CHAT_SUMMARY_PANEL` é o shell unificado de goal/background. Tanto `mini` quanto `panel` precisam expor no shell `data-goal-status`, `data-goal-objective` e `data-running-background-count`; o fato de a área de detalhes estar montada não afeta a leitura do estado autoritativo pelo E2E.
- A raw projection window, o raw total e as logical turn render units do timeline V4 devem usar atributos distintos: `data-window-row-count`, `data-total-row-count`, `data-render-unit-count`. As units montadas são contadas com `data-v4-turn-unit`, e é proibido usar a quantidade de `[TID_V4_ROW-*]` para fingir ser o número de virtual items.
- O edit inline deve ser dirigido por `TID_V4_EDIT_INPUT/SUBMIT/CANCEL + rowId`; o valor do composer principal não é o edit newText.

## Regras de sufixo dinâmico

O sufixo dinâmico de um test id precisa ser estável, correlacionável e nunca pode vir de texto de exibição mutável.

| Objeto | Origem do sufixo | Proibido |
| --- | --- | --- |
| session/task | `sessionId` / `taskId` | título da session, índice da lista |
| message | `messageId`, com fallback para `turnIndex` estável | corpo da mensagem, índice do DOM |
| queue item | `queueItemId` | texto da fila, índice do DOM |
| compact marker | `inputId` preferencialmente, senão `operationId` do compact | texto de exibição de tempo |
| model/thought item | valor da opção de configuração | label traduzível |
| toast/error | stable reason code | texto traduzível |

Se o comportamento do produto exige verificar "ordem", não codifique a ordem no test id; use o mesmo selector para consultar a lista e então ler a ordem de `data-queue-item-id` ou `data-message-id` de cada elemento.

## Test IDs obrigatórios da área de sessão

Abaixo estão os elementos de UI que os cases do MVP precisam ter implementados ou confirmados. Constantes existentes podem ser reutilizadas; constantes ausentes devem ser adicionadas a `packages/shared/src/test-ids.ts`.

### Login e pré-requisito de modelo

O E2E da área de sessão não pode assumir que um projeto vazio pode ser usado diretamente. O pré-requisito do case de compact do MVP deve ser percorrido pelo caminho real do usuário:

1. Na página de boas-vindas, clicar em `TID_LOGIN_USE_API_KEY_BUTTON`, entrando no login por API Key.
2. Usar `TID_LOGIN_API_KEY_INPUT` para preencher a API Key de teste e clicar em `TID_LOGIN_API_KEY_CONTINUE_BUTTON`.
3. Depois de entrar no workspace, configurar a API Key da DeepSeek nas configurações de provedor de modelo.
4. Voltar à área de sessão e alternar para `deepseek-v4-flash`.

Essa cadeia de pré-requisitos também faz parte do protocolo do produto: o teste não pode contornar a página de boas-vindas escrevendo o estado de login diretamente, a menos que o objetivo do case seja explicitamente a validação de um serviço fora da camada de UI.

| Constante sugerida | Elemento | Atributos obrigatórios |
| --- | --- | --- |
| `TID_LOGIN_USE_API_KEY_BUTTON` | entrada de login por API Key na página de boas-vindas | `disabled` |
| `TID_LOGIN_API_KEY_PROVIDER_TRIGGER` | seletor de provider do login por API Key | valor do provider atual |
| `TID_LOGIN_API_KEY_PROVIDER_ITEM` | opção de provider do login por API Key | sufixo dinâmico igual à escolha de provider |
| `TID_LOGIN_API_KEY_INPUT` | campo de entrada da API Key | value |
| `TID_LOGIN_API_KEY_CONTINUE_BUTTON` | botão de continuar do login por API Key | `disabled` |
| `TID_LOGIN_API_KEY_CANCEL_BUTTON` | botão de cancelar do login por API Key | `disabled` |
| `TID_LOGIN_API_KEY_SKIP_BUTTON` | botão de pular temporariamente o login por API Key | `disabled` |
| `TID_LOGIN_API_KEY_ERROR` | mensagem de erro do login por API Key | texto normalizado |

`TID_MODEL_PROVIDER_NAV_ITEM` nas configurações de provedor de modelo precisa expor `aria-selected` e `data-state`. Quando o E2E selecionar um provider como DeepSeek ou GLM, só pode ler `aria-selected="true"` ou `data-state="selected"`, e não determinar o estado selecionado por CSS class como `border-*` / `bg-*`.

Quando o seletor de modelo da barra de ferramentas do chat é uma estrutura de dois níveis, o agrupamento por provider precisa expor `TID_CHAT_MODEL_SELECT_GROUP`, com sufixo dinâmico igual à chave do grupo de provider (por exemplo `provider:e2e-deepseek`). O E2E precisa abrir o grupo de provider primeiro e só então selecionar `TID_CHAT_MODEL_SELECT_ITEM`; não se pode interpretar "o menu de primeiro nível momentaneamente não tem itens de modelo" como modelo indisponível.

### Contêiner raiz e estado

| Constante sugerida | Elemento | Atributos obrigatórios |
| --- | --- | --- |
| `TID_CHAT_VIEW` | contêiner raiz dos detalhes da sessão | `data-session-id`, `data-state`, `data-queue-count`, `data-target-id`, `data-target-objective`, `data-target-status`, `data-runtime-status`, `data-active-input-id`, `data-stop-requested` |
| `TID_CHAT_MESSAGES` | lista de mensagens | `data-session-id` |
| `TID_CHAT_INPUT` | campo de entrada do composer | value |
| `TID_CHAT_SEND_BUTTON` | botão de envio | `disabled` |
| `TID_CHAT_STOP_BUTTON` | botão de stop | `disabled` |
| `TID_CHAT_LOADING` | indicador de geração em andamento | `data-session-id` |

### Mensagens e turnos

| Constante sugerida | Elemento | Sufixo dinâmico | Atributos obrigatórios |
| --- | --- | --- | --- |
| `TID_CHAT_TURN` | contêiner do grupo de turno | `turnIndex` | `data-turn-index`, `data-session-id` |
| `TID_CHAT_MESSAGE` | contêiner de uma mensagem | `messageId` | `data-message-id`, `data-role`, `data-turn-index` |
| `TID_CHAT_USER_MESSAGE` | contêiner de mensagem de user | `messageId` | `data-message-id` |
| `TID_CHAT_ASSISTANT_MESSAGE` | contêiner de mensagem de assistant | `messageId` | `data-message-id` |
| `TID_CHAT_ASSISTANT_HISTORY_TRIGGER` | gatilho de recolhimento do histórico da mensagem de assistant | `historyStateKey` | `data-history-state-key`, `data-history-open`, `data-history-has-content` |
| `TID_CHAT_ASSISTANT_HISTORY_CONTENT` | área de conteúdo recolhido do histórico da mensagem de assistant | `historyStateKey` | `data-history-state-key`, `data-history-open` |
| `TID_CHAT_TOOL_MESSAGE` | contêiner de mensagem de tool | `messageId` ou `toolCallId` | `data-tool-call-id` |
| `TID_CHAT_TOOL_CALL_BLOCK` | bloco de tool call dentro da mensagem de assistant | `toolCallId` | `data-tool-call-id`, `data-tool-name`, `data-status` |
| `TID_CHAT_TIMELINE_MARKER` / `TID_V4_ROW` | timeline marker | marker id / rowId | `data-row-kind`, `data-marker-type`, `data-status`; o compact ainda tem `data-origin` |
| `TID_CHAT_COMPACT_MARKER` | compact marker | `inputId` ou `operationId` | `data-trigger`, `data-status`, `data-operation-id`, `data-input-id` |
| `TID_CHAT_CHANGE_SUMMARY_TOGGLE_FILES_BUTTON` | botão de desfazer/reaplicar no resumo de alterações do assistant | `messageId` | `data-message-id`, texto do botão |

### Ciclo mínimo do Compact Marker

Um `/compact` manual bem-sucedido é a primeira case E2E a posteriori da área de sessão. A aprovação automática precisa satisfazer simultaneamente:

- Na camada de UI aparece primeiro `TID_CHAT_COMPACT_MARKER`, com `data-status="started"` e `data-trigger="manual"`.
- A mesma identidade de marker é atualizada em seguida para `data-status="completed"`. Se um evento do lifecycle do agent atualizar o `operationId` de um id optimistic local para o operation id real, `data-input-id` precisa permanecer inalterado, e o teste usa `data-input-id` para correlacionar started e completed.
- O texto do marker pode mudar com o i18n e não participa da localização; os textos chineses atuais "正在压缩上下文" e "上下文已自动压缩" servem apenas como pistas para a revisão manual.
- A camada de rede precisa capturar uma compact attempt lógica: a primeira requisição física ao provider é `stream:true`; quando o stream tem sucesso existe apenas a perna de streaming, e em caso de falha de stream elegível é permitido acrescentar à mesma attempt lógica uma perna de fallback non-stream. Toda requisição de compact ao provider precisa conter o conteúdo da session principal e a instrução de compactação `CRITICAL: Respond with TEXT ONLY`.
- O ACK de `session/compact` não pode ser usado como critério de sucesso; o critério é o `status="completed"` no timeline event / snapshot de `context_compaction` seguinte.

### Fila

| Constante sugerida | Elemento | Sufixo dinâmico | Atributos obrigatórios |
| --- | --- | --- | --- |
| `TID_CHAT_QUEUE_PANEL` | painel da fila | nenhum | `data-session-id`, `data-auto-drain` |
| `TID_CHAT_QUEUE_ITEM` | item da fila | `queueItemId` | `data-queue-item-id`, `data-kind`, `data-index` |
| `TID_CHAT_QUEUE_ITEM_CONTENT` | conteúdo do item da fila | `queueItemId` | texto normalizado |
| `TID_CHAT_QUEUE_SEND_NOW_BUTTON` | botão de envio imediato | `queueItemId` | `disabled` |
| `TID_CHAT_QUEUE_EDIT_BUTTON` | botão de edição do item da fila | `queueItemId` | `disabled` |
| `TID_CHAT_QUEUE_EDIT_INPUT` | campo de edição do item da fila | `queueItemId` | value |
| `TID_CHAT_QUEUE_EDIT_SAVE_BUTTON` | botão de salvar a edição do item da fila | `queueItemId` | `disabled` |
| `TID_CHAT_QUEUE_EDIT_CANCEL_BUTTON` | botão de cancelar a edição do item da fila | `queueItemId` | `disabled` |
| `TID_CHAT_QUEUE_REMOVE_BUTTON` | botão de remoção do item da fila | `queueItemId` | `disabled` |
| `TID_CHAT_QUEUE_DRAG_HANDLE` | alça de arraste para reordenar | `queueItemId` | `aria-disabled` |

### Ações de mensagem

| Constante sugerida | Elemento | Sufixo dinâmico | Atributos obrigatórios |
| --- | --- | --- | --- |
| `TID_CHAT_MESSAGE_FORK_BUTTON` | botão de fork do assistant | `messageId` | `disabled` / `aria-disabled` |
| `TID_CHAT_MESSAGE_EDIT_BUTTON` | botão de edição da query do user | `messageId` | `disabled` / `aria-disabled` |
| `TID_CHAT_MESSAGE_EDIT_INPUT` | campo de edição | `messageId` | value |
| `TID_CHAT_MESSAGE_EDIT_SUBMIT` | botão de confirmação da edição | `messageId` | `disabled` |
| `TID_CHAT_MESSAGE_EDIT_CANCEL` | botão de cancelamento da edição | `messageId` | `disabled` |
| `TID_V4_HOOK_DETAILS_TRIGGER` | botão de detalhes de Hook no fim do turno | `productTurnId` | `aria-label`, `aria-expanded` |
| `TID_V4_HOOK_DETAILS_CONTENT` | Popover de detalhes de Hook do turno | `productTurnId` | event/tool, origem e texto de estado; não pode conter comandos nem caminhos absolutos |

O tool call hoje não é uma mensagem independente, e sim um bloco estruturado dentro da mensagem de assistant. Ao verificar que "tool não pode ser edit/fork", é obrigatório localizar `TID_CHAT_TOOL_CALL_BLOCK` e afirmar que dentro desse bloco não há descendentes `TID_CHAT_MESSAGE_EDIT_BUTTON` ou `TID_CHAT_MESSAGE_FORK_BUTTON`. A própria mensagem de assistant ainda pode exibir fork segundo as regras de assistant, o que não equivale a o tool block poder ser forkado.

Sonda de falha atual: `conversation-session-tool-actions.test.ts` já provou que a camada de persistência tem um tool part, mas o DOM da página de sessão não renderiza `TID_CHAT_TOOL_CALL_BLOCK`. Portanto este contrato é o alvo de aceitação para a futura correção da projeção de UI e não pode ser considerado já satisfeito.

### Feedback de comandos

Por padrão, um conversation E2E positivo precisa afirmar a ausência de `TID_CHAT_ERROR_BANNER`. Se um case espera por padrão recuperação de erro, falha de provider/rede, falha de permissão ou outro negative path, é obrigatório escrever explicitamente na documentação do case que a faixa de erro é permitida e afirmar a causa do erro e o estado de recuperação. Não se pode considerar aprovado um case positivo que teve faixa de erro mas conseguiu continuar.

| Constante sugerida | Elemento | Sufixo dinâmico | Atributos obrigatórios |
| --- | --- | --- | --- |
| `TID_CHAT_TOAST` | contêiner de toast | reason code | `data-reason`, `data-severity` |
| `TID_CHAT_ERROR_BANNER` | contêiner da faixa de erro `ChatViewErrorBanner` / `ChatErrorBanner` | nenhum; para distinguir a causa do erro, use `data-reason` / `data-error-code` | `data-reason`, `data-error-code`, `data-trace-id`, `data-dismissible` |
| `TID_CHAT_GOAL_STATE` | projeção do estado de goal | session id | `data-goal-status`, `data-target-id` |

### Troca de sessão e configurações

| Constante sugerida | Elemento | Sufixo dinâmico | Atributos obrigatórios |
| --- | --- | --- | --- |
| `TID_TASK_ITEM` | item da lista de session/task | `sessionId` / `taskId` | `data-session-id`, `data-active`, `data-state` |
| `TID_CHAT_MODEL_SELECT_TRIGGER` | seletor de modelo da session atual | nenhum | `data-session-id`, `data-model-value` |
| `TID_CHAT_MODEL_SELECT_GROUP` | grupo de provider de modelo da session atual | chave do grupo de provider | `data-model-provider-key`, `data-model-provider-selected` |
| `TID_CHAT_THOUGHT_LEVEL_SELECT_TRIGGER` | seletor de profundidade de pensamento da session atual | nenhum | `data-session-id`, `data-thought-level` |

## Requisitos de Page Object do WDIO

Os testes da área de sessão não devem montar CSS diretamente dentro do spec. Crie um page object de conversation/session que centralize localização e asserções.

Interface de exemplo:

```ts
chat.sessionRoot(sessionId)
chat.queuePanel(sessionId)
chat.queueItems(sessionId)
chat.queueItem(queueItemId)
chat.queueSendNowButton(queueItemId)
chat.message(messageId)
chat.messageForkButton(messageId)
chat.messageEditButton(messageId)
chat.compactMarker(inputId)
chat.expectQueueOrder([queueItemIdA, queueItemIdB])
chat.expectNoProtocolFrame({ method: "session/compact", inputId })
```

## Correções na matriz de validação

Na matriz de validação, a camada de UI precisa ser reescrita como "usar test id e atributos de DOM para asserção". Screenshots e gravações permanecem apenas na camada de artefatos e não podem ser condição automática de aprovação.

Expressão correta:

```text
UI:
  - [data-testid=chat-queue-panel] 存在
  - data-auto-drain=false
  - queue item 数量为 1
  - stop button disabled=true

Artifact:
  - 保存 final.png，供失败后人工复盘
```

Expressão incorreta:

```text
UI:
  - 截图看起来 queue 还在
```
