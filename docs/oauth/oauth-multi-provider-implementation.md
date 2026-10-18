# Implementação de OAuth com múltiplos provedores (Desktop)

Atualizado em: 2026-04-03

## 1. Escopo desta entrega

Esta reestruturação da implementação de OAuth multi-provedor no Desktop tem como objetivo permitir a extensão de provedores no mesmo nível, com a configuração coesa por provedor, eliminando lógica específica de um determinado provedor na entrada comum.

## 2. Principais mudanças

### 2.1 Shared passa a manter apenas os tipos de domínio

`packages/shared/src/oauth.ts` agora mantém apenas os tipos de domínio OAuth e os ids de provedor (`bigmodel`, `zai`), sem a configuração de endpoints padrão dos provedores.

### 2.2 Configuração dos provedores desce para baixo

Novos módulos de configuração de provedor em `packages/services/src/oauth/providers/`:

- `bigmodelProviderConfig.ts`
- `zaiProviderConfig.ts`
- `configUtils.ts`

Cada provedor mantém sua própria configuração padrão e o mapeamento de variáveis de ambiente; `runtimeConfig.ts` apenas agrega.

### 2.3 Responsabilidades da configuração de runtime são consolidadas

`packages/services/src/oauth/runtimeConfig.ts` agora é responsável apenas por:

1. Definir `OAuthProviderRuntimeConfig` / `OAuthRuntimeConfig`
2. Agregar a configuração de runtime de cada provedor

Não carrega mais os detalhes de montagem de campos específicos de BigModel/ZAI.

### 2.4 Repositório de credenciais sem semântica global de provedor legado

`packages/services/src/oauth/repo/oauthCredentialRepo.ts` trata apenas chaves namespaced:

- `oauth:<provider>:access_token`
- `oauth:<provider>:refresh_token`
- `oauth:<provider>:user_info`
- `oauth:active_provider`

Não infere nem migra mais um determinado provedor por meio do `LEGACY_PROVIDER_ID` global.

O `oauth:bigmodel:user_info` do BigModel atualmente armazena o profile normalizado e é marcado com
`rawProfile.zcodeProfileSchemaVersion = 2`, indicando que o nome de exibição foi gerado seguindo a prioridade
`customerName -> nickName -> "user"`. Ao iniciar `restoreCachedSession()`, se for detectado que o cache antigo do BigModel
está sem essa marcação de versão ou com versão inferior a 2, o código retorna imediatamente o estado de exibição do cache
local e, em seguida, tenta em segundo plano um refresh de userinfo best-effort usando o access token do namespace do
provedor BigModel; caches com versão superior a 2 são tratados como dados de uma versão futura, não sendo solicitados,
reescritos nem rebaixados. Em caso de sucesso, a versão de schema 2 e o novo nome de exibição são gravados novamente.
Em caso de 401/403, ausência de token, ou quando o profile sentinela `unknown/User` for atingido, os campos de exibição do
cache antigo são mantidos e a versão de schema 2 é gravada, evitando que cada inicialização dispare novamente a migração
que já falhou de forma determinística. Falhas transitórias, como timeout, offline ou 5xx, gravam apenas um tempo de backoff em
`rawProfile.zcodeProfileMigrationRetryAfter`, sem gravar a versão de schema 2; após a janela de backoff a migração ainda
pode ser tentada novamente. A escrita da migração em segundo plano precisa ser fixada em `oauth:bigmodel:user_info` e,
antes de salvar, é preciso confirmar que o active provider atual e o cache do BigModel ainda correspondem ao estado antigo
capturado na inicialização; quando o usuário faz logout, muda para o ZAI ou faz login novamente no BigModel, o resultado da
migração antiga deve ser invalidado.

### 2.5 Remoção do fallback secret do BigModel

O BigModel não possui mais um fallback secret histórico embutido; quando `BIGMODEL_OAUTH_APP_SECRET` não é configurado explicitamente, a configuração de runtime permanece como `undefined`. Atualmente o callback do BigModel consome o code de uso único apenas pela rota de token OAuth do zcode.

### 2.6 Consolidação do callback OAuth

O OAuth do Desktop usa uniformemente `zcode://oauth/callback`:

- O `redirectUri` padrão do ZAI foi consolidado de `zcode://zai-auth/callback` para `zcode://oauth/callback`
- O BigModel permanece em `zcode://oauth/callback`
- O processo main do Desktop não reconhece mais `zcode://zai-auth/callback` / `zcode://bigmodel-auth/callback`
- `ZAI_OAUTH_REDIRECT_URI` / `BIGMODEL_OAUTH_REDIRECT_URI` e o override de redirect URI legado foram removidos

A atribuição do provedor não depende do host do callback, e sim da relação de vínculo do `state` registrada no momento em que o login é iniciado.

## 3. Configuração de runtime (processo Host)

Variáveis de ambiente do BigModel:

- `BIGMODEL_OAUTH_ENABLED`
- `BIGMODEL_OAUTH_AUTHORIZE_URL`
- `BIGMODEL_OAUTH_TOKEN_URL`
- `BIGMODEL_OAUTH_USERINFO_URL`
- `BIGMODEL_OAUTH_APP_ID`
- `BIGMODEL_OAUTH_APP_SECRET`

Variáveis de ambiente do ZAI:

- `ZAI_OAUTH_ENABLED`
- `ZAI_OAUTH_AUTHORIZE_URL`
- `ZAI_OAUTH_TOKEN_URL`
- `ZAI_OAUTH_USERINFO_URL`
- `ZAI_OAUTH_CLIENT_ID` (compatível com `ZAI_OAUTH_APP_ID`)
- `ZAI_BUSINESS_BASE_URL`: deriva `POST /api/auth/z/login`, usado para trocar o access token OAuth do ZAI por um business token; o ambiente de teste é `https://api.z.ai`
- `ZAI_BUSINESS_LOGIN_URL`: override completo da URL de troca do business token, com prioridade acima de `ZAI_BUSINESS_BASE_URL`

O fluxo de login padrão do ZAI passou a usar a troca de JWT token do backend, com a entrada de autorização e a entrada de troca do business token selecionadas conforme `ZCODE_ENV=test|production`:

- Página de autorização: `/api/oauth/authorize` derivado de `ZAI_<ENV>_OAUTH_ORIGIN`, com padrão de produção `https://chat.z.ai/api/oauth/authorize`
- Troca de token: `/api/v1/oauth/token` derivado de `ZCODE_<ENV>_BASE_URL`
- Corpo da requisição no desktop: `{ code, redirect_uri, state }`
- O `oauth:zai:access_token` salvo localmente é o `data.token` retornado pelo backend

## 4. Fluxo de login JWT do backend ZAI (incremental)

O login OAuth do ZAI não é mais feito pelo desktop chamando diretamente a API de token do ZAI de terceiros. O desktop apenas abre a página de autorização, recebe o deep link `zcode://oauth/callback` e repassa `code`, `redirect_uri` e `state` para o backend `https://zcode.z.ai/api/v1/oauth/token`.

O backend realiza a troca do token do z.ai, obtém o userinfo, cria o usuário e assina o JWT. O cliente salva o `data.token` da resposta como `oauth:zai:access_token`, mapeia `data.user` para `oauth:zai:user_info` e define `oauth:active_provider` como `zai`.

## 5. Resultado da verificação

Executado:

- `pnpm vitest run packages/services/test/oauthService.test.ts`
- `pnpm typecheck`
- `pnpm lint`

Resultado: aprovado.

## 6. Criptografia transparente das credenciais OAuth (incremental)

Para evitar que OAuth token / user_info sejam gravados em disco em texto claro, foi adicionada criptografia transparente na camada de serviço de credenciais:

- Entrada: `packages/services/src/credential/credentialService.ts`
- Implementação da criptografia: `packages/services/src/credential/providers/credentialCipherProvider.ts`
- Formato do texto cifrado: `enc:v1:<iv>.<authTag>.<cipherText>` (AES-256-GCM)

Descrição do comportamento:

1. `credentialService.save` criptografa automaticamente e grava em `~/.zcode/v2/credentials.json`
2. `credentialService.load` descriptografa automaticamente e devolve o texto claro para a camada de negócio
3. Valores históricos em texto claro (sem o prefixo `enc:v1:`) continuam sendo lidos de forma compatível, evitando que o estado de login deixe de funcionar após a atualização

Sobre a chave:

- É utilizado preferencialmente a variável de ambiente `ZCODE_CREDENTIAL_SECRET`
- Quando não configurada, é gerada uma fallback key a partir do contexto local (usada para a criptografia mínima viável nos modos local/remoto)

Testes:

- `packages/services/test/credentialService.test.ts`
  - verifica que a gravação em disco não é em texto claro
  - verifica que a leitura descriptografa automaticamente
  - verifica a compatibilidade com valores históricos em texto claro

## 7. Recuperação do estado de login na inicialização (incremental)

Para evitar decidir "logado" na inicialização apenas com base no valor do arquivo local, a recuperação do estado de login foi consolidada em `oauthService.restoreSession()`:

- Interface: `packages/services/src/oauth/oauth.ts`
- Implementação: `packages/services/src/oauth/oauthService.ts`
- Ponto de entrada na UI: `packages/ui/src/Root.tsx`

Mudanças de comportamento:

1. A recuperação na inicialização não lê mais token/user_info diretamente na UI
2. `restoreSession` usa o access token do active provider para chamar o `fetchUserInfo` do provedor e fazer uma verificação real de validade
3. Se o retorno for não autorizado (401/403), o fluxo de logout é executado imediatamente e o estado de login local é limpo

Migração de compatibilidade do BigModel:

- A lógica de leitura de `auth_token` / `refresh_token` legados foi movida para o diretório de provedores (`bigmodelProviderAdapter.ts`)
- Quando há compatibilidade, as chaves namespaced são preenchidas automaticamente: `oauth:bigmodel:access_token` / `oauth:bigmodel:refresh_token`

Testes:

- `packages/services/test/oauthService.test.ts`
  - a verificação de inicialização bem-sucedida permite restaurar a sessão
  - o token legado do BigModel pode ser restaurado e migrado
  - um 401 na verificação de inicialização dispara o logout e limpa as credenciais

## 8. Provedores de modelos pré-configurados após o login OAuth (ZAI)

Esta entrega completou, para o ZAI, a cadeia de sincronização dos provedores de modelos pré-configurados após um login OAuth bem-sucedido, com comportamento alinhado à lógica de obtenção de key do `getZaiApiKey` no `z-work`:

1. Usar `oauth:zai:access_token` para chamar `POST https://api.z.ai/api/auth/z/login` e trocar pelo business token do ZAI
2. Usar o business token para chamar `GET /api/biz/customer/getCustomerInfo` e selecionar a organização/projeto padrão
3. Chamar `GET /api_keys` para localizar `zcode-api-key`; se não existir, criar com `POST /api_keys`
4. Chamar `GET /api_keys/copy/{apiKey}` para obter o `secretKey`
5. Gravar no `apiKey` do provedor pré-configurado o valor `apiKey.secretKey`

Implementação e testes:

- Implementação: `packages/services/src/model-provider/repo/oauthPresetProviderRepo.ts`
- Testes: `packages/services/test/modelProviderService.test.ts`
  - `会把 OAuth 的 ZAI 供应商配置同步成预置模型供应商`
  - `ZAI 交换业务 token 失败时不会写入预置模型供应商`
  - `ZAI 拉取明文 key 失败时不会写入预置模型供应商`

Política de compatibilidade:

- O BigModel mantém o comportamento de fallback original (quando `copy` não retorna `secretKey`, é possível recorrer à key em texto claro)
- O ZAI exige estritamente o `secretKey`, evitando gravar em disco uma API key em texto claro inutilizável