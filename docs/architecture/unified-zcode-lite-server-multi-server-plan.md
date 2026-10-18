# Plano de Implementação da Arquitetura Unificada ZCode Lite / Server Multisservidor

## Status

- Tipo: arquitetura alvo inteiramente nova e plano de implementação
- Status: limites de produto confirmados, aguardando implementação por fases
- Escopo: Desktop, Browser Web, Remote Controller do celular, máquina local, SSH, WSL, Docker, Direct URL
- Base factual atual:
  - `docs/architecture/zcode-code-architecture-overview.md`
  - `docs/architecture/message-flow.md`
  - `docs/architecture/rpc.md`
  - `docs/web-remote-control/web-remote-control-architecture.md`
  - `docs/web-remote-control/task-realtime-sync.md`
  - `docs/web-remote-control-task-command-queue.md`
  - `docs/remote-prompt-attachment-materialization.md`
  - `docs/ssh-remote-app-global-state-authority.md`
  - `docs/task/task-sqlite-index.md`
  - `docs/working-memory/provider-refactor/design/environment/environment.md`
  - `docs/working-memory/provider-refactor/design/registry/runtime.md`

Este documento redefine a arquitetura alvo, sem tomar as implementações históricas de SSH/Web como modelo de destino. Durante a implementação é permitido manter camadas de adaptação de compatibilidade, mas no final é obrigatório convergir para os limites de processo, identidade, autoridade de estado e comunicação definidos aqui.

### Limite de produto temporário atual

O `Browser Web -> Lite Controller Runtime` citado adiante neste documento é a arquitetura alvo, não a implementação atual. Hoje o Web comum (incluindo a entrada Web de desenvolvimento e `zcode-lite serve`) ainda se conecta diretamente do navegador ao `/ws` de `@zcode/server`, sem um Desktop Window Host Controller. Portanto, até que o Lite / Browser Controller Runtime seja entregue e a regressão multicliente seja concluída, o Web comum não suporta a lista global de tarefas do lado esquerdo que depende do Window Host Controller nem a agregação multissource, e o renderer não mantém um segundo fallback de Controller.

```text
当前：Browser Web -> @zcode/server /ws -> createLocalServices()
                                      -X-> Window Host Controller

目标：Browser Web -> Lite Controller Runtime -> Local / Remote Server sources
```

Esse limite temporário não afeta o Desktop local, os workspaces SSH/WSL/Docker/Server do Desktop, nem o `/remote` do celular anexado a um Desktop Host existente. Os fatos atuais e o escopo concreto seguem o documento `docs/zcode-lite-static-distribution.md`, na seção de limites de suporte do Web comum atual.

## I. Objetivo

Um único conjunto de capacidades do ZCode Server dá suporte às seguintes entradas:

1. A UI do Desktop gerencia a máquina local e múltiplos Servers remotos.
2. O Browser Web gerencia essa máquina e múltiplos Servers remotos através de um ZCode Lite.
3. Um ZCode Lite pode se conectar a outro ZCode Lite.
4. O Remote Controller do celular se anexa a um Desktop ou Lite Controller existente, reutilizando sua visão multisservidor.
5. SSH, WSL, Docker e Direct URL afetam apenas a forma de estabelecer a conexão, sem alterar a semântica de RPC, recursos, Session e tarefas do camada acima.
6. Na mesma máquina, para o mesmo usuário de SO e o mesmo diretório raiz de dados, roda no máximo um ZCode Server lógico.
7. Cada Workspace roda no máximo um Agent CLI; um Server pode gerenciar múltiplos Workspace Agents ao mesmo tempo.

## II. Fora de escopo

- Não introduzir um serviço centralizado `ZCode Hub`.
- Não permitir que uma Session atravesse múltiplos Servers.
- Não sincronizar automaticamente as listas de conexões de Server salvas por controladores diferentes.
- Não permitir que o celular estabeleça sozinho conexões SSH/WSL/Docker ou inicie Agents.
- Não fazer multiusuário, papéis ou autorização de granularidade fina; um cliente autenticado tem as permissões completas do ZCode dentro do escopo daquele usuário de SO.
- Não rastrear movimentação ou renomeação de caminhos de Workspace; mudanças de caminho são tratadas como um novo Workspace.
- Na primeira fase não tratar autoinício após reboot do SO nem execução retroativa de tarefas perdidas; o Server continua em execução até o usuário fechá-lo manualmente.
- Não sincronizar ordem de exibição de Providers, estado de login OAuth, seleção de conexão atual ou modelo recente da UI.
- Não adicionar persistência跨 Server para agrupamentos; basta que as tarefas possam ser exibidas de forma agregada, e a ordenação entre Servers é de melhor esforço.

## III. Conceitos unificados

### 3.1 ZCode Lite

O ZCode Lite é um produto instalável, não equivalente a uma UI específica. Ele contém:

```text
ZCode Lite
├─ Stable Launcher
│  ├─ 监听、鉴权和稳定 Bootstrap Protocol
│  ├─ 版本协商、运行时缓存、安装和进程锁
│  └─ 启动一个当前 Server Core
├─ Versioned Runtimes
│  ├─ server/<version>
│  └─ connector/<version>
├─ Server Core
│  ├─ workspace / file / git / terminal
│  ├─ task / session / scheduler
│  ├─ model provider
│  ├─ plugins / skills / subagents
│  ├─ resource store
│  └─ workspace -> Agent CLI supervisor
├─ Browser Web 静态资源和 Web 控制入口
└─ 本机 TUI
```

A TUI é apenas a capacidade de UI local do Lite. Ela se anexa diretamente ao Server da máquina local e não assume responsabilidades de UI remota entre máquinas nem de transporte.

### 3.2 ZCode Server

O ZCode Server é a instância lógica composta por `Launcher + Server Core atual + diretório de dados`.

- Múltiplas versões de runtime de Server podem estar instaladas no disco ao mesmo tempo.
- Para o mesmo usuário e o mesmo diretório de dados, apenas um Server Core pode estar em execução por vez.
- O ciclo de vida do Server não acompanha nenhuma conexão de UI específica.
- Depois que a última UI se desconecta, o Server continua em execução para garantir que tarefas agendadas e tarefas em segundo plano possam rodar.

### 3.3 Controller Runtime

O Controller Runtime é o gerenciador de conexões por trás da UI; não é um Hub central e não possui dados de negócio remotos.

```text
Desktop UI
  -> Desktop Controller Runtime
     -> Server A / B / C

Browser Web（由 Lite A 提供）
  -> Lite A Controller Runtime
     -> Server A / B

手机 Remote
  -> 附着 Desktop 或 Lite Controller Runtime
     -> 复用其 Server A / B / C 连接
```

O Controller Runtime é responsável por:

- Salvar a configuração de conexões deste controlador.
- Estabelecer conexões Direct URL, SSH, WSL e Docker.
- Selecionar o Connector compatível.
- Agregar e projetar para a UI as listas somente-leitura de múltiplos Servers.
- Rotear as ações do usuário para o Source Server ao qual o objeto pertence.

O Controller Runtime não persiste o corpo de Sessions remotas, o runtime de tarefas remotas, recursos remotos nem cópias de configurações remotas.

### 3.4 Referências de Server, Workspace e Session

```ts
interface ServerRef {
  serverId: string;
}

interface WorkspaceRef {
  serverId: string;
  workspaceIdentity: string;
  workspacePath: string;
}

interface SessionRef {
  serverId: string;
  sessionId: string;
}
```

- `serverId` é uma identidade aleatória persistida dentro do diretório raiz de dados do Server, sem relação com IP, domínio, usuário SSH ou forma de conexão.
- `workspaceIdentity` é a identidade de isolamento de Workspace na máquina do Server; é proibido conter conta SSH, IP, domínio ou cadeia de jump hosts.
- `workspacePath` é usado apenas para exibição de caminho e IO real.
- Toda Session, Task e Workspace key da UI global deve carregar `serverId`.
- Dentro de um mesmo Server continua valendo `workspaceKey = workspaceIdentity?.trim() || workspacePath`.

## IV. Modelo de processos alvo

### 4.1 O Desktop gerencia A, B e C

```text
Machine C
├─ Desktop Renderer
├─ Desktop Controller Runtime
│  ├─ local connector ───────────────> Server C
│  ├─ SSH bootstrap + tunnel ────────> Server A
│  └─ Direct WSS / SSH tunnel ───────> Server B
└─ Bundled Lite Launcher
   └─ Server C
      ├─ Workspace C1 -> Agent CLI C1
      └─ Workspace C2 -> Agent CLI C2

Machine A
└─ Lite Launcher -> Server A
   ├─ Workspace A1 -> Agent CLI A1
   └─ Workspace A2 -> Agent CLI A2

Machine B
└─ Lite Launcher -> Server B
   └─ Workspace B1 -> Agent CLI B1
```

A máquina local do Desktop também funciona pelo contrato unificado de Server. Pode-se manter MessagePort ou um canal rápido intra-processo, mas isso é apenas uma implementação de `IMessagePassingProtocol` e não pode formar outra semântica de Services.

### 4.2 O Browser Web gerencia A e B

```text
Browser
  -> HTTP/WSS -> Lite A Controller Runtime
                   ├─ local connector -> Server A
                   └─ SSH/Direct connector -> Server B
```

O Browser não executa SSH diretamente. O navegador submete a intenção de conexão ao Controller Runtime do Lite A, e a capacidade Node em A estabelece a conexão SSH, WSL, Docker ou Direct URL.

### 4.3 O Remote Controller do celular

```text
Mobile Web
  -> relay / direct paired transport
  -> 已存在的 Desktop 或 Lite Controller attachment
  -> Controller 已连接的 Server
```

- O celular não tem Host, Server, Agent ou catálogo de conexões próprio.
- O celular vê a visão agregada multisservidor do controlador ao qual está anexado.
- O celular continua usando `web-remote-replayable`.
- O Desktop e a cadeia de controle Web comum usam `desktop-continuous` ou o perfil continuous confiável correspondente.
- `clientMode` / `deliveryKind` são injetados pelo attachment confiável; a UI não pode forjá-los.

## V. Comunicação unificada

### 5. O que se unifica são as mensagens e os serviços, não os enlaces físicos

```text
Typed Channel / V4 Protocol / Resource Protocol
                       |
              IMessagePassingProtocol
       ┌───────────────┼────────────────┐
       v               v                v
 MessagePort       WebSocket       SSH/WSL/Docker tunnel
 in-process        Direct WSS      bootstrap 后承载同样帧
```

O seguinte deve ser idêntico em todos os transportes:

- Nomes dos canais de serviço, comandos RPC, events e schemas.
- Comandos, ACK, snapshot, delta e subscription da Conversation V4.
- Referências de Workspace, Session, Task e recursos.
- Chunk, checksum, cancelamento, backpressure e códigos de erro.
- capability, versão e delivery profile.

O SSH é responsável apenas por:

1. Encontrar ou instalar o Stable Launcher.
2. Estabelecer um canal de bootstrap seguro.
3. Obter credenciais de dispositivo de curta duração.
4. Estabelecer um túnel até a porta de escuta do Launcher.

O SSH stdio deixa de hospedar um conjunto diferente de protocolos de negócio. Durante a migração, o RPC stdio atual pode ser empacotado como um adaptador de transporte unificado.

### 5.2 Jump hosts de múltiplos níveis

Jump hosts de múltiplos níveis pertencem à camada de Transport/Bootstrap do Controller:

```text
Controller
  -> SSH Connector
     -> Jump 1
        -> Jump 2
           -> Target Launcher
```

- A cadeia de jump hosts existe apenas na configuração de conexão e no backend SSH.
- Os protocolos de Server, Workspace, Session, Task e recursos não têm ciência dos jump hosts.
- A identidade do alvo é a `serverId` retornada pelo handshake; não se pode gerar identidade a partir da cadeia de jump hosts.

## VI. Negociação de versão

### 6.1 Bootstrap Protocol estável

O Launcher expõe um protocolo pequeno e estável:

```ts
interface BootstrapHello {
  launcherVersion: string;
  serverId: string;
  activeServerVersion?: string;
  supportedProtocolRanges: string[];
  capabilities: string[];
}
```

Fluxo do handshake:

```text
发起端 Launcher/Controller
  -> 读取目标 BootstrapHello
  -> 当前 Connector 兼容：直接连接
  -> 本机有匹配 Connector：启动该版本
  -> 本机无匹配 Connector：校验签名后安装
```

Regras do lado do alvo:

- Quando já há um Server Core em execução, não se pode trocar de versão nem iniciar um segundo Server Core para um novo cliente.
- O lado que inicia escolhe o Connector compatível com o Server ativo do alvo.
- Quando o alvo não tem Server Core, só então o Launcher escolhe uma versão compatível entre os runtimes instalados; se não houver, instala.
- O schema de dados só pode suffer upgrades monotônicos. Não é permitido rebaixar o runtime do Server para ler dados já migrados por causa de clientes antigos.

### 6.2 Capability tem precedência sobre o número de versão

As capacidades de produto são negociadas por capability. O Connector é responsável pela adaptação de versão e a UI controla as entradas conforme as capabilities. É proibido espalhar verificações de versão do Desktop ou do Server dentro de componentes de negócio.

## VII. Autenticação e escuta

### 7.1 Escuta

- Por padrão, escutar em `127.0.0.1`.
- SSH, WSL e Docker acessam o loopback por meio de túnel por padrão.
- Conexões de rede local ou pública só são permitidas quando o usuário configura explicitamente um endereço não-loopback.
- A escuta não-loopback exige autenticação; o TLS público pode ser fornecido pelo Launcher ou por um proxy reverso suportado.

### 7.2 Autenticação de dispositivo unificada

```text
SSH/WSL/Docker
  -> 已有安全通道内签发设备 Token

Direct URL
  -> 一次性配对码
  -> 长期、可撤销设备 Token

本机 Web/TUI
  -> Launcher 签发本机 Session

手机 Remote
  -> 现有配对流程
  -> 同一设备 Token 语义
```

Um cliente autenticado tem as permissões completas do ZCode Server sob aquele usuário de SO. A primeira fase não adiciona RBAC.

## VIII. Autoridade de estado

| Estado                                | Local da autoridade         | Agregação/espelho                     |
| ----------------------------------- | --------------------------- | ------------------------------------- |
| Arquivos, Git e Terminal do Workspace | Server ao qual o Workspace pertence | A UI apenas projeta          |
| Corpo e estado de execução da Session | Agent CLI do Source Server  | Projeção continuous/replayable da UI   |
| Lista de Tasks, títulos, pin, archive, agrupamentos | Índice de tasks do Source Server | Agregação de melhor esforço pelo Controller |
| Tarefas agendadas e agendador        | Source Server               | A UI apenas administra                 |
| Plugin, Skill e Subagent             | Respectivo Server           | Não mesclados entre Servers           |
| Definições de Provider               | Respectivo Server           | Sincronização explícita direcionada pelo usuário |
| OAuth, seleção de conexão e modelo recente | Respectivo Server/UI  | Não sincronizado                      |
| Lista de conexões de Server          | Cada Controller Runtime     | Não sincronizada automaticamente      |
| Theme, locale, rascunho e rolagem    | UI/Controller               | Não descem para a camada de negócio do Server |
| Prompt Resource                      | Source Server que o consome | O Controller apenas envia             |

A página de configurações da UI unificada precisa ter um seletor de Server explícito. Os menus de capacidade são construídos conforme as capabilities do Source Server da Task/Workspace atual; é proibido fazer a união das capabilities de A, B e C (Plugins, Skills ou ferramentas) e submeter ao Server errado.

## IX. Sincronização da configuração de Providers de modelo

A sincronização é uma operação direcional iniciada pelo usuário:

```text
Source Server A ──完整镜像──> Target Server B
```

### 9.1 O que é sincronizado

- Nome do Provider definido pelo usuário e estado de habilitação.
- Base URL, Endpoint Paths e formato de API.
- API Key digitada manualmente.
- Headers persistidos; mesmo que a UI atual ainda não ofereça edição de Headers, eles fazem parte da definição do Provider.
- Lista de modelos, mapeamento de IDs de modelo, limites de contexto e saída, reasoning, modais e capacidades de ferramentas, ou seja, a configuração de modelos do Provider.

### 9.2 O que não é sincronizado

- Estado de login OAuth e OAuth token.
- Seleção de conexão atual do Z.ai / BigModel, domain e family mode.
- Modelo recente, thought level e Agent config da UI.
- Headers exclusivos de runtime.
- Ordem de exibição dos Providers.
- Motivos de indisponibilidade derivados do sistema, resultados de teste de conexão e estado temporário de runtime.

### 9.3 Regras de merge

- O usuário precisa escolher primeiro o Source e o Target.
- Mesmo Provider ID: o Source sobrescreve o Target.
- Novo no Source: grava no Target.
- Existe apenas no Target: é removido do escopo de sincronização.
- O estado de OAuth/execução local do Target não é afetado.
- A importação precisa usar arquivo temporário ou transação de banco, substituindo atomicamente após a validação.
- Uma falha na sincronização preserva o estado original do Target e retorna um relatório legível.
- Secrets não vão para logs, nem para eventos de tarefa nem para snapshot replayable.

## X. Resource Store unificado

Conversão automática de texto longo em arquivo, arrastar imagens, selecionar arquivos e anexos do celular usam o mesmo protocolo de recursos:

```text
UI/Controller
  -> resource/begin
  -> resource/chunk*
  -> resource/commit(hash, size)
  -> Source Server Resource Store
  -> AttachmentRef(resourceId)
  -> Agent CLI 解析为本机可读路径
```

Regras centrais:

- No prompt não se pode passar o `localPath` da máquina do Controller como se fosse um caminho remoto.
- Antes da admissão de envio, o recurso precisa estar no Source Server que o consome.
- RPC/WS/túnel SSH transportam a mesma semântica de chunk; SFTP pode servir como otimização de adaptador de upload, mas não pode alterar o contrato da camada superior.
- `AttachmentRef` usa `resourceId`; o caminho materializado local só é gerado dentro do Source Server.
- O commit valida size/hash; em caso de falha o prompt não pode chegar ao CLI.
- Após o commit bem-sucedido, o recurso é adotado pela Session/fila; uploads não adotados são reciclados pelo janitor.
- Uploads do celular continuam roteados pelo Controller anexado até o Source Server; o relay/main não guarda estado de negócio de recursos.

## XI. Session multisservidor

Uma Session pode estar associada a múltiplos Workspaces, mas não pode atravessar Servers:

```ts
interface SessionWorkspaceBinding {
  primary: WorkspaceRef;
  secondary: WorkspaceRef[];
}
```

Restrições:

- `primary.serverId === secondary[i].serverId`.
- O Primary é imutável após a criação.
- O Secondary pode ser acrescentado, removido e reordenado.
- O Agent CLI roda no Workspace Primary.
- A Task aparece apenas na lista do Workspace Primary.
- O Secondary apenas estende, dentro do mesmo Server, o escopo de acesso a arquivos, Git, Terminal e ferramentas.
- Ao submeter o binding, o Server precisa validar que todos os WorkspaceRef pertencem a ele mesmo; requisições entre Servers são rejeitadas diretamente.

## XII. Lacunas em relação ao estado atual

| Área               | Implementação atual                                                                 | Alvo                                                                          |
| ----------------- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Ciclo de vida SSH | O Desktop inicia e mantém o `zcode-server` stdio remoto                               | Launcher persistente por usuário + um Server                                   |
| Entrada do Server | `entry-stdio.ts` e `entry-http.ts` separados                                         | Server Core compartilhado; a entrada é apenas um adaptador de transporte       |
| Desktop local     | Local Host por janela                                                                | Server unificado na máquina local; a janela é apenas um cliente                |
| SSH Host          | Remote Host compartilhado no nível da janela                                         | O Controller se conecta ao Server de usuário do alvo                           |
| Identidade        | remote route + workspace path participam da identidade                                | serverId persistente + workspaceIdentity local do Server                       |
| Autoridade de Provider | Cada Environment atual possui seu próprio Config, Credential e Registry; o Desktop não distribui o Registry | Cada Server continua sendo a própria autoridade; futuramente, um Provisioning explícito A→B grava no Store do alvo |
| Anexos            | Caminho local do host é staged eager para um caminho remoto                         | Resource Store + resourceId                                                     |
| Web               | Principalmente cliente estático `/remote` do celular                                | O Lite fornece Browser Web completo + Controller multisservidor                |
| Celular           | Anexado a um único Local/Remote Host existente, que hospeda o escopo do workspace alvo | Anexado ao Controller, reutilizando sua visão multisservidor               |
| Versão            | Após fazer o deploy do bundle atual do Desktop, inicia diretamente                 | Launcher estável + Connector/Server runtime versionado                        |

## XIII. Fases de implementação

### Fase 0: linha de base de testes e congelamento do protocolo

Primeiro completar a documentação e os testes, sem alterar os caminhos padrão:

1. Adicionar ao catálogo de casos de conversa e à matriz de cobertura casos de múltiplos Servers, upload de recursos, negociação de versão e attachment do celular.
2. Estabelecer testes de contrato para stdio, HTTP/WS, server-remote e remote prompt attachment atuais.
3. Salvar a linha de base de rede/logs existente do Desktop continuous e do replayable do celular.
4. Estabelecer a topologia de testes SSH em Docker: Controller, Jump 1, Jump 2, Target A, Target B.

Condição de saída: o comportamento atual é reproduzível em testes e cada fase seguinte consegue provar que não alterou a semântica da conversation V4.

### Fase 1: identidade compartilhada e contrato de conexão

1. Adicionar em `packages/shared` schemas estritos:
   - `ServerDescriptor`
   - `ServerRef`
   - `WorkspaceRef`
   - `SessionRef`
   - `ServerCapabilities`
   - `BootstrapHello`
2. Adicionar as interfaces `IServerConnection` / `IServerDirectory` do lado do Controller.
3. Alterar todas as keys globais da UI para conter pelo menos `serverId`.
4. As conexões existentes geram descriptors temporários por meio de um adaptador de compatibilidade, sem alterar a persistência imediatamente.

Condição de saída: uma UI consegue manter ao mesmo tempo duas tarefas com o mesmo `workspacePath` e `serverId` diferentes, sem misturar estados.

### Fase 2: Stable Launcher e gerenciamento de versões

1. Implementar o processo Launcher, o endpoint de bootstrap estável e o lock do diretório raiz de dados.
2. Implementar o manifesto de runtime, verificação de assinatura, download, cache e limpeza.
3. Implementar a seleção de versão do Connector.
4. Escolher um runtime de Server compatível quando o alvo não tem Server ativo.
5. Quando o alvo já tem Server ativo, trocar apenas o Connector do lado que iniciou.

Condição de saída: a matriz de versões não inicia um segundo Server e não lê schemas novos com um runtime antigo.

### Fase 3: unificar as entradas do Server Core

1. Extrair o mesmo `createZCodeServerCore()` de `entry-stdio.ts` e `entry-http.ts`.
2. stdio, WS e MessagePort passam a apenas fornecer `IMessagePassingProtocol`.
3. O Server Core passa a deter a coleção de services, o scheduler, o registro de workspaces, o índice de tasks e o supervisor de Agents.
4. O desligamento da UI libera apenas o attachment, sem encerrar o Server.
5. O Desktop local entra primeiro no Server unificado por meio de um local connector de compatibilidade.

Condição de saída: depois que o Desktop sai ou o Browser fecha, o Server e as tarefas agendadas continuam vivos; eles só encerram quando o usuário fecha manualmente.

### Fase 4: conexões multisservidor do Controller

1. Extrair o Desktop Controller Runtime.
2. Montar o mesmo Controller Runtime no Lite para uso pelo Browser Web.
3. Implementar os adaptadores de transporte direct, SSH, WSL e Docker.
4. O SSH suporta ProxyJump/multi-hop, mas isso só aparece na camada de backend.
5. A lista de conexões é persistida localmente pelo Controller, sem sincronização automática.
6. As consultas da UI carregam `serverId`, e as ações voltam ao Source Server.

Condição de saída: o Web em A gerencia A/B e o Desktop em C gerencia A/B/C ao mesmo tempo, sem misturar o estado dos três Source Servers.

### Fase 5: migração de identidade de Server/Workspace

1. Gerar e persistir um `serverId` na primeira inicialização de cada diretório raiz de dados.
2. Estabelecer um registro de Workspaces local do Server.
3. Varrer as workspace keys do `tasks-index.sqlite` antigo que carregam conta SSH/IP/informações do alvo.
4. Mapear para a nova identidade de workspace pelo `workspace_path` dentro do Server de destino.
5. Mesclar automaticamente em caso de ausência de conflito; conflitos de título, agrupamento, pin ou ordenação vão para um relatório de migração.
6. Depois de gravar as novas keys, manter um caminho de leitura de compatibilidade por uma versão e uma marca de migração concluída.
7. Rejeitar o segundo inicializador quando o mesmo diretório de dados com o mesmo serverId roda em paralelo; a restauração de backup offline pode manter a identidade.

Condição de saída:

- Depois que o IP, domínio, porta ou conta SSH muda, o handshake retorna o mesmo serverId e as tarefas históricas continuam existindo.
- Quando o caminho do Workspace muda, ele é tratado como um novo Workspace.
- A migração pode ser executada repetidamente sem gerar tarefas duplicadas.

### Fase 6: Resource Store

1. Primeiro acrescentar testes para colagem muito longa, arrastar imagens, arquivos comuns e retentativas com falha.
2. Adicionar as APIs resource begin/chunk/commit/abort/adopt.
3. O Server implementa hash de conteúdo, gravação atômica em disco, referências e GC.
4. O Composer passa a enviar `AttachmentRef(resourceId)`.
5. Manter o `IPromptAttachmentTransferService` atual como facade de compatibilidade, mas internamente passando pela Resource API.
6. Remover a dependência de `localPath` do Controller nos prompts remotos.

Condição de saída: em um Target SSH via Docker, todos os caminhos de anexos lidos pelo Agent ficam no Target; o caminho temporário do Controller não aparece no protocolo nem no prompt.

### Fase 7: autoridade de estado do Server e sincronização de Providers

1. Remover a sobreposição de autoridade de Provider `desktop-attached-remote` da arquitetura alvo.
2. Cada Server usa seu próprio `modelProviderService`.
3. Adicionar `exportProviderDefinitions` / `importProviderDefinitions` tipados.
4. Implementar o espelhamento atômico Source→Target, logs com Secrets mascarados e rollback em caso de falha.
5. Adicionar à página de configurações a seleção de Server e a confirmação da direção da sincronização.
6. Plugin, Skill e Subagent são lidos apenas do Source Server selecionado.

Condição de saída: após A→B as definições de Provider do usuário são idênticas; o OAuth, a seleção de conexão local e o modelo recente de B não mudam; Plugins, Skills e Subagents de A/B podem diferir.

### Fase 8: Session multisservidor

1. Estender o schema de Session para primary imutável + secondary mutável.
2. Validar na gravação que todos os WorkspaceRef têm o mesmo serverId.
3. O Agent runtime do Primary obtém capabilities controladas de Secondary Workspace dentro do Server.
4. O índice de tasks estabelece a associação apenas pelo Workspace Primary.
5. Resume, fork, snapshot e migration preservam o binding.

Condição de saída: Workspaces primário e secundário do mesmo Server permitem leitura e escrita; secondary entre Servers é rejeitado em duas camadas, schema e service.

### Fase 9: attachment do Controller no celular

1. Estender o attachment de workspace do celular para um attachment de Controller.
2. O celular reutiliza a lista de Servers do Controller e as consultas agregadas.
3. Depois de abrir a task, ele continua se anexando ao escopo de Host/CLI já existente no Source Server.
4. Preservar a recuperação de gap/snapshot de `web-remote-replayable`.
5. Não permitir que relay/main possua estado de negócio de tasks, recursos ou catálogo de conexões.

Condição de saída: o celular enxerga A/B/C do controlador; a recuperação após desconexão não afeta o Desktop continuous; o celular não pode criar um runtime SSH independente.

### Fase 10: remover os caminhos principais antigos

Remover somente depois de atender a todos os marcos de migração:

- O caminho principal do Server stdio remoto com ciclo de vida atrelado ao Desktop.
- A identidade de workspace derivada de remote route.
- Qualquer caminho de compatibilidade que reintroduza a sobreposição automática do Desktop sobre o Provider Registry remoto.
- Branches de compatibilidade que passam `localPath` de anexos do prompt entre máquinas.
- O caminho em que o Host de negócio local por janela é a única fonte de autoridade.

## XIV. Matriz de verificação

### 14.1 Topologias obrigatórias

```text
Host C: Desktop + local Server C
Docker A: SSH + Lite Server A
Docker B: Direct URL + Lite Server B
Docker J1 -> Docker J2 -> Docker A: 两层跳板
Mobile browser: attachment to C 或 A Controller
```

### 14.2 Casos principais

| ID      | Setup                            | Ação            | Asserções                                                     |
| ------- | -------------------------------- | --------------- | ------------------------------------------------------------- |
| UMS-001 | C conecta A/B/C                  | Buscar tarefas  | Tarefas com o mesmo path são isoladas por serverId e exibidas de forma agregada |
| UMS-002 | C conecta a A por dois endereços SSH | Completa o handshake | Aparece apenas um Server A, sem duplicar tarefas históricas  |
| UMS-003 | Todas as UIs de A se desconectam | Chega o horário do cron | Server/Agent rodam sob demanda e registram o resultado       |
| UMS-004 | A roda v4, C tem v5 por padrão   | C conecta a A    | C escolhe o Connector v4; A não reinicia nem rebaixa         |
| UMS-005 | A sem Server ativo               | C conecta a A    | O Launcher escolhe um runtime instalado compatível; instala se faltar |
| UMS-006 | Cola muito longa em Workspace SSH | Envia o Prompt  | O recurso existe em A, o Agent consegue ler e o localPath de C não vaza |
| UMS-007 | Arrasta imagem em Workspace SSH  | Envia o Prompt  | bytes/hash da imagem corretos, retentativa não adota em duplicidade |
| UMS-008 | Sincroniza Provider A→B         | Inspeciona B    | Definições/API Key/headers espelhados; OAuth/estado da UI inalterados |
| UMS-009 | Sincronização reversa B→A       | Inspeciona A    | A direção escolhida pelo usuário determina um único Source    |
| UMS-010 | Skills de A/B diferentes        | Troca de Task   | O menu troca conforme o Source Server, sem união de capabilities |
| UMS-011 | Celular anexa a C                | Navega em A/B/C | Lista visível; abrir task usa replayable                    |
| UMS-012 | Gap no celular + streaming no Desktop | Recupera    | O snapshot do celular converge e o continuous do Desktop não concatena replay |
| UMS-013 | primary e secondary da Session estão em A | Acessa diretório secundário | Sucesso; a Task é listada apenas no primary          |
| UMS-014 | secondary da Session aponta para B | Salva      | schema/service rejeitam explicitamente                     |
| UMS-015 | Key SSH antiga contém conta/IP  | Primeira migração | Tasks migram para a key local do Server, mesclagem automática sem conflito |
| UMS-016 | Clona o diretório de dados de A e inicia em paralelo | Inicia a segunda cópia | Conflito de lease de serverId; o que iniciou depois é rejeitado |
| UMS-017 | Renomeia o caminho de A          | Abre o novo caminho | Tratado como novo Workspace, sem associar automaticamente aos dados antigos |
| UMS-018 | Dois níveis de Jump Host        | Conecta a A     | O handshake de negócio expõe apenas o serverId de A, sem a identidade dos jumps |

### 14.3 Camada de evidências

Cada E2E de alto risco coleta no mínimo:

- UI: estado visível de Server, Workspace e Task.
- Protocolo: bootstrap hello, capability, rota do source server, resource commit.
- Processo: Launcher, quantidade de Server Core, quantidade de Agents de workspace.
- Arquivos: identidade do server, registro de workspaces, índice de tasks, resource store.
- Rede: frames de Direct WS ou túnel SSH; é proibido registrar Secrets.
- Recuperação: sequência continuous e watermark/gap/snapshot do replayable.

## XV. Publicação e rollback

1. Publicar primeiro o novo schema e o handshake somente-leitura, sem mudar os caminhos antigos.
2. Em seguida, liberar Launcher e server persistente em escala gradual, mantendo o connector de compatibilidade stdio.
3. A migração de identidade usa schema version explícito, log de migração e marca de conclusão.
4. O Resource Store faz double write/verificação antes de parar de enviar `localPath` entre máquinas.
5. A troca de autoridade de Provider precisa de um gate de capability; é proibido que conjuntos novo e antigo cubram o mesmo runtime simultaneamente.
6. Cada fase oferece a capacidade de rollback para o Connector antigo, mas sem rebaixar schemas de dados já migrados.
7. Antes de remover o código de compatibilidade, concluir ao menos a matriz completa de Desktop, Browser, Mobile, SSH, WSL e Docker.

## XVI. Invariantes que precisam ser preservados

1. O CLI continua sendo a autoridade do corpo e do estado de execução da Session.
2. O índice de tasks não pode se tornar a autoridade do conteúdo da Session nem da configuração atual de runtime.
3. Relay/Main faz apenas autenticação, pareamento, repasse de frames e agendamento de attachments.
4. O continuous do Desktop e o replayable do celular permanecem independentes.
5. `workspacePath` é usado apenas para execução/exibição; a identidade usa serverId + workspaceIdentity.
6. Uma Session não atravessa Servers.
7. Há apenas um Server Core por diretório raiz de dados por vez.
8. No máximo um Agent CLI por Workspace.
9. Secrets não entram em logs, eventos de tarefa, snapshots ou relatórios de migração.
10. Arquivos, configurações de modelo, tarefas e ações de capacidade sempre voltam ao Source Server ao qual o objeto pertence.

## XVII. Definição de conclusão

A arquitetura unificada só está concluída quando todas as condições abaixo forem atendidas ao mesmo tempo:

- Desktop, Browser Web e celular usam o mesmo conjunto de referências de Server/Workspace/Session.
- Máquina local, Direct URL, SSH, WSL e Docker têm apenas diferenças de transport/bootstrap.
- Cada máquina executa apenas um Server lógico por usuário de SO.
- A UI pode gerenciar pelo menos três Servers ao mesmo tempo, sem misturar estado, capabilities ou Secrets.
- Textos muito longos e todos os anexos externos são assumidos pelo Resource Store do Source Server.
- Tarefas SSH antigas migram suavemente após mudanças de IP/conta.
- O usuário pode espelhar Definitions de Provider de forma direcionada, mantendo estados locais como OAuth isolados.
- A visão multisservidor do celular continua respeitando o attachment de shared host e a recuperação replayable.
- `pnpm typecheck`, `pnpm lint`, os testes unitários de protocolo, os testes de integração de SSH/jump hosts em Docker e os E2E principais passam integralmente.