# Visão geral da arquitetura de código do Z Code (fatos atuais)

> Este documento é o ponto de entrada atual da arquitetura de processos e camadas. Propostas históricas e planos de migração não podem sobrepor o escopo descrito aqui.

## Modelo em uma frase

O Z Code pode executar múltiplas workspace windows; cada janela tem exatamente um Window Host e, no máximo, um CLI de chat por workspaceKey. O Renderer acessa capacidades apenas através da fronteira service/protocol; o CLI mantém o estado autoritativo da conversation. A conexão e os scoped services de um workspace remoto também são gerenciados pelo mesmo Host da janela.

```text
Electron App
├─ Main Process（调度/原生能力/attachment 中转）
└─ Workspace Window（每个窗口独立一组）
   ├─ Renderer
   └─ Window Host（唯一 PID）
      ├─ LocalSource
      │  ├─ workspaceKey A ── stdio ── zcode-cli A
      │  └─ workspaceKey B ── stdio ── zcode-cli B
      ├─ RemoteConnectionRegistry
      │  ├─ SSH / WSL pooled connection
      │  ├─ Docker / Server dedicated connection
      │  └─ remoteSessionId -> workspaceKey scoped services
      ├─ ControllerProjection（workspace/task 列表事实）
      └─ AttachmentRegistry
         ├─ desktop-continuous
         └─ web-remote-replayable
```

Janela, Host, conexão e workspace não são o mesmo nível: o Host da janela isola os CLIs locais por workspaceKey e mantém, dentro do processo, a conexão remota e a logical session. SSH compartilha uma única conexão e um único `zcode-server` remoto na mesma janela e sob o mesmo target normalizado; WSL compartilha a conexão por distro/usuário normalizados e preserva o TTL de idle de 60 segundos e a proteção de running-task já existentes; Docker e Server mantêm conexão dedicada. Todos os transports continuam mantendo `remoteSessionId`, attachment e workspaceKey independentes: reutilização de conexão não equivale a fusão de identidade de workspace.

## Responsabilidades dos processos

### Main Process

Faz apenas o agendamento de plataforma: ciclo de vida das janelas, native dialog, external URL, OAuth callback, supervisão do único Window Host Process da janela, requisições de controle de conexão remota e encaminhamento leve de MessagePort/broadcast/attachment de controle remoto, além do recebimento de logs. O Main não possui o pool de conexões, o ciclo de vida da logical session, a projeção de tasks, rows, streams, queues, snapshots, goals ou interaction states; o `remoteSessionId` é atribuído pelo Window Host.

### Renderer

É responsável pela React UI, pelo roteamento, pelo layout e por estados locais como rascunho/rolagem/foco; envia intenções por hooks/service proxy e pelo transport V4; assina snapshot/delta para renderizar a projection. O Renderer não chama Repo/Node/CLI diretamente e não mantém uma segunda cópia autoritativa da conversation.

### Host Process

É inicializado por `createLocalServices({ parentPort })` para os serviços locais da janela e mantém, no mesmo processo, `RemoteConnectionRegistry`, `ControllerProjection` e `AttachmentRegistry`. O Host seleciona ou inicia o CLI local por workspaceKey, ou roteia a facade scoped para o service autoritativo remoto; a qualidade de membro de listas, os fatos de online/execução/espera e o roteamento de escrita de listas são mantidos pelo Controller, mas o Host não monta rows de conversation, streams, permissões ou runtime snapshot para o reducer do CLI.

Uma janela registra apenas um `hostId` realtime. Cada attachment mantém de forma independente um `clientMode` confiável, assinatura, seq, backpressure e dispose; fechar um attachment não destrói uma conexão que ainda tem outros owners. Uma desconexão remota preserva a última projeção de task confiável e marca offline; todas as operações de IO/mutação falham de forma fechada e não há retorno ao local; após a reconexão, um novo snapshot da source substitui atomicamente o anterior.

O fechamento real da janela, o encerramento do app e a instalação de update esperam apenas o Host único daquela janela; internamente o Host faz uma liberação limitada de attachments, do registry remoto e dos serviços locais. A desconexão de um attachment do celular libera apenas o attachment e não entra na barreira de shutdown do Host.

### zcode-cli

No máximo um processo de CLI de chat por workspaceKey. O CLI hospeda o session/core runtime, a inbox de comandos V4, as decisões de idempotência/CAS, o reducer de ProductProjection, os conversation topics, queues, goals, interactions, tools e o estado de execução do modelo.

## Identidade do workspace

```text
workspaceKey = workspaceIdentity?.trim() || workspacePath
```

- Identidade/isolamento usam o workspaceKey: mapeamento de CLI, vínculo de sessão, cache, fila, persistência e correlação entre processos.
- Execução de arquivos usa o workspacePath: cwd, leitura/escrita de arquivos, Git e exibição de caminhos.
- SSH/WSL/Docker devem passar `workspaceIdentity`; o controle remoto também percorre o `remoteSessionId`.

Não é permitido derivar a mesma identidade de workspace a partir do mesmo caminho remoto, nem escrever manualmente o formato da remote identity no código de negócio.

## Camadas do monorepo

| Módulo               | Responsabilidade                                          |
| ------------------- | -------------------------------------------------------- |
| `packages/shared`   | tipos entre processos, schema V4, identidade de workspace e contratos de plataforma |
| `packages/rpc`      | Channel RPC, transport MessagePort/WebSocket, middleware de logs |
| `packages/services` | interfaces de serviços de negócio do Host e implementações em Node |
| `packages/client`   | service proxy e montagem do transport do cliente          |
| `packages/ui`       | React UI independente de plataforma, hooks, store de projection V4 |
| `packages/desktop`  | shell Electron main/preload/renderer/host                 |
| `apps/zcode-cli`    | Agent core, command, projection e app-server              |

```text
UI -> hooks/types -> service/protocol contracts
Host services -> adapters/interfaces -> runtime implementations
Desktop/Web shells -> dependency injection -> shared UI
```

É proibido a UI chamar o Repo diretamente, a Service referenciar implementações concretas de Runtime, a importação entre domínios de módulos que não sejam Types, ou a formação de dependências circulares.

## Fluxo de dados da Conversation

```text
UI command
  -> Host transport
  -> workspace CLI command inbox
  -> core events
  -> ProductProjection
  -> snapshot/delta
  -> SessionDataLayer
  -> ConversationProjectionStore
  -> UI rows/status/composer
```

Desktop e mobile compartilham essa cadeia de fatos. A diferença está apenas no delivery profile: desktop é continuous; celular é replayable, com recuperação por snapshot em caso de gap. relay/Main não pode rebaixar o estado de negócio para baixo da fronteira.

## Abstração de plataforma e regras de UI

- A UI acessa capacidades de plataforma como seleção de diretório e links externos por meio do `IPlatformService`.
- Os componentes obtêm dependências por hooks como `useServices()` e `usePlatform()`, sem usar diretamente `window.zcode` ou singletons de service.
- Diferenças entre Desktop/Web/Mobile são tratadas por montagem e injeção de dependências, sem branches de plataforma hardcoded em componentes compartilhados.

## Pontos de entrada dos fatos atuais

- [Camadas do protocolo de comunicação](./communication-protocol-layers.md)
- [ZCode Protocol](../zcode-protocol.md)
- [Message Flow](./message-flow.md)
- [Web Remote Control Architecture](../web-remote-control/web-remote-control-architecture.md)
- [Task Realtime Sync](../web-remote-control/task-realtime-sync.md)
- [Chat Message Queue](../ui/chat-message-queue.md)