# Integração do Coding Plan Enterprise

## Escopo

O painel de compra do Coding Plan da BigModel na página de configurações permite alternar entre
`Personal / Team`. A página pessoal mantém a máquina de estados do painel de nova compra do Coding
Plan pessoal; a página Team reutiliza o mesmo modal, encadeando o ciclo de compra do pacote
enterprise na ordem `planSelect -> billingCycleSelect -> paymentConfirm -> payment -> success`, sem
abrir o antigo modal de confirmação secundária nem o modal de QR code.

## Regras da página Team

- Origem do produto:
  - A lista `planSelect` da versão Team mostra apenas os cards de pacotes básicos e lê o preço público: `GET /campaign/partner/enterprise/pricing`
  - A configuração do pacote `billingCycleSelect` entra na cadeia de compra e lê novamente o preço autenticado pelo mesmo `tier`: `GET /subscription/enterprise/v2/pricing`
  - A configuração de pacote não tem fallback de API pública; se o preço autenticado falhar, deve exibir estado de carregamento/erro, sem reutilizar os dados públicos da página de lista.
- O nível do produto é exibido conforme retornado pela API; o front-end não restringe a visibilidade de `LITE` / `PRO` / `MAX`.
- `subscribePeriod` continua mapeado para os grupos mensal, trimestral e anual; quando a API retorna o trimestre ele pode ser exibido, mas a UI não cria ativamente uma entrada trimestral.
- `subscribeMode` é exibido como forma de compra:
  - `CONTINUOUS`: mensal recorrente / anual recorrente
  - `ONE_TIME`: compra por mês
- Produtos de compra anual em pagamento único não são mais vendidos; o front-end é obrigado a filtrar `ONE_TIME + YEARLY`, e mesmo que a API ainda retorne, não deve exibir nem permitir selecionar.
- A alternância de forma de compra no lado direito da página Team é deduplicada por `subscribeMode + subscribePeriod`, e o texto dos botões usa apenas o `purchaseMethodName` entregue pela API; a ordem de exibição é fixa: mensal recorrente, anual recorrente, compra por mês. Na largura de desktop os três opções ficam em linha horizontal; em tela estreita quebram de forma adaptativa.
- O layout da configuração de pacote é fixo: assentos do pacote, forma de serviço, abatimento de saldo, continuar pagamento; quando tanto o bônus quanto o saldo em caixa não têm dados utilizáveis ou não são selecionáveis, a área de abatimento de saldo não é exibida.
- A área de assentos do pacote exibe de forma consolidada o time Standard/Advanced escolhido no primeiro passo, o preço da API e a quantidade de assentos; à esquerda ficam o nome do pacote e o preço mensal por assento, e à direita um input de passo de assentos com moldura de input. O campo de assentos usa um raio de canto uma tonalidade menor que o dos cards de pacote. A página de configuração não oferece mais troca de pacote; o usuário precisa voltar ao primeiro passo para trocar de pacote. Não é exibida explicação local de benefícios com texto fixo.
- A quantidade de assentos vai de `2~10000`, com default `2`. O campo permite digitação manual, sem bloqueio em tempo real durante a digitação; a validação ocorre após o blur, voltando ao mínimo `2` quando ficar abaixo do mínimo, a `10000` quando ultrapassar o máximo, e ao valor válido anterior quando estiver vazio ou não numérico.
- A forma de serviço é exibida conforme `subscribeMode + subscribePeriod`: mensal recorrente, anual recorrente, compra por mês; quando o pagamento anual tiver desconto de renovação, exibe o selo de desconto.
- A duração de compra de `ONE_TIME + MONTHLY` é sempre exibida na mesma linha à direita da aba "按月采购" (compra por mês), usando um select dropdown do tipo ghost em tamanho pequeno, mesmo quando a compra por mês não estiver selecionada. São permitidos apenas `1 / 3 / 6 / 12` meses, com default `1`. O gatilho do dropdown mostra apenas o mês atual; se o usuário alterar o mês sem ter selecionado a compra por mês, a compra por mês também deve ser selecionada e participar da simulação e do pedido conforme o `duration` escolhido. Não é mais permitido ao usuário digitar livremente qualquer número de meses, e o controle de duração de compra não é mais exibido separadamente abaixo das opções de forma de serviço. A promoção de 10% de desconto para 12 meses ainda não foi lançada; por enquanto o menu e a marcação de 10% no título não são exibidos, e serão habilitados quando a promoção entrar no ar.
- O texto de autorização de renovação automática, à direita da forma de serviço, só é exibido quando `CONTINUOUS` (assinatura recorrente) está selecionado; quando `ONE_TIME` (compra por mês) está selecionado, não é exibido.
- A página de configuração do pacote lê `GET /subscription/enterprise/v2/balance` e permite ao usuário escolher se usa bônus e saldo em caixa como abatimento. O front-end envia o valor disponível escolhido à API de simulação, e o abatimento efetivo segue o `giveDeductAmount` e o `balanceDeductAmount` retornados pela simulação. Quando tanto o bônus quanto o saldo em caixa estão indisponíveis, o estado de abatimento selecionado precisa ser limpo, para que o painel oculto não leve escolhas antigas de abatimento para a simulação ou para o pedido.
- O link "去充值" (recarregar) ao lado do saldo em caixa leva ao centro de recarga da BigModel: `https://bigmodel.cn/finance-center/finance/pay`.
- A área de continuar pagamento é envolvida por um container fixo no rodapé, sem raio de canto, envolvendo o resumo da configuração e o botão de continuar pagamento. Quando está flutuante, o topo mostra uma linha divisória; ao voltar à posição natural no fim da rolagem, a divisória é escondida. Dentro do container sempre se usa estrutura vertical: em cima, o resumo da configuração e o preço; embaixo, o botão de continuar pagamento com largura total, garantindo área de clique estável para valores e botão tanto no desktop quanto em tela estreita. À esquerda do resumo os itens são exibidos como "pacote · forma de serviço · assentos · duração da compra única", por exemplo "团队标准版 · 按月采购 · 2 席 · 1月" (Time Advanced · compra por mês · 2 assentos · 1 mês), usando a cor normal de corpo de texto; o valor à direita usa o formato de preço dos cards de pacote, com o valor em tamanho grande e a moeda e o sufixo "起" (a partir de) em tamanho pequeno acompanhando, priorizando o `thirdPayAmount` retornado pela simulação. Durante a simulação exibe "试算中" (calculando); sem resultado de simulação, calcula um preço provisório com o preço unitário atual do produto, multiplicado por assentos e duração.
- A página de confirmação de pagamento alinha o estilo à página pessoal de confirmação de pagamento, com disposição vertical "card de valor, aceite do contrato, botão de continuar pagamento"; a área de aceite do contrato usa recuo lateral `px-3` igual ao da página pessoal e o botão não é preso ao rodapé; Team exibe apenas conteúdo fixo. O topo do card de valor mostra o pacote comprado, isto é, o Time Standard/Advanced escolhido no primeiro passo; a ordem do detalhamento de valores é fixa: quantidade de assentos, forma de serviço, preço original do pedido, desconto, linha divisória, valor efetivamente pago; o preço original vem de `totalOriginalAmount`, o desconto de `totalOriginalAmount - totalPayAmount`, o valor pago de `thirdPayAmount`, e o formato do valor pago é alinhado ao formato de preço dos cards da lista de pacotes. Antes do pagamento é obrigatório marcar "团队套餐购买协议" (Acordo de Compra de Pacotes de Equipe), cujo link é `https://docs.bigmodel.cn/cn/terms/subscription-agreement-team`.
- A página de sucesso de pagamento usa o mesmo estilo de card de resumo para pessoal e Team. O pessoal exibe pacote, forma de serviço, ciclo de serviço, valor pago e status; Team exibe pacote, quantidade de assentos, forma de serviço, ciclo de serviço, valor pago e status. Na Team, o ciclo de serviço de compra única é exibido como "quantidade + unidade de período", por exemplo `3月`; na assinatura recorrente é exibido como "每周期自动续费" (renovação automática a cada período). O valor vem do Amount de pagamento de terceiro real do contexto de confirmação de pagamento, mantendo o mesmo formato dos valores nos cards de pacote.
- Ao clicar para selecionar um pacote na lista de pacotes Team, é obrigatório consultar primeiro o pedido pendente de pagamento. Sem pedido pendente, entra normalmente na configuração do pacote; havendo pedido pendente, exibe um modal perguntando "您有一笔尚未支付的订单，是否继续？" (você tem um pedido não pago, deseja continuar?), com as opções "取消订单" (cancelar pedido) e "继续支付" (continuar pagamento). "取消订单" chama a API de cancelamento e depois entra na configuração do pacote em que o usuário acabou de clicar; "继续支付" vai direto para a página de confirmação de pagamento, que exibe o produto, os assentos e o valor do pedido pendente e, por fim, chama a API de continuar pagamento para obter o QR code, sem criar um novo pedido.
- Depois que um pedido Team é criado e o usuário entra na página de pagamento, se ele voltar à página de confirmação de pagamento e clicar para retornar à configuração do pacote, o aviso de pedido pendente precisa aparecer, e não é permitido voltar silenciosamente à página de configuração. Quando o usuário escolhe "取消订单", é chamada `POST /subscription/enterprise/v2/order/{orderNo}/cancel`; após o cancelamento bem-sucedido o estado de recuperação deste pedido é limpo e ele volta à configuração do pacote. Quando o usuário escolhe "继续支付", ele permanece na página de confirmação de pagamento e o próximo continuar pagamento reutiliza o pedido já criado, chamando a API de continuar pagamento sem criar um novo pedido.

## Ciclo de compra

Na compra enterprise o número default de assentos é `2` e a duração default de compra de `ONE_TIME` é
`1`. A página de configuração do pacote não usa abatimento de saldo/bônus por padrão; quando o usuário
habilita o abatimento, a simulação e o pedido enviam o `giveAmount` e o `balanceDeductAmount`
correspondentes.

Fluxo de compra:

1. Ao selecionar um pacote na lista de pacotes de equipe, primeiro é chamada `GET /subscription/enterprise/v2/orders/pending` para consultar o pedido pendente de pagamento.
2. Sem pedido pendente, entra na configuração do pacote e chama `GET /subscription/enterprise/v2/balance` para ler bônus e saldo em caixa.
3. `POST /subscription/enterprise/v2/order/calculate` para simulação.
4. Após a confirmação do usuário, `POST /subscription/enterprise/v2/order` cria o pedido.
5. O pedido repassa sem alteração o `totalOriginalAmount`, o `totalPayAmount` e o `thirdPayAmount` retornados pela simulação, e envia o `giveAmount` e o `balanceDeductAmount` usados nesta operação.
6. Havendo pedido pendente, exibe o modal de aviso; se o usuário escolher "取消订单", é chamada `POST /subscription/enterprise/v2/order/{orderNo}/cancel` e depois entra na configuração do pacote.
7. Se o usuário escolher "继续支付", entra diretamente na página de confirmação de pagamento conforme o `productId` e o `seatCount` do pedido pendente; após a confirmação, é chamada `POST /subscription/enterprise/v2/order/{orderNo}/pay`, cuja resposta tem a mesma estrutura da criação de pedido.
8. Depois que um pedido recém-criado entra na página de pagamento, ao retornar à página de confirmação e clicar para voltar à configuração do pacote o aviso aparece; após cancelar o pedido volta-se à configuração de pacote, e continuar pagamento mantém o usuário na página de confirmação reutilizando o pedido já criado.
9. O conteúdo do QR code de pagamento prioriza o `payUrl`; o `alipayJumpSchema` serve apenas como conteúdo de fallback para o salto direto ao Alipay no mobile, e não como primeira escolha do QR code de leitura no PC.
10. `GET /subscription/enterprise/v2/order/{orderNo}/status` faz o polling do status de pagamento.
11. `SUCCESS` é considerado pagamento bem-sucedido; `FAIL`, `CLOSED` e `CANCELLED` são considerados falha ou fechamento.
12. Após o sucesso, o preço enterprise e o snapshot de benefícios do Coding Plan pessoal são atualizados.

## Valores nos eventos de rastreamento da compra

Os eventos `purchase_pay_ck` e `purchase_result` da compra de equipe usam o mesmo snapshot de valores
vindo da simulação.

O snapshot preserva toda a semântica de Amount retornada por `order/calculate`:

- `totalOriginalAmount` vem de `totalOriginalAmount`.
- `campaignDiscountAmount` vem de `campaignDiscountAmount`.
- `totalPayAmount` vem de `totalPayAmount`.
- `giveAmount` vem de `giveDeductAmount`.
- `cashAmount` vem de `balanceDeductAmount`.
- `thirdPartyAmount` vem de `thirdPayAmount`.
- A API de equipe não fornece `refundAmount` nem `residualAmount`; ambos são reportados como string vazia.

A resposta de order status de um pagamento bem-sucedido não retorna valores, então o evento de
resultado precisa reutilizar o snapshot congelado antes do pagamento, sem recalcular a simulação
depois do sucesso. Pedidos pendentes históricos só permitem confirmar `pendingOrder.amount`,
registrado como `thirdPartyAmount`; os demais campos de valor que não puderem ser confirmados
permanecem como string vazia.

## Fora do escopo desta versão

A primeira versão não implementa cancelar renovação, restaurar renovação, renovar, uma página
completa de lista de pedidos pendentes nem o gerenciamento de assentos de membros da empresa, e
também não permite digitar manualmente os valores de abatimento de saldo ou bônus. A entrada de
compra de equipe trata apenas a interceptação, o cancelamento e a retomada de pagamento de um único
pedido pendente.