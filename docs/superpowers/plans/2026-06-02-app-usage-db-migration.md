# Migração da fonte de dados de uso do aplicativo para o banco de dados do agent — plano de implementação

> **Para workers agentivos:** SUB-SKILL OBRIGATÓRIO: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano task por task. Os passos usam sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Goal:** substituir inteiramente a fonte de dados do painel "Uso do aplicativo", hoje "arquivo JSON local de session + estimativa por caracteres", pelas estatísticas reais do banco SQLite do zcode agent (`model_usage` / `turn_usage` / `tool_usage`), e adicionar o split real de tokens, métricas de confiabilidade e um bloco de uso de ferramentas.

**Architecture:** agregação em SQL dentro do subprocesso do agent (repo em adapters) → builder de função pura monta o snapshot (bootstrap) → novo método do ZCode Protocol `usage/stats` (shared schema + handler do bootstrap) → serviço do host `usageStatsService` obtém os dados pelo protocolo via `zcodeAgentService` (packages/services) → UI redesenha 4 blocos (packages/ui). A agregação fica do lado do agent, ficando naturalmente sujeita ao período de retenção de 30 dias.

**Tech Stack:** TypeScript, Node.js `node:sqlite` (`DatabaseSync`), zod, React, vitest, lucide-react, recharts.

**Spec:** `docs/superpowers/specs/2026-06-02-app-usage-db-migration-design.md`

---

## Convenções principais (perpassam todo o plano; a nomenclatura precisa ser consistente)

- Novo tipo de intervalo de tempo: `AppUsageRange = "7d" | "30d"` (exclusivo do App Usage, **não reutiliza** `UsageStatsRange`, que continua servindo ao Coding Plan/monitor).
- Novo nome da constante de método de protocolo: `usageStats`, string de método `"usage/stats"`.
- Método de porta de agregação somente leitura no lado do agent: `UsageStorePort.queryAppUsage(input: AppUsageQueryInput): Promise<AppUsageQueryResult>`.
- Builder de função pura: `buildAppUsageSnapshot(result, opts): AppUsageSnapshot`, em `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/usage-stats-builder.ts`.
- Fuso horário por dia calculado com "offset fixo": `tzOffsetMs` (calculado pelo handler com Intl e repassado), `dayIndex = floor((started_at + tzOffsetMs) / 86400000)`. Há um pequeno erro nas bordas de DST, o que é aceitável (registrado nos comentários).

## Mapa de arquivos (criar / modificar)

**Fase 0 — DTO**
- Modify `packages/shared/src/usage-stats.ts` — remover os tipos de estimativa por caracteres, adicionar o zod schema de App Usage + tipos + `AppUsageRange`.

**Fase 1 — camada de leitura no agent**
- Modify `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts` — adicionar os tipos raw `AppUsageQueryInput` / `AppUsageQueryResult` e o método de porta `queryAppUsage`.
- Modify `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/usage.ts` — adicionar a agregação SQL de `queryAppUsage(db, input)`.
- Modify `apps/zcode-cli/packages/adapters/src/storage/session-store/sqlite-session-store.ts` — fazer o proxy de `queryAppUsage`.
- Test `apps/zcode-cli/packages/adapters/tests/usage-query.test.ts` — asserções da agregação no repo.

**Fase 2 — builder + protocolo**
- Create `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/usage-stats-builder.ts` — builder de função pura + helper `tzOffsetMs`.
- Test `apps/zcode-cli/packages/bootstrap/tests/usage-stats-builder.test.ts`.
- Modify `packages/shared/src/zcode-protocol/index.ts` — registrar o método `usageStats` + schemas de entrada/resultado.
- Modify `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts` — handler de `usageStats`.
- Modify `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts` — case no dispatch.
- Modify `packages/services/src/zcode-agent/zcodeAgentService.ts` (+ seus arquivos de tipos/interfaces) — método `getAppUsageStats`.

**Fase 3 — serviço do host**
- Modify `packages/services/src/usage-stats/usageStatsService.ts` — reescrever `getAppUsageSnapshot` passando pelo protocolo.
- Modify `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts` — injetar `zcodeAgentService`.
- Delete `packages/services/src/usage-stats/usageStatsAggregator.ts`、`repo/sessionUsageRepo.ts`、`usageStatsSeries.ts` (se existirem).
- Modify `packages/services/src/usage-stats/usageStats.ts` — o tipo de entrada de `getAppUsageSnapshot` passa a ser `AppUsageRequest` (range: AppUsageRange).

**Fase 4 — UI**
- Modify `packages/ui/src/settings/usage-stats/AppUsagePanel.tsx`、`usageStatsUiParts.tsx`、`AppUsageDailyModelBarChart.tsx`、`packages/ui/src/hooks/useUsageStats.ts`、arquivos de i18n messages.

---

## Fase 0 — DTO compartilhado

### Task 0: adicionar o DTO de App Usage (zod schema + tipos)

**Arquivos:**
- Modify: `packages/shared/src/usage-stats.ts`

- [ ] **Passo 1: confirmar que o zod está disponível no topo do arquivo e adicionar a seção de schema**

Adicione o import no **topo** de `packages/shared/src/usage-stats.ts` (pule se já existir `import { z } from "zod"`):

```typescript
import { z } from "zod";
```

- [ ] **Passo 2: remover as exportações relacionadas à estimativa por caracteres**

Remova estes itens (eles pertencem à antiga pipeline de estimativa local e ficam sem fonte após a migração):
- `export const ESTIMATED_TOKEN_CHAR_DIVISOR = 3;` (linha 1)
- `export function estimateTokensFromCharacterCount(...) { ... }` (o bloco inteiro no fim do arquivo)
- As interfaces `UsageStatsDailyModelUsage` / `UsageStatsDailyModelUsageItem` (substituídas pelos novos tipos de App Usage)
- A definição antiga de `AppUsageSnapshot` (linhas 130-134) e o antigo `AppUsageRequest` (linhas 24-27)

> `UsageStatsSnapshot` / `UsageStatsSummary` / `UsageStatsHeatmap*` / `UsageStatsModelUsage` etc. ainda são usados pelo Coding Plan/monitor e por `getSnapshot`, portanto **permanecem intactos**. `UsageStatsRange` permanece.

- [ ] **Passo 3: adicionar o zod schema e os tipos de App Usage**

Insira no arquivo (antes da seção do Coding Plan):

```typescript
// ── App Usage（agent 数据库真实统计）────────────────────────────────
export const APP_USAGE_RANGES = ["7d", "30d"] as const;
export type AppUsageRange = (typeof APP_USAGE_RANGES)[number];

export const appUsageFavoriteModelSchema = z.object({
  modelId: z.string().nullable(),
  totalTokens: z.number(),
  share: z.number(),
});

export const appUsageSummarySchema = z.object({
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  reasoningTokens: z.number(),
  cacheCreationTokens: z.number(),
  cacheReadTokens: z.number(),
  cacheHitRate: z.number(),
  totalSessions: z.number(),
  totalTurns: z.number(),
  toolCallCount: z.number(),
  toolErrorRate: z.number(),
  modelErrorRate: z.number(),
  avgTimeToFirstTokenMs: z.number().nullable(),
  avgTurnDurationMs: z.number().nullable(),
  activeDays: z.number(),
  currentStreakDays: z.number(),
  favoriteModel: appUsageFavoriteModelSchema.nullable(),
});

export const appUsageHeatmapCellSchema = z.object({
  date: z.string(),
  level: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  totalTokens: z.number(),
  turnCount: z.number(),
  toolCallCount: z.number(),
});

export const appUsageHeatmapWeekSchema = z.object({
  weekIndex: z.number(),
  days: z.array(appUsageHeatmapCellSchema.nullable()),
});

export const appUsageHeatmapSchema = z.object({
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  maxTokens: z.number(),
  weeks: z.array(appUsageHeatmapWeekSchema),
});

export const appUsageDailyModelItemSchema = z.object({
  modelId: z.string().nullable(),
  totalTokens: z.number(),
});

export const appUsageDailyModelUsageSchema = z.object({
  date: z.string(),
  models: z.array(appUsageDailyModelItemSchema),
});

export const appUsageModelUsageSchema = z.object({
  modelId: z.string().nullable(),
  totalTokens: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  requestCount: z.number(),
  share: z.number(),
});

export const appUsageToolUsageSchema = z.object({
  toolName: z.string(),
  callCount: z.number(),
  errorCount: z.number(),
  errorRate: z.number(),
  avgDurationMs: z.number().nullable(),
});

export const appUsageSnapshotSchema = z.object({
  range: z.enum(APP_USAGE_RANGES),
  generatedAt: z.number(),
  timeZone: z.string(),
  source: z.literal("agent-db"),
  summary: appUsageSummarySchema,
  heatmap: appUsageHeatmapSchema,
  dailyModelUsage: z.array(appUsageDailyModelUsageSchema),
  models: z.array(appUsageModelUsageSchema),
  tools: z.array(appUsageToolUsageSchema),
});

export type AppUsageSummary = z.infer<typeof appUsageSummarySchema>;
export type AppUsageHeatmapCell = z.infer<typeof appUsageHeatmapCellSchema>;
export type AppUsageHeatmapWeek = z.infer<typeof appUsageHeatmapWeekSchema>;
export type AppUsageHeatmap = z.infer<typeof appUsageHeatmapSchema>;
export type AppUsageDailyModelItem = z.infer<typeof appUsageDailyModelItemSchema>;
export type AppUsageDailyModelUsage = z.infer<typeof appUsageDailyModelUsageSchema>;
export type AppUsageModelUsage = z.infer<typeof appUsageModelUsageSchema>;
export type AppUsageToolUsage = z.infer<typeof appUsageToolUsageSchema>;
export type AppUsageFavoriteModel = z.infer<typeof appUsageFavoriteModelSchema>;
export type AppUsageSnapshot = z.infer<typeof appUsageSnapshotSchema>;

export interface AppUsageRequest {
  range: AppUsageRange;
  timeZone?: string;
}
```

- [ ] **Passo 4: confirmar a exportação no barrel do shared**

Confirme que `packages/shared/src/usage-stats.ts` já é reexportado por `packages/shared/src/index.ts` (busque por `usage-stats`). Se for `export * from "./usage-stats.js"`, nada precisa ser alterado.

- [ ] **Passo 5: verificação de compilação**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: PASS (erros a jusante referenciando o antigo `estimateTokensFromCharacterCount` / o antigo `AppUsageSnapshot` são esperados e serão corrigidos nas Tasks seguintes; neste passo basta que os tipos do próprio pacote shared sejam coerentes).

- [ ] **Passo 6: Commit**

```bash
git add packages/shared/src/usage-stats.ts
git commit -m "feat(usage): add app usage db-backed DTO schemas"
```

---

## Fase 1 — camada de leitura do banco do agent

### Task 1: contracts ganha os tipos raw de consulta e o método de porta

**Arquivos:**
- Modify: `apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts`

- [ ] **Passo 1: inserir os tipos raw de consulta antes de `UsageStorePort`**

Insira **antes** de `export interface UsageStorePort {` (cerca da linha 595):

```typescript
export interface AppUsageQueryInput {
  /** 含 (since, until] 的下界（unix ms）。 */
  since: number;
  /** 上界（unix ms），通常为 now。 */
  until: number;
  /** 调用端时区相对 UTC 的固定偏移（ms），用于按本地日归桶。 */
  tzOffsetMs: number;
}

export interface AppUsageTotalsRow {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  modelRequestCount: number;
  modelErrorCount: number;
  avgTimeToFirstTokenMs: number | null;
}

export interface AppUsageTurnTotalsRow {
  totalSessions: number;
  totalTurns: number;
  avgTurnDurationMs: number | null;
}

export interface AppUsageToolTotalsRow {
  toolCallCount: number;
  toolErrorCount: number;
}

export interface AppUsageModelRow {
  modelId: string | null;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

export interface AppUsageToolRow {
  toolName: string;
  callCount: number;
  errorCount: number;
  avgDurationMs: number | null;
}

export interface AppUsageDayRow {
  dayIndex: number;
  totalTokens: number;
  turnCount: number;
  toolCallCount: number;
}

export interface AppUsageDayModelRow {
  dayIndex: number;
  modelId: string | null;
  totalTokens: number;
}

export interface AppUsageQueryResult {
  totals: AppUsageTotalsRow;
  turnTotals: AppUsageTurnTotalsRow;
  toolTotals: AppUsageToolTotalsRow;
  models: AppUsageModelRow[];
  tools: AppUsageToolRow[];
  days: AppUsageDayRow[];
  dayModels: AppUsageDayModelRow[];
}
```

- [ ] **Passo 2: adicionar o método somente leitura na interface de porta**

Modifique `UsageStorePort` (linhas 595-600) e acrescente uma linha:

```typescript
export interface UsageStorePort {
  recordModelUsage(input: ModelUsageRecord): Promise<void>;
  upsertTurnUsage(input: TurnUsageRecord): Promise<void>;
  upsertToolUsage(input: ToolUsageRecord): Promise<void>;
  pruneUsage(input?: { beforeTime?: number }): Promise<void>;
  queryAppUsage(input: AppUsageQueryInput): Promise<AppUsageQueryResult>;
}
```

- [ ] **Passo 3: verificação de compilação**

Run: `cd apps/zcode-cli/packages/contracts && npx tsc --noEmit`
Expected: PASS (os erros da classe de implementação `SqliteSessionStore` por não implementar o novo método aparecerão no pacote dela, não dentro do pacote contracts; então PASS neste passo).

- [ ] **Passo 4: Commit**

```bash
git add apps/zcode-cli/packages/contracts/src/interfaces/session-store.port.ts
git commit -m "feat(contracts): add app usage read port + raw query types"
```

---

### Task 2: adapters implementa a agregação SQL + proxy (escreva o teste primeiro)

**Arquivos:**
- Test: `apps/zcode-cli/packages/adapters/tests/usage-query.test.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/usage.ts`
- Modify: `apps/zcode-cli/packages/adapters/src/storage/session-store/sqlite-session-store.ts`

- [ ] **Passo 1: escrever o teste que falha**

Crie `apps/zcode-cli/packages/adapters/tests/usage-query.test.ts`:

```typescript
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  createProjectId,
  createSessionId,
  createToolCallId,
  createTraceId,
  createTurnId,
} from "@zcode/contracts";
import { createSqliteSessionStore } from "../src/storage/index.js";

const DAY = 24 * 60 * 60 * 1000;

describe("queryAppUsage", () => {
  it("aggregates tokens, tools, and per-day buckets within range", async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), "zcode-usage-query-"));
    const dbPath = join(tempRoot, "session.sqlite");
    const store = createSqliteSessionStore({ dbPath });
    const sessionID = createSessionId("uq");
    const turnID = createTurnId("uq-turn");
    const now = 1_900_000_000_000; // 固定基准，避免依赖 Date.now()
    try {
      await store.createSession({
        id: sessionID,
        projectID: createProjectId("uq"),
        slug: "uq",
        directory: tempRoot,
        title: "uq",
        version: "0.1.0",
      });
      await store.recordModelUsage({
        id: "m1",
        logicalRequestId: "r1",
        sessionID,
        turnID,
        traceID: createTraceId(),
        querySource: "main_turn",
        providerID: "p",
        modelID: "model-a",
        status: "completed",
        startedAt: now - 1 * DAY,
        timeToFirstTokenMs: 100,
        inputTokens: 10,
        outputTokens: 5,
        cacheReadInputTokens: 80,
        cacheCreationInputTokens: 5,
        computedTotalTokens: 100,
      });
      await store.recordModelUsage({
        id: "m2",
        logicalRequestId: "r2",
        sessionID,
        turnID,
        querySource: "main_turn",
        providerID: "p",
        modelID: "model-a",
        status: "error",
        startedAt: now - 2 * DAY,
        inputTokens: 4,
        outputTokens: 0,
        computedTotalTokens: 4,
      });
      await store.upsertTurnUsage({
        sessionID,
        turnID,
        status: "completed",
        startedAt: now - 1 * DAY,
        durationMs: 2000,
        computedTotalTokens: 100,
      });
      await store.upsertToolUsage({
        id: "t1",
        sessionID,
        turnID,
        toolCallID: createToolCallId("c1"),
        toolName: "Read",
        status: "completed",
        startedAt: now - 1 * DAY,
        durationMs: 50,
      });
      await store.upsertToolUsage({
        id: "t2",
        sessionID,
        turnID,
        toolCallID: createToolCallId("c2"),
        toolName: "Read",
        status: "error",
        startedAt: now - 1 * DAY,
        durationMs: 150,
      });

      const result = await store.queryAppUsage({
        since: now - 30 * DAY,
        until: now,
        tzOffsetMs: 0,
      });

      expect(result.totals.totalTokens).toBe(104);
      expect(result.totals.inputTokens).toBe(14);
      expect(result.totals.cacheReadTokens).toBe(80);
      expect(result.totals.modelRequestCount).toBe(2);
      expect(result.totals.modelErrorCount).toBe(1);
      expect(result.turnTotals.totalSessions).toBe(1);
      expect(result.turnTotals.totalTurns).toBe(1);
      expect(result.toolTotals.toolCallCount).toBe(2);
      expect(result.toolTotals.toolErrorCount).toBe(1);

      const readTool = result.tools.find((t) => t.toolName === "Read");
      expect(readTool).toMatchObject({ toolName: "Read", callCount: 2, errorCount: 1 });
      expect(readTool?.avgDurationMs).toBe(100);

      const modelA = result.models.find((m) => m.modelId === "model-a");
      expect(modelA).toMatchObject({ modelId: "model-a", totalTokens: 104, requestCount: 2 });

      // 两条 model_usage 落在两个不同的本地日
      expect(result.days.length).toBe(2);
      const dayWithTurn = result.days.find((d) => d.turnCount === 1);
      expect(dayWithTurn?.totalTokens).toBe(100);
      expect(dayWithTurn?.toolCallCount).toBe(2);

      expect(result.dayModels.some((d) => d.modelId === "model-a" && d.totalTokens === 100)).toBe(
        true,
      );
    } finally {
      store.close();
      await rm(tempRoot, { force: true, recursive: true });
    }
  });
});
```

- [ ] **Passo 2: rodar para confirmar a falha**

Run: `cd apps/zcode-cli && npx vitest run packages/adapters/tests/usage-query.test.ts`
Expected: FAIL (`store.queryAppUsage is not a function`).

- [ ] **Passo 3: implementar `queryAppUsage` no repo**

Adicione ao final de `apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/usage.ts` (antes de `function integer`):

```typescript
import type {
  AppUsageQueryInput,
  AppUsageQueryResult,
  AppUsageDayRow,
  AppUsageDayModelRow,
  AppUsageModelRow,
  AppUsageToolRow,
} from "@zcode/contracts";

// 说明：按本地日归桶用固定偏移 tzOffsetMs，dayIndex = floor((started_at + off)/DAY)。
// DST 跨日边界存在最多 1 小时误差，对用量统计可接受。
export async function queryAppUsage(
  db: DatabaseSync,
  input: AppUsageQueryInput,
): Promise<AppUsageQueryResult> {
  const { since, until, tzOffsetMs } = input;
  const DAY_MS = 86_400_000;

  const totals = db
    .prepare(
      `select
         coalesce(sum(computed_total_tokens), 0) as totalTokens,
         coalesce(sum(input_tokens), 0) as inputTokens,
         coalesce(sum(output_tokens), 0) as outputTokens,
         coalesce(sum(reasoning_tokens), 0) as reasoningTokens,
         coalesce(sum(cache_creation_input_tokens), 0) as cacheCreationTokens,
         coalesce(sum(cache_read_input_tokens), 0) as cacheReadTokens,
         count(*) as modelRequestCount,
         coalesce(sum(case when status = 'error' then 1 else 0 end), 0) as modelErrorCount,
         avg(time_to_first_token_ms) as avgTimeToFirstTokenMs
       from model_usage
       where started_at >= ? and started_at <= ?`,
    )
    .get(since, until) as Record<string, number | null>;

  const turnTotals = db
    .prepare(
      `select
         count(distinct session_id) as totalSessions,
         count(*) as totalTurns,
         avg(case when status = 'completed' then duration_ms else null end) as avgTurnDurationMs
       from turn_usage
       where started_at >= ? and started_at <= ?`,
    )
    .get(since, until) as Record<string, number | null>;

  const toolTotals = db
    .prepare(
      `select
         count(*) as toolCallCount,
         coalesce(sum(case when status = 'error' then 1 else 0 end), 0) as toolErrorCount
       from tool_usage
       where started_at >= ? and started_at <= ?`,
    )
    .get(since, until) as Record<string, number>;

  const models = db
    .prepare(
      `select
         model_id as modelId,
         coalesce(sum(computed_total_tokens), 0) as totalTokens,
         coalesce(sum(input_tokens), 0) as inputTokens,
         coalesce(sum(output_tokens), 0) as outputTokens,
         count(*) as requestCount
       from model_usage
       where started_at >= ? and started_at <= ?
       group by model_id
       order by totalTokens desc`,
    )
    .all(since, until) as AppUsageModelRow[];

  const tools = db
    .prepare(
      `select
         tool_name as toolName,
         count(*) as callCount,
         coalesce(sum(case when status = 'error' then 1 else 0 end), 0) as errorCount,
         avg(duration_ms) as avgDurationMs
       from tool_usage
       where started_at >= ? and started_at <= ?
       group by tool_name
       order by callCount desc`,
    )
    .all(since, until) as AppUsageToolRow[];

  const days = db
    .prepare(
      `select
         cast((started_at + ?) / ? as integer) as dayIndex,
         coalesce(sum(computed_total_tokens), 0) as totalTokens,
         0 as turnCount,
         0 as toolCallCount
       from model_usage
       where started_at >= ? and started_at <= ?
       group by dayIndex`,
    )
    .all(tzOffsetMs, DAY_MS, since, until) as AppUsageDayRow[];

  const turnDays = db
    .prepare(
      `select cast((started_at + ?) / ? as integer) as dayIndex, count(*) as turnCount
       from turn_usage
       where started_at >= ? and started_at <= ?
       group by dayIndex`,
    )
    .all(tzOffsetMs, DAY_MS, since, until) as Array<{ dayIndex: number; turnCount: number }>;

  const toolDays = db
    .prepare(
      `select cast((started_at + ?) / ? as integer) as dayIndex, count(*) as toolCallCount
       from tool_usage
       where started_at >= ? and started_at <= ?
       group by dayIndex`,
    )
    .all(tzOffsetMs, DAY_MS, since, until) as Array<{ dayIndex: number; toolCallCount: number }>;

  // 合并三类按日统计到同一 dayIndex
  const dayMap = new Map<number, AppUsageDayRow>();
  for (const row of days) {
    dayMap.set(row.dayIndex, { ...row, turnCount: 0, toolCallCount: 0 });
  }
  for (const row of turnDays) {
    const existing = dayMap.get(row.dayIndex) ?? {
      dayIndex: row.dayIndex,
      totalTokens: 0,
      turnCount: 0,
      toolCallCount: 0,
    };
    existing.turnCount = row.turnCount;
    dayMap.set(row.dayIndex, existing);
  }
  for (const row of toolDays) {
    const existing = dayMap.get(row.dayIndex) ?? {
      dayIndex: row.dayIndex,
      totalTokens: 0,
      turnCount: 0,
      toolCallCount: 0,
    };
    existing.toolCallCount = row.toolCallCount;
    dayMap.set(row.dayIndex, existing);
  }

  const dayModels = db
    .prepare(
      `select
         cast((started_at + ?) / ? as integer) as dayIndex,
         model_id as modelId,
         coalesce(sum(computed_total_tokens), 0) as totalTokens
       from model_usage
       where started_at >= ? and started_at <= ?
       group by dayIndex, model_id`,
    )
    .all(tzOffsetMs, DAY_MS, since, until) as AppUsageDayModelRow[];

  return {
    totals: {
      totalTokens: Number(totals.totalTokens ?? 0),
      inputTokens: Number(totals.inputTokens ?? 0),
      outputTokens: Number(totals.outputTokens ?? 0),
      reasoningTokens: Number(totals.reasoningTokens ?? 0),
      cacheCreationTokens: Number(totals.cacheCreationTokens ?? 0),
      cacheReadTokens: Number(totals.cacheReadTokens ?? 0),
      modelRequestCount: Number(totals.modelRequestCount ?? 0),
      modelErrorCount: Number(totals.modelErrorCount ?? 0),
      avgTimeToFirstTokenMs:
        totals.avgTimeToFirstTokenMs == null ? null : Number(totals.avgTimeToFirstTokenMs),
    },
    turnTotals: {
      totalSessions: Number(turnTotals.totalSessions ?? 0),
      totalTurns: Number(turnTotals.totalTurns ?? 0),
      avgTurnDurationMs:
        turnTotals.avgTurnDurationMs == null ? null : Number(turnTotals.avgTurnDurationMs),
    },
    toolTotals: {
      toolCallCount: Number(toolTotals.toolCallCount ?? 0),
      toolErrorCount: Number(toolTotals.toolErrorCount ?? 0),
    },
    models: models.map((m) => ({
      modelId: m.modelId ?? null,
      totalTokens: Number(m.totalTokens),
      inputTokens: Number(m.inputTokens),
      outputTokens: Number(m.outputTokens),
      requestCount: Number(m.requestCount),
    })),
    tools: tools.map((t) => ({
      toolName: t.toolName,
      callCount: Number(t.callCount),
      errorCount: Number(t.errorCount),
      avgDurationMs: t.avgDurationMs == null ? null : Number(t.avgDurationMs),
    })),
    days: [...dayMap.values()].sort((a, b) => a.dayIndex - b.dayIndex),
    dayModels: dayModels.map((d) => ({
      dayIndex: Number(d.dayIndex),
      modelId: d.modelId ?? null,
      totalTokens: Number(d.totalTokens),
    })),
  };
}
```

- [ ] **Passo 4: fazer o proxy do novo método no sqlite-session-store**

Adicione na seção de proxy de usage de `apps/zcode-cli/packages/adapters/src/storage/session-store/sqlite-session-store.ts` (cerca das linhas 203-217, depois de `pruneUsage`):

```typescript
async queryAppUsage(
  input: import("@zcode/contracts").AppUsageQueryInput,
): Promise<import("@zcode/contracts").AppUsageQueryResult> {
  return usageRepository.queryAppUsage(this.db, input);
}
```

> Se o topo do arquivo já tiver `import * as usageRepository from "./repositories/usage.js";` e concentrarem os tipos de contracts, use o estilo de import nomeado já existente no topo, mantendo a consistência com os métodos vizinhos.

- [ ] **Passo 5: rodar o teste até passar**

Run: `cd apps/zcode-cli && npx vitest run packages/adapters/tests/usage-query.test.ts`
Expected: PASS.

- [ ] **Passo 6: Commit**

```bash
git add apps/zcode-cli/packages/adapters/src/storage/session-store/repositories/usage.ts \
        apps/zcode-cli/packages/adapters/src/storage/session-store/sqlite-session-store.ts \
        apps/zcode-cli/packages/adapters/tests/usage-query.test.ts
git commit -m "feat(adapters): aggregate app usage from sqlite usage tables"
```

---

## Fase 2 — builder + protocolo

### Task 3: builder de função pura (escreva o teste primeiro)

**Arquivos:**
- Test: `apps/zcode-cli/packages/bootstrap/tests/usage-stats-builder.test.ts`
- Create: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/usage-stats-builder.ts`

- [ ] **Passo 1: escrever o teste que falha**

Crie `apps/zcode-cli/packages/bootstrap/tests/usage-stats-builder.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import type { AppUsageQueryResult } from "@zcode/contracts";
import {
  buildAppUsageSnapshot,
  resolveTzOffsetMs,
} from "../src/zcode-protocol/usage-stats-builder.js";

const DAY = 86_400_000;

function emptyResult(): AppUsageQueryResult {
  return {
    totals: {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      modelRequestCount: 0,
      modelErrorCount: 0,
      avgTimeToFirstTokenMs: null,
    },
    turnTotals: { totalSessions: 0, totalTurns: 0, avgTurnDurationMs: null },
    toolTotals: { toolCallCount: 0, toolErrorCount: 0 },
    models: [],
    tools: [],
    days: [],
    dayModels: [],
  };
}

describe("buildAppUsageSnapshot", () => {
  it("computes summary, cache hit rate, error rates and pads heatmap days", () => {
    const until = 7 * DAY; // tzOffset 0 → dayIndex 7 == until 当天
    const since = until - 7 * DAY;
    const result = emptyResult();
    result.totals = {
      totalTokens: 1000,
      inputTokens: 100,
      outputTokens: 200,
      reasoningTokens: 0,
      cacheCreationTokens: 100,
      cacheReadTokens: 600,
      modelRequestCount: 10,
      modelErrorCount: 2,
      avgTimeToFirstTokenMs: 120,
    };
    result.turnTotals = { totalSessions: 3, totalTurns: 12, avgTurnDurationMs: 1500 };
    result.toolTotals = { toolCallCount: 20, toolErrorCount: 5 };
    result.models = [
      { modelId: "a", totalTokens: 800, inputTokens: 80, outputTokens: 160, requestCount: 8 },
      { modelId: "b", totalTokens: 200, inputTokens: 20, outputTokens: 40, requestCount: 2 },
    ];
    result.tools = [
      { toolName: "Read", callCount: 12, errorCount: 2, avgDurationMs: 50 },
      { toolName: "Bash", callCount: 8, errorCount: 3, avgDurationMs: 300 },
    ];
    // 连续两天活跃，末尾对齐 until 当天
    result.days = [
      { dayIndex: 6, totalTokens: 400, turnCount: 5, toolCallCount: 8 },
      { dayIndex: 7, totalTokens: 600, turnCount: 7, toolCallCount: 12 },
    ];
    result.dayModels = [
      { dayIndex: 7, modelId: "a", totalTokens: 500 },
      { dayIndex: 7, modelId: "b", totalTokens: 100 },
    ];

    const snapshot = buildAppUsageSnapshot(result, {
      range: "7d",
      timeZone: "UTC",
      tzOffsetMs: 0,
      generatedAt: until,
      since,
      until,
    });

    expect(snapshot.source).toBe("agent-db");
    expect(snapshot.summary.totalTokens).toBe(1000);
    // cacheHitRate = cacheRead / (input + cacheCreation + cacheRead) = 600/800
    expect(snapshot.summary.cacheHitRate).toBeCloseTo(0.75, 5);
    expect(snapshot.summary.modelErrorRate).toBeCloseTo(0.2, 5);
    expect(snapshot.summary.toolErrorRate).toBeCloseTo(0.25, 5);
    expect(snapshot.summary.totalSessions).toBe(3);
    expect(snapshot.summary.totalTurns).toBe(12);
    expect(snapshot.summary.activeDays).toBe(2);
    expect(snapshot.summary.currentStreakDays).toBe(2);
    expect(snapshot.summary.favoriteModel?.modelId).toBe("a");
    expect(snapshot.summary.favoriteModel?.share).toBeCloseTo(0.8, 5);

    // heatmap 覆盖 8 天（since..until inclusive），缺失日补 level 0
    const cells = snapshot.heatmap.weeks.flatMap((w) => w.days).filter((c) => c !== null);
    expect(cells.length).toBe(8);
    expect(snapshot.heatmap.maxTokens).toBe(600);

    // trend: until 当天有两个模型
    const lastDay = snapshot.dailyModelUsage.at(-1);
    expect(lastDay?.models.length).toBe(2);

    expect(snapshot.models[0].share).toBeCloseTo(0.8, 5);
    expect(snapshot.tools[0].errorRate).toBeCloseTo(2 / 12, 5);
  });

  it("resolveTzOffsetMs returns a finite offset for a named zone", () => {
    const off = resolveTzOffsetMs("UTC", 0);
    expect(off).toBe(0);
    expect(Number.isFinite(resolveTzOffsetMs("America/New_York", 0))).toBe(true);
  });
});
```

- [ ] **Passo 2: rodar para confirmar a falha**

Run: `cd apps/zcode-cli && npx vitest run packages/bootstrap/tests/usage-stats-builder.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Passo 3: implementar o builder**

Crie `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/usage-stats-builder.ts`:

```typescript
import type { AppUsageQueryResult } from "@zcode/contracts";
import type {
  AppUsageHeatmap,
  AppUsageHeatmapCell,
  AppUsageHeatmapWeek,
  AppUsageRange,
  AppUsageSnapshot,
} from "@zcode/shared";

const DAY_MS = 86_400_000;

export interface BuildAppUsageOptions {
  range: AppUsageRange;
  timeZone: string;
  tzOffsetMs: number;
  generatedAt: number;
  since: number;
  until: number;
}

/** 用 Intl 计算 timeZone 在 atMs 时刻相对 UTC 的偏移（ms）。无法解析时回退 0。 */
export function resolveTzOffsetMs(timeZone: string, atMs: number): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    const parts = dtf.formatToParts(new Date(atMs));
    const lookup = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const asUtc = Date.UTC(
      lookup("year"),
      lookup("month") - 1,
      lookup("day"),
      lookup("hour"),
      lookup("minute"),
      lookup("second"),
    );
    return asUtc - Math.trunc(atMs / 1000) * 1000;
  } catch {
    return 0;
  }
}

function dayIndexToDate(dayIndex: number): string {
  // dayIndex*DAY 是「本地午夜当作 UTC」的时刻，取其 UTC 日历分量即本地日期。
  return new Date(dayIndex * DAY_MS).toISOString().slice(0, 10);
}

function levelFor(tokens: number, max: number): AppUsageHeatmapCell["level"] {
  if (tokens <= 0 || max <= 0) return 0;
  const ratio = tokens / max;
  if (ratio > 0.75) return 4;
  if (ratio > 0.5) return 3;
  if (ratio > 0.25) return 2;
  return 1;
}

export function buildAppUsageSnapshot(
  result: AppUsageQueryResult,
  opts: BuildAppUsageOptions,
): AppUsageSnapshot {
  const { totals, turnTotals, toolTotals } = result;

  const cacheDenom = totals.inputTokens + totals.cacheCreationTokens + totals.cacheReadTokens;
  const cacheHitRate = cacheDenom > 0 ? totals.cacheReadTokens / cacheDenom : 0;
  const modelErrorRate =
    totals.modelRequestCount > 0 ? totals.modelErrorCount / totals.modelRequestCount : 0;
  const toolErrorRate =
    toolTotals.toolCallCount > 0 ? toolTotals.toolErrorCount / toolTotals.toolCallCount : 0;

  // 按日 token 映射，用于 activeDays / streak / heatmap
  const dayTokenMap = new Map<number, { totalTokens: number; turnCount: number; toolCallCount: number }>();
  for (const d of result.days) {
    dayTokenMap.set(d.dayIndex, {
      totalTokens: d.totalTokens,
      turnCount: d.turnCount,
      toolCallCount: d.toolCallCount,
    });
  }

  const startDayIndex = Math.floor((opts.since + opts.tzOffsetMs) / DAY_MS);
  const endDayIndex = Math.floor((opts.until + opts.tzOffsetMs) / DAY_MS);

  let activeDays = 0;
  let currentStreakDays = 0;
  let streakBroken = false;
  for (let di = endDayIndex; di >= startDayIndex; di--) {
    const tokens = dayTokenMap.get(di)?.totalTokens ?? 0;
    if (tokens > 0) {
      activeDays++;
      if (!streakBroken) currentStreakDays++;
    } else if (!streakBroken) {
      streakBroken = true;
    }
  }

  const maxTokens = result.days.reduce((m, d) => Math.max(m, d.totalTokens), 0);

  // heatmap：从 startDayIndex 到 endDayIndex，按 7 天一周切片（与现有 GitHub 式一致）
  const weeks: AppUsageHeatmapWeek[] = [];
  let week: Array<AppUsageHeatmapCell | null> = [];
  for (let di = startDayIndex; di <= endDayIndex; di++) {
    const day = dayTokenMap.get(di);
    week.push({
      date: dayIndexToDate(di),
      level: levelFor(day?.totalTokens ?? 0, maxTokens),
      totalTokens: day?.totalTokens ?? 0,
      turnCount: day?.turnCount ?? 0,
      toolCallCount: day?.toolCallCount ?? 0,
    });
    if (week.length === 7) {
      weeks.push({ weekIndex: weeks.length, days: week });
      week = [];
    }
  }
  if (week.length > 0) {
    while (week.length < 7) week.push(null);
    weeks.push({ weekIndex: weeks.length, days: week });
  }

  const heatmap: AppUsageHeatmap = {
    startDate: dayIndexToDate(startDayIndex),
    endDate: dayIndexToDate(endDayIndex),
    maxTokens,
    weeks,
  };

  // trend：按日聚合 dayModels
  const dailyMap = new Map<number, Map<string | null, number>>();
  for (const dm of result.dayModels) {
    const inner = dailyMap.get(dm.dayIndex) ?? new Map();
    inner.set(dm.modelId, (inner.get(dm.modelId) ?? 0) + dm.totalTokens);
    dailyMap.set(dm.dayIndex, inner);
  }
  const dailyModelUsage = [];
  for (let di = startDayIndex; di <= endDayIndex; di++) {
    const inner = dailyMap.get(di);
    dailyModelUsage.push({
      date: dayIndexToDate(di),
      models: inner
        ? [...inner.entries()].map(([modelId, totalTokens]) => ({ modelId, totalTokens }))
        : [],
    });
  }

  // 模型排行 + favorite
  const totalModelTokens = result.models.reduce((s, m) => s + m.totalTokens, 0);
  const models = result.models.map((m) => ({
    modelId: m.modelId,
    totalTokens: m.totalTokens,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    requestCount: m.requestCount,
    share: totalModelTokens > 0 ? m.totalTokens / totalModelTokens : 0,
  }));
  const favoriteModel =
    models.length > 0
      ? { modelId: models[0].modelId, totalTokens: models[0].totalTokens, share: models[0].share }
      : null;

  const tools = result.tools.map((t) => ({
    toolName: t.toolName,
    callCount: t.callCount,
    errorCount: t.errorCount,
    errorRate: t.callCount > 0 ? t.errorCount / t.callCount : 0,
    avgDurationMs: t.avgDurationMs,
  }));

  return {
    range: opts.range,
    generatedAt: opts.generatedAt,
    timeZone: opts.timeZone,
    source: "agent-db",
    summary: {
      totalTokens: totals.totalTokens,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      reasoningTokens: totals.reasoningTokens,
      cacheCreationTokens: totals.cacheCreationTokens,
      cacheReadTokens: totals.cacheReadTokens,
      cacheHitRate,
      totalSessions: turnTotals.totalSessions,
      totalTurns: turnTotals.totalTurns,
      toolCallCount: toolTotals.toolCallCount,
      toolErrorRate,
      modelErrorRate,
      avgTimeToFirstTokenMs: totals.avgTimeToFirstTokenMs,
      avgTurnDurationMs: turnTotals.avgTurnDurationMs,
      activeDays,
      currentStreakDays,
      favoriteModel,
    },
    heatmap,
    dailyModelUsage,
    models,
    tools,
  };
}
```

- [ ] **Passo 4: rodar o teste até passar**

Run: `cd apps/zcode-cli && npx vitest run packages/bootstrap/tests/usage-stats-builder.test.ts`
Expected: PASS.

- [ ] **Passo 5: Commit**

```bash
git add apps/zcode-cli/packages/bootstrap/src/zcode-protocol/usage-stats-builder.ts \
        apps/zcode-cli/packages/bootstrap/tests/usage-stats-builder.test.ts
git commit -m "feat(bootstrap): pure app usage snapshot builder"
```

---

### Task 4: método de protocolo `usage/stats` (schema + handler + dispatch + agentService do host)

**Arquivos:**
- Modify: `packages/shared/src/zcode-protocol/index.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`
- Modify: `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts`
- Modify: `packages/services/src/zcode-agent/zcodeAgentService.ts`（e os arquivos de definição de tipos/parâmetros/interfaces对应）

- [ ] **Passo 1: adicionar o método e o schema no arquivo de protocolo do shared**

Em `packages/shared/src/zcode-protocol/index.ts`:

(a) Dentro do objeto `zcodeProtocolMethods` (cerca da linha 1687), adicione uma entrada perto da linha `promptEnhance`:

```typescript
  usageStats: "usage/stats",
```

(b) Na região de definição de schemas (na mesma seção de `zcodeSessionListParamsSchema`, perto da linha 1255) adicione o schema de parâmetros, referenciando o `appUsageSnapshotSchema` da Task 0:

```typescript
import { appUsageSnapshotSchema, APP_USAGE_RANGES } from "../usage-stats.js";

export const zcodeUsageStatsParamsSchema = z
  .object({
    range: z.enum(APP_USAGE_RANGES),
    timeZone: z.string().optional(),
  })
  .strict();
export type ZCodeUsageStatsParams = z.infer<typeof zcodeUsageStatsParamsSchema>;

export const zcodeUsageStatsResultSchema = appUsageSnapshotSchema;
export type ZCodeUsageStatsResult = z.infer<typeof zcodeUsageStatsResultSchema>;
```

> Se `index.ts` já importar outros símbolos de `../usage-stats.js`, mescle no mesmo import.

(c) No objeto de mapeamento método→schema do contrato (cerca da linha 1731, no mesmo formato de `[zcodeProtocolMethods.sessionList]: {...}`) adicione:

```typescript
[zcodeProtocolMethods.usageStats]: {
  params: zcodeUsageStatsParamsSchema,
  result: zcodeUsageStatsResultSchema,
},
```

- [ ] **Passo 2: escrever o handler**

Em `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts`, modelando `listSessions` (cerca da linha 114) adicione:

```typescript
import {
  zcodeUsageStatsParamsSchema,
  // ...已有 import
} from "@zcode/shared";
import {
  buildAppUsageSnapshot,
  resolveTzOffsetMs,
} from "./usage-stats-builder.js";

const APP_USAGE_RANGE_DAYS: Record<string, number> = { "7d": 7, "30d": 30 };

export async function getUsageStats(
  context: ZCodeProtocolAgentServerContext,
  rawParams: unknown,
) {
  const params = parseParams(zcodeUsageStatsParamsSchema, rawParams ?? {});
  const timeZone = params.timeZone ?? "UTC";
  const until = Date.now();
  const tzOffsetMs = resolveTzOffsetMs(timeZone, until);
  const rangeDays = APP_USAGE_RANGE_DAYS[params.range] ?? 30;
  const since = until - rangeDays * 86_400_000;

  if (!context.deps.sessionStore) {
    // 无 sessionStore（不应发生）：返回空快照而非抛错，便于 UI 显示空态。
    return buildAppUsageSnapshot(
      {
        totals: {
          totalTokens: 0,
          inputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
          cacheCreationTokens: 0,
          cacheReadTokens: 0,
          modelRequestCount: 0,
          modelErrorCount: 0,
          avgTimeToFirstTokenMs: null,
        },
        turnTotals: { totalSessions: 0, totalTurns: 0, avgTurnDurationMs: null },
        toolTotals: { toolCallCount: 0, toolErrorCount: 0 },
        models: [],
        tools: [],
        days: [],
        dayModels: [],
      },
      { range: params.range, timeZone, tzOffsetMs, generatedAt: until, since, until },
    );
  }

  const result = await context.deps.sessionStore.queryAppUsage({ since, until, tzOffsetMs });
  return buildAppUsageSnapshot(result, {
    range: params.range,
    timeZone,
    tzOffsetMs,
    generatedAt: until,
    since,
    until,
  });
}
```

> Confirme que o tipo de `context.deps.sessionStore` já inclui `queryAppUsage` (a Task 1 já o adicionou ao `UsageStorePort`). Se o tipo de `sessionStore` for uma interface composta, certifique-se de que ela herda/contém `UsageStorePort`.

- [ ] **Passo 3: adicionar o case no switch de dispatch**

Dentro do switch de `dispatchRequest` em `apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts` (cerca da linha 99), modelando `sessionList` adicione:

```typescript
    case zcodeProtocolMethods.usageStats:
      return await getUsageStats(this.context, request.params);
```

E inclua `getUsageStats` nos imports nomeados do topo do arquivo, vindos de `./server-operations.js`.

- [ ] **Passo 4: adicionar `getAppUsageStats` no zcodeAgentService do host**

Em `packages/services/src/zcode-agent/zcodeAgentService.ts`, modelando `listSessions` (cerca da linha 382) adicione o método:

```typescript
async getAppUsageStats(params: ZCodeAgentAppUsageParams) {
  const client = await getClient(params);
  return client.request(
    zcodeProtocolMethods.usageStats,
    { range: params.range, timeZone: params.timeZone },
    zcodeUsageStatsResultSchema,
  );
},
```

Adicione `zcodeUsageStatsResultSchema` aos imports do topo do arquivo (vindo de `@zcode/shared`).

Defina o tipo de parâmetros `ZCodeAgentAppUsageParams` (ao lado dos tipos de parâmetros existentes desse service, reutilizando a base `ZCodeAgentWorkspaceTarget`):

```typescript
export interface ZCodeAgentAppUsageParams extends ZCodeAgentWorkspaceTarget {
  range: AppUsageRange;
  timeZone?: string;
}
```

E adicione na interface `IZCodeAgentService` (no arquivo de declaração de interface desse service):

```typescript
getAppUsageStats(params: ZCodeAgentAppUsageParams): Promise<AppUsageSnapshot>;
```

> `AppUsageRange` / `AppUsageSnapshot` são importados de `@zcode/shared`.

> **Nota de arquitetura (leitura obrigatória por quem implementa)**: as tabelas de usage ficam no store global de sessions (`~/.zcode/sessions/default.db`), então o agent client de qualquer workspace consulta dados de escopo de todo o aplicativo. `getAppUsageStats` pode simplesmente reutilizar `getClient(params)` para obter o client do workspace ativo atual; ele precisa de um `ZCodeAgentWorkspaceTarget`. O serviço do host (Task 5) vai passar o alvo do workspace ativo atual, de forma consistente com as demais chamadas de `zcodeAgentService`.

- [ ] **Passo 5: verificação de compilação de tipos**

Run: `cd /Users/dev/workspace/z-code && npx tsc --noEmit -p packages/shared && npx tsc --noEmit -p apps/zcode-cli/packages/bootstrap`
Expected: PASS.

- [ ] **Passo 6: Commit**

```bash
git add packages/shared/src/zcode-protocol/index.ts \
        apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server-operations.ts \
        apps/zcode-cli/packages/bootstrap/src/zcode-protocol/server.ts \
        packages/services/src/zcode-agent/zcodeAgentService.ts
git commit -m "feat(protocol): add usage/stats method end to end"
```

---

## Fase 3 — troca de fonte no serviço do host

### Task 5: reescrever `usageStatsService.getAppUsageSnapshot` passando pelo protocolo + remover a pipeline antiga

**Arquivos:**
- Modify: `packages/services/src/usage-stats/usageStats.ts`
- Modify: `packages/services/src/usage-stats/usageStatsService.ts`
- Modify: `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`
- Delete: `packages/services/src/usage-stats/usageStatsAggregator.ts`、`packages/services/src/usage-stats/repo/sessionUsageRepo.ts`、`packages/services/src/usage-stats/usageStatsSeries.ts`（exclua se existirem）

- [ ] **Passo 1: atualizar o tipo de entrada da interface**

Na linha 15 de `packages/services/src/usage-stats/usageStats.ts`, a entrada `AppUsageRequest` de `getAppUsageSnapshot` já é o novo tipo (range: AppUsageRange, alterado na Task 0). Basta confirmar que o `AppUsageRequest` / `AppUsageSnapshot` importado nesse arquivo vem das novas definições de `@zcode/shared`; não é preciso alterar o texto da assinatura.

- [ ] **Passo 2: alterar as dependências e o corpo do método em `createUsageStatsService`**

Em `packages/services/src/usage-stats/usageStatsService.ts`:

(a) Adicione `zcodeAgentService` à interface de dependências:

```typescript
interface UsageStatsServiceDependencies {
  apiClient: ApiClient;
  modelProviderService: IModelProviderService;
  credentialService?: Pick<ICredentialService, "load">;
  env?: NodeJS.ProcessEnv;
  zcodeAgentService: Pick<IZCodeAgentService, "getAppUsageStats">;
  /** 解析当前活动 workspace 目标（与其它 agent 调用一致）。 */
  resolveActiveWorkspaceTarget: () => ZCodeAgentWorkspaceTarget;
}
```

(b) Import no topo:

```typescript
import type { IZCodeAgentService, ZCodeAgentWorkspaceTarget } from "../zcode-agent/zcodeAgentService.js";
```

(c) Reescreva `getAppUsageSnapshot` (substituindo as linhas 45-52):

```typescript
async getAppUsageSnapshot(request: AppUsageRequest): Promise<AppUsageSnapshot> {
  // App Usage 现读取 agent 数据库真实统计（model_usage/turn_usage/tool_usage），
  // 经 ZCode Protocol usage/stats 取回。不再读本地 session JSON 估算。
  const target = dependencies.resolveActiveWorkspaceTarget();
  return dependencies.zcodeAgentService.getAppUsageStats({
    ...target,
    range: request.range,
    timeZone: request.timeZone,
  });
},
```

(d) Remova do topo do arquivo os imports de `readPersistedSessionFiles` / `buildUsageStatsSnapshot`.

- [ ] **Passo 3: remover os arquivos da antiga pipeline de agregação local**

```bash
git rm packages/services/src/usage-stats/usageStatsAggregator.ts \
       packages/services/src/usage-stats/repo/sessionUsageRepo.ts \
       packages/services/src/usage-stats/usageStatsSeries.ts
```

> Se algum arquivo não existir, pule essa linha. Em seguida, rode `grep -rn "usageStatsAggregator\|sessionUsageRepo\|usageStatsSeries\|estimateTokensFromCharacterCount\|buildUsageStatsSnapshot" packages/` e limpe todos os imports/Referências restantes (incluindo arquivos de teste antigos, que devem ser deletados ou reescritos).

- [ ] **Passo 4: injetar a dependência no host**

Em `packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`, as linhas 98-105 passam a ser:

```typescript
      .register(
        IUsageStatsService,
        createUsageStatsService({
          apiClient: localApiClient,
          modelProviderService: localModelProviderService,
          credentialService: localCredentialService,
          zcodeAgentService: params.connectionServices.zcodeAgentService,
          resolveActiveWorkspaceTarget: params.resolveActiveWorkspaceTarget,
        }),
      )
```

> Se `params.resolveActiveWorkspaceTarget` ainda não for fornecido nos params atuais: adicione essa função aos parâmetros de `createRemoteWorkspaceServiceCollection`, passando-a do chamador (o lugar que já detém o contexto do workspace atual). Reutilize a lógica existente de construção de workspace target — `buildWorkspaceRef` / os constructs atuais de workspace target: busque neste arquivo os pontos a montante que já usam `params.connectionServices.zcodeAgentService`, confirme a origem do alvo de workspace e faça a conexão.

- [ ] **Passo 5: verificação de compilação**

Run: `cd /Users/dev/workspace/z-code && npx tsc --noEmit -p packages/services && npx tsc --noEmit -p packages/desktop`
Expected: PASS.

- [ ] **Passo 6: Commit**

```bash
git add packages/services/src/usage-stats packages/desktop/src/host/remoteWorkspaceServiceCollection.ts
git commit -m "feat(services): app usage reads agent db via protocol; drop local estimator"
```

---

## Fase 4 — redesenho da UI

> Observação: as alterações de UI seguem a nova estrutura de `AppUsageSnapshot`. Todos os `formatCompactNumber` / `formatPercent` / `UsageMetricCard` / `UsageEmptyState` / `resolveModelLabel` reutilizam as exportações existentes de `usageStatsUiParts.tsx`.

### Task 6: intervalo de tempo passa a 7d/30d + tipos do hook

**Arquivos:**
- Modify: `packages/ui/src/settings/usage-stats/usageStatsUiParts.tsx`
- Modify: `packages/ui/src/hooks/useUsageStats.ts`
- Modify: `packages/ui/src/settings/usage-stats/AppUsagePanel.tsx`

- [ ] **Passo 1: mudar `RANGE_OPTIONS` para as faixas do App Usage**

Em `usageStatsUiParts.tsx`, encontre a definição de `RANGE_OPTIONS` e altere para:

```typescript
import type { AppUsageRange } from "@zcode/shared";
export const RANGE_OPTIONS: AppUsageRange[] = ["7d", "30d"];
```

- [ ] **Passo 2: mudar o tipo de parâmetro de `useAppUsageStats` para `AppUsageRange`**

Em `packages/ui/src/hooks/useUsageStats.ts`: troque `useAppUsageStats(range: UsageStatsRange)` (linha 163) por `range: AppUsageRange` e acrescente `AppUsageRange` (vindo de `@zcode/shared`) aos imports do topo. `useUsageStats` / `useCodingPlanUsageStats` continuam com `UsageStatsRange` / `CodingPlanUsageRange` sem alteração.

- [ ] **Passo 3: valor padrão do painel e tipo dos tabs**

Em `AppUsagePanel.tsx`:
- Linha 32: `useState<UsageStatsRange>("all")` → `useState<AppUsageRange>("30d")`.
- Import (linha 17): `UsageStatsRange` → `AppUsageRange`.
- Tipo das props de `AppUsageRangeTabs`: `UsageStatsRange` → `AppUsageRange` (linhas 209-211).

- [ ] **Passo 4: verificação de compilação (parcial)**

Run: `cd /Users/dev/workspace/z-code && npx tsc --noEmit -p packages/ui`
Expected: ainda haverá erros de campos de summary/heatmap porque as Tasks seguintes não estão concluídas — neste passo confirme apenas que não há erros de tipo relacionados a range (ignore os erros de campos summary/heatmap, que serão corrigidos na próxima Task).

- [ ] **Passo 5: Commit**

```bash
git add packages/ui/src/hooks/useUsageStats.ts packages/ui/src/settings/usage-stats/usageStatsUiParts.tsx packages/ui/src/settings/usage-stats/AppUsagePanel.tsx
git commit -m "feat(ui): app usage range 7d/30d"
```

---

### Task 7: cards de resumo passam a usar métricas reais

**Arquivos:**
- Modify: `packages/ui/src/settings/usage-stats/AppUsagePanel.tsx`

- [ ] **Passo 1: substituir a grade de cards de resumo**

Troque a atribuição de `favoriteModel` / `peakHour` nas linhas 75-76 por:

```typescript
  const summary = snapshot.summary;
  const favoriteModel = summary.favoriteModel;
```

Substitua toda a grade de cards de resumo `<div className="grid ...">…</div>` das linhas 87-168 pelos 8 cards a seguir (os ícones vêm do lucide-react, já importados nas linhas 1-10; adicione `Wrench`, `AlertTriangle`, `Timer`, `Database` aos imports):

```tsx
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <UsageMetricCard
          icon={Flame}
          label={intl.formatMessage({ id: "settings.usage.totalTokens" })}
          value={formatCompactNumber(locale, summary.totalTokens)}
          helper={intl.formatMessage(
            { id: "settings.usage.tokenBreakdown" },
            {
              input: formatCompactNumber(locale, summary.inputTokens),
              output: formatCompactNumber(locale, summary.outputTokens),
            },
          )}
        />
        <UsageMetricCard
          icon={Database}
          label={intl.formatMessage({ id: "settings.usage.cacheHitRate" })}
          value={formatPercent(locale, summary.cacheHitRate)}
        />
        <UsageMetricCard
          icon={Activity}
          label={intl.formatMessage({ id: "settings.usage.sessions" })}
          value={formatCompactNumber(locale, summary.totalSessions)}
        />
        <UsageMetricCard
          icon={MessageSquare}
          label={intl.formatMessage({ id: "settings.usage.turns" })}
          value={formatCompactNumber(locale, summary.totalTurns)}
        />
        <UsageMetricCard
          icon={Wrench}
          label={intl.formatMessage({ id: "settings.usage.toolCalls" })}
          value={formatCompactNumber(locale, summary.toolCallCount)}
          helper={intl.formatMessage(
            { id: "settings.usage.errorRate" },
            { rate: formatPercent(locale, summary.toolErrorRate) },
          )}
        />
        <UsageMetricCard
          icon={AlertTriangle}
          label={intl.formatMessage({ id: "settings.usage.modelErrorRate" })}
          value={formatPercent(locale, summary.modelErrorRate)}
        />
        <UsageMetricCard
          icon={Timer}
          label={intl.formatMessage({ id: "settings.usage.avgTtft" })}
          value={
            summary.avgTimeToFirstTokenMs == null
              ? "--"
              : `${formatCompactNumber(locale, Math.round(summary.avgTimeToFirstTokenMs))}ms`
          }
        />
        <UsageMetricCard
          icon={Activity}
          label={intl.formatMessage({ id: "settings.usage.favoriteModel" })}
          value={
            favoriteModel
              ? formatFavoriteModelMetricValue(resolveModelLabel(intl, favoriteModel.modelId))
              : "--"
          }
          valueSize="sm"
          helper={
            favoriteModel
              ? intl.formatMessage(
                  { id: "settings.usage.favoriteModelShare" },
                  { share: formatPercent(locale, favoriteModel.share) },
                )
              : undefined
          }
        />
      </div>
```

Atualize o import das linhas 1-10:

```typescript
import {
  Activity,
  AlertTriangle,
  Database,
  Flame,
  MessageSquare,
  RefreshCcw,
  Timer,
  Wrench,
} from "lucide-react";
```

> Remova `CalendarDays`, `Gauge`, `TrendingUp`, `Zap` que não forem mais usados (a menos que heatmap/tendência ainda os usem; siga os erros do tsc).

- [ ] **Passo 2: verificação de compilação**

Run: `cd /Users/dev/workspace/z-code && npx tsc --noEmit -p packages/ui`
Expected: os erros de campos do resumo desaparecem; os erros restantes de heatmap/tendência são corrigidos nas Tasks seguintes.

- [ ] **Passo 3: Commit**

```bash
git add packages/ui/src/settings/usage-stats/AppUsagePanel.tsx
git commit -m "feat(ui): real-token summary cards for app usage"
```

---

### Task 8: heatmap passa a 30 dias (adaptação de campos)

**Arquivos:**
- Modify: `packages/ui/src/settings/usage-stats/usageStatsUiParts.tsx`
- Modify: `packages/ui/src/settings/usage-stats/AppUsagePanel.tsx`

- [ ] **Passo 1: adaptar as props de `UsageHeatmap` e os campos da célula**

No componente `UsageHeatmap` de `usageStatsUiParts.tsx`:
- O tipo das props `weeks` muda de `UsageStatsHeatmapWeek[]` para `AppUsageHeatmapWeek[]` (importado de `@zcode/shared`).
- Tooltip e cores da célula: use `cell.totalTokens` (substituindo o antigo `totalEstimatedTokens`/`activityScore`), com o texto do tooltip passando a usar o novo i18n:

```tsx
title={intl.formatMessage(
  { id: "settings.usage.heatmapCell" },
  {
    date: cell.date,
    tokens: formatCompactNumber(locale, cell.totalTokens),
    turns: cell.turnCount,
  },
)}
```

- A semântica do campo `level` não muda (0-4) e o mapeamento de cores é preservado.
- Remova a dependência de `monthLabels` (a nova estrutura não tem esse campo); se o componente atual renderiza rótulos de mês, passe a não renderizá-los ou derive-os de `weeks[i].days[0]?.date` (opcional: no intervalo de 30 dias os rótulos de mês têm pouco sentido, recomenda-se simplesmente remover o bloco de rótulos de mês).

- [ ] **Passo 2: ponto de renderização no painel permanece inalterado**

Manter `<UsageHeatmap weeks={snapshot.heatmap.weeks} .../>` nas linhas 170-176 de `AppUsagePanel.tsx`; confirme que `snapshot.heatmap.weeks` agora tem a nova estrutura (já tem).

- [ ] **Passo 3: verificação de compilação**

Run: `cd /Users/dev/workspace/z-code && npx tsc --noEmit -p packages/ui`
Expected: os erros de campos do heatmap desaparecem.

- [ ] **Passo 4: Commit**

```bash
git add packages/ui/src/settings/usage-stats/usageStatsUiParts.tsx packages/ui/src/settings/usage-stats/AppUsagePanel.tsx
git commit -m "feat(ui): 30-day token heatmap"
```

---

### Task 9: gráfico de tendência passa a usar tokens reais + adaptação dos campos do ranking de modelos

**Arquivos:**
- Modify: `packages/ui/src/settings/usage-stats/AppUsageDailyModelBarChart.tsx`
- Modify: `packages/ui/src/settings/usage-stats/AppUsagePanel.tsx`

- [ ] **Passo 1: o gráfico de tendência passa a ler `totalTokens`**

Em `AppUsageDailyModelBarChart.tsx`: troque as leituras de `snapshot.dailyModelUsage[].models[].totalEstimatedTokens` por `totalTokens` (novo campo de `AppUsageDailyModelItem`). A lógica de bucketing/stacking permanece. O tipo de `snapshot.dailyModelUsage` agora é `AppUsageDailyModelUsage[]`.

- [ ] **Passo 2: adaptar os campos do ranking de modelos**

Em `AppUsageModelRanking` de `AppUsagePanel.tsx` (linhas 235-274):
- `model.inputEstimatedTokens` → `model.inputTokens`
- `model.outputEstimatedTokens` → `model.outputTokens`
- `model.share` permanece; `resolveModelLabel(intl, model.modelId)` permanece.

- [ ] **Passo 3: verificação de compilação**

Run: `cd /Users/dev/workspace/z-code && npx tsc --noEmit -p packages/ui`
Expected: os erros de campos de tendência/ranking desaparecem.

- [ ] **Passo 4: Commit**

```bash
git add packages/ui/src/settings/usage-stats/AppUsageDailyModelBarChart.tsx packages/ui/src/settings/usage-stats/AppUsagePanel.tsx
git commit -m "feat(ui): real-token trend and model ranking"
```

---

### Task 10: novo bloco "Uso de ferramentas"

**Arquivos:**
- Modify: `packages/ui/src/settings/usage-stats/AppUsagePanel.tsx`

- [ ] **Passo 1: adicionar o componente `AppUsageToolUsageSection`**

Ao final de `AppUsagePanel.tsx` adicione:

```tsx
function AppUsageToolUsageSection({ snapshot }: { snapshot: AppUsageSnapshot }) {
  const { intl, locale } = useZCodeIntl();
  const tools = snapshot.tools;
  const maxCalls = tools.reduce((m, t) => Math.max(m, t.callCount), 0);

  return (
    <section className="space-y-3 rounded-lg bg-surface p-4">
      <h3 className="text-sm font-medium text-foreground">
        {intl.formatMessage({ id: "settings.usage.toolUsageTitle" })}
      </h3>
      {tools.length === 0 ? (
        <UsageEmptyState
          title={intl.formatMessage({ id: "settings.usage.emptyTitle" })}
          description={intl.formatMessage({ id: "settings.usage.emptyDescription" })}
        />
      ) : (
        <div className="space-y-2">
          {tools.map((tool) => (
            <div
              key={tool.toolName}
              className="grid gap-2 border-b border-border/70 py-2 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="truncate font-mono text-sm text-foreground">{tool.toolName}</div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-border/40">
                  <div
                    className="h-full rounded bg-primary/70"
                    style={{ width: `${maxCalls > 0 ? (tool.callCount / maxCalls) * 100 : 0}%` }}
                  />
                </div>
              </div>
              <div className="text-xs text-foreground-subtle">
                {formatCompactNumber(locale, tool.callCount)}{" "}
                {intl.formatMessage({ id: "settings.usage.toolCallsUnit" })}
                {tool.avgDurationMs == null
                  ? null
                  : ` · ${formatCompactNumber(locale, Math.round(tool.avgDurationMs))}ms`}
              </div>
              <div className="text-right text-sm font-medium text-foreground">
                {intl.formatMessage(
                  { id: "settings.usage.errorRate" },
                  { rate: formatPercent(locale, tool.errorRate) },
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Passo 2: inserir o bloco no ponto de renderização do painel**

Dentro do return de `AppUsagePanel`, após `<AppUsageModelRanking snapshot={snapshot} />` na linha 179, adicione:

```tsx
      <AppUsageToolUsageSection snapshot={snapshot} />
```

- [ ] **Passo 3: verificação de compilação**

Run: `cd /Users/dev/workspace/z-code && npx tsc --noEmit -p packages/ui`
Expected: PASS (sem erros de tipo no pacote de UI).

- [ ] **Passo 4: Commit**

```bash
git add packages/ui/src/settings/usage-stats/AppUsagePanel.tsx
git commit -m "feat(ui): tool usage section"
```

---

### Task 11: textos de i18n (adições e remoções)

**Arquivos:**
- Modify: os arquivos de messages zh/en da UI (busque por `settings.usage.totalTokens` para localizar, normalmente `packages/ui/src/i18n/messages/{zh,en}.*`)

- [ ] **Passo 1: localizar os arquivos de messages**

Run: `grep -rln "settings.usage.totalTokens" packages/ui/src`
Anote os caminhos dos dois arquivos, zh e en.

- [ ] **Passo 2: adicionar novas keys (tanto em chinês quanto em inglês)**

Adicione as keys a seguir (exemplo em chinês; preencha o arquivo em inglês com o texto correspondente):

```
"settings.usage.tokenBreakdown": "输入 {input} · 输出 {output}",
"settings.usage.cacheHitRate": "缓存命中率",
"settings.usage.turns": "对话轮次",
"settings.usage.toolCalls": "工具调用",
"settings.usage.errorRate": "错误率 {rate}",
"settings.usage.modelErrorRate": "请求错误率",
"settings.usage.avgTtft": "平均首字延迟",
"settings.usage.heatmapCell": "{date}：{tokens} tokens · {turns} 轮",
"settings.usage.toolUsageTitle": "工具使用",
"settings.usage.toolCallsUnit": "次",
```

O arquivo em inglês correspondente:

```
"settings.usage.tokenBreakdown": "{input} in · {output} out",
"settings.usage.cacheHitRate": "Cache hit rate",
"settings.usage.turns": "Turns",
"settings.usage.toolCalls": "Tool calls",
"settings.usage.errorRate": "Error {rate}",
"settings.usage.modelErrorRate": "Request error rate",
"settings.usage.avgTtft": "Avg TTFT",
"settings.usage.heatmapCell": "{date}: {tokens} tokens · {turns} turns",
"settings.usage.toolUsageTitle": "Tool usage",
"settings.usage.toolCallsUnit": "calls",
```

- [ ] **Passo 3: remover as keys que não são mais referenciadas**

Remova (após confirmar que não há outras referências): `settings.usage.messages`、`settings.usage.currentStreak`、`settings.usage.longestStreak`、`settings.usage.peakHour`、`settings.usage.peakHourTokens`、`settings.usage.range.all`。

Run: `grep -rn "settings.usage.range.all\|settings.usage.peakHour\|settings.usage.messages\b" packages/ui/src`
Expected: apenas o próprio arquivo de messages é encontrado (nenhum componente referencia), então remova.

- [ ] **Passo 4: compilação + lint + suíte completa de testes**

Run: `cd /Users/dev/workspace/z-code && npm run lint && npm test`
Expected: PASS.

- [ ] **Passo 5: Commit**

```bash
git add packages/ui/src/i18n
git commit -m "feat(ui): app usage i18n keys"
```

---

## Verificação final

- [ ] **Passo 1: lint + testes completos**

Run: `cd /Users/dev/workspace/z-code && npm run lint && npm test`
Expected: PASS.

- [ ] **Passo 2: varredura de referências residuais**

Run: `grep -rn "estimateTokensFromCharacterCount\|totalEstimatedTokens\|activityScore\|readPersistedSessionFiles\|usageStatsAggregator" packages/ apps/ --include=*.ts --include=*.tsx`
Expected: nenhuma ocorrência em código de negócio (apenas em documentos spec/plan, ou o `totalEstimatedTokens` próprio do monitor do Coding Plan, caso exista, permanece sob julgamento).

- [ ] **Passo 3: verificação manual integrada (opcional, conforme a skill verify)**

Inicie o aplicativo, abra Configurações → Estatísticas de uso → Uso do aplicativo e confirme: troca entre 7d/30d, os 8 cards de resumo com valores reais, o heatmap de 30 dias, a tendência com tokens reais e o bloco de uso de ferramentas.

---

## Autoverificação (plano vs spec)

- **Fluxo de dados (ZCode Protocol)**: Tasks 1-5 cobrem o caminho completo contracts→adapters→handler do bootstrap→schema do shared→serviço do host. ✓
- **Remoção da pipeline de estimativa por caracteres**: Task 0 (tipos) + Task 5 (remoção de arquivos/Referências). ✓
- **8 cards de resumo (tokens reais/taxa de acerto de cache/sessões/turnos/ferramentas/taxa de erro/TTFT/modelo mais usado)**: Task 7. ✓
- **Heatmap de 30 dias**: Task 3 (weeks do builder) + Task 8 (UI). ✓
- **Tendência com tokens reais**: Task 3 (dailyModelUsage) + Task 9. ✓
- **Bloco de uso de ferramentas**: Task 2 (SQL) + Task 3 (tools) + Task 10 (UI). ✓
- **Métricas de confiabilidade**: Task 2/3 (errorRate/TTFT/durations) + Task 7. ✓
- **Filtro de tempo 7d/30d removendo "todos"**: Task 6 + Task 11 (remoção de range.all). ✓
- **Retenção de 30 dias / estado vazio**: fallback do handler para sessionStore vazio + o `UsageStatsErrorNotice`/`UsageEmptyState` existentes. ✓
- **Coding Plan / monitor intocados**: apenas o caminho de App Usage é alterado; `UsageStatsRange`/`getSnapshot` são preservados. ✓