# Plano de Implementação da Limpeza de Processos Remotos WSL

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. As etapas usam a sintaxe de caixa de seleção (`- [ ]`) para acompanhamento.

**Objetivo:** fazer com que o fechamento real da janela, a saída do aplicativo e a instalação de atualização liberem, de forma determinística, todos os Hosts Remotos e processos de server/Agent pertencentes ao ZCode, sem encerrar a distribuição WSL.

**Arquitetura:** o Main do Desktop usará o gerenciador de sessões remotas como autoridade de ciclo de vida e aguardará todos os Hosts Locais/Remotos únicos através de uma barreira de desligamento idempotente. O desligamento de stdio do Host e do server remoto passa a ser uma máquina de fases com prazo limitado que sempre tenta a limpeza do Agent, enquanto o WSL rastreia apenas os processos filhos que ele criou. Um registro estrito de proprietors fornece limpeza segura para processos de Agent do ZCode recém-criados e comprovadamente órfãos.

**Stack técnico:** TypeScript, Electron UtilityProcess, child_process/stdio do Node.js, Vitest, serviços de Main/Host do Desktop independentes de Zustand.

**Nota de escopo de execução (2026-07-20):** a fronteira de produto confirmada pelo usuário é “fechamento real (sem ocultação na bandeja) e na instalação de atualização”.
Esta implementação cobre as Tasks 1-3 e a documentação/verificação; o registro de proprietários/reaper de inicialização cruzada da Task 4 não pertence a essa fronteira de gatilho e ampliaria para uma verificação
global de processos, portanto não é introduzido agora. O fallback atual recupera apenas os filhos criados explicitamente pela própria instância de `WSLBackend`, sem varrer por nome de processo.

## Restrições globais

- Nunca chamar `wsl --terminate` nem `wsl --shutdown`.
- Não destruir runtimes para minimizar, ocultar na bandeja, recarregar o renderer ou desconectar a ponte móvel.
- Anexos local/SSH/WSL/Docker do Desktop permanecem `desktop-continuous`; o mobile permanece `web-remote-replayable`.
- O `/remote` móvel deve continuar se anexando a um Host existente e nunca iniciar um runtime independente.
- Preservar `workspaceKey = workspaceIdentity?.trim() || workspacePath`, `remoteSessionId`, owner/lease e a semântica de CommandInbox.
- Todas as APIs de ciclo de vida devem ser idempotentes e reutilizar uma Promise em voo/resultante.
- Comentários explicando causas de bug são escritos em chinês.
- Executar `pnpm typecheck` e `pnpm lint` antes de concluir.

---

### Task 1: Barreira de Desligamento de Hosts Remotos no Nível do Aplicativo

**Arquivos:**
- Modificar: `packages/desktop/src/main/desktopRemoteSessions.ts`
- Modificar: `packages/desktop/src/main/index.ts`
- Modificar: `packages/desktop/test/desktopRemoteSessions.test.ts`
- Modificar: `packages/desktop/test/desktopHostProcess.test.ts`

**Interfaces:**
- Consome: `disposeHostProcessAndWait(child, label, timers, logger, options)` já existente.
- Produz: `disposeAllAndWaitForAppShutdown(reason: string): Promise<void>` no gerenciador de sessões remotas.

- [ ] **Etapa 1: Escrever testes falhos do gerenciador**

Adicionar testes que criam uma sessão WSL dedicada, um Host SSH compartilhado, uma conexão SSH pendente e um runtime de Bot, e então verificar o desligamento da aplicação:

```ts
const shutdown = manager.disposeAllAndWaitForAppShutdown("app-before-quit");
expect(disposeHostProcessAndWait).toHaveBeenCalledTimes(3);
expect(disposeHostProcessAndWait).toHaveBeenCalledWith(
  wslChild,
  expect.stringContaining("app-before-quit"),
);
await shutdown;
```

Adicionar uma segunda asserção de chamada provando que a mesma Promise em voo é reutilizada e que os processos de Host são deduplicados.

- [ ] **Etapa 2: Executar os testes e verificar RED**

Executar:

```sh
pnpm exec vitest run packages/desktop/test/desktopRemoteSessions.test.ts
```

Esperado: FAIL porque `disposeAllAndWaitForAppShutdown` e a injeção do disposer assíncrono não existem.

- [ ] **Etapa 3: Implementar a barreira do gerenciador**

Estender as opções do gerenciador com:

```ts
disposeHostProcessAndWait: (
  child: ElectronUtilityProcess,
  label: string,
) => Promise<void>;
```

Implementar uma função single-flight que rejeita as conexões pendentes, tira um snapshot dos processos dedicados/compartilhados/Bot únicos, limpa os mapas de ciclo de vida antes de aguardar e executa todos os desligamentos em paralelo:

```ts
let appShutdownInFlight: Promise<void> | null = null;
let appShutdownStarted = false;

function disposeAllAndWaitForAppShutdown(reason: string): Promise<void> {
  if (appShutdownInFlight) return appShutdownInFlight;
  appShutdownStarted = true;
  const hosts = collectUniqueRemoteHostProcessesAndClearState(reason);
  appShutdownInFlight = Promise.all(
    hosts.map(({ process, label }) => options.disposeHostProcessAndWait(process, label)),
  ).then(() => undefined);
  return appShutdownInFlight;
}
```

As APIs de criação devem rejeitar depois de `appShutdownStarted`.

- [ ] **Etapa 4: Conectar a saída do app e a instalação de atualização**

Em `index.ts`, injetar `disposeHostProcessAndWait` no gerenciador. Alterar tanto `prepareAppQuit` quanto `prepareWindowsProcessesForUpdateInstall` para aguardar a limpeza do Host Local e `remoteSessionManager.disposeAllAndWaitForAppShutdown(reason)` em paralelo. Preservar a disposição por janela via `closed` já existente.

- [ ] **Etapa 5: Executar os testes direcionados e verificar GREEN**

Executar:

```sh
pnpm exec vitest run packages/desktop/test/desktopRemoteSessions.test.ts packages/desktop/test/desktopHostProcess.test.ts packages/desktop/test/desktopWindowLifecycle.test.ts packages/desktop/test/e2eProcessCleanup.test.ts
```

Esperado: todos os testes PASSAM.

- [ ] **Etapa 6: Commitar**

```sh
git add packages/desktop/src/main/desktopRemoteSessions.ts packages/desktop/src/main/index.ts packages/desktop/test/desktopRemoteSessions.test.ts packages/desktop/test/desktopHostProcess.test.ts
git commit -m "fix(desktop): await remote hosts during shutdown"
```

### Task 2: Fases de Limpeza Limitadas do Host e do Server Remoto

**Arquivos:**
- Modificar: `packages/desktop/src/host/index.ts`
- Modificar: `packages/server/src/stdio-lifecycle.ts`
- Modificar: `packages/server/test/stdioLifecycle.test.ts`
- Criar: `packages/desktop/src/host/hostShutdownPhases.ts`
- Criar: `packages/desktop/test/hostShutdownPhases.test.ts`

**Interfaces:**
- Produz: `runHostShutdownPhases(phases, options): Promise<HostShutdownResult>`.
- Consome depois: `RemoteConnection.disposeAndWait()` da Task 3; até lá a fase remota pode envolver um `dispose()` síncrono.

- [ ] **Etapa 1: Escrever o teste falho do ciclo de vida de stdio**

Adicionar um teste de fake timers em que `stopRpc` nunca resolve e verificar que `dispose` ainda é chamado depois do prazo da fase de RPC:

```ts
stdin.emit("end");
await vi.advanceTimersByTimeAsync(1_000);
expect(dispose).toHaveBeenCalledTimes(1);
await vi.advanceTimersByTimeAsync(3_500);
expect(exit).toHaveBeenCalledTimes(1);
```

- [ ] **Etapa 2: Executar o teste do server e verificar RED**

```sh
pnpm exec vitest run packages/server/test/stdioLifecycle.test.ts
```

Esperado: FAIL porque a corrida total atual `Promise.race` pula `dispose` enquanto `stopRpc` está pendente.

- [ ] **Etapa 3: Dar a cada fase de stdio um prazo independente**

Substituir a corrida total única por um executor de fases limitado reutilizável:

```ts
await runBoundedPhase("rpc-stop", stopRpc, rpcStopTimeoutMs);
await runBoundedPhase("service-dispose", dispose, serviceDisposeTimeoutMs);
exit(requestedExitCode);
```

Timeout/erro marca o código de saída 1 e registra a fase exata, mas nunca pula a próxima fase.

- [ ] **Etapa 4: Escrever os testes de fases do Host**

Cobrir falha de limpeza de serviço seguida de limpeza remota, chamadas repetidas de desligamento e timeout de limpeza retornando um resultado diferente de zero.

- [ ] **Etapa 5: Implementar e conectar as fases do Host**

Criar o helper focado e fazer `disposeHostResources` chamá-lo. Alterar `disconnect` para:

```ts
process.once("disconnect", () => {
  void disposeHostResources("disconnect").finally(() => process.exit(1));
});
```

Manter `exit` como algo síncrono e best-effort apenas.

- [ ] **Etapa 6: Executar os testes direcionados e verificar GREEN**

```sh
pnpm exec vitest run packages/server/test/stdioLifecycle.test.ts packages/desktop/test/hostShutdownPhases.test.ts
```

Esperado: todos os testes PASSAM.

- [ ] **Etapa 7: Commitar**

```sh
git add packages/server/src/stdio-lifecycle.ts packages/server/test/stdioLifecycle.test.ts packages/desktop/src/host/index.ts packages/desktop/src/host/hostShutdownPhases.ts packages/desktop/test/hostShutdownPhases.test.ts
git commit -m "fix(remote): bound every shutdown cleanup phase"
```

### Task 3: RemoteConnection Aguardável e Posse de Filhos WSL

**Arquivos:**
- Modificar: `packages/server/src/remote/backend.ts`
- Modificar: `packages/server/src/remote/connect.ts`
- Modificar: `packages/server/src/remote/wsl-backend.ts`
- Modificar: `packages/server/src/remote/docker-backend.ts`
- Modificar: `packages/desktop/src/host/index.ts`
- Modificar: `packages/server/test/remoteConnect.test.ts`
- Modificar: `packages/server/test/wslBackend.test.ts`

**Interfaces:**
- Produz: `RemoteConnection.disposeAndWait(): Promise<void>`.
- Produz: `IRemoteBackend.disposeAndWait?(): Promise<void>` opcional, mantendo a compatibilidade com o `dispose()` síncrono.

- [ ] **Etapa 1: Escrever os testes falhos de conexão**

Verificar que `disposeAndWait` fecha o stdin imediatamente, aguarda `stream.onClose`, faz fallback para a limpeza do backend após um prazo de fake timers e retorna a mesma Promise em chamadas repetidas. Adicionar um teste de falha de conexão verificando a disposição do backend quando detect/deploy/handshake lança erro.

- [ ] **Etapa 2: Escrever os testes falhos de filhos WSL**

Estender o child do spawn mock com `kill`, `exit` e `close`. Verificar:

```ts
const stream = await backend.exec("sleep 60");
const disposal = backend.disposeAndWait?.();
expect(child.kill).not.toHaveBeenCalled();
child.emit("close", 0);
await disposal;
```

Adicionar cobertura de timeout provando que apenas filhos criados por aquele backend são mortos e que nenhum argumento de terminate/shutdown do WSL é emitido.

- [ ] **Etapa 3: Executar os testes e verificar RED**

```sh
pnpm exec vitest run packages/server/test/remoteConnect.test.ts packages/server/test/wslBackend.test.ts
```

Esperado: FAIL porque a limpeza assíncrona e a posse de filhos não existem.

- [ ] **Etapa 4: Implementar o single-flight de RemoteConnection**

`dispose()` inicia a mesma Promise de limpeza; `disposeAndWait()` a retorna. A limpeza para primeiro cliente/protocolo/socket, aguarda o fechamento do stream com um período de tolerância injetado/padrão e então invoca a limpeza de fallback do backend. Envolver a configuração da conexão em `try/catch` para que uma configuração com falha disposte o backend.

- [ ] **Etapa 5: Rastrear filhos WSL**

Manter um `Set<ChildProcess>` para chamadas ativas de `spawn`/`execFile`, desregistrar nos eventos terminais, rejeitar novos comandos após a disposição e implementar espera limitada mais fallback `child.kill()`. Não chamar comandos WSL de escopo da distribuição.

- [ ] **Etapa 6: Conectar a espera no Host**

Usar `await remoteConnection.disposeAndWait()` na fase de limpeza remota do Host.

- [ ] **Etapa 7: Executar os testes direcionados e verificar GREEN**

```sh
pnpm exec vitest run packages/server/test/remoteConnect.test.ts packages/server/test/wslBackend.test.ts packages/server/test/dockerBackend.test.ts packages/desktop/test/hostShutdownPhases.test.ts
```

Esperado: todos os testes PASSAM.

- [ ] **Etapa 8: Commitar**

```sh
git add packages/server/src/remote packages/server/test packages/desktop/src/host/index.ts packages/desktop/test/hostShutdownPhases.test.ts
git commit -m "fix(remote): await WSL server process shutdown"
```

### Task 4: Registro Seguro de Proprietários WSL e Reaper de Órfãos

**Arquivos:**
- Criar: `packages/services/src/zcode-agent/remoteAgentOwnerRegistry.ts`
- Criar: `packages/services/test/remoteAgentOwnerRegistry.test.ts`
- Modificar: `packages/services/src/zcode-agent/zcodeAgentProcessManager.ts`
- Modificar: `packages/services/src/node.ts`
- Modificar: `packages/server/src/remote/connect.ts`
- Modificar: `packages/server/src/entry-stdio.ts`

**Interfaces:**
- Produz: `RemoteAgentOwnerRegistry` com `registerAgent`, `unregisterAgent`, `reapDeadOwners` e `dispose`.
- Consome: `ZCODE_REMOTE_OWNER_ID`, `ZCODE_REMOTE_OWNER_KIND` e uma raiz de registro de proprietários em `$HOME/.zcode/server/owners`.

- [ ] **Etapa 1: Escrever os testes falhos do registro**

Usar um diretório temporário e um inspetor/terminador de processos injetado. Cobrir correspondência exata de ownerId + PID + horário de início + executável, reuso de PID, registro corrompido, divergência de ambiente, desregistro normal e skip de processo legado sem proprietário.

- [ ] **Etapa 2: Executar o teste e verificar RED**

```sh
pnpm exec vitest run packages/services/test/remoteAgentOwnerRegistry.test.ts
```

Esperado: FAIL porque o registro não existe.

- [ ] **Etapa 3: Implementar o registro estrito**

Persistir os registros de proprietário atomicamente com versão de schema, ownerId, PID/horário de início do server, PID/horário de início do Agent e raiz de executável esperada. Fazer o reap somente quando o proprietário do server está morto/reutilizado e todas as verificações de identidade do Agent ainda correspondem. Nunca corresponder apenas pelo nome do processo.

- [ ] **Etapa 4: Integrar ambiente de proprietário e callbacks de processo**

Gerar o ownerId em `connectRemote`, injetá-lo no comando do server remoto, inicializar o registro apenas para `desktop-attached-remote` e registrar/desregistrar PIDs filhos em `ZCodeAgentProcessManager`. A disposição normal do serviço remove o registro do proprietário.

- [ ] **Etapa 5: Executar os testes do registro e do gerenciador de processos**

```sh
pnpm exec vitest run packages/services/test/remoteAgentOwnerRegistry.test.ts packages/services/test/zcodeAgentProcessManager.test.ts packages/server/test/remoteConnect.test.ts
```

Esperado: todos os testes PASSAM.

- [ ] **Etapa 6: Commitar**

```sh
git add packages/services/src/zcode-agent packages/services/src/node.ts packages/services/test packages/server/src/remote/connect.ts packages/server/src/entry-stdio.ts packages/server/test
git commit -m "fix(remote): reap owned orphan agents safely"
```

### Task 5: Documentação e Verificação Completa

**Arquivos:**
- Modificar: `docs/wsl-remote-workspace-design.md`
- Modificar: `docs/architecture/zcode-code-architecture-overview.md`
- Modificar: `docs/web-remote-control/web-remote-control-architecture.md`
- Modificar: `docs/web-remote-control/task-realtime-sync.md`

**Interfaces:**
- Documenta o ciclo de vida final e as evidências de verificação; nenhuma nova interface de runtime.

- [ ] **Etapa 1: Atualizar a documentação de fatos atuais**

Documentar as barreiras de desligamento de app/atualização, a posse de filhos WSL, o reap de proprietários e os eventos explicitamente não-teardown. Declarar que a desconexão do anexo móvel nunca destrói o Host compartilhado e que o encerramento da distribuição é proibido.

- [ ] **Etapa 2: Executar todas as suítes direcionadas**

```sh
pnpm exec vitest run packages/desktop/test/desktopRemoteSessions.test.ts packages/desktop/test/desktopHostProcess.test.ts packages/desktop/test/desktopWindowLifecycle.test.ts packages/desktop/test/e2eProcessCleanup.test.ts packages/desktop/test/hostShutdownPhases.test.ts packages/server/test/stdioLifecycle.test.ts packages/server/test/remoteConnect.test.ts packages/server/test/wslBackend.test.ts packages/server/test/dockerBackend.test.ts packages/services/test/remoteAgentOwnerRegistry.test.ts packages/services/test/zcodeAgentProcessManager.test.ts
```

Esperado: todos os testes PASSAM.

- [ ] **Etapa 3: Executar os portões mecânicos**

```sh
pnpm typecheck
pnpm lint
```

Esperado: ambos os comandos saem com 0.

- [ ] **Etapa 4: Realizar a verificação de runtime WSL**

Registrar evidências de PID antes/depois para ocultar na bandeja, fechar a janela de verdade, sair do app e preparar a atualização. Confirmar que o Host/server/Agent do ZCode saem enquanto `wsl.exe -l -v` pode continuar mostrando a distribuição como Running.

- [ ] **Etapa 5: Commitar**

```sh
git add docs packages
git commit -m "docs(remote): record deterministic WSL cleanup"
```

- [ ] **Etapa 6: Solicitar revisão de código e tratar os achados**

Revisar o diff completo da branch contra a spec de design, reexecutar os testes afetados após qualquer correção e deixar a árvore de trabalho limpa.