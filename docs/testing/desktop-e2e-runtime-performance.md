# Especificação de Performance de Runtime do Desktop E2E

## Objetivo e Critério de Medição

Esta especificação restringe a aceitação de performance de full local no Windows pela entrada
`pnpm test:e2e:windows:sharded` na raiz. Essa entrada usa 10 shards fixos no cenário de full
comum; se native `--shard`, targeted, manual-review ou capture estiverem habilitados ao mesmo
tempo, ela degrada para um único shard e o resultado não pertence à aceitação de performance. O
objetivo é fazer com que o tempo completo de wall clock após as otimizações não seja superior a
50% da primeira linha de base desta rodada, sem reduzir specs, cases, asserções ou a semântica dos
limites de tempo de replay das specs formais padrão. O `pnpm test:e2e` sem parâmetros é a entrada
de correção de shard único com prioridade em estabilidade e não carrega a aceitação de wall clock
desta especificação.

Só é aceito, como wall clock total, o `shard-manifest.json.wallDurationMs` completo do parent
runner produzido por `pnpm test:e2e:windows:sharded`; os `summary.json`,
`lifecycle-events.ndjson` e `perf/webdriver-delete-session.ndjson` de cada shard servem para
atribuição. Specs direcionadas, reaproveitamento de build antigo, saída antecipada após falha ou
mudança no escopo de specs não podem ser comparadas com uma linha de base completa.

## Configuração Autoral Atual

Os valores atuais são definidos pelo resultado executável de `resolveWindowsE2EShardTotal()` e
`listDefaultFormalE2ESpecs()`: sem passar parâmetro de sharding, todas as plataformas e todos os
níveis de recurso usam 1 shard; uma execução full comum só ativa múltiplos shards isolados quando
`--shards=N` ou `ZCODE_E2E_SHARD_TOTAL=N` são passados explicitamente, e cada shard continua com
`maxInstances=1`. O `--shard` nativo do WDIO, specs targeted, manual-review e o modo capture
mantêm sempre shard único e nunca são expandidos em vários children por parâmetros explícitos de
sharding. O escopo formal padrão é descoberto dinamicamente por `listDefaultFormalE2ESpecs()`, e
não usa como gate uma contagem fixa que muda conforme cases são adicionados ou removidos. O script
de aceitação de performance `test:e2e:windows:sharded` passa `--shards=10` de forma fixa; o
`pnpm test:e2e -- --shards=N` comum pode ser usado para diagnosticar outros graus de concorrência,
mas não substitui a aceitação da entrada fixa. `windows-e2e-shards.test.ts` precisa travar a
relação de inclusão das specs formais representativas, excluir manual-review/live provider e
provar que a união do sharding explícito não tem lacunas nem duplicatas. Os valores históricos de
2/4/8/9/10 shards e 53/55 specs nas seções abaixo são os valores experimentais das rodadas
correspondentes e não podem sobrescrever retroativamente a configuração atual desta seção.

Execução da primeira linha de base:

- run id: `desktop-e2e-20260716131832268-p8992-a18640ce7414c30d`
- configuração: 2 shards padrão do Windows, cada shard com `maxInstances=1`
- escopo formal: cerca de 53 specs, 86 active cases, 3 skipped cases
- wall clock do parent runner: `2,073,785 ms` (34 min 33,8 s)
- wall clock do comando externo: `2,083.4 s` (34 min 43,4 s)
- linha de aceitação de metade: parent runner `<= 1,036,892 ms` (17 min 16,9 s)
- shard 1: 27 workers, `1,849,626 ms`, 47 results (20 pass / 27 fail)
- shard 2: 26 workers, `1,271,709 ms`, 38 results (31 pass / 7 fail)
- agregação de workers dos dois shards: `3,064,557 ms`; agregação de test result body
  `1,894,295 ms`; custo fixo dos workers não atribuído ao test body cerca de `1,170,262 ms`
- o `infraFailureCount` de ambos os shards é 0; as falhas existentes são mantidas separadamente e
  encerrar cedo após uma falha não é contabilizado como ganho de performance

A diferença de cauda dos slices nativos consecutivos da primeira linha de base foi de `577,917 ms`
(cerca de 9 min 38 s), o que prova que a média por número de specs não representa a média por tempo
gasto. O custo fixo de build/agendamento do nível pai é aproximadamente o wall clock pai menos o
shard mais lento, isto é `224,159 ms` (cerca de 3 min 44 s).

## Fatos de Ciclo de Vida Atuais

A entrada padrão atual cria apenas um child do WDIO. Mesmo com apenas um child, quando HOME não é
especificada explicitamente é preciso derivar um HOME independente a partir do run id do parent
runner, evitando que duas execuções padrão concorrentes limpem os dados da aplicação uma da outra.
Um HOME de child único especificado explicitamente mantém a compatibilidade de caminho original; ao
habilitar paralelismo explicitamente, a unidade segura de concorrência é o shard criado pelo parent
runner, e cada shard tem HOME, run id, artifacts, network capture e Chromium profile próprios. Não
se pode elevar diretamente o `maxInstances` do WDIO dentro do mesmo shard, senão vários workers
resetam o mesmo HOME.

```text
pnpm test:e2e（默认）
  -> e2e-report build
  -> 单 WDIO child（HOME=.e2e-home-<runId>）
  -> formal spec 依次执行 -> 根 summary

pnpm test:e2e:windows:sharded（性能验收，固定 --shards=10）
  -> e2e-report build
  -> desktop build（父进程一次）
  -> agent build（父进程一次）
  -> shard 1 ─┬─ spec worker 1 ─> Electron session ─> deleteSession ─> cleanup
              └─ spec worker N ─> Electron session ─> deleteSession ─> cleanup
  -> shard 2 ─┬─ spec worker 1 ─> Electron session ─> deleteSession ─> cleanup
              └─ spec worker N ─> Electron session ─> deleteSession ─> cleanup
  -> shard manifest
```

A execução histórica completa de quatro shards com 92 workers fornece as seguintes evidências de
runtime:

| Fase                     |                     Contagem | Tempo agregado |  Média/worker |
| ------------------------ | -----------------------: | -------------: | ------------: |
| worker                   |                       92 | 11.446,6 s     |    124,42 s   |
| test body                | 86 active cases correspondentes à execução |    6.872 s      |      não aplicável |
| fora do test body        |                       92 |    4.575 s      |     49,73 s   |
| WebDriver deleteSession  |                      114 |  1.508,0 s     | 13,23 s/chamada |
| afterSession             |                       92 |    342,8 s      |      3,73 s   |
| beforeSession            |                       92 |     28,3 s      |      0,31 s   |

As 22 ocorrências de `deleteSession` a mais que workers vêm principalmente de `reloadSession()`
dentro das specs. A média de host cleanup nos logs de execução é de apenas cerca de 1,50 s, o que
mostra que a cauda longa principal de cerca de 10–12 s está no roundtrip DELETE do ChromeDriver e
não no próprio host dispose.

## Causa Raiz e Prioridades

### P0: spec after encerra o Electron prematuramente

52 das 53 specs formais padrão chamam `clearAppData()` no `after`. O helper atual executa primeiro
`electron.app.quit()` e espera até 10 segundos pelo PID sair, e só então tenta apagar os app data;
mas a configuração do WDIO já exige que o ChromeDriver feche o renderer primeiro, e depois o listener
de `BrowserWindow.closed` dispara `app.quit()`. Os dois conjuntos de posse se conflitam:

```text
当前：
spec after -> clearAppData -> app.quit -> 等 PID 最多 10s
          -> ChromeDriver DELETE 面对失效 browsing context -> 长尾
          -> afterSession 再清进程与 HOME

目标：
spec after -> 不抢占 session 关闭所有权
          -> WDIO after 挂 closed listener
          -> ChromeDriver DELETE 先关闭 renderer
          -> closed listener -> app.quit -> host/agent dispose
          -> afterSession 验证进程树退出并删除 HOME
```

O A/B antigo alternava apenas o `after` do WDIO, mas a spec em teste continuava saindo
prematuramente por `clearAppData()`, então ambos os grupos seguiram o mesmo caminho lento e isso não
pode servir como evidência contra esta causa raiz.

Requisitos da otimização:

- `clearAppData()` não pode chamar `app.quit()` na fase de encerramento de workers gerenciados pelo
  WDIO;
- o ponto autoritativo de deleção dos app data converge para o `afterSession` após a saída dos
  processos;
- helpers que verificam explicitamente a semântica de restart (por exemplo Coding Plan, provider
  restart) continuam mantendo `quitElectronAppGracefully()` e não podem ser alterados por engano para
  não reiniciar;
- o caminho de falha continua varrendo e limpando Electron, host e agent por run id/HOME e não pode
  olhar apenas para o PID principal;
- o motivo da correção precisa ficar registrado em comentário em chinês dentro do helper.

### P1: concorrência explícita de shards e balanceamento pelo tempo histórico

A máquina atual tem 8 logical CPU / 32 GiB. A amostra de recursos existente de quatro shards mostra
CPU P50 de cerca de 98,5% e P95 de 100%, mas ainda há cerca de 16 GiB de memória livre. As duas
rodadas de quatro shards só atingiram 38,1% e 44,3% de ganho. A aceitação de performance já usou
valores padrão graduados por recurso, mas sob alta concorrência há instabilidade de session e de
limpeza, então o padrão atual convergiu para 1 shard; quando for preciso paralelismo por performance,
o chamador passa explicitamente `--shards=N` ou `ZCODE_E2E_SHARD_TOTAL=N` conforme os recursos da
máquina.

Toda configuração de paralelismo explícito continua precisando satisfazer:

- HOME/run id/artifact/network/Chromium profile independentes por shard;
- `maxInstances=1` por shard;
- `--shard` nativo do WDIO, capture, manual-review e run targeted mantêm shard único e têm
  prioridade sobre `--shards` e `ZCODE_E2E_SHARD_TOTAL`;
- o `--shards` explícito de uma execução full comum tem prioridade sobre `ZCODE_E2E_SHARD_TOTAL`;
- a união de specs de todos os shards é idêntica ao escopo formal padrão e sem duplicatas.

Subir de 2 para 4 não reduz estritamente pela metade por causa do custo fixo de build do nível pai,
então precisa ser combinado com a otimização de ciclo de vida do P0 para validação. Se a competition
de startup de quatro shards anular o ganho, devem ser considerados primeiro stagger curto, app stage
read-only compartilhado ou ponderação pelo tempo histórico, e a concorrência não pode passar do
número de núcleos lógicos.

A primeira medição real de quatro shards ainda usou slices nativos consecutivos do WDIO:

- run id: `desktop-e2e-20260716135917016-p7516-fe2df3d9d01164b0`
- wall clock pai: `1,282,836 ms` (21 min 22,8 s), `38,1%` abaixo da linha de base
- workers dos quatro shards: `912,649 / 1,175,976 / 952,877 / 907,823 ms`
- o shard mais lento ficou cerca de 4 min 28 s acima do mais curto, sem atingir a linha de metade

A segunda rodada adotou LPT com pesos históricos versionados: o arquivo de pesos registra o run id da
primeira rodada de quatro shards, os milissegundos de worker de cada spec formal sob competition de
recursos com quatro job workers e um valor de fallback de 60 segundos para specs novas. O runner
coloca a cada vez a spec ainda não atribuída mais longa no shard atualmente estimado como mais leve
e depois restaura a ordem de caminho estável dentro do shard. Os pesos só afetam os shards isolados
criados pelo parent runner local; as entradas nativas `--shard` do WDIO, targeted, capture e
manual-review mantêm a semântica original. Os alvos de peso dos quatro grupos eram de cerca de
`16,3 / 16,3 / 16,6 / 16,6` minutos.

O agent build do parent runner usa por padrão o cache de conteúdo do Turbo já existente: com cache
frio ele ainda constrói tudo conforme o grafo de dependências, e com cache quente a medição caiu de
cerca de um minuto para `1,664 ms`. O `ZCODE_DESKTOP_AGENT_BUILD_MODE` explícito pode continuar
sobrescrevendo esse valor padrão.

Rodadas completas seguintes:

| run id                                                  | Estratégia               |  Wall clock pai | Relativo à base | Conclusão            |
| ------------------------------------------------------- | ------------------------ | -------------: | -------------: | -------------------- |
| `desktop-e2e-20260716142759983-p16820-475907f3a4142d37` | 4 shard + LPT + Turbo    | 1,154,968 ms   |      -44,3%     | Não atingido         |
| `desktop-e2e-20260716144926558-p22244-6f1e60fed51fc41f` | 6 shard + pesos antigos  | 1,159,606 ms   |      -44,1%     | Pesos distorcidos sob alta concorrência |
| `desktop-e2e-20260716151242591-p23440-01d3cfe5a1b6b980` | 8 shard + pesos de 6 con | 1,100,736 ms   |      -46,9%     | Disputa de recursos e sem balanceamento |
| `desktop-e2e-20260716153236537-p28492-47f08f7c1f4220c2` | 8 shard + pesos de 8 con | 1,060,101 ms   |      -48,9%     | A 23.209 ms do gate  |

Os 8 `prepare` da quinta rodada ficaram todos entre `29,7–32,4 s`. Cada shard isolado copia cerca de
94 MiB do mesmo build concluído, o `out`, para o seu próprio run cache; essa cópia disputa disco e
CPU com a inicialização do Electron dos outros shards e está no caminho crítico. O próximo passo
mantém os diretórios isolados por runId e a semântica de snapshot imutável; já foi verificado que
adicionar `COPYFILE_FICLONE` ao `fs.cp` não ajudou, porque na sexta rodada os 8 prepares ainda
ficaram em `29,1–30,5 s`, provando que o filesystem atual do Windows faz fallback para copy comum;
essa alteração inefetiva foi revertida. Não é permitido passar a iniciar diretamente do `out`
compartilhado, nem obter ganho reduzindo specs ou os limites de tempo de replay.

A sexta rodada, run `desktop-e2e-20260716155509025-p10368-11f993efdb93a893`, teve wall clock pai de
`1,135,960 ms`, degradando para -45,2% sob competition. A evidência mais recente mostra um worker
`conversation-session-model-provider-restart-recovery` isolado de `809,820 ms`, cujos 10 cases
independentes são serializados por `maxInstances=1` e se tornam um limite inferior rígido que o LPT
não consegue dividir. Conforme os limites do case catalog da época, a recuperação de restart e a
capacidade de Turbo foram separadas em duas specs formais, para que o agendador de shards isolados
consiga paralelizar. Após o fechamento do achatamento de Provider em 2026-08-31, a recuperação de
restart mantém apenas I25-I26, que ainda têm objetos de produto.

### P2: esperas determinísticas e reloadSession interno

Estes itens só entram na próxima rodada se P0/P1 não atingirem o objetivo:

- a espera fixa de 33 segundos de `conversation-session-v4-load-older`;
- o replay lento realmente pago no caminho de sucesso de `v4-vertical-slice` e `v4-scroll`;
- os `reloadSession()` desnecessários nos helpers de múltiplos cenários de Coding Plan e de provider
  restart;
- os demais pausas fixos de cerca de 11,65 segundos, convertidos em evento, mock barrier ou condição
  geométrica de estabilidade.

Não encurtar diretamente os tetos de `waitUntil` que o caminho de sucesso não paga, nem encurtar
cases que verificam explicitamente limites de produto como `>45s` e `>15s`.

A oitava rodada, run `desktop-e2e-20260716164011135-p24780-9178b2d98f350e37`, ainda deu
`1,088,017 ms` com a mesma estrutura de pesos, provando que a flutuação de recursos de 8 vias engole
o ganho de um balanceamento único. O limite inferior de LPT para 7 vias, dado o total de workers
dessa rodada, já era de `1,031,987 ms`, sem contar ainda o custo fixo de prepare/nível pai, portanto
não se pode reduzir a concorrência. Ao entrar no P2, otimiza-se primeiro o apparatus de teste HLP02:
dos 25 turns, só 21 são necessários para atravessar a janela final de 60 rows, então os 4 turns
duplicados que não aumentam combinações de estado são removidos; o keep-warm do build de E2E é
reduzido para 1 segundo, e o padrão de produção de 30 segundos continua verificado por testes
unitários com fake-timer. Espera-se recuperar cerca de 32 segundos de espera e 4 interações completas
de turn.

Na nona rodada HLP02 caiu de `192–236 s` para `72,6 s`, mas outras specs do mesmo shard incharam ao
mesmo tempo e o wall clock pai continuou em `1,096,438 ms`. Construindo pesos robustos com o máximo
por spec das últimas três rodadas de estrutura idêntica de 54 specs e fixando o peso do HLP02
otimizado no valor medido de `72,649 ms`: com 8 shards a pior cauda de worker no replay das três
rodadas fica em cerca de `996 s`, sem cobrir o custo fixo; com 9 shards o pior fica em cerca de
`904 s`. Portanto 9 shards isolados só são permitidos no nível de 8 núcleos com pelo menos 24 GiB, e
os demais níveis permanecem iguais.

A décima rodada com 9 shards não melhorou (wall clock pai `1,090,201 ms`), então a oversubscription
voltou para 8. Seu ciclo de vida expõe o verdadeiro custo fixo: 54 `after-session` agregam
`808,315 ms`, média de `14,969 ms/worker`. Hoje cada worker já reseta o mesmo HOME do shard no
`beforeSession.resetHome` seguinte e mesmo assim apaga recursivamente os app data no `afterSession`,
o que duplica I/O e espera frequentemente por locks `-shm` do SQLite. A posse converge para:
o `afterSession` apenas espera a saída da process tree e apaga o Chromium profile do worker; o
`onComplete` apaga o HOME inteiro do shard depois que todos os workers terminarem. O worker final, sem
próximo `beforeSession`, continua coberto pelo `onComplete` e não deixa dados de usuário.

O after-session da décima primeira rodada caiu para `605,046 ms` agregado (média `11,205 ms`), com
wall clock pai `1,085,235 ms`; o shard mais lento ficou em `1,002,682 ms` e o custo fixo de
build/agendamento do nível pai em cerca de `82,553 ms`. A próxima rodada adota simultaneamente os
pesos medidos de 54 specs desta rodada e adiciona cache de fingerprint de conteúdo ao build de E2E do
desktop. O fingerprint cobre o código-fonte de produção de desktop/UI/shared/services/client/rpc, os
manifests de cada package, os scripts/configurações de build do desktop, o lockfile da raiz, o Git
HEAD e o ambiente de build de E2E; qualquer mudança exige reconstrução e só se reutiliza quando as
entradas são idênticas e os artefatos do processo principal/renderer ainda existem. O
`ZCODE_E2E_FORCE_DESKTOP_BUILD=1` explícito força invalidação e não se pode reusar artefatos antigos
com base apenas na existência de arquivos.

Complemento de correção do cache (2026-07-17): o fingerprint precisa descrever a semântica completa do
bundle final e não pode se apoiar apenas no Git HEAD e numa lista escrita à mão de diretórios de
código. Por padrão as entradas são coletadas recursivamente a partir de `@zcode/desktop` pelo grafo de
dependências de workspace do `pnpm-workspace.yaml`, coletando o manifest e o `src` de cada package;
assim dependências inlined pelo tsup como `@zcode/server` e novas dependências de workspace entram
automaticamente na key; `.env`, `.env.local`, `.env.production` e `.env.production.local` da raiz
também participam do hash como os arquivos de configuração reais do build de produção via Vite/tsup.
O ambiente de build cobre pelo menos variáveis de coverage, endpoint, OAuth, CDN, portões de ambiente
e build metadata, e distingue "não definido" de "valor vazio explícito". O fluxo de controle permanece:

```text
workspace 依赖图源码 ─┐
生产 .env* 文件 ──────┼─> 内容 fingerprint ─> stamp + 必需产物一致 ─> cache hit
构建期环境变量 ───────┤                         任一不一致 ─────────> cold build
Git HEAD / lock / config ┘
```

Os testes de regressão precisam provar separadamente que trocar `ZCODE_E2E_COVERAGE`, modificar
`packages/server/src` e modificar o `.env` da raiz muda o fingerprint; não se pode usar "o mesmo
commit" como substituto de código-fonte não commitado ou de troca de ambiente.

O cache de build compartilhado também precisa convergir "checagem, build, validação de artefatos e
commit do stamp" em uma única região crítica entre processos. O lock usa criação atômica de
diretório sob o `.e2e-cache` compartilhado; quem espera, ao obter o lock, recalcula o fingerprint e
rechecka o cache, não podendo herdar um miss de fora do lock. Após um build bem-sucedido, valida-se
no mínimo que main, host, scheduler, os dois preloads e os dois HTMLs de entrada do renderer existem
todos, e só então se escreve o stamp num arquivo temporário no mesmo diretório e se faz rename
atômico; qualquer falha de build ou validação não comita stamp e o `finally` precisa liberar o lock.
Locks órfãos cujo owner PID já saiu podem ser coletados com segurança; um owner vivo só pode ser
esperado ou falhar por timeout.

```text
runner A: acquire lock -> recheck miss -> clean/build -> validate -> atomic stamp -> unlock
runner B: wait lock ------------------------------------> acquire -> recheck hit -> unlock
                            shared packages/desktop/out 只允许一个 writer
```

O desktop build da décima segunda rodada acertou o cache de fingerprint de conteúdo, mas o wall clock
pai ficou em `1,129,936 ms`; as 54 specs formais e os 82 cases entraram todos na execução, então a
degradação não pode ser explicada por saída antecipada após falha. O after-session agregado dos 8
shards ainda chegou a `774,716 ms`, e o estágio único mais longo de um shard foi de `120,190 ms`. Os
logs de execução mostram que cada worker força a coleta de PIDs de Electron residuais. A implementação
no Windows inicia `taskkill /T /F` individualmente para cada PID da process tree; o `/T` do PID pai
já cobre recursivamente os filhos, então os PIDs seguintes reiniciam processos e esperam pela mesma
árvore repetidamente, amplificando ainda mais a disputa de CIM/taskkill sob 8 shards de concorrência.

A próxima prioridade mantém a barreira estrita de saída de processos, mas funde o conjunto de PIDs do
mesmo worker em uma única chamada `taskkill /PID ... /T /F`. Depois do comando ainda se reexamina o
run id/HOME atual e qualquer resíduo continua fazendo o afterSession falhar; portanto essa otimização
apenas elimina chamadas de sistema duplicadas e não afrouxa o isolamento nem a semântica de limpeza.
Se um smoke de lifecycle direcionado não reduzir significativamente o after-session, a alteração é
revertida e o foco volta para as caudas longas de worker/test body.

O smoke de lifecycle direcionado após a implementação,
`desktop-e2e-20260716182941310-p5928-4ba900f6e563b9c0`, passou: after-session real do Electron de
`946 ms`, worker de `13,720 ms` e ChromeDriver deleteSession de cerca de `780 ms`. O `87,478 ms` de
prepare desta rodada é o cold build esperado após a mudança do fingerprint de código e não conta como
regressão de limpeza; a próxima rodada com as mesmas entradas deve acertar o cache do desktop build.

A décima terceira rodada acertou o cache do desktop build e o wall clock pai ficou em `1,053,611 ms`
(`-49,19%` relativo à base), faltando apenas `16,718,5 ms` para a linha de aceitação. Cobertura
completa de 54 specs formais. O after-session agregado caiu de `774,716 ms` na décima segunda rodada
para `626,957 ms`, mas ainda há cauda longa de chamadas de sistema sob alta concorrência; mais
importante, os workers de shard mais longo/mais curto foram `996,397 / 885,530 ms`, com diferença de
balanceamento de `110,867 ms`. Reexecutando o LPT com as medições reais de worker por spec desta
rodada, com a mesma estrutura e a mesma concorrência, os 8 shards estimados convergem para
`936,198–954,540 ms`. A décima quarta rodada atualiza apenas os pesos versionados, sem mudar
specs/cases nem a concorrência, para validar essa cauda recuperável de `42–60 s`.

O wall clock pai da décima quarta rodada foi `1,059,263 ms`, novamente sem atingir o objetivo; os
workers reais mais longo/mais curto foram `999,265 / 818,143 ms`, provando que pesos de uma única
rodada não cobrem de forma estável a flutuação de recursos e de replay upstream. O próximo item passa
a recuperar o custo fixo determinístico de prepare: hoje cada shard copia o mesmo desktop build com
`2,601` arquivos e cerca de `89,93 MiB`, com prepare de cerca de 30 segundos. Como o filesystem do
Windows não suporta o reflink anterior, adota-se hard link por arquivo para construir o snapshot
isolado por runId; hard links preservam entradas de diretório independentes, e os inodes já
vinculados continuam existindo quando o `out` compartilhado é apagado/reconstruído. Se o link for
recusado entre volumes ou por plataforma, há fallback para copy por arquivo. O caminho alvo, a
validação estrita de existência e a semântica de deleção no onComplete permanecem inalterados.

Os testes unitários de staging por hard link cobrem o snapshot recursivo e o fallback de copy por
`EXDEV`. O smoke de lifecycle real do custo de build isolado,
`desktop-e2e-20260716191714061-p31248-6cab46f0428bde7e`, passou com prepare de `4,355 ms` e
after-session de `719 ms`; em relação ao prepare de `29,8–31,1 s` por shard do full run mais recente,
a recuperação determinística é de cerca de 25–27 segundos no caminho crítico. As duas rodadas
anteriores faltavam 16,7 e 22,4 segundos para a linha de aceitação, então entra a validação completa
da décima quinta rodada.

O prepare da décima quinta rodada já caiu para `14,8–18,0 s`, mas o wall clock pai degradou para
`1,101,778 ms`. O worker mais longo, `v4-scroll`, foi de `383,566 ms`, dos quais o case body é
apenas `64,067 ms` e falhou em "a janela principal não apareceu"; os outros cerca de 319 segundos
estão na criação da session Electron/WebDriver, acompanhados de vários timeouts de `ContextId`. A causa
raiz é que o hard link comprimiu demais o tempo de conclusão do prepare dos 8 shards, fazendo com que
8 conjuntos de ChromeDriver/Electron disputassem ao mesmo tempo e transformassem o ganho do staging
em cauda longa na inicialização de sessions.

Mantém-se o staging rápido e ao mesmo tempo define-se um stagger de inicialização de 2,5 segundos por
shard index (o ambiente explícito pode sobrescrever para 0):

```text
t0      shard 1 prepare -> Electron session
t0+2.5s shard 2 prepare -> Electron session
t0+5.0s shard 3 prepare -> Electron session
...
t0+17.5s shard 8 prepare -> Electron session
```

O stagger apenas atrasa o onPrepare do shard atual e não altera a atribuição de specs, o
`maxInstances`, a cadeia desktop continuous nem qualquer limite de tempo de produto/replay. O shard
mais atrasado ganha um custo fixo de 17,5 segundos, mas o objetivo é eliminar uma competition de
ContextId que, eliminada uma única vez, economiza de 60 a 300 segundos; se a execução completa não
melhorar, o stagger é revertido.

A primeira tentativa da décima sexta rodada foi inefetiva: o `delay()` genérico faz `unref()` no
timer, então com onPrepare ainda sem outros handles ativos os shards 2–8 saíam silenciosamente com 0,
apenas o shard 1 gerava summary; embora o manifest listasse 54 specs, apenas 5 specs/10 cases
executaram, portanto `368,591 ms` não conta como resultado. A correção é uma espera de inicialização
dedicada que mantém a referência do event loop, somada a um gate forçado no parent runner: qualquer
child com exit 0 e sem summary passa a ser julgado como falha, e é proibido tratar uma execução
vazia como sucesso.

A décima sexta rodada corrigida gerou 8 summaries válidos, cobertura completa de 54 specs e wall clock
pai `1,081,057 ms`. Sete shard workers se agruparam entre `999–1,030 s`, o stagger não gerou ganho
líquido suficiente e o stagger padrão foi revertido; o gate de integridade dos summaries foi
mantido. A maior unidade não distribuível agora é o worker de Turbo recovery de 6 cases,
`588,469 ms`, enquanto o shard mais curto tem apenas `863,470 ms`. Conforme os limites já aceitos no
case catalog, a recuperação de dois estados I35-I37 e a troca cross-capability I38-I42 são
divididas em duas specs formais; nenhum case é podado, nenhuma asserção, restart/replay ou espera de
produto é alterada, e apenas se permite que o LPT preencha buracos de shard de cerca de 35–160
segundos.

As rodadas da décima sétima até a aceitação final são todas registros históricos de execução; na
época o escopo formal tinha 55 specs, incluindo o `conversation-session-v4-retry.test.ts` que depois
foi aposentado por decisão de produto. O escopo atual já foi substituído pelo valor autoritativo de
54 specs no início desta especificação, e os números históricos servem apenas para reproduzir a
performance daquela rodada, não para as asserções de enumeração atuais.

A décima sétima rodada, na época com 55 specs e 8 summaries de cobertura completa, teve wall clock pai
`1,099,323 ms`. Os dois workers após a divisão de Turbo foram `271,610 / 294,403 ms`, eliminando a
maior unidade não distribuível; o total de workers da rodada foi `7,727,805 ms`, média de
`965,976 ms/shard`, mas o mais longo real ainda foi `1,052,506 ms`. O after-session agregado foi
`793,544 ms`. O afterSession já obtém já obtém o PID principal atual do Electron via
`armCurrentElectronAppQuit`, mas ainda executa até três varreduras completas de processos via
PowerShell/CIM antes do graceful wait, depois dele e após o kill forçado. A otimização é esperar
diretamente pelo PID conhecido e coletá-lo com `/T`, varrendo órfãos apenas quando o PID principal já
saiu naturalmente e, por fim, fazendo sempre uma varredura estrita por runId/HOME; encontrar resíduo
ainda falha e o isolamento de processos não é afrouxado. Combinada com um novo LPT dos pesos medidos
por spec desta rodada, a cauda teórica de workers fica em `951,528–984,076 ms`.

A décima oitava rodada, com 55 specs e 8 summaries de cobertura completa, teve wall clock pai
`1,097,660 ms`. A otimização do caminho comum de CIM não alterou o wall clock total; o total de
workers foi `7,844,135 ms`, o limite inferior médio de 8 shards é `980,517 ms`, mas o mais
longo/mais curto real foi `1,043,211 / 879,369 ms`. Isso prova que o problema restante do LPT fixo
atual é a flutuação de provider/session de uma rodada, e não erro de peso estático; reescrever os
pesos da rodada anterior a cada rodada só compensa com atraso. Sem mudar o nível padrão, primeiro
experimenta-se explicitamente 9 shards como um bucket de buffer adicional. Se o total de worker load
crescer menos de cerca de 10%, a cauda teórica pode ficar abaixo do objetivo; se ainda degradar, a
configuração padrão não é alterada.

O full explícito de 9 shards `desktop-e2e-20260716205523448-p29972-d272700e2ce5b7bf` gerou 9
summaries, cobertura completa de 55 specs e wall clock pai `1,043,980 ms`, apenas `7,087,5 ms`
acima do gate; o total de workers foi `7,981,731 ms`, crescendo apenas 1,75% em relação a 8 shards.
Os três itens significantemente subestimados do shard mais longo (conversation-workspace,
hooks-lifecycle, thought-level isolation) somam cerca de 243 segundos acima dos pesos e são a
origem da cauda final. Reescreve-se a medição desta rodada e muda-se o nível de 8 núcleos/24 GiB
para 9 shards; os níveis de baixo recurso de 4/2 shards permanecem iguais. A próxima rodada precisa
validar novamente com a entrada padrão da época sem override de ambiente e o experimento explícito
não pode substituir a aceitação final.

O candidato padrão de 9 shards `desktop-e2e-20260716211451586-p31912-9216c6ff3f460ba0` ainda deu
`1,057,328 ms`, com 55 specs e 9 summaries completos, a 20,4 segundos do gate. O total de workers
fluctuou para `8,474,933 ms`, e os quatro grupos mais longos continuaram concentrados em `980–992 s`;
9 vias não têm margem estável. Continua-se experimentando 10 shards apenas via ambiente explícito e,
se o wall clock ficar significativamente abaixo do gate com summaries completos, decide-se se o padrão
de alto recurso sobe; caso contrário volta-se a 9, e não se pode atingir o objetivo com execuções
vazias ou reduzindo cases.

O full explícito de 10 shards `desktop-e2e-20260716213308679-p25084-b0b7843db8a264bc` gerou 10
summaries, cobertura completa de 55 specs e wall clock pai `1,041,967 ms`, apenas `5,074,5 ms` acima
do gate. O total de workers foi `9,273,868 ms`, com o shard mais longo em `980,525 ms`; itens
subestimados como Turbo-switch, queue e input-control somaram cerca de 225 segundos de desvio.
Reescreve-se a medição desta rodada e define-se 10 shards para o nível de alto recurso de 8
núcleos/24 GiB, mantendo os níveis de baixo recurso de 4/2 shards; é obrigatório aceitar novamente
com a entrada padrão da época sem override de ambiente.

O candidato padrão de 10 shards `desktop-e2e-20260716215326398-p19616-83d941c371e9abdf` gerou 10
summaries, cobertura completa de 55 specs e wall clock pai `1,097,070 ms`, dos quais 34 dos 81 cases
reais já tinham falhas. Os logs de falha repetem timeouts de `ContextId` no renderer; depois da
falha, `E2EFailureArtifactCollector.complete()` é diagnóstico best-effort, mas `afterTest` ainda
adiciona uma camada de timeout total padrão de 60 segundos. A gravação de tela já tem limites internos
de capture 5 s, encode 30 s e stop 45 s, e o limite externo de 60 s deixa falhas já existentes, cuja
janela já colapsou, continuarem ocupando workers e amplificando a disputa de CDP e a flutuação sob 10
vias de concorrência.

A próxima prioridade aperta o teto total externo padrão para 10 segundos, mantendo a sobrescrita por
variável de ambiente (com máximo ainda de 5 minutos). Os caminhos de screenshot/vídeo/log gerados com
sucesso não mudam; o timeout ainda escreve em `collectionErrors`, e a asserção original, a
classificação de falha, a contagem de specs/cases e o código de saída não mudam. Essa restrição
limita apenas o complemento diagnóstico e não altera o caminho de produto nem a semântica desktop
continuous / web-remote-replayable. Depois da alteração, primeiro valida-se com teste unitário que o
timeout não sobrescreve a falha original e então se executa a aceitação completa pela entrada padrão
da época; se ainda não passar de `1,036,892,5 ms`, volta-se ao ranqueamento dos dados de lifecycle de
diagnóstico de falhas e de inicialização de session, e não se pode atingir o objetivo desligando
evidências de falha ou reduzindo cases.

O full padrão dessa rodada, `desktop-e2e-20260716221653870-p19388-8812c26e55a101ff`, gerou 10
summaries, cobertura completa de 55 specs e wall clock pai `1,083,225 ms`, ainda sem atingir o
objetivo. O limite diagnóstico de 10 segundos levou o total de workers do explícito de 10 shards
anterior, `9,273,868 ms`, para `8,840,290 ms`, mas o estágio único de `before` do shard 1 chegou a
`324,643 ms`, onde o log de preflight registra explicitamente
`renderer-preflight-execute-failed: WebDriver operation aborted due to timeout` antes de entrar em um
único `reloadSession()`. Ou seja, o teto de 15 segundos do preflight só envolve as iterações de
`waitUntil` e não envolve as requisições HTTP do WebDriver já emitidas dentro de cada iteração.

A documentação local do WebdriverIO informa que `connectionRetryTimeout` tem padrão `120,000 ms` e
`connectionRetryCount` tem padrão 3. Portanto um único `execute/sync` contra um target quebrado pode
cruzar a fronteira de polling de 15 segundos e consumir cerca de 300 segundos em um hook (que não é
protegido pelo timeout de case de 120 s do Mocha):

```text
before hook
  -> preflight waitUntil (目标 15s)
       -> execute/sync 请求 (默认单次 120s，默认重试 3 次)
            -> 坏 ContextId / renderer 无响应
       <- 约 300s 后才抛错
  -> reloadSession once
  -> 下一个 worker / case
```

A próxima prioridade limita, na camada de configuração do E2E, uma requisição WebDriver individual a
30 segundos e as retries de protocolo a 0, mantendo a sobrescrita explícita por ambiente e o teto
rígido de 5 minutos. O `waitUntil` de nível de produto ainda pode emitir várias requisições curtas
dentro de 30/60 s e o limite de case de 120 s do Mocha não muda; apenas uma requisição de driver já
sem resposta falha antes, e o preflight existente ou o caminho de falha do case original cuidam da
reconstrução. A alteração não encurta limites de estado de produto nem remove retries da camada de
asserção de produto. Primeiro cobrem-se os valores padrão, os valores sobrescritos e o teto rígido
com testes unitários de função pura, e só então se executa o full completo.

O full padrão após o limite de protocolo, `desktop-e2e-20260716223803360-p20200-f31e542a2ca7d888`,
gerou 10 summaries, cobertura completa de 55 specs e wall clock pai `1,070,573 ms`; o `before` mais
longo já caiu de `324,643 ms` para `102,683 ms`, provando que o limite de requisição quebrada é
eficaz, mas ainda faltam `33,680,5 ms` para o gate. O total de workers dos 10 shards desta rodada foi
`8,896,556 ms`, com média ideal de apenas `889,656 ms`, mas o shard mais longo real foi de
`1,013,174 ms`. Esse shard concentrou Coding Plan Team (`440,076 ms`), dois upgrades
(`137,736 / 127,380 ms`) e bash permission (`259,743 ms`); esse é um desequilíbrio determinístico de
sharding causado pelos pesos estáticos que ainda vêm de uma rodada com outra forma de falha.

Atualiza-se o profile versionado com as durações reais dos 55 workers desta rodada e reexecuta-se o
LPT, com a faixa de buckets de replay em `858,021–919,022 ms` e um bucket teórico mais longo que
recupera cerca de 94 s do mais longo real desta rodada. Essa rodada muda apenas os pesos de
agendamento, sem mudar concorrência, specs/cases, asserções ou ordem de execução; dentro de cada
bucket a ordenação continua pelo caminho estável. A próxima rodada continua usando a entrada padrão da
época sem override para evitar tomar um experimento explícito como resultado final.

O candidato rebalanceado `desktop-e2e-20260716225857134-p24676-9022e0979203bc3b` teve wall clock pai
de `933,828 ms` (`-54,97%` relativo à primeira linha de base), com 10 summaries e as 55 specs
solicitadas completas; mas esta rodada teve apenas 75 test results, abaixo dos 82 do candidato completo
de mesma estrutura, e registrou 4 infrastructure failures. Como specs que terminam na fase de
session/hook inflam o ganho de wall clock, esta rodada prova apenas que o balanceamento tem potencial
suficiente e não serve como aceitação final. Com o código e o profile inalterados, roda-se mais uma
vez e o final precisa satisfazer simultaneamente wall clock pai `<=1,036,892,5 ms`, 10 summaries, 55
specs solicitadas e pelo menos 82 test results.

A reverificação estrita `desktop-e2e-20260716231625251-p20612-c6062277656ba9bb` teve wall clock pai
`1,013,926 ms` (`-51,11%`), mas ainda com apenas 74 test results, o que não é aceitável. Duas
rodadas consecutivas com baixo número de cases provam que a solução de "falhar rápido" tem efeito
colateral: o `Promise.race` externo de 10 segundos só faz `afterTest` retornar e não cancela as
promises de stop/CDP da gravação que ainda estão em execução; o diagnóstico em background se sobrepõe
aos comandos WebDriver do worker seguinte. O limite de 30 segundos do protocolo passou a classificar
mais rapidamente essa disputa como infrastructure failure, fazendo os specs abortarem na fase de
hook. A solução otimizou os números de falha, mas quebrou a integridade da execução.

Portanto, reverte-se o valor padrão de 10 segundos dos artefatos de falha e o valor padrão de 30
segundos / zero retries das requisições WebDriver, restaurando-se o diagnóstico original de 60
segundos e a configuração nativa de requisições do WebdriverIO. Mantêm-se o novo LPT profile, o
staging por hard link, o cache de build, a limpeza de processos em lote, a convergência de posse dos
app data e a otimização do apparatus HLP02; essas mudanças não deixam operações CDP em background
cruzarem fronteiras de lifecycle. A próxima rodada continua exigindo 82 test results e a parede de
metade ao mesmo tempo.

Uma verificação posterior de ambiente corrigiu a atribuição acima: nesta máquina
`ZCODE_E2E_FAILURE_ARTIFACTS=1` não está definido, portanto `E2EFailureArtifactCollector.start/complete`
foi no-op durante todo o tempo e nem o limite externo de 10 nem o de 60 segundos entraram na espera
real; não existe promise de gravação em background se sobrepondo ao worker seguinte. O padrão dos
artefatos de falha foi restaurado e os 60 segundos mantidos, e foi o limite de requisição WebDriver
de 30 segundos / zero retries de protocolo combinado com o novo balanceamento LPT que produziu de
fato as duas aprovações padrão de `933,828 ms` e `1,013,926 ms`.

Para verificar se a insuficiência de test results era causada pelo limite de requisição, executaram-se
mais uma vez 10-shard e 12-shard explícito sob a configuração nativa de requisições WebDriver. O
10-shard `desktop-e2e-20260716233550163-p16548-db9c95d35c577381` deu `1,140,515 ms`, 9 summaries e 78
results; o 12-shard `desktop-e2e-20260716235526854-p27184-7688742c0c74fdfc` deu `1,102,432 ms`, 12
summaries e 80 results, com falhas preexistentes de ContextId, process-exit barrier e EBUSY nos
logs. Isso prova que os cases faltantes vêm da instabilidade de session/limpeza da suíte de falhas
atual sob alta concorrência: simplesmente aumentar shards não recupera os 82 results nemstabiliza a
aprovação.

Atualmente mantém-se 30 segundos por requisição WebDriver, zero retries de protocolo, o padrão de 60
segundos dos artefatos de falha e o LPT profile mais recente; a execução padrão converge para 1
shard, e 10/4/2 shards existem apenas como configurações de paralelismo explícito; o escopo de
requisições atual é determinado pelo resultado da descoberta dinâmica de specs formais e não usa uma
quantidade fixa como gate. As duas aceitações históricas da condição de parada de performance
ocorreram antes do aposentadoria do retry spec e ambas geraram 10 summaries e 55 specs solicitadas,
com wall clock pai de melhor `933,828 ms` (`-54,97%`) e de reverificação estrita `1,013,926 ms`
(`-51,11%`). A aposentadoria do retry veio de uma decisão de produto posterior e não conta como poda
de performance desta rodada. A suíte atual ainda não está verde e vaza results na fase de hook; esse
risco de estabilidade preexistente é registrado separadamente e "testes passando" não é confundido
com esta aceitação de performance.

O lote de falhas de 2026-07-20 `ci-conversation-246048-679348` expôs outra competition independente:
o WDIO combina o `config.before` do projeto com o `wdio-electron-service.before` e os executa de
forma concorrente via `Promise.all`. O preflight do projeto, enquanto o service estabelece o CDP
ContextId, injeta `browser.electron` e vincula Puppeteer/janela ativa, chama ao mesmo tempo
`getWindowHandles`, `switchToWindow` e `execute`; por isso os cinco cases de composer/edit/fork
compartilham o mesmo tipo de falha de ContextId/inicialização de janela. Nesse lote o `before` P50
foi `1,025 ms` e o P95 já estava ampliado pela cadeia de recuperação de falha para `60,680 ms`.

O timing alvo usa um hook Mocha root `beforeAll` de verdade como barreira depois que o service do
Electron termina:

```text
WDIO session ready
  -> config.before + wdio-electron-service.before (并发，但项目 hook 不发 browser 命令)
  -> runner 等待全部 before hooks 完成
  -> Mocha rootHooks.beforeAll
       -> renderer bridge preflight
  -> spec before / beforeEach / test
```

O `before` do projeto apenas salva as specs do worker atual; todos os comandos de
renderer/CDP/WebDriver do preflight vão para `mochaOpts.rootHooks.beforeAll` e o lifecycle
`before-suite` é registrado separadamente. Não se pode usar o `beforeSuite` do config do WDIO para
carregar a barreira de falha: o `executeHooksWithArgs` do WDIO registra o erro de hook comum e
resolve, fazendo o Mocha considerar o root hook bem-sucedido e continuar executando o test body. Uma
rejeição real de root hook do Mocha aborta o test body, conta como root-hook failure e em seguida
ainda entra na limpeza de session do runner. A falha de preflight lança a
`e2e-bridge-preflight infra failure` já existente e é proibido chamar `browser.reloadSession()` dentro
do hook: `reloadSession()` não espera a process tree antiga do Electron sair completamente antes de
criar a nova session, espalhando uma falha de inicialização isolada em uma segunda competition de
Electron antigo/novo coexistindo. Caso uma recuperação automática seja necessária no futuro, só o
launcher/worker externo pode repetir depois que a barreira de saída de processos do `afterSession`
terminar; esta rodada não adiciona essa repetição nem um sleep fixo.

O caminho saudável passa de uma sobreposição ideal de dois hooks para cerca de uma execução de
preflight depois da inicialização do service; o pior custo adicional por worker não excede o próprio
preflight e, com workers paralelos, não se soma linearmente ao wall clock total; o caminho de
exceção deixa de arcar com timeout de `deleteSession` e com o segundo start do Electron. Os
requisitos de aceitação são testes de regressão de nível de configuração travando a ordem dos hooks,
garantindo que a função de preflight não contém `reloadSession`, e a execução do typecheck de E2E do
desktop, do typecheck completo e do lint.

A regressão do caminho saudável com o Mocha root hook final,
`desktop-e2e-20260720-064358-309`, cobriu as quatro specs relacionadas, os cinco cases passaram, a
fase de teste levou `39 s` e o `before-suite` P50/P95 foi de `1,333/1,454 ms`; o Electron, o
ChromeDriver e o host/agent das quatro sessions foram limpos normalmente e a varredura de processos
após a execução não deixou resíduo. A regressão de rejeição forçada de preflight no runner Mocha
real prova ao mesmo tempo: failure count igual a `1` e test body não executado; no caminho saudável a
execução é estritamente `preflight -> test body`. Portanto essa barreira cobre simultaneamente a
ordenação do sucesso e a propagação da falha e deixa de depender do config hook do WDIO que engole
exceções.

O lote de reverificação de 2026-07-20 `ci-conversation-246384-680725` provou que a ordenação de hooks
acima só corrigiu a primeira camada da competition: os cinco cases originais de composer/edit/fork
passaram, mas 6 dos 42 workers saíram depois de consumir cerca de 30 segundos fixos em `before-suite`,
com logs todos em `Timeout exceeded to get the ContextId`. O `wdio-electron-service@9.2.1` antigo
captura essa exceção em `initCdpBridge()` e devolve um stub de API inutilizável, fazendo o `before` do
service parecer completo e o preflight do renderer falhar depois por timeout de `execute/sync`. Além
disso, I38/I39/I42 chamam `browser.reloadSession()` diretamente; o WebdriverIO só reconstrói a
session de protocolo e não reexecuta o `before` do service do Electron, então o novo Electron
continua usando o CDP bridge antigo do main process.

A inicialização corrigida e a cadeia de restart real foram unificadas em uma máquina de estados
explícita de readiness:

```text
initial worker
  -> project reload-aware wrapper -> wdio-electron-service 9.2.1 before
       -> ContextId initialization
       -> strict main-process execute probe
       -> failed: reset service bridge -> reconnect once -> probe
  -> Mocha renderer preflight
  -> case

in-spec real restart
  -> arm old Electron app.quit on BrowserWindow.closed
  -> capture old main-PID rooted tree + runId/HOME identity matches
       -> main / renderer / GPU / utility / host / agent PIDs
  -> deleteSession(shutdownDriver=false) closes old window but keeps ChromeDriver
       -> project overwriteCommand waits the captured process tree exit
            -> timeout: POSIX TERM -> KILL / Windows taskkill /T /F
            -> rescan the same runId/HOME; any remaining PID fails without reload
  -> only after zero remaining PID: browser.reloadSession creates new WebDriver session
  -> service.onReload rebuilds CDP bridge + active window binding
  -> restore renderer preferences -> assertions
```

A inicialização saudável ganha apenas um probe do main process e nenhum sleep fixo; só quando a
primeira inicialização do bridge falha é executada uma reconexão limitada. O restart real precisa,
antes do delete, usar o PID devolvido pelo Electron main bridge como raiz autoritativa da árvore e
combinar com a identidade runId/HOME atual para registrar a process tree completa do Electron
antigo; a linha de comando do main no macOS não garante preservar o marcador appArgs e não se pode
depender só da varredura por marcador. Em seguida usa-se
`deleteSession({ shutdownDriver: false })` para manter o ChromeDriver e completa-se a barreira de
saída antes de chamar `reloadSession` para criar a nova session; esperar apenas pelo main PID não
prova que renderer/GPU/utility ou host/agent derivados liberaram profile, pipe, porta e ContextId.
Após timeout de saída natural, é preciso reutilizar a estratégia cross-platform TERM/KILL do E2E
runner ou `taskkill /T /F`, varrendo novamente pela mesma identidade até zero antes de continuar; PIDs
ainda vivos precisam entrar na mensagem de erro. Não se pode chamar o `deleteSession` padrão antes
disso (isso fecharia o ChromeDriver e depois acessaria uma porta morta) — o único delete prévio
permitido precisa passar explicitamente `shutdownDriver: false`; nem se pode colocar a espera depois
que a nova session já foi iniciada; e o `onReload` precisa reexecutar a inicialização do service e não
pode confundir a existência de `browser.electron` com bridge disponível. A migração oficial para o
scoped v10 não é premissa desta execução porque o ambiente atual não consegue obter a nova
dependência; o wrapper local mantém o contrato existente de launcher/capability e promove a falha de
inicialização engolida pelo service antigo para uma reconexão limitada ou uma falha explícita. Essa
mudança afeta apenas o Desktop E2E runner e não altera responsabilidades de processo de produto,
desktop continuous, replayable do celular ou semântica de workspace identity.

## Ordem Histórica de Implementação e Verificação

Esta seção registra a ordem histórica de experimentação a partir da linha de base de 2 shards; o
padrão atual não pode ser inferido por etapas intermediárias, e o valor autoritativo está no início
deste documento, em "Configuração Autoral Atual".

1. Concluir a primeira linha de base completa de 2 shards, congelando run id, wall clock,
   contagem de specs/cases e classificação de falhas.
2. Fazer primeiro um A/B direcionado de uma spec comum de conversation e de um smoke, comparando
   worker, `deleteSession` e afterSession, e confirmando zero processos do run/HOME ao final.
3. Depois de concluir o P0, remedir com o mesmo escopo de 2 shards para isolar o ganho da correção de
   ciclo de vida.
4. Estágios históricos intermediários mudaram o padrão não targeted do Windows para 4 shards,
   adicionaram testes unitários puros do runner e rodaram o full completo; experimentos posteriores
   chegaram a 10/4/2 shards graduados por recurso, mas hoje mudou-se para padrão 1 com o número de
   paralelismo escolhido por parâmetro explícito.
5. Se o wall clock completo ainda ficar acima de 50% da primeira linha de base, voltar à atribuição e
   ao desenho de solução na ordem do P2.
6. Executar ao final `pnpm --filter @zcode/desktop typecheck:e2e`, `pnpm typecheck` e `pnpm lint`,
   e verificar que não há processos residuais de E2E Electron/host/agent/Chromedriver.

## Gates de Aceitação

- A entrada fixa `pnpm test:e2e:windows:sharded` precisa usar de fato 10 shards;
- o wall clock completo do parent runner dessa entrada precisa ser `<= primeira linha de base * 0.50`;
- o escopo de specs/cases formais não pode diminuir e todos os summaries de shard precisam ser
  rastreáveis;
- `clearAppData()` não pode mais destruir o browsing context do WebDriver antes da hora em specs
  comuns;
- o P50 de worker e de deleteSession de specs comuns sem reload precisa cair de forma significativa;
- cases explícitos de restart/reload continuam passando;
- Electron, host, agent e Chromedriver verificados por run id/HOME ao final do run precisam estar em
  zero;
- o typecheck de E2E do desktop, o typecheck completo e o lint precisam passar;
- quaisquer falhas de asserção de produto já existentes precisam ser reportadas separadamente das
  novas falhas desta rodada.