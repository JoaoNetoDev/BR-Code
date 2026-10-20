# Especificação da cadeia principal unificada de acesso remoto R3 Source Server

## 1. Status e escopo

- Status: implementado (baseline de código `fad93b9e57`, 2026-09-13). A verificação oficial de lançamento e a reexecução do E2E SSH real ainda estão em andamento, conforme o [registro de pendências](./r3-source-server-remote-open-issues.md) R3-ISSUE-001 / 020. Este documento é a especificação factual atual; os documentos de processo do R3 foram arquivados em `docs/archive/remote-r3/`, com o ponto de entrada de leitura em [docs/remote/README.md](../remote/README.md)
- Revisão: em 2026-09-07, após a fusão do M2 do refactor de Provider (Provider refactor M1~M4 + Remote Provider Provisioning), a semântica de configuração de modelo em §1/§2/§3.1/§6.2/§7.1/§8/§10/§11 passou a ser «vinculação local na página de Configurações + Provisioning automático de envio unidirecional»; do lado do Provider, [Remote Provider Provisioning](../remote/provider-provisioning.md) e [Fronteira de autoridade do estado do Workspace remoto via SSH](../ssh-remote-app-global-state-authority.md) são os documentos factuais; o processo de fusão e as decisões estão em [r3-provider-refactor-merge.md (arquivado)](../archive/remote-r3/r3-provider-refactor-merge.md)
- Fase: arquitetura unificada multi-dispositivo de acesso remoto R3 / D5—D11
- Forma de lançamento: SSH, WSL e Docker migram para a nova cadeia principal na mesma versão do App; sem versionamento nem rollout gradual por forma de conexão; dentro do App R3 não se mantém nenhuma cadeia principal remota antiga executável
- Objetivo central: introduzir Source Server, `sourceServerId`, Connection Profile, Transport Adapter, autoridade do Source, migração de identidade e compatibilidade de versão, para que as três formas de conexão completem o ciclo de produto sobre a nova cadeia principal «Local Host de nível de janela (R1) ↔ ZCode Server daemon residente (R2)»

Este documento parte de:

- [Arquitetura e solução de produto de conexão remota unificada multi-dispositivo do ZCode (rascunho de revisão)](https://internal-docs.example.invalid/redacted)（definições D5—D11）
- [Especificação de refactor do processo único de Host em nível de janela do R1](./r1-single-window-host-refactor.md)（implementado, fato da arquitetura atual）
- [Especificação de Server CLI e daemon independentes do R2](./r2-server-cli-and-daemon.md)（implementado; `verify-remote-ssh.mjs` é a pré-forma mínima do SSH Transport do R3）
- [Plano de teste de lançamento do R3 Source Server (histórico, arquivado)](../archive/remote-r3/r3-source-server-release-test-plan.md)：a numeração estável REMOTE-01—15 agora é suportada por [conversation-session-case-catalog.md](../conversation-session-case-catalog.md); o plano de execução atual está em [r3-remote-automation-plan.md](../testing/r3-remote-automation-plan.md)
- [Projeção de workspace remoto e compatibilidade de persistência](./remote-domain-simplification-and-conversation-workspace-spec.md)（projection unificada, open set, strict schema e itens remanescentes do R4）
- [Plano de implementação da arquitetura unificada multi-dispositivo ZCode Lite / Server](./unified-zcode-lite-server-multi-server-plan.md)（contexto da arquitetura-alvo）
- [Abstração de Remote Target](./remote-target-abstraction.md)（fatos de target/backend da cadeia principal antiga existente)

Entregas do R3:

- Modelo de domínio remoto e protocolo: `SourceServerRecord`, `ConnectionProfile`, `sourceServerId`, compatibility manifest, schema de handshake/migração/sincronização (D5);
- Framework de Transport e os três Adapter SSH, WSL e Docker: responsáveis apenas por descoberta, instalação, inicialização e transporte (D6);
- Handshake estável de `sourceServerId`, mesclagem de Profile, roteamento de escrita do Source e migração de identidade (D7);
- Cadeia principal remota unificada: as três formas de conexão passam a conectar ao Server daemon residente, removendo a antiga cadeia principal de negócio «implantar um zcode-server stdio temporário»; registros de conexão antigos e dados remotos antigos concluem a migração (D8);
- Ciclo de vida e recuperação: reconexão automática na inicialização, retentativas de desconexão em modo online, sondagem offline, recuperação de dados após desconexão e recuperação de requisições pendentes de confirmação (D9);
- Compatibilidade de versão e atualização: compatibility manifest nas duas pontas, atualização apenas da ponta antiga, atualização remota completa do Server CLI e novo handshake (D10);
- Superfície de produto multi-Source: página de gerenciamento de conexões, identificação da origem de projetos e tarefas no modo lado a lado, aviso de execução contínua não bloqueante e interação completa de atualização (D11). A configuração de modelo e as informações de login **não** oferecem mais seletor de dispositivo nem entrada de «sincronização em um clique»: o Provider Provisioning faz o envio unidirecional automático na primeira conexão / reconexão / após salvar com sucesso localmente; «模型设置» na página de Configurações fica sempre vinculado ao Environment local (decidido na fusão do M2 do refactor de Provider em 2026-09-07, rota A; ver §8.2, §8.3 e [Remote Provider Provisioning](../remote/provider-provisioning.md)).

O R3 não entrega:

- Nova entrada Direct URL (a conexão direta `kind: "server"` permanece como entrada de depuração dev-only, sem entrar na superfície de produto da primeira fase);
- Controle remoto entre redes, novas capacidades de produto Mobile, notificação de conclusão de tarefa (os limites existentes de attachment por QR code no celular e replayable devem regredir sem degradação);
- Sandbox exclusivo para celular; protocolo de anexos em Resource Store (mantém-se o contrato existente prompt-attachment-transfer);
- Retomada automática de tarefas em execução após crash do Server/Agent; edição remota da configuração de modelo, sincronização inversa (remoto → local) e UI de gerenciamento de configuração remota (o remoto é apenas uma imagem de execução descartável da configuração local, ver §8.3); automação remota (a agendamento por cron continua sendo uma capacidade do workspace local, com o agendador no Host da janela);
- Desktop Local Host e daemon independente na mesma máquina compartilhando o mesmo diretório de dados (explicitamente não suportado);
- Remoção do código de compatibilidade de migração de dados antigos (deixada para o R4 / D12).

## 2. Decisões centrais

| Item de decisão | Conclusão no R3 |
| ---------------- | --------------- |
| `sourceServerId` | Adota-se diretamente o `install.json.installationId` da instalação do Server remoto (já implementado no R2: UUID, geração atômica, preservado na desinstalação que mantém os dados, exposto via `/api/server-info.serverId`). Não se introduz um segundo sistema de identidade |
| Limite de identidade | `sourceServerId` representa «ambiente de Server + conta de login»: contas de OS diferentes / distros WSL / contêineres têm cada um seu próprio server root → ids naturalmente diferentes; trocar IP/domínio/porta/forma de conexão não troca o id; a desinstalação oficial mantém dados do usuário e identidade, e a reinstalação no lugar reutiliza o Source Server, o Profile e os projetos originais; a confirmação de nova identidade só ocorre quando o destino da conexão passa a ser um ambiente de dados independente. A detecção de id duplicado por clonagem do diretório de dados está fora do escopo do R3 |
| Identidade de workspace | A identidade do lado controlador é unificada como `remote:server:<sourceServerId>:<posixPath>` (reaproveitando o `buildServerRemoteWorkspaceIdentity` existente). A chave de armazenamento autoritativa no R3 **mantém o formato antigo derivado da rota, sem reescrita total**: cada path elege uma canonical key, e a nova cadeia principal roteia uniformly leitura e escrita para ela (ver §3.2/§9.2); a limpeza verdadeiramente server-local fica para o R4. O formato derivado da rota deixa de ser gerado no lado controlador, e o Host o entrega apenas como hint para a eleição da canonical |
| Topologia de conexão | O Host estabelece, via Transport Adapter, um canal de bytes até o ingress loopback remoto, sobre o qual roda exatamente a mesma cadeia de handshake HTTP+WS da conexão direta `kind:"server"` (server-info → capability ticket → `/ws/host`). `connectServerRemote` e `createServerRemoteWorkspaceServiceCollection` são o esqueleto já existente da nova cadeia principal |
| Canal do Adapter | SSH usa `ssh2 forwardOut` (direct-tcpip para uma porta loopback dinâmica remota); WSL e Docker usam uniformemente uma ponte stdio (novo comando interno `zcode server proxy-stdio`). A conexão direta via localhost do host WSL não entra na primeira fase (reduz a matriz de testes, fica como otimização de performance posterior) |
| Base de bootstrap | Reaproveitam-se as primitivas `detect/exec/upload` do `IRemoteBackend` existente (sftp do SSH, cópia direta por UNC do WSL, docker cp preservados); a orquestração de ativos legados `deployServer` é descartada por completo |
| Instalação remota | Envia-se o archive do pacote de release R2 para as seis plataformas; o remoto executa a instalação local do archive (mesma semântica immutable promote da update do R2) e em seguida `serve --daemon`. Primeira instalação e upgrade compartilham a mesma cadeia |
| Persistência do daemon | Os três Transports escolhem primeiro o modo de inicialização conforme a capacidade real do remoto: registro de OS service via launchd/systemd --user acessível (`serviceRegistered=true`); quando o gerenciador de serviços está ausente, não iniciado ou a sessão do usuário atual não pode acessá-lo, usa-se automaticamente o fallback detached (`serviceRegistered=false`). A detecção do gerenciador de serviços ter sido bem-sucedida mas o registro real falhar continua fail-closed, e é proibido mascarar permissões, descritores ou erros de sistema com o fallback. A permanência do fallback pressupõe a sobrevivência do ambiente de camada superior; após o reinício, a próxima conexão automática/manual executa novamente `ensureDaemon` |
| Autenticação do ingress | Novo token em arquivo `run/ingress-token` (0600) sob o server root. O Adapter o lê como o usuário-alvo pelo canal de transporte, e todas as requisições HTTP/WS o carregam. O «limite de posição de rede» do R2 é elevado a «limite de identidade de usuário do OS»; o mecanismo de capability ticket único do host do R2 é mantido por cima do token |
| Compatibilidade de versão | As duas pontas geram um compatibility manifest `{schemaVersion, productVersion, minCompatibleVersion}`; a ponta mais nova julga a ponta antiga a partir do manifest; atualiza-se apenas a ponta antiga. Servidores já existentes do R2 sem o campo manifest → são sempre julgados «muito antigos, precisam de atualização» |
| Atualização remota | O Desktop analisa e valida o archive de release do Server atual e executa uniformemente, via Adapter, `installOrUpdate(..., { force })`, que executa `zcode update --from-archive` (reaproveitando o running-task guard, a troca atômica e o rollback de falha do R2); a CLI da versão alvo só pode retornar `applied:true` depois de Supervisor/Core/Agent convergirem todos para o mesmo release imutável, e não pode depender da URL do manifest remoto. Depois disso, um novo handshake é feito automaticamente |
| Troca de autoridade | O daemon remoto roda com a authority `standalone-server` (o Core do R2 já é assim); remove-se a cadeia principal de provisionamento de provider do `desktop-attached-remote`. A configuração de Provider de modelo tem autoridade própria no Environment remoto (Core `createLocalServices({ providerProvisioningTargetEnabled: true, zcodeBuiltinProviderConfigFilePath })`); o Personal Layer local, o Configured Default, as configurações estreitas de conta e as credenciais de allowlist são enviados pelo Provider Provisioning de forma **automática e unidirecional** na primeira conexão / reconexão / após salvar com sucesso localmente. «模型设置» na página de Configurações fica sempre vinculado ao Environment local, sem seletor de dispositivo, edição remota e «sincronização em um clique» manual (decidido na fusão do M2 do refactor de Provider em 2026-09-07, rota A; §8.2/§8.3) |
| Coleção de serviços | As três formas de conexão adotam uniformemente o modo «total forward» (consistente com o `createServerRemoteWorkspaceServiceCollection` do server transport existente); o `LegacyRemoteWorkspaceRpcContract` é renomeado para o `RemoteWorkspaceRpcContract` versionado e passa a fazer parte da validação de handshake |
| Modelo de registro de conexão | A entidade «unificada de conexão e workspace» de `lastWorkspaceSession` é dividida em três entidades: `SourceServerRecord` (criada após o handshake), `ConnectionProfile` (linha + referência de credencial) e o histórico de workspaces abertos (referenciando as duas anteriores). As chaves de credencial migram de `remote-workspace:<workspaceKey>:*` para `connection-profile:<profileId>:*` |
| Migração de dados remotos | **O R3 não faz reescrita destrutiva de chaves.** O Server Core mantém uma camada de resolução de alias path → canonical key, executada de forma preguiçosa conforme a abertura do workspace; o histórico de uma única linha não tem nenhuma alteração de dados (versões nova e antiga leem e escrevem as mesmas linhas, e rollback e conexões mistas são naturalmente compatíveis); apenas o histórico com variantes de múltiplas linhas sofre uma fusão única para a canonical (backup + ledger), e, em caso de falha, a abertura é bloqueada na granularidade de workspace, sem bloquear a conexão. A limpeza server-local acontece no R4 |
| Coexistência de diretórios | Os ativos da cadeia principal antiga (arquivos soltos `node`, `zcode-server.cjs`, `agents/`, `tools/`, `build/` sob `~/.zcode/server`) coexistem no mesmo diretório que o layout de release do R2. A instalação do R3 não limpa os arquivos soltos antigos (protegendo o caminho de rollback de um Desktop não atualizado); a limpeza fica para o R4 |
| Reconexão automática | Na inicialização, tenta-se todas as conexões salvas ordenadas pelo último online, sem filtro de 7 dias (concorrência e orçamento por tentativa ver [contrato de recuperação atual](../remote/desktop-remote-session-renderer-reattach.md), uma tentativa cada); em desconexão online, 3 retentativas em 2/4/8s; offline, sondagem silenciosa a cada 2 minutos. Vale apenas para Profiles cujas «credenciais podem ser obtidas silenciosamente»; quando há interação necessária (senha não armazenada, versão incompatível, migração falha), o estado fica em offline aguardando o usuário |
| Modelo de janela | Mantém-se o isolamento de nível de janela do R1; a primeira fase é projetada e validada como janela única (janela principal), e a reconexão automática na inicialização é executada pelo Host da janela principal, sem promessa de produto quanto ao comportamento multi-janela |
| Automação remota | Não suportada na primeira fase. O agendamento por cron e o ciclo de vida do run hoje vivem dentro do processo Host da janela (`cronAutomationRepo`/`cronRunLifecycle`); migrá-los para o Core envolve portar o agendador, a semântica de compensação de execuções perdidas (a solução já está listada como capacidade posterior) e a multi-Source da UI de gerenciamento — mudanças independentes e não pequenas; o daemon residente já prepara o terreno para a implementação posterior, e a arquitetura do R3 não cria obstáculos |
| Rollout e rollback | Rollout por versão de App/usuário; rollback = reinstalar a versão antiga do Desktop. Com a solução da canonical key, o rollback de usuários de linha única é sem custo (zero mudança nos dados remotos); antes da fusão de múltiplas linhas, o backup + ledger permite reconciliação, ver §9.3/§9.4 |

Invariantes existentes (todos preservados):

- `workspaceKey = workspaceIdentity?.trim() || workspacePath`; o IO de caminhos continua usando `workspacePath`.
- As filas, seq, gap e limites de recuperação do `continuous` do Desktop e do `replayable` do Web no celular são mutuamente isolados; o `/remote` do celular apenas faz attachment ao Host da janela existente.
- Main e relay não mantêm estado de negócio; o `remoteSessionId` é atribuído pelo Host e continua sendo um handle de roteamento dentro da janela, sem entrar na identidade global.
- A CLI é a autoridade do corpo da Session e do estado de execução; o Supervisor não mantém estado de negócio; Tasks interrompidas por crash/update não são retomadas automaticamente.
- Secrets não entram em logs, eventos de tarefa, snapshot ou relatórios de migração.

## 3. Modelo de domínio e identidade

### 3.1 Novos tipos compartilhados (D5, ponto de chegada `packages/shared/src/source-server/`)

```ts
/** 控制端持久化：一条到达某个 Server 的线路。 */
interface ConnectionProfile {
  profileId: string; // 控制端生成的 UUID
  transport: "ssh" | "wsl" | "docker";
  target: SSHProfileTarget | WSLProfileTarget | DockerProfileTarget; // 复用现有 snapshot 字段（secret 一律 credential key 引用）
  sourceServerId?: string; // 首次握手成功后回填；未握手前 Profile 独立展示
  displayName?: string; // 用户可改；默认取 host/alias/distro/container
  lastConnectedAt?: number;
  lastConnectError?: string;
  createdAt: number;
}

/** 控制端持久化：一个已识别的 Source Server。 */
interface SourceServerRecord {
  sourceServerId: string; // = 远端 install.json.installationId
  displayName: string; // 默认 `${hostname} · ${osUser}`，用户可改
  osUser?: string;
  hostname?: string;
  lastSeenVersion?: string; // 远端 productVersion
  lastOnlineAt?: number; // 启动静默重连的 7 天门禁依据（§7.1）
  declaredWorkspaces?: Array<{ workspacePath: string; workspaceIdentity: string; label?: string }>; // 握手时整体替换的远端已知目录，≤20 条（§8.4.1）
  preferredProfileId?: string; // 用户指定默认线路；否则用最近成功线路
}

/** 控制端持久化：workspace 打开历史，stable identity 与回滚 hint 分栏保存。 */
interface SourceServerWorkspaceHistoryEntry {
  workspacePath: string;
  workspaceIdentity?: string;
  legacyWorkspaceIdentity?: string;
  profileId: string;
  sourceServerId?: string;
  lastOpenedAt: number;
}

/** 模型配置的跨 Environment 下发不在本目录定义：Envelope / Result / Trigger schema 见
 *  packages/shared/src/provider-provisioning.ts，语义见 docs/remote/provider-provisioning.md。 */

interface SourceServerResolveWorkspaceRequest {
  workspacePath: string;
  legacyRouteHint?: string;
}

interface SourceServerResolveWorkspaceResult {
  canonicalWorkspaceKey: string;
  mergedKeys: string[];
  migrationId?: string;
}

/** 双端构建产物内嵌的兼容清单。 */
interface CompatibilityManifest {
  schemaVersion: 1;
  productVersion: string; // = ZCODE_VERSION
  minCompatibleVersion: string;
}
```

Todos esses tipos são acompanhados por zod strict schema (`.strict()`), colocados no sistema `packages/shared/src/validation*` e com testes de contrato. As três formas dos parâmetros de conexão `ssh/wsl/docker` de `RemoteTarget` permanecem inalteradas e continuam sendo a entrada dos Adapter. O envio da configuração de modelo usa o `ProviderProvisioningEnvelope` (Personal Layer + Configured Default + configurações estreitas de conta + credenciais de allowlist), cujos campos e semântica transacional seguem [Remote Provider Provisioning](../remote/provider-provisioning.md); o R3 não define mais seus próprios tipos de snapshot de sincronização.

### Desinstalação com preservação de dados e reinstalação (2026-10-10)

O `sourceServerId` representa o ambiente de dados persistentes do usuário no remoto e continua tendo `install.json.installationId` como única fonte. O `uninstall` oficial limpa os ativos de execução do programa, mas preserva os dados do usuário e o `install.json`; a reinstalação reutiliza o UUID original. O App não dispara troca de identidade, não arquiva o Profile original, não adiciona dispositivos ou projetos; as tarefas originais ficam visíveis e podem continuar em uso.

```text
dispositivo / Profile / projeto / historico original
  -> uninstall: preserva dados e install.json, grava uninstalled.json proibindo a inicializacao
  -> instalacao do archive concluida: limpa a marca de desinstalacao, o handshake ainda devolve o sourceServerId original
  -> reutiliza o dispositivo, o Profile e o projeto originais, abre a tarefa original e continua a conversa
```

Quando a mesma linha realmente se conecta a um ambiente de dados independente, a confirmação de identidade ainda entra em vigor com um UUID diferente: cancelar não altera o registro; confirmar cria um novo dispositivo e um Profile independente, e a conexão original é arquivada, com a identidade dos projetos originais preservada. Os testes devem substituir o ambiente de dados por completo, e não apenas trocar o UUID compartilhando o banco de histórico. O texto de mudança de identidade expressa a mudança do destino da conexão e não descreve a reinstalação com preservação de dados como um novo dispositivo. Esta versão ainda não foi publicada, portanto não se adiciona recuperação de perda de identidade de versões antigas nem mesclagem de dispositivos duplicados do histórico. A clonagem de dados continua seguindo as restrições de escopo da §2.

### 3.2 Estrutura em três camadas da identidade de workspace

Problema atual: a identity antiga `remote:ssh:<host>:<port>:<user>:<path>` embute a linha na identidade (`packages/shared/src/remote-workspace-identity.ts`), de modo que trocar IP/alias cria uma nova key e perde o histórico; o mesmo diretório acessado por várias linhas deixa múltiplos históricos paralelos em dois bancos de dados no remoto (`~/.zcode/v2/tasks-index.sqlite`, `~/.zcode/cli/db/db.sqlite`).

A identidade do R3 é dividida em três camadas. Trade-off central: **a identidade do lado controlador é totalmente independente da rota; a chave de armazenamento no remoto mantém o formato antigo durante a janela de migração (canonical key), garantindo que o rollback / a conexão mista com um Desktop antigo leiam e escrevam o mesmo conjunto de dados**; a limpeza server-local da chave de armazenamento fica adiada para o R4 (depois da janela de suporte às versões antigas).

```text
lado controlador (Host / Renderer / bridge do celular / credential key / dedup de tab)
  workspaceIdentity = remote:server:<sourceServerId>:<posixPath>   <- independende da rota, nao muda ao trocar de linha
  workspaceKey      = workspaceIdentity
        |
        |  wire: o Host envia { workspacePath, legacyRouteHint? }
        |        legacyRouteHint = key no formato antigo construido pela linha atual (apenas para a eleicao da canonical, removido no R4)
        v
Server Core remoto (unico ponto de mapeamento: camada de localizacao de workspace)
  resolucao da canonical key: path --tabela de alias--> canonical key (formato antigo derivado da rota)
        |
        v
armazenamento autoritativo remoto (Server Core / Agent CLI / SQLite / diretorio de configuracao sessions/<hash>/)
  workspaceKey = canonical key (janela de migracao do R3) --R4--> path server-local
```

- O formato do lado controlador reaproveita o `buildServerRemoteWorkspaceIdentity({ serverId: sourceServerId, workspacePath })` existente; o julgamento por `isRemoteWorkspaceIdentity`, a propagação de `workspaceIdentity + remoteSessionId` no link do celular e o roteamento realtime de `workspaceKey + taskId` mantêm suas semânticas — apenas mudam de valor.
- Trocar de linha não troca a identity do lado controlador; no lado remoto, a camada de alias converge qualquer linha para a mesma canonical key → o mesmo histórico (REMOTE-09).
- Contas de OS diferentes → server root diferente → `sourceServerId` diferente, e os bancos de dados remotos já pertencem a contas diferentes → isolamento estrito (REMOTE-10).
- A canonical key usa o formato antigo → um Desktop de versão antiga (cadeia principal antiga) lê e escreve por chaves antigas **o mesmo conjunto de linhas de tarefas e de sessões**: após o rollback, as sessões existentes ficam visíveis e a conversa pode continuar (messages/parts são associados por session_id, com visibilidade nos dois sentidos); o hash do diretório de configuração `sessions/<hash>` não muda. A compatibilidade entre novo e antigo não depende de o código antigo entender qualquer conceito novo.
- A TUI local no remoto que abre o mesmo diretório continua usando uma path key, e por enquanto não compartilha o histórico remoto — mantém-se o estado atual, consistente com versões antigas, e a unificação acontece na limpeza do R4.
- Antes de abrir um workspace, continua-se fazendo realpath no `fileService.resolvePath` do remoto (como hoje), evitando que aliases de symlink gerem duas identidades.
- O Renderer deixa de construir a identity oficial a partir do target SSH/WSL/Docker. `bindRemoteWorkspaceSessionContext` precisa retornar o `{ sourceServerId, workspacePath, workspaceIdentity }` autoritativo depois que o Host conclui o preparo canonical e o novo attachment está pronto; tab, history, credential e o casamento de reconexão consomem uniformemente esse valor de retorno. A identity derivada da rota existe apenas como o `legacyRouteHint` interno do Host e não pode voltar ao Renderer/celular.

O seam de mapeamento do Core fica fixado assim:

- `source-server-workspace.resolveWorkspace`, após resolver o alias no remoto, registra no mapa em memória do Core o mapeamento `remote:server:<sourceServerId>:<workspacePath> ↔ canonical key`;
- O montagem do mapeamento para valores de RPC comuns fica na camada decoradora `IChannelServer` do Core remoto, que faz substituição em nível de valor da workspace identity nos parâmetros de call, nos valores de retorno e nos eventos listen de todos os channels de negócio;
- O logical frame de topic V4 é uma exceção: o wire da CLI interna do Source Server já pode ter fragmentado o payload em JSON + CRC32 + base64 segundo a identity canonical, portanto não se pode alterar apenas o fragment outer object. O seam externo do Core precisa, dentro do orçamento limitado já existente de 16 MiB/1.024 fragmentos, remontar primeiro o logical frame interno, mapear o topic, o `snapshot.workspaceId` e o `session.workspaceId`, e então refazer o JSON encode/CRC32/fragment para o wire stable externo; qualquer falha de checksum/schema/limite continua fail-closed, e é proibido um apply parcial;
- Os três topics V4 `conversation`, `sessions-index` e `workspace-config` compartilham o mesmo seam de fragment físico descrito acima. Quando o assembler devolve fault e complete na mesma leva, cada item deve ser tratado individualmente; fault ou falha na re codificação só pode enviar ao controlador um typed recovery candidate sem o payload canonical, é proibido repassar o base64 original e também é proibido deixar a exceção ultrapassar o event listener e encerrar toda a CLI runtime;
- As strings de mapeamento comuns não fragmentadas se dividem em duas categorias: ① o valor completo é igual à identity; ② valores compostos de protocolo já registrados `sessions-index/<identity>` e `workspace-config/<identity>`. Os valores compostos devem ser analisados e reconstruídos com o parser/builder codec correspondente, é proibido o uso de substituição genérica de substring, para não alterar indevidamente caminhos, logs e textos do usuário; qualquer nova string de identity composta exige atualizar esta seção e os testes de contrato do codec antes;
- Binários, `Date`, `ArrayBuffer`, typed array e outros objetos que não são plain object devem ser repassados como são; o mapeador não pode usar `Object.entries` para fazer deep copy de objetos arbitrários;
- O próprio `source-server-workspace` não passa pelo mapeamento e continua retornando a canonical key real para diagnóstico de migração; o Desktop Host não armazena nem consome a canonical key e deixa de encapsular o `IServiceAccessor`;
- Esse seam garante que a limpeza do R4 substitua apenas a implementação de mapeamento remoto, sem exigir versão coordenada de Desktop/Renderer/celular.

### 3.3 Evolução do endereço de tarefa

```ts
interface WindowHostTaskAddress {
  sourceServerId?: string; // 新增：远程 source 的稳定身份（本地任务缺省）
  remoteSessionId?: string; // 保留：窗口内连接句柄（重连后可变化）
  workspacePath: string;
  workspaceIdentity?: string; // 控制端 identity（remote:server:…）
  taskId: string;
}
```

O roteamento de escrita do Controller (pin/archive/delete/open/resume) localiza o source único por `sourceServerId + workspaceKey + taskId`; o `remoteSessionId` serve apenas para rotear a requisição para a conexão ativa dentro da janela. Após reconexão, o `remoteSessionId` muda de geração, mas a tripla estável do endereço não muda, e a semântica de substituição atômica `replaceDisconnectedSource` do R1 é preservada.

## 4. Topologia de processos e conexões

Antes da mudança (a cadeia principal remota antiga, após a conclusão do R1):

```text
Window Host（R1）
├─ LocalSource ── stdio ── local zcode-cli
└─ RemoteConnectionRegistry
   ├─ SSH entry ─ ssh2 exec ─ deployServer implanta ativos soltos ─ inicia zcode-server stdio em primeiro plano（entry-stdio）
   │                               as versoes devem ser estritamente iguais          │ SERVICE_AUTHORITY_MODE=desktop-attached-remote
   │                                                       └─ Agent CLI remoto（sai junto com o EOF da conexao）
   ├─ WSL entry ─ wsl.exe ─ idem（60s idle TTL）
   ├─ Docker entry ─ docker exec ─ idem（per-session dedicated）
   └─ Server entry ─ HTTP+WS ─ zcode-server ja em execucao /ws/host（dev-only）
identity = remote:ssh:<host>:<port>:<user>:<path>（derivada da rota）
configuracao de modelo = Desktop envia e sobrescreve o remoto
```

Após o R3:

```text
Window Host（R3）
├─ LocalSource ── stdio ── local zcode-cli（inalterado）
└─ SourceServerConnectionManager（evolucao do RemoteConnectionRegistry）
   ├─ ServerDirectory（leitura e escrita persistidas em nivel de app: SourceServerRecord + ConnectionProfile）
   ├─ uma conexao de nivel de janela por Source Server online
   │  ├─ TransportAdapter(ssh|wsl|docker)
   │  │  ├─ bootstrap: probe -> (apos confirmacao, install/update) -> ensure daemon -> le port/token
   │  │  └─ channel: canal de bytes Duplex -> 127.0.0.1:<porta dinamica> remoto
   │  ├─ handshake: /api/server-info（compatibilidade de versao + portao de migracao）-> ticket -> WS /ws/host
   │  └─ conjunto de servicos @zcode/rpc（total forward）+ multiplas logical remote session（remoteSessionId）
   │                         |
   │                         v
   │              ZCode Server daemon remoto（R2）
   │              OS service / detached ── Supervisor ── Server Core ── Workspace Agent CLI
   │              desconectar o Desktop apenas libera o attachment; o daemon e as tarefas continuam em execucao
   └─ ControllerProjection（dimensao source = sourceServerId）
```

Fechar a janela ou sair do App apenas desconecta o attachment e o canal de transporte, e nunca para o daemon remoto (REMOTE-03). Quando o mesmo Server é conectado por múltiplas janelas / múltiplos Desktops, o Core suporta nativamente múltiplos attachments, sem interferência entre eles.

## 5. Contrato do Transport Adapter (D6)

### 5.1 Interface

```ts
interface SourceServerTransportAdapter {
  readonly kind: "ssh" | "wsl" | "docker";

  /** 探测远端环境与 Server CLI 安装状态；不做任何写操作。 */
  probe(target: RemoteTarget, ctx: TransportContext): Promise<SourceServerProbeResult>;

  /** 上传发行包并以本地 archive 语义安装/升级；进度经 RemoteWorkspaceConnectionLog 结构化上报。 */
  installOrUpdate(
    target: RemoteTarget,
    release: ServerReleaseAsset,
    ctx: TransportContext,
    options?: { force?: boolean },
  ): Promise<void>;

  /** 确保 daemon 运行（serve --daemon；按远端服务管理器能力选择 service 或 detached fallback），返回 ingress 端口与 token。 */
  ensureDaemon(target: RemoteTarget, ctx): Promise<SourceServerIngressInfo>;

  /** 建立到远端 loopback ingress 的 Duplex 字节通道；上层在其上执行 HTTP/WS。 */
  openChannel(target: RemoteTarget, ingress: SourceServerIngressInfo, ctx): Promise<Duplex>;

  /** 运行远端管理命令（status/update/migrate retry/uninstall 等，一律 --json）。 */
  exec(target: RemoteTarget, argv: string[], ctx): Promise<RemoteExecResult>;
}

interface SourceServerProbeResult {
  platform: string;
  arch: string;
  installed: boolean;
  installedVersion?: string; // bin/zcode --version
  daemonStatus?: PersistedServerStatus; // status.json 读取结果（valid/missing/invalid）
}

interface SourceServerIngressInfo {
  port: number; // status.json 的动态端口
  ingressToken: string; // run/ingress-token 内容（内存态，不落控制端日志/持久化）
}
```

Restrições do contrato (independência do meio de conexão, REMOTE-15): o handshake, o conjunto de serviços, a identidade, o ciclo de vida e a semântica de erros acima do Adapter são totalmente idênticos; os testes de contrato executam o mesmo conjunto de casos sobre as implementações fake/reais dos três Adapters, proibindo que qualquer ramo de negócio específico de `kind` vaze para a camada do Manager ou acima.

O suporte às plataformas remotas permanece como está: o ambiente remoto dos três transports exige POSIX (linux/darwin), e o remoto win32 continua sendo rejeitado (a semântica de `assertSupportedRemoteEnvironment` é preservada); os assets win32 do pacote de release R2 atendem apenas ao cenário de «instalação manual do Server CLI na própria máquina», não pertencendo à matriz de conexões remotas do R3.

### 5.2 Três implementações

| Capacidade     | SSH                                                                                                                                                                               | WSL                                                                                                                                                                                                  | Docker                                                                     |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Base           | `SSHBackend` existente (ssh2; exec força `/bin/sh`)                                                                                                                                    | `WSLBackend` existente (wsl.exe -d distro -u user)                                                                                                                                                       | `DockerBackend` existente (docker exec -i)                                     |
| probe/exec     | `client.exec`                                                                                                                                                                     | `spawn wsl.exe`                                                                                                                                                                                      | `spawn docker exec`                                                        |
| Upload         | SFTP, com fallback para o pipe `cat >`                                                                                                                                               | cópia direta via UNC `\\wsl.localhost\`, com fallback em streaming                                                                                                                                    | `docker cp`, com fallback `cat >`                                          |
| canal          | `client.forwardOut` → `127.0.0.1:<port>` remoto (direct-tcpip, sem ocupar canal exec); quando o sshd desabilita o forward (`AllowTcpForwarding no`), faz fallback para a ponte stdio (mesmo comando proxy-stdio via canal exec) | ponte stdio (`wsl.exe -d <distro> -u <user> --exec bash -lc '<serverRoot>/bin/zcode server proxy-stdio --server-root <serverRoot>'`; é obrigatório `--exec`, pois `--` faz o shell padrão expandir o comando antes da hora, ver R3-ISSUE-024) | `docker exec -i <c> <serverRoot>/bin/zcode server proxy-stdio` (ponte stdio) |
| daemon residente | `serve --daemon` prioriza o registro em launchd/systemd --user; quando o gerenciador de serviços está inacessível, faz fallback para detached, e a próxima conexão fica responsável por reiniciar | fallback detached; se futuramente houver um gerenciador de serviços acessível, consome o mesmo contrato de detecção de capacidade | fallback detached; o container sai ao parar                             |
| Reuso de conexão | um único Client ssh2 para o mesmo `buildSshRemoteHostKey` (reuso de múltiplos canais exec/sftp/forwardOut)                                                                              | reuso do contexto de chamada do wsl.exe por distro+user normalizado                                                                                                                                    | reuso por container                                                        |

- `zcode server proxy-stdio` (novo subcomando interno): lê a porta de `status.json` deste root e faz um encaminhamento bidirecional de bytes puros entre stdin/stdout e `127.0.0.1:<port>`; quando o daemon não está em execução, imprime uma linha de erro estruturada e sai. Ele não chama `createLocalServices` e não mantém nenhum estado de negócio.
- O lado do Host executa requisições HTTP e o upgrade para WS sobre qualquer Duplex (`http.request`/`ws` suportam `createConnection` customizado); o fluxo de forwardOut do SSH e o fluxo da ponte stdio passam pelo exatamente mesmo código de camada superior.
- As diferenças da cadeia antiga — TTL de 60s de ociosidade no WSL e ciclo de vida dedicado por sessão no Docker — são todas abolidas: o ciclo de vida da conexão é unificado como «conexão de nível de janela ↔ daemon residente», e o start/stop do runtime do workspace passa a ser gerenciado inteiramente pelo Core remoto.
- O exec direto do Docker Backend e a leitura de caminhos relativos ao home validam a referência do container antes de chamar a CLI: após remover espaços nas pontas, ela deve casar com `^[A-Za-z0-9][A-Za-z0-9_.-]*$`, aceitando nome, ID completo e prefixo de ID; referências inválidas são explicitamente rejeitadas, sem adicionar enumeração de containers nem ida-e-volta à CLI.
- Os mecanismos de generation/fail-closed/troca de attachment em duas fases do registry R1 são preservados como são.

A determinação da capacidade de inicialização do daemon é fixa:

```text
serve --daemon
  ├─ opt-out explícito (WSL/Docker)─────────────────────► detached fallback
  └─ caminho padrão
       ├─ gerenciador de serviços de usuário do SO inacessível ► detached fallback
       │    no SSH Linux não interativo, tenta antes /run/user/<uid>/bus
       │    restaura XDG_RUNTIME_DIR/DBUS_SESSION_BUS_ADDRESS
       └─ gerenciador de serviços acessível
            ├─ register/start com sucesso────────────────► OS service
            └─ register/start falha─────────────────────► fail-closed (sem fallback)
```

- «O gerenciador de serviços está inacessível» é um fato de capacidade, não equivale a falha de instalação: é comum ao entrar via SSH em um container, em sistemas mínimos, quando o user manager não foi iniciado ou em sessões SSH no macOS sem um domínio de usuário do launchd acessível.
- O fallback automático não altera a autoridade de Source/Task/Session; a desconexão do Desktop apenas libera o attachment. O processo de fallback continua rodando enquanto o ambiente remoto viver, e é relançado pela reconexão existente ou por conexão manual após o reinício do host/container.
- No Linux via SSH, se `/run/user/<uid>/bus` existir, mesmo que o sshd não injete `XDG_RUNTIME_DIR`/`DBUS_SESSION_BUS_ADDRESS`, deve-se usar o bus daquele usuário para concluir a detecção e o registro do service; não se pode interpretar «variável de ambiente ausente» como «systemd inexistente».
- A detecção de capacidade no Linux lê `systemctl --user show --property=Version`, e só confirma o user manager acessível quando o código de saída é 0 e o atributo `Version` retornado é não vazio. Ambientes chroot/offline podem pular o comando e retornar 0; um resultado sem resposta de atributo precisa entrar no fallback detached já existente, sem depender do texto de stderr localizado e sem sobrescrever as configurações de ambiente offline do usuário.
- A detecção de capacidade mantém o timeout de processo de 2 segundos. Quando o comando é encerrado por sinal, o executor precisa fechar os pipes locais de stdout/stderr e retornar falha, sem continuar aguardando a saída do processo auxiliar D-Bus que mantém os pipes; na saída normal, ainda se aguarda o `close` para ler a resposta completa. Esse fechamento não altera a propagação de erros de registro de serviço nem cria novos caminhos de inicialização.
- Erros reais de registro após uma detecção bem-sucedida continuam sendo retornados diretamente; não se pode engolir de forma unificada erros de permissão, de arquivo de serviço ou de inicialização. O owner da inicialização do daemon continua sendo escolhido pelo Server CLI entre o OS service e o Supervisor detached, sem novos retries, cache de estado ou caminho de inicialização paralela.
- Quando `serve --daemon --json` sai com código diferente de zero, o Adapter deve priorizar a análise do `{ error, code?, retryable? }` estruturado no stdout e usar o stderr apenas como diagnóstico complementar. Warnings do Node, banner de login ou ruído de shell não podem sobrescrever o erro real da CLI.
- O resultado de `--json` do Server CLI (com sucesso ou falha) é o último objeto JSON de uma única linha no stdout; o Adapter pula as linhas de texto puro antes e depois dele ao ler o resultado. Alguns bastiões SSH mesclam o stderr remoto no stdout e o entregam só após o fim do stdout, de modo que o warning do Node pode vir depois da linha de resultado; não é possível tomar a última linha não vazia como o resultado.
- O executável de bootstrap do Source Server fica em um staging temporário dentro do root executável final (`~/.zcode/server`) e não é executado a partir do `/tmp` comum, que costuma ter `noexec`; o arquivo temporário do archive continua precisando ser limpo em caso de sucesso, falha ou cancelamento.
- O download direto no remoto exige como capacidades mínimas apenas curl/wget, tar e a ferramenta de SHA-256; awk/wc/date são usados apenas para melhorar o progresso e, quando ausentes, o progresso degrada para sem velocidade em vez de bloquear o download. O upload após o download pelo Desktop também precisa sondar o tar antes do upload, para não falhar só depois de enviar um archive grande.
- O archive traz embutida a build oficial do Node 22 para Linux, que exige linkagem dinâmica com glibc 2.28 ou superior. O probe lê `getconf GNU_LIBC_VERSION` no mesmo round-trip somente-leitura; em remoto Linux (incluindo WSL e Docker) abaixo de 2.28 (como CentOS 7, RHEL 7, Ubuntu 18.04), o probe rejeita com falha de pré-verificação, sem entrar na confirmação de instalação, no upload ou no download direto remoto, e a mensagem informa a versão medida e a versão exigida. Quando a versão do glibc não pode ser lida (musl, ausência de getconf, saída irreconhecível), não se bloqueia e a cadeia de instalação original é mantida.
- O build para macOS precisa desabilitar explicitamente os metadados bsdtar xattr/PAX ao gerar o archive POSIX; definir apenas `COPYFILE_DISABLE=1` não basta para remover `LIBARCHIVE.xattr.*`, senão a extração no Linux despeja milhares de linhas de unknown extended header por entrada e mascara o erro real.

### 5.3 Cadeia de descoberta, instalação e upgrade

```text
probe ──já instalado e daemon ready───────────────────────► ensureDaemon (reuso)
  │
  ├─ não instalado ──► exibe conta/versão/local de destino, confirmação do usuário
  │                    ──► upload do archive (pacote R2 compatível com a plataforma)
  │                          └─► instalação local do archive no remoto (immutable promote)
  │                                └─► serve --daemon ──► ready
  └─ instalado mas versão incompatível ──► fluxo de upgrade da §6.3 (mesma cadeia install/update)
```

- Origem dos pacotes de release: segue o padrão existente de distribuição de assets remotos (manifest da CDN + cache local + a opção de download direto remoto `assetInstallMode`); o conteúdo dos assets muda de «conjunto de arquivos soltos» para `zcode-server-<os>-<arch>.tar.gz` nas quatro plataformas `linux/darwin × x64/arm64`. A raiz de versão deve publicar também um `source-server-release.json` independente, registrando por target `version`, `fileName`, `sha256`, `sizeBytes` e os `urls` relativos; o Desktop e o download direto remoto precisam consumir a mesma descrição e validar o SHA-256 antes da instalação. O stage para Windows ainda pode produzir `.zip` para a validação local do R2, mas o ambiente remoto do R3 não aceita win32, que não entra no contrato de publicação do resolver de Source Server do Desktop.
- O `build:remote-assets` oficial executa apenas o stage do Server CLI para os quatro alvos, copia o descriptor/archive para a raiz de release da versão corrente e faz o upload; a partir do R3 não se constrói nem publica mais o legado `manifest-*.json` / `components/**`. A CI faz a verificação fail-closed arquivo por arquivo antes da cópia e do upload, proibindo usar o cache `dist-release` de um worktree de desenvolvimento como evidência de publicação. Os objetos legados de versões já publicadas continuam mantidos pela CDN/OSS; remover a entrada de build de novas versões não pode apagar objetos históricos.
- O `assetInstallMode` determina apenas de que lado o archive é obtido: `local-download-upload` faz o Desktop baixar, verificar e enviar pelo Backend; `remote-download` faz o alvo SSH baixar pela URL do descriptor e verificar; as duas caminhos, a partir do archive temporário remoto, precisam convergir para o mesmo `zcode update --from-archive`, e é proibido restaurar o instalador legado de componentes soltos.
- Ponto de entrada da aplicação remota: `zcode update --from-archive <path> --json` (o update do R2 ganha a origem de archive local; na primeira instalação, o bootstrap extrai `bin/zcode`). Instalação, upgrade, cache de componentes, troca atômica e rollback em caso de falha reutilizam integralmente a semântica de release já validada no R2; o Adapter não cria um segundo conjunto de lógica de instalação.
- A primeira instalação já executa `serve --daemon`: quando o gerenciador de serviços de usuário do SO está acessível, retorna `serviceRegistered=true`; caso contrário, faz fallback detached automático e retorna `false`, e o log de conexão explica claramente que «fica residente enquanto o ambiente remoto atual estiver vivo e é relançado pela conexão após o reinício».
- A política de implantação do Source Server precisa distinguir explicitamente `release-versioned` de `development-content-addressed`. As duas diferem apenas no julgamento de «é preciso atualizar»: o Desktop empacotado usa sempre a primeira, julgando somente pela compatibilidade de versão; o SSH em modo de desenvolvimento usa a segunda, e considera que é preciso atualizar quando a versão do Server é igual à versão do archive corrente, mas o `archiveSha256` difere ou a identidade remota está ausente. Com SHA igual, continua reutilizando; não é permitido espalhar esse julgamento para o estado de produção ou para WSL/Docker.
- Depois de o julgamento indicar que é preciso atualizar, a lógica de atualização das duas políticas precisa ser exatamente a mesma: o fluxo de conexão apenas coloca o Profile em `needs-upgrade + updateAvailability: required` e rejeita a conexão com `source-server-upgrade-required`, sem executar o update do archive dentro do próprio fluxo de conexão; a atualização em si é executada uniformemente por `updateSource → Manager.updateServer` da §6.3 (estado `updating`, log de operações, `force:false` primeiro, e, após o running-task guard, confirmação explícita do usuário e então `force:true`). Portanto, a atualização automática dentro do assistente de conexão, a entrada de «atualizar agora» do reconectar na inicialização/recuperação de queda e a confirmação de atualização forçada também valem para o modo de desenvolvimento. (Correção R3A-B-06: antes, no modo de desenvolvimento o `installOrUpdate` era chamado dentro do fluxo de conexão, o guard só conseguia se manifestar como uma falha comum de conexão e a UI não tinha entrada de atualização forçada.)
- A atualização de conteúdo no modo de desenvolvimento aceita apenas o descriptor/archive do staging local da rodada atual e segue uniformemente pelo upload do Desktop; mesmo que o Profile SSH salvo seja `remote-download`, ele não pode passar a obter o artefato da mesma versão pela CDN. Se o artefato local estiver ausente, a verificação falhar ou a atualização for bloqueada pelo running-task guard, a conexão precisa falhar de forma fail-closed, sem fallback para a CDN e sem continuar rodando o release antigo.
- O `bootstrap:with-remote` do modo de desenvolvimento precisa chamar a mesma entrada de staging do Source Server usada pela CI e renovar o descriptor/archive; o `bootstrap` comum continua pulando os recursos remotos. Um retorno bem-sucedido significa que todos os runtimes, plugins e archives derivados do código-fonte dos repositórios foram construídos nesta rodada, e apenas binários externos de versão fixa e verificados podem reutilizar cache. O staging começa invalidando o descriptor antigo, grava atomicamente os archives das quatro plataformas e só publica atomicamente o novo descriptor depois da verificação; em caso de falha, não pode sobrar uma generation antiga consumível por conexões de desenvolvimento. A entrada de desenvolvimento exclusiva para Linux `prepare:remote-assets:linux` reusa o mesmo caminho, construindo e publicando apenas `linux-x64` / `linux-arm64`, com o descriptor listando apenas os alvos da rodada e sem misturar entradas históricas de macOS; as convenções de ambiente e de uso estão em [Comandos de Bootstrap](../bootstrap.md).
- Os arquivos soltos da cadeia antiga em `~/.zcode/server` remoto (`node`, `zcode-server.cjs`, `agents/`, `build/`, `tools/`) convivem no mesmo diretório do layout do R2: a instalação do R3 **não remove** esses arquivos antigos — Desktops com versões não atualizadas ainda dependem deles para rodar a cadeia antiga; a limpeza pertence ao R4. A uninstall allowlist do R2 precisa ser estendida para listar esse conjunto de caminhos antigos, garantindo que o `zcode uninstall` posterior ao R3 possa limpá-los junto e registrá-los na reconciliação de `preservedPaths`.

## 6. Handshake, autenticação e compatibilidade de versão

### 6.1 Autenticação do ingress (complementando a fronteira de segurança remanescente do R2)

O loopback-only do R2 é uma fronteira de posição de rede: em um servidor multiusuário, qualquer processo local consegue acessar `/ws` e o endpoint de emissão de capabilities. O túnel do R3 expõe essa porta a «qualquer usuário ZCode que consiga se conectar a essa máquina», então é preciso fechar o escopo primeiro:

- na inicialização do daemon, um token aleatório é escrito em `<serverRoot>/run/ingress-token` (0600, rotacionado a cada inicialização do daemon);
- o ingress do Core exige `authorization: Bearer <token>` (ou `?token=`, reaproveitando o modo de transporte já implementado pelos clientes de server transport existentes) para todas as rotas `/api/*`, `/ws` e `/ws/host`; `/api/server-info` permite retorno anônimo em forma reduzida, com **apenas campos de versão e compatibilidade**, para uso nas dicas de upgrade;
- na fase de bootstrap, o Adapter lê esse arquivo pelo canal de transporte na identidade do usuário alvo — conseguir ler o arquivo 0600 prova que quem chama é o mesmo usuário do SO, elevando a fronteira de autenticação de «posição de rede» para «identidade de usuário do SO»;
- o token reside apenas na memória do Host, sem gravação na persistência nem nos logs do controlador; na reconexão do WS o arquivo é relido (o token já foi rotacionado após o restart do daemon);
- o ticket de capability de host de uso único (TTL de 30s, consumido e apagado) permanece como a segunda camada de porta de `/ws/host`, com semântica inalterada;
- `server-info.authRequired` deixa de ser o `false` fixo e passa a refletir fielmente a exigência do token.

### 6.2 Sequência do handshake

```text
Adapter                                    daemon remoto (Server Core)
  │ probe: exec bin/zcode status --json / lê status.json
  │ ensureDaemon: serve --daemon (se necessário)
  │ lê run/ingress-token (0600)
  │ openChannel ══ Duplex → 127.0.0.1:<port> ══════════════╗
  │                                                        ║
  │ GET /api/server-info (Bearer token) ──────────────────►║
  │ ◄── { serverId, version, compatibility{min…}, migration{failedPathCount}, identity{osUser,hostname}, … }
  │
  │ ① Julgamento de compatibilidade de versão (manifest da ponta mais nova, ver §6.3)
  │   → incompatível, para em needs-upgrade
  │ ② Preenchimento/validação de Profile.sourceServerId: divergente do registro existente
  │   → trata como novo Source Server e avisa
  │
  │ POST /api/rpc-host-capability (Bearer token) → ticket
  │ WS /ws/host + ticket + token ─────────────────────────►║ desktop-continuous / trusted-host-relay
  │ assertRemoteWorkspaceRpcContract (integridade do channel)
  │ → Main: ProviderProvisioningEnvironmentCoordinator.register(...).initialSync
  │   (barreira de primeira conexão, §8.3.2: só applied/already-applied publica ready;
  │    failed/rollback_failed/unsupported levam a falha de conexão)
  │ → online: registra o Controller source e lê os fatos autoritativos de tasks
  │
  │ (a resolução/mescla de canonical key não ocorre no handshake: é executada de forma
  │  preguiçosa na abertura do workspace; a falha só impede a abertura daquele workspace,
  │  ver §9.2; migration.failedPathCount serve apenas para exibir o relatório na página de conexão)
```

Extensão de `/api/server-info` (todos os campos novos são optional, `protocolVersion` permanece 1):

```ts
interface ServerRemoteInfo {
  serverId: string; // = installationId = sourceServerId
  version: string;
  protocolVersion: 1;
  authRequired: boolean;
  compatibility?: CompatibilityManifest; // R3 起必有；缺失 → 判为 pre-R3，需升级
  migration?: { failedPathCount: number }; // 多线路合并失败的 workspace 计数；仅展示，不阻塞连接
  identity?: { osUser: string; hostname: string };
  capabilities: { desktopContinuous: true; websocketRpc: true };
}
```

O Server usa auto-validação com schema estrito ao construir os próprios parâmetros de saída; ao analisar os parâmetros de entrada do wire, o Desktop/controlador ignora campos desconhecidos, garantindo que novos campos optional sob `protocolVersion=1` não atravessem clientes antigos. O server-info anônimo usa um schema separado, expondo apenas `version/protocolVersion/authRequired/compatibility`, sem forçar o schema completo de handshake.

### 6.3 Compatibilidade de versão e atualização remota (D10)

- O artefato de build do Desktop e o pacote de release do Server CLI embutem cada um seu `CompatibilityManifest`; a regra de julgamento é: pega a ponta com o `productVersion` mais novo e usa o `minCompatibleVersion` dela para avaliar a ponta mais antiga; compatível mas com versões diferentes → após a conexão bem-sucedida, exibe-se uma única vez, de forma não bloqueante, a dica «atualização disponível», mantendo-se também a entrada de atualização na página de gestão de Source; incompatível → a conexão de negócio é bloqueada, exibindo a versão atual, a versão mínima e qual ponta deve ser atualizada.
- Quando o Server é mais antigo: ao o usuário clicar explicitamente em conectar, o assistente de conexão inicia automaticamente uma única atualização protegida com `force:false`; sem Task em execução, a atualização acontece direto e a intenção original de conexão continua, e só após receber o running-task guard o usuário é consultado sobre a interrupção forçada. O reconectar na inicialização, a recuperação de queda e a sondagem offline continuam parados em `needs-upgrade`, oferecendo apenas «atualizar agora», sem atualizar silenciosamente nem exibir confirmação. O comando de upgrade tem `profileId + target` como limite de endereçamento e não exige obter `sourceServerId` por handshake prévio; como o Desktop resolve o release archive corrente e chama uniformemente o `installOrUpdate` do Adapter, o pre-R3 também consegue atualizar antes do handshake. Havendo Task em execução, o erro de guard é retornado por padrão aguardando o usuário, e só a escolha explícita de força permite continuar. **A atualização é uma operação orquestrada explicitamente**: a conexão entra no estado `updating` e pausa as retentativas passivas de reconexão; após a conclusão, um novo handshake é feito ativamente e o `sourceServerId` é preenchido, e em caso de falha são mostradas a causa e a retentativa, sem depender da sondagem passiva da §7.
- O snapshot de estado do Host é a única autoridade para o julgamento de versão e carrega de forma fixa `updateAvailability: none | available | required`, `currentVersion`, `availableVersion`, `minimumVersion`, `upgradeTarget`, `errorCode`, `retryable`; o Renderer não compara versões por conta própria.
- A falha de conexão `source-server-upgrade-required` preserva o `profileId` efetivamente usado pelo Host, validado por um schema estrito de resposta do Host e repassado pelo Main. Ela identifica apenas a linha que falhou nesta ocorrência; a elegibilidade para upgrade ainda precisa ser lida do snapshot mais recente do Host; não transmite credenciais nem adiciona estado persistido. Após a normalização dos parâmetros de WSL, o assistente continua a atualização e a reconexão usando o alvo real daquela linha, evitando que a entrada de upgrade fique sem efeito por divergência entre o usuário padrão e os parâmetros originais da UI.
- O upgrade automático é limitado pela identidade de alvo imutável do momento da falha; o `profileId` apenas identifica o registro editável. Falhas de upgrade no WSL e as esperas de instalação retornam o `resolvedWslTarget` resolvido nesta rodada. O assistente verifica primeiro o alvo do Profile mais recente e então envia `updateSource({ profileId, expectedTarget, force })`; o `expectedTarget` contém apenas endereço/porta/usuário/alias de configuração do SSH, a distro/usuário reais do WSL ou o container Docker, sem credenciais.
- O Host faz uma validação estrita em runtime do `expectedTarget` e compara o Profile atual com o alvo resolvido. A atualização usa o alvo fixo resolvido a partir do mesmo snapshot do Profile, e não pode buscar o alvo por ID depois da validação; em caso de divergência, retorna `remote-target-changed`, sem probe/install/reconnect, e a UI encerra o upgrade antigo e mostra uma retentativa explícita. Durante a confirmação do force, a identidade original continua sendo carregada. A entrada de gestão antiga, sem expectedTarget, permanece compatível; isso não altera o desktop continuous / o replayable do celular nem o owner das tarefas remotas.

```text
alvo que falhou A → validação pelo Profile mais recente na UI → expectedTarget=A
                   → validação pelo Host e fixação de A → atualização
              alterado para B ─rejeitado──────┘        alterado para B ─rejeitado──────┘
Host já fixou A → edição posterior do Profile para B → a operação em andamento continua usando A
```

- `source-server-install-required` também preserva o `profileId` real. A resposta de falha de instalação no WSL traz adicionalmente o `resolvedWslTarget: { kind: "wsl", distro, user }` com validação estrita, com ambos os campos de identidade não vazios e sem credenciais. Ele vem do alvo já resolvido desta requisição de conexão do Host, independente da prévia de instalação anexada; quando a prévia não está disponível, ainda é possível confirmar o mesmo alvo. Esse campo é preservado pelo Main, pela plataforma e pela passagem de falha do projeto original, sem alterar o cache de descoberta, a persistência, a autorização de instalação nem a fronteira de transporte desktop/célular.
- Os códigos de erro públicos são registrados uniformemente por `@zcode/shared` e consumidos por CLI/Host: o running-task guard usa `source-server-update-running-tasks` (`retryable:false`, permitindo `force` explícito do usuário), o bloqueio por incompatibilidade usa `source-server-upgrade-required`; a workspace migration e o cancelamento de bind também não devem manter listas de permissões próprias.
- Falhas de conexão/implantação são classificadas uniformemente pelo shared: recusa de conexão/inacessível, timeout, host inexistente, falha explícita de verificação de host-key SSH, download, upload, pré-verificação, instalação, espaço/permissão remotos, cancelamento e desconhecido têm todos códigos públicos. O AggregateError lê os códigos internos, mensagem vazia recebe um fallback não vazio e uma resposta de falha do Host não pode ficar pendurada por recusa de schema; o mapeamento da UI fica em português e em inglês, e códigos desconhecidos exibem um texto genérico.
- Os logs visíveis ao usuário recebem apenas o progresso explícito do pipeline; diagnósticos do console do Host e de outros serviços não são encaminhados. Caminhos absolutos, tokens, referências a credenciais e identificadores de dispositivo são uniformemente anonimizados; a espera por confirmação de instalação é info. O retorno de conexão pré-preenche esse log, sem enviar por padrão o arquivo completo de diagnóstico.
- Os campos de credencial do log de conexão também incluem todos os tipos de `apiKey` / `api_key` / `api-key`, `secret`, Authorization e Cookie / Set-Cookie; credenciais Bearer e Basic são mascarados. O valor de um Header Authorization/Cookie comum é coberto até o fim da linha, e campos estruturados com nome entre aspas são filtrados como a string de escape completa; a filtragem repetida permanece idempotente e as linhas de log seguintes são preservadas.
- O Server CLI oferece nativamente `version --json`/`--version`, e a saída de versão não pode ser delegada ao Agent `zcode.cjs`. Na sondagem de instalações pre-R3, é permitido extrair um único semver válido da saída textual antiga; quando não é possível provar a compatibilidade, entra-se de forma conservadora em `needs-upgrade`.
- Quando o Desktop é mais antigo: apenas sugere-se atualizar o Desktop, nunca fazer downgrade do Server.
- Servers R2 existentes (sem o campo compatibility) são julgados como antigos demais e seguem a mesma cadeia de upgrade; o `minCompatibleVersion` do Desktop do R3 é definido como a primeira versão de Server que carrega o contrato de handshake do R3.
- A publicação corrente não declara override de `zcodeCompatibility` no `package.json` raiz por padrão; tanto o build do Desktop quanto o do Server CLI fazem fallback do `minCompatibleVersion` ausente para o `productVersion` corrente, de modo que, por padrão, só a compatibilidade de mesma versão é prometida. Só depois de concluírem a validação do contrato entre versões e da publicação é possível declarar explicitamente um `zcodeCompatibility.minCompatibleVersion` mais baixo.
- Quando o Server é mais antigo e precisa ser atualizado, o aviso de reconexão da inicialização, o painel de falha do assistente de conexão e a página de gestão de conexões precisam oferecer «atualizar agora» no local, submetevendo uniformemente a `SourceServerManagementService.updateSource`; não se pode exigir que o usuário memorize ou procure a única entrada em Settings. Quando o Desktop é mais antigo, continua-se apontando apenas para a atualização do Desktop, sem exibir ações de atualização do Server.
- O Toast de atualização do Source Server no start/lista de tarefas usa uma variante de exibição própria: centralizado no topo, com quebra de linha completa mostrando o dispositivo e o texto de versão, além de um «atualizar agora» completo e do controle de fechar. Essa variante atende apenas ao Source Server e não altera a posição nem as regras de truncamento dos Toasts compactos de atualização já existentes, como o da aplicação Desktop.
- Depois que o assistente de conexão assume um alvo, o aviso de que o Server daquele alvo precisa ser atualizado é apresentado pelo assistente, sem repetição no Toast global; recolher o assistente mantém a assunção, e apenas sair ou trocar o alvo a libera, sem afetar os outros dispositivos nem os avisos de atualização do Desktop. O assistente publica o alvo de forma síncrona antes de iniciar a conexão e não pode esperar o `needs-upgrade` para suprimir o aviso. O Host revoga imediatamente o Toast de upgrade antigo ao entrar em `updating`, quando a necessidade de upgrade é resolvida ou quando o Profile é removido; o clique precisa reconferir o snapshot atual, e o mesmo aviso só submete uma atualização. Após uma falha que devolve o estado de needing upgrade, a entrada de retentativa é mantida, e a notificação não se perde permanentemente por causa da deduplicação do aviso antigo.
- A ação de atualização é executada primeiro com `force:false` por padrão; só após receber o guard `source-server-update-running-tasks` é que se pede uma segunda confirmação ao usuário e se tenta de novo com `force:true». «Versão incompatível» por si só não autoriza a interrupção forçada de uma Task em execução.
- O estado «atualizando» precisa cobrir o texto antigo de required/error em todas as entradas, exibindo um loading explícito, a fase estruturada corrente e logs expansíveis; o percentual só é mostrado quando upload/download produzem números verificáveis, e as demais fases usam progresso indeterminado. Após o sucesso, um novo handshake é feito e a intenção original de conexão continua; em caso de falha, permanecem a fase, o log, a retentativa e a orientação manual.
- `applied:true` é o contrato completo de convergência do runtime remoto: `current.json`, Supervisor, Server Core e Agent/Plugin Host precisam vir do mesmo release de destino. O Supervisor atual pode validar primeiro que o Core candidato está pronto, mas a CLI da versão de destino precisa em seguida parar o Supervisor antigo, reexecutar `serve --daemon` a partir do release imutável de destino e só ter sucesso após a validação pelo control runtime identity; não se pode tomar `status.version` nem um Core novo pronto como prova de que todo o daemon já trocou de geração. A breve desconexão durante a atualização pertence ao estado `updating` e não pode publicar um novo attachment online.
- A atualização explícita de um Source já identificado precisa reutilizar a seam de troca physical → logical da §7.1: só quando a antiga conexão física for efetivamente removida do online owner do Manager é que o logical workspace existente daquele Source é marcado como recoverable offline; depois que a nova conexão física completar o handshake com sucesso, precisa-se publicar o reconnect handle do mesmo Source, e o `WindowRemoteConnectionRegistry` troca o `remoteSessionId`, a generation, os scoped services e os attachments de Desktop/Mobile. Quando o running-task guard ou a preparação da atualização falha e a antiga conexão física ainda está viva, é proibido invalidar ou trocar o logical workspace.

```text
versão incompatível
  ├─ conexão explícita pelo usuário ───► assistente de conexão faz updateSource(force=false)
  ├─ Toast de inicialização/reconexão ►「atualizar agora」─┐
  └─ card do Server no dispositivo remoto ►「atualizar agora」─┴─► updateSource(force=false)
                                                           │
                                                           ├─► Host operation log Event
                                                           │      └─ phase / message / real progress
                                                           ├─ running-task guard
                                                           │      └─ confirmação do usuário ─► force=true
                                                           └─ old physical owner removed
                                                                  └─ logical offline
                                                                       └─ success ─► re-handshake
                                                                            └─ troca de logical/attachment
                                                                                 └─ continua a intenção original de conexão
```

- Falha na atualização: o estado da operação de atualização e o estado de compatibilidade ficam em colunas separadas. Se o Source estava online antes da atualização e era compatível, depois de um running-task guard, de uma falha de download/upload ou de instalação é preciso restaurar o fato original `online + updateAvailability`, apenas anexando o erro desta atualização e a entrada de retentativa/atualização forçada; não se pode reclassificar um Source disponível como `needs-upgrade + required`. Só entra no `needs-upgrade` bloqueante quando a compatibilidade do handshake é explicitamente incompatível ou quando, no modo de desenvolvimento com endereçamento por conteúdo, o SHA do archive difere (o que exige atualizar antes de conectar). A primeira versão não acrescenta no controlador orquestração extra de rollback de release.
- Desconexão explícita, remoção de um Profile em atualização ou liberação pelo Host precisa cancelar a atualização em andamento que o Manager mantém, cobrindo probe, resolução de release, instalação, leitura da lista de running tasks e novo handshake. Quando o Profile ainda não conseguiu `sourceServerId`, a cancelamento também é feito por Profile; a desconexão do Source cancela todas as atualizações daquele Source. Sucessos, falhas e limpezas tardias não podem rediscar, publicar online, restaurar estado antigo, agendar retentativas nem sobrescrever uma conexão manual posterior. O cancelamento encerra apenas a intenção de conexão local e não promete rollback de um release remoto já aplicado; a atualização normal e a recuperação após desconexão inesperada seguem o contrato já existente.
- Ao remover uma linha que não é a atualização corrente, se a atualização já invalidou a antiga conexão física e aquele Source não tem nenhuma outra atualização em andamento, o Manager precisa devolver a recuperação à linha de recuperação original ainda mantida, reutilizando a retentativa existente; não é preciso esperar pelo resultado tardio da atualização cancelada. Se a linha ainda está online, se já reconectou depois ou se outra atualização ainda está em curso, não se inicia uma nova recuperação. Remover a linha de recuperação corrente, a desconexão explícita ou a liberação pelo Host continuam sendo estados terminais, sem escolher uma linha substituta; desktop e celular continuam consumindo o mesmo recovery owner do Source.
- A liberação pelo Host também precisa limpar as entradas de recuperação dos Sources offline, cobrindo conexões em retry ou em offline probe; um catch tardio após o aborto do flight não pode reagendar temporizador nem publicar uma conexão sem owner.

```text
atualização → o Manager registra uma operação independente → probe / archive / instalação / re-handshake → online
              │
desconexão / remoção / liberação → cancela e remove essa operação → resultado tardio apenas encerra
                                           └─ preserva o estado offline / removido / a próxima conexão
```

```text
A online → atualização de B → a antiga conexão física fica inválida → remoção de B
                                  ├─ ainda há outra atualização → essa atualização encerra o caso
                                  └─ a linha de recuperação original A permanece → retentativa existente → A online
```

## 7. Ciclo de vida da conexão e reconexão automática (D9)

### 7.1 Máquina de estados (nível de janela, uma por Source Server)

```text
                ┌────────────── Início do app: Servers usados nos últimos 7 dias
                │               (≤3 concorrência, 10s por nó, só uma tentativa, silencioso)
                ▼
 absent ──connect──► bootstrapping ──incompatível──► needs-upgrade (ação do usuário)
                │        │ probe→install?→daemon→channel→handshake
                │        └─sucesso
                ▼        ▼
             failed    online ◄────resync concluído──────┐
                          │ canal/WS desconectado       │
                          ▼                             │
                       retrying (2s → 4s → 8s, ×3)──────┘
                          │ todas falharam
                          ▼
                       offline (sondagem silenciosa a cada 2 minutos + retentativa manual
                          + «último horário online»)
                          │ sondagem acessível e credenciais obtidas em silêncio
                          └────────► bootstrapping (caminho sem interação: sem prompt de
                                     credenciais, sem instalar nova versão)
```

- **Pré-requisito de silêncio**: o caminho automático (reconexão na inicialização/retry de queda/sondagem offline) só permite etapas sem interação — as credenciais precisam poder ser obtidas silenciosamente do credential store (chave privada sem passphrase, ou senha/passphrase já salva); tudo que exigir digitação de senha, confirmação de instalação ou versão incompatível fica parado no estado correspondente aguardando o usuário.
- **Novo ciclo de recuperação após um estado terminal**: quando o mesmo Source republica a conexão física, o Registry primeiro cria uma nova barreira de recuperação para o antigo terminal owner e limpa a falha antiga, e só então inicia o religamento assíncrono. Outras linhas que fizerem join no mesmo Source nesse momento precisam esperar o novo ciclo e não podem ler erros antigos de espera de instalação/upgrade; o orçamento de recuperação e a semântica de single-flight de conexão do Manager permanecem inalterados.
- **Durante a desconexão**: segue a semântica do R1 — mantém-se a última projeção confiável de tasks e marca-se `sourceAvailability=offline`, todas as escritas e IOs ficam fail-closed e não há retorno ao local; após a reconexão bem-sucedida, um novo source snapshot substitui o anterior atomicamente (caminho `replaceDisconnectedSource` já existente).
- **Conclusão da recuperação**: completam-se Tasks/Sessions/requests aguardando confirmação (reaproveitando a recuperação de dados já existente após queda: consulta de estado autoritativo + convergência incremental); havendo requests aguardando confirmação, o cartão bloqueante no rodapé consome a projeção de `pendingInteractions`, sem exibir mais o aviso no topo nem a entrada «ir tratar», e sem criar uma segunda fonte de verdade. Essa regra de exibição vale para o desktop local, o desktop remoto e o Web no celular. No remoto, continuar rodando durante a desconexão é o comportamento natural do daemon; a recuperação consiste apenas em reler o estado autoritativo, sem reproduzir entradas.
- **Escopo da reconexão na inicialização**: quando o Host da janela principal inicia, ele dispara a conexão para os «Servers com `lastOnlineAt` nos últimos 7 dias (`SourceServerRecord.lastOnlineAt`, tomando a sua linha padrão)» (primeira versão projetada para janela única; o `lastConnectedAt` do Profile serve apenas para ordenar linhas e não participa do gate). Com o dispositivo online, o Renderer religa todas as tabs desconectadas `remote:server:*` abertas para aquele dispositivo na janela atual, sem mais filtrar por idade do workspace ou histórico de connected anterior (ver [remote-device-sidebar-device-level-connect-spec.md](./remote-device-sidebar-device-level-connect-spec.md) C3); essa é uma mudança de comportamento explícita em relação ao estado atual de «cold start restaura apenas entradas desconectadas, aguardando reconexão manual» (SSH-P0-LIFE-01), e o case catalog precisa ser atualizado.
- **Sondagem**: caminho leve (dial do transport + server-info anônimo), e só com sucesso se entra no bootstrap completo; a sondagem não produz mudança visível na UI, além do selo de estado.
- **Último horário online**: o handshake bem-sucedido inicializa `lastOnlineAt`; ao sair de online, o Manager submete o último horário online à fila de escrita serial do Directory usando o relógio do Host e, após persistir, renova a projeção pelo evento de diretório original. As retentativas offline seguintes não avançam o horário; uma escrita tardia não pode sobrescrever um handshake mais recente nem recriar um Source removido. Essa atualização de metadados não altera a cadeia de recuperação do desktop continuous / mobile replayable.
- Quando o daemon não está presente (por exemplo, o servidor reiniciou e o WSL/Docker não foi registrado para autostart), a reconexão automática pode executar `ensureDaemon` (sem instalação/upgrade).
- **Desconexão antes da publicação**: a conexão física só entra no caminho «canal/WS desconectado → retrying» depois que o Manager a registra como online owner daquele Source. Quando a conexão fecha durante a gravação do handshake (`recordHandshake`), o Manager não pode publicar a conexão já fechada como online, e sim encerrar como uma falha de conexão comum (`failed` e `retryable:true`, e o caminho automático segue para a próxima etapa de retry); desconexões durante o handshake de outros Profiles do mesmo Source não podem afetar o owner já online. O evento close só atua na conexão à qual pertence e não é generalizado por `sourceServerId`.

O recovery owner e a seam de troca:

```text
Source transport desconectado
  -> o SourceServerConnectionManager cuida apenas do flight de reconexão 2/4/8s do transport
  -> o WindowRemoteConnectionRegistry mantém a mesma connection entry e marca a generation
     antiga da logical session como offline
  -> o Host fecha a antiga scoped port; Desktop/celular entram em reconnecting/recovering,
     e o Controller mantém a última projeção confiável
  -> o Manager produz o novo connection handle
  -> o Registry troca remoteSessionId/generation dos workspaces ainda abertos via CAS de entry + generation
  -> o Host/Main reconstroem atomicamente o attachment do Desktop
  -> o Main remove a Provisioning lane ligada ao antigo remoteSessionId e registra de novo
     com o novo remoteSessionId
     (dispara um reenvio integral de environment-online; em caso de falha, apenas um warn,
      sem desmontar o Workspace, §8.3.2)
  -> o Main conclui primeiro o attachment do Desktop e notifica o Renderer; a recuperação do
     celular não participa do veredito de sucesso do Desktop
  -> o Main envia bridge-degraded (não terminal) para o bridge antigo do celular; o Web
     reconstroi ativamente o attachment replayable com o novo bridgeSessionId/generation,
     e só volta a ready após concluir a recuperação de gap/snapshot
  -> libera a antiga connection/session/port
```

- O `WindowRemoteConnectionRegistry` é o único recovery owner do connection handle, do logical session, do `remoteSessionId`, da generation e do `sourceAvailability`; o Manager não segura nem substitui diretamente os attachments do Renderer/celular.
- A route key SSH/WSL/Docker só pode servir como chave de lookup provisional antes do handshake. Depois que o handshake obtém o `sourceServerId`, a canonical owner key da managed connection entry precisa convergir para `source:<sourceServerId>`; dentro da mesma janela é permitido que várias route aliases apontem para aquela entry do Source, mas é proibido que cada Profile mantenha sua própria entry online/recovering. O Source owner claim precisa acontecer antes de a entry, a logical session ou o attachment serem publicados como online; uma entry provisional que perde a concorrência só recupera o logical wrapper/a assinatura e não pode desconectar a conexão física do Source mantida pelo Manager.
- Depois de um close transitório, a entry persistente do Source continua ocupando a connection key; a reconexão manual apenas dispara ou entra no mesmo flight de recuperação do Manager/Registry e não pode criar uma segunda entry. Toda escrita em `entriesByKey` e todo logical replacement precisam validar o entry/generation esperado, e um flight tardio não pode sobrescrever o novo owner.
- Cada connection entry mantém um `transitionEpoch` monotônico. O recovery replacement, o join da reconexão manual, o prepare de workspace e a troca de attachment capturam o epoch antes de atravessar `await`, e depois de retornarem precisam validar simultaneamente o entry owner, o epoch, o `closePhase/state` e a identidade da logical session; se um close terminal chegar nesse intervalo, o flight antigo precisa falhar de forma fail-closed, sem republicar online.
- `connectionKey + workspaceKey` só pode ter um único online/recovering logical owner. Uma reconexão disparada por Bot/celular precisa entrar no recovery já existente e retornar a session única pós-troca; não pode criar uma segunda logical session para depois ser limpa pela camada superior.
- A unidade de commit e rollback do logical replacement é um único `connectionKey + workspaceKey`, e não a entry inteira do Source. Depois que o Controller/Main attachment do workspace A no mesmo Source físico já concluiu a troca de generation, uma falha no prepare, no snapshot do Controller ou no replacement de attachment do workspace B só pode reverter e repetir B; não é possível reverter o Registry owner de A para o antigo `remoteSessionId`. O transport físico permanece online durante a falha do logical replacement, os workspaces ainda não submetidos permanecem offline e todo o IO scoped fica fail-closed; esgotar o orçamento apenas finaliza esses workspaces.
- O `SourceServerConnectionManager` possui a conexão física residente do Source e a sondagem offline; a entry do registry da janela possui apenas o logical wrapper e as assinaturas. Quando o último logical owner é liberado ou a entry é substituída por um novo owner, é preciso recuperar o wrapper/assinaturas, mas não chamar implicitamente o `disconnect` físico do Manager. O disconnect físico só vem de uma operação explícita na página de gestão de conexões ou do shutdown do Host. Os waitingers de recovery ainda pendentes em uma entry substituída precisam terminar com erro de cancelamento de conexão; abortar apenas o transport não substitui a rejeição da Promise de recovery. As requisições já transferidas para o canonical Source owner continuam sendo concluídas por ele, sem sofrer com a liberação da entry antiga.
- A falha de logical replacement/attachment replacement tem suas próprias retentativas limitadas; depois que a conexão física foi recuperada, não se pode esperar a próxima queda para voltar a disparar. A `ServerRemoteConnection` substituída precisa ser descartada explicitamente com `dispose`.
- A retentativa temporizada do logical replacement pertence apenas ao epoch de transport no momento do agendamento; no momento da execução a entry ainda precisa estar online e o `transitionEpoch` precisa estar inalterado. Ao receber um novo close físico (recuperável ou terminal), os temporizadores antigos são cancelados imediatamente; callbacks tardios não podem mudar disconnected para online, consumir o orçamento de um novo ciclo de recuperação nem limpar o temporizador do ciclo novo. Depois de um close recuperável, os waitingers continuam aguardando o reconectar real; um close terminal rejeita os waitingers; só um reconectar real ou a assunção por um handle já conectado pode iniciar um novo ciclo de troca, e o temporizador não serve como evidência de que o transport foi recuperado.
- O `onDidReconnect` do Manager tem uma única fonte de verdade: o mesmo Source é publicado como online novamente após a primeira publicação online e antes de uma desconexão explícita (seja pelo retry de 2/4/8s, pela sondagem offline, por `updateServer`, ou por `connect()` manual como `connectProfile` / `confirmIdentityChange`). Uma conexão manual bem-sucedida também precisa fazer o wrapper do Host trocar de services e o Registry concluir a troca logical; não pode existir a divergência «Manager online, Registry ainda recovering, novos joins esperando para sempre». A primeira publicação e o join de um Profile irmão a um owner já online não são reconexão e não disparam o evento.
- Uma reconexão bem-sucedida não pode atualizar apenas o snapshot interno de `services` do Manager; até que o Registry conclua a troca de handle/session, o Source antigo permanece offline, e todas as escritas e IOs ficam fail-closed.
- O attachment do Desktop continua injetando `desktop-continuous`, e o attachment do celular continua injetando `web-remote-replayable`; a troca apenas reconstrói a subscription de cada um, sem espalhar a semântica de snapshot/gap do replayable para o Desktop.
- O bridge do celular envia apenas o estado recovering durante o retry transitório, sem enviar o `workspace-bridge-error` terminal; só se entra em erro terminal quando o orçamento de recuperação se esgota, quando credenciais/versão/migração exigem ação do usuário ou quando o usuário se desconecta explicitamente.
- O Renderer precisa distinguir a recuperação automática da reconexão manual do usuário: a recuperação automática mostra a tentativa corrente e o orçamento fixo (1/3, 2/3, 3/3), e a reconexão manual não falsifica a contagem de retries automáticos; esgotar o orçamento entra em um estado terminal explícito, exibindo o mapeamento de `reasonCode/retryable` fornecido pelo Host. Durante o recovering, os scoped services já foram liberados, e a expansão de workspace na sidebar, o clique em task, a criação de nova task e as operações de escrita estão todas fail-closed, até que o replacement attachment esteja pronto. A consulta de status de conexão do Bot só reconhece rotas attachable e não pode reportar rotas closed/recovering como connected.
- Cada estado de retry do Manager precisa atravessar Registry/Main até o Renderer; quando o Registry está recovering, ele não pode descartar um close recuperável seguinte como um terminal duplicado. Esgotar o orçamento usa o `reasonCode` público e um texto localizado, sem que um corpo de texto em chinês fixo no Host sobrescreva o locale do cliente.
- O Main não pode criar um seq começando em 1 do acknowledged relay protocol com o mesmo `bridgeSessionId + bridgeGeneration + recoveryId`; o novo protocol precisa ter uma nova identidade. Uma falha na reconstrução do attachment do celular não pode descartar a logical session do Desktop que já está pronta.
- `bridge-degraded` é um latch de invalidação persistente da bridge generation e não entra no buffer comum de payload de 5 segundos do app. Depois da troca de Source, o antigo attachment do celular é liberado imediatamente e a invalidação é reenviada enquanto o relay estiver paired/send-ready, até que o celular conclua `workspace-bridge-ready` com a nova identidade de bridge. Uma falha de reconstrução do Web bridge tem retentativas limitadas dentro da mesma recovery generation; a recuperação de fundo de um transport comum não pode criar por engano um novo Agent/Host/session.
- O antigo `remoteSessionId`, a antiga generation e o antigo scoped port são liberados de forma unificada depois que o novo attachment fica ready; quaisquer eventos tardios, owner commands ou requisições de escrita precisam ser rejeitados pelo scope antigo.
- O workspace bind estabelece um deadline do Main com base no `requestId`. Quando o deadline expira, o Main precisa enviar cancel ao Host; o Host verifica o cancel epoch antes e depois de cada RPC remoto que atravessa um `await`, especialmente depois de `recordWorkspaceOpen` e antes de publicar o sucesso. Uma conclusão tardia só recupera os recursos criados e exclusivos por aquele bind request; ao entrar em uma logical session existente, ou havendo ainda outro owner de attachment, não se pode chamar `disposeSession` incondicionalmente. O próprio timeout do Main também retorna `remote-bind-canceled`, e um ACK tardio é ignorado de forma idempotente, proibindo que o desaparecimento do chamador com timeout deixe um scope fantasma ou afete outros owners.

### 7.2 Aguardando confirmação do usuário (3.11)

Requests de bloqueio como permissão/entrada ficam armazenados no Source Server (comportamento já existente de Agent/Core); a desconexão do controlador não rejeita o request, e o Agent não sai por perder o attachment (depois da daemonização isso vale naturalmente, substituindo o comportamento da cadeia antiga de «server morre quando a conexão cai»). Após a reconexão, o `pendingInteractions` é buscado novamente pelo fluxo de recuperação: a recuperação automática do Desktop, a reconexão manual do Desktop e o attachment replayable do celular reprojetam os requests a partir do primeiro snapshot. O cartão de permissão/pergunta no rodapé lê essa projeção; após o resolve, ele desaparece junto com o próximo snapshot autoritativo. O topo não exibe mais o aviso de requests pendentes.

## 8. Source autoritativo e superfície de configuração (D7 / D11)

### 8.1 Tabela de autoridades

| Dados/capacidade                                            | Autoridade                                  | Mudanças no R3                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Arquivos do Workspace, Git, Terminal, Task, Session, estado de execução | Source Server / Agent CLI                 | Inalterado (autoridade remota), o serviço passa a encaminhar tudo                                                                                                                                                                                                                                                                        |
| Índice de Task, pin/archive, configurações do workspace               | Source Server                             | Inalterado; o Controller apenas agrega e roteia                                                                                                                                                                                                                                                                                                           |
| MCP, Skills, Hooks, plugins, Commands, modos de permissão         | Source Server                             | Skills/Plugins/Commands/Hooks já são remotos; **Subagents/Memory/OutputStyle/settings-sync passam de local para remoto**, eliminando a divisão da fonte de verdade entre UI e runtime                                                                                                                                                                                                      |
| Configuração de Provider de modelo, disponibilidade de modelos                       | Source Server (espelho de execução); a máquina local é a autoridade de edição | **Comutação da cadeia principal**: remoção do downlink via desktop-attached; o `standalone-server` remoto lê de forma autoritativa o próprio Built-in Release + Personal Layer e constrói o Registry. Personal Layer e Configured Default são sobrescritos de forma unidirecional e automática pelo Provisioning de Provider da máquina local; o lado remoto não oferece entrada de edição; o catálogo de modelos da área de conversa / Subagents / Automation é lido da Facade `model-selection` do Host de destino (§8.2) |
| OAuth / estado de login `zcodejwttoken`                       | Cada lado mantém o seu; a máquina local é a origem                        | Credenciais no allowlist de Provisioning (`oauth:active_provider`, `oauth:zai\|bigmodel:*`, `zcodejwttoken`, `account-provider:*:api-key`) são substituídas para o Source de destino a cada downlink; o lado Source descriptografa e o lado de destino recriptografa com o seu próprio Credential Store; logout / troca de conta na máquina local converge na próxima disparo. O remoto não pode iniciar OAuth pelo navegador por conta própria                                                  |
| Connection Profile, janelas, Theme, Locale              | Lado controlador                                    | Theme/Locale são fornecidos pelo serviço local do attachment base da janela e não acompanham a troca de Source                                                                                                                                                                                                                                                                    |

Ponto de aterrissagem do conjunto de serviços: os três transports passam uniformemente a usar o modo de encaminhamento total de `createServerRemoteWorkspaceServiceCollection({ connectionServices, sourceServices })` (`packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`), removendo os branches de "mistura de autoridade local" exclusivos de SSH/WSL/Docker; a ponte reversa `onDynamicSessionRuntimePreferencesRequest` é aposentada junto com o modo desktop-attached. O conjunto de encaminhamento total também registra o `RemoteProviderProvisioningExecutor` privado do Host (o `ProviderProvisioningSource` local + o `IProviderProvisioningTargetService` remoto) em um WeakMap para agendamento pelo Main, sem entrar no RPC do Renderer (§8.3).

Sob o encaminhamento total, o comportamento de serviços app-global (OAuth, usage-stats, bots, coding-plan-subscription etc.) no escopo remote precisa ser confirmado item a item pela lista de channels na fatia de implementação 5, sendo já definido: o Source remoto não pode iniciar OAuth pelo navegador (o navegador do lado controlador não consegue atender ao callback remoto), e sim recebe automaticamente a sessão OAuth ativa atual da máquina local via Provider Provisioning (credenciais de allowlist); quando o destino não possui modelo utilizável, a área de conversa exibe «Este dispositivo remoto ainda não tem modelos disponíveis, configure os modelos na máquina local primeiro e eles serão sincronizados automaticamente com o dispositivo remoto», e as ações de configuração / upgrade sempre apontam para a máquina local.

Lista de `RemoteWorkspaceRpcContract v1` confirmada após a implementação:

| Grupo de channels                                                              | Autoridade/comportamento no escopo remote                                                                         | Limitações da primeira fase                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| file/file-watcher/git/git-checkpoint/system/terminal                    | Encaminhamento total pelo Source Server                                                                           | `workspacePath` só é usado para IO remoto                                                                                                                                                                                                      |
| zcode-task/zcode-agent/zcode-session                                    | Encaminhamento total pelo Source Server/CLI                                                                       | Desktop continuous; o celular mantém attachment replayable                                                                                                                                                                                 |
| setting/credential/broadcast                                            | Encaminhamento total pelo Source Server                                                                           | Connection Profile, Theme e Locale continuam pertencendo ao attachment base do lado controlador                                                                                                                                                                       |
| onboarding-record                                                       | Encaminhamento total pelo Source Server (mesma origem de setting/OAuth)                                                  | Não toma emprestado o registro do lado controlador; o allowlist replayable do celular libera, ver onboarding-record-spec §5.1                                                                                                                                                   |
| provider-settings/model-selection/media-preview                         | Encaminhamento total pelo Source Server (a Facade remota lê o Registry remoto)                                            | «Configurações de modelo» na página de configurações não consome o `provider-settings` remoto (sempre ligado ao local, §8.2); o catálogo de modelos da área de conversa / Subagents / Automation consome o `model-selection` do Host de destino; `media-preview` é um channel obrigatório do contrato, validado por `assertRemoteWorkspaceRpcContract` |
| provider-provisioning-target                                            | Provisioning target interno do Environment remoto; **Host-only**                                       | Fora de `RemoteWorkspaceRpcContract v1`, não entra no Renderer nem no allowlist do celular; conexões replayable de `/ws` recebem um stub que lança erro (§8.3.4)                                                                                                           |
| OAuth/usage-stats/coding-plan/client-scenes/bots                        | Encaminhamento total pelo Source Server                                                                           | O remoto não inicia OAuth pelo navegador diretamente; consome a sessão entregue pelo Provisioning e não recorre aos serviços do lado controlador                                                                                                                                                         |
| skills/MCP/plugins/commands/hooks/subagents/memory/output/settings-sync | Encaminhamento total pelo Source Server                                                                           | Source offline fail-closed                                                                                                                                                                                                            |
| conversation-share                                                      | O Source Server usa o OAuth/JWT do destino, HTTP, Rows/File para executar; o Desktop encaminha o contexto do attachment confiável | SSH/WSL/Docker podem publicar; conexão direta via Server e celular continuam desabilitados; ver as convenções de autoridade do R3 na spec de compartilhamento de sessão                                                                                                                                                   |
| prompt-attachment-transfer                                              | A implementação local do Source é mantida; o Window Host attachment de SSH/WSL/Docker cobre o staging entre máquinas                 | Reutiliza o upload do desktop localPath no backend de Transport atual; a operation é mantida pelo attachment e conteúdo não adotado é cancelado no fechamento; não se introduz Resource Store, ver a spec de materialização de anexos                                                                                   |
| repo-wiki                                                               | Encaminhamento total pelo Source Server                                                                           | Usa arquivos e modelos remotos                                                                                                                                                                                                                 |
| source-server-workspace                                                 | Alias canônico / autoridade de migração do Source Server                                                         | `legacyRouteHint` só é usado na fronteira Host→Core e não entra na identidade do Renderer/celular                                                                                                                                                                |

Qualquer novo channel exige atualizar primeiro esta tabela e o `RemoteWorkspaceRpcContract v1`; o lado controlador local continua mantendo apenas o diretório de Source/Profile, as janelas, Theme/Locale, o pareamento do controle remoto Web, o agendamento de attachments e a autoridade de edição dos Providers de modelo (o `IProviderSettingsService` local) e o Provisioning Source.

Lista atual do `REMOTE_WORKSPACE_RPC_CHANNELS` (`packages/desktop/src/host/remoteWorkspaceRpcContract.ts`, `REMOTE_WORKSPACE_RPC_CONTRACT_VERSION = 1`), que o `assertRemoteWorkspaceRpcContract` exige do remoto item a item durante o handshake:

```text
fileService gitService gitCheckpointService systemService terminalService
settingService onboardingRecordService credentialService broadcastService
zcodeTaskService zcodeAgentService zcodeSessionService conversationShareService botsService fileWatcherService oauthService
providerSettingsService modelSelectionService mediaPreviewService          ← desde 2026-09-07 substitui modelProviderService / providerSyncService
sourceServerWorkspaceService usageStatsService codingPlanSubscriptionService clientScenesService
skillsService skillSyncService mcpSyncService pluginSyncService pluginsService pluginManagementService
subagentsService commandsService hooksService memoryService outputStyleService settingsSyncService
promptAttachmentTransferService repoWikiService
```

`modelProviderService` e `providerSyncService` foram removidos do contrato; `providerProvisioningTargetService` não está no contrato (o Host o lê sob demanda de `connectionServices`, sem validar e sem encaminhar). O número de versão do contrato permanece v1: o gate de compatibilidade por padrão só promete conexões da mesma versão, e um remoto antigo já foi atualizado antes do handshake; se vale subir para v2, ver [r3-provider-refactor-merge.md (arquivado)](../archive/remote-r3/r3-provider-refactor-merge.md).

#### Transação de persistência das configurações do lado controlador

O Main, ao salvar as preferências da janela, e o Local Host, ao salvar o Source Directory, continuam usando a atualização por patch do `SettingService`; o owner do histórico de Source/workspace não muda. A escrita do `setting.json` compartilhado precisa executar, sob um lock entre processos do mesmo arquivo, a sequência "adquirir lock → reler o disco mais recente → combinar este patch/migração → substituição atômica → liberar o lock", protegendo não apenas o rename final. A escrita atômica dentro do lock reaproveita o lock já adquirido, evitando reentrância; em caso de falha, o lock é liberado, e antes do commit um timeout revoga a generation da escrita, de modo que uma escrita antiga e tardia não possa sobrescrever as configurações seguintes; depois de entrar no commit por rename, o barreira de commit existente é mantida até a conclusão. O salvamento do tamanho da janela não pode apagar o diretório remoto recém-registrado.

### 8.2 A página de configurações de modelos é vinculada ao Environment local

Na fusão do refactor de Provider M2 em 2026-09-07 foi decidido (rota A): a «Configurações de modelo» da página de configurações **sempre fica vinculada ao Environment local**, sem seletor de dispositivo, sem edição do remoto e sem botão manual de «sincronizar em um clique». A base é o Provider Refactor Design V2 §7.1 (cada Environment de execução lê as configurações do próprio ambiente, o Host não envia Registry Snapshot ao Worker; edição remota e sincronização de login são capacidades de produto independentes, fora do núcleo de Provider) e a seção «página de configuração de modelos do Desktop» de [Remote Provider Provisioning](../remote/provider-provisioning.md).

```text
SettingsPage
  └─ activeSection === "modelProvider"
       └─ ServiceProvider(localHostServices)            ← useBaseWorkspaceServices(), independente do workspace ativado
            └─ ModelProviderSection
                 ├─ leitura/escrita: IProviderSettingsService local (provider_config.json / model-selection.json / campos estreitos de setting.json)
                 ├─ teste de conectividade: connectivityWorkspacePath forçado ao workspace local; retorna indisponível quando há workspace remoto ativado e nenhum workspace local
                 └─ save bem-sucedido ──► o Provisioning Source local dispara ──► §8.3 downlink automático para todos os Sources online

Workspace ativo (local / remote) ── apenas determina o contexto do workspace, não muda a origem dos dados de configuração de modelos
```

- A página de configurações não tem mais o menu de dispositivos «máquina local / cada Server remoto», e nem registra `lastAgentSettingsSourceServerId`; `ModelProviderSourceControls.tsx`, `useSourceSettingsAttachment.ts`, `providerSyncSnapshot.ts` e `AppSettings.lastAgentSettingsSourceServerId|providerSyncDefaultModel|providerSyncRuntimeCredentialBindings` foram removidos. Quando falta modelo no remoto, a página de configurações não exibe nenhuma orientação remota; a orientação aparece apenas na área de conversa (§8.3).
- O scope de attachment `source-settings` mantido (`sourceSettingsServiceCollection.ts`) não registra `provider-settings` / `model-selection`; serve apenas às superfícies de configuração não-Provider como Skills / MCP / Plugins / Commands / Hooks / Subagents / Memory / OutputStyle / settings-sync; as demais páginas de capacidade continuam usando seus próprios controles de User/Workspace Scope e o roteamento do workspace atual, e é proibido espalhar «modelos vinculados ao local» para «todas as páginas de configurações vinculadas ao local».
- O catálogo de modelos da área de conversa, de Subagents e de Automation vem do **Host de destino**: `useModelSelectionView(workspacePath, remoteSessionId, workspaceIdentity)` é resolvido por `useWorkspaceServicesResolution` até o conjunto de serviços daquele workspace e então lê o seu `modelSelectionService` (ssh/wsl/docker/server todos iguais para o remoto); enquanto se aguarda o attachment remoto, mantém-se `remote-waiting`, jamais caindo de volta para o diretório do Local Host local. Mesmo durante o primeiro bind/rekey, quando a tab ainda carrega brevemente a identity legacy `remote:ssh|wsl|docker:*`, o diretório local não pode ser lido.
- Quando o workspace remoto não tem modelo, o `modelConfigTarget: "remote"` do `ChatErrorBanner` só troca a redação (`chat.error.remoteNoAvailableModel`: «Este dispositivo remoto ainda não tem modelos disponíveis, configure os modelos na máquina local primeiro e eles serão sincronizados automaticamente com o dispositivo remoto»), e os botões continuam sendo «Configurar» (abre as configurações de modelos da máquina local) / «Fazer upgrade»; a entrada «Ir para sincronizar» foi removida.
- Quando o Renderer recebe uma porta de serviço com escopo remoto, a adoção do conjunto de serviços de autoridade total do Source Server ainda é definida pelo `sourceServerId` injetado pelo Host; SSH/WSL/Docker apenas descrevem o transport e não autorizam voltar aos serviços mistos legados. Mesmo um Source já identificado, conectado via SSH, precisa ter `settingService`, credenciais, usage e `modelSelectionService` vindos do remoto.

### 8.3 Provider Provisioning integrado à cadeia principal do R3

A configuração de modelos não tem entrada de sincronização disparada pelo usuário. A máquina local é a única autoridade de edição da configuração de Provider, e cada Source Server online é um espelho de execução descartável da configuração local; o conteúdo do Envelope, a transação / rollback do lado de destino, a idempotência por `syncId` e os limites de validação têm [Remote Provider Provisioning](../remote/provider-provisioning.md) como documento factual. Esta seção descreve apenas como ele é ligado à cadeia principal de Source Server do R3 e não pode contradizê-lo.

#### 8.3.1 Cadeia: Main coordinator → Window Host executor → Source Server target

```text
Desktop Main                         Window Host                              Source Server daemon (zcode-server-cli Core)
------------                         -----------                              --------------------------------------------
ProviderProvisioning                 RemoteProviderProvisioningExecutor       createLocalServices({
EnvironmentCoordinator               (registered by                             serviceAuthorityMode: "standalone-server",
  key = buildRemoteEnvironmentKey     createServerRemoteWorkspaceService-       providerProvisioningTargetEnabled: true,
        (descriptor.target)           Collection; Host-private WeakMap,         zcodeBuiltinProviderConfigFilePath })
  single-flight lane + generation     never exposed to Renderer RPC)           IProviderProvisioningTargetService
        |                                    |                                         |
        | HostMessage                        |                                         |
        | ProviderProvisioningExecute        |                                         |
        | {requestId, environmentKey,        |                                         |
        |  remoteSessionId, trigger}         |                                         |
        |----------------------------------->|                                         |
        |                                    | (1) source.read(syncId)                 |   <- local ProviderProvisioningSource
        |                                    | (2) target.apply(envelope)              |   <- /ws/host, desktop-continuous,
        |                                    |---------------------------------------->|      channel "provider-provisioning-target"
        |                                    |                                         | validate envelope
        |                                    |                                         | -> account narrow settings
        |                                    |                                         | -> credentials (re-encrypt on target)
        |                                    |                                         | -> provider_config.json
        |                                    |                                         | -> model-selection.json
        |                                    |                                         | any failure: reverse rollback
        |                                    |<----------------------------------------|
        |                                    | ProviderProvisioningResult              | success: refresh Account Source / Registry
        | HostResponse                       | {syncId, status, personalProviderCount, |          -> remote Host -> Worker overlay
        | ProviderProvisioningExecutionResult|  credentialCount, rolledBack}           |
        |<-----------------------------------|                                         |
        |
        | status in {applied, already-applied} -> resolve
        | otherwise: trigger == environment-online -> reject (first connect fails); other triggers -> warn (no Secret)
```

- O Main mantém apenas a environment key, o registro no Host, o trigger, a generation e a correlação por `requestId`; ele não lê nem encaminha configurações e Segredos; o Envelope passa uma única vez pela memória do Window Host, e a gravação em disco acontece somente no Store oficial do Source de destino.
- Fontes de disparo (`ProviderProvisioningTrigger`): `environment-online` (primeira conexão / reconexão), `personal-config`, `configured-default`, `account-settings`, `credential`. As quatro últimas são reportadas pelos Local Services locais da máquina após a persistência bem-sucedida, via `HostResponse ProviderProvisioningSourceChanged`, e o Main chama `coordinator.requestAll(trigger)` para avançar a generation de todos os Environments online; novos disparos durante a sincronização apenas avançam a generation, e um novo snapshot é lido ao final da rodada para formar a sincronização de cauda.
- Em comparação com o antigo «sincronizar em um clique»: não há tela de confirmação de destino, não há journal + write barrier, e o lado de destino passa a usar staging transacional + rollback reverso + idempotência por `syncId`; campos exclusivos de ours como a vinculação de runtime key do Team Plan e a seleção de execução do family em pacote não existem mais, e o lado da conta sincroniza apenas os campos estreitos `providerFamilyDomain` / `providerFamilyConnectionSelections` e as credenciais do allowlist.

#### 8.3.2 Barreira da primeira conexão e reregistro na reconexão

```text
Primeira conexão (desktopRemoteSessions.ts handleConnected)
  RemoteWorkspaceConnected(descriptor)
    -> routesBySessionId.set(remoteSessionId, route)
    -> registration = coordinator.register(environmentKey, remoteSessionId, execute)
    -> route.providerProvisioningDispose = registration.dispose
    -> await registration.initialSync                       ← barreira Remote Workspace ready
         ├─ applied / already-applied ──► attachRendererPort ──► pending.resolve (conexão bem-sucedida)
         └─ failed / rollback_failed / unsupported
               ──► dispose lane, remover route, DisposeRemoteWorkspaceSession ──► pending.reject (falha de conexão)

Troca de geração na reconexão (handleReconnected; §7.1 reconexão automática do Source / novo handshake após atualização explícita)
  RemoteWorkspaceReconnected(previousRemoteSessionId, descriptor)
    -> a route migra do sessionId antigo para o novo sessionId
    -> route.providerProvisioningDispose()                   ← remove a lane vinculada ao sessionId antigo
    -> registration = coordinator.register(environmentKey, novo remoteSessionId, execute)
    -> registration.initialSync.catch(warn)                  ← a reconexão não é barreira de publicação: falha só gera warning, não desmonta o Workspace
    -> attachRendererPort(win, route, "source-server-reconnected")
```

- A barreira só atua na primeira conexão disparada por `environment-online`; um segundo join de Workspace do mesmo Environment já tem lane e não gera uma segunda sincronização inicial (o E2E `SSH-P0-TASK-01` afirma que o `records[]` de `~/.zcode/v2/provider-provisioning-state.json` no remoto não aumenta depois que o segundo Workspace se conecta).
- A reconexão precisa se registrar de novo: a lane é registrada por `remoteSessionId` e o closure de execute também fica preso ao sessionId antigo; depois que o Source troca de geração, sem um novo registro os downlinks subsequentes acertariam o session antigo, já inválido no Host, e o remoto nunca mais receberia a configuração. O novo registro dispara um reenvio completo de `environment-online`, complementando as mudanças locais de configuração feitas enquanto o destino estava offline; o teste unitário `desktopRemoteSessions.test.ts` cobre «re-registro com o novo sessionId e reenvio após a reconexão» e «falha disparada pela reconexão gera apenas warning».
- A environment key é derivada por `buildRemoteEnvironmentKey(target)` conforme o transport (`ssh:<hostKey>` / `wsl:<distro>` / `docker:<container>` / `server:<serverId|url>`), e não é o `sourceServerId`; o mesmo Source conectado por linhas diferentes forma lanes distintas (cada uma com sua sincronização inicial, com resultado idempotente). Convergir para `sourceServerId` é uma opção futura, ver [r3-provider-refactor-merge.md (arquivado)](../archive/remote-r3/r3-provider-refactor-merge.md).

#### 8.3.3 Rejeição de conexão `unsupported` e atualização automática pelo gate de compatibilidade

```text
Assistente de conexão / reconexão automática
  -> handshake /api/server-info → verificação de compatibilidade (§6.3)
       ├─ remoto < minCompatibleVersion (padrão = versão de produto da máquina local)
       │     ├─ conexão explícita: updateSource(force=false) no lugar → novo handshake → continua a intenção de conexão original
       │     └─ início / reconexão offline: para em needs-upgrade, aguardando o usuário clicar «atualizar agora»
       └─ compatível → /ws/host → assertRemoteWorkspaceRpcContract → barreira da primeira conexão de Provisioning (§8.3.2)
```

- `ZCODE_MIN_COMPATIBLE_VERSION` por padrão é igual à versão de produto (o `package.json` da raiz não declara `zcodeCompatibility`), portanto um daemon antigo sem Provisioning target já é julgado como «precisa de atualização» na etapa de handshake e passa primeiro pela atualização da §6.3; o Core atualizado necessariamente registra o target, e a cadeia principal do R3 não emite Envelope para daemons pré-Provisioning.
- A semântica de rejeição `unsupported` é mantida como está no documento factual do Provisioning, cobrindo ainda: `ProviderProvisioningSource` local indisponível (o Window Host ainda não tem local services ativos, `sourceServices` está vazio), Core remoto sem target registrado (por exemplo `kind:"server"` em dev conectado diretamente ao `packages/server` HTTP zcode-server sem `ZCODE_SERVER_AUTH_TOKEN` configurado).
- `unsupported` / `failed` / `rollback_failed` na primeira conexão seguem sempre o canal formal de falha de conexão: não publicar Remote Workspace ready, não enviar Secret, não tentar novamente em silêncio; o Renderer vê uma falha de conexão comum e logs, e o usuário, ao corrigir, reconecta e a tentativa é refeita.

#### 8.3.4 Stub de recusa para clientMode não-desktop

```text
Source Server Core (server-core/http.ts exposeWebSocket)
  /ws/host  clientMode = desktop-continuous (Desktop Host confiável: capability ticket + ingress token)
     └─ overrides não substitui → implementação real de IProviderProvisioningTargetService
  /ws       clientMode = web-remote-replayable (celular / Web)
     └─ overrides.set("provider-provisioning-target",
            { apply: () => throw Error("Provider Provisioning 仅支持受信 Desktop Host") })

Window Host (windowHostAttachmentRpcPolicy.ts)
  allowlist de web-remote-replayable: inclui ProviderSettings / ModelSelection / MediaPreview, não inclui ProviderProvisioningTarget
```

- O Core sempre registra o target (o ingress token do R3 é comum, e não existe o branch do tipo «sem auth configurada então não suportado» do HTTP zcode-server); o isolamento é feito na camada de clientMode: mesmo que a conexão replayable do celular conheça o nome do channel, ela só obtém um stub que lança erro e não consegue escrever credenciais entre Environments no Source Server.
- O `RemoteProviderProvisioningExecutor` fica em um WeakMap privado do Host, sem ser exposto ao Renderer junto com o ServiceCollection; o Renderer e o celular não têm nenhuma entrada para disparar a sincronização.

#### 8.3.5 Diretório de materialização do Built-in Provider Config

```text
Build do zcode-server-cli
  tsup define SERVER_CLI_DEFINES = { __ZCODE_VERSION__, __ZCODE_MIN_COMPATIBLE_VERSION__, __ZCODE_BUILTIN_PROVIDER_CONFIG_JSON__ }
        │
Início do Core (server-core/core.ts runServerCore)
  layout = resolveServerLayout(ZCODE_SERVER_ROOT)
  ├─ ZCODE_BUILTIN_PROVIDER_CONFIG_FILE explicitado ──► usa esse arquivo diretamente
  ├─ senão materializeZCodeBuiltinProviderConfig({ runtimeRoot: layout.serverRoot, content })
  │     └─► ~/.zcode/server/config/provider/zcode-builtin-<sha256(content)>.json (tmp + rename; idempotente para o mesmo hash, falha se o conteúdo divergir)
  └─ nenhum dos dois ──► falha na inicialização (fail-closed)
```

- O diretório de materialização é `serverRoot` (`~/.zcode/server`), e **não** o `runtime/` que acompanha o release: o diretório do release é imutável e, ao reinstalar o mesmo releaseId, `assertExistingReleaseMatches` recalcula o hash de conteúdo de toda a árvore, e arquivos materializados extras fariam a validação falhar; o nome do arquivo contém o hash do conteúdo, então o compartilhamento entre releases é seguro. O `config/` hoje não está no allowlist do `zcode uninstall` e, após a desinstalação, é preservado como `preservedPaths` (ver [r2-server-cli-and-daemon.md](./r2-server-cli-and-daemon.md)).
- O Built-in Release remoto não é copiado pelo Provisioning: quando a Personal Layer local referencia um Provider/Model que não existe no Built-in remoto, o destino retorna um erro estruturado e faz rollback da escrita de configuração desta vez.

### 8.4 Contrato de gerenciamento de dispositivos (incorporado em 2026-09-13 a partir de `docs/archive/remote-r3/r3-remote-ui-prototype-gap-audit.md` §8, original já arquivado)

O contrato abaixo já está implementado. Fontes factuais do código: `packages/shared/src/source-server/contracts.ts`, `packages/shared/src/source-server/errorCodes.ts`, `packages/desktop/src/host/sourceServerDirectory.ts`, `packages/desktop/src/host/sourceServerManagementService.ts`, `packages/shared/src/validationAppSettings.ts`.

**8.4.1 `declaredWorkspaces` (diretórios conhecidos do remoto)**

- Fica preso a `SourceServerRecord`, com entradas `{ workspacePath, workspaceIdentity, label? }`, schema `.default([])`, e dados persistidos antigos sem a chave recebem array vazio na etapa de parse; não cria chave nova em AppSettings e troca de vida junto com o registro do dispositivo.
- O único ponto de escrita é `recordHandshake`: um handshake bem-sucedido substitui o conjunto pelo `ServerRemoteInfo.workspaces[]` remoto (retornar array vazio significa limpar), no máximo 20 entradas por dispositivo; falha de conexão / desconexão não toca nada. Protocolo sem o campo `workspaces` segue o caminho já existente de falha de handshake, sem degradação silenciosa para array vazio.
- Identidade: quando a entrada remota não tem `workspaceIdentity` ou ele não corresponde ao dispositivo / ao caminho, completa-se com `buildServerRemoteWorkspaceIdentity({ serverId: sourceServerId, workspacePath })` como identity estável de nível de dispositivo; a mesclagem e deduplicação com o `workspaceHistory` local são sempre feitas por `workspaceKey`, e é proibido igualar apenas pelo caminho. Esse campo não carrega `profileId`, e o quick-open apenas preenche o caminho, submetido pela conexão já estabelecida.

**8.4.2 `removeSourceServer(sourceServerId)` (remove todas as conexões)**

- Superfície de remoção: todos os Profiles do dispositivo (active / retired) e suas credenciais, todas as entradas do `workspaceHistory`, o próprio registro em `sourceServers` (incluindo `declaredWorkspaces`); o ledger de migração e os dados remotos não são afetados.
- Ordem: ① o Manager descarta de forma idempotente as conexões em execução → ② `await onBeforeSourceServerRemoved(sourceServerId)` (a montagem de produção do Host desktop precisa injetar essa callback; dentro dela, o callback desanexa os recursos de Runtime do dispositivo) → ③ o Directory faz uma única escrita em AppSettings dentro de um único `enqueue`, e as credenciais seguem o backup-antes-de-apagar e o rollback-em-caso-de-falha de `removeProfile` → ④ publica o snapshot de gerenciamento.
- Códigos de erro: a ausência da callback impede a execução com `source-server-remove-callback-missing`; a falha da callback aborta sem apagar nenhum registro persistido com `source-server-remove-callback-failed`; falha de persistência / remoção de credenciais entra no estado de recuperação «registro do dispositivo preservado, conexões já desconectadas» com `source-server-remove-persist-failed`. Dispositivo inexistente retorna sucesso como operação vazia. Os testes de camada de serviço e de UI afirmam os códigos de erro, e não o texto das exceções.
- UI: o menu de mais do dispositivo oferece «remover todas as conexões» em todos os estados de instalação, sem depender de o dispositivo estar online, com confirmação secundária em danger; apenas «mostrar na barra lateral» depende de estar online.

**8.4.3 Evento de mudança do diretório e generation unificada**

- `SourceServerDirectory.onDidChange` dispara a cada persistência bem-sucedida no `enqueue`; o serviço de gerenciamento combina esse evento com `manager.onDidChangeState` em uma mesma `generation` monotônica, exposta via RPC como `onDidChangeDirectory`, com payload `{ generation }` (`sourceServerManagementDirectoryDeltaSchema`). Uma mudança no conteúdo do snapshot sempre vem acompanhada de incremento da generation.
- `getSnapshot()` usa leitura otimista: registra `startGeneration` → lê directory / states / counts → compara com `endGeneration` e, se divergirem, relê tudo, sem produzir «conteúdo antigo + número de versão novo».
- O snapshot de gerenciamento não pode esperar o RPC de estatísticas remotas: o directory e o estado das conexões são retornados primeiro, e o Host lê as estatísticas de migração de forma independente, conforme as conexões físicas atuais. `migrationCounts` distingue `loading`, `unavailable`, `requires-connection` e o `available` com valores reais; o total de topo só agrega os itens available e não representa os demais como zero. Há no máximo um conjunto de requisições de estatísticas em trânsito por conexão, e a conclusão das estatísticas eleva a generation pelo evento de mudança de diretório já existente, notificando a atualização; um Source lento ou com falha não bloqueia os outros Sources nem a desconexão manual. Resultados antigos de troca de conexão, remoção e dispose não podem ser publicados. Mudanças no diretório e as tentativas de migração / desistência invalidam as estatísticas; invalidações em trânsito são combinadas em uma única releitura após a conclusão, sem acrescentar polling temporário nem retentativas infinitas.
- A entrada explícita de refresh da página usa `getSnapshot({ refreshMigrationCounts: true })` para solicitar a atualização das estatísticas em segundo plano; leituras orientadas a evento usam o padrão false e leem apenas a projeção, evitando que o evento de conclusão das estatísticas dispare uma nova leitura remota. Esse parâmetro opcional é validado pelo Host por schema estrito e pertence apenas ao serviço de gerenciamento local da mesma versão de Desktop, sem alterar o protocolo de Server/Agent remoto.
- Todos os pontos de assinatura de snapshots de gerenciamento no Renderer assinam os dois eventos e os convergem em uma mesma fila de refresh in-flight / queued, ordenando por «generation abaixo do valor já observado é descartado»; o callback de directory de `useRemoteWorkspaceHistory` apenas atualiza o snapshot e não dispara reconexão automática.

**8.4.4 Preferência de conexão `remoteStartupAutoReconnectEnabled`**

- Booleano de topo em AppSettings, com padrão `true` e campo ausente tratado como `true`; tanto o schema completo quanto o schema de patch declaram o campo, e um `false` explícito não pode ser removido antes da gravação em disco.
- Serve apenas de gate para a entrada de reconexão silenciosa na inicialização do Host (`listStartupReconnectCandidates → reconnectOnStartup`), sem afetar a conexão manual nem a recuperação retrying / offline após desconexão; a alteração é persistida imediatamente e vale na próxima inicialização. Só a página de configurações do desktop oferece a entrada, e nenhum novo RPC entre lados é criado.
- Não se oferece uma preferência global de modo de download padrão (a decisão de 2026-08-28 revogou `remoteDefaultAssetInstallMode`); o formulário de nova linha SSH parte sempre de `local-download-upload`, e o `assetInstallMode` do próprio Profile tem precedência.

## 9. Migração de dados (D7 / D8)

As evoluções de schema entram unificadas no ledger (livro-razão) oficial de migration do banco
físico: as tabelas anexas de Controller/Source entram, conforme a finalidade, em
`tasks_schema_migration`, e a tabela de session identity entra no `schema_migration` do CLI.
O Repo deixa de criar tabelas/acrescentar colunas por conta própria. Regras de compatibilidade
do schema antigo, de planos não concluídos e de rollback estão em
[`Task SQLite Index: tabelas anexas do R3 no ledger de nível de banco`](../task/task-sqlite-index.md#r3-附加表纳入库级账本).
Os seguintes ledgers de workspace, que mesclam dados por workspace, continuam responsáveis pelo
progresso de negócio e não substituem a versão de schema de nível de banco.

### 9.1 Migração do lado do Controller (primeira inicialização após upgrade do App)

Entrada: `~/.zcode/v2/setting.json#lastWorkspaceSession[kind="remote"]` (conexão e workspace
unificados, ≤20 entradas) + em `credentials.json` as chaves
`remote-workspace:<workspaceKey>:{password,private-key-passphrase,server-token}`.

```text
cada remote entry
  ├─ target snapshot ──deduplicado por (transport, target normalizado)──► ConnectionProfile (novo profileId)
  │     └─ redirecionamento de credential key: remote-workspace:<key>:* → connection-profile:<profileId>:*
  │        (as N credenciais de vários diretórios do mesmo host convergem para 1; a key antiga
  │         é mantida até o R4 para então ser removida)
  ├─ workspacePath + lastOpenedAt ──► histórico de abertura de workspace (referencia o profileId;
  │                                    o sourceServerId será preenchido no handshake)
  └─ a identity antiga é preservada na entrada de histórico, como fallback para o casamento
     com o histórico remoto na abertura
```

- A migração é puramente local, idempotente e concluída na etapa de parsing do schema (seguindo
  o padrão já existente de `migrateLegacyWorkspaceSession`); a falha não bloqueia a inicialização
  do App, apenas afeta a exibição na página de conexões e pode ser repetida. O rejected
  initialize flight do Directory precisa ser limpo, permitindo a retentativa explícita posterior; o
  Window Host, independentemente do resultado da migração, precisa expor primeiro o local base
  attachment, proibindo que a falha de diretório do Source Server trave junto o workspace local.
- Quando existem múltiplas credenciais para o mesmo target (cada entrada de workspace guarda uma),
  os metadados não sensíveis do target vêm da entrada com o `lastOpenedAt` mais recente; a senha e
  a passphrase da chave privada são tomadas, cada uma, da primeira entrada em que o "valor de
  credential de fato existe" após varredura em ordem decrescente de `lastOpenedAt`. Uma origem
  vazia não pode sombrear uma irmã válida mais antiga.
- A criação de um novo Profile e a migração usam a mesma seam de credenciais: o Host que possui o
  target em texto claro gera o `profileId` e então grava a senha/passphrase em
  `connection-profile:<profileId>:*` e a referência na mesma operação de persistência. A migração
  só grava a nova referência depois de a cópia do valor ter sucesso; uma origem vazia continua
  expressando a necessidade de credencial interativa, proibindo criar key pendurada.
- Dentro da janela de compatibilidade do R4, ao projetar um workspace Source estável para um
  Desktop antigo, o Renderer precisa materializar o secret do Profile em um mirror independente
  por workspace, `remote-workspace:<legacyWorkspaceKey>:*`, e gravar primeiro o secret e só depois
  submeter a referência de `lastWorkspaceSession`. A key antiga serve apenas para compatibilidade
  de rollback; a cadeia principal atual continua consumindo apenas a credential do Profile.
- `sourceServerDirectoryMigrationVersion=1` não garante que a credential esteja completa; o
  initialize do Host faz uma auditoria idempotente nos Profiles SSH ativos, reparando apenas
  valores canônicos ausentes com irmãos legacy de mesma route normalizada, sem adivinhar por
  similaridade de alias/hostname.
- `SourceServerRecord` não é criada nesta etapa — ela só pode vir de um handshake real
  (`sourceServerId` desconhecido); um Profile sem handshake é exibido de forma independente na
  página de conexões e, após a primeira conexão bem-sucedida, é mesclado ao card do Server por
  `sourceServerId`.
- Linhas do `tasks-index.sqlite` local do Controller que referenciam a identity remote antiga são
  reescritas para a nova identity após o primeiro handshake do Server correspondente, nunca
  descartadas silenciosamente. O inventário por tabela está abaixo (já implementado:
  `packages/services/src/session/controllerRemoteIdentityMigration.ts`; incorporado em 2026-09-13
  a partir de `docs/archive/remote-r3/r3-controller-remote-row-migration-inventory.md`). O
  `tasks-index.sqlite` do lado do Controller é apenas uma casca de Controller / registro de
  agendamento, não a autoridade do corpo das Sessions remotas; o `lastWorkspaceSession` antigo e as
  credential keys antigas permanecem somente para leitura até o R4.

| Tabela/campo                                                   | Semântica atual                                        | Ação no R3                                                              | Regra de conflito/reconciliação                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `tasks.workspace_key/workspace_identity/meta_json`            | Membership/cache de task do Controller                | Reescreve a nova key por `(oldWorkspaceKey, task_id)`; corrige a identity do meta em sincronia | Quando a nova key já tem a mesma task, mantém a casca com data de atualização mais recente; o corpo não está neste banco, não há julgamento de conteúdo de Session |
| `task_group_members.workspace_key/workspace_identity`         | Referência de membership de group local                | Reescreve na mesma transação das linhas de task                        | Em conflito na mesma task, mantém o membership de destino; não pode gerar member duplicado          |
| `task_group_workspace_bootstraps.workspace_key`               | Marcador do primeiro bootstrap de group do workspace   | Reescreve a key                                                        | Se o destino já tiver marcador, remove o antigo; o id do group é mantido, evitando reordenação       |
| `task_group_view_node_orders.node_key` (`node_type='task'`)    | Chave de ordenação `JSON.stringify([workspaceKey, taskId])` | Após o parsing do JSON, substitui apenas a workspace key             | Se o node de destino já existir, mantém a ordenação de destino; key histórico inválido é pulado e contado no relatório |
| `automations.workspace_key/workspace_identity`                 | Definições de cron do lado do Controller               | Mantém o registro e reescreve a identity, sem alterar `location_kind` | Automations remotas do R3 não abrem entrada de execução; a migração só impede que o registro se perca, não muda o limite de capacidade de agendamento |
| `automation_runs.workspace_key`                                | Reconciliação/histórico de execuções de cron           | Reescreve junto com a identity da automation                           | `run_id` é chave primária, não é mesclado por atualização da workspace key                        |
| `off_peak_tasks.workspace_key/workspace_identity`              | Registros de tarefas ociosas                            | Mantém o registro e reescreve a identity                                | Conflito de binding ativo da mesma session é cancelado conforme o julgamento abaixo; o R3 não amplia o agendamento remoto ocioso |
| `workspace_alias` / `workspace_migration_*`                    | Canonical/ledger exclusivos do Server remoto           | O lado do Controller não cria nem lê                                    | Essas tabelas pertencem só ao tasks-index do Source Server; é proibido misturá-las com a migração do Controller |

Não precisam de reescrita: `task_groups` (não é localizado por workspace key), as linhas de
`task_group_view_node_orders` com `node_type='group'`, as linhas de workspace local e as linhas de
path-key do próprio host remoto, o `session/message/part` do `db.sqlite` do CLI (tratado pela
migration canonical do lado do Source Server) e a projeção em memória do Controller (substituída
atomicamente pelo novo source snapshot no primeiro handshake / na reconexão).

Transações e rollback: cada workspace é reescrito em uma única transação, gravando o ledger
`controller_remote_identity_migrations` (key antiga/nova, contagem de linhas antes/depois por
tabela, status, erro); a falha em qualquer tabela reverte a transação inteira. Depois da migração
há uma reconciliação mecânica: as contagens de membership de `tasks`, member de group, automation,
automation run e off-peak devem ser iguais antes e depois, e a contagem de linhas da key antiga
deve ser 0.

O fechamento de falha precisa preservar o erro de migração original. Depois que o SQLite reverte
automaticamente por FULL/IOERR, a limpeza não pode sobrescrever o erro original com "sem transação
ativa"; a auditoria failed do lado do Controller é escrita em best-effort e, mesmo que a base de
auditoria não possa ser gravada, retorna um relatório failed com o erro original, sem interromper o
handshake por causa de uma segunda falha de auditoria. O rollback transacional da mesclagem de
aliases remotos segue a mesma regra.

Julgamento de conflito de binding ocioso (CR-03, compartilhado entre o Controller e a mesclagem
canonical remota): no mesmo banco, quando a key de origem e a key de destino têm o mesmo
`session_id` não vazio e o `status` de ambas não é `completed/failed/cancelled`, a linha ativa de
destino é mantida; a linha conflitante de origem passa primeiro a `cancelled` e só então tem sua
identity reescrita junto com as demais linhas de origem, sem apagar histórico. O cancelamento
segue a semântica de persistência de estado terminal: grava `ended_at/updated_at` do momento da
migração, limpa `failure_reason`, define `schedulable=0`, `claim_running=0`, `claimed_at=NULL`; o id
do objeto, as referências de session/conversation, os tickets e o estado de baixa existente
permanecem inalterados, e o estado terminal não baixado fica por conta do outbox existente. A linha
de destino, as linhas de estado terminal já existentes, as sessions vazias, outras sessions e o
estado de execução de outros workspaces permanecem inalterados. O julgamento de conflito e o
rekey devem ocorrer na mesma transação `BEGIN IMMEDIATE`; em falha posterior, o rollback também
reverte o cancelamento; a retentativa não modifica de novo linhas já migradas. Múltiplas variantes
de source são processadas na ordem já estabelecida do frozen plan; quando o destino originalmente não tem a
linha ativa daquela session, a linha migrada primeiro passa a ser o destino de retenção das
conflitos seguintes. Conflitos de task identity já existentes no Source Server continuam sendo
rejeitados pela pré-verificação, e não podem ser contornados por isso.

### 9.2 Resolução e mesclagem da canonical key remota (autonomia do Server Core)

O princípio do R3 para os dados remotos já existentes: **se não precisa mexer, não mexe**. O
Desktop de versão antiga (a cadeia principal antiga rodando o código antigo) reconhece apenas a
antiga key derivada da route, de modo que qualquer camada de compatibilidade que dependa da
cooperação do código antigo é inválida; por isso a compatibilidade só pode acontecer na camada de
forma dos dados — o R3 faz a nova cadeia principal **continuar lendo e escrevendo keys no formato
antigo**, obtendo independência de route pela resolução de alias:

```text
Camada de localização de workspace do Core recebe { workspacePath, legacyRouteHint? }
  │
  ├─ a tabela de alias já tem registro deste path ──────────────► usa a canonical key do registro (zero mudança de dados)
  │
  ├─ sem registro, varre as variantes remote:* deste path nos dois bancos
  │    ├─ exatamente uma key (usuário de uma única linha, a maioria)─► essa key é a canonical, grava na tabela de alias (zero mudança de dados)
  │    ├─ múltiplas keys (histórico de múltiplas linhas)──► escolhe a key mais recentemente ativa como canonical, as demais linhas de variante são mescladas de uma vez na canonical
  │    │                            (backup antes + migration ledger + relatório de conflitos, ver abaixo)
  │    └─ existe também histórico do path-key local da própria máquina ──► não mescla (o histórico local remoto permanece independente, unificado no R4)
  │
  └─ sem histórico algum (workspace novo)──► usa legacyRouteHint como canonical e grava na tabela de alias
                                    (garante que, na versão antiga, ao conectar pela mesma linha as
                                     novas tasks também fiquem visíveis)
```

- A tabela de alias fica no `tasks-index.sqlite` remoto
  (`workspace_alias(path, canonical_key, created_at)`), é uma pequena tabela anexa exclusiva do
  código novo, e o código antigo não a percebe nem é afetado.
- **Usuários de uma única linha (a maioria): linhas de task, linhas de session e o diretório de
  configuração `sessions/<hash>` não têm nenhuma mudança**. Versões nova e antiga leem e escrevem
  o mesmo conjunto de linhas: após o rollback, as sessões existentes ficam visíveis e podem ser
  continuadas; as mensagens acrescentadas na mesma session pela versão nova também ficam visíveis
  na versão antiga (messages/parts são relacionadas por session_id), e vice-versa.
- A mesclagem de múltiplas linhas trata apenas "múltiplas variantes remote:\* do mesmo path", com
  objeto de migração e julgamento fixos como segue:

  | Objeto                                                     | Regra de mesclagem                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
  | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `tasks`                                                    | A task única é migrada para a canonical; tasks com o mesmo `taskId` mesclam os metadados de shell; os campos do meta priorizam o registro com `updated_at` mais recente (em caso de empate, o source tem precedência), e a projeção de status/provider/mode/model/migration/fork/cron/off-peak permanece consistente com o meta mesclado; `createdAt` toma o mais antigo, `updatedAt` o mais recente, o title prioriza a versão manual do usuário, e pinned/archived/deleted seguem `deleted > archived > pinned > normal`; o índice do corpo mantém o valor não vazio da canonical, senão o do source; `unreadAt` toma o maior valor não vazio dos dois lados, `lastUnreadAt` toma o maior entre os marcadores históricos dos dois lados e o unread mesclado; se as identidades de cron/off-peak/fork forem incompatíveis, há conflito de workspace inteiro |
  | `task_group_members` / `task_group_workspace_bootstraps`  | Acompanham o rekey de task/workspace; quando a canonical já tem a mesma task/bootstrap, mantém a linha da canonical e remove a linha duplicada do source                                                                                                                                                                                                                                                                                                                                                                                                                                            |
  | `task_group_view_node_orders`                             | Altera apenas a key estruturada com `node_type='task'` e `node_key=[workspaceKey,taskId]`; quando a canonical já tem a mesma key, mantém a ordenação da canonical                                                                                                                                                                                                                                                                                                                                                                                                                        |
  | `automations` / `automation_runs`                           | Rekey total de `workspace_key`; quando existe `workspace_identity`, altera em sincronia para a canonical; o id do objeto, as referências de task/session e o estado de execução não são reescritos                                                                                                                                                                                                                                                                                                                                                                                                                      |
  | `off_peak_tasks`                                          | Após manter a linha ativa da canonical e cancelar a linha conflitante do source conforme o julgamento de binding ocioso de §9.1, faz o rekey total; preserva todo o histórico e as referências de objeto, e o estado de execução das linhas sem conflito não muda                                                                                                                                                                                                                                                                                                                                                                                                               |
  | `~/.zcode/cli/db/db.sqlite#session`                       | Altera apenas o `workspace_id` das variantes do mesmo path para a canonical; o corpo de messages/parts não é reescrito                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
  | `~/.zcode/v2/sessions/<hash>`                             | Mescla recursivamente o diretório de hash do source: se o destino não existe, move; se o mesmo caminho relativo tem bytes idênticos, deduplica; se o tipo é diferente ou os bytes diferem, faz fail-closed do workspace inteiro antes de qualquer backup/movimentação                                                                                                                                                                                                                                                                                                                                                                                                      |

- A mesclagem do meta de tasks duplicados continua sendo feita por campo: quando o registro mais
  recente não tem um determinado campo, mantém-se o valor do registro mais antigo, e o valor não
  pode ser sobrescrito pela projeção NULL da linha mais recente. Quando o meta antigo não carrega
  o campo, mantém-se a projeção não vazia da linha mais recente entre os dois índices, o que
  dá compatibilidade com os registros históricos de cron/off-peak que só preenchem as colunas de
  índice. O reparo da projeção, a gravação do meta e a remoção do source ocorrem na mesma
  transação do task DB; cron/off-peak/fork continuam tomando o meta como campo de referência e
  as colunas de índice históricos como fonte dos campos ausentes, e só então se executa a
  pré-verificação de conflito de identidade; mesmo que os dois JSON de meta sejam idênticos, se as
  identidades efetivas dos dois lados forem diferentes a operação deve ser rejeitada, e não é
  permitido sobrescrever a identidade pelo mais novo.
- O índice de task projetado deriva de colunas `cli_*` o título, as datas de criação/atualização e
  o status, e a mesclagem precisa sincronizar esses fatos de CLI, com as mesmas regras de
  `TaskIndexRepo.applyCliFacts`: `cli_created_at` toma o mais antigo, `cli_updated_at` o mais
  recente; quando o `cli_last_outcome` da linha mais recente está vazio, mantém-se o valor mais
  antigo; a origem de título custom não é sobrescrita por uma não custom; `cli_deleted` toma o
  máximo e `handoff_pending` a união. As linhas do Source Server compartilham o mesmo owner host,
  então `host_id`/`root_path`/`project_id` seguem a linha da canonical; bancos que passaram
  apenas pela migration de schema de tasks, sem essas colunas, são mesclados pelas colunas
  antigas.
- O "registro mais recente" dos fatos de CLI é determinado apenas pelo `cli_updated_at` dos dois
  lados, independentemente do julgamento dos campos de casca por `updated_at`; o lado sem fatos de
  CLI (`cli_updated_at` vazio) não vence, e em caso de empate vale a precedência do source. A
  migration do ACP ID antigo apenas eleva `updated_at` e não altera `cli_*`; as duas colunas podem
  divergir em bancos existentes, e `updated_at` não pode substituí-la.

  ```text
  meta mais antigo + meta mais recente → meta mesclado → atualização da projeção do índice na mesma transação → remoção da linha do source
                                      └─ falha → rollback da transação inteira do task DB
  ```

- A pré-verificação de conflitos cobre a task identity e as colisões de arquivos em
  `sessions/<hash>`. Por padrão o conflito mantém o workspace em fail-closed, com os dados de
  ambos os lados no local, sem qualquer movimentação; nesse caso a detecção de conflito vem antes
  do backup, portanto não se pode afirmar que "já existe backup". Reabrir o mesmo conflito
  inalterado apenas atualiza o mesmo ledger/conjunto de conflitos em falha, sem criar novo ledger
  nem criar backup. O conflito de identidade é uma decisão determinística do usuário; o
  `migrate retry`, com o conflito não resolvido, devolve um `workspace-task-identity-conflict`
  estruturado com `retryable:false` e não pode rodar em vazio e dizer que reteve.
  A transação de escrita incorpora um por um os sources na canonical na ordem dos sources, e cada
  source posterior é comparado com o resultado acumulado da mesclagem; a pré-verificação de task
  identity precisa acumular o resultado da mesclagem de cada `taskId` na mesma ordem, não pode
  comparar apenas o snapshot da canonical. Quando a canonical não tem a task ou não tem o
  campo de identidade correspondente, o conflito de identidade entre os sources é também
  detectado antes de contabilizar e fazer o backup:

  ```text
  canonical A sem T (ou T sem cron); source B.T cron=b, source C.T cron=c
    pré-verificação: merged[T] ← B.T → C.T vs merged[T] → conflito → reutiliza o ledger em falha, sem backup
  ```

- A camada de gestão oferece um "abandono conservado" explícito, em granularidade de **diretório
  inteiro**: a variante mais recentemente ativa passa a ser a canonical, e as demais variantes são
  seladas no local, sem movimentação; é proibido pular em granularidade de task. O ledger usa
  `status='abandoned'`, registra a canonical, o horário, o modo de disparo e o activity digest
  de todos os objetos de migração acima. Quando uma consulta posterior percebe mudança no digest,
  projeta `abandoned-diverged` e oferece uma nova tentativa de mesclagem; `failedPathCount`
  conta apenas `failed`, `abandonedPathCount` é uma contagem independente, e é proibido inferir
  um a partir do outro.
- O abandon obtém o lock de escrita do task DB depois de ler o snapshot de configuração e, dentro
  da transação, reexamina o `status='failed'`, o `phase IS NULL` e a não alteração da canonical e
  das variantes da mesma migration. Quando o plano já foi concluído, recuperado, removido ou
  alterado, rejeita e devolve um erro retentável, mantendo o ledger/alias atual; não se pode usar
  `updated_at` em milissegundos no lugar da comparação de planos. Dentro do mesmo Repo do Source
  Server, resolve, retry e abandon compartilham uma única fila serial por workspacePath
  (após trim), cobrindo a leitura do plano, o backup assíncrono, a movimentação de diretórios, a
  publicação do alias e o fechamento da conexão; o retry reutiliza o resolve interno dentro da
  fila, sem enfileirar de novo. A falha anterior ainda libera a fila, e a seguinte retoma a partir
  do ledger já confirmado; paths diferentes entram na fila de forma independente. Essa fila não
  substitui as transações de escrita do SQLite nem promete serialização entre processos.
- A entrada resolve consulta o ledger `abandoned` do path atual antes da varredura de
  alias/variantes. Quando o usuário não pediu explicitamente "tentar mesclar de novo", devolve
  diretamente a canonical congelada e `mergedKeys=[]`, independentemente de o digest ter mudado,
  permitindo a abertura do workspace; a mudança de digest apenas projeta o relatório como
  `abandoned-diverged`. Somente o retry explícito reativa o ledger e entra no conflict preflight.
- Sem conflito, primeiro são criados os backups dos dois bancos e então o progresso avança por
  phase em forward-only; os backups servem apenas para recuperação manual de desastre e não
  automaticamente revertem fases já confirmadas:

  ```text
  resolve(path)
    ├─ ledger ativo com running/failed + phase
    │    └─ congela migrationId + canonical + variants, continua a partir da phase registrada
    └─ sem ledger ativo
         └─ varre variants + elege canonical + conflict preflight
                │
                ▼
            phase=preflight
                -> backups-created
                -> task-db-merged
                -> session-db-merged
                -> config-dirs-merged
                -> alias-published
                -> completed
  ```

  A escrita de cada fase precisa ser idempotente, e o ledger só avança depois de a fase terminar;
  quando o trabalho da fase já foi feito mas o ledger ainda não avançou, a reexecução da mesma
  fase também precisa convergir. O ledger ativo tem prioridade sobre a varredura de
  alias/variantes; durante a recuperação é proibido reelegir a canonical ou criar um segundo
  ledger; as novas variantes que surgirem depois do início da migração ficam para a próxima
  migração incremental, após o completed desta rodada.

- O resume não pode pular condições de conflito que ainda podem mudar. Antes de entrar em
  `task-db-merged` é preciso revalidar, dentro da mesma transação de escrita do task DB, a task
  identity das variantes congeladas; ao encontrar um novo conflito, faz rollback da fase
  inteira, o ledger permanece failed, e é proibido marcar como completed com o "conflito mantido
  mas memberships/automation/session rekeyed". Quando a movimentação real dos diretórios de
  config encontra um conflito novo após o preflight, a phase atual também permanece failed, sem
  publicar alias/completed.
- O schema do ledger precisa ser reconstruído de forma versionada, preservando as linhas
  existentes e adicionando de uma vez as colunas de phase e de auditoria `abandoned`; não se
  pode depender de `CREATE TABLE IF NOT EXISTS` para reescrever constraints CHECK já existentes.
- A mesclagem é idempotente e incremental: as novas linhas de variante escritas a partir de uma
  "linha não canonical" durante a coexistência com o Desktop de versão antiga são incorporadas na
  próxima vez em que o Core resolver aquele path.

### 9.3 Limite de compatibilidade entre versões antigas e novas (coexistência e rollback)

| Cenário                                    | Comportamento                                                                                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Usuário de uma única linha faz upgrade para o R3 e depois faz rollback | Zero mudança de dados; a cadeia principal antiga lê e escreve o mesmo conjunto de linhas com as keys de sempre: o histórico fica completo, é possível continuar a conversa, e as novas tasks/novas mensagens geradas durante o R3 também ficam visíveis                                |
| Desktop novo e antigo convivendo no mesmo remoto (mesma linha) | Ambos leem e escrevem as linhas da mesma canonical key: tasks e sessões ficam visíveis nos dois sentidos e a continuação de conversa é interoperável. A diferença está apenas na camada de arquitetura (o lado antigo sobe um stdio server temporário, o lado novo conecta ao daemon), e não se atrapalham                    |
| Usuário de múltiplas linhas: rollback/coexistência a partir de uma linha mesclada | As linhas de key antiga daquela linha já foram incorporadas à canonical, então o lado antigo deixa de ver o histórico mesclado ao acessar por aquela linha (os dados não foram apagados; backup e ledger permitem a reconciliação); a partir da linha canonical o acesso é completo. É uma borda estreita, coberta pelo texto de gradual rollout |
| Workspace criado pelo R3 em um servidor novo | canonical = a key no formato antigo da linha atual: visível e continuável a partir da versão antiga conectada pela mesma linha                                                                                 |

### 9.4 Segurança de rollback

- Remoto: para o usuário de uma única linha não há perda por natureza (zero mudança de dados); a
  mesclagem de múltiplas linhas tem backup + ledger + relatório, e em casos extremos é possível
  recuperar manualmente; o corpo das sessions (messages/parts) nunca é reescrito. A tabela de alias
  e o ledger são acréscimos puros, ignorados pelo código antigo.
- Controlador: a remote entry de `lastWorkspaceSession` continua sendo salva no R3 em uma
  representação legacy route-compatible, proibindo gravar `remote:server:*`; após o rollback para
  a versão antiga, os campos antigos continuam utilizáveis. Em tempo de execução no R3, as tabs de
  tab/history/credential/UI store precisam ser projetadas como uma única workspaceKey stable pela
  projeção `sourceServerWorkspaceHistory.legacyWorkspaceIdentity -> workspaceIdentity`, e a UI não
  pode restaurar simultaneamente a legacy e a stable.
- Quando o Desktop faz o primeiro binding de um workspace Source, a resposta do bind do Host pode
  carregar um hint de rekey `previousWorkspaceIdentity` de uso único; o Renderer precisa reutilizar
  o `ensureWorkspaceTab()` existente para trocar a tab legacy pela stable no lugar, sem produzir um
  segundo workspace via `addTab()`. Esse campo não é a identidade de roteamento de tasks, serve
  apenas para o rekey de tab `continuous` do Desktop; o attachment `replayable` do celular o
  ignora.
- Ordem do gradual rollout: validação interna → rollout em pequena proporção (com conferência
  especial da taxa de acerto de alias, do ledger de mesclagem de múltiplas linhas e da reconciliação
  de tasks) → ampliação → total; as três formas de conexão trocam de versão em conjunto, sem
  separar por transport.
- R4 (fim da janela de migração, depois que a versão antiga sai do suporte) é feito em duas
  etapas, que podem ser desacopladas: ① remover o código de compatibilidade (leitura dos registros
  de conexão antigos, `legacyRouteHint`, parsing do formato antigo, limpeza dos arquivos soltos
  antigos) — só código, risco baixo; ② limpeza da canonical key — na inicialização do CLI do
  Server da versão R4, reescreve de uma vez a canonical key como server-local key, mescla o
  histórico local do próprio host remoto e remove a camada de alias. A limpeza é totalmente
  transparente para o Desktop: o wire de localização de workspace do Source Server no R3 só
  transporta `{ workspacePath, legacyRouteHint? }`, e o `workspaceIdentity` stable é usado apenas
  para o isolamento do lado Desktop/Host, sendo a canonical sempre um detalhe interno de armazenamento
  do Core. Portanto, a limpeza é apenas uma atualização de versão do Server remoto, sem exigir uma
  release coordenada do Controlador; quando o cronograma apertar, pode ser adiada para depois do
  R4.

## 10. Projeção do Controller e superfície de produto multi-Source (D11)

### 10.1 Evolução da projeção

O estado e os comandos de gestão de Sources são possuídos em um único ponto pelo Window Host:

```text
Desktop Renderer ── SourceServerManagementService ──► Directory + ConnectionManager
Desktop Renderer ── source-settings attachment ─────► channels de configuração online do Source
Mobile /remote   ── existing workspace attachment ──► proibido management/source-settings
```

- `getRecentOperationLogs(profileId)` consulta até 100 linhas de log da última conexão ou
  atualização do dispositivo correspondente; `onDidAppendOperationLog` notifica a interface para
  reler. O registro único pertence à memória de runtime do ConnectionManager do Host; uma
  reconexão interna atualizada faz parte da mesma operação, e uma nova operação substitui o
  registro antigo; saídas concorrentes que chegam atrasadas não podem sobrescrever, e a troca de
  identidade migra para o novo Source/Profile, mantendo o dispositivo antigo com o histórico
  anterior. Fechar o painel não limpa nada: a limpeza ocorre ao remover o registro correspondente e
  na saída do Host, e nada é gravado em settings.
- `SourceServerManagementService` oferece o snapshot inicial de directory/state, o incremento de
  estado por generation monotônica, connect/disconnect/update/rename/preferred/remove e a
  contagem de migração; mudanças no Directory precisam ser aplicadas por snapshot completo ou por
  delta de directory tipado para atualizar `servers/profiles/history`, e não é permitido atualizar
  apenas `states`. A contagem de migração é expressa por Source como
  `available | requires-connection | value`, e o offline não pode se passar por 0. O Renderer não
  sobrescreve mais o settings com o array inteiro.
- O attachment `source-settings` não é vinculado a workspace nem inicia o Agent runtime, e expõe
  apenas channels de configuração não Provider, como MCP/skills/plugins/commands/hooks/subagents/
  memory/output/settings-sync; é destruído assim que o Source fica offline.
  A superfície de configuração de Provider não está nele: a página de settings de modelo é
  vinculada ao local (§8.2) e a configuração remota é enviada pelo Provisioning (§8.3).
- As duas capacidades são registradas apenas no attachment `desktop-continuous`; o
  `web-remote-replayable` é rejeitado pelo Host mesmo que o scope seja construído; o celular segue
  consumindo apenas as projeções existentes de workspace/task.

- O source scope de `ControllerProjection` evolui de `remote\0remoteSessionId\0workspaceKey` para
  ter `sourceServerId` como primeira dimensão (o source local mantém `local\0workspaceKey`); os
  workspace facts de `controller/workspaces` ganham `sourceServerId`, `serverDisplayName`, o
  estado online e o "último horário online".
- As semânticas de assinatura/seq/gap/resync do R1, a invalidação em nível de query, o
  single-flight e o congelamento offline permanecem inalteradas.
- As entradas de workspace, timeline, grouped, archived e pinned preservam a atribuição de Source
  da task; a lista de projetos é achatada, e as informações de dispositivo, o placeholder offline, a
  ordenação e as ações seguem a [especificação de navegação de projetos](../remote/project-first-remote-navigation-spec.md).
  O nome de exibição não participa da identidade, da deduplicação nem do isolamento de
  persistência, e o online do dispositivo não substitui o attachment ready.
- As operações de escrita (abrir/pin/archive/continuar) são sempre roteadas para o Source Server
  ao qual a task pertence; quando offline, falham explicitamente e revertem o estado otimista
  (semântica fail-closed do R1).

### 10.2 Lista da superfície de produto

- [UX de conexão](remote-device-connection-ux-spec.md) mantém o assistente unificado de cinco
  estados e três telas, a confirmação de instalação, o card de dispositivo, os logs, a lista de
  tasks somente leitura e os avisos de atualização; o antigo esquema de três tabs/cinco passos
  não é mais usado.
- [Navegação de projetos](../remote/project-first-remote-navigation-spec.md) mantém os projetos
  achatados, a seleção de diretório após a conexão, a retomada de projetos existentes, a
  recuperação após desconexão e reinício; a UI de chat sem projeto no remoto é desativada, mas os
  dados são preservados.
- A primeira explicação de execução contínua fica na página de diretório, é pontual, não
  bloqueante e segue o registro de onboarding versionado; o modal de fronteira que exigia
  confirmação não aparece mais.
- [Compatibilidade de projeção e persistência](remote-domain-simplification-and-conversation-workspace-spec.md)
  mantém o open set, o fechamento explícito, o strict schema e as migrações restantes do R4.
- [Reanexação do Renderer](../remote/desktop-remote-session-renderer-reattach.md) mantém o
  reanexamento de projetos quando o dispositivo fica online; o ciclo de vida da conexão
  subjacente continua conforme §7.
- O settings de modelo é vinculado ao local (§8.2) e o Provider é enviado automaticamente
  (§8.3); as demais páginas de capacidade seguem seu próprio User/Workspace Scope.
- Remover o Profile usado pela conexão física atual ou pelo recovery owner equivale à desconexão
  explícita de todo o Source pela janela atual: cancela timer/flight, libera a conexão, limpa
  target/secret e publica um offline terminal. Mesmo havendo outros Profiles ativos, não há
  troca automática; remover um Profile que não é o atual não interrompe as outras conexões.
- Após o uninstall, o usuário decide se remove os registros da própria máquina; a desinstalação
  com reinstalação preserva a continuidade de identidade conforme §3.

## 11. Remoção da cadeia principal antiga e lista de retenção

Caminhos executáveis removidos ou desabilitados dentro do R3:

| Item tratado                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Destino no R3                                                                                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A cadeia principal e o conjunto de serviços com autoridade local misturada sob o provider `desktop-attached-remote`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Remover `createRemoteWorkspaceServiceCollection` e seus testes que só validam o ramo antigo; manter unicamente o conjunto de encaminhamento total                                                                                                                                                                                                                                       |
| A antiga entrada de conexão remota do Web/Lite `POST /api/connect-remote` + `/ws/remote/:id`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Remover as duas routes de pareamento em conjunto e travar com testes de 404 inacessível; o Server não pode mais iniciar a cadeia principal temporária por stdio                                                                                                                                                                                                                                               |
| Chamadores que tratam a identity derivada da route como a identity oficial de Controller/workspace                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Remover os chamadores sem chamada; a identity stable continua sendo construída por `sourceServerId + workspacePath`                                                                                                                                                                                                                                                       |
| O "sincronizar em um clique" do Provider e o seletor de dispositivo da página de settings de modelo, do começo do R3: channel `provider-sync`, `IProviderSyncService`, `packages/services/src/provider-sync/*`, os schemas `encryptedProviderSyncSnapshotSchema` / `providerSync*` de `shared/src/source-server/contracts.ts`, `ModelProviderSourceControls.tsx`, `useSourceSettingsAttachment.ts`, `providerSyncSnapshot.ts`, `packages/ui/src/lib/remoteWorkspaceProviderSync.ts`, `packages/ui/src/lib/zcodeModelSelectionResolution.ts`, `AppSettings.lastAgentSettingsSourceServerId\|providerSyncDefaultModel\|providerSyncRuntimeCredentialBindings`, `ServiceChannels.ModelProvider\|ProviderSync`, `oauthService.exportSessionForSync\|replaceSessionForSync` e a ação "ir sincronizar" do banner de conversa | Removidos em conjunto pela rota A quando o refactor do Provider foi mesclado na fase M2, em 2026-09-07 (ver [r3-provider-refactor-merge.md (arquivado)](../archive/remote-r3/r3-provider-refactor-merge.md)); os substitutos são o Provider Provisioning (§8.3) e a página de settings de modelo vinculada ao local (§8.2). O scope `source-settings` e o `sourceSettingsServiceCollection.ts` são mantidos, servindo apenas à superfície de configuração não Provider |

2026-09-29, acabamento visual: depois que a navegação de projetos achatados entrou em produção,
foram removidos o `WorkspaceSourceGroupHeader` sem referência em produção, os helpers de
preferências de agrupamento/colapso de dispositivos e seus testes dedicados antigos; o
`getWorkspaceSourceServerId` e a resolução de alias legacy preciso são mantidos. Essa limpeza não
toca a cadeia de compatibilidade do R4 listada abaixo.

Código-fonte mantido no R3, mas já inacessível a partir das entradas de produção, removido
fisicamente no R4:

- `packages/server/src/remote/connect.ts` (e as dependências diretas da cadeia antiga:
  `handshake.ts`, `stdio-socket.ts`), `deploy.ts` (e `remoteAssetDeployDecision.ts`,
  `zcodeAgentDeploy.ts`, ainda chamados estaticamente por ele) e
  `packages/server/src/entry-stdio.ts`. O R3 primeiro corta o caminho de execução removendo
  `/api/connect-remote` e os antigos chamadores do Desktop, mantendo uma janela de migração para
  rollback/diagnóstico do R2, para não misturar uma remoção ampla de módulos históricos no
  período de estabilidade da cadeia principal; o `pnpm dep:refs` já confirmou que os dois
  últimos ainda têm chamadores em produção, então não podem ser removidos como código morto;
- A construção SSH/WSL/Docker de `buildRemoteWorkspaceIdentity`. O Host ainda a usa para gerar
  o `legacyRouteHint` quando não há um valor histórico preciso; não é a stable identity oficial, e
  é removida junto com o hint no R4;
- A leitura e o parsing dos registros de conexão antigos (remote entry de `lastWorkspaceSession`,
  credential key `remote-workspace:*`);
- O parsing de `remote:ssh/wsl/docker:*` por `parseRemoteWorkspaceIdentity` (usado na varredura da
  migração remota);
- Os arquivos soltos antigos de `~/.zcode/server` no remoto (dependência de rollback do Desktop
  não atualizado);
- A leitura de compatibilidade do ledger/relatório de migração.

Retidos em longo prazo: as primitivas exec/upload/detect das três implementações de
`IRemoteBackend` (base dos Adapters), o dev de conexão direta `kind:"server"` e toda a cadeia de
attachments do celular.

## 12. Registro de implementação

Os cortes de implementação originais foram concluídos, e o processo está preservado no histórico
Git. Os itens restantes de release continuam conforme o [caderno de problemas](r3-source-server-remote-open-issues.md);
marcar esta especificação como implementada não significa que o candidato atual tenha concluído a
validação de release em todas as plataformas.

## 13. Mapeamento de aceitação e estratégia de testes

- Toda a matriz de aceitação do plano geral, REMOTE-01—15, é fechada pelo R3 (REMOTE-01 já é
  coberta pelo R1, com regressão aqui). Mapeamentos principais: REMOTE-02→§5.3; REMOTE-03→§4/§7;
  REMOTE-04/05→§7; REMOTE-06→§10; REMOTE-07 (troca de Source nos settings do Agent) e
  REMOTE-11 (sincronizar em um clique) foram invalidados pela decisão de 2026-09-07, e a aceitação
  substituta é a página de settings de modelo vinculada ao local de §8.2 + a barreira de primeira
  conexão do Provisioning de §8.3 / re-registro na reconexão / recusa de conexão por `unsupported` /
  recusa de stub replayable no celular / Secret fora dos logs (ponto de E2E: asserção de
  `provider-provisioning-state.json` em `SSH-P0-TASK-01`); REMOTE-08→§6.3; REMOTE-09/10→§3.2;
  REMOTE-12→regressão do R2+§7 recuperação; REMOTE-13→§5.3 desinstalação e §10.2 detecção de
  desinstalação; REMOTE-14→§10.2; REMOTE-15→testes de contrato de §5.1.
- A camada de evidências segue o item 5.3 do plano geral: UI / Process (um Host por janela, um
  daemon por root remoto, ≤1 Agent por workspace) / Protocol (o handshake retorna a versão e o
  `sourceServerId`, a escrita de rota carrega o Source) / Network (os três transports carregam o
  mesmo RPC, a desconexão não mata o remoto, secret não vai para o log) / Persistence (ledger de
  migração, Profile, resultados de sincronização reconciliáveis) / Recovery (reconexão, crash do
  Core, estado após upgrade conforme as regras).
- Testes de contrato são a única prova de "independente da forma de conexão": o mesmo conjunto de
  casos é executado com os três Adapters + Core fake; os testes da camada de negócio não têm
  ciência do transport.

## 14. Observabilidade

- A máquina de estados de conexão usa `info` de produção em cada transição, em cada fase do
  bootstrap e em cada fase da saga de migração; falha de retentativa automática/sondagem usa
  `warn`; falha irrecuperável de handshake/migração usa `error`; detalhes de alta frequência, como
  frame WS e heartbeat de sondagem, usam `debug`.
- `RemoteWorkspaceConnectionLog` continua atribuído por `windowId + requestId`, e o bootstrap
  reporta todas as fases de forma estruturada (detecção/progresso de upload/instalação/daemon/
  handshake/portão de migração).
- O Process Monitor ganha a dimensão Source Server: estado da conexão, `sourceServerId`, versão do
  daemon e número de attachments.
- ingress token, capability, Provisioning Envelope (Personal Layer e credenciais da allowlist) e
  credenciais SSH não podem aparecer em nenhum log/telemetria; o log de resultado do Provisioning
  registra apenas `environmentKey`, trigger, status, tempo decorrido e contagens.

## 15. Decisões tomadas e confirmações pendentes

Os itens a seguir foram decididos com o feedback de revisão (2026-08-18):

1. **Compatibilidade de rollback e coexistência**: no remoto não há reescrita destrutiva de keys;
   adota-se canonical key + resolução de alias (§3.2/§9.2). O usuário de uma única linha, após o
   rollback para a versão antiga, tem o histórico completo e pode continuar a conversa; a
   coexistência entre versões nova e antiga lê e escreve o mesmo conjunto de linhas; a limpeza
   server-local fica para o R4.
2. **Canal WSL**: na primeira fase, ponte stdio unificada, sem conexão direta ao localhost do host
   (deixado para otimização de performance posterior).
3. **Automations remotas**: não suportadas na primeira fase (o agendador está no Window Host, e o
   custo de portar é independente e considerável; o plano já lista a execução de tarefas
   perdidas como capacidade posterior); o daemon residente prepara o terreno para a implementação
   posterior, e a arquitetura não cria obstáculos.
4. **Limite de criptografia do envio de configuração de modelo** (originalmente "criptografia do
   sincronizar em um clique", em 2026-09-07 assumida pela rota A, que passou a ser assumida pelo
   Provisioning): o wire não faz uma segunda criptografia de camada de aplicação (o cipher de
   credential é uma chave de impressão digital local, inviável entre máquinas e com canal
   confiável); o lado do Source decifra os valores da allowlist e o lado de destino regrava em
   disco com o seu próprio Credential Store; secret não vai para o log (§8.3,
   provider-provisioning.md).
5. **Entrada dev `kind:"server"`**: usa o ingress token (o mesmo caminho de código do cliente).
6. **Semântica de janela**: projetada e aceita como janela única na primeira fase, e a reconexão
   automática na inicialização é executada pelo Host da janela principal.

Confirmações pendentes (não bloqueantes):

- A redação do gradual rollout para a borda estreita da mesclagem do histórico de múltiplas
  linhas (§9.3: após o rollback a partir de uma linha mesclada, a visão daquela linha não mostra
  o histórico já mesclado).
- Os cinco itens a seguir vêm da mesclagem do refactor do Provider (incorporados em 2026-09-13 a
  partir de [r3-provider-refactor-merge.md (arquivado)](../archive/remote-r3/r3-provider-refactor-merge.md) §7):
  - Caso o produto ainda precise de "ver / sincronizar manualmente a configuração de modelo de
    um remoto específico", reconstruir uma visão de dispositivo somente leitura sobre
    `IProviderSettingsService` com um botão explícito de "enviar agora" (reaproveitando
    `coordinator.requestAll("personal-config")`), sem ressuscitar o sistema `provider-sync` /
    journal.
  - A Environment key da lane de Provisioning é derivada por
    `buildRemoteEnvironmentKey(target)` conforme o transport e não é ligada ao `sourceServerId`;
    o mesmo Source conectado por linhas diferentes forma duas lanes (o resultado é idempotente,
    mas a sincronização de primeira conexão é duplicada). Pode-se avaliar usar o `sourceServerId`
    como key quando ele for carregado no descriptor.
  - `REMOTE_WORKSPACE_RPC_CONTRACT_VERSION` continua v1, mas o conjunto de channels mudou; hoje
    isso é coberto pela "porta de compatibilidade que exige a mesma versão por padrão". Se no
    futuro `zcodeCompatibility.minCompatibleVersion` for relaxado, é preciso primeiro decidir se
    se sobe para v2 e negociar isso no handshake.
  - A allowlist de `zcode uninstall` não inclui `config/`, e por isso
    `config/provider/zcode-builtin-*.json` permanece em `preservedPaths` após a desinstalação;
    incluí-la ou não na allowlist está pendente.
  - R3-ISSUE-012 (conflito de especificação sobre a persistência de API Key em texto claro) foi
    fechado como "não corrigir" conforme a nova linha de base de Personal Config em texto claro,
    conforme o caderno de problemas.
