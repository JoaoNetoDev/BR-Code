# Estado e Plano de Migração do Federated ZCode Node / Hub

## Estado

- Estado do documento: rascunho de arquitetura, aguardando decisão de produto.
- Escopo: o mesmo Desktop ou Browser Web gerindo simultaneamente a máquina local e múltiplos ZCode
  Lite / Server Node.
- Este documento planeja o modelo de processos unificado, a pilha de comunicação, a autoridade de
  estado, a agregação de tarefas, as capacidades de extensão e a migração de dados legados; não
  modifica o código de produto existente.
- Fronteiras de arquitetura de camada superior já confirmadas:
  - Desktop UI e Browser Web são ambos uma UI unificada.
  - A TUI é uma capacidade local do Node, não uma UI remota entre máquinas.
  - SSH / WSL / Docker são responsáveis por bootstrap, descoberta e transport; o protocolo de negócio acaba
    conectando o mesmo Node Runtime.
  - O `/remote` do celular é um attachment de UI remoto do Hub existente e não cria um Node runtime
    próprio.
  - Desktop `desktop-continuous` e Browser / celular replayable continuam com semânticas de delivery
    distintas; o estado-alvo separará Browser e celular em papéis de conexão confiáveis distintos.

## Feature Impact Brief

### Camadas Alteradas

| Camada         | Mudança deste planejamento                                                                                         |
| -------------- | ------------------------------------------------------------------------------------------------------------------- |
| option-source  | O catálogo de modelos passa a ser configuração desejada em nível de conta; candidatos de Skill / Plugin / Subagent passam a ser a capacidade real do Node alvo. |
| draft-default  | O valor padrão do novo modelo de tarefa vem do Model Profile em nível de conta; Sessions existentes continuam usando sua própria configuração de runtime. |
| validation     | Antes de criar e enviar, validar a readiness de modelo e credenciais do Node alvo; operações de extensão validam a capacidade do Node alvo. |
| commit-effect  | Commands de Task / Session são roteados apenas para o Node de origem da tarefa; o Hub não executa commands de negócio. |
| persistence    | Introduzir identidade estável de Node / Workspace, configuração de visão cross-node, cache de catálogo do Hub e ledger de migração. |
| recovery       | Cursor de múltiplos Nodes, node offline, mudanças de topologia, migração de duplo banco e aliases de identidade legados exigem protocolo de recuperação. |

### Fatos Atuais

1. As linhas persistidas da lista de Tasks vêm do `tasks-index.sqlite` de cada endpoint; o runtime e
   o corpo das Sessions continuam sendo autoritativamente mantidos pelo Session Store do CLI. hoje
   a UI traz active / pinned / archived completos de cada endpoint e então combina, ordena e corta
   no renderer.
2. `ZCodeTaskListQuery` só tem `limit`, sem cursor; hoje o "mostrar mais" ainda relê o prefixo
   completo.
3. Os agrupamentos personalizados hoje ficam em um único `tasks-index.sqlite` nas tabelas
   `task_groups / task_group_members / task_group_view_node_orders`; a ordenação é a ordem explícita
   do usuário, não ordenação temporal; a visão Grouped atual explicitamente não agrega remote
   endpoint.
4. O arquivo autoritativo de configuração de modelos do App é `~/.zcode/v2/config.json`. Hoje o
   Provider metadata, o Base URL e a custom API Key ainda ficam misturados no mesmo snapshot de
   configuração / registry.
5. SSH / WSL hoje têm autoridade mista:
   - arquivo, Git, Terminal, Agent, Task, Skills e Plugins ficam no remoto;
   - Settings, Credential e Model Provider ficam no Desktop;
   - o serviço de configurações de Subagent ainda fica no Desktop, mas o CLI runtime remoto lê na
     verdade as definições e o estado remotos, o que produz uma divisão da fonte de fatos.
6. Os dados legados de Task SSH realmente caem em dois bancos na máquina alvo:
   - `~/.zcode/v2/tasks-index.sqlite`
   - `~/.zcode/cli/db/db.sqlite`
7. O formato da workspace key legada de SSH é:

```text
remote:ssh:<host>:<port>:<username>:<workspacePath>
```

Conectar à mesma máquina alvo por hostname, porta, username ou alias SSH diferentes forma keys
diferentes.

8. Hoje SSH / WSL / Docker já reutilizam
   `IRemoteBackend -> deployServer -> connectRemote -> zcode-server`, mas o reúso e a reciclagem de
   processos ainda são inconsistentes:
   - SSH: Host compartilhado para a mesma janela e a mesma identidade SSH, normalmente mantido até
     o fechamento da janela;
   - WSL: Host compartilhado para a mesma janela e o mesmo distro / user, usando workspace
     generation e idle TTL de 60 segundos;
   - Docker: Host independente por remote session, com reciclagem de todo o runtime no fechamento da
     session.
9. Hoje SSH / WSL / Docker iniciam um `zcode-server` stdio em foreground. Seu ciclo de vida é mantido
   pelo Desktop Host, não escuta portas de longa duração; EOF da conexão ou saída do Host acionam a
   limpeza de Server e Agent.
10. Hoje o ZCode Lite usa `entry-http.js` para criar outro tipo de Server HTTP / WebSocket de longa
    duração; tanto o Server stdio quanto ele chamam `createLocalServices()`, mas a entrada,
    autenticação, reúso de conexão e ciclo de vida continuam sendo dois conjuntos distintos.
11. Hoje o `/remote` do celular se anexa via relay ao Local / Remote Host existente da janela do
    Desktop; o relay e o Desktop main apenas repassam `rpc-frame` e o controle de attachment, e não
    possuem task / session / stream / queue / snapshot.

### Invariantes que Precisam Ser Preservados

1. A verdade de negócio de Task / Session / Stream / Queue / Snapshot está somente no Node de
   origem da tarefa.
2. Hub, relay e Desktop main não mantêm estado de negócio de conversation.
3. A identidade global de Task não pode usar apenas `taskId`; precisa usar no mínimo:

```text
GlobalTaskRef = { nodeId, workspaceId, taskId }
```

4. `workspacePath` serve apenas para IO e exibição no Node alvo e não pode continuar carregando
   identidade permanente entre máquinas.
5. O provider / model / thought de uma Session existente continuam sendo autoritativamente mantidos
   pelo Session runtime daquela Session; a configuração de modelos da conta só fornece catálogo,
   valores padrão e seed para novas Sessions e não pode reescrever em massa Sessions históricas.
6. Skill / Plugin / Subagent locais do Node não podem ser falsificados como "disponível para a tarefa
   atual" pela união de candidatos de múltiplos nodes.
7. O `/remote` do celular só enxerga Nodes conectados ou em cache do Hub já pareado; não pode
   contornar o attachment do Hub para criar um Node runtime diretamente.
8. A UI não pode declarar um `clientMode` confiável por conta própria; Desktop continuous e
   Browser / Mobile replayable precisam ser injetados pelo Hub / Node attachment conforme o papel
   de conexão já autenticado.
9. O bootstrap SSH / WSL / Docker só é responsável por "chegar ao Node" e não pode possuir ciclo de
   vida de workspace, Agent ou conversation.

<!-- CHUNK-2 -->

## Arquitetura Alvo

```text
                         Account Control Plane
                  ┌────────────────────────────────┐
                  │ Model Profile                  │
                  │ Credential policy / bindings   │
                  │ Federated Task View Profile    │
                  └───────────────┬────────────────┘
                                  │ revision sync
                  ┌───────────────┴────────────────┐
                  │                                │
          Browser Web on A                  Desktop UI on C
                  │                                │
             Federated Hub A                  Federated Hub C
             ┌────┴────┐                    ┌──────┼──────┐
             │         │                    │      │      │
          Node A     Node B               Node A Node B Node C
             ▲
             │ local/in-process
          TUI on A

Mobile /remote
  -> relay
  -> Hub C attachment
  -> 已连接的 Node A / B / C
```

Restrições:

- O Hub só se conecta ao plano de Nodes e não se conecta recursivamente a outro Hub, evitando ciclos,
  agregação duplicada e ambiguidade de identidade.
- O Hub do Browser Web fica no processo Lite / Server ao qual ele se conecta; o Hub do Desktop é um
  processo independente app-wide supervisionado pelo Electron Main e compartilhado por várias
  janelas, e não pertence a nenhum Host per-window.
- O Node é a autoridade do workspace local, task, session, file, git, terminal, resource e
  extension inventory da máquina.
- O Account Control Plane é uma interface lógica, que pode ser implementada pelo serviço de conta
  ZCode, por um serviço de sincronização self-hosted ou por um Profile local offline; os detalhes
  de implementação em nuvem não ficam fixados no Node RPC.

## Modelo Unificado de Processo e Comunicação

### Modelo em Uma Frase

```text
Desktop / Browser / Mobile UI 只连接 Hub
TUI 只连接本机 Node
Hub 只连接 Node
Node 持有本机业务服务和 workspace runtime
Node 按 workspaceKey 懒启动 ZCode Agent
SSH / WSL / Docker 只是 bootstrap + tunnel adapter
```

O objetivo não é enfiar tudo em um único processo, mas fazer com que diferentes formas de
implantação reutilizem o mesmo conjunto de papéis lógicos e contratos de protocolo.

### Papéis Lógicos

| Papel                     | Quantidade e posição                                          | Responsabilidade                                                                                            | O que explicitamente não faz                                                              |
| ------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| UI Client                 | Desktop Renderer, Browser Web, Mobile Web                    | Exibir a visão unificada de Node / Workspace / Task e submeter intenções do usuário                        | Não tem autoridade de negócio, não faz SSH direto, não inicia Agent diretamente         |
| ZCode Hub                 | Um por instância de Desktop; um por Lite Web origin           | Node registry, gestão de conexões, agregação de Task Summary, cache de catálogo offline, sincronização de Profile da conta, attachment de UI | Não executa comandos de arquivo, não monta conversation, não possui queue / stream / snapshot |
| ZCode Node                | Uma instância estável por máquina alvo, distro WSL ou container | Workspace Registry, file/git/terminal, Task Index, Resource Store, Agent manager, extension inventory     | Não agrega outros Nodes e não atua recursivamente como Hub remoto                         |
| ZCode Agent               | No máximo um runtime de chat principal por workspaceKey ativo  | Session, V4 CommandInbox, projection, stream, permission, tool, model runtime                               | Não gerencia conexões entre Nodes nem layout de UI                                       |
| Bootstrap / Tunnel Adapter | Um connector de vida curta por conexão SSH / WSL / Docker     | Instalar, atualizar, descobrir o Node e estabelecer o túnel de bytes até o endpoint do Node                 | Não cria um segundo ServiceCollection e não guarda estado de negócio                     |
| Relay                     | Infraestrutura externa opcional                               | Autenticação, pareamento e heartbeat entre celular e Hub, repasse de frames opacos                          | Não faz parsing de Node / task / session e não faz snapshot replayable                  |
| Account Control Plane     | Serviço de conta, serviço self-hosted ou implementação offline | Model Profile, Credential policy, revisão da Federated View                                                | Não hospeda conversation em tempo real                                                   |

### Modelo de Processo do Desktop

```text
Desktop machine C
┌─────────────────────────────────────────────────────────────────────┐
│ Electron Main                                                       │
│ - 窗口、native API、进程监督、MessagePort 分发                      │
│ - 不拥有 Node registry / task / session                             │
│                                                                     │
│ ├─ Renderer Window 1 ─┐                                             │
│ ├─ Renderer Window 2 ─┼─ MessagePort ──> App-wide ZCode Hub Process │
│ └─ Mobile relay ──────┘                         │                    │
│                                                ├─ local connector   │
│                                                ├─ direct WSS        │
│                                                ├─ SSH tunnel        │
│                                                ├─ WSL tunnel        │
│                                                └─ Docker tunnel     │
└────────────────────────────────────────────────┼────────────────────┘
                                                 │
                         ┌───────────────────────┼──────────────────────┐
                         ▼                       ▼                      ▼
                      Node A                  Node B                 Node C
```

No estado-alvo não se cria mais um conjunto de Remote Hosts de negócio por janela para cada
workspace SSH / Docker. O Desktop main supervisiona apenas um Hub app-wide; múltiplas janelas e o
attachment do celular reutilizam o Node connection pool do Hub. Cada attachment de UI ainda tem
seu próprio escopo de connection / subscription e não pode compartilhar delivery buffer por causa
do reúso da conexão física.

As capacidades locais do Desktop também são acessadas pelo mesmo contrato de Node:

```text
Desktop Hub
  -> 发现已有 local Node daemon
  -> 若不存在，则由 Main 监督启动 embedded Node Process
  -> MessagePort / named pipe / loopback socket
  -> Local Node Core
```

O diretório de dados do Node precisa ter um lock de single-owner. Se o usuário já iniciou via ZCode
Lite um Node para o mesmo diretório de dados, o Desktop precisa reutilizá-lo e não pode iniciar um
segundo owner de SQLite / Agent.

### Modelo de Processo do ZCode Lite / Browser Web

```text
zcode-lite serve
┌──────────────────────────────────────────────────────────────┐
│ Lite Supervisor                                              │
│ ├─ Node Core / Node Process                                  │
│ │   ├─ Workspace Registry / Task Index / Resource Store      │
│ │   └─ Agent A / Agent B ...                                 │
│ ├─ Hub Core / Hub Gateway                                    │
│ │   ├─ local Node A connection                               │
│ │   └─ remote Node B / C connections                         │
│ └─ HTTP Gateway                                              │
│     ├─ /                 Web 静态资源                         │
│     ├─ UI <-> Hub endpoint                                   │
│     └─ authenticated Hub <-> Node endpoint                   │
└──────────────────────────────────────────────────────────────┘
        ▲                                  ▲
        │ same-origin WSS                  │ HTTPS/WSS
   Browser Web on A                   Desktop Hub C
```

O Lite pode expor externamente apenas uma porta, mas dentro da porta os papéis precisam ser
separados:

```text
Browser UI role  -> Hub endpoint
Remote Hub role  -> Node endpoint
Admin/bootstrap  -> 有限的 Node discovery / pairing endpoint
```

Um mesmo HTTP listener não equivale a uma mesma permissão. O cookie de session do Browser não obtém
automaticamente a permissão confiável de Hub-to-Node; o Hub do Desktop precisa de um token próprio,
mTLS ou capability de uso único.

No MVP o Node Core, o Hub Core e o HTTP Gateway podem ficar no mesmo processo Node.js para reduzir a
complexidade de instalação, mas precisam usar service collections, identidades e interfaces de
ciclo de vida independentes. No longo prazo é possível separar processos sem mudar o protocolo.

### Mapeamento da Entrada Atual para a Entrada Alvo

| Implementação atual                          | Semântica atual                                          | Migração alvo                                                            |
| --------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| `entry-http.ts -> createLocalServices()`     | O processo HTTP do Lite mantém Node services diretamente | Extrair o Node Core; adicionar um Hub Gateway independente no mesmo listener |
| `/ws`                                         | O Browser conecta direto aos Node services, replayable fixo | O Browser passa a conectar ao Hub endpoint; o Hub roteia o Node local / remoto |
| `/ws/host`                                    | O Desktop Node Host conecta direto ao Node com capability de uso único | Manter como endpoint confiável Hub-to-Node e estender identidade estável e reconexão |
| `entry-stdio.ts -> createLocalServices()`    | SSH / WSL / Docker inicia um Server de negócio por conexão | Migrar para shim de bootstrap / tunnel; o negócio fica só no Node daemon estável |
| per-window Remote Host                        | Pool de SSH / WSL por janela, Docker dedicado            | Connector pool do Hub app-wide                                         |
| Desktop Main mobile bridge                    | O frame do relay chega ao Host existente de alguma janela | O device transport do relay chega ao attachment lógico do Hub           |

Hoje o Browser Web só lê um `ZCODE_SERVER_WORKSPACE` e não consegue gerenciar um catálogo dinâmico de
workspaces; a Web comum também não processa completamente anexos temporários de texto longo. O Hub /
Workspace Registry e o Resource Store alvo precisam preencher esses contratos primeiro, antes de
abrir a gestão Web cross-node, e não basta exibir a entrada na UI.

### TUI

A TUI é o cliente local do pacote de instalação Lite / Node e não participa da agregação cross-Node:

```text
TUI on A
  -> local socket / in-process adapter
  -> Node A
  -> workspace Agent
```

Ela pode reutilizar a Node API e o conversation protocol da V4, mas não oferece entrada de
gerenciamento SSH e não atua como Hub de outras máquinas.

### Um Binário, Vários Papéis

Recomenda-se publicar finalmente o mesmo conjunto de runtime, distinguindo os papéis por
subcomando:

```text
zcode node serve       # 长期 Node daemon
zcode node connect     # 只做 stdio <-> local Node socket 字节桥
zcode hub serve        # 可独立运行的 Hub Gateway
zcode lite serve       # 监督 local Node + Hub + Web 静态入口
zcode tui              # 本机 UI，直接连接 local Node
```

`zcode node connect` não chama `createLocalServices()` nem inicia Agent; ele é apenas um transport
shim para quando SSH / WSL / Docker não conseguem encaminhar o socket local diretamente.

### Authority e Transport Ortogonais

`ssh`, `direct URL` ou `local socket` apenas dizem como chegar ao Node e não podem continuar
decidindo implicitamente a autoridade de modelos, credenciais e settings.

```text
Transport:
  local | direct-wss | ssh-tunnel | wsl-tunnel | docker-tunnel

Authority profile:
  account-managed
  hub-attached-compat
  node-standalone
```

- `account-managed`: o Model Profile da conta é a configuração desejada e o Node usa seu próprio
  credential binding / lease.
- `hub-attached-compat`: representa apenas o esquema legado de Desktop Registry já desativado; não
  é o modo de compatibilidade atual.
- `node-standalone`: um Node offline ou self-hosted usa Profile / vault locais.

Depois que o mesmo Node passa de SSH tunnel para direct WSS, ele não pode trocar de conjunto de
identidades de task, workspace, model ou extension por causa disso.

## Pilha de Comunicação

### Separação entre Camada de Protocolo e Camada de Transporte

```text
业务层
├─ Hub Protocol
│  ├─ Node registry / connection status
│  ├─ federated Task Summary query
│  ├─ account profile / view profile
│  └─ route(GlobalWorkspaceRef / GlobalTaskRef)
├─ Node Service Protocol
│  ├─ workspace / file / git / terminal / task index
│  ├─ extension inventory / readiness
│  └─ resource begin / chunk / commit
├─ ZCode Protocol V4
│  ├─ command ACK / query
│  ├─ conversation / sessions-index / workspace-config topic
│  └─ snapshot / delta / gap recovery
└─ Bootstrap Protocol
   ├─ install / upgrade / discover
   └─ NodeId / version / capability / endpoint

统一 RPC / frame 层
└─ @zcode/rpc IMessagePassingProtocol + typed runtime schema

Transport adapter
├─ MessagePort
├─ local socket / named pipe
├─ HTTPS + WSS
├─ SSH direct-tcpip / stdio tunnel
├─ WSL stdio tunnel
├─ Docker exec stdio tunnel
└─ mobile relay acknowledged rpc-frame
```

"O que o SSH envia é parecido com o WS" deve se concretizar assim: os dois carregam exatamente os
mesmos frames de Node RPC / V4, e não no código de SSH manter outro conjunto de métodos de serviço.
WebSocket é um carrier; o stdio de SSH / Docker também é apenas um carrier. O schema de negócio, o
escopo de conexão, a idempotência de commands, o protocolo de recursos e a semântica de recuperação
precisam ser iguais.

### Transport Recomendado por Enlace

| Enlace                            | Transporte físico                                      | Protocolo lógico             | Delivery padrão                       |
| --------------------------------- | ------------------------------------------------------ | ---------------------------- | ------------------------------------- |
| Desktop Renderer -> Desktop Hub   | Electron MessagePort                                  | Hub RPC                     | `desktop-continuous`                  |
| Browser Web -> Lite Hub           | same-origin WSS                                       | Hub RPC                     | `browser-replayable`                  |
| Mobile -> Hub                     | WSS relay + acknowledged opaque `rpc-frame`           | Hub RPC                     | `mobile-remote-replayable`            |
| Desktop / Lite Hub -> direct Node | authenticated WSS                                     | Node RPC + multiplexed V4   | determinado pelo logical attachment   |
| Hub -> local embedded Node        | MessagePort / named pipe / local socket               | Node RPC + multiplexed V4   | determinado pelo logical attachment   |
| Hub -> SSH Node                   | socket frames dentro do SSH tunnel                    | idêntico ao do Node direto  | determinado pelo logical attachment   |
| Hub -> WSL Node                   | stdio connector -> socket local do distro             | idêntico ao do Node direto  | determinado pelo logical attachment   |
| Hub -> Docker Node                | `docker exec -i` connector -> socket local do container | idêntico ao do Node direto | determinado pelo logical attachment   |
| Node -> Agent                     | child-process stdio NDJSON                            | ZCode Protocol V4           | conexão interna do Node               |

`browser-replayable` e `mobile-remote-replayable` podem reutilizar o mesmo algoritmo replayable, mas
precisam manter client roles diferentes, evitando misturar em um único modo o pareamento do celular,
o attachment do Hub e as permissões same-origin do Browser. Durante a migração eles podem ser
mapeados para o `web-remote-replayable` existente.

### Um Link Físico de Node, Vários Attachments Lógicos

O Hub precisa manter apenas poucas conexões físicas para o mesmo Node, mas o reúso físico não pode
engolir o isolamento de conexão existente:

```text
Hub C == one authenticated physical link ==> Node A
          │
          ├─ attachment d1
          │   role=desktop
          │   profile=continuous
          │   connectionId=node-assigned-1
          │
          ├─ attachment b1
          │   role=browser
          │   profile=replayable
          │   connectionId=node-assigned-2
          │
          └─ attachment m1
              role=mobile-remote
              profile=replayable
              connectionId=node-assigned-3
```

Cada attachment lógico precisa ter em propriedade, de forma independente:

- `connectionId`
- subscription registry
- buffer / saturation state
- fragment assembly
- resync flight
- permission / elicitation visibility

O Node só aceita attachment roles abertos por um Hub autenticado; o payload da UI não pode especificar
`clientMode` diretamente. No MVP é possível abrir um WebSocket separado por attachment e só fazer
multiplexação física depois que o contrato estiver estável.

O Hub apenas roteia frames e gerencia conexões; o seq, snapshot, queue e command lookup da
conversation continuam sendo autoritativamente mantidos pelo Node / Agent de origem.

## Bootstrap e Tunnel de SSH / WSL / Docker

### Sequência Unificada

```text
Hub Connector        Bootstrap Adapter          Target Node
     |                       |                       |
     |-- detect/install ---->|                       |
     |                       |-- install/upgrade --->|
     |                       |-- ensure daemon ----->|
     |                       |<-- bootstrap result --|
     |<-- NodeId/endpoint ---|                       |
     |                                               |
     |==== authenticated Node Protocol over tunnel ==|
     |-- hello(nodeId, protocol range, role) -------->|
     |<-- capability / bootId / workspace registry --|
     |-- open logical attachment -------------------->|
     |<== Node RPC / V4 / resource frames ===========>|
```

O retorno de bootstrap contém no mínimo:

```ts
interface NodeBootstrapResult {
  nodeId: string;
  bootId: string;
  nodeVersion: string;
  protocolRange: { min: number; max: number };
  capabilities: string[];
  endpoint: {
    kind: "loopback-tcp" | "unix-socket" | "named-pipe" | "direct-url";
    address: string;
  };
  connectionChallenge: string;
}
```

`connectionChallenge` só pode ser trocado por uma capability Hub-to-Node de curta duração e não pode
se tornar uma credencial clara de longo prazo.

### SSH

```text
ssh2
  1. 上传/升级统一 Node runtime
  2. 启动或发现 zcode node serve
  3. Node 仅监听远端 loopback
  4. ssh2.forwardOut 建 direct-tcpip tunnel
  5. tunnel 上运行与 direct WSS 相同的 Node frame
```

Se o ambiente alvo não puder usar direct-tcpip, executa-se `zcode node connect`, encaminhando o stdio
do SSH puramente para o Node local socket. O legado
`entry-stdio.ts -> createLocalServices()` é mantido por apenas um ciclo de migração e não é a
arquitetura de longo prazo.

### WSL

```text
wsl.exe ... zcode node connect
  -> distro 内 Unix socket
  -> persistent Node daemon
```

Dessa forma as diferenças de forwarding de localhost do Windows afetam apenas o adapter e não o Node
RPC. Um distro WSL não é terminado por causa do fechamento de uma janela do Desktop.

### Docker

```text
docker exec -i <container> zcode node connect
  -> container 内 Unix socket
  -> persistent Node daemon
```

Se o container já expõe e protege explicitamente a porta HTTPS / WSS do Node, o Hub pode conectar por
direct URL; caso contrário usa-se por padrão o exec tunnel, sem exigir que o usuário recrie o
container adicionando `-p`. O ciclo de vida do Node segue o container, e o ciclo de vida de
workspace / Agent é decidido pelo `WorkspaceLeaseManager` unificado, sem reiniciar todo o Server a
cada session de UI.

### Lite / Headless Node Instalado Manualmente

Depois que o usuário inicia via `zcode lite serve` ou `zcode node serve`:

- o Browser Web conecta ao Hub endpoint local;
- o Desktop conecta por direct URL ao Node endpoint da mesma porta;
- a TUI local usa o local socket;
- o bootstrap SSH / Docker reutiliza diretamente quando encontra o mesmo NodeId e não inicia um
  segundo runtime.

URL de conexão, alias SSH, nome de container Docker e distro WSL só entram no `ConnectionProfile` e
não entram na identidade permanente de Node / Workspace / Task.

## Transferência de Arquivos e Recursos Externos

Conversão automática de texto longo em arquivo, arrastar imagens e quaisquer recursos externos
precisam passar pelo mesmo Resource Store do Node alvo:

```text
Desktop / Browser / Mobile bytes
            |
            v
Hub route(GlobalWorkspaceRef)
            |
            v
Node resource/begin
  -> resource/chunk*
  -> resource/commit
            |
            v
ResourceRef { nodeId, workspaceId, resourceId, sha256, mediaType, size }
            |
            v
Prompt 只携带 ResourceRef
            |
            v
目标 Node materialize / stream 给 workspace Agent
```

Regras:

1. Um caminho local da UI nunca pode ser enviado diretamente a um Agent remoto.
2. O Hub não transforma recursos em arquivos autoritativos de negócio; ele apenas roteia em stream e
   mantém o progresso da transferência.
3. O Node valida comprimento, hash, cota e lease do workspace alvo antes do `commit`.
4. O ResourceRef precisa conter `nodeId + workspaceId`; é proibido reutilizar por engano entre Nodes.
5. Após uma interrupção de conexão, a retomada usa upload id / committed chunks; é proibido enviar um
   arquivo grande inteiro em base64 dentro do conversation RPC.
6. Arquivos temporários de texto longo, screenshots, imagens arrastadas e objetos `File` do browser
   compartilham a mesma API.
7. O Node é responsável por gerar o caminho local ou o byte stream legível pelo Agent; o CLI não
   precisa saber se o arquivo original veio do Desktop, da Web ou do celular.

Portanto, quando o Browser A gerencia o Node B, o caminho de recurso é
`Browser A -> Hub A -> Node B Resource Store`, e não escrever o caminho temporário do Node A no prompt.

## Controle Remoto pelo Celular

### Posição na Arquitetura

O celular é um attachment de UI remoto do Hub:

```text
Mobile Browser
  -> external relay
  -> selected Hub device transport
  -> Hub node registry / router
  -> existing Node logical attachment
  -> source workspace Agent
```

O estado-alvo converge o relay device transport e o shared attachment manager para o Hub Gateway. O
Desktop main mantém apenas QR code, janelas e agendamento de processos; o Lite Hub também pode
registrar o relay device role depois que o usuário o habilita explicitamente.

### Limites de Capacidade

- O celular pode navegar pelos Nodes A / B / C conhecidos pelo Hub e pelo Task Summary agregado.
- Quando o celular abre uma Task, o Hub cria um logical attachment `mobile-remote-replayable` no Node
  de origem.
- Queda de conexão, refresh ou reconexão do relay no celular apenas reconstroem o attachment e não
  param o Hub, o Node ou o Agent.
- O relay continua enxergando apenas frames `rpc-frame` opacos; replay / gap / snapshot acontecem
  entre Node / Agent e a UI do celular.
- Na primeira fase o celular não pode instalar Node, inserir credenciais SSH nem iniciar novos
  bootstraps SSH / WSL / Docker.
- Quando um Hub já conectado fica offline, o celular só vê resumos stale; se o Hub pode reconectar
  automaticamente conforme um profile pré-autorizado é uma política de produto separada.
- Commands do celular e do Desktop / Browser entram no mesmo `CommandInbox` do Agent de origem; não há
  nova mobile queue.

### Diferenças em Relação ao Browser Web

```text
Browser Web:
  same-origin WSS -> Lite Hub -> one or more Nodes

Mobile Remote:
  relay WSS -> 已配对 Hub -> one or more Nodes
```

Os dois podem renderizar o mesmo conjunto de componentes de UI e ambos usam delivery replayable, mas
a autenticação, a entrada e o owner da conexão são diferentes.

## Ciclo de Vida e Fronteiras de Falha

```text
UI attachment lifetime       = 页面 / 窗口 / 手机 bridge
Hub lifetime                 = Desktop App 或 Lite Hub service
Tunnel lifetime              = Hub 到 Node 的一次物理连接
Node daemon lifetime         = 节点级，独立于 UI 和 tunnel
Workspace lease lifetime     = attachment + running task + policy / idle TTL
Agent lifetime               = workspaceKey 级，由 Node WorkspaceLeaseManager 管理
Conversation lifetime        = Agent session store，不等于任何进程连接
```

É preciso satisfazer:

1. Fechar uma aba de UI libera apenas o seu attachment lógico.
2. Um refresh do Browser ou uma reconexão do celular não reinicia Node nem Agent.
3. Depois que o Hub crasha e reinicia, ele se recupera a partir do Node registry, do Task Summary e do
   snapshot V4; não reproduz logs privados de negócio.
4. Uma queda do SSH tunnel não mata imediatamente o Node daemon; se o Agent continua é decidido pelo
   running task / lease policy.
5. Parar o container, shutting down do WSL ou desligar a máquina mudam o `bootId` do Node; o Hub
   precisa invalidar os attachments / subscriptions / cursors antigos e refazer o handshake.
6. O shutdown do Node primeiro interrompe novos commands, fecha os attachments, aguarda o process
   tree do Agent e o checkpoint dos bancos, e só então sai.
7. Account Control Plane, relay ou Hub temporariamente indisponíveis não podem corromper os dados
   locais de Task / Session do Node.

### Fronteiras de Segurança

- Por padrão o Node só escuta loopback / Unix socket / named pipe; endereços públicos precisam
  habilitar TLS e token / mTLS explicitamente.
- UI token, capability Hub-to-Node, credencial de bootstrap e credencial de conta usam audiences
  diferentes.
- O Node atribui o `connectionId` e injeta o delivery profile conforme o role autenticado.
- O Hub guarda apenas Connection Profiles e referências de credenciais revogáveis e não escreve
  senhas SSH ou API Keys no task catalog.
- direct URL, SSH tunnel e relay precisam fazer negotiation de versão de protocolo e de capabilities.
- Upload de recursos, terminal, escrita de arquivos, bootstrap e entrega de Secrets da conta são
  autorizados separadamente; não se pode depender apenas de "já conectou no Node".

## Escopo de Estado

| Escopo     | Dados autoritativos                                                                                     | Semântica de sincronização                                                          |
| ---------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| account    | Provider / Model metadata, ordem de exibição, modelo padrão, tupla global do último modelo explícito, visão de agrupamento cross-end opcional | versionada por revision, convergindo entre Hub / Node da mesma conta |
| credential | API Keys, OAuth tokens, Coding Plan keys, runtime headers                                               | separado do metadata; usa sync E2E por política, vault local do Node ou lease de curta duração |
| hub/device | Connection Profiles de Node, estado de conexão, layout de UI, cache de catálogo offline persistente       | local do dispositivo; não pode ser a autoridade de Task / Session                  |
| node       | Plugins realmente instalados, user Skills / Subagents, toolchain, Node capability, runtime cache       | independente por máquina, copiável explicitamente, sem união automática nem sobrescrita |
| workspace  | `.zcode/*` / `.agents/*` dentro do repo, workspace extensions, configurações do projeto                  | fica no workspace do Node alvo e se propaga naturalmente por Git / sistema de arquivos |
| session    | provider / model / thought / mode atuais, mensagens, queue, owner, stream, permission                   | apenas no Node runtime que executa aquela Session                                  |

## Configuração de Modelos

### Divisão Alvo

O `ZCodeProviderRegistrySnapshot` legado continha ao mesmo tempo metadata e raw secrets; essa cadeia
de snapshots já foi removida. O design alvo multi-Node ainda precisa manter configuração desejada,
Credential Binding e Lease de execução como três cadeias independentes:

```text
Account Model Profile
  ProviderCatalogSnapshot
  - provider / model / capability / baseURL / order / defaults
  - metadataRevision
                  │
             ▼
Node Runtime Binding
  - providerId / modelId / metadataRevision
  - credentialBindingId
                  │
                  ▼
Credential Plane
  - encrypted Node secret 或短期 credential lease
  - audience = nodeId + workspaceId + sessionId
  - credentialRevision / expiry / revocation
```

Tipos sugeridos:

```ts
interface ModelProfile {
  profileId: string;
  revision: string;
  providers: ProviderMetadata[];
  defaultModelRef?: string;
  lastExplicitSelection?: {
    modelRef: string;
    thoughtLevel?: string;
  };
}

interface NodeModelReadiness {
  nodeId: string;
  profileRevision: string;
  providers: Array<{
    providerId: string;
    status: "ready" | "missing-credential" | "unsupported" | "stale";
    reason?: string;
  }>;
}
```

Regras:

1. Todas as pontas exibem o mesmo `ModelProfile`.
2. O Node reporta readiness separadamente; "configuração igual" e "o Node alvo já consegue executar"
   não viram um único campo.
3. Antes de criar uma nova Session, o Node precisa aplicar a revision do Profile alvo e só então
   resolver o modelo padrão.
4. Sessions existentes mantêm seu próprio provider / model / thought; abrir uma Session histórica não
   reescreve preferências globais.
5. Quando o Node alvo está sem credenciais, por padrão a criação / envio é bloqueada com uma entrada
   clara de correção, sem trocar silenciosamente para um modelo disponível em outra máquina.
6. O "enviar o registry completo junto com raw secrets" do SSH attached ao Desktop atual existe apenas
   como caminho de compatibilidade durante a migração; o novo protocolo envia apenas catalog revision
   e credential binding / lease.

### Pendente de Decisão

- As custom API Keys precisam obrigatoriamente de sync E2E criptografado entre as pontas:
  - Recomendado: Provider metadata fortemente sincronizado; Secret com suporte a sync E2E de conta e
    com opção de definir por Provider como Node-local.
  - Solução simplificada: todos os Secrets Node-local; nesse caso o catálogo de modelos é igual em
    todas as pontas, mas a readiness pode diferir.

## Skill / Plugin / Subagent

### Semântica de Produto

1. O extension inventory é consultado por `nodeId + workspaceId` e não pode usar a união de todos os
   Nodes como candidato da tarefa atual.
2. Quando a tarefa atual vem do Node B:
   - o Composer / Slash command / Agent picker usam as capacidades de B;
   - a edição de Skill / Plugin / Subagent em Settings também é submetida a B;
   - o estado de instalação de A / C não pode afetar o runtime de B.
3. A página de Settings global precisa de um seletor de Node; é possível oferecer uma matriz "todos os
   nodes", mas a matriz serve apenas para comparação e não como diretório de execução.
4. Skill / Plugin / Subagent de nível de usuário são Node-local.
5. Workspace Skills / Subagents dentro do repo são descobertos no checkout do Node alvo.
6. "Copiar para outros nodes" é uma ação explícita, que precisa de preview, seleção de destino e
   tratamento de conflitos; não há sincronização automática em background.
7. O Subagent profile referencia o model ref do Model Profile da conta, mas o arquivo de profile e o
   estado de enabled / override continuam pertencendo ao Node ou ao Workspace.

### Lacunas da Implementação Atual

- Os Skills / Plugins de SSH / WSL já passam pelo serviço remoto.
- O serviço de configurações de Subagents de SSH / WSL ainda aponta para o Desktop local, enquanto o
  runtime lê arquivos remotos; antes da arquitetura unificada é preciso eliminar essa divisão entre
  UI e runtime.
- O campo `workspace` de Plugin ainda não forma uma semântica completa de isolamento por workspace e
  não pode ser tratado como design alvo concluído.

## Agregação de Session / Task

### Não Trazer o Corpo de Todas as Sessions

O Hub só agrega Task Summaries; o usuário abre uma task e só então o snapshot / página de
conversation é lido do Node de origem.

```text
Node A sorted TaskSummary page ─┐
Node B sorted TaskSummary page ─┼─ Hub k-way merge ── unified task list
Node C sorted TaskSummary page ─┘

select {nodeId, workspaceId, taskId}
  -> route to origin Node
  -> subscribe continuous / replayable
  -> on-demand session snapshot and rows
```

### Novo Protocolo de Consulta

```ts
interface FederatedTaskQuery {
  kind: "timeline" | "workspace" | "pinned" | "archived";
  sortBy: "created" | "updated";
  search?: string;
  workspaceIds?: string[];
  pageSize: number;
  cursor?: string;
}

interface NodeTaskSummaryPage {
  nodeId: string;
  taskIndexRevision: string;
  sessionIndexRevision: {
    logEpoch: string;
    seq: number;
  };
  items: TaskSummary[];
  nextCursor?: string;
}
```

O protocolo exige que cada Node use exatamente a mesma ordem total. O tie-break global precisa conter
`nodeId + workspaceId + taskId` e não se pode continuar assumindo que `taskId` não colide entre
endpoints.

### Separação entre Running e Paginação de Histórico

Recomenda-se tirar as running tasks, que mudam com frequência, do cursor de histórico:

```text
有界、实时、全量的 running overlay
                 +
稳定 keyset 分页的 terminal / history rows
```

A semântica de ordenação atual é mantida:

- running fica no topo como um todo;
- dentro de running, por `createdAt DESC` e depois pelo Global Task ref global;
- não running:
  - created: `createdAt DESC, updatedAt DESC, GlobalTaskRef`
  - updated: `updatedAt DESC, createdAt DESC, GlobalTaskRef`

O cursor de página de histórico precisa estar vinculado a pelo menos:

```text
queryHash
topologyEpoch
nodeId -> taskIndexRevision / sessionIndexRevision / shardCursor
after -> primaryTime / secondaryTime / GlobalTaskRef
```

Quando o conjunto de nodes ou as revisions mudam, retorna `cursor-stale` e recarrega, sem pular
itens silenciosamente.

### Tempo Entre Máquinas

No MVP é possível manter `createdAt / updatedAt` e usar o Global Task ref como tie-break estável; isso
só garante determinismo e não elimina a deriva de relógios entre máquinas.

No longo prazo recomenda-se adicionar:

```text
ActivityStamp = { physicalMs, logical, nodeId }
```

Dados legados são migrados como `{ updatedAt, 0, nodeId }`. O Node troca diagnósticos de relógio no
handshake e, em caso de deriva grave, marca isso na UI; não se pode alterar o histórico de criação
usando o horário em que o Hub recebeu a mensagem.

### Offline

O cache do renderer hoje não é persistido. O Federated Hub precisa de um catálogo materializado
read-only:

- key: `GlobalTaskRef`
- conteúdo: Task Summary, membership, tombstone, revision de origem, lastSeenAt
- quando o Node está offline, exibe stale / offline
- o catálogo offline permite apenas navegar resumos; abrir o corpo, enviar, stop, permission e
  comandos semelhantes precisam esperar o Node de origem ficar online
- quando o Node volta, converge incrementalmente por revision / tombstone

## Visão de "Grupos"

### Os Dois Tipos de Agrupamento Não Podem Ser Misturados

1. Agrupamento por Workspace: derivado de `GlobalWorkspaceRef`, com as tarefas ainda paginadas por
   tempo.
2. "Grupos" personalizados pelo usuário: são organização de dados da UI, e a ordenação vem de um
   `sortOrder` explícito, não do tempo da Task.

### Autoridade Recomendada

Os agrupamentos personalizados cross-Node não podem simplesmente unir os `task_groups` de cada Node.
Recomenda-se que um `FederatedTaskViewProfile` em nível de conta seja o único detentor:

```ts
interface FederatedTaskViewProfile {
  revision: string;
  groups: Array<{
    groupId: string;
    title: string;
    color: string;
    sortOrder: number;
  }>;
  members: Array<{
    groupId: string;
    task: GlobalTaskRef;
    sortOrder: number;
  }>;
  topLevel: Array<
    | { type: "group"; groupId: string; sortOrder: number }
    | { type: "task"; task: GlobalTaskRef; sortOrder: number }
  >;
}
```

Todos os membros e os nós de nível superior precisam persistir uma ordem explícita; a nova arquitetura
não pode mais depender de o cliente varrer tudo e completar a ordem com `max + 1000`.

Portanto:

- A Timeline não precisa trazer tudo; usa paginação por Node + Hub k-way merge.
- O Group personalizado lê primeiro o View Profile leve e depois busca em lote os Summaries dos
  `GlobalTaskRef` visíveis nos Nodes correspondentes.
- O cursor de paginação do Group usa `viewRevision + groupId + sortOrder + GlobalTaskRef`.
- Quando um Node está offline, os membros permanecem e mostram o resumo offline, sem remoção automática
  do Group.

### Pendente de Decisão

- A Web em A e o Desktop em C precisam compartilhar exatamente os mesmos Groups / ordens manuais
  personalizados:
  - Recomendado: sincronizado em nível de conta, idêntico em todas as UIs.
  - Opcional: Hub-device-local, permitindo layouts diferentes por UI, mas deixando de satisfazer um
    "agrupamento único" estrito.

## Modelo de Identidade

### Alvo

```text
NodeId       = Node 数据目录中一次生成并持久化的 UUID
WorkspaceId  = Node Workspace Registry 中的稳定 UUID

GlobalWorkspaceRef = { nodeId, workspaceId }
GlobalTaskRef      = { nodeId, workspaceId, taskId }
```

- URL de Node, hostname, alias SSH, porta e username são connection route, não NodeId.
- `workspacePath` é um atributo mutável do Workspace Registry, não o WorkspaceId.
- `remoteSessionId` continua sendo um handle de curta duração de um attachment do Hub e não entra na
  identidade global.
- Os adapters SSH / WSL / Docker / direct URL traduzem o antigo `workspaceIdentity` em um WorkspaceId
  local do Node no ingress do Node; o banco do Node não deve produzir múltiplos conjuntos de Tasks
  por causa do modo de acesso.

Um MVP progressivo pode usar primeiro o caminho normalizado dentro do Node como workspace key
canônico, mas o RPC precisa introduzir `WorkspaceRef` primeiro, abrindo espaço para um WorkspaceId
estável.

### Pré-requisito do NodeId Estável

O serverId HTTP atual pode recorrer ao hostname, e o hello do SSH stdio também não tem serverId.
Antes da migração é preciso:

1. Gerar e persistir um UUID no diretório de dados do Node.
2. Os handshakes de bootstrap HTTP, SSH stdio, WSL e Docker retornarem o mesmo NodeId.
3. O Hub detectar NodeIds duplicados; após o clone de uma VM não se pode tratar silenciosamente duas
   máquinas como o mesmo Node.
4. Oferecer na reinstalação um fluxo de "reivindicar o Node antigo", sem merge automático por
   hostname.

## Migração de Dados Legados

### Superfície de Migração

```text
目标 Node
├─ ~/.zcode/v2/tasks-index.sqlite
│  ├─ tasks
│  ├─ task_group_members
│  ├─ task_group_view_node_orders
│  ├─ task_group_workspace_bootstraps
│  ├─ automations
│  └─ automation_runs
├─ ~/.zcode/cli/db/db.sqlite
│  └─ session.workspace_id
├─ ~/.zcode/v2/sessions/<legacyWorkspaceHash>/
├─ workspace config / provider isolation hash directories
└─ Hub / Desktop lastWorkspaceSession 与 connection credentials
```

Campos como `messages / parts / todos / targets` são relacionados por `session_id` e não exigem
alterar a workspace key.

### Alias e Ledger

Primeiro entra a camada de compatibilidade, depois os dados são movidos:

```text
workspace_registry(
  workspace_id,
  canonical_path,
  ...
)

workspace_alias(
  alias_key,
  workspace_id,
  source_kind,
  verified_node_id,
  created_at
)

migration_run(
  migration_id,
  source_alias,
  workspace_id,
  phase,
  error,
  updated_at
)
```

Quando clientes legados continuam passando `remote:ssh:*`, o alias de ingress precisa resolvê-lo
primeiro para o workspace canônico; caso contrário, depois da migração os clientes legados escreveriam
a key antiga novamente.

### Saga Idempotente

Dois SQLite não podem ter transação entre bancos, então a migração precisa ser recuperável:

```text
prepared
   -> task_index_done
   -> session_store_done
   -> files_and_settings_done
   -> verified
```

1. `prepared`
   - o handshake obtém um NodeId estável;
   - só são aceitos aliases legados exatos que provem pertencer ao Node atual;
   - valida o identity path contra o workspace path da linha;
   - faz backups consistentes dos dois bancos WAL separadamente;
   - escreve o alias e o migration ledger.
2. `task_index_done`
   - mescla `tasks`, atualizando colunas escalares e `meta_json`;
   - atualiza os group members;
   - resolve e reescreve o `node_key` de nível superior nos formatos novo e antigo;
   - atualiza a workspace key de bootstrap, preservando `group_id`, título, cor e ordem já existentes;
   - atualiza automations / automation runs;
   - não apaga aliases antigos.
3. `session_store_done`
   - só atualiza os `session.id` exatos da lista de migração;
   - valida simultaneamente `directory == canonicalPath` e `old workspace_id == source alias`;
   - é proibido atualizar a tabela inteira por diretório.
4. `files_and_settings_done`
   - diretórios de hash legado são copiados / mapeados como alias e validados primeiro, sem mover nem
     apagar o diretório original;
   - `lastWorkspaceSession` passa a ser GlobalWorkspaceRef;
   - endereço SSH e informações de migração vão para o Connection Profile e deixam de se misturar na
     workspace identity;
   - não copia, não apaga e não registra secrets em texto claro por causa da migração da identidade de
     Task.
5. `verified`
   - todas as linhas da lista de Tasks abrem a Session correspondente;
   - Group, pin, archive, deleted, unread e automation podem ser reconciliados;
   - cold start, Web local, TUI e Desktop remoto usam o mesmo WorkspaceRef;
   - aliases legados e backups são mantidos por pelo menos um ciclo de versão.

### Conflitos

Quando o mesmo `taskId` aparece sob o mesmo workspace canônico:

1. Se o resumo do conteúdo da Session for igual, trata-se como a mesma Task e os metadados de shell
   são mesclados.
2. Se o conteúdo da Session for diferente, não se pode sobrescrever; grava-se um migration conflict,
   mantêm-se as duas cópias e exige-se escolha manual, ou dá-se a uma delas uma nova identidade de
   Task.
3. Campos automáticos:
   - `createdAt` pega o mais antigo;
   - `updatedAt / unreadAt` pegam o mais recente;
   - o título prioriza a versão com override manual do usuário;
   - terminal / model / searchable text usam a projeção da Session legal mais recente.
4. Campos de produto não podem ser combinados por OR direto:
   - conflitos de pinned / archived / deleted precisam ser arbitrados por regras explícitas de
     membership;
   - conflitos de Group e ordem precisam ser arbitrados pela View Profile revision;
   - até as regras serem confirmadas, registra-se o conflict e não se ressuscita automaticamente uma
     Task deletada.

### Importação de Groups Antigos

Cada Hub / Node pode já ter layouts locais de Group diferentes. Recomenda-se:

- importar cada layout antigo com um `legacyViewOrigin` independente;
- não mesclar Groups de mesmo nome automaticamente;
- com apenas uma origem, pode-se adotar diretamente;
- com múltiplas origens, mantém-se por padrão como um agrupamento separado "de <dispositivo>", e a
  mesclagem ocorre depois da confirmação do usuário;
- o task ref passa pelo mapeamento de workspace alias antes de entrar no View Profile da conta.

## Implantação por Fases

### Phase 0: Contratos, Identidade e Observabilidade

- handshake de NodeId estável.
- Workspace Registry / WorkspaceRef / schema de alias.
- Todas as keys de Task, logs e diagnósticos passam a usar GlobalTaskRef.
- Definir Hub Protocol, Node Protocol, Bootstrap Protocol e Resource Transfer Protocol.
- Introduzir no nível de protocolo o connection role confiável e o logical attachment, sem alterar os
  transports existentes.
- Começar com inventory read-only e migration dry-run.

### Phase 1: Node Core e Hub Core

- Extrair um único root de composição de Node Core a partir de `entry-http` / `entry-stdio`.
- Implementar lock de single-owner do Node local, descoberta de daemon e fallback embedded.
- O Desktop passa a um Hub Process app-wide, com múltiplas janelas reusando-o via attachments MessagePort
  independentes.
- O Lite ganha um Hub Core logicamente independente; a UI do Browser conecta apenas ao Hub endpoint.
- Manter o Host per-window existente como caminho de compatibilidade e observar em dual stack primeiro,
  sem remover imediatamente.

### Phase 2: Bootstrap, Tunnel e Transferência de Recursos Unificados

- SSH / WSL / Docker ficam responsáveis apenas por instalar, iniciar, atualizar, descobrir e conectar o
  Node daemon.
- Direct URL, Browser Web, Desktop e TUI usam a mesma Node API.
- SSH usa direct-tcpip; WSL / Docker usam `zcode node connect` até o local socket.
- Introduzir um `WorkspaceLeaseManager` unificado, eliminando as três semânticas diferentes de reciclagem
  de Host / Agent.
- Textos longos, imagens e arquivos externos entram unificados no Node Resource Store.
- O business server stdio legado é mantido por um ciclo de compatibilidade; o compat shim faz apenas
  transport.

### Phase 3: Node API e Catálogo Agregado

- Node Task Summary keyset API.
- Separação entre running overlay e paginação de histórico.
- Hub k-way merge, epoch de topologia e catálogo offline persistente.
- Ao abrir uma Task, rotear pelo Node de origem; a semântica de delivery da conversation não muda.

### Phase 4: Escopo de Modelos e Extensions

- Separar ProviderCatalog e Credential Binding.
- Sync de Account Model Profile por revision.
- Node readiness.
- Corrigir a divisão de Subagent UI / runtime em SSH / WSL.
- Adicionar um seletor de Node em Extension Settings.

### Phase 5: Federated Group

- Account View Profile.
- UI de dry-run / import / conflict para Groups antigos.
- Persistência autoritativa de todos os sortOrder.
- Consulta dos membros de grupo por GlobalTaskRef.

### Phase 6: Migração de Dados Legados e Saída dos Caminhos Antigos

- saga de migração dos dois bancos.
- alias de hash de arquivos.
- Separação entre history e credential route no Desktop.
- Leitura em canário, escrita dupla unificada, validação, rollback e limpeza após o ciclo de versão.
- Remover o caminho principal remoto `entry-stdio -> createLocalServices()`.
- Remover os business Hosts SSH / Docker per-window, mantendo os adapters de bootstrap / tunnel.

## Planejamento de Cases

### Dimensões Principais

| Dimensão   | Valores representativos                                                                      |
| ---------- | -------------------------------------------------------------------------------------------- |
| UI         | Browser Web / Desktop / Mobile remote                                                        |
| Node       | local / direct server / SSH bootstrap / offline                                              |
| delivery   | desktop-continuous / browser-replayable / mobile-remote-replayable                           |
| transport  | MessagePort / direct WSS / SSH tunnel / WSL connector / Docker connector / relay             |
| config     | Profile current / Node stale / missing credential                                            |
| task state | running / terminal / archived / deleted                                                      |
| list       | timeline / workspace / pinned / grouped                                                      |
| resource   | long-paste file / image / browser File / mobile attachment                                   |
| migration  | clean / duplicate alias / same task same content / same task divergent                       |

### Primeiros Cases Candidatos

| ID     | Setup                                                      | Action                         | Assertion                                                                                       | Status           |
| ------ | ---------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------------------------------------- | ---------------- |
| FED-01 | A Web conecta em Node A/B, o Desktop C em A/B/C             | Criar Task em cada Node        | Ambas as UIs exibem por GlobalTaskRef, sem deduplicar errado por taskId / path iguais           | accepted         |
| FED-02 | Três Nodes com várias páginas de terminal Task e running Task | Rolar a timeline                | Running overlay no topo; k-way merge do histórico sem duplicar nem perder; não traz o corpo      | proposed         |
| FED-03 | Node B offline, Hub com cache de catálogo antigo             | Abrir a lista unificada         | Tasks de B aparecem stale/offline; commands bloqueados; A/C funcionam normalmente               | proposed         |
| FED-04 | Account Profile revision N, Node B ainda em N-1              | Criar Task em B                | Sincroniza primeiro até N; sem credencial bloqueia explicitamente, sem trocar de modelo em silêncio | proposed         |
| FED-05 | Skills / Plugins / Subagents diferentes entre A/B            | Abrir o menu de candidatos no Task de B | Mostra só o workspace de B + o inventory do node de B; a matriz global não participa da execução | accepted         |
| FED-06 | Account Group com Tasks de A/B                              | Arrastar e soltar na Web A, refresh no Desktop C | As duas pontas convergem pela mesma View Profile revision                     | pending-decision |
| FED-07 | Alias SSH antigo e novo Node WorkspaceRef apontando para os mesmos dados | Executar a migração e fazer cold start | Tasks, Sessions, Groups e automations reconciliáveis; o alias antigo não gera mais linhas | proposed         |
| FED-08 | Dois aliases antigos com o mesmo taskId e conteúdos de Session diferentes | Executar a migração | Sem sobrescrita; conflict gerado, dados originais e backups preservados             | proposed         |
| FED-09 | Celular se anexa ao Hub do Desktop C                        | Alternar e ver Tasks de A/B/C  | Usa apenas attachments existentes; não cria Node runtime; fronteiras de recuperação replayable inalteradas | accepted         |
| FED-10 | Node B já iniciado pelo Lite, e o Desktop o descobre via SSH  | Desktop conecta no mesmo workspace | Reusa o mesmo NodeId / WorkspaceId; não cria um segundo Server, Task Index ou Agent owner | proposed         |
| FED-11 | Desktop e Browser operando a mesma Task do Node A           | Ambas as pontes assinam e enviam | Isolamento de logical connection; continuous / replayable se recuperam cada um; commands entram no mesmo CLI inbox | proposed         |
| FED-12 | Running task no Node B, SSH tunnel cai                      | Hub reconecta o tunnel          | Node / Agent não saem por causa da queda do tunnel; recupera pelo novo bootId / logEpoch ou falha explicitamente | proposed         |
| FED-13 | Docker sem porta exposta                                    | Desktop conecta no container    | O connector `docker exec` só encaminha o local socket; o RPC de negócio tem o mesmo schema do direct WSS | proposed         |
| FED-14 | Desktop converte texto longo em arquivo, Browser arrasta imagem no Node B | Envia o prompt | Recurso é commitado primeiro no Resource Store de B; o prompt contém só o ResourceRef de B; legível pelo Agent | proposed         |
| FED-15 | Celular conecta ao Hub C, Node B offline                    | Abre uma Task histórica de B   | Mostra só o resumo stale; o celular não dispara bootstrap SSH / Docker                            | accepted         |
| FED-16 | Lite Node e Desktop embedded Node disputando o mesmo data dir | Início concorrente nas duas pontas | O lock de single-owner garante um único Node owner; a outra ponta descobre e conecta ou falha explicitamente | proposed         |
| FED-17 | Browser comum forja o desktop clientMode                   | Estabelece conexão com o Node  | O Node ignora o valor autodeclarado pelo cliente e injeta o profile replayable conforme o role autenticado | accepted         |

### Poda

- Não fazer o produto cartesiano de UI × Node × delivery × todos os estados de Task; o estado final do
  Task Summary é provado pelo contrato da Node API, e Desktop / Web recebem apenas um representante
  agregado cada.
- Skill, Plugin e Subagent recebem um representante de isolamento cada; o invariante comum é a
  autoridade de Node capability.
- SSH / WSL / Docker não duplicam cases de agregação de negócio;representados apenas nas camadas de
  bootstrap / identity migration.
- Conversation queue / fork / compact não são cruzados com a paginação de listas; eles continuam
  cobertos pelo protocolo existente do Node de origem.
- O celular não é testado criando Hub / Node próprios, porque o contrato de produto proíbe isso.

## Superfície de Impacto

### must-inspect

- `packages/shared/src/remote-workspace-identity.ts`
- `packages/shared/src/remoteTarget.ts`
- `packages/shared/src/zcode-protocol/index.ts`
- `packages/services/src/session/taskIndexRepo.ts`
- `packages/services/src/session/automationRepo.ts`
- `apps/zcode-cli/packages/adapters/src/storage/session-store/`
- `packages/ui/src/hooks/useWorkspaceTaskLists.ts`
- `packages/ui/src/hooks/useGlobalTaskList.ts`
- `packages/ui/src/hooks/useGroupedTaskView.ts`
- `packages/ui/src/lib/buildGroupedTaskViewFromSessions.ts`
- `packages/ui/src/lib/taskListMembershipSets.ts`
- `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`
- `packages/desktop/src/main/desktopRemoteSessions.ts`
- `packages/desktop/src/main/desktopHostProcess.ts`
- `packages/desktop/src/main/webRemoteControlSharedHostAttachments.ts`
- `packages/desktop/src/host/serverRemoteConnection.ts`
- `packages/server/src/entry-http.ts`
- `packages/server/src/entry-stdio.ts`
- `packages/server/src/http.ts`
- `packages/server/src/remote/connect.ts`
- `packages/server/src/remote/create-backend.ts`
- `packages/server/src/remote/ssh-backend.ts`
- `packages/server/src/remote/wsl-backend.ts`
- `packages/server/src/remote/docker-backend.ts`
- `packages/services/src/node.ts`
- `packages/services/src/zcode-agent/zcodeAgentProcessManager.ts`
- `scripts/build-zcode-lite.mjs`

### should-inspect

- Armazenamento / registry / sync remoto de Model Provider
- Descoberta e sync de Skill / Plugin / Subagent
- Persistência de `lastWorkspaceSession` e do Connection Profile
- Snapshot da lista de workspaces remoto da Web
- Cache persistente do Hub, busca e membership de pin / archive
- Supervisor do Node daemon, lock de single-owner e bootId
- Capability de conexão Hub / Node e multiplex de logical attachment
- Cotas, retomada de upload, janitor e proteção contra uso errado entre Nodes do Resource Store

### invariant-only

- Runtime / conversation projection de Session V4
- owner / lease / queued command
- Desktop continuous e Mobile replayable
- Fronteira de repasse puro de relay / desktop main
- V4 CommandInbox, command ACK/query, owner/lease e subscription com escopo de conexão

## Delta Proposto do Feature Graph

Depois que a semântica de produto for confirmada, o feature graph deve ser atualizado, com as
sugestões de adição:

- `capability.federated-node-hub`
- `capability.unified-node-runtime`
- `state.account-model-profile`
- `state.node-capability-manifest`
- `state.federated-task-view-profile`
- `service.hub-core`
- `service.node-core`
- `service.node-bootstrap`
- `service.node-resource-store`
- `service.logical-attachment-multiplexer`
- `service.node-workspace-registry`
- `service.federated-task-query`
- `persistence.workspace-alias-ledger`
- `persistence.hub-task-summary-catalog`
- `boundary.browser-replayable`
- `boundary.mobile-remote-replayable`
- `invariant.global-task-ref`

## Pendente de Decisão do Usuário

1. As custom API Keys são sincronizadas E2E entre as pontas, ou só o metadata de modelo é sincronizado
   e o Secret permanece Node-local?
2. Os Groups / ordens manuais personalizados da Web em A e do Desktop em C precisam ser exatamente
   iguais?
3. Quando um Node está offline, é preciso continuar exibindo o resumo de Tasks da última vez depois de
   reiniciar a UI, ou exibir apenas "Node offline"?
4. Nos conflitos de pin / archive / deleted da mesma Task antiga, adota-se a prioridade conservadora
   `deleted > archived > pinned > normal`?
5. Quando o diretório de dados de um Node é clonado e gera NodeId duplicado, a máquina recém
   descoberta deve ser tratada por padrão como um clone e receber obrigatoriamente um novo NodeId?
6. O Node daemon roda de forma independente da UI e por longo prazo por padrão:
   - Recomendado: Lite / Node instalados manualmente rodam em longo prazo; o fallback embedded do
     Desktop segue o ciclo de vida do App;
   - Outra opção: todos os Nodes de bootstrap saem conforme a idle policy quando não têm task / lease.
7. O Lite Hub pode registrar o relay device role do celular como o Hub do Desktop:
   - Recomendado: sim, mas precisa de habilitação explícita do usuário; o celular continua não
     podendo fazer bootstrap de Node novo diretamente.
8. O Browser Web usa delivery replayable de forma fixa:
   - Recomendado: sim; abas de Browser são atualizadas, dormem e perdem rede e não devem se passar por
     Desktop continuous.
9. O Hub pode recuperar automaticamente Nodes offline com base em Connection Profiles pré-autorizados:
   - Recomendado: Desktop / Lite Hub podem recuperar conforme a política do dispositivo; o próprio
     attachment do celular não tem autoridade para criar ou modificar essa política.