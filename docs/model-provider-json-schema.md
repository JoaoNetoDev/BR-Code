# JSON Schema de Model Provider

> Documento histórico: a próxima fase não usa mais o catalog schema `zcode.model-providers.v1`, nem usa mais
> o patch `reasoning.levels[level][kind]` como formato principal de nova configuração. O novo design autoritativo está em
> `docs/model-provider-opencode-config.md`.

## Objetivo

Este JSON serve para descrever as informações de conexão de um fornecedor de modelo, o formato de interface, as capacidades do modelo e o mapeamento de parâmetros de pensamento.
Ele deve se adequar aos conceitos do runtime ZCode atual, em vez de inventar mais uma nomenclatura de protocolo.

Restrições centrais:

- O formato de interface usa uniformemente o `kind` existente: `anthropic`, `openai`, `openai-compatible`.
- No JSON escreve-se apenas `openai-compatible`; `openaiCompatible` não deve aparecer.
- `endpoints` usa um `baseURL` comum e cada `kind` configura apenas o seu próprio `path` de URL.
- `reasoning` não guarda campos de UI, como `label`, `rank` ou `enabled`.
- `reasoning` só descreve "como um determinado level deve alterar os parâmetros da requisição em um determinado kind".

## Estrutura de topo

```jsonc
{
  "schemaVersion": "zcode.model-providers.v1",
  "providers": [
    {
      "id": "example",
      "name": "Example",
      "endpoints": {
        "baseURL": "https://api.example.com",
        "paths": {
          "anthropic": "/anthropic/v1/messages",
          "openai-compatible": "/v1/chat/completions",
          "openai": "/v1/responses"
        }
      },
      "defaultKind": "openai-compatible",
      "models": []
    }
  ]
}
```

A key de `endpoints.paths` precisa ser o literal de `kind`. Assim a configuração nunca tem ao mesmo tempo
as duas grafias `openaiCompatible` e `openai-compatible`.

`baseURL + path` representa o endereço completo da requisição daquele kind. Por exemplo:

```text
https://api.example.com + /v1/chat/completions
```

Se um fornecedor usa hosts diferentes até para kinds diferentes, a v1 recomenda dividir em dois providers, em vez de fazer
override de `baseURL` por kind dentro de um único provider.

## Estrutura de Model

```jsonc
{
  "id": "example-reasoner",
  "name": "Example Reasoner",
  "kinds": ["anthropic", "openai-compatible"],
  "defaultKind": "anthropic",
  "modalities": {
    "input": ["text", "image", "video", "audio"],
    "output": ["text"]
  },
  "contextWindow": 200000,
  "maxOutputTokens": 64000,
  "reasoning": {}
}
```

Descrição dos campos:

- `id`: nome do modelo enviado por padrão ao upstream.
- `kinds`: os formatos de interface suportados pelo modelo; os valores precisam existir em `provider.endpoints.paths`.
- `defaultKind`: o formato usado por padrão por esse modelo; quando ausente, vale o `defaultKind` do provider.
- `modalities.input` / `modalities.output`: as modalidades de entrada e de saída do modelo.
- `contextWindow`: o tamanho do contexto, em token.
- `maxOutputTokens`: o tamanho máximo de saída, em token. Ele representa o limite de capacidade do modelo e também é o orçamento
  de saída em nível de modelo das requisições normais; só quando esse valor está ausente é que há fallback para 32K, e então o AI SDK
  mapeia para o campo de saída padrão do protocolo correspondente. A política do lado da requisição está em
  [política de limite de tokens de saída da requisição ao modelo](./model-request-output-tokens.md).
- `options`: os parâmetros canônicos de requisição do AI SDK repassados ao provider concreto. Um provider OpenAI-compatible
  que precisa fixar campos estendidos como `max_tokens` ou `max_completion_tokens` configura diretamente, por exemplo
  `{ "max_tokens": 64000 }`.

Não escreva `supportsImages` / `supportsVideo` à parte. Essas capacidades são derivadas de `modalities`:

```ts
const supportsImages = model.modalities.input.includes("image");
const supportsVideo = model.modalities.input.includes("video");
```

Se o mesmo modelo precisa obrigatoriamente usar nomes de modelo upstream diferentes conforme o kind, acrescente o campo
opcional `modelIdByKind`:

```jsonc
{
  "id": "claude-sonnet",
  "modelIdByKind": {
    "anthropic": "claude-sonnet-4-5-20250929",
    "openai-compatible": "anthropic/claude-sonnet-4.5"
  }
}
```

Por padrão esse campo não é necessário. Quando não há casamento em `modelIdByKind[kind]`, use `id` diretamente.

## Estrutura de Reasoning

`reasoning` é uma tabela de patches de parâmetros de requisição agrupada por level e por kind.

```jsonc
{
  "reasoning": {
    "defaultLevel": "medium",
    "levels": {
      "off": {
        "anthropic": {
          "set": [
            {
              "path": ["thinking"],
              "value": { "type": "disabled" }
            }
          ]
        },
        "openai-compatible": {
          "set": [
            {
              "path": ["thinking", "type"],
              "value": "disabled"
            }
          ]
        },
        "openai": {
          "set": [
            {
              "path": ["reasoningEffort"],
              "value": "none"
            }
          ]
        }
      },
      "medium": {
        "anthropic": {
          "set": [
            {
              "path": ["thinking"],
              "value": {
                "type": "enabled",
                "budgetTokens": 8000
              }
            }
          ]
        },
        "openai-compatible": {
          "set": [
            {
              "path": ["reasoningEffort"],
              "value": "medium"
            }
          ]
        },
        "openai": {
          "set": [
            {
              "path": ["reasoningEffort"],
              "value": "medium"
            }
          ]
        }
      }
    }
  }
}
```

Aqui `path` é um "caminho de campo", e não um path de URL. É um array de strings que indica a posição do parâmetro de requisição
a definir ou remover. Por exemplo:

```jsonc
["thinking"]
["reasoningEffort"]
["thinking", "type"]
```

Em tempo de execução, o patch correspondente ao `kind` realmente usado pelo modelo atual é buscado e então são geradas as
provider options exigidas pelo adapter atual.

O JSON público não escreve `openaiCompatible`. Se o kind atual for `openai-compatible`, a camada de conversão cuida de
mapeá-lo para o namespace interno do AI SDK:

```ts
{
  "openai-compatible": {
    set: [{ path: ["reasoningEffort"], value: "medium" }]
  }
}

// 转换后进入现有 adapter providerOptions：
{
  openaiCompatible: {
    reasoningEffort: "medium"
  }
}
```

## Desligar o raciocínio

Desligar o raciocínio também é apenas um level comum, usando uniformemente o level id interno `off`.

Se `levels.off` existe, significa que o modelo suporta desligar o raciocínio; se não existe, significa que esse modelo não
consegue desligar o raciocínio explicitamente.

Cada fornecedor desliga de um jeito:

```jsonc
{
  "off": {
    "anthropic": {
      "set": [
        {
          "path": ["thinking"],
          "value": { "type": "disabled" }
        }
      ]
    },
    "openai": {
      "set": [
        {
          "path": ["reasoningEffort"],
          "value": "none"
        }
      ]
    },
    "openai-compatible": {
      "unset": [
        {
          "path": ["reasoningEffort"]
        }
      ]
    }
  }
}
```

Algumas interfaces desligam o raciocínio "não passando o campo", e nesse caso use `unset`. Outras exigem passar
`disabled` / `none` / `false`, e nesse caso use `set`.

## Rascunho em TypeScript

```ts
type ModelProviderKind = "anthropic" | "openai" | "openai-compatible";
type Modality = "text" | "image" | "video" | "audio";

interface ProviderCatalogFile {
  schemaVersion: "zcode.model-providers.v1";
  providers: ProviderSpec[];
}

interface ProviderSpec {
  id: string;
  name: string;
  endpoints: ProviderEndpoints;
  defaultKind?: ModelProviderKind;
  models: ModelSpec[];
}

interface ProviderEndpoints {
  baseURL: string;
  paths: Partial<Record<ModelProviderKind, string>>;
}

interface ModelSpec {
  id: string;
  name?: string;
  kinds: ModelProviderKind[];
  defaultKind?: ModelProviderKind;
  modelIdByKind?: Partial<Record<ModelProviderKind, string>>;
  modalities: {
    input: Modality[];
    output: Modality[];
  };
  contextWindow: number;
  maxOutputTokens?: number;
  reasoning?: ReasoningSpec;
}

interface ReasoningSpec {
  defaultLevel?: string;
  levels: Record<string, ReasoningLevelPatchByKind>;
}

type ReasoningLevelPatchByKind = Partial<
  Record<ModelProviderKind, ProviderOptionsPatch>
>;

interface ProviderOptionsPatch {
  set?: FieldSetPatch[];
  unset?: FieldUnsetPatch[];
}

interface FieldSetPatch {
  path: string[];
  value: unknown;
}

interface FieldUnsetPatch {
  path: string[];
}
```

## Exemplo completo

```jsonc
{
  "schemaVersion": "zcode.model-providers.v1",
  "providers": [
    {
      "id": "zai",
      "name": "Z.AI",
      "endpoints": {
        "baseURL": "https://api.z.ai",
        "paths": {
          "anthropic": "/api/anthropic/v1/messages",
          "openai-compatible": "/api/coding/v1/chat/completions"
        }
      },
      "defaultKind": "openai-compatible",
      "models": [
        {
          "id": "glm-5.2",
          "name": "GLM-5.2",
          "kinds": ["anthropic", "openai-compatible"],
          "defaultKind": "openai-compatible",
          "modalities": {
            "input": ["text", "image"],
            "output": ["text"]
          },
          "contextWindow": 1000000,
          "maxOutputTokens": 128000,
          "reasoning": {
            "defaultLevel": "max",
            "levels": {
              "off": {
                "anthropic": {
                  "set": [
                    {
                      "path": ["thinking"],
                      "value": { "type": "disabled" }
                    }
                  ]
                },
                "openai-compatible": {
                  "set": [
                    {
                      "path": ["reasoningEffort"],
                      "value": "none"
                    }
                  ]
                }
              },
              "high": {
                "anthropic": {
                  "set": [
                    {
                      "path": ["thinking"],
                      "value": {
                        "type": "enabled",
                        "budgetTokens": 16000
                      }
                    }
                  ]
                },
                "openai-compatible": {
                  "set": [
                    {
                      "path": ["reasoningEffort"],
                      "value": "high"
                    }
                  ]
                }
              },
              "max": {
                "anthropic": {
                  "set": [
                    {
                      "path": ["thinking"],
                      "value": {
                        "type": "enabled",
                        "budgetTokens": 32000
                      }
                    }
                  ]
                },
                "openai-compatible": {
                  "set": [
                    {
                      "path": ["reasoningEffort"],
                      "value": "max"
                    }
                  ]
                }
              }
            }
          }
        }
      ]
    }
  ]
}
```

## Mapeamento com o código existente

- A key de `ProviderSpec.endpoints.paths` corresponde ao `ModelProviderKind` do runtime atual.
- `ProviderSpec.defaultKind` e `ModelSpec.defaultKind` determinam o valor final passado para
  `ModelTargetConfig.kind`.
- `ProviderSpec.endpoints.baseURL` entra em `ModelTargetConfig.baseURL`.
- `ModelSpec.contextWindow`, `maxOutputTokens` e `modalities` são projetados para
  `ModelCapability`.
- `ReasoningSpec.levels` só é usado para projetar os valores de nível de reasoning e o nível padrão; o app não converte mais
  `ReasoningSpec.levels[level][kind]` em
  `ModelReasoningCapability.providerOptionsByLevel[level]`.
- O mapeamento dos níveis de intensidade de raciocínio para os campos de requisição do fornecedor é mantido pelo zcode-cli; o lado do app não mantém mais a
  conversão de namespace de provider options `anthropic` / `openai` / `openaiCompatible`.

## Streaming Usage no OpenAI Compatible

Um provider com `kind: "openai-compatible"` pede por padrão o uso de tokens em streaming. O adapter define `includeUsage: true` ao criar
o provider do SDK OpenAI Compatible, e é o SDK que gera isso apenas em requisições de Chat Completions em streaming:

```jsonc
{
  "stream": true,
  "stream_options": { "include_usage": true }
}
```

Os poucos serviços compatíveis que não aceitam `stream_options` podem desligar isso explicitamente na configuração de conexão do provider:

```jsonc
{
  "provider": {
    "legacy-compatible": {
      "kind": "openai-compatible",
      "options": {
        "baseURL": "https://api.example.test/v1",
        "includeUsage": false
      }
    }
  }
}
```

Não configurado e explicitamente `true` significam ligado; somente `false` explícito desliga. Essa configuração faz parte das opções de conexão do SDK do
provider, não entra nos `providerOptions` de nível de modelo e não altera requisições não-streaming, nem requisições OpenAI Responses ou
Anthropic.