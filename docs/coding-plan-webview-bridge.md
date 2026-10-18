# Coding Plan WebView Bridge

A página `/coding-plan` do site oficial só permite acesso embutido dentro do WebView do ZCode App. Quando o App abre a página, ele deve carregar `embedded=app` e injetar via WebView as credenciais de compra do provider atual.

Cadeia de sincronização:

```text
用户点击升级/续费
  -> CodingPlanUpgradeDialog 收到 providerId、audience，以及可选的 teamPlanKey
  -> App 解析官网地址
     - 本地开发：    http://localhost:3000
     - 测试环境：    https://zcode.z.ai
     - 正式环境：    https://zcode.z.ai
     - 显式 override：VITE_CODING_PLAN_WEBVIEW_ORIGIN
  -> WebView 打开 /coding-plan?provider={zai|bigmodel}&audience={personal|team}&teamPlanKey={可选}&embedded=app&lang={cn|en}&theme={zai-light|zai-dark}
  -> dom-ready 后从 credentialService 读取 token
  -> executeJavaScript 先清理旧 provider token，再写入 WebView origin 的 localStorage，并同步 App theme class
  -> dispatch zcode-coding-plan-auth-ready
  -> 官网页重新拉取 batch-preview / preview / purchase
```

`lang` e `theme` são hints de primeira tela: o site oficial usa ambos para renderizar o idioma e o tema corretos antes da execução do script injetado pelo App. Em especial, `theme` existe para evitar o piscar da primeira abertura entre o padrão escuro do SSR do site oficial e o tema claro do App; o tema real em runtime continua sendo definido pelo `zcode-theme` e pela class escritos pelo script injetado depois.

`audience` e `teamPlanKey` expressam a intenção do plano no momento em que o usuário clica em upgrade. Z.ai/BigModel determina a família do site oficial apenas pelo Provider ID: para plano pessoal passa-se `audience=personal`; para plano de equipe passa-se `audience=team` junto com a key da conexão de equipe atual. Eles não participam da autenticação nem substituem a avaliação do site oficial sobre o plano real e as permissões da equipe.

O shell do WebView mantém a estrutura original da página de compra do App: sobreposição em tela cheia, barra de título "升级套餐" (Upgrade de plano) no topo, botão de fechar à direita e, abaixo da barra de título, o aviso promocional de cota de 150%. A página do site oficial abriga apenas o corpo do plano e o fluxo de pagamento subsequente.

A camada de integração do WebView oculta o container de rolagem do host e as barras de rolagem nativas dentro da página guest, mas não desabilita a rolagem da página. O App injeta o estilo `zcode-coding-plan-hide-scrollbar` após cada `dom-ready`, cobrindo a página do site oficial e as páginas posteriores de pagamento de terceiros / retorno, para evitar que o conteúdo do site oficial, somado ao estilo global de barra de rolagem do App, gere ruído visual extra.

As chaves de injeção são consistentes com as interfaces de compra do App:

| Provider             | WebView localStorage key      |
| -------------------- | ----------------------------- |
| Z.ai                 | `oauth:zai:access_token`      |
| Z.ai Start Plan 兜底 | `zcodejwttoken`               |
| BigModel             | `oauth:bigmodel:access_token` |

O token não é colocado na query da URL, evitando vazamento por histórico do navegador, logs, telemetria e Referer. A página do WebView só pode ler o valor injetado pelo localStorage da origin atual.

## Fallback em caso de falha de carregamento

Por decisão do usuário, quando o WebView está indisponível **não há retorno ao antigo React Dialog**: apenas se reporta o erro e se orienta o usuário a comprar diretamente no site oficial:

- Monitora os eventos `did-fail-load` (main frame) e `render-process-gone` do `<webview>`.
- Após o disparo, exibe o estado de erro: `settings.modelProvider.codingPlan.webview.loadFailed` + os detalhes do erro.
- No estado de erro, o elemento webview fica `hidden` e são oferecidas duas ações:
  - **Ir ao site oficial comprar**: abre o navegador do sistema via `IPlatformService.openExternal(webviewUrl)`.
  - **Tentar novamente**: `webview.reload()`.
- Falha na injeção de credenciais (`executeJavaScript` lança erro) segue uma barra de retry separada, `authInjectFailed`, distinta da falha de carregamento.

## Retorno de compra concluída

Após a compra bem-sucedida na página do site oficial, o App é notificado em tempo real pelo canal **preload + ipc-message**; depois de atualizar o estado do plano, o App fecha o webview automaticamente.

### Protocolo

```text
[官网页] 购买成功（Alipay 轮询 / Stripe / 企业订单 onSuccess）
    │
    │ window.zcodeBridge?.notifyPurchaseComplete?.({ provider })   ← no-op guard
    ▼
[preload: packages/desktop/src/preload/codingPlanWebview.ts]
    │ ipcRenderer.sendToHost("zcode:coding-plan-purchase-complete", {
    │   provider: "zai" | "bigmodel",
    │   timestamp: number,            ← 客户端时间戳，仅用于日志/去重
    │ })
    ▼
[host renderer: CodingPlanEmbeddedWebviewDialog]
    │ webview.addEventListener("ipc-message", ...)
    │   if (event.channel !== CodingPlanWebviewChannels.PurchaseComplete) return
    │   校验 payload.provider ∈ {"zai","bigmodel"}
    │   onPurchaseCompleteRef.current?.()
    ▼
[CodingPlanUpgradeDialog.handlePurchaseComplete]
    │ closeAndRefreshCodingPlanUpgradeFromWebview(...)
    │   1. onClose()   ← 先关闭 webview，避免弱网刷新阻塞用户回到主界面
    │   2. refreshCodingPlanUpgradeCompletion(...)
    │      ├─ refreshCodingPlanApiKey（每个 provider）
    │      ├─ refreshModelProviders
    │      ├─ refreshCodingPlanEntitlements
    │      └─ codingPlanSubscriptionService.getEnterprisePricing({
    │           authenticated: true,
    │           family: teamPlanFamily,   ← "zai" | "bigmodel"
    │         })
```

### Canal e payload

- Nome do canal: `zcode:coding-plan-purchase-complete` (definido em `packages/shared/src/channels.ts` como `CodingPlanWebviewChannels.PurchaseComplete`)
- Tipo do payload: `CodingPlanPurchaseCompletePayload`
  - `provider`: `"zai" | "bigmodel"`, isomórfico ao `detail.provider` do evento auth-ready
  - `timestamp`: `number`, timestamp do cliente, usado no App apenas para log/deduplicação; não participa de comparação de igualdade

### Roteamento no preload

O hook `will-attach-webview` de `desktopWindowChrome.ts` roteia com base em `params.src`:

- `/coding-plan?...&embedded=app` (http/https) → `codingPlanWebviewPreloadPath` (monta `window.zcodeBridge`)
- demais webviews (navegador embutido etc.) → `embeddedBrowserJavaScriptDialogPreloadPath` (ponte original de alert/confirm)

As webPreferences dos dois são idênticas (contextIsolation=true / sandbox=true / nodeIntegration=false).

### Pontos de chamada na página do site oficial

3 pontos em `components/coding-plan/coding-plan-page.tsx` (o helper `notifyZcodeBridgePurchaseComplete(provider)` já embute o no-op guard, então rodar o site oficial sozinho não tem impacto):

| Cenário de pagamento                     | Local                       | provider   |
| --------------------------------------- | --------------------------- | ---------- |
| Sucesso na consulta do QR do Alipay (bigmodel pessoal) | alipay-qr useEffect | `bigmodel` |
| onSuccess da consulta de pedido corporativo (equipe bigmodel) | `pollEnterpriseOrderStatus` | `bigmodel` |
| Sucesso do pagamento Stripe (pessoal zai + equipe internacional) | `onStripePay` | `zai` |

### Segurança

- Após receber `ipc-message`, o host renderer valida o campo `provider`, aceitando apenas `zai`/`bigmodel` e ignorando payloads inválidos.
- A página do site oficial é um site https externo; `will-attach-webview` continua aplicando a whitelist de protocols via `isAllowedEmbeddedBrowserUrl`.
- O `window.zcodeBridge` exposto pelo preload contém apenas a superfície mínima de negócio: `notifyPurchaseComplete`, `getLang`, `onLangChange`, `openExternal`; não expõe `ipcRenderer` nem primitivas do Node; `openExternal`, tanto no preload quanto no processo main, só permite `http:` / `https:`.
- O WebView usa a partition persistente independente `persist:zcode-coding-plan`. Antes de o App injetar as credenciais e ao fechar a página de compra, são limpos `oauth:zai:access_token` / `zcodejwttoken` / `oauth:bigmodel:access_token`; o logout ou Clear All Data limpa a partition inteira via comando de desktop, evitando que a primeira tela do site oficial leia um token antigo após troca de conta.