import { describe, expect, it } from "vitest";
import {
  calculateHighspeedSavedDurationMs,
  calculateHighspeedSavedDurationFromMetrics,
} from "@/highspeed/highspeedSavedTime.js";

describe("highspeed saved time", () => {
  it("按工具 20% / 推理 80% 估算每轮节省时间并把负值收口为零", () => {
    expect(
      calculateHighspeedSavedDurationMs({
        outputTokens: 9_000,
        regularTps: 30,
        highspeedTps: 90,
        durationMs: 100_000,
      }),
    ).toBe(114_286);
    expect(
      calculateHighspeedSavedDurationMs({
        outputTokens: 100,
        regularTps: 100,
        highspeedTps: 50,
        durationMs: 2_000,
      }),
    ).toBe(0);
  });

  it("优先使用 CLI 持久化的模型/工具真实耗时", () => {
    expect(
      calculateHighspeedSavedDurationMs({
        outputTokens: 9_000,
        regularTps: 30,
        highspeedTps: 90,
        durationMs: 100_000,
        modelDurationMs: 40_000,
        toolDurationMs: 50_000,
        otherDurationMs: 10_000,
      }),
    ).toBe(80_000);
  });

  it("持久化前计算节省时间时透传真实耗时拆分", () => {
    expect(
      calculateHighspeedSavedDurationFromMetrics(
        {
          outputTokens: 9_000,
          durationMs: 100_000,
          modelDurationMs: 40_000,
          toolDurationMs: 50_000,
          otherDurationMs: 10_000,
        },
        30,
        90,
      ),
    ).toBe(80_000);
  });
});
