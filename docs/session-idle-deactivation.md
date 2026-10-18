# Pool de residência mista de Sessions do CLI

Status: **confirmado, implementado conforme este spec**

## Problema

Cada workspace runtime corresponde a um processo persistente `zcode-cli app-server --stdio`. Dentro do processo, cada session carregada mantém um `ZCodeApp` completo, biblioteca de eventos em memória, fiação MCP/runtime e publisher do V4. Trocar de task normalmente, fechar um pane ou mudar de workspace não remove sessions persistentes, portanto quanto mais sessions o mesmo processo CLI já percorreu, maior a memória residente.

Esta funcionalidade resolve apenas o **ciclo de vida ocioso e a quantidade em rajada das sessions carregadas dentro de um único processo CLI**. Ela não faz um pool global entre workspaces nem define um hard limit por RSS.

## Contrato de produto

1. Cada CLI usa um idle TTL de `10 minutos` para sessions ociosas que satisfaçam as condições de segurança; quando o TTL expira, a sessão é reciclada independentemente da quantidade residente atual.
2. Cada CLI usa simultaneamente uma histerese de quantidade com `highWater = 16` e `lowWater = 8`: acima da marca alta, não se espera o TTL e reciclam-se por LRU as sessions que podem ser restauradas a frio com segurança, até a marca baixa ou até não haver candidatos.
3. Sessions em execução, enfileiradas, aguardando interação, com assinantes ou com operações de protocolo em andamento nunca são recicladas. «Em execução» não inclui apenas turns em primeiro plano e o registro de background tasks, mas também os detached sidecars que o próprio runtime possui, bem como a finalização de persistência, snapshot e broadcast que ainda não terminou depois que a camada de protocolo liberou o active lock. Se essas sessions já estiverem acima da marca alta, é permitido que a contagem residente continue excedente.
4. O idle TTL começa depois que todos os fatos de proteção desaparecem; uma nova operação de session ou um fato de proteção reinicia a contagem. Depois que um trabalho longo em background termina, a contagem precisa recomeçar no fim do drain da notificação de conclusão, sem reaproveitar o tempo antigo de antes do início da tarefa em background.
5. Depois da reciclagem, o estado em memória da session fica exatamente igual a «o CLI acabou de iniciar e essa session nunca foi carregada»:
   `context.sessions` sem record, session persistente e índice de tasks preservados.
6. Assinaturas/leuras posteriores são restauradas pelo cold resume existente, sem criar uma segunda cadeia de restauração.
7. A reciclagem é um ciclo de vida interno: não envia `session.removed` nem envia ao renderer uma notificação de negócio «reciclado».

A marca alta e a marca baixa são, portanto, uma **válvula de proteção contra rajadas orientada à segurança**, e não um hard limit que abortaria tarefas ou recusaria concorrência. Isso não conflita com
`crossSessionUnlimitedConcurrency`; já o TTL garante que poucos runtimes residentes de longo prazo sem uso sejam finalmente liberados.

## Estado e sequência

```text
                        任一保护事实存在
                    ┌──────────────────────────┐
                    │ ACTIVE_PROTECTED         │
                    │ · runtime owned work     │
                    │   · active/queued        │
                    │   · task registry        │
                    │   · detached sidecar     │
                    │ · protocol finalization  │
                    │ · pending interaction    │
                    │ · subscriber             │
                    │ · protocol operation     │
                    │ · deferred draft         │
                    └────────────┬─────────────┘
                                 │ 保护事实全部消失
                                 v
                    ┌──────────────────────────┐
                    │ IDLE_WARM                 │
                    │ 记录 eligibleSinceAt      │
                    └───────┬──────────┬───────┘
                            │          │
                 idle>=10min│          │resident>16
                            │          │按 LRU 回收到 8
                            └────┬─────┘
                                 v
                    ┌──────────────────────────┐
                    │ DEACTIVATING             │
                    │ 同步二次校验并摘除 record │
                    │ 异步等待 app.close        │
                    └────────────┬─────────────┘
                                 v
                    ┌──────────────────────────┐
                    │ DEACTIVATED              │
                    │ 内存无 record，磁盘仍在   │
                    └────────────┬─────────────┘
                                 ├─ V4 subscribe/rows-range → cold READY flight
                                 └─ legacy resume           → legacy activation/snapshot
```

Sessions concorrentes podem ultrapassar o alvo:

```text
highWater = 16
lowWater = 8

18 个 session 都在运行/订阅中
  -> resident = 18
  -> 可回收 = 0
  -> 不终止任何任务，暂时保持 18

其中 12 个变为空闲
  -> 已超过 highWater，按 LRU 回收 10 个
  -> resident = 8

11 个最近使用且已退订的 session
  -> resident 未超过 highWater
  -> 10 分钟内继续保持热状态
  -> 各自 TTL 到期后回收，即使 resident 已少于 8
```

## Matriz de ciclo de vida e liberação

Aqui «ciclo de vida» descreve apenas se a session **permanece residente dentro do processo CLI atual**, sem alterar o estado de produto de sessão em disco, índice de tasks,
pin/archive/unread etc. O pool só inicia a reciclagem a partir de `IDLE_WARM`; os demais estados ou ainda têm owner, ou já não estão em memória.

| Ciclo de vida        | Condição de entrada                                                              | Pode ser liberado pelo pool | Comportamento de um novo pedido                                          |
| ------------------ | ------------------------------------------------------------- | ------------------ | -------------------------------------------------------------- |
| `DEACTIVATED`      | Não há record em `context.sessions` do CLI atual                  | Já liberado, nada a fazer | Segue o cold resume existente, recriando app/runtime e restaurando o histórico persistente |
| `COLD_RESUMING`    | subscribe/query/resume criando ou restaurando o record            | Não liberável             | Reutiliza/aguarda a mesma restauração; o operation lease protege toda a janela assíncrona |
| `ACTIVE_PROTECTED` | Existe qualquer owner de proteção da tabela abaixo              | Não liberável             | Continua rodando, enfileirado ou assinando conforme o protocolo original |
| `IDLE_WARM`        | Record já persistido e todos os owners de proteção liberados      | Pode ser candidato        | O pedido pode reutilizar o record quente e limpa o `eligibleSinceAt` existente |
| `DEACTIVATING`     | Segunda validação fresca aprovada, record removido sincronamente e `app.close()` ainda incompleto | Liberando, não pode repetir | Aguarda o settle do close e então segue o cold resume; nunca atinge o record antigo meio desmontado |

`ACTIVE_PROTECTED` não é um único booleano, e sim a união dos owners a seguir:

| owner / subciclo de vida      | Origem típica                                                             | Pode ser liberado | Fronteira exata de liberação da proteção                                   |
| ----------------------- | -------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| Turn em primeiro plano / em background          | prompt, fluxo do modelo, await de tool, compact, continuação de goal               | Não       | o runtime work do runner termina                                |
| runtime command         | prompt enfileirado, notificação terminal, drain de command                  | Não       | a fila fica vazia e o drain termina                                    |
| background task         | Bash em background, subagent, Workflow, monitor MCP                     | Não       | o registro de tasks deixa de estar running e sua notificação de conclusão já foi drenada |
| detached sidecar        | título de session/goal, startup de MCP, ledger de notificações, heartbeat de goal | Não       | a Promise envolvida pelo tracker é liberada junto com a escrita de fallback no `finally` |
| memory work             | extração de project-memory, prefetch de recall                           | Não       | o scheduler não tem pending/running e o prefetch já fez settle          |
| protocol finalization   | command fact, ensure-model, snapshot, finalização de broadcast                 | Não       | `residencyFinalizationCount` chega a zero                          |
| pending interaction     | permission, elicitation, AskUserQuestion                             | Não       | a interação foi respondida, cancelada ou fechada                                     |
| gateway command         | fila de commands do V4, pin de inbox in-flight/live                           | Não       | o command termina e o pin é liberado                                     |
| conversation subscriber | desktop continuous, assinatura online do mobile replayable                       | Não       | o unsubscribe termina                                           |
| legacy subscriber       | stream replayable/bot do antigo `session/subscribe`                         | Não       | o protocolo antigo não tem unsubscribe, então a proteção é conservadora até a saída do CLI                |
| protocol operation      | hydration de subscribe, query de rows, resume, leitura/escrita de configuração                    | Não       | o operation lease do dispatch do request é liberado                   |
| deferred draft          | record de session ainda não persistido imediatamente                                      | Não       | passa a immediate persistence; caso contrário não é possível garantir equivalência de cold recovery         |

Portanto, o critério não é «esta funcionalidade se chama tarefa em background ou não», e sim «ainda existe algum owner assíncrono que lê ou modifica o
record/runtime atual»:

```text
存在任一 owner
  -> ACTIVE_PROTECTED
  -> 即使 resident > 16 也不能回收

所有 owner 已释放 + session 可从磁盘恢复
  -> IDLE_WARM
  -> idle TTL 到期，或 resident > 16 时按 LRU，才允许回收
```

### Ações do usuário e cenários de funcionalidade

| Cenário                                             | Pode ser liberado?                         | Explicação da fronteira                                                                     |
| ------------------------------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------ |
| Prompt em primeiro plano / streaming de modelo / execução de ferramenta          | Não                                   | o active turn ou o runtime work detém um owner                                               |
| Bash em background / subagent / Workflow            | Não enquanto está rodando                             | não se pode olhar apenas o turn em primeiro plano; só pode ficar ocioso depois de task terminal e o drain da notificação de conclusão |
| goal de longa duração / verifier / continuation            | Não enquanto está rodando ou finalizando                       | a cobertura ativa/runtime e de finalização é contínua; pode ficar se estiver pausado/concluído e sem continuation |
| compact / extração de memória / prefetch de recall    | Não enquanto estiver pending, running ou finalizando          | pode depois que tudo fizer settle, sem reaproveitar o tempo idle antigo de antes do trabalho começar |
| browser use                                      | Não durante turn/tool await ou cleanup       | manter apenas uma conexão de browser ociosa não constitui owner permanente; a session é fechada junto com app/runtime na reciclagem |
| MCP                                              | Não durante startup ou monitor running     | pode quando o server está conectado mas ocioso; o cold resume posterior restabelece a conexão |
| permission / AskUserQuestion                     | Não                                   | reciclar perderia o estado de interação que existe apenas em memória |
| prompt enfileirado / pin de inbox de command                | Não                                   | mesmo antes de iniciar a chamada de modelo, já é trabalho pendente |
| automation / tarefa agendada / tarefa ociosa off-peak        | Não enquanto o disparo atual estiver rodando; sim quando houver apenas definições futuras | depois do disparo é preciso entrar na cadeia unificada de owner do prompt runner; definições de agendamento futuras e persistentes não devem fixar a session permanentemente |
| pane visível no renderer / assinatura online no celular             | Não                                   | o assinante é um owner de proteção                                                              |
| pane do renderer fechado e keep-warm/unsubscribe concluídos | Sim                                   | a projeção do renderer já foi liberada primeiro, e só então o CLI inicia seu próprio idle TTL                              |
| session de SSH / WSL / Docker                       | Mesmas regras do local                         | o julgamento acontece no CLI remoto que realmente hospeda a session; a conexão de rede ou o tipo de workspace não é um caso especial adicional |
| Tarefas em background históricas já concluídas                             | Sim                                   | o índice de tasks / histórico persistente é preservado, mas o histórico terminal em si não ocupa owner de runtime |

Para todos os «sim», ainda é necessário satisfazer todos os fatos de proteção autoritativos da próxima seção, e é preciso fazer uma segunda validação síncrona antes de remover de fato o record. Qualquer novo pedido,
nova assinatura ou novo owner empurra `IDLE_WARM` de volta para `ACTIVE_PROTECTED` e reinicia o idle TTL.

## Fatos de proteção autoritativos

Uma session só pode ser reciclada quando **todas** as condições abaixo forem satisfeitas:

| Condição                              | Fonte autoritativa                                  | Motivo                                                                                    |
| --------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------- |
| Já persistido                          | `record.persistence === "immediate"`      | um deferred draft não pode fazer cold recovery depois de reciclado                                                         |
| runtime sem owned work             | `AgentRuntime.hasResidencyBlockingWork()` | agrega turn active/queued, registro de tasks, detached sidecar e memory work pendente de conclusão         |
| Sem work de finalização de protocolo                   | `record.residencyFinalizationCount === 0` | o active lock precisa ser liberado antes de ficar ready, mas a persistência, o snapshot e o broadcast ainda exigem o record/runtime original até terminarem |
| Sem pending interaction            | `V4InteractionRegistry`                   | permission / AskUserQuestion etc. existem apenas na memória do processo atual                                       |
| Fila de commands do V4 / pin de inbox vazia | `ConversationV4Gateway`                   | a fila do gateway e o command in-flight/live são estado de execução do processo atual                                  |
| Conversa sem assinantes             | `ConversationTopicPublisher`              | os consumidores online de desktop continuous e mobile replayable são protegidos                            |
| Sem stream legacy assinado             | `record.legacyStreamSubscribed`           | os streams antigos de replayable/bot não têm RPC de unsubscribe, então só podem ser mantidos conservadoramente até a saída do CLI                       |
| Sem requisição de protocolo em andamento                    | operation lease do `SessionResidentPool`     | janelas await de hydration de subscribe, query de rows, resume e escrita de configuração não podem ser recicladas                |

`record.activeAbortController` não é o fato completo de runtime ocupado e não pode ser usado sozinho para decidir a reciclagem.
`record.deliveryKind` também não é uma lease de assinatura legacy: caminhos de leitura como `session/read` gravam nele. A camada de compatibilidade só grava
`legacyStreamSubscribed` em um `session/subscribe` de verdade, evitando que leituras comuns fiquem com isenção permanente; como o protocolo antigo não tem
unsubscribe, um stream marcado como item de proteção pode fazer o resident ultrapassar temporariamente o alvo.

A consulta autoritativa do runtime precisa cobrir todo o trabalho assíncrono que ele possui e que toca o estado de session/runtime:

```text
AgentRuntime.hasResidencyBlockingWork()
  = active turn / turn-start reservation
  || runtime command queue / drain
  || task registry 中 running background Bash / Agent / Workflow / MCP monitor
  || detached session title / goal title 生成与 fallback 持久化
  || MCP startup
  || detached background-notification ledger write / goal heartbeat
  || project-memory extraction schedule / drain
  || 尚未 settled 的 project-memory recall prefetch
```

O detached sidecar registra a contação no início síncrono e a libera no `finally` da Promise; não se pode depender de varrer Promises depois do fato,
nem proteger apenas as chamadas reais de modelo e esquecer as escritas de fallback. Assim, com sucesso, falha ou abort, a contagem não vaza.

A fronteira de ready da camada de protocolo precisa de uma lease de finalização independente:

```text
background prompt / compact / goal continuation
  -> acquire record finalization lease
  -> 执行模型/runtime work（activeAbortController 同时存在）
  -> clear activeAbortController       # 允许下一条输入通过 admission
  -> 持久 command fact / ensure model / snapshot / broadcast
  -> release record finalization lease
  -> 才可能进入 IDLE_WARM
```

A lease de finalização não pode ser substituída por uma liberação tardia de `activeAbortController`, senão a input enfileirada vai julgar incorretamente, na fronteira de ready, que o turn antigo ainda está ativo. Os caminhos de background legacy e do V4 precisam reutilizar o mesmo protocolo de contagem.

O mapeamento de cenários segue a mesma regra de owners, sem adicionar um caso especial de pool para cada um:

- automation, tarefas agendadas e tarefas ociosas off-peak/ociosas chegam todas ao prompt runner; durante a execução são protegidas pelos fatos active/runtime de runtime, e a finalização do ready é protegida pela lease de finalização de protocolo;
- Bash em background, subagent, Workflow e monitor de MCP têm o registro de tasks como autoridade; depois que a notificação terminal entra na fila do runtime, a proteção continua pela fila/drain e pela escrita do ledger detached;
- browser use é active work durante o turn/tool await, e o cleanup de browser do turn/session continua dentro da Promise do runner; o usuário manter apenas uma session de browser ociosa não significa «a tarefa ainda está rodando», permitindo reciclagem a frio normal com fechamento;
- a conexão do MCP server em si não é um pin permanente; apenas o startup ou um monitor MCP ainda running no registry impede a reciclagem, e um MCP pronto e sem tarefas pode ser reconstruído por cold start;
- verifier/continuation de goal e compactações longas usam os fatos active/runtime, e depois de liberar o ready lock a finalização lease dá a cobertura;
- SSH/WSL/Docker continua executando o mesmo julgamento dentro do CLI remoto real, com as mesmas fronteiras de workspace identity e cold recovery.

Requisições de protocolo usam uma operation lease de nível de processo e registram simultaneamente o sessionId atingido:

```text
request admitted
  -> acquire operation lease
  -> 若该 session 正在 DEACTIVATING，等待 close 完成
  -> dispatch / hydrate / mutate / query
  -> release lease + touch LRU
  -> rebalance
```

O significado da lease de nível de processo é: nenhuma reciclagem é iniciada dentro do recorte assíncrono de qualquer requisição de protocolo. Isso também cobre a sincronização de configuração de workspace que percorre múltiplas sessions,
evitando que, depois de adicionar lock apenas a requisições com `{sessionId}` explícito, sobre uma operação global. Tarefas assíncronas em execução continuam protegidas pelos fatos autoritativos de runtime/background.

## TTL, LRU e gatilhos

- `eligibleSinceAt` só é estabelecido depois que todos os fatos de proteção desaparecem; é removido em um novo touch ou quando a sessão volta a estar protegida.
- Candidatos com TTL expirado ignoram a quantidade residente atual, mas ainda precisam reler os fatos de segurança antes de executar.
- A reciclagem por marca alta ordena por LRU usando `lastUsedAt = max(record.updatedAt, pool.lastTouchedAt)`.
- Um rebalance recicla primeiro os itens com TTL expirado e depois usa a quantidade residente restante para verificar se a marca alta foi ultrapassada; nesse caso, recicla até a marca baixa ou até não haver candidatos.
- Um rebalance é disparado ao final de cada requisição de protocolo, para que create/resume/unsubscribe atualizem a contagem ou convirjam a tempo.
- O process resource sampler existente atua a cada 60 segundos como rede de segurança, sem novos timers por session; portanto a janela real de reciclagem do TTL de 10 minutos é de cerca de 10 a 11 minutos depois de a session se tornar elegível.
- Os parâmetros padrão são constantes de código, e os testes podem injetar valores e relógio menores; nesta fase não há nova variável de ambiente nem configuração de usuário, e o RSS não é lido para decisões de reciclagem.
- O campo de compatibilidade `sessionResidentTargetCount` da camada de montagem do server cobre apenas a marca baixa; quando `highWaterCount` não é fornecido explicitamente, ela continua sendo resolvida a partir da marca alta padrão, e não se pode escrever o legacy low-water nas duas pontas e achatar a janela de histerese. Se apenas `targetCount` for sobrescrito e ele for maior que a marca alta padrão, a camada de montagem precisa resolver uma marca alta efetiva não inferior ao target,
  para que o Agent CLI não lance na fase de construção por causa da combinação de valores padrão; combinações inválidas explícitas de high/target continuam sendo rejeitadas pela validação do pool.

## Superfície de execução da reciclagem

A reciclagem e o close/delete explícito liberam o runtime, mas têm semânticas de produto diferentes:

```text
resident eviction
  -> gateway.assertSessionRuntimeDeactivatable() # 纯校验；失败时不得产生副作用
  -> record.unsubscribe()
  -> gateway.deactivateSession()   # 清 publisher/cache/inbox，不发 session.removed
  -> context.sessions.delete()
  -> await app.close()

explicit close/delete
  -> gateway.disposeSession()      # 保持既有 removal 语义
```

A validação pura de segurança precisa ficar antes do primeiro efeito colateral; quando a validação recusa, o record, a assinatura de eventos do runtime e o estado de execução do gateway
permanecem todos utilizáveis. Depois da validação aprovada, o `unsubscribe`, a limpeza do gateway e o `sessions.delete` acontecem no mesmo recorte de execução
síncrono. Um novo pedido ou obtém primeiro a operation lease e bloqueia a reciclagem, ou vê DEACTIVATING e espera,
e então segue o cold resume; nunca atinge um record meio desmontado. `app.close()` pertence à finalização assíncrona após a remoção, e sua falha é isolada e registrada pelo pool,
não pertencendo à transação síncrona de pré-verificação que poderia ser revertida.

## Limite de memória do renderer

O renderer não espelha o pool residente do CLI e não recebe notificações de reciclagem. Ele já tem um ciclo de vida próprio de projection cache:

```text
pane 关闭/切走
  -> release SessionDataLayer pane lease
  -> keep-warm 30s
  -> unsubscribe conversation
  -> ConversationProjectionStore.close()
  -> 从 SessionDataLayer 删除该 topic store
  -> CLI 观察到 subscriber=0
  -> 进入 CLI 10 分钟 idle TTL；突发超过 highWater 时也可参与 LRU
```

Se o renderer ainda mantém uma projeção pesada que precisa de atualização em tempo real, ele ainda tem assinatura e o CLI não recicla; se o CLI
já pode reciclar, a projeção pesada do renderer já foi liberada pelo seu próprio ciclo de vida. Uma notificação adicional de «o CLI reciclou» vazaria a estratégia interna de cache para a UI e poderia
criar uma corrida de gerações entre uma notificação antiga e uma nova reassinatura recém-concluída, e por isso é proibida como protocolo de negócio.

O estado de shell como task list membership, pin/archive/unread e workspace identity continua sendo mantido pelo índice sqlite de tasks e pelo estado leve do renderer; a reciclagem não pode apagá-los.

## Múltiplas plataformas e fronteira remota

- O Desktop mantém `desktop-continuous`. A assinatura de um pane visível protege a session.
- Mobile/Web remoto mantém `web-remote-replayable`. Com a assinatura do V4 presente, a session fica protegida e, depois de liberada, só pode ser reciclada se estiver elegível; os streams replayable/bot que ainda passam pelo antigo `session/subscribe` são protegidos conservadoramente até a saída do CLI, já que o protocolo não tem
  unsubscribe. Nenhum dos dois caminhos de compatibilidade muda o snapshot/gap/cold-resume existente.
- O celular continua se conectando ao shared host existente na janela do desktop; não há novo runtime independente.
- O pool fica no processo CLI que realmente executa a session. Em workspaces SSH/WSL/Docker o pool está no CLI remoto correspondente,
  e não desce para o relay, o main do desktop ou o host.
- Esta funcionalidade gerencia o ciclo de vida por sessionId e não adiciona nenhuma workspace key; o isolamento de identidade existente continua usando
  `workspaceIdentity?.trim() || workspacePath`.

## Aceitação

Os testes focados precisam provar:

1. A primeira aparição de eligible apenas inicia o TTL, e na expiração do TTL a reciclagem ocorre mesmo com resident abaixo da lowWater;
2. Um touch ou o reaparecimento de fatos de proteção reinicia o TTL, e o trabalho em background concluído parte de uma nova janela idle;
3. Igual à highWater não recicla, e acima da highWater recicla por LRU até a lowWater;
4. Quando todas as sessions estão protegidas, é permitido ultrapassar a highWater;
5. active/queued de runtime, Bash/Agent/Workflow em background, sidecar detached de title/MCP/memória, finalização de protocolo,
   pending interaction, fila do gateway, assinante, stream legacy, operation lease e
   deferred draft conseguem impedir a reciclagem de forma independente;
6. TTL e high-water atingidos na mesma rodada não fecham duas vezes, e um candidato cujos fatos mudaram é pulado antes da execução;
7. A reciclagem não produz `session.removed`;
8. Reassinar após a reciclagem cria um novo app e restaura as rows reais do histórico, e não apenas devolve um invólucro de snapshot;
9. Enquanto `app.close()` não terminou, um novo pedido da mesma session espera e então é restaurado a frio;
10. desktop continuous e mobile replayable não compartilham estado de restauração, e a semântica de identidade remota não muda;
11. O teste de lease de last-pane já existente no renderer continua provando o close do store, o unsubscribe e a remoção de cache.
12. A desativação limpa a LRU/admission de `CommandInbox` settled desta session; o pin in-flight/live impede a reciclagem até ser liberado.
13. background prompt/compact/goal continuation de legacy e do V4 continuam não recicláveis depois de liberar o active lock e antes de concluir a finalização da mutação de estado.

Esta fase não adiciona E2E de GUI de conversation. Capacidade, concorrência e cold recovery são cobertos por testes focados do CLI/core; o ciclo de vida de memória do renderer
reaproveita os testes existentes de `v4SessionDataLayer`.