# Design alvo do sistema de Provider

> Estado: design vigente
>
> Atualizado em: 2026-09-01

O sistema de Provider faz uma coisa: transformar a configuração de Provider, as Model Config Rules e uma ModelSelection do Environment alvo em um Model capaz de encapsular de forma estável as chamadas à API de modelos.

```text
Provider Config 路径                         Model Config 路径
====================                       =================

ZCode Built-in Provider Config             ZCode Built-in Model Config Rules
              |                                         |
              v                                         +
Account Built-in Provider Config           Personal Model Config Rules
              |                                         |
              v                                         v
Effective Built-in Provider Config         Effective Model Config Rules
              |                                         |
              v                                         |
    Personal Provider Config                           |
              |                                         |
              v                                         |
    Effective Provider Config                           |
    ├─ providerId / group                              |
    ├─ final api.type                                  |
    ├─ final endpoint                                  |
    ├─ final access                                    |
    ├─ final builtinModelIds                           |
    ├─ final modelIds                                  |
    ├─ final modelOrder                                |
    ├─ final enabled                                   |
    └─ final visibility                                |
              |                                         |
              +-------------------+---------------------+
                                  |
                                  | providerId / modelId / api.type / baseURL
                                  v
                       Effective Model Config
                       ├─ enabled
                       ├─ properties
                       ├─ optionSpecs
                       │  └─ per-option raw-body map
                       └─ 必要的请求编码事实
                                  |
                                  v
                    Provider / Model 完整性校验
                                  |
                                  v
                         Provider Registry
                                  |
                                  | ModelSelection
                                  v
                            ModelFactory
                                  |
                                  v
                                Model
                                  |
                                  v
                      ModelRequest -> Adapter -> API
```

O caminho da esquerda decide quais Providers existem no final, quais modelos cada Provider tem e qual API e modo de acesso são usados; o caminho da direita decide quais capacidades cada modelo tem e como as opções são mapeadas para parâmetros de requisição. Os dois caminhos convergem em `providerId + modelId + api.type + baseURL`.

## Linguagem de configuração

O Provider Config é resolvido sempre nesta ordem:

```ts
effectiveBuiltinProviders = zcodeBuiltinProviders.overlay(accountBuiltinProviders);
effectiveProviders = effectiveBuiltinProviders.overlay(personalProviders);
```

A prioridade é `Personal > Account Built-in > ZCode Built-in`. O Account Built-in trata apenas os Providers de conta já declarados pelo ZCode Built-in; seu resultado é o Effective Built-in Provider Config. O Personal guarda os Providers personalizados pelo usuário e as substituições finais.

Itens de configuração comuns continuam usando substituição integral ou Overlay folha a folha; por terem donos diferentes, os membros de modelo de um Provider são separados em `builtinModelIds` e `modelIds`, com a ordem expressa por `modelOrder`. O `enabled` do Model Config expressa a intenção de habilitação do modelo; quando o mesmo ID vem das duas fontes, Built-in-wins, e itens posteriores duplicados são ignorados de forma determinística; o Model Config não guarda membros nem visibilidade. A semântica completa está em [`registry/model-membership-and-enablement.md`](./registry/model-membership-and-enablement.md).

As Model Config Rules são combinadas sempre nesta ordem:

```ts
effectiveModelRules = ModelConfigRules.composeEffective(zcodeBuiltinModelRules, personalModelRules);
```

A ordem interna é `ZCode Built-in + Personal provider-model`. O JSON do Personal guarda apenas a Rule exata, e a disposição física não altera a semântica de substituição final da Rule exata.

As Rules resolvem os modelos presentes no Effective Provider Config; não se pode resolver os modelos primeiro e depois acrescentar o Overlay de Account ou Personal. `Effective` indica apenas que o Overlay/resolução foi concluído e não gera um segundo conjunto público de DTOs.

Os campos completos, o Overlay, a visibilidade, o Access, o armazenamento e as migrações estão em [`registry/configuration.md`](./registry/configuration.md).

A disposição de Provider/Rule do ZCode Built-in Release, a hierarquia de escrita de Match/Exact Rule, a especialização de Endpoint, os limites de evidência e as normas de manutenção do catálogo de habilitação padrão estão em [`registry/zcode-builtin-provider-config.md`](./registry/zcode-builtin-provider-config.md).

A atribuição de replay de histórico de modelos, da compatibilidade de codificação de requisição e do protocolo de produto de Provider Access está em [`registry/request-compatibility-and-access-protocols.md`](./registry/request-compatibility-and-access-protocols.md).

O domínio de valores de Model Option, o Map de CEL restrito, os pontos de injeção no Request Body bruto e a autoridade única dos campos de requisição estão em [`model/model-option-map.md`](./model/model-option-map.md).

A narrativa completa das decisões do sistema atual de configuração de Provider/Model está em [`registry/provider-and-model-configuration-overview.md`](./registry/provider-and-model-configuration-overview.md). Essa visão geral serve para construir primeiro o modelo mental completo; o contrato preciso dos campos continua sendo o dos documentos topical desta árvore de design.

## Provider Config e credenciais

O Provider Config é a entrada de montagem da chamada à API de modelos e pode guardar credenciais de acesso estáticas ou referências estáveis a credenciais; ele não é um centro unificado de credenciais, não é responsável pelo ciclo de vida de todas as credenciais dinâmicas e não assume a decisão final de autorização do servidor.

```text
api-key
└─ Config 保存静态 apiKey

zhipu-account
└─ Config 保存 family、mode
   └─ 请求期 Account Request Auth Service 从当前兼容连接解析 scope 与动态凭据
```

Quando o Request Auth está ausente, o Model/Adapter retorna um erro de autenticação tipado antes da requisição de rede. Materiais dinâmicos como Token de conta, Runtime Key, Header de verificação de segurança de uso único e Ticket de Off-Peak não entram no Provider Config nem na Registry View. Provedores comuns de API Key ainda podem ter a API Key guardada pelo Personal Config.

As categorias de Access de conta são declaradas pelo ZCode Built-in; o Account Overlay escreve apenas `access.entitled` e restringe a atualização dos modelos do Provider correspondente quando o servidor devolve o conjunto de modelos da conta.
`productId`, `organizationId`, `projectId`, a identidade da conta e as credenciais dinâmicas são properties do Account Connection Service e são resolvidas em tempo de requisição a partir de `family + mode` estáticos, sem entrar no Provider Config nem no Active Model.

Start, Individual Coding Plan e Team Coding Plan do mesmo Family são três Built-in Providers independentes de tipo fixo. O Account Overlay registra separadamente se cada Provider fixo tem hoje elegibilidade de plano; não é permitido que o mesmo Coding Plan Provider se transforme em runtime entre Individual e Team, nem inferir o Plan a partir da string do Built-in Provider ID. O `enabled` de nível superior sempre expressa apenas se a definição do Provider participa da resolução de configuração e não carrega semântica de elegibilidade de conta.

O `visibility` do Provider controla somente se o usuário consegue vê-lo em Settings e em Model Selection. Um Provider Hidden continua usando a validação de integridade comum, o Registry e o ModelFactory; a visibilidade não expressa permissão de autenticação ou de segurança.

## Uma execução comum

Depois que o usuário seleciona um modelo no Composer e submete:

```text
1. Entry 固定本次 ModelSelection
2. Core 原子接收完整 Submission
3. Registry 查找 Effective Provider / Model Config
4. ModelFactory 创建 Model
5. Agent Loop 持有 Active Model
6. 每个 ModelRequest 通过 Adapter 调用 Provider
7. Usage、Trace 和错误归因到实际 Model
```

A Selection guarda apenas `providerId`, `modelId` e as Options comuns. Endpoint, Access, Properties do modelo, Option Spec Map e o protocolo de API do Provider vêm do Registry, do ModelFactory e das dependências de tempo de requisição. Atualizações de Config afetam apenas Models criados depois; não há hot patch de objetos em execução.

## Registry, Settings e Selection

O Registry guarda todos os Providers completos e enabled do Environment atual, além dos modelos cujo Effective Model Config está completo e com `enabled=true`, incluindo Providers visible e hidden:

```text
Provider Registry
├─ complete visible Provider
└─ complete hidden Provider
       |
       +--> Provider Settings Facade：只投影 visible
       +--> Model Selection Facade：只投影 visible
       `--> 内部精确 lookup/create：共用同一 Registry
```

O Settings Facade fornece simultaneamente o Built-in Efetivo, os campos explícitos do Personal, o Config Efetivo, a origem dos membros, o estado de habilitação, a ordem e os problemas de integridade. O Selection Facade organiza apenas os modelos executáveis entre os Providers visible. Em caso de nome coincidente entre Built-in/Personal, apenas o candidate Built-in é retornado e o item posterior é normalizado no próximo salvamento do Provider. O Renderer não lê a configuração física, não repete Overlay, membros, ordenação ou o algoritmo de candidatos, e não infere capacidades de modelo a partir do modelId.

O design completo do Registry está em [`registry/registry.md`](./registry/registry.md), a página de configurações em [`registry/settings.md`](./registry/settings.md) e a montagem de runtime em [`registry/runtime.md`](./registry/runtime.md).

## Limites de execução do Model

O Model é o único objeto de chamada de modelo usado pelo código de negócio:

```text
Model
├─ providerId / modelId
├─ immutable ProviderConfig / ModelConfig / ModelOptions
├─ bind(options)
├─ generateText(request)
└─ streamText(request)
```

Em geral, um Agent Loop mantém o mesmo Active Model do início ao fim. Guide/«立即» é uma fronteira explícita de troca de Step; requisições já enviadas continuam usando o Model antigo e os Steps seguintes usam o novo Model. O Compact Automático usa o Active Model atual do Loop. O Subagent cria seu próprio Model pelo Registry a partir de uma Selection explícita.

As capacidades de entrada e saída vêm diretamente de `Model.properties.input_format/output_format`; Config, Model, Runtime, Adapter e protocolo não constroem um segundo conjunto de DTOs de capability. Detalhes em [`model/input-output-format.md`](./model/input-output-format.md).

## Execuções especiais

Execuções especiais não carregam ProviderConfig ou ModelConfig completos nem criam um Provider temporário:

```text
Core Submission
├─ prompt / attachments / mode
├─ ModelSelection
└─ optional execution context
   ├─ Request Auth
   ├─ Ticket / attribution
   └─ Subagent Model override
             |
             v
       Registry / ModelFactory
             |
             v
       Loop Active Model
```

Tarefas off-peak usam com precisão, conforme o Family da conta atual, o Built-in invisível ao usuário `account:zai-offpeak-idle-plan` ou `account:bigmodel-offpeak-idle-plan`; ambos são Providers comuns e completos, que não se transformam um no outro em tempo de execução. O Loop off-peak não modifica e depois restaura a Session Selection; após approve/deny de permissão, o mesmo Turn automático continua usando o idle Model; o Foreground Subagent usa a idle Selection por meio do override comum e cria seu próprio Model. A semântica completa está em [`execution/execution.md`](./execution/execution.md).

## Hierarquia de estados

```text
Composer Selection
└─ 当前草稿下一次提交的完整模型与 Reasoning 选择

App Recent
└─ 按 workspaceKey 隔离的新建 App Session 最近选择

Session Selection
└─ 当前 Session 后续普通主执行的选择

Loop Active Model
└─ 当前 Loop 真正调用的不可变 Model
```

Esses estados não podem se imitar. Tarefas off-peak, Subagent e Background não reescrevem o App Recent; tarefas off-peak também não reescrevem a Session Selection. O Reasoning de uma seleção comum é completado com um valor concreto por faixa ordenada na fronteira de Host Selection; o ModelFactory apenas valida e congela o Active Model e já não possui o default de Option. Detalhes em [`interaction/interaction.md`](./interaction/interaction.md).

## Limites de Environment

O Provider Config e o Registry pertencem ao Environment alvo que realmente executa a requisição de modelo:

```text
Local Environment  -> Local Config / Registry / Execution
SSH Environment    -> Remote Config / Registry / Execution
Cloud Environment  -> Cloud Config / Registry / Execution
```

Este é um blueprint de propriedade de longo prazo e não significa que o Remote Provisioning, as configurações remotas ou o login façam parte deste Provider Refactor. Desktop continuous, Mobile replayable, Queue, snapshot e workspace identity também não são semântica de Provider; mudanças no protocolo compartilhado servem apenas para regressão de invariantes. Detalhes em [`environment/environment.md`](./environment/environment.md).

## Leitura por camadas

- [`registry/registry.md`](./registry/registry.md): como o Config vira Registry e Model.
- [`registry/configuration.md`](./registry/configuration.md): campos, Overlay, Visibility, Access, Rules e armazenamento.
- [`registry/zcode-builtin-provider-config.md`](./registry/zcode-builtin-provider-config.md): normas de publicação e manutenção de Built-in Provider/Model Rule.
- [`registry/model-membership-and-enablement.md`](./registry/model-membership-and-enablement.md): propriedade de membros de modelo, conflitos de nome, habilitação e UI.
- [`registry/model-creation.md`](./registry/model-creation.md): ModelFactory, Adapter e autenticação em tempo de requisição.
- [`model/model.md`](./model/model.md): Model, ModelRequest, Options, ciclo de vida e atribuição.
- [`interaction/interaction.md`](./interaction/interaction.md): Submission, Session Selection e Active Model.
- [`execution/execution.md`](./execution/execution.md): Compact, Subagent, Goal, Background e tarefas off-peak.
- [`environment/environment.md`](./environment/environment.md): blueprint de propriedade de Environment de longo prazo.

O Design descreve apenas o sistema alvo. A ordem de migração e os resultados da implementação ficam em [`../steps/steps.md`](../steps/steps.md), e os fatos sobre o código atual em [`../research/research.md`](../research/research.md).