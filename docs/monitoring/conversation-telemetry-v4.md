# Especificação de compatibilidade da telemetria de conversa do V4

Este documento congela o contrato de telemetria de conversa da cadeia principal de conversation do V4. A implementação usa o comportamento de produção de `z-code-2` como baseline de compatibilidade, restaurando apenas dados que já existiam na versão antiga, sem aproveitar a migração para modificar tipos de campo, fórmulas de métrica ou escopo de coleta.

## Objetivos e não objetivos

Restaurar os seguintes eventos de produção:

- `/event/report`: `send_btn`, `message_completion`, `agent_step`, `context_compaction`, `assistant_message_feedback`.
- ARMS: `perf_ui_first_token`, `perf_ui_message_complete`, `perf_ui_turn_breakdown`, `perf_ui_stream_stall`, `perf_ui_tool_call_detail`, `plan_request`, `plan_ttft`, `chat_error_banner`.
- O quota banner `session_quota_alert` dependente da entrada real de conversa e a passagem para o painel de Upgrade já existente.

Não objetivos:

- O reporte de rede efetivo no Web/celular.
- Reenvio de initial snapshot, cold hydration, gap recovery ou transcript histórico.
- Corrigir os contratos históricos da versão antiga: valores zero fixos, strings vazias, clamp de valores negativos e stop-without-terminal.
- Gravar o estado de telemetry em conversation rows, snapshot, relay ou no processo main.

## Arquitetura e fronteiras de estado

```text
CLI V4 live SessionEvent
        |
        | normalize metadata-only fact
        v
Host workspace telemetry service
        | validate + forward; no persistence/replay
        v
Renderer workspace telemetry supervisor
        | seed + foreground refs + bounded dedupe
        +----------------------+----------------------+
        |                      |                      |
        v                      v                      v
 /event/report            ARMS ui_perf       quota/feedback

persisted hydration / initial / recovery
        |
        +----> conversation projection only
               MUST NOT emit telemetry facts
```

Não se pode ressuscitar o antigo `zcodeTaskRuntimeMonitor`, nem colocar o supervisor dentro de `SessionPane`, `SessionDataLayer` ou na connection controlada pelo keep-warm de 30 segundos. O supervisor pertence ao workspace/service attachment da janela, e a chave de isolamento é:

```text
endpoint + remoteSessionId + (workspaceIdentity?.trim() || workspacePath) + serviceGeneration
```

Só existe um supervisor por geração de workspace/service. Troca de task, unload de pane e expiração do keep-warm não o destroem; detach de workspace, fechamento da janela ou troca de service generation o destrói.

"Foreground" é o conjunto de referências das sessions visíveis, e não um dono único de pane. A mesma session continua consumindo o fato apenas uma vez quando está visível em vários split panes; múltiplas sessions diferentes podem estar em foreground ao mesmo tempo.

## Protocolo de live fact

`ConversationTelemetryFact` é uma discriminated union estrita, com campos comuns:

```ts
interface ConversationTelemetryFactBase {
  version: 1;
  eventId: string;
  eventSeq: number;
  occurredAt: number;
  sessionId: string;
  sourceCommandId?: string;
  turnId?: string;
}
```

Os tipos de fato cobrem:

- `turn.started`
- `model.request.status`
- `stream.chunk`, permitindo apenas `thought | text`, o comprimento, se é o primeiro chunk e um `parentToolCallId` opcional, sem o corpo; o text de subagente com parent não entra no generation step principal, mas o handler antigo continua registrando o first token e o stall dele fora do step builder. O thought com parent mantém o comportamento antigo de reasoning/TTFT/stall
- `tool.lifecycle`, permitindo apenas nome da ferramenta, status, ID, associação pai-filho/Agent e perf de allowlist achatado, sem input/output. O `detail` aninhado do `ToolExecutionTelemetry` do Runtime precisa ser mapeado campo a campo pelo normalizador de fact da CLI conforme os ramos discriminados command/filesystem/patch; é proibido repassar direto ou usar spread; `command.hash` fica apenas no objeto local de diagnóstico da CLI e não entra no fact do V4. O `commandHash` mantido no schema compartilhado não significa que o producer oficial preencha esse campo
- `permission.lifecycle`
- `usage.delta`, produzido apenas pelo `ModelComplete` com `querySource=main_turn` (ou o padrão histórico de compatibilidade ausente e diferente de `tool_internal`); `session_title`, compact, subagente e outros usages sidecar não podem ser acumulados no prompt do usuário
- `turn.terminal`
- `compaction.terminal`

`model.request.status` mantém apenas o provider/model/status, a duração da requisição, a classificação de erro e o hostname do provider necessários ao `plan_request` antigo e à telemetry de message. O hostname precisa ser obtido por parsing de URL, e é proibido manter path, query, header, contagem de headers, token, prompt, message original do upstream ou finish reason.

O `event_extra_detail` de `message_completion` e `agent_step` também precisa carregar a dimensão de cenário do workspace atual:

- `workspace_kind`: `local` / `remote`, indicando o tipo de workspace em que o turno realmente rodou;
- `remote_kind`: `ssh` / `wsl` / `docker` / `server`, string vazia em caso local ou quando o tipo remoto não pode ser resolvido.

Esses dois campos são dimensões de baixa cardinalidade, com valores congelados pelo renderer workspace attachment no momento da criação do supervisor e escritos simultaneamente na completion e no step da mesma message. O tipo remoto só pode ser resolvido pelo `parseRemoteWorkspaceIdentity` unificado; não se pode escrever diretamente noevento `remoteSessionId`, `workspaceIdentity`, `workspacePath`, endereço de host ou qualquer outra identidade de alta cardinalidade.

O Host decide a permissão de assinatura conforme o `clientMode` confiável injetado pelo attachment e não pode confiar no que o renderer declara. Só o renderer `desktop-continuous` instala o reporter real; `web-remote-replayable`, o Bot e clientes de automação, mesmo vendo o estado autoritativo de conversation, não podem gerar reporte de rede pelo telemetry service. O link remoto SSH/WSL/Docker/Server pode ter múltiplos connection scopes, do attachment do Desktop Host até o trusted host relay; o relay em si continua sem instalar reporter, mas precisa repassar o `clientMode` das conexões downstream confiáveis existentes e o connectionId com namespace para o upstream. Somente a assinatura de telemetry fact com contexto downstream confiável de `desktop-continuous` pode atravessar o relay; assinatura direta no relay ou downstream `web-remote-replayable` precisa devolver eventos vazios.
O attachment de Telemetry é uma capacidade secundária; enquanto Platform ou agent service ainda não estiverem prontos, ele precisa permanecer no-op, sem bloquear o workspace/remote renderer, e o supervisor e a live subscription só são estabelecidos conforme a service generation quando todas as dependências estiverem prontas.

Fatos são produzidos apenas pelo ingest live do processo atual:

- persisted hydration, subscribe initial, snapshot e recovery: não produzem.
- Eventos que chegam durante a hydration e ficam temporariamente no live buffer: produzem uma vez.
- Após reinício de CLI/runtime, não se fabrica completion por órfãos ou por estados terminais históricos.

## IDs, relógio e deduplicação

- `talk_id = sessionId`.
- O `message_id` de send/completion/step é o `sourceCommandId`.
- O `message_id` de feedback é o `entityId` da assistant message; na ausência de entityId, não se substitui pelo rowId.
- O `message_id` de compaction é `summaryMessageId ?? operationId`.
- O renderer calcula a duração antiga com `Date.now()` no momento em que recebe o live fact; `occurredAt` serve apenas para diagnóstico.
- eventId usa um LRU limitado de cerca de 2000 entradas.
- Terminal é exactly-once por `(sessionId, sourceCommandId, eventName)`.
- Compact é exactly-once por `(sessionId, operationId, "context_compaction")`; na mesma operation, mesmo que terminais com status contraditórios cheguem repetidamente de forma anormal, apenas o primeiro terminal live é adotado.
- O seed local de prompt fica apenas na memória; não há reenvio após reload do renderer.

## Matriz de disparo de eventos

| Evento | Foreground | Background após sair | Initial/recovery |
| --- | --- | --- | --- |
| `send_btn` | Uma vez quando o command local de desktop é aceito pela UI | Promoção de fila não reenvia | Não envia |
| `message_completion` | Envia | Turnos que já têm seed local continuam enviando | Não envia |
| `agent_step` | Envia | Turnos que já têm seed local continuam enviando | Não envia |
| `plan_request` | Envia | Envia | Não envia |
| `context_compaction` | Envia quando o terminal chega estando visível | Não envia | Não envia |
| Os seis eventos de UI ARMS | Enviam | Não enviam | Não enviam |
| `chat_error_banner` | Envia quando o banner fica realmente visível | Não envia | Após a recuperação, pode enviar na primeira visibilidade real |

O tempo de envio de `send_btn` vem da ação original da UI. Commands direct/queued de uma session existente são reportados após a aceitação local;
o primeiro envio a partir de um draft é reportado depois do ACK de create, quando se obtém o sessionId, mas continua usando o tempo original de input/send. Retry com o mesmo commandId, promoção de fila ou duplicata de inbox de command não reenviam.

Os campos de modelo do seed de envio continuam reaproveitando os valores de compatibilidade da UI antiga: o provider de runtime (atualmente com default `glm`) escreve apenas `agent`;
quando `config.provider !== glm`, `model_name` usa a codificação `custom:<provider>:<model>`, e `model_provider` continua escrevendo o config provider real separado. Depois que a requisição real de modelo chega, completion/step reescrevem para `<provider>/<model>` pela lógica antiga. Não é permitido mudar o contrato de string do data warehouse só porque o config do V4 separou provider/model em campos.
Mesmo no primeiro envio a partir de um draft em que o prewarm snapshot ainda não chegou, o seed precisa vir da mesclagem do config de inicialização congelado no ciclo de vida daquele draft com a intent explícita; não pode regredir para modelo vazio/`glm`, nem bloquear o envio real esperando a telemetria.

`message_completion` e `agent_step` são produzidos apenas por prompts com seed criado pela UI de desktop. `turn.started` liga o seed a session/turn/sourceCommandId; todos os fatos posteriores que carregam sourceCommandId precisam casar com o ciclo de vida atual. Um stop sem terminal mantém o comportamento antigo e não sintetiza completion.

`message_completion` e todos os `agent_step` do mesmo `talk_id + message_id` precisam usar o mesmo `workspace_kind` / `remote_kind`. Desktop local e workspace remoto de Desktop pertencem ambos a `desktop-continuous`, portanto `clientMode` serve apenas como portão de assinatura confiável e não pode ser uma dimensão de cenário de workspace.

Quando o fact terminal de ferramenta chega, o tool step correspondente precisa ser fechado imediatamente naquele instante, reportando primeiro `/event/report agent_step`; o `message_completion` do mesmo turno só é fechado no turn terminal posterior. Se um terminal de ferramenta normal for descartado por falha de schema de fact, o turn terminal ainda fecha por fallback os steps que restam abertos, mas isso alonga o `duration_ms` até o fim do turno e pode sobrescrever o status, o erro e a contagem de falhas reais da ferramenta com o estado do turno. Esse fallback fica reservado apenas para cadeias realmente ausentes/anormais e não pode ser caminho de sucesso da cadeia desktop continuous normal nem base de teste.

`TurnComplete(cancelled)` mantém o fechamento antigo em duas fases: o agent step ainda é fechado com sucesso como `task_complete` e, em seguida, vem `message_completion.status="user_interrupt"`, usando o erro fixo antigo `USER_INTERRUPT / User stopped generation`. Somente um `TurnError` real fecha o step com `task_error`.

`plan_request` consome diretamente o status de rede real do modelo, cobrindo os cinco estados da versão antiga; é permitido em primeiro e segundo plano e não exige seed local de prompt.
Não pode ser inferido a partir de `apiRetry`, de accepted, de queued ou de outros estados projetados. O eventKey usa dedup FIFO/LRU de 2000 entradas.

Os seis eventos de performance de UI e o `plan_ttft` só são atualizados/fechados quando a session está em foreground. Stream stall precisa ser estritamente `> 3000ms`; o início/atualização da ferramenta e o terminal limpam o tracker; tool detail só é reportado quando o perf de allowlist não está vazio.
O primeiro thought, o primeiro text (incluindo chunk de child com parent) ou a primeira ferramenta aceitos pela estatística antiga podem ser o first token. Quando o prompt antigo não tem absolutamente nenhum thought/text/tool antes do terminal, o `time_to_first_token="-1"` da completion ainda espelha uma vez `perf_ui_first_token(value=0)`; não se envia quando `plan_ttft < 0` ou o provider está vazio. Um first token que chega apenas em background não pode ser computado retroativamente como TTFT de UI ao voltar para o foreground.

As chamadas de completion de produção antigas nunca passaram `fileChanges`, portanto `file_change_cnt`, `generated_code_lines` e os atributos correspondentes do ARMS breakdown ficam fixos em `"0"`/`0`. Mesmo que o V4 obtenha um resumo de arquivos do runtime, ele não pode aproveitar a migração para corrigir essas duas métricas.

A compaction usa os valores de modelo do runtime antigo: para provider diferente de `glm`, `model_name` é `<provider>/<model>` e `model_provider` mantém o provider id; isso é diferente da codificação de UI `custom:<provider>:<model>` do `send_btn`. O `reason` só lê o `reason` realmente consumido pela timeline antiga; não se pode preencher string vazia com o `compactReason` do V4.

`chat_error_banner` é reportado depois que o erro é realmente renderizado e visível, uma vez por key igual dentro da mesma montagem do componente; erros suprimidos pelo reducer/UI não são reportados. Erros de business de provider comuns mantêm as ações de recuperação visíveis antigas e a dimensão do business code; a action de recuperação interna da verificação de segurança da versão oficial não entra na telemetria do banner.

Quando um erro é projetado do CLI para a UI, ele pode acompanhar uma estrutura `attribution` de fatos: `source`, `reason`, `providerId`, `modelId`, `providerKind`, `transport`, `statusCode`, `providerErrorCode`, `retryable`, `errorPhase`, `exceptionKind`. Todos esses campos são opcionais e servem apenas para atribuição de falhas e agregação de monitoramento; não podem mudar a visibilidade, o texto, os botões, o retry, a verificação de segurança ou o comportamento de feedback do banner existente. Eventos antigos e registros antigos persistidos que não têm attribution continuam funcionando pelos fallbacks de sempre.

Mantendo os campos existentes inalterados, `chat_error_banner` expande esses fatos por allowlist em `error_source`, `failure_reason`, `provider_scope`, `provider_id`, `model_id`, `provider_kind`, `transport`, `status_code`, `provider_error_code`, `failure_retryable`, `failure_phase`, `failure_exception_kind`. Providers embutidos podem manter IDs estáveis;
providers personalizados são sempre normalizados para `provider_scope=custom` e `provider_id=custom`, evitando que nomes personalizados pelo usuário gerem alta cardinalidade ou vazamento de privacidade. `model_id` só pode manter IDs de modelos embutidos estáveis explicitamente na allowlist de telemetria; modelos de provider personalizado e modelos de provider embutido que não casarem com a allowlist são escritos como `custom`, e quando provider ou model estão ausentes escreve-se string vazia.
O casamento e a saída da allowlist usam IDs normalizados em minúsculas, e um novo modelo embutido que ainda não entrou na allowlist precisa degradar por padrão para `custom`, sem ser repassado como está. É proibido enviar base URL/URL completa, header, token, corpo de requisição ou resposta, conteúdo de prompt/tool, stack, detail completo ou requestId. O ZCode reporta apenas fatos de atribuição, e não conclusões de política de monitoramento como `owner` ou `shouldAlert`.

`exceptionKind` precisa ser normalizado por allowlist na fronteira do adapter, e é proibido trazer o nome de um Error customizado para o protocolo ou para o ARMS como está.
`failure_reason=unknown` não equivale a campo de diagnóstico ausente; o Dashboard conta separadamente a cobertura de reason e a cobertura de diagnóstico de `source + errorPhase + exceptionKind`.

O attribution entra no snapshot junto com o estado autoritativo de erro de conversation, de modo que o live continuous e o persisted cold hydration devem obter a mesma atribuição para o mesmo erro; ele não dispara reenvio de telemetria. O desktop continua reportando apenas quando o banner está realmente visível, pelo reporter de `desktop-continuous`, e o celular `web-remote-replayable` não ganha nova capacidade de reporte de rede.

`source` precisa ser julgado pela fronteira onde o erro ocorreu e não pode ser adivinhado apenas pelo failure reason. A prioridade de decisão é: cancelamento do usuário e configuração local de provider antes do envio da requisição, validação de opções de requisição e exceção desconhecida de adapter viram `runtime`; falhas de transporte explícitas como TLS, proxy, conexão e timeout viram `network`; todo o resto só vira `provider` quando existe evidência upstream, isto é, resposta de provider, provider business error ou falha de validação do conteúdo retornado pelo provider. Um mesmo reason `invalid_request` pode assim ser classificado como `runtime` ou `provider` conforme já exista ou não resposta do provider; um reason de rede explicitamente continua `network` mesmo quando é carregado pela resposta do provider.

Quando um adapter error que já carrega atribuição estruturada passa de novo pela fronteira de estado terminal do runner, `source`, `reason`, `retryable`, `statusCode` e os campos de provider business error ficam a cargo da fronteira que primeiro obteve evidência válida; as fronteiras seguintes só podem completar valores faltantes e não podem sobrescrever com uma reclassificação mais grosseira. Os fatos da requisição atual como `attempt`, `requestId`, `traceId`, `providerId`, `modelId`, `providerKind` e `transport` continuam seguindo a fronteira atual do runner. Para preservar o stack original, a cause e as referências de objetos de erro já existentes no chamador, o preenchimento de contexto de um adapter error existente não pode substituir o objeto de erro; pontos de chamada como compact podem continuar acrescentando os campos de estágio que lhes pertencem explicitamente.

## Cadeias de disparo de negócio

### Assistant feedback

O V4 oferece o CAS command `setAssistantFeedback`:

```ts
{
  target: { kind: "assistantEntity"; entityId: string };
  feedback: "like" | "dislike" | null;
}
```

A CLI atualiza e persiste a row da assistant message. A UI faz atualização otimista e reverte quando o command falha; no clique, ela continua reportando imediatamente o formato antigo:

```ts
{
  eventType: "ck";
  eventRegion: "chat";
  elementName: "assistant_message_feedback";
  eventExtraDetail: { reaction: "like" | "dislike" | "none" };
}
```

Clicar de novo na mesma reaction escreve `null` e reporta `none`.

### Entrada de quota da session

O quota banner do V4 precisa restaurar visibilidade, dismiss, bloqueio de envio, refresh de entitlement e o painel de Upgrade.
O `coding_plan_upgrade_ck` só é reportado pelo módulo de compra original depois que o painel de compra existente foi confirmado como aberto, e a entrada de conversa é responsável por repassar:

- `eventRegion = app.session`
- `upgrade_source = session_quota_alert`

Os detalhes de product/cycle/pay/result e o resultado de pagamento dentro do módulo de compra não fazem parte do escopo de restauração desta refatoração de conversation; aqui só se verifica que o painel de Upgrade realmente abriu e que o contexto de funnel não foi perdido na entrada de conversa.

## Contrato de verificação

- Os golden tests precisam comparar o payload completo, incluindo números convertidos em string, strings vazias e valores zero fixos.
- O fake clock cobre first token, stall de 3000/3001, permission waiting e terminal exactly-once.
- Testes de schema/privacidade provam que corpo de texto, conteúdo de ferramenta e path/query de URL não entram no fact.
- Testes de gateway/service provam que evento live buffered acontece uma vez e initial/hydration/recovery acontecem zero vezes.
- O E2E de desktop verifica a entrada de produção com fetch mock de `/event/report` e um ring buffer de ARMS limitado, exclusivo de build de teste;
  o ring buffer não pode ser exposto nem persistido em builds de produção.

A numeração dos casos formais de conversation e as conclusões de poda estão no grupo `TEL` do case catalog e na matriz de cobertura E2E.
O diferencial de runtime entre versão nova e antiga, os casos de regressão atômicos e ocamadas de automação estão em
[`conversation-telemetry-differential-regression-plan.md`](../testing/conversation-telemetry-differential-regression-plan.md).

## Dimensão da flag de Memory (2026-09-17)

O `eventExtraDetail` de `send_btn`, `message_completion` e `agent_step` contém
`memory_enabled`: `"1"` ligado, `"0"` desligado e `""` indicando que um CLI/fato antigo não forneceu o estado.
Ele só representa a configuração de App Memory adotada na criação da instância de execução da sessão, e não indica que o memory do CLI acabou valendo, que houve acerto de leitura de memória ou que a escrita teve sucesso; não cria métricas de read/write nem muda o comportamento da flag de Memory.

A única fonte de dados é `ZCodeProtocolSessionRecord.memoryEnabled` da CLI, e a configuração atual do App não é relida no momento do envio ou da conclusão.
Alterar a configuração no meio do caminho não muda instâncias de execução já existentes; instâncias novas ou recuperadas a frio usam o valor de sua criação.

```text
会话记录 memoryEnabled
  ├─ accepted command ACK → prompt seed → send_btn / completion / agent_step
  └─ live turn.started → 后台任务 seed → completion / agent_step
                           └─ child step 继承来源 prompt 的值
```

O ACK e o live telemetry fact ganham o boolean opcional `memoryEnabled`; a ausência mantém unknown e não significa desligado por default.
O ACK de novo thread ou side chat lê o registro da session resultante, enquanto o envio comum lê o registro da session alvo.
Fatos comuns anteriores ao ACK continuam usando o buffer de pending fact existente; o fato de início de child usa diretamente o campo da sessão pai, sem esperar o ACK; dedup, FIFO e workspace identity permanecem iguais.
Tarefas em segundo plano não fabricam send_btn; subagentes herdam a flag do prompt de origem e não usam o próprio uso de ferramenta de memória como flag.
O transporte ganha apenas metadados sem corpo, e o snapshot/recuperação histórica da CLI não fabrica fatos de telemetria. O desktop mantém o live reporter de `desktop-continuous`, e o celular `web-remote-replayable` não instala reporter nem amplia o escopo de coleta de telemetria; o command ACK é compatível com o novo campo nas duas pontas.

Aceite: ligado e desligado validam o mesmo valor nos três eventos; após mudar a configuração, as instâncias existentes não derivam; turnos em segundo plano e child detached herdam; fatos anteriores ao ACK e ACKs duplicados mantêm o dedup de sempre; CLI antigo sem o campo deixa vazio; valores de protocolo não booleanos são rejeitados.
O E2E de Memory existente ganha as asserções dos três eventos para desligado por default e ligado em sessão nova.

### Limites de verificação deste trabalho

- 2026-09-17: o typecheck do projeto raiz e da CLI, o lint raiz e a verificação de architecture changed passaram.
- 112 testes unitários de UI/protocolo passaram; a regressão de fact de gateway/workflow deu 108 aprovados e 1 falha.
  O item que falhou é o `Core admission ACK 不等待 TurnStarted projection；旧 revision retry/file rewind 只 stale` já existente, e a reexecução com o gateway de staging sem alterações deu a mesma falha.
- O lint da CLI ficou bloqueado por erros `max-lines` já existentes em arquivos não modificados.
- O `before all` do Memory WDIO não conseguiu selecionar o modo Full access/yolo e não chegou às novas asserções deevento;
  esta execução não pode ser usada como evidência de aprovação ponta a ponta dosevento de desktop ligado/desligado. Não houve verificação em aparelho real nova no controle remoto do celular, e a fronteira desktop-continuous do reporter existente permanece inalterada.