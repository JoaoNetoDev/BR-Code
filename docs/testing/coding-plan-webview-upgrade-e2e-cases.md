# Casos E2E do Upgrade do Coding Plan no Webview

Este documento registra os casos E2E que o desktop precisa cobrir depois que a entrada de upgrade do Coding Plan foi migrada para o embedded webview do site oficial. O escopo é limitado ao desktop local workspace, as interfaces usam um mock server local ao case via WDIO e não acessam as interfaces reais de pacotes da BigModel / Z.AI.

## Princípios de Cobertura

- Cada case precisa ter setup, action e assert independentes; não basta considerar "abriu o webview" como cobertura de compra concluída.
- Depois de abrir a página de upgrade, assertar que os botões de minimizar, maximizar e fechar janela do Windows/Linux estão visíveis e que sua área de clique não está encoberta; no macOS esse grupo de botões desenhados pela própria app não é exibido. A diferença entre o comando dos botões e o fechamento da página web é coberta pela regressão em `overlayWindowControls.test.ts`.
- Depois que o webview do site oficial conclude o pagamento, a semântica de negócio do App é: primeiro fechar o webview de upgrade e depois atualizar o Coding Plan provider atual.
- A atualização do Provider passa pelo ProviderSettingsService / fronteira de credenciais do Account atual e cobre, no mínimo, a requisição de cópia que devolve a nova key e a verificação de entitlement via `subscription/list`; não é permitido gravar a apiKey do Account no Personal Provider Config.
- Este grupo de cases não envia requisições de modelo nem gera fixture de replay do provider DeepSeek.
- A CPUW-01 já parte de Personal/Start entitlement e precisa ser resolvida pelo plano de controle real do Account: o customerInfo inicial fornece organização/projeto, e o perfil mock controlado mantém o JWT de consulta do Start, sem forjar conexão de conta com a antiga Personal apiKey. Os textos de inventory loading/error são cobertos simultaneamente nos dois idiomas de inicialização, chinês e inglês.

## Accepted Cases

Nota de reconexão do Todo103: as asserções históricas de apiKey/enabled persistidas em `builtin:*` na tabela abaixo foram substituídas pela arquitetura atual. A CPUW-01 confere, para a nova key desta rodada, a requisição de cópia correspondente, o inventário completo da entrada e o mesmo funnel do WebView, e garante que refresh/reload não reporte duplicado; CPUW-01/03 também asseveram que a key do Account não vaza para o Personal Config. A resolução de chaves de conta e o cache real de credenciais ficam por conta dos testes da camada de serviço, sem restaurar o antigo Provider Store para o E2E. O resultado real de execução no Electron é registrado à parte no Todo103, sem herdar as aprovações históricas.

| Case    | Cenário                                                                             | Setup                                                                                                                                                                                                   | Action                                                              | Assertions                                                                                                                                                                                                        |
| ------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CPUW-01 | O webview do site oficial notifica o App para fechar o diálogo de upgrade e atualizar o provider atual                            | Já autenticado na BigModel, com o modo de conexão atual sendo BigModel Coding Plan; apiKey inicial do provider `bigmodel-personal-api-key`; página oficial mock capaz de disparar `window.zcodeBridge.notifyPurchaseComplete({ provider: "bigmodel" })`      | Abrir o webview de upgrade pelo menu do avatar e disparar a conclusão da compra no guest webContents       | `coding-plan-embedded-webview` desaparece no App; o mock server recebe `getCustomerInfo`, `api_keys`, `copy`, `subscription/list`; o `builtin:bigmodel-coding-plan.apiKey` persistido é atualizado para a nova key retornada pelo mock; o provider continua enabled |
| CPUW-02 | Falha de link externo/carregamento do webview do site oficial não recai no antigo painel de compra embutido                                   | A página oficial mock falha ao carregar ou a interface retorna sistema ocupado                                                                                                                                                                   | Abrir a entrada de upgrade                                                        | O App exibe o shell do webview ou o fallback de load-failure; não renderiza o botão de plano pessoal do antigo `CodingPlanPurchasePanel`                                                                                                                  |
| CPUW-03 | O webview do site oficial Z.ai notifica o App para fechar o diálogo de upgrade e atualizar o provider atual e os products do Team Plan | Já autenticado na Z.ai, com o modo de conexão atual sendo Z.ai Coding Plan; localStorage do webview recebe `oauth:zai:access_token` e `zcodejwttoken`; página oficial mock capaz de disparar `window.zcodeBridge.notifyPurchaseComplete({ provider: "zai" })` | Abrir o webview de upgrade pelo menu do avatar e disparar a conclusão da compra da Z.ai no guest webContents | `coding-plan-embedded-webview` desaparece no App; o mock server recebe o `getCustomerInfo` necessário para atualizar o provider Z.ai, além de `/subscription/enterprise/v2/pricing`; o `builtin:zai-coding-plan` persistido continua enabled                  |

## Pruned Cases

| Decision | Pruned combinations                 | Reason                                                                                                        | Representative coverage                                                                                                                   |
| -------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| CPUW-P01 | Pagamento real concluído via Z.AI PayPal / Stripe     | Exige autorização real de pagamento de terceiro, que não pode ser executada de forma estável no CI do desktop; a semântica de conclusão do lado do App é coberta pela completion do webview mock da Z.ai          | CPUW-03 cobre o bridge da Z.ai + close/refresh do App; os meios de pagamento mantêm cobertura de teste unitário/componente internamente                                                               |
| CPUW-P02 | Conclusion do webview no Mobile `/remote` | O controle remoto do celular não cria um webview de compra independente do site oficial; o webview de upgrade atual é uma camada local do renderer do desktop                                 | CPUW-01 mantém o escopo desktop local; o Provider Runtime de um Environment remoto possui configuração e Registry próprios e não é validado por este caso quanto a Provisioning entre Environments |
| CPUW-P03 | Compra completa do Team Plan empresarial     | O sinal de conclusão do site oficial para o App tem o mesmo semântica de close/refresh do plano pessoal; a atualização dos produtos empresariais só precisa da asserção de unidade de `refreshTeamPlanProducts` | `modelProviderCodingPlan.test.ts` cobre o refresh de Team products; CPUW-01 cobre o IPC real do webview                                                |

## Fixture Contract

- O mock server do WDIO é responsável por:
  - `/coding-plan`: simula a página embedded do site oficial.
  - `/api/v2/releases/latest`
  - `/api/v1/client/configs`
  - `/api/biz/customer/getCustomerInfo`
  - `/api/biz/v1/organization/:organizationId/projects/:projectId/api_keys`
  - `/api/biz/v1/organization/:organizationId/projects/:projectId/api_keys/copy/:apiKey`
  - `/api/biz/subscription/list`
  - `/api/monitor/usage/quota/limit`
- O mock server fornece `/__e2e/coding-plan/requests` para que o spec assert as requisições.
- `CPUW-01` / `CPUW-03` usam timing `fast-text`, sem depender de requisições reais de modelo em streaming.
- A origin do Coding Plan webview é uma constante do build do Vite. Tanto a execução direcionada quanto o glob completo padrão devem iniciar o mesmo mock origin sharded antes do build do
  desktop; não se pode esperar até o `beforeSession` do worker para injetar a origin.
- O mesmo shard completo pode rodar, em sequência, sold-out, system-busy e refresh-provider. A mock origin
  permanece inalterada durante o ciclo de vida do shard, e cada worker de upgrade, antes de iniciar o Electron,
  redefine `scenario`, o estado da compra e o request ledger pelo endpoint de controle de testes; nenhum outro
  worker pode encerrar o server pertencente ao launcher.