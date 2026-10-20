# E2E de Disponibilidade do Upgrade do Coding Plan no Desktop

Data: 2026-07-03

## Objetivo de cobertura

Simular, quando uma conta BigModel está autenticada mas não tem direito a um Coding Plan pessoal, o usuário entrando pela entrada de upgrade na página de configurações ou no menu de avatar da sidebar na página de compra do `Upgrade Coding Plan`. Os dados dos planos pessoais vêm de um fixture server E2E local, sem acessar o backend real do BigModel / ZCode.

O fixture de conta fornece projetos pessoais e credenciais de projeto resolvíveis; a lista de assinaturas é vazia e a interface de direitos responde explicitamente que não há plano. Não se pode simular a ausência de direito com uma lista de projetos vazia, porque então o estado da conta passaria a ser falha de consulta, e não conta autenticada e não contratada.

Uma suite mista pode reutilizar o mock origin definido antes da build, mas cada worker precisa resetar explicitamente o cenário e o switch de marketing. Somente o worker `marketing-touch-*` habilita o fixture de marketing; os casos de compra retornam entrega vazia e não podem herdar o Popup, o Banner ou o resgate pendente do caso anterior. Ao reabilitar o marketing, usa-se um novo estado de fixture.

```text
worker spec -> reset(scenario, marketingTouch) -> mesmo mock origin
  caso de compra: entrega vazia          caso de marketing: estado de entrega novo
```

## Case: planos pessoais BigModel totalmente esgotados

| Campo | Conteúdo |
| --- | --- |
| Spec | `packages/desktop/test/e2e/coding-plan-upgrade-personal-sold-out.test.ts` |
| Fonte de dados | `BigModel Coding Plan E2E mock server` |
| Estado | verified |

### Setup

1. O E2E isola o HOME e escreve somente as credenciais OAuth do BigModel, representando uma conta autenticada, sem trazer nenhuma outra família de conta.
2. Escreve o provider BigModel Coding Plan, mantendo o estado de plano não contratado.
3. Aponta `ZCODE_TEST_BASE_URL` e `BIGMODEL_TEST_API_BASE_URL` para o mock server local.
4. `client/configs` retorna os planos estáticos pessoais Lite / Pro / Max do BigModel.
5. `pay/batch-preview` retorna o mesmo conjunto de planos pessoais, com cada SKU `soldOut=true`.

### Action

1. Abre o workspace padrão.
2. Abre a seção de provedores de modelo das configurações e entra na entrada da marca BigModel pelo Provider ID compartilhado.
3. Aguarda a entrada de assinatura ficar clicável, confirma que o webview de compra ainda não foi aberto e então clica na entrada de assinatura.

A entrada de marca não oferece mais o antigo modo de conexão por API Key, e não se usa mais a troca de modo removida para fabricar uma espera de sincronização. O estado de carregamento e de desabilitação do botão de assinatura durante a sincronização fica coberto pelo teste unitário correspondente em `packages/ui/test/modelProviderCodingPlan.test.ts`; este E2E valida apenas a interação da entrada de assinatura atual até a página de esgotamento.

### Assert

- A entrada de assinatura atual abre um webview de Coding Plan visível, com os controles de janela do produto.
- O fixture local da página de compra exibe "esgotado" ou "Sold out".
- A desabilitação dos botões de SKU e a seleção de período do site de compra real não pertencem ao escopo de validação desse fixture HTML local.

## Case: interface dos planos pessoais BigModel com o sistema ocupado

| Campo | Conteúdo |
| --- | --- |
| Spec | `packages/desktop/test/e2e/coding-plan-upgrade-personal-system-busy.test.ts` |
| Fonte de dados | `BigModel Coding Plan E2E mock server` |
| Estado | verified |

### Setup

1. O E2E isola o HOME e escreve as credenciais OAuth do BigModel, representando uma conta autenticada.
2. Escreve o provider BigModel Coding Plan, mantendo o estado de plano não contratado.
3. `client/configs` retorna os planos pessoais estáticos, garantindo que a página de compra tenha cards para exibir.
4. `pay/batch-preview` retorna falha de negócio, normalizada pelo service para `coding_plan_system_busy`.

### Action

1. Abre o workspace padrão.
2. Clica no menu de avatar da conta no footer da sidebar.
3. Clica na entrada `Upgrade Coding Plan` para abrir a página de compra.

### Assert

- A página continua exibindo os cards estáticos de planos pessoais, em vez de tela vazia ou loading infinito.
- Os botões dos planos pessoais Lite / Pro / Max usam o texto específico do botão: em português "Sistema ocupado", em inglês "System busy".
- Esses botões estão em estado disabled e não deixam entrar na página de seleção de período.

## Fora de cobertura

- Não cobre pagamento real, QR code, Stripe / PayPal ou contratação de planos de equipe.
- Não cobre a cadeia replayable do `/remote` no celular; este case verifica apenas a entrada de upgrade da sidebar local do desktop e a UI da página de compra.
- Não verifica estoque real nem direitos reais de conta BigModel, evitando que a regressão fixa sofra influência do estado online.

## Comandos de verificação

O mock origin local da página de upgrade é gravado nos artefatos de build do renderer. Ao criar um novo run, é
preciso fazer a build normalmente; não se pode reutilizar os artefatos de `ZCODE_E2E_SKIP_BUILD=1` do run anterior,
senão o webview acessará a porta antiga, que já foi fechada.

- `pnpm --filter @zcode/desktop typecheck:e2e`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:e2e -- --spec ./test/e2e/coding-plan-upgrade-personal-sold-out.test.ts`
- `pnpm test:e2e -- --spec ./test/e2e/coding-plan-upgrade-personal-system-busy.test.ts`