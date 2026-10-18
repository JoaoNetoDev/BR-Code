# Prompt de JWT Inválido e Reinício do ZCode

Quando o Host detecta, por meio do `NodeApiClient` unificado, que uma requisição com o JWT do ZCode retorna 401, ele primeiro reaproveita o logout do OAuth para limpar as credenciais locais e depois notifica o Renderer via Broadcast. O Renderer usa o AlertDialog unificado para informar “登录已过期” (login expirado); após a confirmação do usuário, grava um restart marker único e executa `RelaunchApp`. Quando o novo Renderer inicia, consome e apaga o marker, obrigando a entrar na página de login com o motivo `session-expired`.

```text
401 + 当前 ZCode JWT
        ↓
Host logout 清理凭据与派生 provider
        ↓
auth:zcode-jwt-invalid 广播
        ↓
Renderer AlertDialog
        ↓ 用户确认
写入一次性 restart marker
        ↓
Electron RelaunchApp
        ↓
消费 marker 并进入登录页
```

As requisições atuais de userinfo/customerInfo da plataforma, de preços corporativos, de detalhes de assinatura de equipe, que carregam o access_token de negócio atual e retornam HTTP 401 ou HTTP 200 + o valor numérico `code: 401` no JSON, também reaproveitam o fluxo acima; o escopo específico está em [401 自动退出](jwt-401-auto-logout.md). Respostas vazias, outros erros de negócio, API Keys comuns e requisições de gerenciamento de pagamento/API key não entram no novo 판단. Na versão Web não existe `RelaunchApp`: após a confirmação do usuário, o marker é gravado e `location.reload()` é chamado; após a recarga o marker também é consumido e a página de login `session-expired` é exibida.