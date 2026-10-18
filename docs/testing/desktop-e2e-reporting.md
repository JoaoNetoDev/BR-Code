# Relatórios de E2E do Desktop

Por padrão, os E2E do desktop gravam o relatório de testes em `packages/desktop/.e2e-artifacts/<run-id>/`. Este diretório é usado apenas para artefatos de teste e já está no `.gitignore`.

## Execução

Execução local:

```bash
ZCODE_E2E_SPEC=./test/e2e/e2ecase-regression.test.ts pnpm --filter @zcode/desktop test:e2e
```

Execução em contêiner:

```bash
pnpm run test:e2e:container
```

Variáveis de ambiente disponíveis:

- `ZCODE_E2E_RUN_ID`: fixa o nome do diretório de relatório desta execução
- `ZCODE_E2E_ARTIFACT_DIR`: especifica o diretório de saída do relatório
- `ZCODE_E2E_REPORT_VIEWER_BASE_URL`: endereço do viewer Vite usado ao gerar `files.viewerUrl`, padrão `http://127.0.0.1:4173/`
- `ZCODE_E2E_PERF_SAMPLE_INTERVAL_MS`: intervalo de amostragem do processo Electron, padrão 3000ms
- `PERF_SAMPLE_INTERVAL_SECONDS`: intervalo de amostragem de `docker stats` no contêiner, padrão 3s
- `ZCODE_E2E_COVERAGE=1`: habilita a cobertura de código-fonte nos quatro domínios de execução renderer / main / host / CLI

A amostragem de processos do Electron usa a sessão Electron do WDIO para chamar `app.getAppMetrics()`, portanto a janela de amostragem começa depois que a sessão está pronta; a amostragem no contêiner é iniciada pelo script Docker externo e cobre a execução da imagem e a fase de inicialização dos testes. Para que as duas curvas usem o mesmo ritmo de amostragem, defina simultaneamente `ZCODE_E2E_PERF_SAMPLE_INTERVAL_MS=1000` e `PERF_SAMPLE_INTERVAL_SECONDS=1`. Cases muito curtos podem gerar apenas os pontos de início/fim; somente uma regression longa forma uma tendência contínua.

## Artefatos

- `manifest.json`: ambiente de execução, spec, intervalo de amostragem
- `test-results.ndjson`: título, status, duração e resumo de erro de cada case
- `summary.json`: resumo do relatório legível por máquina
- `summary.md`: resumo do relatório legível por humanos
- `workers.ndjson`: cid/spec dos workers que concluíram o registro de ambiente de nível de worker; se a quantidade for menor que `before-session`, a transação preparatória falhou antes do registro
- `lifecycle-events.ndjson`: durações de prepare/worker/session/hook/complete; eventos de falha devem registrar simultaneamente `status=failed` e o resumo do erro
- `perf/process-samples-*.ndjson`: CPU e memória dos processos main / renderer / GPU / utility do Electron, coletadas por `app.getAppMetrics()`
- `perf/container-samples.ndjson`: CPU, memória, IO de rede, IO de bloco e número de PIDs no modo contêiner, coletados por `docker stats`
- `coverage/ui-renderer-istanbul-raw.json`: dados brutos de cobertura Istanbul coletados de `globalThis.__coverage__` do renderer quando `ZCODE_E2E_COVERAGE=1`
- `coverage/ui-renderer-summary.json` / `coverage/ui-renderer-summary.md`: resumo da cobertura de código-fonte da UI do renderer
- `coverage/ui-renderer-html/index.html`: relatório de cobertura HTML do Istanbul, que permite ver a cobertura total, a cobertura por arquivo e o estado de acerto por linha
- `coverage/lcov.info`: relatório de cobertura LCOV, para consumo por CI ou outras ferramentas de coverage
- `coverage/coverage-final.json` / `coverage/coverage-summary.json`: dados de cobertura JSON do Istanbul
- `coverage/summary.json`: totals dos quatro domínios de execução, quantidade de arquivos raw, número de arquivos de código-fonte e completude
- `coverage/{main,host,cli}/`: relatórios JSON, LCOV e HTML de cada domínio de execução Node/Electron
- `coverage/heatmap/index.html`: mapa de calor de execução de funções das quatro camadas renderer / main / host / CLI
- `coverage/heatmap/data.json`: dados de acerto de funções por arquivo usados pelo mapa de calor, reutilizáveis para análises posteriores de tendência ou por dimensão de case

## Relatório HTML

O limite do relatório HTML é "ler o `summary.json` e renderizar uma visão", sem ler diretamente o runtime do WDIO ou o código de negócio. O viewer do relatório é a aplicação Vite em `packages/e2e-report`, com gráficos em Chart.js; o runner de E2E do desktop apenas passa o payload de summary já agregado.

Iniciar o viewer:

```bash
pnpm dev:e2e-report
```

Após o término do E2E, o `files.viewerUrl` de `summary.md` e `summary.json` apresenta um endereço de acesso com o parâmetro `summary`, por exemplo:

```text
http://127.0.0.1:4173/?summary=%2F%40fs%2FUsers%2Fdev%2Fworkspace%2Fz-code%2Fpackages%2Fdesktop%2F.e2e-artifacts%2F...%2Fsummary.json
```

A página contém:

- status da execução, duração, taxa de aprovação dos testes e principais indicadores de recursos
- Gráfico de tendência de CPU: exibição sobreposta da CPU do contêiner e da CPU por process type do Electron
- Gráfico de tendência de memória: exibição sobreposta da memória do contêiner e da dimensão de memória por process type do Electron
- Detalhes dos cases, spec, ambiente e caminhos dos artefatos
- Com `ZCODE_E2E_COVERAGE=1`, exibe a visão geral, o resumo por arquivo e as entradas Istanbul HTML / LCOV / JSON da cobertura de UI do renderer

## Limites

O que já está implementado é o esqueleto do relatório, o resultado por case, a amostragem de recursos em nível de contêiner, a amostragem de CPU / memória em nível de processo do Electron e a amostragem opcional de cobertura dos quatro domínios de execução. Tudo isso está ligado apenas ao harness de E2E e a builds exclusivas de coverage, sem alterar a cadeia de inicialização de negócio da versão normal do desktop.

`summary.json` e a limpeza global de processos/HOME continuam sendo encerrados de forma autoritativa pelo `onComplete` do WDIO. Quando o último worker termina, o runner precisa manter um finalization guard curto com referência até que o `onComplete` comece; assim o Node não pode encerrar silenciosamente com código 0 antes de a promise continuation ser executada. Um `onComplete` normal libera o guard e grava o summary; o timeout do guard serve apenas como fallback de falha de infraestrutura e precisa primeiro escrever um summary de falha a partir dos NDJSON existentes, e então sair com código não zero, sem tratar uma execução vazia sem summary como sucesso.

A cobertura de UI do renderer é desabilitada por padrão e só é habilitada ao definir explicitamente `ZCODE_E2E_COVERAGE=1`:

```bash
ZCODE_E2E_COVERAGE=1 pnpm --filter @zcode/desktop test:e2e -- --spec ./test/e2e/conversation-session/manual-review/pending/conversation-session-running-actions.test.ts
```

Para rodar de uma vez os cases oficiais e de `manual-review` e gerar o relatório dos quatro domínios, use a entrada do repositório:

```bash
pnpm test:e2e:all:coverage
```

A entrada define simultaneamente `ZCODE_E2E_COVERAGE=1` e `ZCODE_E2E_MANUAL_REVIEW=1`. Cada worker
isola o provider de acordo com o próprio spec: cases oficiais e cases pending que já têm fixture local usam replay;
cases pending sem fixture e `upstream-provider.test.ts` usam capture. Um único worker não pode misturar os dois modos.
O smoke de provider real e independente só é incluído quando `E2E_PROVIDER_BASE_URL` e um `E2E_PROVIDER_API_KEY` real (não um valor placeholder de replay) estão configurados;
caso contrário, a entrada exclui precisamente esse smoke externo e imprime o motivo, evitando reportar um 401 por falta de key como regressão de produto. Quando o ambiente SSH está completo, os cases SSH são incluídos; quando não está, apenas os cases SSH são excluídos e a execução completa continua no restante do escopo.

Quando `ZCODE_E2E_COVERAGE=1`, o Vite insere a instrumentação do Istanbul para coverage do renderer na fase de build. No fim do E2E, o reporter se conecta ao target real do renderer via WebdriverIO `browser.getPuppeteer()`, lê os contadores de `globalThis.__coverage__` da página e então gera o relatório padrão do Istanbul.

A instrumentação de coverage precisa ocorrer na fase de transform `pre` em nível de código-fonte, gerando os contadores do Istanbul diretamente sobre a AST dos arquivos `.ts` / `.tsx` originais. Não voltar a um plugin genérico de Istanbul pós-transform do Vite; esse tipo de plugin depende do merge de sourcemap de Vite/React/esbuild para inferir a posição no código-fonte e foi verificado que mapeia pontos de cobertura do JS gerado para linhas sem código em tempo de execução, como `import` e `interface`, contaminando tanto o HTML por linha quanto o critério de cobertura total.

O escopo de código-fonte incluído hoje na cobertura de UI é:

- `packages/ui/src`
- `packages/desktop/src/renderer`

O summary de E2E e o viewer e2e-report exibem apenas a visão geral de cobertura, o resumo por arquivo e as entradas de artefato; a visão profissional de acerto/não acerto por linha tem `coverage/ui-renderer-html/index.html` como referência. Essa separação evita que o relatório de execução de E2E reimplemente uma UI completa de coverage e permite que o CI envie diretamente LCOV ou HTML do Istanbul.

## Contrato de cobertura de código-fonte entre processos

`ZCODE_E2E_COVERAGE=1` precisa coletar os quatro domínios de execução da mesma execução de E2E do Desktop, cada um com seu próprio relatório:

- `renderer`: cobertura de código-fonte Istanbul de `packages/ui/src` e `packages/desktop/src/renderer`.
- `main`: cobertura de código-fonte do Electron main e do código de primeira parte incluído em seu main graph.
- `host`: cobertura de código-fonte do utility host do Electron e do código de primeira parte incluído em seu host graph.
- `cli`: cobertura de código-fonte do `app-server` do zcode-cli iniciado pelo desktop e do código de primeira parte incluído em seu CLI graph.

A cadeia de dados de coverage é a seguinte:

```text
WDIO worker/session
  |-- renderer globalThis.__coverage__ ----------> raw/renderer/<worker>.json
  |-- Electron main NODE_V8_COVERAGE + flush ----> raw/main/<pid>.json
  |-- utility host NODE_V8_COVERAGE + flush ----> raw/host/<pid>.json
  `-- CLI app-server NODE_V8_COVERAGE ------------> raw/cli/<pid>.json
                                                      |
                                                      v
                                    source map remap + repo-relative normalize
                                                      |
                       renderer / main / host / cli 独立 Istanbul 标准报告
```

A coleta e a consolidação devem satisfazer as regras abaixo:

1. Worker, sessão e PID só podem gravar arquivos raw independentes; é proibido sobrescrever os dados de outros workers da mesma execução.
2. A consolidação da suíte só pode ser executada depois que todos os workers saírem. O renderer usa união de coverage map do Istanbul; os domínios Node/Electron usam união raw do V8 e depois o c8 mapeia de volta ao código-fonte. Após cada worker sair, o raw do Node pode ser aparado no próprio lugar para o domínio de execução alvo, e apenas uma cópia do source map é mantida por URL canônica de bundle; quando um mesmo domínio de execução possui múltiplos lazy chunks, cada bundle distinto ainda precisa manter sua própria cópia do map, e não se pode remover o mapeamento único de um chunk posterior com a justificativa de "o domínio já tem map".
3. A build exclusiva de coverage precisa manter external source map e não pode compactar os bundles de main, host, preload e CLI; esses maps existem apenas nos artefatos/build/cache de E2E e não entram no pacote publicado.
4. O caminho de saída do E2E do Electron main acaba matando o processo à força, portanto é preciso chamar explicitamente `node:v8.takeCoverage()` antes do kill; o host faz flush explicitamente após a liberação de recursos e antes de `process.exit`. O modo coverage da CLI solicita a saída normal do app-server via EOF no stdin, usando uma janela de espera maior que a do pacote publicado; os caminhos de SIGTERM / `process.exit` após o timeout também precisam fazer flush ativo e deixar uma janela de escrita em disco em segundo plano pelo V8 antes da saída explícita. O preload de coverage da CLI grava um marcador de readiness antes da execução do bundle de primeira parte: ter marcador e não ter raw é que caracteriza coleta ausente; um processo que sai cedo sem marcador ainda não executou o código de entrada de primeira parte e é contado separadamente como pre-entry zero, sem ser reportado indevidamente como incomplete.
5. O relatório contabiliza apenas entradas cujo source map pode ser atribuído ao código de primeira parte do repositório, excluindo `node_modules`, testes, fixtures, arquivos de declaração e produtos de terceiros/gerados. main / host são mapeados para o código-fonte TypeScript; os packages de workspace internos da CLI ainda não publicam sourcemap de segundo nível, portanto esses packages usam o `dist/*.js` disponível pelo map do bundle da CLI como código-fonte mais granular, enquanto a própria CLI e os packages shared continuam mapeados para o código-fonte original. Depois de completar os sourcemaps dos packages internos, a convergência deve ser direta para TypeScript, sem alterar o contrato de coleta raw.
6. As porcentagens das quatro camadas devem ser exibidas de forma independente, sem somar diretamente domínios de execução diferentes em uma porcentagem total única. Código compartilhado pode aparecer separadamente em vários domínios de execução.
7. Quando qualquer domínio de execução que tenha sido executado não produzir dados raw, o estado de coverage desta execução precisa ser `incomplete`, e os dados restantes não podem passar por cobertura completa.

Cada domínio de execução emite os seguintes artefatos padrão:

- `coverage/<domain>/coverage-final.json`
- `coverage/<domain>/coverage-summary.json`
- `coverage/<domain>/lcov.info`
- `coverage/<domain>/index.html`

## Contrato do mapa de calor de execução de funções

A porcentagem de cobertura responde "o que chegou a executar", e o mapa de calor de funções responde "onde a execução se concentra". O mapa de calor consome apenas os `coverage-final.json` já gerados nas quatro camadas, não pode reiniciar a aplicação e não pode alterar a semântica de execução dos cases de E2E.

```text
renderer coverage-final.json ----\
main coverage-final.json ---------+--> 逐文件函数命中聚合 --> 全量平铺 --> coverage/heatmap/
host coverage-final.json ---------+
cli coverage-final.json ----------/
```

O mapa de calor deve satisfazer o seguinte critério:

1. Os nós de folha de todos os arquivos de código-fonte de um mesmo domínio de execução precisam ser espalhados de uma só vez dentro de um único canvas, e um tile só pode representar um arquivo. Diretórios existem apenas como parte do caminho do arquivo; é proibido agregar diretórios em tiles e é proibido exigir que o usuário clique nível a nível nos diretórios para comparar hotspots.
2. Todos os tiles de arquivo devem ter a mesma largura e altura, e a área não codifica nenhuma métrica; apenas o brilho indica o calor de acerto das funções dentro do arquivo, e quanto mais claro, mais frequente a execução. Todos os tiles usam a mesma escala dentro do domínio de execução, sem renormalizar por diretório local.
3. A métrica de cor padrão é o total de acertos de funções dentro do arquivo, usando primeiro a escala logarítmica `log1p` para tratar as ordens de grandeza e depois realce de contraste sobre o resultado normalizado, evitando que poucos hotspots de milhões de acertos comprimam os demais arquivos na mesma cor escura e evitando que todos os arquivos não zerados pareçam igualmente claros. O relatório também permite alternar para "média de acertos por função", usada para enfraquecer o efeito de escala de arquivos grandes acumularem naturalmente mais acertos.
4. Arquivos sem acerto usam uma cor própria de zero acerto, sem se confundirem com código de baixa frequência que já teve acerto. Além da cor, devem ser exibidos a contagem exata, a quantidade de funções cobertas e a cobertura, sem depender apenas do brilho visual para expressar a conclusão.
5. renderer / main / host / CLI devem ser alternados e normalizados de cor de forma independente; é proibido somar contagens de chamadas entre domínios de execução. Código compartilhado pode aparecer separadamente em vários domínios.
6. O hover, o foco por teclado ou o clique em um tile apenas atualiza os detalhes selecionados, sem mudar o nível do canvas. Os detalhes devem conter ao menos o caminho, o total de acertos das funções, a quantidade de funções cobertas e a função mais quente com sua linha de código-fonte.
7. O calor representa a intensidade cumulativa de execução de todo o conjunto de E2E desta execução e não equivale à abrangência da cobertura funcional. Um calor alto pode vir só do laço de um único case; um calor baixo também pode já ter validado um estado crítico. Ao dividir por case no futuro, deve-se exibir lado a lado a quantidade de cases que atingiram a função e o P50/P95/máximo de chamadas por case.
8. O relatório deve ser um arquivo estático autocontido, sem depender de CDN remota nem de um viewer em execução, para poder ser aberto direto da máquina local ou de um artefato do CI.

O `coverage/summary.json` de nível de suíte registra os totals das quatro camadas, a quantidade de arquivos raw, a quantidade de arquivos de código-fonte e a completude da coleta. A CLI também usa os PIDs de Agent já encerrados presentes no log de runtime para localizar os PIDs de readiness/raw; quando algum processo da CLI que já entrou no código de primeira parte está sem raw, registra `missingRawProcessCount` e marca o domínio como incomplete, e saídas precoces antes da entrada registram `preEntryProcessCount`. Na primeira fase a cobertura é apenas uma métrica de diagnóstico e tendência, sem limiar de aprovação; se as combinações de estado funcional foram validadas continua valendo o case catalog, a coverage matrix e o setup/action/assertion do case.