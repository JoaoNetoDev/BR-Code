# Interação das páginas de Compra/Upgrade do Coding Plan

Data: 2026-06-14

## Contexto

A página de detalhes do family provider já consolida Z.ai / BigModel em um provider family visível ao
usuário, mantendo internamente a resolução do alvo de runtime por API Key / Start Plan / Coding Plan
provider id. Ao comprar ou fazer upgrade de um Coding Plan, o usuário precisa concluir a operação dentro
do contexto atual do family provider, sem saltar para uma página de configurações separada ou uma página
externa e perder o contexto do provider.

As entradas de compra/upgrade vêm uniformemente do Plan Card do family provider:

```text
┌──────────────────────────────────────────────────────────────┐
│ Pro                                      Coding Plan   [on]  │
│ Renews Jun 30, 2026 · Manage · Upgrade                      │
│                                                              │
│ 5h usage             1w usage             Total tokens        │
│ 12.4k / 50k          83k / 500k           1.28M               │
└──────────────────────────────────────────────────────────────┘
```

Ao clicar em `Buy plan` / `Upgrade` / `Change plan`, entra-se na página de compra. A página de compra
continua sendo acionada e fechada pela página de detalhes do family provider atual, mas visualmente não
é mais um dialog centralizado: ela é uma page surface que cobre o conteúdo de configurações atual e
hospeda a máquina de estados completa de Pricing / Plan / Payment, sem exibir barra de passos.

## Objetivos

- O fluxo de compra/upgrade permanece no contexto da página de detalhes do provider family atual, sem
  saltar para páginas externas e sem perder o provider family atual.
- A página de compra não exibe textos de passo como `Step 1/4`; o usuário vê apenas o título da página
  atual, voltar e fechar.
- O header da página de compra não fica fixo, rola naturalmente com o conteúdo e não recebe margem
  superior extra; os botões de ícone de voltar/fechar usam `size-8` e `rounded-xl`; não há footer fixo
  no rodapé, e as ações da página ficam na área de conteúdo.
- O fluxo é dividido em cinco estados: escolher Plan, escolher ciclo, confirmar pagamento, pagamento,
  pagamento concluído.
- `Personal` e `Team` são exibidos empilhados verticalmente na página de escolha de Plan, sem tabs;
  pessoal e equipe continuam entrando em seus caminhos de compra independentes.
- Pagamento bem-sucedido e sincronização de entitlement bem-sucedida são dois estados distintos, e a
  página de sucesso precisa expressar "o pagamento teve sucesso, mas o entitlement ainda está
  sincronizando".
- A página de sucesso do plano de equipe precisa lembrar a atribuição de membros: o título é
  "团队套餐需要分配成员" e o corpo é "请先在 BigModel 团队套餐管理页添加自己或其他成员，完成后即可在 ZCode
  使用团队额度。". O card de aviso oferece a entrada "管理团队套餐", que leva à página de gestão de
  planos de equipe da BigModel.
- Ao clicar em fechar, o usuário sai do fluxo de compra; após a página de sucesso, o refresh de
  entitlement também é disparado.

## Não Objetivos

- Não criar novos provider id. A identidade de runtime continua usando os ids existentes
  `builtin:zai-start-plan` / `builtin:zai-coding-plan` / `builtin:bigmodel-start-plan` /
  `builtin:bigmodel-coding-plan`.
- Não forçar planos de equipe na cadeia de pagamento pessoal. Equipes podem envolver no futuro
  assentos, organização, faturas e pagamento corporativo, e devem ser modelados de forma independente.
- Não adicionar emblemas promocionais na navegação, header ou em posições sem semântica clara de
  plano do family provider.
- Não alterar o protocolo de interface de backend existente de Alipay da BigModel nem de Stripe / PayPal
  da Z.ai. O fluxo de produto do Z.ai Coding Plan deixa de exibir a entrada de pagamento PayPal; para
  manter compatibilidade de protocolo com versões antigas, a capacidade PayPal existente não é removida
  agora.

## Máquina de Estados

```text
purchasePanel.closed
  -> purchasePanel.planSelect
  -> purchasePanel.billingCycleSelect
  -> purchasePanel.paymentConfirm
  -> purchasePanel.payment
  -> purchasePanel.success
  -> purchasePanel.closed
```

Regras de voltar e fechar:

- `planSelect`: apenas fechar, e fechar sai do fluxo de compra.
- `billingCycleSelect`: volta para `planSelect`, e fechar sai do fluxo de compra.
- `paymentConfirm`: volta para `billingCycleSelect`, e fechar sai do fluxo de compra.
- `payment`: volta para `paymentConfirm` cancelando o estado de pagamento atual, e fechar sai do fluxo de
  compra.
- `success`: não oferece voltar, apenas fechar; após fechar, sai do fluxo e atualiza o entitlement.

Fechar o painel não deve modificar o provider family mode já salvo. O plan / ciclo escolhido pelo usuário
dentro do painel mas ainda não pago fica apenas no estado local do painel.

## Textos das Entradas

O Plan Card exibe uma ação principal diferente conforme o estado atual do entitlement:

- Sem entitlement pago: `Buy plan`
- Start Plan: `Upgrade`
- Já com entitlement pago e existindo um plano de nível superior: `Upgrade`
- Já com entitlement pago, mas em que a ação principal é trocar de plano ou de ciclo: `Change plan`

O estado atual do plano é exibido dentro do conteúdo do card de plano, sem depender apenas do texto do
botão; se ainda houver um ciclo superior dentro do plano atual, o card continua permitindo entrar na
página de ciclo. Usuários já inscritos não podem, pela página de Plan, entrar em planos de nível inferior
ou de mesmo nível sem ciclo superior.

O banner de entrada de planos na página de detalhes do family provider é diferenciado por provider: a
BigModel, quando não conectada ou sem entitlement, pode exibir as entradas Start/pessoal/equipe,
ajudando o usuário a escolher o caminho de compra doméstico pessoal ou de equipe; a Z.ai, quando não
conectada ou conectada mas sem entitlement, exibe Start (apenas quando existe preview remoto) e a entrada
de plano pessoal, mas não exibe a entrada de plano de equipe. A Z.ai não tem entrada de compra de
equipe.

## Moldura da Página

O fluxo de compra usa uma overlay de nível de página, e não um dialog centralizado nem um sheet lateral.
Essa overlay é controlada pelo estado `open` da entrada da página de detalhes do provider atual; após
fechar, volta-se à posição original da página de detalhes. Isso permite transformar a experiência de
compra em uma page, preservando o contexto de autorização, plano atual e refresh de entitlement do
family provider. Estrutura genérica da página:

```text
┌──────────────────────────────────────────────────────────────┐
│ ← Back              Pricing / Page title                 ×   │
├──────────────────────────────────────────────────────────────┤
│ Page content                                                 │
│ Page actions live inside the content area                    │
└──────────────────────────────────────────────────────────────┘
```

A tela inicial `planSelect` não exibe o botão de voltar, nem explicações adicionais de Pricing ou link
externo de More Info. A página de sucesso também não exibe o botão de voltar.

Restrições de dimensionamento na implementação:

- Desktop e Web em tela larga usam a overlay de página inteira; o contêiner raiz usa `bg-background` e
  `pt-12`, e o próprio contêiner raiz não rola; dentro do contêiner raiz há um wrapper de rolagem
  independente que abriga o header e a área de conteúdo, e a área de conteúdo usa `max-w-5xl`
  centralizado.
- Mobile usa a mesma overlay de página, com os cards de plano e de ciclo em coluna única, e o header
  igualmente sem comportamento fixo.
- Não se usa mais um frame fixo `48rem x 32rem` para planSelect; a escolha de plano, a escolha de ciclo
  pessoal e a confirmação de pagamento pessoal têm altura natural conforme o conteúdo e não são forçadas
  a preencher a página; estados que precisam de imersão ou ações sticky, como pagamento, configuração
  de equipe e sucesso, ainda podem ocupar a altura restante; a área de ações sticky inferior da
  configuração de equipe usa `bg-background` de fundo, e a borda superior alterna apenas a cor, sem
  alterar o box model de borda, evitando que a página oscile ao alternar entre assinatura recorrente e
  compra avulsa. A linha de título do método de serviço na configuração de equipe precisa preservar o
  placeholder de texto de autorização de renovação automática; ao alternar para compra avulsa, apenas o
  texto é ocultado, sem mudar a altura da linha de título.

## Página 1: Escolher Plan

A página de escolha de plano não exibe explicações adicionais de Pricing nem link externo de More Info. O
conteúdo da página é empilhado diretamente na ordem banner de campanha, `For Individuals`, card do Start
Plan, lista de planos pessoais, `For Teams`, lista de planos de equipe, sem exibir tabs de audiência; os
planos de equipe levam à página de equipe/empresa e não reutilizam as páginas de ciclo e pagamento
pessoais. Os títulos de seção usam corpo de fonte maior que o título dos cards, formando agrupamento de
nível de página.

A primeira tela carrega apenas a ação de escolha, sem título explicativo nem descrição longa; os cards de
plano seguem uma hierarquia de informação fixa: Plan name, estado do plano atual, preço inicial, cota de
uso com o ícone de banner de 150%, linha divisória, lista de benefícios-chave e botão de largura total
com bordas arredondadas no rodapé. Plan name usa corpo de texto normal e mantém peso medium, e o preço usa
corpo de fonte maior como destaque visual; o preço em Chinese amplia apenas o valor em si, por exemplo
`¥49.00`, com o valor em preto no light e branco no dark, e `人民币 起` mantendo corpo normal com uma cor
de texto um nível abaixo. O card de plano em si não exibe estado selecionado e não responde a clique no
card inteiro; apenas o botão do rodapé leva à próxima página; o estado do plano atual é identificado por
uma cápsula dentro do card, e não apenas dentro do botão; se o plan atual ainda tiver um ciclo superior à
venda, o botão continua sendo a entrada de upgrade; caso contrário, fica desabilitado. Os cards de
escolha de plano usam textos de marketing de produto e não reutilizam diretamente os campos de entitlement
da interface de pagamento; os entitlements e preços de interface continuam mantidos pela página de
ciclo, pela página de pagamento e pelo preview do backend. Os cards de plano pessoal da BigModel exibem
conteúdo sempre em chinês, para combinar com o cenário de compra doméstico; os cards de plano pessoal da
Z.ai exibem conteúdo sempre em inglês, para combinar com o cenário de compra overseas. A exibição do Start
Plan é decidida pelo `startPlanPreview` remoto: mostra quando o preview existe e esconde quando o preview
está desligado ou ausente; o título do Start Plan prioriza o `name` remoto. O total ao lado do ícone de
estrela da BigModel e os valores da lista de benefícios vêm todos do `entitlements` remoto, e o frontend
apenas fixa o formato em chinês: o resumo é exibido como `GLM 模型每日 500万 tokens` e a lista de
benefícios como `GLM-5.2 每日 300万 tokens` e `GLM-5-Turbo 每日 200万 tokens`; o texto local do provider é
usado como fallback apenas quando falta um campo remoto. O card do Start Plan da Z.ai também gera o
resumo e a lista de benefícios a partir do `entitlements` remoto, e o frontend apenas fixa o formato em
inglês: o resumo é exibido como `5M GLM tokens daily` e a lista de benefícios como `GLM-5.2 · 3M tokens
daily` e `GLM-5-Turbo · 2M tokens daily`; quando falta um campo remoto, o texto local do provider também
usa o mesmo conjunto de fallbacks em inglês. Quando o entitlement Start atual é válido, o item é marcado
como atual; quando o usuário está logado mas sem entitlement Start válido, o estado expirado é marcado
apenas na cápsula de status e no botão, sem exibir texto de status ao lado do ícone de estrela, e o estado
expirado não reduz a opacidade de todo o card, para que a lista de benefícios não vire texto com
aparência de disabled. BigModel e Z.ai usam fontes de texto independentes, e o texto de Alipay/protocolo
da BigModel não pode ser compartilhado com o texto de PayPal/Stripe/assinatura overseas da Z.ai.

O dialog de Info da campanha de cota de 150% é fornecido pelo nó de `codingPlanBillingDiscount` remoto no
idioma atual, com `infoTitle` e `infoBody`; o `infoBody` usa Markdown. O frontend não mantém um corpo
local de regras de entitlement, e quando qualquer um dos campos falta a entrada de Info não é exibida,
evitando apresentar regras de campanha desatualizadas ou incompletas.

Em Plan Select, apenas o estado `unavailable` ajusta a semântica de exibição: o texto do botão é
uniformemente "立即订阅", mas permanece desabilitado, e no hover ou keyboard focus exibe "当前套餐不可购买，查看详情";
"查看详情" precisa ser um link operável, e o espaçamento entre Tooltip e botão é de `4px`. A Z.ai abre
`https://z.ai/subscribe` e a BigModel abre `https://bigmodel.cn/glm-coding`. O botão disabled recebe os
eventos de Tooltip por uma camada focusable envolvente; os textos e comportamentos de outros estados
desabilitados, como plano atual, já incluído, esgotado e serviço de assinatura ocupado, permanecem
inalterados. Planos pessoais e de equipe compartilham essa regra de exibição de unavailable.

Em tela larga, a área de cards de Plan se espalha horizontalmente dentro da área de conteúdo da página, e
o Start Plan é exibido como o primeiro card da área pessoal; o número de colunas da área pessoal em
resposta à largura vai de `4 -> 2 -> 1`: coluna única abaixo de `xs`, duas colunas a partir de `xs` (480px)
e quatro colunas a partir de `md`. Os breakpoints mudam a contagem de colunas antecipadamente, sem
limitar adicionalmente a largura dos cards, deixando que continuem preenchendo naturalmente a área de
conteúdo atual. Os cards de planos pagos têm altura igual, mas não são forçados a preencher a altura
restante da página; o Start Plan é um nível de experiência gratuito, exibe apenas benefícios e o estado
atual/já existente, e não entra na cadeia de ciclo e pagamento dos planos pessoais pagos. Quando
disponíveis, os planos de equipe são exibidos conforme a quantidade retornada remotamente, e a área de
equipe usa sempre uma grade de 4 colunas em tela larga; se houver apenas 2 planos de equipe, somente os
dois primeiros cards são exibidos e as duas últimas colunas ficam vazias. Os cards de plano de equipe não
exibem estado visual de hover ou selected e, ao clicar, entram diretamente na página de configuração de
equipe. Em tela estreita, o scroll continua com altura natural conforme o conteúdo. Os cards de Plan usam
`bg-card`, separando-se da cor de fundo da página.

```text
┌──────────────────────────────────────────────────────────────┐
│ Pricing                                                  ×   │
├──────────────────────────────────────────────────────────────┤
│ 150% quota banner                                         │
│ For Individuals                                           │
│ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────┐│
│ │ Start Plan   │ │ Lite         │ │ Pro          │ │ Max    ││
│ │ $0           │ │ $20+         │ │ $100+        │ │ $200+  ││
│ │ Included     │ │ Choose       │ │ Current      │ │ Choose ││
│ └──────────────┘ └──────────────┘ └──────────────┘ └────────┘│
│                                                              │
│ For Teams                                                   │
│ ┌──────────────┐  ┌──────────────┐                         │
│ │ Team Pro     │  │ Team Max     │                         │
│ └──────────────┘  └──────────────┘                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Os cards de Plan comparam apenas capacidades e benefícios; nesta página o usuário não escolhe mensal /
trimestral / anual. O preço pode exibir uma dica fraca; a divisão visual em chinês separa valor em corpo
maior + moeda e `起` em corpo normal, e o inglês usa `{price}+`, por exemplo `CN¥49.00+`, mantendo o
trecho inteiro em corpo grande e em preto no light e branco no dark; o valor real do pagamento é
determinado pela página de ciclo e pela página de pagamento.

Textos dos Plan cards:

| Plan | Posicionamento curto em chinês         | Benefícios-chave em chinês                                                                     |
| ---- | ------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Lite | 基础用量额度                           | 适合小型 Repo 轻量级迭代；逐步开放最新旗舰模型及功能；支持多款编程工具                          |
| Pro  | 5x Lite 额度 + Lite 权益               | 适合中型 Repo 日常开发；优先体验最新旗舰模型及功能；覆盖多款精选 MCP 工具；更快生成速度         |
| Max  | 20x Lite 额度 + Pro 权益               | 适合高阶用户中大型 Repo 深度开发；首发接入最新旗舰模型及功能；高峰期专属资源优先保障            |

| Plan | English summary     | English key benefits                                                 |
| ---- | ------------------- | -------------------------------------------------------------------- |
| Lite | Base usage included | Small repo iteration; Latest models over time; 20+ coding tools      |
| Pro  | 5x Lite usage       | Mid-sized repo development; Priority model access; Curated MCP tools |
| Max  | 20x Lite usage      | Mid-to-large repo work; First model access; Peak-time priority       |

### Seção de equipe

```text
┌──────────────────────────────────────────────────────────────┐
│ Upgrade Coding Plan                                      ×   │
├──────────────────────────────────────────────────────────────┤
│ For Individuals                                           │
│ Individual plan cards...                                  │
│                                                              │
│ For Teams                                                   │
│                                                              │
│ ┌──────────────┐  ┌──────────────┐                         │
│ │ Team Pro     │  │ Team Max     │                         │
│ │ seat price   │  │ seat price   │                         │
│ │ benefits...  │  │ benefits...  │                         │
│ │ Select       │  │ Select       │                         │
│ └──────────────┘  └──────────────┘                         │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

A restrição central da Team section é exibir diretamente a entrada de planos de equipe; a área de equipe
usa sempre uma grade de 4 colunas em tela larga, renderizando um card por plano de equipe existente e
deixando naturalmente vazias as posições restantes quando houver menos de 4. Os planos de equipe atendem
hoje apenas ao cenário de compra doméstico da BigModel, e o nome e a descrição do plano nos cards da
página de escolha de plano são sempre exibidos em chinês, sem mudar para inglês conforme o locale do app;
as páginas posteriores de configuração, confirmação e pagamento de equipe mantêm suas próprias regras de
formato de valor e de textos de fluxo. Ao clicar em um plano de equipe, o usuário ainda entra na cadeia
independente de configuração, confirmação e pagamento de equipe, sem reutilizar o modelo de ciclo e
pagamento pessoal.

## Página 2: Escolher Ciclo

A página de escolha de ciclo trata apenas do ciclo de cobrança do plan pessoal já escolhido, sem exibir
uma linha de resumo adicional de "plano atual/novo plano". A lista de cards de ciclo pessoal é exibida
com altura natural conforme o conteúdo, os cards mantêm altura igual sem serem forçados a ocupar a
altura restante da página, e em tela estreita o scroll continua com altura natural. Os cards de ciclo usam
`bg-card`, e o título do ciclo usa corpo normal medium. O preço efetivo em chinês mantém duas casas
decimais e o nome da moeda, com o nome da moeda apertado junto da unidade do ciclo, por exemplo `¥538.00
人民币/月`; o valor em si usa corpo grande, em preto no light e branco no dark, e `人民币/月` mantém corpo
normal com uma cor de texto um nível abaixo; o preço efetivo em inglês mantém o trecho inteiro em corpo
grande preto/branco. O preço original, a unidade de preço e a segunda linha de texto auxiliar usam uma
cor de texto um nível abaixo; a segunda linha do pagamento mensal mostra "按月灵活订阅", e a do
trimestral/anual mostra o preço mensal equivalente. O card de ciclo em si não exibe estado selecionado e
não dispara a compra; o botão em cápsula à direita é a entrada de ação; se o estado de login atual ou o
token de compra estiver expirado, clicar no botão leva ao fluxo de conexão/login em vez de ir direto para a
página de pagamento. Usuários já inscritos não podem comprar para baixo: abaixo do nível do plano atual,
ou no mesmo nível mas com ciclo não superior ao ciclo atual, o botão mostra o entitlement já existente/o
plano atual e não permite clique.

```text
┌──────────────────────────────────────────────────────────────┐
│ ← Back                         Pro Plan                  ×   │
│ Choose billing cycle                                         │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Monthly                                                  │ │
│ │ $20                                                      │ │
│ │ Flexible monthly billing                                │ │
│ │                                            Subscribe      │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Quarterly                                                │ │
│ │ ¥132.30 人民币  ~~¥147.00 人民币~~ /季                  │ │
│ │ 折合 ¥44.10 人民币/月                                  │ │
│ │                                             Upgrade       │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Yearly                                                   │ │
│ │ $180 / year                                              │ │
│ │                                            Current        │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Tempo de vigência, abatimento de valor restante e valor de renovação exibem apenas o que o preview do
backend consegue confirmar. Quando o backend não retorna semântica explícita, não se escreve "立即生效"
nem "下周期生效".

## Página 3: Confirmar Pagamento

A página de confirmação de pagamento é responsável por chamar `preview({ productId, ... })` para obter o
detalhamento do valor, exibir as informações de renovação/conta/acordo correspondentes ao provider, mas sem
gerar QR code e sem criar ações de pagamento Stripe/PayPal. A página de confirmação pessoal tem altura
natural conforme o conteúdo e não é forçada a preencher a página. Enquanto o preview carrega ou quando o
detalhamento de valores está indisponível, exibe-se apenas o aviso de carregando/indisponível, sem
mostrar política de renovação, normas de conta, confirmação de acordo nem botão de continuar para o
pagamento. O usuário só entra na página de pagamento depois de marcar a concordância e clicar em
confirmar. A página de confirmação não exibe mais um resumo de Plan / Billing cycle, e o detalhamento de
valores é exibido em um card independente, contendo no mínimo o preço original do plano, o desconto da
campanha, o abatimento do plano atual e o valor efetivo; linhas de desconto ou abatimento não retornadas
pelo backend não são exibidas. O desconto da campanha e o abatimento do plano atual vêm recolhidos em uma
linha `抵扣费用` / `Deductions`, mostrando o total abatido no lado direito do estado recolhido e, ao
clicar, expandindo item a item os múltiplos descontos e o valor restante do plano atual. A página de
confirmação pessoal da BigModel usa fixamente os textos em chinês de título da página, rótulos de valor,
ciclo, política de renovação, normas de conta e confirmação de acordo, para combinar com o cenário
nacional de assinatura via Alipay; a Z.ai continua usando os textos `overseasPayment.*`, sem compartilhar
cláusulas, canais de cobrança nem explicações de normas de conta. O usuário precisa voltar à página
anterior para mudar o ciclo e voltar duas vezes para mudar o plan.

A política de renovação da BigModel exibe dinamicamente o ciclo de valor conforme o ciclo selecionado
atual, mas o "本次实付金额" (valor efetivo desta compra) e o "未来续费金额" (valor de renovação futura)
precisam ser tratados separadamente. O valor efetivo no card de detalhamento vem do resultado de
liquidação deste preview e pode ser afetado por desconto de primeira compra, desconto de campanha,
abatimento do plano atual, créditos de bônus, saldo e divisão em pagamentos de terceiros; o valor de
cobrança automática na política de renovação só pode usar a semântica explícita de valor de renovação
retornada pelo backend, por exemplo `renewAmount`. Se o backend não tiver um valor de renovação explícito,
não se exibe um valor fixo de cobrança; em vez disso, informa-se que a renovação seguirá automaticamente
no ciclo escolhido e que a cobrança real segue a fatura da renovação.

- Com valor de renovação explícito: `续订将按照「￥{renewAmount}/{月|季|年}」发起自动扣费。`
- Sem valor de renovação explícito: `后续将按所选套餐周期自动续费，实际扣费以续费时账单为准。`
- `扣费优先级：优先扣除赠金，再扣余额，再采用支付宝扣费。`
- `{每月|每季|每年}将持续定期扣款，直至您根据我们的服务条款取消服务。`
- `您可在续费日前至少3天，前往「个人套餐概览页」关闭自动续费。`

As normas de uso de conta da BigModel são exibidas como um módulo expansível, recolhido por padrão e
mostrando o texto do princípio geral; ao expandir, exibe restrições, controle de risco e informações de
reembolso por subtítulo:

- Princípio geral: `仅限订阅人在官方许可的产品范围内使用。严禁将账号出借、转让或以任何形式提供给第三方使用，亦不得用于非正当或违反法律法规及平台规则的行为。如发现平台将限制或封禁账号，且不予退款。`
- Restrição exclusiva: `套餐仅限订阅人个人在 Coding 工具中使用。若发现账号出现多人使用等异常情形，用于非编程开发、非正当的或违反法律法规及平台规则的用途，将限制账号权益。`
- Controle de risco: `违反《用户协议》、《服务协议》、《订阅服务协议》及平台上其他相关规则及约定的，将触发限流或冻结。累计 3 次违规将被永久封禁。`
- Informações de reembolso: `因违规使用导致账号被封禁的，已支付的套餐费用一律不予退款。`

As informações abaixo do valor são diferenciadas por provider:

- BigModel: exibe a explicação de renovação em chinês do antigo dialog de pagamento Alipay, o bloco de
  aviso das normas de uso de conta e a confirmação de concordância com 《服务协议》 e 《订阅及自动续费协议》
  no rodapé; o texto sobre reembolso aparece apenas no conteúdo expandido das normas de uso de conta, e a
  área de concordância de acordos do rodapé não repete o texto de reembolso.
- Z.ai: exibe Renewal Policy e Account Usage Policy fixos em inglês, além da confirmação de concordância
  dos termos de cartão/assinatura; mesmo com o locale do app em chinês, a confirmação de pagamento e os
  termos de pagamento overseas da Z.ai permanecem em inglês.

A Renewal Policy da Z.ai também não pode tratar o Amount due desta compra como futura cobrança
recorrente. O valor fixo de renovação só é exibido quando `renewAmount` existe explicitamente; caso
contrário, usa-se o texto de fallback que não promete um valor específico.

- Com valor de renovação explícito: `{renewAmount} will be charged automatically per {month|quarter|year}.`
- Sem valor de renovação explícito: `Future renewals will follow your selected subscription cycle. The actual renewal amount is subject to your renewal invoice.`
- `Payments will be deducted first from bonus credits, then from your account balance, and finally via credit card.`
- `Please note that a small minimum applies when charging your credit card. If the remaining amount is less, we will round up the deduction to meet this minimum.`
- `{Monthly|Quarterly|Yearly} charges will continue on a recurring basis until you cancel in accordance with our Terms of Service.`
- `You may disable auto-renewal at least 1 day before the renewal date in your subscription setting.`

Texto da Account Usage Policy da Z.ai:

- `The GLM Coding Plan is strictly limited to use by the subscriber within officially supported products. Any sharing, resale, transfer, or third-party access is strictly prohibited. Any improper, unauthorized, or policy-violating use may result in immediate account restriction or suspension with no refunds. Please comply with our Terms and Policy.`

Texto de concordância de cartão/assinatura da Z.ai:

- `You agree that Z.ai will charge your card the above amount now and on a recurring basis according to your subscription plan until you cancel in accordance with our [terms](https://docs.z.ai/legal-agreement/subscription-terms).`

A página de pagamento precisa herdar o mesmo `preview` desta confirmação, sem buscar novamente o
detalhamento de valores, mas a página de pagamento não exibe o card de detalhamento. A página de
pagamento usa o valor efetivo do preview apenas no texto dos controles de pagamento e continua chamando
as interfaces de pagamento seguintes: a BigModel gera o conteúdo de assinatura por QR code a partir do
mesmo `bizId`; a Z.ai exibe e envia o formulário de pagamento com cartão Stripe a partir do mesmo `bizId`.

```text
┌──────────────────────────────────────────────────────────────┐
│ ← Back                         Confirm payment           ×   │
├──────────────────────────────────────────────────────────────┤
│ Confirm purchase                                             │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Plan price                   US$54.00                    │ │
│ │ Deductions >                 -US$14.80                   │ │
│ │ Amount due                   US$39.20                    │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ Renewal policy / 续费说明                                    │
│ • Uses provider-specific legacy payment policy copy.         │
│ • BigModel shows Alipay renewal/account/agreement details.   │
│ • Z.ai shows Renewal policy/account policy/card auth terms.  │
│                                                              │
│ ☑ Provider-specific agreement / authorization confirmation.  │
│                                                              │
│                                           Continue to payment│
└──────────────────────────────────────────────────────────────┘
```

## Página 4: Pagamento

A página de pagamento é responsável por exibir o canal de pagamento real e não permite mais modificar o
plan ou o ciclo. O QR code do Alipay da BigModel e o caixa principal de pagamento overseas da Z.ai precisam
ser embutidos diretamente na área de conteúdo do painel de compra atual, sem um card/bordura externa
adicional e sem abrir um pop-up de pagamento principal extra; somente subfluxos de método de pagamento,
como adicionar/gerenciar cartão de crédito, podem continuar usando um pop-up independente.

```text
┌──────────────────────────────────────────────────────────────┐
│ ← Back                         Payment                   ×   │
├──────────────────────────────────────────────────────────────┤
│ Payment method                                               │
│                                                              │
│ ● Credit Card                                                │
│   Visa ending in 4242                         Change         │
│                                                              │
│ ☑ I authorize recurring billing.                             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

O pagamento overseas da Z.ai continua usando o caixa confirmatório, mas a entrada de método de pagamento
exibe apenas Credit Card / Debit Card (Stripe) e não exibe PayPal. Esta rodada remove apenas a entrada de
interface, mantendo inalterados o serviço PayPal existente, o callback de deep-link e as definições de
protocolo. A cobrança real acontece quando o usuário clica em `Pay` / `Confirm`. O título `Payment method`,
as mensagens de erro e o conteúdo do pagamento com cartão da página de pagamento da Z.ai são colocados
diretamente na área de conteúdo da página, sem contêineres de section/card adicionais. O botão principal da
página de pagamento da Z.ai e do subfluxo de adicionar cartão de crédito precisa ser consistente com os
outros fluxos do painel de compra, usando `h-10`, `rounded-full`, `text-ui-base`; cards salvos e o
formulário de adicionar cartão usam `rounded-xl`, e o header do pop-up de adicionar cartão não usa linha
divisória.

Quando o preview de planos da página inicial de Plan retorna sistema ocupado, o aviso de sistema ocupado
da página é mantido, mas o botão principal do Plan Card continua exibindo "升级" / `Upgrade` e pode ser
clicado. Após o clique, não se pode usar o preview que falhou para ir direto à página de ciclo; em vez
disso, reutiliza-se a cadeia de upgrade de não logado existente para fazer login novamente; após o login
bem-sucedido, reabre-se apenas a página inicial de planos pessoais em Plan Select, sem restaurar o plan
específico clicado antes do login, e o usuário escolhe novamente com base no estado de planos atualizado.

### Pagamento Alipay da BigModel

O QR code do Alipay da BigModel continua sendo um estado de pagamento da página de pagamento. Em tela
larga usa-se estrutura esquerda/direita sem wrapper de card externo: o QR code e o texto à direita formam
um grupo centralizado no espaço restante do pop-up; o QR code da esquerda é envolvido por um contêiner
`rounded-xl` independente, com no máximo cerca de `24rem`, e o QR code preenche o contêiner, cuja altura
segue a imagem do QR code; o lado direito ocupa a largura restante e exibe o título do plano de
assinatura, o valor de pagamento por QR do Alipay e o estado de aguardo de confirmação; o conteúdo
precisa preencher a altura restante da página de pagamento, evitando barra de rolagem no pop-up. Em tela
estreita, a explicação da direita aparece primeiro e o QR code vem depois da explicação.

```text
┌──────────────────────────────────────────────────────────────┐
│ ← Back                         Payment                   ×   │
├──────────────────────────────────────────────────────────────┤
│ ┌────────────────────────────┐  GLM Coding Pro 连续包月计划 │
│ │                            │                              │
│ │          QR Code           │  [Alipay] 请使用支付宝扫码支付│
│ │                            │            ¥1,412.44 人民币  │
│ │                            │                              │
│ └────────────────────────────┘  正在等待支付确认             │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

Quando o QR code expira, o usuário continua na página de pagamento e vê a ação de atualizar o QR code,
sem voltar à página de ciclo.

## Página 5: Pagamento Concluído

O pagamento bem-sucedido precisa levar a uma página de sucesso independente, não apenas a um toast. A
página de sucesso confirma o resultado da compra e absorve o atraso de refresh do entitlement.

```text
┌──────────────────────────────────────────────────────────────┐
│ Payment successful                                       ×   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Payment successful                                           │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Current                      Pro                         │ │
│ │ Status                       Active                      │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│                                                    Done      │
└──────────────────────────────────────────────────────────────┘
```

Após fechar a página de sucesso / Done:

1. Fecha o painel de compra.
2. Dispara o refresh do entitlement do Coding Plan.
3. Atualiza o provider registry / o Plan Card do family provider atual.

### Pagamento bem-sucedido com entitlement ainda sincronizando

Pagamento bem-sucedido e sincronização de entitlement bem-sucedida precisam ser separados. Quando o check
de pagamento confirmou sucesso, mas o refresh de entitlement ainda não terminou ou falhou, a página de
sucesso do pagamento continua sendo exibida:

```text
┌──────────────────────────────────────────────────────────────┐
│ Payment successful                                       ×   │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│ Payment successful                                           │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ Payment                     Successful                   │ │
│ │ Plan status                  Syncing                     │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│                                      Refresh now     Done    │
└──────────────────────────────────────────────────────────────┘
```

A página de sucesso não usa contêiner adicional em volta do título de pagamento bem-sucedido e não exibe
textos do tipo "o entitlement será atualizado após fechar o painel". Em tela larga, o conteúdo da página
de sucesso é centralizado verticalmente na área de conteúdo do pop-up, com padding horizontal maior dos
dois lados e o título de pagamento bem-sucedido afastado do conteúdo de status abaixo. Quando o refresh
de entitlement falha, é proibido mudar o status de pagamento para falha. A UI apenas informa que o plan
status ainda não foi atualizado e permite que o usuário acione manualmente `Refresh now` ou `Done`; `Done`
tem o mesmo comportamento do fechar no canto superior direito.

## Autenticação e Recuperação

Ao encontrar OAuth required ou token de negócio expirado no fluxo de compra, o painel não deve virar
diretamente uma página de erro. A página atual muda para um estado de conexão:

```text
Connect Z.ai to continue
```

Quando um usuário não logado clica em um plano pessoal ou de equipe em Plan Select, o painel de compra
precisa primeiro registrar o login attempt iniciado por esse clique, depois fechar o painel de compra e
entrar na página de login unificada. A página de login não pode sobrescrever um painel de compra que
ainda esteja em estado open.

```text
Plan Select (unauthenticated)
  -> record { loginAttemptId, provider, audience }
  -> close Coding Plan purchase panel
  -> open WelcomeScreen / OAuth
  -> OAuth succeeded for the same loginAttemptId
  -> consume pending intent once
  -> reopen Coding Plan purchase panel at Plan Select
```

A reabertura automática acontece somente quando o login attempt da mesma compra de plano tem sucesso. A
intenção pendente precisa ser descartada quando o login é cancelado, falha ou substituído por outro login
attempt; um login comum bem-sucedido não pode abrir o painel de compra. Após reabrir, o usuário permanece
em Plan Select e a audiência pessoal/equipe é restaurada, mas ele não entra automaticamente na página de
ciclo ou de pagamento, evitando continuar a compra após o retorno do OAuth sem o usuário ter confirmado o
preço mais recente.

Quando um token de negócio expirado exige reautorização depois de já estar na página de ciclo ou de
pagamento, as escolhas locais da página atual são preservadas; essa recuperação não segue a regra de "fecha
e reabre" do Plan Select.

Se o usuário fechar o painel, o estado de recuperação é descartado.

## Restrições Responsivas

- Desktop: preferir dialog largo ou sheet lateral, permitindo scroll na área de conteúdo e sem footer
  fixo.
- Web no celular: usar sheet em tela cheia, cards de Plan em coluna única, cards de ciclo em coluna única,
  e resumo de pagamento e método de pagamento empilhados verticalmente.
- Todos os botões e títulos precisam reservar espaço para o comprimento do texto de internacionalização,
  sem depender de textos curtos em inglês.
- As cores de tema usam os tokens semânticos existentes e seguem `DESIGN.md`; não introduzir fundo de
  cor de marca em grande área para o fluxo de compra.

## Dicas para Implementação Futura

- Sugere-se nomear os estados do painel como `planSelect` / `billingCycleSelect` / `payment` / `success`,
  sem nomear o estado de UI como `step1` / `step2`.
- O fluxo de compra pessoal pode ser nomeado independentemente como `personalPlanPurchaseFlow`, evitando
  que um futuro pagamento de equipe seja forçado a reutilizar premissas pessoais.
- Não prometer valor efetivo real, desconto, abatimento ou tempo de vigência antes de o preview do
  backend retornar.
- A falha de refresh de entitlement na página de sucesso do pagamento precisa emitir log de UI, e o log
  deve passar por `packages/ui/src/logger.ts`.