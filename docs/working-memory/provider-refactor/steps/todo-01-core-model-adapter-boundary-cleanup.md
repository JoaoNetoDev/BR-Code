# 01 Limpeza da fronteira Core Model Adapter

> Status: concluído
>
> Data: 2026-08-24
>
> Revisão de origem: [`../research/model-abstraction-unification-cleanup-audit.md`](../research/model-abstraction-unification-cleanup-audit.md)
>
> Designs de objetivo relacionados: [`../design/model/model.md`](../design/model/model.md), [`../design/registry/model-creation.md`](../design/registry/model-creation.md)

## 1. Objetivo da tarefa

Remover a dependência direta do Core em `AiSdkModelAdapter` e o fallback do Compatibility Model, para que todas as requisições de modelo do Core só possam passar pela cadeia padrão:

```text
Provider Registry
        |
        v
ModelFactory
        |
        v
Core AgentRuntime
        |
        v
Active Model
        |
        v
AiSdkModelAdapter
        |
        v
Provider API
```

Esta tarefa não remove o `AiSdkModelAdapter` como implementação de execução de Provider API. Ele continua responsável pela codificação de mensagens e ferramentas, parâmetros de Provider, autenticação da requisição, chamadas do AI SDK, retry, recuperação de stream, normalização de Usage / Event e observação do estado de rede. O que se remove são os seguintes caminhos alternativos:

```text
Core AgentRuntime
        |
        `-> modelAdapter -> Compatibility Model / 旧 ModelTextRequest
```

Ao final, o Core conhece apenas `ModelSelection`, `ModelFactory` e `Model`, , verificar ou chamar Adapter algum.

## 2. Princípios confirmados

### 2.1 Model é a única abstração executável do Core

O Core só pode chamar:

```ts
model.generateText(request);
model.streamText(request);
```

O Core não pode chamar o Adapter diretamente nem montar por conta própria requisições específicas de Provider.

### 2.2 ModelFactory é a única porta de entrada de produção de Model raiz

Todas as entradas de execução de modelo em produção precisam obter o `ModelFactory` oficial. Na ausência da Factory, não se pode recorrer ao Adapter, nem o Core pode completar Properties, Options, Provider Connection ou capacidades de modelo padrão.

`Model.bind()` é uma entrada de derivação legítima: ele só pode criar um Model vinculado a partir de um Model existente, com o mesmo providerId/modelId, as mesmas Properties, os mesmos Option Specs e o mesmo Executor. Ele não consulta o Registry novamente nem constitui uma segunda cadeia de criação de Model raiz.

### 2.3 Adapter só existe a jusante de Bootstrap / ModelFactory

Permitido:

```text
createZCodeApp
      |
      v
AiSdkModelAdapter
      |
      v
ApiProviderModelRuntime / ModelFactory
      |
      v
Model
```

Proibido:

```text
Core / Workflow 业务逻辑 / Service / UI -> AiSdkModelAdapter
```

### 2.4 Testes obedecem à mesma abstração

Testes de chamada de modelo usam Fake Model / Fake ModelFactory. Não se pode criar um fallback de Adapter exclusivo para testes a fim de preservar testes antigos, nem simplesmente envolver mocks antigos de Adapter em uma Factory compatível para que os testes continuem protegendo a forma antiga `ModelTextRequest`.

Se um teste de integração de Bootstrap precisar controlar o resultado do modelo, ele deve fornecer diretamente um Executor padrão `ModelRequest -> ModelResult/ModelEvent` e deixar a montagem do teste criar o Model; não se pode embrulhar o mock antigo de Adapter `AiSdkModelTextRequest` em uma Factory compatível.

### 2.5 Dependências ausentes falham explicitamente

O `AgentRuntime` de produção deve obter a Factory oficial. Se existir de fato uma construção somente de estado e somente leitura, é preciso garantir que ela não consiga executar requisições de modelo; não se pode usar a ausência de Factory como um mecanismo implícito para entrar em outro caminho de execução.

Um Runtime state-only não pode expor ferramentas de Subagent que exijam criar Model. O Adapter state-only do Bootstrap precisa rejeitar a execução explicitamente na fronteira única `createModel()`, sem continuar se fazendo passar pela entrada pública `generateText/streamText` já removida e sem depender de coerções de tipo duplas para esconder o `createModel()` ausente até o runtime.

## 3. Escopo de remoção

### 3.1 Campos e dependências do Core Runtime

Remover:

- `AgentRuntimeDeps.modelAdapter`;
- `AgentRuntime.modelAdapter`;
- `AgentRuntimeInternal.modelAdapter`;
- a cópia e a propagação de `modelAdapter` entre Runtime pai e filho;
- as verificações em runtime do Core sobre a existência de métodos concretos de `AiSdkModelAdapter`.

### 3.2 Compatibility Model

Remover do `runtime-model.ts` do Core:

- `createCompatibilityModel`;
- `resolveCompatibilityConnection`;
- `toCompatibilityRequest`;
- `resolveCompatibilityProviderOptions`;
- `COMPATIBILITY_CONTEXT_WINDOW`;
- `COMPATIBILITY_MAX_OUTPUT_TOKENS`;
- os cálculos de output token / thinking budget exclusivos do Compatibility Model;
- as conversões de `ModelRef` / `ModelSelection` exclusivas do Compatibility Model;
- os formatos de entrada/saída hardcoded no Core para o Compatibility Model;
- a lógica do Core que infere capacidades do Compatibility Model a partir de Endpoint, providerKind ou modelId.

`createRuntimeModel()`, se mantido, só pode delegar à Factory oficial:

```ts
export function createRuntimeModel(
  runtime: AgentRuntimeInternal,
  input: RuntimeModelFactoryInput,
): Model {
  return runtime.modelFactory(input);
}
```

Se, após a implementação, esse helper não oferecer mais semântica adicional, ele deve ser mantido inline e removido.

### 3.3 Portões de existência do Adapter

Remover ou reescrever formas como:

```ts
if (!this.modelFactory && !this.modelAdapter) return;
if (!runtime.sessionStore || !runtime.modelAdapter) return false;
typeof this.modelAdapter?.streamText === "function";
```

Regras de tratamento:

- Title, Memory, Compact e Subagent leem apenas as próprias feature flags e as dependências de negócio necessárias;
- o contrato `Model` já fornece `streamText()`, então decidir se o streaming está habilitado depende apenas de `modelStreaming`;
- um Runtime de produção normal não expressa a disponibilidade de uma funcionalidade de Agent pela "existência" de Adapter ou Factory;
- o caminho state-only não pode disparar execução de modelo por causa da remoção do portão; isso precisa ser verificado pela fronteira real de chamada.

### 3.4 Montagem de Workflow e Child Runtime

As seguintes formas de execução precisam usar a Factory oficial:

- Main Agent Runtime;
- Workflow Child;
- Script Workflow Child;
- Foreground / Background Subagent Child;
- Workspace generateText.

O `modelFactory` hoje opcional de Workflow e Script Workflow passa a ser dependência obrigatória. Quando um Child tem Selection própria, o Child Model é criado pela mesma Factory padrão; o Adapter do Runtime pai não é repassado ao Child.

### 3.5 ModelPort antigo

Remover o que não tem referência de produção válida:

- `ModelPort`;
- `ModelPortOptions`;
- o barrel export correspondente;
- comentários e tipos de teste que existem apenas para atender a essa interface.

Não se pode trocar `modelAdapter: any` por `ModelPort` para estender a vida da abstração antiga.

### 3.6 Entradas de execução direta antigas do Adapter

Depois da migração do Core e dos testes, auditar e remover as entradas públicas antigas do `AiSdkModelAdapter`:

```ts
generateText(AiSdkModelTextRequest);
streamText(AiSdkModelTextRequest);
```

A entrada padrão de criação é mantida:

```ts
createModel(options): Model;
```

As seguintes capacidades combinadas de Bootstrap / Adapter ficam temporariamente preservadas nesta tarefa:

- `replaceRegistryConfig`;
- `resolveReasoningDisabledProviderOptions`;
- `addStatusSink`;
- `setModelIoFullRetentionEnabled`.

## 4. Preservado explicitamente e não objetivos

### 4.1 Implementação do Adapter preservada

Preservar `AiSdkModelAdapter` e, dentro dele:

- o Runtime do AI SDK;
- a projeção de execução de SDK Factory / Endpoint / Header;
- a codificação de requisições de Provider;
- o consumo de Request Auth;
- Retry / Stream Recovery;
- Model I/O e Status / Telemetry;
- a normalização de Usage / Stream Event.

### 4.2 Fora do escopo desta tarefa

Os problemas a seguir entram em itens de limpeza posteriores e não são misturados a esta tarefa:

- `ModelConnectionPort` e a inferência de Connection/capability do Core;
- o fechamento de `ModelRef`, `variant` e da identidade de Result/Event;
- o Catálogo de Model antigo e os dados de models.dev;
- o ciclo de vida das credenciais dinâmicas de Account Provider;
- o hardcode de modelos específicos para reasoning disabled;
- a nomenclatura final e o enxugamento adicional do AI SDK Execution Registry dentro do Adapter.

Esta tarefa pode remover as chamadas de Connection exclusivas do Compatibility Model, mas não usa "`ModelConnectionPort = 0` em todo o repositório" como condição de conclusão.

## 5. Fatos anteriores à implementação

A varredura estática preliminar após o merge de M4 mostrou:

- 17 arquivos de produção do Core ainda referenciam `modelAdapter`;
- `createRuntimeModel` tem 15 referências estáticas, cobrindo Turn, Compact, Memory, Title, Goal e generateText de workspace;
- o tipo Factory de Workflow Child e Script Workflow Child ainda é opcional;
- cerca de 29 arquivos de teste de Core / Bootstrap só fornecem Adapter e não fornecem Factory;
- `workspace/readState` usa um Adapter temporário que proíbe requisições de modelo para criar um App temporário; esse Adapter pode continuar na fronteira de composição do Bootstrap, mas não pode mais ser injetado no Core;
- a revisão de conformance do M4 em paralelo está modificando `runtime-model-lifecycle.test.ts`; antes da implementação oficial é preciso obter uma árvore de trabalho estável e sem sobreposição.

Portanto o escopo desta tarefa é claro e o risco é controlável, mas não é uma remoção trivial.

## 6. Plano de testes primeiro

### 6.1 Utilitários de teste

Estabelecer ou estender primeiro os utilitários de teste unificados:

```ts
createTestRuntimeModel(...);
createTestModelFactory(...);
createUnavailableTestModelFactory(...);
```

Usos respectivamente: devolver um Fake Model executável, registrar as entradas de criação da Factory e fornecer uma implementação de falha explícita para testes que não devem executar modelo.

### 6.2 Adicionar primeiro os testes que falham

Cobrir:

1. o Main Runtime cria Model apenas pela Factory;
2. sem Factory disponível não se pode executar requisições de modelo por meio do Adapter;
3. o Workflow Child usa a Factory oficial;
4. o Script Workflow Child usa a Factory oficial;
5. o Subagent Child usa a Factory herdada ou depois de override;
6. todos os Steps do Loop atual continuam usando o mesmo Active Model;
7. atualizações do Registry não alteram Models já criados;
8. Request Auth, Usage, Status e Trace continuam agindo sobre o Model real;
9. streaming e não streaming passam ambos pela interface Model;
10. a leitura state-only do workspace não dispara requisições de modelo.

### 6.3 Regras de migração dos testes antigos

- para testar o conteúdo das requisições do Core: o Fake Model coleta `ModelRequest`;
- para testar os eventos de stream do Core: o Fake Model implementa `streamText()`;
- para testar codificação de Provider, Retry ou comportamento do SDK: permanece nos testes do Adapter;
- para testes de Runtime que não executam modelo: usar unavailable Factory;
- é proibido continuar afirmando que o Core produz o antigo `ModelTextRequest`, Provider Options ou Connection requests.

## 7. Ordem de implementação

### Step A: baseline estável e montagem de testes

- aguardar a revisão paralela de M4 liberar os arquivos de teste sobrepostos;
- reexecutar a auditoria de referências estáticas e registrar a superfície de chamada exata;
- adicionar o helper de Factory de teste;
- enviar primeiro os testes que falham, ou confirmar na mesma sequência de desenvolvimento que os testes falham antes.

### Step B: montagem da Factory de produção

- tornar a Factory de Workflow / Script Workflow obrigatória;
- verificar a origem da Factory no Main, Workflow, Script Workflow, Subagent e generateText de workspace;
- remover a propagação do Adapter para o Child Runtime.

### Step C: remoções no Core

- remover os campos e dependências de `modelAdapter` do Core;
- remover o Compatibility Model e todos os helpers exclusivos;
- remover os portões de existência do Adapter;
- fazer com que todo processo de formação de Model chame apenas a Factory padrão.

### Step D: migração dos testes

- trocar mocks do Core no formato antigo de Adapter por Fake Model / Factory;
- devolver as asserções que pertencem à codificação de Provider para os testes do Adapter;
- executar os testes direcionados de Core, Bootstrap e Adapter.

### Step E: retração das interfaces públicas

- remover `ModelPort` / `ModelPortOptions`;
- usar `dep:refs` para confirmar que as entradas diretas antigas do Adapter não têm chamadas entre pacotes;
- remover as entradas públicas antigas `AiSdkModelAdapter.generateText/streamText`;
- limpar imports, barrel exports, comentários e testes de compatibilidade relacionados.

## 8. Riscos e pontos de verificação

As requisições do modelo principal já usam a Factory, então o principal risco vem das linhas de apoio antes controlada pelo portão de existência do Adapter:

- Session Title / Goal Summary Title;
- Automatic / Reactive / Micro Compact;
- Project Memory Recall / Extraction / Dream;
- Target Completion Verification;
- Workspace generateText;
- Workflow / Script Workflow Child;
- Foreground / Background Subagent;
- streaming e não streaming;
- Request Auth;
- Usage, Status, Trace e Model I/O.

O App de produção normal tem hoje Adapter e Factory ao mesmo tempo, portanto remover os portões de Adapter do Core não muda, em princípio, nenhuma funcionalidade de produção. A maior superfície de migração está nas montagens antigas de teste que injetavam apenas Adapter.

## 9. Condições de conclusão

Zeragem mecânica:

```text
Core modelAdapter                                       = 0
Core createCompatibilityModel                           = 0
Core COMPATIBILITY_CONTEXT_WINDOW/MAX_OUTPUT_TOKENS      = 0
Core 直接调用 adapter.generateText/streamText            = 0
ModelPort / ModelPortOptions                            = 0
生产 AgentRuntime 构造缺少 modelFactory                  = 0
Workflow/Script Workflow/Subagent 传递 modelAdapter      = 0
Adapter 旧 generateText/streamText 的非 Adapter 测试调用 = 0
```

Aceitação de comportamento:

- todas as requisições de modelo do Core podem ser rastreadas até um `Model`;
- todo Model raiz de produção pode ser rastreado até uma `ModelFactory` padrão; um Model vinculado só pode ser rastreado até o `bind()` de um Model existente;
- o Core não cria mais Model Properties, Options nem Provider Connection;
- o Loop atual continua fixando o mesmo Active Model;
- atualizações do Registry afetam apenas Models criados depois;
- requisições comuns e todos os Sidecar e Child Runtime mantêm o comportamento atual de Request Auth, Usage, Status e Trace;
- os testes obedecem à mesma abstração, sem caminhos de execução antigos exclusivos de teste.

## 10. Comandos de verificação

Após a implementação, executar pelo menos:

```bash
pnpm test:unit:affected
pnpm typecheck
pnpm lint
pnpm fmt:check
pnpm knip
```

Além disso, usar `pnpm dep:refs` para confirmar item a item que `ModelPort` e os métodos de execução direta antigos do Adapter não têm chamadas entre pacotes esquecidas. Se o `knip` completo continuar incluyendo ruído já existente no repositório, deve-se registrar a verificação independente dos símbolos relacionados a esta tarefa, e não usar o ruído existente como desculpa para pular a limpeza.

## 11. Registro de conclusão

A implementação principal do Todo 01 foi feita em `a3f1082734`. Depois do merge, a revisão de limpeza encontrou e corrigiu três tipos de omissão:

- o Adapter state-only de `workspace/readState` passou a rejeitar explicitamente na fronteira única `createModel()`, sem continuar se passando pela `generateText/streamText` já removida;
- o Runtime state-only sem ModelFactory não registra mais ferramentas de Subagent;
- os testes de integração de Bootstrap removeram a ponte de compatibilidade do mock de Adapter `AiSdkModelTextRequest` e usam uniformemente o Executor padrão de Model Request; ao mesmo tempo foi limpo o campo `modelFactory` duplicado deixado pela migração mecânica.

O Model raiz de execução vem uniformemente do ModelFactory; `Model.bind()` e o wrapper transparente de contexto de chamada continuam como caminhos legítimos de derivação a partir de Models existentes, sem serem afetados pela formulação incorreta anterior de que "ModelFactory é a única porta de produção de todos os Models".