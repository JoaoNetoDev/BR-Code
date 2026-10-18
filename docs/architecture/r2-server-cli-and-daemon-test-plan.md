# Plano de testes de ciclo de vida do R2 Server CLI e do daemon

Este documento é um complemento de testes executável para `r2-server-cli-and-daemon.md`, cobrindo R2-CLI-01—R2-CLI-14 e a cadeia de release P0/P1. Os testes mantêm o estado de negócio no Server Core e limitam o Supervisor a snapshots de ciclo de vida e plano de controle; não replicam no Supervisor o registro de Task/Session apenas para contar tarefas em execução.

## Fronteiras de teste

```text
parsing de comandos CLI ── contrato de controle JSONL ──> Supervisor
                                       │
                                       ├─ lock / status / crash budget
                                       └─ IPC filho ──> Server Core ── ingress HTTP/WS
                                                               │
                                                               └─ fatos do ciclo de vida de turn do Agent CLI
```

- Testes de arquivo usam um data root temporário e verificam ownership de `install.json`, `current.json`, `pending.json` e `status.json` com escrita atômica via arquivo temporário + rename; escritas concorrentes no mesmo processo usam nomes de arquivo temporário únicos.
- Testes de IPC cobrem simultaneamente fragmentação e coalescência de JSONL, schema inválido, frame excessivamente longo e timeout de requisição.
- Testes do Supervisor usam um processo Core fake e controlado, e complementam com testes reais de spawn com erro de `fork()`, verificando ready, heartbeat, shutdown-ack, saída inesperada, backoff de reinício, rollback e circuit breaker de crash-loop; operações de escrita de ciclo de vida concorrentes só podem ter um owner, após SIGKILL nenhum estado terminal entra em `stop-failed` e o lock não pode ser liberado nem um Core substituto iniciado, e mensagens de child/generation antigos não podem contaminar o estado atual.
- Testes de contrato HTTP/WS do Core verificam porta dinâmica em loopback, `/api/server-info`, `/ws` replayable para Web, `/ws/host` contínuo para desktop com gate de capability, e checam que o `clientMode` não se mistura entre canais.
- Testes de plataforma não invocam o gerenciador de serviços real do sistema: verificam campos estáveis e argumentos de comando dos descriptors de macOS launchd, systemd de usuário do Linux e Task Scheduler do Windows.
- Testes de update/uninstall só podem apagar arquivos dentro do server root, na allowlist da ZCode, com ownership válido de `install.json`, preservando explicitamente arquivos desconhecidos dentro do root, workspaces, repositórios git e outros arquivos do usuário; sem ownership a remoção deve ser recusada.

## Mapeamento de casos

| Caso | Cobertura automatizada |
| --- | --- |
| R2-CLI-01 | `cli.test.ts`: sem argumentos e comando desconhecido vão para o delegate legado lazy, sem importar o Core |
| R2-CLI-02/03/04 | `supervisor.test.ts` com Core fake para ready/porta dinâmica e erro real de spawn; `runtimeUpdateIntegration.test.ts` real com porta recolhida após disconnect do parent IPC do Core; `parentDisconnect.test.ts` registro/remoção de handler; `lock.test.ts` múltiplos processos filhos disputando stale lock com apenas um sucesso; `linux-amd64-dev` via SSH em máquina real validando daemon ready/início duplicado |
| R2-CLI-05 | `cli.test.ts` stop idempotente; `supervisor.test.ts` converge com stops concorrentes, operações de ciclo de vida diferentes retornam `operation-in-progress`, parada não recolhida entra em `stop-failed`; `ipc.test.ts` control client com timeout limitado |
| R2-CLI-06/07 | `crashBudget.test.ts` sequência de backoff em unidade; `supervisor.test.ts` crashes consecutivos do Core fake reiniciam em 1/2/4/8/16 s e abrem o circuit breaker após esgotar o orçamento; tarefas em execução são contadas apenas no snapshot do Core atual, e após a troca de generation as mensagens do child antigo são recusadas e a contagem fantasma de running vai a zero |
| R2-CLI-08/09 | `pathsAndRelease.test.ts` troca atômica de pending release e isolamento de arquivos temporários concorrentes; `releaseInstaller.test.ts` instalação concorrente não sobrescreve release existente nem deixa incoming para trás; `componentCache.test.ts` release existente apenas valida e reutiliza, nunca move o diretório ativo; `cli.test.ts` cobre `prepared` / `prepared-offline` / `up-to-date` / source ausente e valida que, ao confirmar o mais novo no catálogo online, o pending stale é limpo; `taskActivityTracker.test.ts` estatiza atividade entre workspaces a partir dos fatos de turn do Agent; `supervisor.test.ts` dois applies concorrentes produzem apenas um candidate, o running-task guard recusa update/uninstall, o caminho de interrupção `--force` é validado ponta a ponta pelo control socket; erro de spawn/timeout recolhe primeiro o candidate, reverte o pointer e restaura o Core antigo |
| R2-CLI-10/11 | `cli.test.ts` proteção de cancelamento com confirmação dupla de `DELETE`, recusa de desinstalar sem ownership, com ownership válido apaga apenas a allowlist, grava `uninstalled.json` e reporta os arquivos desconhecidos preservados; `supervisor.test.ts` confirm-uninstall é recusado quando há tarefas em execução; registros de launchd/systemd/Task Scheduler são removidos antes da desinstalação |
| R2-CLI-12 | `coreHttp.test.ts`: server-info, `/ws` replayable para Web, `/ws/host` com gate de capability, replay de ticket e 401 por expiração, serverId explícito e estável; `serverIdentity.test.ts` de ownership marker a installationId; `hostCapability.test.ts` semântica de TTL/uso único; o wiring/transport RPC frame reais do Core ficam reservados para o contrato de Transport do R3 |
| R2-CLI-13 | `cli.test.ts`/daemon real validando `--server-root` de ponta a ponta; `lock.test.ts` locks de data roots diferentes não se interferem; `platform.test.ts` roots canônicos diferentes derivam service identity e nome de arquivo de descriptor diferentes, identificando com segurança antigos service ids fixos |
| R2-CLI-14 | `platform.test.ts` descriptors de três plataformas usando launcher estável e carregando server root absoluto; `pathsAndRelease.test.ts`/`contracts.test.ts` validação do runtime manifest do Node 22; `packaging.test.ts` layout de staging (varredura de dependências soltas do bundle, fecho transitivo de dependências de produção, allowlist de cross-packaging do node-pty, Complemento de prebuild do @lydell no linux, bit de execução do spawn-helper, entrypoints do manifest, cmd/zip do Windows); `agentWiring.test.ts` validando o cálculo do wiring e a precedência da configuração explícita; `runtimeUpdateIntegration.test.ts` com subprocessos Core real antigo/novo validando que, após o update, o wiring e o data root são recalculados conforme o release runtime |
| P0-01 | `packaging.test.ts` staging de seis plataformas, cmd/zip do Windows, runtime/tools, runtime/packages, fecho de dependências externas do agent |
| P0-02 | `releaseDownload.test.ts` catálogo, SHA-256, timeout, limpeza de arquivos temporários e validação do alvo |
| P0-03 | `releaseInstaller.test.ts` instalação de archive imutável, launcher estável, troca atômica de pending/current, reutilização concorrente e limpeza de incoming |
| P1-01 | `componentCache.test.ts` cache endereçado por conteúdo de cinco componentes, dupla validação de SHA/conteúdo do archive, sobrescrita de componente alterado, recusa de link malicioso, consistência final do release e reutilização de target imutável |
| P1-02 | `serviceManager.test.ts` identidade de descriptor em escopo de root + executor adapter de launchctl/systemctl/schtasks; `cli.test.ts` validando que falha de registro não se faz passar por sucesso, que o fallback explícito reporta não registrado, que um fallback idle existente pode ser migrado para o serviço do SO e que a entrada de serviço não é registrada duas vezes; o descriptor launchd valida que um stop normal não reinicia imediatamente por causa de `KeepAlive` |

Resta apenas a suplementação manual de permissões específicas de SO: ACL de named pipe do Windows, comportamento real de launchd/systemd/schtasks em sessão de login; o restante — download, instalação, reuso de componentes, rollback e o fluxo Linux x64 via SSH — já está automatizado ou validado em máquina real.

## Validação de deploy remoto por SSH (camada 2, ensaio do R3 SSH Transport)

`packages/zcode-server-cli/scripts/verify-remote-ssh.mjs` implanta o pacote de release staged em um
contêiner Ubuntu 22.04 com sshd e, da máquina local, valida a cadeia completa por túnel `ssh -L`
(depende do docker local, não entra no CI):

Além disso, a validação em máquina real Linux x64 já foi feita com `linux-amd64-dev` (usuário SSH `dev`): após extrair o release de cerca de 74 MB,
`serve --daemon`, status/stop, atualização online completa, atualização incremental de componentes com validação de SHA de archive e hash de conteúdo,
rollback de release ruim, carregamento dinâmico de `node-pty`, `@zcode/tui`/`playwright-core`/`koffi`,
e bfs/rg/ugrep e os sete plugins oficiais que acompanham o pacote passaram.

```bash
pnpm --filter @zcode/server-cli stage --target linux-arm64
node packages/zcode-server-cli/scripts/verify-remote-ssh.mjs --target linux-arm64   # --keep preserva o cenário
```

```text
máquina local                                contêiner (ubuntu 22.04 + sshd)
────                                        ─────────────────────────
tar.gz do artefato de stage ──scp────────>   extrai em /root/zcode-server
ssh "bin/zcode serve --daemon --json" >  Supervisor+Core ready (apenas loopback+porta dinâmica)
ssh -L <local>:127.0.0.1:<port> ────────>   túnel (o Core só escuta loopback; o túnel é o único caminho de chegada)
fetch /api/server-info               ✓
upgrade de WS /ws replayable          ✓
GET /ws/host sem ticket → 401         ✓
emissão de ticket → upgrade de /ws/host → replay 401 ✓
runtime/node carrega node-pty spawn pty ✓   (pty.node do linux passa pelo complemento do @lydell)
ssh status → stop → stopped            ✓
```

Esse script é também um complemento em ambiente real do R2-CLI-12 (contrato de ingress através da fronteira de rede) e do R2-CLI-14 (runtime Node para alvo linux capaz de iniciar); o `ssh -L` já é a forma mínima do futuro SSH Transport Adapter, e o spec do R3 deve tomar os fatos expostos por esse script como entrada de design.

## Semântica de falha

- Saída inesperada do Core dispara apenas o backoff/circuit breaker do Supervisor e não reproduz entradas já aceitas.
- Erro de spawn do fork do Core, mesmo tendo apenas `error + close` e nenhum `exit`, deve seguir o mesmo estado terminal de crash/rollback de update, e o Supervisor não pode sair.
- Só pode haver uma operação de escrita de ciclo de vida por vez; requisições conflitantes retornam `operation-in-progress` retryable, sem enfileirar nem iniciar um segundo Core.
- O IPC do Core deve estar vinculado a child/generation; quando o Core termina ou troca de generation, o estado de escopo do Core é limpo e heartbeats/atividade de tarefa antigos não podem alterar o guard atual.
- Falha fatal na inicialização do Core exige saída explícita do processo, para que o Supervisor observe o exit e entre em backoff; não é permitido ficar preso em `starting`.
- `update` retorna por padrão um erro de guard acionável quando há tarefas em execução; somente um force explícito para o Core.
- `uninstall` mantém o estado original e retorna erro estruturado quando há tarefas em execução, qualquer falha de confirmação, falha de validação de caminho ou falha na remoção do serviço.
- O lock de instância única precisa ser recuperável: quando o processo que segura o lock morreu (kill -9/queda de energia), o arquivo stale é reivindicado pelo ownership token e a tentativa é repetida; a recusa de início ocorre apenas quando um processo vivo detém o lock; quando múltiplos processos reais fazem a coleta ao mesmo tempo, apenas um pode vencer e os perdedores não podem apagar o lock do vencedor.
- Uma falha de início do `serve` em primeiro plano (inclusive crash-loop) deve primeiro parar o Supervisor, recolhendo o lock e o control socket, e só então reportar o erro ao usuário.
- Quando o update entra em timeout de ready, é preciso parar primeiro o novo Core que ainda está vivo, depois restaurar o pointer current antigo e iniciar o Core antigo; se mesmo após SIGKILL não se observar exit/close, entra-se em `stop-failed` e o lock é preservado, proibindo dois Core simultâneos.
- `serve --daemon` só admite um owner de serviço do SO; a entrada de serviço não pode ser registrada duas vezes nem iniciar um segundo Supervisor em paralelo, e falha de registro deve retornar erro; o fallback explícito deve reportar `serviceRegistered=false`.
- O descriptor de serviço deve usar a entrada estável `<serverRoot>/bin/zcode` e carregar explicitamente `--server-root`; a service identity e o nome de arquivo do descriptor são isolados por root canônico, e o teste de daemon real com root customizado precisa confirmar que o root padrão não sofreu efeitos colaterais.
- O activity tracker de escopo do Core deve estatizar, a partir dos fatos do ciclo de vida de turn do Agent, tanto o desktop contínuo quanto o Web replayable; os testes não podem se limitar a forjar apenas o `activePromptInputIds` da facade de Task.
- Um stop normal no launchd não pode ser relançado automaticamente por causa de um KeepAlive incondicional; a saída inesperada continua preservando a capacidade de reinício do gerenciador de serviços.
- A atualização incremental de componentes precisa apagar os arquivos antigos de componentes removidos pelo novo manifest.
- A instalação de archive e a montagem de componentes só podem promover para um release imutável inexistente; quando o alvo existe, validam e reutilizam e limpam o incoming, proibindo mover ou apagar o alvo.
- Todos os detalhes de heartbeat e de frame de alta frequência passam pelo debug logger; status e motivo de saída retornam apenas resumos sem segredos.
- Quando o Supervisor é morto à força ou o IPC desconecta, o Core deve se limpar e sair, sem deixar um Core órfão ainda escutando a porta; quando o catálogo online já confirmou que o current é o mais novo, o pending stale deve ser limpo para evitar rebaixamento em um ramo offline posterior.