// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// CA-19：Settings 的 usage 分区挂载时不得发起任何 preferred-provider 的权益/套餐请求。
// 这里挂载真实 SettingsPage（usage 分区 + 真实 UsageStatsSection/AppUsagePanel），
// 把 usageStatsService.getEntitlementSnapshot 与 codingPlanSubscriptionService.* 换成抛错 spy：
// 一旦有调用，测试立刻失败；同时断言 getAppUsageSnapshot 确实被调用，证明挂载真实发生
// 且通用 usage 路径仍然存活。

const usageCalls = vi.hoisted(() => {
  const createSnapshot = () => ({
    range: "all" as const,
    generatedAt: 0,
    timeZone: "UTC",
    source: "agent-db" as const,
    summary: {
      totalTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      cacheHitRate: 0,
      totalSessions: 0,
      totalTurns: 0,
      toolCallCount: 0,
      toolErrorRate: 0,
      modelErrorRate: 0,
      avgTimeToFirstTokenMs: null,
      avgTurnDurationMs: null,
      activeDays: 0,
      currentStreakDays: 0,
      longestSessionMs: 0,
      longestStreakDays: 0,
      peakDayTokens: 0,
      favoriteModel: null,
    },
    heatmap: { startDate: null, endDate: null, maxTokens: 0, weeks: [] as unknown[] },
    dailyModelUsage: [] as unknown[],
    models: [] as unknown[],
    tools: [] as unknown[],
  });
  return {
    getAppUsageSnapshot: vi.fn(async () => createSnapshot()),
    getEntitlementSnapshot: vi.fn(async () => {
      throw new Error("usageStatsService.getEntitlementSnapshot must not be called");
    }),
  };
});

const subscriptionCalls = vi.hoisted(() => ({
  getEnterprisePricing: vi.fn(async () => {
    throw new Error("codingPlanSubscriptionService.getEnterprisePricing must not be called");
  }),
  getSubscriptions: vi.fn(async () => {
    throw new Error("codingPlanSubscriptionService.getSubscriptions must not be called");
  }),
}));

const settingsSection = vi.hoisted(() => ({ current: "usage" as string }));

vi.mock("@/components/ui/button.js", () => ({
  Button: ({ children, ...props }: { children: unknown; [key: string]: unknown }) =>
    createElement("button", props, children),
}));

vi.mock("@/components/ui/tabs.js", () => ({
  Tabs: ({ children }: { children: unknown }) => createElement("div", null, children),
  TabsList: ({ children }: { children: unknown }) => createElement("div", null, children),
  TabsTrigger: ({ children }: { children: unknown }) => createElement("button", null, children),
}));

vi.mock("@/components/ui/tooltip.js", async () => {
  const actual = await vi.importActual<typeof import("@/components/ui/tooltip.js")>(
    "@/components/ui/tooltip.js",
  );
  const passthrough = (tag: string) =>
    function Passthrough({ children, ...props }: { children?: unknown; [key: string]: unknown }) {
      return createElement(tag, props, children);
    };
  return {
    ...actual,
    Tooltip: passthrough("div"),
    TooltipTrigger: passthrough("span"),
    TooltipContent: passthrough("div"),
    TooltipProvider: passthrough("div"),
  };
});

vi.mock("@/DesktopWindowFrame.js", () => ({
  DesktopWindowFrame: ({ children }: { children: unknown }) => createElement("div", null, children),
}));

vi.mock("@/WorkspaceSidebarFooter.js", () => ({
  WorkspaceSidebarFooter: () => null,
}));

vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    intl: {
      formatMessage: ({ id }: { id: string }) => id,
    },
    locale: "en-US",
    localePreference: "system",
    setLocalePreference: vi.fn(),
  }),
}));

vi.mock("@/hooks/usePlatform.js", () => ({
  usePlatform: () => ({}),
  useSelectDirectory: () => vi.fn(async () => null),
}));

const services = {
  usageStatsService: {
    getAppUsageSnapshot: usageCalls.getAppUsageSnapshot,
    getEntitlementSnapshot: usageCalls.getEntitlementSnapshot,
  },
  codingPlanSubscriptionService: subscriptionCalls,
  settingService: {
    get: vi.fn(async () => ({})),
    update: vi.fn(async () => {}),
  },
  systemService: {
    info: vi.fn(async () => ({ homedir: "/home/user", platform: "linux" })),
    listIntegratedTerminalShells: vi.fn(async () => []),
  },
};

vi.mock("@/hooks/useServices.js", () => ({
  useOptionalServices: () => services,
  useServices: () => services,
}));

vi.mock("@/hooks/useWorkspaceServices.js", () => ({
  useBaseWorkspaceServices: () => services,
  useWorkspaceServicesResolution: () => ({
    services,
    remoteSessionId: null,
    isRemoteTarget: false,
    connectionKind: "local-ready",
    rpcReady: true,
  }),
}));

vi.mock("@/hooks/useSettingService.js", () => ({
  useSettings: () => ({ settings: undefined, update: vi.fn() }),
}));

vi.mock("@/store/StoreProvider.js", () => ({
  useZCodeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      codePreviewSettings: {},
      interfaceMode: "coding",
      notificationEnabled: true,
      notificationSoundEnabled: true,
      requestOnboardingDialog: vi.fn(),
      setCodePreviewSettings: vi.fn(),
      setInterfaceMode: vi.fn(),
      setNewUserOnboardingOpen: vi.fn(),
      setNotificationEnabled: vi.fn(),
      setNotificationSoundEnabled: vi.fn(),
      setTheme: vi.fn(),
      theme: "system",
      uiFontSizePx: 14,
      setUiFontSizePx: vi.fn(),
    }),
}));

vi.mock("@/store/TabStoreProvider.js", () => ({
  useTabStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeWorkspaceIdentity: undefined,
      activeWorkspacePath: undefined,
      tabs: [],
    }),
  useOptionalTabStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      activeWorkspaceIdentity: undefined,
      activeWorkspacePath: undefined,
      openSettingsTab: vi.fn(),
      tabs: [],
    }),
  useTabStoreApi: () => ({ getState: () => ({ activeWorkspacePath: undefined, tabs: [] }) }),
}));

vi.mock("@/lib/settingsNavigation.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/settingsNavigation.js")>()),
  addPendingSettingsSectionListener: () => () => {},
  consumeInitialSettingsSection: () => settingsSection.current,
  consumePendingSettingsPluginTab: () => undefined,
  consumePendingSettingsPluginOrigin: () => undefined,
  consumePendingSettingsPluginScopeKey: () => undefined,
  clearPendingSettingsPluginOrigin: () => undefined,
  clearPendingSettingsPluginScopeKey: () => undefined,
  consumePendingSettingsModelProviderTarget: () => undefined,
  setPendingSettingsSectionIntent: vi.fn(),
  resolveSettingsSection: (section: string) => section,
  writeLastSettingsSectionPreference: vi.fn(),
}));

// 其它分区与本次验收无关，直接裁掉，避免拖慢挂载。
// 热力图走 canvas，jsdom 无 2D 上下文；本次只关心请求面，不关心图表渲染。
vi.mock("@/settings/usage-stats/UsageHeatmap.js", () => ({
  UsageHeatmap: () => null,
  UsageHeatmapCells: () => null,
}));

vi.mock("@/settings/ModelProviderSection.js", () => ({ ModelProviderSection: () => null }));
vi.mock("@/settings/SubagentsSection.js", () => ({ SubagentsSection: () => null }));
vi.mock("@/settings/AutomationsSection.js", () => ({ AutomationsSection: () => null }));
vi.mock("@/settings/MigrationSection.js", () => ({ MigrationSection: () => null }));
vi.mock("@/settings/BrowserSettingsSection.js", () => ({ BrowserSettingsSection: () => null }));
vi.mock("@/settings/MemorySettingsSection.js", () => ({ MemorySettingsSection: () => null }));
vi.mock("../src/settingsPageHelpers.js", () => ({
  isSettingsSectionAvailable: () => true,
  createSettingsPageConfig: () => ({
    settingsSectionGroups: [
      {
        id: "dataAndStats",
        titleId: "settings.dataAndStats",
        sections: [
          {
            id: "usage",
            titleId: "settings.usage",
            navLabelId: "settings.usage",
            icon: () => null,
          },
        ],
      },
    ],
    settingsSections: [
      {
        id: "usage",
        titleId: "settings.usage",
        navLabelId: "settings.usage",
        icon: () => null,
      },
    ],
  }),
  resolveSettingsSectionForPlatform: (section: string) => section,
  GeneralSectionContent: () => null,
  GeneralSectionHeader: () => null,
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Settings usage 挂载不再探测 preferred-provider 权益", () => {
  it("挂载 usage 分区时只请求通用 App Usage 快照", async () => {
    settingsSection.current = "usage";

    const { SettingsPage } = await import("../src/SettingsPage.js");
    const root = render(createElement(SettingsPage, {}));

    await waitFor(() => {
      expect(usageCalls.getAppUsageSnapshot).toHaveBeenCalled();
    });

    // 抛错 spy 没被触发即证明没有权益/套餐请求；显式断言一次让失败信息可读。
    expect(usageCalls.getEntitlementSnapshot).not.toHaveBeenCalled();
    expect(subscriptionCalls.getEnterprisePricing).not.toHaveBeenCalled();
    expect(subscriptionCalls.getSubscriptions).not.toHaveBeenCalled();

    root.unmount();
    // 冷启动需要拉起整棵设置页模块图，与 settingsPageIntegratedTerminalShell 一样放宽超时。
  }, 60_000);
});