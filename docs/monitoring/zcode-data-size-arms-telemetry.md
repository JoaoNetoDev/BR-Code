# Relatório de ARMS do tamanho do diretório de dados do ZCode

## Conclusão

Em cada dispositivo Desktop, no máximo uma vez a cada 24 horas, coleta-se e reporta-se os bytes
lógicos da raiz de dados local do ZCode obtida por `getZCodeDataRootDir()`. A coleta prioriza uma
janela de baixa interferência — sistema ocioso, ZCode sem tarefas em execução e janela em segundo
plano; a varredura real do diretório é executada em uma thread Worker, e o main do Electron apenas agenda e executa o `sendCustom` final para o ARMS.

O antigo `perf_resource_disk_space` media o `userData` do Electron e o diretório de instalação, o que
não equivale ao diretório de dados do ZCode do usuário. Esta funcionalidade usa o evento independente
`perf_resource_zcode_data_size`, evitando misturar as métricas antiga e nova; a nova versão não envia
mais o evento antigo a partir da janela genérica de recursos.

```text
app/ARMS ready
      |
      v
read persisted state ---- failed ----> fail closed, retry state read after 6h
      |
      +-- missing -------------------> first startup schedule
      |
      +-- recent success/reservation -> wait until 24h due time + device jitter
      |
     due / no history
      v
wait 2..10min startup jitter / poll every 5min
      |
      +-- system idle >= 5min
      +-- no Agent task running
      +-- app is background
      |
      v
Worker scans getZCodeDataRootDir()
      |
      +-- activity resumes before 6h fallback --> abort, retry after 30min
      +-- scan failure ------------------------> retry after 6h
      +-- complete / partial -----------------> persist report reservation
                                                   |
                                                   +-- persist failure --> do not send
                                                   |
                                                   v
                                             main sendCustom
                                                   |
                                                   v
                                         confirm lastReportedAt
```

Após esperar 6 horas pela janela de baixa interferência, apenas os requisitos de ociosidade de
entrada do sistema e de janela em segundo plano são flexibilizados; a concorrência com tarefas em
execução do ZCode continua proibida. Isso evita que dispositivos sempre ativos fiquem
permanentemente sem amostras, sem disputar disco com geração de modelos, comandos e automação.

## Contrato de métrica

Evento: `perf_resource_zcode_data_size`, `group=resource`.

| Campo                 | Definição                                                 |
| --------------------- | --------------------------------------------------------- |
| `value`               | `zcode_data_bytes` contado nesta execução                  |
| `metric_kind`         | fixo `zcode_data_bytes`                                   |
| `zcode_data_bytes`    | soma de `stat.size` dos arquivos regulares                 |
| `scan_status`         | `complete` / `partial`                                    |
| `partial_reason`      | `time_limit` / `file_limit` / `io_error`; não enviado quando completo |
| `scan_duration_ms`    | tempo de parede da varredura no Worker                    |
| `files_scanned`       | número de arquivos regulares contados                     |
| `directories_scanned` | número de diretórios abertos com sucesso                  |
| `scan_error_count`    | quantidade de erros de IO locais: sem permissão, arquivo desaparecido etc. |
| `data_root_kind`      | `default` / `custom`                                      |
| `schema_version`      | fixo `1`                                                  |

As dimensões comuns continuam sendo escritas pelo main do Desktop: `device_mid`, `platform`,
`app_version`, `arms_env`, `event_name` e `metric_value`. É proibido reportar o caminho absoluto da
raiz de dados, nomes de arquivos/diretórios, nome de usuário, caminho de projeto,
workspace/session/task id, alvos remotos ou credenciais.

`zcode_data_bytes` é o tamanho lógico de arquivo consistente entre plataformas, não blocos de
alocação do sistema de arquivos. Links simbólicos não são seguidos, evitando ciclos e saída da raiz
de dados. Diretórios ainda podem mudar durante a varredura, portanto o resultado é um snapshot
aproximado de baixa frequência, sem promessa de consistência transacional do sistema de arquivos.

## Agendamento e estado

- Antes do envio, `reportReservedAt` é escrito atomicamente como reserva de limitação; se a escrita da
  reserva falhar, nada é enviado. Após o envio bem-sucedido, a reserva é removida e o
  `lastReportedAt` real é escrito; em caso de falha de envio, o estado original é restaurado e a
  tentativa é repetida 6 horas depois. Se o processo encerrar entre a reserva e o envio, o startup o
  trata conservadoramente como já enviado, preferindo perder uma amostra a reportar em duplicidade.
- Somente quando o arquivo de estado explicitamente não existe ele é considerado sem histórico. Falhas
  na leitura, no parse ou na validação de formato do estado devem resultar em fail-closed: não iniciar
  varredura nem reporte, e reler o estado 6 horas depois; não se entra no agendamento de primeiro
  startup antes de uma retentativa bem-sucedida. A retentativa de leitura de estado reutiliza o timer
  único do scheduler, sem acumular timers duplicados.
- Sem histórico, após o ARMS ready o relatório é atrasado de 2 a 10 minutos por um hash estável do
  dispositivo.
- Com histórico, o ponto de vencimento de 24 horas recebe um jitter estável de 0 a 60 minutos
  calculado por `device_mid + due bucket`; na recuperação por startup é obrigatório calcular primeiro o
  vencimento efetivo já com o jitter, sem trocar para o startup jitter após o vencimento base de 24
  horas. Os dispositivos não podem ficar fixos no mesmo horário.
- Quando vencido, mas sem satisfazer as condições de baixa interferência, a verificação ocorre a cada
  5 minutos.
- Após 6 horas de espera por baixa interferência, a coleta só exige que o ZCode não tenha tarefas em
  execução.
- Se as condições de baixa interferência deixarem de valer durante a varredura, o Worker é
  encerrado e a tentativa é repetida 30 minutos depois; a varredura de fallback de 6 horas só é
  encerrada quando uma nova tarefa do ZCode se inicia. Após o Worker retornar e após a escrita da
  reserva, a elegibilidade deve ser reconferida sincronamente antes do envio, fechando a janela de
  corrida entre os polls de atividade.
- Falhas de varredura ou do Worker não enviam valor 0, não atualizam o estado de sucesso e são
  repetidas 6 horas depois.
- Tanto `complete` quanto `partial` são amostras entregues com sucesso e atualizam `lastReportedAt`;
  a contagem exata do dashboard deve filtrar `scan_status=complete`, sendo `partial` apenas um limite
  inferior.
- Na saída do App, os timers são limpos e o Worker é encerrado, sem aguardar a conclusão da varredura.

O estado do agendamento é persistido em um arquivo de estado dedicado sob o `userData` do Electron,
sem reutilizar `~/.zcode/v2/telemetry-state.json`, para evitar disputa com o lock de processo e a
semântica de escrita do telemetry state de `/report`, e também para evitar que a mudança do arquivo de
estado altere o tamanho do diretório medido.

## Proteções da varredura

Valores padrão de proteção:

- Tempo máximo de parede: 30 segundos;
- Número máximo de arquivos regulares: 200.000;
- Um único Worker;
- Não seguir links simbólicos;
- Erros locais de IO continuam a varredura e marcam o resultado como `partial/io_error`;
- Ao atingir o limite de tempo ou de arquivos, encerrar imediatamente e marcar como `partial`.

A antiga varredura síncrona contava no máximo 50.000 arquivos regulares sem expor que o resultado era
incompleto. Esta implementação remove essa travessia síncrona do main process; o limite passa a ser
apenas proteção de recurso do Worker e não pode se passar por valor completo.

## Feature Impact Brief

| Campo            | Valor                                                                    |
| ---------------- | ------------------------------------------------------------------------ |
| Developer intent | relatório de baixa interferência e baixa frequência do tamanho do diretório de dados local do ZCode |
| Capability       | `capability.zcode-data-size-telemetry` / `capability.data-observability` |
| Change layer     | `commit-effect` + `persistence`                                          |
| Operating mode   | planning                                                                 |
| Primary seeds    | `getZCodeDataRootDir`, Worker de varredura de diretório, scheduler de ociosidade, reporter ARMS |
| Out of scope     | UI, `~/.zcode` de máquina remota, espaço em disco restante, limpeza de diretórios, conversation delivery |

### UI Surface Matrix

| Cenário do usuário           | Entrada de UI | Implementação compartilhada        | Dono de display/draft | Fonte de default/herança | Validação/gating            | Ação de commit   | Autoridade/persistência                | Limite de modo        | Deve permanecer isolado de                    |
| ---------------------------- | ------------- | ---------------------------------- | --------------------- | ------------------------ | ---------------------------- | ---------------- | ---------------------------------------- | --------------------- | --------------------------------------------- |
| Telemetria de uso do disco de dados local do Desktop | none | Desktop main scheduler + Worker | none | `getZCodeDataRootDir()` | limites de due/idle/task/scan | ARMS `sendCustom` | snapshot do Worker + estado local do scheduler | somente app-global do desktop | renderer, host remoto, replay mobile, task stream |

### Shared And Divergent Behavior

| Concern   | Compartilhado entre superfícies | Deliberadamente diferente                 | Por que importa nesta mudança        |
| --------- | ------------------------------- | ------------------------------------------ | ------------------------------------- |
| Data root | fonte de verdade de caminho em services | root default/custom só altera `data_root_kind` | não tratar userData do Electron como raiz de dados de negócio |
| Timing    | um scheduler app-global          | cada dispositivo tem jitter estável        | evitar picos concentrados de IO e reporte |
| Runtime   | main agenda e reporta            | Worker possui a travessia                 | evitar bloquear o main do Electron     |
| Delivery  | canal de recursos ARMS existente | remoto/mobile não recebe nada            | não poluir estado continuous/replayable |

### Feature Relationships

| Rank           | From                    | Borda semântica              | To                         | Condição                   | Por que inspecionar          | Evidência      |
| -------------- | ----------------------- | ---------------------------- | -------------------------- | --------------------------- | ---------------------------- | --------------- |
| must-inspect   | scheduler               | resolves-root-through        | `getZCodeDataRootDir`      | após bootstrap de dataBaseDir | diretório de dados customizado precisa valer | code/spec |
| must-inspect   | Worker                  | returns-bounded-snapshot-to  | Desktop main               | due e elegível             | main não percorre diretórios  | code/test       |
| must-inspect   | Desktop main            | reports-through              | ARMS RUM                   | resultado complete/partial | dono único de credenciais e dimensão de dispositivo | code/test |
| should-inspect | Host runtime task count | gates                        | scheduler                  | Agent em execução          | não disputar disco com tarefas do usuário | code/test |
| invariant-only | data-size event         | must-remain-isolated-from    | conversation/task realtime| todos os modos              | não entra em continuous/replayable | architecture/spec |
| invariant-only | local data root         | must-not-inspect             | remote `~/.zcode`          | SSH/WSL/Docker/server      | não tocar arquivos remotos do usuário | spec |

### State Owners And Commit Sinks

| Estado/fato     | Dono de draft/display | Owner autoritativo         | Comando/serviço de commit | Persistência/cache             | Evidência |
| --------------- | --------------------- | -------------------------- | ------------------------- | ------------------------------ | --------- |
| data root       | none                  | configuração de paths de services | `getZCodeDataRootDir` | setting/dataBaseDir            | code      |
| due time        | none                  | scheduler do Desktop        | decisão de timer          | arquivo de estado dedicado em userData | spec/test |
| idle eligibility| none                  | observações do Electron main| decisão do scheduler      | none                           | code/test |
| scan result     | none                  | Worker one-shot             | mensagem do worker        | none                           | code/test |
| final event     | none                  | Desktop main                | `armsRum.sendCustom`      | ARMS                           | code/test |

### Must-Preserve Invariants

| Invariante                                    | Superfícies/modos        | Prova necessária            | Evidência        |
| --------------------------------------------- | ------------------------ | --------------------------- | ---------------- |
| nenhuma travessia síncrona de diretório no main | desktop todas plataformas| scanner roda no Worker      | unit/build       |
| nenhum caminho/nome de usuário no payload     | raiz default/custom      | teste de payload exato      | unit             |
| no máximo um reporte bem-sucedido por 24h     | restart/app de longa duração | teste de scheduler persistido | unit         |
| tarefa ZCode em execução sempre bloqueia varredura | janela normal/fallback | teste de máquina de estados | unit             |
| partial é distinguível de complete           | casos de limite/erro     | teste de scanner + payload   | unit             |
| entrega remote/mobile inalterada             | local/remote/mobile      | sem edições de protocolo/schema | static invariant |

### Codegraph Evidence

O ambiente atual não fornece a ferramenta codegraph; foi substituída por varredura de chamadores com
chamadas `rg` ao vivo:

| Seed                                | Query         | Chamadores diretos / caminho-chave                      | Profundidade | Interpretação                  |
| ----------------------------------- | ------------- | ------------------------------------------------------- | ----------- | ------------------------------ |
| `configureDesktopResourceTelemetry` | callers       | bootstrap ARMS-ready do Desktop main                    | 1           | owner atual do resource reporter |
| `hostRunningTaskCountMap`           | callers       | reporter de tarefas do Host → map do main → contagem do ciclo de vida do app | 2 | fato de tarefa em execução reutilizável, sem nova fila |
| `getZCodeDataRootDir`               | callers       | fonte de paths de services + escritores de dados locais  | 1           | caminho autoritativo do diretório medido |
| `perf_resource_disk_space`          | text callers  | flush de resource + docs/testes de monitoring            | 2           | escopo de desativação da métrica antiga incorreta |

### Graph Drift Candidates And Delta

- O grafo atual só tem o `capability.data-observability` genérico, faltando o tamanho do diretório de
  dados local, o owner Worker, o agendamento de baixa interferência e a relação de isolamento
  remote/mobile.
- Esta implementação adiciona o nó `capability.zcode-data-size-telemetry`, seeds de spec/code e os
  invariantes acima.

### Unresolved Questions

Nenhuma. A definição do diretório, os bytes lógicos, o ciclo de 24 horas, o jitter por dispositivo, o
gating por ociosidade, o fallback de 6 horas, os limites de varredura, a semântica de partial, os
campos de privacidade e o limite local-only foram todos confirmados pelo usuário.

## Case Planning

### Boundary Decisions

| Boundary | Decisão                                  | Inclui                        | Exclui / poda                            | Fonte            |
| -------- | ---------------------------------------- | ----------------------------- | ----------------------------------------- | ---------------- |
| data root| `getZCodeDataRootDir()`                  | raiz local default/custom     | Electron userData, raiz remota            | user + code      |
| schedule | 24h + device jitter                      | app no startup e de longa duração | lote em horário fixo de wall-clock  | user             |
| idle     | 5min OS idle + app background + no task  | fallback de 6h                | sondagens externas de sistema             | user + architecture |
| scan     | Worker, cap de 30s/200k                 | bytes lógicos de arquivo regular | alvos de symlink/blocos de alocação | user     |
| payload  | um tamanho primário + metadados de qualidade | complete/partial            | path/name/task/workspace                  | user + privacy   |

### Dimensions And Pruning

| Dimensão         | Valores / classes de equivalência                | Incluir?             | Razão                                  |
| ---------------- | ----------------------------------------------- | -------------------- | -------------------------------------- |
| root             | missing/default/custom/arquivos aninhados       | yes                  | fonte de caminho e comportamento da varredura |
| due              | fresh/due/overdue >6h                            | yes                  | timing e fallback                      |
| activity         | idle/background, active/foreground, tarefa em execução | yes           | guardas de elegibilidade diferem      |
| result           | complete/time limit/file limit/io error/failure | yes                  | payload e semântica de retry diferem  |
| platform         | macOS/Windows/Linux                             | representative + static | Worker usa Node fs; sem comando de shell |
| client/delivery  | desktop continuous/mobile replayable            | podado por invariante | o evento nunca entra no pipeline de entrega |
| remote kind      | local/SSH/WSL/Docker                            | podado por invariante | apenas raiz de dados app-global local  |

### Accepted Cases

| Case ID       | Setup                                     | Ação             | Asserções                                          | Camadas de evidência | E2E status   |
| ------------- | ----------------------------------------- | ---------------- | -------------------------------------------------- | -------------------- | ------------ |
| DATA-SIZE-001 | arquivos regulares aninhados              | scan             | contagem exata de bytes/arquivos/diretórios, complete | filesystem + unit    | not-needed   |
| DATA-SIZE-002 | mais arquivos que o limite                | scan             | partial/file_limit, valor é limite inferior          | filesystem + unit    | not-needed   |
| DATA-SIZE-003 | orçamento de tempo zero                    | scan             | partial/time_limit                                  | filesystem + unit    | not-needed   |
| DATA-SIZE-004 | due + idle + background + sem tarefa      | scheduler check  | um scan/reporte, sucesso persistido                 | state machine + unit | not-needed   |
| DATA-SIZE-005 | due + usuário ativo antes de 6h            | scheduler check  | sem scan, retry em 5min                             | state machine + unit | not-needed   |
| DATA-SIZE-006 | overdue wait >=6h + sem tarefa            | scheduler check  | fallback scan apesar de atividade em foreground    | state machine + unit | not-needed   |
| DATA-SIZE-007 | qualquer estado due + tarefa em execução  | scheduler check  | sem scan                                            | state machine + unit | not-needed   |
| DATA-SIZE-008 | resultado partial                         | build/send event | bytes primários + campos de qualidade, sem path    | payload + unit       | not-needed   |
| DATA-SIZE-009 | sucesso persistido recente                | restart scheduler| sem reporte antes de 24h+jitter                     | persistence + unit   | not-needed   |
| DATA-SIZE-010 | falha na escrita da reserva de reporte    | due collection   | scan pode terminar, mas nenhum evento é enviado      | state machine + unit | not-needed   |
| DATA-SIZE-011 | tarefa inicia antes do envio final        | finish scan      | aborta sem reportar                                 | state machine + unit | not-needed   |
| DATA-SIZE-012 | restart dentro do jitter diário           | restore scheduler| espera até o due time efetivo                       | persistence + unit   | not-needed   |
| DATA-SIZE-013 | leitura/parse do estado persistido falha  | start scheduler  | sem scan/reporte; relê o estado após 6h             | persistence + unit   | not-needed   |

### Planning Handoff

| Item            | Destino                         | Status      |
| --------------- | ------------------------------- | ----------- |
| Spec update     | este arquivo + docs de performance | complete |
| Case catalog    | Accepted Cases acima            | complete   |
| Coverage matrix | non-UI/non-conversation         | not-needed |
| Decision backlog| nenhum                          | complete   |
| E2E handoff     | comportamento local e delimitado do Worker | not-needed |