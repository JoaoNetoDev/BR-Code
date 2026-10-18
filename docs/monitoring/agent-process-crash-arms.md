# Reporte ARMS de crash do processo do Agent

## Objetivo

O ZCode Agent iniciado pelo Host do desktop é um subprocesso Node comum e não pertence ao escopo de coleta automática `child-process-gone` do Electron. Quando o Agent sai de forma inesperada, o `RuntimeProcessLifecycleReporter` existente precisa enviar ativamente o fato do crash ao desktop main, que então chama o ARMS `sendCustom`.

Esta funcionalidade atende simultaneamente a:

- `perf_agent_start.value=1`, como denominador da taxa de crash de nível de runtime do Agent.
- `perf_agent_ready.value=1`, indicando que o mesmo runtime já passou pelo gate de provider/model e consegue executar o modelo.
- `perf_agent_crash.value=1`, usado para contar as ocorrências de crash do Agent.
- O evento original mantém a informação de erro desidentificada e limitada em tamanho, permitindo agregação por código de erro e impressão digital estável.
- Encerramento ativo, restart de workspace e saída do app não contam como crash.
- O controle remoto do celular continua reutilizando o shared host do desktop e não reporta em duplicidade no relay ou na Web.

## Estado e temporização

```text
Agent stderr
   │
   ├─ Node spawn 成功
   │    └─ host IPC → desktop main → perf_agent_start
   │
   ├─ Agent service 通过 provider/model 门禁
   │    └─ ProcessManager.markReady（每个 runtime 幂等一次）
   │         └─ host IPC → desktop main → perf_agent_ready
   │
   ├─ Host services：脱敏并保留最后 20 行
   │
   └─ Agent exit
        │
        ├─ terminationIntent=expected
        │    └─ 只做进程登记清理，不发 perf_agent_crash
        │
        ├─ terminationIntent=watchdog_recycle
        │    └─ request timeout 回收，不混入 crash
        │
        ├─ desktop lifecycle=app_quit/update_install
        │    └─ main 已进入不可逆退出流程，不发 perf_agent_crash
        │
        └─ 无 terminationIntent
             └─ host IPC → desktop main
                  ├─ terminationReason=protocol-close
                  │    └─ 即使最终为 SIGTERM / 0x40010004，仍发 perf_agent_crash
                  │
                  ├─ 无结构化根因，且 exitCode=0x40010004 / signal=SIGTERM
                  │    └─ 受控终止噪音，不发 perf_agent_crash
                  │
                  └─ 其他 unexpected exit
                       └─ ARMS perf_agent_crash(value=1)
```

`protocol-close` é um resultado comum depois de um crash do Agent, não uma intenção de saída ativa, e é proibido marcar a saída como expected com base nele.

O desktop main é a única fonte de verdade do ciclo de vida de saída da aplicação. Depois que `perf_app_exit` é emitido, `app_quit` / `update_install` precisa continuar sendo mantidos até o processo sair; um Agent exit que chega tarde via Host IPC, mesmo sem termination intent, não pode voltar a ser misturado a um runtime crash. Além disso, a fronteira de RUM local do desktop trata o Windows `0x40010004` e o POSIX `SIGTERM`, na ausência de causa raiz estruturada, como características de terminação controlada: mesmo que o Host não forneça termination intent, nenhum crash é reportado. O próprio `protocol-close` não pode estabelecer uma intenção de saída ativa; o Host precisa passar a primeira causa de cleanup como `terminationReason` ao desktop main. Mesmo que a posterior recolha da árvore de processos produza essas características de saída do sistema, o RUM do desktop continua reportando crash por falha de protocolo. Essa classificação de compatibilidade afeta apenas o RUM do desktop e não reescreve os eventos de ciclo de vida de processo do Host.

O estado ready é mantido pelo Agent service, porque “o processo já foi spawn” e “consegue executar o modelo” são dois estágios diferentes. O ProcessManager é responsável apenas por vincular o primeiro ready ao `runtime_instance_id` atual e por carregar `runtimeReady` no evento de exit. O desktop main não infere o estágio pela temporização de chegada do IPC: um Host novo é mapeado explicitamente como `startup` / `runtime`, e um Host antigo sem o campo é mapeado como `unknown`.

## Contrato de eventos

### `perf_agent_start`

- `group`: `stability`
- `value`: `1`
- Gatilho: o `ChildProcess` do Node emite `spawn`, confirmando que o runtime realmente iniciou.
- Propriedades: `process_role=agent`, `runtime_instance_id`, `runtime_generation`, `provider`.

### `perf_agent_ready`

- `group`: `stability`
- `value`: `1`
- Gatilho: o mesmo runtime passa pelo gate de provider/model pela primeira vez e ainda é o processo vivo atual.
- Propriedades: `process_role=agent`, `runtime_instance_id`, `runtime_generation`, `provider`,
  `startup_duration_ms`.
- O mesmo `runtime_instance_id` é reportado no máximo uma vez; quando só houve start de leitura e o provider/model ainda não está pronto, apenas `perf_agent_start` é produzido, sem ready.

### `perf_agent_crash`

- `group`: `stability`
- `value`: `1`
- Gatilho: ocorre saída do processo com um runtime de Agent já criado, mas sem intenção de saída ativa. Um `0x40010004` / `SIGTERM` sem causa raiz estruturada continua sendo suprimido como característica de terminação controlada; com `terminationReason=protocol-close`, a assinatura final de saída não tem influência. Mesmo com `exitCode=0`, um Agent de longa duração que termina por conta própria também é uma saída inesperada.

Propriedades:

| Campo                  | Descrição                                                     |
| --------------------- | ------------------------------------------------------------- |
| `process_role`        | fixo em `agent`                                                |
| `incident_kind`       | fixo em `unexpected_exit`                                     |
| `exit_code`           | string vazia quando não há código de saída                    |
| `signal`              | string vazia quando não há signal                             |
| `termination_reason`  | causa raiz estruturada de saída preservada pelo Host, como `protocol-close` |
| `error_name`          | extraído do fim do stderr; `AgentProcessExit` quando não identificável |
| `error_code`          | extraído da saída de erro do Node, como `EPIPE`               |
| `error_message`       | resumo de erro desidentificado                                |
| `error_stack`         | cauda do stderr desidentificada e com no máximo 4000 caracteres |
| `error_fingerprint`   | hash estável do nome de erro, do código de erro e do primeiro erro normalizados |
| `stderr_line_count`   | número de linhas que o Agent escreveu no stderr durante todo o ciclo de vida |
| `runtime_instance_id` | ID aleatório e opaco gerado a cada spawn, sem workspace/PID    |
| `runtime_generation`  | geração atual do runtime do Agent do workspace                 |
| `uptime_ms`           | tempo de vida do Agent, do spawn ao exit                      |
| `crash_phase`         | `startup` / `runtime` / `unknown`                             |
| `termination_class`   | `exit_zero` / `exit_nonzero` / `signal` / `unknown`           |
| `diagnostic_class`    | `oom` / `sqlite` / `errno` / `generic` / `none`               |

O resumo de diagnóstico é extraído por prioridade determinística: OOM → SQLite → errno → exceção genérica → sem diagnóstico. `[Object]`,
parênteses finais de objeto, títulos de GC, endereços de native stack, posições internas do Node e SQLite ExperimentalWarning
permanecem apenas no `error_stack` desidentificado e não podem se tornar `error_message`. OOM usa
`AgentOutOfMemory / ERR_OUT_OF_MEMORY`; errno precisa gravar `EPERM`, `EPIPE` etc. em
`error_code`; o SQLite, mesmo sem SQLite code, é agregado por `diagnostic_class=sqlite`.

### `perf_agent_spawn_error`

- `group`: `stability`
- `value`: `1`
- Gatilho: o comando ou o cwd do Agent não pode ser spawnado.
- As propriedades reutilizam `error_name`, `error_code`, `error_message`, `error_stack`,
  `error_fingerprint` e `diagnostic_class`, carregando também o `runtime_instance_id` desta tentativa.

## Classificação de saída

| Causa                                        | Classificação                          | Reporta crash |
| -------------------------------------------- | -------------------------------------- | ------------- |
| `workspace-dispose`                           | `expected`                            | não           |
| `manager-dispose` / retry                     | `expected`                            | não           |
| `request-timeout`                             | `watchdog_recycle`                     | não           |
| desktop `app_quit` / `update_install`         | proteção de saída da aplicação        | não           |
| Windows `0x40010004` sem causa raiz estruturada | classificação de compatibilidade de terminação controlada do desktop RUM | não |
| POSIX `SIGTERM` sem causa raiz estruturada    | classificação de compatibilidade de terminação controlada do desktop RUM | não |
| qualquer code/signal após `protocol-close`   | sem intent, permanece `unexpected`    | sim           |
| outras saídas por code/signal sem pedido de cleanup | `unexpected`                    | sim           |

O termination intent definido pela primeira vez é o fato de causa raiz, e cleanups idempotentes posteriores não o sobrescrevem.

## Privacidade e volume

- É proibido enviar `workspacePath`, `workspaceIdentity`, command, args, variáveis de ambiente, ids de session/task ou entrada/saída do modelo.
- A camada de services mascara primeiro atribuições de token, cookie, authorization, password, secret etc.
- As camadas de services e desktop main mascaram chaves de API `sk-...` sem prefixo de atribuição; o texto de erro não pode escapar da desidentificação por não ter o prefixo `token=` / `Authorization`.
- O desktop main substitui caminhos absolutos de workspace por `<workspace>` e trunca os detalhes do erro em 4000 caracteres.
- O desktop main também substitui os diretórios home de usuário comuns de Windows/macOS/Linux; antes de gerar a impressão digital, remove ainda qualquer caminho absoluto, UUID, PID e número de linha/coluna, evitando vazamento de caminhos e alta cardinalidade.
- O reporte ARMS é uma observação em via lateral; qualquer falha de schema, IPC ou `sendCustom` não pode afetar a inicialização, a saída nem a recuperação automática do Agent.

## Fronteira de exceção em nível de processo do Agent

O modo de protocolo (`app-server` / `agent-server`) instala na entrada da CLI uma fronteira de exceção em nível de processo, cobrindo:

- `uncaughtException`
- `unhandledRejection`
- `uncaughtExceptionMonitor`

Essa fronteira grava as informações de diagnóstico em `stderr` e não escreve texto comum em stdout, evitando quebrar o canal NDJSON do ZCode Protocol. Uma exceção desconhecida que chega aqui significa que a camada de negócio não conseguiu se recuperar: após o primeiro relatório da exceção, o owner do ciclo de vida da CLI faz uma saída limitada e deixa de aceitar novo trabalho. Erros comuns de requisição/modelo/ferramenta continuam sendo tratados nas fronteiras de negócio originais.

```text
uncaughtException / unhandledRejection
             │
             ▼
CLI process-level boundary
             │
             ├─ stderr：记录类型、错误名、消息和栈
             ├─ stdout：不写任何诊断文本
             └─ CLI owner 停止接单、取消和清理、非零退出
```

A implementação inicial mantinha o processo vivo por meio de um listener e dependia da coleta por timeout do Host; essa premissa não vale quando o lado pai já desapareceu, e o EPIPE assíncrono do stderr dispara novamente a fronteira e corrompe o pipeline em ciclo. Agora a fronteira de escrita em stderr absorve de forma independente as falhas síncronas/assíncronas desse fluxo e desativa a saída; não se pode ignorar globalmente o EPIPE de outros fluxos. `uncaughtExceptionMonitor`
apenas registra a origin, e a strict rejection continua reportada de forma unificada pelo rejection listener. Exceções posteriores durante a limpeza
não repetem o diagnóstico nem estendem o prazo da primeira saída. A temporização completa está no spec de ciclo de vida do processo de protocolo da CLI.

Essa fronteira só é instalada no modo de protocolo e não altera a semântica original de saída por falha de comandos como o CLI headless comum, TUI, doctor e login. `perf_agent_crash` continua representando a saída real; se há ou não saída após a exceção não afeta o reporte de erros JS.

### Reporte de exceções JS da CLI (introduzido em 2026-09-14)

Causa raiz: a fronteira de exceção preserva o processo, mas o stderr só alimenta debug/exit tail e o SDK do Electron não consegue capturar automaticamente exceções de subproc Node. É preciso enviar explicitamente `exception` no momento da exceção, sem depender da coleta automática do `console.error` do log de saída.

```text
CLI 异常边界（errorId 唯一事实源）
  → stderr 单行 [zcode-process-exception] JSON v1
  → ProcessManager 校验 / 脱敏 / 绑定当前 runtime_instance_id
  → RuntimeProcessLifecycleReporter.onException
  → Host IPC agent-process-exception（运行时 schema 校验）
  → desktop main sendEvent(exception, type=error)
  → RUM JS 错误
```

- O contrato público compartilhado é `@zcode/shared/process-diagnostic` e é exportado a partir da entrada do ZCode Protocol.
  O alias de build CLI / SEA precisa declarar esse subcaminho com precisão, para que ele não seja montado no index.ts pelo alias shared genérico.
  Os campos são `version/errorId/kind/origin/name/message/stack/occurredAt`; kind/origin aceitam apenas
  uncaughtException / unhandledRejection. O nome tem no máximo 128 caracteres, a mensagem 4000, o stack 16000 e a
  linha JSON no máximo 128 Ki caracteres (cobrindo a inflação do escape JSON); versões desconhecidas, campos extras e quadros corrompidos não são encaminhados.
- Na mesma ocorrência de monitor + uncaughtException, somente o segundo produz a saída.
  Com o modo strict rejection do Node, o Node dispara primeiro o uncaughtException com origin=unhandledRejection e, depois de tratado, dispara o unhandledRejection; esse caso é reportado de forma unificada apenas pelo segundo, evitando a contagem dupla da mesma rejection.
  O stderr legível existente é mantido para o Host antigo e o crash tail; o Host novo não adiciona a linha estruturada de novo ao tail. A CLI consegue gerar essa saída já no início, sem depender da
  prontidão do protocolo stdout; o diagnóstico em si não adiciona temporizadores, filas de retry nem estado de negócio, e o prazo de saída é mantido de forma unificada pelo lifecycle da CLI. Qualquer falha de serialização/escrita não pode lançar uma nova exceção.
- O ProcessManager usa apenas a identidade de runtime do momento em que aquele child foi criado e não consulta o “processo atual” por caminho, evitando que uma exceção tardia de um processo antigo seja atribuída a um runtime novo. A exceção via IPC é uma observação em via lateral e não participa do estado de ready / exit / task.
- O Main é o único owner do SDK do RUM e do estado de desduplicação: mantém as 1024 últimas submissões enviadas por runtimeInstanceId + errorId; uma falha síncrona do SDK não é registrada como sucesso. errorIds diferentes com o mesmo stack precisam ser contados separadamente.
  Não se garante a entrega de uma exceção que ainda não foi escrita no pipeline antes de um kill forçado, e não se infere recuperação nem crash do processo a partir da exceção.
- O evento do RUM preserva o nome de erro original, a mensagem desidentificada e o stack, acompanhando process_role=agent, process_error_kind,
  process_error_origin, error_id, runtime_instance_id, runtime_generation, lane (se houver),
  app_version, arms_env, device_mid e a impressão digital estável. Reutiliza a desidentificação do main e o limite de 4000 caracteres;
  não envia workspace, comando ou identificadores de task/session.
- Os logs de saída/falha de spawn que já passaram pelo lifecycle reporter carregam uma marcação de diagnóstico explícita, e apenas esse tipo de
  evento encapsulado em console.error é filtrado; os logs de erro locais são preservados e os demais console.error continuam sendo coletados.
  “perf_agent_crash / perf_agent_spawn_error reported” passa a info, evitando gerar um erro JS depois de um reporte bem-sucedido.
- Na mistura de CLI/Host antigo e novo, o reporte de crash existente é preservado; o novo contrato de exceção não muda a versão wire do stdout.
  Esta cobertura vale para a CLI iniciada diretamente pelo Host do desktop; entradas de coleta independentes para a CLI de terminal isolada e o Agente remoto via SSH/WSL/Docker não fazem parte do que é adicionado agora. O shared-host do celular reutiliza essa via lateral e não duplica a coleta no relay/Web, e as
  semânticas de eventos de tarefa, owner/lease/fila de desktop continuous e web replayable não mudam.

Aceite: injetar throw / rejection em uma CLI real produz uma exceção JS antes mesmo da saída; em seguida, a saída limitada
exit 1 produz um evento de saída real, sem erro JS em log encapsulado. O Host gera o exit tail depois do drain do stderr e
não pode fechar o reader de diagnóstico no evento de child exit nem antes de enviar EOF.
Cobrir entrada IPC inválida, rejection que não é Error, debug de produção desativado, desidentificação de caminhos multiplataforma, eventos duplicados e
isolamento de falha de reporte. A validação em produção também registra a requisição SDK/resposta HTTP e confere o resultado do índice no RUM pela marca única.

## Verificação

- Um `exit 1` natural, um `exit 0` natural e um `SIGKILL` produzem um crash cada.
- Na ausência de `terminationReason`, o Windows `0x40010004` e o POSIX `SIGTERM`, mesmo marcados provisoriamente como
  `unexpected`, não produzem crash.
- Um spawn bem-sucedido produz um start, e o `runtime_instance_id` de start/crash é o mesmo.
- Cleanup ativo de workspace/app não produz crash.
- Um Agent exit que chega de forma assíncrona depois de `perf_app_exit` não produz crash, e o lifecycle não volta a runtime.
- `protocol-close → SIGTERM / 0x40010004 / outra saída` produz crash e carrega
  `termination_reason=protocol-close`.
- start / ready / crash do mesmo runtime compartilham `runtime_instance_id`, e ready ocorre no máximo uma vez.
- Uma saída antes do ready tem `crash_phase=startup`, após o ready tem `runtime`, e um Host antigo sem o campo tem `unknown`.
- Resumos de OOM, SQLite e errno obtêm um `diagnostic_class` estável, e ruído estrutural não entra no resumo.
- Um spawn com `ENOENT` produz um `perf_agent_spawn_error`.
- Credenciais e caminhos de workspace no stderr não entram no payload final.
- Um stderr muito longo é truncado em 4000 caracteres.
- Dois runtimes que quebram em pouco tempo produzem dois eventos, distinguíveis por `runtime_instance_id` diferente.
- No modo de protocolo, exceções síncronas não capturadas e Promise rejections não tratadas são gravadas em stderr, mas não fazem o processo
  CLI sair imediatamente; o CLI/TUI comum mantém o comportamento original de exceção não capturada.
- A fronteira de exceção em nível de processo não escreve texto não protocolar em stdout nem sobrescreve o `process.exitCode` existente.