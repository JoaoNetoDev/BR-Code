# Folha de Trabalho de Decisões de Recovery e Isolation de Conversation Session

Objetivo: quebrar os 21 cases de armazenamento, ciclo de vida, mudanças externas de workspace e isolamento entre sessões — `D01-D05`, `L01-L08`, `W01-W05`, `X01-X03` — em contratos de produto confirmáveis, reescrevíveis e automatizáveis. Este documento organiza apenas a superfície de decisão e a superfície de verificação, sem decidir por produto o comportamento final.

Documentos relacionados:

- Catálogo de faults de ambiente: [conversation-session-environment-fault-catalog.md](./conversation-session-environment-fault-catalog.md)
- Backlog de decisões: [conversation-session-decision-backlog.md](./conversation-session-decision-backlog.md)
- Protocolo de injeção de faults de FS: [e2e-fs-fault-injection.md](./e2e-fs-fault-injection.md)
- Arquitetura de workspace remoto: [web-remote-control/web-remote-control-architecture.md](../web-remote-control/web-remote-control-architecture.md)
- Sincronização realtime de tasks: [web-remote-control/task-realtime-sync.md](../web-remote-control/task-realtime-sync.md)

## Limites atuais da infraestrutura

| Capacidade | Cases que pode cobrir |
| --- | --- |
| `ZCODE_E2E_FS_FAULTS` | Escrita do DB da session, criação do diretório pai do workspace / escrita não atômica / remoção, gravação de settings/provider, gravação de logs/artifacts |
| Injeção de faults no SQLite | `ENOSPC/EACCES/open_failed` em DB open, migration e history write |
| Artefatos de rede por replay/capture | Se requisições de modelo, requisições SSE e requisições de compact continuam antes e depois do ciclo de vida ou de uma desconexão |
| Helpers de store do renderer | task runtime, queue, permission request, workspace init state, activeInputId |
| Bus realtime de tasks / logs de saída do host | host crash, remote disconnect, owner command failure, snapshot invalidation |
| Caminho básico de E2E multi-session | Sessões A/B/C concorrentes, asserções positivas de que o stream inativo não sobrescreve a session ativa |

O que ainda não está definido é a convenção de produto: o que o usuário vê ao final, se a queue é preservada, se há recuperação automática, se é permitido continuar operando e se desktop continuous e mobile replayable seguem a mesma convenção.

## Estatísticas atuais

| Métrica | Quantidade |
| --- | ---: |
| Cases de Recovery/Isolation | 21 |
| Perguntas de protocolo de Recovery/Isolation | 21 |
| answered | 0 |
| unanswered | 21 |

## Dimensões gerais de decisão

| Dimensão | O que precisa ser confirmado |
| --- | --- |
| Estado visível ao usuário | Como usar, respectivamente, inline error, toast, badge na lista de tasks, banner de workspace, modo somente leitura e erro na página de configurações |
| Estado de runtime | Se o turno atual continua, falha, fica interrupted, fica notReady ou apenas registra um warn |
| queue / draft | Se queue, composer draft, pendingAction e pending permission são preservados |
| Estratégia de recuperação | Se após reload/relaunch/reconnect há recuperação automática, exibição de falha de recuperação ou exigência de retry manual pelo usuário |
| Capacidade de operação | Se continuar enviando, retry, edit, fork, compact, stop e salvar configurações estão disponíveis |
| Persistência | Como tratar user/assistant/timeline/error já exibidos mas ainda não persistidos |
| Fronteira multiplataforma | Se desktop continuous e mobile replayable usam a mesma convenção; se é preciso distinguir workspaceIdentity |

## Índice de perguntas de protocolo P1/P2

Esta tabela é a superfície de protocolo em nível de case, lida pelo script de auditoria. `Status=unanswered` significa que aquele fault case ainda não pode ser reescrito como `accepted` nem receber asserções estáveis de E2E; nesse estado, `产品结论` precisa permanecer `待确认`. Depois que o produto confirma, escreva primeiro uma conclusão explícita, depois mude a linha correspondente para `answered` e, por fim, reescreva o fault catalog / coverage matrix.

| Question | Case | Status | 产品结论 | O que precisa confirmar | Palavras-chave de verificação | Alvo de reescrita |
| --- | --- | --- | --- | --- | --- | --- |
| D01.1 | D01 | unanswered | 待确认 | Alerta na UI após ENOSPC na escrita do session history, estado em memória, queue e semântica de relaunch | sqliteRun fault、DB、queue、relaunch | fault D01、fault coverage D01 |
| D02.1 | D02 | unanswered | 待确认 | Tool block após falha da escrita de arquivo do workspace pelo tool, continuação do assistant, estado do turno atual e entrada de retry | workspace 父目录创建 / 非原子写 fault、tool block、file content | fault D02、fault coverage D02 |
| D03.1 | D03 | unanswered | 待确认 | Erro de formulário após falha de gravação de provider/settings, preservação da entrada, rollback da configuração e bloqueio de envio | settings/provider fault、form state、config file | fault D03、fault coverage D03 |
| D04.1 | D04 | unanswered | 待确认 | Na recuperação de inicialização com DB/snapshot corrompido: pular, isolar em backup, impedir a entrada ou exibir erro de recuperação | corrupt DB、workspace init、restore UI | fault D04、fault coverage D04 |
| D05.1 | D05 | unanswered | 待确认 | Se a falha de escrita de log/artifact é visível ao usuário, se o fluxo principal continua e se o fallback de truncamento é aceitável | log fault、artifact fallback、warn | fault D05、fault coverage D05 |
| L01.1 | L01 | unanswered | 待确认 | Se agent/SSE continuam ao trocar de app ou minimizar, como o stream é retomado ao voltar ao foreground e como o unread é sinalizado | background、foreground、stream、draft | fault L01、fault coverage L01 |
| L02.1 | L02 | unanswered | 待确认 | Se host/agent continuam ao fechar/ocultar a janela, como restaurar ao reabrir e como tratar diferenças de plataforma | window close、host lifecycle、task restore | fault L02、fault coverage L02 |
| L03.1 | L03 | unanswered | 待确认 | Após quit/relaunch, se o turno em execução é interrupted/failed/notReady/replay resume e como a queue é recuperada | app quit、snapshot、queue、timeline | fault L03、fault coverage L03 |
| L04.1 | L04 | unanswered | 待确认 | Após reload/crash do renderer, como são recuperados o caminho continuous, a queue e o activeInputId | renderer reload、store rehydrate、snapshot | fault L04、fault coverage L04 |
| L05.1 | L05 | unanswered | 待确认 | Se o host process é reconstruído automaticamente após crash, e como tratar o estado da UI e a pending permission/queue | kill host、owner lost、workspace notReady | fault L05、fault coverage L05 |
| L06.1 | L06 | unanswered | 待确认 | Código de erro após crash/exit do agent process, reinício automático, e se o turno atual e a queue são preservados | kill agent、PROCESS_EXIT、queue | fault L06、fault coverage L06 |
| L07.1 | L07 | unanswered | 待确认 | Após sleep/wake: continuar aguardando, falhar automaticamente, reconectar automaticamente ou sinalizar recuperação manual, e o limiar de timeout | sleep/stall simulation、transport close | fault L07、fault coverage L07 |
| L08.1 | L08 | unanswered | 待确认 | Se o app sair durante compacting, como marker, pendingAction e queue são recuperados | compact quit、marker、pendingAction | fault L08、fault coverage L08 |
| W01.1 | W01 | unanswered | 待确认 | Após o workspace desaparecer, entrada, histórico, file tree e chamadas de tool ficam somente leitura, bloqueados ou permitem falha | workspace missing、composer、file tree | fault W01、fault coverage W01 |
| W02.1 | W02 | unanswered | 待确认 | Tool error após mudança externa no arquivo alvo durante leitura/escrita, se o assistant fica ciente da falha e se há reread/retry em um clique | stale write、not_found、assistant | fault W02、fault coverage W02 |
| W03.1 | W03 | unanswered | 待确认 | Após o git repo sumir ou o dirty state mudar, a UI detecta automaticamente e o agente atualiza o git context no turno seguinte | git capability、action menu、env context | fault W03、fault coverage W03 |
| W04.1 | W04 | unanswered | 待确认 | Após remote disconnect, como desktop continuous e mobile replayable exibem, reconectam e preservam o pending | remote disconnect、clientMode、workspaceIdentity | fault W04、fault coverage W04 |
| W05.1 | W05 | unanswered | 待确认 | Pending permission ao alternar/fechar/desconectar: preservar, expirar, rejeitar automaticamente ou vincular à active session | permission queue、task store、response routing | fault W05、fault coverage W05 |
| X01.1 | X01 | unanswered | 待确认 | Quando a requisição principal de A falha em background, B fica completamente alheio, há toast global e como o item A é marcado | inactive failure、active DOM、task list badge | fault X01、fault coverage X01 |
| X02.1 | X02 | unanswered | 待确认 | Quando o compact em background de A falha, toolbar/sidebar de B ficam isolados e como o marker de A e o aviso global são exibidos | inactive compact failure、switch back | fault X02、fault coverage X02 |
| X03.1 | X03 | unanswered | 待确认 | Ao voltar de B para A em erro, como são recuperados a distinção entre error, queue, buttons e restore failed | switch back、error detail、buttons | fault X03、fault coverage X03 |

## D. Falhas de sistema de arquivos / armazenamento

| ID | Falha | Observação do código atual | Conclusão de produto que precisa ser confirmada | E2E / asserções sugeridas |
| --- | --- | --- | --- | --- |
| D01 | `ENOSPC` na escrita do session history | É possível injetar fault antes da escrita SQLite; antes da falha nada vai para a tabela de mensagens correspondente | Se a UI avisa; se o estado em memória continua; se a queue é preservada; após reiniciar, o turno não persistido é perdido, fica com falha de restauração ou é marcado como anômalo | fault `sqliteRun`; asserir UI, DB, relaunch e queue |
| D02 | Disco cheio / sem permissão ao gravar arquivo do workspace pelo tool | O erro de escrita de arquivo do workspace é normalizado para `io_error` / `permission_denied`; hoje o fault injection cobre a criação do diretório pai, a escrita não atômica e a fronteira de remoção. O padrão atomic temp/rename não recebe injeção; se o caminho atômico falha, o temp é limpo e há fallback para escrita não atômica com `O_TRUNC`, o que pode truncar o arquivo alvo — comportamento hoje aceito provisoriamente como decisão vigente | Se o tool block é failed; se o assistant continua explicando a falha; se o turno atual é failed; se há entrada de retry/abrir arquivo | fault de criação do diretório pai / escrita não atômica do workspace; asserir tool block, conteúdo do arquivo e continuação do assistant |
| D03 | `EACCES/ENOSPC` na gravação de provider/settings | A gravação de settings/provider faz reject; na falha não cria arquivo novo ou limpa o temp | Inline error/toast na página de configurações; se a entrada do formulário é preservada; se há rollback da configuração antiga; se continua bloqueado o envio de mensagens | fault de settings/provider; asserir formulário, arquivo e estado de seleção de modelo |
| D04 | DB/snapshot corrompido na recuperação de inicialização | Falha de DB open/migration tem erro estruturado; o opener de startup não tem estratégia de isolamento de banco corrompido | Pular a session corrompida, isolar em backup, impedir a entrada no workspace ou exibir erro de recuperação; se é permitido exportar logs/reconstruir o banco | fixture de DB corrompido; asserir lista de tasks, workspace init e entrada de recuperação |
| D05 | Falha de escrita de log/artifact | O sink de log engole o erro; falha de artifact de tool cai para inline truncado e o tool tem sucesso; falha de artifact de checkpoint gera warn | Quais falhas de artifact precisam ser visíveis ao usuário; se a ausência de log é sinalizada; se o fallback de truncamento de saída grande é aceitável | fault de artifact/log; asserir que o fluxo principal continua, o warn e a truncagem inline |

### Modelo de resposta do grupo D

```text
D01 = UI 告警 / 内存态 / queue / relaunch：
D02 = tool block / assistant 是否继续 / 当前轮状态 / 重试入口：
D03 = 设置页错误 / 表单保留 / 配置回滚 / 是否阻止发送：
D04 = 坏 DB/坏 session 恢复策略 / 日志导出：
D05 = 日志-artifact 失败是否用户可见 / 主流程是否继续：
```

## L. Falhas de ciclo de vida do app / processo

| ID | Falha | Observação do código atual | Conclusão de produto que precisa ser confirmada | E2E / asserções sugeridas |
| --- | --- | --- | --- | --- |
| L01 | Trocar para outro app / minimizar | O composer draft é salvo em blur/pagehide/freeze/hidden; não há lógica de pausar a session em execução | Se agent/SSE continuam em background; ao voltar ao foreground, se o stream é retomado ou o snapshot é preenchido; como notificações e unread se manifestam | background/foreground; asserir stream, draft e unread |
| L02 | Fechar a janela atual sem sair do app | No macOS, close é hide por padrão; dispose do host só ocorre no closed de verdade; no Windows há configuração separada de close-to-tray | Se close/hide continuam executando; como recuperar ao reabrir a janela; se a última janela e as demais são diferenciadas | window close/open; asserir host/agent, task runtime e logs |
| L03 | Sair do app e reabrir depois | O quit espera o dispose de host/agent; parece uma coleta ativa do agent em execução | Após o relaunch, o turno em execução é interrupted, failed, notReady ou retoma por replay | quit/relaunch; asserir snapshot, timeline, queue e rede |
| L04 | Reload/crash do renderer | O dom-ready reconstrói o host; tasks históricas passam por resume/snapshot; falha de restore deixa notReady/workspace failed | Se a queue/activeInputId são preservados durante o reload; se o continuous é preenchido com snapshot ou fica interrupted | renderer reload; asserir store rehydrate, snapshot e queue |
| L05 | Crash/restart do host process | O unregister do host faz as deliveries pendentes de owner/session falharem, libera o lease e emite snapshot invalidation | Se o host é reconstruído automaticamente; se a UI mostra erro global ou workspace notReady; como queue/permission pending são tratadas | kill host; asserir taskRealtimeBus, UI e logs |
| L06 | Crash/exit do agent process | O close do stdio faz reject das requisições pendentes; o process manager remove o client; a UI pode ver apenas o fechamento de protocolo | Se o agent é reiniciado automaticamente; se o código de erro é unificado em `PROCESS_EXIT`; se o turno atual/queue são preservados | kill agent; asserir task_error, queue e retry |
| L07 | Sleep/wake do sistema | Não há tratamento dedicado via `powerMonitor`; a cobertura vem de stall/transport close/restore | Após o sleep: continuar aguardando, falhar automaticamente, reconectar automaticamente ou sinalizar recuperação manual; e o limiar de timeout | simulação de sleep/stall; asserir reconnect, timeout e stop |
| L08 | App fechado/saindo durante compacting | Não há caminho dedicado de compact quit; depende da escrita do marker antes da saída e do snapshot de recuperação | Se o compact marker é failed, interrupted, unknown ou removido; como pendingAction/queue são recuperados | compact quit/relaunch; asserir marker, queue e requisições |

### Modelo de resposta do grupo L

```text
L01 = 后台是否继续 / 回前台追流 / unread：
L02 = hide/close 语义 / host-agent 是否继续 / 重开恢复：
L03 = quit 后 running turn 状态 / queue / 用户提示：
L04 = renderer reload 后 continuous 恢复 / queue / activeInputId：
L05 = host crash 后 UI / 自动重建 / pending：
L06 = agent crash 后错误码 / 自动重启 / queue：
L07 = sleep-wake 策略 / 超时阈值：
L08 = compact quit 后 marker / pendingAction / queue：
```

## W. Mudanças externas em Workspace / Tool

| ID | Falha | Observação do código atual | Conclusão de produto que precisa ser confirmada | E2E / asserções sugeridas |
| --- | --- | --- | --- | --- |
| W01 | Diretório do workspace removido/renomeado | Arquivo/diretório ausente vira `not_found` no momento da chamada; Git com cwd ausente é rebaixado para não-repo | Se a entrada é bloqueada, se há aviso para reselecionar, se o histórico é preservado em somente leitura ou se é permitido continuar com falha no tool | mutação de fs; asserir composer, file tree, tool e history |
| W02 | Arquivo alvo modificado/removido externamente durante leitura/escrita por tool | Write tem `write_file_not_read` / `write_file_stale`; revision de FS divergente é `stale_write` | Como o tool error é exibido; se o assistant fica ciente da falha; se há reread/retry em um clique | mutação externa de arquivo; asserir tool block, arquivo e assistant |
| W03 | Repo git inexistente ou dirty state alterado | O resolve do Git diferencia unavailable/non-repo; o action menu do Git depende de `isRepository`; o git context do agente é um snapshot de início | Se a UI reprobeia automaticamente; se o agente atualiza o git context no turno seguinte; se turnos antigos preservam o snapshot | mutação do git repo; asserir action menu, context e tool/log |
| W04 | Queda da conexão SSH/WSL/Docker remota | O host remoto faz dispose e sai; o realtime bus emite owner lost invalidation; o attachment remoto exige workspaceIdentity | O que desktop continuous e mobile replayable exibem cada um; se há reconexão automática; se queue/permission são preservadas | remote disconnect; asserir clientMode, workspaceIdentity e snapshot invalidated |
| W05 | Alternar/fechar com permission request pendente | O permission request é uma fila em nível de task; o snapshot reproduz os pendentes; o close do client limpa os pending do service | Se o pending permission é preservado, expira, tem reject automático ou fica vinculado à active session; como a resposta é sincronizada entre plataformas | pending permission; asserir task store, notification e response routing |

### Modelo de resposta do grupo W

```text
W01 = workspace missing 后输入/历史/file tree/tool：
W02 = stale write / not_found 后 tool/assistant/retry：
W03 = git capability 自动刷新 / agent context：
W04 = remote disconnect desktop/mobile 策略 / 重连 / pending：
W05 = permission pending 切换/关闭/断线策略：
```

## X. Isolamento de falhas entre Sessions

| ID | Falha | Observação do código atual | Conclusão de produto que precisa ser confirmada | E2E / asserções sugeridas |
| --- | --- | --- | --- | --- |
| X01 | A running, B active, a requisição de modelo principal de A falha | runtime/error/messages são gravados por workspaceIdentity + taskId; estados terminais descartam inputs antigos por activeInputId | Se B fica completamente alheio; se é permitido um toast global; se o item da lista de A exibe um badge de erro | fixture de inactive failure; asserir active DOM, item da lista de A e switch back |
| X02 | A compacting, B active, o compact de A falha | O compact marker pertence à timeline da task e é restaurado por taskId | Se a toolbar/sidebar de B fica completamente intocada; se o marker de A só aparece ao voltar para A; se há aviso global | inactive compact failure; asserir DOM de B, snapshot de A e switch back |
| X03 | A error, B active, voltando para A | restore/snapshot preenchem pending/runtime/messages por taskId; o objeto de erro completo fica no task store | Após voltar para A, como são recuperados o banner de erro, a queue e retry/edit/fork/compact; e como se distinguem restore failed de task failed | switch-back error; asserir buttons, queue e detalhe do erro |

### Modelo de resposta do grupo X

```text
X01 = B 是否无感 / 全局 toast / A item badge / 切回 A：
X02 = B toolbar-sidebar / A compact marker / 全局提示：
X03 = 切回 A 后 error / queue / buttons / restore failed 区分：
```

## Camadas de verificação

| Camada | Asserções |
| --- | --- |
| UI | Estado da chat view, banner de workspace, badge da lista de tasks, bloco de erro, diálogo de permissão e botões de ação |
| Runtime/Store | taskRuntime, taskUi error, queue, permission queue, workspaceInitState, activeInputId e stopRequested |
| Processo/Protocolo | Saída do host, saída do agent, owner command failure, falha de entrega de mensagem de sessão e snapshot invalidated |
| Arquivos | DB/session snapshot, arquivos do workspace, config de settings/provider e logs/artifacts |
| Rede | Se as requisições running/compact continuam, são interrompidas ou repetidas; capture antes e depois do remote disconnect |
| Multi-client | Se desktop continuous e mobile replayable são separados por clientMode / deliveryKind |

## Ordem de implementação sugerida

1. `D03`: falha de gravação de settings/provider, a mais próxima de um formulário de UI comum e a mais fácil de fechar primeiro.
2. `D02/W02`: falha de escrita de arquivo por tool e modificação externa, que reaproveitam os fs faults e o tool block já existentes.
3. `X01/X03`: isolamento de erro entre sessões, complementando diretamente com fault o caso positivo multi-session existente.
4. `W05`: alternar/fechar com permission pending, que já tem base de testes unitários de store/runtime monitor.
5. `L01/L04`: background/reload, priorizando a verificação da recuperação de UI sem tocar ainda em crash real de processo.
6. `D01/D04/D05/L02-L08/W01/W03/W04/X02`: completando, na ordem, os casos mais pesados de relaunch, host/agent, remote e compact desconectado.

Regras de reescrita após a confirmação:

1. Atualizar as expectativas de produto e o Review dos cases correspondentes em `docs/testing/conversation-session-environment-fault-catalog.md`.
2. Atualizar `docs/testing/conversation-session-decision-backlog.md`, removendo as linhas já confirmadas ou marcando-as como aceitas.
3. Adicionar a abreviação do fault spec em `docs/testing/conversation-session-e2e-coverage-matrix.md` e mover o fault case correspondente de decision-needed para o acompanhamento `missing/covered`.
4. Escrever o fault fixture / WDIO spec / unit helper necessários.
5. Executar `pnpm audit:conversation-session-coverage`, o spec alvo, `pnpm typecheck` e `pnpm lint`.