# Design do login OAuth da BigModel

## Visão geral

Substituir o login existente por usuário e senha pelo login OAuth da BigModel. O login não é obrigatório: o usuário pode usar o aplicativo sem estar logado. Ao clicar no botão de login no canto superior direito da interface principal, abre-se o LoginDialog; após a autenticação concluída via OAuth no navegador, o fluxo retorna automaticamente ao aplicativo.

Apenas a versão Desktop (Electron) é implementada; a versão Web não é suportada por enquanto.

## Fluxo completo

```
O usuário clica no botão «Login» do canto superior direito
        │
        ▼
  Abre o LoginDialog
  Clica em «Login com BigModel»
        │
        ▼
  hook useOAuth:
        │ chama o RPC oauthService.startOAuth() → retorna { authorizeUrl, state }
        │ reporta o state ao Main via IPC (usado no roteamento do deep link)
        │ chama platform.openExternal(authorizeUrl)
        │
        ▼
  Main Process (camada de agendamento)
        │ registra o mapeamento state → webContents.id
        │ shell.openExternal(authorizeUrl)
        │
        ▼
  O navegador abre a página de login da BigModel
  O usuário conclui a autenticação (código por SMS etc.)
        │
        ▼
  A BigModel redireciona para zcode://bigmodel-auth/callback?code=xxx&state=xxx
        │
        ▼
  O Main Process captura o deep link (extrai apenas a URL)
        │ faz o parse do state na URL → consulta o mapeamento state→windowId → encontra a janela alvo
        │ encaminha a URL para o renderer da janela alvo
        │ targetWindow.webContents.send(PlatformChannels.OAuthCallback, url)
        │
        ▼
  O Renderer recebe o evento OAuthCallback (Root/App fica sempre escutando)
        │ chama o RPC oauthService.handleCallback(url)
        │   ├ valida o state (remove logo após o match, para impedir replay)
        │   ├ faz POST em tokenUrl trocando code + code_verifier por access_token
        │   ├ guarda o token no credentialService
        │   └ (opcional) GET em userinfoUrl para obter os dados do usuário
        │ retorna userInfo
        │
        ▼
  Atualiza o store do Zustand (única fonte de dados) → fecha o LoginDialog
```

## Registro do Custom Protocol e tratamento de Deep Link

### Registro do protocolo

O código atual não possui nenhuma infraestrutura de protocol / single-instance; ela precisa ser construída do zero.

Em `packages/desktop/src/main/index.ts`:

```ts
// 在 app.whenReady() 之前注册协议
app.setAsDefaultProtocolClient('zcode')

// 单实例锁（新增）
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
}
```

### Captura de Deep Link multiplataforma

#### macOS

No macOS o deep link chega pelo evento `open-url`, independentemente de o aplicativo já estar em execução.

**Precisa ser registrado antes de `app.whenReady()`**, caso contrário o evento de deep link do cold start seria perdido:

```ts
// 在 app.whenReady() 之前注册
app.on('open-url', (event, url) => {
  event.preventDefault()
  handleDeepLink(url)
})
```

No cold start o Electron dispara `open-url` automaticamente no macOS; não é necessário extrair de `process.argv`.

**Atenção:** após o empacotamento no macOS é preciso declarar `CFBundleURLTypes` no `Info.plist`. Configurado por `electron-builder.config.js`:

```js
// packages/desktop/electron-builder.config.js
{
  protocols: [
    {
      name: 'zcode',
      schemes: ['zcode'],
    },
  ],
}
```

#### Windows / Linux

Pelo lock de instância única + evento `second-instance` (novo):

```ts
app.on('second-instance', (event, argv) => {
  // Windows/Linux: 协议 URL 通过命令行参数传入
  const url = argv.find(arg => arg.startsWith('zcode://'))
  if (url) handleDeepLink(url)

  // 聚焦已有窗口
  const win = BrowserWindow.getAllWindows()[0]
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})
```

No cold start (quando o aplicativo ainda não estava em execução), a URL está em `process.argv`:

```ts
// app.whenReady() 内，窗口创建后检查
const protocolUrl = process.argv.find(arg => arg.startsWith('zcode://'))
if (protocolUrl) handleDeepLink(protocolUrl)
```

**Atenção:** no cold start o deep link pode chegar antes de o renderer terminar o mount. O processo Main precisa fazer cache da URL de deep link pendente:

```ts
let pendingDeepLinkUrl: string | null = null

function handleDeepLink(url: string) {
  if (!url.startsWith('zcode://bigmodel-auth/callback')) return

  const state = new URL(url).searchParams.get('state')
  if (!state) return

  const targetWindowId = oauthStateToWindow.get(state)
  const targetWindow = targetWindowId
    ? BrowserWindow.getAllWindows().find(w => w.webContents.id === targetWindowId)
    : null

  if (targetWindow) {
    targetWindow.webContents.send(PlatformChannels.OAuthCallback, url)
    oauthStateToWindow.delete(state)
  } else {
    // Renderer 尚未就绪（冷启动），缓存 URL，等 renderer ready 后再发送
    pendingDeepLinkUrl = url
  }
}

// Renderer ready 后（通过 IPC 通知），发送缓存的 deep link
ipcMain.on(PlatformChannels.RendererReady, (event) => {
  if (pendingDeepLinkUrl) {
    event.sender.send(PlatformChannels.OAuthCallback, pendingDeepLinkUrl)
    pendingDeepLinkUrl = null
  }
})
```

Atenção: `pendingDeepLinkUrl` é usado apenas no cenário de cold start (quando o aplicativo ainda não estava em execução e foi aberto pelo protocolo). No cold start há apenas uma janela sendo criada, então um único valor basta e não existe corrida entre janelas. Deep links recebidos com o aplicativo já em execução passam pelo roteamento pelo mapeamento `state→windowId` e não usam este cache.

#### handleDeepLink — o Main apenas faz o despacho

```ts
// Main process 中的 handleDeepLink 只做 URL 提取和转发，不做业务逻辑
// 通过 state → windowId 映射路由到正确的窗口
const oauthStateToWindow = new Map<string, number>()

function handleDeepLink(url: string) {
  // 实现见上文「冷启动缓存」部分
}
```

## IOAuthService (novo serviço RPC)

A lógica de negócio do OAuth fica no host process, seguindo as normas do AGENTS.md. Executado conforme o "Checklist de novo serviço":

### Interface do serviço

```ts
// packages/services/src/oauth/oauth.ts（新建）
import { createServiceDescriptor } from '@zcode/rpc'
import { ServiceChannels } from '@zcode/shared'

export interface IOAuthService {
  // 发起 OAuth：生成 state + PKCE，返回完整的 authorize URL 和 state
  startOAuth(): Promise<{ authorizeUrl: string; state: string }>

  // 处理回调：校验 state，code 换 token，存凭据，返回用户信息
  handleCallback(url: string): Promise<UserInfo>

  // 刷新 token
  refreshToken(token: string): Promise<void>

  // 清理（超时等）
  cancelPending(): Promise<void>
}

export const IOAuthService = createServiceDescriptor<IOAuthService>(ServiceChannels.OAuth)
```

### Implementação do serviço

```ts
// packages/services/src/oauth/oauthService.ts（新建）
export class OAuthService implements IOAuthService {
  // 注入 ICredentialService，在 host process 内部使用
  constructor(private credentialService: ICredentialService) {}

  private pendingStates = new Map<string, { timeout: NodeJS.Timeout; codeVerifier: string }>()

  async startOAuth(): Promise<{ authorizeUrl: string; state: string }> {
    // 生成 state（随机 32 字节 hex）
    // 生成 PKCE code_verifier + code_challenge
    // 存入 pendingStates，设置 5 分钟超时
    // 构建并返回 { authorizeUrl, state }
  }

  async handleCallback(url: string): Promise<UserInfo> {
    // 解析 URL 提取 code、state
    // 校验 state（匹配后立即删除）
    // POST tokenUrl：code + code_verifier 换 token
    // 存 token 到 credentialService
    // (可选) GET userinfoUrl 获取用户信息
    // 返回 UserInfo
  }

  async cancelPending(): Promise<void> {
    // 清理所有 pending state 和超时定时器
  }

  async refreshToken(token: string): Promise<void> {
    // POST tokenUrl (grant_type=refresh_token) 刷新 token
    // 更新 credentialService 中的 auth_token 和 refresh_token
  }
}
```

### Passos de registro (conforme o Checklist do AGENTS.md)

1. `packages/shared/src/channels.ts` — `ServiceChannels` ganha `OAuth`
2. `packages/services/src/oauth/oauth.ts` — interface + descriptor
3. `packages/services/src/oauth/oauthService.ts` — implementação em Node.js
4. `packages/services/src/accessor.ts` — `IServiceAccessor` ganha `oauthService`
5. `packages/services/src/index.ts` — exportação
6. `packages/services/src/node.ts` — registro em `createLocalServices()`
7. `packages/client/src/remoteServiceAccess.ts` — ProxyChannel
8. `packages/ui/src/hooks/useOAuth.ts` — novo hook (ver abaixo)

## Comunicação IPC

### Channels

```ts
// packages/shared/src/channels.ts

// OAuthService 作为 RPC 服务，使用 ServiceChannels
export const ServiceChannels = {
  ...existing,
  OAuth: 'oauth',
}

// Deep link 相关的平台 channel
export const PlatformChannels = {
  ...existing,
  OpenExternal: 'zcode:open-external',          // Renderer → Main：打开外部 URL
  OAuthRegisterState: 'zcode:oauth-register-state', // Renderer → Main：上报 state 用于路由
  OAuthCallback: 'zcode:oauth-callback',         // Main → Renderer：转发 deep link URL
  RendererReady: 'zcode:renderer-ready',         // Renderer → Main：renderer 已就绪
}
```

Atenção: não são necessários channels `OAuthSuccess` / `OAuthError`. O início do OAuth acontece por chamada RPC `oauthService.startOAuth()`, o tratamento do callback por chamada RPC `oauthService.handleCallback(url)`, e o resultado é obtido direto no renderer, sem passar pelo main.

### Fluxo de despacho do processo Main

```ts
// Main process 只做三件事：
// 1. 记录 state → windowId 映射（Renderer 上报）
// 2. 监听 deep link → 根据 state 路由到正确窗口
// 3. 缓存冷启动的 deep link，等 renderer ready 后转发

const oauthStateToWindow = new Map<string, number>()
let pendingDeepLinkUrl: string | null = null

// Renderer 通过 RPC 获取 authorizeUrl 和 state 后，上报 state 用于路由
ipcMain.on(PlatformChannels.OAuthRegisterState, (event, state: string) => {
  oauthStateToWindow.set(state, event.sender.id)

  // 5 分钟超时自动清理，防止残留脏映射
  setTimeout(() => oauthStateToWindow.delete(state), 5 * 60 * 1000)
})

// 窗口关闭时清理该窗口的所有 state 映射
app.on('browser-window-created', (_, win) => {
  win.on('closed', () => {
    for (const [state, id] of oauthStateToWindow) {
      if (id === win.webContents.id) oauthStateToWindow.delete(state)
    }
  })
})

// 打开外部 URL（用于 OAuth 跳转浏览器）
ipcMain.on(PlatformChannels.OpenExternal, (event, url: string) => {
  shell.openExternal(url)
})

// Renderer ready 后，发送缓存的 deep link
ipcMain.on(PlatformChannels.RendererReady, (event) => {
  if (pendingDeepLinkUrl) {
    event.sender.send(PlatformChannels.OAuthCallback, pendingDeepLinkUrl)
    pendingDeepLinkUrl = null
  }
})

// handleDeepLink 实现见「Custom Protocol」章节
```

### Extensão de IPlatformService

```ts
// packages/shared/src/platform.ts
export interface IPlatformService {
  // 保留的现有方法（selectDirectory、activateOrSetWorkspace、connectRemote、log 等）
  // 删除：loginSuccess()、logout()
  // 新增：
  openExternal(url: string): void
  registerOAuthState(state: string): void
  onOAuthCallback(callback: (url: string) => void): (() => void)  // 返回 disposer
  notifyRendererReady(): void
}
```

Atenção: `onOAuthCallback` retorna uma função disposer; quando chamada, remove apenas o callback atual e não afeta outros assinantes.

Implementação Desktop (`packages/desktop/src/renderer/src/main.tsx`):
```ts
openExternal: (url) => window.zcode.openExternal(url),
registerOAuthState: (state) => window.zcode.registerOAuthState(state),
onOAuthCallback: (cb) => window.zcode.onOAuthCallback(cb),
notifyRendererReady: () => window.zcode.notifyRendererReady(),
```

Implementação Web (`packages/web/src/main.tsx`):
```ts
openExternal: () => { throw new Error('Not supported in web') },
registerOAuthState: () => {},
onOAuthCallback: () => () => {},  // 返回空 disposer
notifyRendererReady: () => {},
```

### Atualização de window.zcode

Preload bridge (`packages/desktop/src/preload/index.ts`):
```ts
openExternal: (url: string) => ipcRenderer.send(PlatformChannels.OpenExternal, url),
registerOAuthState: (state: string) => ipcRenderer.send(PlatformChannels.OAuthRegisterState, state),
onOAuthCallback: (cb: (url: string) => void) => {
  const handler = (_: any, url: string) => cb(url)
  ipcRenderer.on(PlatformChannels.OAuthCallback, handler)
  // 返回 disposer，只移除当前回调
  return () => ipcRenderer.removeListener(PlatformChannels.OAuthCallback, handler)
},
notifyRendererReady: () => ipcRenderer.send(PlatformChannels.RendererReady),
```

A declaração de tipos (`packages/client/src/globals.d.ts`) é atualizada junto.

Atualizar também no AGENTS.md a lista de permissões de `window.zcode`, adicionando `openExternal`, `registerOAuthState`, `onOAuthCallback`, `notifyRendererReady`.

## Mudanças na camada de UI

### Hook useOAuth

```ts
// packages/ui/src/hooks/useOAuth.ts（新建）
// 仅负责登录流程的发起和 UI 状态管理
export function useOAuth() {
  const { oauthService } = useServices()
  const platform = usePlatform()

  const startLogin = async () => {
    // 1. RPC 调用 oauthService.startOAuth() → 返回 { authorizeUrl, state }
    // 2. platform.registerOAuthState(state) — 上报给 main 用于 deep link 路由
    // 3. platform.openExternal(authorizeUrl) — 打开浏览器
  }

  return { startLogin, status, error }
}
```

A escuta do callback OAuth e o `notifyRendererReady` **não ficam no useOAuth** (porque ele só existe enquanto o LoginDialog está montado), e sim na camada permanente Root/App:

```ts
// packages/ui/src/Root.tsx（或 App.tsx）中
// 常驻挂载，确保回调监听始终存在
useEffect(() => {
  const dispose = platform.onOAuthCallback(async (url) => {
    // RPC 调用 oauthService.handleCallback(url) 完成 token exchange
    // 成功 → setUser(userInfo)（更新 Zustand store）
    // 失败 → logger 记录错误
  })

  // 通知 main process renderer 已就绪，触发缓存的冷启动 deep link 转发
  platform.notifyRendererReady()

  return dispose
}, [])
```

Assim, mesmo que o LoginDialog não esteja aberto ou seja fechado inesperadamente, o callback OAuth ainda é processado corretamente e o estado de login é atualizado.

### LoginDialog (transformado a partir de WelcomeScreen)

WelcomeScreen passa de página fullscreen para um componente Dialog, embrulhado com shadcn Dialog.

Interface:
```tsx
LoginDialog({
  open: boolean
  onOpenChange: (open: boolean) => void
})
```

Internamente usa o hook `useOAuth()` para conduzir toda a lógica OAuth.

Máquina de estados:

```
┌─────────────┐   clica no botão   ┌──────────────┐callback com sucesso┌────────────┐
│ idle        │ ──────────────────▶ │ waiting      │ ──────────────────▶ │ success    │
│ exibe o login│                    │ espera browser│                    │ fecha dialog│
└─────────────┘                    └──────────────┘                    └────────────┘
                                           │
                             timeout / falha / cancelamento
                                           ▼
                                          ┌──────────────┐
                                          │ error        │
                                          │ mostra o erro│
                                          └──────┬───────┘
                                           │ retry
                                           ▼
                           volta para o idle

```

- O log usa `packages/ui/src/logger.ts`
- Os textos usam i18n
- Remover o state, os inputs e a lógica de validação relacionados a usuário e senha
- Remover test IDs como `TID_USERNAME_INPUT`, `TID_PASSWORD_INPUT`
- Adicionar `TID_OAUTH_LOGIN_BUTTON`, `TID_OAUTH_CANCEL`

### Botão de login no canto superior direito

Reaproveitar o botão existente:
- Sem login (user === null) → o clique abre o LoginDialog
- Com login → mostra as informações do usuário; o clique faz logout

### Estado de auth unificado no Zustand store

Problema atual: Root.tsx gerencia `user` com `useState`; o Zustand store também define `user` mas nunca é usado, ou seja, é código morto.

Correção: unificar no Zustand store como única fonte de dados.

- Remover `const [user, setUser] = useState<UserInfo | null>(...)` do Root.tsx
- Root.tsx passa a usar `const user = useZCodeStore(s => s.user)`
- Todas as operações de login/logout atualizam via `useZCodeStore(s => s.setUser)`
- Na inicialização o Root lê o token com `useAuthToken().getToken()`; se houver, chama `setUser`

## Ajuste do fluxo de inicialização

```ts
// packages/desktop/src/main/index.ts
// 删除 hasAuthToken() 函数及其分支判断
// 删除 createLoginWindow()
// 始终 createWindow()
// 新增：setAsDefaultProtocolClient('zcode')
// 新增：requestSingleInstanceLock()
// 新增：open-url / second-instance 监听
```

Na inicialização do componente Root:
```ts
// 通过 useAuthToken() hook 读取 token
// 有 token → 读取缓存的 user_info → setUser(userInfo)（Zustand store）
// 无 token → user = null，正常使用，不阻塞
```

## Gerenciamento de token

### Armazenamento

Usa o `credentialService` existente (`~/.zcode/v2/credentials.json`):

| Key | Uso |
|---|---|
| `auth_token` | access_token, mantendo a key existente |
| `refresh_token` | token de refresh (se a BigModel retornar) |
| `user_info` | JSON das informações do usuário em cache |

### Estratégia de refresh do token

A lógica de refresh de token **não fica no hook `useOAuth`** (porque o LoginDialog na maioria das vezes não está montado), e sim na camada permanente:

- Montar um hook permanente `useTokenRefresh` no componente Root ou App
- Esse hook escuta o evento global de 401 (via flag no Zustand store ou broadcast do broadcastService)
- Ao receber 401 → chama `oauthService.refreshToken(refreshToken)`
- Refresh bem-sucedido → atualiza o token e repete a requisição
- Refresh falho → limpa as credenciais + `setUser(null)`; o usuário precisa logar de novo

O hook `useOAuth` é responsável apenas pelo fluxo de login (`startOAuth` + tratamento do callback de deep link), não pelo refresh do token.

O método `refreshToken(token: string): Promise<void>` de `IOAuthService` executa a requisição de refresh do token e a atualização das credenciais no host process.

### Logout

1. Apagar `auth_token`, `refresh_token`, `user_info` via `credentialService`
2. `setUser(null)` (Zustand store)
3. Não fechar janela, não recarregar

### Migração dos métodos loginSuccess / logout

Depois de remover a janela de login, os métodos de plataforma existentes `loginSuccess` e `logout` perdem o sentido e precisam de ajuste:

| Método | Semântica atual | Nova abordagem |
|---|---|---|
| `window.zcode.loginSuccess` | Fecha a janela de login e abre a principal | **Remover**. Não há mais troca de janela de login; o sucesso do login é refletido na UI pelo callback permanente do Root via Zustand store |
| `window.zcode.logout` | Fecha a janela principal e abre a de login | **Remover**. O logout deixa de ser uma operação de plataforma e é tratado inteiramente na camada UI/Hook |
| `IPlatformService.loginSuccess` | idem | **Remover** |
| `IPlatformService.logout` | idem | **Remover**. A lógica de negócio do logout fica na camada UI/Hook, via credentialService + Zustand |
| `PlatformChannels.LoginSuccess` | IPC que avisa o main para trocar de janela | **Remover** |
| `PlatformChannels.Logout` | IPC que avisa o main para trocar de janela | **Remover** |

O logout é implementado na camada de UI (por exemplo, um hook `useLogout` ou direto no componente):
```ts
// UI/Hook 层，不经过 IPlatformService
async function handleLogout() {
  const { credentialService } = useServices()
  await credentialService.delete('auth_token')
  await credentialService.delete('refresh_token')
  await credentialService.delete('user_info')
  setUser(null)  // Zustand store
}
```

Arquivos afetados (já incluídos na lista de mudanças, aqui apenas explicados):
- `packages/shared/src/platform.ts` — remover `loginSuccess()`, `logout()`
- `packages/shared/src/channels.ts` — remover `PlatformChannels.LoginSuccess`, `PlatformChannels.Logout`
- `packages/desktop/src/main/index.ts` — remover os listeners de IPC de `LoginSuccess` / `Logout` e a lógica de troca de janela
- `packages/desktop/src/preload/index.ts` — remover `loginSuccess`, `logout`
- `packages/client/src/globals.d.ts` — atualizar os tipos
- `AGENTS.md` — remover `loginSuccess` da lista de permissões de `window.zcode`

## Configuração OAuth

```ts
// packages/shared/src/oauth.ts（新建）
export const BIGMODEL_OAUTH_CONFIG = {
  authorizeUrl: 'https://bigmodel.cn/login',
  tokenUrl: 'https://bigmodel.cn/api/oauth/token',      // 待确认
  userinfoUrl: 'https://bigmodel.cn/api/oauth/userinfo',  // 待确认，可选
  appId: 'zcode-bigmodel-app',                            // 待确认
  redirectUri: 'zcode://bigmodel-auth/callback',
}
// Desktop 是 public client，不使用 clientSecret，通过 PKCE 保障安全
```

## Medidas de segurança

- **state**: hex aleatório de 32 bytes gerado a cada requisição, guardado em um Map e validado no callback, com remoção imediata após a correspondência
- **PKCE**: obrigatório. O Desktop é um public client e não consegue guardar um clientSecret com segurança. Gerar `code_verifier` (43-128 caracteres aleatórios) e `code_challenge` (hash SHA256 + codificação base64url) usando o método S256. Se a BigModel não suportar PKCE, isso deve ser registrado no documento como um risco de segurança conhecido, considerando outras mitigações
- **Timeout**: limpeza automática do state após 5 minutos sem callback, notificando o renderer para mostrar timeout
- **Prevenção de duplicidade**: ao clicar no botão de login, verificar os pendingStates; se já existir, ignorar. Essa verificação fica dentro do OAuthService, por instância de serviço (isto é, por host process de janela) e não bloqueia outras janelas
- **Sem clientSecret**: um public client Desktop não é adequado para armazenar segredos

## Escopo das mudanças

### Arquivos novos

| Arquivo | Descrição |
|---|---|
| `packages/shared/src/oauth.ts` | Constantes de configuração do OAuth |
| `packages/services/src/oauth/oauth.ts` | Interface IOAuthService + descriptor |
| `packages/services/src/oauth/oauthService.ts` | Implementação OAuthService em Node.js |
| `packages/ui/src/hooks/useOAuth.ts` | Hook do fluxo de login OAuth |
| `packages/ui/src/hooks/useTokenRefresh.ts` | Hook de refresh de token (camada permanente) |

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `packages/shared/src/channels.ts` | ServiceChannels ganha OAuth; PlatformChannels ganha OpenExternal, OAuthRegisterState, OAuthCallback, RendererReady; remover LoginSuccess e Logout |
| `packages/shared/src/platform.ts` | IPlatformService ganha openExternal, registerOAuthState, onOAuthCallback, notifyRendererReady; remover loginSuccess() e logout() |
| `packages/services/src/accessor.ts` | IServiceAccessor ganha oauthService |
| `packages/services/src/index.ts` | Exportar o módulo oauth |
| `packages/services/src/node.ts` | Registrar o OAuthService em createLocalServices() |
| `packages/client/src/remoteServiceAccess.ts` | ProxyChannel ganha oauth |
| `packages/client/src/globals.d.ts` | Tipos de window.zcode ganha openExternal, registerOAuthState, onOAuthCallback, notifyRendererReady; remover loginSuccess e logout |
| `packages/desktop/electron-builder.config.js` | Nova configuração `protocols` (declaração de protocolo no plist do macOS) |
| `packages/desktop/src/main/index.ts` | Registrar o custom protocol, requestSingleInstanceLock, listeners open-url/second-instance, mapeamento state→window, cache de cold start, remover createLoginWindow, remover o branch de hasAuthToken, remover a lógica de troca de janela LoginSuccess/Logout |
| `packages/desktop/src/preload/index.ts` | Expor openExternal, registerOAuthState, onOAuthCallback, notifyRendererReady; remover loginSuccess e logout |
| `packages/desktop/src/renderer/src/main.tsx` | Remover skipAuth; a implementação de platform ganha os novos métodos |
| `packages/ui/src/WelcomeScreen.tsx` | Transformar em LoginDialog |
| `packages/ui/src/Root.tsx` | Remover a lógica de login mock e o user via useState, usando o Zustand store; adicionar escuta permanente do callback OAuth + notifyRendererReady |
| `packages/ui/src/store/index.ts` | Remover MOCK_USER |
| `AGENTS.md` | Atualizar a lista de permissões de window.zcode (adicionar os métodos OAuth, remover loginSuccess) e a descrição que menciona "inclui a janela de login" |

### Conteúdo removido

| Removido | Arquivo |
|---|---|
| Função `createLoginWindow()` | `packages/desktop/src/main/index.ts` |
| Entrada `login.html` | `packages/desktop/` |
| Renderer `login.tsx` | `packages/desktop/src/renderer/src/login.tsx` |
| `login.html` nas múltiplas entradas do vite | `packages/desktop/vite.config.ts` |
| Função `hasAuthToken()` e o branch de inicialização | `packages/desktop/src/main/index.ts` |
| UI do formulário de usuário e senha | `packages/ui/src/WelcomeScreen.tsx` |
| Constante `MOCK_USER` | `packages/ui/src/Root.tsx`, `packages/ui/src/store/index.ts` |
| Lógica de validação mock `admin/admin` | `packages/desktop/src/renderer/src/login.tsx`, `packages/ui/src/Root.tsx` |
| Test IDs relacionados (TID_USERNAME_INPUT etc.) | `packages/shared/src/` |
| Método `loginSuccess()` e seu listener de IPC | `packages/shared/src/platform.ts`, `packages/desktop/src/main/index.ts`, `packages/desktop/src/preload/index.ts` |
| Método de plataforma `logout()` e seu listener de IPC | `packages/shared/src/platform.ts`, `packages/desktop/src/main/index.ts`, `packages/desktop/src/preload/index.ts` (a lógica de negócio do logout vai para a camada UI/Hook) |
| `PlatformChannels.LoginSuccess` | `packages/shared/src/channels.ts` |
| `PlatformChannels.Logout` | `packages/shared/src/channels.ts` |

### O que não muda

- `packages/services/src/credential/credentialService.ts` — a camada de armazenamento permanece igual
- `packages/web/` — não é tratada nesta rodada
- `packages/rpc/` — não envolvido (usa o framework RPC existente)
- `packages/server/` — não envolvido

## Casos limite

| Cenário | Tratamento |
|---|---|
| O usuário fecha o navegador depois de clicar em login | timeout de 5 minutos; o OAuthService limpa o state e o renderer mostra a mensagem de timeout |
| O usuário clica várias vezes no botão de login | o OAuthService verifica os pendingStates e ignora se já existir (por host process, sem afetar outras janelas) |
| O deep link chega com o aplicativo fechado (cold start) | macOS: o Electron dispara open-url ao iniciar; Windows/Linux: a URL é extraída de process.argv. Se o state não corresponder (o estado em memória já foi perdido) → retorna erro e o usuário faz login de novo |
| O deep link chega com o aplicativo em execução | macOS: open-url dispara diretamente; Windows/Linux: evento second-instance. Roteia para a janela correta pelo mapeamento state→windowId |
| O deep link chega antes de o renderer estar ready (sequência do cold start) | O processo Main faz cache da URL e só encaminha depois do IPC RendererReady |
| O state não corresponde | o OAuthService rejeita e retorna erro; o renderer exibe o erro |
| Falha de rede na troca do token | o OAuthService retorna erro; o renderer exibe o erro e é possível tentar de novo |
| Token armazenado expirado (na inicialização) | carregamento otimista; quando uma API posterior retorna 401, o refresh ou novo login é disparado na camada de hook |
| Login simultâneo em várias janelas | cada janela tem seu próprio host process e instância do OAuthService; o mapeamento state→windowId garante que o callback seja roteado para a janela correta |

## Registro de correções da revisão

| # | Problema original | Correção |
|---|---|---|
| P0 | A lógica de negócio do OAuth ficava no main process, violando "main só despacha" | Novo IOAuthService no host process; o main só captura e encaminha o deep link |
| P0 | Assumia a existência de infraestrutura como requestSingleInstanceLock | Fica explicitado que será construído do zero, com o tratamento de cold start (process.argv) |
| P0 | O diagrama de fluxo e a seção de IPC tinham dois caminhos de callback (OAuthSuccess vs OAuthCallback) | Unificado em OAuthCallback: o main só encaminha a URL, o renderer processa via RPC, removendo os channels OAuthSuccess/OAuthError |
| P1 | O callback enviava sempre para mainWindow, errando em múltiplas janelas | Passa a usar o mapeamento state→windowId, extraindo o state da URL para rotear à janela correta |
| P1 | Dependia de clientSecret e não fazia PKCE | PKCE passa a ser obrigatório, removendo a dependência de clientSecret |
| P1 | Faltava a declaração de protocolo no plist do macOS empacotado | Adicionada a configuração `protocols` em electron-builder.config.js |
| P1 | No cold start o deep link pode chegar antes de o renderer estar ready | O processo Main faz cache da URL do deep link e encaminha após o IPC RendererReady |
| P1 | notifyRendererReady estava definido mas sem ponto de chamada | Chamado no useEffect da camada permanente Root/App: platform.notifyRendererReady() |
| P2 | removeAllListeners limpava o canal inteiro | Trocado por padrão disposer; onOAuthCallback retorna uma função de limpeza |
| P2 | O mapeamento state→windowId não tinha limpeza de ciclo de vida | Limpeza automática por timeout de 5 minutos + limpeza dasos mapeamentos daquela janela quando a janela fecha |
| P3 | O momento de registro do open-url no macOS não estava claro | Fica explicitado que precisa ser registrado antes de app.whenReady() |
| P1 | O refresh de token ficava no hook useOAuth (ciclo de vida do LoginDialog), quebrando o refresh no 401 quando não montado | A lógica de refresh foi para a camada permanente, no hook useTokenRefresh; useOAuth cuida só do fluxo de login |
| P2 | Estado de auth inconsistente entre useState e Zustand | Unificado no Zustand store como única fonte de dados |
| P2 | A interface IOAuthService não tinha o método refreshToken | Adicionado refreshToken(token: string): Promise<void> |
| P3 | Caminhos inconsistentes, faltava globals.d.ts | Uniformizado o prefixo packages/ e incluído globals.d.ts |
| P1 | A semânticainválida dos métodos loginSuccess/logout não foi tratada | loginSuccess removido; logout removido de IPlatformService e sua lógica movida para a camada UI/Hook |
| P1 | onOAuthCallback e notifyRendererReady estavam no useOAuth (ciclo de vida do LoginDialog), perdendo o callback quando o dialog não está montado | A escuta do callback e o notifyRendererReady sobem para a camada permanente Root/App; useOAuth mantém apenas startLogin |
| P2 | Design de logout inconsistente (lógica de negócio misturada na camada de plataforma) | IPlatformService.logout() removido; o logout é inteiramente tratado na camada UI/Hook via credentialService + Zustand |
| P2 | O diagrama de fluxo mostrava useOAuth escutando o callback, inconsistente com a escuta permanente Root/App do texto | Diagrama atualizado para a escuta permanente Root/App |
| P2 | A seção de migração de loginSuccess/logout ainda tinha formulações antigas (modificar/avaliar/simplificar) | Unificado na abordagem "remover" |

## Conformidade com as restrições do AGENTS.md

| Restrição | Situação |
|---|---|
| Auth somente via Providers | ✅ A UI usa IPlatformService + hook usePlatform() + hook useOAuth() |
| O processo Main só despacha | ✅ O negócio de OAuth fica no OAuthService do host process; o main só captura o deep link, roteia state→window e mantém o cache de cold start |
| Serviços de negócio no host process | ✅ IOAuthService registrado conforme o checklist de novo serviço |
| Lista de permissões de window.zcode | ✅ Novos métodos adicionados e AGENTS.md atualizado |
| Nomes de canal centralizados em channels.ts | ✅ ServiceChannels + PlatformChannels |
| Injeção de dependências para compatibilidade | ✅ Padrões IPlatformService + IServiceAccessor |
| Compatibilidade com múltiplos SOs | ✅ macOS open-url / Windows+Linux second-instance + process.argv |
| Comentários em chinês | ✅ |
| Log via logger.ts | ✅ |
| Internacionalização | ✅ |
| Imports com caminho absoluto | ✅ |
| Arquivos com JSX usam .tsx | ✅ |