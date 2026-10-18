# Plano de Implementação do Lock de Transação de Deploy Remoto

> **Para workers agentivos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** Fazer com que o deploy remoto entre Hosts/processos seja executado serialmente no mesmo install root e eliminar a intercalação entre o upload de diretório com arquivo fixo e a substituição final do diretório.

**Architecture:** Criar um novo lock-holder remoto, gerenciando `${REMOTE_BASE}/.deploy.lock` com `mkdir` atômico remoto, owner UUID, heartbeat de 30 segundos e takeover de stale em 600 segundos; `deployServer` reexecuta a decisão de deploy dentro do lock e conclui toda a instalação dos componentes. LocalUpload, RemoteDownload e a instalação de diretórios em modo de desenvolvimento usam, respectivamente, staging de archive/extract único por owner, e em caso de falha limpam apenas os próprios caminhos.

**Exceção de SSH em 2026-07-23:** o desktop atualmente tem apenas uma janela, e a mesma janela e o mesmo SSH target reutilizam o shared SSH host readiness; sob a premissa de produto de não considerar múltiplos clientes implantando no mesmo SSH install root e de aceitar uma sobreposição breve entre comandos remotos antigos após desconexão e a reconexão, a chamada shared-host `InitRemoteSshHost` do desktop declara serialização do lado do caller e dispensa o lock-holder remoto. O runtime SSH dedicado, WSL, Docker e as chamadas que não declaram explicitamente a serialização do lado do caller continuam executando o lock remoto definido por este plano.

**Tech Stack:** TypeScript, Vitest, shell POSIX, stdio de `IRemoteBackend`.

## Restrições globais

- Exceto pelo shared SSH host do desktop que declara explicitamente a serialização do lado do caller, o lock cobre a transaction completa de `deployServer` e não pode ser reduzido a um único asset installer.
- O install root de workspace/distro/user continua sendo `~/.zcode/server`, sem chamar `wsl --terminate`.
- O owner token precisa ser imprevisível; a liberação e o takeover de stale não usam globs amplos.
- Manter compatibilidade com o backend POSIX de WSL, Docker e das chamadas SSH que ainda usam o lock, sem depender de `flock`, GNU `mv -T` ou tar do sistema.
- Executar os testes direcionados, `pnpm typecheck` e `pnpm lint` antes de concluir.

---

### Task 1: Lock-holder de deploy remoto

**Files:**
- Create: `packages/server/src/remote/remoteDeployLock.ts`
- Test: `packages/server/test/remoteDeployLock.test.ts`

**Interfaces:**
- Produces: `acquireRemoteDeployLock(backend, options?): Promise<RemoteDeployLockHandle>`.
- Produces: `RemoteDeployLockHandle.release(): Promise<void>`, com release repetido idempotente.

- [x] **Step 1: escrever o teste que falha**

  O comando de teste contém `mkdir` atômico, owner token, heartbeat de 30 segundos,determinação de stale em 600 segundos e limpeza e limpeza verificada por owner; com um backend stdio controlável, verifica-se que a Promise não resolve antes do acquired marker, que resolve após o marker, e que o release escreve o owner token e aguarda o close.

- [x] **Step 2: rodar o teste e confirmar RED**

  Run: `pnpm vitest run packages/server/test/remoteDeployLock.test.ts`

  Expected: FAIL, pois o módulo ou `acquireRemoteDeployLock` não existe.

- [x] **Step 3: implementar o lock-holder mínimo**

  ```ts
  export interface RemoteDeployLockHandle {
    ownerToken: string;
    release(): Promise<void>;
  }

  export async function acquireRemoteDeployLock(
    backend: IRemoteBackend,
    options?: { lockDir?: string; ownerToken?: string },
  ): Promise<RemoteDeployLockHandle>;
  ```

  O stdout só resolve após ver `zcode-deploy-lock-acquired:<owner>`; se o stream fechar antes, rejeita. O release escreve
  `zcode-deploy-lock-release:<owner>\n` e encerra o stdin, aguardando em seguida o close do lock-holder.

- [x] **Step 4: rodar o teste e confirmar GREEN**

  Run: `pnpm vitest run packages/server/test/remoteDeployLock.test.ts`

  Expected: PASS.

### Task 2: Transaction de deploy e re-verificação de versão dentro do lock

**Files:**
- Modify: `packages/server/src/remote/deploy.ts`
- Test: `packages/server/test/remoteDeploy.test.ts`

**Interfaces:**
- Consumes: `acquireRemoteDeployLock()`.
- Produces: `deployServer()` chamando `checkServerDeployDecision()` após obter o lock e fazendo release em todas as saídas de sucesso/falha.

- [x] **Step 1: escrever o teste que falha**

  Injetar um lock backend controlável: a primeira decisão de deploy retorna que é preciso implantar e, enquanto aguarda o lock, simula-se que outro owner já concluiu; após obter o lock, a segunda decisão retorna versão correspondente, e afirma-se que não houve upload e que o lock foi liberado. Depois, faz-se o installer falhar e afirma-se que o caminho de exceção ainda libera o lock.

- [x] **Step 2: rodar o teste e confirmar RED**

  Run: `pnpm vitest run packages/server/test/remoteDeploy.test.ts`

  Expected: FAIL, pois a decisão de deploy atual só é executada uma vez ou não há comando de lock-holder.

- [x] **Step 3: conectar a transaction completa**

  `deployServer()` calcula `serverDeployDecision` somente após obter o lock; `options.force` mantém a semântica de deploy forçado, e quem espera normalmente entra nos caminhos de skip/repair conforme o resultado da re-verificação dentro do lock; o `finally` faz release incondicionalmente.

- [x] **Step 4: rodar o teste e confirmar GREEN**

  Run: `pnpm vitest run packages/server/test/remoteDeploy.test.ts`

  Expected: PASS.

### Task 3: Staging e limpeza com diretório único por owner

**Files:**
- Modify: `packages/server/src/remote/remoteAssetInstaller.ts`
- Modify: `packages/server/src/remote/zcodeAgentDevDeploy.ts`
- Test: `packages/server/test/remoteAssetInstaller.test.ts`
- Test: `packages/server/test/remoteDeploy.test.ts`

**Interfaces:**
- Consumes: o lock de transação do deploy root, que garante a serialização da substituição final do diretório.
- Produces: `remoteArchivePath`, `extractRoot` e `stagingDir` únicos por deploy de diretório; o cleanup de falha referencia apenas esses caminhos de owner.

- [x] **Step 1: escrever o teste que falha**

  Chamar `installDirectory()` do LocalUpload duas vezes de forma concorrente e afirmar que os dois caminhos remotos de tar/extract são diferentes; afirmar que o comando contém a trap de cleanup por owner. No upload de diretório em modo de desenvolvimento, afirmar que o `packages.tar.gz` fixo não é mais usado; no RemoteDownload, afirmar que o staging único só é executado dentro do lock de transação.

- [x] **Step 2: rodar o teste e confirmar RED**

  Run: `pnpm vitest run packages/server/test/remoteAssetInstaller.test.ts packages/server/test/remoteDeploy.test.ts`

  Expected: FAIL, pois o LocalUpload e o modo de desenvolvimento ainda reutilizam o tar fixo.

- [x] **Step 3: implementar o staging de diretório e a limpeza em caso de falha**

  O LocalUpload faz upload primeiro para `${remoteDir}.tar.gz-<owner>`, extrai para `${remoteDir}.extract-<owner>` e move o diretório basename de dentro dele para a posição final; tanto o trap do shell quanto o catch de falha de upload limpam apenas esses dois caminhos. O modo de desenvolvimento adota a mesma regra de owner; o RemoteDownload mantém o staging único já existente e ganha um comentário explícito sobre o transaction lock e uma trap de cleanup em caso de falha.

- [x] **Step 4: validação completa e commit**

  Run:

  ```powershell
  pnpm vitest run packages/server/test/remoteDeployLock.test.ts packages/server/test/remoteAssetInstaller.test.ts packages/server/test/remoteDeploy.test.ts
  pnpm typecheck
  pnpm lint
  ```

  Expected: exit code 0; em seguida fazer commit de `fix(remote): serialize remote asset deployment` e push da branch atual.