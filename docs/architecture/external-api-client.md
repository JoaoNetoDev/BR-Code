# Consolidação das requisições de API externa

## Escopo

Esta rodada consolida apenas as APIs de negócio externas, com as requisições passando
uniformemente por `ApiClient`:

- Cadeias de token / userinfo / business API key do provider OAuth
- Configuração remota e consultas de release do model provider

Explicitamente não incluído:

- `/api/*` local
- WebSocket
- SSH
- RPC / IPC
- Leitura de recursos locais do navegador

## Abstração unificada

A camada compartilhada adiciona `packages/shared/src/api.ts`, definindo três contratos básicos:

- `ApiClient`: interface HTTP padrão e única do projeto, mantendo-se `fetch-compatible`
- `ApiRequestInit`: baseado em `RequestInit`, complementado com `timeoutMs`
- `ApiError`: carrega uniformemente `url`, `method`, `status` e a mensagem de erro

Assim, repo / adapter dependem apenas do contrato compartilhado e não percebem detalhes de
implementação específicos do Node.

## Implementação padrão

A implementação padrão do host Node/Desktop fica em `packages/services/src/providers/api/`:

- `nodeApiClient.ts`: chama internamente o `fetch` global do Node 24
- `apiJson.ts`: trata de forma unificada a leitura de JSON, erros não-2xx e falhas de parsing
- `apiEndpoints.ts`: concentra as constantes de endpoint de API externa

O `fetch` global do Node 24 atual tem como base o `undici`, portanto:

- Aproveitamos as capacidades de runtime do `undici`
- A camada de negócio não importa `undici` diretamente
- Se no futuro for obrigatório usar capacidades avançadas do `undici`, basta ajustar a camada de
  implementação do provider

## Forma de injeção

Por restrição de camadas, `ApiClient`, como capacidade transversal, é injetado apenas via
`Providers`:

- `packages/services/src/node.ts` cria o `NodeApiClient` padrão
- O host desktop reaproveita o mesmo `NodeApiClient`
- O OAuth service / model provider service consome `ApiClient` via injeção de dependência
- Cenários de teste podem substituí-lo por um client mock

Os repos / adapters de negócio não escrevem mais `fetch` cru e não expõem mais
`fetchImpl?: typeof fetch` para a camada de negócio.

## Cadeias já migradas

- `packages/services/src/oauth/providers/*`
- `packages/services/src/model-provider/repo/*`
- `packages/services/src/model-provider/modelProviderService.ts`
- `packages/services/src/model-provider/modelProviderConnectivityHelpers.ts`

Essas cadeias agora acessam as APIs de negócio externas por meio do `ApiClient`.

## Limites atuais

A v1 unifica apenas as seguintes capacidades:

- timeout
- mesclagem de headers
- `x-request-id` por requisição
- Auxiliares de leitura de JSON / text
- Normalização de erros não-2xx

Deliberadamente não fazemos agora:

- retry
- interceptors
- Configurações avançadas de connection pool expostas à camada de negócio
- Unificação de protocolos não-HTTP

## Restrições futuras

Ao adicionar novas APIs de negócio externas, siga duas regras:

1. O código de negócio depende apenas de `ApiClient`
2. As constantes de endpoint ficam concentradas na camada de provider/config, sem URLs hardcoded
   espalhadas em repo / service
3. O ID de diagnóstico por requisição usa uniformemente `x-request-id`, gerado na saída do
   `ApiClient`; quando o chamador passar explicitamente, o valor original é preservado

Assim mantemos estáveis os limites de implementação dos modos desktop / web / remote e evitamos
vazar semântica de runtime do Node para a camada de negócio.