# Conceitos de OpenTelemetry e escolhas do ZCode

> Este documento explica os conceitos do OpenTelemetry usados pelo CLI Agent Trace, as relações entre eles e as restrições de modelagem do ZCode. O design
> completo e a forma de integração estão em [CLI Agent Telemetry - Design e Especificação de Desenvolvimento](../cli-agent-telemetry.md).

## 1. Modelo geral

```text
Resource
    Descreve o produtor de Telemetry
    |
    `-- TracerProvider
          |
          `-- Tracer (Instrumentation Scope)
                |
                `-- Trace
                      |
                      +-- Span
                      |    +-- SpanContext
                      |    +-- Attributes
                      |    +-- Events
                      |    +-- Status
                      |    `-- Links
                      |
                      `-- Topologia Parent/Child

Context
    Propaga dentro do processo o Active Span atual e o snapshot privado de correlação do ZCode

Metric
    Sinal agregado entre requisições, independente de uma única Trace
```

Esses conceitos têm responsabilidades diferentes no modelo de dados do OpenTelemetry e não existe uma relação de conversão camada a camada para Attribute:

- O Resource acompanha os dados exportados e descreve o produtor;
- O Context existe apenas durante a propagação em runtime;
- O SpanContext é a identidade de propagação do Span;
- Attribute/Event/Status são os dados do Span;
- Parent/Link são a estrutura entre Spans;
- Metric é outra categoria de sinal.

## 2. Resource, Provider e Instrumentation Scope

### 2.1 Resource

O Resource descreve atributos do produtor que são estáveis ao longo do ciclo de vida de um Provider, por exemplo:

```text
service.name
service.version
service.instance.id
deployment.environment.name
process.runtime.name
os.type
host.arch
zcode.telemetry.schema_version
zcode.product.version
zcode.runtime.surface
```

Ele é adequado para responder "qual serviço, versão, processo e superfície de execução gerou os dados". Session, Turn e usuário autenticado mudam, portanto não pertencem ao Resource.

O mesmo Resource é anexado a muitos Spans, mas não é o código de negócio chamando o Setter repetidamente para cada Span. O SDK do OTel combina Resource e dados do Span na exportação.

O Resource da Trace inclui `service.instance.id` e `zcode.device.installation_id`, facilitando o diagnóstico de uma execução. O Resource da Metric remove de propósito esses dois valores de alta cardinalidade, caso contrário cada processo de CLI de vida curta criaria uma nova série temporal.

### 2.2 TracerProvider e Tracer

O `TracerProvider` possui processadores, Exporters, Sampler e Resource. Atualmente um processo de CLI cria apenas um
Owner, que contém um TracerProvider e um MeterProvider.

O Tracer é identificado pelo Instrumentation Scope para indicar "qual biblioteca criou estes Spans":

```text
name    = @zcode/cli-agent-telemetry
version = Telemetry Schema Version
```

Esse Instrumentation Scope do OTel não é igual ao Typed Span Writer do código de negócio, nem ao escopo de execução de `scope.run()`.

## 3. Trace, Span e SpanContext

### 3.1 Trace

Uma Trace é o conjunto de Spans que compartilham o mesmo `traceId`. Ela não é um objeto que precise ser criado separadamente: o traceId nasce ao criar o Root Span, e os Spans Child o herdam.

O ZCode costuma usar um Turn principal do Agente como uma Trace. Tarefas em background ou Workflows com ciclo de vida independente criam outra Trace, preservando a relação de causalidade por meio de Link.

### 3.2 Span

Um Span é um trecho de trabalho com início, fim e duração. Ele contém:

```text
name / kind / start time / end time
attributes / events / status / links
spanContext
parentSpanId（se for Child）
```

O Span Name é um tipo de nó estável e de baixa cardinalidade, como `agent_step` ou `model_attempt`. O ZCode não mantém mais um Attribute `span_type` duplicado com o Span Name, nem concatena Step Index ou Model Name no Span Name.

`SpanKind.INTERNAL` é usado para trabalho dentro do processo como Turn, Step, Tool, Command, Compaction e Call;
`model_attempt` usa `SpanKind.CLIENT` para representar uma requisição enviada a um Provider.

### 3.3 SpanContext

O SpanContext é a identidade de propagação imutável do Span:

```text
traceId
spanId
traceFlags
traceState
isRemote
```

Ele não contém Session ID, UID, Prompt nem Attributes do Span. Parent e Link usam o SpanContext, não o Span inteiro.

`isRemote` indica se aquele contexto foi extraído de uma fronteira de propagação remota; referências causais capturadas do Active Span dentro da CLI atual mantêm o valor original e não devem ser mudadas para true arbitrariamente só para "parecerem entre tarefas".

## 4. Context e Active Span

O Context do OTel é o container de propagação imutável dentro do processo. O SDK do Node usa
`AsyncLocalStorageContextManager`, de modo que Promise, `await`, Timer e cadeias assíncronas concorrentes obtenham cada um o seu
Active Span correto.

```text
scope.run(callback)
    |
    +-- context.with(childContext, callback)
    |       |
    |       `-- startStep/startTool/startCall dentro do callback
    |               lê automaticamente o Active Span correto como Parent
    |
    `-- ao final do callback, restaura o Context de quem chamou
```

Dentro do mesmo Context do OTel, o ZCode também guarda um `ActiveWriterContext` privado de runtime, usado para passar Execution Correlation imutável, o Writer atual e o Tool Call ID. O código de negócio não pode acessar chaves privadas de Context e também não deve repassar campo a campo Session/Turn/Provider.

O Context em si não é exportado nem vira Attribute automaticamente. Quais campos de correlação precisam ser pesquisáveis no ARMS precisa ser explicitamente projetado por `executionProjection()`.

### 4.1 Relação entre Context e Span Context

```text
Span ------detém------> SpanContext
  |
  `-- trace.setSpan(Context, Span) --> novo Context

Context --trace.getSpan()---------> Span atual
Context --trace.getSpanContext()--> SpanContext atual
```

O Context é o "container de runtime", o SpanContext é a "identidade propagável" e o Span é o "objeto de trabalho com dados registráveis".

## 5. Parent, Link e Causalidade

### 5.1 Parent/Child

Um Span Child compartilha o traceId com o Parent, e o `parentSpanId` do Child aponta para o Parent. Isso expressa posse dentro da mesma árvore de execução, sem exigir que o Parent termine depois do Child.

Quando o Active Span atual é suficiente, o Writer cria o Child automaticamente. A causalidade só é capturada explicitamente quando há atraso, fronteira de concorrência ou um novo runtime que não pode depender do Context atual.

### 5.2 Link

Um Link é uma aresta que aponta para outro SpanContext no momento da criação de um novo Span. Dois Spans podem ter traceIds diferentes. Ele é usado para relações do tipo "disparado por ele, mas não pertencente a ele":

```text
Trace A                                     Trace B
tool_execution --Link(spawned_by)--------> agent_turn(root)
trigger span   --Link(triggered_by)-------> detached_operation(root)
old run        --Link(resumed_from)-------> recovery root
```

O Link precisa ser escrito na criação do Span. Root + Link deve ser criado explicitamente com `ROOT_CONTEXT`, sem deixar que o Active Span atual se torne o Parent por baixo dos panos.

Atributos de Link atuais:

```text
zcode.link.relation = spawned_by | triggered_by | resumed_from
```

### 5.3 `AgentTelemetryCausation`

O ZCode usa um tipo estrito para guardar as referências causais necessárias a tarefas atrasadas:

```ts
interface AgentTelemetryCausation {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
  isRemote: boolean;
  sessionId?: string;
  turnId?: string;
  toolCallId?: string;
}
```

Os cinco primeiros itens são o SpanContext do OTel; os três últimos são a projeção de consulta controlada usada quando o ARMS ainda não consegue fazer Join através de Link. Não carrega Prompt, parâmetros de Tool nem objetos de negócio arbitrários.

A captura precisa ocorrer na fronteira de agendamento:

```text
Active Span
    |
    +-- captureCausation()  <- ao enfileirar/criar o child
    |
    `-- o Parent termina

Tarefa executada mais tarde
    `-- cria um Child ou Root + Link com a Causation já salva
```

Se a leitura de `context.active()` for adiada até a "execução posterior", o resultado pode ser o Span de outra tarefa.

### 5.4 Fronteiras entre processos hoje

Hoje a Causalidade do Agent Telemetry trafega principalmente entre o CLI Runtime compartilhado e child runtimes internos; ela ainda não
unificou as Traces de Desktop/RUM e o CLI Agent Turn em uma única Trace W3C entre processos. O campo `traceparent` já existente no protocolo pertence a uma infraestrutura de RPC tracing mais ampla, e não é possível assumir que o CLI Agent Writer já faz injeção/extração automática.

Se no futuro a fronteira entre processos for atravessada, deve-se usar o Propagator do OTel para injetar e extrair `traceparent`/`tracestate`, atualizando o
Schema estrito do protocolo; não escreva à mão um conjunto de Headers paralelo. Se o Agent Turn continua como Root + Link precisa ser decidido separadamente, com base na posse da execução.

## 6. Attribute, Event, Status e Exceções

### 6.1 Attribute

Um Attribute descreve fatos sobre o Span ou um resumo de estado final. É adequado para valores que precisam de filtro e agregação, como Provider, Model, Token, Exit Code, Outcome e Failure Stage.

Attribute tem restrições de tipo e cardinalidade e não é um container de texto de log. Objetos dinâmicos grandes, corpos de mensagem, Headers ou stacks de erro completos não podem ser colocados em Attribute.

### 6.2 Event

Um Event é um registro instantâneo dentro do ciclo de vida do Span:

```text
model_attempt
  10:00:00 start
  10:00:01 event: first_provider_event
  10:00:02 event: first_content
  10:00:05 end
```

Regras de escolha:

- "o que é / qual foi o valor final" normalmente é um Attribute;
- "quando aconteceu" normalmente é um Event;
- "quanto durou e tem um resultado independente" normalmente é um Child Span.

Alguns marcos escrevem Event e Attribute final ao mesmo tempo; por exemplo `markFirstContent()` escreve o
Event `first_content` e também `time_to_first_content_ms`. O Event é usado para a sequência única no tempo e o Attribute para filtragem rápida e drill-down, sem necessidade de recalcular na consulta.

### 6.3 Status e Outcome de negócio

O Status do OTel só tem `UNSET/OK/ERROR`, o que é insuficiente para expressar resultado de negócio. O ZCode usa um `outcome` exclusivo de Span:

| Outcome        | OTel Status | Significado                        |
| -------------- | ----------- | ---------------------------------- |
| `completed`    | `OK`        | Conclusão normal de negócio        |
| `failed`       | `ERROR`     | Falha de negócio                   |
| `cancelled`    | `UNSET`     | Cancelamento, não contado por padrão como erro de sistema |
| `denied`       | `UNSET`     | Recusa por permissão ou política   |
| `discarded`    | `UNSET`     | Resultado descartado explicitamente |
| `backgrounded` | `UNSET`     | Comando enviado para background, a observação em foreground termina |
| `abandoned`    | `UNSET`     | Writer não passou pelo estado final normal e foi recolhido |

`failure_stage` indica em qual fase de negócio o erro ocorreu naquele Span, `error_category` é uma classificação de baixa cardinalidade e
`error_message` preserva a informação de origem já anonimizada. Os três são complementares; não se pode manter apenas a classificação.

## 7. Metric

A Trace responde "por que aquela execução falhou"; a Metric responde "qual é a taxa geral de falha e o P95". Uma série de métrica é determinada pela
combinação do nome do Instrument e dos Labels, e Labels de alta cardinalidade causam problemas de custo e de corretude.

O Writer do ZCode registra a Metric ao mesmo tempo em que o fato é determinado, sem tentar adivinhar offline a partir da Trace exportada:

```text
Writer Setter / Terminal Latch
    +-- Span Attribute/Event
    `-- OTel Metric（rótulos de baixa cardinalidade）
```

Assim, mesmo que no futuro o backend faça sampling da Trace, a contagem e o denominador de tokens das Metrics continuam completos. Session, Turn,
Request, usuário, instância de instalação, Endpoint e mensagens de erro são proibidos em Labels de Metric.

## 8. Baggage

Baggage é um conjunto arbitrário de pares chave-valor que pode viajar com o Context entre serviços e ser injetado automaticamente em requisições a jusante. Não é um "Attribute público", e seu escopo de propagação é mais perigoso que o de um Attribute comum de Span.

O CLI Agent atualmente não usa Baggage de negócio:

- não escreve UID, installation ID, Session ID, Prompt, caminhos de arquivo ou parâmetros de Tool;
- não injeta Baggage nos Providers de modelo;
- qualquer novo campo de Baggage precisa de uma revisão separada de destinatário, ciclo de vida e privacidade.

Campos que precisam ser consultados em vários Spans devem priorizar Resource, Execution Projection controlada ou a topologia da Trace;
não podem ir para Baggage só porque "é conveniente passar adiante".

## 9. Erros comuns

1. **Tratar Context como um conjunto de campos públicos.** O Context não é exportado; é preciso escolher explicitamente entre Resource ou Attribute.
2. **Tratar SpanContext como se fosse Span.** O SpanContext só serve para associar e propagar; não recebe Attribute nem é encerrado.
3. **Duplicar todos os campos do pai em Parent/Child.** A topologia já expressa a estrutura; projete apenas os IDs que o backend realmente precisa pesquisar.
4. **Trocar Parent/Child por Link só porque o Parent terminou antes.** O Parent pode terminar antes; o critério para Link é ciclo de vida independente.
5. **Usar Event para medir duração independente.** Event não tem estado final próprio; se você precisa de SLO, crie um Child Span.
6. **Misturar log, Trace e Metric.** Os três diferem em forma de coleta, privacidade, cardinalidade e uso em consulta.
7. **Colocar valores dinâmicos também no Span Name.** Use Span Name estável e mantenha os fatos dinâmicos em Attributes controlados.
8. **Tratar campos GenAI como um Schema interno.** `zcode.*` são os campos autoritativos; campos de compatibilidade são projetados pelo Adapter.

## 10. Leitura adicional

- [OpenTelemetry Specification](https://opentelemetry.io/docs/specs/otel/)
- [Context](https://opentelemetry.io/docs/specs/otel/context/)
- [Trace API](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [Resource](https://opentelemetry.io/docs/specs/otel/resource/)
- [Metrics Data Model](https://opentelemetry.io/docs/specs/otel/metrics/data-model/)
- [Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [Baggage](https://opentelemetry.io/docs/concepts/signals/baggage/)