# Origem do Ambiente OAuth da ZAI

## Contexto

O ponto de entrada de login OAuth da ZAI usa hoje o prefixo `/api/oauth`, e o ponto de entrada padrão de produção é `https://chat.z.ai/api/oauth/authorize`. Para suportar o ponto de entrada de login do ambiente de teste, é preciso evitar espalhar a URL de autorização completa pelo código de múltiplas plataformas.

## Solução

- Host/service e Web/Vite leem apenas as constantes de link agrupadas por `ZCODE_ENV=test|production`.
- `ZAI_<ENV>_OAUTH_ORIGIN` é usada para derivar o `authorizeUrl` e o `userinfoUrl` do OAuth da ZAI.
- `ZAI_<ENV>_BUSINESS_BASE_URL` é usada para derivar a interface de troca de token de negócio da ZAI `/api/auth/z/login`.
- Mantém-se o override de URL completa já existente: `ZAI_OAUTH_AUTHORIZE_URL` e `ZAI_OAUTH_USERINFO_URL` têm prioridade sobre os valores derivados da origin, para compatibilidade com configurações antigas.
- Mantém-se o override de URL completa para o token de negócio: `ZAI_BUSINESS_LOGIN_URL` tem prioridade sobre `ZAI_BUSINESS_BASE_URL`, usado apenas para testes ou migração do caminho da interface.
- A troca de token passa pela API ZCode derivada de `ZCODE_<ENV>_BASE_URL`: desktop/host usa `${baseUrl}/api/v1/oauth/token`; por padrão o Web requisita `/api/v1/oauth/token` e o Vite proxy encaminha para a base url selecionada conforme `ZCODE_ENV`.

## Configuração do ambiente de teste

```env
ZCODE_TEST_BASE_URL=https://zcode.z.ai
ZAI_TEST_OAUTH_CLIENT_ID=client_P8X5CMWmlaRO9gyO-KSqtg
ZAI_TEST_OAUTH_ORIGIN=https://chat.z.ai
ZAI_TEST_BUSINESS_BASE_URL=https://api.z.ai
```

O desenvolvimento local usa `ZCODE_ENV=test` por padrão, de modo que `pnpm dev:web` e `pnpm dev:desktop:test` usem o ponto de entrada de login do ambiente de teste. Não defina `ZCODE_ENV` em `.env*`; o ambiente atual é injetado pelo script de inicialização ou pela CI.

O ambiente de produção configura explicitamente o client id de produção em `.env.production`:

```env
ZCODE_PRODUCTION_BASE_URL=https://zcode.z.ai
ZAI_PRODUCTION_OAUTH_ORIGIN=https://chat.z.ai
ZAI_PRODUCTION_BUSINESS_BASE_URL=https://api.z.ai
ZAI_PRODUCTION_OAUTH_CLIENT_ID=client_P8X5CMWmlaRO9gyO-KSqtg
```