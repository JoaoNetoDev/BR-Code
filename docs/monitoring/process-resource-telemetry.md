# Telemetria de Recursos de Processo (CPU / Memória) — em todos os processos

Status: **implementado** (v3.12.1). Design finalizado em 2026-09-14, fechamento de contrato concluído em 2026-09-15.
O status de execução da aceitação está em «Casos de Aceitação» e «Registro de Verificação de Fechamento»; as limitações de plataforma e a verificação remota real estão listadas separadamente e não equivalem a aceitação total.
Este documento é a especificação atual de telemetria de recursos CPU / memória; o conteúdo antigo de recursos em [Monitoramento de Performance](./performance-monitoring.md), [CLI Resource Reporting](./zcode-cli-resource-telemetry.md) e [Ciclo de Vida do MCP](./mcp-process-arms-telemetry.md) foi substituído por esta entrada. A versão de descontinuação dos eventos antigos está em [Dicionário de Eventos](./performance-telemetry-catalog.md).

### Contrato de correções da re-revisão (2026-09-15)

Esta seção fixa a semântica de correção de R1–R7 e N1/N2; os resultados de execução são registrados separadamente; a superfície de impacto está em [Impacto e Verificação das Correções da Re-revisão](./process-resource-telemetry-fixes.md).

- **R1 / N2**: o Server independente declara suporte a este conjunto de eventos de desvio de recursos no campo opcional `capabilities.processResourceTelemetry` de `/api/server-info`. O Host só assina os Servers que declaram suporte; quando o Server antigo não tem o campo, a conexão continua normal e a assinatura de telemetria é pulada. Ambas as implementações de Server declaram a capacidade. Local e SSH/WSL/Docker empacotados com o Desktop mantêm o caminho de assinatura original, sem verificação de número de versão,aviso de UI ou mudança de versão principal do protocolo.
- **R2**: a CLI gera um `completionToken` aleatório para cada fato de conclusão de Bash lento, transmitido apenas dentro do protocolo. O main é o único owner de deduplicação, usando um conjunto recente com no máximo 1024 itens, para que o mesmo fato chegando por múltiplas conexões e múltiplos Hosts de janela seja reportado apenas uma vez. Métricas idênticas com tokens diferentes ainda contam uma vez cada; o token não entra no ARMS e não gera novos logs de negócio; o tap de diagnóstico de protocolo bruto, habilitado explicitamente, preserva a semântica existente de registro de frames.
  O campo é opcional para compatibilidade com CLI antiga; sem token, o comportamento antigo do evento é preservado, sem adivinhar a identidade do comando pelo conteúdo das métricas.
- **R3**: as novas leituras da CLI são julgadas agrupadas por papel, superfície de execução, ambiente de execução e hardware; apenas grupos com novas leituras geram amostras de papel.
  Os totais em nível de dispositivo preservam o tempo real de chegada da leitura por instância de processo; o julgamento de expiração não pode ser renovado pelo momento de entrega do main nem por outras instâncias do mesmo grupo.
  O orçamento de amostras externas é de 128 itens (64 instâncias de CLI e o orçamento original de 64 fontes MCP), permanecendo limitado e sem que instâncias desplacem o MCP.
  O tique de 60 segundos, entregas de múltiplos grupos fora de fase e a janela residual na saída compartilham o mesmo conjunto de regras.
- **R4**: o Host reutiliza `buildRemoteEnvironmentKey(target)` (o Server prioriza o serverId retornado) para construir a identidade de ambiente, a hasheia e a coloca no campo opcional `environmentKey` do Host→main. O armazenamento de instâncias, o agrupamento e a janela final de CLI/MCP incluem essa identidade, garantindo que especificações iguais em ambientes diferentes não sejam somadas e que múltiplas conexões do mesmo ambiente ainda sejam unificadas.
  Local e Hosts antigos sem o campo usam o agrupamento de identidade vazia original. A identidade é usada apenas para isolamento em memória; a lista de permissões de atributos do ARMS não muda.
- **R5**: no mesmo tique, o heap de múltiplos Hosts usa o máximo das leituras já chegadas; é limpo após a entrega, evitando que um valor baixo tardio sobrescreva o pico.
- **R6**: a varredura de CI cobre as nomenclaturas `telemetry`, `process-probe`, `process-resource`, `processResource`; todos os módulos de origem reais devem estar protegidos. O amostrador sob demanda do gerenciador de recursos mantém as isenções justificadas de palavras-chave.
- **R7 / N1**: a remoção de comentários precisa reconhecer expressões regulares, escapes e classes de caracteres; crases dentro de regex não podem abrir template strings, e `/*` dentro de regex não pode abrir comentário de bloco. Chamadas proibidas em código válido devem ser detectadas; palavras proibidas em comentários reais devem ser ignoradas.

```text
Server antigo sem capacidade ──> Host pula a assinatura de recursos ──> conexão continua funcionando
Server novo com capacidade ──> Host repassa identidade de ambiente e identificador de conclusão ──> agrupamento / dedupe no main ──> envio pela lista de permissões
Tempo real de leitura da CLI ──> novas leituras do grupo ──> janela limitada; a entrega não renova a idade da leitura
```

Esses fatos de desvio não entram em task/session, CommandInbox, snapshot nem fluxos de recuperação; o desktop `desktop-continuous` e o attachment do celular `web-remote-replayable` continuam retornando eventos de telemetria vazios.

### Cadeia implementada e limites de compatibilidade

- O main coleta de forma unificada, através de um registro de origens, os sete papéis do Chromium, os dois papéis da CLI e o MCP; as origens em nível de dispositivo leem os totais exatos de cada origem na segunda fase do mesmo tique. Leituras de heap, amostras recentes de CLI/MCP e eventos instantâneos de Bash convergem pelo único caminho de owner descrito abaixo.
- O host e o renderer principal reutilizam o temporizador existente de log de memória; o gating de escrita em disco não afeta a telemetria. O main só aceita heap de webContents de janela principal já registrado; leituras do gerenciador de recursos, about, DevTools e webview guest são descartadas.
  O heap é limpo na entrega; se não houver amostra completa de papel no tique, é descartado. Como os temporizadores das janelas têm fases diferentes, o heap mean do renderer é a média da maior leitura entre as janelas que chegaram em cada tique, e o peak é a maior leitura de janela única.
- A CLI entrega a cada 60 segundos o total recente das instâncias vivas; apenas novas leituras contam como amostra. A saída normal complementa com `flushPending` os fatos recebidos mas não entregues. O `instanceToken` só distingue instâncias na memória do main, não entra no ARMS; a lane é marcada pelos services conforme o gerenciador de processos, a CLI em si não carrega lane. A constante de tique é declarada em um único ponto no shared.
- CLI antiga → app novo permanece compatível (heap, uptime, total de memória, instanceToken opcionais; campos de hardware ausentes caem um a um para valores do desktop); CLI nova → app antigo tem schema estrito que rejeita campos novos, e a telemetria é descartada silenciosamente. O risco de assinatura de eventos do server independente antigo e o método de aceitação remota real estão em PRT-030.
- Cada service collection remota é assinada uma única vez, com tempo de vida atrelado ao dispose do connection handle; o attachment do celular recebe eventos vazios, sem adicionar assinatura subjacente. A dimensão da máquina de execução entra na chave de agrupamento da janela, e amostras remotas não contam para o total do dispositivo.
- O tracker do MCP é o único detentor de conexão, owner e instâncias; resultados antigos em trânsito são descartados após reinício de processo, fechamento ou parada do tracker.
  O main deduplica por instância e tempo de amostragem, e cada flush projeta apenas uma soma por grupo (sample_count=1), com no máximo 32 grupos MCP; o excedente gera apenas log debug. Notificações antigas de memória são descartadas no novo main.
- O Bash estabelece um owner por comando no limite real de spawn, reutilizando o poller de um segundo já existente, com no máximo 20 sondas a partir de 15 segundos; amostras tardias são descartadas após o exit ou o fechamento por stop. O Windows não cria temporizador de amostragem de recursos e envia apenas 10 atributos de custo zero.
- A sonda de contagem de threads do main, a amostragem de papéis de 10%, o layout de atributos mutuamente exclusivos antigo, os campos de VRAM da GPU e de IO de disco foram removidos. MCP / Bash compartilham a sonda genérica da CLI, e toda a cadeia é protegida pelo gating de palavras-chave de telemetria.

### Convenção de fechamento (ticket 11)

Os três eventos novos têm a lista de permissões de atributos do shared como contrato de código; a spec e o dicionário de eventos listam os atributos item a item, e os testes de contrato do PRT-026 verificam a consistência dos dois documentos com a lista. Apenas estreitam-se exportações sem chamadores, sem alterar o registro de origens, o owner de janela, a temporalidade de amostragem, a semântica de falha nem os limites desktop continuous / mobile replayable. A verificação reutiliza as costuras de teste já acordadas abaixo; UT e E2E rodam, por exigência do usuário deste ticket, apenas os casos afetados; passing, skipped ou blocked são registrados separadamente — a existência de um arquivo de teste não equivale a execução bem-sucedida.

O gating de todo o repositório corrige simultaneamente um falso positivo em um documento de contrato existente: a enumeração de arquivos do módulo gerenciado precisa incluir `CONTRACT.md`, mas o documento não participa da análise de import / contagem de linhas do código-fonte; quando o documento está realmente ausente, `missing-module-artifact` ainda é reportado. A regressão reutiliza o limite de fixture de módulo temporário de `checkArchitecture`, sem modificar a política de arquitetura nem atualizar o baseline.

## Declaração do Problema

Hoje os times de produto e desenvolvimento não conseguem responder em uma frase "qual processo do ZCode, em qual versão, em que tipo de máquina consome quanto de CPU e memória, e se piorou". Os pontos de instrumentação de recursos existentes no ARMS estão dispersos em três eventos (`perf_resource_window`, `perf_resource_agent`, `perf_mcp_memory`), com três schemas, três cadeias, e apresentam os seguintes defeitos:

- O detalhe por papel de processo é coletado apenas em 10% dos dispositivos; problemas de baixa frequência (um certo plugin comendo memória em um certo tipo de máquina) são quase invisíveis.
- No Linux, a CPU do ARMS é medida em núcleo único, enquanto a UI do gerenciador de recursos é medida na máquina inteira — o mesmo métrico com dois números.
- O processo main inicia um `ps` a cada 10 segundos para contar threads, violando a regra do projeto de que "main não inicia processos externos", e consumindo CPU por conta própria.
- Subprocessos MCP têm apenas memória, sem CPU; o cron scheduler não tem papel e fica misturado em `other`; a documentação da CLI de workspace remoto descreve a cadeia de envio, mas o código não faz a conexão.
- Quando o usuário reclama que "a ferramenta Bash é muito lenta e muito travada", nenhum dado distingue se o comando em si é pesado, se a máquina não tem memória, ou se a própria CLI está ocupada.
- Para contornar o limite de 20 atributos por evento do ARMS, o mesmo evento usa dois layouts de atributos mutuamente exclusivos quando "acerta a amostragem de papel" e quando "não acerta", tornando o painel difícil de consultar diretamente.

Houve também um incidente histórico: um ponto de instrumentação de processo fez máquinas de usuários Windows chamarem PowerShell a cada poucos segundos, degradando significativamente o computador. Telemetria de performance prejudicando a performance é exatamente o que esta spec precisa eliminar.

## Solução

Um conjunto unificado de pontos de instrumentação de recursos de processo, cobrindo todos os papéis de processo do desktop, três eventos, um schema:

- `perf_process_window`: um registro por papel de processo a cada 5 minutos, com mean / p95 / peak de CPU e memória; papéis multiprocesso carregam simultaneamente o total e o maior processo individual, além de tempo de execução e proporção foreground/background. Todos os dispositivos, todos os papéis, sem amostragem.
- `perf_system_window`: um registro por dispositivo a cada 5 minutos, com CPU da máquina inteira, memória livre restante, total da aplicação e o próprio custo da telemetria.
- `perf_tool_exec_resource`: um registro por comando Bash acima de 15 segundos, com o pico de memória da árvore de processos do comando e o tempo de CPU, além do estado de memória da própria CLI e da máquina inteira no momento.

A aplicação apenas reporta com precisão, completude e representatividade; "o que conta como anomalia" é julgado pela plataforma própria de monitoramento lendo a fonte de dados RUM conforme as «Regras de Alerta do Lado da Plataforma» deste documento. Todos os pontos de coleta priorizam APIs dentro do processo; sondas de processos externos são permitidas apenas em dois itens de lista de permissões e com throttling rígido; o processo main tem zero processos externos e PowerShell é proibido em toda a cadeia.

## Histórias de Usuário

1. Como responsável por performance, quero mean / p95 / peak de CPU e memória a cada 5 minutos para cada papel de processo, para ver, até 1 hora após um lançamento, se algum processo piorou.
2. Como responsável por performance, quero que todos os dispositivos reportem todos os papéis em vez de 10% de amostragem, para que problemas de baixa frequência como um plugin comendo memória em um certo tipo de máquina também apareçam.
3. Como responsável por performance, quero que papéis multiprocesso carreguem simultaneamente o total e o maior processo individual, para distinguir "o usuário abriu muitos workspaces" de "um processo está vazando memória".
4. Como responsável por performance, quero que o evento carregue o tempo de execução do processo, para descobrir no plateforme o crescimento da memória com o tempo por bucket de duração, sem precisar que o cliente faça julgamento de vazamento.
5. Como responsável por performance, quero que processos Node carreguem o uso do JS heap, para distinguir vazamento de JS heap de crescimento em native / ArrayBuffer / subprocessos.
6. Como responsável por performance, quero um evento de nível de dispositivo com CPU da máquina inteira, memória livre restante e total da aplicação, para julgar se o problema foi causado pelo ZCode ou pela própria máquina do usuário.
7. Como responsável por performance, quero que os eventos antigos sejam descontinuados e os novos substituam tudo de uma vez, para que o painel não misture bases e o período de transição não duplique o envio.
8. Como engenheiro de plantão, quero que a spec forneça uma lista de regras de alerta diretamente implementável, com métrica, agrupamento, limiar e significado, para configurar na plataforma própria sem depender da capacidade de alerta do ARMS.
9. Como engenheiro de plantão, quero que as regras de alerta sejam definidas por proporção populacional e comparação entre versões, para não ser perturbado pela variação normal de um único dispositivo.
10. Como engenheiro de plantão, quero regras de qualidade de dados, para ser o primeiro a saber quando a cadeia de coleta quebra ou o volume de envio sai de controle.
11. Como responsável por plugin, quero que o MCP reporte memória e CPU por `mcp_id`, para encontrar o plugin que consome recursos e empurrar a correção.
12. Como responsável por plugin, quero ver a CPU do MCP quando o aplicativo está em background, para descobrir plugins que fazem polling em segundo plano.
13. Como desenvolvedor de Agent, quero um resumo de recursos para comandos Bash acima de 15 segundos, para responder ao usuário que reclamou de travamento se o comando em si é pesado, a máquina está sem memória ou a própria CLI está ocupada.
14. Como desenvolvedor de Agent, quero que o resumo do Bash inclua o tempo de CPU da árvore de processos do comando, para distinguir comando ocupado de comando esperando entrada ou rede.
15. Como desenvolvedor de Agent, quero que a CLI de workspace remoto também reporte e marque runtime_surface=remote, para que o cenário remoto deixe de ser uma área cega.
16. Como usuário final, quero que a telemetria não deixe meu computador lento, para que o monitoramento de performance não se torne um novo problema de performance.
17. Como usuário Windows, quero que o background nunca apresente processos PowerShell ou oscilação de CPU por causa da telemetria, para que o incidente histórico não se repita.
18. Como usuário final, quero que meus caminhos de arquivo, workspace, sessão, conteúdo de comandos e nomes de modelo não apareçam na telemetria, para que a privacidade não seja vazada.
19. Como desenvolvedor desktop, quero que a base de CPU seja consistente com a UI do gerenciador de recursos em todas as plataformas, para que o número visto pelo usuário e o visto pelo backend sejam o mesmo.
20. Como desenvolvedor desktop, quero que cada processo tenha uma única fonte de amostragem alimentando simultaneamente o log de diagnóstico local e o ARMS, para que os dados dos dois lados sejam consistentes e os temporizadores não dobrem.
21. Como desenvolvedor desktop, quero que o cron scheduler tenha seu próprio papel, para que seus recursos não fiquem afogados em `other`.
22. Como desenvolvedor desktop, quero que as janelas incompletas sejam drenadas na saída normal do aplicativo, para que os dados de sessões curtas não se percam.
23. Como desenvolvedor desktop, quero que o log de diagnóstico local `[memory]` seja preservado, para que o isolamento em uma única máquina ainda tenha contadores de domínio disponíveis.
24. Como desenvolvedor de UI, quero que o JS heap do renderer entre no ARMS, para que vazamentos no renderer possam ser vistos em nível populacional, e não apenas nos logs do usuário.
25. Como analista de dados, quero que todos os papéis compartilhem um schema, para que uma única SQL agrupando por process_role gere o gráfico.
26. Como analista de dados, quero que o evento carregue sample_count e telemetry_self_ms, para julgar a qualidade dos dados e o custo da própria telemetria.
27. Como analista de dados, quero que plataforma, arquitetura, contagem de núcleos e total de memória dos eventos de papel descrevam "a máquina em que aquele processo realmente roda", para que a CLI remota não seja incorretamente atribuída ao hardware da máquina desktop.
28. Como responsável por custo, quero que o volume por dispositivo por dia seja previsível e protegido por regras, para que o custo cobrado por registro não saia do controle.
29. Como QA, quero asserções E2E de que os três nomes de evento aparecem na janela de desenvolvimento e que a contagem de atributos não excede 20, para que uma regressão de subnotificação ou estouro de limite seja detectada imediatamente.
30. Como QA, quero um gating no Windows comprovando que main e CLI nunca iniciam PowerShell, para que a linha vermelha tenha verificação por máquina em vez de promessa verbal.

## Modelo de Processo e Papéis

A árvore de processos do desktop em execução (verificado no código-fonte, modo local):

```text
Electron App（instância única）
├─ main（Browser）                        常驻 ×1
│   ├─ GPU                                 Chromium 托管 ×0~1
│   ├─ Chromium utility（network 等）      Chromium 托管，按需
│   ├─ renderer 主窗口                     ×1/主窗口
│   │    └─ <webview> guest renderer       ×N/内置浏览器 tab
│   ├─ 辅助 renderer                       按需短命：update-status / 资源管理器 / about / DevTools 等
│   ├─ Host（utilityProcess）              ×1/主窗口
│   │    ├─ zcode-cli chat lane            ×1/workspaceKey
│   │    │    ├─ MCP stdio 子进程          ×1/已连接 MCP
│   │    │    └─ Bash 工具子进程            ×N，短命
│   │    ├─ zcode-cli plugin / mcp-status lane
│   │    ├─ node-pty shell、git 等短命子进程
│   │    ├─ Windows CUA Helper             Windows，×1/Host
│   │    └─ wsl.exe / docker exec          ×1/远端连接
│   └─ cron scheduler（utilityProcess）    常驻 ×1
└─ macOS CUA Helper.app                    由 launchd 拉起，故意不是子进程
```

No modo remote o desktop não cria processos novos; o zcode-server remoto e seus CLI / MCP / pty ficam todos na máquina remota. O desktop controlado remotamente pelo celular também não cria processos novos e não participa desta spec.

### Definição de papéis (10 na primeira fase)

| process_role     | Processos cobertos                                                                               | Origem de CPU e RSS                                                                                       | Origem de heap                                          | Granularidade de envio                |
| ---------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------- |
| `main`           | Processo principal do Electron                                                                  | `app.getAppMetrics()` do main, a cada 10 segundos                                                          | Autocoleta, 60 segundos                                 | Processo individual                    |
| `renderer_main`  | Renderer do webContents da janela principal                                                       | Idem                                                                                                       | Renderer coleta `performance.memory` a cada 60 s e envia ao main via bridge de preload | Agregado: total + maior processo individual |
| `renderer_guest` | Processo guest `<webview>` do navegador embutido                                                  | Idem                                                                                                       | Nenhum                                                  | Agregado: total + maior processo individual |
| `gpu`            | Processo GPU                                                                                      | Idem                                                                                                       | Nenhum                                                  | Processo individual                    |
| `chromium_other` | Utility como network, renderer de janelas auxiliares, DevTools e o resto dos processos Chromium não classificados | Idem                                                                                                       | Nenhum                                                  | Agregado                               |
| `host`           | Host da janela                                                                                    | Idem                                                                                                       | Autocoleta, 60 segundos, enviado ao main por parentPort  | Agregado: total + maior processo individual |
| `scheduler`      | cron scheduler                                                                                    | Idem                                                                                                       | Autocoleta, 60 segundos, enviado ao main por parentPort  | Processo individual                    |
| `cli_chat`       | Um zcode-cli por workspace                                                                        | Autocoleta da CLI a cada 60 s, encaminhada ao main pelo Host                                               | Mesma amostragem                                       | Agregado: total + maior processo individual |
| `cli_aux`        | zcode-cli das duas lanes plugin e mcp-status                                                     | Idem                                                                                                       | Mesma amostragem                                       | Agregado                               |
| `mcp`            | Árvore de processos de cada serviço MCP                                                          | CLI coleta a cada 5 minutos; no macOS `ps` lê a tabela de processos e filtra raiz e descendentes, no Linux lê `/proc`, no Windows `tasklist` só memória | Nenhum                                                  | Um registro por mcp_id                |

Regras de atribuição de papel: o main classifica usando o conjunto de pids da mesma origem de `collectChromiumProcessRolePids`. O processo de SO do webContents da janela principal é `renderer_main`; processos de webContents com `getType() === "webview"` são `renderer_guest`; os pids de utilityProcess do Host e do scheduler são registrados em seus respectivos pontos de spawn; todos os outros processos Chromium são `chromium_other`. O papel de CLI é determinado pela **`lane` que os services marcam na amostra** (o processo CLI não sabe sua própria lane, e a lane não é um campo do protocolo da CLI): `chat` vai para `cli_chat`, `plugin` / `mcp-status` vão para `cli_aux`.

### Processos não coletados

Comandos Bash curtos (ver plano de comandos lentos), git, shells node-pty, worker_threads (threads, contabilizadas no processo hospedeiro), subprocessos remotos que não passam pelo tracker da CLI / executor do Bash, e o controle remoto pelo celular. O papel `cua_helper` foi movido para a segunda fase, pelo motivo descrito em «Out of Scope».

## Arquitetura de Coleta

```text
renderer_main ──60s heap，preload 桥 IPC─────────────┐
host ──60s 自采（cpuUsage + memoryUsage），parentPort─┤
scheduler ──60s 自采，parentPort─────────────────────┤
CLI ──60s 自采 + 5min MCP 样本，protocol 通知──► Host ──转发──┤   local 与 remote 同一路径
CLI ──Bash 慢命令完成事件，protocol 通知────────► Host ──转发──┤
                                                            ▼
                           main：10s getAppMetrics + os 整机指标 + 有界聚合窗口
                                                            │ 每 5 分钟（开发构建 1 分钟）
                                                            ▼
                                       ARMS sendCustom（只有 main 持有凭据）
```

### Detalhes por origem

- **Sistema Chromium (lado main)**: `app.getAppMetrics()` é chamado a cada 10 segundos, lendo `percentCPUUsage`, `workingSetSize` e `creationTime` de cada processo. No Linux `percentCPUUsage` é em base de núcleo único e, antes da agregação, é dividido pelo número de núcleos lógicos, usando a mesma função de normalização do gerenciador de recursos. No mesmo tique lê-se também o delta de `os.cpus()` para a CPU da máquina inteira e `os.freemem()` para a memória livre da máquina inteira.
- **Autocoleta de processos Node (main, host, scheduler, CLI)**: `process.cpuUsage()` e o delta de um relógio monotônico dão os núcleos de CPU e a porcentagem normalizada pela máquina inteira; `process.memoryUsage()` obtém `rss` e `heapUsed` de uma vez. Há apenas um temporizador de 60 segundos por processo; host e renderer reutilizam o temporizador existente do log de diagnóstico de memória, e uma única leitura alimenta ao mesmo tempo o log local e a amostra do ARMS, coerente com a forma já existente na CLI.
- **Heap do renderer**: reutiliza a amostragem existente de `performance.memory` a cada 60 segundos; além de escrever no log local, envia uma amostra ao main de forma unidirecional pela bridge de preload. Sem bridge no lado Web, é no-op. CPU e RSS continuam vindos do `getAppMetrics()` do main.
- **MCP (lado CLI)**: o tracker de MCP da CLI mantém o mapeamento pid ↔ mcp_id. A cada 5 minutos coleta todas as árvores de processos MCP ativas: no macOS, um `ps -eo pid=,ppid=,rss=,cputime=` (a árvore de processos precisa do ppid para expandir descendentes; `-p <lista de pids>` retorna apenas a própria lista, sem pegar os filhos de processos wrappers como `npx`); no Linux, lê primeiro todos os `/proc/<pid>/stat` para obter ppid, pgid e utime/stime, e depois lê apenas o `VmRSS` de `/proc/<pid>/status` dos pids da árvore, sem iniciar processo; no Windows, um `tasklist /FO CSV /NH`, apenas memória e sem ppid, degradando a árvore de processos ao processo direto. A CPU é o delta entre dois `cputime` consecutivos dividido pelo intervalo, ou seja, a média de 5 minutos. Um amostra por janela, `sample_count=1`. O mcp_id segue a definição e as regras de mascaramento de mcp-process-arms-telemetry.md.
- **Comandos Bash lentos (lado CLI)**: a amostragem começa quando o subprocesso da ferramenta Bash roda por 15 segundos completos, seguindo a cada 15 segundos, e uma notificação de conclusão é enviada quando o comando termina. No macOS a fronteira é o grupo de processos, `ps -o pid=,rss=,cputime= -g <pgid>`; no Linux lê `/proc` filtrando por pgid; no Windows não coleta a árvore de processos e carrega apenas campos de custo zero. O timeout padrão do Bash é de 5 minutos, com no máximo cerca de 20 amostras por comando. Comandos com menos de 15 segundos não geram evento algum.
- **Base de CPU**: todas são porcentagens normalizadas pela máquina inteira, onde 100 significa todos os núcleos lógicos ocupados. O evento carrega `logical_cpu_count`, permitindo ao lado da plataforma converter para número de núcleos.
- **Base de memória**: métrica principal é RSS (working set no Windows), em KB. Processos Node e renderer_main anexam `heap_used_kb`. Não são enviados private, shared nem VRAM da GPU.
- **Foreground/background**: o main registra o scene uma vez por tique de 10 segundos; há foreground quando existe uma janela visível e focada. Dentro da janela, `background_ratio = número de tiques em background / total de tiques`.
- **Tempo de execução**: processos Chromium usam `creationTime`; amostras de CLI e MCP carregam `uptimeMinutes`. Papéis multiprocesso usam o máximo.
- **Dimensão de hardware**: `platform`, `arch`, `logical_cpu_count` e `total_memory_gb` dos eventos de papel descrevem sempre a máquina em que aquele processo realmente roda. Amostras de CLI e MCP remotos carregam esses quatro valores e sobrescrevem os padrões globais; papéis locais usam os valores da máquina desktop.

## Contrato dos Eventos

Todos os eventos carregam os atributos globais `platform`, `app_version`, `arms_env`, `device_mid`. A união dos atributos globais e do evento não excede o limite de ARMS de 20 atributos por evento; atributos com valor `undefined` não são enviados e não contam para o limite. `group=resource`.

### `perf_process_window`

Um registro por papel / runtime_surface / grupo de máquina de execução por janela, com MCP agrupado adicionalmente por mcp_id. `value` é `cpu_percent_mean`.

| Categoria | Atributo                     | Descrição                                                                              |
| --------- | ---------------------------- | -------------------------------------------------------------------------------------- |
| Dimensão  | `process_role`               | Os 10 valores de enumeração da tabela acima                                            |
| Dimensão  | `runtime_surface`            | `local` / `remote`                                                                     |
| Dimensão  | `arch`                       | Arquitetura da máquina de execução                                                      |
| Dimensão  | `logical_cpu_count`          | Núcleos lógicos da máquina de execução                                                 |
| Dimensão  | `total_memory_gb`            | Memória física da máquina de execução, em GB inteiros                                  |
| Dimensão  | `mcp_id`                     | Apenas para o papel `mcp`                                                               |
| Estado    | `background_ratio`           | De 0 a 1, com duas casas decimais                                                      |
| Estado    | `uptime_minutes`             | Minutos de execução do processo mais antigo dentro do papel                            |
| CPU       | `cpu_percent_p95`            | p95 da CPU total do papel dentro da janela                                             |
| CPU       | `cpu_percent_peak`           | Máximo da CPU total do papel dentro da janela                                          |
| Memória   | `rss_kb_total_mean`          | Média da soma do RSS de todos os processos do papel                                    |
| Memória   | `rss_kb_total_peak`          | Máximo da soma do RSS de todos os processos do papel                                    |
| Memória   | `rss_kb_max_process_peak`    | Maior RSS de um processo individual dentro da janela                                    |
| Memória   | `heap_used_kb_mean`          | Apenas Node e renderer_main; em papéis multiprocesso, o maior processo individual de cada leitura recebida, depois a média |
| Memória   | `heap_used_kb_peak`          | O mesmo, tomando o máximo                                                               |
| Qualidade | `process_count_peak`         | Máximo de processos vivos simultaneamente do papel dentro da janela                   |
| Qualidade | `sample_count`               | Número de amostras na janela; papéis do lado main esperam 30, papéis CLI esperam 5, mcp é 1 |

Contagem de atributos: papéis Node e renderer_main no máximo 20 (os dois itens de heap são omitidos quando não há coleta); mcp tem 19 (sem os dois itens de heap, com mcp_id); gpu, renderer_guest e chromium_other têm 18.

### `perf_system_window`

Um registro por dispositivo por janela. `value` é `app_cpu_percent_mean`. 17 atributos.

| Categoria | Atributo                                                     | Descrição                                                                                        |
| --------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| Dimensão  | `arch`, `logical_cpu_count`, `total_memory_gb`               | Máquina desktop                                                                                   |
| Estado    | `background_ratio`, `app_uptime_minutes`                     | `background_ratio` tem a mesma origem dos eventos de papel; o uptime vem do tempo de execução do processo main |
| Máquina   | `system_cpu_percent_p95`                                     | Delta de `os.cpus()`                                                                              |
| Máquina   | `system_free_memory_kb_min`                                  | Mínimo de `os.freemem()` dentro da janela                                                         |
| Aplicação | `app_cpu_percent_p95`                                        | Soma de todos os processos ZCode locais                                                            |
| Aplicação | `app_rss_kb_total_mean`, `app_rss_kb_total_peak`             | Total exato do sistema Chromium a cada 10 segundos, mais a última amostra conhecida de CLI e MCP    |
| Aplicação | `process_count_total_peak`                                   | Pico do número total de processos ZCode locais                                                    |
| Qualidade | `sample_count`                                               | O primeiro tique sem baseline de CPU não gera amostra; para janela de 5 minutos espera-se 29        |
| Qualidade | `telemetry_self_ms`                                          | Milissegundos de relógio de parede acumulados pelo código de amostragem e agregação do lado main dentro da janela, medidos com `performance.now()` |

Duas categorias de origem para o total da aplicação:

- **Sistema Chromium**: o total exato de `getAppMetrics()` a cada 10 segundos, na mesma leitura dos eventos de papel.
- **Fontes externas (CLI, MCP)**: não estão em `getAppMetrics()` e o ciclo de amostragem também não é de 10 segundos; por isso apenas a última amostra conhecida de cada fonte é mantida, com expiração julgada pelo próprio ciclo de amostragem da fonte — sem amostra nova por mais de dois ciclos, deixa de contar (CLI 120 segundos, MCP 600 segundos). Amostras de processos remotos não contam para o total de nível de dispositivo. Preferimos subcontar a usar um valor antigo como fato atual.

### `perf_tool_exec_resource`

Um registro por comando Bash acima de 15 segundos, enviado imediatamente quando o comando termina. `value` é `duration_ms`. 12 atributos; no Windows faltam os dois itens `tree_*`.

Convenção de implementação de 09: o adaptador de execução cria o amostrador por comando no limite real de spawn do Bash, e o tempo gasto preparando shell / arquivos de saída não conta em `duration_ms`. A passagem de foreground para background reutiliza o mesmo amostrador; o fechamento acontece uma única vez na saída do processo raiz ou no settle do stop existente, sem esperar sondas ou leitura de saída. A elegibilidade para envio começa exatamente em 15 segundos; um comando que termina em 5 segundos não gera evento; no Windows nenhum temporizador de amostragem é criado e apenas o contexto de custo zero é capturado no fim, com `sample_count=0`. Em plataformas não-Windows há no máximo 20 tentativas, e apenas resultados de sonda bem-sucedidos e não vazios contam para `sample_count`; sem amostras bem-sucedidas, os dois itens de tree ficam em 0. O RSS é o máximo das somas de RSS do grupo de processos em cada amostragem; a CPU acumula por PID o primeiro valor cumulativo e os incrementos não negativos seguintes, preservando a CPU já observada de processos desaparecidos, para evitar que a saída de descendentes efêmeros faça o acumulado retroceder (um processo que nasce e morre entre duas amostragens é invisível). Reutiliza-se o poller compartilhado de um segundo já existente do Bash, com gating por relógio monotônico a partir do início do comando; comandos fora de fase podem ter até um ciclo de erro de agendamento, com primeira amostragem não antes de 15 segundos e intervalo não menor que 15 segundos; atrasos do event loop não geram amostragem compensatória. Nenhum intervalo novo por comando. Não há sobreposição de amostragem no mesmo comando, e resultados tardios após o fechamento são descartados; falha de sonda ou exceção no callback da notificação descarta apenas a telemetria, sem modificar o resultado da ferramenta.
Exit normal (incluindo code diferente de zero) é completed, timeout é timeout, cancel / kill da árvore / saída por signal é killed, spawn error é error; spawn error abaixo do limiar também não envia notificação.

```text
adapter spawn → 每命令 owner → 15s / 30s / …（最多 20 次）
                    └→ root exit / stop → 同步封口 → process/toolExecResource
                         → services strict schema → trusted Host → main sendCustom
```

A notificação é transmitida pelo desvio de recursos existente do Host; o terminal-client (desktop-continuous / web-remote-replayable) não assina. Não se adicionam status de task, filas, retentativas nem replay; a plataforma de hardware descreve a máquina onde a CLI está. O limite de aceitação reaproveita PRT-010/011/012 e é validado por regressão com subprocessos reais do adaptador de execução para timeout, cancel, transferência para background e saída original inalterada.

| Categoria | Atributo                | Descrição                                                          |
| --------- | ----------------------- | -------------------------------------------------------------------- |
| Dimensão  | `runtime_surface`       |                                                                     |
| Dimensão  | `tool_name`             | Fixo em `bash` na primeira fase                                      |
| Dimensão  | `exit_kind`             | `completed` / `timeout` / `killed` / `error`                        |
| Comando   | `tree_rss_kb_peak`      | Pico da soma de RSS da árvore de processos do comando               |
| Comando   | `tree_cpu_time_ms`      | Tempo de CPU acumulado da árvore; dividido por `duration_ms` dá a razão de ocupação |
| Comando   | `sample_count`          | Número de amostras coletadas                                         |
| Contexto  | `cli_rss_kb`            | RSS da própria CLI no fim do comando                                 |
| Contexto  | `system_free_memory_kb` | Memória livre da máquina inteira no fim do comando                  |

### Limite de Privacidade

Nenhum evento carrega pid, caminho de arquivo, identificador de workspace, session / task id, texto de comando, nome de modelo ou prompt. `mcp_id` segue as regras de mascaramento existentes. O conjunto de chaves de atributos é validado por lista de permissões em teste unitário.

## Ritmo de Envio, Janelas e Saída

| Item                                   | Valor                                                    |
| -------------------------------------- | -------------------------------------------------------- |
| Janela de tendência                    | Produção 5 minutos; builds de desenvolvimento e E2E 1 minuto para facilitar a verificação |
| Amostragem do lado main                | 10 segundos                                              |
| Autocoleta de processos Node           | 60 segundos                                              |
| Amostragem de MCP                      | 5 minutos, 1 amostra por janela                          |
| Comandos Bash lentos                   | Limiar de 15 segundos, intervalo de 15 segundos          |
| Limite de amostras por papel por série | 32 (tolera deriva de temporizador)                       |
| Limite de mcp_id por janela            | 32, excedentes descartados                               |
| Limite de amostras por comando Bash    | 20                                                       |

Na saída normal o main drena as janelas incompletas de todos os eventos de papel e de sistema; `sample_count` reflete fielmente a janela residual, sem persistência nem retentativa. Quando o processo CLI sai, amostras em trânsito são descartadas diretamente. Crash, kill forçado ou queda de energia permitem a perda de janelas não enviadas.

O E2E roda o build empacotado (`app.isPackaged === true`), portanto o critério da janela de 1 minuto é «build de desenvolvimento» ou «`ZCODE_ENV=test` com `ZCODE_E2E_RUN_ID`»; o cliente de produção é sempre 5 minutos.

Estimativa de volume: cerca de 14 registros a cada 5 minutos (10 papéis, se todos vivos, cerca de 3 mcp_id, 1 evento de sistema), aproximadamente 1350 eventos de tendência por dispositivo para 8 horas online por dia; os eventos Bash são contados à parte pelo número de comandos lentos. A situação atual é de cerca de 480 a 576 registros. A cobrança é por registro, e o efeito vem primeiro.

## Regras de Alerta e Painéis do Lado da Plataforma

Três princípios de design: observar proporção populacional em vez de um único dispositivo; três formas de julgamento — comparação de regressão entre versões, proporção sobre limiar absoluto e crescimento com o tempo de execução; limiares começam em um valor inicial e depois são calibrados com p95 reais. Todas as regras exigem pelo menos 100 dispositivos no grupo, caso contrário não são avaliadas. "Linha de base" significa o valor dos últimos 7 dias da mesma versão estável anterior do mesmo papel. Prioridade P1 é tratamento imediato, P2 no mesmo dia, P3 no relatório semanal.

### Configuração da primeira fase (20 regras)

**Classe A: regressão entre versões** (24 a 48 horas após o lançamento, P1)

| Regra              | Métrica e estatística                                                          | Agrupamento                 | Condição de disparo                    | Significado                                        |
| ------------------ | ------------------------------------------------------------------------------ | --------------------------- | -------------------------------------- | ---------------------------------------------------- |
| A1 Regressão de memória | p95 de nível de dispositivo de `rss_kb_total_mean`                       | process_role × app_version | Nova versão acima de 1,2× a linha de base | Algum processo ficou maior em geral na nova versão |
| A2 Regressão de CPU ocioso | p95 de `cpu_percent_p95` nas janelas com `background_ratio ≥ 0.9`      | process_role × app_version | Acima de 1,5× a linha de base, ou valor absoluto acima de 5% | Continua queimando CPU em background, normalmente timer ou vazamento de polling |
| A3 Regressão de CPU em foreground | p95 de `cpu_percent_p95` nas janelas com `background_ratio ≤ 0.1`  | process_role × app_version | Acima de 1,3× a linha de base            | Mais travado durante a interação                    |
| A4 Regressão na contagem de processos | média de `process_count_peak`                                  | process_role × app_version | Acima de 1,5× a linha de base            | Falha na recuperação de processos                   |
| A5 Regressão do total da aplicação | p95 de `perf_system_window.app_rss_kb_total_mean`                | app_version                | Acima de 1,2× a linha de base            | Uso de memória do ZCode sentido pelo usuário         |

**Classe B: limiar absoluto** (janela móvel de 1 hora, P2). A estatística é "a proporção de dispositivos ativos que tiveram alguma janela acima do limiar na última hora em relação a todos os dispositivos ativos", e a condição de disparo é uniformemente "proporção acima de 2× a linha de base e acima de 3%".

| Regra | Papel                   | Métrica                                      | Limiar inicial      |
| ----- | ----------------------- | -------------------------------------------- | ------------------- |
| B1    | renderer_main           | `rss_kb_max_process_peak`                     | 1,5 GB              |
| B2    | main                    | `rss_kb_max_process_peak`                     | 800 MB              |
| B3    | host                    | `rss_kb_max_process_peak`                     | 800 MB              |
| B4    | cli_chat                | `rss_kb_max_process_peak`                     | 1,5 GB              |
| B5    | mcp, agrupado por mcp_id | `rss_kb_max_process_peak`                     | 1 GB                |
| B6    | gpu                     | `rss_kb_max_process_peak`                     | 1 GB                |
| B7    | scheduler               | `rss_kb_max_process_peak`                     | 300 MB              |
| B8    | cli_aux                 | `rss_kb_max_process_peak`                     | 1 GB                |
| B9    | renderer_guest          | `rss_kb_total_peak`                           | 2 GB                |
| B10   | Evento de sistema       | `app_rss_kb_total_peak / total_memory`        | Acima de 40%         |
| B11   | Evento de sistema       | `system_free_memory_kb_min / total_memory`    | Abaixo de 5%; contexto de pressão da máquina, P3 |

**Classe G: qualidade de dados** (janela móvel de 1 hora, P1, protege todas as outras regras)

| Regra               | Métrica                                                | Condição de disparo            | Significado                                                                |
| ------------------- | ------------------------------------------------------ | ------------------------------ | ----------------------------------------------------------------------------- |
| G1 Perda de amostragem | `sample_count < 15` em eventos de papel do lado main | Proporção de dispositivos acima de 5% | O event loop do main ficou bloqueado mais da metade do tempo; já é sinal de travamento do main |
| G2 Papel ausente    | Há evento de renderer_main mas nenhum de host na mesma janela | Proporção de dispositivos acima de 2% | A cadeia de coleta quebrou ou o Host não subiu |
| G3 Volume anômalo   | Total de eventos por dispositivo por dia               | Acima de 1,5× o esperado       | Lógica de envio fora de controle; alerta de custo                          |
| G4 Valor anômalo    | Eventos com `cpu_percent_* > 100` ou `rss_kb_* = 0`   | Proporção acima de 0,1%         | Bug de base de cálculo; problemas de normalização do Linux aparecem aqui     |

### Configuração da segunda fase (13 regras, aguardando acúmulo de dados de uma versão)

**Classe C: vazamento** (janela móvel de 24 horas, P2). Dividir por `uptime_minutes` em 4 buckets: 0 a 1 hora, 1 a 4 horas, 4 a 8 horas, acima de 8 horas.

| Regra                     | Métrica e estatística                     | Agrupamento                 | Condição de disparo                                       | Significado                            |
| ------------------------- | ------------------------------------------ | --------------------------- | --------------------------------------------------------- | ---------------------------------------- |
| C1 Memória cresce com o tempo | mediana de `rss_kb_total_mean` por bucket | process_role × app_version | Bucket acima de 8 horas 2× maior que o bucket de 0 a 1 hora | Curva típica de vazamento              |
| C2 Vazamento native       | mediana de `heap_used_kb_mean` e de rss por bucket | Idem, apenas papéis Node    | rss satisfaz C1 mas o heap cresce menos de 1,3×           | O que cresce não é o JS heap            |
| C3 Contagem de processos cresce com o tempo | mediana de `process_count_peak` por bucket | process_role               | Bucket acima de 8 horas 2× maior que o bucket de 1 hora  | Processos não recuperados; atenção a cli_chat, renderer_guest, mcp |

**Classe D: comportamento de CPU** (janela móvel de 1 hora, P2)

| Regra                    | Métrica e estatística                                                     | Agrupamento    | Condição de disparo | Significado                          |
| ------------------------ | -------------------------------------------------------------------------- | -------------- | ------------------- | ------------------------------------- |
| D1 Ociosidade em background | proporção de dispositivos com `background_ratio ≥ 0.9` e `cpu_percent_p95 > 10%` | process_role | Acima de 5%         | O usuário não está usando e o processo está ocupado |
| D2 CPU alta contínua em foreground | proporção de dispositivos com `background_ratio ≤ 0.1` e `cpu_percent_p95 > 50%` | renderer_main | Acima de 5% | Risco de travamento de UI            |
| D3 CPU alta no processo GPU | proporção de dispositivos com `cpu_percent_p95 > 30%`                  | gpu           | Acima de 3%         | Problema na camada de renderização    |
| D4 MCP ocioso consumindo CPU | igual a D1                                                     | mcp × mcp_id  | Acima de 5%         | Algum plugin fazendo polling em background |
| D5 CPU da máquina inteira saturada | proporção de dispositivos com `system_cpu_percent_p95 > 90%` e app acima da metade | app_version | Acima de 3% | O ZCode é a causa principal do travamento da máquina |

cli_chat não tem alerta de CPU; CPU alta durante o trabalho do Agent é normal.

**Classe E: topologia de processos** (janela móvel de 1 hora, P2)

| Regra                   | Métrica                                             | Limiar inicial                            | Significado                                                             |
| ----------------------- | --------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------ |
| E1 Acúmulo de processos CLI | `process_count_peak` de cli_chat                | Proporção de dispositivos acima de 6 acima de 3% | O limite de pré-aquecimento é 1; acima de 6 significa que o workspace não foi recuperado ao ser fechado |
| E2 Acúmulo de tabs do navegador | `process_count_peak` de renderer_guest     | Acima de 20                                 | Vazamento de tabs do navegador embutido                                |
| E3 Instâncias MCP demais  | número de mcp_id distintos na mesma janela         | Acima de 10                                 | Plugins iniciados em duplicidade                                        |
| E4 cli_aux sempre presente | `process_count_peak` de cli_aux acima de 0 em 12 janelas consecutivas | Proporção de dispositivos acima de 10% | A lane mcp-status deveria ser recuperada após 5 min de ociosidade |

**Classe F: comandos Bash lentos** (janela móvel de 24 horas, P3)

| Regra                        | Métrica e estatística                                                     | Condição de disparo            | Significado                                                      |
| ---------------------------- | -------------------------------------------------------------------------- | ------------------------------ | ----------------------------------------------------------------- |
| F1 Comando pesado            | proporção de comandos lentos com `tree_rss_kb_peak > 2 GB`                | Acima de 10%                   | O comando em si consome memória                                   |
| F2 Comando esperando         | proporção com `tree_cpu_time_ms / duration_ms < 0.05` e `duration_ms > 120 s` | Acima de 20%              | O comando está esperando entrada ou rede; melhorar timeout ou aviso; não avaliado no Windows |
| F3 Comando lento sob pressão da máquina | proporção de comandos lentos com `system_free_memory_kb` abaixo de 5% do total | Acima de 10%        | Falta de memória na máquina causa lentidão                        |
| F4 Inchaço da própria CLI    | proporção de comandos lentos com `cli_rss_kb > 1,5 GB`                    | Acima de 5%                    | A própria CLI cresceu durante o comando                           |
| F5 Regressão na frequência de comandos lentos | número de comandos lentos por dia por dispositivo ativo | Nova versão acima de 1,5× a linha de base | A cadeia de ferramentas ficou mais lenta |

### Exemplo de implementação de regra

```sql
-- B1：renderer 单进程内存超 1.5GB 的设备占比（近 1 小时）
SELECT app_version,
       COUNT(DISTINCT CASE WHEN rss_kb_max_process_peak > 1572864 THEN device_mid END) * 1.0
         / COUNT(DISTINCT device_mid) AS over_ratio
FROM perf_process_window
WHERE process_role = 'renderer_main' AND ts > now() - interval '1 hour'
GROUP BY app_version
HAVING COUNT(DISTINCT device_mid) >= 100
```

### Painéis

1. p50 / p95 de memória por papel comparados por app_version.
2. Mapa de calor de memória por bucket de uptime × papel.
3. Ranking de memória por mcp_id e CPU em background do MCP.
4. Linha do tempo por dispositivo, filtrada por device_mid, com sobreposição dos eventos de sistema.

## Linhas Vermelhas de Performance (Restrições Duras)

Nenhuma mudança de telemetria pode deixar a máquina do usuário mais lenta. As 7 regras abaixo entram na aceitação, com três camadas de gating: CI, teste unitário e E2E.

1. **Zero processos externos no processo main**. Remover a sonda atual de contagem de threads via `ps` a cada 10 segundos. O gating E2E existente no Windows `PERF-RES-01` é preservado.
2. **PowerShell, WMI, CIM e wmic proibidos em toda a cadeia**. A CI faz verificação de palavras-chave nos caminhos dos módulos de telemetria; o teste unitário afirma que execFile nunca foi chamado com powershell como argumento.
3. **A lista de permissões de processos externos tem apenas dois itens**: `ps` no macOS dentro do processo CLI e `tasklist` no Windows. Cada chamada tem timeout de 1 segundo, e o timeout descarta a amostra; após 3 falhas consecutivas a mesma instância de sonda é desativada até um `reset()` explícito. O MCP faz reset antes da próxima amostragem de cinco minutos; o Bash não reseta o orçamento de falhas dentro de um único comando. No Linux lê-se sempre `/proc`, sem iniciar processo.
4. **Um temporizador de telemetria por processo**, reutilizando temporizadores existentes, com `unref()` em processos Node, sem estender a vida do processo e sem adicionar temporizadores.
5. **Memória limitada**: os arrays de amostras são truncados pelos limites da tabela acima e o excedente é descartado; sem filas, persistência ou retentativa.
6. **Falha descarta**: falha em amostragem, validação, encaminhamento ou `sendCustom` descarta apenas a amostra atual, sem bloquear o negócio e sem lançar para o loop principal.
7. **Autoprova do custo**: o código de amostragem e agregação do lado main acumula o tempo de relógio de parede com `performance.now()` e o envia como `telemetry_self_ms`, permitindo observar diretamente o custo da própria telemetria após o lançamento.

### Convenção de nomenclatura de arquivos de telemetria protegidos (detalhamento da linha vermelha 2)

O gating por palavra-chave não pode varrer o repositório inteiro (a cadeia de recuperação de processos em `packages/services/src/process/` e a implementação de área de transferência da CLI usam PowerShell legitimamente), por isso a linha vermelha 2 recai sobre uma convenção de nomenclatura: **o código de telemetra fica em arquivos ou diretórios cujo nome contém `telemetry` / `Telemetry` / `process-probe` / `process-resource` / `processResource`**, e o gating varre apenas esse conjunto.

- **Escopo protegido**: arquivos de código-fonte (`.ts` / `.tsx` / `.js` / `.mjs` etc.) em `packages/desktop/src/**`, `packages/services/src/**`, `packages/shared/src/**` e `apps/zcode-cli/**/src/**` cujo **caminho relativo** contém `telemetry`, `Telemetry`, `process-probe`, `process-resource` ou `processResource`. O julgamento considera o caminho inteiro e não apenas o nome do arquivo — considerar apenas o nome deixaria todo o código de telemetria em diretórios inteiros como `apps/zcode-cli/packages/telemetry/src/` (`agent-metrics.ts`, `otlp-exporter.ts` etc.) e `*/src/telemetry/` escapar em bloco. O número de arquivos protegidos é contabilizado dinamicamente a partir do conjunto realmente rastreado pelo Git, e a saída do gating é a referência; os módulos do registro de origens também são garantidos no conjunto varrido por regressão cruzada.
- **Palavras-chave proibidas**: `powershell`, `Get-CimInstance`, `wmic`, `Get-Process` (sem distinção de maiúsculas).
- **Comentários não violam**: comentários de linha e de bloco são removidos antes da varredura, garantindo que comentários de spec e de bugfix possam explicar livremente «por que PowerShell é proibido»; literais de string são preservados, de modo que `execFile("powershell.exe", …)` é necessariamente capturado. O scanner reconhece escapes de regex e classes de caracteres, e crases dentro de regex não poluem mais os comentários seguintes; dentro de interpolação de template o código é tratado como código, e divisão não é confundida com regex. Chamadas reais e comentários reais têm regressões próprias em todo o repositório.
- **Arquivos de teste não são verificados**: `*.test.*`, `*.spec.*` e diretórios `test/` `tests/` `__tests__/` são excluídos — o teste unitário precisa afirmar positivamente «execFile nunca foi chamado com powershell como argumento» e por isso precisa poder escrever a palavra-chave.
- **`packages/ui` está fora do escopo**: o código do renderer não inicia subprocessos, e a amostra de heap do renderer é enviada pela bridge de preload.
- **Local da implementação**: `scripts/ci/ci-telemetry-keyword-guard.mjs`, invocado por `scripts/ci/ci-repo-hygiene.mjs` como primeira parada da CI (`.gitlab/ci/30-build.yml`). O teste unitário do script está em `scripts/ci/ci-telemetry-keyword-guard.test.mjs` (já integrado a `pnpm test:unit`, com a regressão «o repositório atual deve passar»). Localmente é possível rodar `node scripts/ci/ci-telemetry-keyword-guard.mjs` diretamente.
- **Todos os módulos de telemetria devem obedecer**: sondas, origens e módulos de agregação novos ou separados devem seguir essa nomenclatura, ou ficam automaticamente fora do gating.

Lista de isenções (escrita em `TELEMETRY_GUARD_EXEMPTIONS` do script de gating; os arquivos referenciados devem existir, caso contrário o gating falha com `K2`, impedindo o apodrecimento da lista). As entradas distinguem explicitamente se entram de fato na varredura; as duas entradas atuais são isenções vigentes, e palavras-chave não registradas ainda falham:

| Arquivo                                                                           | Status | Palavras-chave isentas                      | Motivo                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | ----- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/services/src/process/processResourceSampler.ts`                         | Vigente | `powershell`, `Get-CimInstance` | Amostrador da tabela de processos do lado Host do gerenciador de recursos: lê uma vez a tabela de processos da máquina inteira somente quando a janela do gerenciador está aberta e a solicitação é ativa, sendo uma **amostragem de UI sob demanda e não telemetria residente**; no Windows é preciso obter RSS e tempo de CPU ao mesmo tempo, e só o CIM permite isso. Roda no processo utility do Host, não no main, e não participa do envio de `perf_process_window`. O arquivo entra no conjunto varrido por causa da nomenclatura processResource e fica isento destas duas palavras-chave apenas por este motivo explícito. |
| `apps/zcode-cli/packages/contracts/src/telemetry/agent-execution.ts`                 | Vigente | `powershell`                    | Arquivo puramente de tipos: `powershell` é apenas a etiqueta de reporte de «qual shell o comando do usuário usa» na enumeração `CommandShellKind`, e não inicia processo algum.                                                                                                                                                                                                             |

A contagem de custo de cada ponto de coleta está na tabela abaixo, que fundamenta as linhas vermelhas.

| Ponto de coleta                  | Processo | Forma                             | Frequência                      | Processo externo      | Comparação com o status atual                   |
| ------------------------------- | -------- | --------------------------------- | ------------------------------- | --------------------- | ------------------------------------- |
| CPU e RSS do sistema Chromium    | main     | getAppMetrics                     | 10 segundos                     | Não                   | Inalterado                             |
| Contagem de threads do main      | main     | ps                                | Removido                        | Removido              | Redução líquida                        |
| Autocoleta de main / host / scheduler | cada um | cpuUsage, memoryUsage        | 60 segundos                     | Não                   | Reutiliza temporizador                 |
| Heap do renderer                 | renderer | performance.memory + 1 IPC        | 60 segundos                     | Não                   | Reutiliza temporizador                 |
| Autocoleta da CLI                | CLI      | sampler existente                 | 60 segundos                     | Não                   | Inalterado                             |
| MCP                              | CLI      | ps / /proc / tasklist            | 5 minutos                       | macOS e Windows       | Mantém o ritmo de cinco minutos da cadeia antiga |
| Árvore de processos de comandos Bash lentos | CLI | ps / /proc            | A cada 15 segundos, só durante comandos lentos | macOS é | Novo, desprezível frente a comandos pesados |
| Métricas da máquina inteira      | main     | os.cpus, os.freemem              | 10 segundos                     | Não                   | Novo, desprezível                      |

## Decisões de Implementação

- **Camada de protocolo shared**: o schema da notificação `process/resourceSample` ganha os campos opcionais `heapUsedKb`, `uptimeMinutes`, `totalMemoryGb` e `instanceToken` (gerado aleatoriamente na inicialização do processo CLI, com conjunto de caracteres restrito a `[A-Za-z0-9_-]{8,64}`, servindo apenas para o main contar processos e o maior processo individual, sem entrar no ARMS e sem conter pid); são adicionadas as notificações `process/mcpResourceSamples` (array, cada item com `mcpId`, `processCount`, `rssKbTotal`, `rssKbMaxProcess`, `cpuTimeMsDelta`, `uptimeMinutes`) e `process/toolExecResource` (evento de conclusão do Bash). Todos os campos novos são opcionais, e amostras enviadas por CLI antiga ainda passam na validação. **O número de versão do handshake não é incrementado**: a versão do handshake é um switch de compatibilidade e não uma versão de campos, e mudanças de campos de telemetria passam por campos opcionais. **A `lane` não está no schema do protocolo da CLI**: o processo CLI não sabe qual gerenciador de processos o iniciou; a lane é marcada pelos services do lado do app, portanto aparece apenas no `agentLaneResourceSampleSchema` interno do app (= schema do protocolo da CLI + `lane` opcional, ainda `strict`); uma lane reportada pela própria CLI é rejeitada diretamente pela camada de protocolo. As mensagens de resposta de Host para main acrescentam `HostResourceSample` (autocoleta do Host, payload `nodeSelfResourceSampleSchema`: três itens `cpuPercent` / `rssKb` / `heapUsedKb` e `strict`), `McpResourceSamples` e `ToolExecResource`, e o `sample` do `AgentResourceSample` existente passa a usar `agentLaneResourceSampleSchema`; a entrada do main continua com validação estrita pelo schema de resposta do host. O scheduler usa seu próprio protocolo privado (`scheduler/schedulerProtocol.ts` com `scheduler-resource-sample`), cujo payload reaproveita o mesmo schema e é validado de novo na ingestão pelo main, descartando amostras ilegais. São adicionados a enumeração `ProcessResourceRole`, o vocabulário `PROCESS_RESOURCE_CLI_LANES`, `resolveCliProcessResourceRole` (lane → papel, com padrão `cli_chat`) e as constantes de lista de permissões de chaves de atributos dos três eventos, compartilhados entre main e testes unitários.
- **CLI**: o sampler de recursos de processo existente passa a produzir heap, uptime, total de memória e instanceToken (a lane é marcada pelo lado do app, e a CLI não participa); é adicionado o amostrador de recursos MCP, que a cada 5 minutos obtém do tracker MCP o mapeamento pid e mcp_id e amostra conforme a plataforma; é adicionado o amostrador de comandos Bash lentos, preso ao ciclo de vida do subprocesso do adaptador de execução, com amostragem por grupo de processos após o limiar de 15 segundos e notificação de conclusão no fim. A autocoleta da CLI continua usando APIs internas do processo; MCP e Bash compartilham o mesmo módulo de sonda de plataforma `adapters/src/device/process-probe.ts` (`sampleProcessTrees(rootPids)`, `sampleProcessGroup(pgid)`, `reset()`, `treeScope`), implementando timeout, desativação por falhas consecutivas e a política de ausência de CPU no Windows. O orçamento de falhas pertence à instância da sonda: cada cenário de amostragem mantém uma instância de longa duração (uma para o MCP, uma por comando Bash), sem interferência entre cenários. O MCP faz `reset()` antes de cada amostragem de cinco minutos; o orçamento de falhas do Bash dura até o fim do comando.
  A base da árvore de processos no Windows é auto-relatada por `treeScope` (`direct_process`), e o chamador não precisa mais decidir a plataforma. A coleta existente de `perf_mcp_memory` a cada 5 minutos é desativada, e os eventos de ciclo de vida do MCP (start / crash / session-startup) permanecem inalterados. **Risco da mudança de base**: o timeout da amostragem MCP é apertado de 5 segundos para 1 segundo exigido pela linha vermelha; no Windows `tasklist` pode ultrapassar 1 segundo em máquinas sob alta carga, deixando a janela silenciosamente sem amostras; após o lançamento é preciso observar se a cobertura de janelas do papel mcp em `perf_process_window` no Windows diminui.
- **services**: o service de Agent analisa as novas notificações e as despacha como eventos dinâmicos; a service collection de workspace remoto também conecta a assinatura de telemetria de recursos, com runtime_surface=remote.
  Local de implementação (05): `wireClient` ganha um parâmetro de lane, e os quatro pontos de chamada passam respectivamente `chat` (os dois caminhos de Agent em nível de workspace), `plugin` e `mcp-status`; o tipo do payload de `onDynamicProcessResourceSample` passa de `ZCodeProcessResourceSample` para `AgentLaneResourceSample` (com uma `lane` opcional a mais). A lane só pode ser preenchida aqui: o gerenciador de processos é o único lugar que sabe «a qual lane este client pertence».
  Local de implementação (06): a assinatura remota passa pelo limite de `zcodeAgentConnectionScope` já existente, sem novo código na camada services — a conexão do zcode-server remoto com o Host do desktop é `trusted-host-relay` (o stdio de `packages/server` e o `/ws/host` de `zcode-server-cli`), e apenas esse papel pode assinar `onDynamicProcessResourceSample` / `onDynamicMcpTelemetry` / `onDynamicMcpResourceSamples`; o renderer e o attachment de controle remoto pelo celular são `terminal-client` e recebem `RpcEvent.None`.
- **Host**: o módulo de registro de telemetria de recursos encaminha de forma unificada amostras da CLI, amostras do MCP e eventos do Bash; a amostra do próprio Host reutiliza o temporizador de 60 segundos do log de diagnóstico de memória, com um delta de CPU acrescentado, e uma única leitura escreve ao mesmo tempo o log local e envia a mensagem pelo parentPort.
  Local de implementação (03): `desktop/src/host/hostSelfResourceTelemetry.ts` é a única entrada do host/index.ts e envolve `hostMemoryDiagnosticsLog` (com um novo hook `onMemoryUsage`, que entrega a mesma leitura à telemetria antes do gating de escrita em disco e de forma independente dele).
  Local de implementação (06): `registerHostServiceResourceTelemetry({ services, postMessage, runtimeSurface, onError })` em `desktop/src/host/hostServiceResourceTelemetry.ts` é a única entrada de «assinatura de telemetria de recursos de uma service collection», combinando internamente apenas os dois encaminhamentos `hostAgentResourceTelemetry` e `hostMcpTelemetry`. Há dois pontos de chamada: a inicialização dos host services locais (`runtime_surface=local`) e, em `createWindowRemoteConnectionHandle`, depois que os services remotos são construídos (`runtime_surface=remote`, assinatura mantida pelo handle e liberada em `dispose()`). Na ausência de Agent service ou se uma única assinatura lançar erro, retorna-se no-op e libera-se a que já foi estabelecida, nunca alterando o resultado da inicialização do Host ou da conexão remota.
- **scheduler**: nova autocoleta a cada 60 segundos enviada por parentPort; o ponto de spawn registra o pid no registro de papéis de processo do main.
  Local de implementação (03): `desktop/src/scheduler/schedulerResourceTelemetry.ts` (o único temporizador unref, iniciado em `main()` e parado em `dispose()`).
- **Conversão da autocoleta Node**: `createNodeSelfResourceSampler` em `packages/shared/src/node/nodeSelfResourceTelemetry.ts` é a lógica de delta compartilhada entre host e scheduler (estabelece o baseline de CPU na construção e retorna null quando o baseline está indisponível); não mantém temporizador nem é responsável por enviar, portanto a restrição «apenas um temporizador» fica a cargo do chamador.
- **renderer**: o amostrador de diagnóstico de memória, na mesma amostragem em que escreve o log local, envia uma amostra de heap ao main pela bridge de preload; sem bridge no Web, é no-op. A camada de UI não pode chamar `window.zcode.log` ou ipc diretamente.
  Local de implementação (04):
  - `startMemoryDiagnosticsLogger` em `packages/ui/src/lib/memoryDiagnostics.ts` ganha o ponto de injeção `reportHeapSample`, chamado antes do gating de escrita em disco; erro da bridge descarta apenas esta amostra de telemetria e o log local continua sendo escrito
  - `IPlatformService.reportRendererHeapSample` (`packages/shared/src/platform.ts`) é a única saída da UI, injetada ao amostrador por `App.tsx`; o desktop conecta a bridge de preload em `desktopPlatform.ts`, e o Web e o controle remoto pelo celular não implementam
  - `PlatformChannels.ReportRendererHeapSample` + `rendererHeapSampleSchema` (`strict`, apenas `heapUsedKb`); o preload expõe somente `ipcRenderer.send`, sem invoke
  - `desktop/src/main/processResourceRendererHeapSource.ts`: quarta linha do registro de origens, ao mesmo tempo o ponto de chegada do lado main desse canal e sua fronteira de confiança (o canal permite apenas um listener; registro duplicado não acumula). A atribuição é decidida por `event.sender.id` via `resourceManagerWindow.isMainApplicationWindowWebContents()` (a mesma fonte de dados dos pids por papel); apenas o heap é taken e entregue no tique seguinte por `addRoleHeapSample`, sendo limpo na entrega; com múltiplas janelas vale o máximo das leituras que chegaram neste tique
- **main**: o módulo de telemetria de recursos é reescrito. O tique de 10 segundos lê getAppMetrics e as métricas da máquina inteira, normaliza no Linux, classifica por papel e registra o scene; recebe amostras das várias origens em janelas limitadas; o flush de 5 minutos emite uma `perf_process_window` por papel e uma `perf_system_window`; eventos de Bash vão imediatamente para `sendCustom`; a saída normal drena janelas residuais. A sonda de contagem de threads, a amostragem de papéis de 10%, o layout de atributos mutuamente exclusivos, `perf_resource_window`, `perf_resource_agent` e `perf_mcp_memory` são removidos. O classificador de papéis ganha `renderer_guest`, `chromium_other` e `scheduler`. A função de normalização de CPU no Linux é elevada do módulo do gerenciador de recursos para uso compartilhado nos dois lugares.
  Divisão de módulos após a implementação (01):
  - `packages/shared/src/processResourceTelemetry.ts`: enumeração de papéis, nomes de evento, lista de permissões de chaves de atributos, contagem de atributos e validação de privacidade
  - `desktop/src/main/electronCpuNormalization.ts`: `normalizeElectronCpuToMachinePercent` (compartilhado entre a UI do gerenciador de recursos e a telemetria)
  - `desktop/src/main/processResourceRoleClassifier.ts`: classificação de processo Chromium → papel e agregação de um tique (funções puras)
  - `desktop/src/main/processResourceWindowAggregator.ts`: janelas limitadas e projeção do relatório (funções puras)
  - `desktop/src/main/processResourceWindowEvent.ts`: projeção de atributos de `perf_process_window`
  - `desktop/src/main/processResourceSampleSources.ts` + `processResourceSampleSourceRegistry.ts`: tabela de ingestão registrada por origem; **de 03 a 09 cada um adiciona um arquivo de origem e uma linha ao array do registro**, e um erro em uma única origem descarta apenas as próprias amostras. A amostragem tem duas fases: `sample()` produz amostras de papel e o total exato deste tique, e `sampleDevice()` atende origens que precisam de «fatos de outras origens já amostrados no mesmo tique» (janela de nível de dispositivo de 02)
  - `desktop/src/main/processResourceChromiumSource.ts`: origem do sistema Chromium (único ponto de leitura de `getAppMetrics()`, exportando também o total exato do sistema neste tique para uso pelo evento de nível de dispositivo)
  - `desktop/src/main/desktopResourceTelemetry.ts`: temporizadores, registro de scene, saída ARMS e drenagem na saída
    Módulos adicionados após a implementação (02):
  - `desktop/src/main/processResourceSystemSource.ts`: origem de nível de dispositivo (segunda linha do registro), único ponto de leitura do delta de `os.cpus()` e de `os.freemem()`, sem amostra no tique quando falta o baseline
  - `desktop/src/main/processResourceSystemWindowAggregator.ts`: janela limitada de nível de dispositivo e projeção do relatório
  - `desktop/src/main/processResourceSystemWindowEvent.ts`: projeção dos 17 atributos de `perf_system_window`
  - `desktop/src/main/processResourceExternalAppSamples.ts`: entrada de amostras externas (`recordExternalAppResourceSample`, mantendo a amostra mais recente por origem, expirando conforme o ciclo próprio de cada uma e com entradas limitadas; chamada por 05 e 08)
  - `desktop/src/main/processResourceAppTotals.ts`: única implementação do valor «soma de recursos de um lote de processos» e da lógica de soma, compartilhada pelo total exato do Chromium e pelo total das amostras externas
  - a única fonte de dados dos pids por papel é `resourceManagerWindow.collectChromiumProcessRolePids()`; a janela principal é registrada por `createWindow` chamando `registerMainApplicationWindow`, o scheduler por `spawnCronScheduler` chamando `registerSchedulerProcess`, e o guest `<webview>` é determinado por `webContents.getType() === "webview"`
  - a saída ARMS também escreve no anel de captura E2E compartilhado de `desktopArmsCustomEvent`, para que o E2E consiga ler os eventos emitidos pelo próprio main
    Módulos adicionados após a implementação (03):
  - `desktop/src/main/processResourceSelfHeapSource.ts`: origem do heap de autocoleta de host / scheduler (terceira linha do registro); `ingestHostSelfResourceSample` / `ingestSchedulerSelfResourceSample` são chamados pelos pontos de distribuição de mensagens de `desktopHostProcess` e `desktopCronScheduler`; apenas o heap é tomado e entregue no tique seguinte por `addRoleHeapSample`, sendo limpo na entrega
  - `ProcessResourceSampleContext.addRoleHeapSample(role, heapUsedKb)`: hook compartilhado pelas origens que só contribuem com leituras de heap (o heap do renderer de 04 o reaproveita). O heap é mesclado na amostra completa daquele papel dentro do mesmo tique, e a leitura é descartada quando esse papel não tem amostra completa neste tique — o heap é apenas uma dimensão adicional do evento de papel e não basta para abrir uma janela sozinho. O heap do próprio main também segue esse caminho de mesclagem e deixa de ter tratamento especial em `takeSample`
    Módulos adicionados após a implementação (05):
  - `desktop/src/main/processResourceCliSource.ts`: origem dos papéis de CLI (quinta linha do registro). `ingestCliResourceSample(sample, runtimeSurface)` é chamado pelo ponto de distribuição de `AgentResourceSample` de `desktopHostProcess` e mantém a leitura mais recente por processo sob a chave «papel × runtime_surface × instanceToken»; `sample()` entrega a cada 60 segundos a soma dos processos atualmente vivos e alimenta `recordExternalAppResourceSample` com o total local. **Não se adota «entrega limpa tudo»**: os temporizadores de 60 segundos dos vários processos de CLI têm fases diferentes e num tique normalmente chega apenas parte das leituras, de modo que uma entrega limpada deixaria `process_count_peak` e o total pequenos demais; o que o evento de papel quer é exatamente «quantos processos estão vivos ao mesmo tempo e qual é a soma». O critério de expiração é o mesmo das amostras externas de nível de dispositivo (2 ciclos)
  - `ProcessResourceHardwareOverride` e `processResourceHardwareKey` (em `processResourceWindowAggregator.ts`): as informações da máquina de execução autodeclaradas pela amostra passam a ter campos opcionais, e a saída `{ ...desktopHardware, ...report.hardware }` sobrescreve campo a campo — quando a CLI antiga só traz platform / arch / núcleo, `total_memory_gb` continua vindo da máquina desktop; a identidade de ambiente de execução do Host e a impressão digital de hardware entram juntas na chave da janela, e um evento descreve apenas um ambiente de execução
  - `ProcessResourceSampleSource.flushPending`: na drenagem de saída, preenche a janela com as leituras «recebidas mas não entregues»; as amostras MCP de 08 reaproveitam o mesmo hook
  - remoção de `desktop/src/main/agentResourceTelemetryWindow.ts` e da saída `perf_resource_agent`
- **Documentação**: o dicionário de eventos ganha os três eventos e anota a versão de descontinuação dos eventos antigos; a seção de recursos do documento de monitoramento de performance, o documento de envio de recursos da CLI e a seção de memória do documento do MCP passam a apontar para este documento; o documento de log de diagnóstico de memória complementa com «a fonte de amostragem é compartilhada com a telemetria de recursos».

## Decisões de Teste

Bom teste afirma apenas comportamento externo: dada uma conjunto de amostras de entrada e o avanço do relógio, afirmar o nome do evento emitido, o value, o conjunto de atributos e a contagem de atributos; dada uma plataforma, afirmar que nenhum processo externo foi iniciado; dada uma injeção de falha, afirmar que a amostra foi descartada sem lançar erro e sem bloquear. Não se testam estruturas de dados internas.

Costuras de teste (preferir reaproveitar as existentes, da mais alta para a mais baixa):

1. **Costura do agregador do main**: injetar `getAppMetrics` falso, métricas de `os` falsas, relógio e espião de `armsRum.sendCustom`, e avançar tiques e flush para afirmar eventos. Precedentes: `desktopResourceTelemetry.test.ts`, `desktopMcpTelemetry.test.ts`.
2. **Costura do amostrador da CLI**: injetar `readCpuUsage`, `readMemoryUsage`, `readMonotonicTimeNs`, temporizadores e stubs de sonda de plataforma. Precedente: teste unitário do process-resource-sampler no bootstrap da CLI.
3. **Costura de encaminhamento do Host**: falsos dynamic events do agentService e espião de `postMessage`. Precedentes: `hostAgentResourceTelemetry.test.ts`, `hostMemoryDiagnosticsLog.test.ts`.
   A conexão em nível de collection (06) usa a mesma costura um nível acima: registrar um stub de Agent service que implemente apenas os dois `onDynamic*` em um `ServiceCollection` real e afirmar a contagem de assinaturas, o `runtimeSurface` das mensagens encaminhadas e que após o dispose nada mais é encaminhado; para o controle remoto pelo celular, construir o attachment com `windowHostAttachmentRegistry` real + `createZCodeAgentConnectionScope` real e afirmar que o lado do attachment não obtém amostras e que a contagem de assinaturas subjacentes não muda. Precedente: `hostServiceResourceTelemetry.test.ts`.
4. **Costura do renderer**: falsificar `performance.memory` e a bridge de preload. Precedente: testes unitários de memoryDiagnostics e do logger na UI.
5. **Costura E2E**: janela de 1 minuto em desenvolvimento, lendo os custom events ARMS finais do lado main pelo canal existente `ReadFinalArmsCustomEventsE2E`. Precedentes: `desktopArmsCustomEventE2E.test.ts` e os E2E que usam esse canal.
6. **E2E de ausência de sonda no Windows**: o `windows-agent-metric-probe-absence.test.ts` existente é preservado e estendido para afirmar que o runtime log não contém `powershell`.
7. **Gating de palavras-chave na CI**: `ci-repo-hygiene` ganha a verificação de palavras-chave proibidas nos caminhos de módulos de telemetria. Precedente: as regras existentes de rejeição de artefatos node-gyp e `.playwright-mcp/` desse script.

Funções puras (classificação de papéis, estatística, listas de permissões de atributos, normalização, gating) têm todas teste unitário; a compatibilidade dos schemas de protocolo é testada em shared e services.

### Casos de Aceitação

| Case ID | Setup                                                                                                                | Action                           | Assertions                                                                                                                              | Layer          | Verificação e teste correspondente (2026-09-15)                         |
| ------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------- |
| PRT-001 | getAppMetrics falso com main / renderer da janela principal / webview guest / GPU / host utility / scheduler utility / outras utilities | Avançar 30 tiques de 10 s e depois flush   | 7 `perf_process_window` com papéis corretos, 1 `perf_system_window`; nenhuma com mais de 20 atributos                     | unit           | [x] passou; [desktop][prt-desktop], [system][prt-system]                    |
| PRT-002 | platform=linux, 8 núcleos, percentCPUUsage=80                                                                             | tick                             | cpu do papel = 10                                                                                                                        | unit           | [x] passou; [desktop][prt-desktop]                                         |
| PRT-003 | renderer_guest com 3 processos RSS 100 / 200 / 300                                                                          | flush                            | `rss_kb_total_peak`=600, `rss_kb_max_process_peak`=300, `process_count_peak`=3                                                          | unit           | [x] passou; [desktop][prt-desktop]                                         |
|PRT-004 | 9 dos 30 ticks em background                                                                                                | flush                            | `background_ratio`=0.3                                                                                                                  | unit           | [x] passou; [desktop][prt-desktop]                                         |
| PRT-005 | creationTime de 90 e 10 minutos atrás                                                                                      | flush                            | uptime correto para papéis de processo individual, máximo para papéis multiprocesso                                                     | unit           | [x] passou; [desktop][prt-desktop]                                         |
| PRT-006 | amostra de host com heapUsedKb; gpu sem                                                                                    | flush                            | evento de host com os dois itens de heap totalizando 20 atributos; evento de gpu sem heap, 18 atributos                                  | unit           | [x] passou; [desktop][prt-desktop]                                         |
| PRT-007 | 2 amostras de CLI com lane=chat, 1 com lane=plugin                                                                           | flush                            | `process_count_peak`=2 em cli_chat, cli_aux=1, total e maior processo individual corretos                                               | unit           | [x] passou; [cli][prt-cli]                                                 |
| PRT-008 | amostra de CLI com runtimeSurface=remote, platform=linux, arch=x64                                                          | flush                            | platform=linux e runtime_surface=remote no evento, sobrepondo o valor global da máquina desktop                                       | unit           | [x] passou; [cli][prt-cli]                                                 |
| PRT-009 | amostras MCP de dois mcp_id                                                                                                | flush                            | 2 eventos mcp com mcp_id cada, sem heap, 19 atributos                                                                                    | unit           | [x] passou; [desktop][prt-desktop]                                         |
| PRT-010 | Host encaminhando notificação de conclusão do Bash                                                                           | Imediatamente ao receber         | 1 `perf_tool_exec_resource`, value=duration_ms, 12 atributos; amostra no Windows com 10 atributos                                       | unit           | [x] passou; [desktop][prt-desktop]                                         |
| PRT-011 | amostrador Bash da CLI, relógio falso e stub de ps                                                                          | comando roda 40 s e termina     | uma amostragem em 15 s e outra em 30 s, peak correto, notificação de conclusão enviada uma única vez; comando terminando em 5 s não envia notificação | unit      | [x] passou; [bash][prt-bash]                                              |
| PRT-012 | amostrador Bash da CLI com platform=win32                                                                                   | comando de 40 s                  | sem campos tree, nenhum processo externo chamado                                                                                        | unit           | [x] passou; [bash][prt-bash]                                              |
| PRT-013 | amostrador MCP da CLI                                                                                                       | Avançar 5 minutos                | macOS chama ps uma vez e a expansão de raiz e descendentes está correta; Linux lê /proc sem spawn; Windows chama tasklist uma vez; timeout de 1 s descarta a amostra; desativa após 3 falhas consecutivas até o reset | unit | [x] passou; [probe][prt-probe], [mcp][prt-mcp]                            |
| PRT-014 | módulo do main, espião de child_process                                                                                    | tick + flush + flush de saída em todas as plataformas | child_process nunca foi chamado                                                                                                    | unit           | [x] passou; [desktop][prt-desktop], [system][prt-system]                    |
| PRT-015 | script de higiene da CI                                                                                                      | varrer caminhos de módulos de telemetria | sem powershell / Get-CimInstance / wmic / Get-Process                                                                              | CI             | [x] passou; [guard][prt-guard]                                             |
| PRT-016 | 12 ticks já existentes                                                                                                      | chamar stop com flush              | emite o evento de janela residual, `sample_count`=12; nenhuma amostragem após o stop                                                  | unit           | [x] passou; [desktop][prt-desktop], [system][prt-system]                    |
| PRT-017 | qualquer janela                                                                                                             | flush                            | `perf_system_window.telemetry_self_ms` existe e é ≥ 0                                                                                  | unit           | [x] passou; [system][prt-system]                                           |
| PRT-018 | 40 ticks sem flush                                                                                                          | flush                            | `sample_count` não ultrapassa 32                                                                                                       | unit           | [x] passou; [window][prt-window]                                           |
| PRT-019 | qualquer janela                                                                                                             | flush                            | não aparecem `perf_resource_window`, `perf_resource_agent`, `perf_mcp_memory`                                                         | unit           | [x] passou; [desktop][prt-desktop], [legacy][prt-legacy]                     |
| PRT-020 | tick de 60 s do host                                                                                                        | avançar o temporizador            | um `HostResourceSample` com cpuPercent / rssKb / heapUsedKb; a linha de log local continua sendo escrita conforme o gating; apenas um temporizador | unit | [x] passou; [host][prt-host]                                               |
| PRT-021 | tick de 60 s do renderer                                                                                                   | avançar o temporizador            | a bridge recebe a amostra de heap; o log local continua sendo escrito; no-op sem bridge                                                | unit           | [x] passou; [renderer][prt-renderer]                                       |
| PRT-022 | tick de 60 s do scheduler                                                                                                  | avançar o temporizador            | parentPort recebe a amostra                                                                                                            | unit           | [x] passou; [scheduler][prt-scheduler]                                     |

| PRT-023 | janela de 1 minuto em desenvolvimento                                                                                     | partida a frio entrando no workspace, esperar 90 s | O canal E2E lê `perf_process_window` (ao menos main, renderer_main, host) e `perf_system_window`; contagem de atributos não passa de 20 e está na lista de permissões; sem nomes de eventos antigos | e2e | [x] passou; [e2e][prt-e2e]                                   |
| PRT-024 | Windows, cenário PERF-RES-01                                                                                              | cruzar um ciclo de amostragem     | asserções originais preservadas; o runtime log não contém powershell                                                                       | e2e (Windows)   | [ ] pulado condicionalmente no macOS, pendente no Windows; [windows][prt-windows] |
| PRT-025 | amostras de CLI no formato antigo (sem campos novos)                                                                      | análise pelos services            | passa na validação e é despachada                                                                                                    | unit           | [x] passou; [compat][prt-compat]                                           |
| PRT-026 | chaves de atributos dos três eventos                                                                                       | validação por lista de permissões | sem chaves de privacidade; a spec / tabela de atributos do dicionário de eventos é item a item consistente com a lista do código | unit      | [x] passou; [contract][prt-contract]                                       |
| PRT-027 | service collection de workspace remoto (Agent service é proxy RPC do zcode-server remoto)                                   | Host estabelece a conexão remota | a assinatura de telemetria de recursos foi registrada, e amostras de CLI e eventos MCP vão ao main com `runtimeSurface=remote` | unit      | [x] passou; [remote][prt-remote]                                           |
| PRT-028 | estabelecer `web-remote-replayable` attachment sobre a mesma collection remota                                                | conectar o controle remoto pelo celular | o lado do attachment obtém eventos vazios ao assinar amostras de recursos, a contagem de assinaturas subjacentes não muda e só a assinatura do Host continua encaminhando ao main | unit | [x] passou; [remote][prt-remote]                        |
| PRT-029 | conexão remota já assinada                                                                                                  | liberar o connection handle       | as duas assinaturas são liberadas (dispose repetido é idempotente) e amostras posteriores não são encaminhadas; sem Agent service ou erro em uma assinatura, não assina e não lança erro | unit | [x] passou; [remote][prt-remote]                        |
| PRT-030 | workspace remoto real (SSH / WSL / Docker / Server) + janela de 1 minuto em desenvolvimento                                   | permanecer conectado 90 s         | O canal E2E lê o evento `cli_chat` com `runtime_surface=remote`, com `platform` / `arch` da máquina remota; sem eventos duplicados quando o controle remoto pelo celular entra | manual | [ ] verificação manual com remoto real pendente; apenas a UT de assinatura passou; [remote][prt-remote] |

[prt-desktop]: ../../packages/desktop/test/desktopResourceTelemetry.test.ts
[prt-system]: ../../packages/desktop/test/desktopResourceSystemWindow.test.ts
[prt-cli]: ../../packages/desktop/test/processResourceCliSource.test.ts
[prt-bash]: ../../apps/zcode-cli/packages/adapters/tests/bash-resource-telemetry.test.ts
[prt-probe]: ../../apps/zcode-cli/packages/adapters/tests/process-probe.test.ts
[prt-mcp]: ../../apps/zcode-cli/packages/adapters/tests/mcp-resource-telemetry.test.ts
[prt-legacy]: ../../packages/desktop/test/desktopMcpTelemetry.test.ts
[prt-host]: ../../packages/desktop/test/hostSelfResourceTelemetry.test.ts
[prt-renderer]: ../../packages/ui/test/memoryDiagnostics.test.ts
[prt-scheduler]: ../../packages/desktop/test/schedulerResourceTelemetry.test.ts
[prt-e2e]: ../../packages/desktop/test/e2e/process-resource-telemetry-roles.test.ts
[prt-windows]: ../../packages/desktop/test/e2e/windows-agent-metric-probe-absence.test.ts
[prt-compat]: ../../packages/services/test/zcodeAgentService.resourceTelemetry.test.ts
[prt-contract]: ../../packages/shared/test/processResourceTelemetry.test.ts
[prt-remote]: ../../packages/desktop/test/hostServiceResourceTelemetry.test.ts
[prt-guard]: ../../scripts/ci/ci-telemetry-keyword-guard.test.mjs
[prt-window]: ../../packages/desktop/test/processResourceWindowAggregator.test.ts

### Registro de Verificação de Fechamento (2026-09-15)

- UT afetados: 29 arquivos e 234 casos em app / shared / services / renderer; 6 arquivos e 51 casos em CLI adapters / bootstrap (incluindo um subprocesso Node real no macOS e um smoke test de recursos Bash de 16,5 segundos); 12 casos de gating de arquitetura. Conforme pedido do usuário deste ticket, a UT completa não foi executada. As duas regressões novas foram verificadas como falhando antes e passando depois: PRT-026 sem tabela de atributos no documento, e o gating de todo o repositório sem enumerar CONTRACT.md.
- `pnpm typecheck` e `pnpm --filter @zcode/desktop typecheck:e2e` passaram; `pnpm lint` com 0 erros / 42 warnings pré-existentes; a verificação de formatação dos arquivos alterados passou.
- `pnpm architecture:check` e `pnpm architecture:check --changed` passaram, com baseline / new ambos em 0. O gating reportava erroneamente como ausente o `packages/services/src/storage/CONTRACT.md`, que já existia no disco: a enumeração de arquivos só coletava código-fonte. Documentos de contrato foram agora incluídos e a análise de código-fonte os exclui; ausência real ainda falha, e o baseline não foi atualizado.
- Os problemas pré-existentes de `pnpm knip` continuam fazendo o comando sair com código diferente de zero; comparado ao início da tarefa, exportações de valores não usadas 707 → 704 e exportações de tipos 915 → 914, sem nova exportação não usada. Antes de remover o export do limite de instâncias de CLI e das funções/tipos internos de CPU do sistema, `dep:refs` em todo o repositório confirmou que não há referência externa; a implementação de amostragem foi mantida.
- Os três nomes de eventos antigos, `hardware_profile` e `role_detail_sampled` têm zero ocorrências no código de produção; os testes mantêm as asserções negativas de descontinuação dos eventos antigos. O gating de palavras-chave de telemetria passou (56 arquivos protegidos, 2 isenções registradas).
- E2E: conforme pedido mais recente do usuário, apenas PRT-023 / PRT-024 afetados foram executados, com código de saída 0: PRT-023 **1 passed (59,7 s)**, PRT-024 **1 skipped** (condição de plataforma macOS, precisa de verificação no Windows). `ZCODE_E2E_SPEC` especificou `process-resource-telemetry-roles.test.ts` e `windows-agent-metric-probe-absence.test.ts`; ID de execução: `desktop-e2e-20260915090553275-p30388-8c6c049d47706164`. Uma tentativa completa anterior foi abortada conforme pedido do usuário; as falhas de assinatura, sessões em background etc. permanecem nos artefatos correspondentes, não são tratadas como resultado da aceitação afetada deste ticket e o escopo não é ampliado. PRT-030 exige um workspace remoto real e ainda não foi executado; uma única unitário de assinatura não substitui a aceitação remota real.
- code-review de dois eixos: 0 itens em Standards; as 4 inconsistências de documentação antiga encontradas na revisão da Spec foram corrigidas, sem problemas de implementação remanescentes. A limpeza apenas estreitou exportações internas do módulo desktop; owner de estado, ordem dos eventos de amostragem, isolamento da máquina de execução remota e os limites de entrega continuous / replayable permanecem inalterados.

#### Método de verificação manual de PRT-030 (ticket 06)

1. Subir o build de desenvolvimento com `pnpm dev:desktop` (a janela em desenvolvimento é de 1 minuto, não 5).
2. Conectar um workspace remoto real (SSH / WSL / Docker / Server, qualquer um), entrar nesse workspace e enviar uma conversa, confirmando que o zcode-cli remoto foi iniciado.
3. Permanecer mais de 90 segundos, para que a CLI remota faça pelo menos uma autocoleta (60 segundos) e atravesse uma janela de envio.
4. Ler os eventos: em ambiente E2E, usar o canal `ReadFinalArmsCustomEventsE2E` para obter os custom events finais emitidos pelo main; na verificação manual, olhar diretamente o log de saída ARMS do main. Filtrar `perf_process_window` com `runtime_surface=remote`.
5. Asserções: pelo menos um `process_role=cli_chat`; `platform` / `arch` / `logical_cpu_count` / `total_memory_gb` são os valores da máquina remota e não da desktop; papéis locais da mesma janela (main / host / renderer_main) continuam com `runtime_surface=local` e o RSS das duas máquinas não foi somado.
6. Fechar o workspace remoto (fechar a tab → liberação do logical session) e esperar mais uma janela: nenhum evento `cli_chat` daquela máquina remota deve aparecer. **Atenção à causalidade**: a assinatura é recolhida junto com a entrada no registro; em caso de queda de rede os eventos também param, mas isso é porque a CLI remota já está inacessível e não prova que a assinatura foi liberada — para verificar a liberação é preciso passar pelo caminho de fechar o workspace.
7. Cenário misto: conectar o desktop a um Server independente antigo sem `capabilities.processResourceTelemetry` e confirmar que as RPC de negócio continuam funcionando, que o Core antigo não sai e que não há assinatura de eventos de recursos; depois conectar um Server que declara a capacidade e confirmar que as quatro categorias de telemetria são encaminhadas normalmente. A lacuna do fixture E2E do Desktop antigo real está no documento de verificação das correções.

**Limite do cenário misto (R1 / N2 já corrigido)**: antes, o Host assinava incondicionalmente `onDynamicProcessResourceSample`, `onDynamicMcpTelemetry`, `onDynamicMcpResourceSamples` e `onDynamicToolExecResource` para o remoto. Não apenas versões mais antigas que precedem os dois primeiros eventos estavam em risco; o staging de referência `26dcf8d27c` também não tinha os dois últimos itens novos, e eventos desconhecidos lançam exceção através do `ProxyChannel`, do `ChannelServer` e do loop de leitura WebSocket do lado antigo, causando a saída do Core; o try/catch do desktop não captura exceções da contraparte.
O Host atual verifica o campo opcional de capacidade de `/api/server-info` antes de emitir a assinatura; sem a capacidade, pula este conjunto de eventos de desvio e mantém a conexão normal, sem adivinhar capacidade por número de versão. Ambas as implementações de Server declaram suporte. Local e SSH/WSL/Docker empacotados com o Desktop mantêm o caminho de assinatura original. O comportamento genérico de eventos desconhecidos em RPC do Server antigo não foi alterado pela atualização do cliente, mas esta entrada de telemetria não envia mais assinaturas de eventos a Servers que não os suportam.

## Fora de Escopo

- **Papel `cua_helper`**. O Helper do Windows é forkado pelo Host, mas executa o código do pacote externo fixado zcode-cua-helper-runtime, e a autocoleta exigiria alterar o upstream e passar por uma atualização atômica `bump:producer`; o Helper.app do macOS é iniciado pelo launchd e não está na árvore de processos, então o Host só poderia amostrá-lo via `ps`. Solução para a segunda fase: o runtime do Helper se reporta em CPU e RSS no heartbeat de saúde já existente, com zero processos externos.
- Probes MCP / Bash separados no lado do zcode-server. Os fatos de recursos gerados pela própria CLI remota são encaminhados pelo relay Host trusted existente, já conectado por 08 / 09.
- CPU do MCP e árvore de processos do Bash no Windows. A direção é uma extensão nativa sem processos externos (GetProcessMemoryInfo / GetProcessTimes), um esforço de engenharia independente.
- A configuração das classes de alerta C, D, E e F (as regras já estão definidas neste documento, aguardando acúmulo de dados para serem configuradas).
- A janela do gerenciador de recursos e sua amostragem via CIM no Windows. É acionada pelo usuário abrindo a janela, não é telemetria, mas é um mecanismo da mesma natureza do incidente histórico; recomenda-se avaliar separadamente a substituição por tasklist.
- Eventos de estabilidade (perf_crash, perf_anr, perf_process_exit etc.), eventos de volume do diretório de dados e eventos de rede permanecem inalterados.
- O formato de linha e os contadores de domínio do log de diagnóstico local `[memory]` permanecem inalterados.
- O controle remoto pelo celular e o lado Web não participam.
- A configuração de alertas do próprio console ARMS.

## Observações Adicionais

- A cobrança é por número de registros enviados. O princípio de design é efeito primeiro, e sobre essa base remove-se o envio sem sentido, sem orçamento rígido.
- Todo o julgamento de alerta acontece na plataforma própria, pelos seguintes motivos: mudanças de limiar não exigem lançamento; alertas valiosos são julgamentos populacionais; a lógica de julgamento no cliente tem bugs e falhas de notificação são invisíveis.
- As estatísticas de CPU mantêm p95 e peak; a memória mantém apenas peak e mean: o dano da CPU vem de ocupação alta sustentada, e picos isolados são ruído normal — p95 filtra o ruído enquanto peak preserva o valor diagnóstico de «ocorreu 100%?»; o dano da memória vem de nível alto, e encostar uma vez em 1,5 GB já traz risco de OOM, então peak é a estatística-chave, e dentro de 5 minutos p95 e peak são quase iguais.
- O limiar de 15 segundos do Bash é estratégia de amostragem e não julgamento de anomalia: comandos curtos não têm oportunidade de amostragem nem informação.
- Relação com [memory-diagnostics-log.md](./memory-diagnostics-log.md): o log local continua existindo, mas a fonte de amostragem de host e renderer é compartilhada com esta spec, a CLI já está na forma compartilhada, e a leitura de heap do main é mesclada no mesmo tique.
- Relação com [zcode-data-size-arms-telemetry.md](./zcode-data-size-arms-telemetry.md): o evento de volume do diretório de dados continua usando `resolveResourceUsageScene` para julgar background, e esta spec preserva a semântica dessa função.

## Registro de Decisões de Governança de Arquitetura

```text
owner:            main 进程资源遥测模块（角色窗口、系统窗口、Bash 即时事件的唯一聚合与 ARMS 出口）；
                  各进程的自采瞬时事实由各自 sampler 持有；MCP pid ↔ mcp_id 映射只由 CLI tracker 持有
command path:     main 10s tick（getAppMetrics + os）→ 有界窗口 → 5min flush → sendCustom
                  renderer / host / scheduler 60s 自采 → IPC / parentPort → main ingest
                  CLI 60s 自采、5min MCP、Bash 完成 → protocol 通知 → Host 转发 → main ingest
derived views:    perf_process_window / perf_system_window / perf_tool_exec_resource；本地 [memory] 日志
                  与 ARMS 样本来自同一次读数
ordering:         窗口按 main 的 flush 时钟切分；晚到的自采样本进入当前窗口；退出 flush 不触发新采样
idempotency:      样本无副作用，丢失即丢失；无 outbox、无重试、无持久化
delivery:         desktop-only；不进入 session/event、V4 conversation frame、task realtime bus、
                  snapshot、queue、continuous 或 replayable 恢复链路；手机 /remote 不参与
performance:      main 零外部进程；全链路禁止 PowerShell/WMI/CIM/wmic；白名单探针仅 CLI 内 macOS ps
                  与 Windows tasklist，1s 超时，3 次失败停用；每进程一个 unref 定时器
reuse decision:   复用 getAppMetrics、进程角色 pid 注册表（collectChromiumProcessRolePids）、内存诊断日志定时器、CLI sampler、
                  Host 转发模块、FinalArmsCustomEvent E2E 控制器、PERF-RES-01 门禁；
                  资源管理器的 Host 侧 ps 采样器不复用（按需 UI 采样，职责不同）
contracts/spec:   本文；shared 协议 schema 与 host 响应 schema；performance-telemetry-catalog.md 事件字典
```