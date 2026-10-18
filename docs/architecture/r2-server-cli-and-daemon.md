# Especificação do R2 — Server CLI e daemon independentes

## 1. Status e escopo

- Status: P0/P1 implementados; este hardening já completou a desconexão do processo pai do Core, a limpeza do ponteiro de atualização e a identidade estável do Server; o Linux x64 concluiu a verificação SSH em máquina real
- Fase: arquitetura unificada multicliente remota R2 / D4
- Objetivo desta fase: entregar um ZCode Server CLI instalável de forma independente, executável em segundo plano e desacoplado do ciclo de vida da UI
- Posicionamento deste documento: é a especificação de implementação e os limites do R2; o complemento de testes executáveis está em [R2 lifecycle test plan](./r2-server-cli-and-daemon-test-plan.md)
- O R2 não troca a cadeia principal de conexões remotas de produção do Desktop

Este documento parte de:

- [Arquitetura e proposta de produto unificadas de conexão remota multicliente do ZCode (rascunho de revisão)](https://internal-docs.example.invalid/redacted)
- [Especificação de refatoração de processo de Host único por janela do R1](./r1-single-window-host-refactor.md)
- [Fatos do runtime Electron/Node do Agent](../runtime-tools/agent-electron-node-runtime.md)
- [Plano de implementação da arquitetura unificada multicliente ZCode Lite / Server](./unified-zcode-lite-server-multi-server-plan.md)

O R2 entrega:

- o Server CLI `zcode` instalado de forma independente;
- `serve`, `serve --daemon`, `status`, `stop`, `restart`, `update`, `uninstall`;
- as fronteiras de processo de Supervisor, Server Core e Agent;
- serviços de autoinício em nível de usuário para macOS, Linux e Windows;
- semântica de instância única, backoff de crash e interrupção de tarefas;
- a fronteira de ingress HTTP/WebSocket e a verificação de compatibilidade com o Host RPC do R1;
- um runtime Node independente, consistente com o fluxo de assets remotos existente.

O R2 não entrega:

- Transport Adapters de SSH, WSL, Docker, Direct URL, WS/WSS;
- descoberta, instalação e gerenciamento de conexão do Desktop Host ao daemon do Server;
- Controller multisservidor para Web;
- criação independente de Server, Host ou Agent runtime pelo celular;
- `sourceServerId`, Connection Profile, Resource Store e o manifesto de compatibilidade completo;
- troca da nova cadeia remota de produção do Desktop.

## 2. Decisões centrais

| Item de decisão | Conclusão do R2 |
| --- | --- |
| Diretório do novo código | Criar `packages/zcode-server-cli`; o R2 não adiciona código em `packages/server` |
| Antigo `packages/server` | Serve apenas como referência dos comportamentos existentes de HTTP/WS, stdio, implantação remota e protocolo; mantém a compatibilidade das entradas atuais |
| Entrada do usuário | O pacote de distribuição independente fornece `zcode`; sem argumentos, continua entrando na TUI existente |
| Server Core | O novo diretório implementa uma nova entrada de Core e um novo contrato de ciclo de vida, sem herdar a semântica de processo do antigo `entry-http` / `entry-stdio` |
| Serviços de negócio | Reutiliza as capacidades de baixo nível de `@zcode/services`, `@zcode/shared`, `@zcode/rpc` e afins, depois de revisadas |
| Supervisor | Possui apenas o estado de ciclo de vida, não o estado de negócio de task/session/stream/queue/snapshot |
| Endereço de escuta | Endereço de loopback e porta dinâmica por padrão; escuta fora do loopback exige autenticação |
| Web / WS | O R2 implementa e verifica o ingress HTTP/WS do Core; o Transport remoto concreto fica para fases posteriores |
| Diretório de dados | Reutiliza `getZCodeDataRootDir()` e `ZCODE_DATA_BASE_DIR`; o diretório padrão é `<dataRoot>/server`. O serviço do SO precisa carregar o parâmetro interno `--server-root <absolute-path>` e não pode depender do ambiente do shell no momento do registro |
| Runtime Node | Reutiliza o Node `v22.16.0` do fluxo de assets remotos existente; o Server CLI não depende do Node do sistema nem do Node do Electron |
| Política de crash | Orçamento de 5 vezes/5 minutos, com backoff de 1, 2, 4, 8 e 16 segundos; ao exceder, entra em `crash-loop-stopped` |
| Recuperação de Task | Após um crash ou atualização do Core, as Tasks em execução são interrompidas, sem recuperação automática nem replay das entradas |
| stop | Para a instância atual, mas preserva o registro de autoinício |
| uninstall | Para a instância, remove o registro do serviço e apaga os dados próprios do ZCode; arquivos de Workspace/Repo/usuário não são apagados |
| update | Por padrão baixa online a partir do release catalog configurado e valida; sem rede, pode aplicar um pending local; usa troca atômica e rollback em caso de falha |
| Atualização de componentes | Usa cache endereçado por conteúdo com cinco componentes de grosso grão: Node, server, agent, official-plugins e native-search-tools; o release completo continua sendo a unidade de execução atômica |
| Registro de serviço de plataforma | Gera o descriptor e então chama launchctl / systemctl --user / schtasks do usuário atual; quando o comando não está disponível, preserva o descriptor e retorna um erro diagnosticável; o serviço do SO é o único owner de inicialização do daemon e o Supervisor não registra o serviço novamente |

## 3. Modelo de processos e responsabilidades

```text
安装后的 zcode
└── bin/zcode
    ├── serve
    │   └── Supervisor
    │       └── Server Core
    │           └── Agent CLI
    ├── serve --daemon
    │   └── OS Service Manager
    │       └── Supervisor
    │           └── Server Core
    │               └── Agent CLI
    ├── status / stop / restart / update / uninstall
    │   └── 本地 Unix Socket / Windows Named Pipe
    │       └── Supervisor
    └── 无参数及其他既有 CLI 命令
        └── 发行包内既有 CLI/TUI bundle
```

### 3.1 Server CLI

O Server CLI é responsável por:

- interpretar os comandos de ciclo de vida do Server;
- emitir requisições de controle local ao Supervisor;
- gerar saída legível por humanos ou em `--json`;
- executar as confirmações interativas de update/uninstall;
- manter o caminho de inicialização da TUI sem carregar o Server Core;
- encaminhar a ausência de argumentos e os comandos que não são de ciclo de vida do Server para o bundle CLI/TUI já existente no pacote de distribuição.

O CLI não mantém diretamente estado de negócio do Server nem mata diretamente PIDs nulos de Core ou Agent.

### 3.2 Supervisor

O Supervisor é responsável por:

- adquirir e manter o lock de instância única no nível do data-root;
- iniciar, parar e reiniciar o Server Core;
- receber do Core, via IPC privado de child, os eventos de ready, heartbeat, quantidade de tasks em execução e motivo de saída;
- executar o backoff de crash e o disjuntor de crash-loop;
- proteger as tasks em execução antes de update/uninstall;
- gerenciar registro, inicialização, parada e remoção do serviço de plataforma.

O Supervisor não mantém:

- o corpo das Sessions;
- conversations ou streams de Tasks;
- CommandInbox, prompts enfileirados ou payloads de permissão;
- conteúdo de Workspaces, Repos ou arquivos do usuário.

### 3.3 Server Core

O Server Core é o processo de serviços de negócio sem interface, responsável por:

- montar os serviços com a autoridade `standalone-server`;
- gerenciar múltiplos Workspaces e Workspace Agents;
- fornecer a API HTTP e a API WebSocket;
- manter o estado autoritativo de task/session/runtime;
- fornecer à Supervisor a quantidade de tasks em execução como um snapshot de ciclo de vida somente-leitura;
- responder a SIGINT e SIGTERM e liberar os recursos de serviço de forma limitada.

Após um crash do Core, o Supervisor inicia um novo Core. As tarefas em execução no Core antigo não são retomadas automaticamente, seguindo a semântica existente de recuperação a fria do CLI/runtime.

### 3.4 Agent CLI

O Agent CLI continua rodando como subprocesso independente para cada Workspace:

- o Agent é responsável pela fila de comandos, Sessions, chamadas de modelo e execução de ferramentas;
- o Server Core é responsável pelo ciclo de vida e pelo roteamento de Workspace para Agent;
- o Supervisor não gerencia diretamente o estado de negócio dos Agents;
- reinício de Agent, reinício de Core e desconexão de attachment do Desktop não podem reexecutar automaticamente entradas já aceitas.

## 4. Comunicação entre processos

```text
CLI 控制请求 ── Unix Socket / Windows Named Pipe ──> Supervisor
Supervisor ── 私有 child IPC ──> Server Core
Server Core ── stdio/RPC ──> Agent CLI
Server Core ── HTTP/WS ──> Desktop Host / Browser / future Transport
```

### 4.1 CLI ↔ Supervisor

O protocolo de controle local pertence ao próprio `packages/zcode-server-cli`, usando schema estrito de runtime e framing JSONL, incluindo no mínimo:

- `status`;
- `stop`;
- `restart`;
- `prepare-update` / `apply-update`;
- `prepare-uninstall` / `confirm-uninstall`;
- `ping`.

O socket/pipe de controle precisa ficar sob o data root atual, usando um caminho de runtime com permissões restritas. A resposta não pode vazar tokens, credenciais ou conteúdo sensível além do caminho completo do usuário.

### 4.2 Supervisor ↔ Core

O Core envia via IPC privado de child:

- `ready`: endereço de escuta, porta, versão do Core e generation da instância;
- `heartbeat`: timestamp monotonicamente crescente e quantidade de tasks em execução;
- `task-activity`: atualização somente-leitura quando a quantidade de tasks em execução muda;
- `shutdown-ack`: conclusão da liberação de recursos;
- `fatal`: resumo de erro irrecuperável;
- `exit`: motivo da saída ativa ou anormal do Core.

A quantidade de tasks em execução precisa vir do fato autoritativo de turn lifecycle publicado pelo runtime de Agent dentro do Core; o Supervisor não pode manter um segundo registry de tasks. O `TaskActivityTracker` local do Core assina `turn.started` / `turn.terminal` de todos os workspaces conectados, mantém apenas as chaves ativas deduplicadas por `workspaceKey + sessionId` e envia a quantidade ao Supervisor como snapshot de ciclo de vida. Ele não é uma interface RPC pública e não mantém corpo, stream, queue ou snapshot. O facade de Task e o caminho `desktop-continuous`, que chama `IZCodeAgentService` v4 diretamente, precisam desembocar no mesmo tracker; o `web-remote-replayable` continua recuperando para o cliente apenas pelos seus próprios limites de gap/snapshot, e a contagem de atividades não pode alterar a semântica dos dois modos de delivery.

```text
desktop-continuous ── sendConversationCommandV4 ─┐
                                                 ├─> Agent runtime turn facts
web-remote-replayable ─ Task/Agent command ──────┘             │
                                                               ▼
                                         Core-local TaskActivityTracker
                                         key = workspaceKey + sessionId
                                                               │ count only
                                                               ▼
                                                         Supervisor guard
```

## 5. Ingress HTTP / WebSocket

O R2 não projeta o Server Core como um serviço dedicado a SSH. Web, WS, WSS, SSH, WSL e Docker devem ser, no futuro, apenas Transports diferentes chegando ao mesmo Core.

```text
Desktop Host / Browser Web / Mobile Controller
                  │
                  ▼
       SSH / WSL / Docker / WS / WSS
                  │
                  ▼
              Server Core
```

O Core do R2 implementa e verifica:

- a capacidade HTTP server-info;
- o contrato WebSocket de replay para Web;
- o contrato WebSocket desktop continuous com gating por capability;
- as fronteiras de delivery de `desktop-continuous` e `web-remote-replayable`;
- a passagem e o isolamento de `workspaceIdentity` e `workspacePath`; `remoteSessionId` não faz parte do contrato de ingress do Core do R2 e continua sob responsabilidade da camada de conexão Transport/Host do R3 para repassá-la.

O Core do R2 é um child process do Supervisor. Além do `shutdown` explícito, o Core precisa ouvir o IPC `disconnect`: quando o Supervisor é morto à força, crasha ou o canal IPC se rompe, o Core deve fechar o próprio HTTP/WebSocket, liberar recursos como Agent/SQLite e sair, sem se tornar um processo órfão que burla o lock do data-root. O Supervisor julga a sobrevivência da instância apenas pelo próprio lock ownership e não pode tratar o estado órfão do Core como reutilização segura.

```text
Supervisor ── SIGKILL/crash ──X IPC ──disconnect──> Core
                                                    │
                                                    ├─ close HTTP/WebSocket
                                                    ├─ dispose Agent/SQLite
                                                    └─ exit；端口不再可用
```

Quando o catalog online confirma que o release atual é igual ao `current.json` em disco, `prepareOnlineUpdate` apaga o `pending.json` remanescente que não poderia ser superior à versão atual. Assim, uma atualização offline não regride inesperadamente para um release antigo depois de uma verificação online de "já está atualizado"; se o pending aponta explicitamente para uma versão futura mais alta, ele é preservado como candidato offline explícito.

`/api/server-info.serverId` usa `install.json.installationId` como identidade estável no nível da instalação. Somente cenários de teste/embedding que chamam diretamente a fábrica HTTP do Core sem informar o server root fazem fallback para o hostname; um Core iniciado por um Supervisor real precisa validar o ownership marker via `ZCODE_SERVER_ROOT` e então injetar o installationId.

Os comportamentos existentes em `packages/server` como `/api/server-info`, `/api/rpc-host-capability`, `/ws` e `/ws/host` servem como referência de compatibilidade; o novo Core não importa diretamente as entradas antigas e, em vez disso, os testes de contrato decidem quais fronteiras precisam ser preservadas.

Por padrão o R2 escuta apenas em endereço de loopback com porta dinâmica, e grava a porta real em `status.json`. A escuta fora do loopback exige configuração explícita de autenticação. O R2 não implementa exposição pública, Relay, pareamento, descoberta de Direct URL nem Transport Adapter.

A fronteira de segurança atual do ingress somente-loopback é uma fronteira de posição de rede, não de identidade de processo: outros processos da mesma máquina que consigam descobrir essa porta dinâmica podem, em teoria, acessar o RPC `/ws` replayable comum e solicitar host capability. Portanto, o `authRequired: false` do R2 significa apenas "autenticação do chamador não habilitada" e não deve ser interpretado como uma garantia de segurança entre usuários ou na internet pública. Esta fase aceita temporariamente um modelo de ameaça de máquina controlada/túnel SSH; antes de habilitar Direct URL, WSS, Relay ou qualquer Transport fora do loopback, é preciso adicionar autenticação do chamador como token, Unix socket peer credential ou ACL de named pipe do Windows, e atualizar os contratos de conexão correspondentes.

O `/remote` do celular continua podendo se anexar apenas a um Desktop Host já existente; o daemon do R2 não pode ser o ponto de entrada de criação de um Agent independente do celular.

## 6. Diretório do novo código e fronteiras de dependência

```text
packages/zcode-server-cli/
├── src/
│   ├── main.ts
│   ├── supervisor/
│   ├── server-core/
│   ├── ipc/
│   ├── platform/
│   ├── runtime/
│   └── packaging/
└── package.json
```

Regras de dependência:

- o novo Core não depende da implementação de entrada de `@zcode/server`;
- não modificar `entry-http`, `entry-stdio` nem `build:remote` de `packages/server`;
- reutilizar apenas `@zcode/services`, `@zcode/shared`, `@zcode/rpc` e tipos de serviço revisados;
- não empacotar Electron, Renderer, Desktop Main ou Window Host no pacote do Server CLI;
- não adicionar um novo protocolo App ↔ Agent; se no futuro for obrigatório modificar esse protocolo, alterar `packages/shared/src/zcode-protocol` separadamente e adicionar validação de schema;
- usar APIs assíncronas em toda nova IO; locks, estado e troca de release precisam ser recuperáveis e auditáveis.

## 7. Pacote de instalação e runtime Node

O Server CLI do R2 não usa o Node embutido do Electron nem exige Node pré-instalado no servidor de destino.

Fatos atuais:

- o Desktop Host/Agent usa o Node 24.x embutido no Electron 41;
- os assets remotos SSH/WSL/Docker usam um Node independente `v22.16.0`;
- o bundle do CLI tem `node22` como alvo mínimo de execução atual.

O R2 reutiliza a segunda cadeia de assets remotos e a estende como runtime de distribuição do Server CLI independente:

- a versão do Node é fixada em `v22.16.0`;
- CLI, Supervisor, Server Core e Agent compartilham o mesmo Node;
- cada SO/arquitetura traz o Node correspondente junto ao pacote;
- o runtime não baixa Node da rede em tempo de execução;
- dependências nativas como `node-pty` são preparadas por SO/arquitetura junto ao pacote;
- o build na raiz ainda pode usar Node 24+, mas isso não significa que o runtime de distribuição use Node 24.

Estrutura do pacote de distribuição:

```text
zcode-server-<os>-<arch>/
├── bin/
│   ├── zcode
│   └── zcode.cmd
├── runtime/
│   ├── node                 # Windows 为 node.exe
│   ├── package.json         # {"type":"module"}，让 .js 入口按 ESM 解析
│   ├── server-cli.js        # ESM bundle（tsup 产物，含 __dirname banner）
│   ├── server-core.js       # ESM bundle，server-cli 以同目录相对路径 fork
│   ├── zcode.cjs            # 既有 CLI/Agent bundle（自包含 CJS）
│   ├── node_modules/        # bundle 外置依赖闭包（含 node-pty 平台 prebuilds）
│   ├── tools/               # bfs/rg/ugrep（Windows 为 rg/ugrep）
│   └── packages/            # Agent 实际启用的官方插件
└── manifest.json
```

A entrada usa ESM `.js` em vez do `.cjs` inicialmente idealizado: a cadeia de dependências de `@zcode/services` já está organizada como ESM, e converter o bundle para CJS tem risco maior; `server-cli.js` faz fork do Core via `new URL("./server-core.js", import.meta.url)` e delega o CLI existente pelo `zcode.cjs` do mesmo diretório, portanto as três entradas precisam estar no mesmo diretório `runtime/`.

### 7.1 Staging do pacote de distribuição

O staging é implementado em `packages/zcode-server-cli/src/packaging/stage.ts`,
acionado por `pnpm --filter @zcode/server-cli stage --target <os>-<arch>`, e faz apenas montagem local, sem upload nem publicação:

- o bundle das entradas vem do artefato de `tsup` deste pacote; o `zcode.cjs` vem de `apps/zcode-cli/packages/cli/dist/zcode.cjs`
  (construído por `scripts/build-desktop-agent-cli.mjs`, com a mesma origem da cadeia de assets remotos);
- o conteúdo de `runtime/node_modules` tem como fonte de verdade a **varredura de artefatos**: varrer as referências de módulos nus do nível superior do bundle, intersectá-las com o `node_modules` do workspace e coletar recursivamente o fechamento de dependências de produção, copiando do workspace para um layout achatado; a lista de declarações `external` do `tsup` não é usada como fonte de verdade, evitando divergência entre declaração e uso real;
- ao copiar `node-pty`, remover `build/` (artefatos compilados da máquina, que em cross-package seriam carregados preferencialmente por loadNativeModule e causariam crash de arquitetura errada), mantendo apenas `prebuilds/<os>-<arch>/` da plataforma alvo; o pacote oficial da plataforma linux não tem prebuild, então `pty.node` vem de `@lydell/node-pty-linux-<arch>` do workspace; no darwin são mantidos o `pty.node` e o `spawn-helper` oficiais;
- o binário do Node é fixado em `v22.16.0`: reaproveitar primeiro o cache já baixado em `packages/desktop/mock-cdn/releases/<version>/node/<platform>/` e, quando ausente, baixar de nodejs.org o formato alvo (POSIX é `tar.xz`, Windows é `zip`) e armazenar em cache;
- produzir simultaneamente a forma de diretório e `zcode-server-<os>-<arch>.tar.gz` (para scp até o remoto e verificação de extração);
- o staging implementa seis alvos: `darwin-x64/arm64`, `linux-x64/arm64`, `win32-x64/arm64`; POSIX produz `tar.gz`, Windows produz `zip` e `zcode.cmd`. O Windows não empacota `bfs`, usa `rg.exe` e `ugrep.exe` e mantém o fallback de sistema/Git Bash.
- as dependências externas do bundle do Agent têm como fonte de verdade a varredura das entradas de runtime e a definição de plugins oficiais; como não se varre mais apenas o Server CLI/Core, dependências de runtime do bundle como `@zcode/tui` e `playwright-core` não ficam de fora.
- `runtime/tools` é preparado por `scripts/prepare-native-search-tools.mjs` conforme o release plan alvo em
  `node_modules/.cache/zcode-server-cli/tools/<target>` (download quando a fonte interna de dependências está configurada, descompactação do arquivo do repositório quando não está),
  sem reutilizar os diretórios mock-cdn ou bundled-tools (o macOS remoto é fixo em rg13); cada diretório de ferramenta também carrega `THIRD-PARTY-NOTICES.txt` e `SOURCES.json`. Em tempo de execução a resolução é feita por `ZCODE_SERVER_RUNTIME_ROOT`; `runtime/packages` contém os sete plugins que precisam de seed na definição atual de plugins oficiais (browser-use, document-skills, skill-creator, zcode-guide, android-emulator, ios-simulator, restore-legacy-sessions).

Convenção de fiação do Agent: o Core dentro do pacote de distribuição não está no monorepo e também não tem runtime do Electron. Toda vez que o Supervisor inicia o Core, ele precisa recalcular a fiação a partir do `runtime/` do release ao qual aquele Core pertence (`runtime/node zcode.cjs app-server --stdio`); o antigo `server-cli.js` não pode gravar de forma permanente no `process.env` global um resultado de autodedução. O `ZCODE_AGENT_SERVER_COMMAND` explicitamente configurado continua sempre prevalecendo; em desenvolvimento, quando não há release runtime, nada é injetado.

Separação entre programa e dados após a instalação:

```text
~/.zcode/server/
├── releases/<version>-<target>-<sha12>/
│   ├── runtime/
│   ├── bin/
│   └── manifest.json
├── current.json
├── pending.json
├── bin/zcode                       # Windows 为 zcode.cmd；OS service 稳定入口
├── service/<root-hash>.<platform>  # 运行时按 canonical root 生成，显式携带 --server-root
├── cache/components/<target>/<component>/<sha256>/
└── run/
    ├── server.lock
    ├── status.json
    └── control.sock / named pipe
```

O descriptor não é empacotado no arquivo do release; ele é escrito dinamicamente em `service/` por `platform/serviceManager.ts` no momento do registro de `serve --daemon`. Quando um `--server-root` não-padrão é passado explicitamente, o Server CLI usa esse diretório também como `dataBaseDir`, de modo que o estado local como Agent/SQLite fica no diretório isolado `.zcode/` desse root; a desinstalação continua apagando apenas o allowlist do ZCode, e arquivos desconhecidos são preservados e listados em `uninstalled.json.preservedPaths`.

`current.json` e `pending.json` são atualizados apenas por arquivo temporário seguido de rename. Os diretórios de release são endereçados por conteúdo pelo SHA do arquivo e são imutáveis: o instalador só pode promover atomicamente um diretório temporário completo para um `releases/<releaseId>` ainda inexistente; quando o destino já existe, ele precisa validar a identidade do arquivo e o runtime manifest e então reutilizá-lo, e conteúdo inconsistente precisa falhar — é proibido apagar, sobrescrever ou fazer rename de um diretório de release que pode estar em uso por um Core. Quando há cache hit de componentes, só os componentes alterados são baixados e um novo release é montado, e mesmo assim `current.json` só é trocado uma vez. Qualquer falha de inicialização restaura o ponteiro antigo, e diretórios temporários e caches incompletos são limpos.

A instalação do arquivo completo e a montagem incremental de componentes precisam reutilizar a mesma semântica de promoção imutável: o `incoming` só pode ser renomeado para um destino inexistente; quando o destino já existe, só é permitido reutilizá-lo após validar a identidade completa do release e o hash de conteúdo. Seja por reuso ou por falha, o `incoming` não promovido precisa ser limpo. É proibido mover um destino existente para backup para publicar conteúdo novo; esse destino pode já ter se tornado o release ativo após a conclusão de outro update concorrente.

O rollback da atualização precisa primeiro encerrar o novo Core que não ficou ready, só então restaurar o ponteiro antigo e iniciar o release antigo; um Core que deu timeout mas continua vivo não pode coexistir com o Core antigo após o rollback:

```text
apply pending
    │
    ▼
new Core ── ready ───────────────────────────────> commit
    │
    ├─ spawn error + close（无 exit）─┐
    └─ timeout / fatal / exit ────────┴─> stop if alive ─> restore current ─> old Core ready
```

O `error`, o `exit` e o `close` de `fork()` precisam convergir para a mesma entrada de estado terminal do Core, executada no máximo uma vez. Um spawn error também é uma falha de inicialização reversível e precisa ser consumida pelo Supervisor e entrar no crash budget, não se tornando um evento não tratado que derrube o Supervisor; o `error` de um ChildProcess em execução, por si só, não equivale a o processo já ter saído. O fluxo de parada só libera o lock do data-root ao observar `exit`/`close`; se após SIGKILL ainda não houve convergência, entra em `stop-failed`, preservando a referência ao Core e o lock, e é proibido iniciar um Core substituto.

O `stop`, o `restart`, o `apply-update` e o `confirm-uninstall` do Supervisor compartilham um único lifecycle operation gate. Um stop idempotente da mesma classe pode reutilizar a Promise atual; outras operações de escrita concorrentes retornam imediatamente o retryable `operation-in-progress`, sem entrar em fila. O listener de IPC do Core precisa estar vinculado a um child e generation específicos, e todas as mensagens de childs que não são o atual são descartadas; quando o Core termina ou muda de geração, host, port, startedAt e runningTaskCount são limpos, para que tasks já interrompidas não continuem poluindo o guard da geração seguinte.

O único owner de inicialização de `serve --daemon` é o serviço do SO. O comando do descriptor precisa apontar para a entrada estável sob o data root, `<serverRoot>/bin/zcode` (`zcode.cmd` no Windows), e os argumentos precisam conter obrigatoriamente `serve --supervisor --service-entry --server-root <absolute-path>`; não é permitido registrar o caminho absoluto de `server-cli.js` do release vigente no momento do registro. Após registrar e iniciar o serviço, o CLI espera o Supervisor existente reportar ready; a service entry não pode se registrar de novo nem fazer fork de um segundo Supervisor. Apenas a OS service entry reporta `serviceRegistered=true`; o fallback detached que pula explicitamente o registro do serviço precisa reportar false. Quando o registro no gerenciador de serviços falha, o descriptor é preservado e um erro diagnosticável é retornado, sem que o fallback seja disfarçado de registro bem-sucedido. O update troca o Core imediatamente; o código do novo release do próprio Supervisor entra em vigor no próximo ciclo de vida do processo daemon (quando o serviço do SO o relança), e o R2 não faz handoff de bootstrap intra-processo na resposta do apply-update. A saída normal causada por uma requisição `stop` não pode ser reiniciada automaticamente pelo launchd, mas saídas anormais continuam sendo tratadas pela semântica de restart preservada pelo gerenciador de serviços.

A identidade do serviço do SO precisa ser isolada por server root canônico, usando um hash de root estável para derivar o Label do launchd, o nome da unit do systemd, o nome da task do Windows e o nome do arquivo de descriptor. Ao limpar compatibilidade com ids de serviço fixos antigos, só é permitido desinstalar quando o `--server-root` canônico do descriptor antigo é igual ao root atual, proibindo apagar por engano o serviço de outro root.

`--server-root` é um parâmetro global interno usado pelo service/daemon de fallback, e seu valor precisa ser um caminho absoluto. O control endpoint do CLI, o status, o release, o descriptor de serviço e a desinstalação analisam o mesmo layout a partir desse parâmetro; Core/Agent recebem simultaneamente o `ZCODE_DATA_BASE_DIR` correspondente. Portanto, um daemon com data root customizado não pode criar uma segunda cópia de status, lock, Core ou SQLite no root padrão.

A montagem incremental de componentes copia primeiro do release antigo, depois remove os caminhos antigos declarados por todos os componentes alterados ou removidos, e então extrai os novos componentes e valida o novo manifest; assim, quando o novo manifest remove componentes como plugins/ferramentas, os arquivos antigos não são levados para o novo release.

O R2 prepara pelo menos os seguintes assets de plataforma:

- `darwin-x64`, `darwin-arm64`;
- `linux-x64`, `linux-arm64`;
- `win32-x64`, `win32-arm64`.

## 8. Semântica dos comandos do CLI

```bash
zcode                  # 无参数仍进入 TUI
zcode serve            # 前台 Server Core
zcode serve --daemon   # 注册并启动 daemon
zcode status
zcode stop
zcode restart
zcode update
zcode update --force
zcode uninstall
```

| Comando | Comportamento |
| --- | --- |
| `serve` | Executa Supervisor/Core no processo atual do CLI; não registra autoinício do SO; sai de forma limitada após sinal de terminação |
| `serve --daemon` | Instala/reutiliza o registro de serviço do usuário atual e inicia ou reutiliza Supervisor/Core |
| `status` | Retorna estado de registro, estado do Core, PID, porta, versão, motivo recente de saída e crash budget |
| `stop` | Pede ao Supervisor que pare o Core; preserva o registro de autoinício |
| `restart` | Para e reinicia de forma limitada; não recupera automaticamente Tasks interrompidas |
| `update` | Obtém o novo release do target atual no catalog (ou usa um pending existente), valida e instala e então aplica; se o catalog e o arquivo atual forem idênticos, retorna `up-to-date` com sucesso e não pode continuar pedindo apply; sem catalog configurado e sem pending, retorna um erro explícito de release source; havendo Tasks em execução, retorna por padrão um erro de guard acionável, sem interromper a tarefa |
| `update --force` | Permite explicitamente interromper Tasks em execução para aplicar o release |
| `uninstall` | Verifica Tasks em execução (recusa e mantém o estado original se houver), exige duas entradas `DELETE`, para e remove o serviço e apaga os dados do ZCode dentro da allowlist |

O `uninstall` permite apagar:

- releases de programa do R2;
- registros de execução de Supervisor/Core;
- configurações, cache e registros de runtime do ZCode;
- bancos de dados de estado próprios do ZCode e logs.

O `uninstall` proíbe apagar:

- arquivos de Workspace;
- repositórios Git e working trees;
- outros arquivos do home do usuário;
- diretórios externos especificados explicitamente pelo usuário;
- qualquer caminho que não possa ser validado por canonical path e allowlist.

Ao inicializar o server root, é preciso gravar um ownership marker `install.json` de schema estrito, contendo product, schema version, server root canônico e installation id. O `uninstall` só permite limpeza automática quando o root, após `realpath`, coincide com esse marker; sem marker ou com marker divergente, ele recusa e orienta o tratamento manual. A desinstalação apaga apenas os itens da allowlist como `releases/`, `run/`, `cache/`, `bin/`, `service/`, `current.json`, `pending.json` e o marker de propriedade; arquivos desconhecidos dentro do server root precisam ser preservados e listados em `preservedPaths` no resultado. Ao final, é gravado `uninstalled.json` no root preservado, com o horário e a versão da desinstalação; o R2 não implementa Controller UI.

## 9. Dados, estado e invariantes

```text
OS Service Manager
└── Supervisor lifecycle state
    ├── release / PID / port / registration
    ├── crash budget / backoff
    └── update / uninstall operation

Server Core
└── authoritative business state
    ├── workspace / task / session
    ├── command queue / stream
    └── Agent runtime lifecycle

Workspace / Repo / User files
└── user-owned state，R2 不负责删除
```

É preciso preservar:

- chave de instância única = usuário atual do SO + data root;
- a recuperação de lock obsoleto precisa antes reivindicar atomicamente o ownership token para um caminho isolado, pelo token de ownership; o release só pode apagar um token que ainda lhe pertence, e é proibido apagar diretamente o caminho atual com base em um único PID obsoleto;
- o isolamento de Workspace usa `workspaceKey = workspaceIdentity?.trim() || workspacePath`;
- a execução por caminho continua usando `workspacePath`;
- a identidade remota não pode usar apenas `workspacePath`;
- o Supervisor não cria uma segunda CommandInbox nem uma segunda Task queue;
- o `continuous` do Desktop não concatena mensagens de recuperação `replayable` da Web;
- o `replayable` do Mobile não burla a recuperação gap/snapshot;
- crash, atualização e desinstalação do Core não recuperam automaticamente entradas já interrompidas;
- Main, relay e futuros Transports não fazem o estado de negócio descer;
- os logs de produção usam `createServiceLogger`; detalhes de heartbeat/RPC de alta frequência usam debug e nenhum secret é registrado.

## 10. Ordem de implementação

1. Manter este documento como a spec do R2 e complementar o [R2 lifecycle test plan](./r2-server-cli-and-daemon-test-plan.md); casos que envolvem conversation/session precisam primeiro atualizar o case catalog e a coverage matrix.
2. Estabelecer em `packages/zcode-server-cli` o CLI, o IPC, o layout de runtime e os schemas de contrato, escrevendo os testes primeiro.
3. Implementar o lock de instância única, o arquivo de estado, o canonical path e a validação de allowlist.
4. Implementar a nova entrada do Server Core, conectar os serviços `standalone-server` e fornecer o ingress HTTP/WS.
5. Implementar o Supervisor, o IPC privado de child do Core, o crash budget e o guard de tasks em execução.
6. Implementar os adapters de macOS launchd, Linux systemd --user e Windows Task Scheduler.
7. Implementar o roteamento de comandos do Server CLI, a delegação lazy de TUI/CLI existente, o `--json` e os fluxos de confirmação.
8. Implementar o staging do runtime Node das seis plataformas, do node-pty, das ferramentas de busca nativa e dos plugins oficiais; sem alterar as entradas de build de `packages/server`.
9. Implementar ReleaseCatalog/Downloader/Installer, o cache de componentes endereçado por conteúdo, a troca atômica de current/pending e o rollback em caso de falha.
10. Concluir os adapters reais de OS service manager, os testes de contrato de download online, os testes de contrato do Windows e a compatibilidade com o Host RPC do R1.
11. Executar `pnpm typecheck`, `pnpm lint`, os testes do novo pacote e a auditoria de coverage de conversation.

## 11. Casos de aceitação

| Case | Objetivo de aceitação |
| --- | --- |
| R2-CLI-01 | Sem argumentos não carrega o Server Core e ainda entra na TUI |
| R2-CLI-02 | O `serve` em primeiro plano inicia o Core, escuta uma porta dinâmica de loopback e conclui o ready |
| R2-CLI-03 | `serve --daemon` registra o serviço de plataforma e inicia o Supervisor |
| R2-CLI-04 | Uma inicialização repetida reutiliza a instância atual e não gera um segundo Core |
| R2-CLI-05 | `status`, `stop` e `restart` convergem o estado e são idempotentes |
| R2-CLI-06 | O crash do Core aplica backoff de 1/2/4/8/16 segundos e, ao exceder o orçamento, entra em disjuntor |
| R2-CLI-07 | Após o crash do Core, as Tasks em execução são interrompidas sem recuperação automática |
| R2-CLI-08 | Sem Tasks em execução, o update troca o release atomicamente e conclui o ready |
| R2-CLI-09 | Com Tasks em execução, o update retorna por padrão um erro de guard sem interromper a tarefa, e só `--force` permite interromper |
| R2-CLI-10 | O uninstall exige confirmação dupla de `DELETE` e remove o registro do serviço |
| R2-CLI-11 | O uninstall preserva Workspaces, Repos e arquivos do usuário |
| R2-CLI-12 | O ingress HTTP/WS passa nos testes de contrato de server-info, Web replayable e Host continuous |
| R2-CLI-13 | Data roots diferentes ficam isolados entre si e o lock de instância única não atinge outros roots |
| R2-CLI-14 | O descriptor de serviço e o runtime Node de macOS/Linux/Windows conseguem iniciar |

## 12. Publicação e rollback

O R2 só é validado em ambiente interno e não altera a conexão remota de produção atual do Desktop. Antes da publicação, é preciso ter simultaneamente:

- instalação, inicialização, parada, reinício e desinstalação bem-sucedidos;
- comportamento estável de instância única e de crash-loop;
- runtime Node e dependências nativas passando na matriz das três plataformas;
- fronteiras de Host RPC do R1 passando nos testes de contrato;
- nenhuma exclusão indevida de arquivos de Workspace/Repo/usuário;
- logs sem vazar secrets;
- `pnpm typecheck` e `pnpm lint` passando.

Em caso de falha, faz-se rollback apenas do release atual do Server CLI ou da versão do Desktop, sem migração destrutiva de banco de dados e sem trocar nem consertar a cadeia remota existente de `packages/server`.