# 01 — Controle remoto Web com Relay V2: conectar o desktop após o login no celular

**O que construir:** Trocar a camada relay do controle remoto Web de V1 (registro anônimo + desafio/resposta nonce/HMAC com `pass_hash` no QR code) para o Relay V2 do zcode-server (registro de dispositivo via JWT + token de conexão único). Desktop e celular implementam apenas V2; o celular precisa estar logado com a mesma conta do desktop para escanear o QR code ou escolher o desktop na lista de dispositivos e entrar na cadeia existente de workspace bridge / `rpc-frame`. A página do celular continua publicada em `/remote/v4`, isolada das versões antigas do App pelo diretório de versão no OSS.

**Bloqueado por:** O desenvolvimento não é impedido. A publicação em produção é bloqueada pelos quatro itens de «Observações adicionais → Dependências externas».

**Status:** ready-for-agent

**Pai:** [Visão geral do controle remoto Web e arquitetura do Relay externo](../../web-remote-control/web-remote-control-architecture.md)

## Problema

- O Relay V2 do servidor já foi integrado ao `staging` do zcode-server e está em vigor no ambiente de testes; a entrada V1 virou um caminho legado controlado por `relay.disable_v1`. Até hoje o cliente só tem a implementação V1 — assim que o V1 for desligado, todas as versões do controle remoto Web deixam de funcionar.
- O modelo de segurança do V1 é "quem obtiver a URL do QR code controla o computador": o `pass_hash` aparece em texto claro na URL e não tem relação com a identidade do usuário. O celular não tem login e também não consegue saber "quais são os meus dispositivos".
- A entrada `/web-remote`, reservada em abril para "escolher o dispositivo após login no celular", nunca chegou a subir: em produção e em testes o gateway de borda redireciona tudo para o 404 do site oficial, e o endereço de callback do OAuth também ficou inválido.

## Solução

- Antes de iniciar o controle remoto, o desktop precisa já estar logado (ZAI ou BigModel, qualquer provider que emita o JWT do zcode). Na primeira inicialização, registra o dispositivo no servidor com o JWT e persiste o `device_sid`; antes de cada conexão, solicita um token único com `role=device` e conecta em `/api/v1/remote/ws2`.
- O QR code carrega apenas `app_version`, `sid`, `mid` e `name` — nenhum material de autenticação.
- Depois de abrir `/remote/v4`, o celular passa primeiro pela barreira de login; após o login bem-sucedido, com `sid` ele conecta direto no dispositivo, sem `sid` ele conecta no último dispositivo usado ou exibe a lista de dispositivos online da conta atual. Antes de cada conexão, solicita um token com `role=terminal`.
- O callback do OAuth volta direto para `/remote/v4` (a página reconhece `code`+`state`), o estado de login é gravado no localStorage de mesma origem e, em seguida, há o redirecionamento de volta para a URL original com todos os parâmetros.
- O payload do App sobre o relay, o workspace bridge, a fragmentação/ACK de `rpc-frame`, a recuperação replayable e o guard de sincronização de versão permanecem inalterados.

## Histórias de usuário

1. Como usuário do desktop, quero abrir a janela de controle remoto já logado e receber o QR code diretamente, para escanear e iniciar o controle remoto como antes.
2. Como usuário do desktop, quero ver a mensagem "é preciso fazer login primeiro" e o ponto de entrada de login ao abrir a janela de controle remoto sem sessão iniciada, para entender por que não recebo o QR code.
3. Como usuário do desktop, quero que o QR code não contenha mais nenhum segredo, para não vazar o controle do computador ao tirar print ou encaminhar o link.
4. Como usuário do desktop, quero que a intenção de "controle remoto já ativado" seja restaurada depois que o app reinicia, para não precisar reativar manualmente toda vez.
5. Como usuário do desktop, quero que o controle remoto pare num estado claro de "é preciso fazer login de novo" quando o estado de login expira, em vez de deslogar o app inteiro, para que o controle remoto se restaure automaticamente após o novo login.
6. Como usuário do desktop, quero que o controle remoto pare imediatamente ao deslogar dentro do app, para que ninguém mais continue controlando meu computador pela conexão antiga.
7. Como usuário do desktop, quero que o controle remoto registre o dispositivo de novo com a nova conta ao trocar de conta, para que o celular da conta nova conecte e o da conta antiga não.
8. Como usuário do desktop, quero que a identidade do dispositivo seja reconstruída ao trocar de endpoint (produção/testes), para não levar o sid do ambiente de testes para produção.
9. Como usuário do desktop, quero que a janela de controle remoto não mostre mais "atualizar QR code", para não achar que é preciso atualizar para o celular conectar.
10. Como usuário do desktop, quero continuar podendo "copiar link" para mandar ao celular, para entrar mesmo quando não for possível escanear.
11. Como usuário do celular, quero ver a página de login se eu escanear sem estar logado e voltar automaticamente ao dispositivo alvo do QR code depois de logar, para resolver todo o fluxo com uma única leitura.
12. Como usuário do celular, quero fazer login com ZAI ou BigModel, igual às opções disponíveis no desktop, para que a conta seja a mesma.
13. Como usuário do celular, quero conectar direto no dispositivo alvo ao escanear já logado, sem passar por nenhuma página intermediária, para a velocidade ser a mesma de hoje.
14. Como usuário do celular, quero poder fazer login e escolher meu computador pela lista ao abrir a página de controle remoto sem escanear, para usar mesmo com o computador longe ou o QR code inviável.
15. Como usuário do celular, quero que a lista de dispositivos coloque os online no topo e ordene por nome, e mostre os offline esmaecidos e não clicáveis, para achar de relance um computador conectável.
16. Como usuário do celular, quero atualizar a lista de dispositivos manualmente e também automaticamente ao voltar para o primeiro plano, para ver o computador recém-ligado aparecer online.
17. Como usuário do celular, quero que, ao abrir a página sem parâmetros, conecte primeiro no último computador usado (se estiver online), para não ter que escolher de novo ao recarregar ou reabrir.
18. Como usuário do celular, quero que a URL da barra de endereço carregue os parâmetros do dispositivo ao selecioná-lo na lista, para poder restaurar direto ao recarregar a página ou entrar pelo histórico.
19. Como usuário do celular, quero ver "este dispositivo não pertence à conta atual" e poder trocar de conta com um clique ao logar com a conta errada, para saber como agir.
20. Como usuário do celular, quero ser avisado quando o dispositivo alvo tiver sido removido e poder escolher outro, para não ficar preso numa página de erro.
21. Como usuário do celular, quero que a página se recupere sozinha quando o computador desconectar por pouco tempo ou o relay for publicado em rolling release, para não precisar recarregar manualmente.
22. Como usuário do celular, quero ser levado de volta à página de login quando o estado de login expirar e retornar ao ponto original depois de logar, para que a interrupção seja mínima.
23. Como usuário do celular, quero que o aparelho pare de reconectar e exiba um aviso claro quando outro celular assumir a conexão, para que os dois não fiquem expulsando um ao outro.
24. Como usuário do celular, quero que a lista de tarefas, o fluxo de mensagens, os pedidos de permissão, a reconexão e o alinhamento de snapshots dentro do chat sejam exatamente iguais aos de hoje, para que a atualização seja invisível para mim.
25. Como usuário do celular, quero que a página me avise para recarregar na versão correspondente quando o desktop for atualizado, para não ficar numa página desatualizada.
26. Como revisor de segurança, quero que a possibilidade de o celular controlar o computador dependa apenas de "ser a mesma conta", para que o vazamento de URL não signifique mais perda de controle.
27. Como revisor de segurança, quero que o token único seja solicitado só antes da conexão, não seja gravado em disco e não entre em logs, para que a superfície de exposição de credenciais seja mínima.
28. Como revisor de segurança, quero que o JWT fique apenas no armazenamento de credenciais já existente (credential service do desktop, localStorage de mesma origem do celular) e não entre no QR code, nas mensagens do relay nem em arquivos de configuração.
29. Como pessoa de operações, quero que a nova versão do desktop use apenas o V2 e as versões antigas continuem no V1, para poder desligar o V1 no ritmo do `relay.disable_v1` já existente.
30. Como pessoa de operações, quero que a nova página do celular seja publicada apenas em um novo diretório de versão, sem sobrescrever a página usada pelo App antigo, para que a publicação não afete as versões antigas em uso.
31. Como pessoa de operações, quero que a antiga cadeia de build Docker seja removida do repositório, para que ninguém publique por engano as páginas do V2 na implantação legada de instância única.
32. Como pessoa de operações, quero que a telemetria existente (pareamento com sucesso/falha etc.) permaneça inalterada, para que as métricas antes e depois da atualização sejam comparáveis.
33. Como desenvolvedor, quero poder fazer a integração com um celular real usando o ambiente de testes (com V2 já implantado) e sem consumir um novo número de versão oficial.
34. Como desenvolvedor, quero que o transport dos dois lados, o manager e a pré-orchestração do celular tenham testes automatizados contra um relay falso, para validar handshake, heartbeat e tratamento de erros sem depender do ambiente online.
35. Como desenvolvedor, quero que a spec e a documentação de arquitetura sejam atualizadas para o comportamento final do V2, para que a manutenção futura não se oriente mais pelas descrições do V1.

## Decisões de implementação

### A. Escopo e compatibilidade

- A nova versão do desktop e a página do celular implementam apenas V2. Remover o transport V1 dos dois lados, o cálculo do proof HMAC, o armazenamento de `pass_hash`, além dos tipos de mensagem relay V1 e dos vetores de teste de proof no shared; adicionar os tipos de mensagem relay V2 e os tipos de contrato HTTP de dispositivo/token, compartilhados pelos dois lados.
- A entrada do celular permanece `/remote/v4`. O isolamento entre versões depende da publicação multi-versão no OSS: o QR code do desktop carrega o próprio `app_version` e o gateway busca a página pelo diretório de versão; Apps 3.13.0 e anteriores continuam usando a página V1 construída a partir da tag correspondente. Sem modo duplo e sem novo `/remote/v5`.
- Remover as três cadeias de build Docker de `/remote`, `/remote/v3` e `/remote/v4` (Dockerfile, configuração do nginx, scripts de build/push/verificação, comandos do package.json e as referências no documento ao repositório de infraestrutura legado e às suas variáveis de path); manter a cadeia de teste `/remote/__test__` e o pipeline OSS. Documentar que a implantação legada está congelada na última imagem V1.
- Remover a verificação de rota `/web-remote`, a página de espera de "já logado", o bootstrap legado `remoteControlToken`/`relayOrigin` e suas requisições `/api/remote-control/*`; reaproveitar a página de login, a página de callback, o serviço de autenticação Web, o repositório de credenciais OAuth do navegador e a codificação/decodificação do state do OAuth. O documento de design de login do controle remoto Web de abril recebe, no topo, a marcação de que foi substituído por esta spec.
- Adaptação puramente do cliente, sem nenhuma alteração proposta ao zcode-server: tudo implementado conforme os contratos já existentes no staging.

### B. Desktop: barreira de login e identidade do dispositivo

- Critério de "logado": existe `zcodejwttoken` no armazenamento de credenciais. Ambos os providers, ZAI e BigModel, satisfazem a condição.
- Sem login, a janela de controle remoto exibe o estado "é preciso fazer login primeiro" e oferece o ponto de entrada de login; nesse momento não registra dispositivo, não conecta ao relay e não emite o ticket interno de inicialização.
- Registro preguiçoso: na primeira vez em que o controle remoto é iniciado já logado, chama-se a interface de registro de dispositivo; o `device_mid` reaproveita o deviceMid atual do desktop (uuid, usado apenas para exibição e para o hash do gateway) e `meta.name` é o nome da máquina. Persiste `{deviceSid, userId, endpointOrigin}` no AppSettings; não grava mais em credential.
- Rebind de identidade: ao iniciar o controle remoto, se o id do usuário logado ou o endpoint origin divergirem do registro persistido, ou se o servidor devolver `AUTH_FAILED` em `auth_init`, re-registra o dispositivo e tenta chamar a interface de exclusão para limpar o registro antigo (falha ignorada, não bloqueia).
- Na primeira entrada no V2, apagar diretamente o setting `deviceSid` remanescente do V1 e o credential `passHash`, sem migração.
- Nova notificação unidirecional de estado de login renderer→main: após o login bem-sucedido, o main retenta restaurar o alvo "já habilitado" (ainda exigindo que o workspace da janela já esteja sincronizado); após o logout, o main para o runtime atual e coloca o estado em `auth-required`, mas não limpa o registro de habilitação. Na inicialização do app, sem JWT, o fluxo de restauração para em `auth-required` aguardando essa notificação.
- A janela remove o botão "atualizar QR code", o diálogo de confirmação e o IPC `resetPairingAuthorized`; mantém "copiar link". A superfície de dependência de IPC fica restrita a `authorizeStart`, `startAuthorized`, `stop` e `getStatus`.

### C. Desktop: conexão e token

- Antes de cada conexão, usa-se o JWT para chamar a interface de token e solicitar um token único com `role=device`; o endereço WebSocket é `wss://<endpoint origin>/api/v1/remote/ws2?token=<token>&mid=<deviceMid>`. Qualquer falha de WebSocket leva a solicitar um novo token, sem reusar a URL. Remover o header `X-Device-ID`. O override de debug `ZCODE_WEB_REMOTE_CONTROL_RELAY_WS_URL` é mantido, com a semântica alterada para o endereço V2; o test endpoint continua mapeando para o domínio de testes.
- `auth_init` leva apenas `device_sid`, `meta` e `client_ts`, sem `role`; `pair_status_query` não leva `device_sid`; `client_ts` usa segundos Unix.
- Heartbeat com base de 5 segundos, jitter ±1 segundo e watchdog de ACK de 15 segundos; mantidas as restrições já existentes de `setTimeout` recursivo, de não reenviar heartbeats perdidos e de anexar um pequeno atraso aleatório à reconexão disparada pelo watchdog.
- `KICKED` com retentativa limitada: após um atraso aleatório de 2~5 segundos, troca o token e reconecta uma vez; se `KICKED` chegar de novo em até 60 segundos, a reconexão automática para, o estado vira `kicked` e a failure exposta é `session-conflict`.
- 401 na interface de token → nova failure reason `auth-required`; o runtime entra em `error` e para de reconectar automaticamente, sem disparar logout global e sem limpar o registro de habilitação. 5xx e erros de rede: retentativa com backoff exponencial começando em 1 segundo, teto de 30 segundos e com jitter, zerando após o `auth_ack`; outros 4xx → estado terminal `relay-unavailable`.
- O main do desktop chama diretamente as interfaces de dispositivo e de token com o fetch global do Node, enviando `Authorization: Bearer <jwt>`, sem passar pelo processo de services e sem reaproveitar o observador de logout global de 401 do lado de services.

```text
Máquina de estados do device do desktop (V2)
idle ─start─▶ auth-check ─semJWT─▶ auth-required (aguardando a notificação de login)
   │                └comJWT─▶ registering (sem sid / identidade divergente)─ack─▶ token-acquiring
   │                                                            └────────▶ token-acquiring
token-acquiring ─token─▶ connecting ─open─▶ authenticating(auth_init) ─auth_ack─▶ waiting_terminal | paired
   │ 401 → auth-required (estado final, aguardando a notificação de login)
   │ 5xx/rede → backoff → token-acquiring
paired/waiting_terminal ─KICKED(primeira)─▶ delay 2~5s → token-acquiring
                        ─KICKED(segunda em até 60s)─▶ kicked (estado final, session-conflict)
                        ─ACK watchdog 15s / socket close─▶ token-acquiring
```

### D. Celular: login, escolha de dispositivo e conexão

- Parsing de `/remote/v4`: quando a URL contém `code`+`state`, entra em modo de callback do OAuth; caso contrário, lê `app_version`, `sid`, `mid` e `name`, todos opcionais. Remover `hash` e `t`.
- O `redirect_uri` do OAuth é `<origin>/remote/v4`. A allowlist de `app_return_to` passa de apenas `/web-remote` para permitir `/remote/v4` (com barra final) e os caminhos de compartilhamento já existentes; a query libera `app_version`, `sid`, `mid` e `name`. Após o callback, `location.replace` para `app_return_to`, e o gateway escolhe a versão conforme o `app_version`. O mecanismo de encaminhamento `return_to` do modo de desenvolvimento é mantido.
- Barreira de login: sem login, renderiza primeiro a página de login existente (o provider segue o ambiente de build); com login, entra na pré-orchestração de conexão.
- Regra de destino: com `sid` → conecta direto; sem `sid` → lê o dispositivo mais recente do localStorage e, chamando a interface de lista de dispositivos, confirma se está online para conectar direto; caso contrário, renderiza a página de lista de dispositivos. A página de falha de conexão oferece "escolher outro dispositivo" para ir à lista.
- Lista de dispositivos: busca ao entrar, permite atualização manual e busca de novo no `visibilitychange` ao voltar para o primeiro plano, sem polling. Dispositivos online vão para o topo e são ordenados por `meta.name`; dispositivos offline ficam esmaecidos, não clicáveis e exibem os 8 primeiros caracteres do `device_mid`. A página de lista e a de login são páginas de tela cheia independentes, anteriores à conexão, com o mesmo layout em tela estreita e larga, sem entrar no shell `Root`/da barra lateral, reaproveitando o estilo da página de login e o tema padrão `zai-dark`, com os textos em `zh-CN`/`en-US`.
- Depois de selecionar um dispositivo, `history.replaceState` grava de volta na URL `app_version` (preservando o valor original), `sid`, `mid` e `name`, e o sid mais recente é gravado no localStorage; o estado local existente, indexado por sid, continua utilizável.
- Antes de cada conexão, usa-se o JWT do localStorage para solicitar um token `role=terminal` e conecta em `wss://<origin>/api/v1/remote/ws2?token=…&mid=…` (o `mid` vem do parâmetro da URL ou do `device_mid` da lista de dispositivos). 401 → limpa a sessão local e volta à página de login, mantendo o `app_return_to` com a URL completa atual. 5xx/erros de rede mantêm o backoff existente de 500ms×2ⁿ, com teto de 10 segundos.
- Mapeamento de erros: `AUTH_FAILED` após `auth_init` → nova failure reason `device-not-owned`; a página de falha oferece duas ações, "trocar de conta" (logout e volta à página de login preservando o endereço de retorno) e "escolher outro dispositivo"; `WRONG_PARAM` → `invalid-mobile-connection`; `DEVICE_OFFLINE` mantém a recuperação com a tolerância já existente; `KICKED` usa a mesma política de retentativa limitada do desktop, com o segundo `KICKED` → `session-conflict`; `INTERNAL` mantém o tratamento recuperável já existente.
- Heartbeat, watchdog, `client_ts` e os campos de `auth_init`/`pair_status_query` são idênticos aos do desktop.
- bootstrap-request/response, workspace-list, workspace-bridge-open/ready, rpc-frame/ack, `mobile-view-state-update`, guard de sincronização de versão e a ordem da recuperação replayable permanecem inalterados.

```text
Primeira entrada do celular (V2)
Abrir /remote/v4?app_version&sid&mid&name
  ├─ com code+state ─▶ página de callback troca o token → localStorage → replace(app_return_to)
  ├─ sem JWT ─▶ página de login ─▶ OAuth (redirect_uri=/remote/v4, state.app_return_to=URL atual)
  └─ com JWT
       ├─ com sid ─▶ solicita token terminal ─▶ ws2 ─▶ auth_init(sid) ─▶ auth_ack
       │                                          └─ AUTH_FAILED → página de falha device-not-owned
       └─ sem sid ─▶ último dispositivo online? ─sim─▶ o mesmo acima
                                  └não─▶ página de lista de dispositivos ─selecionar─▶ replaceState(URL) ─▶ o mesmo acima
auth_ack(matched) ─▶ bootstrap-request ─▶ guard de versão ─▶ workspace-bridge-open ─▶ cadeia existente
```

### E. Deploy e integração

- A página do celular é publicada em `/remote/v4/<version>/` pelo pipeline multi-versão OSS já existente, e a rota da página continua sendo `/remote/v4`. A lógica de escolha de caminho no QR code do desktop (≥3.4.0 usa v4) não muda.
- Durante a integração, o branch mantém a versão `3.13.0` no `package.json` da raiz e usa o pipeline de testes OSS para cobrir o diretório `3.13.0/` do ambiente de testes; o dev do desktop usa o test endpoint. Para iteração local rápida, usa-se o encaminhamento `return_to` do modo de desenvolvimento: após um login no domínio de testes, lê-se o localStorage de mesma origem. Os colegas que ainda estiverem na versão desktop V1 3.13.0 no ambiente de testes não conseguirão parear durante esse período e precisam ser avisados.

### F. Documentação

- Criar `docs/web-remote-control/relay-v2-pairing.md`: diagramas de sequência de registro/token/handshake, máquinas de estado do transport dos dois lados, retentativa limitada de KICKED, semântica de `auth-required`/`device-not-owned`, cenários de aceite e limitações conhecidas.
- As três seções Transport, Desktop Main e Web do documento de arquitetura passam a descrever o V2 e passam a linkar o novo documento, removendo os trechos de V1 e de implantação Docker; `remote-v4-static-deployment.md` perde a descrição da cadeia Docker e mantém OSS e sincronização de versão; `web-remote-login.md` é reescrito como a barreira de login do V2 em `/remote/v4`.

## Decisões de teste

- Um bom teste observa apenas o comportamento externo: quais mensagens o relay recebeu, com quais parâmetros as interfaces HTTP foram chamadas, o que o status/failure do runtime expõe, o que a página renderiza em cada estado e em que a URL/localStorage se transformam. Não afirmar estado privado nem handles de timer.
- O único novo fixture de teste é o **relay V2 falso**: um servidor em processo que oferece simultaneamente handlers HTTP de registro/listagem/exclusão de dispositivo, emissão de token e um servidor WebSocket em `/ws2`, com encenação de `pair_status` no `auth_ack`, `KICKED`, `AUTH_FAILED`, `DEVICE_OFFLINE`, `INTERNAL`, desconexão e HTTP 401/5xx. Os testes dos dois lados (desktop e celular) o compartilham. Precedente: os testes de transport já existentes dos dois lados usam um WebSocketServer local como relay.
- A principal costura do desktop é a interface pública do manager: injetar o transport V2 real, o relay falso, a leitura de credenciais falsa e a notificação falsa de estado de login, cobrindo a recusa de início sem login, o registro preguiçoso e a persistência, o re-registro e a tentativa de exclusão em caso de mudança de usuário/endpoint, o re-registro por `AUTH_FAILED`, o 401 de token → `auth-required` sem limpar o registro de habilitação, a parada no logout, a restauração após o login, o formato da URL do QR code e o status exposto na retentativa limitada de `KICKED`. Precedente: os testes do manager com relay externo. Detalhes de nível de linha, como heartbeat de 5 segundos/jitter/watchdog de 15 segundos, `client_ts` em segundos, os campos de `auth_init` e `pair_status_query` e a sequência de backoff, ficam cobertos nos testes do transport contra o relay falso com fake timers. Precedente: os testes de transport dos dois lados e os testes de heartbeat do shared.
- A principal costura do celular é o módulo de pré-orchestração de conexão extraído: injetar o estado de login, as interfaces de dispositivo, location/history/localStorage e a fábrica de transport, cobrindo o reconhecimento do modo de callback, a barreira de login, o destino com/sem sid, o desvio de dispositivo recente online/offline, a ordenação da lista e os gatilhos de atualização, a gravação de volta na URL após a seleção, o 401 voltando ao login com o endereço de retorno preservado e as ações de `device-not-owned`. Precedente: os testes de rota web, de failure reason, de bootstrap shell e de lifecycle. Os testes do terminal transport contra o relay falso são iguais aos do desktop.
- shared: construção/parsing da URL do QR code (sem `hash`/`t`, com `sid` opcional), validação em runtime dos tipos de mensagem V2, allowlist de state do OAuth e liberação de query. Precedente: os testes de web remote control do shared e os testes de autenticação web.
- Aceite de UI: a página de lista de dispositivos do ticket 06 é a única página totalmente nova; antes de implementar, anexar a `relay-v2-pairing.md` um wireframe em texto e uma tabela de textos (cabeçalho e entrada de troca de conta, disposição dos itens da lista, marcador de online, esmaecimento dos offline, estado vazio, posição do botão de atualização), confirmados pelo usuário antes da implementação; os tickets 03/04/05 apenas somam ou retiram estados nos painéis, na página de login e nas páginas de falha já existentes, e os textos novos são listados em cada documento de ticket para confirmação. Todos os tickets que tocam em UI devem entregar, após a implementação, uma matriz de capturas de tela: desktop com temas claro/escuro × zh-CN/en-US (produzida junto com o E2E do 04) e celular com tela estreita/larga × temas claro/escuro × zh-CN/en-US (adicionando casos de captura pendentes com base em `packages/web/test/e2e/manual-review/pending/remote-version.mjs`, sem promoção automática).
- O E2E do desktop ganha apenas um caso: "ao abrir a janela de controle remoto sem login, exibe a necessidade de login e o main não inicia nenhum registro nem conexão de relay", adicionado e promovido conforme o skill de workflow de E2E.
- O aceite em aparelho real é executado manualmente no ambiente de testes e registrado no novo documento: primeiro login por QR code, conexão direta já logado, seleção de dispositivo sem QR code, conta divergente, tomada de controle por outro celular, logout/login no desktop e recuperação de `KICKED` por rolling release do relay.
- Verificações necessárias conforme o AGENTS: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, testes unitários afetados e o novo E2E.

## Fora de escopo

- Janelas múltiplas iniciando o controle remoto cada uma por sua conta compartilham a mesma identidade de dispositivo e expulsam uma à outra; manter como está e registrar apenas o risco na documentação.
- No celular: excluir dispositivo, renomear dispositivo, página de gestão de dispositivos. No desktop: a entrada de diagnóstico "registrar este dispositivo novamente".
- Qualquer alteração no zcode-server (distinguir `KICKED` de perda de owner, persistir `meta` de dispositivos offline, documentação da unidade de `client_ts`).
- O momento de desligar o V1 e a troca de `relay.disable_v1`; manutenção de compatibilidade das versões antigas do App.
- Capacidade de controle remoto para usuários sem login; formas de login além de ZAI e BigModel.
- As próprias mudanças de infraestrutura — gateway, ESA, OSS, allowlist do OAuth (aqui a spec apenas lista requisitos e método de aceite).
- Nova dimensão de versão de protocolo na telemetria; limpeza de campos legados sem relação com este trabalho em `WebRemoteControlStatus`; cadeia `/remote/__test__` e página de compartilhamento.

## Observações adicionais

### Dependências externas (bloqueiam a publicação em produção, não bloqueiam o desenvolvimento)

| Item                                                                                           | Responsável                        | Situação atual                                                                                            | Método de aceite                                           |
| -------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Implantar V2 no zcode-server de produção                                                   | Servidor                           | `zcode.z.ai/api/v1/remote/token` retorna 404                                                            | A interface retorna 401 sem JWT                            |
| O gateway de produção encaminhar `/api/v1/remote/ws2` com precisão ao relay V2, com device e terminal caindo na mesma instância por `mid` | ESA/maintenance do gateway Alibaba Cloud | Hoje o prefixo `/api/v1/remote/ws` cai no handler V1 (retorna 400)                               | Sem token retorna 401; pareamento estável dos dois lados com o mesmo `mid` |
| O gateway de produção buscar no OSS `<version>/index.html` conforme `app_version`, com `/remote/v4/<dir>/<path>` buscando o diretório correspondente | ESA/maintenance do gateway Alibaba Cloud | Já em vigor no ambiente de testes; em produção todas as versões retornam o mesmo index, e `/remote/v4/3.13.0/release-manifest.json` retorna index.html | O manifest retorna JSON; `app_version` diferentes retornam seus respectivos recursos de versão |
| Registrar `https://zcode.z.ai/remote/v4` e `https://zcode.z.ai/remote/v4` na allowlist do OAuth | Alinhamento com os provedores OAuth ZAI e BigModel | Não iniciado                                                                                             | Um login real com retorno concluído no ambiente de testes  |

O repositório de infraestrutura legado não hospeda mais a configuração de backend e frontend do zcode.z.ai, e esta tarefa não faz nenhuma alteração nele.

### Ordem de publicação

V2 no servidor de produção → as duas regras do gateway → allowlist do OAuth → publicação da página do celular em um novo diretório de versão → publicação do App do desktop com esse número de versão. O job manual de latest não roda antes de o gateway suportar diretórios de versão.

### Limitações conhecidas

- Se o celular usar um link salvo antes da atualização (com `app_version` antigo) para se conectar a um desktop V2, ele cai na página V1 e fica parado em "aguardando o computador"; não há correção automática e é preciso escanear o QR code atual novamente.
- O servidor não devolve `meta` para dispositivos offline, então na lista os dispositivos offline só exibem um trecho do `device_mid`.
- O servidor envia `KICKED` tanto para "substituído" quanto para "owner perdido", e o cliente faz um meio-termo com retentativa limitada; se o servidor passar a distinguir os códigos de erro, dá para voltar a "parar ao receber".

### Relação com as regras superiores

- Permanecem todas as restrições já existentes: os limites de recuperação de `desktop-continuous` no desktop e de `web-remote-replayable` no celular, a separação entre workspaceIdentity e workspacePath, o relay não interpretar payload de negócio e o main não manter estado de task/stream.
- Permanecem válidos as descrições do ticket interno de inicialização de uso único, da redução da superfície de dependência de IPC (remoção de `resetPairingAuthorized`) e da fronteira de compensação de XSS do Office.

## Critérios de aceite

- [ ] Desktop sem login abre a janela de controle remoto: exibe a necessidade de login, não registra dispositivo, não conecta ao relay e o estado não contém QR code.
- [ ] Primeiro início já logado: completa o registro e persiste `{deviceSid, userId, endpointOrigin}`; o QR code é `/remote/v4?app_version&sid&mid&name`, sem `hash`/`t`; o sid/passHash remanescentes do V1 foram removidos.
- [ ] Mudança de usuário ou de endpoint, ou `auth_init` retornando `AUTH_FAILED`: re-registra e tenta excluir o registro antigo; a falha na exclusão não afeta o início.
- [ ] Antes de cada conexão é solicitado um token novo; `auth_init` sem `role`; `pair_status_query` sem `device_sid`; `client_ts` em segundos; heartbeat de 5 segundos ±1 segundo; reconexão após 15 segundos sem ACK.
- [ ] 401 no token: estado `error`/`auth-required`, para de reconectar, não desloga e preserva o registro de habilitação; retoma automaticamente após a notificação de login. Notificação de logout: o runtime para e vai para `auth-required`.
- [ ] `KICKED`: na primeira, reconecta com um token novo após 2~5 segundos de atraso; na segunda dentro de 60 segundos, para e reporta `session-conflict`.
- [ ] Celular com `sid` e sem login: página de login → OAuth volta para o modo de callback de `/remote/v4` → redireciona para a URL original → conecta direto. Celular com `sid` e logado: conecta direto.
- [ ] Celular sem `sid`: se o dispositivo mais recente estiver online, conecta direto; senão, abre a página de lista, com os online no topo ordenados por nome, os offline esmaecidos e não clicáveis, atualização manual e ao voltar para o primeiro plano; após a seleção, a URL é gravada de volta e sobrevive a um recarregamento.
- [ ] `AUTH_FAILED` no celular: página de falha `device-not-owned` com "trocar de conta" e "escolher outro dispositivo"; 401: volta à página de login e retorna à URL original depois do login.
- [ ] Depois de entrar no chat, o bootstrap, o bridge, o `rpc-frame`, a recuperação replayable e o guard de versão se comportam como antes da atualização.
- [ ] O repositório não contém mais as cadeias de build Docker v2/v3/v4 nem as referências à infraestrutura migrada; `/remote/__test__` e o pipeline OSS funcionam; o código V1 dos dois lados e os tipos V1 do shared foram removidos.
- [ ] O novo documento e os três documentos já existentes são atualizados para o comportamento final; o documento de design de login de abril recebe a marcação de substituído.
- [ ] typecheck, lint, checagem de arquitetura, testes unitários afetados e o novo E2E passam; os passos do aceite em aparelho real no ambiente de testes estão registrados.
