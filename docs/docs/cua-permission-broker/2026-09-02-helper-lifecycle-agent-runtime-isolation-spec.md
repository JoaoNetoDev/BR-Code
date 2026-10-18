# Especificação: o ciclo de vida do Helper não pode afetar o runtime do Agent

## Status

- Status: P0/P1/P2 implementados; a sonda de saúde periódica da montagem padrão e sua recovery automática foram removidas
- Data: 2026-09-02
- Última atualização: 2026-09-03
- Escopo de aplicação: Host local do Desktop, Computer Use Helper, runtime do ZCode Agent, broker MCP `zcode-cua`
- Problemas relacionados: `ZCT-2094300783841067008`, `ZCT-2095050283542110208`
- Relação de substituição: depois de confirmada esta especificação, ela substitui a convenção antiga de que "Helper ready/recovery precisa reciclar o Agent persistente";
  a parte de Agent recycle de [CUA Helper 恢复期 Agent 启动准入规范](./cua-agent-recovery-admission-gate.md) precisa ser
  consolidada conforme esta especificação. O fail-closed, a verificação de identidade de processo e o fence de geração do spawn da especificação antiga continuam mantidos.
- Cláusulas substituídas (2026-09-21): o §3.1 desta especificação, "2026-09-10 spawn 快路", e a entrada de sonda limitada de §3.3, "Agent spawn env
  precisa decidir se pode injetar o tuple atual do broker", foram substituídas por
  [CUA Helper 懒启动规范](./2026-09-21-cua-helper-lazy-startup-spec.md) — a injeção de credenciais no spawn env
  não faz mais nenhuma verificação de saúde; as demais cláusulas desta especificação continuam válidas.

## I. Invariantes de produto

O Computer Use Helper é o provedor de capacidade da CUA, não o owner do ciclo de vida do runtime do Agent.

Deve valer permanentemente:

1. Cold start do Helper, ready atrasado, falha de health probe, recuperação de permissão e restart de processo não podem terminar nem reiniciar ativamente o Agent.
2. Eventos de ciclo de vida do Helper não podem bloquear a inicialização ou recuperação de outros módulos, incluindo model provider, MCP, task index, session hydration, assinatura de conversas e turnos comuns do Agent.
3. Quando o Helper está indisponível, apenas a disponibilidade das ferramentas CUA diminui; conversas não CUA, MCP comuns ou o runtime do Agent não podem entrar em `workspace-dispose`.
4. Se o Agent reinicia, isso só pode ser decidido por crash do próprio Agent, fechamento do workspace, operação explícita do usuário ou pela própria política de recuperação do runtime do Agent.
5. "Helper ready" não é um sinal implícito de "o Agent precisa fazer spawn de novo".
6. O Host não pode fazer polling da saúde do Helper por timer; a verificação de saúde só pode acontecer em fronteiras sob demanda explícitas, como inicialização, resolução, chamada e confirmação de permissão da CUA, e a falha da verificação não pode disparar ação de ciclo de vida do runtime do Agent.

Estado-alvo:

```text
Helper lifecycle:  STARTING -> READY -> DEGRADED -> READY/STOPPED
                         |         |          |
                         |         |          +--> CUA tool retryable error
                         |         +-------------> CUA tool available
                         +------------------------> CUA tool waits/retries

Agent lifecycle:   STARTING -> RUNNING ------------------------------> STOPPED
                                  ^                                     ^
                                  |                                     |
                 Helper events --+-- never call disposeWorkspace ------+
```

## II. Problema atual e evidências

A implementação histórica possuía duas cadeias de controle reversas Helper → Agent (o P0 atual já cortou o efeito colateral de reciclagem do Agent):

```text
resolveSpawnEnv
  -> buildCuaProductHelperAgentEnv
  -> start/checkHealth Helper
  -> pode aguardar ou retornar BROKER_UNAVAILABLE

Helper liveness/recovery periódico (caminho histórico, já removido)
  -> resolver.restart() / reconcileRecoveredHelper()
  -> recycleUntilStable()
  -> disposeWorkspace()
  -> cleanupManagedProcessWithRetry("workspace-dispose")
  -> SIGTERM do Agent + novo spawn do Agent
```

Fatos relacionados:

- A etapa de spawn do Agent aguarda a resolução do Helper env em [node.ts](../../packages/services/src/node.ts);
- historicamente `reconcileRecoveredHelper()` executava recycle do agent persistente; atualmente apenas limpa markers posteriores de spawn admission, conforme
  [cuaProductMcpResolver.ts](/Users/dev/zcode-cua/src/broker/server/cuaProductMcpResolver.ts);
- `disposeWorkspace()` finalmente limpa o Agent com `workspace-dispose`, conforme
  [zcodeAgentProcessManager.ts](../../packages/services/src/zcode-agent/zcodeAgentProcessManager.ts);
- Nos dois tickets aparece `Helper unreachable -> Helper ready -> Agent SIGTERM(workspace-dispose) -> novo Agent`.

### Pré-ocupação no cold start e reciclagem na recuperação não são o mesmo caminho

No cold start o Host pode pré-ocupar socket/token, o Agent usa o tuple pré-ocupado e, quando o Helper fica ready, o transport é cedido de forma atômica;
o objetivo de design desse caminho é não reiniciar o Agent.

Porém, os seguintes casos caem no caminho antigo de reciclagem:

- O spawn do Agent ultrapassa o grace e é marcado como `BROKER_UNAVAILABLE`;
- O watchdog de liveness do Helper sonda a cada 10 segundos e chama `resolver.restart()` diretamente;
- O restart do Helper gera socket/token novos, e o Agent antigo ainda mantém as credenciais antigas;
- `reconcileRecoveredHelper()` chama `disposeWorkspace()` em lote por workspace registry.

Portanto, apenas remover um `disposeWorkspace()` não basta: o P0 removeu simultaneamente o efeito colateral de Agent no callback de recovery e fez com que um restart comum do Helper preferisse reutilizar o transport do host; o P1 seguinte continua resolvendo o spawn do Agent totalmente não bloqueante e uma facade de longo prazo estável.

## III. Comportamentos normativos

### 3.1 Inicialização do Helper

- Fast path de spawn de 2026-09-10: o startup completo continua delegado ao tracker original; havendo já um `reservedTransport` seguro e sem marker de unavailable, retorna imediatamente, sem esperar 1 segundo para ler o mesmo tuple. No Windows ainda se espera primeiro por `transport_ready`; ausência de reserva, falha de warm health e falha de inicialização em segundo plano mantêm as regras de admissão originais.
- A inicialização do Helper deve ser uma operação detached/background interna do Host.
- A inicialização de serviços comuns, o spawn do Agent, o resume de session, o task index e a inicialização de MCP comuns não podem aguardar o Helper ficar totalmente ready.
- O Host deve gerar e ocupar o admission tuple do broker transport o quanto antes; a geração do tuple em si não pode aguardar o backend nativo do Helper, TCC ou o health probe completo.
- Se o tuple já pode ser pré-ocupado com segurança, o Agent pode iniciar carregando esse tuple; o broker client usa retry limitado e cancelável enquanto o Helper ainda não está ready.
- Se o tuple estiver temporariamente indisponível, o Agent ainda pode iniciar, mas a ferramenta CUA deve falhar com `broker_not_ready` retryable;
  não se pode registrar por causa desse estado um workspace que mais tarde dispare recycle de Agent.

### 3.2 Helper ready

Helper ready só permite as seguintes ações:

- publicar a readiness, generation e disponibilidade de socket/transport atuais do Helper;
- limpar o próprio startup marker do Helper;
- acordar as tentativas de retry de ferramenta CUA que aguardam;
- registrar uma telemetria de ciclo de vida de baixa frequência.

Helper ready é proibido de:

- chamar `disposeWorkspace()`;
- chamar `recycleUntilStable()`;
- fechar ou reconstruir o protocol client do Agent;
- disparar resume de session como efeito colateral do Helper ready;
- disparar qualquer operação de Agent em outros workspaces.

### 3.3 Health check sob demanda e recovery/restart do Helper

A montagem padrão de produto não pode criar timer periódico de liveness do Helper, nem chamar automaticamente `resolver.restart()` por causa de uma falha de sonda no período ocioso. As entradas de health check permitidas devem ser disparadas por necessidade explícita:

- O Agent spawn env precisa decidir se pode injetar o tuple atual do broker;
- A fronteira de resolve/request do servidor MCP CUA precisa confirmar que o Helper atual está disponível;
- O usuário concluiu a autorização de permissão e precisa de verify/restart explícito;
- O Host inicia, fecha ou recebe um evento de process-exit do Helper, apenas fechando o próprio estado; não restart proativamente por causa do evento de saída, e sim na próxima fronteira de demanda CUA iniciar/recuperar sob demanda.

Assim, mesmo que o Helper tenha travado durante o período ocioso, não haverá tarefa de fundo periódica que o sonde ou reinicie; só a próxima fronteira sob demanda da CUA executa um `checkHealth` limitado, e na falha recupera apenas o Helper ou retorna um resultado retryable/fail-closed exclusivo de CUA. Módulos não CUA, runtime do Agent, session e estado de task não participam dessa recuperação.

A recuperação do Helper deve ser dividida em dois resultados sem acoplamento:

```text
Helper recovery result
  ├─ readiness: starting | ready | degraded | stopped
  ├─ helperGeneration / processIdentity
  └─ agentInvalidationRequired: false
```

Sob esta especificação, `agentInvalidationRequired` é sempre `false` por padrão. A recuperação do Helper não pode disparar implicitamente restart do Agent.

Se o processo do Helper realmente sair:

- O Host é responsável por recolher e revalidar a identidade do processo do Helper;
- A broker facade do Host mantém inalterado o contrato de conexão do lado do Agent;
- A requisição CUA atual retorna retryable ou `possibly_sent` conforme as regras de delivery-safety;
- Uma nova requisição CUA é retentada depois que o Helper ficar ready;
- Turnos comuns do Agent, eventos de session, task index e outros MCP continuam usando o runtime original.

### 3.4 Credenciais e transport

A implementação final precisa satisfazer qualquer uma das seguintes condições equivalentes:

1. O Agent vê um socket/token de broker facade estável durante todo o lifetime do Host, e o Helper é apenas a implementação a jusante dessa facade;
2. O MCP client do lado do Agent suporta reconectar no lugar quando a generation do Helper muda e obtém as credenciais válidas atuais pelo Host, sem precisar reiniciar o Agent nem reconstruir a session.

Abordagens não aceitáveis:

- apenas remover o recycle do Agent, mas ainda gerar socket/token totalmente novos a cada restart comum do Helper;
- deixar o Agent continuar com o bearer token antigo e esperar que a antiga conexão MCP obtenha credenciais novas sozinha;
- escrever o novo token no env global do Agent, no env de MCP comum, em hooks ou no ambiente de subprocessos Bash.

As credenciais devem continuar mantendo as fronteiras de segurança originais: injeção somente no servidor MCP CUA oficial, e a identidade de processo do Helper, peer, generation e as evidências de saída do processo antigo devem continuar sendo verificadas de forma fail-closed.

### 3.5 Comportamento da CUA quando o Helper está indisponível

Chamadas de ferramenta CUA são tratadas na seguinte ordem:

```text
CUA tool request
  -> Host facade 有当前 Helper
       ├─ yes: 正常调用
       └─ no: bounded wait/retry
                ├─ Helper ready: 继续当前请求
                ├─ retryable timeout: 返回 broker_not_ready
                └─ possibly_sent: 禁止自动重放，交给现有安全语义
```

`broker_not_ready` afeta apenas aquela chamada de ferramenta CUA e não pode escalar para `workspace-dispose`, session error ou restart do runtime do Agent. O retry precisa ter um deadline absoluto, sem retry infinito em segundo plano dentro do Host.

### 3.6 Gateamento por tempo de inicialização do interruptor do plugin CUA

Quando a página de configurações do plugin muda CUA de habilitado para desabilitado e conclui a submissão da configuração, essa submissão escreve somente a configuração de inicialização, sem tocar no runtime atual:

```text
plugin disable committed
  -> persist plugin enabled=false
  -> show “已有对话需重启 ZCode 后生效”
  -> leave existing Agent/MCP/Helper untouched

next session create/resume (including the same workspace Agent process)
  -> read plugin enabled=false
  -> do not inject CUA MCP
  -> do not start or consume Helper
```

Essa cadeia não pode depender de watchdog periódico, health probe de fundo ou restart do Agent. O processo de Agent em execução, a session, o MCP CUA existente, o Helper, os MCP comuns e os subprocessos não CUA permanecem inalterados; portanto, após desligar o ajuste, conversas existentes precisam reiniciar o ZCode para mudar completamente para a nova configuração de inicialização. O subprocesso do Agent pode continuar sendo reutilizado por workspace, mas todo session runtime novo ou rematerializado precisa reler o gateamento do plugin; depois de desabilitado, uma nova conversa não deve receber injeção de MCP CUA nem recuperar capacidade CUA só porque ainda há um Helper em segundo plano. O Helper pode continuar residindo até o fim do lifetime do Host/App, mas não é consumido por novas sessions.

## IV. Fronteiras e owners de estado

| Estado/fato | Owner autoritativo | O Helper pode modificar | O Agent pode ser afetado |
| --- | --- | --- | --- |
| Processo/readiness do Helper | Host + ciclo de vida do Helper | Sim | Só pode afetar a readiness da ferramenta CUA |
| Facade do broker transport | Host | Sim | O contrato de conexão do Agent permanece inalterado |
| Processo/runtime do Agent | Agent process manager | Não | Só a política de ciclo de vida do próprio Agent pode modificar |
| Mensagens/turno ativo da session | Runtime do Agent/session store | Não | O Helper não pode limpar nem reconstruir |
| Metadados do task index | Host task index syncer | Não | Helper ready não pode disparar dispose do Agent |
| Estado de retry da ferramenta CUA | CUA broker client/facade | Sim | Afeta apenas a requisição CUA atual |
| Realtime do Desktop | attachment `desktop-continuous` | Não | Não insere mensagens de replay exclusivas do Helper |
| Realtime remoto do mobile | attachment `web-remote-replayable` | Não | Continua usando recuperação por snapshot/gap e não cria Helper independente |

O isolamento por workspace continua usando `workspaceIdentity?.trim() || workspacePath`; a recuperação do Helper não pode confundir workspaces remotos diferentes por `workspacePath` puro como se fossem o mesmo Agent.

## V. Fases de implementação

### P0: cortar o controle reverso de ciclo de vida (contção de sangramento)

- Remover o efeito colateral de `disposeWorkspace` dos caminhos de Helper ready, liveness recovery e `reconcileRecoveredHelper`.
- `CuaProductHelperWorkspaceRegistry` deixa de ser o conjunto alvo de recycle do Agent; se mantido temporariamente, serve apenas para observação de readiness e telemetria.
- `resolveSpawnEnv` não aguarda mais a readiness completa do Helper; passa a consumir o tuple já pré-ocupado, um tuple de facade estável ou retornar imediatamente o estado CUA-only `broker_not_ready`.
- Manter as verificações antigas de process identity, generation fence e fail-closed, para não deixar passar token antigo sob pretexto de "desacoplamento".

### P1: estabelecer uma broker facade estável

- O Host mantém um socket/capability estável voltado para o Agent; a conexão do Helper é um downstream substituível.
- A troca do processo do Helper apenas atualiza o handle downstream da facade.
- A facade executa retry limitado, propagação de cancelamento e classificação de delivery-state para as requisições CUA.
- Um restart comum do Helper não gera mais um novo tuple Agent-facing que só pode ser consumido via respawn do Agent.

### P2: remover o contrato antigo de recycle do Agent

- Remover a semântica de produto de `onHelperCredentialsRotated -> recycleUntilStable -> disposeWorkspace`.
- Restringir o admission gate ao próprio admission de startup/transport do Helper, sem bloquear mais o spawn do Agent.
- Atualizar a especificação antiga de recovery, comentários, nomes de teste e campos de telemetria, para evitar que a documentação errada de que "recovery precisa reciclar o Agent" continue induzindo a implementação.

## VI. Matriz de verificação

| Case | Estado inicial | Evento | Resultado esperado |
| --- | --- | --- | --- |
| HLR-01 | Cold start do Helper, spawn de Agent comum | Helper fica ready atrasado | O Agent inicia imediatamente; PID/runtime generation inalterados |
| HLR-02 | Cold start do Helper, tuple pré-ocupado já publicado | Helper ready | O Agent não reinicia; a mesma conexão MCP CUA fica finalmente disponível |
| HLR-03 | Cold start do Helper, tuple temporariamente indisponível | Requisição de ferramenta CUA | Retry limitado ou `broker_not_ready`; sem reciclagem do Agent |
| HLR-04 | Agent com turno CUA ativo | Falha de health probe do Helper | Sem restart do Agent induzido pelo Helper; a requisição atual fecha conforme o estado de delivery seguro |
| HLR-05 | Agent com turno comum não CUA | Recovery do Helper | A conversa continua; MCP não CUA, model provider e task index não são afetados |
| HLR-06 | Helper trava ou o processo sai após ficar ocioso, sem requisição CUA | Espera por mais de um ciclo do watchdog histórico | Nenhuma sonda/restart periódico nem recovery automático por evento de saída; PID/session do Agent inalterados, e a próxima demanda CUA recupera sob demanda |
| HLR-07 | Vários workspaces em paralelo | Recovery de um único Helper | Nenhum dispose de Agent entre workspaces; o isolamento por identidade de workspace é mantido |
| HLR-08 | Desktop continuous | Helper ready/recovery | Nenhuma mensagem de recuperação replayable é injetada e o cursor continuous não muda |
| HLR-09 | Mobile remote/replayable | Recovery do Helper do Desktop | O celular se recupera apenas pelo attachment shared-host e não cria um segundo Helper/runtime |
| HLR-10 | Recovery do Helper concorrente com spawn do Agent | Interleaving de generation | Não é emitido tuple antigo; e também não há dispose de um Agent já em execução por falha na verificação de geração |
| HLR-11 | Falha na verificação de token/identidade do Helper | Recovery concluído | CUA em fail-closed; Agent e módulos comuns continuam rodando |
| HLR-12 | Usuário fecha o workspace / o próprio Agent crasha | Evento não relacionado ao Helper | A semântica existente de dispose/restart do Agent é permitida e não pode ser atribuída ao recovery do Helper |
| HLR-13 | Helper já indisponível | Próxima fronteira de resolve/spawn da CUA | Executa uma única sonda/recovery sob demanda e limitada; não inicia timer periódico e não recicla o Agent |
| HLR-14 | Plugin CUA em execução e com Agent ativo | Submissão de desativação na página de ajustes | Escreve apenas a configuração de inicialização; não fecha o MCP CUA/Helper existente nem reinicia o Agent; conversas existentes mantêm as capacidades originais, novas conversas não recebem injeção de MCP CUA e o usuário é avisado de que conversas existentes precisam reiniciar o ZCode para a mudança ter efeito |

Asserções obrigatórias:

- Nos logs de ciclo de vida do Helper não pode aparecer `workspace-dispose` causado diretamente por readiness/recovery;
- O `runtimeIdentity`, a sequência de eventos de session e o turno ativo do mesmo Agent não mudam por causa do Helper ready;
- Uma falha de requisição CUA precisa carregar o fato de retryable/delivery-state e não pode se disfarçar de crash do Agent;
- O tempo de inicialização de módulos não CUA não inclui o budget de health completo do Helper;
- Os perfis de delivery de desktop e mobile não se espalham um para o outro.

## VII. Observabilidade e atribuição de falhas

Adicionar ou manter os seguintes campos de ciclo de vida de baixa frequência:

- `helperGeneration`, `helperProcessIdentity`, `readiness`;
- `agentRuntimeIdentity` (apenas para correlação, não como controle do Helper);
- `recoveryCause`: `cold-start`, `health-degraded`, `process-exit`, `permission-refresh`;
- `agentInvalidationRequired`: a implementação da especificação precisa ser `false`;
- `retryable`, `request_delivery_state` e `possibly_sent` das requisições CUA.

Os seguintes fenômenos devem ser classificados diretamente como regressão:

- SIGTERM do Agent, `workspace-dispose` ou nova runtime generation depois de Helper ready/recovery;
- resume de session disparado apenas pelo Helper ready;
- Spawn comum do Agent aguardando a inicialização completa do Helper;
- Token do Helper entrando no env global do Agent ou em subprocessos não CUA.

## VIII. Ordem de implementação após a mudança da spec

1. Primeiro adicionar/atualizar os testes de contrato de service e do producer resolver, travando que "eventos do Helper não podem dispor do Agent".
2. Depois implementar o P0, confirmando o desacoplamento entre startup/recovery do Agent e readiness da CUA.
3. Em seguida implementar a facade de broker estável do P1; ao envolver o protocolo do broker, atualizar em sincronia o producer e os tipos/com validação de runtime do shared.
4. Por fim remover a semântica antiga de recycle e atualizar o catálogo de cases de E2E de conversation/CUA e a matriz de cobertura.
5. Depois de concluir, executar `pnpm typecheck`, `pnpm lint`, os unit tests afetados e o E2E de CUA do desktop; plataformas que não puderem ser verificadas em máquina real precisam listar riscos e evidências pendentes na MR.

Esta especificação não permite usar "prolongar o tempo de espera do Helper" como solução final. O tempo de espera só atenua a percepção de cold start e não muda o ownership de erro entre o Helper e o runtime do Agent.

## IX. Estado da implementação atual

### Suplemento de integração da Todo103: parada explícita e mensagens de transport tardias

O Host do Windows é o único owner do transport tuple. Uma saída anormal pode preservar o tuple para recuperação sob demanda; uma parada explícita o limpa.
Quando o stop já começou mas o subprocesso antigo ainda não saiu, mensagens tardias de ready/transport_ready não podem republicar um tuple já invalidado, e o próximo cold start precisa produzir um tuple novo.

```text
显式 stop -> 失效当前 generation、清除 tuple -> 等待旧进程退出 -> 新 generation
                     |
                     `-> 旧 ready/transport_ready：忽略，不发布 tuple 或 health handle
```

Isso não adiciona mecanismo novo de ciclo de vida ou sincronização do Agent, apenas completa a fronteira de combinação entre o cache de tuple novo do source e o stop epoch existente.

- P0 implementado: `reconcileRecoveredHelper` e o recovery comum do Helper não chamam mais o callback de recycle do Agent; o recovery admission do Desktop não fecha mais o Agent nem o reconstrói via `disposeWorkspace`.
- No product Host do macOS o recovery comum prioriza reutilizar o transport já validado; assim o processo do Helper pode reiniciar enquanto o Agent existente continua usando o mesmo socket/token.
- O recovery do Windows agora também reutiliza o named pipe/token existentes; o processo do Helper pode ser substituído e o transport host-facing do Agent existente não muda. O fallback cold/fresh sem handle validado afeta apenas o spawn admission posterior e não dispara recycle do Agent.
- A facade estável do P1 foi implementada como "facade pertencente ao Host": os Hosts macOS/Windows reutilizam o mesmo socket/token Agent-facing no recovery comum, o processo do Helper é apenas um downstream substituível; o broker client continua tratando a saída breve do Helper pelo warmup retry limitado e pelo delivery-state já existentes, sem precisar de um novo processo residente separado.
- P2 consolidado: a montagem padrão de services não injeta mais `CuaAgentAdmissionGate`; `recycleUntilStable` e `onHelperCredentialsRotated` foram removidos; o tipo `CuaAgentAdmissionGate` é mantido como export de compatibilidade, mas não participa mais do spawn padrão do Agent.
- A montagem padrão de services não inicia mais `startCuaHelperLivenessWatchdog`, portanto não existe mais a cadeia de `resolver.restart()` automático após falha de sonda a cada 10 segundos; o `checkHealth` limitado no spawn env e no Producer resolver é mantido como verificação sob demanda.
- O interruptor do plugin CUA foi alinhado ao BUA como gateamento por tempo de inicialização: a desativação explícita escreve apenas a configuração, sem tratar Agent já em execução, MCP CUA existente ou Helper; no início de um novo Host/Agent/App, após ler disabled, não se injeta MCP CUA nem se inicia o Helper. A página de ajustes precisa avisar que conversas existentes exigem reiniciar o ZCode para a mudança ter efeito.