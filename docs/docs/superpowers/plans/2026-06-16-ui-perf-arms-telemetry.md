# Plano de implementação de reporte de performance de UI no lado do cliente via ARMS

> Status (2026-07-15): implementado; este documento é mantido como plano histórico de implementação. O contrato de rastreamento vigente é o de
> `docs/monitoring/performance-monitoring.md`, `docs/monitoring/performance-telemetry-catalog.md`
> e `packages/ui/src/lib/uiPerfArmsTelemetry.ts`; os caminhos de integração como `useZCodeChat` abaixo são um registro do momento da implementação.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar quatro eventos de rastreamento de performance no renderer (UI) do Electron (primeira tela, primeiro token, duração da mensagem, pausa no streaming), reportados a `group=ui_perf` pelo encadeamento ARMS `sendCustom` já existente.

**Architecture:** Criar um novo encapsulador singleton de escopo de módulo `uiPerfArmsTelemetry.ts` (a exemplo dos helpers de rastreamento de negócio ARMS de escopo de módulo que já existem), com o reporter injetado em `Root.tsx`. Primeiro token/duração reaproveitam o espelho de `completionTelemetry` já calculado em `useZCodeChat`, com double report, sem mexer no `/report`; a primeira tela é medida em `main.tsx` ouvindo `zcode-react-startup-ready`; o estado de temporização per-task da pausa de streaming fica encapsulado dentro do módulo de telemetria, e o handler faz apenas uma chamada de linha. Coleta total, falhas engolidas.

**Tech Stack:** TypeScript, React, Vitest, `IPlatformService.reportArmsCustomEvent` de `@zcode/shared`.

---

## Base de design (spec)

`docs/superpowers/specs/2026-06-16-ui-perf-arms-telemetry-design.md`

## Fatos-chave (verificados)

- API de reporte: `platform.reportArmsCustomEvent({ name, group, value, properties })`, com as dimensões comuns preenchidas automaticamente pelo handler do main (`desktopMainIpcRemote.ts:119`).
- `ArmsCustomEventPayload` (`@zcode/shared`): `{ name: string; group: string; value?: number; properties?: Record<string, string | number | boolean | undefined> }`.
- Ponto de espelho: `reportPromptCompletionTelemetry` em `packages/ui/src/hooks/useZCodeChat.ts:567-603`; `completionTelemetry.eventExtraDetail` já contém `time_to_first_token`, `duration_ms`, `status`, `model_name`; `completionTelemetry.taskId` e `completionTelemetry.messageId` estão disponíveis.
- Evento de fim da primeira tela: `"zcode-react-startup-ready"` no `window` (despachado em `main.tsx:221`).
- Ponto de chegada de chunk: os cases `agent_message_chunk` (linha ~821) e `agent_thought_chunk` (linha ~927) de `taskStreamEventHandlers.ts`, ambos com a variável local `taskId`.
- Ponto de limpeza do estado final: `handleTaskCompleteEvent` (110) e `handleTaskErrorEvent` (340) de `taskStreamEventTerminalHandlers.ts`.
- Framework de teste: Vitest (ver `packages/ui/src/lib/*.test.ts`).

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|------|------|
| `packages/ui/src/lib/uiPerfArmsTelemetry.ts` | **Novo**: reporter singleton + constantes + 4 funções de report + estado de pausa de streaming per-task |
| `packages/ui/src/lib/uiPerfArmsTelemetry.test.ts` | **Novo**: teste unitário |
| `packages/ui/src/Root.tsx` | Injeta/limpa o reporter |
| `packages/desktop/src/renderer/src/main.tsx` | Reporte do início + fim da primeira tela |
| `packages/ui/src/hooks/useZCodeChat.ts` | Espelha primeiro token/duração para o ARMS |
| `packages/ui/src/hooks/taskStreamEventHandlers.ts` | Chamada de rastreamento de pausa na chegada de chunks |
| `packages/ui/src/hooks/taskStreamEventTerminalHandlers.ts` | Limpeza do estado de pausa no estado final |
| `docs/monitoring/performance-monitoring.md` | Nova seção de ui_perf |

---

## Task 1: criar o módulo uiPerfArmsTelemetry (reporter + constantes + reporte de primeira tela/primeiro token/duração)

**Files:**
- Create: `packages/ui/src/lib/uiPerfArmsTelemetry.ts`
- Test: `packages/ui/src/lib/uiPerfArmsTelemetry.test.ts`

- [ ] **Step 1: escrever o teste que falha**

Crie `packages/ui/src/lib/uiPerfArmsTelemetry.test.ts`:

```typescript
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ArmsCustomEventPayload } from "@zcode/shared";
import {
  UI_PERF_ARMS_GROUP,
  clearUiPerfArmsReporterForTest,
  reportUiFirstScreen,
  reportUiMessageComplete,
  reportUiFirstToken,
  setUiPerfArmsReporter,
} from "./uiPerfArmsTelemetry.js";

function makeReporter() {
  const calls: ArmsCustomEventPayload[] = [];
  return {
    calls,
    reportArmsCustomEvent: vi.fn(async (payload: ArmsCustomEventPayload) => {
      calls.push(payload);
    }),
  };
}

afterEach(() => {
  clearUiPerfArmsReporterForTest();
  vi.restoreAllMocks();
});

describe("uiPerfArmsTelemetry", () => {
  it("未注入 reporter 时静默不抛错", () => {
    expect(() => reportUiFirstScreen(1234)).not.toThrow();
  });

  it("reportUiFirstScreen 构造正确 payload", () => {
    const reporter = makeReporter();
    setUiPerfArmsReporter(reporter);
    reportUiFirstScreen(1234);
    expect(reporter.calls).toHaveLength(1);
    expect(reporter.calls[0]).toMatchObject({
      name: "perf_ui_first_screen",
      group: UI_PERF_ARMS_GROUP,
      value: 1234,
    });
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
    expect(() => reportUiFirstScreen(1)).not.toThrow();
  });
});
```

- [ ] **Step 2: rodar o teste e confirmar a falha**

Run: `pnpm --filter @zcode/ui exec vitest run src/lib/uiPerfArmsTelemetry.test.ts`
Expected: FAIL — o módulo não existe / os exports não estão definidos.

- [ ] **Step 3: escrever a implementação**

Crie `packages/ui/src/lib/uiPerfArmsTelemetry.ts`:

```typescript
import type { ArmsCustomEventPayload, IPlatformService } from "@zcode/shared";
import { logger } from "@/logger.js";

export const UI_PERF_ARMS_GROUP = "ui_perf";

export const UI_PERF_EVENT_FIRST_SCREEN = "perf_ui_first_screen";
export const UI_PERF_EVENT_FIRST_TOKEN = "perf_ui_first_token";
export const UI_PERF_EVENT_MESSAGE_COMPLETE = "perf_ui_message_complete";
export const UI_PERF_EVENT_STREAM_STALL = "perf_ui_stream_stall";

// 超过该间隔(ms)未收到新 chunk 视为停顿并上报;value 仍为真实间隔。可据线上分布收紧。
export const STREAM_STALL_REPORT_THRESHOLD_MS = 3000;

type ArmsReporter = Pick<IPlatformService, "reportArmsCustomEvent">;

let armsReporter: ArmsReporter | null = null;

export function setUiPerfArmsReporter(reporter: ArmsReporter | null): void {
  armsReporter = reporter;
}

export function clearUiPerfArmsReporterForTest(): void {
  armsReporter = null;
  lastChunkAtByTask.clear();
}

// 原因:ARMS 属观测链路,UI 主流程(启动/发送/渲染)不得因埋点失败而中断。
function emit(payload: ArmsCustomEventPayload): void {
  if (!armsReporter) {
    return;
  }
  try {
    void Promise.resolve(armsReporter.reportArmsCustomEvent(payload)).catch((error) => {
      logger.warn("[ui-perf] ARMS 上报失败", { name: payload.name, error });
    });
  } catch (error) {
    logger.warn("[ui-perf] ARMS 上报异常", { name: payload.name, error });
  }
}

export function reportUiFirstScreen(elapsedMs: number, phase?: string): void {
  emit({
    name: UI_PERF_EVENT_FIRST_SCREEN,
    group: UI_PERF_ARMS_GROUP,
    value: Math.max(0, Math.round(elapsedMs)),
    properties: { phase },
  });
}

export function reportUiFirstToken(params: {
  ttftMs: number;
  model?: string;
  talkId?: string;
  messageId?: string;
}): void {
  emit({
    name: UI_PERF_EVENT_FIRST_TOKEN,
    group: UI_PERF_ARMS_GROUP,
    value: Math.max(0, Math.round(params.ttftMs)),
    properties: { model: params.model, talk_id: params.talkId, message_id: params.messageId },
  });
}

export function reportUiMessageComplete(params: {
  durationMs: number;
  result: string;
  talkId?: string;
  messageId?: string;
}): void {
  emit({
    name: UI_PERF_EVENT_MESSAGE_COMPLETE,
    group: UI_PERF_ARMS_GROUP,
    value: Math.max(0, Math.round(params.durationMs)),
    properties: { result: params.result, talk_id: params.talkId, message_id: params.messageId },
  });
}

// 流式停顿:per-task 记录上一个正文 chunk 到达时刻,间隔超阈值则上报真实间隔。
const lastChunkAtByTask = new Map<string, number>();

export function recordStreamChunkArrival(
  taskId: string,
  options?: { waitingTool?: boolean; now?: number },
): void {
  const now = options?.now ?? Date.now();
  const last = lastChunkAtByTask.get(taskId);
  lastChunkAtByTask.set(taskId, now);
  if (last === undefined) {
    return;
  }
  const gapMs = now - last;
  if (gapMs <= STREAM_STALL_REPORT_THRESHOLD_MS) {
    return;
  }
  emit({
    name: UI_PERF_EVENT_STREAM_STALL,
    group: UI_PERF_ARMS_GROUP,
    value: Math.round(gapMs),
    properties: { stall_ms: Math.round(gapMs), waiting_tool: options?.waitingTool ?? false, talk_id: taskId },
  });
}

export function clearStreamStallTracking(taskId: string): void {
  lastChunkAtByTask.delete(taskId);
}
```

> Nota: quando `phase`/`model` etc. são `undefined` em `properties`, o `.filter(entry => entry[1] !== undefined)` do handler do main já os remove automaticamente, sem necessidade de limpeza no lado da UI.

- [ ] **Step 4: rodar o teste e confirmar a aprovação**

Run: `pnpm --filter @zcode/ui exec vitest run src/lib/uiPerfArmsTelemetry.test.ts`
Expected: PASS (5 casos).

- [ ] **Step 5: commitar**

```bash
git add packages/ui/src/lib/uiPerfArmsTelemetry.ts packages/ui/src/lib/uiPerfArmsTelemetry.test.ts
git commit -m "feat(ui-perf): 新增 UI 性能 ARMS 上报封装模块"
```

---

## Task 2: teste unitário do rastreamento de pausa de streaming

**Files:**
- Test: `packages/ui/src/lib/uiPerfArmsTelemetry.test.ts` (acréscimo)

- [ ] **Step 1: adicionar o teste que falha**

Dentro do `describe` de `uiPerfArmsTelemetry.test.ts`, acrescente:

```typescript
import {
  recordStreamChunkArrival,
  clearStreamStallTracking,
  STREAM_STALL_REPORT_THRESHOLD_MS,
} from "./uiPerfArmsTelemetry.js";

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
    recordStreamChunkArrival("t1", { now: 1000 + STREAM_STALL_REPORT_THRESHOLD_MS + 500, waitingTool: true });
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

- [ ] **Step 2: rodar o teste**

Run: `pnpm --filter @zcode/ui exec vitest run src/lib/uiPerfArmsTelemetry.test.ts`
Expected: PASS (todos os casos, incluindo os 4 novos). A implementação já foi feita na Task 1; esta tarefa confirma o comportamento.

- [ ] **Step 3: commitar**

```bash
git add packages/ui/src/lib/uiPerfArmsTelemetry.test.ts
git commit -m "test(ui-perf): 覆盖流式停顿追踪逻辑"
```

---

## Task 3: injetar o reporter em Root.tsx

**Files:**
- Modify: `packages/ui/src/Root.tsx:73` (import), `:150-157` (useEffect)

- [ ] **Step 1: adicionar o import**

Abaixo do import existente do reporter ARMS em `Root.tsx` (próximo da linha 73), acrescente:

```typescript
import { setUiPerfArmsReporter } from "@/lib/uiPerfArmsTelemetry.js";
```

- [ ] **Step 2: injetar/limpar no useEffect existente**

Altere o useEffect de `Root.tsx:150-157` para:

```typescript
  useEffect(() => {
    // 既有 reporter 注入保持不变
    setMcpStorePlatform(platform);
    setUiPerfArmsReporter(platform);
    return () => {
      setMcpStorePlatform(null);
      setUiPerfArmsReporter(null);
    };
  }, [platform]);
```

- [ ] **Step 3: verificação de tipos**

Run: `pnpm --filter @zcode/ui exec tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 4: commitar**

```bash
git add packages/ui/src/Root.tsx
git commit -m "feat(ui-perf): Root 注入 UI 性能 ARMS reporter"
```

---

## Task 4: espelhar primeiro token/duração da mensagem para o ARMS

**Files:**
- Modify: `packages/ui/src/hooks/useZCodeChat.ts:16` (área de imports), `:589-600` (após reportAppTelemetryEvent)

- [ ] **Step 1: adicionar o import**

Abaixo de `import { reportAppTelemetryEvent } from "@/lib/appTelemetry.js";` em `useZCodeChat.ts` (linha 16), acrescente:

```typescript
import { reportUiFirstToken, reportUiMessageComplete } from "@/lib/uiPerfArmsTelemetry.js";
```

- [ ] **Step 2: acrescentar o reporte ARMS no ponto de espelho**

Dentro de `reportPromptCompletionTelemetry` em `useZCodeChat.ts`, **depois** da chamada existente `await reportAppTelemetryEvent(...)` (linhas 589-600) e antes do fim do callback, acrescente:

```typescript
      // 镜像到 ARMS(group=ui_perf):不改动上面的 /report 链路,只额外双发。
      const detail = completionTelemetry.eventExtraDetail;
      const ttft = Number(detail.time_to_first_token);
      if (Number.isFinite(ttft)) {
        reportUiFirstToken({
          ttftMs: ttft,
          model: detail.model_name || undefined,
          talkId: completionTelemetry.taskId,
          messageId: completionTelemetry.messageId,
        });
      }
      const durationMs = Number(detail.duration_ms);
      if (Number.isFinite(durationMs)) {
        reportUiMessageComplete({
          durationMs,
          result: detail.status ?? statusToReport,
          talkId: completionTelemetry.taskId,
          messageId: completionTelemetry.messageId,
        });
      }
```

> Os campos de `eventExtraDetail` são `string` (ver `messageTelemetry.ts:634-650`) e são convertidos de volta para número com `Number()`. `model_name`/`status` já são string.

- [ ] **Step 3: verificação de tipos**

Run: `pnpm --filter @zcode/ui exec tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 4: testes de regressão**

Run: `pnpm --filter @zcode/ui exec vitest run src/lib`
Expected: PASS (os testes existentes, como os de messageTelemetry, não são afetados).

- [ ] **Step 5: commitar**

```bash
git add packages/ui/src/hooks/useZCodeChat.ts
git commit -m "feat(ui-perf): 镜像首token/消息耗时到 ARMS"
```

---

## Task 5: rastrear a pausa de streaming na chegada de chunks

**Files:**
- Modify: `packages/ui/src/hooks/taskStreamEventHandlers.ts:12` (perto da área de imports), case `agent_message_chunk` (~821), case `agent_thought_chunk` (~927)

- [ ] **Step 1: adicionar o import**

Na área de imports do topo de `taskStreamEventHandlers.ts` (perto do import de `messageTelemetry`, onde fica `recordPromptFirstToken`), acrescente:

```typescript
import { recordStreamChunkArrival } from "@/lib/uiPerfArmsTelemetry.js";
```

- [ ] **Step 2: chamar no case agent_message_chunk**

Dentro do bloco `case "agent_message_chunk":` de `taskStreamEventHandlers.ts`, ao lado do `recordPromptFirstToken(taskId);` existente (linha ~865), acrescente:

```typescript
        recordStreamChunkArrival(taskId, { waitingTool: false });
```

- [ ] **Step 3: chamar no case agent_thought_chunk**

Dentro do bloco `case "agent_thought_chunk":` (linha ~927), acrescente a mesma linha de forma simétrica ao message_chunk:

```typescript
        recordStreamChunkArrival(taskId, { waitingTool: false });
```

> Explicação: a chegada de um chunk de corpo/pensamento é vista como «o stream ainda está avançando». Não haver chunk de corpo durante `tool_call`/`tool_call_update` é o comportamento esperado; o `waiting_tool` do evento de pausa fica fixo em `false` nesta fase (apenas intervalo entre chunks), e distinguir a causa raiz de espera por ferramenta fica para depois (item futuro do spec). Nesta fase primeiro coletamos a distribuição real de pausas.

- [ ] **Step 4: verificação de tipos**

Run: `pnpm --filter @zcode/ui exec tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 5: commitar**

```bash
git add packages/ui/src/hooks/taskStreamEventHandlers.ts
git commit -m "feat(ui-perf): chunk 到达追踪流式停顿"
```

---

## Task 6: limpar o estado de rastreamento de pausas no estado final

**Files:**
- Modify: `packages/ui/src/hooks/taskStreamEventTerminalHandlers.ts` (área de imports + `handleTaskCompleteEvent`:110 / `handleTaskErrorEvent`:340)

- [ ] **Step 1: adicionar o import**

Na área de imports do topo de `taskStreamEventTerminalHandlers.ts`, acrescente:

```typescript
import { clearStreamStallTracking } from "@/lib/uiPerfArmsTelemetry.js";
```

- [ ] **Step 2: limpar em task_complete**

Dentro de `handleTaskCompleteEvent`, depois do `reportPromptCompletionTelemetry(taskId, "success", promptFinishedAt, event.usage);` existente (linha 251), acrescente:

```typescript
  clearStreamStallTracking(taskId);
```

- [ ] **Step 3: limpar em task_error**

Dentro de `handleTaskErrorEvent`, no fim da função (depois de `reportPromptCompletionTelemetry(taskId, "fail", Date.now());`, linha 469), acrescente:

```typescript
  clearStreamStallTracking(taskId);
```

> O ramo `user_interrupt` (linha 420) compartilha `handleTaskErrorEvent` com `fail`, e a limpeza da linha 469 cobre o caminho de erro normal; se `user_interrupt` fizer return antecipado, acrescente a mesma linha `clearStreamStallTracking(taskId);` antes do `return`. Na implementação, confirme se a linha 420 retorna: se retornar, adicione uma linha após a 420.

- [ ] **Step 4: verificação de tipos + regressão**

Run: `pnpm --filter @zcode/ui exec tsc --noEmit && pnpm --filter @zcode/ui exec vitest run src/lib src/hooks`
Expected: sem novos erros de tipo; testes PASS.

- [ ] **Step 5: commitar**

```bash
git add packages/ui/src/hooks/taskStreamEventTerminalHandlers.ts
git commit -m "feat(ui-perf): 消息终态清理流式停顿追踪"
```

---

## Task 7: reporte da duração da primeira tela (main.tsx)

**Files:**
- Modify: `packages/desktop/src/renderer/src/main.tsx` (topo e fim do módulo)

- [ ] **Step 1: registrar o início no topo do módulo**

Após a área de imports de `main.tsx`, no nível do módulo (antes de qualquer inicialização síncrona), acrescente:

```typescript
import { reportUiFirstScreen } from "@zcode/ui";

// 首屏起点:renderer 模块加载早期。终点为 React commit 后派发的 "zcode-react-startup-ready"。
const uiFirstScreenStartedAt =
  typeof performance?.now === "function" ? performance.now() : Date.now();
```

> Confirme que `reportUiFirstScreen` já é exportado pelo pacote `@zcode/ui`. Se não for, acrescente `export { reportUiFirstScreen } from "./lib/uiPerfArmsTelemetry.js";` em `packages/ui/src/index.ts` (ou no barrel correspondente). Na implementação, verifique primeiro com grep em `packages/ui/src/index.ts` como o export é feito.

- [ ] **Step 2: ouvir o evento de fim e reportar**

No nível do módulo de `main.tsx` (perto da definição de `StartupReadyNotifier`, na posição executada no carregamento do módulo), acrescente uma escuta única:

```typescript
// 首屏终点:React commit 后由 StartupReadyNotifier 派发。一次性监听,reporter 此时已在 Root mount 注入。
window.addEventListener(
  "zcode-react-startup-ready",
  () => {
    const now = typeof performance?.now === "function" ? performance.now() : Date.now();
    reportUiFirstScreen(now - uiFirstScreenStartedAt);
  },
  { once: true },
);
```

- [ ] **Step 3: confirmar o export + verificação de tipos**

Run: `grep -n "uiPerfArmsTelemetry\|reportUiFirstScreen" packages/ui/src/index.ts`
Se não houver saída, acrescente o export do barrel conforme a nota do Step 1.
Run: `pnpm --filter @zcode/desktop exec tsc --noEmit`
Expected: sem novos erros.

- [ ] **Step 4: commitar**

```bash
git add packages/ui/src/index.ts packages/desktop/src/renderer/src/main.tsx
git commit -m "feat(ui-perf): 上报首屏可交互耗时"
```

---

## Task 8: atualizar a documentação de monitoramento

**Files:**
- Modify: `docs/monitoring/performance-monitoring.md`

- [ ] **Step 1: acrescentar a seção de ui_perf**

Em `performance-monitoring.md`, após «P0 网络与通信指标» e antes de «ARMS 看板建议», insira:

```markdown
## P0 端侧 UI 性能指标

renderer(UI)侧埋点,经 `reportArmsCustomEvent` → IPC → `armsRum.sendCustom` 上报。事件 `group=ui_perf`,名称前缀 `perf_ui_`。全采(100%)。公共维度由 main IPC handler 自动补齐(`app_version` / `arms_env` / `device_mid` / `platform` / `renderer_id`)。

### 事件一览

| 事件 | `value` | 来源 | 关键 properties |
|------|---------|------|-----------------|
| `perf_ui_first_screen` | 首屏耗时 ms | renderer 模块加载 → `zcode-react-startup-ready`(React commit) | `phase`(可选) |
| `perf_ui_first_token` | 首 token 延迟 ms | 镜像 `message_completion` 的 `time_to_first_token` | `model` / `talk_id` / `message_id` |
| `perf_ui_message_complete` | 消息端到端耗时 ms | 镜像 `message_completion` 的 `duration_ms` | `result` / `talk_id` / `message_id` |
| `perf_ui_stream_stall` | 真实停顿时长 ms | 流式相邻正文 chunk 间隔 > 3000ms | `stall_ms` / `waiting_tool` / `talk_id` |

### 说明与边界

- **首 token / 消息耗时**:不新增计时,复用 `messageTelemetry.finalizePromptTelemetry()` 已算好的值,在 `useZCodeChat.reportPromptCompletionTelemetry` 镜像双发到 ARMS;`/report` 的 `message_completion` 链路与看板不受影响。
- **流式停顿**:`value` 为真实 chunk 间隔(非阈值),阈值 `STREAM_STALL_REPORT_THRESHOLD_MS=3000` 仅作上报闸门。chunk 间隔 >3s 的根因可能在上游(模型推理/网络),不一定是客户端渲染卡顿;但用户视角"界面长时间不动"可感知,故上报。后续据线上分布收紧阈值。
- **渲染卡顿(longTask)**:由 ARMS Browser SDK 自动采集(`browserCollectors.longTask`),不在此手动埋点。

常量(代码):`STREAM_STALL_REPORT_THRESHOLD_MS=3000`(`packages/ui/src/lib/uiPerfArmsTelemetry.ts`)。
```

- [ ] **Step 2: acrescentar ao índice de implementação**

Ao final do documento, acrescente uma linha à tabela «实现索引»:

```markdown
| P0 端侧 UI 性能上报 | `packages/ui/src/lib/uiPerfArmsTelemetry.ts` |
```

- [ ] **Step 3: commitar**

```bash
git add docs/monitoring/performance-monitoring.md
git commit -m "docs: 监控文档新增端侧 UI 性能指标"
```

---

## Task 9: verificação completa

- [ ] **Step 1: verificação de tipos + testes em todos os pacotes**

Run: `pnpm --filter @zcode/ui exec tsc --noEmit && pnpm --filter @zcode/desktop exec tsc --noEmit && pnpm --filter @zcode/ui exec vitest run`
Expected: sem erros de tipo; todos os testes PASS.

- [ ] **Step 2: verificação de build local (pacote de desenvolvimento, `arms_env=local`)**

Consulte o checklist de verificação local de `docs/monitoring/performance-monitoring.md`:
- iniciar o aplicativo → no log do main, `[arms] beforeReport` mostra `custom:perf_ui_first_screen`.
- enviar uma mensagem e concluí-la → aparecem `custom:perf_ui_first_token` e `custom:perf_ui_message_complete`.
- usar um modelo lento ou um breakpoint para criar um intervalo de chunks >3s → aparece `custom:perf_ui_stream_stall`, com o value sendo o intervalo real.
- regressão: o `message_completion` do `/report` continua sendo reportado normalmente.

> Veja a forma de inicialização na memória do usuário `zcode-desktop-dev-startup.md` (pnpm 10.33.2 + ELECTRON_MIRROR espelho doméstico).

- [ ] **Step 3: commit final (se houve pequenos ajustes na verificação)**

```bash
git add -A
git commit -m "chore(ui-perf): 端侧 UI 性能上报本地验证收尾"
```

---

## Conclusões da Self-Review

- **Cobertura do spec**: os quatro eventos (first_screen/first_token/message_complete/stream_stall) correspondem às Task 7/4/4/5; encapsulamento na Task 1; injeção na Task 3; limpeza na Task 6; documentação na Task 8; coleta total sem interruptor já aplicada (sem código de amostragem); falha engolida em `emit()`. ✅
- **Varredura de placeholders**: sem TODO/TBD; cada passo que altera código contém o código completo. Os dois pontos de «confirmar na implementação» (return de user_interrupt na Task 6, export do barrel na Task 7) são pontos reais de verificação de fato de código, com comando de confirmação e ação de fallback indicados, não placeholders. ✅
- **Consistência de tipos**: `setUiPerfArmsReporter`/`reportUiFirstScreen`/`reportUiFirstToken`/`reportUiMessageComplete`/`recordStreamChunkArrival`/`clearStreamStallTracking`/`UI_PERF_ARMS_GROUP`/`STREAM_STALL_REPORT_THRESHOLD_MS` mantêm a mesma nomenclatura do início ao fim. ✅