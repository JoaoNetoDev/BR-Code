# Model e ModelRequest

O código de negócio inicia requisições ao modelo através do Model. O chamador apenas escolhe o modelo, prepara messages/tools/schema e as Options comuns desta chamada, sem ler credenciais de Provider, Endpoint ou parâmetros de protocolo.

```ts
const model = modelFactory({
  providerId: "zai",
  modelId: "glm-5",
  options: { reasoningLevel: "high" },
});

const result = await model.generateText({
  messages,
  tools,
});
```

O Agent principal, o Subagent, o Automatic Compact, Title, Goal, Project Memory, Git, Repo Wiki, WebFetch, WebSearch e as demais tarefas de modelo usam essa fronteira de chamada.

## O que o Model representa

Model é o objeto chamável que já tem determinado o Provider, a configuração de modelo e as Options comuns:

```ts
interface Model {
  readonly providerId: ProviderId;
  readonly modelId: ModelId;
  readonly properties: ModelProperties;
  readonly optionSpecs: ModelOptionSpecs;
  readonly options: ModelOptions;

  bind(options?: ModelOptions): Model;

  generateText(request: ModelRequest): Promise<ModelResult>;
  streamText(request: ModelRequest): AsyncIterable<ModelEvent>;
}
```

`providerId` e `modelId` fornecem a identidade estável; `properties`, `optionSpecs` e `options` são os fatos completos de execução fixados pelo ModelFactory no momento da criação. O `RegistryProviderConfig/RegistryModelConfig` completo existe apenas como entrada privada de criação entregue pelo ModelFactory ao Adapter, e não é exposto pelo Model público. O Model não aceita Overlay Config esparso, nem completa Properties em tempo de execução.

Depois de criado, o Model é imutável e permite chamadas concorrentes. Atualizações de Provider Config ou de Registry não modificam Models existentes; uma nova execução cria um novo Model pelo ModelFactory, com base no Registry atual.

`bind(options)` deriva outro Model imutável sobre o mesmo Provider e o mesmo modelo. Serve principalmente ao Agent Loop, ao Subagent ou a tarefas isoladas que desejem fixar suas próprias Options. A implementação pode reaproveitar o executor subjacente e Services de longa duração; não é exigido recriar o HTTP Client ou a infraestrutura do SDK do Provider.

## Uma Request

ModelRequest descreve apenas esta chamada:

```ts
interface ModelRequest {
  messages: ModelMessage[];
  tools?: ModelTool[];
  responseJsonSchema?: JsonSchema;
  options?: ModelOptions;
  abortSignal?: AbortSignal;
}
```

As Options efetivas da requisição são formadas nesta ordem:

```text
Model Options
        |
        | Os valores desta chamada sobrescrevem
        v
Effective Request Options
```

As Request Options afetam apenas esta chamada e não modificam o Model. Tarefas como Compact que desejem um teto de saída menor devem fornecer explicitamente `maxOutputTokens` ao construir a Request; o Model se responsabiliza pela validação e não faz clamp silencioso no lugar do chamador.

A Request não carrega providerId, modelId, API Key, Endpoint, kind de Adapter nem qualquer `providerOptions`. Esses itens já estão determinados pela implementação de execução do Model.

Properties, Option Specs, a mesclagem de Options e a validação da Request estão em [`contract.md`](./contract.md).

## Do Model até a API do Provider

```text
ModelRequest
      |
      | merge options + validate
      v
Requisição efetiva neutro a provider
      |
      v
Provider Adapter
├─ Conversão dos campos de protocolo
├─ Patch de Request Body cru por option
├─ Token / Header dinâmicos
├─ Roteamento e retry
└─ Normalização de erros
      |
      v
Provider API
```

O chamador de negócio não precisa entender os formatos de campo dos diferentes Providers. Uma API Key comum pode vir do ProviderConfig usado na criação do Model; a autenticação dinâmica dos Account Providers é fornecida pelo Service no momento da requisição. A fronteira completa está em [`../registry/model-creation.md`](../registry/model-creation.md).

Temperature, top-p, top-k, penalty e seed não entram no ModelRequest público. Uma nova Option comum precisa antes formar um Schema fixo, uma Option Spec e uma semântica entre Adapters; não pode ser aberta à camada de negócio por meio de um Record arbitrário. O CEL restrito do Option Map e a fronteira do corpo final da requisição estão em [`model-option-map.md`](./model-option-map.md).

## Ciclo de vida do Model

A Session persiste um ModelSelection completo: a identidade do modelo é fixada, e modelos com suporte a Reasoning também guardam o nível concreto. No início da execução, o Registry/ModelFactory valida e congela as Options já declaradas pela Selection; o orçamento de saída de uma execução é fornecido pelo chamador concreto:

```text
Session ModelSelection
        |
        | ModelFactory(selection)
        v
Active Model do Agent Loop
├─ Step 1
├─ Tool Calls
├─ Step 2
├─ Automatic Compact
└─ Step N
```

Steps comuns e o Automatic Compact usam o Active Model atual do Loop. Mudanças comuns em Composer Selection, Session Selection e Registry não o modificam. Um Guide/"立即" recebido pelo Loop atual cria e troca um novo Active Model no limite de um Model Step; requisições já enviadas continuam usando o Model antigo.

O Subagent tem seu próprio Model. Quando existe uma Selection explícita, o modelo correspondente é criado; sem Selection explícita, ele obtém a Selection do pai conforme as regras de herança da Execution. Tarefas isoladas como Title, Memory e Repo Wiki também obtêm seus próprios Models, sem contornar a interface pública de chamada.

Objetos Model comuns são recolhidos pelo GC do JavaScript. Timer, Socket, Watcher, subprocessos e outros recursos que exigem liberação determinística são gerenciados por owners de longa duração, sem depender de quando o objeto Model é recolhido.

## Result, Event e atribuição

`ModelResult` unifica o resultado de chamadas não-streaming e `ModelEvent` unifica os eventos de streaming. Os tipos brutos e os erros brutos dos SDKs de Provider ficam encapsulados dentro do Adapter e não vazam diretamente para o código de negócio.

Em cada requisição, Usage, Trace, Model IO, custo, cota e erro são obtidos do Model efetivamente usado:

```text
Model efetivo
├─ providerId
├─ modelId
└─ effective options
        |
        v
Usage / Trace / Diagnostics
```

A atribuição não lê a seleção atual da caixa de entrada, a Session Selection alterada depois nem o campo opcional de model na resposta do Provider. O nome de modelo retornado pelo Provider pode servir como informação de diagnóstico de roteamento.

## Separação entre visualização e execução

A página de configurações e a página de seleção de modelo leem o ProviderConfig, o ModelConfig, a origem dos membros e o status projetados pelo Registry/Facade:

```text
Ver e escolher
└─ Registry / Facade View
   ├─ ProviderConfig
   ├─ ModelConfig
   └─ builtin / enabled / completeness

Execução real
└─ ModelFactory(selection)
   ├─ Registry lookup / validate
   ├─ Adapter private create
   └─ Model
```

Assim o Host consegue exibir, agrupar e validar modelos sem precisar construir um Model chamável. disabled e incomplete são estados anteriores à criação e não entram no contrato de requisição do Model; membros duplicados já foram desambiguados na etapa de Inventory pela regra «manter o primeiro, Built-in-wins». O Model só é criado quando o Agent Loop ou a tarefa de modelo isolada começa de fato.

## Subdocumentos

[`contract.md`](./contract.md) define ModelProperties, ModelOptionSpecs, ModelOptions, as verificações de ModelRequest, a semântica de resultado e a fronteira do mapeamento de reasoning do Provider.