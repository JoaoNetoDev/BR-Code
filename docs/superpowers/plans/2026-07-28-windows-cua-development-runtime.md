# Windows CUA Phase 0+1 Development Runtime Implementation Plan

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: usar superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano task por task, com pontos de revisão.

**Objetivo:** No Host desktop local do Windows, iniciar sob demanda um Helper Node independente compilado a partir do código-fonte em `C:\Users\dev\zcode-cua`, para que o plugin oficial `zcode-cua` obtenha named pipe aleatório, token e authority, e concluir o ciclo de observação UIA, clique e digitação no Bloco de Notas.

**Arquitetura:** Manter a estratificação existente do macOS `Host -> Helper -> broker -> MCP plugin`. O Windows ganha uma entrada de Helper exclusiva para desenvolvimento com código-fonte e um adapter de lifecycle do Host; o Helper roda com `process.execPath + ELECTRON_RUN_AS_NODE=1`, carregando automaticamente `build/Release/ax_native.node` da árvore de código-fonte. O ZCode Host é responsável apenas por validação da raiz do código-fonte, lifecycle do subprocesso, health check e injeção de credenciais; UIA, entrada e a superfície de sistema do Windows continuam pertencendo a `zcode-cua`. Este plano não adiciona tool, não modifica schema de tool, não integra SSH/WSL/Docker, e não faz WGC, ponteiro completo nem empacotamento de produto.

**Stack técnico:** TypeScript 5/6, Node.js 24, Electron utility process, Vitest 4, `child_process.fork` do Node, Windows named pipe, N-API/node-addon-api, C++/UI Automation, pnpm 10.

**Restrições globais:**

- A base do design é `docs/superpowers/specs/2026-07-28-windows-cua-development-runtime-design.md`; o escopo cobre somente Phase 0 e Phase 1.
- O runtime Windows só é permitido no Host desktop local; `desktop-attached-remote`, SSH, WSL, Docker e Web remote não podem criar Helper.
- O macOS continua usando o `createProductCuaHelperHost()`, Helper.app, TCC, assinatura e instalador existentes; o comportamento não pode mudar.
- O caminho Linux standalone in-process não pode mudar.
- O token só pode ser passado por ambiente de subprocesso controlado; é proibido aparecer em argv, mensagens de ready, textos de erro e logs.
- O Helper não publica a tuple do broker antes de passar no health check; reiniciar deve mintar novo pipe/token, e a authority permanece estável dentro do mesmo lifecycle do Host.
- Toda E/S de arquivos e processos usa API assíncrona; logs de produção usam `createServiceLogger("cua-product-helper")`; saída protocolo por item só é permitida em `debug`.
- Não modificar `packages/ui`; portanto este milestone não toca na página de configurações do Windows nem no onboarding de permissões.
- Cada commit de funcionalidade usa Conventional Commits; os dois repositórios são commitados separadamente, sem misturar mudanças entre repositórios em um único commit.

---

## Mapa de estrutura de arquivos

### `C:\Users\dev\zcode-cua`

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `scripts/build.mjs`
- Modify: `src/broker/server/index.ts`
- Modify: `src/broker/server/nodeSystemSurface.ts`
- Add: `src/broker/server/windowsSystemSurface.ts`
- Add: `src/broker/server/windowsDevHelperMain.ts`
- Add: `src/windows-helper.ts`
- Add: `test/broker/windowsSystemSurface.test.ts`
- Add: `test/windowsDevHelperMain.test.ts`
- Modify: `test/broker/helpers/tempSocket.ts`
- Modify: `test/broker/fakes/fakeBrokerServer.ts`
- Modify: `test/broker-client.claim.test.ts`
- Modify: `test/broker-client.refresh-marker.test.ts`
- Modify: `test/standalone/helper-launch/fakes.ts`
- Modify: `test/mock-broker-e2e.test.ts`
- Modify: `test/standalone/helper-launch/discovery.test.ts`
- Modify: `test/standalone/helper-launch/ownerLock.test.ts`
- Modify: `test/standalone/helper-launch/launcher.test.ts`
- Modify: `test/standalone/cli-launch.test.ts`
- Modify: `test/broker/broker.peerCheck.parity.test.ts`
- Modify: `test/broker/m3/rotation.selfHeal.test.ts`
- Modify: `test/lib/06-resize-jpeg.test.ts`
- Modify: `docs/KNOWN-ISSUES.md`
- Modify: `docs/platforms.md`

### `C:\Users\dev\z-code`

- Modify: `docs/superpowers/specs/2026-07-28-windows-cua-development-runtime-design.md`
- Modify: `apps/zcode-cli/docs/design/v2/tool/00-tool-change-chain.md`
- Add: `packages/services/src/cua-permission-broker/windowsCuaDevRuntime.ts`
- Add: `packages/services/src/cua-permission-broker/windowsCuaDevHelperHost.ts`
- Modify: `packages/services/src/cua-permission-broker/index.ts`
- Modify: `packages/services/src/node.ts`
- Add: `packages/services/test/windowsCuaDevRuntime.test.ts`
- Add: `packages/services/test/windowsCuaDevHelperHost.test.ts`
- Add: `packages/services/test/windowsCuaDevHelper.integration.test.ts`
- Modify: `packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts`
- Modify: `packages/services/test/cuaPermissionBrokerServiceDispose.test.ts`
- Add: `docs/cua/windows-source-development.md`

---

### Task 1: Fixar a linha de base de testes e build nativo no Windows

**Arquivos:**

- Modify: `C:\Users\dev\zcode-cua\package.json`
- Modify: `C:\Users\dev\zcode-cua\pnpm-lock.yaml`
- Modify: arquivos de teste inválidos no Windows listados no mapa de arquivos
- Modify: `C:\Users\dev\zcode-cua\docs\KNOWN-ISSUES.md`

**Passo 1: Registrar a linha de base de falhas atual**

Executar:

```powershell
cd C:\Users\dev\zcode-cua
pnpm typecheck
pnpm lint
pnpm test -- --reporter=verbose
pnpm rebuild:native
```

Esperado antes da correção:

- `typecheck` passa.
- `lint` falha porque `oxlint` não está declarado.
- os testes falham onde caminhos POSIX, mode bits ou Unix sockets são assumidos no Windows.
- `rebuild:native` falha até que o workload Visual Studio C++ Desktop seja instalado.

Reter o erro exato de build nativo nas notas da task. Não deixar o script `install` best-effort contar como evidência de build nativo.

**Passo 2: Tornar a toolchain nativa um pré-requisito explícito**

Usar `vswhere.exe` para detectar uma instalação que contenha:

```text
Microsoft.VisualStudio.Component.VC.Tools.x86.x64
Microsoft.VisualStudio.Component.Windows11SDK.26100
```

Se ausente, instalar o workload Visual Studio Build Tools "Desktop development with C++" e então executar novamente:

```powershell
pnpm rebuild:native
Test-Path .\build\Release\ax_native.node
```

Esperado: o rebuild nativo sai com `0`; o comando final imprime `True`.

**Passo 3: Corrigir a dependência de lint**

Adicionar `oxlint` às `devDependencies` na versão usada pelo ZCode (`^1.57.0`), rodar `pnpm install` e verificar:

```powershell
pnpm lint
```

Esperado: sai com `0`.

**Passo 4: Escrever primeiro o helper de teste portátil para Windows**

Alterar `test/broker/helpers/tempSocket.ts` para que os testes de broker ao vivo usem:

```text
win32 -> \\.\pipe\zcode-cua-test-<random>
other -> <fresh tmpdir>/broker.sock
```

Usar o mesmo helper em todo teste que cria um listener ao vivo:

- `test/broker-client.claim.test.ts`
- `test/broker-client.refresh-marker.test.ts`
- `test/broker/fakes/fakeBrokerServer.ts`
- `test/standalone/helper-launch/fakes.ts`
- `test/mock-broker-e2e.test.ts`

Executar:

```powershell
pnpm exec vitest run test/broker-client.claim.test.ts test/standalone/helper-launch/connection.test.ts test/standalone/helper-launch/orchestrator.test.ts test/mock-broker-e2e.test.ts
```

Esperado: sem `listen EACCES` e sem timeout causado por fake broker sem bind.

**Passo 5: Separar contratos POSIX de contratos cross-platform**

Aplicar estas regras:

- Asserções de construção de caminho usam `join()` ou injetam `path.posix` quando o teste está explicitamente verificando um contrato macOS/POSIX.
- `0600`/`0700`, propriedade por uid e asserções de permissão de symlink usam `describe.skipIf(process.platform === "win32")`.
- O `test/broker/broker.peerCheck.win32.test.ts` existente permanece como o contrato de segurança de named pipe do Windows; não enfraquecer o `peer-check.ts` de produção para satisfazer testes POSIX.
- Testes no Windows verificam autenticação por token e namespace de pipe; testes POSIX continuam verificando mode/uid.
- `test/lib/06-resize-jpeg.test.ts` resolve fixtures relativo a `import.meta.url`, nunca a um caminho `/Users/...` de desenvolvedor.

Executar:

```powershell
pnpm exec vitest run test/standalone/helper-launch/discovery.test.ts test/standalone/helper-launch/ownerLock.test.ts test/standalone/helper-launch/launcher.test.ts test/standalone/cli-launch.test.ts test/broker/broker.peerCheck.parity.test.ts test/broker/broker.peerCheck.win32.test.ts test/broker/m3/rotation.selfHeal.test.ts test/lib/06-resize-jpeg.test.ts
```

Esperado: passa, com apenas os casos POSIX-only explicitamente nomeados pulados no Windows.

**Passo 6: Rodar o gate completo do repositório**

Executar:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Esperado: todos os comandos saem com `0`. `pnpm test` pode conter skips intencionais de plataforma, mas sem falhas nem erros não tratados.

**Passo 7: Documentar a linha de base corrigida**

Atualizar `docs/KNOWN-ISSUES.md` com:

- pré-requisitos nativos do Windows;
- comando estrito de rebuild;
- distinção entre testes de named pipe e testes de permissão de socket POSIX;
- contagens atuais da suíte completa vindas da execução bem-sucedida.

**Passo 8: Commit**

```powershell
git add package.json pnpm-lock.yaml test docs/KNOWN-ISSUES.md
git diff --cached --check
git commit -m "test(windows): establish CUA development baseline"
```

---

### Task 2: Adicionar uma superfície de sistema Windows fail-closed

**Arquivos:**

- Add: `C:\Users\dev\zcode-cua\src\broker\server\windowsSystemSurface.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\nodeSystemSurface.ts`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\index.ts`
- Add: `C:\Users\dev\zcode-cua\test\broker\windowsSystemSurface.test.ts`

**Passo 1: Escrever testes que falham**

Cobrir:

1. `createNodeSystemSurface({ platform: "win32" })` despacha para a fábrica Windows.
2. `captureScreenPng` e `captureWindowPng` retornam `null` na Phase 1 e nunca invocam comandos do macOS.
3. Leituras de clipboard retornam `""`; escritas são no-op até existir um adapter nativo de clipboard.
4. `resolveApplicationBundleId` retorna `null`.
5. `openApplication({ name: "notepad.exe", activate: false })` invoca um runner assíncrono injetado com um array de argv e retorna `{ pid, name, bundleId: null, active: false }`.
6. identidade de nome/bundle ausente e falha de lançamento rejeitam com erro estável.

Executar:

```powershell
pnpm exec vitest run test/broker/windowsSystemSurface.test.ts
```

Esperado: falha porque a fábrica Windows não existe e `win32` hoje cai no branch do macOS.

**Passo 2: Implementar a superfície mínima**

Criar `createWindowsNodeSystemSurface()` com um `openRunner` injetado. O runner padrão usa `child_process.spawn()` sem shell, retorna o PID do filho, chama `unref()` e nunca invoca PowerShell.

Manter captura e clipboard explicitamente fail-closed na Phase 1. Não adicionar BitBlt, código de screenshot em PowerShell nem placeholders de WGC que aleguem sucesso.

Atualizar `createNodeSystemSurface()` para despachar:

```text
linux -> createLinuxNodeSystemSurface
win32 -> createWindowsNodeSystemSurface
darwin -> existing macOS implementation
```

**Passo 3: Verificar**

Executar:

```powershell
pnpm exec vitest run test/broker/windowsSystemSurface.test.ts
pnpm typecheck
pnpm lint
```

Esperado: passa.

**Passo 4: Commit**

```powershell
git add src/broker/server/windowsSystemSurface.ts src/broker/server/nodeSystemSurface.ts src/broker/server/index.ts test/broker/windowsSystemSurface.test.ts
git diff --cached --check
git commit -m "feat(windows): add CUA system surface"
```

---

### Task 3: Construir uma entrada de Helper de desenvolvimento independente para Windows

**Arquivos:**

- Add: `C:\Users\dev\zcode-cua\src\broker\server\windowsDevHelperMain.ts`
- Add: `C:\Users\dev\zcode-cua\src\windows-helper.ts`
- Modify: `C:\Users\dev\zcode-cua\scripts\build.mjs`
- Modify: `C:\Users\dev\zcode-cua\src\broker\server\index.ts`
- Add: `C:\Users\dev\zcode-cua\test\windowsDevHelperMain.test.ts`
- Modify: `C:\Users\dev\zcode-cua\docs\platforms.md`

**Passo 1: Escrever testes de parser e lifecycle que falham**

O protocolo de controle versionado Host/Helper é:

```json
{"protocol":"zcode-cua-windows-dev/v1","type":"ready","socketPath":"\\\\.\\pipe\\...","pid":123}
{"protocol":"zcode-cua-windows-dev/v1","type":"shutdown"}
```

Cobrir:

1. apenas `win32` é aceito;
2. `--socket` deve ser um named pipe do Windows;
3. `--parent-pid` deve ser um inteiro positivo;
4. token é obrigatório a partir de `ZCODE_CUA_PERMISSION_BROKER_TOKEN`;
5. `--token` é rejeitado e o texto do token nunca aparece em erros/mensagens;
6. addon nativo e superfície de sistema são injetados em `runHelper`;
7. ready é enviado somente após o bind do broker;
8. shutdown por IPC, desconexão do pai, `SIGINT` e `SIGTERM` compartilham um único stop assíncrono idempotente;
9. perda de vivacidade do pai interrompe o broker e encerra;
10. falha de startup emite uma mensagem de erro v1 sanitizada e sai com código diferente de zero.

Executar:

```powershell
pnpm exec vitest run test/windowsDevHelperMain.test.ts
```

Esperado: falha porque a entrada não existe.

**Passo 2: Implementar o composition root específico de plataforma**

`windowsDevHelperMain.ts` deve:

- validar args e env com um schema de runtime;
- chamar `loadRealNativeAddon({ platform: "win32" })`;
- chamar `createNodeSystemSurface({ platform: "win32" })`;
- chamar o `runHelper()` neutro de plataforma já existente;
- passar o bearer token somente como `authToken`;
- usar `startLauncherLivenessWatchdog()` para o PID do pai;
- parar de aceitar novos trabalhos do broker antes da saída do processo;
- não emitir logs por requisição nem valores de credencial.

Não chamar `helperMain.main()` do macOS: esse caminho exige arquivos de token, verificações de assinatura de código, modos de permissão TCC e `/usr/bin/ps`.

**Passo 3: Adicionar o bundle executável**

Adicionar uma entrada esbuild:

```text
src/windows-helper.ts -> dist/windows-helper.js
```

Usar target Node 24 e os mesmos externals dos bundles existentes. Adicionar um shebang para que o arquivo também possa ser executado diretamente com Node durante diagnósticos.

Executar:

```powershell
pnpm build
Test-Path .\dist\windows-helper.js
node .\dist\windows-helper.js --socket invalid --parent-pid $PID
```

Esperado:

- o build sai com `0`;
- o arquivo existe;
- pipe inválido sai com código diferente de zero e um diagnóstico sanitizado.

**Passo 4: Executar um smoke nativo somente leitura**

Iniciar a entrada com pipe/token aleatórios, conectar usando `probeHelperHealth`, chamar `broker_info` e então interrompê-la pela mensagem de shutdown v1. Verificar:

- o PID do helper difere do PID de quem chamou;
- o health reporta ready;
- `broker_info.pid` é igual ao PID do filho;
- o filho encerra e o pipe não aceita mais conexões.

Esse smoke é implementado no teste com o addon real e protegido por:

```text
process.platform === "win32" && build/Release/ax_native.node exists
```

O gate da Phase 0 garante que a guarda é verdadeira na máquina de desenvolvimento.

**Passo 5: Documentar e verificar**

Atualizar `docs/platforms.md` para distinguir:

- Helper de código-fonte da Phase 1 no Windows: UIA + clique + teclado, sem pixels;
- Phase 2: WGC e as operações restantes de ponteiro.

Executar:

```powershell
pnpm exec vitest run test/windowsDevHelperMain.test.ts test/broker/windowsSystemSurface.test.ts
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Esperado: todos saem com `0`.

**Passo 6: Commit**

```powershell
git add src scripts/build.mjs test/windowsDevHelperMain.test.ts docs/platforms.md
git diff --cached --check
git commit -m "feat(windows): add source Computer Use Helper entry"
```

---

### Task 4: Resolver e validar o runtime de desenvolvimento do ZCode no Windows

**Arquivos:**

- Modify: `C:\Users\dev\z-code\docs\superpowers\specs\2026-07-28-windows-cua-development-runtime-design.md`
- Modify: `C:\Users\dev\z-code\apps\zcode-cli\docs\design\v2\tool\00-tool-change-chain.md`
- Add: `C:\Users\dev\z-code\packages\services\src\cua-permission-broker\windowsCuaDevRuntime.ts`
- Add: `C:\Users\dev\z-code\packages\services\test\windowsCuaDevRuntime.test.ts`

**Passo 1: Encerrar o item aberto aceito pela spec**

Atualizar o status do design para "confirmado" (original em chinês: "已确认") e resolver a escolha do Node:

```text
command = process.execPath
env.ELECTRON_RUN_AS_NODE = "1"
```

Motivo: o Host desktop já usa esse padrão para o zcode-agent; hosts de CLI/teste naturalmente têm `process.execPath` apontando para o Node. O addon é N-API e é recompilado na máquina Windows alvo.

Atualizar a cadeia de mudança de tools antes da implementação. Registrar que as 30 tools existentes, schemas, anotações de efeito colateral e semântica de delivery-state permanecem inalteradas; apenas a rota de admissão/execução do backend Windows passa a existir.

**Passo 2: Escrever testes de resolver que falham**

Cobrir:

1. apenas `platform="win32"` aceita `ZCODE_CUA_DEV_ROOT`;
2. raízes vazias, relativas ou inexistentes falham com motivo estruturado;
3. `package.json.name` deve ser igual a `@zcode/zcode-cua`;
4. `dist/windows-helper.js` e `build/Release/ax_native.node` devem ser ambos arquivos;
5. o comando resolvido é `process.execPath`;
6. o env do filho inclui `ELECTRON_RUN_AS_NODE=1` mas ainda nenhum token de broker;
7. todas as verificações de filesystem são assíncronas;
8. os diagnósticos nomeiam o artefato ausente mas não incluem valores de ambiente não relacionados.

Executar:

```powershell
pnpm exec vitest run packages/services/test/windowsCuaDevRuntime.test.ts
```

Esperado: falha porque o resolver não existe.

**Passo 3: Implementar o resolver**

Expor:

```ts
export interface WindowsCuaDevRuntime {
  root: string;
  entryPath: string;
  addonPath: string;
  command: string;
  commandEnv: Record<string, string>;
}

export async function resolveWindowsCuaDevRuntime(
  options?: WindowsCuaDevRuntimeResolveOptions,
): Promise<WindowsCuaDevRuntime>;
```

A raiz padrão vem somente de `ZCODE_CUA_DEV_ROOT`. Não procurar diretórios irmãos nem cair silenciosamente em um caminho de Helper do macOS.

**Passo 4: Verificar e commitar**

Executar:

```powershell
pnpm exec vitest run packages/services/test/windowsCuaDevRuntime.test.ts
pnpm typecheck
pnpm lint
```

Esperado: passa.

```powershell
git add docs/superpowers/specs/2026-07-28-windows-cua-development-runtime-design.md apps/zcode-cli/docs/design/v2/tool/00-tool-change-chain.md packages/services/src/cua-permission-broker/windowsCuaDevRuntime.ts packages/services/test/windowsCuaDevRuntime.test.ts
git diff --cached --check
git commit -m "docs(cua): finalize Windows runtime contract"
```

---

### Task 5: Implementar o host de lifecycle do Helper no Windows

**Arquivos:**

- Add: `C:\Users\dev\z-code\packages\services\src\cua-permission-broker\windowsCuaDevHelperHost.ts`
- Modify: `C:\Users\dev\z-code\packages\services\src\cua-permission-broker\index.ts`
- Add: `C:\Users\dev\z-code\packages\services\test\windowsCuaDevHelperHost.test.ts`

**Passo 1: Escrever testes de lifecycle que falham**

Usar um adapter de subprocesso e um health probe injetados. Cobrir:

1. chamadas concorrentes de `start()` compartilham um único fork;
2. o comando do fork é `runtime.command`, a entrada é `runtime.entryPath` e o cwd é `runtime.root`;
3. o argv inclui pipe e PID do pai mas nunca o token;
4. o env do filho contém o token, `ZCODE_CUA_HELPER_ADDON=runtime.addonPath` e `ELECTRON_RUN_AS_NODE=1`;
5. somente uma mensagem v1 de ready válida para o pipe mintado é aceita;
6. o health precisa passar antes de `start()` retornar um handle;
7. o handle contém pipe/token aleatórios, authority estável do Host, caminho da entrada e PID do filho;
8. erro de startup, saída precoce do filho, mensagem malformada e timeout de health todos rejeitam, param o filho e não publicam handle;
9. `restart()` para H1, minta um pipe/token diferente, inicia H2 e mantém a authority estável;
10. `restartAfterCurrentStart()` serializa atrás de um start pendente;
11. `restartAfterCurrentStartPreservingTransport()` invoca `beforeFreshStart` antes do fork e retorna `reused:false`;
12. `stop()` envia a mensagem de shutdown v1, espera um intervalo limitado e então mata apenas o filho exato se ele não tiver encerrado;
13. eventos tardios de ready/exit após o stop não podem ressuscitar `running`;
14. logs incluem generation/PID/classe de erro mas nunca o token.

Executar:

```powershell
pnpm exec vitest run packages/services/test/windowsCuaDevHelperHost.test.ts
```

Esperado: falha porque o host não existe.

**Passo 2: Definir o contrato comum mínimo de Host**

Usar o contrato de resolver `CuaProductHelperHost` existente e adicionar as duas capacidades de lifecycle que o ZCode possui:

```ts
export type ManagedCuaProductHelperHost = CuaProductHelperHost & {
  stop(): Promise<void>;
  checkHealth(timeoutMs?: number): Promise<unknown>;
};
```

Não exigir `queryPermissionStatus()` ou `queryScreenCaptureProbe()` exclusivos do macOS na classe do Windows.

**Passo 3: Implementar lifecycle e posse de credenciais**

Requisitos de implementação:

- em produção no Windows chamar `mintBrokerSocketPath()` e `mintBrokerToken()` por geração; testes unitários injetam funções de mint determinísticas em vez de falsificar `process.platform`;
- authority mintada uma vez por objeto Host;
- `child_process.fork()` envolvido em um adapter injetável;
- validação por schema de runtime para cada mensagem do filho;
- timers limitados de startup e shutdown, ambos com `unref()` onde for seguro;
- o health real usa `probeHelperHealth`;
- saída inesperada do filho deixa a geração observável como unhealthy até a recuperação pelo resolver, conforme o contrato existente do liveness watchdog;
- stop/restart impede que uma conclusão assíncrona tardia escreva um novo handle;
- logs de serviço usam `createServiceLogger`, nunca `console`.

**Passo 4: Verificar**

Executar:

```powershell
pnpm exec vitest run packages/services/test/windowsCuaDevHelperHost.test.ts packages/services/test/cuaPermissionBrokerProductMcpResolver.test.ts packages/services/test/cuaPermissionBrokerHelperLivenessWatchdog.test.ts
pnpm typecheck
pnpm lint
```

Esperado: passa.

**Passo 5: Commit**

```powershell
git add packages/services/src/cua-permission-broker/windowsCuaDevHelperHost.ts packages/services/src/cua-permission-broker/index.ts packages/services/test/windowsCuaDevHelperHost.test.ts
git diff --cached --check
git commit -m "feat(cua): manage Windows development Helper"
```

---

### Task 6: Ligar a admissão Windows e as credenciais do broker ao ZCode

**Arquivos:**

- Modify: `C:\Users\dev\z-code\packages\services\src\node.ts`
- Modify: `C:\Users\dev\z-code\packages\services\test\cuaPermissionBrokerProductAgentEnv.test.ts`
- Modify: `C:\Users\dev\z-code\packages\services\test\cuaPermissionBrokerServiceDispose.test.ts`

**Passo 1: Escrever testes de admissão que falham**

Adicionar casos provando que:

1. a admissão de feature no macOS permanece inalterada;
2. o Windows é admitido apenas quando a feature interna de CUA está habilitada e `ZCODE_CUA_DEV_ROOT` não está vazio;
3. o Linux permanece desabilitado neste caminho de Host de produto;
4. `isDesktopAttachedRemote=true` impede a criação do Host no Windows;
5. um resolver injetado impede criação duplicada de Host;
6. um runtime Windows inválido produz `BROKER_UNAVAILABLE`, não env vazio nem fallback para macOS;
7. um host Windows saudável injeta socket/token/authority apenas no caminho do plugin CUA oficial;
8. o descarte dos serviços aguarda o stop do Host do Windows;
9. identidade de workspace remoto não provoca nenhum start de Helper local.

Executar:

```powershell
pnpm exec vitest run packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts packages/services/test/cuaPermissionBrokerServiceDispose.test.ts
```

Esperado: falha nos casos de admissão/fábrica de host do Windows.

**Passo 2: Generalizar o tipo de helper padrão sem enfraquecer o macOS**

Alterar o registro de helper padrão para conter:

```ts
host: ManagedCuaProductHelperHost;
macPermissionHost?: CuaHelperHost;
```

Comportamento da fábrica:

```text
darwin -> existing createProductCuaHelperHost(), assigned to both fields
win32 -> createWindowsCuaDevHelperHost(), no macPermissionHost
other -> undefined
```

Rodar `reapOrphanedHelpers()` somente no darwin. A limpeza no Windows é posse do filho + watchdog do PID do pai.

**Passo 3: Preservar as fronteiras do serviço de permissões do macOS**

`getStatus()` e o onboarding de permissões continuam usando `macPermissionHost` e permanecem indisponíveis no Windows. `getHelperStatus()` pode reportar o estado em execução do Helper de desenvolvimento do Windows, mas não pode afirmar que permissões do macOS estão disponíveis.

Nenhuma mudança de UI faz parte desta task.

**Passo 4: Verificar suítes focadas e de regressão**

Executar:

```powershell
pnpm exec vitest run packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts packages/services/test/cuaPermissionBrokerServiceDispose.test.ts packages/services/test/cuaPermissionService.test.ts packages/services/test/cuaPermissionBrokerHelperHost.test.ts packages/services/test/cuaPermissionBrokerProductMcpResolver.test.ts
pnpm typecheck
pnpm lint
```

Esperado: passa.

**Passo 5: Commit**

```powershell
git add packages/services/src/node.ts packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts packages/services/test/cuaPermissionBrokerServiceDispose.test.ts
git diff --cached --check
git commit -m "feat(cua): enable Windows source Helper"
```

---

### Task 7: Provar o Helper real de código-fonte e a fronteira do plugin oficial

**Arquivos:**

- Add: `C:\Users\dev\z-code\packages\services\test\windowsCuaDevHelper.integration.test.ts`
- Add: `C:\Users\dev\z-code\docs\cua\windows-source-development.md`

**Passo 1: Escrever o teste de integração real opt-in**

O teste roda somente quando tudo for verdadeiro:

```text
process.platform === "win32"
ZCODE_CUA_DEV_ROOT is set
dist/windows-helper.js exists
build/Release/ax_native.node exists
```

Ele deve:

1. construir o Host real do Windows;
2. iniciar o filho real;
3. verificar o health e `broker_info`;
4. chamar o método de broker somente-leitura `list_apps` e receber um array;
5. chamar `buildCuaProductHelperAgentEnv()` e afirmar os três valores oficiais de env;
6. afirmar que o token está ausente da linha de comando do filho e dos logs capturados;
7. parar o Host e provar que o filho encerra.

Executar:

```powershell
$env:ZCODE_CUA_DEV_ROOT='C:\Users\dev\zcode-cua'
pnpm exec vitest run packages/services/test/windowsCuaDevHelper.integration.test.ts
```

Esperado: passa com o named pipe e o addon reais.

**Passo 2: Verificar o comportamento fail-closed do plugin oficial**

Rodar os testes existentes do plugin com:

```powershell
pnpm --filter @zcode/zcode-cua-plugin test
```

Esperado:

- sem credenciais de broker -> zero tools CUA utilizáveis / resultado explícito de indisponibilidade;
- credenciais válidas injetadas pelo Host -> config do servidor oficial mantida;
- nenhum teste aceita um token vindo de config de plugin escrita pelo usuário.

Não atualizar a dependência do plugin nem a superfície de tools neste milestone, a menos que uma incompatibilidade real e comprovada de protocolo prove que é necessário.

**Passo 3: Escrever o runbook de desenvolvimento**

`docs/cua/windows-source-development.md` deve incluir:

```powershell
cd C:\Users\dev\zcode-cua
pnpm install
pnpm rebuild:native
pnpm build
pnpm test

cd C:\Users\dev\z-code
$env:ZCODE_CUA_DEV_MODE='1'
$env:ZCODE_CUA_DEV_ROOT='C:\Users\dev\zcode-cua'
pnpm dev:desktop:prod
```

Documentar também:

- o plugin oficial `zcode-cua` precisa estar habilitado;
- mudanças no código-fonte exigem recompilar o `zcode-cua`, enquanto o empacotamento de produto do ZCode não é necessário;
- árvore de processos esperada e forma do named pipe;
- locais de log e regra de redação de token;
- comportamento fail-closed no lock screen/Session 0 do Windows;
- limitação da Phase 1: árvore AX presente, screenshots ausentes;
- verificação de shutdown limpo.

**Passo 4: Verificar e commitar**

Executar:

```powershell
pnpm exec vitest run packages/services/test/windowsCuaDevHelper.integration.test.ts
pnpm typecheck
pnpm lint
```

Esperado: passa.

```powershell
git add packages/services/test/windowsCuaDevHelper.integration.test.ts docs/cua/windows-source-development.md
git diff --cached --check
git commit -m "test(cua): verify Windows source runtime"
```

---

### Task 8: Executar a aceitação ao vivo no Bloco de Notas e os gates finais

**Arquivos:**

- Nenhum novo arquivo de implementação por padrão.
- Se a evidência de runtime expor um bug, primeiro adicionar um teste focado que falhe no repositório dono, depois fazer a correção mínima e adicionar um comentário em chinês explicando a causa raiz.

**Passo 1: Começar a partir de builds limpos**

Executar:

```powershell
cd C:\Users\dev\zcode-cua
pnpm rebuild:native
pnpm build
pnpm typecheck
pnpm lint
pnpm test

cd C:\Users\dev\z-code
pnpm typecheck
pnpm lint
pnpm exec vitest run packages/services/test/windowsCuaDevRuntime.test.ts packages/services/test/windowsCuaDevHelperHost.test.ts packages/services/test/windowsCuaDevHelper.integration.test.ts packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts packages/services/test/cuaPermissionBrokerServiceDispose.test.ts
```

Esperado: todos os comandos saem com `0`.

**Passo 2: Iniciar o desenvolvimento do ZCode a partir do código-fonte**

```powershell
$env:ZCODE_CUA_DEV_MODE='1'
$env:ZCODE_CUA_DEV_ROOT='C:\Users\dev\zcode-cua'
pnpm dev:desktop:prod
```

Confirmar antes de invocar uma task de CUA:

- nenhum Helper é criado para hosts remotos;
- a admissão local do plugin oficial cria no máximo uma geração de Helper;
- a linha de comando do processo tem entry/pipe/parent PID e nenhum token;
- o pipe é aleatório sob `\\.\pipe\zcode-cua-helper-*`.

**Passo 3: Executar o cenário no Bloco de Notas**

Usar uma task do ZCode para:

1. chamar `list_apps`;
2. abrir `notepad.exe` sem shell;
3. obter o app/janela do Bloco de Notas e o estado de UIA;
4. selecionar o editor pelo alvo de elemento;
5. clicar no editor;
6. digitar `ZCode Windows CUA Phase 1`;
7. reobservar e verificar o texto através de UIA;
8. pressionar `Ctrl+A`, digitar o texto substituto e verificar novamente.

Aceitação:

- targeting por elemento é preferível a coordenadas brutas;
- clique/digitação retornam estado atualizado;
- nenhum screenshot é necessário na Phase 1;
- nenhuma ação é reproduzida automaticamente após uma falha ambígua no pós-envio.

**Passo 4: Exercitar recuperação e teardown**

Com o ZCode aberto:

1. encerrar o processo do Helper;
2. aguardar a recuperação de vivacidade;
3. verificar se a próxima admissão CUA oficial recebe um novo pipe/token e a mesma authority do Host;
4. fechar o ZCode;
5. confirmar que nenhum filho Helper do Windows permanece e que o pipe antigo não pode ser conectado.

Esperado: nenhum Helper órfão e nenhum reuso de credencial obsoleta.

**Passo 5: Inspecionar a evidência de runtime**

Checar os logs de serviço e o rollout da task:

- startup, ready, health, restart e stop de lifecycle presentes em `info`/`warn`;
- detalhes de broker por requisição apenas em `debug`;
- nenhum bearer token aparece;
- nenhum comando de macOS, Helper.app, TCC, SSH, WSL ou caminho Docker é tentado.

Se a primeira tentativa ao vivo falhar, coletar o log de serviço real, o stderr do filho, a árvore de processos e o erro do broker antes de mudar código.

**Passo 6: Rodar os gates obrigatórios de todo o repositório**

Em `C:\Users\dev\z-code`:

```powershell
pnpm typecheck
pnpm lint
pnpm test:unit:affected
```

Em `C:\Users\dev\zcode-cua`:

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Esperado: todos saem com `0`.

**Passo 7: Revisar o histórico de commits e as working trees**

Executar:

```powershell
git -C C:\Users\dev\z-code status --short
git -C C:\Users\dev\zcode-cua status --short
git -C C:\Users\dev\z-code log --oneline -5
git -C C:\Users\dev\zcode-cua log --oneline -5
```

Esperado: ambas as working trees limpas; cada task tem um Conventional Commit revisável de forma independente.

Não criar tag, publicar, enviar release, construir pacote assinado nem fechar Phase 2/3 neste plano.

---

## Critérios de conclusão

- `zcode-cua` compila `dist/windows-helper.js` e `build/Release/ax_native.node` no Windows.
- O Host local do ZCode inicia exatamente um Helper Windows sob demanda usando `process.execPath`.
- O Helper recebe o token apenas por env controlado e publica credenciais somente após o health passar.
- O plugin oficial obtém pipe/token/authority; configs de CUA escritas por atacantes ou sem broker permanecem fail-closed.
- Observar/clicar/digitar/reobservar via UIA no Bloco de Notas funciona sem screenshots.
- O restart do Helper rotaciona pipe/token; a authority do Host permanece estável.
- A saída do ZCode não deixa filho Helper.
- As suítes focadas de regressão de macOS e Linux passam.
- `pnpm typecheck` e `pnpm lint` do ZCode passam.
- Typecheck, lint, suíte completa de testes e build do `zcode-cua` passam no Windows.
- WGC, scroll/drag/move/down/up, isolamento do worker UIA e empacotamento de produto permanecem explicitamente adiados para planos separados de Phase 2/3.