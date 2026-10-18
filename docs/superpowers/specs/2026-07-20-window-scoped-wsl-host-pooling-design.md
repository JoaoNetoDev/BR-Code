# Design de Compartilhamento e Ciclo de Vida de Recursos do Remote Host WSL em Escopo de Janela

## Status de implementação

As fases 1 e 2 foram concluídas em `fix/wsl-remote-process-cleanup`; a fase 3 concluiu a verificação
automatizada deste escopo e a verificação real de PID com Windows + Ubuntu WSL. As evidências de
execução estão em `docs/testing/wsl-host-pooling-runtime-evidence.md`.

O ambiente real já verificou que, com 1, 3 e 5 logical workspaces da mesma janela e mesmo distro/user,
permanecem apenas um Windows remote Host e um `zcode-server` WSL; após o último owner ser liberado, a
recuperação ocorre pelo idle TTL de cerca de 60 segundos, o TTL é pulado no fechamento normal do App,
e a recuperação do Host/server é concluída dentro de uma janela de amostragem de cerca de 4 segundos.
O task draining, o mobile attachment e a fronteira Docker dedicated são cobertos por testes
automatizados; ainda não foram executadas tasks reais, um celular real ou injeção em runtime de
instalação de atualização.

## Correção de revisão: fronteira autoritativa do Active Run

A implementação inicial tratava o intervalo pending da Promise de `sendPrompt()` como uma task running
do workspace. Essa fronteira não se sustenta: `sendPrompt()` retorna um ACK de comando, e a saída do
modelo e a execução de ferramentas ainda podem continuar. Zerar a contagem do workspace após o ACK faz
com que fechar a tab execute imediatamente `disposeWorkspace()`, interrompendo um run do Agente que
ainda não terminou.

Fronteiras candidatas:

```text
send ACK       → 仅说明命令已接收；禁止作为 idle/release 边界
turn terminal  → stream 已收口；Agent active lock 仍可能未释放
session ready  → prompt_completed / prompt_failed，Agent 已释放 active lock
```

Este design escolhe `session ready` como fronteira de conclusão do active run:

```text
sendPrompt(taskId, traceId)
  → 先订阅 task ready event
  → workspace activeRun(taskId)=true
  → 上报 workspace count 与派生的 Host aggregate count
  → send ACK（不改变 count）
  → session ready
     → activeRun(taskId)=false
     → 更新 workspace/Host count
     → 若 workspace 正在 pending release，则执行 release
```

- Uma task/session tem no máximo um active run ao mesmo tempo; begins repetidos precisam ser idempotentes.
- Se o ACK falhar e o run não tiver começado, a contagem e a subscrição do ready são revertidas imediatamente.
- Quando o evento ready chega antes da continuation do ACK, o fechamento ainda precisa acontecer corretamente,
  sem que a continuação do ACK volte a marcar o workspace como running.
- O workspace count é o estado autoritativo; o Host aggregate count é derivado de todos os active runs de
  workspace e não mantém mais um segundo `runningPromptCount`.
- Quando o task meta não existe, não se pode falsificar a identidade do workspace; o fallback temporário de
  RPC in-flight serve apenas para diagnóstico de saída e não participa da decisão de workspace release.
- Se depois for confirmado que ainda há background work que precisa sobreviver após o session ready, o
  background handle precisa entrar no mesmo tracker como owner independente, sem voltar à contagem de
  Promise pending.

### Limpeza do estado de proxy do Shared Host

`taskMetaById` e a subscrição de eventos do workspace pertencem à camada de proxy do Desktop Host, e o
`disposeWorkspace()` remoto não os limpa automaticamente. Quando `ReleaseRemoteWorkspace` for concluído, é
obrigatório:

- Excluir todas as task metas correspondentes a `workspaceKey`.
- Salvar e descartar o Disposable devolvido por `onDynamicWorkspaceEvent`.
- Excluir o registro de subscrição do workspace, garantindo que um futuro attach possa assinar novamente.
- Limpar o estado do tracker já finalizado daquele workspace; se houver active run, o release ainda precisa ser adiado.

### Testes de regressão

- Fechar o workspace quando o ACK de `sendPrompt` já foi retornado e a session ainda não está ready: não
  deve chamar `releaseWorkspacePreparation()`.
- Depois que o ready chega: o pending release é executado exatamente uma vez.
- Ready antes da continuation do ACK: a contagem final é 0, sem active run residual.
- Dois workspaces em run paralelo: o workspace count é independente e o Host aggregate é a soma dos dois.
- Após o workspace release, a task meta, a subscrição do workspace e o listener são totalmente limpos; um
  novo attach consegue assinar novamente.

## Resumo da Feature

| Campo | Valor |
| --- | --- |
| Mudança | Ajustar o remote workspace WSL do Desktop de "um workspace, um conjunto de Host/server" para "compartilhar um conjunto de Host/server na mesma janela, mesmo distro e mesmo Linux user", completando回收 de runtime do workspace, controle de concorrência de conexão e barreira de saída. |
| Objetivo principal | Reduzir Hosts UtilityProcess duplicados, inicializações de `wsl.exe` e memória residente de `zcode-server` quando vários workspaces WSL são usados em paralelo, preservando as fronteiras de workspace, desktop e controle remoto pelo celular. |
| Superfícies visíveis ao usuário | Conexão WSL, seleção de diretório remoto, tab de remote workspace, fechamento de workspace, fechamento real da janela, saída do App, instalação de atualização, reload do Renderer, attachment de `/remote` pelo celular. |
| Escopo do pool | Embora o produto atual limite a uma janela, a identidade do pool inclui explicitamente `windowWebContentsId`; não há compartilhamento entre janelas do Electron. |
| Política de idle | Após a disappearance da última referência válida de workspace e das tasks draining, entra em idle TTL de 60 segundos; fechamento real de janela, saída do App e instalação de atualização pulam o TTL e executam imediatamente a recuperação limitada. |
| Docs existentes | `docs/wsl-remote-workspace-design.md`、`docs/remote/wsl-remote-realtime-boundary.md`、`docs/superpowers/specs/2026-07-19-wsl-remote-process-cleanup-design.md`、`docs/superpowers/specs/2026-07-13-window-scoped-ssh-remote-host-pooling-design.md`、`docs/architecture/zcode-code-architecture-overview.md`。 |
| Principais donos do código | `packages/desktop/src/main/desktopRemoteSessions.ts`、`packages/desktop/src/host/index.ts`、`packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`、`packages/server/src/remote/wsl-backend.ts`、`packages/server/src/remote/connect.ts`、`packages/services/src/zcode-agent/zcodeAgentProcessManager.ts`。 |

## Contexto e fatos já verificados

Atualmente WSL, Docker e server remote usam Host dedicado; apenas SSH usa pool de Host em escopo de
janela. Ao abrir vários workspaces no mesmo distro WSL, cada logical session cria um UtilityProcess Host
e inicia um `zcode-server` independente por meio de uma conexão stdio própria via `wsl.exe`.

```text
当前：同一 distro 的三个 WSL workspace

Desktop Main
├─ Host A ─ wsl.exe ─ zcode-server A ─ Agent(workspaceKey A)
├─ Host B ─ wsl.exe ─ zcode-server B ─ Agent(workspaceKey B)
└─ Host C ─ wsl.exe ─ zcode-server C ─ Agent(workspaceKey C)
```

Nas medições em runtime, três `zcode-server` que já concluíram o handshake, mas ainda não iniciaram
tasks reais, tinham RSS de cerca de 165 MB, 156 MB e 164 MB, totalizando cerca de 485 MB. Esse número não
inclui o UtilityProcess Host do Windows, os Agents iniciados por workspace nem os processos MCP
iniciados sob demanda; portanto serve apenas como baseline atual de servers duplicados e não pode ser
escrito como um orçamento fixo de produto.

Os seguintes fatos delimitam este design:

- O `createLocalServices()` e o `ZCodeAgentProcessManager` remotos já conseguem gerenciar múltiplos
  workspaces por `workspaceKey` dentro de um mesmo server.
- O Agente é gerenciado principalmente por workspace, e não "um Agente por conversa"; um Agente de
  workspace pode atender várias sessions.
- Subprocessos MCP são iniciados conforme configuração e uso; não se assume que um server ocioso
  necessariamente tenha uma árvore de processos MCP.
- O deploy do server já tem verificação de versão; em um acerto normal de versão o upload do arquivo
  grande é pulado, mas a primeira instalação ou um upgrade de versão ainda pode ser executado de forma
  concorrente por vários backends.
- O `WSLBackend.resolveInfoPromise` só tem cache dentro de um único backend; backends dedicados
  diferentes continuam repetindo availability, listagem de distros e sondagem de home.
- A UI já chama `releaseWorkspacePreparation()` para expressar que "o workspace não precisa mais do
  runtime aquecido", mas a implementação atual do adapter é vazia e não fecha o ciclo de recuperação de
  recursos em nível de workspace.
- O WSL de desktop comum precisa manter `desktop-continuous` e não pode registrar o `relay_bridge`
  usado pelo replay de celular só por causa do compartilhamento de Host.
- O design de limpeza de processos já existente determina que o fechamento real de janela, a saída do App
  e a instalação de atualização recuperem o Host de forma unificada, e proíbe chamar
  `wsl --terminate` / `wsl --shutdown`.

## Definição do problema

O problema não é apenas o excesso de inicializações de `wsl.exe`, mas o fato de que três ciclos de vida —
owner de Host, logical session e runtime de workspace — estão amarrados hoje em uma única camada:

```text
当前耦合

remoteSessionId 关闭
  = RPC port 关闭
  = 整个 UtilityProcess Host 关闭
  = WSL server connection 关闭
  = 该 server 内全部 workspace runtime 关闭
```

A vantagem do modelo dedicado é a simplicidade e o isolamento de falhas, mas vários workspaces do mesmo
distro/user não conseguem reaproveitar o grafo de serviços remotos que já suporta múltiplos workspaces.
Apenas adicionar cache de sondagem ou throttling de conexão não elimina o principal custo residente de
servers duplicados; copiar diretamente o pool de SSH deixaria Agents de workspaces sem referência vivos até
o fechamento da janela, criando outro tipo de retenção de recursos.

Portanto, este design precisa resolver simultaneamente:

1. Compartilhamento em nível de Host/server.
2. Attach/detach independente de logical sessions.
3. Liberação independente de Agent/runtime de workspace.
4. Recuperação por idle de Hosts sem referência.
5. Single-flight e condições de corrida em primeira conexão, sondagem e deploy.
6. Recuperação determinística e de alta prioridade no fechamento de janela, na saída do App e na instalação de atualização.

## Objetivos

- Workspaces WSL da mesma janela, do mesmo distro normalizado e do mesmo Linux user compartilham um
  UtilityProcess Host, uma conexão de server via stdio de `wsl.exe` e um `zcode-server`.
- Cada workspace mantém `remoteSessionId`, `attachmentId`, `workspaceIdentity`, `workspaceKey` e uma
  porta RPC do Renderer independentes.
- Ao fechar um único workspace, apenas a logical session é destacada; quando o workspace não tem
  referência de desktop/celular e não tem task em execução, o Agent/preparation runtime desse workspace
  é liberado.
- Quando a última referência do workspace é fechada mas ainda há task em execução, o runtime entra em
  draining; o runtime é liberado depois que a task chega ao estado terminal.
- Quando o pool inteiro está sem referência e sem workspace draining, entra em idle TTL de 60 segundos;
  reconectar dentro do TTL reutiliza o Host, e o vencimento do TTL libera Host/server.
- Fechamento real de janela, saída do App e instalação de atualização cancelam o TTL, impedem novos
  attaches e entram imediatamente na barreira de shutdown limitada já existente.
- Conexões, sondagem de ambiente e deploy concorrentes no mesmo pool não são executados em duplicidade; a
  primeira instalação/upgrade de versão não disputa arquivos de staging fixos.
- Preservar as semânticas de Desktop continuous, celular replayable, owner/lease, identidade de workspace
  e fila de comandos de task.
- Deixar evidências reais em Windows + WSL de PID, RSS, tempo de conexão e recuperação no fechamento
  para 1, 3 e 5 workspaces WSL.

## Não objetivos

- Não compartilhar Host entre janelas do Electron ou entre instâncias do App Desktop.
- Não transformar o `zcode-server` em um daemon residente escutando TCP/Unix socket.
- Não chamar `wsl --terminate` ou `wsl --shutdown`, nem parar o distro inteiro.
- Não varrer ou limpar processos de usuário por nome de processo, nem ampliar as fronteiras existentes do
  owner registry.
- Não transformar o backend Docker em shared pool; o owner e a semântica de isolamento de containers
  Docker são projetados separadamente.
- Não mudar a estratégia de cache do pool SSH.
- Não adicionar UI, configurações ou TTL configurável pelo usuário; o TTL desta rodada é fixo em 60
  segundos e testado por constante interna.
- Não afundar estados de task, stream, queue, snapshot, permission ou elicitation no Desktop Main.
- Não mudar o `@zcode/protocol` entre App e Agente, a menos que a implementação proves que o service RPC
  atual não consegue expressar o workspace runtime release; se for obrigatório alterar, a spec de
  protocolo e o runtime schema precisam ser atualizados separadamente.
- Não prometer que o distro WSL aparece como `Stopped` depois que o ZCode sai; o objeto de aceitação é o
  Host, o server e o Agente pertencentes ao ZCode.

## Log de Esclarecimentos

| Rodada | Pergunta | Decisão | Fronteira fixada |
| --- | --- | --- | --- |
| 1 | Dividir em várias specs? | Escrever uma única spec completa, descrevendo a implementação por fases dentro do documento. | Um design alvo, um critério de aceitação. |
| 2 | Liberar o Host imediatamente após fechar a última referência? | Manter idle TTL de 60 segundos após zerar as referências, desde que o ciclo de vida seja gerenciável em um único ponto e não introduza novas corridas. | O TTL é mantido em um único lugar, a entrada do pool no Main. |
| 3 | Como tratar a saída do App durante o TTL? | Saída do App, fechamento real de janela e instalação de atualização cancelam o TTL e liberam imediatamente. | O teardown do owner tem prioridade sobre o cache. |
| 4 | O pool é entre janelas? | Não entre janelas; o limite atual de janela única reduz ainda mais o risco de implementação. | A key continua incluindo `windowWebContentsId`. |
| 5 | E quando a última referência fecha mas ainda há task em execução? | Manter o runtime draining e liberar quando a task terminar; o teardown de nível App não espera a conclusão natural. | O detach da UI é separado do ciclo de vida do runtime owner. |
| 6 | Abordagem geral | Adotar shared pool WSL em escopo de janela. | Não adotar apenas quick wins nem daemon de App. |

## Comparação de abordagens

### Abordagem A: shared pool WSL em escopo de janela (adotada)

Separar o Host WSL da logical session dentro do Desktop Main, reutilizando o `AttachServicePort`
existente e o grafo de serviços remotos de múltiplos workspaces.

Vantagens:

- Elimina diretamente Hosts/servers duplicados na mesma janela e mesmo distro/user.
- Não introduz portas de escuta remotas nem modelo de segurança de daemon.
- Consistente com o limite atual de janela única do produto, com domínio de falha bem definido.
- Permite preservar a semântica externa de `remoteSessionId` e da API do Renderer.

Custos:

- O Main precisa manter pool, attachment, idle timer e single-flight de conexão.
- É obrigatória uma implementação real do release de runtime de workspace.
- Uma falha compartilhada afeta todos os workspaces do mesmo pool, exigindo semântica explícita de
  broadcast e recuperação.

### Abordagem B: manter dedicated, apenas cache e throttling (não adotada como solução final)

Pode servir como etapa anterior da Abordagem A, mas não elimina o custo residente dos `zcode-server`
duplicados e do grafo de serviços de Host local, portanto não pode ser o estado de conclusão desta feature.

### Abordagem C: daemon/pool WSL global do App (não adotada)

Compartilhar entre janelas ou entre instâncias do App reduziria ainda mais os recursos, mas exigiria
owner persistente, autenticação remota, upgrade de versão, permissões entre janelas e governança de
daemon órfão. O produto atual permite apenas uma janela, e não vale a pena assumir esse conjunto de
complexidades.

## Topologia de processos e responsabilidades dos componentes

```text
Desktop Main（生命周期 owner）
└─ Window-scoped WSL Host Pool
   key = windowWebContentsId + canonicalDistro + linuxUser
   │
   ├─ Remote Host UtilityProcess
   │  ├─ local remote-workspace service wrappers
   │  ├─ attachment registry
   │  └─ workspace lifecycle coordinator
   │
   └─ WSLBackend / wsl.exe stdio connection
      └─ one zcode-server
         ├─ workspaceKey A → Agent runtime A
         ├─ workspaceKey B → Agent runtime B
         └─ workspaceKey C → Agent runtime C
```

### Desktop Main

O Main gerencia apenas processos, logical sessions e ciclo de vida de attachments:

- Calcula o `poolKey` e faz get-or-create do Host.
- Executa single-flight de conexões para o mesmo pool.
- Cria um attachment independente para cada `remoteSessionId`.
- Deriva referências de workspace/pool a partir de logical sessions e mobile attachments.
- Gerencia um idle timer de 60 segundos único por Host.
- Ao fazer teardown de janela/App/update, cancela o timer e entra na barreira de shutdown.
- Quando o Host sai inesperadamente, notifica todas as logical sessions relacionadas, sem guardar estado
  de negócio das tasks.

O pool WSL deve ser extraído do já grande `desktopRemoteSessions.ts` para
`packages/desktop/src/main/remoteWslHostPool.ts`; esse arquivo cuida apenas da máquina de estados do
pool, single-flight, idle timer e dispose do Host, sem interpretar parâmetros de IPC nem notificar a UI.

### Remote Host

O Remote Host mantém um `activeServices` compartilhado, exposto a logical sessions por múltiplos
`AttachServicePort`. Ele é responsável por:

- Registro de attachment, proteção contra attach duplicado e detach.
- Ligação do attachment ao contexto de workspace.
- Pedido de release de Agent/preparation quando as referências do workspace zeram.
- Ciclo de vida running/terminal de tasks e coordenação de workspace draining.
- Ao fazer shutdown do Host, impedir novos attachments e liberar todos os services/conexões por fases.

### Backend WSL / camada de conexão

- Um Host de pool cria apenas um `WSLBackend`.
- `resolvedInfoPromise` continua garantindo single-flight dentro do backend.
- Main/Host, nas camadas superiores, permitem apenas um Promise in-flight de `connectRemote()` por pool.
- O backend só recicla os childs do Windows que ele mesmo criou e continua usando stdin EOF como caminho
  normal de saída do server.

### zcode-server / services remotos

- Continua sendo um único `createLocalServices()` atendendo múltiplos workspaces.
- `ZCodeAgentProcessManager` continua isolando Agents por `workspaceKey`.
- Implementar release de workspace preparation/runtime que possa ser aguardado e seja idempotente; não é
  permitido fechar apenas a porta do Renderer e deixar o Agente para trás.
- O release de runtime não apaga dados persistentes de task/session, apenas libera processos e recursos
  de memória reconstruíveis.

## Modelo de Identidade

### Identidade do pool

```text
poolKey = encode(
  windowWebContentsId,
  canonicalDistro,
  linuxUser
)
```

Regras:

- `windowWebContentsId` precisa existir; mesmo com apenas uma janela hoje, não pode ser omitido.
- A distro, após trim, gera a key pelo canonical distribution name devolvido pelo WSL; não se pode depender
  apenas do rótulo de exibição da UI.
- O Linux user precisa ser o user realmente em vigor no backend. Quando o user não é preenchido
  explicitamente, o resolved user deve ser obtido depois que a sondagem de conexão terminar, e a
  connect key provisória precisa ser fundida com segurança ao resolved pool key.
- `$HOME` não é identidade de user; o diretório home pode ser customizado.
- `workspacePath`, `workspaceIdentity`, `remoteSessionId` e a versão do asset do server não entram na pool key.
- Secrets, conteúdo de variáveis de ambiente ou o comando completo não entram na key nem no log.

Antes do início da conexão, distro/user ainda podem usar valores padrão, então a aquisição e a identidade
final são divididas em duas camadas:

```text
connectKey = windowWebContentsId
  + normalizedRequestedDistroOrDefaultSentinel
  + normalizedRequestedUserOrDefaultSentinel

resolvedPoolKey = windowWebContentsId
  + canonicalDistro
  + resolvedLinuxUser
```

- `connectKey` só é usada para single-flight de waiters antes do primeiro resolve e não pode ser a
  identidade de longo prazo de um Host ready.
- O mesmo `connectKey` inicia no máximo um Host por vez, evitando que múltiplos requests de
  distro/user padrão conectem em duplicidade antes do resolve.
- Após o resolve do Host, o `resolvedPoolKey` é registrado atomicamente, mantendo um alias
  `connectKey → resolvedPoolKey` em memória até o Host ser disposed ou o cache de discovery do WSL invalidar.
- Se outro Host ready já ocupa o mesmo `resolvedPoolKey`, o novo Host não publica attachment; os waiters
  migram para o Host existente e o novo Host entra em dispose. Esse caminho de conflito precisa ter teste unitário.
- Quando distro/user explícito e padrão resolvem para a mesma identidade, é permitido convergir após o
  primeiro resolve; requests concorrentes iniciais com `connectKey` diferentes podem gerar um Host
  perdedor de vida curta, mas nunca dois owners de pool ready.

### Identidade da logical session

`remoteSessionId` continua representando uma rota de remote workspace lógica Renderer/Main:

```text
workspace A → remoteSessionId A → attachment A ─┐
workspace B → remoteSessionId B → attachment B ─┼→ shared WSL Host
workspace C → remoteSessionId C → attachment C ─┘
```

Fechar o `remoteSessionId A` não equivale a fechar o Host compartilhado.

### Identidade do workspace

Toda semântica de isolamento continua usando:

```ts
workspaceKey = workspaceIdentity?.trim() || workspacePath;
```

Leitura/escrita de arquivos, Git, terminal e cwd de comandos continuam usando `workspacePath`. Main,
Host, mobile attachment, provider registry e pedidos de release do Agente precisam carregar simultaneamente
`workspaceIdentity` e `workspacePath`; é proibido casar apenas por caminho.

## Modelo de estado e fontes autoritativas

### Estado do pool de Host

```ts
type RemoteWslHostState =
  | "connecting"
  | "ready"
  | "draining"
  | "idle"
  | "disposing"
  | "disposed";

interface RemoteWslHostEntry {
  process: ElectronUtilityProcess;
  generation: number;
  target: SanitizedWslTarget;
  resolvedDistro?: string;
  resolvedUser?: string;
  state: RemoteWslHostState;
  readinessPromise: Promise<void>;
  idleTimer?: ReturnType<typeof setTimeout>;
  disposePromise?: Promise<void>;
}
```

Esta é a forma de design e não exige que a implementação copie os tipos literalmente; mas os seguintes
invariantes precisam ser preservados:

- Uma pool key tem no máximo uma entrada de Host não disposed por vez.
- Uma entrada de Host tem no máximo um idle timer e uma dispose Promise por vez.
- `generation` é monotonicamente crescente; timer, continuation de ready e callback de exit precisam
  comparar simultaneamente o objeto da entrada e o generation antes de modificar o map.
- Depois de `disposing`, novos attaches são recusados; quando o chamador precisa criar um novo Host, ele
  precisa esperar a remoção da entrada antiga do map.
- A remoção do map segue compare-and-delete; um exit de Host antigo não pode remover o novo Host da mesma key.

### Estado da logical session

```ts
interface AttachedWslWorkspaceSession {
  host: RemoteWslHostEntry;
  attachmentId: string;
  workspacePath: string;
  workspaceIdentity?: string;
}
```

O Main não mantém um `refCount` manual adicional derivável. A referência de desktop é derivada das
logical sessions attached; a referência de celular é derivada do registry de attachments de shared host já
existente. Quando for necessário decidir com frequência, um índice é permitido, mas ele só pode ser
atualizado pela mesma entrada atômica de attach/detach e precisa de teste de consistência.

### Estado do runtime do workspace

```text
active
  ├─ refs > 0                         → active
  └─ refs = 0
     ├─ running task exists           → draining
     └─ no running task               → releasing → released

draining
  ├─ new attachment arrives           → active
  ├─ task reaches terminal state      → releasing → released
  └─ owner teardown                   → forced bounded shutdown
```

A autoridade sobre se a task está em execução continua no Host/Agente remoto/serviço de session. O Main
pode manter uma marca de ciclo de vida de "workspace está draining", mas não pode duplicar o conteúdo das
tasks, eventos de stream ou snapshots.

O acquire/release do runtime de workspace usa uma workspace generation separada e monotonicamente
crescente. Quando o Main recria uma logical session no mesmo workspace, ele precisa primeiro enviar ao Host
a generation de acquire e esperar o ACK; só após um ACK de sucesso pode anexar a MessagePort de RPC. Ao
receber o acquire, o Host cancela releases mais antigos que ainda não começaram; se o release antigo já
entrou em `releaseWorkspacePreparation()`, ele espera a conclusão antes de dar ACK. Uma nova session não
pode entrar em resume/create/sendPrompt antes de o release ser concluído.

```text
close generation=7
  → ReleaseRemoteWorkspace(generation=7)
      → releaseWorkspacePreparation in-flight

reopen generation=8
  → AcquireRemoteWorkspace(generation=8, requestId)
      → invalidate pending release generation<8
      → await in-flight release generation=7
      → RemoteWorkspaceAcquired(generation=8, requestId)
  → attach service port
  → resume/create/sendPrompt
```

A implementação adota uma convergência equivalente de "resolver antes de criar o Host": o Main executa,
para o target provisório, uma resolução de identidade WSL que pode ser cacheada e cujas falhas não são
persistidas; só depois de obter o canonical distro name da lista WSL e o Linux user real de `id -un` é que
chama o `getOrCreate` do pool de Host. Portanto, a key provisória só é usada para single-flight/cache do
resolver e não se torna a identidade de longo prazo de um Host ready; target default, target explicitamente
equivalente e target com capitalização diferente que cai no mesmo nome da lista WSL acabam usando a mesma
resolved key. Resolvers concorrentes podem repetir a sondagem, mas o `getOrCreate` resolvido precisa garantir
atomicamente que apenas um Host é spawneado. Quando o App/janela fecha durante a resolução, a continuation
concluída precisa checar novamente o estado de shutdown/janela e não pode criar Host depois do snapshot de
teardown.

A espera do Main pelo ACK de acquire precisa ter um deadline de 10 segundos; o deadline encerra apenas
aquele connect lógico, não permite contornar o ACK para anexar, e também não pode matar um Host
compartilhado que ainda serve outros workspaces. O exit do Host e o shutdown do App precisam rejeitar todos
os waiters de acquire pendentes. Como a generation é atribuída antes do envio de `AcquireRemoteWorkspace`,
um timeout/cancel não pode simplesmente descartar o waiter: o Main precisa enviar imediatamente um release
compensatório best-effort para a mesma generation. Se o ACK de sucesso chegar depois de o waiter desistir, o
Main precisa confirmar que aquele workspace não tem owner de desktop/mobile attached e reenviar o release
para a generation carregada pelo ACK; um ACK de falha não precisa de compensação. Assim, mesmo que o
primeiro release se sobreponha a um release-in-flight de generation antiga dentro do Host e não seja
executado, o ACK tardio ainda conclui o fechamento depois do release antigo.

Um ACK de acquire bem-sucedido significa apenas que o Host concedeu o owner de runtime daquela generation
de workspace, e não que o attachment lógico de desktop foi estabelecido. Se, depois do ACK, alguma etapa de
`AttachServicePort`, transferência da porta do renderer ou tracking de session falhar, o Main precisa
executar um `ReleaseRemoteWorkspace` compensatório para a mesma generation e só então liberar o pool owner;
liberar apenas o pool owner não equivale a liberar o workspace runtime dentro do Host compartilhado. O
attachment de shared host no celular precisa validar o `workspaceGeneration` já vinculado antes de criar
ou transferir a MessagePort, e uma session inválida não pode deixar no Host um attachment sem chamador.

```text
AcquireRemoteWorkspace(generation=N) → ACK
  → validate generation
  → AttachServicePort
      ├─ success → logical session owns runtime N
      └─ failure → ReleaseRemoteWorkspace(generation=N)
                  → release pool owner
```

## Tempos de criação, reuso e cancelamento

```text
Workspace A connect
  → Main canonicalize provisional WSL target
  → reserve pool entry(connecting, generation=N)
  → create Host
  → create WSLBackend
  → resolve distro + Linux user
  → detect/deploy/start zcode-server
  → Host Connected
  → entry(ready)
  → AttachServicePort(A, workspace context)
  → publish RemoteServicePort(A)
```

Conexões concorrentes para o mesmo target:

```text
Connect A ─┐
Connect B ─┼→ same readinessPromise → one detect/deploy/server start
Connect C ─┘

ready
  ├→ independent attachment A
  ├→ independent attachment B
  └→ independent attachment C
```

Regras de cancelamento:

- Cancelar um connect lógico pendente remove apenas aquele waiter.
- Cada pending owner criado por `wslHostPool.retain()` precisa ser liberado por uma única função de
  fechamento idempotente; depois que o cancelamento provoca a rejeição do Promise de acquire, o catch
  assíncrono não pode diminuir a referência de novo. Após o attach bem-sucedido, o owner é transferido
  do connect pendente para a logical session rastreada, e o dispose da session faz o único release posterior.
- Só fazer dispose do Host connecting quando todos os waiters foram cancelados, o Host ainda está connecting
  e ainda não há attachment.
- Depois que o Host está ready, um cancel antigo não pode destruir um Host já reutilizado por outra session.
- Shutdown do App/janela/update sobrescreve incondicionalmente as regras de waiter, recusando todos os
  pendentes e liberando o Host.
- A continuation de `setupRemoteConnection()`, ao retomar após shutdown, precisa detectar o token de
  ciclo de vida do Host e não pode republicar conexão ou attachment.

## Detach de workspace e recuperação de runtime

```text
关闭 workspace A
  → 从 logical session map 摘除 A
  → DetachServicePort(attachment A)
  → 派生 workspaceKey A 的 desktop/mobile refs
     ├─ refs > 0
     │  → 保留 runtime
     └─ refs = 0
        ├─ no running task
        │  → disposeWorkspace(workspaceKey A)
        └─ running task
           → mark draining(A)
           → terminal event
           → re-check refs
              ├─ refs > 0 → active
              └─ refs = 0 → disposeWorkspace(A)
```

`releaseWorkspacePreparation()` precisa passar de operação vazia para uma entrada real de ciclo de vida,
satisfazendo:

- Os parâmetros usam `workspaceIdentity` com fallback para `workspacePath` ao resolver o `workspaceKey`.
- Forma uma implementação única com `disposeWorkspace()` ou uma API equivalente do Agent manager, sem
  manter duas semânticas de release.
- É idempotente; chamadas repetidas reutilizam o in-flight ou devolvem o resultado já liberado.
- É mútuo excludente com `ensureAgentReady()` do mesmo workspace ou protegido por generation para evitar que
  "um warm-up antigo publique Agent de novo depois de o release terminar".
- Não mata o Agente diretamente quando existe task em execução; devolve um resultado explícito de
  busy/draining, ou o coordinator do Host adia a chamada.
- O teardown do owner pode contornar a política de retenção por busy e entrar em um shutdown limitado de
  todo o Host.
- Libera apenas processos, watchers, transports MCP e caches reconstruíveis, sem apagar dados persistentes
  de session/task.

## Idle TTL do pool

O pool só pode entrar em idle quando todas as condições abaixo forem satisfeitas ao mesmo tempo:

1. Não há logical session de desktop attached.
2. Não há mobile shared-host attachment desse Host.
3. Não há workspace draining/task running owner.
4. O Host está ready e não há connect waiter pendente.

```text
last owner released
  → entry.state = idle
  → install timer(entry identity, generation=N, 60s)

new connect before deadline
  → compare current entry + generation
  → clear timer
  → state = ready
  → attach

timer fires
  → compare current entry + generation
  → re-check all four idle predicates
  ├─ predicate false → no dispose; transition to ready/draining as derived
  └─ predicate true
     → state = disposing
     → remove/mark entry atomically
     → disposeHostProcessAndWait
```

A constante de TTL precisa ter nome e definição centralizada, e os testes unitários devem usar clock/fake
timer injetável; é proibido espalhar `60_000` por vários pontos de chamada.

## Fechamento real de janela, saída do App e instalação de atualização

O teardown do owner tem prioridade sobre o cache idle e sobre tasks draining:

```text
real window close / app quit / update install
  → manager enters shuttingDown
  → reject new Host, connect and attachment
  → cancel all Host idle timers
  → reject pending connect waiters
  → snapshot all dedicated/shared/bot Hosts
  → dedupe by process identity
  → dispose all Hosts in parallel
  → await aggregate bounded barrier
  → continue window destruction / app quit / update handoff
```

- Um reload do renderer não é teardown de owner; as logical sessions existentes são restauradas conforme
  o design de reattach atual.
- Minimizar e ocultar para a bandeja não disparam idle e não reduzem owners de workspace.
- Se a saída do App ocorrer durante o idle TTL, o timer é cancelado e a liberação acontece imediatamente,
  sem esperar o TTL.
- Se a saída do App ocorrer com workspace draining, não se espera a task terminar naturalmente; o deadline
  de shutdown de Host/server/Agente já existente é reutilizado.
- Chamadas repetidas de `before-quit`, de `closed` da janela e da preparação de update precisam acertar o
  mesmo resultado single-flight.
- O Host WSL compartilhado precisa entrar no snapshot completo de Hosts remotos de nível de app já
  existente e não pode depender apenas do evento `closed` da janela.

## Gerenciamento de concorrência de sondagem, deploy e `wsl.exe`

### Cache de sondagem

O cache tem duas camadas:

- Dentro do ciclo de vida do Host do pool: o `resolvedInfoPromise` do backend é reutilizado permanentemente.
- Discovery somente leitura em nível de processo do Main: `wsl --status` e a lista de distros usam cache
  com TTL de 5 segundos; é permitido invalidar ativamente quando o usuário atualiza a interface de
  conexão WSL ou quando a conexão falha.

O Linux user, o `$HOME` e a distro real precisam ter como escopo o target concreto do Host; não se pode
usar cache global permanente baseado apenas no usuário Windows. Promises rejeitadas precisam ser removidas
do cache, para que conexões seguintes possam tentar de novo.

### Throttling de conexão

Para o mesmo poolKey usa-se single-flight em vez de semáforo; conexões para distros diferentes podem ser
concorrentes. Se um trace de execução real provar que a VM do WSL ainda sofre contenção de lock em nível
de sistema com concorrência entre distros diferentes, aí sim se adiciona um semáforo global de baixa
concorrência, sem fixar uma estratégia serial por estimativa prévia.

### Single-flight e lock de deploy

O acerto normal de versão continua pulando o upload. Primeira instalação/upgrade precisa satisfazer:

- Dentro do mesmo Host, o deploy reutiliza o readiness Promise.
- Mesmo entre janelas ou em uma segunda instância do App, sem compartilhamento de pool, não se pode competir
  pelo mesmo `${remotePath}.new` fixo.
- O staging path usa um sufixo imprevisível e único para aquela implantação.
- A substituição final é um rename atômico dentro do mesmo filesystem.
- O escopo distro/user/server install root usa um lock remoto; após uma saída anormal do detentor do lock,
  o lock precisa ser recuperável por timeout.
- A versão é revalidada dentro do lock, e quem espera não pode repetir o upload incondicionalmente após
  obter o lock.
- A limpeza apaga apenas o staging file do owner atual, sem usar glob amplo.
- O deploy lock só oferece exclusão mútua e não substitui o deadline de rede dentro do lock; tanto os
  response headers quanto a leitura do body de cada candidato CDN do manifest precisam respeitar
  `manifestRequestTimeoutMs`, e após o timeout uma conexão posterior pode tentar de novo.
- Uma transação de deploy precisa fixar um único snapshot fresh do manifest; a decisão de skip do GLM, o
  materialize do release local e a component identity usada na escrita final precisam usar o mesmo snapshot
  SHA-256. Versão semântica igual com SHA diferente exige novo deploy; SHA igual não pode reenviar o
  artefato só porque o rótulo de versão mudou.
- O manifest source precisa ser escolhido conforme a origem real do recurso de cada component: com o
  arquivo mock-cdn completo, usa-se o mock manifest; quando o mock manifest existe mas o arquivo do
  component alvo está incompleto e o fallback de CDN está configurado, tanto a decisão por SHA quanto o
  materialize precisam passar para o mesmo manifest fresh de CDN. É proibido decidir o skip com o SHA do
  mock e depois enviar o artefato do CDN, e também é proibido baixar o artefato inteiro do GLM só para ler
  o SHA.

O lock remoto precisa cobrir a transação completa de `deployServer`, e não apenas um `installFile()` ou
`installDirectory()` específico: o server principal, o runtime Node, o bundle do Agente, o diretório de
plugins oficiais e o marcador de versão final precisam pertencer ao mesmo owner de implantação, proibindo
que duas versões se instalem intercaladas. O lock é fixado em `${REMOTE_BASE}/.deploy.lock`, o owner usa um
UUID imprevisível; a shell que detém o lock atualiza o mtime do arquivo de owner a cada 30 segundos, e quem
espera só assume locks sem heartbeat há mais de 600 segundos. Na liberação é preciso comparar novamente o
owner token, proibindo que um owner antigo remova o lock de um sucessor; um stdin EOF causado por
fechamento de Host/backend também passa pelo mesmo cleanup verificado por owner.

`wsl.exe -- bash -lc <command>` passa primeiro pelo shell padrão do WSL, que reescreve os argumentos, e uma
`$lock_dir` / `$owner_token` local colocada direto no argumento de command pode ser expandida para vazio
antes de o lock-holder realmente executar. O script do lock-holder precisa ser gravado como um payload
octal sem `$` em um script temporário único do owner e então executado pelo bash; ao final o script remove
sincronamente esse arquivo temporário, e o stdin continua reservado para o marcador de release.
SSH/Docker reutilizam o mesmo wrapper e não podem bifurcar a semântica da transação de deploy para WSL.

O release do lock-holder é uma fronteira externa de stdio e espera no máximo 5 segundos por padrão para
o close. Em caso de timeout, é preciso fazer best-effort destroy do stdin/stdout/stderr do stream de lock
desta tentativa e devolver um erro com owner, deadline e resumo do stderr; é proibido descartar
diretamente o backend compartilhado. Se o corpo do deploy e o release falharem ao mesmo tempo, o chamador
precisa preservar os dois contextos de erro, sem que o timeout de release sobrescreva a falha original do
deploy.

A aquisição do lock também é uma fronteira externa de stdio, com espera total padrão de no máximo 120
segundos, que pode ser sobrescrita pela camada de conexão via
`DeployOptions.deployLockAcquireTimeoutMs`. O deadline começa depois que o stream do lock-holder é criado
com sucesso; se nenhum acquired marker aparecer nunca, mesmo que outros owners continuem emitindo heartbeat,
é preciso destruir o próprio stdin/stdout/stderr deste waiter, remover os listeners e lançar um acquisition
timeout contendo owner, deadline e resumo do stderr. É proibido apagar o lock de outro owner ou descartar
o backend inteiro, que pode estar compartilhado.

```text
deployServer
  → start remote lock-holder shell
      → mkdir ~/.zcode/server/.deploy.lock (atomic acquire)
      → write owner UUID + heartbeat
      → emit acquired marker
  → lock 内重新执行 checkServerDeployDecision
  → fetch one bounded fresh manifest snapshot
      → GLM SHA decision + release materialize share the snapshot
  → install all selected components + write version markers
  → send owner-scoped release / stdin EOF
      → compare owner UUID → remove only this lock
```

O diretório local de upload e o diretório de plugins oficiais em modo de desenvolvimento precisam usar
simultaneamente um archive remoto único e um staging de extração único. Quando o upload do arquivo, a
extração ou a substituição falham, apenas o archive/staging do owner atual é limpo; a substituição final do
diretório é executada dentro do lock do deploy-root. O `RemoteDownloadAssetInstaller.installDirectory()`
já tem staging único, mas seu `rm + mv` final também depende do lock de deploy-root acima; o lock de cache
do component não pode substituir o transaction lock do install-root.

## Exceções, desconexões e recuperação

A barreira de shutdown do backend WSL precisa primeiro proibir novos comandos e só então reciclar todos os
childs já registrados. Qualquer continuation que atravesse um await de discovery/identity depois da
porteira de entrada de `exec()` precisa checar disposed novamente antes do `spawn()` sincrono final; a
checagem, o spawn e o registro do child ficam no mesmo JavaScript turn, e é proibido gerar um novo
`wsl.exe` depois que `disposeAndWait()` já concluiu. Comandos de sondagem chamados direto por `execFile()`
também precisam checar disposed antes de criar o child de forma síncrona.

### Saída inesperada do Shared Host

```text
Host/server unexpected close
  → compare pool entry identity
  → mark disposed and remove pool entry
  → cancel idle timer
  → enumerate attached logical sessions
  → emit RemoteSessionClosed for each session
  → existing UI marks affected workspaces disconnected
```

A saída de um Host compartilhado afeta todos os workspaces do mesmo pool; esse é um domínio de falha
explicitamente aceito pelo esquema compartilhado. Ao reconectar qualquer workspace ainda aberto, o Main
cria um novo Host; os demais workspaces do mesmo grupo que continuam abertos podem reutilizar esse Host
restaurando os attachments um a um. Falhas de inicialização de path/provider/Agente de cada workspace
permanecem independentes, e a falha do workspace B não desfaz o workspace A já recuperado.

### Continuation obsoleta

Todas as connections, deploys, attaches, timers e continuations de exit que atravessam `await` precisam
checar, antes de escrever estado compartilhado:

- O manager ainda não entrou em `shuttingDown`.
- O map do pool ainda aponta para a mesma entrada de Host.
- A generation não mudou.
- O request/session lógico ainda não foi cancelado.

Em caso de falha na checagem, apenas os recursos que a própria continuation criou e que ainda não
transferiram ownership são liberados, sem publicar port/connection obsoletos.

### Logs de erro

- Host create/ready/idle/reuse/dispose/exit são `info` de ciclo de vida de baixa frequência.
- Espera de deploy lock, cancelamento de conexão e mudança de idle predicate usam `debug` ou um único
  `info`, sem gravação frequente de polling.
- Timeout, callback obsoleto e release busy acima do esperado usam `warn`.
- Falhas irrecuperáveis em handshake, deploy, release do Agente ou shutdown usam `error`.
- O log inclui o pool label, a generation, um resumo seguro de remoteSessionId/workspaceKey, a phase e o
  elapsedMs; secrets, environment completo e comandos do usuário são proibidos.

## Fronteira entre Desktop continuous e celular replayable

```text
shared WSL Host
├─ desktop attachment
│  └─ clientMode=desktop-continuous
│     └─ direct continuous events; no relay_bridge
└─ mobile attachment
   └─ clientMode=web-remote-replayable
      └─ existing replayable gap/snapshot recovery
```

- O compartilhamento de Host muda apenas o reuso de processos, não o delivery kind.
- O WSL de desktop comum não pode registrar `relay_bridge` só porque o Host virou shared.
- O `/remote` do celular continua fazendo attach no Host WSL já existente no desktop, e é proibido iniciar
  uma session/runtime WSL independente.
- A desconexão do celular apenas destaca o mobile attachment; se não houver outras referências nem task em
  execução, é aí que ele participa da decisão de idle de workspace/pool.
- `workspaceIdentity` e `remoteSessionId` precisam atravessar bridge, snapshot, queue, owner command e
  cache keys.
- As proteções de owner/lease e de stale run continuam; o Host compartilhado não pode substituir a
  verificação de task owner.
- O Main não monta eventos replayable nem cacheia o stream de tasks para ajudar o compartilhamento de Host.

## Decisão sobre o backend Docker

Este design deliberadamente não adiciona um shared pool simétrico para o Docker:

- A identidade compartilhada do WSL é a distro estável mais o Linux user sob o usuário Windows atual; um
  target Docker pode corresponder a um container de uso único, a um nome de container mutável ou a um owner
  de ciclo de vida de container diferente.
- Não há evidência de que vários workspaces Docker devam compartilhar um único grafo de serviços de
  container, nem confirmação do usuário sobre se o container deve ser mantido, parado ou removido depois de
  fechar o último workspace.
- Aplicar o pool de WSL/SSH apressadamente muda o owner do container e a semântica de isolamento.

O Docker continua usando Host dedicado, mas segue participando da barreira unificada de shutdown de
fechamento real de janela/App/update e da interface de dispose idempotente. Para compartilhar o Docker no
futuro, é preciso confirmar antes separadamente a identidade, o owner, a reconstrução e o isolamento
volume/workspace do container.

## Implementação por fases

Este design produz apenas uma spec final, mas a implementação é dividida em três partes por dependência;
cada parte precisa permanecer executável, testável e reversível.

### Fase 1: workspace release e base de concorrência

- Estabelecer um workspace runtime release real, idempotente e aguardável para
  `releaseWorkspacePreparation()`.
- Complementar o warm-up do Agente com generation/single-flight de release.
- Introduzir um cache de discovery WSL com TTL curto.
- Adicionar single-flight para conexão/deploy do mesmo target.
- O deploy passa a usar staging path único e lock de distro/user/install-root.

Após a fase, ainda é possível manter o Host dedicado, mas fechar um workspace preparation que não está
mais em uso já recicla o Agente, e a tempestade de primeiras conexões e a，竞争 de deploy ficam
controladas.

### Fase 2: pool de Host WSL em escopo de janela

- Extrair ou adicionar o owner do pool de Host WSL.
- Desacoplar Host de logical session, reutilizando `AttachServicePort`.
- Adicionar contexto de workspace, derivação de referências desktop/mobile e estado draining.
- Adicionar idle TTL de 60 segundos, generation e proteção contra callbacks obsoletos.
- Fechar em lote as logical sessions relacionadas quando um Host compartilhado cair de forma anormal.
- Incluir Hosts WSL compartilhados na barreira de shutdown de janela/App/update.

### Fase 3: verificação em runtime e baseline de performance

- Registrar, em ambiente real Windows + WSL, para 1, 3 e 5 workspaces: PID do Host do Windows, PID do
  `wsl.exe`, PID do server WSL, PID do Agente, RSS e tempo de conexão.
- Injetar close/reopen, corrida de timer, cancelamento de connect pendente, crash de Host e teardown de update.
- Validar a fronteira entre desktop continuous e mobile replayable.
- Só avaliar um semáforo global adicional quando a evidência de execução provar que ainda há competição de
  lock de sistema na concorrência entre distros diferentes.

## Design de testes

### Testes unitários de identidade do pool

- Mesma janela, mesmo canonical distro e mesmo resolved user produzem a mesma key.
- O display name de distro converge pelo resultado da canonicalização em termos de caixa/espaços.
- Mesmo distro com users diferentes não compartilha.
- Janelas diferentes não compartilham, mesmo com o limite atual de janela única do produto.
- `workspacePath`, `workspaceIdentity` e `remoteSessionId` não afetam a pool key.
- Secrets não entram na key nem no log de snapshot.

### Testes unitários do pool no Desktop Main

- Três connects concorrentes com a mesma key spawneiam apenas um Host e compartilham o readiness Promise.
- Um Host ready devolve três attachmentId/MessagePort diferentes para três sessions.
- Cancelar um waiter não afeta os outros; só quando todos os waiters são cancelados o Host connecting é descartado.
- Fechar uma session apenas destaca, sem destruir um Host que ainda tem referências.
- Depois que a última referência desaparece e não há task em execução, instala-se um timer único de 60 segundos.
- Reconectar dentro do TTL cancela o timer e reutiliza o mesmo processo.
- Uma nova referência antes do vencimento do TTL torna o timer um no-op.
- Timer/exit callback de generation antiga não afetam o novo Host da mesma key.
- Fechamento de janela/saída do App/instalação de update cancelam o timer e aguardam imediatamente o dispose do Host.
- Reload do renderer, minimizar e ocultar na bandeja não disparam dispose do Host.
- A saída inesperada do Host compartilhado envia `closed` para todas as sessions relacionadas.

### Testes unitários do runtime de workspace

- `releaseWorkspacePreparation` deixa de ser operação vazia e libera o Agente correto por workspaceKey.
- Releases repetidos do mesmo workspace são idempotentes.
- Release concorrente com warm-up não publica um Agente que já perdeu o owner.
- Com refs=0 e sem task em execução, o release é imediato.
- Com refs=0 e task em execução, entra em draining sem interromper a task.
- As refs são checadas de novo após o evento terminal; só libera se não houver nova referência.
- Reattach durante o draining volta a active, sem liberar o Agente em uso pelo novo owner.
- Quando o release já começou após o close e o mesmo workspace reabre imediatamente, o Main não anexa a
  porta RPC antes de o release antigo concluir.
- A generation de acquire invalida releases pendentes mais antigos; um release obsoleto que chega não
  limpa o runtime novo.
- Timeout do ACK de acquire ou exit do Host faz o connect falhar explicitamente, sem contornar o ACK para
  entrar em resume/sendPrompt.
- ACK de acquire bem-sucedido com falha no attachment de desktop dispara release compensatório do
  workspace runtime e do pool owner da mesma generation.
- O attach de shared host pelo celular recusa sessions inválidas sem workspace generation antes de
  transferir a MessagePort.
- O teardown de App/janela/update pode entrar em shutdown limitado de todos os Hosts.
- O release não apaga dados persistentes de task/session.

### Testes unitários de deploy/discovery

- Múltiplas chamadas compartilham o Promise/cache de discovery bem-sucedido.
- Discovery rejeitado não é cacheado permanentemente.
- A TTL do cache expira e uma refresh ativo volta a sondar.
- Versão correspondente pula o upload.
- Quando dois installers competem, só o detentor do lock envia; quem espera revalida a versão dentro do lock
  e pula.
- O staging path é único a cada vez; a falha limpa apenas o staging file atual.
- Locks obsoletos são recuperáveis, e locks ativos não são tomados.
- Com o deploy lock adquirido e o close de release nunca disparando, após o deadline de 5 segundos o owner
  stream é destruído e um timeout é devolvido.
- Quando deploy e release do lock falham ao mesmo tempo, o erro preserva tanto a falha de deploy quanto a de release.
- Quando o body do manifest fica meio aberto, a falha ocorre dentro do deadline e o próximo deploy inicia
  uma nova requisição em vez de reutilizar um Promise pendente.
- Quando a versão semântica do GLM não muda mas o SHA do manifest muda, há novo deploy, e a decisão e a
  instalação usam o mesmo manifest fixado.
- Quando o mock manifest existe mas o arquivo do GLM está incompleto, a decisão por SHA e o materialize
  usam o CDN; se o SHA remoto já corresponde, apenas o manifest é lido, sem baixar o artefato do GLM.

### Testes unitários de shutdown de Host/server

- Todos os attachments do shared WSL Host param de aceitar novos RPC antes do dispose dos services.
- Um release de workspace pendente ou que lança erro não bloqueia a fase de fechamento da conexão remota.
- Após stdin EOF, espera-se a saída normal do server/`wsl.exe`.
- O fallback por deadline trata apenas de childs pertencentes ao backend e não termina o distro.
- Dispose por idle e dispose de nível de app concorrentes reutilizam o mesmo Promise.

### Testes de fronteira desktop/mobile

- O attachment WSL de desktop mantém `desktop-continuous` e não registra `relay_bridge`.
- O attachment do celular usa `web-remote-replayable` e não cria um Host WSL independente.
- Snapshot/event/queue/owner command de workspaces diferentes no mesmo Host não fazem roteamento cruzado.
- O detach do celular não mata um runtime que ainda tem owner de desktop ou task em execução.

### Verificação real em Windows + WSL

Cada amostra precisa registrar timestamp e relação pai-filho; não é possível 判断 apenas por screenshot
do Gerenciador de Tarefas:

1. Abrir um workspace WSL e registrar PID e RSS de Host, `wsl.exe`, server e Agente.
2. Abrir na mesma janela do segundo ao quinto workspace do mesmo distro/user, confirmando que os PID de
   Host/server não aumentam e que o Agente aumenta conforme necessário por workspace.
3. Comparar o RSS total, o tempo de primeira conexão e o tempo de attach de workspaces subsequentes entre a
   baseline dedicated e o shared pool.
4. Fechar um dos workspaces e confirmar que o attachment desaparece; sem task, o Agente correspondente
   sai dentro do deadline, e Host/server permanecem.
5. Fechar o workspace com uma task em execução e confirmar que a task não é interrompida imediatamente;
   depois do terminal, o Agente é liberado.
6. Fechar o último workspace e confirmar que Host/server permanecem por 60 segundos; depois do TTL, saem.
7. Reabrir o workspace dentro do TTL e confirmar o reuso dos PIDs originais de Host/server, sem o timer
   antigo matar por engano.
8. Sair do App durante o TTL e confirmar que não se espera 60 segundos e que todos os Host/server/Agente
   pertencentes ao ZCode saem dentro do deadline de shutdown.
9. Validar separadamente fechamento real de janela, instalação de atualização, reload do renderer,
   minimizar e ocultar na bandeja.
10. Depois do attach do celular, fechar a tab de desktop e verificar que o owner mobile mantém o runtime;
    ao o celular desconectar de novo, entrar na decisão de draining/idle.
11. Injetar crash de Host, cancelamento de connect, falha de deploy e timer obsoleto, guardando logs e evidências de PID.
12. Confirmar que o distro pode continuar Running e que processos comuns do usuário no mesmo distro não são afetados.

Verificação mecânica do repositório:

```sh
pnpm typecheck
pnpm lint
```

## Observabilidade e métricas de performance

Comparar antes e depois da implementação oficial usando a mesma versão de server, o mesmo distro e o mesmo
conjunto de workspaces:

| Métrica | Direção esperada |
| --- | --- |
| Número de UtilityProcess Host no mesmo pool | `N → 1` |
| Número de `zcode-server` no mesmo pool | `N → 1` |
| Número de launchers `wsl.exe` residentes no mesmo pool | `N → 1` |
| Tempo de attach do segundo ao quinto workspace | bem abaixo da primeira conexão a frio, sem repetir deploy/server start |
| RSS de server ocioso | cai de N cópias para 1; sem definir um threshold absoluto entre versões |
| Número de Agents de workspace | por workspace active/draining, e não por Host ou conversation |
| Tempo de sobrevivência do Host após o último owner fechar | 60 segundos ± tolerância do scheduler; teardown do App usa o deadline de shutdown em vez de 60 segundos |

Os logs precisam permitir reconstruir a seguinte linha do tempo: create/reuse do pool, generation do Host,
attach/detach de session, draining/release de workspace, instalação/cancelamento/disparo do idle timer,
override de shutdown por owner e exit do Host.

## Riscos e mitigação

| Risco | Mitigação |
| --- | --- |
| Um crash do Host compartilhado amplia o impacto | limitar a janela+distro+user; notificar em lote as sessions relacionadas; reconectar recuperando por workspace de forma independente. |
| Timer antigo mata um Host já reutilizado | entry identity + generation monotônica + rederivação dos idle predicates antes do disparo. |
| Refcount manual drifts | preferir derivação a partir dos conjuntos autoritativos de attachment lógico/mobile; se um índice for criado por performance, só permitir atualização pela entrada atômica e fazer teste de consistência. |
| Fechar a tab mata uma task de background | entrar em draining quando refs=0 e houver task em execução; liberar somente após o terminal. |
| Draining nunca termina | aguardar normalmente o ciclo de vida da task; teardown real de owner usa o shutdown limitado já existente; desconexão anormal limpa junto com o exit do Host. |
| Dados de workspaces se misturam no server compartilhado | todas as keys de isolamento usam `workspaceIdentity` com fallback para `workspacePath`; teste end-to-end de múltiplos workspaces. |
| Competição na primeira instalação do deploy | staging único + lock remoto + revalidação de versão dentro do lock. |
| Cache de discovery obsoleto | TTL curto de 5 segundos, refresh ativo/invalidação por falha, sem cachear resolved user/home como valor global permanente. |
| Saída do App atrasada pelo TTL | o shutdown cancela o timer primeiro e descarta em paralelo imediatamente; o TTL nunca entra no orçamento de espera da saída. |
| replayable do celular contaminando o desktop | o attachment preserva clientMode/deliveryKind; o WSL de desktop proíbe explicitamente relay_bridge. |
| Docker simetrizado por engano | esta spec mantém dedicated explicitamente e exige nova confirmação do owner de container antes de projetar. |

## Critérios de aceitação

- Vários workspaces WSL da mesma janela, do mesmo canonical distro e do mesmo Linux user existem com apenas
  um Host, uma conexão de server e um `zcode-server`.
- Cada workspace lógico mantém remoteSessionId, attachment, workspaceIdentity e workspaceKey
  independentes; task/session/provider/queue não se cruzam entre workspaces.
- Fechar um workspace sem task em execução realmente libera o Agent/preparation runtime correspondente e
  deixa de ser uma operação vazia.
- Uma falha de attachment após um acquire bem-sucedido não deixa workspace runtime nem attachment de Host
  sem owner lógico.
- Fechar um workspace com task em execução não interrompe a task imediatamente; o runtime é liberado após
  o terminal.
- Com o pool sem owners, entra em idle TTL de 60 segundos, com reuso dentro do TTL e liberação determinística
  após o TTL.
- Fechamento real de janela, saída do App e instalação de atualização entram imediatamente em shutdown
  limitado, em qualquer estado de TTL ou draining, sem esperar 60 segundos.
- Minimizar, ocultar na bandeja e reload do renderer não liberam por engano Hosts/runtimes ainda válidos.
- Conexões concorrentes no mesmo pool executam detect/deploy/server start apenas uma vez; a primeira
  instalação/upgrade não tem competição de staging path.
- O acquire/release do deploy lock e as requisições HTTP de manifest têm deadlines independentes; nenhuma
  fronteira externa meio aberta segura o lock indefinidamente.
- A identidade de conteúdo dos recursos do GLM é decidida pelo SHA do manifest fixado, e um artefato
  republicado na mesma versão é atualizado corretamente.
- O WSL de desktop mantém `desktop-continuous` sem `relay_bridge`; o celular mantém o attachment de shared
  host `web-remote-replayable`.
- O Docker continua dedicado, mas permanece coberto pela barreira de shutdown de nível de app.
- A verificação real em Windows + WSL com 1/3/5 workspaces deixa evidências de PID, RSS, duração e tempo
  de liberação.
- Nenhum terminate de distro é executado e processos de usuário WSL que não são do ZCode não são afetados.
- Os testes relacionados, `pnpm typecheck` e `pnpm lint` passam integralmente.