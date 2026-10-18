# Telemetria ARMS da primeira abertura de Session

## Objetivo

Registrar os principais tempos gastos entre o Renderer de desktop adquirir um pane de uma session
existente e o primeiro snapshot autoritativo concluir a renderização e já permitir entrada,
separando as etapas de Renderer, Window Host, runtime do CLI e restauração de session histórica. A
implementação atual usa a aquisição do pane como ponto inicial observável do Renderer; o evento de
mouse original do usuário ainda não entra nesta cadeia unificada.

Esta solução adiciona apenas dois Custom Events do ARMS:

- `perf_ui_session_open_start`: reportado uma vez no início lógico da abertura, servindo como denominador para amostras sem result (crash, desconexão de protocolo, travamento permanente).
- `perf_ui_session_open_result`: reportado uma vez ao encerrar com sucesso, falha ou timeout, com `value` igual a `total_ms`.

Não é enviado um evento ARMS separado por etapa. A duração de cada etapa é calculada localmente em
cada processo com monotonic clock, e o timing de CLI/Host é carregado pelo ACK de
`v4/conversation/subscribe`; o Renderer consolida tudo no evento de result.

## Limite de produto

- Apenas a instalação Desktop `desktop-continuous` instala o reporter ARMS real; Web/mobile `web-remote-replayable` não enviam ARMS.
- Só se mede o processo de um usuário navegar para, restaurar ou abrir em tela dividida uma session que já existe. A criação de session a partir de um rascunho vazio na primeira exibição, a promoção de uma session pré-aquecida a partir de rascunho e a recuperação bem-sucedida de um `createSession` pendente pertencem a "Nova Task" e não devem enviar `perf_ui_session_open_start/result`. Uma Nova Task só entra nesta métrica quando, após sair do pane atual, for aberta explicitamente de novo como session existente.
- Mede-se apenas uma abertura lógica do usuário; retry de subscribe, recuperação de mesma sub ou quadros repetidos antes e depois do ACK não contam como nova abertura.
- `open_kind` distingue `cold`, `warm` e `keep_warm`: somente a abertura `cold`, que cria um novo projection store e inicia este subscribe, carrega o timing de etapa de primeiro quadro de Host/CLI/Renderer; `warm` e `keep_warm`, ao reutilizar um projection store existente, continuam registrando o `total_ms` e o timing de paint desta vez, mas não podem reutilizar a duração de etapa do subscribe anterior.
- Conteúdo de session, workspace path/identity, prompt, entrada e saída de ferramentas, nome de MCP server e corpo de Skill não podem entrar no ARMS.
- A inicialização de `MCP` é trabalho paralelo do runtime e seu tempo de conexão não é somado ao total de primeira renderização da session; a espera pela primeira requisição ao modelo para MCP já tem uma observação de requisição de modelo existente.
- `content_settled` (busca de histórico, diretório de planos, recursos lazy-load concluídos) não é o fim desta métrica; o fim é o store atual já ter entrado em `live`, o primeiro snapshot da session de destino já ter sido pintado e o Composer já ser interativo. Um snapshot residual durante reconexão não pode encerrar sozinho esta abertura.

## Limite temporal

```text
R0 pane acquire
  -> R1 acquire / subscribe 发起
  -> Host prepare
  -> CLI process bootstrap（仅新进程）
  -> CLI session restore / context / history / V4 projection
  -> initial frame ready / transport
  -> Renderer snapshot apply
  -> React commit
  -> paint + main-thread yield
R8 interactive_ready
```

`total_ms = R8 - R0`. Entre processos não se subtraem diretamente tempos absolutos de processos
diferentes; Host e CLI calculam cada um a própria duration e o Renderer calcula o tempo perceptível desde a
aquisição do pane.

## Eventos ARMS

### `perf_ui_session_open_start`

`group=ui_perf`, `value=1`. Properties:

| Campo             | Valor                                                  |
| ----------------- | ------------------------------------------------------ |
| `session_open_id` | ID de correlação opaco desta abertura lógica            |
| `session_id`      | ID da session atual, seguindo a estratégia de correlação talk/session existente |
| `open_trigger`    | buckets de baixa cardinalidade como sidebar/search/deeplink/reload |
| `open_kind`       | `cold` / `warm` / `keep_warm`                         |
| `client_mode`     | `desktop-continuous`                                  |

### `perf_ui_session_open_result`

`group=ui_perf`, `value=total_ms`. Além dos campos do evento de start, as properties permitem:

| Campo                                                | Significado                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `status`                                            | `success` / `failed` / `timeout`                                                          |
| `error_phase` / `error_code`                        | etapa da falha e reason code estruturado                                                  |
| `total_ms`                                          | pane acquire → interactive_ready                                                           |
| `renderer_prepare_ms`                               | click → início do subscribe                                                                |
| `host_prepare_ms`                                   | Host recebe a requisição → requisição de subscribe do CLI é enviada                        |
| `provider_registry_sync_ms`                         | nome de campo histórico; hoje registra o tempo que o Host espera a prontidão do Environment Provider Registry desta instância, e não representa sincronização entre Environments |
| `task_meta_read_ms`                                 | tempo que o Host leva para ler os metadados de session/task                                |
| `cli_request_ms`                                    | Host inicia a requisição de subscribe do CLI → recebe o ACK do CLI                          |
| `cli_bootstrap_ms`                                  | início de um novo processo do CLI → Protocol ready; processo reutilizado fica vazio         |
| `cli_session_restore_ms`                            | CLI recebe conversation subscribe → initial projection ready                               |
| `initial_frame_encode_ms`                           | CLI constrói a wire projection do primeiro quadro → codificação física do wire concluída   |
| `initial_frame_transport_ms`                        | initial frame ready → Renderer recebe por completo                                        |
| `renderer_snapshot_apply_ms`                        | quadro recebido → apply do ProjectionStore concluído                                      |
| `react_render_ms`                                   | snapshot apply → React commit                                                               |
| `paint_to_interactive_ms`                           | React commit → yield da main thread após o paint                                          |
| `cli_process_state`                                 | `spawned` / `reused`                                                                       |
| `session_runtime_state`                             | `cold` / `warm`                                                                            |
| `attempt_count`                                     | número de subscribe/retry                                                                   |
| `persisted_message_count`                           | quantidade de mensagens do histórico, apenas o número sem o corpo                          |
| `snapshot_row_count`                                | quantidade de projection rows na primeira renderização                                   |
| `snapshot_bytes`                                    | tamanho do primeiro quadro                                                                 |
| `plugin_count` / `skill_count` / `mcp_server_count` | contagens de baixa cardinalidade                                                          |

Essas etapas têm relações de paralelismo e não se exige que a simples soma das etapas nas
properties seja igual a `total_ms`; o dashboard usa `total_ms` como principal métrica e os campos de
etapa para atribuição.

## Timing interno de CLI/Host

`openTiming` só pode aparecer no ACK de `v4/conversation/subscribe` e não entra em sessions-index,
workspace-config, resync nem conversation snapshot:

- Host: `hostPrepareMs`, `providerRegistrySyncMs`, `taskMetaReadMs`, `cliRequestMs`; hoje todos esses timings são mapeados para os campos snake_case do ARMS result final.
- CLI: `cliBootstrapMs` (novo processo), `cliSessionRestoreMs`, `initialFrameEncodeMs`; hoje todos esses timings são mapeados para os campos snake_case do ARMS result final.
- Renderer: `rendererPrepareMs`, `initialFrameTransportMs` e `rendererSnapshotApplyMs` são calculados pelo monotonic clock local do Renderer, `reactRenderMs` usa o tempo de snapshot apply até o React commit e então é mapeado para o ARMS result.
- O CLI também devolve `sessionRuntimeState` e `snapshotRowCount`; o `cliProcessState` é preenchido pelo Host conforme o runtime ter sido reutilizado ou não.
- Etapas mais detalhadas de `plugin/skill/memory/history` não são enviadas uma a uma ao ARMS; se alguma etapa central apresentar anomalia em produção, o diagnóstico de segunda camada é feito pelo debug/trace existente de CLI/Host, evitando transformar cada session em vários eventos.

O Skill discovery pode ler cada `SKILL.md` para obter metadata, mas não carrega o corpo do Skill no
contexto do modelo durante a etapa de session open. A conexão MCP pode iniciar em paralelo após o
runtime ser construído, e apenas o primeiro model turn espera pelo registro de ferramentas.

## Deduplicação, falhas e amostragem

- `session_open_id` é gerado no Renderer e atravessa esta abertura lógica; retry/recovery reutilizam o mesmo ID.
- Os eventos de start/result são disparados pelo sidecar de observação do ARMS de forma fire-and-forget, sem bloquear a UI ou o protocol.
- No desktop, start/result têm 100% de upload; nenhum evento por etapa é adicionado e nada é reportado em nível de stream/delta.
- Chamadas que ultrapassam o watchdog de session-open reportam `status=timeout`; quando não há result por crash de processo ou destruição da janela, a lacuna entre start/result permite estimar as amostras não concluídas.
- Subetapas detalhadas de `plugin/skill/memory/history/projection` entram apenas no debug/trace estruturado existente de CLI/Host, e não como eventos ARMS de alta frequência.