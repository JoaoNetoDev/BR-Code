# Trace de Ações de Usuário do Desktop Renderer

## Status

- Este documento é a especificação de implementação do Trace de ações do usuário com semântica de usuário do Electron Desktop Renderer.
- Apenas o Span `ui_action` é adicionado; Web, celular, Host, CLI, RPC e o ZCode Protocol não são integrados.
- `/event/report` mantém os eventos, campos e contagens existentes e não reutiliza este Catalog.

## Arquitetura

```text
Ação do usuário
  -> Renderer Feature Catalog
  -> Renderer cria/encerra ui_action
  -> Renderer com batching limitado
  -> Main como Broker transparente
  -> OTLP
```

O Main apenas distribui a configuração de rollout, valida o batch e exporta usando as próprias credenciais. O Main não cria, encerra, reamostra, reescreve nem religa Spans; Host/CLI não recebem Trace Context.

## Catalog

### Core: 25 features folha

| feature_id                         | action                                                                                                              |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `workspace.local.lifecycle`        | `open` / `switch` / `close`                                                                                         |
| `workspace.remote.lifecycle`       | `open_dialog` / `connect` / `reconnect` / `disconnect`                                                              |
| `workspace.project_binding`        | `attach` / `detach` / `work_outside_project`                                                                        |
| `task.lifecycle`                   | `create` / `open` / `archive` / `rename` / `delete`                                                                 |
| `task.layout`                      | `open_split` / `split_right` / `split_down` / `close_pane`                                                          |
| `conversation.composer.message`    | `send` / `stop`                                                                                                     |
| `conversation.composer.attachment` | `add` / `remove` / `retry_upload`                                                                                   |
| `conversation.composer.config`     | `change_model` / `change_thought_level` / `change_mode`                                                             |
| `conversation.queue.item`          | `send_now` / `edit` / `remove` / `reorder`                                                                          |
| `conversation.queue.policy`        | `resume` / `toggle_auto_drain` / `toggle_followup` / `clear_and_send` / `keep_and_send`                             |
| `conversation.history.branch`      | `retry` / `edit` / `fork` / `rewind_files`                                                                          |
| `conversation.history.feedback`    | `like` / `dislike` / `clear_feedback` / `copy`                                                                      |
| `conversation.blocking.user_input` | `select_option` / `submit_text` / `cancel`                                                                          |
| `conversation.blocking.hook`       | `review` / `dismiss`                                                                                                |
| `conversation.navigation`          | `load_older` / `jump_bottom` / `open_turn`                                                                          |
| `conversation.subagent`            | `expand` / `open_side_pane` / `open_split`                                                                          |
| `conversation.background_work`     | `open` / `cancel`                                                                                                   |
| `workbench.file`                   | `open_tree` / `refresh` / `open_file` / `open_preview`                                                              |
| `workbench.terminal`               | `open` / `close`                                                                                                    |
| `workbench.browser`                | `open` / `navigate` / `back` / `forward` / `refresh` / `open_external`                                              |
| `workbench.git`                    | `open` / `commit` / `generate_commit_message` / `run_action`                                                        |
| `extension.plugin`                 | `open_store` / `search` / `open_detail` / `install` / `enable` / `disable` / `update` / `uninstall` / `save_config` |
| `extension.mcp`                    | `authorize` / `refresh` / `enable` / `disable`                                                                      |
| `automation.lifecycle`             | `create` / `update` / `run_now` / `enable` / `disable` / `pause` / `resume` / `delete`                              |

### Settings: 17 features folha

| feature_id               | action                                                                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `settings.navigation`    | `open_section` / `back_to_workspace` / `open_onboarding`                                                                                                                       |
| `settings.locale`        | `change_locale`                                                                                                                                                                |
| `settings.appearance`    | `change_theme` / `change_ui_font_size` / `change_code_light_theme` / `change_code_dark_theme` / `toggle_code_line_numbers` / `toggle_code_line_wrap` / `change_code_font_size` |
| `settings.terminal`      | `toggle_system_profile` / `save_font_family` / `change_shell`                                                                                                                  |
| `settings.search`        | `toggle_native_search`                                                                                                                                                         |
| `settings.network`       | `save_http_proxy` / `save_no_proxy` / `save_ca_certificate`                                                                                                                    |
| `settings.desktop`       | `toggle_hardware_acceleration` / `toggle_close_to_tray` / `toggle_keep_awake`                                                                                                  |
| `settings.update`        | `toggle_preview_updates` / `toggle_auto_update`                                                                                                                                |
| `settings.notification`  | `toggle_notification` / `toggle_notification_sound`                                                                                                                            |
| `settings.conversation`  | `change_interaction_behavior` / `toggle_ask_user_auto_resolution` / `toggle_model_io_retention` / `toggle_show_reasoning` / `toggle_show_todos`                                |
| `settings.tool_grouping` | `toggle_explore_grouping` / `toggle_terminal_grouping` / `toggle_changes_grouping`                                                                                             |
| `settings.task`          | `toggle_auto_archive` / `change_auto_archive_days`                                                                                                                             |
| `settings.storage`       | `change_data_directory`                                                                                                                                                        |
| `settings.memory`        | `toggle_memory` / `refresh_memory` / `change_memory_scope`                                                                                                                     |
| `settings.browser`       | `toggle_browser_use` / `import_browser_data` / `toggle_insecure_certificates` / `clear_cache` / `clear_all_data`                                                               |

`toggle_*` expressa o valor alvo por meio de `state_after=enabled|disabled`; `change_*` só aceita enums de baixa cardinalidade;
`save_*` só começa em um envio explícito. `toggle_memory` não apaga a Memory existente.

## Ciclo de vida e campos

A ação começa quando passa pela validação local e está prestes a produzir um efeito semântico real. A navegação termina
depois que a view de destino é confirmada, as configurações terminam depois que a preferência ou o serviço
correspondente é gravado com sucesso, e um Command só é concluído depois que o Renderer recebe o ACK `accepted`.
Ações de confirmação começam na confirmação final; timeout ou descarregamento resultan em `abandoned`.
Exceções de telemetria não podem alterar o resultado de negócio.

Outcomes fixos: `completed` / `failed` / `rejected` / `cancelled` / `noop` / `abandoned`.

Sources de resultado fixos: `local_commit` / `shared_settings` / `setting_service` /
`platform_result` / `authority_ack` / `optimistic_projection`.

O Span Name é fixo como `ui_action` e `service.name` é fixo como `zcode-desktop-renderer`. Os campos permitidos incluem
apenas a identificação do Catalog, surface/trigger, o resultado, o estado controlado, o tipo de workspace/remote e o
action_id. São proibidos prompt, resposta, conteúdo de arquivos, caminhos, workspaceIdentity, remoteSessionId, endereço
de proxy, caminho de certificado, nome de fonte, Cookie, histórico de navegação, Model I/O, erro completo e stack.

## Rollout, batch e contrato de falha

Distribuído em `data.configs.rendererActionTrace` de `/api/v1/client/configs`:

```json
{
  "enabled": true,
  "sampleRatio": 0.05,
  "enabledGroups": ["core", "settings"],
  "configVersion": "2026-08-25-v1"
}
```

- Desabilitado por padrão em produção; configuração ausente, primeiro timeout, falha de parsing ou configuração inválida resultam em nenhuma coleta.
- Em produção, sampleRatio só permite de 0 a 0.20; desenvolvimento/testes automatizados usam 1.0 explicitamente.
- Groups desconhecidos são ignorados; atualizações de configuração só afetam Spans novos.
- Fila do Renderer de 256; batch de 32 itens/256 KiB; dispara ao atingir 2 segundos ou o batch cheio.
- Ingress do Main de 32 por batch; timeout OTLP de 3 segundos, no máximo uma retentativa.
- Fila cheia, DTO inválido ou falha de exportação só descarta telemetria e não aplica contrapressão ao negócio.

## Aceitação

- As features/actions do Catalog são únicas e completas.
- Chamadas e payload de `/event/report` sem nenhuma alteração.
- Zero alterações em Host/CLI/RPC/Protocol.
- Web/celular não inicializam nem enviam batch.
- O Main preserva traceId/spanId/tempo/Resource/Attribute gerados pelo Renderer.
- Sem campos sensíveis, sem nova Long Task de 50ms, incremento do Heap do Renderer não superior a 10 MB e P95 do IPC de batch menor que 5ms.