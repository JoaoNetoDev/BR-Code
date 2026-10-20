import { readFile } from "node:fs/promises";
import {
  TID_CONFIRM_DIALOG_CONFIRM,
  TID_LOGIN_TRIGGER,
  TID_LOGOUT_BUTTON,
  TID_LOGIN_USE_API_KEY_BUTTON,
  TID_LOGIN_API_KEY_SKIP_BUTTON,
} from "@zcode/shared/test-ids";
import {
  clearAppData,
  getE2EAppDataPaths,
  waitForDefaultWorkspaceReady,
} from "#e2e/helpers/desktop-app";

const byId = (id: string) => $(`[data-testid="${id}"]`);
function origin() {
  const value = process.env.ZCODE_CODING_PLAN_UPGRADE_MOCK_BASE_URL;
  if (!value) throw new Error("Missing isolated marketing fixture");
  return value;
}
async function state() {
  return (await (await fetch(`${origin()}/__e2e/marketing/state`)).json()) as {
    events: Array<{ campaign_id: string; action_type: string }>;
    requestDetails: Array<{ method: string; path: string; headers: { authenticated: boolean } }>;
  };
}
async function reset(options: Record<string, boolean> = {}) {
  const response = await fetch(`${origin()}/__e2e/marketing/reset`, {
    method: "POST",
    body: JSON.stringify(options),
  });
  expect(response.ok).toBe(true);
}
async function expectAnonymous() {
  const credentials = JSON.parse(await readFile(getE2EAppDataPaths().credentialsFile, "utf8"));
  // 只判断凭据是否存在，失败输出也不得带出凭据内容。
  expect(Boolean(credentials.zcodejwttoken)).toBe(false);
}

describe("Marketing Touch anonymous boundaries", () => {
  before(async () => {
    await waitForDefaultWorkspaceReady();
    const popup = byId("cloud-content-dialog");
    if (await popup.isExisting()) await popup.$('[data-slot="dialog-close"]').click();
    await reset();
    const relaunch = await browser.electron.mock("app", "relaunch");
    await relaunch.mockResolvedValue(undefined);
    const quit = await browser.electron.mock("app", "quit");
    await quit.mockResolvedValue(undefined);
    await byId(TID_LOGIN_TRIGGER).click();
    await byId(TID_LOGOUT_BUTTON).click();
    await byId(TID_CONFIRM_DIALOG_CONFIRM).waitForDisplayed();
    await byId(TID_CONFIRM_DIALOG_CONFIRM).click();
    // mock 调用记录跨进程缓存，直接读取不会刷新，必须显式同步。
    await browser.waitUntil(
      async () => {
        await relaunch.update();
        await quit.update();
        return relaunch.mock.calls.length === 1 && quit.mock.calls.length === 1;
      },
      { timeout: 30_000 },
    );
    await expectAnonymous();
    await browser.electron.restoreAllMocks();
  });
  beforeEach(async function () {
    // 启动时先不投放，避免营销弹窗遮挡首次匿名 WelcomeScreen。
    await reset();
    await browser.reloadSession();
    // 若冷启动出现 WelcomeScreen，走公开的“暂不设置”路径进入匿名工作区。
    await browser.waitUntil(
      async () =>
        (await byId(TID_LOGIN_TRIGGER).isExisting()) ||
        (await byId(TID_LOGIN_USE_API_KEY_BUTTON).isExisting()),
      { timeout: 30_000 },
    );
    if (await byId(TID_LOGIN_USE_API_KEY_BUTTON).isExisting()) {
      await byId(TID_LOGIN_USE_API_KEY_BUTTON).click();
      await byId(TID_LOGIN_API_KEY_SKIP_BUTTON).click();
    }
    await waitForDefaultWorkspaceReady();
    await expectAnonymous();
    await reset({
      popup: this.currentTest!.title.includes("popup"),
      banner: this.currentTest!.title.includes("banner"),
    });
    await browser.execute(() => window.dispatchEvent(new Event("online")));
  });
  after(async () => {
    await browser.electron.restoreAllMocks();
    await clearAppData();
  });
  it("MTE-08 anonymous popup: queries and reports cancellation without Authorization", async () => {
    await byId("cloud-content-dialog").waitForDisplayed({ timeout: 15_000 });
    await byId("cloud-content-dialog").$('[data-slot="dialog-close"]').click();
    await byId("cloud-content-dialog").waitForExist({ reverse: true });
    await browser.waitUntil(async () => (await state()).events.length === 1);
    const ledger = await state();
    expect(ledger.events).toEqual([{ campaign_id: "independent", action_type: "cancel" }]);
    const requests = ledger.requestDetails.filter((request) =>
      request.path.startsWith("/api/v1/marketing/touch"),
    );
    expect(requests.some((request) => request.method === "GET")).toBe(true);
    expect(requests.filter((request) => request.method === "POST")).toHaveLength(1);
    expect(requests.every((request) => !request.headers.authenticated)).toBe(true);
  });
  // 标题刻意不含 "banner"/"popup"：beforeEach 靠标题子串决定 fixture 是否投递默认
  // banner，含 "banner" 会打开 banner-1 默认投放，让断言在错误的前置状态下被评估。
  it("MTE-05 legacy claim touch: is ignored silently, renders nothing and never claims", async () => {
    const countTouchQueries = async () =>
      (await state()).requestDetails.filter(
        (request) =>
          request.method === "GET" && request.path.startsWith("/api/v1/marketing/touch"),
      ).length;
    // beforeEach 的轮询已经产生过 GET，必须以「fetch 之后又多了一次 GET」作为同步点，
    // 否则 waitUntil 会被历史请求立即满足、在投放到达前就开始断言。
    const before = await countTouchQueries();
    const created = (await (
      await fetch(`${origin()}/__e2e/marketing/legacy-claim-banner`, { method: "POST" })
    ).json()) as { campaignId: string };
    expect(created.campaignId).toContain("legacy-claim-");
    await browser.execute(() => window.dispatchEvent(new Event("online")));
    // 服务端已经返回该投放；UI 必须既不渲染任何触点，也不触发领取或登录。
    await browser.waitUntil(async () => (await countTouchQueries()) > before, { timeout: 30_000 });
    expect(await byId("marketing-banner").isExisting()).toBe(false);
    expect(await byId("cloud-content-dialog").isExisting()).toBe(false);
    const ledger = await state();
    expect(ledger.events).toEqual([]);
    expect(
      ledger.requestDetails.filter((request) => request.path.endsWith("/billing/claim")),
    ).toEqual([]);
    await expectAnonymous();
  });
});
