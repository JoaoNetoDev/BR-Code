# Design da remoção do painel «Terminais em execução»

Data: 2026-06-03
Status: implementado; este documento é mantido como registro histórico de design

> A UI de sessão V4 atual já removeu os antigos componentes `ChatView`, `ChatViewSupplementPanels` e `LongRunningToolCallPanel`. Os nomes de arquivo e as cadeias de chamada abaixo descrevem apenas o plano de remoção da época e não podem servir de base para a estrutura de UI atual; a entrada de sessão atual é `packages/ui/src/v4/SessionPane.tsx`.

## Contexto

O app zcode atualmente tem a seguinte lógica: quando uma chamada de ferramenta bash/shell ultrapassa um limiar de tempo (30 segundos), é exibido na área de painéis auxiliares do chat um painel «N terminais em execução» (`LongRunningToolCallPanel`), que lista comandos shell de longa duração e oferece o botão «Forçar encerramento da tarefa». Essa exibição é decidida inteiramente pela diferença entre o `startedAt` da tool e o horário atual.

Requisito: remover esse painel «Terminais em execução» baseado na verificação de tempo da tool.

## Escopo

**Remover apenas o painel de terminais.** Na época, manteve-se ao lado a lógica de «supressão do thinking shimmer» que reutiliza o mesmo limiar de 30 segundos; o comportamento da animação de «pensando» permanece totalmente inalterado.

Alteração posterior: a partir de 2026-06-16, a lógica de sobreposição de ferramentas do ChatLoading não reutiliza mais o limiar de 30 segundos e passa a usar `hasCurrentTurnForegroundActiveToolCalls()`, observando apenas as active foreground tools da rodada atual; depois que a mensagem da próxima rodada chega, o estado da nova rodada assume o controle da exibição do loading.

### Distinção essencial

Três funções em `packages/ui/src/lib/longRunningToolCalls.ts` pertencem a dois conjuntos de funcionalidades:

- `collectLongRunningToolCalls()` → alimenta o **painel de terminais** (alvo da remoção)
- `hasActiveToolCalls()` / `hasCurrentTurnForegroundActiveToolCalls()` → alimentam a **supressão do thinking shimmer e o relógio panelNow** (mantidas)

A cadeia de relógio `panelNow` (`hasActiveToolCalls` → `hasRunningToolCalls` → o `setPanelNow` a cada segundo em `useChatViewEffects`) precisa ser mantida. Desta vez removemos apenas o painel, sem mexer no relógio.

## Lista de alterações

### 1. Remover o arquivo inteiro
- `packages/ui/src/LongRunningToolCallPanel.tsx`

### 2. `packages/ui/src/ChatView/ChatViewSupplementPanels.tsx`
- remover o import de `LongRunningToolCallPanel`
- remover o bloco de render `isTaskRunning ? <LongRunningToolCallPanel … /> : null` e o comentário correspondente acima dele
- limpar as props que passam a ficar sem uso: `displayedMessages`, `closeTask`
- `taskId` continua sendo usado condicionalmente por `QueuedPromptList` e é mantido

### 3. `packages/ui/src/ChatView.tsx` (ponto de chamada, em torno da linha 653)
- remover as duas props `displayedMessages` e `closeTask` passadas a `ChatViewSupplementPanels`
- a cadeia `hasActiveToolCalls` / `hasRunningToolCalls` / `panelNow` permanece inalterada (o shimmer ainda precisa dela)

### 4. `packages/ui/src/ChatView/useChatViewDisplayFlags.ts`
- remover o import de `collectLongRunningToolCalls` e o memo `hasVisibleLongRunningPanel`
- `shouldShowSupplementPanels` passa a ser `planLength > 0 || queuedPromptsLength > 0`
- remover `hasVisibleLongRunningPanel` do objeto retornado (o código-fonte já não tem consumidores)
- manter o import do tool blocker do ChatLoading e seu uso (posteriormente substituído por `hasCurrentTurnForegroundActiveToolCalls`)

### 5. `packages/ui/src/lib/longRunningToolCalls.ts`
- remover a função `collectLongRunningToolCalls` e a interface `LongRunningToolCall`
- manter `hasActiveToolCalls`, o tool blocker do ChatLoading e `LONG_RUNNING_TOOL_CALL_THRESHOLD_MS`
- não renomear o arquivo (a renomeação arrastaria vários imports, com pouco valor)

### 6. `packages/shared/src/test-ids.ts`
- remover `TID_CHAT_LONG_RUNNING_PANEL` e `TID_CHAT_LONG_RUNNING_STOP_BUTTON`

### 7. i18n
en-US.ts / zh-CN.ts: remover as 5 keys exclusivas do painel:
- `chat.longRunning.title`
- `chat.longRunning.description`
- `chat.longRunning.stop`
- `chat.longRunning.elapsedSeconds`
- `chat.longRunning.elapsedMinutesSeconds`

**Manter** `chat.longRunning.collapse` / `chat.longRunning.expand` — `TodoPanel.tsx:144` ainda reutiliza essas duas keys.

### 8. Testes
- `packages/ui/test/chatViewSupplementPanels.test.ts`: os dois casos eram asserções de exibição do painel; após a remoção do painel não resta comportamento independente testável → remover o arquivo inteiro
- `packages/ui/test/longRunningToolCalls.test.ts`: remover os casos de `collectLongRunningToolCalls` e manter os de `hasActiveToolCalls` / tool blocker do ChatLoading

## Verificação

- rodar o typecheck do pacote ui e confirmar que não há referências pendentes (especialmente `hasVisibleLongRunningPanel`, as props removidas e os test-ids removidos)
- rodar o `longRunningToolCalls.test.ts` restante e confirmar que os casos das funções auxiliares do shimmer passam
- teste manual: a animação de shimmer durante o pensamento, o painel de Todo e o comportamento de prompts enfileirados permanecem inalterados; um bash longo não abre mais o painel de terminais

## Observações

- não remover logs de depuração adicionados pelo próprio usuário
- `chatLoadingDebug` já não tem arquivo correspondente no código-fonte (apenas resíduo em dist) e não precisa de alterações
- a árvore de trabalho compartilhada tem escritores concorrentes: ao commitar, enviar apenas os arquivos envolvidos nesta alteração via pathspec