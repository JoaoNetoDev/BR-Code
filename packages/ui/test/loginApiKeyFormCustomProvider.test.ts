// @vitest-environment jsdom
import { createElement, Fragment, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TID_LOGIN_API_KEY_BASE_URL_INPUT,
  TID_LOGIN_API_KEY_CONTINUE_BUTTON,
  TID_LOGIN_API_KEY_INPUT,
  TID_LOGIN_API_KEY_MODEL_INPUT,
  TID_LOGIN_API_KEY_PROVIDER_ITEM,
  TID_LOGIN_API_KEY_SKIP_BUTTON,
} from "@zcode/shared/test-ids";

// Radix 的 Select 在 jsdom 里无法用指针事件驱动；换成原生 select，行为等价。
vi.mock("@/components/ui/select.js", () => ({
  Select: ({
    value,
    onValueChange,
    disabled,
    children,
    ...rest
  }: {
    value: string;
    onValueChange: (value: string) => void;
    disabled?: boolean;
    children?: ReactNode;
  }) =>
    createElement(
      "select",
      {
        ...rest,
        "aria-label": "provider-select",
        value,
        disabled,
        onChange: (event: { target: { value: string } }) => onValueChange(event.target.value),
      },
      children,
    ),
  SelectContent: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
  SelectItem: ({
    value,
    children,
    ...rest
  }: {
    value: string;
    children?: ReactNode;
  }) => createElement("option", { ...rest, value }, children),
  SelectTrigger: ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children),
  SelectValue: () => null,
}));

vi.mock("@/lib/oauthProviderIcon.js", () => ({ renderOAuthProviderIcon: () => null }));

vi.mock("@/hooks/usePlatform.js", () => ({ usePlatform: () => ({ openExternal: vi.fn() }) }));

vi.mock("@/i18n/IntlProvider.js", () => ({
  useZCodeIntl: () => ({
    intl: { formatMessage: ({ id }: { id: string }) => id },
    locale: "en-US",
  }),
}));

vi.mock("@/hooks/useProviderSettingsView.js", () => ({
  useProviderSettingsView: () => ({
    state: { status: "ready", view: { providerTemplates: [] } },
  }),
}));

const mocks = vi.hoisted(() => ({
  createPersonalProvider: vi.fn(),
  addPersonalModel: vi.fn(),
  markApiKeyLoginSuccess: vi.fn(),
  updateSettings: vi.fn(),
}));

vi.mock("@/hooks/useServices.js", () => ({
  useServices: () => ({
    providerSettingsService: {
      getView: async () => ({ providerTemplates: [] }),
      createPersonalProvider: mocks.createPersonalProvider,
      addPersonalModel: mocks.addPersonalModel,
    },
    modelSelectionService: { getView: async () => ({ providers: [] }) },
    settingService: { update: mocks.updateSettings },
  }),
}));

vi.mock("@/store/StoreProvider.js", () => ({
  useZCodeStore: (selector: (state: unknown) => unknown) =>
    selector({ markApiKeyLoginSuccess: mocks.markApiKeyLoginSuccess }),
}));

async function renderForm() {
  const { LoginApiKeyForm } = await import("@/login/LoginApiKeyForm.js");
  return render(
    createElement(LoginApiKeyForm, {
      onCancel: vi.fn(),
      onSaved: vi.fn(),
      onSkipped: vi.fn(),
    }),
  );
}

function selectCustomProvider() {
  const trigger = screen.getByLabelText("provider-select");
  fireEvent.change(trigger, { target: { value: "custom" } });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createPersonalProvider.mockResolvedValue({ providerId: "new-provider" });
  mocks.addPersonalModel.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
});

describe("LoginApiKeyForm 通用 provider", () => {
  it("提供通用选项，选择后显示 Base URL、API 格式与模型输入", async () => {
    await renderForm();

    expect(screen.getByTestId(`${TID_LOGIN_API_KEY_PROVIDER_ITEM}-custom`)).toBeTruthy();

    selectCustomProvider();

    expect(screen.getByTestId(TID_LOGIN_API_KEY_BASE_URL_INPUT)).toBeTruthy();
    expect(screen.getByTestId(TID_LOGIN_API_KEY_MODEL_INPUT)).toBeTruthy();
    expect(screen.getByTestId(TID_LOGIN_API_KEY_INPUT)).toBeTruthy();
  });

  it("通用 provider 下禁用“暂时跳过”，因为没有可写入的 family domain", async () => {
    await renderForm();

    expect(screen.getByTestId(TID_LOGIN_API_KEY_SKIP_BUTTON).hasAttribute("disabled")).toBe(false);

    selectCustomProvider();

    expect(screen.getByTestId(TID_LOGIN_API_KEY_SKIP_BUTTON).hasAttribute("disabled")).toBe(true);
  });

  it("缺少 Base URL 或模型时不创建 provider", async () => {
    await renderForm();
    selectCustomProvider();

    fireEvent.change(screen.getByTestId(TID_LOGIN_API_KEY_INPUT), { target: { value: "sk-1" } });
    fireEvent.click(screen.getByTestId(TID_LOGIN_API_KEY_CONTINUE_BUTTON));

    expect(mocks.createPersonalProvider).not.toHaveBeenCalled();
  });

  it("字段齐全时创建无模板的 provider 并补上模型", async () => {
    await renderForm();
    selectCustomProvider();

    fireEvent.change(screen.getByTestId(TID_LOGIN_API_KEY_INPUT), { target: { value: " sk-1 " } });
    fireEvent.change(screen.getByTestId(TID_LOGIN_API_KEY_BASE_URL_INPUT), {
      target: { value: "https://api.example.com/v1" },
    });
    fireEvent.change(screen.getByTestId(TID_LOGIN_API_KEY_MODEL_INPUT), {
      target: { value: "gpt-4o-mini" },
    });
    fireEvent.click(screen.getByTestId(TID_LOGIN_API_KEY_CONTINUE_BUTTON));

    await waitFor(() => {
      expect(mocks.addPersonalModel).toHaveBeenCalledWith("new-provider", "gpt-4o-mini", {});
    });
    expect(mocks.createPersonalProvider).toHaveBeenCalledTimes(1);
    const [input] = mocks.createPersonalProvider.mock.calls[0];
    expect(input.templateId).toBeUndefined();
    expect(input.initialConfig).toEqual({
      api: { type: "openai-chat-completions", baseUrl: "https://api.example.com/v1" },
      access: { type: "api-key", apiKey: "sk-1" },
    });
  });
});
