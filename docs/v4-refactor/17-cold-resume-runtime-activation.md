# V4 cold resume: ativação de runtime e desaclopamento do snapshot legacy

> Estado: aceito em 2026-07-24; em 2026-08-13 foram acrescentados os contratos de materialização única e de nível de água READY único; em 2026-10-09 foram acrescentados o histórico pronto e o runtime pronto.
> Escopo: primeira subscrição fria de conversation do V4; não remove o protocolo legacy `session/resume` nem migra a subscrição realtime do Bot.

## 1. Problema

Antes da mudança, após o cold start da CLI, ao abrir a sessão persistente pela primeira vez, a subscrição do V4 reutilizava indiretamente o legacy `resumeSession`:

```text
v4/conversation/subscribe
  -> legacy cold-resume adapter
  -> legacy resumeSession
       ├─ 创建 record / runtime
       ├─ 恢复 workspace、模型、thought、mode、restoreWarning
       ├─ app.resume() 与事件接线
       └─ 构建完整 ZCodeSessionStateSnapshot  ──> 返回值被 V4 丢弃
  -> V4 durable transcript hydration
  -> getSessionUsageSeed
       └─ legacy readSession/full snapshot   ──> 只读取 runtime.contextUsage
  -> V4 initial snapshot
```

Aqui se misturavam duas responsabilidades:

1. **ativação de runtime**: da qual os comandos subsequentes e o config seed do V4 dependem;
2. **materialização da camada de apresentação legacy**: que existe apenas para servir a resposta antiga de `session/resume`.

O V4 já gera o seu próprio snapshot autoritativo a partir de durable transcript, session entry, memory event e `ProductProjection`. Continuar construindo o snapshot legacy não aumenta a capacidade de recuperação e apenas faz o tempo consumido crescer repetidamente com a escala de messages/parts históricos.

## 2. Fronteira de objetivo

```text
                         ┌─ legacy session/resume
persisted session        │    -> activateSessionForResume
        │                │    -> build legacy snapshot -> legacy caller
        v                │
activateSessionForResume ┤
  ├─ persisted metadata  │
  ├─ workspace identity  └─ V4 cold subscribe
  ├─ record + event sink      -> activateSessionForResume
  ├─ model/thought/mode       -> V4 durable hydration
  ├─ restoreWarning           -> narrow context-usage seed
  └─ app.resume()             -> V4 initial snapshot
```

`activateSessionForResume` é uma primitiva de ciclo de vida independente de profile:

- quando o record já existe, não repete `app.resume()` nem a ligação de eventos; um `runtimeModel` explícito ainda é atualizado conforme a semântica antiga;
- quando o record não existe, preserva integralmente todo o comportamento original de `resumeSession` antes de `snapshot(...)`;
- erros como store sem session, modelo indisponível ou falha no resume do runtime são iguais aos do caminho antigo;
- não faz ramificação por `desktop-continuous` / `web-remote-replayable`. Ambos se separam apenas no profile de entrega do publisher do V4, depois da ativação concluída; o incremento historyFirst é definido em §4.1.

O legacy `resumeSession` continua como camada de compatibilidade:

```text
resumeSession = activateSessionForResume + snapshot
```

Portanto, a semântica dos chamadores antigos de protocolo, das leituras de estado legacy do Bot ainda não migrado e dos testes não muda; desta vez apenas fazemos com que a subscrição fria do V4 chame a primitiva activation-only.

## 3. Funcionalidade que não pode ser perdida

| Invariante                      | Restrição                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------- |
| historyReadyBeforeRuntime       | conexões que suportam historyFirst publicam primeiro o histórico persistido; a execução e a leitura do runtime config/usage seed só são liberadas depois que o runtime conclui |
| historicalConfigPreserved       | model, thought e mode históricos continuam sendo restaurados com prioridade da selection durable local da sessão |
| restoreWarningPreserved         | quando o modelo histórico está indisponível, ainda se pode ler o histórico, mas o `sendText` seguinte é recusado pelo mesmo gate de restore warning |
| workspaceIdentityPreserved      | a recuperação remota continua usando o `workspaceID` persistido; a identity key não degrada para `workspacePath` |
| eventWiringPreserved            | o event sink, a persistência e a ligação de MCP/runtime estabelecidos por `createRecord` não mudam           |
| timestampsAndParentPreserved    | `createdAt`, `updatedAt` e `parentSessionId` continuam sendo preenchidos a partir da sessão persistente    |
| v4HistoryAuthorityUnchanged     | rows, reasoning, tool, plan, goal, queue e interaction continuam sendo restaurados pela materialização durable do V4 + memory tail |
| deliveryBoundaryUnchanged       | o desktop mantém continuous; mobile/Web remote mantém a restauração replayable por gap/snapshot           |
| restartDiscardUnchanged         | input do runtime anterior que não chegou a estado terminal continua sendo discarded pelo delivery ledger; não pode ser reproduzido automaticamente só por ter removido o snapshot legacy |
| legacyResumeResponseUnchanged   | `session/resume` continua devolvendo um snapshot legacy completo e equivalente em schema                   |
| v4ColdReadySingleOwner          | o gateway do V4 é dono do histórico pronto e do runtime pronto; a mesma sessão faz single-flight na mesma inicialização |
| hydrationBoundaryUnchanged      | `hydratePublisher` continua responsável apenas pela hydration da projeção e não assume as pré-condições de ativação de runtime existentes em cada entrada |
| registryIsNotV4Readiness         | `context.sessions` apenas registra o record; query/command não podem ser liberados com base nisso antes de a operação fria do V4 concluir |

Pending permission/elicitation e a queue atual do runtime não são fatos duráveis que um processo antigo possa ressuscitar sem condição. Não os adicionamos, removemos nem reescrevemos; a memory event tail do V4 do novo runtime continua sendo a autoridade online.

## 4. Projeção estreita de usage

A cold recovery do V4 não pode chamar `readSession` de novo só para obter `runtime.contextUsage`. A projeção estreita precisa reutilizar o mesmo critério de cálculo atualmente usado pelo snapshot legacy:

```text
runtime projection contextUsed/contextWindow
  + active-branch persisted context usage/cache
  + latest matching main-turn ModelComplete breakdown
  -> ZCodeSessionContextUsage
  -> SessionUsageSeed
```

Os seguintes detalhes precisam ser preservados:

- o `contextUsed` do runtime tem prioridade quando é diferente de zero; caso contrário há recorrência para os assistant tokens mais recentes do active branch ou para a compact boundary, conforme o critério descrito em `docs/context-window-usage-state.md`;
- o resumo de cache conta apenas assistant messages não-summary do active branch; a compact boundary seed não ressuscita o cache anterior à compactação;
- o breakdown aceita somente o `ModelComplete` mais recente que seja de main-turn e tenha `used/contextWindow` alinhados ao meter;
- used/window não positivos retornam `null`, preservando a semântica de “ainda sem nenhuma ida e volta de modelo”;
- não lê/mapeia legacy messages, settings, todos, goal, slash commands ou model availability.

### 4.1 Histórico primeiro na tela (2026-10-09)

```text
subscribe → durable messages M0 → o mesmo V4 publisher → o primeiro frame entra no transport outbox
                                                          ├─ histórico legível na UI, rascunho de texto editável
                                                          └─ runtime activation(M0)
                                                               ├─ ready → alinhar a projeção, liberar a execução
                                                               └─ failed → manter o histórico, retry manual
```

- O nome da capacidade é `historyFirst`, propagado por hello/clientHello e pelo attachment confiável; assinaturas que não declaram a capacidade continuam esperando a recuperação completa.
- O ACK da fase de histórico registra `historyReadyMs`; o caminho antigo mantém `cliSessionRestoreMs`. O custo da ativação completa é registrado nos logs existentes do ciclo de vida de resume e não é misturado com o tempo de primeira tela.
- O snapshot/state patch ganha o campo opcional `runtimeInitialization`: `initializing | ready | failed`, carregando `attemptId`; em failed vêm `reasonCode/message` estruturados. A ausência representa a semântica de prontidão completa do protocolo antigo e não acrescenta nenhuma run phase.
- O subscribe pode carregar `retryInitialization` (o attemptId de falha observado); somente a tentativa failed current pode iniciar a próxima, e requisições repetidas são combinadas. Um reconexão normal não reexecuta a tentativa que falhou, e nenhum RPC novo é adicionado.
- O histórico inicial depende apenas da materialização persistida, reutilizando active branch, goal/plan e o reducer existente; não chama o runtime e não forja um estado executável de modelo. Detalhes, anexos, diretório de workflow e interações do App esperam o ready.
- Uma recuperação normal lê por completo as messages do parent uma única vez, e M0 é compartilhado apenas na pilha de chamadas desta recuperação; só a correção do compact interrompido pelo runtime permite a leitura de M1. O retry relê os fatos persistentes. Não há novo schema de banco, cache global ou TTL.
- O primeiro frame entra no post-response outbox existente e só então a activation é agendada; não se pode usar um sleep fixo ou apenas um Promise.all para mascarar a varredura síncrona de plugins. A falha de carga do histórico continua sendo falha de assinatura, e não se pode exibir um histórico vazio falso.
- O gateway é o owner único das duas fases; a inscrição em context.sessions não é ready. Durante a inicialização, novos comandos de execução são explicitamente recusados e não entram na accepted input queue; a semântica existente de command query/dedupe é preservada.
- Os eventos de inicialização e a hydration final usam o mesmo publisher; só fica ready depois de alinhar memory tail, source seq, a correção de compact e a configuração mais recente. A UI não mantém uma segunda cópia do transcript.
- A limpeza da failure remove apenas o record, o event sink e o app semi-inicializados desta tentativa, preservando o publisher do histórico. O retry explícito reexecuta o resume completo (incluindo o hook SessionStart) e não promete reverter efeitos colaterais externos do hook.
- Após o início da inicialização, trocar de sessão não força o cancelamento do ciclo de vida existente; resultados tardios depois de um fechamento/troca não podem atualizar o novo publisher. Um record em inicialização não pode ser recolhido pelo resident pool.
- child warm/live/detached reutiliza o fluxo original, não cria um segundo runtime e não modifica o tempo da tarefa, o taskType ou o valor padrão global de modelo.
- O desktop continuous e o mobile replayable compartilham o mesmo owner de recuperação, mantendo os respectivos limites de gap/snapshot, workspaceIdentity/remoteSessionId e de água de assinatura.

### 4.2 UI e superfície de impacto

- SessionPane/ConversationComposer: o snapshot do histórico controla o corpo, e `runtimeInitialization` controla a execução; durante a inicialização não se exibe nenhuma barra de aviso, e apenas na falha são exibidos o erro e o retry acima do campo de entrada. Depois do retry o aviso de erro é ocultado, e o rascunho e a rolagem são preservados.
- workflow journal, operações de modelo, anexos e entradas do App: são consultados/interagidos depois do ready e não podem iniciar o runtime antes da primeira assinatura.
- Gateway/bridge/resume: precisam mudar, são responsáveis pelo histórico persistente, pelo single-flight, pela limpeza da falha e pelo alinhamento do estado final. Host/transport apenas repassam a nova capacidade e a intenção de assinatura.
- sessions-index, política de residência, legacy/Bot, cache global de plugins/Skills: apenas verificação de regressão, sem ampliar o comportamento.
- O grafo ganha a distinção de dependência entre history-readable e runtime-ready; o grafo original não tem a aresta de sequência de consulta de workflow anterior à assinatura e deve ser atualizado junto com a implementação.

## 5. Matriz de verificação podada

Não se enumeram todos os clientes × todos os estados de sessão. A ativação acontece antes da separação do delivery profile e, por invariante, escolhem-se amostras representativas:

| Amostra representativa                    | Foco da verificação                                                                              | Camada de evidência           |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------- |
| histórico local completed + desktop continuous | rows/tool/reasoning históricos, continuação, idempotência e ausência de materialização de snapshot legacy | integração de bootstrap       |
| histórico remoto completed                | workspace identity, provider registry e continuação                                            | integração V4 cold-resume existente |
| model/thought/mode históricos             | prioridade da configuração local da sessão e do thought hint                                    | I63 / integração de bootstrap existente |
| modelo indisponível                      | fronteira de leitura/escrita do restoreWarning                                                 | integração de bootstrap existente |
| child completed                           | cold hydration do child e navegação somente leitura                                             | evidência existente SAT09     |
| mobile replayable                         | equivalente ao primeiro estado terminal completo do desktop; semântica de gap/resync inalterada   | evidência de protocolo existente PV4-06/25 |
| legacy `session/resume`                   | snapshot completo e context usage preservados                                                   | teste unitário do protocolo legacy |
| PERF03 de sessão grande                   | a ativação não constrói snapshot legacy; a cold subscription normal lê por completo as messages do parent apenas uma vez; registra a tendência | fixture de performance        |
| subscribe/query/command V4 concorrentes    | o primeiro frame do histórico chega antes da conclusão da inicialização; zero admissões de execução durante a inicialização, paginação legível | unidade/integração de bootstrap |
| falha do READY                            | mantém o histórico e o erro estruturado; limpa o record semi-inicializado; o retry explícito é single-flight | unidade do gateway            |

## 6. Não objetivos e próximos passos

Esta rodada não trata os seguintes over-fetch adjacentes, para não ampliar a superfície de regressão:

- o `createSession` / fork registration do V4 construindo um snapshot legacy para obter poucos campos;
- o legacy continuous subscribe do Bot, o envio de anexos e a consulta de estado;
- remover o legacy `session/resume`, o `readSession` ou o schema de snapshot;
- otimizar a varredura de plugins/Skills/MCP, substituir batch reducer, wire fragment ou o protocolo de rows window.

Esses caminhos devem ser migrados por chamador e manter sua própria matriz funcional, e não podem ser removidos junto com esta otimização de cold-resume.

## 7. Medições reais de 2026-07-24

Ambiente: Apple Silicon, `app-server` local em produção, um novo processo de CLI por amostra; mesmo workspace,
mesma sessão e mesma subscrita `desktop-continuous`. O grupo de controle foi compilado de forma independente a partir de um worktree detached no HEAD anterior à mudança
`e3efe9006ad7489b83d1efca917b3c0df32add69`, evitando comparar com um pacote instalado antigo ou com
código-fonte diferente. Após o aquecimento do cache de arquivos, cada execução foi feita três vezes.

fixture `sess_perf_large_20260724034221_af2e36b8`:

- 2.000 messages / 6.671 parts (cerca de 1.000 turns)
- 2.000 tool parts, 334 reasoning, 200 patch, 60 todos
- os dois grupos tiveram initial V4 physical frame de 143.690 bytes

| Implementação                                                          | Três execuções de cold process → initial frame |    Mediana |
| ---------------------------------------------------------------------- | --------------------------------------------- | --------: |
| Antes: a ativação do V4 constrói o snapshot legacy e o usage chama `readSession` de novo | 3352,1 / 3169,5 / 3070,2 ms | 3169,5 ms |
| Depois: activation-only + projeção estreita de usage                    | 2704,8 / 2701,5 / 2607,6 ms                   | 2701,5 ms |

A mediana na mesma máquina caiu **468,0 ms (14,8%)**. Anteriormente, o log de um único legacy `readSession` desse fixture ficava em
281–288 ms; a diferença ponta a ponta após a remoção dos dois full snapshots é coerente com essa ordem de grandeza. Este número serve
apenas como evidência de regressão nesta máquina e não constitui uma SLA entre máquinas.

Depois que o bundle final de produção foi reconstruído, executou-se mais três vezes usando o Agent ready como ponto de partida:

| Fronteira                                  | Três durações                |    Mediana |
| ------------------------------------------ | --------------------------- | --------: |
| subscribe após ready → initial frame       | 2040,1 / 1998,0 / 1936,5 ms | 1998,0 ms |

A notification NDJSON `v4/conversation/frame` completa (incluindo a quebra de linha) teve 143.691 bytes em todas elas, com stderr vazio. Os
aproximadamente 2,7 segundos antes medidos de process → initial frame ainda incluíam cerca de 0,69 segundo de inicialização/ready do processo e, por isso, as duas métricas são coerentes:
não se pode atribuir todo o tempo de espera à ativação de runtime ou ao snapshot legacy.

A sondagem de estágios do mesmo fixture em uma única execução mostra: leitura/decodificação das messages persistidas cerca de 56,8 ms, synth do transcript cerca de
49,9 ms, hydrate do `ProductProjection` cerca de 679,9 ms e nova leitura estreita de usage da atual lendo as messages do active-branch cerca de
60,0 ms. A sondagem vem de uma execução de diagnóstico e não é somada forçadamente item a item da tabela acima; ela representa apenas esse fixture de 2.000 messages
e não pode ser extrapolada para shapes de ticket com mais de 10.000 messages.

Em 2026-08-12, após recontar com o fixture de PERF03-E com 10.622 messages / 35.811 parts, a cold subscription normal de produção
materializa por completo as messages do parent 5 vezes; a mediana da leitura única é 385,1 ms e o custo direto das 4 leituras repetidas tem limite superior de cerca de
1540,6 ms. Depois de implementar a reutilização de escopo de operação da seção 4.1, a mediana de subscribe em processo novo → initial frame
caiu de 3991,9 ms para 2681,6 ms, uma redução de 1310,3 ms (32,8%). Ambos os grupos mantêm o frame de 158038 bytes,
29950 rows, janela de 60 rows, `toSeq=74164` e 0 running subagents. A medição completa e o ambiente estão em
[`v4-conversation-cold-hydration.md`](../performance/v4-conversation-cold-hydration.md#perf03-h-单次冷恢复物化2026-08-12).

## 8. Aceitação do histórico primeiro na tela (2026-10-09)

A implementação usa o promise de recuperação desta tentativa do gateway para compartilhar M0, e o coordinator de ativação antigo mantém o single-flight de runtime.
Metadata/target/entries persistidos e o memory tail continuam lendo os valores mais recentes; o usage seed é alinhado depois de completar o live buffer;
a materialização do parent não se espalha para o child. O core comum e o legacy resume não injetam M0, mantendo a semântica original de cada entrada.
A inicialização normal e o retry de falha são alinhados por state patch, e apenas uma mudança real na estrutura do histórico (como a correção de compact) usa a fronteira de snapshot,
evitando que o snapshot da janela final descarte as linhas que a UI já leu em paginação.

### 8.1 Evidências de execução e regressão

- Após remover a barra de aviso de inicialização, a regressão do Composer passa **17/17**, e o pending HF01/HF02 passa **2/2**;
  run: `desktop-e2e-20261009124509259-p39833-e0ca33f5fc0a7314`. Durante a barreira foi confirmado que não há barra de aviso de inicialização,
  que o rascunho é editável e o envio está desabilitado; a falha ainda exibe o erro e o retry, a barra de aviso é ocultada durante o retry,
  e a prontidão só é considerada quando o botão de enviar volta a ficar disponível.
- macOS Electron: após reconstruir o CLI e o Desktop neste branch, o pending HF01/HF02 passa **2/2**.
  Run final: `desktop-e2e-20261009122057441-p88058-2c6e51fda3f594c9`, com os artefatos preservando os screenshots de inicialização e de retry de falha.
  O HF01 usa uma barreira real de evento de arquivo do SessionStart, verificando corpo legível, rascunho editável, envio desabilitado e o posterior desbloqueio do envio;
  o HF02 corrompe o campo de branch da fixture isolada quando M0 já está exibido, passando pelo caminho real de falha de materialização final,
  e verifica a barra de erro, a preservação de histórico/rascunho/rolagem e que, depois de corrigir os dados persistidos, o duplo clique no retry executa o resume hook apenas mais uma vez.
- Gateway/publisher/cold-resume/cold-event-merge: de 120 itens, **117 passaram** e 3 asserções antigas de restauração de model/thought falharam;
  a mesma falha foi reproduzida extraindo o código-fonte de forma independente a partir de `23819deddc`, antes da mudança. Outra asserção existente de gateway stale-vs-executionFailed
  também reproduziu na baseline, e a correção não foi ampliada nesta rodada.
- Regressão direcionada de negociação de capacidade de UI/Host e de isolamento de conexão **77/77**, regressão direcionada da barra de status **17/17**;
  a varredura related na raiz passou com 14.036 e falhou em 1 asserção de código-fonte, que passou ao ser reexecutada de forma direcionada após a atualização do gate de ready.
  O `test:unit:affected` compara apenas o escopo de commits na fase não commitada e por isso é pulado; por isso as execuções related acima foram usadas para validar as alterações do workspace.
- O typecheck/lint da raiz, o typecheck dos 30 pacotes do CLI, o architecture check, o fixture check e a verificação de palavras open source nos arquivos alterados passaram.
  O lint do CLI não ficou todo verde: os 20 erros de max-lines do Bootstrap também existem na baseline, e outros pacotes não alterados também têm arquivos longos preexistentes.
- Os novos E2E continuam pending, não foram promovidos manualmente nem adicionados ao Docker gate. Não houve execução real em celular físico/SSH/Windows/Linux;
  as evidências de continuous/replayable, workspace identity, compact/rewind e warm/child vêm de regressões de protocolo/integração,
  e não são apresentadas como uma aceitação completa de rede de controle remoto. O desempenho real da UI com histórico muito grande não foi remedido nesta rodada.

### 8.2 Comparação do primeiro frame nas mesmas condições

Apple Silicon / Node 24; a mesma fixture SQLite isolada (2 messages), com um processo de CLI e um HOME novos a cada rodada,
alternando três execuções; com um Personal Provider válido configurado e asseverando que o frame ready preserva a escolha de modelo da fixture.
A baseline foi construída de forma independente a partir do Bootstrap e do código-fonte shared de `23819deddc`, com as demais dependências iguais;
os dois CLIs usaram o mesmo diretório de recursos, e os logs confirmam que cada rodada descobriu 15 plugins e habilitou 11.
A contagem de tempo começa com o subscribe emitido após a resposta de `runtime/capabilities`, e o hook SessionStart real ocupa 2 segundos de forma fixa.
Este é um sample controlado para validar a cadeia de espera, e não uma porcentagem de cold start natural nem a medição de primeira tela da UI de uma sessão real.

| Fronteira                                  | Antes (ms)        | Depois (ms)       | Mediana antes → depois |
| ------------------------------------------ | ----------------- | ----------------- | ---------------------- |
| subscribe → primeiro frame de histórico da CLI | 3349 / 3094 / 2834 | 12 / 37 / 17     | 3094 → 17              |
| subscribe → frame de runtime ready         | 3349 / 3094 / 2834 | 3541 / 3305 / 3583 | 3094 → 3541           |

O primeiro frame já não espera o runtime; a inicialização completa não teve melhora nesta rodada. Nos logs, a fase de descoberta de plugins ficou em 607–992 ms
antes da mudança e 1020–1236 ms depois; a principal variação deste sample de fresh-HOME recai sobre o fluxo de plugins original, que não foi otimizado nesta rodada,
e uma amostra pequena de uma única máquina não deve ser interpretada como SLA entre máquinas. A comparação inicial foi descartada por o baseline temporário não ter
descoberto os plugins embutidos e portanto não ser comparável. O hook do Desktop usa uma barreira de evento (não o timer de 2 segundos acima),
e seu custo inclui a verificação dos testes e a liberação manual da barreira, e não é somado aos samples da CLI.
