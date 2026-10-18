# Cadeia de Mudança de Ferramentas

## Refresh da Configuração de Contexto do Subagent

Settings/escrita externa em disco → watcher nativo do Host → leitura arquivo a arquivo e parsing compartilhado puro → snapshot em memória →
session init/a mesma RPC do turno pai → definitions → listing / Agent / SendMessage / plugin-reference.
Falha de leitura de configuração: o snapshot marca fallback embutido; desconexão/cancelamento de RPC ainda encerra o turno pai, preservando a entrada e sem requisição ao provider.
Durante atualizações em segundo plano usa-se o snapshot completo antigo; child em execução não é atualizado, e o resume terminal usa as definições do turno pai preservando
o histórico de identidade. O diagnóstico do Host registra por arquivo; a CLI não faz parsing duplicado. Schema/execução/histórico da ferramenta e marcadores de cache permanecem inalterados.
Remove-se a difusão dedicada; não se estende para hot update de plugin, fontes CLI/remotas independentes nem semântica continuous/replayable.
Veja os detalhes em `docs/subagent-runtime-refresh.md`.

SHR09/SHR10 apenas acrescentam testes: salvamento real de campo único em Settings → spawn do próximo turno pai/resume terminal → persistência do provider
e das mudanças de modelo existentes; SendMessage em execução apenas entrega, sem atualizar o child. O controle de tempo fica no lado de testes,
sem adicionar marcadores de produção, RPC de teste ou ramos de estado de teste.

SHR10 Desktop, SHR11-SHR15 continuam apenas com complemento de testes: o proxy de teste do Host/CLI stdio real é responsável pela leitura de falhas e
pela observação de PID/session; o fixture de provider é responsável por retry e pela janela entre turnos. O Core valida Guide/Stop pelo loader existente, porta de modelo e
sinal de cancelamento; o model-io bruto do child é exportado por origem de subagent e o histórico de ferramentas é conferido requisição a requisição.
Código-fonte de produção, protocolo e dependências inalterados; comparar os checksums de todo o código-fonte de produção e dos arquivos de dependência antes de concluir.
Problema de cache do child encontrado em SHR15 já foi corrigido: a saída de sistema foi dividida em dois blocos, prefixo de CLI e corpo, cada um mantendo um
marcador, reserving orçamento para o breakpoint no fim da conversa. O prefixo principal da CLI não recebe mais marcador próprio; corpo e TTL inalterados.
Regressões de histórico completo, continuidade de trajectory e breakpoint de cache passaram; veja `docs/subagent-runtime-refresh.md`.

Regressão de cache SHR08: cacheControl da mensagem de ferramenta do Core → parte tool-result do providerOptions no Adapter → o AI SDK mescla as tool messages → tool_result.cache_control correspondente no Anthropic. O marcador acompanha o bloco de resultado original,
evitando que o SDK descarte o providerOptions das mensagens seguintes ao mesclar; schema da ferramenta, corpo e contrato de estado permanecem inalterados.

2026-09-15 Telemetria de recursos de comandos Bash lentos: após o spawn do adaptador de execução, amostragem por PGID a cada 15 segundos, com relatório imediato ao Host/main
na raiz ao sair ou na liquidação do stop por meio da notificação independente `process/toolExecResource`; foreground e background compartilham o mesmo amostrador, no máximo 20 amostras,
no Windows apenas o contexto final é obtido. Schema da ferramenta, permissões, saída, timeout, V4 e projeção continuous/replayable inalterados.
Os testes cobrem PRT-010/011/012, a classificação de saída do adaptador de execução e a consistência com Bash. Veja os detalhes em `docs/monitoring/process-resource-telemetry.md`.

Correções de 2026-09-15 na revisão: a notificação de recursos na conclusão do Bash ganhou um `completionToken` aleatório opcional, gerado pela CLI no owner de recurso de comando único,
encaminhado como está por services/Host, e having deduplicado pelo main com um conjunto recente limitado antes de projetar a allowlist ARMS. O mesmo fato de conclusão é reportado uma única vez entre conexões
e entre Hosts de janelas diferentes; métricas idênticas de comandos diferentes ainda são reportadas separadamente. O identificador não contém comando, caminho ou informação de session/task,
não entra no ARMS, nos logs ou em nenhuma linha V4; quando o CLI antigo não traz o campo, o comportamento original do evento é preservado. Saída da ferramenta, permissões e cadência de execução inalteradas.

## Todo151: estado independente do Plan

As Portas de Enter/ExitPlanMode, o Schema de retorno, o handler, a verificação de permissão, a rejeição/feedback, o reminder existente e a
projeção de configuração adotam juntos um planEnabled independente. A permissão de Runtime não muda pela entrada/aprovação do Plan; yolo não pode contornar
restrições de planejamento nem aprovação de plano. O rascunho só é atualizado de forma síncrona pela conversão da ferramenta associada a esta chamada, sem ser sobrescrito continuamente por um snapshot geral.
Os resultados históricos da ferramenta permanecem legíveis; não se modifica o corpo do prompt do modelo nem se adicionam eventos visíveis de entrada/saída.
O plano de salvamento e compatibilidade está em `docs/plan-mode-independent-state.md`; a correção de fidelidade do Queue pertence à mesma cadeia de commits.

2026-09-08 Bash shutdown: o close do adapter mantém vivo o encerramento assíncrono da árvore de processos existente; a regressão do Node independente cobre a limpeza dos Posteriores antes da conclusão. A saída normal da raiz, os eventos de ferramenta e o limite continuous/replayable permanecem inalterados; veja `docs/bash-background-parity.md`.

2026-09-08 Bash, agendamento de progresso: interval compartilhado por processo Node/ciclo de polling interno, com assinatura independente por tarefa e leitura de cauda; liberado quando a última assinatura sai. Mantém-se o watchdog de 5 GiB por tarefa; protocolo/exibição inalterados; os testes cobrem compartilhamento, handover, leitura concorrente e resultado atrasado, com reverificação do BG14 no Desktop.

2026-09-08 Desktop: o estado final do Bash transmite cabeçalho limitado, flag de truncamento e caminho do arquivo preservado por meio do display estrito `bash_output`; a interface mostra aviso de saída parcial e entrada de arquivo, ocultando linhas/bytes no estado de execução. Conteúdo do Provider e TUI inalterados; aceitação em `docs/bash-background-parity.md`.

## Saída direta de arquivo do Bash

2026-09-07 complemento: na liquidação por cancelamento de saída grande do Bash há corte do arquivo em 64 MiB, e o modelo recebe um resumo do cabeçalho e o caminho da saída completa.
A leitura de cauda limitada produz pré-visualização de 5/100 linhas e estimativa de linhas, entrando na projeção de linha de ferramenta V4 da CLI pelo contrato opcional `outputPreview`;
limpeza de pré-visualização em estado final/segundo plano, sem reutilizar o campo `progress` replayable-only. Os testes cobrem arquivo completo e eventos de progresso. Em 2026-09-08, conforme pedido final do usuário, mantém-se a renderização no Desktop e a verificação BG14; o TUI não muda.

O contrato concreto de saída e ciclo de vida do Bash comum está em
`docs/bash-background-parity.md`. As flags do arquivo de saída são escolhidas pela plataforma hospedeira, não pelo dialeto do shell.

```text
Bash schema / permission / handler
  -> Execution adapter：准备命令、异步 open 一次
  -> spawn(stdin, fd, fd) -> 关闭父 fd
  -> 子进程直接写 canonical output
  -> 前台有界 tail progress / 终态有界 head result
  -> Background registry / TaskOutput / 单次 completion notification
  -> 原有 runtime queue / V4 投影
```

Foreground e background usam o mesmo arquivo e o mesmo processo; a cada 5 segundos verifica-se o limite suave de 5 GiB, e a liquidação ocorre no exit do processo raiz.
Processos descendentes em segundo plano podem continuar escrevendo após o estado final, portanto o estado final não pode mais ser descrito como arquivo estável. Os contratos de pipe
e truncamento rígido do argv/Hook genérico permanecem inalterados. O Bash não emite mais eventos de stdout/stderr por chunk; reutiliza o protocolo progress/result;
a fronteira de entrega continuous do desktop e replayable do web remote permanece inalterada.

## Ordem de Declaração no Histórico de Ferramentas

A ordem de declaração das ferramentas do mesmo assistant pode diferir da primeira gravação quando a execução é antecipada. O ToolPart existente
é gravado carregando o `declarationIndex` opcional gerado pelo runtime. Rollback e recuperação de stream interrompido continuam criando um novo part, mantendo
o mesmo callID e número de declaração; a hydration de histórico do modelo escolhe, dentro do mesmo assistant, o último part criado para cada callID e só então
restaura a ordem de declaração de calls/results quando a sequência está completa. Sem o número, mantém-se a ordem original dos registros selecionados.
A restauração dos parts originais, da UI e do estado de leitura de arquivos não faz merge de chamadas nem ordenação de declarações.
Os callbacks de stream do modelo, o despacho de ferramentas e o momento da gravação permanecem inalterados.
Veja o contrato detalhado em [Proposta de correção da ordem do histórico de ferramentas](./tool-history-order-repair-proposal.md).

```text
声明 Bash(0) -> Read(1) -> 原有落盘 Read(1), Bash(0)
                       -> hydration calls/results Bash(0), Read(1)
```

## Injeção de Dependências de Runtime no Read de PDF

```text
宿主创建/注入 PdfDocumentPort
  -> AgentRuntimeDeps（主任务与子任务）
  -> createRuntimeToolExecutor
  -> ToolExecutionContext.pdfDocumentPort
  -> Read(pages): renderPages -> 图片处理 -> 下一次模型请求中的有序页图
  -> Read(无 pages): getPageCount -> 超过 10 页时拒绝整份读取
```

`PdfDocumentPort` é fornecido pelo host; o Core apenas repassa a porta existente, não cria um segundo adaptador de PDF nem depende da antiga porta de conexão de modelo.
O merge `bd4dc05bcb` de 2026-09-02, ao resolver o conflito que removeu `modelConnectionPort`, esqueceu a injeção da porta de PDF adjacente,
fazendo com que o schema da ferramenta ainda exponha `pages`, mas a leitura paginada retorne configuração ausente e a leitura integral pule a checagem de páginas.
A restauração da fiação deve preservar ao mesmo tempo o resultado paginado bem-sucedido e a proteção de contagem de páginas da leitura nativa; permissões, timeout, cancelamento, schema da ferramenta e classificação de erros permanecem inalterados.
Tarefa principal e subtarefa compartilham esta fronteira de montagem do executor; Desktop, Web/controle remoto por celular usam o CLI Runtime já existente do host, sem alterar
a cadeia de entrega continuous/replayable. Caminhos multiplataforma e comandos externos de PDF continuam sob responsabilidade do adaptador existente.

`runtime-read-pdf.test.ts` valida tarefa principal e subtarefa pelo ciclo completo de ferramentas do Runtime: a chamada paginada injeta o adaptador e
a próxima requisição do modelo recebe as imagens ordenadas por página; sem `pages` e acima de 10 páginas retorna erro de ferramenta sem ler o binário do PDF.
O teste não pode apenas construir o ToolExecutor diretamente, senão não descobre dependências perdidas na montagem do Runtime.

## Leitura Sob Demanda de Anexos do Histórico de Tópicos (em validação de integração local/stdio/WebSocket)

Reutiliza a estratégia `topic` do `ReadSessionContext`, passando o `messageId` arquivado e o índice do recurso por um seletor de anexo opcional.
A entrada do modelo não contém botId, chatId, workspace, versão de autorização ou URL de download.
A session atual deve ser consistente com o contexto da ferramenta; a origem da entrada e a versão de autorização são resolvidas a partir do registro de entrada confiável da tarefa atual.

O seletor de anexo da ferramenta é `attachment: { inputId?, messageId, index? }`; quando o índice de histórico textual carrega inputId, só pode resolver o snapshot correspondente que a tarefa já recebeu. Quando a chamada antiga omite, segue a entrada confiável mais recente. O inputId preenchido pelo modelo serve apenas para seleção e não concede autorização.

O seletor de anexo só é permitido com `strategy=topic`.
A validação com modelo real mostrou que o ID da tarefa atual não está no contexto do modelo; quando a estratégia de tópico omite sessionId ou passa `current`,
o contexto da ferramenta resolve a tarefa atual. Outras estratégias continuam exigindo sessionId explícito e não permitem leitura entre tópicos.
Fontes confiáveis preferem `conversationInputIntent`, com compatibilidade com o antigo `inputIntent`; quando o campo canônico existe mas é inválido,
não se pode recuperar permissão pelo campo antigo. Somente entrada normal de usuário pode fornecer origem; sem a versão de autorização enfileirada a leitura de anexo é explicitamente recusada.
O Host retorna referência depositada e nome/MIME/tamanho em bytes, e o Agent valida os bytes reais antes de gravar o binary artifact da session.

```text
ReadSessionContext(topic, attachment reference)
  -> current session + trusted admitted input source
  -> dependency-injected TopicResourcePort
  -> strict Agent/Host reverse request
  -> Host readTopicResource (archive + group/topic/version checks)
  -> existing chunked attachment upload into requesting CLI
  -> CLI session artifact -> binary artifact with target-local path
  -> bounded tool result (name/type/size/reference/path)
```

Os métodos App/Agent e os parâmetros bidirecionais usam o schema de runtime de `packages/shared/src/zcode-protocol/index.ts`;
Host antigo/CLI standalone sem essa capacidade deve falhar explicitamente, sem recuar para download de URL arbitrária. A fronteira de conexão do Host
injeta workspaceIdentity e remoteSessionId, sem aceitar sobrescrita do modelo; requisições do runtime remoto devem voltar pela conexão existente ao Host que possui as credenciais do bot,
sem criar outro runtime nem ler credenciais locais no lado remoto.

O teste controlado de processo stdio reproduz: quando o CLI faz o prewarm antes de vincular a session lógica, a requisição inversa de recurso captura para sempre o wireClient do primeiro uso,
perdendo o remoteSessionId. No início de cada leitura, o roteamento é fixado a partir da entrada confiável atual do mesmo CLI;
download, upload e verificação final de autorização compartilham esse snapshot, sem reselecionar workspace ou runtime em passos assíncronos.

Os bytes do anexo reutilizam o upload em chunks existente e a verificação, sem entrar em uma única resposta inversa. O Agent lê o recurso completo do artifact de sua própria session,
reutilizando a escrita de binary artifact e a limpeza do ciclo de vida da session; o sufixo do arquivo deve ser normalizado com segurança.
O cancelamento é propagado para download/transmissão/gravação; em caso de falha não é oferecido caminho parcial. O download não aprova permissões, não altera políticas nem cria filas de entrada.
A permissão de ferramenta somente leitura continua verificando a fronteira task/source atual; trace, orçamento de resultado, eventos e projeção V4 seguem a cadeia de execução da ferramenta.

Os testes cobrem em sequência o schema da ferramenta, a resolução da fonte confiável, a requisição inversa do Host, o roteamento remoto, falha de chunk e cancelamento,
a gravação do artifact de runtime, a resposta real do modelo com base no valor interno do arquivo e a entrega no tópico de origem. Sucesso do teste unitário de download do Host
ou de download pela API nativa não significa que esta cadeia E2E de ferramenta está completa.

### Fechamento real da conexão de rechecagem (2026-09-08)

### Fechamento da Conexão na Verificação Real de Tópico (2026-09-08)

Às 13:57, a chamada real selecionou o anexo de histórico correto, mas o Host fechou imediatamente o protocolo e encerrou a CLI. O novo port de anexo colocava o
TraceContext do Core no trace estrito do protocolo como está, carregando sessionId, turnId, attributes e outros campos fora do protocolo.
A leitura inversa entre pontas e o cancelamento devem reutilizar o mapeamento protocolTraceFromTraceContext, passando apenas traceId, spanId e parentId;
a identidade de tarefa/entrada continua nos parâmetros estritos da requisição. Os testes devem validar o frame completo de leitura/cancelamento com o zcodeProtocolMessageSchema real,
e não apenas afirmar que requestClient foi chamado.

Quando cancelamento e desconexão ocorrem ao mesmo tempo, requestClient pode lançar o erro sincronamente antes de retornar a Promise. A notificação de cancelamento é de
melhor esforço e não pode lançar exceções não capturadas a partir do listener do AbortSignal; a leitura original continua falhando por cancelamento ou desconexão, sem execução adicional nem reconexão.

## Semântica de Exclusão do CronDelete

O escopo de exclusão do CronDelete deve ficar limitado ao workspace atual, e o resultado da exclusão deve refletir o número real de linhas afetadas no banco.

```text
CronDelete(id)
  -> CLI AutomationPort
  -> automation/delete protocol
  -> Service.delete(id, current workspace)
  -> Repo.delete(id, workspace key)
  -> { deleted: true | false }
  -> Tool result
```

Excluir um ID inexistente, já excluído ou pertencente a outro workspace não pode retornar sucesso. O chamador precisa de um resultado explícito de não encontrado, evitando que o modelo repita indefinidamente a mesma exclusão após o CronList.

## Política das Ferramentas Cron em Workspace Remoto

Workspaces SSH, WSL, Docker e Server usam a identidade de workspace `remote:*`. Tais sessions, ao serem criadas ou restauradas, adicionam CronCreate, CronList, CronUpdate e CronDelete à denylist de nível de session, evitando que um Agent remoto exponha capacidades de agendamento que a fronteira de agendamento remota não consegue suportar de forma confiável. Workspaces locais não herdam essa restrição.

## Todo103: ferramenta Off-Peak e fronteira de execução padrão

```text
Host 本地能力（服务装配 + workspace 类型，不联网）-> Off-Peak policy/创建参数 -> App OffPeakPort -> 工具注册
OffPeakCreate 实际调用 -> Host 灰度/套餐/模型校验 -> createTask/取号
idle turn attribution -> turn denylist + activeOffPeakTaskId -> 拒绝递归 Create
当前 modelExecution + sharedContextRefs -> Core admission -> 完成时清理 turn attribution
```

A 3.12.2 remove a leitura de grey release na fase de registro, mantendo a fronteira de suporte local, a admissão de chamada e a requisição de vínculo; a restauração/criação fria da CLI é montada pela fábrica assíncrona atual do App, sem restaurar o
catálogo antigo de workspace, overlay temporário, turnRuntimeModel ou restauração de modelo. A execução ociosa continua carregando o ModelSelection/requestAuth preciso, sem alterar a seleção persistida da Session. Os ramos de saída/rejeição/fila devem limpar o activeOffPeakTaskId
do turno atual; é permitido que um turno Cron crie tarefas ociosas, mas é proibido incorporar OffPeakCreate às constantes das ferramentas de escrita do Cron.

## Seleção Explícita de Modelo do Subagent (Todo99)

```text
profile 原 Selection -> Worker 公共 Selection Facade（同一已应用账号/Registry 快照）
  -> 临时有效 Selection -> child Runtime -> ModelFactory 精确校验 -> 模型请求
```

A resolução reutiliza a porta somente-leitura injetada pelo host; não altera parâmetros de ferramenta, resultado nem persistência do profile. Sem o mesmo modelo não há fallback para o modelo pai; tier inválido não recebe um padrão. Herança implícita e override de execução interna não são reinterprepretados. A porta é repassada ao Runtime filho / workflow, e a CLI de terminal independente mantém o comportamento original quando não recebe injeção. Veja o contrato completo e a verificação em `docs/working-memory/provider-refactor/steps/todo-99-worker-account-selection-repair.md`.

## Proibição de SendMessage / Workflow em Turno Ocioso (D52)

```text
Host 闲时派发 -> prompt-turn.ts / server-operations.ts turn denylist（+SendMessage,+Workflow）
  -> turn-loop.ts 按 OFF_PEAK_MUTATION_TOOL_NAMES 在每个 model step 隐藏
  -> handler send-message.ts / workflow.ts 读 context.offPeakTurn -> assertNotOffPeakTurn
  -> recoverable PermissionDenied（提示改用前台 Agent）-> 模型改走 Agent 工具（带 subagentModelOverride）
```

Motivo: SendMessage, ao retomar subagentes filhos em estado terminal, e Workflow, ao derivar sub-sessões de script, reconstroem o modelo fora do `modelExecution` do turno ocioso,
caindo de volta na seleção residente da sessão pai e sendo contabilizados no Coding Plan do usuário (ZCT-2099408932463325184). As três constantes de denylist devem ter o mesmo valor;
o fallback de denylist de `isOffPeakCreateRestrictedTurn` reconhece apenas o sentinela OffPeakCreate. Schema da ferramenta, permissões e timeout inalterados;
turnos de automation e turnos comuns não são afetados. Testes: `core/tests/off-peak-tool.test.ts`,
`bootstrap/tests/offpeak-prompt-turn-disallowlist.test.ts`, `bootstrap/tests/v4-native-commands.test.ts`.

#### 2026-09-08 Problemas de validação de entrada descobertos pela validação nativa

A verificação do texto original do tópico e a seleção de anexo de histórico têm `conversationInputIntent` como fonte autoritativa. A compatibilidade com `inputIntent` só vale quando esse campo não existe; quando o campo autoritativo existe mas não há registro de tópico válido, não se pode recuperar o registro pelo campo antigo da mesma mensagem. Em caso de conflito entre os dois campos na mesma mensagem, apenas o registro autoritativo é adotado, e o corpo e o fundo sintético continuam não podendo injetar identidade de origem.

Quando o modelo real passa explicitamente `sessionId: current`, a validação de JSON Schema do executor da ferramenta converte a união entre string regex e literal em `oneOf`, e o validador mínimo não aplica a regex, fazendo com que os dois ramos casem simultaneamente e a chamada seja recusada por engano. O seletor do tópico atual deve expressar `current | sess_*` como um único padrão de string, validado em duas camadas: na validação de argumentos do executor e na resolução de runtime do handler; estratégias que não são de tópico continuam exigindo ID de tarefa explícito. Não se pode declarar a entrada real da ferramenta disponível apenas com base em testes unitários que chamam o handler diretamente.