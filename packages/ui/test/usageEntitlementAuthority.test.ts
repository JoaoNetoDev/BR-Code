import { describe, expect, it } from "vitest";
import type { UsageEntitlementSnapshot } from "@zcode/shared";
import { resolveUsageEntitlementOutcome } from "@/lib/codingPlanProvider.js";
import { getUsageEntitlementScheduleState } from "@/lib/usageEntitlementRefreshPolicy.js";
import { buildUsageEntitlementCacheKey } from "@/lib/usageEntitlementCache.js";

const snapshot: UsageEntitlementSnapshot = {
  generatedAt: 1,
  authenticated: true,
  provider: null,
  subscription: null,
  remaining: { count: 100, isShow: true, nextResetTime: null },
  quota: { level: "max", limits: [] },
};
// 该判定随 S2 的 preferred-provider 生态一起退出 src；唯一活着的断言就在这里，
// 所以实现随测试内联，避免为一个断言保留生产模块。
function hasActiveCodingPlanSnapshot(
  snapshot: UsageEntitlementSnapshot | null,
  providerId: string,
): boolean {
  return (
    snapshot?.provider?.id === providerId &&
    snapshot.unavailableReason !== "no_plan" &&
    Boolean(snapshot.subscription?.details.length)
  );
}

describe("所有入口使用订阅权益", () => {
  it("只有额度不能证明有权益", () => {
    expect(resolveUsageEntitlementOutcome(snapshot)).toBe("unknown");
    expect(getUsageEntitlementScheduleState(snapshot)).toBe("unknown");
    expect(
      hasActiveCodingPlanSnapshot({ ...snapshot, provider: { id: "p", name: "p" } }, "p"),
    ).toBe(false);
  });
  it("明确无订阅不能被 quota 覆盖", () => {
    expect(resolveUsageEntitlementOutcome({ ...snapshot, unavailableReason: "no_plan" })).toBe(
      "inactive",
    );
  });
  it("订阅存在时不要求 quota 或 remaining", () => {
    expect(
      resolveUsageEntitlementOutcome({
        ...snapshot,
        quota: null,
        remaining: null,
        subscription: {
          identityType: "unknown",
          identityMasked: null,
          details: [
            {
              productId: "team",
              productName: "团队",
              purchaseTime: null,
              beginTime: null,
              renewTime: null,
              expireTime: null,
            },
          ],
        },
      }),
    ).toBe("active");
  });
  it("升级后缓存 key 不再命中旧版 quota 合成订阅", () => {
    expect(
      buildUsageEntitlementCacheKey({
        providerId: "provider",
        providerFingerprint: "account/project",
      }),
    ).toBe("zcode:usage-entitlement:subscription-v2:provider:account/project");
  });
});
