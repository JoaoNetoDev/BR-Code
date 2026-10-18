# Consolidação do ambiente ZCODE_ENV

## Contexto

Historicamente o desktop usava simultaneamente `ZCODE_ENV`, `ZCODE_API_ENV` e `ZCODE_DESKTOP_BUILD_ENV*` para expressar a forma do build, o ambiente de API e o ambiente dos artefatos publicados, o que facilmente fazia com que artefatos de teste carregassem comportamento de desenvolvimento e tornava os valores padrão do CI difíceis de interpretar.

## Objetivo

`ZCODE_ENV` é a única variável de ambiente do produto, e a enumeração mantém apenas:

- `test`: ambiente de teste, usa endpoints de API/OAuth de teste e permite exibir menus exclusivos de teste.
- `production`: ambiente oficial, usa endpoints de API/OAuth oficiais e oculta menus exclusivos de teste.

Desenvolvimento local não é um ambiente de produto. Quando `ZCODE_ENV` não é definido explicitamente, o padrão é `test`; as capacidades de depuração local são determinadas pela forma de execução, por exemplo se o Electron está packaged, o Vite dev mode ou um interruptor de debug dedicado.

## Regras de configuração

Os arquivos `.env*` guardam apenas configurações como links e o OAuth client id público, e não a seleção atual do ambiente de produto.
A configuração de links é agrupada por prefixo de ambiente, evitando que host, Vite e código de negócio declarem a mesma URL repetidamente:

- `ZCODE_TEST_BASE_URL`
- `ZCODE_PRODUCTION_BASE_URL`
- `ZAI_TEST_OAUTH_ORIGIN`
- `ZAI_PRODUCTION_OAUTH_ORIGIN`
- `ZAI_TEST_BUSINESS_BASE_URL`
- `ZAI_PRODUCTION_BUSINESS_BASE_URL`
- `ZAI_TEST_OAUTH_CLIENT_ID`
- `ZAI_PRODUCTION_OAUTH_CLIENT_ID`

A configuração de build seleciona os links correspondentes com base no `ZCODE_ENV` e injeta no renderer os valores públicos `VITE_*`.
A ZCode API, os links de controle remoto e as entradas zcode-plan OpenAI/Anthropic no renderer, no host/service e no agent são todos derivados do endpoint resolver de `@zcode/shared`; o código de negócio não deve mais reescrever à mão a URL `zcode.z.ai` / `zcode.z.ai` do zcode-plan.

## Endpoint resolver

`packages/shared/src/zcodeEndpoint.ts` é a única fonte de verdade dos domínios de ambiente do produto. Os chamadores em runtime devem passar explicitamente o `env` atual ao resolver; não é permitido ler o global de tempo de compilação `ZCODE_ENV` dentro de service/provider.

Matriz de domínios padrão:

| Ambiente de produto | ZCode API | ZAI OAuth | ZAI Business API | BigModel API |
| --- | --- | --- | --- | --- |
| `test` | `https://zcode.z.ai` | `https://chat.z.ai` | `https://api.z.ai` | `https://bigmodel.cn` |
| `production` | `https://zcode.z.ai` | `https://chat.z.ai` | `https://api.z.ai` | `https://bigmodel.cn` |

Prioridade de sobrescrita:

1. Sobrescrita por URL completa tem precedência, por exemplo `ZAI_OAUTH_AUTHORIZE_URL`, `BIGMODEL_OAUTH_AUTHORIZE_URL`.
2. Em seguida, sobrescrita por origin/base sem prefixo de ambiente, por exemplo `ZCODE_BASE_URL`, `ZAI_OAUTH_ORIGIN`, `ZAI_BUSINESS_BASE_URL`, `BIGMODEL_API_BASE_URL`.
3. Depois, sobrescrita com escopo de ambiente, por exemplo `ZCODE_TEST_BASE_URL`, `ZAI_PRODUCTION_OAUTH_ORIGIN`, `BIGMODEL_TEST_API_BASE_URL`.
4. Por último, os domínios padrão embutidos no shared resolver.

`.env.development` guarda apenas as constantes de link do ambiente de teste usadas no desenvolvimento local; ele não seleciona o ambiente de produto.
O script de inicialização do desktop injeta `ZCODE_ENV` explicitamente conforme o comando escolhido; por padrão `pnpm dev:desktop` aponta hoje para o ambiente oficial, e o ambiente de teste exige `pnpm dev:desktop:test` explícito.

## Inicialização e CI

- `pnpm dev:desktop` equivale por padrão a `pnpm dev:desktop:prod`.
- `pnpm dev:desktop:test` injeta explicitamente `ZCODE_ENV=test`.
- `pnpm dev:desktop:prod` injeta explicitamente `ZCODE_ENV=production`.
- Quando o CI não recebe `ZCODE_ENV`, o padrão é `production`.
- O CI aceita apenas `ZCODE_ENV=test|production` e não lê mais `ZCODE_DESKTOP_BUILD_ENV*` nem `ZCODE_API_ENV`.
- `ZCODE_ENV=test` permite apenas construir, coletar e enviar artefatos de teste; o `publish-release.sh` recusa chamadas à API de release oficial a partir do ambiente de teste.

## Nomenclatura dos instaladores

Os instaladores do ambiente oficial mantêm os nomes de arquivo originais, por exemplo `ZCode-3.0.0-mac-x64.dmg`.
Os instaladores do ambiente de teste acrescentam `_TEST` após a arquitetura, por exemplo `ZCode-3.0.0-mac-x64_TEST.dmg`.
A mesma regra vale para artefatos de macOS, Windows e Linux, evitando confusão entre pacote de teste e oficial no download, no upload ou na validação manual.
A notificação de build no Feishu exibe a marca "ambiente de teste/ambiente oficial"; a notificação de release de publicação é usada apenas para lançamentos oficiais.