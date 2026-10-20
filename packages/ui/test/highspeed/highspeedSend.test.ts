import { describe, expect, it } from "vitest";
import type { HighspeedPrepareTurnResult, HighspeedTurnExecution } from "@zcode/shared";
import {
  buildHighspeedRuntimeOverride,
  prepareHighspeedSendContext,
} from "../../src/highspeed/highspeedSend.js";

const card = {
  cardId: "hsc-1",
  taskId: "task-1",
  provider: "zai",
  model: "glm-5",
  issuedAt: 1_000,
  expiresAt: 10_000,
};

/**
 * 加速执行材料只带「本轮选哪个模型」和「本次执行鉴权」：端点、API 形态、模型能力都由
 * 隐藏内建 Provider Config 提供，不再随单次发送下发 provider 定义。
 */
const execution = {
  modelSelection: { providerId: "account:zai-highspeed-card", modelId: "glm-5" },
  requestAuth: {
    apiKey: "jwt",
    headers: { Authorization: "Bearer jwt", "X-Highspeed-Card-ID": "hsc-1" },
  },
  selectionFallback: {
    providerId: "account:zai-highspeed-card",
    rules: [
      { reason: "highspeed_card_expired", providerErrorCode: "3402" },
      { reason: "highspeed_request_failed" },
    ],
    target: { providerId: "account:zai-team-coding-plan", modelId: "glm-5" },
  },
} satisfies HighspeedTurnExecution;

describe("buildHighspeedRuntimeOverride", () => {
  it("persists card metadata without overriding the normal route for an accelerated mock card", () => {
    const result: HighspeedPrepareTurnResult = {
      kind: "accelerated",
      card,
      nextDrawAt: 20_000,
    };

    expect(buildHighspeedRuntimeOverride(result)).toEqual({
      highspeedMeta: {
        schemaVersion: 1,
        ...card,
      },
    });
  });

  it("injects the Highspeed selection and execution-scoped auth for a real accelerated card", () => {
    const result: HighspeedPrepareTurnResult = {
      kind: "accelerated",
      card,
      nextDrawAt: 20_000,
      execution,
    };

    expect(buildHighspeedRuntimeOverride(result)).toEqual({
      highspeedMeta: {
        schemaVersion: 1,
        ...card,
      },
      modelSelection: execution.modelSelection,
      // selectionScope=execution 是加速轮的关键约束：只作用于本轮执行，不写 Session Selection。
      modelExecution: {
        selectionScope: "execution",
        requestAuth: execution.requestAuth,
        selectionFallback: execution.selectionFallback,
      },
    });
  });
});

describe("prepareHighspeedSendContext", () => {
  it("uses one prepared result for both command payload and visual card tracking", async () => {
    const result: HighspeedPrepareTurnResult = {
      kind: "accelerated",
      card,
      nextDrawAt: 20_000,
      execution,
    };

    await expect(
      prepareHighspeedSendContext("task-1", async (taskId) => {
        expect(taskId).toBe("task-1");
        return result;
      }),
    ).resolves.toEqual({
      override: {
        highspeedMeta: { schemaVersion: 1, ...card },
        modelSelection: execution.modelSelection,
        modelExecution: {
          selectionScope: "execution",
          requestAuth: execution.requestAuth,
          selectionFallback: execution.selectionFallback,
        },
      },
      acceleratedCard: card,
    });
  });

  it("keeps fallback sends free of Highspeed payload and visual state", async () => {
    await expect(
      prepareHighspeedSendContext("task-1", async () => ({
        kind: "fallback",
        reason: "cooldown",
        nextDrawAt: null,
      })),
    ).resolves.toEqual({ override: {} });
  });
});
