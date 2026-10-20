# R3 Source Server — registro de problemas da cadeia principal remota

> **Atualização de 2026-09-07**: após a fusão da refatoração de Provider M2 (Rota A), a sincronização "de um clique" de Provider do início do R3, o seletor de dispositivo na página de configurações de modelo, o channel `provider-sync`, o registro `model-provider` no scope `source-settings` e o antigo `modelProviderService` foram todos removidos, sendo substituídos por "vínculo local na página de configurações + Provisioning automático com envio unidirecional". Os itens deste documento que envolvem essas capacidades ficam sem efeito e não são reescritos um a um: no registro de correção de R3-ISSUE-010, o trecho "o modelo registra primeiro o attachment `source-settings` … a chamada `model-provider.*` tem sucesso" é evidência histórica de um caminho já removido; R3-ISSUE-012 referencia `packages/services/src/model-provider/modelProviderService.ts` e a lógica `apiKeyCredentialKey`, que não existem mais — o Personal Provider Config passou a persistir o Personal Config em texto claro conforme a refatoração de Provider M2, e o "conflito entre especificação e implementação" desse issue é reavaliado com [docs/remote/provider-provisioning.md](../remote/provider-provisioning.md) e [../archive/remote-r3/r3-provider-refactor-merge.md](../archive/remote-r3/r3-provider-refactor-merge.md) como nova linha de base. Os demais itens que não são de Provider não são afetados.

## Estado do documento

- Estado: Open
- Data de criação: 2026-08-28
- Linha de base da revisão: `feat/multi-device-remote-3-real-ssh-feature@ed0fe80b1391`
- Escopo original da revisão: o `staging...HEAD` em 2026-08-28, não o diff mais recente do branch atual
- Finalidade: registrar os problemas encontrados na revisão completa do branch atual, para correção, verificação e fechamento posteriores item a item com IDs estáveis
- Nota atual: o estado é mantido por item; os itens fechados mantêm o resumo da correção e da verificação, os itens em aberto mantêm a lista completa de pendências. A organização do documento não altera as conclusões de verificação.
- 2026-09-13 organização do documento: os documentos de processo do R3 foram arquivados em `docs/archive/remote-r3/` e as referências deste texto foram sincronizadas; R3-ISSUE-012 passou a "não corrigir" por perda de premissa, R3-ISSUE-019 entrou em "em correção"; a porta de leitura atual está em [docs/remote/README.md](../remote/README.md)
- 2026-09-13 registro adicional: R3-ISSUE-023 (conexão manual bem-sucedida no estado de recuperação não emite reconnect) veio da revisão de branch do mesmo dia RV-P1-2 e foi fechado junto com a correção
- 2026-09-14 registro adicional: R3-ISSUE-024 (o shell padrão do `wsl.exe` expande as variáveis de comando antes da hora, install do WSL reporta falsamente falta de tar) veio da reprodução em máquina Windows real do mesmo dia e foi registrado como pendente de verificação

## Definições de estado

| Estado        | Significado                                                        |
| ------------- | ------------------------------------------------------------------ |
| `待修复`      | Problema registrado, modificação ainda não iniciada                |
| `修复中`      | Já existe implementação ou trabalho de teste em andamento         |
| `待验证`      | Implementação concluída, ainda falta evidência automatizada ou de runtime |
| `已关闭`      | Correção da causa raiz, testes relacionados e verificação de runtime necessária concluídos |
| `不修复`      | Situação aceita por decisão de produto ou arquitetura; a base da decisão deve ser registrada |

Critérios de severidade:

- `P0`: bloqueio de release, segurança de dados ou indisponibilidade da cadeia principal;
- `P1`: funcionalidade de alto impacto, permissões, isolamento de identidade ou erro de ciclo de vida;
- `P2`: defeitos de impacto médio ou baixo, dívida de arquitetura, lacunas de verificação ou de documentação.

Critérios de confiança:

- `已确认`: a cadeia de chamadas estática já prova que o problema existe;
- `高风险待复现`: a estrutura do código permite que o problema ocorra; ainda é preciso adicionar um teste de falha ou uma reprodução de runtime para confirmar as condições de acionamento específicas.

## Visão geral

| ID            | Severidade | Área                 | Resumo do problema                                                             | Confiança        | Estado   |
| ------------- | ---------- | -------------------- | ------------------------------------------------------------------------------ | ---------------- | -------- |
| R3-ISSUE-001 | P0         | Release              | O validador de release oficial ainda valida os remote assets antigos            | 已确认           | 待验证  |
| R3-ISSUE-002 | P1         | Desktop IPC          | O Preload perde o workspace scope                                              | 已确认           | 已关闭  |
| R3-ISSUE-003 | P1         | Permissões Mobile    | O attachment do celular pode acessar o Terminal RPC                            | 已确认           | 已关闭  |
| R3-ISSUE-004 | P1         | Ciclo de vida        | Desconexão explícita durante retrying não converge                             | 已确认           | 已关闭  |
| R3-ISSUE-005 | P1         | Ciclo de vida        | Profiles diferentes do mesmo Source podem gerar dois logical owner             | 已确认           | 已关闭  |
| R3-ISSUE-006 | P1         | Ciclo de vida        | Após excluir um Profile, o Manager ainda pode reconectar usando a linha antiga | 已确认           | 已关闭  |
| R3-ISSUE-007 | P1         | Recuperação          | A recuperação automática continua tentando mesmo em estado de ação do usuário  | 已确认           | 已关闭  |
| R3-ISSUE-008 | P1         | Configurações       | A preferência de reconexão automática no startup é descartada pelo schema completo de AppSettings | 已确认 | 已关闭 |
| R3-ISSUE-009 | P1         | Recuperação Mobile   | Não há estado terminal claro depois de esgotado o orçamento de reconstrução do bridge | 已确认      | 已关闭  |
| R3-ISSUE-010 | P2         | Source Settings      | O fechamento tardio da porta antiga pode remover o serviço da nova geração      | 已确认           | 已关闭  |
| R3-ISSUE-011 | P1         | Recuperação          | A substituição lógica de múltiplos workspaces não é uma operação atômica completa | 已确认       | 已关闭  |
| R3-ISSUE-012 | P2         | Segurança do Provider| Conflito entre a especificação e a implementação de persistir a API Key em texto claro | 已确认 | 不修复 |
| R3-ISSUE-013 | P2         | Migração             | A primeira migração do Directory pode deixar credenciais órfãs                 | 已确认           | 已关闭  |
| R3-ISSUE-014 | P2         | Release Resolver     | O download não tem cancelamento nem cache single-flight                         | 高风险待复现     | 待修复  |
| R3-ISSUE-015 | P2         | Arquitetura de UI    | O RemoteWorkspaceController ainda não é um ponto de escrita único              | 已确认           | 已关闭  |
| R3-ISSUE-016 | P2         | Projeção de UI       | O RemoteWorkspaceProjection não está totalmente conectado e projeta tabs locais por engano | 已确认 | 已关闭 |
| R3-ISSUE-017 | P2         | UI Mobile            | O estado e o nome do cabeçalho do grupo de Sources no celular podem degradar e ficar distorcidos | 高风险待复现 | 待修复 |
| R3-ISSUE-018 | P2         | Sistema de design    | A nova UI remota tem tamanhos arbitrários e alpha ad-hoc                       | 已确认           | 待验证  |
| R3-ISSUE-019 | P2         | Documentação         | Arquitetura, planos, coverage e registros reais divergem de estado              | 已确认           | 修复中  |
| R3-ISSUE-020 | P1         | Evidência de release | Registros históricos de máquina real não provam o HEAD atual                    | 已确认           | 待验证  |
| R3-ISSUE-021 | P1         | Ciclo de vida        | A desconexão durante a gravação do handshake é descartada e a conexão morta é publicada como online | 已确认 | 已关闭 |
| R3-ISSUE-022 | P1         | Release              | O archive remoto não tem o MCP runtime dos plugins android/ios                  | 已确认           | 已关闭  |
| R3-ISSUE-023 | P1         | Recuperação          | Conexão manual bem-sucedida no estado de recuperação não emite reconnect e o Registry fica parado em recovering | 已确认 | 已关闭 |
| R3-ISSUE-024 | P0         | WSL Transport        | No modo não `--exec` do `wsl.exe` o shell padrão expande as variáveis de comando antes da hora e o install do WSL reporta falsamente falta de tar | 已确认 | 待验证 |
| R3-ISSUE-029 | P2         | Recuperação          | A substituição lógica em curso não preserva o reconnect seguinte e a convergência da conexão atual não é acionada | 已确认（condicional） | 待修复 |
| R3-ISSUE-030 | P2         | Cancelamento do Provider | A espera pela atualização do Registry compartilhado não pode ser cancelada a tempo e o chamador de produção atual não passa signal | 已确认（condicional） | 待修复 |

## Detalhes dos problemas

A localização completa, os caminhos antigos e os registros de cada rodada dos itens fechados ficam em `git show a17a875588b8d66c2bee49236292e174df651363:docs/architecture/r3-source-server-remote-open-issues.md`; os resumos abaixo não elevam o nível de verificação original.

### R3-ISSUE-001: o validador de release oficial ainda valida os remote assets antigos

- Severidade: P0
- Confiança: 已确认
- Estado: 待验证
- Fenômeno: a nova cadeia de build só gera `source-server-release.json` e quatro `zcode-server-*.tar.gz`, mas o `release:validate` oficial ainda exige `manifest-*.json` e `components/**`.
- Impacto: um diretório de release limpo falha de forma estável; um diretório sujo pode passar a validação usando artefatos antigos, sem validar o Source Server archive realmente publicado nesta rodada.
- Evidências:
  - [`build:remote:assets`](../../.gitlab/ci/30-build.yml) em [`.gitlab/ci/30-build.yml`](../../.gitlab/ci/30-build.yml) coleta apenas o descriptor e os quatro archives;
  - o contrato de upload de [`.gitlab/ci/50-release.yml`](../../.gitlab/ci/50-release.yml) inclui somente os novos artefatos;
  - a função `validateRemoteAssets()` em [`scripts/validate-release-artifacts.mjs`](../../scripts/validate-release-artifacts.mjs) ainda reconhece apenas manifest/components legados;
  - `gitlabCiBuildGraph.test.ts` e `validateReleaseArtifacts.test.ts` validam dois contratos mutuamente exclusivos, faltando um teste de integração ponta a ponta.
- Condição de fechamento: o validador passa a validar estritamente a versão do descriptor, os quatro targets, o nome de arquivo, size, SHA-256, URL e o archive real; a saída de build passa diretamente pela validação oficial de release; resíduos antigos não afetam o resultado.

#### Registro de correção 2026-09-13

- Estado: 待验证
- Commit de correção: os commits que contêm este registro em `feat/multi-device-remote-3-real-ssh-feature` (`fix(release): validate Source Server descriptor and archives`)
- Causa raiz: as duas pontas (build e upload) já habían mudado para o contrato descriptor+archive, mas `validateRemoteAssets()` não foi sincronizada, e a troca em `build:remote:assets` removeu a limpeza dos artefatos antigos do diretório compartilhado. Reprodução: validar com o script real um diretório com "6 plataformas + descriptor + 4 archives" lança `missing remote manifest: manifest-darwin-arm64.json`; quando o diretório mantém o manifest antigo, basta corromper o archive — ou até remover o descriptor — para a validação passar.
- Correção: `validateRemoteAssets()` passa a ser `validateSourceServerRelease()`, validando o `schemaVersion`, a versão, os quatro targets, `fileName`, `version`, `urls` (que devem conter caminhos relativos seguros apontando para o archive), `sizeBytes`, `sha256` do descriptor e o archive real, e falhando de forma fechada (fail-closed) na presença de `manifest-*.json` / `components/` residuais e de `zcode-server-*.tar.gz` não referenciados; `build:remote:assets` limpa os artefatos do diretório raiz sob sua responsabilidade antes de copiar; a descrição de validação em `docs/desktop-ci-cd.md` foi sincronizada.
- Verificação automatizada: `packages/desktop/test/validateReleaseArtifacts.test.ts` foi reescrito para o novo layout (incluindo a constante de targets e a asserção de integração com `SOURCE_SERVER_RELEASE_TARGETS` de `@zcode/shared`); `gitlabCiBuildGraph.test.ts` ganhou as asserções "o conjunto de targets coletado pela CI == o conjunto esperado pelo validador" e "há limpeza antes da cópia".
- Verificação de runtime: não executado em uma tag real / pipeline `ci*`; precisa ser confirmado na próxima simulação com `CI_RELEASE_BRANCH=1` antes do fechamento.
- Riscos restantes: `scripts/upload-oss.sh` ainda mantém um ramo especial para `manifest-*.json` (código morto, não removido); com o validador rejeitando resíduos legados, se alguém colocar arquivos antigos manualmente no diretório compartilhado do runner, a validação será bloqueada — é preciso limpar o diretório e tentar de novo.

### R3-ISSUE-002: o Preload perde o workspace scope

- Severidade: P1
- Confiança: 已确认
- Estado: 已关闭
- Fenômeno: o Main entrega `ScopedServicePort` com `workspacePath`, `workspaceIdentity` e `workspacePurpose`, mas o Preload, ao repassar, mantém apenas `attachmentId`, `sessionId`, `target` e `sourceServerId`.
- Impacto: a remote session registrada pelo Renderer fica sem informações de workspace e purpose; ao entrar em uma Source conversation a partir de um projeto, pode não ser criada uma logical session independente, e a session do projeto original é reaproveitada (rebind) para o conversation backing workspace.
- Evidências:
  - o payload do Main em [`packages/desktop/src/main/desktopRemoteSessions.ts`](../../packages/desktop/src/main/desktopRemoteSessions.ts) contém o scope completo;
  - [`packages/desktop/src/preload/index.ts`](../../packages/desktop/src/preload/index.ts) trunca os três campos acima;
  - [`packages/desktop/src/renderer/src/remoteWorkspaceServicePortBridge.ts`](../../packages/desktop/src/renderer/src/remoteWorkspaceServicePortBridge.ts) já está preparado para analisar esses três campos;
  - [`packages/ui/src/root/useRemoteWorkspaceHistory.ts`](../../packages/ui/src/root/useRemoteWorkspaceHistory.ts) depende do path/purpose da session para decidir se cria uma conversation session.
- Condição de fechamento: Main, Preload e Renderer compartilham um schema estrito de payload; os três campos são preservados de ponta a ponta; um teste de integração prova que projeto e conversation usam logical sessions diferentes e não compartilham o mesmo `remoteSessionId`.
- Progresso atual (2026-08-28):
  - foi adicionado um schema estrito compartilhado de payload, consumido em conjunto por Main, Preload e Renderer; o Preload não reconstrói mais o payload por allowlist manual;
  - testes focados cobrem o payload do Main, a passagem pelo listener real do Preload → parser do Renderer, o fail-closed na ausência de scope, o binding direto de session unbound e o uso de logical session independente de project → conversation;
  - o caso pending de Electron com SSH real `conversation-session-ssh-remote-project-conversation-scope.test.ts` passou em `linux-amd64-dev`, provando que project/conversation usam `remoteSessionId` diferentes e reutilizam o mesmo Window Host; artefato: `desktop-e2e-20260828023242575-p87386-071a9e0ea38732ee`.
  - o HEAD atual `86f5701e10` passou novamente pela reverificação de runtime com SSH real: handshake de `dev@localhost:2222` até o Source `32a10b89-141c-469b-aa97-850f41ab7deb`; o project `/home/dev` retorna `remoteSessionId=58423030-60c1-4dda-b21e-3c5254b7d08a` e o conversation `/home/dev/.zcode/workspace/default` retorna `remoteSessionId=a1188548-5cfe-4162-ae74-b4cf1315dd6f`. As duas stable identity são preservadas separadamente, o bind do conversation retorna explicitamente `workspacePurpose=conversation` e as duas solicitações de conexão completaram o Renderer attachment ready ACK.

### R3-ISSUE-003: o attachment do celular pode acessar o Terminal RPC

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Estado: 已关闭
- Causa raiz: o Window Host tratava o `ServiceCollection` completo como autorização de attachment, usando apenas uma denylist para excluir o Source Management; com isso, `ITerminalService` era registrado no `ChannelServer` do `web-remote-replayable`.
- Correção: `ServiceCollection.exposeOnChannelServer()` passa a usar uma política de allowlist explícita; o Window Host mantém, para o attachment mobile, um contrato de channel revisado à parte, que não inclui Terminal nem Source Management, e channels novos não revisados ficam fail-closed por padrão; o attachment do Desktop mantém a superfície completa de serviços.
- Verificação: a chamada de Terminal via RPC em memória do mobile retorna Unknown e o `terminal.create` de baixo nível não é executado; o Terminal RPC do Desktop continua com sucesso; 18 itens dos 5 arquivos de teste relacionados passaram; `pnpm typecheck` e `pnpm lint` passaram.
- A reverificação real desta rodada via SSH não incluiu o lado do celular, por solicitação do usuário, e não houve nova evidência de celular em máquina real.

### R3-ISSUE-004: desconexão explícita durante retrying não converge

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Causa raiz: `disconnect()` tratava o owner físico online como critério de existência do ciclo de vida do Source; como uma desconexão inesperada já havia removido esse owner, a desconexão explícita apenas limpava o timer de recuperação e retornava cedo. O flight de recuperação já iniciado também não tinha um owner de cancelamento no nível do Source, de modo que um sucesso tardio ainda podia republicar online.
- Correção: a desconexão explícita captura primeiro todos os Profiles do Source, depois limpa o estado de recuperação e publica offline de forma unificada; os connect flights de Sources já identificados mantêm um owner cancelável, e o disconnect invalida o flight antigo; as fronteiras assíncronas verificam o sinal de cancelamento antes de publicar estado, e uma conexão tardia apenas libera recursos, sem publicar online nem evento de reconnect.
- Verificação: 24 testes focados do Manager passaram, cobrindo retrying-disconnect com múltiplos Profiles, cancelamento de todos os timers/probes e sucesso tardio em voo; os testes focados de estado terminal do Registry, Main e Renderer passaram; a reprodução mínima com temporizador real permaneceu offline, sem contagem de recuperação e sem nova conexão; a suíte unitária completa passou com 1496 arquivos e 13247 itens; `pnpm typecheck`, `pnpm lint` e `pnpm verify:pre-push` passaram.
- O HEAD atual `86f5701e10` passou pela reverificação real via SSH com injeção de falha de processo: ao parar o container dedicado `zcode-ssh-linux-amd64`, o Source saiu de "已连接" para "连接中"; chamando `disconnectSource(sourceServerId)` no `ISourceServerManagementService` real, usado no `SourceServerManagementPanel` montado, o log do Host registrou `source-server-management.disconnectSource OK (3.1ms)` e o estado mudou imediatamente para "未连接". Após restaurar o container e esperar 6 segundos, o estado continuou "未连接", sem revive de reconnect tardio; ao final do teste, container, daemon e Desktop voltaram a estar online.
- Limite de interação: a página de configurações e a Sidebar hoje só exibem "断开" quando o status agregado é online; nos estados retrying/connecting não existe entrada clicável para o usuário. Portanto, esta rodada prova o contrato de runtime Renderer → MessagePort RPC → Host → Manager, e não um caminho puramente de clique na UI; se o produto exigir que o usuário cancele ativamente durante a recuperação, é preciso adicionar uma entrada de interação ou ajustar a visibilidade do botão.

### R3-ISSUE-005: Profiles diferentes do mesmo Source podem gerar dois logical owner

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Causa raiz: o Registry usava a route key de SSH/WSL/Docker simultaneamente como chave de lookup antes do handshake e como chave final de owner após o handshake; depois que o Manager passou a reutilizar a conexão física por `sourceServerId`, as entries de Profiles diferentes ainda eram publicadas individualmente como online, e o workspace join verificava apenas a mesma entry.
- Correção: após o handshake, o Registry faz o claim atômico da entry canônica do Source por `sourceServerId`; a route entry que perde a concorrência transfere a pending logical session para o owner canônico, recuperando apenas wrapper/assinaturas e preservando o alias de rota. Quando um Source em recuperação obtém um novo handle por outro Profile, o handle, o target ativo, o `remoteSessionId` e a generation são trocados na mesma entry canônica, sem criar um segundo owner.
- Verificação: novos testes de handshake concorrente no mesmo workspace, em workspaces diferentes, em ordem inversa, de takeover de recuperação entre Profiles e de join do target canônico no Main; 103 itens dos 5 arquivos de teste relacionados passaram; `pnpm typecheck` e `pnpm lint` passaram; a reprodução mínima de runtime convergiu de `connectionCount=2/logicalSessionCount=2` para `1/1`, as duas solicitações retornaram o mesmo `remoteSessionId` e `findSessionForWorkspace()` teve um único acerto.
- O HEAD atual `86f5701e10` passou pela reverificação real com dois Profiles via SSH: o Profile A `dev@localhost:2222` e o Profile B `dev@127.0.0.1:2222`, após o handshake, pertencem ambos ao Source `32a10b89-141c-469b-aa97-850f41ab7deb`; as duas rotas abrindo `/home/dev` retornam ambas `remoteSessionId=58423030-60c1-4dda-b21e-3c5254b7d08a`. Após a segunda rota, a topologia do Host continua `connections=1, logicalSessions=2`, sendo que as duas logical sessions correspondem a project e a conversation, sem gerar um segundo owner de project.

#### Registro de correção complementar 2026-09-13 (finding de revisão RV-P1-3)

- Fenômeno: quando o `connect()` do Registry acerta uma entry de Source já online, ele obtém direto o `sourceServerId` mas não normaliza a workspace identity para `remote:server:*`; quando o chamador traz a route identity legada (o Renderer reconecta manualmente entradas não trocadas, ou o Host completa a route identity para um connect sem context), a deduplicação de owner compara pelo valor original e não acerta, o mesmo workspace publica um segundo online logical session e o `connect()` ainda devolve a identity legada como valor autoritativo. Com a normalização no bind, o main deixa as duas sessions com a mesma key, `findSessionForWorkspace()` lança "匹配到多个 logical session" e o `resolveSource` do Controller e a resolução de alvo da Automação passam a falhar.
- Causa raiz: a mesma regra "depois que a identidade do Source é conhecida, a identity só pode ser stable" foi escrita em três lugares — publicação no handshake, transferência de owner e `bindWorkspaceContext` — e o join direto da entry online, que é a quarta ocorrência, ficou de fora. Como a reconexão automática no startup só aceita entradas stable, o acionamento ponta a ponta é estreito, mas a invariante do Host é violada de forma determinística.
- Correção: o Registry extrai `applyStableWorkspaceIdentity()`, chamado de forma unificada pelas três caminhos (publicação no handshake, transferência de owner e join de entry online); o `connect()` normaliza antes de participar da correspondência de owner e da devolução quando o `sourceServerId` já é conhecido.
- Verificação: `windowRemoteConnectionRegistry.test.ts` ganhou os casos "join com legacy identity em Source online reutiliza o owner único e devolve a stable identity" e "abrir novo workspace com legacy identity em Source online normaliza imediatamente para stable identity", que falhavam antes da correção e, depois, 44 itens passaram; os testes adjacentes de conexão remota do Host, `pnpm architecture:check --changed`, `pnpm typecheck` e `pnpm lint` têm os resultados na descrição do commit.

### R3-ISSUE-006: após excluir um Profile, o Manager ainda pode reconectar usando a linha antiga

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Semântica de produto: excluir o Profile físico/de recuperação/conectando atual equivale a desconectar explicitamente todo o Source; os Profiles restantes são mantidos apenas como linhas conectáveis manualmente e não participam de takeover automático.
- Causa raiz: o antigo `forgetProfile()` removia apenas o estado de exibição e parte dos índices, sem remover `OnlineConnection.profileIds`, o `reconnectInputs` de nível Source, timers/flights e neles os target/secret já resolvidos; depois da exclusão, o antigo owner de recuperação ainda conseguia entrar no transport.
- Correção: o Manager passa a tratar o ciclo de vida de Profile de forma unificada em `removeProfile()`. Ao excluir o owner atual, cancela primeiro timer/flight, remove o owner online/de recuperação, publica a invalidação terminal `profile-removed`, libera o transport e marca apenas os Profiles conhecidos restantes como offline; ao excluir um Profile que não é o atual, limpa apenas a si mesmo. Os connect flights, tanto não identificados quanto identificados, mantêm um owner cancelável, e resultados assíncronos tardios não republicam o Profile excluído.
- Verificação: 115 itens nos quatro arquivos de teste focados de Manager, Management Service, Directory e Window Registry passaram, cobrindo online, retrying, in-flight não identificado/identificado, Profile não atual e falha de persistência; `pnpm verify:pre-push` promoveu automaticamente para a suíte unitária completa por causa de arquivos já deletados no branch, com 1496 arquivos e 13258 itens passando, e `pnpm typecheck` e `pnpm lint` passaram. Na reprodução de runtime com as classes reais de produção, após excluir o Profile SSH atual o Source ficou em terminal offline e os Profiles restantes em offline; após esperar a primeira janela de recuperação de 2 segundos, o host antigo não registrou novo probe e o número de reconexões automáticas foi 0.
- O commit atual `6a1de7485c` concluiu a reverificação real com Electron + SSH `linux-amd64-dev`: `pnpm bootstrap:with-remote` constrói e sobe o archive 3.9.1 linux-x64, e o Desktop conecta via `dev@localhost:2222` ao Source `32a10b89-141c-469b-aa97-850f41ab7deb`; foi criado também o Profile `dev@127.0.0.1:2222`, desconectado explicitamente para estabelecer a conexão física atual com esse Profile, mantendo as linhas `localhost` e `linux-amd64-dev` disponíveis. Após confirmar na página de configurações a exclusão do Profile `127.0.0.1` atual, o Host registrou `source-server-management.removeProfile OK (20.3ms)`, o Source exibiu imediatamente "未连接", o Profile excluído e as referências de credencial sumiram do Directory e as linhas restantes permaneceram offline. Na janela de observação de 136 segundos, da exclusão às 14:51:33 até o Desktop parar às 14:53:49, não houve novos registros de `connecting window-scoped remote source`, `remote-connected`, retry ou reconnect, atravessando por completo as fronteiras de recuperação de 2/4/8 segundos e de probe offline de 2 minutos, o que prova que não houve retry da linha antiga nem takeover automático de outra linha. O Profile de teste foi removido, o Desktop foi parado e o Source retornou ao estado offline anterior ao teste.

### R3-ISSUE-007: a recuperação automática continua tentando mesmo em estado de ação do usuário

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Causa raiz: o retry e o offline probe mantinham condições de término separadas e só reconheciam de forma hardcoded `SourceServerUpgradeRequiredError`; os estados terminais install/identity/non-retryable publicados por `connectOnce()` eram depois sobrescritos pelo agendador. O Host só encaminhava `retrying/offline`, de modo que o estado pending não permitia que a logical recovery convergisse.
- Correção: o Manager termina o caminho automático de forma unificada nos três pontos de entrada — atualização de desconexão, retry de 2/4/8 segundos e probe de 2 minutos — usando o código de erro público, o `retryable` original e o estado do recovery owner; o owner mantém um estado acionável e o Profile irmão converge para terminal offline. O Host reutiliza a policy de recovery pura, convertendo pending e `failed + retryable:false` no close já existente `recoverable:false`, sem modificar os contratos de Registry, relay, main ou realtime delivery.
- Verificação: 110 itens nos quatro arquivos de teste focados de Manager, recovery policy, Window Registry e Directory passaram, cobrindo install/upgrade/identity, `retryable:false` comum, offline probe, atualização de desconexão, múltiplos Profiles do mesmo Source, orçamento transitório e recuperação manual; a reprodução de runtime com fake timer, ao cruzar as fronteiras de 4/8 segundos e de 2 minutos, não gerou novo probe. `pnpm typecheck`, `pnpm lint` e o `oxfmt --check` da nova policy/test e deste documento de issue passaram; o lint só reportou warnings já existentes no repositório.
- Verificação em máquina real: o commit de correção atual `9b56031ac2` executou `pnpm bootstrap:with-remote` e o Electron real `pnpm dev:desktop`, conectando via CDP 9229 o SSH `linux-amd64-dev` (Ubuntu x64, usuário `dev`) ao Source `32a10b89-141c-469b-aa97-850f41ab7deb`. Às 15:49:40 UTC, `/home/dev/.zcode/server/bin/zcode` foi temporariamente removido e o daemon parado de forma normal pelo launcher de backup; cerca de 2 segundos depois a UI convergiu da primeira recovery diretamente para "未连接 / 远端已卸载 ZCode Server", com os 3 históricos de projeto preservados. A janela de observação de 176 segundos atravessou por completo as fronteiras de 2/4/8 segundos e de probe de 2 minutos; a UI não entrou em 2/3, 3/3 nem no offline probe, o Host publicou apenas mais um terminal close após o primeiro recoverable close e o log não teve novos registros de connect, remote-connected, upload ou recovery-budget, mantendo o remoto sempre `stopped`. Após restaurar o launcher e esperar 8 segundos, não houve ressurreição automática; o usuário clicou explicitamente em "重新安装并连接" e às 15:55:03 o estado voltou a online, permanecendo `ready` na versão 3.9.1 depois que o Desktop saiu, e o backup temporário foi removido. As evidências em screenshot estão em `packages/desktop/.e2e-artifacts/r3-issue-007-live-20260828-9b56031a/`.
- Limite de cobertura em máquina real: desta vez foram confirmados o install-required via SSH, o terminal lógico Desktop continuous e a recuperação explícita; identity-change, `retryable:false` comum e o Mobile replayable continuam cobertos pela matriz de estados focada, sem se reportar medição real usando modificação da installation identity compartilhada ou um ambiente de pareamento mobile não estabelecido.

### R3-ISSUE-008: a preferência de reconexão automática no startup é descartada pelo schema completo de AppSettings

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Causa raiz: `remoteStartupAutoReconnectEnabled` entrava apenas no patch schema; ao aplicar o patch, o SettingService executava novamente o schema completo de AppSettings e removia o `false` explícito antes de gravar em disco. O gate do Host já existia, e o julgamento original do registro ("o Host não lê") foi corrigido.
- Correção: o schema completo passa a ter um campo booleano opcional, mantendo o comportamento de configs antigas (campo ausente significa habilitado) sem disparar migração; por decisão de produto, o `remoteDefaultAssetInstallMode` global é removido de AppSettings, do patch, da página de configurações, do i18n e da cadeia de pré-preenchimento do formulário SSH. O `assetInstallMode` por linha, a persistência de Profile e o release resolver permanecem inalterados; o diálogo de nova conexão é redefinido a cada abertura para `local-download-upload`, evitando formar uma preferência oculta de "última escolha".
- Verificação: 68 itens em 6 arquivos de teste focados passaram, cobrindo schema full/patch, reconstrução do SettingService entre instâncias, o gate do Host nos três estados `false/true/undefined`, a página de configurações mantendo apenas o switch de startup, a remoção do i18n e o reset na reabertura do novo formulário; a suíte completa `pnpm test:unit` passou com 1497 files / 13271 tests (mais 1 file / 11 tests skipped), `pnpm typecheck` passou e `pnpm lint` teve 0 error (apenas warnings já existentes no repositório).
- Verificação em nível de processo: dois processos Node/tsx independentes executaram em sequência "SettingService grava false" e "novo processo relê e chama `runStartupReconnectBatch`", observando `readAfterProcessRestart=false`, enumeração de candidatos 0 vezes, 0 reconnects e resultado `[]`, provando que o fato persistido prevalece sobre o recovery do Host.
- Verificação em máquina real: no commit `645958b80b` foram executados `pnpm bootstrap:with-remote` e o Electron real `pnpm dev:desktop`, operados via CDP 9229 no SSH `linux-amd64-dev` (Ubuntu x64, `dev@localhost:2222`). A primeira conexão explícita concluiu o upload de um Source Server archive de 74.2 MB e a instalação/handshake da 3.9.1, e o Source `32a10b89-141c-469b-aa97-850f41ab7deb` exibiu "已连接"; a página de configurações passou a mostrar apenas "启动时自动重连", sem o "默认资源下载方式" global, e as opções avançadas da nova linha SSH continuaram exibindo "本地下载后上传 / 远端服务器下载" com a primeira como padrão, mantendo o `remote-download` do Profile já salvo. Após desligar o switch e reiniciar, às 16:47:02 o Host registrou `Source Server startup reconnect finished, online=0, failed=0` e a página permaneceu "未连接"; às 16:47:54 o usuário clicou explicitamente em conectar e o estado voltou a "已连接", provando que o caminho manual não é afetado pelo gate. Ao religar e reiniciar novamente, às 16:48:57 o Host registrou `online=1, failed=0`, voltando a online sem ação do usuário; os screenshots correspondentes estão em `packages/desktop/.e2e-artifacts/r3-issue-008-live-20260828-645958b8/`. Ao final do teste o Dev Desktop foi parado e o `setting.json` e `credentials.json` locais foram restaurados a partir do backup SHA-256 anterior ao teste; o switch não configurado original, as 4 Profiles e os 6 históricos foram restaurados.

### R3-ISSUE-009: não há estado terminal claro depois de esgotado o orçamento de reconstrução do bridge mobile

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Causa raiz: `scheduleBridgeRecoveryRetry()` tratava o `null` devolvido pelo backoff limitado como uma parada silenciosa, sem converter "orçamento de recuperação esgotado" em um estado terminal; nesse momento o Desktop já havia liberado o attachment antigo, mas o celular ainda mantinha o protocolo degradado, o registro de serviços e o React Root antigo.
- Correção: depois de esgotado o orçamento, reutiliza-se a fronteira de estado terminal existente `renderBootstrapFailure()`, publicando `connection-recovery-timeout` e destruindo, em sequência, o registro de serviços, o protocolo, o requester e o terminal transport, para então renderizar uma página de erro com entrada de retry em tela cheia. A recuperação normal, os orçamentos de 1s/2s/5s, o `recoveryId` do mesmo flight e a troca de geração do bridge permanecem inalterados.
- Verificação: o teste de integração da entrada do relay externo realmente conduz o bridge inicial, o hard degrade, quatro falhas consecutivas de abertura de bridge e o fake timer de 1s/2s/5s, confirmando a página de erro terminal, a limpeza do registro da remote session, a liberação de protocolo/transport, a ausência de novos envios de open após o esgotamento do orçamento e o reload manual; 12 itens dos 4 arquivos de teste relacionados passaram, `pnpm typecheck` passou e `pnpm lint` teve 0 error (apenas warnings já existentes no repositório).

### R3-ISSUE-010: o fechamento tardio da porta antiga de Source Settings pode remover o serviço da nova geração

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Causa raiz: a store do Renderer guardava apenas o `IServiceAccessor` pelo `sourceServerId`, e o close da porta removia apenas por esse ID; quando a Port B substituía a Port A, o close tardio da A removia a B corrente. O bridge usava ao mesmo tempo `connectViaMessagePort()`, que devolve apenas services e perde o handle de ciclo de vida necessário para liberar ativamente a conexão antiga.
- Correção: a entrada de registro da store carrega a identidade do attachment, os services e o disposer, usando o objeto de entrada como owner token; ao registrar a B, a B é posta como owner corrente e a A é descartada ativamente. Cada registro devolve um release vinculado à sua própria entrada, e o close só remove quando a entrada ainda é o owner corrente. O bridge do Renderer passa a usar `createMessagePortServiceConnection()`, preservando o disposer idempotente, reutilizando o registro de `attachmentId` existente e chamando o release owner-aware no close da porta.
- Verificação: novos testes de regressão de owner da store e de bridge com MessageChannel real, cobrindo A→B→A-close com a B ainda utilizável, o descarte ativo da A na substituição, a remoção apenas no close da B e a idempotência de release repetido; 14 itens dos 4 arquivos focados relacionados passaram, `pnpm typecheck` passou e `pnpm lint` teve 0 error (apenas warnings já existentes no repositório). `pnpm verify:pre-push` promoveu automaticamente para a suíte unitária completa por causa de arquivos já deletados no branch, com 1496 arquivos e 13269 itens passando; outros 3 arquivos sem relação, com 5 itens falharam por timeout sob alta concorrência; a execução isolada dos três arquivos passou com 35 itens.
- Verificação em máquina real: o commit `d8a919b7ee` executou `pnpm bootstrap:with-remote` e `pnpm dev:desktop`, conectando via CDP 9229 o SSH `linux-amd64-dev` (`dev@localhost:2222`) ao Source `32a10b89-141c-469b-aa97-850f41ab7deb`, rodando 3.9.1 no remoto. O modelo registrou primeiro o attachment `source-settings-fa670e48-...` e depois, pela cadeia real Preload → Main → Window Host, solicitou consecutivamente `source-settings-7c315610-...` e `source-settings-0e7c8ddd-...`; após a segunda troca, o Host ainda estava em `connections=1, logicalSessions=1, attachments=4`, sem crescer para 5. As chamadas `model-provider.getDisplayOrder/getAllCached/getProviderRegistrySnapshot/getAll` do attachment mais recente tiveram sucesso; após recarregar a página, o Source remoto continuou selecionado e as listas de fornecedores e modelos ficaram utilizáveis, sem entrar em loading/error. O screenshot está em `packages/desktop/.e2e-artifacts/r3-issue-010-live-20260828-d8a919b7/after-two-replacements.png`. Ao final do teste, o serviço de gerenciamento foi usado para "移除全部连接", limpando o Source/Profile/credenciais temporários e restaurando `sourceServers=[]` e as 4 Profiles originais, e o Desktop foi parado; a verificação direta via SSH do daemon remoto mostrou 3.9.1 `ready`.

### R3-ISSUE-011: a substituição lógica de múltiplos workspaces não é uma operação atômica completa

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Causa raiz: o Registry usava a entry completa do Source como unidade de rollback, mas usava o `onSessionReconnected` por workspace como unidade externa de commit; depois de publicados a generation do Controller/Main do workspace A, a falha do workspace B ainda fazia o internal session map de A voltar à generation antiga. A substituição do Controller também não tinha o commit CAS do epoch do Registry e, após a falha, ainda podia manter o provisional source/assinaturas que já perderam o logical owner.
- Correção: a substituição lógica passa a ser um prepare/commit serial por workspace. O Registry coloca no conjunto de rollback apenas o par ainda não submetido, e usa `isCurrent + commit` para promover a generation quando o snapshot do Controller tem sucesso e o epoch/owner ainda é válido; um sibling já submetido nunca mais participa de rollbacks posteriores. O Source físico permanece online quando a substituição de um único workspace falha, e o retry e o esgotamento de orçamento tratam apenas do workspace que ainda está disconnected. O Controller executa o CAS do Registry antes do commit e, em caso de falha de CAS/leitura, descarta silenciosamente o provisional source, as assinaturas e o pending replacement, preservando a projeção offline confiável da geração anterior.
- Verificação: 136 itens nos quatro arquivos de teste focados de Registry, Controller, Desktop Main attachment e Mobile replayable passaram; foram adicionadas as coberturas de falha do segundo item em dois workspaces, retry apenas do workspace não submetido, exceção na notificação após o commit, nova desconexão física após o commit e limpeza do CAS do Controller.
  `pnpm typecheck` e `pnpm lint` passaram (o lint apenas com warnings já existentes no repositório). Na reprodução mínima de runtime, o workspace A convergiu de `session-1/gen1` para `session-3/gen2/online`, o workspace B permaneceu `session-2/gen1/disconnected` e apenas B recebeu o terminal close; o Registry e a projeção externa ficaram totalmente consistentes com o sessionId/generation dos dois workspaces.
- Verificação em máquina real: o commit `927f819ca4` executou `pnpm bootstrap:with-remote` e o Electron real `pnpm dev:desktop`, conectando via CDP 9229 o SSH `linux-amd64-dev` (Ubuntu x64, `dev@localhost:2222`) ao Source `32a10b89-141c-469b-aa97-850f41ab7deb`, com upload e execução do release 3.9.1 linux-x64. Depois de abrir `/home/dev/r3-issue-011-a`, `/home/dev/r3-issue-011-b` e a Source conversation, o Host estabilizou em `connections=1, logicalSessions=3, attachments=4`. Após o primeiro `zcode restart --json` real, as três sessions antigas falharam de forma fechada e todas foram trocadas e recuperadas em cerca de 2,6 segundos. Em seguida, usando uma fault injection descartável que existia apenas nesta build de teste e foi removida depois, o primeiro `onSessionReconnected` do B foi rejeitado: A trocou uma única vez de `7b9f032a-...` para `7f940331-...` e a conversation trocou uma única vez para `d37b04dd-...`; B manteve o `eb878642-...` antigo, não gerou generation fantasma externa e, cerca de 0,5 segundo depois, trocou de geração em um retry independente para `d61d448a-...`. Durante todo o processo as logical sessions foram sempre 3, os attachments convergiram de `1 → 3 → 4` e a página de configurações final mostrou o dispositivo online e os 2 projetos ainda presentes. O screenshot está em `packages/desktop/.e2e-artifacts/r3-issue-011-live-20260828-927f819c/after-fault-recovery-settings.png`.
  Ao final do teste, a fault injection temporária, o Source/Profile/credenciais/histórico e o diretório de teste remoto foram removidos, restaurando as configurações anteriores ao teste; o daemon remoto permaneceu em 3.9.1 `ready`, com `runningTaskCount=0`.

### R3-ISSUE-012: conflito entre a especificação e a implementação de persistir a API Key do Provider em texto claro

- Severidade: P2
- Confiança: 已确认
- Estado: 不修复（premissa inválida, 2026-09-13）
- Fenômeno: a especificação principal do R3 e o gate de segurança de release exigem que a store do Provider não contenha API Key em texto claro; a implementação atual e o documento de compatibilidade degradada exigem que o Provider comum mantenha o texto claro em `config.json#options.apiKey` e escreva simultaneamente um mirror criptografado.
- Impacto: o gate de segurança de release não pode ser satisfeito junto da implementação, e desenvolvedores futuros podem fazer uma limpeza destrutiva com base em uma especificação errada ou relatar um falso positivo no Secret scan.
- Evidências:
  - [`docs/architecture/r3-source-server-remote-architecture.md`](./r3-source-server-remote-architecture.md);
  - [`../archive/remote-r3/r3-source-server-release-test-plan.md`](../archive/remote-r3/r3-source-server-release-test-plan.md);
  - [`docs/model-provider-opencode-config.md`](../model-provider-opencode-config.md);
  - `packages/services/src/model-provider/modelProviderService.ts` (removido junto com a refatoração de Provider M2).
- Condição de fechamento: esclarecer a estratégia real do período de compatibilidade; unificar a especificação de arquitetura, o documento de armazenamento e o Secret scan; se a escrita dupla continuar, deixar explícita a fronteira de segurança diferente entre o Provider comum e o Start Plan.

#### Registro de decisão 2026-09-13

- Base: a fusão da refatoração de Provider (Rota A, Q3) aceitou o Personal Config em texto claro; `modelProviderService`, o mirror criptografado `zcode.apiKeyCredentialKey` e o caminho de verificação somente-leitura do provider-sync foram todos removidos, e não há mais nenhuma referência a `apiKeyCredentialKey` no código. O §8 da especificação principal passou a "vínculo local na página de configurações + envio unidirecional pelo Provisioning" e não exige mais que a store do Provider esteja sem texto claro; o plano de teste de release que exigia esse gate foi arquivado.
- Conclusão: os dois lados do "conflito entre especificação e implementação" não existem mais, e o item é fechado como 不修复. A seção do `docs/model-provider-opencode-config.md` que descrevia esse mirror foi removida no mesmo dia.

### R3-ISSUE-013: a primeira migração do Directory pode deixar credenciais órfãs

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Causa raiz: `migrateProfileTarget()` copiava o secret legado para a nova Profile key antes do commit das settings do Directory, e `migrateLegacyRemoteEntries()` não mantinha o before state dessas escritas. Se as settings falhassem, a inicialização permitia tentar de novo com o novo `profileId`, e a key de primeira geração ficava permanentemente sem referência; quando senha e passphrase de chave privada eram copiadas em paralelo, a Promise que falhasse primeiro ainda deixava a outra escrita tardia ultrapassar o rollback.
- Correção: a primeira migração passa a ter a escrita completa do Directory como fronteira transacional de credenciais, registrando o valor antigo de cada key de destino; se qualquer credencial ou escrita de settings falhar, todas as alterações da rodada são restauradas antes do retorno; senha e passphrase de chave privada passam a ser aguardadas em sequência, com save tardio proibido. Quando `connectionProfiles` já existente é a autoridade de commit, não se copia mais secret para o Profile temporário excluído.
- Verificação: três grupos de regressão novos — rollback após falha de settings e nova tentativa com novo Profile ID, escrita tardia com falha parcial das duas credenciais e Profile temporário fora do conjunto de commit; os 38 itens de `sourceServerDirectory.test.ts` passaram, `pnpm typecheck` passou e `pnpm lint` teve 0 error (apenas os 38 warnings já existentes no repositório).
- Verificação em máquina real: o commit `8d25737576` executou `pnpm bootstrap:with-remote` e `pnpm dev:desktop`, usando CDP 9229 (após a falha de inicialização do daemon `agent-browser`, houve fallback para Playwright CDP conforme a skill do Electron) para conectar via SSH `linux-amd64-dev` (`dev@localhost:2222`, usuário `dev`) ao Source real `32a10b89-141c-469b-aa97-850f41ab7deb`; o log de UI/Host confirmou `direct-tcpip 通道已建立`, o remoto com `ZCode v3.9.1`, o handshake bem-sucedido e o link pronto.
- Reprodução isolada da migração: em um diretório de dados isolado em `/tmp` foi previamente colocada uma entry SSH legada e uma credencial legada criptografada; o primeiro boot do Desktop atingiu `setting.json` com uma fault pontual de `ENOSPC`; o log do Host registrou `Source Server directory initialization failed`, com `migrationVersion=null`, Profile/histórico 0 e apenas a key legada restante em credentials. Removida a fault e reiniciado o mesmo Desktop, o resultado final foi `migrationVersion=1`, com o Profile/histórico referenciando o mesmo Profile canônico e credentials contendo apenas as duas keys (legada + canônica) com valores descriptografados idênticos; os Profiles/Sources criados temporariamente pela validação de conexão foram limpos pela API do Directory, e o diretório isolado foi movido para `/tmp/.Trash/`.

### R3-ISSUE-014: o download do Release Resolver não tem cancelamento nem cache single-flight

- Severidade: P2
- Confiança: 高风险待复现
- Estado: 待修复
- Fenômeno: o fetch de descriptor/archive não transmite completamente o AbortSignal, e requisições concorrentes para a mesma versão/target não compartilham um single-flight, podendo operar simultaneamente sobre o mesmo arquivo de cache.
- Impacto: o download continua depois que o usuário cancela; com vários Sources baixando ao mesmo tempo, pode haver competição entre delete/download/rename, e o comportamento no Windows em especial precisa ser verificado.
- Evidência: [`packages/desktop/src/host/sourceServerReleaseResolver.ts`](../../packages/desktop/src/host/sourceServerReleaseResolver.ts).
- Condição de fechamento: adicionar testes de cancelamento, concorrência e competição de cache no Windows; downloads com a mesma cache key compartilham o flight; todos os chamadores cancelando param o fetch subjacente; publicação atômica do arquivo de cache.

### R3-ISSUE-015: o RemoteWorkspaceController ainda não é um ponto de escrita único

- Estado: 已关闭

#### Registro de correção 2026-08-28

- Causa raiz: todos os handlers do controller eram opcionais, e em produção só era montado o `open-conversation`; o Root continuava expondo à Sidebar, às Settings, ao Dialog e ao ciclo de vida de tabs callbacks dispersos de conexão, desconexão, abertura de projeto, reconexão e fechamento.
- Correção: as seis categorias de handler passam a ter tipagem forte e obrigatórias, são montadas por completo em `useRemoteWorkspaceHistory` conforme o owner de Source/attachment/persistence, em um controller único disponibilizado à UI pelo provider do Root; a conexão de um Profile comum passa a carregar uniformemente a completion intent `open-conversation`. A seleção de projeto, a desconexão de dispositivo, a reconexão de workspace e o user-close fazem dispatch antes de entrar no owner helper já existente.
- Verificação: os testes focados de controller para todas as intents/propagação de erros, o wiring de produção do Root, o disconnect das Settings e a proibição de `disconnectSource` direto na Sidebar passaram; a suíte unitária completa passou (1500 passed, 1 skipped), assim como `pnpm typecheck` e `pnpm lint`. `pnpm bootstrap:with-remote` construiu com sucesso, e `VITE_ZCODE_E2E_STORE_BRIDGE=1 pnpm dev:desktop` iniciou com sucesso, escutando o CDP 9229.
- SSH/CDP real (2026-08-28): usando o alias SSH `linux-amd64-dev` (`dev@localhost:2222`, com senha injetada pelo ambiente de teste) foi conectado um dispositivo real, com `~/.zcode/server/current.json` em `3.9.1`, dispositivo `4fedce9b49f0` e Source Server `32a10b89-141c-469b-aa97-850f41ab7deb`. Depois que a conexão comum na página de configurações foi concluída, a tab `conversation` de `/home/dev/.zcode/workspace/default` foi aberta automaticamente, com `workspaceIdentity=remote:server:<sourceServerId>:/home/dev/.zcode/workspace/default`; após a desconexão, o cartão passou de "已连接" para "未连接" e o attachment/session remoto foi liberado; ao conectar de novo, um novo `remoteSessionId` foi gerado e a conversation reaberta. Em seguida, a partir da conversation, `/home/dev` foi aberto como project, e project e conversation usaram `remoteSessionId` diferentes; pelo fechamento real da tab, disparando o user-close, o project foi removido e a conversation foi mantida.
- E2E SSH automatizado: `E2E_SSH_REMOTE_PROJECT_CONVERSATION_SCOPE` passou com 1 item, relatório [`desktop-e2e-20260828-153721-524`](../../packages/desktop/.e2e-artifacts/desktop-e2e-20260828-153721-524/summary.md). A revisão manual de pending-cancel executada na mesma rodada falhou porque o socket do proxy só fechou cerca de 1,5 segundo após a janela de asserção de 30 segundos (`desktop-e2e-20260828-153846-870`); esse caminho de falha não envolve a alteração do ponto de escrita do controller deste issue e não foi contabilizado na condição de fechamento de R3-ISSUE-015.

### R3-ISSUE-016: o RemoteWorkspaceProjection não está totalmente conectado e projeta tabs locais por engano

- Estado: 已关闭

#### Registro de correção 2026-08-29

- Estado: 已关闭
- Commit de correção: `aecaf1f410`
- Causa raiz: `buildRemoteWorkspaceProjection()` usava todos os `input.tabs` para construir `openWorkspaces`; a tab local não tem `remoteSessionId` e em seguida era marcada erroneamente como `disconnected` por `stateForOpenWorkspace()`. Ao mesmo tempo, a Sidebar, o Root e o painel de gerenciamento de Source não consumiam por completo o resultado do join da projeção.
- Correção: `openWorkspaces` passa a ser filtrado primeiro pela definição unificada de remote tab; `executionContexts` mantém todas as tabs local/remote e só associa open workspace aos contextos remotos. A Sidebar é consolidada em um único cálculo de projeção, e o conjunto de open tabs de Source do Root e os Profiles/estado agregado do dispositivo no painel de gerenciamento de Source passam a ser lidos da projeção; foram adicionados testes de regressão de tab local e de wiring de produção, e o contrato de fronteira foi escrito na especificação de workspace remoto.
- Verificação automatizada: os 6 arquivos de teste de UI afetados passaram com 56 itens; a suíte unitária completa passou com 1500 arquivos e 13290 itens (1 arquivo skipped, 11 itens skipped); `pnpm typecheck` passou; `pnpm lint` teve 0 errors (mantidos os 38 warnings já existentes). A primeira rodada de `pnpm verify:pre-push` falhou por causa de uma asserção estática antiga; após corrigir a asserção, o `pnpm test:unit` completo equivalente passou.
- Verificação de runtime: `VITE_ZCODE_E2E_STORE_BRIDGE=1 pnpm dev:desktop` concluiu com sucesso o build de Desktop/Host, o Electron escutou o CDP 9229 e o Renderer carregou a página do ZCode mostrando os workspaces de histórico local e remoto. Foi feita também a reverificação real com TabStore/Projection/Sidebar misturando tab local e remoto via SSH, detalhada no registro SSH/CDP abaixo.
- Riscos restantes: o fato real do attachment ainda não é injetado por essa projeção em todas as entradas, e os detalhes de ready/attaching do workspace remoto continuam devendo ser validados pelo ciclo de vida de cada attachment; esse risco não faz a tab local entrar em `openWorkspaces`. O relay `/remote` do celular em máquina real não está neste ambiente SSH e segue validado pelos testes mobile focados, como um item de verificação cruzada independente.

#### Reverificação real SSH/CDP 2026-08-29

- Ambiente: `pnpm bootstrap:with-remote` e `pnpm dev:desktop`; alias SSH `linux-amd64-dev`, `dev@localhost:2222`, com autenticação por senha real concluída pelo assistente de conexão.
- Resultado da conexão: o Source `32a10b89-141c-469b-aa97-850f41ab7deb` exibiu "已连接/刚刚在线"; o assistente percorreu o canal SSH, a inicialização do Server e o handshake, encerrando normalmente.
- Resultado da projeção: o TabStore real leu 13 workspace tabs (6 local, 7 remote); após carregar dinamicamente o `buildRemoteWorkspaceProjection` atual, obtiveram-se 7 `openWorkspaces`, sem local em `openWorkspaces`; os 6 `executionContexts` locais não têm `attachmentState` e os dois IDs de Source SSH foram preservados corretamente.
- Resultado da Sidebar: ao alternar para a visão de projetos, o DOM real passou a mostrar "本机", dois grupos de Source conectados e dois grupos pending desconectados; o workspace local não foi desenhado como grupo remoto desconectado.
- Desconexão/reconexão: após clicar em "断开" no `4fedce9b49f0 · dev`, o cartão passou a "未连接", as remote tabs correspondentes foram mantidas e a linha da projeção passou a `disconnected`; após clicar em "连接" novamente, o cartão voltou a "已连接" e o `remoteSessionId` dos três workspaces-alvo foi restaurado.
- Painel de gerenciamento de Source: o cartão real mostra `dev@localhost:2222`, `online`, `2 个项目`, e o estado do dispositivo e o fato do Profile foram renderizados normalmente.
- Limites: o runtime usou apenas o attachment `desktop-continuous`; nenhum Host/Agent adicional foi criado. O relay `/remote` real do celular e a denylist mobile de gerenciamento de Source não estão neste ambiente SSH e continuam validados pelos testes mobile focados.

### R3-ISSUE-017: o estado e o nome do cabeçalho do grupo de Sources no celular podem degradar e ficar distorcidos

- Severidade: P2
- Confiança: 高风险待复现
- Estado: 待修复
- Fenômeno: o celular não consegue ler o management channel exclusivo do Desktop e só consegue agrupar pela workspace identity, ficando sem o displayName e o estado agregado do Source.
- Impacto: mesmo com o attachment de fato disponível, ainda pode ser exibido um "远程设备" ou "未连接" genérico; as tarefas são operáveis, mas o texto de status é enganoso.
- Evidência: a origem dos dados da projeção de workspace do celular e da UI de agrupamento de Sources não tem campos autoritativos de display/status.
- Condição de fechamento: sem abrir as capacidades de gerenciamento de Source, projetar via o attachment de workspace já existente os fatos de exibição somente-leitura necessários do Source; adicionar testes de exibição mobile de online/offline/recovering.

### R3-ISSUE-018: a nova UI remota tem tamanhos arbitrários e alpha ad-hoc

- Severidade: P2
- Confiança: 已确认
- Estado: 待修复
- Fenômeno: no novo assistente ainda existem escritas como `rounded-[14px]`, `rounded-[10px]`, `size-[22px]`, `border-warning/35` e `border-success/35`.
- Impacto: não está de acordo com as regras de radius/size fixos e de semantic surface token do [`DESIGN.md`](../../DESIGN.md) raiz, e a manutenção visual do tema e das telas seguintes tende a derivar.
- Evidência: valores Tailwind arbitrários no assistente remoto, no status de conexão e na UI de continuity.
- Condição de fechamento: substituir pelos tokens/dimensões de componentes já existentes no repositório; adicionar evidência de contraste/regressão visual em múltiplos temas para os tokens de descriptor e para o continuity panel.

#### Registro de correção 2026-08-29

- Estado: 待验证
- Commit de correção: `b53f1652c4`
- Causa raiz: os pixels exatos do protótipo e os contornos translúcidos entraram diretamente nas classes JSX da UI remota, contornando os tokens existentes de radius/size/semantic surface; os testes de layout existentes ainda tratavam parte das classes arbitrárias como saída esperada.
- Correção: os cartões de modo de conexão remoto passam a usar `min-h-32`, `rounded-lg`, `rounded-md` e `size-5`; o painel de conexão, o LinkRail, o ponto offline das Settings e o diálogo de fronteira de Source passam a usar de forma unificada os tokens semânticos de borda/superfície já existentes, removendo o alpha no nível de componente e os valores fixos de 340/180px; foi adicionada uma verificação de conformidade de tokens da UI remota, com testes de resolução e contraste dos tokens de descriptor/continuity nos quatro temas.
- Verificação automatizada: os 6 arquivos de teste de UI relacionados passaram com 37 itens; o `pnpm test:unit` completo passou (1501 files / 13293 tests, 1 skipped file / 11 skipped tests); `pnpm typecheck` passou; `pnpm lint` teve 0 error (38 warnings já existentes).
- Verificação de runtime: no ambiente de teste do Electron, via CDP 9229, foram verificadas as etapas de dispositivo/modo de conexão da página de configurações e do diálogo de conexão, com os screenshots Zai Light/Zai Dark arquivados em `packages/desktop/.e2e-artifacts/r3-issue-018-live-20260829/`; nos screenshots, os descriptors SSH/WSL/Docker e os tokens de status são exibidos normalmente.
- Riscos restantes: o painel de estado connecting e o diálogo de continuity ainda não foram capturados separadamente na sessão Electron atual; o contraste dos tokens semânticos já tem cobertura automatizada, mas ainda falta o artifact visual final dessas duas situações para fechar o issue.

### R3-ISSUE-019: divergência de estado entre arquitetura, planos, coverage e registros reais

- Severidade: P2
- Confiança: 已确认
- Estado: 修复中
- Fenômeno: a especificação principal, o completion plan, a especificação de conversation, a especificação de UI, o release plan, a coverage matrix e os registros de máquina real usam respectivamente, com termos diferentes ("em design", "em implementação", "código concluído", "já testado em máquina", "partial/planned"); alguns documentos de build ainda descrevem manifest/components legados.
- Impacto: não é possível julgar de forma confiável qual é o fato atual e o que falta para o release, e artefatos ou arquiteturas antigas podem ser usados por engano.
- Evidências:
  - [`r3-source-server-remote-architecture.md`](./r3-source-server-remote-architecture.md);
  - [`../archive/remote-r3/r3-source-server-remote-completion-plan.md`](../archive/remote-r3/r3-source-server-remote-completion-plan.md);
  - [`remote-domain-simplification-and-conversation-workspace-spec.md`](./remote-domain-simplification-and-conversation-workspace-spec.md);
  - [`../archive/remote-r3/r3-source-server-release-test-plan.md`](../archive/remote-r3/r3-source-server-release-test-plan.md);
  - [`../testing/conversation-session-e2e-coverage-matrix.md`](../testing/conversation-session-e2e-coverage-matrix.md);
  - [`../archive/remote-r3/r3-source-server-expanded-live-test-record-2026-08-21.md`](../archive/remote-r3/r3-source-server-expanded-live-test-record-2026-08-21.md).
- Condição de fechamento: estabelecer uma entrada única de estado do candidato atual, registrando o estado da especificação, o candidate SHA, os resultados automatizados, o artefato de máquina real, os ambientes bloqueados e a conclusão de release; os demais documentos referenciam essa entrada e não mantêm mais separadamente um estado atual divergente.

#### Registro de correção 2026-09-13

- Feito: foi adicionado `docs/remote/README.md` como porta de leitura da cadeia principal remota e registrado no AGENTS.md; o §1 da especificação principal passou a "已实现（基线 `fad93b9e57`）", o §7.1 (gate de reconexão no startup) passou a usar o campo `lastOnlineAt`, foram adicionados o §8.4 (contrato de gerenciamento de dispositivos), o §9.1 (inventário por tabela do lado de controle) e o §15 (itens remanescentes da fusão de Provider); a especificação de simplificação de domínio marca as Phases 0–4 como implementadas; a descrição de gate de `desktop-remote-session-renderer-reattach.md` passou a "gate de 7 dias no nível do Host no dispositivo + Renderer não filtra pelo histórico de connected"; 18 documentos de processo/revisão/registro de máquina real foram movidos para `docs/archive/remote-r3/` e todos os links de entrada (incluindo `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml`) passaram a apontar para o caminho arquivado; o §11–§19 de `r3-remote-ui-redesign.md` (log histórico) foi removido e o protótipo foi marcado como não versionado; `zcode-agent-remote-deployment.md` e `server-remote-workspace-connection.md` receberam notas sobre o estado da cadeia principal antiga; a coverage matrix corrigiu a referência a spec inexistente de SSH-P0-LIFE-03.
- Não feito: a entrada unificada de estado de release "candidate SHA + resultados automatizados + artefato de máquina real" ainda é dividida entre este documento e `docs/testing/r3-remote-full-rerun-2026-09-10.md`; depois que R3-ISSUE-001 / 020 forem fechados, basta acrescentar a conclusão de release neste documento para encerrar este item.

### R3-ISSUE-020: registros históricos de máquina real não provam o HEAD atual

- Severidade: P1
- Confiança: 已确认
- Estado: 待验证
- Fenômeno: os commits vinculados aos registros reais de SSH e de extensão não são ancestrais do HEAD atual; o branch atual alterou depois o auto-upgrade, a recuperação de workspace, o conversation, o OAuth, o Team Plan e o mobile bridge.
- Impacto: os registros históricos provam modos de falha e capacidades iniciais, mas não podem servir como assinatura de release do candidato atual.
- Evidências:
  - linha de base do registro SSH `d684ee1af7`;
  - linha de base do registro expandido `069250a399`;
  - linha de base atual `ed0fe80b1391`;
  - o release plan ainda tem lacunas de WSL, launchd, celular físico, estabilidade prolongada e artefato do commit atual.
- Condição de fechamento: executar e arquivar no SHA final do candidato os testes necessários de SSH, Docker, Windows WSL, Mobile, atualização, desinstalação/reinstalação, permission/elicitation e recuperação; artefatos autocontidos e que possam ser revisados de forma independente por outras máquinas; coverage matrix e resultados sincronizados.

### R3-ISSUE-021: a desconexão durante a gravação do handshake é descartada e a conexão morta é publicada como online

- Estado: 已关闭

#### Registro de correção 2026-09-13

- Causa raiz: o evento close era roteado pela chave do Source em vez da identidade da conexão, e o estado "conexão já fechada mas ainda não publicada" não tinha onde ser carregado.
- Correção: `connectOnce` só entrega o close a `handleUnexpectedClose` depois de registrar a conexão como owner online, e passa o objeto de conexão; um fechamento anterior à publicação apenas registra o motivo, e o ponto de publicação verifica essa marca depois do join do sibling, descartando-a com dispose e lançando um erro de fechamento em fase de handshake com `retryable:true`, seguindo o caminho existente de falha de connect. `handleUnexpectedClose` confere `online.connection === connection`, e um close tardio ou pertencente a outro owner é simplesmente ignorado. O §7.1 da especificação principal ganhou o item "desconexão antes da publicação".
- Verificação: `sourceServerConnectionManager.test.ts` ganhou 3 casos (fechamento em fase de handshake → failed retryable, join de owner com fechamento em fase de handshake no sibling, fechamento em fase de handshake na escada de retry avançando para o próximo degrau), que falhavam antes da correção e, depois, os 37 itens passaram; `sourceServerHostReleaseWiring.test.ts` passou; `pnpm typecheck`, `pnpm lint` (0 erros) e `pnpm architecture:check --changed` passaram. Não foi feita injeção de falha de runtime com SSH/Docker reais.

### R3-ISSUE-022: o archive remoto não tem o MCP runtime dos plugins android-emulator / ios-simulator

- Estado: 已关闭

#### Registro de correção 2026-09-13

- Estado: 已关闭
- Causa raiz: ao remover a cadeia legada de assets, a responsabilidade de "construir e afirmar o MCP runtime dos plugins oficiais" não caiu em nenhuma etapa da nova cadeia de staging.
- Correção: a lista de MCP runtime de `scripts/build-desktop-agent-cli.mjs` passa a incluir `@zcode/android-emulator-plugin` e `@zcode/ios-simulator-plugin`, sendo esse script a única entrada de build compartilhada pelo staging do desktop e do Source Server; após copiar cada plugin, `stage.ts` acrescenta `assertOfficialPluginRuntime`, que lança erro se o manifest estiver ausente ou se o arquivo `${ZCODE_PLUGIN_ROOT}/...` referenciado por `mcpServers` não existir. A spec do R2 ganhou o item "invariante do MCP runtime dos plugins oficiais".
- Verificação automatizada: `packaging.test.ts` ganhou 2 casos fail-closed (sem entrada de MCP, sem manifest), que falhavam antes da correção e passaram depois; os casos existentes de staging de plugins receberam a asserção de que `dist/mcp/server.js` é empacotado; as asserções da lista em `runtime-asset-scripts.test.ts` foram sincronizadas.
- Verificação de runtime: após remover localmente `apps/zcode-cli/packages/{android-emulator,ios-simulator}-plugin/dist` e executar `pnpm --filter @zcode/server-cli stage --target linux-x64`, a cadeia de build reconstruiu de fato os dois plugins e, dentro de `zcode-server-linux-x64.tar.gz`, o `runtime/packages/*/dist/mcp/server.js` dos quatro plugins MCP existia, em cerca de 1 minuto. O `build:remote:assets` real da CI não foi executado.
- Riscos restantes: `stageRelease` agora valida todos os diretórios `*-plugin` copiados; se no futuro houver um plugin oficial que declare `mcpServers` mas não esteja na lista de build, o staging falhará explicitamente em vez de ficar silenciosamente incompleto, o que é o comportamento esperado.

### R3-ISSUE-023: conexão manual bem-sucedida no estado de recuperação não emite reconnect e o Registry fica parado em recovering

- Estado: 已关闭

#### Registro de correção 2026-09-13

- Estado: 已关闭
- Causa raiz: a responsabilidade de publicar o evento de reconexão estava distribuída por três chamadores, em vez de estar no ponto único de publicação do Manager, que é quem sabe a transição "não online → online"; o novo caminho manual de `connect()` não replicou essa responsabilidade.
- Correção: o ponto de publicação de `connectOnce` usa `reconnectInputs.has(sourceServerId)` (escrito na primeira publicação, removido na desconexão explícita) para determinar "publicar de novo"; quando acerta, dispara uma única vez `onDidReconnect` depois de `setState(online)`; o `.then(fire)` de `scheduleOnlineRetry` e `enterOfflineProbe` e o fire explícito de `updateServer` foram removidos, evitando disparo duplo. O comentário de takeover do Registry foi atualizado. O §7.1 da especificação principal ganhou o item "fonte única da verdade de `onDidReconnect`".
- Verificação: `sourceServerConnectionManager.test.ts` ganhou 2 casos (conexão manual durante retrying e durante offline, ambos disparam uma vez e os timers seguintes não disparam), que falhavam antes da correção e, depois, os 39 itens passaram; `windowRemoteConnectionRegistry.test.ts` e `sourceServerHostReleaseWiring.test.ts` passaram (3 arquivos, 85 itens); `pnpm typecheck` e `pnpm architecture:check --changed` passaram; o oxlint não reportou erros nos arquivos alterados. O E2E do Electron e a injeção de desconexão com SSH/Docker reais não foram executados; não foi escrito teste de integração para a articulação wrapper do Host → Registry.
- Mudança de comportamento: quando diferentes Profiles reconectam manualmente a um Source em recuperação, o wrapper antigo agora recebe primeiro o reconnect e devolve a entry para online, e a entry provisional passa pelo ramo de join em vez do ramo de takeover; o resultado dos dois caminhos é a mesma entry canônica única. O `updateServer` não dispara mais reconnect para Sources que nunca ficaram online (antes não havia consumidor).

### R3-ISSUE-024: no modo não `--exec` do `wsl.exe` o shell padrão expande as variáveis de comando antes da hora e o install do WSL reporta falsamente "远端缺少 tar"

- Severidade: P0
- Confiança: 已确认
- Estado: 待验证
- Fenômeno: ao conectar do Windows 3.12.0 (`0d926421`) ao Ubuntu no WSL, o diálogo de cinco etapas reportou, na etapa "部署 ZCode Server", que "远端服务器缺少 tar，无法解压 ZCode Source Server。请安装 tar 后重试。"; na mesma máquina, a cadeia principal antiga 3.12.1 online conecta normalmente. No log, antes de `[connect-remote] caught error` não há nenhuma mensagem de deploy, e o ponto de falha é a pre-verificação `detectRemoteTarTool` do ramo de upload local de `transportAdapter.installOrUpdate`; essa pre-verificação exige código de saída 0 no remoto, então só pode ser o caso "o script foi bem-sucedido mas `tar=` ficou vazio".
- Causa raiz: `WSLBackend.exec` / `execDirect` iniciam com `spawn("wsl.exe", ["-d", distro, "-u", user, "--", "bash", "-lc", command])`. O Node coloca aspas duplas nos argumentos com espaços/aspas e escapa as aspas duplas internas; sem `--exec`, o wsl.exe entrega toda a linha de comando original após o `--` ao shell padrão do usuário para execução com `-c` (no branch não exec da microsoft/WSL, `WslClient.cpp` usa a commandLineString inteira como argv[0], executada pelo shell padrão do usuário com -c). Quando o bash externo analisa essa string com aspas duplas, ele expande `"$tar_tool"` primeiro para string vazia, e o `bash -lc` interno recebe de fato `printf 'tar=%s\n' ""`; o remoto imprime `tar=` e sai com código 0, e a pre-verificação conclui que falta tar. O mesmo mecanismo também faz o loop de limpeza de staging obsoleto de `installOrUpdate` (`$candidate`, `${name##*-}`) e a verificação de vivacidade de `$status_pid` em `probeSourceServer` falharem silenciosamente no WSL. A cadeia principal antiga só referenciava variáveis de ambiente do tipo `$HOME` (cujo resultado de expansão externa é o mesmo), e o lock de deploy (`77433f1616`) e a escrita do agent wrapper faziam cada um seu próprio contorno em disco, por isso nunca ficou exposto.
- Evidência: uma sonda isolada com o `detectRemoteTarTool` real + as regras de `quote_cmd_arg` do libuv + `$SHELL -c <cauda original>` reproduz de forma estável o mesmo erro (stdout `tar=\n`, exit 0); ao trocar para o argv direto do `--exec` ou para o wrapper `/bin/sh -c '…'` do backend SSH, o resultado é `tar=tar`. Os 6 itens do `remoteAssetPreflight.test.ts` atual passam, porque o backend falso devolve direto o texto correto e não cobre a cadeia de aspas.

#### Registro de correção 2026-09-14

- Estado: 待验证
- Commit de correção: os commits que contêm este registro em `feat/multi-device-remote-3-real-ssh-feature` (`fix(remote): run wsl.exe commands in --exec mode so the default shell cannot pre-expand them`)
- Causa raiz: ver acima; a fronteira de responsabilidade é a forma como o `WSLBackend` entrega comandos ao wsl.exe, e não o preflight nem o texto do erro.
- Correção: o separador de `buildWslArgs` muda de `--` para `--exec`. O wsl.exe analisa o argv com `CommandLineToArgvW` e faz exec direto de `bash -lc <command>`; essa análise é a inversa das regras de aspas do Node, e os bytes do comando chegam intactos ao bash; o ambiente de login continua sendo fornecido pelo `bash -lc` explícito. `exec` (deploy, fluxo de upload) e `execSimple` / `execDirect` (resolução de identidade, `uname`, sondagem de proxy) passam a valer ao mesmo tempo; o preflight, o texto do erro e os caminhos de escrita existentes do lock de deploy/agent wrapper permanecem intocados.
- Verificação automatizada: `packages/server/test/wslBackend.test.ts` ganhou o caso "exec e execSimple passam o argv direto com --exec e o comando não é reanalisado pelo shell padrão", e as 3 expectativas do argumento `--` foram alteradas para `--exec`; antes da correção 3 casos falhavam e, depois, 18 passaram. `wslProxy`, `remoteAssetPreflight`, `sourceServerTransportAdapter`, `remoteDeployLock` e `remoteAssetInstaller` somaram 75 itens em 6 arquivos, todos passando; `tsc -b packages/server`, `pnpm architecture:check --changed`, oxlint e oxfmt passaram. Sonda isolada: `buildWslArgs` real → aspas do libuv → análise de volta ao argv pelas regras de `CommandLineToArgvW` → exec direto, com consistência byte a byte no retorno para as quatro comandos reais (tar preflight, preflight completo de assets, probe do Source Server e sondagem do gateway WSL); o `detectRemoteTarTool` real retorna `tar` e o `probeSourceServer` faz o parse normalmente.
- Verificação de runtime: não executado em Windows/WSL reais. Condição de fechamento: em máquina Windows real, conectar ao Ubuntu do WSL com esta correção e fazer o diálogo de cinco etapas chegar a "链路就绪", com o diretório obsoleto `~/.zcode/server/.bootstrap-*` sendo limpo e, com `status.json` vivo, o `ensureDaemon` não repetindo `serve --daemon`.
- Riscos restantes: o `--exec` exige que o PATH dentro da distro resolva `bash`, o que é consistente com a dependência existente de `bash -lc`; scripts antes mascarados pelo shell externo (limpeza de staging obsoleto, verificação de `$status_pid`, linhas `route=` do gateway) passam a ser executados de fato pela primeira vez no WSL, com semântica idêntica à do caminho SSH. Se o shell padrão do usuário não for um shell POSIX, o caminho antigo falhava com código de saída diferente de zero; o novo caminho não passa mais por ele.

### R3-ISSUE-029: a substituição em curso não preserva o reconnect seguinte

- Estado: 待修复, a temporização atual de produção não foi acionada; registrado em 2026-10-11, linha de base da revisão `f5c233df918e` (CR-02).
- Local da responsabilidade: `handleConnectionReconnected` em `windowRemoteConnectionRegistry.ts`. Com um flight já existente, ele retorna diretamente; quando o flight termina como stale, não há retry nem nova verificação de se um reconnect novo foi recebido.
- Evidência: sondas de passagem executam o Registry real, o ChannelClient e a articulação Manager + Registry. Somente ao injetar, durante a substituição, uma espera independente da conexão antiga, o segundo reconnect é descartado e o esperador permanece pending. Na ordem de produção, com o descarte da conexão antiga e a rejeição de RPC antes, o flight antigo converge no mesmo tick e o reconnect de 2 segundos depois recupera normalmente.
- Tratamento atual: apenas registrado, sem acréscimo de estado de runtime. Se a substituição passar a ter esperas que não terminam com o fechamento do transport, este item deverá ser reavaliado.
- Fronteira da correção futura: a entry registra o reconnect pendente, limpo no fechamento de estado terminal; depois que o flight antigo termina, a execução é refeita em série. Não se deve executar duas substituições em paralelo, pois o rollback opera sobre o estado de nível da entry.
- Condição de fechamento: cobrir a espera independente atravessando duas reconexões, o fechamento de estado terminal, o rollback tardio e a convergência de desconexão de RPC real; a entry compartilhada mantém apenas uma geração de owner de recuperação.

### R3-ISSUE-030: a espera pela atualização compartilhada do Provider não está ligada ao cancelamento por chamador

- Estado: 待修复, não há chamador de produção que passe signal; registrado em 2026-10-11, linha de base da revisão `f5c233df918e` (CR-07).
- Local da responsabilidade: `generateWorkspaceText` / `testProviderModelConnectivity` em `zcodeAgentService.ts` não consomem signal enquanto esperam `ensureAccountProviderConfigSynced`.
- Evidência: em uma sonda com o Service real, após o cancelamento a espera pela atualização ainda termina e só então encerra com AbortError; o cliente de protocolo verifica o signal antes de enviar as requisições seguintes, portanto não executa requisições de modelo já canceladas. Essa evidência prova atraso na convergência, não a invalidez do cancelamento.
- Tratamento atual: apenas registrado. Quando o primeiro chamador de produção que suporta cancelamento for conectado, o cancelamento será posto em disputa com o signal de um único esperador; a atualização compartilhada `accountConfigSyncByClient` continua até o fim, e um chamador não pode cancelar a atualização de que os demais dependem.
- Condição de fechamento: quando um esperador cancela, a rejeição é imediata, os demais esperadores ainda conseguem concluir, as requisições de modelo já canceladas não são enviadas e a falha da atualização compartilhada continua sendo propagada aos chamadores não cancelados.

## Tópicos posteriores de experiência de conexão (fora do escopo de RDUX)

Origem: [体验优化范围外](../issues/remote-connection-ux/01-remote-connection-ux-optimization.md#out-of-scope). Nenhum deles foi incluído na implementação do RDUX-03, e nenhum modifica a máquina de estados ou o protocolo de recuperação do celular.

| ID           | Tópico posterior                                                                | Estado   |
| ------------ | ------------------------------------------------------------------------------- | -------- |
| R3-ISSUE-017 | Exibição distorcida do nome e do status do dispositivo Web no celular; reutilizar o issue existente e avaliar a exibição no celular separadamente | 待修复 |
| R3-ISSUE-025 | Busca, filtro e agrupamento para mais de 20 dispositivos/projetos                   | 待修复  |
| R3-ISSUE-026 | Timeout de desconexão por ociosidade quando o dispositivo está online mas não há projeto aberto | 待修复 |
| R3-ISSUE-027 | Atribuição de escopo local/remoto unificada nas seções de configurações           | 待修复  |
| R3-ISSUE-028 | Verificação do comportamento real dos hooks sob escopo remoto                     | 待验证  |

## Trabalho restante

- Verificação de release: R3-ISSUE-001, 020; verificação em máquina real de WSL: 024. A aprovação histórica da automação não substitui a verificação do candidato final / da plataforma correspondente.
- Pendentes de correção ou de reprodução: 014, 017, além dos tópicos posteriores 025–027.
- Pendentes de verificação: 018, 028; conferência de documentação e de estado do coverage: 019.
- Itens posteriores condicionais: 029, 030; a implementar somente quando a premissa de acionamento de cada um mudar ou quando houver novos chamadores.
- Os itens fechados não entram mais na ordem de correção. A decisão de não corrigir o 012 é mantida, sem reintroduzir a solução de Provider que já saiu.
- 2026-10-10 convergência da documentação: removidos processos duplicados e regras de UI obsoletas; o 019 continua em "em correção" e não se pode inferir, por meio de uma checagem de links de documentação, que código, cobertura e evidência final de release já estão totalmente consistentes.

## Modelo de atualização de item individual

Ao corrigir um item individual posteriormente, acrescente na seção correspondente:

```md
#### 修复记录 YYYY-MM-DD

- 状态：修复中 / 待验证 / 已关闭
- 修复提交：`<commit>`
- 根因：
- 修复：
- 自动化验证：
- 运行时验证：
- 剩余风险：
```
