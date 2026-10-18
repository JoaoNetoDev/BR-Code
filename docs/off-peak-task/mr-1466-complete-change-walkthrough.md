# MR !1466 Tarefa de Horário Ocioso (Off-Peak Task) — Panorama Completo das Mudanças

> Este documento é organizado pelo **limite real de Git do MR**, pelo **comportamento final do código**, pela **cobertura de testes** e pelas **lacunas conhecidas**, sem apresentar planos iniciais, estados intermediários de commit ou visões de documentação como capacidades já entregues.
>
> Data do levantamento: 2026-07-21; MR: `!1466`; branch de destino: `main`; branch de origem: `feat/off-peak-task`.
>
> **Fechamento posterior de 2026-07-23**: D44 removeu o tipo `awaiting_approval` exclusivo de Off-Peak e seu Repo/UI/casca de notificação.
> As menções a esses conteúdos abaixo estão revisando o limite histórico do Head do MR; o comportamento atual segue `spec.md` e o código:
> permission/elicitation passa apenas pela session comum, o agregado de Off-Peak permanece `running` e o turn atual não troca de provider.

## 1. Escopo da auditoria e conclusões

### 1.1 Limite exato de Git

| Item                    | Valor |
|---|---|
| MR | `!1466` — `Draft: feat(off-peak): 闲时任务 Off-Peak Task` |
| Base SHA | `14a62011d582ccbd20ef4c274892ae0dea076bd9` |
| MR Head SHA | `cc3980d2a1f1523f362cb1a6e80d5ba2482cc5b7` |
| Escopo de comparação | `14a62011d582ccbd20ef4c274892ae0dea076bd9..cc3980d2a1f1523f362cb1a6e80d5ba2482cc5b7` |
| Número de commits | 60（55 non-merge + 5 merge commit de sincronização de branch）|
| Número de arquivos | 115 |
| Linhas | `+14,429 / -1,707` |
| Estado do MR | Draft, Open, sem conflitos; o pipeline mais recente está em manual/blocked |

O branch local atual contém ainda `5c6d0e9d7f chore: release v3.5.3-alpha.0`. Ele não está no Head do MR acima, portanto não entra nas mudanças de MR deste documento. O próprio documento é um artefato de auditoria desse Head remoto e não conta entre os 115 changed paths originais; se este documento for enviado ao branch de origem, o número de arquivos do MR aumentará.

### 1.2 Resultado em uma frase

Este MR introduz um produto de "tarefa de horário ocioso" de execução única e local ao desktop: o usuário primeiro pega um número no servidor, o cliente persiste a tarefa e faz polling do ticket, e, após a liberação do servidor, um scheduler independente despacha para o Local Host da janela que hospeda o workspaceKey de destino; o Host cria ou reaproveita uma session ZCode comum e injeta temporariamente o provider embutido `builtin:offpeak-idle-plan` apenas no turno de execução automática; ao encontrar `429/3105` de capacidade, respeita `Retry-After` e espera indefinidamente sem consumir o orçamento de retries comuns, e quando o ticket `3102` expira troca de ticket e continua na mesma session; ao final da tarefa, o ticket é baixado de forma assíncrona.

### 1.3 Escopo real deste MR

O escopo principal inclui:

- Tipos de domínio de Off-Peak, tabela SQLite, máquina de estados do Repo, cliente de ticket do servidor e serviços de sincronização e baixa.
- Cadeia fechada de despacho: desktop scheduler → main → window Local Host → Agent do workspaceKey.
- Overlay de provider de turno único em agent/CLI, restauração do modelo, espera de `429/3105` e marcação de continuação por `3102`.
- Criação, edição, listagem, History, agrupamento na barra lateral, notificações, rollout e gating de cota em Automations.
- Configuração global "manter acordado durante a execução".
- Gateway mock, testes unitários, testes de integração de serviço e duas specs E2E WDIO.
- Documentação, registro de decisões, catálogo de cases de conversation e matriz de cobertura.

Também vêm junto duas mudanças não centrais mas que realmente pertencem ao MR:

- O GitLab CI passa a permitir que a fonte API dispare algumas cadeias manuais de teste/build.
- `mise run dev` usa um `~/.zcode-dev-home` separado, isolando o diretório de dados de produção.

## 2. Semântica final do produto

### 2.1 O que o usuário vê

- Uma tarefa de horário ocioso é uma tarefa de execução única, não um cron nem uma automation repetível.
- Ao criar a task, preenchem-se título, Instructions, projeto, modo de permissão, modelo de horário ocioso e nível de raciocínio.
- A criação bem-sucedida completa a retirada de número no servidor; ela não cria imediatamente uma conversa.
- Só é despachável depois que o ticket do servidor entra em `ready`; no primeiro despacho é criada uma session comum.
- Depois que o bloco de execução de 3 horas expira, pode-se trocar por um ticket novo e continuar reutilizando a session original.
- Localmente há sempre apenas um registro lógico de tarefa; um ticket novo sobrescreve o `server_ticket_id` atual e não cria uma nova tarefa.
- O History mostra no máximo 1 linha por tarefa, sem expandir por bloco de 3 horas nem por ticket.

### 2.2 Provider visível ao usuário e provider realmente usado na requisição

Esta é a fronteira mais confusa deste MR:

| Cenário | Modelo na barra / modelo permanente da Session | Provider realmente usado na requisição atual |
|---|---|---|
| Primeiro despacho de horário ocioso cria a session | Modelo padrão do workspace do usuário; `providerId/modelId` preservados por completo | O turn de execução automática usa temporariamente o embutido `builtin:offpeak-idle-plan` |
| Continuação por blocos de ticket seguintes | Continua sendo o modelo permanente do usuário na mesma session | O turn de continuação usa novamente temporariamente `builtin:offpeak-idle-plan` |
| Depois que o turn automático termina | Volta ao modelo permanente do usuário | Mensagens normais subsequentes usam o provider do usuário |
| Aprovação de permissão disparada enquanto o turn automático ainda não terminou | A barra de modelo ainda mostra o modelo permanente do usuário | **A implementação atual ainda está no mesmo idle-plan turn, e a aprovação não troca o provider** |
| Usuário envia um prompt extra enquanto o turn automático está ocupado | A barra de modelo ainda mostra o modelo permanente do usuário | A mensagem é enfileirada; o drain só acontece depois que o turn automático limpa o overlay e restaura o modelo, então o provider do usuário é usado |

O modelo permanente da session de um usuário com vários providers não é "o primeiro provider da lista". Antes do primeiro despacho, o host chama `workspace/readState(preferWorkspaceDefaults=true)` e escolhe, nesta ordem, a referência de modelo completa que ainda está no conjunto available:

1. `modelCatalog.defaultModel`
2. `modelCatalog.lastUsed`
3. `settings.model.current`

Candidatos que sejam `builtin:offpeak-idle-plan` são pulados; sem candidato, a falha é um erro permanente de despacho. O modelo escolhido no formulário de criação só decide o modelo do turn automático idle-plan e não sobrescreve o modelo permanente da session.

### 2.3 Estado real de implementação do Ask approval

O documento de plano diz: operações sensíveis entram em `awaiting_approval` e, na aprovação, aparece o aviso "a continuação usará a cota do seu próprio plano", e então há a troca para o provider do usuário.

**O código de produção do Head do MR não concluiu essa cadeia:**

- O Repo já tem `setAwaitingApproval()`, e o estado compartilhado, o badge de UI, as ações de card e a notificação de sistema também reservaram `awaiting_approval`.
- Mas a cadeia de execução de produção não chama `setAwaitingApproval()`.
- Não existe handler de aprovação exclusivo de Off-Peak nem implementação de troca de provider após a aprovação.
- Não existe o aviso de runtime "a continuação usará a cota do seu próprio plano".
- A requisição de permissão ainda pertence ao turn automático atual, e o `turnRuntimeModel` desse turn só é limpo na fronteira de conclusão do turn, portanto a execução após a aprovação continua no provider idle-plan.

Assim, `awaiting_approval` hoje se parece mais com um estado reservado "modelado e renderizado, mas ainda sem evento de runtime conectado", e não pode ser aceito como capacidade concluída.

### 2.4 O que "fila" realmente é

Há três camadas diferentes de fila, que não devem virar um FIFO global único:

| Camada | Onde fica | O que enfileira | Autoridade |
|---|---|---|---|
| Fila de tickets do servidor | Servidor de Off-Peak | Ticket retirado pelo usuário, que devolve `position` e vira `ready` no horário de baixa | Autoridade da ordem de admissão de horário ocioso |
| Fila despachável do scheduler | `off_peak_tasks` local + campos de claim | Tarefas locais já sincronizadas como `schedulable=true`, reivindicadas por `queued_at` | Ordem de despacho do host local |
| Fila de mensagens da conversa | Runtime existente de session/agent | Prompt comum que o usuário envia enquanto o agent está ocupado | Apenas a ordem de mensagens dentro daquela session |

Embora `next_poll_at` seja gravado na tabela de tarefas, o service atual usa um timer compartilhado para conduzir o polling de todo o lote de tickets não terminais, e não cria um temporizador por task.

## 3. Arquitetura de ponta a ponta

```text
Renderer / packages/ui
  │
  │ IOffPeakTaskService RPC
  ▼
Window Local Host Process
  ├─ OffPeakTaskService ──────► OffPeak Server
  │    ├─ availability             GET  /ticket/availability
  │    ├─ take number              POST /ticket
  │    ├─ batch sync               POST /ticket/status
  │    └─ settle outbox            POST /ticket/:id/settle
  │
  ├─ OffPeakTaskRepo ─────────► tasks-index.sqlite / off_peak_tasks
  │
  └─ ZCodeTaskService / Agent session
         ▲
         │ OffPeakRun routed to the window Local Host owning the workspaceKey scope
         │
Desktop Main Process ◄──────── Scheduler Utility Process
  │                              ├─ 20s tick
  │                              ├─ recover interrupted claims
  │                              ├─ claim schedulable queued rows
  │                              └─ transient dispatch backoff
  │
  └─ powerSaveBlocker (global setting)

Agent / zcode-cli
  ├─ persistent session model = user's workspace model
  ├─ per-turn catalog/model overlay = builtin:offpeak-idle-plan
  ├─ POST /api/v1/off-peak/anthropic/v1/messages
  ├─ 429/3105 + Retry-After => wait and retry without budget consumption
  └─ 400/3102 => stable expired marker => host requeues same task/session
```

Explicação das fronteiras:

- Scheduler e host abrem o mesmo SQLite de tasks-index, mas cooperam por meio de transação de claim e guardas de estado.
- O main apenas encaminha mensagens de agendamento e gerencia capacidades do sistema; não hospeda o estado de negócio de ticket/session.
- Relay, mobile remote e desktop main não ganharam nenhuma nova fonte de estado de task replayable.
- O desktop continua usando `desktop-continuous`; este MR não espalhou a semântica de recuperação replayable do celular para a cadeia do desktop.

## 4. Máquinas de estado de dois eixos

### 4.1 Estado da tarefa no cliente

```text
                         ┌──────────── Pause ────────────┐
                         │                               ▼
create + take ticket ─► queued ── server ready ──► claimed ── dispatch ─► running
                         ▲             │                │                  │
                         │             └─ claim fail ───┘                  ├─ success ─► completed
                         │                                                ├─ failure ─► failed
                         │                                                ├─ cancel ──► cancelled
                         │                                                └─ 3102 ────► queued
                         │
                         └──────── Continue / retake ◄──── paused

预留但未接通：running ── permission request ──► awaiting_approval
终态：completed / failed / cancelled，均不可逆出。
```

Os sete estados do cliente:

- `queued`: número retirado, aguardando ready do servidor, ou reenfileirado após reinício/continuação.
- `paused`: o usuário parou o despacho local; o ticket do servidor em si continua envelhecendo.
- `running`: o host aceitou o despacho de `sendPrompt` e devolveu ACK.
- `awaiting_approval`: reservado no domínio e na UI, por enquanto inalcançável pela cadeia de produção.
- `completed`, `failed`, `cancelled`: estados terminais.

### 4.2 Estado do ticket no servidor

```text
POST /ticket
    │
    ▼
  queued ──低峰且轮到──► ready ──首个 messages 准入──► active
                           │                              │
                           ├─ ready TTL 到期 ───────────► expired
                           └─────────────────────────────► settled ◄── client settle
                                                          ▲
                       active 3h 到期 ─► expired ──────────┘（换票续跑）

查询还可能得到 not_found。
```

### 4.3 Mapeamento entre os dois eixos e desvios importantes

| Estado do servidor | Ação de sincronização local | Estado comum do cliente |
|---|---|---|
| `queued` | `schedulable=false`, grava position | `queued` ou `paused` |
| `ready` | `schedulable=true`, acorda o scheduler | `queued`, depois despachável |
| `active` | mantém o snapshot já ativado | normalmente `running` |
| `expired` | tarefa em queued faz retake automático; em running o `3102` de messages fecha o ciclo com retake | volta para `queued` |
| `settled` | limpa o snapshot despachável | geralmente já está em estado terminal; um estado inicial inesperado pode ficar preso |
| `not_found` | o sync atual ignora, sem retake automático | pode ficar preso; o Continue do usuário pode disparar uma nova retirada |

Desvio importante: o `running` local é gravado assim que `sendPrompt` devolve ACK, enquanto a passagem real do gateway pela válvula fina de messages acontece só depois. Por isso, ao encontrar espera por `429/3105`, a UI mostra running em vez de um "enfileirando por capacidade do servidor" separado.

## 5. Modelo de dados e persistência

### 5.1 Chaves primárias e identidades de domínio

- `offPeakTaskId`: chave primária local e, ao mesmo tempo, o `task_id` estável do servidor; inalterada entre vários tickets.
- `serverTicketId`: o ticket atual do servidor; sobrescrito a cada nova retirada.
- `conversationId`: id da task ZCode hospedeira; preenchido após o primeiro despacho.
- `sessionId`: id da session do Agent; preenchido após a primeira execução e reutilizado na continuação.
- `workspaceKey = workspaceIdentity?.trim() || workspacePath`: chave de isolamento de identidade.
- `workspacePath`: semântica de caminho real para arquivos, cwd e exibição.
- `workspaceIdentity`: o campo de identidade remota é preservado pelo tipo e pelo protocolo, mas a UI de produto proíbe criar tarefas de horário ocioso em workspace remoto.

### 5.2 Tabela `off_peak_tasks`

O armazenamento fica no SQLite de tasks-index existente. A conexão habilita WAL, `synchronous=NORMAL` e `busy_timeout=5000`.

| Coluna | Significado |
|---|---|
| `off_peak_task_id` | chave primária estável da tarefa / task_id do servidor |
| `server_ticket_id` | id do ticket atual |
| `title` | título informado pelo usuário |
| `conversation_id` | id da task ZCode |
| `session_id` | id da session do Agent reutilizável |
| `prompt` | Instructions |
| `permission_mode` | task mode existente (build/edit/plan/yolo etc.) |
| `model` | modelo do turn automático do idle plan |
| `thought_level` | nível de raciocínio; coluna adicionada por migration incremental |
| `workspace_key` | chave de isolamento de identidade do workspace |
| `workspace_path` | caminho real |
| `workspace_identity` | identity remoto opcional |
| `status` | os sete estados do cliente |
| `queued_at` | tempo de ordenação FIFO local |
| `started_at` / `ended_at` | tempos de ciclo de vida |
| `failure_reason` | motivo da falha |
| `files_changed` | quantidade de arquivos alterados, best-effort |
| `settled_at` | tempo do ACK de baixa no servidor |
| `history_deleted_at` | tempo da exclusão lógica no History; coluna adicionada por migration incremental |
| `registered_at` | momento da retirada de número bem-sucedida |
| `schedulable` | snapshot local de ready do servidor |
| `queue_position` | posição na fila do servidor |
| `next_poll_at` | snapshot do horário de próximo polling sugerido pelo servidor |
| `claim_running` / `claimed_at` | trava de reivindicação do scheduler e seu tempo |
| `attempt_count` / `last_error` | campos de registro de despacho / diagnóstico |
| `created_at` / `updated_at` | tempos de auditoria local |

Índices:

- `(status, queued_at)`: filtro de estado e reivindicação FIFO.
- `(workspace_key, status)`: consultas de isolamento por workspace.

### 5.3 Guardas mecânicas do Repo

O `OffPeakTaskRepo` implementa:

- Criação de tabela na inicialização, `ensureColumn` incremental e mapeamento de linha para domínio.
- create/list/get/exclusão física/tombstone de History.
- Contagem de não terminais e de ativos.
- Apenas `queued/paused` são editáveis.
- Atualização do snapshot de agendamento do servidor.
- Claim FIFO em transação `BEGIN IMMEDIATE`; claim de 10 minutos é considerado stale e pode ser reivindicado de novo.
- `markRunning` aceita apenas queued, preservando os campos de tempo e de session com `COALESCE`.
- `markTerminal` impede que um estado terminal seja sobrescrito por um resultado tardio.
- Transições condicionais de awaiting, pause e liberação de claim.
- Recuperação na inicialização: tarefas claim/running interrompidas voltam para queued, preservando a session.
- `requeueForContinuation`: a troca de ticket na continuação preserva task/session.
- Consulta de outbox de terminais não baixados e `markSettled`.

## 6. Sequências críticas

### 6.1 Criação e retirada de número

```text
UI                    Host Service             Off-Peak Server          SQLite
│ createTask(params)       │                          │                    │
├─────────────────────────►│                          │                    │
│                          │ generate stable task_id  │                    │
│                          ├─ POST /ticket ──────────►│                    │
│                          │◄─ ticket/state/position ─┤                    │
│                          │                          │                    │
│                          ├─ INSERT task ────────────────────────────────►│
│                          ├─ start sync / wake if ready                  │
│◄─────────────────────────┤                          │                    │
```

- A ordem é "só grava no banco local depois que a retirada no servidor tem sucesso".
- Benefício: uma falha na retirada não deixa tarefa falsa.
- Risco: se a retirada funciona e o insert no SQLite falha, sobra um ticket órfão no servidor; hoje não há compensação ativa de settle.
- Quando o servidor devolve `ready`, o scheduler é acordado imediatamente, sem esperar o próximo tick de 20 segundos.

### 6.2 Primeiro despacho e criação da session

```text
Sync Service       SQLite/Scheduler       Main       Window Local Host       workspaceKey Agent
│ ticket=ready          │                  │              │                    │
├─ schedulable=true ───►│                  │              │                    │
├─ wake scheduler ─────►│                  │              │                    │
│                       ├─ transactional claim             │                    │
│                       ├─ OffPeakRun ─────►│─────────────►│                    │
│                       │                  │              ├─ read workspace model
│                       │                  │              ├─ createTask(model=user default)
│                       │                  │              ├─ build idle-plan turnRuntimeModel
│                       │                  │              ├─ sendPrompt ───────►│
│                       │                  │              │◄─ dispatch ACK ─────┤
│                       │◄─ success ───────│◄─────────────┤                    │
│                       ├─ markRunning(session/task ids)                        │
│                       │                                  Agent turn continues │
```

`running` significa ACK de despacho, e não que o modelo já tenha produzido token nem que as messages do servidor já passaram pela válvula de capacidade.

### 6.3 Cobertura de modelo por turno e restauração

```text
workspace catalog/model                  turn overlay
        │                                      │
        ├─ snapshot previous selected model    │
        ├─ setTurnOverlay(offpeak provider) ──►│
        ├─ setModel(offpeak model, transient)  │
        ├─ run automatic prompt                │
        │                                      │
        ├─ turn terminal boundary              │
        ├─ restore previous model              │
        ├─ clearTurnOverlay / clear secrets    │
        ├─ emit ready                          │
        └─ drain queued user messages using restored user provider
```

- O overlay de workspace e o de turno são guardados em camadas separadas; um hot refresh do workspace não sobrescreve o overlay de turno que ainda está rodando.
- Essa configuração de provider só é injetada em memória, sem gravar no catálogo do workspace, na persistência da session ou em disco.
- Injeção e restauração não emitem eventos de UI de model-change comuns, evitando que a barra de modelo pisque para Idle plan.
- Se o modelo original for removido durante o turn automático, o overlay temporário com chaves é limpo primeiro e só então há o fallback para o catálogo mais recente.
- Quando o agent está ocupado, um sendText com outro `turnRuntimeModel` é rejeitado, e o scheduler trata isso como falha de despacho transitória.

### 6.4 Como `429/3105 + Retry-After` é implementado

```text
Agent adapter              Off-Peak messages endpoint
     │ request attempt                  │
     ├─────────────────────────────────►│
     │◄─ HTTP 429, code=3105,           │
     │   Retry-After: N seconds         │
     │                                 │
     ├─ classify only when providerId == builtin:offpeak-idle-plan
     ├─ delay = min(parsed Retry-After or 60s, 5min)
     ├─ abort-aware wait
     ├─ do not consume ordinary retry budget
     └─ retry same provider request ───►│
```

Pontos de implementação:

- `offpeak-retry.ts` só tem efeito para `providerId=builtin:offpeak-idle-plan`; providers comuns não são afetados.
- HTTP 429 cru e o código de negócio 3105 são ambos classificados como `queued`.
- Sem `Retry-After` parseável, o padrão é 60 segundos; uma espera isolada dura no máximo 5 minutos.
- O runner de generate faz fallback de attempt / mantém a decisão de fila, de modo que a espera por capacidade não consome o retry budget comum e o sondeo pode continuar.
- O runner de stream só reexecuta com segurança quando ainda não cruzou a fronteira de saída visível, evitando entregar ao usuário conteúdo já emitido.
- A espera usa abort signal, pode ser cancelada e não é um sleep ininterrompível.
- A projection mapeia isso para um rate-limit fault recuperável, com o motivo `ModelRetryReason.OffpeakQueued`.

### 6.5 Continuação por expiração do ticket `3102`

```text
messages 400/code=3102
      │
      ▼
adapter: non-retry + append stable marker "off-peak-ticket-expired"
      │
      ▼
host terminal observer detects marker
      │
      ├─ requeue same offPeakTaskId, preserve conversationId/sessionId
      ├─ POST /ticket for a new ticket
      ├─ overwrite serverTicketId/scheduling snapshot
      └─ scheduler later resumes same session with continuation prompt
```

- O novo código de contrato é 3102; o adapter ainda tolera o 3001 do gateway antigo, para facilitar rollout.
- A continuação usa um continuation prompt fixo em inglês e reaplica o permission mode / thought level originais.
- A task é a mesma e a session é a mesma; localmente não se guarda histórico de tickets.

### 6.6 Pause, Continue, Cancel, Delete

```text
Pause:
  queued ─► paused，阻止本地 scheduler 派发；服务端 ticket 不暂停，仍可能 ready/expired。

Continue:
  paused ─► 查询当前 ticket
             ├─ queued/ready/active 或查询失败：复用当前票
             └─ expired/not_found/缺票：重新 POST /ticket
           ─► queued

Cancel:
  local terminal cancelled first
  ├─ best-effort stop active agent task
  └─ best-effort settle；失败留给 outbox 重试

Delete:
  cancel + best-effort settle
  └─ physical DELETE local row

Delete history:
  只写 history_deleted_at；任务、session、执行字段均保留。
```

O Delete tem um risco explícito: se o settle falhar por erro de rede / 5xx e em seguida a linha for apagada fisicamente, a base local do outbox também é apagada e a reenvio automático fica impossível.

### 6.7 Recuperação após reinício

```text
desktop/scheduler restart
  └─ recoverInterrupted(now)
       ├─ stale claim/running → queued
       ├─ release claim fields
       ├─ preserve session/task identity
       └─ wait for valid/retaken ticket and resume
```

## 7. Interfaces do servidor, autenticação e semântica de erros

### 7.1 Os cinco endpoints conceituais

| Uso | Método e caminho | Chamador |
|---|---|---|
| Snapshot de elegibilidade | `GET /api/v1/off-peak/ticket/availability` | host service |
| Retirada de número | `POST /api/v1/off-peak/ticket` | host service |
| Consulta em lote de tickets | `POST /api/v1/off-peak/ticket/status` | host service |
| Baixa | `POST /api/v1/off-peak/ticket/:id/settle` | host service |
| Mensagens de modelo | `POST /api/v1/off-peak/anthropic/v1/messages` | provider temporário dentro do agent |

Os "quatro endpoints" dos documentos iniciais contam apenas as interfaces de gestão de tickets; com o availability incluído, pela cadeia de produto deve-se entender quatro interfaces JSON de ticket mais um endpoint de modelo.

### 7.2 Autenticação

- As interfaces JSON de ticket levam uniformemente `Authorization: Bearer <ZCode JWT>` e `x-coding-plan-api-key`.
- O endpoint de messages também leva `X-Off-Peak-Ticket-ID`.
- O JWT é lido da credential key `zcodejwttoken`.
- A Coding Plan key é resolvida conforme a família de provider atual e a conexão selecionada: plano pessoal ZAI/BigModel lê o `apiKey` original do provider selecionado, e BigModel Team reaproveita o helper de runtime-key existente para gerar `${apiKey}.${secretKey}`.
- Start Plan, modo API Key, nada selecionado, provider OAuth ativo inconsistente com a família selecionada e conexões disabled/stale são todos rejeitados; UI, ticket client e runtime por turno compartilham o mesmo snapshot de credencial do host, e é proibido varrer ou fazer fallback para qualquer provider em cache.
- A falta de JWT, de Coding Plan key, do modelo de horário ocioso ou do modelo do workspace do usuário produz um erro de despacho permanente e tipado, evitando reivindicações inúteis repetidas.

### 7.3 Parsing e timeouts

- Timeout de 10 segundos por requisição.
- O Zod usa loose/passthrough, permitindo que o servidor acrescente campos.
- `position: null` é normalizado para campo ausente.
- `next_poll_after` é lido em segundos e convertido para milissegundos.
- São compatíveis tanto JSON cru quanto o envelope `{ code: 0, data }`.
- O batch status envia no máximo 100 tickets por vez; o excedente é truncado com um warn, sem dividir em pacotes.
- Se availability devolve `can_take_number=false` sem `next_take_at`, isso é tratado como resposta suja e lança erro; a UI age de forma fail-closed conforme D43 e espera a próxima atualização bem-sucedida.

### 7.4 Principais códigos de negócio

| HTTP / código de negócio | Tratamento |
|---|---|
| `3101` | sem elegibilidade, criação falha, e a UI mostra o erro correspondente |
| `3103` | no momento não dá para retirar número / limite de cota; atualiza availability e não grava bool permanente local |
| `429` / `3105` | fila de capacidade das messages; espera conforme Retry-After sem consumir o retry budget comum |
| `400` / `3102` | ticket indisponível; gera marcador estável e troca de ticket para continuar |
| legacy `3001` | apenas compatibilidade com gateway antigo, igual ao 3102 |

## 8. OffPeakTaskService: retirada, sincronização e baixa

### 8.1 Superfície pública do serviço

`IOffPeakTaskService` expõe:

- `getTakeNumberAvailability`
- `createTask`
- `cancelTask`
- `pauseTask`
- `continueTask`
- `deleteTask`
- `deleteHistory`
- `updateTask`
- `list`
- `get`

O renderer não opera o ticket do servidor diretamente; retirada, polling, renovação de ticket e baixa ficam todos na camada de serviço.

### 8.2 Loop de sincronização

- O timer só é mantido enquanto houver tarefas não terminais relevantes ou terminais ainda não baixados.
- O intervalo normal de polling fica entre 5 segundos e 5 minutos, dando prioridade ao `next_poll_after` do servidor.
- A falha de sincronização parte de 10 segundos com backoff exponencial.
- Uma sincronização em lote cobre o ticket atual de todas as tarefas não terminais.
- Quando um ticket queued vira ready, `schedulable=true` é atualizado e o scheduler é acordeado.
- Quando um ticket queued vira expired, o retake é automático; ticket paused não tem retake automático e espera o Continue do usuário.
- `not_found` é ignorado hoje; não há retirada automática nova no sync em background.

### 8.3 Outbox de baixa de terminais

- A gravação do estado terminal e o settle no servidor são separados, evitando que um erro de rede bloqueie o estado de conclusão local.
- Tarefas terminais sem `settled_at` são reenviadas repetidamente.
- Um 4xx no settle é considerado já impossível / desnecessário de reenviar e é确是 confirmado localmente; erros de rede e 5xx mantêm a entrada no outbox.
- A API de settle é projetada para ser idempotente.

### 8.4 Caso de múltiplos Hosts

Cada Local Host de janela pode iniciar seu próprio loop de sincronização e acessar o mesmo SQLite. Um Local Host pode hospedar vários workspaceKey ao mesmo tempo; o escopo de workspace service não corresponde a um processo Host separado. Como as escritas de estado do Repo e a API do servidor são tanto quanto possível idempotentes, isso não quebra o estado diretamente, mas gera requisições duplicadas de status/settle; hoje não há eleição de líder nem um owner único global de sync.

## 9. Scheduler, Main, Host e Session

### 9.1 Scheduler

- Reaproveita o utility process existente, mas Off-Peak tem tipos de mensagem, tabela de Repo e máquina de estados próprios.
- Tick a cada 20 segundos; não pula por regra de cron misfire.
- Executa `recoverInterrupted` primeiro na inicialização.
- `claimDue` só reivindica `queued + schedulable`, em FIFO por `queued_at`.
- O conjunto in-flight é usado para liberar reivindicações na saída; resultados tardios são liquidados apenas por task id, sem depender de contexto em memória.
- Host inexistente, ocupado ou canal temporariamente indisponível são casos transitórios: backoff exponencial a partir de 30 segundos, com teto de 15 minutos.
- Erro de configuração permanente vai direto para failed.
- A guarda de estado terminal descarta resultados de despacho tardios, evitando sobrescrever cancelled/completed/failed.

### 9.2 Roteamento no Main

- Rotas o `OffPeakRun` do scheduler para o host correspondente ao workspace.
- Devolve o `OffPeakRunResult` do host ao scheduler.
- Recebe pedidos de wake do scheduler enviados pelo host.
- Não afunda session, ticket, fila ou estado de snapshot no main.

### 9.3 Despacho pelo Host

- O runtime de Off-Peak é inicializado de forma preguiçosa, reaproveitando credencial, provider, coding-plan e serviço de tasks já montados no host.
- Primeiro despacho: lê o modelo padrão do workspace, cria explicitamente uma deferred session com o modelo do usuário e só então envia o prompt original.
- Continuação: retoma a session original e envia o continuation prompt fixo.
- Cada bloco constrói um novo `turnRuntimeModel` e grava o ticket id no header.
- Assina o outcome terminal por input/trace id e, ao final, contabiliza best-effort os arquivos alterados.
- outcome `success` → completed; `stopped` → cancelled; outros → failed; se a falha contiver o marcador de ticket expirado, não é terminal e segue pelo caminho de nova retirada e continuação.

### 9.4 Lógica de conversa de múltiplos turnos

```text
Task row T (stable)
  ├─ Ticket A ── automatic turn 1 ──┐
  ├─ Ticket B ── resume turn 2 ─────┼──► one conversationId / one sessionId
  ├─ User queued prompt ─────────────┤    persistent user model
  └─ Ticket C ── resume turn 3 ──────┘    idle provider only per automatic turn
```

- Pode haver vários tickets, mas continua havendo uma única task e uma única session.
- Entre turns automáticos e na conversa comum depois do turn automático, a mesma session é reutilizada.
- O provider permanente da session é o modelo do workspace do usuário; o idle-plan é apenas um overlay de turno.
- Mensagens que o usuário envia enquanto o agent está ocupado seguem a fila de session existente e não criam outra fila de tarefas de Off-Peak.

## 10. Rollout, plano e gating de cota

### 10.1 Rollout por configuração do cliente

Origem da configuração: `configs.offPeak`.

- `enable_offpeak_task === true`
- `allowed_models` não vazio

Só quando os dois são satisfeitos a capacidade de criação é exposta. Entrar nas telas相关 força a atualizar o client config. A configuração controla apenas a exposição do produto e a lista branca de modelos idle, e não carrega mais cota gratuita estática.

### 10.2 Julgamento do Coding Plan

- O host resolve com precisão o support mascarado conforme a família de provider / modo OAuth / selected connection key atuais; o renderer não faz mais varredura ampla do provider registry.
- ZAI pessoal, BigModel pessoal e BigModel Team têm suporte; Start Plan, modo API Key, nada selecionado, identidade de provider logado inconsistente e conexões disabled/stale são excluídos.
- Sem plano adequado o botão fica bloqueado e o clique mostra um info toast no canto superior direito, com action de Upgrade executável, por cerca de 8 segundos.
- O formulário de Automations e a entrada de modelo New Task reaproveitam o mesmo support e validam que ele ainda corresponde à seleção atual.

### 10.3 Cota em tempo real do servidor (D39)

- `GET /ticket/availability` é um snapshot imediato.
- A criação só é liberada quando a requisição tem sucesso e `canTakeNumber=true`; false, carregando, desconhecido ou falha deixam tudo esmaecido.
- A UI agenda a atualização em `nextTakeAt + 100ms`.
- Falha de consulta, carregamento ou estado desconhecido em availability é fail-closed; a entrada volta quando a próxima atualização bem-sucedida retornar true.
- A criação real ainda tem o POST `/ticket` como autoridade final.
- Ao encontrar 3103 o snapshot é atualizado, mas "cota esgotada" nunca é gravada permanentemente na configuração local.

### 10.4 O plano D36 que foi substituído

No meio do MR chegou a existir a configuração estática `limit.max_tasks/sliding_window` e um gating preditivo pelo `createdAt` local, com E2E correspondente. Depois do D39 o código final passou a usar availability do servidor; ao ler o histórico de commits não se deve tratar o D36 como a situação atual.

## 11. Mock Gateway e verificação de desenvolvimento

### 11.1 Comportamento

- Porta fixa padrão `45197`, com sobreposição por env.
- Quando vários hosts disputam a porta, quem chega depois encontra `EADDRINUSE` e reaproveita o gateway já existente.
- O estado avança de forma preguiçosa conforme o relógio de acesso: queued → ready → active → expired/settled.
- Ao fazer retake da mesma task, o ticket antigo expira.
- Suporta availability, take, batch status, settle e messages.
- Permite injetar 429/3105 nas primeiras N vezes, 3103 no take nas primeiras N vezes e bloqueio de availability.
- A primeira requisição de messages bem-sucedida ativa o ticket ready.
- Pode ser usado com respostas fixas para testes totalmente offline, ou como proxy do upstream real de um plano pessoal Coding Plan.
- O modo proxy consome de fato a Coding Plan key do usuário e deve ser usado apenas em desenvolvimento/demonstração.
- No proxy os headers hop-by-hop são removidos; falha do upstream retorna 502.

### 11.2 Variáveis de ambiente

| Variável | Efeito |
|---|---|
| `ZCODE_OFFPEAK_MOCK` | habilita o mock |
| `ZCODE_OFFPEAK_MOCK_PORT` | sobrepõe a porta fixa |
| `ZCODE_OFFPEAK_MOCK_READY_DELAY_MS` | atraso de queued a ready, padrão 15 segundos |
| `ZCODE_OFFPEAK_MOCK_READY_TTL_MS` | validade de ready não usado, padrão 5 minutos |
| `ZCODE_OFFPEAK_MOCK_ACTIVE_MS` | duração de active, padrão 3 horas |
| `ZCODE_OFFPEAK_MOCK_QUEUE_429_COUNT` | primeiros N requests de messages retornam 429/3105 |
| `ZCODE_OFFPEAK_MOCK_QUOTA_COUNT` | primeiros N takes retornam 3103 |
| `ZCODE_OFFPEAK_MOCK_AVAILABILITY_BLOCK_MS` | availability temporariamente sem número disponível |
| `ZCODE_OFFPEAK_MOCK_RETRY_AFTER_S` | Retry-After, padrão 5 segundos |
| `ZCODE_OFFPEAK_MOCK_NEXT_POLL_S` | next_poll_after, padrão 5 segundos |

O fluxo WDIO de gestão define o ready delay como 60 segundos para evitar que a task seja executada antes do fim das operações de UI; a spec de pre-gate de cota define o bloqueio de availability como 1 hora.

## 12. Mudanças de UI

### 12.1 Visão principal de Automations

- Quando há capacidade/dados de horário ocioso, aparecem três tabs: `All / Scheduled / Idle-time task`.
- Tarefas de horário ocioso são exibidas em uma grade de cards de duas colunas.
- Prioridade de ordenação dos cards: running → awaiting approval → queued → paused → failed → completed → cancelled; dentro do mesmo estado, do mais novo ao mais antigo.
- Cada estado oferece um menu diferente: Pause, Continue, Cancel, Delete, Go to session etc.
- Em queued mostra `#N in queue` do servidor; em paused mostra `#N Paused`.
- As automations agendadas existentes continuam; o diff gigante de `AutomationEditView.tsx` vem em boa parte de reformatação e da adoção de opções compartilhadas de projeto, não de uma reescrita de negócio da página inteira.

### 12.2 Formulário de criação/edição

- O projeto só pode ser um workspace local já aberto e disponível no desktop; nada de recent, remote ou projetos indisponíveis.
- Título e Instructions são obrigatórios.
- A permissão reaproveita os quatro níveis: build/edit/plan/yolo; a constante real de padrão da UI é `build`.
- O comentário do tipo compartilhado ainda escreve o padrão `"default"`, inconsistente com o padrão real da UI, o que é uma dívida de comentário de documentação.
- O modelo só pode ser um modelo idle-plan dentro de `allowed_models`.
- GLM-5.2 exibe `max/high/nothink`, com `max` como padrão.
- A página de criação e a página de Automations espelham o switch global de keep-awake.
- Sair de um rascunho sujo pede confirmação de descarte.
- Na primeira submissão em modo diferente de yolo aparece o aviso de full-access, mas o aviso não bloqueia a submissão.
- queued/paused são editáveis; running/terminais ficam bloqueados; o projeto de uma tarefa existente não pode ser alterado.

### 12.3 History

- Uma task tem 0 ou 1 linha agregada no History.
- Não aparece sem `startedAt` ou quando já existe `historyDeletedAt`.
- completed → Succeeded; failed → Failure; cancelled → Skipped; outros estados já iniciados → In progress.
- A duração mostra no mínimo 1 minuto.
- Ações de linha: Go to session, Delete history.
- Delete history não tem confirmação nem Undo, apenas grava o tombstone.

### 12.4 Barra lateral e entrada New task

- O grouped sidebar do desktop ganha o grupo de sistema `Idle-time task` colapsável, que agrega tarefas entre projetos e mostra a contagem.
- Clicar em uma tarefa com session entra na session; sem session volta ao item correspondente em Automations.
- O estado vazio de New task ganha banner de horário ocioso e card de modelo, que pode levar um rascunho pendente para a página de criação.
- O fechamento do banner fica salvo apenas na session do renderer atual, sem persistência entre inicializações.

### 12.5 Notificações, diálogos e toasts

- Apenas o desktop local escuta mudanças de borda de completed, failed e awaiting_approval e emite notificação de sistema.
- O primeiro load apenas estabelece a linha de base e não reenvia notificações de histórico.
- As notificações de sistema são deduplicadas por task/status; cancelled não notifica.
- O código de notificação de awaiting existe, mas como o estado de execução é inalcançável, hoje ele não é disparado pelo fluxo real de permissão.
- O ConfirmDialog ganha capacidades como compact, destructive, controle de fechamento e desativação de atalhos.
- O Toast ganha variantes top-right, info/warning, action e dismiss, usadas para avisos de plano e de risco.

### 12.6 Internacionalização e identificadores de teste

- Inglês e简体中文 completam os textos de tarefa de horário ocioso, estados, erros, formulário, History, cota e keep-awake.
- `IntlProvider` e o shape de locale ficam em sincronia.
- Os test ids compartilhados ganham identificadores de定位 de página/E2E de Off-Peak.

## 13. Semântica final do Keep Awake

A implementação inicial ligava e desligava o blocker conforme "active task count > 0 e switch ligado"; o commit final do MR passou para um switch global:

```text
AppSettings.keepAwakeWhileRunning
          │
          ├─ false ─► stop powerSaveBlocker
          └─ true  ─► start("prevent-app-suspension") immediately
                       （与当前是否有运行中闲时任务无关）
```

- O padrão é false.
- General Settings, o banner de Automations e as páginas de criação/edição veem o mesmo setting.
- Na inicialização do desktop e a cada atualização do setting, o `powerSaveBlocker` é sincronizado na hora.
- O scheduler ainda reporta o active count, mas o count callback do main não decide mais o blocker.
- Só é possível impedir a suspensão automática do app/sistema por ociosidade, e não o fechamento da tampa nem um sleep pedido pelo usuário.

## 14. Fronteiras Desktop / Web / Mobile Remote

- `IOffPeakTaskService` foi adicionada ao common accessor e ao remote service client para unificar o contrato de serviço; isso não significa que o mobile remote abra o produto.
- O `/remote` do celular esconde Automations; rota obsoleta que ainda é atingida volta para chat.
- Workspace remoto do desktop esconde idle task e o grupo da barra lateral.
- O seletor de projeto de criação só oferece workspaces locais já abertos.
- Não houve novo remote Agent runtime, local host ou session SSH/WSL/Docker.
- Não se alterou a responsabilidade de negócio do relay nem se colocou estado de task/queue/snapshot dentro do relay/main.
- O despacho do desktop usa explicitamente `desktop-continuous`; não contornou a fronteira de recuperação do `web-remote-replayable` do celular.

## 15. Cobertura de testes e estado atual de verificação

### 15.1 Testes automatizados novos/estendidos

| Camada | Cobertura |
|---|---|
| adapter retry | 9 categorias de 429/3105/3102, Retry-After, fronteiras generate/stream e isolamento do provider comum |
| Repo | 16 categorias de criação de tabela, guarda de estado, claim, recuperação, continuação, History, settle outbox |
| Service | 10 categorias de criação, pause/continue, sincronização, renovação de ticket, cancel/settle e desvio de erros |
| Server client/mock | 7 categorias de parsing de interface, envelope, position null, availability, avanço de estado, códigos de erro |
| Runtime model | 5 categorias de credencial dupla, construção de provider, escolha do modelo do usuário, fallback de múltiplos providers |
| Client config/gray | 5 categorias de switch de configuração, allowed models, fail-closed/refresh de availability |
| Integração de serviço ponta a ponta | 3 categorias de mock take → ready → dispatch/ciclo de continuação |
| Scheduler settlement | 3 categorias de success/permanent/transient e backoff |
| UI | project options, concorrência do store, mapeamento do History, toast, ocultação no mobile remote |
| WDIO | fluxo de criação/gestão e duas specs de pre-gate de cota por availability |

### 15.2 Catálogo de conversations

- `docs/conversation-session-case-catalog.md` ganha OP01–OP09.
- A matriz de cobertura registra os cenários e fronteiras de off-peak.
- OPF/OPA/OPR/OPB da GUI continuam marcados como planned.
- OPP já tem casos escritos, mas a matriz ainda registra que falta executar no ambiente de destino.
- service mechanism tem cobertura para OP02/OP04/OP07.

### 15.3 Conclusões de teste que não podem ser mal lidas

- O E2E consegue verificar gestão de UI e gating de serviço, e isso não significa que o agendamento real de horário ocioso em produção, a cobrança real de plano ou a expiração natural de 3 horas já estejam verificados.
- O modo proxy do mock upstream usa a Coding Plan key do próprio usuário, e portanto não prova o caminho de cobrança do idle-plan em produção.
- O awaiting approval não tem fiação de evento de produção, e a existência da UI/notificação correspondente não significa disponibilidade ponta a ponta.
- Itens pending/planned da matriz de cobertura continuam pendentes de verificação e não devem ser escritos como cobertura total na descrição do MR.

## 16. Mudanças de CI, ambiente de desenvolvimento e documentação

### 16.1 GitLab CI

- O workflow aceita pipeline source do tipo API, evitando que disparos por API sejam filtrados direto pelas regras de nível superior.
- As condições de source dos jobs de conversation E2E manual, manifest legado e upload/preload de sandbox passam a permitir API.
- Essa parte é um ajuste de capacidade de disparo de teste/publicação e não está acoplada diretamente à lógica de domínio de Off-Peak.

### 16.2 Isolamento do diretório de desenvolvimento com mise

- `mise run dev` ganha `ZCODE_DATA_BASE_DIR={{env.HOME}}/.zcode-dev-home`.
- Os dados do desktop em desenvolvimento ficam isolados dos dados de produção em `~/.zcode`.
- Documentação e o test de root build script são atualizados junto.
- A semântica existente de `pnpm dev:desktop:test` não foi mudada para a mesma entrada.
- O scheme OAuth customizado `zcode://` ainda pode competir com a versão oficial já instalada; esse é um limite de registro de sistema que o isolamento do data dir não resolve.

### 16.3 Documentação

- `spec.md`: semântica de produto, máquina de estados, provider, UI e History.
- `decisions.md`: escolhas de design e evolução como D22–D39.
- `tech-design.md`: design de dados, processos, interfaces e sequências.
- `implementation-notes.md`: mapa final de arquivos críticos, restauração de modelo e notas de integração.
- `glossary.md`: terminologia e mapeamento de estados.
- `table-design.html`: auditoria de implementação, riscos e relatório de ciclo de vida em formato de tabelas.
- catálogo de conversations / matriz de cobertura: registro de testes.
- documento da visão principal de scheduled-tasks: esclarece a fronteira entre os dois tipos de Automations.

O `tech-design.md`, o `glossary.md` e os parágrafos iniciais do ADR no Head original do MR misturavam semântica histórica como "planejado / ainda não implementado", register/per-task GET, 3001, o limit estático do D36 e a troca de provider na aprovação. O documento de follow-up de 2026-07-22 alinhou tech design/glossary/spec ao código atual e deixou clara no topo de `decisions.md` a regra de supersession de ADR; a troca de provider na aprovação continua marcada como capacidade não implementada, em vez de ser reescrita como concluída.

## 17. Planos substituídos ou corrigidos repetidamente dentro do MR

| Tema | Estado intermediário | Estado final no Head do MR |
|---|---|---|
| Previsão de cota | D36 `limit.max_tasks/sliding_window` + createdAt local | snapshot de availability do servidor no D39 + POST como autoridade final |
| Keep Awake | blocker só com switch e active count > 0 | switch global ligado já aciona o blocker |
| Modelo da Session | na primeira criação podia cair no primeiro provider da ordenação | workspace default → lastUsed → current, preservando provider/model completos |
| Ciclo de vida do provider temporário | risco de mensagens enfileiradas usarem o provider errado por causa do momento de restauração | restauração e limpeza do overlay de turno antes do ready / drain da fila |
| Código de ticket expirado | 3001 no início | 3102 como código oficial, mantendo 3001 por compatibilidade |
| UI | múltiplos alinhamentos de Figma | composer de criação, cards de duas colunas, History, estados de borda e de bloqueio consolidados |
| Contagem de interfaces | quatro interfaces | quatro interfaces JSON de ticket + um endpoint de messages |
| Execução imediata | mantida no plano inicial | v1 remove a entrada de execução imediata |

## 18. Lacunas, riscos e dívida técnica conhecidos

### 18.1 Lacunas funcionais

1. `awaiting_approval` não está ligado à cadeia de produção a partir dos eventos de permissão do agent.
2. A troca para o provider do usuário após a aprovação e o aviso "a continuação usará a cota do seu próprio plano" não estão implementados.
3. ~~A matriz de suporte do Coding Plan da UI e do runtime é inconsistente.~~ Foi unificada no D40 em um snapshot de credencial selecionada, cobrindo ZAI pessoal, BigModel pessoal e BigModel Team.
4. O History não oferece auditoria por ticket/bloco.

### 18.2 Riscos de consistência e recuperação

1. POST de ticket bem-sucedido com insert no SQLite falhando gera ticket órfão no servidor.
2. O Delete, após falha de settle por rede/5xx, apaga a linha fisicamente e perde a base do outbox para retry.
3. `not_found` no sync não dispara retake automático; só o Continue retira de novo.
4. Se o take de ticket inesperadamente devolver active/expired/settled/not_found, ainda pode ser criada uma task em queued mas não despachável; só alguns caminhos de expired convergem automaticamente.
5. Vários hosts iniciam seu próprio loop de sync, gerando requisições duplicadas de status/settle.
6. `next_poll_at` não é um agendador por tarefa, é apenas um snapshot; o timer compartilhado pode ser mais grosseiro que a semântica do campo.
7. O `running` da UI antecede a admissão real das messages, e a expressão de estado durante a espera por 429 é imprecisa.
8. A linha da task guarda apenas o ticket atual; depois que a troca sobrescreve, o histórico de tickets não pode ser auditado localmente.

### 18.3 Derivas semânticas restantes e dívida de documentação já corrigida

1. Alguns comentários no código ainda dizem "status polling dispara o server promote"; o fato atual do servidor é que a promote vem de um timer próprio, e o polling do cliente é apenas observação.
2. O comentário do tipo compartilhado escreve permission padrão `default`, enquanto a UI usa de fato `build` (a dívida de comentário de código continua).
3. ~~Os cabeçalhos de estado de implementação de tech design/glossary estavam desatualizados~~: em 2026-07-22 passaram a ser um snapshot de fatos do código já implementado.
4. O 3001 permanece apenas como compatibilidade do adapter e ADR histórico; a documentação atual declara 3102 como o código oficial.
5. A cota estática do D36 só permanece em ADR histórico e está claramente superseded pelo D39; spec/tech/glossary atuais tratam apenas availability + POST 3103 como a situação atual.

## 19. Checklist de aceitação de merge sugerido

- [ ] Confirmação de produto: `awaiting_approval` é algo que este MR precisa concluir, ou é explicitamente rebaixado a capacidade futura.
- [ ] Se for obrigatório, completar a máquina de estados ponta a ponta permission event → awaiting → approve/reject → troca de provider, com o aviso de cota.
- [x] Team Plan entra na matriz de suporte reaproveitando o helper de runtime-key existente; ZAI/BigModel pessoal, Team e estados de rejeição já têm testes de matriz.
- [ ] Rodar uma vez cada uma com credenciais reais de ZAI e Team no ambiente de destino: availability → take → messages → settle.
- [ ] Avaliar estratégias de compensação para ticket órfão e perda de outbox no Delete.
- [ ] Definir uma regra única de retake/fail para `not_found` e para o estado inicial inesperado do take.
- [ ] Decidir se o sync duplicado entre múltiplos hosts é aceitável ou se é preciso um owner único.
- [x] Atualizar cabeçalhos de documentos obsoletos e as formulações de interfaces/cota/3001-3102/provider de aprovação; o comentário de código sobre o padrão de permission fica listado à parte como dívida.
- [ ] Executar no ambiente de destino o WDIO pendente e a integração com serviço real, validando availability, ready, 429, 3102 e settle.
- [ ] Confirmar que a liberação de API source no CI e o isolamento de data-dir do mise realmente devem entrar junto deste MR.


## 20. Tabela completa da evolução dos commits

Esta tabela serve para explicar por que o MR tem textos antigos ou planos substituídos por commits posteriores; o comportamento final segue o código do Head do MR.

| # | Commit | Data | Tema |
|---:|---|---|---|
| 1 | `d8ed02147a` | 2026-07-15 | docs(off-peak-task): 设计收敛 D22-D31——四接口契约/长等待策略/Automations 范式定案/灰度开关 |
| 2 | `ffe085c903` | 2026-07-15 | docs(off-peak-task): 修正领域模型陈旧片段——对齐 D28-D30 定案 |
| 3 | `6070fe0ee2` | 2026-07-15 | feat(off-peak): shared 领域类型与派发协议消息对（MR1 之一） |
| 4 | `d5f9f3ce7d` | 2026-07-15 | feat(off-peak): off_peak_tasks 存储与 OffPeakTaskRepo 状态机守卫（MR1 之二） |
| 5 | `7fc49a1c17` | 2026-07-15 | chore: merge origin/main into feat/automations_v2 |
| 6 | `9f57eb9a88` | 2026-07-15 | docs(off-peak-task): §11 六项开工前 spike 结论落档（2026-07-15 全部完成） |
| 7 | `bdaa94be53` | 2026-07-15 | docs(off-peak-task): D32/D33 定案落档——砍掉立即执行 + per-turn 注入 + 单批交付 |
| 8 | `ba1d737838` | 2026-07-15 | feat(off-peak): 调度链路——scheduler tick 认领派发 + main 路由 + host OffPeakRun（工序 2） |
| 9 | `5e5cf11c60` | 2026-07-15 | docs(off-peak-task): E2E case catalog OP 组登记 + 覆盖矩阵剪枝定案 |
| 10 | `de39441e30` | 2026-07-15 | feat(off-peak): repo 续跑回队/外部主键/非终态清单 + 3001 稳定错误标记（工序 3 之一） |
| 11 | `324a1cb27f` | 2026-07-15 | feat(off-peak): 服务端四接口客户端 + 进程内 mock 网关（工序 3 之二） |
| 12 | `6d133cb8ef` | 2026-07-15 | feat(off-peak): offPeakTaskService 编排——创建取号/取消/Pause-Continue/同步轮询/核销 outbox/3001 续跑（工序 3 之三） |
| 13 | `8c64637d51` | 2026-07-15 | feat(off-peak): 适配层排队重试协议——429/3105 豁免预算无限探测 + 3001 续跑标记（工序 3 之四） |
| 14 | `42a3842a79` | 2026-07-15 | feat(off-peak): per-turn runtimeModel 注入——idle plan 单轮生效零持久化（工序 3 之五，D33 落地） |
| 15 | `8b5cc76028` | 2026-07-15 | feat(off-peak): client/configs 灰度配置接入——getOffPeakClientConfig + 有效开启判据（工序 3 之六，D31） |
| 16 | `86de3d93c9` | 2026-07-15 | feat(off-peak): host 运行时装配——mock 网关/双凭证/per-turn 派发/3001 续跑闭环（工序 3 之七，收口） |
| 17 | `b28f8bf883` | 2026-07-15 | feat(off-peak): IOffPeakTaskService 专用服务通道——renderer RPC 接入面（工序 4 之一） |
| 18 | `3c998f3d39` | 2026-07-15 | feat(off-peak): Automations 主视图 UI——三 Tab/创建表单/列表卡片/灰度门控（工序 4 之二） |
| 19 | `8d21d75de4` | 2026-07-15 | feat(off-peak): keep-awake powerSaveBlocker——执行中阻止闲置休眠（工序 4 之三，D4/D30-3） |
| 20 | `2efe656380` | 2026-07-15 | feat(off-peak): 系统通知——完成/失败/等确认三 variant（工序 5 之一，D10/D30-5） |
| 21 | `1c3316e264` | 2026-07-15 | test(off-peak): mock 网关固定响应模式 + 端到端集成测试（工序 5 之二） |
| 22 | `f896aba939` | 2026-07-15 | docs(off-peak-task): 实现说明——全链路图 + 关键文件地图 + 计费边界踩坑 + 本地演示 |
| 23 | `feabfd94fb` | 2026-07-15 | feat(off-peak): 侧栏 Group 系统分组「Idle-time task」（spec §5 侧栏，D28/D30-5） |
| 24 | `2aa9a953d1` | 2026-07-15 | test(off-peak): WDIO 创建/管理 E2E + mock 网关 E2E 接线（工序 5 之三） |
| 25 | `250f4e63f9` | 2026-07-15 | Merge remote-tracking branch 'origin/main' into feat/off-peak-task |
| 26 | `83d85fda4f` | 2026-07-15 | test(off-peak): 修复 e2eBeforeSessionSetup 单测——补 startOffPeakMockIfNeeded stub |
| 27 | `d64f9d8b77` | 2026-07-15 | fix(off-peak): 闲时任务 tab 泄漏定时任务 UI——空状态/通过对话创建/模板区 |
| 28 | `d3027d8344` | 2026-07-15 | feat(off-peak): New task 页闲时任务入口——引导横幅 + 模板卡（Figma 4798-2126，spec §5 第二入口） |
| 29 | `dc45ef2d4c` | 2026-07-16 | feat(off-peak): 创建表单对齐 Figma 4827-1398——composer 范式重写 |
| 30 | `bfdf4a07b4` | 2026-07-16 | feat(off-peak): 任务列表对齐 Figma 4866-1735——2 列卡片网格 + 保持唤醒横幅 |
| 31 | `06649d7d01` | 2026-07-16 | feat(off-peak): 列表状态态对齐 Figma 4866-2175——paused 显示 #N Paused + Pause/Continue 信息提示 |
| 32 | `918db40823` | 2026-07-16 | feat(off-peak-task): 补齐 thoughtLevel 推理档位字段——与 automation 对齐（D34） |
| 33 | `effe6f52cf` | 2026-07-16 | fix(off-peak-task): New task 入口/推理档位默认对齐 Figma——agent-browser 实测修正 |
| 34 | `cc30501301` | 2026-07-16 | fix(off-peak): repair ticket execution lifecycle |
| 35 | `b5a8101a06` | 2026-07-16 | fix(dev): isolate mise dev data from production |
| 36 | `fdb628112e` | 2026-07-16 | fix(off-peak-task): 卡片状态态/编辑页动作对齐 Figma——多状态实测修正 |
| 37 | `c72b97760c` | 2026-07-16 | feat(off-peak-task): 边缘态逐帧对齐 Figma——丢弃草稿/History 表格/权限两行下拉/完全访问提示/达上限置灰（D35） |
| 38 | `06ecb87dbb` | 2026-07-16 | feat(off-peak-task): 非 coding plan 锁定态落地——按当前时刻注册表判定（D35 拍板） |
| 39 | `c99978f9c4` | 2026-07-16 | docs(off-peak): mark reactive quota grey-out as transitional |
| 40 | `882fc6c3f2` | 2026-07-17 | docs(off-peak-task): 记录服务端契约真源 + 额度口径修正 + 达上限置灰目标形态（D36） |
| 41 | `80e8d13ee0` | 2026-07-17 | docs(off-peak-task): D36 收口——确认 limit.{max_tasks,sliding_window} 字段名 + sliding_window 单位秒 |
| 42 | `3ede57ca8e` | 2026-07-17 | feat(off-peak-task): D36 实现——配置预判置灰 + 3103 兜底 |
| 43 | `eac5bb9e24` | 2026-07-17 | test(off-peak-task): D36 达上限 pre-emptive 置灰 E2E + wdio mock 钩子 |
| 44 | `7e7a52ebf6` | 2026-07-17 | chore(off-peak-task): startOffPeakE2EMock 注入 ZCODE_OFFPEAK_MOCK_LIMIT |
| 45 | `f290620194` | 2026-07-20 | merge: origin/main into feat/off-peak-task |
| 46 | `90a0a8bcc6` | 2026-07-20 | fix(build): repair merged development blockers |
| 47 | `03e9661b15` | 2026-07-20 | docs(automations): align idle-time figma behavior |
| 48 | `0c0ad960d5` | 2026-07-20 | feat(automations): align idle-time task UX and boundaries |
| 49 | `c01f70de34` | 2026-07-20 | Merge remote-tracking branch 'origin/main' into feat/off-peak-task |
| 50 | `2a4cc85a43` | 2026-07-20 | docs(off-peak): add table design and lifecycle report |
| 51 | `fdf46ee9ed` | 2026-07-20 | docs(off-peak): expand architecture walkthrough |
| 52 | `c3a9e2ad92` | 2026-07-20 | Merge remote-tracking branch 'origin/main' into feat/off-peak-task |
| 53 | `7f15dbd8cb` | 2026-07-20 | test(automations): align mobile remote visibility |
| 54 | `9e88d54923` | 2026-07-21 | ci: allow API-triggered pipelines for manual test builds |
| 55 | `b636776a27` | 2026-07-21 | fix(off-peak): preserve CLI turn model lifecycle |
| 56 | `74ed7a5d9b` | 2026-07-21 | fix(off-peak): keep quota retries available |
| 57 | `7f00a7ece3` | 2026-07-21 | fix(off-peak): inherit workspace model for run sessions |
| 58 | `436f3d956a` | 2026-07-21 | feat(off-peak): use server quota availability |
| 59 | `e50f08b78e` | 2026-07-21 | fix(off-peak): prevent stalled task dispatches |
| 60 | `cc3980d2a1` | 2026-07-21 | feat(desktop): make keep-awake a global settings switch |

## 21. Lista item a item dos 115 arquivos alterados

Estado: `A`=novo, `M`=modificado. As linhas vêm do diff exato do MR; cada changed path aparece exatamente uma vez nesta tabela.

| # | Estado | Linhas | Arquivo | Mudança concreta |
|---:|:---:|---:|---|---|
| 1 | M | +4/-2 | `.gitlab/ci/00-workflow.yml` | O workflow de nível superior libera pipeline com source API, evitando que disparos por API sejam filtrados já na etapa de criação. |
| 2 | M | +2/-2 | `.gitlab/ci/20-test.yml` | As regras dos jobs de teste passam a aceitar source API, cobrindo entradas como o conversation E2E manual. |
| 3 | M | +1/-1 | `.gitlab/ci/30-build.yml` | A condição de source da etapa de build ganha o disparo por API. |
| 4 | M | +3/-3 | `.gitlab/ci/50-release.yml` | Jobs manuais de release/sandbox passam a liberar source API. |
| 5 | A | +62/-0 | `apps/zcode-cli/packages/adapters/src/model/offpeak-retry.ts` | Nova classificação de falhas exclusiva do provider de horário ocioso: espera de fila 429/3105, marcador de ticket expirado 3102/legacy 3001 e clamp de Retry-After. |
| 6 | M | +40/-4 | `apps/zcode-cli/packages/adapters/src/model/runner-generate.ts` | O runner de generate adota a decisão de Off-Peak; a espera por capacidade não consome o retry budget comum e há suporte a abort. |
| 7 | M | +75/-5 | `apps/zcode-cli/packages/adapters/src/model/runner-stream.ts` | O runner de stream adota um retry semelhante, mas só reproduz enquanto não cruzou a fronteira de saída visível. |
| 8 | A | +296/-0 | `apps/zcode-cli/packages/adapters/tests/offpeak-retry.test.ts` | Cobre o retry generate/stream exclusivo de Off-Peak, Retry-After, códigos de negócio e o isolamento do provider comum. |
| 9 | M | +45/-15 | `apps/zcode-cli/packages/bootstrap/src/app/model-catalog-overlay.ts` | Separa o overlay de runtime em camada de workspace e de turno, com instalação de turno único, limpeza e refresh do registry. |
| 10 | M | +19/-8 | `apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts` | O facade de session ganha o ciclo de vida do turn runtime model e restaura o modelo do usuário no fim do turno. |
| 11 | M | +14/-1 | `apps/zcode-cli/packages/bootstrap/src/app/types.ts` | Estende os tipos de model catalog overlay/session para expressar overlay de escopo de turno. |
| 12 | M | +51/-12 | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/session-flow.ts` | O fluxo de criação/recuperação de session trata o modelo explícito do usuário e a ordem de limpeza do overlay de turno. |
| 13 | M | +18/-0 | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/prompt-turn.ts` | O prompt turn recebe e instala o turnRuntimeModel, registrando o modelo anterior para restauração no estado terminal. |
| 14 | M | +10/-0 | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/types.ts` | O tipo de contexto de comandos ganha turn runtime model e informações de restauração. |
| 15 | M | +3/-0 | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts` | Projeta o retry de fila de Off-Peak como um rate-limit fault recuperável. |
| 16 | M | +61/-0 | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/v4-bridge.ts` | A camada de bridge antiga repassa o turnRuntimeModel, mantendo os dois caminhos de comando (v4 native e bridge) consistentes. |
| 17 | M | +53/-3 | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts` | O catálogo do workspace preserva o overlay de turno em hot updates e trata o fallback seguro quando o modelo original foi removido. |
| 18 | M | +69/-0 | `apps/zcode-cli/packages/bootstrap/tests/model-catalog-overlay.test.ts` | Verifica a mesclagem, substituição e limpeza do overlay duplo de workspace/turn. |
| 19 | A | +131/-0 | `apps/zcode-cli/packages/bootstrap/tests/offpeak-turn-model-overlay.test.ts` | Verifica o provider de horário ocioso valendo por um turno, a restauração antes do estado terminal e mensagens de usuário enfileiradas não usando o provider temporário. |
| 20 | M | +69/-0 | `apps/zcode-cli/packages/bootstrap/tests/v4-native-commands.test.ts` | Cobre o parâmetro turnRuntimeModel do sendText v4 native e a fronteira de rejeição quando ocupado. |
| 21 | M | +53/-0 | `apps/zcode-cli/packages/bootstrap/tests/zcode-protocol.test.ts` | Cobre o repasse do modelo temporário e o comportamento de restauração no protocolo bridge. |
| 22 | M | +2/-0 | `apps/zcode-cli/packages/contracts/src/model/index.ts` | O contrato de modelo ganha o motivo de retry de fila de Off-Peak. |
| 23 | M | +30/-0 | `docs/conversation-session-case-catalog.md` | Registra os casos OP01–OP09 de ciclo de vida da session de horário ocioso, continuação, recuperação e fronteiras de provider. |
| 24 | M | +6/-1 | `docs/development-mise-runtime.md` | Registra que o mise dev usa um diretório de dados separado e seus limites com outras entradas de desenvolvimento e o scheme OAuth. |
| 25 | M | +277/-4 | `docs/off-peak-task/decisions.md` | Acumula as decisões de design D22–D39, incluindo interfaces, estados de dois eixos, provider por turno, UI, cota e evolução do History. |
| 26 | M | +14/-2 | `docs/off-peak-task/glossary.md` | O Head original do MR acrescentava termos de ticket/task/session e estados mas mantinha o cabeçalho de minuta; o follow-up de 2026-07-22 reescreveu como glossário da implementação atual. |
| 27 | A | +87/-0 | `docs/off-peak-task/implementation-notes.md` | Novo mapa final de arquivos de implementação, cadeia de despacho, escolha do modelo do usuário, momento de restauração, cobrança e demonstração local. |
| 28 | M | +92/-54 | `docs/off-peak-task/spec.md` | Atualiza a especificação completa de produto: criação, estados, provider, permissão, UI, History, rollout e comportamento de borda. |
| 29 | A | +3083/-0 | `docs/off-peak-task/table-design.html` | Novo relatório visual de ciclo de vida/auditoria em tabelas com 3.083 linhas, contendo fatos atuais, evolução de planos e lista de riscos. |
| 30 | M | +327/-128 | `docs/off-peak-task/tech-design.md` | O Head original do MR ampliou o design mas misturou semântica de planejamento; o follow-up de 2026-07-22 alinhou as interfaces finais, cota, Provider e fronteira de permission. |
| 31 | M | +23/-0 | `docs/testing/conversation-session-e2e-coverage-matrix.md` | Acrescenta a matriz de cobertura de casos de Off-Peak, distinguindo coberto, planned e pending execution. |
| 32 | M | +9/-4 | `docs/ui/scheduled-tasks-main-view.md` | Esclarece a coexistência e a fronteira entre Scheduled e Idle-time task na visão principal de Automations. |
| 33 | M | +2/-1 | `mise.toml` | Injeta ZCODE_DATA_BASE_DIR=~/.zcode-dev-home no mise dev, isolando os dados de produção. |
| 34 | M | +5/-0 | `packages/client/src/remoteServiceAccess.ts` | O accessor de serviço remoto expõe o contrato IOffPeakTaskService; isso não equivale a abrir o produto no mobile remote. |
| 35 | M | +381/-0 | `packages/desktop/src/host/index.ts` | Implementa a montagem do runtime de Off-Peak no host, credencial dupla, resolução do modelo do usuário, criação da primeira session, despacho de continuação, assinatura de estado terminal e ciclo do 3102. |
| 36 | M | +62/-0 | `packages/desktop/src/main/desktopCronScheduler.ts` | Encaminha OffPeakRun/Result, wake do scheduler e mensagens de active count na ponte de agendamento do main. |
| 37 | M | +28/-0 | `packages/desktop/src/main/desktopHostProcess.ts` | O tratamento de mensagens do host process ganha resultados de despacho de Off-Peak e o callback de wake. |
| 38 | M | +44/-0 | `packages/desktop/src/main/index.ts` | Monta o roteamento de Off-Peak entre scheduler e host e gerencia o powerSaveBlocker conforme o setting global. |
| 39 | M | +113/-1 | `packages/desktop/src/scheduler/index.ts` | O scheduler ganha claim e despacho a cada 20 segundos, recuperação na inicialização, conjunto in-flight, backoff transitório e liquidação de resultados. |
| 40 | A | +85/-0 | `packages/desktop/src/scheduler/offPeakDispatchSettlement.ts` | Novo classificador de resultado de despacho: sucesso com markRunning, falha permanente indo a estado terminal e falha transitória liberando o claim com backoff exponencial. |
| 41 | M | +31/-0 | `packages/desktop/src/scheduler/schedulerProtocol.ts` | Novos tipos de protocolo OffPeakRun, Result, wake e active-count entre scheduler e main. |
| 42 | M | +2/-0 | `packages/desktop/test/e2e/helpers/e2e-before-session.ts` | O auxiliar de inicialização do E2E passa a preparar o ambiente do mock de Off-Peak. |
| 43 | A | +182/-0 | `packages/desktop/test/e2e/off-peak-create-manage.test.ts` | Novo fluxo WDIO de criação, edição, pausa, continuação, exclusão e gestão da listagem. |
| 44 | A | +120/-0 | `packages/desktop/test/e2e/off-peak-limit-pre-gate.test.ts` | Novo E2E de availability / pre-gate de cota; o nome do arquivo ainda usa a semântica antiga de limite. |
| 45 | M | +4/-0 | `packages/desktop/test/e2eBeforeSessionSetup.test.ts` | Acrescenta stubs para o novo hook de inicialização do mock, mantendo o teste unitário do auxiliar estável. |
| 46 | A | +99/-0 | `packages/desktop/test/offPeakDispatchSettlement.test.ts` | Cobre a liquidação success/permanent/transient do resultado de despacho do scheduler e seu backoff. |
| 47 | M | +13/-0 | `packages/desktop/test/root-build-scripts.test.ts` | Asserte a configuração de isolamento do data dir do mise dev, protegendo os root build scripts. |
| 48 | M | +51/-19 | `packages/desktop/wdio.conf.ts` | Injeta e limpa automaticamente mock env e parâmetros de ready/TTL/poll/availability conforme a spec de Off-Peak. |
| 49 | M | +3/-0 | `packages/services/src/accessor.ts` | O accessor de serviços ganha a IOffPeakTaskService. |
| 50 | M | +52/-0 | `packages/services/src/coding-plan-subscription/bigmodelCodingPlanSubscriptionProvider.ts` | Lê enable/allowed_models de Off-Peak a partir dos client configs e fornece informação de estado do plano. |
| 51 | M | +3/-0 | `packages/services/src/coding-plan-subscription/codingPlanSubscription.ts` | O contrato de assinatura ganha a capacidade de ler o client config de Off-Peak. |
| 52 | M | +1/-0 | `packages/services/src/coding-plan-subscription/codingPlanSubscriptionService.ts` | O service repassa o client config de Off-Peak do provider. |
| 53 | M | +3/-0 | `packages/services/src/index.ts` | Exporta publicamente os módulos de service/repo/runtime/server client de Off-Peak. |
| 54 | M | +72/-0 | `packages/services/src/node.ts` | O contêiner de serviços Node monta o Repo, o server client, o origin resolver, os callbacks de sincronização e a IOffPeakTaskService. |
| 55 | A | +475/-0 | `packages/services/src/session/offPeakMockGateway.ts` | Novo gateway mock completo em processo para tickets/messages, com avanço de estado, injeção de falhas, respostas offline e proxy de upstream real. |
| 56 | A | +234/-0 | `packages/services/src/session/offPeakRuntimeModel.ts` | Novo tipo de erro permanente, resolução do modelo permanente do usuário, resolução de credencial dupla, construção do provider embutido de turno único e mock origin. |
| 57 | A | +251/-0 | `packages/services/src/session/offPeakServerClient.ts` | Novo cliente HTTP de availability/take/status/settle, parsing tolerante com Zod, dupla autenticação, timeout e erros de negócio tipados. |
| 58 | A | +44/-0 | `packages/services/src/session/offPeakTask.ts` | Define o contrato RPC da IOffPeakTaskService, parâmetros de edição e o service descriptor. |
| 59 | A | +727/-0 | `packages/services/src/session/offPeakTaskRepo.ts` | Novo schema SQLite off_peak_tasks, migrações, consultas, transições condicionais de estado, claim transacional, recuperação, continuação e outbox de settle. |
| 60 | A | +453/-0 | `packages/services/src/session/offPeakTaskService.ts` | Nova orquestração de gravação após retirada de número, CRUD, pause/continue, sincronização em lote de tickets, nova retirada, wake do scheduler e baixa. |
| 61 | M | +11/-0 | `packages/services/src/session/zcodeTaskService.ts` | A requisição sendText passa a aceitar um turnRuntimeModel opcional. |
| 62 | M | +2/-0 | `packages/services/src/zcode-agent/zcodeAgent.ts` | O tipo da interface de envio do Agent repassa o runtime model temporário. |
| 63 | M | +5/-0 | `packages/services/src/zcode-agent/zcodeAgentService.ts` | O Agent service continua repassando o turnRuntimeModel até a camada de protocolo. |
| 64 | M | +12/-2 | `packages/services/src/zcode-agent/zcodeTaskServiceAdapter.ts` | O task adapter coloca o modelo temporário em session/sendText e mantém a compatibilidade com chamadas antigas. |
| 65 | A | +115/-0 | `packages/services/test/offPeakClientConfig.test.ts` | Cobre o enable de rollout, allowed models, estado do plano e os limites de configuração ausente. |
| 66 | A | +173/-0 | `packages/services/test/offPeakE2eIntegration.test.ts` | Com mock, verifica retirada de número, ready, admissão de mensagens e o ciclo de estado terminal/continuação em nível de serviço. |
| 67 | A | +101/-0 | `packages/services/test/offPeakRuntimeModel.test.ts` | Cobre credencial ausente, configuração de provider, header e a escolha de modelo em usuários com múltiplos providers. |
| 68 | A | +259/-0 | `packages/services/test/offPeakServerClient.test.ts` | Cobre parsing, envelope, null, timeout/erro e restrições de availability das cinco interações com o servidor. |
| 69 | A | +487/-0 | `packages/services/test/offPeakTaskRepo.test.ts` | Cobre sistematicamente schema, CRUD, guardas de edição, claim, estados terminais, recuperação, History e outbox. |
| 70 | A | +301/-0 | `packages/services/test/offPeakTaskService.test.ts` | Cobre create/cancel/pause/continue/sync/retake/settle e os ramos de exceção do servidor. |
| 71 | M | +2/-0 | `packages/services/test/zcodeAgentService.providerRegistry.test.ts` | Ajusta o teste do provider registry para acomodar o repasse do runtime model temporário. |
| 72 | M | +20/-0 | `packages/services/test/zcodeLegacyTaskCompatTaskIndex.test.ts` | Garante que o novo off_peak_tasks não quebra a compatibilidade nem a inicialização do legacy task index. |
| 73 | M | +8/-0 | `packages/shared/src/channels.ts` | Novo canal de serviço de Off-Peak e novos nomes de mensagens entre processos. |
| 74 | M | +14/-0 | `packages/shared/src/coding-plan-subscription.ts` | Novos tipos compartilhados de client config e allowed model de Off-Peak. |
| 75 | M | +1/-0 | `packages/shared/src/index.ts` | Exporta off-peak-types pelo barrel do shared. |
| 76 | A | +118/-0 | `packages/shared/src/off-peak-types.ts` | Novos sete estados do cliente, constantes, availability, entidade de tarefa e parâmetros de criação. |
| 77 | M | +2/-0 | `packages/shared/src/protocol.ts` | O protocolo de plataforma/serviço registra os tipos relacionados a Off-Peak. |
| 78 | M | +12/-0 | `packages/shared/src/test-ids.ts` | Novos test ids de E2E para criação, listagem, formulário e gating de cota de horário ocioso. |
| 79 | M | +38/-0 | `packages/shared/src/validation.ts` | Novos schemas de runtime para OffPeakRun, Result, wake e o modelo temporário do sendText. |
| 80 | M | +2/-0 | `packages/shared/src/validationAppSettings.ts` | O schema de AppSettings ganha keepAwakeWhileRunning, com padrão false. |
| 81 | M | +4/-0 | `packages/shared/src/zcode-protocol-v4/command.ts` | O comando sendText v4 ganha o campo turnRuntimeModel. |
| 82 | M | +2/-0 | `packages/shared/src/zcode-protocol/index.ts` | A entrada pública do protocolo exporta a nova estrutura de runtime model. |
| 83 | M | +17/-0 | `packages/shared/test/zcodeProtocol.test.ts` | Verifica que o schema do protocolo aceita um turnRuntimeModel válido e rejeita formas inválidas. |
| 84 | M | +8/-0 | `packages/ui/src/App.tsx` | Monta o hook de notificação de sistema de Off-Peak na raiz da aplicação. |
| 85 | M | +26/-20 | `packages/ui/src/ConfirmDialog.tsx` | Estende o diálogo de confirmação com compact/destructive, controle de fechamento e comportamento de atalhos. |
| 86 | M | +15/-0 | `packages/ui/src/SettingsPage.tsx` | General Settings ganha o switch global de keep-awake. |
| 87 | M | +56/-36 | `packages/ui/src/WorkspaceSidebar.tsx` | O grouped sidebar do desktop adota o grupo de sistema Idle-time task e trata a navegação entre session e Automations. |
| 88 | M | +20/-7 | `packages/ui/src/app-shell/WorkspaceShellLayout.tsx` | Decide os dados e a exibição da barra lateral de Off-Peak conforme a fronteira de layout desktop/local/remote. |
| 89 | M | +68/-4 | `packages/ui/src/components/ui/toast.tsx` | O Toast ganha posição, info/warning, action, dismiss e durações mais longas. |
| 90 | A | +43/-0 | `packages/ui/src/hooks/useAutomationProjectOptions.ts` | Filtra de forma unificada os workspaces locais abertos e disponíveis, reutilizado pelos formulários scheduled/off-peak. |
| 91 | A | +96/-0 | `packages/ui/src/hooks/useOffPeakTaskNotifications.ts` | Novas notificações de sistema de borda completed/failed/awaiting, linha de base no primeiro load e deduplicação. |
| 92 | M | +2/-2 | `packages/ui/src/i18n/IntlProvider.tsx` | Sincroniza o tipo do provider de locale para aceitar as novas chaves de mensagem. |
| 93 | M | +116/-6 | `packages/ui/src/i18n/locales/en-US.ts` | Completa em inglês os textos de tarefa de horário ocioso, estados, formulário, cota, History, keep-awake e notificações. |
| 94 | M | +107/-5 | `packages/ui/src/i18n/locales/zh-CN.ts` | Completa os textos correspondentes em chinês simplificado. |
| 95 | M | +1018/-1226 | `packages/ui/src/settings/AutomationEditView.tsx` | O formulário de automation agendada existente passa a usar candidatos locais compartilhados de projeto; a maior parte da variação de linhas é reformatação. |
| 96 | M | +701/-115 | `packages/ui/src/settings/AutomationsSection.tsx` | A visão principal adota três tabs, gray/availability, rotas de criação/edição, lista de tarefas, modelos, History e banner de keep-awake. |
| 97 | A | +65/-0 | `packages/ui/src/settings/OffPeakEditActionsMenu.tsx` | Novo menu de ações na página de edição mostrando Pause/Continue/Delete conforme o estado da tarefa. |
| 98 | A | +516/-0 | `packages/ui/src/settings/OffPeakEditView.tsx` | Novo composer de criação/edição, seleção de permissão/modelo/raciocínio, guarda de rascunho, tab de History e espelho do setting global. |
| 99 | A | +135/-0 | `packages/ui/src/settings/OffPeakHistoryTab.tsx` | Novo History agregado de 0/1 linha por tarefa, mapeamento de estado/duração e menu de linha. |
| 100 | A | +125/-0 | `packages/ui/src/settings/OffPeakSidebarGroup.tsx` | Novo grupo de barra lateral Idle-time task, colapsável e agregado entre projetos. |
| 101 | A | +321/-0 | `packages/ui/src/settings/OffPeakTaskList.tsx` | Novos cards de tarefa em duas colunas, ordenação por estado, posição na fila, ações por estado e navegação para a session. |
| 102 | A | +75/-0 | `packages/ui/src/settings/OffPeakToolbarSelect.tsx` | Novo seletor dropdown de toolbar adaptado ao composer de Off-Peak. |
| 103 | M | +23/-0 | `packages/ui/src/settingsPageHelpers.tsx` | Os auxiliares da página de settings passam a exibir novas configurações como keep-awake. |
| 104 | M | +4/-0 | `packages/ui/src/store/confirmDialogStore.ts` | O store do diálogo de confirmação ganha opções como compact, destructive e close. |
| 105 | A | +280/-0 | `packages/ui/src/store/offPeakTaskStore.ts` | Novos estados de tarefa/rollout/availability/rascunho, operationId concorrente, ações de CRUD e atualização por polling. |
| 106 | M | +6/-2 | `packages/ui/src/v4/ConversationDraftEmptyState.tsx` | Insere a entrada de horário ocioso no estado vazio de New task. |
| 107 | A | +114/-0 | `packages/ui/src/v4/OffPeakNewTaskEntry.tsx` | Novo banner de orientação, card de modelo, estado de fechamento e navegação com rascunho pendente. |
| 108 | M | +8/-0 | `packages/ui/src/v4/SessionPane.tsx` | Adota a entrada e a rota do estado vazio de Off-Peak no pane de session/new-task. |
| 109 | A | +63/-0 | `packages/ui/test/automationProjectOptions.test.ts` | Verifica que só workspaces locais abertos são retornados, excluindo recent/remote/indisponíveis. |
| 110 | A | +14/-0 | `packages/ui/test/offPeakHistoryStatus.test.ts` | Verifica o mapeamento de estados do History e a semântica de duração mínima. |
| 111 | A | +79/-0 | `packages/ui/test/offPeakTaskStore.test.ts` | Verifica o CRUD do store, a proteção contra sobrescrita obsoleta por operation e os estados gray/availability. |
| 112 | M | +9/-0 | `packages/ui/test/settingsDataBaseDirControl.test.ts` | Ajusta o teste de settings ao isolamento de dev data-base-dir. |
| 113 | M | +25/-0 | `packages/ui/test/toast.test.ts` | Cobre as novas variantes de toast, posição, action e dismiss. |
| 114 | M | +12/-12 | `packages/ui/test/workspaceSidebarWebRemoteMobileLayout.test.ts` | Verifica que o mobile remote esconde Automations/Off-Peak e faz fallback em rotas obsoletas. |
| 115 | M | +4/-0 | `packages/web/src/main.tsx` | O accessor de serviços da Web completa a montagem do contrato / fallback do serviço de Off-Peak. |

## 22. Verificações mecânicas feitas na geração deste documento

| Verificação | Resultado |
|---|---|
| Conferência de changed paths | 115 no documento; 115 no Git; sem ausências, extras ou duplicatas |
| Conferência de commits | 60 no documento; 60 no Git; ordem idêntica |
| `git diff --check` | Passou |
| `pnpm typecheck` | Passou |
| `pnpm lint` | Passou, 0 error; o branch atual imprime 54 warnings e este documento não modificou o código correspondente |
