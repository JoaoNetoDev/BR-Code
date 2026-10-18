# E2E de Disponibilidade do Upgrade do Coding Plan no Desktop

Data: 2026-07-03

## Objetivo de cobertura

Simular, quando uma conta BigModel está autenticada mas não tem direito a um Coding Plan pessoal, o usuário entrando pela entrada de upgrade no menu de avatar da sidebar na página de compra do `Upgrade Coding Plan`. Os dados dos planos pessoais vêm de um fixture server E2E local, sem acessar o backend real do BigModel / ZCode.

## Case: planos pessoais BigModel totalmente esgotados

| Campo | Conteúdo |
| --- | --- |
| Spec | `packages/desktop/test/e2e/coding-plan-upgrade-personal-sold-out.test.ts` |
| Fonte de dados | `BigModel Coding Plan E2E mock server` |
| Estado | verified |

### Setup

1. O E2E isola o HOME e escreve as credenciais OAuth do BigModel, representando uma conta autenticada.
2. Escreve o provider BigModel Coding Plan, mantendo o estado de plano não contratado.
3. Aponta `ZCODE_TEST_BASE_URL` e `BIGMODEL_TEST_API_BASE_URL` para o mock server local.
4. `client/configs` retorna os planos estáticos pessoais Lite / Pro / Max do BigModel.
5. `pay/batch-preview` retorna o mesmo conjunto de planos pessoais, com cada SKU `soldOut=true`.

### Action

1. Abre o workspace padrão.
2. Clica no menu de avatar da conta no footer da sidebar.
3. Clica na entrada `Upgrade Coding Plan` para abrir a página de compra.

### Assert

- A página exibe o agrupamento de planos pessoais.
- Os botões dos planos pessoais Lite / Pro / Max exibem "esgotado".
- Esses botões estão em estado disabled e não deixam entrar na página de seleção de período.

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

- `pnpm --filter @zcode/desktop typecheck:e2e`
- `pnpm typecheck`
- `pnpm lint`
- `pnpm test:e2e -- --spec ./test/e2e/coding-plan-upgrade-personal-sold-out.test.ts`
- `pnpm test:e2e -- --spec ./test/e2e/coding-plan-upgrade-personal-system-busy.test.ts`