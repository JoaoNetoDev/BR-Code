# Integração da compra de assinatura BigModel Coding Plan

Data: 2026-05-28

## Escopo

A lista de planos da página de configurações do BigModel / Z.AI Coding Plan é comandada pelo `codingPlanStaticProducts` retornado pelo endpoint remoto `GET https://zcode.z.ai/api/v1/client/configs`. A configuração remota guarda a identidade do plano, nome, descrição, ciclo, benefícios, moeda e um snapshot de preço estático; preço real, ciclo atual, se está comprável, se esgotou e estados desabilitados continuam sendo definidos pelo `POST /pay/batch-preview` de runtime.

Quando `batch-preview` falha, quando não há login ou quando um `productId` estático específico não é retornado, a lista ainda exibe as informações estáticas do plano e o snapshot de preço estático; sem o estado real de preview, clicar em assinar passa primeiro pelo fluxo de login/conexão, sem inferir o estado real de compra.

O Z.AI Coding Plan reaproveita o mesmo conjunto de protocolos de API de negócio `/api/biz`, com o host trocado para `https://api.z.ai`.

## Configuração dos planos

A configuração dos planos é agrupada por provider e obtida pela camada de serviço `codingPlanSubscriptionService.getStaticProducts()` a partir do client config do ZCode. O front-end faz apenas cache em memória por um dia, merge do SKU gratuito Start e merge do estado em tempo real do `batch-preview`, sem codificar localmente descrições Lite / Pro / Max:

- `productId`: ID do produto no backend, usado para alinhar com `batch-preview`, `preview` e as interfaces de compra.
- `productName`: nome do plano, usado para o agrupamento Lite / Pro / Max e para o título do card.
- `productSmallTitle`: subtítulo do plano.
- `equity`: array resumido de benefícios do plano, cada elemento `{ text, tooltip? }`, exibido como uma linha de benefício com ícone de estrela.
- `description`: array de textos de benefícios do plano, cada elemento `{ text, tooltip? }`, correspondendo a uma linha de explicação abaixo do divisor; o consumidor continua compatível com as strings históricas.
- `productEquityList`: estrutura opcional de benefícios mantida por compatibilidade com configurações históricas de produto; as novas configurações não exigem mais seu envio.
- `priceUnit`: ciclo de cobrança, `month` / `quarter` / `year`.
- `displayOrder`: campo de ordenação estática, mantido alinhado com `/product/info`.
- `priceCurrency`: moeda, `CNY` para BigModel e `USD` para Z.AI.
- `originalAmount`: snapshot estático do valor original, vindo de `batch-preview`.
- `discountAmount`: snapshot estático do valor após desconto / relacionado a desconto, preservando a semântica original da interface.
- `payAmount`: snapshot estático do valor a pagar, apenas como referência de exibição.
- `monthlyOriginalAmount`: snapshot estático do valor original mensal médio.
- `monthlyRenewAmount`: snapshot estático do valor de renovação mensal médio.
- `monthlyPayAmount`: snapshot estático do valor a pagar mensal médio, usado como referência de exibição mensal para planos trimestrais e anuais.
- `renewAmount`: snapshot estático do valor de renovação.

### Adaptação de dados dos cards de seleção de plano atuais

`codingPlanStaticProducts` deve se adequar primeiro à hierarquia de informação já existente no card de seleção de plano atual, sem adicionar campos que sirvam apenas a um layout novo:

- Manter os dois grupos de provider `builtin:bigmodel-coding-plan` e `builtin:zai-coding-plan`.
- Manter um `productId` independente por plano Lite / Pro / Max em `month` / `quarter` / `year`.
- O nome do plano continua usando `productName`, o ciclo usa `priceUnit`, e moeda e preço estático continuam usando os campos de preço existentes.
- Os benefícios ao lado do ícone de estrela vão em `equity: Array<{ text: string; tooltip?: string }>`; podem ser uma linha para planos pessoais e duas linhas para planos de equipe; as explicações comuns abaixo do divisor vão em `description`, com a mesma estrutura. Quando for preciso explicar algo, envie `tooltip`; caso contrário omita o campo. A nova configuração não reenvia `productEquityList`; arrays de strings, `description` como string e `productEquityList` ainda podem ser lidos pelo consumidor por compatibilidade.
- Textos e preços estáticos seguem o mesmo princípio de fonte de dados: na ausência de `equity`, `description` ou do texto do Start Plan, o campo fica vazio e não há fallback para textos codificados no front-end.
- BigModel usa textos de benefício em chinês e Z.AI usa textos de benefício em inglês; planos do mesmo nível em ciclos diferentes reutilizam o mesmo texto de benefício.
- O `description` dos planos pessoais mantém a descrição completa do card anterior à migração: Lite com três linhas, Pro com quatro e Max com três; ao migrar a identidade e o preço do produto remoto, esses textos de card não podem ser sobrescritos pela descrição simplificada do remote.
- Não alterar layout, ordem das informações ou interação do card por meio da configuração.

Um exemplo completo de resposta publicável está em
[`packages/desktop/test/e2e/fixtures/coding-plan-client-configs.json`](../packages/desktop/test/e2e/fixtures/coding-plan-client-configs.json).

Os campos de configuração são intencionalmente alinhados aos campos de exibição de `/product/info`, enquanto os campos de preço adotam apenas snapshots dos campos de mesmo nome de `batch-preview`, sem adotar `salePrice` / `originalPrice` e outros preços de detalhe de produto, evitando tomar os valores não em tempo real da interface de detalhes do produto como preço real a pagar.

### Configuração do Start Plan

O Start Plan não é um SKU pagável e continua usando o `configs.startPlanPreview` independente, sem entrar em
`codingPlanStaticProducts` nem em `codingPlanStaticTeamProducts`. O protocolo atual é
provider-neutral, e BigModel e Z.AI compartilham a mesma definição de cota gratuita:

- `planId`: identidade do Start Plan.
- `name`: nome do plano no remote.
- `entitlements`: cota gratuita descrita por modelo, contendo `grantUnits`, `meter`, `period`,
  `showName` e `unitType`.

O resumo e o detalhamento de cota do card são calculados a partir de `entitlements`, com BigModel usando formato em chinês e Z.AI em
inglês, evitando duplicar na configuração o `equity` e o `description` que podem ser derivados das cotas estruturadas. Na ausência de `startPlanPreview`, o Start Plan não é exibido.

### Configuração dos planos de equipe

Os dados estáticos dos cards dos planos de equipe ficam em
`configs.codingPlanStaticTeamProducts` e, assim como os planos pessoais, são agrupados por provider:

- `builtin:bigmodel-coding-plan`: array de planos de equipe do BigModel.
- `builtin:zai-coding-plan`: array de planos de equipe do Z.AI; atualmente não há plano de equipe da Z.AI, e um array vazio é enviado explicitamente.

Cada plano de equipe mantém `productId`, `tier`, `subscribeMode`,
`subscribePeriod`, forma de compra e preço estático retornados pelo pricing enterprise, e complementa os campos de exibição de que o card de seleção de plano atual precisa:

- `productName`: nome de exibição em chinês, sendo "标准版" (versão padrão) para `PRO` e "高级版" (versão avançada) para `MAX`.
- `equity`: array de objetos de benefício de cota com ícone de estrela; o card de equipe tem hoje duas linhas, exibindo respectivamente a cota de 5 horas e a cota semanal.
- `description`: array de objetos de benefício comum abaixo do divisor.

A configuração estática de equipe é a fonte de dados publicada pelo serviço de configuração e consumida pelos cards estáticos do cliente; hoje o produto enterprise em runtime continua sendo comandado pela interface de pricing. Depois que o cliente adota o fallback estático, a disponibilidade de compra, o estado de assinatura e o preço em tempo real continuam sendo definidos por
`/campaign/partner/enterprise/pricing` ou
`/subscription/enterprise/v2/pricing`, e não são inferidos a partir do snapshot estático.

### Ambiente de testes

Quando o desenvolvimento local precisar validar dados de teste, inicie o aplicativo com `ZCODE_ENV=test`. O cliente faz a requisição
`https://zcode.z.ai/api/v1/client/configs` e acrescenta automaticamente os parâmetros `app_version` e
`platform`. Não há mais comando de mock de client-config nem variável de ambiente dedicada no ambiente local.

## Cadeia de interfaces

- O domínio principal da API do BigModel segue o ambiente: produção é `https://bigmodel.cn` e `ZCODE_ENV=test` é `https://bigmodel.cn`.
- `POST /api/biz/pay/batch-preview`: lê os preços e o estado de compra dos planos visíveis para a conta atual.
- `GET /api/biz/product/info?productId=...`: usado apenas para buscar manualmente os campos de exibição do produto ao manter o catálogo estático; a lista de planos em runtime não depende mais dele.
- `POST /api/biz/pay/preview`: simula o pedido e obtém o `bizId` ao clicar em um plano.
- `POST /api/biz/pay/create-sign`: primeira compra ou recompra em caso de renew.
- `POST /api/biz/pay/product/update/sign`: troca de plano quando já existe assinatura.
- `GET /api/biz/pay/check?bizId=...`: polling do resultado após o pagamento.
- `GET /api/biz/pay/check-pending-orders`: verificação de ordens incompletas antes da compra.

O Z.AI usa os mesmos paths:

- `POST https://api.z.ai/api/biz/pay/batch-preview`
- `GET https://api.z.ai/api/biz/product/info?productId=...`
- `POST https://api.z.ai/api/biz/pay/preview`
- `POST https://api.z.ai/api/biz/pay/create-sign`
- `POST https://api.z.ai/api/biz/pay/product/update/sign`
- `GET https://api.z.ai/api/biz/pay/check?bizId=...`
- `GET https://api.z.ai/api/biz/pay/check-pending-orders`

## Autenticação

As interfaces de compra de assinatura usam o estado de login OAuth da marca correspondente.

BigModel:

```http
Authorization: <oauth accessToken>
Content-Type: application/json
```

Não adicione o prefixo `Bearer`. `Bearer` é usado apenas em interfaces de modelo/API Key e não se aplica às interfaces de negócio de estado de login BigModel `/pay` e `/api/biz`.

Z.AI:

```http
Authorization: <zai business accessToken>
Content-Type: application/json
```

Após um login bem-sucedido, a Z.AI primeiro troca o access token OAuth pelo token de negócio chamando `POST https://api.z.ai/api/auth/z/login` e persiste esse token de negócio diretamente em `oauth:zai:access_token`. As cadeias `/api/biz/*` e `/api/pay/*` subsequentes leem apenas esse token de negócio persistido, sem usar chave de cache separada e sem recorrer ao token OAuth original. A interface de uso do Z.AI monitor continua usando o header `authorization` da API key do provider; não misture as duas cadeias.

## Comportamento da UI

- A entrada "upgrade" do menu do avatar segue primeiro o Coding Plan selecionado ou a origem de uso atual; quando não há benefício de Coding Plan derivável no modo API Key, é obrigatório fazer fallback por `providerFamilyDomain`: o domínio BigModel exibe os planos BigModel e o domínio Z.AI exibe os planos Z.AI, com fallback entre marcas proibido.
- BigModel não conectado: exibe a entrada de conexão.
- Conectado e carregando: exibe a lista estática de planos e o estado de carregamento.
- Falha ao carregar `batch-preview`: não exibe um card extra do tipo "veja os planos após conectar", mantém a lista estática de planos e o snapshot de preço estático; clicar em assinar entra no fluxo de login/conexão.
- `batch-preview` não retornou um `productId` estático específico: esse plano pode exibir o snapshot de preço estático; clicar em assinar entra no fluxo de login/conexão.
- Catálogo estático vazio: exibe o estado vazio.
- Ao clicar em comprar, chama primeiro `preview`; se o backend retornar uma exigência de verificação de segurança, a verificação é concluída pelo controle de segurança da versão oficial e a mesma chamada de `preview` é repetida automaticamente.
- Quando `preview`, a simulação do pedido ou interfaces relacionadas a pagamento retornam página HTML/WAF, algo que não é JSON ou uma resposta impossível de interpretar, a UI não exibe o conteúdo bruto da resposta e mostra uniformemente "Sistema ocupado, tente novamente mais tarde.".
- Depois que `create-sign` / `update-sign` retorna o `sign` do Alipay, a UI converte o `sign` completo em QR code e faz polling de `pay/check`.
- Após o sucesso do pagamento, os benefícios do Coding Plan e a configuração de provedores de modelo são atualizados.
- Z.AI sem login ou com interface indisponível: mantém a lista estática de planos e pode exibir o snapshot de preço estático; clicar em assinar entra no fluxo de login.
- `batch-preview` da Z.AI bem-sucedido: a lista estática de planos é mesclada com o preço real e o estado dos botões retornados pela interface, usando a cadeia de compra da interface.

## Telemetria de compra

Na cadeia de pagamento do Coding Plan pessoal são reportados `purchase_pay_ck` e `purchase_result`. `product_name` usa uniformemente o formato "nome do plano / ciclo de cobrança", por exemplo `GLM Coding Lite / month` na interface em inglês e `GLM Coding Lite / 月` na interface em chinês; BigModel e Z.AI seguem o mesmo conjunto de regras de exibição. O nome do plano vem preferencialmente do `preview` de item único e, quando ausente, faz fallback para o `productName` da configuração estática do produto mesclada, evitando que a telemetria degrada para `productId` quando `/pay/batch-preview` não retorna `productName`. `billing_period` continua sendo o enum analisável por máquina `month` / `quarter` / `year`. A telemetria de valor não reporta mais o vago `amount`, e sim congela o `cashAmount` / `giveAmount` / `thirdPartyAmount` / `refundAmount` / `residualAmount` retornados pelo `preview` de item único; campos ausentes permanecem como string vazia, sem derivar o valor a partir de outros valores.

## Página de confirmação de pagamento overseas da Z.AI

O Coding Plan overseas da Z.AI usa um checkout de página única com estilo de confirmação, sem pendurar mais as ações de pagamento de PayPal e Stripe diretamente nos botões de forma de pagamento.

- A área de simulação `Payment` aparece no topo, com o valor vindo da mesma chamada de `preview`: o valor realmente pago usa prioritariamente `thirdPartyAmount`, o desconto de campanha vem de `campaignDiscountDetails`, o valor restante do plano atual usa prioritariamente `refundAmount` / `residualAmount` e, quando ausentes, o fallback é "preço original - desconto de campanha - valor realmente pago".
- `Payment Method` cuida apenas da escolha da forma de pagamento: PayPal ou Credit Card / Debit Card.
- A lista de cartões Stripe é lida por `/stripe/query`. A página principal de confirmação mostra apenas o cartão selecionado e as entradas `Add card` / `Change card`.
- `Add card` / `Change card` abrem o modal de gerenciamento de cartões. Dentro dele é possível selecionar um cartão existente, excluir um cartão ou adicionar um cartão novo com o Stripe Elements; o novo cartão chama apenas `/stripe/bind` para vinculá-lo, sem cobrança imediata.
- O pagamento só é executado quando o usuário marca a autorização de cobrança recorrente e clica em `Confirm`: o ramo PayPal executa setup/subscribe e o ramo Stripe chama `/stripe/pay` com o `paymentMethodId` selecionado.
- A publishable key do Stripe é lida prioritariamente de `VITE_ZAI_STRIPE_PUBLISHABLE_KEY` e, quando não configurada, faz fallback para a publishable key usada publicamente pela página oficial de pagamento da Z.AI, garantindo que o build padrão consiga exibir o Stripe Elements.
- O Stripe.js precisa ser inicializado sob demanda conforme o estado de pagamento overseas. Na inicialização do aplicativo, na renderização permanente da página de planos e quando `overseasPaymentDialog=null`, o Stripe.js não pode ser carregado nem criar iframes `js.stripe.com` / `m.stripe.network`; a inicialização do Stripe só é permitida depois que o usuário entra no pagamento overseas da Z.AI e cria o `overseasPaymentDialog`, evitando que o Electron crie um processo de renderer cross-origin extra quando não há pagamento.
- Os Stripe Elements de número de cartão, validade e CVC são montados somente quando o modal de gerenciamento de cartões `Add card` / `Change card` está aberto. Depois de fechar o fluxo de pagamento, os componentes de pagamento do lado do aplicativo são desmontados; se os iframes antifraude já criados pelo Stripe.js permanecem residentes é gerenciado pelo Stripe SDK, e não se trata a destruição ativa de estado global de terceiros como responsabilidade do fluxo de pagamento.