# Design de Compartilhamento de SSH Remote Host por Janela

## Feature Summary

| Campo | Valor |
| --- | --- |
| Change | Ajusta o workspace SSH remoto do Desktop de "um Remote Host por workspace" para "um Remote Host compartilhado por configuração de conexão SSH dentro da mesma janela Electron". |
| Superfícies visíveis ao usuário | Conexão SSH, seleção de diretório remoto, tab de workspace remoto, desconexão e reconexão, reload do Renderer, entrada do `/remote` do celular em workspace SSH. |
| Docs existentes | `docs/architecture/zcode-code-architecture-overview.md`、`docs/architecture/message-flow.md`、`docs/remote-workspace-session-unified-settings.md`、`docs/ssh-remote-app-global-state-authority.md`、`docs/web-remote-control/web-remote-control-architecture.md`、`docs/web-remote-control/task-realtime-sync.md`、`docs/web-remote-control-task-command-queue.md`、`docs/remote/desktop-remote-session-renderer-reattach.md`。 |
| Owners de código existentes | `packages/desktop/src/main/desktopRemoteSessions.ts`、`packages/desktop/src/main/desktopHostProcess.ts`、`packages/desktop/src/host/index.ts`、`packages/desktop/src/renderer/src/main.tsx`、`packages/ui/src/store/remoteWorkspaceSessionStore.ts`、`packages/ui/src/root/useRemoteWorkspaceHistory.ts`、`packages/ui/src/root/useRemoteWorkspaceTabLifecycle.ts`。 |
| Fora de escopo | Compartilhamento de Host de WSL/Docker, compartilhamento entre janelas Electron, modelo de dados de SSH Profile, UI de desconexão em nível de Host, daemon remoto residente, reconexão automática no cold start do App. |

## Contexto e Problema Atual

Hoje a janela local do Desktop cria apenas um Local Host. Dentro de um Local Host, o
`ZCodeAgentService` gerencia múltiplos processos de Agent por `workspaceKey`, portanto múltiplos
workspaces locais na mesma janela compartilham o processo de Host.

O workspace SSH remoto funciona de forma diferente hoje: `createRemoteWorkspaceSession()` gera um
novo `remoteSessionId` a cada chamada, faz fork de um novo Remote Workspace Host, estabelece uma nova
conexão SSH e inicia um novo `zcode-server` no remoto. Mesmo quando dois workspaces usam exatamente a
mesma configuração de login SSH, o handshake SSH, a sondagem de ambiente remoto, a verificação de
deploy de recursos e a inicialização do server são repetidos.

A implementação atual acopla três identidades:

```text
remoteSessionId
  = workspace 的 Renderer RPC 路由身份
  = Main 侧 Remote Host 进程身份
  = Web Remote Control shared-host attachment 的查找身份
```

O próprio `zcode-server` remoto não tem restrição de "um processo só pode servir um workspace". O
`ZCodeAgentService`, o `ZCodeSessionService`, o task index e o estado do provider registry criados por
ele via `createLocalServices()` já estão isolados por
`workspaceKey = workspaceIdentity?.trim() || workspacePath`. O que realmente precisa mudar é o
ciclo de vida de Host/session e o roteamento por MessagePort no Desktop Main, e não reescrever o
protocolo remoto de Agent.

## Objetivos

- Dentro da mesma janela Electron, múltiplos workspaces remotos que usam a mesma configuração de
  conexão SSH normalizada criam apenas um Remote Host.
- Um Remote Host compartilhado mantém apenas uma conexão SSH e inicia apenas um `zcode-server`
  remoto.
- Cada workspace continua tendo `remoteSessionId`, MessagePort, `workspaceIdentity` e `workspaceKey`
  independentes.
- Ao fechar ou remover um workspace, apenas a session e o attachment RPC do workspace são liberados;
  mesmo com o contador de bindings em zero, um Host ready continua em cache até o fechamento da
  janela.
- Quando o Host desconecta de forma inesperada, todos os workspaces associados entram juntos em estado
  desconectado.
- Quando o usuário inicia a reconexão em qualquer workspace associado, são restaurados todos os
  workspaces ainda abertos na mesma janela que usam a mesma configuração SSH.
- Falha de conexão em nível de Host falha por completo; após o Host ficar ready, caminho, Provider
  Registry e inicialização de Agent succeedem ou falham de forma independente por workspace.
- Manter as fronteiras existentes entre Desktop `desktop-continuous` e celular
  `web-remote-replayable`.
- Manter as regras de isolamento de `workspaceIdentity` do workspace remoto e a semântica de execução
  do `workspacePath` real.

## Não Objetivos

- Não compartilhar Remote Host entre janelas Electron.
- Não modificar o modelo "um Host por workspace" de WSL e Docker.
- Não introduzir SSH Profile ID e não migrar o histórico existente de workspaces remotos nem a
  estrutura de armazenamento de credenciais.
- Não adicionar uma entrada visível ao usuário de "desconectar configuração SSH" em nível de Host.
- Não transformar o `zcode-server` remoto em um daemon residente que escuta porta ou Unix socket.
- Não persistir o Host pool, a readiness do Host, attachments ou `remoteSessionId`.
- Não conectar SSH automaticamente no cold start do App.
- Não modificar o `@zcode/protocol` entre App e Agent.
- Não mudar a semântica de produto de task, stream, queue, snapshot, permission, elicitation ou
  owner/lease.
- Não afundar o estado de negócio de task/session/realtime no Desktop Main ou no Relay.

## Clarification Log

| Rodada | Pergunta | Resposta do usuário | Fronteira fixada | Follow-up necessário |
| --- | --- | --- | --- | --- |
| 1 | O escopo de compartilhamento de Host é dentro da janela ou global no App? | Dentro da mesma janela Electron. | Sem compartilhamento entre janelas. | não |
| 2 | O Host é destruído depois que o último workspace fecha? | Mantido em cache até o fechamento da janela. | Um Host ready permite zero workspaces vinculados. | não |
| 3 | Desconectar explicitamente a configuração SSH compartilhada afeta todos os workspaces? | Aceita a desconexão de todos. | O dispose em nível de Host fecha todas as sessions associadas. | não |
| 4 | Introduzir um SSH Profile ID independente? | Não; usar os campos de conexão normalizados. | Nesta fase o modelo de dados de configuração e credenciais não muda. | não |
| 5 | `remoteSessionId` é de nível de Host ou de workspace? | Cada workspace mantém um `remoteSessionId` independente. | Nova dimensão interna de compartilhamento de Host, sem redefinir a semântica de session existente. | não |
| 6 | Reconectar um workspace depois que o Host caiu restaura os outros workspaces do mesmo grupo? | Restaura automaticamente todos os workspaces da mesma janela, mesma configuração e ainda abertos. | A reconexão é orquestrada por grupo de Host. | não |
| 7 | Falha de inicialização de um workspace depois que o Host ficou ready desfaz tudo? | Não; sucesso ou falha independentes por workspace. | Falha de transporte e falha de inicialização de workspace são tratadas em camadas separadas. | não |
| 8 | Compartilhar Hosts de WSL/Docker ao mesmo tempo? | Apenas SSH. | WSL/Docker permanecem como estão. | não |
| 9 | Adicionar UI de desconexão em nível de Host nesta fase? | Não adicionar. | O Host só é destruído por fechamento de janela, dispose interno ou desconexão inesperada. | não |
| 10 | O modelo enxuto de três fontes de fatos (Host pool / pending connect / attached session) é aceito? | Aceito. | Remover índices reversos deriváveis e keys duplicadas. | não |

## Decisões de Fronteira

| Fronteira | Decisão | Inclui | Exclui / poda | Fonte |
| --- | --- | --- | --- | --- |
| Escopo de compartilhamento | `(windowWebContentsId, remoteHostKey)` determina unicamente um SSH Host. | Workspaces da mesma janela e mesma configuração. | Hosts entre janelas. | user |
| Ciclo de vida do Host | Host ready fica em cache até o fechamento da janela. | Host idle com zero workspaces. | Dispose por fechamento da última session. | user |
| Identidade de session | `remoteSessionId` continua independente por workspace. | Porta RPC, cache e rota mobile próprios. | Session ID compartilhado em nível de Host. | user |
| Isolamento de workspace | `workspaceKey = workspaceIdentity?.trim() || workspacePath`. | Isolamento de Agent/provider/task/cache. | Casar apenas por `workspacePath`. | project invariant |
| Reconexão | Uma sessão de workspace iniciada restaura os workspaces do grupo ainda abertos. | Uma conexão de Host com múltiplos attachments. | Reconexão manual um a um. | user |
| Falha parcial | Depois que o Host fica ready, cada workspace é independente. | Erros de Provider/path/inicialização de Agent. | Qualquer falha reverte o Host inteiro. | user |
| Remote kind | Apenas SSH entra no Host pool. | SSH com password/private-key/agent auth. | WSL/Docker. | user |
| UI | Nenhuma nova entrada de desconexão em nível de Host. | Comportamento atual de workspace/tab. | Nova UI e estilos. | user |
| Persistência | Host pool puramente em memória. | Histórico de workspace remoto existente. | Migração de schema de Host/Profile. | design |
| Protocolo | Ajusta apenas mensagens internas de canal/platform do Desktop. | Main ↔ Host, Renderer ↔ Main. | `@zcode/protocol`. | architecture |

## Escopo de Domínio

| Domínio | Inclui? | Por que pode mudar o comportamento | Fontes primárias |
| --- | --- | --- | --- |
| Fronteira de arquitetura/processo | sim | A posse de processo de Main, Remote Host, MessagePort do Renderer e do server remoto muda. | `docs/architecture/zcode-code-architecture-overview.md`、`docs/architecture/message-flow.md` |
| Identidade de workspace / runtime remoto | sim | O compartilhamento de Host não pode enfraquecer o isolamento por `workspaceIdentity/workspaceKey`. | `docs/remote-workspace-session-unified-settings.md`、`docs/ssh-remote-app-global-state-authority.md` |
| Remoto mobile/realtime replayable | sim | Múltiplas sessions lógicas vão se anexar ao mesmo processo, então a fronteira mobile replayable precisa ser preservada. | `docs/web-remote-control/web-remote-control-architecture.md`、`docs/web-remote-control/task-realtime-sync.md` |
| Configuração de model/provider/runtime | sim | O conteúdo do Registry tem a mesma origem, mas a revision aplicada no remoto continua por workspaceKey. | `docs/ssh-remote-app-global-state-authority.md` |
| Queue / command de task | limitado | Não muda a semântica de queue; apenas valida que owner/lease e roteamento de commands não cruzam workspaces. | `docs/web-remote-control-task-command-queue.md` |
| Persistência/índice/snapshot | limitado | O Host pool não é persistido e o histórico de workspaces existente permanece compatível. | `docs/remote-workspace-session-unified-settings.md` |
| Comportamento de conversation/session | não | Não modifica mensagens de session, compact, fork, goal, queue ou conteúdo de snapshot. | docs de protocolo existentes |
| Casca de UI/tema/locale | não | Nenhuma UI nova. | user decision |

## Produtos Cruzados de Alto Risco

| Produto cruzado | Risco candidato | Tratamento |
| --- | --- | --- |
| Host pool × identidade de workspace | Services compartilhadas entre hosts SSH diferentes com o mesmo path. | `remoteHostKey` só decide reúso de processo; cada chamada continua carregando workspaceIdentity. |
| Host pool × reload do Renderer | Sobrescrever o renderer store quando um Host reanexa múltiplas sessions. | Cada session tem MessagePort e remoteSessionId próprios. |
| Host pool × mobile replayable | Celular acessa o workspace B pela session A. | O attach valida simultaneamente remoteSessionId, owner da janela e workspaceIdentity/workspaceKey. |
| Host pool × escopo realtime | Host recebe eventos que não pertencem a workspaces vinculados. | O escopo é derivado em tempo real do contexto das sessions anexadas e o TaskRealtimeBus é atualizado. |
| Host pool × provider registry | A revision aplicada de um workspace ser reutilizada por outro. | O registry e a revision no remoto continuam armazenados por workspaceKey. |
| Host pool × cancelamento | Cancelar uma tentativa de conexão matar outros esperadores concorrentes. | Pending connects independentes; só se destrói quando todos os esperadores cancelam e o Host ainda está connecting. |
| Host pool × saída obsoleta | Callback de exit de um Host antigo apagar um Host novo. | Compara a identidade do objeto de pool entry/process atual antes de apagar. |
| Host pool × ciclo de vida da janela | Uma janela fechar matar o Host de mesma key de outra janela. | A pool key força a inclusão de windowWebContentsId. |
| Host pool × credenciais | Workspaces de mesma key guardando senhas diferentes. | Um Host já conectado continua sendo reutilizado; uma nova conexão usa as credenciais válidas fornecidas pelo solicitante nesta ocasião. |

## Mapa de Conceitos

| Conceito | Por que importa | Fonte |
| --- | --- | --- |
| `createRemoteWorkspaceSession()` | Hoje cada chamada faz fork de um Host e é o ponto de entrada deste refactor. | `packages/desktop/src/main/desktopRemoteSessions.ts` |
| `AttachServicePort` | Já suporta expor uma nova porta RPC nos `activeServices` existentes e é a base do Host compartilhado. | `packages/desktop/src/host/index.ts` |
| `activeServices` | O ServiceCollection misto compartilhado dentro de um Host. | `packages/desktop/src/host/index.ts` |
| `createRemoteWorkspaceServiceCollection()` | Compõe services locais app-global, services remotos e wrappers. | `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts` |
| `connectRemote()` | Uma conexão completa de backend SSH, stdio do server remoto e client RPC. | `packages/server/src/remote/connect.ts` |
| `createLocalServices()` | O dono de services multi-workspace do server remoto. | `packages/services/src/node.ts` |
| `ZCodeAgentProcessManager` | Já reutiliza/_isola processos de Agent por workspaceKey. | `packages/services/src/zcode-agent/zcodeAgentProcessManager.ts` |
| `remoteWorkspaceSessionStore` | O Renderer registra services por remoteSessionId e depois vincula o workspace por identity/path. | `packages/ui/src/store/remoteWorkspaceSessionStore.ts` |
| `webRemoteControlSharedHostAttachments` | O attachment do celular precisa encontrar o processo compartilhado a partir da session lógica. | `packages/desktop/src/main/webRemoteControlSharedHostAttachments.ts` |
| `TaskRealtimeBus` | Roteador do lado do Main para escopo de delivery do Host, owner/lease e rota de session. | `packages/desktop/src/main/taskRealtimeBus.ts` |
| `buildRemoteWorkspaceIdentity()` | Identidade de workspace por authority + canonical path. | `packages/ui/src/lib/remoteWorkspaceHistory.ts` |

## Owners de Estado

| Estado / fato | Autoridade | Espelhos / caches | Evidência |
| --- | --- | --- | --- |
| Existência do SSH Host dentro da janela | Host pool do Desktop Main | nenhum | pool entry + child process |
| Readiness do Host | `readiness` da pool entry do Host | esperadores de pending connect | `Connected`/`Error`/exit |
| Pending connect | Mapa de pending connect do Desktop Main | estado de loading da UI | requestId cancel/result |
| Session remota lógica | Mapa de sessions anexadas do Desktop Main | `sessionsById` do Renderer, remoteSessionId da tab | payload de RemoteServicePort |
| Attachment RPC | Mapa de attachments do Remote Host | `attachmentId` da session do Main | Attach/DetachServicePort |
| Contexto de workspace | tab/histórico do Renderer, vinculado à session do Main | escopo realtime do Host | workspacePath + workspaceIdentity |
| Key de isolamento de workspace | `resolveWorkspaceKey(context)` | mapas de Agent/task/provider | workspaceKey |
| Processo de Agent remoto | `ZCodeAgentProcessManager` remoto | relatórios de ciclo de vida do processo | processo por workspaceKey |
| Revision aplicada do provider registry | Runtime de workspace remoto | coordenador de sync da UI | appliedProviderRevision por workspaceKey |
| Estado de task/session/stream | Services remotos de Agent/session | projection do desktop / espelho de replay mobile | eventos/snapshots de protocolo |

## Modelo de Identidade

### `remoteHostKey`

Nova função pura compartilhada:

```ts
buildSshRemoteHostKey(target: SSHConnectOptions | SSHRemoteTargetSnapshot): string
```

Semântica de codificação recomendada:

```text
ssh:v1:
  normalizedHost
  + effectivePort
  + trimmedUsername
  + authKind(password | private-key | agent)
  + normalizedPrivateKeyPath
```

Regras:

- host é aparado e convertido para ASCII lowercase; porta padrão é `22`.
- username é aparado e preserva maiúsculas e minúsculas.
- o caminho da private key usa normalização léxica segura para browser e ciente de raiz: trim,
  separadores unificados, separadores finais removidos e normalização do tamanho da letra do drive
  do Windows. A raiz de drive do Windows (`C:/`), a raiz de share UNC (`//server/share/`) e a raiz
  POSIX (`/`) precisam ser tratadas como raízes das quais `..` não pode escapar; caminhos relativos
  preservam os `..` iniciais que não podem ser resolvidos, e `~` não é tratado como um diretório
  comum que `..` pode resolver.
- o construtor da key compartilhada não expande `~`, não chama realpath e não resolve symlinks; Main e
  Renderer precisam obter a mesma key a partir do mesmo texto persistido. Textos de caminho
  equivalentes mas diferentes só produzem um "não reuso" conservador, nunca um reuso errado.
- o conteúdo de password e de passphrase da private key é proibido na key, nos logs ou no índice de
  Host persistente.
- `workspacePath`, `workspaceIdentity` e `remoteSessionId` não entram na key.
- `assetInstallMode` só afeta a estratégia de primeiro deploy e não entra na identidade de conexão.
- `resourcePackages` é uma entrada histórica, ignorada atualmente no deploy, e não entra na key.
- o nome `sshConfigAlias` não é identidade; o backend atual usa os campos de conexão válidos após a
  expansão do alias. Quando os campos válidos de dois aliases são iguais, o mesmo Host é reutilizado.

### `remoteSessionId`

`remoteSessionId` continua representando o handle de roteamento lógico Renderer/Main de um workspace:

```text
workspace A -> remoteSessionId A --┐
                                   ├-> shared Remote Host
workspace B -> remoteSessionId B --┘
```

Ele deixa de equivaler ao ID do processo de Host, mas a semântica externa permanece inalterada.

### `workspaceKey`

Toda semântica de identidade/isolamento continua unificada em:

```ts
workspaceKey = workspaceIdentity?.trim() || workspacePath;
```

Arquivos reais, Git, terminal e cwd de commands continuam usando `workspacePath`.

## Modelo de Estado Enxuto

O Host pool não mantém conjuntos reversos deriváveis de `sessionIds` ou `workspaceKeys`, evitando
sincronizar múltiplas fontes de fatos.

```ts
type RemoteSshHostReadiness =
  | {
      kind: "connecting";
      promise: Promise<void>;
    }
  | {
      kind: "ready";
    };

interface RemoteSshHostEntry {
  process: ElectronUtilityProcess;
  target: SanitizedSshTarget;
  readiness: RemoteSshHostReadiness;
  taskRealtimeHostId?: string;
}

interface RemoteWorkspaceContext {
  workspacePath: string;
  workspaceIdentity?: string;
}

interface PendingRemoteConnect {
  host: RemoteSshHostEntry;
  context?: RemoteWorkspaceContext;
}

interface AttachedRemoteWorkspaceSession {
  host: RemoteSshHostEntry;
  attachmentId: string;
  context?: RemoteWorkspaceContext;
}
```

Índices autoritativos:

```ts
sshHostsByPoolKey: Map<
  `${windowWebContentsId}\0${remoteHostKey}`,
  RemoteSshHostEntry
>;

pendingConnectsByRequestId: Map<string, PendingRemoteConnect>;

attachedSessionsById: Map<
  string, // remoteSessionId
  AttachedRemoteWorkspaceSession
>;
```

Restrições de campos:

- a pool key já contém a janela e o remoteHostKey, e o value não repete esse dado.
- a session anexada referencia direto a Host entry e não cria um segundo mapa `remoteHostId`.
- quando o TaskRealtimeBus precisa do ID do processo, ele reutiliza o `hostId` já gerado por
  `spawnHostProcess()`.
- `workspaceKey` é sempre derivado do context e nenhuma cópia é guardada.
- pending e attached ficam em mapas separados; o próprio conjunto expressa o estado, e nenhum `state`
  de session é guardado.
- `target` guarda apenas a descrição sem password/privateKeyPassphrase; o secret completo só é usado
  para iniciar o Host.
- operações de baixa frequência como falha de Host e atualização de scope derivam o conjunto de
  sessions/workspaces associés varrendo `attachedSessionsById`.
- quando `connectRemote()` não recebe um requestId externo, o Main gera um connectAttemptId interno;
  o cancelamento preciso usa o requestId externo, e o cancelamento em nível de janela das chamadas
  antigas permanece compatível varrendo os pending attempts daquela janela.

## Comparação de Abordagens

### Abordagem A: Main mantém um Host pool SSH por janela (adotada)

Mantém o Remote Host e o server stdio remoto existentes, separando Host e session lógica no Main.

Vantagens:

- reutiliza diretamente o `AttachServicePort` existente e a capacidade multi-workspace do remoto;
- não introduz porta remota em escuta nem daemon;
- a semântica de `remoteSessionId`, do renderer store e da rota mobile permanece basically inalterada;
- o escopo de compartilhamento, o ciclo de vida da janela e o domínio de falha ficam claros.

Custos:

- o Main precisa gerenciar Host pool, pending connect e session attachment.
- dentro do Host é preciso um Detach explícito da porta RPC.
- o coordenador de reconexão da UI precisa restaurar em lote por remoteHostKey.

### Abordagem B: um Remote Broker Host por janela (não adotada)

Deixa um processo de Host local gerenciar múltiplos targets SSH e múltiplos ServiceCollections.

Motivo da não adoção: seria preciso adicionar roteamento de conexões, isolamento de falhas e
múltiplos service graphs dentro do Host, expandindo significativamente as responsabilidades de processo e
a superfície de regressão.

### Abordagem C: daemon `zcode-server` remoto residente (não adotada)

Vários Hosts locais conectam ao mesmo server por socket/porta remota.

Motivo da não adoção: exige autenticação remota, endereço de escuta, upgrade de versão, coleta de
processos órfãos e design de segurança, o que ultrapassa o objetivo atual.

## Responsabilidades dos Componentes

### Shared: SSH Host key

Fornece `buildSshRemoteHostKey()` e seus helpers de normalização. O Desktop Main e o agrupamento de
reconexão da UI precisam reutilizar a mesma implementação; é proibido que cada um monte a própria
string.

### Desktop Main: Host pool e session lógica

Recomenda-se extrair de `desktopRemoteSessions.ts` um componente focado `remoteSshHostPool`,
responsável por:

- `getOrCreateHost()`
- `reservePendingConnect()`
- `attachSession()`
- `detachSession()`
- `bindSessionContext()`
- `disposeHost()`
- `disposeWindow()`

`desktopRemoteSessions.ts` continua responsável pela adaptação de BrowserWindow/IPC, pela notificação
de session-closed, pelos caminhos legados de WSL/Docker e pela ponte Bot/Web Remote Control.

### Remote Host: ServiceCollection compartilhada e registry de attachments

O caminho SSH compartilhado ganha mensagens internas:

```ts
InitRemoteSshHost
AttachServicePort { attachmentId }
DetachServicePort { attachmentId }
```

`InitRemoteSshHost` apenas estabelece o SSH, executa a verificação de deploy, inicia o
`zcode-server` remoto e cria uma única ServiceCollection compartilhada. Ele não vincula nenhum
workspace e não usa a porta de inicialização como canal especial do primeiro workspace.

Depois que o Host fica ready, todas as sessions lógicas passam obrigatoriamente por
`AttachServicePort`. Dentro do Host se mantém:

```ts
attachedServicePorts: Map<string, ExposedServicePortHandle>;
```

`DetachServicePort` libera com precisão o ChannelServer, o protocolo e as assinaturas correspondentes;
4. O Main rederiva o realtime workspace scope.

### Renderer/UI: vínculo de workspace e reconexão em lote

O Renderer continua registrando services remotos independentes por remoteSessionId. Recomenda-se
adicionar uma operação de plataforma explícita:

```ts
bindRemoteWorkspaceSessionContext({
  remoteSessionId,
  workspacePath,
  workspaceIdentity,
}): void;
```

A chamada acontece depois que o canonical path e o workspaceIdentity estão determinados e antes da
sincronização do Provider Registry e do commit do estado connected.

O binding de session context atual reutiliza indiretamente `syncWebRemoteControlWorkspaces`. Depois
deste refactor essa chamada deve ficar responsável apenas pela sincronização dos workspaces
visíveis ao celular e não deve mais exercer duplo papel como binding de session do Main.

A UI de conexão SSH precisa manter o target completo digitado pelo usuário dentro deste fluxo de
conexão até que as mutações existentes de credential/history sejam concluídas. O payload
`RemoteServicePort` devolvido pelo Main e o session store do Renderer recebem apenas o target
sanitizado; não se pode mais depender de o Main ecoar password/privateKeyPassphrase na íntegra para o
Renderer concluir a persistência de credenciais.

## Ciclo de Vida

### Primeira Conexão

1. O Main calcula `(windowWebContentsId, remoteHostKey)`.
2. Em cache miss, cria uma Host entry connecting e faz fork de `InitRemoteSshHost`.
3. O pending connect é registrado por `connectAttemptId = requestId?.trim() || randomUUID()`.
4. O Host estabelece o SSH, faz o deploy do server, cria a ServiceCollection e reporta `Connected`.
5. A readiness da Host entry muda para ready.
6. O Main cria um novo remoteSessionId e attachmentId.
7. O Main envia `AttachServicePort` ao Host e entrega um `RemoteServicePort` independente ao
   Renderer.
8. O IPC de connect retorna o remoteSessionId; o Renderer aguarda o registro no session store.

### Conexões Posteriores com a Mesma Configuração

- Host connecting: o mesmo readiness promise é reutilizado, sem novo fork.
- Host ready: uma nova session lógica e um novo attachment são criados diretamente.
- Mesmo remoteHostKey, janelas Electron diferentes: a pool key é diferente e cada uma faz fork do seu
  Host.

### Binding do Workspace Context

1. A session inicial pode não ter context, o que é usado para navegar no diretório remoto.
2. O Renderer obtém o canonical workspacePath chamando realpath no remoto.
3. O workspaceIdentity é construído com a ferramenta unificada.
4. O context é vinculado ao remoteSessionId por uma operação de plataforma dedicada.
5. O Main deriva a união de workspaceKeys do Host a partir das sessions anexadas atuais e atualiza o
   scope do TaskRealtimeBus.
6. A UI então executa a sincronização do Provider Registry, o commit do histórico e a atualização da
   tab para connected.

### Readiness de Workspace RPC no Renderer

O Renderer precisa distinguir explicitamente o resultado de resolução dos serviços de workspace entre
`local-ready`, `remote-waiting` e `remote-ready`. Um workspace local permanece sempre `local-ready`; um
workspace remoto só entra em `remote-ready` quando o `remoteSessionId` correspondente já existe no
session store do Renderer e consegue resolver os remote services reais. Apenas metadados de remote tab
ou um estado de reconexão em andamento ainda pertencem a `remote-waiting`.

Durante `remote-waiting` é permitido continuar renderizando a casca do App, a barra lateral e o
progresso de conexão, mas os efeitos colaterais de workspace RPC não podem começar: inicialização do
workspace model, assinatura de conversation / sessions-index, escuta de sessions-index para
notificações de estado final de task, hidratação da configuração de diretórios de workspace MCP,
hidratação do draft config e prewarm de draft session. O proxy de desconexão continua sendo a proteção
final contra passagem de limite; é proibido voltar aos base services locais e é proibido cachear
requisições para replay entre transports. Capacidades app-global como usage entitlement precisam usar
o base host service e não seguem a readiness do workspace remoto.

Essa readiness controla apenas o momento em que o Renderer inicia workspace RPC e não muda o Desktop
`desktop-continuous`, o celular `web-remote-replayable`, owner/lease nem a semântica de workspace
identity.

### Fechar um Workspace

1. O Renderer remove a tab e desfaz o mapeamento de identity/path para a session.
2. O Main remove a session lógica.
3. O Main libera o attachment RPC de desktop daquela session e os mobile shared-host attachments.
4. O Main rederiva o realtime workspace scope.
5. Um Host ready continua no pool mesmo sem sessions.

### Reload do Renderer

O Main percorre as sessions lógicas que continuam anexadas e cria um novo attachment para cada
session a partir do mesmo Host. remoteSessionId e workspace context permanecem iguais, e o attachment
antigo é liberado explicitamente.

Esse fluxo restaura apenas o RPC direto do Desktop e não usa semântica de snapshot/gap mobile
replayable.

### Fechamento da Janela

O Main remove todas as pool entries da janela, libera todas as sessions/attachments, envia dispose a
cada Host e aguarda a conclusão do fallback de kill forçado já existente.

### Saída do Server stdio Remoto

Fechar o transport SSH faz o stdin do `zcode-server` remoto receber `end` / `error`, ou faz o processo
receber `SIGHUP` / `SIGTERM` / `SIGINT`. O server remoto é o dono dos processos do seu
`ZCodeAgentProcessManager` interno e portanto não pode chamar `process.exit()` direto nesse evento;
primeiro é preciso parar o RPC, depois aguardar o cleanup graceful + force de todos os Agents de
workspace e só então sair do server:

```text
stdin end/error or termination signal
  -> ChannelServer / connection scope 停止接收 RPC
  -> disposeServiceResourcesAndWait()
       -> 每个 workspace 的 Agent disposeAndWait()
       -> graceful stdin EOF
       -> 超时后进程树强杀兜底
  -> cleanup 完成、失败或整体 deadline 超时被记录
  -> process.exit(normal=0, transport/cleanup error=1)
```

O fechamento da saída precisa ser idempotente: `end`, `error`, termination signal ou eventos repetidos
só podem iniciar o cleanup uma vez e só podem chamar o exit uma vez; se durante o cleanup chegar outro
stdin error ou termination signal, o código de saída final é promovido para `1`. A própria falha do
cleanup também precisa ser registrada e sair com `1`, sem pular o exit por causa de uma Promise
rejected nem gerar unhandled rejection. Todo o `stopRpc + disposeServiceResourcesAndWait` compartilha
um hard deadline padrão de 5 segundos; o deadline precisa ser injetável para testes. Se qualquer etapa
ficar permanentemente pending, o server registra a etapa incompleta e o deadline, para de esperar a
Promise de cleanup e sai direto com `1`. O timer do deadline precisa manter ref para garantir que
conduza sozinho o fechamento final.

Esse contrato pertence apenas à saída do processo do server remoto; ele não altera o caminho existente
`disposeServiceResourcesAndWait()` do Host local do Desktop e não altera workspaceKey, Desktop
continuous ou a semântica replayable do celular.

## Semântica de Cancelamento

- Cancelamento de um esperador em um Host connecting: apaga apenas aquele pending connect.
- Cancelamento de todos os esperadores de um Host connecting e sem session anexada: destrói o Host e
  interrompe o upload/deploy em andamento.
- Cancelamento da seleção de diretório remoto em um Host ready: remove a session lógica temporária e
  o Host permanece em cache.
- Fechar o último workspace em um Host ready: o Host permanece em cache.
- requestId/connectAttemptId pertencem apenas ao pending connect e não entram no estado de longo prazo
  da session anexada.

## Desconexão e Reconexão

### Saída Inesperada do Host

1. O Main usa a identidade do objeto Host entry/process para confirmar que o callback de exit ainda
   pertence à pool entry atual.
2. Encontra todas as sessions em `attachedSessionsById` que referenciam aquele Host.
3. Envia as notificações existentes de remote-session-closed para cada uma.
4. Libera todos os attachments de desktop/mobile.
5. O Renderer limpa o remoteSessionId de cada tab e preserva o remote target, o histórico de workspace
   e o workspaceIdentity.
6. A pool entry do Host é removida.

Callbacks de exit/error atrasados de um Host antigo não podem remover um Host novo de mesma key.

### Reconexão Iniciada pelo Usuário

1. A UI usa `buildSshRemoteHostKey()` para encontrar todas as tabs de workspace remoto ainda abertas
   na mesma janela e com a mesma key, e fixa o workspace de onde o usuário iniciou a reconexão como o
   initiator do grupo.
2. Carrega apenas as credenciais válidas do initiator e conclui primeiro o logical connect dele; quando
   esse connect retorna, o Host compartilhado no Main precisa já estar ready.
3. Se a conexão do initiator falhar, a recuperação do grupo inteiro para imediatamente, e é proibido
   que outros workspaces usem suas próprias credenciais históricas para criar antecipadamente um Host de mesma
   key.
4. Depois do sucesso do initiator, os demais workspaces são restaurados em paralelo; o pool do Main
   cria apenas attachments independentes para eles e não repete a autenticação SSH.
5. Cada workspace recebe um novo remoteSessionId independente.
6. Cada workspace canonicaliza seu path, vincula o context, sincroniza o Provider Registry e inicializa
   o Agent separadamente.
7. Depois do sucesso do initiator, a inicialização dos outros workspaces mantém a semântica de falha
   independente; a falha de um único workspace não desfaz o Host ready nem os workspaces já
   restaurados.

Se o transport SSH/RPC desconectar durante a recuperação, isso é uma falha em nível de Host e todos os
workspaces associados falham juntos.

## Fronteira de Service e Provider

No Remote Host compartilhado, o ServiceCollection misto local é criado apenas uma vez:

- autoridade local: setting, credential, OAuth, model provider, usage stats, coding plan, broadcast etc.
- wrappers locais: ZCode Task, ZCode Session, Repo Wiki etc.
- implementações remotas: file, git, terminal, file watcher, Agent, skills, MCP/plugin sync etc.

Dentro do `zcode-server` remoto a gestão por workspaceKey continua:

```text
zcode-server
├── workspaceKey A
│   ├── Agent A
│   └── appliedProviderRevision A
└── workspaceKey B
    ├── Agent B
    └── appliedProviderRevision B
```

A origem do Provider Registry é a configuração app-global do Desktop, mas o estado de aplicação e de
revision continua independente por workspaceKey. Uma falha de sincronização em A não significa que o
SSH Host está corrompido e não pode limpar o estado bem-sucedido de B.

## Realtime e Web Remote Control

### Desktop continuous

- Cada remoteSessionId usa um MessagePort independente.
- Vários MessagePorts apontam para o mesmo `activeServices` do Host.
- A UI assina diretamente o stream continuous remoto e não emenda mensagens de recuperação mobile
  replayable.

### Mobile replayable

O celular continua se anexando via Relay/Main a session remota lógica já existente:

```text
remoteSessionId
  -> attached session
  -> shared Host
  + workspaceIdentity/workspaceKey validation
  -> remote services
```

`attachRemoteWorkspaceSessionHost()` precisa validar simultaneamente:

- o remoteSessionId existe.
- a session pertence à janela da requisição.
- o workspaceIdentity não está vazio.
- `workspaceKey === resolveWorkspaceKey({ workspacePath, workspaceIdentity })`.
- o workspaceKey já vinculado à session é igual ao da requisição.

O compartilhamento de Host não pode permitir que a mobile session A acesse o workspace B. Relay e Main
continuam fazendo apenas autenticação, pareamento, heartbeat, repasse de rpc-frame/app payload e
agendamento de attachments e não mantêm estado de negócio de task/session/stream/queue/snapshot.

### TaskRealtimeBus

O delivery kind realtime do SSH Host continua sendo o `relay_bridge` existente. O workspace scope é
derivado da união de workspaceKeys do contexto das sessions anexadas atuais daquele Host e usa o
`updateHostWorkspaceKeys()` existente.

Owner/lease, owner command, permission/elicitation/command pendentes e a proteção contra stale run
continuam trabalhando por workspaceKey/task/run e não são removidos pelo Host compartilhado.

## Persistência e Credenciais

- Host pool, readiness, pending connect, attachment e remoteSessionId não são persistidos.
- O cold start do App continua restaurando as tabs de workspace remoto desconectadas, sem conectar
  automaticamente.
- O schema existente de `RemoteWorkspaceSessionEntry` não muda e não há migração de dados.
- As credential keys existentes de senha/passphrase de private key continuam salvas por histórico de
  workspace; nesta fase é permitido que workspaces de mesma configuração tenham credenciais duplicadas.
- A reconexão em lote usa as credenciais carregadas com sucesso nesta ocasião pelo initiator para
  criar um Host, e os outros workspaces não repetem a autenticação SSH.
- Um Host já ready não é substituído por mudança no conteúdo de password/privateKeyPassphrase; na
  próxima conexão real usa-se a credencial atual do solicitante.

## Logs e Segurança

- password completo, privateKeyPassphrase, Authorization/token e o provider registry completo são
  proibidos em logs.
- A Host entry de longo prazo no Main não guarda password nem privateKeyPassphrase; o Renderer só
  mantém temporariamente a entrada do usuário até as mutações de credential/history do fluxo de
  conexão atual serem concluídas.
- É permitido registrar: digest irreversível da Host key, hostId existente, remoteSessionId, workspaceKey,
  transições de estado, PID, códigos de erro e durações.
- Criação/ready/exit de Host e dispose de janela usam `info`.
- Falhas recuperáveis de attachment/context/inicialização de um único workspace usam `warn`.
- Falhas irrecuperáveis como conexão de Host, handshake e início do server remoto usam `error`.
- Traces do mesmo nível de contagem de stream/event devem usar `debug` de service e não são gravados em
  produção.
- Quando uma falha de session/write de SFTP ocorre e o exec pipe pode assumir, registra-se apenas um
  `warn`; não se registra primeiro um `error` e depois o `warn` de fallback. Falha de leitura de
  arquivo local ou de exec pipe continua sendo `error`.
- Quando uma nova remote session, uma mudança de revision do registry, um refresh forçado ou um retry
  pendente já exigem explicitamente o envio do Provider Registry, é proibido chamar
  `getWorkspaceRuntimeIdentity` antes do envio. A runtime identity é lida depois que a aplicação do
  registry tem sucesso; somente o julgamento de unchanged da mesma session e mesma revision permite sondar
  a identity primeiro, para detectar reconstrução de Agent.
- Quando o probe de identity após a aplicação do registry ainda retorna
  `ZCODE_AGENT_PROVIDER_NOT_READY`, mantém-se uma proteção de replay limitada; esse erro indica que o
  runtime foi substituído depois do reply de aplicação e não pertence mais ao caminho normal de cold
  start.
- `ExperimentalWarning` / `DeprecationWarning` / `Warning` do Node são estruturados pelo host em um
  único `warn`; o caminho padrão de stderr/console não deve mais reportar um `error` adicional.

## Degradação da Capacidade de Upload SSH

- O backend SSH começa priorizando SFTP, para preservar o desempenho de upload e o comportamento de
  progresso em servidores normais.
- Após a primeira falha de `sftp-session` ou `sftp-write`, o backend atual é marcado como
  `exec-upload-only`; o arquivo atual é retentado imediatamente pelo exec pipe e os arquivos seguintes
  são enviados direto pelo exec pipe.
- Uma falha de `local-read` não indica que a capacidade de SFTP remoto está indisponível e não pode
  acionar `exec-upload-only`.
- O estado de degradação existe apenas durante o ciclo de vida do backend atual; um backend novo
  redescobre o SFTP.
- A primeira degradação precisa deixar um `warn` contendo o tipo da falha e o código de erro; uploads
  exec-only seguintes mantêm apenas os logs normais de início, progresso e conclusão.

## Dimensions

| Dimension | Values / equivalence classes | Include? | Reason |
| --- | --- | --- | --- |
| window | same / different | yes | A fronteira de compartilhamento. |
| remote kind | SSH / WSL / Docker | yes | Apenas SSH muda. |
| SSH key | same / different | yes | A chave primária do Host pool. |
| Host readiness | absent / connecting / ready / exited | yes | Semântica de concorrência, cancelamento e erro. |
| logical session | pending / attached / removed | yes | Ciclo de vida do attachment. |
| workspace context | unbound / bound | yes | Navegação de diretório e validação de identity. |
| attached count | 0 / 1 / many | yes | Cache idle e comportamento compartilhado. |
| renderer lifecycle | initial / reload / close | yes | Reanexação de porta e coleta. |
| client mode | desktop-continuous / web-remote-replayable | yes | A fronteira de delivery não pode ser misturada. |
| failure layer | Host transport / attachment / workspace initialization | yes | Fronteira entre falha total e falha parcial. |
| auth | password / private key / agent | yes | Classes de equivalência de remoteHostKey. |
| credential content | same / changed | representative | O secret não entra na key, mas afeta a reconexão. |
| provider revision | same / independently failed | yes | O estado aplicado é por workspace. |

## Candidate Combinations

| Candidate ID | State | Event | Target/surface | Expected guard/effect | Status |
| --- | --- | --- | --- | --- | --- |
| SSH-HOST-POOL-01 | sem Host | conectar A e depois B, mesma janela/key | Desktop | um Host, duas sessions/portas lógicas | accepted |
| SSH-HOST-POOL-02 | sem Host | mesma key em janelas diferentes | Desktop | um Host por janela | accepted |
| SSH-HOST-POOL-03 | sem Host | duas keys diferentes na mesma janela | Desktop | dois Hosts | accepted |
| SSH-HOST-POOL-04 | connecting | connects concorrentes de mesma key | Main | readiness promise compartilhada e um único spawn | accepted |
| SSH-HOST-POOL-05 | connecting com dois esperadores | cancelar um | Main/UI | um esperador removido, o Host continua | accepted |
| SSH-HOST-POOL-06 | connecting com o último esperador | cancelar | Main/UI | Host descartado e deploy interrompido | accepted |
| SSH-HOST-POOL-07 | ready, session temporária | cancelar seleção de diretório | Desktop | session desanexada, Host em cache | accepted |
| SSH-HOST-POOL-08 | ready, dois workspaces | fechar A | Desktop/mobile | apenas A desanexada; B continua utilizável | accepted |
| SSH-HOST-POOL-09 | ready, um workspace | fechar o último workspace e reabrir a mesma key | Desktop | Host fica idle e é reutilizado | accepted |
| SSH-HOST-POOL-10 | Hosts ready | fechar a janela | Main | descarta todos os Hosts daquela janela | accepted |
| SSH-HOST-POOL-11 | ready, duas sessions | reload do renderer | Desktop | reanexa duas portas independentes ao mesmo Host | accepted |
| SSH-HOST-POOL-12 | ready, duas sessions | Host/SSH sai | Desktop/mobile | ambas as sessions fecham e as tabs desconectam | accepted |
| SSH-HOST-POOL-13 | grupo desconectado | reconectar A | UI/Main | A e B restauradas através de um novo Host | accepted |
| SSH-HOST-POOL-14 | Host ready | init de provider/path de B falha | UI/service | A continua conectado; B mostra a falha | accepted |
| SSH-HOST-POOL-15 | Host compartilhado, A/B | celulares anexam A e B | mobile | mesmo processo, sessions/identities isoladas | accepted |
| SSH-HOST-POOL-16 | session A vinculada à key A | anexar com identity B | mobile | rejeita o mismatch de identity | accepted |
| SSH-HOST-POOL-17 | sync de registry A/B | mesma revision de registry | remote server | estado aplicado com keys independentes | accepted |
| SSH-HOST-POOL-18 | conjunto anexado muda | vincular/desvincular workspace | realtime | scope do TaskRealtime igual à união derivada | accepted |
| SSH-HOST-POOL-19 | WSL/Docker | abrir múltiplos workspaces | Desktop | comportamento existente de sessão por Host | accepted |
| SSH-HOST-POOL-20 | ready ou reconectando | o conteúdo das credenciais muda | SSH | Host ready reutilizado; novo Host usa a credencial atual | accepted |
| SSH-HOST-POOL-21 | primeira falha de SFTP write/session do backend | upload contínuo de múltiplos recursos | SSH deploy | primeiro recurso faz fallback; seguintes vão direto por exec pipe; apenas um warn de degradação | accepted |
| SSH-HOST-POOL-22 | nova session e provider registry ainda não sincronizado | sincronizar o workspace app-global state | UI/Host RPC | pula o pre-probe sem valor decisório; primeiro aplica o registry e depois faz um probe de identity de sucesso | accepted |
| SSH-HOST-POOL-23 | remote tab ativado mas services ainda não registrados | preparing para iniciar efeitos colaterais de workspace no Renderer | UI | estado é `remote-waiting`; contagem de workspace RPC de conversation, notificação de task via sessions-index e hidratação MCP é 0, e cada uma é iniciada uma única vez após o registro; workspaces locais continuam começando imediatamente | accepted |
| SSH-HOST-POOL-24 | múltiplos remote tabs com o mesmo `workspacePath` e `workspaceIdentity` diferentes, só uma identity vinculada a session live | o Renderer resolve os workspace services | UI | tab com identity só atinge um `remoteSessionId` explícito ou mapeamento exato por identity; sem mapeamento exato permanece `remote-waiting` e é proibido emprestar outro endpoint por path | accepted |
| SSH-HOST-POOL-25 | mesmo `workspacePath` em tab local e remote, índice de path remote já vinculado a session live | o Renderer resolve os local workspace services | UI | tab local sem metadados remotos precisa usar base services; é proibido emprestar o endpoint remote só por path | accepted |
| SSH-HOST-POOL-26 | a entrada Web de controle remoto traz `workspaceIdentity` remoto e o `remoteSessionId` da tab ainda não foi preenchido ou já expirou | o Renderer resolve a session alvo do controle remoto | UI/mobile | a identity precisa participar da resolução exata; a camada popover recebe apenas resultados já registrados e verificados, e é proibido repassar session não validada ou emprestar outro endpoint por path | accepted |

## Pruning Decisions

| Decision ID | Combinações podadas | Guard/invariant | Motivo de produto | Cobertura representativa |
| --- | --- | --- | --- | --- |
| SSH-POOL-PD-01 | mesma key entre janelas compartilha Host | a pool key inclui o id da janela | Isolamento de falha e ciclo de vida em nível de janela | SSH-HOST-POOL-02 |
| SSH-POOL-PD-02 | WSL/Docker usam o Host pool | o remote kind precisa ser SSH | Controle da superfície de regressão nesta fase | SSH-HOST-POOL-19 |
| SSH-POOL-PD-03 | todos os workspaces compartilham um remoteSessionId | a session continua no escopo do workspace | Preservar a semântica atual de roteamento/cache/mobile | SSH-HOST-POOL-01 |
| SSH-POOL-PD-04 | a última session fecha o Host | um Host ready sobrevive a zero bindings | Melhorar a experiência de reabrir um workspace | SSH-HOST-POOL-09 |
| SSH-POOL-PD-05 | falha de init de qualquer workspace reverte o Host | o Host ready separa transport de init de workspace | Evitar propagação de falha | SSH-HOST-POOL-14 |
| SSH-POOL-PD-06 | persistir identidade de Host/Profile | o Host pool é apenas de runtime | Não expandir para migração de configuração | testes de compatibilidade de cold start |
| SSH-POOL-PD-07 | auto-conectar no cold start do App | as tabs restauradas permanecem desconectadas | Não estabelecer SSH silenciosamente em background | testes de persistência existentes |
| SSH-POOL-PD-08 | nova UI de desconexão | nenhuma UI no escopo | Foco no modelo de processos | nenhum diff de UI |
| SSH-POOL-PD-09 | o mobile cria um runtime remoto independente | invariante de shared-host attachment | Relay/Main não possui runtime de negócio | SSH-HOST-POOL-15/16 |

## Accepted Cases

| Case ID | Setup | Action | Assertions | Evidence layers | Status |
| --- | --- | --- | --- | --- | --- |
| SSH-HOST-POOL-01 | mesma janela, sem Host | conecta em sequência os workspaces A/B de mesma key | apenas um fork; sessionId e attachmentId de A/B diferentes; um único server remoto | unit + process/log | planned |
| SSH-HOST-POOL-04 | Host connecting | dois connects entram concorrentes | connect/deploy/handshake executados uma única vez | unit | planned |
| SSH-HOST-POOL-05 | dois pending waiters | cancela um dos requestId | o outro continua com sucesso; o Host não é descartado | unit | planned |
| SSH-HOST-POOL-06 | apenas um pending waiter | cancela o requestId | o Host connecting é descartado; upload/deploy interrompido | unit + runtime log | planned |
| SSH-HOST-POOL-08 | A/B anexados | fecha a tab A | o Host apenas desanexa A; o RPC de file/task de B funciona | unit + integration | planned |
| SSH-HOST-POOL-09 | último workspace anexado | fecha e reabre um workspace de mesma key | PID do Host inalterado; sem novo handshake SSH | unit + manual SSH | planned |
| SSH-HOST-POOL-11 | A/B anexados | reload do renderer | os remoteSessionId originais de A/B são reanexados ao mesmo processo Host | unit + renderer harness | planned |
| SSH-HOST-POOL-12 | A/B em execução | simula fechamento de SSH/backend | dois session-closed; as duas tabs limpam remoteSessionId; pool entry removida | unit + fault harness | planned |
| SSH-HOST-POOL-13 | A/B desconectados e ainda abertos | clica em reconectar em A | uma criação de Host; A/B recebem sessions novas; cada uma vincula sua identity | UI/Main integration | planned |
| SSH-HOST-POOL-14 | Host já restaurado | injeta falha de init de provider/path de B | A conectado; B falhou; o Host é preservado | UI/service integration | planned |
| SSH-HOST-POOL-15 | A/B anexados no mesmo Host | o mobile abre A e B separadamente | dois shared-host attachments apontam para o mesmo processo; workspaceKey não se cruza | unit + web remote harness | planned |
| SSH-HOST-POOL-16 | session A com identity A | o mobile anexa A com identity B | retorna identity mismatch e não cria porta | unit | planned |
| SSH-HOST-POOL-17 | A/B usam o mesmo provider snapshot | atualizam o registry separadamente | os dois workspaceKeys remotos registram a revision aplicada; as falhas são independentes | service integration | planned |
| SSH-HOST-POOL-22 | nova remote session, sem revision aplicada | sincroniza o provider registry | a primeira operação é update; depois há apenas um probe de identity bem-sucedido | UI unit | covered |
| SSH-HOST-POOL-23 | remote tab com identity e sem services registrados | monta pane único / pane cross-workspace | a camada de dados não monta durante o waiting; monta uma única vez após registrar e vincular a session; o local monta imediatamente | UI hook/component | covered |
| SSH-HOST-POOL-24 | três remote tabs (115, localhost, jumpserver) com path `/root`, apenas a identity de 115 vinculada a session live | resolve os workspace services dos três tabs | 115 acerta a própria session; os outros dois retornam remote-waiting e não disparam sessions-index/provider/task RPC no Host de 115; remote tabs antigos sem identity ainda permitem fallback por path | UI resolver unit | covered |
| SSH-HOST-POOL-25 | `/root` local e `/root` remoto coexistem, com o índice de path apontando para a session remota | resolve os workspace services do tab local ativo | retorna rota local/base, sem acertar a session remota | UI hook unit | covered |
| SSH-HOST-POOL-26 | a entrada Web de controle remoto passa a identity de localhost com session inválida/ausente, e o índice de path de 115 continua vivo | abre o popover de controle remoto | o resolver recebe a identity de localhost; o popover recebe apenas a session verificada pelo resolver, e não recebe a session inválida nem a session de 115 | UI component unit | covered |
| SSH-HOST-POOL-18 | A anexada, depois B anexada, depois A desanexada | atualiza o context | o escopo realtime é sucessivamente `{A}`, `{A,B}`, `{B}` | unit | planned |

## Matrix Backfill

| Arquivo | Mudança |
| --- | --- |
| `docs/architecture/zcode-code-architecture-overview.md` | Atualizar o SSH Remote Host como compartilhado por remoteHostKey dentro da janela. |
| `docs/architecture/message-flow.md` | Atualizar o MessagePort e o fluxo stdio de múltiplos workspaces para o Host/server compartilhado. |
| `docs/remote-workspace-session-unified-settings.md` | Explicar a separação entre o histórico de workspace persistido e o Host pool de runtime. |
| `docs/ssh-remote-app-global-state-authority.md` | Explicar que, com um Host e múltiplos workspaces, o conteúdo do registry tem a mesma origem e o estado de aplicação continua por workspaceKey. |
| `docs/web-remote-control/web-remote-control-architecture.md` | Atualizar a restrição de múltiplas sessions lógicas anexadas ao mesmo SSH Host. |
| `docs/web-remote-control/task-realtime-sync.md` | Registrar que o workspace scope do Host compartilhado é a união derivada das sessions anexadas. |
| `docs/remote/desktop-remote-session-renderer-reattach.md` | Atualizar o reanexamento de "session host" para o reanexamento de "logical session attachment". |

## Design dos Testes

### Testes Unitários de Shared

- Normalização de tamanho/minúsculas, espaços em branco e porta padrão do host.
- Preservação de maiúsculas/minúsculas no username e remoção de espaços nas bordas.
- Mudanças no conteúdo de password/privateKeyPassphrase não entram na key.
- authKind password/private-key/agent diferentes produzem keys diferentes.
- privateKeyPath diferente produz key diferente.
- Nomes de alias diferentes com campos válidos iguais produzem a mesma key.

### Testes Unitários do Desktop Main

- SSH-HOST-POOL-01 a 13, 18, 19, 20.
- Um exit de Host obsoleto não remove a entry nova.
- Falha de attachment só recolhe a session correspondente.
- Isolamento estrito de mesma key entre janelas.
- Não SSH continua chamando o caminho antigo de create/dispose.

### Testes Unitários do Remote Host

- `InitRemoteSshHost` não exige workspace context nem porta de service do Renderer.
- O ServiceCollection só é criado uma vez.
- Múltiplos attachments expõem o mesmo ServiceCollection.
- O Detach libera com precisão o handle alvo; IDs desconhecidos/repetidos são idempotentes.
- O dispose do Host libera todos os attachments, services, realtime bridge e a conexão SSH.
- Após a primeira falha de session/write de SFTP, os uploads seguintes do mesmo backend não chamam
  mais SFTP e produzem apenas um warn de degradação.
- O RPC provider-not-ready e os warnings do Node usam os níveis de log esperados e não geram error
  duplicado.

### Testes Unitários de Renderer/UI

- Fechar um remote tab chama detach de session e não destrói o Host.
- Tabs open disconnected de mesmo remoteHostKey são agrupadas em um grupo de recuperação.
- Key diferente, janela diferente ou workspace já fechado não entram no grupo de recuperação.
- Falha parcial na recuperação em lote preserva as tabs com sucesso.
- O Provider Registry é sincronizado separadamente para cada session de workspace.
- Tabs de mesmo path e endpoint diferentes permanecem `remote-waiting` quando falta o mapeamento
  exato por identity e não podem pegar um endpoint já conectado só por path; apenas dados antigos sem
  identity permitem fallback por path.

### Testes Unitários de Web Remote Control

- SSH-HOST-POOL-15/16.
- O detach de session libera apenas os mobile attachments daquela session.
- A falha de Host libera todos os mobile attachments daquele Host.
- deliveryKind desktop continuous e mobile replayable não se substituem.

### Testes de Integração de Service

- O mesmo remote ServiceCollection inicializa Agents independentes para dois workspaceKeys.
- A revision aplicada do provider registry é isolada por workspaceKey.
- Requisições de task/session/file/terminal sempre usam o workspacePath/workspaceIdentity dos
  parâmetros da chamada.

### Verificação em Runtime Real

Usando um host SSH real macOS/Linux:

1. Abrir dois diretórios remotos com a mesma configuração na mesma janela.
2. O monitoramento de processos confirma que há localmente apenas um PID de SSH Remote Host.
3. No remoto confirma-se que há apenas um `zcode-server` correspondente e que Agents independentes
   podem ser iniciados para os dois workspaceKeys.
4. Os dois workspaces executam operações de file, Git, terminal, task e Provider separadamente.
5. Fechar um workspace e confirmar que o outro funciona normalmente e que o PID do Host não muda.
6. Fechar o último workspace e reabrir o diretório de mesma configuração, confirmando que não há novo
   handshake SSH nem novo PID de server.
7. Encerrar o SSH/server e confirmar que os dois workspaces desconectam juntos.
8. Clicar em reconectar em um workspace e confirmar que os dois workspaces ainda abertos são
   restaurados por um novo Host.
9. Entrar no celular em cada um dos dois workspaces e confirmar que o roteamento de
   task/stream/permission não se cruza.

Verificação mecânica do repositório:

```sh
pnpm typecheck
pnpm lint
```

## Riscos e Mitigações

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Uma falha de Host afeta mais workspaces | Workspaces de mesma configuração desconectam juntos | Domínio de falha explícito em nível de Host; recuperação por reconexão em lote; sem compartilhamento entre janelas. |
| Attachments não liberados | Vazamento de assinatura/memória em um Host idle de longa duração | attachmentId + DetachServicePort + testes de dispose-all. |
| Drift entre índices de session/context/Host | Uso cruzado de identity, scope errado | Modelo de três fontes de fatos; workspaceKey/sessionIds/workspaceKeys derivados sob demanda. |
| Callback de processo obsoleto | Limpeza indevida de um Host novo | Comparar a identidade do objeto de pool entry/process antes de apagar. |
| Compartilhamento errado do estado de Provider | Workspace usa a configuração de modelo errada | Revision aplicada e cache do registry continuam por workspaceKey. |
| Attachment mobile passando do limite | Exposição de task/data entre workspaces | Validação quádrupla de remoteSessionId + janela + workspaceIdentity/workspaceKey. |
| SSH idle ocupando recursos | A conexão é mantida enquanto a janela vive | Essa é uma escolha de UX já confirmada; a janela fechada faz a coleta unificada; sem idle timeout nesta fase. |
| Credencial duplicada por workspace | Várias senhas salvas para a mesma configuração | Aceito nesta fase para evitar introduzir Profile/migration; um SSH Profile pode ser desenhado independentemente depois. |

## Restrições de Ordem de Implementação

1. Implementar e testar primeiro a função pura compartilhada `remoteHostKey`.
2. Implementar depois o Host pool do Main e o modelo de estado enxuto, sem mudar antes o comportamento da
   UI.
3. Desacoplar a init do SSH Host do attachment de session lógica e adicionar o detach.
4. Ligar o binding dedicado de session context e a derivação do realtime scope.
5. Ajustar os ciclos de vida de tab close, renderer reload e falha de Host.
6. Implementar a reconexão em lote da UI por grupo de mesmo Host e a falha parcial.
7. Regressar o shared-host attachment mobile, owner/lease e o sync de provider.
8. Atualizar os documentos de fatos de arquitetura e executar a verificação completa.

Cada etapa precisa manter o caminho legado de WSL/Docker funcionando e não pode, em nenhum estado
intermediário, trocar o `/remote` do celular para um runtime independente.

## Implementation Notes

- `buildSshRemoteHostKey()` aceita tanto o target SSH de runtime quanto o snapshot SSH persistido; o
  snapshot de password deduz o auth kind por `passwordCredentialKey`, e o conteúdo do secret não
  entra na key.
- O Renderer só mantém o target completo dentro do Map de diretórios candidatos da primeira conexão ou
  da pilha de chamadas de reconnect; o `RemoteServicePort` do main, o remote session store e a tab de
  workspace guardam apenas o target sanitizado, e a referência temporária é apagada assim que as
  mutações de credential/history terminam.
- O canonical path e a identity são vinculados por um IPC `BindRemoteWorkspaceSessionContext`
  independente, que valida que a session pertence ao webContents que iniciou o IPC;
  `syncWebRemoteControlWorkspaces` deixa de exercer o papel de entrada de binding.
- O attachment de Host usa um `attachmentId` explícito; o fechamento/reload da logical session de
  desktop envia `DetachServicePort`, e o attachment curto de mobile ainda pode acionar a mesma coleta do
  registry pelo fechamento do MessagePort.
- Esta implementação não mudou o protocolo de task stream, snapshot, queue, permission, owner/lease ou
  deliveryKind.
- A reconexão em lote do mesmo Host restaura primeiro o initiator de forma serial e, depois de
  confirmar que o Host compartilhado está ready, restaura os demais workspaces em paralelo; apenas o
  workspace clicado pelo usuário é ativado, e os workspaces do grupo restaurados em background não
  disputam a tab ativa.