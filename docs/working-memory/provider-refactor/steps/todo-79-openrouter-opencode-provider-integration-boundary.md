# Todo 79：Fronteira de integração do Provider OpenRouter / OpenCode e a base existente

> Status: concluído (primeira rodada de integração dos Builtin Templates)
>
> Data: 2026-09-04
>
> Origem: migrado da seção OpenRouter/OpenCode Zen do Todo 22; o Todo 22 continua sendo responsável pelos outros Providers, como Azure, Volcano Ark e AWS Bedrock.

## 1. Base já existente

### OpenRouter Model ID

O Model ID do OpenRouter é salvo como string comum na estrutura `providerId + modelId`. IDs que contenham `/` ou `:free` (por exemplo `vendor/model:free`) não devem ser divididos em Provider, convertidos em slug nem reescritos. Os E2E existentes de modelos com dois-pontos do OpenRouter já cobrem essa fronteira de gravação e restauração.

### OpenRouter Attribution

`packages/shared/src/openrouter-attribution.ts` já identifica o OpenRouter pelo `baseURL` final: o protocolo precisa ser HTTPS e o host precisa ser `openrouter.ai` ou um subdomínio dele. Em caso de acerto, adiciona:

```text
X-OpenRouter-Title: ZCode
X-OpenRouter-Categories: programming-app
```

Essa infraestrutura cobre requisições de modelos, teste de conexão, requisições de commit do Repo Wiki/Git e os provider headers de bootstrap; isso não significa que o OpenRouter já concluiu a integração do Built-in Template.

### OpenCode Model ID

`packages/shared/src/opencode-model-id.ts` não tem relação com o OpenRouter. Ele apenas gera IDs de runtime estáveis para modelos customizados do OpenCode Agent:

```text
<provider-slug>-<provider-hash>/<modelName>
```

Usado para evitar colisões de Model ID entre modelos de Providers customizados diferentes.

## 2. Escopo da primeira rodada de integração do Built-in Template do OpenRouter

Os membros mantidos seguem como referência o [`Inventário de manutenção de Builtin Providers`](../design-v2/builtin-provider-inventory.md). O OpenRouter não integra apenas alguns modelos representativos, e sim cobre todos os modelos mantidos dos Templates de API comum de cada fornecedor desta tabela: um modelo upstream, desde que atualmente seja oferecido pelo OpenRouter, passa a integrar o Template do OpenRouter; Account Providers do mesmo fornecedor não são contados em duplicidade. Cada fornecedor tem pelo menos um modelo principal habilitado por padrão, os demais são de manutenção geral e vêm desligados por padrão. O OpenRouter continua não copiando seu próprio catálogo dinâmico completo: modelos fora do escopo de manutenção do ZCode continuam disponíveis ao usuário por meio de Providers customizados.

A lista de modelos do OpenRouter segue os modelos mantidos dos Templates de API upstream de cada fornecedor desta tabela. Um exemplo real de nomeação atual do OpenRouter é o Model ID upstream `gpt-5.6-sol` correspondendo a `openai/gpt-5.6-sol`; isso é apenas um fato sobre a associação e a nomeação de modelos do OpenRouter, não é um formato universal para todos os fornecedores agregadores, nem reutilização de configuração ou conversão de ID em runtime. O OpenRouter ainda precisa manter uma configuração própria de Model/API/Site para seus membros, porque um site agregador pode alterar campos de protocolo, capacidades e mapeamento de parâmetros.

O OpenRouter oferece simultaneamente entradas Chat Completions, Responses e Anthropic Messages. Seguindo o princípio unificado do projeto, os templates oficiais adotam uniformemente o protocolo Anthropic Messages, e o nome de exibição do template é `OpenRouter`. Na ausência de material explícito indicando que um certo modelo mantido não pode usar Anthropic Messages, assume-se por padrão que todos os modelos mantidos da lista suportam essa entrada; nesta rodada não se cria um Template separado do OpenRouter para Chat ou Responses, nem se divide ativamente por falta de documentação de protocolo em nível de modelo.

O material público confirma a existência das entradas, mas não fornece diretamente uma lista completa de "qual Schema cada modelo pode usar": a documentação de Chat Completions descreve que ela pode usar modelos oferecidos pelo OpenRouter, a documentação de Anthropic Messages lista semânticas Anthropic como PDF, ferramentas e `output_config`; a Models API fornece `supported_parameters` dos modelos, e há ainda uma interface para consultar endpoints por modelo. Nenhuma delas é uma matriz de modelo para Schema que possa substituir diretamente a validação de requisições. Portanto esta rodada adota uma hipótese de produto explícita: os modelos da lista entram uniformemente no Template Anthropic, e "a documentação não diz" não é interpretado como "não suporta". Somente no futuro, quando surgir uma contradição explícita, um Todo posterior discutirá outros Templates de Schema.

- Confirmar o Schema de API público, o Endpoint, a autenticação e os membros de modelos recomendados;
- Manter a semântica original dos Model ID que contêm `/` e `:free` em ModelSelection, Registry, Runtime e persistência;
- Confirmar os contratos de reasoning, tool call, JSON Schema, web search, usage e resposta em streaming da entrada Anthropic;
- Escrever as diferenças do site OpenRouter na Provider Site Config, sem codificar as capacidades do site agregador no baseline do Model;
- Concluir o smoke test do Template Anthropic e do teste de conexão com uma requisição real representativa; não decidir a divisão de templates com base em verificação modelo a modelo.

## 3. Escopo da primeira rodada de integração do Built-in Template do OpenCode Zen

Aqui, OpenCode se refere à API OpenCode Zen, não ao runtime do OpenCode Agent. O OpenCode Zen também entra no inventário de manutenção Builtin e cobre os modelos de cada fornecedor que ainda são válidos na tabela oficial de modelos; não se pode omitir outras marcas só porque já existe um modelo principal de determinada marca. Os níveis de manutenção principal/geral seguem o princípio global do Inventário de manutenção de Builtin Providers. A tabela oficial mostra que, sob a mesma Zen Base URL, coexistem:

```text
Responses              gpt-5.6-sol / gpt-5.6-terra / gpt-5.6-luna / série GPT
Anthropic Messages     claude-opus-5 / claude-sonnet-5 / qwen3.7-max etc.
OpenAI-compatible Chat kimi-k3 / deepseek-v4-* / minimax-m3 / glm-5.2 etc.
```

Atualmente a configuração de API do ProviderTemplate é de valor único. Seguindo o princípio unificado, os modelos Zen que podem usar Anthropic Messages entram preferencialmente em `opencode-zen-messages`; modelos que suportam apenas Responses ou apenas OpenAI-compatible Chat entram respectivamente em `opencode-zen-responses` ou `opencode-zen-chat`. Na implementação não se pode enfiar modelos de Schemas diferentes em um único template fixo, nem inventar primeiro um campo de API temporário por modelo; se mais tarde se descobrir que é obrigatório compartilhar um mesmo shell de site, um design de tipos específico será proposto à parte.
Os membros mantidos e a estratégia de habilitação padrão seguem o inventário: para cada marca upstream que entra no inventário, pelo menos um modelo vem habilitado por padrão; os demais modelos oficiais da mesma marca são de manutenção geral e vêm desligados por padrão.

- Confirmar o Schema de API, o Endpoint, a autenticação e o catálogo de modelos do OpenCode Zen;
- Separar a conversão de ID em runtime do OpenCode Agent da semântica de `modelId` do Provider Config;
- Confirmar os contratos de reasoning, tool call, JSON Schema, usage e resposta em streaming;
- Concluir o Built-in Template, o Access, o Model Config e a validação com requisições reais.

## 4. Fronteiras e não objetivos

- Atualmente só se registra o escopo de manutenção e a fronteira de integração, sem fingir que OpenRouter ou OpenCode Zen são Built-in Providers concluídos;
- Não reutilizar a conversão de Model ID em runtime do OpenCode para o OpenRouter;
- Não inferir as capacidades dos modelos do OpenRouter apenas porque existe attribution header;
- Não tratar neste Todo o Schema nativo do Google Gemini, Azure, Volcano Ark ou AWS Bedrock.

## 5. Relação com Todos anteriores

- As seções originais OpenRouter/OpenCode Zen do Todo 22 foram migradas para este Todo; o Todo 22 mantém o planejamento de integração independente dos outros Providers.
- A estratificação de Builtin Config do Todo 76 se aplica a este Todo: Model baseline → Model + API Schema → Provider Site → Template Model → Provider Model → Personal Provider Instance.

## 6. Base de evidências

- [OpenRouter Models](https://openrouter.ai/docs/guides/overview/models)
- [OpenRouter Models API](https://openrouter.ai/docs/api/api-reference/models/get-models)
- [OpenCode Zen](https://dev.opencode.ai/docs/zen)

## Registro de implementação (2026-09-04)

### Correção de nome (2026-09-15)

- Por solicitação do usuário, o nome em inglês do template OpenRouter foi unificado como `OpenRouter`, removendo o sufixo `(Anthropic)`; os cartões do template e os tooltips seguem o mesmo nome de configuração.
- A configuração de produção é a única fonte de edição, e a configuração de teste é gerada pelos scripts de sincronização existentes; não se alteram o ID de template `openrouter`, o protocolo Anthropic Messages, a URL, os modelos nem o mapeamento de inferência.
- Nomes pessoais já criados para fornecedores não são migrados nem renomeados; outros nomes de template, como o do OpenCode, permanecem inalterados.
- Verificação: as novas asserções de nome falharam primeiro em 2 casos; após a modificação, os testes unitários de contrato do OpenRouter passaram em 16 casos; a verificação do cartão e do tooltip passou nos dois casos do navegador Pro (tela estreita em tema claro em chinês / tela larga em tema escuro em inglês). O typecheck da raiz, o typecheck:e2e do Desktop e a verificação de sincronização de configuração passaram, com lint em 0 erros (42 avisos já existentes). O "pending" do navegador não substitui a aceitação completa por Electron/controle remoto de celular.
- Abaixo ficam preservados os registros históricos de nomenclatura da primeira implementação.

- Novo Template `openrouter` independente, fixado em `OpenRouter (Anthropic)` e `https://openrouter.ai/api`; os Model ID são salvos conforme a nomeação real do site agregador, sem remover o prefixo do fornecedor e sem reutilizar a configuração de Runtime do upstream.
- Novos Templates `opencode-zen-responses`, `opencode-zen-messages` e `opencode-zen-chat`, correspondendo às três entradas de protocolo do Zen; protocols diferentes do mesmo site não ficam mais misturados em um único ProviderTemplate.
- Os membros de modelo do OpenRouter e do OpenCode foram registrados conforme o inventário de manutenção: membros principais habilitados por padrão, os demais de manutenção geral e desligados por padrão; cada membro tem um registro `template-model` próprio e uma configuração mínima completa de limite de saída.
- Novo teste de integridade Builtin, confirmando a configuração de API independente, os membros de modelo e a ordem de Providers no Registry dos Templates agregadores; os testes de Node dos Providers relacionados passaram, e `pnpm typecheck` e `pnpm lint` passaram (0 erros).
- Esta integração não alterou a conversão de ID do runtime do OpenCode Agent nem mapeou as capacidades de configuração do site agregador como regras de reutilização de Provider upstream.