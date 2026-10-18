# Especificação de Design e Desenvolvimento da Telemetria do Agente CLI

> Status: especificação da implementação atual.
>
> Versão do Schema de Telemetria: 6.
>
> Escopo de aplicação: as cadeias de agente, modelo, ferramenta, comandos e compactação de contexto dentro de `apps/zcode-cli`.

Este documento define o modelo de dados, a topologia de cadeias, as restrições de design, a forma de integração, os limites de privacidade e as consultas básicas do Trace do Agente CLI.
Os campos completos, o runtime de baixo nível e os conceitos de OpenTelemetry são desenvolvidos em referências temáticas separadas. Este documento, as referências temáticas e os Contracts
em TypeScript formam juntos o Schema de Telemetria: para assinaturas de método e restrições de tipo vale o Contracts; para semântica de campos e restrições de sistema vale a documentação.

## 1. Modelo de dados do OpenTelemetry

O ZCode usa o seguinte modelo de dados do OpenTelemetry para descrever a execução do Agente:

```text
Resource: produtor de Telemetria (versão da CLI, versão do produto, build, plano de execução, instância de instalação)
    |
    `-- Trace: uma cadeia de execução completa
          |
          `-- Span: um trecho de trabalho com início, fim, duração e resultado
                |
                +-- Attribute: o fato desse trecho de trabalho
                +-- Event: um marco que aconteceu em um instante do trabalho
                `-- Child Span: outro trecho de trabalho interno com ciclo de vida próprio

Metric: estatísticas entre requisições geradas a partir do mesmo conjunto de fatos de baixa cardinalidade, sem depender da retenção de algum Trace específico
```

A topologia padrão do Turn principal do Agente é:

```text
agent_turn
|
+-- agent_step
|   +-- model_call
|   |   `-- model_attempt [1..n]
|   `-- tool_execution
|       +-- command_execution      existe apenas quando realmente inicia um processo do SO
|       `-- model_call             existe quando a ferramenta usa um modelo internamente
|
`-- context_compaction
    `-- model_call
        `-- model_attempt [1..n]
```

A semântica de cada Span é a seguinte:

- `model_call` é uma requisição lógica de modelo, cobrindo o resultado completo após Retry/Fallback;
- `model_attempt` é uma requisição física realmente enviada ao Provider;
- `tool_execution` é uma execução de uma ferramenta registrada;
- `command_execution` é o processo de comando realmente iniciado dentro da Tool, e não um “tipo derivado” da Tool;
- `agent_step` é um passo do Agent Loop, e não equivale a uma requisição HTTP de modelo.

A taxa de sucesso de chamadas lógicas tem `model_call` como objeto de estatística; a taxa de sucesso do Provider, 429/500, Endpoint e TTFT têm
`model_attempt` como objeto de estatística; a taxa de sucesso de ferramentas tem `tool_execution` como objeto de estatística; e o código de saída de Shell/Git tem
`command_execution` como objeto de estatística.

As definições de Resource, Context, SpanContext, Parent, Link, Event, Baggage e Metric, além de suas restrições de uso no ZCode, estão detalhadas em
[Conceitos de OpenTelemetry e escolhas do ZCode](./reference/otel-concepts.md).

## 2. Limites das instalações de observabilidade

| Instalação          | Uso                                                              | Limite                     |
| ------------------ | ---------------------------------------------------------------- | -------------------------- |
| CLI OTel Trace     | cadeia individual de Agent/Model/Tool/Command e análise de falhas | experiência de página, funil de negócio |
| CLI OTel Metric    | tráfego, taxa de sucesso, percentis de latência, tokens, saúde da Telemetria | corpo de uma requisição específica |
| CLI SQLite Usage   | detalhe local de Model/Turn/Tool, página de Usage, conciliação local | cadeia remota do ARMS      |
| App RUM            | páginas do renderer, recursos, APIs, exceções de frontend e experiência de interação | árvore de execução interna do Agente CLI |
| `/event/report`    | comportamento de produto, compra, feedback, funil de negócio    | Trace de performance do Agente |
| Logs locais        | ciclo de vida, diagnóstico manual, informação de troubleshooting exportável pelo usuário | carregamento automático do payload de Trace |

O Trace não é escrito nos logs locais nem reportado via RUM. Mesmo que esses dados acabem na mesma conta ou Workspace da Alibaba Cloud,
seus modelos de dados e pontos de consulta continuam independentes entre si.

## 3. Princípios de design

### 3.1 OTel expressa a estrutura, o ZCode define a semântica de negócio

Parent, Link, Context, Span, Event, Status e Resource usam capacidades nativas do OTel; semânticas de negócio como Turn, Step,
Attempt, Reasoning, Cache e Tool Outcome usam campos `zcode.*` completos.

`zcode.*` é o campo autoritativo e único para a consulta interna. `gen_ai.*`, `http.*`, `server.*` e `process.*` são aliases compatíveis
projetados a partir do mesmo fato, destinados ao entendimento por ferramentas externas, e não podem determinar em sentido inverso a API de negócio ou os relatórios internos.

### 3.2 Registrar na origem do fato

Quando o Provider retorna um Header, registra-se o status HTTP; quando o primeiro trecho de conteúdo chega, marca-se First Content; ao terminar o processo, registra-se o
Exit Code. A Telemetria não deve exigir que a camada de negócio construa objetos de resultado agregados adicionais, nem deve re-infletir ou reclassificar em um ponto distante da origem do fato.

```ts
attempt.setHttpStatusCode(response.status);

for await (const event of stream) {
  attempt.markFirstProviderEvent();
  if (containsContent(event)) attempt.markFirstContent();
}

command.setExitCode(result.exitCode);
```

A mensagem de erro original do Provider é preservada em seu sentido após mascaramento de credenciais e caminhos, sem ser primeiro colapsada em poucos modelos de erro. A
classificação de erros funciona apenas como uma dimensão adicional de baixa cardinalidade e não substitui a informação original.

### 3.3 Só se cria um Span para um ciclo de vida independente

Trabalhos que precisam de duração, resultado, erro, filhos ou entrada de diagnóstico independentes criam um Span; marcos instantâneos usam Event; um único
fato usa Attribute; agregações entre requisições usam Metric.

| Necessidade                                  | Usar                                    |
| -------------------------------------------- | --------------------------------------- |
| duração e resultado de uma Tool do início ao fim | Span                                  |
| momento em que a Tool solicita permissão    | Event                                  |
| decisão final de permissão                  | Attribute; se for necessário ver o momento, pode haver também um Event |
| Provider Origin, Model, Exit Code           | Attribute                               |
| P95, taxa de sucesso total, total de tokens | Metric                                 |
| qual operação de primeiro plano disparou uma tarefa em segundo plano | Link              |

Não se deve criar Span para fases curtas como `parse` e `prepare`, que possuem apenas valor de localização de falha; elas são normalmente representadas por
`failure_stage`. Só se modela a fase como Child Span quando ela precisa de um SLO próprio ou de uma subárvore interna.

### 3.4 Um fato original tem um único dono

Attempt Token pertence apenas a `model_attempt`, Exit Code pertence apenas a `command_execution`, e o corpo do erro do Provider é
registrado apenas no Span mais próximo da origem, aquele que Recognize o erro primeiro. O nó pai registra seu próprio outcome e failure stage, sem copiar
tokens, corpo de erro ou resumo agregado dos filhos.

Alguns IDs são projetados em nós-chave por motivo de capacidade de consulta no ARMS, por exemplo Turn ID e Logical Call ID. São projeções de consulta
controladas, e não falsificação de relação pai/filho por meio de Attribute. As regras completas estão em
[Dicionário do Schema](./reference/schema-reference.md#3-query-projection执行关联投影).

### 3.5 Unknown não é igual a False

Fatos não observados devem ser omitidos ou escritos explicitamente como `unknown`; não podem ser inferidos como `disabled`, cache miss, requisição não
streaming ou `exit_code=0`. Por exemplo, uma Tool Read comum não tem código de saída de processo e portanto não registra Exit Code.

### 3.6 Isolamento entre Telemetria e execução de negócio

Falhas na inicialização da Telemetria, na ativação de Context, nos Setters, nas Metrics, na exportação e no fechamento não podem alterar o valor de retorno, a
exceção ou a contagem de execuções do negócio. O modo Disabled retorna um Writer no-op, e os chamadores de negócio não precisam verificar separadamente o estado do switch.

### 3.7 Dados de conteúdo são proibidos por padrão

Prompt, entrada e saída do modelo, corpo do Reasoning, entrada e saída da Tool, conteúdo de arquivos, comando completo, HTTP Header, Body
e URL Query são proibidos em Trace. Dados cujo nível de privacidade não possa ser confirmado não podem ser coletados antes da conclusão da revisão.

## 4. Parent, Link e operações independentes

Parent/Child representa a propriedade da execução dentro do mesmo Trace; Link representa a relação causal entre outro Trace independente e quem o disparou.

```text
O trabalho pertence a um trecho de ciclo de vida síncrono/await possuído pelo chamador atual?
    |
    +-- Sim: Child Span, compartilhando traceId, com parentSpanId apontando para o chamador
    |
    `-- Não: novo Root Span, usando Link para apontar para o disparador
```

Convenções atuais:

- o Turn principal comum é Root;
- Subagent em primeiro plano é aguardado pela Tool pai, e o Child Turn é diretamente pendurado na Tool pai;
- Subagent em segundo plano e Workflow Child são agendados de forma independente, criando um novo Root com Link para o disparador;
- trabalhos que não são Turn, como geração de título, validação de Goal e Project Memory, usam `detached_operation`; a execução em primeiro plano pode ser um
  Child, e a execução por fila/segundo plano/recuperação usa Root + Link;
- o Parent pode terminar antes do Child; a ordem de término, por si só, não é motivo para trocar por Link; o que importa é a propriedade e o limite de agendamento.

```text
Subagent síncrono:
agent_turn -> agent_step -> tool_execution -> agent_turn(child)

Subagent em segundo plano:
Trace A: tool_execution ---- Link ----> Trace B: agent_turn(root)

Trabalho independente em segundo plano:
Trace A: triggering span -- Link ----> Trace B: detached_operation(root)
```

Tarefas atrasadas devem chamar `captureCausation()` no momento do agendamento e não podem ler o Active Context vigente na fase de execução para
inferir a relação de disparo.
`AgentTelemetryCausation` guarda o SpanContext do OTel e poucos IDs de projeção de consulta; não é um Context de negócio.

A nomenclatura de campos, a herança de Lifecycle, a Query Projection e os campos completos de cada Span estão detalhados em
[Dicionário de Span, Attribute, Event e Metric](./reference/schema-reference.md).

## 5. Forma de integração

### 5.1 Usar o Typed Writer

O código de negócio depende da interface estreita em `@zcode/contracts/telemetry`. Cada Setter do Writer corresponde a um fato explícito; internamente ele cuida
de Attribute Key, validação, mascaramento, Event, Metric e aliases de compatibilidade externa.

```ts
const step = runtimeTelemetry.step({
  stepId: assistantMessageId,
  stepIndex,
});

return step.run(async () => {
  try {
    const result = await executeStep();
    step.finishCompleted(result === "continue" ? "tool_requested" : "turn_completed");
    return result;
  } catch (error) {
    if (signal.aborted) {
      step.finishCancelled("abort_signal");
    } else {
      step.finishFailed("unhandled", "unknown", error);
    }
    throw error;
  }
});
```

`run()` grava o Span atual no Context do OTel, de modo que Spans criados internamente se tornem automaticamente filhos, e trata de forma unificada
exceções não capturadas e estados finais esquecidos. Ramos de negócio normais ainda devem chamar explicitamente o `finish*()` com semântica precisa.

### 5.2 Tratamento de estado final e isolamento de exceções

`try/catch` registra os estados finais conhecidos pelo negócio, como cancelamento pelo usuário, negação de permissão e falha de parsing; `run()` trata
exceções não capturadas e `missing_terminal`. Ramos de negócio conhecidos fornecem semântica precisa, e `run()` fornece isolamento de exceções e completude do estado final.

O Writer usa um Terminal Latch exactly-once. Apenas a primeira chamada `finishCompleted/Failed/Cancelled/...` tem efeito, e as chamadas de estado final
posteriores são ignoradas; o Latch é fechado antes de chamar o SDK do OTel e as Metrics, para evitar que uma exceção na camada de observabilidade produza estados finais duplicados.

### 5.3 Tool e Command

```ts
const tool = telemetry.startTool({
  registeredToolName: toolCall.name,
  toolCallId: toolCall.id,
});

return tool.run(async () => {
  tool.markPermissionRequested();
  const decision = await requestPermission();
  tool.setPermissionDecision(decision);

  if (decision === "denied") {
    tool.finishDenied("user_denied");
    return deniedResult;
  }

  const result = await executeTool(tool);
  tool.setOutputBytes(result.outputBytes);
  tool.setOutputTruncated(result.truncated);
  tool.finishCompleted();
  return result;
});
```

O Child só é criado quando a Tool realmente inicia um comando do SO:

```ts
const command = tool.startCommand({
  category: "git",
  commandCount: 1,
  safeName: "git.status",
  sandboxed: true,
  shellKind: "bash",
});

return command.run(async () => {
  const result = await spawnProcess();
  command.setExitCode(result.exitCode);
  command.setOutputBytes(result.outputBytes);
  command.finishCompleted();
  return result;
});
```

`safeName` é uma família de comandos controlada, e não o comando completo. Argumentos, caminhos, scripts e variáveis de ambiente são proibidos no reporte.

### 5.4 Model Call e Attempt

O ponto de chamada de negócio declara apenas a finalidade de negócio da chamada de modelo; o Adapter do Provider e o registrador de status completam os fatos reais da requisição. O chamador
não deve preencher manualmente UID, Session, Provider Origin, Model real, tokens, cache, erros HTTP ou TTFT.

```text
model_call(operation=agent_step, logical_call_id=L1)
|
+-- model_attempt(request_id=R1, attempt_number=1) -> failed 429
`-- model_attempt(request_id=R2, attempt_number=2) -> completed
```

`ModelApiTelemetryStatusSink` escuta o Model Status Event unificado e chama, em sequência:

```ts
call.startAttempt(...);
attempt.setHttpStatusCode(429);
attempt.setProviderErrorCode("rate_limit");
attempt.setProviderErrorMessage(providerMessage);
attempt.markFirstProviderEvent();
attempt.markFirstContent();
attempt.setInputTokens(inputTokens);
attempt.setCacheReadTokens(cacheReadTokens);
attempt.finishCompleted();
call.finishCompleted();
```

Provider, Endpoint, Model, Reasoning e Usage são escritos a partir da requisição/resposta real da camada de encapsulamento da API. Os campos completos estão em
[Dicionário de Span de Modelo](./reference/schema-reference.md#11-model_call).

### 5.5 Operações independentes e todas as entradas de LLM

Trabalho de modelo fora de um Turn precisa criar primeiro um `detached_operation`, deixando o `model_call` interno se tornar automaticamente Child.
`operation` usa uma enumeração controlada que atualmente inclui:

```text
goal_completion_verification
goal_title_generation
project_memory_extract
project_memory_dream
project_memory_recall
read_session_context_extract
read_session_context_synthesize
session_title_generation
tool_internal_model_call
web_fetch_processing
web_search
workspace_git_commit_message
workspace_generate_text
```

`agent_step` e `context_compaction` são carregados por seus Spans dedicados e não usam
`detached_operation` como wrapper. Ao adicionar uma nova entrada de LLM, é preciso primeiro escolher uma operation existente; só se adiciona um valor à enumeração quando tanto a
semântica de execução quanto a dimensão estatística forem diferentes. As definições e os pontos de chamada de todas as Operations estão em
[Enumeração de Operation no Dicionário do Schema](./reference/schema-reference.md#14-operation-枚举).

## 6. Fluxo para estender a observabilidade

### 6.1 Adicionar um Span

```text
Precisa de duração/resultado/erro/subárvore independentes?
    |
    +-- Não: Attribute ou Event
    |
    `-- Sim: um Span existente consegue expressar isso com precisão?
              |
              +-- Sim: adicionar ao Writer existente os Setters necessários
              `-- Não: adicionar um novo Span Name estável + Typed Writer
```

Ao adicionar um Span, é obrigatório concluir simultaneamente:

1. definir as fronteiras de início e fim;
2. definir o Parent ou Root + Link;
3. adicionar nos Contracts o tipo de Start dedicado e o Writer;
4. escrever explicitamente no Runtime a Key canônica `zcode.<span_name>.*`;
5. definir outcomes, failure stages, events e privacidade;
6. atualizar o [Dicionário do Schema](./reference/schema-reference.md);
7. adicionar testes de topologia, estado final, isolamento de exceções, privacidade e Metric.

### 6.2 Adicionar um campo

Um novo campo precisa esclarecer o seguinte:

- ele pertence ao Resource, à projeção de execução, ao Lifecycle ou a algum Span?
- onde o fato original é determinado pela primeira vez?
- qual é o tipo, a unidade, os valores permitidos e a semântica de ausência?
- ele contém identidade, conteúdo, caminho, URL, credencial ou texto livre?
- ele será usado como Metric Label; se for, a cardinalidade é limitada?
- ele precisa de aliases de compatibilidade GenAI/OTel, e a conversão é sem perdas?

Em seguida, adicionar no Writer concreto um Setter com semântica clara. A interface de negócio não pode expor `setAttribute(key, value)` nem deve introduzir
um Schema Registry de runtime ou uma camada de mapeamento secundário.

### 6.3 Adicionar um Event

Um Event deve ser um marco instantâneo com valor de diagnóstico, exposto por um método concreto, como
`markFirstContent()`. É preciso esclarecer a deduplicação e o limite de contagem; é proibido escrever Event para cada Streaming Chunk.

### 6.4 Adicionar uma Metric

Uma Metric precisa definir denominador, Instrument, Unit, Bucket e Label. Somente Labels de baixa cardinalidade são permitidos; Session ID,
Request ID, Endpoint, mensagens de erro, installation ID e user ID são proibidos como Label. A Metric não é derivada retroativamente de resultados de consulta de Trace do ARMS, e sim registrada
diretamente pelo Writer no momento em que o fato é determinado.

## 7. Restrições de privacidade e performance

### 7.1 Dados permitidos

- enumerações estáveis, contagens, durações, tokens, status HTTP;
- Tool Names de Registry controlado e Safe Names de família de comandos;
- fatos de execução de Provider/Model;
- Provider Origin e Route anonimizados;
- tipos de erro, códigos de erro e mensagens de erro mascarados e truncados;
- IDs pseudônimos de instalação gerados pelo produto, IDs de sujeito de usuário controlados e IDs de correlação de execução.

O installation ID é um pseudônimo aleatório persistido, não um ID de hardware, e também não é um “dado anônimo sem risco”. O user ID é registrado hoje com o valor original do
ID de sujeito controlado, sem Hash adicional; ambos só podem ser usados em consulta de Trace e não podem entrar como Metric Label.

### 7.2 Dados proibidos

```text
Prompt / Message / Reasoning corpo
Tool entrada e saída / conteúdo de arquivo / Patch
Command completo / argumentos / cwd / variáveis de ambiente
HTTP Header / Body / Cookie / Authorization
URL Query / Fragment / nome de usuário / senha
OTLP License Key ou outro Secret
```

A anonimização de Endpoint remove nome de usuário, senha, Query e Fragment, e substitui por placeholders emails, UUID, números longos, hashes longos e Path Segments suspeitos de
ser Token; o resultado usa um cache limitado por `(providerKind, baseURL)`. A mensagem de erro sofre primeiro um truncamento limitado e, em seguida, a remoção de
credenciais, emails, caminhos locais comuns e partes sensíveis de URL.

### 7.3 Restrições do caminho crítico

Os Setters só podem executar operações constantes e de objetos pequenos; são proibidos I/O de arquivo/rede síncrono, percorrer o Prompt, serializar JSON grande ou
reportar chunk a chunk. Os Spans são exportados de forma assíncrona e em lote via BatchSpanProcessor, com Gzip. Ao atingir o limite de 5000 Writers ativos por processo,
Spans novos são contornados e é registrado o estado de saúde da Telemetria, sem bloquear o Agente.

Os algoritmos de anonimização de Endpoint, mensagens de erro e campos de identidade, além do orçamento de exportação, dos limites de capacidade e do comportamento de degradação,
estão detalhados em
[Referência de Runtime](./reference/runtime-and-operations.md#7-性能容量与可靠性).

## 8. Consultas no ARMS

O Trace é consultado no Application Monitoring / análise de cadeia de chamadas do ARMS, e não no dashboard de experiência RUM. Condições básicas de filtro:

```text
serviceName : zcode-cli-agent
and resources.zcode.telemetry.schema_version : 5
```

Consultas comuns:

```text
# Todos os Turns
spanName : agent_turn

# Requisições físicas de modelo que falharam
spanName : model_attempt
and attributes.zcode.model_attempt.outcome : failed

# Nós principais de um Turn
attributes.zcode.execution.turn_id : <turn-id>

# Requisições de modelo de uma instância de instalação
spanName : model_attempt
and resources.zcode.device.installation_id : <installation-id>

# Todos os Retry Attempts de uma chamada lógica
attributes.zcode.execution.logical_call_id : <logical-call-id>
```

Para consulta de erros, usa-se:

- HTTP 429/500: `attributes.zcode.model_attempt.http_status_code`;
- código de erro original do Provider: `attributes.zcode.model_attempt.provider_error_code`;
- mensagem de erro original do Provider (anonimizada): `attributes.zcode.model_attempt.provider_error_message`;
- erro do Attempt que o encerrou (normalmente uma exceção de Transport/SDK): `attributes.zcode.model_attempt.error_message`;
- endereço da requisição: `provider_origin` e `provider_route`, sem usar a URL original.

Taxas de sucesso precisas, QPS, tokens e P95/P99 devem preferentially usar as Metrics do OTLP; o Trace serve para localizar amostras de execução específicas. As
Saved Queries, Dashboards e fórmulas completas de estatística estão detalhadas em
[Referência do ARMS](./reference/runtime-and-operations.md#9-arms-查询大盘与统计口径).

## 9. Responsabilidades da documentação, do código e dos testes

```text
Especificação central
    modelo de dados + princípios de design + forma de integração + limites de sistema

Referências temáticas
    conceitos de OTel + dicionário completo de campos + detalhes de Runtime/operação

Contracts / Writers em TypeScript
    assinaturas de método compiláveis, enumerações e escrita de Attributes

Tests
    prova executável de topologia, campos, estados finais, anonimização, projeções de compatibilidade e exportação
```

Principais locais de código:

- Contracts: `apps/zcode-cli/packages/contracts/src/telemetry/`;
- Runtime do Writer: `apps/zcode-cli/packages/telemetry/src/agent-trace-runtime.ts`;
- Context e classe base de estado final: `apps/zcode-cli/packages/telemetry/src/agent-trace-support.ts`;
- Model Status para Writer: `apps/zcode-cli/packages/telemetry/src/model-api-recorder.ts`;
- Compatibility Adapter: `apps/zcode-cli/packages/telemetry/src/compatibility-adapters.ts`;
- Metrics: `apps/zcode-cli/packages/telemetry/src/agent-metrics.ts`;
- OTLP Owner/Exporter: `apps/zcode-cli/packages/telemetry/src/otlp-exporter.ts`;
- Facade de negócio: `apps/zcode-cli/packages/core/src/telemetry/runtime-telemetry.ts`.

Regras de manutenção:

1. Ao adicionar ou modificar Span, Attribute, Event, Metric, enumeração, privacidade e semântica estatística, é obrigatório atualizar o dicionário de campos em conjunto;
   a semântica dos campos não pode depender apenas da expressão no código.
2. Ao alterar princípios gerais, interfaces de integração ou limites, atualizar este documento simultaneamente; detalhes de nível de campo são atualizados apenas na referência temática correspondente.
3. Processos de migração e registros de revisão concluídos são movidos para `archive/` e não ficam lado a lado com a especificação atual.
4. Quebrar campos, tipos, unidades, estados finais ou topologia exige subir a Versão do Schema de Telemetria; a versão do produto e a versão da CLI evoluem de forma independente.
5. Antes do commit, executar os testes relacionados, `pnpm typecheck` e `pnpm lint`.

## 10. Eixos de versão

| Significado                       | Campo                             | Origem atual                                 |
| --------------------------------- | --------------------------------- | -------------------------------------------- |
| Versão do produtor da Telemetria CLI | `service.version`               | injetada no build de `apps/zcode-cli/package.json` |
| Versão do Desktop/produto         | `zcode.product.version`           | metadados de build do produto; documentação e código não fixam versões |
| Versão do contrato de dados      | `zcode.telemetry.schema_version`  | constante dos Contracts, atualmente 5       |
| Identidade exata do build        | `zcode.build.commit_id`           | metadados de build confiáveis de CI/Git      |

Ao comparar o efeito de releases em relatórios, a Versão do Schema, a Versão da CLI, a Versão do Produto e o Build Commit devem ser mantidos em conjunto,
e não tratados como um mesmo campo de versão.