# Design da Redesenho do Token OAuth do Backend ZAI

## Contexto

O desktop já possui uma arquitetura OAuth multi-provider, na qual o login ZAI, por meio do `ZaiProviderAdapter`, troca diretamente um access token chamando as interfaces de token e userinfo do ZAI de terceiros. A nova exigência determina que o desktop seja responsável apenas por abrir a página de autorização do ZAI e receber o callback por deep link; após obter o `code` e o `state`, ele chama o backend próprio `https://zcode.z.ai/api/v1/oauth/token`, e o backend se encarrega de trocar o token junto ao z.ai, buscar o userinfo, criar o usuário e emitir o JWT.

O objetivo desta mudança é, em última instância, salvar o JWT retornado pelo backend como token de login do ZAI, preservando a UI atual, o deep link, o repositório de credenciais e a arquitetura de service multi-provider.

## Escopo

- Alterar apenas o contrato de protocolo do provider OAuth do ZAI.
- Não alterar o comportamento de login do BigModel.
- Não adicionar nova entrada de UI nem ajustar o visual do diálogo de login.
- Não criar um service de login separado; continuar reutilizando o `OAuthService` e o mecanismo de provider adapter.

## Fluxo de Dados

1. A UI chama `oauthService.startOAuth("zai")`.
2. `ZaiProviderAdapter.buildAuthorizeUrl` gera a URL de autorização:
   - `https://chat.z.ai/api/oauth/authorize`
   - `client_id=client_P8X5CMWmlaRO9gyO-KSqtg`
   - `redirect_uri=zcode://zai-auth/callback`
   - `state=<random-state>`
3. O desktop abre o navegador por meio da camada de plataforma.
4. Após a autorização do usuário, o deep link do sistema retorna a:
   - `zcode://zai-auth/callback?code=<code>&state=<state>`
5. `OAuthService.handleCallback` valida o state pendente e então chama o adapter do ZAI.
6. O adapter do ZAI chama o backend:

```http
POST https://zcode.z.ai/api/v1/oauth/token
Content-Type: application/json

{
  "code": "<code>",
  "redirect_uri": "zcode://zai-auth/callback",
  "state": "<state>"
}
```

7. O backend retorna:

```json
{
  "code": 0,
  "msg": "",
  "data": {
    "token": "eyJ...",
    "expires_in": 86400,
    "user": {
      "user_id": "u_xxxxx",
      "email": "user@example.com",
      "avatar": "https://...",
      "created_at": "2026-04-27T10:00:00Z"
    }
  }
}
```

8. O cliente salva:
   - `oauth:zai:access_token` = `data.token`
   - `oauth:zai:user_info` = as informações de usuário mapeadas
   - `oauth:active_provider` = `zai`

## Mapeamento de Protocolo

Configuração do provider ZAI:

- `authorizeUrl`: `https://chat.z.ai/api/oauth/authorize`
- `tokenUrl`: `https://zcode.z.ai/api/v1/oauth/token`
- `userinfoUrl`: o campo de configuração é mantido, mas não é mais chamado no caminho de sucesso deste login
- `appId`: usa `client_P8X5CMWmlaRO9gyO-KSqtg`
- `redirectUri`: `zcode://zai-auth/callback`
- `legacyRedirectUri`: continua mantendo `zcode://oauth/callback` para compatibilidade com a análise de deep link antigo

Mapeamento de token:

- `OAuthTokenSet.accessToken` usa `data.token`
- `OAuthTokenSet.expiresAt` usa `now() + data.expires_in * 1000`
- O backend atualmente não fornece refresh token; desta vez `refreshToken` não é escrito

Mapeamento de usuário:

- `OAuthUserProfile.id` usa `data.user.user_id`
- `OAuthUserProfile.username` prioriza `data.user.email`, com fallback para o user id quando ausente
- `OAuthUserProfile.displayName` é igual a username
- `OAuthUserProfile.avatarUrl` usa `data.user.avatar`

## Tratamento de Erros

- Resposta HTTP diferente de 2xx continua sendo lançado por `readApiJson` como `ApiError`.
- Resposta de negócio com `code !== 0` é considerada falha na troca do token, e a mensagem de erro prioriza `msg`.
- Quando a resposta não contém `data.token`, um erro explícito é lançado para evitar salvar um estado de login vazio.
- A ausência de `data.user` não bloqueia o login; o fallback profile existente é reutilizado, porque o objetivo central desta mudança é obter o JWT do backend, e as informações de exibição do usuário podem ser complementadas depois.

## Testes

Atualizar `packages/services/test/oauthService.test.ts`:

- A URL de autorização do ZAI usa o novo endereço de autorização e o client id inalterado.
- A requisição de token do ZAI usa body JSON: `code`, `redirect_uri`, `state`.
- Após o login bem-sucedido do ZAI, `data.token` é salvo em `oauth:zai:access_token`.
- `expires_in` é convertido para `expiresAt`, podendo ser usado depois para estender a verificação de expiração.
- `code !== 0` e a ausência de `data.token` resultam em falha.

A verificação final deve executar:

- `pnpm typecheck`
- `pnpm lint`

## Documentação

Após a conclusão da funcionalidade, atualizar `docs/oauth/oauth-multi-provider-implementation.md`, registrando que o login ZAI passou a usar a cadeia de troca de token JWT do backend.