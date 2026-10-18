# Referência de Runtime, Privacidade, Performance e ARMS

> Este documento define o ciclo de vida, a propagação, a privacidade, a performance, os testes e as restrições operacionais de ARMS do CLI Agent Telemetry Runtime.
> O desenho geral e a forma de integração estão em [CLI Agent Telemetry 设计与开发规范](../cli-agent-telemetry.md); as definições de campos estão em
> [Schema 字典](./schema-reference.md).

## 1. Runtime em nível de processo

### 1.1 Owner único

Cada processo CLI tem um único `AgentTelemetryRuntimeOwner`:

```text
AgentTelemetryRuntimeOwner
|
+-- AsyncLocalStorageContextManager
+-- BasicTracerProvider
|   +-- ParentBasedSampler(TraceIdRatioBasedSampler=10%)
|   +-- BatchSpanProcessor
|   `-- OTLPTraceExporter
+-- MeterProvider
|   +-- PeriodicMetricReader
|   `-- OTLPMetricExporter
+-- AgentExecutionTelemetryRuntime
+-- ModelApiTelemetryStatusSink
`-- many lightweight Writers shared by Sessions
```

A Session empresta `agentExecution/modelExecution/statusSink` do Owner e não cria Provider, Exporter,
fila ou Timer próprios. Ao fechar a Session:

```text
abandonSession(sessionId)
    +-- 该 Session 未结束 Writer -> abandoned(session_shutdown)
    `-- 清理 Model Status Sink 索引

flush(timeout=1.5s)
    `-- 尽力刷新共享 Owner，不关闭它
```

Apenas o ponto de entrada mais externo do processo chama `shutdown()` quando o CLI/TUI/Protocol Agent sai. O Shutdown primeiro para o registro de estado,
depois encerra os Writers restantes como `abandoned(process_shutdown)` e então fecha Trace e Metric Provider com limite.

### 1.2 Injeção e auto-inicialização

Os dois pontos de entrada acabam usando o mesmo contrato de Owner:

```text
Desktop/Host
    `-- 注入 OTLP 配置、版本、运行面、安装 ID、身份更新

Standalone CLI
    `-- 从受控环境读取同样的 OTLP 配置

                    v
prepareModelTelemetryEnv()  异步准备
                    v
createOwnedAgentTelemetryRuntime()
```

O Owner explícito de `createModelTelemetry({ owner })` tem precedência sobre o Owner já preparado pelo processo; a configuração de Endpoint não pode sobrescrever
a instância injetada pelo chamador. Uma Session só pode emprestar, nunca substituir o Owner de nível de processo.

Configurações comuns:

```text
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT
OTEL_EXPORTER_OTLP_ENDPOINT
OTEL_EXPORTER_OTLP_TRACES_HEADERS
OTEL_EXPORTER_OTLP_HEADERS
OTEL_EXPORTER_OTLP_METRICS_ENDPOINT
OTEL_EXPORTER_OTLP_METRICS_HEADERS
OTEL_SERVICE_NAME
ZCODE_MODEL_TELEMETRY_ENABLED
ZCODE_TELEMETRY_DEVICE_MID
ZCODE_TELEMETRY_USER_SUBJECT_ID
ZCODE_TELEMETRY_IDENTITY_STATE
ZCODE_TELEMETRY_RUNTIME_SURFACE
ZCODE_TELEMETRY_RUNTIME_DISTRIBUTION
ZCODE_APP_VERSION
ZCODE_BUILD_COMMIT_ID
```

Se apenas o `OTEL_EXPORTER_OTLP_ENDPOINT` comum for configurado, o Trace acrescenta `/v1/traces` automaticamente e o Metric acrescenta
`/v1/metrics` automaticamente. Se apenas a URL específica de Trace do ARMS for fornecida, a implementação atual deixa o Metric usar a mesma URL, porque o
ponto de acesso OTLP HTTP customizado do ARMS suporta as três sinais no mesmo endereço.

Header é um Secret de runtime: ele entra apenas na configuração do Exporter, nunca em Resource, Span, Metric ou logs.

### 1.3 Caminho Disabled

Sem um Endpoint de Trace válido, ou quando `ZCODE_MODEL_TELEMETRY_ENABLED` é
`0/false/off/disabled`:

- não há import dinâmico de SDK/Exporter do OTel;
- não são criados Provider, fila, Timer ou requisições de rede;
- retorna um Writer No-op compartilhado;
- o No-op `run()` executa o callback de negócio diretamente e exatamente uma vez;
- `--help`, consulta de versão e caminhos de trabalho sem Agent não carregam o custo de inicialização do SDK.

### 1.4 Installation ID e atualização de identidade

O Installation ID do Standalone fica salvo em:

```text
$ZCODE_HOME/v2/telemetry-state.json
或 ~/.zcode/v2/telemetry-state.json
```

A criação usa I/O de arquivo assíncrono, Rename atômico por arquivo temporário, lock entre processos e recuperação de Stale Lock de 5 minutos. Quando outro processo
ativo está atualizando, não se espera; esta execução pode omitir a correlação anônima; qualquer falha de leitura ou escrita não bloqueia a CLI.

O snapshot de identidade pode ser atualizado via `updateIdentity()` no login, logout e troca de conta. Ele é lido uma vez na criação de cada novo Turn;
Spans já existentes não são reescritos, garantindo identidade estável dentro de uma execução.

## 2. Context, topologia e múltiplas superfícies de execução

### 2.1 Context no processo

`BaseSpanWriter.run()` usa `context.with()` do OTel para ativar o Span atual:

```text
parent.run(async () => {
    child = startChild()       // 自动从 active context 找 Parent
    return child.run(...)
})
```

O Runtime não mantém um segundo AsyncLocalStorage de "Span atual". O `ActiveWriterContext` privado fica junto do Span do OTel
no mesmo Context, contendo o snapshot de correlação, o Parent Writer e o Tool Call ID.

### 2.2 Padrões de Causation

`AgentTurnTraceStart` suporta:

```text
causationMode=child
    从保存的 SpanContext 重建 Parent Context
    Child 与 Parent 共享 traceId

causationMode=linked_root（默认）
    从 ROOT_CONTEXT 创建新 Trace
    Link 到保存的 SpanContext
```

`DetachedOperationTraceStart` decide conforme `executionKind`: Foreground usa Child; Queued e
Background usam Root + Link. Link de Recovery usa `resumed_from` e outras operações independentes usam
`triggered_by`.

A reconstrução explícita de Causation precisa ter `ROOT_CONTEXT` como base e não pode herdar Baggage temporário da fase de execução, Active
Span nem Writer State privado.

### 2.3 Subagent e Workflow

```text
前台 Subagent（父 Tool await）
parent tool
    `-- child agent_turn
          `-- child 自己的 step/call/attempt/tool

后台 Subagent
parent tool --Link(spawned_by)--> child agent_turn root

Workflow / Script Workflow Child
trigger --Link(spawned_by)--> child agent_turn root
```

O Runtime Child recebe o mesmo `AgentExecutionTelemetryPort` e a Causation capturada, de modo que todos os Step,
Tool, Call e Attempt internos viram Spans normais, em vez de restar apenas uma caixa-preta de Subagent.

O Actor Kind é normalizado a partir de `SessionTaskType`:

```text
subagent_child                         -> subagent
workflow_child / nested_workflow_child -> workflow_child
其他                                   -> main
```

### 2.4 Operações fora do Turn

`detached_operation` cobre título, Goal, Project Memory, geração de texto de Workspace e outros trabalhos fora do Turn.
Se essas operações chamarem um modelo, precisam ser executadas no seu `scope.run()`, tornando o Model Call automaticamente um Child.

O Project Memory Recall captura a Causation no momento do agendamento/prefetch; Dream, Extraction e Title seguem o mesmo padrão. A enumeração completa de Operation
está em [Schema 字典](./schema-reference.md#101-operation-目录).

### 2.5 Fatos vivos multiplataforma

```text
desktop-continuous 真实执行 --------------------> 创建 Span
web-remote-replayable 触发 shared host 真实执行 ---> 创建同一个 CLI Span
snapshot / hydration / UI replay --------------> 不创建 Span
```

O Trace registra a execução real do Agent Runtime, não o replay do Renderer. O `/remote` do celular usando attachment de shared host
continua reportando os dados pelo Host que hospeda o CLI Runtime real; não é permitido complementar o relatório no Relay, no Main ou na UI de recuperação,
pois isso causaria contagem duplicada.

Atualmente `AgentTelemetryCausation` é um tipo estrito interno da CLI e não equivale à propagação W3C completa de
processo em processo, de Desktop/RUM até o Agent. Quando a integração for feita, será preciso modificar o Schema estrito de `@zcode/protocol` e acrescentar testes de topologia.

## 3. Writer e garantias de estado terminal

### 3.1 Modelo de Setter direto

O Writer não usa um Registry de Schema em runtime nem exige que o negócio reencapsule o resultado em um DTO de Telemetry:

```text
业务事实发生
    -> 具体 Writer Setter
         +-- 归一化/脱敏
         +-- 写 Canonical zcode.*
         +-- 必要时写 Event
         +-- 必要时记 Metric
         `-- 必要时投影 Compatibility Alias
```

Os Contracts fornecem interfaces em tempo de compilação; as Keys explícitas no Runtime tornam implementação e consulta visíveis de imediato; o Schema dictionary explica a semântica
que o código não consegue expressar.

### 3.2 Comportamento exactly-once de `run()`

`run<T>(() => T): T` suporta simultaneamente valores síncronos e Promises:

```text
进入 context.with
    |
    +-- 业务同步抛错
    |      -> 未终态则 finishUnhandled -> 重新抛出原错误
    |
    +-- 返回 Promise
    |      +-- resolve：未显式终态 -> abandoned(missing_terminal)
    |      `-- reject：未终态 -> finishUnhandled -> 重新 reject
    |
    `-- 返回普通值
           -> 未显式终态 -> abandoned(missing_terminal)
```

Teoricamente o Context Manager não deveria lançar fora do callback de negócio, mas o Runtime ainda se defends de três casos:

1. falha antes da ativação: registra um Warning controlado e executa o negócio uma vez fora do Context;
2. falha no teardown do Context depois de o negócio já ter retornado: mantém o retorno do negócio e não reexecuta;
3. falha do próprio negócio: encerra o Span e relança como está.

As travas internas `entered/businessReturned/businessValue/businessError` garantem que o callback de negócio não seja executado duas vezes por causa de uma exceção de Telemetry.

### 3.3 Terminal Latch

Todos os métodos de estado terminal compartilham um Latch de uso único:

```text
claimTerminal()
    先 ended=true
    再写 outcome / status / metric / span.end()
```

Mesmo que o SDK, o Adapter, o Metric ou `span.end()` lancem erro, o Latch não reabre. Chamadas terminais posteriores são No-op.
Quando a reciclagem de Session/Process ocorre em paralelo com um estado terminal normal, apenas a primeira operação terminal tem efeito.

### 3.4 Reivindicação de Error

O mesmo objeto de Error e sua cadeia de `cause` de até 8 níveis são reivindicados com um `WeakSet`:

```text
ProviderError 在 model_attempt 首次记录正文
    -> AdapterError(cause=ProviderError) 冒泡到 model_call
         -> call 记录 failed/category/stage，不再复制正文
             -> step/turn 同理
```

O objeto original não é retido por muito tempo; o WeakSet não estende o ciclo de vida. Quando não é possível reivindicar um erro que não é objeto, ele é convertido de forma
controlada no Span mais próximo no momento. Essa garantia depende de as camadas superiores continuarem passando o mesmo Error ou a cadeia de `cause`; se algum Producer recriar
objetos de Error sem relação causal em cada nível, o Runtime não consegue reconhecer que vêm da mesma origem, e por isso isso é proibido ao Producer.

## 4. Model Status para Trace

A camada de encapsulamento da API de modelo fornece os fatos reais da requisição por meio de um Status Event unificado, gerenciado por `ModelApiTelemetryStatusSink`:

```text
logical_call_started
    -> startCall(logicalCallId, operation, requested target)

attempt_started
    -> call.startAttempt(requestId, actual target, transport, cause)

headers / stream / usage / error status
    -> attempt 的具体 Setter / marker

attempt_terminal
    -> attempt.finish*

logical_call_terminal
    -> call.finish*
```

Ela mantém no máximo 1000 Model Calls ativos. A entrada de status events faz uma limpeza preguiçosa no máximo uma vez por minuto; Calls e
Attempts sem atividade por 30 minutos são encerrados como `missing_terminal`. Esse TTL pertence apenas ao índice de status, não é um TTL geral de Spans; Turns/Commands leg-longos
não são finalizados automaticamente apenas por serem longos.

O `operation` na entrada de modelo prioriza a Observation explícita do ponto de chamada; o antigo `querySource` serve apenas como mapeamento de compatibilidade. Um
Query Source desconhecido volta para `tool_internal_model_call` e não gera Operation de texto livre.

## 5. Compatibility Adapter

O Adapter aceita somente fatos já normalizados e higienizados:

```text
Provider Adapter / Writer Setter
        |
        +-- Canonical zcode.*
        |
        `-- compatibility-adapters.ts
              +-- gen_ai.*
              +-- http.response.*
              +-- server.*
              +-- process.*
              `-- error.*
```

Os pontos de chamada do negócio não percebem campos GenAI ou ARMS. Quando a convenção externa muda, modifique o Adapter e os testes de mapeamento exato;
o Canonical continua com a semântica interna completa. Não é possível reconstruir o Canonical a partir dos campos de compatibilidade, porque a conversão pode perder informação.

## 6. Privacidade e redação

### 6.1 Classificação dos dados

| Categoria                | Exemplos                                                | Política                                   |
| ------------------------ | ------------------------------------------------------- | ------------------------------------------ |
| Fatos de execução de baixo risco | Outcome, Token, HTTP Status, Provider Kind       | Registrar após limites de tipo/cardinalidade |
| Identificadores pseudônimos de correlação | Installation, User Subject, Session, Turn, Request | Somente entram no Trace, sujeitos às políticas de acesso e retenção |
| Texto livre controlado    | Model, Provider Error, Safe Name                      | Saneamento, truncamento, testes            |
| Conteúdo de alta privacidade | Prompt, corpo, arquivos, comandos, Header, Body     | Coleta proibida                            |

O Installation ID é um pseudônimo de produto aleatório e persistente; não é um identificador de hardware como MAC ou número de série do disco. O User Subject ID
não é atualmente re-hashado na CLI, e o Host precisa fornecer apenas o ID de sujeito estável cuja entrada em Telemetry seja permitida. Ambos podem ser usados para correlacionar
comportamento do usuário e não podem ser chamados de dados anônimos.

### 6.2 Endpoint do Provider

Após receber a Base URL de entrada:

```text
长度 > 4096                              -> 省略
非 http/https 或 URL 解析失败             -> 省略
username/password                         -> 删除
query/fragment                            -> 删除
hostname                                  -> 小写
默认 80/443 port                          -> 规范化删除
path segment 为 email/uuid/长数字/长 hex/token -> 占位符
普通 segment                              -> 最多 128 字符
route                                     -> 最多 1024 字符
```

Saída:

```text
provider_origin = scheme://host[:port]
provider_route  = sanitized pathname
```

Não se exige que o usuário configure um template seguro. O `ProviderEndpointIdentityCache` armazena em cache no máximo
256 itens por `(providerKind, baseURL)`, evitando repetir a análise de URL e a limpeza por regex a cada requisição.

### 6.3 Error Message

O tratamento de erros segue "preservar o máximo de informação diagnóstica original, removendo conteúdo de alto risco":

1. a entrada é truncada primeiro para 4096 caracteres, limitando o custo de CPU/memória de mensagens maliciosas do Provider;
2. a URL tem Query/credenciais removidos e os segmentos dinâmicos são saneados;
3. são limpos pares de chave/valor como Authorization, API Key, Token, Password, Secret, Cookie e Session;
4. são limpos Bearer/Basic, `sk-*` comuns, GitHub Token, AWS Key e Google Key;
5. e-mail, caminho local do usuário, caminho Temp e caminho absoluto do Windows são substituídos;
6. caracteres de controle são removidos e espaços em branco são compactados;
7. o resultado final é truncado para 2048 caracteres.

Tanto `provider_error_message` quanto o `error_message` de Lifecycle usam este Sanitizer. Códigos de erro passam apenas por limpeza de caracteres de controle
e truncamento em 128 caracteres, sem reclassificação por templates artificiais.

### 6.4 Tool e Command

Permitido: Registry Tool Name, categoria de comando, Shell Kind, Safe Name controlado, Exit Code, Signal, Timeout,
Output Bytes, Truncated.

Proibido: argumentos de Tool, corpo da saída de Tool, comando completo, scripts, parâmetros, caminhos, cwd, variáveis de ambiente. O Safe Name só pode ser
gerado a partir do Registry/Allowlist de comandos; não se pode simplesmente truncar o texto do comando e chamá-lo de "seguro".

### 6.5 Acesso e retenção

A redação no código não é todo o controle de privacidade. O ARMS Workspace ainda precisa de privilégio mínimo, auditoria de consultas e um período de retenção razoável; resultados de exportação contendo ID pseudônimo
de usuário ou de instalação não podem ser compartilhados livremente. Header/License Key do OTLP não podem entrar em screenshots, exemplos de documentação ou no Git.

## 7. Performance, capacidade e confiabilidade

### 7.1 Valores padrão da implementação atual

| Item                            | Valor/comportamento atual                    |
| ------------------------------- | -------------------------------------------- |
| Limite de Active Writer         | 5000 por processo                            |
| Limite de Model Status Call ativo | 1000                                       |
| Recuperação preguiçosa de Model Status | 30 min sem atividade; no máximo um Sweep por minuto |
| Fila do BSP                     | 2000 Spans                                   |
| Lote de Export                  | 100 Spans                                    |
| Atraso do Lote                  | 5 segundos                                   |
| Timeout de Export               | 3 segundos                                   |
| Flush de Session                | 1,5 segundo por padrão                       |
| Shutdown de Process             | 1,5 segundo por padrão                       |
| Intervalo de Export de Metric   | 5 minutos; ainda faz best-effort flush ao sair do processo |
| Limite de séries de Metric      | 250 por View                                 |
| Head Sampling de Trace          | Root 10%; Spans filhos herdam a decisão do pai |
| Min/Max de Histogram            | não registrados; mantém Count, Sum e Buckets enxutos |
| Compressão OTLP                 | Gzip                                         |

### 7.2 Caminhos quentes

- a criação de Writer e os Setters só processam entradas pequenas e conhecidas;
- não há I/O síncrono de arquivo ou de rede;
- não há travessia de Prompt, Messages, Header, Body ou objetos arbitrariamente grandes;
- o saneamento de Endpoint tem cache limitado;
- as regex de erro rodam após o truncamento;
- Streaming registra apenas First, Stall Count e Max Idle, sem criar Event por Chunk;
- o Metric de Token usa Delta monotônico de valores acumulados, evitando reenvio;
- o Trace é exportado de forma assíncrona pelo BSP e o negócio não espera cada envio de Span.

### 7.3 Capacidade e degradação

Ao atingir o limite de Active Writer:

```text
拒绝创建新 Span
    -> 返回共享 No-op Writer
    -> zcode.telemetry.creation_drop.count += 1
    -> onWarning（容量恢复前只报告一次活跃告警）
    -> 业务继续执行
```

Atualmente o único Health Metric do Runtime observável remotamente é `creation_drop` e `abandoned`. O BSP Queue Drop, o
Exporter Failure e o Shutdown Timeout ainda não têm Metrics dedicados, e o Dashboard não deve assumir que eles existem. Com o enlace totalmente
quebrado, o próprio Metric remoto também não consegue chegar, e ainda é preciso ter alertas do tipo "os dados do serviço desapareceram" ou uma verificação externa de saúde do Collector.

### 7.4 Sampling

Atualmente a CLI conecta direto ao ARMS e o Trace Root usa
`ParentBasedSampler(TraceIdRatioBasedSampler(0.10))` para um Head Sampling determinístico de 10%; Spans filhos da mesma
Trace precisam herdar a decisão do pai, e é proibido amostrar cada Span de forma independente e formar uma árvore incompleta. Metrics não seguem o sampling de
Trace; tráfego exato, taxa de sucesso, Tokens e percentis de latência continuam sendo fornecidos pelos Metrics completos.

O Head Sampling no cliente é decidido no início do Span e não pode saber se ele falhará ou ficará lento no fim. Por isso, nesta etapa aceitamos
o custo/trade-off de diagnóstico de que Traces de erro também são amostrados em 10%, e não é possível afirmar que falhas e requisições lentas foram retidas em 100%. Se o Tail Sampling do Collector for
introduzido depois, o cliente deve voltar a AlwaysOn e o Collector passa a decidir pela ordem de conclusão da Trace completa:

- failed, abandoned, Traces lentas e Operations raras têm prioridade de retenção;
- QPS exato, taxa de sucesso, Tokens e percentis continuam vindo dos Metrics;
- Root + Link são duas Traces independentes, e os resultados do sampling também são independentes;
- antes de colocar o Collector em produção é preciso validar capacidade, taxa de retenção de falhas e integridade da árvore de Traces, sem sobrepor ao Head Sampling de 10% do cliente.

### 7.5 Critérios de redução de volume de Metrics

- O período de `PeriodicExportingMetricReader` foi alterado de 60 segundos para 5 minutos; a temporality DELTA não muda, e o shutdown normal da CLI ainda dispara um último best-effort flush, de modo que processos de vida curta não perdem necessariamente por não completar 5 minutos.
- O Histogram desativa `recordMinMax` para evitar gravar min e max extras por série temporal; Count, Sum e Buckets
  são mantidos.
- O Histogram de Duration/TTFT usa Buckets enxutos, no máximo 10, cobrindo os pontos de inflexão dos SLO existentes; o Histogram de Attempts
  mantém `1/2/3/5/8`. Os ajustes apenas reduzem a resolução de observação e a contagem de pontos no ARMS, sem alterar o caminho de execução do Writer, das chamadas de modelo,
  das Tools ou das Sessions.

## 8. Testes e gates de release

### 8.1 Testes unitários e de comportamento

Validar no mínimo:

- a Canonical Key, o tipo, a enumeração e a unidade de cada Setter;
- Compatibility Alias exact/convert/omit;
- casos negativos de privacidade de Endpoint, Error, Tool e Command;
- End exactly-once, `missing_terminal` e abandon de Session/Process;
- completed/failed/cancelled/denied/discarded/backgrounded com o Status do OTel;
- resultado de negócio e número de execuções inalterados quando a Telemetry lança em qualquer fronteira;
- Unknown/Absent/False/0;
- deduplicação do First Event, Delta de Token e Allowlist de Labels de Metric.

### 8.2 Golden Test de topologia

Memory Exporter verifica:

```text
Turn -> Step -> Call -> Attempt
Turn -> Step -> Tool -> Command
Turn -> Compaction -> Call -> Attempt
Tool -> Call -> Attempt
Tool -> Foreground Child Agent Turn
Tool --Link--> Background Child Agent Turn Root
Trigger --Link--> Detached Operation Root
Retry = one Call + multiple Attempt
```

Ao mesmo tempo, confere traceId, parentSpanId, Link SpanContext, traceState, isRemote e Query Projection.

### 8.3 Integridade e privacidade

- pelo menos um teste de ponto de entrada de chamada para cada Model Operation;
- cada Attempt real de Provider entra simultaneamente no OTel e no SQLite `model_usage`;
- chamadas internas de modelo como Read Session Context, Web Fetch, Project Memory e Title não podem ficar de fora;
- cobertura completa de Stream/Non-stream, Retry, Fallback, Cancellation e Compaction;
- Snapshot/Hydration/Replay não fazem Complemento de relatório;
- Getters maliciosos, objetos cíclicos, Errors muito longos, Secrets, Query de URL, caminhos de arquivo, e-mails e comandos completos não podem aparecer no
  Payload OTLP.

### 8.4 Build e integração

- o caminho Disabled verifica SDK, Timer e Network em 0;
- a CLI Standalone e o Desktop Packaged Agent enviam Canary real;
- a impressão digital de cache do build empacotado inclui entradas de build como Endpoint/Header/Service Name;
- `service.version` é consistente com a versão da CLI dentro do bundle;
- `zcode.product.version` é consistente com a versão do instalador do produto;
- `zcode.build.commit_id` permite localizar o build;
- antes do commit, executar os testes relevantes, `pnpm typecheck` e `pnpm lint`.

Principais testes existentes:

```text
packages/telemetry/tests/agent-trace-runtime.test.ts
packages/telemetry/tests/model-api-recorder.test.ts
packages/telemetry/tests/agent-metrics.test.ts
packages/telemetry/tests/error-sanitizer.test.ts
packages/telemetry/tests/provider-endpoint.test.ts
packages/telemetry/tests/compatibility-adapters.test.ts
packages/telemetry/tests/otlp-integration.test.ts
packages/core/tests/runtime-agent-telemetry.test.ts
packages/core/tests/tool-agent-telemetry.test.ts
packages/bootstrap/tests/telemetry-bootstrap.test.ts
```

Os caminhos são relativos a `apps/zcode-cli/`.

## 9. Consultas, dashboards e critérios estatísticos no ARMS

### 9.1 Localização dos dados

O Trace OTLP entra no armazenamento de Trace do ARMS e o Metric OTLP entra no armazenamento de métricas; não é preciso criar "tabelas" de negócio. Os
objetos a construir são Saved Query, Dashboard e Alert Rule.

```text
OTel 原生字段
    serviceName / spanName / traceId / duration / statusCode

Resource
    resources.service.version
    resources.zcode.product.version
    resources.zcode.build.commit_id
    resources.zcode.telemetry.schema_version
    resources.zcode.runtime.surface
    resources.zcode.device.installation_id

Span Attribute
    attributes.zcode.execution.turn_id
    attributes.zcode.<span_name>.outcome
    attributes.zcode.model_attempt.provider_origin
```

Diferentes versões do console do ARMS podem usar condições visuais, SPL ou sintaxe de consulta equivalente; a semântica dos campos não muda.

### 9.2 Saved Query

Condições comuns:

```text
serviceName : zcode-cli-agent
and resources.zcode.telemetry.schema_version : 5
```

Turn:

```text
and spanName : agent_turn
```

Attempt com falha:

```text
and spanName : model_attempt
and attributes.zcode.model_attempt.outcome : failed
```

429:

```text
and spanName : model_attempt
and attributes.zcode.model_attempt.http_status_code : 429
```

Para investigar pela informação de erro do Provider:

```text
and spanName : model_attempt
and attributes.zcode.model_attempt.outcome : failed

聚合/展示：
attributes.zcode.model_attempt.provider_origin
attributes.zcode.model_attempt.provider_route
attributes.zcode.model_attempt.http_status_code
attributes.zcode.model_attempt.provider_error_code
attributes.zcode.model_attempt.provider_error_message
attributes.zcode.model_attempt.error_code
attributes.zcode.model_attempt.error_message
```

Atenção: quando o Provider não devolve um corpo de erro estruturado, `provider_error_message` pode estar vazio; erros de rede/DNS/Timeout
normalmente aparecem no `error_message` de Lifecycle. Em consultas de diagnóstico, exiba as duas colunas em vez de usar
`coalesce` e mascarar a diferença de origem.

A comparação de versão deve exibir no mínimo:

```text
resources.service.version
resources.zcode.product.version
resources.zcode.build.commit_id
resources.zcode.telemetry.schema_version
```

Se o ARMS não suportar `>=` em strings de versão semântica, não compare `3.10` e `3.9` em ordem lexicográfica. Use um conjunto exato de versões,
separação por Build Commit/data de publicação, ou adicione uma dimensão de versão numérica antes da entrada dos dados e evolua o Schema.

### 9.3 Dashboards recomendados

#### Visão geral do Agent

- número de Turns, concluído/falha/cancelado/Abandoned;
- P50/P95/P99;
- Actor Kind, Launch Surface, Runtime Surface;
- CLI Version, Product Version, Build Commit.

#### Model Call

- taxa de sucesso lógica;
- taxa de amplificação Attempt/Call;
- taxa de recuperação por Retry;
- Operation, Model Role, Call Cause;
- distribuição de Attempts por Call.

#### Model Attempt

- tráfego por Provider Kind, Origin, Model, Transport, API Operation;
- taxa de sucesso física, P50/P95/P99;
- First Provider Event, TTFC, TTFT;
- HTTP Status, Provider Error Code, Failure Stage;
- Tokens de Input/Output/Reasoning/Cache Read/Cache Write;
- Stream Stall Count e Max Idle.

#### Tool e Command

- tráfego, taxa de sucesso e latência por Tool Name;
- Permission Denied, Output Truncated;
- Command Category/Safe Name, Exit Code não zero, Timeout, First Output.

#### Telemetry Health

- Creation Drop;
- Abandoned por Span Name/Reason;
- desaparecimento de dados do serviço;
- como ainda não há Metric dedicado de Export Failure/Queue Drop, a lacuna deve ser marcada explicitamente.

### 9.4 Fórmulas estatísticas

O tráfego de cada Span usa o Count do Histogram `*.duration` correspondente, sem criar Request Counters duplicados.

Taxa de sucesso de negócio padrão:

```text
completed / (completed + failed)
```

`cancelled`, `denied`, `discarded`, `backgrounded` e `abandoned` são exibidos separadamente e não podem ser escondidos no denominador de falhas.

Taxa de recuperação por Retry:

```text
model_call.duration count where retry_state=recovered
/
model_call.duration count where retry_state in (recovered, not_recovered)
```

Taxa de amplificação de Attempt:

```text
sum(zcode.model.call.attempts) / count(zcode.model.call.attempts)
```

Uso de Cache com Tokens brutos:

```text
cache read token ratio =
sum(token where token_type=cache_read)
/
sum(token where token_type in (input, cache_read))
```

A definição de Token de cada Provider específico pode variar; o Dashboard precisa manter o filtro de Provider/Model e não pode combinar sem explicação a semântica de Cache
de todos os fabricantes em uma única "taxa de acerto".

Tráfego exato, taxa de sucesso, Tokens e percentis de latência devem usar preferencialmente Metrics; o Trace é usado para mensagens de erro, Endpoint, correlação de ID e
drill-down de amostras específicas.

## 10. Evolução de versão e Schema

```text
service.version                  CLI Telemetry 生产者版本
zcode.product.version            Desktop/产品版本
zcode.telemetry.schema_version   数据契约版本
zcode.build.commit_id            精确构建身份
```

Eleve a Schema Version ao quebrar Attribute Key/tipo/unidade, o significado de Outcome, a topologia Parent/Link ou o denominador estatístico de Metric. Adicionar campos opcionais ou Alias compatíveis normalmente não exige upgrade, mas o dicionário de campos, o Golden Test e os dashboards precisam ser atualizados.

Desenhos históricos e planos de migração servem apenas para rastreabilidade e não podem servir de base para novos relatórios ou implementações.