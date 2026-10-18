# Observabilidade de ARMS dos Processos MCP

## Status

- Escopo: connection pool / transporte stdio de MCP dentro do Agent, notificações dinâmicas do ZCode Protocol, encaminhamento pelo Host e envio ao ARMS no main do Desktop.
- Camada de alteração: `commit-effect` (nova observação de runtime, de baixa frequência e em bypass).
- Não altera a conexão MCP, as chamadas de ferramenta, a reciclagem de sessão, nem a semântica de entrega desktop continuous ou mobile replayable.

## Objetivo

O ciclo de vida mantém três tipos de evento ARMS; os eventos de recursos estão descritos na seção de migração abaixo:

| Evento                       | Gatilho                                  | Pergunta que responde                        |
| -------------------------- | -------------------------------------- | ------------------------------------- |
| `perf_mcp_process_start`   | MCP stdio oficial conclui a conexão e o `tools/list` | quantas vezes cada MCP sobe com sucesso, o denominador da taxa de crash |
| `perf_mcp_process_crash`   | MCP stdio já conectado encerra de forma inesperada  | qual MCP crashou, com que características de saída e em que tempo de execução |
| `perf_mcp_session_startup` | o primeiro snapshot de startup de MCP da sessão é fechado | configuração, conexões, processos e falhas por sessão |

MCP via HTTP/SSE não tem subprocesso local do SO, portanto não emite start/crash de processo nem amostras de recursos, mas entra em
`perf_mcp_session_startup.configured_count/connected_count/failed_count`.

## Identificadores Seguros

- `mcp_source`: dividido em três categorias conforme o canal de distribuição em runtime: MCP declarados pelo MCP de host interno e pelo ZCode Official Marketplace (`zcode-plugins-official`, incluindo Builtin Plugin e CDN Plugin) são unificados como `builtin`; MCP declarados por Personal Source / Inline Plugin são `plugin`; configurações comuns de MCP de usuário, projeto etc. são `custom`. O namespace de runtime do Plugin só expressa o namespace de ferramentas e não permite, apenas por `plugin:<pluginName>:<serverName>`, inferir o canal de distribuição; o loader de Plugin deve anexar a provenance apenas em runtime depois da validação comum de configuração, e o schema de config pública não aceita esse campo.
- `mcp_id`: estável para o mesmo MCP dentro da instalação atual. O `node_repl` embutido usa o ID público `builtin:node_repl`; plugins do ZCode Official Marketplace usam a identidade pública de manifest `builtin:<pluginName>:<serverKey>`; plugins de Personal Source e MCP de configuração do usuário continuam usando `plugin:<digest>` / `custom:<digest>` com HMAC de salt do dispositivo. Cada segmento `:` do ID público mantém apenas `[A-Za-z0-9._~-]`, e os demais bytes UTF-8 usam codificação `%HH` maiúscula, portanto o resultado é legível, reversível e não envia caracteres de controle diretamente ao ARMS.
- `mcp_instance_id`: ID aleatório gerado a cada conexão stdio oficial bem-sucedida; um reconexão gera um novo ID.
- Exceto pela identidade `<pluginName>:<serverKey>` publicada pelo mercado oficial do ZCode, o ARMS proíbe o upload do server name original; command, args, cwd, identidade/path de workspace, env, header, stderr e PID são sempre proibidos no upload.
- O log estruturado local registra ao mesmo tempo `mcp_id`, `mcp_instance_id` e o server name / PID originais, para permitir a correlação.

## Contrato dos Eventos

### `perf_mcp_process_start`

- `group=stability`, `value=1`.
- Campos: `mcp_id`, `mcp_instance_id`, `mcp_source`, `mcp_isolation`, `runtime_surface`, `platform`, `arch`.
- Emitido uma única vez, só depois que o transporte final da sessão conecta com sucesso e conclui o `tools/list`. O probe de negociação de versão não emite.

### `perf_mcp_process_crash`

- `group=stability`, `value=1`.
- Campos: reutiliza os identificadores de start e acrescenta `exit_code`, `signal`, `uptime_ms`, `affected_session_count`.
- Emitido uma única vez apenas para instâncias stdio que já emitiram start. Disconnect ativo, encerramento de sessão, reciclagem por idle e quit/update do app não são crash.
- Taxa de crash de processo MCP:

  ```text
  distinct crash.mcp_instance_id / distinct start.mcp_instance_id
  ```

### `perf_mcp_session_startup`

- `group=stability`, `value=process_count`.
- No máximo uma vez por lease de sessão com `session_id`.
- Campos: `session_id`, `configured_count`, `connected_count`, `process_count`, `failed_count`, `runtime_surface`. `failed_count` representa a quantidade que não conectou com sucesso no primeiro snapshot, incluindo estados não connected como `failed` / `connecting` / `untrusted`, portanto sempre vale `configured_count = connected_count + failed_count`.
- `process_count` é o número de conexões stdio connected que a sessão detinha naquele momento. MCP compartilhado por workspace conta 1 em cada sessão que o usa, sem tentar atribuir o processo compartilhado à primeira sessão.

### Migração dos Eventos de Recursos (08)

As amostras de CPU / memória de MCP e `perf_process_window` (`process_role=mcp`) estão unificadas em
[Monitoramento de CPU / memória de todos os processos](./process-resource-telemetry.md); os eventos antigos não são mais enviados desde a v3.12.1.
A definição órfã abaixo permanece apenas como fato interno do tracker, sem adicionar atributos de recurso ao ARMS; a notificação `memory` do CLI antigo é descartada no main.

## Definição de Órfão Suspeito

```text
pool owner count == 0
AND 连续无 owner 时长 > 60 秒
AND OS 资源采样仍能观察到该进程
=> orphan_suspected = true
```

- O limiar é estritamente “mais de 60 segundos”; exatamente 60 segundos ainda resulta em false.
- A janela de tolerância de idle de 30 segundos já existente no pool é uma janela normal de reciclagem e não é marcada.
- Um lease que não é de sessão, como `protocol-settings`, continua sendo owner e não pode ser julgado órfão só por `owner_session_count=0`.
- A primeira versão só consegue detectar órfãos suspeitos ainda sob controle de um CLI tracker vivo. Órfãos de SO totalmente fora do tracker após um crash do próprio CLI exigem varredura de sistema pelo Desktop/Host e não fazem parte deste escopo.

## Fluxo de Dados e Fronteiras Multicliente

```text
MCP adapter / pool
  -> process-scoped McpTelemetryTracker
  -> process/mcpTelemetry strict notification
  -> ZCodeAgentService dynamic event
  -> trusted Desktop Host relay
  -> Host parentPort strict response
  -> Desktop main ARMS sendCustom

mobile / renderer conversation attachment ---------------- X
task snapshot / queue / replay / owner command ------------ X
```

- O CLI local/remote amostra dentro da máquina que realmente executa; o main do Desktop só faz o envio final ao ARMS.
- O `/remote` no celular reaproveita o Host/CLI já existente e não assina, nem faz cache, nem reproduz telemetria de MCP.
- Qualquer falha de amostragem, schema, RPC, parentPort ou `sendCustom` descarta apenas o evento atual e não bloqueia o ciclo de vida de MCP/sessão/Agent.

## Feature Impact Brief

### Feature Summary

| Field            | Value                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------- |
| Developer intent | reportar subida de processo MCP, crash e contagem por sessão; o contrato de recursos é mantido pela spec de todos os processos |
| Capability       | `capability.data-observability` + runtime MCP                                         |
| Change layer     | `commit-effect`                                                                       |
| Operating mode   | implemented                                                                           |
| Primary seeds    | adapter/pool de MCP, notificação de Protocol, Agent service, parentPort do Host, ARMS do Desktop |
| Out of scope     | UI, semântica de conexão MCP, chamadas de ferramenta, persistência, varredura global de órfãos reais do SO |

### UI Surface Matrix

| User scenario   | UI entry | Shared implementation       | Display/draft owner | Default/inherit source | Validation/gating | Commit action     | Authority/persistence             | Mode boundary                       | Must remain isolated from              |
| --------------- | -------- | --------------------------- | ------------------- | ---------------------- | ----------------- | ----------------- | --------------------------------- | ----------------------------------- | -------------------------------------- |
| Observabilidade de MCP em produção | none     | CLI tracker -> Host -> main | none                | constantes de 5min / 60s | schemas estritos   | `sendCustom` do ARMS | processo/pool vivo; sem persistência | local/remote; apenas quem reporta é o Desktop | UI, stream de conversa, replay mobile |

### Feature Relationships

| Rank           | From                | Semantic edge                  | To                    | Condition      | Why inspect it               | Evidence                       |
| -------------- | ------------------- | ------------------------------ | --------------------- | -------------- | ---------------------------- | ------------------------------ |
| must-inspect   | adapter MCP         | emite fatos de ciclo de vida/recursos | process tracker       | stdio          | autoridade de PID/exit/memória | código do adapter                   |
| must-inspect   | pool MCP            | emite contagens de ownership/sessão | process tracker       | todos os leases     | autoridade de sharing/órfão     | código do pool                      |
| must-inspect   | notificação do CLI    | encaminha fatos estritos       | main do Desktop          | local/remote   | fronteira de propriedade do ARMS  | padrão de telemetria de recursos do CLI |
| invariant-only | telemetria de MCP   | deve permanecer separada de   | entrega de conversa    | desktop/mobile | sem poluição de replay/snapshot | documentos de arquitetura              |
| evidence-only  | testes de MCP/telemetria | cobre                    | contrato dos eventos   | todos            | prova de comportamento            | testes unitários/integrados focados |

### State Owners And Commit Sinks

| State/fact           | Draft/display owner | Authoritative owner       | Commit command/service | Persistence/cache   | Evidence          |
| -------------------- | ------------------- | ------------------------- | ---------------------- | ------------------- | ----------------- |
| instância de processo MCP | none                | transporte stdio + tracker | evento de ciclo de vida        | apenas memória do processo | adapter           |
| owners de sessão       | none                | refs do connection pool      | atualização de owner do tracker   | apenas memória do processo | pool              |
| payload do ARMS         | none                | reporter do main do Desktop     | `sendCustom`           | backend do ARMS        | telemetria do Desktop |

### Must-Preserve Invariants

1. Falhas de amostragem e de envio não afetam MCP/sessão/Agent.
2. Reciclagem ativa não conta como crash; probe não conta como start/crash.
3. Não enviar nome original do MCP, comando, caminho, credenciais, stderr ou PID.
4. Processos compartilhados por workspace são contados por lease de owner, sem forjar um único owner de sessão.
5. O main/relay do Desktop não mantém estado de negócio de MCP; o mobile não reporta de novo.
6. MCP de Builtin/CDN Plugin do ZCode Official Marketplace e o `node_repl` do host são agregados como `mcp_source=builtin`; MCP de Personal Source / Inline Plugin continuam agregados como `plugin`, e o mesmo namespace de runtime `plugin:` não pode misturar os dois canais.

### Codegraph Evidence

O ambiente atual não tem codegraph tool, então o rastreamento foi feito por texto exato de símbolo até a profundidade 2:

| Seed                                  | Direct callers / key path                        | Depth | Interpretation            |
| ------------------------------------- | ------------------------------------------------ | ----- | ------------------------- |
| `createMcpAdapterConnectionPool`      | entrypoint de protocolo -> lease de sessão             | 2     | owner do process tracker     |
| `NodeMcpAdapter.openServerConnection` | adapter do pool -> transporte stdio                  | 2     | autoridade de start/crash/PID |
| `createZCodeProcessResourceSampler`   | notificação de protocolo -> service -> Host -> main | 2     | padrão de encaminhamento        |

### Graph Drift / Delta

- O `capability.data-observability` do feature graph já registra esta spec e os dois code seeds `createMcpTelemetryTracker` e `reportMcpTelemetryToArms`; ver `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml`.
- Atualmente se mantêm três eventos de ciclo de vida; as amostras de CPU / memória e os atributos de recursos seguem a spec de todos os processos. Órfãos suspeitos acima de 60 segundos permanecem apenas como fato interno do tracker.

## Case Planning

### Clarification Log

| Round | User answer                         | Boundary fixed                               |
| ----- | ----------------------------------- | -------------------------------------------- |
| 2     | é preciso localizar o MCP específico | ID público + ID anônimo estável do dispositivo + ID aleatório de instância |
| 3     | adicionar julgamento de órfão, de forma conservadora acima de 60 segundos | `unowned_ms > 60_000` e o SO ainda vivo |
| 4     | todo MCP do mercado oficial do ZCode é de fonte interna | Builtin/CDN Plugin são ambos `mcp_source=builtin` |
| 5     | MCP de fonte interna não é anônimo | Plugin oficial usa o `mcp_id` canônico público |

### Boundary Decisions

| Boundary          | Decision                                  | Includes                            | Excludes / prunes                    | Source      |
| ----------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------ | ----------- |
| denominador de crash | instância stdio conectada com sucesso       | start + fechamento inesperado            | probe/falha de conexão/fechamento esperado | user + code |
| contagem de sessão     | um primeiro snapshot por lease de sessão      | configured/connected/process/failed | fan-out de evento por server             | user        |
| órfão            | sem owner no pool por mais de 60s e ainda observado | apenas órfão suspeito no tracker       | varredura de SO após morte do CLI                   | user        |

### Accepted Cases

| Case ID      | Setup                                                    | Action                   | Assertions                                                                      | Evidence layers         | E2E status          |
| ------------ | -------------------------------------------------------- | ------------------------ | ------------------------------------------------------------------------------- | ----------------------- | ------------------- |
| MCP-ARMS-001 | transporte stdio final conectado                          | startup conclui        | um start com ID seguro/legível ou anônimo; probe ausente                      | adapter + tracker       | focused integration |
| MCP-ARMS-002 | instância stdio conectada                                 | saída inesperada          | um crash com o mesmo instance ID/code/signal/uptime                              | adapter + tracker       | focused integration |
| MCP-ARMS-003 | instância stdio conectada                                 | fechamento deliberado         | nenhum crash                                                                        | adapter                 | unit                |
| MCP-ARMS-004 | sessão tem stdio + HTTP + server com falha                 | primeiro snapshot           | contagens configured/connected/process/failed uma única vez                                 | pool                    | unit                |
| MCP-ARMS-005 | conexão stdio compartilhada, duas sessões                    | adquirir/liberar leases   | process_count=1 em cada sessão; contagem de owner 2 -> 1                                | pool + tracker          | unit                |
| MCP-ARMS-006 | processo rastreado sem owners                            | amostragem em 60s / 60s+1ms  | false em 60s, true após 60s                                                    | tracker                 | unit                |
| MCP-ARMS-007 | notificação válida/inválida e mensagem do Host              | encaminhar                  | validação estrita, apenas local/remote, mobile excluído                           | shared/service/Host     | unit                |
| MCP-ARMS-008 | main recebe cada tipo de evento                            | reportar                   | os três nomes exatos de ARMS de ciclo de vida; memória legada ignorada                         | reporter do Desktop        | unit                |
| MCP-ARMS-009 | Mercado oficial do ZCode e Personal Source Plugin declaram cada um um MCP stdio | descobrir + process start | Plugin oficial com source=builtin e ID legível; Personal Source com source=plugin e ID anônimo | loader + pool + tracker | unit                |

O estado de produto de GUI/conversa não muda e nenhuma combinação nova é adicionada ao catálogo de cases de conversa / matriz E2E.
