# Plano de Implementação de Subagent RespondToCoordinator

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** adicionar ao subagent ZCode comum a ferramenta child-only `RespondToCoordinator`, para que o child, ao receber a mensagem do coordinator injetada pelo main via `SendMessage`, possa entregar a resposta de volta ao runtime pai enquanto continua a tarefa de longa duração atual.

**Arquitetura:** manter inalterado o caminho existente `main -> SendMessage -> child steerTurn`. Adiciona-se o caminho `child -> RespondToCoordinator -> CoordinatorResponsePort -> parent runtime command queue`; o runtime pai usa um command `subagent-message` separado, que converge antes da próxima requisição de provider legítima sob active loop, ou inicia um turno model-only quando estiver ocioso. A resposta não se torna uma mensagem real de usuário, não reutiliza a semântica de `task-notification` de conclusão de background task, e não chama o modelo pai concorrentemente.

**Tech Stack:** TypeScript, Zod, Vitest, ZCode tool registry/executor, AgentRuntime command queue, ZCode Protocol, E2E de replay de provider via WebdriverIO.

## Baseline de Execução

- Este plano foi escrito com base em `e458e18b902a467251153972688ca8461eb5a418`; rode `git rev-parse HEAD` antes de iniciar a Phase 0.
- Se o HEAD já mudou, reconfirme primeiro as entradas de código-fonte, arquivos de teste e comandos listados neste plano e então atualize o baseline abaixo para o ponto de partida real; é proibido executar mecanicamente sobre um drift de branch desconhecido.
- Durante a implementação, use `BASE_SHA=e458e18b902a467251153972688ca8461eb5a418` como baseline de revisão de escopo completo. Ao final, use `git diff "$BASE_SHA"...HEAD` para ver as alterações já commitadas e verifique separadamente arquivos staged, unstaged e untracked.
- O próprio arquivo de plano atual é um deliverable da Phase 0 e precisa entrar no commit da Phase 0 junto com a feature spec, não pode ficar em estado untracked.

## Restrições Globais

- O nome da ferramenta visível ao provider é fixo: `RespondToCoordinator`.
- `SendMessage` continua exposto apenas ao runtime main; o child comum não ganha `SendMessage` completo, `Agent` ou capacidade de roteamento para irmãos. `RespondToCoordinator` só é registrado quando `taskType === "subagent_child"`, a coordinator port existe e não está desabilitada pelo `toolDisallowlist` global.
- A entrada de `RespondToCoordinator` contém apenas `{ summary, message }`; o modelo não pode fornecer `to`, `agentId`, `sessionId` ou identificador do pai.
- A identidade da sessão do child, a identidade do agent e a rota para o pai devem ser injetadas pelo runtime ao criar o child; nem a entrada do modelo nem o request do handler podem sobrescrevê-las.
- P0 não adiciona campo `replyTo` nem mantém uma máquina de estados oculta de "precisa ter recebido antes alguma SendMessage para poder responder"; a ferramenta permite responder ao coordinator e também permite um breve relatório de progresso proativo.
- O sucesso da ferramenta significa apenas que a mensagem entrou de forma síncrona na fila de commands do runtime pai, e não que o modelo pai já leu ou respondeu.
- O carrier visível ao provider no lado pai é um synthetic input de role user, `visibility: "model-only"`, `source: "subagent_message"`.
- O conteúdo da mensagem no lado pai usa `<subagent-message>`, não pode se disfarçar de entrada real de usuário e não pode reutilizar `<task-notification>`.
- Com o pai active, o primeiro model step não lê runtime commands; apenas os model steps seguintes leem uma vez um snapshot de commands antes do compact／prepare da requisição e mesclam nele os `task-notification` / `subagent-message` contidos. Respostas que chegam depois do snapshot ficam para o step seguinte ou para a fila externa, sem uma segunda varredura antes da requisição de provider. Quando o pai está ocioso, o runtime command queue faz o wake serialmente. É proibido adicionar uma nova entrada concorrente `executeTurnCommand()`.
- `subagent-message` não dispara a continuação de goal pós-command exclusiva de background task; um goal já ativo continua seguindo a semântica de turno comum existente.
- O child não é interrompido enquanto executa um lote de ferramentas; a mensagem continua sendo consumida pelo drain de steer existente após a conclusão daquele lote e antes da próxima requisição de modelo do child.
- `RespondToCoordinator` pode entrar no mesmo parallel group junto com ferramentas concurrent-safe como `Read`, `Glob`, `Grep`; não se pode afrouxar as regras de segurança do scheduler para forçar paralelismo real com `Bash`, `Write`, `Edit`.
- O tool result, tanto no caso de enqueue bem-sucedido quanto de falha, deve lembrar o child de continuar a tarefa original, a menos que o coordinator tenha explicitamente mudado ou encerrado o objetivo; o resultado final da task continua sendo retornado pelo assistant final／Agent completion comum.
- A ferramenta mantém `readOnly: false`, `sideEffectScope: "session"`. Para o Plan mode, adicione uma capability estreita `allowedInPlanMode`; ela só pode permitir ações de controle session-local não destrutivas e sem necessidade de aprovação, e não pode contornar o disallow global, o project deny ou o project ask.
- A orientação de resposta deve ficar apenas em `RespondToCoordinator.metadata.modelInstructions`. Não se deve injetar incondicionalmente um nome de ferramenta que talvez não exista no common system prompt de todos os children.
- `subagent_message`, além da lista e do título de mensagens comuns, também não pode entrar no resumo de histórico visível ao usuário de `ReadSessionContext`.
- P0 mantém o child tool-event mirror existente: `RespondToCoordinator` pode ser exibido como um bloco de ferramenta child aninhado dentro do card do Agent pai para observação; apenas o carrier sintético de resposta precisa ser proibido de aparecer como um bubble de usuário de nível superior.
- Não se adiciona nenhum método RPC de app para agent. Atualiza-se apenas o runtime schema de `packages/shared/src/zcode-protocol/index.ts` para a nova synthetic source.
- Desktop `desktop-continuous` e celular `web-remote-replayable` continuam compartilhando o mesmo host／agent runtime; neste ciclo o E2E prova apenas o caminho principal desktop, e os testes unitários de protocol／visibility compartilhados provam que o payload replayable não é rejeitado pelo schema nem renderizado como bubble de usuário.
- Não se modifica a identidade do workspace, o path do workspace, o roteamento de sessão remota ou a semântica da fila de commands do client.
- Novos funcionalidades devem ser especificadas primeiro com spec e case／matrix, e só depois a implementação.
- Comentários sobre a causa de novos bugs ou sobre ordenação de runtime não óbvia devem ser escritos em chinês.
- Ao final é obrigatório rodar `pnpm typecheck` e `pnpm lint`.
- O workspace atual pode conter alterações não commitadas do usuário. Durante a execução é proibido reverter, sobrescrever ou commitar de passagem mudanças não relacionadas; antes de commitar é obrigatório verificar o conjunto de arquivos staged.

---

## Critérios de Aceitação

- [ ] As ferramentas main visíveis ao provider com capacidade de subagent messaging incluem o `SendMessage` existente e não incluem `RespondToCoordinator`.
- [ ] Quando a coordinator port existe e não está desabilitada globalmente, as ferramentas child visíveis ao provider de Explore, general-purpose e custom incluem `RespondToCoordinator` e não incluem o `SendMessage` completo; quando a port está ausente ou desabilitada globalmente, a ferramenta e a orientação correspondente não existem.
- [ ] Mesmo que uma coordinator port seja injetada por engano no runtime main, `RespondToCoordinator` não é exposta; o main continua expondo `SendMessage`.
- [ ] O profile allowlist do Explore e a projeção posterior de `EXPLORE_AGENT_ALLOWED_TOOLS` não removem novamente essa tool de controle do child, cobrindo os dois ramos direct／embedded-search.
- [ ] Um child em Plan-mode pode chamar `RespondToCoordinator`, e a ferramenta continua não read-only; disallow global e project deny／ask continuam com prioridade.
- [ ] Depois de receber `Message from coordinator: <summary>`, o child pode produzir `RespondToCoordinator` e a próxima chamada de ferramenta de trabalho no mesmo assistant model step.
- [ ] O tool result de `RespondToCoordinator` diz "queued" e não "read/replied", e lembra o child de continuar a tarefa atual.
- [ ] O tool result de falha de enqueue também lembra explicitamente o child de continuar a tarefa atual; P0 não promete entrega durável após a destruição do processo pai.
- [ ] Com o pai active, `<subagent-message>` entra na próxima requisição de provider do pai junto com os tool results atuais, e o número máximo de requisições de modelo concorrentes do pai continua sendo 1.
- [ ] Quando o turno active do pai já não tem roundtrip seguinte, o command fica na fila externa e um turno model-only independente é iniciado após o término desse turno.
- [ ] Quando o pai está ocioso, o command de resposta inicia automaticamente um turno model-only.
- [ ] A mensagem sintética é preservada no session store do pai, mas é invisível na lista comum de mensagens de usuário, na entrada de título e nas mensagens de nível superior da UI.
- [ ] Após o hydrate da sessão, `subagent_message` ainda é restaurado como provider input direto user-like, sem ser embrulhado no antigo `queued_system_notification`.
- [ ] O command de resposta do child e a notificação de Agent completion subsequente são ambos `priority: "next"`, consumidos na ordem de enqueue; é permitido mesclar na mesma requisição de provider e também entrar em requisições adjacentes, mas a primeira posição visível ao provider da resposta deve ser anterior à notificação de completion.
- [ ] Quando a coordinator port está ausente, a ferramenta não é registrada; uma chamada manual anormal retorna um configuration error claro.
- [ ] O escape do conteúdo XML está completo e o limite de entrada de 20.000 caracteres tem efeito.
- [ ] O bubble de usuário sintético de nível superior é invisível; sob o mirror existente o bloco de ferramenta child aninhado `RespondToCoordinator` é visível e não encerra a Agent task.
- [ ] `BG07` continua provando apenas o steer main-to-child; o novo `BG25` prova separadamente a resposta child-to-main e a continuação do child.

## Baseline do Comportamento Atual

```text
main model
  -> SendMessage({ to, summary, message })
  -> SubagentPort.sendMessage()
  -> RuntimeTaskMessageSink.send()
  -> childRuntime.steerTurn()
  -> activeTurn.pendingInputs
  -> current child tool batch completes
  -> drainPendingInput()
  -> provider sees "Message from coordinator: ..."
```

Fatos-chave atuais:

- `apps/zcode-cli/packages/core/src/subagent/message-steering.ts` já cuida do texto do coordinator e do steer do child.
- `apps/zcode-cli/packages/core/src/runtime/methods/turn-loop.ts` faz o drain do steer e dos runtime commands do active loop antes da próxima requisição de modelo.
- `apps/zcode-cli/packages/core/src/runtime/methods/runtime-command-queue.ts` já cuida da execução serial dos commands e do wake quando ocioso.
- `apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts` atualmente trata apenas da persistência de task notification e da entrada no active loop.
- `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts` é o ponto de montagem do child runtime, do tool allowlist e do closure do pai.
- `apps/zcode-cli/packages/core/src/tool/scheduler.ts` já decide o agrupamento de execução de ferramentas com base em `concurrentSafe`; esta funcionalidade não modifica o algoritmo de agendamento.

## Fluxo de Dados Alvo

```text
child provider response
  -> RespondToCoordinator({ summary, message })
  -> CoordinatorResponsePort.respond()
  -> authoritative child identity is attached by runtime closure
  -> parent.enqueueSubagentMessage()
  -> RuntimeCommandQueue.enqueue(mode = "subagent-message", priority = "next")
  -> parent active: active-loop intake persists before next provider request
  -> parent idle: outer command drain persists and executes model-only turn
  -> parent provider sees <subagent-message>...</subagent-message>
```

Payload visível ao provider:

```xml
<subagent-message>
<agent-id>agent_xxx</agent-id>
<agent-type>Explore</agent-type>
<summary>已完成权限入口检查</summary>
<message>目前定位到两个调用点，正在继续核对异常路径。</message>
</subagent-message>
```

## Estrutura de Arquivos

### Novos arquivos

| File                                                                                                                                | Responsibility                                                                  |
| ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `docs/subagent-respond-to-coordinator.md`                                                                                           | Spec source-of-truth com a semântica de produto, limites de estado, não objetivos e critérios de aceitação |
| `apps/zcode-cli/packages/contracts/src/tools/respond-to-coordinator.ts`                                                             | Schemas de entrada／saída em runtime da ferramenta e constantes                    |
| `apps/zcode-cli/packages/contracts/src/interfaces/coordinator-response.port.ts`                                                     | Porta estreita da ferramenta do child para o runtime pai                          |
| `apps/zcode-cli/packages/core/src/tool/handlers/respond-to-coordinator.ts`                                                          | Metadata visível ao provider, handler e formatação do resultado para o modelo      |
| `apps/zcode-cli/packages/core/src/subagent/coordinator-response.ts`                                                                 | Liga a identidade autoritativa do child e entrega a resposta estruturada ao callback de enqueue do pai |
| `apps/zcode-cli/packages/core/src/runtime/methods/subagent-messages.ts`                                                             | Enqueue de command no pai, formatação XML e persistência                         |
| `apps/zcode-cli/packages/core/src/runtime/methods/runtime-command-active-loop.ts`                                                   | Entrada unificada do active loop para os tipos de command permitidos               |
| `apps/zcode-cli/packages/contracts/tests/respond-to-coordinator.test.ts`                                                            | Testes de fronteira de schema                                                     |
| `apps/zcode-cli/packages/core/tests/runtime-tool-allowlist.test.ts`                                                                 | Testes de projeção do allowlist built-in final de Explore／custom child           |
| `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-respond-to-coordinator.test.ts`                       | Spec formal BG25 independente, com context window normal                          |
| `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-subagent-respond-to-coordinator.json`        | Fixture de replay de provider local ao case do BG25                              |
| `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-subagent-respond-to-coordinator.json`           | Manifest de replay do BG25                                                        |

### Arquivos modificados

| File                                                                           | Change                                                                            |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| `docs/superpowers/plans/2026-07-10-subagent-respond-to-coordinator.md`         | Este plano executável, entra no controle de versão na Phase 0                      |
| `docs/conversation-session-case-catalog.md`                                    | Novo case accepted BG25                                                           |
| `docs/testing/conversation-session-background-e2e-coverage-matrix.md`          | Nova dimensão response channel e status planned／covered                         |
| `docs/testing/conversation-session-e2e-coverage-matrix.md`                     | Registro do BG25                                                                  |
| Documento de auditoria de diferenças históricas (já removido)                 | Marcado como narrow extension do ZCode, sem reportar como capacidade completa de Agent Teams |
| `apps/zcode-cli/packages/contracts/src/tools/index.ts`                         | Exporta o contrato da ferramenta                                                   |
| `apps/zcode-cli/packages/contracts/src/index.ts`                               | Exporta a coordinator port                                                        |
| `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts`       | Adiciona a synthetic source `subagent_message`                                    |
| `packages/shared/src/zcode-protocol/index.ts`                                  | Aceita a source／inputSource `subagent_message`                                   |
| `apps/zcode-cli/packages/core/src/tool/handlers/index.ts`                      | Registra a ferramenta child-only                                                   |
| `apps/zcode-cli/packages/core/src/tool/types.ts`                               | ToolExecutionContext ganha a coordinator port e a capability `allowedInPlanMode`  |
| `apps/zcode-cli/packages/core/src/tool/executor/types.ts`                      | Options／deps do executor ganha a coordinator port                                 |
| `apps/zcode-cli/packages/core/src/tool/executor/impl.ts`                       | Repassa a coordinator port                                                        |
| `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`                | Coloca a coordinator port no contexto do handler                                   |
| `apps/zcode-cli/packages/core/src/permission/service.ts`                       | Permite a capability explícita de session em Plan mode após os deny／ask já existentes |
| `apps/zcode-cli/packages/core/src/runtime/types.ts`                            | AgentRuntimeDeps ganha a coordinator port                                          |
| `apps/zcode-cli/packages/core/src/runtime/command-queue.ts`                    | Adiciona `SubagentMessageRuntimeCommand`                                           |
| `apps/zcode-cli/packages/core/src/runtime/internal-methods.ts`                 | Declara os métodos de enqueue／persist intake                                      |
| `apps/zcode-cli/packages/core/src/runtime/methods/index.ts`                    | Liga os novos runtime methods                                                      |
| `apps/zcode-cli/packages/core/src/runtime/helpers/runtime-tools.ts`            | Registra a ferramenta condicionalmente e repassa a port                            |
| `apps/zcode-cli/packages/core/src/runtime/helpers/tool-allowlist.ts`           | Preserva a tool de controle do child após a interseção final do Explore           |
| `apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts` | Remove o drain genérico do active loop e mantém a lógica exclusiva de task notification |
| `apps/zcode-cli/packages/core/src/runtime/methods/runtime-command-queue.ts`    | Executa o command `subagent-message` quando ocioso                               |
| `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`                 | Tool allowlist do child e wiring da coordinator port                               |
| `apps/zcode-cli/packages/core/src/agent/session-history-hydrator.ts`           | Restaura o metadata user-like de `subagent_message`                                |
| `apps/zcode-cli/packages/core/src/runtime/helpers/runtime-reminders.ts`        | Mapeia o runtime metadata de `subagent_message`                                   |
| `apps/zcode-cli/packages/core/src/session-context/parts.ts`                    | Exclui a resposta interna do coordinator do resumo de ReadSessionContext           |
| `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`                    | Testes de exposição da tool do provider e de metadata                              |
| `apps/zcode-cli/packages/core/tests/runtime-hooks.test.ts`                     | Testes de parâmetros do handler／port e de ack                                     |
| `apps/zcode-cli/packages/core/tests/permission-service.test.ts`                | Testes de prioridade da capability de Plan mode                                   |
| `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`                 | Testes de command active／idle, ordenação e concorrência única                    |
| `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`                  | Testes de superfície de tool do child, mensagens bidirecionais e continuar trabalhando |
| `apps/zcode-cli/packages/core/tests/scheduler.test.ts`                         | Regressão da fronteira de agrupamento concurrent-safe                               |
| `apps/zcode-cli/packages/core/tests/session-history-hydrator.test.ts`          | Testes de semântica de hydrate                                                     |
| `apps/zcode-cli/packages/core/tests/read-session-context-tool.test.ts`         | Resposta model-only do coordinator não entra no session context                    |
| `packages/shared/test/zcodeProtocol.test.ts`                                   | Testes de parsing de source do protocol                                           |
| `packages/shared/src/zcode-session-visible-content.ts`                         | Adiciona o fallback de visibilidade source-only para `subagent_message`            |
| `packages/shared/test/zcodeSessionVisibleContent.test.ts`                      | Testes de que mensagens model-only são invisíveis                                  |
| `docs/design/v2/tool/00-tool-change-chain.md`                                  | Registra a semântica estreita de `allowedInPlanMode` e a proibição de se disfarçar de read-only |
| `scripts/test-desktop-e2e-container.sh`                                        | Inclui a spec formal BG25 no preset verified após o admission Docker               |
| `docs/testing/conversation-session-docker-automation-plan.md`                  | Registro de admissão da ferramenta de admission Docker                             |

## Checklist de Phases

- [ ] Phase 0：travar spec, case e não objetivos
- [ ] Phase 1：estabelecer contracts, protocol source e a porta estreita
- [ ] Phase 2：implementar a tool child-only e o wiring do executor
- [ ] Phase 3：implementar o runtime command `subagent-message` do pai
- [ ] Phase 4：conectar o child runtime, a guidance com escopo de tool e o comportamento de continuação
- [ ] Phase 5：completar persistence, hydrate, ordering e ramos de falha
- [ ] Phase 6：concluir a spec formal BG25 independente, o fixture e o E2E de replay
- [ ] Phase 7：executar a verificação completa, revisar o diff e commitar

## Rastreabilidade da Aceitação

| Concern                                              | Implementation proof                                | Behavioral proof                                               |
| ---------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------- |
| exposição child-only / port ausente / disallow global | gate de registro da Phase 2 + allowlist final da Phase 4 | `tool-contracts`、`runtime-tool-allowlist`、`subagent-explore` |
| Plan mode sem fingir read-only                     | capability `allowedInPlanMode` da Phase 2             | `permission-service` + integração real do executor             |
| serialização active／idle／terminal-race            | runtime command da Phase 3 + intake do active loop     | `runtime-tool-loop`, incluindo max model concurrency = 1       |
| identidade autoritativa / falha de enqueue         | port ligada por closure na Phase 4                    | casos negativos de contrato + teste de falha do adapter        |
| resposta no mesmo step + trabalho contínuo do child | wiring do child e metadata concurrent-safe na Phase 4  | integração do child + regressão do scheduler                   |
| FIFO entre requisições mescladas／separadas        | ordem de command `priority: "next"` nas Phases 3／5   | testes de ordenação `(requestIndex, contentIndex)`             |
| persistence／hydrate／visibility                   | protocol source da Phase 1 + mapeamentos da Phase 5    | visibilidade／título compartilhado, hydrate, testes de ReadSessionContext |
| caminho real de provider／UI                        | BG25 na Phase 6                                      | capture, replay isolated／default, admission Docker            |

---

## Phase 0：Spec e fronteira de cobertura

### Task 1：escrever a feature spec e registrar o BG25

**Files:**

- Modify: `docs/superpowers/plans/2026-07-10-subagent-respond-to-coordinator.md`
- Create: `docs/subagent-respond-to-coordinator.md`
- Modify: `docs/conversation-session-case-catalog.md`
- Modify: `docs/testing/conversation-session-background-e2e-coverage-matrix.md`
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Modify: documento de auditoria de diferenças históricas (já removido)

**Interfaces:**

- Consumes: as Restrições Globais, os Critérios de Aceitação e o Fluxo de Dados Alvo deste plano.
- Produces: a semântica formal de produto usada pela implementação e pelo E2E; id de case estável `BG25`.

- [ ] **Step 0：confirmar o baseline de execução e os limites do workspace**

Run:

```bash
git rev-parse HEAD
git status --short
```

Expected: HEAD é `e458e18b902a467251153972688ca8461eb5a418` e, além deste plano, não há mudanças não identificadas. Se o HEAD for diferente, revise o drift do branch e atualize o `Execution Baseline`; se houver mudanças do usuário, registre os caminhos e exclua-os em cada gate de staged-path posterior.

- [ ] **Step 1：criar a feature spec**

`docs/subagent-respond-to-coordinator.md` precisa ser escrito por inteiro com o seguinte conteúdo:

```markdown
# Subagent RespondToCoordinator

## Goal

普通 subagent 收到 main 通过 SendMessage 发来的 coordinator 消息后，可以通过
RespondToCoordinator 把回复投递给父 runtime，同时继续原任务。

## Product Contract

- SendMessage 保持 main-only。
- RespondToCoordinator 保持 child-only，输入为 summary 和 message。
- runtime 绑定 child identity 和 parent route，模型不能选择目标。
- 成功只表示已进入 parent runtime command queue。
- 工具只在 child runtime 已配置 coordinator port 且未被全局禁用时出现；相关指导只随工具 description 出现。
- parent active 时在下一次合法 model request 前合流；idle 时启动 model-only turn。
- parent provider-visible payload 为 user-like <subagent-message>。
- persisted source 为 subagent_message，visibility 为 model-only。
- child final assistant text 仍表示任务最终结果；RespondToCoordinator 不结束任务。
- RespondToCoordinator 保持 readOnly=false、sideEffectScope=session；Plan mode 通过显式 allowedInPlanMode capability 放行，且不绕过 disallow/project deny/project ask。
- synthetic reply 不显示为顶层 user message，也不参与标题或 ReadSessionContext；现有 child tool mirror 可在 parent Agent card 内展示 RespondToCoordinator tool block。

## Scheduling

RespondToCoordinator concurrentSafe=true。它可以和其它 concurrent-safe 工具并行；
Bash、Write、Edit 仍遵循现有安全串行规则。模型应优先发出回复调用，并在同一
assistant step 中继续发出下一项工作工具调用。

## Failure Semantics

- coordinator port 未配置：工具不注册。
- 测试强制注册但未配置 port：handler 抛明确 configuration error。
- enqueue callback 抛错：工具返回 failed result，并明确提醒 child 继续工作。
- parent runtime/process 已销毁：当前 queue 无 disposed acknowledgement，P0 不宣称可探测该状态，也不提供 durable retry/outbox。
- 单个长时间工具未返回：child model 尚未重新获得控制，不能即时调用回复工具。

## Out Of Scope

- 完整 Agent Teams、teammate mailbox、sibling routing。
- child 侧完整 SendMessage。
- replyTo、消息已读回执、durable inbox/outbox。
- 中断正在执行的单个工具。
- 修改 scheduler 使 Bash/Write/Edit 与回复工具强制并行。
- 新增 app-to-agent RPC。
- 隐藏 parent Agent card 内已有的 child tool observability。
```

- [ ] **Step 2：adicionar o BG25 no case catalog**

Acrescente à tabela de BG:

```markdown
| BG25 | `running`，background Agent 正在长程任务中，且已收到 main 的 `SendMessage` coordinator input | child 在下一次 model step 调用 `RespondToCoordinator`，并同时继续普通工作 tool call | subagentBidirectionalCoordinatorMessage + modelOnlySyntheticInput | 回复通过 parent runtime command queue 投递；parent active 时合流、idle 时 wake；provider request 包含 `<subagent-message>`；UI 不显示真实 user 气泡；child 在回复后继续原任务并最终正常 completion | accepted |
```

- [ ] **Step 3：atualizar a coverage matrix de background e a principal**

Adicione a nova dimensão e a linha planned:

```markdown
| child response channel | RespondToCoordinator + continued work | active parent in core; idle parent in E2E | 不覆盖 sibling/teammate routing |
```

```markdown
| `BGR` | `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-respond-to-coordinator.test.ts` |

| BG25 | planned | BGR、RT | BGR 验证 SendMessage -> RespondToCoordinator + continued child tool -> parent model-only `<subagent-message>` -> child completion；RT 覆盖 active/idle command intake、FIFO ordering 和单模型请求并发 |
```

- [ ] **Step 4：atualizar a auditoria de gaps históricos do subagent**

Acrescente uma scope note deixando explícito:

```markdown
RespondToCoordinator 是 ZCode 为普通 local_agent 增加的窄 child-to-parent reply channel。
它不表示已实现 Agent Teams，也不改变默认 main-only SendMessage 的语义。
```

- [ ] **Step 5：rodar a auditoria de cobertura de documentação**

Run:

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --json
```

Expected: exit code `0`, com o BG25 mapeando um para o outro entre catalog e matrix; sem id duplicado nem linha de matrix ausente.

- [ ] **Step 6：revisar o diff da Phase 0**

Run:

```bash
git add docs/superpowers/plans/2026-07-10-subagent-respond-to-coordinator.md docs/subagent-respond-to-coordinator.md docs/conversation-session-case-catalog.md docs/testing/conversation-session-background-e2e-coverage-matrix.md docs/testing/conversation-session-e2e-coverage-matrix.md docs/subagent-historical-gap-audit.md
git diff --cached --check
git diff --cached --name-only
```

Expected: sem erro de whitespace e com os cached paths sendo exatamente os seis documentos acima. Staging antes de checar é necessário porque este plano e a nova spec estão untracked no início da Phase 0 e um `git diff` comum não os veria.

- [ ] **Step 7：commitar a Phase 0**

Execute somente se nenhum desses arquivos tiver mudanças do usuário não commitadas misturadas:

```bash
git diff --cached --name-only
git commit -m "docs: specify subagent coordinator responses"
```

Expected staged paths: apenas os seis documentos acima. Se algum arquivo já tiver mudanças do usuário inseparáveis, interrompa esse commit, preserve as mudanças e liste-as nas notas de entrega.

---

## Phase 1：Contracts e Protocol

### Task 2：definir o schema RespondToCoordinator e a CoordinatorResponsePort

**Files:**

- Create: `apps/zcode-cli/packages/contracts/src/tools/respond-to-coordinator.ts`
- Create: `apps/zcode-cli/packages/contracts/src/interfaces/coordinator-response.port.ts`
- Create: `apps/zcode-cli/packages/contracts/tests/respond-to-coordinator.test.ts`
- Modify: `apps/zcode-cli/packages/contracts/src/tools/index.ts`
- Modify: `apps/zcode-cli/packages/contracts/src/index.ts`
- Modify: `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts`
- Modify: `packages/shared/src/zcode-protocol/index.ts`
- Modify: `packages/shared/test/zcodeProtocol.test.ts`

**Interfaces:**

- Consumes: a entrada `{ summary, message }` fixada na spec e a semântica de enqueue síncrono.
- Produces:

```ts
export const RESPOND_TO_COORDINATOR_TOOL_NAME = "RespondToCoordinator";
export interface CoordinatorResponsePort {
  respond(request: CoordinatorResponseRequest): CoordinatorResponseResult;
}
```

- [ ] **Step 1：escrever primeiro os testes de contracts que falham**

Crie `apps/zcode-cli/packages/contracts/tests/respond-to-coordinator.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  RESPOND_TO_COORDINATOR_MAX_CONTENT_CHARS,
  RespondToCoordinatorInputSchema,
  RespondToCoordinatorOutputSchema,
} from "../src/index.js";

describe("RespondToCoordinator contract", () => {
  it("accepts summary and message only", () => {
    expect(
      RespondToCoordinatorInputSchema.parse({
        summary: "进度更新",
        message: "已完成入口定位，正在验证异常路径。",
      }),
    ).toEqual({
      summary: "进度更新",
      message: "已完成入口定位，正在验证异常路径。",
    });
    expect(() =>
      RespondToCoordinatorInputSchema.parse({
        to: "agent_parent",
        summary: "进度更新",
        message: "继续检查。",
      }),
    ).toThrow();
  });

  it("enforces content limits", () => {
    expect(() => RespondToCoordinatorInputSchema.parse({ summary: "", message: "x" })).toThrow();
    expect(() =>
      RespondToCoordinatorInputSchema.parse({
        summary: "x",
        message: "x".repeat(RESPOND_TO_COORDINATOR_MAX_CONTENT_CHARS + 1),
      }),
    ).toThrow();
  });

  it("keeps provider-private routing fields out of runtime output", () => {
    expect(
      RespondToCoordinatorOutputSchema.parse({
        status: "success",
        responseId: "response_1",
        message: "Response queued for the coordinator.",
      }),
    ).toMatchObject({ status: "success", responseId: "response_1" });

    for (const routingField of ["agentId", "childSessionId", "parentSessionId", "to"]) {
      expect(() =>
        RespondToCoordinatorOutputSchema.parse({
          status: "success",
          responseId: "response_1",
          message: "Response queued for the coordinator.",
          [routingField]: "model_supplied_route",
        }),
      ).toThrow();
    }
  });
});
```

- [ ] **Step 2：rodar o teste de contracts e confirmar que falha primeiro**

Run:

```bash
pnpm --filter @zcode/contracts exec vitest run tests/respond-to-coordinator.test.ts
```

Expected: FAIL, indicando que exports como `RespondToCoordinatorInputSchema` não existem.

- [ ] **Step 3：implementar os schemas da tool**

`apps/zcode-cli/packages/contracts/src/tools/respond-to-coordinator.ts`:

```ts
import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const RESPOND_TO_COORDINATOR_TOOL_NAME = "RespondToCoordinator";
export const RESPOND_TO_COORDINATOR_MAX_CONTENT_CHARS = 20_000;

export const RespondToCoordinatorInputSchema = z
  .object({
    summary: z.string().min(1).max(200).describe("Short summary of the response."),
    message: z
      .string()
      .min(1)
      .max(RESPOND_TO_COORDINATOR_MAX_CONTENT_CHARS)
      .describe("Response or progress update for the coordinator."),
  })
  .strict();

export type RespondToCoordinatorInput = z.infer<typeof RespondToCoordinatorInputSchema>;
export const RespondToCoordinatorInputJsonSchema = toToolJsonSchema(
  RespondToCoordinatorInputSchema,
);

export const RespondToCoordinatorOutputSchema = z
  .object({
    status: z.enum(["success", "failed"]),
    responseId: z.string(),
    message: z.string(),
    error: z.string().optional(),
  })
  .strict();

export type RespondToCoordinatorOutput = z.infer<typeof RespondToCoordinatorOutputSchema>;
```

- [ ] **Step 4：implementar a porta estreita síncrona**

`apps/zcode-cli/packages/contracts/src/interfaces/coordinator-response.port.ts`:

```ts
import type { TraceContext } from "../tracing/tracer.js";
import type { ToolCallId } from "./shared.js";

export interface CoordinatorResponseRequest {
  childToolCallId: ToolCallId | string;
  summary: string;
  message: string;
  trace: TraceContext;
}

export interface CoordinatorResponseResult {
  status: "success" | "failed";
  responseId: string;
  message: string;
  error?: string;
}

export interface CoordinatorResponsePort {
  // child session/agent/parent identity 由 port closure 绑定；request 只携带 handler 生成的数据。
  // 同步返回确保 response command 已进入父队列后，child tool result 才能完成。
  respond(request: CoordinatorResponseRequest): CoordinatorResponseResult;
}
```

`SessionId` não é mais importado por `CoordinatorResponseRequest`; a identidade da sessão do child é fixada em `CreateCoordinatorResponsePortOptions` na Phase 4, evitando que o handler ou chamadores posteriores tratem identity como um campo roteável.

Exporte `./respond-to-coordinator.js` em `tools/index.ts` e `./interfaces/coordinator-response.port.js` no `index.ts` raiz dos contracts.

- [ ] **Step 5：adicionar a synthetic source e o schema do protocol**

Acrescente a mesma string nas duas enumerações:

```ts
"subagent_message",
```

Locais de alteração:

- `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts`
- `packages/shared/src/zcode-protocol/index.ts`

Em `packages/shared/test/zcodeProtocol.test.ts`, acrescente asserções de parsing bem-sucedido de `subagent_message` no payload de user message e de TurnStarted.

- [ ] **Step 6：rodar os testes focados**

Run:

```bash
pnpm --filter @zcode/contracts exec vitest run tests/respond-to-coordinator.test.ts
pnpm exec vitest run packages/shared/test/zcodeProtocol.test.ts
```

Expected: PASS.

- [ ] **Step 7：rodar o typecheck de contracts／shared**

Run:

```bash
pnpm --filter @zcode/contracts typecheck
pnpm exec tsc -p packages/shared/tsconfig.json --noEmit
```

Expected: as duas comandos com exit code `0`.

- [ ] **Step 8：commitar a Phase 1**

```bash
git add apps/zcode-cli/packages/contracts/src/tools/respond-to-coordinator.ts apps/zcode-cli/packages/contracts/src/interfaces/coordinator-response.port.ts apps/zcode-cli/packages/contracts/src/tools/index.ts apps/zcode-cli/packages/contracts/src/index.ts apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts apps/zcode-cli/packages/contracts/tests/respond-to-coordinator.test.ts packages/shared/src/zcode-protocol/index.ts packages/shared/test/zcodeProtocol.test.ts
git diff --cached --name-only
git commit -m "feat(cli): define subagent coordinator response contracts"
```

Expected staged paths: apenas os arquivos da Phase 1.

---

## Phase 2：superfície de tool child-only

### Task 3：implementar o handler RespondToCoordinator e a injeção de dependências

**Files:**

- Create: `apps/zcode-cli/packages/core/src/tool/handlers/respond-to-coordinator.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/handlers/index.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/impl.ts`
- Modify: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
- Modify: `apps/zcode-cli/packages/core/src/permission/service.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/runtime-tools.ts`
- Modify: `apps/zcode-cli/packages/core/tests/tool-contracts.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/runtime-hooks.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/permission-service.test.ts`
- Modify: `docs/design/v2/tool/00-tool-change-chain.md`

**Interfaces:**

- Consumes: `CoordinatorResponsePort`, schemas de entrada／saída da tool.
- Produces: `respondToCoordinatorToolEntry`; `ToolExecutionContext.coordinatorResponsePort`; flag condicional de registro `includeRespondToCoordinator`; capability de permissão `allowedInPlanMode` que não finge ser read-only.

- [ ] **Step 1：escrever primeiro os testes de exposição de tool que falham**

Acrescente em `tool-contracts.test.ts`:

```ts
it("only exposes RespondToCoordinator when coordinator response is configured", () => {
  const defaultRegistry = createToolRegistry();
  registerBuiltInTools(defaultRegistry);

  const childRegistry = createToolRegistry();
  registerBuiltInTools(childRegistry, { includeRespondToCoordinator: true });

  expect(defaultRegistry.has("RespondToCoordinator")).toBe(false);
  expect(childRegistry.has("RespondToCoordinator")).toBe(true);
  expect(childRegistry.get("RespondToCoordinator")?.metadata).toMatchObject({
    allowedInPlanMode: true,
    concurrentSafe: true,
    needsApproval: false,
    readOnly: false,
    sideEffectScope: "session",
  });
});
```

Asserte também:

- o schema de entrada do provider tem apenas `summary` e `message`, e o schema de saída do provider tem apenas `success` e `message`;
- a descrição do provider contém a dica de disparo exata `Message from coordinator:`, a instrução de chamar a ferramenta de resposta em vez de usar texto de assistant, e a instrução de continuar a tarefa original após responder;
- a descrição não existe nos contracts de registry／provider de ferramentas não registradas, provando que não há orientação residual no common prompt;
- `disallowedTools: ["RespondToCoordinator"]` remove a ferramenta finalmente mesmo quando combinado com `includeRespondToCoordinator: true`.

- [ ] **Step 2：escrever primeiro o teste de handler que falha**

Em `runtime-hooks.test.ts`, construa um spy de `CoordinatorResponsePort` e chame através do tool executor:

```ts
{
  id: "call_respond_to_coordinator",
  name: "RespondToCoordinator",
  input: {
    summary: "权限链路进度",
    message: "已完成入口检查，继续验证异常路径。",
  },
}
```

Asserte que a port recebeu `childToolCallId`, `summary`, `message` e trace, e que o request não contém `childSessionId`, `agentId` nem rota do pai; asserte que o tool result contém `queued for the coordinator` e `Continue the current task`.

Acrescente mais dois ramos:

1. Registrar a ferramenta à força sem dar a coordinator port ao executor; após a chamada, asserte que o texto de `ConfigurationError` é `Coordinator response port is not configured for RespondToCoordinator`.
2. A port retorna `{ status: "failed", responseId: "response_failed", message: "Response failed to queue.", error: "injected enqueue failure" }`; asserte que o resultado visível ao provider contém simultaneamente a causa da falha e `Continue the current task`.

Por fim, faça o `getMode()` do executor retornar `plan`, chame uma vez usando a tool entry real e a port já configurada e asserte que a chamada chega à port com sucesso sem passar pelo permission broker. Essa asserção de integração prova que a capability metadata -> permission-flow -> PermissionService não se perdeu no repasse.

- [ ] **Step 3：escrever primeiro os testes de capability de Plan mode que falham**

Em `permission-service.test.ts`, defina uma capability de resposta com `allowedInPlanMode: true`, `readOnly: false`, `sideEffectScope: "session"`, `destructive: false`, `needsApproval: false` e cubra:

```text
plan + explicit session capability -> allow / mode.plan.explicitSessionCapability
plan + 同一 capability + global disallow -> deny / rule.disallowedTools
plan + 同一 capability + project deny -> deny / rule.project.deny
plan + 同一 capability + project ask -> ask / rule.project.ask
plan + 非只读 session capability 但没有 allowedInPlanMode -> deny / mode.plan.nonReadOnly
plan + allowedInPlanMode 但 destructive/needsApproval/非 session -> deny / mode.plan.nonReadOnly
```

Essas asserções fixam a prioridade: a nova capability não pode contornar políticas explícitas já existentes.

- [ ] **Step 4：rodar os testes e confirmar que falham primeiro**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/tool-contracts.test.ts tests/runtime-hooks.test.ts -t "RespondToCoordinator"
pnpm --filter @zcode/core exec vitest run tests/permission-service.test.ts -t "explicit session capability|non-read-only session"
```

Expected: FAIL, pois a tool ainda não foi registrada, o context não tem a port e a capability de permissão ainda não existe.

- [ ] **Step 5：implementar a capability de Plan mode sem modificar a semântica de read-only

Acrescente os campos opcionais, um a um:

```ts
allowedInPlanMode?: boolean;
```

Locais de alteração:

- `ToolMetadata`
- `ToolRuntimePermissionCapability`
- `PermissionToolCapability`
- `ResolvedPermissionCapability`
- `PermissionService.resolveCapability()`

`checkPlanMode()` mantém os ramos existentes de read-only e MCP não destrutivo e ganha, antes do deny genérico:

```ts
if (
  capability.allowedInPlanMode &&
  capability.sideEffectScope === "session" &&
  !capability.destructive &&
  !capability.needsApproval
) {
  return this.allow(
    context,
    capability,
    "mode.plan.explicitSessionCapability",
    "Plan mode allows this explicit non-destructive session control action",
  );
}
```

Não altere a ordem existente em `checkPermission()`: global disallow, project deny e project ask precisam continuar antes de `checkPlanMode()`. Não marque `RespondToCoordinator` nem outra mutação de session como `readOnly: true`.

- [ ] **Step 6：implementar o handler**

`respond-to-coordinator.ts` deve seguir o padrão de separação de saída provider／runtime de `send-message.ts`:

```ts
const respondToCoordinatorHandler: ToolHandler = async (input, context) => {
  const parsed = RespondToCoordinatorInputSchema.parse(input);
  if (context.runtimeScope !== "subagent" || !context.coordinatorResponsePort) {
    throw createCoreError(
      CoreErrorType.ConfigurationError,
      "Coordinator response port is not configured for RespondToCoordinator",
      {
        context: {
          toolCallId: context.toolCallId,
          toolName: RESPOND_TO_COORDINATOR_TOOL_NAME,
        },
        recoverable: false,
      },
    );
  }

  return context.coordinatorResponsePort.respond({
    childToolCallId: context.toolCallId,
    summary: parsed.summary,
    message: parsed.message,
    trace: context.traceContext ?? {
      traceId: context.traceId,
      spanId: context.spanId,
      parentSpanId: context.parentSpanId,
      sessionId: context.sessionId,
      turnId: context.turnId,
    },
  });
};
```

O schema de saída visível ao provider e o formatter ficam fixos como:

```ts
const RESPOND_TO_COORDINATOR_PROVIDER_OUTPUT_SCHEMA = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  properties: {
    success: { type: "boolean" },
    message: { type: "string" },
  },
  required: ["success", "message"],
  additionalProperties: false,
};

function formatRespondToCoordinatorModelContent(output: unknown): string {
  const result = RespondToCoordinatorOutputSchema.parse(output);
  const continuation =
    "Continue the current task unless the coordinator explicitly changed or ended it.";
  if (result.status === "success") {
    return `Response ${result.responseId} was queued for the coordinator. ${continuation}`;
  }
  return `Response ${result.responseId} failed to queue for the coordinator: ${result.error ?? result.message}. ${continuation}`;
}
```

O metadata precisa conter:

```ts
{
  name: RESPOND_TO_COORDINATOR_TOOL_NAME,
  description: "Respond to the coordinator that owns this subagent.",
  modelInstructions: [
    'When you receive an input beginning with "Message from coordinator:", use this tool to answer it.',
    "Use this tool for a concise response or progress update to the coordinator.",
    "When replying while work remains, do not use assistant text as the reply.",
    "Place this call before or alongside the next work tool call when possible.",
    "Continue the current task unless the coordinator explicitly changed or ended it.",
    "Do not use this tool as a substitute for the final task result.",
  ],
  allowedInPlanMode: true,
  readOnly: false,
  destructive: false,
  concurrentSafe: true,
  timeoutMs: 10_000,
  maxOutputBytes: 4_096,
  sideEffectScope: "session",
  riskLevel: "low",
  needsApproval: false,
}
```

O restante da contract policy do ToolEntry fica fixo como:

```ts
{
  permission: {
    permission: "agent.message.respond",
    reason: "RespondToCoordinator writes a message to the parent runtime queue",
    riskLevel: "low",
    sideEffectScope: "session",
    needsApproval: false,
    patternSources: ["toolName", "input"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 4_096,
    maxModelBytes: 4_096,
    strategy: "truncate",
    preview: { maxBytes: 4_096, direction: "head" },
  },
  timeout: {
    defaultMs: 10_000,
    maxMs: 10_000,
    allowCallOverride: false,
  },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "RespondToCoordinator was cancelled before delivery status returned",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
}
```

Conteúdo de modelo em caso de sucesso:

```text
Response <responseId> was queued for the coordinator. Continue the current task unless the coordinator explicitly changed or ended it.
```

- [ ] **Step 7：repassar a coordinator port**

Acrescente os campos opcionais, um a um:

```ts
coordinatorResponsePort?: CoordinatorResponsePort;
```

Cadeia de alteração:

```text
AgentRuntimeDeps
  -> initializeRuntimeTooling/createToolExecutor
  -> ToolExecutorOptions/ToolExecutorDeps
  -> call-runner ToolExecutionContext
  -> RespondToCoordinator handler
```

`registerRuntimeBuiltInTools()` usa:

```ts
includeRespondToCoordinator:
  runtime.config.taskType === "subagent_child" &&
  Boolean(deps.coordinatorResponsePort),
```

Assim o runtime main não consegue registrar a tool mesmo que os testes injetem a port por engano. A checagem `runtimeScope === "subagent"` do handler é mantida como defesa em profundidade.

- [ ] **Step 8：registrar a ferramenta condicionalmente

Em `handlers/index.ts`, importe `respondToCoordinatorToolEntry` e inclua-o em `builtInTools`, senão o registry nunca percorrerá a nova tool:

```ts
import { respondToCoordinatorToolEntry } from "./respond-to-coordinator.js";

export const builtInTools: ToolEntry[] = [
  // existing entries...
  respondToCoordinatorToolEntry,
];
```

Depois acrescente `includeRespondToCoordinator?: boolean` em `RegisterBuiltInToolsOptions` e adicione o filtro em `registerBuiltInTools()`:

```ts
if (
  entry.metadata.name === RESPOND_TO_COORDINATOR_TOOL_NAME &&
  options.includeRespondToCoordinator !== true
) {
  continue;
}
```

Nesta fase não se altera o filtro genérico de allowed／disallowed; `disallowedTools` continua valendo na projeção final do registry. A Phase 4 corrige simultaneamente o profile allowlist do child e o allowlist built-in final do Explore.

- [ ] **Step 9：registrar as restrições de design da capability**

Atualize `docs/design/v2/tool/00-tool-change-chain.md`:

- `allowedInPlanMode` significa apenas que uma ação de controle session-local explícita, não destrutiva e sem necessidade de aprovação pode ser executada em Plan mode;
- isso não equivale a read-only e não permite mutação de rede／workspace;
- disallow explícito e project deny／ask continuam com prioridade;
- `RespondToCoordinator` é o primeiro usuário e as ferramentas seguintes devem passar por testes de permissão próprios.

- [ ] **Step 10：rodar os testes focados**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/tool-contracts.test.ts tests/runtime-hooks.test.ts -t "RespondToCoordinator"
pnpm --filter @zcode/core exec vitest run tests/permission-service.test.ts -t "explicit session capability|non-read-only session"
```

Expected: PASS.

- [ ] **Step 11：commitar a Phase 2**

```bash
git add apps/zcode-cli/packages/core/src/tool/handlers/respond-to-coordinator.ts apps/zcode-cli/packages/core/src/tool/handlers/index.ts apps/zcode-cli/packages/core/src/tool/types.ts apps/zcode-cli/packages/core/src/tool/executor/types.ts apps/zcode-cli/packages/core/src/tool/executor/impl.ts apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts apps/zcode-cli/packages/core/src/permission/service.ts apps/zcode-cli/packages/core/src/runtime/types.ts apps/zcode-cli/packages/core/src/runtime/helpers/runtime-tools.ts apps/zcode-cli/packages/core/tests/tool-contracts.test.ts apps/zcode-cli/packages/core/tests/runtime-hooks.test.ts apps/zcode-cli/packages/core/tests/permission-service.test.ts docs/design/v2/tool/00-tool-change-chain.md
git diff --cached --name-only
git commit -m "feat(cli): add RespondToCoordinator tool"
```

---

## Phase 3：runtime command do pai

### Task 4：implementar o intake active de subagent-message e o wake quando ocioso

**Files:**

- Create: `apps/zcode-cli/packages/core/src/runtime/methods/subagent-messages.ts`
- Create: `apps/zcode-cli/packages/core/src/runtime/methods/runtime-command-active-loop.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/command-queue.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/types.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/internal-methods.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/index.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/runtime-command-queue.ts`
- Modify: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`

**Interfaces:**

- Consumes: identidade／mensagem estruturada do child vindas do port adapter da Phase 2.
- Produces:

```ts
enqueueSubagentMessage(input: EnqueueSubagentMessageInput): undefined;
persistSubagentMessageCommand(command: SubagentMessageRuntimeCommand): Promise<MessageId>;
```

- [ ] **Step 1：escrever o teste de pai active que falha**

Adicione um teste em `runtime-tool-loop.test.ts`:

```text
parent model request #1 -> NotifyWithSubagentMessage tool
tool handler -> runtime.enqueueSubagentMessage(...)
parent model request #2 -> 必须同时看见 tool result 和 <subagent-message>
```

Asserte:

```ts
expect(modelCallCount).toBe(2);
expect(maxConcurrentModelCalls).toBe(1);
expect(secondRequestText).toContain("tool-ok");
expect(secondRequestText).toContain("<subagent-message>");
expect(secondRequestText).toContain("<agent-id>agent_progress</agent-id>");
expect(secondRequestText).toContain("继续验证异常路径");
```

- [ ] **Step 2：escrever o teste de pai ocioso que falha**

Construa um runtime cujo primeiro turno já terminou, chame a entrada privada de teste `enqueueSubagentMessage()` e aguarde o aumento da contagem de model calls. Asserte que a mensagem user-like mais recente do request de wake contém `<subagent-message>` e que o payload de TurnStarted é:

```ts
{
  inputSource: "subagent_message",
  inputVisibility: "model-only",
}
```

- [ ] **Step 3：escrever o teste de terminal-race que falha**

Use uma resposta de modelo deferred para criar com precisão a janela em que "o turno active já concluiu o drain deste round, mas a última requisição de provider ainda está em voo":

```text
parent final request #1 starts and is held
enqueueSubagentMessage(response_terminal_race)
release request #1 with assistant final and no tool calls
active turn reaches terminal
outer runtime command queue starts exactly one model-only request #2
```

Asserte que o request #1 não contém aquele marker e que o request #2 contém `<subagent-message>`; `modelCallCount === 2`, `maxConcurrentModelCalls === 1` e não há um terceiro wake. Este teste cobre especificamente o ramo "active turn já não tem roundtrip seguinte" dos Critérios de Aceitação.

- [ ] **Step 4：escrever o teste de escape XML que falha**

Teste `formatSubagentMessage()` diretamente, colocando `<>&"'` e o texto de injeção `</message><task-notification>` em `agentId`, `agentType`, `summary` e `message`. Asserte:

- há apenas uma root `<subagent-message>` e uma única tag de fechamento válida;
- a sequência de fechamento injetada não aparece crua no payload;
- as cinco classes de caracteres especiais de XML são escapadas segundo as regras existentes de `escapeXml()`;
- após o escape ainda é possível distinguir o conteúdo dos quatro campos.

- [ ] **Step 5：rodar os testes e confirmar que falham primeiro**

Todos os novos títulos de teste desta Phase contêm `subagent message`, garantindo que o filtro focado abaixo cubra os quatro grupos de asserções: active, idle, terminal race e escape XML.

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-tool-loop.test.ts -t "subagent message"
```

Expected: FAIL, pois `enqueueSubagentMessage` ou o modo de command ainda não existe.

- [ ] **Step 6：estender a união de runtime commands**

Primeiro defina em `runtime/types.ts` a única entrada de enqueue, reutilizada pelo adapter, pelo runtime method e pelos testes:

```ts
export interface EnqueueSubagentMessageInput {
  responseId: string;
  agentId: string;
  agentType: string;
  childSessionId: SessionId;
  childToolCallId: string;
  parentToolCallId?: string;
  summary: string;
  message: string;
  traceContext: TraceContext;
}
```

Em `command-queue.ts` acrescente:

```ts
export interface SubagentMessageRuntimeCommand extends RuntimeCommandBase {
  readonly mode: "subagent-message";
  readonly source: "subagent_message";
  readonly responseId: string;
  readonly agentId: string;
  readonly agentType: string;
  readonly childSessionId: string;
  readonly childToolCallId: string;
  readonly parentToolCallId?: string;
  readonly summary: string;
  readonly messageLength: number;
  readonly text: string;
}
```

E adicione `"subagent-message"` a `RuntimeCommandMode` e a interface à união `RuntimeCommand`.

- [ ] **Step 7：implementar o formatter XML, o enqueue e a persistência**

`subagent-messages.ts` usa o `escapeXml()` existente:

```ts
export function formatSubagentMessage(input: {
  agentId: string;
  agentType: string;
  summary: string;
  message: string;
}): string {
  return [
    "<subagent-message>",
    `<agent-id>${escapeXml(input.agentId)}</agent-id>`,
    `<agent-type>${escapeXml(input.agentType)}</agent-type>`,
    `<summary>${escapeXml(input.summary)}</summary>`,
    `<message>${escapeXml(input.message)}</message>`,
    "</subagent-message>",
  ].join("\n");
}
```

O enqueue usa:

```ts
this.enqueueRuntimeCommand({
  responseId: input.responseId,
  agentId: input.agentId,
  agentType: input.agentType,
  childSessionId: input.childSessionId,
  childToolCallId: input.childToolCallId,
  ...(input.parentToolCallId ? { parentToolCallId: input.parentToolCallId } : {}),
  summary: input.summary,
  messageLength: input.message.length,
  traceContext: input.traceContext,
  createdAt: new Date(),
  id: createRuntimeCommandId(),
  mode: "subagent-message",
  priority: "next",
  source: "subagent_message",
  text: formatSubagentMessage(input),
});
```

`enqueueSubagentMessage()` precisa permanecer síncrono: no retorno o command já entrou na fila; essa é a semântica completa do ack de sucesso da tool. Ele não pode chamar `executeTurnCommand()` diretamente nem abrir outra requisição de provider conforme o estado active／idle.

A persistência usa a função completa, criando e retornando o `MessageId` explicitamente:

```ts
export async function persistSubagentMessageCommand(
  this: AgentRuntimeInternal,
  command: SubagentMessageRuntimeCommand,
): Promise<MessageId> {
  await this.ensureContextInitialized(command.traceContext);
  const messageID = createMessageId();
  this.messageHistory.addUser(command.text, legacySyntheticRuntimeMetadata());
  await this.persistSyntheticUserNoticeForSession({
    messageID,
    sessionId: this.sessionId,
    source: "subagent_message",
    text: command.text,
    traceContext: command.traceContext,
    visibility: "model-only",
    metadata: {
      subagentMessage: {
        responseId: command.responseId,
        agentId: command.agentId,
        agentType: command.agentType,
        childSessionId: command.childSessionId,
        childToolCallId: command.childToolCallId,
        ...(command.parentToolCallId ? { parentToolCallId: command.parentToolCallId } : {}),
      },
    },
  });
  return messageID;
}
```

- [ ] **Step 8：extrair o intake genérico do active loop

Mova `drainPendingRuntimeCommandsForActiveLoop()` de `background-notifications.ts` para o novo arquivo `runtime-command-active-loop.ts`. Consome apenas commands da allowlist:

```ts
switch (removed.mode) {
  case "task-notification":
    if (shouldSuppressTaskNotificationRuntimeCommand.call(this, removed)) continue;
    messageId = await persistBackgroundTaskNotificationCommand.call(this, removed);
    break;
  case "subagent-message":
    messageId = await persistSubagentMessageCommand.call(this, removed);
    break;
  default:
    continue;
}
```

Na implementação, leia uma única vez um snapshot de commands com `priority <= next` apenas na fronteira do active loop com `modelStepCount > 0`, e consuma nessa ordem original do snapshot os `task-notification` / `subagent-message` contidos. O primeiro model step não lê runtime commands; após o compact, a inicialização do MCP e o prepare da requisição não há segunda varredura; commands enfileirados durante o processamento do snapshot também não entram no lote atual. `prompt` comuns e target continuation permanecem na fila externa. Commands que perderam o snapshot não são descartados nem executados concorrentemente, e ficam para o active step seguinte ou para a fila externa após o término do turno.

- [ ] **Step 9：implementar a execução do command quando ocioso**

Acrescente um ramo independente em `runRuntimeCommand()`:

```ts
if (command.mode === "subagent-message") {
  const messageId = await persistSubagentMessageCommand.call(this, command);
  await this.executeTurnCommand(command.text, undefined, {
    inputSource: "subagent_message",
    inputVisibility: "model-only",
    recordedInputMessageId: messageId,
    skipInputRecord: true,
    skipUserPromptSubmitHooks: true,
    traceContext: command.traceContext,
  });
  return;
}
```

Não chame `runPostCommandActiveTargetLoop()`; esse comportamento fica reservado a `task-notification`.

- [ ] **Step 10：usar logs debug／warn de baixa frequência

- enqueue／start／completed usam `debug`, com campos incluindo `responseId`, `agentId`, `commandId`, `queueSize`.
- falha na execução do command usa o ramo `warn` existente.
- Os logs não podem gravar o conteúdo completo de `message`, apenas `messageLength` e o valor truncado de `summary`.

- [ ] **Step 11：rodar os testes de active／idle／terminal-race**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-tool-loop.test.ts -t "subagent message"
pnpm --filter @zcode/core exec vitest run tests/runtime-tool-loop.test.ts -t "runtime task notifications before the next active tool-loop"
```

Expected: os novos testes passam; o teste existente de active loop de task notification continua passando.

- [ ] **Step 12：commitar a Phase 3**

```bash
git add apps/zcode-cli/packages/core/src/runtime/methods/subagent-messages.ts apps/zcode-cli/packages/core/src/runtime/methods/runtime-command-active-loop.ts apps/zcode-cli/packages/core/src/runtime/command-queue.ts apps/zcode-cli/packages/core/src/runtime/types.ts apps/zcode-cli/packages/core/src/runtime/internal-methods.ts apps/zcode-cli/packages/core/src/runtime/methods/index.ts apps/zcode-cli/packages/core/src/runtime/methods/background-notifications.ts apps/zcode-cli/packages/core/src/runtime/methods/runtime-command-queue.ts apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts
git diff --cached --name-only
git commit -m "feat(cli): route subagent messages through runtime commands"
```

---

## Phase 4：wiring do child runtime e continuação

### Task 5：ligar a identidade autoritativa do child à CoordinatorResponsePort

**Files:**

- Create: `apps/zcode-cli/packages/core/src/subagent/coordinator-response.ts`
- Create: `apps/zcode-cli/packages/core/tests/runtime-tool-allowlist.test.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts`
- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/tool-allowlist.ts`
- Modify: `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/scheduler.test.ts`

**Interfaces:**

- Consumes: `CoordinatorResponsePort`, `AgentRuntimeInternal.enqueueSubagentMessage()`.
- Produces: a `coordinatorResponsePort` de todos os child runtimes de produção; a tool de controle child-only forçada; um allowlist que não é removido de novo pela interseção final do Explore.

- [ ] **Step 1：escrever os testes de superfície de tool do child que falham**

Em `subagent-explore.test.ts`, inicie separadamente Explore direct, Explore embedded-search, general-purpose e um custom child com `tools: ["Read"]`, e asserte:

```ts
expect(childToolNames).toContain("RespondToCoordinator");
expect(childToolNames).not.toContain("SendMessage");
expect(childToolNames).not.toContain("Agent");
```

Continue asserindo na request main:

```ts
expect(mainToolNames).toContain("SendMessage");
expect(mainToolNames).not.toContain("RespondToCoordinator");
```

Cubra ainda quatro superfícies negativas:

```text
child config + missing coordinator port -> tool absent
child config + global toolDisallowlist -> tool absent
main config + accidentally injected coordinator port -> tool absent
tool absent -> provider tool descriptions/common system notes 均不包含 RespondToCoordinator
```

No novo `runtime-tool-allowlist.test.ts`, teste `resolveBuiltInToolAllowlist()` diretamente: o Explore child ainda contém a tool de resposta depois da interseção com `EXPLORE_AGENT_ALLOWED_TOOLS`; o Explore main não é adicionado; o allowlist explícito `Read` do custom child vira `Read + RespondToCoordinator`; e o `undefined` do child geral continua `undefined` (o que significa não aplicar filtro de allowlist built-in).

- [ ] **Step 2：escrever o teste de integração resposta + trabalho contínuo que falha**

Estenda o teste existente perto de `can SendMessage to a running background local_agent` usando a seguinte sequência de modelo roteirizado:

```text
child request #1 -> BlockingTool
main -> SendMessage
BlockingTool resolves
child request #2 sees Message from coordinator
child response #2 -> RespondToCoordinator + Read
child request #3 sees both tool results -> another normal work tool
child request #4 -> final assistant result
parent receives <subagent-message> before <task-notification>, either in one request or two
```

Asserções-chave:

```ts
expect(childSecondToolCalls.map((call) => call.name)).toEqual(["RespondToCoordinator", "Read"]);
expect(childRequests).toHaveLength(4);
expect(parentMessageText).toContain("<subagent-message>");
expect(parentMessageText).toContain("权限链路进度");
expectProviderMarkerBefore(parentRequests, "<subagent-message>", "<task-notification>");
```

`expectProviderMarkerBefore()` compara a "primeira posição visível ao provider" `(requestIndex, contentIndex)` dos markers: um request index menor significa antes; se os dois commands `priority: "next"` forem mesclados no mesmo drain do active loop, compare o content index dentro do mesmo request. Não use `parentMessageRequestIndex < parentCompletionRequestIndex` estrito, porque a mesclagem na mesma requisição é um comportamento legítimo.

- [ ] **Step 3：rodar os testes e confirmar que falham primeiro**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/subagent-explore.test.ts -t "RespondToCoordinator|SendMessage to a running"
```

Expected: FAIL, pois a superfície de tool do child ainda não contém a tool de resposta nem o pai recebeu o reply command.

- [ ] **Step 4：implementar o adapter de coordinator response**

`subagent/coordinator-response.ts`:

```ts
import type { CoordinatorResponsePort, SessionId } from "@zcode/contracts";
import type { EnqueueSubagentMessageInput } from "../runtime/types.js";

export interface CreateCoordinatorResponsePortOptions {
  agentId: string;
  agentType: string;
  childSessionId: SessionId;
  parentToolCallId?: string;
  enqueue(input: EnqueueSubagentMessageInput): undefined;
}

export function createCoordinatorResponsePort(
  options: CreateCoordinatorResponsePortOptions,
): CoordinatorResponsePort {
  return {
    respond(request) {
      const responseId = `response_${crypto.randomUUID()}`;
      try {
        options.enqueue({
          responseId,
          agentId: options.agentId,
          agentType: options.agentType,
          childSessionId: options.childSessionId,
          childToolCallId: String(request.childToolCallId),
          ...(options.parentToolCallId ? { parentToolCallId: options.parentToolCallId } : {}),
          summary: request.summary,
          message: request.message,
          traceContext: request.trace,
        });
        return {
          status: "success",
          responseId,
          message: `Response ${responseId} was queued for the coordinator.`,
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          status: "failed",
          responseId,
          error: message,
          message: `Response ${responseId} failed to queue for the coordinator: ${message}`,
        };
      }
    },
  };
}
```

- [ ] **Step 5：injetar a port no child runtime

Ao criar o `AgentRuntime` do child, passe:

```ts
coordinatorResponsePort: createCoordinatorResponsePort({
  agentId: request.agentId,
  agentType: request.agentType,
  childSessionId: request.sessionId,
  parentToolCallId: traceStringAttribute(
    request.traceContext,
    "parentToolCallId",
  ),
  enqueue: (input) => this.enqueueSubagentMessage(input),
}),
```

Essa port só pode aparecer nas deps do child; o bootstrap do runtime pai não a injeta. Como `CoordinatorResponseRequest` não tem `childSessionId`, a identity só pode vir do closure ligado no momento da criação do child.

- [ ] **Step 6：forçar a tool de controle do child no allowlist**

Primeira camada: envolva o resultado final de `resolveSubagentToolAllowlist()` em um helper de deduplicação, garantindo que `tools`／`disallowedTools` do profile não removam a tool de controle do child:

```ts
function includeCoordinatorResponseTool(
  toolNames: readonly string[] | undefined,
): readonly string[] | undefined {
  if (!toolNames) return toolNames;
  return Array.from(new Set([...toolNames, RESPOND_TO_COORDINATOR_TOOL_NAME]));
}
```

Chame-o nos três ramos: Explore, general-purpose e custom profile. `tools`／`disallowedTools` do profile não removem essa tool de controle; o `toolDisallowlist` global explícito do runtime continua decidido por último pela política genérica de registro.

Segunda camada: altere `runtime/helpers/tool-allowlist.ts` reaplicando o helper child-only depois de concluída a interseção do Explore:

```ts
function includeSubagentControlTools(
  config: AgentRuntimeConfig,
  toolNames: readonly string[] | undefined,
): readonly string[] | undefined {
  if (config.taskType !== "subagent_child" || toolNames === undefined) {
    return toolNames;
  }
  return Array.from(new Set([...toolNames, RESPOND_TO_COORDINATOR_TOOL_NAME]));
}
```

Tanto o valor de retorno não-Explore quanto o valor de retorno da interseção do Explore de `resolveBuiltInToolAllowlist()` passam por esse helper. O Explore, quando não tem allowlist explícito, parte de `EXPLORE_AGENT_ALLOWED_TOOLS` e acrescenta o helper; o `toolDisallowlist` global continua sendo decidido no fim pelo registry. Acrescente uma regressão de refresh do ramo de modelo confirmando que a troca para embedded-search substitui apenas Glob／Grep e não remove a tool de resposta já registrada. O refresh atual não faz unregister dessa tool; se, na implementação, o registry for reconstruído, `includeRespondToCoordinator` precisa reutilizar a capacidade de registro inicial (por exemplo, lendo `registry.has()` antes do refresh), e não registrar apenas com base em `taskType` uma tool sem port.

- [ ] **Step 7：verificar a guidance com escopo de tool, sem modificar o common prompt**

`RespondToCoordinator.metadata.modelInstructions` já contém desde a Phase 2:

```text
When you receive an input beginning with "Message from coordinator:", use this tool to answer it.
When replying while work remains, do not use assistant text as the reply.
Place this call before or alongside the next work tool call when possible.
Continue the current task unless the coordinator explicitly changed or ended it.
```

Não modifique `subagent/system-prompt.ts`. O registry apenas concatena `modelInstructions` na descrição de provider das ferramentas realmente registradas, portanto, quando a port está ausente ou há disallow global, o modelo não é instruído a chamar uma tool inexistente. O teste de superfície precisa provar simultaneamente os estados presente e ausente.

- [ ] **Step 8：verificar a fronteira do scheduler, sem modificar o scheduler**

Em um teste focado de tool contract ou de scheduler, asserte:

```ts
expect(respondMetadata.concurrentSafe).toBe(true);
```

E preserve o metadata existente do Bash:

```ts
expect(bashMetadata.concurrentSafe).toBe(false);
```

O teste prova apenas que a tool pode ser produzida no mesmo model step; não deve asseverar que RespondToCoordinator e Bash estão no mesmo parallel group.

- [ ] **Step 9：rodar os testes de integração do child**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/subagent-explore.test.ts -t "RespondToCoordinator|SendMessage to a running"
pnpm --filter @zcode/core exec vitest run tests/runtime-tool-allowlist.test.ts
pnpm --filter @zcode/core exec vitest run tests/scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 10：commitar a Phase 4**

```bash
git add apps/zcode-cli/packages/core/src/subagent/coordinator-response.ts apps/zcode-cli/packages/core/src/runtime/methods/subagent.ts apps/zcode-cli/packages/core/src/runtime/helpers/tool-allowlist.ts apps/zcode-cli/packages/core/tests/runtime-tool-allowlist.test.ts apps/zcode-cli/packages/core/tests/subagent-explore.test.ts apps/zcode-cli/packages/core/tests/scheduler.test.ts
git diff --cached --name-only
git commit -m "feat(cli): let subagents respond to coordinators"
```

---

## Phase 5：Persistence, Hydration e Ordering

### Task 6：garantir que visibilidade model-only, restauração e ramos de falha estejam estáveis

**Files:**

- Modify: `apps/zcode-cli/packages/core/src/runtime/helpers/runtime-reminders.ts`
- Modify: `apps/zcode-cli/packages/core/src/agent/session-history-hydrator.ts`
- Modify: `apps/zcode-cli/packages/core/src/session-context/parts.ts`
- Modify: `apps/zcode-cli/packages/core/tests/session-history-hydrator.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/subagent-explore.test.ts`
- Modify: `apps/zcode-cli/packages/core/tests/read-session-context-tool.test.ts`
- Modify: `packages/shared/src/zcode-session-visible-content.ts`
- Modify: `packages/shared/test/zcodeSessionVisibleContent.test.ts`

**Interfaces:**

- Consumes: `source: "subagent_message"` e `visibility: "model-only"` já persistidos.
- Produces: histórico provider live／hydrated consistente; histórico visível na UI, título e ReadSessionContext sempre ocultando o carrier interno.

- [ ] **Step 1：escrever o teste de hydrate que falha**

Construa a synthetic user message persistida:

```ts
{
  role: "user",
  synthetic: true,
  source: "subagent_message",
  visibility: "model-only",
}
```

A text part contém `<subagent-message>`. Asserte a entry de runtime após o hydrate:

```ts
expect(entry.message.role).toBe("user");
expect(entry.metadata?.source).toBe("legacy_synthetic");
expect(providerText).toContain("<subagent-message>");
expect(providerText).not.toContain("<system-reminder");
```

- [ ] **Step 2：escrever os testes de fallback de visibilidade e de título que falham

Em `zcodeSessionVisibleContent.test.ts`, acrescente três grupos de asserções:

```ts
// canonical persisted shape：当前 visibility 逻辑应直接隐藏，用作回归断言。
expect(getZCodeUserVisibleMessages([messageWithInfoVisibilityModelOnly])).toEqual([]);

// source-only replay fallback：没有 visibility 但 source= subagent_message 时也必须隐藏。
expect(getZCodeUserVisibleMessages([sourceOnlySubagentMessage])).toEqual([]);

// title 不得采用 synthetic reply；仍选择真实 user text 或 target title fallback。
expect(
  resolveZCodeVisibleSessionTitle({
    messages: [sourceOnlySubagentMessage, realUserMessage],
    target: null,
  }),
).toBe("真实用户问题");
```

O caso source-only é o teste vermelho esperado desta fase; cubra separadamente as duas formas de fallback, `message.info.source` e `part.metadata.source`. O caso que traz apenas o `visibility: "model-only"` canônico pode já passar antes da alteração e não deve ser usado como evidência de falha de TDD.

- [ ] **Step 3：escrever o teste de ReadSessionContext que falha

Em `read-session-context-tool.test.ts`, imitando o case existente de `goal_state_change`, adicione uma text part com `synthetic: true` e `metadata.source/source: "subagent_message"`, chame o caminho de local relevant snippets e asserte que a output não contém o response marker. A ferramenta não deve resumir para o modelo novamente o carrier interno do coordinator como se fosse contexto real de usuário.

- [ ] **Step 4：escrever os testes de ordenação FIFO e de falha de enqueue injetada

Os testes de runtime cobrem as duas formas legais de consumo. O primeiro grupo enfileira em sequência antes do mesmo drain do active loop:

```text
subagent-message(response_1)
task-notification(agent completed)
```

Asserte que, na mesma requisição de provider que contém ambos pela primeira vez, o content index de `response_1` é menor que o de `<task-notification>`.

O segundo grupo deixa o response command ser consumido primeiro pela fila idle／externa e só então enfileira a task notification; asserte que o primeiro request index da response é menor que o primeiro request index da notification. Os dois grupos asseveram `maxConcurrentModelCalls === 1`.

O teste da coordinator port faz o callback de enqueue lançar ativamente `injected enqueue failure` e asserta a runtime output da tool:

```ts
{
  status: "failed",
  error: "injected enqueue failure",
}
```

O model content visível ao provider precisa conter simultaneamente a causa da falha e `Continue the current task`, e a model request seguinte do child ainda pode prosseguir com chamadas de ferramentas comuns. Não nomeie esse teste como `parent runtime disposed`: a fila atual não tem acknowledgement de disposed, e este teste prova apenas que o adapter trata exceção de enqueue síncrono; a entrega durável após a destruição do processo continua sendo um não objetivo explícito.

- [ ] **Step 5：rodar os testes e confirmar que falham primeiro

Todos os novos títulos de teste de core／shared desta Phase contêm `subagent message`, evitando que o `-t` focado não rode os novos cases.

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/session-history-hydrator.test.ts tests/runtime-tool-loop.test.ts tests/subagent-explore.test.ts -t "subagent message"
pnpm --filter @zcode/core exec vitest run tests/read-session-context-tool.test.ts -t "subagent message"
pnpm exec vitest run packages/shared/test/zcodeSessionVisibleContent.test.ts -t "subagent message"
```

Expected: FAIL, pois a source de hydrate ainda não está mapeada e o fallback de visibilidade source-only e o skip em ReadSessionContext ainda não foram implementados.

- [ ] **Step 6：implementar os mapeamentos de runtime metadata, visibilidade e contexto**

Acrescente em `runtimeMetadataForSyntheticUserMessageSource()`:

```ts
if (source === "background_task" || source === "subagent_message") {
  return legacySyntheticRuntimeMetadata();
}
```

`metadataFromSyntheticTextPart()` usa o mesmo julgamento, garantindo que o hydrate não entre no ramo de system reminder legado `source === "subagent"`.

Em `packages/shared/src/zcode-session-visible-content.ts`, acrescente em `MODEL_ONLY_SYNTHETIC_NOTICE_SOURCES`:

```ts
"subagent_message",
```

E faça `isZCodeModelOnlySyntheticUserMessage()` checar também `message.info.source`, e não apenas o metadata da text part:

```ts
if (MODEL_ONLY_SYNTHETIC_NOTICE_SOURCES.has(String(message.info.source ?? ""))) {
  return true;
}
```

Acrescente a mesma source em `SKIPPED_SYNTHETIC_TEXT_SOURCES` em `apps/zcode-cli/packages/core/src/session-context/parts.ts`. O `visibility` canônico é o critério principal e o conjunto de sources é o fallback de defesa em profundidade para dados antigos, replay e perda parcial de metadata.

- [ ] **Step 7：rodar os testes de persistence／visibility／context**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/session-history-hydrator.test.ts tests/runtime-tool-loop.test.ts tests/subagent-explore.test.ts -t "subagent message"
pnpm --filter @zcode/core exec vitest run tests/read-session-context-tool.test.ts -t "subagent message"
pnpm exec vitest run packages/shared/test/zcodeSessionVisibleContent.test.ts -t "subagent message"
```

Expected: PASS.

- [ ] **Step 8：rodar o grupo de regressão existente de background notification**

Run:

```bash
pnpm --filter @zcode/core exec vitest run tests/runtime-tool-loop.test.ts -t "task notification|background notification|subagent message"
```

Expected: PASS; a semântica de `task-notification` em active／idle, goal continuation e sealed child cleanup não mudou.

- [ ] **Step 9：commitar a Phase 5**

```bash
git add apps/zcode-cli/packages/core/src/runtime/helpers/runtime-reminders.ts apps/zcode-cli/packages/core/src/agent/session-history-hydrator.ts apps/zcode-cli/packages/core/src/session-context/parts.ts apps/zcode-cli/packages/core/tests/session-history-hydrator.test.ts apps/zcode-cli/packages/core/tests/runtime-tool-loop.test.ts apps/zcode-cli/packages/core/tests/subagent-explore.test.ts apps/zcode-cli/packages/core/tests/read-session-context-tool.test.ts packages/shared/src/zcode-session-visible-content.ts packages/shared/test/zcodeSessionVisibleContent.test.ts
git diff --cached --name-only
git commit -m "feat(cli): preserve subagent response history"
```

---

## Phase 6：ciclo de vida do E2E do BG25

### Task 7：validar a cadeia real de coordenação bidirecional visível ao provider

**Files:**

- Create: `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-respond-to-coordinator.test.ts`
- Create: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-subagent-respond-to-coordinator.json`
- Create: `packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-subagent-respond-to-coordinator.json`
- Modify: `docs/testing/conversation-session-background-e2e-coverage-matrix.md`
- Modify: `docs/testing/conversation-session-e2e-coverage-matrix.md`
- Modify after Docker admission: `scripts/test-desktop-e2e-container.sh`
- Modify after Docker admission: `docs/testing/conversation-session-docker-automation-plan.md`

**Interfaces:**

- Consumes: a semântica accepted do BG25 e a implementação das Phases 1-5.
- Produces: um E2E formal BG25 independente, um fixture de replay local ao case e evidência de ordenação visível ao provider.

- [ ] **Step 1：escrever a spec formal BG25 independente**

Use markers estáveis:

```text
E2E_SUBAGENT_RESPOND_TO_COORDINATOR
E2E_SUBAGENT_COORDINATOR_QUESTION
E2E_SUBAGENT_RESPONSE_QUEUED
E2E_SUBAGENT_CONTINUED_WORK
E2E_SUBAGENT_COORDINATOR_CONSUMED
E2E_SUBAGENT_FINAL_RESULT
```

A spec fica diretamente no diretório formal `conversation-session/`, usando o context window default normal do provider; não deve herdar a configuração de teste de auto-compact `240/80` pelo caminho `manual-review/pending`. A spec cria um diretório temporário próprio,
evitando depender de arquivos do repositório da máquina de desenvolvimento:

```ts
const E2E_ROOT = "/tmp/zcode-e2e-respond-to-coordinator";
const RELEASE_FILE = join(E2E_ROOT, "release-child-bash");
const CONTINUED_WORK_FILE = join(E2E_ROOT, "continued-work.txt");
```

Em `before`, faça `mkdir` e escreva `CONTINUED_WORK_FILE`; em `afterEach`, escreva primeiro `RELEASE_FILE` para liberar um eventual Bash de child remanescente, depois pare a sessão e limpe o diretório. Use o `ensureToolCrossProductFullAccessMode()` e o `respondToToolCrossProductBlockers()` existentes para tratar modo／permissão, sem novos helpers de UI duplicados.

O cenário precisa seguir esta ordem:

1. main chama `Agent(run_in_background=true)`.
2. o child chama um Bash controlado que espera por `RELEASE_FILE`, criando a janela de steer running.
3. main lê `agentId` do Agent result e chama `SendMessage`; o fixture de replay local ao case precisa usar `"to": "{{latestAgentId}}"`, e é proibido fixar o agent id aleatório capturado.
4. o teste escreve `RELEASE_FILE` depois que o result de SendMessage chega ao main; a request seguinte do child vê ao mesmo tempo o tool result do Bash, `Message from coordinator:` e o payload da pergunta.
5. o child, na mesma response, produz em ordem `RespondToCoordinator` e um `Read` lendo `CONTINUED_WORK_FILE`.
6. a request seguinte do child vê os dois tool results e então executa uma ferramenta comum de trabalho.
7. a request de wake do pai ocioso contém `<subagent-message>` e o response marker.
8. o pai retorna, para a request de wake, uma assistant message contendo `E2E_SUBAGENT_COORDINATOR_CONSUMED`.
9. a notificação de completion final do child contém o marker final.
10. as user messages visíveis no nível superior da UI não contêm o response marker; dentro do card do Agent pai é encontrado o bloco de tool child espelhado `RespondToCoordinator`, e o Agent conclui normalmente.

A spec usa `findFirstUpstreamRequestIndex()` junto com um helper de offset de marker dentro do body da request e, por `(requestIndex, contentIndex)`, asserte que a primeira posição de `<subagent-message>` é anterior à de `<task-notification>`; não presuma que ambas pertencem a requests diferentes.

- [ ] **Step 2：preencher o fixture de provider local ao case e o manifest**

Cada request usa `bodyIncludes`／`lastUserMessageIncludes` precisos e é anotado com:

```json
{
  "syntheticReason": "稳定证明 child RespondToCoordinator 回复进入 parent model-only runtime command，同时 child 继续普通工作 tool。"
}
```

Não grave responses específicos do case em `provider-basic.json` nem no `common.json` compartilhado.

O fixture precisa conter lanes／responses independentes para provar: o lançamento do Agent pelo main, o SendMessage do main, o result do Bash do child + input do coordinator, o `RespondToCoordinator + Read` do child, o trabalho contínuo do child, o wake／marker de consumo model-only do pai e a completion final do child. `SendMessage.input.to` usa fixamente o token `{{latestAgentId}}` suportado pelo replay server; `Read.file_path` é fixado como o `CONTINUED_WORK_FILE` acima; não referencie arquivos do plano de execução nem do código-fonte como fixture de runtime.

O campo `spec` do manifest precisa apontar diretamente para a spec formal do BG25, e não para `manual-review/pending`.

- [ ] **Step 3：rodar o fixture checker**

```bash
pnpm --filter @zcode/desktop e2e:fixture:check -- --spec ./test/e2e/conversation-session/conversation-session-subagent-respond-to-coordinator.test.ts
```

Expected: exit code `0`, com todas as requests sintéticas tendo `syntheticReason`.

- [ ] **Step 4：rodar o replay isolado**

```bash
E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-subagent-respond-to-coordinator.json pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-subagent-respond-to-coordinator.test.ts'
```

Expected: PASS, provando que não há dependência de fixture compartilhada legada; a config de CLI gerada na execução não contém o override de auto-compact `240/80`,
a captura do provider não contém request de compact summary e a UI não mostra o divisor de compact.

- [ ] **Step 5：rodar o replay default**

```bash
pnpm --filter @zcode/desktop exec wdio run wdio.conf.ts --spec './test/e2e/conversation-session/conversation-session-subagent-respond-to-coordinator.test.ts'
```

Expected: PASS.

- [ ] **Step 6：concluir o status na matrix**

Atualize o BG25 de `planned` para:

```markdown
| BG25 | covered | BGR、RT | 独立 formal BG25 E2E 证明 child-to-parent model-only response 和 continued work；core tests 证明 active/idle intake、FIFO ordering 与单模型请求并发 |
```

- [ ] **Step 7：rodar a auditoria de cobertura e o typecheck do E2E**

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --json
pnpm --filter @zcode/desktop typecheck:e2e
```

Expected: as duas comandos com exit code `0`.

- [ ] **Step 8：rodar a prova Docker de um spec sem rede**

```bash
E2E_SPEC=./test/e2e/conversation-session/conversation-session-subagent-respond-to-coordinator.test.ts pnpm run test:e2e:container
```

Expected: PASS, e registrar o diretório real de artifacts `packages/desktop/.e2e-artifacts/<run-id>`. Só depois dessa etapa é possível fazer o admission.

- [ ] **Step 9：executar o admission Docker e repetir a suite verified**

```bash
pnpm --filter @zcode/desktop e2e:docker:admit -- --spec ./test/e2e/conversation-session/conversation-session-subagent-respond-to-coordinator.test.ts --verified --artifact packages/desktop/.e2e-artifacts/<run-id> --apply
pnpm run test:e2e:container:conversation
```

Expected: o admission modifica apenas `scripts/test-desktop-e2e-container.sh` e `docs/testing/conversation-session-docker-automation-plan.md`, e em seguida a suite verified passa. Se a prova Docker de um spec não puder rodar no ambiente atual, não execute o admission e não marque o BG25 como Docker verified; liste explicitamente como item pendente de verificação nas notas de entrega.

- [ ] **Step 10：commitar a Phase 6**

```bash
git add packages/desktop/test/e2e/conversation-session/conversation-session-subagent-respond-to-coordinator.test.ts packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-subagent-respond-to-coordinator.json packages/desktop/test/e2e/fixtures/cases/conversation-session/conversation-session-subagent-respond-to-coordinator.json docs/testing/conversation-session-background-e2e-coverage-matrix.md docs/testing/conversation-session-e2e-coverage-matrix.md
# 仅当 Step 12 admission 已完成且这两个文件的 diff 只属于 BG25 时执行：
git add scripts/test-desktop-e2e-container.sh docs/testing/conversation-session-docker-automation-plan.md
git diff --cached --name-only
git commit -m "test(e2e): cover subagent coordinator responses"
```

Se a prova Docker não foi executada ou não passou, pule o segundo `git add`; os dois arquivos de admission não devem ter alteração. Os Expected staged paths precisam corresponder ao estado real do lifecycle concluído.

---

## Phase 7：verificação final e entrega

### Task 8：rodar a regressão completa e conferir o escopo

**Files:**

- Verify only: todos os arquivos citados acima.

**Interfaces:**

- Consumes: todos os deliverables das Phases 0-6.
- Produces: mudanças finais committable, reproduzíveis e sem expansão de escopo não declarada.

- [ ] **Step 1：rodar a suite focada de contracts／core**

```bash
pnpm --filter @zcode/contracts exec vitest run tests/respond-to-coordinator.test.ts
pnpm --filter @zcode/core exec vitest run tests/tool-contracts.test.ts tests/runtime-hooks.test.ts tests/permission-service.test.ts tests/runtime-tool-allowlist.test.ts tests/runtime-tool-loop.test.ts tests/subagent-explore.test.ts tests/session-history-hydrator.test.ts tests/read-session-context-tool.test.ts tests/scheduler.test.ts
```

Expected: PASS.

- [ ] **Step 2：rodar a suite focada de shared**

```bash
pnpm exec vitest run packages/shared/test/zcodeProtocol.test.ts packages/shared/test/zcodeSessionVisibleContent.test.ts
```

Expected: PASS.

- [ ] **Step 3：rodar as checagens dos pacotes da CLI**

```bash
pnpm --filter @zcode/contracts typecheck
pnpm --filter @zcode/core typecheck
pnpm --filter @zcode/contracts lint
pnpm --filter @zcode/core lint
```

Expected: PASS.

- [ ] **Step 4：rodar as checagens obrigatórias do repositório**

```bash
pnpm typecheck
pnpm lint
```

Expected: PASS. Registre separadamente os warnings já existentes e as novas falhas introduzidas.

- [ ] **Step 5：rodar os gates de documentação e de diff**

```bash
node scripts/audit-conversation-session-case-coverage.mjs --check --json
git diff --check e458e18b902a467251153972688ca8461eb5a418...HEAD
git diff --check
git diff --cached --check
```

Expected: exit code `0`.

- [ ] **Step 6：conferir a superfície de tools visível ao provider**

Confirme a partir do teste focado ou do artifact de captura:

```text
main tools: SendMessage present, RespondToCoordinator absent
child tools: RespondToCoordinator present, SendMessage absent, Agent absent
plan-mode child: RespondToCoordinator executes with readOnly=false and mode.plan.explicitSessionCapability
missing-port/disallowed child: RespondToCoordinator and its guidance absent
```

- [ ] **Step 7：conferir a ausência de expansão de escopo**

Run:

```bash
git diff --name-only e458e18b902a467251153972688ca8461eb5a418...HEAD
git diff --stat e458e18b902a467251153972688ca8461eb5a418...HEAD
git status --short
git diff --cached --name-only
```

Confirme manualmente:

- não há código de Agent Teams／team roster／sibling mailbox;
- não há conexão direta de `steerTurn` do pai;
- `subagent-message` não foi enfiado em source／log／goal de `task-notification`;
- as regras de segurança de paralelismo do scheduler não foram modificadas;
- não foi adicionado nenhum RPC de app para agent;
- remote owner／lease, identidade de workspace e fila do client não foram modificados;
- o common system prompt de subagent não foi modificado para referenciar uma tool que pode não existir;
- `RespondToCoordinator` não foi marcada como read-only;
- o child tool mirror existente dentro do card do Agent pai não foi ocultado.

- [ ] **Step 8：commit final**

Depois que todos os commits de Phase estiverem completos, por padrão não devem restar arquivos de feature. Verifique primeiro:

```bash
git status --short
git diff --cached --name-only
```

Se ainda houver arquivos de formatação ou de estado de documentação dentro do escopo declarado deste plano, revise um a um e use explicitamente `git add <exact-path>`, confirme os cached paths e só então use um Conventional Commit que corresponda ao conteúdo; não rode um commit de reserva sem um gate preciso de staged path. Se não houver mudanças staged restantes, não crie um commit vazio. Mudanças não relacionadas do usuário permanecem como estão e são listadas nas notas de entrega.

- [ ] **Step 9：gerar as evidências de entrega**

As notas de entrega devem listar no mínimo: o baseline e o HEAD final, os commits de Phase, os resultados de testes focados／completos, o capture／replay／artifact Docker do BG25, as verificações não executadas e o motivo, e as mudanças do usuário preservadas. Não descreva "command enqueue bem-sucedido" como "coordinator já leu"; apenas o consumed marker do E2E pode provar que o modelo pai realmente consumiu nesse replay.

## Checklist de Self-Review

- [ ] Cobertura da spec: cada Critério de Aceitação mapeia para um passo de implementação ou de teste das Tasks 1-8.
- [ ] Consistência de nomes: usa-se globalmente apenas `RespondToCoordinator`, `CoordinatorResponsePort`, `SubagentMessageRuntimeCommand`, `subagent-message`, `subagent_message`.
- [ ] Direcionalidade: main-to-child continua sendo `SendMessage`; child-to-main passa só pela coordinator port.
- [ ] Serialização no runtime: tanto o intake active quanto o command ocioso reutilizam a mesma fila de runtime commands do pai.
- [ ] Visibilidade: live, persist, hydrate, protocol, filtro de UI, título e ReadSessionContext cobrem `subagent_message`.
- [ ] Continuação: os testes provam que o child ainda faz uma tool call comum e chega a uma completion final depois de responder.
- [ ] Alegação de agendamento: só se promete o mesmo assistant model step; não se promete paralelismo real com tools inseguras.
- [ ] Semântica de erro: ack de fila, falha de enqueue injetada e port ausente têm resultados explícitos; pai disposed／entrega durável são explicitamente não objetivos, sem promessas falsas.
- [ ] Semântica de permissão: a ferramenta permanece non-read-only; a capability de Plan só libera ações de session não destrutivas, e a prioridade de deny／ask tem testes.
- [ ] Disponibilidade da tool: port, task type do child, projeção final do Explore, disallow global e o estado da guidance com escopo de tool são consistentes.
- [ ] Semântica de ordenação: tanto a mesclagem na mesma request quanto o consumo entre requests são comparados pela primeira posição `(requestIndex, contentIndex)` visível ao provider.
- [ ] Terminal race: quando o turno active não tem roundtrip seguinte, a fila externa faz o wake, e a concorrência de modelos continua sendo 1.
- [ ] Observabilidade: o synthetic user de nível superior é ocultado, mas o bloco de tool child aninhado dentro do card do Agent pai é preservado.
- [ ] Escopo: nada de Agent Teams, sibling routing, replyTo ou mailbox durável foi introduzido.
- [ ] Fronteira mobile: nenhum runtime de celular novo; os testes de protocol／visibilidade cobrem a compatibilidade do payload replayable.
- [ ] Segurança do workspace: a semântica de `workspaceIdentity`／`workspacePath` não foi tocada.
- [ ] Gates do repositório: audit de cobertura, testes focados, typecheck do E2E, `pnpm typecheck` e `pnpm lint` têm todos os seus passos.

## Handoff de Execução

Recomenda-se usar desenvolvimento dirigido por subagentes: use um worker novo para cada Task e, ao fim de cada Task, faça uma revisão de conformidade com a spec e uma revisão de qualidade de código. A semântica de documentação da Phase 0, a ordenação de runtime da Phase 3, a continuação do child da Phase 4 e o E2E visível ao provider da Phase 6 são os quatro review gates em que é obrigatório parar e verificar.

Na execução inline, avance na ordem das Phases; não é permitido pular a Phase 0, nem juntar a Phase 3 com a Phase 4 em uma alteração grande; assim a semântica de command active／idle pode ser validada de forma independente antes de conectar o child real.
