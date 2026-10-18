# Validação de Chamadas de Ferramentas do Modelo

## Contexto

O provider pode retornar dois tipos diferentes de problema:

- nome de ferramenta vazio, por exemplo `{ id: "call_x", name: "", input: {...} }`;
- id presente junto de um nome de ferramenta não vazio, mas com `tool-call.input` final sendo JSON malformado ou `null`.

O nome de ferramenta vazio/string apenas com espaços em uma chamada client-executed não consegue atingir o
registry, mas, quando o id da chamada pode ser fechado, ainda é possível gerar um error tool result
correspondente. Esse ramo preserva o nome original do provider, trata com um comportamento de recuperação
estável e não adivinha a ferramenta real. Quando os argumentos estão corrompidos, a identidade da chamada
também é preservada: o resultado é gerado pelo schema/lookup comum da ferramenta e o modelo se recupera no run
atual, em vez de escalar o erro para uma falha de requisição do modelo inteiro.

## Identidade da ferramenta

- Nesta rodada só são recuperadas chamadas client-executed com
  `typeof toolName === "string" && toolName.trim().length === 0`. A string vazia original ou de apenas espaços
  deve ser preservada e não pode ser sobrescrita por um valor de placeholder de wire/storage.
- Quando `toolName` está ausente ou é `null`, número, objeto ou outro tipo não string, continua sendo retornado
  `invalid_model_response`. Essa é a escolha de escopo desta rodada e não cobre a recuperação de nomes de
  ferramenta não string.
- Nomes vazios ou de apenas espaços em `providerExecuted=true` continuam retornando `invalid_model_response`.
- Nomes legítimos não vazios continuam sendo executados após o trim.
- Um nome de ferramenta não vazio, mesmo não registrado, continua passando pelo tool lookup existente. Quando
  a ferramenta não é encontrada, o executor retorna `Tool not found: <name>` e o runtime gera um
  `tool_result` com `is_error=true` pareado ao id original da chamada.
- O comportamento de compatibilidade existente para id de chamada ausente não é modificado neste ticket e não
  pode ser confundido com a recuperação de argumentos malformados. `generateText` continua usando
  `toolCallId ?? id ?? crypto.randomUUID()`; o streaming não ganha novo fallback de id. O nome vazio só é
  recuperado quando o caminho atual já tem um id que possa ser fechado.

Nomes vazios ou de apenas espaços usam o ciclo de vida existente de registry-miss:

```text
tool call final do provider（nome original）
                 │
                 ▼
client-executed + name.trim()==="" + id fechável
                 │
                 ├── fim normal ──> registry miss forçado
                 │                     ├── não executa Hook / permission / handler
                 │                     ├── ToolCallError + error result com o mesmo id
                 │                     └── continuation após o fechamento do batch irmão
                 │
                 └── interrupção antes do fim ──> stream_recovery_interrupted_tool existente
                                       não reescrito como erro de registry-miss
```

O registry miss de nome vazio usa dois conteúdos de erro explicitamente separados:

- UI / log de erro: `Model returned an invalid tool call: tool name is empty.`
- `modelContent` do provider:
  `<tool_use_error>Error: No such tool available: ${rawToolName}</tool_use_error>`

Uma ferramenta unknown comum com nome não vazio continua usando `Tool not found: <name>`, sem alterar o texto
existente.

## Provider, persistência e projeção no App

O histórico assistant/tool-result do runtime sempre preserva o nome original do provider. Somente as
fronteiras em que o protocolo exige valor não vazio usam o placeholder fixo `empty_tool_name`:

| Formato de API | tool call do assistant | tool-result no wire |
| --- | --- | --- |
| `anthropic-messages` | string vazia/de espaços original | `tool_result` não carrega name |
| `openai-chat-completions` | `empty_tool_name` | tool message não carrega name |
| `openai-responses` | `empty_tool_name` | `function_call_output` não carrega name |

- O `apiFormat` explícito tem prioridade; quando o formato está ausente, apenas `providerKind="anthropic"`
  preserva o nome original e os demais providers usam `empty_tool_name`. Não é permitido adivinhar o protocolo
  pela URL.
- `ToolPart.tool` guarda `empty_tool_name` e `ToolPart.metadata.providerToolName` guarda o nome original. Para
  verificar se o metadata existe é obrigatório usar `providerToolName !== undefined`; não se pode usar uma
  verificação de truthiness.
- Os ciclos de vida pending, running, completed/error e streaming synthetic preservam o mesmo metadata de
  top-level. A hydration restaura primeiro o nome original e só depois decide a projeção no wire conforme o
  formato do provider atual, portanto trocar de provider não faz o valor de placeholder armazenado ser
  confundido com o nome original do modelo.
- O estado de produto visível no App filtra silenciosamente apenas a evidência estruturada produzida pela
  recuperação de nome vazio, e não apenas a comparação com a string de placeholder fixa: no `model.streaming`
  ao vivo, quando o nome original fica vazio após o trim, não é gerado um `ToolCallRow` do V4; um `ToolPart`
  persistido só não mapeia legacy message tool part, linha de ferramenta de cold hydration ou footprint
  visível quando `ToolPart.tool="empty_tool_name"` e `metadata.providerToolName` existe e fica vazio após o trim.
  O filtro vale tanto para desktop continuous quanto para web remote replayable.
- Chamadas recuperadas de nome vazio não publicam `ToolCallScheduled`. Scheduler, registry-miss, `ToolPart`
  persistido, error result do provider e continuation permanecem inalterados; eventos posteriores de
  `ToolCallError` / batch terminal não criam retroativamente linhas de ferramenta no produto.
- `empty_tool_name` não é um nome de ferramenta reservado. Um `ToolPart.tool="empty_tool_name"` sem o metadata
  acima, assim como chamadas ao vivo não vazias com esse mesmo nome retornadas pelo modelo, são executados e
  exibidos como nomes de ferramenta legítimos comuns. Assim, quando um plugin, alias, MCP ou interno registra
  uma ferramenta com esse mesmo nome, não ocorre uma colisão de identidade em que a execução acontece mas o
  produto a oculta silenciosamente.
- O mapper do App/remote não expõe `providerToolName`; o protocolo comum e as sessões antigas não precisam de
  migração. Dados antigos sem metadata continuam usando `ToolPart.tool`, incluindo exibir um
  `empty_tool_name` puro como ferramenta comum. Uma ferramenta unknown comum não vazia não passa pelo filtro
  silencioso e continua exibindo a linha de ferramenta com o erro terminal existente.
- `tool_input_start` e `model.streaming` preservam o nome original vazio; o placeholder é usado apenas nas
  fronteiras de App/storage ou de wire compatível com OpenAI que exigem um nome válido não vazio.

## JSON de entrada de ferramenta malformado

O Adapter só faz parsing do `tool-call.input` final do AI SDK; deltas de streaming servem apenas para
exibição. As regras de normalização unificada são:

- `undefined`, input ausente, string vazia → `{}`, sem registrar parse-fail;
- input string tem no máximo um BOM inicial removido e depois usa `JSON.parse` estrito;
- falha no parse do JSON, resultado do parse igual a `null` ou input nativo `null` → um warn e degradação para `{}`;
- outros valores não string são mantidos como estão, para decisão pelo schema comum da ferramenta;
- não há reparo de JSON parcial, nem corte de cauda, nem adição de colchetes para adivinhar a intenção do modelo.

```text
tool-call(input) final do AI SDK
              │
              ▼
       normalização estrita única
        │             │
        │ válido      │ malformado / null
        ▼             ▼
   input parseado    warn + input={}
        │             │
        └──────┬──────┘
               ▼
       lookup / schema da ferramenta comum
        │                 │
        │ rejeita         │ aceita
        ▼                 ▼
tool result is_error=true  execução normal da ferramenta
com o mesmo id
        │
        ▼
próxima requisição do modelo no mesmo run tenta se recuperar
```

Malformado não acrescenta `inputIssue` nem marca de parse falho. Se o schema da ferramenta aceita `{}`, a
ferramenta ainda é executada normalmente; se o schema rejeita, usa-se o erro de validação de entrada
recuperável já existente. Um nome de ferramenta desconhecido mas não vazio usa o mesmo `{}` e o mesmo id de
chamada e entra no caminho existente de `Tool not found`.

## Erro de validação de entrada visível ao provider

Quando a primeira entrada do modelo não passa em `inputSchema.safeParse`, o runtime formata o erro de
validação completo e retorna um error tool result com o mesmo tool call id:

```text
<tool_use_error>InputValidationError: ${formattedError}</tool_use_error>
```

A projeção no provider precisa preservar os seguintes campos e valores, sem acrescentar metadata interna de
telemetria:

```json
{
  "role": "user",
  "content": [
    {
      "type": "tool_result",
      "tool_use_id": "<tool call id original>",
      "is_error": true,
      "content": "<tool_use_error>InputValidationError: ...</tool_use_error>"
    }
  ]
}
```

O formatter emite os problemas identificáveis nesta ordem:

1. missing: `invalid_type` e a message contém `received undefined`;
2. unexpected: `unrecognized_keys`, emitindo apenas as keys, sem concatenar o path da própria issue;
3. wrong type: os demais `invalid_type`.

Os templates exatos de linha são:

```text
The required parameter `${path}` is missing
An unexpected parameter `${key}` was provided
The parameter `${path}` type is expected as `${expected}` but provided as `${received}`
```

O path une campos string com `.` e campos numéricos com `[n]`; um path vazio produz uma string vazia. O
`received` de wrong type é extraído da message da issue com `/received (\w+)/` e, quando não pode ser extraído,
usa-se `unknown`. Existindo qualquer problema identificável, a saída é:

```text
${toolName} failed due to the following ${count > 1 ? "issues" : "issue"}:
${lines.join("\n")}
```

Nesse momento, outros tipos de erro do mesmo lote de issues não são exibidos. Quando nenhuma das três
categorias existe, a message de erro completa do Zod 4.0 é retornada: o array de issues usa a message padrão
em inglês, remove os campos internos `input` / `inst` / `continue` e é serializado com
`JSON.stringify(issues, replacer, 2)` usando um replacer de bigint para string. O formatter visível ao provider
usa a lista completa de issues e não é afetado pelo limite interno de logs de no máximo 20 erros.

A primeira entrada do modelo tem simultaneamente dois pontos de fronteira já existentes: a normalização do
runtime e o JSON Schema do provider:

```text
runtimeInputSchema.safeParse
       │
       ├── sucesso ──> input normalizado
       │
       └── falha ──-> input bruto + issues do parser retidas
                                      │
                                      ▼
                         portão do JSON Schema do provider
                            │                   │
                            │ sucesso           │ falha
                            ▼                   ▼
                   hooks / permission     modelContent de erro exato
                                                   │
                                                   ▼
                                 tool result com mesmo id, is_error=true
```

- O JSON Schema continua decidindo o resultado de aceitação/rejeição da primeira entrada atual; reter parser
  issues não pode acrescentar uma rejeição.
- Quando o parse do runtime passa mas o JSON Schema falha, são usados os issues do JSON Schema.
- Quando o parse do runtime e o JSON Schema falham ao mesmo tempo, as evidências dos dois lados são primeiro
  projetadas em uma única lista canônica ordenada de issues: o parser do runtime decide o item que realmente
  falhou e a ordem de fallback, e um issue de JSON correspondente apenas substitui pela estrutura de campos da
  versão alvo; problemas estruturais de required/unexpected exclusivos do provider continuam sendo completados
  pelos issues de JSON.
- Quando o parse do runtime falha mas o JSON Schema passa, o fluxo existente é mantido e não se retorna antes
  de tempo um erro de argumento.
- Ferramentas dinâmicas sem schema de runtime continuam usando os issues completos do JSON Schema.

Assim, os valores padrão e a semântica de preprocess/transform vêm do parser real e não são reinferidos no
validator de JSON Schema; a projeção canônica é a única autoridade da ordem visível ao provider, o formatter
apenas consome esse resultado e não combina nem reordena mais os dois conjuntos de erros. Erros de argumento
continuam saindo classificados como missing → unexpected → wrong type; o fallback não-argumento mantém a ordem
de validação de campos/custom do parser do runtime, apenas ajustando a verificação de bounds de nível de array
do parser local para depois dos issues dos itens do array, a fim de corresponder à ordem de travessia da
versão alvo. Não é permitido adotar a estratégia “todos os issues de JSON primeiro e issues exclusivos do runtime
depois”, pois isso moveria erros de regex/refine de campos mais antigos para depois de campos posteriores. Essa
projeção altera apenas a expressão do erro, não o alcance de aceitação do schema.

Este contrato corresponde somente à primeira falha de schema dos arguments originais do modelo. O
`validateInput` de nível de ferramenta, opcional após o sucesso do schema, pertence à validação semântica/de
ambiente e seu conteúdo de falha não passa pelo formatter de erro de argumento; a entrada modificada por hook
PreToolUse e a inner tool call do REPL são pontos de chamada independentes. O ZCode atualmente não tem
superfície de deferred/discovered-tool e portanto não gera hints de schema para descoberta adiada de
ferramentas. Esta correção não acrescenta interface nem comportamento para esses ramos.

Essa lógica não tem portão de provider/model; todos os modelos que suportam tool call compartilham o mesmo
ramo e nenhuma verificação específica de modelo é acrescentada.

A execução ao vivo e a recuperação a frio precisam projetar o mesmo error content para o modelo:

```text
live ToolExecutionResult.modelContent
                │
                ├──> histórico do provider do turno atual
                │
                └──> metadata.modelContent do error tool part
                                      │
                                      ▼
                         histórico do provider em resume / hydration
```

- `ToolStateError.error` continua guardando o erro genérico de UI/log e não é convertido em wrapper de provider.
- O error result é anexado a `ToolStateError.metadata.modelContent` somente quando o próprio `modelContent` é
  string; esta rodada não estende o protocolo de persistência de conteúdo estruturado.
- A hydration prefere o `metadata.modelContent` do tipo string; dados antigos, valores ausentes ou valores não
  string continuam recorrendo a `state.error`, sem necessidade de migração.
- `metadata.modelContent` serve apenas à recuperação a frio do Agent e precisa ser removido ao mapear mensagens
  do App/remote, sem alterar o protocolo ZCode nem o tool metadata visível na UI.
- A hydration não reformata erros históricos conforme o schema de ferramenta atual, evitando que mudanças de
  versão de schema ou de formatter reescrevam o que o modelo realmente viu na época.

## Limites de dados e diagnóstico

- A string/null malformada original não pode entrar no histórico visível ao provider, em tool part persistido ou
  em warn estruturado.
- Para string registra-se apenas o `inputLength` real; para null nativo registra-se `inputType: "null"`, sem
  fabricar comprimento.
- O warn registra `toolName`, `source`, o tipo do erro de parse e o modo de recuperação, apenas uma vez por
  chamada final malformada.
- streamText, generateText e model-io reutilizam o mesmo resultado de normalização, evitando segunda
  passagem de parse, warn duplicado ou conteúdo de diagnóstico inconsistente com a entrada real do runtime.
- O `tool-error.input` gerado pelo AI SDK para uma chamada inválida reutiliza o input normalizado da chamada
  final com o mesmo call id; não se permite que raw string/null malformada entre no runtime ou no model-io a
  partir de `toolResults`.
- O `response.toolCalls` e `response.toolResults` estruturados do model-io registram o `{}` normalizado e não o
  input malformado bruto.
- O model-io, o histórico do runtime e o metadata interno persistido preservam o valor original do nome vazio
  ou de apenas espaços; o `empty_tool_name` produzido pela projeção de nome vazio serve apenas às fronteiras não
  vazias acima e não pode voltar ao registry lookup. Uma string não vazia com o mesmo nome retornada
  originalmente pelo provider continua sendo uma identidade de ferramenta comum e pode fazer registry lookup
  normalmente.
- A coleta de evidências brutas em nível mais baixo do provider continua obedecendo às fronteiras existentes de
  coleta e anonimização.

## Critérios de aceitação

- Nome de ferramenta vazio ou de apenas espaços em chamada client-executed gera um tool result `is_error=true`
  com o mesmo id, o modelo recebe
  `<tool_use_error>Error: No such tool available: ${rawToolName}</tool_use_error>` e o mesmo turno continua
  requisitando.
- Nome vazio força registry miss; handler, Hook, permission e `ToolCallStarted` não são executados; o texto de
  ferramenta unknown comum não vazio permanece inalterado.
- O histórico assistant do Anthropic preserva o nome original; o assistant tool call de Chat Completions e de
  Responses só usa `empty_tool_name` na fronteira de wire, e o tool-result wire dos três não carrega name.
- Um fim normal de streaming entra em registry miss; interrupção após o final e antes do fim continua retornando
  o `stream_recovery_interrupted_tool` existente.
- Tanto live/cold hydration restauram `providerToolName` e o `modelContent` exato; mensagens/snapshots do App
  não materializam o nome original vazio nem uma linha de ferramenta placeholder com metadata de
  `providerToolName` vazio, nem expõem o metadata do nome original vazio do provider. Um `empty_tool_name` puro
  sem esse metadata é exibido como ferramenta comum; sessões antigas não precisam de migração.
- Uma chamada legítima cujo nome registrado ou alias seja exatamente `empty_tool_name` publica normalmente o
  ciclo de vida streaming/scheduled/result, executa o handler e é exibida nos estados de produto live/cold/legacy,
  sem ser atingida indevidamente pela lógica de recuperação de nome vazio.
- Nome ausente/não string, nome vazio provider-executed, a normalização de id existente e o ciclo de vida geral
  do ToolCall Hook permanecem inalterados.
- A fixture malformada de AskUserQuestion de 884 caracteres produz `input={}`, gera apenas um warn e não lança
  `invalid_model_response`.
- string `"null"`, null nativo, BOM, undefined, string vazia e object legítimo são tratados conforme a matriz
  acima.
- JSON parcial não é reparado.
- Uma ferramenta com schema required que recebe `{}` gera um tool result `is_error=true` com o mesmo id e
  inicia a próxima requisição do modelo no mesmo run.
- Uma ferramenta que aceita `{}` é executada normalmente.
- Um nome de ferramenta não registrado mas não vazio gera um error result `Tool not found` com o mesmo id.
- Em batch paralelo, malformadas, normais e desconhecidas fecham antes de a próxima requisição do modelo.
- A mensagem seguinte visível ao provider usa `tool_use.input={}` e o `tool_result.is_error=true` pareado, sem
  raw string/null malformada.
- O `tool_result.content` da primeira falha de schema usa o
  `<tool_use_error>InputValidationError: ...</tool_use_error>` completo e não pode degradar para
  `Tool input failed inputSchema validation`.
- Após restaurar a sessão, continua sendo usada a mesma string de conteúdo do provider que foi persistida;
  sessões antigas sem esse metadata continuam usando o `state.error` existente.
- A ordem, as quebras de linha, o singular/plural, os paths e a JSON message do Zod 4.0 para missing,
  unexpected, wrong type e fallback não-argumento são verificados byte por byte contra o golden do código-fonte.
- Quando a mesma entrada contém simultaneamente restrições exclusivas do runtime e expressáveis em JSON, campos
  mais antigos não podem ser movidos para depois de campos posteriores pela combinação JSON-first; cobre-se pelo
  menos os dois tipos de schema de produção: regex + bound irmão e field refine + enum irmão.