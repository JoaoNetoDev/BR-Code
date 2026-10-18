# Reconstrução da sessão de prewarm de rascunho após a troca de runtime

- Data: 2026-08-20
- Branch: `fix/draft-prewarm-runtime-rebuild` (baseado em `feat/cua-merge-0819`)
- Status: design confirmado, aguardando implementação

## Contexto

Os usuários relataram dois fenômenos, e o diagnóstico de causa-raiz confirmou que são as duas pontas da mesma cadeia:

1. **Imagem não sobe** (dev) — depois de adicionado o anexo à caixa de entrada, ele fica parado e só pode ser removido; não há nenhum `attachmentBeginV4` no log.
2. **Depois de enviar, com o controle do computador ficando verde, o envio falha** (produção) — após o upload da imagem terminar com sucesso, clicar em enviar falha.

### Causa-raiz

O CUA Helper se tornar ready dispara a reciclagem incondicional do agent runtime (o comentário de design em `packages/services/src/node.ts:1094-1102` explica que isso serve para reciclar agents stranded que receberam `BROKER_UNAVAILABLE`). A reciclagem leva junto a sessão recém-criada na generation 1, ainda não persistida:

```
10:42:46.139  attachmentCommitV4 OK                     upload da imagem concluído (gen1)
10:42:46.340  cua helper ready pid=33314                「电脑控制变绿」
10:42:46.991  agent process exited pid=33308            reciclagem do stranded agent
10:42:49.531  agent process started runtimeGeneration=2 novo runtime
10:42:50.091  attachmentBeginV4 FAIL  sessionNotFound: sess_e0b036a8
10:42:50.129  subscribeConversationV4 FAIL  sessionNotFound: sess_e0b036a8
```

No estado de rascunho, `effectiveSessionId = sessionId ?? prewarmSessionId` (`SessionPane.tsx:1487`); quando `sessionId === null` o resultado depende inteiramente da sessão de prewarm. Depois que a sessão de prewarm desaparece:

- `SessionPane.tsx:1637` chama `prewarmBinding.discard()` quando a assinatura dá erro;
- `discard()` define `blockedInvalidationVersion = current.invalidationVersion` (`useDraftSessionPrewarm.ts:354`);
- `reconcile()` retorna imediatamente quando `blockedInvalidationVersion === requestedVersion` (`:313-315`), **não reconstruindo mais na mesma versão**;
- assim `prewarmSessionId` fica permanentemente null e o anexo trava em `waitingSession`, ou seja, o fenômeno 1.

No cold start, `createSession` falha com `ZCode Protocol client disposed` (`useDraftSessionPrewarm.ts:139-144` só emite warn, sem retry) e chega ao mesmo estado terminal.

## Escolha da abordagem

Já confirmado na discussão: **tolerar a reciclagem e compensar depois**, em vez de evitá-la no lado de services.

Motivo: não se altera a semântica de reciclagem da camada de services (que este branch introduziu de propósito para corrigir «as ferramentas CUA nunca carregam»), concentrando o risco no renderer; o custo é o usuário ver um reenvio breve.

Alternativas rejeitadas/adiavadas:
- distinguir a origem do gatilho no lado da reciclagem (`onHelperHealthy` primeiro ready de cold start vs `onHelperCredentialsRotated`), para que um workspace em serviço não seja reciclado;
- acrescentar ao `ZCodeAgentService` uma consulta de turno ativo, conectando de fato `hasActiveTurnRef` (`node.ts:1467`, hoje `() => false`).

As duas não conflitam com esta abordagem e podem ser avançadas depois separadamente.

**A origem do gatilho de reciclagem não é única**, e esse é o argumento decisivo para escolher «compensação posterior» em vez de «bloquear no lado da reciclagem». Além do primeiro ready de cold start, o caminho de recuperação do liveness watchdog também recicla. Log de dev de 2026-08-20 12:26:

```
12:26:43.617  cua helper liveness: Helper unreachable (attempt 3); triggering resolver recovery
12:26:44.980  cua helper ready pid=97629
12:26:45.489  ZCode agent cleanup ... reason='workspace-dispose'
              runtimeIdentity: /Users/dev/.zcode/workspace/default:4:57273
```

A reciclagem dispara 509ms após o helper ready, e o workspace já está na generation 4. Se o bloqueio fosse feito no lado da reciclagem, seria preciso cobrir simultaneamente os três caminhos `onHelperHealthy`, `onHelperCredentialsRotated` e a recuperação por liveness, com uma superfície de alteração significativamente maior que a da compensação no renderer.

## Objetivos

- Após a troca de runtime, o estado de rascunho obtém automaticamente uma sessão de prewarm válida no novo runtime.
- Durante a troca o envio é proibido; o bloqueio é removido após a reconstrução bem-sucedida ou o timeout.
- Os anexos são reenviados automaticamente para a nova sessão após a troca, sem o usuário precisar refazer o trabalho manualmente.

## Não objetivos

- Não alterar a semântica de reciclagem do lado de services nem mexer em `hasActiveTurn`.
- Não tratar a recuperação do estado de sessão formal (`sessionId !== null`) — esse caminho é responsabilidade do `cold-session-resume.ts` da CLI.
- Não mudar a interface pública de `useDraftSessionPrewarm`.

## Design

### 1. Gatilho e cadeia de reconstrução

Reaproveita o caminho já existente, sem criar uma nova assinatura:

```
transport.onRuntimeRestart                         SessionPane props:446, já filtrado por workspaceKey
  → novo effect (apenas sessionId === null)
  → invalidateDraftRuntime(workspacePath, workspaceIdentity)    já existe: zcodeSessionStoreWorkspaceSlice.ts:408
  → draftRuntimeInvalidationVersion + 1
  → reconcile(): limpa blockedInvalidationVersion → retireCurrent → startCurrent
  → onReady → novo binding → prewarmSessionId → effectiveSessionId
```

O único código novo **desta seção** é o effect no SessionPane (o gate de envio e as mudanças de anexos estão nas seções 2, 3 e 4). A reconstrução, a liberação do gate, o single-flight e a limpeza da sessão antiga são lógica já existente no coordinator:

- `reconcile()` limpa `blockedInvalidationVersion` quando `requestedVersion` muda (`useDraftSessionPrewarm.ts:297-302`), liberando o gate permanente definido por `discard()`;
- `retireCurrent()` → `controller.dispose()`, e `dispose()` só faz `deleteSession` quando `promotionState === "draft"` (`:169`). **Um envio em andamento (`pending`) que encontre uma troca não apaga por engano a sessão em execução**; essa proteção já existe.

**O estado de sessão formal não dispara**: quando `sessionId !== null`, `invalidateDraftRuntime` não é chamado.

### 2. Gate de envio

Mantém-se o estado `draftRebuilding` dentro do SessionPane, sem mudar a interface do hook (`binding === null` não consegue distinguir «em reconstrução» de «retorno permanente», mas o SessionPane sabe se o invalidate foi disparado por ele mesmo).

- define `true` ao invalidar;
- define `false` quando um novo `prewarmBinding` chega;
- **após timeout de 5s** define `false`, retornando ao caminho existente de «criar sessão formal no envio» (branch `beginPromotion` em `SessionPane.tsx:1829` / `:1886`);
- nova troca durante a reconstrução → reinicia o timer;
- conecta ao cálculo de `disabled` em `SessionPane.tsx:3494`;
- acompanha um texto explicativo, para que o botão não fique cinza em silêncio.

Base do valor de timeout: medido `start → ready` do agent em torno de 550-650ms, e mais centenas de ms para `createSession`; 5s tem folga suficiente sem fazer o usuário esperar demais.

**Desabilitação permanente não é permitida**: uma reconstrução que falhe precisa ter retorno, senão, com o runtime continuamente anômalo, o usuário não consegue enviar nenhuma mensagem.

Timeout e reconstrução bem-sucedida não são mutuamente exclusivos: depois que o timeout libera o envio, um `prewarmBinding` tardio ainda chega normalmente e atualiza o `effectiveSessionId`, e os anexos são despertados para reenvio. O timeout só libera o gate, não cancela a reconstrução.

### 3. Corrida no reenvio de anexos

Na troca, duas cadeias mexem nos anexos ao mesmo tempo:

- o callback `onRuntimeRestart` em `useComposerAttachments.ts:461` — limpa o ref, `autoRetryCount + 1`, enfileira por `target.sessionId`;
- o effect em `:441` — quando `attachmentSessionId` fica com valor verdadeiro, enfileira de novo o que está em `waitingSession`.

O problema é que `:461` lê `targetsRef.current`, que é um **valor antigo escrito durante a renderização** (`:192-199`). Quando o evento de troca chega, ele ainda contém o sessionId já inválido, então enfileira com o id antigo — exatamente a origem do `sessionNotFound` no log.

Desacoplar as duas cadeias:

- `:461` deixa de decidir o enfileiramento por `target.sessionId` e **sempre coloca em `waitingSession`** (após a troca o id antigo é necessariamente inválido), deixando a unificação com `:441`;
- novo `restartEpoch` (state interno do hook, incrementado no callback `onRuntimeRestart`), adicionado às dependências do effect em `:441`, para forçar uma nova varredura de `waitingSession` e o enfileiramento após a troca.

`restartEpoch` é necessário: no estado de sessão formal, após o restart do runtime o `attachmentSessionId` não muda, então um effect que dependa só dele não reexecuta e o anexo ficaria permanentemente em `waitingSession`.

Duas categorias de anexo não são afetadas (já puladas em `:470-476`):
- `localZeroCopy` (arquivo local arrastado, em que o `ref` é diretamente o caminho local e nunca é enviado) — isso explica por que o problema se concentra em imagens coladas ou capturadas, que não têm `localPath`;
- `referenceOwnership === "session"` (já enviada junto com a mensagem).

### 4. Cota de reenvio

Hoje `:481` considera `failed` assim que `autoRetryCount >= 1`. O reenvio após a troca não é «uma re-tentativa de upload que falhou», mas «um reenvio porque a sessão mudou»; usar o mesmo contador faria a troca consumir a cota de retentativa de upload visível ao usuário.

**Passa a haver dois contadores separados:**

- `autoRetryCount` mantém a semântica original (retentativa automática de upload que falhou), com limite 1, sem alteração;
- novo `runtimeRebuildRetryCount`, incrementado apenas quando um reenvio é disparado por troca no estado de rascunho, com limite 5.

A razão para não mesclar os contadores é que o número de trocas foi maior do que a estimativa inicial: no log de dev de 2026-08-20 12:26 o mesmo workspace já está em `runtimeGeneration=4` (3 trocas), e a origem do gatilho de reciclagem não é única (ver «Escolha da abordagem»); um limite de 3 em um contador único seria esgotado no uso normal e geraria falha indevida.

A deduplicação por `restartEpoch` garante que **uma mesma troca dispare apenas um reenvio**; o limite 5 serve apenas como rede de segurança quando o helper falha repetidamente.

### 5. Testes

| Camada | Caso |
| --- | --- |
| coordinator | retire + reconstrução quando `invalidationVersion` incrementa; `blockedInvalidationVersion` é limpo |
| controller | `dispose()` não apaga a sessão no estado `pending` (proteção contra regressão) |
| attachments | coloca em `waitingSession` após a troca; enfileira quando o novo sessionId chega; também é despertado por `restartEpoch` quando o sessionId não muda no estado formal |
| attachments | não reenvia dentro do mesmo `restartEpoch`; só considera `failed` ao atingir `runtimeRebuildRetryCount` = 5, sem afetar `autoRetryCount` |
| Gate | desabilitado durante a reconstrução; liberado quando o novo binding chega; liberado no timeout com retorno |

Duas armadilhas locais conhecidas:

- se o timer de timeout for `unref`, o defeito fica mascarado pelo vitest runner (o próprio runner mantém o event loop vivo); é preciso validar com uma sonda em subprocesso tsx, não apenas com teste unitário.
- no lado desktop, `test/*.test.ts` não pertence a nenhum tsconfig, e o `pnpm typecheck` da raiz não cobre; mudanças que envolvam o desktop exigem verificação separada.

## Fronteiras e modos de falha

| Situação | Comportamento |
| --- | --- |
| Nova troca durante a reconstrução | `invalidationVersion` +1 de novo; o reconcile faz retire + criação novamente; o timer do gate é reiniciado |
| Troca com envio em andamento | `promotionState === "pending"`; `dispose()` não apaga a sessão; a sessão formal é responsabilidade do cold-resume |
| Troca de workspace | `invalidateDraftRuntime` é direcionado por `workspacePath` / `workspaceIdentity`, sem afetar os outros workspaces |
| Falha / timeout na reconstrução | libera a desabilitação e retorna ao caminho de envio sem prewarm; os anexos permanecem em `waitingSession` até que haja uma sessão válida |
| Falha na limpeza da sessão antiga | sem impacto — a sessão antiga já desapareceu junto com o runtime e o catch de `deleteCreatedSession` já ignora falhas |

## Riscos

- **Visibilidade do reenvio**: o usuário verá a barra de progresso do anexo voltar a 0 e reenviar uma vez. É comportamento esperado; é preciso garantir que o texto (`chat.attachments.upload.runtimeRestarted`) não pareça um erro.
- **Falso positivo no gate**: se `onRuntimeRestart` for disparado indevidamente em um estado que não é de rascunho, o envio ficaria desabilitado à toa por 5s. O effect é restringido com `sessionId === null` e isso é coberto em teste.
- **Esta abordagem não elimina a reciclagem em si**: o cold start do CUA Helper ainda recicla o agent, e o usuário ainda passa por uma troca de sessão. Eliminá-la por completo exige uma das duas alternativas adiadas acima.
