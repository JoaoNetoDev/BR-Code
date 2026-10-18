# Casos E2E de Auth/Config do Desktop

## Todo103 G09: aceitação integrada com comportamento de login do staging fixo

Esta seção é o escopo da aceitação integrada; não cobre nem reescreve os registros históricos de execução abaixo.

| Caso | Origem e operação | Aceitação e limitações |
| --- | --- | --- |
| AUTH-05 | d17cb6a800; spec oficial oauth-login-failure-cancel.test.ts, entrega um state inválido via callback do preload | Após o Host real rejeitar o callback, a UI exibe apenas o bloco de falha; após cancelar, volta à lista de canais e a entrada de login não fecha. Preserva a identidade do caso oficial upstream; não é uma promoção arbitrária deste ciclo |
| AUTH-06 | a172e9c398 / 71a195b6be / f26d4e75fb; spec pendente access-token-401-auto-logout.test.ts | O HTTP case-local pausa o userinfo do Host real e então retorna 401; limpa o OAuth atual, preserva as credenciais de Bot, exibe o aviso de expiração apenas uma vez; confirma o emissão do RelaunchApp existente. O truncamento via IPC na verdade reinicia; não se faz passar por reinício real verificado |

Nenhum dos dois casos gera requisições de modelo; o manifest declara explicitamente providerRequestPolicy=none. O
business token/JWT do AUTH-06 são credenciais sintéticas com valores diferentes; os demais endpoints do plano de
controle retornam HTTP 200, evitando que o caminho de JWT expirado original masque a nova classificação de access
token. O mock apenas contabiliza se o token sintético foi atingido, sem outputting credenciais nos artefatos.
Testes de timing controlado no nível de serviço cobrem 401 tardio, escrita de refresh, candidatos duplicados e a
proteção de accountIdentity; os casos Electron não afirmam cobrir essas micro-condições de corrida. AUTH-06
permanece pending; verificação local no Pro não equivale a verificação no shared-host do celular / Windows em
todos os dispositivos; não houve Host novo nem alteração na cadeia continuous/replayable.

O registro de execução upstream do AUTH-06 será mantido como evidência histórica do staging fixo, não
contabilizado como aprovação deste branch; o resultado real deste ciclo é registrado no razão Todo103 G09.

Este documento registra os casos E2E oficiais de auth/config do desktop. O escopo cobre apenas cold start local
do desktop, restauração de sessão OAuth e limpeza de configuração local; não cobre `/remote` no celular, remote
workspace, restauração replayable nem callbacks reais do navegador OAuth.

Cada caso deve satisfazer:

- setup, action e assert independentes; não basta passar pelo caminho de login na inicialização para contar como cobertura.
- se não disparar requisições de modelo, o manifest deve declarar explicitamente `providerRequestPolicy: "none"`.
- se gravar configuração local via seed do WDIO, o documento deve informar o arquivo de seed e os limites de limpeza a verificar.

## AUTH-01: recuperação de cold start com credenciais OAuth corrompidas

### Definição do caso

| Campo             | Conteúdo                                                                                  |
| ---------------- | ------------------------------------------------------------------------------------- |
| Spec             | `packages/desktop/test/e2e/oauth-credential-recovery.test.ts`                         |
| Manifest do fixture | `packages/desktop/test/e2e/fixtures/cases/auth-config/oauth-credential-recovery.json` |
| Fixture de provider | Nenhum, `providerRequestPolicy: "none"`                                                   |
| Status atual         | Promovido, caso oficial de cold-start no caminho formal                                                      |

### Cenário de teste

O usuário tem um estado de login OAuth residual no `credentials.json` local, mas o `oauth:active_provider` therein é um texto cifrado que a máquina atual não consegue descriptografar. No cold start do desktop, a restauração de sessão OAuth não pode deixar a entrada de login num estado morto de "falha ao carregar / nenhum canal de login"; o sistema deve limpar o estado de login corrompido e exibir novamente os canais onde é possível fazer login.

Este caso verifica apenas "credenciais OAuth corrompidas -> recuperação no cold start -> canal de login visível -> estado de login corrompido limpo". Não cobre login web real, callback OAuth, refresh de token, fluxo de compra, remote workspace nem envio de modelo.

Limitação: AUTH-01 hoje cobre apenas o desktop local host; a recuperação de corrupção OAuth do remote workspace e do `/remote` no celular já é protegida por testes de regressão no nível de serviço; o caso E2E oficial de remote fica para complemento posterior.

### Passos de operação

1. O `beforeSession` do WDIO limpa o HOME isolado.
2. O `wdio.conf.ts`, ao identificar `oauth-credential-recovery.test.ts`, grava o seed OAuth corrompido em `~/.zcode/v2/credentials.json`.
3. Inicia a janela padrão local do desktop.
4. Aguarda a renderização da entrada de login.
5. Verifica se os canais de login Z.ai e BigModel estão visíveis.
6. Verifica se nenhum aviso de erro OAuth é exibido.
7. Lê o `credentials.json` do HOME isolado e confirma que o estado de login OAuth corrompido foi limpo.

### Itens de verificação

| Número    | Item de verificação               | Explicação de validade                                             | Local atual da asserção                                            |
| --------- | ------------------------- | --------------------------------------------------------------- | ----------------------------------------------------------- |
| AUTH-01-A | Entrada de login Z.ai visível         | Prova que `oauthService.getProviders()` não ficou indisponível por causa das credenciais corrompidas | `waitForTestIdByDom(testId(TID_OAUTH_LOGIN_BUTTON, "zai"))` |
| AUTH-01-B | Entrada de login BigModel visível     | Prova que os canais de login de múltiplos providers ainda exibem por completo                            | `waitForTestIdByDom(TID_OAUTH_LOGIN_BUTTON)`                |
| AUTH-01-C | Nenhum aviso de erro OAuth na página de login | Prova que credenciais corrompidas são tratadas como estado de login recuperável, sem expor ao usuário o erro de descriptografia | `expectNoOAuthErrorAlert()`                                 |
| AUTH-01-D | Credenciais corrompidas relacionadas a OAuth são limpas  | Prova que o próximo start não continuará travado no mesmo estado inválido                        | `waitForCorruptOAuthCredentialsCleanup()`                   |

### Contrato do fixture

- Este caso não dispara requisições de provider; o manifest usa `providerRequestPolicy: "none"` e `requests` vazio.
- O fixture de entrada deste caso é o seed de cold start do WDIO: `~/.zcode/v2/credentials.json`.
- As keys a limpar incluem `oauth:active_provider`, access token e refresh token de Z.ai/BigModel, user info e o antigo `zcodejwttoken`.

### Nota de promoção

Este spec já está no caminho formal `packages/desktop/test/e2e/oauth-credential-recovery.test.ts`, é coletado pelo `./test/e2e/**/*.test.ts` padrão e não fica sob `manual-review/pending`. Portanto o fluxo de movimentação de `promote-conversation-e2e.mjs` não é executado; esta promoção completa o manifest oficial e a documentação de cobertura de auth/config.

### Conclusão da verificação real

Executado em 2026-07-09:

- `pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/oauth-credential-recovery.test.ts`
  - Resultado: aprovado, 1 spec / 1 case passed.
  - Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260709-042306-597/summary.md`.
  - Conclusão: no cold start com credenciais OAuth que não podem ser descriptografadas, os canais de login Z.ai e BigModel ficam visíveis, a página não mostra aviso de erro OAuth e o estado de login corrompido é limpo.

A admissão em Docker não é executada: este caso não depende de replay de provider nem pertence ao preset Docker de conversation.

## AUTH-02: portão de readiness de provider e recuperação

### Definição do caso

| Campo             | Conteúdo                                                                                         |
| ---------------- | -------------------------------------------------------------------------------------------- |
| Spec             | `packages/desktop/test/e2e/provider-readiness-agent-startup.test.ts`                         |
| Manifest do fixture | `packages/desktop/test/e2e/fixtures/cases/auth-config/provider-readiness-agent-startup.json` |
| Fixture de provider | Nenhum, `providerRequestPolicy: "none"`                                                          |
| Status atual         | Promovido, caso oficial de cold-start no caminho formal                                                             |

### Cenário de teste

O desktop local faz cold start com HOME isolado; o session DB da CLI é pré-carregado com um histórico interativo, mas o usuário não tem login OAuth, API Key nem outro provider estruturalmente utilizável. Depois que a entrada de login termina de renderizar, o usuário pula temporariamente e entra no workspace padrão; o sessions-index deve iniciar sob demanda o único Agente de sessão somente-leitura, exibindo esse histórico real na barra lateral, e ao clicar é possível ler o corpo persistido, enquanto a home continua exibindo o banner `modelConfigMissing`. Quando o usuário cria um rascunho e tenta o primeiro envio, nenhum comando de session/model deve ser criado. Em seguida, ao reabrir a entrada de login/configuração de provider e salvar um provider habilitado, com Runtime Base URL, modelos não desabilitados e a credential necessária; o mesmo workspace deve reutilizar esse Agente, manter a contagem em 1, concluir a hidratação de modelo do rascunho e limpar o banner.

Este caso verifica apenas a readiness estrutural local, o limite de início de processo e a hidratação do rascunho; não envia prompt, não verifica conectividade de provider na rede e não cobre o Agente de gerenciamento de plugins/MCP. O remote workspace usa service/integration case para verificar os limites antes/depois do downlink do registry do desktop.

### Itens de verificação

| Número    | Item de verificação                                          | Explicação de validade                                                                                                                                                          |
| --------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| AUTH-02-A | Entrada de login/provider utilizável quando não configurado                  | `waitForTestIdByDom(TID_LOGIN_USE_API_KEY_BUTTON)`                                                                                                                  |
| AUTH-02-B | Após pular, a home do rascunho exibe o banner de modelo ausente                 | `TID_CHAT_ERROR_BANNER` ecoa "atualmente não há modelo disponível"                                                                                                                      |
| AUTH-02-C | Com nada configurado, o envio é rejeitado pela admission da UI            | o texto do composer é preservado; não há registro pending de `createSession` nem banner de recuperação unknown/discarded                                                                                   |
| AUTH-02-D | Com nada configurado, o histórico é visível e legível                          | a row da sessão interativa de CLI pré-carregada, o corpo do usuário e o corpo do assistente na barra lateral estão visíveis, provando que o sessions-index/topic de conversation real funciona                                                |
| AUTH-02-E | Sem configuração, não há deferred draft/retry               | testes focados de service/UI afirmam que `provider_not_ready` permanece idle e projeta o banner                                                                                          |
| AUTH-02-F | Sem configuração, o número de Agentes somente-leitura no workspace alvo é 1        | o snapshot do resource manager é afirmado como 1 pela workspace tag `ZCodeProject`; o sibling de conversation do sistema não conta, apenas leituras de sessions-index/history são permitidas, sem session create/model command |
| AUTH-02-G | Após salvar o provider, o único Agente do workspace alvo ainda é reutilizado | o número de linhas de Agentes do resource manager para o mesmo workspace permanece 1, e uma segunda asserção após a janela de estabilidade continua 1, sem reinício read→write duplicado                                                                      |
| AUTH-02-H | Modelo do rascunho hidratado e banner de modelo ausente removido                | o trigger de modelo ecoa o primeiro modelo não desabilitado, `TID_CHAT_ERROR_BANNER` deixa de existir                                                                                                   |

### Contrato do fixture

- o manifest usa `providerRequestPolicy: "none"` e `requests` vazio; o caso inteiro não gera requisições de modelo.
- O fixture de entrada grava apenas interactive session/message/part no SQLite do Agent CLI; não grava o `tasks-index` do App, e a membership da barra lateral deve ser criada pelo baseline real de sessions-index no cold start. O restante das entradas é o estado vazio de auth/provider do HOME isolado, além da configuração local de provider salva durante o teste pela entrada de login por API Key real.
- As asserções de processo leem o snapshot de processos da mesma origem do resource manager e do lifecycle registry do processo principal, sem usar asserções `pgrep`/`ps` que só funcionam em um único sistema operacional.

### Conclusão da verificação real

Executado em 2026-07-20:

- `pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/provider-readiness-agent-startup.test.ts`
  - Resultado: aprovado, 1 spec / 1 case passed.
  - Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260720121301941-p51454-824198917812e029/summary.md`.
  - Captura de provider: `records` de `upstream-provider.json` está vazio, conforme `providerRequestPolicy: "none"`.
  - Conclusão: no cold start com provider vazio o histórico real é visível e pode ser aberto para leitura, e o primeiro envio do novo rascunho continua sendo rejeitado pelo portão; após salvar o provider o Agente do mesmo workspace alvo é reutilizado e a hidratação de modelo é concluída.

A admissão em Docker não é executada: este caso de auth/config não depende de replay de provider nem pertence ao preset Docker de conversation.

## AUTH-03: reautenticação após expiração do ZCode JWT

### Definição do caso

| Campo             | Conteúdo                                                                                    |
| ---------------- | --------------------------------------------------------------------------------------- |
| Spec             | `packages/desktop/test/e2e/manual-review/pending/jwt-expiry-reauthentication.test.ts`   |
| Manifest do fixture | `packages/desktop/test/e2e/fixtures/cases/auth-config/jwt-expiry-reauthentication.json` |
| Fixture de provider | Nenhum, `providerRequestPolicy: "none"`                                                     |
| Status atual         | Caso candidato, aguardando confirmação manual do aviso de expiração e da entrada de novo login para promoção                                     |

### Cenário de teste

O desktop local faz cold start com HOME isolado; o `credentials.json` é pré-carregado com uma sessão OAuth Z.ai completa em cache, além de um `zcodejwttoken` cujo `exp` é explicitamente anterior ao momento atual. Ao restaurar a sessão em cache, o Local Host deve primeiro limpar os fatos de autenticação inválidos, e só então notificar o renderer para exibir o aviso "login expirado"; quando o usuário clica em "fazer login novamente", ele vai direto para a página de login Welcome existente, sem passar por confirmação de logout ativo nem por relaunch do App.

Este caso verifica apenas a recuperação no cold start do desktop local e a interação de UI; não dispara callback OAuth real, refresh de token, requisições de provider/modelo, nem modifica remote workspace, `/remote` no celular ou estado realtime de task/session.

### Sequência de estado e operação

```text
WDIO cold start seed
  OAuth cache completo + JWT expirado
             |
             v
Local Host restoreCachedSessionState
             |
             +--> limpar antes active provider / token / user_info / JWT
             |
             v
renderer exibe AlertDialog "login expirado"
             |
             +--> ler credentials.json com o diálogo ainda aberto e confirmar a limpeza
             |
             v
Usuário clica em "fazer login novamente"
             |
             v
Welcome exibe entradas de login Z.ai + BigModel
```

### Itens de verificação

| Número    | Item de verificação                     | Explicação de validade                                                               |
| --------- | ----------------------------- | ------------------------------------------------------------------------ |
| AUTH-03-A | Título e descrição do aviso de expiração visíveis        | Prova que o `reauthentication-required` estruturado chegou ao renderer, em vez de restaurar um pseudo-login |
| AUTH-03-B | Credenciais já limpas antes da confirmação do aviso      | Prova que o AlertDialog não é o ponto bloqueante da limpeza dos fatos de autenticação                                |
| AUTH-03-C | Clique em "fazer login novamente" leva ao Welcome    | Prova que o usuário sai do estado expirado e volta ao fluxo de login existente, sem ficar preso num estado sem logout e sem re-login    |
| AUTH-03-D | Entradas de login Z.ai e BigModel visíveis | Prova que a página de reautenticação tem a capacidade completa de escolha de provider                                 |
| AUTH-03-E | Nenhuma confirmação de logout ativo é exibida            | Prova que a recuperação por expiração não entrou por engano no fluxo "confirmar desconexão" ou na segunda confirmação de sessão em execução               |

### Contrato do fixture

- o manifest usa `providerRequestPolicy: "none"`, `noProviderRequests: true` e `requests` vazio.
- O fixture de entrada é o `~/.zcode/v2/credentials.json` que o WDIO grava no HOME isolado antes do start do App.
- O JWT contém apenas header/payload/signature de teste; o `exp` do payload é fixado no passado e não depende da validade da assinatura.
- As keys a limpar incluem `oauth:active_provider`, access token e refresh token de Z.ai, user info e `zcodejwttoken`.
- Atualmente fica em `manual-review/pending`; só após a confirmação manual da interação visual pode ser movido para o caminho formal e o status desta seção atualizado.

### Conclusão da execução automática

Executado em 2026-08-06:

- `ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/manual-review/pending/jwt-expiry-reauthentication.test.ts`
  - Resultado: aprovado, 1 spec / 1 case passed.
  - Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260806040559238-p94707-95e800e8762670fe/summary.md`.
  - Achado e correção durante a execução: o `open=false` do portão de início de provider já zerava `session-expired` incondicionalmente, fazendo com que a página de novo login, após a confirmação do usuário, fosse sobrescrita pelo workspace; agora o portão só fecha o `startup-provider-required` que ele próprio possui.
  - A captura de provider não tem requisições de modelo, conforme `providerRequestPolicy: "none"`.

Apenas a execução automática foi concluída; como a aceitação visual manual ainda não foi registrada, o caso continua em `manual-review/pending`, sem promoção nem admissão em Docker.

<!-- O cenário JWT do staging fixo tinha numeração original AUTH-05, conflitando com o número de cancelamento de login acima; aqui é nomeado AUTH-JWT-401, e a evidência histórica não conta como aprovação deste ciclo. -->
## AUTH-JWT-401: logout e reinício por 401 de ZCode JWT em execução

### Definição do caso

| Campo             | Conteúdo                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| Spec             | `packages/desktop/test/e2e/manual-review/pending/jwt-401-auto-logout.test.ts`   |
| Manifest do fixture | `packages/desktop/test/e2e/fixtures/cases/auth-config/jwt-401-auto-logout.json` |
| Fixture de provider | Nenhum, `providerRequestPolicy: "none"`                                             |
| Status atual         | Caso candidato, aguardando confirmação manual do aviso disparado por 401, da limpeza de credenciais e da ação de reinício para promoção                  |

### Cenário de teste

O desktop local faz cold start com HOME isolado e restaura uma sessão OAuth válida. Depois de entrar no workspace, o teste usa um mock de rede do Electron para fazer com que as requisições subsequentes do plano de controle ZCode retornem HTTP 401 comum; o Authorization carried pela requisição é igual ao `zcodejwttoken` local e, portanto, deve disparar o logout unificado do Host, em vez de exibir um erro de rede comum. O teste afirma que as credenciais foram limpas antes da confirmação do aviso e que, após a confirmação do usuário, o `RelaunchApp` existente é chamado, evitando encerrar de fato o processo de teste.

Este caso verifica apenas a observação da invalidação por 401 no desktop local em execução, a limpeza de credenciais, o aviso e o comando de reinício; não cobre revoke real, transport de modelo do Agente, Official MCP, remote workspace nem `/remote` no celular.

### Sequência de estado e operação

```text
Sessão OAuth válida + zcodejwttoken
             |
             v
Abrir as configurações de modelo do provider e disparar uma requisição ZCode
             |
             v
mock do Electron net.fetch retorna 401
             |
             v
Host compara o JWT atual -> logout limpa credenciais -> transmite evento de invalidação
             |
             v
Renderer exibe "login expirado"
             |
             +--> antes da confirmação: credentials.json já não tem key OAuth/JWT
             |
             v
Usuário confirma -> DesktopCommandIds.RelaunchApp
```

### Itens de verificação

| Número    | Item de verificação                        | Explicação de validade                                            |
| --------- | ------------------------------ | ----------------------------------------------------- |
| AUTH-JWT-401-A | Um 401 em execução consegue exibir o aviso de login expirado  | Prova que a observância no egresso da requisição e a cadeia de transmissão do Host funcionam de fato              |
| AUTH-JWT-401-B | Credenciais OAuth/JWT limpas antes da confirmação    | Prova que a caixa de aviso não bloqueia a limpeza dos fatos de autenticação                        |
| AUTH-JWT-401-C | `RelaunchApp` é chamado após a confirmação       | Prova que a ação do aviso reutiliza o fluxo de reinício existente                          |
| AUTH-JWT-401-D | O mock de 401 comum não depende de cabeçalho de resposta dedicado | Prova compatibilidade com serviços que hoje não têm o cabeçalho de resposta `X-ZCode-JWT-Invalid` |

### Contrato do fixture

- o manifest usa `providerRequestPolicy: "none"`, `noProviderRequests: true` e `requests` vazio.
- O fixture de entrada é o seed de credenciais de partida do E2E padrão; o 401 em execução é injetado por um mock do `net.fetch` do Electron, sem acessar serviços reais.
- O mock retorna apenas status e flag de sucesso, sem registrar nem expor valores de Authorization/JWT.
- Atualmente fica em `manual-review/pending`; a promoção acontece só após a confirmação manual, sem admissão em Docker.

## AUTH-04: prontidão da seleção de modelo Coding Plan de Subagent após login

### Definição do caso

| Campo             | Conteúdo                                                                                                     |
| ---------------- | -------------------------------------------------------------------------------------------------------- |
| Spec             | `packages/desktop/test/e2e/subagent-coding-plan-login-catalog-stale.test.ts`                             |
| Manifest do fixture | `packages/desktop/test/e2e/fixtures/cases/auth-config/subagent-coding-plan-login-catalog-stale.json`     |
| Fixture de provider | Sem requisições de modelo; OAuth, `release/latest`, `client/configs`, planos e API key são fixados por mock HTTP case-local |
| Status atual         | Promovido, caso oficial de usabilidade de UI após login e readiness da Seleção de Modelo do Environment atual                             |

### Cenário de teste

O desktop local faz cold start com HOME isolado: as credenciais OAuth estão vazias e o Environment atual é pré-carregado com um modelo DeepSeek customizado com faixa de reasoning. O usuário completa o OAuth da BigModel pelo Welcome; após o callback, o Account Overlay e o Provider Runtime do Environment atual são atualizados, colocando `builtin:bigmodel-coding-plan/GLM-5.2` na Model Selection View. Sem reiniciar e sem salvar manualmente o Provider, o usuário abre direto as configurações de Subagent e, na mesma linha `general-purpose`, seleciona o modelo customizado e depois o modelo Coding Plan embutido.

Este caso também lê os `configOptions` de workspace expostos pelo renderer, evitando adivinhar o estado de capacidade apenas pelo texto. `configOptions` é a projeção de sessão da Model Selection View do Environment atual, não uma segunda Provider Registry mantida pelo Desktop e empurrada ao Worker. O caso observa apenas a cadeia local desktop `desktop-continuous`, não modifica a implementação de negócio e não dispara os limites de restauração replayable do `/remote` no celular.

### Sequência de estado e operação

```text
cold start com HOME isolado
  OAuth sem login; Environment atual só com DeepSeek customizado
                 |
                 v
Usuário clica em login BigModel ----> callback OAuth
                 |                |
                 |                +--> setUser, App/workspace começam a montar
                 |                +--> Account Overlay é atualizado
                 |                +--> Registry do Environment atual é reconstruído
                 |                                  |
                 v                                  v
Abre direto as configurações de Subagent       GLM-5.2 aparece na Model Selection View
                 |                                               |
                 +----------------+-----------------+
                                  |
                                  v
                    projeção workspace configOptions pronta
                 |
                                  +--> DeepSeek customizado: effort selecionável
                                  `--> Coding Plan GLM-5.2: effort exibido sem reiniciar
```

Na cadeia de defeito, o callback OAuth já havia concluído, mas o estado dos `configOptions` do workspace ainda não convergira, e o Subagent tratava readiness como um portão de UI, carregando indefinidamente. A fronteira atual é: os fatos de Provider e Model são produzidos pela Effective Config e pelo Registry do Environment atual; o renderer apenas consome a Model Selection View e sua projeção de sessão, e não mantém um snapshot de App que possa sobrescrever o Registry em sentido inverso. O E2E verifica separadamente a usabilidade dos controles após o login e o fato de os `configOptions` do workspace acabarem em `ready` contendo a faixa de reasoning do Coding Plan.

### Itens de verificação

| Número    | Item de verificação                                    | Explicação de validade                                                           |
| --------- | -------------------------------------------- | -------------------------------------------------------------------- |
| AUTH-04-A | OAuth token, user info e configuração do Coding Plan concluídos | Exclui o loading transitório causado por "o callback de login ainda não terminou"                             |
| AUTH-04-B | GLM-5.2 reasoning aparece na Model Selection View | Prova que as restrições de conta e a configuração de modelo do Environment atual já estão em vigor                    |
| AUTH-04-C | A projeção do workspace converge a partir do estado não pronto               | Prova que a UI não fica permanentemente bloqueada pelo estado transitório de `configOptionsStatus`            |
| AUTH-04-D | Effort do DeepSeek customizado é selecionável                  | Prova que uma capacidade explícita já existente no Runtime continua acionando corretamente os controles de Subagent                    |
| AUTH-04-E | Effort do Coding Plan disponível sem reiniciar            | Prova que o Account Overlay e a atualização da Model Selection após o login podem ser observados na página atual |
| AUTH-04-F | `configOptions` exibe finalmente GLM-5.2 high/max    | Prova de forma independente que o Registry Host/Worker do Environment atual e a projeção de sessão terminam consistentes  |

### Contrato e fronteiras do fixture

- o manifest usa `providerRequestPolicy: "none"` e `noProviderRequests: true`, e não envia requisições a providers de modelo.
- O mock HTTP compartilhado do Coding Plan redefine o case mode conforme o spec de worker atual em cada `beforeSession`; só este spec habilita as respostas de OAuth token, `/api/v2/releases/latest`, `/api/v1/client/configs` e do saldo do Start Plan. Os demais casos E2E de Coding Plan executados depois restauram primeiro o modo padrão e não herdam esse comportamento de diretório nem o estado do OAuth.
- No caminho de polling OAuth do Desktop, o mock case-local fixa a resposta do flow `/api/v1/oauth/cli/init`, e `/api/v1/oauth/cli/poll/:flowId` permanece pending; o caso continua concluindo o login via deep link, evitando acoplar a semântica de conclusão do polling às asserções de catálogo deste caso.
- `release/latest` retorna um `config_version` diferente antes e depois do login; o `client/configs` versionado retorna um catálogo imutável conforme a versão solicitada, evitando que um cache antigo do cliente seja substituído silenciosamente pelo catálogo atual por causa do estado OAuth.
- `client/configs` entrega de forma fixa `builtin:bigmodel-coding-plan/GLM-5.2` e os metadados de reasoning de três faixas: `high`, `max` e `nothink`.
- O caso atual afirma separadamente a usabilidade da UI após o login e a consistência final da projeção de sessão da Model Selection do Environment atual; o spec oficial é coletado pelo diretório raiz padrão do desktop E2E, e a matriz é marcada como covered.

### Registros de execução automática

- `ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop test:e2e:serial -- --spec ./test/e2e/manual-review/pending/subagent-coding-plan-login-catalog-stale.test.ts`
  - Resultado: aprovado, 1 spec / 1 case passed.
  - Evidência de runtime: `workspace/readState` retorna `modelCount=5`, o catálogo de workspace do renderer contém `builtin:bigmodel-coding-plan/GLM-5.2` e suas faixas de reasoning, e o controle de effort do Subagent está supported.
  - Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260819-070650-011/summary.md`.
  - A captura de provider não tem requisições de modelo, conforme `providerRequestPolicy: "none"`.
- Regressão isolada: na mesma execução do WDIO, AUTH-04 é executado primeiro e depois `coding-plan-team-usage.test.ts`.
  - Resultado: aprovado, 2 specs / 19 cases passed; os 18 casos comuns de Coding Plan seguintes restauraram todos o estado padrão do mock de Team Plan.
  - Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260819-102158-548/summary.md`.
- Após a promoção, no caminho formal: `pnpm --filter @zcode/desktop test:e2e:serial -- --spec ./test/e2e/subagent-coding-plan-login-catalog-stale.test.ts`
  - Resultado: aprovado, 1 spec / 1 case passed; taxa de aprovação na primeira execução 100%, sem flaky nem falha de infra.
  - Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260819-103737-817/summary.md`.
- Reexecução do caminho formal após as otimizações de review: usa `config_version` diferente antes e depois do login, mantendo o catálogo versionado imutável.
  - Resultado: aprovado, 1 spec / 1 case passed; taxa de aprovação na primeira execução 100%, sem flaky nem falha de infra.
  - Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260819-114837-011/summary.md`.
- 2026-08-27: após o merge de `origin/staging` e a adaptação do mock de polling OAuth do Desktop, nova execução do caminho formal: enquanto o catálogo permanece `loading` e sem GLM-5.2, verifica primeiro que os controles estão supported, depois muda para `ready` e espera o catálogo de runtime mostrar o Coding Plan `high` / `max`.
  - Resultado: aprovado, 1 spec / 1 case passed; sem provider request.
  - Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260827-103453-349/summary.md`.

### Nota de promoção

Este caso foi movido de `manual-review/pending` para o caminho formal. Ele não envia requisições de modelo, não depende de replay de provider nem pertence ao preset Docker de conversation; a admissão oficial tem como fronteira o `providerRequestPolicy: "none"` do manifest do caso, a execução local no caminho formal e a coleta pelo desktop E2E padrão.

<!-- O cenário AUTH-06 abaixo e seus registros de execução vêm do staging fixo; os números de execução não são resultados do ciclo Todo103. -->
## AUTH-06: reutilização do aviso de logout para 401 HTTP/de negócio do access token de perfil

- Spec candidato: `packages/desktop/test/e2e/manual-review/pending/access-token-401-auto-logout.test.ts`.
- Manifest: `packages/desktop/test/e2e/fixtures/cases/auth-config/access-token-401-auto-logout.json`.
- Entradas: cache de perfil antigo da BigModel no HOME isolado, business access token com valor diferente do cache, ZCode JWT não considerado expirado e uma credencial de Bot separada.
- Ação: a migração de perfil dispara de fato uma requisição de userinfo no start; o fixture HTTP local pausa a resposta e, quando a UI fica disponível, retorna HTTP 401, ou, via `ZCODE_E2E_AUTH_EXPIRY_HTTP_STATUS=200`, retorna HTTP 200 + `{"code":401,"msg":"登录状态已过期","success":false}`. O caso confirma qual código de status o fixture de fato habilitou; as demais requisições do plano de controle retornam 200 normal, evitando que um 401 de JWT masque o novo julgamento.
- Asserções: o fixture confirma que a requisição usou o business token; o diálogo de expiração original aparece; antes da confirmação, active/token/profile/JWT já foram limpos e a credencial de Bot foi preservada; após a confirmação, o comando RelaunchApp original é emitido via preload. O teste intercepta o comando no limite de IPC do processo principal, sem executar de fato a saída/reinício, evitando que a barreira de encerramento do Host interfira no fechamento do WebDriver.
- O fixture HTTP não registra credenciais em texto puro; não acessa a plataforma real e não precisa de requisições de modelo. Pagamento, API key, requisições antigas e julgamento multiplataforma são cobertos por testes unitários do nível de serviço.
- A cadeia HTTP/Host/Renderer do desktop local deve passar na execução automática; enquanto a aceitação manual, o shared-host do celular e a regressão de UI multiplataforma não estiverem concluídos, o caso permanece pending e não se reivindica validação multidevice completa.

```text
cache antigo isolado -> requisição de userinfo em segundo plano -> fixture pausa
                                      |
                             teste libera HTTP 401
                                      |
                     access token atual corresponde -> logout original
                                      |
                  limpar credenciais -> diálogo -> confirmar reinício
```

### Registro de verificação automática do AUTH-06 (2026-09-08)

- No nível de serviço, primeiro foram reproduzidas 4 falhas no julgamento original de JWT; após a inclusão do casamento, a classificação de credenciais e as regressões do API client existente tiveram 41 testes aprovados, e mais 4 regressões de logout/migração de perfil originais passaram.
- O E2E Electron terminou com 1/1 aprovado, run id `desktop-e2e-20260908035743975-p37710-5701199aa046d5f2`. A última execução ajustou apenas o ponto de truncamento IPC do teste, reutilizando artefatos da mesma build do código-fonte de negócio anterior (`ZCODE_E2E_SKIP_BUILD=1 ZCODE_E2E_SKIP_AGENT_BUILD=1`).
- A primeira rodada de typecheck paralelo, cobrindo a saída de build do Host, causou falha no start; executando separado, foi identificado que o mock de reinício do teste ainda executava a barreira de encerramento do Host, provocando timeout no fechamento do WebDriver; após registrar o comando no limite de IPC, tudo passou. A implementação de negócio não foi ampliada por esses problemas de ambiente de teste.
- `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e` e `pnpm lint` passaram; o lint tem 43 avisos preexistentes, e a checagem específica dos arquivos novos ficou em 0 avisos / 0 erros.
- O fixture checker atual não suporta spec pending de auth/config, e o comando retorna que esse diretório não é suportado; esse resultado não é contado como verificação de fixture aprovada.
- macOS arm64, runner de teste Node 24.12.0, Electron 41.0.3 com Node 24.14.0 embutido. Não foram verificadas respostas de invalidação da plataforma real, Windows/Linux, UI do shared-host do celular ou aceitação visual manual.

## Migração da configuração de ajuda HC-01～HC-05

Casos oficiais: `help-client-config.test.ts` (8 casos), cuja promoção já foi autorizada por usuário na origem staging e que preserva a coleta pelo desktop E2E padrão.
Cobre o menu de ajuda real, os links em chinês e inglês, o cache de sucesso, o valor padrão no mesmo idioma, o diálogo de feedback embutido, o endereço de feedback entre endpoints,
a recuperação de falhas HTTP/de negócio/JSON, além do comportamento do cache HTTP após recarregar o Chromium em tela estreita.
Usa fixture HTTP case-local; sem requisições de modelo. A verificação histórica não conta como aprovação deste ciclo.
A matriz de cobertura detalhada, o pruning e o contrato do fixture estão em [Verificação da configuração de ajuda](help-client-config-e2e.md).
A evidência de execução do ciclo Todo103 está registrada no razão de integração do staging.

### Complemento de regressão AUTH-06 SG-01 (2026-09-09)

- Nível de serviço: leitura de credenciais controlada e escrita de refresh, cobrindo "após a classificação inicial ler o token antigo, o token da mesma plataforma já foi atualizado", o logout condicional na fila e a proibição de que um refresh expirado revive uma sessão encerrada.
- Electron: reexecução do AUTH-06 isolado existente, verificando que o 401 de userinfo do Host real para o token atual ainda completa a limpeza original de credenciais, o Bot independente, o aviso único e o comando de reinício após confirmação. A corrida precisa de leitura/enfileiramento é coberta pelos testes de serviço acima e não foi registrada como cobertura de cenário concorrente do Electron.
- Reutiliza o caso pending existente e credenciais sintéticas, sem usar a plataforma real nem arquivos do usuário.
- Verificação final: `pnpm exec vitest run packages/services/test/oauthUnauthorizedLogout.test.ts packages/services/test/oauthUnauthorizedRequest.test.ts packages/services/test/nodeApiClient.test.ts packages/services/test/nodeApiClientEndpoint.test.ts packages/services/test/oauthService.test.ts`: 148/148 aprovados, incluindo 9 novas regressões de corrida/notificação.
- `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm lint` e `pnpm architecture:check --changed` passaram; o lint ficou em 46 avisos preexistentes e 0 erros.
- `ZCODE_E2E_MANUAL_REVIEW=1 pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/manual-review/pending/access-token-401-auto-logout.test.ts`: após reconstruir App/Agent com o código final, 1/1 aprovado, sem skip de build. Artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260909071607852-p66392-b7f49a248cd9bd36/summary.json`.
- macOS arm64; mantém a interceptação IPC existente para verificar o comando RelaunchApp, sem executar reinício real de processo. Shared-host do celular, Windows/Linux e respostas reais da plataforma não foram reexecutados.

- Após a checagem de baseline de revisão, houve rebase para `a1fcf91ec11ab34d263b6347bc704b5dd09ac016`; o conflito do WDIO manteve os dois pontos de entrada habilitados por caso: a nova fixture de validação segura e a fixture de autenticação. Após o rebase, os 148 testes unitários acima, o typecheck, o typecheck de E2E, o lint e a checagem de arquitetura passaram de novo; após reconstruir App/Agent, o AUTH-06 ficou 1/1 aprovado. Artefato mais recente: `packages/desktop/.e2e-artifacts/desktop-e2e-20260909072706868-p75427-b55cce637bf05b15/summary.json`.

### Regressão de configuração de URL do AUTH-06 CR-01 (2026-09-09)

- Foram adicionados 25 testes de fronteira de URL: configurações BigModel/ZAI inválidas, relativas, não HTTP(S) e em branco; candidato ruim não afeta candidatos válidos; requisição inválida e todos os candidatos inválidos; configuração irrelevante não participa da classificação de userinfo; o branch original de JWT continua compatível. Antes da implementação, 13 deles falhavam; após a correção, os testes do classificador ficaram 51/51 e os cinco arquivos de teste de serviço acima somaram 173/173 aprovados.
- Executou-se um probe com credenciais sintéticas usando o NodeApiClient/helper reais: base de negócio inválida + userinfo válido, e userinfo inválido + customerInfo válido, preservaram ambos HTTP 401 e dispararam uma vez cada o callback de invalidação. Nenhuma requisição à plataforma real e nenhuma leitura de credenciais do usuário.
- `pnpm typecheck` (incluindo Desktop E2E), `pnpm lint` (46 avisos preexistentes, 0 erros) e `pnpm architecture:check -- --changed` (0 violations) passaram.
- Após reconstruir App/Agent e executar o comando do AUTH-06 acima, 1/1 aprovado; artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260909081228959-p89316-72990aef331d8ad0/summary.json`. Os branches de configuração anômala são cobertos por testes de serviço, e o Electron verifica a cadeia de interação de 401 normal; mantêm-se as fronteiras de pending, macOS e interceptação IPC de reinício acima; shared-host do celular/Windows/Linux não foram reexecutados.

### AUTH-06: regressão de 401 de negócio com HTTP 200 (2026-10-08)

- Motivo: a expiração de login de negócio retorna HTTP 200 + JSON com code numérico 401, e o observador de requisições antigas não entrava na cadeia de logout e aviso de reinício. Identidade, preço corporativo e detalhes da assinatura de equipe reutilizam a mesma lista de credenciais atuais e a reavaliação da fila de sessões.
- 8 arquivos de teste de serviço relacionados passaram 260/260; cobrem os três endpoints de BigModel/ZAI, concorrência com limpeza/notificação apenas uma vez, respostas antigas não limpando a sessão nova após novo login/refresh, corpo da resposta original legível, corpo vazio/corrompido e SSE sem falso positivo.
- `pnpm typecheck`, `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm lint` (68 avisos preexistentes de outros arquivos, 0 erros), `pnpm architecture:check --changed` (0 violations) e a checagem de formatação do código alterado passaram.
- O replay pending exige passar explicitamente `E2E_PROVIDER_HTTP_MODE=replay` e `E2E_PROVIDER_REPLAY_FIXTURE_PATH=packages/desktop/test/e2e/fixtures/upstream/common.json` e então rodar este caso com `ZCODE_E2E_AUTH_EXPIRY_HTTP_STATUS=200` ou `401`; sem requisições de modelo. O fixture checker hoje só suporta conversation-session/plugin e não suporta este caminho auth-config; o manifest do AUTH-06 mantém a declaração de ausência de requisições de modelo.
- HTTP 200 + 401 de negócio: após reconstruir App/Agent, 1/1 aprovado; artefato `packages/desktop/.e2e-artifacts/desktop-e2e-20261008081902034-p54677-f19c52bf23b72057/summary.json`.
- HTTP 401: reutilizando o artefato do App da execução anterior com o mesmo código-fonte (`ZCODE_E2E_SKIP_BUILD=1`) e reconstruindo o Agent, 1/1 aprovado; artefato `packages/desktop/.e2e-artifacts/desktop-e2e-20261008082005216-p55748-74de9060da312d0b/summary.json`.
- Ambas verificaram a limpeza de credenciais antes da confirmação, a preservação das credenciais de Bot, o diálogo de expiração original único e o comando RelaunchApp após a confirmação. Reutiliza-se a interceptação IPC, sem reivindicar reinício real de processo; verificado em macOS arm64, com shared-host do celular e Windows/Linux sem regressão em máquina real. Reutiliza a UI, a transmissão e a ação de reinício originais, sem alterar as fronteiras continuous/replayable; o caso permanece pending.

## HM-01～HM-04: entrada de aplicativo do menu de ajuda

O usuário confirmou a promoção em 2026-09-16. Casos oficiais `packages/desktop/test/e2e/help-menu-about.test.ts`, coletados pelo desktop E2E padrão na branch Preview; em production rodam separadamente com `ZCODE_E2E_HELP_MENU_FLAVOR=production` e a build de produção. HM-02 verifica separadamente o texto da ação e a pill de versão no estado de download concluído, e valida a versão novamente após fechar e reabrir. São 4 casos no total, cobrindo página de rascunho/página de configurações, janela "sobre" em chinês e inglês, estado de atualização e desabilitado/reabertura, recibo real de verificação de atualização no pacote de desenvolvimento e ocultação no Preview. Sem requisições de modelo e sem dependência de fixture de replay de provider; eventos de atualização sintéticos são usados apenas para exibição de estado no menu. A matriz completa e os comandos de execução estão em [Menu de ajuda do desktop](../windows-caption-help-menu.md).

## AUTH-07: corrida entre callback OAuth e conclusão por polling (pending)

- Spec: `packages/desktop/test/e2e/manual-review/pending/oauth-completion-race.test.ts`.
- Fixture: `helpers/oauth-completion-race-fixture.ts` sobe HTTP local; após o init, o Host real faz polling;
  o callback do preload inicia a troca de token e fica suspenso, e o token HTTP 500 só é liberado depois que o poll ready retorna.
- Primeiro suspende uma troca e cancela pela UI, liberando depois a resposta de sucesso da troca; espera o callback do Host concluir e confirma que não há login e nem erro, e então inicia o login novamente.
- Asserções: o cliente continua logando com as credenciais de polling, o painel de login sai, não há aviso de falha e os parâmetros de atribuição são preservados;
  em seguida, entrega um callback tardio com o mesmo state, a atribuição é atualizada e o número de requisições de token continua 1.
- Sem requisições de modelo e sem login real de terceiro. A abertura do navegador é interceptada por mock do Electron, e o serviço OAuth do Host permanece real.
- As duas ordens de chegada, a dupla falha, o cancelamento e a resposta antiga são cobertos por testes de Promise controlados no nível de serviço; este E2E cobre apenas o fallback visível ao usuário no desktop local e não reivindica cobertura do shared-host do celular ou do Windows. Permanece pending, aguardando revisão manual.

### Verificação do AUTH-07 nesta rodada (2026-09-17, macOS)

- E2E Electron: aprovado; artefato com run id `desktop-e2e-20260917065456399-p21750-95ee455f2fa5007d`.
  Usou o artefato já construído nesta branch; a última reexecução só alterou o fixture, pulando builds repetidos de App/CLI.
- O log do Host confirma que, após o 500 em `/oauth/token`, `oauth.pollPendingOAuth` e `oauth.handleCallback` retornaram normalmente;
  asserções sobre o business token criptografado em disco, os campos de atribuição, a saída do painel de login e o fato de o callback tardio não trocar token novamente passaram.
- 109 testes do serviço OAuth e 38 testes de fronteira de UI/bridge passaram. Typecheck do nível de serviço e do E2E, lint e o portão de arquitetura passaram.
- O `pnpm typecheck` de todo o repositório foi bloqueado pela chave duplicada TS1117 do baseline em `packages/ui/src/i18n/locales/en-US.ts` e `zh-CN.ts`;
  esses dois arquivos não foram alterados nesta branch. O fixture checker hoje não suporta o diretório pending de auth-config,
  o manifest sem requisições de modelo foi mantido e nenhuma promoção/admissão em CI foi feita. Celular e Windows/Linux não foram testados.

### Regressão das sugestões do !2703 (2026-09-17, macOS)

- SG-01: o manifest aponta para o caminho real do spec pending.
- SG-02: o serviço declara callback anulável e o Root ignora resultados inválidos; um teste unitário reproduz o TypeError original e depois valida a correção.
  No E2E, primeiro cancela a troca suspensa e depois libera a resposta de sucesso, confirmando que as credenciais não foram substituídas e que não houve erro de login; em seguida, refaz o login para completar o cenário de fallback original.
- SG-03: quando os dois caminhos falham, o erro original de cada um é preservado, e as duas ordens de chegada são verificadas.
- SG-04: com relógio controlado, verifica que callbacks recebidos dentro da janela pending e após o sucesso ainda preservam a atribuição mesmo enfileirados por mais de 30 segundos, e que callbacks novos fora da janela são rejeitados; não foi adicionado julgamento de expiração por momento de processamento.
- 151 testes unitários relacionados passaram; typecheck de serviço/E2E, lint e portão de arquitetura passaram. O typecheck de todo o repositório continua tendo apenas o TS1117 de baseline acima.
- E2E Electron aprovado (1 caso), run id `desktop-e2e-20260917074228667-p30511-55b50bde685ed92b`.
  A primeira rodada reconstruiu o App, e após corrigir o caminho de log do teste e a asserção de conta pré-carregada a mesma build foi reutilizada na reexecução.

### Reverificação no baseline de staging mais recente

- Rebase para o `c7a795d2df` de `origin/staging`; a chave duplicada de tradução do baseline antigo não existe mais.
- `pnpm typecheck` de todo o repositório, lint (0 erros / 54 avisos), o portão de arquitetura e os 151 testes unitários relacionados passaram.
- Após reconstruir o App, o AUTH-07 passou, run id `desktop-e2e-20260917075008349-p32477-57ae7b5093a2bbd0`.

## PAT-KEY-UPGRADE: coexistência de login válido com uma Key antiga corrompida

Caso candidato: `packages/desktop/test/e2e/manual-review/pending/account-key-usage-scene.test.ts`.
Reutiliza o caso de recuperação Z.AI desse arquivo: no credentials.json do HOME isolado salva OAuth sintético válido e dados de conta, ao mesmo tempo em que o account-provider:*:api-key da mesma conta é escrito como texto cifrado corrompido; reinicia o Electron e exige que o workspace seja restaurado diretamente, com o Host criando uma Key dedicada de usageScene=1 e emitindo Token, sem chamar Copy, e o registro antigo corrompido permanece inalterado. O caso da BigModel cobre o caminho de criação/renovação sem Key antiga.
Este caso não dispara inferência de modelo; o HTTP é o mock local de Coding Plan já existente e não representa integração real com o backend. Os caminhos de celular/remoto são cobertos por testes de Provisioning e do serviço de autenticação, e esta rodada não reivindica E2E remoto em nível de dispositivo. Permanece pending, sem promoção automática.

Reteste automático desta rodada: 2026-09-23, 2 cases passed; artefato: `packages/desktop/.e2e-artifacts/desktop-e2e-20260923070315610-p85476-12717808333f5136/summary.md`. Nenhuma confirmação manual ou promoção foi feita; celular, backend real e remoto com versões misturadas não estão no escopo deste caso.