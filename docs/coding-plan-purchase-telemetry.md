# Telemetria de compra do Coding Plan

Data: 2026-06-25

## Objetivo

A cadeia principal de compra do Coding Plan ganha dois eventos mínimos de telemetria:

- `purchase_pay_ck`: o usuário confirma continuar o pagamento e entra na cadeia de envio de pagamento da
  tentativa de compra atual.
- `purchase_result`: a mesma tentativa de compra teve sucesso, falha, cancelamento ou timeout.

Os dois eventos precisam reutilizar o mesmo `purchase_attempt_id`. Esse ID é gerado no clique em "continuar
pagamento" e fica guardado no contexto desta tentativa dentro do hook de compra atual; o envio do resultado não
pode gerá-lo de novo.

## Cadeia de envio após a migração para WebView

2026-09-09: o clique de entrada passou a ser reportado de forma unificada pelo
`CodingPlanUpgradeDialogProvider.openCodingPlanUpgrade` do App, reutilizando a saída de telemetria de plataforma
já existente. A migração para WebView havia removido a chamada no painel nativo, o que deixou o evento de
entrada do App ausente; não se pode tomar o carregamento da página como clique de entrada.

```text
用户点击入口 -> App 上报 coding_plan_upgrade_ck（不等待网络）
             -> 打开 WebView，注入同一个 purchase_funnel_id 和 entry_plan_list
             -> 官网仅上报 purchase_*，沿用入口上下文
刷新 / 重渲染 / 登录恢复 -> 不经过入口回调 -> 不新增入口事件
```

Cada chamada explícita de entrada reporta uma vez; o mesmo clique não cria outro funil ID, e o envio não é feito
dentro de effect. Chamadas internas sem funnelContext não forjam uma origem. Falha de rede segue a semântica de
warn e de "engolir o erro" do helper, sem bloquear a abertura do diálogo e sem deixar o site oficial compensar o
envio. O Desktop reporta via IPlatformService; Web/celular seguem a capacidade já existente do adaptador de
plataforma, sem criar estado novo em main/host ou realtime.

O `0f20939` da branch atual do site oficial já removeu o envio da entrada; é preciso publicar primeiro essa
versão do site oficial e só depois publicar a mudança deste App, porque o site antigo ainda reporta a entrada e
a mistura faria dupla contagem. A combinação de App antigo não atualizado com o site novo pode perder o evento de
entrada na janela de migração, e isso precisa ser anotado no registro de publicação. O site oficial também
mantém `entry_plan_list` nos eventos de produto, ciclo, pagamento e resultado. O App injeta via
`__zcodeReportContext__`, sem depender de query na URL.

Correção de compatibilidade da MR !2508: o contexto de compra do App que tenha funnelContext precisa injetar
também `purchase_entry_reporter: "app"`, passando pelo caminho de sincronização já existente por window,
localStorage e bridge, e preservando na atualização e na restauração de login. Sem funnelContext, não se declara
que o App assumiu a entrada, para não suprimir a entrada antiga do site oficial. O site oficial compatível passa a
pular o próprio envio de entrada ao ler essa marca; um site antigo que não reconhece a marca ainda precisa ser
atualizado ou corrigido a quente, e injetar a marca sozinha não elimina a dupla contagem nessa combinação. Esta
rodada não introduz uma nova flag remota nem altera a capacidade de envio por plataforma.
Cobertura de regressão: construção de contexto com e sem funil, os três pontos de leitura depois da execução real
do script de injeção, e em CPUW-01 a marca sendo `app` tanto na primeira abertura quanto após a atualização, com o
evento de entrada do App sendo reportado apenas uma vez.

Verificação desta rodada: 37 testes unitários relacionados, E2E desktop CPUW-01 / CPUW-03, typecheck completo,
`typecheck:e2e` do desktop e verificação de arquitetura passaram; lint com 0 erros e 46 warnings preexistentes.
ID de execução do E2E: `desktop-e2e-20260909110500640-p67041-68bb882e397264f5`.
Deduplicação em produção no site oficial, Windows/Linux e celular em máquina real continuam sem verificação.

Aceitação: um clique gera um evento de entrada do App, com campos coerentes com o contexto do WebView; a
atualização da página não adiciona eventos; um segundo clique reporta de novo; uma exceção não bloqueia a
abertura; re-renderização e restauração não reportam em duplicidade.

## Saída de envio

> Limpeza de código morto em 2026-09: o painel nativo do App (`CodingPlanPurchasePanel` e
> `packages/ui/src/lib/codingPlanPurchaseTelemetry.ts`) foi removido por completo, e o lado do App não tem mais
> emissor nativo de `purchase_pay_ck` / `purchase_result`; a telemetria do processo de compra é reportada
> inteiramente pela página webview do site oficial (dependente do contexto de funil `__zcodeReportContext__`
> injetado pelo App).

Na época do painel nativo, a cadeia principal reutilizava, no lado de UI,
`reportAppTelemetryEvent(platform, payload, "codingPlanPurchaseTelemetry")`, e o desktop main repassava para
`appTelemetryCore.reportEvent(...)`. Após a migração para WebView, o site oficial conecta direto ao mesmo
gateway de eventos via `ReportService.report(...)`. A saída principal atual é:

```text
https://zcode.z.ai/api/v1/event/report
```

A documentação histórica de requisitos apareceu com o grafia `evnet/report`. Antes de ir para produção é preciso
confirmar com o servidor o caminho final do gateway; enquanto o servidor não trocar explicitamente, o cliente
continua reutilizando a capacidade `event/report` existente, evitando contornar a saída unificada de telemetria
por causa de um único evento de negócio.

O fallback Web hoje é no-op, e o Desktop preenche automaticamente `device_mid`, `app_version`, sistema, tela,
idioma e fuso horário. O helper de UI apenas monta os campos de negócio e engole exceções de envio, sem bloquear
o fluxo de pagamento.

## Campos dos eventos

Todos os valores de `eventExtraDetail` precisam ser convertidos em string; valor vazio vira string vazia, e não
se envia `undefined` / `null`.

Campos comuns:

| Campo | Descrição |
| --- | --- |
| `purchase_funnel_id` | ID de funil reutilizado da mesma entrada até o fluxo de compra, preferindo o valor injetado pelo WebView do App |
| `entry_plan_list` | Lista de planos que o usuário já tinha ao entrar no fluxo de compra; chave dinâmica, concatenada por vírgulas |
| `purchase_attempt_id` | UUID compartilhado pelo mesmo clique e pelo resultado |
| `purchase_audience` | `personal` / `team` |
| `provider_family` | `bigmodel` / `zai` / `unknown` |
| `channel` | BigModel tem `MaaS` por padrão, Z.ai tem `Z_AI` por padrão |
| `product_id` | ID do produto atual |
| `product_name` | Nome de exibição do produto ou nome do backend |
| `plan_tier` | `lite` / `pro` / `max` / `team_standard` / `team_advanced` / valor original |
| `billing_period` | `month` / `quarter` / `year` / `unknown` |
| `purchase_method` | `continuous` / `one_time` / `unknown` |
| `payment_method` | Forma usada no envio final do pagamento: `alipay` / `paypal` / `stripe` / `unknown` |
| `seat_count` | Número de assentos da equipe; vazio no pessoal |
| `duration_months` | Duração da compra única de equipe; vazio no pessoal e na assinatura contínua |
| `currency` | Moeda do backend ou do produto |
| `cashAmount` | Plano pessoal: `cashAmount` do preview do item; plano de equipe: `balanceDeductAmount` da simulação |
| `giveAmount` | Plano pessoal: `giveAmount` do preview do item; plano de equipe: `giveDeductAmount` da simulação |
| `thirdPartyAmount` | Plano pessoal: `thirdPartyAmount` do preview do item; plano de equipe: `thirdPayAmount` da simulação |
| `refundAmount` | Plano pessoal: `refundAmount` do preview do item; plano de equipe: vazio quando não há campo correspondente |
| `residualAmount` | Plano pessoal: `residualAmount` do preview do item; plano de equipe: vazio quando não há campo correspondente |
| `totalOriginalAmount` | Preço original do pedido devolvido pela simulação de equipe; vazio no plano pessoal |
| `campaignDiscountAmount` | Valor do desconto de campanha devolvido pela simulação de equipe; vazio no plano pessoal |
| `totalPayAmount` | Total a pagar após o desconto devolvido pela simulação de equipe; vazio no plano pessoal |

Não se reporta mais o `amount` de semântica vaga. Os campos de valor preservam a semântica de composição
devolvida pelo backend, sem usar `payAmount` para fingir `thirdPartyAmount` e sem inferir no cliente valores
ausentes. Os números são convertidos uniformemente em string com duas casas decimais; um zero explícito vira
`"0.00"`, e um campo que a API não devolveu vira string vazia.

### Sequência do snapshot de valores

```text
个人 pay/preview / 团队 order/calculate
  -> 冻结本次购买的 Amount 快照
  -> purchase_pay_ck
  -> 提交支付并轮询终态
  -> purchase_result 复用同一份 Amount 快照
```

A resposta de order status de um pagamento de equipe bem-sucedido não contém valores. Portanto, a cadeia de
equipe precisa congelar `totalOriginalAmount` / `campaignDiscountAmount` / `totalPayAmount` / `giveDeductAmount` /
`balanceDeductAmount` / `thirdPayAmount` logo após o sucesso de `order/calculate`, sem recalcular depois do
pagamento bem-sucedido.

Campos de resultado:

| Campo | Descrição |
| --- | --- |
| `failure_stage` | Estágio da falha; vazio no sucesso |
| `error_code` | Código de erro estável; vazio no sucesso |
| `error_message` | Texto de erro curto e normalizado; proibido subir HTML, schema, token, cartão e outros conteúdos sensíveis |
| `order_status` | Texto original do status de pagamento do backend; normalizado como `SUCCESS` no sucesso e `TIMEOUT` no timeout |
| `biz_id` | ID de verificação de pagamento pessoal |
| `order_no` | Número do pedido da equipe |
| `elapsed_ms` | Tempo decorrido do clique em "continuar pagamento" até o envio do resultado |

## Mapeamento de resultado

`purchase_result` não ganha um campo `result` separado; a expressão é feita por `order_status` + `error_code`:

| error_code | failure_stage | order_status | Cadeia | Descrição |
| --- | --- | --- | --- | --- |
| string vazia | string vazia | `SUCCESS` | pessoal / equipe | Pagamento bem-sucedido |
| `create_sign_failed` | `create_sign` | `FAIL` | pessoal BigModel | Falha na assinatura da primeira compra |
| `update_sign_failed` | `update_sign` | `FAIL` | pessoal BigModel | Falha na assinatura da troca de plano |
| `paypal_setup_failed` | `paypal_setup` | `FAIL` | pessoal Z.ai | Falha no setup do PayPal |
| `paypal_subscribe_failed` | `paypal_subscribe` | `FAIL` | pessoal Z.ai | Falha no subscribe do PayPal |
| `stripe_pay_failed` | `stripe_pay` | `FAIL` | pessoal Z.ai | Falha no pagamento via Stripe |
| `create_order_failed` | `create_order` | `FAIL` | equipe | Falha ao criar o pedido |
| `continue_order_payment_failed` | `continue_order_payment` | `FAIL` | equipe | Falha ao continuar o pagamento de um pedido pendente |
| `payment_status_failed` | `terminal_status` | `FAIL` | pessoal / equipe | Estado terminal de falha do backend |
| `payment_status_closed` | `terminal_status` | `CLOSED` | equipe | Estado terminal de fechamento do backend |
| `payment_status_cancelled` | `terminal_status` | `CANCELLED` | pessoal / equipe | Estado terminal de cancelamento |
| `payment_check_timeout` | `timeout` | `TIMEOUT` | pessoal / equipe | Timeout do polling |
| `user_cancelled` | `user_cancel` | `CANCELLED` | pessoal / equipe | O usuário fechou ou voltou ativamente, encerrando esta tentativa de pagamento |
| `unknown_error` | `unknown` | `FAIL` | pessoal / equipe | Exceção não classificada |

A validação de segurança da compra é uma verificação anterior a `pay/preview`. A implementação atual só gera o
`purchase_attempt_id` e envia `purchase_pay_ck` quando o preview tem sucesso e a cadeia de envio do pagamento é
alcançada; por isso, cancelar a validação de segurança pelo usuário não gera `purchase_result`.

## Requisitos de verificação

- Clicar em "continuar pagamento" envia `purchase_pay_ck` apenas uma vez.
- O `purchase_attempt_id` do clique e do resultado é o mesmo na mesma compra.
- Cancelamento pelo usuário, fechamento do diálogo de pagamento, falha de pagamento e timeout de polling todos
  enviam `purchase_result`.
- `purchase_pay_ck` e o `purchase_result` correspondente precisam trazer o mesmo `payment_method`.
- `purchase_pay_ck` e o `purchase_result` correspondente precisam trazer o mesmo snapshot de Amount.
- `eventExtraDetail` não pode mais conter `amount`.
- Valor ausente e zero explícito precisam ser reportados respectivamente como string vazia e `"0.00"`.
- Na cadeia de sucesso, `error_code`, `failure_stage` e `error_message` são strings vazias.
- `order_no` tem valor no pedido de equipe e `biz_id` tem valor na cadeia pessoal, sem uso misturado.
- Falha no envio só registra warn e não afeta a UI nem o estado do pagamento.

## Registro de verificação de 2026-09-09

- 32 testes unitários relacionados passaram, cobrindo campos de entrada, ausência de duplicação em
  re-renderização, novo clique e envio com exceção sem bloquear.
- Os dois casos BigModel / Z.ai de `coding-plan-upgrade-webview-refresh-provider.test.ts` passaram. As requisições
  foram capturadas na fronteira `net.fetch` do App, validando entrada única, o mesmo contexto de funil e o fato de
  a atualização não adicionar eventos; a resposta do gateway é mock, o que não equivale a sucesso de recebimento
  no gateway de produção. ID de execução relatado: `desktop-e2e-20260909-083415-672`.
- O CUA clicou no upgrade do Start Plan na versão de desenvolvimento, e a página de compra do site abriu
  normalmente.
- `pnpm typecheck`, `typecheck:e2e` do desktop e a verificação de arquitetura passaram; lint com 0 erros e 46
  warnings preexistentes.
- O site oficial e o App não foram publicados; a receptação conjunta em produção, o Web no celular em máquina
  real e Windows/Linux em máquina real continuam pendentes de regressão antes da publicação.

## Correção do snapshot de planos de todas as conexões

`entry_plan_list` representa todos os planos que o usuário atual já possui, e não o cartão clicado. A entrada
unificada de compra agrega o Start Plan do BigModel/Z.ai, os benefícios de planos pessoais e os produtos de
equipe com `subscribed=true` no authenticated pricing. Conexões ainda não ativadas, mas válidas, também entram;
planos não comprados, já expirados, API Keys comuns e fornecedores personalizados não são forjados como plano. A
classificação é feita pela identidade de provider/equipe a que cada snapshot pertence, sem usar o
`entry_plan_status` da entrada para classificar a lista inteira. Os dados são deduplicados e ordenados de forma
estável. O source/status/level da entrada continuam descrevendo a posição do clique e não são sobrescritos por
outro plano.

```text
现有权益 hooks（独立 provider 缓存）+ authenticated 团队订阅查询
  -> 全部已知有效套餐 -> 去重排序
  -> 显式购买入口冻结快照 -> App 上报 + WebView 注入同一列表
  -> 后续权益刷新不修改已经打开的漏斗
```

Usa-se a capacidade de consulta/cache já existente, sem novo cache de negócio nem estado persistido, e sem
depender da conexão atualmente selecionada. A entrada de compra precisa esperar todas as consultas desta rodada
completarem com sucesso, e é proibido liberar com resultado parcial. Fonte não configurada não é consultada; para
fonte configurada, `no_plan` é um resultado vazio bem-sucedido, e snapshot com exceção ou ausente não é uma lista
vazia. O estado unificado é mantido por useCodingPlanEntryPlanList, o Provider também protege o clique e todos os
botões/menus leem o mesmo estado. Durante a consulta a entrada fica desabilitada com indicação de carregamento; em
caso de falha, a entrada é apresentada como "falha na consulta de planos, tentar de novo", e o retry apenas
atualiza os dados, sem abrir automaticamente a página de compra e sem reportar a entrada. Depois que tudo dá
sucesso, é preciso um novo clique explícito do usuário. Mudança de conta ou de conexão invalida imediatamente o
resultado antigo, e uma resposta assíncrona antiga não pode liberar uma nova rodada de consulta; um funil já
aberto não muda com consultas de background.
Desktop/Web usam a mesma agregação; sem alterar os limites continuous/replayable ou de host de controle remoto.
A correção atual não muda o protocolo de envio do site oficial e continua passando `entry_plan_list` como string.

Aceitação:Ao mesmo tempo em que Start Plan + Lite são mantidos, os dois pontos de entrada reportam a mesma
lista; produtos de equipe são classificados explicitamente como equipe; itens de equipe não assinados e
expirados são excluídos; dados duplicados são deduplicados; trocar o ponto de entrada não afeta a lista; App e
WebView têm campos idênticos.

### Verificação desta correção

- 16 testes unitários relacionados passaram, cobrindo agregação entre families, conexões não habilitadas, filtro
  de expiração, troca de login de equipe e congelamento do snapshot no clique.
- Os dois casos desktop CPUW-01 / CPUW-03 passaram; CPUW-01 afirma na fronteira `net.fetch` do App
  `coding_plan__personal_pro,start_plan__zcode_v3_start_plan` e confere que o contexto do WebView é idêntico. A
  conexão Start foi pré-configurada como disabled, o que prova que conexões compradas e ainda não ativadas também
  são contabilizadas; a resposta do gateway continua sendo mock.
- O CUA clicou no upgrade do Pro pessoal da conta de desenvolvimento atual e, por CDP somente leitura, conferiu o
  contexto do WebView, obtendo `coding_plan__personal_pro,coding_plan__team_pro`, que inclui o plano de equipe não
  clicado. Dessa vez a conferência do contexto do WebView não é chamada de sucesso de recebimento no gateway de
  produção.
- `pnpm typecheck`, `pnpm lint` e `pnpm architecture:check --changed` passaram.
- Não foi feita regressão em máquina real no Windows/Linux nem no Web do celular.

### Cenários de regressão do portão de integridade

Durante uma resposta lenta, o cartão de configurações, a faixa de compra pessoal/da equipe, o menu do avatar, a
cota da sessão, o uso do Start e a entrada de compra em horário ocioso não podem abrir a página de compra. O retry
após falha lê apenas os planos e não gera evento de entrada; só depois que tudo dá sucesso o clique gera uma vez o
evento do App com a lista completa. Cadeia de estados: mudança de conta/conexão -> loading -> ready ou error ->
retry -> loading; confirmar que não há plano também entra em ready.
O Provider é o único ponto de execução da entrada, sem criar fila de cliques aguardando e sem reproduzir
automaticamente os cliques que o usuário teve bloqueados.

Resultado da verificação: 231 testes unitários relacionados passaram; os dois E2E desktop CPUW-01/CPUW-03
passaram. CPUW-01 segura a requisição na fronteira do authenticated pricing, confirma o menu desabilitado; ao
retornar 503 mostra o retry e, tanto antes como depois do retry bem-sucedido, não há evento de entrada — só o
clique explícito de compra posterior gera uma lista completa na fronteira `net.fetch` do App.
Ao mesmo tempo, verificou-se que o WebView injeta a mesma lista, que a atualização da página não reporta de novo e
que a compra do BigModel/Z.ai dispara a atualização. Os logs de desenvolvimento usam `UI logger.debug` para
`[purchaseTelemetry] 套餐入口查询状态` e não registram credenciais. Não foi executada regressão em máquina real no
Windows/Linux nem no celular; os botões e menus compartilhados usam o mesmo estado e os mesmos textos em
chinês e inglês.

### Convergência dos itens sugeridos da MR !2508

- SG-01: com um snapshot de não compra já existente e o login/sincronização de cartão único ainda pendente, o
  Subscribe continua desabilitado e mostra o mesmo spinner do Upgrade; o spinner é removido ao concluir. Os
  textos globais de inventory loading/error continuam com prioridade, sem mudar os gates nem a semântica de
  retry. Desktop e celular compartilham o componente, mantendo tema e tradução.
- SG-02: o construtor da entrada só estabelece origem, estado do plano e funil ID, com entryPlanList inicialmente
  vazio; o Provider preenche um único snapshot de todas as conexões no clique explícito após a consulta completa
  ter sucesso. Remover o construtor de lista antigo, que inferia a audience pelo nome em inglês, e os parâmetros
  que existiam só para sustentar essa lógica.
- SG-03: manter a consulta ativa atual conforme confirmado pelo usuário; esta rodada não muda o tempo nem o cache
  da consulta.

```text
单卡同步 -> Subscribe disabled + spinner -> 同步完成恢复
入口上下文（列表待填）-> Provider 完整快照 -> App 上报 + WebView 注入
```

Regressão: o cartão de não compra mostra/remove o spinner durante e após a sincronização; o builder da entrada não
infere a lista a partir do cartão; o Provider congela o snapshot completo; o E2E de compra no WebView existente
mantém a lista coerente e a atualização da página sem novo envio.

Verificação desta rodada: 194 testes unitários relacionados passaram; o E2E de compra com uma conta desktop sem
benefícios prende a sincronização de cartão único na fronteira de rede do customerInfo e confirma o spinner, a
desabilitação, a restauração do Subscribe e a entrada na página de compra, ID de execução
`desktop-e2e-20260909112055848-p74517-0093597585192353`. CPUW-01 / CPUW-03 também passaram; problemas iniciais de
espera de renderização do menu e de clique por ponteiro no novo cenário foram corrigidos e a execução refeita com
sucesso. typecheck, `typecheck:e2e` do desktop, lint (46 warnings preexistentes) e a verificação de arquitetura
passaram. Regressão em Windows/Linux, em máquina real no celular e a comparação completa dos dois temas não foram
executadas.