# Casos E2E do Upgrade do Coding Plan no Webview

Este documento registra os casos E2E que o desktop precisa cobrir depois que a entrada de upgrade do Coding Plan foi migrada para o embedded webview do site oficial. O escopo é limitado ao desktop local workspace, as interfaces usam um mock server local ao case via WDIO e não acessam as interfaces reais de pacotes da BigModel / Z.AI.

## Princípios de Cobertura

- Cada case precisa ter setup, action e assert independentes; não basta considerar "abriu o webview" como cobertura de compra concluída.
- Depois de abrir a página de upgrade, assertar que os botões de minimizar, maximizar e fechar janela do Windows/Linux estão visíveis e que sua área de clique não está encoberta; no macOS esse grupo de botões desenhados pela própria app não é exibido. A diferença entre o comando dos botões e o fechamento da página web é coberta pela regressão em `overlayWindowControls.test.ts`.
- Depois que o webview do site oficial conclude o pagamento, a semântica de negócio do App é: primeiro fechar o webview de upgrade e depois atualizar o Coding Plan provider atual.
- A atualização do Provider passa pelo ProviderSettingsService / fronteira de credenciais do Account atual e cobre, no mínimo, a consulta `subscription/list` e a consulta de pacotes empresariais após a conclusão da compra; não é permitido gravar as credenciais da conta no Personal Provider Config.
- Este grupo de cases não envia requisições de modelo nem gera fixture de replay do provider DeepSeek.
- A CPUW-01 já parte de Personal/Start entitlement e precisa ser resolvida pelo plano de controle real do Account: o customerInfo inicial fornece organização/projeto, e o perfil mock controlado mantém o JWT de consulta do Start, sem forjar conexão de conta com a antiga Personal apiKey. Os textos de inventory loading/error são cobertos simultaneamente nos dois idiomas de inicialização, chinês e inglês.

## Accepted Cases

A autenticação atual segue a [especificação de PAT](../model-provider-project-access-token.md): a inicialização da conta consulta/cria o Key ID dedicado e depois emite um PAT, e o Copy Secret foi removido. A CPUW-01 confere a requisição de PAT e Copy=0, o inventário completo da entrada e o mesmo funnel do WebView, e garante que refresh/reload não reporte duplicado; CPUW-01/03 também asseveram que as credenciais da conta não vazam para o Personal Config. Antes da conclusão da compra a posição no request ledger fica congelada, e só a atualização de entitlement posterior é verificada; não se pode usar a requisição de inicialização como evidência do callback de compra. Um PAT válido permite reuso e não exige reemissão após a compra.

Neste case o PAT mock tem validade de 10 minutos, e a consulta de assinatura após a compra reaproveita o PAT já emitido neste case; o catálogo empresarial continua usando o OAuth da family atual. As duas classes de requisição são verificadas separadamente, sem imprimir o conteúdo das credenciais.

Regressão atual: 2026-10-14 macOS Electron, em `desktop-e2e-tests-only-20261014c` as cases CPUW-01/03 passaram (2 passed, 0 failed). A evidência é o `summary.json` do diretório de artifact local de mesmo nome; isso não representa todos os E2E de desktop nem Windows/Linux já verificados.

| Case    | Cenário                                                                             | Setup                                                                                     | Action                                       | Assertions                                                                                       |
| ------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| CPUW-01 | O webview do site oficial notifica o App para fechar o diálogo de upgrade e atualizar o provider atual                            | Já autenticado na BigModel, com a conexão atual sendo Coding Plan pessoal; mock local com suporte a Key ID/PAT dedicado e ao sinal de conclusão da compra | Abrir o webview de upgrade pelo menu do avatar e disparar a conclusão da compra       | O webview fecha; após a conclusão são consultados a assinatura e os pacotes empresariais; a inicialização emite o PAT, Copy=0, e o Personal Config não recebe credenciais da conta       |
| CPUW-02 | Falha de link externo/carregamento do webview do site oficial não recai no antigo painel de compra embutido                                   | A página oficial mock falha ao carregar ou a interface retorna sistema ocupado                                                     | Abrir a entrada de upgrade                                 | O App exibe o shell do webview ou o fallback de load-failure; não renderiza o botão de plano pessoal do antigo `CodingPlanPurchasePanel` |
| CPUW-03 | O webview do site oficial Z.ai notifica o App para fechar o diálogo de upgrade e atualizar o provider atual e os products do Team Plan | Já autenticado na Z.ai, com o webview recebendo o OAuth da family e o JWT, sem credenciais da BigModel                     | Abrir o webview de upgrade pelo menu do avatar e disparar a conclusão da compra da Z.ai | O webview fecha; após a conclusão são consultados a assinatura e os pacotes empresariais com as credenciais da Z.ai; o Personal Config não recebe credenciais da conta                   |

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
  - `/api/biz/v1/organization/:organizationId/projects/:projectId/api_keys/:apiKeyId/access_tokens`
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