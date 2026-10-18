# Integração atual entre ZCode Agent e App

Data de atualização: 2026-09-04

O ZCode App inicia apenas o ZCode Agent (`zcode app-server --stdio` de `apps/zcode-cli`). O gerenciador de
processos multi-Agent descontinuado, o instalador de runtime de terceiros, o tráfego de proxy e o alternador de
Agent na UI não pertencem ao caminho atual do produto.

## Limites de processo e serviço

```text
Renderer / Web UI
  -> hooks / IServiceAccessor
  -> IZCodeAgentService（V4 command/topic）
     IZCodeSessionService（仍存的 lifecycle/workspace config facade）
     IZCodeTaskService（列表组织态、兼容查询和 remote wrapper）
  -> window-scoped Local Host Process
  -> ZCodeAgentProcessManager
  -> workspaceKey-scoped zcode app-server --stdio
```

- A UI não gerencia subprocessos, não faz parse de frames de stdio e não chama diretamente a implementação concreta do serviço.
- Cada BrowserWindow tem um Local Host; múltiplos workspaces locais da mesma janela compartilham esse processo por meio do escopo de serviço por workspaceKey, sem iniciar um Local Host por workspace.
- Workspaces remotos criam ou reutilizam, além disso, um Remote Host no escopo da janela/alvo. O Remote Host é um processo distinto do Local Host da janela e é responsável por conectar ao ambiente SSH/WSL/Docker/Server correspondente; o broadcast continua sendo fornecido pelo serviço local do desktop.
- O processo do Agent é isolado por `workspaceKey = workspaceIdentity?.trim() || workspacePath` e as inicializações concorrentes são single-flight.
- O attach `/remote` do celular reaproveita o local/remote host e a CLI já existentes na janela do desktop e não cria runtime de Agent no lado do celular.
- main/relay responde apenas por janela, pareamento, autenticação, heartbeat e encaminhamento de frame/app payload, sem guardar estado de conversa.

## Propriedade do estado

| Estado                                                                                           | Autoridade                                                                                                       |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| transcript、turn/row、phase、actions、queue、interaction、goal、background work、session config | CLI V4 projection/runtime                                                                                       |
| Provider Config、Registry 与凭据                                                                | 当前 Environment；Host/Worker 从该 Environment 的 Config/Credential Source 构建，不跨 Environment 下发 Registry |
| pin/archive/group/unread、列表搜索兼容 metadata                                                 | host tasks-index                                                                                                |
| draft、scroll、focus、panel、optimistic pending overlay                                         | renderer/web 本地                                                                                               |

O `zcodeSessionStore` ainda承载 o shell do workspace, o cache da lista de tarefas, o estado organizacional de não lidas/otimista e parte das projeções de serviço compatíveis, mas já não possui o transcript de conversa V4 nem a config de sessão vinculada. O caminho de leitura de conversa da UI é
`ConversationProjectionStore` / `SessionDataLayer`, e o caminho de leitura de atividade da lista é o sessions-index.

## Protocolo

O stdio usa NDJSON delimitado por LF, com schema em `packages/shared/src/zcode-protocol-v4/`. O
`zcodeProtocolClient` e o `zcodeStdioTransport` do Host respondem por requisições, notificações e geração de runtime; logs de alta frequência de frames/chunks brutos devem usar o `debug` do service logger.

Caminho principal:

- leitura: topics `conversation/<sessionId>`, `sessions-index/<workspaceId>`,
  `workspace-config/<workspaceId>`;
- escrita: envelope de command V4 + command ACK/query;
- recuperação: desktop continuous e mobile replayable usam ownership de subscription e delivery kind distintos,
  convergindo por fim para o mesmo snapshot;
- o schema antigo `session/*` só permite manter as facades de compatibilidade restantes e não pode hospedar novas funcionalidades de conversa.

Veja [ZCode Protocol](./zcode-protocol.md).

## Prontidão de Provider e inicialização

A prontidão de Provider apenas bloqueia os caminhos de escrita que alteram sessão/workspace ou a execução do modelo. O serviço verifica se o Registry do Environment atual possui ao menos um Provider/Model executável e o material de acesso necessário; a verificação apenas valida a estrutura deste Environment e não faz sondagem de rede. Quando não satisfeita, o caminho de escrita retorna um `provider_not_ready` estável, não cria draft session e a UI de rascunho exibe a entrada já existente de configuração de modelo ausente.

O plano de controle somente leitura não depende de modelos: `sessions-index`, `conversation/<sessionId>` já existente e seu resync/unsubscribe podem iniciar sob demanda e reutilizar a CLI do workspace, de modo que a lista de tarefas e o histórico continuem exibíveis mesmo sem modelo ou quando a migração de credenciais falha. Após a inicialização somente leitura, as próximas `createSession` / commands ainda devem passar novamente pelo gate de prontidão; um client ativo não pode se tornar uma condição de bypass. Essa correção não adiciona campos de protocolo nem altera os limites de desktop continuous, mobile replayable, connection ownership ou workspace identity.

`provider_not_ready` é um estado normal de espera para usuário novo que ainda não concluiu a configuração, não uma falha de subscription do sessions-index. Quando o Registry fica ready, o
Agent Service reutiliza o Worker já iniciado pela subscription somente leitura, ou o inicia uma única vez por workspaceKey caso ainda não tenha sido iniciado; o Worker reconstrói o Registry a partir da Config Source do Environment atual; a subscription de topic não precisa esperar pela configuração de modelo nem exigir que o usuário reinicie o App.

Todos os motivos de retry de topic devem usar uma enumeração limitada, é proibido concatenar o `reason` do log da rodada anterior na próxima. Falhas persistentes que não sejam de prontidão podem manter a recuperação automática, mas `warn` de produção para o mesmo erro no máximo uma vez por minuto; após estabelecer a subscription com sucesso, limpar o backoff e o estado de rate limit daquele topic, para que novas falhas后续 ainda registrem imediatamente o primeiro log de diagnóstico.

Quando o Registry fica ready posteriormente, o Service habilita a capacidade de execução de modelos do workspace registrado em uma única ocorrência por workspaceKey.
Quando a config depois fica inválida, o Registry do Environment atual é atualizado, mas processos já em execução não são-mortados ativamente. A subscription somente leitura de workspace remoto continua iniciando a CLI alvo pelo attachment de shared host do desktop já existente; o `/remote` do celular não pode iniciar um Agent/runtime adicional por causa disso.

O modelo de rascunho não é "tudo decidido por padrão pelo Agent": o draft V4 lê o catalog do workspace e a última seleção global sob aquele workspace, e estabelece os valores iniciais da sessão na CLI via prewarm de `createSession.config` / CAS. Sessões existentes seguem sempre a config do snapshot.

## Workspace de inicialização indisponível

A inicialização do desktop usa apenas o último workspace local ativo para decidir se a UI entra em recuperação somente leitura. Quando o caminho está ausente, não é um diretório ou é inacessível:

- ainda restaura a tab original do workspace, o tasks-index e as sessões de histórico;
- marca como `unavailable-local-directory` pelo tempo de vida do renderer, sem escrever de volta a setting e sem polling em runtime;
- permite navegação somente leitura, busca, cópia, troca/fechamento de workspace e settings;
- proíbe entradas que modifiquem sessão/workspace, como envio, retry, fork, compact, mutações de lista, anexos, árvore de arquivos, Git, terminal etc.;
- o链路 local de recuperação do desktop sempre garante que exista o workspace de backing da conversa gerenciada pelo app e o usa como fallback de spawn do Agent do local Host; qualquer workspace local restaurado (inclusive workspaces históricos não ativos) só degrada para esse diretório quando o próprio cwd está indisponível, e o workspacePath/identity do protocolo mantém o valor original.

Workspaces remotos e workspaces locais não ativos não participam da decisão de disponibilidade da UI na inicialização. Workspaces históricos não ativos são verificados dinamicamente em seu cwd real pelo preflight de spawn do Agent ao estabelecer a subscription de background do tasks-index; diretórios ausentes não podem provocar `ENOENT` no Helper nem reinícios contínuos. O caminho ativo permanece somente leitura após a recuperação em runtime, e a próxima inicialização reavalia.

## Recursos remotos e empacotamento

A implantação remota/pacote desktop padrão atual mantém apenas o ZCode Agent e as ferramentas/runtimes necessários (por exemplo Node, node-pty, ripgrep e o search runtime de cada plataforma). O histórico `resourcePackages.selectedPackageIds` é apenas de leitura compatível e não pode reduzir os recursos exigidos atualmente. Scripts de build, assinatura e verificações de lock de recursos do Windows não podem trazer de volta ao artefato runtimes de terceiros descontinuados que ficaram residuais na máquina.

- `prepare:glm` de `@zcode/desktop` permanece apenas como fallback manual de compatibilidade para baixar o Agent nativo antigo; o empacotamento local padrão prepara `zcode.cjs` via `prepare:agent-bundle`. `prepare:native-search` baixa os arquivos pré-compilados de `bfs`, `ugrep`, `ripgrep` conforme a plataforma alvo, e o antigo `prepare:rg` não é mais exposto como entrada mantida separadamente.
- A autoverificação de runtime local de `pnpm dev:desktop` completa apenas o conjunto de ferramentas native-search da plataforma atual e os platform helpers obrigatórios: em macOS/Linux o conjunto é `bfs`, `ugrep`, `ripgrep`; em Windows x64/arm64 é `ugrep`, `ripgrep`; a autoverificação não verifica mais nem baixa `glm/zcode-agent`. O Agent em modo dev é construído por `dev-desktop-env.mjs` chamando `build-desktop-agent-cli.mjs` após o `pre-dev`, e em runtime se prioriza o `dist/zcode.cjs` dentro do workspace.
- O instalador do desktop carrega `resources/glm/zcode.cjs`, `resources/tools/ugrep` e `resources/tools/ripgrep`; macOS/Linux também carregam `resources/tools/bfs`.

A fonte de verdade para a versão do runtime do Agent é `packages/shared/src/zcode-agent-runtime.ts`. O desenvolvimento local, o build do desktop, o manifest remoto e a lógica de download devem lê-la em conjunto, sem mais inferir a partir da antiga lista de runtimes de provider.

## Entradas atuais

- `packages/services/src/zcode-agent/zcodeAgentService.ts`
- `packages/services/src/zcode-agent/zcodeAgentProcessManager.ts`
- `packages/services/src/zcode-agent/zcodeProtocolClient.ts`
- `packages/services/src/zcode-agent/zcodeStdioTransport.ts`
- `packages/services/src/zcode-agent/zcodeAgentConnectionScope.ts`
- `packages/ui/src/v4/V4ConversationContext.tsx`
- `packages/ui/src/v4/SessionPane.tsx`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-entrypoint.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts`
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/v4-gateway.ts`