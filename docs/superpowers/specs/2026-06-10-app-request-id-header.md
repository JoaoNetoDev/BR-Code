# Request ID Header nas Requisições de Rede do App

## Contexto

As APIs de negócio externas do lado do App já foram convergidas para o `ApiClient`, e o diagnóstico de erros também lê `x-request-id` / `x-trace-id` / `x-span-id` da resposta do backend. Porém, as requisições de saída não carregam de forma estável um ID de nível de requisição, o que faz com que a investigação em produção dependa apenas dos IDs gerados pelo backend, sem conseguir correlacionar previamente os logs locais, a captura de pacotes e os logs de entrada do servidor.

## Objetivo

- As requisições HTTP de APIs de negócio externas iniciadas pelo App carregam `x-request-id` por padrão.
- O valor de `x-request-id` é uma string UUID, gerada uma vez por requisição HTTP.
- Quando o chamador já passou explicitamente `x-request-id` / `X-Request-Id`, esse valor deve ser preservado, para não sobrescrever o ID de rastreamento que já existe do lado do negócio.
- `NodeApiClient` cobre de forma unificada OAuth, model provider, usage, repo snapshot/wiki e todos os demais caminhos que passam pelo `ApiClient`.
- A API de feedback, por ainda ter uma implementação de upload customizada, também precisa cobrir requisições comuns de API, inicialização/conclusão de anexo, upload único e upload de chunks de log.

## Não objetivos

- Não adicionar campos de protocolo nem modificar o `@zcode/protocol`.
- Não adicionar esse header a WebSocket, RPC, IPC, SSH ou à leitura de recursos locais do navegador.
- Não injetar o header à força em qualquer bot provider de terceiros, sondagem de URL de MCP ou webhook URL configurado pelo usuário, para não quebrar a compatibilidade com terceiros ou com o CORS.
- Não gravar `x-request-id` nos logs info de produção; apenas a chave do header pode ser registrada, para que requisições de alta frequência não inunden os logs.

## Design

A camada de serviço ganha um helper unificado:

1. Usar `Headers` para normalizar os headers passados pelo chamador, compatíveis com objeto comum, array e instância de `Headers`.
2. Se não houver um `x-request-id` existente, chamar `createUuid()` para gerar o UUID e gravá-lo no `x-request-id` em minúsculas.
3. Se o chamador já passou um header com o mesmo nome, manter o valor original.

`NodeApiClient.request()` chama o helper de forma unificada depois do endpoint rewrite e da mesclagem do ZCode source header.
Assim, independentemente de o destino ser o endpoint padrão, o endpoint de teste ou uma API externa comum, a requisição obtém um ID de nível de requisição,
enquanto as regras de sobrescrita do source header permanecem inalteradas.

As requisições `fetch` comuns do `FeedbackHttpClient`, o upload único via `http/https.request` e o PUT de chunks de log
também usam o mesmo helper. Cada chunk/tentativa de upload de log é uma requisição HTTP independente e, portanto, gera seu
próprio `x-request-id`, o que facilita para o backend localizar a requisição que falhou.

## Verificação

- Os testes unitários do `NodeApiClient` cobrem a geração padrão de `x-request-id`, a preservação de um request id passado explicitamente e o fato de um abort externo não afetar a geração do header.
- Os testes unitários de endpoint rewrite cobrem a coexistência dos source headers do endpoint ZCode com o `x-request-id`, e requisições externas comuns também carregam o header.
- Os testes unitários do `FeedbackHttpClient` cobrem a API de feedback comum, o PUT de chunks de log e o PUT de anexo único, todos com `x-request-id`.
- Ao final, executar o vitest direcionado e, conforme exigido pelo repositório, `pnpm typecheck` e `pnpm lint`.