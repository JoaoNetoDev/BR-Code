# Regressão E2E e cobertura de alterações da saída direta de arquivos do Bash

## Escopo e contrato de medição

Commit alvo: `9c99f9623c`, comparando as mudanças de TypeScript de produção entre o commit pai e esse commit.
Segue-se o comportamento já confirmado em `docs/bash-background-parity.md`, sem alterar a semântica do produto por meio de testes.
A medição de cobertura de 2026-09-08 apenas acrescenta testes e dados de teste; em 2026-09-09, por exigência do usuário, a exibição no estado recolhido foi corrigida, e o contrato vigente mais a verificação incremental estão isolados mais abaixo. O Desktop usa `desktop-continuous` e não mistura a semântica de recuperação do `web-remote-replayable` do celular no desktop.

```text
用户 prompt / Stop / 输出路径点击
  -> Desktop V4 -> Host -> CLI handler -> execution adapter
                                      |-> 同一 fd 写 stdout/stderr
                                      |-> 尾读进度 / 头读摘要
                                      `-> 5 秒大小检查 / 主动停止杀树
  <- Desktop V4 <- projection <- tool result / background notification
```

A superfície de impacto fica limitada a duas camadas pela cadeia de chamadas: handler de Bash, execution adapter, projeção de tool result/progress, renderer de Execute e TaskOutput/TaskStop; os casos vizinhos de Hook verificam que o pipe collector compartilhado não regrediu.
A ferramenta de grafo de código não estava disponível nesta sessão, e a cadeia de chamadas foi verificada pelo código-fonte e pelos logs reais de execução. Nenhuma nova feature de estado de produto ou nó de grafo de funcionalidade é adicionada desta vez.

| Entrada | Estado autoritativo | Resultado que precisa ser verificado |
| --- | --- | --- |
| Bash em primeiro plano / Bash dentro de subagente | Execução do CLI | Arquivo original, resumo, progresso de execução, resultado após parada |
| Bash em segundo plano explícito/por timeout | Registro de background do CLI | Arquivo crescendo continuamente, TaskOutput, notificação única |
| Link do arquivo de saída | Code viewer do Desktop | Abre o caminho real de saída, sem executar Bash extra |
| Hook | Pipe de execução genérico | stdin e stdout/stderr continuam entregues corretamente pelo collector |

A medição usa o relatório de quatro domínios com `ZCODE_E2E_COVERAGE=1`. Cada relatório precisa ter `complete=true`.
Os quatro domínios são contados separadamente, sem somar percentuais; a taxa de aprovação dos casos e a taxa de acerto do código são listadas separadamente.
O critério de linha alterada é **linha de início de statement do Istanbul ∩ linhas de diff adicionadas/modificadas**, sem colocar tipos, import/export, comentários, linhas em branco ou linhas removidas no denominador. Múltiplos runs do mesmo domínio fazem a união dos acertos por posição no código-fonte, sem misturar IDs de statement.
O JS dist do CLI é primeiro comparado literalmente com o artefato recompilado pelo mesmo tsconfig (apenas removendo sourceMappingURL) e, só depois de idêntico, esse source map é usado para voltar ao TypeScript original; não se faz passar número de linha do artefato compilado por número de linha de TS.
Código fora do escopo de coleta do código-fonte é listado separadamente, sem adivinhar zero acerto ou já coberto.

## Cenários complementares aceitos

Todos vêm das specs Bash existentes e do comportamento confirmado nesta sessão. Cada cenário verifica ao mesmo tempo fatos reais de arquivo/processo e o resultado visível ao provider; os que envolvem UI verificam também o DOM. Usa-se fixture de replay local do caso e barreira de arquivo. A spec nova foi validada primeiro em `manual-review/pending`; após o review do usuário em 2026-09-08 foi autorizada a promoção das duas specs deste trabalho — saída do Bash e Terminal — a condição de que a promoção não equivale à entrada no preset de Docker.

| ID | Setup / Action | Assertions | Estado |
| --- | --- | --- | --- |
| BDO01 | Script com caminho contendo espaço e caracteres chineses, stdout/stderr sem quebra de linha, saída pequena e saída vazia/saída com exit code diferente de zero | União das duas correntes, codificação íntegra, exit code preservado, limpeza do arquivo de saída pequena | accepted |
| BDO02 | Saída normal em primeiro plano acima de 64 MiB | Arquivo completo preservado, resumo de cabeçalho de 30000 bytes, cauda completa; em primeiro plano só aparece o corpo, sem aviso adicional nem entrada de arquivo | accepted |
| BDO03 | Bash em primeiro plano de duas sessões independentes gerando simultaneamente saídas multilinha acima de 4 KiB; encerrar um primeiro e só depois avançar o outro | Prévia expandida é limitada, a outra tarefa continua atualizando, no estado recolhido não há saída e o estado terminal não deixa prévia para trás | accepted |
| BDO04 | Bash em segundo plano com saída em segmentos; duas chamadas de TaskOutput em execução e depois consulta na saída natural | Leitura do cabeçalho em execução e repetível com o mesmo prefixo, leitura da cauda no estado terminal; o arquivo não é truncado | accepted |
| BDO05 | Primeiro plano/segundo plano escrevendo de verdade exatamente 5 GiB cada, atravessando o ciclo de verificação e então escrevendo mais 1 byte | Igual ao limiar ainda fica running; estritamente acima do limiar o watchdog encerra; o producer real sai, o resultado preserva o diagnóstico de output-limit; o segundo plano notifica só uma vez; a atribuição estruturada de 137 é verificada separadamente pelos testes da camada de execução | accepted |
| BDO06 | Bash comum em execução tem seu arquivo de saída deletado e então sai; na preparação o caminho de saída é um diretório | Falha de leitura tem diagnóstico explícito; falha de abertura fica visível; o próximo Bash roda normalmente | accepted |
| BDO07 | O mesmo Bash em primeiro plano escreve texto sem quebra de linha em stdout/stderr em três vezes, via barreira de arquivo; os dois primeiros segmentos atualizam continuamente no estado expandido e o terceiro é produzido durante o recolhimento, expandindo de novo depois | Cada segmento do arquivo e da prévia expandida atualiza primeiro, o producer continua vivo, a ferramenta segue in_progress e não há tool_result final; só a liberação final faz sair, o resultado contém os três segmentos e o progresso desaparece | accepted |

### BDO07 — temporização de refresh em tempo real

Aqui "tempo real" significa atualização de nível de segundos durante a execução do comando. O subprocesso escreve direto no fd de saída; o CLI espera cerca de 2 segundos e então assina o poller compartilhado de 1 segundo, fazendo a cada vez uma leitura de cauda limitada a 4 KiB e empurrando pelo progress/projection já existente para o Desktop.
Não se promete push byte a byte, nem se contorna o buffer de usuário do próprio subprograma. O producer do caso escreve direto no fd e não depende de quebra de linha para provocar flush.

```text
producer 写第 1 段 -> ready -> 文件 + 展开预览已更新且仍 running -> release 1
producer 写第 2 段 -> ready -> 展开态自动刷新且仍 running       -> 收起 -> release 2
producer 写第 3 段 -> ready -> 文件更新、收起态无正文           -> 再展开看到新内容 -> release 3
producer 退出     -> 最终 tool_result 包含三段 -> 终态进度清除
```

Cada release só é escrito depois que a asserção correspondente passou; quando não é possível fazer o refresh, o processo não sai por conta própria, e o teste não pode depender de preenchimento pelo resultado final.
O primeiro segmento abre explicitamente o cartão, o segundo mantém expandido e sem clique para validar o refresh automático; em seguida recolhe, o terceiro ainda escreve no arquivo, e o cartão recolhido não pode mostrar saída — expandir de novo precisa mostrar o conteúdo novo. O refresh em tempo real no primeiro plano é aceito no estado expandido.
O orçamento de espera da E2E para a primeira prévia é de 8 segundos, e para as duas seguintes de 5 segundos (margem de agendamento do CI, não um novo SLA de produto).
A latência da escrita até a primeira observação do arquivo, e da primeira observação da prévia visível, é registrada no run artifact `bash-realtime-refresh.json`. A UI é verificada por texto visível; o estado e o resultado final são conferidos pelo bloco de ferramenta e pelo tool_result visível ao provider respectivamente, sem injetar eventos de progresso e sem usar TaskOutput para provocar refresh.
A latência de observação da prévia do terceiro segmento inclui o tempo gasto mantendo o recolhimento de propósito e expandindo de novo, e não pode ser tomada como latência pura de polling.

Os casos de arquivo grande rodam em sequência, e o teste é responsável por apagar o arquivo de saída que lhe pertence; não se enche o disco do sistema. Quando falta espaço em disco, registra-se explicitamente o bloqueio de ambiente e o cenário de 5 GiB não executado não pode ser registrado como aprovado.
O BDO usa a janela de contexto E2E comum de 128000 tokens; não se aplica a injeção de falha de compact 240/80 padrão do pending, que inseriria compactação automática já podada entre Bash/TaskOutput.
A verificação de falha de abertura inspeciona o diagnóstico de erro de sistema visível ao modelo e não pressupõe que uma falha de inicialização tenha exit code de processo ou mapeamento `is_error` de saída diferente de zero. As pré-condições e as verificações de estado terminal do Terminal Stop examinam o cartão real de Bash: a UI atual não cria um grupo pai para um único Bash, e as estatísticas do grupo pai para dois comandos consecutivos são verificadas pelo primeiro caso da mesma spec.
No BDO02, expandir o resumo longo e esperar o corpo ficar visível, confirmando que não há aviso de truncamento nem entrada de arquivo; a preservação do arquivo completo é verificada pelo resultado do provider e pela leitura do arquivo;
No BDO03, expandir explicitamente o cartão e esperar o texto da prévia; ao voltar para a sessão, expandir explicitamente também.
Os casos de progresso concorrente não implicam verificar a restauração do estado expandido do cartão entre sessões.
Elemento montado/visível não significa que a animação de expansão e o layout de rolagem já estabilizaram,
e não se pode tratar um texto vazio do WebDriver nessa janela como ausência de conteúdo do produto.

## Lista de regressão e limites

Em 2026-09-08 o usuário restringiu o escopo: só regredir comportamentos de Bash diretamente relacionados a `9c99f9623c`. O lote expandido inicial de 26 specs, selecionado pela palavra-chave Bash, era amplo demais e foi abortado, não servindo como conjunto de aceite nem como escopo de correção desta vez.
O conjunto de aceite é os cenários de Bash em primeiro/segundo plano, subagente e parada do background spec existente, o Bash cancel do background-work do V4, a saída e o estado terminal representativos do Terminal, e os novos casos BDO01–BDO06. Não se executam as suítes genéricas de Memory, Native Search, registro de permissões, fork, compact, CUA ou configuração de subagent.
As linhas não cobertas do pipe collector genérico são verificadas por apenas um caso representativo já existente de Hook lifecycle, para representar a entrada de execução compartilhada, sem extensão para toda a suíte funcional de Hook; ramos que não podem ser acionados a partir da entrada de produto do Bash são listados separadamente.

Branches específicos de Windows como taskkill/flags, unsubscribe duplicado que não pode ser acionado pela entrada normal de produto, races de callback atrasado e esgotamento de ENOSPC/inode do sistema não podem ser declarados cobertos por números do macOS Desktop E2E. Mantêm-se as evidências correspondentes de execução real multiplataforma/testes determinísticos de baixo nível, e o relatório final lista as linhas restantes não cobertas e os motivos. A verificação de compatibilidade do protocolo antigo não é forçada a partir da UI do V4.

## Histórico de verificação de 2026-09-08

Os registros de run abaixo preservam o contrato de exibição da época; a partir de 2026-09-09, por exigência do usuário, passou-se a exibir a saída somente quando expandido, e os resultados históricos de "prévia no estado recolhido" não servem como evidência de aceite do novo contrato de exibição.

## Baseline

`bash-coverage-baseline-20260908`: os 25/25 do background spec existente passaram, com coleta completa dos quatro domínios.
Linhas de início de statement alteradas: CLI 204/268 (76,12%), Renderer 13/14 (92,86%);
Host/Main 3/7 (42,86%) cada, sendo que as quatro linhas não acertadas pertencem à verificação de resultado do protocolo antigo.
As estatísticas finais abaixo incluem os casos complementares e as duas specs de UI relacionadas.

## Resultado final (2026-09-08)

Execução real na máquina local, macOS / Node 24.14.0 / Electron:

| Conjunto de aceite | Casos | Resultado | artifact run ID |
| --- | --- | --- | --- |
| `conversation-session-background.test.ts` existente | 25 | 25 aprovados | `bash-coverage-baseline-20260908` |
| Novos BDO01–BDO06 (um para cada limite de primeiro/segundo plano) | 7 | 7 aprovados | `bash-output-final-20260908` |
| Resultado expandido do Terminal, Stop de um único Bash | 2 | 2 aprovados | Idem |
| Cancelamento do painel de background do Bash no V4 | 1 | 1 aprovado | Idem |

Os dois runs de aceite saíram normalmente, e `coverage/summary.json` dos quatro domínios está `complete=true` nos dois.
No total, 35 casos aprovados, dos quais 7 novos; além disso, corrigiu-se uma asserção obsoleta do caso existente de Terminal Stop que ainda esperava um grupo pai de ferramenta única.
Nenhum código de produção foi modificado. A nova spec de BDO e a spec de Terminal verificada nesta rodada foram promovidas ao diretório formal por autorização do usuário, mantendo o fixture local do caso; o replay default do caminho formal e a verificação de isolamento de fixtures passaram.
O fixture do Terminal foi completado de forma sincronizada com a resposta de título automático deste caso, evitando que o replay isolado dependesse do fixture de título legacy.

### Reverificação após a promoção

Replay isolado do caminho formal `bash-formal-isolated-r4-20260908`: 9/9 aprovados, exit code 0, sem fixture de provider ausente. Apenas foram carregados os fixtures de common e dos dois casos deste trabalho.
Replay default `bash-formal-default-20260908`: 9/9 aprovados, exit code 0, sem fixture de provider ausente.
As duas execuções cobriram uma vez cada o limite real de saída de 5 GiB em primeiro e em segundo plano; não foi habilitado retry de caso.
As três primeiras rodadas com falha durante a promoção ficam como registro de diagnóstico e não contam como evidência de aprovação:
`bash-formal-isolated-20260908` e `bash-formal-isolated-r2-20260908` encontraram uma race de ler o texto visível imediatamente após expandir; `bash-formal-isolated-r3-20260908` tinha no log de execução a prévia longa completa, mas o teste só consultava a prévia curta do estado recolhido. O teste atual estabelece explicitamente os pré-estados expandido/recolhido e espera o texto real, sem alterar a renderização de produção nem afrouxar as asserções de linhas, bytes e conteúdo de saída.

### Cobertura das linhas alteradas de produção

| Linhas de início de statement alteradas neste commit | Baseline | Final |
| --- | --- | --- |
| CLI (incluindo o ramo de execução compartilhado e a verificação de protocolo antigo) | 204/268, 76,12% | **212/268, 79,10%** |
| Renderer | 13/14, 92,86% | **14/14, 100%** |
| Host | 3/7, 42,86% | 3/7, 42,86% |
| Main | 3/7, 42,86% | 3/7, 42,86% |

Arquivo central `bash-file-output.ts`: 80/83; `bash-output-preview.ts`: 14/14;
`bash-progress-poller.ts`: 23/23. Os três somam **117/120, 97,50%**.
Esses são acertos de linhas alteradas com um critério explicitamente delimitado, **não cobertura de repositório inteiro, cobertura de branches nem cobertura multiplataforma**.
Alterações em campos de tipo, propriedades de objeto e atributos JSX podem não ter uma nova linha de início de statement, e a semântica relacionada continua verificada por asserções de produto.

As estatísticas legíveis por máquina e o script recomputável estão no artifact final:

- `packages/desktop/.e2e-artifacts/bash-output-final-20260908/coverage/bash-change-coverage.json`
- `packages/desktop/.e2e-artifacts/bash-output-final-20260908/coverage/analyze-bash-change-coverage.mjs`

### Linhas alteradas ainda não acertadas por um E2E de Bash aprovado

Os arquivos de adapter abaixo estão todos em `apps/zcode-cli/packages/adapters/src/exec/`; os números de linha correspondem ao commit alvo.

| Arquivo | Linhas não acertadas | Motivo / limite da evidência |
| --- | --- | --- |
| `bash-file-output.ts` | 60, 194, 197 | Exclusão do arquivo com dono em cancelamento após a preparação/spawn falho; diagnóstico de esgotamento de capacidade/inode de disco. Não se esgotou o sistema de arquivos do host para forçar cobertura |
| `node-execution-adapter-lifecycle.ts` | 40, 62 | API `start()` independente; a entrada de produto do Bash comum usa execução em primeiro plano e o caminho de background após o commit |
| `node-execution-adapter-process.ts` | 127–130, 132, 134, 136–137 | taskkill do Windows; o E2E em macOS não pode declarar cobertura |
| Idem | 184, 188–193, 209–210, 213–215, 217, 229, 231–233, 235–236 | Pipes genéricos, stdin e caminhos de drain preservados, contornados pelo Bash comum |
| `node-execution-adapter-run.ts` | 192, 314 | Janela de cancelamento após o open concluir e spawn error; complementados por testes determinísticos da camada de execução |
| Idem | 278–280, 284–287, 298, 300, 306, 312 | Progresso/drain/fechamento de collector do pipe genérico |
| `output-collector.ts` | 81–83, 88, 133, 141, 171 | Ramos preservados do collector genérico; o Bash comum não cria mais collector |
| `packages/shared/src/zcode-protocol/index.ts` | 141, 144–146 | Verificação de resultado do protocolo antigo; não é acionada pela entrada do Desktop V4. Não acertada em CLI/Host/Main |

O `HK-LC-01` existente, selecionado apenas pelo pipe compartilhado, completou em `bash-output-compat-r5-20260908` as asserções de stdin/saída e de contexto de Hook visível ao provider, e depois falhou porque a UI mostra `Hooks` no ambiente em inglês enquanto o teste antigo esperava `钩子` com hardcode. Esse caso não foi registrado como aprovado e **não foi fundido na cobertura de aceite acima**.
Se apenas for computado o acerto adicional trazido por esse rastro de execução, o CLI fica em 231/268 (86,19%); esse número serve só para localizar ramos restantes e não substitui a evidência de um E2E aprovado. Esta rodada não modifica as asserções de internacionalização não relacionadas de Hook.

### Verificação e reexecução

`pnpm typecheck`, `pnpm lint`, `typecheck:e2e` do Desktop, fixture check e conversation coverage audit passaram. O lint tem 43 warnings existentes, sem error; os arquivos novos não têm warning de lint.
Os testes unitários do replay helper deram 14 aprovados e 1 pulado por plataforma; os 6 arquivos de teste de contrato do Bash adapter deram 35 aprovados, complementando a verificação de flags, races de cancelamento, 137/output_limit, agendamento de progresso e limpeza de processos, e não contam para a cobertura E2E.
O único aviso do fixture check é o `E2E_BDO_QUERY_NOTIFIED`, response-only, não usado como matcher de entrada; o matcher real de notification e as asserções de conclusão passaram.

Para rodar as duas specs formais a partir da raiz do repositório (10 casos após incluir o BDO07, sem usar preset global):

```bash
ZCODE_E2E_COVERAGE=1 \
pnpm --filter @zcode/desktop test:e2e -- \
  --spec ./test/e2e/conversation-session/conversation-session-bash-direct-output.test.ts \
  --spec ./test/e2e/conversation-session/conversation-session-terminal-expanded-details-and-status.test.ts
```

O replay isolado define, antes do mesmo comando, `E2E_PROVIDER_REPLAY_FIXTURE_PATH` como
`packages/desktop/test/e2e/fixtures/upstream/common.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-bash-direct-output.json,packages/desktop/test/e2e/fixtures/upstream/conversation-session/conversation-session-terminal-expanded-details-and-status.json`.
A evidência desta rodada para background-work do V4 é apenas o único caso de Bash cancel; os outros cenários do arquivo não entram no conjunto de aceite.

O run final reaproveitou o build de Desktop/CLI já concluído no mesmo workspace e na mesma configuração de coverage, executando `wdio run wdio.conf.ts` diretamente com
`ZCODE_E2E_SKIP_BUILD=1 ZCODE_E2E_SKIP_AGENT_BUILD=1`.
Tanto a regressão inicial quanto a de depois do ajuste da configuração de teste passaram pelo build completo; não foram usados artefatos de outro checkout.
Esta rodada não rodou E2E de Desktop no Windows/Linux, nem replayable de celular nem TUI.

### Verificação incremental do BDO07 (2026-09-08)

`bash-realtime-targeted-r2-20260908`: apenas o replay isolado em Electron real do BDO07, 1/1 aprovado.
As latências de primeira observação dos três segmentos do arquivo original foram 36/80/84 ms, e as de primeira prévia visível foram 2994/898/708 ms.
Estes são valores observados de uma execução nesta máquina (incluindo o overhead de polling do E2E) e não representam latência de persistência por fsync nem garantia de desempenho multiplataforma.
Na observação de cada segmento o producer ainda estava vivo, a ferramenta ainda estava running e não havia tool_result; após a liberação final o resultado ficou completo, o progresso foi limpo e houve exatamente dois requests ao modelo principal (a chamada de ferramenta e a continuação com o resultado), sem TaskOutput nem prompt extra.
O `bash-realtime-targeted-20260908` inicial falhou ao esperar a prévia curta porque o cartão já estava expandido na primeira checagem de progresso; o log de campo já continha a saída original e a prévia longa. O caso passou a recolher explicitamente depois de a primeira prévia chegar e observar os incrementos seguintes sem interação.
Na primeira rodada completa `bash-realtime-regression-20260908`, o BDO07 passou de novo, mas o BDO03 só consultava a prévia curta ao voltar para a sessão enquanto o cartão de campo já estava expandido, e o lote ficou 7/8; essa rodada não conta como aprovação do lote inteiro. Foi completado o pré-estado de recolhimento após a volta à sessão, sem trazer a restauração do estado expandido do cartão para dentro do contrato de progresso concorrente.
Replay default final `bash-realtime-regression-r2-20260908`: a spec de saída do Bash **8/8 aprovada**, sem fixture ausente; no BDO07 as latências de observação do arquivo nos três segmentos foram 85/92/107 ms e as de prévia visível 3098/866/478 ms.
Tanto o run isolado direcionado quanto o run final do lote saíram com exit code 0 e coverage completo nos quatro domínios. As evidências estão no `test-results.ndjson` e no `bash-realtime-refresh.json` de cada run; a cobertura de linhas alteradas de produção citada antes não é recalculada nem substituída.
Continua sendo apenas verificação de Desktop em macOS, sem nova declaração de aceite de Windows/Linux ou celular.

Rodando apenas o caso novo (mantendo o isolamento de HOME/artifact do mesmo wrapper; sem adicionar `--` extra para que o grep não seja ignorado):

```bash
pnpm --filter @zcode/desktop test:e2e \
  --spec ./test/e2e/conversation-session/conversation-session-bash-direct-output.test.ts \
  --mochaOpts.grep BDO07
```

## Regressão da área expandida em 2026-09-09

A prévia no estado recolhido foi adicionada por `9c99f9623c`: `ToolLayout.collapsedContent` contornava a área de detalhes, e o aviso final de truncamento e o caminho do arquivo também eram renderizados fora dos detalhes. Por exigência do usuário, essa entrada dedicada foi removida: prévia, corpo final, aviso de truncamento e link de arquivo foram unificados na área expandida existente. O estado recolhido voltou a ser o resumo do comando com o status; a área expandida continua com atualização em tempo real, sem mudar a escrita de arquivo pelo CLI, o polling nem os campos de protocolo.

A spec e as asserções foram atualizadas primeiro; antes da correção, o teste de UI da UI reproduzia com precisão os dois problemas (prévia de execução no estado recolhido e aviso de estado terminal ainda renderizado), e depois da correção 3 arquivos de teste de UI relacionados deram 16/16 no total.
Replay isolado em Electron real `bash-expanded-only-20260909`: BDO02, BDO03, BDO07 e BG14 somaram **4/4 aprovados**, sem retry, exit code 0, e coverage dos quatro domínios `complete=true`.
Foram carregados apenas o fixture local do caso common, de direct output do Bash e de background; nada foi estendido para a suíte global.

- BDO02: no estado terminal recolhido não são renderizados corpo, aviso nem caminho; após expandir, o resumo do cabeçalho, o aviso de truncamento e o link do arquivo real ficam disponíveis.
- BDO03: ao expandir, as duas sessões independentes continuam atualizando, e ao recolher não há saída; concluir uma tarefa não afeta o progresso da outra.
- BDO07: ao expandir, os dois primeiros segmentos são atualizados automaticamente; durante o recolhimento, mesmo atravessando uma rodada real de polling de progresso, não aparece nó de saída, e expandir de novo mostra o terceiro segmento; depois do resultado final, recolher de novo continua sem nó de saída.
- BG14: recolher não mostra prévia e, após expandir, a saída multilinha fica visível, com o loading de foreground e a limpeza do estado terminal se mantendo normais.

No BDO07 as latências de primeira observação de arquivo/prévia nos dois primeiros segmentos foram 159/3374 ms e 78/595 ms;
o terceiro foi 90/1562 ms, e o tempo de prévia inclui manter o recolhimento de propósito e expandir de novo, não podendo ser interpretado como desempenho puro de refresh.
A evidência legível por máquina está no `test-results.ndjson`, no `bash-realtime-refresh.json` e no `coverage/summary.json` desse run.
A cobertura de linhas alteradas de `9c99f9623c` citada acima não é recalculada nem substituída.

`pnpm typecheck` raiz, `pnpm lint`, `typecheck:e2e` do Desktop, os dois fixture checks e o conversation coverage audit passaram. O lint mantém 43 warnings existentes e 0 error; o fixture check mantém o aviso já existente de marker response-only. O ambiente de verificação foi macOS / Node 24.14.0 / Electron.
Os componentes compartilhados de UI seguem a mesma fronteira de expansão, sem modificação da cadeia de mensagens do Desktop continuous nem do celular replayable; desta vez não foram executados E2E de celular, de Windows/Linux Desktop nem de TUI.

## ID dinâmico de background no replay

O fixture local do caso pode usar `{{latestBashTaskId}}` para referenciar o task ID real de Bash do último `Command running in background with ID: ...` do request atual do provider, usado por TaskOutput/TaskStop.
Consome-se apenas um resultado de ferramenta já existente e visível ao modelo, sem forjar estado de runtime/registro de tasks; quando não há ID, o token fica sem substituição, expondo explicitamente a pré-condição ausente. O `latestAgentId` existente permanece independente.