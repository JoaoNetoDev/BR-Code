# Design da validação de login da página de controle remoto Web

> Este documento se aplica somente ao fluxo de login `/web-remote` com gate OAuth. `remoteControlToken` / `relayOrigin` são a explicação do comportamento antigo de `/web-remote` e não se aplicam à nova rota QR `/remote`; a nova rota usa o relay externo `sid/hash/t/mid/name/app_version` e não pode gravar `sid` ou `hash` no state do OAuth.

## Contexto

Atualmente a página de controle remoto Web (`packages/web`), ao ser aberta, permite acessar diretamente tarefas e janelas de chat sem nenhuma verificação de identidade. Ao acessar a página de controle remoto pelo celular, é preciso compartilhar a mesma identidade de usuário do desktop para usar normalmente os recursos do produto.

Objetivo desta mudança: introduzir na página de controle remoto Web o fluxo de login ZAI OAuth consistente com o desktop, apenas para o provider ZAI, sem envolver outras formas de login.

## Restrições principais

| Restrição | Descrição |
|-----------|-----------|
| Domínio de deploy | `https://zcode.z.ai`(já está na allowlist do ZAI OAuth) |
| Provedor OAuth | ZAI(`chat.z.ai/auth`),**não passa pelo deep-link `zcode://` do desktop** |
| Armazenamento de token | `localStorage` do Web, com as mesmas keys centrais do desktop: `zcodejwttoken`,`oauth: zai: access_token`,`oauth: zai: user_info`,`oauth: active_provider` |
| Mesma origem em produção | A página de controle remoto é implantada sob `zcode.z.ai`, então a chamada a `zcode.z.ai/api/v1/oauth/token` é de mesma origem, sem problema de CORS |
| Desenvolvimento | O origin local é injetado por variável de ambiente; o callback do ZAI volta primeiro ao domínio de produção e depois é encaminhado de volta ao IP da rede local; a troca de token local precisa passar pelo proxy do Vite ou pela allowlist de CORS do backend, e não se pode assumir que o origin local do Vite já tem `/api/v1/oauth/token` |

## Escopo desta etapa e fronteira de integração

Nesta etapa o frontend entrega somente as seguintes capacidades:

1. Exibir a página de login quando a página de controle remoto Web não está autenticada.
2. Iniciar o login ZAI OAuth.
3. Tratar o callback do ZAI OAuth.
4. Gravar no `localStorage` o `zcodejwttoken` retornado pelo backend e os armazenamento relacionados ao ZAI OAuth.

Os colegas de backend completarão as seguintes capacidades; este design apenas reserva a fronteira de integração e não as implementa nesta etapa:

1. Obter, com o `zcodejwttoken`, a lista de dispositivos/entradas de controle remoto aos quais a conta atual pode se conectar.
2. Estabelecer a conexão real de controle remoto após a seleção do dispositivo.
3. Autenticação do `zcodejwttoken` e vínculo de session no lado relay/server.

Portanto, o gate de login por `localStorage` do frontend desta etapa cuida apenas da convergência da entrada de UI e não equivale à autenticação completa do servidor. O destino após o login bem-sucedido é dividido por URL:

1. Se a URL atual tiver `remoteControlToken`: mantém a capacidade do link de controle remoto antigo e, após o login bem-sucedido, retorna à URL original, continuando a usar `remoteControlToken` / `relayOrigin` para o relay bootstrap existente.
2. Se a URL atual não tiver `remoteControlToken`: nesta etapa não conecta diretamente a `/ws` e renderiza primeiro uma página de espera já autenticada; quando a interface de lista de dispositivos do backend estiver pronta, passa a ser “chamar a interface de lista de dispositivos → o usuário seleciona o dispositivo → estabelecer a conexão de controle remoto”.

### Explicação do `remoteControlToken` / `relayOrigin` atuais

O código atual já contém uma cadeia “o desktop gera um link de controle remoto → o celular abre o link e conecta diretamente àquela sessão de controle remoto”:

- `remoteControlToken`: um token de sessão de uso único gerado pelo relay para uma sessão Web de controle remoto. O lado Web o usa para requisitar `/api/remote-control/bootstrap/:token`, obtendo `wsUrl`, informações de workspace e informações iniciais de task, e então conecta a `/ws/remote-control/:token`.
- `relayOrigin`: o origin do serviço de relay. A página Web pode estar implantada em `zcode.z.ai`, mas o relay pode ser outro serviço; por isso o lado Web precisa usar `relayOrigin` para montar os endereços das APIs de relay de bootstrap, workspace list, workspace switch e platform proxy. Quando não informado, o padrão é `window.location.origin`.

Esses dois parâmetros são os parâmetros de entrada da conexão direta à sessão de controle remoto atual; não são o JWT de login ZAI e não representam a identidade do usuário. Depois de adicionar a funcionalidade de login, eles ainda precisam ser mantidos: se o usuário abriu um link antigo de controle remoto com `remoteControlToken`, após o retorno do redirect OAuth ele ainda precisa obter o `remoteControlToken` / `relayOrigin` originais, caso contrário o link antigo perderia a sessão de relay à qual deveria se conectar.

Quando a interface de lista de dispositivos do backend estiver completa, o novo fluxo “escolher o dispositivo após o login” poderá não depender do `remoteControlToken` predefinido na URL e poderá ter o backend devolvendo os dispositivos conectáveis por `zcodejwttoken`. Isso, porém, não afeta a compatibilidade com os parâmetros de link antigo desta etapa.

## Fluxo de dados

### Produção (caminho padrão)

```
usuário acessa https://zcode.z.ai/web-remote?remoteControlToken=xxx&relayOrigin=https%3A%2F%2Frelay.example
   ↓ detecta sessão em cache incompleta
página de login em tela cheia
   ↓ clica em "Entrar com ZAI"
redireciona para https://chat.z.ai/api/oauth/authorize
  ?redirect_uri=https%3A%2F%2Fzcode.z.ai%2Fweb-remote%2Fcallback
  &response_type=code
  &client_id=xxx
  &state=<base64url({nonce, app_return_to: "https://zcode.z.ai/web-remote?remoteControlToken=xxx&relayOrigin=..."})>
   ↓ o usuário concorda na página de autorização da ZAI
volta para https://zcode.z.ai/web-remote/callback?code=xxx&state=yyy
   ↓ detecta que return_to não existe ou é igual a self.origin e troca o token direto
POST https://zcode.z.ai/api/v1/oauth/token
  {code, redirect_uri, state}
   ↓
retorna {code: 0, data: {token: "eyJ...", zai: {access_token: "zai_..."}, user: {...}}}
   ↓ grava em localStorage['zcodejwttoken'] = "eyJ..."
   ↓ grava em localStorage['oauth:zai:access_token'] = "zai_..."
   ↓ grava em localStorage['oauth:zai:user_info'] = data.user na estrutura original e mapeia para UserInfo ao restaurar o estado de exibição
   ↓ grava em localStorage['oauth:active_provider'] = "zai"
   ↓ replace para app_return_to, preservando remoteControlToken / relayOrigin
página de login em tela cheia → segue o bootstrap de relay do remoteControlToken já existente
```

### Desenvolvimento (caminho de encaminhamento por `return_to`)

```
computador do desenvolvedor em execução local: VITE_DEV_ORIGIN=http://192.168.x.x:5173 pnpm dev
navegador do celular acessa: http://192.168.x.x:5173/web-remote?remoteControlToken=xxx&relayOrigin=...
   ↓ detecta sessão em cache incompleta
página de login em tela cheia
   ↓ clica em "Entrar com ZAI"
redireciona para https://chat.z.ai/api/oauth/authorize
  ?redirect_uri=https%3A%2F%2Fzcode.z.ai%2Fweb-remote%2Fcallback
  &state=<base64url({
    nonce,
    return_to: "http://192.168.x.x:5173/web-remote/callback",
    app_return_to: "http://192.168.x.x:5173/web-remote?remoteControlToken=xxx&relayOrigin=..."
  })>
   ↓ o usuário concorda na página de autorização da ZAI
volta para https://zcode.z.ai/web-remote/callback?code=xxx&state=yyy
   ↓ decodifica state e detecta que return_to existe e é ≠ self.origin
   ↓ em produção a página de desvio não valida o nonce local nem troca o token; ela só faz a validação de whitelist e o encaminhamento
302 Location: http://192.168.x.x:5173/web-remote/callback?code=xxx&state=yyy
   ↓ o navegador do celular acessa o IP da rede local
http://192.168.x.x:5173/web-remote/callback?code=xxx&state=yyy
   ↓ a página local final valida o nonce
   ↓ via Vite proxy ou pela whitelist de CORS do backend faz POST https://zcode.z.ai/api/v1/oauth/token para trocar o token
grava em localStorage → replace para app_return_to, preservando remoteControlToken / relayOrigin
```

## Design da estrutura de `state`

### Formato de codificação

`state = base64url(JSON.stringify(payload))`

O `base64url` precisa usar um codec unificado, e não é permitido usar diretamente `atob(state)`. A razão é que o state do OAuth aparece na query da URL, e a codificação precisa transformar `+`, `/`, `=` em formas seguras para URL; na hora de analisar o callback o padding também precisa ser reposto.

### Estrutura do payload

```typescript
interface OAuthStatePayload {
  /** Número aleatório anti-CSRF, comparado com sessionStorage['oauth_pending_nonce'] */
  nonce: string;
  /**
   * Opcional. URL completa da página de negócio para onde voltar após o login bem-sucedido.
   * Usada para preservar query params como remoteControlToken / relayOrigin de links antigos de controle remoto.
   */
  app_return_to?: string;
  /**
   * Opcional. Injeta a callback URL local apenas no ambiente de desenvolvimento.
   * Não é injetada em produção; a página de callback de produção troca o token diretamente.
   */
  return_to?: string;
}
```

### Validação de `app_return_to`

O `app_return_to` é usado para restaurar a página de negócio original após a conclusão do login, e precisa ser validado com a API de URL, sem concatenar o redirect diretamente:

1. Produção: `app_return_to.origin === "https://zcode.z.ai"`, e o pathname só pode ser `/web-remote` ou `/web-remote/`
2. Desenvolvimento: `app_return_to.origin` precisa ser igual ao origin local que iniciou o login; se `return_to` existir ao mesmo tempo, ele precisa ter a mesma origem de `return_to`
3. Só é permitido manter os parâmetros de query necessários ao negócio, atualmente pelo menos `remoteControlToken` e `relayOrigin`; outros parâmetros, se necessários depois, precisam ser listados explicitamente na allowlist
4. Em caso de falha de validação, há que recorrer a `/web-remote`; não é permitido redirecionar para qualquer URL externa

> A manutenção de `remoteControlToken` / `relayOrigin` depende de `app_return_to`. Se a URL completa atual não for gravada no state ao iniciar o OAuth, o link antigo de controle remoto perderá a sessão de relay à qual se conectar após o retorno do login.

### Validação de allowlist de `return_to`

Depois que a página intermediária de produção decodifica `return_to`, ela executa o encaminhamento somente quando todas as condições abaixo forem satisfeitas:

1. `return_to` existe
2. `return_to` precisa ser analisado primeiro em um objeto URL por `new URL(return_to)`
3. `returnToUrl.origin !== window.location.origin`(a origem de destino não é a origem da página de callback atual)
4. `return_to` corresponde à regex de faixas privadas:`/^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+)(:\d+)?(\/|$)/`
5. O pathname de `return_to` precisa ser `/web-remote/callback`
6. O ambiente de build ou deploy atual permite explicitamente o encaminhamento de desenvolvimento. O build oficial de produção é fechado por padrão; se for realmente necessário deixar `https://zcode.z.ai` assumir o encaminhamento do desenvolvimento local, é preciso adicionar assinatura de backend ou um deploy de teste dedicado, e não se pode aceitar um `return_to` privado arbitrário sem assinatura em um ambiente de produção público

Se algo não for satisfeito, não se executa o encaminhamento entre origins e o processamento segue na página de callback atual: se a página atual for o callback de desenvolvimento local, como `returnToUrl.origin === window.location.origin`, é obrigatório entrar no ramo de validação de nonce e troca de token, sem poder dar replace de volta a si mesmo; se a página atual for o callback de produção e não houver um dev `return_to` válido, o fluxo segue o callback normal de produção e vai direto para a troca de token.

A página intermediária de produção é responsável apenas pela validação de allowlist de `return_to` e pelo encaminhamento 302; ela não lê o `sessionStorage` local nem executa a troca de token. Depois de retornar finalmente à página de desenvolvimento local, essa página lê o seu próprio `sessionStorage['oauth_pending_nonce']` do seu origin para fazer a validação de nonce.

### Proteção CSRF

Antes de iniciar o login:
```js
const nonce = crypto.randomUUID();
sessionStorage.setItem("oauth_pending_nonce", nonce);
```

Depois que a página de callback decodifica o `state`:
```js
function decodeBase64Url(value) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return atob(padded);
}

const payload = JSON.parse(decodeBase64Url(state));
const returnToUrl = parseOptionalUrl(payload.return_to);
if (
  returnToUrl &&
  returnToUrl.origin !== window.location.origin &&
  isTrustedDevReturnTo(returnToUrl)
) {
  // 开发态生产中转页：只做白名单校验和转发，不校验本地 nonce。
  // buildReturnToCallbackUrl 只能转发到通过白名单的 /web-remote/callback，并保留 code/error/state。
  location.replace(buildReturnToCallbackUrl(returnToUrl.toString(), { code, error, state }));
  return;
}

// 如果 return_to 和当前页同 origin，说明已经回到最终本地 callback；
// 继续执行 nonce 校验和 token 交换，避免本地 callback replace 回自己。
if (payload.nonce !== sessionStorage.getItem("oauth_pending_nonce")) {
  throw new Error("OAuth CSRF 检测失败");
}
sessionStorage.removeItem("oauth_pending_nonce");

// token 交换与持久化成功后，跳回受限的业务 URL。
location.replace(resolveSafeAppReturnTo(payload.app_return_to) ?? "/web-remote");
```

> Atenção: o `sessionStorage` não é compartilhado entre origins. A página que inicia em desenvolvimento é `http://192.168.x.x:5173` e a página intermediária de produção é `https://zcode.z.ai`, e as duas não podem compartilhar `sessionStorage`; portanto, a validação de nonce só pode acontecer depois de o retorno final ao origin local.

## Novos arquivos

O novo código de auth é dividido em `Providers → Repo → Service → Runtime/App Wiring`, evitando escrever a preocupação transversal de autenticação diretamente em `main.tsx`. `packages/web` é a entrada do runtime Web e permite adaptações de runtime/repo do navegador; os detalhes do protocolo ZAI continuam no módulo de provider e a orquestração de negócio é exposta pelo service.

### `packages/web/src/auth/oauthStateCodec.ts`

Módulo de funções puras, responsável pela codificação, decodificação e validação do `state`:

- `buildOAuthState(payload: OAuthStatePayload): string`
- `parseOAuthState(state: string): OAuthStatePayload | null`
- `decodeBase64Url(value: string): string`
- `encodeBase64Url(value: string): string`
- `parseOptionalUrl(value?: string): URL | null`
- `isTrustedDevReturnTo(url: URL): boolean`
- `resolveSafeAppReturnTo(value?: string): string | null`
- `buildReturnToCallbackUrl(returnTo: string, params: { code?: string; error?: string; state: string }): string | null`

### `packages/web/src/auth/webZaiOAuthConfig.ts`

Configuração do ZAI OAuth no Web:

- authorize URL: `https://chat.z.ai/api/oauth/authorize`
- token URL: em produção, `/api/v1/oauth/token`; em desenvolvimento, pode apontar via Vite proxy para `https://zcode.z.ai/api/v1/oauth/token`
- client id: reutiliza o ZAI OAuth client id
- redirect URI: sempre `https://zcode.z.ai/web-remote/callback`
- switch de encaminhamento de dev return: desligado por padrão; só é permitido ligar em deploys de desenvolvimento/teste ou em um encaminhamento de produção com assinatura de backend

### `packages/web/src/auth/zaiWebOAuthProvider.ts`

Módulo de provider, responsável pelos detalhes do protocolo ZAI:

- `buildAuthorizeUrl(params)` — constrói a authorize URL do ZAI
- `parseCallbackParams(url)` — analisa `code` / `state` / `error`
- `exchangeToken(params)` — faz POST na interface de token e valida a estrutura da resposta
- `toUserInfo(user)` — mapeia o `data.user` do backend para o estado de exibição do frontend

### `packages/web/src/auth/browserOAuthCredentialRepo.ts`

Módulo de repo que encapsula o armazenamento do navegador, sem permitir que a camada de negócio espalhe leituras e escritas de `localStorage` / `sessionStorage`:

- `saveTokenSet(tokenSet)` — salva `oauth:zai:access_token` e `zcodejwttoken`
- `saveUserInfo(user)` — salva `oauth:zai:user_info`
- `setActiveProvider("zai")`
- `loadCachedSession()`
- `clearAll()`

A condição de sucesso de `loadCachedSession()` precisa satisfazer simultaneamente:

1. `oauth:active_provider === "zai"`
2. `zcodejwttoken` existe e não fica vazio após trim
3. `oauth:zai:access_token` existe e não fica vazio após trim
4. `oauth:zai:user_info` pode ser analisado e mapeado para `UserInfo`

Se qualquer condição não for satisfeita, o estado é tratado como não autenticado; se for detectado um estado de login incompleto, as keys relacionadas ao ZAI acima precisam ser limpas para evitar que sejam depois interpretadas incorretamente como autenticadas.

### `packages/web/src/auth/webAuthService.ts`

Módulo de service, equivalente ao `OAuthService` do desktop no runtime Web, que apenas orquestra provider e repo:

- `startLogin(options?: { devReturnTo?: string; appReturnTo?: string }): void` — gera o nonce, entrega ao repo para salvar no sessionStorage, chama o provider para construir a authorize URL e redireciona; `appReturnTo` assume por padrão a URL completa atual, para preservar `remoteControlToken` / `relayOrigin`
- `handleCallback(url: string): Promise<{ userInfo: UserInfo; appReturnTo: string | null } | null>` — decodifica o state, trata o encaminhamento/validação de nonce, chama o provider para trocar o token e chama o repo para persistir
- `restoreCachedSession(): Promise<UserInfo | null>` — restaura o estado de login lendo o localStorage através do repo; aqui há apenas restauração de cache local, sem chamar o userinfo remoto
- `logout(): Promise<void>` — limpa o localStorage através do repo

### `packages/web/src/auth/WebLoginPage.tsx`

Componente de UI de login em tela cheia, exibindo o logo do ZCode e o botão “用 ZAI 登录”.

Restrições de UI:

- Antes de modificar ou adicionar UI é obrigatório respeitar o `DESIGN.md` na raiz.
- Usar tokens de cor semântica (como `bg-background`,`text-foreground`,`bg-card`,`border-border`), compatíveis com o Light Theme / Dark Theme assumido pelo Zai.
- O texto precisa ser compatível com `zh-CN` / `en-US`; como a página de login acontece antes do `ZCodeIntlProvider` completo, é preciso fornecer um resolver de locale leve ou reutilizar o dicionário i18n existente.
- Implementar o botão principal conforme o sistema de botões existente, sem codificar temporariamente cores, raios ou tamanhos de fonte.
- O layout precisa se adaptar a celular em retrato, desktop largo e textos em inglês mais longos.

### `packages/web/src/auth/WebCallbackPage.tsx`

Componente de tratamento do callback do OAuth. Decide conforme `state.return_to` e os parâmetros da URL:

- **com `error`**: exibe falha de login e permite que o usuário volte à página de login para tentar de novo
- **`state.return_to` presente, analisável como URL, com origem de destino diferente da origem atual e apontando para uma origem privada confiável**: o callback de produção atua como página intermediária de desenvolvimento e executa `location.replace(return_toCallbackUrl)`
- **sem `return_to`, ou com `new URL(return_to).origin === window.location.origin`**: significa que a página atual é o callback final; validar o nonce → trocar o token → persistir → navegar para `app_return_to`, preservando os parâmetros do link antigo de controle remoto

> O ramo de encaminhamento não pode ser decidido pela presença de `code`; o callback do ZAI para o callback de produção traz `code`. A condição real do ramo é se `state.return_to` existe, se pode ser analisado como URL e se `returnToUrl.origin` é diferente da origem da página de callback atual.

O tratamento do callback fica apenas em `WebCallbackPage`, e `main.tsx` apenas renderiza esse componente conforme a URL, evitando que `main.tsx` e o chamem cada um `handleCallback()`.

### `packages/web/src/auth/WebLoggedInWaitingPage.tsx`

Página de espera exibida quando o usuário já está autenticado mas a URL não tem `remoteControlToken`. Este componente é o ponto de chegada do frontend desta etapa para “a interface de lista de dispositivos do backend ainda não foi concluída”, evitando conectar por engano ao `/ws` comum na ausência de um dispositivo de destino.

Restrições de UI:

- Usa o mesmo resolver de locale leve de pre-bootstrap e os mesmos tokens de tema do `WebLoginPage.tsx`.
- O texto precisa ser compatível com `zh-CN` / `en-US`, explicando “已登录，设备列表能力即将接入” ou uma expressão equivalente, sem fixar o chinês.
- O componente recebe apenas parâmetros de exibição/ação como `user: UserInfo` e `onLogout?: () => void`; ele não lê nem escreve `localStorage` diretamente e não chama o repo diretamente.
- O layout é uma página de tela cheia do mesmo nível da página de login, sem aninhar cards e sem definir temporariamente cores, raios ou tamanhos de fonte fora do `DESIGN.md`.

### Mudanças em `packages/web/src/main.tsx`

Antes da conexão WebSocket em `bootstrapWebApp()`, inserir a validação de login:

```typescript
async function bootstrapWebApp() {
  const params = new URLSearchParams(window.location.search);
  const isCallback =
    window.location.pathname === "/web-remote/callback" &&
    params.has("state") &&
    (params.has("code") || params.has("error"));

  if (isCallback) {
    renderCallbackPage({
      authService: webAuthService,
      onSuccess: ({ appReturnTo }) => {
        window.location.replace(appReturnTo ?? "/web-remote");
      },
      onRetry: () => {
        window.location.replace("/web-remote");
      },
    });
    return;
  }

  // 新增：登录校验。本地缓存恢复必须同时检查 active provider、JWT、ZAI access token 和 user_info。
  const auth = await webAuthService.restoreCachedSession();
  if (!auth) {
    renderLoginPage(() =>
      webAuthService.startLogin({
        devReturnTo: DEV_RETURN_TO
          ? `${DEV_RETURN_TO.replace(/\/$/, "")}/web-remote/callback`
          : undefined,
        appReturnTo: window.location.href,
      }),
    );
    return;
  }

  const hasRemoteControlToken = params.has("remoteControlToken");
  if (!hasRemoteControlToken) {
    // 本期后端设备列表接口尚未接入时，不直接回落到普通 /ws。
    // 避免“已登录但没有目标设备”的页面误连到错误的 Web + Server 入口。
    renderLoggedInWaitingPage(<WebLoggedInWaitingPage user={auth} />);
    return;
  }

  // 以下为原有 bootstrapWebSocket 逻辑...
}
```

## Design de rotas

Dentro da SPA da página de controle remoto, os parâmetros da URL são reutilizados para distinguir “aplicativo principal” e “página de callback”:

| URL | Conteúdo renderizado |
|-----|----------------------|
| `/web-remote?remoteControlToken=...&relayOrigin=...` | entrada do link de controle remoto antigo; exige autenticação e, após o login, continua o relay bootstrap existente |
| `/web-remote` ou `/web-remote/` | entrada sem token de controle remoto antigo; exige autenticação e, nesta etapa, exibe a página de espera autenticada; depois recebe a lista de dispositivos |
| `/web-remote/callback` | página de tratamento de callback, que trata automaticamente a troca de token ou o encaminhamento por `return_to` |

Como é uma SPA, a decisão é tomada por `window.location.pathname`, sem necessidade de uma biblioteca de rotas adicional.

## Design de armazenamento

| localStorage key | Valor | Uso |
|-----------------|-------|-----|
| `zcodejwttoken` | string JWT do backend, ou seja `data.token` | autenticação das APIs de negócio; a futura interface de lista de dispositivos também a usa para identificar o usuário atual |
| `oauth:zai:access_token` | access token do ZAI, ou seja `data.zai.access_token` | mantém consistência com a estrutura do token set do ZAI OAuth do desktop |
| `oauth:zai:user_info` | JSON; de preferência a estrutura original `data.user` do backend, mapeada para `UserInfo` ao restaurar o estado de exibição | exibe nome/avatar e mantém compatibilidade com a lógica existente de restauração de user_info do ZAI no `OAuthCredentialRepo` |
| `oauth:active_provider` | `"zai"` | identifica a forma de login atual |
| `oauth:zai:expires_at` | timestamp | julgamento de expiração do token (opcional, iterações futuras) |

| sessionStorage key | Valor | Uso |
|--------------------|-------|-----|
| `oauth_pending_nonce` | UUID | proteção CSRF |

> As keys de armazenamento são coerentes com a nomenclatura existente do `OAuthCredentialRepo`. A exibição do frontend usa o tipo `UserInfo` de `@zcode/shared` e não importa tipos de volta de `@zcode/ui`.

## Interface de troca de token

### Requisição

```http
POST https://zcode.z.ai/api/v1/oauth/token
Content-Type: application/json

{
  "code": "<ZAI auth code>",
  "redirect_uri": "https://zcode.z.ai/web-remote/callback",
  "state": "<state>"
}
```

### Resposta (igual ao comportamento atual do desktop)

```json
{
  "code": 0,
  "msg": "",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiJ9...",
    "zai": {
      "access_token": "zai_access_token_xxx"
    },
    "expires_in": 86400,
    "user": {
      "user_id": "u_xxxxx",
      "name": "User Name",
      "email": "user@example.com",
      "avatar": "https://..."
    }
  }
}
```

### Tratamento de erros

- HTTP fora de 2xx: `WebRemoteControlFailureReason` é mapeado para a página de erro (como “unexpected-error”)
- `code !== 0` de negócio: exibe “登录失败，请重试” e mantém a página de login
- Ausência de `data.token` ou de `data.zai.access_token`: o mesmo tratamento, e é proibido gravar um estado parcialmente autenticado

## Variáveis de ambiente

### Injeção em desenvolvimento

No `.env.local` ou nos argumentos de inicialização do Vite:

```bash
# 你的电脑局域网 IP + 端口
VITE_DEV_ORIGIN=http://192.168.100.12:5173
```

Em desenvolvimento também é preciso configurar o caminho de troca de token. Recomenda-se configurar um proxy no dev server do Vite.

O `packages/web/vite.config.ts` atual já tem um proxy curinga `/api` apontando para o `http://localhost:3030` local e, portanto, o proxy dedicado de `/api/v1/oauth/token` precisa ficar antes do `/api`; caso contrário, a troca de token local pode ser encaminhada incorretamente para o server local em vez de `https://zcode.z.ai`.

```typescript
// packages/web/vite.config.ts
server: {
  proxy: {
    "/api/v1/oauth/token": {
      target: "https://zcode.z.ai",
      changeOrigin: true,
      secure: true,
    },
    "/ws": { target: "ws://localhost:3030", ws: true },
    "/api": { target: "http://localhost:3030" },
  },
}
```

Se mais adiante o server local `localhost:3030` implementar por conta própria o encaminhamento de `/api/v1/oauth/token`, o proxy dedicado do Vite pode ser omitido; mas é preciso escolher explicitamente um dos dois e escrever isso com clareza, sem deixar o navegador chamar diretamente do origin do Vite uma interface de mesma origem que não existe.

`main.tsx` ou a config de auth lê:

```typescript
const DEV_RETURN_TO = import.meta.env.VITE_DEV_ORIGIN;
```

O `VITE_DEV_ORIGIN` serve apenas para fazer a página local gravar `return_to` no state ao iniciar o OAuth. Quem de fato recebe o callback do ZAI é o deploy onde está `https://zcode.z.ai/web-remote/callback`; se esse deploy permite o encaminhamento de `return_to` de desenvolvimento não pode ser decidido pelo `.env.local` local. Se a equipe precisar usar o domínio online como encaminhamento do desenvolvimento local, é obrigatório adicionar no deploy do callback um switch explícito, um deploy de teste dedicado ou uma verificação de assinatura no backend.

### Build de produção

Com `VITE_DEV_ORIGIN` indefinido, `startLogin` não passa `return_to` e o `state` não tem o campo `return_to`. O build oficial de produção não aceita por padrão o encaminhamento de `return_to` de desenvolvimento sem assinatura.

Em produção, a token URL usa o `/api/v1/oauth/token` de mesma origem; em desenvolvimento o mesmo caminho também é priorizado, com o proxy do Vite encaminhando para `https://zcode.z.ai`, evitando divergências de CORS no navegador.

## Plano de testes

### Testes unitários

- `oauthStateCodec.ts`: codificação/decodificação positiva, fallback para base64/JSON inválido, cobertura das bordas de base64url com `-` / `_` / ausência de padding, allowlist de rede privada de `return_to`, cobertura de origem/path/query allowlist de `app_return_to`
- `browserOAuthCredentialRepo.ts`: verificar gravação/limpeza de `zcodejwttoken`, `oauth:zai:access_token`, `oauth:zai:user_info` e `oauth:active_provider`; quando falta qualquer key essencial, `loadCachedSession()` retorna null e limpa o estado incompleto
- `webAuthService.ts`: mock da resposta de `fetch`, verificando os caminhos de sucesso/falha da troca de token; quando falta `data.token` ou `data.zai.access_token`, nenhum estado parcialmente autenticado pode ser gravado; após o login bem-sucedido, retorna um `appReturnTo` seguro
- `WebCallbackPage.tsx`: verificar que o ramo de encaminhamento de `state.return_to` não valida o sessionStorage da origem de produção e que apenas o callback local final valida o nonce; verificar que um `return_to` de mesma origem não dá replace de volta a si mesmo e continua a troca de token; verificar que `?error=...&state=...` exibe falha de login e permite tentar de novo

### Testes E2E (manuais)

| Cenário | Passos | Esperado |
|----------|-------|----------|
| Primeiro login em produção | limpar o localStorage, acessar a página de controle remoto, clicar em login e concluir a autorização | volta ao aplicativo principal e entra no fluxo do frontend após o login |
| Login por link antigo de controle remoto | limpar o localStorage, acessar o link de controle remoto com `remoteControlToken` / `relayOrigin` e concluir a autorização | após o login volta à URL original, mantendo `remoteControlToken` / `relayOrigin` na query e continuando o relay bootstrap |
| Login sem token de controle remoto | limpar o localStorage, acessar `/web-remote` e concluir a autorização | exibe a página de espera autenticada e não conecta por engano ao `/ws` comum |
| Retorno em produção | com o cache de login completo já existente, recarregar a página | não exibe mais a página de login; com token de controle remoto antigo continua o relay bootstrap e sem ele exibe a página de espera autenticada |
| Token expirado em produção | mock de 401 do backend | exibe a página de erro ou redireciona para a página de login |
| Login em desenvolvimento | acessar o IP da rede local pelo celular e clicar em login | callback na página de produção → encaminhamento de volta ao IP da rede local → login bem-sucedido |
| Autorização cancelada | clicar em recusar na página do ZAI | permanece na página de login, sem exceção |

### Verificações mecânicas

- `pnpm typecheck`
- `pnpm lint`

## Iterações futuras (fora deste escopo)

- Refresh ativo do JWT expirado (o backend não fornece refresh_token, então é adiado por enquanto)
- Funcionalidade de logout(limpar o localStorage e voltar à página de login)
- Outros providers OAuth(como BigModel)
- Sincronização do estado de login com o desktop(mesmo navegador entre dispositivos)
- Quando a interface de lista de dispositivos do backend estiver completa, a página de login bem-sucedido passa a integrar o fluxo “obter dispositivos conectáveis → selecionar dispositivo → estabelecer conexão de controle remoto”
- Depois que o lado relay/server concluir a autenticação do `zcodejwttoken`, o frontend integra o token ou um bilhete de conexão de curta duração emitido pelo backend ao fluxo de bootstrap / conexão WebSocket