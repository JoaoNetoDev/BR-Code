# Telemetria do Agente CLI V4 → V5: Otimização Abrangente e Design de Upgrade

> Status: revisão histórica do V4 e design de upgrade para o V5
>
> Linha de base da revisão: implementação do repositório em 2026-07-29
>
> Ponto de partida da revisão: Agent Trace V2; Model API Record V1; V4 já em produção; Schema alvo desta rodada: `5`
>
> Escopo: Agente interno de `apps/zcode-cli`; [especificação final](../cli-agent-telemetry.md)

## 1. Propósito

Este documento preserva a revisão da implementação atual, as causas raiz dos problemas, as decisões de trade-off e o plano de migração, respondendo a:

1. Como o CLI Agent Trace realmente funciona hoje;
2. Quais capacidades confiáveis devem ser mantidas;
3. Quais capacidades reimplementam o OpenTelemetry;
4. Por que Context, Link, Model Span, identidade e versão precisam ser ajustados;
5. Como fazer o upgrade em fases, validar e reverter.

Os contratos finais de Span, Event, Attribute, Metric e Writer seguem a especificação final.

## 2. Conclusões em uma página

O V4 estabeleceu a base de um Trace completo; o V5 continua removendo fatos agregados do nó pai, endurecendo a atribuição de erros originais e completando a topologia interna do Subagent. O núcleo comum às duas rodadas de upgrade não é reescrever o OTel, mas restaurar a divisão correta de responsabilidades:

```text
OpenTelemetry
  Resource / Context / Span / SpanContext
  Parent / Link / Event / Status
  ContextManager / BatchSpanProcessor / Exporter
                    │
                    ▼
Semântica de domínio ZCode
  Turn / Step / Tool / Command
  Model Call / Model Attempt / Compaction
  atributos canônicos zcode.*
  Typed Writer / limpeza de privacidade / projeção de consulta
                    │
                    ▼
Adapter de compatibilidade externo
  convenções semânticas GenAI / aliases ARMS
```

Mudanças-alvo:

- Um processo CLI tem um único Telemetry Runtime Owner;
- O OTel Node Context Manager é a única verdade sobre o Span ativo;
- O Context de execução de negócio não se disfarça mais de OTel Trace Context;
- Parent, Link e propagação usam Context, SpanContext e W3C Propagator nativos;
- Model Call/Attempt são criados e encerrados nas verdadeiras fronteiras de ciclo de vida;
- O Trace mantém apenas uma fila: o BatchSpanProcessor;
- Event representa marcos instantâneos, Span representa trabalho contínuo, Attribute representa fato/resumo;
- O canônico ZCode é a verdade interna de análise; GenAI/ARMS são derivados por Adapter;
- A identidade é governada por categoria de privacidade; SHA-256 comum não é chamado de anonimização;
- `service.version` vem da construção real do CLI; versão de produto e versão de Schema são modeladas separadamente;
- Sem compatibilidade com campos antigos: troca atômica de relatórios por Schema Version.

## 3. Feature Impact Brief

### 3.1 Comportamento alvo

- Do Turn para baixo ficam visíveis Step, Tool, Command, Model Call, Attempt, Compaction;
- Chamadas de LLM fora do Turn também têm uma Root operation explícita;
- Busca por dispositivo, usuário, Session, Turn, modelo, Provider, ferramenta e operação;
- Estatísticas de tráfego, taxa de sucesso, taxa de cancelamento, duração, TTFT, Token, Cache, Retry Recovery;
- O App pode injetar ARMS; o CLI Standalone pode inicializar a mesma fábrica de Runtime;
- Falhas de Telemetry não alteram o resultado do Agente;
- Por padrão não se coleta Prompt, conteúdo de arquivos, I/O de ferramentas, URLs brutas, Headers, blocos extensos de erro.

### 3.2 Superfícies de consumo

Não há mudança direta de interação de UI; as superfícies de consumo são:

- Cadeia de chamadas e Trace Explorer do ARMS;
- Dashboards e alertas de ARMS/Grafana;
- Reconciliação local de Usage no SQLite;
- Saúde da Telemetria.

Portanto, esta rodada não adiciona catálogo de casos de UI de conversa.

### 3.3 State Owner

| Estado             | Atual                                  | V4                       |
| ------------------ | -------------------------------------- | ------------------------ |
| Provider/Exporter  | instância `OtlpTelemetryRecordExporter` | Runtime Owner de processo |
| Agent Span ativo   | `activeScopeStorage`                   | OTel `context.active()`  |
| Correlação de execução | múltiplos execution context        | valor privado do OTel Context |
| Chamada Model ativa | `ModelApiTelemetryStatusSink.calls`  | Live Call/Attempt Writer |
| Fila de Records    | `QueuedTelemetryRuntime.queue`         | removida                 |
| Fila do SDK        | `BatchSpanProcessor`                   | única Trace Queue        |
| Usage local        | SQLite                                 | permanece fonte de fato independente |

### 3.4 Invariantes

1. A Telemetria é sempre sidecar (bypass);
2. Há apenas um Provider, Context Manager, Processor e Exporter por processo;
3. Um Span é finalizado apenas uma vez;
4. Apenas execução viva é registrada; nada é fabricado a partir de hydration/recovery/remote replay;
5. Secret, Prompt, I/O de ferramentas e conteúdo de arquivos não são enviados;
6. Trace/Baggage internos não são propagados para Providers de modelo de terceiros;
7. IDs de alta cardinalidade podem ser usados em consultas de Trace, mas não como label de Metric;
8. Schema e versão de produto são independentes;
9. O SDK do OTel não é carregado quando desabilitado;
10. Não há I/O síncrono de arquivo/rede no caminho de produção.

## 4. Fatos da implementação atual

### 4.1 Cadeia principal do Agent Span

```text
RuntimeTelemetryFacade
  ├─ startTurn
  ├─ startStep
  ├─ startTool
  └─ startCompaction
         │
         ▼
AgentExecutionTelemetryRuntime
  └─ tracer.startSpan
       └─ BatchSpanProcessor
            └─ OTLP HTTP/protobuf -> ARMS
```

Já existe e deve ser mantido:

- `scope.run()` cobrindo operações síncronas e Promise;
- `end/fail/cancel` como estado terminal único;
- `abandoned` automático quando falta o estado terminal;
- separação entre success/denied/cancelled/failed de Tool;
- Active Writer de processo e chamada de Model ativa com limite;
- fechamento no shutdown;
- limitação de warnings;
- limpeza, truncamento e deduplicação da mesma cadeia de cause nos fatos de origem do erro;
- Tool/Command enviando apenas mensagem curta e sanitizada quando há falha estruturada;
- cache e desidentificação da resolução de Endpoint;
- gzip, batch, timeout, filas limitadas;
- injeção pelo Desktop e inicialização pelo Standalone.

O antigo TTL global de idle é item de remoção na migração: ele pode tramar Turn/Command legítimos e longos. No V4, Turn/Step/Tool/Command são fechados por Terminal normal, Shutdown de Session/Processo e Owner Registry; apenas Model Call/Attempt que não passam por `run()` usam coleta preguiçosa após 30 minutos sem atividade, com limite de capacidade de 1000 chamadas ativas.

### 4.2 Cadeia atual da Model API

```text
Model Adapter / Runner
  │ ModelNetworkStatusEvent
  ▼
ModelApiTelemetryStatusSink
  │ 归并 CallState / AttemptState
  ▼
ModelApiCallRecord / AttemptRecord
  ▼
QueuedTelemetryRuntime              # primeira fila
  ▼
OtlpTelemetryRecordExporter
  │ 按 startedAt/endedAt 重建 Span
  ▼
BatchSpanProcessor                  # segunda fila
  ▼
ARMS
```

Atualmente já cobre Provider, Model, Transport, Reasoning, Token, Cache, TTFT, Retry, Stream Recovery/Stall e erros de Provider/HTTP. O problema é que ele usa um ciclo de vida diferente do Agent Live Span.

### 4.3 Context/Link/Resource atuais

- `contracts/src/tracing/tracer.ts` tem um `TraceContext` de negócio e um ALS próprio;
- `telemetry/src/agent-trace-support.ts` tem novamente um `activeScopeStorage`;
- O OTel Provider não registra o Context Manager nativo do Node;
- `AgentTelemetryLink` mistura SpanContext com session/turn/tool/operation;
- `spanContextFromLink()` sempre define `isRemote:true` e perde `traceState`;
- O Resource coloca ao mesmo tempo service, runtime, device, hash de usuário e `uid`; a semântica e o escopo da identidade ficam pouco claros.

## 5. Principais problemas e decisões do V4

### 5.1 P1: dois Contexts ativos

Causa raiz:

- O Runtime Owner não foi convergido;
- O OTel Context Manager não virou infraestrutura;
- Um ALS próprio carrega Parent, Link, correlação e agregação.

Consequências:

- `context.active()` não é confiável;
- Novos pontos de entrada esquecem facilmente de entrar em algum ALS;
- A propagação por Promise/Timer/EventEmitter precisa ser verificada repetidamente;
- O TraceContext de negócio concorre conceitualmente com o SpanContext do OTel.

V4:

- Registrar `AsyncLocalStorageContextManager`;
- O Context do OTel é a única verdade sobre o Span ativo;
- A correlação usa uma Context Key privada;
- O `TraceContext` de negócio original é renomeado para execution/log correlation context;
- O Context de negócio não gera ID do OTel nem decide o Parent.

### 5.2 P1: Model Span reconstruído a partir de Records de estado terminal

Consequências:

- Impossible registrar Span Events de forma natural;
- Uma falha só pode ser inferida por TTL;
- O Parent SpanContext é comprimido e depois restaurado;
- Duas filas e dois conjuntos de flush;
- A projeção de Records tende a divergir do Agent Writer.

V4:

- Criar `model_call` no início da chamada lógica;
- Criar o filho `model_attempt` no início da requisição física;
- Eventos de rede atualizam o Writer diretamente;
- Retry cria um novo Attempt;
- Terminal encerra diretamente;
- Terminal também grava no SQLite;
- Remover a reconstrução de Trace Record e a fila de Records.

### 5.3 P1: Link não é um SpanContext nativo completo

Regras corretas:

- `isRemote=true` apenas para Context extraído de um carrier remoto;
- Capturas no mesmo processo preservam o `isRemote` original;
- `traceState` não pode ser perdido sem motivo;
- Link é `{context: SpanContext, attributes?}`;
- session/turn/tool/operation não pertencem ao SpanContext.

V4:

- No mesmo processo, usar diretamente `span.spanContext()`;
- Em travessia de processo confiável, usar `traceparent/tracestate` do W3C;
- Usar Propagator extract, não montar SpanContext remoto à mão;
- A correlação é armazenada separadamente.

### 5.4 P1: o Runtime Owner pode ser duplicado

A fábrica atual aceita ao mesmo tempo `runtime` e `agentExecution`, e ainda cria um por conta própria quando há Endpoint.
Se for inicializada por Session, haverá Provider, Exporter, Queue e Timer duplicados.

Prioridade fixa:

```text
显式注入完整 Runtime Owner
          │
          ├─ 有 -> 直接复用
          └─ 无 -> 进程启动配置创建一次
                         │
                         └─ 无配置 -> Noop Owner
```

O Endpoint não sobrescreve o Owner injetado; todas as Sessions referenciam o mesmo Owner.

### 5.5 P2: o SDK ainda é carregado quando desabilitado

`bootstrap.ts` importa o Exporter estaticamente, e o Exporter importa o SDK do OTel estaticamente.

V4:

- A verificação Noop vem antes do dynamic import;
- Carregar SDK/Exporter/Context Manager apenas depois de confirmar a habilitação;
- Promise de inicialização de nível de processo evita carga concorrente duplicada;
- `--help`, ausência de Endpoint e testes com desligamento explícito não entram no module cache.

### 5.6 P2: Span Event nunca é realmente usado

O `Span.addEvent()` próprio hoje é uma implementação vazia; os Agent Spans também não chamam Events nativos.
Stall/retry de Model só são colapsados em Attribute de estado terminal, e a linha do tempo fica sem evidências.

V4:

- Primeiro evento de provider, primeiro conteúdo, primeiro texto, stall, fallback e estado de permissão
  usam Event tipado;
- O retry em si é um novo Attempt Span;
- TTFT final, contagem de stall e maior idle continuam em Attribute;
- Não registrar cada chunk/token, `request_sent` nem `completed`.

### 5.7 P2: identidade do usuário no Resource

Usuários fazem login, logout e troca de conta; isso não satisfaz a estabilidade do ciclo de vida de um Resource.

V4:

- O Owner mantém uma Identity Source dinâmica; login, logout e troca de conta no Desktop são atualizados por um canal controlado;
- Cada Agent Turn Root (inclusive Child Agent Turn) lê a identidade atual uma única vez na criação, formando um snapshot imutável;
- Root destacada não projeta identidade de usuário por padrão, expressando causalidade apenas por Link/`parent_turn_id`;
- Spans filhos herdam o snapshot da Root, não chamam o Resolver de novo, e Spans existentes não são reescritos;
- Quando o Resolver lança erro, o identificador de usuário é omitido e um sinal de saúde é registrado, sem bloquear o negócio;
- Fazer projeção limitada apenas nos Spans que exigem busca independente;
- Omitir sentinelas como `unknown` e valores vazios;
- O device installation ID pode virar um Resource estável após confirmação de conformidade;
- Metrics não carregam user/device/session/turn.

### 5.8 P2: SHA-256 não é anonimização

Hoje o Desktop/Standalone pode aplicar SHA-256 sem sal ao user ID. Isso é pseudonimização determinística:

- Contas de baixa entropia podem ser revertidas por dicionário;
- Não pode ser rotacionado;
- Não reduz cardinalidade;
- Não elimina a exigência de governança de dados pessoais.

V4:

- Preferir a longo prazo um opaque telemetry subject emitido pelo backend;
- Hoje, no Desktop, na fronteira confiável do Host, converter o identificador da conta em um
  `user_subject_id` estável e ilegível; conta original, e-mail e login não entram no Agente;
- Esse Subject é dado pessoal pseudonimizado: não se declara anônimo e não é usado como Metric Label;
- Sem identificador em conformidade, omitir o user ID;
- O device MID é um identificador aleatório de instalação e não é mais hasheado;
- IDs aleatórios de Session/Turn/Request/Tool não são hasheados novamente.

### 5.9 P2: a cópia de campos comuns não tem fronteira

O ARMS não garante junção de qualquer Attribute de ancestral, então alguma projeção é necessária; mas não se pode copiar tudo.

V4:

- trace/span/parent nativos do OTel não são espelhados como `zcode.*`;
- Fatos locais do Span são escritos apenas no canônico local;
- Só projetar a correlação estritamente necessária para busca independente;
- A projeção precisa declarar origem, destino, nível de privacidade e Span de destino;
- Projeções de alta cardinalidade não entram em Metrics.

### 5.10 P2: o antigo V3 chegou a planejar esperar o Child antes de fechar o Parent

O OTel permite que o Parent termine antes do Child. Forçar a espera contamina a duração, aumenta contadores de referência
e pode ser arrastado indefinidamente por trabalho destacado.

V4:

- O Parent termina quando sua própria execução de negócio conclui;
- Children realmente pertencentes ao negócio são aguardados (`await`) pelo próprio negócio;
- A Telemetria não espera adicionalmente;
- Trabalho queued/background/fan-out usa nova Root + Link.

### 5.11 P3: semântica de Tool e Command misturada

Tool inclui lookup/validation/permission/hook/execute/serialize; Command descreve um subprocesso.
Read/Write não têm process exit code, e valor ausente não pode virar `0`.

V4:

```text
tool
  ├─ command          # 仅命令执行工具
  └─ 其他持续内部工作
```

- Tool/Command são Spans pai e filho; não se troca o tipo em tempo de execução;
- Na primeira versão, Permissão usa os Events `permission_requested/permission_decided`; só quando houver
  necessidade real de Duration/SLO próprio, `permission_wait` entra via revisão de um novo Span;
- exit code existe apenas em Command;
- Registrar apenas a categoria de executável e subcomandos de allowlist;
- Não registrar command/args/cwd/env/stdout/stderr completos.

### 5.12 P3: origem da versão confundida por dist obsoleto

2026-07-30: na linha de base da implementação atual, a versão de produto na raiz do repositório é `3.6.1` e a versão de construção do CLI é `0.16.1`. O `0.1.0` em `apps/zcode-cli/packages/cli/package.json` é apenas metadado de subpacote do workspace. Existe uma Tag `v3.6.2` no repositório, mas ela não é a verdade de versão do branch atual; o `dist/zcode.cjs` antigo local e o staging do Desktop `bundled-agents/darwin-arm64/glm/zcode.cjs` também não podem ser a verdade de versão.

dist/staging antigos não são a verdade de versão. O build atual do CLI injeta `__CLI_VERSION__` a partir de `apps/zcode-cli/package.json`; os metadados do Desktop leem a versão dos metadados de build de produto da raiz do repositório. O empacotamento oficial precisa reconstruir o Agent antes, não reutilizar artefatos de staging locais que não passaram na verificação de versão.

A lacuna histórica é que o Resource só guarda a versão de execução do próprio Agent, sem permitir confirmar separadamente a versão externa do Desktop/produto.

O V5 mantém `service.version=versão realmente embutida no bundle do CLI` e `zcode.product.version`;
sem produto externo no Standalone, o último é omitido. O App injeta explicitamente a versão de produto, o
release regenera o bundle e valida:

- `--version`=`apps/zcode-cli/package.json`=`service.version`;
- About=metadados de build de produto=`zcode.product.version`;
- `zcode.build.commit_id` disponível;
- Schema Version independente, inteiro `5`.

O V4 já está em produção; como os fatos de origem, as Metrics e a topologia de Subagent mudaram de forma quebrativa, o upgrade é atômico para o V5, sem escrita dupla com o V4.

## 6. Regras de uso do modelo nativo do OTel

### 6.1 Resource

O Resource descreve "quem produz a Telemetria" e é estável no ciclo de vida do Provider.

Adequado:

- `service.name`, `service.version`;
- `deployment.environment.name`;
- `service.instance.id`;
- versão de produto, superfície de runtime, commit de build, Schema Version;
- installation ID após confirmação de conformidade.

Inadequado: Session, Turn, usuário atual, Model, Tool, Request ID.

Na primeira versão, o Resource de Metric também mantém `service.instance.id`, evitando que as séries temporais
acumuladas de múltiplos processos do CLI e o reset por reinício se sobrescrevam; a agregação entre instâncias é
feita na consulta. A camada de agregação do Collector só remove o instance ID depois de validar DELTA Temporality
e a semântica de múltiplos produtores do ARMS. Usuário, dispositivo, Session e IDs de execução não entram no
Resource de Metric.

### 6.2 Context e SpanContext

```text
OTel Context
  ├─ 当前活动 Span
  ├─ Baggage（默认无业务身份）
  └─ ZCode private values
       ├─ execution correlation
       └─ typed writer anchor
```

O Context é um载体 imutável propagado dentro do escopo de execução; ele próprio não é enviado nem consultável.

O correlation snapshot dentro do Context é imutável; a referência de aggregate/writer anchor guardada no Context não
muda, mas o anchor é um contador mutável controlado e privado do Runtime. O negócio não pode ler, congelar, copiar
ou modificá-lo.

O SpanContext contém apenas trace ID, span ID, flags, state, isRemote; não contém IDs nem Attributes de negócio.

### 6.3 Parent e Link

Condições para Parent:

1. pertencer à mesma operation ponta a ponta;
2. ter um único owner direto de execução;
3. compartilhar Trace e decisão de amostragem.

Um Link do OTel pode apontar para qualquer SpanContext; o V4 só o usa para causalidade de queued, fan-out/fan-in,
background, Child Agent e recovery em Traces independentes. Uma nova Root precisa ser criada explicitamente com
`ROOT_CONTEXT`, e o Link precisa ser passado na criação do Span para que o Sampler o veja.

Parent não é determinado por "quem termina por último".

### 6.4 Event, Attribute, Span, Metric

```text
需要独立 duration/status/children？
  ├─ 是 -> Span
  └─ 否
      ├─ 最终稳定事实 -> Attribute
      ├─ 有具体发生时刻 -> Event
      └─ 高频聚合 -> Metric
```

Alguns fatos podem ter dupla expressão:

- Event `first_content` dá a linha do tempo;
- Attribute `time_to_first_content_ms` dá a agregação;
- Event `stream_stalled` dá o detalhe;
- Atributos `stall_count/max_idle_ms` dão o resumo.

### 6.5 Baggage e propagação

Baggage é copiado para Headers do downstream; não é uma coluna de consulta do ARMS.

Por padrão:

- Não colocar user/device/session/prompt;
- Não injetar em Providers de modelo;
- Não habilitar Baggage de negócio hoje; no futuro, mesmo que routing values de baixo risco só sejam propagados na
  fronteira de processos ZCode confiáveis, é preciso revisar separadamente campos, escopo de propagação e prazo de retenção;
- A correlação principal depende de SpanContext e da projeção controlada de Attributes.

Travessia de processo confiável:

```text
Parent context
  -> propagator.inject(traceparent, tracestate)
  -> typed protocol metadata
  -> child propagator.extract()
  -> remote trigger Context
       ├─ new Agent Turn -> ROOT_CONTEXT + Link
       └─ trusted same-trace RPC -> remote Parent
```

Um novo Agent Turn é sempre Root; a cadeia de disparo do Desktop/RUM só se relaciona por Link e não transforma o Turn em Child remoto.

## 7. Runtime alvo do V4

### 7.1 Owner único

```text
AgentTelemetryRuntimeOwner
  ├─ Resource
  ├─ AsyncLocalStorageContextManager
  ├─ TracerProvider
  ├─ BatchSpanProcessor
  ├─ OTLPTraceExporter
  ├─ Tracer
  ├─ optional MeterProvider
  └─ health counters

Session A ─┐
Session B ─┼─> 同一 Owner
Subagent ──┤
Model ─────┤
Tools ─────┘
```

Inicialização e fechamento acontecem uma vez cada. `forceFlush()` é usado apenas em teste, diagnóstico e shutdown limitado.

### 7.2 Scope

O Scope:

1. obtém o Parent a partir do Context atual do OTel;
2. cria o Span;
3. executa o negócio por `context.with()`;
4. deixa o negócio chamar o typed writer no ponto em que o fato ocorre;
5. exige que o negócio submeta explicitamente o estado terminal normal ou de domínio; exceção e cancelamento ficam por conta do Scope;
6. isola exceções da Telemetria.

A proteção contra exceção garante que o "Span sempre fecha", sem adivinhar estados terminais complexos por conta do negócio. Um retorno normal sem submissão de estado terminal é registrado como `abandoned(missing_terminal)`; não se pode adivinhar sucesso só porque "não houve exceção".

O fail-open também precisa cobrir o próprio `context.with()` e a construção do Writer:

- Se a criação do Writer falhar, retornar um No-op Writer;
- Se a falha ocorrer antes da ativação do Context, executar o negócio uma vez sem Context de Telemetria;
- Depois que o callback já entrou, mesmo que o Context Manager lance erro, aguardar apenas o mesmo Promise de negócio já criado — nunca reexecutar;
- O Terminal Latch fecha primeiro em memória, só depois chama SDK/Adapter/Metric;
- Exceções de Setter/Finish/Exporter não sobrescrevem o retorno de valor do negócio nem a exceção original.

### 7.3 Ciclo de vida

```text
Turn:  |--------------------|
Step:     |------|
Child:       |----------|
```

O Child pode terminar depois do Parent. Se o negócio precisar esperar, ele mesmo faz `await`; caso contrário, deve ser
considerado uma operation independente.

### 7.4 Subagent/Workflow Child

Escolher Parent ou Link conforme o ciclo de vida real:

```text
前台：Main Turn -> Agent Tool -> Child Agent Turn -> Step/Call/Attempt/Tool
后台：Main Turn -> Agent Tool -- Link --> Child Agent Turn ROOT -> Step/...
```

O Runtime do Child reaproveita a porta de Telemetria de processo; internamente, cada Step, requisição de modelo e
chamada de ferramenta precisa continuar separando Spans. O foreground é aguardado pela Tool pai e usa o Parent real;
um background explícito pode terminar e ser amostrado de forma independente, usando Root + Link.

## 8. Plano de Events

Recomendado:

| Span          | Event                   | atributos               |
| ------------- | ----------------------- | ----------------------- |
| Model Attempt | `first_provider_event`  | nenhum                  |
| Model Attempt | `first_content`         | nenhum                  |
| Model Attempt | `first_text`            | sem corpo                |
| Model Attempt | `stream_stalled`        | bounded idle bucket     |
| Model Call    | `fallback_selected`     | transport, reason code  |
| Tool          | `permission_requested`  | nenhum                  |
| Tool          | `permission_decided`    | result category         |
| Command       | `termination_requested` | reason                  |
| Compaction    | `fallback_selected`     | strategy, reason        |

`permission_requested/permission_decided` só aparecem em par quando há espera real por decisão do usuário; `not_required`
escreve apenas o Attribute final, sem criar Event.

Não recomendado:

- `request_sent`/`completed` (duplicam o start/end do Span);
- cada chunk/token de SSE;
- log bruto, stack de erro, comando, I/O de ferramenta, Prompt.

Retry:

```text
model_call
  ├─ model_attempt #1 ERROR
  └─ model_attempt #2 OK
```

Hoje não se define um Event `retry_scheduled`; o Retry é expresso pelo novo Attempt Span e por
`attempt_cause/retry_delay_ms`. O orçamento de capacidade de Event/Attribute referencia uniformemente a especificação
final; mesmo que o detalhe de stall seja descartado por limite, o Attribute resumo é preservado.

## 9. Canônico, Adapter e projeção

Três tipos de saída:

1. Estrutura OTel: trace/span/parent/status/time/kind;
2. Canônico ZCode: `zcode.<span_name>.<property>`;
3. Compatibilidade externa: GenAI, OTel semconv, alias do ARMS.

O negócio chama apenas o Writer:

```text
writer.setRequestedModel(model)
          ├─ zcode.model_attempt.requested_model
          └─ adapter -> gen_ai.request.model
```

Cada mapeamento do Adapter só pode ser:

- `exact`: mesmo sentido, tipo e unidade;
- `convert`: conversão explícita e testada;
- `omit`: sentido incerto.

É proibido preencher unknown como disabled, tratar requested como effective, ou usar status de Tool como exit code.

O plano de upgrade não mantém uma segunda matriz para a projeção limitada de consulta. Campos, Span de destino,
privacidade e consumidores referenciam uniformemente a
[seção 9 da especificação final](../cli-agent-telemetry.md#9-query-projection);
a implementação de migração e os Dashboards devem ser aceitos pela mesma matriz.

## 10. Privacidade

| Categoria           | Exemplos                                  | Política                     |
| ------------------- | ----------------------------------------- | ---------------------------- |
| Secret/Content      | Key, Header, Prompt, arquivo, I/O de ferramenta | descartar               |
| Person identity     | e-mail, telefone, OAuth UID                | Host gera opaque subject/omite |
| Execution ID        | Session, Turn, Request, Tool Call          | pode ir como está, retenção controlada |
| Category            | Model, Provider, operation, outcome        | pode ir como está             |
| Unbounded text      | URL, erro, comando, caminho                | estruturar/sanitizar/truncar |

URL:

- Manter scheme/host/port e a route sanitizada;
- Remover query, fragment e userinfo;
- Substituir e-mail, UUID, números longos, hash/token-like e segmentos de tenant/account;
- O resultado da sanitização é cacheado por Base URL.

Para erros, preserva-se o exception type/code/message original mais próximo da origem, e registram-se separadamente
o status HTTP, o code/message do Provider e a phase; category/retryable são apenas fatos extras de análise e controle,
sem sobrescrever a exceção original.

A interface de criação do Writer aceita apenas um Telemetry Descriptor estreito: IDs aprovados, enums estáveis e
strings curtas já sanitizadas. É proibido passar args/definition de Tool, command já parseado, ResolvedModelTarget
completo, Headers, URL ou Provider Options para a Telemetria. O Descriptor é um tipo TypeScript comum, sem Schema DSL.

`finishFailed(stage, category, error?)` aceita um objeto desconhecido na fronteira de exceção ou falha estruturada e
conclui a sanitização e o estado Failed dentro do mesmo Terminal Latch. O Sanitizer lê imediatamente
name/message/code/status/retry-after de escalares em Allowlist; não faz cache, não percorre recursivamente, não usa
`JSON.stringify` e não lê response/request/config. Strings candidatas são truncadas rigidamente antes da limpeza por
regex. Com Getter malicioso ou falha no Sanitizer, apenas type/code/stage são mantidos, com `unknown` como classificação
do erro.

A mensagem tem Secrets/URL query/path removidos antes de ser truncada no limite final; o stack original não é enviado.

Command permite categoria de executável, subcomando de allowlist, exit/signal/duração, bytes de saída/truncamento e
motivo de timeout/cancelamento; são proibidos args/cwd/env/stdout/stderr do comando.

## 11. Desempenho

Requisitos do caminho quente:

- apenas escritas em memória;
- nenhum I/O síncrono;
- sem JSON stringify/cópia profunda;
- não varrer Prompt/saída de ferramenta/erros grandes;
- não criar Owners duplicados;
- não chamar `forceFlush()` no negócio;
- sanitizar apenas strings curtas.

Os gates numéricos de capacidade, Batch, Export, Shutdown, séries de Metric e volume de rede são mantidos apenas na
[seções 15 e 16 da especificação final](../cli-agent-telemetry.md#15-metric-设计);
o plano de upgrade não duplica uma segunda cópia de números que facilmente divergem.

A primeira versão não usa TTL global e não deixa cada Setter/Child atualizar o tempo de atividade dos ancestrais. O
Terminal normal, o Session Teardown e o Process Shutdown garantem o fechamento; Call/Attempt de Model sem `run()`,
acionados por evento de status, mantêm um `lastActivityAt` leve e fazem no máximo um Sweep preguiçoso por minuto
na entrada de eventos de estado, fechando com `missing_terminal` após 30 minutos sem atividade.

Ordem de sobrecarga:

1. descartar Events de baixo valor;
2. descartar Spans de detalhe, escribiendo no Root um contador de overflow;
3. preservar sempre que possível o terminal de Turn/Model Call;
4. falha de Collector não gera replay infinito;
5. limitação de warnings;
6. Metrics de saúde registram drop/failure;
7. não bloquear o negócio.

Os benchmarks cobrem disabled, healthy, timeout, 200 Step/Turn, 1.000 chamadas ativas, chunks SSE de alta frequência
e Spans residuais no shutdown; observar startup, CPU, heap, atraso do event loop, bytes em fila, drop, shutdown e
latência de negócio.

## 12. Fases da migração

### Fase 0: especificação e versão

- Especificação final e este design de upgrade;
- Schema Version=`5`;
- catálogo de Span/Event/Attribute;
- Consultas ARMS do V4;
- Design de aceitação de versão.

Aceitação: privacidade de campos completa; Parent/Link explícito por Span; projeção de alta cardinalidade explícita.

### Fase 1: Owner de processo

- Novo Runtime Owner;
- Prioridade de injeção fixa;
- Introduzir `@opentelemetry/context-async-hooks`, registrando e habilitando um único
  `AsyncLocalStorageContextManager` na inicialização do processo;
- dynamic import no caminho disabled;
- shutdown idempotente;
- Resource com versão, commit e Schema `5`.

Aceitação: um Provider para múltiplas Sessions; injeção não sobrescrita; disabled não carrega o SDK.

### Fase 2: Context e Link

- Scope passa a usar `context.with()`;
- correlação com Context Key privada;
- remover o ALS de active-span do Agente;
- captura usando SpanContext nativo;
- preservar traceState/isRemote;
- Propagator W3C entre processos;
- renomear o TraceContext de negócio.

Aceitação: Promise/Timer/EventEmitter/concorrência não se cruzam; same-process com remote=false;
extract com remote=true; ida e volta de tracestate; requisições de modelo sem propagação; Child Agent Turn em
foreground e a Tool que o disparou no mesmo Trace e com `parentSpanId`; Child explicitamente em background com novo
`traceId` e Link apontando para o Span disparador.

### Fase 3: Writer do V5

- Writers tipados de Turn, Step, Tool e Compaction;
- canônico + Adapter;
- Child e Usage escrevem apenas em seus próprios Spans/Metrics de origem; remover o resumo do Parent,
  `TurnAggregates` / `ModelCallAggregates` e o `writeAggregates()` de estado terminal;
- `finish*()` recebe apenas o estado terminal deste nó, a fase de falha, a classificação do erro e a exceção original;
  não recebe Result de negócio nem agregados de Usage/contadores;
- Todo Span que possa falhar usa o `finishFailed(stage, error_category, error?)` atômico; estados terminais além de
  `failed` não aceitam classificação de erro;
- Interface de criação passa a usar um Telemetry Descriptor estreito;
- terminal idempotente;
- isolamento de exceções da Telemetria, incluindo a construção do Writer e `context.with()`;
- O Parent não espera o Child.

Aceitação: success/fail/cancel/abandoned; tipos de campo; Adapter exact/convert/omit.

### Fase 4: Child de Command

- Ferramentas de comando criam Child de Command;
- exit code apenas em Command;
- allowlist de executável/subcomando;
- timeout/signal/cancelamento;
- tamanho/truncamento da saída.

Aceitação: Read/Write sem exit; script e stderr não são enviados; terminal de Tool/Command distinguível.

### Fase 5: Model Live Span

- O início do Call cria um live Span;
- O início do Attempt cria um Child;
- `call_cause` usa a enumeração fixa `initial | continuation | fallback_replacement | recovery`;
- Transport/Provider Adapter fornece Attempt Failure Stage no ponto de falha real, sem jogar todos os erros em
  `response`;
- milestone/stall/fallback usam Events;
- retry cria um novo Attempt;
- ao não haver mais retry ou ao esgotar, encerrar o Call explicitamente, terminando direto e gravando no SQLite;
- remover a reconstrução Record -> Span.

Aceitação: tempo real; árvore de retry; consistência de Event/TTFT; sanitização de erro; abandoned;
reconciliação de chamada lógica entre SQLite/ARMS.

### Fase 6: completar as entradas de LLM

Pelo menos:

- Step normal;
- Compaction com streaming/non-stream/fallback;
- título de Session;
- resumo/título de Goal;
- verificação de conclusão;
- mensagem de commit do Git;
- processamento de busca/fetch na web;
- extract/synthesize de read session context;
- geração de texto de Workspace;
- Child de Subagent/Workflow;
- novo Provider Adapter.

Rastrear para cima a partir do model adapter final; toda requisição real tem um Attempt.
`read_session_context` e `web_fetch_processing` devem gravar Usage e ARMS simultaneamente.

### Fase 7: Event, Metric e relatórios

- Events tipados;
- saúde da Telemetria;
- Metrics RED de Turn/Tool/Model;
- success/cancel/retry recovery;
- duration/TTFT p50/p95;
- breakdown de token/cache/provider/model.

Counter/Histogram/UpDownCounter dos Metric Instruments, UCUM Unit, momento de registro, Labels legítimos e
Histogram Bucket seguem a seção 15 da especificação final. O CLI fixa `AlwaysOnSampler`; quando for necessário
down-sampling, o Tail Sampling é feito no Collector/ARMS. Se a conexão direta com o ARMS não suportar Tail Sampling,
todas as Traces são armazenadas e a taxa de sucesso exata e os denominadores de Token vêm sempre das Metrics.

Limites de implementação:

- Trace e Metric compartilham o mesmo Resource e os quatro eixos de versão CLI/Product/Schema/Commit;
- O Duration Histogram é registrado uma única vez, depois que o Terminal Latch vencer;
- O Token Counter é registrado no fato, pelo Setter de Usage do Attempt, como incremento monotônico, sem esperar o fim de Call/Turn;
- Tokens são escritos apenas na fonte de fato (Attempt) e em Metrics de baixa cardinalidade, sem mais copiar para Call/Step/Turn;
- Labels de Metric só podem ser campos da especificação; são proibidos dispositivo, usuário, Session, Turn, Request, Endpoint,
  corpo de erro e corpo de comando; o Model ID real da requisição passa por limitação de tamanho e é protegido pelo
  Series Cardinality Limit.

O caminho de erro precisa atender adicionalmente à "fidelidade do fato":

- O objeto de exceção original capturado pelo Transport entra no Writer do Attempt/Call ativo apenas por callbacks de
  observação dedicados à Telemetria, e não em SessionEvent, log de produto ou Result de domínio;
- O canônico `error_type/error_code/error_message` vem da exceção original, apenas com desidentificação e limitação de tamanho;
- Textos de exibição, `error_category` e Labels de Metric gerados pela classificação de retry do negócio são apenas
  projeções extras e não podem sobrescrever o fato da exceção original;
- Remover fingerprints de Provider/Model/Erro não consumidos e buckets de fabricante de Model inferidos por string;
  o `model` da Metric usa o Model ID real da requisição, protegido pelo limite de séries.

O tráfego de negócio usa o Count já embutido no Duration Histogram, sem criar em paralelo um Counter duplicado com o
mesmo Label. Instruments de detalhe como TTFT e Stall precisam antes passar por Canary de séries por processo,
bytes comprimidos e custo no ARMS.

### Fase 8: Canary

1. Schema 5 em ambiente de testes;
2. Requisições reais locais;
3. Artefatos empacotados no CI;
4. Injeção pelo Desktop;
5. Inicialização pelo Standalone;
6. ARMS Trace Explorer;
7. Reconciliação no SQLite;
8. 24 horas de saúde;
9. Avaliação de volume armazenado e cardinalidade.

### Fase 9: corte para produção

- Não escrever duas Trees completas em paralelo;
- Uma build produz um único Schema de Agent;
- Relatórios trocam para Schema 5;
- Histórico V2 é preservado;
- Remover ALS antigo, fila/reconstrução de Record e aliases/contracts antigos;
- O SQLite de Usage é mantido.

## 13. Impacto em arquivos

Contracts:

- `contracts/src/telemetry/agent-execution.ts`
  remover o Link misto e definir Port/relation/Writer do V5;
- `contracts/src/telemetry/index.ts`
  remover Records que existiam apenas para reconstrução de Trace;
- `contracts/src/tracing/tracer.ts`
  renomear o Context de negócio e remover Span/OTel falso e `addEvent()` vazio.

Telemetry:

- `telemetry/package.json`
  adicionar o Node Context Manager; adicionar SDK/Exporter de Metric só ao habilitar o sinal de Metric independente;
- `telemetry/src/bootstrap.ts`
  Owner único, lazy load, identity source dinâmico, Resource do V4;
- `telemetry/src/otlp-exporter.ts`
  responsável apenas por Provider/Processor/Exporter, registrando o Context Manager;
- `telemetry/src/agent-trace-runtime.ts`
  Scope/Writer do V4, Context nativo;
- `telemetry/src/compatibility-adapters.ts`
  centralizar Aliases de GenAI, HTTP/Server padrão e ARMS; o Canonical Writer não depende diretamente de nomes externos;
- `telemetry/src/agent-trace-support.ts`
  remover o ALS e manter limits/terminal/sanitizer;
- `telemetry/src/model-api-recorder.ts`
  Writer de Model ao vivo + projeção de Usage;
- `telemetry/src/runtime.ts`
  remover a fila de Trace Records;
- `error-sanitizer.ts` e o Endpoint Descriptor do Model Adapter
  mantidos com testes reforçados.

Core/Bootstrap:

- `core/src/telemetry/runtime-telemetry.ts`
  Port do V5, sem montar um context OTel completo;
- `core/src/tool/executor/telemetry.ts`
  Writer de Tool + Child de Command;
- Turn/Step/Compaction escrevem fatos nas fronteiras reais;
- `bootstrap/src/app/create-app.ts`
  recebe apenas o Owner de processo;
- o protocolo de Subagent/Workflow propaga o Context do W3C;
- `services/src/zcode-agent/agentTelemetryEnv.ts`
  injetar versão de produto e atualização dinâmica de identidade, ajustando a política de identidade de usuário;
- o build do Desktop continua injetando a partir da versão da raiz.

Testes:

- runtime de telemetry: Context, Parent/Link, terminal, limits;
- exporter: Resource, owner único, schema/versão;
- integração OTLP: árvore protobuf/Event reais;
- model: Call/Attempt, retry, stall, cache;
- core: Tool/Command, exceção, cancelamento, permission;
- E2E empacotado: ambiente de build OTLP e versão real.

## 14. Verificação

### 14.1 Matriz de testes unitários

| Dimensão | Casos                                                                                     |
| -------- | ----------------------------------------------------------------------------------------- |
| Scope    | sync, async, throw, reject, cancel, double terminal, falha na ativação do Context, No-op exactly-once |
| Context  | nested, parallel, timer, emitter, missing parent                                          |
| Link     | mesmo processo, remote, tracestate, carrier inválido, Turn Root+Link                       |
| Turn     | success, failed, cancelled, abandoned                                                     |
| Tool     | success, denied, failed, cancelled                                                        |
| Command  | exit 0/nonzero, signal, timeout, missing exit                                             |
| Model    | success, retry recovery/exhausted, cancel, abandoned                                      |
| Stream   | SSE, HTTP, first content, stall, recovery                                                 |
| Cache    | hit, write, none, unknown                                                                 |
| Reasoning| unsupported, disabled, level, budget, adaptive, unknown                                    |
| Privacy  | URL, e-mail, token, path, command, provider error, Getter malicioso, objeto cíclico        |
| Capacity | limites de span/detail/event/queue, Span longo, corrida shutdown/capacity                |
| Identity | login, logout, switch, erro do resolver, Span antigo sem reescrita                          |
| Metric   | type, unit, bucket, label, reset multi-processo                                            |
| Version  | pacote do projeto CLI, raiz do produto, metadados de build do Desktop, bundle, Resource    |

### 14.2 Integração

Capturar protobuf OTLP localmente e afirmar:

- Trace/Span ID e Parent legítimos;
- Link preservando traceState;
- Child Agent Turn como nova Root com Link apontando para o remote trigger;
- timestamp de Event correto;
- Resource apenas com campos estáveis;
- Schema=`4`;
- service.version consistente com o bundle do CLI;
- product.version do Desktop empacotado consistente com os metadados de build de produto;
- sem Secret/Content;
- gzip/protobuf decodificável.

### 14.3 Aceitação manual no ARMS

Disparar Turn, Tool, Command, retry, Compaction, título fora do Turn, Child Agent, erro e cancelamento normais.
Verificar:

1. Tree completa;
2. Parent de Call/Attempt correto;
3. Link da Root localizável;
4. Events presentes na linha do tempo;
5. status/outcome corretos;
6. provider/model/reasoning/cache coerentes;
7. identidade em conformidade;
8. erro diagnosticável sem privacidade;
9. versão de produto/schema correta.

### 14.4 Reconciliação no SQLite

Comparar por chamada lógica e janela de tempo os Call/Attempt do ARMS, `model_usage`, o resumo de Turn,
retry recovery e tokens de token/cache.

Amostragem, crash, drop por capacidade, estado disabled e falha de rede podem gerar diferenças, mas elas precisam
ser explicadas por um contador de saúde.

### 14.5 Gates de engenharia

```text
pnpm typecheck
pnpm lint
```

E executar os testes unitários de telemetry/core/bootstrap e os testes reais de integração OTLP.

## 15. Versão e release

| Campo                           | Origem                     | Exemplo          | Momento da mudança |
| ------------------------------- | -------------------------- | ---------------- | ------------------ |
| `service.version`               | bundle real do CLI         | `0.16.1`         | release do CLI     |
| `zcode.product.version`         | metadados de build do produto externo | `3.6.1` | release do produto |
| `zcode.build.commit_id`         | metadados de build         | SHA do commit    | a cada build       |
| `zcode.telemetry.schema_version`| contract                   | `5`              | mudança no contrato de dados |
| `service.name`                  | constante fixa de Telemetry| `zcode-cli-agent` | não muda com deploy |

Gates de empacotamento:

1. Executar `zcode.cjs --version`;
2. Ler o package do projeto CLI, o package de produto da raiz do repositório e os metadados de build do Desktop;
3. Ler os metadados de build do Desktop;
4. Iniciar o Agent empacotado e enviar um Trace;
5. Decodificar o Resource OTLP;
6. Afirmar `--version`=`service.version`=package do projeto CLI;
7. Afirmar About=`zcode.product.version`=package/metadados de build do produto;
8. Afirmar Schema=`4` e commit diferente de `unknown`.

Isso evita dist antigo, cache incorreto, Agent antigo embutido no Desktop e drift de versão no Resource.

## 16. Rollout e rollback

Chaves sugeridas para a migração:

- `ZCODE_AGENT_TELEMETRY_SCHEMA=4`;
- `ZCODE_MODEL_TELEMETRY_ENABLED=0` desliga tudo;
- detalhe de Events;
- projeção de identidade;
- Política de Tail Sampling no Collector/ARMS.

O lado CLI não oferece chave de Head Sampling por proporção, é fixo em AlwaysOn. Enquanto o Tail Sampling não estiver
pronto, a capacidade é avaliada com everything ingested; não se pode fingir "erro 100% preservado" com amostragem no cliente.

Canary:

```text
local -> CI packaged CLI -> internal Desktop
      -> small cohort -> all production
```

Em cada nível observar latência de Agent/model, startup, heap/event loop, falha/drop de exportação,
volume ingerido e amostragem de privacidade.

Rollback:

- reverter a build completa ou desligar a Telemetria;
- não rodar duas Trees V2/V4 em paralelo;
- o SQLite de Usage não é afetado;
- dados históricos do ARMS não são apagados;
- Dashboards selecionam por Schema;
- em falha de backend, primeiro desligar ou reduzir a amostragem, sem reverter a lógica de negócio do Agent.

## 17. Riscos e pontos a confirmar

Conformidade:

- se o device MID pode ser usado como Resource;
- emissão/rotação do subject de telemetria de usuário;
- prazo de retenidade/permissão de consulta de identidade;
- allowlist de mensagens de erro de Provider;
- se Model ID pode ser label de Metric.

Plataforma:

- capacidade de exibição/consulta de Link no ARMS;
- capacidade de busca/agregação de Events no ARMS.

Técnico:

- lacunas de propagação de callback após remover o segundo ALS;
- ordem dos eventos de rede de cada Provider;
- schema de protocolo entre processos;
- legibilidade de Child Root/Link na UI;
- volume armazenado de Events;
- publicação sincronizada de Schema e Dashboard;
- fronteira de confiança do workspace remoto.

Mitigação: teste de estresse de Context, testes de máquina de estados de Provider, schema de protocolo em runtime,
localização dupla por Link + correlação, limite/amostragem de Events, Dashboard criado antes da troca e allowlist
de propagação.

## 18. Definição de conclusão

- [ ] Owner único por processo;
- [ ] disabled não carrega o SDK;
- [ ] O Context do OTel é a única verdade sobre o Span ativo;
- [ ] O Context de negócio não se disfarça de OTel;
- [ ] Parent/Link/remote/tracestate corretos;
- [ ] Árvore de Turn/Step/Tool/Command/Model/Compaction correta;
- [ ] Todas as entradas de LLM têm lista estática e validação dinâmica;
- [ ] Model Call/Attempt como live Span;
- [ ] Apenas uma fila de Trace;
- [ ] Event usado para marcos instantâneos;
- [ ] exit code de Tool/Command não se confunde;
- [ ] exact/convert/omit do Adapter com testes;
- [ ] política de identidade aprovada pela revisão de privacidade;
- [ ] Secret/Content fora do payload;
- [ ] Metric sem identidade de alta cardinalidade;
- [ ] SQLite/ARMS com reconciliação explicável;
- [ ] Falha de Telemetry não afeta o Agente;
- [ ] Desempenho dentro do orçamento;
- [ ] `service.version` igual à versão do bundle do CLI;
- [ ] product.version do Desktop empacotado igual à versão do produto;
- [ ] Schema=`4`;
- [ ] Dashboard/Query/Alert do ARMS trocados;
- [ ] typecheck/lint/testes de integração passando;
- [ ] Aceitação OTLP com o instalador real.

## 19. Referências

- [OpenTelemetry Context](https://opentelemetry.io/docs/specs/otel/context/)
- [OpenTelemetry Trace API](https://opentelemetry.io/docs/specs/otel/trace/api/)
- [OpenTelemetry Resource](https://opentelemetry.io/docs/specs/otel/resource/) / [Resource Data Model](https://opentelemetry.io/docs/specs/otel/resource/data-model/)
- [OpenTelemetry Baggage](https://opentelemetry.io/docs/concepts/signals/baggage/) / [Propagators](https://opentelemetry.io/docs/specs/otel/context/api-propagators/)
- [OpenTelemetry Semantic Conventions](https://opentelemetry.io/docs/specs/semconv/)
- [OpenTelemetry GenAI Registry](https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/)
- [ARMS Trace Explorer](https://help.aliyun.com/en/arms/application-monitoring/developer-reference/use-trace-explorer-to-query-traces)
- [Turn Trace atual](./turn-trace-observability-v2.md) / [fatos da Model API](./model-api-observability-v1.md)