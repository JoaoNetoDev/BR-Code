# Plano de implementação do lazy start do CUA Helper

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** as credenciais de CUA voltadas ao agente passam a ser injeção de dados puro — zero Helper IO na inicialização do Host e no spawn do Agent; o Helper é levantado sob demanda pela primeira chamada de CUA (SDK) ou por ação explícita do usuário (página de configurações/fluxo de autorização), unificado entre macOS e Windows.

**Arquitetura:** o darwin já tem a baseline de lazy start da M7; este plano estreita os vestígios do fluxo de autorização (o spawn sempre injeta o socket estável); o Windows passa de "spawn acquire + waitForTransport(1s)" para "nome de pipe estável + injeção de recipe env + fork pelo SDK na primeira chamada". Por fim, removem-se todos os restos de espera/sonda no lado do spawn (`buildCuaProductHelperAgentEnv` etc.).

**Stack técnico:** TypeScript (monorepo pnpm ×2), Vitest, fork de child_process do Node, Electron (ELECTRON_RUN_AS_NODE).

**Spec:** `docs/cua-permission-broker/2026-09-21-cua-helper-lazy-startup-spec.md` (o plano parte da spec; quem executa precisa ler a spec também)

## Restrições globais

**Repositório z-code (este worktree: `/Users/dev/orca/workspaces/z-code/petrel`, branch `feat/cua-helper-lazy-startup`)**

- Antes de cada tarefa, `node scripts/check-workspace-freshness.mjs` deve passar e `git status --short` deve estar limpo; preservar alterações de outras pessoas.
- Verificações necessárias: `pnpm typecheck`, `pnpm lint`, `pnpm architecture:check --changed`, testes unitários afetados (o `pnpm test:unit:affected` da raiz não substitui os testes de CLI nem o E2E de desktop).
- Os commits seguem a [convenção de Conventional Commits](../../docs/git/ai-agent-commit-message-guidelines.md) (corpo Why/What/Risk), e **nunca** devem usar `--no-verify`.
- Não escrever comentários em código novo (exigência explícita do usuário; explicações de causa raiz necessárias ficam apenas na mensagem de commit e na spec).
- Entre worktrees usar sempre `git -C <path>`, nunca `cd`.
- Proibido rodar oxfmt no arquivo inteiro (a baseline de `fmt:check` já é vermelha; formatar somente as linhas que você adicionou).
- Não considerar Linux; o comportamento em plataformas além de darwin/win32 permanece como está.

**Repositório zcode-cua (producer, worktree: `/Users/dev/.codex/worktrees/cua-refactor/zcode-cua`)**

- Os commits devem trazer lore trailers: título + parágrafo narrativo + `Confidence:` + `Scope-risk:` + `Tested:`/`Not-tested:`; pré-validação local
  `python3 scripts/validate_lore_commit.py --range origin/main..HEAD`. Se faltar qualquer item, `commit_lore_review` fica vermelho, e essa falha faz
  dist/js_eval/helper_lifecycle/package_smoke/e2e irem todos para skipped (aparenta ser só um job falhando, mas na verdade a pipeline inteira não foi verificada).
- `dist/` é rastreado pelo git e é o próprio pacote: alterar src exige reconstruir o dist no mesmo commit. Antes de reconstruir, confirme que `node_modules`
  não é symlink (em worktrees ele costuma apontar para o clone principal; nesse caso, remova o link com `rm node_modules` e rode `corepack pnpm install --frozen-lockfile`).
- O pin do producer só pode ser alterado por script: `pnpm --filter @zcode/zcode-cua-plugin bump:producer <sha completo de 40 dígitos>` (executado no repositório z-code;
  no cenário de worktree do producer, antes `export ZCODE_CUA_REPO=/Users/dev/.codex/worktrees/cua-refactor/zcode-cua`).
  Editar o SHA manualmente em `pnpm-workspace.yaml` faz o `check-cua-baseline.mjs` recusar; o alvo do pin precisa já estar no remoto. **O sha completo é obrigatório** (prefixo curto gera sha misto).
- Após commitar nos dois repositórios, dar push imediatamente (lição aprendida com sessões concorrentes que engolem commits via amend; o pin só é confiável via ref remota).

**Contratos entre repositórios**

- Chave env da recipe: `ZCODE_CUA_WIN_HELPER_RECIPE` (constante helperConstants no producer + literal de mesmo nome no z-code, consistentes nos dois lugares).
- argv do fork: `[entryPath, "--socket", <nome de pipe estável>, "--parent-pid", <hostPid>]` (o lado child do fork tem
  `process.argv.slice(2)` com exatamente 4 elementos, satisfazendo a validação de `parseWindowsDevHelperConfig`).
- env do fork: `ELECTRON_RUN_AS_NODE=1`, `[HELPER_ADDON_ENV]=addonPath` (HELPER_ADDON_ENV é
  `"ZCODE_CUA_HELPER_ADDON"`), merge da allowlist de `commandEnv`.

## Estrutura de arquivos

**Repositório z-code**

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `packages/services/src/node.ts` | Modify | ramo lazy de resolveSpawnEnv (Tarefas 1/6), getStatus no win32 (Tarefa 7), remoção dos restos (Tarefa 9) |
| `packages/services/src/cua-permission-broker/stableCuaTransport.ts` | Create | singleton de nome de pipe estável + cache de parsing da recipe win32 (Tarefa 5) |
| `packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts` | Modify | convergência dos testes correspondentes a cada tarefa |
| `packages/services/test/agentProxyEnv.test.ts` | Verify-only | o guard de texto de fonte ancora `resolveSpawnEnv: async (`, e não pode ser quebrado |

**Repositório zcode-cua**

| Arquivo | Ação | Responsabilidade |
| --- | --- | --- |
| `src/tools/computer-use-runtime.ts` | Modify | `ensureStandaloneHelperLaunched` ganha o ramo de fork win32 (Tarefa 3) |
| `src/broker/helperConstants.ts` | Modify | nova constante `ZCODE_CUA_WIN_HELPER_RECIPE_ENV` (Tarefa 3) |
| `src/broker/server/cuaProductMcpResolver.ts` | Modify | remoção do pré-aquecimento `warmHelperForBuiltInPlugin` (Tarefa 3) |
| `test/computer-use-runtime.win-fork.test.ts` | Create | teste unitário do ramo de fork win32 (Tarefa 3) |
| `dist/**` | Rebuild | reconstruir no mesmo commit (Tarefa 4) |

---

### Tarefa 1: antecipar o ramo darwin de resolveSpawnEnv (MR1)

**Arquivos:**
- Modify: `packages/services/src/node.ts:2175-2186`
- Test: `packages/services/test/agentProxyEnv.test.ts` (adicionar um teste source-guard)

**Interfaces:**
- Consumes: `defaultCuaProductHelperLifecycle.peek()`, `isDefaultCuaProductHelperCurrent`, `getOrCreateDefaultCuaProductHelper` (todos já existentes, sem mudança de assinatura).
- Produces: a semântica de escolha do helper no spawn — no darwin sempre `undefined`; no win32 mantém o estado atual por enquanto (mudado na Tarefa 6).

- [ ] **Passo 1: escrever o teste source-guard que falha**

Ao final de `agentProxyEnv.test.ts`, acrescentar (seguindo o padrão já existente no arquivo de extração de texto de fonte; atenção: o guard precisa primeiro afirmar que o resultado da extração não está vazio, senão `not.toContain` é sempre verdadeiro — esse já foi um problema neste repositório):

```ts
describe("node.ts lazy CUA spawn helper selection", () => {
  const source = readFileSync(
    resolve(__dirname, "../src/node.ts"),
    "utf8",
  );
  const spawnEnvStart = source.indexOf("resolveSpawnEnv: async (");

  it("locates the resolveSpawnEnv closure at all", () => {
    expect(spawnEnvStart).toBeGreaterThanOrEqual(0);
  });

  it("short-circuits darwin to undefined before the peeked-host branch (MC-3)", () => {
    expect(spawnEnvStart).toBeGreaterThanOrEqual(0);
    const cuaBlock = source.slice(spawnEnvStart, spawnEnvStart + 4000);
    const darwinShortCircuit = 'process.platform === "darwin"\n            ? undefined';
    const darwinIdx = cuaBlock.indexOf(darwinShortCircuit);
    expect(darwinIdx).toBeGreaterThanOrEqual(0);
    const peekedIdx = cuaBlock.indexOf("peekedHelper && isDefaultCuaProductHelperCurrent");
    expect(peekedIdx).toBeGreaterThan(darwinIdx);
  });
});
```

- [ ] **Passo 2: rodar o teste e confirmar a falha**

Run: `pnpm vitest run packages/services/test/agentProxyEnv.test.ts`
Expected: o novo case FALHA (no estado atual o ramo do peek vem antes da verificação de darwin).

- [ ] **Passo 3: mudar a ordem dos ramos em node.ts**

O estado atual em `node.ts:2176-2186`:

```ts
      const peekedHelper = defaultCuaProductHelperLifecycle.peek()?.helper;
      const helper = !cuaPluginEnabled
        ? undefined
        : peekedHelper && isDefaultCuaProductHelperCurrent(peekedHelper)
          ? peekedHelper
          : process.platform === "darwin"
            ? undefined
            : await getOrCreateDefaultCuaProductHelper(context);
```

Passa a ser (com o curto-circuito de darwin trazido para o topo e o bloco de comentário substituído por uma linha apontando para a nova spec):

```ts
      const peekedHelper = defaultCuaProductHelperLifecycle.peek()?.helper;
      const helper = !cuaPluginEnabled
        ? undefined
        : process.platform === "darwin"
          ? undefined
          : peekedHelper && isDefaultCuaProductHelperCurrent(peekedHelper)
            ? peekedHelper
            : await getOrCreateDefaultCuaProductHelper(context);
```

Ao mesmo tempo, substituir o bloco de comentário `// M7 懒启动：…` acima por uma linha:
`// 懒启动规范（docs/cua-permission-broker/2026-09-21-cua-helper-lazy-startup-spec.md）：darwin spawn 恒稳定 socket，托管 host 不参与 spawn 凭据；win32 于 MR2 前仍走 acquire。`

- [ ] **Passo 4: rodar o teste e confirmar a aprovação**

Run: `pnpm vitest run packages/services/test/agentProxyEnv.test.ts`
Expected: PASS (incluindo todos os cases já existentes — a âncora `resolveSpawnEnv: async (` não foi tocada).

- [ ] **Passo 5: rodar a verificação da superfície afetada**

Run: `pnpm typecheck && pnpm lint && pnpm architecture:check --changed && pnpm vitest run packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts`
Expected: tudo verde (os cases atuais desse arquivo não deveriam ser afetados — eles testam a camada de lifecycle, não a ordem dos ramos do spawn).

- [ ] **Passo 6: Commit**

```bash
git add packages/services/src/node.ts packages/services/test/agentProxyEnv.test.ts
git commit -m "$(cat <<'EOF'
fix(services): keep darwin agent spawn off the managed helper path

Why:
- M7 懒启动后授权流残留：peeked host 存在时 darwin spawn 仍走
  buildCuaProductHelperAgentEnv 的 warm 探针（挂死 Helper 吃满 1s），
  违反懒启动规范"spawn 注入零 Helper IO"的不变量

What:
- darwin 分支短路提前：恒 undefined（稳定 socket 注入路径已存在），
  peeked host 只服务权限面板与重启，不再参与 spawn 凭据

Risk:
- 授权流窗口内 spawn 改走稳定 socket，SDK 自拉 standalone（spec §3.6 并存窗口，
  属已确认取舍）；vitest/lint/typecheck/arch 全绿
EOF
)"
```

---

### Tarefa 2: verificação final do MR1 e push

**Arquivos:** sem novas alterações (tarefa de verificação).

- [ ] **Passo 1: verificação completa necessária**

Run: `pnpm typecheck && pnpm lint && pnpm architecture:check --changed && pnpm test:unit:affected`
Expected: tudo verde; se houver vermelho já existente (não introduzido nesta rodada), relatar conforme o AGENTS.md, sem misturar.

- [ ] **Passo 2: Push**

```bash
git push -u origin feat/cua-helper-lazy-startup
```

(A criação do MR é disparada pelo usuário e não faz parte deste plano.)

---

### Tarefa 3: producer — ramo de fork win32 e remoção do pré-aquecimento (MR2-producer)

**Repositório:** `/Users/dev/.codex/worktrees/cua-refactor/zcode-cua`, **nova branch** `feat/win-lazy-fork` (baseada em origin/main; em shallow clone, rodar antes `git fetch --deepen=300`).

**Arquivos:**
- Modify: `src/tools/computer-use-runtime.ts`
- Modify: `src/broker/helperConstants.ts`
- Modify: `src/broker/server/cuaProductMcpResolver.ts:390-409` (`warmHelperForBuiltInPlugin` e seu ponto de chamada)
- Create: `test/computer-use-runtime.win-fork.test.ts`

**Interfaces:**
- Produces: o comportamento win32 de `ensureStandaloneHelperLaunched(socketPath, env, options?)` (o parâmetro options permite injetar a implementação de fork nos testes); `ZCODE_CUA_WIN_HELPER_RECIPE_ENV = "ZCODE_CUA_WIN_HELPER_RECIPE"` (exportado por helperConstants).

- [ ] **Passo 1: adicionar a constante em helperConstants**

Na área de constantes env de `src/broker/helperConstants.ts` (perto de `HELPER_ADDON_ENV`), acrescentar:

```ts
export const ZCODE_CUA_WIN_HELPER_RECIPE_ENV = "ZCODE_CUA_WIN_HELPER_RECIPE";
```

- [ ] **Passo 2: escrever o teste unitário de fork win32 que falha**

`test/computer-use-runtime.win-fork.test.ts` (modelado a partir do padrão `__testing` de `test/computer-use-runtime.dev-helper-refresh.test.ts`):

```ts
import { describe, expect, it, vi } from "vitest";
import {
  HELPER_ADDON_ENV,
  ZCODE_CUA_WIN_HELPER_RECIPE_ENV,
} from "../src/broker/helperConstants.js";

const { __testing } = await import("../src/tools/computer-use-runtime.js");

const RECIPE = {
  command: "C:\\app\\ZCode.exe",
  entryPath: "C:\\app\\resources\\tools\\cua-helper\\entry.cjs",
  root: "C:\\app\\resources\\tools\\cua-helper",
  addonPath: "C:\\app\\resources\\tools\\cua-helper\\addon.node",
  commandEnv: { ZCODE_CUA_X: "1" },
  hostPid: 4242,
};

function makeForkSpy() {
  const fork = vi.fn(() => ({ unref: () => {}, pid: 999 })) as never;
  return { fork, calls: () => (fork as unknown as { mock: { calls: unknown[][] } }).mock.calls };
}

describe("ensureStandaloneHelperLaunched win32 fork", () => {
  it("no-ops without a recipe env", async () => {
    const { fork, calls } = makeForkSpy();
    await __testing.ensureStandaloneHelperLaunched("\\\\.\\pipe\\zcode-cua-x", {}, { fork });
    expect(calls()).toHaveLength(0);
  });

  it("no-ops on invalid recipe JSON", async () => {
    const { fork, calls } = makeForkSpy();
    await __testing.ensureStandaloneHelperLaunched("\\\\.\\pipe\\zcode-cua-x", {
      [ZCODE_CUA_WIN_HELPER_RECIPE_ENV]: "{not-json",
    }, { fork });
    expect(calls()).toHaveLength(0);
  });

  it("forks with the stable pipe, host pid and addon env", async () => {
    const { fork, calls } = makeForkSpy();
    await __testing.ensureStandaloneHelperLaunched("\\\\.\\pipe\\zcode-cua-x", {
      [ZCODE_CUA_WIN_HELPER_RECIPE_ENV]: JSON.stringify(RECIPE),
    }, { fork });
    expect(calls()).toHaveLength(1);
    const [command, argv, options] = calls()[0] as [string, string[], Record<string, unknown>];
    expect(command).toBe(RECIPE.command);
    expect(argv).toEqual([
      RECIPE.entryPath,
      "--socket",
      "\\\\.\\pipe\\zcode-cua-x",
      "--parent-pid",
      "4242",
    ]);
    expect(options).toMatchObject({
      cwd: RECIPE.root,
      detached: true,
      stdio: "ignore",
    });
    expect((options.env as Record<string, string>)[HELPER_ADDON_ENV]).toBe(RECIPE.addonPath);
    expect((options.env as Record<string, string>).ELECTRON_RUN_AS_NODE).toBe("1");
    expect((options.env as Record<string, string>).ZCODE_CUA_X).toBe("1");
  });

  it("swallows fork failures so the warmup retry reports the real error", async () => {
    const fork = vi.fn(() => { throw new Error("EBUSY"); }) as never;
    await expect(
      __testing.ensureStandaloneHelperLaunched("\\\\.\\pipe\\zcode-cua-x", {
        [ZCODE_CUA_WIN_HELPER_RECIPE_ENV]: JSON.stringify(RECIPE),
      }, { fork }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Passo 3: rodar o teste e confirmar a falha**

Run: `pnpm vitest run test/computer-use-runtime.win-fork.test.ts`
Expected: FAIL (o ramo win32 não existe / o parâmetro `options` não existe).

- [ ] **Passo 4: implementar o ramo win32**

`src/tools/computer-use-runtime.ts`:

1. `ensureStandaloneHelperLaunched` ganha um terceiro parâmetro `options: { fork?: typeof import("node:child_process").fork } = {}`, e o export `__testing` recebe a mesma assinatura.
2. O início do corpo da função passa a ser:

```ts
async function ensureStandaloneHelperLaunched(
  socketPath: string,
  env: NodeJS.ProcessEnv,
  options: { fork?: (command: string, args: string[], opts: unknown) => { unref(): void } } = {},
): Promise<void> {
  if (process.platform === "win32") {
    await ensureWindowsHelperForked(socketPath, env, options.fork);
    return;
  }
  if (process.platform !== "darwin") return;
  // …现有 darwin 实现不变…
```

3. Nova função privada (mesmo arquivo, depois da implementação de darwin):

```ts
async function ensureWindowsHelperForked(
  socketPath: string,
  env: NodeJS.ProcessEnv,
  forkImpl?: (command: string, args: string[], opts: unknown) => { unref(): void },
): Promise<void> {
  const raw = env[ZCODE_CUA_WIN_HELPER_RECIPE_ENV]?.trim();
  if (!raw) return;
  let recipe: {
    command: string; entryPath: string; root: string;
    addonPath: string; commandEnv: Record<string, string>; hostPid: number;
  };
  try {
    recipe = JSON.parse(raw);
  } catch {
    return;
  }
  if (
    typeof recipe.command !== "string" || !recipe.command ||
    typeof recipe.entryPath !== "string" || !recipe.entryPath ||
    typeof recipe.root !== "string" || !recipe.root ||
    typeof recipe.addonPath !== "string" || !recipe.addonPath ||
    !recipe.commandEnv || typeof recipe.commandEnv !== "object" ||
    !Number.isInteger(recipe.hostPid) || recipe.hostPid <= 0
  ) {
    return;
  }
  const { fork } = await import("node:child_process");
  const run = forkImpl ?? fork;
  try {
    const child = run(
      recipe.command,
      [recipe.entryPath, "--socket", socketPath, "--parent-pid", String(recipe.hostPid)],
      {
        cwd: recipe.root,
        detached: true,
        stdio: "ignore",
        env: {
          ...process.env,
          ...recipe.commandEnv,
          [HELPER_ADDON_ENV]: recipe.addonPath,
          ELECTRON_RUN_AS_NODE: "1",
        },
      },
    ) as unknown as { unref(): void };
    child.unref();
  } catch {
    // 拉起 best-effort：失败交给 warmup 重试环用真实 broker 错误收口（与 darwin LS open 同口径）。
  }
}
```

(`HELPER_ADDON_ENV` e `ZCODE_CUA_WIN_HELPER_RECIPE_ENV` devem ser importados de helperConstants.)

- [ ] **Passo 5: rodar os testes e confirmar a aprovação**

Run: `pnpm vitest run test/computer-use-runtime.win-fork.test.ts test/computer-use-runtime.dev-helper-refresh.test.ts`
Expected: PASS (novo e antigo verdes — o caminho de darwin não foi tocado).

- [ ] **Passo 6: remover warmHelperForBuiltInPlugin**

`src/broker/server/cuaProductMcpResolver.ts`: remover a função `warmHelperForBuiltInPlugin` (linhas ~390-397) e seu único ponto de chamada dentro de `resolveMcpServersImpl` (~406-408, `if (!host.running) { warmHelperForBuiltInPlugin(); return servers; }` → apenas `return servers;`). Remover/ajustar em conjunto os testes existentes que a referenciam (use `rg -n warmHelperForBuiltInPlugin test/ src/` para achar todos).

Run: `pnpm vitest run` (completo, o volume do producer é administrável)
Expected: tudo verde.

- [ ] **Passo 7: verificação completa do producer**

Run: `pnpm vitest run && pnpm typecheck 2>/dev/null || npx tsc -p tsconfig.json --noEmit`
(seguir os scripts reais do package.json do producer; se não houver script de typecheck, rodar o tsc direto.)
Expected: tudo verde.

- [ ] **Passo 8: reconstruir o dist e commitar com lore**

Primeiro confirmar que node_modules não é symlink: se `readlink node_modules` vier vazio, build direto; senão:

```bash
rm node_modules && corepack pnpm install --frozen-lockfile
```

(sem -rf, sem barra final — a travessia apagaria o clone principal.)

```bash
node -e "console.log(Object.keys(require('./package.json').scripts))"   # 确认构建脚本名（预期含 build）
corepack pnpm run build   # 用上一步确认的实际脚本名，产出 dist/
python3 scripts/validate_lore_commit.py --range origin/main..HEAD
git -C /Users/dev/.codex/worktrees/cua-refactor/zcode-cua add src test dist
git -C /Users/dev/.codex/worktrees/cua-refactor/zcode-cua commit -m "$(cat <<'EOF'
feat(lazy-start): fork the Windows helper on first broker use

Agent spawn no longer acquires the managed helper on win32; the SDK forks
it on the first CUA call using a host-minted stable pipe name delivered
via ZCODE_CUA_WIN_HELPER_RECIPE. The child is detached with
--parent-pid pointing at the host so its lifetime follows the host, not
the forking agent; concurrent first calls lose the pipe-bind race
harmlessly. warmHelperForBuiltInPlugin prewarming is removed — an eager
start contradicts the lazy-start invariant that only first use, explicit
user action, or permission maintenance may start the helper.

Confidence: high
Scope-risk: moderate
Tested: pnpm vitest run (win-fork + dev-helper-refresh + resolver suites)
EOF
)"
git -C /Users/dev/.codex/worktrees/cua-refactor/zcode-cua push -u origin feat/win-lazy-fork
```

(Se a reconstrução do dist incluir espaços finais já existentes fazendo `--check-diff` ficar vermelho: essa é uma baseline já presente na main, não introduzida aqui — distinga com honestidade e não altere arquivos alheios só para passar no gate.)

---

### Tarefa 4: z-code — nome de pipe estável e módulo de recipe

**Arquivos:**
- Create: `packages/services/src/cua-permission-broker/stableCuaTransport.ts`
- Create: `packages/services/test/stableCuaTransport.test.ts`

**Interfaces:**
- Produces:
  - `getStableCuaPipeName(): string` — singleton de nível de processo, moldado na primeira chamada com `mintBrokerSocketPath({ env: process.env })` (mesma origem do `defaultSocketPathFactory` de `windowsCuaHelperHostSupport.ts`, import pelo caminho `@zcode/zcode-cua/broker/socketPath`, copiando o import existente daquele arquivo).
  - `resolveStableCuaWinRecipe(): Promise<StableCuaWinRecipe | null>` — `{ command, entryPath, root, addonPath, commandEnv }`; internamente chama `resolveWindowsCuaRuntime()` (`#src/cua-permission-broker/windowsCuaDevRuntime.js`), com cache em caso de sucesso, retornando null e warned uma vez em caso de falha; chamadas concorrentes compartilham a mesma promise em andamento.

- [ ] **Passo 1: escrever o teste que falha**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";

const { getStableCuaPipeName, __resetStableCuaTransportForTest } = await import(
  "../src/cua-permission-broker/stableCuaTransport.js"
);

describe("stableCuaTransport", () => {
  afterEach(() => __resetStableCuaTransportForTest());

  it("mints one pipe name per process and returns it forever", () => {
    const first = getStableCuaPipeName();
    expect(first).toBeTruthy();
    expect(getStableCuaPipeName()).toBe(first);
  });

  it("returns null recipe when runtime resolution fails", async () => {
    vi.doMock("../src/cua-permission-broker/windowsCuaDevRuntime.js", () => ({
      resolveWindowsCuaRuntime: vi.fn().mockRejectedValue(new Error("unsupported-platform")),
    }));
    const { resolveStableCuaWinRecipe } = await import(
      "../src/cua-permission-broker/stableCuaTransport.js"
    );
    expect(await resolveStableCuaWinRecipe()).toBeNull();
    vi.doUnmock("../src/cua-permission-broker/windowsCuaDevRuntime.js");
  });
});
```

- [ ] **Passo 2: rodar o teste e confirmar a falha**

Run: `pnpm vitest run packages/services/test/stableCuaTransport.test.ts`
Expected: FAIL (o módulo não existe).

- [ ] **Passo 3: implementar**

```ts
import { mintBrokerSocketPath } from "@zcode/zcode-cua/broker/socketPath";
import { createServiceLogger } from "#src/logger/serviceLogger.js";
import { resolveWindowsCuaRuntime } from "#src/cua-permission-broker/windowsCuaDevRuntime.js";

const logger = createServiceLogger("stable-cua-transport");

export interface StableCuaWinRecipe {
  command: string;
  entryPath: string;
  root: string;
  addonPath: string;
  commandEnv: Record<string, string>;
}

let stablePipeName: string | null = null;
let recipePromise: Promise<StableCuaWinRecipe | null> | null = null;

export function getStableCuaPipeName(): string {
  stablePipeName ??= mintBrokerSocketPath({ env: process.env });
  return stablePipeName;
}

export function resolveStableCuaWinRecipe(): Promise<StableCuaWinRecipe | null> {
  recipePromise ??= resolveWindowsCuaRuntime()
    .then((runtime) => ({
      command: runtime.command,
      entryPath: runtime.entryPath,
      root: runtime.root,
      addonPath: runtime.addonPath,
      commandEnv: runtime.commandEnv,
    }))
    .catch((error: unknown) => {
      logger.warn(
        undefined,
        `Windows CUA helper recipe unavailable: ${error instanceof Error ? error.message : String(error)}`,
      );
      return null;
    });
  return recipePromise;
}

export function __resetStableCuaTransportForTest(): void {
  stablePipeName = null;
  recipePromise = null;
}
```

- [ ] **Passo 4: rodar o teste e confirmar a aprovação**

Run: `pnpm vitest run packages/services/test/stableCuaTransport.test.ts`
Expected: PASS.

- [ ] **Passo 5: Commit**

```bash
git add packages/services/src/cua-permission-broker/stableCuaTransport.ts packages/services/test/stableCuaTransport.test.ts
git commit -m "$(cat <<'EOF'
feat(services): add process-stable CUA pipe name and win recipe cache

Why:
- win32 懒启动需要 spawn env 注入的 pipe 名与 helper 实际 bind 的名字
  恒一致（spec 不变量 5），且 recipe 解析结果跨 spawn 复用

What:
- getStableCuaPipeName 进程级 singleton（mintBrokerSocketPath 一次性铸造）
- resolveStableCuaWinRecipe 包装 resolveWindowsCuaRuntime，成功缓存、
  失败 warn 一次并返回 null（fail-closed 由 spawn env 分支处理）

Risk:
- 纯新增模块，无消费方；单测覆盖 singleton 与失败路径
EOF
)"
```

---

### Tarefa 5: z-code — ramo lazy win32 do spawn env

**Arquivos:**
- Modify: `packages/services/src/node.ts:2175-2225` (bloco após a Tarefa 1)
- Test: `packages/services/test/agentProxyEnv.test.ts`

**Interfaces:**
- Consumes: `getStableCuaPipeName` / `resolveStableCuaWinRecipe` da Tarefa 4; já existentes `resolveBrokerSocketPath`, `BROKER_SOCKET_ENV`, `ZCODE_CUA_PLUGIN_AUTHORITY_ENV_KEY`, `BROKER_UNAVAILABLE_ENV`, `randomBytes`.
- Produces: o spawn no win32 não chama mais `getOrCreateDefaultCuaProductHelper`; o env contém `ZCODE_CUA_BROKER_SOCKET`, `ZCODE_CUA_PLUGIN_AUTHORITY`, `ZCODE_CUA_WIN_HELPER_RECIPE`.

- [ ] **Passo 1: escrever o teste que falha (source-guard, afirmando primeiro que a âncora não está vazia)**

Acrescentar ao describe lazy de `agentProxyEnv.test.ts`:

```ts
  it("keeps win32 spawn off the acquire path (MC-4)", () => {
    expect(spawnEnvStart).toBeGreaterThanOrEqual(0);
    const cuaBlock = source.slice(spawnEnvStart, spawnEnvStart + 6000);
    expect(cuaBlock).toContain("getStableCuaPipeName()");
    expect(cuaBlock.indexOf("getStableCuaPipeName()")).toBeLessThan(
      cuaBlock.indexOf("getOrCreateDefaultCuaProductHelper(context)"),
    );
    expect(cuaBlock).toContain("ZCODE_CUA_WIN_HELPER_RECIPE");
  });
```

(O literal `getOrCreateDefaultCuaProductHelper(context)` deixa de aparecer no bloco de resolveSpawnEnv depois disso — quando indexOf retorna -1, a asserção LessThan é naturalmente satisfeita e semanticamente correta.)

- [ ] **Passo 2: rodar o teste e confirmar a falha**

Run: `pnpm vitest run packages/services/test/agentProxyEnv.test.ts`
Expected: FAIL.

- [ ] **Passo 3: reescrever o bloco CUA do spawn env**

Após a Tarefa 1, remover por completo a escolha do helper e seus consumidores (não há mais estado de transição):

- Remover as variáveis `peekedHelper`, `helper`, `cuaProductHelperHost` e a linha `cuaProductHelperWorkspaceRegistry.setEnabled(context, Boolean(cuaProductHelperHost))`;
- Remover os ramos `else if (cuaProductHelperHost && helper) { …buildCuaProductHelperAgentEnv… }` e `else if (cuaPluginEnabled && defaultCuaProductHelperLifecycle.disposed)` (com isso o ponto de chamada de `buildCuaProductHelperAgentEnv` desaparece; o corpo da função fica para a Tarefa 8 remover).

O ramo de injeção lazy passa a ser comum às duas plataformas (substituindo o bloco atual `if (!helper && cuaPluginEnabled && process.platform === "darwin")`):

```ts
      let cuaProductHelperEnv: Record<string, string> = {};
      if (!helper && cuaPluginEnabled && (process.platform === "darwin" || process.platform === "win32")) {
        const brokerSocket =
          process.platform === "win32" ? getStableCuaPipeName() : resolveBrokerSocketPath();
        cuaProductHelperEnv = {
          [BROKER_SOCKET_ENV]: brokerSocket,
          [ZCODE_CUA_PLUGIN_AUTHORITY_ENV_KEY]: randomBytes(16).toString("hex"),
        };
        if (process.platform === "win32") {
          const recipe = await resolveStableCuaWinRecipe();
          if (recipe) {
            cuaProductHelperEnv["ZCODE_CUA_WIN_HELPER_RECIPE"] = JSON.stringify({
              ...recipe,
              hostPid: process.pid,
            });
          } else {
            cuaProductHelperEnv = {
              [BROKER_UNAVAILABLE_ENV]:
                "broker_unavailable: windows helper recipe could not be resolved",
            };
          }
        }
        cuaProductHelperWorkspaceRegistry.setEnabled(context, false);
      }
```

Os ramos posteriores `else if (cuaProductHelperHost && helper) { …buildCuaProductHelperAgentEnv… }` etc. já sumiram com a remoção das variáveis (acima). `randomBytes` já é usado no ramo lazy atual (node.ts:2203), sem necessidade de novo import. Acrescentar no topo os imports de `getStableCuaPipeName` e `resolveStableCuaWinRecipe` (`#src/cua-permission-broker/stableCuaTransport.js`).

- [ ] **Passo 4: rodar os testes e a superfície afetada**

Run: `pnpm vitest run packages/services/test/agentProxyEnv.test.ts packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts`
Expected: agentProxyEnv PASS; em cuaPermissionBrokerProductAgentEnv, os cases que testam diretamente a antiga injeção de spawn (como "injects the Helper broker socket, token and plugin authority…" e a série "marks zcode-cua unavailable…") ficam vermelhos — eles pertencem ao escopo de convergência da Tarefa 8, e **neste passo o vermelho já existente é permitido**, mas é preciso confirmar item a item que a causa é "o caminho testado foi removido", registrar a lista e não haver outros vermelhos.

- [ ] **Passo 5: typecheck/lint**

Run: `pnpm typecheck && pnpm lint && pnpm architecture:check --changed`
Expected: verde (`buildCuaProductHelperAgentEnv` continua exportado e esta tarefa não o referencia mais).

- [ ] **Passo 6: Commit**

```bash
git add packages/services/src/node.ts packages/services/test/agentProxyEnv.test.ts
git commit -m "$(cat <<'EOF'
feat(services): inject stable CUA credentials at win32 spawn without IO

Why:
- win32 spawn 原先 await acquire + waitForTransport(1s)，且该 grace race
  等待的是完整 startup 而非真正需要的 tuple（结构性浪费）

What:
- win32 spawn 恒注入稳定 pipe 名 + spawn 铸 authority + fork recipe env；
  recipe 解析失败 fail-closed 到 BROKER_UNAVAILABLE
- spawn 不再 acquire 托管 host；darwin 分支沿用 Task 1 的稳定 socket 注入

Risk:
- cuaPermissionBrokerProductAgentEnv.test.ts 中直接测旧 spawn 注入路径的
  case 暂红，Task 8 统一收敛（清单已记录）
EOF
)"
```

---

### Tarefa 6: z-code — alinhar o getStatus no win32 (MC-9)

**Arquivos:**
- Modify: `packages/services/src/node.ts:1894-1971` (getStatus) e `node.ts:1037-1055` (injetar mintSocketPath na criação do host win32)

**Interfaces:**
- Consumes: `getStableCuaPipeName` da Tarefa 4; já existentes `probeStableCuaHelperSocket`, `getOrCreateDefaultCuaProductHelper`, `callBrokerMethod`.
- Produces: getStatus no win32 = probe → fork do host (pipe estável) → valor real de permission_status → degradação para idle.

> Nota: `getStatus` é uma closure dentro de `createNodeServices`, e nenhum teste existente deste arquivo a toca diretamente (a lista de testes comprova);
> esta tarefa não faz testes unitários; a verificação de comportamento fica na lista prática da Tarefa 9 (o comportamento de getStatus no darwin segue a M7 sem mudança, e o lado win32 originalmente não tinha prática real).

- [ ] **Passo 1: implementar**

1. Em `node.ts:1037-1055`, as options de `createWindowsCuaHelperHost({…})` ganham `mintSocketPath: () => getStableCuaPipeName()` (passado pelo ramo win32 de `createDefaultCuaProductHelper`, mantendo as demais opções intactas).
2. O curto-circuito de plataforma no início de getStatus é substituído:

```ts
      if (process.platform !== "darwin" && process.platform !== "win32") {
        return {
          available: false,
          reason: "CUA permissions are only available on macOS and Windows.",
        };
      }
```

3. O ponto de chamada de `launchStandaloneCuaHelperForStatus`, exclusivo do darwin (~1929-1932), passa a ser um despacho por plataforma:

```ts
        let stable = await probeStableCuaHelperSocket();
        if (!stable) {
          stable =
            process.platform === "darwin"
              ? await launchStandaloneCuaHelperForStatus()
              : await launchWindowsCuaHelperForStatus();
        }
```

4. Nova função `launchWindowsCuaHelperForStatus` (colocada depois de `launchStandaloneCuaHelperForStatus`, na mesma closure):

```ts
  const launchWindowsCuaHelperForStatus = async (): Promise<string | null> => {
    try {
      const managed = await getOrCreateDefaultCuaProductHelper(undefined);
      if (managed) void managed.host.start().catch(() => {});
    } catch {
      // 拉起 best-effort；失败由下面的轮询超时统一降级。
    }
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const ready = await probeStableCuaHelperSocket();
      if (ready) return ready;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return null;
  };
```

(`probeStableCuaHelperSocket` usa `createConnection`, o que também se aplica a named pipes, sem necessidade de alterações.)

- [ ] **Passo 2: verificar que não há regressão**

Run: `pnpm typecheck && pnpm lint && pnpm architecture:check --changed && pnpm vitest run packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts`
Expected: verde (os vermelhos continuam limitados à lista registrada na Tarefa 5; esta tarefa não adiciona testes, e a verificação de comportamento fica para a prática da Tarefa 9).

- [ ] **Passo 3: Commit**

```bash
git add packages/services/src/node.ts
git commit -m "$(cat <<'EOF'
feat(services): serve win32 CUA permission status via stable pipe

Why:
- win32 设置页此前直接返回 "only available on macOS"，用户拿不到任何状态；
  懒启动规范 §3.5 要求两平台统一 probe→按需拉起→真值→idle 降级

What:
- getStatus 支持 win32：probe 稳定 pipe，无则经托管 host fork（注入
  stable mintSocketPath，与 SDK 自拉汇聚同一 pipe），5s 轮询后降级 idle:true
- 平台短路改为 darwin+win32 白名单

Risk:
- getStatus 为 services 闭包、无单测触达面（既有测试均不直接测它）；
  Windows 实机未验证（开发机 macOS），MC-9 归实机清单，MR 标注
EOF
)"
```

---

### Tarefa 7: z-code — bump do pin do producer

**Arquivos:**
- Modify (automático por script): `apps/zcode-cli/packages/zcode-cua-plugin/upstream.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml` e a superfície tocada pelo script de bump.

- [ ] **Passo 1: confirmar que a branch do producer já foi enviada**

Run: `git -C /Users/dev/.codex/worktrees/cua-refactor/zcode-cua ls-remote origin feat/win-lazy-fork`
Expected: a saída mostra a ref remota com o sha completo (a Tarefa 3 já fez o push).

- [ ] **Passo 2: bump atômico (sha completo de 40 dígitos)**

```bash
export ZCODE_CUA_REPO=/Users/dev/.codex/worktrees/cua-refactor/zcode-cua
pnpm --filter @zcode/zcode-cua-plugin bump:producer <sha completo de 40 dígitos do passo anterior>
```

**Proibido** editar o SHA manualmente em `pnpm-workspace.yaml` (o `check-cua-baseline.mjs` recusa), **proibido** usar prefixo curto.

- [ ] **Passo 3: instalar e verificar**

```bash
pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && pnpm architecture:check --changed
```

- [ ] **Passo 4: Commit**

```bash
git add apps/zcode-cli/packages/zcode-cua-plugin/upstream.json pnpm-workspace.yaml pnpm-lock.yaml
# 以 bump 脚本实际改动的文件清单为准（git status 逐个确认，只提交脚本产物）
git commit -m "$(cat <<'EOF'
chore(cua): bump zcode-cua producer for win32 lazy fork

Why:
- 懒启动 win32 分支的 SDK fork 能力与 warmHelper 删除都在 producer
  feat/win-lazy-fork，需 pin 到该提交

What:
- 经 bump:producer 原子命令同步 pin/lock/契约并自校验

Risk:
- 脚本自校验通过；producer CI 在远端分支验证
EOF
)"
```

---

### Tarefa 8: z-code — remover os restos do lado do spawn e convergir os testes

**Arquivos:**
- Modify: `packages/services/src/node.ts` (`buildCuaProductHelperAgentEnv` 1123-1281, constante 566, imports relacionados)
- Modify: `packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts` (convergência da lista de vermelhos registrada na Tarefa 5)

**Interfaces:**
- Produces: `buildCuaProductHelperAgentEnv` sai da superfície de exportação de node.ts; `CUA_PRODUCT_HELPER_SPAWN_READY_DEADLINE_MS` é removida. `getOrCreateDefaultCuaProductHelper` é mantida (ainda usada por getStatus/restartHelper/resolver).

- [ ] **Passo 1: localizar todas as referências**

Run:
```bash
rg -n "buildCuaProductHelperAgentEnv|CUA_PRODUCT_HELPER_SPAWN_READY_DEADLINE_MS|trackCuaProductHelperStartup|cuaProductHelperAgentEnvRetryAt|cuaProductHelperReservedSpawns|cuaProductHelperTransportSpawns" packages/ apps/ --type ts | rg -v node_modules
```

Esperado: a definição em node.ts e os testes em cuaPermissionBrokerProductAgentEnv.test.ts. Se surgir outro consumidor (por exemplo, o main do desktop), parar e verificar — a spec assume que não há outros consumidores; se a premissa não se confirmar, tratar como escalonamento em vez de apagar à força.

- [ ] **Passo 2: remover a implementação e a constante**

Remover toda a função `buildCuaProductHelperAgentEnv`, a constante `CUA_PRODUCT_HELPER_SPAWN_READY_DEADLINE_MS` e os símbolos companheiros que existem apenas para ela (`trackCuaProductHelperStartup`, `cuaProductHelperAgentEnvRetryAt`, `cuaProductHelperReservedSpawns`, `cuaProductHelperTransportSpawns`, `CUA_PRODUCT_HELPER_AGENT_ENV_RETRY_MS` — conforme a lista do Passo 1; manter o que ainda é referenciado por getStatus/restart).

- [ ] **Passo 3: convergir os testes**

Tratar item a item a lista de vermelhos registrada na Tarefa 5: apagar os cases que testam diretamente a função removida; manter e corrigir o fixture dos cases que testam o comportamento de resolver/lifecycle e continuam válidos (por exemplo, os cases de marker passam a testar apenas a semântica do lado do resolver). **A cada case removido, listar o nome no corpo do commit.**

- [ ] **Passo 4: verificação completa**

Run: `pnpm typecheck && pnpm lint && pnpm architecture:check --changed && pnpm vitest run packages/services/test`
Expected: tudo verde.

- [ ] **Passo 5: Commit**

```bash
git add -A packages/services
git commit -m "$(cat <<'EOF'
refactor(services): remove the spawn-path helper wait machinery

Why:
- 懒启动规范落地后 buildCuaProductHelperAgentEnv 及其等待/探针/marker
  消费全部不可达（darwin Task 1、win32 Task 5 已切走）

What:
- 删除 buildCuaProductHelperAgentEnv、SPAWN_READY_DEADLINE 常量与只为它
  存在的伴生状态；收敛对应测试 case：<逐条列出删除的 case 名>

Risk:
- getOrCreateDefaultCuaProductHelper 保留（getStatus/restart/resolver 消费）；
  services 全量单测/typecheck/lint/arch 绿
EOF
)"
```

---

### Tarefa 9: verificação local ponta a ponta (prática no darwin + marcação para Windows)

**Arquivos:** sem alteração de código.

- [ ] **Passo 1: verificação prática de cold start no darwin (MC-1/2/3)**

```bash
ZCODE_CUA_DEV_MODE=1 pnpm run dev:desktop
```

Seguir o [runbook local do CUA Helper](../../docs/cua-permission-broker/local-dev-helper-runbook.md) para verificar:
1. Depois que o app inicia, o Activity Monitor não mostra processos "ZCode Computer Use" (o lazy start não foi disparado).
2. Abrir uma nova conversa e pedir ao modelo que use computer-use → o processo do Helper aparece e a chamada funciona (MC-2).
3. Concluir uma vez o fluxo de autorização de permissões na página de configurações e então fazer spawn de um novo agent → no env do novo agent, `ZCODE_CUA_BROKER_SOCKET` é um caminho estável e não aleatório (MC-3; pode conferir pelo log de dev).

- [ ] **Passo 2: avaliação de E2E de desktop**

Seguir [.agents/skills/e2e-case-lifecycle/SKILL.md](../../.agents/skills/e2e-case-lifecycle/SKILL.md) para avaliar se
`docs/testing/cua-e2e-case-catalog.md` precisa de cases novos/revisados (asserturas de timing de spawn não observáveis na camada E2E devem ser marcadas com honestidade; todos os caminhos do Windows marcados como "pendente de prática no Windows").

- [ ] **Passo 3: consolidar os itens não verificados**

Listar na descrição final do MR: a cadeia completa do Windows (fork/pipe/página de configurações/MC-4~7/9) pendente de prática real; o status dos jobs de CI do producer; a lista do que já foi verificado localmente.

---

### Tarefa 10: fechamento — status da spec e push

**Arquivos:**
- Modify: `docs/cua-permission-broker/2026-09-21-cua-helper-lazy-startup-spec.md` (seção de status passando para implementado + conclusões da prática)

- [ ] **Passo 1: atualizar o status da spec**

Mudar o status para "MR1/MR2 implementados; prática local no darwin aprovada (MC-1/2/3); Windows pendente de prática real (MC-4~9)" e anexar a data.

- [ ] **Passo 2: verificação final + push**

```bash
pnpm typecheck && pnpm lint && pnpm architecture:check --changed
git add docs/cua-permission-broker/2026-09-21-cua-helper-lazy-startup-spec.md
git commit -m "docs(cua): mark lazy startup spec implemented for mac"
git push
```

A criação do MR é decidida pelo usuário (quando seguir o fluxo do zcode-mr, abrir uma nova).