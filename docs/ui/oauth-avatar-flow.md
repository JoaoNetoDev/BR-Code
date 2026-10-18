# Integração do Avatar via OAuth

Esta implementação transfere o avatar de login e as informações do usuário do lado do provider até a UI.

## Fluxo de Dados

1. O `fetchUserInfo()` do provider lê a interface `userinfo` de terceiros.
2. O provider grava o endereço do avatar em `OAuthUserProfile.avatarUrl`.
3. O `OAuthService` preserva o `avatarUrl` ao converter `OAuthUserProfile` em `UserInfo`.
4. O `WorkspaceSidebarFooter` renderiza o avatar com `AvatarImage`, com fallback para as iniciais ou o ícone de usuário quando o carregamento falha.

## Mapeamento Atual dos Providers

- BigModel: `userData.avatar` -> `avatarUrl`
- ZAI: `userData.picture` -> `avatarUrl`

## Restrições

- Quando o estado de login antigo salva apenas o nome de usuário, o campo de avatar pode ficar ausente sem afetar a restauração do login.
- Novos providers precisam ter o nome do campo de avatar na resposta de userinfo confirmado antes de adicioná-lo ao `OAuthUserProfile`.