# Design da telemetria do funil de compra do Coding Plan

> A atribuição atual das entradas segue a regra de 2026-09-09 de [telemetria de compra](./coding-plan-purchase-telemetry.md): o clique na entrada explícita do App reporta uma vez; as descrições abaixo de abertura do painel nativo e de reporte na recuperação OAuth são semântica histórica.

Data: 2026-06-29
Status: rascunho

## 1. Objetivo

Preencher os três eventos de clique a seguir:

1. `coding_plan_upgrade_ck`: entrada na página de seleção de produto do Coding Plan.
2. `purchase_product_select_ck`: seleção do produto pessoal ou de equipe.
3. `purchase_billing_cycle_select_ck`: confirmação do ciclo/método de compra e entrada na página de confirmação de pagamento.

Junta-se aos eventos existentes para formar a cadeia completa do cliente:

```text
coding_plan_upgrade_ck
-> purchase_product_select_ck
-> purchase_billing_cycle_select_ck
-> purchase_pay_ck
-> purchase_result
```

Os eventos usam uniformemente a estrutura abaixo, com `eventRegion` preenchido conforme o local de ocorrência do evento:

```json
{
  "eventType": "ck",
  "eventRegion": "app.purchase",
  "elementName": "事件名",
  "eventText": "用户实际点击的界面文本",
  "eventExtraDetail": {}
}
```

Restrições:

- `eventText` é um campo de topo e corresponde ao `event_text` do resultado de reporte.
- `eventText` usa o texto localizado que o usuário realmente viu ao clicar, como "Upgrade", "Assinar", "Plano pessoal".
- `coding_plan_upgrade_ck` acontece na entrada do fluxo de compra, e seu `eventRegion` usa o `app.profile`, `app.session` ou `app.setting` em que o usuário estava ao clicar na entrada; a entrada concreta é distinguida por `upgrade_source`.
- Exceto `coding_plan_upgrade_ck`, os eventos `purchase_product_select_ck`, `purchase_billing_cycle_select_ck` e o já existente `purchase_pay_ck` dentro do painel de compra ocorrem em `app.purchase`, e seu `eventRegion` precisa ser fixado como `app.purchase`.
- As dimensões de negócio vão em `eventExtraDetail`, sem repetir o texto do clique.
- Todos os valores de `eventExtraDetail` são string; valor vazio se escreve `""`.
- Usa a grafia padrão `purchase_billing_cycle_select_ck`, e não `biling`.

## 2. ID de correlação

O `purchase_attempt_id` existente só é gerado no clique de pagamento, o que impede correlacionar os três primeiros eventos.

Novo:

```text
purchase_funnel_id
```

Regras:

- Ao clicar em uma entrada que abre diretamente o painel de compra, cria-se um UUID pending; só depois que o painel de compra confirma a abertura é que esse UUID passa a ser o `purchase_funnel_id` desta vez e `coding_plan_upgrade_ck` é reportado.
- Quando desconectado, as entradas pessoal/equipe hoje apenas disparam o OAuth e não abrem automaticamente o painel de compra; esse clique não cria `purchase_funnel_id` nem reporta `coding_plan_upgrade_ck`. Quando o usuário abrir de novo o painel de compra após o login, começa-se um novo funil.
- Entradas que já abriram o painel de compra primeiro e só então dispararam OAuth a partir da seleção de plano dentro do painel (incluindo o Upgrade de tarefa off-peak) começam o funil no momento da abertura do painel. Durante o login OAuth é preciso preservar o `purchase_funnel_id`, o `upgrade_source` e o snapshot do plano de entrada originais; após o login bem-sucedido, a seleção de plano é restaurada e o funil original continua, e é proibido gerar um novo ID ou reescrever a origem como sendo a entrada de login.
- Os três eventos novos e o já existente `purchase_pay_ck` e `purchase_result` usam o mesmo ID.
- Depois que o usuário entra em `app.purchase`, só um `purchase_funnel_id` é gerado para este fluxo de compra. Ao voltar ao passo anterior dentro do fluxo, escolher de novo e entrar novamente nas páginas seguintes, o mesmo ID continua sendo usado, e ele não pode ser gerado de novo por unload ou remontagem de subpágina.
- Fechar o painel de compra encerra; abrir de novo gera um novo ID.
- `purchase_attempt_id` continua representando uma tentativa real de pagamento, sem mudar de significado.

A página de sucesso do pagamento é o estado final do fluxo de compra: oferece apenas "Fechar/Concluir", sem "Voltar". O usuário não consegue voltar da página de sucesso aos passos anteriores da compra; fechar a página de sucesso encerra este funil.

## 3. `coding_plan_upgrade_ck`

É reportado quando o usuário clica em qualquer entrada que consiga levar à página de seleção de produto do Coding Plan.

```json
{
  "eventType": "ck",
  "eventRegion": "app.session",
  "elementName": "coding_plan_upgrade_ck",
  "eventText": "升级",
  "eventExtraDetail": {
    "purchase_funnel_id": "2a3f0a1e-1234-5678-9012-acde12345678",
    "upgrade_source": "session_token_usage",
    "entry_plan_status": "start_plan",
    "entry_plan_level": "start",
    "purchase_audience": "",
    "provider_family": "zai",
    "channel": "Z_AI"
  }
}
```

Campos:

| Campo | Significado | Valor |
| --- | --- | --- |
| `eventText` | Texto realmente clicado | `升级`, `订阅`, `个人套餐`, `团队套餐`; na interface em inglês, o equivalente em inglês |
| `upgrade_source` | Local do clique | Ver tabela abaixo |
| `entry_plan_status` | Estado do plano ao entrar no funil de compra | `no_plan` / `start_plan` / `coding_plan` / `unknown` |
| `entry_plan_level` | Nível do plano ao entrar no funil de compra | Valor original do snapshot de backend/entitlement; `""` quando não disponível |
| `entry_plan_list` | Lista de planos que o usuário já tem ao entrar no funil de compra | `start_plan__{planId}`, `coding_plan__personal_{tier}`, `coding_plan__team_{tier}`, unidos por vírgula |
| `purchase_audience` | Alvo da compra | `personal` / `team`; `""` enquanto ainda não escolhido |
| `provider_family` | Provider | `bigmodel` / `zai` / `unknown` |
| `channel` | Canal | `MaaS` / `Z_AI` / `""` |

Enumeração de entradas:

| `eventRegion` | `upgrade_source` | Local | Código atual |
| --- | --- | --- | --- |
| `app.profile` | `profile_menu` | Upgrade no menu do avatar do usuário | `WorkspaceSidebar.tsx`, `SettingsPage.tsx` |
| `app.session` | `session_quota_alert` | Upgrade no lembrete de quota da Session | `ChatView.tsx` |
| `app.session` | `session_token_usage` | Upgrade na área de uso de tokens da caixa de entrada | `ChatInputToolbar.tsx` |
| `app.session` | `session_idle_time` | Upgrade na página inicial de New task e no aviso de elegibilidade de tarefas off-peak de Automations | `OffPeakNewTaskEntry.tsx`, `AutomationsSection.tsx` |
| `app.setting` | `setting_plan_card` | Upgrade/Subscribe do Coding Plan na página de configurações de modelo | `StatusCards.tsx` |
| `app.setting` | `setting_start_plan_card` | Upgrade/Subscribe na página de configurações de modelo quando o modo de vínculo atual é Start Plan | `StatusCards.tsx` |
| `app.setting` | `setting_personal_plan_banner` | Entrada de plano pessoal na página de configurações de modelo | `Detail.tsx` |
| `app.setting` | `setting_team_plan_banner` | Entrada de plano de equipe na página de configurações de modelo | `Detail.tsx` |

O conversation do V4 usa o mesmo contrato de evento, mas a entrada é carregada pelo session quota banner do V4. O banner precisa estar realmente visível e preservar dismiss, bloqueio de envio e refresh de entitlement; o funil só começa depois que o painel de compra confirma a abertura. Web/celular pode exibir o estado autoritativo de quota, mas o reporte de rede do contrato antigo de desktop é executado apenas pelo reporter `desktop-continuous`.

Os cenários são expressos por combinações de campos factuais, sem campos de cenário inferidos reportados em separado:

| Cenário | Combinação de campos |
| --- | --- |
| Upgrade do Start Plan | `entry_plan_status=start_plan` |
| Primeira compra do Coding Plan | `entry_plan_status=no_plan` |
| Upgrade com Coding Plan já existente | `entry_plan_status=coding_plan`, carregando `entry_plan_level` |

Valores no código:

- Nova função pura `resolveCodingPlanEntryPlanState(...)`, que uniformemente produz `entryPlanStatus` e `entryPlanLevel`; todas as entradas reutilizam, e é proibido que cada componente escreva o seu próprio julgamento.
- Settings: recebe `displayStatus`, `providerId` e `planLevel` já existentes. Um provider Start pode carregar benefícios pagos do Coding Plan, portanto não se pode julgar só pelo providerId; no estado `purchased` é preciso primeiro verificar se `planLevel` é um Start Plan real, e benefício que não é Start é classificado como `coding_plan`.
- Session/Token: o código da entrada já tem o providerId de Start Plan e o snapshot de entitlement, então escreve-se `start_plan` diretamente.
- Menu do avatar do usuário: reaproveita o snapshot de entitlement já carregado; `unavailableReason=no_plan` escreve `no_plan`, e a existência de quota/subscription/remaining escreve `coding_plan`.
- Tarefa off-peak: reaproveita o provider registry já carregado por completo. Existindo um provider de Coding Plan que o sistema não marcou como inválido, escreve-se `coding_plan`; existindo apenas Start Plan, escreve-se `start_plan/start`; com o registry já carregado e nenhum dos dois tipos de plano presente, escreve-se `no_plan`; durante o carregamento ou sem julgamento confiável, escreve-se `unknown/""`. Não se pode inferir que o usuário não tem plano só porque o portão de selected-connection falhou.
- Na falta de um snapshot confiável, escreve-se `unknown`/`""`, sem adivinhar pelo texto do botão.
- Nenhuma requisição nova de interface; o estado é calculado na fase de derivação de render/state existente e lido direto no clique.

Regras de disparo:

- Só reporta quando o painel de compra realmente abre após o clique do usuário.
- Quando desconectado, a entrada pessoal/equipe que só dispara OAuth não reporta; continua-se usando o evento de login existente.
- Desabilitado, abertura automática e fechamento do painel de compra não reportam.
- As entradas pessoal/equipe de Settings preenchem `purchase_audience` separadamente.
- A entrada de tarefa off-peak abre por padrão a página de plano pessoal, com `coding_plan_upgrade_ck.purchase_audience=personal`; quando o usuário trocar depois para o plano de equipe, os eventos downstream de produto/ciclo/pagamento escrevem `team` conforme a escolha real.

## 4. `purchase_product_select_ck`

É reportado quando o usuário clica em um cartão de produto disponível na página de seleção de produto e entra na página de seleção de ciclo.

```json
{
  "eventType": "ck",
  "eventRegion": "app.purchase",
  "elementName": "purchase_product_select_ck",
  "eventText": "选择套餐",
  "eventExtraDetail": {
    "purchase_funnel_id": "2a3f0a1e-1234-5678-9012-acde12345678",
    "upgrade_source": "setting_plan_card",
    "entry_plan_status": "no_plan",
    "entry_plan_level": "",
    "purchase_audience": "personal",
    "provider_family": "bigmodel",
    "channel": "MaaS",
    "product_group_id": "glm-coding-pro",
    "product_id": "",
    "product_name": "GLM Coding Pro",
    "plan_tier": "pro"
  }
}
```

Campos:

| Campo | Significado | Valor |
| --- | --- | --- |
| `eventText` | Texto real do botão do cartão de produto | `选择套餐` / `订阅` / `升级`; na interface em inglês, o equivalente em inglês |
| `purchase_audience` | Tipo de produto | `personal` / `team` |
| `provider_family` | Provider | `bigmodel` / `zai` / `unknown` |
| `channel` | Canal | `MaaS` / `Z_AI` / `""` |
| `product_group_id` | Key estável do grupo de produto | Plan group key do código |
| `product_id` | SKU específico | Nesta fase o ciclo ainda não foi escolhido, então escreve-se `""` |
| `product_name` | Nome do produto | Como `GLM Coding Pro` |
| `plan_tier` | Faixa do plano | `lite` / `pro` / `max` / `team_standard` / `team_advanced` / `unknown` |

Regras de disparo:

- Produto pessoal é reportado após o clique em `PlanChoiceCard`.
- Produto de equipe é reportado após o clique em `TeamPlanChoiceCard`.
- Plano atual, Start Plan gratuito e produtos desabilitados não reportam.
- Não se forja `product_id` usando o primeiro SKU do grupo de produto.

## 5. `purchase_billing_cycle_select_ck`

É reportado quando o usuário confirma o ciclo/método de compra final e sai da página de configuração para a de confirmação de pagamento.

### Exemplo pessoal

```json
{
  "eventType": "ck",
  "eventRegion": "app.purchase",
  "elementName": "purchase_billing_cycle_select_ck",
  "eventText": "订阅",
  "eventExtraDetail": {
    "purchase_funnel_id": "2a3f0a1e-1234-5678-9012-acde12345678",
    "upgrade_source": "session_quota_alert",
    "entry_plan_status": "start_plan",
    "entry_plan_level": "start",
    "purchase_audience": "personal",
    "provider_family": "zai",
    "channel": "Z_AI",
    "product_id": "product-af5f6f",
    "product_name": "GLM Coding Lite / 月",
    "plan_tier": "lite",
    "billing_period": "month",
    "purchase_method": "continuous",
    "payment_method": "",
    "seat_count": "",
    "duration_months": "",
    "currency": "USD",
    "amount": "16.20"
  }
}
```

### Exemplo de equipe

```json
{
  "eventType": "ck",
  "eventRegion": "app.purchase",
  "elementName": "purchase_billing_cycle_select_ck",
  "eventText": "继续支付",
  "eventExtraDetail": {
    "purchase_funnel_id": "2a3f0a1e-1234-5678-9012-acde12345678",
    "upgrade_source": "setting_team_plan_banner",
    "entry_plan_status": "no_plan",
    "entry_plan_level": "",
    "purchase_audience": "team",
    "provider_family": "bigmodel",
    "channel": "MaaS",
    "product_id": "<team productId from API>",
    "product_name": "GLM Coding Plan 团队标准版",
    "plan_tier": "team_standard",
    "billing_period": "month",
    "purchase_method": "one_time",
    "payment_method": "alipay",
    "seat_count": "5",
    "duration_months": "12",
    "currency": "CNY",
    "amount": "12916.80"
  }
}
```

Campos:

| Campo | Significado | Valor |
| --- | --- | --- |
| `eventText` | Texto realmente clicado | Pessoal: `订阅` / `升级`; equipe: `继续支付`; na interface em inglês, o equivalente em inglês |
| `product_id` | SKU final | Usa diretamente o `selectedProduct.productId` do produto selecionado atual |
| `product_name` | Nome do produto e do ciclo | Consistente com o evento de pagamento |
| `plan_tier` | Faixa do plano | Consistente com o evento de seleção de produto |
| `billing_period` | Ciclo | `month` / `quarter` / `year` / `unknown` |
| `purchase_method` | Método de compra | `continuous` / `one_time` / `unknown` |
| `payment_method` | Método de pagamento | `alipay` / `paypal` / `stripe` / `unknown` / `""` |
| `seat_count` | Lugares da equipe | `""` no caso pessoal |
| `duration_months` | Duração da compra única | `""` quando não for compra única |
| `currency` | Moeda | `CNY` / `USD` / valor do backend / `""` |
| `amount` | Valor exibido no momento | String puramente numérica |

Regras de disparo:

- Pessoal: reporta ao clicar no cartão mensal/trimestral/anual e entrar na página de confirmação de pagamento.
- Equipe: reporta produto, ciclo, lugares e duração finais ao clicar em "继续支付".
- `product_id` precisa vir do retorno da interface de produtos; é proibido montá-lo por conta própria a partir de provider, plano e ciclo.
- Equipe que apenas troca a configuração sem continuar não reporta.
- Quando o Z.ai ainda não tiver escolhido PayPal/Stripe nesta fase, `payment_method=""`.

## 6. Diferenças de canal

| Provider | `provider_family` | `channel` | Produto | Pagamento |
| --- | --- | --- | --- | --- |
| BigModel | `bigmodel` | `MaaS` | Pessoal e equipe | Atualmente Alipay |
| Z.ai | `zai` | `Z_AI` | Atualmente apenas pessoal | PayPal/Stripe são determinados na etapa de confirmação de pagamento |

O mapeamento é feito só com base no `providerId`, e não por adivinhação de idioma, moeda ou domínio.

## 7. Implementação no código

### 7.1 Suporte a `eventText`

O cliente atual não passa `eventText`, então é preciso modificar:

- `packages/shared/src/telemetry.ts`: `TelemetryEventPayload` ganha `eventText?: string`.
- `packages/shared/src/validation.ts`: o schema IPC ganha `eventText: z.string().optional()`.
- `packages/ui/src/lib/appTelemetry.ts`: o payload suporta `eventText`.
- `packages/desktop/src/preload/index.ts`: o tipo do bridge suporta `eventText`.
- `packages/services/src/telemetry/telemetryCore.ts`: `reportEvent` e `sendReport` repassam e escrevem no corpo da requisição `event_text: payload.eventText ?? ""`.

Quando os eventos existentes não passam o campo, `event_text=""` é mantido, mantendo compatibilidade com as chamadas antigas.

### 7.2 Novo módulo de funil

Novo:

```text
packages/ui/src/lib/codingPlanFunnelTelemetry.ts
```

Responsável uniformemente por:

- os payloads dos três eventos novos;
- o `purchase_funnel_id`;
- a função pura de estado de plano `resolveCodingPlanEntryPlanState(...)`;
- normalização de provider/channel, plano, ciclo e método de compra;
- stringificação dos campos;
- chamada de `reportAppTelemetryEvent`; falha não bloqueia a UI.

### 7.3 Ligação das entradas

| Cenário | Código |
| --- | --- |
| Menu do avatar no canto inferior esquerdo | `WorkspaceSidebar.tsx`, `SettingsPage.tsx` |
| Lembrete de quota da Session | `ChatView.tsx` |
| Upgrade de uso de tokens | `ChatInputToolbar.tsx` |
| Entradas Upgrade/Subscribe/pessoal/equipe de Settings | `StatusCards.tsx`, `CodingPlanStatusActions.tsx`, `Detail.tsx` |
| Seleção de produto e de ciclo | Página webview do site oficial (o antigo `CodingPlanPurchasePanel.tsx` foi removido em 2026-09 e o App não tem mais interação nativa de seleção de produto e ciclo) |

A navegação entre páginas precisa estender `packages/ui/src/lib/settingsNavigation.ts`, carregando:

```ts
{
  purchaseFunnelId: string;
  upgradeSource: CodingPlanUpgradeSource;
  entryPlanStatus: "no_plan" | "start_plan" | "coding_plan" | "unknown";
  entryPlanLevel: string;
}
```

Essa intent serve apenas às entradas entre páginas que abrem diretamente o painel de compra após o clique. O painel de compra consome a intent e, depois de confirmar `open=true`, reporta `coding_plan_upgrade_ck`; entradas apenas-OAuth não escrevem essa intent.

### 7.4 Integração com os eventos de pagamento existentes

> Desde 2026-09 esta seção é uma proposta histórica: `codingPlanPurchaseTelemetry.ts` foi removido junto com o painel de compra nativo,
> e `purchase_pay_ck` / `purchase_result` passaram a ser reportados pelo lado do webview do site oficial; a convenção de campos continua valendo.

Modificar `codingPlanPurchaseTelemetry.ts`. `purchase_pay_ck` e `purchase_result` precisam ganhar e reutilizar o mesmo `purchase_funnel_id`:

```json
{
  "purchase_pay_ck": {
    "purchase_funnel_id": "2a3f0a1e-1234-5678-9012-acde12345678",
    "upgrade_source": "session_idle_time",
    "purchase_attempt_id": "payment-attempt-uuid",
    "entry_plan_status": "no_plan",
    "entry_plan_level": ""
  },
  "purchase_result": {
    "purchase_funnel_id": "2a3f0a1e-1234-5678-9012-acde12345678",
    "upgrade_source": "session_idle_time",
    "purchase_attempt_id": "payment-attempt-uuid",
    "entry_plan_status": "no_plan",
    "entry_plan_level": ""
  }
}
```

Restrições rígidas:

- O `purchase_funnel_id` dos dois eventos precisa vir do funnel context do painel de compra atual, e o evento de resultado não pode gerar um novo.
- O `upgrade_source` dos dois eventos precisa vir do mesmo funnel context, sem se perder ou ser reescrito entre a etapa de pagamento e a de resultado.
- Os dois eventos continuam reutilizando o `purchase_attempt_id` do mesmo pagamento.
- Os dois eventos reutilizam o `entry_plan_status` e o `entry_plan_level` já registrados ao entrar no funil, e a etapa de pagamento não pode consultar ou julgar de novo.
- `purchase_funnel_id` liga todo o fluxo, da entrada de upgrade ao resultado do pagamento;
  `purchase_attempt_id` liga apenas um clique de pagamento e seu resultado.
- Os campos existentes de status de pagamento, produto e erro não mudam.

### 7.5 Entrada de tarefa off-peak e continuidade do login

A página inicial de New task e o aviso de elegibilidade de tarefas off-peak de Automations criam uniformemente:

```json
{
  "eventRegion": "app.session",
  "elementName": "coding_plan_upgrade_ck",
  "eventText": "升级",
  "eventExtraDetail": {
    "upgrade_source": "session_idle_time",
    "purchase_audience": "personal"
  }
}
```

Na interface em inglês, `eventText` usa o `Upgrade` que o usuário realmente viu. Provider, canal, estado do plano de entrada e `purchase_funnel_id` continuam sendo preenchidos pela lógica unificada de `codingPlanFunnelTelemetry`.

```text
闲时 Upgrade 点击
  -> 创建一次 funnel context
  -> 全局 CodingPlanUpgradeDialog target 持有 context
  -> 购买面板打开并上报 coding_plan_upgrade_ck
  -> 未登录用户选择套餐
  -> OAuth / WelcomeScreen
  -> callback 只刷新购买凭据，target/context 不变
  -> 恢复原套餐选择
  -> product -> cycle -> pay -> result 继续复用同一 context
  -> 用户关闭购买面板后结束 funnel
```

Login bem-sucedido, refresh do estado do usuário e refresh do token de compra só podem atualizar o estado de autenticação/produtos e não podem substituir o dialog target.
`purchase_product_select_ck`, `purchase_billing_cycle_select_ck`, `purchase_pay_ck` e `purchase_result` precisam continuar lendo o `purchase_funnel_id` original e `upgrade_source=session_idle_time` desse target.

## 8. Verificação

Testes automáticos:

- Os nomes, `eventText` e as enumerações de campos dos três eventos.
- Clique apenas-OAuth quando não conectado não gera funil nem reporta `coding_plan_upgrade_ck`.
- `coding_plan_upgrade_ck` só é reportado uma vez, depois que o painel de compra realmente abriu.
- `coding_plan_upgrade_ck` usa a região real da entrada; `purchase_product_select_ck`, `purchase_billing_cycle_select_ck` e `purchase_pay_ck` têm todos `eventRegion` igual a `app.purchase`.
- Quando um provider Start carrega benefícios pagos do Coding Plan, ele é classificado como `coding_plan` e não é reportado errado como `start_plan`.
- BigModel -> `bigmodel/MaaS`.
- Z.ai -> `zai/Z_AI`.
- `product_id=""` na etapa de grupo de produto.
- Equipe reporta a configuração final apenas em "继续支付".
- Os três eventos novos, `purchase_pay_ck` e `purchase_result` — cinco eventos no total — reutilizam o mesmo `purchase_funnel_id`.
- As duas entradas de Upgrade de tarefa off-peak sempre reportam `eventRegion=app.session` e `upgrade_source=session_idle_time`, usando o `eventText` localizado.
- O julgamento de plano via provider registry da entrada de tarefa off-peak cobre `coding_plan` / `start_plan` / `no_plan` / `unknown`, sem reportar a falha de selected-connection como `no_plan`.
- O dialog target antes e depois do login OAuth preserva o mesmo funnel context; ao restaurar a seleção de plano depois do login bem-sucedido, `purchase_funnel_id` e `upgrade_source` não mudam.
- Ao voltar ao passo anterior dentro de `app.purchase` e entrar novamente nas páginas seguintes, o `purchase_funnel_id` original é reutilizado e nenhum novo ID é gerado.
- `purchase_pay_ck` e o `purchase_result` correspondente reutilizam ao mesmo tempo `purchase_funnel_id` e `purchase_attempt_id`, e o evento de resultado não gera ID novo.
- A página de sucesso do pagamento não mostra entrada de voltar e só permite fechar ou concluir; depois de fechar, o funil encerra.
- Falha de reporte não afeta a navegação nem o pagamento.

Execução:

```bash
pnpm --filter @zcode/ui test
pnpm typecheck
pnpm lint
```

Verifica-se uma vez, em runtime, a requisição de reporte no Desktop, confirmando `event_text`, a ordem dos eventos e os dois IDs de correlação.