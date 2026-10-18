# Casos E2E do Team Plan

Este documento registra os casos E2E que a página de configurações do desktop e o ponto de entrada de uso precisam cobrir após a integração do Team Plan. O escopo é limitado ao workspace local do desktop, e as interfaces usam um mock server case-local do WDIO, sem acessar as interfaces reais de plano do BigModel / Z.ai.

## Princípios de cobertura

- Cada caso precisa ter setup, action e assert independentes; “o caminho passou por ali” não conta como cobertura.
- A cota e as estatísticas do Team Plan precisam usar o contexto do projeto de equipe: `organizationId`, `projectId`, header de equipe e `type=2`.
- Quando o Coding Plan pessoal e o Team Plan existem ao mesmo tempo, cada um é exibido como um Provider independente e hospeda dados de produto independentes.
- O mock server E2E registra as requisições de negócio, usadas para afirmar se a lista de planos corporativos, a quota pessoal, a quota da equipe, o uso de modelos e o uso de ferramentas foram solicitados.

## Casos aceitos

| Caso   | Cenário                                                       | Setup                                                                           | Action                                                                   | Asserções                                                                                                                                                     |
| ------ | ---------------------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTP-01 | Obter a lista de planos após o login; o pricing do Team Plan dispara mesmo sem entrar na página de configurações | Logado no BigModel, provider atual é BigModel Coding Plan, o mock retorna um Team Plan já comprado | Iniciar o workspace padrão sem abrir a página de configurações                          | o mock server recebe `/subscription/enterprise/v2/pricing`; a página continua no workspace                                                                                       |
| CTP-02 | A página de configurações exibe, no método de conexão, API por uso, Coding Plan pessoal e Team Plan  | Logado no BigModel, o mock retorna simultaneamente o plano pessoal e o Team Plan                                  | Abrir as configurações de modelo e expandir o método de conexão; selecionar Team Plan                               | O menu contém os três tipos formais de conexão; as configurações salvam o `providerFamilyConnectionSelections.bigmodel` estruturado e não gravam o antigo `mode/selectedKey`                                                  |
| CTP-03 | Entrar nas estatísticas de uso do Team Plan pelo menu do avatar do usuário                        | O mock retorna a quota da Team A e a conexão atual é a Team A                                   | Clicar na entrada de estatísticas de uso do menu do avatar do usuário                                         | A página de Usage muda para o plano de programação do Team Plan, mostrando o nome da Team A e a porcentagem de cota restante; o mock recebe `quota/limit?type=2`                                                              |
| CTP-04 | Configurações → estatísticas de uso → o plano de programação mostra o uso do Team Plan              | O mock retorna quota da Team A, model usage e tool usage                                 | Abrir a página de configurações → estatísticas de uso → plano de programação                                         | A página mostra a cota da Team A, o uso de modelos e o uso de ferramentas; o mock recebe `quota/limit?type=2`, `model-usage?type=2` e `tool-usage?type=2`                                            |
| CTP-05 | A combinação de plano pessoal/equipe segue a conexão Family atual para exibição                  | O mock retorna simultaneamente o plano pessoal e o Team Plan                                                   | Alternar entre Coding Plan pessoal e Team Plan na página de configurações                                | O card de produto, a quota e os membros de modelo seguem a structured connection selection atual; não são determinados pelo antigo selectedKey nem pelo Personal Account Provider                                              |
| CTP-06 | A restauração de inicialização via OAuth preserva o Team Plan já selecionado                         | Salvar a structured Team Plan selection antes do cold start, com credenciais de conta recuperáveis                          | Iniciar o App e abrir as configurações de modelos                                                  | O Team Plan continua sendo a conexão atual, com a identidade de organização/projeto completa; a restauração via OAuth não sobrescreve para o Coding Plan pessoal                                                                 |
| CTP-11 | Após uma falha fatal de quota, a origem é preservada e recuperável                           | Logado no BigModel, a conexão atual é o Coding Plan pessoal e o mock retorna quota fatal na primeira vez          | Abrir estatísticas de uso → Coding Plan; após confirmar o erro, mudar para App Usage e depois voltar para Coding Plan | O estado de erro usa a semântica atual de “não foi possível ler as estatísticas de uso”; quando existe o subscription snapshot, a tab de origem do Coding Plan não some; após o mock se recuperar, ao entrar de novo na origem, quota, model usage e tool usage são exibidas |

## Contrato de fixture

### CTP-12: nome de equipe longo do provedor e troca para o plano de experiência (formal)

- Setup: aplicativo Electron real, configuração de teste isolada e mock de negócio fornecendo nome de organização longo, planos pessoal/equipe e um benefício válido do Start Plan.
- Action: entrar nas configurações a partir das configurações e escolher o provedor de modelos, selecionar a equipe; verificar o nome e a seta em janela larga e estreita, passar o mouse sobre o botão do plano de experiência e clicar para trocar; sair e entrar novamente nas configurações.
- Asserções: em tela larga, o nome completo aparece com o título na mesma linha da área de ações; em tela estreita, quando não couber, o nome é elidado e o controle não ultrapassa os limites; nenhum “Switch to” independente é exibido; o tooltip usa o texto “切换至体验套餐” do idioma atual; o setting.json real salva o selectedKey Start, e ao entrar de novo continua aparecendo o Start Plan.
- Cobre apenas o caminho do aplicativo desktop real; os 20 grupos de testes de componente no navegador continuam responsáveis pelas combinações de tamanho/idioma/tema, sem alegar cobertura da cadeia do `/remote` do celular.
- Automação: `packages/desktop/test/e2e/provider-family-responsive.test.ts`. Em 2026-09-04 a execução local em Electron real passou, e a confirmação do usuário a promoveu; a entrada formal, sem a chave manual-review, passou novamente (1 passed).
- Este caso usa o lado de cenário para habilitar o nome longo dedicado e o fixture de billing/balance; o cenário comum de Team mock restaura os dados padrão e não envia requisições de modelo.

Comando de execução formal (este caso não chama o modelo e as interfaces de conta usam mock de negócio local):

```bash
pnpm --filter @zcode/desktop test:e2e -- --spec './test/e2e/provider-family-responsive.test.ts'
```

Evidência de aprovação: `packages/desktop/.e2e-artifacts/desktop-e2e-20260904060418619-p33484-6650d642259f46f0/summary.json` (1 passed). Desta vez foram corrigidos a inicialização do JWT dedicado do runner, a espera pelo fim do refresh real e o seletor de WebDriver do tooltip visível do Radix; a implementação do produto não foi alterada.

Evidência de promoção: `packages/desktop/.e2e-artifacts/desktop-e2e-20260904060754282-p39563-0c1b2374a55285ca/summary.json` (1 passed, entrada formal padrão). Reentrar nas configurações apenas lê o estado restaurado, sem clicar de novo na navegação de provedores e sobrescrever a seleção. O script genérico de promoção só aceita o diretório de conversation, então este caso migrou pelo caminho de domínio de configurações e sincronizou as referências; não entrou na Docker suite.

A janela usa 1800/480px (largura mínima do Electron de 480px), e o tooltip é verificado em 1200px. Cada execução salva capturas de tela da tela larga, da estreita, do tooltip e da seleção de Start após reentrar, além dos valores geométricos e das asserções das requisições de negócio.

### Restrições comuns

- Este grupo de casos não gera replay fixture de provider DeepSeek, porque os testes não enviam requisições de modelo.
- Antes de cada reinício de cenário do mock, `lastWorkspaceSession` é fixado explicitamente no `ZCodeProject` do HOME isolado; não pode herdar o conversation workspace deixado pelo caso anterior, senão as asserções de workspace pronto e o seed de resolução de modelo caem em buckets diferentes.
- O mock server do WDIO responde pelas interfaces de negócio:
  - `/api/biz/subscription/enterprise/v2/pricing`
  - `/api/biz/customer/getCustomerInfo`
  - `/api/monitor/usage/quota/limit`
  - `/api/monitor/usage/model-usage`
  - `/api/monitor/usage/tool-usage`
- `type=2` indica Team Plan; a ausência de `type=2` indica Coding Plan pessoal.
- O mock server oferece `/__e2e/coding-plan/scenario` e `/__e2e/coding-plan/requests` para o spec trocar de cenário e afirmar as requisições.

## Contrato de preflight do runner

- Mesmo executando `wdio run wdio.conf.ts` diretamente, é preciso validar o `path.txt` do package do Electron e o executável real para o qual ele aponta, e não considerar o Electron instalado só porque o wrapper script `node_modules/.bin/electron` existe.
- A config do WDIO precisa carregar primeiro, por prioridade, o `.env.e2e.local` do desktop/repo, e só depois ler a configuração de instalação do Electron e rodar o preflight do binário, garantindo que `ELECTRON_MIRROR`, proxy, certificados e diretórios de cache sejam repassados simultaneamente ao subprocesso de instalação e aos processos E2E seguintes.
- Quando o package do Electron existe mas o binário está faltando, a config do WDIO executa o `install.js` daquele package antes de criar a session do ChromeDriver e depois revalida o executável real. A instalação precisa ter espera limitada: `ZCODE_E2E_ELECTRON_INSTALL_TIMEOUT_MS` pode sobrescrever o timeout padrão de 5 minutos, e após o timeout o subprocesso precisa ser encerrado.
- Se a instalação falhar, estourar o tempo ou o script de instalação rodar e ainda não houver binário, é preciso reportar diretamente a causa raiz da instalação do Electron, com diagnóstico contendo o timeout efetivo e o endereço de espelho com dados sensíveis removidos, preservando a exceção original via `cause`, sem continuar a execução e degradar para um `Chrome instance exited` genérico.
- Esse preflight apenas corrige a dependência de E2E local e não altera a session `desktop-continuous` do desktop, a cadeia de restauração `web-remote-replayable` do celular nem o estado de runtime do produto.

### CTP-11 regressão de separação entre benefício e cota (2026-09-17)

O mesmo caso usa personalOnly e teamOnly em 1200px e 390px: a interface de assinatura é válida, a quota falha primeiro no negócio e depois no transporte, e o ponto de entrada de uso do plano continua acessível; após recuperar a quota, a cota de cada um volta a ser exibida. O mock de equipe usa querySubscribeDetail para devolver a autorização de membros; os benefícios de equipe não são mais sintetizados a partir da quota ou da subscription/list pessoal. A UI do celular é coberta por regressão de componente compartilhado, e a verificação real de /remote fica como item separado, sem ser inferida pelo desktop.

### CTP-13 recuperação do rate limit de balance do Start (2026-09-17)

Quando o balance do Start Plan retorna 429, mantém-se o título Start, uma única mensagem de falha e a ação de retentativa, sem sugerir novo login.
Depois de mudar o mock para um balance válido e clicar em retentativa, a exibição do plano se recupera. O limite de um segundo das requisições compartilhadas, o isolamento de conta e as condições de corrida de invalidação são cobertos por `zaiStartPlanBalanceSharing.test.ts`.

### CTP-14–19: completude da exibição de benefícios (formal, 2026-09-18)

Segue-se a semântica de produto já confirmada, sem expandir o negócio de planos. O fixture HTTP local dedicado é mantido pelo server do WDIO; o caso grava credenciais e seleção de conexão isoladas depois que o Electron antigo termina completamente e então inicia o aplicativo para ler as interfaces. Não há necessidade de replay fixture de modelo (nenhuma requisição de modelo é enviada).

| Caso   | Setup / Action                                                                         | Asserções obrigatórias                                                                                                                                                          |
| ------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CTP-14 | BigModel não conectado, abrir o plano de programação                                                          | Ação de conexão e banners de compra pessoal e de equipe; sem banner de compra do plano de experiência e sem lista de modelos/adicionar modelo                                                                                           |
| CTP-15 | Sem benefício pessoal, o produto de equipe ainda subscribed mas a equipe está expirada                                         | Os banners de compra pessoal e de equipe aparecem ao mesmo tempo; sem lista de modelos; a requisição de assinatura pessoal usa API key                                                                                              |
| CTP-16 | Selecionar a equipe, respectivamente com expirada, não atribuída e falha de interface                                                 | Os textos de estado correspondentes; ao confirmar expirada/não atribuída não há lista de modelos (falha de consulta não equivale a ausência de benefício); no estado logado não regride para botão de conexão; após clicar em retentativa numa falha, um benefício válido restaura a lista de modelos; as requisições de equipe usam business token e organização/projeto |
| CTP-17 | O Start retorna status=active, server_time antigo, ends_at expirado e balance antigo                      | A expiração é determinada pelo HTTP Date; exibe o estado expirado, sem balance de hoje e sem a lista antiga de modelos                                                                                                          |
| CTP-18 | O Start retorna ao mesmo tempo um plano expirado e um plano válido                                                         | Apenas o plano válido e o balance são exibidos, e a lista de modelos fica disponível                                                                                                                                |
| CTP-19 | Start válido + conexão pessoal ou de equipe selecionada, confirmada e disponível, abrindo a navegação Start independente (preservando a identidade da conexão paga) | Start válido sem operação de upgrade/150%; em seguida, com Start expirado, verificar que não há banner de compra pessoal/equipe; sem benefício pago como controle positivo, o upgrade fica visível                                                            |

As combinações são podadas por diferença: CTP-16 cobre três estados independentes da equipe; CTP-19 cobre pessoal, equipe e ausência de benefício. A nomenclatura de marca em chinês e inglês segue PN-01/02, e a entrada preservada em caso de falha de cota segue as combinações pessoal/equipe e tela larga/estreita do CTP-11; o compartilhamento de requisição de um segundo e a invalidação assíncrona são verificados por testes unitários de serviço. Uma janela estreita do desktop não equivale a um celular real com `/remote`, que não está nas evidências de replay deste ciclo no desktop. Esses 9 casos foram confirmados pelo usuário e, em 2026-09-18, migrados para o diretório formal de settings; a admissão em Docker/CI é verificada separadamente.

Problemas encontrados e corrigidos no replay: a página do Start usava diretamente o `status=purchased` da navegação da equipe para determinar se já havia benefício pago, e esse valor pode vir do `pricing.subscribed` histórico. Agora os pontos de entrada de compra/upgrade leem apenas o `availability=available` e `entitled=true` da Account dos Providers pagos da mesma plataforma em `ProviderSettingsView`. O catálogo fica responsável apenas por descobrir o produto e a identidade da equipe. Os testes unitários de componente correspondentes cobrem de forma cruzada o estado de navegação e o benefício da Account, e a implementação antiga produzia 2 falhas que passaram após a correção.

```text
订阅接口 → Account owner 确认权益 → ProviderSettingsView → Start 购买/升级入口
商品目录 → 团队导航身份（不作为权益证据）
```

Entrada de automação: [coding-plan-entitlement-presentation.test.ts](../../packages/desktop/test/e2e/settings/coding-plan-entitlement-presentation.test.ts). Os dados de negócio são fornecidos por [entitlement-presentation.ts](../../packages/desktop/test/e2e/fixtures/entitlement-presentation.ts), com catálogo pessoal/equipe válido e estático, produto de equipe ao vivo com `subscribed=true`, prévia do plano de experiência e a campanha de 150%, evitando asserções vazias de “não exibir” para configuração ausente.

Manutenção dos casos existentes: a seleção de modelo da Account compartilhada por CTP-10 / QR foi atualizada para o GLM-5.3 do catálogo Builtin deste ciclo; o primeiro início com conta isolada usa o `skipOccupationOnboardingIfPresent` compartilhado para concluir o onboarding. O Escape original apenas fechava o onboarding temporariamente, e QR-09/10 voltariam a obstruir o Composer após um reload; a evidência de DOM das falhas é explicitamente `onboarding-page`, e não uma falha das interfaces de benefício ou de cota.

### Evidências de verificação deste ciclo (2026-09-17)

Considerando o último resultado por `file + title`, todos os 34 E2E independentes passaram: 9 novos cenários de exibição, os 19 CTP existentes e os 6 QR. As falhas intermediárias e os replays de correção mantêm os relatórios originais, sem escrever lotes com falha como totalmente verdes.

| Run (`packages/desktop/.e2e-artifacts/`) | Resultado e cobertura                                                                                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `desktop-e2e-20260917-153050-019`         | 26 de 28 passaram. O CTP-10 existente expôs o ID de modelo antigo; o novo fixture positivo de equipe precisa preservar a identidade da conexão paga. Ambos foram corrigidos em replays posteriores. |
| `desktop-e2e-20260917-154234-621`         | O novo spec passou 9/9; CTP-10 e QR-01/02/03/04 passaram. QR-09/10 expuseram o onboarding obstruindo após o reload, deixados para o lote seguinte.   |
| `desktop-e2e-20260917-155127-532`         | 8/8 passaram: CTP-02, CTP-10, CTP-11 pessoal/equipe × 1200/390px e QR-09/10.                               |

12 arquivos de testes unitários de serviço/UI somaram 349 casos passando; `pnpm typecheck`, `typecheck:e2e` do desktop, `pnpm lint`, `pnpm architecture:check --changed`, o formato dos arquivos alterados e a verificação de diff passaram. O lint mantém a baseline de 55 warnings / 0 errors. O aplicativo foi replayed depois de uma reconstrução.

O ambiente de verificação foi Electron no macOS com mock HTTP de negócio local. Não foram verificados serviços de produção, Windows/Linux nem o `/remote` real do celular; no momento do replay acima esses casos ainda não haviam sido promovidos e também não houve admissão em Docker/CI.

#### Verificação de promoção formal (2026-09-18)

Após a confirmação de promoção do usuário, os 9 casos de exibição foram migrados para `settings/coding-plan-entitlement-presentation.test.ts` e as referências de helper/fixture foram corrigidas. Como o script genérico de promoção em dry run só aceita caminhos de conversation-session, foi usada a mesma migração de domínio de configurações do CTP-12; o registro do mock HTTP de negócio é feito por nome de arquivo do spec e não exigiu mudanças. Não há requisições de modelo, e portanto nenhum replay fixture do DeepSeek é necessário.

Com a chave manual-review desligada, o replay pela entrada formal do WDIO passou 9/9, com evidência em `packages/desktop/.e2e-artifacts/desktop-e2e-20260917-161817-410/summary.json`. O typecheck da raiz, o typecheck:e2e do desktop, o lint (baseline de 55 warnings / 0 errors) e a checagem de arquitetura passaram. Desta vez apenas esses 9 casos foram promovidos, sem incluir os casos de idioma de navegação e sem admissão em Docker/CI.

O fixture de inicialização do CTP-16 salva o ID de produto antigo, e a assinatura e o pricing devolvem o ID de produto atual; organização e projeto permanecem consistentes. Após cada estado e a recuperação por retentativa, as asserções garantem que “conexão indisponível” não aparece, cobrindo a regressão de restauração de navegação diante de mudança de produto da equipe. O isolamento de plataforma/organização/projeto é coberto por testes unitários de navegação.

Regressão de mudança de product ID em 2026-09-18: o replay em Electron nativo do macOS passou os três estados do CTP-16 (3/3), incluindo a recuperação por retentativa após a falha. Diretório de evidência: `packages/desktop/.e2e-artifacts/desktop-e2e-20260918-042734-046/`. Os testes unitários de navegação e visibilidade passaram 243/243; não houve replay do `/remote` real do celular e o Docker não foi usado.