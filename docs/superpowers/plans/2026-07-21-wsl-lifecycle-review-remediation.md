# WSL Lifecycle Review Remediation Implementation Plan

> **Para agentes de trabalho:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** adicionar um deadline para a liberação do deploy lock e eliminar, com generation/ACK de workspace, a corrida entre o reconexão rápido de um workspace WSL em pool e um release antigo.

**Arquitetura:** o deploy lock só encerra o stream owner desta execução; se não fechar em 5 segundos, o stream é destruído e um erro diagnosticável é retornado, sem fazer dispose direto do backend. WSL Main/Host recebem um protocolo de generation em acquire/release, e o Main só faz attach de uma nova porta RPC depois que o Host confirma que o release antigo está invalidado ou concluído.

**Stack técnico:** TypeScript, Electron UtilityProcess postMessage, Zod runtime schema, Vitest, Windows real + WSL.

## Restrições globais

- Todo isolamento de workspace usa `workspaceIdentity?.trim() || workspacePath`.
- O attachment de desktop mantém `desktop-continuous`; o attachment de celular mantém `web-remote-replayable`.
- Docker/Server permanece dedicated; o comportamento do pool SSH não muda.
- O quit/fechamento de janela/instalação de update do app continua contornando o TTL de 60 segundos e recuperando o Host completo.
- Executar `pnpm typecheck` e `pnpm lint`.

---

### Task 1: Deadline de liberação do deploy lock

**Arquivos:**

- Modify: `packages/server/src/remote/remoteDeployLock.ts`
- Modify: `packages/server/src/remote/deploy.ts`
- Test: `packages/server/test/remoteDeployLock.test.ts`
- Test: `packages/server/test/remoteDeploy.test.ts`

**Interfaces:**

- `AcquireRemoteDeployLockOptions.releaseTimeoutMs?: number`, com padrão `5_000`.
- `RemoteDeployLockHandle.release()` resolve/reject dentro do deadline; o erro de timeout contém o owner e o deadline.

- [x] Escrever um teste de falha em que o close nunca é disparado, afirmando reject após o deadline e destroy de stdin/stdout/stderr.
- [x] Executar `pnpm vitest run packages/server/test/remoteDeployLock.test.ts` e confirmar RED com a release Promise sem settle.
- [x] Implementar espera de close limitada e destroy best-effort do stream owner; release repetida continua idempotente.
- [x] Adicionar um teste de falha dupla de deploy/release, preservando os dois erros com `AggregateError`.
- [x] Executar os dois testes direcionados e confirmar GREEN.

### Task 2: Protocolo de generation/ACK de workspace

**Arquivos:**

- Modify: `packages/shared/src/channels.ts`
- Modify: `packages/shared/src/validation.ts`
- Modify: `packages/shared/test/validation.test.ts`
- Modify: `packages/desktop/src/main/desktopRemoteSessions.ts`
- Modify: `packages/desktop/src/host/index.ts`
- Test: `packages/desktop/test/desktopRemoteSessions.test.ts`
- Test: host lifecycle test selected by repository search

**Interfaces:**

- Main → Host `AcquireRemoteWorkspace { requestId, generation, workspacePath, workspaceIdentity? }`.
- Main → Host `ReleaseRemoteWorkspace` recebe um `generation` inteiro positivo.
- Host → Main `RemoteWorkspaceAcquired { requestId, generation, workspacePath, workspaceIdentity?, ok, error? }`.

- [x] Estender primeiro o teste de schema, confirmando RED para as novas mensagens enquanto o schema ainda não está implementado.
- [x] Escrever o teste close → release pending → reopen, afirmando que AttachServicePort não é enviado antes do ACK.
- [x] Escrever testes de Host para generation obsoleta / release pendente, afirmando que o acquire invalida um release pendente antigo; o ACK só ocorre após a conclusão do release em andamento.
- [x] Implementar generation no Main, waiter de ACK de 10 segundos, estado de generation no Host e release serializado.
- [x] Verificar que exit/cancel/shutdown do app rejeitam o waiter e que o owner mobile usa a generation da session vinculada.
- [x] Executar os testes direcionados de shared/desktop/host e confirmar GREEN.

### Task 3: Documentação, auto-revisão e verificação em runtime

**Arquivos:**

- Modify: `docs/architecture/zcode-code-architecture-overview.md`
- Modify: `docs/wsl-remote-workspace-design.md`
- Modify: `docs/superpowers/specs/2026-07-20-window-scoped-wsl-host-pooling-design.md`

- [x] Auto-revisar a propriedade do estado, o fora de ordem de mensagens, release/acquire duplicados, exit do Host, timeout e app shutdown.
- [x] Auto-revisar e corrigir adicionalmente o resíduo de pending connect após falha/timeout do ACK de acquire, evitando liberação duplicada do pool owner na limpeza da janela.
- [x] Auto-revisar SSH/Docker/Server, desktop continuous/mobile replayable e os limites de workspaceIdentity.
- [x] Executar todos os testes direcionados, `pnpm typecheck` e `pnpm lint`.
- [x] Verificar em Ubuntu/WSL real o deadline de liberação do lock no caminho normal e a sequência de PID/logs no fechamento e reabertura do workspace.
- [ ] Submeter um Conventional Commit, enviar a branch atual e conferir o hash remoto.

### Task 4: Compensação transacional quando o attachment falha após o acquire

**Arquivos:**

- Modify: `packages/desktop/src/main/desktopRemoteSessions.ts`
- Test: `packages/desktop/test/desktopRemoteSessions.test.ts`

- [x] Escrever o teste de ACK de acquire do desktop bem-sucedido com falha na transferência da porta do renderer; afirmar RED por falta de `ReleaseRemoteWorkspace`.
- [x] Adicionar o teste de corrida do pending connect cancelado após o ACK bem-sucedido, garantindo que não haja attach e que a release compensatória ocorra.
- [x] Registrar no chamador a generation adquirida e, em caso de falha no attachment, compensar liberando o workspace runtime e depois liberando o pool owner.
- [x] Antecipar a validação da generation do workspace mobile para antes da criação do MessageChannel e da transferência da porta do Host.
- [x] Executar os testes direcionados, typecheck e lint, e auto-revisar exceção de attachment, corrida de cancelamento e ordem de transferência de porta mobile.

### Task 5: Identidade canônica do pool WSL e deadline de acquire do deploy-lock

**Arquivos:**

- Modify: `packages/server/src/remote/wsl-backend.ts`
- Modify: `packages/server/src/remote/remoteDeployLock.ts`
- Modify: `packages/server/src/remote/deploy.ts`
- Create: `packages/desktop/src/main/desktopWslTargetResolver.ts`
- Modify: `packages/desktop/src/main/desktopRemoteSessions.ts`
- Test: `packages/desktop/test/desktopRemoteSessions.test.ts`
- Test: `packages/desktop/test/desktopWslTargetResolver.test.ts`
- Test: `packages/server/test/remoteDeployLock.test.ts`
- Test: `packages/server/test/wslBackend.test.ts`

- [x] Escrever o teste de conexões concorrentes para targets default/explicit equivalentes, afirmando RED por resolver não chamado e por spawn de dois WSL Host.
- [x] Escrever o teste de deadline em que o marcador de acquire do lock nunca aparece, afirmando RED com a Promise sem settle.
- [x] Implementar um resolver WSL canônico injetável, entrando no pool só depois do target resolvido, e revalidando o teardown após o await.
- [x] O resolver WSL retorna a distro canônica da lista e o user real de `id -un`; Promises de falha não são fixadas.
- [x] O deadline de acquire tem padrão de 120 segundos e é repassado por DeployOptions; no timeout, apenas o stream do waiter é destruído.
- [x] Executar os testes direcionados, typecheck e lint, e re-revisar platform/lifecycle.
- [x] O WSL real chegou a retornar brevemente `CreateVm/HCS/0x800705aa`; após a recuperação do ambiente, revalidou-se que default e explicit resolvem ambos para `Ubuntu/dev`.
- [x] Submeter e enviar.

## Evidências de runtime de 2026-07-21

- Ambiente: Windows + WSL2 Ubuntu, Desktop versão `3.4.0`, server remoto `3.4.0`.
- Linha de base de limpeza de órfãos históricos: o antigo PID `1160` do `zcode-server` (em execução por cerca de 7 horas) foi encerrado de forma precisa e, em seguida, confirmou-se que não havia processo de server.
- Primeira conexão: session `ee2d9a74-a9f0-4ef5-a019-bf9c811aca41` com sucesso; `zcode-server` no WSL com PID `1156`, Host em pool no Windows com PID `15120`, launcher com PID `24620`.
- Reconexão rápida: após fechar a session antiga, a reconexão do mesmo workspace partiu em `1.6ms` e obteve a session `d4a7de35-f4db-45c8-994f-e23efa23a506` com sucesso em `77.1ms`; o server no WSL continuou no PID `1156`, sem iniciar uma segunda instância de server.
- Fechamento da janela inteira: após fechar a única janela via CDP, sem esperar o TTL de 60 segundos, tanto o PID `25820` do Electron main quanto o PID `1156` do server no WSL desapareceram em 4 segundos.
- Encerramento normal do deploy lock: após a conexão e a reconexão, `~/.zcode/.deploy.lock` não existe; não foi observado resíduo de lock-holder.
- Identidade canônica: executando `WSLBackend.resolveIdentity()` diretamente se obtém `Ubuntu/dev`; a resolução concorrente do target default e do `{ distro: "ubuntu", user: "dev" }` explícito retorna ambos `{ distro: "Ubuntu", user: "dev" }`, com `equal=true`.

## Task 6: Liberação idempotente de owner WSL pendente

- [x] Duas conexões lógicas compartilham o mesmo Host, uma delas fica presa no acquire e é cancelada pelo requestId; o RED captura a destruição indevida por `attach-error:idle-timeout`.
- [x] O cancel, o erro de acquire, o erro de connect e o erro de attach do owner pendente passam todos por uma release idempotente unificada.
- [x] Testes direcionados, typecheck, lint, auto-revisão, submissão e envio.

## Task 7: Gate de lifecycle de spawn do WSL

- [x] Após aquecer a identidade resolvida, deixar a descoberta de disponibilidade pendente e concluir o dispose; o RED prova que a lógica antiga ainda faria spawn.
- [x] `exec()` reavalia o estado disposed antes do spawn síncrono final, garantindo que nenhum child novo seja registrado depois da barreira.
- [x] Testes direcionados, typecheck, lint, auto-revisão, submissão e envio.

## Task 8: Liberação compensatória da generation de acquire WSL abandonada

- [x] Os testes de timeout/cancel afirmam o envio imediato de Release com a mesma generation; um ACK bem-sucedido tardio compensa de novo e nunca faz attach, observando primeiro o RED.
- [x] O pending connect guarda context/generation e fecha os caminhos locais de abandono com um helper idempotente; um ACK bem-sucedido sem correspondência executa a compensação segura.
- [x] O reject de Host pendente reutiliza de forma unificada o helper de release do owner.
- [x] Testes direcionados, typecheck, lint, auto-revisão, submissão e envio.

## Task 9: Deadline de manifest da branch de destino integrada e identidade por SHA do GLM

- [x] Confirmar que a branch atual está sem o repasse completo de `manifestRequestTimeoutMs` e sem a cadeia de decisão do SHA do artefato do GLM.
- [x] Integrar o `origin/main` mais recente, preservando o deadline de acquire/release do deploy-lock e a reconferência dentro do lock.
- [x] O deploy único fixa um manifest fresco e repassa o mesmo snapshot de SHA para a decisão do GLM e para o cache de release.
- [x] Executar as regressões direcionadas de timeout de manifest, mesma versão com SHA diferente e deploy lock.
- [x] Executar typecheck, lint e verificação de diff, e comparar em sentido inverso as capacidades de deploy remoto com o `origin/main`.
- [x] A revisão independente de código não encontrou nada Critical/High/Medium; submetido e enviado.