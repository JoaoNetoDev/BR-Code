# Plano de Implementação de Espera Assíncrona de Pipe na Importação de Browser no Windows

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Corrigir o problema que faz a importação de App-Bound Cookie do Chrome no Windows falhar inevitavelmente, porque o pipe do servidor chama de forma síncrona uma API de espera assíncrona antes do handshake com o controller.

**Arquitetura:** Preservar as fronteiras existentes de processo e identidade entre broker → elevated controller → serviço `LocalSystem`, e apenas alternar o named pipe do servidor criado por `CreatePipeServer` para `PipeOptions.Asynchronous`, de modo que a espera limitada existente `BeginWaitForConnection` / `EndWaitForConnection` funcione legitimamente. O cliente continua conectando de forma síncrona; ACL, timeout, PID exato, caminho da imagem e validação de token de uso único permanecem inalterados.

**Stack técnico:** C#/.NET Framework `System.IO.Pipes`, TypeScript, Vitest, pnpm

## Restrições Globais

- Todo named pipe de servidor que implemente espera limitada por `BeginWaitForConnection` / `EndWaitForConnection` deve ser criado com `PipeOptions.Asynchronous`; a conexão do cliente permanece síncrona.
- Não ampliar a ACL do pipe, não remover timeouts, não afrouxar a validação de PID/caminho da imagem/token nem alterar a fronteira de identidade broker → controller → serviço `LocalSystem`.
- A causa da falha fica apenas no log de segurança local; UI, IPC e códigos de erro públicos permanecem inalterados.
- Não ler, registrar ou commitar Cookies reais, a master key do Chrome, pipe/token, PID ou o stdout bruto do helper.
- É obrigatório executar `pnpm typecheck` e `pnpm lint`; se ocorrer uma falha de baseline conhecida e sem relação, registrar o comando completo, os arquivos que falharam e o resultado das verificações complementares para o escopo afetado por esta mudança.

---

### Task 1: Reproduzir com um source contract o descasamento entre os modos síncrono e assíncrono

**Files:**
- Modify: `packages/desktop/test/windowsChromeAppBoundKey.test.ts`
- Test: `packages/desktop/test/windowsChromeAppBoundKey.test.ts`

**Interfaces:**
- Consumes: o código-fonte de `CreatePipeServer`, `ConnectPipeClient` e `WaitForConnection` em `Program.cs`.
- Produces: o native source contract BS-030, travando `PipeOptions.Asynchronous` no servidor, `PipeOptions.None` no cliente e as chamadas de espera assíncrona existentes.

- [ ] **Step 1: Escrever o teste de regressão que falha**

Adicione ao describe de `windowsChromeAppBoundKey`:

```ts
it("服务端命名管道以异步模式创建以支持有界等待", async () => {
  const source = await readFile(
    join(import.meta.dirname, "../native/windows-browser-import-helper/Program.cs"),
    "utf8",
  );
  const serverStart = source.indexOf("private static NamedPipeServerStream CreatePipeServer");
  const clientStart = source.indexOf("private static NamedPipeClientStream ConnectPipeClient");

  expect(serverStart).toBeGreaterThanOrEqual(0);
  expect(clientStart).toBeGreaterThan(serverStart);
  const serverSource = source.slice(serverStart, clientStart);
  expect(serverSource).toContain("PipeOptions.Asynchronous");
  expect(serverSource).not.toContain("PipeOptions.None");
  expect(source).toContain(
    '".", pipeName, PipeDirection.InOut, PipeOptions.None, TokenImpersonationLevel.Impersonation',
  );
  expect(source).toContain("pipe.BeginWaitForConnection(null, null)");
});
```

- [ ] **Step 2: Executar o teste direcionado e confirmar RED**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/windowsChromeAppBoundKey.test.ts
```

Expected: o novo teste falha em `expect(serverSource).toContain("PipeOptions.Asynchronous")`; os demais testes existentes passam. A falha deve vir necessariamente do `CreatePipeServer` atual usar `PipeOptions.None`, e não de erro de caminho, sintaxe ou fixture.

### Task 2: Corrigir de forma mínima o modo de abertura do pipe do servidor

**Files:**
- Modify: `packages/desktop/native/windows-browser-import-helper/Program.cs:1054-1062`
- Test: `packages/desktop/test/windowsChromeAppBoundKey.test.ts`

**Interfaces:**
- Consumes: o source contract BS-030 da Task 1.
- Produces: um `NamedPipeServerStream` de servidor assíncrono, ainda retornado por `CreatePipeServer(string, bool, bool)`; assinatura e chamadores permanecem inalterados.

- [ ] **Step 1: Escrever a implementação mínima e um comentário de causa raiz**

Substitua apenas os parâmetros de construção do servidor:

```csharp
        return new NamedPipeServerStream(
            pipeName,
            PipeDirection.InOut,
            1,
            PipeTransmissionMode.Byte,
            // Bugfix 原因：WaitForConnection 使用 Begin/End 异步等待实现硬超时；同步管道会在
            // controller/service 接入前直接抛 InvalidOperationException，导致 Cookie 解密从未开始。
            PipeOptions.Asynchronous,
            4096,
            4096,
            security);
```

Não altere o `PipeOptions.None` de `ConnectPipeClient`, nem a ACL, `PipeTimeoutMs`, `VerifyPipeClient` ou a leitura/escrita de token.

- [ ] **Step 2: Executar o teste direcionado e confirmar GREEN**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/windowsChromeAppBoundKey.test.ts
```

Expected: 14 tests passed; o teste BS-030 prova que o servidor é assíncrono, o cliente é síncrono e `BeginWaitForConnection` foi preservado.

- [ ] **Step 3: Compilar o helper do Windows**

Run:

```powershell
pnpm --filter @zcode/desktop prepare:browser-import-helper
```

Expected: saída `[browser-import-helper] built ...zcode-browser-import-helper.exe`; os comentários em C# e `PipeOptions.Asynchronous` são aceitos pela cadeia atual de compilação Roslyn/.NET Framework.

- [ ] **Step 4: Atualizar o status de verificação**

Mude o status de cobertura do BS-030 em `docs/browser-use/2026-07-13-browser-settings-spec.md` de:

```markdown
source contract 待补；签名实机待复验
```

para:

```markdown
source contract automated；helper compiled；签名实机待复验
```

No mesmo documento, complemente o trecho de evidências reais no Windows: o pacote assinado mais recente registra `controller_handshake_failed`; uma sonda de runtime .NET isomórfica confirma que `PipeOptions.None` lança “Pipe is not opened in asynchronous mode” ao chamar `BeginWaitForConnection`; a correção do helper no workspace foi compilada, Cookies reais e a master key não entraram nos logs, e ainda é preciso um smoke test do próximo pacote assinado.

### Task 3: Verificação mecânica, limpeza e entrega

**Files:**
- Delete: `.tmp-controller-lifecycle-probe.ps1`
- Delete: `.tmp-controller-lifecycle-probe-result.txt`
- Delete: `.tmp-cross-account-path-probe.ps1`
- Delete: `.tmp-cross-account-path-probe-result.txt`
- Delete: `.tmp-cross-account-pipe-probe.ps1`
- Delete: `.tmp-cross-account-pipe-probe-result.txt`
- Delete: `.tmp-cross-account-pipe-probe-result.txt.client`
- Verify: repository-wide TypeScript and lint targets

**Interfaces:**
- Consumes: os testes das Tasks 1-2, o código-fonte do helper e o status BS-030 atualizado.
- Produces: nenhuma sonda temporária, um commit de bugfix revisável e o branch já enviado.

- [ ] **Step 1: Executar a checagem de tipos do escopo afetado**

Run:

```powershell
pnpm exec tsc -p packages/desktop/tsconfig.host.json --noEmit
```

Expected: PASS.

- [ ] **Step 2: Executar o typecheck obrigatório do repositório**

Run:

```powershell
pnpm typecheck
```

Expected: PASS; se ainda for atingida a dependência direta ausente de `expect` do E2E que já existe no repositório atual, registre apenas o arquivo específico e prove o escopo de desktop host/test desta mudança com o Step 1 e os testes direcionados.

- [ ] **Step 3: Executar o lint obrigatório do repositório**

Run:

```powershell
pnpm lint
```

Expected: 0 errors; os warnings existentes devem ser sem relação com esta mudança e nenhum arquivo novo pode gerar warning.

- [ ] **Step 4: Reexecutar os testes direcionados e a compilação, e revisar o diff**

Run:

```powershell
pnpm exec vitest run packages/desktop/test/windowsChromeAppBoundKey.test.ts
pnpm --filter @zcode/desktop prepare:browser-import-helper
git diff --check
git status --short
```

Expected: 14 tests passed; helper built; `git diff --check` aprovado; o status contém apenas o plano, os testes, `Program.cs` e a atualização de status da spec.

- [ ] **Step 5: Limpar as sondas temporárias de runtime**

Use `apply_patch` para apagar os três `.ps1` e, após confirmar que os caminhos estão todos dentro de `C:\Users\dev\z-code`, apague os quatro arquivos de resultado `.txt`. Execute `git status --short` novamente; não deve sobrar nenhum `.tmp-*`.

- [ ] **Step 6: Commitar a implementação**

Run:

```powershell
git add -- packages/desktop/test/windowsChromeAppBoundKey.test.ts packages/desktop/native/windows-browser-import-helper/Program.cs docs/browser-use/2026-07-13-browser-settings-spec.md docs/superpowers/plans/2026-07-17-windows-browser-import-asynchronous-pipe-wait.md
git commit -m "fix(desktop): open browser import server pipes asynchronously"
```

Expected: Conventional Commit bem-sucedido; as sondas temporárias e arquivos sem relação não estão no staging area.

- [ ] **Step 7: Enviar o branch atual**

Run:

```powershell
git push origin feat/browser-use-web-app
```

Expected: `origin/feat/browser-use-web-app` atualizado até o commit de implementação; se o pre-push apenas atingir falhas de baseline já registradas e sem relação, reporte a evidência concreta e não contorne o hook por conta própria.