import { AppUsagePanel } from "@/settings/usage-stats/AppUsagePanel.js";

// 使用统计只剩账号级的中性 App Usage；套餐维度的面板与来源选择已移除。
export function UsageStatsSection() {
  return <AppUsagePanel />;
}
