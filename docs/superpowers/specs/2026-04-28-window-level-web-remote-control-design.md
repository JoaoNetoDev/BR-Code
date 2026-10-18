# Design de controle remoto Web em nível de janela

> **Obsoleto:** este design descreve o relay interno do repositório / `remoteControlToken` / `bridgeToken`, que já foram removidos. A implementação atual usa o relay externo `wss://zcode.z.ai/ws` e o parâmetro QR `/remote`, com as mensagens de negócio encapsuladas uniformemente em `data.payload`.

## Contexto

O `token/sessionId` do controle remoto Web atual está vinculado a uma visita de um determinado workspace. Depois que o celular escaneia o QR, ele entra em um acesso lateral do workspace atual; ao abrir uma task em outro workspace, uma nova relay session é criada sob o mesmo relay control tunnel e o fluxo salta para um novo `connectUrl` para refazer o bootstrap.

Esse modelo serve para "compartilhar o workspace atual", mas não serve para "o celular controlar a janela inteira do desktop durante um período válido". O modelo desejado deve separar a autorização de pairing de curto prazo do celular para a janela da ponte de dados do workspace atual.

## Objetivos

Objetivos de transformação da primeira versão:

1. O celular controla uma janela do desktop durante a validade de `deviceToken`, e não um workspace específico.
2. A mesma janela do desktop permite apenas uma conexão de página do celular por vez.
3. Celular e desktop têm estado de seleção independentes: trocar de workspace/task no celular não troca de volta a tab/task atual do desktop.
4. Celular e desktop compartilham os dados subjacentes de workspace/task. Depois que o celular opera `task-b`, o desktop pode permanecer em `task-a`; quando o desktop mudar manualmente para `task-b`, vê o resultado produzido pelo celular.
5. O processo main do desktop consegue consultar qual workspace/task o celular está vendo.
6. A primeira versão ainda só suporta acessar workspaces já abertos dentro da janela atual do desktop, sem criar no celular workspaces fora da janela.

## Não objetivos

A primeira versão não faz:

1. Vários celulares controlando a mesma janela do desktop ao mesmo tempo.
2. Operação no celular sincronizando de volta a tab/task selecionada no desktop.
3. Criação direta de workspace local pelo celular.
4. Criação direta de session de workspace remoto SSH / WSL / Docker pelo celular.
5. Manter várias bridges de workspace vivas ao mesmo tempo.
6. Sistema de permissões completo, modo somente leitura, lista de dispositivos e gestão de dispositivos de longo prazo.

## Modelo central

O novo modelo é dividido em sessão de controle de nível de janela e ponte de dados de workspace.

```text
Desktop Window
  └── WindowControlSession
        ├── windowControlSessionId
        ├── deviceToken
        ├── tunnelId
        ├── mobileConnected
        ├── mobileViewState
        │     ├── activeWorkspaceKey
        │     ├── activeTaskId
        │     └── updatedAt
        └── currentWorkspaceBridge
              ├── bridgeSessionId
              ├── workspaceKey
              ├── workspacePath
              ├── kind: local | remote
              ├── remote.workspaceIdentity
              ├── remote.remoteSessionId
              └── initialTaskId?
```

Mudanças de semântica:

```text
modelo antigo:
  token/sessionId = uma visita de um determinado workspace

novo modelo:
  deviceToken/windowControlSessionId = controla a janela inteira do desktop
  bridgeSessionId = ponte de dados do workspace que o celular abriu
```

Estado de visualização e estado de negócio são separados:

```text
desktop activeTaskId = seleção atual do desktop
mobile activeTaskId  = seleção atual do celular
task data/runtime    = compartilhado pelos dois lados
```

## Tipos compartilhados

`packages/shared/src/web-remote-control.ts` ganha os tipos de nível de janela.

```ts
export type WebRemoteControlTokenKind = "window-pairing";

export type WebRemoteControlWindowFailureReason =
  | WebRemoteControlFailureReason
  | "invalid-mobile-connection"
  | "desktop-bootstrap-timeout";

export interface WebRemoteControlWindowSession {
  windowControlSessionId: string;
  deviceToken: string;
  tokenKind: WebRemoteControlTokenKind;
  connectUrl: string;
  qrUrl: string;
  expiresAt: number;
  status: "idle" | "starting" | "running" | "active" | "error";
}

export interface WebRemoteControlMobileViewState {
  activeWorkspaceKey?: string;
  activeTaskId?: string;
  updatedAt: number;
}

export interface WebRemoteControlLocalWorkspaceBridge {
  bridgeSessionId: string;
  bridgeToken: string;
  kind: "local";
  workspaceKey: string;
  workspacePath: string;
  initialTaskId?: string;
  wsUrl: string;
}

export interface WebRemoteControlRemoteWorkspaceBridge {
  bridgeSessionId: string;
  bridgeToken: string;
  kind: "remote";
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity: string;
  remoteSessionId: string;
  initialTaskId?: string;
  wsUrl: string;
}

export type WebRemoteControlWorkspaceBridge =
  | WebRemoteControlLocalWorkspaceBridge
  | WebRemoteControlRemoteWorkspaceBridge;

export interface WebRemoteControlWindowBootstrapResult {
  windowControlSessionId: string;
  workspaces: WebRemoteControlWorkspaceTarget[];
  tasks: WebRemoteControlTaskTarget[];
  mobileViewState?: WebRemoteControlMobileViewState;
}

export interface WebRemoteControlWindowControlReadyEvent {
  type: "window-control-ready";
  windowControlSessionId: string;
  mobileConnectionId: string;
  expiresAt: number;
}
```

`resolveWebRemoteControlWorkspaceKey()` continua usando a regra existente:

```ts
workspaceKey = workspaceIdentity?.trim() || workspacePath;
```

Restrições:

1. `deviceToken` é um token de pairing de janela de curto prazo, não uma credencial permanente de dispositivo.
2. `deviceToken` expira por padrão em 8 horas; o celular desliza e renova `expiresAt` quando há operação válida.
3. A renovação só pode ocorrer na conexão mobile ativa atual e não pode acontecer com um `deviceToken` puro.
4. bridge / target / task de workspace remoto precisam carregar `workspaceIdentity`, e `workspaceKey` precisa ser calculado por `workspaceIdentity?.trim() || workspacePath`.
5. A construção da identidade remota reaproveita a utilidade unificada, como `buildRemoteWorkspaceIdentity`; é proibido escrever à mão regras de concatenação no relay, no desktop main ou na web.
6. O `deviceToken` do QR do desktop já é, por si só, a autorização de uso único deste controle remoto, e o mobile web que leva `remoteControlToken` não precisa ter feito login antes.
7. `invalid-mobile-connection` e `desktop-bootstrap-timeout` devem entrar nos tipos de erro compartilhados, evitando strings soltas em relay/web/testes.

## Protocolo do Relay

O Relay precisa separar dois tipos de session manager.

```text
WindowControlSessionManager
  deviceToken -> window control session

WorkspaceBridgeSessionManager
  bridgeToken / bridgeSessionId -> workspace bridge session
```

A sessão de nível de janela guarda apenas autorização, conexão e o lease mobile atual; snapshots de workspace/task não são cacheados no relay.

```text
deviceToken
  ├── expiresAt
  ├── activeMobileConnectionId?
  └── activeWindowControlSocket?
```

API de nível de janela:

```text
POST /api/remote-control/windows
  O main do desktop cria a sessão de controle remoto de nível de janela e devolve um deviceToken com expiração deslizante de 8 horas.

GET /api/remote-control/windows/bootstrap/:deviceToken
  Bootstrap do mobile web. Depois que o relay valida que o deviceToken não expirou, ele solicita em tempo real, pelo desktop control socket, o snapshot de workspace/task da janela e o mobileViewState.

WS /ws/remote-control/window/:deviceToken
  Socket de window control do mobile. A primeira versão só permite um socket mobile. Após a conexão bem-sucedida o relay envia mobileConnectionId.

POST /api/remote-control/windows/:deviceToken/workspace-bridge
  O mobile pede para abrir ou trocar a workspace bridge. Precisa carregar o mobileConnectionId ativo atual.

POST /api/remote-control/windows/:deviceToken/mobile-view-state
  O mobile reporta o activeWorkspaceKey / activeTaskId atuais. Precisa carregar o mobileConnectionId ativo atual.
```

Validação de conexão das APIs HTTP de mudança:

```text
X-ZCode-Mobile-Connection-Id: <mobileConnectionId>
```

O relay só aceita requisições cujo `activeMobileConnectionId` corresponde e cujo window control socket correspondente ainda está aberto; caso contrário, devolve `401 invalid-mobile-connection` ou `409 session-conflict`. Assim, mesmo que uma segunda aba do navegador conheça o `deviceToken`, ela não pode trocar de bridge nem sobrescrever o `mobileViewState` depois de ter seu window control socket recusado.

Depois que o window control socket conecta, o relay envia ao mobile:

```json
{
  "type": "window-control-ready",
  "windowControlSessionId": "<windowControlSessionId>",
  "mobileConnectionId": "<mobileConnectionId>",
  "expiresAt": 0
}
```

O mobile só pode pedir `workspace-bridge` ou `mobile-view-state` depois de receber esse evento.

Regras de renovação deslizante do `deviceToken`:

1. O bootstrap só verifica a expiração e não renova o tempo.
2. A renovação acontece uma vez depois que o window control socket conecta.
3. `workspace-bridge` / `mobile-view-state` renovam uma vez depois de validar a conexão ativa.
4. Depois que a conexão se desconecta, `activeMobileConnectionId` é limpo e requisições posteriores com token puro não renovam o tempo de expiração.

API da ponte de dados:

```text
WS /ws/remote-control/bridge/:bridgeToken
  Socket de dados RPC do workspace atual do mobile.

WS /ws/desktop/bridge/:bridgeSessionId
  Socket de dados do host bridge dedicado do desktop main.
```

`/r/:deviceToken` pode continuar existindo, mas com semântica de entrada de janela. Quando o relay redireciona para a web, ainda pode usar:

```text
?remoteControlToken=<deviceToken>&relayOrigin=<relay-origin>
```

Assim o nome do parâmetro de URL do frontend pode ficar inalterado por enquanto, reduzindo mudanças de entrada.

## Política de acesso e login

A primeira versão trata o QR do desktop como uma entrada de autorização de curto prazo e de uso único, sem tornar o login Web um pré-requisito para usar o controle remoto.

Regras de acesso:

1. Quando a URL traz `remoteControlToken`, o mobile web pula o gate de login OAuth Web atual e entra direto no bootstrap do relay.
2. A fronteira de segurança do `remoteControlToken` é sustentada pela expiração deslizante de 8 horas, pelo `mobileConnectionId` ativo e pela política de conexão por um único celular.
3. Quando a URL não traz `remoteControlToken` e `/web-remote` é acessado diretamente, continua passando pela página de login / waiting page existente, usada para a futura lista de dispositivos e gestão de dispositivos de longo prazo.
4. Se o navegador já estiver logado, a primeira versão não faz validação extra de token owner / device grant e continua usando o fluxo de token de uso único.
5. A autenticação reforçada pelo estado de login é uma capacidade futura: pode-se adicionar antes do bootstrap a validação "usuário logado + device grant + window session", mas ela não pode bloquear o fluxo atual de QR sem login.
6. Ao adicionar futuramente autenticação reforçada por estado de login, device grant ou feature flag, é obrigatório injetar a capacidade transversal por Providers, proibindo que web / relay / desktop main referenciem diretamente implementações concretas de autenticação ou de flags.

A decisão de entrada em `packages/web/src/main.tsx` precisa ser separada:

```ts
hasRemoteControlToken = params.has("remoteControlToken");

if (hasRemoteControlToken) {
  // Modo de token único do QR: não exige login OAuth Web.
  return bootstrapWebRemoteControlByToken();
}

if (isWebRemoteRoute()) {
  // Modo de lista de dispositivos / waiting page após login.
  return bootstrapWebRemoteAuthShell();
}
```

## Mensagens do Desktop Control

O control socket entre o desktop main e o relay continua responsável pelo plano de controle e não transporta quadros binários RPC.

Novas mensagens:

```ts
type RelayDesktopControlEvent =
  | { type: "window-control-registered"; tunnelId: string }
  | {
      type: "window-bootstrap-request";
      requestId: string;
      windowControlSessionId: string;
    }
  | {
      type: "window-bootstrap-response";
      requestId: string;
      windowControlSessionId: string;
      success: true;
      result: WebRemoteControlWindowBootstrapResult;
    }
  | {
      type: "window-bootstrap-response";
      requestId: string;
      windowControlSessionId: string;
      success: false;
      error: string;
    }
  | { type: "mobile-connected"; windowControlSessionId: string }
  | { type: "mobile-disconnected"; windowControlSessionId: string }
  | {
      type: "workspace-bridge-request";
      requestId: string;
      windowControlSessionId: string;
      workspaceKey: string;
      taskId?: string;
    }
  | {
      type: "workspace-bridge-response";
      requestId: string;
      windowControlSessionId: string;
      success: true;
      bridge: WebRemoteControlWorkspaceBridge;
    }
  | {
      type: "workspace-bridge-response";
      requestId: string;
      windowControlSessionId: string;
      success: false;
      error: string;
    }
  | {
      type: "mobile-view-state-update";
      windowControlSessionId: string;
      viewState: WebRemoteControlMobileViewState;
    };
```

A lista de workspaces existente e a requisição de plataforma continuam passando pelo control socket. A primeira versão pode manter a forma atual de request/response, mas a semântica dos parâmetros precisa mudar de token de session de workspace para window control session.

## Origem do snapshot de Window Bootstrap

O valor de retorno de `GET /api/remote-control/windows/bootstrap/:deviceToken` vem do desktop main, e o relay não guarda snapshot de workspace/task.

Sequência do bootstrap:

1. O mobile pede o bootstrap.
2. O relay valida que `deviceToken` existe e que `expiresAt > Date.now()`.
3. O relay encontra o desktop control tunnel correspondente.
4. O relay envia `window-bootstrap-request { requestId, windowControlSessionId }`.
5. O desktop main lê do window runtime atual:
   - o `WebRemoteControlWorkspaceTarget[]` já sincronizado pelo renderer
   - o `WebRemoteControlTaskTarget[]` já sincronizado pelo renderer
   - o `mobileViewState` na memória do main
6. O desktop main devolve `window-bootstrap-response`.
7. O relay devolve como está ao mobile.

Semântica de erro:

1. Token inexistente ou expirado: `404/410 session-not-found | session-expired`.
2. Desktop control tunnel inexistente ou desconectado: `410 desktop-disconnected`.
3. Desktop main sem resposta em 10 segundos: `504 desktop-bootstrap-timeout`.
4. Renderer que ainda não sincronizou workspace/task: pode devolver arrays vazios, mas precisa trazer `windowControlSessionId`; o mobile entra em estado vazio e oferece atualização.
5. Um workspace remoto sem `workspaceIdentity` ou sem `remoteSessionId`: o desktop main filtra esse workspace do snapshot, evitando que o mobile entre em um estado sem ponte possível.

## Mudanças no Desktop Main

O `WebRemoteControlManager` passa de workspace runtime para window runtime.

```ts
interface WindowControlRuntime {
  windowId: number;
  windowControlSessionId: string;
  deviceToken: string;
  expiresAt: number;
  activeMobileConnectionId?: string;
  tunnelId: string;
  connectUrl: string;
  qrUrl: string;
  controlSocket: WebSocket;
  mobileConnected: boolean;
  mobileViewState?: WebRemoteControlMobileViewState;
  currentBridge?: WorkspaceBridgeRuntime;
  error?: string;
  failure?: WebRemoteControlFailure;
}

interface LocalWorkspaceBridgeRuntime {
  bridgeSessionId: string;
  bridgeToken: string;
  kind: "local";
  workspaceKey: string;
  workspacePath: string;
  initialTaskId?: string;
  host?: WebRemoteControlHostHandle;
  dataSocket?: WebSocket;
  disposeBridge?: () => void;
}

interface RemoteWorkspaceBridgeRuntime {
  bridgeSessionId: string;
  bridgeToken: string;
  kind: "remote";
  workspaceKey: string;
  workspacePath: string;
  workspaceIdentity: string;
  remoteSessionId: string;
  initialTaskId?: string;
  host?: WebRemoteControlHostHandle;
  dataSocket?: WebSocket;
  disposeBridge?: () => void;
}

type WorkspaceBridgeRuntime =
  | LocalWorkspaceBridgeRuntime
  | RemoteWorkspaceBridgeRuntime;
```

Comportamento de `start(windowId)`:

1. Para o window runtime existente da janela atual.
2. Conecta ao relay `/ws/desktop/control`.
3. Obtém o `tunnelId`.
4. Faz POST em `/api/remote-control/windows` para criar a sessão de nível de janela.
5. Salva o `WindowControlRuntime`.
6. Devolve `deviceToken / connectUrl / qrUrl / windowControlSessionId` para a camada do desktop.

Comportamento de `createWorkspaceBridge(windowId, workspaceKey, taskId?)`:

1. Procura o workspace alvo na lista de workspaces já sincronizada da janela atual.
2. Se o alvo for um workspace remoto, exige a existência simultânea de `remoteSessionId` e `workspaceIdentity`.
3. Libera o host, o data socket e a ponte de protocolo do `currentBridge` antigo.
4. Pede ao relay a criação da bridge session.
5. Para workspace local, cria um host dedicado via `InitLocal`.
6. Para workspace remoto, localiza o remote target original pelo `remoteSessionId` e cria um host dedicado via `InitRemote`.
7. Conecta em `/ws/desktop/bridge/:bridgeSessionId`.
8. Faz a ponte entre o data socket do relay e o `MessagePort` do host.

Comportamento de `mobileViewState`:

1. Depois de receber `mobile-view-state-update`, grava apenas no window runtime.
2. Opcionalmente encaminha ao renderer do desktop, para exibir "o celular está vendo a task-b".
3. É proibido gravar no estado de tab/task ativo do desktop.

## Mudanças na Web

`packages/web/src/main.tsx` mantém o nome do parâmetro `remoteControlToken`, mas passa a interpretá-lo como `deviceToken`.

Fluxo de bootstrap:

1. Se a URL traz `remoteControlToken`, pula a verificação de login OAuth Web.
2. `GET /api/remote-control/windows/bootstrap/:deviceToken`.
3. Obtém a lista de workspaces/tasks da janela e o `mobileViewState`.
4. Estabelece `WS /ws/remote-control/window/:deviceToken`.
5. Recebe o `mobileConnectionId` enviado pelo relay.
6. Se já existe `mobileViewState.activeWorkspaceKey`, abre esse workspace em prioridade; senão abre o primeiro workspace disponível.
7. Pede `workspace-bridge` com `X-ZCode-Mobile-Connection-Id` e recebe o `wsUrl` da bridge.
8. Estabelece o service accessor do workspace atual com o `wsUrl` da bridge.
9. Renderiza o `Root`, passando `initialWorkspaceAbsPath / initialWorkspaceIdentity / initialTaskId`.

Fluxo normal de `/web-remote`:

1. Quando a URL não traz `remoteControlToken`, continua seguindo a lógica de login OAuth Web existente.
2. Sem login, exibe a página de login.
3. Com login, exibe a waiting page, aguardando a futura capacidade de lista de dispositivos.
4. Esse caminho não afeta o acesso por token único do QR.

Comportamento ao clicar em uma task:

1. Task do mesmo workspace:
   - chama o próprio `onSelectTask()` da UI.
   - faz POST de `mobile-view-state` com `X-ZCode-Mobile-Connection-Id`.
   - não notifica o renderer do desktop para trocar.
2. Task de outro workspace:
   - faz POST de `workspace-bridge` com `X-ZCode-Mobile-Connection-Id`.
   - substitui o service accessor da bridge atual.
   - atualiza o `activeWorkspaceKey / activeTaskId` local da web.
   - faz POST de `mobile-view-state` com `X-ZCode-Mobile-Connection-Id`.
   - não troca o `deviceToken` nem salta para uma nova entrada de nível de janela.

A primeira versão pode substituir o service accessor remontando o `Root`, evitando introduzir na camada de UI uma troca a quente complexa com múltiplos accessors. A remontagem acontece apenas quando o celular troca de workspace e não afeta o desktop.

## Estado do celular visível no desktop

O desktop main guarda uma única cópia de `mobileViewState`:

```ts
type MobileViewState = {
  activeWorkspaceKey?: string;
  activeTaskId?: string;
  updatedAt: number;
};
```

Se o desktop precisar exibir esse estado, pode-se adicionar um evento de plataforma:

```text
PlatformChannels.WebRemoteControlMobileViewStateChanged
```

Ao adicionar esse evento é preciso modificar também:

1. O `PlatformChannels` em `packages/shared/src/channels.ts`.
2. Os tipos de request/response do `PlatformChannelMap`.
3. A interface de assinatura do `IPlatformService` em `packages/shared/src/platform.ts`.
4. A implementação de plataforma no preload/renderer do desktop.
5. O fallback no-op da web, para compatibilidade entre desktop/web.

Depois de assinar, o renderer só exibe o estado e não muda a seleção atual. É proibido escutar diretamente no renderer canais com string hardcoded.

## Compartilhamento de dados e atualização

Para garantir que o resultado da operação no celular possa ser visto depois no desktop, adota-se uma estratégia de atualização de baixo risco.

1. As escritas do bridge host do celular nas tasks continuam indo para a mesma persistência de workspace/task.
2. Quando o desktop entra manualmente em uma task, força um reload das mensagens e do estado de execução daquela task.
3. A primeira versão não depende de invalidação em tempo real do mobile host para o renderer do desktop, evitando que o main analise quadros binários RPC ou mantenha um segundo barramento de eventos entre hosts.

Se a invalidação em tempo real for feita depois, é preciso antes implementar canais de plataforma formais e a origem dos eventos:

```text
PlatformChannels.WebRemoteControlTaskInvalidated
{ workspaceKey, taskId }
```

A origem do evento precisa ser um evento de domínio de task updated emitido explicitamente pela camada de service/runtime e depois encaminhado pelo desktop main; é proibido usar strings hardcoded espalhadas e proibido inferir atualização de task analisando quadros binários RPC.

Depois de recebê-lo, o renderer apenas marca o cache como expirado e não muda a task ativa atual. Assim, a operação contínua no celular não interrompe o desktop, mas o desktop vê o resultado mais recente ao entrar naquela task.

A primeira versão não faz sincronização forte de Zustand entre dispositivos e não registra o mobile host no `BroadcastHub` do desktop.

## Política de conexão por um único celular

Na primeira versão, o mesmo `deviceToken` permite apenas um window control socket mobile.

Se um segundo celular ou uma segunda aba do navegador conectar:

1. O relay devolve ou fecha com `session-conflict`.
2. Nenhum `mobileConnectionId` novo é emitido.
3. O celular antigo não é desconectado automaticamente.
4. Qualquer requisição HTTP de `workspace-bridge` / `mobile-view-state` vinda da segunda página é recusada por falta de `mobileConnectionId` ativo.
5. O estado da camada do desktop exibe o erro de conflito ou mantém o estado ativo existente.

Escolher "não desconectar o lado antigo" evita que um escaneamento de QR feito por engano interrompa a session atual do celular.

## Etapas de migração

1. Camada de protocolo compartilhada
   - Estender `packages/shared/src/web-remote-control.ts`.
   - Adicionar tipos de window session, bridge session, mobile view state e mobile connection lease.
   - Os tipos de workspace remoto precisam carregar obrigatoriamente `workspaceIdentity` e `remoteSessionId`.
   - Manter os tipos antigos por um tempo, reduzindo o risco da migração por etapas.

2. Relay
   - Separar o window session manager e o bridge session manager.
   - Adicionar as APIs de bootstrap de nível de janela, workspace bridge e mobile view state.
   - Implementar no `deviceToken` a expiração de 8 horas e a renovação deslizante da conexão ativa.
   - Validar o `mobileConnectionId` ativo em `workspace-bridge` / `mobile-view-state`.
   - O bootstrap busca o snapshot em tempo real pelo desktop control socket, sem cachear workspace/task no relay.
   - Manter a entrada `/r/:token`, com a semântica alterada para `deviceToken`.
   - Implementar o tratamento de conflito de conexão por um único celular.

3. Desktop Main
   - Refatorar o modelo de estado do `webRemoteControlManager`.
   - `start()` passa a criar o window runtime.
   - Adicionar `createWorkspaceBridge()`.
   - Validar fortemente `workspaceIdentity` e `remoteSessionId` antes de criar a bridge remota.
   - Responder a `window-bootstrap-request` devolvendo o snapshot de workspace/task já sincronizado da janela atual.
   - Salvar e expor o `mobileViewState`.
   - A bridge de workspace remoto continua reaproveitando o caminho InitRemote do `createWebRemoteControlHost()` existente.

4. Web
   - O bootstrap passa a ser de nível de janela.
   - O modo `remoteControlToken` contorna o gate de login OAuth Web e vai direto para o bootstrap por token único.
   - O modo normal de `/web-remote` sem token mantém login / waiting page.
   - Estabelecer primeiro o window control socket e obter o `mobileConnectionId`, antes de pedir bridge ou reportar view state.
   - O clique em task passa a atualizar o mobile view state ou trocar a workspace bridge.
   - Atravessar workspaces não salta mais para um novo `connectUrl`.
   - Continua proibido criar workspace remoto diretamente.

5. UI e atualização
   - A camada do desktop exibe o estado de controle remoto de nível de janela.
   - Exibir opcionalmente o workspace/task atual do celular; se for adicionado assinatura de evento, ela precisa passar por `PlatformChannels` + `IPlatformService`, com proibição de canais hardcoded.
   - Adicionar reload forçado na troca de task do desktop; a invalidação em tempo real fica para depois que os canais de plataforma formais e a origem dos eventos de domínio estiverem completos.

6. Limpeza do modelo antigo
   - Remover a premissa de vínculo de token de session de workspace.
   - Atualizar `docs/web-remote-control/web-remote-control-architecture.md`.
   - Atualizar a nomenclatura dos testes e as fixtures relacionadas.

## Plano de testes

Testes unitários do Relay:

1. Criar uma window control session devolve `deviceToken` com expiração de 8 horas e `expiresAt`.
2. Um segundo socket mobile com o mesmo `deviceToken` devolve `session-conflict`.
3. Quando a segunda página não tem `mobileConnectionId` ativo, `workspace-bridge` / `mobile-view-state` devolvem `401 invalid-mobile-connection` ou `409 session-conflict`.
4. A operação mobile ativa renova `expiresAt` deslizando, e o bootstrap não renova.
5. Depois que a workspace bridge é criada, o mobile data socket e o desktop bridge socket conseguem se conectar.
6. O mobile view state update é salvo por window session.
7. O bootstrap busca o snapshot pelo desktop control socket; timeout do desktop devolve um erro explícito.

Testes unitários do desktop main:

1. `start(windowId)` não precisa de contexto de workspace.
2. `createWorkspaceBridge()` consegue criar um host para workspace local.
3. `createWorkspaceBridge()` consegue reaproveitar o `remoteSessionId` para achar o target no workspace remoto e exige que `workspaceIdentity` exista.
4. Trocar de bridge libera o host/data socket antigos, mas não recria o token do dispositivo.
5. `mobileViewState` não afeta a tab/task ativa do desktop.
6. `window-bootstrap-request` devolve o snapshot de workspace/task sincronizado da janela atual.

Testes unitários de Web/UI:

1. Com `remoteControlToken` na URL e sem login, a página de login não é renderizada e os dados da janela são obtidos direto com o `deviceToken`.
2. Ao acessar `/web-remote` sem `remoteControlToken` na URL, a lógica existente de login OAuth Web / waiting page continua sendo usada.
3. A web estabelece primeiro o window control socket e salva o `mobileConnectionId`.
4. Clicar em uma task do mesmo workspace só atualiza a task mobile ativa e leva o header da conexão ativa.
5. Clicar em uma task de outro workspace pede bridge, não salta para um novo `connectUrl` e leva o header da conexão ativa.
6. Task/workspace remotos usam `workspaceIdentity` como chave de isolamento.
7. `connectRemote()` continua retornando explicitamente não suportado no modo de controle remoto.

Verificação de integração:

1. O desktop liga o controle remoto e o celular escaneia o QR entrando no workspace padrão.
2. O navegador do celular consegue entrar na página de controle remoto pelo token do QR mesmo sem login.
3. O celular abre `task-b` e o desktop fica em `task-a`.
4. O celular envia uma mensagem em `task-b` e produz um resultado.
5. Ao mudar manualmente para `task-b`, o desktop vê o resultado do celular.
6. Um segundo celular escaneando o mesmo token vê um conflito.
7. Um segundo celular chamando diretamente as APIs HTTP de bridge/view-state é recusado, e o celular antigo não é afetado.
8. Em workspace remoto, a criação da bridge e a abertura de task funcionam, e caminhos iguais com remotos diferentes não misturam tasks.

Verificações mecânicas:

1. `pnpm lint`
2. `pnpm typecheck`

## Riscos e trade-offs

1. Remontar o `Root` para trocar de workspace é mais simples e estável que a troca a quente de accessor, mas a troca entre workspaces tem um loading breve.
2. A primeira versão mantém apenas uma current bridge, evitando a complexidade de multiplexar RPC de múltiplos workspaces.
3. Não se faz sincronização de estado em tempo real; a visibilidade dos resultados é garantida por reload da persistência, reduzindo a intrusão na arquitetura existente de Zustand/broadcast.
4. `deviceToken` é um token de pairing de curto prazo com expiração deslizante de 8 horas e a entrada por QR não exige login; antes do lançamento oficial ainda é preciso adicionar a verificação opcional reforçada pelo estado de login, revogação ativa, aviso de permissão e feature flag.

## Ordem recomendada de implementação

Implementar primeiro a session de nível de janela e o controle por um único celular, e só depois tratar as otimizações de experiência:

1. Relay + tipos compartilhados primeiro.
2. A máquina de estado do desktop main migra para window runtime.
3. Migração do bootstrap da web e do clique em task.
4. Adicionar o reload na entrada do desktop em uma task.
5. Atualizar documentação e testes.

Assim cada etapa pode ser verificada de forma independente, e a antiga entrada de nível de workspace pode ser mantida por um tempo para comparação de regressão.