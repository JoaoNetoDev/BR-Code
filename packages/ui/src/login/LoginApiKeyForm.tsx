import { useState } from "react";
import { isApiKeyAccess, type ProviderApiType } from "@zcode/provider";
import { KeyRoundIcon, Loader2Icon, TriangleAlertIcon } from "lucide-react";
import { BIGMODEL_PROVIDER_ID, ZAI_PROVIDER_ID } from "@zcode/shared";
import {
  TID_LOGIN_API_KEY_BASE_URL_INPUT,
  TID_LOGIN_API_KEY_CANCEL_BUTTON,
  TID_LOGIN_API_KEY_CONTINUE_BUTTON,
  TID_LOGIN_API_KEY_ERROR,
  TID_LOGIN_API_KEY_INPUT,
  TID_LOGIN_API_KEY_MODEL_INPUT,
  TID_LOGIN_API_KEY_PROVIDER_ITEM,
  TID_LOGIN_API_KEY_PROVIDER_TRIGGER,
  TID_LOGIN_API_KEY_SKIP_BUTTON,
  testId,
} from "@zcode/shared/test-ids";
import { Alert, AlertDescription } from "@/components/ui/alert.js";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useProviderSettingsView } from "@/hooks/useProviderSettingsView.js";
import { useServices } from "@/hooks/useServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { logger } from "@/logger.js";
import { renderOAuthProviderIcon } from "@/lib/oauthProviderIcon.js";
import {
  buildLoginApiKeyDefaultModelPreferenceFromSelection,
  buildLoginApiKeySkipSettings,
  resolveLoginApiKeyDefaultProvider,
  resolveLoginApiKeyTemplateId,
  resolveLoginApiKeyProviderLabel,
  shouldShowLoginApiKeyLink,
  type ApiKeyProviderChoice,
} from "@/login/LoginApiKeyForm.helpers.js";
import { ProviderApiFormatSelect } from "@/settings/model-provider-section/ProviderApiFormatSelect.js";
import { useZCodeStore } from "@/store/StoreProvider.js";

interface LoginApiKeyFormProps {
  onCancel: () => void;
  onSaved: () => void | Promise<void>;
  onSkipped: () => void | Promise<void>;
}

export function LoginApiKeyForm({ onCancel, onSaved, onSkipped }: LoginApiKeyFormProps) {
  const { intl, locale } = useZCodeIntl();
  const platform = usePlatform();
  const { modelSelectionService, providerSettingsService, settingService } = useServices();
  const markApiKeyLoginSuccess = useZCodeStore((state) => state.markApiKeyLoginSuccess);
  const [providerChoice, setProviderChoice] = useState<ApiKeyProviderChoice>(() =>
    resolveLoginApiKeyDefaultProvider(locale),
  );
  const [apiKeyValue, setApiKeyValue] = useState("");
  // 通用 provider 的三项配置：没有它们，provider 不会被发布到 registry。
  const [baseUrlValue, setBaseUrlValue] = useState("");
  const [modelIdValue, setModelIdValue] = useState("");
  const [apiFormat, setApiFormat] = useState<ProviderApiType>("openai-chat-completions");
  const [saving, setSaving] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerSettingsRead = useProviderSettingsView();
  const providerSettingsView =
    providerSettingsRead.state.status === "ready" ? providerSettingsRead.state.view : null;

  const providerLabel = resolveLoginApiKeyProviderLabel(providerChoice);
  const templateId = resolveLoginApiKeyTemplateId(providerChoice);
  const isCustomProvider = providerChoice === "custom";
  const templateAccess = providerSettingsView?.providerTemplates.find(
    (template) => template.templateId === templateId,
  )?.config.access;
  const apiKeyUrl = isApiKeyAccess(templateAccess) ? templateAccess.apiKeyManagementUrl : undefined;
  // 用户已经输入或回填 API Key 后，右侧获取入口会挤占密码输入区域。
  const showApiKeyLink = shouldShowLoginApiKeyLink(apiKeyValue, apiKeyUrl ?? undefined);
  // 通用 provider 必须四项齐全才能落库，否则用户会得到一个选不出模型的空 provider。
  const customProviderReady =
    !isCustomProvider ||
    (baseUrlValue.trim().length > 0 && modelIdValue.trim().length > 0);
  const busy = saving || skipping;
  const canSubmit = apiKeyValue.trim().length > 0 && customProviderReady && !busy;

  const saveCustomProvider = async (apiKey: string) => {
    const baseUrl = baseUrlValue.trim();
    const modelId = modelIdValue.trim();
    if (!baseUrl) {
      setError(intl.formatMessage({ id: "login.apiKey.baseUrlRequiredError" }));
      return;
    }
    if (!modelId) {
      setError(intl.formatMessage({ id: "login.apiKey.modelRequiredError" }));
      return;
    }
    const created = await providerSettingsService.createPersonalProvider({
      providerName: intl.formatMessage({ id: "login.apiKey.customProviderName" }),
      initialConfig: {
        api: { type: apiFormat, baseUrl },
        access: { type: "api-key", apiKey },
      },
    });
    // 自建 provider 没有模型时不会进 registry，模型选择会空；所以在这里补上用户填的模型。
    await providerSettingsService.addPersonalModel(created.providerId, modelId, {});
    return created.providerId;
  };

  const saveApiKeyProvider = async () => {
    const apiKey = apiKeyValue.trim();
    if (!apiKey) {
      setError(intl.formatMessage({ id: "login.apiKey.emptyError" }));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (isCustomProvider) {
        const providerId = await saveCustomProvider(apiKey);
        if (!providerId) return;
        const defaultModelPreference = buildLoginApiKeyDefaultModelPreferenceFromSelection(
          await modelSelectionService.getView(),
          providerId,
        );
        markApiKeyLoginSuccess(defaultModelPreference);
        await onSaved();
        return;
      }

      const template = (await providerSettingsService.getView()).providerTemplates.find(
        (item) => item.templateId === templateId,
      );
      if (!template || !isApiKeyAccess(template.config.access)) {
        setError(
          intl.formatMessage(
            { id: "login.apiKey.providerMissingError" },
            { provider: providerLabel },
          ),
        );
        return;
      }

      const created = await providerSettingsService.createPersonalProvider({
        templateId,
        initialConfig: { access: { type: template.config.access.type, apiKey } },
      });
      const defaultModelPreference = buildLoginApiKeyDefaultModelPreferenceFromSelection(
        await modelSelectionService.getView(),
        created.providerId,
      );
      markApiKeyLoginSuccess(defaultModelPreference);
      await onSaved();
    } catch (saveError) {
      logger.error("[LoginEntry] 保存 API Key provider 失败", {
        templateId,
        error: saveError,
      });
      setError(
        intl.formatMessage(
          { id: "login.apiKey.saveError" },
          {
            error: saveError instanceof Error ? saveError.message : String(saveError),
          },
        ),
      );
    } finally {
      setSaving(false);
    }
  };

  const skipApiKeyProvider = async () => {
    setSkipping(true);
    setError(null);
    try {
      // 跳过只表示用户确认当前 provider family 运行域，不能写入空 API Key
      // 或触发 API Key 登录成功事件，否则后续模型选择会误以为已有可用凭据。
      await settingService.update(buildLoginApiKeySkipSettings(providerChoice, Date.now()));
      await onSkipped();
    } catch (skipError) {
      logger.error("[LoginEntry] 跳过 API Key 登录失败", {
        providerChoice,
        error: skipError,
      });
      setError(
        intl.formatMessage(
          { id: "login.apiKey.skipError" },
          {
            error: skipError instanceof Error ? skipError.message : String(skipError),
          },
        ),
      );
    } finally {
      setSkipping(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <h2 className="text-ui-base font-medium text-foreground">
          {intl.formatMessage({ id: "login.apiKey.title" })}
        </h2>
        <div className="space-y-2">
          <div>
            <Select
              value={providerChoice}
              onValueChange={(value) => setProviderChoice(value as ApiKeyProviderChoice)}
              disabled={busy}
            >
              <SelectTrigger
                id="login-api-key-provider"
                size="lg"
                className="h-10 w-full text-ui-base"
                data-testid={TID_LOGIN_API_KEY_PROVIDER_TRIGGER}
                aria-label={intl.formatMessage({
                  id: "login.apiKey.providerLabel",
                })}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent align="end" className="rounded-lg">
                <SelectItem
                  value="zai"
                  className="rounded-md"
                  data-testid={testId(TID_LOGIN_API_KEY_PROVIDER_ITEM, "zai")}
                >
                  {renderOAuthProviderIcon(ZAI_PROVIDER_ID, "size-4")}
                  {intl.formatMessage({ id: "login.apiKey.provider.zai" })}
                </SelectItem>
                <SelectItem
                  value="bigmodel"
                  className="rounded-md"
                  data-testid={testId(TID_LOGIN_API_KEY_PROVIDER_ITEM, "bigmodel")}
                >
                  {renderOAuthProviderIcon(BIGMODEL_PROVIDER_ID, "size-4")}
                  {intl.formatMessage({
                    id: "login.apiKey.provider.bigmodel",
                  })}
                </SelectItem>
                <SelectItem
                  value="custom"
                  className="rounded-md"
                  data-testid={testId(TID_LOGIN_API_KEY_PROVIDER_ITEM, "custom")}
                >
                  <KeyRoundIcon className="size-4" />
                  {intl.formatMessage({ id: "login.apiKey.provider.custom" })}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isCustomProvider ? (
            <div className="space-y-2">
              <div className="space-y-1">
                <label
                  className="text-ui-sm text-foreground-subtle"
                  htmlFor="login-api-key-base-url"
                >
                  {intl.formatMessage({ id: "login.apiKey.baseUrlLabel" })}
                </label>
                <Input
                  id="login-api-key-base-url"
                  type="text"
                  size="lg"
                  className="h-10 w-full text-ui-base"
                  data-testid={TID_LOGIN_API_KEY_BASE_URL_INPUT}
                  value={baseUrlValue}
                  placeholder={intl.formatMessage({
                    id: "login.apiKey.baseUrlPlaceholder",
                  })}
                  autoComplete="off"
                  onChange={(event) => {
                    setBaseUrlValue(event.target.value);
                    setError(null);
                  }}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-ui-sm text-foreground-subtle"
                  htmlFor="login-api-key-api-format"
                >
                  {intl.formatMessage({ id: "login.apiKey.apiFormatLabel" })}
                </label>
                <ProviderApiFormatSelect
                  triggerId="login-api-key-api-format"
                  value={apiFormat}
                  onChange={setApiFormat}
                />
              </div>
              <div className="space-y-1">
                <label
                  className="text-ui-sm text-foreground-subtle"
                  htmlFor="login-api-key-model"
                >
                  {intl.formatMessage({ id: "login.apiKey.modelLabel" })}
                </label>
                <Input
                  id="login-api-key-model"
                  type="text"
                  size="lg"
                  className="h-10 w-full text-ui-base"
                  data-testid={TID_LOGIN_API_KEY_MODEL_INPUT}
                  value={modelIdValue}
                  placeholder={intl.formatMessage({
                    id: "login.apiKey.modelPlaceholder",
                  })}
                  autoComplete="off"
                  onChange={(event) => {
                    setModelIdValue(event.target.value);
                    setError(null);
                  }}
                />
              </div>
            </div>
          ) : null}
          <div className="relative">
            <Input
              id="login-api-key"
              type="password"
              size="lg"
              className={`h-10 w-full text-ui-base ${showApiKeyLink ? "pr-28" : ""}`}
              data-testid={TID_LOGIN_API_KEY_INPUT}
              aria-label={intl.formatMessage({
                id: "login.apiKey.placeholder",
              })}
              value={apiKeyValue}
              placeholder={intl.formatMessage({
                id: "login.apiKey.placeholder",
              })}
              autoComplete="off"
              onChange={(event) => {
                setApiKeyValue(event.target.value);
                setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSubmit) {
                  void saveApiKeyProvider();
                }
              }}
            />
            {showApiKeyLink ? (
              <button
                type="button"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-ui-base font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                disabled={busy}
                onClick={() => {
                  if (apiKeyUrl) {
                    platform.openExternal(apiKeyUrl);
                  }
                }}
              >
                {intl.formatMessage({ id: "login.apiKey.getApiKey" })}
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <Alert variant="destructive" data-testid={TID_LOGIN_API_KEY_ERROR}>
          <TriangleAlertIcon className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Button
          type="button"
          className="h-10 w-full text-ui-base"
          size="lg"
          data-testid={TID_LOGIN_API_KEY_CONTINUE_BUTTON}
          disabled={!canSubmit}
          onClick={() => void saveApiKeyProvider()}
        >
          {saving ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {intl.formatMessage({ id: "login.apiKey.continue" })}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full text-ui-base"
          size="lg"
          data-testid={TID_LOGIN_API_KEY_CANCEL_BUTTON}
          disabled={busy}
          onClick={onCancel}
        >
          {intl.formatMessage({ id: "login.apiKey.cancel" })}
        </Button>
        <Button
          type="button"
          variant="link"
          className="h-7 w-full text-ui-base text-foreground-subtle hover:text-foreground"
          data-testid={TID_LOGIN_API_KEY_SKIP_BUTTON}
          // 通用 provider 没有 family domain 可写，"暂时跳过"对它没有意义。
          disabled={busy || isCustomProvider}
          onClick={() => void skipApiKeyProvider()}
        >
          {skipping ? <Loader2Icon className="size-4 animate-spin" /> : null}
          {intl.formatMessage({ id: "login.skip" })}
        </Button>
      </div>
    </div>
  );
}
