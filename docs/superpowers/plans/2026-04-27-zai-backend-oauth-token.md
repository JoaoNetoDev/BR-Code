# Plano de Implementação do Token OAuth do Backend ZAI

> **Para workers agentivos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Alterar o login OAuth do ZCode Desktop para que o app abra a autorização do z.ai, troque o `code/state` do callback através de `https://zcode.z.ai/api/v1/oauth/token` e armazene o JWT de backend retornado como o token OAuth do ZAI.

**Arquitetura:** Manter a arquitetura OAuth existente, ciente de provider. A UI e o `OAuthService` continuam usando `ZaiProviderAdapter`; apenas o mapeamento de protocolo do provider ZAI muda. BigModel e o comportamento do serviço OAuth compartilhado permanecem inalterados.

**Stack tecnológico:** TypeScript, Vitest, ponte de plataforma de deep link do Electron, `ApiClient` / `readApiJson` existentes, credenciais com namespace de provider.

---

## Estrutura de Arquivos

- Modificar `packages/services/test/oauthService.test.ts`
  - Atualizar as asserções de URL de autorização do ZAI e de troca de token.
  - Adicionar cobertura de falha para erros de negócio do backend e para `data.token` ausente.
- Modificar `packages/services/src/oauth/providers/zaiProviderConfig.ts`
  - Alterar os endpoints padrão de autorização e de token do ZAI.
- Modificar `packages/services/src/oauth/providers/zaiProviderAdapter.ts`
  - Substituir a troca direta de token do ZAI pela troca de token JSON do backend.
  - Mapear o JWT do backend e o payload do usuário para `OAuthTokenSet` e `OAuthUserProfile`.
- Modificar `docs/oauth/oauth-multi-provider-implementation.md`
  - Registrar o comportamento de troca de JWT do backend ZAI.

## Tarefa 1: Escrever testes OAuth do backend ZAI que falham

**Arquivos:**
- Modificar: `packages/services/test/oauthService.test.ts:96`
- Modificar: `packages/services/test/oauthService.test.ts:110`
- Testar: `packages/services/test/oauthService.test.ts`

- [ ] **Passo 1: Atualizar o teste de URL de autorização do ZAI**

Substituir as asserções existentes de `builds zai authorize URL with provider-specific params` por:

```ts
it("builds zai authorize URL with backend-token flow params", async () => {
  const service = createBigModelService();

  const { provider, authorizeUrl, state } = await service.startOAuth(ZAI_PROVIDER_ID);
  const parsed = new URL(authorizeUrl);

  expect(provider).toBe(ZAI_PROVIDER_ID);
  expect(parsed.origin + parsed.pathname).toBe("https://chat.z.ai/api/oauth/authorize");
  expect(parsed.searchParams.get("redirect_uri")).toBe(ZAI_OAUTH_PROVIDER_CONFIG.redirectUri);
  expect(parsed.searchParams.get("client_id")).toBe(ZAI_OAUTH_PROVIDER_CONFIG.appId);
  expect(parsed.searchParams.get("state")).toBe(state);
});
```

- [ ] **Passo 2: Atualizar o teste de callback ZAI bem-sucedido**

Em `stores zai credential keys and active provider after callback`, substituir as respostas mockadas e as expectativas por uma única resposta de token do backend:

```ts
fetchMock.mockResolvedValueOnce(
  new Response(
    JSON.stringify({
      code: 0,
      msg: "",
      data: {
        token: "zcode_backend_jwt",
        expires_in: 86400,
        user: {
          user_id: "zai-u-001",
          email: "user@example.com",
          avatar: "https://example.com/zai-avatar.png",
          created_at: "2026-04-27T10:00:00Z",
        },
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  ),
);
const result = await service.handleCallback(
  `zcode://zai-auth/callback?code=zai-code-001&state=${state}`,
);

expect(fetchMock).toHaveBeenCalledTimes(1);
expect(fetchMock).toHaveBeenNthCalledWith(
  1,
  ZAI_OAUTH_PROVIDER_CONFIG.tokenUrl,
  expect.objectContaining({
    method: "POST",
    headers: { "Content-Type": "application/json" },
  }),
);

const tokenCall = fetchMock.mock.calls[0];
if (!tokenCall) {
  throw new Error("missing token call");
}
const tokenInit = tokenCall[1] as RequestInit;
expect(JSON.parse(String(tokenInit.body))).toEqual({
  code: "zai-code-001",
  redirect_uri: ZAI_OAUTH_PROVIDER_CONFIG.redirectUri,
  state,
});

expect(result).toEqual({
  kind: "session",
  provider: ZAI_PROVIDER_ID,
  userInfo: {
    id: "zai-u-001",
    username: "user@example.com",
    displayName: "user@example.com",
    avatarUrl: "https://example.com/zai-avatar.png",
  },
});

expect(await credentialServiceStub.load("oauth:zai:access_token")).toBe("zcode_backend_jwt");
expect(await credentialServiceStub.load("oauth:zai:refresh_token")).toBeNull();
expect(await credentialServiceStub.load("oauth:zai:user_info")).toBe(
  JSON.stringify(result.userInfo),
);
expect(await credentialServiceStub.load("oauth:active_provider")).toBe(ZAI_PROVIDER_ID);
```

- [ ] **Passo 3: Adicionar um teste de erro de negócio**

Adicionar este teste perto dos demais testes de callback do ZAI:

```ts
it("fails zai backend token exchange when business code is not zero", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  const service = createBigModelService({
    apiClient: createMockApiClient(fetchMock),
  });
  const { state } = await service.startOAuth(ZAI_PROVIDER_ID);

  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        code: 10001,
        msg: "invalid oauth code",
        data: null,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );

  await expect(
    service.handleCallback(`zcode://zai-auth/callback?code=bad-code&state=${state}`),
  ).rejects.toThrow(/invalid oauth code/);

  expect(await credentialServiceStub.load("oauth:zai:access_token")).toBeNull();
  expect(await credentialServiceStub.load("oauth:active_provider")).toBeNull();
});
```

- [ ] **Passo 4: Adicionar um teste de token ausente**

Adicionar este teste após o teste de erro de negócio:

```ts
it("fails zai backend token exchange when response misses data token", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  const service = createBigModelService({
    apiClient: createMockApiClient(fetchMock),
  });
  const { state } = await service.startOAuth(ZAI_PROVIDER_ID);

  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        code: 0,
        msg: "",
        data: {
          expires_in: 86400,
          user: {
            user_id: "zai-u-001",
            email: "user@example.com",
          },
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );

  await expect(
    service.handleCallback(`zcode://zai-auth/callback?code=zai-code-001&state=${state}`),
  ).rejects.toThrow(/data.token/);

  expect(await credentialServiceStub.load("oauth:zai:access_token")).toBeNull();
  expect(await credentialServiceStub.load("oauth:active_provider")).toBeNull();
});
```

- [ ] **Passo 5: Adicionar um teste direto de conversão de expires_in do adapter**

Atualizar o bloco de importações para incluir o adapter:

```ts
import { ZaiProviderAdapter } from "../src/oauth/providers/zaiProviderAdapter.js";
```

Adicionar este teste perto dos demais testes do ZAI:

```ts
it("maps zai backend expires_in into OAuthTokenSet expiresAt", async () => {
  const fetchMock = vi.fn<typeof fetch>();
  const adapter = new ZaiProviderAdapter(
    {
      ...ZAI_OAUTH_PROVIDER_CONFIG,
      enabled: true,
    },
    createMockApiClient(fetchMock),
  );
  const now = 1_800_000_000_000;

  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        code: 0,
        msg: "",
        data: {
          token: "zcode_backend_jwt",
          expires_in: 86400,
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    ),
  );

  await expect(
    adapter.exchangeToken(
      { code: "zai-code-001", state: "state-001" },
      {
        providerId: ZAI_PROVIDER_ID,
        state: "state-001",
        redirectUri: ZAI_OAUTH_PROVIDER_CONFIG.redirectUri,
        now: () => now,
      },
    ),
  ).resolves.toEqual({
    accessToken: "zcode_backend_jwt",
    expiresAt: now + 86400 * 1000,
  });
});
```

- [ ] **Passo 6: Executar o teste focado e verificar RED**

Executar:

```bash
pnpm vitest run packages/services/test/oauthService.test.ts
```

Esperado: FAIL. As falhas devem apontar para a URL de autorização antiga do ZAI, para o body de token codificado em form, para os campos antigos de access token e para a requisição extra antiga de userinfo.

## Tarefa 2: Implementar a troca de token OAuth do backend ZAI

**Arquivos:**
- Modificar: `packages/services/src/oauth/providers/zaiProviderConfig.ts:5`
- Modificar: `packages/services/src/oauth/providers/zaiProviderAdapter.ts:13`
- Testar: `packages/services/test/oauthService.test.ts`

- [ ] **Passo 1: Atualizar os endpoints padrão do provider ZAI**

Em `packages/services/src/oauth/providers/zaiProviderConfig.ts`, alterar a config padrão para:

```ts
export const ZAI_OAUTH_PROVIDER_CONFIG: Omit<OAuthProviderRuntimeConfig, "appSecret"> = {
  id: ZAI_PROVIDER_ID,
  displayName: "Z.AI",
  enabled: true,
  order: 1,
  authorizeUrl: "https://chat.z.ai/api/oauth/authorize",
  tokenUrl: "https://zcode.z.ai/api/v1/oauth/token",
  userinfoUrl: "https://chat.z.ai/api/oauth/userinfo",
  appId: "client_P8X5CMWmlaRO9gyO-KSqtg",
  redirectUri: "zcode://zai-auth/callback",
  legacyRedirectUri: "zcode://oauth/callback",
};
```

- [ ] **Passo 2: Substituir os tipos de payload de token do ZAI**

Em `packages/services/src/oauth/providers/zaiProviderAdapter.ts`, substituir `ZaiTokenPayload` por:

```ts
interface ZaiBackendTokenPayload {
  code?: number;
  msg?: string;
  data?: {
    token?: string;
    expires_in?: number;
    user?: ZaiBackendUserPayload;
  } | null;
}

interface ZaiBackendUserPayload {
  user_id?: string;
  email?: string;
  avatar?: string;
  created_at?: string;
}
```

- [ ] **Passo 3: Substituir o helper de expiração e adicionar helpers de resposta do backend**

Substituir o helper antigo `normalizeExpiresAt` por:

```ts
function normalizeExpiresIn(raw: number | undefined, now: () => number): number | undefined {
  if (!raw || !Number.isFinite(raw)) {
    return undefined;
  }

  return now() + raw * 1000;
}

function toBackendUserProfile(user: ZaiBackendUserPayload | undefined): OAuthUserProfile {
  if (!user) {
    return {
      id: "unknown",
      username: "user",
      displayName: "User",
    };
  }

  const id = user.user_id ?? "unknown";
  const username = user.email ?? id;

  return {
    id,
    username,
    displayName: username,
    ...(user.avatar ? { avatarUrl: user.avatar } : {}),
  };
}
```

- [ ] **Passo 4: Adicionar um campo de cache de usuário do backend**

Dentro de `ZaiProviderAdapter`, abaixo de `readonly apiClient: ApiClient;`, adicionar:

```ts
private lastBackendUserProfile: {
  state: string;
  profile: OAuthUserProfile;
} | null = null;
```

- [ ] **Passo 5: Substituir a implementação de `exchangeToken`**

Substituir o método `exchangeToken` inteiro por:

```ts
async exchangeToken(
  params: OAuthCallbackParams,
  context: OAuthProviderContext,
): Promise<OAuthTokenSet> {
  const tokenPayload = await readApiJson<ZaiBackendTokenPayload>(this.apiClient, this.config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code: params.code,
      redirect_uri: context.redirectUri,
      state: context.state,
    }),
  });

  if (tokenPayload.code !== 0) {
    throw new Error(tokenPayload.msg?.trim() || "Falha na troca de token do backend ZAI");
  }

  const accessToken = tokenPayload.data?.token;
  if (!accessToken) {
    throw new Error("Falha na troca de token: resposta sem data.token");
  }

  this.lastBackendUserProfile = {
    state: context.state,
    profile: toBackendUserProfile(tokenPayload.data?.user ?? undefined),
  };
  const expiresAt = normalizeExpiresIn(tokenPayload.data?.expires_in, context.now);

  return {
    accessToken,
    ...(expiresAt ? { expiresAt } : {}),
  };
}
```

- [ ] **Passo 6: Tornar o mapeamento de usuário do callback disponível para `fetchUserInfo`**

No início de `fetchUserInfo`, antes da chamada remota `readApiJson`, adicionar:

```ts
if (this.lastBackendUserProfile?.state === _context.state) {
  const profile = this.lastBackendUserProfile.profile;
  this.lastBackendUserProfile = null;
  return profile;
}
```

Manter a implementação remota antiga de `fetchUserInfo` após esse branch, por compatibilidade com `restoreSession()`. A guarda de state evita que um callback OAuth de assinatura do ZAI deixe um perfil em cache obsoleto que um login ou fluxo de restauração posterior consuma.

- [ ] **Passo 7: Executar o teste focado e verificar GREEN**

Executar:

```bash
pnpm vitest run packages/services/test/oauthService.test.ts
```

Esperado: PASS para `packages/services/test/oauthService.test.ts`.

## Tarefa 3: Atualizar a documentação de OAuth

**Arquivos:**
- Modificar: `docs/oauth/oauth-multi-provider-implementation.md:62`

- [ ] **Passo 1: Atualizar as notas de runtime config do ZAI**

Sob `## 3. 运行时配置说明（Host Process）`, após a lista de variáveis de ambiente do ZAI, adicionar:

```md
ZAI 默认登录链路已切换为后端 JWT token 交换：

- 授权页：`https://chat.z.ai/api/oauth/authorize`
- token 交换：`https://zcode.z.ai/api/v1/oauth/token`
- 桌面端请求体：`{ code, redirect_uri, state }`
- 本地保存的 `oauth:zai:access_token` 是后端返回的 `data.token`
```

- [ ] **Passo 2: Adicionar uma seção incremental**

Antes do `## 4. 验证结果` atual, adicionar:

```md
## 4. ZAI 后端 JWT 登录链路（增量）

ZAI OAuth 登录不再由桌面端直接请求三方 ZAI token 接口。桌面端只负责打开授权页、接收 `zcode://zai-auth/callback` deep link，并把 `code`、`redirect_uri`、`state` 传给后端 `https://zcode.z.ai/api/v1/oauth/token`。

后端完成 z.ai token 交换、userinfo 拉取、用户创建与 JWT 签发。客户端把响应中的 `data.token` 保存为 `oauth:zai:access_token`，把 `data.user` 映射为 `oauth:zai:user_info`，并把 `oauth:active_provider` 设置为 `zai`。
```

Depois, renumerar exatamente estes títulos existentes:

```md
## 4. 验证结果
```

para:

```md
## 5. 验证结果
```

e continuar incrementando em um cada título numérico de primeiro nível posterior, de modo que o antigo `## 7. OAuth 后预置模型供应商补齐（ZAI）` passe a ser `## 8. OAuth 后预置模型供应商补齐（ZAI）`.

- [ ] **Passo 3: Nenhum teste de doc focado é necessário**

Esta é uma tarefa somente de documentação. A verificação acontece na Tarefa 4.

## Tarefa 4: Executar a Verificação Obrigatória

**Arquivos:**
- Verificar todos os arquivos alterados.

- [ ] **Passo 1: Executar os testes OAuth focados**

Executar:

```bash
pnpm vitest run packages/services/test/oauthService.test.ts
```

Esperado: PASS.

- [ ] **Passo 2: Executar o typecheck**

Executar:

```bash
pnpm typecheck
```

Esperado: PASS.

- [ ] **Passo 3: Executar o lint**

Executar:

```bash
pnpm lint
```

Esperado: PASS.

- [ ] **Passo 4: Inspecionar o git diff**

Executar:

```bash
git diff -- packages/services/test/oauthService.test.ts packages/services/src/oauth/providers/zaiProviderConfig.ts packages/services/src/oauth/providers/zaiProviderAdapter.ts docs/oauth/oauth-multi-provider-implementation.md
```

Esperado: o diff contém apenas as alterações de token OAuth do backend ZAI e a documentação.

## Auto-revisão

- Cobertura da spec: o plano cobre URL de autorização, URL de token do backend, body da requisição JSON, persistência do JWT, mapeamento de usuário, erros de negócio, erros de token ausente, documentação, `typecheck` e `lint`.
- Varredura de placeholders: nenhum placeholder inacabado ou passo de implementação não especificado foi deixado de propósito.
- Consistência de tipos: os nomes de payload dos testes usam campos de resposta do backend (`token`, `expires_in`, `user_id`, `email`, `avatar`); a implementação mapeia esses campos para o `OAuthTokenSet` e o `OAuthUserProfile` existentes.
