# Anthropic Authorization Header

## Contexto

Por padrão, as requisições de mensagens Anthropic do ZCode dependem da configuração `apiKey` do AI SDK para enviar `x-api-key`. Alguns gateways compatíveis com Anthropic também leem a mesma credencial por meio de `Authorization`; se apenas `x-api-key` for enviado, a requisição de conversa principal, o teste de conectividade e as requisições curtas do Repo Wiki apresentarão comportamentos de autenticação inconsistentes.

## Objetivo

- Uma requisição comum pelo transport Anthropic deve carregar simultaneamente `x-api-key: <api-key>` e `Authorization: Bearer <api-key>`.
- Um `Authorization` configurado explicitamente pelo usuário ou pelo runtime continua tendo prioridade, evitando sobrescrever a assinatura do Start Plan, os Headers de verificação de segurança ou a semântica de autenticação já existente do lado do proxy.
- O endpoint Anthropic do Start Plan mantém `Authorization: Bearer <zcode-jwt>` e passa a enviar também `x-api-key: <zcode-jwt>`, mantendo a mesma forma de headers duplos do Anthropic comum.
- `anthropic-version: 2023-06-01` e o comportamento atual dos headers `anthropic-beta`/runtime permanecem inalterados.

## Superfície de impacto

- Requisição do modelo principal do Agent: o Anthropic provider registry de `@zcode/adapters`.
- Teste de conectividade da página de configurações: verificação de endpoint Anthropic em `packages/services`.
- Requisições curtas do modelo do Repo Wiki: requisições HTTP Anthropic Messages escritas à mão.

## Fora de escopo

- Não alterar os headers de autenticação de OpenAI, OpenAI-compatible, Responses e Gemini.
- Não mudar a semântica Bearer do Start Plan para token puro.
- Não adicionar campos de protocolo; isto é comportamento de montagem de headers de runtime do provider.