# Plano de implementação do Goal State Reminder

> **Para workers agênticos:** use `executing-plans` por phase; só entre na próxima phase depois que a atual concluir testes unitários e review. Este plano não depende de execução por subagent.

**Goal:** remover o projection-time filter de `target_continuation` e, por meio de um goal state reminder
persistido e compatível com MCS, fazer o modelo perceber de forma estável as mudanças de estado de
`/goal pause|clear|resume`. Um `/goal set|replace` comum é expresso pela real user objective e não
reescreve um state reminder; se o replace também provocar `paused -> active`, ainda assim um resume
reminder é anexado.

**Architecture:** tanto a goal continuation quanto a mudança de estado da goal passam a ser fatos
append-only e provider-visible do histórico. `target_continuation` deixa de ser escondido por
filtro; pause/clear/resume posteriores de goal sobrescrevem a semântica antiga de continuation por
meio de uma nova persisted system reminder source. `/goal set|replace` expressa o novo objetivo pela
real user objective; somente a passagem de paused de volta para active acrescenta um reminder
active-again. Providers compatíveis com MCS recebem `system` mid-conversation; caso contrário há
fallback para uma user message `<system-reminder>`. Se o pause ocorrer em um active regular turn, o
target DB e o `target_changed` ainda são concluídos dentro da command mutation que originou a
operação, e antes do abort; apenas o reminder é materializado depois que todos os cancelled tool
results foram persistidos e entraram no live history, e antes do turn terminal event. Mudanças de
estado em idle continuam sendo materializadas imediatamente.

**Tech Stack:** TypeScript, Vitest, message history do runtime zcode-cli, session store hydration,
provider request projection.

## Restrições globais

- Não fazer over-engineering nem introduzir uma nova máquina de estados global.
- Não corrigir o histórico com projection filter; o objetivo é um histórico provider-visible
  append-only.
- Não corrigir o momento de escrita do goal reminder de active turn reordenando a projection do
  provider.
- O novo reminder precisa ser persistido e continuar entrando no histórico do provider após a
  restauração a frio.
- O novo reminder precisa suportar MCS; quando não há suporte, há fallback natural.
- `target_continuation` continua representando a goal continuation e não é mais filtrado em
  requisições comuns.
- O snapshot voltado à UI ainda não deve renderizar uma synthetic notice model-only como um balão
  de usuário comum.
- Cada phase começa com testes unitários de falha, depois implementa e então roda os testes
  relacionados.

---

## Phase 1: nova source de Reminder de mudança de estado de goal

**Objetivo:** adicionar uma persisted + MCS-capable system reminder source dedicada a expressar
mudanças de estado de goal.

**Files:**
- Modify: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/src/system-reminder/source.ts`
- Modify: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/src/agent/session-history-hydrator.ts`
- Test: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/tests/session-history-hydrator.test.ts`
- Test: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/tests/runtime-provider-request-messages.test.ts` ou o arquivo de teste de projection do provider já existente

**Checklist:**
- [x] Nova source: `goal_state_change`
- [x] Adicionada a `SYSTEM_REMINDER_PERSISTED_SOURCES`
- [x] descriptor usa meta/provider-visible, sugerindo `descriptor("mid_turn_event", "mid_turn_event", true, "sr.goal_state_change")`
- [x] Não adicionada a `NON_MID_CONVERSATION_SYSTEM_SOURCES`
- [x] No hydrate, a synthetic notice pode ser restaurada como `messageHistory.addAttachment("goal_state_change", body)`
- [x] A projection do provider emite system mid-conversation quando MCS é capaz
- [x] A projection do provider faz fallback para `<system-reminder>` quando não há MCS

**Testes sugeridos:**
- [x] `hydrates persisted goal_state_change synthetic notice as runtime attachment`
- [x] `projects goal_state_change as mid-conversation system when MCS is supported`
- [x] `falls back goal_state_change to system-reminder user message when MCS is unsupported`

**Critérios de aprovação:**
- [x] Testes unitários provam que `goal_state_change` pode ser persistido e restaurado
- [x] Testes unitários provam que os dois caminhos provider-visible, MCS e fallback, estão corretos
- [x] Sem impacto em `resume_goal_state`, `todo_reminder` e `queued_system_notification` já existentes

---

## Phase 2: persistir o Reminder de mudança de estado de goal

**Objetivo:** anexar uma synthetic notice model-only expressando o estado mais recente da goal
quando `/goal pause|clear|resume` acontece. O corpo do objetivo em `set|replace` já é uma real user
message, e portanto o reminder não é reescrito.

**Files:**
- Modify: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts`
- Modify: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts` se for preciso complementar o comportamento de fronteira do protocolo
- Add: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/src/runtime/methods/goal-state-reminder.ts`
- Modify: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/src/runtime/methods/turn.ts`
- Modify: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/src/runtime/types.ts`
- Modify: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/src/runtime/internal-methods.ts` se for preciso adicionar um helper de runtime
- Modify: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts` se for preciso declarar o helper
- Test: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/bootstrap/tests/session-persistence.test.ts`
- Test: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`

**Sugestão de texto do Reminder:**
- pause:
  `The active session goal is paused. Do not continue pursuing it unless the user resumes or replaces the goal.`
- resume:
  `The session goal is active again and will be pursued.`
- clear:
  `The session goal has been cleared. Do not continue pursuing any previous goal unless the user sets a new goal.`

**Checklist:**
- [x] Novo helper pequeno, por exemplo `persistGoalStateChangeReminder(...)`
- [x] O helper chama internamente `persistSyntheticUserNoticeForSession({ source: "goal_state_change", visibility: "model-only" })`
- [x] Mudanças de estado em idle são gravadas sincronamente em `messageHistory.addAttachment("goal_state_change", body)`, garantindo visibilidade imediata no runtime atual
- [x] Em active regular turn, apenas uma reminder turn-local é armazenada temporariamente e gravada no history e no session store depois que os cancelled tool results fecham e antes do terminal event
- [x] `/goal pause` com sucesso grava o pause reminder
- [x] `/goal clear` com sucesso ou no clear explícito grava o clear reminder
- [x] `/goal resume` com sucesso grava o resume reminder
- [x] `/goal set` com sucesso grava apenas a real user objective, sem state reminder
- [x] `/goal replace` grava a real user objective; só grava o resume reminder quando o objetivo antigo estava paused e o replace provoca `paused -> active`
- [x] Cenários no-op não gravam reminder enganoso, como "No goal to pause/resume"

**Critérios de aprovação:**
- [x] Após o pause, sair e restaurar, o histórico do provider contém o pause reminder
- [x] Após o clear, sair e restaurar, o histórico do provider contém o clear reminder
- [x] Após o replace, o histórico do provider preserva a continuation antiga e anexa a nova real user objective; após um replace paused, um resume reminder é anexado em seguida
- [x] A UI não exibe balão de usuário comum

---

## Phase 3: remover o Projection Filter de target_continuation

**Objetivo:** excluir a lógica especial que filtra `target_continuation` em requisições comuns, para
que a goal continuation se torne um fato estável do histórico.

**Files:**
- Modify: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/src/runtime/helpers/runtime-provider-request-messages.ts`
- Test: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`

**Checklist:**
- [x] Removido o branch de filtro `includeTargetContinuationReminders`
- [x] Removido `withoutTargetContinuationReminderEntries`
- [x] Limpo o parâmetro `includeTargetContinuationReminders`, caso não tenha outro uso
- [x] Atualizado o teste antigo `filters stopped target continuation reminders from following user turns`
- [x] O novo teste passa a ser: a requisição seguinte preserva a continuation antiga, mas depois há um pause/clear reminder que sobrescreve a semântica; o replace sobrescreve a semântica pela nova real user objective
- [x] Confirmado que a continuation prompt do turn atual da goal continua incluída

**Critérios de aprovação:**
- [x] Nenhuma remoção de `target_continuation` em projection-time
- [x] Histórico provider-visible append-only
- [x] Após pause/clear/replace, um user prompt comum não é enganado pela continuation antiga, porque o state reminder posterior é mais recente e autoritativo

---

## Phase 4: atualizações de goal e regressão de race

**Objetivo:** confirmar que pause/replace/clear não se misturam aos objetivos com verifier/
continuation em execução.

**Files:**
- Test: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`
- Test: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts`

**Checklist:**
- [x] Usuário faz replace da goal durante o retorno do verifier: o targetID antigo não continua e o novo targetID continua
- [x] Usuário faz pause enquanto a continuation está na fila: a fila lê paused ao executar e não continua
- [x] Usuário faz clear depois de uma background notification e antes do goal verifier: o goal antigo não é mais verificado
- [x] Depois que `/goal pause` aborta o active turn, os cancelled tool results entram no history e no session store antes do pause reminder
- [x] Depois de `/goal resume`, o history tem o resume reminder e o continuation loop é disparado

**Critérios de aprovação:**
- [x] Todos os casos de race seguem o estado autoritativo do target da session
- [x] Nenhuma objective obsoleta é tratada como active goal e continuada
- [x] A ordem da command queue não é contornada

### Bugfix de Stop / Tool Result Ordering em 2026-07-12

- [x] Ao registrar um pause no loop regular de model/tool, não se grava imediatamente `messageHistory` nem synthetic notice
- [x] A reminder turn-local pendente não introduz cursor, varredura de history, releitura do target DB, CAS nem acoplamento com compact/rewind
- [x] A materialização da reminder só ocorre depois que a persistência das parts do cancelled tool result e o `messageHistory.addToolResult(...)` estão ambos concluídos
- [x] A materialização da reminder ocorre antes dos terminal events de success/cancel/error, evitando que a race de terminal perca a mudança de estado normal de encerramento
- [x] pause/resume/clear em idle continuam materializando imediatamente; mudanças de estado repetidas ainda não gravam reminder duplicado
- [x] Stop -> finalização do turn -> Resume preserva as duas reminders append-only de pause e resume, sem coalescing na fronteira de requisição
- [x] Uma transition reminder não flushada antes de um hard crash pode faltar; o target DB autoritativo e o current-state reminder do cold-resume continuam garantindo a restauração do estado paused
- [x] Se a materialização da reminder pendente falhar, registra-se um warning e o terminal continua; o target autoritativo e o `target_changed` já estão no banco, sem adicionar retry/cursor

#### Locks de regressão do review

- [x] Quando o Stop ocorre com o `tool_use` do assistant já no history e o tool handler ainda não iniciado, o cancelled `tool_result` ainda é sintetizado e persistido antes de a reminder de pause ser materializada
- [x] Quando o Stop ocorre durante um checkpoint de file-mutation, o cancelamento do checkpoint não trunca o fechamento no DB e no live-history dos `tool_result` siblings seguintes
- [x] O deferral da reminder cobre apenas `runRegularTurnLoop`, e o pending é materializado depois de o único `finally` externo do loop fechá-lo de forma síncrona
- [x] Quando o Stop ocorre após o último drain da reminder e antes de o `TurnComplete` ser realmente persistido, o pause reminder não se perde e ainda é materializado antes do terminal event
- [x] As três sequências de race são cobertas por testes de regressão com pontos de sincronização determinísticos, sem depender de sleep ou de race probabilístico

#### Auditoria de impacto de integração

- [x] A ordem no producer permanece target store -> pending/immediate reminder -> `target_changed`; `/goal pause` e `session/stop` só abortam depois de a command mutation ser concluída
- [x] O deferral pertence apenas ao loop regular de model/tool; idle, compact manual, rewind e pause tardio após o fechamento do loop continuam materializando imediatamente
- [x] Tool handlers que ainda não começaram antes do Stop não executam, mas cada `tool_use` que já entrou no history recebe um resultado cancelled
- [x] O cancelamento de checkpoint tem o throw adiado até que todos os resultados siblings sejam gravados no DB e no live history; o comportamento de checkpoints sem cancelamento não muda
- [x] Synthetic persistence, cold hydration, compact selection, projection MCS/fallback e o filtro UI de model-only reutilizam todos os caminhos já existentes
- [x] O active controller do protocolo só é liberado depois de o `sendInput` concluir a finalização, de modo que o próximo prompt do host desktop/remote não ultrapassa o tool result ou a reminder
- [x] compact/rewind, fila do renderer, `clientMode`, `deliveryKind`, identidade de workspace e owner/lease do controle remoto não tiveram alteração de código de produção

---

## Phase 5: regressão de Visible Content / UI / Compact

**Objetivo:** confirmar que a nova synthetic reminder não tem efeito colateral na UI, no visible
content, no compact e no session context.

**Files:**
- Modify if needed: `/Users/dev/Desktop/Z/z-code/packages/shared/src/zcode-session-visible-content.ts`
- Modify if needed: `/Users/dev/Desktop/Z/z-code/packages/ui/src/lib/zcodeChatMessages.ts`
- Test: `/Users/dev/Desktop/Z/z-code/packages/shared/test/zcodeSessionVisibleContent.test.ts`
- Test: `/Users/dev/Desktop/Z/z-code/packages/ui/test/zcodeSessionProjection.test.ts`
- Test: `/Users/dev/Desktop/Z/z-code/apps/zcode-cli/packages/core/tests/session-history-hydrator.test.ts`

**Checklist:**
- [x] A synthetic notice `goal_state_change` model-only não aparece como user bubble comum
- [x] A notice bruta continua rastreável em transcript/debug/history
- [x] A mudança de estado de goal provider-visible não se perde após o compact
- [x] session context/read-session-context não trata a reminder model-only como resumo de input real do usuário
- [x] No diff non-incremental, a relação de adjacência do assistant não muda mais por causa do filtro de `target_continuation`

**Critérios de aprovação:**
- [x] O snapshot da UI não tem novo ruído visível
- [x] Após compact/resume, o modelo ainda vê a mudança de estado de goal mais recente
- [x] A conversão de trajectory não gera mais o diff non-incremental correspondente por causa do filtro de `target_continuation`

---

## Phase 6: verificação final

**Comandos:**
- [x] `pnpm --dir apps/zcode-cli exec vitest packages/core/tests/runtime-tool-loop.test.ts --run`
  - Em 2026-07-12 passaram os 129 casos no total, incluindo os três races determinísticos de Stop: antes do agendamento, durante o checkpoint e na janela de persistência de terminal.
- [x] `pnpm --dir apps/zcode-cli exec vitest packages/core/tests/session-history-hydrator.test.ts packages/core/tests/provider-request-messages.test.ts --run`
  - Em 2026-07-12 passaram 51 casos no total, cobrindo cold hydration, MCS system e legacy fallback.
- [x] `pnpm --dir apps/zcode-cli exec vitest packages/bootstrap/tests/session-persistence.test.ts --run -t 'persists model-only goal state change reminders for goal lifecycle changes|persists replacement goal objective as real user prompt without state reminders'`
  - Em 2026-07-12 passaram os 2 casos focados.
- [ ] `pnpm --dir apps/zcode-cli exec vitest packages/bootstrap/tests/session-persistence.test.ts --run`
  - Em 2026-07-12 a execução completa ainda tem 12 falhas de expectativa preexistentes de fixtures de system-prompt/shell/tool; os casos focados de goal lifecycle relacionados a esta mudança passam.
- [x] `pnpm --dir apps/zcode-cli exec vitest packages/bootstrap/tests/zcode-protocol.test.ts --run`
- [x] `pnpm --dir apps/zcode-cli exec vitest packages/bootstrap/tests/zcode-protocol.test.ts --run -t 'allows session goal pause to stop a running prompt|pauses an active goal when session stop cancels goal continuation'`
  - Em 2026-07-12 passaram os 2 casos focados, cobrindo as duas entradas upstream de `/goal pause` e do Generic Stop.
- [x] `pnpm exec vitest packages/shared/test/zcodeSessionVisibleContent.test.ts --run`
- [x] `pnpm exec vitest packages/ui/test/zcodeSessionProjection.test.ts --run`
  - Em 2026-07-12 passaram 108 casos somando os dois arquivos, e a reminder model-only não virou um user bubble visível.
- [x] `pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-stop-empty.test.ts'`
  - Em 2026-07-12 passaram 2 casos, incluindo B12; com o Stop durante um tool call em execução e queue=0, a próxima mensagem comum é iniciada e concluída imediatamente.
- [x] `pnpm --filter @zcode/desktop typecheck:e2e`
- [x] `pnpm typecheck`
- [x] `pnpm --dir apps/zcode-cli typecheck`
- [x] `pnpm lint`
  - O lint da raiz passou (75 warnings preexistentes, 0 erros); o oxlint direcionado de todos os arquivos TypeScript alterados passou. O lint completo de `apps/zcode-cli` continua bloqueado pela baseline preexistente de max-lines/unused.

**Checagens manuais / de evidência:**
- [ ] Criar uma goal e rodar uma continuation
- [ ] Fazer pause na goal, sair e restaurar, e conferir que a requisição provider-visible contém o pause reminder
- [ ] Fazer replace da goal e conferir que a continuation antiga vem seguida da nova real user objective
- [ ] Fazer clear da goal e conferir que o prompt seguinte não continua a goal antiga
- [ ] Conferir o role `system` em provider compatível com MCS
- [ ] Conferir o fallback para `<system-reminder>` em provider sem MCS

**Definição de conclusão:**
- [x] `target_continuation` não é mais removido por projection filter
- [x] A mudança de estado de goal é uma synthetic notice persistida, compatível com MCS e model-only
- [x] pause/clear/resume têm todas uma transição de estado provider-visible; set/replace entram no histórico provider-visible pela real user objective, e um replace de `paused -> active` grava adicionalmente um reminder active-again
- [x] Após a restauração a frio o modelo ainda percebe o estado de goal mais recente
- [x] A UI não ganha balão de usuário comum
- [x] Os testes do escopo desta rodada passam e não há refactor não relacionado