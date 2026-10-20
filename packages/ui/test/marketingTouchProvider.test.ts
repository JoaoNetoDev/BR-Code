// @vitest-environment jsdom
import { createElement, Fragment, useContext, useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const services = {
    marketingTouchService: { query: vi.fn(), report: vi.fn().mockResolvedValue(undefined) },
    cloudContentService: {},
    codingPlanSubscriptionService: {
      claimManualPlan: vi.fn().mockResolvedValue({ success: true }),
    },
    usageStatsService: { getEntitlementSnapshot: vi.fn().mockResolvedValue({}) },
    providerSettingsService: { refresh: vi.fn().mockResolvedValue({}) },
  };
  const tabs = { openSettingsTab: vi.fn(), activeWorkspacePath: "/fixture" };
  return {
    services,
    tabs,
    tabApi: { getState: () => tabs },
    platform: { openExternal: vi.fn() },
    store: { user: { id: "fixture" }, isRestoringOAuthSession: false, requestLoginEntry: vi.fn() },
    intl: { formatMessage: ({ id }: { id: string }) => id },
    upgrade: vi.fn(),
    rewards: vi.fn().mockResolvedValue(undefined),
    logs: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  };
});
vi.mock("@/hooks/useServices.js", () => ({ useServices: () => h.services }));
vi.mock("@/hooks/usePlatform.js", () => ({ usePlatform: () => h.platform }));
vi.mock("@/store/StoreProvider.js", () => ({
  useZCodeStore: (selector: (state: typeof h.store) => unknown) => selector(h.store),
}));
vi.mock("@/store/TabStoreProvider.js", () => ({
  useTabStore: (selector: (state: typeof h.tabs) => unknown) => selector(h.tabs),
  useTabStoreApi: () => h.tabApi,
}));
vi.mock("@/settings/CodingPlanUpgradeDialogProvider.js", () => ({
  useCodingPlanUpgradeDialog: () => ({ openCodingPlanUpgrade: h.upgrade }),
}));
vi.mock("@/rewards/RewardsProvider.js", () => ({ useOpenRewards: () => h.rewards }));
vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({ intl: h.intl, locale: "en-US" }),
}));
vi.mock("@/components/cloud-content-dialog/useCloudHeroEnvironment.js", () => ({
  useCloudHeroEnvironment: () => ({ dark: false }),
}));
vi.mock("@/components/marketing-touch/marketingResources.js", () => ({
  prepareMarketingHero: vi.fn().mockResolvedValue({
    hero: { type: "image", src: "fixture.png" },
    release: async () => {},
  }),
}));
vi.mock("@/components/marketing-touch/MarketingDialogs.js", () => ({
  MarketingDialogs: () => null,
}));
vi.mock("@/components/marketing-touch/MarketingBanner.js", () => ({
  MarketingBannerView: ({ onClick }: { onClick: () => void }) =>
    createElement("button", { onClick }, "Banner action"),
}));
vi.mock("@/components/ui/toast.js", () => ({ toast: vi.fn() }));
vi.mock("@/logger.js", () => ({ logger: h.logs }));

import {
  MarketingBanner,
  MarketingTouchContext,
  MarketingTouchProvider,
} from "@/components/marketing-touch/MarketingTouchProvider.js";
import type { MarketingTouchController } from "@/components/marketing-touch/marketingTouchController.js";

const text = (content: string) => ({ format: "plaintext" as const, content });

function imageBanner(campaignId: string, action: unknown) {
  return {
    campaign_id: campaignId,
    resource_position: "banner",
    priority: 90,
    banner: {
      background: { type: "image", image: { default: { src: "fixture.png" } } },
      buttons: [
        { text: text(""), action: { type: "close" } },
        { text: text(""), action },
      ],
    },
  };
}

/** 读取窗口唯一 controller；用于在不经过 UI 点击的前提下驱动一次动作。 */
function ControllerProbe({
  onReady,
}: {
  onReady: (controller: MarketingTouchController) => void;
}) {
  const controller = useContext(MarketingTouchContext);
  useEffect(() => {
    if (controller) onReady(controller);
  }, [controller, onReady]);
  return null;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("CA-11: toque legado de claim é ignorado em silêncio — só debug, sem UI, serviço ou login", async () => {
  let controller: MarketingTouchController | null = null;
  h.services.marketingTouchService.query.mockResolvedValue({
    scope: "fixture-scope",
    deliveries: [
      imageBanner("banner-claim", {
        type: "claim_zcode_plan",
        args: { plan_id: "weekend" },
      }),
    ],
  });
  render(
    createElement(MarketingTouchProvider, {
      desktop: true,
      children: createElement(
        Fragment,
        null,
        createElement(ControllerProbe, {
          onReady: (value) => (controller = value),
        }),
        createElement(MarketingBanner, null),
      ),
    }),
  );
  await waitFor(() => expect(controller).not.toBeNull());
  // 断言 claim 触点既不渲染 banner 也不请求登录。
  expect(screen.queryByText("Banner action")).toBeNull();
  // 即使绕过渲染守卫直接派发 clickBanner，也被同一套白名单在执行前拦住：
  // 不进入执行器，只写一条 debug，不调用任何领取服务。
  await act(async () => {
    await controller!.clickBanner();
  });
  expect(screen.queryByText("Banner action")).toBeNull();
  expect(h.store.requestLoginEntry).not.toHaveBeenCalled();
  expect(h.services.codingPlanSubscriptionService.claimManualPlan).not.toHaveBeenCalled();
  expect(h.services.marketingTouchService.report).not.toHaveBeenCalled();
  expect(h.logs.debug).toHaveBeenCalledWith("[marketing-touch] ignore unsupported action", {
    action: "claim_zcode_plan",
  });
  expect(h.logs.warn).not.toHaveBeenCalled();
  expect(h.logs.error).not.toHaveBeenCalled();
  expect(h.logs.info).not.toHaveBeenCalled();
});

it("CA-12: banner de imagem com open_url continua abrindo o link e reportando confirm", async () => {
  h.services.marketingTouchService.query.mockResolvedValue({
    scope: "fixture-scope",
    deliveries: [
      imageBanner("banner-open-url", {
        type: "open_url",
        args: { url: "https://x.dev" },
      }),
    ],
  });
  h.platform.openExternal.mockResolvedValue(undefined);
  render(
    createElement(MarketingTouchProvider, {
      desktop: true,
      children: createElement(MarketingBanner, null),
    }),
  );
  fireEvent.click(await screen.findByText("Banner action"));
  await waitFor(() => expect(h.platform.openExternal).toHaveBeenCalledWith("https://x.dev"));
  await waitFor(() =>
    expect(h.services.marketingTouchService.report).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        campaignId: "banner-open-url",
        actionType: "confirm",
      }),
    ),
  );
  expect(h.logs.warn).not.toHaveBeenCalled();
});

it("rewards 导航委托窗口 Provider，保留一次 confirm 上报且不领取", async () => {
  h.services.marketingTouchService.query.mockResolvedValue({
    scope: "fixture-scope",
    deliveries: [
      imageBanner("fixture-rewards", {
        type: "navigate",
        args: { page: "rewards" },
      }),
    ],
  });
  render(
    createElement(MarketingTouchProvider, {
      desktop: true,
      children: createElement(MarketingBanner, null),
    }),
  );
  fireEvent.click(await screen.findByText("Banner action"));
  await waitFor(() => expect(h.rewards).toHaveBeenCalledTimes(1));
  await waitFor(() =>
    expect(h.services.marketingTouchService.report).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        campaignId: "fixture-rewards",
        actionType: "confirm",
      }),
    ),
  );
  expect(h.services.codingPlanSubscriptionService.claimManualPlan).not.toHaveBeenCalled();
});
