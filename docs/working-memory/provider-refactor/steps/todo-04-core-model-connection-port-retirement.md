# 04 Aposentadoria da Core Model Connection Port

> Status: concluído
>
> Data: 2026-08-24
>
> Roadmap geral: [`todo-00-model-abstraction-unification-roadmap.md`](./todo-00-model-abstraction-unification-roadmap.md)
>
> Tarefas anteriores: [`todo-02-ai-sdk-execution-registry-retirement.md`](./todo-02-ai-sdk-execution-registry-retirement.md),
> [`todo-03-provider-model-ownership-and-property-totality.md`](./todo-03-provider-model-ownership-and-property-totality.md)

## 1. Objetivo da tarefa

Remover `ModelConnectionPort` / `ModelConnectionInfo` do Core e dos Contracts de negócio comuns. A verificação de capacidade do Core passa a ler uniformemente o `properties` do Model Active atual; fatos de conexão física como API Key, Header, baseURL, kind do SDK do Provider e providerOptions existem apenas na implementação de execução de requisição do Adapter.

```text
当前

Core Runtime / Tool
  |- Active Model.properties
  `- ModelConnectionPort.resolveConnection(ModelRef)
       |- apiKey / headers
       |- baseURL / providerKind
       `- providerOptions
             |
             `--> Core 再次推断 WebSearch / MCS / diagnostics

目标

Core Runtime / Tool
  `- Active Model.properties
       |- supportsNativeWebSearch
       `- supportsMidConversationSystem

Adapter private execution
  `- baseURL / SDK kind / credentials / headers / providerOptions
```

## 2. Princípios centrais

1. A capacidade do modelo é um fato estático do Effective Model Config e só pode ser lida a partir de Active Model.properties;
2. A Model Config Rule que produz o fato de capacidade pode combinar correspondências por modelo, Provider, tipo de API e outros contextos de resolução, mas o Core não volta a inferir capacidade a partir de Endpoint, tipo de Provider ou modelId específico;
3. A Connection é um detalhe de implementação de requisição do Adapter, não um serviço de consulta de Tool/Runtime;
4. API Key e Header não devem entrar no Core por causa de uma verificação de capacidade;
5. Este Todo não refatora Telemetry e não adiciona DTO de Connection, Observation ou Context redigido;
6. Se o Adapter ainda precisar de parâmetros de conexão internamente, usa tipos privados, que não podem ser exportados de `@zcode/contracts`.

## 3. Consumidores atuais e tratamento alvo

### 3.1 Mid-conversation System

Atualmente `mid-conversation-system.ts` infere o MCS por `providerKind + baseURL + modelId hardcode` e constrói um Connection Context redigido. O alvo passa a ser:

```text
Active Model.properties.supportsMidConversationSystem
        +
execution override.mode = force
        |
        v
useMidConversationSystem
```

- A fórmula final é fixa em `mode === "force" || model.properties.supportsMidConversationSystem`;
- `auto` lê diretamente a property; `force` é um override desta chamada, que não modifica as Model properties nem entra no Model Config;
- A verificação acontece no ponto de chamada que gera as mensagens do Provider desta vez; `midConversationSystemMode` não entra no ModelFactory;
- Remover o hardcode de fast model ID, a allowlist de baseURL, o provider kind e o fallback de resolução de Connection;
- O resultado da decisão mantém apenas o boolean/reason necessários ao negócio, sem carregar a Connection;
- A Model Config Rule assume a declaração dos fatos para as diferentes combinações de modelos e formas de acesso.

### 3.2 Native WebSearch

Atualmente o WebSearch resolve primeiro a Connection e depois julga o suporte com base no endpoint Anthropic/provider. O alvo passa a ser:

- O Tool lê `properties.supportsNativeWebSearch` do Model atual;
- Quando false, retorna o erro de configuração recuperável já existente;
- Quando true, o Adapter continua codificando a native tool do Provider;
- O Adapter escolhe a implementação de codificação apenas pelo `api.type` do Provider Config completo, sem inferir capacidade por allowlist de baseURL;
- Se o Adapter não puder codificar aquele tipo de API, precisa lançar um `InvalidModelRequest` tipado antes da requisição de rede, não pode devolver `undefined` e remover a Tool silenciosamente, nem contornar a limitação de implementação por causa do Config;
- generate e stream compartilham o mesmo caminho de codificação e de fail-closed;
- Remover do Core `resolveWebSearchModelConnection()`, `supportsProviderNativeWebSearch(connection)` e os campos de diagnóstico de Connection.

### 3.2.1 Regras de capacidade do Model Config

`supportsNativeWebSearch` e `supportsMidConversationSystem` são gravados uniformemente nas Model Config Rules do ZCode Built-in / Personal, terminando como Effective Model Config.properties. A atribuição da configuração fica no Model Config, o que não significa que as regras só possam casar por modelId:

```text
Model Config Rule resolve context
|- providerId
|- modelId
`- provider.api.type
          |
          v
Effective Model Config.properties
|- supportsNativeWebSearch
`- supportsMidConversationSystem
```

- Quando a capacidade vale de forma geral para o modelo, usar apenas `modelMatch`;
- Quando a capacidade vale apenas em um Provider de produto específico, combinar `modelMatch + providerMatch`;
- Quando a capacidade depende da forma de acesso por protocolo, combinar `modelMatch + apiMatch`;
- Se no futuro for realmente necessário diferenciar por deploy de Endpoint, deve-se estender o contexto de resolução declarativo da Model Rule, sem devolver a checagem de URL ao Runtime, ao Core, ao Importer ou ao Adapter;
- As Rules gerais Built-in fornecem valores padrão completos e conservadores, e as Rules precisas posteriores cobrem as diferenças reais;
- Os valores concretos de capacidade se baseiam no material real de suporte do modelo e do serviço, e não numa tradução mecânica da antiga allowlist de hostname;
- O importer Legacy migra apenas os fatos explicitamente expressos na configuração antiga; na ausência de fato explícito, não adivinha nem fixa capacidade por Provider kind, baseURL ou modelId.

### 3.3 Embedded Search

Atualmente o interruptor final do Embedded Search depende apenas de uma flag global e da disponibilidade de Bash, e a Connection só é usada para construir o contexto de diagnóstico. O alvo é remover diretamente o contexto de Connection/ModelRef:

```text
embeddedSearchBranchEnabled + bashAvailable -> decision
```

Não continuar passando baseURL/providerKind/modelId só para preservar um objeto de diagnóstico.

### 3.4 Tool/Runtime Context

Remover os seguintes campos públicos e o respectivo repasse:

- `AgentRuntimeDeps.modelConnectionPort`;
- `AgentRuntime` / `AgentRuntimeInternal.modelConnectionPort`;
- `ToolExecutionContext.modelConnectionPort`;
- As cópias da Port em tool executor, Child Runtime e Workflow;
- O par `modelRef + modelConnectionPort` que existe apenas para verificação de capacidade.

Os pontos de chamada que precisam da capacidade do modelo atual recebem ou acessam o `Model` atual. Não criar outra `ModelCapabilities` nem um context consciente de Connection.

A obtenção de Tools pelo Tool Registry se divide em duas semânticas claras:

```text
Tool Registry
|- 非执行 inventory -> 返回已注册 Tool，不需要 Model
`- 本次请求工具集 -> 必须接收当前 Active Model，再按 properties 过滤
```

- Campos de compatibilidade persistidos, orientação de Context e inventário de Plugin, que são usos não-executivos, leem o Tool Registry diretamente;
- Ao entrar de fato na requisição principal, no Compact, na Memory ou na execução de Child Agent, é obrigatório usar o Active Model daquela própria execução;
- O modelo de um Child Agent pode ser diferente; o pai passa apenas o inventário de Tools registradas, e o Child Runtime filtra pelo seu próprio Active Model;
- Não é permitido construir Model de fallback, Model padrão ou Model falso a partir da Session Selection ou da Connection.

### 3.5 Contracts e Adapter

Remover do público:

- `model-connection.port.ts`;
- `ModelConnectionProviderKind`;
- `ModelConnectionInfo`;
- `ModelConnectionPort`;
- exports de barrel;
- `AiSdkModelAdapter.resolveConnection()`;
- `AiSdkResolvedModelConnection`.

Se as funções de execução internas do Adapter precisarem de `baseURL/providerKind/apiKey/headers/providerOptions`, definí-los como tipos locais ou privados do Adapter. Eles não podem ser importados pelo Core, pela camada de negócio do Bootstrap nem por Tools.

## 4. Fronteira de Telemetry

O Status/Telemetry de rede atual já tem campos próprios como providerId, model, baseURL e providerKind. Este Todo não julga se esse design é razoável nem o refatora através de uma Connection Port.

Permitido: depois de remover a Port, o Adapter continua preenchendo os campos existentes nos pontos onde os eventos de rede já são gerados, com os fatos de execução que ele próprio conhece.

Proibido:

- Adicionar `TelemetryContext`;
- Adicionar `ModelTelemetryObservation`;
- Usar a Connection completa como payload de evento;
- Manter a Connection no Core por causa do Telemetry;
- Aproveitar para separar Product Status de Telemetry.

O design de longo prazo do Telemetry é discutido em separado.

## 5. Testes primeiro

### 5.1 Fatos de capacidade

1. `supportsMidConversationSystem=true/false` habilita/desabilita o MCS;
2. O `force` de MCS mantém a semântica de override existente;
3. modelId/baseURL diferentes com a mesma property resultam no mesmo comportamento do Core;
4. `supportsNativeWebSearch=true/false` permite/recusa o WebSearch;
5. Um tipo de API não suportado pelo Adapter ainda falha de forma fechada antes da requisição de rede mesmo com property=true, e o comportamento de generate/stream é consistente;
6. O Embedded Search é decidido apenas pela feature flag e pela disponibilidade de Bash.

### 5.2 Fronteira de dados

1. apiKey, headers, baseURL, providerKind e providerOptions não aparecem no contexto de Core/Tool;
2. Active Model.properties é a única entrada da verificação de capacidade;
3. Main, Compact e Subagent usam as properties do seu próprio Model Active atual;
4. Atualizar o Config não muda a capacidade de um Loop já iniciado;
5. O inventário de Tools não-executivo não cria Model; o filtro de Tools de execução precisa ter o Active Model atual;
6. O Status/Telemetry de rede existente continua emitido pelo Adapter, sem mudar a quantidade nem o momento dos eventos.

### 5.3 Zeragem mecânica

- `rg 'ModelConnectionPort|ModelConnectionInfo' apps/zcode-cli/packages/core` retorna zero;
- Os Contracts públicos não exportam mais tipos de Connection;
- `resolveConnection` não é mais capacidade pública do Adapter;
- Não há mais no Core helpers que decidam MCS/WebSearch por baseURL/providerKind/modelId;
- Não há mais no importer Legacy lógica que adivinhe MCS/WebSearch por baseURL/providerKind/modelId;
- A codificação de Tool provider-native não usa mais `undefined` para significar “não suportado e removido silenciosamente”;
- Não são adicionados `*Capabilities`, `*ConnectionContext` ou `*Observation` como DTO substitutos.

## 6. Ordem de implementação

### Step A: passar o Active Model aos consumidores de capacidade

- Adicionar testes de falha baseados em property para MCS, WebSearch e Embedded Search;
- Mapear de onde vem o Model atual no contexto de Tool;
- Passar apenas o Model, sem Connection nem snapshot de capacidade derivado.

### Step B: migrar as verificações de capacidade

- O MCS passa a ler `supportsMidConversationSystem`;
- O WebSearch passa a ler `supportsNativeWebSearch`;
- O Embedded Search remove o contexto de Connection sem efeito;
- Remover o hardcode de Endpoint/model antigo e o fallback reason.

### Step C: remover a Port

- Remover os campos e o repasse em Runtime/Tool/Workflow;
- Remover o arquivo de Contracts e o export de barrel;
- Remover o `resolveConnection()` público do Adapter;
- Preservar os fatos de execução privados do Adapter.

### Step D: validar e submeter

- Executar os testes unitários de Core WebSearch, MCS, Embedded Search, Compact e Subagent;
- Executar a regressão de codificação do Adapter e de eventos de rede;
- Executar `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`;
- Conventional Commit independente.

## 7. Definição de conclusão

O Core não consegue mais obter uma Connection física de Provider e deixa de inferir capacidade de modelo por meio de Connection. A capacidade de negócio vem de Active Model.properties; conexão, autenticação e detalhes do SDK do Provider só são usados pelo Adapter ao executar a requisição. O Telemetry mantém o design existente e não gerou novas abstrações de Context ou Observation por causa desta remoção.