# Plano de Implementação do Login OAuth BigModel

> **Para workers agentivos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Substituir o login por usuário/senha pelo OAuth do BigModel, tornando o login opcional (não bloqueante).

**Arquitetura:** Um novo IOAuthService no processo host trata da lógica de negócio do OAuth (state, PKCE, troca de token). O processo main apenas registra o protocolo custom e roteia deep links via mapeamento state→windowId. A UI usa LoginDialog (do WelcomeScreen) com o hook useOAuth. O estado de autenticação é unificado em uma store Zustand.

**Stack técnico:** Electron 41, React 19, Zustand 5, TypeScript, monorepo pnpm, shadcn UI

**Spec de Design:** `docs/superpowers/specs/2026-03-31-bigmodel-oauth-login-design.md`

---

## Estrutura de Arquivos

### Novos arquivos
| Arquivo | Responsabilidade |
|---|---|
| `packages/shared/src/oauth.ts` | Constantes de configuração do OAuth |
| `packages/services/src/oauth/oauth.ts` | Interface IOAuthService + descriptor |
| `packages/services/src/oauth/oauthService.ts` | Implementação Node.js do OAuthService (state, PKCE, troca de token) |
| `packages/ui/src/hooks/useOAuth.ts` | Hook do fluxo de login OAuth (startLogin + estado de UI) |
| `packages/ui/src/hooks/useTokenRefresh.ts` | Hook de refresh de token (permanente em Root/App) |
| `packages/ui/src/WelcomeScreen.tsx` | Conteúdo substituído pelo componente LoginDialog (mantém o arquivo, troca conteúdo e nome de export) |

### Arquivos modificados
| Arquivo | Mudança |
|---|---|
| `packages/shared/src/channels.ts` | ServiceChannels +OAuth; PlatformChannels +OpenExternal/OAuthRegisterState/OAuthCallback/RendererReady; -LoginSuccess/-Logout |
| `packages/shared/src/platform.ts` | IPlatformService +openExternal/registerOAuthState/onOAuthCallback/notifyRendererReady; -loginSuccess/-logout |
| `packages/shared/src/test-ids.ts` | Remove TIDs antigos de login, adiciona TIDs de OAuth |
| `packages/services/src/accessor.ts` | +oauthService |
| `packages/services/src/index.ts` | +export de IOAuthService |
| `packages/services/src/node.ts` | +registro de createOAuthService |
| `packages/client/src/remoteServiceAccess.ts` | +proxy oauthService |
| `packages/desktop/src/host/index.ts` | ServiceCollection do modo Remote +IOAuthService |
| `packages/client/src/globals.d.ts` | +openExternal/registerOAuthState/onOAuthCallback/notifyRendererReady; -loginSuccess/-logout |
| `packages/desktop/src/preload/index.ts` | +métodos OAuth; -loginSuccess/-logout |
| `packages/desktop/src/renderer/src/main.tsx` | Reforma da implementação de platform; -skipAuth/-loginSuccess/-logout |
| `packages/desktop/src/main/index.ts` | +registro de protocolo/roteamento de deep link/state; -createLoginWindow/-hasAuthToken/-IPC LoginSuccess/-Logout |
| `packages/desktop/vite.config.ts` | Remove a entrada login.html |
| `packages/desktop/electron-builder.config.js` | +configuração de protocols |
| `packages/ui/src/Root.tsx` | Remove mock auth; useState→Zustand; +escuta de callback OAuth; +useTokenRefresh; -WelcomeScreen/-skipAuth; +gerenciamento de estado do LoginDialog |
| `packages/ui/src/App.tsx` | Canto superior direito: exibe botão de login quando deslogado, botão de logout quando logado; +prop onLogin |
| `packages/ui/src/store/index.ts` | Remove o relacionado a MOCK_USER; adiciona o campo oauthError para passar erro de Root→LoginDialog |
| `packages/web/src/main.tsx` | Adaptação de platform (-loginSuccess/-logout; +implementações vazias) |
| `AGENTS.md` | Atualiza a lista de permitidos de window.zcode |

### Arquivos excluídos
| Arquivo |
|---|
| `packages/desktop/src/renderer/src/login.tsx` |
| `packages/desktop/src/renderer/login.html` |
| `packages/desktop/test/e2e/pages/login.page.ts` |
| `packages/desktop/test/e2e/login.test.ts` |
| `packages/desktop/test/e2e/login-extended.test.ts` |

---

## Tarefa 1: Camada Shared — Channels, configuração OAuth, tipos de Platform, Test IDs

**Arquivos:**
- Modificar: `packages/shared/src/channels.ts`
- Criar: `packages/shared/src/oauth.ts`
- Modificar: `packages/shared/src/platform.ts`
- Modificar: `packages/shared/src/test-ids.ts`
- Modificar: `packages/shared/src/index.ts` (exporta oauth)

- [ ] **Passo 1: modificar channels.ts — adicionar channels de OAuth, remover LoginSuccess/Logout**

Em `packages/shared/src/channels.ts`:

ServiceChannels ganha OAuth (após FileWatcher):
```ts
  /** 文件系统监视服务 */
  FileWatcher: "file-watcher",
  /** OAuth 认证服务 */
  OAuth: "oauth",
} as const;
```

PlatformChannels remove LoginSuccess e Logout e adiciona o relacionado a OAuth:
```ts
export const PlatformChannels = {
  /** 打开系统目录选择框 */
  SelectDirectory: "zcode:select-directory",
  /** 检查目录是否已在其他窗口打开，如果是则激活该窗口 */
  ActivateOrSetWorkspace: "zcode:activate-or-set-workspace",
  /** 建立 SSH 远程连接 */
  ConnectRemote: "zcode:connect-remote",
  /** Renderer 日志转发到 main 进程统一存储 */
  Log: "zcode:log",
  /** Renderer → Main：同步当前窗口所有 tab 的 workspace 路径 */
  SyncWindowTabs: "zcode:sync-window-tabs",
  /** Main → Renderer：聚焦到指定 workspace 路径的 tab */
  FocusTab: "zcode:focus-tab",
  /** Main → Renderer：菜单触发新建 tab */
  NewTab: "zcode:new-tab",
  /** Main → Renderer：菜单触发新建任务 */
  NewTask: "zcode:new-task",
  /** Renderer → Main：把本地工作区加入系统最近文档 */
  AddRecentDocument: "zcode:add-recent-document",
  /** 获取进程指标（进程树形式） */
  GetProcessMetrics: "zcode:get-process-metrics",
  /** 打开进程监控窗口（其他窗口触发） */
  OpenProcessMonitor: "zcode:open-process-monitor",
  /** Renderer → Main：打开外部 URL（用于 OAuth 跳转浏览器） */
  OpenExternal: "zcode:open-external",
  /** Renderer → Main：上报 OAuth state 用于 deep link 路由 */
  OAuthRegisterState: "zcode:oauth-register-state",
  /** Main → Renderer：转发 deep link URL */
  OAuthCallback: "zcode:oauth-callback",
  /** Renderer → Main：renderer 已就绪，可接收缓存的 deep link */
  RendererReady: "zcode:renderer-ready",
} as const;
```

Remova também, em sincronia, as entradas LoginSuccess e Logout do PlatformChannelMap (remova `channels.ts` linhas 122-129).

- [ ] **Passo 2: criar oauth.ts — constantes de configuração do OAuth**

Crie `packages/shared/src/oauth.ts`:
```ts
/**
 * BigModel OAuth 配置
 *
 * Desktop 是 public client，不使用 clientSecret，通过 PKCE 保障安全。
 * tokenUrl、userinfoUrl、appId 的实际值待 BigModel 确认后填入。
 */
export const BIGMODEL_OAUTH_CONFIG = {
  authorizeUrl: "https://bigmodel.cn/login",
  /** 待确认：token 交换端点 */
  tokenUrl: "https://bigmodel.cn/api/oauth/token",
  /** 待确认：用户信息端点（可选） */
  userinfoUrl: "https://bigmodel.cn/api/oauth/userinfo",
  /** 待确认：应用 ID */
  appId: "zcode-bigmodel-app",
  redirectUri: "zcode://bigmodel-auth/callback",
} as const;
```

- [ ] **Passo 3: modificar platform.ts — remover loginSuccess/logout, adicionar métodos OAuth**

Substitua `packages/shared/src/platform.ts` por:
```ts
import type { SSHConnectOptions } from "./index.js";

/**
 * 平台操作接口 —— 替代直接访问 window.zcode
 *
 * 定义需要宿主环境（Electron main / Web server）参与的操作。
 * Desktop 和 Web 各自提供不同的实现，UI 层通过此接口统一消费。
 *
 * 设计原则：只放"必须穿越进程边界且不适合做成 RPC service"的操作，
 * 比如 native dialog、窗口生命周期控制等。
 * 业务服务（文件、终端、凭据等）走 IServiceAccessor 的 RPC 通道。
 */
export interface IPlatformService {
  /** 打开系统目录选择框，返回选中路径或 null */
  selectDirectory(): Promise<string | null>;

  /** 检查目录是否已在其他窗口打开；如果是则激活该窗口并切到对应 tab */
  activateOrSetWorkspace(path: string): Promise<{ activated: boolean }>;

  /** 建立 SSH 远程连接（Desktop: fork host process + SSH；Web: HTTP API） */
  connectRemote(options: SSHConnectOptions): Promise<{ success: boolean; error?: string }>;

  /** 打开外部 URL（用于 OAuth 跳转浏览器） */
  openExternal(url: string): void;

  /** 上报 OAuth state 给 main process，用于 deep link 路由 */
  registerOAuthState(state: string): void;

  /**
   * 注册 OAuth deep link 回调监听
   * @returns disposer 函数，调用后只移除当前回调
   */
  onOAuthCallback(callback: (url: string) => void): () => void;

  /** 通知 main process renderer 已就绪，触发缓存的冷启动 deep link 转发 */
  notifyRendererReady(): void;

  /** 同步当前窗口所有 tab 的 workspace 路径到 main 进程（用于跨窗口去重） */
  syncWindowTabs(paths: string[]): void;

  /** 注册 main 进程要求聚焦某个 workspace tab 的回调 */
  onFocusTab(handler: (path: string) => void): void;

  /** 注册 main 进程触发新建 tab 的回调 */
  onNewTab(handler: () => void): void;

  /** 注册 main 进程触发新建任务的回调 */
  onNewTask(handler: () => void): void;

  /** 让宿主环境把本地工作区加入系统最近文档列表 */
  addRecentDocument(path: string): void;
}
```

- [ ] **Passo 4: modificar test-ids.ts — remover TIDs antigos de login, adicionar TIDs de OAuth**

Remova `TID_LOGIN_FORM`, `TID_USERNAME_INPUT`, `TID_PASSWORD_INPUT`, `TID_LOGIN_BUTTON`, `TID_LOGIN_ERROR`.

Adicione:
```ts
/** 右上角登录触发按钮 */
export const TID_LOGIN_TRIGGER = "login-trigger";
/** OAuth 弹窗内的登录按钮 */
export const TID_OAUTH_LOGIN_BUTTON = "oauth-login-button";
export const TID_OAUTH_CANCEL = "oauth-cancel";
export const TID_OAUTH_ERROR = "oauth-error";
```

- [ ] **Passo 5: modificar index.ts — exportar o módulo oauth**

Adicione o export em `packages/shared/src/index.ts`:
```ts
export { BIGMODEL_OAUTH_CONFIG } from "./oauth.js";
```

- [ ] **Passo 6: verificar**

Run: `cd packages/shared && pnpm typecheck && pnpm lint`

- [ ] **Passo 7: commitar**

```bash
git add packages/shared/src/channels.ts packages/shared/src/oauth.ts packages/shared/src/platform.ts packages/shared/src/test-ids.ts packages/shared/src/index.ts
git commit -m "feat(shared): add OAuth channels, config, and platform types; remove login/logout"
```

---

## Tarefa 2: Interface IOAuthService + Descriptor

**Arquivos:**
- Criar: `packages/services/src/oauth/oauth.ts`

- [ ] **Passo 1: criar a interface IOAuthService**

Crie `packages/services/src/oauth/oauth.ts`:
```ts
import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";
import type { UserInfo } from "@zcode/shared";

/**
 * OAuth 认证服务
 *
 * 在 host process 中运行，负责 OAuth 流程的全部业务逻辑：
 * state 生成、PKCE、token 交换、凭据存储。
 * Renderer 通过 RPC 调用，不直接接触 OAuth 细节。
 */
export interface IOAuthService {
  /**
   * 发起 OAuth：生成 state + PKCE，返回完整的 authorize URL 和 state
   * state 由 renderer 上报给 main process 用于 deep link 路由
   */
  startOAuth(): Promise<{ authorizeUrl: string; state: string }>;

  /**
   * 处理 OAuth 回调：校验 state，用 code + code_verifier 换 token，存凭据
   * @param url - 完整的 deep link URL (zcode://bigmodel-auth/callback?code=xxx&state=xxx)
   */
  handleCallback(url: string): Promise<UserInfo>;

  /**
   * 刷新 token
   * @param refreshToken - 当前的 refresh_token
   */
  refreshToken(refreshToken: string): Promise<void>;

  /** 清理所有 pending state 和超时定时器 */
  cancelPending(): Promise<void>;
}

export const IOAuthService = createServiceDescriptor<IOAuthService>(ServiceChannels.OAuth);
```

- [ ] **Passo 2: verificar**

Run: `cd packages/services && pnpm typecheck`

- [ ] **Passo 3: commitar**

```bash
git add packages/services/src/oauth/oauth.ts
git commit -m "feat(services): add IOAuthService interface and descriptor"
```

---

## Tarefa 3: Implementação do OAuthService

**Arquivos:**
- Criar: `packages/services/src/oauth/oauthService.ts`

- [ ] **Passo 1: implementar o OAuthService**

Crie `packages/services/src/oauth/oauthService.ts`:
```ts
import { randomBytes, createHash } from "node:crypto";
import { BIGMODEL_OAUTH_CONFIG } from "@zcode/shared";
import type { UserInfo } from "@zcode/shared";
import type { IOAuthService } from "./oauth.js";
import type { ICredentialService } from "../credential/credential.js";

/** 凭据存储 key */
const AUTH_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_INFO_KEY = "user_info";

/** OAuth 超时时间（5 分钟） */
const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

interface PendingState {
  codeVerifier: string;
  timeout: NodeJS.Timeout;
}

/**
 * 生成 PKCE code_verifier（43-128 字符的随机 URL-safe 字符串）
 */
function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * 根据 code_verifier 生成 code_challenge（S256 方式）
 */
function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

/**
 * OAuth 认证服务实现
 *
 * 在 host process 中运行，管理 OAuth 流程的完整生命周期。
 * 注入 ICredentialService 用于凭据存储。
 */
export class OAuthService implements IOAuthService {
  private pendingStates = new Map<string, PendingState>();

  constructor(private credentialService: ICredentialService) {}

  async startOAuth(): Promise<{ authorizeUrl: string; state: string }> {
    // 生成随机 state（防 CSRF）
    const state = randomBytes(32).toString("hex");

    // 生成 PKCE code_verifier 和 code_challenge
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);

    // 设置超时自动清理
    const timeout = setTimeout(() => {
      this.pendingStates.delete(state);
    }, OAUTH_TIMEOUT_MS);

    this.pendingStates.set(state, { codeVerifier, timeout });

    // 构建 authorize URL
    const params = new URLSearchParams({
      redirect: BIGMODEL_OAUTH_CONFIG.redirectUri,
      appId: BIGMODEL_OAUTH_CONFIG.appId,
      state,
      code_challenge: codeChallenge,
      code_challenge_method: "S256",
    });

    const authorizeUrl = `${BIGMODEL_OAUTH_CONFIG.authorizeUrl}?${params.toString()}`;

    return { authorizeUrl, state };
  }

  async handleCallback(url: string): Promise<UserInfo> {
    // 解析回调 URL
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    const state = parsed.searchParams.get("state");

    if (!code || !state) {
      throw new Error("OAuth 回调缺少 code 或 state 参数");
    }

    // 校验 state
    const pending = this.pendingStates.get(state);
    if (!pending) {
      throw new Error("OAuth state 不匹配或已过期");
    }

    // 匹配后立即删除（防重放）
    clearTimeout(pending.timeout);
    this.pendingStates.delete(state);

    // 用 code + code_verifier 换 token
    const tokenResponse = await fetch(BIGMODEL_OAUTH_CONFIG.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code,
        code_verifier: pending.codeVerifier,
        redirect_uri: BIGMODEL_OAUTH_CONFIG.redirectUri,
        app_id: BIGMODEL_OAUTH_CONFIG.appId,
        grant_type: "authorization_code",
      }),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text().catch(() => "unknown error");
      throw new Error(`Token 交换失败: ${tokenResponse.status} ${errorText}`);
    }

    const tokenData = (await tokenResponse.json()) as {
      access_token: string;
      refresh_token?: string;
      user_id?: string;
      username?: string;
    };

    // 存储 token
    await this.credentialService.save(AUTH_TOKEN_KEY, tokenData.access_token);
    if (tokenData.refresh_token) {
      await this.credentialService.save(REFRESH_TOKEN_KEY, tokenData.refresh_token);
    }

    // 尝试获取用户信息（可选）
    let userInfo: UserInfo = {
      id: tokenData.user_id ?? "unknown",
      username: tokenData.username ?? "user",
      displayName: tokenData.username ?? "User",
    };

    try {
      const userinfoResponse = await fetch(BIGMODEL_OAUTH_CONFIG.userinfoUrl, {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoResponse.ok) {
        const data = (await userinfoResponse.json()) as {
          id?: string;
          username?: string;
          display_name?: string;
        };
        userInfo = {
          id: data.id ?? userInfo.id,
          username: data.username ?? userInfo.username,
          displayName: data.display_name ?? data.username ?? userInfo.displayName,
        };
      }
    } catch {
      // 获取用户信息失败不阻塞登录
    }

    // 缓存用户信息
    await this.credentialService.save(USER_INFO_KEY, JSON.stringify(userInfo));

    return userInfo;
  }

  async refreshToken(refreshToken: string): Promise<void> {
    const response = await fetch(BIGMODEL_OAUTH_CONFIG.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refresh_token: refreshToken,
        app_id: BIGMODEL_OAUTH_CONFIG.appId,
        grant_type: "refresh_token",
      }),
    });

    if (!response.ok) {
      throw new Error(`Token 刷新失败: ${response.status}`);
    }

    const data = (await response.json()) as {
      access_token: string;
      refresh_token?: string;
    };

    await this.credentialService.save(AUTH_TOKEN_KEY, data.access_token);
    if (data.refresh_token) {
      await this.credentialService.save(REFRESH_TOKEN_KEY, data.refresh_token);
    }
  }

  async cancelPending(): Promise<void> {
    for (const [state, pending] of this.pendingStates) {
      clearTimeout(pending.timeout);
      this.pendingStates.delete(state);
    }
  }
}

/**
 * 工厂函数：创建 OAuthService 实例
 *
 * @param credentialService - 凭据服务，用于存储 token
 */
export function createOAuthService(credentialService: ICredentialService): IOAuthService {
  return new OAuthService(credentialService);
}
```

- [ ] **Passo 2: verificar**

Run: `cd packages/services && pnpm typecheck`

- [ ] **Passo 3: commitar**

```bash
git add packages/services/src/oauth/oauthService.ts
git commit -m "feat(services): implement OAuthService with PKCE, state management, token exchange"
```

---

## Tarefa 4: Service Wiring — Accessor, Index, Node, RemoteServiceAccess

**Arquivos:**
- Modificar: `packages/services/src/accessor.ts`
- Modificar: `packages/services/src/index.ts`
- Modificar: `packages/services/src/node.ts`
- Modificar: `packages/client/src/remoteServiceAccess.ts`
- Modificar: `packages/desktop/src/host/index.ts`

- [ ] **Passo 1: modificar accessor.ts — adicionar oauthService**

Em `packages/services/src/accessor.ts`, adicione o import após a linha 8 e o campo após a linha 19:
```ts
import type { IOAuthService } from "./oauth/oauth.js";
```
```ts
  readonly oauthService: IOAuthService;
```

- [ ] **Passo 2: modificar index.ts — exportar o módulo OAuth**

Adicione ao final de `packages/services/src/index.ts`:
```ts
// OAuth service — IOAuthService is both a type (interface) and value (descriptor)
export { IOAuthService } from "./oauth/oauth.js";
```

- [ ] **Passo 3: modificar node.ts — registrar o OAuthService**

Em `packages/services/src/node.ts`:

Adicione os imports:
```ts
import { IOAuthService } from "./oauth/oauth.js";
import { createOAuthService } from "./oauth/oauthService.js";
```

Adicione o export:
```ts
export { createOAuthService } from "./oauth/oauthService.js";
```

Adicione na cadeia de ServiceCollection da função `createLocalServices`:
```ts
    .register(IFileWatcherService, createFileWatcherService())
    .register(IOAuthService, createOAuthService(createCredentialService()));
```

Atenção: o OAuthService precisa receber o credentialService por injeção. Como em `createLocalServices` cada serviço é criado de forma independente (sem compartilhar instâncias), criamos aqui um credentialService separado para uso do OAuthService. Ambos leem e escrevem o mesmo arquivo, portanto os dados são consistentes.

- [ ] **Passo 4: modificar remoteServiceAccess.ts — adicionar o proxy oauthService**

Em `packages/client/src/remoteServiceAccess.ts`:

Adicione o import:
```ts
import {
  ...existing imports,
  IOAuthService,
} from "@zcode/services";
```

Adicione o campo e a inicialização no construtor:
```ts
  readonly oauthService: IOAuthService;
```
```ts
    this.oauthService = ProxyChannel.toService<IOAuthService>(
      channelClient.getChannel(IOAuthService.channelName),
    );
```

- [ ] **Passo 5: modificar host/index.ts — registrar IOAuthService no modo Remote**

Em `packages/desktop/src/host/index.ts`:

O ServiceCollection do modo Remote (branch `InitRemote`) não passa por `createLocalServices()`, então é preciso registrar o IOAuthService manualmente.

Adicione os imports:
```ts
import { IOAuthService } from "@zcode/services";
import { createOAuthService, createCredentialService } from "@zcode/services/node";
```

Adicione na cadeia `new ServiceCollection()` do modo remote (OAuth é uma operação local, não passa por SSH):
```ts
    .register(IFileWatcherService, connection.services.fileWatcherService)
    .register(IOAuthService, createOAuthService(createCredentialService()));
```

- [ ] **Passo 6: verificar**

Run: `pnpm typecheck`

- [ ] **Passo 6: commitar**

```bash
git add packages/services/src/accessor.ts packages/services/src/index.ts packages/services/src/node.ts packages/client/src/remoteServiceAccess.ts packages/desktop/src/host/index.ts
git commit -m "feat(services): wire IOAuthService into accessor, registry, remote proxy, and host process"
```

---

## Tarefa 5: Preload Bridge + globals.d.ts

**Arquivos:**
- Modificar: `packages/desktop/src/preload/index.ts`
- Modificar: `packages/client/src/globals.d.ts`

- [ ] **Passo 1: modificar preload/index.ts — remover loginSuccess/logout, adicionar métodos OAuth**

Substitua `packages/desktop/src/preload/index.ts` por:
```ts
import { contextBridge, ipcRenderer } from "electron";
import type { SSHConnectOptions } from "@zcode/shared";
import { PlatformChannels, InternalChannels } from "@zcode/shared";

/**
 * Preload bridge —— 仅暴露需要 main 进程参与的平台操作
 *
 * 凭据管理已迁移到 host process 的 ICredentialService，
 * 通过 MessagePort RPC 访问，不再经过此 bridge。
 *
 * loginSuccess/logout 已删除：登录/登出不再涉及窗口切换，
 * 完全在 UI/Hook 层通过 credentialService + Zustand 处理。
 */
contextBridge.exposeInMainWorld("zcode", {
  connectRemote: (options: SSHConnectOptions) =>
    ipcRenderer.invoke(PlatformChannels.ConnectRemote, options),
  /** renderer 日志通过 IPC 传到 main 进程统一存储 */
  log: (level: "info" | "warn" | "error", args: unknown[]) =>
    ipcRenderer.send(PlatformChannels.Log, { level, args }),
  /** 打开系统目录选择框，返回选中路径或 null */
  selectDirectory: (): Promise<string | null> =>
    ipcRenderer.invoke(PlatformChannels.SelectDirectory),
  /** 检查目录是否已在其他窗口打开 */
  activateOrSetWorkspace: (path: string): Promise<{ activated: boolean }> =>
    ipcRenderer.invoke(PlatformChannels.ActivateOrSetWorkspace, path),
  /** 同步当前窗口所有 tab 的 workspace 路径到 main 进程 */
  syncWindowTabs: (paths: string[]) => ipcRenderer.send(PlatformChannels.SyncWindowTabs, paths),
  /** 注册 main 进程要求聚焦指定 workspace tab 的回调 */
  onFocusTab: (callback: (path: string) => void) => {
    ipcRenderer.on(PlatformChannels.FocusTab, (_event, path: string) => callback(path));
  },
  /** 注册 main 进程触发新建 tab 的回调 */
  onNewTab: (callback: () => void) => {
    ipcRenderer.on(PlatformChannels.NewTab, () => callback());
  },
  /** 注册 main 进程触发新建任务的回调 */
  onNewTask: (callback: () => void) => {
    ipcRenderer.on(PlatformChannels.NewTask, () => callback());
  },
  /** 让宿主环境把本地工作区加入系统最近文档列表 */
  addRecentDocument: (path: string) => ipcRenderer.send(PlatformChannels.AddRecentDocument, path),
  /** 打开外部 URL（用于 OAuth 跳转浏览器） */
  openExternal: (url: string) => ipcRenderer.send(PlatformChannels.OpenExternal, url),
  /** 上报 OAuth state 用于 deep link 路由 */
  registerOAuthState: (state: string) =>
    ipcRenderer.send(PlatformChannels.OAuthRegisterState, state),
  /** 注册 OAuth deep link 回调，返回 disposer */
  onOAuthCallback: (cb: (url: string) => void): (() => void) => {
    const handler = (_: unknown, url: string) => cb(url);
    ipcRenderer.on(PlatformChannels.OAuthCallback, handler);
    return () => ipcRenderer.removeListener(PlatformChannels.OAuthCallback, handler);
  },
  /** 通知 main process renderer 已就绪 */
  notifyRendererReady: () => ipcRenderer.send(PlatformChannels.RendererReady),
});

/**
 * MessagePort 不能通过 contextBridge 传递（contextBridge 会把它包成 Proxy，
 * 丢失 addEventListener 等原生方法）。改用 window.postMessage 的 transfer
 * 机制将 MessagePort 原样传递到 renderer 的 window context 中。
 */
ipcRenderer.on(InternalChannels.ServicePort, (event) => {
  const [port] = event.ports;
  if (port) {
    window.postMessage(InternalChannels.ServicePort, "*", [port]);
  }
});
```

- [ ] **Passo 2: modificar globals.d.ts — atualizar os tipos de window.zcode em sincronia**

Substitua `packages/client/src/globals.d.ts` por:
```ts
import type { SSHConnectOptions } from "@zcode/shared";

/**
 * window.zcode 类型定义 —— 仅包含需要 main 进程参与的平台操作
 *
 * 凭据管理已迁移到 ICredentialService（通过 RPC），不再经过此接口。
 * loginSuccess/logout 已删除：登录/登出不再涉及窗口切换。
 */
declare global {
  interface Window {
    zcode: {
      connectRemote(options: SSHConnectOptions): Promise<{ success: boolean; error?: string }>;
      /** renderer 日志通过 IPC 传到 main 进程统一存储 */
      log(level: "info" | "warn" | "error", args: unknown[]): void;
      /** 打开系统目录选择框，返回选中路径或 null */
      selectDirectory(): Promise<string | null>;
      /** 检查目录是否已在其他窗口打开 */
      activateOrSetWorkspace?(path: string): Promise<{ activated: boolean }>;
      /** 同步当前窗口所有 tab 的 workspace 路径到 main 进程 */
      syncWindowTabs(paths: string[]): void;
      /** 注册 main 进程要求聚焦指定 workspace tab 的回调 */
      onFocusTab(handler: (path: string) => void): void;
      /** 注册 main 进程触发新建 tab 的回调 */
      onNewTab(handler: () => void): void;
      /** 注册 main 进程触发新建任务的回调 */
      onNewTask(handler: () => void): void;
      /** 让宿主环境把本地工作区加入系统最近文档列表 */
      addRecentDocument(path: string): void;
      /** 打开外部 URL */
      openExternal(url: string): void;
      /** 上报 OAuth state 用于 deep link 路由 */
      registerOAuthState(state: string): void;
      /** 注册 OAuth deep link 回调，返回 disposer */
      onOAuthCallback(cb: (url: string) => void): () => void;
      /** 通知 main process renderer 已就绪 */
      notifyRendererReady(): void;
    };
  }
}
```

- [ ] **Passo 3: verificar**

Run: `pnpm typecheck`

- [ ] **Passo 4: commitar**

```bash
git add packages/desktop/src/preload/index.ts packages/client/src/globals.d.ts
git commit -m "feat(desktop): update preload bridge and globals.d.ts for OAuth; remove loginSuccess/logout"
```

---

## Tarefa 6: Processo Main — registro de protocolo, deep link, IPC

**Arquivos:**
- Modificar: `packages/desktop/src/main/index.ts`

Esta é a maior alteração. É preciso, em main/index.ts:
1. adicionar o registro do protocolo custom e o lock de instância única
2. adicionar as escutas de open-url / second-instance
3. adicionar o mapeamento state→windowId + cache de cold start
4. adicionar as escutas IPC de OpenExternal / OAuthRegisterState / RendererReady
5. remover a função createLoginWindow
6. remover a função hasAuthToken e o branch de startup correspondente
7. remover as escutas IPC de LoginSuccess / Logout
8. alterar o evento activate

- [ ] **Passo 1: adicionar registro de protocolo e lock de instância única no topo do arquivo (antes de app.whenReady)**

Adicione antes da chamada `app.whenReady()`:
```ts
// ============================================================================
// Custom Protocol 注册 + 单实例锁
// ============================================================================

// 注册 zcode:// 协议（必须在 ready 之前）
app.setAsDefaultProtocolClient("zcode");

// macOS: deep link 通过 open-url 事件传递（必须在 ready 之前注册）
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// 单实例锁：确保只有一个实例运行
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// Windows/Linux: 第二个实例启动时，deep link 通过命令行参数传入
app.on("second-instance", (_event, argv) => {
  const url = argv.find((arg) => arg.startsWith("zcode://"));
  if (url) handleDeepLink(url);

  // 聚焦已有窗口
  const win = BrowserWindow.getAllWindows()[0];
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});
```

- [ ] **Passo 2: adicionar tratamento de deep link e mapeamento state→windowId**

Adicione ao arquivo:
```ts
// ============================================================================
// OAuth deep link 路由
// ============================================================================

/** state → webContents.id 映射，用于把 deep link 路由到发起 OAuth 的窗口 */
const oauthStateToWindow = new Map<string, number>();

/** 冷启动时缓存的 deep link URL（仅冷启动场景使用，此时只有一个窗口在创建） */
let pendingDeepLinkUrl: string | null = null;

function handleDeepLink(url: string) {
  if (!url.startsWith("zcode://bigmodel-auth/callback")) return;

  let state: string | null = null;
  try {
    state = new URL(url).searchParams.get("state");
  } catch {
    logger.warn("[deep-link] 无法解析 URL:", url);
    return;
  }
  if (!state) return;

  const targetWindowId = oauthStateToWindow.get(state);
  const targetWindow = targetWindowId
    ? BrowserWindow.getAllWindows().find((w) => w.webContents.id === targetWindowId)
    : null;

  if (targetWindow) {
    targetWindow.webContents.send(PlatformChannels.OAuthCallback, url);
    oauthStateToWindow.delete(state);
  } else {
    // Renderer 尚未就绪（冷启动），缓存 URL，等 renderer ready 后再发送
    pendingDeepLinkUrl = url;
  }
}
```

- [ ] **Passo 3: adicionar as escutas IPC de OAuth dentro de app.whenReady()**

Adicione no callback de `app.whenReady()`:
```ts
  // OAuth: 注册 state → windowId 映射
  ipcMain.on(PlatformChannels.OAuthRegisterState, (event, state: string) => {
    oauthStateToWindow.set(state, event.sender.id);

    // 5 分钟超时自动清理，防止残留脏映射
    setTimeout(() => oauthStateToWindow.delete(state), 5 * 60 * 1000);
  });

  // OAuth: 打开外部 URL
  ipcMain.on(PlatformChannels.OpenExternal, (_event, url: string) => {
    shell.openExternal(url);
  });

  // OAuth: renderer 就绪后发送缓存的冷启动 deep link
  ipcMain.on(PlatformChannels.RendererReady, (event) => {
    if (pendingDeepLinkUrl) {
      event.sender.send(PlatformChannels.OAuthCallback, pendingDeepLinkUrl);
      pendingDeepLinkUrl = null;
    }
  });

  // 窗口关闭时清理该窗口的所有 state 映射
  app.on("browser-window-created", (_, win) => {
    win.on("closed", () => {
      for (const [state, id] of oauthStateToWindow) {
        if (id === win.webContents.id) oauthStateToWindow.delete(state);
      }
    });
  });
```

- [ ] **Passo 4: remover as escutas IPC de LoginSuccess / Logout**

Remova de `main/index.ts` os trechos `ipcMain.on(PlatformChannels.LoginSuccess, ...)` e `ipcMain.on(PlatformChannels.Logout, ...)` (por volta das linhas 832-847).

- [ ] **Passo 5: remover a função hasAuthToken e a leitura direta do arquivo de credenciais**

Remova de `main/index.ts` as linhas 175-195 com `credentialsDir`, `credentialsFile` e a função `hasAuthToken()`.

- [ ] **Passo 6: remover a função createLoginWindow**

Remova a função `createLoginWindow` por inteiro (por volta das linhas 528-566).

- [ ] **Passo 7: alterar a lógica de startup — sempre criar a janela principal**

Substitua o branch de startup em `app.whenReady()`:
```ts
  // 删除:
  // if (await hasAuthToken()) {
  //   createWindow();
  // } else {
  //   createLoginWindow();
  // }

  // 替换为：登录非强制，始终打开主窗口
  logger.info("[startup] 创建主窗口");
  createWindow();

  // Windows/Linux 冷启动：检查 process.argv 中的 deep link
  const protocolUrl = process.argv.find((arg) => arg.startsWith("zcode://"));
  if (protocolUrl) handleDeepLink(protocolUrl);
```

- [ ] **Passo 8: alterar o evento activate — não verifica mais o token**

Substitua `app.on("activate", ...)` por:
```ts
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
```

- [ ] **Passo 9: verificar**

Run: `pnpm typecheck`

- [ ] **Passo 10: commitar**

```bash
git add packages/desktop/src/main/index.ts
git commit -m "feat(desktop): add protocol registration, deep link routing; remove login window and auth gate"
```

---

## Tarefa 7: Implementação de platform no Desktop

**Arquivos:**
- Modificar: `packages/desktop/src/renderer/src/main.tsx`
- Modificar: `packages/web/src/main.tsx`

- [ ] **Passo 1: modificar desktop main.tsx — remover loginSuccess/logout, adicionar métodos OAuth, remover skipAuth**

Substitua o objeto `desktopPlatform` e a renderização do Root em `packages/desktop/src/renderer/src/main.tsx`:

```ts
// Desktop 平台操作实现：通过 preload bridge 调用 main 进程
const desktopPlatform: IPlatformService = {
  selectDirectory: () => window.zcode.selectDirectory(),
  activateOrSetWorkspace: (path) =>
    window.zcode.activateOrSetWorkspace?.(path) ?? Promise.resolve({ activated: false }),
  connectRemote: (options: SSHConnectOptions) => window.zcode.connectRemote(options),
  openExternal: (url) => window.zcode.openExternal(url),
  registerOAuthState: (state) => window.zcode.registerOAuthState(state),
  onOAuthCallback: (cb) => window.zcode.onOAuthCallback(cb),
  notifyRendererReady: () => window.zcode.notifyRendererReady(),
  syncWindowTabs: (paths) => window.zcode.syncWindowTabs(paths),
  onFocusTab: (handler) => window.zcode.onFocusTab(handler),
  onNewTab: (handler) => window.zcode.onNewTab(handler),
  onNewTask: (handler) => window.zcode.onNewTask(handler),
  addRecentDocument: (path) => window.zcode.addRecentDocument(path),
};
```

Remova a prop `skipAuth` na renderização do Root:
```tsx
      <Root
        services={services}
        platform={desktopPlatform}
        isDesktop
        isMacDesktop={isMacDesktop}
        restoreSession={restoreSession}
        supportsSettings={supportsSettings}
        initialWorkspaceAbsPath={initialWorkspaceAbsPath}
      />
```

- [ ] **Passo 2: modificar web main.tsx — remover loginSuccess/logout, adicionar implementações vazias de OAuth**

Substitua `webPlatform` em `packages/web/src/main.tsx`:
```ts
const webPlatform: IPlatformService = {
  selectDirectory: () => Promise.resolve(null),
  activateOrSetWorkspace: () => Promise.resolve({ activated: false }),
  async connectRemote(options: SSHConnectOptions) {
    const res = await fetch("/api/connect-remote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(options),
    });
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.error || "Connection failed" };
    }
    window.open(`?remote=${data.id}`, "_blank");
    return { success: true };
  },
  // OAuth 本次只支持 Desktop，Web 端空实现
  openExternal: () => {},
  registerOAuthState: () => {},
  onOAuthCallback: () => () => {},
  notifyRendererReady: () => {},
  syncWindowTabs: () => {},
  onFocusTab: () => {},
  onNewTab: () => {},
  onNewTask: () => {},
  addRecentDocument: () => {},
};
```

- [ ] **Passo 3: verificar**

Run: `pnpm typecheck`

- [ ] **Passo 4: commitar**

```bash
git add packages/desktop/src/renderer/src/main.tsx packages/web/src/main.tsx
git commit -m "feat(desktop,web): update platform implementations for OAuth; remove loginSuccess/logout"
```

---

## Tarefa 8: Hooks de UI — useOAuth + useTokenRefresh

**Arquivos:**
- Criar: `packages/ui/src/hooks/useOAuth.ts`
- Criar: `packages/ui/src/hooks/useTokenRefresh.ts`

- [ ] **Passo 1: criar o hook useOAuth**

Crie `packages/ui/src/hooks/useOAuth.ts`:
```ts
/**
 * useOAuth —— OAuth 登录流程 hook
 *
 * 仅负责发起登录和 UI 状态管理。
 * OAuth 回调监听在 Root/App 常驻层，不在此 hook 中。
 */
import { useState, useCallback } from "react";
import { useServices } from "./useServices.js";
import { usePlatform } from "./usePlatform.js";
import { logger } from "../logger.js";

export type OAuthStatus = "idle" | "waiting" | "error";

export function useOAuth() {
  const { oauthService } = useServices();
  const platform = usePlatform();
  const [status, setStatus] = useState<OAuthStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const startLogin = useCallback(async () => {
    try {
      setStatus("waiting");
      setError(null);

      // 1. RPC 调用 oauthService.startOAuth() 获取 authorize URL 和 state
      const { authorizeUrl, state } = await oauthService.startOAuth();

      // 2. 上报 state 给 main process 用于 deep link 路由
      platform.registerOAuthState(state);

      // 3. 打开浏览器
      platform.openExternal(authorizeUrl);

      logger.info("[useOAuth] OAuth 流程已启动，等待浏览器回调");
    } catch (err) {
      logger.error("[useOAuth] 启动 OAuth 失败:", err);
      setStatus("error");
      setError(err instanceof Error ? err.message : "启动登录失败");
    }
  }, [oauthService, platform]);

  const cancel = useCallback(async () => {
    await oauthService.cancelPending();
    setStatus("idle");
    setError(null);
  }, [oauthService]);

  const reset = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  /** 由 Root/App 层的回调监听器调用，更新 UI 状态 */
  const setOAuthError = useCallback((message: string) => {
    setStatus("error");
    setError(message);
  }, []);

  const setOAuthSuccess = useCallback(() => {
    setStatus("idle");
    setError(null);
  }, []);

  return { startLogin, cancel, reset, status, error, setOAuthError, setOAuthSuccess };
}
```

- [ ] **Passo 2: criar o hook useTokenRefresh**

Crie `packages/ui/src/hooks/useTokenRefresh.ts`:
```ts
/**
 * useTokenRefresh —— Token 刷新 hook（常驻层）
 *
 * 挂载在 Root 或 App 组件中，确保 401 刷新在任何时候都能工作。
 * 监听全局的 401 事件，调用 oauthService.refreshToken 刷新 token。
 */
import { useCallback } from "react";
import { useServices } from "./useServices.js";
import { logger } from "../logger.js";

const AUTH_TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const USER_INFO_KEY = "user_info";

export function useTokenRefresh() {
  const { oauthService, credentialService } = useServices();

  /** 尝试刷新 token，失败则清除凭证 */
  const tryRefresh = useCallback(async (): Promise<boolean> => {
    try {
      const refreshToken = await credentialService.load(REFRESH_TOKEN_KEY);
      if (!refreshToken) {
        logger.info("[useTokenRefresh] 无 refresh_token，需重新登录");
        return false;
      }

      await oauthService.refreshToken(refreshToken);
      logger.info("[useTokenRefresh] token 刷新成功");
      return true;
    } catch (err) {
      logger.error("[useTokenRefresh] token 刷新失败:", err);
      return false;
    }
  }, [oauthService, credentialService]);

  /** 清除所有凭证 */
  const clearCredentials = useCallback(async () => {
    await credentialService.delete(AUTH_TOKEN_KEY);
    await credentialService.delete(REFRESH_TOKEN_KEY);
    await credentialService.delete(USER_INFO_KEY);
  }, [credentialService]);

  return { tryRefresh, clearCredentials };
}
```

- [ ] **Passo 3: verificar**

Run: `cd packages/ui && pnpm typecheck`

- [ ] **Passo 4: commitar**

```bash
git add packages/ui/src/hooks/useOAuth.ts packages/ui/src/hooks/useTokenRefresh.ts
git commit -m "feat(ui): add useOAuth and useTokenRefresh hooks"
```

---

## Tarefa 9: LoginDialog — substituir WelcomeScreen

**Arquivos:**
- Modificar: `packages/ui/src/WelcomeScreen.tsx` (conteúdo totalmente substituído pelo componente LoginDialog)

Substitua totalmente o conteúdo de `WelcomeScreen.tsx` pelo componente `LoginDialog`. O arquivo mantém o caminho original, e o nome de export passa a ser `LoginDialog`.

- [ ] **Passo 1: transformar WelcomeScreen.tsx em LoginDialog**

Substitua todo o conteúdo de `packages/ui/src/WelcomeScreen.tsx`:
```tsx
/**
 * LoginDialog —— OAuth 登录弹窗
 *
 * 替代原来的用户名密码 WelcomeScreen。
 * 通过 useOAuth hook 驱动 OAuth 流程。
 */
import { useEffect } from "react";
import { LogInIcon, TriangleAlertIcon, Loader2Icon } from "lucide-react";
import { TID_OAUTH_LOGIN_BUTTON, TID_OAUTH_CANCEL, TID_OAUTH_ERROR } from "@zcode/shared";
import { useOAuth } from "./hooks/useOAuth.js";
import { useZCodeStore } from "./store/StoreProvider.js";
import { Alert, AlertDescription } from "./components/ui/alert.js";
import { Button } from "./components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./components/ui/dialog.js";
import { useZCodeIntl } from "./i18n/IntlProvider.js";

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function LoginDialog({ open, onOpenChange }: LoginDialogProps) {
  const { intl } = useZCodeIntl();
  const { startLogin, cancel, reset, status, error } = useOAuth();
  const user = useZCodeStore((s) => s.user);
  const oauthError = useZCodeStore((s) => s.oauthError);
  const setOAuthError = useZCodeStore((s) => s.setOAuthError);

  // Root 层 OAuth 回调失败时写入 Zustand oauthError → 弹窗显示错误
  useEffect(() => {
    if (oauthError && open) {
      reset();  // 重置 useOAuth 的 waiting 状态
      // oauthError 已在 store 中，下方 UI 会读取并显示
    }
  }, [oauthError, open, reset]);

  // OAuth 回调成功后 Root 层设置 user → 自动关闭弹窗
  useEffect(() => {
    if (user && open) {
      reset();
      setOAuthError(null);
      onOpenChange(false);
    }
  }, [user, open, reset, onOpenChange, setOAuthError]);

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && status === "waiting") {
      cancel();
    }
    if (!nextOpen) {
      reset();
      setOAuthError(null);  // 清除 store 中的旧错误，避免下次打开仍显示
    }
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({ id: "login.title" })}
          </DialogTitle>
          <DialogDescription>
            {intl.formatMessage({ id: "login.description" })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {status === "idle" && (
            <Button
              className="w-full"
              size="lg"
              data-testid={TID_OAUTH_LOGIN_BUTTON}
              onClick={startLogin}
            >
              <LogInIcon className="mr-2 size-4" />
              {intl.formatMessage({ id: "login.oauth.button" })}
            </Button>
          )}

          {status === "waiting" && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin" />
                {intl.formatMessage({ id: "login.oauth.waiting" })}
              </div>
              <Button
                variant="outline"
                className="w-full"
                data-testid={TID_OAUTH_CANCEL}
                onClick={() => handleClose(false)}
              >
                {intl.formatMessage({ id: "login.oauth.cancel" })}
              </Button>
            </div>
          )}

          {(status === "error" || oauthError) && (
            <div className="space-y-3">
              <Alert variant="destructive" data-testid={TID_OAUTH_ERROR}>
                <TriangleAlertIcon className="size-4" />
                <AlertDescription>{oauthError || error}</AlertDescription>
              </Alert>
              <Button className="w-full" onClick={() => { setOAuthError(null); startLogin(); }}>
                {intl.formatMessage({ id: "login.oauth.retry" })}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Passo 2: adicionar mensagens de i18n**

Adicione as seguintes chaves nos arquivos de idioma zh-CN e en-US:
```
login.title = 登录 / Login
login.description = 通过 BigModel 账号登录以获取完整功能 / Login with BigModel for full features
login.oauth.button = 通过 BigModel 登录 / Login with BigModel
login.oauth.waiting = 等待浏览器完成认证... / Waiting for browser authentication...
login.oauth.cancel = 取消 / Cancel
login.oauth.retry = 重新登录 / Retry Login
```

- [ ] **Passo 3: atualizar os exports do pacote de UI**

Em `packages/ui/src/index.ts`:
- substitua o export de `WelcomeScreen` por `LoginDialog`
- se houver `export { WelcomeScreen }`, mude para `export { LoginDialog }`

- [ ] **Passo 3: verificar**

Run: `cd packages/ui && pnpm typecheck`

- [ ] **Passo 4: commitar**

```bash
git add packages/ui/src/WelcomeScreen.tsx packages/ui/src/index.ts
git commit -m "feat(ui): replace WelcomeScreen with LoginDialog for BigModel OAuth"
```

---

## Tarefa 10: Refactor de Root.tsx + botão de login em App.tsx

**Arquivos:**
- Modificar: `packages/ui/src/Root.tsx`
- Modificar: `packages/ui/src/App.tsx`

Esta é a alteração mais central na camada de UI:
1. remover `MOCK_USER`, `AUTH_TOKEN_KEY`, `skipAuth` e a lógica de login mock
2. mudar o estado `user` de `useState` para a store Zustand
3. adicionar escuta permanente do callback OAuth + `notifyRendererReady`
4. adicionar o hook permanente `useTokenRefresh`
5. trocar a UI de login de WelcomeScreen em tela cheia por LoginDialog
6. tratar o logout na camada de UI via credentialService + Zustand
7. em App.tsx, o botão de logout passa a: exibir "登录" quando deslogado, e nome de usuário + "退出" quando logado

- [ ] **Passo 1.5: modificar store/index.ts — adicionar o campo oauthError**

Adicione à interface `ZCodeState` em `packages/ui/src/store/index.ts`:
```ts
  /** OAuth 回调错误（Root 层写入，LoginDialog 读取） */
  oauthError: string | null;
  setOAuthError: (error: string | null) => void;
```

Adicione ao valor inicial de `create<ZCodeState>()`:
```ts
    oauthError: null,
    setOAuthError: (error: string | null) => set({ oauthError: error }),
```

- [ ] **Passo 2: refatorar Root.tsx**

Principais mudanças (exibição incompleta; na prática é preciso reescrever por completo RootInner):

1. remover as constantes `MOCK_USER` e `AUTH_TOKEN_KEY`
2. remover a prop `skipAuth` e a lógica relacionada
3. remover `skipAuth` de RootProps
4. trocar `const [user, setUser] = useState<UserInfo | null>(skipAuth ? MOCK_USER : null)` por:
   ```ts
   const user = useZCodeStore((s) => s.user);
   const setUser = useZCodeStore((s) => s.setUser);
   ```
5. remover `const [checked, setChecked] = useState(!!skipAuth)` — passar a controlar pelo estado de carregamento do token
6. a verificação de token no startup passa a ser:
   ```ts
   useEffect(() => {
     services.credentialService.load("auth_token").then((token) => {
       if (token) {
         // 尝试恢复缓存的用户信息
         services.credentialService.load("user_info").then((info) => {
           if (info) {
             try {
               setUser(JSON.parse(info));
             } catch {
               setUser({ id: "unknown", username: "user", displayName: "User" });
             }
           }
           setChecked(true);
         });
       } else {
         setChecked(true);
       }
     });
   }, [services.credentialService, setUser]);
   ```
7. adicionar a escuta permanente do callback OAuth (no useEffect de RootInner):
   ```ts
   // 在组件顶层通过 hook 获取 setter
   const setOAuthError = useZCodeStore((s) => s.setOAuthError);

   useEffect(() => {
     const dispose = platform.onOAuthCallback(async (url) => {
       try {
         const userInfo = await services.oauthService.handleCallback(url);
         setUser(userInfo);
         setOAuthError(null);
         logger.info("[Root] OAuth 登录成功:", userInfo.username);
       } catch (err) {
         const message = err instanceof Error ? err.message : "登录失败";
         // 写入 Zustand store，LoginDialog 监听此字段显示错误
         setOAuthError(message);
         logger.error("[Root] OAuth 回调处理失败:", err);
       }
     });
     platform.notifyRendererReady();
     return dispose;
   }, [platform, services.oauthService, setUser, setOAuthError]);
   ```
8. montar o hook useTokenRefresh (atualmente um stub, expondo a API para a futura integração do interceptor de 401):
   ```ts
   // 注意：tryRefresh/clearCredentials 当前未被自动调用。
   // 后续需要在 API 调用层（如 oauthService 或 HTTP 拦截器）接入 401 → tryRefresh 的链路。
   // 本次只提供 hook API，实际的 401 自动刷新属于后续任务。
   const { tryRefresh, clearCredentials } = useTokenRefresh();
   ```
9. remover a função `handleLogin`
10. remover o branch que renderiza WelcomeScreen sob a condição `!user` — quando deslogado, a interface principal é renderizada normalmente
11. adicionar o gerenciamento de estado do LoginDialog:
    ```ts
    const [loginDialogOpen, setLoginDialogOpen] = useState(false);
    ```
12. `handleLogout` passa a ser:
    ```ts
    const handleLogout = async () => {
      await services.credentialService.delete("auth_token");
      await services.credentialService.delete("refresh_token");
      await services.credentialService.delete("user_info");
      setUser(null);
    };
    ```
13. passar `onLogin`, `onLogout` e `user` ao componente App:
    ```tsx
    <App
      ...
      onLogout={user ? handleLogout : undefined}
      onLogin={!user ? () => setLoginDialogOpen(true) : undefined}
      user={user}
      ...
    />
    ```
14. renderizar o LoginDialog no fim de RootInner:
    ```tsx
    <LoginDialog open={loginDialogOpen} onOpenChange={setLoginDialogOpen} />
    ```

- [ ] **Passo 2: modificar App.tsx — adicionar botão de login, substituindo o botão de logout fixo**

Em `packages/ui/src/App.tsx`:

1. Adicione as props `onLogin?: () => void` e `user?: UserInfo | null`:
   ```ts
   export function App({
     ...
     onLogout,
     onLogin,   // 新增
     user,      // 新增：用于显示用户名
     ...
   }: {
     onLogout?: () => void;
     onLogin?: () => void;   // 新增
     user?: UserInfo | null;  // 新增
     ...
   })
   ```

2. Troque a área do botão de logout no canto superior direito por (botão de login quando deslogado; nome de usuário + botão de sair quando logado):
   ```tsx
   {onLogin ? (
     <button
       onClick={onLogin}
       data-testid={TID_LOGIN_TRIGGER}
       className="cursor-pointer rounded-lg bg-btn-alt-bg px-3 py-1 text-xs text-btn-alt-text transition hover:bg-surface-raised"
     >
       {intl.formatMessage({ id: "app.login" })}
     </button>
   ) : null}
   {onLogout ? (
     <>
       <span className="text-xs text-on-surface-muted">{user?.displayName}</span>
       <button
         onClick={onLogout}
         data-testid={TID_LOGOUT_BUTTON}
         className="cursor-pointer rounded-lg bg-btn-alt-bg px-3 py-1 text-xs text-btn-alt-text transition hover:bg-surface-raised"
       >
         {intl.formatMessage({ id: "app.logout" })}
       </button>
     </>
   ) : null}
   ```

3. Adicione a chave `app.login` (登录 / Login) nos arquivos de idioma de i18n

- [ ] **Passo 2: verificar**

Run: `pnpm typecheck && pnpm lint`

- [ ] **Passo 3: commitar**

```bash
git add packages/ui/src/Root.tsx packages/ui/src/App.tsx packages/ui/src/store/index.ts
git commit -m "feat(ui): refactor Root.tsx + App.tsx + store — remove mock auth, add login button, add oauthError, unify to Zustand"
```

---

## Tarefa 11: Limpeza — excluir a janela de login, atualizar o Vite Config, migrar testes E2E

**Arquivos:**
- Excluir: `packages/desktop/src/renderer/src/login.tsx`
- Excluir: `packages/desktop/src/renderer/login.html`
- Excluir: `packages/desktop/test/e2e/pages/login.page.ts`
- Excluir: `packages/desktop/test/e2e/login.test.ts`
- Excluir: `packages/desktop/test/e2e/login-extended.test.ts`
- Modificar: `packages/desktop/vite.config.ts`

- [ ] **Passo 1: excluir login.tsx**

```bash
rm packages/desktop/src/renderer/src/login.tsx
```

- [ ] **Passo 2: excluir login.html**

```bash
rm packages/desktop/src/renderer/login.html
```

- [ ] **Passo 3: modificar vite.config.ts — remover a entrada login**

Em `packages/desktop/vite.config.ts`, remova a linha login de rollupOptions.input:
```ts
        input: {
          index: resolve(__dirname, "src/renderer/index.html"),
          "process-monitor": resolve(__dirname, "src/renderer/process-monitor.html"),
        },
```

- [ ] **Passo 4: excluir os arquivos antigos de teste e2e de login**

```bash
rm packages/desktop/test/e2e/pages/login.page.ts
rm packages/desktop/test/e2e/login.test.ts
rm packages/desktop/test/e2e/login-extended.test.ts
```

Esses testes dependem da janela de login já removida e de elementos como TID_USERNAME_INPUT, portanto não podem mais ser usados.
Os testes e2e de login OAuth exigem mock do endpoint do BigModel e do deep link, o que fica para uma tarefa separada posterior.

Atenção: `seed-credentials.test.ts` também referencia `login.page.ts` e precisa ser modificado em sincronia, removendo o import da página de login e as asserções relacionadas.

- [ ] **Passo 5: modificar seed-credentials.test.ts — remover a dependência de login.page.ts**

Verifique o import e as chamadas de `login.page.ts` em `packages/desktop/test/e2e/seed-credentials.test.ts` e remova ou substitua. A lógica central desse teste é verificar o seed de credenciais e não depende do fluxo de UI de login; basta remover as asserções relacionadas à página de login.

- [ ] **Passo 5: verificar**

Run: `pnpm typecheck && pnpm lint`

- [ ] **Passo 6: commitar**

```bash
git add -A packages/desktop/src/renderer/src/login.tsx packages/desktop/src/renderer/login.html packages/desktop/vite.config.ts packages/desktop/test/e2e/pages/login.page.ts packages/desktop/test/e2e/login.test.ts packages/desktop/test/e2e/login-extended.test.ts packages/desktop/test/e2e/seed-credentials.test.ts
git commit -m "chore(desktop): remove login window, old login e2e tests, fix seed-credentials test"
```

---

## Tarefa 12: Configuração de build + atualização do AGENTS.md

**Arquivos:**
- Modificar: `packages/desktop/electron-builder.config.js`
- Modificar: `AGENTS.md`

- [ ] **Passo 1: modificar electron-builder.config.js — adicionar a configuração protocols**

Em `packages/desktop/electron-builder.config.js`, adicione protocols antes da config de mac:
```js
  // OAuth deep link 协议注册（macOS 打包后需要 Info.plist 中声明 CFBundleURLTypes）
  protocols: [
    {
      name: "zcode",
      schemes: ["zcode"],
    },
  ],
  mac: {
```

- [ ] **Passo 2: modificar AGENTS.md — atualizar a lista de permitidos de window.zcode e sua descrição**

Na linha 92 de `AGENTS.md`, troque "包括登录窗口" por "包括远程窗口" (removendo a referência à janela de login).

Atualize a linha 99 para:
```
* `window.zcode` 上只剩 `selectDirectory`、`activateOrSetWorkspace`、`connectRemote`、`log`、`openExternal`、`registerOAuthState`、`onOAuthCallback`、`notifyRendererReady`，不包含 credential
```

- [ ] **Passo 3: verificar**

Run: `pnpm typecheck && pnpm lint`

- [ ] **Passo 4: commitar**

```bash
git add packages/desktop/electron-builder.config.js AGENTS.md
git commit -m "chore: add protocol config for macOS deep link; update AGENTS.md"
```

---

## Tarefa 13: Verificação final

- [ ] **Passo 1: typecheck em todo o projeto**

Run: `pnpm typecheck`
Esperado: 0 erros

- [ ] **Passo 2: lint em todo o projeto**

Run: `pnpm lint`
Esperado: 0 erros

- [ ] **Passo 3: verificação de build**

Run: `pnpm build`
Esperado: build bem-sucedido

- [ ] **Passo 4: checklist de verificação manual**

- Iniciar o aplicativo → entra direto na interface principal (sem janela de login)
- Há um botão 「登录」 no canto superior direito (`TID_LOGIN_TRIGGER`) → clicar abre o LoginDialog
- Clicar em "通过 BigModel 登录" no LoginDialog (`TID_OAUTH_LOGIN_BUTTON`) → o navegador abre a página de login do BigModel
- Após concluir a autenticação → o aplicativo volta automaticamente ao estado logado e o LoginDialog fecha sozinho
- O canto superior direito exibe o displayName do usuário + o botão 「退出」
- Em caso de falha na autenticação → o LoginDialog exibe a mensagem de erro e permite tentar de novo
- Clicar em 「退出」 → volta ao estado deslogado e o canto superior direito volta a exibir o botão 「登录」
- O aplicativo continua utiliz normalmente mesmo deslogado