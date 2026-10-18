# Relatório de falhas de baseline de testes unitários no pre-push do staging (2026-08-24)

> **Nota sobre a revisão do ambiente:** o acesso aos serviços de ativos da rede interna foi feito por
> forwarding SSH restrito a partir de um MacBook Pro, e o `pnpm bootstrap` completo foi executado com
> sucesso usando **Node v24.14.0 + pnpm 10.33.2**, as versões travadas no repositório. O install, o
> rebuild de `node-pty` do Desktop, os bundles de Agent/CUA, o download e a verificação do
> native-search-tools, o build do workspace e o build do Desktop todos passaram, e o exit code final do
> bootstrap foi 0. Em seguida, os 7 arquivos abaixo foram executados novamente, com o mesmo resultado:
> **30 falhas, 128 aprovações, 4 skips**, e o conjunto de falhas permaneceu inalterado. Portanto
> falta de install, bootstrap incompleto, falha de download da rede interna e diferença de versão
> menor do Node estão todos descartados.

## Resumo

Validação feita em um worktree detached e independente do `origin/staging` mais recente, em um
ambiente Linux local:

- SHA do staging: `0e867f1323` (`Merge branch 'fix/tool-call-display-consistency' into 'staging'`);
- execução direcionada dos 9 arquivos de teste que falharam na suíte completa de pre-push;
- resultado real do staging: **30 falhas**;
- resultado do branch atual do Provider Refactor: **32 falhas, 12.366 aprovações, 25 skips**;
- as duas situações compartilham as mesmas 30 falhas de packaging do Windows, notarização do macOS e
  CUA;
- as 2 falhas adicionais de guardas de código de Settings no branch atual já foram corrigidas pelo
  commit do staging `4f0b024f73`;
- portanto o corpo das falhas de pre-push do Provider Refactor não foi introduzido por esta reforma de
  Provider, e o staging mais recente também não passa esse gate no mesmo ambiente.

## Ambiente

```text
OS: Linux
Node da primeira validação: v24.19.0
Node da revisão: v24.14.0 (versão travada no repositório)
pnpm: 10.33.2
Node esperado pelo repositório: 24.14.0
Vitest: 4.1.4
staging: 0e867f1323
```

A validação usou um worktree de staging independente, sem modificar o workspace atual do Provider
Refactor. Não há diferença de versão do catálogo CUA entre o staging e o branch atual; os testes de CUA
de Services reaproveitam a mesma dependência de catálogo já instalada.

## As 30 falhas do staging

### 1. Packaging de release do Windows: 2

Arquivos:

- `packages/zcode-server-cli/test/releaseInstaller.test.ts`
- `packages/zcode-server-cli/test/packaging.test.ts`

Casos que falham:

```text
release installer
  × installs a Windows zip and writes a launcher that is safe for quoted paths

stageRelease
  × stages a Windows target with a cmd launcher and zip archive
```

Erro representativo:

```text
Error: spawn zip ENOENT
```

### 2. Notarização do macOS: 3

Arquivo: `packages/desktop/test/notarizeMacosScript.test.ts`

Casos que falham:

```text
× 测试环境 DMG 带 TEST 后缀时也应能进入公证流程
× retries transient notary upload failures before continuing
× 正式 release 缺少安装后 app 验收路径时不应把 notarization 判定为成功
```

Erro representativo:

```text
scripts/notarize-macos.sh: line 92: integer expression expected
[notarize] dmg not found ... for arch=arm64
```

O script trata a saída de `stat` como inteiro no Linux e depois julga incorretamente que o DMG de
teste não existe.

### 3. Identidade CUA do Desktop: 2

Arquivo: `packages/desktop/test/cuaHelperDevIdentity.test.ts`

Casos que falham:

```text
× skips import entirely when the identity is already trusted and listed
× reuse-branch success returns without scope errors and reports persist state
```

Erro representativo:

```text
expected security import calls to have length 0, but got 1
expected result.ok to be true, but got false
```

### 4. Watcher de System Settings do CUA do Desktop: 8

Arquivo: `packages/desktop/test/cuaSystemSettingsWindowWatcher.test.ts`

Casos que falham:

```text
× parses a JSON line into the latest bounds
× reassembles bounds split across chunk boundaries
× keeps only the last line when several arrive in one chunk
× picks the largest layer-0 window so modal sheets do not hijack the anchor
× reports null once the settings window closes (empty array)
× fails open when the process exits or errors
× never spawns twice and kills the child on stop
× does not throw when the binary is missing (spawn throws synchronously)
```

Erro representativo:

```text
expected watcher.latest() to equal window bounds, received null
expected spawnProcess to be called once, received 0 calls
expected error event not to throw, but Error: ENOENT was thrown
```

### 5. Node Helper de CUA de Services: 10

Arquivo: `packages/services/test/cuaPermissionBrokerNodeHelper.test.ts`

Casos que falham:

```text
× does not expose missing or non-function raw-input/PiP exports from a legacy addon
× kills a timed-out capture, cleans its temp dir, and allows the next request
× serves observation/screen/clipboard methods behind the token over a real socket
× rejects an unauthenticated method call (helper requires the token)
× self-terminates (startup-claim watchdog) when no client claims it within the TTL
× does not report startup-timeout termination when an admitted action cannot drain safely
× freezes an unclaimed startup epoch before late authenticate + broker_info can pass health
× retries an explicit terminal stop after timeout until the admitted action drains
× terminal stop cancels a window-scoped native hold without waiting its 30s duration
× does not self-terminate once a client has authenticated (claimed)
```

Erro representativo:

```text
preventActivation must stay fail-closed: expected function to be undefined
expected captureWindowPng(...) to return PNG bytes, received null
TypeError: native.probeAccessibility is not a function
```

### 6. Helper Host de CUA de Services: 5

Arquivo: `packages/services/test/cuaPermissionBrokerHelperHost.test.ts`

Casos que falham:

```text
× permission refresh 重启进程但复用 socket/token，成功验证后才删除 marker
× marker complete 首次失败后保留 handle，重试只清理 marker 而不重启健康 H2
× 外部 stop 在旧 transport 确认退役后清理 pending refresh marker
× permission refresh 的 H1 不响应 TERM 时禁止 SIGKILL 和 H2 launch，并保持 marker
× permission refresh 的 H2 launch 失败后 fail closed；下次只能 fresh 并返回 reused=false
```

Forma comum do erro:

```text
CuaHelperError: Failed to verify the live ZCode Computer Use process identity
Caused by: ENOENT: no such file or directory,
rename '<socket>.pending' -> '<socket>'
```

## As 2 falhas adicionais do branch atual do Provider Refactor

Arquivos:

- `packages/ui/test/settingsSubagentRowContent.test.ts`
- `packages/ui/test/settingsSkillScopeBadge.test.ts`

Casos que falham:

```text
× uses the shared scoped resource-list structure
× does not repeat scope metadata beside the skill name in Plugin
```

Essas duas já passavam em `origin/staging@0e867f1323`. Commit de correção correspondente no staging:

```text
4f0b024f73 fix(ui): 更新源码守卫断言到 resolvePluginDisplayName
```

Portanto, após mesclar o staging mais recente, a expectativa é cair de 32 para 30, mas isso não deixa o
gate de pre-push verde por completo.

## Comandos de reprodução

Pre-push completo:

```bash
pnpm verify:pre-push
```

Executando apenas os 7 arquivos que ainda falham no staging:

```bash
pnpm exec vitest run \
  packages/zcode-server-cli/test/releaseInstaller.test.ts \
  packages/zcode-server-cli/test/packaging.test.ts \
  packages/desktop/test/notarizeMacosScript.test.ts \
  packages/desktop/test/cuaHelperDevIdentity.test.ts \
  packages/desktop/test/cuaSystemSettingsWindowWatcher.test.ts \
  packages/services/test/cuaPermissionBrokerNodeHelper.test.ts \
  packages/services/test/cuaPermissionBrokerHelperHost.test.ts
```

## Conclusão

As regressões direcionadas de Provider, Adapter, Bootstrap, Services, Protocol e UI do Provider Refactor
atual já passaram; o que bloqueia o force-with-lease push é o gate rígido do pre-push do repositório
sobre a suíte completa de testes unitários. O staging mais recente reproduz 30 delas no mesmo ambiente,
portanto esses testes de baseline cross-platform/CUA precisam ser corrigidos ou ajustados
separadamente e não podem ser atribuídos ao Provider Refactor.

## Design da correção

Essas 30 falhas são defeitos de gate de teste cross-platform, e a correção não muda a semântica de
produto de CUA, de release ou de Provider:

- o arquivamento ZIP do Windows passa a usar uma implementação assíncrona em Node dentro do próprio
  repositório, sem exigir que a máquina de teste ou a de build da release tenha o comando `zip`
  instalado;
- a leitura de mtime do script de notarize passa a ser compatível tanto com `stat` de BSD/macOS quanto
  de GNU/Linux;
- a platform seam dos testes de identidade do macOS e do watcher de System Settings precisa atravessar
  até os helpers internos;
- os testes de contrato do Node Helper do macOS fixam `darwin` explicitamente, e o fake native dos
  testes de broker cross-platform passa a cobrir a ABI da plataforma atual;
- os testes da máquina de estados do Helper Host que não sobem um socket real de broker desligam
  explicitamente o rendezvous de transporte, evitando que o tamanho do diretório temporário decida o
  ramo do teste;
- todas as correções continuam fail-closed e não escondem falhas cross-platform pulando o grupo
  inteiro de testes.

## Resultado da correção

Em 2026-08-24 a correção foi concluída conforme o design acima: os 7 arquivos que falhavam passaram a
dar `158 passed / 4 skipped` no Linux, e as 30 falhas originais desapareceram. Ao mesmo tempo, a
geração do ZIP no Windows e a extração segura passaram a ser uma implementação assíncrona dentro do
processo, removendo a dependência incorreta da máquina de release do comando `zip` do sistema e do GNU
tar para leitura de ZIP. As outras duas drifts de guarda de código da UI no branch atual adotam
simultaneamente o resultado das asserções da correção já existente no staging `4f0b024f73`, sem
alterar a implementação de produto da UI.