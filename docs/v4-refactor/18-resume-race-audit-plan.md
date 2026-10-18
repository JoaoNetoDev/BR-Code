# Auditoria de Corridas de Resume / Activation do V4 e Plano de Testes

> Status: draft (2026-08-28)
> Escopo: cold activation de conversation do V4, projection hydration, ponto de entrada de compatibilidade legado `session/resume`, timeouts de query/comando e as fronteiras de recuperação de desktop-continuous / web-remote-replayable.
> Este documento é um plano de auditoria e de testes e não altera o código de runtime.

## 1. Objetivo e critérios de adjudicação

O que se procura não é "um Promise que pode ser lento", mas três classes de problemas demonstráveis:

1. Se a mesma session aparece com dois runtime / dois owners de projection.
2. Depois de timeout, abort, disconnect, deactivate ou runtime replace, a continuation antiga ainda consegue escrever no estado novo.
3. Quando a leitura falha ou o estado é incompleto, isso é tratado indevidamente como estado vazio, idle, unknown ou ACK de sucesso.

Fronteiras esperadas da cadeia de recuperação:

```text
request
  │
  ├─ server request lease（阻止 resident pool 回收）
  ├─ readyFlights[sessionId]（仅 cold activation + hydration）
  │      ├─ ColdSessionResumeCoordinator（runtime activation singleflight）
  │      └─ hydratePublisher（projection hydration singleflight）
  ├─ CommandInbox（command/query 唯一 admission authority）
  └─ publisher / durable store（projection 与历史事实）

timeout / abort / disconnect / deactivate
  ├─ 旧操作必须停止写入，或明确以 stale generation 被丢弃
  └─ 不能把“未读到”改写成“读到了空集合”
```

As fontes autoritativas precisam continuar distinguidas:

| Estado / fato                        | Fonte autoritativa                              | Estado similar não autoritativo                              |
| ------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------- |
| Se o runtime já foi ativado           | `context.sessions` + resultado da activation      | Se `readyFlights` existe, se o RPC do cliente já retornou  |
| Se o cold V4 pode liberar query/command | `readyFlights` do gateway (snapshot no início da chamada) | `context.sessions.has(sessionId)`                    |
| FIFO / idempotência de command       | `CommandInbox` do CLI + fatos duráveis de command | overlay otimista do renderer, hora de chegada do ACK do RPC |
| Nível de água da projection            | `seq/revision/logEpoch` do publisher              | epoch do ACK, tempo de conexão de rede                     |
| Corpo do histórico                   | resultado de leitura bem-sucedido do transcript / event store | array vazio construído após falha de `loadPersistedEvents` |
| Semântica de recuperação desktop/mobile | `clientMode` / `deliveryKind` confiáveis        | se o RPC retornou do remoto, palpite de profile pela UI    |

## 2. Problemas confirmados (reprodução dinâmica)

### R1 — falha de leitura persistente na hydration vira silenciosamente uma projection vazia (alta prioridade)

Local: `performHydration` em `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts`.

O código atual usa `catch` em `host.loadPersistedEvents`, reporta `v4.hydrate` e retorna
`{ events: [], synthesized: false, sourceEventSeq: 0 }`. Portanto o cold subscribe ainda consegue retornar
um primeiro quadro de sucesso com `ack.mode=snapshot` e `revision=0` quando a leitura em disco falha.

Sonda mínima de Vitest (já executada, falha com a implementação atual):

```ts
const host = makeHost();
host.sessions.clear();
host.resumeOutcome = "resumed";
host.loadPersistedEventsImpl = async () => {
  throw new Error("persisted read failed");
};
const gateway = makeGateway(host);

await expect(gateway.subscribe(subscribeParams())).rejects.toThrow("persisted read failed");
```

Resultado real: a Promise foi resolvida e o snapshot veio vazio. Isso viola o "erro de lifecycle original é preservado na exceção de hydration" da §4 de `docs/v4-refactor/17-cold-resume-runtime-activation.md` e o princípio de que falha de leitura persistente não pode ser disfarçada da §7.3 de `docs/v4-refactor/10-protocol-spec.md`.

Risco: o usuário vê "sucesso, mas sem histórico" e pode então enviar comandos sobre um nível de água errado; o replayable do celular ainda pode tomar esse snapshot vazio como baseline de recuperação.

### R2 — `session/resume` legado concorrente cria runtime duplicado (alta prioridade)

Local: `activateSessionForResume` em `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`.

Atualmente há apenas `await waitForDeactivation`, sem um activation flight por session. Duas requisições podem passar
ambas pela verificação `context.sessions.get` antes de `context.sessions.set(sessionId, record)`, executando cada uma
`materializeSessionRecord`; por fim o record escrito por último sobrescreve o anterior; os dois apps ainda podem seguir com
`resume()`, mas apenas um continua no registry.

Sonda com sqlite real + `ZCodeProtocolAgentServer` (já executada, falha com a implementação atual):

```ts
await Promise.all([
  requestResult(server, { id: "resume-a", method: zcodeProtocolMethods.sessionResume,
    params: { workspace, sessionId } }),
  requestResult(server, { id: "resume-b", method: zcodeProtocolMethods.sessionResume,
    params: { workspace, sessionId } }),
]);
expect(createdAppOptions.filter((o) => o.sessionId === sessionId)).toHaveLength(1);
```

Resultado real: 2 apps foram criados para o mesmo `sessionId`. O lease de residency em nível de processo do servidor só impede a reciclagem do resident pool; ele não serializa os dois resumes da mesma session.

Risco: event sink, configuração de modelo, `record.app.resume()` e o owner final em `context.sessions` se sobrescrevem; o snapshot devolvido por uma requisição pode vir de um runtime que já não é o owner do registry.

## 3. Candidatos de alto risco (ainda não corrigidos, precisam de testes dedicados)

### R3 — contrato de timeout de query do V4 não está conectado (alta prioridade)

`packages/shared/src/zcode-protocol-v4/core.ts` define
`PROTOCOL_V4_LIMITS.conversationQueryTimeoutMs = 10_000`, mas não há nenhum ponto de consumo no repositório.
As chamadas `commandsQuery`, `conversationUsage`, `rowsRange`, `plans`, `fileChanges`,
`fileRewindPreview` e de leitura/preview de anexo em `packages/services/src/zcode-agent/zcodeAgentService.ts`
não passam `timeoutMs` por requisição e, portanto, usam na prática o default de 3 minutos do
`ZCodeProtocolClient`.

O timeout também dispara `ZCodeAgentProcessManager.onRequestTimeout`, que descarta o client/processo inteiro
exceto em `workspace/cancelGenerateText`. É preciso verificar:

- se a query deve falhar em 10 segundos em vez de 180;
- se leituras longas de `fileChanges` / anexo devem compartilhar o timeout de query ou ter outro orçamento;
- se command / subscribe devem usar explicitamente um deadline independente, para que a conexão da constante de query não mate um turn normal por engano.

### R4 — `ColdSessionResumeCoordinator.clear()` não cancela a operação subjacente (média-alta)

`clear()` só limpa o map `flights` e não consegue interromper a Promise já entregue ao host. O
`cleanupSessionRuntime()` do gateway também remove `readyFlights` / `hydrationInFlight`; se um deactivate ocorrer
antes de a activation criar o hydration buffer, a continuation antiga pode entrar em `hydratePublisher` depois da limpeza.

O request lease do servidor de produção bloqueia a reciclagem normal do resident pool, portanto trata-se de uma corrida condicional no "deactivate explícito do gateway, destruição de conexão, fluxo de fechamento", que não pode ser descartada só com base no unit happy path.

### R5 — a fronteira entre attachment/begin e READY é fácil de ler errado (média)

`attachmentBegin` só chama `coldResume.ensureResumed` e não espera o READY / projection hydration do gateway;
`attachmentRead` / `attachmentPreviewSource`, por outro lado, passam por READY + hydration. O spec v4 atual lista
explicitamente `attachment/begin` como legacy boundary, sem incorporá-lo ao READY, mas `docs/runtime-tools/embedded-search-native-build.md`
ainda escreve que todas as entradas "entram no mesmo singleflight materialization". Isso é spec drift e é preciso decidir:

- se begin precisa apenas do runtime record; ou
- se as entradas que usam a projection logo após begin precisam esperar o mesmo READY.

Antes da decisão, não tratar isso como bug confirmado; deve haver testes de temporização begin‖subscribe‖command protegendo a fronteira.

### R6 — janela de registro do record após falha de activation/hydration (média)

O spec permite manter o estado de lifecycle após uma falha posterior ao registro do record e não promete rollback automático;
na implementação, o READY libera o map e a entrada seguinte pode ver `hasLiveConversation=true` e passar a chamar
`hydratePublisher` diretamente. É preciso testar o caso em que o primeiro READY falha depois do registro do record e verificar se o
resultado da segunda subscribe/query/command continua explicável e não gera projection vazia.

### R7 — resume legado / restore de UI sem generation por session

O restore de desktop em `packages/ui/src/lib/zcodeSessionRestore.ts` são dois RPC independentes, `resumeSession → readSession`; o
resume em `packages/services/src/zcode-session/zcodeSessionService.ts` ainda pode acrescentar correções de thought/model e broadcasts.
Na abertura concorrente, na reconexão e na troca de workspace, um snapshot mais antigo pode chegar atrasado e sobrescrever por broadcast um estado mais novo.
É preciso validar com dois restores deferred que "um resultado antigo atrasado não pode se tornar o fato final da UI/task-index".

### R8 — `waitForSessionIdle` com dupla authority + 5 segundos fixos

`session-flow.ts` faz polling simultaneamente de `record.activeAbortController` e de
`runtime.getActiveForegroundExecutionId()`. Os dois têm ordens de liberação diferentes e um deles é um campo antigo de compatibilidade;
após 5 segundos lança `V4SessionIdleTimeoutError`, mas não há generation/operation token dizendo quem ainda tem o direito de execução após o timeout.
É preciso cobrir quatro ordenações: stop→novo turn, troca do runtime execution id, liberação atrasada do controller antigo e o limite de 5 segundos.

### R9 — falha de leitura de session_entries rebaixada para vazio (média-baixa)

`v4-bridge.ts` retorna `[]` quando a verificação de conclusão de `sessionEntries` falha, e a hydration principal também prossegue.
Isso difere de R1: afeta apenas o estado derivado de goal/verification, mas ainda pode confundir pending/paused/complete com "sem objetivo".
Deve-se distinguir "fato derivado opcional ausente" de "leitura de corpo/timeline que precisa falhar".

### R10 — uso global seleciona qualquer client ativo (baixa)

`getAppUsageStats` usa `activeClientsByWorkspaceKey.values().next().value`. É uma conveniência de reuso do store global,
mas o primeiro entry pode estar stale/disposed ou em provider sync. São necessários testes de process replace + query de uso concorrente,
confirmando se existe uma regra explícita de seleção/retry de client ativo.

## 4. Matriz entrada × estado × evento

| ID | Entrada                          | Estado inicial                     | Evento concorrente/timeout                                                     | Adjudicação que deve ser mantida |
| --- | -------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- |
| C01 | legacy `session/resume`          | cold, sem record                   | segundo resume da mesma session                                                | um owner de runtime; as duas requisições compartilham o mesmo resultado de activation |
| C02 | legacy `session/resume`          | cold                               | A define model, B define um model diferente                                    | não é permitido entrelaçar dois apps; o model final tem regra explícita de last-writer/serialização |
| C03 | V4 subscribe                     | cold                               | activation conclui, leitura da hydration falha                                | retorna erro de lifecycle/hydration, não snapshot vazio |
| C04 | V4 subscribe                     | cold                               | A em activation, B subscribe (desktop + mobile)                                | um READY; os dois delivery profiles só se dividem depois do ready |
| C05 | V4 subscribe                     | cold                               | `disposeSession` / deactivate durante a activation de A                        | A não pode reviver o publisher após a limpeza; ou a requisição falha explicitamente e pode ser repetida |
| C06 | rows/plans                       | cold                               | query e subscribe começam ao mesmo tempo                                       | a query só pode esperar um READY já registrado no início da chamada; não pode ler índice antigo/vazio |
| C07 | command/query                    | cold                               | command/query registra antes do map de READY                                  | ou o spec permite o snapshot no momento da chamada, ou é preciso um gate de entrada; o contrato precisa ser fixo e a ordem de microtask testada |
| C08 | attachment/begin                 | cold                               | begin‖subscribe‖command                                                        | validar a fronteira "só activation / sem hydration", sem gerar um segundo runtime implícito |
| C09 | attachment/read                  | cold                               | runtime já registrado mas projection sem hydrate                              | precisa passar por READY + hydration e não apenas olhar `sessionExists` |
| C10 | hydration                        | warm publisher                     | falha no persisted load                                                       | não tratar a falha como eventos vazios; se o warm publisher for mantido, é preciso dizer se o snapshot ainda é confiável |
| C11 | hydration                        | durante o load await                | chegada de um raw event ao vivo                                               | source cursor e buffer combinam sem perder eventos e sem criar gap permanente |
| C12 | command sendText                 | warm                               | timeout de 5 segundos do `waitForSessionIdle` e turn antigo terminando atrasado | o novo command não pode ser admitido por engano nem matar a geração seguinte de turn |
| C13 | command sendQueuedNow/edit       | warm                               | stop / troca do foreground execution id                                       | um stop antigo só pode ser noop e não pode abortar a nova execução |
| C14 | projection commit waiter         | raw gap                            | evento ausente chega depois do timeout de 25 segundos                        | o waiter fixa a falha e o evento atrasado não pode ser aplicado |
| C15 | physical wire                    | fragmento em trânsito               | recovery chega depois do assembly timeout de 30 segundos                      | o fail-closed só é liberado pelo recovery exato, e as fatias antigas online não poluem a nova geração |
| C16 | UI conversation store            | live                               | restart do runtime / replace do proxy / ACK de subscribe antigo atrasado      | a generation descarta ACKs antigos; a nova assinatura mantém o clientMode/deliveryKind corretos |
| C17 | UI restore                       | resume→read                        | o segundo restore conclui primeiro e o primeiro chega atrasado                 | o snapshot antigo não pode sobrescrever a nova generation |
| C18 | provider/model                   | cold resume                        | registry sync entrelaçado com resume/command                                  | a revision do provider registry e o model da session não podem retroceder |
| C19 | remote workspace                 | cold                               | mesmo path com workspaceIdentity diferente em paralelo                         | session, READY, cache e owner não se misturam entre workspaces |
| C20 | usage/query                      | múltiplos workspaces ativos         | primeiro client disposed / substituído                                        | escolher um client saudável; não tratar client stale como autoritativo |

## 5. Ordem de implementação dos testes

### Fase A: primeiro fixar as duas falhas já confirmadas

1. Adicionar a sonda R1 em `v4-gateway.test.ts`, primeiro registrando o estado atual com `it.fails` ou uma fixture de auditoria isolada, para não tratar
   "projection vazia" como regressão normal.
2. Adicionar a sonda R2 em `v4-cold-resume.test.ts`, afirmar o número de `createZCodeApp` da mesma session e o owner final do registry;
   esse teste deve falhar primeiro, e só então se discute o design de correção do activation owner por session.

### Fase B: completar o harness de timeout / cancelamento

Usar deferred gate + fake timers, sem depender dos 10/25/30 segundos reais:

- gateway: todas as permutações de READY, hydration, deactivate e dispose;
- services: afirmar o `timeoutMs` passado nas queries do V4 e se o process manager é descartado após o timeout;
- UI: deadline de assembler/recovery, generation de runtime e ACK/frame antigo após o replace.

### Fase C: permutações de estado finito e testes de propriedade

Para cada session, enumerar apenas as seguintes dimensões finitas:

```text
runtime = cold | activating | warm | hydrating | disposed | replaced
entry   = resume | subscribe | query | command | attachment
event   = resolve | reject | timeout | abort | disconnect | deactivate | restart
client  = desktop-continuous | web-remote-replayable
```

Começar com uma única session e no máximo duas entradas concorrentes em permutação completa; depois adicionar remote identity e child session. Cada permutação verifica apenas
invariantes, sem comparar temporizações internas inobserváveis. Se necessário, conectar essas dimensões a `packages/formal-proof`, mas sem fundir
`context.sessions`, READY e CommandInbox em um único estado abstrato.

## 6. Invariantes de aceitação

- O mesmo `workspaceKey + sessionId` tem no máximo um owner de runtime em qualquer instante.
- Antes de o cold READY terminar, queries/commands que já viram o READY não entram em um CommandInbox antigo; uma falha de READY não produz
  `unknown` falso nem projection vazia.
- Erro de leitura persistente é distinguível de "realmente vazio"; o log serve apenas para diagnóstico e não muda a semântica do erro.
- A continuation antiga depois de timeout/abort/disconnect não pode criar publisher, avançar revision nem enviar o quadro inicial.
- `desktop-continuous` mantém direct continuous; `web-remote-replayable` só se recupera por snapshot/gap/resync replayable.
- O isolamento de workspace sempre usa `workspaceIdentity?.trim() || workspacePath`, e o caminho é usado apenas como cwd de execução.
- Todo timeout tem owner, orçamento, propagação de cancelamento e tratamento de resultado atrasado; não se pode depender apenas do watchdog default de 3 minutos do client.

## 7. Registros de verificação atuais

- `node scripts/check-workspace-freshness.mjs`: aprovado; o branch atual está 31 à frente e 3 atrás de `origin/main`.
- Executados `v4-gateway.test.ts` + `v4-cold-resume.test.ts`: a baseline atual tem 4 falhas (3 de cold integration
  sendText e 1 de stale retry); essas falhas não foram introduzidas pelas sondas temporárias, mas o item de remote identity tem relação direta com C19
  e precisa de atribuição separada.
- Executadas as duas sondas temporárias R1 e R2 (deferred/sqlite real): ambas expuseram, como esperado, os problemas da implementação atual; os testes temporários foram removidos e
  nesta rodada não se modificou o código de runtime.

## 8. Resultados da execução C01–C20 (2026-08-28)

Esta rodada foi executada segundo a "matriz de cases finitos" e não alega exaustividade de todas as micro-temporizações de Promise. As novas sondas foram adicionadas apenas localmente e temporariamente aos arquivos de teste correspondentes e removidas depois; os arquivos de teste existentes foram executados integralmente por entrada relevante.

| Case | Resultado real       | Evidência / conclusão                                                                                                                                         |
| ---- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| C01  | Exposição de corrida  | Dois resumes legados do mesmo `sessionId` criaram 2 apps. Confirma R2.                                                                                        |
| C02  | Exposição de corrida  | Resumes concorrentes com `runtimeModel` diferente ainda criaram 2 apps; a configuração de modelo não substitui o activation owner.                                   |
| C03  | Exposição de erro semântico | A leitura de cold hydration lançou erro e ainda retornou um snapshot vazio de sucesso; confirma R1.                                                       |
| C04  | Aprovado             | Subscribes concorrentes de desktop continuous e celular replayable chamaram a activation apenas uma vez, e o primeiro snapshot é consistente.                    |
| C05  | Exposição de corrida  | Com `disposeSession` antes do fim da activation, a continuation antiga ainda criou o publisher e retornou snapshot; confirma R4/C05.                                 |
| C06  | Aprovado             | `rowsRange‖subscribe` e command/query dentro do READY compartilham o gate existente, sem activation duplicada observada.                                          |
| C07  | Aprovado, mas o contrato precisa ser mantido | Command registrado antes do READY retorna `proto.sessionNotFound`; essa é a semântica atual de "snapshot no momento da chamada", não espera automática.     |
| C08  | Aprovado             | `attachment/begin‖subscribe‖command` compartilham uma activation; a fronteira de begin não esperar hydration ficou fixada.                                        |
| C09  | Aprovado             | `attachment/read` espera activation do host + hydration da projection em caso detached/cold.                                                                  |
| C10  | Exposição de risco semântico | A falha de leitura persistente do warm publisher é engolida e ainda retorna snapshot, registrando o erro `v4.hydrate`; o impacto é menor quando o corpo não é limpo, mas erro/sucesso não são distinguíveis. |
| C11  | Aprovado             | A live queue/stream da janela de await da hydration volta para a projection, com seq monotônica.                                                                  |
| C12  | Aprovado             | O timeout de 5 segundos do `waitForSessionIdle` falha de forma fechada e não reenvia o item da fila; com o lock antigo não liberado, nenhum turn novo é disparado por engano. |
| C13  | Aprovado             | O promotion lease de stop/troca do foreground execution id impede a entrada antecipada de notification.                                                          |
| C14  | Aprovado             | Após o timeout de 25 segundos do commit da projection, a falha fica fixa e o raw event atrasado não é mais aplicado.                                               |
| C15  | Aprovado             | Os casos de recovery/fail-closed do assembly timeout de 30 segundos do physical wire passaram.                                                                    |
| C16  | Aprovado             | A camada de dados de session da UI descarta ACK/frame de generation antiga após restart do runtime / replace do transport.                                     |
| C17  | Parcialmente aprovado | O helper de restore retorna resultados correspondentes quando dois restores deferred se entrelaçam; mas ele próprio não tem owner compartilhado e não prova que o store/broadcast superior não é sobrescrito por um snapshot antigo. |
| C18  | Aprovado             | Passaram os casos de ordem provider registry → cold subscribe, cache de troca de modelo e proteção contra model stale.                                                |
| C19  | Parcialmente aprovado | Passaram os casos de isolamento de `workspaceIdentity` remoto na camada de UI/serviços; no cold-resume integrado, remote identity + sendText ainda cai na falha já existente deste branch. |
| C20  | Exposição de problema de seleção de baixo risco | O usage se liga a qualquer primeiro client ativo; se esse client for disposed durante a requisição, a requisição falha sem trocar automaticamente para o segundo client saudável. |

Verificação adicional de timeout: `PROTOCOL_V4_LIMITS.conversationQueryTimeoutMs=10_000` continua sem ponto de consumo;
o teste do watchdog de requisição default do `ZCodeProtocolClient` confirmou que o valor real default é 180 segundos. Portanto R3 é uma lacuna de contrato confirmada estaticamente, e ainda não
foi feito um teste de integração de query lenta com uma espera real de 10 segundos.

Resumo real dos testes desta rodada:

- 7 arquivos relacionados a bootstrap: 246 tests, 242 passed, 4 falhas existentes (3 de cold integration sendText,
  1 de stale retry/file rewind); as novas sondas C01/C02/C03/C05/C07/C08/C10 expuseram/passaram conforme a tabela acima.
- 4 arquivos relacionados a services: 118 passed.
- 6 arquivos relacionados a UI: 172 passed; mais a sonda temporária deferred de C17, aprovada.
- 4 arquivos de shared/client/task-index: 126 passed.

Portanto, atualmente R1, R2 e R4/C05 devem ser tratados como defeitos reproduzidos, C10 e C20 como riscos que precisam de decisão de semântica de produto,
e a falha de remote sendText em C19 deve ser atribuída separadamente desta corrida de resume.

## 9. Design de correção de R1, R2 e R4/C05 (spec prévio à implementação)

### 9.1 Owner de estado e fronteira

O estado não deve ser centralizado no gateway do V4 nem colocado no renderer. O ciclo de vida do runtime e a recuperação da projection são duas máquinas de estado distintas:

```text
workspaceKey + sessionId
        │
        ▼
┌──────────────────────────────┐
│ SessionActivationRegistry     │  CLI / protocol server，共享 legacy + V4
│ idle → activating → active    │
│       ↘ failed / cancelled    │
│ flight: promise + generation  │
└──────────────┬───────────────┘
               │ activation result（唯一 runtime owner）
               ▼
┌──────────────────────────────┐
│ V4 projection gate            │  gateway，仅负责 ready/hydration
│ idle → hydrating → ready      │
│       ↘ failed / cancelled    │
│ publisher / raw seq / buffer  │
└──────────────────────────────┘

deactivate / dispose
        │
        └─ invalidate generation + abort
             └─ 旧 continuation 检查 token 后只能 noop / reject
```

| Estado                                        | Local autoritativo                                                                                              | Responsabilidade que não deve assumir                        |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Se o runtime foi ativado, owner de record/app | `context.sessions` + `SessionResidentPool`, com escrita serializada pelo `SessionActivationRegistry`              | `readyFlights` do gateway, overlay pending da UI             |
| Coordenação de concorrência de activation     | `activationFlights` compartilhado pelo protocol server/bootstrap, com key `workspaceKey + sessionId`           | ficar só no gateway do V4 (o `session/resume` legado contorna)|
| Hydration/READY do V4                          | projection state, `readyFlights`, publisher/raw sequence do gateway                                          | decidir inversamente se o runtime existe                    |
| Histórico durável                             | session/event store persistido                                                                                  | tratar falha de leitura como array vazio                    |
| Admissão/idempotência de command               | `CommandInbox` do CLI + fatos duráveis de command                                                             | ACK do renderer ou uma segunda fila criada pelo gateway     |
| Filtragem de requisições antigas na UI         | generation/pending overlay local da UI                                                                         | ser a fonte da verdade de session/runtime                   |

`workspaceKey` precisa ser uniformizado como `workspaceIdentity?.trim() || workspacePath`; para workspace remoto é preciso propagar
`workspaceIdentity` e `remoteSessionId`, e não usar apenas o caminho ou um `sessionId` cru como activation key.

### 9.2 R1: a hydration persistida precisa falhar de forma fechada

O `performHydration` atual converte a exceção de `loadPersistedEvents` em uma projection vazia de sucesso. Isso disfarça "falha de leitura"
como "histórico realmente vazio" e faz o assinante receber `ack.mode=snapshot, revision=0`.

Contrato de correção:

1. `performHydration` preserva o cause original do erro, converte-o em um typed V4 fault com session/key e o lança para cima; não pode retornar
   `events: []` como fallback de erro.
2. O gateway registra por key `idle | hydrating | ready | failed | cancelled` e a generation. Em caso de falha, limpa **apenas o mesmo flight**,
   sem criar publisher, sem escrever initial frame e sem avançar revision; a próxima requisição tenta de novo com uma nova generation.
3. O "resultado vazio bem-sucedido" e a "falha de leitura" do durable store precisam ser distinguíveis em tipo, log e semântica de wire. O log serve apenas para diagnóstico e não pode
   reescrever o resultado do protocolo.
4. Se já existe um warm publisher saudável, é preciso escrever no contrato de chamada se é permitido continuar devolvendo o snapshot antigo: entradas que
   precisam de uma leitura durável nova ainda devem falhar; não se pode engolir o erro incondicionalmente. Desktop `continuous` e mobile `replayable` respeitam a mesma fronteira fail-closed.

### 9.3 R2: colocar o single-flight de activation no owner de runtime compartilhado

O `activateSessionForResume` atual não tem promise compartilhado entre `waitForDeactivation`, leitura persistida e materialize, e
dois resumes legados podem ver "sem record" ao mesmo tempo, criar cada um seu app e o último `context.sessions.set` sobrescrever o anterior.

Contrato de correção:

1. Adicionar um `SessionActivationRegistry` (ou owner compartilhado equivalente) em nível de bootstrap/protocol server, com API que inclui pelo menos
   `ensureActivated(key, hints, signal)` e `invalidate(key, reason)`.
2. `ensureActivated` faz um get-or-create do flight de forma síncrona antes do primeiro `await`; callers seguintes só podem aguardar a mesma promise.
   Dentro do flight executa-se por completo: esperar deactivation → consultar `context.sessions` de novo → load/materialize → registrar record/app →
   `resume`. O `session/resume` legado, o cold gate do V4 e a ponte attachment/host precisam chamar esta entrada.
3. O finally só pode limpar o map com verificação de identity/generation, e um flight antigo não pode limpar um flight novo. Falha não guarda promise rejeitada;
   a próxima requisição pode tentar de novo com um flight novo.
4. Hints concorrentes de `runtimeModel` não podem mais ser last-writer-wins. Recomenda-se que o model persistido seja o canonical; sem model persistido,
   o primeiro activation caller decide, e callers conflitantes posteriores não podem reescrever o runtime já ativado (se o produto precisar de feedback explícito, adicionar um
   typed fault `session.activationConflict`). Essa estratégia precisa entrar no spec de protocolo e nos testes.
5. Se, após uma activation bem-sucedida, a generation já estiver inválida, o app não pode ser registrado como owner atual; deve-se fazer best-effort close/cleanup do
   app recém-criado e devolver cancelled/stale a quem esperava, em vez de deixar um vazamento de runtime invisível.

`readyFlights` pode continuar existindo, mas ele é apenas a "barreira de projeção V4 de activation + hydration"; não pode se tornar um segundo owner de runtime,
nem permitir que o gateway materialize a session por conta própria.

### 9.4 R4/C05: cancelamento, geração e continuation atrasada

O `ColdSessionResumeCoordinator.clear()` atual só limpa o map e não cancela a Promise; `disposeSession`/`deactivateSession`
também não invalidam a continuation que está em activation/hydration, de modo que após o dispose a continuation antiga consegue recriar o publisher
e emitir o snapshot.

Contrato de correção:

1. Os flights de activation e hydration carregam `{ operationId, generation, AbortController, state }`. `disposeSession`,
   `deactivateSession` e o dispose do gateway chamam primeiro o `invalidate(key)` compartilhado e só depois removem publisher/buffer e demais estados derivados.
2. Verificar o token antes e depois de cada await capaz de produzir efeito colateral, cobrindo pelo menos: conclusão do load, criação do buffer, `ensurePublisher`,
   escrita em `hydratedSessions`/`rawSequenceStates` e flush do initial frame. Com token não current, só é permitido noop/reject.
3. Passar o signal para as APIs de host/store/app que aceitem `AbortSignal`; quando uma Promise de terceiro não pode ser cancelada, a verificação de generation continua sendo
   a barreira de segurança obrigatória.
4. Se o dispose ocorrer enquanto a activation ainda não terminou, o assinante precisa receber um typed cancelled/disposed error e não pode receber snapshot com sucesso.
   Se o app subjacente só for criado depois, o activation owner precisa fechá-lo, e o finally antigo não pode tocar no estado da nova generation.
5. `clear()` não deve fazer apenas `flights.clear()`; no mínimo, deve cancelar e marcar todos os flights por key, e a limpeza precisa estar pareada com a identity do flight.

### 9.5 Ordem de implementação e testes obrigatórios

Primeiro transformar as sondas temporárias atuais em testes permanentes e só depois alterar a implementação:

- R2: repetir C01/C02 (mesmo/diferente model), afirmando que o número de apps criados é 1, que a identity do record é única e que o comportamento em caso de hint conflitante é determinado.
- R1: C03/C10 — falha de leitura precisa rejeitar sem frame/escrita de revision; depois de corrigir o store, uma nova generation consegue tentar de novo com sucesso; histórico vazio bem-sucedido continua retornando normalmente.
- R4/C05: executar dispose/deactivate/dispose do gateway antes e depois de cada janela de await de activation/hydration, afirmando que não há publisher,
  initial frame, escrita em map antigo nem vazamento de runtime stale; cobrir também a ordem em que o finally do flight antigo é posterior ao do novo.
- Regressão: entradas concorrentes de desktop `desktop-continuous` e web `web-remote-replayable`, remote identity, attachment e
  command FIFO passam todas pelo mesmo activation owner, sem espalhar a semântica de recuperação replayable para a cadeia principal do desktop.

Na implementação, primeiro adicionar os testes unitários/integrados acima e só então alterar o código de runtime; ao final, executar `pnpm typecheck`, `pnpm lint` e os E2E afetados.