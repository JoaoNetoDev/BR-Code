# Rascunho do Provider Config Schema e do GLM embutido

> Status: a estrutura de configuração entrou no Design; este documento preserva os fatos da API do GLM e os itens de verificação antes da publicação
>
> Data do registro: 2026-08-18
>
> Escopo de aplicação: Provider Config, Model Config Rules, Account Access, GLM-5.2, GLM-5.3 e GLM-5-Turbo

Este rascunho guarda a estrutura que convergiu nesta rodada de discussão, além das partes que ainda precisam ser verificadas com código e comportamento em produção. Ele serve para evitar a perda de contexto nas discussões seguintes; a implementação e a revisão continuam obedecendo às conclusões formalmente aceitas no Design.

## 1. Forma geral convergida neste momento

Os fatos estáticos do Provider Registry são compostos por três camadas de Provider Config Overlay com a mesma forma:

~~~text
Official Provider Config
        +
Personal Provider Config
        +
Account Access Overlay
        |
        v
Effective Provider Config
        |
        +---- Model Config Rules
        |
        v
Provider Registry
        |
        | ModelSelection
        v
Model
~~~

As três camadas são responsáveis por:

- Official guarda os Providers gerenciados pelo produto, os membros de modelo, as propriedades comuns dos modelos e a configuração de protocolo.
- Personal guarda os Providers criados pelo usuário, além das sobrescritas explícitas sobre Providers Official.
- Account Access, conforme a conta atual, o plano e o estado da conexão, publica os Account Providers disponíveis, o subconjunto de modelos e a identidade de acesso do momento.

Official e Personal são persistidos. Account Access é um Overlay de runtime em memória. Materiais de autenticação de requisição — token de login, Runtime API Key, headers de verificação de segurança de uso único — não entram nessas três camadas nem no Registry.

A configuração de Provider e a de Model são dois conjuntos de dados complementares:

~~~text
Provider Config
└─ como conectar, como obter acesso, quais modelId contém

Model Config Rules
└─ Properties, Option Specs e comportamento de protocolo correspondentes ao modelId
~~~

## 2. Rascunho do Provider Config Schema

Nesta rodada, a "elegibilidade de acesso" e o "protocolo de requisição" do Provider foram separados em duas dimensões ortogonais. Elas são agregadas no mesmo ProviderConfig, mas cada uma usa um Schema com campo discriminador.

~~~ts
type ProviderConfigMap = ConfigOverlayMap<ProviderId, ProviderConfig>;

class ProviderConfig extends ConfigOverlay {
  label?: string | null;
  logoUrl?: string | null;
  access?: ProviderAccessConfig | null;
  api?: ProviderApiConfig | null;
  models?: readonly ModelId[] | null;
  enabled?: boolean | null;
}
~~~

A key do ProviderConfigMap externo é o providerId, portanto o value não repete o providerId. Todos os campos permanecem opcionais, de modo que o mesmo tipo consegue expressar tanto uma camada de Overlay esparsa quanto o resultado após a sobrescrita completa. Campo ausente significa que esta camada herda o valor da camada anterior; null significa que esta camada limpa explicitamente o campo.

### 2.1 Access

Access descreve "de onde vem a elegibilidade desta chamada".

~~~ts
type ProviderAccessConfig =
  | ApiKeyAccessConfig
  | ZhipuAccountAccessConfig;

class ApiKeyAccessConfig extends ConfigOverlay {
  readonly type = "api-key";
  apiKey?: string | null;
  apiKeyManagementUrl?: string | null;
}

class ZhipuAccountAccessConfig extends ConfigOverlay {
  readonly type = "zhipu-account";
  accessId?: string | null;
}

~~~

O escopo formal atual é api-key e zhipu-account. Outros métodos de acesso, como OAuth de outros fabricantes no futuro, entram como novos ramos de Access quando surgir uma necessidade concreta.

apiKeyManagementUrl é a informação de produto usada pela página de configurações para navegar até a página de gerenciamento de Keys do fabricante. Ela é fornecida explicitamente pelo Provider Config e não é deduzida a partir de baseURL.

O accessId do Zhipu Account identifica uma conexão de conta concreta, e não apenas o tipo de Plan. Ele permanece estável quando a mesma conta renova Token, Runtime Key ou Header, e precisa mudar ao trocar de conta. O accessId é fixado após a criação do Model; o serviço de autenticação de requisições pode renovar as credenciais dessa conexão, mas não troca silenciosamente um Model em execução por outra conta ou outra conexão pessoal/de equipe.

### 2.2 API

API descreve "para onde a requisição é enviada e qual protocolo público ela segue".

~~~ts
type ProviderApiType =
  | "anthropic-messages"
  | "openai-responses"
  | "openai-chat-completions";

class ProviderApiConfig extends ConfigOverlay {
  type?: ProviderApiType | null;
  baseURL?: string | null;
  headers?: Record<string, string> | null;
}
~~~

O Config exposto para fora usa `api.type`. O tipo de Adapter é um detalhe de implementação, selecionado pela cadeia de construção do Model conforme a configuração de API, e não entra na configuração do usuário.

Hoje só se mantém Header estático no nível do Provider. Header no nível do modelo e qualquer model.options não entram no novo contrato de configuração. Em requisições de streaming compatíveis com OpenAI, o include_usage é ligado pelo Adapter e não é exposto como item de configuração.

### 2.3 Integridade

Cada camada de Overlay pode ser esparsa. Após a sobrescrita completa, o Registry só recebe Providers capazes de formar uma conexão completa:

~~~text
todos os Providers
├─ access.type
├─ api.type
├─ api.baseURL
└─ models

access api-key
└─ apiKey

access zhipu-account
└─ accessId
~~~

A integridade é verificada recursivamente pela Config Class. O Facade de configurações usa o mesmo resultado de verificação para exibir os campos faltantes; o Registry filtra as configurações incompletas e não mantém uma cópia paralela desse julgamento.

## 3. Model Config Rules

A configuração de modelos é um conjunto de regras ordenadas. Cada regra contém uma condição de casamento e um ModelConfig esparso. Regras casadas mais adiante continuam sobrescrevendo o resultado das anteriores.

~~~ts
interface ModelConfigRule {
  providerMatch?: string;
  modelMatch: string;
  apiMatch?: string;
  config: ModelConfig;
}

class ModelConfig extends ConfigOverlay {
  properties?: ModelPropertiesConfig | null;
  optionSpecs?: ModelOptionSpecsConfig | null;
  apiAdapter?: ModelApiAdapterConfig | null;
}
~~~

providerMatch, modelMatch e apiMatch usam a mesma semântica de casamento por padrão. As regras são executadas em ordem, e os itens casados mais adiante continuam aplicando Overlay sobre o resultado anterior.

Os campos comuns e os campos de protocolo de um mesmo modelo são contribuídos por regras diferentes:

~~~text
modelMatch = GLM-5.3
└─ Properties + Option Specs

modelMatch = GLM-5.3, apiMatch = anthropic-messages
└─ Anthropic reasoning mapping

modelMatch = GLM-5.3, apiMatch = openai-chat-completions
└─ OpenAI Chat reasoning mapping + preserved thinking replay
~~~

### 3.1 Properties

As Properties comuns atuais incluem pelo menos:

~~~ts
class ModelPropertiesConfig extends ConfigOverlay {
  contextWindow?: number | null;
  supportsImages?: boolean | null;
  supportsPdf?: boolean | null;
  supportsVideo?: boolean | null;
  supportsToolCall?: boolean | null;
  supportsJsonSchemaOutput?: boolean | null;
  supportsNativeWebSearch?: boolean | null;
  supportsMidConversationSystem?: boolean | null;
}
~~~

supportsNativeWebSearch pode ser afetado pelas capacidades do Endpoint do Provider, então as regras genéricas de modelo podem dar um valor conservador, e as regras precisas do Builtin Provider contribuem com o valor final. supportsMidConversationSystem é registrado como true para os três modelos GLM atuais.

### 3.2 Option Specs e Options

Option Specs declaram as opções comuns que o usuário pode escolher e seus valores padrão. Options guarda as escolhas efetivamente vinculadas a uma instância de Model.

~~~ts
class ModelOptionSpecsConfig extends ConfigOverlay {
  reasoningLevel?: EnumOptionSpec | null;
  maxOutputTokens?: LimitOptionSpec | null;
}

interface ModelOptions {
  reasoningLevel?: string;
  maxOutputTokens?: number;
}
~~~

reasoningLevel é a opção do usuário. Campos de dialeto do Provider, preserveThinking e reasoningContentField não pertencem a ModelOptions.

### 3.3 API Adapter Config

O API Adapter Config guarda o comportamento de adaptação fixo do modelo atual sob uma determinada API pública.

~~~ts
class ModelApiAdapterConfig extends ConfigOverlay {
  reasoningMapping?: ReasoningMapping | null;
  preserveThinking?: boolean | null;
  reasoningContentField?: string | null;
}

type ReasoningMapping = Record<string, ReasoningParameters>;
type ReasoningParameters = Record<string, unknown>;
~~~

reasoningMapping mapeia o reasoningLevel genérico para os parâmetros exigidos por aquele protocolo. preserveThinking e reasoningContentField só aparecem em protocolos que realmente têm essa semântica.

~~~text
Model.options.reasoningLevel
        |
        v
ModelApiAdapterConfig.reasoningMapping
        |
        v
parâmetros de protocolo selecionados para esta requisição
        |
        v
Adapter gera a requisição final
~~~

O dialeto OpenAI Chat Compatible é o mais complexo, portanto o reasoningMapping e o reasoning replay atuam principalmente sob esse protocolo. Anthropic Messages e OpenAI Responses devem seguir prioritariamente a semântica fixa de seus respectivos protocolos públicos.

## 4. Exemplos de tipos de Provider

O JSON abaixo expressa apenas a estrutura alvo. O conteúdo dos campos vem da discussão atual e do código existente; ainda não é uma Official Config final publicável.

### 4.1 Provider de API Key comum

O Official pode fornecer uma entrada de fabricante ainda não conectada, e o Personal preenche a API Key; o usuário também pode criar o Provider inteiramente no Personal.

~~~json
{
  "builtin:zai": {
    "label": "Z.AI",
    "access": {
      "type": "api-key",
      "apiKeyManagementUrl": "https://z.ai/manage-apikey/apikey-list"
    },
    "api": {
      "type": "anthropic-messages",
      "baseURL": "https://api.z.ai/api/anthropic"
    },
    "models": ["GLM-5.3", "GLM-5.2", "GLM-5-Turbo"],
    "enabled": true
  }
}
~~~

Overlay Personal:

~~~json
{
  "builtin:zai": {
    "access": {
      "type": "api-key",
      "apiKey": "<user-api-key>"
    }
  }
}
~~~

O Provider de API Key do BigModel usa a mesma estrutura; atualmente o Endpoint Anthropic é https://open.bigmodel.cn/api/anthropic.

### 4.2 Start Plan

A Official Config do Start Plan guarda a conexão estática:

~~~json
{
  "builtin:zai-start-plan": {
    "label": "Z.AI Start Plan",
    "access": {
      "type": "zhipu-account"
    },
    "api": {
      "type": "anthropic-messages",
      "baseURL": "https://zcode.z.ai/api/v1/zcode-plan/anthropic"
    },
    "models": ["GLM-5.3", "GLM-5.2", "GLM-5-Turbo"],
    "enabled": true
  }
}
~~~

Account Access gera um Overlay de mesma forma conforme o resultado do login e do plano:

~~~json
{
  "builtin:zai-start-plan": {
    "access": {
      "type": "zhipu-account",
      "accessId": "zhipu-account:<account-id>:start-plan:builtin:zai-start-plan"
    },
    "models": ["GLM-5.2", "GLM-5-Turbo"]
  }
}
~~~

Aqui models é o subconjunto que a conta atual está autorizada a usar. O JWT do ZCode e o header de verificação de segurança de uso único usados na requisição são obtidos pelo serviço de autenticação de requisições.

O Start Plan do BigModel usa o providerId builtin:bigmodel-start-plan. Atualmente ele compartilha a semântica de requisição zcode-plan com o Start Plan do Z.AI; o Endpoint final e o conjunto completo de modelos precisam ser alinhados novamente com a Official Config remota.

### 4.3 Personal Coding Plan

O Coding Plan continua usando access do tipo zhipu-account:

~~~json
{
  "builtin:zai-coding-plan": {
    "label": "Z.AI Coding Plan",
    "access": {
      "type": "zhipu-account"
    },
    "api": {
      "type": "anthropic-messages",
      "baseURL": "https://api.z.ai/api/anthropic"
    },
    "models": ["GLM-5.3", "GLM-5.2", "GLM-5-Turbo"],
    "enabled": true
  },
  "builtin:bigmodel-coding-plan": {
    "label": "BigModel Coding Plan",
    "access": {
      "type": "zhipu-account"
    },
    "api": {
      "type": "anthropic-messages",
      "baseURL": "https://open.bigmodel.cn/api/anthropic"
    },
    "models": ["GLM-5.3", "GLM-5.2", "GLM-5-Turbo"],
    "enabled": true
  }
}
~~~

O Account Access decide qual Coding Plan Provider é realmente publicado na Family atual, e preenche o accessId e o subconjunto de modelos. Em seguida o serviço de autenticação de requisições usa o accessId para obter a Runtime API Key vigente.

### 4.4 Team Plan

O Team Plan pode reutilizar hoje o providerId do Coding Plan. O Account Access usa um accessId diferente para fixar a identidade de organização, projeto e conexão:

~~~text
personal coding plan
└─ zhipu-account:<account-id>:coding-plan:builtin:zai-coding-plan

team plan
└─ zhipu-account:<account-id>:team-plan:builtin:zai-coding-plan:<product>:<org>:<project>
~~~

Provider Config e Model Config não copiam o Team Secret. O serviço de autenticação de requisições obtém a Project Runtime Key correspondente com base no accessId. Se no futuro o produto decidir publicar simultaneamente as conexões Personal e Team como opcionais, a necessidade de ModelSelection carregar a identidade da conexão será um design independente; por enquanto M2 mantém cada Provider Family publicando apenas a conexão vigente.

### 4.5 Temporary Provider

Cenários com escopo de execução, como tarefas ociosas, podem anexar uma Provider Config temporária à Submission. Ela não é escrita no Official, no Personal nem no Registry residente:

~~~text
Submission
├─ ModelSelection
└─ Provider Config adicional
        |
        v
escopo de resolução temporário desta execução
        |
        v
Model
~~~

O Provider temporário usa o mesmo ProviderConfig, o mesmo Model Config e a mesma cadeia de construção de Model. Ao fim da tarefa, o escopo de resolução temporário é liberado naturalmente, sem precisar modificar ou restaurar a seleção de modelo persistente da Session.

## 5. Configuração comum dos modelos GLM

Os atributos abaixo são os fatos comuns do GLM provisoriamente definidos nesta rodada:

| Modelo | Context | Max Output | Image/PDF/Video | Tool Call | Structured Output | MCS |
| --- | ---: | ---: | --- | --- | --- | --- |
| GLM-5.3 | 1,000,000 | 128,000 | false / false / false | true | true | true |
| GLM-5.2 | 1,000,000 | 131,072 | false / false / false | true | true | true |
| GLM-5-Turbo | 204,800 | 131,072 | false / false / false | true | true | true |

Esses números registram as observações do código atual e da discussão. Antes da publicação da Official Config oficial, ainda é preciso conferir maiúsculas/minúsculas e valores de Context e Output com a configuração de Provider em produção e com o serviço real de modelos.

É possível expressar primeiro as Properties e Option Specs com regras genéricas:

~~~json
[
  {
    "modelMatch": "GLM-5\\.3",
    "config": {
      "properties": {
        "contextWindow": 1000000,
        "supportsImages": false,
        "supportsPdf": false,
        "supportsVideo": false,
        "supportsToolCall": true,
        "supportsJsonSchemaOutput": true,
        "supportsNativeWebSearch": false,
        "supportsMidConversationSystem": true
      },
      "optionSpecs": {
        "reasoningLevel": {
          "type": "enum",
          "values": ["low", "high", "max"],
          "default": "max"
        },
        "maxOutputTokens": {
          "type": "limit",
          "default": 128000,
          "max": 128000
        }
      }
    }
  },
  {
    "modelMatch": "GLM-5\\.2",
    "config": {
      "properties": {
        "contextWindow": 1000000,
        "supportsImages": false,
        "supportsPdf": false,
        "supportsVideo": false,
        "supportsToolCall": true,
        "supportsJsonSchemaOutput": true,
        "supportsNativeWebSearch": false,
        "supportsMidConversationSystem": true
      },
      "optionSpecs": {
        "reasoningLevel": {
          "type": "enum",
          "values": ["nothink", "high", "max"],
          "default": "max"
        },
        "maxOutputTokens": {
          "type": "limit",
          "default": 131072,
          "max": 131072
        }
      }
    }
  },
  {
    "modelMatch": "GLM-5-Turbo",
    "config": {
      "properties": {
        "contextWindow": 204800,
        "supportsImages": false,
        "supportsPdf": false,
        "supportsVideo": false,
        "supportsToolCall": true,
        "supportsJsonSchemaOutput": true,
        "supportsNativeWebSearch": false,
        "supportsMidConversationSystem": true
      },
      "optionSpecs": {
        "reasoningLevel": {
          "type": "enum",
          "values": ["enabled", "disabled"],
          "default": "enabled"
        },
        "maxOutputTokens": {
          "type": "limit",
          "default": 65536,
          "max": 131072
        }
      }
    }
  }
]
~~~

As regras precisas embutidas de Z.AI, BigModel e zcode-plan podem sobrescrever supportsNativeWebSearch para true. Esse campo expressa a propriedade executável final da combinação Provider + Model.

## 6. Configuração Anthropic Messages do GLM

### 6.1 GLM-5.3

O GLM-5.3 usa adaptive thinking + effort padrão do Anthropic, sem enviar budget:

~~~json
{
  "modelMatch": "GLM-5\\.3",
  "apiMatch": "anthropic-messages",
  "config": {
    "apiAdapter": {
      "reasoningMapping": {
        "low": {
          "thinking": { "type": "adaptive" },
          "effort": "low"
        },
        "high": {
          "thinking": { "type": "adaptive" },
          "effort": "high"
        },
        "max": {
          "thinking": { "type": "adaptive" },
          "effort": "max"
        }
      }
    }
  }
}
~~~

### 6.2 GLM-5.2

O nothink do GLM-5.2 desliga explicitamente o Thinking; os outros níveis usam adaptive + effort:

~~~json
{
  "modelMatch": "GLM-5\\.2",
  "apiMatch": "anthropic-messages",
  "config": {
    "apiAdapter": {
      "reasoningMapping": {
        "nothink": {
          "thinking": { "type": "disabled" }
        },
        "high": {
          "thinking": { "type": "adaptive" },
          "effort": "high"
        },
        "max": {
          "thinking": { "type": "adaptive" },
          "effort": "max"
        }
      }
    }
  }
}
~~~

### 6.3 GLM-5-Turbo

O Turbo mantém temporariamente o comportamento de compatibilidade fixed-budget atual. O 1024 vem da compatibilidade de orçamento mínimo do fixed thinking do Anthropic já existente, e não representa uma nova política genérica:

~~~json
{
  "modelMatch": "GLM-5-Turbo",
  "apiMatch": "anthropic-messages",
  "config": {
    "apiAdapter": {
      "reasoningMapping": {
        "enabled": {
          "thinking": {
            "type": "enabled",
            "budgetTokens": 1024
          }
        },
        "disabled": {
          "thinking": { "type": "disabled" }
        }
      }
    }
  }
}
~~~

Nesta rodada não vamos mudar o Turbo automaticamente para adaptive + effort, nem estender o 1024 para 5.2 ou 5.3.

## 7. Configuração OpenAI Chat do GLM

O OpenAI Chat Compatible permite que fabricantes estendam campos de requisição e resposta. Por isso, o thinking, o reasoning effort e o preserved thinking do GLM são descritos explicitamente pelo `apiAdapter`.

Regra ilustrativa para o GLM-5.3:

~~~json
{
  "modelMatch": "GLM-5\\.3",
  "apiMatch": "openai-chat-completions",
  "config": {
    "apiAdapter": {
      "reasoningMapping": {
        "low": {
          "thinking": { "type": "enabled" },
          "reasoningEffort": "low"
        },
        "high": {
          "thinking": { "type": "enabled" },
          "reasoningEffort": "high"
        },
        "max": {
          "thinking": { "type": "enabled" },
          "reasoningEffort": "max"
        }
      },
      "preserveThinking": true,
      "reasoningContentField": "reasoning_content"
    }
  }
}
~~~

O GLM-5.2 também usa a configuração fixa de replay, com o nível nothink definindo thinking.type como disabled. O Turbo continua mantendo o dialeto enable/disable atual; a tabela final de parâmetros ainda precisa ser conferida com o comportamento em produção.

preserveThinking é configuração fixa de protocolo. Ele não aparece no Composer nem é modificado arbitrariamente pelo Binding:

~~~text
preserveThinking = true
        |
        +---- a requisição escreve clear_thinking = false
        |
        +---- a resposta lê reasoning_content
        |
        +---- requisições seguintes do Tool Loop reapresentam reasoning_content tal como está
~~~

Configurar clear_thinking=false sem o replay completo faz com que as requisições seguintes de Tool Call fiquem sem o contexto de raciocínio exigido pelo modelo. A implementação antiga atual só habilita a compatibilidade de reasoning_content por nome para alguns modelos DeepSeek/MiMo; a implementação de destino deve ser guiada pelo Model API Adapter Config, saindo do hardcode de nomes de modelo.

## 8. OpenAI Responses

O protocolo OpenAI Responses deve seguir a semântica oficial de reasoning item e de effort. A faixa exata de suporte de GLM-5.2, GLM-5.3 e Turbo nos Endpoints Responses do Z.AI/BigModel ainda não foi completamente verificada em produção, portanto este rascunho não preenche um reasoningMapping especulativo.

Se depois for confirmado que determinado Endpoint Responses do GLM segue totalmente o protocolo oficial, a regra correspondente precisa apenas guardar o mapeamento oficial de effort; preserveThinking e reasoningContentField não devem ser copiados para a configuração de Responses.

## 9. Limite entre Account Access e autenticação de requisições

Os materiais dinâmicos dos três tipos de Account Provider são diferentes:

~~~text
Start Plan
├─ accessId fixa a conexão Start Plan da conta atual
├─ Request Auth obtém o JWT do ZCode
└─ a cada attempt, obtém sob demanda o header de verificação de segurança de uso único

Personal Coding Plan
├─ accessId fixa a conexão pessoal da conta atual
└─ Request Auth obtém a Runtime API Key vigente

Team Plan
├─ accessId fixa conta / organization / project
└─ Request Auth obtém a Project Runtime API Key vigente
~~~

O Registry guarda apenas a Effective Provider Config e a configuração final do modelo. O Model guarda o providerId, modelId, accessId, a API e as Options selecionados na criação. Cada requisição pode obter credenciais atualizadas da mesma conexão; a renovação de credenciais não modifica a identidade do Model. O Request Auth também precisa conferir que a conta dona das credenciais é consistente com o accessId, para não combinar um Model antigo com credenciais da nova conta após a troca.

## 10. Relação com o código existente

A implementação atual ainda tem vários fatos espalhados:

- Os IDs de Builtin Provider estão em packages/shared/src/model-provider-types.ts.
- O fallback de Endpoint do Start Plan e do Coding Plan está em packages/services/src/model-provider.
- Os níveis de reasoning do GLM e a comparação por nome de modelo estão distribuídos entre shared, services e o Adapter do CLI.
- O replay de reasoning_content ainda é dirigido pela lista de nomes de modelo em apps/zcode-cli/packages/adapters/src/model/reasoning-content-compat.ts.
- O limite de compatibilidade do budget fixo do Anthropic está em apps/zcode-cli/packages/adapters/src/model/reasoning-policy.ts.
- Native Web Search e Mid-conversation System ainda são em parte inferidos com base na API do Provider, no baseURL e no modelId.

Na migração, primeiro é preciso、判断 se cada fato antigo realmente participa do comportamento de produção atual. Os fatos de fato em vigor entram na Official Config ou na lógica de protocolo fixa do Adapter; campos de models.dev/bundled catalog que não estão em vigor não são carregados mecanicamente.

## 11. O que ainda precisa ser confirmado antes de publicar a Official Config

As seguintes questões permanecem como limites do rascunho:

1. A capitalização final, o Context, o Max Output e os valores de saída padrão de GLM-5.3, GLM-5.2 e Turbo na Official Config.
2. O Endpoint final do Start Plan do BigModel, o conjunto completo de modelos e sua relação com o Start Plan do Z.AI.
3. Se preserveThinking é fixo como true para todos os OpenAI Chat Providers do GLM, ou se é habilitado por regras de Builtin Provider específicos.
4. A cobertura real de modelos do GLM OpenAI Responses e os parâmetros exatos de reasoning.
5. O Schema oficial do Access OAuth não-Zhipu no futuro, e se ele reutiliza o mesmo modelo de identidade de acesso de conta.

Essas questões não derrubam a principal estratificação que já entrou no Design: o Provider Config agrega access e api, o Model Config agrega properties, optionSpecs e apiAdapter, o Account Access usa um Overlay de mesma forma, e a autenticação dinâmica de requisições fica no serviço do momento da requisição.