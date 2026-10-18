# Conexão de Remote Workspace com Server

## Contexto

Atualmente o Desktop App já suporta a criação de remote workspace via SSH / WSL / Docker / Server.
Cada BrowserWindow tem um Window Host próprio; as tabs de workspace local e remoto na mesma janela
compartilham esse processo. SSH e WSL fazem pool de conexões dentro do Host, enquanto
Docker/Server usam uma dedicated connection correspondente ao logical session. O Host expõe ao
renderer o scope de service/CLI da workspaceKey correspondente, e o registry não é compartilhado
entre BrowserWindows.

O servidor remoto no modo Web já expõe `/ws`, entregando o `ServiceCollection` à Web UI por meio
do `ChannelServer`. Essa capacidade pode ser reaproveitada no Desktop App, mas ela não é a mesma
cadeia do remote por SSH: o Desktop não deve implantar nem iniciar um runtime remoto, e sim se
conectar a um ZCode server já em execução, gerenciando com a interface do App o workspace, as tasks,
os arquivos, o git e o terminal desse server.

## Objetivos

- Adicionar um novo remote target: `server`, que representa a conexão a um ZCode Web/HTTP server já
  em execução.
- O Desktop App pode abrir um server remote workspace da mesma forma que abre um remote workspace
  SSH.
- O servidor remoto continua sendo o responsável por workspace runtime, sessões/tasks do ZCode,
  agent runtime, sistema de arquivos, git, terminal e estado de capability no nível do workspace.
- O Desktop local mantém apenas janela, shell de UI, credenciais do server, ciclo de vida da conexão
  e binding de tab/sessão do workspace.
- Não alterar o comportamento dos remote workspaces SSH / WSL / Docker existentes.
- Não espalhar a semântica de recuperação replayable do `/remote` mobile para o链路 principal
  continuous do Desktop App.

## Não Objetivos

- Não iniciar um novo ZCode Agent runtime no Desktop local para o remote por server.
- Não deixar o main do Desktop interpretar ou persistir estado de negócio de task/session/stream do
  ZCode.
- Não usar o `/ws` cru atual como interface de produção exposta publicamente de forma contínua.
- A primeira versão não garante que mensagens enfileiradas localmente durante uma desconexão não se
  percam; na desconexão o envio é desabilitado e, após reconectar, a UI é alinhada por um snapshot
  remoto.
- A primeira versão não suporta o Desktop App criar novas sessões SSH / WSL / Docker e aninhá-las em
  um server remoto; o remote por server apenas se conecta a servers já existentes.

## Modelo de Processo

R1: o Server connector roda dentro do Host único da janela, sem criar um processo de Host adicional
para o connector. O wire contract do servidor remoto permanece inalterado.

```text
Desktop renderer
  -> RemoteWorkspaceSessionStore
  -> MessagePort
  -> Window Host / remote-scoped attachment
      -> RemoteConnectionRegistry / dedicated server connection
      -> Node WebSocket wss://<server>/ws
      -> SocketProtocol
      -> ChannelClient
      -> RemoteServiceAccess
  -> remote ZCode server
      -> ChannelServer
      -> ServiceCollection
      -> ZCode task/session/agent runtime
      -> remote filesystem / git / terminal
```

O connector permanece no Host em Node, em vez de conexão direta pelo renderer, porque:

- Header de autenticação WebSocket, proxy do sistema, TLS/certificados e diagnóstico de rede são
  mais adequados no lado Node.
- O renderer continua consumindo apenas `IServiceAccessor`, consistente com a estrutura de UI de
  remote workspace já existente.
- O main apenas repassa de forma fina as requisições de controle de conexão e o MessagePort, sem
  lidar com detalhes de frames RPC nem com a máquina de estados de reconexão.

## Sequência de Conexão

```text
User selects "Connect server"
  -> renderer validates form
  -> main forwards ConnectRemoteWorkspace to Window Host
  -> Window Host allocates remoteSessionId and creates dedicated connection
  -> connector calls GET /api/server-info
  -> connector opens wss://server/ws with auth
  -> connector creates RemoteServiceAccess
  -> Window Host exposes scoped MessagePort; main transfers it to renderer
  -> renderer registers remote session
  -> UI loads workspace state from remote services
```

Reconexão após desconexão:

```text
WebSocket close
  -> connector reports disconnected
  -> renderer marks remote workspace disconnected
  -> UI disables send / terminal write
  -> connector reconnects or user clicks reconnect
  -> new ChannelClient is created
  -> renderer re-registers services
  -> UI calls list/read snapshot APIs to converge
```

## RemoteTarget e Identidade do Workspace

Novo tipo de target:

```ts
type ServerRemoteTarget = {
  kind: "server";
  url: string;
  name?: string;
  tokenRef?: string;
  workspacePath?: string;
  serverId?: string;
};
```

O isolamento de identidade continua obedecendo às regras existentes:

```text
workspaceKey = workspaceIdentity?.trim() || workspacePath
```

O `workspaceIdentity` do server remote deve ser construído pelo `buildRemoteWorkspaceIdentity()`
unificado, no formato:

```text
remote:server:<serverId>:<workspacePath>
```

O `workspacePath` continua expressando apenas o caminho real de execução no servidor remoto; a
deduplicação de tabs, o binding de sessão, as chaves de cache, as chaves de fila e as chaves de
persistência usam a regra de fallback do `workspaceIdentity`.

## Interfaces do Server

O `/ws` existente pode continuar como entrada RPC, mas precisa de bootstrap e autenticação em nível
de produção:

```text
GET /api/server-info
  -> serverId
  -> version
  -> protocolVersion
  -> authRequired
  -> workspaces[]

GET /api/health
  -> ok

GET /ws
  Authorization: Bearer <token>
```

O `/ws` cru usado atualmente na verificação de implantação serve apenas para redes internas
controladas ou depuração temporária. A entrada de produção deve habilitar token ou autenticação
equivalente, e os logs não podem registrar o token bruto.

## Posse dos Serviços

O remote por server não pode reutilizar totalmente a estratégia de merge de serviços do remote por
SSH. O remote por SSH ainda tem muito estado global do app cuja autoridade é gerenciada localmente
pelo Desktop; o remote por server se parece mais com conectar a uma instância ZCode remota completa
em execução, portanto o estado relacionado a workspace/runtime deve ter o server como autoridade.

Posse recomendada para a primeira versão:

```text
Local Desktop authority:
  - theme / locale / window state
  - server target list
  - server token credential
  - desktop-only platform actions

Remote server authority:
  - file / git / terminal / file watcher
  - zcodeTask / zcodeSession / zcodeAgent
  - skills / plugins / MCP / commands for remote workspace
  - model provider registry used by the remote runtime
  - workspace-level settings and task/session persistence
```

Isso exige um novo `buildServerRemoteWorkspaceSessionServices()`; não se deve reaproveitar
diretamente o `buildRemoteWorkspaceSessionServices()` do SSH.

## Limites de Realtime e Fila

Quando o Desktop App se conecta a um server remote, ele continua sendo um cliente continuous do
Desktop:

```text
Desktop server remote:
  clientMode = desktop-continuous
  deliveryKind = continuous
  reconnect recovery = read snapshot / list tasks

Mobile /remote:
  clientMode = web-remote-replayable
  deliveryKind = replayable
  reconnect recovery = mirror gap + snapshot watermark + pendingCommands
```

Política de envio da primeira versão:

- conectado e task pronta: usar diretamente o caminho de envio existente de `zcodeTaskService` /
  `zcodeAgentService` remoto;
- desconectado: desabilitar o envio, sem acumular na fila do renderer local;
- o fluxo de uma task em execução é mantido pelo servidor remoto; a desconexão do Desktop não mata o
  runtime remoto;
- após reconectar, alinhar a UI com o snapshot remoto de sessão/task.

Se mais tarde o produto exigir que "prompts enviados pelo Desktop durante a desconexão também não se
perdam", trocar apenas o envio do remote por server no Desktop para uma host-accepted command queue,
deixando explícito que isso não afeta o链路 principal continuous local do Desktop.

## Entrada na UI

Adicionar o tipo `Server` ao diálogo de Remote Connection existente, mas abrindo-o apenas para a
forma de execução local de desenvolvimento:

```text
Remote Connection
  - SSH
  - WSL
  - Docker
  - Server
```

Limites de exibição:

- Inicialização de desenvolvimento local com Vite, ou quando a plataforma Desktop marca explicitamente
  `isLocalDevelopmentRuntime = true`: exibir o cartão de tipo `Server`.
- Desktop empacotado em production-mode (incluindo pacotes oficiais e de preview): não exibir o cartão
  de tipo `Server`, mesmo que a configuração de ambiente do produto esteja como `test`.
- O gate usa apenas a forma de execução local de desenvolvimento, sem `ZCODE_ENV` nem resultado de
  sondagem de rede interna; as regras de exibição de SSH / WSL / Docker não são afetadas.

Campos do formulário Server:

- Server URL
- Display name
- Token / credential
- Workspace selector (de `/api/server-info`; se não houver lista de workspaces, permite digitar o
  path manualmente)

Após a conexão bem-sucedida, a barra lateral exibe a entrada como remote workspace. O estado de
desconexão, o botão de reconexão e o log de erros reutilizam os padrões de UI de remote workspace já
existentes, mas com textos que diferenciam "Server connection" e "SSH connection".

## Plano de Validação

- Unit: schema de `ServerRemoteTarget`, construção da identidade do workspace, normalizador de URL,
  redação de token.
- Unit: máquina de estados de reconexão do host do connector.
- Unit: o merge de serviços do server remote não usa indevidamente a estratégia de merge do SSH.
- Integration: mock de `/api/server-info` + `/ws` ChannelServer, verificando que o renderer consegue
  registrar a sessão remota e ler o estado do workspace.
- Integration: após o fechamento do WebSocket a UI marca disconnected e, após reconectar, lê o
  snapshot novamente.
- E2E: o Desktop se conecta a um server de teste local, envia um prompt e o fluxo da task é exibido
  normalmente.
- Regression: a conexão remota SSH / WSL / Docker não é afetada.
- Regression: o `/remote` mobile continua anexando ao host existente, sem novo runtime independente.

## Status Atual da Implementação

- `RemoteTarget` / snapshot de settings já gained `kind: "server"`, e o token do server é persistido
  por credential key.
- A entrada HTTP do Server ganhou `GET /api/server-info`, que retorna `serverId`, versão, versão do
  protocolo, lista de workspaces e a flag de capacidade continuous de desktop.
- O host do Desktop conecta via Node WebSocket ao `/ws` de um server já existente, usando
  `RemoteServiceAccess` para repassar o RPC, sem entrar na cadeia de implantação de backend
  SSH/WSL/Docker.
- O server remote do Desktop não habilita `relay_bridge`, mantendo a semântica desktop continuous; os
  limites de recuperação replayable do `/remote` mobile não foram espalhos para o server remote.
- O renderer usa server-authoritative service merge para o server remote; SSH/WSL/Docker continuam
  usando a estratégia existente de serviços globais locais + serviços do workspace remoto.
- O runtime Provider Registry do server remote permanece server-authoritative; a página de
  configuração de modelos do Desktop edita apenas o Local Environment, e o Provisioning
  `onlyIfMissing` da primeira conexão é a única entrada de cópia automática — não há ação manual de
  sincronização Local → Server em execução.
- O assistente de conexão remota da UI ganhou, na forma local de desenvolvimento, o tipo Server e os
  campos URL / nome / token / diretório padrão; o empacotamento em production-mode não exibe esse
  tipo.

## Questões Abertas

- Se o server remote permite apenas HTTPS/WSS ou se, em desenvolvimento, permite HTTP/WS.
- Se um server pode expor múltiplos workspaces; em caso positivo, as permissões e a estratégia de
  atualização da lista de workspaces precisam ser definidas em `/api/server-info` ou em um
  `/api/workspaces` separado.
- Quando múltiplos Desktop Apps se conectam ao mesmo server, a UX de task owner, permissões e
  elicitation deve exibir as informações do owner/client atual.