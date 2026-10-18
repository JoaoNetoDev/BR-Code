# Plano de Código do Model Provider

Os Model Providers agora separam o acesso manual por API Key do acesso por Coding Plan baseado em conta.

## Entradas

- `Z.AI - API Key` e `BigModel - API Key` mantêm o formulário de provider existente, incluindo API Key, endpoints, modelos e mapeamentos de modelo.
- `Z.AI - Coding Plan` e `BigModel - Coding Plan` são entradas independentes. Elas usam a própria credencial de provider `*-coding-plan` para consultar a API de entitlement de cota de uso e, a partir daí, deduzir se a conta tem acesso ao Coding Plan.
- Os ids de provider são intencionalmente separados:
  - `builtin:zai` => `Z.AI - API Key`
  - `builtin:zai-coding-plan` => `Z.AI - Coding Plan`
  - `builtin:bigmodel` => `BigModel - API Key`
  - `builtin:bigmodel-coding-plan` => `BigModel - Coding Plan`
- A barra lateral de providers agrupa as entradas predefinidas em cards de provider:
  - `Z.AI`: `Coding Plan`, `API Key`
  - `BigModel`: `Coding Plan`, `API Key`

## Estados do Coding Plan

- Não conectado: o provider Coding Plan correspondente não está configurado. A página mostra o card leve de conexão de conta e os cards verticais de plano Lite / Pro / Max.
- Conectado, mas sem assinatura: o provider Coding Plan correspondente está configurado, mas a API de entitlement de cota retorna `no_plan` ou nenhum dado de plano utilizável. A página mantém os cards de plano e mostra apenas a ação de assinar.
- Assinado: o provider Coding Plan correspondente está configurado e a API de entitlement de cota retorna dados de assinatura ou de cota. A página mostra a configuração normal de provider nesta ordem: nome, card de status do Coding Plan, endpoints, modelos e mapeamento de modelo. Não mostra campos de API Key nem de Connection Mode.

O status do Coding Plan é atualizado após o carregamento do provider, o refresh manual e o salvamento de `builtin:zai-coding-plan` ou `builtin:bigmodel-coding-plan`. Usuários que precisem colar uma chave manualmente devem usar as entradas de API Key.

Quando um refresh de entitlement está em andamento, a página de configurações continua exibindo um snapshot válido existente de cota paga de Coding Plan para o mesmo provider. Isso corresponde à entrada de uso da barra lateral: entitlement válido em cache é tratado como o estado visível atual até que o refresh em segundo plano retorne, em vez de voltar temporariamente para Start Plan ou para um estado vazio de verificação.

O refresh manual nas configurações de Model Provider é um refresh de entitlement da conta, não
apenas um refresh do catálogo de providers. Ele deve atualizar as API keys de Coding Plan
derivadas do OAuth, os snapshots de entitlement pessoal de Coding/Start e os dados de
pricing/customer project autenticados do Team Plan. Isso cobre usuários adicionados a um
time, removidos de um time e compras de time concluídas com o app já aberto.

A página de sucesso da compra mantém uma única ação `Done`. Ela não deve mostrar um
botão de refresh imediato separado. Clicar em `Done` conclui o fluxo de compra
executando primeiro a cadeia externa de refresh de compra-concluída e depois fechando o
painel. Essa cadeia de refresh é responsável por tornar o novo entitlement pessoal ou de
Team Plan visível nas configurações de Model Provider.

## Cards de Preço

- Os cards de preço são específicos de provider. Z.AI usa o catálogo Z.AI USD Coding Plan; BigModel usa o catálogo BigModel CNY GLM Coding.
- Os períodos visíveis são `Monthly`, `Quarterly` e `Yearly`. Períodos não mensais mostram o valor do período cobrado mais o equivalente mensal.
- As descrições de plano também são específicas de provider, portanto a redação da BigModel não é reaproveitada do catálogo da Z.AI.

## Escolha de Compra com Sessão Deslogada

Quando o acesso baseado em conta da BigModel está desconectado, os banners de escolha
de compra mostram entradas For Individuals e For Teams antes de o usuário abrir o painel
completo de compra.
Cada entrada deve incluir a mesma hierarquia de preços usada pela lista de planos, colocada
entre o título e a descrição:

- For Individuals: `¥49.00 人民币 起`
- For Teams: `¥598.00 人民币 起`

A formatação de valores deve reutilizar o formatador compartilhado de valores do Coding Plan
para que locales chineses e não chineses mantenham a mesma semântica de moeda da lista
de pacotes.

Quando `client/configs.codingPlanBillingDiscount` está ativo, a atividade é
anunciada apenas pelo banner do painel de compra e pela ação de upgrade. O título do
Plan Card nas configurações não deve mostrar um badge separado de cota de 150%, porque o
banner é a única fonte de promoção da campanha.

O painel compacto de uso do Coding Plan dentro de uma conversa não deve renderizar o
badge de campanha de cota de 150%. Esse painel prioriza valores de cota, tempo de
reset e ações de reset dentro de uma superfície estreita; a promoção de campanha continua
disponível a partir das superfícies de Model Provider e de compra.

Os banners de escolha de compra com sessão deslogada são entradas de aquisição, e não
status de Plan Card. Quando o desconto de cobrança está ativo, as entradas For Individuals
e For Teams deslogadas mostram ambas o badge compacto de cota de 150% ao lado do título.
Entradas logadas sem assinatura e entradas logadas de grupo de time empresarial não
mostram esse badge.

Quando o acesso baseado em conta da Z.ai está desconectado e nenhum entitlement
Start/Coding está disponível ainda, a mesma superfície deslogada ainda é exibida, mas
apenas a entrada Start (quando `startPlanPreview` existe) e a entrada For Individuals ficam
visíveis.
For Teams fica oculta para Z.ai.

O painel de compra segue o mesmo limite de produto. Quando o provider selecionado
não suporta For Teams, como Z.ai, o painel renderiza diretamente o conteúdo do plano
Individuals e não mostra as abas de público Individuals/Teams.
Esse ramo sem abas ainda deve preencher a altura disponível do corpo do painel para que
os cards de plano mantenham o mesmo layout esticado da visão com abas da BigModel.

Quando o estado da conta está desconectado, clicar em For Individuals ou For Teams
deve primeiro iniciar o fluxo de login do provider. O painel completo de compra só
deve abrir a partir dessas entradas depois que o provider tiver um token de compra
autenticado e sem assinatura.
