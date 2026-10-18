# Plano de Implementação — Detalhe de Falha de Background Subagent

> **Para trabalhadores agentivos:** SUB-SKILL OBRIGATÓRIA: usar superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Preservar a mensagem de falha de provider de um background subagent através da notificação de task, do resultado de Agent visível ao usuário, do hover de falha existente e da restauração por snapshot.

**Arquitetura:** O turno filho já lança um erro estruturado cujo cause preserva a mensagem do provider. O finalizador de background vai selecionar essa mensagem primária já existente uma única vez, colocá-la tanto no resumo de falha quanto em `<error>`, e o parser compartilhado de notificações vai carregá-la para as projeções desktop-continuous e replayable. A UI existente de Agent/ToolLayout consome `toolCall.error`; nenhuma mudança de componente, copy ou i18n é necessária.

**Stack tecnológico:** TypeScript, Vitest, WDIO Electron E2E, fixtures de replay DeepSeek locais do caso.

## Restrições globais

- Manter inalterados o copy de status visível `执行失败` e a interação existente de hover/cópia.
- Anexar a mensagem do provider diretamente após `Agent <type> task "<description>" failed.`; não traduzi-la nem sintetizar rótulos de HTTP/código.
- Excluir o subagent vazio com `finishReason=stop` e a semântica de fila/retry 429 do modelo principal.
- Preservar as fronteiras de projeção `desktop-continuous` do desktop e `web-remote-replayable` do mobile/serviço.
- Adicionar testes antes do código de produção e observar a regressão E2E/unit falhar pelo comportamento de erro ausente esperado.
- Não modificar `ToolLayout.tsx`, o styling do renderer de Agent nem os arquivos de locale.

---

### Task 1: Fixar o caso aceito e o contrato de fixture

**Arquivos:**

- Modificar: `apps/zcode-cli/docs/design/v2/tool/07-subagent.md`
- Modificar: `docs/conversation-session-case-catalog.md`
- Modificar: `docs/testing/conversation-session-background-e2e-coverage-matrix.md`
- Modificar: `docs/testing/conversation-session-e2e-coverage-matrix.md`

**Interfaces:**

- Produz: setup/action/assertion aceitos de `BG26` e o mapeamento de automação `BGE`.

- [x] Registrar as asserções exatas de resumo de falha, `<error>`, hover, idle e restauração.
- [x] Registrar que 429 é apenas uma falha filha representativa; 429 do modelo principal e stop vazio permanecem fora de escopo.

### Task 2: Escrever primeiro o E2E que falha

**Arquivos:**

- Criar: `packages/desktop/test/e2e/conversation-session/conversation-session-background-subagent-rate-limit.test.ts`
- Criar: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-background-subagent-rate-limit.json`
- Criar: `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-background-subagent-rate-limit.json`

**Interfaces:**

- Consome: helpers de conversa existentes, diagnósticos de ferramentas e helpers de troca de task.
- Produz: uma fixture local do caso que dispara um Agent de background, retorna respostas repetíveis de 429 apenas do filho com `retry-after: 0`, e consome no pai a notificação de task com falha.

- [x] Criar uma fixture principal que emita `Agent(run_in_background=true)` com marcadores estáveis de pai/filho.
- [x] Criar uma fixture ilimitada de 429 apenas do filho usando `lastUserMessageIncludes`, para que as requisições do pai não possam casar com ela.
- [x] Afirmar que a notificação visível ao provider contém `<status>failed</status>`, a mensagem do provider em `<error>` e a mesma mensagem imediatamente após `failed.` em `<summary>`.
- [x] Afirmar que o store e o DOM do renderer mostram falha, que a saída expandida contém o resumo exato e que passar o mouse em `执行失败` expõe a mensagem do provider.
- [x] Trocar para um novo rascunho e voltar; repetir as asserções de status/saída/hover a partir do snapshot restaurado.
- [x] Executar a verificação de fixture e o WDIO com fixture explícita. RED esperado: a saída atual continua genérica ou o status restaurado é completed/ausente o erro.

### Task 3: Adicionar testes focados que falham para cada fronteira de dados

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/tests/subagent-background.test.ts`
- Modificar: `packages/shared/test/backgroundTaskNotifications.test.ts`
- Modificar: `packages/ui/test/zcodeSessionProjection.test.ts`
- Modificar: `packages/services/test/zcodeLegacyTaskCompatTaskIndex.test.ts`

**Interfaces:**

- Produz: contratos focados para seleção de cause estruturada, formatação do resumo de falha, parsing XML, erro de evento ao vivo e overlay terminal de snapshot.

- [x] Fazer um filho de background rejeitar com um wrapper `Turn execution failed` cuja mensagem de cause é o texto de rate limit do provider; afirmar que notificação/registro/SubagentStopped usam a mensagem de cause.
- [x] Afirmar que as entidades XML de `<error>` são decodificadas exatamente uma vez.
- [x] Afirmar que ambas as funções de projeção ao vivo emitem `status: "failed"` e `error: providerMessage`.
- [x] Afirmar que um ACK de lançamento completed mais uma notificação failed é restaurado como uma tool persistida como falha com o mesmo erro.
- [x] Executar os quatro arquivos de teste focados e confirmar que as falhas são causadas pelo comportamento ausente.

### Task 4: Implementar a correção mínima de código-fonte

**Arquivos:**

- Modificar: `apps/zcode-cli/packages/core/src/subagent/runner.ts`
- Modificar: `apps/zcode-cli/packages/core/src/subagent/completion-notification.ts`
- Modificar: `packages/shared/src/background-task-notifications.ts`
- Modificar: `packages/ui/src/lib/zcodeSessionProjection.ts`
- Modificar: `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts`

**Interfaces:**

- Consome: `selectExecutionErrorMessage(error)` e os helpers existentes de notificação/status.
- Produz: uma string de mensagem do provider propagada como sufixo do resumo e como erro de tool nos caminhos ao vivo e de restauração.

- [x] Em `finalizeBackgroundFailure`, selecionar a mensagem original da cause do wrapper sem normalização de whitespace nem truncamento para objetos Error, e preservar `String(error)` para valores não-Error.
- [x] Usar trim apenas para rejeitar erros de falha vazios, mas anexar o valor não modificado; deixar completed/stopped inalterado byte a byte.
- [x] Fazer o parsing de `<error>` no parser de notificações compartilhado.
- [x] Mapear notificações failed ao vivo para `tool_call_update.error` nas projeções de UI e de serviço.
- [x] Quando um ACK de lançamento completed tem uma notificação failed correspondente, sobrepor failed/error em ambos os mappers de snapshot; preservar o comportamento de stopped/killed e o `state.status === "error"` nativo.
- [x] Executar os testes focados até ficarem GREEN sem mudar o comportamento de produto esperado por eles.

### Task 5: Comprovar o sintoma original e a segurança contra regressão

**Arquivos:**

- Testar: todos os arquivos listados acima.

**Interfaces:**

- Produz: artefatos de replay e saída de verificação.

- [x] Reexecutar o WDIO com fixture explícita e o replay padrão de `conversation-session-background-subagent-rate-limit.test.ts`.
- [x] Executar `pnpm --filter @zcode/desktop typecheck:e2e`.
- [x] Executar a auditoria de cobertura de conversa.
- [x] Executar `pnpm typecheck`, `pnpm lint` e `git diff --check`.

### Task 6: Encerramento de dependências e revisão de código

**Arquivos:**

- Revisar: o diff completo da working tree contra o SHA base do worktree.

**Interfaces:**

- Produz: inventário concreto de imports/referências e um veredito independente de prontidão para merge.

- [x] Usar `pnpm dep:refs --list-exports` nos arquivos shared/core alterados e depois `pnpm dep:refs <file>:<export>` sem escopo para cada símbolo exportado alterado.
- [x] Usar `rg` para procurar implementações duplicadas não exportadas e consumidores de `<task-notification>` baseados em string que o rastreamento estático de símbolos não detecta.
- [x] Despachar revisores independentes somente-leitura com os requisitos, o SHA base, o diff completo da working tree e as evidências de verificação frescas.
- [x] Corrigir todo problema Critical/Important, reexecutar os testes afetados e repetir a revisão se o código de produção mudou.
- [x] Reexecutar imediatamente antes de reportar a conclusão o conjunto final completo de verificação.