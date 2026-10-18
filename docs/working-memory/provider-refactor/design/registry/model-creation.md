# Criação de Model e autenticação de requisição

A criação de Model tem apenas um caminho público:

```text
ModelSelection
      |
      v
当前 Agent Registry lookup + validation
      |
      v
ProviderConfig + ModelConfig + ModelOptions
      |
      v
ModelFactory
      |
      v
Model
```

Sessões comuns, o teste de conectividade da página de configurações, Subagent, Compact, Goal, Background, Repo Wiki e tarefas em tempo ocioso usam essa cadeia. Visibility afeta apenas a Facade do usuário e não gera um segundo Registry, ModelFactory ou execution-only create API.

## ModelSelection

```ts
interface ModelSelection {
  providerId: string;
  modelId: string;
  options?: {
    reasoningLevel?: string;
  };
}
```

A Selection não carrega Endpoint, Access Secret, Provider Config, Model Config, tipo de Adapter nem capacidades do modelo. O Registry procura o Effective Config atual por `providerId + modelId` e valida as options conforme os Option Specs.

As options da Selection são fatos de escolha, não um snapshot do Provider/Model Config:

- Uma Selection oficial precisa carregar um `reasoningLevel` legítimo; ao criar uma seleção nova e padrão, apenas o Host Initial Selection Resolver pode completar uma única vez por `values.at(-1)`;
- `maxOutputTokens` não faz parte da Selection; o Agent/chamador decide explicitamente, para cada Model Request, com base no `optionSpecs.maxOutputTokens.max` do modelo e no orçamento atual da tarefa;
- `options: {}` é normalizado como campo ausente e uma Selection oficial não grava `null`; o `null` de um patch expressa apenas a remoção da sobrescrita;
- O ModelFactory apenas valida e congela, sem completar valores padrão de execução a partir do Option Spec e sem reescrever a Selection ou qualquer record de produto.

Quando uma execução histórica precisar registrar os valores efetivos, usa os fatos de Model/execution; não se pode reinterpretar uma Selection antiga com um Option Spec que mudou depois.

O lookup no Registry também aplica o portão `enabled` do Model Config. Um modelo com `enabled=false` ainda pode ser editado e reabilitado nas Settings, mas não entra em candidatos comuns nem na seleção default/fallback, e não pode ter um Model criado por ID preciso interno. Visibility controla apenas a exposição na interface do usuário e não contorna o enabled.

Somente o Provider tem `visibility`, com padrão `visible`. O ponto de entrada do usuário usa a Selection Facade e só pode escolher Models executáveis de Providers visíveis; capacidades internas de produto podem usar, por ID preciso, Models enabled de Providers ocultos no Registry. Essa diferença é uma diferença da View de candidatos, não uma fronteira de autenticação ou de segurança.

## Entrada do ModelFactory

O `ModelFactory` de runtime recebe `ModelSelection` e faz a validação final completa contra o Registry do Agent atual antes de realmente criar o Model. Depois de a validação passar, a camada interna de montagem entrega ao Adapter a entrada completa já pesquisada; o Adapter não consulta o Registry de volta:

```ts
interface AdapterModelFactoryInput {
  providerId: string;
  modelId: string;
  providerConfig: RegistryProviderConfig;
  modelConfig: RegistryModelConfig;
  options: Pick<ModelOptions, "reasoningLevel">;
  requestDependencies: ModelRequestDependencies;
}
```

A `ModelSelectionFacade` do usuário oferece apenas candidatos visíveis e não expõe método de validação de execução. Produtos internos podem usar, antes de salvar ou despachar, a checagem estreita de Registry do Service concreto, mas isso não substitui a validação final do ModelFactory.

`RegistryProviderConfig` / `RegistryModelConfig` são o mesmo Effective Config já passado pela única fronteira de completude, com o estreitamento estático resultante; a Factory não aceita Config de Overlay esparsa e também não completa campos nem prova completude de novo no Bootstrap/Adapter.

`ModelRequestDependencies` contém os Services de rede/assinatura de nível de processo e também permite montar a Request Auth Source do escopo de execução atual. A Source é uma dependência de execução do Model, não uma Config, Selection ou um novo tipo de Model; o Model obtém dela o material atual em cada request attempt. A `ModelRequest` pública comum não ganha campos de credencial.

Dessa forma a Factory pode ser reutilizada em testes, entre entradas diferentes e entre Providers visible/hidden do mesmo Registry. Uma atualização do Registry só afeta entradas seguintes; um Model já criado mantém a Config, as Options e os recursos de execução antigos e completa o ciclo de vida atual.

## Da Provider Config à montagem de execução

O ModelFactory entrega ao Adapter diretamente a mesma referência completa de Provider/Model Config vinda do Registry; o Bootstrap não copia o map de Providers nem compila antes um DTO de execução isomórfico:

```text
RegistryProviderConfig + RegistryModelConfig
          |
          | same complete objects
          v
Adapter private execution closure
├─ SDK kind / factory
├─ baseURL / static headers
├─ api static credential
├─ signing / network infrastructure
└─ model factory cache
```

O closure de execução privado não tem Source independente e não participa de Config Overlay, seleção de modelo, Visibility ou resolução de Model Properties. O Adapter só mantém a infraestrutura de execução de nível de processo, como rede, assinatura, roteamento e retry; ele não mantém uma lista de Providers e não existe um `replaceRegistryConfig()` que chamadores de negócio possam atualizar.

## Tipos de Access

### api-key

```text
Personal/Built-in Provider Config
└─ access.type = api-key
   └─ apiKey
        |
        v
ModelFactory / Adapter
        |
        v
Provider Request
```

A API Key é um campo estático de Config. Um Provider efetivo sem Key está incompleto e não entra no Registry. As Settings podem exibir o problema e permitir completá-lo; o teste de conexão usa o Model oficial já salvo.

### zhipu-account

```text
ZCode Built-in Provider Config
└─ access.type = zhipu-account
   └─ family + mode
        |
        v
ModelFactory 固定静态账号访问类别
        |
        v
每个 request attempt
        |
        v
Account Request Auth Service(current compatible connection)
        |
        v
ModelRequestAuth { apiKey, headers }
```

O Access guarda explicitamente a Family e o Mode necessários à montagem da chamada. A identidade da conta, o produto e o escopo de equipe são pertencentes ao Account Connection Service; cada attempt resolve a conexão compatível atual conforme a categoria estática. Ao trocar para uma Family/Plan incompatível ou ao sair da conta, a falha ocorre antes da rede; a conexão atual e as credenciais renovadas da mesma Family/Plan podem ser usadas pelo Model Active antigo.

Start Plan, Individual Coding Plan e Team Plan podem compartilhar a infraestrutura de Account Provider, mas correspondem a Built-in Providers distintos de tipo fixo. O Account Built-in Overlay projeta apenas `access.entitled` para a conta atual. O Account Service decide como obter o material da requisição; o servidor decide se a autorização final é concedida.

Não existe `enabled` no nível de topo do Provider; a elegibilidade de pacote de conta é expressa por `zhipu-account.entitled`. O Start Plan ainda pode restringir os membros com o `builtinModelIds` não vazio retornado pela interface de conta; Individual/Team herdam os membros Built-in. Qualquer Account Overlay desse tipo precisa casar com a revisão do ZCode Built-in que o produziu para só então o Registry poder criar Models posteriores.

### Material de requisição Off-Peak

```text
Provider Config
└─ access.type = zhipu-account
   └─ mode = off-peak
        |
        v
ModelFactory 创建普通 Model
        |
        v
每个 Model request attempt
        |
        v
ModelRequestDependencies.requestAuth.resolve()
        |
        +-- Request Auth present -> Adapter request
        `-- missing              -> typed auth error before network
```

Off-Peak não guarda Secret. Seu material dinâmico é montado na criação do Model por esta execução em tempo ocioso, enquanto o Mode comum `zhipu-account` é resolvido em tempo de chamada pelo Account Request Auth Service.

A Request Auth é uma dependência do escopo de execução, lida por request attempt:

- Não entra no ProviderConfig, no ModelConfig nem na View do Registry;
- Não entra na Session Selection, no App Recent nem no Personal Config;
- Não entra em conversation event, snapshot ou logs;
- O Retry só pode reutilizar ou renovar dentro da chamada/execução válida atual;
- Quando falta, está expirada ou não pode ser resolvida, falha antes da rede.

## Headers estáticos e dinâmicos

```text
ProviderConfig.api.headers          -> static headers
Account / Off-Peak request source   -> dynamic auth headers
ModelRequest / Adapter options      -> protocol request fields
```

O Adapter mescla com prioridade fixa e protege os campos de autenticação. O Renderer, a lógica de negócio do Core e as Model Config Rules não montam JWT, Ticket, verificação de segurança de uso único, organization/project nem Headers de dialeto do Provider.

## Tarefas em tempo ocioso

`account:zai-offpeak-idle-plan` e `account:bigmodel-offpeak-idle-plan` são dois ZCode Built-in Providers completos; o Scheduler seleciona exatamente um deles conforme a Family da conta atual, e o próprio Provider não troca de Family durante a execução:

```text
ProviderConfig
├─ visibility = hidden
├─ access.type = zhipu-account
├─ access.mode = off-peak
├─ api.type
├─ api.baseURL
├─ static headers（如有）
└─ builtinModelIds

Model Config Rules
└─ properties / optionSpecs（含 per-option raw-body map）
```

O Host/Scheduler despacha uma ModelSelection comum e fornece, para este Turn automático, a Request Auth, o Ticket e a atribuição necessária. Ele não carrega snapshot estático de Provider/Model nem cria uma Provider Source temporária:

```text
Core Submission
├─ idle ModelSelection
└─ execution context
   ├─ Request Auth
   ├─ Off-Peak Ticket
   └─ optional Subagent override
            |
            v
Registry lookup + ModelFactory
            | 装配本轮 requestAuth source
            |
            v
Idle Active Model
```

A Request Auth/o Ticket valem apenas para o despacho válido atual. Depois de o Ticket expirar, cancelar, falhar, ter sucesso, ser reivindicado por outra execução ou o processo reiniciar, o Scheduler encerra o contexto de execução atual; depois de retirar um novo tíquete, um novo Model é criado com a nova Submission. Enfileiramento, retomada de fila e settle não pertencem ao Provider/Registry.

## Active Model

O Model devolvido pelo ModelFactory é um objeto de execução imutável:

```text
Model
├─ fixed providerId / modelId
├─ fixed ProviderConfig / ModelConfig
├─ fixed Selection/Binding Options
├─ fixed account family / mode（若适用）
└─ request-time dependency ports
```

Atualizações comuns de Config, mudanças na seleção do Composer ou trocas globais de conta não modificam o Model antigo. O Guide cria e troca para um novo Active Model em fronteiras explícitas de Step; requisições já enviadas continuam sendo concluídas pelo Model antigo.

Tarefas em tempo ocioso criam seu próprio Loop Active Model, mas não gravam na Session Selection. O Automatic Compact usa o Active Model atual; o Subagent cria seu próprio Model conforme a Selection final.

## Subagent

```text
Core Server override
        >
Subagent Profile Selection
        >
Parent Active Selection
        |
        v
Registry / ModelFactory
        |
        v
Child-owned Model
```

Cada Child tem seu próprio Model e não toma emprestado objetos mutáveis do pai. Tarefas em tempo ocioso fixam a idle Selection do Foreground Child pelo override genérico e repassam o contexto atual de Request Auth/Ticket para a requisição do Child; o Background é rejeitado pela Tool Policy antes da requisição de modelo.

## Adapter

O Adapter é responsável apenas pelo protocolo do Provider e pela IO:

```text
ModelRequest
      |
      v
Adapter
├─ API Schema serialization
├─ reasoning parameters
├─ input media validation/encoding
├─ request auth resolution
├─ retry / stream handling
└─ error normalization
```

O Core não entende `reasoning_effort`, `enable_thinking`, `thinkingBudget` nem nomes concretos de Header; as Model Config Rules dão o mapeamento das Options públicas para os parâmetros do Adapter. O formato de entrada e saída é lido diretamente de Model.properties, sem inferir por modelId.

## Usage, Trace e erros

Cada requisição registra a identidade real do Model:

```text
providerId
modelId
effective options
request source / task attribution
usage
error
```

Off-Peak taskId, Goal, Compact, Subagent e Repo Wiki são dimensões de origem da execução e não substituem a atribuição de Provider/Model. O Retry não pode atribuir uma requisição a outro Model; se o produto trocar de Model explicitamente, precisa criar um novo Model e uma nova fronteira de execução.

## Fronteira de erros

| Etapa             | Erro típico                                                       |
| ----------------- | ----------------------------------------------------------------- |
| Config parse      | schema/unknown field                                              |
| completeness      | access/api/baseURL/models/model config ausente                   |
| Selection         | provider/model/options inexistente ou inválido                   |
| ModelFactory      | Adapter/dependências de execução impossíveis de montar           |
| request auth      | Account Access inválido, Request Auth ausente/expirada           |
| Adapter/network   | rejeição de autenticação, limitação de taxa, erro de serviço, parsing de protocolo, interrupção de stream |

Cada camada reporta apenas os próprios erros e não usa o snapshot antigo de Runtime, o Catalog ou um Provider padrão como fallback silencioso.

## Invariantes

- Todos os Models são criados pela mesma cadeia Registry/ModelFactory.
- Visibility afeta apenas a Facade do usuário.
- Providers ocultos continuam usando a completude e a validação de Access comuns.
- Models desabilitados não entram em candidatos, fallback ou criação pelo ModelFactory; um lookup preciso interno também não pode contornar isso.
- A Factory privada do Adapter não consulta o Registry de volta; o ModelFactory de runtime precisa consultar o Registry do Agent atual na fronteira de criação e validar a Selection por completo.
- Atualizações de Config não fazem hot patch em Models já criados.
- A API Key pode ser guardada na Config; o material dinâmico de Account e Off-Peak é obtido no momento da requisição.
- O Account Provider fixa `family + mode`; a conta atual, o produto e o escopo de equipe não entram no Model.
- A Request Auth ausente precisa falhar antes da rede.
- A Submission não carrega ProviderConfig nem ModelConfig completos.
- A projeção de execução do Adapter não tem fonte de fatos independente.
- Usage, Trace e erros são atribuídos ao Model real.