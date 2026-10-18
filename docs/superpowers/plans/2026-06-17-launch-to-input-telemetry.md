# Plano de Implementação: Telemetria de Tempo de Inicialização até o Momento de Poder Digitar

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** Dividir a cadeia de inicialização do desktop "criação do processo → usuário consegue digitar" em 7 segmentos independentes de tempo, reportados via ARMS, substituindo o `perf_ui_first_screen` que media apenas o segmento de renderização do renderer.

**Architecture:** O processo main registra quatro marcadores de milissegundos epoch (âncora `process.getCreationTime()` + três `Date.now()`), injetados no renderer pela query string do `loadURL` da janela principal; o renderer registra mais três instantes (execução do bundle / commit do React / liberação do portão de startup) e, no momento da liberação do portão, calcula uniformemente os 7 valores de diferença e emite um evento ARMS para cada um. A lógica de serialização/análise/cálculo fica centralizada em funções puras para facilitar testes unitários.

**Tech Stack:** TypeScript, Electron (main/preload/renderer), React, Vitest. Reutiliza a cadeia existente `reportArmsCustomEvent` → IPC → `armsRum.sendCustom`.

## Restrições globais

- O `group` dos eventos é uniformemente `"ui_perf"` (constante `UI_PERF_ARMS_GROUP`, já existente, reutilizada).
- Todos os `value` são fixados como inteiros não negativos em ms por `Math.max(0, Math.round(...))`.
- A falha da埋点 nunca bloqueia o fluxo principal de startup: todos os internals de reporte usam try/catch, apenas `logger.warn`.
- Se a duração total `> LAUNCH_TO_INPUT_SANITY_MAX_MS` (300000), o lote inteiro é descartado e não é reportado.
- Âncora ausente (`getCreationTime()` retorna null / query sem marks parseados) descarta o lote inteiro.
- Startup sem login (WelcomeScreen) não reporta a cadeia completa (a premissa "pode digitar" não se cumpre).
- Cada processo renderer reporta apenas uma vez por cold start.
- Prefixo do nome do parâmetro de query do loadURL é a constante `LAUNCH_MARKS_QUERY_KEY = "zcodeLaunchMarks"`.
- Execução de testes: unitários com `pnpm exec vitest run <file>`; verificação de tipos `pnpm typecheck`.

---

### Tarefa 1: Serialização/análise compartilhada de launch marks (`@zcode/shared`)

**Arquivos:**
- Criar: `packages/shared/src/launchMarks.ts`
- Modificar: `packages/shared/src/index.ts:111` (acrescentar após a exportação de `collectTelemetryRendererContext`)
- Teste: `packages/shared/test/launchMarks.test.ts`

**Interfaces:**
- Produz:
  - `interface LaunchMarks { createdAt: number; mainStart: number; appReady: number; loadUrl: number }`
  - `const LAUNCH_MARKS_QUERY_KEY = "zcodeLaunchMarks"`
  - `serializeLaunchMarks(marks: LaunchMarks): string` — retorna string URL-safe (JSON)
  - `parseLaunchMarks(raw: string | null | undefined): LaunchMarks | null` — retorna null para entrada inválida/campos faltando

- [ ] **Passo 1: Escrever o teste que falha**

```ts
// packages/shared/test/launchMarks.test.ts
import { describe, expect, it } from "vitest";
import {
  LAUNCH_MARKS_QUERY_KEY,
  parseLaunchMarks,
  serializeLaunchMarks,
} from "../src/launchMarks.js";

describe("launchMarks", () => {
  const marks = { createdAt: 1000, mainStart: 1100, appReady: 1300, loadUrl: 1500 };

  it("round-trips through serialize/parse", () => {
    expect(parseLaunchMarks(serializeLaunchMarks(marks))).toEqual(marks);
  });

  it("query key 常量稳定", () => {
    expect(LAUNCH_MARKS_QUERY_KEY).toBe("zcodeLaunchMarks");
  });

  it("非法输入返回 null", () => {
    expect(parseLaunchMarks(null)).toBeNull();
    expect(parseLaunchMarks(undefined)).toBeNull();
    expect(parseLaunchMarks("not-json")).toBeNull();
    expect(parseLaunchMarks(JSON.stringify({ createdAt: 1 }))).toBeNull();
  });

  it("字段非数字返回 null", () => {
    expect(
      parseLaunchMarks(JSON.stringify({ createdAt: "x", mainStart: 1, appReady: 1, loadUrl: 1 })),
    ).toBeNull();
  });
});
```

- [ ] **Passo 2: Executar o teste para verificar que falha**

Executar: `pnpm exec vitest run packages/shared/test/launchMarks.test.ts`
Esperado: FAIL (`Cannot find module ../src/launchMarks.js`)

- [ ] **Passo 3: Escrever a implementação mínima**

```ts
// packages/shared/src/launchMarks.ts

/** main 进程采集的四个启动时刻（epoch 毫秒）。renderer 据此计算分阶段耗时。 */
export interface LaunchMarks {
  /** process.getCreationTime()：进程创建（锚点 T0） */
  createdAt: number;
  /** main/index.ts 模块顶部 Date.now()（T1） */
  mainStart: number;
  /** app.whenReady 回调入口 Date.now()（T2） */
  appReady: number;
  /** 主窗口 loadWindow 内 loadURL 前 Date.now()（T3） */
  loadUrl: number;
}

/** 主窗口 loadURL query string 中携带 launch marks 的参数名 */
export const LAUNCH_MARKS_QUERY_KEY = "zcodeLaunchMarks";

export function serializeLaunchMarks(marks: LaunchMarks): string {
  return JSON.stringify(marks);
}

export function parseLaunchMarks(raw: string | null | undefined): LaunchMarks | null {
  if (raw == null || raw === "") {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== "object") {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  const keys: (keyof LaunchMarks)[] = ["createdAt", "mainStart", "appReady", "loadUrl"];
  const result = {} as LaunchMarks;
  for (const key of keys) {
    const value = record[key];
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return null;
    }
    result[key] = value;
  }
  return result;
}
```

- [ ] **Passo 4: Adicionar a exportação do barrel**

`packages/shared/src/index.ts`, acrescentar após a linha 111 `export { collectTelemetryRendererContext } from "./telemetry.js";`:

```ts
export type { LaunchMarks } from "./launchMarks.js";
export {
  LAUNCH_MARKS_QUERY_KEY,
  parseLaunchMarks,
  serializeLaunchMarks,
} from "./launchMarks.js";
```

- [ ] **Passo 5: Executar o teste para verificar que passa**

Executar: `pnpm exec vitest run packages/shared/test/launchMarks.test.ts`
Esperado: PASS (4 casos)

- [ ] **Passo 6: Commitar**

```bash
git add packages/shared/src/launchMarks.ts packages/shared/src/index.ts packages/shared/test/launchMarks.test.ts
git commit -m "feat(shared): launch marks 序列化/解析"
```

---

### Tarefa 2: Reporte e lógica de cálculo dos 7 segmentos (`uiPerfArmsTelemetry.ts`), descontinuando first_screen

**Arquivos:**
- Modificar: `packages/ui/src/lib/uiPerfArmsTelemetry.ts`
- Modificar: `packages/ui/src/index.ts:84`
- Teste: `packages/ui/test/uiPerfArmsTelemetry.test.ts`

**Interfaces:**
- Consome: `LaunchMarks` de `@zcode/shared` (Tarefa 1)
- Produz:
  - constante `LAUNCH_TO_INPUT_SANITY_MAX_MS = 300000`
  - constantes de nomes de eventos: `UI_PERF_EVENT_LAUNCH_TO_INPUT="perf_ui_launch_to_input"`、`UI_PERF_EVENT_LAUNCH_ELECTRON_INIT="perf_ui_launch_electron_init_ms"`、`UI_PERF_EVENT_LAUNCH_APP_READY="perf_ui_launch_app_ready_ms"`、`UI_PERF_EVENT_LAUNCH_WINDOW="perf_ui_launch_window_ms"`、`UI_PERF_EVENT_LAUNCH_RENDERER_LOAD="perf_ui_launch_renderer_load_ms"`、`UI_PERF_EVENT_LAUNCH_REACT_COMMIT="perf_ui_launch_react_commit_ms"`、`UI_PERF_EVENT_LAUNCH_STARTUP_GATE="perf_ui_launch_startup_gate_ms"`
  - `interface LaunchToInputTimings { marks: LaunchMarks; rendererStart: number; reactCommit: number; inputReady: number; sessionId: string }`
  - `reportUiLaunchToInput(timings: LaunchToInputTimings): void` — calcula os 7 segmentos, faz a validação sentinela e envia ≤7 eventos
- Remove: `UI_PERF_EVENT_FIRST_SCREEN`, `reportUiFirstScreen`, `pendingFirstScreenPayload` e o branch de reenvio dentro de `setUiPerfArmsReporter`

- [ ] **Passo 1: Reescrever o arquivo de teste**

Substituir integralmente `packages/ui/test/uiPerfArmsTelemetry.test.ts` (remover os casos de first_screen / reenvio pendente, adicionar casos de launch; os casos de first_token / message_complete / stream_stall permanecem como estão):

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArmsCustomEventPayload } from "@zcode/shared";
import {
  LAUNCH_TO_INPUT_SANITY_MAX_MS,
  STREAM_STALL_REPORT_THRESHOLD_MS,
  UI_PERF_ARMS_GROUP,
  UI_PERF_EVENT_LAUNCH_ELECTRON_INIT,
  UI_PERF_EVENT_LAUNCH_REACT_COMMIT,
  UI_PERF_EVENT_LAUNCH_STARTUP_GATE,
  UI_PERF_EVENT_LAUNCH_TO_INPUT,
  clearStreamStallTracking,
  clearUiPerfArmsReporterForTest,
  recordStreamChunkArrival,
  reportUiFirstToken,
  reportUiLaunchToInput,
  reportUiMessageComplete,
  setUiPerfArmsReporter,
} from "@/lib/uiPerfArmsTelemetry.js";

function makeReporter() {
  const calls: ArmsCustomEventPayload[] = [];
  return {
    calls,
    reportArmsCustomEvent: vi.fn(async (payload: ArmsCustomEventPayload) => {
      calls.push(payload);
    }),
  };
}

function makeTimings(overrides?: Partial<{ createdAt: number; mainStart: number; appReady: number; loadUrl: number; rendererStart: number; reactCommit: number; inputReady: number }>) {
  const base = {
    createdAt: 1000,
    mainStart: 1600, // electron_init = 600
    appReady: 1780, // app_ready = 180
    loadUrl: 2020, // window = 240
    rendererStart: 2930, // renderer_load = 910
    reactCommit: 3005, // react_commit = 75
    inputReady: 3820, // startup_gate = 815, total = 2820
    ...overrides,
  };
  return {
    marks: {
      createdAt: base.createdAt,
      mainStart: base.mainStart,
      appReady: base.appReady,
      loadUrl: base.loadUrl,
    },
    rendererStart: base.rendererStart,
    reactCommit: base.reactCommit,
    inputReady: base.inputReady,
    sessionId: "sess-1",
  };
}

afterEach(() => {
  clearUiPerfArmsReporterForTest();
  vi.restoreAllMocks();
});

describe("uiPerfArmsTelemetry: 通用", () => {
  it("未注入 reporter 时静默不抛错", () => {
    expect(() => reportUiLaunchToInput(makeTimings())).not.toThrow();
  });

  it("reportUiFirstToken 带 model/talk_id/message_id", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    reportUiFirstToken({ ttftMs: 800, model: "glm-4", talkId: "t1", messageId: "m1" });
    expect(reporter.calls[0]).toMatchObject({
      name: "perf_ui_first_token",
      group: UI_PERF_ARMS_GROUP,
      value: 800,
      properties: { model: "glm-4", talk_id: "t1", message_id: "m1" },
    });
  });

  it("reportUiMessageComplete 带 result", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    reportUiMessageComplete({ durationMs: 5000, result: "success", talkId: "t1", messageId: "m1" });
    expect(reporter.calls[0]).toMatchObject({
      name: "perf_ui_message_complete",
      group: UI_PERF_ARMS_GROUP,
      value: 5000,
      properties: { result: "success", talk_id: "t1", message_id: "m1" },
    });
  });

  it("reporter 抛错被吞掉不向上传播", () => {
    const reporter = {
      reportArmsCustomEvent: vi.fn(() => {
        throw new Error("boom");
      }),
    };
    setUiPerfArmsReporter(reporter);
    expect(() => reportUiLaunchToInput(makeTimings())).not.toThrow();
  });
});

describe("reportUiLaunchToInput: 7 段", () => {
  it("发 7 条，各段 value 正确，total = inputReady - createdAt", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    reportUiLaunchToInput(makeTimings());
    expect(reporter.calls).toHaveLength(7);
    const byName = new Map(reporter.calls.map((c) => [c.name, c]));
    expect(byName.get(UI_PERF_EVENT_LAUNCH_TO_INPUT)).toMatchObject({
      group: UI_PERF_ARMS_GROUP,
      value: 2820,
      properties: { session_id: "sess-1" },
    });
    expect(byName.get(UI_PERF_EVENT_LAUNCH_ELECTRON_INIT)?.value).toBe(600);
    expect(byName.get(UI_PERF_EVENT_LAUNCH_REACT_COMMIT)?.value).toBe(75);
    expect(byName.get(UI_PERF_EVENT_LAUNCH_STARTUP_GATE)?.value).toBe(815);
  });

  it("某段为负（时钟回拨）→ 该段钳为 0，其余正常", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    // appReady 早于 mainStart：app_ready 段为负
    reportUiLaunchToInput(makeTimings({ appReady: 1500, mainStart: 1600 }));
    const byName = new Map(reporter.calls.map((c) => [c.name, c]));
    expect(byName.get("perf_ui_launch_app_ready_ms")?.value).toBe(0);
  });

  it("总时长超哨兵阈值 → 整批不发", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    reportUiLaunchToInput(makeTimings({ inputReady: 1000 + LAUNCH_TO_INPUT_SANITY_MAX_MS + 1 }));
    expect(reporter.calls).toHaveLength(0);
  });
});

describe("stream stall", () => {
  it("首个 chunk 不上报(无前序)", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    recordStreamChunkArrival("t1", { now: 1000 });
    expect(reporter.calls).toHaveLength(0);
  });

  it("间隔未超阈值不上报", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    recordStreamChunkArrival("t1", { now: 1000 });
    recordStreamChunkArrival("t1", { now: 1000 + STREAM_STALL_REPORT_THRESHOLD_MS });
    expect(reporter.calls).toHaveLength(0);
  });

  it("间隔超阈值上报真实时长", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    recordStreamChunkArrival("t1", { now: 1000 });
    recordStreamChunkArrival("t1", {
      now: 1000 + STREAM_STALL_REPORT_THRESHOLD_MS + 500,
      waitingTool: true,
    });
    expect(reporter.calls).toHaveLength(1);
    expect(reporter.calls[0]).toMatchObject({
      name: "perf_ui_stream_stall",
      value: STREAM_STALL_REPORT_THRESHOLD_MS + 500,
      properties: { waiting_tool: true, talk_id: "t1" },
    });
  });

  it("clearStreamStallTracking 后重置(下一个 chunk 视为首个)", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    recordStreamChunkArrival("t1", { now: 1000 });
    clearStreamStallTracking("t1");
    recordStreamChunkArrival("t1", { now: 100000 });
    expect(reporter.calls).toHaveLength(0);
  });
});
```

- [ ] **Passo 2: Executar o teste para verificar que falha**

Executar: `pnpm exec vitest run packages/ui/test/uiPerfArmsTelemetry.test.ts`
Esperado: FAIL (`reportUiLaunchToInput` / novas constantes não exportadas)

- [ ] **Passo 3: Editar `uiPerfArmsTelemetry.ts` — remover first_screen, adicionar launch**

3a. Adicionar o tipo `LaunchMarks` ao import do topo:

```ts
import type { ArmsCustomEventPayload, IPlatformService, LaunchMarks } from "@zcode/shared";
```

3b. Remover a linha 6 `export const UI_PERF_EVENT_FIRST_SCREEN = "perf_ui_first_screen";`, substituindo pelos novos nomes de evento + constante sentinela:

```ts
export const UI_PERF_EVENT_LAUNCH_TO_INPUT = "perf_ui_launch_to_input";
export const UI_PERF_EVENT_LAUNCH_ELECTRON_INIT = "perf_ui_launch_electron_init_ms";
export const UI_PERF_EVENT_LAUNCH_APP_READY = "perf_ui_launch_app_ready_ms";
export const UI_PERF_EVENT_LAUNCH_WINDOW = "perf_ui_launch_window_ms";
export const UI_PERF_EVENT_LAUNCH_RENDERER_LOAD = "perf_ui_launch_renderer_load_ms";
export const UI_PERF_EVENT_LAUNCH_REACT_COMMIT = "perf_ui_launch_react_commit_ms";
export const UI_PERF_EVENT_LAUNCH_STARTUP_GATE = "perf_ui_launch_startup_gate_ms";

// 总时长超过该值视为时钟异常/挂起，整批丢弃，避免污染分布。
export const LAUNCH_TO_INPUT_SANITY_MAX_MS = 300000;
```

3c. Remover a declaração `pendingFirstScreenPayload` (comentário das linhas 20-23 + `let pendingFirstScreenPayload ...`) e simplificar `setUiPerfArmsReporter` para:

```ts
export function setUiPerfArmsReporter(reporter: ArmsReporter | null): void {
  armsReporter = reporter;
}
```

3d. Em `clearUiPerfArmsReporterForTest`, remover a linha `pendingFirstScreenPayload = null;` (manter `armsReporter = null;` e `lastChunkAtByTask.clear();`).

3e. Remover toda a função `reportUiFirstScreen` (linhas 54-67), substituindo por:

```ts
interface LaunchToInputTimings {
  marks: LaunchMarks;
  /** renderer/src/main.tsx 模块顶部 Date.now()（T4） */
  rendererStart: number;
  /** zcode-react-startup-ready 触发时 Date.now()（T5） */
  reactCommit: number;
  /** 启动门禁清除、输入框可用时 Date.now()（T6） */
  inputReady: number;
  /** 同一次启动的关联键 */
  sessionId: string;
}

function clampMs(ms: number): number {
  return Math.max(0, Math.round(ms));
}

export function reportUiLaunchToInput(timings: LaunchToInputTimings): void {
  const { marks, rendererStart, reactCommit, inputReady, sessionId } = timings;
  const total = inputReady - marks.createdAt;
  // 哨兵:异常总时长(时钟跳变/进程挂起)整批丢弃。
  if (total < 0 || total > LAUNCH_TO_INPUT_SANITY_MAX_MS) {
    logger.warn("[ui-perf] launch_to_input 总时长异常,丢弃", { total });
    return;
  }
  const properties = { session_id: sessionId };
  const stages: { name: string; ms: number }[] = [
    { name: UI_PERF_EVENT_LAUNCH_TO_INPUT, ms: total },
    { name: UI_PERF_EVENT_LAUNCH_ELECTRON_INIT, ms: marks.mainStart - marks.createdAt },
    { name: UI_PERF_EVENT_LAUNCH_APP_READY, ms: marks.appReady - marks.mainStart },
    { name: UI_PERF_EVENT_LAUNCH_WINDOW, ms: marks.loadUrl - marks.appReady },
    { name: UI_PERF_EVENT_LAUNCH_RENDERER_LOAD, ms: rendererStart - marks.loadUrl },
    { name: UI_PERF_EVENT_LAUNCH_REACT_COMMIT, ms: reactCommit - rendererStart },
    { name: UI_PERF_EVENT_LAUNCH_STARTUP_GATE, ms: inputReady - reactCommit },
  ];
  for (const stage of stages) {
    emit({ name: stage.name, group: UI_PERF_ARMS_GROUP, value: clampMs(stage.ms), properties });
  }
}
```

- [ ] **Passo 4: Atualizar a exportação do barrel**

`packages/ui/src/index.ts:84`, trocar
```ts
export { reportUiFirstScreen } from "./lib/uiPerfArmsTelemetry.js";
```
por:
```ts
export { reportUiLaunchToInput } from "./lib/uiPerfArmsTelemetry.js";
```

- [ ] **Passo 5: Executar o teste para verificar que passa**

Executar: `pnpm exec vitest run packages/ui/test/uiPerfArmsTelemetry.test.ts`
Esperado: PASS (geral 4 + launch 3 + stall 4 = 11 casos)

- [ ] **Passo 6: Commitar**

```bash
git add packages/ui/src/lib/uiPerfArmsTelemetry.ts packages/ui/src/index.ts packages/ui/test/uiPerfArmsTelemetry.test.ts
git commit -m "feat(ui): 启动到能输入 7 段上报,废弃 perf_ui_first_screen"
```

---

### Tarefa 3: Processo main coleta T0–T3 e injeta via query do loadURL

**Arquivos:**
- Modificar: `packages/desktop/src/main/index.ts` (registrar T1 no topo; registrar T2 no callback whenReady; exportar getter)
- Modificar: `packages/desktop/src/main/desktopHostProcess.ts:86-112` (registrar T3 dentro de loadWindow, montar a query)

**Interfaces:**
- Consome: `serializeLaunchMarks`, `LAUNCH_MARKS_QUERY_KEY`, `LaunchMarks` de `@zcode/shared` (Tarefa 1)
- Produz: `getMainLaunchPartialMarks(): { createdAt: number; mainStart: number; appReady: number }` (para loadWindow chamar)

> Observação: `additionalArguments` é fixado na construção do `BrowserWindow`, enquanto T3 só é produzido mais tarde em `loadWindow`; por isso os quatro marks passam uniformemente pela query do loadURL (leitura em um único ponto no renderer). Esta tarefa não tem teste unitário próprio (a ordem temporal do processo main do Electron é difícil de converter em função pura); a cobertura vem do teste de serialização da Tarefa 1 + da verificação local da Tarefa 6.

- [ ] **Passo 1: Registrar T1 no topo de `index.ts` e declarar o estado de T0/T2**

Em `packages/desktop/src/main/index.ts`, após a área de imports no topo do módulo e antes de qualquer outra inicialização, adicionar:

```ts
import { serializeLaunchMarks, type LaunchMarks } from "@zcode/shared";

// 启动计时(epoch ms):T0 进程创建 / T1 main JS / T2 whenReady。T3 在 loadWindow 记。
const launchCreatedAt = process.getCreationTime() ?? Date.now();
const launchMainStart = Date.now();
let launchAppReady = 0;

export function getMainLaunchPartialMarks(): Omit<LaunchMarks, "loadUrl"> {
  return { createdAt: launchCreatedAt, mainStart: launchMainStart, appReady: launchAppReady };
}
```

(Se o arquivo já importar outros símbolos de `@zcode/shared`, mesclar no mesmo import; `serializeLaunchMarks` é na verdade usado em desktopHostProcess — aqui só o tipo `LaunchMarks` é necessário — manter o import de tipo conforme a necessidade.)

- [ ] **Passo 2: Registrar T2 na entrada do callback whenReady**

`index.ts:981` `app.whenReady().then(async () => {` — adicionar como primeira linha:

```ts
  launchAppReady = Date.now();
```

- [ ] **Passo 3: Registrar T3 dentro de `loadWindow` e montar na query**

`packages/desktop/src/main/desktopHostProcess.ts`, adicionar no topo:

```ts
import {
  LAUNCH_MARKS_QUERY_KEY,
  serializeLaunchMarks,
} from "@zcode/shared";
import { getMainLaunchPartialMarks } from "./index.js";
```

Dentro de `loadWindow`, no ponto onde o objeto `query` é construído (após o `Object.fromEntries(...)` das linhas 91-99 e antes de `if (process.env["ELECTRON_RENDERER_URL"])`), inserir apenas para o `index` da janela principal:

```ts
  if (page === "index") {
    const partial = getMainLaunchPartialMarks();
    query[LAUNCH_MARKS_QUERY_KEY] = serializeLaunchMarks({
      ...partial,
      loadUrl: Date.now(), // T3
    });
  }
```

> Atenção: `query` é hoje estreitado por `.filter(...)` para `Record<string,string>`, então `query[KEY] = string` é válido. O branch de `loadFile` já repassa `query`; o branch de `loadURL` já percorre `query` definindo searchParams — ambos os caminhos de carregamento carregam os dados.

- [ ] **Passo 4: Verificar tipos e build**

Executar: `pnpm typecheck`
Esperado: PASS (sem erros de tipo). Se aparecer aviso de import circular entre `index.ts` e `desktopHostProcess.ts`: mantenha `getMainLaunchPartialMarks` como função (leitura preguiçosa das variáveis de módulo), pois em ESM as variáveis já estão inicializadas no momento da chamada, e o ciclo é aceitável; se o tsc ainda reclamar, extraia as três variáveis de launch e o getter para um novo arquivo `packages/desktop/src/main/launchMarks.ts` e importe de lá.

- [ ] **Passo 5: Commitar**

```bash
git add packages/desktop/src/main/index.ts packages/desktop/src/main/desktopHostProcess.ts
git commit -m "feat(desktop): main 采集 T0-T3 经 loadURL query 注入"
```

---

### Tarefa 4: Renderer lê os marks, registra T4/T5 e remove a chamada antiga de first_screen

**Arquivos:**
- Modificar: `packages/desktop/src/renderer/src/main.tsx`

**Interfaces:**
- Consome: `parseLaunchMarks`, `LAUNCH_MARKS_QUERY_KEY`, `LaunchMarks` de `@zcode/shared`
- Produz:
  - `window.__ZCODE_LAUNCH_MARKS__: LaunchMarks | null` (parseado da query de location, uma vez no nível do módulo)
  - `window.__ZCODE_RENDERER_START__: number` (T4, `Date.now()` no topo do módulo)
  - `window.__ZCODE_REACT_COMMIT_AT__: number` (T5, escrito quando startup-ready dispara)

- [ ] **Passo 1: Registrar T4 no topo do módulo e parsear os marks**

Em `packages/desktop/src/renderer/src/main.tsx`, na área de imports remover `reportUiFirstScreen` de `@zcode/ui`; adicionar `parseLaunchMarks, LAUNCH_MARKS_QUERY_KEY, type LaunchMarks` de `@zcode/shared`. Antes de `startPerformanceTimelineCleanup();` (linha 26), adicionar:

```ts
// T4:renderer bundle 开始执行。同时从 loadURL query 解析 main 注入的 T0-T3。
const rendererStartedAt = Date.now();
const launchMarks: LaunchMarks | null = parseLaunchMarks(
  new URLSearchParams(window.location.search).get(LAUNCH_MARKS_QUERY_KEY),
);
(window as Window & {
  __ZCODE_RENDERER_START__?: number;
  __ZCODE_LAUNCH_MARKS__?: LaunchMarks | null;
}).__ZCODE_RENDERER_START__ = rendererStartedAt;
(window as Window & { __ZCODE_LAUNCH_MARKS__?: LaunchMarks | null }).__ZCODE_LAUNCH_MARKS__ =
  launchMarks;
```

- [ ] **Passo 2: Remover o bloco antigo de cronometragem first_screen**

Remover o bloco inteiro das linhas 28-40 (declaração de `uiFirstScreenStartedAt` + `window.addEventListener("zcode-react-startup-ready", ... reportUiFirstScreen ...)`).

- [ ] **Passo 3: Registrar T5 dentro de `StartupReadyNotifier`**

O `useEffect` de `StartupReadyNotifier` (linhas 235-243) passa a registrar T5 antes de despachar o evento:

```ts
function StartupReadyNotifier() {
  useEffect(() => {
    // T5:React 首次 commit。供启动分阶段耗时计算 react_commit 段。
    (window as Window & { __ZCODE_REACT_COMMIT_AT__?: number }).__ZCODE_REACT_COMMIT_AT__ =
      Date.now();
    // Bugfix: HTML 启动壳的弹出动画结束时，React 首屏可能还没 commit，直接移除壳会露出空白。
    window.dispatchEvent(new Event("zcode-react-startup-ready"));
  }, []);

  return null;
}
```

- [ ] **Passo 4: Verificar tipos**

Executar: `pnpm typecheck`
Esperado: PASS

- [ ] **Passo 5: Commitar**

```bash
git add packages/desktop/src/renderer/src/main.tsx
git commit -m "feat(desktop): renderer 解析 launch marks 并记 T4/T5"
```

---

### Tarefa 5: Root observa a liberação do portão, registra T6 e dispara o reporte

**Arquivos:**
- Modificar: `packages/ui/src/Root.tsx`
- Teste: `packages/ui/test/rootLaunchReport.test.ts` (teste unitário da função pura `buildLaunchToInputTimings`)
- Criar: `packages/ui/src/lib/launchToInputReport.ts` (wrapper de função pura, para facilitar testes unitários)

**Interfaces:**
- Consome: `reportUiLaunchToInput`, `LaunchMarks` (Tarefa 2)
- Produz:
  - `shouldReportLaunchToInput(state: { isStartupRenderBlocked: boolean; welcomeScreenOpen: boolean; alreadyReported: boolean }): boolean`
  - `readRendererLaunchTimings(): { marks: LaunchMarks | null; rendererStart: number; reactCommit: number } | null` (lê T4/T5/marks da window)

- [ ] **Passo 1: Escrever o teste que falha**

```ts
// packages/ui/test/rootLaunchReport.test.ts
import { describe, expect, it } from "vitest";
import { shouldReportLaunchToInput } from "@/lib/launchToInputReport.js";

describe("shouldReportLaunchToInput", () => {
  it("门禁已清除、非 welcome、未上报过 → 上报", () => {
    expect(
      shouldReportLaunchToInput({
        isStartupRenderBlocked: false,
        welcomeScreenOpen: false,
        alreadyReported: false,
      }),
    ).toBe(true);
  });

  it("门禁仍阻塞 → 不上报", () => {
    expect(
      shouldReportLaunchToInput({
        isStartupRenderBlocked: true,
        welcomeScreenOpen: false,
        alreadyReported: false,
      }),
    ).toBe(false);
  });

  it("WelcomeScreen 打开(未登录,无输入框) → 不上报", () => {
    expect(
      shouldReportLaunchToInput({
        isStartupRenderBlocked: false,
        welcomeScreenOpen: true,
        alreadyReported: false,
      }),
    ).toBe(false);
  });

  it("已上报过 → 不重复", () => {
    expect(
      shouldReportLaunchToInput({
        isStartupRenderBlocked: false,
        welcomeScreenOpen: false,
        alreadyReported: true,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Passo 2: Executar o teste para verificar que falha**

Executar: `pnpm exec vitest run packages/ui/test/rootLaunchReport.test.ts`
Esperado: FAIL (`Cannot find module .../launchToInputReport.js`)

- [ ] **Passo 3: Escrever `launchToInputReport.ts`**

```ts
// packages/ui/src/lib/launchToInputReport.ts
import type { LaunchMarks } from "@zcode/shared";

export function shouldReportLaunchToInput(state: {
  isStartupRenderBlocked: boolean;
  welcomeScreenOpen: boolean;
  alreadyReported: boolean;
}): boolean {
  // 门禁清除 = RootStartupLoading 退场、输入框挂载;welcome 时虽门禁清除但显示登录页、无输入框,不算"能输入"。
  return (
    !state.alreadyReported && !state.isStartupRenderBlocked && !state.welcomeScreenOpen
  );
}

export function readRendererLaunchTimings(): {
  marks: LaunchMarks | null;
  rendererStart: number;
  reactCommit: number;
} | null {
  const w = window as Window & {
    __ZCODE_LAUNCH_MARKS__?: LaunchMarks | null;
    __ZCODE_RENDERER_START__?: number;
    __ZCODE_REACT_COMMIT_AT__?: number;
  };
  const rendererStart = w.__ZCODE_RENDERER_START__;
  const reactCommit = w.__ZCODE_REACT_COMMIT_AT__;
  if (typeof rendererStart !== "number" || typeof reactCommit !== "number") {
    return null;
  }
  return { marks: w.__ZCODE_LAUNCH_MARKS__ ?? null, rendererStart, reactCommit };
}
```

- [ ] **Passo 4: Executar o teste para verificar que passa**

Executar: `pnpm exec vitest run packages/ui/test/rootLaunchReport.test.ts`
Esperado: PASS (4 casos)

- [ ] **Passo 5: Conectar em `Root.tsx`**

5a. Na área de imports adicionar:

```ts
import { reportUiLaunchToInput } from "@/lib/uiPerfArmsTelemetry.js";
import {
  readRendererLaunchTimings,
  shouldReportLaunchToInput,
} from "@/lib/launchToInputReport.js";
import { useRef } from "react"; // 若已 import react hooks，合并
```

5b. Adicionar o effect depois do cálculo de `isStartupRenderBlocked` (linha 547). O `sessionId` é derivado de marks.createdAt (estável e único dentro do mesmo processo):

```ts
  const launchReportedRef = useRef(false);
  useEffect(() => {
    if (
      !shouldReportLaunchToInput({
        isStartupRenderBlocked,
        welcomeScreenOpen: Boolean(welcomeScreenOpenReason),
        alreadyReported: launchReportedRef.current,
      })
    ) {
      return;
    }
    launchReportedRef.current = true;
    const timings = readRendererLaunchTimings();
    if (!timings || !timings.marks) {
      return; // 锚点缺失(非桌面/未注入 marks),整批跳过
    }
    reportUiLaunchToInput({
      marks: timings.marks,
      rendererStart: timings.rendererStart,
      reactCommit: timings.reactCommit,
      inputReady: Date.now(), // T6
      sessionId: `launch-${timings.marks.createdAt}`,
    });
  }, [isStartupRenderBlocked, welcomeScreenOpenReason]);
```

- [ ] **Passo 6: Executar a suíte completa de telemetria UI + report**

Executar: `pnpm exec vitest run packages/ui/test/uiPerfArmsTelemetry.test.ts packages/ui/test/rootLaunchReport.test.ts`
Esperado: PASS

- [ ] **Passo 7: Typecheck + Commitar**

Executar: `pnpm typecheck`
Esperado: PASS

```bash
git add packages/ui/src/Root.tsx packages/ui/src/lib/launchToInputReport.ts packages/ui/test/rootLaunchReport.test.ts
git commit -m "feat(ui): 启动门禁清除时上报 launch_to_input"
```

---

### Tarefa 6: Atualizar o documento de monitoramento e fazer a verificação local

**Arquivos:**
- Modificar: `docs/monitoring/performance-monitoring.md:169-182`

- [ ] **Passo 1: Substituir a linha de first_screen na lista de eventos**

Remover a linha 171 `| \`perf_ui_first_screen\` | ... |` e substituir por 7 linhas:

```markdown
| `perf_ui_launch_to_input` | 启动到能输入总耗时 ms | 进程创建(`getCreationTime`)→ 启动门禁清除、输入框可用 | `session_id` |
| `perf_ui_launch_electron_init_ms` | Electron 启动 ms | 进程创建 → main JS | `session_id` |
| `perf_ui_launch_app_ready_ms` | main 初始化 ms | main JS → `app.whenReady` | `session_id` |
| `perf_ui_launch_window_ms` | 窗口编排 ms | `whenReady` → `loadURL` | `session_id` |
| `perf_ui_launch_renderer_load_ms` | renderer 加载 ms | `loadURL` → bundle 执行 | `session_id` |
| `perf_ui_launch_react_commit_ms` | React 渲染 ms | bundle → React 首次 commit | `session_id` |
| `perf_ui_launch_startup_gate_ms` | 启动门禁 ms | React commit → 输入框可用(鉴权/provider/workspace 恢复) | `session_id` |
```

- [ ] **Passo 2: Atualizar a seção "Notas e limites"**

Adicionar um item perto da linha 176:

```markdown
- **启动分阶段**:7 段每进程冷启动各上报一次,`value` 为各段 ms(`Math.max(0,...)` 钳非负)。锚点 `process.getCreationTime()`,main 的 T0-T3 经主窗口 loadURL query(`zcodeLaunchMarks`)注入 renderer,在启动门禁清除(`isStartupRenderBlocked` 翻 false)时统一计算上报。未登录(WelcomeScreen)不上报;总时长 >300000ms 哨兵丢弃。`session_id` 关联同次启动各段。旧 `perf_ui_first_screen` 已废弃,语义并入 `perf_ui_launch_react_commit_ms`。
```

- [ ] **Passo 3: Regressão completa de testes unitários**

Executar: `pnpm exec vitest run packages/ui/test/uiPerfArmsTelemetry.test.ts packages/ui/test/rootLaunchReport.test.ts packages/shared/test/launchMarks.test.ts`
Esperado: PASS

- [ ] **Passo 4: Verificação local (manual, build de desenvolvimento `arms_env=local`)**

Seguindo a memória "启动 do dev desktop", iniciar o dev do desktop usando o espelho doméstico:
- Cold start autenticado → no log do main, `beforeReport` mostra 7 entradas `custom:perf_ui_launch_*` em sequência, e `perf_ui_launch_to_input` ≈ soma dos outros 6 segmentos.
- `perf_ui_launch_react_commit_ms` deve ficar próximo dos ~75ms do antigo first_screen (sanity).
- Cold start sem login (WelcomeScreen) → `perf_ui_launch_to_input` não aparece.
- Regressão: `perf_ui_first_token` / `perf_ui_message_complete` / `perf_ui_stream_stall` continuam normais.

- [ ] **Passo 5: Commitar**

```bash
git add docs/monitoring/performance-monitoring.md
git commit -m "docs(monitoring): 启动分阶段耗时事件,移除 perf_ui_first_screen"
```

---

## Ordem de implementação e dependências

Tarefa 1 (shared) → Tarefa 2 (reporte na UI) pode correr em paralelo com a Tarefa 3 (main); a Tarefa 4 depende da Tarefa 1; a Tarefa 5 depende das Tarefas 2 e 4; a Tarefa 6 vem por último. Ordem sugerida: 1 → 2 → 3 → 4 → 5 → 6.