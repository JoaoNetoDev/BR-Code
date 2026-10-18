# Revisão de Limpeza da Unificação da Abstração de Modelo

> Status: pré-revisão de limpeza após a conclusão de M4; os itens de M4 foram zerados, os demais problemas aguardam decisão item a item
>
> Data: 2026-08-24
>
> Design alvo: [`../design/design.md`](../design/design.md)
>
> Fase paralela atual: [`../steps/04-model-execution-cutover.md`](../steps/04-model-execution-cutover.md)

## 1. Posicionamento do documento

O Provider Refactor já estabeleceu o novo Provider Config, as Model Config Rules, o Registry, o ModelFactory e a fronteira de chamada de `Model`, e removeu um grande volume de implementações antigas de Provider / Model. M4 migrou execuções especiais como tarefas off-peak e Subagent para a mesma cadeia padrão de chamada de modelo.

Esta revisão deixa de avaliar apenas se uma fase foi concluída conforme o plano, e passa a verificar se o sistema ainda possui um segundo conjunto de abstrações de modelo, um segundo caminho de montagem de modelo ou uma segunda fonte de verdade sobre modelos. O resultado da revisão registra primeiro os fatos de código e os riscos estruturais; o que exigir decisão de design é mantido como questão aberta, para ser discutido item a item antes de entrar no design formal e no plano de implementação.

Esta revisão tem uma divisão de trabalho clara com a revisão de código novo da fase paralela:

```text
Revisão de código novo da fase paralela
`- verifica se a nova implementação de M4 está correta e completa e não introduz problemas de comportamento ou qualidade

Esta revisão de limpeza da unificação da abstração de modelo
`- verifica quais códigos antigos, abstrações antigas e caminhos de compatibilidade ainda podem sair fisicamente depois que a nova cadeia está estabelecida
```

Portanto, esta revisão não faz uma revisão geral de implementação do código novo de M4. A nova implementação só é lida como evidência de deleção ao julgar se um trecho de código antigo já foi completamente substituído pela nova cadeia. O produto central aqui é a lista de limpeza de código antigo, suas dependências, os pré-requisitos de deleção e as condições mecânicas de zeragem, e não outra lista de problemas do código novo de M4.

Esta revisão responde às seguintes questões:

1. o código de negócio ainda consegue contornar o `ModelFactory` e executar requisições de modelo usando diretamente o Adapter antigo ou o DTO de requisição antigo?
2. `ModelSelection`, `Model`, a identidade do modelo, a requisição e o resultado ainda são expressos de forma misturada pelo `ModelRef` antigo?
3. fora de Provider / Model Config, ainda há Catalog, Runtime Config, Endpoint ou hardcode de modelId fornecendo fatos sobre modelos?
4. Core, Service, Protocol e UI ainda consomem o DTO completo antigo de Provider / Model?
5. quais implementações antigas devem ser fisicamente removidas e quais apenas precisam ficar restritas às fronteiras de Adapter, Protocol ou importer de uso único?
6. que verificações mecânicas ainda são necessárias após M4 para provar que a abstração do sistema realmente convergiu.

Mais diretamente, esta revisão pergunta continuamente:

> que capacidade substituta o novo design já ofereceu; por que o código que depende do design antigo ainda existe; é possível deletá-lo agora; e, se ainda não for possível deletar, qual é o último pré-requisito de migração que falta.

## 2. Arquitetura alvo da revisão

O sistema alvo tem apenas uma cadeia de formação e execução de modelo:

```text
Persistência / Protocol
    ModelSelection
          |
          v
Effective Provider Config + Effective Model Config Rules
          |
          v
    Provider Registry
          |
          v
      ModelFactory
          |
          v
      Active Model
      |- identity
      |- properties
      |- optionSpecs
      |- options
      `- generateText / streamText
          |
          v
 Projeção de execução interna do Adapter
          |
          v
     Provider API
```

As responsabilidades alvo de cada conceito são:

| Conceito                      | Responsabilidade única                                                                        |
| ------------------------- | -------------------------------------------------------------------------------- |
| `ModelSelection`          | Expressar a intenção do usuário ou do produto ao criar um modelo no futuro; pode ser persistida e transmitida entre processos                       |
| Effective Provider Config | Determinar Provider, API, Access, membros de modelo e visibilidade para o usuário                                 |
| Effective Model Config    | Determinar Properties do modelo, Option Specs e mapeamento de parâmetros de requisição                                 |
| Provider Registry         | Agregar a Effective Config e fornecer resolução e View por identidade de Provider/Model                   |
| `ModelFactory`            | Montar um `Model` completo a partir da Selection, dos fatos do Registry e das dependências de requisição                          |
| `Model`                   | Fatos de modelo imutáveis usados na execução atual e única interface de chamada de modelo                                   |
| Adapter                   | Codificar `ModelRequest` como requisição de uma API de Provider concreta; não produzir um segundo conjunto de abstrações de modelo para a camada de negócio     |
| Model Identity            | Se eventos e Telemetry realmente precisarem, registrar apenas a identidade real do modelo, sem carregar a semântica de Selection ou Options |

No final, Core deve conhecer apenas `ModelSelection` e `Model`; se necessário, pode conhecer uma Model Identity mínima e somente leitura. Core não deve
conhecer o Adapter do AI SDK, Provider Connection, baseURL, providerKind, capabilities do Catalog antigo nem capacidades inferidas por modelId específico.

## 3. Princípios de classificação da revisão

Ao encontrar símbolos antigos ou DTOs antigos, não se pode decidir a deleção apenas pelo nome. Esta revisão usa as quatro classes de atribuição a seguir:

| Classe                | Significado                                                            | Princípio de tratamento                                                |
| -------------- | --------------------------------------------------------------- | -------------------------------------------------------- |
| Saiu em M4      | Pertence a M4 e a trilha dupla de execução especial já foi removida                                | Manter a barreira de zeragem e proibir reintrodução                               |
| Segunda abstração em runtime | Ainda participa da seleção normal de modelo, montagem, julgamento de capacidade ou execução de requisição                    | Deve migrar para a cadeia unificada e a entrada antiga deve ser removida                               |
| Implementação de fronteira legítima   | Execução interna do Adapter, schema estrito de Protocol ou importer legacy de uso único | Pode permanecer, mas não pode vazar de volta para Core, Registry, Service ou UI |
| Fronteira de domínio posterior   | Responsabilidades já sabidas como fora do escopo de M4 e que precisam de nova atribuição em fases posteriores                       | Registrar dependências e direção final, sem refatorar por conta própria em M4                   |

`AiSdkModelAdapter` não é, em si, uma "abstração de modelo antiga" a ser removida. Ele pode continuar como implementação concreta de execução. O problema real é se Core depende diretamente dele e se ele volta a se tornar uma segunda entrada de modelo de negócio por meio de DTOs públicos, Connection ou Registry mutável.

## 4. Conclusão geral atual

A maior parte das chamadas de modelo de negócio já passa por `Model.generateText()` / `Model.streamText()`; as implementações que chamam diretamente o SDK da OpenAI, da Anthropic ou
de outros Providers praticamente convergiram para o Adapter. Isso indica que a nova fronteira pública de chamada já se formou.

No entanto, o sistema ainda não concluiu a unificação da abstração. Ainda existem alguns grupos de estruturas antigas que participam do funcionamento normal:

```text
Caminho oficial
ModelSelection -> Registry -> ModelFactory -> Model

Caminhos coexistentes
Runtime Config -> modelAdapter -> Compatibility Model
Old Catalog / Connection / modelId hardcode -> inferir novamente Properties e Options
ModelRef -> assume ao mesmo tempo Selection, Identity, Variant, Request e Result
New Registry Model View -> projetado de volta para o antigo ModelProviderModelConfig -> Service / UI
```

Portanto, M4 é uma convergência necessária, mas apenas concluir M4 não prova que restou um único conjunto de abstrações de modelo. Ainda é necessária uma fase
dedicada de limpeza da abstração de modelo após M4.

## 5. Problemas já encontrados

### 5.1 Core ainda depende simultaneamente de ModelFactory e do Model Adapter antigo (deleção já decidida)

Todo detalhado de implementação: [`../steps/todo-01-core-model-adapter-boundary-cleanup.md`](../steps/todo-01-core-model-adapter-boundary-cleanup.md)

`AgentRuntimeDeps` e `AgentRuntime` hoje mantêm ao mesmo tempo:

- `modelFactory`;
- `modelAdapter: any`;
- `modelConnectionPort`;
- `resolveRuntimeModelLimits`;
- `resolveModelProviderOptions`;
- `providerRuntimeHeadersPort`.

`createRuntimeModel()` cria o Model oficial quando existe `modelFactory`; quando falta a Factory, ele usa automaticamente `modelAdapter`
para criar o Compatibility Model. Esse Compatibility Model preenche por conta própria context window, max output, formatos de entrada, Tool,
Structured Output, WebSearch e System no meio da conversa.

Os valores padrão representativos atuais do Compatibility Model incluem:

- context window `200_000`;
- max output `32_000`;
- Text, Image, Video e PDF suportados;
- Audio não suportado;
- Tool Call e Structured Output suportados;
- WebSearch e System no meio da conversa ainda inferidos a partir de Connection, Endpoint ou modelId.

Isso não é apenas uma nomenclatura de compatibilidade, é uma fonte de fatos de modelo paralela à Effective Model Config. Enquanto o Core permitir entrar
implicitamente nesse caminho quando falta a Factory, omissões na montagem de produção não poderão ser detectadas por tipos ou por verificações de integridade no start.

A varredura estática mostra que ainda há 17 arquivos de produção de Core referenciando `modelAdapter` e cerca de 15 arquivos de produção de Core referenciando
`modelConnectionPort`. Branchs de título, Memory, Compact, Subagent e ferramentas de modelo ainda julgam a disponibilidade de capacidade pela existência de Adapter ou Connection.

Decisões de design já confirmadas:

- o Core remove a dependência de `modelAdapter` e o Compatibility Model;
- na ausência de ModelFactory, não há recuo para o Adapter nem montagem de fatos de modelo pelo Core;
- todas as entradas de execução de modelo em produção devem obter uma ModelFactory oficial;
- chamadas de modelo em teste passam a usar Fake Model / Fake ModelFactory, sem manter entradas de compatibilidade de produção para testes;
- o Adapter ainda pode servir como implementação de execução a jusante do Bootstrap / ModelFactory; não se exige remover o conceito `modelAdapter` de todo o repositório;
- se `modelFactory` deve ser obrigatório no tipo `AgentRuntimeDeps` inclusive para Runtime puramente state-only pode ser decidido pela forma real de construção,
  mas qualquer Runtime sem Factory deve ser incapaz de executar requisições de modelo.

Avaliação de implementação: essa limpeza tem fronteira clara e risco controlável, mas não é uma deleção trivial. A varredura estática após M4 ainda encontra 17 arquivos de produção de Core
referenciando `modelAdapter`, o tipo Factory do Workflow Child ainda é opcional e cerca de 29 arquivos de teste de Core / Bootstrap fornecem
apenas Adapter e nenhuma Factory. A implementação exige migrar primeiro a montagem dos testes e o Child Runtime de produção, e só então remover o fallback, os campos e
as barreiras de funcionalidade do Core. Isso deve ser um commit de limpeza independente, test-first, e não pode cruzar edições com as modificações de teste não commitadas da revisão paralela de M4.

### 5.2 A cadeia de modelo de execução especial do M4 já saiu fisicamente

M4 removeu os seguintes conceitos antigos:

- `turnRuntimeModel`;
- `TurnExecutionModel`;
- `ExecutionScopedModelSource`;
- `createRuntimeModelFactory`;
- Overlay temporário de Provider em runtime;
- a máquina de estados que trocava temporariamente o model da Session e o restaurava.

Tarefas off-peak, Compact, Subagent e a sessão comum agora usam a mesma Selection, Registry, ModelFactory e Active
Model, sem gerar mais um segundo snapshot completo de Provider/Model. Na varredura do código-fonte de produção esses símbolos são zero; nos testes de protocolo resta apenas um
literal `turnRuntimeModel`, usado para provar que o campo antigo não pode entrar no novo contrato de comandos.

### 5.3 A interface morta ModelPort ainda permanece

O antigo `ModelPort` ainda define as interfaces `generateText` / `streamText` com `ModelTextRequest` como entrada, além de
`ModelPortOptions`. A revisão atual de referências estáticas não encontrou nenhuma chamada de produção válida.

Ele é uma interface de execução voltada ao Core duplicada em relação ao novo `Model` e deve ser removido como código morto explícito. Na remoção, não se pode
retipar `modelAdapter: any` como `ModelPort`, o que apenas restauraria a abstração antiga.

### 5.4 O Result/Event do novo Model ainda está construído sobre o protocolo antigo de ModelRef

O novo `Model` já define Properties, Option Specs, Options e métodos de chamada unificados, mas `ModelResult` e
`ModelEvent` continuam temporariamente como aliases de `ModelTextResult` e `ModelStreamEvent` antigos.

O `ModelRef` do protocolo antigo carrega simultaneamente:

- `providerId`;
- `modelId`;
- `variant` opcional.

Ele ainda é amplamente usado em:

- `ModelTextRequest` antigo;
- `ModelTextResult`;
- Stream Event;
- Network Status;
- Telemetry;
- atribuição de mensagens e execução;
- seleção em runtime e conversão de compatibilidade.

Na varredura estática, `ModelRef` ainda aparece em cerca de 48 arquivos de produção. Não é possível deletá-lo em lote aqui, porque parte dele realmente precisa registrar
a identidade do modelo executado; o problema é que o mesmo tipo mistura intenção de seleção, identidade de execução, reasoning variant e parâmetros de requisição.

Pontos a discutir:

1. se deve ser formalmente estabelecido um `ModelIdentity` contendo apenas `providerId + modelId`;
2. se `ModelSelection` deve ser o único tipo de seleção serializado permitido a carregar Options;
3. se Result, Event e Telemetry devem guardar Identity, Options completos de execução ou uma Execution Observation;
4. como `variant` sai, e como os dados persistidos historicamente são convertidos apenas na fronteira de restauração;
5. se o novo `ModelResult` / `ModelEvent` devem se desprender dos DTOs antigos antes de `ModelRef` ser removido.

### 5.5 O Model Catalog antigo ainda é um sistema de fatos paralelo

Todo detalhado de implementação: [`../steps/todo-08-legacy-model-catalog-retirement.md`](../steps/todo-08-legacy-model-catalog-retirement.md)

Ainda se mantém a seguinte estrutura completa:

- `ModelCatalogConfig`;
- `ModelCapability` / `ModelCapabilityProvider`;
- `ModelCatalogService` / `ModelCatalogSource`;
- `models-dev` / `models-dev-snapshot`;
- `default-policy` / `reasoning-policy`;
- `runtime-thought-level`.

Entre eles, o `models-dev-snapshot.ts` bundled tem cerca de 2,3 MB. As construções normais de produção encontradas hojebasically definem
`modelsDev: false` explicitamente, o que indica que o banco bundled já não carrega o fato principal de produção; mas os tipos de Catalog, a lógica de merge e as políticas ainda são referenciados pelo
Bootstrap, pelo Adapter e pela cadeia antiga de configuração.

A fronteira alvo deve ser:

```text
Runtime normal
Built-in / Personal Config -> Effective Rules -> Registry -> Model

Migração histórica
Legacy Config -> Importer privado -> Nova Config
                              `-> termina aqui
```

Decisões confirmadas sobre o Legacy Config:

- remover o Schema, o parsing, o merge e os testes do antigo `modelCatalog.overrides`; não escrever um importer de Personal Model Config para ele;
- o context, os formatos de entrada, Tool/Structured Output, as faixas de reasoning, os valores padrão e o mapeamento de parâmetros de requisição que essa estrutura expressava podem ser totalmente expressos pelas Personal Model Config Rules, não havendo capacidade de runtime exclusiva que precise ser preservada;
- embora o Legacy parser analise `modelCatalog.overrides` no momento da revisão, o importer oficial não consome esse resultado, portanto removê-lo não cancela nenhum comportamento de migração hoje válido;
- as configurações comuns de Provider/Model em `provider.*.models.*` que o importer já suporta explicitamente continuam sendo migradas; não se pode ampliar nem reduzir essa fronteira de migração existente para remover `modelCatalog.overrides`;
- metadados antigos de exibição como `name` e `family` não constituem motivo para manter o Catalog; se houver uso de produto no futuro, isso deve entrar na configuração de exibição atual, e não restaurar a autoridade do Catalog.

As decisões acima e a limpeza física restante dos dados/sources de Catalog, das policies de capability/default, da Reasoning Selection View e dos casos especiais de compatibilidade de Tool Schema são implementadas de forma unificada pelo Todo 08; não podem continuar espalhadas pelo Todo 02, já concluído.

### 5.5.1 O seletor de Reasoning reaproveita a cadeia de seleção de modelo

`ZCodeModelReasoningState` não é estado de execução de modelo. Hoje ele é enviado entre processos junto com `ZCodeModelOption` e serve principalmente para fornecer as faixas de reasoning e os valores padrão às interfaces de seleção de modelo como input box,
Subagent, tarefas off-peak e Repo Wiki. O objetivo não é estabelecer uma consulta ou cadeia de estado de reasoning independente, mas reaproveitar os candidatos de seleção de modelo:

```text
Effective Model Config.optionSpecs.reasoningLevel
                         |
                         v
            Registry Model Selection View
                         |
                         v
                candidato de modelo selecionado
                         |
                         +--> seletor de reasoning do Composer
                         +--> Subagent / Off-Peak / Repo Wiki
                         `--> envio de ModelSelection.options.reasoningLevel
```

Decisões confirmadas:

- as faixas disponíveis e os valores padrão pertencem a `optionSpecs.reasoningLevel` do candidato de seleção de modelo, e o frontend lê diretamente do candidato atualmente selecionado;
- `ModelSelection` guarda apenas o `options.reasoningLevel` escolhido explicitamente pelo usuário, sem copiar toda a especificação de faixas;
- remover o conceito independente `ZCodeModelReasoningState` e a nomenclatura enganosa de `State`; não criar um segundo fetch, store ou canal de sincronismo de reasoning;
- `enabled` é um campo redundante: a existência de `optionSpecs.reasoningLevel` já expressa por completo se o modelo oferece essa opção;
- `providerOptionsByLevel` não entra em Protocol/UI. O mapeamento de parâmetros de requisição do Provider fica apenas em `reasoningMapping` da Effective Model Config, consumido pelo ModelFactory/Adapter no lado da execução;
- o Protocol pode serializar estritamente os Option Specs necessários aos candidatos de seleção, mas isso é parte da Registry Selection View e não uma nova fonte de verdade sobre modelos.

### 5.6 Ainda há caminhos de inferência de capacidade fora das Model Properties

O novo `ModelProperties` já inclui capacidades como input/output format, Tool, Structured Output, Native WebSearch e
System no meio da conversa. Mas ainda existem, em Core e Adapter, caminhos que inferem capacidades a partir de:

- providerKind;
- baseURL / host do Endpoint;
- modelId específico ou prefixo de modelId;
- ID de Provider específico.

Os hardcodes representativos atuais incluem `claude-opus-4-8`, Endpoint da DeepSeek, DeepSeek V4, MIMO, Kimi K3,
GitHub Copilot e combinações de strings de GPT.

Aqui é preciso distinguir duas questões:

```text
O modelo suporta determinada capacidade
    -> Effective Model Config / Model.properties

Como um determinado tipo de API codifica a capacidade na requisição wire
    -> implementação do Adapter ou configuração explícita de compatibilidade do Adapter
```

Alguns helpers atuais misturam "fato de capacidade" e "limitação de codificação". Por exemplo, a Config pode declarar Native WebSearch como suportado, enquanto o Adapter
pode não codificar a ferramenta porque o Endpoint não está na allowlist, produzindo duas fontes de decisão.

Pontos a discutir:

1. quais hardcodes são capacidades de modelo e devem migrar para as Built-in Model Config Rules;
2. quais são compatibilidade de protocolo de API e devem passar a ser dirigidos por `api.type` ou por uma flag explícita de compatibilidade;
3. se o Adapter pode conhecer IDs de modelo concretos e, em caso positivo, qual é a fronteira e o local centralizado;
4. se a inferência por nome de modelo no importer legacy de uso único é preservada como a única exceção.

### 5.7 O modelo off-peak é projetado de volta para o DTO antigo de Provider Model

As tarefas off-peak já conseguem ler o modelo a partir da nova resolução de Provider Config, mas o Service em seguida reconstrói cada modelo como o antigo
`ModelProviderModelConfig`, incluindo as `modalities` antigas e a estrutura antiga de reasoning patch. O Subscription Provider e a UI
continuam consumindo esse DTO.

Essa cadeia não altera a fonte de verdade do Registry, mas mantém o Schema completo antigo de Provider Model como uma interface de Service/UI ativa,
e pode induzir funcionalidades futuras a continuarem dependendo de campos antigos.

Pontos a discutir:

1. quais campos a página off-peak realmente precisa;
2. se deve ser estabelecido um `OffPeakModelOption` / View mínimo, em vez de devolver o Model Config completo;
3. se a exibição de reasoning deve ler diretamente os novos Option Specs ou ser fornecida de forma unificada pela Selection View;
4. se `ModelProviderModelConfig` deve acabar aparecendo apenas no legacy importer.

### 5.8 A autenticação dinâmica ainda é atualizada pela cadeia de compatibilidade de Core Runtime Header

Um Provider de API Key pode salvar material de acesso estático diretamente pelo Provider Config. As credenciais dinâmicas dos Providers do tipo conta não são gerenciadas pela Config;
durante a execução da requisição, o serviço de conta precisa resolver o material de acesso atual.

A nova direção é o ModelFactory montar `ModelRequestDependencies` ao criar o Model. Mas os Providers de conta existentes ainda atualizam os Headers pelo
`providerRuntimeHeadersPort` do Core e pelo Model Invocation Context antes de cada requisição física. Branchs como Title,
Compact, Memory, Verifier e Subagent precisam, portanto, propagar explicitamente o callback de atualização.

Isso faz com que o Core ainda conheça o ciclo de vida da autenticação do Provider, mas a reformulação completa do Account Provider não faz parte de M4. Atualmente isso é classificado como fronteira de domínio posterior,
em vez de uma exigência de que M4 remova isso ao mesmo tempo.

Pontos a discutir:

1. se, na fase de Account Provider, a Request Auth Source da conta deve ser montada uniformemente no ModelFactory;
2. se o Core deve manter apenas contextos de chamada como Trace e Status, sem mais possuir a capacidade de atualizar credenciais;
3. se, após a atualização de credenciais dinâmicas, apenas o material de acesso deve ser atualizado, proibindo resolver novamente o Provider/Model completo;
4. se essa limpeza pertence a M5, a M6 ou a uma fase de convergência de Auth separada.

## 6. Fronteiras que a revisão atual confirma poder manter

As estruturas a seguir não são alvos de deleção direta exigidos por esta revisão:

### 6.1 Implementações de SDK de Provider dentro do Adapter

Clientes concretos como AI SDK, OpenAI e Anthropic podem continuar existindo no Adapter. A camada de negócio não pode depender diretamente deles, e o Adapter também não pode
expor ao Core um segundo sistema de Model Selection ou de capabilities.

### 6.2 Infraestrutura de execução do Adapter

Dentro do Adapter é possível manter infraestrutura de execução como API factory, transport e cache de assinaturas, mas não se mantém mais uma lista de Providers ou um Execution Registry
consultável. baseURL, tipo de API, Headers estáticos e Model Config são vinculados uma única vez na criação do Model, e não se aceita que um Overlay temporário
da camada de negócio se torne depois a fonte de verdade do modelo.

### 6.3 Schema estrito de Protocol

O protocolo entre processos precisa de validação de schema em runtime própria. Os tipos do protocolo não precisam compartilhar a mesma declaração que os tipos TypeScript in-process, mas sua
semântica precisa estar alinhada a `ModelSelection`, sem reintroduzir um Runtime Model completo, um snapshot de Provider ou outra representação de Options.

### 6.4 Importer legacy de uso único

O Importer pode reconhecer campos antigos publicados, modalities antigas e configurações históricas de reasoning, mas o resultado da conversão deve entrar imediatamente na nova Config.
Os tipos antigos não podem vazar do importer para Registry, Runtime, Service View ou UI.

## 7. Ordem sugerida para discussão item a item

A discussão posterior é sugerida na ordem das dependências, sem enfiar todas as questões em um mesmo branch de implementação:

1. **Barreira de zeragem de M4**: confirmar continuamente que os símbolos antigos de execução especial permanecem em zero;
2. **Core somente-Model**: decidir se a ModelFactory se torna uma dependência obrigatória de todo Runtime executável;
3. **Selection / Model / Identity**: esclarecer os três conceitos e a expressão de identidade em Result, Event e Telemetry;
4. **Aposentadoria do Catalog antigo**: confirmar o escopo mínimo de retenção do legacy importer;
5. **Capacidade e compatibilidade wire**: classificar um a um os hardcodes existentes de modelId, Provider e Endpoint;
6. **Aposentadoria dos DTOs antigos em Service/UI**: eliminar a projeção reversa começando pela View de modelo off-peak;
7. **Account Request Auth**: remover a cadeia de compatência de atualização de Header do Core na fase de Providers de conta;
8. **Barreira mecânica final**: consolidar em testes ou verificações estáticas as regras que proíbem reintroduzir abstrações antigas.

Os itens de 2 a 6 constituem juntos o candidato "limpeza de unificação da abstração de modelo após M4". Se isso será definido como um marco independente e como será numerado precisa ser decidido só depois
de concluídas as decisões item a item.

## 8. Condições mecânicas candidatas de aceitação

Abaixo estão as condições candidatas de zeragem propostas por esta revisão; elas não representam autorização para executar deleções sem discussão:

```text
modelAdapter no Core                           = 0
modelConnectionPort no Core                    = 0
ModelPort / ModelPortOptions                  = 0
TurnExecutionModel                           = 0
ExecutionScopedModelSource                   = 0
turnRuntimeModel                             = 0
ModelRef.variant                             = 0
ModelCatalogConfig no runtime normal            = 0
ModelProviderModelConfig na cadeia normal de Service/UI = 0
Julgar capacidade de modelo por modelId específico fora da Config = 0
```

Além disso, ainda são necessárias aceitações de comportamento:

- sessão comum, tarefas off-peak, Compact, Memory, Title, Goal, Subagent, Workflow e ferramentas de modelo obtêm todos o Model a partir do ModelFactory;
- o Loop atual lê apenas o seu próprio Active Model, sem recuar para a seleção padrão da Session nem para um Registry mutável;
- atualizações do Registry afetam apenas Models criados depois;
- Model Properties é o único fato para julgamento de capacidade no Core;
- limitações de codificação do Adapter não sobrescrevem silenciosamente as declarações de capacidade de modelo da Config;
- Protocol, Telemetry e persistência podem registrar o modelo realmente executado, sem voltar a assumir responsabilidades de seleção ou configuração de modelo;
- Legacy Config só pode ser importado em sentido único e não pode continuar como fallback de runtime.

## 9. Limites de confiança e manutenção posterior

Estas conclusões vêm de uma varredura estática de chamadas no código de produção, de uma auditoria de referências a exports antigos, da verificação das cadeias de chamada
Config/Registry/ModelFactory e da observação somente leitura da working tree atual de M4. O resultado completo do `knip` contém muito ruído já existente no repositório, por isso apenas resultados
verificados no nível de símbolo foram escritos nas conclusões; "nenhuma referência estática encontrada" também não equivale a prova de que não existam strings ou importações dinâmicas.

Os itens de M4 foram varridos novamente e marcados como concluídos com base no código de produção atual. As contagens e posições de chamada dos demais símbolos ainda são um snapshot de pré-revisão; antes de entrar na próxima fase de limpeza é
necessário varrer novamente as referências de produção restantes e só então sincronizar as conclusões que passaram por decisão item a item para o design formal e para os documentos de implementação posteriores. Este arquivo não substitui o design
formal e não fixa antecipadamente como contrato alvo sugestões que ainda não foram discutidas.