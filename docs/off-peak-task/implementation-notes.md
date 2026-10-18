# Notas de implementação da tarefa off-peak

> Mapa de implementação voltado a quem mantém o código. O posicionamento do produto e as decisões estão em `spec.md` / `decisions.md` / `tech-design.md` (fonte da verdade);
> este documento registra apenas "onde o código mora, como ele se conecta". Paradigma: uma tarefa em background de uso único dentro do sistema de Automations (D28).

## O fluxo completo em uma figura

```
创建表单(OffPeakEditView) ──RPC──▶ IOffPeakTaskService.createTask
                                      │ 取号 POST /ticket（成功才落库）
                                      ▼
                            off_peak_tasks(sqlite, OffPeakTaskRepo)
                                      │ history_deleted_at 仅控制 History 可见性
                                      ▲                    │
        offPeakTaskSync 轮询 /ticket/status 写回 schedulable/位次   │ scheduler tick 认领 schedulable=1
                                      │                    ▼
                                      │        offpeak-dispatch-request ──▶ main ──▶ host OffPeakRun
                                      │                                              │ createTask/resume + sendPrompt
                                      │                                              │  (idle Selection + modelExecution, D33/M4)
                                      │                                              ▼
                                      │                              agent loop ──▶ idle plan provider
                                      │                                              │  POST /off-peak/anthropic/v1/messages
                                      │                                              ▼
                                      │                                   网关(真实/进程内 mock)
                                      │   400/3102 票过期 ◀──────────────────────────┘
                                      │        │ host 识别标记 → handleTicketExpiredDuringRun
                                      └────────┘   同 task_id 重取号 → resume 同 session 续跑
                              终态 → markTerminal → settle 核销 outbox → 系统通知
```

## Arquivos-chave

| Camada | Arquivo | Responsabilidade |
| --- | --- | --- |
| Tipos/protocolo | `packages/shared/src/off-peak-types.ts` | Tipo de domínio com sete estados, constantes de marcadores de erro, `OFF_PEAK_PROVIDER_ID` |
| | `packages/shared/src/channels.ts` + `validation.ts` | Pares de mensagens `OffPeakRun`/`OffPeakRunResult`/`OffPeakSchedulerWakeRequest`; `sendText.modelExecution` do V4 (D33/M4) |
| Armazenamento | `packages/services/src/session/offPeakTaskRepo.ts` | DDL de `off_peak_tasks` + guardas da máquina de estados; migração de compatibilidade de `history_deleted_at` e ocultação no History local |
| Serviço | `offPeakServerClient.ts` | Quatro interfaces: availability/take/status/settle; cada requisição resolve uma única vez o snapshot de credencial selecionada e injeta em par org/project do Team (messages não passa por aqui) |
| | `offPeakMockGateway.ts` | Gateway mock no processo (`ZCODE_OFFPEAK_MOCK=1`); `resolveUpstream` retornando null dá resposta fixa |
| | `offPeakTaskService.ts` | Orquestração: criação com take/cancelamento/Pause-Continue/exclusão/edição/Delete history + promoção por polling do offPeakTaskSync + baixa (settle) + continuação em 3102 |
| | `offPeakRuntimeModel.ts` | Classificação do Coding Plan selecionado e credential snapshot + construção de Request Auth de uma única requisição + resolução de upstream origin/mock |
| | `offPeakTask.ts` | Descritor de `IOffPeakTaskService` (superfície RPC do renderer, expondo à UI apenas o suporte a Coding Plan sem dados sensíveis) |
| Agendamento | `packages/desktop/src/scheduler/index.ts` | Tick do offPeak: reivindica e despacha os schedulable, inicia recoverInterrupted, reporta contagem de ativos |
| | `packages/desktop/src/main/desktopCronScheduler.ts` + `index.ts` | Roteamento de despacho, encaminhamento de resultados, powerSaveBlocker de keep-awake |
| host | `packages/desktop/src/host/index.ts` | Processamento de OffPeakRun: createTask/resume + injeção de Selection/`modelExecution` idle + gravação do estado terminal + continuação em 3102 |
| Adaptador | `apps/zcode-cli/packages/adapters/src/model/offpeak-retry.ts` | Orçamento infinito de sondagem para isenção de fila em 429/3105 + marcador de continuação em 400/3102 (apenas idle plan provider) |
| | `apps/zcode-cli/.../commands/handlers/session-flow.ts` + `prompt-turn.ts` | Selection/Request Auth de escopo de execução entram no Core; não modifica a Session Selection nem entra na Queue comum (D33/M4) |
| UI | `packages/ui/src/settings/{AutomationsSection,OffPeakEditView,OffPeakTaskList,OffPeakHistoryTab}.tsx` | Três abas/criação por projeto local/card de lista/History/portões de rollout e assinatura |
| | `packages/ui/src/store/offPeakTaskStore.ts` | Store zustand (lista/rollout/CRUD/polling de 10s; suporte da conexão selecionada; snapshot de availability controla o cinza de cota e a reconsulta no horário) |
| | `packages/ui/src/hooks/useOffPeakTaskNotifications.ts` | Notificações de sistema de conclusão/falha; permission/elicitation ficam por conta da cadeia de notificações de session normal |

## Criação dentro da sessão (D49, v2)

```
用户会话 turn ──模型 tool_use OffPeakCreate/OffPeakList──▶ core/tool/handlers/off-peak.ts
      │  （offPeakTurn 拒 Create；automationTurn 放行=组合玩法 D49-3）
      ▼
bootstrap/zcode-protocol/offpeak-port.ts（activeOffPeakTaskId 递归拒；无标题冻结/无绑定检查）
      │ requestClient offPeak/create|list
      ▼
services zcodeAgentService offPeak/* handler（缺省解析：yolo / allowed_models 末位 / 最高档；
      │  model 白名单预校；workspace 闭包注入）──▶ OffPeakTaskService.createTask（同表单链路）
      ▼
成功输出 → ConversationTurnGroup 轮尾静态卡（月亮+标题+位次快照+「去到闲时任务」）
      → onOpenAutomationsMain(offPeakTaskId,"idle") → AutomationsSection offpeak- 前缀分流
      → offpeak-edit 视图（queued/paused 可编辑，running/终态 readOnly）
```

| Camada | Arquivo | Responsabilidade |
| --- | --- | --- |
| contracts | `apps/zcode-cli/packages/contracts/src/tools/off-peak.ts` + `interfaces/off-peak.port.ts` | Schema da ferramenta (title/prompt obrigatórios, permissionMode/model/thoughtLevel opcionais) e união discriminada do OffPeakPort |
| core | `core/src/tool/handlers/off-peak.ts`, `runtime/methods/turn-loop-state.ts` (isOffPeakCreateRestrictedTurn + OFF_PEAK_MUTATION_TOOL_NAMES) | Limite final de rejeição do handler + três sinais do turn; portão de registro `includeOffPeak = Boolean(deps.offPeakPort)` |
| bootstrap | `zcode-protocol/offpeak-port.ts`, `server-operations.ts` (só injeta a porta se offPeakToolEnabled), `zcode-protocol-v4/commands/prompt-turn.ts` (activeOffPeakTaskId + denylist) | Ponte de protocolo e manutenção da identidade do turn; flag ausente não injeta = fail-closed |
| services | `zcodeAgentService.ts` (handlers offPeak/create|list,下发 de offPeakToolEnabled + compat, resolução de defaults), `automationToolPolicy.ts` (OFF_PEAK_MUTATION_TOOL_NAMES como constante independente), `node.ts` (injeção de holder por forward reference) | Orquestração no host; **OffPeakCreate nunca entra em nenhuma cópia de AUTOMATION_MUTATION_TOOL_NAMES** |
| host | `packages/desktop/src/host/index.ts` despachando `toolDenylist: ["CronCreate","OffPeakCreate"]` | Ponto de chegada simétrico de D45+D49-2 |
| UI | `ui/src/ToolCallBlocks/renderers/offpeak-create.tsx`, `v4/ConversationTurnGroup.tsx` (resolveOffPeakTurnCards), `settings/AutomationsSection.tsx` (resolveOffPeakDetailNavigation) | Card estático no fim do turno e navegação de edição para a aba idle |

## Limite de faturamento (D33, onde mais se tropeça)

O idle plan usa um Built-in Provider oculto e a cadeia de execução de Model padrão; a Session Selection continua sempre sendo a do próprio usuário:

- Antes de criar a sessão na primeira dispatch, lê-se a visão padrão do workspace com `workspace/readState(preferWorkspaceDefaults=true)`, tira um snapshot completo de `providerId/modelId` na ordem `defaultModel` → `lastUsed` → `settings.model.current` e passa explicitamente a `createTask`; é proibido ler o modelo em execução da session ativa, e também é proibido recorrer a `available[0]` na camada OffPeak ou ao primeiro item em ordem lexicográfica do provider registry. O `current` do catalog antigo vem do mesmo bootstrap de `session/create` comum. O modelo do formulário OffPeak continua sendo usado apenas no turno de idle plan.
- O `sendPrompt` despachado leva a idle Model Selection precisa e o `modelExecution` mínimo; Registry/ModelFactory cria o Active Model do Loop atual, e o Request Auth se vincula apenas a essa execução.
- Persistência zero: não escreve Session Selection, Config, Registry View, CLI record, workspace catalog nem Queue comum, e não gera notificação de modelChange.
- Resultado: quando o run session chega ao estado terminal, o chat e as interrupções de busy criam o modelo do usuário pelo próprio Submission e Session Selection normais após o turn terminal atual; não existe sequência de troca de volta.
- Limite de Permission (D44): a confirmação passa apenas pela session normal e a tarefa Off-Peak continua `running`; se a aprovação/rejeição acontecer durante o turn automático atual, ainda se usa o mesmo idle Active Model. Não existe estado de Review exclusivo de Off-Peak, notificação duplicada nem aviso de "a continuação usará sua própria cota de plano". O valor reservado `awaiting_approval` do banco antigo é migrado para running na inicialização.

Os erros de dispatch são separados por recuperabilidade: falta de modelo do usuário, falta de modelo do idle plan e falta de JWT/Coding Plan Key são
`permanent`, e o scheduler coloca direto a tarefa como `failed` e interrompe o backoff; rede, ciclo de vida do Agent e outros erros desconhecidos
permanecem `transient`. Motivo da correção: reenviar um erro de configuração determinístico não se cura sozinho, mas a lógica antiga continuava
consumindo ready ticket e deixando a UI mostrar "Waiting for idle compute" para sempre.

## Navegação, suporte e limites de credencial do Coding Plan (D40/D41)

```text
settings selected family/mode/key
              |
              v
exact connection classifier ──> registry/Team runtime-key helper
              |
              v
OffPeakCredentialSnapshot { metadata, jwt, codingPlanApiKey }
       |                 |                         |
       v                 v                         v
UI 脱敏 support    ticket 四接口请求头       modelExecution.requestAuth
```

- Suportado: Coding Plan pessoal ZAI, Coding Plan pessoal BigModel, conexão de projeto BigModel Team.
- Rejeitado: Start Plan, modo API Key, nada selecionado, provider OAuth ativo divergente da family selecionada,
  conexão disabled/stale, falta de JWT ou seleção/identidade de login mudando durante a resolução.
- Uma requisição do ticket client resolve o snapshot apenas uma vez; availability/take/status/settle e o turn automático do host usam o mesmo
  resolver. A conexão Team obtém `${apiKey}.${secretKey}` pela projection Team runtime-key já existente no provider registry;
  é proibido montar o secret por conta própria ou recorrer à key pessoal em caso de falha.
- A UI não lê segredos. O modelo da página inicial de New Task lê apenas id/enabled/systemDisabledReason do snapshot de provider já existente, para
  verificar se há algum Coding Plan em mãos; havendo plano mas sem provider selecionado, permite-se entrar no formulário com o rascunho. A entrada de criação em Automations e o
  envio do formulário continuam salvando e validando os metadados de suporte sem dados sensíveis, confirmando que a family/mode/key selecionada atual bate com os metadados; elas não
  varrem nem auto-selecionam outras credenciais por causa do relaxamento da navegação inicial.

## Demonstração local / integração

```bash
ZCODE_OFFPEAK_MOCK=1 mise run dev:desktop           # 进程内 mock 网关点亮全流程
# 可调时序（演示 3h 续跑用小值）：
ZCODE_OFFPEAK_MOCK_READY_DELAY_MS=3000 ZCODE_OFFPEAK_MOCK_ACTIVE_MS=30000 \
ZCODE_OFFPEAK_MOCK_QUEUE_429_COUNT=2 ...
```

O rollout do modo mock é obrigatório (`resolveOffPeakClientConfig`), e `resolveUpstream` só faz proxy do Coding Plan selecionado
atualmente; quando essa conexão está indisponível, devolve resposta fixa, sem varrer outros providers em cache. Para integrar com o servidor
real: remova `ZCODE_OFFPEAK_MOCK` e o caminho passa a usar a origin da zcode API.

A aceitação de UI usa o workspace local já aberto na janela atual como candidato a Project. O `/remote` do celular não expõe
Automations; o workspace remoto do desktop não expõe Idle-time. Não adicione `remoteSessionId` ao protocolo da tarefa só para
poder escolher um projeto remoto: esta capacidade nova é explicitamente apenas local.

## Pontos pendentes de alinhamento com o servidor (tech-design §7.8)

Documentar o Retry-After em 429/3105, o valor real da cota de take, não enviar `x-should-retry:false` no 429 de fila, quando o rollout casa por conta então client/configs precisam carregar Authorization, e a unidade de `next_poll_after` (o cliente implementa em segundos).

## Testes

- Unitários: `packages/services/test/offPeak*.test.ts` (repo/service/client+gateway/gray config), `apps/zcode-cli/packages/adapters/tests/offpeak-retry.test.ts`, `apps/zcode-cli/packages/bootstrap/tests/offpeak-turn-model-overlay.test.ts`
- Integração end-to-end: `packages/services/test/offPeakE2eIntegration.test.ts` (fluxo completo real, cobrindo os mecanismos de camada de serviço OP02/04/07)
- E2E GUI via WDIO (OP01-06): já registrado como planned na coverage matrix, depende do build do desktop