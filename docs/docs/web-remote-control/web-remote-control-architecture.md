# Visão geral do controle remoto Web e arquitetura do Relay externo

Este documento descreve a implementação vigente. O relay dentro do repositório, o control socket de janela, o bridge token e a HTTP bootstrap API antigos foram removidos e não servem mais como caminho de compatibilidade.

## Visão geral do produto

O controle remoto Web pelo celular permite ao usuário acessar, no navegador, o workspace e a tarefa que já estão abertos na janela de desktop alvo. O aplicativo desktop hospeda o serviço real e o runtime do Agent; o celular entra, por meio de um relay externo, no workspace scope do mesmo Host; a página do celular não inicia um Host nem um Agent independentes — o relay cuida apenas de autenticação, pareamento, heartbeat e repasse de mensagens.

### Fluxo de uso e páginas

1. No desktop, abra a caixa de diálogo do controle remoto Web, inicie o controle e obtenha o QR code ou o link de conexão; o navegador do celular abre o link e conclui o pareamento.
2. Em tela estreita, o primeiro acesso pelo QR code entra por padrão na página inicial de tarefas, onde se pode navegar pelas tarefas agrupadas por workspace ou em uma linha do tempo entre workspaces.
   A tarefa inicial carregada no QR code serve para seleção e posicionamento, e não leva direto para a página de chat.
3. Clicar em uma tarefa abre o chat; o ponto de entrada de nova tarefa de um workspace leva à página de rascunho desse workspace. Operações entre workspaces trocam primeiro o bridge e depois acessam o serviço do workspace de destino. Voltar ao início preserva o estado de seleção das tarefas; a página de chat, ao ser recarregada, pode restaurar a si mesma com base no history state do navegador.
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

Desktop e mobile web só mudam para o relay de teste no endpoint de teste padrão; production e os demais endpoints customizados continuam usando o relay de produção:

```bash
production/default: wss://zcode.z.ai/ws
test endpoint:       wss://zcode.z.ai/ws
```

`ZCODE_WEB_REMOTE_CONTROL_RELAY_WS_URL` continua sendo a sobrescrita explícita de debug com maior prioridade. Sem sobrescrita, o relay de teste só é usado quando a origem do endpoint normalizada é `https://zcode.z.ai`; production e endpoints localhost/custom mantêm o relay de produção, evitando ampliar a semântica já existente dos endpoints customizados. A URL da página no QR code continua sendo derivada pela versão do App entre `/remote/v3` e `/remote/v4`; `ZCODE_WEB_REMOTE_CONTROL_URL` serve apenas para sobrescrita explícita de debug.

No desenvolvimento, é possível apontar a página do celular para o web local:

```bash
ZCODE_WEB_REMOTE_CONTROL_RELAY_WS_URL=wss://zcode.z.ai/ws \
ZCODE_WEB_REMOTE_CONTROL_URL=http://localhost:5173/remote \
pnpm dev:desktop
```

## Deploy estático

A página de controle remoto do celular é a SPA Vite de `packages/web`, não usa exportação estática do Next.js e não existe um arquivo de página como `remote.html`. O deploy de produção só precisa entregar `packages/web/dist` ao nginx e mapear o caminho de entrada de volta para `index.html`.

Atualmente são mantidas quatro cadeias de deploy estático:

```text
v2:
  -> pnpm run build:web-remote-control
  -> packages/web/dist
  -> Dockerfile.web-remote-control
  -> uhub.service.ucloud.cn/tianqi/zcode-remote-mobile-v2
  -> zcode/frontend/deployment-remote.yaml
  -> /remote

v3:
  -> pnpm run build:web-remote-control:v3
  -> packages/web/dist
  -> Dockerfile.web-remote-control-v3
  -> uhub.service.ucloud.cn/tianqi/zcode-remote-mobile-v3
  -> zcode/frontend/deployment-remote-v3.yaml
  -> /remote/v3

v4:
  -> pnpm run build:web-remote-control:v4
  -> packages/web/dist
  -> Dockerfile.web-remote-control-v4
  -> uhub.service.ucloud.cn/tianqi/zcode-remote-mobile-v4
  -> 外部基础设施的 zcode/frontend/deployment-remote-v4.yaml
  -> /remote/v4

test:
  -> pnpm run build:web-remote-control:test
  -> packages/web/dist
  -> Dockerfile.web-remote-control-test
  -> uhub.service.ucloud.cn/tianqi/zcode-remote-mobile-test
  -> zcode/frontend/deployment-remote-test.yaml
  -> /remote/__test__
```

Os deploysonline de test e production do v4 compartilham o mesmo Dockerfile e a mesma base de assets `/remote/v4`, mas ficam isolados por um Job Jenkins, uma imagem e um Deployment próprios. Os dois Jobs devem passar explicitamente `ZCODE_ENV=test` e `ZCODE_ENV=production`, respectivamente; o Dockerfile valida isso na etapa builder e entrega ao Vite para injetar o endpoint. O domínio em si não reescreve em tempo de execução no navegador o ambiente de produto que já foi compilado dentro do JS:

```text
test:       zcode.z.ai/remote/v4 -> wss://zcode.z.ai/ws
production: zcode.z.ai/remote/v4         -> wss://zcode.z.ai/ws
```

`/remote/__test__` continua sendo uma entrada independente de validação de assets estáticos e não substitui o ambiente de produto de teste padrão `/remote/v4`.

`/remote` é a entrada antiga de assets, e o script de publicação ainda atualiza `deployment-remote.yaml`.
`/remote/v3` é a entrada de assets das versões antigas do App, e o script de publicação atualiza apenas `deployment-remote-v3.yaml`.
`/remote/v4` é a entrada de assets do App a partir da versão oficial `3.4.0`, e o script de publicação atualiza apenas
`deployment-remote-v4.yaml`.
`/remote/__test__` é a entrada de assets de teste, e o script de publicação atualiza apenas `deployment-remote-test.yaml`.
As quatro cadeias usam Dockerfiles, configurações de nginx, nomes de imagem e arquivos de deployment k8s separados, evitando que a publicação de novos assets sobrescreva assets ainda usados por versões antigas do App.

As quatro configurações de nginx precisam mapear explicitamente `assets/`, `material-icons/` e
`pdfjs/cmaps/` da sua própria base de build para os artefatos correspondentes dentro de
`/usr/share/nginx/html`. Os CMaps do PDF.js ficam de fato em
`/usr/share/nginx/html/pdfjs/cmaps/`; requisições com os prefixos `/remote`, `/remote/v3`, `/remote/v4` ou
`/remote/__test__` não podem entrar no SPA fallback, caso contrário o nginx disfarça uma resposta 200 de `index.html` como se fosse sucesso de asset estático. O smoke de Docker precisa comparar o corpo de resposta real de um `.bcmap` representativo, e não apenas afirmar HTTP 200.

Verificação local:

```bash
pnpm run typecheck
pnpm run lint
pnpm run build:web-remote-control
bash scripts/test-web-remote-control-docker-build.sh
pnpm run build:web-remote-control:v3
bash scripts/test-web-remote-control-v3-docker-build.sh
pnpm run build:web-remote-control:v4
bash scripts/test-web-remote-control-v4-docker-build.sh
pnpm run build:web-remote-control:test
bash scripts/test-web-remote-control-test-docker-build.sh
```

Build e push:

```bash
export DOCKER_REGISTRY_PASSWORD='***'
bash scripts/docker-build-and-push-web-remote-control.sh --tag 202604291800
bash scripts/docker-build-and-push-web-remote-control-v3.sh --tag 202604291800
bash scripts/docker-build-and-push-web-remote-control-v4.sh --tag 202604291800
bash scripts/docker-build-and-push-web-remote-control-test.sh --tag 202604291800
```

`zcode/frontend/deployment-remote-v4.yaml` e `zcode/frontend/deployment-remote-test.yaml` são caminhos convencionais dentro do repositório de infraestrutura externa, não estão no repositório atual e não são criados por esta funcionalidade. Por padrão, os scripts de publicação usam `K8S_REPO_DIR=~/workspace/cgx-dev-k8s` para atualizar os arquivos de deployment correspondentes e criar um MR; se for passado `--skip-mr`, o script apenas constrói e envia a imagem, sem atualizar o repositório externo.

A URL padrão do QR code no desktop não aponta para `/remote/__test__`. Para validar os assets de teste, sobrescreva pela variável de ambiente:

```bash
ZCODE_WEB_REMOTE_CONTROL_URL=https://zcode.z.ai/remote/__test__ pnpm dev:desktop
```

O nginx cuida apenas dos assets estáticos e do SPA fallback; ele não faz proxy do relay. O lado do navegador conecta direto ao relay correspondente conforme o endpoint do build:
production usa `wss://zcode.z.ai/ws`, test usa `wss://zcode.z.ai/ws`. Quando o Desktop App oficial for maior ou igual a `3.4.0`, a URL do QR code usa
`https://zcode.z.ai/remote/v4?...`; versões abaixo de `3.4.0`, pré-`3.4.0` da própria `3.4.0` ou versões que não possam ser interpretadas continuam usando
`https://zcode.z.ai/remote/v3?...`. Pré-`3.4.0` acima desse patamar (por exemplo `3.5.0-beta.1`) usam v4; um valor de sobrescrita explícito em
`ZCODE_WEB_REMOTE_CONTROL_URL` não é reescrito pela lógica de versão.

Os quatro `Dockerfile.web-remote-control*` usam um builder Node para executar a instalação filtrada e o build Vite dentro do contêiner:
`pnpm install --frozen-lockfile --filter @zcode/web... --ignore-scripts`. A etapa de runtime mantém apenas
`nginx:alpine` e o `dist` estático, sem runtime Node. Os scripts de publicação não repetem o build no host, garantindo que os assets da imagem final venham somente do Docker builder.

## Transporte

O relay externo cuida apenas da camada de transporte:

1. o desktop conecta ao relay externo do endpoint atual com o papel `device`, podendo enviar `device_mid` via `X-Device-ID`
2. o mobile web conecta ao mesmo endpoint com o papel `terminal`, e o navegador envia a dica de roteamento pela query `mid=<device_mid>`
3. o relay conclui `device_register_init`, `auth_init`, `auth_challenge`, `auth_response`, `auth_ack`
4. as duas pontas fazem heartbeat com `pair_status_query` / `pair_status_ack`, com média de 10 segundos e jitter limitado entre 8 e 12 segundos; quando o último ACK não é atualizado há mais de 30 segundos, o watchdog local dispara a reconexão, e a reconexão disparada pelo watchdog acrescenta um pequeno atraso aleatório para evitar picos de reconexão
5. todas as mensagens de negócio do ZCode ficam em `data.payload`; o relay não faz parse do payload

A sincronização em tempo real das tasks também respeita essa fronteira: o relay apenas encaminha `rpc-frame` entre mobile e desktop main, sem fazer parse de task, session, workspace ou eventos realtime do ZCode. A página de controle remoto do celular não tem Host próprio nem inicia um runtime de Agent independente. Ao receber `workspace-bridge-open`, o desktop main cria um novo attachment de `MessagePort` para o bridge do celular e o anexa ao service/CLI scope correspondente ao workspaceKey local/remoto do único Window Host da janela de desktop alvo. O relay apenas repassa `rpc-frame`, sem interpretar a semântica de negócio de task, stream ou workspace do ZCode.

### Agendamento do heartbeat e recuperação de perda de conexão

O heartbeat pertence apenas ao estado local de transporte do desktop device transport e do mobile terminal transport; o relay não armazena nem difunde o agendamento dos clientes:

```text
auth_ack / matched
        │
        ▼
本地随机等待 8~12 秒
        │
        ▼
发送 pair_status_query ─────────────┐
        │                           │
        └─ 再随机等待 8~12 秒         │
                                    ▼
                         收到 pair_status_ack
                                    │
                         重置 30 秒 ACK watchdog
                                    │
                         30 秒无 ACK → 本地重连
```

O heartbeat usa `setTimeout` recursivo e reamostra a cada rodada, mantendo o ciclo médio em 10 segundos; não é permitido reenviar heartbeats históricos perdidos durante período em segundo plano ou de suspensão do sistema. Os 30 segundos são um deadline temporal de ACK, não uma contagem fixa para inferir falha; a reconexão disparada pelo watchdog acrescenta um pequeno atraso aleatório, enquanto caminhos de erro explícito, parada do usuário e retorno ao primeiro plano mantêm a semântica de recuperação imediata já existente. O payload de heartbeat e o schema do protocolo relay permanecem inalterados.

A identidade de pareamento é `device_sid`. A URL do QR é:

```text
/remote/v4?sid=<device_sid>&hash=<pass_hash>&t=<timestamp>&mid=<device_mid>&name=<device_name>&app_version=<app_version>
```

`hash` é material de chave HMAC e só aparece na URL do QR code e no armazenamento de credenciais; não é gravado em logs, no state do OAuth nem em setting.json.

## App Payload

`data.payload` usa `zcode_type` para distinguir as mensagens de negócio:

- `bootstrap-request` / `bootstrap-response`
- `workspace-list-request` / `workspace-list-response` / `workspace-list-updated`
- `workspace-bridge-open` / `workspace-bridge-ready` / `workspace-bridge-error`
- `platform-request` / `platform-response`
- `mobile-view-state-update`
- `rpc-frame` / `rpc-frame-ack`（somente transporte; o relay não faz parse）
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

## Desktop Main

`packages/desktop/src/main/webRemoteControlManager.ts` é responsável por:

1. conectar ao relay externo via `WebRemoteControlDeviceTransport`
2. guardar o `deviceSid` não sensível nos AppSettings e o `passHash` no credentialService, via `WebRemoteControlRelayAuthStorageProvider`
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
`workspaceKey = workspaceIdentity?.trim() || workspacePath` e iniciar o device relay usando o `remoteSessionId` do processo atual. Enquanto o alvo não tiver sido restaurado em nenhuma janela, o estado permanece `idle` e não deve iniciar outro local host, session remota ou runtime de Agent para a recuperação automática.

```text
上次启动成功 ──> 保存 enabled target ──┐
                                         v
新 desktop main -> 等待窗口 workspace sync -> workspaceKey 匹配 -> 启动 device relay
                                         |
                                         +-> 不匹配：保持 idle，继续等待后续窗口同步

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

`/remote`, `/remote/v3` e `/remote/v4` são entradas de conexão direta por QR code, processadas antes da lógica OAuth de `/web-remote`.

Fluxo de conexão do mobile web:

1. analisar `sid/hash/t/mid/name/app_version`
2. Autenticar como `terminal` via `WebRemoteControlTerminalTransport`
3. Após o pareamento, enviar `bootstrap-request`; o v4 usa o `desktopAppVersion` opcional da resposta para validar a URL.
   Na primeira inconsistência, corrigir e navegar; se a página já foi acessada, manter a página e pedir confirmação antes de recarregar; em desktops antigos sem o campo, manter o comportamento original.
   Na reconexão/retorno ao primeiro plano, revalidar mesmo com o bridge saudável; os limites exatos estão em [sincronização de versão v4](./remote-v4-static-deployment.md#v4-url-与桌面实际版本同步).
4. Escolher o workspace inicial por `mobileViewState -> initialViewState -> first workspace`
5. Se o workspace remoto alvo ainda não tiver condições de bridge, renderizar o `Root` somente com home, preservando a lista de workspaces e a entrada de reconexão;
   nesse caso nenhum workspace bridge é criado e nenhuma operação de tarefa dependente de serviço de workspace é liberada. Sem workspaces opcionais, mostrar a página de erro.
6. Quando o alvo puder estabelecer bridge, enviar `workspace-bridge-open` e usar `createAcknowledgedWebRemoteControlRelayProtocol()`
   para adaptar os app payloads `rpc-frame` / `rpc-frame-ack` a um `IMessagePassingProtocol`, mantendo fragmentação, ACK e recuperação de transporte.
7. Depois de `connectViaProtocol()`, renderizar o `Root`; em tela estreita o `WebRemoteControlMobileShell` gerencia as páginas de início/chat, e em
   tela larga usa a barra lateral do controle remoto. A seleção do workspace inicial e o ponto de chegada da página são dois estados distintos; não se pode confundir ter uma task selecionada com entrar automaticamente no chat.

`/web-remote` continua sendo a entrada do login OAuth ZAI e da página de espera; `remoteControlToken` / `relayOrigin` pertencem apenas ao comportamento antigo de `/web-remote` e não se aplicam às novas rotas por QR code `/remote`, `/remote/v3` ou `/remote/v4`.

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
renderer envia imediatamente o IPC de inicialização; o refresh do QR code continua usando o diálogo de confirmação já existente dentro do renderer. Para preservar a experiência de controle remoto já existente, o
Desktop main não sobrepõe mais uma confirmação nativa secundária para iniciar ou atualizar.

```text
WebRemoteControlDialog open / confirmed QR refresh
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
a chamada e a consistência de alvo de `startAuthorized` / `resetPairingAuthorized`, mas, como a mesma requisição IPC emite o
ticket imediatamente, ele não é autorização do usuário e não impede que um renderer já comprometido chame o IPC de inicialização.

O tipo de dependência do manager no handler IPC só pode expor `authorizeStart`, `startAuthorized`,
`resetPairingAuthorized`, `stop` e `getStatus`. `start` / `resetPairing` diretos pertencem apenas à implementação interna
do ciclo de vida do manager e não podem entrar na interface de dependências IPC alcançável pelo renderer. O tipo de retorno público mantém o ramo de compatibilidade `cancelled`,
mas a cadeia atual de inicialização e refresh do Desktop não produz esse estado final.

Inicialização, refresh do pareamento, fechamento de janela, parada pelo usuário e expiração do ticket precisam invalidar os tickets não consumidos. Restaurar
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