// @vitest-environment jsdom
import { createElement } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TID_LOGIN_API_KEY_CANCEL_BUTTON,
  TID_LOGIN_API_KEY_CONTINUE_BUTTON,
  TID_LOGIN_USE_API_KEY_BUTTON,
} from "@zcode/shared";

interface LoginEntryRequest {
  id: number;
  providerId?: string;
}

const mocks = vi.hoisted(() => ({
  storeState: {
    loginEntryRequest: null as LoginEntryRequest | null,
    clearLoginEntryRequest: vi.fn(),
  },
}));

vi.mock("@/store/StoreProvider.js", () => ({
  useZCodeStore: (selector: (state: unknown) => unknown) => selector(mocks.storeState),
}));

// 登录表单依赖真实 service/provider runtime，本用例只验证登录入口自身的状态机，
// 因此用最小 stub 替代，但保留 onCancel/onSaved/onSkipped 的真实契约。
vi.mock("@/login/LoginApiKeyForm.js", () => ({
  LoginApiKeyForm: ({
    onCancel,
    onSaved,
    onSkipped,
  }: {
    onCancel: () => void;
    onSaved: () => void;
    onSkipped: () => void;
  }) =>
    createElement(
      "div",
      { "data-testid": "login-api-key-form" },
      createElement("button", {
        type: "button",
        "data-testid": TID_LOGIN_API_KEY_CONTINUE_BUTTON,
        onClick: onSaved,
      }),
      createElement("button", {
        type: "button",
        "data-testid": TID_LOGIN_API_KEY_CANCEL_BUTTON,
        onClick: onCancel,
      }),
      createElement("button", {
        type: "button",
        "data-testid": "login-api-key-skip-stub",
        onClick: onSkipped,
      }),
    ),
}));

vi.mock("@/hooks/usePlatform.js", () => ({
  usePlatform: () => ({ executeDesktopCommand: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    intl: { formatMessage: ({ id }: { id: string }) => id },
  }),
}));

async function renderWelcome(onComplete = vi.fn()) {
  const { WelcomeScreen } = await import("@/WelcomeScreen.js");
  render(createElement(WelcomeScreen, { onComplete }));
  return { onComplete };
}

describe("WelcomeScreen 只保留 API Key 登录路径", () => {
  beforeEach(() => {
    mocks.storeState.loginEntryRequest = null;
    mocks.storeState.clearLoginEntryRequest.mockClear();
  });

  // 该项目未开启 vitest globals，RTL 的自动 cleanup 不会注册，需手动卸载。
  afterEach(() => {
    cleanup();
  });

  it("入口态只渲染 API Key 入口，点击后进入表单且不完成登录", async () => {
    const { onComplete } = await renderWelcome();

    expect(screen.getByTestId(TID_LOGIN_USE_API_KEY_BUTTON)).toBeTruthy();
    expect(screen.queryByTestId("login-api-key-form")).toBeNull();

    fireEvent.click(screen.getByTestId(TID_LOGIN_USE_API_KEY_BUTTON));

    expect(screen.getByTestId("login-api-key-form")).toBeTruthy();
    expect(screen.queryByTestId(TID_LOGIN_USE_API_KEY_BUTTON)).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("表单取消回到入口态，不触发 onComplete", async () => {
    const { onComplete } = await renderWelcome();

    fireEvent.click(screen.getByTestId(TID_LOGIN_USE_API_KEY_BUTTON));
    fireEvent.click(screen.getByTestId(TID_LOGIN_API_KEY_CANCEL_BUTTON));

    expect(screen.getByTestId(TID_LOGIN_USE_API_KEY_BUTTON)).toBeTruthy();
    expect(screen.queryByTestId("login-api-key-form")).toBeNull();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("保存 API Key 以 \"apiKey\" 原因完成登录", async () => {
    const { onComplete } = await renderWelcome();

    fireEvent.click(screen.getByTestId(TID_LOGIN_USE_API_KEY_BUTTON));
    fireEvent.click(screen.getByTestId(TID_LOGIN_API_KEY_CONTINUE_BUTTON));

    expect(onComplete).toHaveBeenCalledWith("apiKey");
  });

  it("跳过 API Key 以 \"skip\" 原因完成登录", async () => {
    const { onComplete } = await renderWelcome();

    fireEvent.click(screen.getByTestId(TID_LOGIN_USE_API_KEY_BUTTON));
    fireEvent.click(screen.getByTestId("login-api-key-skip-stub"));

    expect(onComplete).toHaveBeenCalledWith("skip");
  });

  it("入口不渲染任何 OAuth 渠道按钮或 OAuth 状态块", async () => {
    const { container } = await render(createElement((await import("@/WelcomeScreen.js")).WelcomeScreen, {
      onComplete: vi.fn(),
    }));

    expect(container.querySelector("[data-testid^='oauth-login-button']")).toBeNull();
    expect(container.querySelector("[data-testid='oauth-error']")).toBeNull();
    expect(container.querySelector("[data-testid='oauth-cancel']")).toBeNull();
    expect(container.textContent).not.toContain("login.oauth.");
  });

  it("挂载时消费并丢弃挂起的登录入口请求，UI 不再自动发起 OAuth", async () => {
    mocks.storeState.loginEntryRequest = { id: 7, providerId: "bigmodel" };
    await renderWelcome();

    expect(mocks.storeState.clearLoginEntryRequest).toHaveBeenCalledWith(7);
  });
});