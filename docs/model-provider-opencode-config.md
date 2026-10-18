# Model Provider OpenCode Config

## Status

> Nota sobre implementação histórica, substituída pelo design Config/Registry/ModelFactory do Provider Refactor. O
> `config.json`, o Runtime Model e o Registry Snapshot descritos aqui servem apenas para entender o código anterior à migração, não
> representam o estado atual.
> O design atual está em `docs/working-memory/provider-refactor/design/`.

Esse esquema histórico chegou a substituir o catálogo `zcode.model-providers.v1` e o store `model-providers.v2.json`, e depois foi substituído
pelo esquema atual com `.zcode/v2/provider_config.json`, ZCode Built-in Release e um Registry próprio por Environment.

## Limites dos Arquivos

| Arquivo                                           | Semântica                                                                  |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `~/.zcode/v2/config.json`                         | fonte autoritativa de providers de modelo do app, contém o campo `provider` (ver Provider Schema). |
| `~/.zcode/v2/model-providers.json`                | origem de migração única, apenas lê conteúdo antigo válido; após a migração o arquivo original é preservado sem alteração. |
| `~/.zcode/v2/model-providers.v2.json`             | totalmente ignorado: não é lido, não é removido, não é migrado.            |
| `~/.zcode/cli/config.json`                        | arquivo de configuração usado pela CLI standalone, não participa da migração de providers do app. |
| `models_catalog_china_llm_zcode_2026-06-03.json` | fonte de complementação de metadata de modelo durante a migração do `model-providers.json` legado. |

Quando `config.json` já existe e contém um `provider` válido, a nova configuração do usuário não é sobrescrita pelo arquivo antigo.

## Provider Schema

A estrutura de Provider é compatível com a forma de provider do opencode config e se aproxima da definição de provider do agent.
No write-back do ZCode não se escreve mais o `$schema` de topo, nem o objeto de extensão `zcode`, nem campos internos derivados como `api`, `npm` e `endpoints` de topo do provider. O endereço de requisição é escrito apenas em `options.baseURL`.

O tipo de transport do provider usa `kind`:

```jsonc
{
  "provider": {
    "deepseek": {
      "name": "DeepSeek",
      "kind": "openai-compatible",
      "options": {
        "apiKey": "sk-...",
        "baseURL": "https://api.deepseek.com/v1",
      },
      "models": {},
    },
  },
}
```

Regras de compatibilidade de migração:

- Na leitura do arquivo antigo, o `$schema` de topo ainda é aceito, mas é removido no write-back.
- Na leitura do arquivo antigo, o `api` de topo do provider ainda é aceito, apenas como fonte padrão de `options.baseURL`.
- Na leitura do arquivo antigo, o `npm` ainda é aceito e convertido em `kind` sem o prefixo `@ai-sdk/`.
- Na leitura do arquivo antigo, o objeto de extensão `zcode` de provider/model ainda é aceito.
- Quando `config.json` já tem `kind` ou `options.baseURL`, o runtime usa como válido os campos da estrutura nova;
  os resíduos `endpoints`, `apiFormat`, `defaultKind` e `zcode` servem apenas como entrada de migração quando faltam campos novos.
- No write-back são removidos uniformemente `api`, `npm`, `endpoints`, `apiFormat`, `defaultKind` de topo do provider,
  `providerMappings`, `createdAt`, `updatedAt`, o objeto de extensão `zcode` de provider/model, e as chaves antigas com
  prefixo `zcode*` dentro de `providerMappings`.
- Campos como `endpoints`, `apiFormat` e `defaultKind`, necessários internamente ao app, são derivados na leitura pelo storage a partir de
  `kind + options.baseURL`.
- O campo Base URL da página de configurações e a leitura/escrita de `options.baseURL` devem preservar os segmentos de caminho configurados pelo usuário; não se deve apagar automaticamente sufixos como `/v1`,
  `/responses` e `/chat/completions` só porque o `kind` é `openai` / `openai-compatible` / `anthropic`. O catálogo histórico / endpoint legado pode continuar fazendo a normalização de compatibilidade
  "URL completo de operation -> runtime base URL" durante a migração, mas isso não pode valer para a entrada atual do usuário.
- Os providers built-in / do plano da própria ZCode usam uniformemente o runtime `anthropic`; a capacidade multi-protocolo dentro de um único provider não é mais expressa por `kinds` em nível de model.

## Model Schema

Os modelos continuam preservando os seguintes campos principais:

- `name`
- `reasoning`
- `limit`
- `modalities`
- `options`
- `headers`

`reasoning` é voltado para a UI, a página de configurações e o ZCode Protocol, indicando se o modelo suporta pensamento e quais níveis de intensidade de raciocínio podem ser exibidos.
O App apenas salva e distribui os valores de nível, como `high` e `max`; a correspondência desses valores com os campos da requisição ao provider é mantida pelo
zcode-cli, e o app não salva mais `model.variants` específicos de provider no `config.json`.

```jsonc
{
  "deepseek-v4-pro": {
    "name": "DeepSeek V4 Pro",
    "reasoning": {
      "enabled": true,
      "variants": ["high", "max"],
      "defaultVariant": "max",
    },
    "limit": {
      "context": 1000000,
      "output": 384000,
    },
    "modalities": {
      "input": ["text"],
      "output": ["text"],
    },
  },
}
```

## Mesclagem dos Parâmetros de Requisição

O lado do app projeta apenas provider, model, limite de context/output, o thought level atual e as reasoning variants disponíveis do modelo atual.
O mapeamento da intensidade de raciocínio para as options do provider dentro de uma requisição de modelo é feito no zcode-cli,
e não é distribuído a partir do app config.

```text
provider.options
  -> model.options
  -> zcode-cli gera os campos da requisição ao provider conforme o reasoning level selecionado
```

`reasoning.variants` é a única fonte da lista de níveis de reasoning no lado do app. O `model.variants` histórico é apenas aceito pelo schema como resíduo de configuração antiga; após a leitura ele não gera patch de provider interno do app e é limpo no write-back.

Ao ler `config.json.provider[].models[]`, `model.limit.context` e `model.limit.output`
são a fonte padrão. Para compatibilidade com configurações de teste iniciais e resíduos históricos, a fronteira de leitura também aceita o topo
`model.contextWindow` / `model.maxOutputTokens` como fallback; assim que for persistido novamente, continua-se gravando uniformemente
`model.limit.context` / `model.limit.output`, sem propagar os campos de topo.

## Migração

A migração lê apenas de `~/.zcode/v2/model-providers.json`. Suporta duas formas históricas:

1. O array puro antigo `ModelProviderConfig[]`.
2. O `{ schemaVersion, providers }` gravado por engano no arquivo antigo.

Regras de migração:

- `id` -> chave do map `provider`.
- `name` -> `provider[id].name`.
- Protocolo de execução padrão -> `provider[id].kind`, com valor `anthropic`, `openai` ou `openai-compatible`.
- `apiKey` -> `provider[id].options.apiKey`.
- Endpoint runtime base URL padrão -> `provider[id].options.baseURL`.
- `headers` -> `provider[id].headers`.
- `models[]` -> `provider[id].models`.
- `contextWindow` -> `model.limit.context`.
- `maxOutputTokens` -> `model.limit.output`.
- `modalities` -> `model.modalities`.
- `reasoning.levels[level][kind]` antigo -> `model.reasoning.variants`; patch específico de provider
  não é mais escrito no `config.json`.

Quando o ID do modelo termina em `[1m]`, o App força `contextWindow` / `model.limit.context` a convergir para `1000000` nas etapas de normalização no storage, salvamento na página de configurações e projeção do ZCode Protocol.
Isso permite que a página de configurações, a cadeia continuous do desktop, a cadeia de recuperação replayable do controle remoto no celular e o medidor de contexto do agent usem o mesmo denominador de 1M,
sem serem sobrescritos pelo 128k guardado em configurações antigas ou por valores menores digitados manualmente pelo usuário.

Os modelos do `model-providers.json` antigo frequentemente têm apenas o id em forma de string, sem fatos como `contextWindow`,
`maxOutputTokens`, `modalities` e `reasoning`. Na migração, os metadata que faltam são complementados pelo
`models_catalog_china_llm_zcode_2026-06-03.json` local, por id de modelo; por exemplo, `deepseek-v4-pro` obtém `contextWindow: 1000000` do catálogo, evitando cair no valor
antigo de fallback 128k. `model-providers.v2.json` não participa da leitura nem da migração.

Após a migração bem-sucedida, `~/.zcode/v2/config.json` é escrito atomicamente, sem modificar o arquivo antigo.

## Limite entre App e Agent

A página de configurações do App lê e escreve `~/.zcode/v2/config.json`, e projeta:

- DTO de compatibilidade para a UI, usado pela página de configurações e pela página de chat.
- `ZCodeProviderRegistrySnapshot`, usado pelo app service para resolver o modelo selecionado atual dentro deste processo.

O modo `--stdio` do Agent não lê o arquivo de config do app. Ele consome apenas o runtime
model config distribuído pelo app via protocolo: provider atual, modelo atual, limite de context/output, thought level atual, reasoning variants disponíveis do modelo
atual. As reasoning provider options necessárias para gerar a requisição são mantidas pelo zcode-cli conforme o valor do nível.
A lista de provider/model da UI segue o `modelProviderService` do lado do app e não depende do snapshot do agent retornar o catálogo completo.

A cadeia de controle remoto continua respeitando o limite de shared-host attachment: o `/remote` no celular não inicia um agent runtime
independente para a configuração de providers, nem lê a configuração de providers da máquina remota.

## Verificação

Deve cobrir:

- Migrar para `config.json.provider` quando existir apenas `model-providers.json`.
- O config escrito não contém o `$schema` de topo.
- O provider escrito usa `kind` e não contém `api`, `npm`, `endpoints`, `apiFormat`, `defaultKind`, `providerMappings`, `createdAt`, `updatedAt` de topo do provider nem o objeto de extensão
  `zcode`.
- Na migração de modelos string legados, consegue complementar metadata como `contextWindow` a partir do catálogo local.
- Não migra quando existir apenas `model-providers.v2.json`; o resultado equivale a não haver configuração antiga de provider.
- Quando `config.json.provider` já existe, ele não é sobrescrito pela configuração antiga, mas é limpo para o novo schema.
- Salvar o provider na página de configurações modifica apenas o `config.json`.
- A inicialização do agent `--stdio` e `session/send` não recebem o registro completo de providers, apenas o runtime config do modelo atual.
- A lista de seleção de modelos da UI vem da fonte de dados de providers do app, e o snapshot do agent só precisa fornecer o estado do modelo atual.
- A CLI standalone continua sendo afetada apenas por `~/.zcode/cli/config.json`.