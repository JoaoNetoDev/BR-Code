# Login do Web Remote V2

`/remote/v4` (com barra final) é a única entrada oficial de OAuth/QR code do controle remoto pelo celular. O celular usa somente o Relay V2; `/web-remote`, seu callback e sua página de espera, além do bootstrap remoteControlToken/relayOrigin, foram removidos. O `/ws` e o `/ws/remote/:id` do Web + Server comuns permanecem inalterados.

## Entrada e autenticação

- `code` / `authCode` + `state` (ou OAuth `error` + `state`) têm precedência e renderizam a `WebCallbackPage` existente; o `WebAuthService` valida o nonce, troca o token, grava no localStorage de mesma origem e então faz replace para um `app_return_to` seguro.
- O endereço de callback OAuth tem como base o `/remote/v4` da origin do endpoint de build e preserva os parâmetros `app_version/sid/mid/name` da URL de controle remoto de mesma origem anterior ao login (inclusive valores vazios e nomes de dispositivo codificados). Não copia parâmetros desconhecidos, credenciais antigas, histórico de code/authCode/state/error nem fragment; o login compartilhado mantém seu endereço de callback separado. A Z.AI usa `redirect_uri`, a BigModel usa `redirect`, e a origin de autorização varia conforme o ambiente de build.
- Na initiation da autorização, o `WebAuthService` registra a tentativa de login atual (nonce, provider, endereço completo de callback) no localStorage de mesma origem por meio do `BrowserOAuthCredentialRepo`, distinguindo as tentativas por nonce. O callback retrieve apenas o registro correspondente ao nonce presente no state, apaga-o ao ser retirado e usa o provider e o endereço desse registro para trocar o token; quando não encontra o registro, relata falha de CSRF, não solicita token e não altera os demais registros. Não é permitido montar a URL da solicitação de token a partir de uma URL de callback que contenha os parâmetros de autorização. Razão e limites em [O callback cai em outra aba do mesmo navegador](#o-callback-cai-em-outra-aba-do-mesmo-navegador).
- Sem JWT, são exibidos os dois pontos de entrada OAuth Z.AI / BigModel, consistentes com o desktop (Z.AI primeiro, usando o mesmo ícone, texto de conexão e rótulos global/china do desktop), com a dica de usar a mesma plataforma e a mesma conta do computador. À esquerda do cabeçalho do cartão de login fica o ícone de logo do aplicativo em 40px (imagem decorativa), igual ao da barra de título do desktop; à direita, o texto de marca “ZCode” e o título. Não se usa mais o bloco de cor de destaque com a letra como placeholder. O cabeçalho da página de lista de dispositivos e o da página de placeholder do QR code usam a versão de 20px do mesmo logo, com o texto “ZCode”; ver [Layout da lista e wireframe de texto](./relay-v2-pairing.md#列表排布与文本线框). Após a seleção, os dois botões são desabilitados ao mesmo tempo, e o provider escolhido é passado à composição da entrada e entregue ao `WebAuthService` existente; o callback troca e salva as credenciais conforme o provider pendente. Não é adicionado um ponto de entrada por API Key, porque o controle remoto exige identidade de conta; o QR code não carrega credenciais nem infere a plataforma de login.
- Sem JWT, a página de login é renderizada; appReturnTo é a URL completa atual. O retorno seguro mantém apenas o `/remote/v4` e o `/remote/__test__` de mesma origem (ambos com barra final) e os caminhos de compartilhamento existentes; a allowlist de query é app_version/sid/mid/name.
- Com JWT e SID, solicita-se diretamente o terminal token e conecta-se ao V2; sem SID, lêem-se os dispositivos da conta atual, e, se o SID mais recente estiver online, conecta-se diretamente; se o SID mais recente não estiver online, mas a mesma máquina (MID mais recente) tiver exatamente uma conexão online, conecta-se a essa conexão; caso contrário, exibe-se a lista de dispositivos (regras em [Destino](./relay-v2-pairing.md#落点状态归属与刷新)). Dispositivos offline não são clicáveis; ao selecionar um dispositivo online, gravam-se sid/mid/name/app_version e conecta-se, com suporte ao acionamento manual e à atualização ao voltar para o primeiro plano. Sob o título da página de dispositivos são exibidos a conta e a plataforma do login atual; “Trocar” abre o diálogo de confirmação de troca de conta descrito abaixo.
- Um 401 de token limpa a sessão local e retorna ao gate de login, sem confirmação; a troca de conta manual feita pelo usuário exige confirmação antes, e então limpa a sessão preservando a URL atual. AUTH_FAILED não é tratado como erro de rede com retentativa infinita.

### Confirmação de troca de conta manual

O “Trocar conta” da página de lista de dispositivos e da página de falha `device-not-owned` compartilham um diálogo de confirmação centralizado. O título é “Trocar conta?”, a descrição é “Você sairá da conta atual do web no celular e voltará para a página de login. O computador continua logado.”, e as ações são “Cancelar” à esquerda e “Sair e trocar” à direita. Em inglês, são “Switch account?”, “You will sign out of this mobile web session and return to the sign-in page. Your computer will stay signed in.” e “Cancel” / “Sign out & switch”. Os botões usam estilos neutros primário e secundário, sem vermelho de perigo.

A abertura do diálogo pertence apenas ao Dialog do componente compartilhado de confirmação, sem duplicar o estado de autenticação; a UI expõe a primitiva Dialog existente pela subpath `@zcode/ui/dialog`, e a camada Web combina o texto desta funcionalidade com o botão gatilho, reutilizando `WebRemoteControlEntry.switchAccount()` no botão de confirmação. O foco padrão fica em Cancelar, com o foco restrito ao diálogo; clicar em Cancelar, no overlay ou pressionar Esc fecha o diálogo, e o foco retorna ao botão de entrada. Antes da confirmação, não se limpam credenciais, não se troca a visão da entrada e não se cancela a requisição da lista; depois da confirmação, vale a lógica original de saída e de preservação de URL. Caminhos de invalidação automática, como 401 e JWT ausente, não passam por este diálogo. Os limites de restauração do continuous do desktop e do replayable do celular permanecem inalterados.

```text
Entrada manual → Dialog abre (ainda logado)
             ├─ Cancelar / overlay / Esc → página original (ainda logado)
             └─ Sair e trocar → Entry.switchAccount → reset → auth.logout → página de login
Falha de auth ─────────────────→ Entry.switchAccount → reset → auth.logout → página de login
```

Aceitação: os dois pontos de entrada manuais cobrem abertura, cancelamento, overlay, Esc e confirmação; o cancelamento mantém credenciais, URL e página original, e a confirmação limpa as credenciais do web no celular, volta para a página de login e preserva a URL; 401 não exibe o diálogo. A verificação no navegador cobre 390px / 1024px, Zai Light / Zai Dark, chinês e inglês, checando a restauração de foco, a restrição de Tab, a alcançabilidade dos botões e a ausência de overflow horizontal. A regressão está em `webRemoteControlSwitchAccount.test.ts` e no pending `remote-login-v2.mjs` (MC01); evidência de navegador controlado não substitui a aceitação de OAuth em celular real.

2026-09-22 verificação local: 4 arquivos de teste unitário relacionados, 39 casos aprovados; 75 casos de regressão da entrada de login no navegador aprovados; após a separação do helper de confirmação, 16 configurações reexecutadas de forma isolada passaram, e o screenshot do diálogo sem a animação de entrada foi refeito. Screenshots e resultados item a item estão em `.tmp/remote-login-v2-e2e/`. typecheck, lint (60 warnings existentes / 0 errors), architecture, typecheck do E2E do desktop e a checagem de formatação do código modificado passaram; Web/UI ainda não entram na architecture gerenciada, e os limites são conferidos pelos componentes e pela regressão da entrada acima. Não foram executadas validações com celular real, OAuth real ou deploy em produção.

## Armazenamento e limites

O `BrowserOAuthCredentialRepo` é o único limite de storage da autenticação; continua usando zcodejwttoken, oauth:zai:access_token, oauth:zai:user_info, oauth:active_provider e as chaves independentes já existentes da BigModel; os registros de login em andamento usam `oauth_pending_logins`. Sessões residuais ou expiradas são tratadas como não logadas depois da limpeza; limpar as credenciais de login ou sair não apaga os registros de login em andamento. A composição de pré-condição lê o JWT pelo WebAuthService, sem duplicar o cache de autenticação; o token não é persistido e não entra em QR code, logs ou payload de negócio.

## Encaminhamento de callback de desenvolvimento

`VITE_DEV_ORIGIN=http://192.168.x.x:5173` grava o `/remote/v4` da rede privada em OAuth state.return_to e preserva o mesmo conjunto de parâmetros de controle remoto. O callback de deploy só é encaminhado quando há `VITE_WEB_REMOTE_ALLOW_DEV_RETURN_TO=true` explícito; o encaminhamento preserva os parâmetros da allowlist e acrescenta o code/error/state desta tentativa, e a validação de nonce e a troca de token acabam executadas na mesma origem que iniciou o login. O caminho de callback de compartilhamento existente continua suportado. O proxy exclusivo do Vite encaminha `/api/v1/oauth/token` e `/api/v1/remote` para o endpoint de build atual, antes do proxy comum de `/api`.

A sequência completa, o mapeamento de erros, a tabela de textos e a matriz de aceitação estão em [Primeiro acesso pelo celular e restauração no Relay V2](./relay-v2-pairing.md#手机首次进入与恢复05).

O `pnpm dev:web-remote-control` local preserva a base root do Vite, e o endereço padrão do QR code no desktop passa a ser `http://localhost:5173/remote/v4`; ao depurar no celular, aponte `ZCODE_WEB_REMOTE_CONTROL_URL` para o mesmo caminho acessível e configure o `VITE_DEV_ORIGIN` correspondente. Evite o alias `/remote`, que não está na allowlist de retorno do OAuth, para não perder o SID.

### Retorno de login da entrada de teste independente

A cadeia de recursos de teste preservada em `/remote/__test__` usa o mesmo gate de login. Ele é uma origem de login e um caminho de retorno permitidos, mas o callback OAuth continua sendo `/remote/v4`; a allowlist de callback da rede privada não é ampliada. Na initiation da autorização, preservam-se o app_version/sid/mid/name do link de teste, e, após o callback bem-sucedido, o caminho e os parâmetros de teste originais são restaurados. O novo login após a limpeza de sessão por 401 segue a mesma regra.

```text
Antes: QR code __test__ → login → origem rejeitada, callback sem parâmetros → safeReturn=null → /remote/v4
Depois: QR code __test__ → callback /remote/v4 com os parâmetros do QR code
                     → owner das credenciais originais valida o nonce, troca o token → link __test__ original → pareamento V2
```

Aceitação reaproveita ML04: `/remote/v4` e `/remote/__test__` × Z.AI/BigModel × 390px/1024px × primeiro login/relançamento após 401, afirmando que o callback de autorização real preserva os parâmetros, que a solicitação de token usa o redirect_uri original, que o retorno leva ao ponto de entrada original e que o pareamento é concluído. Os testes unitários cobrem também a barra final da entrada de teste, a rejeição de domínio externo e de caminho desconhecido, a remoção de query/fragment sensíveis e a não ampliação da allowlist de callback. O continuous do desktop, o replayable do celular e o owner de negócio permanecem inalterados.

O deploy dos recursos de teste continua exigindo que a página de callback de mesma origem `/remote/v4` contenha a regra desse caminho de retorno, e que o gateway carregue a versão correspondente. A regressão em navegador controlado não substitui a integração com a allowlist real de OAuth, o gateway e a imagem de teste.

2026-09-20 verificação local: antes da correção, 6 novos casos de regressão falhavam; depois, codec, WebAuthService e a composição da entrada passaram juntos, 3 arquivos e 50 casos; regressão pendente no navegador com 59 casos aprovados, incluindo as 16 configurações de login ML04 acima, com os resultados e 32 screenshots da entrada em `.tmp/remote-login-v2-e2e/`. typecheck, typecheck do E2E do desktop, lint (61 warnings / 0 errors), architecture e a checagem de formatação do código modificado passaram. Os testes usaram as dependências existentes (Vitest 4.1.4, lock em 4.1.7); não houve reinstalação das dependências travadas nem validação com OAuth real, aparelho real ou deploy.

## Regressão de login em duas plataformas

```text
Antes: página de login com um único botão → entrada não passa provider → WebAuthService usa zai por padrão
Depois: página de login escolhe zai / bigmodel → entrada passa provider + URL original do QR code
        → WebAuthService / BrowserOAuthCredentialRepo salvam nonce e pending provider
        → autorização na plataforma correspondente → owner original valida o callback e salva as credenciais → URL original do QR code → Relay valida a titularidade da conta
```

O owner das credenciais, as chaves de storage e a validação de nonce permanecem inalterados; a conexão, a restauração e o owner de negócio do continuous do desktop e do replayable do celular permanecem inalterados. O estado de login Web já existente continua utilizável, e a troca de conta e o 401 retornam ao mesmo gate de duas plataformas.

Aceitação reaproveita `packages/web/test/e2e/manual-review/pending/remote-login-v2.mjs`:

- 390px / 1024px × Zai Light / Zai Dark × chinês e inglês exibem as duas entradas, com ordem, nomes de plataforma e rótulos iguais aos do desktop.
- Cada uma das plataformas é validada em clique, parâmetros de autorização, pending provider, provider da solicitação de token, chave de credenciais independente, retorno ao endereço original do QR code e pareamento do terminal; a BigModel usa callback com authCode.
- Após falha de titularidade de conta, troca-se para a BigModel; após 401, a plataforma é escolhida novamente, preservando a URL original do dispositivo.
- Os testes de configuração de build cobrem o domínio de autorização da BigModel em test / production; a autorização real de terceiros e o QR code em aparelho real são integrados à parte, e a resposta local controlada não representa aceitação concluída em produção.

## O callback preserva os parâmetros do QR code

```text
Antes: URL versionada do QR code → WebAuthService → callback fixo /remote/v4 → gateway carrega latest
Depois: URL versionada do QR code → WebAuthService → callback com app_version/sid/mid/name
                       └→ BrowserOAuthCredentialRepo salva o endereço desta tentativa
       → gateway carrega a página conforme app_version → owner original valida o nonce → troca o token usando o endereço salvo
       → limpa o endereço pending → replace seguro do app_return_to → cadeia de pareamento V2 original
```

O caso de navegador ML04 é reutilizado: nas duas plataformas × celular/tela larga, o endereço de callback é obtido a partir da URL de autorização real, afirmando que os parâmetros do QR code são preservados por completo, que a navegação ocorre após acrescentar os parâmetros de autorização e que o redirect_uri da solicitação de token é conferido como idêntico ao da autorização. Os testes unitários complementam com Unicode/valores vazios, remoção de parâmetros desconhecidos e históricos de autorização, restauração entre páginas, falha de nonce, compatibilidade com sessões pending antigas e encaminhamento de rede privada. Esta mudança afeta apenas o OAuth do Web; o login do desktop, o continuous/replayable e o owner de negócio permanecem inalterados. Após o release, é preciso validar em aparelho real que as duas plataformas permitem e preservam endereços de callback com query; entradas sem app_version ainda dependem de latest, e isso não permite afirmar que recursos antigos em produção já foram corrigidos.

## O callback cai em outra aba do mesmo navegador

Alguns navegadores de celular, após o ida-e-volta do OAuth, não exibem a página de callback na aba que iniciou o login, ou a aba é recriada pelo sistema (por exemplo, ao trocar para um App de SMS para ler o código de verificação). O registro de login existia apenas no sessionStorage da aba que iniciou, então a página de callback não o encontrava e relatava “OAuth CSRF 检测失败” antes da troca de token; clicar em “Entrar novamente” continuava falhando no mesmo ambiente, e só outro navegador permitia concluir.

```text
Antes: Tab A grava sessionStorage[A].nonce=N → login no provider → callback cai na Tab B / na Tab A recriada
        → sessionStorage vazio → null≠N → falha de CSRF (não solicita token)
Depois: Tab A grava localStorage.oauth_pending_logins += {N, provider, redirectUri}
        → login no provider → callback cai em qualquer aba de mesma origem → retira e apaga o registro de N → troca o token → retorno seguro
```

- Os registros são distinguidos por nonce, e logins iniciados simultaneamente em várias abas não se sobrescrevem; no máximo as 5 mais recentes são mantidas, de modo que logins abandonados não se acumulam indefinidamente.
- O nonce continua aleatório, visível na mesma origem e utilizável apenas uma vez. Quando o nonce do state não encontra registro, o callback é rejeitado e os demais registros são preservados.
- Quando o callback cai em outro App de navegador, a rejeição permanece: aquele navegador não tem o registro deste login, o que é o resultado esperado da validação de CSRF.
- Não se lêem mais o `oauth_pending_nonce` / `oauth_pending_provider` / `oauth_pending_redirect_uri` que versões antigas gravavam no sessionStorage. O gateway carrega o mesmo diretório de versão para a aba que iniciou e para a página de callback conforme o `app_version`, e somente logins em andamento são afetados na troca de deploy; basta o usuário entrar novamente.

Aceitação: `browserOAuthCredentialRepo.test.ts` cobre a recuperação entre abas, a retirada apenas do nonce correspondente, a retirada com apagamento, o limite de itens e registros corrompidos; `webAuthService.test.ts` cobre a conclusão do login nas duas plataformas com sessionStorage vazio na página de callback, a ausência de solicitação de token quando o nonce não corresponde (com os registros preservados) e o login paralelo em duas abas concluindo de forma independente. A regressão `remote-login-v2.mjs` ML07 conclui o callback em uma nova aba do mesmo contexto de navegador, afirmando os parâmetros da solicitação de token, o retorno e o pareamento do terminal. Evidência de navegador controlado não substitui a aceitação em navegadores de celular reais.
