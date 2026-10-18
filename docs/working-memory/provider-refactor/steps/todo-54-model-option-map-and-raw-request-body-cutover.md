# Todo 54: Model Option Map e consolidação do Request Body original

> Status: concluído
>
> Data: 2026-08-31
>
> Pré-requisito: o Todo 42 já fixou a ordem dos níveis de Reasoning e a semântica de nível mínimo das chamadas auxiliares; este Todo não altera essa decisão, apenas consolida a forma de mapear Option para o API Schema original.

## 1. Contexto

O Model Config atual já usa Options unificados para expressar dois parâmetros públicos de chamada:

```ts
interface ModelOptions {
  reasoningLevel?: string;
  maxOutputTokens?: number;
}
```

Mas a projeção delas para a requisição real ao Provider continua dividida:

```text
reasoningLevel
├─ optionSpecs.reasoningLevel 定义值域与默认值
├─ 独立 reasoningMapping 按档位保存 Provider 参数
└─ Adapter 再把参数包装为 AI SDK providerOptions namespace

maxOutputTokens
├─ optionSpecs.maxOutputTokens 定义 max/default
├─ Adapter 通过 AI SDK 标准 maxOutputTokens 发送
└─ Anthropic fixed thinking 另有“先减、后由 AI SDK 加回”的兼容换算
```

Isso faz a definição e o efeito de uma mesma Option ficarem espalhados por Config, ModelFactory, namespace do AI SDK e helpers do Adapter,
e obriga quem configura recursos avançados a entender protocolos intermediários ZCode/AI SDK como `providerOptions.anthropic`, `providerOptions.openai` e `extra_body`,
em vez de entender diretamente o Schema de destino Anthropic Messages, OpenAI Chat Completions ou OpenAI Responses.

Este Todo devolve a capacidade de mapeamento para cada Option Spec: cada Option conhece apenas o seu `value` final e usa uma única `map` em CEL restrito
para gerar um JSON Merge Patch (RFC 7396) voltado ao Request Body do API Schema original. Não se deve expandir isso para mapeamento agregado de Options,
Request Adapter genérico ou uma linguagem arbitrária de reescrita de requisição.

Antes de migrar oficialmente o Config das Options, é preciso primeiro implementar e verificar de forma independente o único módulo de compilação/execução de CEL restrito. A verificação de integridade do Config e a
execução da requisição no Adapter reutilizam o mesmo módulo; elas não podem analisar nem interpretar expressões separadamente.

## 2. Primeiros princípios

### 2.1 Option unificada do ZCode e campos da API original

| ZCode Option      | Anthropic Messages                               | OpenAI Chat Completions                                | OpenAI Responses    |
| ----------------- | ------------------------------------------------ | ------------------------------------------------------ | ------------------- |
| `reasoningLevel`  | `thinking.type`, e `thinking.budget_tokens` quando necessário | `reasoning_effort` ou o campo sinônimo do Schema compatível de destino | `reasoning.effort`  |
| `maxOutputTokens` | `max_tokens`                                     | `max_completion_tokens`; alguns protocolos compatíveis usam `max_tokens` | `max_output_tokens` |

O ZCode mantém a semântica unificada das Options públicas; os nomes de campo, a hierarquia de objetos e a expressão de liga/desliga são declarados pela Model Config Rule que casar com o `providerId/modelId/api.type` atual.
Runtime e Adapter deixam de codificar em hardcode o mesmo mapeamento conforme Model ID, Provider ID ou tipo de API específicos.

### 2.2 O usuário enfrenta o API Schema original, e não o protocolo do AI SDK

O Option Map nas configurações de Model é um item de configuração avançado. Quem usa pode entender que o Provider atual usa Anthropic Messages,
OpenAI Chat Completions ou OpenAI Responses e escrever diretamente os campos desses Schemas públicos; não é preciso entender:

- o namespace `providerOptions` do AI SDK;
- entradas de pass-through do SDK como `extra_body`;
- o `ReasoningParameters` interno do ZCode;
- helpers de subtração/adição de orçamento e limpeza de campos que o Adapter cria para compatibilidade com o SDK.

O resultado do Map no Config é a autoridade final dos campos do Request Body original. Como o AI SDK ou o Adapter geram o corpo base da requisição é implementação interna,
e não pode se tornar uma segunda semântica configurável.

## 3. Estrutura-alvo confirmada

### 3.1 Cada Option traz o seu próprio `map`

```ts
interface EnumOptionSpecConfigInput {
  type?: "enum" | null;
  values?: readonly string[] | null;
  default?: string | null;
  map?: string | null;
}

interface EnumOptionSpec {
  type: "enum";
  /** 按语义强度从低到高；values[0] 是最低公开档位。 */
  values: readonly string[];
  default: string;
  /** CEL：读取当前 Option 的 value，返回 JSON Merge Patch Object。 */
  map: string;
}

interface LimitOptionSpecConfigInput {
  type?: "limit" | null;
  max?: number | null;
  default?: number | null;
  map?: string | null;
}

interface LimitOptionSpec {
  type: "limit";
  max: number;
  default: number;
  /** CEL：读取当前 Option 的 value，返回 JSON Merge Patch Object。 */
  map: string;
}

interface ModelOptionSpecs {
  reasoningLevel?: EnumOptionSpec;
  maxOutputTokens: LimitOptionSpec;
}
```

As Config Rules usam Input aninhado, com Overlay esparso; o Effective Model Config e o Active Model usam a Option Spec completa.
`map` fica dentro da Option concreta, e o caminho completo já expressa a posse com precisão:

```text
optionSpecs.reasoningLevel.map
optionSpecs.maxOutputTokens.map
```

Não se adiciona nem se mantém mais nenhum dos conceitos paralelos abaixo:

- `reasoningMapping`;
- `optionMapping` agregado;
- `requestPatch` / `requestBodyPatch`;
- `requestAdapter` / `requestAdapterRule`;
- `requestBodyTransform`;
- `reasoningLevelPolicy`;
- qualquer DTO de capability/option de Runtime.

### 3.2 Entrada e saída do CEL

```text
当前 Option 的 Effective value
              |
              v
          Option.map
              |
              v
    JSON Merge Patch Object
              |
              v
目标 API Schema Request Body
```

Os limites da primeira versão ficam fixados:

- a única variável de entrada do CEL é o `value` da Option atual;
- o `value` de uma Enum Option é o nível de string final atual;
- o `value` de uma Limit Option é o valor numérico final atual;
- é possível usar expressões condicionais CEL e a aritmética necessária;
- além do `value` atual, os valores da expressão precisam ser literais;
- o valor de retorno é um JSON Object, aplicado com a semântica de JSON Merge Patch da RFC 7396;
- `null` usa a semântica de remoção de campo da RFC 7396; arrays, strings, números e booleanos substituem o valor inteiro no caminho correspondente;
- o Map atua apenas sobre o JSON Request Body e não trata Header, Query, Path, Endpoint, autenticação ou verificação de segurança da requisição.

Fica explicitamente não exposto ao CEL:

```text
其他 Option
context
messages / tools
Provider / Model 对象
apiKey / JWT / Request Auth
Environment / Runtime 状态
AI SDK 实例或 providerOptions
```

Se no futuro surgir um Provider oficial que de fato não possa ser expresso por um Option Map independente, é preciso redecidir com um API Schema e evidências de requisição reais;
não se cria neste Todo contexto entre Options, Adapter agregado ou grafo de dependências de expressões para necessidades hipotéticas.

### 3.3 Subconjunto CEL restrito

Neste ciclo não se introduz um Beta JavaScript CEL Runtime, nem se carrega uma implementação CEL completa por uma necessidade pequena. O repositório ganha um módulo independente e sem efeitos colaterais de
CEL restrito, implementado em três camadas: tokenizer, parser e AST evaluator; são proibidos `eval`, `Function` ou qualquer execução de código dinâmico.

A sintaxe suportada é estritamente limitada a:

```text
value
string / number / boolean / null literal
object / array literal
== / != / < / <= / > / >=
+ / - / * / / / %
&& / || / !
condition ? trueValue : falseValue
parênteses
```

Não é suportado:

```text
chamada de função, chamada de método, macro, comprehension
reflexão de membro, variável dinâmica, outras Options, Context
tempo, número aleatório, IO, objetos de Provider/Model/credencial
biblioteca padrão CEL completa ou funções de extensão do usuário
```

O módulo é batizado externamente de "expressão CEL restrita": a sintaxe e o fluxo de controle seguem o subconjunto CEL declarado aqui, mas os números usam uniformemente o
`number` do JavaScript, e aritmética, comparação, divisão e módulo seguem a semântica numérica do JavaScript, sem implementar a distinção de tipos `int`/`double` do CEL nem a divisão
inteira. O parser precisa rejeitar sintaxe não implementada e não pode interpretá-la de forma aproximada. Números aceitam apenas valores finitos que possam ser projetados com segurança em um JSON number; NaN, Infinity,
inteiros fora do intervalo seguro de inteiros do JavaScript e resultados BigInt precisam falhar.
O módulo existe como um pacote TypeScript puro e independente, em que Provider Config e CLI Adapter possam depender, e não é colocado em UI, Services nem em um Adapter específico,
evitando dependência reversa entre domínios. O ciclo de vida é fixado como:

```text
CEL source（持久化）
        |
        v
Config 读取时用共享 compiler 验证
        |
        v
Registry/协议继续传递不可变 CEL source
        |
        v
CLI ModelFactory 创建 Active Model 时编译并绑定 Program
        |
        v
每次请求只绑定 value 并执行
```

O mesmo compiler/evaluator atende tanto a verificação de compilação do Config quanto a execução no Adapter; não é permitido que Config e Runtime implementem cada um um subconjunto.

### 3.4 Config Overlay

`reasoningLevel` e `maxOutputTokens` continuam sendo dois itens de configuração aninhados independentes, com Overlay por folha dentro da Option. A Model Rule pode declarar apenas
domínio de valores/default, e a API Schema Rule pode declarar apenas o `map` correspondente; os dois se fundem em uma Effective Option Spec completa:

```text
Model Rule
└─ optionSpecs.reasoningLevel
   ├─ type / values / default
   `─ map 缺省

API Schema Rule
└─ optionSpecs.reasoningLevel
   `─ map

             叶子 Overlay
                  |
                  v
Effective Option Spec
├─ type / values / default
`─ map
```

Em cada Config Rule, uma folha pode estar ausente, ser sobrescrita ou ser removida com `null`; a Personal Rule continua guardando apenas as folhas que o usuário alterou explicitamente e vem depois das Built-in.
A Effective Option Spec precisa obter type, domínio de valores, default e map completos, caso contrário a verificação de integridade falha. A página de configurações exibir um valor herdado não gera
Personal Rule; "restaurar todos os padrões" remove as sobrescritas de folha Personal correspondentes. Não se pode separar `map` em outra Overlay Source nem em um campo de persistência próprio.

## 4. Semântica de Reasoning

### 4.1 Ordem dos níveis

```text
reasoningLevel.values
├─ values[0]：最低公开档位
└─ 后续元素：按语义强度逐渐增强
```

O nível mais baixo não garante estar desligado. Por exemplo:

```json
["off", "low", "high"]
```

ou:

```json
["low", "high", "max"]
```

Requisições comuns usam a escolha explícita ou o `default`; chamadas auxiliares que adotam deliberadamente uma estratégia de baixo custo, como Title, Goal Title, Git Commit Message e Memory Recall, continuam escolhendo uniformemente `values[0]`.
O Runtime não varre strings como `off`, `none` ou `nothink` para inferir o liga/desliga.

### 4.2 Exemplo com Anthropic Messages

```json
{
  "type": "enum",
  "values": ["off", "low", "high"],
  "default": "low",
  "map": "value == 'off' ? {'thinking': {'type': 'disabled'}} : {'thinking': {'type': 'enabled', 'budget_tokens': value == 'low' ? 1024 : 8192}}"
}
```

### 4.3 Exemplo com OpenAI Chat Completions

```json
{
  "type": "enum",
  "values": ["low", "medium", "high"],
  "default": "medium",
  "map": "{'reasoning_effort': value}"
}
```

### 4.4 Exemplo com OpenAI Responses

```json
{
  "type": "enum",
  "values": ["low", "medium", "high"],
  "default": "medium",
  "map": "{'reasoning': {'effort': value}}"
}
```

### 4.5 Limite de `budgetTokens`

O que precisa ser removido é o parâmetro unificado `budgetTokens` da camada intermediária ZCode/AI SDK e a conversão de compatibilidade, e não o campo original da API do Anthropic:

```text
ZCode 中间字段 budgetTokens
└─ 删除，不进入公共 Option、Request 或 Mapping 参数结构

Anthropic 原始 thinking.budget_tokens
└─ 允许作为 reasoningLevel.map 生成的字面量字段
```

## 5. Semântica de Max Output Tokens

`maxOutputTokens` mantém a semântica unificada de orçamento total de geração:

> O limite superior de Tokens de uma geração do modelo, incluindo Tokens de reasoning/thinking e Tokens de saída visíveis ao usuário.

`LimitOptionSpec.max` é o limite superior do domínio suportado pelo modelo, e `default` é o Option Value padrão quando o chamador não sobrescreve explicitamente; ambos pertencem à
abstração unificada de Option e não podem ser removidos só porque algum SDK consegue omitir o envio.

### 5.1 Anthropic Messages

```json
{
  "type": "limit",
  "max": 128000,
  "default": 32000,
  "map": "{'max_tokens': value}"
}
```

### 5.2 OpenAI Chat Completions

```json
{
  "type": "limit",
  "max": 128000,
  "default": 32000,
  "map": "{'max_completion_tokens': value}"
}
```

Ao usar Schemas legados ou compatíveis de terceiros, a Rule correspondente pode escrever:

```cel
{'max_tokens': value}
```

### 5.3 OpenAI Responses

```json
{
  "type": "limit",
  "max": 128000,
  "default": 32000,
  "map": "{'max_output_tokens': value}"
}
```

O Provider não pode reinterpretar o `maxOutputTokens` do ZCode como "somente saída visível ao usuário". A diferença de nome de campo é resolvida pelo Map; a semântica não muda.

## 6. Limites entre AI SDK e Wire

A ordem-alvo é:

```text
Model Effective Options
        |
        | 每个 Option 只执行自己的 map(value)
        v
Option JSON Merge Patches
        |
        | 按固定 Option 顺序展开并检查写入路径冲突
        v
无冲突的有序 Patches
        |
        v
AI SDK 序列化基础 JSON Request Body
        |
        v
应用 Option Patches
        |
        v
注入 Access 材料 / 请求安全校验
        |
        v
发送 HTTP 请求
```

Para os campos já gerenciados por um Option Map:

- o Body original final tem o Map como autoridade;
- não se escreve mais valores sinônimos simultaneamente no `providerOptions` do AI SDK;
- não se mantém `createRequestProviderOptions(api.type, reasoningMapping[level])`;
- não se mantém branches de Runtime que alteram a semântica da mesma Option conforme o Provider Kind;
- não se mantém a conversão "ZCode subtui primeiro, o AI SDK soma de volta" do fixed thinking do Anthropic;
- não se mantém fatos de limpeza de campo em que `max_tokens`, `max_output_tokens` e `max_completion_tokens` originais competem com a Option canônica.

Generate e Stream precisam usar o mesmo executor de Patch e a mesma ordem de aplicação. O Patch precisa ser concluído antes de qualquer verificação de segurança que dependa do conteúdo do Body;
Request Auth, Attribution Headers, retry e parsing de resposta não pertencem à linguagem de configuração deste Todo.

A ordem fixa de aplicação da primeira versão é `reasoningLevel` e depois `maxOutputTokens`; novas Options públicas no futuro precisam entrar em uma ordem explícita, e não podem depender da enumeração de propriedades de objetos do JavaScript.
Em tempo de execução, antes de aplicar, cada Patch é expandido nos caminhos RFC 7396 que realmente escreve e comparado: escrita repetida no mesmo caminho, substituição integral de um caminho pai por `null`/array/escalar seguida de escrita em um caminho filho,
ou qualquer outro conflito de substituição de ancestral, faz a montagem desta requisição falhar imediatamente. Caminhos de folha diferentes sob o mesmo objeto podem ser fundidos.
Neste ciclo não se adiciona prioridade, sobrescrita automática ou análise estática complexa de conflitos.

Model IO, Debug e a captura de rede precisam registrar o Request Body final, após o Patch e antes da verificação de segurança; não se pode continuar tratando o `result.request.body` que o AI SDK salva antes do Patch como
um fato de Wire. As regras de mascaramento existentes continuam valendo sobre o resultado final capturado.

Se a verificação da implementação descobrir que algum Provider do AI SDK depende à força do parâmetro sinônimo antes de a requisição chegar à fase final de Body Patch, primeiro se fixa a falha com um teste de requisição real e depois se trata como um problema
de compatibilidade concreto de Schema Adapter; não se pode por isso expor o namespace do AI SDK de volta ao Config nem restaurar uma segunda autoridade de mapeamento.

## 7. Limites de validação

Este Todo não adiciona um sistema complexo de pré-visualização ou de validação em tempo de execução.

Config/Schema exige apenas:

```text
稀疏 Config Input 的已提供叶子类型合法
                +
Effective Enum/Limit Option Spec 所有必需叶子完整
                +
map 是非空字符串且受限 CEL 可以编译
```

Explicitamente não é feito:

- enumerar todos os `reasoningLevel.values` para execução;
- percorrer o domínio de `LimitOptionSpec` ou testar default/max;
- construir o produto cartesiano de Options diferentes;
- analisar estaticamente ou pré-visualizar conflitos de JSON Path;
- estabelecer um segundo conjunto de validadores de Request Schema Anthropic/OpenAI;
- reescrever ou corrigir automaticamente o CEL do usuário;
- adicionar `language`, `engine`, `version` ou um discriminador de Policy ao Map.

Executar o CEL restrito na ocorrência de uma requisição, verificar conflitos de caminho de Patch daquela vez e aplicar a RFC 7396 é a montagem normal da requisição, e não uma pré-visualização do domínio de valores ou um produto cartesiano.
Na falha de execução da expressão, na conversão de compatibilidade JSON, na verificação de conflito de caminho ou na aplicação do Merge Patch, a montagem desta requisição falha e devolve um erro explícito; não é permitido ignorar o Map em silêncio,
recorrer ao antigo `reasoningMapping` nem deixar o AI SDK adivinhar campos.

Option Maps independentes devem escrever campos originais que não entrem em conflito. O Runtime só verifica conflitos de caminho nos Patches realmente produzidos nesta vez; não se constrói prova estática de conflito do Config,
prioridade nem capacidade de dependência entre Maps. Os publicadores Built-in são responsáveis por evitar que vários Maps disputem o mesmo caminho; se surgir uma necessidade real e inevitável de escrita no mesmo caminho, isso será decidido à parte.

## 8. Projeção para UI e protocolo

A página de configurações deixa de exibir um "Mapping JSON de parâmetros de raciocínio" separado e não oferece entrada de UI para edição de Reasoning ou de `maxOutputTokens.map`.
O Map é fornecido pela Model Config Rule genérica/específica por `api.type` entre as Built-in; quando a página altera campos visíveis como o domínio de valores, default ou max das Options,
ela não pode copiar o Map herdado para a Personal Rule nem remover o Map com `null`. O arquivo de configuração avançado continua usando a mesma estrutura de Option Spec,
e nenhum tipo de Mapping exclusivo de UI é adicionado.

Config entre processos, draft de Settings, round-trip do JSON Personal, Model Config do Registry e Option Specs do Active Model usam a mesma
estrutura. Não se adiciona um `reasoningMap` achatado, um DTO de capability de Runtime nem um tipo de Mapping exclusivo de UI.

Identidade de Vision, formato de entrada e saída, seleção de modelo, Session Selection, Automation, Subagent, Repo Wiki, Compact e Off-Peak
continuam consumindo apenas o Effective Model/Options; este Todo não muda sua identidade de modelo, fila, recuperação ou posse de persistência.

## 9. Escopo de implementação

### 9.1 Config e Resolver

- adicionar `map` a `EnumOptionSpec` e `LimitOptionSpec`;
- mudar o Config das Enum/Limit Options para Overlay aninhado por folha, atualizando Schema estrito, congelamento, `null`, round-trip JSON e verificação de integridade;
- remover `ReasoningParameters`, `ReasoningMappingConfig`, `ModelConfig.reasoningMapping` e seus ciclos de integridade;
- migrar as projeções de Built-in e Personal Config para o `map` dentro de cada Option; a Model Rule e a API Schema Rule podem fornecer folhas diferentes;
- atualizar o Resolver, o Model Config do Registry, o Active Model e as projeções de Config entre processos;
- o novo Schema não lê o antigo `reasoningMapping` não publicado, não adiciona dual-read nem importer de uso único; Built-in, testes e configurações de desenvolvimento atuais migram diretamente.

### 9.2 Adapter

- reutilizar o único módulo de CEL restrito já verificado na etapa anterior, introduzindo o Merge Patch da RFC 7396 e a verificação de conflito de caminhos em tempo de execução;
- Generate/Stream compartilham o executor;
- remover o mapeamento antigo de reasoning level para providerOptions do AI SDK;
- remover a subtração/adição de output budget do fixed-thinking do Anthropic;
- remover a autoridade paralela de campos do AI SDK para max output mapeado, os helpers antigos de limpeza, a conversão de `visibleMaxOutputTokens` no fixed-thinking e os estados intermediários ambíguos;
- manter as responsabilidades independentes já existentes de mensagens, ferramentas, mídia, structured output, parsing de stream, Access e Attribution.

Aqui só são removidos o namespace do AI SDK e os campos de orçamento duplicados gerados pelo mapeamento de reasoning/max-output. `apiFormat`, o `signature`/`redactedData` dos blocos históricos de reasoning do Anthropic, os
metadados de requisição e o provider metadata/options internos necessários para codificar ferramentas e mensagens não estão no escopo de remoção deste ciclo.

### 9.3 Built-in Config

- migrar todos os `reasoningMapping` para `optionSpecs.reasoningLevel.map` conforme `api.type`;
- adicionar o Map de campo da API original correto a todas as Specs de `maxOutputTokens`;
- escrever o Map de Anthropic, OpenAI Chat, OpenAI Responses e Rules compatíveis de terceiros conforme o Schema real de cada um;
- não ramificar em código de produção por Model ID específico; as diferenças de modelo existem apenas no conteúdo das Rules;
- manter `reasoningLevel.values` do menor para o maior e o `default` já existente, a menos que exista outra evidência de fato de modelo.

### 9.4 Documentação e página de configurações

- atualizar os documentos de Model Contract, Configuration, Runtime/Execution, Settings, Built-in Config e os limites Access/Adapter;
- remover todas as formulações de design atuais que dizem que Reasoning Mapping é um campo separado do Model Config;
- a página de configurações remove o estado de edição de Reasoning Mapping, os campos de protocolo e o helper de salvamento correspondentes, e não adiciona editor de Map de max output;
- o Map na Built-in Config continua escrevendo diretamente os campos do API Schema original, sem aparecer namespace do AI SDK; a página de configurações não exibe o Map.

## 10. Impact Brief

### 10.1 Feature Summary

| Campo | Valor |
| --- | --- |
| Developer intent | Cada Option pública de Model traz seu próprio Map em CEL restrito, projetado direto no Request Body do API Schema original |
| Capability | Config de Option de Model, montagem de requisição do Provider Adapter |
| Change layer | option-source, validation, commit-effect, persistence |
| Operating mode | planning |
| Primary seeds | `packages/provider/src/config/model-config.ts`, `packages/provider/src/config/schema.ts`, runner de Adapters |
| Out of scope | Access, Header, Endpoint, seleção de modelo, fila, recuperação, Context entre Options, Request Adapter genérico |

### 10.2 UI Surface Matrix

| Cenário do usuário | Entrada de UI | Owner do Draft | Origem de default/herança | Commit/persistência | Precisa permanecer isolado de |
| --- | --- | --- | --- | --- | --- |
| Editar modelo Built-in/Personal | Provider Model Metadata Dialog | draft de Model Config | Effective Model Config Rules | Personal Model Config Rule  | associação de Provider, elegibilidade de conta, Session Selection |
| Selecionar Reasoning/Max Output | opções de Chat/Automation/Subagent etc. | Draft de Selection da própria entrada | Option Specs do Active Model | Selection/record já existente de cada entrada | drafts e pontos de submissão das outras entradas |
| Requisição real de geração | sem UI direta | o ModelRequest desta vez | valor Effective do Active Model | sem nova persistência; enviado ao Adapter/HTTP | estado Desktop continuous / Mobile replayable |

### 10.3 Feature Relationships

| Rank | From | Semantic edge | To | Why inspect |
| --- | --- | --- | --- | --- |
| must-inspect | Model Config Schema | defines | Option Spec `map` | contrato único de configuração e Overlay de folhas |
| must-inspect | Restricted CEL module | compiles/evaluates | Option Spec `map` | Config e Runtime precisam compartilhar a semântica única |
| must-inspect | ModelFactory/Active Model | freezes | Effective Option Specs | o Map precisa ser congelado na mesma rodada do domínio de valores e do default |
| must-inspect | Adapter runner | applies | Request Body serializado pelo AI SDK | remoção da segunda autoridade antiga de reasoning/max-output |
| must-inspect | Built-in Rules | publishes | Map dos três API Schema | nomes de campo e hierarquia de objetos vêm da configuração |
| should-inspect | Settings editor | edits/persists | Personal Option Spec | remoção do Mapping JSON separado e preservação do Overlay esparso |
| invariant-only | Core auxiliary calls | selects | `reasoningLevel.values[0]` | a semântica do nível mínimo não muda |
| invariant-only | Access/Request Auth | signs/authenticates | requisição já com Patch | o Patch precisa vir antes da assinatura que depende do Body, sem mudar a posse das credenciais |
| evidence-only | Adapter wire/debug tests | proves | Body original final | não é possível afirmar apenas AI SDK options/providerOptions ou o Body antes do Patch |

### 10.4 State Owners And Commit Sinks

| Estado/fato | Owner autoritativo | Commit/persistência |
| --- | --- | --- |
| domínio/default/map da Option | Overlay de folhas da Effective Model Config Rule | Built-in JSON / Personal Model Rule |
| valor da Option nesta vez | Active Model imutável + ModelRequest | esta chamada, sem escrever de volta no Config |
| campo original final da Option | resultado da execução do Option Map | Request Body, apenas nesta requisição de rede |
| metadata de AI SDK/provider | implementação de compatibilidade interna do Adapter | não pode ser autoridade do Config nem do Option Map |

### 10.5 Must-Preserve Invariants

| Invariante | Prova necessária |
| --- | --- |
| `reasoningLevel.values[0]` continua sendo o nível público mínimo das chamadas auxiliares | regressão de Title/Goal/Git/Recall |
| `maxOutputTokens` sempre representa o orçamento total de geração de reasoning + saída visível | wire dos três Schemas e testes de orçamento |
| o Active Model continua congelado após criado, e atualizações posteriores de Config só afetam Models novos | testes de ModelFactory/Registry |
| a Personal Rule continua esparsa, e modificar/restaurar padrões na página de configurações não copia nem remove o Map Built-in | testes de round-trip de Overlay/UI |
| compilação do Config e execução da requisição usam a mesma implementação de CEL restrito | testes unitários de CEL e testes verticais de Adapter |
| o Body exibido em Debug/Model IO é igual ao Body realmente enviado | captura após o Patch e testes de mascaramento |
| o Remote Workspace continua sincronizando o mesmo Provider Registry, sem estabelecer autoridade remota de Mapping | regressão existente de sync do Registry |
| Desktop continuous e Mobile replayable não mudam por causa do Request Body Patch | não alterar protocolo/estado de recuperação; typecheck/regressão relacionados |

### 10.6 Graph Drift / Delta

O Feature Graph atual já cobre Provider Registry, Model Option e sementes de execução de Adapter, mas ainda não declara a aresta semântica "Option Spec Map projetado no Request
Body original". Essa aresta será acrescentada na etapa de implementação, depois da atualização dos documentos de design atuais; este Todo não mantém o `reasoningMapping` histórico registrado como capacidade estável.

## 11. Plano de testes

Defende-se a política de testes primeiro.

### 11.1 Módulo de CEL restrito

- testes em camadas de tokenizer, parser e AST evaluator;
- `value`, cada tipo de literal, objetos/arrays aninhados, comparações, booleanos, aritmética, expressão ternária e parênteses;
- precedência de operadores, avaliação curto-circuitada, escape de strings, posição do erro e mensagens de erro estáveis;
- rejeição de identificador desconhecido, função/método, macro, acesso a membro, comprehension e qualquer token ilegal final;
- proibição de execução de código dinâmico, com ambiente de execução contendo apenas o `value` atual;
- falha para valores numéricos não finitos, inteiros inseguros, BigInt e resultados não conversíveis para JSON;
- Program compilado pode ser cacheado, executado repetidamente e não possui estado mutável entre requisições;
- validação cruzada do subconjunto suportado com amostras representativas da semântica padrão do CEL, sem alegar conformidade completa com CEL;
- validação de carregamento e execução em desenvolvimento Node, testes unitários, build da CLI e bundle SEA/de publicação.

### 11.2 Config

- Schema estrito, congelamento e round-trip JSON do `map` de Enum/Limit;
- Overlay de três estados em cada folha da Option Spec, confluência da Model Rule com a API Schema Rule e sobrescrita Personal posterior;
- `map` ausente, string vazia e falha de compilação CEL;
- `reasoningLevel.values` só valida não vazio e que o `default` pertence ao domínio; não valida valores duplicados nem a ordem de intensidade semântica, que são responsabilidade de quem publica a configuração;
- depois de remover o `reasoningMapping` separado, o novo Schema não aceita o campo antigo;
- a integridade do Effective Config continua cobrindo default/values de reasoning e max/default;
- a validação do Config não executa os valores do enum, não percorre o limit e não pré-visualiza conflitos.

### 11.3 CEL e Patch

- string de Enum e número de Limit como única entrada `value`;
- expressões condicionais, aritmética e objetos aninhados;
- acréscimo, substituição, merge aninhado, substituição integral de array e remoção por `null` da RFC 7396;
- nenhuma outra Option, Context, Provider, Model ou variável de credencial é disponibilizada;
- ordem de aplicação fixa das Options; folhas diferentes de objetos podem ser fundidas; conflitos de mesmo caminho e de substituição pai/filho falham explicitamente;
- falha de execução do CEL e resultado não-objeto fazem a requisição falhar explicitamente, sem recorrer ao mapeamento antigo.

### 11.4 Wire

- `thinking` e `max_tokens` de reasoning do Anthropic;
- `reasoning_effort` e `max_completion_tokens` do OpenAI Chat;
- `reasoning.effort` e `max_output_tokens` do OpenAI Responses;
- caminhos de campos personalizados de compatíveis de terceiros;
- Body final idêntico entre Generate e Stream;
- o Patch entra em vigor antes da verificação de segurança da requisição;
- Model IO, Debug e a captura de rede observam o mesmo Body pós-Patch e mantêm o mascaramento de campos sensíveis;
- o Body final não mantém simultaneamente namespace do AI SDK, campos antigos ou campos canônicos duplicados;
- o Anthropic não executa mais a conversão de subtração e adição do fixed thinking.

### 11.5 Regressão de Runtime/UI

- requisições comuns usam o `default` ou a Option explícita;
- Title, Goal, Git e Recall usam `values[0]` e não sintetizam nada quando não há Reasoning Spec;
- Compact, Memory, Subagent, Off-Peak e Repo Wiki continuam lendo o Active Model deste ciclo;
- a página de configurações não exibe Map; ao editar campos visíveis de Option, ela não copia, não sobrescreve e não remove o Map Built-in;
- cancelar uma edição não submete, e campos ocultos não se perdem;
- Registry local/remoto usa a mesma estrutura, sem um segundo conjunto de DTO de Runtime.

## 12. Etapas de execução

### Etapa 0: módulo de CEL restrito e verificação independente

1. construir um módulo puro em TypeScript compartilhado entre Provider Config e CLI Adapter, fixando sintaxe restrita, AST e contrato de erro;
2. implementar tokenizer, parser, evaluator e conversão de resultado compatível com JSON com testes primeiro, sem dependência do módulo em UI, Services ou Adapter específico;
3. provar que o cache de compilação e a execução repetida não têm estado mutável compartilhado;
4. concluir a validação em Node, no build da CLI e no bundle SEA/de publicação;
5. revisar de forma independente os limites de segurança, a semântica de expressão restrita declarada aqui e o comportamento fail-closed da sintaxe não suportada.

Se a Etapa 0 não passar por completo, não se entra na migração de Config ou Adapter.

### Etapa A: testes falhando e sincronização de Spec

1. atualizar os designs atuais de Model/Configuration/Execution/Settings;
2. escrever testes falhando para o Overlay de folhas do Config, o freeze de Model e os três Wires;
3. fixar os limites de não suporte a Mapping agregado, entrada de Context e `reasoningMapping` antigo.

### Etapa B: migração de Config e Built-in

1. alterar os tipos Input/Effective da Option Spec, o Overlay de folhas, o Schema, o Resolver, o Registry e as projeções de protocolo;
2. remover o tipo e o campo separados de Reasoning Mapping;
3. migrar as projeções Built-in/Personal;
4. atualizar o draft e a estrutura de salvamento da página de configurações.

### Etapa C: consolidação do Wire do Adapter

1. conectar o Program de CEL restrito compartilhado da Etapa 0, o Patch da RFC 7396 e a verificação de conflito de caminhos em tempo de execução;
2. conectar o Body JSON final de Generate/Stream;
3. remover o mapeamento de reasoning em providerOptions, o estado intermediário budgetTokens, a subtração/adição de fixed-thinking, a conversão antiga de `visibleMaxOutputTokens` e a dupla autoridade dos campos de saída;
4. mover a captura de requisição de Model IO/Debug para a única posição de fato, depois do Patch e antes da verificação de segurança;
5. provar a requisição final com testes de wire dos três API Schemas.

### Etapa D: limpeza e verificação

1. zerar em todo o repositório os símbolos antigos, textos antigos, JSON antigo e helpers de teste;
2. atualizar o Feature Graph e os documentos de fatos atuais;
3. executar testes direcionados, typecheck dos pacotes relacionados, `pnpm typecheck` da raiz, `pnpm lint`, `pnpm test:unit`, verificação de formatação e
   `git diff --check`;
4. revisar a autoridade do Config, os limites do AI SDK, a consistência entre Generate e Stream e os invariantes local/remoto;
5. submeter usando Conventional Commit.

## 13. Critérios de conclusão

- o módulo independente de CEL restrito é concluído e verificado de forma suficiente antes, e se torna a única implementação de compilação no Config e de execução no Runtime;
- cada Option Spec pública declara a projeção no Request Body do API Schema original por meio do seu próprio `map(value)`; as Rules de modelo/API/Personal se fundem por Overlay de folhas;
- `reasoningMapping`, `ReasoningParameters`, o mapeamento de namespace do AI SDK para reasoning/max-output e os ciclos de integridade antigos são totalmente removidos;
- `maxOutputTokens` e Reasoning formam o Body original final pelo Option Map, sem um segundo conjunto de mapeamento de campos no Adapter;
- a subtração e adição de orçamento do fixed-thinking do Anthropic e o `budgetTokens` intermediário do ZCode são zerados; o `thinking.budget_tokens` original existe apenas como
  campo do Map do Anthropic;
- os testes de wire de Generate/Stream dos três API Schemas provam que os caminhos de campo, os valores e a semântica do orçamento total de saída estão corretos;
- Patches de múltiplas Options usam ordem fixa e rejeitam conflitos reais de caminho de escrita; Debug/Model IO e o Body final de Wire são idênticos;
- Settings, Personal Overlay, Registry, Active Model e sincronização remota usam a mesma estrutura de Option Spec;
- Settings não expõe entrada de edição de Map, e o Map é coberto pela Built-in Rule sem ser sobrescrito por erro na edição de campos visíveis;
- não são adicionados Mapping agregado de Options, entrada de Context, Request Adapter genérico, dependência entre Options ou validadores complexos;
- as verificações direcionadas e completas passam, e Design, Feature Graph, implementação e testes estão consistentes.

## 14. Planning Handoff

| Item | Destination | Status |
| --- | --- | --- |
| Spec update | Model Contract, Configuration, Execution, Settings, Built-in Config | done |
| Case catalog | seção 11 deste Todo | ready |
| Coverage matrix | Restricted CEL / Config / Patch / Wire / Runtime/UI | done |
| Decision backlog | nenhum; futuras necessidades entre Options/Context precisam ser redecididas com um Provider real | closed |
| E2E handoff | as mudanças de estrutura da página de configurações já atualizaram a fixture existente de Provider Settings; o Wire é coberto principalmente por testes de Adapter | done |

## 15. Registro de implementação e verificação

Resultado final da implementação deste ciclo:

- novo pacote TypeScript puro `@zcode/model-option-map`, com a única implementação de mapeamento baseada em CEL restrito, Merge Patch da RFC 7396, ordem fixa de Options e verificação de conflito de caminhos de escrita;
- Config Schema, Overlay esparso, Built-in Rules, Registry, Active Model, CLI Adapter e Settings migrados de forma unificada para o `map` por Option;
- o Patch é aplicado depois de o AI SDK finalizar o corpo base da requisição e antes da verificação de segurança, e Generate/Stream, Debug, Model IO e a requisição de rede real observam o mesmo Body final;
- remoção de `reasoningMapping`, `ReasoningParameters`, das antigas conversões de orçamento max-output/visible-output, da subtração e adição de fixed-thinking do Anthropic, da projeção de raciocínio em `extra_body` do compatible do OpenAI e dos helpers antigos relacionados;
- o Feature Graph recebeu a aresta semântica estável de Model Option Map até o Request Body original final.

Verificação final:

- `@zcode/model-option-map`: 25/25 testes unitários, typecheck e build passaram;
- `@zcode/provider`: 152/152 testes unitários e typecheck passaram;
- `@zcode/provider-node`: 48/48 testes unitários e typecheck passaram;
- testes direcionados de Adapter da CLI: 190/190 passaram, typecheck passou;
- testes direcionados de Core da CLI: 197/197 passaram, typecheck passou;
- testes direcionados de Bootstrap da CLI: 52/52 passaram, typecheck passou;
- testes direcionados de UI: 90/90 passaram; typecheck de Contracts passou;
- `pnpm --filter @zcode/cli build`, `pnpm lint`, verificação de formatação dos arquivos alterados, parsing do YAML do Feature Graph e `git diff --check` passaram.

Os portões de todo o repositório ainda reportam três problemas de baseline existentes e sem interseção com este Todo: dois erros de tipo de porta nullable no helper de Desktop E2E; a falha do `fmt:check` de todo o repositório causada por exemplos de documentação do Electron e arquivos binários; e o teste de limpeza de grupo de processos Bash do Adapter, que no ambiente atual não consegue limpar processos descendentes que ignoram o TERM. Formatação, tipos e testes dos arquivos afetados já foram verificados individualmente e passaram.