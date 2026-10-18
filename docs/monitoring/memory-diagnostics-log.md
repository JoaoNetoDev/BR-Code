# Log de Diagnóstico Local de Memória de Processo

Estado: **confirmado, implementado conforme este spec**

## Problema

Quando usuários relatam crescimento contínuo de memória no desktop, o pacote de logs coletado não
responde a três perguntas: qual processo está crescendo, se é JS heap ou native, e qual tabela de
memória está crescendo. A telemetria de recursos do ARMS existente só tem agregação de 5 minutos de
RSS / working set, e nenhum valor é gravado no log local; o renderer não tem nenhuma dimensão de
memória. A auditoria estática de todo o repositório
(`docs/analysis/memory-leak-audit-2026-09-03.md`) lista pontos de crescimento de alto risco
espalhados por quatro tipos de processo (main / renderer / host / agent CLI), e é preciso ter
evidência de runtime antes de decidir qual corrigir.

Esta funcionalidade resolve apenas a **localização local**: cada processo escreve, conforme regras
de gating, uma linha "heap detalhado + contadores de domínio" no seu próprio log local já existente.
Ela não reporta ao ARMS, não altera o schema do ZCode Protocol, não adiciona tipos de mensagem
host→main ou renderer→main e não muda nenhuma lógica de negócio.

## Contrato de produto

1. Os quatro tipos de processo amostram sua própria memória: main, renderer (por janela),
   utility_host (por Local Host de janela), agent_node (o `zcode-cli` por workspace). O período de
   amostragem é fixo em `60_000ms`; agent_node reaproveita o batimento do sampler
   `process/resourceSample` já existente, sem criar novos temporizadores.
2. Amostragem e escrita em disco são separadas. Após cada amostragem, grava-se em disco se
   qualquer uma destas condições for verdadeira; caso contrário, a amostra é descartada:
   - primeira amostragem (`reason=first`);
   - `heapUsedKb` muda mais de `5%` em relação ao **último valor gravado**, ou `rssKb` /
     `externalKb` muda mais de `10%`, ou qualquer contador de domínio difere do último valor
     gravado (`reason=changed`); native / external participam da decisão separadamente, porque em
     máquina real já aconteceu o RSS do host saltar de 240MB para 1.5GB com o heap quase parado;
   - `300_000ms` se passaram desde a última gravação em disco (`reason=heartbeat`).
3. No pior caso, uma linha por processo por minuto, uma linha a cada 5 minutos quando ocioso. Para
   8 processos, cerca de 3.4MB por dia, aproximadamente um décimo do volume de log atual.
4. A linha de log contém apenas números e enums de baixa cardinalidade; não contém pid, caminho,
   workspace / session / task id, nome de modelo, prompt ou conteúdo de arquivo.
5. Falha em amostragem, leitura de contadores, formatação ou gravação descarta apenas a amostra
   atual, sem retry, sem fila e sem afetar o negócio.
6. Há apenas uma implementação da lógica de gating e formatação:
   `packages/shared/src/memoryDiagnostics.ts`, reutilizada pelos quatro tipos de processo.

## Fluxo de dados

```text
 renderer(每窗口)                 host(每窗口)                    zcode-cli(每 workspace)
 60s: performance.memory          60s: process.memoryUsage()      60s sampler(已存在) onSample 内
      + ui 领域计数器                  + services 领域计数器             process.memoryUsage()
      │ logger.logMemoryDiagnostics    │ host logger.info                + server 领域计数器
      │ (绕过生产门控, 走 window.zcode.log) │ (既有 [host-log] 转发)          │ CLI logger.info
      v                                v                                 v
 ~/.zcode/v2/logs/YYYY-MM-DD.log  ←── main 60s: memoryUsage + 按角色 working set + main 计数器
                                                                ~/.zcode/cli/log/zcode-YYYY-MM-DD.jsonl
```

- As linhas dos processos main / host / renderer caem todas no log principal do Desktop (host via
  o encaminhamento `[host-log]` já existente, renderer via a ponte preload `window.zcode.log` já
  existente).
- agent_node escreve no JSONL log próprio da CLI. Os logs de CLI de workspaces remotos ficam na
  máquina remota; isso é deliberado, as amostras de recursos não recebem campos novos pelo
  protocolo.
- A exportação de logs (`exportLogs.ts`) e o pacote compacto para o feedback do usuário
  (`prepareCompactLogArchive`) já cobrem os arquivos acima, sem necessidade de alterações.

## Formato da linha

No lado Desktop (main / host / renderer) uma linha de `key=value`:

```text
[memory] role=main reason=changed rssKb=412300 heapUsedKb=91234 heapTotalKb=120000 externalKb=30211 arrayBuffersKb=2048 app.willDownloadListeners=3 app.windows=2 taskBus.leases=1 taskBus.sessionRoutes=14 taskBus.streamBatches=0 ws.chromium_other=120000 ws.gpu=88000 ws.host=380000 ws.main=412300 ws.renderer_main=910000 ...
```

- Ordem fixa dos campos: `role`, `reason`, `rssKb`, `heapUsedKb`, `heapTotalKb`, `externalKb`,
  `arrayBuffersKb`; campos ausentes são omitidos (o renderer não tem rss / external).
- Contadores nomeados como `<provider>.<key>`, emitidos em ordem lexicográfica, com valores
  arredondados.
- Todos os valores em KB são arredondados.

No lado da CLI escreve-se log estruturado: `event=zcode_protocol.process.memory_sample`,
`module=bootstrap.zcode_protocol`, com `reason`, os cinco campos de memória e o objeto `counters`
em `context`.

## Contadores de domínio

| role | provider.key | Semântica |
| --- | --- | --- |
| agent_node | `sessions` | Número de registros de sessão residentes no protocol server |
| agent_node | `eventRows` | Soma das linhas do event store em memória de todos os records |
| agent_node | `eventEvicted` / `eventTransientRetained` | Quantidade acumulada de eventos transitórios descartados conforme a política de janela de turno / quantidade de eventos transitórios ainda residentes (`apps/zcode-cli/docs/design/v2/session-event-store-retention.md`) |
| agent_node | `v4.publishers` / `v4.detachedLive` / `v4.detachedTerminal` / `v4.rawSeqStates` | Publishers do V4 gateway, sub-sessões detached, sub-sessões detached já em estado terminal aguardando liberação, tamanho da tabela de estados de raw seq |
| utility_host | `agent.sessionEmitters` / `agent.seqStates` / `agent.pendingPermissions` / `agent.pendingUserInputs` | Tabelas espelho por sessão de `zcodeAgentService` |
| utility_host | `task.runtimeCommands` / `task.toolMemoryTasks` / `task.taskEmitters` / `task.overlays` | Tabelas por task de `zcodeTaskServiceAdapter` |
| utility_host | `terminal.open` / `fileWatcher.open` | Quantidade de instâncias de pty e de `fs.watch` |
| utility_host | `bots.streamSubs` / `bots.runningTasks` / `bots.typingIntervals` / `bots.liveStatusProgress` | Estado por task dos bots |
| main | `app.windows` / `app.willDownloadListeners` | Número de janelas, quantidade de listeners `will-download` em `defaultSession` |
| main | `taskBus.streamBatches` / `taskBus.leases` / `taskBus.sessionRoutes` | As três tabelas do `TaskRealtimeBus` |
| main | `guest.tabs` / `guest.closedTabIds` | `BrowserGuestManager` |
| main | `broadcast.claims` / `broadcast.processes` | `BroadcastHub` |
| main | `ws.<process_role>` (`ws.main` / `ws.renderer_main` / `ws.renderer_guest` / `ws.gpu` / `ws.chromium_other` / `ws.host` / `ws.scheduler`) | Working set (KB) somado por `process_role` em `app.getAppMetrics()`. O vocabulário de papéis tem a mesma origem do ARMS `perf_process_window` (`docs/monitoring/process-resource-telemetry.md`); emite apenas os papéis com processos vivos neste tick |
| renderer | `shiki.tokensCache` / `shiki.highlighters` | Quantidade de entradas no cache de tokens de realce de código |
| renderer | `taskSnapshotCache.entries` / `taskSnapshotCache.persisted` | Entradas do cache de snapshots de task em memória e do cache persistente |
| renderer | `sessionStore.workspaces` | Número de buckets de workspace do `zcodeSessionStore` |
| renderer | `projection.stores` / `projection.rows` | Quantidade de projection stores V4 vivos e a soma de suas linhas de `rows.window` |
| renderer | `xterm.sessions` | Instâncias de terminal da barra lateral residentes |
| renderer | `taskQueryCache.queryKeys` / `taskQueryCache.taskMetas` | Entradas do cache de consultas da lista de tasks |
| renderer | `toolLayout.openState` | Tamanho da tabela de estado de expansão dos cards de ferramenta |

Ao adicionar um contador, registre-o com auto-registro via `registry.register(name, provider)` no
módulo correspondente; o provider deve ser de leitura pura (apenas `Map.size` / `Set.size` /
comprimento de array), sem alterar estado e sem fazer IO.

## Limites obrigatórios

- Não alterar `zcodeProcessResourceSampleSchema`; a amostra de protocolo continua enviando apenas
  campos `rssKb` / CPU.
- Não conectar as amostras de memória à cadeia `session/event`, ao conversation frame do V4, ao
  task realtime bus, a snapshot, queue, continuous ou à recuperação replayable; o `/remote` do
  celular não participa.
- O renderer escreve via `logMemoryDiagnostics` de `packages/ui/src/logger.ts`; essa é a exceção
  da "cadeia oficial de monitoramento" em `docs/performance/renderer-production-logging.md`, e a
  build de produção continua passando pela ponte, sendo no-op na Web quando não há ponte. Módulos de
  UI não podem chamar `window.zcode.log` diretamente.
- O main não usa `ps` / PowerShell para complementar a amostragem de outros processos; usa apenas
  `process.memoryUsage()` e `app.getAppMetrics()`.
- No lado da CLI, cada processo de workspace tem apenas o temporizador `unref()` já existente.

## Como visualizar

```bash
# Log principal do Desktop: curva de heapUsed por papel
grep '\[memory\] role=renderer' ~/.zcode/v2/logs/2026-09-03.log \
  | sed -E 's/^\[([^]]+)\].*heapUsedKb=([0-9]+).*shiki\.tokensCache=([0-9]+).*/\1 \2 \3/'

# Log da CLI
grep memory_sample ~/.zcode/cli/log/zcode-2026-09-03.jsonl | jq -c '[.time, .context.heapUsedKb, .context.counters.eventRows]'
```

Ordem de leitura: primeiro veja qual `role` tem `heapUsedKb` subindo monotonicamente; depois veja
qual contador na mesma linha sobe junto; `rssKb` subindo enquanto `heapUsedKb` não sobe indica o
lado native / ArrayBuffer, veja `externalKb` / `arrayBuffersKb`.

## Implementação

> A fonte de amostragem é compartilhada com a [Telemetria de CPU / memória de todos os processos](./process-resource-telemetry.md):
> o temporizador de 60 segundos do host e do renderer alimenta simultaneamente o log local e a amostra
> do ARMS com uma única leitura; a leitura de heap do main é integrada ao tick de 10 segundos da
> telemetria de recursos (uma vez a cada 6 ticks), e a CLI já tem a forma compartilhada.
> O gating e o formato de linha deste documento não mudam; os contadores `ws.*` do main passam,
> junto com o classificador de papéis da telemetria de recursos, a usar o novo vocabulário de
> `process_role` (`ws.renderer` → `ws.renderer_main` / `ws.renderer_guest`,
> `ws.utility_host` → `ws.host`, `ws.other` → `ws.chromium_other`, com o novo `ws.scheduler`),
> evitando manter dois conjuntos de nomes de papéis para a mesma lógica de classificação.

- Compartilhado: `packages/shared/src/memoryDiagnostics.ts` (`createMemorySampleWriteGate`,
  `formatMemorySampleLine`, `createMemoryDiagnosticsRegistry`, `memoryUsageToSampleFields`)
- CLI: `apps/zcode-cli/packages/bootstrap/src/process-resource-sampler.ts`,
  `zcode-protocol-entrypoint.ts`, `zcode-protocol/server.ts`, `zcode-protocol-v4/v4-gateway.ts`,
  `apps/zcode-cli/packages/adapters/src/storage/index.ts`
- services: `packages/services/src/memoryDiagnostics.ts` e o auto-registro dos cinco services
- host: `packages/desktop/src/host/hostMemoryDiagnosticsLog.ts` (gating e formato de linha); a entry
  em host/index.ts é `hostSelfResourceTelemetry.ts`, que envolve este módulo e entrega a mesma
  leitura de `memoryUsage()` simultaneamente à telemetria de recursos (o hook `onMemoryUsage` é
  independente do gating de gravação: a linha local pode ser pulada pelo gating, mas a amostra de
  telemetria é enviada a cada 60 segundos)
- main: `packages/desktop/src/main/mainMemoryDiagnostics.ts`, `desktopResourceTelemetry.ts`
- renderer: `packages/ui/src/lib/memoryDiagnostics.ts`, `packages/ui/src/logger.ts`; o ponto de
  injeção do sampler `reportHeapSample` fica antes do gating de gravação e entrega a mesma leitura de
  `performance.memory` à telemetria de recursos via
  `IPlatformService.reportRendererHeapSample` (a linha local pode ser pulada pelo gating, mas a
  amostra de telemetria é enviada a cada 60 segundos; na Web e no controle remoto do celular, sem
  ponte, é no-op)

## Cases de aceitação

| Case ID | Setup | Action | Assertions | Layer |
| --- | --- | --- | --- | --- |
| MEM-001 | gate vazio | primeira evaluate | Retorna `first` | unit |
| MEM-002 | heap anterior 100000 | heap 104000, contadores inalterados | Retorna `null` | unit |
| MEM-003 | heap anterior 100000 | heap 106000 | Retorna `changed` | unit |
| MEM-004 | Alguma chave de contador mudou | evaluate | Retorna `changed` | unit |
| MEM-005 | Nada mudou | 300s completos | Retorna `heartbeat`, depois reinicia a contagem | unit |
| MEM-006 | registry tem um provider que lança erro | collect | Os demais providers retornam normalmente, o que lançou é pulado | unit |
| MEM-007 | sampler da CLI | Injetar readMemoryUsage | O segundo parâmetro de onSample é o memoryUsage completo, o formato da amostra de protocolo não muda | unit |
| MEM-008 | tick de 60s do host | Avançar o timer | logger.info com uma linha contendo `role=utility_host heapUsedKb=`; após stop não sai mais nada; a mesma leitura é enviada via parentPort como `HostResourceSample` | unit |
| MEM-009 | 6 ticks de 10s do main | Avançar o timer | logger.info com uma linha contendo `role=main` e `ws.<process_role>=`; a mesma leitura é usada simultaneamente como amostra de heap do main em `perf_process_window` | unit |
| MEM-010 | build de produção do renderer | `logMemoryDiagnostics` | Ainda chama a ponte; sem ponte é no-op | unit |
| MEM-011 | tick de 60s do renderer | Avançar o timer | A mesma leitura envia a amostra de heap pela ponte preload e escreve a linha local conforme o gating; ticks pulados pelo gating ainda enviam a amostra; erro da ponte não afeta a linha local | unit |
