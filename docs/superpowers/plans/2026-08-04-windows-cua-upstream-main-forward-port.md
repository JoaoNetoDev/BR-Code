# Windows CUA Upstream Main Forward Port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** Portar adiante, para o `main` mais recente do `zcode-cua` upstream, o runtime Windows CUA já validado, e fazer com que o branch atual do `z-code` gere, valide e empacote esse runtime em uma árvore de consumo limpa, por um caminho de producer local explícito; o pin remoto do Git fica para ser fechado depois do push do commit do producer.

**Arquitetura:** `zcode-cua` é o producer da entry do Windows Helper, do addon nativo e do contrato de runtime do package; `z-code` apenas fixa o Git SHA do producer, lê o contrato do producer, gera um manifest de digests, e o desktop-local Host inicia sob demanda. A migração é religada conforme a semântica atual do upstream para broker/incremental/input-cleanup, sem sobrescrever seus commits nem restaurar a implementação antiga.

**Stack técnico:** TypeScript 5/6, Vitest, Node 24, N-API/node-gyp, C++/Win32 UIA/WGC/D3D11, Electron 41, pnpm 10.

## Restrições Globais

- `z-code` é desenvolvido no lugar no branch atual `feat/cua-helper-app`.
- `zcode-cua` é desenvolvido no `main` local; primeiro se preserva um branch de segurança e depois aponta `main` para o `origin/main` mais recente.
- As mudanças do port para Windows resultam em apenas um novo commit em `zcode-cua/main`; não reescrever commits do upstream e não fazer push.
- O schema do contrato do producer é fixado em `1` e o nome do package é fixado como `@zcode/zcode-cua`.
- O consumidor fixa o Git SHA completo e não repete mais a versão do package hardcoded.
- O raw input do Windows precisa validar um PID de foreground único; não é permitido adivinhar identidade por UIA, título, basename ou pelo primeiro item da enumeração.
- O Windows Helper serve apenas ao desktop continuous local; SSH, WSL, Docker, workspace remoto e `/remote` do celular não criam runtime independente.
- O token é passado somente por variável de ambiente e não entra em argv, manifest ou logs.
- Toda mudança funcional é escrita primeiro como teste que falha; o código de produção não pode vir antes do RED test.
- Novos comentários de causa/fix de bug são escritos em chinês.
- Antes de concluir, os dois repositórios executam seus próprios typecheck, lint e testes focados/completos.

---

### Task 1: Preparar o main mais recente do zcode-cua e referências recuperáveis

**Arquivos:**

- Sem mudanças em arquivos de produto.

**Interfaces:**

- Consome: `origin/main`, origem da migração `codex/windows-cua-pointer-foundation`.
- Produz: `main` local apontando para o main mais recente do upstream; dois backup branches preservando as referências antigas.

- [ ] **Passo 1: Verificar que os dois workspaces não têm modificações não commitadas**

```powershell
git -C C:\Users\dev\z-code status --short
git -C C:\Users\dev\zcode-cua status --short
```

Expected: nenhum dos dois comandos imprime arquivos; em `z-code` apenas o estado de branch ahead é permitido.

- [ ] **Passo 2: Atualizar e registrar a baseline do producer**

```powershell
git -C C:\Users\dev\zcode-cua fetch origin --prune
git -C C:\Users\dev\zcode-cua show -s --format="%H %an %s" origin/main
```

Expected: `origin/main` resolve, e o histórico de author/merge pertence à linha principal atual do upstream.

- [ ] **Passo 3: Criar referências seguras que não sobrescrevem**

```powershell
git -C C:\Users\dev\zcode-cua branch backup/windows-cua-before-forward-port-20260804 codex/windows-cua-pointer-foundation
git -C C:\Users\dev\zcode-cua branch backup/local-main-before-forward-port-20260804 main
```

Expected: os dois backup branches apontam para os commits originais; se os nomes já existirem, reutilize-os depois de verificar que apontam para os commits esperados.

- [ ] **Passo 4: Alinhar o main local no lugar, sem usar hard reset**

```powershell
git -C C:\Users\dev\zcode-cua switch codex/windows-cua-pointer-foundation
git -C C:\Users\dev\zcode-cua branch -f main origin/main
git -C C:\Users\dev\zcode-cua switch main
```

Expected: `git status --short --branch` mostra `main...origin/main`, sem ahead/behind e sem modificações de arquivo.

- [ ] **Passo 5: Instalar dependências e estabelecer a baseline**

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
```

Expected: todos os comandos com exit 0. Se a baseline falhar, pare e registre a falha, sem passar para a Task 2.

---

### Task 2: Travar o contrato do package do Windows Helper com um contract possuído pelo producer

**Arquivos:**

- Create: `C:\Users\dev\zcode-cua\test\windows-package-artifacts.test.ts`
- Create: `C:\Users\dev\zcode-cua\src\windows-helper.ts`
- Modify: `C:\Users\dev\zcode-cua\package.json`
- Modify: `C:\Users\dev\zcode-cua\scripts\build.mjs`

**Interfaces:**

- Produces: `packageJson.zcodeCuaRuntime.windows.entry === "dist/windows-helper.js"`.
- Produces: export `./windows-helper` apontando para `./dist/windows-helper.js`.
- Consumido depois: staging/resolver de runtime do z-code.

- [ ] **Passo 1: Escrever o RED test do contrato do package**

```ts
it("publishes the current Windows helper runtime contract", () => {
  const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
  expect(packageJson.name).toBe("@zcode/zcode-cua");
  expect(packageJson.zcodeCuaRuntime).toEqual({
    schema: 1,
    windows: {
      entry: "dist/windows-helper.js",
      nativeAddon: "build/Release/ax_native.node",
    },
  });
  expect(packageJson.exports["./windows-helper"]?.import).toBe("./dist/windows-helper.js");
});
```

O mesmo teste chama `pnpm pack --dry-run --json` e afirma que o pack contém:

```ts
for (const path of [
  "dist/windows-helper.js",
  "binding.gyp",
  "src/native/ax_win.cc",
  "scripts/build-native.cjs",
]) {
  expect(paths).toContain(path);
}
```

- [ ] **Passo 2: Executar o teste e confirmar RED**

```powershell
pnpm exec vitest run test/windows-package-artifacts.test.ts
```

Expected: FAIL, porque `zcodeCuaRuntime`/`./windows-helper`/entry não existem, e não por erro de carregamento do teste.

- [ ] **Passo 3: Adicionar o contrato mínimo de package e a entry de build**

Em `package.json`, adicionar:

```json
"./windows-helper": {
  "types": "./dist/windows-helper.d.ts",
  "import": "./dist/windows-helper.js"
},
"zcodeCuaRuntime": {
  "schema": 1,
  "windows": {
    "entry": "dist/windows-helper.js",
    "nativeAddon": "build/Release/ax_native.node"
  }
}
```

`src/windows-helper.ts` só pode chamar o main do Windows Helper fornecido pelo broker/server; não deve reimplementar o broker.
`scripts/build.mjs` adiciona essa entry às entries esbuild existentes.

- [ ] **Passo 4: Executar a verificação GREEN**

```powershell
pnpm build
pnpm exec vitest run test/windows-package-artifacts.test.ts
```

Expected: build e teste com exit 0; o conteúdo do pack vem dos artefatos gerados a partir do source atual.

---

### Task 3: Ligar o ciclo de vida do Windows Helper ao broker do upstream atual

**Arquivos:**

- Create: `C:\Users\dev\zcode-cua\src\broker\server\windowsDevHelperMain.ts`
- Create: `C:\Users\dev\zcode-cua\src\broker\server\windowsSystemSurface.ts`
- Create: `C:\Users\dev\zcode-cua\test\windowsDevHelperMain.test.ts`
- Create: `C:\Users\dev\zcode-cua\test\broker\windowsSystemSurface.test.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\index.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\helperMain.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\nodeSystemSurface.ts`

**Interfaces:**

- Produces: `parseWindowsDevHelperConfig`, `runWindowsDevHelper`, `WINDOWS_DEV_CONTROL_PROTOCOL`.
- Consome: o `startCuaPermissionBroker` atual, o native loader e a semântica de cleanup/cancellation do upstream.

- [ ] **Passo 1: Escrever os RED tests de config/ciclo de vida do Helper**

Cobrir os seguintes comportamentos reais:

```ts
expect(
  parseWindowsDevHelperConfig({
    argv: ["node", "entry", "--socket", SOCKET, "--parent-pid", "12"],
    env: { ZCODE_CUA_PERMISSION_BROKER_TOKEN: TOKEN },
    platform: "win32",
  }),
).toEqual({ socketPath: SOCKET, parentPid: 12, token: TOKEN });
```

E afirmar: plataformas não-win32, named pipe não suportado, parent PID não positivo, token ausente e a presença de `--token` são todos rejeitados;
ready precisa aguardar o bound do broker; IPC/disconnect/signal/perda do pai reutilizam um único stop assíncrono idempotente;
as mensagens de erro e o IPC de controle não contêm o token.

- [ ] **Passo 2: Executar e confirmar RED**

```powershell
pnpm exec vitest run test/windowsDevHelperMain.test.ts test/broker/windowsSystemSurface.test.ts
```

Expected: FAIL, porque os módulos do Windows Helper ainda não existem.

- [ ] **Passo 3: Implementar a entry mínima do Helper compatível com o main atual**

Ordem de implementação: validação de configuração → injeção da system surface nativa → IPC de broker ready → watchdog/listeners →
cleanup terminal unificado. Comentários em chinês registrando: o Windows não tem um Helper.app de TCC, mas a capacidade de automação ainda é mantida por um child Host separado; colocar o token em argv vazaria para a lista de processos, portanto apenas env é aceito.

- [ ] **Passo 4: Verificar GREEN**

```powershell
pnpm exec vitest run test/windowsDevHelperMain.test.ts test/broker/windowsSystemSurface.test.ts
```

Expected: todos os testes não nativos passam; o smoke nativo faz skip explícito quando o addon ainda não foi construído.

---

### Task 4: Portar adiante AUMID, pointer e clipboard do Windows

**Arquivos:**

- Modify: `C:\Users\dev\zcode-cua\src\native\ax_win.cc`
- Modify: `C:\Users\dev\zcode-cua\src\native\win.ts`
- Modify: `C:\Users\dev\zcode-cua\src\native\types.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\electronNativeBackend.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\electronNativeBackendTypes.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\nodeAutomationAdapter.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\electronInputHandlers.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\electronAppHelpers.ts`
- Modify: `C:\Users\dev\zcode-cua\src\tools\pointer.ts`
- Create: testes de pointer/clipboard/AUMID do Windows listados no design WCFR-06/07/08.

**Interfaces:**

- Produz ABI nativo: `moveTo`, `scrollAt`, `drag`, `mouseDown`, `mouseUp`,
  `releaseSyntheticInputs`, leitura/escrita assíncrona de clipboard, activate/resolve de AUMID.
- Preserva o `InputHoldRegistry`, o delivery-state e a re-resolution do upstream.

- [ ] **Passo 1: Importar e adaptar os testes, travando primeiro a semântica do main atual**

Ler a intenção dos testes a partir do branch seguro, mas recriar os testes em cima do main. Cobrir pelo menos:

```ts
expect(
  await dispatchWindowsPointer({ appRef: expectedApp, activeApps: [expectedApp] }),
).toMatchObject({ sent: true });
expect(() => dispatchWindowsPointer({ appRef: expectedApp, activeApps: [otherApp] })).toThrow(
  /frontmost/iu,
);
```

Cobrir também: coordenadas negativas de desktop virtual, reenvio de `up` em falha parcial de drag, liberação de input owned em stop/cancel, round-trip exato de clipboard Unicode, fail closed de AUMID com 0/múltiplos candidatos e uso do exe canônico no Win32 comum.

- [ ] **Passo 2: Executar os testes focados e confirmar RED**

```powershell
pnpm exec vitest run `
  test/native/windows-aumid-application.test.ts `
  test/native/windows-input-dispatch.test.ts `
  test/native/windows-clipboard.test.ts `
  test/windows-pointer-foreground-gate.test.ts `
  test/windows-native-clipboard-adapter.test.ts `
  test/windows-open-application-identity.test.ts
```

Expected: FAIL, apontando respectivamente para os comportamentos de ABI/adapter/identity ausentes.

- [ ] **Passo 3: Implementar o GREEN mínimo por camada**

A ordem é fixa: ABI nativo → adapter TS → ports neutros de backend → broker handler → tool scope.
O camada de ferramenta não pode conter nomes de Win32/UIA; ramos Windows-only existem apenas em adapters native/Helper.

- [ ] **Passo 4: Reconstruir o addon e executar o GREEN**

```powershell
pnpm rebuild:native
pnpm exec vitest run `
  test/native/windows-aumid-application.test.ts `
  test/native/windows-input-dispatch.test.ts `
  test/native/windows-clipboard.test.ts `
  test/windows-pointer-foreground-gate.test.ts `
  test/windows-native-clipboard-adapter.test.ts `
  test/windows-open-application-identity.test.ts
```

Expected: testes focados com exit 0; testes que exigem desktop interativo fazem skip explícito, em vez de falsificar um pass.

---

### Task 5: Portar adiante WGC e o binding de state-image

**Arquivos:**

- Create: `C:\Users\dev\zcode-cua\src\native\screen_capture_win.h`
- Create: `C:\Users\dev\zcode-cua\src\native\screen_capture_win.cc`
- Create: `C:\Users\dev\zcode-cua\src\native\windowsScreenCapture.ts`
- Modify: `C:\Users\dev\zcode-cua\binding.gyp`
- Modify: `C:\Users\dev\zcode-cua\src\native\ax_win.cc`
- Modify: `C:\Users\dev\zcode-cua\src\native\win.ts`
- Modify: os adapters atuais de observação/captura do broker, sem substituir a lógica de estado incremental do upstream.
- Create: testes de capability/adapter/app-state de WGC listados em WCFR-04/05。

**Interfaces:**

- Produces: captura assíncrona de display/window em PNG + bounds lógicos exatos。
- Consumes: o contrato atual de upstream de captura visual explícita e de observação incremental/completa。

- [ ] **Passo 1: Escrever os RED tests de WGC**

Cobrir: o estado de suporte refletindo de verdade a ABI nativa; captura de display/window retornando PNG+bounds;
`capture_app` ligando a imagem ao HWND/window_id verificado; state-image usando os mesmos bounds;
janela minimizada/bloqueada/suportada indevidamente retornando unavailable de forma explícita.

- [ ] **Passo 2: Executar e confirmar RED**

```powershell
pnpm exec vitest run `
  test/native/windows-wgc-screen-capture.test.ts `
  test/windows-native-screen-capture-adapter.test.ts `
  test/windows-app-state-screen-capture.test.ts `
  test/windows-capability-truthfulness.test.ts
```

Expected: FAIL, pois o main atual não tem implementação de WGC em `captureWindowImage`/capability.

- [ ] **Passo 3: Implementar a ponte WGC**

Portar do branch seguro o capture item do WinRT, o device/frame pool do D3D11, a codificação PNG e a validação de bounds;
conectar à seam de captura visual explícita do main atual. Um comentário em chinês explica por que janela minimizada/desktop não interativo precisa falhar de forma fechada, sem devolver imagem em branco fingindo sucesso.

- [ ] **Passo 4: Construir e executar o GREEN**

```powershell
pnpm rebuild:native
pnpm build
pnpm exec vitest run `
  test/native/windows-wgc-screen-capture.test.ts `
  test/windows-native-screen-capture-adapter.test.ts `
  test/windows-app-state-screen-capture.test.ts `
  test/windows-capability-truthfulness.test.ts
```

Expected: testes focados com exit 0 e os testes de observação incremental do main atual continuando passando.

---

### Task 6: Verificação completa do Producer e commit único

**Arquivos:**

- Modify generated: `C:\Users\dev\zcode-cua\dist\**`
- Create/update: scripts de live smoke do Windows e `docs/platforms.md`, apenas quando o comportamento atual precisar ser registrado.

**Interfaces:**

- Produces: um único commit SHA completo do producer, instalável como dependência de Git.

- [ ] **Passo 1: Regenerar os artefatos e inspecionar o diff**

```powershell
pnpm build
git status --short
git diff --check
```

Expected: `dist` reflete apenas o build do source atual; sem conflict markers e sem remoções inesperadas de macOS/Linux.

- [ ] **Passo 2: Executar as gates automatizadas completas do producer**

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm rebuild:native
pnpm build
pnpm pack --dry-run --json
```

Expected: tudo com exit 0; registrar as quantidades de testes passed/skipped.

- [ ] **Passo 3: Executar o live smoke no Windows**

```powershell
node scripts/windows-pointer-live-smoke.mjs
node scripts/windows-clipboard-live-smoke.mjs
node scripts/windows-screen-capture-live-smoke.mjs
node scripts/windows-tool-surface-live-smoke.mjs
```

Expected: pointer/clipboard restauram o estado original, smoke de WGC/30-tools com exit 0 e nenhum Helper/fixture órfão.

- [ ] **Passo 4: Criar o único commit do producer**

```powershell
git add --all
git diff --cached --check
git commit -m "feat(windows): forward-port CUA runtime onto current main"
```

Expected: `origin/main..main` contém apenas um novo commit, e nada foi enviado.

---

### Task 7: z-code consumer remove primeiro a verdade da versão antiga com RED tests

**Arquivos:**

- Modify: `C:\Users\dev\z-code\packages\desktop\test\windows-cua-helper-assets.test.ts`
- Modify: `C:\Users\dev\z-code\packages\services\test\windowsCuaDevRuntime.test.ts`
- Modify: `C:\Users\dev\z-code\packages\desktop\test\runtime-asset-scripts.test.ts`

**Interfaces:**

- Consumes: o commit local do producer da Task 6 e o contrato `zcodeCuaRuntime`。
- Produces: evidência RED de que o consumer com `0.3.28` hardcoded não consegue consumir o producer atual。

- [ ] **Passo 1: Registrar o SHA local do producer, mantendo o pin remoto da dependência inalterado**

Execute:

```powershell
$producerCommit = git -C C:\Users\dev\zcode-cua rev-parse HEAD
Write-Output $producerCommit
```

O usuário exigiu explicitamente não fazer push, portanto esse SHA ainda não pode ser obtido por um clean checkout de uma Git URL. A implementação e a validação local do produto usam `ZCODE_CUA_HELPER_RUNTIME_PACKAGE_DIR=C:\Users\dev\zcode-cua` explicitamente;
`pnpm-workspace.yaml` e `pnpm-lock.yaml` mantêm o pin atual do upstream até que o commit do producer possa ser obtido do remote, e é proibido commitar um SHA inacessível ou um caminho local `file:`. A gate final de pin por Git URL / clean-install fica marcada como pendente de execução após o push pelo usuário, sem falsificar sucesso.

- [ ] **Passo 2: Modificar os testes do consumer para expressar o novo contrato**

O fixture de package dos testes usa:

```ts
{
  name: "@zcode/zcode-cua",
  version: "0.5.2",
  zcodeCuaRuntime: {
    schema: 1,
    windows: {
      entry: "dist/windows-helper.js",
      nativeAddon: "build/Release/ax_native.node",
    },
  },
}
```

Afirmar também que a versão pode virar `0.5.3` sem precisar alterar a constante do consumer, mas que schema/name/path/digest continuam sendo validados estritamente.

- [ ] **Passo 3: Executar e confirmar RED**

```powershell
pnpm exec vitest run packages/desktop/test/windows-cua-helper-assets.test.ts
pnpm exec vitest run packages/services/test/windowsCuaDevRuntime.test.ts
pnpm exec vitest run packages/desktop/test/runtime-asset-scripts.test.ts
```

Expected: FAIL, pois a implementação antiga ainda exige `0.3.28` e o preparation ainda não chama o staging de Windows CUA.

---

### Task 8: Implementar o contrato do consumer, o clean staging e o runtime resolver

**Arquivos:**

- Modify: `C:\Users\dev\z-code\packages\desktop\scripts\windows-cua-helper-assets.mjs`
- Modify: `C:\Users\dev\z-code\packages\desktop\scripts\prepare-runtime-assets.mjs`
- Modify: `C:\Users\dev\z-code\packages\services\src\cua-permission-broker\windowsCuaDevRuntime.ts`
- Manter a validação local a cada camada permitida: o staging do desktop valida o contrato de package do producer; services valida o manifest staged e o contrato explícito de dev-root. As duas travam as regras de schema/name/path por meio do mesmo fixture de paridade, sem importar implementação de desktop/service entre camadas.
- Update: `C:\Users\dev\z-code\docs\cua\windows-product-runtime.md`
- Update: `C:\Users\dev\z-code\docs\cua\windows-source-development.md`

**Interfaces:**

- Produces: semântica canônica de parser do `WindowsCuaRuntimeContract`。
- Produces: `runtime-manifest.json` staged, com versão observada e digests。

- [ ] **Passo 1: Implementar o parser do contrato do producer**

O parser só aceita:

```ts
type WindowsCuaRuntimeContract = {
  schema: 1;
  windows: {
    entry: string;
    nativeAddon: string;
  };
};
```

A verificação de caminho rejeita absoluto, barra invertida, segmento vazio, `.`, `..`, NUL e escape por link. A versão do package é registrada como provenance no manifest, sem comparação com constantes do consumer; os valores concretos de entry/nativeAddon são declarados pelo commit fixo do producer e o consumer não guarda mais essas duas constantes de caminho.

- [ ] **Passo 2: Ligar o contrato ao staging/resolver**

O staging lê o contrato do JSON do package e gera um inventário SHA-256; o resolver valida manifest, entry/native addon, Electron, PE arch e digest. Os limites existentes de dev override/product-only permanecem inalterados.

- [ ] **Passo 3: Ligar o staging de Windows à preparação de assets**

`prepare-runtime-assets.mjs` só chama o staging de Windows CUA quando a plataforma/arquitetura alvo é Windows;
o fluxo de macOS/Linux não lê o native addon do Windows.

- [ ] **Passo 4: Executar os GREEN tests**

```powershell
pnpm exec vitest run packages/desktop/test/windows-cua-helper-assets.test.ts
pnpm exec vitest run packages/services/test/windowsCuaDevRuntime.test.ts
pnpm exec vitest run packages/desktop/test/runtime-asset-scripts.test.ts
```

Expected: tudo com exit 0.

---

### Task 9: Clean-tree/package smoke e commit do z-code

**Arquivos:**

- Atualizar a documentação apenas se a verificação revelar um comando/limitação exatos não cobertos pela Task 8。

**Interfaces:**

- Produces: evidência de conclusão P0 e o commit de implementação do z-code。

- [ ] **Passo 1: Verificar em um diretório temporário separado a ausência de dependência de assets ignorados**

Criar um checkout temporário a partir da árvore tracked atual e confirmar que `packages/desktop/bundled-tools` não existe inicialmente;
apontar explicitamente `ZCODE_CUA_HELPER_RUNTIME_PACKAGE_DIR` para o producer local da Task 6, executar o staging
e então conferir manifest/entry/native digests.

Expected: os assets são gerados mesmo sem copiar o `bundled-tools` do histórico do workspace atual. Como o commit do producer não foi enviado, esse resultado é evidência de local producer + clean consumer tree, e não declara que o clean install da dependência Git remota foi fechado.

- [ ] **Passo 2: Executar as gates focadas/de integração do z-code**

```powershell
pnpm exec vitest run packages/services/test/windowsCuaDevHelperHost.test.ts
pnpm exec vitest run packages/services/test/windowsCuaProductHelper.integration.test.ts
pnpm --filter @zcode/zcode-cua-plugin test
```

Expected: exit 0; a integração real com child process faz skip explícito quando faltam pré-requisitos.

- [ ] **Passo 3: Executar as gates globais obrigatórias**

```powershell
pnpm typecheck
pnpm lint
```

Expected: ambos com exit 0. Se os testes completos ou afetados tiverem falhas preexistentes, preserve a saída completa e faça uma comparação com uma baseline limpa.

- [ ] **Passo 4: Verificar os invariantes de padrão**

Provar com testes/asserções estáticas que: remote workspace, SSH, WSL, Docker e `/remote` do celular não entram no
start/staging do Windows Helper; e que desktop continuous e web replayable não têm mudança de protocolo.

- [ ] **Passo 5: Criar o commit de implementação do z-code**

```powershell
git add --all
git diff --cached --check
git commit -m "fix(cua): align Windows runtime with current producer"
```

Expected: commit bem-sucedido, workspace limpo e nada enviado.

---

### Task 10: Auditoria de conclusão e entrada do próximo marco

**Arquivos:**

- Sem mudanças obrigatórias de produto.

**Interfaces:**

- Produces: commit SHA dos dois repos, resultados de verificação, riscos conhecidos e a entrada seguinte de settings/indicator do Windows.

- [ ] **Passo 1: Conferir a topologia dos commits**

```powershell
git -C C:\Users\dev\zcode-cua log --oneline origin/main..main
git -C C:\Users\dev\zcode-cua log --oneline origin/feat/cua-helper-app..HEAD
```

Expected: o zcode-cua tem apenas um novo commit de Windows; o z-code contém a integração Windows existente, o spec e o fix de consumer deste trabalho.

- [ ] **Passo 2: Conferir o workspace e o estado de push**

```powershell
git -C C:\Users\dev\zcode-cua status --short --branch
git -C C:\Users\dev\z-code status --short --branch
```

Expected: as duas working trees limpas; branches apenas advanced localmente, sem push.

- [ ] **Passo 3: Conferir item a item a definição de conclusão do spec**

Verificar WCFR-01 a WCFR-10; qualquer item live/package não verificado precisa ser marcado explicitamente como não concluído, sem extrapolação a partir de unit tests.

- [ ] **Passo 4: Atualizar o status do plano antes de entrar no P1 seguinte**

Só depois que todo o P0 for atendido começa a Tab de settings independente do Windows; antes de qualquer modificação de UI, ler o `DESIGN.md` da raiz e seguir spec/TDD próprios.