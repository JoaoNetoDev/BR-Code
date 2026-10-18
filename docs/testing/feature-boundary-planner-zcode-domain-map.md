# Mapa de Domínios do ZCode para o Feature Boundary Planner

## Contexto

Depois que o `feature-boundary-planner` foi generalizado, a partir de um skill de conversation, para se tornar a porta de entrada geral de esclarecimento de fronteiras de funcionalidade do ZCode, o fluxo principal preservou formal-proof, o catálogo de cases e o método de poda do usuário, mas o núcleo passou a ser弄清楚 primeiro a fronteira da funcionalidade. Quando o usuário traz questões como 「切换模型」 (trocar de modelo), 「手机模式」 (modo celular), 「队列功能」 (funcionalidade de fila), 「渲染性能」 (performance de renderização), 「持久化数据更新」 (atualização de dados persistidos), 「监控埋点」 (instrumentação de monitoramento) ou 「数据跟踪」 (rastreamento de dados), o skill precisa primeiro listar os estados de produto possivelmente cruzados e só então guiar o usuário a podar passo a passo, em vez de simplesmente aplicar as dimensões padrão de conversation.

## Objetivos

- Adicionar ao skill uma referência de domínios de capacidade e eixos de cruzamento do ZCode, ajudando quem usa a localizar documentos, código e donos de estado a partir de uma necessidade em linguagem natural.
- Fazer com que a enumeração da matriz cubra os pontos de cruzamento reais de produto: desktop, web, controle remoto pelo celular, workspace remoto, model/provider, queue, persistence, telemetry, performance de renderização, permission/tool/MCP, theme/locale, entre outros.
- Manter o `SKILL.md` enxuto, colocando o domain map detalhado em `references/`, com carregamento sob demanda.
- Preservar o mecanismo de poda do usuário: o skill só pode propor semânticas candidatas e superfícies de impacto, e nunca decidir silenciosamente o comportamento de produto pelo usuário.

## Principais Fontes de Fato

| Domínio de capacidade                    | Documentos representativos                                                                                                                                     | Entradas de código representativas                                                                                                                                                |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Arquitetura e fluxo de mensagens                   | `docs/architecture/zcode-code-architecture-overview.md`, `docs/architecture/message-flow.md`                                                          | `packages/shared`, `packages/services`, `packages/desktop`, `packages/ui`, `apps/zcode-cli`                                                                                    |
| Espaço de estados de Conversation          | `docs/zcode-protocol.md`, `docs/conversation-product-state-space.md`, `docs/testing/conversation-session-*.md`                                        | `packages/formal-proof`, `packages/ui/src/v4/conversationProjectionStore.ts`, `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/`                                       |
| Modelos e Providers                | `docs/working-memory/provider-refactor/design/`                                                                                                       | `packages/provider`, `packages/provider-node`, `packages/services/src/provider-runtime`, `packages/ui/src/settings`                                                            |
| Controle remoto pelo celular e replayable          | `docs/web-remote-control/*.md`, `docs/zcode-protocol.md`                                                                                              | `packages/shared/src/zcode-protocol-v4/`, `packages/ui/src/v4/agentConversationTransport.ts`, `packages/desktop/src/main/webRemoteControlManager.ts`                           |
| Queue / command                | `docs/ui/chat-message-queue.md`, `docs/zcode-protocol.md`                                                                                             | `packages/shared/src/zcode-protocol-v4/command.ts`, `packages/ui/src/v4/SessionPane.tsx`, `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/commands/handlers/queue.ts` |
| Persistence / identity         | `docs/task/task-sqlite-index.md`, `docs/task/task-snapshot-on-demand.md`, `docs/remote-workspace-session-unified-settings.md`                         | `packages/services/src/session/taskIndexRepo.ts`, `packages/ui/src/store/tabWorkspaceIdentity.ts`, `packages/shared/src/workspaceSessionRestore.ts`                            |
| Performance de renderização          | `docs/chat/message-render-performance.md`, `docs/performance/streaming-tool-input-backpressure.md`, `docs/performance/renderer-production-logging.md` | `packages/ui/src/v4/ConversationTimeline.tsx`, `packages/ui/src/v4/ConversationRowView.tsx`, `packages/ui/src/v4/conversationProjectionStore.ts`                               |
| Monitoring / telemetry / usage | `docs/monitoring/performance-telemetry-catalog.md`, `docs/monitoring/business-monitoring.md`, `docs/usage-stats-app-coding-plan-split.md`             | `packages/ui/src/lib/appTelemetry.ts`, `packages/ui/src/lib/uiPerfArmsTelemetry.ts`, `packages/services/src/telemetry`, `packages/services/src/usage-stats`                    |
| Permission / tool / MCP        | `docs/permission-project-approval.md`, `docs/mcp-platform-boundary.md`, `docs/agent-tool-call-renderer.md`                                            | `packages/shared/src/zcode-protocol-v4/`, `packages/shared/src/mcp.ts`, `packages/ui/src/v4/V4InteractionDialogs.tsx`, `packages/ui/src/ToolCallBlocks*`                       |
| Theme / locale / shell mobile  | `docs/ui/zai-themes.md`, `docs/ui/default-theme.md`, `docs/web-remote-control/mobile-theme-control.md`                                                | `packages/ui/src/i18n`, `packages/ui/src/useTheme.ts`, `packages/ui/src/WebRemoteControlMobileShell.tsx`, `packages/shared/src/protocol.ts`                                    |

## Requisitos de Comportamento do Skill

1. Quando o usuário traz uma funcionalidade do ZCode ou uma interação propensa a bugs, mapear primeiro a necessidade para 1 a 4 domínios de capacidade, ler os documentos-fonte correspondentes e só então olhar o código.
2. Para cada domínio de capacidade, registrar os donos de estado: estado local de UI, store Zustand, host service, desktop main, relay, agent runtime, arquivo SQLite / de session, remote host ou backend API.
3. A extração de dimensões deve incluir o tipo de ponta e a semântica de entrega: o desktop `desktop-continuous` e o celular `web-remote-replayable` não podem se substituir.
4. Quando envolver estado de nível de workspace, é obrigatório distinguir `workspaceIdentity`, `workspacePath` e `workspaceKey = workspaceIdentity?.trim() || workspacePath`.
5. Enumerar primeiro as combinações candidatas de cruzamento e então podar com guard, invariantes, classes de equivalência e cases representativos; toda combinação podada precisa deixar registrado o invariante correspondente.
6. Cases em `undefined` devem virar perguntas ao usuário em lotes pequenos, com respostas candidatas e superfícies de impacto.
7. Um case aceito precisa declarar setup, action, assertion e camada de evidência, contendo pelo menos uma camada de evidência não-UI.

## Eixos de Cruzamento de Alto Risco

| Eixo de cruzamento                                                                  | Por que precisa ser considerado explicitamente                                                                                                               |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Troca de modelo x troca/criação/envio/fork/edit/queue de task                | A fonte de fato do modelo atravessa toolbar, workspace default, task config, task meta, draft session, provider registry e o `defaultModelRef` do runtime. |
| Modelo/provider x workspace remoto                                          | O provider registry local app-global e a fonte de fato de execução do runtime remoto diferem; reconexões e restarts do runtime expõem estado antigo.                           |
| Controle remoto pelo celular x queue / permission / elicitation / stop                      | O lado celular depende de mirror replayable, snapshot watermark, owner command e host command queue; não pode ser inferido a partir da queue local do desktop.               |
| Snapshot replayable x dados persistidos                                        | `ZCodeTaskSnapshot.runtime` é um complemento de runtime responsivo e não é gravado de volta no JSON da session; o task index cuida apenas dos metadados de listagem.                               |
| Queue x stop / compact / goal / edit / fork                             | A queue é intenção futura do usuário e não pode ser reescrita implicitamente por compact, edit ou fork; a semântica de autoDrain após stop precisa ficar explícita.                                      |
| Performance de renderização x streaming de tool input / task em background / replay | Entradas grandes de ferramenta, Markdown, Mermaid, tarefas em background e gaps replayable amplificam os custos de escrita no store, parsing e React render.                           |
| Telemetry x message stream / tool step / privacidade / volume               | Eventos de altíssima frequência por step/chunk amplificam o volume de ARMS ou de logs; conteúdo do usuário, credenciais, hashes e payload bruto não podem entrar em canais onde não deveriam.                   |
| Theme / locale x desktop / mobile / configurações persistidas                  | As preferências locais de tema do desktop e do controle remoto pelo celular não se acoplam; o locale pode afetar comandos, menus, toasts, asserções de captura de tela e textos de teste.                                       |
| Workspace identity x cache / lista de tasks / carregamento de skill/plugin/MCP          | Um workspace remoto não pode ser isolado apenas por path; cache, fila, configurações, lista de tasks e histórico remoto precisam usar a regra de fallback de identity.                         |
| Tool/MCP/permission x remoto pelo celular                                     | As capacidades de plataforma do MCP passam por `IPlatformService` e por shared-host attachment; as opções de permission precisam ser repassadas da resposta do agente e não adivinhadas pela UI.     |

## Aceitação

- O `SKILL.md` do `feature-boundary-planner` aponta para a nova reference de domain map e exige, no fluxo, esclarecer a fronteira da funcionalidade antes de fazer o mapeamento para domínios de capacidade.
- O arquivo de reference cobre os domínios de capacidade, as fontes de fato, os donos de estado e os eixos de cruzamento de alto risco acima.
- O template de planejamento de cases comporta domain scope, state owners, cruzamentos de alto risco e camadas de evidência.
- Executar a validação do skill, `pnpm typecheck` e `pnpm lint`.