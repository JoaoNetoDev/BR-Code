# Telemetria de eventos personalizados ARMS para conexões de workspace remoto

> Status: implementado, aguardando aceitação ARMS no ambiente de testes
> Branch relacionada: `fix/add-arms-for-remote`
> Spec relacionada: [Telemetria de uso em cenários remotos V1](./remote-usage-telemetry-v1.md) (canal `/report` do data warehouse; este documento é o complemento de canal ARMS e não substitui a V1)

## Objetivo e pergunta de produto

Esta telemetria responde no ARMS (RUM da Alibaba Cloud) a duas perguntas de produto:

1. **Quais dispositivos desktop usaram workspace remoto** — consultar `remote_active_session_count` com `custom.value > 0`, deduplicando por `device_mid`. O `user.name` do ARMS já está fixado como `device_mid`, então também é possível usar diretamente a busca por dimensão de usuário; ao quebrar o volume de uso de conexões explícitas por remote kind, consultar `remote_connect_result`.
2. **Quantas conexões de workspace remoto cada dispositivo desktop mantém abertas simultaneamente** — o `custom.value` de `remote_active_session_count` é o número atual de sessões lógicas remotas de workspace ativas. Primeiro pegar o max no intervalo de tempo por `device_mid`, depois calcular a distribuição sobre o max em nível de dispositivo.

Convenções de escopo:

- Escopo: **conexões de workspace remoto iniciadas pelo `ConnectRemote` do desktop** (SSH/WSL/Docker/Server); relay, bridge ou attachment replayable do Remote Control via celular não contam como nova conexão remota.
- O handler `ConnectRemote` deve marcar explicitamente a rota Main-local desta conexão como `remoteUsageTelemetryEligible=true`; outras chamadas internas têm false por padrão. stats, gauge, disconnect e periodic sampling tratam somente de rotas elegíveis, garantindo mecanicamente que o escopo não cresce à medida que o manager ganha novos chamadores.
- Adefinição principal de "conexões remotas simultâneas" é o **número de sessões lógicas ativas**, isto é, quantos workspaces remotos o usuário mantém abertos ao mesmo tempo; não é a contagem de entradas no pool físico de conexões TCP/SSH, nem o número de dispositivos físicos remotos.
- Identidade do usuário: **somente `device_mid`** (consistente com os eventos ARMS existentes; o SDK do ARMS bloqueia `user.id`, então o uid da conta não pode ser injetado no campo de usuário. Análises em nível de conta continuam usando o `user_id` do canal do data warehouse da V1).
- Escopo de eventos: sucesso/falha de conexão explícita do desktop, gauge de sessões ativas, desconexão e duração observável da conexão.

## Relação com o canal do data warehouse da V1

|                  | V1 data warehouse `/report`        | ARMS deste documento                          |
| ---------------- | ---------------------------------- | --------------------------------------------- |
| Estado final de conexão explícita do desktop | `remote_workspace_connect_result` | `remote_connect_result` (mesmo ponto de disparo, superconjunto de campos) |
| Evento de desconexão          | ausente (podado na V1)                    | `remote_disconnect`                             |
| Gauge de concorrência         | ausente (podado na V1)                    | `custom.value` de `remote_active_session_count`  |
| Duração da conexão         | ausente (podado na V1)                    | `custom.value` de `remote_disconnect`             |
| Identificação do usuário        | `user_id` (no login) / `device_mid` | apenas `device_mid`                                 |

Os eventos de resultado de conexão dos dois canais são **deliberadamente nomeados de forma diferente**: isso evita confundir dois conjuntos de campos ao buscar por nome de evento (configuração de alertas, reconciliação, busca de texto livre). Precedente: data warehouse `message_completion` ↔ ARMS `perf_ui_message_complete`.

`remote_connect_result` descreve o estado final de tentativas de conexão explícita do desktop; adefinição principal no ARMS para "se usa workspace remoto" usa um gauge unificado, de modo a cobrir tanto mudanças de estado quanto amostras periódicas que cruzam o intervalo consultado.

## Arquitetura e fluxo de eventos

```text
 Renderer                Main 进程                                      Window Host (UtilityProcess)
    |                       |                                                  |
    | ConnectRemote IPC     |                                                  |
    |---------------------->| desktopMainIpcRemote.ts ConnectRemote handler    |
    |                       |--- createRemoteWorkspaceSession --------------->| 建连
    |                       |    (remoteUsageTelemetryEligible=true)           |
    |                       |<-- RemoteWorkspaceConnected ---------------------|
    |                       | handleConnected                                  |
    |                       |   route 入 map {                                  |
    |                       |     connectedAtMonotonicMs,                       |
    |                       |     connectFinalized=false,                       |
    |                       |     remoteUsageTelemetryEligible=true            |
    |                       |   }                                               |
    |<== ScopedServicePort ==| attachRendererPort                              |
    |-- ready ACK ---------->| confirm                                         |
    |                       |   -> connectFinalized=true                       |
    |                       |   -> 读 after-state stats                        |
    |                       |   -> [量①] remote_active_session_count          |
    |                       |   -> resolve                                     |
    |                       | IPC 成功返回前 -> [连①] remote_connect_result   |
    |                       | IPC 失败返回前 -> [连②] remote_connect_result   |
    |                       |   failure 不改变活跃集合，不发 gauge              |
    |                       |                                                  |
  ══ 断开路径（统一 active-set retire，不允许各路径自行拼 gate）══════════════════
    |                       | wasActive = eligible && attachable                |
    |                       |             && connectFinalized                   |
    |                       | -> 先 mark closed / delete route                  |
    |                       | -> 读 after-state stats                           |
    |                       | -> wasActive 时 [量②] remote_active_session_count |
    |                       | -> wasActive 时 [断] remote_disconnect            |
    |                       |                                                  |
    |                       | connection-closed / disposed / window-closed      |
    |                       | / host-exit / app-shutdown 共用同一 retire helper |
    |                       |                                                  |
    |                       | 每 5 分钟且 active_session_count > 0              |
    |                       |   -> [量③] periodic gauge                        |
    |                       | app shutdown: 先停 periodic timer，再 retire 全部 |
    |                       |                                                  |
  所有事件经 dispatchFinalArmsCustomEvent -> e2eController.record -> armsRum.sendCustom
```

- A autoridade das conexões remotas continua sendo o `windowRemoteConnectionRegistry` no Window Host. O `routesBySessionId` do Main mantém apenas as rotas de request/session/attachment de conexões já existentes; esta solução deriva apenas do gauge de telemetria de baixa frequência a partir dessa tabela de rotas existente, sem adicionar estado de negócio de session/task/stream/queue/snapshot.
- `remoteUsageTelemetryEligible` é somente uma marcação de escopo de telemetria em memória do Main; não entra em `RemoteTarget`, descritor de Host, `workspaceIdentity`, mensagens entre processos ou dados persistidos; o padrão é false e apenas o handler `ConnectRemote` o habilita explicitamente.
- O `/remote` do celular continua apenas fazendo attach em sessões remotas que já existem na janela do desktop. Attach/detach de bridge, reconexão pelo celular e recuperação replayable não alteram `routesBySessionId`, portanto não alteram o gauge.
- O processo Main possui o dispatch final dos custom events do ARMS; não é preciso adicionar reporter nem campos de protocolo ao Host, CLI, relay ou bundle Web.
- O gauge periódico de 5 minutos cobre conexões longas em que "a conexão foi estabelecida antes do intervalo consultado e não houve mudança de estado dentro dele". Durante a suspensão do sistema não se reenviam amostras históricas; após a retomada, a amostragem continua pelo próximo timer ou por mudança de estado.

## Definição dos eventos

group: `remote_usage`. As dimensões comuns (`event_name` / `app_version` / `arms_env` / `device_mid` / `platform` / `renderer_id` / `metric_value`) são injetadas automaticamente por `buildFinalArmsCustomEventPayload`; todas as properties são convertidas com `String()`.

A tabela Custom do ARMS tem apenas uma medida numérica principal, `custom.value`. Por isso o resultado de conexão a usa para representar contagem, o disconnect a usa para representar duração e o gauge de concorrência a usa para representar o número de sessões lógicas ativas; não se pode usar diretamente uma property de string como medida numérica para a distribuição de concorrência.

### `remote_connect_result`

Ponto de disparo: quando o IPC explícito `ConnectRemote` obtém um estado final de sucesso ou falha (o mesmo ponto de instrumentação do evento do data warehouse da V1).

| Campo              | Valor                                 | Descrição                          |
| ----------------- | ----------------------------------- | ------------------------------- |
| value             | `1`                                 | contagem de tentativas de conexão explícita       |
| `result`          | `success` / `failure`               | resultado da conexão                        |
| `remote_kind`     | `ssh` / `wsl` / `docker` / `server` | tipo de remoto                        |
| `connect_trigger` | `new` / `reconnect` / `restore`     | mesmadefinição da V1                    |
| `error_category`  | sete enumerações da V1; string vazia em caso de sucesso           | produzido por `classifyRemoteUsageError` |

### `remote_active_session_count`

Ponto de disparo: após uma mudança no conjunto de rotas ativas, e nas amostragens periódicas não nulas a cada 5 minutos.

| Campo                  | Valor                                                                                                        | Descrição                                                              |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| value                 | `active_session_count`                                                                                    | medida numérica `custom.value` do ARMS; número de sessões lógicas ativas após a mudança, pode ser 0  |
| `sample_reason`       | `state-change` / `periodic`                                                                              | mudança de estado ou ponto de baixa frequência                                               |
| `transition`          | `connected` / `connection-closed` / `disposed` / `window-closed` / `host-exit` / `app-shutdown` / `none` | `none` é usado no periódico                                               |
| `remote_kind`         | quatro kinds / string vazia                                                                                     | kind da rota correspondente à mudança de estado; vazio no periódico                          |
| `active_target_count` | string numérica                                                                                               | contagem deduplicada de identidades de target remoto anonimizadas, apenas dimensão diagnóstica, não é a métrica principal de concorrência |

A `renderer_id` das amostras de mudança de estado usa o `webContentsId` da rota correspondente. O módulo de telemetria guarda o último `rendererId` de gauge válido e as amostras periódicas reutilizam esse valor; `active_session_count > 0` sem um rendererId recente é inalcançável na máquina de estados, porque toda rota ativa produz primeiro uma amostra de mudança de estado ao ser finalized pela primeira vez.

### `remote_disconnect`

Ponto de disparo: quando uma rota que já entrou no conjunto ativo sai do conjunto. É obrigatório ler as stats de after-state depois de remover a rota da fonte de estatísticas/marcá-la como closed; a mesma rota só é reportada uma vez.

| Campo                | Valor                                                                               | Descrição                                                    |
| ------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------- |
| value               | `duration_ms`                                                                    | tempo de vida observável da conexão, usando diferença de relógio monotônico com clamp ≥ 0         |
| `remote_kind`       | idem                                                                             |                                                          |
| `disconnect_reason` | `connection-closed` / `disposed` / `window-closed` / `host-exit` / `app-shutdown` | ver tabela abaixo                                                   |
| `duration_ms`       | string numérica                                                                         | igual ao value, facilita busca de detalhe; agregação numérica usa `custom.value` |

Semântica de `disconnect_reason`:

| Valor               | Significado                                                                   |
| ------------------- | ---------------------------------------------------------------------- |
| `connection-closed` | desconexão anormal na camada de transporte (SSH keepalive meio aberto, queda de rede, saída de processo remoto)           |
| `disposed`          | liberação ativa pelo usuário (fechar tab, cancelar diálogo já conectado, caminho defensivo de dispose pelo Host) |
| `window-closed`     | fechar a janela leva junto todas as conexões daquela janela                                             |
| `host-exit`         | fallback para crash/saída do UtilityProcess do Window Host                                 |
| `app-shutdown`      | saída normal ou instalação de atualização entrando no shutdown barrier                                |

definição de duração: `connectedAtMonotonicMs` é registrado quando o Main recebe `RemoteWorkspaceConnected`, usando `performance.now()` por padrão; rebind de contexto do renderer / reload do renderer não zera a contagem. Um shutdown normal do app reporta em best effort; crash súbito do Main, `kill -9` ou queda de energia continuam sendo amostras com censura à direita e não entram na duração média.

## Contagem de concorrência edefinição de target

`getRemoteConnectionStats()` (novo em `createRemoteWorkspaceSessionManager`) conta apenas rotas com `remoteUsageTelemetryEligible && attachmentState === "attachable" && connectFinalized`:

- `active_session_count`: número de rotas, isto é, sessões lógicas remotas de workspace ativas. É a únicadefinição principal de "conexões remotas simultâneas"; abrir dois workspaces no mesmo target remoto = 2.
- `active_target_count`: número de entradas após deduplicação pela chave de identidade de target anonimizada, apenas como atributo diagnóstico. A chave existe somente na memória do Main e nunca é reportada:
  - ssh → `"ssh:" + buildSshRemoteHostKey(target)`
  - wsl → `"wsl:" + (distro?.trim() || "default") + "\0" + (user?.trim() ?? "")`
  - docker → `"docker:" + container`
  - server → `"server:" + normalizeServerRemoteUrlForComparison(url)`
- A URL de server só sofre normalização de protocolo no mesmo nível de segurança: `ws:// == http://`, `wss:// == https://`; `ws:// != https://`.
- O manager é um singleton de aplicação, portanto o gauge agrega entre janelas; isso não significa que o pool físico de conexões do Host seja compartilhado entre janelas.
- O target da rota já teve senha/token removidos pelo `stripRemoteTargetSecrets` do Host, então a autenticação SSH por senha pode aparecer como `agent` na chave do Main. Assim, `active_target_count` não é nem o número de dispositivos físicos nem de transportes físicos, e não é usado para KPI de produto.

## Mudanças de estado e invariantes de idempotência

Todos os caminhos de saída devem reutilizar um único retire helper atômico, sem decidir separadamente e reportar direto:

```text
wasActive = route.remoteUsageTelemetryEligible
            && route.attachmentState == attachable
            && route.connectFinalized
    |
    +-> false: apenas executa limpeza idempotente, não envia gauge, não envia disconnect
    |
    +-> true:
          1. marca closed ou remove de routesBySessionId
          2. lê as stats de after-state
          3. envia remote_active_session_count
          4. envia remote_disconnect
```

Isso garante:

- `connection-closed` marca a rota como closed e um dispose posterior de tab não reporta de novo.
- Uma rota cujo attach não foi confirmado nunca entrou no conjunto ativo, portanto não gera gauge/disconnect; o catch do ConnectRemote responde reportando a falha.
- Rotas internas não marcadas explicitamente como eligible, mesmo conectadas com sucesso, não entram nas stats, não geram gauge/disconnect e não atualizam o rendererId do gauge periódico.
host exit, window close e app shutdown chegando em qualquer ordem fazem cada rota ativa sair apenas uma vez.

- reporter/getStats/sendCustom lançando erro não pode reverter o estado da rota nem bloquear o fluxo de conexão e limpeza.

## Limite de privacidade

Segue a lista de proibições da V1 (seção "Classificação de erros e privacidade" de [remote-usage-telemetry-v1.md](./remote-usage-telemetry-v1.md)): nenhum evento pode enviar `workspacePath` / `workspaceIdentity` / `remoteSessionId` / host SSH, usuário, porta / container Docker / distro WSL / URL de Server / mensagem de erro original ou stack trace.

Os campos reportados contêm apenas enums controlados, contagens agregadas e durações; nenhum texto bruto de identidade remota é enviado. A chave de deduplicação de `active_target_count` existe apenas na memória do Main e o evento carrega somente a string numérica agregada.

## Poda e limites conhecidos

- `remote_connect_result` mantém a semântica de "tentativa de conexão explícita do desktop"; concorrência e número real de dispositivos em uso são calculados uniformemente a partir do gauge.
- A elegibilidade de telemetria é false por padrão e só o handler `ConnectRemote` a habilita; novos chamadores do manager não entram automaticamente no escopo desta métrica.
- Reload do renderer / bind do workspace context / troca de attachment não alteram o conjunto de rotas ativas, não geram eventos de mudança de estado e não zeram a duração.
- Cancelar durante a conexão e falha de conexão não geram disconnect nem gauge; são cobertos por `remote_connect_result failure`.
- O gauge periódico é fixo em 5 minutos, com o objetivo de sustentar janelas diárias/semanais; consultas temporárias menores que 5 minutos e sem mudança de estado no período podem precisar estender a janela para trás.
- Shutdown normal do app reporta em best effort; crash do processo principal, kill forçado ou queda de energia não conseguem reportar o disconnect, portanto a métrica de duração de conexão deve ser rotulada como "amostras de conclusão observável".
- Esta funcionalidade não modifica os caminhos `continuous` do desktop nem `replayable` do mobile, não adiciona E2E de conversation/session e não atualiza o catálogo de casos de conversation / matriz de cobertura.

## Exemplos de cálculo de métricas

| Métrica                          | Cálculo                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Dispositivos usando workspace remoto (dia/semana) | `remote_active_session_count` com `custom.value > 0`, deduplicado por `device_mid`     |
| Dispositivos com conexão explícita bem-sucedida            | `remote_connect_result` com `result=success`, deduplicado por `device_mid`             |
| Dispositivos por tipo de conexão explícita      | o mesmo agrupado por `remote_kind`                                                     |
| Pico de conexões simultâneas por dispositivo          | agregar `max(custom.value)` por `device_mid` em `remote_active_session_count`   |
| Distribuição do pico de conexões simultâneas            | calcular P50/P90/max sobre o max em nível de dispositivo do passo anterior; é proibido fazer histograma direto sobre todas as linhas de evento        |
| Duração média observável da conexão            | `custom.value` de `remote_disconnect`; o painel deveregistrar que que exclui amostras com censura à direita por terminação súbita do processo principal |
| Proporção de desconexões anormais de transporte              | `disconnect_reason=connection-closed` / todos os `remote_disconnect`              |

## Plano de implementação

### Propriedade do estado e arquivos modificados

| Estado / fato                                      | Owner                                               | Arquivo                                                                 |
| ------------------------------------------------ | --------------------------------------------------- | -------------------------------------------------------------------- |
| Payload / configure / gauge periódico / reporte do ARMS | novo módulo (reusando o dispatch final de `desktopArmsCustomEvent.ts`) | (novo) `packages/desktop/src/main/desktopRemoteUsageArmsTelemetry.ts` |
| Estado final de conexão explícita                                     | Handler do IPC ConnectRemote                           | `packages/desktop/src/main/desktopMainIpcRemote.ts`                  |
| Ciclo de vida da rota / retire atômico / estatísticas de concorrência        | RemoteWorkspaceSessionManager                       | `packages/desktop/src/main/desktopRemoteSessions.ts`                 |
| Montagem e encerramento do timer de shutdown                       | Entrada do Main                                           | `packages/desktop/src/main/index.ts`                                 |

#### 1. (novo) `desktopRemoteUsageArmsTelemetry.ts`

- Constantes: `REMOTE_USAGE_ARMS_GROUP = "remote_usage"`, três nomes de evento, `REMOTE_USAGE_GAUGE_INTERVAL_MS = 300_000`.
- Tipos: `RemoteDisconnectReason`, `RemoteGaugeTransition`, `RemoteConnectionStats { activeSessionCount; activeTargetCount }`.
- Builders puros:
  - `buildRemoteConnectResultArmsPayload(params)`
  - `buildRemoteActiveSessionCountArmsPayload(params, stats)`, com `value = stats.activeSessionCount`
  - `buildRemoteDisconnectArmsPayload(params)`, com `value = durationMs`
- `configureRemoteUsageArmsTelemetry({ armsCustomContext, getRemoteConnectionStats, sendCustom, e2eController?, logger, setInterval?, clearInterval? })`: singleton em nível de módulo; inicia o timer de 5 minutos e envia o gauge periódico somente quando count > 0 e já existe um rendererId recente.
- `reportRemoteConnectResultToArms` / `reportRemoteConnectionStateChangedToArms` / `reportRemoteDisconnectToArms`: no-op quando não configurado; try/catch interno que nunca lança; todos passam por `dispatchFinalArmsCustomEvent`.
- `stopRemoteUsageArmsPeriodicSampling()`: apenas para o timer, sem limpar a configuração do reporter; após o shutdown do app ainda é possível enviar o gauge/disconnect final.
- `resetRemoteUsageArmsTelemetryForTest()`: para o timer e limpa o estado do módulo.
- Reusa `RemoteUsageRemoteKind` / `RemoteWorkspaceConnectTrigger` / `RemoteUsageErrorCategory` / `RemoteUsageResult` do shared, sem novo protocolo ou schema de runtime compartilhado.

#### 2. `desktopRemoteSessions.ts` (gauge canônico + disconnect + stats)

- `PendingConnect` e `RemoteAttachmentRoute` ganham `remoteUsageTelemetryEligible: boolean`; a rota ganha também `connectedAtMonotonicMs: number` e `connectFinalized: boolean`. Os campos ficam no nível superior da rota para evitar perda quando o bindContext substitui o descritor.
- `createRemoteWorkspaceSession` ganha um quinto parâmetro de lifecycle Main-local `{ remoteUsageTelemetryEligible?: boolean }`, com padrão false; esse parâmetro é escrito apenas em pending/route e não é repassado ao Host.
- As opções ganham `reportRemoteConnectionStateChanged`, `reportRemoteDisconnect` e `monotonicNowMs` (injetados em teste, padrão `performance.now`) opcionais. Apenas import type-only, para evitar dependência circular em runtime.
- `confirmRendererAttachmentReady` define `connectFinalized = true` para a primeira conexão antes do resolve; somente rotas elegíveis reportam em seguida o gauge de after-state com `transition=connected`. O ready ACK de bind/reattach não finaliza de novo.
- Novo helper unificado `retireActiveRoute(route, transition, mutate)`: captura `wasActive` por `eligible && attachable && connectFinalized`, executa mark/delete, depois lê as stats; somente quando `wasActive` reporta gauge e disconnect, nessa ordem.
- `handleClosed` / `disposeRemoteWorkspaceSession` / `disposeRemoteWorkspaceSessionsForWindow` / `child.once("exit")` / `disposeAllAndWaitForAppShutdown` reutilizam o retire helper.
- O shutdown do app usa `app-shutdown`, retirement registro a registro antes do clear; não pode simplesmente chamar `routesBySessionId.clear()` como na implementação atual.
- O objeto de retorno ganha `getRemoteConnectionStats()`.

#### 3. `desktopMainIpcRemote.ts` (resultado de conexão explícita + configure)

- As opções ganham o obrigatório `getRemoteConnectionStats: () => RemoteConnectionStats`.
- A assinatura da option `createRemoteWorkspaceSession` ganha o parâmetro de lifecycle Main-local; a chamada `ConnectRemote` passa explicitamente `{ remoteUsageTelemetryEligible: true }`.
- Depois de criar `finalArmsCustomEventE2E`, chama `configureRemoteUsageArmsTelemetry`; o register ocorre antes da criação da primeira janela, então um evento de conexão não pode ocorrer antes do configure.
- Antes dos retornos de sucesso/falha de `ConnectRemote`, chama uma vez `reportRemoteConnectResultToArms`. Esse evento não carrega mais property de concorrência; a concorrência vem somente do gauge canônico.
- O reporter externo mantém um safe try/catch, garantindo que nenhuma exceção de telemetria transforme uma conexão bem-sucedida em falha.

#### 4. `index.ts` (montagem e ordem de saída)

- As opções do manager recebem `reportRemoteConnectionStateChangedToArms` e `reportRemoteDisconnectToArms`.
- `registerRemoteIpcHandlers` recebe `getRemoteConnectionStats`.
- `prepareAppQuit` executa `stopRemoteUsageArmsPeriodicSampling()` de forma síncrona antes de chamar `remoteSessionManager.disposeAllAndWaitForAppShutdown`; o manager envia em seguida o gauge/disconnect `app-shutdown` e o SDK do ARMS faz um flush best effort usando a janela de tempo fornecida pelo barrier de shutdown do Host existente — a taxa real de chegada precisa ser aceita no ambiente de testes.

#### 5. Índice de documentação

- Adicionar o índice deste documento na seção de iniciações de produto de `docs/monitoring/README.md`.
- Em `docs/monitoring/business-monitoring.md`, na referência à V1, acrescentar que concorrência/duração estão neste documento.
- Na seção "Podas deste ciclo" de `docs/monitoring/remote-usage-telemetry-v1.md`: registrar que a concorrência de sessões lógicas e a duração de conexão observável são assumidas pelo canal ARMS.
- Não registrar em `performance-telemetry-catalog.md`: esse arquivo é o dicionário de eventos de performance e groups de usage como `plan_usage` / `send_funnel` não entram nele.

### Plano de testes (escrever os testes antes da implementação)

**A (novo) `packages/desktop/test/desktopRemoteUsageArmsTelemetry.test.ts`**

- Conjunto de campos e `custom.value` dos três builders: connect=1, gauge=sessão ativa, disconnect=duração.
- `errorCategory -> unknown` como padrão em falha; as properties não contêm nenhuma identidade de target/path/session.
- Sem configure, não lança nem envia; após configure, afirmar dimensões comuns e supressão usando um `createFinalArmsCustomEventE2EController` real.
- Fake timer: count=0 não envia periódico; count>0 envia a cada 5 minutos; usa o rendererId mais recente; após stop/reset não envia mais.
- Quando getStats / sendCustom lança, engole e faz `logger.warn`; cada caso é isolado por reset.

**B (extensão) `packages/desktop/test/desktopRemoteSessions.test.ts`**

- stats: duas sessões lógicas eligible no mesmo target SSH -> session=2 / target=1; deduplicação com os quatro kinds misturados.
- Normalização de server: `ws:// == http://`, `wss:// == https://`, `ws:// != https://`.
- Attach não confirmado não conta nem envia gauge; envia uma vez o gauge `connected` após o primeiro ready; bind/reattach ready não reenvia.
- Conexões internas sem parâmetro de lifecycle ou com eligible=false explícito, mesmo bem-sucedidas, não entram nas stats e não enviam gauge; o disconnect/app shutdown posterior também não envia eventos.
- `connection-closed` reporta uma vez; dispose após closed não reporta de novo.
- dispose / window close / host exit geram respectively transition + disconnect correspondentes, e-segurar que cada gauge é de after-state.
- App shutdown reporta `app-shutdown` registro a registro, com o último gauge value=0; rota com attach não confirmado não reporta.
- Erro lançado pelo callback não interrompe a limpeza da rota; a duração usa o relógio monotônico injetado para obter valor exato.

**C (extensão) `packages/desktop/test/desktopMainIpcRemoteTelemetry.test.ts`**

- configure é chamado e repassa `getRemoteConnectionStats` / E2E controller / sendCustom.
- Parâmetros de sucesso/falha de conexão explícita e os quatro remote kinds; afirmar que `createRemoteWorkspaceSession` recebeu `remoteUsageTelemetryEligible=true`; connect-result não carrega mais campo de concorrência.
- Erro lançado pelo reporter ARMS não reescreve o valor de retorno `{ success: true }`.

**D (regressão)**

- `packages/desktop/test/e2eProcessCleanup.test.ts`: cobre a montagem do shutdown barrier em index.ts.
- Regressão completa dos testes unitários existentes de remote session / window lifecycle.
- Esta funcionalidade não modifica estado de conversation, o wire da V4 nem os limites replayable/continuous, e não adiciona casos de E2E de conversation.

### Aceitação ARMS obrigatória

A ponte E2E registra o payload antes do `sendCustom` e só prova que a montagem do cliente está correta; não prova o flush do SDK, a entrada no ARMS nem adefinição de consulta. Portanto a seguinte aceitação no ambiente de testes é pré-requisito de release, não um smoke opcional:

1. Ativar o gate duplo da ponte E2E, conectar dois workspaces remotos WSL/Docker, desconectar um e confirmar que a sequência de gauges no payload local final é `1 -> 2 -> 1`.
2. Manter pelo menos uma conexão por mais de 5 minutos e confirmar que o gauge periódico entrou no ARMS.
3. Sair do App normalmente e confirmar que o disconnect `app-shutdown` e o gauge final 0 são consultáveis no ambiente de teste do ARMS.
4. Validar na tabela Custom do ARMS: `custom.value` é number, `user.name` é igual a `device_mid`, e o `max(custom.value)` em nível de dispositivo e a consulta P50/P90 em duas fases batem com o esperado.
5. Verificar que nenhum evento contém texto bruto proibido de target/path/identity/error.

Se a máquina de desenvolvimento atual não tiver um ambiente real de WSL/Docker/SSH, a mensagem de commit deve listar os itens não concluídos e não pode marcar adefinição de dados do ARMS como aceita.

### Ordem de implementação e verificação

1. Este documento de spec e a segunda revisão.
2. Teste A -> implementação de `desktopRemoteUsageArmsTelemetry.ts` -> verde.
3. Teste B -> alteração de `desktopRemoteSessions.ts` -> verde.
4. Teste C -> alteração de `desktopMainIpcRemote.ts` e `index.ts` -> verde.
5. Atualizar os três índices de documentação.
6. Concluir a aceitação ARMS no ambiente de testes e registrar adefinição de consulta.
7. Enviar um Conventional Commit.

Comandos de verificação (raiz do repositório):

```bash
pnpm typecheck
pnpm lint
pnpm exec vitest run \
  packages/desktop/test/desktopRemoteUsageArmsTelemetry.test.ts \
  packages/desktop/test/desktopRemoteSessions.test.ts \
  packages/desktop/test/desktopMainIpcRemoteTelemetry.test.ts \
  packages/desktop/test/e2eProcessCleanup.test.ts
```