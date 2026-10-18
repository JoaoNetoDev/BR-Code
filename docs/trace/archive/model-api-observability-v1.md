# Design de Observabilidade da Model API do Agente CLI (V1 histórico)

> Status: substituído pela
> [Especificação Final de Arquitetura OpenTelemetry do Agente CLI](../cli-agent-telemetry.md).
> Este documento mantém apenas o contexto das decisões iniciais e não serve mais como base de
> implementação para campos, interfaces, privacidade ou relatórios.
>
> A nova implementação já removeu os designs de Endpoint/Error Fingerprint, `cache_observation`,
> resumos de Trace `had_error/recovered_after_retry` presentes aqui; não crie novas consultas ou código a partir deles.
>
> O tronco principal posterior da execução do Agente está em
> [Design de Observabilidade do Turn Trace do Agente CLI](./turn-trace-observability-v2.md). O
> `zcode.model.call` / `zcode.model.attempt` aqui existente não é descontinuado; eles migrarão do
> curto Trace atual para Spans filhos sob Turn / Step / Compaction / Tool.

## 1. Conclusão

Este recurso adota um design de duas camadas:

1. Estabelecer um `TelemetryRuntime` genérico, responsável apenas por fila, batching, limitação de
   alertas, Flush e ciclo de vida do Exporter; no P0 tudo é registrado, e o amostragem posterior
   é estendida por essa camada.
2. Sobre o runtime genérico, estabelecer um `ModelApiTelemetry` fortemente tipado, que entende
   especificamente Logical Call, Physical Attempt, Provider, Model, Thought Level, Token, Cache,
   Retry, Fallback e erros de chamadas de modelo.

Não se expõe ao código de negócio um `track(name, properties)` com atributos arbitrários, e o
domínio de modelo não depende diretamente do SDK do ARMS.

O CLI é o produtor autoritativo dos fatos de chamadas de modelo. O App apenas injeta OTLP,
ambiente de execução e configuração de identidade ao iniciar o CLI; o CLI também suporta ler o
mesmo conjunto de configurações e se inicializar sozinho no cenário Standalone. O RUM existente
do App e o novo OTel do CLI usam a mesma conta/Workspace da Alibaba Cloud, mas não compartilham
SDK, Endpoint ou `service.name`.

No curto prazo não removemos `plan_request`, `/event/report`, o Usage no SQLite, a performance de
UI e os logs locais existentes. O novo caminho faz double write e reconciliação primeiro; no longo
prazo os Fatos de Model API do CLI tornam-se a única fonte de fato em nível de requisição,
substituindo progressivamente a cadeia de produção duplicada de `plan_request`.

## 2. Objetivos e não objetivos

### 2.1 Objetivos

- Cobrir todas as chamadas de Model API distinguíveis dentro do CLI, incluindo Agente principal,
  Subagent, Workflow Child, Compaction, título, Goal Verifier, Git Commit e chamadas de modelo
  internas às ferramentas.
- Distinguir uma chamada de modelo das requisições físicas ao Provider abaixo dela, do Retry do
  Adapter, da recuperação de streaming e do Fallback de Transport.
- Estatísticas de volume de chamadas, taxa de amplificação de requisições físicas, taxa de sucesso,
  taxa de cancelamento, taxa de recuperação por Retry, duração, TTFT, Token e Prompt Cache.
- Registrar o Provider real, o Endpoint sanitizado, o Model e o Thought Level solicitado e
  efetivamente final.
- Em caso de falha, registrar o código de erro ZCode, o código de erro do Provider, o status HTTP,
  a mensagem de erro desidentificada, a fase do erro, se é retryable e o Provider Request ID.
- Todos os registros carregam IDs de correlação como UID, dispositivo, Session, Turn, Trace,
  Logical Call e Request.
- CLI iniciado pelo App e CLI Standalone compartilham o mesmo Schema e a mesma lógica de Exporter.
- Falha, congestão ou ausência de configuração da Telemetria não pode bloquear nem alterar o
  comportamento do Agente.

### 2.2 Não objetivos

- Não enviar Prompt, corpo de Message, entrada/saída de Tool, conteúdo de arquivos, Header,
  Cookie, API Key ou Provider Options completos.
- Não reportar por Token, por Delta SSE ou por Streaming Chunk.
- Não usar o TTFT do Provider do CLI no lugar do TTFT visível ao usuário no Renderer.
- Não migrar para este caminho eventos de `/event/report` como conversão de negócio, compra ou feedback.
- Não gravar estado de Telemetria em conversation snapshot, relay, desktop main ou renderer store.
- Na primeira fase não criar "tabelas" relacionais no ARMS nem criar a tabela local `model_attempt_usage`.
- Na primeira fase não remover nem alterar o comportamento externo do RUM, do business tracking e do
  Usage local existentes.

## 3. Limites confirmados

| Limite              | Decisão                                                                                                  |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| Abstração de monitoramento | runtime de Telemetria genérico + Schema/Recorder fortemente tipado e específico de modelo            |
| Classificação da chamada de modelo | usar um caminho `operation` pontuado e estável, sem criar `operation_phase` separado                    |
| Campos customizados da Feature | usar discriminated union e campos com namespace, sem permitir Map de atributos arbitrários           |
| Endpoint do Provider | sanitização automática interna do cliente; sem configuração, sem UI, sem percepção do usuário                     |
| Sanitização de Path | remover credenciais/query/fragment da URL e depois substituir com regex leve e-mail, UUID, números longos e segmentos estilo Token/Hash; sem template excessivo |
| Cache de Endpoint   | memoizado no processo por `providerKind + baseURL`; sem persistência                                      |
| Thought Level       | reutilizar o Model Catalog existente, o `thoughtLevel` da UI e o mapeamento final de Provider Options, sem criar níveis independentes de fornecedor |
| ARMS do App         | mesma conta/Workspace; RUM do App e OTel do CLI em Services e Endpoints separados                       |
| Estratégia de compatibilidade | double write no curto prazo sem quebrar; reconciliação no médio prazo; substituição da cadeia request-level duplicada no longo prazo |
| Estratégia de performance | a thread de negócio apenas atualiza estado pequeno e enfileira em fila limitada; a rede real é feita pelo Batch Exporter em background |
| UID/RID/SID         | o Schema usa nomes explícitos; o Exporter pode mapear para `uid/rid/sid` conforme a convenção do backend, e a camada de domínio não usa abreviações ambíguas |

## 4. Fatos atuais e caminhos sobrepostos

### 4.1 Caminho principal atual das requisições de modelo

Todas as requisições de modelo de produção terminam convergindo no AiSdk Model Adapter:

```text
Core / Tool / Sidecar
        |
        v
ModelPort.generateText / streamText
        |
        v
AiSdkModelAdapter
        |
        +--> runGenerateText
        +--> runStreamText
                 |
                 v
          Provider HTTP / SSE
```

O Adapter já produz os seguintes `ModelNetworkStatusEvent`:

- `model_request_started`
- `model_request_completed`
- `model_request_failed`
- `model_retry_scheduled`
- `model_stream_stalled`

Os eventos já contêm a maior parte dos fatos básicos de Trace/Query/Session/Turn, Request, Provider,
Model, Base URL, Transport, Attempt, Duration, Usage, Failure Reason, Message e HTTP Status.

### 4.2 Cadeia atual de monitoramento/Usage

```text
CLI model status
  |\
  | +--> protocol live fact --> Renderer --> RUM plan_request
  |
  +----> UI retry/debug projection

CLI runtime usage
  +----> SQLite model_usage / turn_usage / tool_usage

Renderer conversation lifecycle
  +----> /event/report message_completion / agent_step / context_compaction
  +----> RUM plan_ttft / UI TTFT / UI completion / UI stall

Desktop main
  +----> RUM crash / resource / HTTP / RPC / longTask
```

### 4.3 Revisão de sobreposição

| Mecanismo                             | Relação com o novo plano                        | Curto prazo                                  | Longo prazo                                        |
| ------------------------------------- | ----------------------------------------------- | -------------------------------------------- | -------------------------------------------------- |
| `ModelNetworkStatusEvent`             | melhor fonte de fato do Physical Attempt        | reutilizado e completado com campos         | permanece como projeção Runtime/UI e entrada do Recorder |
| `ModelStatusSink`                     | abstração de consumo de estado já existente     | corrigir o problema de escolha entre request/global e suportar fan-out | mantido, ou rebaixado a um Composite Sink unificado |
| SQLite `model_usage`                  | fato local de Token/duração da chamada lógica   | tabela e consultas inalteradas              | passa a consumir o mesmo Model Call Terminal Fact   |
| RUM `plan_request`                    | altamente duplicado com o Attempt em nível de requisição | double write para reconciliação    | interrompido ou mantido apenas como Exporter compatível após o OTel estabilizar |
| RUM `plan_ttft`                       | duração visível ao usuário no Renderer          | mantido                                       | mantido, sem ser fundido com o TTFT do Provider    |
| `/event/report message_completion`    | Turn do usuário / qualidade de negócio          | mantido                                       | mantido, correlacionado por Session/Turn ID        |
| `/event/report agent_step`            | passo de UI/negócio, não uma Request de Model API | mantido                                     | mantido; o nome precisa evitar confusão com Model Call na documentação |
| monitoramento de rede RUM do Desktop  | HTTP, RPC, WS de Main/Renderer                  | mantido                                       | mantido, não pode substituir a semântica de modelo do subprocesso do CLI |
| logs locais                           | diagnóstico em máquina única                    | mantido                                       | mantido; pode ser mais detalhado que o ARMS, mas ainda precisa de desidentificação |

O princípio central é "consolidar a produção de fatos, sem forçar a consolidação de todos os consumidores".

## 5. Propriedade do estado

| Fato                                     | Fonte autoritativa                                          | Espelho/consumidor                          |
| ---------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| Provider/Model/Base URL/Transport        | resultado final de resolução do Model Adapter                | OTel do ARMS, projeção segura de UI, logs  |
| Ciclo de vida do Physical Attempt        | `runGenerateText` / `runStreamText`                           | ModelApiTelemetry, retry/debug da UI        |
| Token/Cache/Finish Reason                | Usage final da Normalization do Adapter                       | ModelApiTelemetry, Usage no SQLite         |
| Semântica da Operation                   | pontos de chamada em Core/Tool/Sidecar                        | ModelApiTelemetry                           |
| Resultado de negócio final de Compaction/Verifier | o chamador da Operation correspondente              | Operation Record, eventos de negócio atuais |
| Valor solicitado do Thought Level        | Session/Model Ref/override do chamador                        | ModelApiTelemetry                           |
| Valor efetivo do Thought Level           | Provider Options após o merge final + reversão do Model Catalog | ModelApiTelemetry                         |
| UID                                      | snapshot da identidade OAuth atual do App Host; pode faltar no Standalone | Telemetry Context            |
| Device MID                               | `telemetry-state.json` existente                              | RUM do App, OTel do CLI, `/event/report`    |
| Session/Turn/Trace/Query                 | Trace Context do CLI Runtime                                 | todos os registros de modelo                |

Renderer, Desktop Main e Relay não rederivam fatos de requisição ao Provider.

## 6. Modelo de registros

### 6.1 Registros em três camadas

```text
Model Operation
  |
  +--> Model API Call #1 (streamText)
  |      |
  |      +--> Physical Attempt #1
  |      +--> Physical Attempt #2
  |
  +--> Model API Call #2 (generateText fallback)
         |
         +--> Physical Attempt #1
```

Definição das três camadas:

1. Operation: expressa por `operation_id` e um caminho `operation` estável, por exemplo uma Compaction
   completa ou uma Goal Verification; Model Phases já implementadas não enviam Operation Span
   adicional. A fase de Agent Turn Trace añadirá Spans pai para Operations que de fato têm ciclo de
   vida próprio, como a Compaction.
2. `ModelApiCallRecord`: uma chamada a `ModelPort.generateText()` ou `streamText()`.
3. `ModelApiAttemptRecord`: uma requisição HTTP/SSE/WebSocket real ao Provider.

Um Agent Step normal costuma ter correspondência um-para-um entre Operation e API Call. O fallback
SSE -> HTTP da Compaction são duas API Calls na mesma Operation; o Retry interno do Adapter são
vários Attempts na mesma API Call.

### 6.2 Evolução futura dos limites de Trace

Uma Agent Session pode durar muito e conter Step, Tool e Compaction ilimitados. Transformar a Session
inteira em um Trace longo tornaria instáveis a quantidade de Spans, a memória, a amostragem e os
limites de consulta.

A Fase 1 já foi implementada com um curto Trace/Root Span por `ModelApiCallRecord`, sendo o
Physical Attempt um Child Span; a correlação entre Traces usa o próprio `session_id`, `turn_id`,
`operation_id` e `logical_call_id` do ZCode.

A estrutura alvo não é um Session Trace, nem permanecer em Model Traces isolados, mas sim:

```text
一个 Agent Turn = 一条 Trace
Turn -> Step -> Model Call -> Physical Attempt
             -> Tool Call
Turn -> Compaction -> Model Call -> Physical Attempt
```

Sidecar assíncrono, Subagent em background e Workflow Child continuam usando Trace independente + OTel Link.
O relações completo pai-filho, o ciclo de vida e o plano de migração seguem o
[Design de Observabilidade do Turn Trace do Agente CLI](./turn-trace-observability-v2.md).

## 7. Classificação de Operations

### 7.1 Caminhos estáveis

Esta seção registra os valores v1 que a Fase 1 já emite. Novos caminhos não devem continuar
expandindo nomes antigos como `sidecar.*`; os valores v2, aliases compatíveis e a ordem de migração
seguem o
[Design de Observabilidade do Turn Trace do Agente CLI](./turn-trace-observability-v2.md).

```text
agent.step
context.compaction
sidecar.session_title
sidecar.goal_title
sidecar.goal_verification
sidecar.git_commit_message
tool.web_search
tool.web_fetch
tool.read_session_context.extract
tool.read_session_context.synthesize
other
```

`operation_family` é derivado do primeiro segmento do caminho e não pode ser escrito à mão.

### 7.2 Regras de admissão no caminho

Apenas ramos limitados, estáveis e com semântica de negócio podem entrar no caminho:

- `extract` / `synthesize` podem entrar no caminho.
- `attempt_2`, `failed`, nome do modelo, ID de Provider e índice de chunk não podem entrar no caminho.
- Valores dinâmicos devem usar campos.

### 7.3 Papel de execução

`actor_kind` é ortogonal à Operation:

```text
main_agent
subagent
workflow_child
system
tool
```

`agent.step + actor_kind=subagent` representa um Step de modelo normal de um Subagent; não se usa mais
`query_source=subagent` para expressar ao mesmo tempo função e papel.

Durante a migração, o `query_source` original é mantido como campo de compatibilidade de Trace,
mapeado por um Registry estrito para `operation + actor_kind`; valores desconhecidos viram
`operation=other` e nunca viram Metrics Label diretamente.

## 8. Schema

### 8.1 Identidade e campos de correlação comuns

```text
schema_version
record_id
occurred_at

user_id_hash
identity_state
device_mid

session_id
parent_session_id
turn_id
trace_id
query_id
operation_id
logical_call_id
request_id
provider_request_id
tool_call_id

app_version
cli_version
deployment_environment
runtime_surface
```

Restrições:

- `record_id`: único por fato, usado para idempotência e deduplicação.
- `logical_call_id`: uma Model API Call.
- `request_id`: único por Physical Attempt; um Retry do Adapter precisa gerar um novo valor.
- `provider_request_id`: ID de requisição do Header/Body da resposta do Provider; registrado quando existir.
- O UID OAuth/conta original não entra em Record, no Resource OTLP nem no ambiente comum do
  subprocesso do Agente; o App Host injeta apenas SHA-256.
- `user_id_hash` é usado para correlação de usuário no ARMS; o Exporter também o mapeia como o `uid`
  da convenção de consulta existente; `identity_state=authenticated|anonymous|unavailable`.
- No Standalone, sem identidade de conta ZCode, o UID fica vazio; não se usa a string `unknown` para
  fingir um usuário.
- O Exporter mapeia `uid/rid/sid = user_id_hash/request_id/session_id`; o Schema de domínio continua
  usando os nomes completos.

Esses IDs servem apenas para consultas de detalhe de Trace/SLS, não como Metrics Label.

### 8.2 Origem da chamada

```text
operation
operation_family
actor_kind
agent_name
step_index
runtime_surface
```

`agent_name` e `step_index` ficam apenas no Trace; `operation`, `actor_kind` e `runtime_surface` podem
ser dimensões controladas de Metrics.

### 8.3 Provider e modelo

```text
provider_id
provider_kind
provider_origin
provider_route
provider_endpoint_fingerprint
endpoint_sanitizer_version
model_id
model_role
```

- `provider_id`: instância de Provider configurada pelo usuário/sistema, por exemplo `company-prod`.
- `provider_kind`: tipo real de Adapter/protocolo, por exemplo `anthropic`, `openai-compatible`.
- `provider_id` pode ter cardinalidade alta e por padrão fica apenas no Trace; `provider_kind` pode ser
  usado em Metrics.

### 8.4 Reasoning

O Schema da primeira versão ainda não foi lançado, e campos de compatibilidade `thought*` /
`reasoningEnabled` não são mantidos. Domínio comum e Telemetria usam uniformemente `reasoning`;
nomes nativos dos fornecedores como `thinking`, `reasoning_effort`, `enable_thinking` só podem
existir no Provider Adapter e na requisição de wire.

```text
reasoning_capability = supported | unsupported | unknown
reasoning_state = enabled | disabled | unknown
reasoning_control_type = none | toggle | effort | fixed_budget | adaptive | unknown
reasoning_requested_level
reasoning_effective_level
reasoning_effective_budget_tokens
```

Significado:

- `capability`: se há evidência de que o modelo suporta Reasoning; a ausência no Catalog não pode
  ser escrita como `unsupported`.
- `state`: se o Reasoning foi de fato ativado na requisição final ao Provider nesta execução.
- `control_type`: mecanismo de controle do fornecedor; `disabled` é um estado, não um mecanismo.
- `requested_level`: o nível pedido por Session/chamador.
- `effective_level`: nível reversado a partir dos Provider Options após o merge final e do Model Catalog.
- `effective_budget_tokens`: o orçamento fixo enviado ao Provider; os Provider Options originais não
  são registrados.
- O Adapter precisa primeiro projetar um único namespace de Provider a partir do `provider_kind`
  real e do `provider_options_name` do SDK, e só então resolver `state`, `control_type`,
  `effective_level` e `effective_budget_tokens`. Namespaces de outros Providers no mesmo objeto contam
  apenas como configuração não consumida e não podem participar da determinação dos fatos desta requisição.

Esses três campos são fatos ortogonais:

```text
capability：Catalog/显式配置是否证明模型具备能力
state：最终请求是否实际开启
control_type：最终请求或模型配置使用哪种控制方式
```

Assim, quando um modelo customizado não tem Catalog, pode aparecer
`capability=unknown, state=enabled, control_type=fixed_budget`; isso significa "não é possível provar a
capacidade do modelo, mas esta requisição carregava explicitamente um orçamento fixo" e não pode ser
reescrito como `unsupported` ou `disabled`. Se a declaração do modelo entrar em conflito com a
requisição final, os dois valores reais são mantidos para que o monitoramento detecte problemas de configuração.

Requisitos:

- Não normalizar à força `enabled` do GLM, `high` da OpenAI ou `xhigh` da Anthropic para níveis
  independentes de fornecedor que não existem.
- Quando o Sidecar desliga o Reasoning explicitamente, Requested e Effective precisam ser diferentes.
- Quando não for possível reverter Provider Options customizados, registrar `unknown`; nunca adivinhar
  nem escrever `disabled`.
- Quando existem múltiplos namespaces de Provider simultâneos e conflitantes, registrar apenas o
  namespace realmente consumido pelo Adapter atual; é proibido varrer recursivamente todo o `providerOptions`.
- `false` só indica evidência explícita de desligamento; fatos desconhecidos não podem ser forjados como
  `false` ou `0`.
- O OTel não aceita Attribute `null`; valores numéricos desconhecidos são omitidos, e estados de
  baixa cardinalidade usam `unknown` explícito.
- É proibido enviar os Provider Options completos.

### 8.5 Attempt e Transport

```text
transport
streaming
call_cause
previous_logical_call_id
attempt_number
max_attempts
attempt_cause
previous_request_id
retry_delay_ms
stream_recovery_number
stream_recovered_from_request_id
stream_output_committed
```

```text
call_cause = initial | transport_fallback | model_fallback | provider_fallback | recovery
attempt_cause = initial | retry
```

Fallback de Transport/Model/Provider cria um novo `ModelApiCallRecord` neste design, relacionado ao
Call anterior por `previous_logical_call_id`; somente o Retry interno do Adapter cria novos Physical
Attempts na mesma Call, relacionados por `previous_request_id`. Assim, o Fallback do Core e o Retry do
Adapter não são contabilizados como o mesmo tipo de repetição.

Campos exclusivos de Features como Compaction ficam em namespace e não poluem o Schema comum:

```text
zcode.compaction.trigger
zcode.compaction.outer_attempt
zcode.compaction.stream_output_committed
zcode.compaction.fallback_eligible
```

### 8.6 Duração

```text
duration_ms
time_to_first_provider_event_ms
time_to_first_content_ms
time_to_first_text_ms
stream_max_idle_ms
stream_stall_count
retry_delay_ms
```

Provider Event, conteúdo e texto visível ao usuário são três instantes diferentes; o CLI não afirma
que `time_to_first_text_ms` equivale ao TTFT da UI no Renderer.

### 8.7 Token e Cache

```text
input_tokens
output_tokens
reasoning_tokens
cache_read_tokens
cache_write_tokens
provider_total_tokens
computed_total_tokens
cache_observation
```

```text
cache_observation = hit | hit_and_write | write | miss | unknown
```

Quando o Provider não devolve Usage ou a requisição falha antes do Usage, o valor precisa ser `unknown`;
não pode ser registrado erroneamente como `miss`.

### 8.8 Sucesso, cancelamento e erro

```text
status
finish_reason
error_code
failure_reason
provider_error_code
http_status_code
error_message
provider_error_message
error_phase
exception_type
error_fingerprint
retryable
retry_after_ms
cancelled_by
telemetry_terminal_missing
telemetry_abandon_reason
```

```text
status = completed | error | cancelled | abandoned
error_phase = prepare | connect | response | stream | parse | postprocess
```

Restrições:

- `error_code` usa o `ModelErrorCode` do ZCode.
- `provider_error_code` guarda o código de negócio do Provider e não pode sobrescrever o código de erro unificado.
- `error_message` é a mensagem segura normalizada pelo ZCode.
- `provider_error_message` precisa ser desidentificada e truncada, no máximo 1024 caracteres.
- Mensagem de erro e stack não podem ser Metrics Label.
- Chamadas bem-sucedidas não coletam stack; o stack de erro só entra no Trace detalhado quando
  explicitamente habilitado e aprovado pela desidentificação.
- Cancelamento é contabilizado separadamente e não entra no denominador da taxa de falha de modelo.
- `abandoned` só é usado quando o terminal de observação falta por shutdown, idle TTL ou proteção
  de capacidade; não equivale a erro de Provider e precisa ser estatizado separadamente por `telemetry_abandon_reason`.
- Call que teve sucesso após Retry: `status=completed`, com `had_error=true` e `recovered_after_retry=true`
  registrados.
- Falha no pós-processamento da Operation não pode reescrever o sucesso da chamada de modelo: `call_status`
  e `operation_status` são registrados separadamente.

## 9. Sanitização do Endpoint do Provider

### 9.1 Limite de produto

A sanitização de Endpoint é totalmente interna:

- Não adiciona configuração de usuário.
- Não adiciona `telemetryRouteTemplate`.
- Não expõe nada na página de configurações.
- Não exige que o usuário entenda ou mantenha a Route de monitoramento.

### 9.2 Regras leves

```text
原始 Base URL
  |
  +--> 使用标准 URL parser
  +--> 删除 username/password
  +--> 删除 query 和 fragment
  +--> hostname 小写、删除默认端口
  +--> 对 path segment 做轻量正则替换
          email            -> {email}
          UUID             -> {uuid}
          长数字           -> {id}
          长十六进制/hash  -> {hash}
          Token 风格长串   -> {token}
  +--> 保留其余稳定 Path
  +--> 生成 origin / route / fingerprint
```

Por exemplo:

```text
https://user:pass@gateway.example.com/team-a/v1/messages?api_key=secret

provider_origin = https://gateway.example.com
provider_route  = /team-a/v1/messages
```

Se `team-a` não casar com a regex de conteúdo sensível, ele é preservado. Aqui se aceita risco baixo,
sem adicionar dicionários de tenant ou sistemas de templates específicos de Provider.

### 9.3 Performance e cache

A complexidade da sanitização é `O(length of URL)`, desprezível em comparação a uma requisição de
rede de modelo, mas mesmo assim é memoizada por configuração de Provider:

```text
cache key = provider_kind + "\0" + raw_base_url
cache value = ProviderEndpointIdentity
cache limit = 256
```

O resultado fica no LRU do Resolved Provider/dentro do processo, sem persistência em SQLite ou arquivo
de configuração. Motivo: o cálculo é barato, as regras podem evoluir, a Base URL pode mudar e a
persistência deixaria resultados de versões antigas.

Registra-se `endpoint_sanitizer_version`, para que uma evolução das regras dispare o recálculo.

O Fingerprint é baseado no `origin + route` já sanitizados; não se faz Hash sem chave da URL original,
que ainda contém segredos.

## 10. Runtime genérico e Recorder específico do modelo

### 10.1 Camada genérica

```ts
interface TelemetryRuntime {
  record(record: TelemetryRecord): void;
  flush(options: { timeoutMs: number }): Promise<void>;
  shutdown(options: { timeoutMs: number }): Promise<void>;
}
```

Responsabilidades:

- Fila em memória limitada.
- Batch Export.
- Timeout de exportação e isolamento de falhas.
- Estratégia de amostragem do P1 e limitação de taxa de alertas do P0.
- Resource Attributes.
- Snapshot local de saúde do Exporter e avisos com limitação de frequência; a métrica de self-telemetry remota fica para o P1.
- Memory Sink de teste e No-op Sink de produção.

Não é responsável por:

- Julgar erros de modelo.
- Interpretar Token/Cache.
- Identificar Compaction.
- Interpretar Provider Options.
- Sanitizar campos do domínio de modelo.

### 10.2 Camada de modelo

```ts
class ModelApiTelemetryStatusSink implements ModelStatusSink {
  publish(event: ModelNetworkStatusEvent): void;
}
```

O Recorder mantém um estado mínimo em memória até Call/Attempt fecharem, gerando então um Terminal
Record imutável. O OTel Sink mapeia o Terminal Record em um Span com timestamps explícitos de início e fim.

Esse design evita que Core/Adapter segurem objetos Span do OTel e evita que o Context do OTel atravesse
Async Generator, ferramentas e Fallback e contamine o código de domínio.

### 10.3 TelemetryRecord

```ts
type TelemetryRecord = ModelApiCallRecord | ModelApiAttemptRecord | TelemetryExporterHealthRecord;
```

Não é `Record<string, unknown>`.

## 11. Injeção pelo App e inicialização pelo Standalone

```text
App-launched
  Host resolve config/identity
       |
       +--> spawn env / startup config
                    |
                    v
Standalone ------> async identity prepare
                    |
                    v
                  CLI Telemetry Bootstrap
                    |
                    +--> TelemetryRuntime
                    +--> ModelApiTelemetry
                    +--> OTLP Exporter
```

A inicialização de identidade de arquivo do Standalone pertence ao I/O de inicialização do CLI, e
não à fábrica síncrona de Telemetria:

```text
headless / TUI / protocol async entry
  |
  +--> prepareModelTelemetryEnv()
         |
         +--> endpoint disabled/missing ----------> 原 env（零文件 I/O）
         |
         +--> host 已注入 device_mid ------------> 原 env（零文件 I/O）
         |
         +--> async read telemetry-state.json
                |
                +--> existing device_mid ---------> 注入启动 env
                |
                +--> async lock + atomic rename --> 注入新 device_mid
                |
                +--> I/O failure -----------------> identity unavailable
  |
  +--> synchronous createZCodeApp()
         |
         +--> synchronous createModelTelemetry()（只消费已准备的 env）
```

Preparações concorrentes no mesmo processo para o mesmo arquivo de estado compartilham um Promise; entre
processos continua-se reutilizando `telemetry-state.lock`, a detecção de owner obsoleto e o rename
atômico. Falha de I/O de identidade precisa ficar em bypass, no máximo resultando em
`identity_state=unavailable`, sem bloquear a criação do App ou a primeira requisição de modelo. Hosts
que incorporam e chamam o `createZCodeApp()` síncrono diretamente são responsáveis por injetar a
identidade; as entradas oficiais headless, TUI e de protocolo executam a preparação assíncrona de forma unificada.

Prioridade de configuração:

1. `TelemetryRuntime`/Sink injetado explicitamente, para teste ou incorporação no processo.
2. Configuração OTLP injetada pelo App.
3. Variáveis de ambiente/configuração do CLI Standalone.
4. No-op.

A Fase 1 usa as variáveis de ambiente padrão do OTel, sem adicionar UI de configuração ao usuário:

```text
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT   # 优先，完整 /v1/traces 地址
OTEL_EXPORTER_OTLP_ENDPOINT          # 次选，CLI 自动追加 /v1/traces
OTEL_EXPORTER_OTLP_TRACES_HEADERS    # 优先于 OTEL_EXPORTER_OTLP_HEADERS
OTEL_SERVICE_NAME                    # 默认 zcode-cli-agent
OTEL_RESOURCE_ATTRIBUTES
ZCODE_MODEL_TELEMETRY_ENABLED        # false/0/off/disabled 可强制关闭
```

O Desktop main só repassa de forma direcionada a configuração OTLP dentro da allowlist ao host e
descarta o UID hash, Identity State, Device MID e Runtime Surface vindos de fora, evitando falsificação
de identidade por variáveis de ambiente. O Host captura a configuração OTLP imediatamente ao
inicializar os services e a remove do `process.env` comum; na inicialização do Agente ela é injetada
novamente e o bootstrap do CLI a captura e também a remove. Assim, Headers de autenticação não chegam a
Bash, MCP ou subprocessos de ferramentas. O UID do Desktop, lido do Perfil OAuth, é pseudonimizado com
SHA-256 dentro do Host, e o valor original não cruza a fronteira do Agente; esse hash continua sendo um
identificador correlacionável, não um dado anônimo. O Device MID reaproveita o `telemetry-state.json`
já existente no App.

O `ZCODE_ARMS_RUM_ENDPOINT` embutido hoje no App é `/rum/web/v2` e não permite deduzir o endereço OTLP
nem reutilizar a autenticação do RUM. O ambiente de implantação precisa fornecer separadamente o
Endpoint/Header OTLP do Workspace ARMS de destino; na ausência deles o novo caminho é explicitamente
No-op, e o RUM original, o SQLite e o `/event/report` continuam rodando.

### 11.1 Entrega de configuração do pacote oficial do Desktop

O pacote oficial não pode depender de o usuário iniciar pelo Terminal nem ler o `.env` do repositório de
desenvolvimento. O pipeline de build injeta os valores padrão de implantação no Desktop Main por meio
das variáveis dedicadas abaixo:

```text
ZCODE_PACKAGED_AGENT_OTEL_ENDPOINT
ZCODE_PACKAGED_AGENT_OTEL_HEADERS
ZCODE_PACKAGED_AGENT_OTEL_SERVICE_NAME   # 可选，默认 zcode-cli-agent
```

Elas são usadas apenas para construir o Desktop Main e não são expostas como variáveis genéricas
`OTEL_*` para o pnpm, o electron-builder ou outros subprocessos de build. Em tempo de execução são
mapeadas para os campos padrão já suportados pelo Agente:

```text
ZCODE_PACKAGED_AGENT_OTEL_ENDPOINT     -> OTEL_EXPORTER_OTLP_ENDPOINT
ZCODE_PACKAGED_AGENT_OTEL_HEADERS      -> OTEL_EXPORTER_OTLP_HEADERS
ZCODE_PACKAGED_AGENT_OTEL_SERVICE_NAME -> OTEL_SERVICE_NAME
```

```text
GitLab CI variables（Header 必须 masked）
  |
  +--> Desktop tsup build
         |
         +--> packaged deployment defaults（Main bundle）
                |
                +--> Desktop Main
                       |
                       +--> Host（仅连接配置）
                              |
                              +--> Agent（连接配置 + 可信身份）
                                     |
                                     +--> OTLP/HTTP -> ARMS
```

Restrições de configuração:

- Endpoint e Headers precisam existir juntos; ao configurar apenas um, o build falha, proibindo publicar
  um pacote que "parece habilitado, mas na verdade não consegue autenticar".
- Builds comuns de desenvolvimento/MR permanecem No-op quando nada é configurado; builds de
  `release/current` e de Tag também falham quando falta completamente a configuração, evitando que o
  pacote oficial caia silenciosamente em No-op.
- O Endpoint precisa ser uma URL HTTP(S); a publicação oficial usa HTTPS.
- Os valores padrão do pacote têm prioridade menor que o `OTEL_*` explícito em tempo de execução, para
  facilitar diagnóstico de operação e sobrescrita em ambientes isolados.
- As variáveis de build só podem produzir Endpoint, Headers e Service Name; não podem carregar UID,
  Device MID, Session ou outra identidade de runtime.
- O Header no CI precisa ser uma masked variable, nunca gravada no repositório, no log de build ou no
  manifesto de artefatos; depois que a branch de release alvo ativar protected branch no GitLab, as
  variáveis também passam a ser protected.
- A credencial de ingestão no cliente Desktop pode ser extraída pelo usuário local, portanto só pode ser
  uma credencial de escrita de baixo privilégio e rotacionável, sem permissão de consulta ou
  administração. A solução de longo prazo deve migrar para um Collector/Gateway controlado com credenciais de curta duração.
- O CLI Standalone continua lendo apenas o `OTEL_*` padrão e não herda implicitamente os valores padrão
  de implantação do pacote do Desktop.

Restrições:

- Uma execução do CLI só pode ter um Owner do OTel Exporter.
- O Main do App só passa configuração de Endpoint/Auth/Resource, e o Host injeta a Identidade confiável;
  o resultado da injeção é configuração, não um objeto do SDK RUM do Electron.
- O CLI envia direto ao ARMS OTel, sem passar pelo Renderer e sem IPC item a item pelo Host/Main.
- A identidade UID é um snapshot de inicialização; se o produto exigir troca de conta sem reiniciar o
  CLI, um Identity Update será adicionado depois por um protocolo estrito, sem adivinhações no P0.
- SSH/WSL/Docker remotos precisam transmitir a configuração de forma explícita e segura; não se assume
  que o ambiente do processo local chegue sozinho ao remoto.
- Relay/Main não mantêm estado de Model Call.

## 12. ARMS do App e ARMS do CLI

```text
同一个阿里云账号 / ARMS Workspace
  |
  +--> zcode-desktop-rum
  |      SDK: @arms/rum-electron
  |      Endpoint: /rum/web/v2
  |      范围: crash / JS error / UI / longTask / main-renderer network
  |
  +--> zcode-cli-agent
         SDK: minimal OpenTelemetry trace packages（Metrics 为 P1）
         Endpoint: OTLP
         范围: Model API / Agent Runtime
```

Os dois lados compartilham atributos de correlação:

```text
device_mid
user_id_hash / uid
session_id
turn_id
app_version
cli_version
deployment_environment
runtime_surface
```

É proibido enviar dados do CLI para o Endpoint RUM `/rum/web/v2` existente.

## 13. Revisão de performance, memória, CPU e rede

### 13.1 Quantidade de eventos no caminho quente

Uma chamada de modelo bem-sucedida:

```text
1 个 ModelApiCall Terminal Record
1 个 ModelApiAttempt Terminal Record
0 个逐 Chunk Record
```

Um Span do OTel é exportado uma única vez, depois de iniciar e fechar localmente. Os estados
`started/completed` atuais ainda podem atender a UI, mas o novo OTel não os converte individualmente
em Custom Events de rede separados.

Um Retry acrescenta apenas um Attempt Span de forma linear; `retry_scheduled` e `stream_stalled` são
preferidos como Event do Attempt Span ou campo agregado, sem criar um Trace separado.

### 13.2 CPU síncrona

Permitido na thread de negócio:

- Leitura de relógio monotônico/de parede.
- Poucas contagens inteiras.
- Cópia de campos de objetos pequenos.
- Busca em Map.
- Leitura do cache de Endpoint Identity.
- Enfileiramento do Terminal Record.

Proibido na thread de negócio:

- Requisições de rede.
- I/O de arquivo.
- JSON stringify de objetos grandes.
- Varredura de Payload de Prompt/Message/Tool.
- Geração de stack em chamada bem-sucedida.
- Alocar Telemetry Record para cada SSE Chunk.

Metas de aceitação do design:

| Item                          | Meta        |
| ----------------------------- | ----------- |
| Tempo síncrono de `record()` P95 | `< 0.5ms`   |
| Tempo síncrono de `record()` P99 | `< 1ms`     |
| Incremento de CPU em regime estável com 10 calls/s | `< 1%` de um core |
| Atraso síncrono adicional de TTFT | `< 1ms`     |

Esses são orçamentos de aceitação. Os resultados medidos da implementação atual estão em 13.7.

### 13.3 Memória

Sugestão de limite duplo:

```text
completed record queue: 2000 records 或 4 MiB，先到者生效
active call/attempt state: 1000 handles
endpoint identity cache: 256 entries
```

Quando a fila está cheia:

```text
丢弃 Telemetry
增加 telemetry_dropped_total
限频 warn
继续 Agent 业务
```

O Consumer Close comum da mainstream, para preservar o ciclo de vida direct-continuous existente, não
adiciona abort/terminal novo; o Recorder evita crescimento permanente com limpeza preguiçosa de 30
minutos e um teto de 1000 entradas, descartando a Call pendente mais antiga. O fluxo Compact oculto
continua abortando e fechando no Consumer Close.

Metas de aceitação do design:

| Item                                  | Meta                                                       |
| ------------------------------------- | ---------------------------------------------------------- |
| Incremento de RSS em regime estável de Queue/Recorder | `< 10 MiB`                                                  |
| 30 minutos com Exporter em falha      | a memória continua limitada pelo teto rígido               |
| Estado de uma chamada bem-sucedida    | não guarda os objetos originais de Prompt, Response, Header ou Provider Metadata |

A memória de baseline do próprio SDK do OTel precisa ser medida separadamente, sem confundir com as
métricas de Queue.

### 13.4 Rede

Sugestão padrão de Batch:

```text
max_batch_size = 100 spans
flush_interval = 5s
export_timeout = 3s
shutdown_flush_timeout = 1~2s
```

O batching e a compressão OTLP precisam estar habilitados; é proibido enviar um HTTP por Record.

Metas do design:

- O caminho de sucesso contém apenas escalares e strings curtas.
- Não enviar Prompt, Headers, Body, Raw Usage JSON nem Raw Provider Metadata.
- Meta de Telemetria não comprimida de uma Model API Call normal: `< 4 KiB`; para Call com erro/Retry: `< 8 KiB`.
- A taxa real de compressão, o volume diário de chamadas e a fatura do ARMS são medidos por amostragem
  em canário, não por suposição estática.

Fórmula de capacidade:

```text
daily_raw_bytes ~= call_count * avg_call_record_bytes
                + attempt_count * avg_attempt_record_bytes
```

Na Fase 1 isso é exposto em `health()` dentro do processo, e no P1 enviado para um canal separado de
Metrics/Health:

```text
telemetry_export_bytes_total
telemetry_export_batches_total
telemetry_export_failures_total
telemetry_dropped_total
telemetry_queue_size
```

### 13.5 Inicialização e tamanho do pacote

O CLI/SEA atual não tem o SDK completo do OTel como dependência direta de produção. Na implementação
é preciso adicionar a dependência explicitamente, sem depender de dependências transitivas do Vitest
ou do AI SDK.

Recomenda-se usar o conjunto mínimo de pacotes e Spans manuais, sem habilitar a Auto Instrumentation
completa do Node:

- Evita coletar duas vezes requisições do AI SDK/fetch.
- Evita trazer Spans automáticos irrelevantes de arquivo, DNS, HTTP etc.
- Reduz o tamanho do pacote/CLI SEA, a CPU e a memória de inicialização.

Quando a Telemetria não está configurada, a inicialização é adiada ou permanece No-op, sem criar
Batch Worker. O MR de implementação precisa reportar:

- Variação do tamanho minificado de `dist/zcode.cjs`.
- Variação do tamanho do binário SEA.
- Variação do tempo de inicialização de `zcode --help` standalone e do primeiro Prompt.
- Baseline de RSS com Telemetry disabled/enabled.

Não é recomendável implementar um protocolo OTLP não padrão para reduzir o tamanho; use primeiro o SDK
oficial mínimo e só avalie alternativas se a medição mostrar que o tamanho é inaceitável.

### 13.6 Comportamento em falha do ARMS

```text
ARMS timeout/down/rate limit
  |
  +--> 每个 Flush 周期至多一次失败请求
  +--> Queue 达上限后丢弃
  +--> 本地限频日志 + 自监控计数
  +--> Agent 模型调用完全不受影响
```

O Exporter não pode fazer retry infinito, gravar em disco sem limite, bloquear a saída do processo ou
lançar exceção para quem chamou o modelo. A Fase 1 não reimplementa o retry interno do SDK na camada
externa do CLI; batches com falha são descartados, o restante da fila fica para o próximo Flush e, no
shutdown, o fechamento respeita um timeout total.

### 13.7 Resultados medidos da Fase 1

Ambiente de teste: macOS arm64, Node.js 24.14.0; tempos e RSS são microbenchmarks locais, e CI/máquinas
de produção precisam continuar com reavaliação em canário.

| Item                                                             | Medido | Conclusão |
| ---------------------------------------------------------------- | -----: | --------- |
| 10.000 Calls completas (started + completed + 2 records), P50 síncrono | `0.0022ms/call` | abaixo do orçamento |
| o mesmo P95 / P99                                              | `0.0046ms` / `0.0095ms` | abaixo dos orçamentos `0.5ms` / `1ms` |
| RSS / incremento de heap da fila padrão de 2.000 model Records | `6.20MiB` / `2.16MiB` | abaixo do orçamento de Queue/Recorder `10MiB` |
| import a frio do módulo Telemetry / create com disabled        | `26.6ms` / `0.089ms` | OTel adiado até o primeiro Export real, sem inicialização no caminho quente disabled |
| Create enabled (identidade já injetada)                        | `0.234ms` | cria apenas Runtime/Recorder limitado, sem rede |
| Primeira criação do device state standalone, P50/P95            | `0.286ms` / `0.354ms` | baseline síncrono histórico; hoje movido para a entrada assíncrona, reutilizando o lock existente e sem sobrescrever estado de negócio |
| Leitura quente do device state standalone, P50/P95              | `0.014ms` / `0.017ms` | baseline síncrono histórico; hoje é I/O de inicialização assíncrono, fora do caminho quente do modelo |
| Primeiro carregamento do OTel + Export de 2 Spans + shutdown    | `93.0ms`, RSS `+18.0MiB` | ocorre em Flush/saída em background, sem entrar no TTFT do modelo |
| Protobuf OTLP de 1 Call + 1 Attempt                             | `3,456B` sem compressão, gzip `1,159B` | carga de rede de um batch com 1 Call fica em torno de `1.13KiB` |
| `dist/zcode.cjs`                                                | `19,037,591B -> 20,146,129B`, `+1,108,538B` (`+5.82%`) | o SDK oficial mínimo do OTel é o principal incremento |
| SEA darwin-arm64                                                | `181,513,504B -> 182,629,792B`, `+1,116,288B` (`+0.62%`) | incremento geral do SEA é aceitável |
| Inicialização a frio de `--help`, P50 (30 execuções)              | `290.2ms -> 295.0ms`, `+4.8ms` | ruído de agendamento elevado, sem regressão da média; continuar rastreando no CI |

A 10 calls/s, apenas o tempo síncrono do Recorder em P95 equivale a cerca de `0.046ms CPU/s`, ou seja,
`0.0046%` de um core; essa é apenas uma estimativa do caminho quente e não substitui a observação de CPU
e de protobuf/gzip em background em produção.

Para controlar o custo com disabled, o `LazyOtlpTelemetryRecordExporter` só carrega o OTel
 dinamicamente no primeiro Batch não vazio. Com o Exporter fora do ar, cada ciclo de Flush de 5 segundos
inicia no máximo uma requisição com falha; a fila descarta por 2.000 entradas ou 4MiB, o que vier
primeiro, e o Flush de shutdown mais o shutdown do SDK compartilham um timeout total.

## 14. Revisão de intrusividade no código

### 14.1 Mudanças reais

| Camada               | Principais mudanças                                                                  | Intrusividade                        |
| -------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ |
| `@zcode/contracts`   | Operation Registry, Typed Observation, Call/Attempt/Error Records, interface de Sink  | concluída; só tipos/Schema, sem dependência de ARMS |
| Model Adapter        | ciclo de vida do Attempt, Provider/Endpoint/Thought/Usage finais, complemento de erros | média; concentrada em runner/status/options |
| Core Runtime         | pontos de chamada de Step/Compaction/Verifier/Title passam a informar `operation` e o resultado da Operation | baixa a média; cerca de dez entradas semânticas |
| Tool Handlers        | WebSearch/WebFetch/ReadSessionContext passam a ter Operation estrita                | baixa                                 |
| Bootstrap            | cria TelemetryRuntime/Recorder/Composite Sink; injeta Adapter/Runtime               | média                                 |
| CLI Entry            | configuração standalone, Flush/Shutdown                                             | baixa a média                         |
| Services Host        | configuração de spawn do App e injeção de identidade                               | baixa; o P0 não precisa de encaminhamento de protocolo por evento |
| Desktop/UI           | permanece como está durante o double write; adiciona Feature Flag/reconciliação de migração | baixa                       |
| SQLite               | sem migração de tabela no P0; a integração mantém a escrita atual                   | baixa                                 |

### 14.2 Designs-chave que evitam intrusividade

Na Fase 1, os pontos de chamada apenas declaram semântica; após a integração do v2, o `actorKind` é
herdado automaticamente do Scope atual:

```ts
model.generateText({
  ...request,
  modelCall: {
    operation: Operation.SessionTitleGeneration,
  },
});
```

Fatos comuns são preenchidos de forma centralizada pelo Adapter, e os pontos de chamada não processam
Provider, Endpoint, Thought, Token, Cache e erros de forma duplicada.

`modelCall` é um campo interno do ZCode e precisa ser removido pelo Adapter ao construir a requisição do
AI SDK, sem ser enviado ao Provider.

### 14.3 Resultado do tratamento dos problemas estruturais da Fase 1

1. `publishModelStatus()` passou a fazer fan-out independente para sinks de request/global; o erro de
   qualquer um dos sinks é registrado em bypass e o outro ainda recebe o evento.
2. O evento de conclusão de streaming foi completado com Usage final, Finish Reason, primeiros
   Provider Event/Content/Text, Stall e Output Commit.
3. O evento de status Failed passou a carregar o `error_code` unificado, o código/mensagem de negócio do
   Provider, o status HTTP, o Request ID, a fase e o tipo da exceção.
4. `query_source` é mapeado por um Registry estrito; valores desconhecidos só entram em `other`.
5. Chamadas de modelo internas às ferramentas já geram Call/Attempt no ARMS; a unificação de longo prazo
   do logical usage no SQLite continua para a Fase 3.
6. Title/Git Commit marcam explicitamente Effective Disabled; outras chamadas reutilizam os Provider
   Options finais e o Model Catalog.
7. Retry do Adapter usa múltiplos Request IDs; o Transport Fallback da Compaction se relaciona por
   `previous_logical_call_id`; o Stream Recovery usa `stream_recovered_from_request_id`, o número de
   recuperação e a correlação pela mesma Session/Turn.

### 14.4 Implementações não recomendadas

- Escrever `arms.sendCustom()` à mão em cada Call Site.
- Reenviar o Evento de Telemetria completo por IPC do Renderer/Main.
- Fazer a Row do SQLite servir diretamente como Schema do OTel.
- Fazer o Model Adapter depender do Electron, do ARMS RUM ou de um Service do Host.
- Carregar todos os campos customizados de Telemetria em um `metadata: Record<string, unknown>` arbitrário.
- Fazer `await` do Export real no caminho de negócio.

## 15. Metrics e critérios estatísticos

### 15.1 Contagens básicas

```text
model_api_calls_total
model_api_attempts_total
model_api_errors_total
model_api_cancellations_total
model_api_retries_total
model_api_retry_recovered_total
model_api_fallbacks_total
model_api_tokens_total
model_api_cache_read_tokens_total
model_api_cache_write_tokens_total
```

### 15.2 Fórmulas

```text
Logical Call 成功率 = completed / (completed + error)

Attempt 成功率 = completed attempts / (completed attempts + failed attempts)

物理请求放大率 = physical attempts / model API calls

Retry 恢复率 = completed-after-retry / retried calls

Cache Call 命中率 = hit calls / cache-observable calls

Cache Token 命中率 = sum(cache_read_tokens) / sum(input_tokens)
```

O cancelamento é contabilizado separadamente e não entra no denominador da taxa de falha padrão.

### 15.3 Metrics Label

Permitido:

```text
operation
operation_family
actor_kind
provider_kind
transport
status
error_code
runtime_surface
deployment_environment
```

Não permitido por padrão:

```text
user_id_hash / uid
device_mid
session_id
turn_id
trace_id
logical_call_id
request_id
provider_request_id
provider_id
agent_name
error_message
provider_route
```

`model_id` só pode entrar em Metrics depois de passar por uma allowlist de modelos conhecidos/orçamento
de cardinalidade; caso contrário, serve apenas para consultas de Trace/SLS.

## 16. Organização dos dados no ARMS

Não criar tabelas separadas para `step/compact/title/tool`. Usa-se um único OTel Service:

```text
service.name = zcode-cli-agent
span.name = zcode.model.call
span.name = zcode.model.attempt
span.name = zcode.model.operation
```

A classificação é feita por campos como `operation`, `actor_kind` e `transport`. Os dados de Trace ficam
no armazenamento hospedado pelo ARMS; se no futuro for preciso uma tabela larga de longo prazo ou análise
offline fixa, gera-se um Logstore derivado por SLS Scheduled SQL, o que não é pré-requisito do P0.

## 17. Dashboards e alertas

### 17.1 Dashboards

1. Visão geral: volume de Call/Attempt, sucesso Logical/Attempt, P50/P95/P99, TTFT, Token.
2. Provider/Model: Provider Kind, Provider ID, Model, Thought Level.
3. Compaction: sucesso SSE, HTTP Fallback, Outer Retry, commit da Operation.
4. Retry/Error: códigos de erro unificados, códigos de erro do Provider, status HTTP, taxa de recuperação de Retry.
5. Cache: acerto em Call, acerto em Token, Cache Write.
6. Surface: Desktop, Standalone, Remote, Automation.
7. Telemetry Health: Queue, Drop, falha de Export, bytes exportados.

### 17.2 Alertas

- Os alertas precisam ter tamanho mínimo de amostra, para evitar falso positivo em tráfego baixo.
- Taxa de sucesso, P95, 429, 5xx, Timeout e Context Exceeded geram alertas separados.
- Falha do Exporter alerta apenas a cadeia de monitoramento e não provoca falha do Agente.
- A primeira fase coleta a baseline, sem definir SLO de negócio no escuro.

## 18. Amostragem e custo

P0:

- Logical Call Terminal, Error, Cancel, Retry e Fallback em 100%.
- Attempt Terminal em 100%, para primeiro estabelecer uma baseline real e reconciliar com `plan_request`.
- Sem relatório por Chunk.

Com a baseline estável:

- Chamadas/Erros/Duração/Tokens exatos usam Metrics sem amostragem ou Fatos Terminais completos.
- Traces de sucesso detalhados podem ser amostrados.
- Traces de Error/Cancel/Retry/Fallback continuam em 100%.
- Não se pode calcular taxa de sucesso exata a partir de Traces de sucesso já amostrados.

## 19. Roteiro de migração

### Fase 0: Spec e contrato (concluída)

- Congelar Operation Registry, Schema, privacidade e orçamentos de performance.
- Adicionar Golden Schema/Privacy Tests.

### Fase 1: integração em bypass (código concluído, aguardando canário no ARMS)

- Adicionar TelemetryRuntime e ModelApiTelemetry.
- Coletar em bypass a partir do Model Status/Usage existente.
- Manter inalterados o `plan_request` do RUM, o SQLite e o `/event/report`.
- O OTel do ARMS usa um Service separado.

### Fase 2: double write e reconciliação

Comparar:

- Quantidade de Started/Terminal/Attempt.
- Provider/Model/Transport.
- Completed/Error/Cancelled.
- Duration/TTFT.
- Token/Cache.
- Retry/Fallback.

Escalar em canário 1% -> 10% -> 100%, observando Drop do Exporter, CPU, RSS, rede e fatura.

### Fase 3: unificação da produção de fatos

- O SQLite `model_usage` passa a ser dirigido pelo Model Call Terminal Fact unificado.
- O RUM `plan_request` vira Exporter compatível ou para de reportar.
- O retry/debug da UI continua consumindo a projeção segura, sem depender do ARMS.

### Fase 4: remoção de cadeias duplicadas

- Depois que a reconciliação estabilizar e a migração dos dashboards antigos for confirmada, parar de
  reprodzir `plan_request` no Renderer.
- Manter `plan_ttft`, UI Perf, `/event/report` de negócio e logs locais.
- Avaliar se domínios como Tool/RPC reutilizam o TelemetryRuntime genérico, sem forçar um Schema de
  Modelo compartilhado.

## 20. Matriz de estados de falha e degradação

| Cenário                              | Comportamento do Agent     | Comportamento da Telemetria                              |
| ------------------------------------ | -------------------------- | --------------------------------------------------------- |
| OTLP não configurado                 | funcionamento normal       | No-op; SQLite mantido                                     |
| Timeout de rede do ARMS              | funcionamento normal       | no máximo uma requisição com falha por ciclo de Flush; batches com falha descartados |
| Fila cheia                           | funcionamento normal       | descartar registros novos/velhos conforme a política da implementação; incrementar Drop Counter |
| Falha na sanitização do Endpoint     | funcionamento normal       | manter Provider Kind/ID; campos de Endpoint ausentes      |
| Falha na reversão do Thought         | funcionamento normal       | Effective=`unknown`                                       |
| Usage do Provider ausente            | funcionamento normal       | Token pode faltar; Cache=`unknown`                        |
| UID ausente                          | funcionamento normal       | Identity=`anonymous/unavailable`                         |
| Falha no fechamento de Span/Record   | funcionamento normal       | log local com limitação de frequência, sem lançar ao chamador |
| Saída anormal do CLI                 | o processo sai             | apenas Flush limitado, sem impedir a saída               |
| Remoto semconfiguração OTLP          | Agente remoto funciona normalmente | No-op/Usage local, sem retransmitir pelo Main |

A Fase 1 não adiciona "tabelas" no ARMS: `zcode.model.call` e `zcode.model.attempt` são dois tipos de
Span sob o mesmo `service.name=zcode-cli-agent`, e volume, taxa de sucesso, percentis de duração e
Token/Cache são agregados a partir dos atributos do Span. Uma tabela larga fixa só é criada no lado SLS,
via Logstore derivado/SQL agendado, sem mudar o Schema do CLI.

## 21. Dimensões e podagem

### 21.1 Domínios principais

| Domínio                      | Incluído   | Motivo                                              |
| ---------------------------- | ---------- | ---------------------------------------------------- |
| Model/Provider Runtime       | sim        | fonte de fato de modelo, Thought, Transport e Retry  |
| Monitoring/Telemetry/Usage   | sim        | limites de ARMS, SQLite, RUM e `/report`            |
| Architecture/Process         | sim        | injeção do App, auto-inicialização do CLI, fronteira remota |
| Persistence                  | cobertura representativa | sem migração de tabela no P0; apenas garantir que o SQLite existente não regrida |
| Conversation/UI              | cobertura representativa | só validar a projeção segura e que os eventos atuais não quebrem, sem explorar todas as combinações de estado |

### 21.2 Dimensões-chave

| Dimensão        | Valores                                                       |
| --------------- | ------------------------------------------------------------- |
| Operation       | `agent.*` / `context.*` / `sidecar.*` / `tool.*`             |
| Actor           | main / subagent / workflow / system / tool                   |
| Transport       | HTTP / SSE / WebSocket                                       |
| Outcome         | completed / error / cancelled                                |
| Attempt         | initial / retry / recovery / fallback                        |
| Cache           | hit / write / miss / unknown                                 |
| Thought         | disabled / toggle / effort / budget / adaptive / unknown     |
| Surface         | Desktop / Standalone / Remote / Automation                   |
| Telemetry State | enabled / disabled / exporter down / queue full              |

### 21.3 Princípios de podagem

- Não fazer o produto cartesiano Operation × todos os Providers × todos os Models; escolher
  representantes por família de protocolo de Provider e por tipo de controle de Thought.
- Não combinar todos os valores de Session/Turn ID; apenas verificar existência, correlação e que alta
  cardinalidade não entra em Metrics.
- Não enumerar cada Streaming Chunk; cobrir apenas primeiro conteúdo, Stall, término natural, falha
  anterior à saída e falha após commit.
- `desktop-continuous` e `web-remote-replayable` da UI não compartilham a semântica de reporte de rede
  real; os fatos de requisição de modelo do próprio CLI são independentes do replay da UI.
- O Path do Endpoint cobre apenas padrões obviamente sensíveis e Path comum estável, sem construir uma
  matriz complexa de templates de tenant.

## 22. Checklist de verificação

### 22.1 Testes unitários

- Operation Registry e mapeamento de Query Source.
- Sanitização de Endpoint: userinfo/query/fragment, e-mail, UUID, números longos, Hash, preservação de Path comum.
- Acerto, limite e versão do cache de Endpoint.
- Requested/Effective Thought: OpenAI, OpenAI-compatible, Anthropic Fixed/Adaptive, GLM Toggle, DeepSeek/Kimi, Sidecar Disabled.
- Error Code, Provider Code, status HTTP, desidentificação e truncamento de Message.
- `hit/write/miss/unknown` de Cache.
- Allowlist de Metrics Label.
- Limite de Queue, Drop, log com limitação de frequência e Flush Timeout.

### 22.2 Testes do Adapter

- Generate Success/Error/Cancel/Retry.
- Stream Success, TTFT, Usage, Stall, Consumer Close.
- Cada Physical Attempt usa um novo Request ID.
- O Request Sink e o Global Telemetry Sink recebem o evento simultaneamente e sem duplicação.
- Falha do Exporter não afeta o resultado do modelo.

### 22.3 Testes de Operation

- Main/Subagent/Workflow Child usam o mesmo `agent.step`, com Atores diferentes.
- Sucesso de Compaction via SSE.
- Falha da Compaction antes do primeiro conteúdo com HTTP Fallback.
- Falha da Compaction depois de conteúdo já submetido e sem fallback.
- Falha de modelo do Goal Verifier separada do resultado de Operation fail-open.
- Effective Thought Disabled em Title/Git Commit.
- WebSearch/WebFetch/ReadSessionContext gerando todos Call/Attempt Facts.

### 22.4 Testes de integração

- Fake OTLP Collector recebendo Spans em batch.
- Injeção pelo App e inicialização pelo Standalone só podem habilitar um Exporter.
- Com disabled, nenhum Worker é carregado e nenhuma requisição é enviada.
- Com ARMS fora do ar, timeout, 429 e fila cheia, o Agent completa normalmente.
- Reconciliação de contagem do double write entre `plan_request` do RUM do App e o OTel.
- Resultados de Usage no SQLite sem regressão.
- Limites de configuração e identidade em local/SSH/WSL/Docker.
- Comportamento de URL, shutdown e signal em Windows/macOS/Linux.
- O Agente do Desktop precisa concluir `prepare:desktop-runtime` em um ambiente limpo sem
  `apps/zcode-cli/packages/telemetry/dist`; o build pnpm comum e o build tsc de
  `bootstrap:with-remote` precisam compartilhar a mesma lista de dependências de `cliWorkspaceBuilds` em
  `scripts/build-desktop-agent-cli.mjs`, mantendo a ordem
  `@zcode/contracts -> @zcode/telemetry -> @zcode/bootstrap`. É proibido depender de dist residual da máquina de desenvolvimento.

### 22.5 Testes de performance

- CPU/RSS do caminho de sucesso com 10 calls/s.
- Tempestade de Retry/Error.
- 30 minutos de Exporter fora do ar.
- Limpeza de 1000 handles ativos/pendentes.
- Tempo de inicialização e tamanho de pacote do CLI com disabled/enabled.
- Tamanho real de batch OTLP, taxa de compressão e estimativa de volume diário.

### 22.6 Resultados da verificação local da Fase 1

Validado em 2026-07-22 com Node.js 24.14.0:

- `@zcode/telemetry`: 6 arquivos / 21 testes passando, incluindo Span pai-filho de Call/Attempt, Fake
  OTLP Collector local real, protobuf com gzip, fila, lock, desidentificação de erro e sanitização de Endpoint.
- `@zcode/adapters`: 55 arquivos / 775 testes passando, 2 ignorados; incluindo mapeamento de Thought por
  Provider, fan-out de sink request/global e regressão completa do runner.
- `@zcode/contracts`: 22 arquivos / 179 testes passando; testes de Operation Registry e Schema passando.
- Compaction/Streaming relevantes do Core: 2 arquivos / 104 testes passando.
- Workflow/Model Catalog do Bootstrap: 3 arquivos / 10 testes passando.
- Injeção de configuração de Shared/Services/Desktop: 3 arquivos / 29 testes passando.
- `pnpm typecheck` da raiz do repositório passando; `pnpm lint` com 0 erro (52 warnings pré-existentes).
- Smoke test de build/inicialização do CLI CJS e do SEA darwin-arm64 passando.

O Core completo ainda tem 8 falhas de baseline do repositório sem relação com este recurso, incluindo
caminhos externos de máquina local fixados no código, limites existentes de I/O/número de linhas de
módulo, asserções de Subagent/WebFetch/Workflow e três asserções de persistência/timing; todos os casos
direcionais relevantes a esta rodada passaram.

## 23. Accepted Cases

| Case ID       | Setup                                        | Action                              | Assertions                                                                          | Evidence                           |
| ------------- | -------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------- |
| MODEL-OBS-001 | Standalone, OTLP enabled                     | Main Agent conclui uma chamada de modelo | 1 Call + 1 Attempt; Provider/Model/Thought/Token/ID completos                      | Fake Collector + Memory Sink       |
| MODEL-OBS-002 | um Retry do Adapter                          | primeiro 429, segundo com sucesso  | Logical completed; Attempt error+success; recovered=true                            | Span + Error Fields                |
| MODEL-OBS-003 | falha de SSE na Compaction                   | falha antes do primeiro conteúdo e HTTP Fallback | dois Calls na mesma Operation; Operation final committed                | Span + Runtime Event               |
| MODEL-OBS-004 | Stream já com conteúdo                       | falha de conexão no meio           | `stream_output_committed=true`, sem replay incorreto                                | Span + Provider Fixture            |
| MODEL-OBS-005 | Goal Verifier                                | falha de modelo com fail-open      | Call error; Operation fail_open                                                     | Span + Runtime Result              |
| MODEL-OBS-006 | Title de Sidecar                             | Session Thought=high               | Requested=high, Effective=disabled                                                  | Span + Final Provider Options      |
| MODEL-OBS-007 | Exporter fora do ar                          | o modelo retorna normalmente       | negócio bem-sucedido, Queue limitado, falha de Export crescendo                    | Result + Health Metrics            |
| MODEL-OBS-008 | iniciado pelo App                            | Host injeta configuração e identidade | OTel do CLI ativo, RUM ainda funcionando, sem Exporter duplicado                   | Process Env + Collector + RUM Ring |
| MODEL-OBS-009 | Standalone sem conta                         | dispara uma chamada de modelo      | UID vazio, Identity anonymous, Device MID presente                                 | Span                               |
| MODEL-OBS-010 | Base URL sensível                            | URL com userinfo/query/email/hash   | o ARMS só vê origin/route sanitizados, sem segredos                                | Privacy Test                       |
| MODEL-OBS-011 | WebFetch/ReadSessionContext                  | ferramenta chama o modelo internamente | caminho de Operation correto e sem Call faltando                                  | Span + Tool Result                 |
| MODEL-OBS-012 | fila cheia                                   | produção contínua de Terminal Records | Agent não bloqueia, Drop Counter cresce, memória limitada                        | Benchmark + Health Metrics         |
| MODEL-OBS-013 | App iniciado com OTLP enabled, sem session ativa | Host aquece chamando `workspace/readState` | adapter state-only aceita a injeção do telemetry sink e não cria requisição de modelo; estado do workspace retorna normalmente | Protocol Test + Desktop Runtime |
| MODEL-OBS-014 | checkout limpo, sem telemetry dist           | constrói o runtime do Agente Desktop | os dois modos de build produzem telemetry antes de compilar o bootstrap; bundle desktop gerado com sucesso | Script Contract + Clean Build |

## 24. Pendências

| Item                         | Decisão padrão                                                  | Ação antes da implementação                                                              |
| ---------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Definição precisa de `rid` no backend | mapeado pelo Physical `request_id`                     | confirmar com os responsáveis pelos campos do ARMS/data warehouse; se for de fato Run/Resource ID, usar um campo canônico explícito |
| O UID original entra no ARMS  | decidido: nunca; só enviar o SHA-256 `user_id_hash/uid`        | se mudar no futuro, é preciso refazer a revisão de privacidade                        |
| Endpoint de OTel Metrics     | Fase 1 agrega no ARMS usando Terminal Spans completos; Metrics separados são P1 | validar a integração e as permissões de OTLP Metrics/Prometheus no Workspace ARMS de destino |
| Prazo de compatibilidade de `plan_request` | parar após um ciclo completo de canário/reconciliação   | confirmar o Owner dos dashboards antigos e o critério de conclusão da migração        |
| Orçamento de tamanho do pacote do SDK OTel | medido: CJS `+5.82%`, SEA darwin-arm64 `+0.62%` | continuar observando startup/RSS em canário e otimizar se necessário                   |

## 25. Índice de pontos de entrada da implementação

- Telemetry Contract: `apps/zcode-cli/packages/contracts/src/telemetry/index.ts`
- Runtime/Recorder: `apps/zcode-cli/packages/telemetry/src/runtime.ts`, `model-api-recorder.ts`
- Bootstrap/Exporter OTLP: `apps/zcode-cli/packages/telemetry/src/bootstrap.ts`, `lazy-otlp-exporter.ts`, `otlp-exporter.ts`
- Sanitização de Endpoint: `apps/zcode-cli/packages/telemetry/src/provider-endpoint.ts`
- Model Adapter: `apps/zcode-cli/packages/adapters/src/model/runner.ts`
- Status de Attempt: `apps/zcode-cli/packages/adapters/src/model/runner-status.ts`
- Generate: `apps/zcode-cli/packages/adapters/src/model/runner-generate.ts`
- Stream: `apps/zcode-cli/packages/adapters/src/model/runner-stream.ts`
- Classificador de Falhas: `apps/zcode-cli/packages/adapters/src/model/failure-classifier.ts`
- Thought Catalog: `apps/zcode-cli/packages/contracts/src/model/catalog.ts`
- Políticas de Thought: `apps/zcode-cli/packages/adapters/src/model/reasoning-policy.ts`
- Mapeamento de Thought do Runtime: `apps/zcode-cli/packages/adapters/src/model/runtime-thought-level.ts`(o Bootstrap mantém o re-export compatível)
- Bootstrap App/Standalone: `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts`
- Usage local: `apps/zcode-cli/packages/core/src/runtime/methods/usage-observability.ts`
- Usage no SQLite: `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/usage.ts`
- ARMS do App: `packages/desktop/src/main/appARMSBootstrap.ts`
- RUM Plan Usage: `packages/ui/src/lib/planUsageArmsTelemetry.ts`
- Spawn do Host: `packages/services/src/zcode-agent/zcodeAgentProcessManager.ts`
- Injeção de identidade OTLP pelo Host: `packages/services/src/zcode-agent/agentTelemetryEnv.ts`
- Telemetria de negócio: `packages/services/src/telemetry/telemetryCore.ts`

## 26. Documentos relacionados

- [Dicionário de eventos de performance](../../monitoring/performance-telemetry-catalog.md)
- [Monitoramento de performance](../../monitoring/performance-monitoring.md)
- [Eventos customizados de Plan Usage no ARMS](../../monitoring/plan-usage-arms-telemetry.md)
- [Monitoramento ARMS no Electron](../../monitoring/arms-browser-monitoring.md)
- [Especificação de compatibilidade de telemetria de conversa V4](../../monitoring/conversation-telemetry-v4.md)
- [CLI Usage Observability](../../../apps/zcode-cli/docs/design/v2/usage-observability.md)
- [Design de implementação do modelo](../../../apps/zcode-cli/docs/design/v2/model/README.md)
- [Integração do ARMS OpenTelemetry com Node.js](https://help.aliyun.com/zh/opentelemetry/user-guide/use-managed-service-for-opentelemetry-to-submit-the-trace-data-of-a-node-js-application)
- [Armazenamento de dados observáveis do ARMS](https://help.aliyun.com/zh/opentelemetry/developer-reference/arms-observable-data-storage-overview)