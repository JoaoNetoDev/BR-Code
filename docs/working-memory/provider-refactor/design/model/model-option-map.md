# Mapa de Opções de Modelo e corpo bruto da requisição

> Status: design vigente
>
> Atualizado recentemente: 2026-09-02

## Objetivo

`reasoningLevel` e `maxOutputTokens` são as Opções de Modelo públicas do ZCode. Cada Especificação de
Opção declara simultaneamente o domínio de valores e seu mapeamento para o corpo JSON bruto da requisição
da API de destino:

```ts
interface EnumOptionSpec {
  type: "enum";
  /** 按语义强度从低到高，values[0] 是最低公开档位。 */
  values: readonly string[];
  map: string;
}

interface LimitOptionSpec {
  type: "limit";
  max: number;
  map: string;
}
```

`map` é uma expressão CEL restrita. A única variável que ela pode ler tem o mesmo nome da Opção à qual
pertence: `reasoningLevel.map` lê `reasoningLevel`, `maxOutputTokens.map` lê `maxOutputTokens`. A
expressão retorna um Objeto JSON Merge Patch (RFC 7396). Config, Registry, Active Model e Runtime
compartilham o mesmo nome de campo e o mesmo fato, sem que se estabeleça `reasoningMapping`, um mapeamento
de `providerOptions` do AI SDK ou um DTO de compatibilidade de orçamento de saída.

## Cadeia de execução única

```text
Effective Model Config
        |
        | 完整 optionSpecs
        v
ModelFactory 创建 Active Model
        |
        | 编译每个 map 一次
        v
Model.bind / ModelRequest options
        |
        | bound < request；进入 Executor 前必须完整
        v
Effective Request Option values
        |
        | reasoningLevel，随后 maxOutputTokens
        v
有序 JSON Merge Patches
        |
        v
AI SDK 已完成协议序列化和 Schema 兼容的原始 JSON Body
        |
        | 应用 Patch，并记录 Model IO
        v
业务 Header / 动态鉴权 / 请求安全校验 / 网络发送
```

O Map deve ser aplicado depois que o AI SDK e a camada de compatibilidade de protocolo já tiverem formado o
corpo JSON final, e antes da validação dinâmica de segurança da requisição. `generateText()` e
`streamText()` compartilham o mesmo executor; o Model IO captura o corpo de requisição realmente enviado
após o Patch. O Runtime não passa mais simultaneamente o `maxOutputTokens` padrão do AI SDK nem o namespace
de reasoning, o que formaria uma segunda autoridade sobre os campos da requisição.

## CEL restrito

A única implementação está no pacote TypeScript puro `@zcode/model-option-map`, usado tanto pela validação
de Config de Provider quanto pelo CLI Adapter. A implementação é fixa em tokenizer, parser e avaliador
de AST; são proibidos `eval`, `Function` ou execução dinâmica de código.

Suporta:

```text
所属 Option 的同名变量（`reasoningLevel` 或 `maxOutputTokens`）
string / number / boolean / null
object / array literal
== != < <= > >=
+ - * / %
&& || !
condition ? whenTrue : whenFalse
括号
```

Cada Map expõe apenas a variável de mesmo nome à qual pertence; a antiga variável genérica `value` não é
suportada. Não há suporte a funções, métodos, acesso a membros, macros, comprehension, outras Opções,
objetos de Provider/Model/credenciais, tempo, números aleatórios nem qualquer IO. Valores numéricos usam
uniformemente o `number` do JavaScript, e aritmética, comparação, divisão e módulo seguem a semântica
numérica do JavaScript; esta expressão restrita não implementa a distinção de tipos `int`/`double` do CEL
nem divisão inteira. Entradas numéricas e resultados de cálculo devem poder ser representados com segurança como
`number` JSON finito; o Map deve retornar ao final um Objeto JSON.

## Overlay e integridade

Tanto `optionSpecs.reasoningLevel` quanto `optionSpecs.maxOutputTokens` na Entrada da Regra são Overlays
esparsos e aninháveis; `type`, domínio de valores, max e map podem ser herdados, sobrescritos ou limpos
independentemente com `null`. O Effective Model Config deve obter uma Especificação de Opção completa:

- `maxOutputTokens` deve ter `type/max/map` válidos;
- `reasoningLevel` deve ter `type/values/map` válidos;
- `reasoningLevel.values` deve ser não vazio, sem itens em branco, sem duplicatas e ordenado por
  intensidade semântica da mais baixa para a mais alta; o cliente não infere semântica pelo nome;
- todos os maps devem poder ser compilados pelo mesmo compilador CEL restrito e retornar um Patch de
  Objeto;
- não se faz leitura incompatível do `reasoningMapping` não publicado, nem se estabelece dual-read ou
  importer.

A página de configurações edita o Reasoning Map em uma caixa de texto técnica de altura fixa. O Personal Map
é o valor de entrada e o Inherited Map é o placeholder; limpar a entrada significa remover a folha Personal
`map` e restaurar a herança. O Renderer continua mantendo apenas a Personal Model Rule esparsa e não pode
expandir valores Inherited de volta em sobreposições Personal. O Max Output Map ainda não é editável e deve
ser preservado exatamente como está ao salvar outros campos.

## Ordem dos Patches e conflitos

Para a mesma requisição, a execução segue uma ordem fixa:

```text
reasoningLevel.map
        |
        v
maxOutputTokens.map
```

Os dois Maps podem escrever folhas diferentes sob o mesmo objeto, por exemplo `reasoning.effort` e
`reasoning.max_tokens`. Se escreverem no mesmo caminho, ou se um escrever um caminho pai e o outro um
caminho filho, a requisição falha explicitamente antes da rede; não se pode depender da ordem de
sobrescrita para decidir o resultado silenciosamente. Em RFC 7396, `null` significa remover o campo, e
arrays assim como outros valores não-Objeto são substituídos inteiramente em seu caminho.

## Schemas típicos

```text
Anthropic Messages
├─ reasoningLevel -> thinking.type 或 output_config.effort
└─ maxOutputTokens -> max_tokens

OpenAI Chat Completions
├─ reasoningLevel -> reasoning_effort（或经证据确认的兼容字段）
└─ maxOutputTokens -> max_completion_tokens / max_tokens

OpenAI Responses
├─ reasoningLevel -> reasoning.effort
└─ maxOutputTokens -> max_output_tokens
```

A representação concreta pertence apenas à Model Config Rule cujo `providerId/modelId/api.type/baseURL`
corresponde. Runtime e Adapter proibem reinferir esses campos a partir do ID do modelo, do ID do provider ou
do tipo de API.

## Fallback interno e regras dedicadas (Todo 95)

A escrita e a formatação das expressões seguem uniformemente o
[Estilo de Escrita do Option Map](option-map-writing-style.md): expansão de objetos, indentação de dois
espaços e ternário simples em linha única. O estilo de escrita é mantido separado das seguintes restrições
de mudança/compatibilidade.

- A organização dos Maps dedicados só permite a equivalência de requisições com entrada válida: effort de
  mesmo nome é repassado diretamente, condições descem para o campo que varia; a ramificação de objeto só
  é mantida quando a existência do campo difere. Não se pode substituir `null` por omissão, nem alterar
  modo, orçamento ou domínio de valores.
- Reforço do fallback de Schema da API: Chat Completions emite simultaneamente `thinking.type`,
  `enable_thinking`, `reasoning_effort` e `reasoning.effort`, e desligar `disabled/none` é unificado como
  interruptor desligado mais effort `none`; Responses usa apenas `reasoning.effort`; Messages usa
  `disabled` ou Adaptive + o effort original, sem adicionar modo de orçamento manual.
- O fallback de Chat misto depende de hipóteses já aceitas pelo usuário: campos desconhecidos são ignorados,
  controles duplicados consistentes podem coexistir, e em modo desligado um effort extra pode ser ignorado
  ou ter `none` permitido. Não é uma garantia verificada para todos os sites; incompatibilidades reportam
  erro normalmente, sem apagar campos e tentar de novo.
- Os values genéricos continuam tendo apenas `disabled`; uma nova 档位 só pode ser usada depois de se
  tornar uma 档位 legal. Regras dedicadas e Personal Map continuam sobrescrevendo o fallback pela ordem de
  Overlay existente. Reasoning Map não escreve limite superior de saída.
- A renomeação da 档位 não nativa de desligamento é uma mudança de compatibilidade separada; sem verificação
  de segurança via cobertura apenas por Personal Map e pelo ponto de entrada de execução, não se troca
  `off/nothink` por `disabled`. A compatibilidade das escolhas antigas com origem restrita não substitui a
  proteção da semântica do Map do usuário.