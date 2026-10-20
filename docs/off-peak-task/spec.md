# Tarefa Fora do Pico (Off-Peak Task) v1 — Spec de Implementação

> **Revisão do ciclo de vida em background:** os limites de implementação e o progresso de verificação desta rodada estão no [plano de implementação](./background-lifecycle-plan.md). As restrições de background e de SendMessage de D51/D52 são substituídas pelo ciclo de vida descrito abaixo; as decisões históricas permanecem em decisions.md.

> **Status: implementada, em fechamento contínuo conforme o Figma.** O repositório atual já contém os tipos de domínio `offPeak`, repo, service,
> scheduler, UI e mock em processo; este documento registra a semântica de produto atual e as restrições de implementação.
>
> **2026-08-22 — Fechamento do Provider Config:** `client/configs.offPeak` mantém apenas
> a flag de exposição `enable_offpeak_task`; os membros de modelo vêm do Built-in `builtin:offpeak-idle-plan`, e as capacidades de modelo vêm do
> Effective Model Config. As descrições históricas de `allowed_models` abaixo são sobrescritas por este item.

> Origem: PRD 《z.ai-z.code-闲时任务 PRD v0.2》após consolidação na sessão de grilling.
> Complementares: `glossary.md` (termos/modelo de domínio), `decisions.md` (registro histórico de decisões D1–D40).
> As divergências em relação ao PRD estão em «Explicitamente não feito» ao final — **essa lista precisa ser levada a alinhamento com o produto**.
>
> **Fonte de verdade do contrato do servidor**: no repositório interno `zcode/zcode-server`, o arquivo `docs/off_peak_design.md`
> (obtido com `glab api "projects/zcode%2Fzcode-server/repository/files/docs%2Foff_peak_design.md/raw?ref=main"`).
> Em caso de conflito de contrato, esse documento prevalece. Os pontos-chave estão resumidos em §4.1.

## 1. Definição em uma frase

Tarefa fora do pico = **uma tarefa em background de uso único dentro do sistema Automations** (D28, paradigma final do Figma): o usuário cria na visão principal de Automations / no cartão de template (title + instructions + projeto + permissões + modelo), e ao submeter chama `POST /ticket` para tirar número e entrar na fila. **A fila é hospedada pelo servidor** (FIFO global de tickets, controle de concorrência pela folga de recursos); o cliente observa os tickets com `POST /ticket/status` em lote, e quando `ready` grava `schedulable=true` e despacha. A execução sem supervisão é segmentada por active ticket de 3h; ao receber `400/3102`, tira um novo número com o mesmo task_id, entrega o novo ticket à CLI residente e continua a requisição original até a conclusão do item inteiro; cada turno despachado automaticamente usa um idle plan provider invisível ao usuário.

A nomenclatura é fixa por camada: o conceito unitário na UI em inglês usa `Idle-time task`, o agrupamento de sistema da barra lateral usa o plural
`Idle-time tasks`; a UI em chinês usa uniformemente 闲时任务. Tipos/variáveis/constantes TypeScript usam respectivamente
`OffPeak*` / `offPeak*` / `OFF_PEAK_*`; arquivos e URLs usam `off-peak`, e o SQLite usa
`off_peak_*`. O conceito do usuário não é renomeado para Off-peak task, para evitar confusão com o protocolo de admissão de baixa demanda do servidor.

O tamanho de fonte da UI de configurações de tarefas fora do pico segue os tokens dedicados de `DESIGN.md`: o `text-ui-xs` existente é elevado a
`text-ui-sm`; os históricos `text-base` / `text-sm` / `text-xs` migram respectivamente para `text-ui-lg` /
`text-ui-base` / `text-ui-sm`; `16px` / `14px` / `13px` / `12px` migram respectivamente para
`text-ui-lg` / `text-ui-base` / `text-ui-base` / `text-ui-sm`, e somente metainformação fraca abaixo de `10px` usa
`text-ui-xs`. A página de configurações não pode continuar usando tamanhos de fonte de UI arbitrários.

O conteúdo das entradas de formulário das páginas de configurações de tarefas fora do pico e de tarefas agendadas usa uniformemente `text-ui-base` + `leading-5` (padrão
`14px / 20px`): incluindo o título da tarefa, o resumo de agendamento ou o valor da seleção de agendamento, o corpo de Instructions e o placeholder.
As duas páginas devem reutilizar o mesmo contrato de tamanho de fonte de entrada, sem voltar a `text-ui-sm` em determinada frequência, estado de criação ou estado de edição.

A barra de ferramentas de instruções de tarefas fora do pico compartilha o mesmo conjunto de controles visuais e interações de acionamento com as tarefas agendadas: os controles de projeto, permissões, modelo e raciocínio
usam uniformemente `h-7`, `rounded-lg`, `text-ui-base font-normal`, sem fundo por padrão, e no hover e enquanto o menu está aberto usam uniformemente `bg-surface-hover` e sobem para a cor de texto principal; os menus abrem uniformemente para cima da barra e mantêm `4px` de distância do trigger. Não é permitido usar `focus-within`, `rounded-full` ou fundo local na página fora do pico para criar um conjunto de interações paralelo.
O menu de projeto é consolidado nesse contrato apenas no ponto de chamada de Automations; o chip de projeto de sessão comum não é afetado.

O componente de exibição da barra de ferramentas tem como única fonte de implementação o composer New Task: o projeto continua reutilizando
`ChatEmptyWorkspacePreviewMenu`, e agendamento e fora do pico apenas unificam os parâmetros de wrapper de Automations, o estado bloqueado e o placeholder sem projeto;
o modelo fora do pico reutiliza diretamente o modo de lista plana de `ModelConfigSelect`, e a intensidade de raciocínio reutiliza diretamente o modo select de
`ThoughtLevelCycleControl`; as permissões reutilizam diretamente o `ConfigSelect` do composer de sessão
(categoria mode), e nem agendamento nem fora do pico podem manter DropdownMenu replicados. A reutilização cobre apenas exibição, interação de teclado,
camadas flutuantes e restauração de foco, e não pode trazer o `inherit` das tarefas agendadas, a pré-visualização de modelo, a entrada de gerenciamento de modelos ou o estado de session para
tarefas fora do pico; tarefas fora do pico recebem a lista plana de modelos do Built-in `builtin:offpeak-idle-plan.models`, sempre submetem um modelo concreto,
e mantêm o nível de raciocínio padrão do D34.

O seletor de permissões segue a semântica de permissão elevada da caixa de entrada de sessão: somente quando `permissionMode=yolo` (acesso total) está selecionado,
o ícone e o texto de permissão do trigger usam continuamente `text-warning` em laranja e mantêm o laranja no hover / estado de menu aberto;
outros modos de permissão continuam usando a cor de primeiro plano padrão, e o chevron final mantém a cor enfraquecida. Após reutilizar o `ConfigSelect`, o ícone de permissão do
trigger muda conforme o valor atual (consistente com o composer de sessão), o menu tem `w-64` fixo e exibe opções de duas linhas com ícone + título +
descrição, e o item selecionado é assumido pelo destaque inicial no momento da abertura do menu; a página de Automations não tem caixa de entrada de chat,
então, ao fechar o menu, o foco deve voltar ao próprio trigger (`restoreFocusSelector=null` preserva o retorno de foco padrão do Radix),
sem cair no body. As permissões fora do pico devem reutilizar o mesmo glossário GLM e os mesmos Tooltips da caixa de entrada de sessão e das tarefas agendadas:
o título vem de `mode.label.glm.*`, a descrição de `mode.description.glm.*` e o Tooltip de
`chat.toolbar.mode.label`; isso é feito por meio de um mode option builder compartilhado recebe o provider `glm`, e não se deve mais manter textos exclusivos `offPeak.mode.*`, evitando divergência de nomes entre os três pontos.

O input composto de Instructions das tarefas fora do pico e das tarefas agendadas deve reutilizar o mesmo componente estrutural, evitando que as duas páginas mantenham
alturas e hierarquia de superfície separadas. O contrato desktop do Figma `4827:1399` é: moldura externa com `168px` de altura e raio de `12px`, corpo
com `116px` de altura e `8px` de padding, barra inferior com `52px` de altura e `12px` de padding; em telas estreitas apenas a
barra pode crescer por quebra de linha, sem alterar a altura do corpo.

## 2. Modelo de domínio

Os tipos de domínio ficam em `packages/shared/src/off-peak-types.ts` (não misturar com automation-types):

```ts
type ZCodeOffPeakTaskStatus =
  | "queued" // na fila, aguardando autorização do servidor
  | "paused" // usuário em Pause, interrompe o despacho (D30-10)
  | "running" // em execução
  | "completed"
  | "failed"
  | "cancelled"; // estado terminal

interface ZCodeOffPeakTask {
  offPeakTaskId: string; // chave primária local, usada também como server task_id (D26)
  serverTicketId?: string; // server Snowflake ticket_id; atualizado ao tirar novo número (D26)
  title: string; // Task title do formulário (D28)
  conversationId?: string; // taskId da conversa hospedeira; D30-8 não pré-cria conversa, preenchido após o primeiro despacho (também serve como sinal de "já despachado")
  sessionId?: string; // preenchido após a primeira execução; usado para o resume em 续跑/recuperação de interrupção (semântica de "existe = já tem sessão real" em que vários pontos dependem; proibido pré-preencher)
  prompt: string; // Instructions do formulário
  permissionMode: ZCodeTaskMode; // quatro níveis de permissão, todos abertos (D29-4); glossário atual do produto build/edit/plan/yolo, padrão "build" (Ask before changes)
  model?: string;
  thoughtLevel?: string; // intensidade de raciocínio (D34, alinhado a automation); ausente usa o padrão do workspace
  workspaceKey: string; // workspaceIdentity?.trim() || workspacePath
  workspacePath: string;
  workspaceIdentity?: string;
  status: ZCodeOffPeakTaskStatus;
  queuedAt: number;
  startedAt?: number;
  endedAt?: number;
  failureReason?: string; // falta de espaço em disco / diretório perdido / falhas consecutivas de API…
  filesChanged?: number; // exibição em notificação de conclusão e barra de status
  settledAt?: number; // ack de liquidação do estado terminal (D22)
  historyDeletedAt?: number; // apenas oculta a linha local de History; não apaga task/session/campos de execução (D37)
  createdAt: number;
  updatedAt: number;
}
```

Armazenamento: tabela `off_peak_tasks` em tasks-index.sqlite (reaproveita o banco e o padrão de Repo do AutomationRepo).
Novas colunas usam migração compatível com `ensureColumn`; é proibido recriar ou esvaziar as tabelas existentes do usuário.

Decisão de armazenamento de 2026-09-10 ([Todo104 §6.18.1](../working-memory/provider-refactor/steps/todo-104-pre-release-schema-review.md)):
o novo `model_selection` é a autoridade da seleção após a migração. Ao editar título, instruções, permissões ou a nova seleção, não se limpa nem se atualiza reversamente
as antigas colunas `model` / `thought_level`; os valores antigos servem apenas para leitura em rollback da versão antiga. Novos registros não forjam valores antigos.
Este item não altera os gates de edição queued/paused, a vinculação de Ticket nem as validações pré-execução, e também não faz a nova versão escolher modelo a partir das colunas preservadas.

A partir de D48, a **sessão já despachada** de uma tarefa fora do pico possui uma linha de task de primeira classe em tasks-index: a coluna `tasks.off_peak_task_id`
marca persistentemente a pertença (alinhada ao mecanismo `cron_automation_id` do cron; não reaproveita a marca do cron, ver D45),
e o id da linha = sessionId criado na primeira execução. `off_peak_tasks` continua sendo a única fonte de verdade da máquina de estados de fila/agendamento;
tarefas enfileiradas/pausadas (não despachadas) não geram linha de task (D48-A: sem linhas fantasma) e são gerenciadas apenas na visão principal de Automations.
O contrato da barra lateral está em §5.1.

### Máquina de estados

```
queued ⇄ paused（用户 Pause/Continue；票过期停在 paused 等手动继续）
queued ──服务端 ready 且被派发──▶ running ─────────▶ completed
  │                             │ ├─ 不可恢复错误 ─▶ failed
  │                             │ └─ 400/3102 ─────▶ queued（换票，复用 session）
  └── 用户取消（任何非终态） ──────────────────────▶ cancelled
```

Invariantes:

- Estados terminais são irreversíveis; modificações de arquivo nunca são revertidas.
- Uma tarefa pode executar várias instâncias concorrentes; a cota de concorrência é determinada pelo agendamento do servidor (D20); o despacho de uma única tarefa é single-flight para evitar duplicidade. O risco de conflito de arquivos em execuções concorrentes no mesmo workspace é o mesmo de conversas manuais concorrentes; não se adiciona isolamento.
- ~~trava do composer~~ (abolida por D28/D30): run session é uma conversa comum, e o prompt reenviado continua passando pelo CommandInbox existente; assim que a mensagem é admitida, ela assume a tarefa inteira, e a ordem de execução continua seguindo as regras de fila existentes. As operações da tarefa ficam no menu do cartão: queued「Pause / Delete」, paused「Continue / Delete」, running「取消」。
- O modo de permissão `build` / elicitation reutiliza a cadeia de interação da session comum: o Agent espera a resposta do usuário dentro da sessão, mas o estado agregado do Off-Peak permanece `running`, e o cartão não oferece estado de Review separado nem notificação dedicada. Aprovação/rejeição continuam no mesmo turno automático e ainda usam o idle Active Model daquele turno; não se promete a troca para o provider do usuário após aprovação prevista em D11/D27.
- failed não faz retry automático; o usuário pode reenfileirar manualmente = nova tentativa de submissão.

## 3. Regras de agendamento (D18/D26/D39: o cliente não hospeda o núcleo da fila)

- **A fila fica no servidor**: pool global de tarefas fora do pico, FIFO (por hora de criação da tarefa, primeiro criado primeiro enfileirado), e o servidor admitte uma certa concorrência conforme a folga de recursos.
- Três responsabilidades do cliente:
  1. **Tirar número**: ao criar a tarefa, `POST /ticket {task_id}`; o servidor devolve ticket/state/position, e só há gravação local da task se tiver sucesso. `429/3103 + next_take_at` indica que não é possível tirar número no momento.
  2. **Sincronização em lote + despacho**: quando há tickets não terminais, um timer compartilhado chama `POST /ticket/status`; quando o servidor responde `ready`, grava `schedulable=true` e o scheduler reivindica por FIFO local transacional.
  3. **Tratar espera de capacidade de messages**: quando o idle provider recebe HTTP `429/3105 + Retry-After`, espera e retenta dentro do adapter; providers comuns não passam por esse caso especial.
- **Não há janela a ser perdida (D21/D9)**: nada acontece durante sono da máquina / app fechado, e após a retomada a busca e o despacho continuam. ⚠ a estratégia de skip `MISFIRE_GRACE_MS` do automation não tem relação com isso e não deve ser reutilizada.
- Se `POST /ticket` retornar ready diretamente, o service grava imediatamente `schedulable=true` e acorda o scheduler; caso contrário, o ready é observado pelo batch status subsequente.
- Durante running, **cada** requisição de modelo pode ser **re-enfileirada** (D19): apenas o idle plan provider classifica HTTP 429/3105 como `OffpeakQueued`, com espera única de `min(Retry-After ou 60s, 5min)`, abort-aware, sondagem idempotente ilimitada e sem consumir o retry budget comum. stream só retenta antes de um limite de saída visível. O cliente não adiciona estado persistente; como running é gravado após o ACK de `sendPrompt`, a UI também permanece running enquanto a primeira requisição de messages aguarda um 429. Quando a espera pelo ticket ready expira no TTL, o 3102 troca o ticket de forma unificada, sem um mecanismo de estado separado de "abandonar o primeiro despacho após um limite".
- Despacho de execução: nova conversa = createTask + sendPrompt; continuação de conversa existente = resume sessionId + sendPrompt. permissionMode é enviado no despacho.
- Recuperação de interrupção: ao reiniciar o app e encontrar running residual (o processo morreu) → coloca de volta no início da fila como queued, e após autorização inicia a tentativa de novo e retoma a mesma session (essa é a implementação da texto de "continuar automaticamente após reinício").
- Provider: depois que a tarefa fora do pico é iniciada, o `sessionModelSelection` em tempo de execução mantém a escolha de retomada off-peak; o Agent em background, a retomada por SendMessage e o despertar pela conclusão do Bash herdam a mesma atribuição de execução e o ticket dinâmico; a escolha off-peak temporária não é escrita no `runtime/model_selection` comum. Quando uma mensagem do usuário é admitida pela CLI, ela assume imediatamente a tarefa inteira e atualiza a Session Selection conforme a ordem de admission; apenas mudar o menu de modelo não assume. Os subagentes em execução mantêm o modelo desta rodada, e os despertares e retomadas posteriores usam o modelo do usuário. Respostas de permission/elicitation não são novas mensagens do usuário e não alteram a atribuição do plano.
- Classificação de falha de despacho: rede, falha de inicialização do Agent e outros erros desconhecidos ou autocuráveis são `transient`, permanecem queued e usam backoff começando em 30s, com teto de 15min; ausência de modelo disponível no workspace do usuário, ausência de modelo disponível no idle plan ou credenciais duplas ausentes são `permanent` determinísticos, devem ir direto a `failed`, registrar o motivo e parar retries/retakes, cabendo ao usuário corrigir a configuração e reenviar. É proibido mascarar erros determinísticos de configuração como uma longa "espera por computação ociosa".

Os cenários de replay da UI oficial — layout da página inicial e quotas esmaecidas — também exigem o plano de controle da conta, um login válido e a conexão atual. O mock do gateway de retirada de número não fornece fatos de modelo do Registry; sem a conta preparada, não se deve assumir que a entrada de criação está visível.

## 4. Contrato atual do servidor (D26/D39; o cliente também fornece mock em processo)

### 4.1 Matriz de suporte do Coding Plan e fonte de verdade das credenciais (D40)

O contrato estático do servidor foi reconferido em
`zcode-server/main@ec2b18daa01b8e1b801f0691ac22153c2e56c6db`
(2026-07-22). `X-Coding-Plan-Api-Key` é uma key opaca no servidor: o verificador do Coding Plan faz a validação por provider de login JWT, separadamente para ZAI / BigModel, e também valida a validade do plano e a qual usuário a key pertence; ele não faz split pelo provider id do cliente nem repassa essa key ao upstream do modelo fora do pico.

Mas a integração do Team Plan no ambiente test em 2026-07-22 provou que a forma do header estático se manter correta não implica que a cadeia de dependências esteja compatível: o cliente já
parseia e envia corretamente a runtime key do projeto Team, mas a dependência de subscription do verificador do Coding Plan do servidor ainda rejeita essa key com
`3101 coding plan is required`, que depois é envolvida pelo servidor como `500/2007`. Portanto a matriz de suporte atual deve
distinguir "credencial/transporte suportados pelo cliente" de "disponível ponta a ponta no backend de teste":

| Família de provider / conexão selecionada atual                                                                              | Credencial de Coding Plan usada pelo Off-Peak                                                | Elegibilidade                                |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- | -------------------------------------------- |
| ZAI + `coding-plan:builtin:zai-coding-plan`                                                                               | a API Key de negócio original do provider ZAI Coding Plan selecionado                         | Suportado                                    |
| BigModel + `coding-plan:builtin:bigmodel-coding-plan`                                                                     | a API Key original do provider BigModel pessoal Coding Plan selecionado                       | Suportado                                    |
| BigModel + `team-plan:builtin:bigmodel-coding-plan:<product>:<organization>:<project>` completo                        | reutiliza o resolver de runtime-key do Team Plan, obtendo `${apiKey}.${secretKey}` pela organização/projeto selecionados | **Suportado pelo cliente; bloqueado pelo verifier do backend de test** |
| ZAI / BigModel Start Plan                                                                                               | Start Plan só tem o zcode JWT, que não é uma Coding Plan API Key                             | **Rejeitado**                                |
| Modo API Key, família/conexão não selecionada, provider de login divergente da família selecionada, conexão ausente/disabled/stale, Team key malformada | não há credencial de runtime do Coding Plan consistente com a seleção atual                 | **Rejeitado**                                |

`providerFamilyDomain`, o modo de família e `modelProviderFamilySelectedKeys` são a fonte de verdade da seleção de execução. É proibido varrer todos os
providers em cache e escolher qualquer key, e também é proibido fazer fallback para a key pessoal da BigModel quando a runtime key do Team Plan falha.
A configuração de gradual rollout cuida apenas da exposição; os membros de modelo vêm do Built-in `builtin:offpeak-idle-plan`. O clique no template da página inicial responde apenas "se existe algum Coding Plan": aqui a decisão é tomada pelo tipo de plano no snapshot de providers e pelo estado de desativação pelo sistema, sem exigir a seleção prévia de provider; depois de entrar no formulário de criação, a elegibilidade de envio continua sendo determinada pelo support snapshot de selected-connection, com dados anonimizados, do mesmo resolver, e é proibido enviar com família/conexão não selecionada.

O fluxo de credenciais/estado entre processos é o seguinte (as credenciais só existem na memória de host/service; somente o support anonimizado atravessa RPC):

```text
settingService
  providerFamilyDomain + family mode + selected connection key
                    |
                    v
        exact connection classifier
          | ZAI personal -> selected ZAI provider apiKey
          | Big personal -> selected BigModel provider apiKey
          ` Team        -> selected org/project + existing runtime-key resolver
                    |
credentialService --+--> OffPeakCredentialSnapshot
  active OAuth provider    { family, connection key/kind, jwt, codingPlanApiKey,
  zcode JWT                  organizationId?, projectId? }
                              |                 |                    |
                              |                 |                    `-> host dispatch
                              |                 |                        modelExecution.requestAuth
                              |                 |                        (auth + ticket + Team identity)
                              |                 `-> server client request snapshot
                              |                     availability/take/status/settle
                              |                     (auth + Team identity)
                              `-> sanitize -> IOffPeakTaskService RPC -> UI eligibility

client/configs gray enabled + support.supported + availability.canTakeNumber
                              |
                              `-> create entry enabled/locked
```

Na mesma requisição HTTP ou no mesmo turno despachado automaticamente, o snapshot é resolvido apenas uma vez e então preenche simultaneamente o JWT e a Coding Plan key, evitando
que a conexão selecionada mude entre duas leituras independentes e cause mistura de credenciais. Após uma mudança de seleção, a próxima operação resolve novamente; segredos não são gravados na task,
no SQLite, no catálogo do workspace ou no renderer state.

A nova selected connection key da conexão BigModel Team já contém organizationId/projectId. Os cinco
endpoints do Off-Peak devem injetar `bigmodel-organization` / `bigmodel-project` a partir do mesmo credential snapshot;
ambos são enviados em par somente após trim não vazio, e é proibido descobri-los por busca reversa a partir da API Key ou enviar apenas um deles. ZAI, planos pessoais BigModel e a antiga Team key que só contém projectId não enviam esses
dois headers, preservando o comportamento de autenticação existente.

Limite de evidência do runtime de test em 2026-07-22 (nem o texto das credenciais nem sua impressão digital podem ir para logs do cliente):

```text
selected BigModel Team org/project
  -> Team project key prewarm status=existing
  -> selected credential snapshot kind=bigmodel-team
  -> GET /ticket/availability（JWT + 非空 Team key）
  -> server Coding Plan subscription verifier: 3101 coding plan is required
  -> server contract wrapper: HTTP 500 / code 2007

另一次 POST /ticket -> HTTP 429 + 空 body
                     -> 全局 HTTP 限流；不是 3103 取号额度
```

O cliente não deve fazer fallback para a key pessoal da BigModel para contornar esse bloqueio, pois isso violaria a selected connection e a titularidade do plano; o backend precisa
fazer o verificador aceitar a credencial de projeto Team, ou oferecer um ramo explícito de verificação de elegibilidade Team. O cliente só exibe "cota esgotada" quando vê explicitamente
`429/3103 + next_take_at`; `500/2007` e o `429` cru sem código de negócio são exibidos uniformemente como indisponibilidade temporária,
e ao mesmo tempo o log do service mantém credential kind sem segredo, HTTP/code e request id, para correlação com o backend.

```http
# 0. 鉴权：Bearer JWT + 原始 Coding Plan API Key（服务端两级校验：登录 + coding plan 资格）
Authorization: Bearer <zcode-jwt>
X-Coding-Plan-Api-Key: <coding-plan-api-key>
# BigModel Team 额外携带当前选中连接的身份（五个端点一致；必须成对）
bigmodel-organization: <organizationId>
bigmodel-project: <projectId>

# 任务生命周期五接口（D39，前缀 /api/v1/off-peak）：额度快照 → 取号 → 批量查状态 → 调模型 → 结算
# 0. 查询新 ticket 可用性（只读快照；真实取号仍是最终权威）
GET /ticket/availability       → { can_take_number:true } | { can_take_number:false, next_take_at:<unix-ms> }
# 1. 取号（客户端提交 task_id，服务端返回 Snowflake ticket_id；同 task_id 过期后可重新取号）
POST /ticket                 { task_id } → { ticket_id, state, position, next_poll_after, ... } | 429/3103
# 2. 批量查状态（用 ticket_id；有非终态任务才轮，间隔按 next_poll_after；客户端只观察服务端已推进状态）
POST /ticket/status          { ticket_ids:[…≤100] } → { next_poll_after, tickets:[{ticket_id,state,position,active_deadline}] }
#    state: queued|ready|active|expired|settled|not_found；ready 写成本地 schedulable
#    本地 running 在 sendPrompt ACK 后写入，可能早于服务端 active
# 3. 调模型（= Anthropic /messages；ready 后 5min 内发首个即准入 active）
POST /anthropic/v1/messages  # 头 +X-Off-Peak-Ticket-ID: <ticket_id>，body 原生 Anthropic
#    429/3105 模型并发满→带 Retry-After，按 D24 min(Retry-After,5min) 退避；400/3102 ticket 不可用→触发续跑；400/3006 模型不在白名单；429/3103 取号超限→data.next_take_at + 刷新额度快照
# 4. 结算（客户端统一带双凭证；服务端当前只校验 JWT；无 body）
POST /ticket/:ticket_id/settle → { ticket_id, state:settled, settled_at }

# 5. 灰度配置（共用 client 配置接口，非本特性新开，零新增请求，Authorization 可选）
GET /api/v1/client/configs   → data.configs.offPeak: { enable_offpeak_task }
#    enable===true 时开放入口；模型列表来自 Built-in builtin:offpeak-idle-plan，准入以服务端校验为最终依据（3006 兜底）
#    额度（D39）：不再经 client/configs 下发；客户端通过 /ticket/availability 控制前置置灰。
```

### Semântica da cota de retirada de número (servidor off_peak_design.md, autoritativo)

- A configuração interna do servidor `take_number.{window, limit}` não é mais enviada ao cliente; o cliente só consome `can_take_number` e `next_take_at` de availability, e a **retirada de número real continua sendo a autoridade final de admissão** (excedente 429/3103).
- A contagem é dada por `off_peak_tickets.created_at` daquele usuário; **cada criação de ticket bem-sucedida conta uma vez**; submissões idempotentes do mesmo usuário com o mesmo `task_id` não contam de novo.
- A isenção idempotente **vale apenas enquanto o ticket mais recente não expirou**: se o ticket mais recente já expirou → tirar número de novo cria um ticket novo, **contando para a cota**. settle / expiração do ready / expiração do active **não devolvem** a vaga ocupada; quando o tempo de criação do ticket sai da janela móvel, a vaga se recupera automaticamente.
- Com a cota de availability esgotada → HTTP 200, `can_take_number=false` + `next_take_at` (Unix milissegundos); consultar novamente no horário indicado.
- Retirada de número realmente acima do limite → `HTTP 429 + code 3103 + data.next_take_at`; a corrida de concorrência entre consulta e retirada é coberta por essa resposta.
- Quando a consulta de availability falha, está carregando ou tem resultado desconhecido, a entrada é bloqueada; o próximo refresh bem-sucedido volta a liberar quando retorna `can_take_number=true`.
  A exposição por gradual rollout lê apenas `enable_offpeak_task === true`; quando a lista de modelos do Built-in está vazia, o formulário não pode ser enviado.

## 5. Checklist de UI (Figma, página Automations & Tarefas Fora do Picoé a única fonte de verdade; leia DESIGN.md antes de mudar packages/ui)

> **Cobertura temporária da página inicial New task (2026-08-20)**: atualmente `OffPeakNewTaskEntry` não é montado, e a página inicial não exibe
> a faixa de tarefas fora do pico nem o botão de template. A implementação do componente, os testes unitários e os contratos de layout/preenchimento da tabela abaixo são mantidos em reserva; todas as
> descrições antigas desta tabela que dizem "a entrada da página inicial New task está visível" são sobrescritas por este item, e o limite de produto deve ser reconfirmado antes de restaurar a montagem.

| Módulo                     | Especificação                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate de gradual rollout (D31) | Habilitado de forma efetiva = `configs.offPeak.enable_offpeak_task===true`; os membros de modelo vêm do Built-in `builtin:offpeak-idle-plan`, e quando vazio o formulário não pode ser enviado. Sem correspondência → apenas a tab Idle-time, o botão de criação fora do pico, os cartões de template fora do pico e o agrupamento da barra lateral fora do pico não são renderizados; Scheduled tasks e as tarefas agendadas existentes não são afetadas; o "bloqueio esmaecido para quem não tem coding plan" só vale após o gate ser atingido; desligado no meio → apenas esconde a entrada de criação fora do pico, tarefas fora do pico não terminais ainda são exibidas e rodam até o estado terminal, e sem estoque fora do pico a entrada fora do pico é ocultada |
| Visão principal de Automations | Quando scheduled e idle estão ambos vazios, as Tabs sem valor de filtro são ocultas e usa-se o grande cartão vazio do Figma; quando há tarefas, exibe as duas tabs Scheduled tasks / Idle-time task (D47 removeu a visão geral mista All; quando o gate não é atingido e não há estoque fora do pico, resta apenas a tab Scheduled, e o action row ainda carrega refresh e entradas de criação). O cabeçalho usa título principal `text-ui-lg` e descrição auxiliar `text-ui-base` para estabelecer hierarquia, e é proibido usar tamanhos arbitrários para contornar o DESIGN.md. Em modo lista, o action row do estado de lista carrega simultaneamente as entradas de criação Scheduled e Idle: a tab não selecionada fica transparente por padrão, exibindo fundo apenas no hover ou quando selecionada; `Create via chat` usa botão secundário com contorno, e `Idle-time task` usa botão primário. A faixa keep-awake é um switch global (espelho de「常规」na página de configurações) e é exibida nas duas tabs Scheduled / Idle: em modo lista fica antes dos cartões de tarefa, e no estado vazio mantém o grande cartão vazio na frente e a faixa atrás. Não há grade de mistura entre tipos; os dois tipos de cartão mantêm semântica de lista independente apenas dentro de sua tab. Abaixo das tabs da barra superior (quando a tab atual tem tarefas) exibe-se uma linha de pílulas de filtro de status「全部 / 进行中 / 已完成 / 失败」, compartilhada por Scheduled e Idle: fora do pico, queued/paused/running contam como「进行中」 e failed/cancelled como「失败」; em tarefas agendadas, a falha é determinada por o cartão exibir o selo de falha (`hasAutomationFailureState`), e o restante é agrupado pelo lifecycle. O filtro é "tudo" por padrão, não é persistido, volta a "tudo" ao trocar a tab da barra superior e não exibe contagens; quando o filtro casa com 0 itens, exibe「没有符合条件的任务」, sem reutilizar o estado vazio「还没有任务」. Quando, após o filtro, ambas as listas passam de 8 cartões, a própria grid rola (`max-h-[1198px] lg:max-h-[606px]`), e o limiar é calculado sobre a quantidade pós-filtro. Os templates de Idle e de Scheduled usam o diretório atual de Client Scenes e a grade de duas colunas. |
| Elegibilidade de criação     | O gate de navegação do template na página inicial é separado do gate real de criação: a página inicial só precisa que exista no snapshot de providers qualquer ZAI Coding Plan pessoal, BigModel Coding Plan pessoal ou BigModel Team Plan que o sistema não tenha marcado como inválido para entrar no formulário, sem exigir a pré-seleção de provider; quando realmente não existe nenhum Coding Plan, o template mantém a aparência normal, o clique dispara um Toast de assinatura que pode ser fechado e o Upgrade abre a janela de upgrade existente. As duas entradas de Upgrade fora do pico são unificadas em `coding_plan_upgrade_ck`, sempre com `eventRegion=app.session` e `upgrade_source=session_idle_time`, e criam um `purchase_funnel_id` que atravessa product/cycle/pay/result; ao disparar OAuth dentro do painel de compra, o funnel ID e a origem não podem ser perdidos. O envio do formulário, a entrada de criação de Automations, a solicitação de ticket e o runtime continuam compartilhando o selected-connection support snapshot; Start Plan/modo API Key/família ou conexão não selecionada/identidade do provider de login inconsistente/conexões disabled/stale bloqueiam o envio e mostram Tooltip. A admissão de criação é fail-closed: só é liberada quando availability retorna com sucesso `can_take_number=true`; false, carregando, desconhecido, erro de rede ou falha temporária de dependência deixam a entrada esmaecida e bloqueada. O Tooltip de false arredonda `next_take_at - momento atual` para cima, em minutos, e exibe a duração restante localizada em horas/minutos, sem data/hora absoluta; durante a espera ele atualiza por minuto, consulta de novo no horário e pode ser atualizado manualmente em caso de erro; a retirada de número real ainda cobre a corrida de concorrência após a consulta. |
| Formulário de criação (página inteira) | O cabeçalho no estado de criação é New Idle-time task, com title padrão=Untitled; esse valor padrão acompanha o locale enquanto o usuário não tiver editado e não for preenchimento de template, e entradas do usuário, rascunhos de template e títulos já salvos não são traduzidos automaticamente. Os exemplos de Instructions são fornecidos por locale. Project lista apenas projetos locais já abertos e disponíveis na janela atual, sem recent/remote; após a criação o projeto não pode ser modificado. As quatro permissões têm padrão Ask before changes, e na primeira submissão com algo diferente de Full access aparece um aviso uma única vez, mas o mesmo clique continua criando, sem segunda confirmação; o aviso de execução sem supervisão abaixo de Instructions usa `text-ui-sm` (padrão `12px`). O formulário de criação não exibe explicação da fila fora do pico, frequência gratuita nem cartão somente-leitura de "primeiro horário disponível", e o conteúdo do formulário começa diretamente no título da tarefa. O modelo vem do Built-in `builtin:offpeak-idle-plan.models`, a capacidade e os níveis de raciocínio vêm do Effective Model Config, e keep-awake apenas espelha as configurações globais sem alterá-las na criação. Título longo é truncado em uma linha no cabeçalho e não pode espremer o botão de voltar nem o controle keep-awake; no desktop o cabeçalho é alinhado inline como "voltar/título → 16px de espaço → separador vertical de 12px → 16px de espaço → keep-awake", e é proibido empurrar keep-awake para a extremidade mais à direita do contêiner; em telas estreitas todo o grupo de controles pode quebrar de linha com segurança. |
| Cartões da lista           | Selo de posição `#N in queue` / `#N Paused` (**sem Est.**); queued e paused usam a pílula roxa de ênfase fraca exclusiva das tarefas fora do pico, e é proibido reutilizar `brand`, que vira branco no Zai Dark; no Zai Light o primeiro plano/fundo é `#9E77ED / #F5F3FF`, e no Zai Dark é `#7B5CE5 / #160D38`. A Tag de agendamento das tarefas agendadas continua usando o verde semântico `success`, para estabelecer a distinção de tipo entre roxo (fora do pico) e verde (agendado). queued usa o ícone da lua; paused, independentemente de manter a posição ou não, usa o ícone de parada circular; running/completed/failed usam spinner/verificação/ícone semântico de aviso. No cartão em estado terminal, a parte inferior mostra apenas o status, sem acrescentar a contagem `filesChanged`; esse campo continua mantido para persistência, notificações e outros cenários fora do cartão. O menu é queued=Pause/Delete, paused=Continue/Delete, running=Cancel; a linha Pause mantém um ícone informativo ao final com Tooltip flutuante, cujo texto em inglês é `Tasks paused beyond the queue wait time will be placed back in the queue` e em chinês é`暂停时长超过队列等待时限的任务，将会被重新放回队列。`; ao escolher Pause a ação é executada diretamente, sem segunda confirmação. A confirmação de Delete em chinês é fixa com o título「删除此闲时任务？」, o corpo「此操作无法撤销。如果任务当前正在排队或运行中，将立即停止。」 e as ações「取消 / 删除闲时任务」; em inglês, o título `Delete this idle-time task?`, o corpo `This action can't be undone. If the task is currently queued or running, it will stop immediately.` e as ações `Cancel / Delete idle-time task`. Esse texto de confirmação não insere o título da tarefa do usuário, evitando que um título longo ocupe o espaço da explicação de risco. A lista é ordenada apenas por `createdAt` decrescente, sem agrupar por status, e mudanças de status da tarefa não podem alterar a posição do cartão; cartões terminais mantêm a opção de Delete e não são limpos automaticamente. Na linha de rodapé, os selos de status (incluindo o selo de posição ao lado do estado de falha) não podem encolher (`shrink-0`), e apenas「运行会话：{title}」 à direita pode suffer truncate; um título longo de sessão não pode reduzir o texto de status a um único caractere. |
| Tab History                | Uma task de uso único tem apenas 0/1 linha: fica vazia quando não há `startedAt` ou já existe `historyDeletedAt`; running=`In progress`, completed=`Succeeded`, failed=`Failure`, e cancelled após o início da execução=`Skipped`. A primeira coluna mostra o prompt truncado; o menu da linha é Go to session (quando há session) / Delete history. O menu de linha no desktop tem 160px de largura, raio de 10px e padding vertical de 6px, com um separador de 1px entre os dois itens; o menu abre deslocado 10px para a esquerda em relação à borda esquerda do botão gatilho, em vez de alinhar pela borda direita, e em telas estreitas o overlay continua sendo restringido ao viewport pela detecção de colisão. Delete history grava `historyDeletedAt` imediatamente, sem confirmação/Undo, e não apaga task, session nem campos de execução. |
| Templates                  | A página New task e Automations compartilham o diretório remoto de `clientScenesService.list()` em `off-peak-task.options.prompts.items`; o título vem de `labels` do idioma atual, apenas a descrição do cartão da página inicial New task prioriza `descs` do idioma atual e faz fallback para `contents` quando ausente ou em branco, enquanto a descrição dos cartões de Automations e as instructions pré-preenchidas continuam vindo de `contents` do idioma atual; templates com título vazio nos dois idiomas são recusados diretamente. Ao clicar, os valores de configuração são copiados para um rascunho comum de usuário, abrindo apenas o formulário, sem criar, tirar número nem enviar; depois de entrar no formulário, troca de locale, novo fetch de Client Scenes ou refresh em segundo plano não podem sobrescrever a edição do usuário. A falha de Client Scenes não pode bloquear a criação manual em Automations; as áreas de template de fora do pico e agendado visíveis em Automations mostram 4 cartões de esqueleto padrão durante o carregamento do diretório (duas linhas de duas colunas no desktop, uma coluna natural no celular), e o estado de esqueleto termina após sucesso, falha de negócio ou falha de rede; quando o diretório remoto correspondente está vazio, exibe-se o「无可用模板」 localizado. A área de templates fora do pico de Automations mostra apenas o diretório remoto, sem injetar o Customize local. A área de templates da página inicial New task usa uma regra de seleção fixa própria: filtra o Customize remoto, toma no máximo as duas primeiras templates comuns disponíveis na ordem original do remoto e depois anexa o único espaço em branco local Customize como último item, de forma fixa; quando não há template comum remoto disponível, mostra apenas o Customize local. A metadata de scene/item/default do servidor não entra na persistência off-peak, e a tarefa salva apenas os campos finais do formulário confirmados pelo usuário. A entrada fora do pico da página inicial New task não fica mais logo abaixo do composer de chat, e sim em uma **área fixa no rodapé** da página de rascunhos, mantendo `38px` de distância do fundo da página e sem rolar junto com o conteúdo da conversa; entre a linha da faixa da entrada fora do pico e o botão de template há `12px` de espaçamento vertical fixo. O ícone de megafone da faixa e o texto principal formam um único bloco **centralizado horizontalmente**, e o texto principal deve aparecer completo, sem truncamento por reticências; as duas observações de elegibilidade entre parênteses migram para o Tooltip, a área completa do texto principal é a zona de disparo de hover e de foco de teclado, sem ícone de dica adicional e sem `cursor-help` com interrogação, mantendo o cursor de seta comum. Em larguras estreitas o texto principal pode quebrar linha naturalmente. Os botões de template usam **arranjo horizontal de uma linha e múltiplas colunas**: no desktop, três colunas de largura igual, com o contêiner dos botões usando limite `780px` combinado com `w-full` para encolher, e `16px` de espaçamento entre colunas; quando a tela estreita não acomoda com segurança três colunas, muda-se para uma coluna, evitando que textos em chinês/inglês e áreas de clique sejam comprimidos. A descrição do template exibe no máximo 2 linhas sem altura de linha fixa, e a linha mais alta da mesma linha da grid estica uniformemente a altura dos cartões. Não se deve manter auto-rotação, arrastar, indicadores de ponto nem qualquer outra interação de carrossel. O botão de fechar à direita da faixa não é oferecido nesta rodada de design: a implementação e o i18n são mantidos, mas invisíveis, e a semântica de `newTaskBannerDismissed` não muda. A página inicial New task decide a navegação por "qualquer Coding Plan": sem plano, o clique vai para o Upgrade Toast; com plano mas sem provider selecionado, é permitido entrar no formulário e o gate de selected-connection do formulário continua proibindo o envio; o gate de gradual rollout, a decisão de Coding Plan, o Upgrade Toast, o pré-preenchimento de rascunho e a telemetria `session_idle_time` permanecem totalmente inalterados após a consolidação de layout. |
| Barra lateral              | O agrupamento de sistema da visão Group「Idle-time tasks」= o agrupamento de sistema real do tasks-index (D48-A: `OFF_PEAK_DEFAULT_GROUP_ID`, isomórfico ao agrupamento do cron; a visão Project não mostra agrupamentos de sistema independentes; o contrato completo está em §5.1). Os membros do grupo = **as sessões fora do pico já despachadas** (isomórfico ao grupo do cron, que só contém produtos de execução); tarefas enfileiradas/pausadas não entram na barra lateral antes do despacho e são gerenciadas apenas na visão principal de Automations (mesmo escopo da visão grouped: apenas projetos já abertos). No fim da linha, o task meta `offPeakTaskId` exibe o marcador da lua e o tempo relativo de `updatedAt`, sem selo de posição; clicar na linha entra na conversa da session. Folding, recolher tudo, arrastar dentro do grupo, arrastar o grupo inteiro e fixar no topo seguem o pipeline nativo grouped e sua persistência. Fechar a linha = arquivar (sem diálogo de confirmação); as entradas de exclusão/cancelamento ficam no menu do cartão em Automations. O "+" do cabeçalho do grupo abre o Automations. |
| Edição                     | Em queued/paused todos os campos são editáveis; a partir de running fica bloqueado (apenas cancelar); estados terminais são somente leitura; o diálogo de descarte de rascunho compartilha a apresentação de confirmação de Automation com o scheduled: 448px de largura no desktop, altura mínima de 180px. Em chinês é fixo com o título「丢弃闲时任务的草稿？」, o corpo「你对当前闲时任务的更改将会丢失。」 e as ações「取消 / 丢弃」; em inglês, o título `Discard Idle-time task draft?`, o corpo `Your changes to the current idle-time task will be lost.` e as ações `Cancel / Discard`. |
| Notificações               | A agregação do Off-Peak envia apenas notificações de conclusão/falha; as notificações de confirmação como permission/elicitation ficam a cargo do fluxo de notificações da sessão comum, evitando notificação duplicada da mesma requisição. |
| Multiplataforma            | No celular, `/remote` oculta completamente a navegação e as rotas de Automations, e rotas obsoletas caem no chat; no desktop, workspace remoto oculta Idle-time. Tanto Scheduled quanto Idle-time novos só permitem projetos locais; tarefas remotas existentes continuam visíveis e gerenciáveis. |

`OffPeakNewTaskEntry` mantém a restrição de largura independente da área fixa inferior, mas atualmente não é montado na página inicial New task: a faixa usa limite `580px` e os três botões de template
usam o limite `780px` do layout original; ambos combinam `w-full` para encolher em telas estreitas, sem depender de breakpoints de `@container/conversation` para expansão lateral. Essa regra de largura
atua apenas na própria entrada fora do pico e não pode alterar sincronamente o composer, o título, o ícone Z ou componentes globais.

A visão principal de Automations e o componente de template em reserva da página inicial New task compartilham a semântica de mapeamento remoto, mas cada uma mantém seu próprio estado de exibição e fallback:
Automations mostra apenas o diretório remoto completo; a área de templates da página inicial filtra o Customize remoto, toma no máximo as duas primeiras templates comuns remotas na ordem do diretório
e depois anexa o Customize local fixo como último item. Quando as templates comuns remotas estão vazias, a página inicial mostra apenas o Customize local. O refresh do diretório remoto afeta apenas
cartões de template ainda não clicados. A descrição do cartão da página inicial prioriza `descs` do locale atual, com fallback para `contents` quando ausente ou em branco; quando o usuário clica,
apenas `labels` / `contents` são materializados no rascunho entre páginas, e depois disso o
`OffPeakEditView` assume o controle pelo state local. Um `contents` vazio no template Custom significa instructions em branco e não pode fazer fallback para o
prompt de outro template.

Os ícones de template fora do pico tanto da visão principal de Automations quanto da página inicial New task interpretam o `img` do prompt item remoto como um
nome canônico Lucide e o carregam dinamicamente pelo nome, exibindo a `16px`; o SVG usa `currentColor` herdando a cor de texto do slot do ícone.
Quando `img` está ausente, em branco, o nome não pertence à versão atual do Lucide ou o carregamento do módulo falha, Automations continua usando o mapeamento semântico Lucide existente pelo id do item,
e a página inicial continua com o fallback existente `Moon`. `imgs` não participa da escolha do ícone de template fora do pico. O Customize local
não tem `img` remoto: Automations mantém `SlidersHorizontal` e a página inicial mantém o fallback `Moon`.

Quando o componente em reserva da página inicial New task for montado novamente, ele compartilhará com os templates fora do pico e agendados de Automations o cache de dados brutos do Client Scenes SWR dentro do renderer.
Montagens concorrentes da mesma Service authority fazem apenas uma requisição, e resultados bem-sucedidos são reutilizados dentro de uma janela de dedupe de 10 minutos sem polling. Cache frio exibe o
esqueleto de Automations; cache quente exibe imediatamente as últimas templates conhecidas boas e revalida em segundo plano, e a falha de revalidação não pode limpar os cartões nem sobrescrever o rascunho de formulário já
materializado. A troca de Service/Host attachment usa uma cache key isolada; esse cache em memória não entra na persistência off-peak, automation,
session nem localStorage. Quando a página realmente passa por `hidden -> visible`, a Service/cache authority atual deve contornar a janela de dedupe e forçar uma revalidação;
vários consumidores de templates fundem as requisições, e foco comum, visible repetido ou o primeiro visible não provocam invalidação forçada.

```text
useClientScenesResource(service authority)
        |
        +--> cold pending: Automations 当前可见模板区显示两行骨架
        +--> cache hit: 立即展示旧目录，必要时后台重验
        |
        v settled
off-peak-task 远程候选目录 ----+----> Automations 完整模板区 / 失败降级
                               `----> New task 前两条普通远程模板 + 本地 Customize
                                                   |
                                                   | 点击时复制当前语言值
                                                   v
                                           OffPeakEditView 本地草稿
                                                   |
                                                   `-- 用户确认/取号 --> OffPeakTaskService --> off-peak record
```

O texto da faixa da página inicial New task é uma mensagem de produto estável; como as observações migraram para o Tooltip, os parênteses em chinês e inglês não são mantidos, e o Tooltip exibe tudo em uma única linha completa:

- `zh-CN` texto completo: 订阅用户新功能体验：创建“闲时任务”，我们将免费在算力富余时段为你完成指派任务。本功能不消耗订阅用户套餐额度, 本功能仅面向订阅用户开放
  - Texto principal: 订阅用户新功能体验：创建“闲时任务”，我们将免费在算力富余时段为你完成指派任务。
  - Tooltip: `本功能不消耗订阅用户套餐额度、本功能仅面向订阅用户开放`
- `en-US` texto completo: New feature for subscribers: Create "Idle-time task" , We will complete your assigned task for free during periods of surplus computing power. This feature does not consume your subscription plan quota and is available exclusively to subscribers.
  - Texto principal: New feature for subscribers: Create "Idle-time task" , We will complete your assigned task for free during periods of surplus computing power.
  - Tooltip: `This feature does not consume your subscription plan quota and is available exclusively to subscribers.`

Os títulos de templates remotos da página inicial são resolvidos a partir dos `labels` de Client Scenes do locale atual; a descrição prioriza `descs` do mesmo idioma,
com `contents` como fallback, e exibe no máximo 2 linhas; as instruções do rascunho são sempre materializadas a partir de `contents`. É proibido que a página inicial exiba um conjunto de textos estáticos diferente do usado pelo rascunho entre páginas. Apenas as chaves i18n `offPeak.newTask.template.customize.title` / `.description` do Customize local de
fallback são mantidas, resolvidas via intn em tempo de renderização; o catálogo não pode mais guardar uma cópia dos textos cn/en. A interface em chinês deve exibir e preencher em chinês, e a em inglês em inglês;
depois de entrar na página de criação, o rascunho é tratado como entrada comum do usuário e não é sobrescrito por troca posterior de idioma. As chaves de locale de templates estáticos já removidas
não devem continuar existindo, evitando uma segunda fonte de verdade frente ao diretório remoto de Client Scenes.

As descrições de template fora do pico da página inicial e de Automations compartilham as regras de quebra de linha em frases para o chinês: quando suportado, usa-se
`word-break: auto-phrase`, combinado com `line-break: strict` e `text-wrap: pretty`, evitando que palavras de dois caracteres como 简报 sejam quebradas em caracteres isolados ou que a pontuação caia no início da linha; a regra original continua valendo
sejam quebradas em caracteres isolados ou que a pontuação caia no início da linha; navegadores sem quebra por frase voltam à quebra normal, e é proibido usar
`keep-all`, que causaria overflow em telas estreitas.

O cartão de estado concluído deve manter um nível de hierarquia estático e enfraquecido consistente com as tarefas agendadas: o cartão inteiro usa `opacity-60`, com título, descrição, status
e ícones todos rebaixados, e o estado de conclusão usa `text-foreground-subtle`, sem continuar usando o destaque success; no hover a opacidade enfraquecida é mantida, mas
é obrigatório exibir o feedback de fundo `bg-hover` e revelar as ações disponíveis. O ícone de conclusão usa o SVG local `square-check` exportado do Figma `4768:1998`,
preservando `16px` de tamanho e traço com raio de `1.333px`, e não deve usar um ícone aproximado do Lucide. Esse enfraquecimento expressa apenas o estado terminal e não pode adicionar comportamento
como desabilitado ou `pointer-events-none` ao cartão ou à área de ações; o«mais» no canto superior direito continua acionável por mouse e teclado, preservando ações
disponíveis como a exclusão da tarefa terminal.

A ação de voltar e o botão de envio no estado de criação das páginas de criação/edição seguem o Figma `4970:2056`: usam respectivamente os vetores originais do design
`arrow-left-sm` e `Full Stack-play`, salvos como SVGs locais no repositório, sem continuar usando ícones aproximados do Lucide. Ambos mantêm `16px` de placeholder externo, com a
geometria do glyph e o traço de raio `1.33px` renderizados conforme o original do Figma; a cor do ícone acompanha a cor de texto semântica do controle onde está, para
compatibilidade com temas claro/escuro e estados de hover/disabled. O texto de voltar das páginas de criação/edição de Scheduled e
de Idle-time usa uniformemente `text-ui-base` (padrão `14px`) e altura de linha de `20px`.
O controle de voltar não exibe fundo por padrão e usa `bg-hover` e cor de texto principal no hover ou no foco por teclado, mantendo a
área de clique `rounded-lg`; ao entrar na página de criação a partir de um caso de template da página inicial, esse estado de interação não pode ser perdido. O
switch compartilhado pelas páginas de automations deve exibir o feedback de contorno semântico `border-hover` no hover, e não pode ter apenas estados de clique e foco.

O menu de ações do cartão de tarefa segue o Figma `4579:913`: a ação de pausar usa `stop-circle` e não pode usar o `pause-circle` de duas barras verticais; a ação de editar usa
`Full-stack-edit` e não pode usar o `Pencil` aproximado do Lucide. Os dois ícones são salvos como SVGs locais no repositório, mantêm o tamanho original do glyph do design dentro do placeholder de `16px`
e herdam a cor de texto atual do menu por mask, para compatibilidade com Zai Light, Zai Dark, hover e disabled.

O estado「pausado」do cartão de tarefa agendada segue o Figma `4622:5289`: usa o vetor de traço `stop-circle` da mesma família, e é proibido voltar a um quadrado sólido dentro de um círculo;
a linha de status mantém o placeholder de `20px` para o ícone, com glyph interno de `14.6667px` e largura de traço de `1.33333px`. O ícone continua herdando por mask a cor semântica de status,
garantindo consistência entre temas claro e escuro.

A barra de dica Keep-awake da visão principal de Automations usa raio fixo de `10px`, com padding superior, inferior e esquerdo de
`12px`; o breakpoint de desktop não pode sobrescrever o padding vertical para `0`. O switch à direita mantém o espaçamento seguro de `12px`. Entre o action row em modo lista e a
barra de dica Keep-awake logo em seguida há um espaçamento vertical fixo de `20px`.

Quando a tab atual exibe ao mesmo tempo pelo menos um cartão de tarefa real e pelo menos uma área de templates, as duas áreas seguem o Figma `4835:5515`:
insere-se um divisor de largura total de `1px` com `bg-surface`; o contêiner do divisor mantém `8px` acima e abaixo e continua participando do espaçamento externo de bloco de `32px`, de modo que o
espaçamento visual do cartão até a linha e da linha até o título dos templates seja de `40px`. O divisor não aparece quando qualquer um dos lados está vazio.

Quando a visão principal de Automations tem tarefas, entre as duas tabs Scheduled tasks / Idle-time task há um espaçamento fixo de
`8px`, reutilizando `gap-2` do design system; no grupo de ações de refresh e criação à direita, os controles adjacentes mantêm `12px` de espaçamento,
reutilizando `gap-3`. Controles ocultados condicionalmente pela tab não ocupam espaço extra.

As tabs e os botões de criação dentro desse action row usam uniformemente `text-ui-base font-normal` (padrão `14px / 400`),
e é proibido que os botões usem `font-medium` isoladamente, criando um peso de fonte inconsistente. O botão de criação de Idle-time task é um botão de texto puro,
sem ícone de lua ou cadeado; o estado desabilitado usa `bg-surface` +
`text-foreground-subtlest` como uma camada cinza sólida e mantém `opacity: 1`, e é proibido simular o desabilitado reduzindo a opacidade do botão primário branco como um todo.

O estado vazio de History sem registros segue o Figma `4866:3110`: mantém altura mínima de `226px`, borda com raio e texto centralizado, e o contêiner usa fundo sólido `bg-background`
(que resolve para `#161616` no Zai Dark), evitando que o material nativo da janela transparente do Electron apareça; essa regra de fundo vale apenas para o
estado vazio sem registros e não altera o cabeçalho nem o estilo de hover de linha da tabela com registros.

Os ícones da faixa de templates fora do pico na página New task seguem o Figma `4810:1407`: tanto o megafone quanto a ação de fechar usam
placeholder externo de `32px`, com glyph interno fixo de `16px`, adotando uniformemente traço de raio `1.33333px` e a mesma cor e
opacidade. O megafone deve usar o glifo `announcement-03` do design e o ícone de fechar deve usar o glifo `x-close` da mesma
família; é proibido substituir por ícones genéricos com peso visual diferente. O texto da dica é renderizado como um único nó de texto internacionalizado
contínuo, sem inserir um flex `gap` entre título e descrição; em chinês não se adiciona espaço e em inglês só se mantém o espaço comum único exigido pela gramática. O
texto e os dois ícones herdam uniformemente `text-foreground-subtle` e `80%` de opacidade, e não é permitido que a cor própria do SVG e a opacidade do texto
sejam calculadas separadamente, gerando divergência de cor. Depois que a entrada foi movida para a área fixa inferior, a ação de fechar está temporariamente invisível ao usuário, mas as especificações e a implementação do ícone de
fechar acima devem ser preservadas como estão, para facilitar a restauração quando o produto reabrir a exibição.

Contrato visual da barra lateral: o agrupamento de sistema Idle-time reutiliza o estilo de exibição compartilhado de Scheduled tasks dentro das grouped tasks, e não pode manter header, selo de contagem, guia vertical ou classes das linhas de tarefa separados. Os dois usam o mesmo tamanho de linha de título, a seta de folding logo após o título e os estados de hover/focus, e entram no mesmo fluxo vertical de agrupamentos de sistema; o section gap da seção de tarefas do pai não pode ser inserido entre os dois, e o espaçamento entre grupos é controlado apenas pelo group container compartilhado. Os dois mantêm suas próprias cores semânticas: Scheduled tasks usa o marcador Hash azul e a guia azul, e Idle-time usa o marcador Hash roxo e a guia roxa; após a consolidação do D48 os dois compartilham a mesma fonte de dados do grouped view e o mesmo pipeline de folding/ordenação (ver §5.1). A linha de tarefa Idle-time segue a estrutura de Scheduled, com "título à esquerda, ícone e tempo relativo à direita", e o fim da linha usa o ícone da lua para identificar a origem de tarefa fora do pico (decidido pelo task meta `offPeakTaskId`), reutilizando `formatTaskRelativeTime(updatedAt)` para exibir o tempo; no hover, assim como em Scheduled, a lua/o tempo são ocultados e as ações nativas da linha grouped são exibidas. Exibir a árvore de arquivos abre o workspace ao qual a tarefa pertence; mover para o topo/arrastar dentro do grupo é persistido pelo pipeline nativo de ordenação grouped em `task_group_members.sort_order`, sem alterar `queuedAt`, o FIFO do servidor ou a ordem de agendamento; fechar equivale a arquivar (semântica unificada no D48, ver §5.1), e as entradas de exclusão/cancelamento ficam no menu do cartão em Automations. O folding ainda é disparado pela área do título, e as novas entradas e as ações das linhas de tarefa não podem acionar folding ou navegação de tarefa por engano.

**Entradas removidas**: o switch da lua no composer (proposta original do PRD, paradigma invalidado) e o toast de 429/cota esgotada dentro da conversa. ~~Create via chat integrada ao fora do pico~~ foi restaurada pelo D49 como ferramenta de criação dentro da sessão; o contrato está em §5.2.

### 5.1 Contrato de convergência das linhas de primeira classe na barra lateral (D48-A, substitui o id virtual de folding e o mecanismo de ordenação do renderer)

Desde o D48, o agrupamento da barra lateral de tarefas fora do pico converge para um agrupamento de sistema real no tasks-index, reutilizando inteiramente o pipeline da grouped view.
O id de grupo virtual (`zcode-off-peak-sidebar-group`) implementado na manhã de 2026-07-28, a ordenação por
`zcode-off-peak-sidebar-order` no localStorage, o DndContext independente dentro do grupo e a
deduplicação da projeção de sessões off-peak (`off-peak-session-projection`) foram por completo aposentados; as preferências locais de folding/
ordenação são aceitas como redefinidas, sem migração (esse mecanismo não chegou a ser publicado na versão oficial).

Linhas de primeira classe (copiadas das quatro peças do cron):

- task meta com campo persistente `offPeakTaskId`: tipo + schema de runtime, parâmetros de `createTask`/`resumeTask`,
  preservação da marca em `syncTaskMeta` (o snapshot de runtime não carrega a marca, é obrigatório usar o valor já salvo como fallback), e na primeira obtenção da
  marca, `ensureOffPeakGroupMembership` (linhas de grupo / ordenação de topo / relação de membro são todas escritas com INSERT OR
  IGNORE de forma idempotente, nunca sobrescrevendo a organização manual do usuário). Não reutiliza o `cronAutomationId` do cron (D45:
  entidades irmãs usam suas próprias marcas).
- id de grupo de sistema `OFF_PEAK_DEFAULT_GROUP_ID` definido no shared, ao lado de `CRON_DEFAULT_GROUP_ID`
  (a premissa anterior de "não entrar no shared" era a ausência de membership real, premissa que desaparece com o D48).
- O marcador da lua é um julgamento puramente de meta (`isOffPeakTask`); a linha de task não consulta de volta o store off-peak.
- Migração de dados existentes: tarefas com `sessionId` recebem a marca de volta via join em `off_peak_tasks.session_id` (o bootstrap MR1
  já fez isso) + as relações de membro (novo nesta seção, ensureOffPeakGroupMembership linha a linha, idempotente).

Workspaces remotos estão explicitamente fora do suporte (a tarefa fora do pico v1 é exclusiva da desktop local):

- O caminho de despacho é voltado apenas a workspaces locais, e sessões remotas não recebem `offPeakTaskId`; a grouped view
  remota não mostra o agrupamento de sistema Idle-time.
- A escrita de agrupamento ignora identidades remotas (guarda em `ensureOffPeakGroupMembership`); o backfill de bootstrap de
  relações de membro também ignora linhas existentes cujo `workspace_key` seja uma identidade remota — a coluna
  `workspace_identity` de linhas históricas pode estar ausente, e recalcular a key com `workspacePath` escreveria a relação de membro no
  workspace local de mesmo caminho (review CR-01).

Visibilidade de queued/paused (D48-A, substitui a escolha de linhas fantasma da primeira versão do grill):

- **Membros do grupo = sessões já despachadas**, totalmente isomórficos ao grupo do cron, que só contém produtos de execução; tarefas enfileiradas/pausadas não geram linha no tasks-index nem sobem para a barra lateral antes do despacho, e a visão principal de Automations é a única superfície de gerenciamento da fila.
- `sessionId` / `conversationId` mantêm a semântica de preenchimento após a primeira execução (a semântica de "existe = já executou" é dependida pelo gate de History Go-to-session, pelas entradas de cartão e em vários outros pontos; proibido pré-preencher).

Comportamentos copiados do cron (aceitos explicitamente, sem casos especiais):

- Escopo = o escopo de workspace aberto da grouped view (a visão principal de Automations continua sendo a superfície global da fila).
- Relação de membro frouxa: linhas fora do pico podem ser arrastadas para fora do grupo e sessões comuns podem ser arrastadas para dentro; a marca acompanha a linha, não o grupo, e arrastar para fora não perde a
  identidade da lua, e o OR IGNORE de ensureMembership não a traz de volta.
- Ordenação no grupo: por padrão as mais recentes primeiro; após ordenação manual, novos itens caem no fim do grupo por falta de ordem.
- Grupo vazio permanente: depois que todas as sessões são excluídas/arquivadas, o grupo vazio permanece, e o "+" do cabeçalho do grupo serve de entrada para tarefas fora do pico (o grupo não existe antes de produzir a primeira sessão fora do pico, então usuários que nunca usaram o recurso não veem o grupo vazio).
- Cabeçalho do grupo: proibido renomear ou dissolver; a cor pode ser alterada (`isOffPeakGroup`, mesmo mecanismo de `isCronGroup`).

A única coisa não copiada: o "+" do cabeçalho do grupo abre a visão principal de Automations (o "+" do cron cria um rascunho comum dentro do grupo, o que é um erro semântico para
tarefas fora do pico — um rascunho não é uma tarefa fora do pico).

Explicitamente não feito: guardas de fechamento de membros, selo de posição no fim da linha, flag temporária para a convergência, migração de preferências locais de folding/ordenação.

**Adiado (deferred): o esquema de linhas fantasma.** Se no futuro houver um sinal real de usuários exigindo visibilidade de tarefas enfileiradas/pausadas na barra lateral, ativa-se a extensão incremental
"pré-alocar um sessionId na criação para escrever a linha + supressão total" (o protocolo já suporta criar sessão com id). Os custos registrados na revisão
da época: a supressão não tem chokepoint único (taskIndexItems alimenta ao mesmo tempo a grouped view e a lista plana), o
pré-preenchimento de `sessionId` quebra o contrato implícito de "existe = já executou" (do qual History, cartões e vários pontos dependem), e "linha sem sessão"
torna-se um invariante de três estados do sistema inteiro. A→linha fantasma é uma evolução puramente incremental, sem retrabalho.

### 5.2 Criação dentro da sessão (D49, novo na v2)

O usuário cria tarefas fora do pico em linguagem natural dentro de qualquer sessão, alinhado ao paradigma de `CronCreate` das tarefas agendadas; por baixo, a criação pelo formulário passa pelo mesmo `OffPeakTaskService.createTask` (a criação já tira número, fail-closed, e o 3103 do servidor é a autoridade final).

**Superfície de ferramentas** (agent tools, ligadas ao host pelo zcode-protocol `offPeak/create` / `offPeak/list`):

| Ferramenta      | Parâmetros                                                            | Descrição                                                                                                                                                                                                                                                                                                |
| --------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OffPeakCreate` | `title`/`prompt` obrigatórios; `permissionMode`/`model`/`thoughtLevel` opcionais | Padrão = **yolo (totalmente automático) / último de `allowed_models` / nível de raciocínio mais alto** (divergência deliberada em relação ao padrão do formulário, motivo em D49-4); a resolução do padrão ocorre no host; quando `model` é informado, faz pré-validação contra allowed_models. `needsApproval: true`. **D50: sempre vinculada à sessão atual** (a porta recebe `boundSessionId`), e no despacho faz resume desta sessão para executar o prompt original da tarefa; recusa criar quando esta sessão já tem uma tarefa fora do pico não terminal. |
| `OffPeakList`   | sem parâmetros                                                        | Somente leitura, retorna os campos mínimos das tarefas fora do pico do workspace atual (id/title/status/posição/horário/sessionId?), para o agente responder sobre o status das tarefas.                                                                                                                                    |

**Limites de turno**:

```text
普通用户 turn ──────────── OffPeakCreate ✅  OffPeakList ✅
cron automation 自动 turn ─ OffPeakCreate ✅（D49-3 组合玩法） OffPeakList ✅
turn de despacho automático off-peak ───────── OffPeakCreate ❌ entrada de execução de Workflow/dynamic workflow ❌ CronCreate ❌; SendMessage ✅ Agent em background ✅ Bash em background ✅ OffPeakList ✅
subagent_child ──────────── 均不注册
```

**Registro de ferramentas e admissão de chamada (3.12.2)**: o Host local sincroniza `workspace/updateOffPeakToolPolicy` com base nas condições de montagem do serviço e de suporte do workspace, e preserva a flag de mesma origem do create/resume legacy/V4. Essa decisão não lê gradual rollout, plano nem catálogo de modelos; quando o rollout é desconhecido/desligado, a sessão local ainda registra as ferramentas. CLI puramente, workspace remoto e subagente mantêm os limites atuais de não registro. Só depois que a chamada real de OffPeakCreate entra no handler do Host são lidas as informações atuais de rollout, plano e modelo, e após passar a criação e a retirada de número acontecem; em caso de falha não há efeito colateral de criação. OffPeakList mantém a consulta local com isolamento por workspace.
As entradas de página continuam seguindo o D31; a denylist de turno idle, as aprovações, a guarda de vínculo e a admissão final do servidor permanecem inalteradas.

**Cartão no fim do turno**: após a conclusão da resposta, renderiza-se um cartão estático depois do corpo do assistente (o mesmo pipeline do cartão `CronCreateAutomationCard` do cron): ícone da lua + título da tarefa + snapshot da posição no momento da criação (`#N in queue`) + botão「去到闲时任务」.
Não assina estados posteriores. O botão e o clique principal do cartão vão para `onOpenAutomationsMain(offPeakTaskId, "idle")` →
a tab idle de Automations faz o roteamento pelo prefixo `offpeak-` → a view `offpeak-edit` (queued/paused editável,
running/estados terminais em readOnly, D30-7); quando a tarefa já foi excluída, toast targetNotFound.

**Execução na sessão vinculada (D50)**: a tarefa é executada na sessão que a criou. Antes do despacho, o sistema sonda se a sessão está executando um turno do usuário; se estiver ocupada, há
backoff transient e nova tentativa sem alterar nenhuma configuração da sessão; o modo de permissão gravado no despacho (padrão yolo) não é revertido ao fim da tarefa; o Stop do chat segue o comportamento de parada do Agent comum; somente o「取消」do cartão de tarefa encerra a tarefa off-peak inteira e suprime despertares tardios; se a sessão vinculada for excluída, a falha é permanent. O rodapé do cartão de Automations e a página de edição exibem o título da sessão vinculada
(`sessionTitle`, buscado junto na listagem via tasks-index), e a página de edição distingue a parada do chat do cancelamento pelo cartão de tarefa. A criação pelo formulário continua criando uma session independente.

**Não feito**: ferramentas de update/cancel dentro da sessão; congelamento do título da sessão (não se copia o
setCustomSessionTitle do CronCreate); assinatura de estado ativo no cartão; contagem local de cota; chave de vínculo/sessão independente; rollback do modo de permissão ao fim da tarefa.

## Trabalho em background e fechamento de tickets

Depois que a rodada principal termina de forma natural, enquanto ainda houver trabalho em background, notificações não consumidas, entradas admitidas ou espera de troca de ticket, a tarefa inteira permanece não concluída. A CLI decide com base no registro de tarefas existente e na fila de comandos, e o Host consome apenas eventos explícitos de ciclo de vida. A liberação do ticket é independente da conclusão da tarefa: depois que o usuário assume, o ticket antigo é liberado quando todas as sub-rodadas off-peak terminam, e a tarefa pode continuar usando o plano do usuário.

```mermaid
stateDiagram-v2
  execução off-peak --> aguardando background: rodada principal terminou e o background não terminou
  aguardando background --> execução off-peak: resposta ou notificação de conclusão
  execução off-peak --> aguardando novo ticket: a requisição retornou 3102
  aguardando background --> aguardando novo ticket: o despertar precisa de um novo ticket
  aguardando novo ticket --> execução off-peak: entrega do novo ticket
  execução off-peak --> execução do usuário: mensagem do usuário admitida
  aguardando background --> execução do usuário: mensagem do usuário admitida
  aguardando novo ticket --> execução do usuário: mensagem do usuário admitida
  execução off-peak --> item concluído: não resta trabalho
  execução do usuário --> item concluído: não resta trabalho
```

Durante a troca de ticket, é permitido que o Bash local já iniciado termine e salve sua saída; as requisições de modelo esperam um novo ticket, e é proibido reenviar o prompt original ou reexecutar a ferramenta. Erros de ticket concorrentes são mesclados em uma única renovação; tickets tardios após a tomada de posse ou o cancelamento são apenas liberados. O registro de background, a fila de notificações, as credenciais de ticket e a escolha off-peak temporária não são restaurados após reinício do App/CLI; a coleta de linhas de tarefas existentes no cold start segue as regras originais e não restaura processos de background que já desapareceram.

Os controles tardios de cancelamento e de troca de ticket precisam ser idempotentes: o cancel de uma execução já concluída ou cancelada não pode parar uma rodada posterior do usuário na mesma sessão. Um cancel válido para apenas a execução em foreground capturada no momento do cancelamento. Uma falha no recibo do RPC de troca de ticket significa que o resultado da entrega é desconhecido; o Host mantém o mesmo `executionId + renewalId + ticketId` e as credenciais em memória e retenta a confirmação pelo ciclo de sincronização existente; a entrega desconhecida não é gravada de volta como queued, o ticket não é retirado de novo e a tarefa não é reproduzida. Um novo ciclo de ticket_needed descarta a escrita do recibo da entrega antiga; após a tomada de posse ou a conclusão, ainda é possível confirmar o ticket já instalado, e tickets candidatos não instalados são apenas liberados. A retentativa da entrega não adiciona persistência, timer nem fila de recuperação de conversa, e as fronteiras de desktop continuous e mobile replayable permanecem inalteradas.

O valor padrão de entrada da CLI/TUI é nomeado `cliDefaultSelection`, reutilizando o `config.defaultModelSelection` de `provider_config.json` e a entrada de session comum existente. `/model` e `/effort` alteram apenas o valor padrão de entrada e o local de memória já existente; o runtime Session Selection só é atualizado no envio. Não há configuração nem migração de banco de dados. O cartão de aceleração passa a escolha comum daquela mensagem do usuário por `selectionFallback.target`; o `highspeedFallbackSelection` do Core fixa o candidato de Session anterior à admissão desta rodada, usado no fallback de expiração do cartão de aceleração ou de falha da requisição, sem relação com a renovação de ticket off-peak.

A extração automática do Project Memory continua sendo ignorada: especificamente, a extração de memória de projeto em background após o término bem-sucedido; a chave de Memory da sessão não é modificada. A limpeza final do Bash embutido no child runtime é igual à do Agent comum.

## 6. Consulta rápida de pontos de reuso (infra de feat/cron)

| Reuso                                               | Posição                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| scheduler utility process + padrão de reivindicação transacional | `packages/desktop/src/scheduler/`                              |
| tasks-index.sqlite + padrão de Repo                | modelado a partir de `packages/services/src/session/automationRepo.ts` |
| pipeline dispatch→main→host→createTask/sendPrompt  | `desktopCronScheduler.ts` / domínio do host                       |
| Modos de permissão                                 | `ZCodeTaskMode` com `bypassPermissions` / `default` existentes, sem novos modos |
| Confirmação de operações sensíveis                 | cadeia existente de permission_request / elicitation               |
| Notificações                                       | `desktopNotifications.ts`                                         |
| Provider embutido invisível                        | mecanismo de Start plan (verificado o caminho de injeção do provider antes de reutilizar) |

## 7. Explicitamente não feito (lista de cortes da v1 — precisa de alinhamento com o produto)

- Todo o capítulo de guarda de saldo: validação de saldo/consulta e deduction em tempo real/parada em ¥0.50/guia de recarga (não existe o conceito de "saldo", D1)
- Estado window_paused, retomada por snapshot no fim da janela, "já consumiu N janelas", notificação de escolha única no fim da janela (D3)
- Seleção em três níveis de "horário esperado de conclusão" + lembrete de "mudar para imediato" no vencimento (D14, resta apenas o horário de início previsto somente-leitura)
- Cotas de tier lite:1/pro:2/Max:3 (D6, o servidor unifica em um limite de contagem)
- Sandbox de sistema de arquivos (D8, o texto passa a dizer "aprovar todas as operações automaticamente")
- Baseline git automático (D8, mantém o aviso "recomenda-se fazer commit antes")
- ETA preciso (estilo "22:07") e estimativa de duração de fila
- Exibição, disparo ou aprovação remota no celular (D37: `/remote` oculta completamente o Automations)
- Integração automática de powerSaveBlocker (D4, chave manual)
- Mecanismo de timeout de fila/expiração de tarefa (espera infinita enquanto sobrecarregado continuamente, a saída é Cancelar / Pause)
- Exibição de "Est." de espera prevista, limpeza automática de tarefas, reexecutar com Run again, entrada de orientação dentro da conversa (toast de 429/cota, D29/D30 cortados); a Create via chat cortada junto foi restaurada pelo D49 como ferramenta de criação dentro da sessão (§5.2)
- Entrada de desfile de "executar imediatamente" (D32, o cartão do Figma/D30 prevalece; para rodar agora = cancelar e abrir uma conversa você mesmo)
- Estado `awaiting_approval` exclusivo do Off-Peak, ação de cartão Review e notificação de espera por confirmação; as interações de confirmação passam apenas pela session comum e o estado agregado permanece running
- Trocar para o provider do usuário no turno atual após aprovação / dica "isso consumirá a cota do plano" (a intenção histórica D11/D27 não foi adotada)
- Campos da página de detalhes "computação consumida/computação restante"

## 8. Itens a verificar (antes da implementação)

> O spike de 2026-07-15 foi totalmente concluído, e as conclusões estão em `tech-design.md` §11; esta lista guarda apenas os veredictos.

1. ~~trocar de provider no meio da session~~ ✅ confirmado: `session/updateRuntimeModelConfig` tem efeito na próxima requisição de modelo de uma session viva (exige `applyModelSelection: true`).
2. ~~capacidade de agent runtime para session resume + continuação~~ ✅ confirmado: a recuperação a frio hidrata o histórico do repositório de sessões, e no novo processo faz-se resume antes de sendPrompt (a estratégia de prompt de retomada na recuperação de interrupção ainda será definida na implementação).
3. ~~verificação do caminho de injeção do provider do Start plan~~ ✅ confirmado: `applyStartPlanCredentialApiKey` é o molde (JWT como provider apiKey); a Coding Plan Key original é legível no domínio do host. Com base nisso, a implementação do Runtime Model por turno do D33 foi definida; o Provider Refactor M4 preservou seu invariante de produto "execução única, zero persistência" e substituiu a implementação por um Built-in Provider oculto + Model Selection padrão + `modelExecution.requestAuth`.
4. ~~verificação da infraestrutura de retry/backoff~~ ⚠ suporta mas não é reuso puro: é preciso adicionar o retry reason `offpeak_queued`, o mapeamento 429+3105, o bypass de orçamento em três retry loops + um novo clamp de min(Retry-After, 5min) (os 5min atuais são um limiar de rejeição, não um clamp).
5. ~~verificação do momento de fetch de client/configs~~ ⚠ o canal funciona: passa pelo getClientConfigs do coding plan subscription provider (cache de 1h), e "zero requisições novas" é exato do lado de rede; o refresh forçado ao abrir a entrada exige um parâmetro force, e a virada de rollout pode ficar invisível por até 1h; o endpoint hoje não traz Authorization (tech-design §7.8-⑤).
6. Agendamento do servidor — o cliente iniciará trabalhando com mock conforme o contrato da §4.

## Atualização do Todo128: consistência do refresh de elegibilidade (2026-09-11)

A elegibilidade de criação continua obedecendo às regras existentes de gradual rollout, conexão atual, direito, credenciais e cota de retirada de número. A inicialização espera apenas a prontidão, e a resolução de
credenciais fora do pico do Host lê explicitamente o Registry atual a cada vez, sem usar o valor retornado no primeiro start. A inicialização, a mudança de conexão, a notificação de Registry concluído, o refresh manual e a reconsulta de
cota em recuperação passam todos pela verificação serial do Store; as duas entradas compartilham a mesma deduplicação de notificação.

```text
初始化/连接变化/Registry 完成通知/手动刷新
  → 旧资格失效 → 串行检查当前资格 → 必要时查额度 → 同代原子发布
               在途收到变化 → 丢弃旧成功/错误，合并检查最新代
```

Falha de consulta ou estado desconhecido continuam bloqueando; não se combina elegibilidade antiga com cota nova. A atualização de Provider não modifica o rascunho do formulário, o Ticket já vinculado
nem o modelo em execução. Não se adiciona polling, não se amplia o suporte de fora do pico no celular/remoto e não se restaura a entrada da página inicial atualmente não montada.
O impacto específico e os critérios de aceitação S1–Q5 estão em [Impacto do Todo128](../working-memory/provider-refactor/steps/todo-128-impact-and-cases.md).