# Visão geral do controle remoto Web e arquitetura do Relay externo

Este documento descreve a implementação vigente. O relay dentro do repositório, o control socket de janela, o bridge token e a HTTP bootstrap API antigos foram removidos e não servem mais como caminho de compatibilidade.

## Visão geral do produto

O controle remoto Web pelo celular permite ao usuário acessar, no navegador, o workspace e a tarefa que já estão abertos na janela de desktop alvo. O aplicativo desktop hospeda o serviço real e o runtime do Agent; o celular entra, por meio de um relay externo, no workspace scope do mesmo Host; a página do celular não inicia um Host nem um Agent independentes — o relay cuida apenas de autenticação, pareamento, heartbeat e repasse de mensagens.

### Fluxo de uso e páginas

1. No desktop, abra a caixa de diálogo do controle remoto Web, inicie o controle e obtenha o QR code ou o link de conexão; o navegador do celular abre o link e conclui o pareamento.
2. Em tela estreita, o primeiro acesso pelo QR code entra por padrão na página inicial de tarefas: a página inicial e o desktop compartilham a barra lateral de projetos, e é possível navegar pelas tarefas por projeto ou em uma linha do tempo entre projetos;
   na conexão Relay V2, o topo da barra lateral (acima de 「Nova tarefa」) exibe a linha do computador atual, e clicar na linha inteira equivale a 「Trocar dispositivo」. A tarefa inicial carregada no QR code serve para seleção e posicionamento, e não leva direto para a página de chat.
3. Clicar em uma tarefa abre o chat; o ponto de entrada de nova tarefa de um projeto ou global leva à página de rascunho correspondente. Operações entre workspaces trocam primeiro o bridge e depois acessam o serviço do workspace de destino. Voltar ao início preserva o estado de seleção das tarefas; a página de chat, ao ser recarregada, pode restaurar a si mesma com base no history state do navegador.
4. O workspace e a tarefa selecionados no celular são independentes da seleção do desktop e não fazem o desktop trocar de tab/task.
5. Quando a rede se recupera ou a página volta ao primeiro plano, a conexão é restaurada e o estado das tarefas é ressincronizado pelo protocolo replayable;
   um workspace remoto desconectado pode acionar, pela página inicial, o fluxo de reconexão já existente no desktop, e nenhuma de suas tarefas pode ser aberta ou criada antes de a conexão ser bem-sucedida.

Em tela estreita são usadas duas páginas (início e chat) com shell próprio, e o conteúdo do chat reaproveita os componentes de sessão V4 existentes. O controle remoto em tela larga usa layout de barra lateral, e a lista de tarefas também vem do índice entre workspaces sincronizado pelo desktop. O tema do celular usa a preferência local do navegador, independente do tema do desktop; sem preferência local, o padrão é `zai-dark`.

### Capacidades e limites

- É possível navegar pelos workspaces e tarefas que já existem na janela alvo, abrir conversas, enviar entradas, criar novas tarefas e lidar com pedidos de permissão e interação das conversas.
- Workspaces remotos reutilizam as conexões e os service scopes já existentes no desktop; a reconexão pela página inicial restaura workspaces existentes e não oferece, no celular,porta de entrada para criar conexões SSH/WSL/Docker ou para gerenciar os workspaces de outras janelas do desktop.
- A mesma task continua sendo executada pelo runtime owner já existente. O desktop usa `desktop-continuous` e o celular usa
  `web-remote-replayable`; a restauração no celular não altera a cadeia principal continuous do desktop.
- Os serviços e as capacidades de ferramentas no celular são limitados por attachment/capability e não recebem automaticamente todas as capacidades do desktop por reutilizar a UI do desktop.
  O limite de exposição do terminal está descrito abaixo em "Fronteira da chamada de inicialização e sua relação com o XSS do Office".

```text
手机浏览器（独立选中态、replayable）
  -> 外部 relay（透传）
  -> Desktop main（attachment 调度与 RPC 桥接）
  -> 目标窗口共享 Host 的 workspace scope -> 同一 task runtime owner
                          ^
桌面 renderer（continuous）─┘
```

### Navegação por tópico

| Conteúdo | Documento |
| --- | --- |
| Início, chat e nova tarefa no celular e estado das páginas | [Página inicial de tarefas no celular](./mobile-task-home-design.md) |
| Linha do tempo e ordenação de tarefas no mobile | [Linha do tempo de tarefas no mobile](../ui/web-remote-control-mobile-task-timeline.md) |
| Lista de tarefas, busca e arquivamento em tela larga | [Lista de tarefas em tela larga](./wide-screen-task-list.md) |
| Tema no celular e superfície do navegador | [Controle de tema](./mobile-theme-control.md) |
| Desconexão e reconexão do workspace remoto | [Reconexão de workspace](./mobile-remote-workspace-reconnect.md) |
| Sincronização em tempo real, snapshot e recuperação de gap | [Sincronização de tarefas em tempo real](./task-realtime-sync.md) |
| Admission de entrada, filas e roteamento de comandos entrepons | [Fila de comandos de tarefas](../web-remote-control-task-command-queue.md) |
| Publicação dos assets estáticos V4 | [Deploy V4](./remote-v4-static-deployment.md) |
| Entrada de login OAuth independente | [Web Remote Login](./web-remote-login.md) |

A partir daqui descreve-se a implementação técnica atual; o [plano mínimo funcional](./web-remote-control-minimal-plan.md) serve apenas como registro histórico, e seu relay dentro do repositório, seu mobile host dedicado e os antigos comandos de integração não se aplicam à cadeia atual.

## Entrada

Desktop e mobile web usam a entrada Relay V2 do endpoint origin atual; HTTPS corresponde a WSS, HTTP corresponde a WS:

```bash
production/default: wss://zcode.z.ai/api/v1/remote/ws2
test endpoint:       wss://zcode.z.ai/api/v1/remote/ws2
local/custom:        ws://localhost:3030/api/v1/remote/ws2
```

`ZCODE_WEB_REMOTE_CONTROL_RELAY_WS_URL` continua sendo a sobrescrita explícita de debug de maior prioridade do relay do desktop, e precisa apontar para a entrada V2. Sem sobrescrita, o endpoint localhost/custom também deriva o relay a partir da sua própria origin. A versão atual do desktop gera o QR code de `/remote/v4`; `ZCODE_WEB_REMOTE_CONTROL_URL` serve apenas para sobrescrita explícita de debug.

No desenvolvimento, é possível apontar a página do celular para o web local:

```bash
ZCODE_WEB_REMOTE_CONTROL_URL=http://localhost:5173/remote/v4 \
pnpm dev:web-remote-control
```

## Deploy estático

A página V2 do celular é publicada apenas pela pipeline de múltiplas versões do OSS, sem necessidade de variáveis de entrada. Na pipeline principal, rode manualmente `upload:remote:test`, `upload:remote:prod`, ou o job `:latest` correspondente; o ambiente, a seleção da versão de origem e as restrições de produção estão em [Deploy de múltiplas versões no OSS](./remote-v4-static-deployment.md#gitlab-ci-测试与生产-oss-多版本产物).

```text
commit/tag selecionado → constrói os recursos de /remote/v4/<version>/ pela versão do app
                       → prepare valida o ambiente e o manifesto → diretório de versão no OSS
                       → o gateway escolhe o index por app_version e os recursos estáticos por diretório
```

O roteamento de página é fixo em `/remote/v4`. As implantações Docker de versão única antigas em `/remote`, `/remote/v3` e `/remote/v4` estão congeladas na última imagem V1; o repositório removeu as entradas correspondentes de build, push e verificação, e as implantações antigas não podem ser sobrescritas. A cadeia de teste independente de `/remote/__test__` continua mantida; o modo de uso está no [documento de deploy estático](./remote-v4-static-deployment.md).

A seleção de versão do OSS, o isolamento de ambiente, as regras do latest, o roteamento do gateway e a verificação estão em [deploy de múltiplas versões](./remote-v4-static-deployment.md). Antes de publicar, é obrigatório concluir a [validação de dependências externas do Relay V2 e de aparelho real](./relay-v2-pairing.md#外部依赖与发布顺序07).

## Transporte

O device do desktop usa o [pareamento e a máquina de estados do Relay V2](./relay-v2-pairing.md#桌面-device-生命周期03): o main registra o dispositivo de forma preguiçosa com o JWT da conta atual, pede um token de uso único com role=device antes de cada conexão e então conecta em `/api/v1/remote/ws2?token&mid` do endpoint atual. Não é enviado `X-Device-ID`; o `auth_init` carrega apenas SID, meta e o client_ts em segundos.

O heartbeat do V2 é um `pair_status_query` de 4~6 segundos reamostrado a cada rodada (sem SID), com um watchdog de ACK de 15 segundos independente para detectar perda de conexão. Backoff exponencial em erro de rede/5xx; 401 interrompe e reporta auth-required; KICKED permite somente uma recuperação atrasada de 2~5 segundos em 60 segundos. O QR code é `/remote/v4?app_version=<ver>&sid=<sid>&mid=<mid>&name=<hostname>`, sem hash/t nem JWT/token. O terminal do celular também usa o token/auth_init do V2, e a camada compartilhada exporta apenas o contrato do relay V2.

O relay cuida apenas de autenticação, pareamento, heartbeat e repasse de `data.payload`, sem analisar os negócios internos de task, session, workspace ou rpc-frame. O main anexa o attachment do bridge do celular ao Window Host existente, conforme o workspaceKey, e os limites de owner e de recuperação do continuous do desktop e do replayable do celular permanecem inalterados.

## App Payload

`data.payload` usa `zcode_type` para distinguir as mensagens de negócio:

- `bootstrap-request` / `bootstrap-response`
- `workspace-list-request` / `workspace-list-response` / `workspace-list-updated`
- `workspace-bridge-open` / `workspace-bridge-ready` / `workspace-bridge-error`
- `platform-request` / `platform-response`
- `mobile-view-state-update`
- `rpc-frame` / `rpc-frame-ack` (somente transporte; o relay não faz parse)
- `app-error`

04D-3 fez desktop main e mobile web usarem simultaneamente o shared acknowledged adapter; o app parser global passou a aceitar oficialmente o
novo fragment/ACK estrito e removeu o branch legado de peça única. Uma mensagem raw do Channel não pode ser convertida em base64 uma única vez e colocada em um
único `rpc-frame`; ela precisa ser fatiada em fragmentos físicos com `messageSeq/fragmentIndex/fragmentCount/messageBytes/CRC32`; cada fragmento, junto com o JSON final
`{type:"data",payload,client_ts,server_ts}` não comprimido, não pode exceder 1 MiB. Uma única mensagem raw lógica tem limite de 16 MiB / 64 fragmentos, e o lado de recepção
apenas faz staging de uma mensagem e a entrega atomicamente uma única vez após a validação completa.
`rpc-frame-ack` é o ACK cumulativo do transporte raw, não um ACK de comando, e também não carrega fatos de negócio de conversation.

O estado de transporte do adapter de production é simétrico e escopado ao bridge: a TX mantém o lote de fragmentos imutáveis inteiro antes de enviar o primeiro fragmento e
mantém uma borda de fluxo de `1 MiB / 256 KiB` pelos bytes finais do JSON externo, com limite de replay de `8 MiB / 45s`; a RX só enfileira o ACK cumulativo após a montagem completa e a entrega
síncrona no Channel terem sucesso. ACK tem prioridade no flush.
Cada vez que a mesma bridge fica send-ready de novo, ela reproduz o lote não acumulado em ACK, incluindo o cenário `same-socket` em que o WebSocket local não foi
trocado, mas o heartbeat confirmou `matched` novamente; o peer remoto já pode ter trocado de geração, então a identidade do socket local não pode servir como prova de entrega.
A reprodução reutiliza o lote imutável original e não renova sua idade enfileirada; uma nova bridge, uma falha no terminal ou um dispose limpam o estado de
transporte antigo. O primeiro ACK enfileirado também está sujeito ao deadline de 45s, e ACKs cumulativos posteriores apenas substituem o valor sem renovar a idade.
Esses estados não contêm fatos de task/session/topic/command. O transporte desktop/web cria um único JSON externo final imutável para o payload, e o medidor do adapter e o envio
real compartilham o mesmo serializer/cache; a reprodução na mesma bridge reutiliza os mesmos bytes. Quadros e ACKs raw não entram no buffer comum de 50 app payloads do desktop main. As duas pontas aplicam um portão rígido de UTF-8 não comprimido `<=1 MiB` antes do `JSON.parse`, e o switch de compressão não afeta o admission; oversize permanente e indisponibilidade temporária são separados, e uma falha raw dispara apenas uma vez a hard bridge recovery. Através das pontas só trafega o
`bridge-degraded: rpc-transport-fault` genérico, e o reasonCode tipado específico fica no log seguro da ponta proprietária.

Além de `activeWorkspaceKey`, `activeTaskId` e `updatedAt`, `mobile-view-state-update` pode carregar
`deviceInfo`. Esse campo é coletado pelo navegador do celular e contém apenas informação controlada que o navegador obtém de forma estável: `platform/version/name`,
`userAgent`, idioma, `navigator.platform`, viewport, screen, timezone, online e o momento da coleta. O desktop main
apenas o guarda no runtime da janela atual e o expõe ao desktop por `getWebRemoteControlStatus()`; ele não participa da
workspace identity, da vinculação de session, de cache key nem da decisão de pareamento do relay.

Depois de receber `data.payload` do relay, desktop e mobile devem passar primeiro por `parseWebRemoteControlAppPayload()`. Um payload inválido registra apenas metadados seguros, nunca o JSON bruto.

`workspace-list-updated` só é usado para, depois que o desktop renderer já sincronizou um novo snapshot via `syncWebRemoteControlTasks` /
`syncWebRemoteControlWorkspaces`, enviar o mesmo `WebRemoteControlWorkspaceListResult` aos celulares conectados. Isso não altera as responsabilidades do relay e do
desktop main: o relay continua apenas repassando `data.payload`, e o desktop main continua apenas compondo e encaminhando o índice de workspaces/tasks já sincronizado pelo
renderer, sem manter estado de negócio de task, stream, queue ou snapshot do ZCode.

`bridge-degraded` não é uma app response comum que possa ser descartada. O Desktop main mantém, para a geração de bridge atual, um invalidation latch sem snapshot de negócio: ao trocar a sessão lógica de origem ou depois de um raw transport fault, ele libera imediatamente o attachment antigo do celular e reenvia a notificação quando o relay fica paired/send-ready de novo, até que um novo `workspace-bridge-ready` tenha sucesso e o latch seja limpo. Isso é apenas uma notificação confiável de nível de conexão, sem afundar fatos de task/session/queue/snapshot no main. Ao receber, o Mobile reconstrói com um novo `bridgeSessionId + bridgeGeneration + recoveryId`; depois da primeira falha de reconstrução, só é permitido continuar tentando com backoff limitado de 1s/2s/5s, mantendo o mesmo `recoveryId` no mesmo recovery flight e usando um novo bridge generation a cada tentativa. Qualquer sucesso zera o orçamento; com o orçamento esgotado, é preciso destruir antes o bridge protocol e o service registration antigos, e então entrar no estado terminal não ativo explícito `connection-recovery-timeout`, oferecendo uma retentativa de página inteira disparada pelo usuário. Não se pode continuar exibindo a bridge antiga degradada como active, nem usar estado de negócio no relay/main para mascarar a falha de recuperação.

## Desktop Main

`packages/desktop/src/main/webRemoteControlManager.ts` é responsável por:

1. conectar ao relay V2 pelo `WebRemoteControlDeviceTransport` independente; o handshake, a reconexão e o heartbeat estão em [ciclo de vida do desktop](./relay-v2-pairing.md#桌面-device-生命周期03)
2. o main chama as interfaces de registro/token diretamente com o fetch do Node; o `webRemoteControlRelayV2Device` guarda o `{deviceSid, userId, endpointOrigin}` não sensível, e o sid/passHash do V1 é limpo na primeira migração, sem gravar nova credential
3. casar o workspace por `workspaceKey = workspaceIdentity?.trim() || workspacePath`
4. criar um novo attachment de `MessagePort` para o mobile bridge atual
5. codificar as mensagens RPC do `MessagePortProtocol` do host em fragmentos `rpc-frame` limitados usando o shared acknowledged adapter, e consumir os ACKs cumulativos
6. não interpretar a semântica de negócio de task do ZCode, nem participar da lógica de sincronização de task stream, permission ou workspace task list

### Recuperação do estado de habilitação após reinício do aplicativo desktop

O desktop interpreta "se o controle remoto Web estava ligado da última vez" como a intenção do usuário: registra o último alvo após uma inicialização bem-sucedida e
apaga esse registro quando o usuário clica explicitamente em parar. A destruição de janela e o encerramento do app liberam o transport/attachment desta execução, e o reload do
renderer pode continuar reutilizando o runtime de nível de janela; nenhum desses eventos de ciclo de vida pode reescrever a intenção de habilitação como desligada.
Dessa forma, a recuperação funciona tanto após uma saída normal quanto após uma saída inesperada, sem reabrir o recurso na próxima inicialização caso o usuário tenha desligado explicitamente.
Mudanças de configuração como troca de endpoint podem pausar o runtime atual, mas igualmente não significam que o usuário desligou o controle remoto.

O alvo persistido guarda apenas `workspacePath`, `workspaceIdentity` opcional e `initialTaskId` opcional.
`remoteSessionId` pertence à identidade da conexão remota dentro deste processo e é proibido persistir entre reinícios do app. O novo processo precisa esperar o
renderer sincronizar para o main o contexto de workspace já restaurado da janela atual, casar o último alvo por
`workspaceKey = workspaceIdentity?.trim() || workspacePath` e iniciar o device relay usando o `remoteSessionId` do processo atual. Antes de iniciar, é preciso ainda ler um JWT de login válido. Sem JWT, o estado permanece `auth-required`, o alvo habilitado é preservado e, depois da notificação de login do renderer, as credenciais são relidas e a tentativa é repetida. O logout interrompe imediatamente todos os runtimes de remoto, sem limpar o alvo habilitado. Com o JWT pronto e o alvo ainda não restaurado em nenhuma janela, o estado permanece `idle` e não deve iniciar outro local host, session remota ou runtime de Agent para a recuperação automática.

```text
上次启动成功 ──> 保存 enabled target ──┐
                                         v
新 desktop main -> 等待窗口 workspace sync -> workspaceKey 匹配 -> 等待 JWT -> 启动 device relay
                                         |
                                         +-> 不匹配：保持 idle，继续等待后续窗口同步

登录通知 ──> 重读 JWT + 已同步 workspace ──> 重试恢复
登出通知 ──> abort 启动 / 停止 runtime ──> auth-required（保留 enabled target）
用户明确停止 ──> 清除 enabled target ──> 下次启动保持 idle
```

A recuperação automática reconstrói apenas o device relay do desktop. O celular continua entrando no shared host existente pelo attachment `web-remote-replayable`; o
renderer do desktop continua em `desktop-continuous`, e a semântica de snapshot/gap recovery do replayable não pode se espalhar para a cadeia principal do desktop.

O relay externo não fornece mais `bridgeToken` nem `wsUrl`. `WebRemoteControlExternalWorkspaceBridge` apenas descreve a identidade do workspace e o `bridgeSessionId`.

A página de controle remoto do celular não tem process host próprio nem inicia um runtime de Agent independente. Ao receber
`workspace-bridge-open`, o desktop main cria um novo attachment de `MessagePort` para o bridge do celular
e anexa esse attachment ao local/remote workspace scope do único Window Host da janela de desktop alvo.
O relay apenas repassa `rpc-frame`, sem interpretar a semântica de negócio de task, stream ou workspace do ZCode.

O desktop renderer e o Web remote control do celular se conectam ao mesmo host/service/runtime por meio de RPC clients diferentes. Cada attachment recebe do host um `connectionId` próprio e um `clientMode` confiável: janelas de desktop locais e SSH/WSL/Docker são `desktop-continuous`, e o `/remote` do celular é `web-remote-replayable`. O host mantém um owned-subscription registry por attachment; quadros de downlink só podem ser escritos no MessagePort que possui aquele `subscriptionId`, e é proibido fazer broadcast no workspace e deixar o celular descartar quadros do desktop.

As bordas high/low do raw adapter do celular sobem apenas pelo sideband do MessagePort do attachment proprietário; o control object
é consumido antes do parser do Channel e não se torna uma request/event RPC:

```text
mobile adapter high/low
  -> desktop main（无 topic/session state）
  -> owning host attachment only
  -> trusted connection scope（serial + dedupe）
  -> existing workspace CLI: v4/connection/flow
  -> pause/resume only mobile connection B

desktop connection A ───────────────────────────────> continues draining
```

main/relay não podem especificar um connectionId arbitrário; o host scope gera a rota workspace/connection a partir das owned subscriptions. O relay de host remoto aplica
namespace com prefixo de tamanho no id de downlink. Ao fechar a porta, `closed` é enviado em série antes do dispose das owned
subscriptions, e SAT/DRN/timers antigos não podem ressuscitar.

`zcode-server /ws` é fixo em replayable para todas as conexões comuns; o header antigo
`x-zcode-rpc-client-mode` é ignorado e não pode promover um navegador ou WebSocket comum a
continuous. O Node host de server-remote do desktop primeiro obtém, por `POST /api/rpc-host-capability` protegido pelo middleware de auth de servidor já existente, uma capability aleatória de curta duração e uso único, e depois conecta ao `/ws/host` dedicado levando essa capability em um header exclusivo de Node. Só depois do consumo bem-sucedido pelo servidor é criado o attachment de relay continuous confiável, e o
`connectionId` final continua sendo gerado pelo servidor conexão a conexão. Servidores abertos/sem token também mantêm a mesma
fronteira de "solicitar ticket explicitamente -> consumir uma vez"; sem ticket, com ticket inválido, expirado ou em replay, tudo é rejeitado.

```text
Desktop Node host
  │ POST /api/rpc-host-capability（沿用现有 auth）
  v
短期 capability ── 首次消费 ──> GET /ws/host ──> continuous trusted relay
       │                              │
       └─ 过期 / 重放：拒绝          └─ server 生成 connectionId

Browser / 任意普通 client
  └─ GET /ws（旧 mode header 被忽略）──────────> replayable terminal
```

Cada subscribe de attachment estabelece a ownership pendente antes de chamar a CLI. O CLI server escreve, com um outbox pós-resposta de escopo de request, de forma fixa na ordem `ACK response -> initial notification`; mesmo que as duas linhas cheguem na mesma leitura, um physical wire
que chegue cedo antes do ACK entra apenas no staging limitado, e o ACK vincula `subscriptionId`
antes de liberar, na ordem original, para o incremental assembler do único owner. A filtragem por ownership vem antes da montagem;
subId estrangeiro não ocupa memória. O limite de staging é de 1.024 wires / 32 MiB, e o overflow limpa o lote inteiro marcando explicitamente
`fault.subscription.initialFrameStagingOverflow`, sem nunca descartar um único fragmento. O fechamento do attachment, generation obsoleta ou o unsubscribe limpam staging e montagem. Já o unsubscribe é tratado pelo owned
registry, que gera a rota completa `{ topic, subscriptionId, connectionId }`, e a CLI só remove entradas de publisher com os três exatamente iguais, evitando remoções erradas do mesmo `subscriptionId` cru entre topics ou conexões.

Os quadros initial/online do publisher da CLI usam reserva não destrutiva: todas as physical
notifications avançam a marca d'água só depois de serem aceitas pelo transport atual; em caso de falha no meio, o mesmo
logical id/content é reenviado. O encoder de topic fatia segundo o limite conservador do NDJSON da CLI, do Channel binário e do outer mobile legado; a production mobile Channel message
passa depois pelo medidor/envelope final preciso e pela fragmentação do raw adapter, de modo que o JSON real do relay também não ultrapassa
1 MiB. Anexos passam ainda pela transação de negócio `begin -> <=512KiB decoded chunk -> commit/abort`;
Channel renderer->host e NDJSON host->CLI têm o envelope medido separadamente, e é proibido o fallback `attachment/put` de dados completos. relay/main continuam vendo apenas o
`rpc-frame` opaco, sem guardar staging de upload, checksum ou referência de artefato.
Cada subscription mantém ao mesmo tempo um `logicalFrameOrdinal` monotônico; o assembler de host/renderer o usa para
bloquear replay tardio e supersede inverso, e o tombstone de completed/fault/timeout só é removido no
unsubscribe/troca de geração.

Os metadados reais de task messages, assistant stream, tool call, permission, plan, runtime status e task list vêm todos do mesmo CLI/runtime. Estado ainda não submetido, como
composer draft e scroll/focus/panel, permanece local do renderer; assim que a entrada é submetida, venha ela do desktop ou do celular, ela entra direto no mesmo FIFO `CommandInbox`/runtime da
CLI. O V4 do celular não passa mais pela host runtime command queue de `enqueueTaskCommand`, e o desktop também não mantém uma fila aceita local do renderer; a UI apenas mantém um overlay otimista pendente e concilia por projection/`commands/query`.

O bridge de workspace remoto só pode ser anexado a um `remoteSessionId` que já exista na janela do desktop e não esteja fechado. O `remoteSessionId`
é atribuído pelo registry dentro do Window Host e continua sendo uma session lógica de nível de workspace; o main apenas mantém a correlação da requisição e encaminha o scope, e é o
Host que, no fim, valida o `workspacePath + workspaceIdentity` já vinculado à session antes de criar o attachment independente. O celular não pode criar novas remote sessions SSH / WSL /
Docker nem acessar o workspace B do mesmo Host se valendo da session A; o isolamento de identidade continua usando
`workspaceIdentity?.trim() || workspacePath`.

Depois que o desktop renderer determinar o path e a identity canônicos, na seleção de diretório remoto ou na reconexão, ele precisa vincular de volta, via
`BindRemoteWorkspaceSessionContext`, o mesmo conjunto `workspacePath + workspaceIdentity` à session lógica do main/Host. Se os valores usados por tab, pelo histórico remoto e pela lista de workspaces visível no celular divergirem do descritor do main, o bridge rejeitará com
`REMOTE_WORKSPACE_IDENTITY_MISMATCH` (na 3.12.0 a falta desse bind após criar uma nova conexão fazia o celular não conseguir se conectar a projetos remotos).

O recolhimento de processos continua sendo disparado pelo ciclo de vida do desktop: fechar uma janela de verdade, o app quit e a instalação de update fecham o attachment e então recolhem o Window Host correspondente ou todos eles; a
desconexão de bridge/relay do celular, o refresh da página e a reconexão replayable apenas liberam attachments de curta duração, e não podem destruir o
Window Host nem a remote connection ainda usada por outros owners. Essa fronteira não altera o roteamento `workspaceIdentity + remoteSessionId`
nem afunda o estado replayable no main.

## Task Message Streams

Desktop e celular se conectam ao mesmo service/runtime, mas o perfil de entrega é determinado pelo attachment confiável, e não por parâmetro de UI:

- O desktop (incluindo as janelas de desktop de workspace remoto) é fixo em `continuous`, mantendo o fluxo de dados em tempo real completo.
- O controle remoto Web do celular é fixo em `replayable`, usado para reconexão após queda, refresh da página, subscrição tardia e recuperação de gap.

replayable não é replay em nível de relay. O relay continua apenas repassando `rpc-frame`; connection-level
saturated/drained é passado pelo desktop main ao host/CLI pelo sideband do MessagePort proprietário. topic seq, buffer de assinantes,
montagem de fragmentos, gap/resync e snapshot são mantidos pela facade do host e pelos publisher/client da CLI, e
relay/main não detêm estado de negócio de conversation.

A ordem de recuperação do celular, após gap ou reconstrução do attachment, é:

1. reanexar o bridge, concluir o V4 `hello/clientHello` e obter um novo contexto de conexão confiável.
2. resubscrever automaticamente por topic ativo; com `{logEpoch, seq}` válido tentar resume, e caso contrário snapshot.
3. Depois da montagem completa por fragmentos, o snapshot substitui o estado inteiro; `toSeq <= localSeq` é descartado silenciosamente.
4. Um gap dispara `v4/conversation/resync` apenas uma vez; se o resume quebrar de novo, força snapshot.
5. Recuperar permission/elicitation, queue/guided row e o resumo de comandos pendentes a partir da projection; com ACK incerto, usar `commands/query` para conciliação.

Um reinício do CLI runtime muda o `logEpoch` e dispara snapshot. Uma entrada do processo anterior que já foi admitida mas não entrou no transcript retorna explicitamente `fault.command.inputDiscardedOnRestart` com `delivery` persistente; `queue/guide` do runtime antigo é liquidado silenciosamente, e apenas um `startNow` ou `unknown` que não entrou no transcript pede ao usuário que confirme o reenvio, sem replay automático. Quando a rede do celular cai, mas o runtime não foi trocado, a fila autoritativa continua sendo recuperada pelo snapshot replayable, sem depender do localStorage do renderer.

Eventos bloqueantes não podem ser filtrados como conteúdo comum owner-only. `permission_request`, `elicitation_request`, suas responses, o terminal e a invalidação de snapshot precisam ser visíveis aos clientes online da mesma task, ou pelo menos disparar alinhamento por snapshot.

## Web

`/remote/v4` é a entrada de login V2 e de conexão direta por QR code; o modo de callback vem antes do portão de login. Os aliases de desenvolvimento/build seguem a configuração de rotas, e todos usam o V2.

Fluxo de conexão do mobile web:

1. Reconhecer o callback de code/state e salvar o retorno do estado de login; caso contrário, passar pelo portão de login JWT e só então analisar `sid/mid/name/app_version`. Sem SID, ler a lista de dispositivos da conta atual; se o dispositivo mais recente ainda estiver online, conectar direto, caso contrário mostrar uma lista de dispositivos atualizável; depois de escolher um dispositivo online, reescrever a URL.
2. Pedir um token com role=terminal via `WebRemoteControlTerminalTransport`, conectar em `ws2?token&mid` e então enviar o `auth_init(device_sid)` do V2; 401 volta para o login, e AUTH_FAILED mostra a falha de titularidade da conta com a ação de trocar de conta.
3. Após o pareamento, enviar `bootstrap-request`; o v4 usa o `desktopAppVersion` opcional da resposta para validar a URL.
   Na primeira inconsistência, corrigir e navegar; se a página já foi acessada, manter a página e pedir confirmação antes de recarregar; em desktops antigos sem o campo, manter o comportamento original.
   Na reconexão/retorno ao primeiro plano, revalidar mesmo com o bridge saudável; os limites exatos estão em [sincronização de versão v4](./remote-v4-static-deployment.md#v4-url-与桌面实际版本同步).
4. Escolher o workspace inicial por `mobileViewState -> initialViewState -> first workspace`
5. Se o workspace remoto alvo ainda não tiver condições de bridge, renderizar o `Root` somente com home, preservando a lista de workspaces e a entrada de reconexão;
   nesse caso nenhum workspace bridge é criado e nenhuma operação de tarefa dependente de serviço de workspace é liberada. Sem workspaces opcionais, mostrar a página de erro.
   A lista de workspaces é lida pelo ProjectSidebar a partir de `listWorkspaces` e dos pushes quando não há projectService; o comportamento está em
   [projetos virtuais §6.0.3](../superpowers/specs/2026-09-09-virtual-project-design.md#603-手机项目新目录的-shared-host-admission).
   O serviço vazio do home-only segue o contrato de nomenclatura do `ProxyChannel`: `onXxx` é um Event que nunca dispara, `onDynamicXxx(arg)` retorna esse Event de forma síncrona,
   e os demais métodos não implementados explicitamente retornam `undefined` de forma assíncrona. Depois de montado, o `Root` home-only marca ready do mesmo jeito que o `Root` com bridge,
   e as mudanças de estado de pareamento posteriores apenas atualizam o banner, sem trocar por uma página de carregamento nem remontar o home.
   Quando a mesma sessão remota já aberta for desconectada depois, os services inválidos são desregistrados, o conteúdo somente leitura e o rascunho do `Root` atual são preservados, e o banner de desconexão é exibido; ver [reconexão de workspace](./mobile-remote-workspace-reconnect.md).
6. Quando o alvo puder estabelecer bridge, enviar `workspace-bridge-open` e usar `createAcknowledgedWebRemoteControlRelayProtocol()`
   para adaptar os app payloads `rpc-frame` / `rpc-frame-ack` a um `IMessagePassingProtocol`, mantendo fragmentação, ACK e recuperação de transporte.
7. Depois de `connectViaProtocol()`, renderizar o `Root`; em tela estreita o `WebRemoteControlMobileShell` gerencia as páginas de início/chat, e em
   tela larga usa a barra lateral do controle remoto. A seleção do workspace inicial e o ponto de chegada da página são dois estados distintos; não se pode confundir ter uma task selecionada com entrar automaticamente no chat.

O V1/HMAC do celular, a rota `/web-remote`, a página de espera já logada e o antigo HTTP bootstrap de `remoteControlToken` / `relayOrigin` foram removidos. O owner de autenticação e de conexão, a recuperação de erros e a ordem de eventos estão em [Relay V2](./relay-v2-pairing.md#手机首次进入与恢复05).

## Feature Exposure

O Desktop main atual usa `createWebRemoteControlFeatureGate()`, cujo padrão é `true` e que não desabilita
o controle remoto automaticamente por ambiente production/development. O ambiente de produção pode iniciar pelo ponto de entrada de controle remoto já existente e obter as informações de conexão;
não se pode mais tratar "build de produção" como garantia de que o IPC de inicialização é rejeitado ou de que o status oculta o QR code.

`WebRemoteControlFeatureGate` ainda mantém a capacidade de desabilitar explicitamente: ao injetar `false`, o manager rejeita a inicialização e o
status não retorna informações válidas de conexão do controle remoto. Esse gate é um interruptor de funcionalidade e não substitui a verificação de origem de chamada e a fronteira de ticket interno descritas abaixo.
A fiação atual está em `packages/desktop/src/main/index.ts`, e a implementação do interruptor está em
`packages/desktop/src/main/webRemoteControlFeatureGate.ts`.

## Fronteira da chamada de inicialização e sua relação com o XSS do Office

Abrir o `WebRemoteControlDialog` é o ponto de entrada já existente para o usuário entrar no controle remoto Web. Quando o alvo atual não tem runtime reutilizável, o
renderer envia o IPC de inicialização depois de passar pelo portão de login; o QR code não oferece mais a ação de atualizar o pareamento. O
Desktop main não sobrepõe uma confirmação nativa secundária.

```text
WebRemoteControlDialog open (signed in)
        │
        ▼
Desktop main: window/source check
        ▼
Manager: issue internal one-time ticket (short TTL)
        │
        ▼
Manager: consume ticket exactly once -> start relay
```

O manager continua gerando um ticket interno de curta duração e uso único, vinculado a `windowId + workspaceKey + remoteSessionId`, onde
`workspaceKey = workspaceIdentity?.trim() || workspacePath`;
o ticket não pode entrar em um protocolo compartilhado gravável pelo renderer nem ser escrito em logs, telemetria ou configurações comuns. Ele serve para restringir
a chamada e a consistência de alvo de `startAuthorized`, mas, como a mesma requisição IPC emite o
ticket imediatamente, ele não é autorização do usuário e não impede que um renderer já comprometido chame o IPC de inicialização.

O tipo de dependência do manager no handler IPC só pode expor `authorizeStart`, `startAuthorized`,
`notifyAuthStateChanged`, `stop` e `getStatus`. O `start` direto pertence apenas à implementação interna
do ciclo de vida do manager e não pode entrar na interface de dependências IPC alcançável pelo renderer; o IPC de atualização do pareamento foi removido. A notificação de autenticação contém apenas o estado, e o main relê as credenciais. O tipo de retorno público mantém o ramo de compatibilidade `cancelled`,
mas a cadeia atual de inicialização do Desktop não produz esse estado final.

Inicialização, fechamento de janela, parada pelo usuário e expiração do ticket precisam invalidar os tickets não consumidos. Restaurar
"habilitado da última vez" na inicialização do app continua sendo uma operação interna de ciclo de vida e não pode contornar a vinculação workspace/session.

A fronteira da causa raiz do XSS em documentos do Office é definida em `docs/ui/office-file-preview.md`: links não confiáveis precisam passar por uma allowlist de
protocolos, sanitização de DOM, interceptação de clique e abertura controlada de link externo. Remover a confirmação nativa do controle remoto não altera essas correções da causa raiz; o custo é que, se surgir um novo
XSS no renderer ou se essas fronteiras forem contornadas, o código de ataque pode chamar diretamente o IPC de inicialização do controle remoto de novo, e o ticket interno não fornece prova de presença do usuário.
Uma avaliação de segurança não pode tratar esse ticket como controle compensatório do XSS do Office.

`web-remote-replayable` não deve receber capacidade de terminal por padrão. Se o produto ainda precisar de terminal no celular, a exposição precisa passar por uma capability independente de
binding workspace/session/device, com TTL curto, owner/lease e recolhimento em caso de desconexão; não se pode tratar o genérico
`services.exposeOnChannelServer()` como autorização.

## Workspace Hook Trust Review

O Workspace Hook Trust não duplica estado de negócio no relay, no desktop main ou no renderer. Os attachments desktop continuous e mobile/Web
replayable compartilham o mesmo review registry do CLI Runtime:

```text
project Hook discovery
  -> CLI Runtime immutable snapshot
  -> Runtime review registry (唯一权威)
       ├─ continuous delta -> Desktop Settings
       └─ replayable snapshot/delta -> Mobile/Web Settings

Settings decision
  -> trusted connection facade
  -> sendConversationCommandV4
  -> CLI CommandInbox
  -> task/run/remoteSession/workspace/bundle/generation validation
  -> Trust mutation or fail-closed reason
```

Restrições:

- A capability de host `workspaceHookReview` e a capability de UI do cliente `workspaceHookReviewUi` precisam ser declaradas separadamente; a ausência equivale a false.
- O review request é projetado como `pendingInteractions[kind=workspaceHookReview]`; refresh no celular, gap/resync ou reconstrução de attachment apenas restauram a apresentação, sem liquidar a request do Runtime.
- O command target é vinculado a `taskId + runId + remoteSessionId? + workspaceIdentity + bundleDigest + reviewFlowId + generation + interactionId`; qualquer divergência é rejeitada antes da mutação do store.
- O registry de pending-command do renderer guarda apenas o digest de command sensível e o estado de ACK. Com ACK incerto é possível usar `commands/query`; não se deve persistir nem reexecutar automaticamente a decisão de Trust original.
- Um reinício do Runtime gera uma nova epoch de run; interactions antigas, Allow once e pending sensitive commands não podem ser reutilizados entre epochs.
- Com `workspaceHookTrustEnabled=false`, o Runtime não lê o Trust store nem cria review; o Protocol Host pode desligar esse campo na fronteira de trusted bootstrap para reverter ao hard block.
- Negação gerenciada sempre tem precedência sobre o Trust estabelecido por UI/CLI; relay/main apenas roteiam command opaco e projection, sem manter cópia de policy, Trust store ou lease.

### 2026-09 Navegação de diretórios de projetos virtuais

O home do celular reaproveita o ProjectSidebar e lê o conjunto de linhas de projetos do Host pela attachment base atual; o shell do celular possui apenas o home/chat e o estado de retorno do navegador. `workspace-bridge-open.project` é uma intenção estrita de projectId/hostId, encaminhada pelo main ao ProjectService da Window Host para preparar o diretório de execução. Ele permite criar ou reaproveitar o logical scope de diretório em uma Source física já online, e não permite criar implicitamente uma nova conexão física, um Host ou um Agent. Antes e depois da preparação, são verificados a geração de membro da conexão, a entrada do projeto e o objeto da conexão física; o main mantém apenas a promise RPC da navegação atual, e uma nova tentativa com a mesma bridge identity não realoca o diretório; cancelamento, fechamento da janela ou navegação posterior invalidam os resultados tardios.

Depois que o Host devolve o workspaceIdentity, o remoteSessionId e o cwd confiáveis, o bridge replayable do celular é estabelecido pelo mesmo shared-host attachment. Projeto, provider e a entrada inicial são passados apenas na handover do Root da Web, e o main não guarda rascunhos nem estado de negócio de tarefa. O continuous direto do desktop, a recuperação por snapshot/gap do celular, o owner/lease e a fila única do CLI CommandInbox permanecem inalterados.

O rascunho de projeto ainda não submetido no celular reaproveita a persistência de composer já existente no Renderer: o scope `__draft__` por workspaceKey guarda o projectId opcional, restaurado junto com o corpo e o modelo. A reconstrução do Root ou o reload da página restauram essa escolha antes do prewarm; um rascunho novo explicitamente não categorizado grava NULL, e a abertura de um histórico com taskId explícito tem prioridade. Depois de virar uma tarefa persistente, o projectId não é copiado para o session composer scope; a pertença de uma tarefa já submetida continua sendo exclusiva da biblioteca do app do Host. Nem o main, nem o relay, nem o shared-host transport mantêm esse rascunho.