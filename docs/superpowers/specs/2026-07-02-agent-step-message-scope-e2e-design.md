# Design E2E de Message Scope do Agent Step

> Status (2026-07-15): a correção foi implementada; este documento é preservado como registro
> histórico de design E2E. O E2E formal original migrou junto com os testes do V4 para
> `manual-review/pending`; os fatos atuais de cobertura automática estão em
> `docs/testing/conversation-session-e2e-coverage-matrix.md`.

## Resumo da feature

| Campo                        | Valor                                                                                                     |
| ---------------------------- | --------------------------------------------------------------------------------------------------------- |
| Mudança                      | corrigir o problema de `message_completion` acumular erroneamente todo o histórico da session e travar o message scope com uma reprodução de falha em E2E |
| Superfícies visíveis ao usuário | nenhum comportamento novo de UI; valida o payload `agent_trace` de `/report`                              |
| Documentos existentes        | `docs/monitoring/business-monitoring.md`, `docs/monitoring/performance-telemetry-catalog.md`, `docs/conversation-session-case-catalog.md` |
| Donos de código existentes    | `packages/ui/src/lib/messageTelemetry.ts`, `packages/ui/src/hooks/useZCodeChat.ts`, `packages/ui/src/hooks/taskStreamEventHandlers.ts` |
| Fora de escopo                | queue/stop, sessões cruzadas, protocolo de recuperação replayable do celular, recebimento real do telemetry pelo servidor |

## Log de esclarecimentos

| Rodada | Pergunta | Resposta do usuário | Fronteira fixada | Necessita acompanhamento |
| ------ | -------- | ------------------- | ---------------- | ------------------------ |
| 1 | Cobrir o problema de acumulação de histórico (A), ou cobrir também o tool step ativo não finalizado (A+B) | A | validar apenas o message scope de `agent_step_cnt` | não |
| 2 | Usar reconciliação por logs, preload mock ou reescrita de endpoint | reconciliação por logs | reconciliar primeiro a partir de evidência observável local, sem depender de um servidor externo de telemetry | não |
| 3 | o renderer de produção desabilita logs locais, então o payload planejado não pode ser lido | usar o histórico de chamadas do mock de `net.fetch` do Electron como evidência local equivalente e mais forte | reconciliar os argumentos do transporte HTTP real do processo principal, sem reabrir logs de produção por causa do teste | não |

## Decisões de fronteira

| Fronteira                | Decisão                                 | Inclui                                            | Exclui / poda                                                       | Origem                                            |
| ------------------------ | --------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------- |
| Cadeia do cliente        | `desktop-continuous`                    | o session stream normal do renderer de desktop     | `web-remote-replayable`, recuperação por snapshot/gap               | usuário                                           |
| Forma da sessão         | duas rodadas contínuas na mesma session  | a segunda rodada precisa ver o histórico da primeira | sessões cruzadas, fork/edit/compact                                 | usuário                                           |
| Forma do step           | um generation step comum por rodada      | replay determinístico de texto puro               | reasoning, tool call, permission/elicitation                        | design                                            |
| Chave de reconciliação  | `talkId + messageId`                    | a mesma completion e seus eventos por step         | agregação apenas por talkId                                         | spec de monitoring                                 |
| Evidência               | argumentos de chamada do fetch de telemetry no processo principal do Electron | `agent_step` e `message_completion` no body HTTP final | resultado de persistência no servidor externo de telemetry | restrição de código + reconciliação local aprovada pelo usuário |

## Escopo de domínio

| Domínio                        | Inclui? | Por que pode mudar o comportamento                                                | Fontes principais            |
| ------------------------------ | ------- | ---------------------------------------------------------------------------------- | ---------------------------- |
| Comportamento de conversa/session | sim     | é preciso provar que as duas rodadas pertencem à mesma session e ambas concluíram     | catálogo/workflow de conversa |
| Monitoring/telemetry           | sim     | os campos medidos e a reconciliação por evento pertencem a `/report agent_trace`   | specs de monitoring          |
| Replay de provider             | sim     | as duas rodadas exigem respostas de texto puro, determinísticas e sem ferramentas  | workflow de fixture E2E      |
| Remoto/replayable do celular   | não     | o defeito de message scope pode ser reproduzido sem cadeia de recuperação          | poda definida pelo usuário   |

## Mapa de conceitos e donos de estado

| Conceito                     | Dono de estado                                                       | Evidência                                                                     |
| ---------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| telemetry do prompt atual    | UI `activePromptTelemetryByTask`                                    | o `messageId` da completion                                                    |
| ciclo de vida do agent step  | UI `agentStepTelemetryByTask`                                       | payload de `agent_step` com o mesmo `talkId + messageId`                      |
| histórico de mensagens da session | runtime da Agent/session + projeção da UI                        | a primeira rodada concluiu antes do envio da segunda; o mesmo `talkId`       |
| entrada do transporte de telemetry | renderer `reportAppTelemetryEvent` → main `createDesktopTelemetryFetch(net)` | o request body final no histórico de chamadas do mock de `net.fetch` do Electron |
| fronteira de observação E2E  | serviço Electron do WDIO                                            | histórico de chamadas de `browser.electron.mock("net", "fetch")`               |

## Design da correção de produção

`message_completion` e cada `agent_step` devem compartilhar o mesmo ciclo de vida de prompt ativo:

1. `activatePromptTelemetry()`, ao ativar uma mensagem de usuário, inicializa a agregação de steps da
   rodada e o `loop_index` começando em `1`.
2. cada step é acumulado apenas uma vez, no fechamento em `finalizeAgentStep()`; portanto
   `agent_step_cnt` é igual ao número de `agent_step` realmente reportado para o `message_id` atual.
3. o step `tool_call` fechado também acumula `tool_call_total`; ferramentas com falha ou timeout
   acumulam `tool_call_failed`, e o primeiro erro de ferramenta da rodada é mantido como fallback para
   a falha da completion.
4. `finalizePromptTelemetry()` lê apenas os valores agregados do prompt ativo e não percorre mais todos
   os `taskMessages` da session.
5. remover `FinalizePromptTelemetryInput.taskMessages` e os dois helpers de varredura do histórico; os
   chamadores não leem mais o message store para contar na completion.

Esse estado é mantido por `PromptTelemetryState`, enquanto `AgentStepTelemetryState` continua
responsável apenas pelo step ativo e pelo `loop_index`. A contagem acontece na saída única de
fechamento de step, mantendo a agregação da completion e os eventos reais por step com a mesma
origem e evitando inferir o ciclo de vida do stream a partir da projeção da mensagem final.

### Invariantes de contagem

- para qualquer `talk_id + message_id`, `agent_step_cnt` é igual ao número de `agent_step`
  efetivamente produzidos;
- o `loop_index` de uma mesma message cresce continuamente a partir de `1`; após a ativação de um
  novo prompt ele recomeça em `1`;
- `tool_call_total` é igual ao número de steps em estado final com `step_type=tool_call` na message
  atual;
- `tool_call_failed` é igual à quantidade daqueles com `status=fail/timeout`;
- nenhum step ou ferramenta da message anterior pode entrar na completion da rodada seguinte.

### Fronteiras de compatibilidade

- esta correção muda apenas a origem da agregação de telemetry da UI e não modifica stream, snapshot,
  queue, owner, relay, host ou protocolo;
- desktop continuous e web remote replayable agregam conforme o prompt que cada um ativa; a semântica
  de recuperação replayable não se espalha para a cadeia principal de desktop;
- eventos de ferramenta fora de ordem continuam usando a atribuição do fallback step e do permission
  waiting já existentes; a contagem só acontece quando esse fallback step é finalmente fechado.

## Combinações candidatas e poda

| ID do candidato | Estado                                              | Evento                        | Efeito esperado                                                                 | Status   | Motivo                                                            |
| ---------------- | --------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------- |
| R01              | mesma session de desktop, primeira rodada concluída | segunda rodada só com texto    | `agent_step_cnt` da segunda rodada é igual a 1, o número real de steps da mesma message | aceito   | reprodução mínima e estável do defeito de produção                |
| R02              | mesma session, segunda rodada com ferramenta        | segunda rodada concluída      | reconciliação completa de tool/reasoning/generation                              | podado   | pertence à cobertura de tipos de step posterior, não à fronteira mínima de A |
| R03              | duas sessions diferentes, uma rodada cada            | as duas rodadas concluídas    | contagem independente por session                                               | podado   | não passa pela condição de acumulação de histórico                |
| R04              | celular replayable envia depois de recuperar histórico | segunda rodada concluída   | a cadeia de recuperação continua contando por message                          | ignorado | semântica de alto risco entre dispositivos planejada à parte       |
| R05              | stop/error em execução                             | fechamento da completion      | reconciliação de step interrompido e completion                                 | ignorado | ciclo de vida de falha/terminal planejado à parte                 |

## Caso aceito

### R01: agent step da segunda rodada na mesma session isolado por message

Preparação:

1. iniciar o aplicativo de desktop isolado com `prepareConversationE2E()`;
2. dois prompts com markers estáveis `E2E_AGENT_STEP_MESSAGE_SCOPE_*` correspondem cada um ao
   fixture local do caso;
3. o fixture retorna apenas um content block de texto puro por rodada, portanto cada rodada produz
   deterministicamente um step `generation`.

Ação:

1. enviar a primeira rodada e esperar `idle`;
2. enviar a segunda rodada e esperar `idle`;
3. antes do envio, mockar o `net.fetch` do Electron e devolver uma resposta de sucesso; ao final,
  analisar o request body do endpoint de telemetry a partir do histórico de chamadas do mock.

Asserções:

1. as Completions da primeira e da segunda rodada têm o mesmo `talkId` e `messageId` diferentes;
2. na segunda rodada, com o mesmo `talkId + messageId`, há exatamente um `agent_step`, do tipo
   `generation`, com `loop_index=1`;
3. `message_completion.agent_step_cnt` da segunda rodada deve ser `"1"`;
4. sob o defeito atual, a asserção 3 resulta em `"2"` e o teste falha com um descasamento de contagem
   explícito.

Camadas de evidência:

- UI/session: as duas rodadas voltam a `idle` e a segunda reutiliza a session da primeira;
- Provider: os dois markers estáveis atingem o replay local do caso;
- Telemetry/transport: reconciliação por `talk_id + message_id` dos steps individuais e da completion
  no body HTTP final.

## Notas de passagem para o E2E

- Spec: `packages/desktop/test/e2e/conversation-session/conversation-session-agent-step-message-scope.test.ts`
- Fixture de Provider: `packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-agent-step-message-scope.json`
- Timing: `fast-text`
- Classificação da requisição: as duas requisições com marker são `main`
- Sintético: sim; a resposta de texto puro estável fixa o número de steps por rodada, e o manifest
  precisa registrar `syntheticReason`
- Fixture de sistema de arquivos: nenhum
- Promoção: com base em revisão manual, foi convertido em caso formal; após a correção o status é `covered`
- Verificação: artefato GREEN `desktop-e2e-20260703-090147-683`
- Docker: o caso formal passou pelo replay isolado local; a admissão no preset Docker continua
  seguindo o processo de admissão independente
- Risco de revisão: o envio de telemetry é assíncrono, então o teste precisa fazer polling das
  chamadas do mock e não pode depender de um sleep fixo; o mock substitui apenas o `net.fetch` do
  Electron, enquanto o replay de provider é tratado pela cadeia HTTP independente do agent