# Plano de Implementação do Indicador de Operação CUA no Windows

> **Para trabalhadores agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** no Windows local, após um turn de Computer Use iniciar de fato a primeira ferramenta de desktop real, exibir no topo um aviso "ZCode 正在操作电脑" que não rouba o foco, é atravessado pelo mouse e não entra na captura de tela, e ocultá-lo de forma confiável no turn/Host/runtime em estado terminal.

**Arquitetura:** `ZCodeAgentService`, após a validação de protocolo, a normalização de seq e a deduplicação live, entrega o evento à máquina de estados pura `CuaOperationTurnTracker`; apenas o Host Windows desktop-local reporta as transições de estado por mensagens estritas Host→Main. O Desktop Main agrega chaves ativas por `UtilityProcess source + workspaceKey + sessionId + turnId` e projeta a UI em uma `BrowserWindow` transparente independente; o estado não entra no Renderer, no snapshot de task, no broadcast nem na cadeia mobile replayable.

**Stack técnico:** TypeScript 6, Zod, Vitest 4, Electron 41 `BrowserWindow`/`screen`, Services `createServiceLogger`, postMessage de `utilityProcess` do Host existente.

## Restrições globais

- Só cria o aviso superior no Windows desktop-local; macOS, Linux, workspace remoto, server e Web comum não criam.
- O `/remote` do celular, ao reaproveitar o mesmo Host desktop-local, pode exibir o aviso na tela física do Windows, mas não adiciona UI no celular nem eventos replayable.
- A identidade de ferramenta só aceita os nomes canônicos `mcp__computer-use__*` e os oficiais namespaced `mcp__plugin_zcode-cua_computer-use__*`; não cria a cadeia `computer_use`.
- `workspaceKey = workspaceIdentity?.trim() || workspacePath`; a IO/exibição de caminhos continua usando `workspacePath`.
- `wait` e `request_access` não ativam; `stop_computer_control` limpa imediatamente a sessão atual.
- result/error de uma única ferramenta não oculta; só `turn.completed`, `turn.failed`, `session.closed`, dispose de runtime/workspace, exit do Host e quit do app encerram.
- A camada flutuante precisa de `focusable: false`, `skipTaskbar: true`, `setIgnoreMouseEvents(true)` e `setContentProtection(true)`.
- Não modifica o broker/wire protocol nativo do `zcode-cua` e não adiciona dependências.
- Para comportamento novo/modificado, observa-se primeiro o teste falhando, depois escreve-se a implementação mínima; ao final executam-se `pnpm typecheck` e `pnpm lint`.

---

## Estrutura de arquivos

- Create `packages/services/src/zcode-agent/cuaOperationTurnTracker.ts`: máquina de estados pura de turn/session/workspace e tipos de reporter.
- Create `packages/services/test/cuaOperationTurnTracker.test.ts`: testes de ferramenta canônica, idempotência, estado terminal e isolamento do tracker.
- Modify `packages/services/src/zcode-agent/zcodeAgentService.ts`: conecta o tracker após a dedup live e limpa nas fronteiras de runtime/dispose.
- Modify `packages/services/test/zcodeAgentService.test.ts`: teste de integração real notification→dedup→reporter.
- Modify `packages/services/src/node.ts`: expõe o ponto de injeção do reporter e só permite a entrada de autoridade `desktop-local`.
- Modify `packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts`: teste do gate de autoridade.
- Modify `packages/shared/src/channels.ts`: nova constante de tipo de resposta do Host.
- Modify `packages/shared/src/validation.ts`: novo schema estrito `cua-operation-state` e tipo exportado.
- Modify `packages/shared/test/validation.test.ts`: testes de aceitação/recusa do payload do Host.
- Modify `packages/desktop/src/host/index.ts`: reporter do Host local Windows → parentPort.
- Modify `packages/desktop/src/main/desktopHostProcess.ts`: encaminha o estado após validar e limpa o source no exit do child.
- Create `packages/desktop/src/main/windowsCuaOperationIndicator.ts`: agregação de source, ciclo de vida da janela, posicionamento, copy e animação.
- Create `packages/desktop/test/windowsCuaOperationIndicator.test.ts`: testes de propriedades da janela, agregação, DPI/display, locale, hide/recreate.
- Modify `packages/desktop/test/desktopHostProcess.test.ts`: testes de roteamento de mensagens do Host e limpeza no exit.
- Modify `packages/desktop/src/main/index.ts`: instancia o indicator, liga os dois pontos de entrada de spawn do Host e sincroniza locale/app quit.
- Modify `apps/dev-docs/src/data/productCapabilityMap.ts`: marca o indicator de nível de turn do Windows como capacidade atual e adiciona a aresta de estado do Host local.
- Modify `apps/dev-docs/test/capabilityMapOfficeComputerUse.test.ts`: teste antideriva do grafo de capacidades.
- Modify `docs/product-capability-map-office-computer-use.md`: atualiza o fato atual do Windows, o owner de estado e o diagrama de cadeia.

---

### Tarefa 1: Contrato estrito de estado Host→Main

**Arquivos:**

- Modify: `packages/shared/src/channels.ts`
- Modify: `packages/shared/src/validation.ts`
- Test: `packages/shared/test/validation.test.ts`

**Interfaces:**

- Produces: `HostResponseTypes.CuaOperationState`
- Produces: `hostCuaOperationStateResponseSchema`
- Produces: `HostCuaOperationStateResponse`

- [ ] **Passo 1: Escrever os testes de schema que falham**

Adicionar um teste de aceitação e uma tabela de payloads inválidos:

```ts
it("accepts a strict CUA operation state payload", () => {
  expect(
    hostResponseMessageSchema.safeParse({
      type: HostResponseTypes.CuaOperationState,
      active: true,
      sessionId: "sess-1",
      turnId: "turn-1",
      workspacePath: "C:\\repo",
      workspaceIdentity: "local:test",
    }).success,
  ).toBe(true);
});

it.each([{ active: "true" }, { sessionId: "" }, { turnId: "" }, { workspacePath: "" }])(
  "rejects invalid CUA operation state payload %#",
  (override) => {
    expect(
      hostResponseMessageSchema.safeParse({
        type: "cua-operation-state",
        active: true,
        sessionId: "sess-1",
        turnId: "turn-1",
        workspacePath: "C:\\repo",
        ...override,
      }).success,
    ).toBe(false);
  },
);
```

- [ ] **Passo 2: Rodar RED**

Run: `pnpm exec vitest run packages/shared/test/validation.test.ts`

Expected: FAIL porque `HostResponseTypes.CuaOperationState` e o membro da união discriminada não existem.

- [ ] **Passo 3: Adicionar o contrato estrito mínimo**

Adicionar a constante de resposta e o schema:

```ts
CuaOperationState: "cua-operation-state",

export const hostCuaOperationStateResponseSchema = z.object({
  type: z.literal("cua-operation-state"),
  active: z.boolean(),
  sessionId: nonEmptyStringSchema,
  turnId: nonEmptyStringSchema,
  workspacePath: nonEmptyStringSchema,
  workspaceIdentity: nonEmptyStringSchema.optional(),
});

export type HostCuaOperationStateResponse = z.infer<
  typeof hostCuaOperationStateResponseSchema
>;
```

Inserir o schema em `hostResponseMessageSchema`.

- [ ] **Passo 4: Rodar GREEN**

Run: `pnpm exec vitest run packages/shared/test/validation.test.ts`

Expected: PASS.

---

### Tarefa 2: Tracker CUA de nível de turn e wiring nos Services

**Arquivos:**

- Create: `packages/services/src/zcode-agent/cuaOperationTurnTracker.ts`
- Create: `packages/services/test/cuaOperationTurnTracker.test.ts`
- Modify: `packages/services/src/zcode-agent/zcodeAgentService.ts`
- Modify: `packages/services/test/zcodeAgentService.test.ts`
- Modify: `packages/services/src/node.ts`
- Modify: `packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts`

**Interfaces:**

- Consumes: `ZCodeSessionEvent`, `ZCodeAgentWorkspaceTarget`, `resolveWorkspaceKey`
- Produces: `CuaOperationState`, `CuaOperationStateReporter`, `CuaOperationTurnTracker`
- Produces: `createCuaOperationTurnTracker({ reporter })`
- Produces: `shouldEnableCuaOperationStateReporter({ serviceAuthorityMode, hasReporter })`

- [ ] **Passo 1: Escrever os testes de comportamento do tracker que falham**

Usar um tracker real com um reporter em array e fixtures de evento válidos pelo protocolo. Cobrir estas asserções separadas:

```ts
tracker.accept(workspace, turnStarted("turn-1"));
tracker.accept(workspace, toolScheduled("turn-1", "call-1", "mcp__computer-use__left_click"));
tracker.accept(workspace, toolStarted("turn-1", "call-1"));
expect(states).toEqual([{ active: true, sessionId: "sess-1", turnId: "turn-1", workspacePath }]);

tracker.accept(workspace, toolResult("turn-1", "call-1"));
expect(states).toHaveLength(1);
tracker.accept(workspace, turnCompleted("turn-1"));
expect(states.at(-1)).toMatchObject({ active: false, turnId: "turn-1" });
```

Testar também o fallback de started com toolName, started CUA duplicado, ferramenta oficial namespaced, rejeição de underscore, rejeição de MCP comum, `wait`/`request_access`, `stop_computer_control`, substituição por novo turn, failed/session.closed, turnId ausente, isolamento por workspaceIdentity, `clearWorkspaceKey` e `clearAll`.

- [ ] **Passo 2: Rodar tracker RED**

Run: `pnpm exec vitest run packages/services/test/cuaOperationTurnTracker.test.ts`

Expected: FAIL porque o módulo do tracker não existe.

- [ ] **Passo 3: Implementar o tracker mínimo**

Implementar a API pública:

```ts
export interface CuaOperationState {
  active: boolean;
  sessionId: string;
  turnId: string;
  workspacePath: string;
  workspaceIdentity?: string;
}

export interface CuaOperationStateReporter {
  onStateChanged(event: CuaOperationState): void;
}

export interface CuaOperationTurnTracker {
  accept(workspace: ZCodeAgentWorkspaceTarget, event: ZCodeSessionEvent): void;
  clearWorkspaceKey(workspaceKey: string): void;
  clearAll(): void;
}
```

O tracker armazena o turn atual por workspace/session, os nomes de ferramenta agendados por tool call e os registros de turn ativo. Ele reporta apenas transições de estado. O casamento de ferramenta é por prefixo exato:

```ts
const prefixes = ["mcp__computer-use__", "mcp__plugin_zcode-cua_computer-use__"] as const;
```

`wait` e `request_access` retornam sem ativar; `stop_computer_control` limpa a sessão. Os métodos terminais e de limpeza emitem inativo antes de apagar os registros. Adicionar comentários em chinês explicando que resultados de ferramenta não podem encerrar um turn e por que aliases com underscore são deliberadamente excluídos.

- [ ] **Passo 4: Rodar tracker GREEN**

Run: `pnpm exec vitest run packages/services/test/cuaOperationTurnTracker.test.ts`

Expected: PASS.

- [ ] **Passo 5: Escrever os testes de autoridade e integração que falham**

Adicionar asserções em tabela para:

```ts
expect(
  shouldEnableCuaOperationStateReporter({
    serviceAuthorityMode: "desktop-local",
    hasReporter: true,
  }),
).toBe(true);
expect(
  shouldEnableCuaOperationStateReporter({
    serviceAuthorityMode: "desktop-attached-remote",
    hasReporter: true,
  }),
).toBe(false);
expect(
  shouldEnableCuaOperationStateReporter({
    serviceAuthorityMode: "standalone-server",
    hasReporter: true,
  }),
).toBe(false);
```

Em `zcodeAgentService.test.ts`, injetar um reporter na fixture de serviço, entregar notifications de protocolo e afirmar que o reporter recebe ativo e então inativo apenas depois da dedup live. Se o custo da fixture tornar esse teste isolado por processo, mantê-lo no projeto `zcodeAgentService.test.ts` existente em vez de mockar o tracker.

- [ ] **Passo 6: Rodar integração RED**

Run: `pnpm exec vitest run packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts packages/services/test/zcodeAgentService.test.ts`

Expected: FAIL porque o gate de autoridade, as opções e o wiring não existem.

- [ ] **Passo 7: Ligar o tracker após validação e dedup live**

Estender `CreateZCodeAgentServiceOptions` e as opções de `createLocalServices` com `cuaOperationStateReporter?: CuaOperationStateReporter`. Criar o tracker apenas quando o helper de autoridade do node retornar verdadeiro, passá-lo para `createZCodeAgentService` e chamá-lo imediatamente depois de `shouldDeliverLiveSessionEvent` ter sucesso:

```ts
cuaOperationTurnTracker?.accept(workspace, normalizedEvent);
emitSessionEvent(workspace, normalizedEvent.sessionId, {
  type: "session.event",
  event: normalizedEvent,
});
```

Limpar por `workspaceKey` a partir de `processManager.onRuntimeRestarted` e `disposeWorkspace`; chamar `clearAll()` a partir de `disposeLocalState`. Usar `createServiceLogger("cua-operation-turn")`: diagnósticos por evento são `debug`, transições de estado são `info`.

- [ ] **Passo 8: Rodar integração GREEN**

Run: `pnpm exec vitest run packages/services/test/cuaOperationTurnTracker.test.ts packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts packages/services/test/zcodeAgentService.test.ts`

Expected: PASS.

---

### Tarefa 3: Relato do Host Windows e roteamento no Main

**Arquivos:**

- Modify: `packages/desktop/src/host/index.ts`
- Modify: `packages/desktop/src/main/desktopHostProcess.ts`
- Modify: `packages/desktop/test/desktopHostProcess.test.ts`

**Interfaces:**

- Consumes: `HostResponseTypes.CuaOperationState`, `HostCuaOperationStateResponse`
- Produces dependency callbacks:

```ts
onCuaOperationStateChanged?: (
  source: ElectronUtilityProcess,
  event: HostCuaOperationStateResponse,
) => void;
onCuaOperationStateSourceExited?: (source: ElectronUtilityProcess) => void;
```

- [ ] **Passo 1: Escrever os testes de roteamento que falham**

Mockar `utilityProcess.fork()` com `MockUtilityProcess`, chamar `spawnHostProcess`, emitir uma mensagem `cua-operation-state` válida e afirmar que o callback recebe exatamente o source do child e o payload. Emitir `exit` do child e afirmar `onCuaOperationStateSourceExited(child)` uma única vez. Emitir um payload inválido e afirmar que nenhum callback é chamado.

- [ ] **Passo 2: Rodar roteamento RED**

Run: `pnpm exec vitest run packages/desktop/test/desktopHostProcess.test.ts`

Expected: FAIL porque as dependências de callback e o ramo de resposta não existem.

- [ ] **Passo 3: Adicionar reporter e roteamento**

No Host definir um reporter que satisfaça a opção de `createLocalServices` e postar:

```ts
parentPort?.postMessage({
  type: HostResponseTypes.CuaOperationState,
  ...event,
});
```

Passá-lo apenas dentro de `InitLocal` e apenas quando `process.platform === "win32"`. No Main, após a validação Zod, rotear a mensagem com o child como source. No handler de `exit` do child existente, chamar a limpeza do source antes de apagar os maps. Adicionar comentários em chinês explicando por que o main não faz parse de eventos de sessão e por que o exit do Host é uma fronteira autoritativa de fail-hidden.

- [ ] **Passo 4: Rodar roteamento GREEN**

Run: `pnpm exec vitest run packages/desktop/test/desktopHostProcess.test.ts`

Expected: PASS.

---

### Tarefa 4: Janela nativa do indicador no Windows

**Arquivos:**

- Create: `packages/desktop/src/main/windowsCuaOperationIndicator.ts`
- Create: `packages/desktop/test/windowsCuaOperationIndicator.test.ts`

**Interfaces:**

- Consumes: `HostCuaOperationStateResponse`, `Locale`, Electron `BrowserWindow` e `screen`
- Produces:

```ts
export interface WindowsCuaOperationIndicator {
  handleState(source: object, event: HostCuaOperationStateResponse): void;
  clearSource(source: object): void;
  refreshContent(): void;
  dispose(): void;
}

export interface WindowsCuaOperationIndicatorWindow {
  readonly webContents: Pick<BrowserWindow["webContents"], "executeJavaScript">;
  destroy(): void;
  hide(): void;
  isDestroyed(): boolean;
  loadURL(url: string): Promise<void>;
  on(event: "closed", listener: () => void): this;
  setBounds(bounds: Rectangle): void;
  setContentProtection(enable: boolean): void;
  setIgnoreMouseEvents(ignore: boolean): void;
  showInactive(): void;
}

export function createWindowsCuaOperationIndicator(options: {
  platform?: NodeJS.Platform;
  getLocale: () => Locale;
  logger: { warn(...args: unknown[]): void; debug(...args: unknown[]): void };
  createWindow?: (options: BrowserWindowConstructorOptions) => WindowsCuaOperationIndicatorWindow;
  getCursorScreenPoint?: () => Point;
  getDisplayNearestPoint?: (point: Point) => Pick<Display, "workArea">;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancelSchedule?: (timer: ReturnType<typeof setTimeout>) => void;
}): WindowsCuaOperationIndicator;
```

- [ ] **Passo 1: Escrever os testes do indicador que falham**

Usar dependências fakes de janela/screen injetadas e timers falsos. Afirmar separadamente:

1. não-Windows é um no-op;
2. o primeiro active cria com `alwaysOnTop`, `focusable: false`, `frame: false`, `resizable: false`, `show: false`, `skipTaskbar: true`, `transparent: true`;
3. a criação chama `setIgnoreMouseEvents(true)` e `setContentProtection(true)`;
4. active repetido é idempotente;
5. dois sources/turns permanecem visíveis até o inactive/clearSource final;
6. a posição é `workArea.x + (workArea.width - width) / 2`, `workArea.y + 12`;
7. zh-CN e en-US renderizam o copy exato aprovado;
8. inactive executa o estado de saída, espera 120ms e então oculta;
9. active durante a saída cancela o hide;
10. um `closed` inesperado agenda uma reconciliação quando está active;
11. falha de `loadURL` apenas avisa e nunca lança para dentro do tratamento de estado do CUA;
12. `dispose` destrói e impede recriação.

- [ ] **Passo 2: Rodar indicador RED**

Run: `pnpm exec vitest run packages/desktop/test/windowsCuaOperationIndicator.test.ts`

Expected: FAIL porque o módulo do indicador não existe.

- [ ] **Passo 3: Implementar a projeção mínima de janela**

Criar uma única `BrowserWindow` preguiçosa. A data URL gerada contém uma CSP, cores semânticas light/dark via `prefers-color-scheme`, pílula compacta de 40px, animação de três pontos, entrada de 140ms/saída de 120ms e `prefers-reduced-motion`. Usar uma data URL em base64 para que o copy em chinês e a CSP não dependam de escaping de URL.

A chave ativa é:

```ts
const workspaceKey = event.workspaceIdentity?.trim() || event.workspacePath;
const turnKey = `${workspaceKey}\0${event.sessionId}\0${event.turnId}`;
```

Armazená-la sob o objeto source. `showInactive()` só é chamado depois que `loadURL()` resolve e o conjunto agregado ainda não está vazio. Falhas registram `warn` e nunca rejeitam para dentro da execução do CUA. `clearSource` remove todas as chaves daquele child. `closed` preserva o estado agregado e agenda uma reconciliação. `setContentProtection(true)` é obrigatório para excluir a captura do Windows.

- [ ] **Passo 4: Rodar indicador GREEN**

Run: `pnpm exec vitest run packages/desktop/test/windowsCuaOperationIndicator.test.ts`

Expected: PASS.

---

### Tarefa 5: Composição do Main, Locale/App Quit e a verdade das capacidades

**Arquivos:**

- Modify: `packages/desktop/src/main/index.ts`
- Modify: `apps/dev-docs/src/data/productCapabilityMap.ts`
- Modify: `apps/dev-docs/test/capabilityMapOfficeComputerUse.test.ts`
- Modify: `docs/product-capability-map-office-computer-use.md`

**Interfaces:**

- Consumes: `createWindowsCuaOperationIndicator`
- Conecta os dois pontos de dependência de `spawnHostProcess` ao mesmo singleton.

- [ ] **Passo 1: Escrever as asserções do grafo de capacidades que falham**

Afirmar que o escopo do nó `computer-use-task-ux` contém `Windows 顶部 turn 级操作提示`, que o owner é `Desktop Main native projection + Renderer tool projection`, e que existe uma aresta de estado de `local-host` para `computer-use-task-ux` rotulada `Windows CUA turn 状态`.

- [ ] **Passo 2: Rodar capacidade RED**

Run: `pnpm exec vitest run apps/dev-docs/test/capabilityMapOfficeComputerUse.test.ts`

Expected: FAIL porque o nó/a aresta ainda descrevem apenas a projeção genérica de ferramenta.

- [ ] **Passo 3: Compor o Main e atualizar a documentação**

Instanciar uma vez ao lado dos maps de Host:

```ts
const windowsCuaOperationIndicator = createWindowsCuaOperationIndicator({
  platform: process.platform,
  getLocale: () => currentApplicationLocale,
  logger,
});
```

Em ambos os objetos de dependência de spawn do Host ligar `handleState` e `clearSource`. Em `applyApplicationLocale`, chamar `refreshContent()` depois de atualizar o locale. No início de `prepareAppQuit`, chamar `dispose()` para que o aviso desapareça antes de esperar a limpeza do Host.

Atualizar o nó/a aresta de capacidade e o documento de fato atual. Preservar a afirmação de que pausa/takeover/vídeo ao vivo permanecem planejados, e documentar esta cadeia de estado exata:

```text
validated live session event
        -> desktop-local Host turn tracker
        -> strict Host→Main cua-operation-state
        -> capture-excluded Windows BrowserWindow
```

- [ ] **Passo 4: Rodar a suíte focada composta**

Run:

```powershell
pnpm exec vitest run packages/shared/test/validation.test.ts packages/services/test/cuaOperationTurnTracker.test.ts packages/services/test/cuaPermissionBrokerProductAgentEnv.test.ts packages/services/test/zcodeAgentService.test.ts packages/desktop/test/desktopHostProcess.test.ts packages/desktop/test/windowsCuaOperationIndicator.test.ts apps/dev-docs/test/capabilityMapOfficeComputerUse.test.ts
```

Expected: PASS com zero testes falhando e sem erros não tratados.

---

### Tarefa 6: Verificação do repositório e commit

**Arquivos:**

- Revisar todos os caminhos listados acima.

- [ ] **Passo 1: Rodar as verificações de formatação/higiene do diff**

Run: `git diff --check`

Expected: exit 0.

- [ ] **Passo 2: Rodar os testes unitários afetados**

Run: `pnpm test:unit:affected`

Expected: exit 0. Se uma baseline Windows preexistente e não relacionada falhar, registrar os nomes exatos de arquivo/teste; qualquer nova falha de CUA/shared/desktop/dev-docs bloqueia a conclusão.

- [ ] **Passo 3: Rodar o typecheck obrigatório**

Run: `pnpm typecheck`

Expected: exit 0.

- [ ] **Passo 4: Rodar o lint obrigatório**

Run: `pnpm lint`

Expected: exit 0.

- [ ] **Passo 5: Revisar o diff final contra a spec**

Run:

```powershell
git status --short
git diff --stat
git diff -- packages/shared packages/services packages/desktop apps/dev-docs docs/product-capability-map-office-computer-use.md
```

Confirmar que todo critério de aceitação de `docs/superpowers/specs/2026-08-04-windows-cua-operation-indicator-design.md` tem evidência em código ou teste, e confirmar que nenhum produtor/detector `computer_use` foi adicionado.

- [ ] **Passo 6: Commitar a implementação**

Run:

```powershell
git add -- packages/shared packages/services packages/desktop apps/dev-docs docs/product-capability-map-office-computer-use.md docs/superpowers/plans/2026-08-04-windows-cua-operation-indicator.md
git diff --cached --check
git commit -m "feat(cua): show Windows operation indicator"
```

Expected: um Conventional Commit, sem push.