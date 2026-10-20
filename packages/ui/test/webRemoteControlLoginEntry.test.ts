// @vitest-environment jsdom

import { createElement, type ReactNode } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { OAuthProviderId } from "@zcode/shared";
import { WebRemoteControlDialog } from "@/web-remote-control/index.js";

const state = vi.hoisted(() => ({
  user: { id: "cached-user", username: "User" } as { id: string; username: string } | null,
  theme: "zai-dark",
  oauthError: null,
  oauthSuccessSeq: 0,
  lastOAuthSuccessProvider: null,
  loginEntryRequest: null as { id: number; providerId?: OAuthProviderId; purpose?: string } | null,
  requestLoginEntry: vi.fn(),
  clearLoginEntryRequest: vi.fn(),
  markLoginEntryAttemptStatus: vi.fn(),
  setOAuthError: vi.fn(),
}));
const toast = vi.hoisted(() => vi.fn());
const platform = vi.hoisted(() => ({
  getWebRemoteControlStatus: vi.fn(async () => ({ status: "auth-required" })),
}));
const intl = vi.hoisted(() => ({ intl: { formatMessage: ({ id }: { id: string }) => id } }));

vi.mock("@/store/StoreProvider.js", () => ({
  useZCodeStore: (selector: (value: typeof state) => unknown) => selector(state),
}));
vi.mock("@/hooks/usePlatform.js", () => ({ usePlatform: () => platform }));
vi.mock("@/i18n/IntlProvider.js", () => ({ useZCodeIntl: () => intl }));
vi.mock("@/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/button.js", () => ({
  Button: ({ children, ...props }: { children?: ReactNode; [key: string]: unknown }) =>
    createElement("button", props, children),
}));
vi.mock("@/components/ui/dialog.js", () => {
  const Wrapper = ({ children }: { children?: ReactNode }) => createElement("div", null, children);
  return {
    Dialog: Wrapper,
    DialogContent: Wrapper,
    DialogDescription: Wrapper,
    DialogHeader: Wrapper,
    DialogTitle: Wrapper,
  };
});
vi.mock("@/components/ui/toast.js", () => ({ toast }));
vi.mock("@/BotsDialog.js", () => ({ BotsDialog: () => null }));
vi.mock("@/BotsDialog/shared.js", () => ({ ProviderIcon: () => null }));
vi.mock("@/components/ui/ZCodeAboutLogo.js", () => ({ ZCodeAboutLogo: () => null }));
vi.mock("@/login/LoginApiKeyForm.js", () => ({ LoginApiKeyForm: () => null }));
vi.mock("@/openWorkspacePageThemeHero.js", () => ({ ThemeHeroVisual: () => null }));

function openDialog(onOpenChange = vi.fn()) {
  state.requestLoginEntry.mockImplementation((providerId?: OAuthProviderId, purpose?: string) => {
    state.loginEntryRequest = { id: 1, providerId, purpose };
  });
  return render(
    createElement(WebRemoteControlDialog, { open: true, onOpenChange, workspacePath: "/project" }),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.user = { id: "cached-user", username: "User" };
  state.loginEntryRequest = null;
});

it("远控401保留缓存用户时，登录按钮重新发起统一登录入口，不把缓存用户判为登录成功", async () => {
  const view = openDialog();
  fireEvent.click(await view.findByTestId("web-remote-control-login"));
  // BR Code: o login é somente por API key, sem provider OAuth.
  expect(state.requestLoginEntry).toHaveBeenCalledWith(undefined, "app-login");
  expect(state.user).toEqual({ id: "cached-user", username: "User" });
});

it("尚未登录时同样打开统一登录入口", async () => {
  state.user = null;
  const onOpenChange = vi.fn();
  const view = openDialog(onOpenChange);
  fireEvent.click(await view.findByTestId("web-remote-control-login"));
  expect(onOpenChange).toHaveBeenCalledWith(false);
  expect(state.requestLoginEntry).toHaveBeenCalledWith(undefined, "app-login");
});
