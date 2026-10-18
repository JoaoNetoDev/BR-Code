# Bash Background Parity

A visualização da saída em background ganhou uma consulta sob demanda independente e um detalhe à direita, sem restaurar o envio de progresso no foreground; o contrato completo e
a aceitação BGV01–BGV06 estão em [后台 Bash 输出详情](background-bash-output-details.md).

Este documento registra os limites atuais da implementação do comportamento background do `local_bash` e da transmissão de saída, incluindo a forma de abertura de
arquivo, o limite superior de saída e o encerramento por processo raiz; o schema de ferramenta, o timeout e a política de escopo de owner não listados como parte desta
mudança mantêm o contrato existente.

## Comportamento

- O orçamento de espera padrão do Bash em foreground é `120000ms`, com máximo padrão de `600000ms`. O bootstrap suporta
  `BASH_DEFAULT_TIMEOUT_MS` / `BASH_MAX_TIMEOUT_MS` e injeta a mesma política de timeout no prompt, no
  schema, no handler e no watchdog de limpeza do tool executor. Ambas as env são interpretadas com a semântica de `parseInt` decimal; para um max válido usa-se
  `max(configuredMax, default)`, e somente max ausente ou inválido recua para
  `max(600000, default)`.
- Quando o Bash em foreground atinge o timeout e o comando pode ir para background, o subprocesso em execução não é morto, e sim entregue como background task.
- Um comando cujo primeiro token original seja `sleep` não entra no auto-background por timeout e é tratado pela via normal de timeout em foreground; portanto `sleep 1` / `sleep 1; echo` não são elegíveis, enquanto `echo x; sleep 1` / `FOO=1 sleep 1` são.
- O auto-background por timeout é um caminho de execução próprio do Bash; ele reutiliza os eventos de background task existentes, o enqueue de notificação de task, o runtime wake e a fila de comandos do runtime, não expõe na `ExecutionPort` um método genérico de promoção de foreground e não altera o `ExecutionPort.start()` genérico.
- O tool result do Bash no auto-background por timeout retorna:
  - `status: "backgrounded"`
  - `backgroundTaskId`
  - output file path
- O auto-background por timeout não define `assistantAutoBackgrounded`; o que o modelo vê é o texto de background task normal, não o texto de budget de bloqueio do assistant.
- O Bash comum abre de forma assíncrona a saída canônica uma única vez antes do spawn, com stdout/stderr herdando o mesmo fd;
  após o spawn o fd pai é fechado e o subprocesso escreve direto no arquivo. Esse caminho é compartilhado por Bash em foreground, background explícito, background por timeout e subagent;
  não é criado nenhum collector Node, WriteStream, decoder por chunk ou listener de dados de saída.
  O argv/Hook genérico mantém os dois pipes, o resultado dividido e o contrato original de collector; o collector usa apenas o orçamento inline genérico.
  Requisições de Bash não enviam o `killProcessOnPersistedLimit` exclusivo do collector, e o watchdog de arquivo continua valendo em foreground e background.
- As flags de arquivo são escolhidas conforme a plataforma do host: macOS/Linux usam
  `O_WRONLY | O_CREAT | O_APPEND | (O_NOFOLLOW ?? 0)`, sem `O_TRUNC`, sem limpar ou apagar antecipadamente
  arquivos comuns já existentes; Windows usa `"w"`, incluindo Git Bash e CMD, sem adicionar append/no-follow.
  Novos arquivos POSIX continuam sendo criados com `0600`. A alternância entre foreground e background apenas transfere a propriedade, sem reabrir o arquivo ou migrar a saída.
- O arquivo existe desde a inicialização, e o `persistOutput` do Bash representa a política de retenção após o encerramento. Falha ao abrir é encerrada como
  `spawn_error`, sem publicar background task; cancelar durante a preparação fecha o fd e apaga apenas o arquivo criado nesta execução.
  Falha ao ler o arquivo retorna um diagnóstico explícito, sem se passar por saída vazia normal; falha de limpeza não bloqueia o encerramento.
- Em foreground, após cerca de 2 segundos, são lidos no máximo os 4096 bytes finais a cada segundo, reutilizando eventos de progresso; ao submeter em background o
  polling de foreground é interrompido, e Read/TaskOutput lê o arquivo sob demanda. O stdout final lê por padrão os 30000 bytes iniciais,
  mantendo `BASH_MAX_OUTPUT_LENGTH`, com máximo de 150000 bytes; o arquivo guarda os bytes brutos e a leitura faz decodificação limitada.
- O `exit` do shell raiz já dispara a leitura limitada e o encerramento único, sem esperar o EOF do pipe, a estabilização do tamanho do arquivo ou o término dos descendentes,
  e o encerramento normal não mata descendentes ativamente. Descendentes ainda podem continuar escrevendo no arquivo, mas não reativam a task, não reenviam notificação de conclusão nem continuam
  executando o watchdog de tamanho. Quando o chamador precisar da saída completa, deve fazer o shell raiz esperar pelo seu próprio worker.
- Tanto em foreground quanto em background há um `stat` da saída canônica a cada 5000ms, e uma requisição de terminação da árvore de processos quando estritamente `size > 5368709120`.
  Esse é um limiar suave de 5 GiB, sem truncamento rígido em disco; são aceitos comandos que terminam naturalmente entre as checagens e antes da primeira checagem,
  sem acrescenta julgamento de estado terminal adicional. A submissão em background reinicia o watchdog, e o estado terminal o limpa; falha na checagem não gera falso diagnóstico de limite excedido.
  O resultado de excedente é cancelled/interrupted, exit 137 e `error.type=output_limit`, com a mensagem
  `Command killed: output file exceeded 5GB`. Cancelamento, hard timeout e excesso continuam reutilizando a terminação da árvore de processos da plataforma, e o
  encerramento assíncrono da árvore é acompanhado pelo adapter; após o estado terminal não são mais enviados atrasos de progresso nem iniciadas terminações duplicadas.
- Garantia de fechamento: o resultado de Stop ainda pode ser encerrado primeiro; o `close()` do adapter precisa manter vivos por operações de terminate de árvore já registradas, até que
  a escalada para SIGKILL de 1500ms no POSIX e o snapshot de PPID/envio de sinal daquela rodada sejam concluídos, ou até o encerramento do taskkill no Windows.
  Não se pode apenas aguardar a Promise: após a escrita direta não há pipe mantendo a vida, e temporizadores unref podem sair junto com o Node pai.
  O shutdown apenas referencia handles de limpeza já existentes, sem adicionar polling residente; não se restaura o drain/terminate de descendentes após a saída normal da raiz.
  A regressão usa um Node independente (sem IPC/keepalive adicional) cobrindo cancelamento seguido de fechamento, fechamento direto, Stop em background, hard timeout e excesso.
- Saídas pequenas em foreground são lidas de volta e o arquivo redundante é apagado em um esforço; saídas grandes comuns mantêm a saída canônica completa, retornando um resumo limitado do
  cabeçalho e o caminho completo do arquivo, sem executar mais o truncamento de artifact de 64 MiB. O Bash ignora `maxArtifactBytes`;
  o orçamento original do argv/Hook genérico não muda. O tamanho bruto é registrado no momento da leitura. Após a terminação por excesso em foreground, o resumo é lido de volta e o
  arquivo excedente é apagado em um esforço; arquivos de background são mantidos.
  A saída vazia normal com `persistOutput="always"` continua preservando um artifact de zero bytes.
- Quando o stdout final é vazio, a saída é não zero e não é exit 137, continua-se executando `statfs` no diretório do arquivo de
  saída; quando o espaço disponível fica abaixo de 10 MiB ou os inodes ficam abaixo de 1000, a resposta é o diagnóstico existente de saída perdida.
- Um `run_in_background: true` explícito conclui o commit de background imediatamente após o processo iniciar com sucesso, reutilizando a mesma cadeia de completion / notification.
  Mesmo quando a chamada traz um `timeout` curto, esse valor só representa o deadline de foreground antes do commit; o commit limpa o deadline e desvincula o abort do parent turn, e o processo em background não é morto quando o timeout original é atingido.
- Bash explícito e promovido por timeout compartilham uma única máquina de estados de lifecycle do adapter e o limiar suave de `5GiB` por
  task para a saída canônica; a corrida entre completion, deadline, abort e output-limit só pode produzir um
  foreground result ou uma background task.
- Background tasks de escopo main/session só podem ser encerrados por `cancelBackgroundTask`, pelo `close()` do adapter/session
  ou pelo watchdog periódico de output-limit. Depois que o shell raiz saiu, o estado terminal da task não mantém mais descendentes.
- O escopo `subagent_child` mantém o comportamento de background acima e ainda preserva duas restrições de lifecycle de owner: background
  Bash tem duração máxima padrão de `3600000ms` (podendo ser sobrescrito pela configuração interna do runtime de subagent); quando o
  subagent owner é cancelado, o cleanup remove seus background Bash ainda em execução. A conclusão normal do owner não termina tarefas já submetidas apenas por ter concluído.
  Portanto, aqui detached significa apenas se desligar do deadline de foreground e do abort do parent turn, e não se desligar da
  propriedade de processo do adapter/session ou do subagent owner.
- Depois que o Bash em background conclui, a completion promise do execution faz o settle diretamente, e o tool executor entra na fila de comandos do runtime pelo enqueue de notificação de background já existente, acordando o main agent.
- O tool result de background comum contém apenas o caminho da saída canônica, sem acrescentar caminhos `Stdout:` / `Stderr:`.
- A task notification de `local_bash` usa XML provider-visible, sem prefixo de system notification e sem
  `<task-type>`, split path, result ou campos de error, contendo apenas `task-id`, `tool-use-id` opcional,
  `output-file`, `status` e `summary`.

## Ainda Não Suportado

- Converter manualmente um Bash em execução no foreground para background.
- Control request provider-visible `background_tasks`.
- Um caminho realmente alcançável para `backgroundedByUser`.
- UI/UX que Sugere ao usuário fazer background manualmente após 2 segundos.
- O interruptor global de capacidade `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS` atravessando Bash/Agent/schema.

## Limites Multiplataforma

2026-09-07 completou o contrato de progresso: a cada extração, as 5 linhas mais recentes de preview curto e as 100 linhas mais recentes de preview longo vêm da mesma janela de 4 KiB do final;
  quando o arquivo inteiro cabe na janela final, a contagem é direta; caso contrário, o total de linhas é estimado pela razão entre bytes totais e bytes lidos, e o valor estimado nunca regride.

```text
direct file -> bounded tail -> ExecutionEvent.outputPreview -> ToolCallProgress
  -> V4 ToolCallRow.outputPreview -> Execute renderer
       +-> collapsed: command summary and status only
       +-> expanded: last 100 lines
  -> result/error/background/turn end: clear preview
```

`outputPreview` é um estado opcional e limitado da saída mais recente, contendo `text`, `fullText`, `totalLines`, `totalBytes` e
`linesEstimated`; ele é transmitido pela ExecutionPort, pelo evento de session, pelo schema legado tool.updated e pela row do V4.
O V4 só atualiza uma linha de Bash já em running; progresso atrasado não cria linha nem revive um estado terminal. A sessão pai não materializa ferramentas espelhadas de subagent, enquanto a
child conversation atualiza normalmente. Snapshots antigos sem os campos continuam legíveis.
Em 2026-09-09 o usuário corrigiu o contrato de exibição: o Execute renderer compartilhado, quando recolhido, mostra somente o resumo do comando e o status;
a pré-visualização ao vivo e a saída final só são renderizadas dentro dos detalhes expandidos; em 2026-09-10 foi ajustado para exibir somente o corpo, sem aviso de truncamento e sem entrada de arquivo completo. O corpo da prévia mantém as 100 linhas mais recentes, o viewport mostra no máximo 5 linhas,
o estado terminal limpa o progresso, e os previews de 5/100 linhas da CLI e os eventos de contagem de linhas/bytes permanecem inalterados. O TUI está fora do escopo desta rodada.
O campo de recuperação replayable-only `progress` não é reutilizado; a entrega é feita pelo delta/snapshot de linha existente, e o desktop continuous
não ganha fila de recuperação, enquanto o mobile replayable não contorna gap/snapshot.

Complemento de aceitação: saída real maior que 64 MiB verifica retenção completa, resumo de cabeçalho e sentinel de final; a prévia cobre saída vazia, ausência de quebra de linha,
CRLF, mais de 100 linhas, janela final parcial, estimativa monotônica e chegada tardia no estado terminal. O V4 cobre os dois profiles, a limpeza no estado terminal e o isolamento de subagent;
o Desktop BG14 valida com saída segmentada e barreira de liberação que, recolhido, não há saída, expandido há prévia ao vivo, não se exibe contagem e há limpeza no estado terminal.

A capacidade de execução fica no zcode-cli runtime/tool/execution adapter; o protocolo compartilhado acrescenta um outputPreview opcional e limitado e o display de resultado bash_output; o Desktop reutiliza o Execute renderer compartilhado, usando cores semânticas e quebra de linha em telas estreitas, sem nova lógica de transmissão específica de plataforma. Os limites de task command / snapshot de desktop continuous e mobile replayable não mudam; o background completion continua sendo consumido pela fila de comandos do runtime, sem nova entrada concorrente `executeTurn`.

## Viewport e Seguimento da Saída em Foreground (2026-09-10)

- A saída expandida ocupa altura conforme o conteúdo real, mostrando no máximo 5 linhas (incluindo quebras automáticas), com rolagem além disso; execução e estado terminal compartilham o mesmo contêiner e a mesma altura de linha, sem fixar a altura de saídas curtas.
- A área de rolagem da saída em foreground e em background reutiliza o fade de 24px no topo e na base do `ScrollFadeViewport` compartilhado
  (extraído do componente de scroll de feedback existente). A CSS mask fica fixa nas bordas do viewport de rolagem e o texto fica
  gradualmente transparente ao passar pelas bordas; ela não rola junto com o corpo. Apenas o lado que ainda
  tem conteúdo oculto sofre fade: saídas curtas não têm mask, no topo só a base desbota, no fim só o topo desbota e no meio ambos desbota.
  A mask só atua sobre o corpo, não oculta o comando nem o status/a ação flutuante do topo em background, e não adiciona polling nem muda o estado de seguimento existente.
- A primeira prévia mantém o atraso de assinatura de cerca de 2 segundos e o tick compartilhado de 1 segundo; a UI é atualizada a cada nova prévia limitada recebida,
  sem adicionar timers de frontend, cache de saída acumulada ou requisições ao modelo. Não se promete mudança de conteúdo quando não há bytes novos.
- Colado ao fundo por padrão; substituição de conteúdo, descarte da janela final, mudança na quantidade de quebras de linha e scroll programático não cancelam o seguimento. Depois que o usuário
  rola para cima e sai do fundo, o texto limitado atual e a posição de leitura ficam congelados; ao voltar ao fundo, o texto mais recente é aplicado e o
  colado ao fundo é restaurado, sem exibir um botão «voltar ao mais recente».
- No encerramento continuam sendo exibidas no máximo 5 linhas; no estado de seguimento aparece o resumo final, no estado pausado o texto em leitura é preservado e, ao voltar ao fundo, o resumo final é exibido.
  Recolher/expandir novamente mantém a semântica de desmontagem dos detalhes, e a nova expansão parte do conteúdo mais recente. O foreground não ganha caminho «Full output», aviso de truncamento nem nenhuma área adicional.
- O estado local de seguimento da UI pertence a um único componente de saída; o arquivo da CLI, o polling compartilhado, a atualização da row do V4, a consulta de
  background, o Stop/as notificações e os limites de entrega de desktop continuous / mobile replayable permanecem inalterados. A UI compartilhada usa os tokens de tema,
  a internacionalização e a quebra de linha em telas estreitas existentes, sem cadeia específica de plataforma.
- Em 2026-09-11 foi restaurada a verificação simples de scroll dentro do componente: nas atualizações de saída, o conteúdo só gruda ao fundo e registra a posição real quando está
  em seguimento; no evento `scroll`, sair do topo em direção ao fim pausa, e chegar ao fundo (tolerância de 8px) retoma. Não são introduzidos validade da intenção de
  entrada, timer de proteção de layout nem hook de scroll compartilhado. Limite conhecido: quando a mudança de tamanho da janela faz o navegador
  forçar o scroll até o fundo, ainda pode haver retomada indevida; esta reversão não corrige esse problema e também não considera esse cenário como coberto.

```text
file -> shared 1s poll -> V4 row -> latest text
                                   | following -> display latest -> scroll bottom
user scroll up --------------------+ paused -> frozen text
user scroll to bottom -------------+ following
terminal --------------------------+ same 5-line limit; preserve paused text
viewport scroll/resize ------------> shared fade mask (no change to following state)
```

A aceitação reaproveita BDO07: saída real de arquivo segmentada registra os horários de escrita e de atualização do DOM, cobrindo adaptação a saída curta, no máximo 5 linhas em saída multilinha, colado ao fundo em atualizações
  por segmento, congelamento após scroll do usuário, retomada ao voltar ao fundo sem botão de retomada, não renderização quando recolhido e o mesmo limite de linhas em running e
  terminal. Os testes unitários do componente cobrem scroll programático que não pode pausar indevidamente quando a janela final encurta, pausa no estado terminal e isolamento entre instâncias
  de ferramentas diferentes; os detalhes de background BGV são cobertos como regressão de contrato inalterado.

Verificação (macOS / Node 24.14.0): antes da correção, `desktop-e2e-20260910-115819-131` mediu um viewport de
execução de 256px, com o segundo segmento a 1844px do fundo, enquanto a gravação até a atualização do DOM levava 910ms. No BDO07 atual
`desktop-e2e-20260910-124047-804`, o primeiro segmento tem 1 linha (20px) e os seguintes 5 linhas (100px), com espaçamento de 0 até o fundo em todos os segmentos;
a atualização do primeiro segmento levou 3014ms e os dois segmentos seguintes sem pausa ativa levaram 1012ms e 408ms; as etapas de recolhimento/pausa incluem espera artificial.
BDO02/03/07, BG14 e as 4 BGV da mesma execução passaram; a BGV04 da subsessão ficou bloqueada pela aprovação de `mode.build.highRisk`, o
producer não iniciou, o hook de limpeza falhou em consequência e BGV05/06 não foram executados. As três passaram em uma reprodução independente
`desktop-e2e-20260910-124514-441`, totalizando 11 E2E relacionados aprovados, o que não conta como uma execução inteiramente verde.
19 testes unitários de UI, typecheck de raiz e de E2E, architecture e verificação de fixture passaram;
o lint teve 43 warnings já existentes e 0 erros. Esta rodada não executou o UI de Desktop Windows/Linux nem de controle remoto real em celular;
não havia codegraph disponível, e a superfície de impacto foi conferida pela cadeia de chamadas direta e pelos seeds de código registrados.

Verificação do fade no topo e na base: BDO07 e BGV03 de `desktop-e2e-20260910-142038-231`, 2/2 aprovados.
A janela real confirmou a eficácia da máscara CSS, sem overflow e com a direção correta no início, meio e fim; a atualização de saída e a
pausa/retomada permaneceram iguais; o primeiro segmento continua com 1 linha e os seguintes com no máximo 5. O viewport compartilhado, o seguimento em
foreground/background e os formulários de feedback tiveram 23 testes unitários aprovados, e typecheck, E2E typecheck,
lint (43 warnings já existentes, 0 erros) e architecture passaram.

## Polling Compartilhado de Progresso em Foreground (2026-09-08)

- No mesmo processo Node, os Bash com o mesmo `progressIntervalMs` compartilham um único intervalo de progresso; o padrão do produto é
  1000ms para todos, portanto há apenas um poller para o Bash em foreground da sessão principal e dos subagents do mesmo processo. Processos diferentes
  gerenciam os seus próprios. Quando testes internos/adapter definem ciclos diferentes, os agrupamentos são feitos por ciclo, sem usar o menor ciclo para fazer polling de todas as tasks.
- Cada Bash mantém um atraso de assinatura de cerca de 2 segundos; após o registro, ele lê no próximo tick do polling compartilhado. A primeira task ainda leva cerca de 3 segundos
  para obter a primeira prévia; tasks registradas depois entram no tick existente e não reiniciam o timer das demais tasks.
- Cada assinatura mantém seu próprio estado de leitura em andamento e sua estimativa de linhas, e no mesmo tick lê de forma assíncrona no máximo 4 KiB.
  Leituras lentas não bloqueiam as demais assinaturas nem se acumulam para a mesma task; falha na leitura ou no callback não encerra o polling compartilhado.
- Estado terminal, Stop/cancelamento e passagem para background removem a assinatura e cancelam o atraso ainda não aplicado; parada repetida é idempotente, resultados de leitura
  atrasados não publicam mais progresso e a limpeza de uma assinatura antiga não pode afetar uma assinatura registrada novamente. A remoção da última assinatura limpa o interval e a entrada do registro.
- O poller compartilhado mantém apenas o estado das assinaturas e não faz cache do corpo da saída; o timer é unref. O watchdog de tamanho continua verificando no ciclo original de 5 segundos por task,
  sem ser combinado com o agendamento de progresso. Flags de arquivo, escrita direta de bytes brutos, resumo de cabeçalho, política de retenção, protocolo e UI permanecem inalterados.

```text
foreground delay -> subscribe -> shared interval (same process/cadence)
                                  +-> file A tail -> preview A
                                  +-> file B tail -> preview B
exit / background / cancel -> unsubscribe
last unsubscribe -> clear interval and registry entry
```

Aceitação: fake timer verifica que múltiplas assinaturas geram apenas um interval, que entrar depois não reseta o tick, que a saída de uma task não afeta as outras,
que sair de todas libera o timer, cancelamento repetido e reassinatura, isolamento de leitura lenta/falha, descarte de resultado atrasado e isolamento entre ciclos internos diferentes;
testes com arquivo real verificam o registro e a leitura concorrentes de BashFileOutput, a passagem para background e a independência do watchdog. Foram repetidos
a execução direta, o Desktop BG14 (prévia em running e aviso no estado terminal) e as verificações de tipo/lint; os limites de transmissão existentes continuous/replayable não mudam.

Resultado da aceitação do polling compartilhado: 5 arquivos de teste do adapter com 149 passed / 3 branches de plataforma skipped; depois foi adicionado o caso de leitura atrasada após
reassinatura com arquivo real, com 18 passed no focused. O Desktop BG14
`desktop-e2e-20260908-061858-748` passou (8,5 segundos), com progresso e aviso de estado terminal normais.
O typecheck da raiz, o typecheck do adapter, o lint da raiz e o lint explícito dos arquivos do adapter desta rodada passaram; o lint da raiz mantém os 43 warnings já existentes.
Esta rodada alterou apenas o agendamento de progresso dentro do processo, sem reexecutar testes reais em Windows/Linux ou comparação de performance; a verificação anterior de escrita direta multiplataforma continua sendo
evidência das flags de arquivo/da implementação de saída e não conta como reverificação real deste poller compartilhado. O TUI e o código de renderização do Desktop não tiveram novas alterações.

## Corpo do Resumo de Bash no Desktop (2026-09-10)

- Motivo: a row do V4 no estado terminal reutiliza o corpo do resumo do modelo, e o stdoutTruncated/stderrTruncated do BashOutput e o caminho
  de arquivo canônico não tinham uma projeção de exibição dedicada; o envelope do modelo ou o truncamento head/tail do protocolo não substituem os fatos do Bash.
- Através do `ToolResult.display -> ToolOutput.display` existente, é adicionado um branch `bash_output` com validação estrita:
  `output` é o corpo limitado do cabeçalho (30.000 bytes por padrão; até 150.000 bytes na exibição combinada), `truncated` é a bandeira real de
  truncamento e `outputPath` é o caminho opcional do arquivo de saída completo. Esse branch é produzido apenas por Bash em estado terminal comum com saída parcial ou arquivo retido;
  a inicialização em background e os resultados de imagem mantêm a exibição existente; o envelope do provider não é analisado e o truncamento não é inferido pelo tamanho do texto.
- O expandido em foreground mostra somente o corpo da saída, sem entrada de arquivo «Full output», aviso de truncamento ou contagem. Linhas antigas sem display mantêm o corpo original.
  `truncated` e `outputPath` continuam disponíveis no protocolo existente; a estratégia de resumo/arquivo completo da CLI e a entrada de arquivo nos detalhes de background não mudam.
- Em running são mantidos no máximo 100 linhas de corpo limitado, e o viewport exibe no máximo 5 linhas; recolhido não mostra corpo, e background/estado terminal limpa a prévia de running.
- O conteúdo provider-visible, as políticas de execução/retenção e o TUI não mudam; o display opcional é transmitido pelo delta de row e snapshot continuous/replayable existentes, sem nova fila de recuperação nem contorno do limite de recuperação.

```text
BashOutput (bounded head + truncation + file path)
  -> ToolResult.display.bash_output -> V4 output.display -> Desktop
       +-> head text
       +-> no additional notice or file link in foreground details
```

Aceitação: testes unitários cobrem que os metadados de arquivo e truncamento presentes ou ausentes não geram UI adicional, e a compatibilidade de corpo entre estado terminal e histórico; o protocolo e a projeção dos dois profiles permanecem inalterados.
O BG14 usa uma barreira para verificar que o progresso não mostra contagem e, após a liberação, que a saída passa de 30.000 bytes e que apenas o corpo do cabeçalho é exibido, enquanto o provider ainda contém o caminho completo do arquivo e o final do arquivo está íntegro.

Verificação de 2026-09-08: 25 casos de UI, 73 de wire compartilhado e 40 de projeção de display/progresso do Core aprovados;
o replay final do Desktop BG14 `desktop-e2e-20260907-171113-863` passou. As duas primeiras aceitações falharam por não terem concluído a expansão do histórico e por terem lido o corpo
vazio durante a animação de expansão; o teste passou a fazer a ação real de expansão e a esperar o texto de dica/caminho ficar pronto, sem alterar o ciclo de vida do produto.
O modelo continua recebendo o pequeno resumo original de persisted-output, e o Desktop usa um cabeçalho independente de 30.000 bytes por padrão;
desta vez não foram reexecutados os testes de execução em Windows/Linux, e não houve novas alterações no executor, nas flags, no watchdog ou no código de retenção de arquivos.

## 2026-09-08 CLI Completa a Aceitação

- Esta rodada cancelou o truncamento de artifact de 64 MiB no foreground comum e completou no CLI os eventos/projeções de 5/100 linhas e de total estimado de linhas;
  a renderização do Desktop e a verificação BG14 foram mantidas, o TUI não muda e a leitura original do TaskOutput e o ciclo de vida do processo permanecem inalterados.
- Uma saída real de 65 MiB + 8 bytes verificou o comprimento completo, o resumo de cabeçalho de 30.000 bytes e o sentinel de final;
  10 itens cada em macOS/Linux com Node 24, e 20 itens cada em Windows Git Bash/CMD com Node 24 e Node 25 passaram.
- Com a renderização do Desktop restaurada, o focused de UI teve 3 passed e o E2E de Bash real do BG14 passou; as asserções de expansão esperam o corpo alvo ficar pronto, evitando ler o estado intermediário da animação.
- Agent com 10 arquivos e 461 passed / 3 branches de plataforma skipped; wire/coalescing compartilhado com 36 passed.
  O typecheck passou; o lint da raiz sem erros e com os 43 warnings já existentes. Ao remover explicitamente o ignore do Agent, apenas
  bash.ts/product-projection.ts violaram max-lines, ambos já presentes na baseline e reconferidos contra o HEAD, com redução de linhas nesta rodada.
- Esta rodada não reescreveu na prática os 5 GiB nem remediu performance; o limiar suave de 5 segundos e suas bordas estão travados por testes de regressão.
  A tabela de performance abaixo é um resultado histórico de antes do cancelamento do truncamento de 64 MiB e não serve como dados novos desta rodada.

## Aceitação e Performance Desta Rodada

- Os testes de flags cobrem darwin/linux/win32; arquivos pré-existentes provam o append no POSIX, o truncamento no Windows e que symlinks POSIX não são seguidos; a submissão em foreground/background abre o arquivo apenas uma vez. O append antigo que falhava no Windows é mantido como controle negativo,
  reproduzível de forma independente com `apps/zcode-cli/packages/adapters/tests/fixtures/bash-windows-flags-probe.cjs`.
- A barreira segmentada prova que a leitura é possível antes da saída; a cobertura inclui ausência de quebra de linha, caminhos com espaços e chinês, stdout/stderr, binário e descendentes concorrentes.
  O ciclo de vida cobre foreground/explicit/timeout promotion/subagent, abort/Stop do parent, notificação única; o
  caso de saída antecipada da raiz é tratado nos testes limpando os descendentes, e não se pode mais afirmar estabilidade do arquivo no estado terminal.
- Com relógio e tamanho de arquivo controláveis, o watchdog, o igual/acima do limiar, a corrida com o estado terminal e as falhas de leitura/limpeza são verificados.
- O adapter real é verificado com Windows Node 24.14.0 + Git Bash/CMD, usando o Node 25 como contraste; macOS/Linux
  usam as flags de append correspondentes. Os E2E de produto relevantes são atualizados, e os testes unitários afetados, typecheck e lint são executados.
- O benchmark de performance usa o adapter antigo/novo na mesma máquina e no mesmo Node: 256 MiB por task, concorrência 1/4, pelo menos três repetições cada,
  registrando o RSS de pico do Node pai, heap/external, CPU e tempo, sem tomar o limite de arquivo como economia de memória.

### Resultados Medidos em 2026-09-07

- Os testes unitários afetados cobrem adapter, wire de Bash/TaskOutput, conformance do Core e saída em background;
  209 aprovados e 8 skips de plataforma; o comando completo está salvo no `.tmp/bash-direct-file-validation/implementation-report.md` deste workspace.
- Adapter real: macOS arm64 / Linux arm64 (Docker) com Node 24.14.0, 8/8 cada;
  Windows x64 com Node 24.14.0 e 25.9.0, 16/16 cada, cobrindo Git Bash e CMD.
  O Node padrão do Windows não foi trocado, e o 24.14.0 usou um caminho portable independente; o controle negativo de append original está em
  `.tmp/bash-direct-file-validation/windows-node24-report.md` e `windows-node25-report.md`.
- Replay formal do Desktop: 9 execuções aprovadas em 3 grupos, 8 cenários distintos, cobrindo background automático/ explícito, gravação em tempo real,
  notificação única de conclusão, Stop, remoção do abort do parent em background, loading de Bash/subagent em foreground, hard timeout e child cleanup de background Bash aninhado.
  Artefatos: `desktop-e2e-20260907-121229-740`, `desktop-e2e-20260907-121411-528`,
  `desktop-e2e-20260907-123006-030`.
- `pnpm typecheck`, `pnpm lint` e a auditoria de cobertura de conversation passaram. A config de lint da raiz exclui
  `apps/zcode-cli`, por isso o lint explícito com as mesmas regras foi aplicado às mudanças de Agent desta rodada (removendo esse ignore).
- Os testes reais não encheram 5 GiB nem o disco: limiar e corrida foram validados com tamanho de arquivo/relógio controláveis, e o diagnóstico de
  saída perdida foi validado por injeção de falha. Não foram cobertos Windows arm64, todas as versões de Git/MSYS nem a reconexão real de controle remoto em celular; desta rodada
  não alterou o schema App–Agent, nem as rotas desktop continuous e mobile replayable.

Script de performance: `apps/zcode-cli/packages/adapters/tests/fixtures/bash-output-benchmark.cjs`.
Cada amostra inicia um Node pai independente, com warm-up antes do GC; 256 MiB de saída por task, concorrência 1/4, três repetições cada, com execução alternada
antigo/novo. Ambos os lados usam Node 24.14.0, Git Bash/Bash do sistema; a implementação antiga é a `65ed641886` de antes da mudança.
Abaixo está a comparação histórica de performance de antes do cancelamento do truncamento de settlement de 64 MiB, quando ambos verificavam a contagem bruta de bytes, o resumo de retorno de 30.000 bytes e o artifact de 64 MiB. A tabela traz a mediana das três repetições; a retenção do arquivo completo desta rodada não adota essa condição de aceitação de artifact,
e o incremento de RSS representa a diferença em relação à baseline do Node pai após o warm-up, com a CPU contando apenas user + system do Node pai:

| Host / concorrência | Incremento de RSS de pico MiB: antigo → novo | Incremento de heapUsed MiB: antigo → novo | Incremento de external MiB: antigo → novo | CPU do pai ms: antigo → novo | Tempo ms: antigo → novo |
| --- | ---: | ---: | ---: | ---: | ---: |
| Windows / 1 | 78.08 → 0.55 | 38.84 → 0.51 | 66.79 → 0.07 | 1063 → 31 | 1204 → 393 |
| Windows / 4 | 110.49 → 0.32 | 41.39 → 1.31 | 74.67 → 0.16 | 4703 → 172 | 3787 → 665 |
| macOS / 1 | 190.50 → 0.39 | 46.85 → 0.54 | 80.89 → 0.07 | 330 → 11 | 323 → 213 |
| macOS / 4 | 377.03 → 1.03 | 55.61 → 1.56 | 110.11 → 0.16 | 1348 → 68 | 749 → 973 |

Nessa carga, o incremento de RSS do tratamento de saída do Node pai caiu cerca de 99,3%–99,8% e a CPU diminuiu de forma clara; isso não significa uma queda de 99% na memória de todo o Agent,
e não inclui subprocessos nem o cache de arquivos do SO. A amostragem de 5ms pode perder picos curtos, e os picos de diferentes métricas
de memória não ocorreram necessariamente ao mesmo tempo. No macOS com quatro execuções, a mediana de tempo na verdade aumentou cerca de 30%, e em uma delas a nova implementação levou
3964ms; portanto não se pode prometer com base nisso que o tempo total de execução necessariamente melhora. As amostras originais estão em `.tmp/bash-direct-file-validation/`
nos arquivos `windows-memory-results.json` e `macos-memory-results.json`, com o RSS de pico absoluto, heap/external, CPU, tempo e a numeração de cada repetição.