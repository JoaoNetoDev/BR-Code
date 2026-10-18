# Especificação da refatoração R1 para um único processo Host por janela

## 1. Status e escopo

- Status: em implementação
- Fase: refatoração da arquitetura remota R1
- Forma de lançamento: troca atômica em versão única, sem manter as duas arquiteturas (antiga e nova)
- Objetivo central: cada `BrowserWindow` tem apenas um Local Host com escopo de janela, e esse Host hospeda de forma unificada os serviços locais, as conexões remotas, a projeção de tarefas de nível de janela e os diversos attachments de cliente
- Exclusões explícitas: Server CLI independente, `sourceServerId`, Connection Profile, Transport Adapter, novo contrato wire remoto, capacidade Grouped remota — cada uma tratada em R2/R3/R4

Este documento é a especificação de implementação da R1. Os fatos atuais sobre controle remoto Web continuam valendo conforme os documentos de arquitetura, sincronização em tempo real e fila de comandos de tarefa em `docs/web-remote-control/`; esses documentos de fatos serão atualizados quando esta especificação for concluída.

## 2. Decisões

| Decisão                        | Conclusão da R1                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Fronteira de agregação do Host | O Host detém workspace/task membership, fatos de online/em execução/aguardando e a rota de escrita das listas; o Renderer detém apenas preferências de exibição |
| Fronteira de processo          | Um único Local Host por janela; UI, celular e Bot não criam mais Remote Hosts independentes                                     |
| Topologia de portas            | O mesmo Local Host expõe simultaneamente a base port e múltiplas remote-scoped ports                                           |
| Entrada de conexão             | Mantém `IPlatformService -> Main`; o Main apenas faz forwarding fino de requisições, eventos de estado e MessagePort                     |
| Fusão de Remote Hosts         | Fusão de todos os Desktop Remote Hosts criados por UI, celular e Bot                                                          |
| Persistência da projeção       | `ControllerProjection` fica somente em memória e pode ser reconstruída a partir da source; nenhum banco de dados é adicionado     |
| Protocolo remoto               | Não altera os service channels zcode-server existentes de SSH/WSL/Docker/Server                                                 |
| Rota de escrita de listas     | Operações de listas entre workspaces são roteadas pelo Controller; ao entrar em workspace/conversation, continua-se usando o scoped facade |
| Identidade de Host realtime    | Um `hostId` por janela, com roteamento interno por `workspaceKey + taskId`                                                       |
| `remoteSessionId`              | Atribuído e gerenciado pelo Local Host; o Main apenas guarda a correlação assíncrona da requisição                             |
| Lista em desconexão            | Mantém a última projeção de tarefa confiável marcada como offline; proíbe escrita e fallback local; após reconexão, substitui atomicamente |
| Lançamento e rollback          | Canary no Desktop; o rollback volta à versão antiga do Desktop, sem migração de banco de dados ou de protocolo remoto                |

Invariantes já existentes:

- Os ciclos de vida do cache de janela SSH online, da proteção de TTL/task do WSL e da sessão dedicada de Docker/Server permanecem inalterados;
  somente quando o último waiter pendente do SSH cancela ativamente, é permitido aposentar uma entry em connecting que ainda não está ready e abortar sua inicialização exclusiva.
- O isolamento de identidade usa uniformemente `workspaceKey = workspaceIdentity?.trim() || workspacePath`; a IO de caminho continua usando `workspacePath`.
- As fronteiras de fila, seq, gap e recuperação do `continuous` do Desktop e do `replayable` do Web móvel permanecem isoladas entre si.
- Main e relay não detêm estado de negócio como session/task, stream, queue ou snapshot.
- Um passive task-list observer não pode iniciar nem reconectar o runtime remoto.
- Grouped cobre apenas o workspace local; a R1 não adiciona tarefas remotas ao group local.

## 3. Modelo de processos e responsabilidades

Antes da mudança:

```text
Renderer ─┬─ base port ────> Local Host ─────────> Local CLI
          ├─ remote port ──> SSH Remote Host ────> zcode-server
          ├─ remote port ──> WSL Remote Host ────> zcode-server
          └─ remote port ──> Docker/Server Host ─> remote service

Mobile -> relay/Main -> Local Host 或独立 Remote Host
Bot ---------------------> 临时 Remote Host
```

R1:

```text
Renderer ───────────────────┐
Mobile -> relay/Main ───────┼─> WindowHostRuntime（每窗口唯一 Local Host PID）
Bot/后台入口 ────────────────┘       │
                                    ├─ LocalSource -> Local CLI
                                    ├─ RemoteConnectionRegistry
                                    │    ├─ SSH pooled connection
                                    │    ├─ WSL pooled connection
                                    │    └─ Docker/Server logical connection
                                    ├─ ControllerProjection
                                    └─ AttachmentRegistry
                                         ├─ desktop-continuous
                                         └─ web-remote-replayable
```

O Main continua responsável pela criação/destruição da janela e do processo Host, pelas APIs nativas, pelo estabelecimento do MessageChannel e pelo forwarding de mensagens, mas não possui mais o pool de conexões remotas, a logical session, a projeção de tarefas ou o estado de tarefas em execução. O fechamento da janela e a saída do App aguardam apenas o único Local Host; os recursos remotos são liberados pelo Host dentro de um tempo limitado.

## 4. Hierarquia de estado do Host

```text
WindowHostRuntime
├─ LocalSource
├─ RemoteConnectionRegistry
│  ├─ ConnectionEntry
│  │  ├─ 脱敏 target
│  │  ├─ connection / service collection
│  │  ├─ readiness / lifecycle / generation
│  │  └─ logical remote sessions
│  └─ workspaceKey -> connection / session route
├─ ControllerProjection
│  ├─ workspace / connection facts
│  ├─ task-index membership / metadata
│  ├─ sessions-index live overlay
│  └─ offline snapshot retention
└─ AttachmentRegistry
   ├─ attachmentId
   ├─ trusted clientMode
   ├─ local / remote scope
   └─ 独立 subscription / seq / backpressure / dispose
```

Estados de conexão:

```text
absent -> connecting -> online -> closing -> absent
                |          |
                v          v
             failed     disconnected
                              |
                              v
                         reconnecting
```

`reconnecting` representa apenas a recuperação de histórico existente ou um reconexão explícito do usuário; a R1 não adiciona política de retentativa automática em background. Cancelamento de conexão, late completion e dispose duplicado precisam ser idempotentes; resultados assíncronos de uma generation antiga não podem sobrescrever a nova conexão.

O cancelamento pendente de SSH usa as seguintes fronteiras fixas:

```text
SSH connecting entry
        |
        +-- 仍有其他 waiter ------> 保留 entry / backend，不中断共享连接
        |
        +-- 最后 waiter 取消 ------> 按对象身份退休 entry -> abort 独占 backend/deploy
                                              |
                                              +-> 同 target 新请求创建新 entry / 使用新凭据

WSL / Docker / Server pending cancel --------> 保持既有 transport 生命周期，不触发底层 abort
SSH online cache cancel ----------------------> 保持 window cache，不销毁在线连接
```

Durante o cancelamento, pode já existir um staging de owner remoto SSH criado. Uma vez que o backend antigo entra no dispose barrier, ele não pode se reconectar para o cleanup; o próximo uso de uma nova implantação SSH executa, antes da escrita, um janitor best-effort que remove apenas itens com nomenclatura de staging UUID do próprio ZCode e com mais de 24 horas. O owner atual, os caminhos oficiais e o staging de WSL/Docker/Server estão fora da fronteira de limpeza desta rodada.

Na desconexão remota:

```text
online snapshot
      |
      v disconnect
offline frozen snapshot --x mutation / local fallback
      |
      v reconnect + source snapshot
atomic replacement -> online snapshot
```

- A logical session mantém a última projeção de tarefa confiável, marcada com `sourceAvailability=offline`.
- conversation/file/git/terminal e todas as operações de escrita falham imediatamente, sem fallback para serviços locais.
- A projeção em memória é limpa quando o usuário fecha a tab/histórico correspondente.
- O restart do App não restaura esse snapshot em memória; continua valendo a semântica já existente de o histórico remoto aguardar o reconexão do usuário.

## 5. Protocolo de controle entre Main e Host

As mensagens de controle usam schema estrito em runtime; todas as requisições assíncronas carregam `requestId`:

- `ConnectRemoteWorkspace`
- `CancelRemoteWorkspaceConnect`
- `BindRemoteWorkspaceContext`
- `DisposeRemoteWorkspaceSession`
- `AttachServicePort`
- `RemoteWorkspaceConnectionLog`
- `RemoteWorkspaceConnected`
- `RemoteWorkspaceConnectFailed`
- `RemoteWorkspaceClosed`

O Local Host atribui o `remoteSessionId` durante o fluxo de conexão e devolve o descriptor. O Main correlaciona o chamador apenas por `windowId + requestId` e encaminha os eventos de conclusão/falha/fechamento; ele não usa `remoteSessionId` para criar pool de conexões nem ciclo de vida de negócio.

O progresso da conexão remota é reportado pelo Local Host de forma estruturada via `RemoteWorkspaceConnectionLog`, contendo no mínimo `requestId`, `level` e `message`. O Main apenas encaminha o log para o renderer correspondente a esse `windowId + requestId`; não pode mais deduzir a atribuição pelo label do processo Host nem por stdout sem contexto de requisição. Assim, quando o Host de uma janela conecta a vários alvos remotos de forma concorrente, os logs não se misturam em outros diálogos de conexão.

Escopo do attachment:

```ts
type WindowHostAttachmentScope =
  | { kind: "local" }
  | {
      kind: "remote";
      remoteSessionId: string;
      workspacePath: string;
      workspaceIdentity: string;
    };
```

O Host precisa validar no scope a session, a identity, o path e a generation atual do registry. Falha de forma fechada (fail-closed) quando o scope remoto não tem identity, quando referencia uma generation já liberada/antiga ou quando cruza logical sessions.

Ao concluir a R1, remover o protocolo de inicialização antigo e suas responsabilidades:

- `InitRemote`
- `InitRemoteWorkspace`
- `InitRemoteSshHost`
- `InitRemoteWslHost`
- acquire/release de WSL conduzido pelo Main
- mapa de processos Remote Host, pool e barrier de shutdown independente

## 6. Scoped attachment e modos de cliente confiáveis

```text
Desktop renderer port
  attachment context = desktop-continuous
       |
       +--> local scope ou remote scope --> scoped facade

Mobile relay port
  attachment context = web-remote-replayable
       |
       +--> local scope ou remote scope --> scoped facade
```

- O `clientMode`/`deliveryKind` presente no payload do chamador é sempre removido; o Host o injeta conforme o contexto de attachment confiável.
- Cada port mantém assinatura, seq, backpressure e dispose independentes; um consumo lento no celular não pode bloquear o链路 realtime do desktop.
- A desconexão de um attachment libera apenas o próprio attachment; enquanto houver tab de workspace, owner no celular, Bot ou outro attachment em uso, a conexão não pode ser destruída.
- Um reload do Renderer apenas reconstrói o attachment, reutilizando o mesmo Local Host, registry e logical sessions.
- `remoteSessionId` é usado apenas para roteamento de source dentro da janela e não substitui `workspaceIdentity`.

Quando um diretório remoto passa do diretório raiz da conexão para o workspace canônico, o attachment desktop precisa passar por uma troca em duas fases:

```text
旧 attachment A（renderer 已注册）
        |
        v
Host 绑定 canonical context，按新 generation 失效 A
        |
        v
Main 创建候选 attachment B，并把 port 投递给 renderer
        |
        v
renderer 注册 B 的 services，并回传 attachment-ready(B)
        |
        v
Main 提升 B 为当前 renderer attachment
        |
        v
BindRemoteWorkspaceContext IPC 返回；调用方重新读取 B 的 services
```

- A semântica de conclusão visível ao renderer de `BindRemoteWorkspaceContext` não é "o Main entregou o port", e sim "o renderer registrou o novo port".
- A troca de generation do Host continua fail-closed e permite uma janela de indisponibilidade limitada entre A e B; o chamador não pode continuar emitindo RPC para A antes de o bind retornar.
- Se a entrega de B falhar, o ready estourar o tempo ou chegar um ACK vencido, B não pode ser promovido a attachment atual; o fluxo de falha recicla o B candidato e quem chamou (conexão, bind ou reload) libera ou retenta a logical session conforme a política já existente.
- Depois do ready, o chamador não pode continuar usando os services de A capturados antes do bind; precisa reler B do renderer session store usando o mesmo `remoteSessionId`.
- A troca de attachment muda apenas a port `desktop-continuous` do desktop; não cria novo Host, nova conexão remota ou novo Agent, e não toca nos attachments `web-remote-replayable` do celular/Bot.

## 7. Protocolo de projeção do Controller

Topics de nível de janela na V4:

- `controller/workspaces`
- `controller/tasks-index`

Ambos os topics oferecem `subscribe` / `unsubscribe`, `snapshot` / `delta`, `seq + logEpoch` e resync após detecção de gap.

```text
task-index（membership 左表）
             |
             +-- sessions-index live overlay
             |
             +-- source availability
             v
        controller task row
```

`ControllerProjection` guarda apenas fatos de workspace/conexão, membership/meta de tarefas, live overlay e resumo offline; não guarda linhas de conversation, stream, payload de permissão, payload de tool ou runtime snapshot.

O Host Controller mantém, para cada source, uma assinatura passiva de `sessions-index` com `runtimePolicy: existing-only`, mesclando na membership do task-index os resumos em memória de title, phase, pending-interaction e activity; o estado live não é escrito de volta no SQLite, evitando estados pseudo-running após a saída do processo.
A assinatura apenas observa runtimes já existentes e não pode, por abrir a lista, iniciar um Agent local, criar um runtime remoto ou disparar um reconexão remoto.
Quando o runtime fica indisponível ou é trocado, o live overlay daquele source é limpo e, ao receber um novo snapshot, é substituído atomicamente.

O Renderer mantém uma única assinatura compartilhada de nível de janela para cada um de `controller/workspaces` e `controller/tasks-index`.
Requisições `listTaskList` com a mesma revision de projeção e os mesmos parâmetros de consulta precisam ser single-flight e reutilizar o resultado; é proibido que cada ponto de chamada de `useGlobalTaskList` assine por conta própria e repita uma leitura completa no mesmo frame.

A granularidade de invalidação da assinatura compartilhada precisa recair sobre a query, e não limpar todo o cache de listas quando qualquer frame arbitrário do Controller chegar:

- Um snapshot, resync de gap ou delta com row antiga não reconhecível de `controller/tasks-index` pode invalidar conservadoramente o scope relacionado;
- Upsert/remove de row antigo/novo conhecido invalida apenas o workspace scope atingido, e apenas as queries cujo `kind` intersecta o membership antes e depois da mudança; por exemplo, mudanças de live/activity de uma task de timeline não podem forçar refresh de pinned/archived;
- `controller/workspaces` mantém apenas facts/cursor de workspace e não invalida diretamente nenhuma lista de tarefas. O impacto de source indo/voltando online, remoção e reconexão nas rows visíveis da lista precisa ser publicado junto como delta de `controller/tasks-index`;
- O refresh manual e a versão legada de task-list do período de compatibilidade ainda podem forçar o bypass do cache de query;
- Deltas relacionados chegando consecutivamente dentro do mesmo ciclo de agendamento do renderer podem ser mesclados de forma limitada, mas não se pode atrasar com debounce ilimitado o estado de lista continuous do desktop.

```text
controller/tasks-index delta
          |
          v
  命中 workspace scope? -- 否 --> 保留该 query cache
          |
         是
          v
     已知旧 row? -- 否 --> 保守失效该 scope 的全部 kind
          |
         是
          v
旧 membership kind ∪ 新 membership kind
          |
          v
只失效相交的 query cache --> 同一调度周期合并一次 renderer revision
```

Endereço de tarefa:

```ts
interface WindowHostTaskAddress {
  remoteSessionId?: string;
  workspacePath: string;
  workspaceIdentity?: string;
  taskId: string;
}
```

Escopo de leitura:

- Timeline, Pinned, Archived, Active e Search agregam o scope local atual e os scopes remotos conectados/temporariamente offline.
- O Search só envia consultas a sources online; um source offline só pode exibir resumos já existentes, sem fabricar novos resultados de busca.
- Grouped continua usando a membership/order do índice local de tarefas, consumindo apenas os fatos locais de tarefa fornecidos pelo Controller.
- Conexões WSL continuam sendo reutilizadas dentro da janela por distro/usuário; fechar uma logical session libera apenas o runtime do workspace correspondente.
  Havendo tarefas em execução, o release é adiado até a contagem zerar; uma reabertura rápida invalida, pelo workspace generation, um release antigo que ainda não começou, e um novo attachment espera dentro do Host enquanto um release em trânsito não conclui.

As operações de escrita da origem das listas são executadas pelo Controller depois de resolver uma única source: pin/unpin, archive/unarchive, delete/restore, mark read/unread, membership/order do grouped local e abrir/restaurar tarefas a partir da lista. Offline, identity divergente ou endereço não único resultam em falha explícita, sem tentar fallback local.

Operações de lista entre workspaces não podem reutilizar o ambient scoped facade capturado no momento da renderização do componente de origem. Quando o alvo é o workspace local, a operação parte do attachment base da janela e o Controller resolve a única source local; quando o alvo é um workspace remoto, é obrigatório usar o attachment do `remoteSessionId` exato da tab de destino. Quando o remote alvo está desconectado, a operação falha e reverte o estado otimista; é proibido fazer fallback para base/local ou para outro attachment remoto pelo mesmo `workspacePath`.

```text
Renderer（可能仍捕获旧 remote ambient facade）
          |
          v
先激活目标 tab，读取 workspaceIdentity + remoteSessionId
          |
          +-- local target  --> window base attachment --> Controller 唯一 local source
          |
          +-- remote target --> exact remoteSessionId attachment --> 对应 remote source
                                  |
                                  +-- session 已断开 --> 回滚，不 fallback
```

Depois de entrar em workspace/conversation, arquivos, Git, terminal e Agent/session continuam sendo acessados pelo scoped facade já validado, sem expansão para roteamento explícito pelo Controller.

## 8. Fronteiras de realtime

- Um WindowHostRuntime registra apenas um `hostId` de realtime.
- owner/lease/stale-run/session route continuam isolados por `workspaceKey + taskId`; não é possível remover a verificação de owner só porque houve a fusão do shared-host.
- O Desktop mantém direct continuous; não concatena mensagens de recuperação de estado replayable.
- O Web móvel precisa passar pela fronteira de recuperação replayable de gap/snapshot, e não pode consumir o continuous do desktop pulando a recuperação.
- Bridge, snapshot, queue, owner command, cache e chaves de dedup do workspace remoto precisam carregar `workspaceIdentity` e `remoteSessionId`.
- Entradas de busy/running já submetidas pelo desktop e pelo celular entram unificadas na `CommandInbox` do CLI/runtime; a ordem FIFO segue a ordem de admissão serial do CLI.
  O Renderer mantém apenas rascunhos não submetidos e pending optimistic overlay, e o owner/lease do Host cuida apenas do roteamento, sem guardar uma segunda fila de entradas aceitas.

## 9. Camada de compatibilidade de RPC remoto

A R1 encapsula os service channels remotos existentes em tipos via `LegacyRemoteWorkspaceRpcContract` e valida a integridade dos channels, sem adicionar handshake, negociação de versão, exigência de implantação remota ou campos persistidos.

- file, Git, terminal e Agent/session são fornecidos pela autoridade remota.
- Os app-global services do Desktop são fornecidos pela autoridade local.
- A semântica de ciclo de vida do cache de janela SSH, da proteção de TTL/running-task do WSL e da logical session dedicada de Docker/Server permanece inalterada;
  o cancelamento do último waiter em um connect pendente de SSH é a única nova fronteira de abort de baixo nível.

## 10. Fatias de implementação

1. Especificação, feature graph, catálogo de casos de conversation e matriz de cobertura primeiro, coletando as baselines de PID, reutilização de conexão, reload, attachment móvel e task-list.
2. Escrever primeiro os testes de contrato do protocolo de controle, do registry, do scoped attachment, da projeção e de desconexão/recuperação.
3. Migrar a conexão remota, a logical session e o ciclo de vida de generation para o WindowHostRuntime.
4. Convergir o Main para um forwarding fino de requisições, eventos e MessagePort.
5. Unificar base, remote, celular e Bot como scoped attachments do mesmo Host.
6. Agregar no Host os fatos de tarefa e a rota de escrita de listas; o Renderer passa a ser consumidor da projeção de janela.
7. Remover a arquitetura antiga de Remote Host e completar logs, documentos de fatos, todos os gates e o E2E das cadeias representativas.

## 11. Casos aceitos e podas

Os casos aceitos estão registrados no grupo R1H de `docs/conversation-session-case-catalog.md`, e a matriz de cobertura está registrada em `docs/testing/conversation-session-e2e-coverage-matrix.md`.

Podas de E2E já confirmadas: o SSH cobre a cadeia representativa completa; janela dupla e reload do Renderer são cobertos separadamente; diferenças de transport de WSL, Docker e Server são cobertas principalmente por testes de contrato/integração, com smoke de plataforma. A reutilização por attachment móvel e por Bot precisa cobrir a asserção de que "nenhum Host/Agent extra é criado". Grouped só verifica que a semântica local-only não se expandiu.

Ordem dos gates: testes direcionados, `pnpm test:unit`, auditoria de cobertura de conversation, typecheck do Desktop E2E, `pnpm typecheck`, `pnpm lint`, E2E representativo no Electron, E2E de conversation em container, smoke de plataforma e a comparação de PID/contagem de conexões/task list/rotina/resíduo de saída antes e depois da mudança.

## 12. Observabilidade e saída

- O Process Monitor e os logs de ciclo de vida mostram o PID do Host da janela, a quantidade de connections, logical sessions e attachments.
- Início/fechamento de processos, sessions, conexões e portas usam `info` de produção; exceções recuperáveis usam `warn`; erros irrecuperáveis de handshake/processo usam `error`.
- V4 frame, stream delta, tool update e informações item a item do mesmo volume do fluxo de mensagens só podem usar `debug`.
- O fechamento da janela/saída do App precisa liberar conexões, portas e Agents de forma limitada; a falha ou o fechamento de uma remote connection não pode afetar a local nem outras remotas.