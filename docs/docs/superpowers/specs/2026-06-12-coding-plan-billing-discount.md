# Aviso de promoção de cota por tempo limitado do Coding Plan

Data: 2026-06-12

## Contexto

`GET https://zcode.z.ai/api/v1/client/configs?app_version=<ZCODE_VERSION>&platform=<platform>-<arch>` pode retornar `data.configs.codingPlanBillingDiscount`. Esse campo controla o aviso de promoção de cota por tempo limitado do Coding Plan.

## Semântica

- campo `codingPlanBillingDiscount` ausente: o front-end não expõe nenhuma UI de promoção, nem mostra badge ou banner.
- campo `codingPlanBillingDiscount` presente: o front-end lê, conforme o locale atual, os textos enviados dentro do campo e exibe o aviso da promoção.
- o campo não é mais usado apenas como um interruptor de promoção; sem texto para o locale atual, a UI da promoção correspondente não é exibida.
- o novo formato do campo é `{"zh-CN": {"cardTitle": "...", "cardBody": "...", "badgeBody": "..."}, "en-US": {...}}`; o front-end não codifica textos de fallback.
- os textos falam de promoção de cota, não de desconto de preço, para evitar que o usuário entenda como desconto no valor do pagamento.

## Pontos de exibição

- O título de Context usage remaining exibe “剩余额度”; ao lado do título é reutilizado o mesmo badge curto.
- O badge curto de Context usage remaining usa dimensionamento compact e o tamanho de fonte de badge `text-ui-xs`, mantendo o gradiente padrão, para não ficar grande demais no título de um popover compacto.
- Ao lado do título do status card de plano pessoal e de plano de equipe em Model Settings exibe-se o badge curto; no status card do Start Plan o badge curto não é exibido.
- No topo da lista de planos do Coding Plan exibe-se um banner de promoção; o ícone do banner usa `astroid` e o tamanho de fonte do título usa `text-base`.
- No topo da lista de planos do Coding Plan, o banner de promoção exibe, na extremidade mais à direita, o badge curto e o ícone `info` por meio de `CodingPlanBillingDiscountBadge`, cuja estrutura é `<>徽标 div + info</>`; `info` é um gatilho de ícone comum, sem wrapper Button; ao clicar em `info` reutiliza-se o Dialog existente para exibir a explicação das regras de conversão da cota GLM-5.2 de 150%; o texto da explicação precisa passar por i18n e não pode ficar codificado diretamente no componente.
- O badge curto à direita do banner, dentro do banner com gradiente, usa o estilo `surface`, isto é `bg-white text-[#191A1D]`, para evitar que o gradiente padrão do badge se funda com o fundo do banner e fique invisível.
- `CodingPlanBillingDiscountBadge` renderiza por padrão `<>徽标 div + info</>`, sem controle por flag; em cenários aninhados dentro de botões usa-se o badge puro `CodingPlanBillingDiscountBadgePill`, evitando aninhar o gatilho do Dialog dentro de um Button externo.
- O corpo do Dialog de explicação usa o componente de renderização Markdown existente, com texto na cor principal `text-foreground`; o título é expresso pelo heading markdown de segundo nível `##`, as regras de conversão por listas markdown e os textos das regras mantêm o original da promoção.
- O botão de upgrade do Start Plan exibe o badge curto em seu interior; no estado de promoção, o botão de upgrade exibe o mesmo gatilho de ícone `info` à direita e, ao clicar, reutiliza o Dialog de explicação; o botão de upgrade do Start Plan no painel de contexto do chat e o botão de upgrade do quota banner do Start Plan na área de chat seguem a mesma regra.
- Quando o Start Plan já possui benefícios, o botão de upgrade do plan card usa o fundo `button-gradient dark:bg-[#484A58]`.
- O badge curto dentro do botão de upgrade do Start Plan usa `bg-white text-[#191A1D] rounded-full`, sem usar mais o fundo gradiente padrão do badge.
- O badge curto dentro do botão de upgrade do Start Plan não exibe o ícone `trending-up`, apenas o texto `150% 配额`.
- Quando o badge do quota banner da área de chat é embutido no botão de upgrade, usa-se `pr-px`, deixando o badge branco colado ao lado direito do botão e mantendo apenas 1px de borda com o fundo da promoção; Model Settings mantém o espaçamento próprio de seus botões de card.
- O botão de upgrade da promoção no quota banner da área de chat não usa altura fixa, sendo definido naturalmente pelo badge e pelo conteúdo do botão, evitando que o texto da promoção fique apertado ou cortado em relação ao `h-6` fixo.
- Todos os badges curtos de promoção usam uniformemente o tamanho de fonte de badge `text-ui-xs` e permanecem em uma única linha sem quebra; compact apenas reduz espaçamento e ícone, sem alterar o nível de tamanho da fonte.
- A entrada de navegação de provider e o family header em Model Settings não exibem o badge curto; ele só é exibido onde a semântica de benefício/plano do Coding Plan é clara.
- Ao lado do título do Coding Plan em Sidebar usage remaining não se exibe o badge curto, para não sobrecarregar o título do menu de uso; o popover de context usage na caixa de entrada continua exibindo.
- Ao lado do título do plan card/status card do Start Plan não se exibe o badge curto, mesmo que já existam benefícios do Start Plan; o aviso de promoção do Start Plan aparece apenas no botão de upgrade e na lista de planos.

## Chamadas e cache

- A camada de serviço lê esse campo pelo `BigModelCodingPlanSubscriptionProvider.getClientConfigs()` já existente.
- Essa leitura precisa reutilizar o `clientConfigSnapshot` / `clientConfigRequest` existentes, evitando requisições duplicadas na mesma tela entre sidebar, context usage e página de configurações.
- O TTL de `clientConfigSnapshot` e do cache de estado de promoção na UI é de 1 hora; após o TTL expirar, a próxima leitura refaz a requisição a `/api/v1/client/configs`.
- O estado da promoção é carregado de forma lazy após a montagem da UI, sem bloquear a renderização já existente de usage remaining, Start Plan e da lista de planos.

## Internacionalização e textos do servidor

- Usar `codingPlanBillingDiscount[locale].badgeBody` para exibir o texto do badge curto; exemplo em chinês: `150% 配额`, exemplo em inglês: `150% Quota`.
- Usar `codingPlanBillingDiscount[locale].cardTitle` e `cardBody` para exibir o banner no topo da lista de planos.
- O Dialog de explicação à direita do banner usa texto i18n local; a largura do popup usa `max-w-lg` e a área de texto é envolvida por `div.p-3.!space-y-3`; o título é “权益规则说明：”; o corpo explica que, ao usar o modelo GLM-5.2 no ZCode pelo Coding Plan, o consumo da cota é convertido por um fator de 0,67 em todo o ciclo; para o mesmo volume de chamadas de modelo, a dedução da conta apenas 67%, o que equivale a cerca de 1,5 vez a cota disponível no período da promoção; no horário de pico, das 14:00 às 18:00, o fator passa de 3x para 2x, e fora do horário de pico passa de 1x para 0,67x; o prazo dos benefícios de cota segue o anúncio oficial. O Dialog de explicação não exibe textos extras de cortesia ou agradecimento.
- Quando o servidor não envia o locale atual ou algum texto obrigatório está vazio, a UI da promoção correspondente não é exibida.