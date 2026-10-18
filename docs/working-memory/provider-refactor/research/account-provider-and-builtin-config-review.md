# Relatório de Pesquisa sobre Account Provider e Built-in Provider Config

> Data: 2026-08-28
>
> Status: conclusões da pesquisa; os itens determinados já entraram na revision 4 do Built-in Provider Config
>
> Base de design: [`zcode-builtin-provider-config.md`](../design/registry/zcode-builtin-provider-config.md)

## 1. Escopo e Conclusões

Este documento registra a reverificação, após o Provider Refactor, das seguintes questões:

1. se a página de Account Provider sofreu alguma regressão inesperada em relação ao staging;
2. se os membros de modelos Provider e as Model Config Rules do Built-in Provider Config estão completos e se os fatos são confiáveis;
3. como devem ser divididas as responsabilidades entre Model, API Schema, Endpoint e Provider Exact Rule;
4. quais modelos cada Built-in Provider habilita por padrão e como a ordem do arquivo deve ser mantida.

As conclusões são:

- O Team Plan chegou a não conseguir exibir detalhes de modelos porque o item de navegação carregava o objeto do Individual Provider; esse era um Bug de projeção de identidade da UI, e não uma
  mudança no design do Account Overlay ou do Provider Config, e já foi corrigido em trabalhos posteriores.
- Os membros Built-in em geral podem ser resolvidos por regras genéricas, mas “pode resolver” não é igual a “fato preciso”. Ainda é preciso calibrar sistematicamente os membros de modelos por Provider, os três
  API Schema, as diferenças de Endpoint e o conjunto habilitado por padrão.
- O Model Config tem apenas dois tipos de Rule, `match` e `provider-model`. Built-in/Personal é Source, não um terceiro tipo de Rule.
- A hierarquia das Built-in Rule é a ordem física de escrita do arquivo e o modelo mental de revisão; não se adiciona priority, specificity nem ordenação dinâmica.
- Fatos genéricos de modelos não GLM devem ser expressos preferencialmente por `model + api.type`; diferenças de linha de serviço são expressas por
  `model + api.type + baseURL`. Uma Match Rule de escopo de Provider carrega apenas fatos de serviço válidos para todos os membros, enquanto
  uma Provider-Model Exact Rule carrega apenas o `enabled` padrão e fatos de produto estreitos de uma combinação individual.
- O nome de alvo do campo de capacidade de JSON Schema estrito é `supportsJsonSchemaOutput`. JSON comum ou JSON Object Mode não podem servir como
  evidência para esse campo ser `true`.
- O `builtinModelIds` dos Built-in Providers coloca os modelos habilitados por padrão primeiro no arquivo de publicação; isso não é uma funcionalidade de ordenação em runtime nem sobrescreve
  o `modelOrder` Personal.
- Os membros estáticos dos Individual/Team Coding Plan ganharam `GLM-5.3`, e a ordem física é fixa como
  `GLM-5.3`, `GLM-5.3-Flash`, `GLM-5.2`, `GLM-5-Turbo`.
- As requisições de modelo dos Plan Start/Individual/Team primeiro têm Image/Video convertidos em texto por um modelo de visão do servidor, e por isso todos os membros de modelo desses Plan Providers
  declaram entrada Image/Video; a Account API comum não herda essa capacidade de serviço.

## 2. Reverificação do Account Provider

### 2.1 Problema Histórico

O Provider Refactor separou Individual e Team em identidades de Provider distintas. A UI antiga, ao gerar o item de navegação do Team, substituía apenas o
`presetId`, mas continuava carregando o objeto do Individual Provider:

```text
Team 导航项
├─ presetId = account:*:team-coding-plan
└─ provider.providerId = account:*:individual-coding-plan
                    |
                    v
Detail 身份校验不相等
                    |
                    `-- 只显示套餐状态，不显示 Team 模型详情
```

O limite correto é: o estado do plano e a cota vêm do entitlement do Team; a API do Provider, os membros de modelo e os objetos de edição de modelo vêm do
Effective Team Provider de mesmo ID; a edição de modelo continua escrevendo apenas a Personal Model Config Rule. Não se pode voltar à identidade antiga de
“Team reutilizando o Individual Provider”.

### 2.2 Relação com a Pesquisa do Built-in Provider Config

O Account Overlay continua restringindo o Built-in Account Provider correspondente:

- `enabled` expressa se o Provider está disponível na conta atual;
- o conjunto de modelos retornado pelo Start Plan pode restringir os membros de modelo desse Provider;
- o conjunto de modelos retornado pela Account não reescreve as ZCode Built-in Model Rules;
- o Personal Provider Config e as Personal Model Rules continuam por fim sobrescrevendo as folhas de configuração que têm permissão para sobrescrever.

Portanto, problemas na página de Account não alteram as regras de escrita do Built-in Provider Config descritas adiante.

## 3. Estrutura Atual do Built-in Config

O `config/provider/zcode-builtin.json` atual contém atomicamente o Provider Map e as Model Config Rules, cobrindo três API Schema:

- `anthropic-messages`
- `openai-chat-completions`
- `openai-responses`

Na auditoria da revision 2 havia 21 Providers e 120 Model Rules, e ainda não havia Rule `baseURLMatch`. A revision 3 já passou a incluir os modelos atualmente
em destaque, a especialização por Endpoint e o enabled exato por Provider-Model; a baseline genérica continua fornecendo valores completos e conservadores para
Personal Models desconhecidos, mas os fatos específicos de modelos ainda apresentam os seguintes riscos de manutenção:

1. uma certa família cobre apenas um ou dois Schemas, e o terceiro Schema acaba herdando o valor genérico por acidente;
2. o site oficial só comprova JSON Object, mas isso é lido indevidamente como JSON Schema estrito;
3. as capacidades do mesmo modelo no Endpoint oficial e em um Endpoint compatível de terceiro são combinadas de forma errada;
4. modelos antigos, aliases e os modelos em destaque atuais herdam todos `enabled=true`;
5. a ordem dos membros de modelo do Provider não é mantida em sincronia com o estado de habilitação padrão.

## 4. Modelo de Escrita de Rules

O arquivo Built-in é mantido na seguinte ordem física:

```text
Complete Baseline Match Rule
          |
          v
Model Match Rule
          |
          v
Model + API Match Rule
          |
          v
Model + API + Endpoint Match Rule
          |
          v
Provider-scoped Match Rule
          |
          v
Provider-Model Exact Rule
```

As responsabilidades de cada camada são:

| Camada                          | Fato principal                                                             |
| ------------------------------- | -------------------------------------------------------------------------- |
| Complete Baseline               | valores padrão completos e conservadores para Personal Model desconhecido    |
| Model Match                     | fatos do modelo que não mudam por linha, como context, max output e formatos de entrada/saída |
| Model + API Match               | Tool, JSON Schema, MCS, Options e reasoning mapping sob o Schema           |
| Model + API + Endpoint Match    | diferenças comprovadas do mesmo Schema em um Endpoint oficial ou compatível específico |
| Provider-scoped Match           | capacidades de serviço válidas para todos os membros atuais/futuros do Provider |
| Provider-Model Exact            | enabled padrão e fatos de produto de uma combinação individual de Provider-Model |

Isso é apenas a especificação de autoria do JSON Built-in. O Resolver ainda percorre na ordem física do array, e a folha explícita encontrada depois cobre a anterior; ele não calcula qual Rule
é “mais específica” nem implementa prioridade adicional.

Modelos não GLM normalmente não precisam de uma Provider-Model Exact Rule para repetir capacidades de requisição. Se dois Providers apontam para o mesmo API Schema e
Endpoint, eles devem obter naturalmente o mesmo conjunto de fatos de Endpoint. Somente capacidades de serviço que não podem ser distinguidas pelo Endpoint e que valem para todos os membros atuais/futuros do
Provider entram em uma Provider-scoped Match Rule; Exact Rules só aparecem na habilitação padrão ou em diferenças reais de produto de uma combinação individual.

## 5. Determinação de Campos de Capacidade

### 5.1 Saída com JSON Schema

Campo alvo:

```ts
properties.supportsJsonSchemaOutput: boolean;
```

Ele indica apenas que o Effective Model atual consegue receber `ModelRequest.responseJsonSchema` e que o Adapter/API/Endpoint atual codifica isso como
uma restrição de JSON Schema estrito na saída. As seguintes evidências não são suficientes:

- o prompt pedir que o modelo produza JSON;
- haver suporte apenas a `response_format={type:"json_object"}`;
- o site oficial escrever genericamente “Structured Output”, sem corresponder ao Schema/Endpoint atual;
- um Endpoint compatível diferente ter sucesso.

### 5.2 MCS

`supportsMidConversationSystem` indica que o Adapter e o Endpoint atuais conseguem codificar de forma confiável uma mensagem de sistema no meio da conversa; não diz respeito a o modelo
ser “inteligente” nem a marketing de fabricante. Deve ficar em Model + API ou Model + API + Endpoint Rule, e não pode ser ligado por bom senso conforme a família do modelo.

### 5.3 Cobertura dos Três Schemas

“Cobrir os três Schemas” significa que cada modelo mantido tem um resultado de resolução explícito e auditável nos três Schemas. Não significa que o Endpoint oficial do fabricante
precise suportar nativamente os três protocolos. Quando o oficial não oferece um protocolo, pode-se deixar um resultado conservador para Endpoints compatíveis de terceiros, mas capacidades de alto risco permanecem false
até haver documentação oficial ou evidência de um Endpoint reproduzível.

## 6. Pesquisa por Família de Modelos

As evidências são divididas em três categorias: confirmado oficialmente, confirmado pelo produto e Endpoint a ser verificado. A classificação das evidências entra apenas no material de revisão, e não no Config de runtime.

### 6.1 GLM / BigModel / Z.ai

Os modelos atualmente em destaque do produto são confirmados como:

- `glm-5.3`
- `glm-5.3-flash`

O conteúdo público do site oficial pode ainda estar em versões antigas, o que é um atraso de material público e não permite, com base nisso, julgar o 5.3 como suspeito ou
reservado apenas a testes internos. 5.3/5.3 Flash devem ser mantidos como os modelos em destaque atuais “confirmados pelo produto”. Se `GLM-5.2` faz parte dos membros de modelo do
Coding Plan Provider é decidido pelo Account Overlay correspondente e pelo Built-in Provider Config, e não deve substituir por via reversa o modelo 5.3 em destaque da API GLM comum.

A visão geral oficial atual de modelos da BigModel lista `GLM-5.3` como o modelo de texto flagship, lista `GLM-5.3-Flash` como o modelo multimodal nativo e deixa explícito que o
Flash entende imagens e vídeo nativamente; os exemplos de imagem e vídeo da documentação de Chat Completion também usam o Flash. Portanto, os fatos nativos da Account API comum são:

| Modelo          | Image | Video | Evidência       |
| ------------- | ----- | ----- | --------------- |
| GLM-5.3       | false | false | texto oficial  |
| GLM-5.3-Flash | true  | true  | multimodal oficial |

`glm-5v-turbo` e `glm-5-turbo` não são uma relação de faixa de velocidade. O `V` da primeira significa Vision e é um modelo multimodal Text/Image/Video/File voltado a Coding/GUI Agent
orientado a visão; o segundo é um modelo Agent Text-only otimizado para execução de cadeia longa no OpenClaw, chamadas de ferramenta e tarefas contínuas. As especificações oficiais atuais de ambos são 200K
de context e 128K de max output, e devem ser mantidos como dois modelos especializados paralelos, sem que se sobrescrevam capacidades por terem
ambos `Turbo`.

Start, Individual e Team Plan têm fatos de produto adicionais: a requisição primeiro tem Image/Video convertido em texto por um modelo de visão do servidor, de modo que todos os membros de modelo dos Plan
Providers podem receber esses dois tipos de entrada visual. Essa é uma capacidade de serviço do Provider, e não altera o fato nativo do modelo GLM-5.3,
nem infere Audio/PDF.

A ordem dos membros estáticos de Individual e Team é fixa como:

```text
GLM-5.3
GLM-5.3-Flash
GLM-5.2
GLM-5-Turbo
```

Os membros do Start Plan continuam sendo restringidos dinamicamente por `billing/balance` no Account Overlay; esta rodada não adiciona 5.3 estaticamente no Built-in Provider Config
substituindo o upstream,
mas, quaisquer que sejam os membros retornados pelo upstream, a capacidade de serviço Image/Video dos Plan Providers deve ser aplicada.

No caminho real de produto do App oficial em um MacBook Air, os seguintes testes reais foram concluídos com uma captura de tela da página de configurações
contendo a lista de Providers, a lista de modelos e uma seta vermelha:

| Forma de conexão                    | Modelo          | Resultado                                                                    |
| ----------------------------------- | --------------- | ---------------------------------------------------------------------------- |
| BigModel Team Coding Plan           | GLM-5.3-Flash   | identificou corretamente a lista de Providers e apontou a seta para `glm-5.3-flash` |
| BigModel Team Coding Plan           | GLM-5.2         | identificou corretamente a lista de Providers e apontou a seta para `glm-5.3-flash` |
| BigModel Account API（API Key）     | glm-5.3         | a requisição não gave erro, mas foi confirmado que a API de modelo não consome conteúdo visual |
| BigModel Account API（API Key）     | glm-5.3-flash   | a imagem foi recebida normalmente; o Agente identificou corretamente a lista de Providers e a seta |

O resultado de GLM-5.2 no Team Plan é coerente com o fato de produto de que “o serviço do Plan oferece transcrição visual unificada”. A Account API comum, por outro lado, já teve
confirmada a ausência de capacidade visual: a interface aceita uma requisição com imagem sem dar erro, o que indica apenas que o servidor tolera ou ignora o conteúdo,
e não que o modelo consumiu a imagem. Por isso, os fatos nativos do Model Config continuam mantidos conforme a documentação oficial: `GLM-5.3` permanece com entrada de texto e
`GLM-5.3-Flash` declara Image/Video.

Anteriormente, usar diretamente as chaves comum, Individual e Team do cache em disco para fazer requisições retornava HTTP 401; os logs de execução provaram depois que o App oficial usa o Team
Project Key atualizado em runtime e que o valor em disco já estava expirado. Esse 401 não pode servir como evidência de capacidade de modelo nem serve para refutar os testes reais do App oficial acima.

Ainda é preciso continuar conferindo contra Endpoints reais:

- context, max output, Image/Video, Tools e capacidades nos três Schemas de 5.3/5.3 Flash;
- diferenças de MCS, JSON Schema e parâmetros de reasoning entre os Endpoints Z.ai, BigModel e Coding Plan;
- se `glm-5v-turbo` ainda é habilitado por padrão como um modelo visual distinto;
- Model IDs com diferenças de caixa não devem ser usados para identidade de requisição a ponto de fazer os fatos do mesmo modelo divergirem.

Referências: [Visão geral de modelos BigModel](https://docs.bigmodel.cn/cn/guide/start/model-overview)、
[Z.ai Chat Completion](https://docs.z.ai/api-reference/llm/chat-completion)、
[Parâmetros principais do Z.ai](https://docs.z.ai/guides/overview/concept-param).

### 6.2 Kimi

O Built-in Provider Config atual contém simultaneamente K3, K2.x e Moonshot V1. O material atual da Kimi já mostra K3, K2.7 Code e
K2.6; K3 tem 1M de contexto e K2.7 Code/K2.6 têm 256K. Os membros de modelo atuais do Provider estão sem K2.7 Code, e é preciso confirmar se aliases como `k3` e
`k3-256k` são IDs de Endpoint reais.

A Kimi Chat API já oferece evidência de formato de resposta na forma `json_schema`, o que permite habilitar JSON Schema estrito na Rule oficial de API/Endpoint correspondente;
isso não pode se propagar automaticamente para outros protocolos compatíveis.

Referências: [Página inicial de modelos Kimi](https://platform.kimi.ai/)、[Kimi Chat API](https://platform.kimi.ai/docs/api/chat)。

### 6.3 MiniMax

A API direta pública atual da MiniMax tem o M3 como o mais novo em destaque e continua oferecendo M2.7/M2.7-highspeed. A documentação oficial de chamada de modelo da região chinesa dá explicitamente
exemplos de chamada do M3 em `https://api.minimaxi.com/anthropic` e `https://api.minimaxi.com/v1`, portanto ele precisa ser
o primeiro membro habilitado por padrão do MiniMax Built-in Provider. O M3 tem 1M de context e é Text/Image/Video nativo; a série M2.7 tem
204800 de context e continua habilitada por padrão como uma faixa de velocidade diferente.

O julgamento anterior de que o “Endpoint direto ainda não prova o M3” veio de uma visão geral de interface desatualizada e de exemplos da documentação da Models API, e já foi
refutado pela documentação atual de chamada de modelo. As respostas de exemplo da Models API só provam o formato do protocolo; o que realmente vale para a validação de membros é
uma resposta de sucesso ao vivo com o material de acesso atual.

Referências: [Geração de texto MiniMax](https://platform.minimaxi.com/docs/guides/text-generation)。

### 6.4 DeepSeek

O `deepseek-v4-flash` e o `deepseek-v4-pro` do Built-in podem continuar como as duas faixas de produto atuais. A documentação oficial de Responses hoje lista explicitamente
apenas o Flash, de modo que as capacidades de Responses e JSON Schema do Pro precisam ser verificadas de forma independente e não podem ser copiadas do Flash.

Referências: [DeepSeek Responses API](https://api-docs.deepseek.com/api/create-response/)。

### 6.5 Qwen

O Built-in Provider Config atual tem como destaque o Qwen 3.5 Plus/Flash, mas a lista pública de modelos da Alibaba Cloud já traz Qwen 3.7/3.8, e é preciso primeiro fazer uma
decisão de atualização dos membros de modelo do Provider.
As capacidades de 1M de context, 64K de output, Text/Image/Video e Tool do Qwen 3.5 Plus/Flash têm base oficial. O JSON Schema estrito
cobre apenas parte dos modelos; o suporte a JSON Object tem um escopo maior, e os dois não podem ser confundidos.

Referências: [Capacidades de modelos de visão do Qwen](https://help.aliyun.com/en/model-studio/vision-model/)、
[Qwen Structured Output](https://help.aliyun.com/en/model-studio/qwen-structured-output)。

### 6.6 MiMo

MiMo v2.5/v2.5-pro é o atual em destaque, e o oficial dá 1M de context e 128K de output; os antigos v2-pro/v2-omni/v2-flash já anunciaram
descontinuação em 2026-06-30 e devem permanecer, quando mantidos, como disabled por padrão. O material atual de saída estruturada só é suficiente para provar JSON Object, portanto, sem evidência de Schema
estrito, `supportsJsonSchemaOutput` permanece false. Web Search é uma capacidade de Endpoint/Plugin e não deve ser escrita como um fato global do modelo.

Referências: [Visão geral de modelos MiMo](https://mimo.mi.com/docs/en-US/quick-start/model)。

### 6.7 OpenAI

Sol/Terra/Luna oferecem faixas de capacidade e custo diferentes, e o material oficial atual indica cerca de 1.05M de context, 128K de output e suporte a Image, Tools
e Structured Output. O `gpt-5.6` genérico é um alias que aponta para Sol e não deve ser habilitado por padrão ao mesmo tempo que Sol, para evitar entradas duplicadas.

Referências: [OpenAI Models](https://developers.openai.com/api/docs/models)。

### 6.8 Anthropic

Fable, Opus, Sonnet e Haiku são faixas de produto com capacidades/custos diferentes e não devem ser removidas apenas por “manter apenas o mais recente”. No material atual,
os três primeiros são 1M/128K e o Haiku é 200K/64K; cada faixa pode ser habilitada por padrão de forma independente.

Referências: [Anthropic Models](https://platform.claude.com/docs/en/about-claude/models/overview)。

### 6.9 xAI

Grok 4.6 é o destaque genérico atual, com 500K de context, Image, Tools e base de Schema estrito; Grok Build é uma faixa de Coding distinta e pode
permanecer habilitada por padrão; Grok 4.3, como modelo antigo, fica disabled por padrão.

Referências: [Grok 4.6](https://docs.x.ai/developers/models/grok-4.6)、
[xAI Structured Outputs](https://docs.x.ai/developers/model-capabilities/text/structured-outputs)。

## 7. Resultado da Habilitação Padrão da revision 4

Os itens determinados a seguir já foram escritos no Config; membros não provados diretamente por um Endpoint oficial ou já substituídos permanecem como disabled, disponíveis para uso Personal/serviços compatíveis.

| Família de Provider | Candidatos a enabled por padrão                                                   | disabled por padrão / a confirmar                          |
| ------------- | ---------------------------------------------------------------------------- | ------------------------------------------------- |
| GLM API       | `glm-5.3`、`glm-5.3-flash`、`glm-5v-turbo`                                   | antigos 5.1/5/4.x                                 |
| Coding Plan   | Individual/Team: 5.3, 5.3 Flash, 5.2, 5-Turbo; Start é definido pelo conjunto retornado pela Account | sem usar regra estática para ampliar o conjunto de contas Start |
| Kimi          | faixas distintas ainda presentes no Endpoint atual entre K3, K2.7 Code e K2.6 | antigos K2.x, Moonshot V1, aliases duplicados      |
| MiniMax       | M3、M2.7、M2.7-highspeed                                                     | M2.x mais antigos                                   |
| DeepSeek      | `deepseek-v4-flash`、`deepseek-v4-pro`                                       | Schema estrito é promovido apenas pela Rule oficial de Responses Endpoint |
| Qwen          | `qwen3.8-max`、`qwen3.8-flash`                                               | modelos 3.5/3.x substituídos                        |
| MiMo          | `mimo-v2.5-pro`、`mimo-v2.5`                                                 | v2-pro/v2-omni/v2-flash já aposentados              |
| OpenAI        | Sol/Terra/Luna                                                               | alias `gpt-5.6`, modelos Codex substituídos         |
| Anthropic     | Fable/Opus/Sonnet/Haiku, cada faixa distinta                                  | sem duplicatas explícitas                            |
| xAI           | `grok-4.6`、`grok-build-0.1`                                                 | `grok-4.3`                                          |

Na escrita final, o `builtinModelIds` de cada Provider tem sua ordem física ajustada para “enabled por padrão primeiro, disabled por padrão depois”; o runtime não
adiciona ordenação enabled-first, e a ordenação do usuário continua sendo responsabilidade apenas do Personal `modelOrder`.

## 8. Ordem de Implementação Recomendada

1. chamar primeiro as Models API dos fabricantes, gerando um relatório de membros visíveis com o material de acesso e de diferenças de capability explicitamente devolvidas pela interface;
2. usar a API de verificação de modelos seguinte para gerar continuamente uma matriz medida de membros do Provider × três Schemas × Endpoint;
3. promover ou reverter item a item as capacidades de Endpoint que ainda são inferências conservadoras na revision 4;
4. renomear `supportsStructuredOutput` para `supportsJsonSchemaOutput` de uma só vez, sincronizando Config, Registry, Model, Runtime,
   Protocol, Settings e testes, sem manter campo duplo;
5. continuar completando as diferenças de Model + API + Endpoint que ainda não têm material oficial;
6. usar testes reais de integridade do Built-in Config e testes de integração dos Adapters dos três Schemas para provar os resultados seguintes.

Qualquer questão que exija mudar o Account Overlay, a propriedade dos membros de modelo, a ordem das sobrescritas Personal ou a semântica de seleção do Runtime precisa de uma decisão
separada e não pode ser modificada de passagem durante a calibração do Built-in Provider Config.

## 9. Resumo de Impacto da Implementação Seguinte

Os níveis de mudança são principalmente `option-source`, `draft-default`, `validation` e `persistence`; não alteram a seleção de modelos, conversas, filas nem
semântica de recuperação.

| Superfície                    | Origem de exibição/padrão                   | Ponto de gravação/envio pelo usuário ou publicação        | Limites que precisam ser mantidos                          |
| ------------------------ | --------------------------------- | -------------------------------------- | --------------------------------------- |
| Página de configurações do Built-in Provider | Effective Provider + Model Config | Personal Overlay                       | não reescrever o Built-in Release                 |
| Página de configurações do Account Provider  | Built-in + Account + Personal     | Personal Overlay; fatos da conta continuam vindos da Account | identidades e membros de Team/Individual não se misturam        |
| Página de configurações do Personal Provider | Regras Built-in genéricas + Personal    | Personal Provider/Model Rules          | o Personal Model também obtém a baseline genérica completa e conservadora     |
| Seletor de modelo comum           | projeção selecionável do Registry | Session Selection                      | apenas filtra e preserva a ordem dos membros, sem reordenar por enabled |
| Runtime / Adapter        | Active Model já congelado               | Model API Request                      | não volta a inferir capacidades por modelId ou Provider ID    |

A capacidade de entrada dos Plan Providers chega ao Runtime pela única cadeia de fatos:

```text
Built-in Model 原生事实
          |
          v
Plan Provider-scoped Match Rule
          |
          v
Effective Model Config
          |
          v
Active Model.properties.input_format
          |
          v
Adapter 媒体检查与编码
```

O Runtime não verifica Plan ID, modo de Access nem nome do modelo; ele só lê as Properties finais do Active Model.

Seeds de implementação que precisam ser verificados:

- `config/provider/zcode-builtin.json`: membros do Provider, ordem física e Built-in Rules;
- `ModelConfigRules.composeEffective()` / `ModelConfigRules.resolve()`: composição por ordem e resolução de matcher;
- `packages/provider/src/resolver.ts`: integridade do Effective Provider/Model e entrada do Registry;
- `packages/provider-node/test/zcode-builtin-integrity.test.ts`: evidência de fatos reais do Built-in Provider/Model Config;
- `packages/ui/src/settings/model-provider-section/`: preview de valores padrão, sobrescritas Personal esparsas e edição de modelo;
- testes de requisição de `responseJsonSchema`, Tool, MCS e reasoning em cada Adapter.

O drift atual do Graph já foi incorporado ao Feature Graph: a ordem física de escrita das Built-in Rule, a camada de Endpoint e o “não adicionar specificity dinâmica”
tornaram invariantes explícitas do Provider Registry. Uma implementação seguinte que ajuste apenas o Built-in Config não deve tocar em Desktop continuous, Mobile
replayable, workspace identity, filas nem recuperação de tarefas.

### 9.1 Limites Desta Rodada e Casos de Aceitação

| Caso            | Setup                            | Asserção                                        | Status    |
| ---------------- | --------------------------------- | --------------------------------------- | -------- |
| ACCOUNT-PLAN-001 | Individual Provider do Z.ai/BigModel | ordem dos membros é 5.3, 5.3 Flash, 5.2, 5-Turbo | accepted |
| ACCOUNT-PLAN-002 | Team Provider do Z.ai/BigModel       | ordem dos membros é 5.3, 5.3 Flash, 5.2, 5-Turbo | accepted |
| ACCOUNT-PLAN-003 | qualquer membro de Start/Individual/Team | Effective input suporta Image/Video        | accepted |
| ACCOUNT-PLAN-004 | Account API comum + GLM-5.3        | o fato nativo permanece texto; não dar erro não é visualizar suporte visual  | accepted |
| ACCOUNT-PLAN-005 | Account API comum + GLM-5.3-Flash  | Image/Video nativos; imagens do ZCode funcionam ponta a ponta  | accepted |
| ACCOUNT-PLAN-006 | Team Plan + GLM-5.2/5.3 Flash     | capturas semânticas são compreendidas corretamente                | accepted |
| ACCOUNT-PLAN-007 | Account API comum carregando imagem         | o serviço tolera, mas o modelo não consome conteúdo visual        | accepted |

Não entram nesta rodada: ponto de entrada de codificação de requisição de Audio/PDF, se o upstream do Start adicionará 5.3, se o Off-Peak reutiliza a transcrição visual, o ciclo de vida de entitlement/credenciais da Account,
nem a semântica de conversas e recuperação. O MiMo v2.5 já registra Audio como fato estático de entrada conforme o site oficial, mas isso não dispara a projeção de conteúdo de Audio não implementada nesta rodada.