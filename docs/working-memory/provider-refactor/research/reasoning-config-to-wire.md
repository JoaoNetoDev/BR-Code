# Reasoning：da configuração do modelo até a requisição final

> Status: pesquisa da situação atual concluída, fronteira alvo formada; o plano concreto de migração ainda não foi implementado
> Data：2026-08-10
> Design da etapa correspondente：[`../steps/01-model-and-request.md`](../steps/01-model-and-request.md)
>
> Nota terminológica：nesta pesquisa, `ModelBinding` representa o objeto de modelo mantido por uma execução contínua; o design atual já convergiu para um `Model` chamável, com `model.bind(options)` expressando a derivação imutável. A terminologia antiga neste documento serve apenas para reconstituir a cadeia de código da época.

## Conclusão

Na camada de produto, Reasoning pode manter um modelo bem simples: o modelo declara quais níveis suporta, o usuário escolhe um deles, uma execução contínua fixa essa escolha e o Adapter a escreve nos campos de requisição aceitos pela interface de destino.

```text
模型声明 levels
      |
      v
用户选择 reasoningLevel
      |
      v
Model.bind() 固定 reasoningLevel
      |
      v
具体 Adapter 序列化
      |
      v
Provider HTTP 请求
```

A implementação atual ainda não formou essa fronteira limpa. O sistema primeiro converte o nível lógico em um `providerOptions` de estrutura arbitrária e depois passa esse objeto do Catalog, do Bootstrap e do Runtime até o Adapter. A lógica de conversão está distribuída ao mesmo tempo na projeção de configuração do App, na política de defaults do Catalog da CLI, no overlay dinâmico de Provider, na compatibilidade histórica e nas tarefas auxiliares de modelo.

Esta pesquisa originalmente era apenas uma questão de parâmetro dentro do design de M1 ModelBinding. Com o código aberto, é possível confirmar que ela já virou um tema de migração independente: o Catalog do repositório guardou mapas explícitos de parâmetros, o lado App descarta o mapa e guarda apenas o nível, e a CLI em seguida reconstrói os parâmetros separadamente por meio de uma regra dinâmica `first-match-wins` e de uma política de defaults `last-match-wins` do Standalone CLI; Title, Git, Compact e Memory ainda modificam o resultado de novo antes da chamada.

Por isso, esta rodada de pesquisa delimita aqui o ponto de parada. M1 mantém, no limite público, apenas o `reasoningLevel` genérico: a Selection salva a escolha do usuário, `Model.bind(options)` fixa o nível usado na execução contínua e a Request pode sobrescrever dentro do range validado pelos Option Specs. A resolução existente de `providerOptionsByLevel` fica concentrada na montagem de compatibilidade e no caminho do Adapter, sem mais ser exposta aos chamadores de negócio. Unificar o Catalog, apagar a dedução por nome, unificar as prioridades e refazer os dialetos do Adapter são migrações independentes posteriores. Este documento segue como a linha de base comportamental da situação atual nesse tema.

Os nomes mais fáceis de confundir podem ser lidos assim:

- `thoughtLevel`, `reasoningLevel` e `ModelRef.variant` expressam o nível lógico escolhido pelo usuário, como `high`.
- `providerOptionsByLevel` é a tabela de consulta «nível → parâmetro do fornecedor»; ela não é enviada como está para a interface do modelo.
- `providerOptions` é o objeto intermediário que uma execução prepara para entregar ao AI SDK, contendo ainda reasoning, transport, orçamento de saída e outros parâmetros do Provider.
- `reasoning_effort`, `enable_thinking`, `thinking` e `output_config.effort` são os campos Effective na requisição HTTP final.

Sob o mesmo protocolo OpenAI-compatible, esses campos finais não são uniformes. O código atual escolhe o dialeto principalmente com base em mapas explícitos, `provider.kind`, `providerId`, `modelId` e listas de níveis; o Base URL não participa do julgamento de dialeto de reasoning. Portanto, dois Providers com o mesmo kind, o mesmo modelId e URLs diferentes recebem os mesmos parâmetros quando não há mapa explícito. Essa é uma limitação explícita da implementação atual.

### `apiFormat`、`defaultKind` e `kind`

O que a página de configurações expõe ao usuário é `apiFormat`:

```text
anthropic-messages
openai-chat-completions
openai-responses
```

Ao salvar o Provider Config, a página também escreve o `defaultKind` derivado dele. Quando o Host gera o Registry de runtime, ele resolve primeiro o `apiFormat` final e então deriva o `kind` usado pela CLI:

```text
apiFormat                    defaultKind / kind
anthropic-messages        <-> anthropic
openai-responses          <-> openai
openai-chat-completions   <-> openai-compatible
```

Quando um Provider embutido entra no `ModelProviderConfig`, ele normalmente preenche `apiFormat` e `defaultKind` ao mesmo tempo. O Start Plan hardcoded escreve diretamente esse par de valores; o schema builtin remoto normalmente fornece primeiro o `primaryKind`, e o `apiFormat` é derivado no carregamento.

Sob os três protocolos atuais, esses campos não expressam informação independente. O protocolo de runtime permite ao mesmo tempo `kind` e `apiFormat`, mas não exclui combinações inconsistentes no tipo. A direção de evolução proposta é fazer de `apiFormat` o fato único na configuração e no protocolo; o interior do Adapter factory pode continuar usando sua própria enumeração de implementação, mas essa enumeração deixa de entrar no Provider Config ou no protocolo entre processos. Essa direção ainda precisa, antes da implementação, validar a migração de `provider.kind` no Standalone CLI e como escolher explicitamente o protocolo atual quando um Provider tem vários endpoints.

## Uma cadeia completa

O diagrama abaixo coloca primeiro os principais objetos da situação atual na mesma linha:

```text
App config / CLI config / builtin Catalog
                |
                | 声明 levels，部分来源还声明参数映射
                v
ModelCapability.reasoning
├─ enabled
├─ levels
├─ defaultLevel
└─ providerOptionsByLevel
                |
                | 用户在 App / TUI / Automation / Subagent 中选择
                v
thoughtLevel / ModelRef.variant
                |
                | resolveThoughtProviderOptionsForLevel()
                v
Runtime.modelProviderOptions
                |
                | Model Step 构造 ModelTextRequest
                v
ModelTextRequest.providerOptions
                |
                | runner-options 按 Provider kind 归一化 namespace
                v
AI SDK providerOptions
                |
                | 各 SDK 序列化
                v
HTTP request body
```

Hoje `ModelCapability.reasoning` descreve ao mesmo tempo a capacidade que o usuário pode escolher e o mapa de parâmetros do fornecedor:

```ts
interface ModelReasoningCapability {
  enabled: boolean;
  levels: string[];
  defaultLevel?: string;
  providerOptionsByLevel?: Record<string, Record<string, unknown>>;
}
```

Por exemplo：

```ts
{
  enabled: true,
  levels: ["low", "high"],
  defaultLevel: "high",
  providerOptionsByLevel: {
    low:  { openaiCompatible: { reasoningEffort: "low" } },
    high: { openaiCompatible: { reasoningEffort: "high" } }
  }
}
```

Depois que o usuário escolhe `high`, o Runtime recebe:

```ts
{
  openaiCompatible: {
    reasoningEffort: "high";
  }
}
```

O Adapter OpenAI-compatible acaba enviando:

```json
{
  "reasoning_effort": "high"
}
```

## De onde vem a configuração

### A configuração persistida do App

O arquivo autoritativo do App é `~/.zcode/v2/config.json`. Hoje o reasoning persistido descreve apenas níveis e não guarda os parâmetros de requisição do fornecedor:

```jsonc
{
  "provider": {
    "deepseek": {
      "kind": "openai-compatible",
      "options": {
        "apiKey": "sk-...",
        "baseURL": "https://api.deepseek.com/v1",
      },
      "models": {
        "deepseek-v4-pro": {
          "reasoning": {
            "enabled": true,
            "variants": ["high", "max"],
            "defaultVariant": "max",
          },
        },
      },
    },
  },
}
```

Depois de ser lida pelo App, essa configuração é convertida no `ModelProviderReasoningSpec` interno. Cada level tem, por enquanto, apenas um nome, sem patch:

```ts
{
  defaultLevel: "max",
  levels: {
    high: {},
    max: {}
  }
}
```

Quando o App salva a configuração, ele limpa os antigos mapas de parâmetros `model.variants`, `reasoningSpec` e `zcode.reasoning`. Ou seja, a configuração salva por um usuário comum pela página de configurações do App não consegue determinar diretamente se `high` acaba usando `reasoning_effort` ou `enable_thinking`; o zcode-cli completa o mapa em runtime.

As conversões relacionadas ficam em `openCodeReasoningToModelReasoning()` e `modelReasoningToOpenCodeReasoning()`, em `modelProviderServiceStorage.ts`.

### A configuração do Standalone CLI

O Standalone CLI lê `~/.zcode/cli/config.json`. Ele aceita uma estrutura mais próxima do Runtime e pode salvar `providerOptionsByLevel` explicitamente:

```jsonc
{
  "provider": {
    "custom-qwen": {
      "kind": "openai-compatible",
      "baseURL": "https://example.com/v1",
      "models": {
        "qwen3.5-plus": {
          "reasoning": {
            "enabled": true,
            "levels": ["enabled", "disabled"],
            "defaultLevel": "enabled",
            "providerOptionsByLevel": {
              "enabled": { "enable_thinking": true },
              "disabled": { "enable_thinking": false },
            },
          },
        },
      },
    },
  },
}
```

Como o kind do Provider é `openai-compatible`, o schema da CLI embrulha em namespace os parâmetros que não trazem namespace:

```ts
{
  enabled: {
    openaiCompatible: { enable_thinking: true }
  },
  disabled: {
    openaiCompatible: { enable_thinking: false }
  }
}
```

Se a configuração já tiver o namespace `anthropic`, `openai` ou `openaiCompatible`, ela é mantida como está.

Isso significa que a configuração do App e a do Standalone CLI não são simétricas hoje: o App guarda apenas níveis; a CLI pode guardar níveis e parâmetros de envio ao mesmo tempo.

### Model Catalog e Providers embutidos

O Model Catalog histórico e a configuração builtin remota usam patches para descrever os parâmetros de cada transport:

```ts
interface ModelProviderReasoningSpec {
  defaultLevel?: string;
  levels: Record<
    string,
    Partial<Record<"anthropic" | "openai" | "openai-compatible", ProviderOptionsPatch>>
  >;
}
```

Uma configuração real de Catalog do Kimi K3 é：

```jsonc
{
  "defaultLevel": "max",
  "levels": {
    "high": {
      "anthropic": {
        "set": [{ "path": ["output_config", "effort"], "value": "high" }],
      },
      "openai-compatible": {
        "set": [{ "path": ["reasoningEffort"], "value": "high" }],
      },
    },
  },
}
```

Quando o App projeta o transport atual para o zcode-cli, ele pega apenas o patch do kind correspondente. Supondo que o kind atual seja `openai-compatible`, o acima vira:

```ts
{
  high: {
    openaiCompatible: {
      reasoningEffort: "high";
    }
  }
}
```

A configuração persistida comum do App limpa esses patches, mas o Coding Plan embutido, o Start Plan e o client config remoto podem carregar em memória o `ModelProviderReasoningSpec` completo e entrar no zcode-cli pela mesma função de projeção do protocolo.

O estado de login do Plan, o julgamento de entitlement, a API Key de runtime e os Headers de verificação de segurança pontual não participam da escolha do dialeto de reasoning. Eles primeiro formam o Provider atualmente chamável; o reasoning continua sendo determinado pelo `kind` desse Provider e pela definição do modelo. Hoje os Plans embutidos do ZCode são projetados principalmente como runtime Anthropic, então modelos como GLM seguem o caminho `anthropic.effort` / `anthropic.thinking`. Atualizar Token ou Header antes da requisição muda apenas o material de autenticação, não o nível de reasoning já escolhido.

No Catalog local atual, os caminhos de patch de reasoning que realmente aparecem são apenas cinco:

```text
anthropic
├─ output_config.effort
└─ thinking

openai-compatible
├─ reasoningEffort
├─ enable_thinking
└─ thinking.type
```

A estrutura de patch do Catalog é a expressão da camada de configuração; se ela é aceita diretamente pelo SDK ainda passa pela normalização de casos especiais de modelo e do Adapter no zcode-cli. Por exemplo, o Kimi K3 regenera `anthropic.effort` no overlay da CLI e não entrega diretamente ao SDK o `anthropic.output_config.effort` do Catalog.

## Como o zcode-cli forma o `providerOptionsByLevel`

### Provider dinâmico do App

Depois que o App envia o Provider pelo protocolo, `workspace-model-catalog.ts` cria a capability de runtime para cada modelo. A ordem é aproximadamente a seguinte：

```text
Kimi K3 模型特例
        |
        | 命中时直接使用 K3 规则
        v
入站 reasoning levels
        |
        +-- 按 kind / providerId / modelId 生成缺失映射
        |
        +-- 合并入站显式 providerOptionsByLevel
        |   显式字段优先
        v
过滤到入站声明的 levels
        |
        v
ModelCapability.reasoning
```

Sem reasoning de entrada, a CLI tenta completar defaults pelo nome do modelo e pelo kind do Provider. Os campos de julgamento principais são：

```text
provider.kind
provider.providerId
model.modelId
model.reasoning.levels
model.reasoning.providerOptionsByLevel
```

O Base URL não está nesse conjunto de julgamentos.

Hoje há várias categorias de reconhecimento hardcoded：

- modelos `gpt` escolhem parâmetros OpenAI, OpenAI-compatible ou Anthropic conforme `provider.kind`；
- `qwen` é julgado pelo prefixo de providerId ou pelo modelId e usa `enable_thinking`；
- `glm` decide, pelo nome do modelo e pelo nível, se é um interruptor ou um nível de profundidade；
- `deepseek-v4` usa simultaneamente `thinking.type` e `reasoningEffort`；
- modelos como Kimi e MiMo usam o interruptor `thinking.type` conforme a família de providerId／modelId；
- Kimi K3 força `low/high/max` e usa effort conforme o transport.

Quando o mesmo nome de modelo é conectado em duas URLs diferentes, desde que as regras de kind, providerId／modelId sejam as mesmas, o mesmo mapeamento é gerado. Para expressar dialetos diferentes, hoje só é possível fazer o upstream carregar patches de reasoning explicitamente diferentes, ou adicionar novos casos especiais no código.

### Política de defaults do Standalone CLI

O Catalog estático do Standalone CLI usa outro conjunto de regras padrão, com o núcleo em `default-policy.ts` e `reasoning-policy.ts`:

```text
Kimi K3                 -> low / high / max
DeepSeek V4             -> high / max
GLM 5.2                 -> max / high / nothink
其他 GLM / DeepSeek     -> enabled / disabled
Claude                   -> low / medium / high / xhigh
Claude Opus 4.7          -> low / medium / high / xhigh / max
GPT                      -> low / medium / high / xhigh
```

Aqui também o mapa padrão é escolhido por `providerId` e `modelId`. Para modelos `openai-compatible` customizados sem reasoning explícito, a resolução atual de configuração ainda completa um interruptor genérico `thinking.type = enabled/disabled`. Essa regra tem cobertura ampla e não é garantida como adequada para todos os serviços OpenAI-compatible.

### Como os nomes de nível são normalizados

Uma escolha normal primeiro faz correspondência exata e depois correspondência sem distinção de maiúsculas e minúsculas. Sem escolha explícita, usa-se o `defaultLevel` válido; sem um default válido, usa-se `levels[0]`.

Hoje existem ainda dois grupos de apelidos específicos de modelo:

```text
DeepSeek V4
├─ low / medium -> high
└─ xhigh         -> max

thinking toggle
├─ enabled       -> enabled
└─ disabled/off  -> disabled
```

A UI do App traduz valores como `off`, `disabled`, `none` e `nothink` para textos adequados à exibição, mas o próprio apelido de exibição não muda automaticamente os parâmetros do Provider. A normalização efetiva da execução continua sendo feita pelas regras de Catalog／Bootstrap.

### Como options estáticas e options de nível são mescladas

O target do modelo pode trazer primeiro um conjunto estático de `providerOptions`, por exemplo formato de API, opções de structured output ou campos customizados configurados pelo usuário. Depois o Bootstrap faz merge profundo das options do nível selecionado por cima, e as options do nível sobrescrevem os valores estáticos do mesmo caminho：

```text
target.providerOptions
        +
providerOptionsByLevel[selectedLevel]
        |
        | recursive merge，selected level 优先
        v
Runtime.modelProviderOptions
```

Se as options estáticas usarem o caminho de reasoning antigo `extra_body`, o Bootstrap primeiro remove os campos de reasoning antigos já reconhecidos e então mescla as options canônicas do nível; os demais campos customizados continuam preservados.

Ao chegar no runner do Adapter, as options estáticas do Provider Registry e o `ModelTextRequest.providerOptions` são mesclados mais uma vez. Essa camada é um merge de nível superior, e o namespace de topo de mesmo nome do objeto de requisição tem prioridade. O caminho principal normal já entra aqui com o namespace completo sintetizado pelo Bootstrap, mas caminhos periféricos que chamam o ModelPort diretamente ainda podem depender desse comportamento.

## Todos os principais dialetos de parâmetros hoje

Aqui não existe uma «máquina de estados de reasoning» com enumeração finita. O Catalog local atual tem apenas cinco caminhos de patch; depois das políticas de defaults da CLI e da conversão de namespace do SDK, surgem as sete classes principais de formato de campo abaixo, e é permitido que effort e thinking apareçam combinados.

| Interface de execução                | Campo canônico intermediário          | Campo típico da requisição final |
| ------------------------------------ | -------------------------------------- | -------------------------------- |
| OpenAI Responses                      | `openai.reasoningEffort`              | `reasoning.effort`               |
| OpenAI-compatible effort             | `openaiCompatible.reasoningEffort`    | `reasoning_effort`               |
| Qwen compatible                      | `openaiCompatible.enable_thinking`    | `enable_thinking`                |
| Kimi/MiMo compatible toggle          | `openaiCompatible.thinking.type`      | `thinking.type`                  |
| Anthropic effort                     | `anthropic.effort`                    | `output_config.effort`           |
| Anthropic fixed thinking             | `anthropic.thinking.budgetTokens`     | `thinking.budget_tokens`         |
| Anthropic adaptive thinking          | `anthropic.thinking.type = adaptive`  | `thinking.type = adaptive`       |

Abaixo, agrupado pela interface final. Cada seção dá o nível lógico, o `providerOptions` intermediário e o corpo final da requisição.

### OpenAI Responses：`reasoning.effort`

O Provider da OpenAI usa hoje o model Responses do AI SDK. Os níveis lógicos costumam ser：

```text
low / medium / high / xhigh
```

O valor intermediário formado pelo Provider dinâmico do App：

```ts
{
  openai: {
    reasoningEffort: "high";
  }
}
```

A política de defaults do Standalone às vezes ainda produz o campo canônico de topo:

```ts
{
  reasoningEffort: "high";
}
```

O `runner-options.ts` embrulha os campos de topo no namespace `openai`. A requisição final de OpenAI Responses fica：

```json
{
  "reasoning": {
    "effort": "high"
  }
}
```

Ao desligar o reasoning, modelos que suportam `none` recebem：

```ts
{
  openai: {
    reasoningEffort: "none";
  }
}
```

Requisição final：

```json
{
  "reasoning": {
    "effort": "none"
  }
}
```

O AI SDK só gera o objeto `reasoning` para os reasoning models que ele reconhece. Se um level específico é aceito por determinado modelo continua sendo julgado pela API da OpenAI; por exemplo, `none` e `xhigh` não são suportados por todos os modelos GPT.

### OpenAI-compatible effort：`reasoning_effort`

Kimi K3、GLM 5.2、GPT chamado por interface compatível e alguns DeepSeek usam esse caminho.

Valor intermediário：

```ts
{
  openaiCompatible: {
    reasoningEffort: "max";
  }
}
```

O Adapter copia o conteúdo de `openaiCompatible` para o namespace dinâmico de Provider realmente usado pelo AI SDK, e o AI SDK converte camelCase em snake_case:

```json
{
  "reasoning_effort": "max"
}
```

O `nothink` do GLM 5.2 é mapeado para:

```ts
{
  openaiCompatible: {
    reasoningEffort: "none";
  }
}
```

O resultado final é：

```json
{
  "reasoning_effort": "none"
}
```

Os níveis completos do Kimi K3 na interface compatível são：

```text
low  -> reasoning_effort: "low"
high -> reasoning_effort: "high"
max  -> reasoning_effort: "max"
```

### Interruptor do Qwen：`enable_thinking`

A interface OpenAI-compatible do Qwen usa um campo booleano：

```ts
// enabled
{
  openaiCompatible: {
    enable_thinking: true;
  }
}

// disabled / off
{
  openaiCompatible: {
    enable_thinking: false;
  }
}
```

Como o AI SDK repassa diretamente os campos compatíveis não reconhecidos, as requisições finais são:

```json
{ "enable_thinking": true }
```

```json
{ "enable_thinking": false }
```

Hoje o reconhecimento do Qwen depende de o providerId começar com `qwen-alibaba-model-studio`, ou de o modelId começar com `qwen`.

### Kimi K2、MiMo e o interruptor compatível genérico：`thinking.type`

Outro lote de serviços OpenAI-compatible usa um interruptor em forma de objeto：

```ts
// enabled
{
  openaiCompatible: {
    thinking: {
      type: "enabled";
    }
  }
}

// disabled / off
{
  openaiCompatible: {
    thinking: {
      type: "disabled";
    }
  }
}
```

A requisição final mantém a mesma forma：

```json
{ "thinking": { "type": "enabled" } }
```

```json
{ "thinking": { "type": "disabled" } }
```

A regra padrão atual também coloca nesse dialeto parte dos modelos GLM, DeepSeek e OpenAI-compatible desconhecidos que não têm mapa explícito.

### DeepSeek V4：effort e thinking aparecem juntos

Os `high/max` do DeepSeek V4 carregam simultaneamente profundidade e estado de ativação：

```ts
// high
{
  openaiCompatible: {
    reasoningEffort: "high",
    thinking: { type: "enabled" }
  }
}
```

Requisição final：

```json
{
  "reasoning_effort": "high",
  "thinking": { "type": "enabled" }
}
```

O Catalog local atual também declara `off`：

```ts
{
  openaiCompatible: {
    thinking: {
      type: "disabled";
    }
  }
}
```

O patch do Catalog também remove `reasoningEffort`. O overlay dinâmico também gera thinking desabilitado quando recebe o `off` de entrada. A política estática de defaults em si só lista `high/max`, então a cobertura de níveis disponíveis para o DeepSeek V4 não é completamente igual entre as diferentes origens.

### Anthropic effort：`output_config.effort`

Ao chamar via Anthropic Messages modelos que só precisam de nível de profundidade, como Kimi K3 e GPT, o valor intermediário é：

```ts
{
  anthropic: {
    effort: "xhigh";
  }
}
```

O SDK da Anthropic finalmente gera：

```json
{
  "output_config": {
    "effort": "xhigh"
  }
}
```

O `low/high/max` do Kimi K3 também segue essa forma, sem carregar `thinking`.

### Anthropic fixed thinking：effort + budget

A política padrão do Claude comum hoje converte os níveis em um orçamento fixo:

```text
low    -> 4,000 tokens
medium -> 8,000 tokens
high   -> 16,000 tokens
xhigh  -> 32,000 tokens
```

Por exemplo, `high`:

```ts
{
  anthropic: {
    effort: "high",
    thinking: {
      type: "enabled",
      budgetTokens: 16000
    }
  }
}
```

Requisição final：

```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 16000
  },
  "output_config": {
    "effort": "high"
  }
}
```

O thinking budget fixo também afeta o orçamento de saída. O Adapter primeiro deixa o reasoning budget caber dentro do `maxOutputTokens` desta requisição e só então entrega ao SDK da Anthropic; o `max_tokens` final em produção mantém o orçamento total de saída desta requisição, em vez de aumentar sem limite os thinking tokens por cima dele.

### Anthropic adaptive thinking

O Opus 4.7 usa hoje adaptive thinking e suporta `max`:

```ts
{
  anthropic: {
    effort: "max",
    thinking: {
      type: "adaptive"
    }
  }
}
```

Requisição final：

```json
{
  "thinking": {
    "type": "adaptive"
  },
  "output_config": {
    "effort": "max"
  }
}
```

### Interruptor do Anthropic

Ao chamar via Anthropic Messages modelos que oferecem apenas um interruptor, o estado de ativação normalmente usa um orçamento de compatibilidade de 1.024 tokens:

```ts
{
  anthropic: {
    thinking: {
      type: "enabled",
      budgetTokens: 1024
    }
  }
}
```

Requisição final：

```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 1024
  }
}
```

O valor intermediário do estado desligado é：

```ts
{
  anthropic: {
    thinking: {
      type: "disabled";
    }
  }
}
```

Hoje o AI SDK omite `thinking` na requisição final e também não gera `output_config`. Ele não envia `{ "thinking": { "type": "disabled" } }`. O wire test do repositório já fixa explicitamente esse comportamento.

### GLM / DeepSeek via Anthropic Messages

O `high/max` do GLM 5.2 traz effort e orçamento fixo ao mesmo tempo:

```ts
// max
{
  anthropic: {
    effort: "max",
    thinking: {
      type: "enabled",
      budgetTokens: 32000
    }
  }
}
```

A requisição final é igual à do Claude com fixed thinking:

```json
{
  "thinking": {
    "type": "enabled",
    "budget_tokens": 32000
  },
  "output_config": {
    "effort": "max"
  }
}
```

O `nothink` produz o valor intermediário `thinking: disabled`, e o resultado final omite `thinking` e `output_config`.

O DeepSeek V4, quando chamado via Anthropic Messages, usa o effort correspondente em `high/max` e fixa `thinking.budgetTokens = 1024`.

## `extra_body` e compatibilidade histórica

Configurações antigas usavam várias camadas de embrulho para enfiar campos não padronizados em requisições OpenAI-compatible:

```ts
{
  openaiCompatible: {
    extra_body: {
      chat_template_kwargs: {
        reasoning_effort: "high",
        enable_thinking: true
      }
    }
  }
}
```

O Bootstrap atual reconhece os seguintes caminhos antigos:

```text
openaiCompatible.extra_body.chat_template_kwargs.reasoning_effort
openaiCompatible.extra_body.chat_template_kwargs.enable_thinking
openaiCompatible.extra_body.thinking
openaiCompatible.extra_body.enable_thinking
openaiCompatible.thinking
```

Se o Catalog atual conseguir casar esses campos com um level, o Bootstrap remove os subcaminhos antigos de reasoning e então mescla o mapa canônico. Por exemplo:

```text
extra_body.chat_template_kwargs.reasoning_effort = "high"
        |
        v
openaiCompatible.reasoningEffort = "high"
```

Se o modelo não for reconhecido, o `extra_body` original é preservado, para não quebrar parâmetros customizados do usuário.

Na fronteira do Adapter, um `openaiCompatible.extra_body` que ainda exista é expandido uma vez:

```ts
{
  openaiCompatible: {
    extra_body: {
      thinking: { type: "enabled" }
    },
    reasoningEffort: "max"
  }
}
```

Requisição final：

```json
{
  "thinking": { "type": "enabled" },
  "reasoning_effort": "max"
}
```

O novo Catalog local já não salva patches de reasoning em `extra_body`; hoje todos os patches OpenAI-compatible do source catalog usam campos canônicos diretos.

## Como a escolha do usuário chega ao Runtime

### App e protocolo

O ID dessa opção na UI é `thought_level`. A capability do modelo oferece os valores possíveis, e Composer, Draft, Workspace default, Task meta e Session snapshot guardam uma string cada no seu próprio escopo.

Ao trocar de nível, o protocolo atual chama `session/setThoughtLevel`. O `setThoughtLevel()` da CLI:

```text
读取当前 modelRef
        |
        v
从 Catalog 校验 level
        |
        v
查 providerOptionsByLevel[level]
        |
        v
同时修改 Runtime
├─ modelRef.variant = level
└─ modelProviderOptions = 对应 options
        |
        v
持久化 Session model selection
```

O item persistente da Session guarda:

```ts
{
  providerId: string,
  modelId: string,
  thoughtLevel?: string
}
```

O Runtime hoje guarda dois fatos ao mesmo tempo: «escolha lógica + parâmetros já expandidos». É daí que vem a enorme quantidade de dedução inversa na recuperação de sistema e na telemetria.

### TUI e Standalone CLI

Os comandos `/effort` e `/variant` da TUI leem primeiro o `listThoughtLevels()` do modelo atual e então chamam o mesmo `app.setThoughtLevel()`. Eles não montam parâmetro de fornecedor por conta própria.

O Standalone CLI também guarda um reasoning level global recente, no local setting do SQLite da Session:

```text
namespace = "model"
key       = "reasoningLevel"
scope     = "user"
scopeID   = "default"
value     = { level: "high" }
```

Esse valor global participa do nível preferido de um novo Runtime ou do modelo de um Turn temporário. A Session continua persistindo o seu próprio `thoughtLevel`.

O CLI de Prompt pontual de hoje não tem um parâmetro `--reasoning` / `--thought-level` independente. Quando o chamador não fornece explicitamente `modelProviderOptions` pela config do Runtime, a montagem de inicialização lê o valor global acima; a cadeia de recuperação de uma Session existente ainda restaura a escolha atual com o `thoughtLevel` salvo pela própria Session.

### Automation、Bot e tarefas ociosas

Automation、Bot e OffPeak Task podem carregar a string `thoughtLevel`. Automation／Bot comuns aplicam o nível pelos parâmetros de criação ou recuperação da Session e depois continuam passando por `setThoughtLevel()`.

As tarefas ociosas também carregam um `turnRuntimeModel` completo:

```ts
{
  model: { providerId, modelId },
  thoughtLevel,
  provider: {
    kind,
    baseURL,
    apiKey,
    models: [...]
  }
}
```

O Host injeta o Provider temporário como overlay do turn, e a CLI gera o `TurnExecutionModel`, que já contém `modelRef` e `modelProviderOptions`. Esse objeto é a estrutura hoje mais próxima da entrada do futuro ModelBinding.

Há aqui uma diferença que vale corrigir na migração: `ZCodeModelRuntimeConfig.thoughtLevel` chega com tarefas ociosas, mas o `resolveTurnExecutionModel()` atual, ao resolver os parâmetros, lê a preferência de reasoning global da CLI e não passa diretamente `runtimeModel.thoughtLevel` como preferred level. Só quando os dois coincidem por acaso, ou quando o default do modelo coincide, o nível efetivo do turno é igual ao valor especificado pelo Host.

## Como o Model Step usa os parâmetros

No início de cada Model Step, o Agent Loop principal escolhe:

```text
存在 turnExecutionModel
├─ modelRef            <- turnExecutionModel.modelRef
├─ context / output    <- turnExecutionModel
└─ providerOptions     <- turnExecutionModel.modelProviderOptions

不存在 turnExecutionModel
├─ modelRef            <- Runtime defaultModelRef
├─ context / output    <- Runtime config
└─ providerOptions     <- Runtime config.modelProviderOptions
```

Depois o `ModelTextRequest` carrega simultaneamente:

```ts
{
  model: ModelRef,
  messages: [...],
  tools: [...],
  providerOptions: Record<string, unknown>
}
```

O Adapter Registry usa `model` para consultar o factory do Provider, o endpoint, a credencial e o model do SDK. O `runner-options.ts` mescla as options estáticas do Provider com as options da requisição e executa a conversão final de namespace.

Nessa cadeia, a identidade do modelo e os parâmetros de reasoning vêm do snapshot de Runtime／Turn, o client do Provider vem do Adapter Registry e a capability vem do Catalog. A responsabilidade do `Model` alvo é reunir os três em um único objeto chamável.

## Como as chamadas especiais de modelo tratam o reasoning

### Automatic Compact

O Automatic Compact herda por padrão o `modelRef` e o `providerOptions` do Loop principal. `ENABLE_COMPACT_SUMMARY_THINKING` está hoje como true, então a requisição de resumo continua usando o reasoning do Loop principal.

O código ainda mantém o branch que desliga o reasoning do Compact. Esse branch remove o effort e muda o thinking de Anthropic／OpenAI-compatible para disabled. Ele pertence a uma política comutável histórica e o caminho padrão atual não o dispara.

### Session Title e Goal Summary Title

As tarefas de título desligam o reasoning de forma fixa. A implementação atual herda primeiro o `providerOptions` do Runtime e então modifica o objeto conforme o modelo e o dialeto:

```text
Anthropic              -> thinking disabled，删除 effort
OpenAI GPT 支持 none   -> reasoningEffort = "none"
OpenAI-compatible      -> enable_thinking=false / thinking disabled / effort none
MiniMax M3             -> 再按 apiFormat 补专用关闭字段
```

Essa lógica está em `title-provider-options.ts`, e precisa entender ao mesmo tempo o nome do modelo, o namespace do Provider e os três formatos de API. Se o design alvo mantiver «o título não pensa», isso deve ser expresso pelo Model Options genérico como `reasoningLevel = disabled`; se o `bind()` acontece no início da tarefa ou se é um override de uma requisição única depende do ciclo de vida da tarefa. O Core deixa de modificar diretamente o objeto de parâmetros do fornecedor.

### Git Commit Message

A chamada comum de `workspace/generateText` herda as options atuais do Provider; o Git Commit Message reaproveita a projeção sem pensamento da tarefa de título e portanto tem os mesmos branches de dialeto.

### Repo Wiki

O Repo Wiki hoje não passa pelo `ModelPort`, por `workspace/generateText` nem pela cadeia de `providerOptions` acima. Ele lê, do Provider Registry correspondente ao workspace, o provider, model, endpoint, API Key, headers e `apiFormat`, e em seguida constrói diretamente três requisições HTTP dentro de `packages/services`:

```text
openai-chat-completions
└─ model / max_tokens / messages / temperature

openai-responses
└─ model / input / max_output_tokens

anthropic-messages
└─ model / max_tokens / messages / temperature
```

Nenhuma dessas requisições carrega um nível de reasoning, nem envia `reasoning_effort`, `enable_thinking`, `thinking` ou `output_config`. Portanto, hoje o Repo Wiki nem herda o nível da Session nem tem uma política própria de reasoning. Ele é uma cadeia de chamada de modelo independente que a reestruturação de Providers precisa consolidar: no futuro, deve criar primeiro sua própria Selection／Binding e então disparar a requisição pelo Binding; se usa o nível padrão ou se desliga o reasoning explicitamente precisa ser decidido pela semântica de produto do Repo Wiki.

### Bot

O Bot não tem outro Adapter de requisição de modelo. A configuração `/thoughtLevel` do Bot, o estado do rascunho e a lógica de salvar os parâmetros da tarefa guardam o nível lógico e, depois de criar ou recuperar a ZCode Task, continuam entrando na cadeia padrão de execução de Session／Agent. Portanto, o que o Bot precisa unificar são as semânticas de Selection, Submission e recuperação de Session, e não um novo dialeto de reasoning no wire.

### Project Memory

O seletor de Project Memory Recall usa o modelo Lite ou o modelo principal e só gera structured output de 256 tokens. O código atual apenas limpa o namespace `anthropic`, para que o thinking fixo não consuma o orçamento:

```ts
{
  ...providerOptions,
  anthropic: {}
}
```

Ele não faz o mesmo tratamento para OpenAI e OpenAI-compatible, nem forma uma escolha lógica de reasoning explícita. Essa é uma cadeia de conserto local.

Project Memory Extraction e Dream capturam o modelo e as options do Provider e então executam seu próprio pequeno Agent Loop.

### Goal Completion Verification

O goal verifier usa o modelo e o `modelProviderOptions` do Runtime atual e não tem política própria de reasoning. Durante as retentativas o model ref é capturado, mas as options do Provider continuam sendo lidas da config do Runtime.

### Subagent

O perfil de Subagent pode declarar model e `thoughtLevel` ao mesmo tempo. Só quando o perfil especifica um modelo concreto o código atual chama `resolveModelProviderOptions(modelRef, profile.thoughtLevel)` para resolver os parâmetros do Child Runtime.

```text
profile 指定具体模型与 thoughtLevel
└─ 按 child model + profile thoughtLevel 解析 providerOptions

profile 使用 inherit / main
└─ 继承父 Runtime 的 modelProviderOptions

闲时 turnExecutionModel 存在
└─ 强制 Child 使用整个 TurnExecutionModel 快照
```

Isso já expressa a semântica de produto correta: quando o Child muda de modelo ou de reasoning, ele deve formar seu próprio Binding; quando herda, reutiliza a escolha do pai. A implementação atual ainda passa `modelRef + providerOptions` separadamente.

## Dedução inversa e telemetria

O Runtime atual frequentemente só tem `providerOptions`, então o sistema ainda precisa responder de forma inversa «qual é o nível afinal». O `runtime-thought-level.ts` compara item a item, por merge profundo, as options atuais com `providerOptionsByLevel`:

```text
Runtime providerOptions
        |
        | 和每个 level 的 options 比较
        v
推回 effective thought level
```

Ele também reconhece os seguintes tipos de controle:

```text
fixed_level   reasoningEffort / reasoning_effort / effort
fixed_budget  budgetTokens / budget_tokens
adaptive      thinking.type = adaptive
toggle        enable_thinking / reasoning_enabled / thinking.type
```

A telemetria verifica apenas o namespace que o Adapter atual realmente consome, evitando erros quando `anthropic` e `openaiCompatible` coexistem no mesmo objeto. O namespace efetivo do OpenAI-compatible é por sua vez determinado por `providerOptionsName`.

Essa dedução inversa serve à recuperação de Session, ao nível atual na UI, ao Trace e à atribuição de telemetria. Depois que o futuro Binding passar a guardar diretamente `ModelSelection.reasoningLevel`, a cadeia normal de execução poderá registrar a escolha lógica; o Adapter ainda poderá registrar os parâmetros efetivos finais no wire, úteis para investigar o comportamento do fornecedor, sem precisar adivinhar de volta a escolha do usuário a partir de um objeto arbitrário.

## Onde estão concentrados os problemas atuais

### Declaração de capacidade e regra de serialização misturadas

`ModelCapability.reasoning` diz ao mesmo tempo à UI «existe o nível high» e ao Adapter «o que high deve enviar». O Renderer só precisa da primeira metade, e o Core também não deveria entender a segunda.

### A mesma regra tem vários pontos de geração

Existem hoje pelo menos estes pontos de geração ou correção:

```text
App Catalog patch 投影
Standalone CLI default-policy
Standalone CLI config normalization
动态 workspace-model-catalog
Bootstrap legacy migration
Title / Git / Compact / Memory 请求修补
Adapter runner namespace normalization
```

Um novo dialeto de modelo frequentemente exige casos especiais em vários lugares.

### O reconhecimento de dialeto OpenAI-compatible depende de nome

Hoje a inferência usa kind, providerId, modelId e levels; a URL não participa. O nome cobre os modelos oficiais conhecidos, mas não consegue expressar de forma confiável gateways privados, serviços de proxy ou «mesmo modelId, implementação compatível diferente».

### App e CLI expressam a configuração de formas diferentes

O App guarda apenas variants; o Standalone CLI pode guardar o `providerOptionsByLevel` completo. E a config embutida em memória pode carregar patch de transport. As três origens precisam de múltiplas complementações e conversões antes de entrar no mesmo Runtime.

### O Runtime guarda a escolha e o resultado expandido

`modelRef.variant` é a escolha lógica e `modelProviderOptions` é o resultado expandido. Os dois podem ser atualizados por entradas diferentes, e por isso o código precisa de muita sincronização, recuperação e correspondência inversa.

### Tarefas auxiliares modificam parâmetros arbitrários diretamente

Title、Git、Compact e Memory removem ou escrevem campos do Provider conforme sua necessidade. Cada ponto de chamada precisa conhecer as diferenças entre fornecedores, e a responsabilidade do Adapter vazou para o Core.

## Restrições ao design de Model e ModelRequest

A semântica das Options públicas ficou mais precisa：`reasoningLevel` é a intensidade de raciocínio esperada pelo usuário e é uma restrição suave; `maxOutputTokens` é o teto total de tokens de geração compartilhado entre o reasoning e a resposta final e é uma restrição rígida. O Model valida os dois separadamente, não entende thinking budget e não assume a validação de combinações específicas de Provider.

A primeira fase mantém o comportamento atual dos Adapter. Mesmo que a recomendação oficial de parte dos novos modelos da Anthropic já tenha virado adaptive thinking, desde que a requisição fixed budget atual ainda funcione, esta rodada não muda o reconhecimento de modelo, o mapeamento de níveis nem a wire request. O fixed thinking existente continua usando `min(levelBudget, maxOutputTokens - 1)` para garantir o orçamento total. O tópico futuro de Adapter avalia a migração para effort／adaptive nativos e ajusta os dialetos que ainda precisam de fixed budget para `min(levelDefaultBudget, floor(maxOutputTokens * 3 / 4))`, reservando espaço estável para a resposta final.

Esta pesquisa sustenta a seguinte cadeia alvo:

```text
Model
├─ Option Specs 中的 reasoning levels / default
├─ 当前 Model Options
└─ Adapter 内部的 reasoning 方言实现
                |
                | bind({ reasoningLevel })
                |
                v
派生 Model
├─ options.reasoningLevel
├─ properties / optionSpecs
├─ generateText()
└─ streamText()
                |
                v
Adapter 私有序列化
```

A fronteira alvo precisa satisfazer:

- UI、Session、Submission、Automation e Subagent guardam o nível lógico e não guardam parâmetros do fornecedor.
- O Model derivado fixa provider, model e reasoning level; durante a execução contínua não se relêem opções mutáveis do Runtime.
- O caminho do Adapter é dono do dialeto de reasoning. As diferenças do OpenAI-compatible não podem continuar vazando para o Core.
- `providerOptionsByLevel` é lido por uma fronteira de compatibilidade durante a migração e depois encapsulado no Model／Adapter, sem ser mais exposto ao ModelRequest.
- Tarefas que de fato mudam o reasoning, como Title e Git, expressam níveis genéricos por `bind()` ou Request Options, sem modificar mais o objeto de parâmetros do fornecedor.
- Compact reutiliza o Model atual quando só muda mensagens e orçamento.
- Usage、Trace e o histórico de mensagens registram provider／model／reasoning a partir do Model que efetivamente fez a requisição.
- Header final em produção, refresh de Token, roteamento, retry e serialização de campos continuam dentro do Adapter.

A escolha entre «tipos de Adapter mais finos» e «um Adapter com uma estratégia de reasoning fortemente tipada» ainda precisa ser decidida no design futuro do Adapter. Seja qual for o nome final do campo, ele precisa se tornar um fato explícito no caminho Provider／Adapter, capaz de distinguir o mesmo modelId conectado a diferentes serviços compatíveis.

## Testes que precisam ser travados antes da implementação

A migração não pode validar apenas o `providerOptions` intermediário. É preciso manter pelo menos três camadas de teste:

```text
配置/Definition 测试
└─ levels、默认值和方言声明正确

Model 测试
└─ Options 被校验并固定，Core 看不到任意 providerOptions

Wire 测试
└─ 捕获真实 SDK 请求 body，验证最终字段
```

Os wire tests existentes já cobrem OpenAI Responses `none`、Anthropic effort、Anthropic thinking budget、OpenAI-compatible `reasoning_effort`、`enable_thinking`、`thinking.type` e a expansão de `extra_body` legado. Eles devem se tornar a linha de base comportamental da migração.

## Principais evidências de código

- Tipos de capacidade：`apps/zcode-cli/packages/contracts/src/model/catalog.ts`
- Tipos de provider／config do App：`packages/shared/src/model-provider-types.ts`
- Leitura e escrita da config do App：`packages/services/src/model-provider/modelProviderServiceStorage.ts`
- Projeção de patch de reasoning do App para o protocolo：`packages/shared/src/zcode-protocol/index.ts`
- Mapeamento de Provider dinâmico do App：`apps/zcode-cli/packages/bootstrap/src/zcode-protocol/workspace-model-catalog.ts`
- Regras estáticas de defaults da CLI：`apps/zcode-cli/packages/adapters/src/model/default-policy.ts`
- Vários mapas embutidos：`apps/zcode-cli/packages/adapters/src/model/reasoning-policy.ts`
- Normalização da config do Standalone CLI：`apps/zcode-cli/packages/adapters/src/config/schema.ts`
- Resolução de level e dedução inversa de telemetria：`apps/zcode-cli/packages/adapters/src/model/runtime-thought-level.ts`
- Merge das options de Runtime e migração de config antiga：`apps/zcode-cli/packages/bootstrap/src/runtime-model-metadata.ts`
- Troca de nível da Session：`apps/zcode-cli/packages/bootstrap/src/app/session-facade.ts`
- Ponto de uso do Model Step：`apps/zcode-cli/packages/core/src/runtime/methods/turn-model-step.ts`
- Normalização final do Adapter：`apps/zcode-cli/packages/adapters/src/model/runner-options.ts`
- Wire tests do OpenAI-compatible：`apps/zcode-cli/packages/adapters/tests/openai-compatible-extra-body-wire.test.ts`
- Wire tests da Anthropic：`apps/zcode-cli/packages/adapters/tests/anthropic-effort-wire.test.ts`
- Wire tests de disabled：`apps/zcode-cli/packages/adapters/tests/reasoning-disabled-wire.test.ts`
- Políticas de chamadas especiais：`apps/zcode-cli/packages/core/src/runtime/methods/title-provider-options.ts`、`compact-active.ts`、`workspace-generate-text.ts` e `project-memory-recall.ts`
- Requisições diretas do Repo Wiki：`packages/services/src/repo-wiki/repoWikiModelClient.ts` e `repoWikiProviderRegistryModelConfig.ts`
- Seleção de nível e despacho de tarefas do Bot：`packages/services/src/bots/botsService.ts`