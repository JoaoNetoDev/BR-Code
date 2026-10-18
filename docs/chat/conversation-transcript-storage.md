# Armazenamento do Transcript de Conversa

> **Status de implementação: já entregue.** `0014_message_part_sequence` / `0015_message_part_sequence_backfill_and_guard`
> já fornecem ordem estável, os contracts já declaram `MessageSemantics` / `TimelinePart` e a hydration V4 já consome timeline part.
> As fases 1–5 abaixo são preservadas como trilha de implementação e não representam mais trabalho pendente.

## Contexto

O modelo central do transcript de chat continua sendo:

```text
session -> message -> part
```

Essa linha principal não pode ser partida por `session_entry`, renderer store, text metadata ou uma tabela de timeline separada. A timeline é um fragmento estruturado dentro do fluxo de conteúdo do chat e, portanto, deve ser um tipo de `part`:

```text
message.parts[] includes { type: "timeline", ... }
```

Mas `timeline` não pode ser um JSON arbitrário. Ele precisa ser declarado por contracts e pelo schema do protocolo, e a escrita em runtime, a restauração por snapshot e a renderização na UI consomem todos apenas essa estrutura forte.

## Princípios de Design

| Princípio | Descrição |
| --------- | --------- |
| timeline é part | compact, fork, goal verification e model change são gravados como `part.type="timeline"`. |
| JSON não é um saco de reserva | os campos de timeline continuam no JSON `part.data`, mas são restritos por tipos TypeScript e pelo schema de protocolo Zod. |
| role e semântica de produto são separados | `message.role` indica apenas o role do provider; usuário real, model-only reminder, command e timeline são declarados por campos explícitos. |
| Ordem explícita | a ordem de renderização de message e part não pode depender da ordem lexicográfica de id. |
| Dados antigos legíveis | a nova versão precisa conseguir se recuperar de legacy compaction part, fork text metadata, goal session_entry e da semântica model_change que existia só no renderer. |

## Estrutura do Banco de Dados

As tabelas existentes `message` / `part` são mantidas, e os dados centrais continuam em JSON `data`.
Desta vez apenas se acrescentam os elementos necessários para a estabilidade de ordenação e consulta.

### message.sequence

```sql
alter table message add column sequence integer;

create index if not exists message_session_sequence_idx
  on message(session_id, sequence, time_created, id);
```

Semântica:

- `sequence` é a ordem de renderização estável das messages dentro de uma session.
- Ao gravar uma nova message, a atribuição ocorre dentro da transação como `max(sequence) + 1` daquela session.
- Ao atualizar a mesma message, a sequence original é preservada.
- No backfill de dados antigos, a ordem existente é fixada por `time_created, rowid`.
- Fallback do caminho de leitura: `sequence is null, sequence, time_created, rowid`.

### part.sequence

```sql
alter table part add column sequence integer;

create index if not exists part_message_sequence_idx
  on part(message_id, sequence, time_created, id);
create index if not exists part_session_sequence_idx
  on part(session_id, message_id, sequence);
```

Semântica:

- `sequence` é a ordem estável dos parts dentro de uma message.
- Ao gravar um novo part, a atribuição ocorre dentro da transação como `max(sequence) + 1` daquela message.
- Ao atualizar o mesmo part, a sequence original é preservada.
- No backfill de dados antigos, a ordem antiga é fixada por `message_id, time_created, rowid/id`.
- Fallback do caminho de leitura: `sequence is null, sequence, time_created, id`.

## Semântica de Message

`UserMessageInfo` e `AssistantMessageInfo` recebem um campo opcional `semantics`. Esse campo é gravado em
`message.data` e não em uma tabela extra; como ele descreve a própria message, não há necessidade de consulta entre messages.

```ts
interface MessageSemantics {
  origin: "real_user" | "agent_runtime" | "system" | "migration";
  kind:
    | "user_prompt"
    | "slash_command"
    | "system_reminder"
    | "background_notification"
    | "subagent_notification"
    | "todo_reminder"
    | "rewind_notice"
    | "fork_notice"
    | "timeline_event"
    | "compact_summary"
    | "assistant_response";
  source?: string;
  commandName?: string;
  uiVisibility: "visible" | "hidden" | "debug";
  providerVisibility: "visible" | "hidden";
  transcriptVisibility: "visible" | "hidden";
}
```

Durante o período de compatibilidade, os campos antigos continuam mantidos:

- `synthetic`
- `source`
- `visibility`
- `source` / `visibility` / `runtimeMessage` no metadata de text parts

Novas gravações precisam escrever `semantics` simultaneamente; os campos antigos servem apenas para fallback legacy e compatibilidade degradada.

Mapeamento principal:

| Dado                                | origin       | kind                  | uiVisibility | providerVisibility |
| ----------------------------------- | ------------ | --------------------- | ------------ | ------------------ |
| Entrada comum do usuário            | real_user    | user_prompt           | visible      | visible            |
| Comando visível `/goal xxx`         | real_user    | slash_command         | visible      | visible            |
| Operação `/compact`                 | real_user    | slash_command         | hidden       | hidden             |
| Continuação de goal                 | agent_runtime | system_reminder      | hidden       | visible            |
| Notificação de background task      | agent_runtime | background_notification | hidden     | visible            |
| Notificação de subagent             | agent_runtime | subagent_notification | hidden       | visible            |
| Todo reminder                       | agent_runtime | todo_reminder        | hidden       | visible            |
| Portador de timeline                | system       | timeline_event        | visible      | hidden             |
| Contexto de resumo de compactação   | agent_runtime | compact_summary      | hidden       | visible            |
| Corpo da resposta do assistant      | agent_runtime | assistant_response   | visible      | visible            |

## Timeline Part

Novo tipo `MessagePart`:

```ts
type TimelinePart =
  | ContextCompactionTimelinePart
  | GoalVerificationTimelinePart
  | SessionForkTimelinePart
  | ModelChangeTimelinePart;

interface TimelinePartBase {
  id: PartId;
  sessionID: SessionId;
  messageID: MessageId;
  type: "timeline";
  timelineType:
    | "context_compaction"
    | "goal_verification"
    | "session_fork"
    | "model_change";
  display: "separator" | "worklog";
  status?: string;
  anchorMessageId?: MessageId;
  anchorTurnId?: TurnId;
  time?: {
    start?: number;
    end?: number;
  };
}
```

### ContextCompactionTimelinePart

```ts
interface ContextCompactionTimelinePart extends TimelinePartBase {
  timelineType: "context_compaction";
  operationId: string;
  trigger: "manual" | "auto" | "reactive" | "partial" | "session_memory";
  phase?: "standalone_turn" | "pre_request" | "mid_turn" | "reactive";
  compactReason?: string;
  boundaryId?: string;
  summaryMessageId?: MessageId;
  preCompactTokenCount?: number;
  postCompactTokenCount?: number;
  truePostCompactTokenCount?: number;
  attempt?: number;
  maxAttempts?: number;
  reason?: string;
}
```

### GoalVerificationTimelinePart

```ts
interface GoalVerificationTimelinePart extends TimelinePartBase {
  timelineType: "goal_verification";
  targetId: string;
  verificationId: string;
  goalIteration?: number;
  verification?: {
    passed: boolean;
    reason: string;
    nextAction?: string | null;
  };
}
```

### SessionForkTimelinePart

```ts
interface SessionForkTimelinePart extends TimelinePartBase {
  timelineType: "session_fork";
  parentSessionId: SessionId;
  targetMessageId: MessageId;
  targetCheckpointId?: string;
  restoredFileCount?: number;
}
```

### ModelChangeTimelinePart

```ts
interface ModelChangeTimelinePart extends TimelinePartBase {
  timelineType: "model_change";
  fromModel?: {
    providerId: string;
    modelId: string;
    variant?: string;
    label?: string;
  };
  toModel: {
    providerId: string;
    modelId: string;
    variant?: string;
    label: string;
  };
}
```

## Regras de Escrita

Toda timeline precisa estar presa a uma message.

| Cenário         | message                                                            | part                          |
| --------------- | ------------------------------------------------------------------ | ----------------------------- |
| manual compact  | synthetic assistant carrier                                        | `timeline/context_compaction` |
| auto compact    | carrier assistant atual ou synthetic, conforme a semântica existente de worklog | `timeline/context_compaction` |
| fork notice     | synthetic user ou assistant carrier no fork child, preservando o fork notice antigo durante a compatibilidade | `timeline/session_fork` |
| goal verifier   | synthetic assistant carrier, ancorado no assistant verificado      | `timeline/goal_verification` |
| model change    | synthetic assistant carrier inserido antes do próximo accepted user input | `timeline/model_change`       |

Regras de atualização:

- started -> completed/failed/interrupted atualiza o mesmo timeline part.
- `part.id` é a identidade e `part.sequence` é a posição; a atualização não pode mudar a sequence.
- A mesma timeline semântica precisa de identidade estável:
  - compact: `operationId`
  - goal verification: `targetId + goalIteration` e, sem iteration, `verificationId`
  - fork: `parentSessionId + targetMessageId + targetCheckpointId`
  - model change: `task/session + createdAt + requestId`

## Estratégia de Compatibilidade

### Nova versão lendo dados antigos

Ao ler uma session, a nova versão faz canonicalization legacy:

1. Se a sequence de message/part estiver ausente, usa o fallback da ordem antiga e pode fazer backfill em background.
2. Se a semântica de message estiver ausente, a deriva dos campos antigos: `synthetic/source/visibility/part.metadata/runtimeMessage`.
3. O legacy compaction part continua sendo reconhecido e é projetado como `timeline/context_compaction`.
4. O legacy fork text metadata continua sendo reconhecido e é projetado como `timeline/session_fork`.
5. O legacy goal verifier `session_entry` continua sendo reconhecido e é projetado como `timeline/goal_verification`.
6. O legacy model change existia apenas na memória do renderer e não tem recuperação histórica.

O fallback legacy existe apenas no lado de leitura; as novas gravações precisam escrever parts `timeline`.

### Compatibilidade degradada

Se for necessário que o usuário faça upgrade antes de abrir com uma versão antiga sem quebrar, é preciso uma janela de compatibilidade:

- durante a compatibilidade, a compactação continua fazendo dual write do antigo part `compaction`;
- durante a compatibilidade, o fork continua fazendo dual write do metadata antigo de synthetic notice;
- durante a compatibilidade, o goal verifier continua escrevendo `session_entry`;
- uma versão antiga que não conhece `part.type="timeline"` pode não conseguir exibir toda a nova timeline; essa é uma perda de exibição na degradação e não deve afetar a leitura pela nova versão.

Se for exigido que versões antigas nunca encontrem unknown part type, é preciso primeiro publicar uma versão de transição em que a versão antiga tolere unknown parts, e só então começar a gravar parts `timeline`. Caso contrário, só é possível garantir que a nova versão lê dados antigos, e não uma degradação binária ilimitada.

## Fronteira Atual de Implementação: consolidar primeiro a CLI e a estrutura de dados

A primeira fase não muda o comportamento de renderização da UI. O objetivo é que os dados escritos pelo agent/CLI já estejam completos,
ordenados e recuperáveis, de modo que a UI depois apenas consuma um transcript estável.

Esta fase inclui:

1. migration do session-store, backfill de sequence e ordenação de leitura/escrita;
2. acréscimo de `timeline` part e do schema de message semantics em contracts e no zcode protocol;
3. gravação pelo runtime da CLI das timelines de compact, fork, goal verification e model change;
4. leitura e escrita de timeline part pelo snapshot/mapper de protocolo da CLI;
5. canonicalization de dados legacy no caminho de leitura da CLI/shared, garantindo que os dados antigos sejam legíveis.

Esta fase não inclui:

1. reescrever a projeção de timeline de `packages/ui`;
2. remover o fallback existente do renderer;
3. mudar a aparência atual da lista de chat e dos dividers;
4. forçar a remoção de legacy compaction part, fork text metadata ou goal `session_entry`.

Depois de concluída a primeira fase, a UI pode continuar renderizando pelo caminho antigo; mas o novo snapshot já carrega o
`part.type="timeline"` canônico, preparando o terreno para a segunda fase, em que a UI passa a consumir essa fonte.

## Caminho de Leitura

Construção do novo snapshot:

1. Lê `message` por `sequence`.
2. Lê `part` por `message_id, sequence`.
3. `mapMessagePart` reconhece `type="timeline"` e mapeia direto para o protocolo.
4. A primeira fase mantém o fallback atual da UI e não exige que a UI consuma timeline parts imediatamente.
5. Na segunda fase, a projeção da UI passa a gerar a render row priorizando timeline parts.

O fallback de legacy compaction/session_entry/text metadata é mantido até que a UI conclua a troca e seja verificada.

## Pontos de Código

| Camada                      | Arquivos                                                                                                                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| migration                   | `apps/zcode-cli/packages/adapters/src/storage/session-store/migrations.ts`                                                                                                                                                                                                           |
| rows/repositories            | `apps/zcode-cli/packages/adapters/src/storage/session-store/rows.ts`、`repositories/messages.ts`                                                                                                                                                                                     |
| contracts                   | `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts`                                                                                                                                                                                                           |
| escritas de runtime          | `apps/zcode-cli/packages/core/src/runtime/methods/message-persistence.ts`、`compact-persistence.ts`、`session-fork.ts`、`events.ts`、caminho de model set                                                                       |
| protocolo                   | `packages/shared/src/zcode-protocol/index.ts`、`apps/zcode-cli/packages/bootstrap/src/zcode-protocol/message-mapper.ts`                                                                                                                                                                 |
| compatibilidade de leitura shared | `packages/shared/src/zcode-session-visible-content.ts`、`packages/shared/src/zcodePersistedMessageMerge.ts`                                                                                                                                                                        |
| hydration de transcript V4  | `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/transcript-hydration.ts`、`product-projection.ts`                                                                                                                                                                           |
| projeção da UI              | `packages/ui/src/v4/conversationProjectionStore.ts`、`packages/ui/src/v4/sessionDataLayer.ts`                                                                                                                                                                                       |

## Trilha de Implementação da CLI / Camada de Dados

### Fase 1: ordenação estável, sem mudança de semântica de negócio

- Adicionar as migrations `message.sequence` e `part.sequence`.
- Fazer backfill da ordem dos dados antigos.
- Atribuir sequence ao gravar novas messages/parts nos repositories e preservar a sequence ao atualizar linhas existentes.
- Passar a leitura dos repositories a priorizar sequence, com fallback para a ordem antiga quando ausente.
- Adicionar testes unitários do session-store cobrindo a ordem estável de messages/parts no mesmo milissegundo.

### Fase 2: extensão do schema do transcript

- Adicionar os tipos `MessageSemantics` e `TimelinePart` nos contracts.
- Adicionar o schema `part.type="timeline"` no protocolo.
- Fazer o message mapper suportar o repasse de timeline part.
- Manter a compatibilidade do reader com campos legacy desconhecidos, evitando que dados antigos falhem por campos ausentes.

### Fase 3: helper unificado de escrita de timeline na CLI

- Adicionar um helper de escrita/upsert de timeline na camada de persistência do runtime.
- O helper é responsável por criar a synthetic carrier message, atribuir a identidade do part e definir a sequence.
- A transição started -> completed/failed/interrupted apenas atualiza data/status do mesmo timeline part.
- Todo payload de timeline é criado pelos tipos dos contracts, e não é permitido que caminhos de negócio escrevam JSON espalhado à mão.

### Fase 4: migração das escritas de negócio centrais

- compact: grava `timeline/context_compaction` e, durante a compatibilidade, continua gravando o part antigo `compaction`.
- fork: a sessão fork child grava `timeline/session_fork` e, durante a compatibilidade, continua gravando o metadata antigo de fork notice.
- goal verification: grava/atualiza `timeline/goal_verification` e, durante a compatibilidade, continua gravando `session_entry`.
- model change: registra primeiro um model change pendente e grava `timeline/model_change` antes do próximo accepted user input; se o usuário apenas troca e não envia, o transcript não é poluído.
- synthetic system reminder / command: grava `message.semantics` e, durante a compatibilidade, mantém os campos antigos `synthetic/source/visibility`.

### Fase 5: snapshot da CLI e verificação de recuperação

- A saída do snapshot de session produz timeline parts canônicos.
- A recuperação de compact reconhece ao mesmo tempo o novo timeline part e o legacy compaction part.
- A goal verification em cold start prioriza a recuperação do timeline part e faz fallback para `session_entry` quando ausente.
- Confirmar que desktop continuous e web remote replayable recuperam do mesmo snapshot de session, sem afundar o estado de timeline de negócio em relay/main.

### Fase 6: preparação da troca de UI da segunda fase

- Depois da fase CLI/dados, a troca da projeção de UI é feita separadamente.
- Na troca, muda-se apenas a fonte consumida: timeline part primeiro, com o fallback legacy como rede de segurança.
- A remoção das escritas legacy exige a abertura de outra janela de compatibilidade para ser decidida.

## Requisitos de Teste

É preciso cobrir:

- DB antigo sem sequence: a ordem após a inicialização não muda;
- dados antigos com messages no mesmo milissegundo: sequence/fallback fixa a antiga ordem de `rowid`;
- dados antigos com parts no mesmo milissegundo: a ordem dos parts é estável;
- legacy compact part: reconhecível pelo caminho de leitura da CLI/shared, sem quebrar o snapshot;
- legacy fork notice: reconhecível pelo caminho de leitura da CLI/shared, sem quebrar o snapshot;
- legacy goal verifier session_entry: reconhecível pelo caminho de leitura da CLI/shared, sem quebrar o snapshot;
- novas escritas compact/fork/goal/model timeline: todas aparecem no snapshot como `part.type="timeline"`;
- desktop continuous e web remote replayable recuperam apenas do snapshot de agent/session, sem afundar o estado de timeline em relay/main.

## Questões em Aberto

- Se é necessária compatibilidade de degradação binária completa. Se for, é preciso primeiro fazer a versão antiga tolerar unknown part type.
- Se o momento de gravação do model change fica fixo em «antes do próximo accepted user input». Se mudar para «gravar assim que a troca tiver sucesso», isso poluiria o histórico da timeline com simples trocas de teste de modelo.
- Se a classificação worklog/boundary da compactação afeta apenas a projeção da UI ou também precisa ser persistida. O design atual persiste `display`, evitando que a UI deduza por conta própria.