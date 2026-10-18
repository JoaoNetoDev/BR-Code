# Política de limite de saída da requisição de modelo

Data de atualização: 2026-08-13

Este documento explica como o zcode-cli converte o `maxOutputTokens` de nível de modelo em um orçamento de saída por requisição. O desktop local,
o remote workspace e o controle remoto Web do celular reutilizam a mesma cadeia de requisição do agent, de modo que a política é consistente.

## Orçamento de nível de modelo

O ModelFactory cria o Active Model a partir da Effective Model Config. Um Turn normal escolhe o orçamento de saída em
`model.optionSpecs.maxOutputTokens.max` e depois aplica o cap de preflight desta rodada; o summary do Compact
toma o menor valor entre esse limite e 20.000. O orçamento final é passado ao Model pelo `options.maxOutputTokens` em nível de requisição,
não pertence ao ModelSelection de longo prazo e não é reinferido a partir da estrutura antiga de Settings, do Catalog, do Provider ID ou do modelId.

```ts
const effectiveMaxOutputTokens = model.optionSpecs.maxOutputTokens.max;
```

32K não é um hard cap global independente. Quando o modelo declara 64K, o valor efetivo é 64K; quando declara 16K, o efetivo
é 16K; não se usa mais `min(modelMaxOutputTokens, 32K)` para um segundo corte.

A Model Config Rule geral do Built-in é responsável por declarar o Option Spec padrão completo; modelos específicos e Personal Rules sobrescrevem apenas as folhas divergentes.
Portanto, o `optionSpecs.maxOutputTokens` do Active Model é sempre completo; o orçamento em nível de requisição ainda precisa passar pela validação do Model.

## Campos de requisição do Provider

O core calcula somente o `maxOutputTokens` final desta rodada e não acompanha mais a categoria de requisição nem dicas de campos do Provider. O
`optionSpecs.maxOutputTokens.map` do Active Model mapeia esse valor final para o campo JSON cru do schema da API de destino:

- **Anthropic Messages**: normalmente mapeado para `max_tokens`;
- **OpenAI Chat Completions**: normalmente mapeado para `max_completion_tokens`, e protocolos compatíveis podem declarar `max_tokens`;
- **OpenAI Responses**: mapeado para `max_output_tokens`.

O Adapter executa esse Map depois que o AI SDK conclui a serialização básica e a compatibilidade de protocolo, e antes da validação de segurança da requisição e do envio pela rede. Ele não passa mais um `maxOutputTokens` genérico ao AI SDK em paralelo, nem mantém o fallback de 32K, ramos por Provider ID, ajustes e remoções de fixed-thinking ou limpeza de campos crus. Os mapeamentos específicos pertencem apenas à Model Config
Rule que corresponde ao `providerId/modelId/api.type/baseURL` atual; o contrato completo está em
[Model Option Map e corpo de requisição cru](./working-memory/provider-refactor/design/model/model-option-map.md).

## Política de orçamento fixo (3.12.2)

Todos os novos Runtimes (desktop local, remote workspace, shared-host do celular, CLI puro, sub Agent) usam uniformemente
`preflight-v1`. O `client/configs.modelContextBudget.strategy` não é mais consumido; o campo de protocolo que ainda aceita `legacy` para
compatibilidade com Hosts antigos é normalizado no limite de Runtime desta versão para a constante compartilhada `DEFAULT_ZCODE_MODEL_CONTEXT_BUDGET_STRATEGY`.
Processos antigos em execução não fazem hot switch; Runtimes criados após a atualização ou recuperados a frio adoptam as novas regras.

`getModelContextBudgetStrategy()` mantém a interface de compatibilidade de serviço, mas retorna apenas a constante compartilhada, sem ler cache, sem enviar requisições,
sem iniciar timers ou refreshes em segundo plano. A ponte de preferência do Host local e do remote workspace usa diretamente a constante compartilhada;
tanto `runtime-materialization` quanto `user-execution` leem apenas as Settings locais necessárias, preservando o isolamento de scope.
Os valores de orçamento não são gravados em Settings, banco de dados ou configuração de provider; as requisições existentes de client-config e os demais consumidores permanecem totalmente inalterados.

```text
Settings locais necessárias + preflight-v1 fixo -> runtime preferences -> Runtime -> sub Agent
client/configs -> criação de plano/página/ferramenta real de off-peak (não participa do orçamento nem do início do chat)
```

Motivo: a implementação antiga aguardava até 5 segundos de servidor a cada criação de Runtime para um algoritmo com recuo, e criações repetidas ampliavam a espera em série.
Depois da unificação do algoritmo, a escolha remota e os ramos legacy foram removidos, sem compensar com cache extra, timeout ou tarefas em segundo plano.

## Janela de entrada do Auto Compact

Uniformemente mantém-se uma janela de saída de no máximo 21K e não se aplica mais o threshold legacy de 95%:

```ts
const outputReserve = Math.min(effectiveMaxOutputTokens, 21_000);
const inputWindow = Math.max(0, contextWindow - outputReserve);
const compactThreshold = Math.max(0, inputWindow - 13_000);
```

Com context de 128K e output de 64K, o reserve é 21K, o input efetivo é 107K e o compact threshold é 94K.
Informar `legacy` na entrada ou um override de percentual antigo também não altera esse algoritmo; limites de saída menores que 21K são mantidos como são.
A origem dos tokens do Auto Compact, o buffer de 13K, o circuito de falha e a semântica da linha do tempo permanecem inalterados.

## Cap de preflight da requisição principal

Antes de cada step do modelo principal (incluindo a continuação por ferramenta), reutiliza-se a estimativa de uso já existente no Auto Compact:
a partir da cauda da projeção de mensagens visível ao provider, procura-se para trás o assistant real mais recente que já foi submetido e
que tem `tokens` válidos. O usage desse assistant, visto pelo provider, é a linha de base do contexto, e a estimativa incremental local é feita apenas para as mensagens
posteriores a ele; quando nenhum assistant válido é encontrado, continua-se com uma estimativa local completa. A atribuição de uso vem diretamente do
`AssistantMessageInfo.tokens` já existente, sem adicionar um segundo campo persistido de `providerUsage` e sem persistir o índice absoluto de mensagem
como anchor. Respostas ainda não submetidas ao history não participam da varredura. Depois que o Compact substitui o prefixo antigo visível ao provider,
o usage original dos assistants preservados deixa de representar o contexto atual; o runtime e a projeção de cold start zeram o usage apenas nas cópias das mensagens preservadas. Assistants adicionados depois do Compact estão fora desse escopo e continuam com seus próprios tokens;
os tokens originais do transcript persistido não são modificados. Dados antigos de Compact sem segmento preservado continuam usando o caminho de compatibilidade.

A estimativa incremental local reaproveita o estimador compartilhado do Compact: cada mensagem é estimada por `ceil(número de caracteres visíveis ao provider / 3)`,
e o nome das tool calls do assistant e seus argumentos serializados também entram na contagem de caracteres. OTB09 fixa o limite com `inputTokens=1` e uma
mensagem user de 255.984 caracteres; esse anchor de usage do provider já cobre o assistant da rodada anterior,
portanto o suffix estima apenas a nova mensagem de usuário posterior ao anchor:
`estimatedCurrentUsage = 1 + 85,328 = 85,329`. Assim, com context de 128K, esta rodada envia
`max_tokens = 128,000 - 85,329 - 1,000 = 41,671`.

```ts
const estimatedAvailable = Math.floor(contextWindow - estimatedCurrentUsage - 1_000);
const finalMaxOutputTokens =
  Number.isFinite(estimatedAvailable) && estimatedAvailable > 0
    ? Math.min(effectiveMaxOutputTokens, estimatedAvailable)
    : effectiveMaxOutputTokens;
```

- não se define minimum sendable nem se adiciona um ramo para `<3000`; 2.999 ou 1 são enviados pelo valor calculado;
- o Reasoning Map e o Map do limite de saída leem cada qual seu próprio valor de Option final; o core não infere aqui o thinking budget do Provider;
- o Cap pertence somente ao model step atual, não modifica request, Settings nem configuração de modelo; é recalculado após o Compact;
- o summary do Compact, o title, o TCV e as requisições de workspace/internas não usam o Preflight Cap;
- se a janela ainda for excedida após o corte, não há parsing numérico do provider nem retry de redução; o fluxo continua para a classificação de erros existente e o compact
  reativo.

### Contrato de smoke de comprimentos misturados

Duas séries fixas de seeds verificam a cadeia completa do baseline, do cap contínuo até o Auto Compact:

| Cenário                                  | janela de input efetiva |                 ponto de partida do cap | threshold do Auto Compact |
| ------------------------------------- | ---------------------: | -----------------------: | ---------------------: |
| `64K context + 48K maxOutputTokens`   |      `64K - 21K = 43K` |   `64K - 48K - 1K = 15K` |      `43K - 13K = 30K` |
| `200K context + 128K maxOutputTokens` |    `200K - 21K = 179K` | `200K - 128K - 1K = 71K` |    `179K - 13K = 166K` |

```text
Session vazia
   |
   v
mensagens reais de usuário de comprimentos diferentes a partir das seeds fixas
   |
   +-- estimated usage <= ponto de partida do cap --> max_tokens=baseline
   |
   +-- ponto de partida do cap < estimated usage < threshold do Auto Compact
   |        `--> max_tokens=min(baseline, context - usage - 1K), com pelo menos duas rodadas de redução monótona
   |
   `-- estimated usage >= threshold do Auto Compact
            `--> Auto Compact summary(max_tokens=20K)
                                      |
                                      v
                              continua a user message pendente original
                                      |
                                      v
                              recalcula o cap com o usage pós-compact
```

A cauda do cenário 200K/128K usa poucas mensagens de granularidade fina, empurrando o `max_tokens` real sequencialmente para cerca de 34.3K e
33.1K; o limite teórico é `200K - 166K - 1K = 33K`. Depois que a mensagem seguinte cruza o threshold de 166K, o Compact precisa acontecer primeiro, e
não se deve mais enviar uma requisição principal igual ou inferior a 33K. Isso cobre os dois lados do limite sem introduzir muitas rodadas minúsculas.

Aqui, "esgotar a janela" significa usar até o effective input threshold definido em conjunto pelo preserve de 21K e o buffer de 13K,
e não contornar o Auto Compact para preencher à força a context window original. Os testes fixam apenas as duas séries de comprimentos de entrada e o
usage sintético do provider, sem introduzir seeds aleatórios de runtime, erros de provider, tool calls, filas ou combinações de controle remoto.

## Limites da requisição de Compact

O summary do Compact usa o menor valor entre o efetivo e o orçamento de tarefa de 20K já existente:

```ts
const compactSummaryMaxOutputTokens = Math.min(effectiveMaxOutputTokens, 20_000);
```

Portanto, com effective=16K a requisição de Compact usa 16K, e com effective=64K usa 20K.
O Compact decide somente o valor de `maxOutputTokens` desta rodada; ele e o reasoning level são projetados no corpo de requisição cru final pela mesma cadeia de
Option Map, e não passam mais pela conversão de orçamento de fixed-thinking do Adapter.

## Recuperação de Continue por output-limit

O Main Agent, o Subagent e o workflow child normais compartilham a mesma lógica de recuperação por output-limit. Uma resposta de modelo bem-sucedida entra na recuperação
quando não contém um tool call completo e satisfaz qualquer um destes stop reasons:

- `finishReason` normalizado igual a `"length"`;
- reason bruto `max_tokens`, `max_output_tokens` ou `model_context_window_exceeded`.

Um `model_context_window_exceeded` em resposta bem-sucedida pertence à recuperação por Continue acima e não pode, apenas por esse marcador de término, virar
Reactive Compact; o mesmo vale quando o reason normalizado é `other` ou `length` e o conteúdo e o usage estão totalmente vazios.
Após 3 Continue consecutivos esgotados, o erro de output-limit continua sendo reportado e o raw reason não faz o fluxo ir para Reactive Compact.

Esse é um comportamento intencional (não é bug), confirmado por teste isolado e consistente com o commit original da implementação
`6e7ef0d6171c54d6cd65c88bd79762ad0a9be54d`: o `model_context_window_exceeded` de uma resposta bem-sucedida é mapeado como `apiError: max_output_tokens`, e mesmo
com o conteúdo totalmente vazio ele passa por três Continue. A proposta inicial de "priorizar o Compact conforme o raw reason"discussida na história foi corrigida por esta verificação e não é o acordo final.

A distinção no nível do protocolo é entre "geração truncada" e "requisição que falhou": a
[definição de overflow da context window da Anthropic](https://platform.claude.com/docs/en/build-with-claude/context-windows#context-window-overflow-behavior)
permite que modelos que suportam esse comportamento aceitem requisições em que o input em si não excede a janela, mas input + `max_tokens` excede, retornando esse stop reason
apenas quando a geração preenche a janela; se o input em si já excede, retorna `400 invalid_request_error` (prompt is too long).
Esse marcador continua significando que a capacidade de contexto foi atingida e não significa que a janela não tenha sido preenchida; é uma resposta válida mas truncada, e não se pode
construir uma exceção de requisição só pelo nome. Consulte a [definição de stop reason](https://platform.claude.com/docs/en/build-with-claude/handling-stop-reasons#model_context_window_exceeded).
As três recuperações e o tratamento de conteúdo vazio são um acordo confirmado por este projeto, e não uma garantia de protocolo de que a continuação terá sucesso; cada Continue
ainda volta ao outer loop existente, preservando Micro/Auto Compact, e, se mais tarde for lançada uma exceção real de overflow, ela segue para o Reactive Compact.

Os limites normais de padronização dos adapters de protocolo são os seguintes; o runtime consome apenas os fatos normalized/raw e não reinfere a partir do nome do evento HTTP:

| Protocolo                 | estado final bruto do provider                                                     | finish reason normalizado do adapter |
| -------------------- | --------------------------------------------------------------------- | -------------------------------- |
| Anthropic Messages   | `stop_reason=max_tokens`                                              | `length`                         |
| Chat Completions     | `finish_reason=length`                                                | `length`                         |
| OpenAI Responses API | `response.incomplete` + `incomplete_details.reason=max_output_tokens` | `length`                         |

Alguns serviços não padronizados compatíveis com OpenAI retornam
`finish_reason=max_tokens` em Chat Completions. O AI SDK preserva `rawFinishReason=max_tokens` para essa enumeração desconhecida, e o valor normalizado pode ser
`other`; o ramo de compatibilidade por raw reason do runtime continua recuperando. O wire test focado do adapter fixa esse
exemplo de `other + raw=max_tokens`, enquanto o Desktop OTC11 usa o estado final nativo de cada um dos dois protocolos padrão para validar a normalização ponta a ponta.
Assim que o Runtime combinar o normalized/raw reason e o fato completo de tool calls e confirmar que o step pertence ao output-limit, ele deve unificar o `finishReason` canônico como `length`
antes de gerar `ModelComplete`, o fato de usage e o finish do transcript; o network/model-io do adapter, os diagnostics do Runtime e o `providerMetadata.rawFinishReason` continuam preservando os fatos brutos do provider.

Um context overflow realmente lançado como request error não pertence a esta seção e continua seguindo para o Reactive Compact existente. Um tool
call completo tem prioridade sobre o output-limit; o julgamento usa todas as tool calls que o adapter já montou, e não apenas as tool calls executáveis localmente.
Somente quando os critérios de output-limit acima são atingidos é que uma resposta com text, reasoning e usage totalmente vazios pode recuperar; outras respostas vazias continuam indo para o erro suspicious-empty.

A recuperação acrescenta no máximo 3 Continue com role user, portanto uma cadeia de recuperação produz no máximo 4 requisições normais de modelo. O texto precisa permanecer
exatamente igual:

```text
Output token limit hit. Resume directly — no apology, no recap of what you were doing. Pick up mid-thought if that is where the cut happened. Break remaining work into smaller pieces.
```

O Continue é uma user message comum e local à query, sem ser embutido em `<system-reminder>`. Ele é visível para as requisições ao provider da mesma rodada, mas não entra no
`MessageHistory` canônico, nos eventos/transcript de Session, na bolha de user da UI, na hydration, na entrada de fork/edit nem na determinação de latest-real-user. No fim do Turn o estado
local à query morre diretamente, sem executar limpeza, sincronização de cursor de history nem copyback global.

O Compact também respeita esse limite: mesmo que a parte a ser resumida contenha Continue anteriores, a requisição real ao provider o mantém,
mas o evento `ModelRequest` com `querySource=compact` precisa usar a projeção recordable filtrada, e não pode escrever o array de requisições real diretamente no evento. Testes de regressão cobrem o
Reactive Compact disparado após dois Continue, garantindo que o Continue seja visível na requisição de summary e invisível para eventos e mensagens persistidas.
A aceitação do wire Anthropic cobre simultaneamente um e três Continue: após a mesclagem de users adjacentes, o texto exato e o número de ocorrências permanecem iguais,
sem introduzir o wrapper `<system-reminder>`.

```text
Entrada do Turn
  query.entries = [...borrowReadOnlyRuntimeEntries()]   # snapshot superficial de ponteiros O(n)
        |
        v
Cada outer loop
  requestEntries = [...query.entries]                   # expansão superficial antes da requisição
        |
        +-- output-limit --> query = [...request, partial assistant?, Continue]
        +-- tool ---------> query = [...request, assistant, tool results]
        +-- Compact ------> query = compactResult.entries
        `-- conclusão normal -> Guide / Stop Hook / Turn complete
```

entry/message/content são usados como valores imutáveis depois de entrar no `MessageHistory` ou no query state. O uso síncrono imediato somente leitura usa
`borrowReadOnlyRuntimeEntries()`; as fronteiras de query/Compact entre `await`s apenas copiam os ponteiros do array, sem chamar
`toRuntimeEntries()` para clonar profundamente o conteúdo. A projeção para o provider é a única fronteira de clonagem de conteúdo realmente necessária antes da requisição.

### Partial, Compact e entradas externas

- quando há text ou reasoning real, o assistant atual é submetido pelo caminho de step existente; enquanto a recuperação não se esgota e os dois estiverem vazios,
  nenhum assistant vazio é acrescentado ao history canônico ou local à query. O limite de erro persistente da 4ª vez esgotada está na seção abaixo.
- `TurnResult.response` continua retornando apenas a última resposta real do modelo, sem concatenar vários partials em uma única string.
- o ramo de output-limit retorna ao outer loop antes do Guide e do Stop Hook. Depois que a cadeia de recuperação termina normalmente, ambos retomam o comportamento existente.
- durante a recuperação, o consumo de pending runtime commands, das atualizações assíncronas de project-memory e dos novos runtime notices é pausado, garantindo que
  `partial assistant → Continue` seja uma sequência atômica; Abort, Micro/Auto Compact, MCP/tools, projeção e
  token budgeting continuam rodando.
- Micro/Auto/Reactive Compact usam os entries locais à query atuais. A fronteira do Compact e o summary são persistidos imediatamente pelas regras existentes; um Continue de existência independente é filtrado a partir dos canonical post-compact entries, e a contagem de recuperação não é reiniciada pelo Compact.
  O Manual Compact não tem entrada local à query e continua usando diretamente o history canônico.
- o recent-preserve do Compact mantém a fronteira existente: um assistant comum pode entrar no segmento preservado, e um
  transcript error carrier com `info.error` não entra no provider history. Quando o número de tentativas se esgota, o partial real e o error
  carrier são persistidos separadamente, portanto não é preciso estender as regras de classificação de mensagens do Compact.
- a cadeia de recuperação é tratada como um Turn atômico: uma atualização de modelo, idioma ou output-style dentro da cadeia não reescreve o prefixo local à query atual; se a atualização for
  concorrente com um Compact local ao turn, o Compact preserva o prefixo canônico já atualizado ao gravar o history canônico, de modo que a mudança só
  passe a valer no próximo Turn independente.
- o transcript canônico continua salvando cada partial assistant real por requisição, e `TurnResult.response` continua retornando apenas a última
  response; a redução de exibição acontece somente na V4 ProductProjection. Apenas quando um `ModelComplete` carrega explicitamente
  `stopReason="length"`, `toolCallCount=0`, e o próximo corpo está no mesmo product turn e é visualmente adjacente ao `assistantText` anterior, a projeção reabre a row original e acrescenta
  diretamente, sem inserir quebra de linha. O `rowId` estável da row final não muda, e a identidade de message/action avança até o último assistant. tool, reasoning, user visível, timeline, product
  turn diferente, algo que não seja `length` e a ausência do fato de tool call preservam a segmentação original.

```text
p1 text ─ ModelComplete(length, tools=0) ─ p2 text ─ ... ─ p3 text
   │                    mesmo turn e adjacente                   │
   └──────── ProductProjection: mesma assistant row ──────┘

tool / reasoning / user / timeline / turn boundary
   └──────── ProductProjection: nova assistant row
```

### Esgotamento de tentativas e usage

Quando a 4ª resposta ainda atinge o output-limit, nenhuma 5ª requisição é enviada. Se a resposta tiver text ou reasoning real, ela é primeiro submetida como um
assistant comum sem `info.error`, junto com o usage real; em seguida, com um novo message ID, grava-se separadamente no transcript da Session um assistant somente de erro e o `step-finish`
correspondente. Se a resposta for totalmente vazia, grava-se apenas o carrier somente de erro.
Os `tokens` do carrier usam um placeholder de zeros, não podem se tornar um anchor de usage e não entram no provider history live nem cold-hydrated.
Ele usa diretamente a estrutura de assistant error existente: o código de erro estável vai em `error.name`, e
`data.message/retryable/attribution` restauram, respectivamente, o texto do erro, a recuperabilidade na UI e a origem no provider, sem estender as regras gerais de
hydration. O usage real em nível de requisição continua sendo registrado pelo `ModelComplete` e pela observabilidade de usage já existentes.
Depois disso, reutiliza-se o fechamento existente de `ModelError` / `TurnError` para exibir o erro na UI em tempo real, sem acrescentar `TurnComplete(success)`.
Esse erro encerra apenas o command do Turn atual, não cria um novo `CoreErrorType`, não encerra o Agent runtime nem o processo de CLI interativo,
e o texto de exibição do erro também não entra no provider history. Todos os output-limit reasons acima usam uniformemente o texto neutro
`The model's response exceeded the output token maximum.`.

A cadeia de recuperação não mantém nenhum snapshot de usage extra nem cursor absoluto de mensagem. Um
partial assistant com text, reasoning ou tool call reais é submetido ao history canônico e local à query junto com seus `tokens` normalizados; a próxima requisição continua
usando a varredura reversa existente, a partir do usage do assistant válido mais recente, e faz a estimativa incremental local apenas para mensagens como o Continue que vêm depois.
O output-limit vazio não gera assistant entry nem mensagem de transcript nos estados intermediários das três primeiras recuperações; quando as tentativas se esgotam, apenas o
assistant durable somente de erro descrito acima é mantido. Ele não sobrescreve o último usage válido nem entra no provider history, tanto no live quanto após a cold hydration; havendo partial
real, o assistant comum mantém o usage original e o carrier de erro independente continua com usage zero.
Depois que a recuperação termina, o Continue query-only desaparece naturalmente, e a próxima mensagem independente do usuário continua depois do assistant canônico mais recente,
portanto não é preciso reanclar nem limpar estado temporário de usage.
O Compact continua decidindo a linha de base válida pelos próprios assistant tokens dos post-compact entries, sem nenhuma lógica de invalidação específica para Continue.

### Limites da evidência automatizada

A automação do Continue é dividida em três camadas por responsabilidade, sem copiar a mesma matriz de estado para o Desktop:

- os testes de runtime do Core cobrem o normalized/raw reason, resposta vazia, partial de text/reasoning, o limite de três vezes, o esgotamento de tentativas,
  a separação entre partial assistant e carrier somente de erro, o isolamento de usage zero/provider do carrier e a recuperação de erro a frio, a prioridade entre streaming/non-streaming/tool, Abort, Guide/Stop Hook,
  notificações externas, o loop compartilhado entre Main/Subagent e a normalização unificada de output-limit raw-compatible para `length` live/durable.
- os testes focados de Compact cobrem o tratamento de Micro/Auto/Reactive sobre os entries locais à query e o fato de a contagem de recuperação não ser
  reiniciada pelo Compact; os testes existentes de Manual Compact continuam provando o caminho canônico padrão.
- o Agent E2E usa um provider local OpenAI-compatible roteirizado, passando pelo app do Bootstrap, pelo adapter real, pela requisição HTTP,
  pelo SessionStore e pela recuperação a frio, validando o wire exato do Continue, a ausência de uma 5ª requisição, a persistência do partial real, o assistant durable somente de erro
  no estado final esgotado, a continuidade no Turn/runtime seguinte e o fato de que nem esse carrier nem o Continue vazam para a requisição de recuperação a frio.
- o helper de E2E precisa aguardar a criação assíncrona do App e repassar `resume/sessionId`; as asserções de recuperação a frio confirmam a identidade da session e o histórico original,
  e não podem apenas verificar que a nova requisição não tem Continue. Os limites de context/output declarados pelo case precisam entrar no Provider Registry completo e válido,
  e o Output Option Map precisa escrever no corpo de requisição real conforme o protocolo; o case de Continue fixa 100.000 de context e 16.000 de output,
  e tanto a requisição normal de recuperação quanto a de recuperação a frio validam `max_tokens=16000`, sem que sejam sobrescritas pelos valores padrão genéricos do helper.
- os testes focados de ProductProjection validam o predicado estrito de reuso no live, o corpo acumulado, o anchor final de action/message e os
  casos negativos de fronteira; os testes focados de transcript hydration validam que um `assistant.info.finish="length"` persistido reconstrói o mesmo resultado a
  frio, sem injetar o user do Continue em eventos ou no protocolo.
- o Desktop OTC08 usa provider replay case-local e valida que três requicações principais reais resultam em apenas um bloco DOM de assistant acumulado; esse case manual-review
  pendente não entra no gate de conversation padrão antes da promoção confirmada.
- o Desktop OTC11 faz a mesma emenda de Markdown do OTC09 passar tanto pelo Chat Completions quanto pela Responses API, validando que os dois
  protocolos padrão são normalizados como `length`, disparam a mesma cadeia de Continue e formam um bloco DOM de assistant acumulado.
- o wire test do adapter OpenAI-compatible fixa separadamente o `finish_reason=max_tokens` não padrão do Chat correspondendo a
  normalized `other` e `rawFinishReason=max_tokens`, evitando que os cases de protocolo padrão do Desktop confundam entrada compatível.
- o wire test da Anthropic acrescenta apenas a verificação do texto exato após a serialização de users adjacentes; não é preciso copiar o ciclo de recuperação completo para cada provider BYOK.

O Continue não forma uma nova user row, evento de protocolo, delivery state ou caso especial em React. O desktop `continuous` e o mobile
`replayable` consomem o mesmo resultado de ProductProjection do servidor; o mapeamento genérico do `TurnError` em tempo real para a projeção de produto existente continua
sendo responsabilidade dos testes de projeção de erro do Bootstrap.

## Runtime child derivado

O Subagent herda a estratégia de context-budget fixada na criação do runtime pai; depois que o `childModelRef` real é determinado,
o `contextWindow` e o `maxOutputTokens` do modelo correspondente são resolvidos a partir do runtime catalog/overlay atual, e o child runtime é então
construído pela mesma fórmula de fallback de 32K.
O refresh do registry só afeta os children criados depois disso; um child já em execução não muda de orçamento dinamicamente.

Workflow children comuns e script workflow children são criados pelo `runtimeConfig` do runtime main pai, portanto também
herdam a estratégia de context-budget fixada na criação do runtime pai; eles não pedem strategy ao Host separadamente nem fazem
hot switch em execução. Esta política não altera o restante do ciclo de vida, da seleção de modelo nem do comportamento de ferramentas dos workflow children.

## Recuperação de Context exceeded

O Adapter reconhece, no Error, no `cause` e no corpo de resposta JSON padrão, os erros de contexto excedido explicitamente reportados pelo provider.
Tanto o `error.code` quanto o `error.message` do corpo de resposta padrão são entradas de reconhecimento; não se pode ler apenas o
`APICallError.message` externo, porque a camada de compatibilidade frequentemente escreve o externo de forma unificada como `Bad Request`.

Atualmente só são catalogadas as formas que, na documentação oficial ou em repositórios oficiais, podem ser distinguidas de forma estável de outros erros 400/422:

| Fonte                             | Sinal reconhecível                                                                                       |
| -------------------------------- | ------------------------------------------------------------------------------------------------ |
| OpenAI-compatible / Azure OpenAI | codes de contexto já existentes como `context_length_exceeded`; ou o texto explícito de limite de tokens de `maximum context length` |
| Anthropic                        | `prompt is too long`; stop reason/code já existente `model_context_window_exceeded`                      |
| Google Gemini                    | `input token count ... exceeds the maximum number of tokens allowed`                             |
| Alibaba Cloud Model Studio       | `Range of input length should be [1, ...]`; `Total message token length exceed model limit`      |
| BigModel                         | code de negócio existente do provider `1261`                                                               |

Fontes:

- [OpenAI Responses API](https://developers.openai.com/api/reference/resources/responses/methods/create)
- [Anthropic context window overflow behavior](https://platform.claude.com/docs/en/build-with-claude/context-windows#context-window-overflow-behavior)
- [Azure OpenAI Chat Completions context error](https://learn.microsoft.com/en-us/azure/foundry/foundry-models/concepts/models-sold-directly-by-azure)
- [Google Gemini CLI official repository issue #10199](https://github.com/google-gemini/gemini-cli/issues/10199)
- [Alibaba Cloud Model Studio error codes](https://help.aliyun.com/en/model-studio/error-code)
- [Mistral known limitations](https://docs.mistral.ai/resources/known-limitations)
- [DeepSeek error codes](https://api-docs.deepseek.com/quick_start/error_codes/)
- [MiniMax error codes](https://platform.minimaxi.com/docs/api-reference/errorcode)
- [Amazon Bedrock runtime errors](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html)

O OpenAI Responses, com o truncamento automático desativado, apenas promete que um overflow retorna `400`, sem fornecer um conteúdo de erro dedicado e estável; a Mistral
também só descreve o `400 Bad Request` genérico, a DeepSeek só lista `400 Invalid Format` /
`422 Invalid Parameters` genéricos, e o Amazon Bedrock só dá `ValidationException` / `400` genéricos. Esses códigos de status
não podem ser distinguidos de forma estável de outras requisições inválidas, portanto não há fallback por código de status. O `1039` da MiniMax pode significar ao mesmo tempo o limite de saída
`max_tokens` e também não é classificado diretamente como overflow de contexto.

Após o match, o resultado continua classificado como `ModelContextExceeded` e entregue à cadeia de retry reativa de compact da core, no máximo uma vez por model-step; um novo model step só reabre após um lote completo de tool results:

```text
provider error
      |
      v
adapter context signal classifier
      |
      +-- sem match --> classificação 400/422 existente
      |
      `-- com match --> ModelContextExceeded
                         |
                         v
                  reactive compact
                         |
                         v
                 replay current model step
```

Esse caminho de recuperação reaproveita o circuito de rápido refill do módulo de compact e não adiciona ao adapter outro conjunto de retries ou de estado de compactação.

## Restrições

- o Option Spec da Effective Model Config declara o limite de saída; a cadeia de execução calcula o orçamento em nível de requisição a partir desse limite, e o ModelSelection não armazena orçamento de saída.
- a Rule geral do Built-in fornece os valores padrão completos; se 32K for usado como padrão, ele só pode ser declarado nessa Rule, nunca como fallback no caminho da requisição.
- a requisição principal, o Target Completion Verification, o Auto Compact e o Microcompact usam o mesmo
  valor efetivo.
- o summary do Compact usa `min(effective, 20_000)`.
- as diferenças de campo do Provider são expressas apenas pelo `map` do Effective Option Spec atual e não alteram o resultado do orçamento genérico.
- todos os Option Maps são executados na fronteira do corpo JSON final da requisição e antes da validação de segurança da versão oficial.
- apenas nas preferências de protocolo de runtime de session já existentes é adicionada uma strategy opcional, com ausência defaultando para `preflight-v1`; não há nova
  capability pública, entrada de Settings nem variável de ambiente global.
- a conclusão de resposta vazia que não seja de output-limit, o número existente de compactações reativas, o reconhecimento de erros e as outras retentativas automáticas permanecem inalterados.
- `legacy` é mantido apenas como compatibilidade de entrada de protocolo, sem ramo de algoritmo em runtime.