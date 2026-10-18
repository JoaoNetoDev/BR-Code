# 02 Aposentadoria do Execution Registry do AI SDK

> Status: concluído
>
> Limite confirmado: o Adapter, ao criar o Model, recebe diretamente um único Registry Provider Config e um
> Registry Model Config, já integralmente validados; não é permitido migrar para o novo Registry de negócio os
> campos, valores padrão, faces de consulta, classificação de Provider ou DTOs de execução equivalentes do antigo
> Execution Registry.
>
> Data: 2026-08-24
>
> Roadmap geral: [`todo-00-model-abstraction-unification-roadmap.md`](./todo-00-model-abstraction-unification-roadmap.md)
>
> Design relacionado: [`../design/registry/model-creation.md`](../design/registry/model-creation.md)

## 1. Objetivo da tarefa

Remover do `AiSdkModelRegistry` interno do Adapter a semântica de Registry mutável para configuração de Provider,
de modo que o Provider Registry de negócio se torne a única fonte estática de fatos sobre Provider/Model. O
ModelFactory, ao criar o Model, entrega ao Adapter de uma só vez os fatos já resolvidos; o Adapter devolve um Model
que encapsula a execução do AI SDK, sem mais consultar de forma reversa outro Registry a partir do ModelRef.

```text
Atual

Business Provider Registry
        |
        +--> ApiProviderModelRuntime.modelFactory
        |
        `--> revision subscription
                 |
                 v
        AiSdkModelAdapter.replaceRegistryConfig
                 |
                 v
        mutable AiSdkModelRegistry
        |- providers map
        |- defaultProviderId
        |- resolve(ModelRef)
        |- bindModel(ModelRef)
        `- resolveConnection(ModelRef)

Alvo

Business Provider Registry
        |
        | ModelFactory faz um único lookup no create
        v
RegistryProviderConfig + RegistryModelConfig + ModelOptions
        |
        | criação única; sem copiar para um segundo conjunto de Config
        v
Adapter.createModel(Config completo + dependências de execução explícitas)
        |
        v
O closure do Model mantém estáticos os fatos de execução do AI SDK
        |
        `--> cada request attempt só resolve o Request Auth dinâmico
```

## 2. Decisões centrais

### 2.1 O que é aposentado é o Registry, não a capacidade de execução do AI SDK

Deve ser preservado:

- a capacidade de execução dos SDKs Anthropic Messages, OpenAI Responses e OpenAI Chat Completions atualmente
  declarada pelo `ProviderApiType` oficial; as classificações de execução antigas `gateway/custom` não podem ser
  migradas para a nova abstração sem um API type de Config oficial;
- projeção de API baseURL, Header estático e API Key;
- proxy, CA, no-proxy, Endpoint Routing;
- Client Request Signing e o cache em nível de processo necessário;
- sobrescrita dinâmica de request-auth;
- compatibilidade de request body do Provider;
- Retry, Stream Recovery, Usage, Status, Telemetria e normalização de erros.

O que é removido é a face de consulta de negócio que permitia ao Adapter voltar a assumir "quais Providers existem,
qual é o Provider padrão, qual modelo resolver a partir de uma string, qual Connection devolver".

### 2.2 Não se preserva a mesma estrutura com outro nome

É proibido renomear `AiSdkModelRegistry` na forma original para:

- `ExecutionModelRegistry`;
- `ExecutionModelBindingRegistry`;
- `ConnectionRegistry`;
- `Runtime Provider Registry`.

A implementação pode ter tipos de parâmetros privados do Adapter, closures e caches de fábrica, mas não pode
oferecer lista de Providers, seleção de padrão, resolução de ModelRef, substituição de configuração mutável ou
lookup genérico de Connection.

### 2.3 A criação do Model congela os fatos estáticos

Fixados no momento da criação do Model:

- providerId / modelId;
- kind/type de API;
- baseURL;
- headers estáticos;
- API Key estática ou accessId da conta;
- mapeamento de options do Provider;
- properties / optionSpecs / options do Model;
- referências de infraestrutura necessárias a esta execução.

O que se congela são os fatos estáticos de execução e as referências de dependência, não o `LanguageModel` final com
autenticação dinâmica já concluída. Atualizações posteriores do Registry não alteram Models já criados; cada request
attempt ainda resolve o Request Auth dinâmico atual e obtém material refrescado no Retry. O auth em tempo de
requisição só pode sobrescrever API Key/Header dinâmicos explicitamente permitidos; não pode alterar Endpoint, kind
de API, options do Provider ou capacidades do modelo.

`apiKeyEnv`, `apiKeyRequired`, variáveis de ambiente padrão, `defaultProviderId`, resolução por modelId puro e
lookup de Connection do Registry antigo são removidos sem exceção e não entram no Provider Config, Registry, Model
Config de negócio nem em abstrações públicas de execução.

### 2.4 O Adapter consome diretamente o Registry Config completo

A entrada de criação do Adapter recebe diretamente o mesmo objeto `RegistryProviderConfig` e o mesmo objeto
`RegistryModelConfig` produzidos pela fronteira de completude do Todo 03. Não é permitido antes copiá-los ou
decomposição-los em `AiSdkModelProviderConfig`, `ExecutionProviderConfig`, `ExecutionModelConfig`,
`ResolvedConnection` ou qualquer outro DTO de forma equivalente.

```text
Sparse Provider / Model Config
             |
             v
Overlay + resolve + validateComplete + requireComplete
             |
             v
RegistryProviderConfig + RegistryModelConfig
             |
             | o mesmo objeto é passado diretamente
             v
Adapter.createModel
```

O Adapter pode ignorar campos não ligados à execução, como `label`, `visibility` ou membros do modelo; "consumir
apenas parte" não justifica redeclarar um tipo público `Pick<>` nem copiar a projeção de execução. O
`@zcode/adapters` pode depender dos tipos completos do pacote de domínio puro `@zcode/provider`; não se deve copiar
Provider/Model Config para `@zcode/contracts` para evitar essa dependência.

### 2.5 Divisão entre Config, opções de binding e dependências de execução

Além do Config completo, passam apenas fatos que não podem ser expressos pelo Config:

- `providerId`, `modelId`: são chaves de índice do Registry, não precisam ser reescritas no objeto Config;
- `ModelOptions`: valores de execução já vinculados pela Selection/`Model.bind()` atual, não declaração de Model
  Config;
- `ModelRequestDependencies`: Source de request-auth dinâmico com escopo desta execução, fora do Config;
- runtime, network, proxy, CA, routing, signing, retry, logger e sink de status/telemetria em nível de processo:
  injetados pelo construtor do Adapter ou por seus Services de infraestrutura privados, não repassados a cada
  Provider/Model Config.

A Key estática de `api-key` vem diretamente de `providerConfig.access`. Provedores do tipo conta fixam no Config um
snapshot de Account Access não secreta; credenciais dinâmicas de conta são resolvidas por attempt; a seleção
estruturada de conexão e a troca concreta de Access Context ficam a cargo do Todo 07. Este Todo não resolve fatos
de conta a partir do `accessId` nem cria um segundo Config de autenticação.

## 3. Forma da interface alvo

A interface pública do domínio continua sendo apenas `ModelFactory` e `Model`. A entrada de criação do Adapter
recebe os fatos abaixo; a implementação pode usar um parâmetro de objeto, mas esse objeto é apenas um parâmetro
de função, não um tipo de Config de negócio consultável, persistível, sincronizável ou reutilizável:

```ts
adapter.createModel({
  providerId,
  modelId,
  providerConfig, // RegistryProviderConfig
  modelConfig, // RegistryModelConfig
  options,
  requestDependencies,
});
```

O Adapter obtém `properties`, `optionSpecs` e `reasoningMapping` diretamente de `modelConfig`, e `api`, `access` e
Headers estáticos diretamente de `providerConfig`. Não deve ser o Bootstrap a quebrar os campos antecipadamente,
nem o Adapter a refazer a validação de completude, a verificação de membro do modelo, a verificação de `enabled` ou
o preenchimento de defaults do Config.

Internamente o Adapter pode capturar por closure as duas referências completas de Config e criar, para o AI SDK,
parâmetros de chamada privados de curta duração; mas não pode guardar outro mapa de Providers nem exportar novos
tipos de Config de execução do barrel para Core/Service/Protocol.

Signing state, network transport, serviço de Endpoint Routing, logger, runtime e status sink compartilhados em nível
de processo continuam sendo injetados pelo Bootstrap no Adapter. Cache compartilhado armazena apenas recursos de
execução caros, sem oferecer capacidade de consulta de negócio.

## 4. Escopo de remoção e migração

### 4.1 `AiSdkModelRegistry`

Remover ou desmembrar:

- o map mutável `providers`;
- `replaceConfig()`;
- `defaultProviderId`;
- a dependência de `parseModelRef()`;
- `resolve()`;
- `bindModel()`;
- `resolveConnection()`;
- `AiSdkResolvedModelConnection`;
- helpers de list/default cujo propósito seja consultar Provider/Model;
- a estrutura que colocava `ModelProperties` no valor resolvido do Registry do Adapter.

Podem ser extraídos como funções puras privadas do Adapter ou serviços de execução:

- a criação de um Config de Provider em uma factory `LanguageModel`;
- a combinação controlada de auth estático e dinâmico;
- a composição de transport;
- o ciclo de vida do signing manager;
- o wrapper de fetch de Business Error do Provider;
- o cache de instâncias de modelo do SDK.

Se o cache key precisar de campos como providerId/modelId/baseURL, ele continua sendo apenas cache de recursos de
execução; não pode responder a consultas de negócio de Provider/Model com seu conteúdo.

### 4.2 `AiSdkModelAdapter`

Remover:

- o parâmetro `registry` do construtor;
- `replaceRegistryConfig()`;
- o antigo `generateText(AiSdkModelTextRequest)` / `streamText(...)`, se o Todo 01 ainda não os tiver removido;
- `registry.bindModel(options.model)` dentro de `createModel()`;
- o suporte a ModelRef/string e a Provider padrão.

Passar a:

- `createModel()` recebendo diretamente providerId/modelId, o `RegistryProviderConfig` completo, o
  `RegistryModelConfig` completo, as options vinculadas e as dependências de execução necessárias;
- `properties`, `optionSpecs`, `reasoningMapping`, API type, baseURL, Headers estáticos e Access lidos do Config
  completo, sem projeção campo a campo pelo Bootstrap;
- o closure do Model chamando a source de request-auth a cada attempt e projetando o resultado sobre os fatos
  estáticos de execução do Provider congelados;
- o runner recebendo, a cada request attempt, o `LanguageModel`/parâmetros de execução resolvidos já combinados com
  o Request Auth daquela tentativa, sem manter Registry; o `LanguageModel` com auth dinâmico concluído não é
  congelado na criação do Model.

### 4.3 Bootstrap `ApiProviderModelRuntime`

Remover:

- a lógica de Registry revision subscription existente apenas para `#syncExecutionRegistry()`;
- a cópia total de `createApiProviderAiSdkRegistryConfig(view)`;
- `#modelAdapter.replaceRegistryConfig(...)`;
- o código que converte a Business Registry View em um segundo map de `providers`.

Preservar ou simplificar:

- o `modelFactory` buscando Provider/Model no Registry de negócio;
- a validação de completude e de options na fronteira Registry de negócio/ModelFactory;
- a entrega direta ao Adapter do Config completo de Provider/Model, das options vinculadas e das request
  dependencies;
- restrições de Selection/escopo de execução, como o visible output budget, formando as options finais vinculadas
  antes de chamar o Adapter.

Se, ao final, `ApiProviderModelRuntime` só embrulhar o `modelFactory`, ele pode ser mais adiante embutido como
função de criação de ModelFactory; não se deve criar ciclo de vida de start/subscription apenas para preservar o nome
da classe.

### 4.4 Antigo Bootstrap model-config

Auditar e reduzir `createAiSdkModelRegistryConfig()`, `createRuntimeAiSdkModelRegistryInfrastructure()`:

- a lista de Providers e o Provider padrão deixam de entrar no Adapter;
- a infraestrutura de execução (rede, assinatura, Endpoint Routing, runtime e env) pode ser mantida e renomeada com
  precisão;
- helpers de Probe/E2E passam a criar explicitamente um Model de teste, em vez de primeiro construir um Registry
  inteiro.

### 4.5 Diferenças de Reasoning entram nas ZCode Built-in Model Config Rules

Os fatos de diferença de Reasoning para todos os modelos e tipos de API oficiais passam a ser declarados
uniformemente pelas ZCode Built-in Model Config Rules:

- `optionSpecs.reasoningLevel.values/default` declara as níveis públicos;
- `reasoningMapping[level]` declara o parâmetro de requisição do Provider correspondente a aquele nível;
- mapeamentos extras como `disabled`, `off`, `nothink`, `none` podem declarar os parâmetros de execução que
  desligam o raciocínio;
- as Personal Model Config Rules continuam vindo depois das Built-in Rules e sobrepondo as configurações fornecidas
  explicitamente.

O Adapter executa apenas o mapeamento progressivo:

```text
Model.options.reasoningLevel
             |
             v
modelConfig.reasoningMapping[level]
             |
             v
codificação de protocolo correspondente a providerConfig.api.type
```

Remover `resolveReasoningDisabledProviderOptions()`, a responsabilidade de montagem de requisição do antigo Model
Catalog e toda lógica que adivinha o nível a partir de modelId, antigo Provider kind, qualquer campo arbitrário de
providerOptions ou `extra_body` legado. O que migra para o Built-in Config são os fatos de diferença entre
modelos/APIs, não esses antigos algoritmos de inferência.

`runtime-thought-level` hoje ainda serve à Telemetria existente. Este Todo não refatora o schema, o Contexto ou os
canais de envio da Telemetria; apenas remove sua dependência do antigo Catalog, do hardcode por modelId e da
antiga classificação de Provider. As observações que podem ser obtidas a partir das opções atuais do Model e de
mapeamentos explícitos continuam sendo registradas; campos que não podem ser obtidos com confiabilidade mantêm a
semântica atual de unknown/padrão, sem restaurar inferências reversas por sake de telemetria.

## 5. Fronteira cruzada com o Todo 03

O Todo 03 está endurecendo os tipos completos de Provider/Model do Registry. Os dois compartilham o princípio:

```text
Sparse Rule -> resolve + validateComplete -> Complete Registry Model
                                          |
                                          v
                               Adapter.createModel
```

O Todo 02 não deve preencher defaults de capacidade por conta própria nem reestabelecer
`requireCompleteProperties()`. A troca definitiva da interface do Adapter e a remoção do Registry antigo devem se
basear nos tipos completos já integrados pelo Todo 03; antes disso é permitido apenas classificar testes e
identificar a infraestrutura de execução que pode ser preservada, sem introduzir tipos completos temporários nem
helpers de validação duplicados.

## 6. Testes primeiro

### 6.1 Ciclo de vida

1. Depois que o Model A é criado, atualizar o Registry de negócio; A continua usando o kind de API/baseURL/headers
   estáticos antigos;
2. criar o Model B após a atualização; B usa os fatos novos;
3. após remover o Provider, A já criado consegue concluir a requisição atual e novas criações falham;
4. o Adapter não assina nem consulta o Registry de negócio;
5. não existe defaultProviderId nem fallback por modelId puro.

### 6.2 Autenticação

1. Model do tipo api-key usa a Key fixada na criação;
2. Model do tipo zhipu-account fixa o accessId e cada attempt pode refrescar as credenciais dinâmicas;
3. request-auth sem Source/sem material falha antes da rede;
4. Retry consegue obter o auth atualizado;
5. auth dinâmico não pode sobrescrever baseURL, kind de API, options do Provider ou properties;
6. Segredos não entram em ModelSelection, eventos de Session, logs ou Registry View.

### 6.3 Capacidades de execução do Provider

Migrar os testes do Registry antigo por responsabilidade, sem preservar um a um a forma de construção:

- cada tipo de API cria o LanguageModel correto do AI SDK;
- as combinações de proxy/CA/no-proxy e Endpoint Routing permanecem iguais;
- o isolamento e o ciclo de vida do gate de assinatura e do cache de keys permanecem iguais;
- a compat JSON do OpenAI Responses, a compat de stream do Anthropic e a compat de body permanecem iguais;
- Business Error do Provider, TLS e a normalização de Retry/Stream Recovery permanecem iguais;
- generate/stream compartilham os mesmos fatos estáticos de execução.

### 6.4 Config e Reasoning

1. o Provider/Model Config recebido pelo Adapter é a mesma referência do objeto publicado pelo Registry, sem DTO
   de execução equivalente no caminho;
2. o Adapter não preenche campos esparsos, não reexecuta decisões de enabled, membro ou completude;
3. reasoningLevel gera parâmetros de requisição apenas progressivamente, via `reasoningMapping[level]`;
4. tanto o Effective Mapping formado pela sobreposição posterior das
   Built-in e Personal Rules quanto o mapeamento resultante são executáveis;
5. disabled/off/nothink/none usam Mapping explícito, sem limpeza genérica de campos nem hardcode de modelo;
6. Mapping ausente para um level público falha na fronteira de completude do Registry e não chega ao Adapter;
7. a Telemetria não ganha Contexto, DTO de Observation nem nova inferência reversa por causa da remoção do Catalog.

### 6.5 Fronteiras mecânicas

- nenhum `new AiSdkModelRegistry` em código de produção;
- nenhum `replaceRegistryConfig` / `replaceConfig` em código de produção;
- a entrada pública do Adapter não aceita `ModelRef | string`;
- nenhum `AiSdkModelProviderConfig`, `AiSdkModelRegistryConfig` ou DTO substituto equivalente em código de
  produção;
- a montagem de requisição do Adapter não importa o antigo Model Catalog, `AiSdkProviderKind` nem hardcode de
  reasoning por modelId;
- Core/Service/Protocol não importam projeções de execução privadas do Adapter;
- `dep:refs` e `rg` confirmam que os antigos métodos de consulta do Registry não têm referências.

## 7. Ordem de implementação

### Step A: fixar testes de comportamento

- classificar os testes do Registry antigo em "comportamento de consulta de negócio" e "comportamento de
  infraestrutura de execução";
- adicionar testes de falha para o congelamento dos fatos estáticos do Model e para o refresh dinâmico do Request
  Auth;
- definir o teste representativo mínimo para cada API de Provider.

### Step B: estabelecer o caminho de criação de execução de Provider único

- extrair do Registry class a factory pura de Provider e as combinações de transport/signing;
- fazer `createModel()` do Adapter receber diretamente o Registry Provider/Model Config completo;
- remover do Bootstrap a segunda projeção campo a campo de API/access/properties/optionSpecs/reasoningMapping;
- fazer o runner consumir o closure de execução já vinculado.

### Step C: trocar o ModelFactory de negócio

- `ApiProviderModelRuntime.modelFactory` projetando diretamente um único Provider/Model;
- remover o sync/subscription total do Registry;
- verificar o isolamento entre Models antigos e a nova revision do Registry.

### Step D: remover fisicamente a API do Registry

- remover `AiSdkModelRegistry`, os tipos de Config e de resolved connection;
- remover a montagem de requisição e a inferência reversa do antigo Catalog/reasoning-disabled;
- migrar helpers de Probe/E2E/teste;
- remover dos testes antigos os casos que só validavam defaultProvider/list/parse.

### Step E: verificação e commit

- rodar os testes unitários afetados de Adapter, Bootstrap e Core;
- rodar `pnpm typecheck`, `pnpm lint`, `pnpm fmt:check`;
- rodar regressões E2E/de protocolo representativas para endpoint routing, request auth, stream/retry;
- formar um Conventional Commit junto com o Todo 03 já decidido e implementado em conjunto.

## 8. Definição de conclusão

Concluído, "Registry" no repositório refere-se somente ao Provider Registry de negócio. O Adapter pode ter cache de
recursos de execução e services de infraestrutura, mas não pode manter outra lista de Providers, resolver
ModelSelection, oferecer lookup de Connection ou fazer hot swap de Config. Cada Model mantém diretamente o Registry
Provider/Model Config completo do instante de sua criação e as options vinculadas; o material de acesso dinâmico é
resolvido apenas no request attempt. Os parâmetros de requisição de Reasoning vêm só do Mapping explícito do
Effective Model Config, e não mais do antigo Catalog, do Provider kind ou de inferência por modelId.

## 9. Resultado da implementação

- O map mutável de Providers, o Provider padrão, `resolve` / `bindModel` / `resolveConnection` e a interface de hot
  swap do Adapter foram removidos; não existe mais `AiSdkModelRegistry` no código de produção;
- `AiSdkModelAdapter.createModel()` recebe diretamente a mesma referência `RegistryProviderConfig` /
  `RegistryModelConfig`, e o closure do Model congela os fatos estáticos da criação, sem criar Config de execução
  equivalente;
- O Bootstrap removeu a sincronização e a subscrição completas do Registry de negócio para o Registry do Adapter,
  buscando um único Provider/Model apenas no momento da criação pelo ModelFactory;
- request-auth e credenciais dinâmicas de conta continuam sendo resolvidas por request attempt, com falha antes de
  qualquer requisição de rede quando o material está ausente;
- SDK do Provider, proxy, CA, Endpoint Routing, assinatura, Retry, Stream Recovery, Usage, Status e normalização de
  erros continuam a cargo da infraestrutura de execução privada do Adapter;
- O antigo helper de reasoning-disabled e os caminhos de execução que adivinhavam o nível por modelId/classificação
  de Provider foram removidos; o mapeamento explícito vem das Effective Model Config Rules; o desligamento de
  reasoning usa apenas chaves de Mapping extras explícitas e, quando ausentes, nenhum parâmetro de reasoning é
  enviado;
- O Todo 02 e o Todo 03 foram implementados e submetidos juntos como a mesma cadeia de fatos, sem split artificial
  em dois commits mutuamente dependentes.