# Trace de Execução do CLI Agent: cadeia, schema e interface de instrumentação

> Status: design V2 histórico, usado apenas para rastreabilidade; a implementação atual e as
> restrições de desenvolvimento seguem a
> [Especificação Final de Telemetria do CLI Agent](../cli-agent-telemetry.md).
>
> Este documento é a especificação principal v2 da observabilidade do CLI Agent. O
> [Observabilidade de API de Modelo](./model-api-observability-v1.md) já existente segue
> rodando como v1; `Model Call` / `Model Attempt` não são descontinuados, e sim tornam-se
> nós filhos do novo Trace de execução.

## 1. Resumo da revisão

O código de negócio declara apenas:

1. O que está sendo feito, por exemplo `context.compaction`.
2. Com que semântica de negócio termina, por exemplo um Step sendo descartado na recuperação.

O código de negócio não preenche:

```text
uid / device / app version
sessionId / queryId / turnId / stepIndex / parentSpanId
provider / baseURL / model / transport / thinking
token / cache / retry / duration
error code / error message / HTTP status
```

Essas informações são produzidas automaticamente pelo Scope, pelo Adapter, pelo Recorder e pelo Error Sanitizer.

```text
AgentTelemetryRuntime
├── Scope：Turn / Step / Tool / Compaction / Detached Operation
├── Model Recorder：Logical Call / Physical Attempt
├── Schema Registry：Operation / Outcome / Error / 专属字段
├── AsyncLocalStorage：进程内父子上下文
└── OTel Backend：BatchSpanProcessor -> OTLP -> ARMS
```

Decisões-chave:

- Um Turn real de Agent é um Trace; a Session não vira um Trace longo.
- Step, Tool e Compaction são Spans dentro do Turn.
- Subagent, Sidecar assíncrono e entradas de modelo fora do Turn viram Traces independentes, relacionados por Link.
- Não se oferece um `track(name, properties)` arbitrário.
- OTel Span, ARMS SDK e Parent ID não entram na interface de negócio.
- Não se cria Span por Chunk, Delta, Token ou Tool Progress.

### 1.1 Estado atual da implementação

Concluído:

- `Turn -> Step -> Tool/Compaction -> Model Call -> Model Attempt` usa relações reais de Parent/Child do OTel.
- Títulos de Session/Goal, verificação de conclusão de Goal e Workspace Generate Text usam Root independente;
  Turnos Child de Subagent/Workflow usam o Link capturado no Spawn. Uma Detached Operation iniciada dentro de um Scope
  ativo também carrega Link; o Link histórico entre Turns aguarda o Link Cache da P1.
- O App pode injetar `TelemetryRuntime`/`AgentExecutionTelemetryPort`; a CLI Standalone cria ela mesma um
  `TracerProvider + BatchSpanProcessor` quando existem variáveis de ambiente OTLP.
- Session, Turn, Query, Actor, Step Index, Provider, Model, Thinking, Token, Cache,
  Retry, duração e erro são preenchidos automaticamente pelo Facade, pelo Adapter e pelo Recorder.
- O Record do Model v1 continua preservado e entra no Trace de execução v2 pelo Parent real do OTel; o Usage
  Observability em SQLite não muda.
- A mensagem de erro é uniformemente anonimizada e truncada; error code, code/message do Provider, HTTP status,
  error phase e fingerprint continuam entrando no Model Span.
- Active Span, Active Turn e Record Queue têm todos limites rígidos; o Active Span tem TTL de 30 minutos sem
  atividade, cada Turn mantém no máximo 200 Spans de detalhe de Step/Tool/Compaction, e o estouro é resumido apenas na Root.
- O Model Call captura o Scope pai ao iniciar; mesmo que o terminal saia do contexto ALS original, ele grava com precisão
  nos resumos de Turn/Step/Tool ainda ativos, sem registrar por engano em outra chamada concorrente.
- Quando chega um novo Sub Scope ou uma causalidade explícita, é preciso primeiro atualizar o tempo de atividade dos
  ancestrais atuais e só então limpar os demais Spans expirados por TTL; retomar a execução após pausas longas como
  espera de permissão não pode fechar incorretamente um Turn ainda ativo como `abandoned`.
- Falha na exportação é um desvio lateral e não afeta o Agent.

Não concluído nesta rodada:

- Dashboards do ARMS, regras de alerta e política de amostragem de produção.
- Link Cache de 30 minutos e as linhas de base de CPU, RSS e bytes de rede para enabled/disabled.
- Entradas de modelo fora da CLI como Repo Wiki e teste de conectividade de modelo.
- O Bash em background representa hoje no Tool Span apenas "iniciou com sucesso a tarefa de background"; a duração
  final／o status de saída do processo de background ainda está nos eventos `BackgroundTask*` e ainda não forma um Span
  Linked independente. Ao olhar a taxa de sucesso de tarefas de background, não se pode tratar
  `commandStatus=backgrounded` como sucesso final.
- As requisições de modelo dentro das ferramentas `ReadSessionContext` e `WebFetch` já entram no Trace do ARMS, mas
  ainda não são gravadas no `model_usage` local; portanto o SQLite local atual não serve como livro-razão completo de
  conciliação dessas duas classes de chamada.
- O RUM／SQLite local histórico ainda possui caminhos de.report de corpo de erro incorreto ou de gravação em disco;
  esta rodada só garante que o novo Trace do CLI Agent não copia o erro bruto da Tool e não alterou o contrato de
  retenção e compatibilidade das链路 antigas. Classificação de erro, política de anonimização, tamanho e ciclo de
  retenção devem ser unificados em separado.

### 1.2 Endurecimento de integridade e privacidade de 2026-07-27

Após esta revisão, a cadeia de execução dentro da CLI passa a ser entendida pela árvore abaixo. O Tool Span registra a
"execução do framework da ferramenta", e o status do subprocesso Bash é um campo exclusivo da Tool; os dois não podem ser
confundidos em uma única taxa de sucesso:

```text
Agent Turn
├── Agent Step
│   ├── Model Call
│   │   └── Model Attempt 1..N
│   └── Tool
│       ├── 工具框架结果：completed / failed / denied / cancelled / abandoned
│       ├── 工具性能：permission / command / filesystem / serialization
│       ├── Bash 命令结果：completed / failed / timed_out / cancelled /
│       │                  spawn_error / backgrounded
│       └── Tool 内 Model Call（WebSearch / WebFetch / ReadSessionContext）
├── Context Compaction
│   └── Model Call -> Model Attempt 1..N
└── Turn 汇总：step / model / tool / compaction / token / cache / retry

Detached Operation（标题、Goal 校验、Workspace Generate）
└── 独立 Root -- Link --> 触发它的 Turn/Tool
```

Fronteiras que esta rodada precisa preservar:

- Todas as ferramentas registradas são contadas, cronometradas e têm seu resultado de framework medidos pelo nome
  canônico de tool do Registry; nomes de tool não registrados ou não resolvíveis vão todos para o balde `unknown`,
  evitando que nomes arbitrários gerados pelo modelo formem alta cardinalidade ou carreguem conteúdo do usuário.
- O Bash adicionalmente contabiliza nome de executável seguro, categoria do comando, quantidade de comandos, status do
  subprocesso, código de saída e duração.
- O nome de executável do Bash só pode vir do Registry interno de comandos públicos; scripts customizados, expressões
  dinâmicas e comandos desconhecidos vão todos para `other`, e comandos compostos vão para `compound`.
- O ARMS nunca recebe o comando Bash bruto, argumentos, diretório de trabalho, stdout/stderr, Tool Input/Output nem
  `commandHash`. `commandHash` é um campo de diagnóstico local já existente e não é uma dimensão remota.
- O texto de erro bruto da Tool não é enviado ao ARMS por padrão; envia-se apenas o tipo de erro estável, o código de
  erro, a fase e o fingerprint anonimizado. Erros de API de modelo podem enviar a message centralmente anonimizada,
  convertida em linha única e truncada, facilitando a resolução de problemas do Provider.
- O `tool_usage.error_message` já existente no SQLite local é uma capacidade histórica; esta rodada não adiciona nem
  amplia a gravação do erro bruto, e o desenho separado de tamanho de retenção local, anonimização e estratégia de
  migração fica para depois.
- Trace, RUM e o Usage Store local são desvios laterais: falha na exportação ou na gravação gera apenas um warning
  controlado e não pode interromper a persistência do Tool Result, a continuação do modelo ou a cadeia principal do Turn.
- O resumo do Turn precisa distinguir falha／cancelamento de modelo e falha／recusa／cancelamento de ferramenta, e não
  pode contar apenas o total de chamadas.
- Quando o Model Recorder encontra encerramento de processo, TTL de 30 minutos de idle ou despejo da capacidade de
  active-call, ele precisa fechar explicitamente como `abandoned` os Logical Call／Physical Attempt ainda sem terminal,
  registrando `terminal_missing=true` e um motivo controlado; isso indica ciclo de vida de observação incompleto e não
  entra na taxa de erro do Provider.
- O shutdown da Telemetry Standalone precisa fechar na ordem `Model -> Tool/Step/Turn -> Queue -> Exporter`; os Agent
  Spans ainda ativos são marcados `abandoned` do mais profundo para o mais raso, evitando deixar Model Spans órfãos na
  saída. `abandoned` é um estado de integridade de observação; o Status do OTel permanece `UNSET`, é contabilizado
  separadamente e não polui a taxa de falha de negócio.
- Todos os Attributes de string têm um limite de tamanho uniforme na saída, evitando que objetos excepcionais ou nomes
  de Provider／Model／Tool definidos pelo usuário infl um único Span.
- O `ZCODE_TELEMETRY_USER_SUBJECT_ID` injetado pelo host só pode ser usado como `user_subject_id` quando atende às
  restrições de ID controlado; a variável antiga `ZCODE_TELEMETRY_USER_ID_HASH` foi descontinuada e é removida no limite
  de ambiente de subprocesso. O Desktop Host atual gera um pseudônimo estável com SHA-256; ele é uma chave de
  correlação, não uma promessa de anonimização. `deviceMid` também só aceita identificadores limitados, sem espaços em
  branco e sem separadores de caminho; quando inválido, degrada para ausência de correlação de dispositivo.
- Além de limpar URL, Header, e-mail, IP e caminhos locais, o texto de erro também precisa reconhecer prefixos comuns de
  credencial em texto puro e o formato de LicenseKey do ARMS; um texto de erro original cuja segurança não possa ser
  provada não deve entrar no Tool Span.
- A entrada de resolução da Base URL do Provider, a route já limpa e o cache LRU precisam ter limites rígidos;
  userinfo／query／fragment de URL nunca entram no Trace. Atributos numéricos aceitam apenas valores finitos, evitando
  que uma resposta anômala de um único Provider derrube todo o batch OTLP.

O princípio de desempenho é reaproveitar o metadata `perf` não enumerável que a ferramenta já produz: o wrapper de Trace
apenas lê um objeto pequeno e mapeia campos fixos, sem rescanning do Output, sem copiar comandos e saídas e sem fazer
Flush na thread de chamada. O nome seguro do comando Bash é resolvido uma única vez na fase de atribuição de desempenho
já existente; comandos com mais de 8 KiB não entram no parser e são degradados diretamente para `other`, omitindo o
`commandCount` que não pode ser calculado com segurança; falha de parsing ou comando dinâmico também degruda para
buckets de baixa cardinalidade.

## 2. Escopo da cadeia de LLM

### 2.1 Cadeias dentro da CLI

| Entrada                           | Escopo               | v2 Operation                           | Parent de Model Call |
| --------------------------------- | -------------------- | -------------------------------------- | -------------------- |
| Step de modelo Main/Subagent/Workflow | Respectivo Turn   | `agent.step`                           | Step                 |
| Compact automático／manual／reativo | Turn                 | `context.compaction`                   | Compaction           |
| WebSearch                          | Tool                 | `tool.web_search`                      | Tool                 |
| Processamento de conteúdo de WebFetch | Tool              | `tool.web_fetch.process`               | Tool                 |
| Extração de ReadSessionContext     | Tool                 | `tool.read_session_context.extract`    | Tool                 |
| Sumarização de ReadSessionContext  | Tool                 | `tool.read_session_context.synthesize` | Tool                 |
| Título de Session                  | Sidecar assíncrono   | `session.title_generation`             | Root + Link          |
| Título de Goal                     | Sidecar assíncrono   | `goal.title_generation`                | Root + Link          |
| Verificação de conclusão de Goal  | Operação bloqueante antes do Turn | `goal.completion_verification` | Root + Link          |
| Git Commit Message                | Operação de Workspace | `workspace.git_commit_message`         | Root                 |
| `workspace/generateText`          | Operação de Workspace | Mapeamento de Purpose controlado       | Root                 |

`workspace/generateText` é uma entrada de protocolo explicitamente fora do Turn. Ele deve migrar de qualquer
`querySource` para um `purpose` controlado, e a CLI mapeia a Operation.

Todas as chamadas de modelo de produção da CLI passam finalmente por `AiSdkModelAdapter`. Prioridade de classificação:

```text
显式 Operation
  -> 当前 Scope 默认 Operation
  -> legacy querySource Registry
  -> other + unclassified health counter
```

Portanto uma chamada sem classificação não desaparece, mas `other` precisa ser alertável.

### 2.2 Lacunas conhecidas fora da CLI

| Fluxo              | Fato atual                                  | Decisão                                      |
| ------------------ | ------------------------------------------- | -------------------------------------------- |
| Repo Wiki          | `packages/services` requisita o Provider diretamente | Migrar na P1 para o CLI ModelPort ou o mesmo Port |
| Teste de conectividade de modelo | O Host emite uma requisição real pequena    | `admin.model_probe` independente, fora do SLO do Agent |
| `stream-animate`   | Pacote experimental separado                | Não pertence ao Trace de produção do ZCode Agent |

O critério de conclusão da P0 é "todo o tráfego de LLM do CLI Agent", e não "todo o tráfego de LLM do produto".

## 3. Topologia do Trace

### 3.1 Árvore principal do Turn

```text
invoke_agent zcode                         Root / INTERNAL
├── zcode.agent.step                       Step 0 / INTERNAL
│   ├── zcode.model.call                   Logical Call / INTERNAL
│   │   ├── chat <model>                   Attempt 1 / CLIENT / error
│   │   └── chat <model>                   Attempt 2 / CLIENT / ok
│   ├── execute_tool Read                  Tool / INTERNAL
│   └── execute_tool WebFetch              Tool / INTERNAL
│       └── zcode.model.call
│           └── chat <model>
├── zcode.context.compaction               INTERNAL
│   ├── zcode.model.call                   SSE Call / error
│   │   └── chat <model>
│   └── zcode.model.call                   HTTP Fallback / ok
│       └── chat <model>
└── zcode.agent.step                       Step 1
```

- O Turn usa a semântica GenAI `invoke_agent`.
- A Tool usa a semântica `execute_tool`.
- Somente o Physical Attempt é um Span remoto `CLIENT`.
- O Logical Call agrega o Retry do SDK e portanto é `INTERNAL`.
- `zcode.span.type` é um campo de consulta estável, e o dashboard não precisa interpretar o nome do Span.

### 3.2 Fronteiras de autoridade

```text
command accepted
      |
      | queueWaitMs 只是属性
      v
active turn reserved + turnId allocated
      |
      +--> START Turn
      |      ├── context init / hooks
      |      ├── compaction
      |      └── step 0..N
      |
      +--> TurnComplete / TurnError / cancel
             |
             v
           END Turn
```

O Turn precisa cobrir falhas de inicialização antes da primeira requisição de modelo.

O Step começa após a alocação de `assistantMessageId` e vai até as decisões de modelo, ferramenta e recuperação:

```text
	START Step
  -> Model Call
  -> zero or more sibling Tools
  -> completed / discarded / cancelled / failed
```

`stepId = assistantMessageId`. O `stepIndex` é distribuído estritamente em ordem crescente pelo Scope do Turn, e é
proibido derivá-lo de `iteration`, da contagem de ferramentas ou de logs.

### 3.3 Política de Parent

| Nó novo             | Parent                                               |
| ------------------ | ---------------------------------------------------- |
| Step               | Turn mais próximo                                     |
| Tool               | Step mais próximo; quando ausente, volta ao Turn e marca degraded |
| Compaction         | Turn mais próximo, pulando Step／Tool ativamente     |
| Model Call         | Tool > Detached Operation > Compaction > Step > Turn |
| Attempt            | O Logical Call que o criou                            |
| Detached Operation | Root, apenas com Link explícito                      |
| Child Turn         | Root, apenas com o Link capturado no Spawn            |

Uma Compaction reativa, mesmo disparada na pilha de erros do Step, é pendurada no Turn. A causalidade é expressa por
`triggeringStepIndex` / `recoveredFromLogicalCallId`, e não por um Parent de erro.

### 3.4 Link

```text
Parent Turn
└── execute_tool Agent
      +---- Link ----> Child Agent Turn

Parent Turn
      +---- Link ----> Session Title

Previous Turn
      +---- Link ----> Goal Verification
                            +---- Link ----> Continuation Turn
```

Motivos:

- Um Child em Background pode terminar depois do fim do Parent Turn.
- O título é fire-and-forget.
- A Goal Verification acontece antes do Turn seguinte.
- Child Foreground／Background usam a mesma topologia, evitando deriva de estrutura.

O Link é fornecido quando o Span de destino é criado. Entre Runtimes só se transmite um `TelemetryLink` imutável e
serializável, nunca um Active Scope ou Span Handle.

## 4. Schema

### 4.1 Local único e estratificação

```text
apps/zcode-cli/packages/contracts/src/telemetry/
├── agent-execution.ts     v2 Operation、Context、Link、各 Scope 与窄 Port
└── index.ts               既有 v1 Model Call/Attempt 与统一导出入口
```

`@zcode/telemetry` contém apenas Scope, Recorder, mapeamento OTel e implementação do Exporter.
Core／Adapter dependem apenas de Contracts e não importam OTel nem ARMS.

Atualmente o schema v2 é agregado dentro de `agent-execution.ts`, para evitar arquivos pequenos que se referenciam
mutuamente apenas por causa da forma do diretório; quando o Model v1 migrar para a nomenclatura v2, a divisão será
mecânica em `common/operations/model-api/ports`, mas a entrada unificada externa continuará sendo
`@zcode/contracts/telemetry`.

O Schema usa quatro camadas combinadas, em vez de uma interface gigante cheia de campos Optional:

```text
Resource Context
      -> Execution Context
            -> Span Record Base
                  -> Turn / Step / Tool / Compaction / Operation
                  -> Model Call / Attempt
```

```ts
interface TelemetryResourceContext {
  serviceName: string;
  serviceVersion?: string;
  deploymentEnvironment?: string;
  runtimeSurface: RuntimeSurface;
  identity: {
    state: "authenticated" | "anonymous" | "unavailable";
    userIdHash?: string;
    deviceMid?: string;
  };
}

interface ExecutionContextSnapshot {
  executionTraceId?: string; // 现有 CLI/日志 ID，不是 OTel TraceId
  queryId?: string;
  sessionId?: string;
  parentSessionId?: string;
  turnId?: string;
  stepId?: string;
  toolCallId?: string;
  actor: { kind: ActorKind; agentName?: string };
}

interface TelemetrySpanRecordBase<TType, TOutcome> {
  schemaVersion: "2";
  recordId: string;
  type: TType;
  context: ExecutionContextSnapshot;
  operation: OperationName;
  timing: {
    startedAt: string;
    endedAt: string;
    durationMs: number;
  };
  outcome: TOutcome;
  error?: SanitizedTelemetryError;
}
```

O Resource é injetado pelo Backend como OTel Resource e não é exigido que o negócio o construa a cada vez.

### 4.2 Propriedade dos campos

| Campo                      | Produtor                               | Comportamento de negócio |
| ------------------------- | -------------------------------------- | ----------------------- |
| Operation                  | Registry / intenção de chamada          | Escolher constante      |
| Actor                      | Scope                                  | Não preencher           |
| Session/Turn/Step/Tool ID | Scope lendo os objetos de domínio      | Não preencher           |
| OTel Trace/Span/Parent    | Backend                                | Invisível               |
| `stepIndex`               | Contador do Scope do Turn              | Não preencher           |
| Provider/Model/Endpoint   | Resultado final de resolução do Adapter | Não preencher          |
| Thinking                   | Model Catalog + Provider Options finais | Não preencher          |
| Token/Cache/Finish        | Normalization do Adapter               | Não preencher           |
| Retry/Transport/TTFT      | Model Runner                           | Não preencher           |
| Duration                   | Scope／Recorder                        | Não preencher           |
| Outcome                    | Fronteira de ciclo de vida autoritativa | Escolher terminal legal |
| Error                      | Normalizer／Sanitizer                  | Passar apenas `unknown` bruto |
| Resumo de Child           | Scope Registry                         | Não preencher           |

Qualquer API que obrigue o negócio a preencher `modelId`, `turnId` ou `durationMs` é considerada falha de design.

Regras de herança:

| Camada                    | Escopo da herança                     | Regra de sobrescrita                                              |
| ------------------------- | ------------------------------------- | ----------------------------------------------------------------- |
| Resource                  | Todos os Spans no processo           | Apenas o Bootstrap pode definir; o negócio não sobrescreve        |
| Turn Execution Context    | Step, Tool, Compaction, Model         | Snapshot do `TraceContext` atual da CLI, sem escrita reversa     |
| Step/Tool Identity        | Seus próprios filhos                  | O Facade extrai dos objetos de domínio; chamadas mais internas não reescrevem |
| Actor                     | Toda a árvore do Turn de Agent atual  | Um Agent Child cria seu próprio Actor e não herda o Actor do pai  |
| Operation                 | Model Call dentro do Scope atual      | Uma Intent controlada explícita pode sobrescrever; não é herdada entre Detached／Child Turn |
| Provider/Model/Thinking   | Model Call／Attempt atual             | Sempre o valor final real do Adapter; nunca herdado do Span pai   |
| Error/Outcome             | Nó atual                              | Um Error de Child não reescreve automaticamente o Outcome do pai  |

### 4.3 Operation, Execution Kind e Actor separados

O uso de negócio e o uso padrão do OTel ficam separados:

- `zcode.operation.name`: usos de negócio do ZCode como `context.compaction`.
- `gen_ai.operation.name`: `invoke_agent`, `execute_tool`, `chat`.
- `zcode.execution.kind`: `turn|step|tool|sidecar|standalone_blocking|standalone`.
- `zcode.actor.kind`: `main_agent|subagent|workflow_child|system|tool`.

Operation v2:

```ts
export const Operation = {
  AgentStep: "agent.step",
  ContextCompaction: "context.compaction",
  SessionTitleGeneration: "session.title_generation",
  GoalTitleGeneration: "goal.title_generation",
  GoalCompletionVerification: "goal.completion_verification",
  WorkspaceGitCommitMessage: "workspace.git_commit_message",
  ToolWebSearch: "tool.web_search",
  ToolWebFetchProcess: "tool.web_fetch.process",
  ToolReadSessionContextExtract: "tool.read_session_context.extract",
  ToolReadSessionContextSynthesize: "tool.read_session_context.synthesize",
  WorkspaceGenerateText: "workspace.generate_text",
  Other: "other",
} as const;
```

Migração dos nomes antigos:

| v1                           | v2                             |
| ---------------------------- | ------------------------------ |
| `sidecar.session_title`      | `session.title_generation`     |
| `sidecar.goal_title`         | `goal.title_generation`        |
| `sidecar.goal_verification`  | `goal.completion_verification` |
| `sidecar.git_commit_message` | `workspace.git_commit_message` |
| `tool.web_fetch`             | `tool.web_fetch.process`       |

O Exporter pode escrever em dual o antigo `zcode.operation` durante a janela de compatibilidade; o negócio usa apenas v2.

### 4.4 Campos exclusivos de Operation

É proibido usar um Map arbitrário de `attributes`; usa-se um Map genérico:

```ts
interface OperationDetailMap {
  "agent.step": Record<string, never>;
  "context.compaction": {
    trigger: "manual" | "auto" | "partial" | "reactive" | "session_memory";
    phase: "standalone_turn" | "pre_request" | "mid_turn" | "reactive";
    outerAttempt: number;
    maxAttempts: number;
    triggeringStepIndex?: number;
    recoveredFromLogicalCallId?: string;
  };
  "session.title_generation": {
    trigger: "first_user_input" | "external_input";
  };
  "goal.title_generation": {
    targetId: string;
  };
  "goal.completion_verification": {
    targetId: string;
    goalIteration: number;
  };
  "workspace.git_commit_message": Record<string, never>;
  "workspace.generate_text": Record<string, never>;
  "tool.web_search": Record<string, never>;
  "tool.web_fetch.process": Record<string, never>;
  "tool.read_session_context.extract": {
    chunkIndex?: number;
  };
  "tool.read_session_context.synthesize": {
    chunkCount?: number;
  };
  other: {
    legacyQuerySource?: string;
  };
}
```

```ts
startOperation<O extends OperationName>(
  operation: O,
  details: OperationDetailMap[O],
): OperationScope<O>;
```

Assim a Compaction não pode escrever campos de Goal por engano, e nome de modelo dinâmico, código de erro e número de
Attempt também não podem entrar na Operation.

### 4.5 Outcome e Error

Nós diferentes têm estados terminais legais diferentes:

```ts
type TurnOutcome = "success" | "failed" | "cancelled" | "abandoned";
type StepOutcome = "completed" | "discarded" | "failed" | "cancelled" | "abandoned";
type ToolOutcome = "completed" | "failed" | "denied" | "cancelled" | "abandoned";
type CompactionOutcome = "completed" | "failed" | "cancelled" | "abandoned";
type ModelOutcome = "completed" | "error" | "cancelled" | "abandoned";
type CancellationReason = "user" | "abort_signal" | "timeout" | "shutdown" | "superseded";
```

Mapeamento:

| Outcome                              | OTel Status |
| ------------------------------------ | ----------- |
| `success` / `completed`              | `OK`        |
| `failed` / `error` / `discarded`     | `ERROR`     |
| `cancelled` / `denied` / `abandoned` | `UNSET`     |

Um Error de Child não contamina automaticamente o Turn; o Turn só segue o terminal autoritativo do Turn.

```ts
interface SanitizedTelemetryError<TPhase extends string = string> {
  code?: string; // ZCode 稳定低基数码
  type: string; // Exception/归一类型
  message?: string; // 脱敏、截断后的运维信息
  phase?: TPhase;
  retryable?: boolean;
  fingerprint?: string;
}
```

A Phase é estreitada por nó e inclui uniformemente `unhandled` como fallback de wrapper, por exemplo:

```text
Turn：context_init | hook | compaction | step | finalize | unhandled
Tool：lookup | validation | hook | permission | execute | serialize | unhandled
Model：prepare | connect | response | stream | parse | postprocess | unhandled
```

O Model traz ainda um `providerError` separado: code/message do Provider, HTTP status, request ID e retry-after.
O chamador passa apenas o `unknown` bruto; o Sanitizer central remove credenciais, Header, query de URL e caminhos
óbvios e limita o tamanho. Por padrão não se reportam Stack, Prompt, Response nem Tool Input/Output.

### 4.6 Campos por nó

Turn:

```text
P0：number / inputSource / resultType
stepCount / modelCallCount / modelAttemptCount / toolCallCount
modelErrorCount / modelCancelledCount
toolErrorCount / toolDeniedCount / toolCancelledCount
compactionCount / retryRecoveredCount
inputTokens / outputTokens / reasoningTokens / cacheReadTokens / cacheWriteTokens

P1：queueWaitMs / primaryProvider / primaryModel / primaryThoughtLevel /
overflowChildCount
```

O resumo da Root acumula automaticamente a partir dos filhos. `primaryModel` usa apenas o modelo real do primeiro
`agent.step`; Tool／Compaction／Sidecar não sobrescrevem.

Step:

```text
P0：stepId / stepIndex / terminalReason
modelCallCount / modelAttemptCount / toolCallCount / toolErrorCount / token totals

P1：finishReason / outputBytes
```

Tool:

```text
公共：callId / name / outcome / outputBytes / outputTruncated
      totalMs / permissionWaitMs
Command detail：runMs / firstOutputMs / noOutputMs / exitCode / timedOut
                outputBytes / commandName / commandCategory / commandCount / status
Filesystem detail：readMs / writeMs / fileCount / totalBytes / maxFileBytes / workspaceKind
Patch detail：matchMs / hunkCount / matchAttempts，并组合 Filesystem detail
P1：permissionDecision
```

O tipo de domínio usa "campos comuns de ciclo de vida + detail discriminado", e continua proibido usar uma bolsa de
desempenho achatada em que todos os campos são optional:

```text
ToolExecutionTelemetry
  ├─ totalMs / permissionWaitMs
  └─ detail（可选；无专属事实的 Tool 不填写）
      ├─ command { command }
      ├─ filesystem { filesystem }
      └─ patch { filesystem, patch }
```

`exitCode` pertence apenas ao detail de Command; ferramentas de não comando como Read e Write não conseguem preencher
um código de saída no nível de tipo. Remotamente só se mantém `zcode.tool.command.exit_code`, e não se emite mais o
`zcode.tool.exit_code` genérico.

`Tool outcome` e `Command status` são dois conjuntos de semântica distintos. Quando o handler da Tool retorna
normalmente um `BashOutput` estruturado, o outcome da Tool é `completed`; mesmo que o código de saída do Bash seja
diferente de zero, o Command status continuará sendo `failed`. Portanto:

- A confiabilidade do framework de ferramentas é medida por `zcode.outcome`.
- A confiabilidade do subprocesso Bash é medida por `zcode.tool.command.status`.
- O denominador da distribuição de códigos de saída do Bash inclui apenas chamadas cujo `command.exitCode` é conhecido.
- Não se pode reescrever uma saída não zero como Tool Span Error só para fazer os dois gráficos de taxa de sucesso coincidirem.

Model Call e Attempt:

```text
Call = 一次 generateText/streamText，可含多个 Adapter Retry
Attempt = 一次真实 Provider HTTP/SSE 请求
```

Exclusivo de Call:

```text
logicalCallId / callCause / previousLogicalCallId
attemptCount / hadError / recoveredAfterRetry
```

Exclusivo de Attempt:

```text
requestId / providerRequestId / attemptNumber / maxAttempts
attemptCause / previousRequestId / retryDelayMs / retryAfterMs
TTFT / streamIdle / streamStall
```

Cada Call／Attempt reaproveita ainda os fatos de modelo já estáveis na v1:

```text
providerId / providerKind
providerOrigin / providerRoute / providerEndpointFingerprint
requestedModel / responseModel / reasoning
transport / streaming
inputTokens / outputTokens / reasoningTokens
cacheReadTokens / cacheWriteTokens / cacheObservation
```

`reasoning` é uma estrutura estrita: `capability / state / controlType / requestedLevel /
effectiveLevel / effectiveBudgetTokens`. O Schema comum não usa a nomenclatura nativa de `thinking` do fornecedor; o
Adapter é responsável por resolver a partir das Provider Options finais.

`providerId` identifica a instância de Provider configurada pelo usuário e `providerKind` identifica o tipo de
protocolo／fabricante; `providerRoute` é o caminho da Base URL já limpo e a query nunca é preservada. A limpeza, o cache
e o fingerprint SHA-256 do Endpoint continuam reaproveitando a implementação da v1 e não são recalculados na camada de
Trace.

`rid` mapeia apenas o `requestId` do Physical Attempt; Turn／Step não o definem.

### 4.7 Nomenclatura de campos

TypeScript interno:

```text
camelCase；Id / Ms / Bytes / Tokens 明确后缀；嵌套领域对象
```

Somente o Exporter mapeia para campos externos:

```text
标准字段：
gen_ai.operation.name
gen_ai.provider.name
gen_ai.request.model / gen_ai.response.model
gen_ai.conversation.id / gen_ai.agent.name
gen_ai.tool.name / gen_ai.tool.call.id
gen_ai.usage.input_tokens / gen_ai.usage.output_tokens
gen_ai.usage.cache_read.input_tokens
gen_ai.usage.reasoning.output_tokens
server.address
error.type / error.message

ZCode 扩展：
zcode.telemetry.schema_version
zcode.span.type
zcode.operation.name
zcode.execution.kind
zcode.actor.kind
zcode.session_id / zcode.turn_id
zcode.agent.step_id / zcode.agent.step_index
zcode.model.logical_call_id
zcode.model.provider.id / zcode.model.provider.route
zcode.error.code / zcode.error.phase
zcode.tool.command.name / zcode.tool.command.category / zcode.tool.command.status
```

Para compatibilidade com as consultas existentes do ARMS, o Exporter pode continuar gerando aliases somente leitura:

```text
uid = userIdHash
sid = sessionId
rid = Physical Attempt requestId
```

Os três são produzidos pelo Resource, pelo Scope ou pelo Model Runner, e não existem como parâmetros na interface de negócio.

`userIdHash` é um identificador pseudonimizado para correlação entre dispositivos, e não dado anônimo: contas de baixa
entropia ainda podem ser adivinhadas por dicionário. `deviceMid/sessionId/turnId/requestId` também são identificadores
correlacionáveis. Eles podem ser reportados, mas devem depender do controle de acesso, do ciclo de retenção e da
auditoria do lado do ARMS; é proibido concatenar esses campos em error message ou no corpo dos logs.

 Strings `"zcode.*"` não aparecem no código de negócio. O Exporter usa testes de mapeamento exaustivo; uma
upgrade da convenção do OTel não exige modificar os pontos de chamada do negócio.

## 5. Interface de instrumentação

### 5.1 Injeção e contexto

O Bootstrap cria um Runtime de nível CLI, injetado por Ports estreitas:

```text
AgentRuntime -------> AgentExecutionTelemetryPort
ToolExecutor -------> AgentExecutionTelemetryPort
AiSdkModelAdapter --> ModelTelemetryPort
```

Por trás, compartilham o mesmo Scope Storage e TracerProvider. O App injeta apenas Endpoint, Headers, identidade e
versão; a CLI Standalone se autoinicializa com o mesmo Bootstrap.

A Telemetry usa um `AsyncLocalStorage` separado:

```ts
AsyncLocalStorage<AgentTelemetryScopeContext>;
```

O `TraceContext` existente não é estendido, porque ele é usado para logs, SessionEvent e protocolo e pode ser copiado
ou serializado; um Scope OTel só pode existir no processo CLI atual. Replay／snapshot／hydration remotos não carregam
Active Span.

O Scope Context guarda apenas o Scope Ref opaco, o Scope Kind, os ancestrais e a Model Operation padrão. Tools
paralelas rodam cada uma em seu próprio `scope.run()`, sem cruzar contexto.

O Facade voltado ao negócio e o Recorder Port de baixo nível precisam ser separados:

```text
业务/领域代码
    -> RuntimeTelemetryFacade
         ├── 从当前 TraceContext 读取 sessionId / queryId / turnId
         ├── 从现成 Message / ToolCall 领域对象提取 stepId / toolCallId
         ├── 将领域结果映射为合法 Terminal
         └── 调用 AgentExecutionTelemetryPort
                  -> Scope / Recorder / OTel
```

O negócio não pode importar `AgentExecutionTelemetryPort`. Somente o Facade e a integração de Adapter podem construir
IDs normalizados, referências de pai e fatos de runtime. Isso permite que os Contracts de baixo nível permaneçam tipos
puros e evita espalhar campos como `sessionId`, `turnId` e `provider` pelos pontos de chamada do negócio.

### 5.2 Facade de negócio e Port interno

O Facade de negócio expõe apenas o ciclo de vida central:

```ts
interface RuntimeTelemetryFacade {
  turn(): TurnScope;
  step(message: AssistantMessage): StepScope;
  tool(call: ExecutableToolCall): ToolScope;
  compaction(intent: CompactionIntent): CompactionScope;
  detached<O extends DetachedOperationName>(
    operation: O,
    details: OperationDetailMap[O],
    causation?: TelemetryLink,
  ): OperationScope<O>;
  captureLink(): TelemetryLink | undefined;
}
```

Aqui `AssistantMessage` e `ExecutableToolCall` são objetos de domínio que o ponto de chamada já possui, e não DTOs
novos criados para a Telemetry. O Extractor interno do Facade é responsável por obter os IDs; o negócio não pode passar
uma string livre fingindo ser `stepId` ou `toolCallId`.

O Recorder Port dentro dos Contracts é detalhe de implementação do Facade:

```ts
interface AgentExecutionTelemetryPort {
  startTurn(input: NormalizedAgentTurnStart): TurnScope;
  startStep(input: NormalizedAgentStepStart): StepScope;
  startTool(input: NormalizedToolStart): ToolScope;
  startCompaction(input: NormalizedOperationStart<"context.compaction">): CompactionScope;
  startDetachedOperation<O extends DetachedOperationName>(
    input: NormalizedDetachedOperationStart<O>,
  ): OperationScope<O>;
}

interface TelemetryScope<TTerminal, TErrorPhase extends string> {
  run<T>(fn: () => T): T;
  end(terminal: TTerminal): void;
  fail(error: unknown, phase: TErrorPhase): void;
  cancel(reason: CancellationReason): void;
  link(): TelemetryLink;
}
```

Todos os métodos terminais são síncronos, não lançam exceções e são idempotentes. O primeiro estado terminal prevalece;
estado terminal repetido é ignorado na P0 e ganha um Health Counter na P1.
`run()` estabelece o ALS e, quando uma exceção não tratada é lançada, faz `fail(error, "unhandled")` automaticamente; a
camada de domínio ainda escolhe explicitamente um Terminal legal no retorno normal. Quando o callback retorna
normalmente sem terminal, o Scope marca `abandoned` primeiro, evitando vazar Active Span; o Health Counter
correspondente também é adicionado na P1. As implementações Noop e Enabled mantêm a mesma semântica de chamada.

### 5.3 Turn, Step, Tool

Entrada autoritativa do Turn:

```ts
const scope = telemetry.turn();

return scope.run(async () => {
  try {
    const result = await executeTurnBody();
    scope.end(turnTerminalFromResult(result));
    return result;
  } catch (error) {
    scope.fail(error, currentTurnPhase());
    throw error;
  }
});
```

O Step passa apenas objetos de domínio que o ponto de chamada já possui:

```ts
const scope = telemetry.step(assistantMessage);

return scope.run(async () => {
  const result = await executeStepBody();
  scope.end(stepTerminalFromResult(result));
  return result;
});
```

O Facade extrai o `stepId` da Message; o `startStep` subjacente encontra o Turn e distribui o `stepIndex`. O Turn Handle
não é colocado em `RegularTurnLoopState` e nem repassado camada a camada nos parâmetros de Model／Tool.

A Tool é capturada uma única vez no centro do Executor, com zero mudança no Handler:

```ts
const scope = telemetry.tool(canonicalToolCall);

return scope.run(async () => {
  try {
    const result = await executeExistingToolFlow();
    scope.end(toolTerminalFromResult(result));
    return result;
  } catch (error) {
    if (signal?.aborted) {
      scope.cancel("abort_signal");
    } else {
      scope.fail(error, toolErrorPhase(error));
    }
    throw error;
  }
});
```

Permission, Validation, Handler, Serialization e Post Hook ficam todos no mesmo Scope. A fronteira do Executor precisa
fechar explicitamente exceções e cancelamentos e relançar as exceções de negócio sem alteração; o
`fail("unhandled")` do `run()` subjacente é apenas a última linha de defesa quando uma implementação injetada esquece
um terminal e não substitui a classificação de fase de erro do domínio.

### 5.4 Intenção de Model Call

Quando o Scope atual tem uma única Operation padrão, é possível não escrever nada:

```ts
await modelPort.streamText({ model, messages, tools });
```

Quando há vários usos de LLM dentro de uma tool, declara-se apenas o uso:

```ts
await modelPort.generateText({
  model,
  messages,
  modelCall: {
    operation: Operation.ToolReadSessionContextExtract,
  },
});
```

O `ModelCallIntent` público não contém:

```text
actorKind / IDs / parentKey / spanId
provider / model / thinking
duration / usage / error
```

O Retry do Adapter é totalmente automático. O Fallback na camada Core usa uma Call Chain controlada:

```ts
const calls = modelTelemetry.createCallChain({
  operation: Operation.ContextCompaction,
});

await modelPort.streamText({
  ...request,
  modelCall: calls.initial(),
});

await modelPort.generateText({
  ...request,
  modelCall: calls.next({
    cause: "transport_fallback",
    reason: "pre_commit_stream_failure",
  }),
});
```

A Call Chain gera `logicalCallId` / `previousLogicalCallId`; o negócio não copia IDs manualmente.
Cause／Reason são enumerações controladas e não recebem mensagens brutas do Provider.

### 5.5 Detached Operation

O Link é capturado no ponto de agendamento:

```ts
const causation = telemetry.captureLink();

void schedule(async () => {
  const scope = telemetry.detached(
    Operation.SessionTitleGeneration,
    { trigger: "first_user_input" },
    causation,
  );

  await scope.run(async () => {
    const result = await generateSessionTitle();
    scope.end(titleTerminalFromResult(result));
  });
});
```

A API Detached força a criação de uma Root e não herda o Parent do ALS atual, evitando que um fire-and-forget entre
acidentalmente em um Turn. Subagent／Workflow também passam apenas um `TelemetryLink` na fronteira de Spawn.

### 5.6 Checklist de proteção contra erros

| Risco                                    | Defesa                                |
| ---------------------------------------- | ------------------------------------- |
| Operation digitada errado                | Constante + literal union             |
| Campo exclusivo digitado errado          | `OperationDetailMap`                  |
| Parent escolhido errado                  | Política fixa de Parent               |
| UID／Session／Turn não preenchido        | Herança automática por Scope／Resource |
| Provider／Model diferente da requisição real | Valor final do Adapter              |
| Retry não registrado                     | Attempt automático pelo Status do Runner |
| Duration calculada errado                | Relógio embutido no Scope             |
| Vazamento de erro                        | Sanitizer central                     |
| Span finalizado duas vezes              | Primeiro terminal prevalece           |
| Nova LLM sem classificação               | Scope -> legacy -> alerta de `other`  |
| Report duplicado no replay               | Somente a CLI de execução detém o Runtime |

## 6. Runtime e Export

Na v1 um Model Trace curto é criado temporariamente quando o Terminal Record chega. A v2 precisa criar Active Spans
reais:

```text
scope.start
    -> tracer.startSpan
    -> registry[scopeRef] = Span + SpanContext + aggregates

child.start
    -> resolve parent context
    -> tracer.startSpan(parentContext)

scope.end
    -> set typed attributes/status
    -> span.end
    -> retain immutable SpanContext in short Link Cache
```

O Parent já está determinado quando o Child é criado e portanto não é afetado pelo Batch de 5 segundos nem por batches
distintos.

O Model Adapter resolve o Scope atual no início da chamada. O `ModelNetworkStatusEvent` existente continua fornecendo
os fatos de Attempt:

```text
model_request_started -> start Call（首次）+ Attempt
retry/failed          -> end Attempt error
next started          -> next Attempt under same Call
terminal              -> end Attempt + Call + 更新父级汇总
```

Limites sugeridos:

```text
active turns 256
active spans 2,000
idle TTL 30 min
completed Link cache 30 min
detail children / turn 200
```

Quando o Parent está ausente, há fallback para um ancestral legal; se ainda ausente, é criada uma Orphan Root, registrando
`zcode.telemetry.parent_resolution=orphan` e um Health Counter, e nunca bloqueando o negócio.

Em produção há apenas um dono de rede `TracerProvider + BatchSpanProcessor + OTLPTraceExporter`.
A Queue customizada existente pode manter a compatibilidade de Terminal Fact durante a migração, mas deixa de construir
a relação pai／filho, evitando uma Queue de duas camadas.

## 7. Desempenho, migração e aceitação

No Hot Path só são permitidos lookup de ALS／Map, relógio, contagem e operações de memória de Span; são proibidos rede,
Flush, varredura de histórico, cópia de Payload, JSON completo, limpeza repetida de URL e captura de Stack.

O Trace da Tool mapeia apenas uma lista branca fixa dos details discriminados de `ToolExecutionTelemetry`. É
especialmente proibido achatar `commandHash`, campos de extensão arbitrários de `perf.*` ou o objeto inteiro em
Attributes; isso controla o volume de rede e também evita que campos adicionados no futuro ao Schema local de
diagnóstico sejam enviados sem querer.

O número de Spans cresce apenas com Turn／Step／Tool／Compaction／Call／Attempt, e não com Token／Chunk. Depois de mais
de 200 Detail Children, o Turn／Step é mantido e apenas `overflowChildCount` acumula, com marcação de truncamento.

Ordem de implementação:

1. Schema, Operation Registry, Scope／Memory／Noop Backend.
2. Turn／Step／Tool／Compaction + Parent do Model.
3. Title, Goal Verification, Workspace Purpose, Link de Subagent／Workflow.
4. Gradual rollout do ARMS, dashboards e conciliação com as cadeias antigas.
5. Cobertura de Repo Wiki e `admin.model_probe`.

O que precisa ser verificado:

- A relação pai／filho completa Turn -> Step -> Call -> Attempt.
- Tools paralelas são irmãs e o ALS não cruza Scopes.
- A Compaction pula o Step e é pendurada no Turn.
- A Detached tem apenas Link e nenhum Parent.
- Retry, Fallback, Discard, Cancel e o resultado do Turn após recuperação estão corretos.
- Nenhuma LLM conhecida da CLI é `other`.
- Prompt, Response e Tool Payload não conseguem entrar no tipo de Record.
- ARMS fora do ar／Queue cheia não afetam o Agent e a memória é limitada.
- CPU, RSS, bytes gzip e número de requisições em enabled／disabled têm linha de base real.

## 8. Pontos de entrada da implementação e referências

- Turn: `apps/zcode-cli/packages/core/src/runtime/methods/turn.ts`
- Step: `apps/zcode-cli/packages/core/src/runtime/methods/turn-model-step.ts`
- Tool: `apps/zcode-cli/packages/core/src/tool/executor/call-runner.ts`
- Compaction: `apps/zcode-cli/packages/core/src/runtime/methods/compact-active.ts`
- Title: `apps/zcode-cli/packages/core/src/runtime/methods/title-generation-sidecar.ts`
- Goal Verification: `apps/zcode-cli/packages/core/src/runtime/methods/target-completion-verification.ts`
- Workspace Generate: `apps/zcode-cli/packages/core/src/runtime/methods/workspace-generate-text.ts`
- Model Adapter: `apps/zcode-cli/packages/adapters/src/model/runner.ts`
- Model Status: `apps/zcode-cli/packages/adapters/src/model/runner-status.ts`
- Schema atual: `apps/zcode-cli/packages/contracts/src/telemetry/index.ts`
- Schema v2 do Agent:
  `apps/zcode-cli/packages/contracts/src/telemetry/agent-execution.ts`
- Facade do Runtime:
  `apps/zcode-cli/packages/core/src/telemetry/runtime-telemetry.ts`
- Runtime de Scope do Agent:
  `apps/zcode-cli/packages/telemetry/src/agent-trace-runtime.ts`
- Recorder atual: `apps/zcode-cli/packages/telemetry/src/model-api-recorder.ts`
- Exporter atual: `apps/zcode-cli/packages/telemetry/src/otlp-exporter.ts`
- OpenTelemetry Trace API: <https://opentelemetry.io/docs/specs/otel/trace/api/>
- OpenTelemetry GenAI Attributes: <https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/>
- Repositório da especificação OpenTelemetry GenAI: <https://github.com/open-telemetry/semantic-conventions-genai>
