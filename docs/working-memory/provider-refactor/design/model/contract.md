# Contrato público de Model

Este documento apresenta os tipos de Model visíveis aos chamadores de negócio. Como a configuração de Provider é formada e como o Model é criado estão, respectivamente, em [`../registry/configuration.md`](../registry/configuration.md) e [`../registry/model-creation.md`](../registry/model-creation.md).

## Relação entre tipos

```text
Model
├─ identity
│  ├─ providerId
│  └─ modelId
├─ properties
├─ optionSpecs
├─ options
├─ bind()
├─ generateText()
└─ streamText()
       |
       v
ModelRequest
├─ messages
├─ tools
├─ responseJsonSchema
├─ options
└─ abortSignal
```

Quatro tipos de dados carregam responsabilidades diferentes:

| Dado             | Significado                                                     | O Request pode modificar |
| ---------------- | --------------------------------------------------------------- | ------------------------ |
| Properties       | propriedades já determinadas do modelo atual                    | não                       |
| Option Specs     | valores opcionais, ordem, limite superior e mapeamento de requisição de uma Option genérica | não                       |
| Model Options    | Option à qual o Model atual está vinculado                      | deriva um novo Model via `bind()` |
| Request Options  | sobrescrita de Option de uma chamada única                      | sim, afeta só esta chamada |

## Properties

```ts
interface ModelProperties {
  contextWindow: number;
  input_format: {
    support_text: boolean;
    support_image: boolean;
    support_video: boolean;
    support_audio: boolean;
    support_pdf: boolean;
  };
  output_format: {
    support_text: boolean;
  };
  supportsToolCall: boolean;
  supportsJsonSchemaOutput: boolean;
  supportsNativeWebSearch: boolean;
  supportsMidConversationSystem: boolean;
}
```

As Properties servem ao chamador para escolher a estratégia da requisição e ao Model para verificar, antes de enviar a requisição, se ela é compatível com o modelo.

| Property                        | Onde é usada                                          |
| ------------------------------- | ----------------------------------------------------- |
| `contextWindow`                 | orçamento de Context e decisão de Compact             |
| `input_format`                  | verificação dos formatos de entrada Text, Image, Video, Audio, PDF |
| `output_format`                 | verificação do formato de saída Text atual            |
| `supportsToolCall`              | verificação de requisição de Tool do Agent           |
| `supportsJsonSchemaOutput`      | verificação de requisição de JSON Schema              |
| `supportsNativeWebSearch`       | decide se a capacidade nativa de busca do Provider será usada |
| `supportsMidConversationSystem` | decide a estratégia de conversão das mensagens do Provider no histórico |

`supportsNativeWebSearch` e `supportsMidConversationSystem` são os fatos finais de capacidade do Effective Model Config e são fixados na etapa de criação do Model. As Model Config Rules que os produzem podem combinar correspondências conforme o contexto de resolução — modelo, Provider, tipo de API — e não exigem que a capacidade seja determinada apenas pelo modelId. O Core lê apenas a conclusão já fixada e não infere mais nada temporariamente pelo tipo de Provider, URL ou modelId.

## Option Specs

Options públicas usam campos fixos. Cada modelo descreve, por meio das Option Specs, a faixa válida, a ordem semântica, o limite superior rígido e o mapeamento de requisição; o Option Spec não possui valor padrão de execução:

```ts
interface EnumOptionSpec {
  type: "enum";
  // Do mais baixo ao mais alto em força semântica; values[0] é a PUBLICADA mais baixa.
  values: readonly string[];
  map: string;
}

interface LimitOptionSpec {
  type: "limit";
  max: number;
  map: string;
}

interface ModelOptionSpecs {
  reasoningLevel: EnumOptionSpec;
  maxOutputTokens: LimitOptionSpec;
}

interface ModelOptions {
  reasoningLevel?: string;
  maxOutputTokens?: number;
}
```

`reasoningLevel` é a intensidade de raciocínio esperada pelo usuário. É uma restrição suave: o Adapter a expressa, sempre que possível, como effort, level, toggle ou budget compatível do protocolo de destino.
`reasoningLevel.values` é ordenado da intensidade de raciocínio mais baixa para a mais alta; `values[0]` é o nível publicado mais baixo do modelo, mas não é necessariamente o mesmo que desligado.
Quando a seleção padrão de modelo realmente precisa de um padrão, o valor `values.at(-1)` é escolhido na fronteira de Host Selection; requisições auxiliares que adotam explicitamente uma estratégia de baixo custo escolhem
`values[0]`. Não é permitido varrer nomes como `off`, `nothink`, `none` para adivinhar a capacidade de desligamento.

`maxOutputTokens` é o limite superior rígido total de Tokens gerados, compartilhado entre raciocínio e resposta final. O Model valida se o valor da chamada não excede o `LimitOptionSpec.max` correspondente e não trunca silenciosamente no lugar do chamador.

Os campos de Option são um conjunto fechado. O Provider não pode adicionar parâmetros arbitrários do tipo `Record<string, unknown>` pela interface pública. Uma nova Option genérica precisa ter sua semântica entre Providers definida antes de entrar em `ModelOptionSpecs`, `ModelOptions` e no Adapter.

## Resolução de Option

```text
Options concretos vinculados ao Model
        |
        | ModelRequest.options sobrescreve
        v
Effective Options do Request
```

O valor explícito do Request sobrescreve o valor vinculado ao Model. `ModelOptions` é um Overlay esparso das etapas de vinculação/requisição, mas antes de entrar no Executor é preciso que existam simultaneamente um `reasoningLevel` e um `maxOutputTokens` válidos. Valor ausente falha antes do I/O de rede; Model, Adapter e Runner não adivinham valores de execução a partir do Option Spec. A seleção inicial padrão completa `values.at(-1)` apenas uma vez, na fronteira de Host Selection; chamadas auxiliares vinculam explicitamente
`values[0]`.

```ts
const model = baseModel.bind({
  reasoningLevel: "high",
  maxOutputTokens: 32_000,
});

await model.generateText({
  messages,
  options: {
    maxOutputTokens: 8_000,
  },
});
```

No exemplo acima a requisição usa `reasoningLevel = high` e `maxOutputTokens = 8_000`, sem modificar `model.options`.

## ModelRequest

```ts
interface ModelRequest {
  messages: ModelMessage[];
  tools?: ModelTool[];
  responseJsonSchema?: JsonSchema;
  options?: ModelOptions;
  abortSignal?: AbortSignal;
}
```

ModelRequest descreve uma chamada ao modelo. A identidade do modelo, a API Key, o Request Auth, o Endpoint, o tipo de Provider e os parâmetros exclusivos de Provider já são determinados pela implementação de execução do Model e por suas dependências, e não aparecem no Request. O material de acesso dinâmico de `zhipu-account` é resolvido pelo Account Request Auth Service em cada request attempt, sem alterar o Schema público do ModelRequest.

## Verificação da requisição

O Model executa verificações uniformes antes de chamar o Adapter:

| Conteúdo do Request     | Base da verificação                       |
| ----------------------- | ----------------------------------------- |
| mensagem de imagem      | `properties.input_format.support_image`   |
| mensagem de PDF         | `properties.input_format.support_pdf`     |
| mensagem de vídeo       | `properties.input_format.support_video`   |
| `tools`                 | `properties.supportsToolCall`             |
| `responseJsonSchema`    | `properties.supportsJsonSchemaOutput`     |
| `reasoningLevel`        | `optionSpecs.reasoningLevel.values`       |
| `maxOutputTokens`       | `optionSpecs.maxOutputTokens.max`         |

Uma requisição que excede o Option Spec retorna um erro explícito. O Model também retorna um erro explícito quando o Request usa uma entrada ou capacidade que o modelo declara claramente não suportar. Esta camada é um double check uniforme antes do envio; o chamador ainda pode ler a Property mais cedo para escolher sua própria estratégia.

O ModelConfig publicado pelo Registry de destino precisa ter Properties completas, portanto não existe `unknown` no desenho de destino.
A estrutura completa dos formatos de entrada e saída, o Overlay de Rules e a fronteira de migração estão em
[`input-output-format.md`](./input-output-format.md).

## Fronteira do Adapter

```text
ModelRequest
      |
      | resolve options + validate
      v
requisição neutra de provider
      |
      | serialização por AI SDK / Adapter
      v
corpo de Request JSON bruto da API de destino
      |
      | map por option (reasoningLevel depois maxOutputTokens)
      v
request final do Provider
├─ Option JSON Merge Patch
├─ Token / Header dinâmicos
├─ roteamento e retry
└─ normalização de erros
```

A camada pública de Model entende `reasoningLevel` e `maxOutputTokens` separadamente, não entende thinking budget e não acrescenta restrições combinadas exclusivas de Provider. O `map` de cada Option Spec é a única autoridade de configuração do campo final da requisição; o Runtime não transmite mais em paralelo o namespace de reasoning do AI SDK, o campo padrão de max-output ou a conversão de orçamento de fixed-thinking. O contrato completo está em
[`model-option-map.md`](./model-option-map.md).

## Result, Event e atribuição

`ModelResult` e `ModelEvent` usam os tipos de resultado unificados já estabelecidos em M1: o primeiro expressa a mensagem final, o usage e o motivo de encerramento; o segundo expressa deltas de streaming, tool call, usage e o evento de encerramento. Os objetos brutos do SDK do Provider permanecem dentro do Adapter e não formam mais tipos de resultado paralelos para chamadores diferentes.

Usage, Trace, Model IO, cost, quota e atribuição de erros leem a identidade do Model que iniciou a requisição e as Effective Options desta execução; não leem a Composer Selection, nem a Session Selection que possa ter mudado depois, e não dependem do campo model, opcional, da resposta do Provider.