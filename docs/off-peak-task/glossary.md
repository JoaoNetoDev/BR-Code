# Tarefas em Horário de Baixa Utilização · Glossário e Modelo de Domínio

> **Status: implementado; este documento é um retrato dos fatos do código em 2026-07-22.** A implementação atual inclui o domínio `offPeak`,
> `off_peak_tasks`, sincronização de tickets, dispatch por scheduler/host, idle provider por turno, UI e mock.
> `decisions.md` é o ADR histórico; entradas antigas como D11/D25/D36 devem ser lidas conforme as marcações de superseded posteriores.
>
> Desde 2026-08-22, `client/configs.offPeak` fornece apenas o interruptor de exposição; a associação de modelos e as capacidades estáticas vêm uniformemente do
> Built-in `builtin:offpeak-idle-plan` e do Effective Model Config.

> Fontes atuais deste documento: `spec.md`, `tech-design.md`, `implementation-notes.md` e o código real.

## Glossário

| Termo                              | Nome em inglês/código                     | Definição atual                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tarefa off-peak                    | Off-Peak Task / Idle-time task            | Uma tarefa em segundo plano de uso único dentro do sistema Automations. A criação já obtém um número; a session só é criada na primeira dispatch; ao concluir entra em estado terminal irreversível, e para rodar de novo é preciso criar uma nova tarefa                    |
| ID local da tarefa                  | `offPeakTaskId` / server `task_id`        | ID estável de uma tarefa lógica. Permanece igual entre várias tickets e vários segmentos de 3h de retomada automática                                                |
| ID de ticket do servidor           | `serverTicketId` / `ticket_id`            | Ticket ID gerado pelo servidor a cada retirada de número. Na renovação por expiração sobrescreve o valor atual da task row; o local não guarda histórico de tickets   |
| Disponibilidade para retirar número | Take-number availability                   | Snapshot instantâneo retornado por `GET /ticket/availability`; a criação só é permitida com retorno true bem-sucedido, e false/carregando/desconhecido/falha de consulta bloqueiam; `POST /ticket` cobre a corrida de concorrência após a consulta |
| Retirar número                     | Take Number                               | `POST /api/v1/off-peak/ticket {task_id}`. A task local só é criada em caso de sucesso; retorna o ticket state, a posição e a sugestão de próximo poll                    |
| Estado de admissão no servidor     | Ticket state                              | `queued / ready / active / expired / settled / not_found`. ready é gravado localmente como `schedulable=true`; active e o running local não são escritos estritamente ao mesmo tempo |
| Estado de execução no cliente      | Task status                               | `queued / paused / running / completed / failed / cancelled`. permission/elicitation aguardando o usuário em uma session comum mantêm o estado agregado `running`; os três estados terminais são irreversíveis |
| Fila off-peak                      | Off-Peak Queue                            | A ordenação autoritativa está no FIFO de tickets do servidor; o scheduler local tem uma fila de claim `queued+schedulable`; o prompt do usuário em uma session ocupada é uma terceira fila de mensagens, e os três não são um FIFO global único      |
| Pause / Continue                   | —                                         | Pause apenas interrompe a dispatch local e o ticket do servidor continua envelhecendo; no Continue, se o ticket ainda for válido ele é reutilizado, e em expired/not_found/sem ticket é retirado um novo                     |
| Retomada automática                | Continuation                              | Após messages retornar `400/3102`, um novo ticket é retirado para o mesmo `task_id`, preservando conversation/session, e o resume acontece com um prompt de continuation fixo                     |
| Provider exclusivo off-peak         | `account:{zai|bigmodel}-offpeak-idle-plan` | Fonte de modelos oculta em tempo de execução na Built-in Config, que não entra na seleção normal de modelos; cada turno automático fixa o modelo exato e injeta o material de acesso da requisição, sem reescrever o modelo residente da session |
| Modelo residente da session        | User workspace model                      | Na primeira dispatch, escolhe o `providerId/modelId` completo por `defaultModel → lastUsed → current` do workspace. A barra de modelos mostra ele, e não o idle provider; com múltiplos providers não se adivinha por ordem alfabética de provider |
| Mensagem enfileirada do usuário     | Busy queued prompt                        | Prompt reenviado pelo usuário enquanto um turno automático está ocupado. O terminal do turno restaura primeiro o modelo residente do usuário e só então faz o drain, portanto usa o provider do usuário        |
| Aprovação de permissão             | —                                         | Passa apenas pela cadeia existente de permission/elicitation da session; o agregado do Off-Peak permanece running. Aprovação ou recusa ocorrendo no mesmo turno automático ainda usa o idle provider, sem cartão dedicado de Review ou notificação duplicada      |
| Espera de capacidade               | `429/3105 + Retry-After`                  | Caso especial apenas para o idle provider: espera única de `min(Retry-After ou 60s, 5min)`, ciente de abort, com sondagem infinita e sem consumir o retry budget normal; a task local continua exibindo running        |
| Interruptor de rollout gradual     | `configs.offPeak`                         | A criação só é liberada com `enable_offpeak_task=true` e com o modelo do Built-in offpeak Provider não vazio; o remoto controla apenas a exposição e não hospeda fatos de modelo ou cota    |
| Cota de criação                    | Server take-number quota                  | O `take_number.limit/window` interno do servidor não é enviado ao cliente. O cliente não usa mais o `limit.max_tasks/sliding_window` do D36 nem a contagem local por createdAt                    |
| Baixa de estado terminal           | Settle                                    | Após o estado terminal, chama `POST /ticket/:ticket_id/settle` com o ticket atual. Falhas de rede/5xx são reenviadas por uma outbox local; 4xx é tratado como já sem ticket a liberar                                                      |
| Histórico                          | Execution summary                         | Uma task tem apenas 0/1 linha de histórico agregado, sem expansão por ticket/segmento de 3h; Delete history apenas escreve o tombstone `historyDeletedAt`                                                    |
| Manter acordado                   | `keepAwakeWhileRunning`                   | O nome é mantido, mas o comportamento final é uma configuração global: ligado, inicia `prevent-app-suspension`, independente do número de tasks ativas; não impede fechar a tampa ou o usuário dormir de propósito                             |
| ~~Guarda de saldo / saldo de computação~~ | —                                  | Removido: o cliente não tem lógica de saldo monetário e não exibe consumo/saldo restante                                                                                |
| ~~Espera estimada / Est.~~         | —                                         | Removido: o cartão mostra apenas a posição do servidor e não calcula ETA                                                                                                  |
| ~~Executar agora / Run now~~       | —                                         | Removido na v1; para assumir manualmente é preciso cancelar a tarefa automática e continuar em uma conversa comum                                                     |
| Criação dentro da session          | `OffPeakCreate` / `OffPeakList`          | Entrada na session restaurada por D49: família de ferramentas de agent em par com as irmãs Cron*, roteada por semântica. Create tem como padrão yolo/modelo da whitelist no último nível/maior nível de raciocínio (divergência deliberada em relação ao padrão do formulário); o turno automático off-peak nega Create e o turno automático cron permite (uso combinado); List é somente leitura e disponível em todos os cenários |
| Session vinculada                   | Bound session / `boundSessionId`          | D50: uma tarefa off-peak criada dentro de uma session é vinculada e executa na session que a criou (alinhado ao targetTaskId do CronCreate). A criação grava `session_id`, e o `conversation_id` é preenchido na primeira execução; se a sessão for detectada como ocupada antes da dispatch, há backoff transient sem alterar a configuração; Stop cancela. A criação pelo formulário ainda cria uma session independente |
| Cartão de cauda de turno           | Turn-tail card                            | Cartão estático de resultado renderizado após a conclusão da resposta, abaixo do corpo do assistente (o mesmo pipeline do CronCreateAutomationCard do cron). O cartão off-peak = ícone de lua + título + snapshot do ordinal no momento da criação + botão 「去到闲时任务」, sem assinar estados posteriores |

## Relação com as tarefas agendadas existentes (Automation)

| Dimensão   | Tarefa agendada Automation               | Tarefa off-peak                                                            |
| ---------- | ---------------------------------------- | --------------------------------------------------------------------------- |
| Gatilho    | expressão cron, periódica               | uso único; dispatch após o ticket do servidor ficar ready                   |
| Momento perdido | cron misfire pode ser skippado       | queued é mantido e continua esperando; não reaproveita o skip de cron misfire |
| Session    | cria uma session a cada execução        | um session no primeiro segmento; segmentos seguintes de ticket retomam a mesma session |
| Autoridade de fila | cron due time local             | FIFO de tickets do servidor; localmente apenas reivindica o snapshot ready   |
| Provider   | provider residente do usuário           | session reside no provider do usuário; turnos automáticos usam temporariamente o idle provider |
| Dados      | tabela/máquina de estados de automation | tabela `off_peak_tasks` independente, com tipos de mensagem e máquina de estados próprias |
| Multiplataforma | conforme os limites de Automation já existentes | celular `/remote` e workspace remoto do desktop ocultam a entrada de produto off-peak |

## Estado em dois eixos e linha do tempo

```text
Ticket do servidor: queued ──► ready ──primeiro messages──► active ──► expired/settled
                       │                                   │
                       └─ batch status grava schedulable    └─ 3102 dispara troca de ticket

Task do cliente:  queued ⇄ paused
                  │
                  └─ scheduler claim → sendPrompt ACK → running → completed/failed/cancelled
                                                      │
                                                      └─ 3102 → queued (mesma session)

permission / elicitation: session comum aguardando resposta do usuário; a task do cliente continua running.
```

## Invariantes e limitações atuais

- `workspaceKey = workspaceIdentity?.trim() || workspacePath` é usado para isolamento de identidade; arquivo/cwd continuam usando `workspacePath`.
- task, ticket e session são três ciclos de vida distintos: uma task pode trocar de ticket várias vezes, mas reutiliza apenas uma session.
- O estado terminal é irreversível; cancelar/falhar não reverte arquivos já escritos.
- O running local é gravado após o ACK de `sendPrompt`, podendo ser anterior ao active do servidor; a espera por 429/3105 não tem estado persistente próprio.
- `next_poll_at` é um snapshot do tempo sugerido pelo servidor; atualmente o `OffPeakTaskService` usa um timer compartilhado para sincronização em lote, e não um timer por task.
- `not_found` não é retomado automaticamente no background sync; o Continue do usuário verifica e retira um novo quando necessário.
- A aprovação de permissão não troca o provider do turno atual; a intenção histórica de D11/D27 foi explicitamente removida por D44.