/**
 * WelcomeScreen —— 登录入口
 *
 * 入口态只保留「使用 API Key」这一条主路径（SPEC §2.1 / RF-01）：
 * UI 不再渲染任何 OAuth 渠道按钮，也不再拉取 OAuth provider 列表；
 * 用户点击后进入 API Key 表单，取消可退回入口态。
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { TID_LOGIN_USE_API_KEY_BUTTON } from "@zcode/shared/test-ids";
import { Button } from "./components/ui/button.js";
import { ZCodeAboutLogo } from "@/components/ui/ZCodeAboutLogo.js";
import { useZCodeIntl } from "./i18n/IntlProvider.js";
import { LoginApiKeyForm } from "./login/LoginApiKeyForm.js";
import { useZCodeStore } from "./store/StoreProvider.js";
import { ThemeHeroVisual } from "./openWorkspacePageThemeHero.js";
import { DesktopOverlayWindowControls } from "@/DesktopOverlayWindowControls.js";

interface WelcomeScreenProps {
  onComplete: (reason: LoginCompleteReason) => void | Promise<void>;
}

export type LoginCompleteReason = "oauth" | "apiKey" | "skip";

export function WelcomeScreen({ onComplete }: WelcomeScreenProps) {
  return (
    <main className="relative flex h-full min-h-dvh items-center justify-center overflow-hidden bg-background px-4 py-6 text-foreground sm:px-6">
      <ThemeHeroVisual className="absolute inset-0" />
      {/* 原生拖拽命中不受 pointer-events/z-index 约束；拖拽层必须避开窗控，且先于 no-drag 区声明。 */}
      <div className="pointer-events-none absolute left-0 top-0 right-0 z-10 flex h-12 items-center [app-region:drag] platform-windows-desktop:right-[134px] platform-linux-desktop:right-[134px]" />
      <DesktopOverlayWindowControls />
      <section className="relative z-10 w-full flex flex-col gap-10 max-w-sm rounded-2xl border border-popover-border bg-background p-8 text-ui-base/relaxed shadow-md sm:p-10">
        <LoginPanel active onComplete={onComplete} />
      </section>
    </main>
  );
}

interface LoginPanelProps {
  active: boolean;
  onComplete: (reason: LoginCompleteReason) => void | Promise<void>;
}

function LoginPanel({ active, onComplete }: LoginPanelProps) {
  const { intl } = useZCodeIntl();
  const loginEntryRequest = useZCodeStore((state) => state.loginEntryRequest);
  const clearLoginEntryRequest = useZCodeStore((state) => state.clearLoginEntryRequest);
  // RF-01：登录入口收敛为 API Key 单一路径，入口态不再有 provider 列表可排序，
  // 因此没有渠道优先级，也没有任何 OAuth 等待/失败/重试分支（CA-01/CA-02/CA-04）。
  const [loginMode, setLoginMode] = useState<"entry" | "apiKey">("entry");
  const wasActiveRef = useRef(active);

  const resetApiKeyForm = useCallback(() => {
    setLoginMode("entry");
  }, []);

  // RF-01/RF-05：UI 已不提供任何按 provider 自动发起的 OAuth 流程，但 settings 侧
  // （ModelProviderSection 的 requestLoginEntry，本 sprint 不改）仍会写入该请求。
  // 这里在入口挂载时消费并丢弃它，否则请求会永久留在 store 里，等 S5 移除调用方后
  // 形成一个永远等不到消费者的悬挂状态。
  useEffect(() => {
    if (!active || !loginEntryRequest) {
      return;
    }
    clearLoginEntryRequest(loginEntryRequest.id);
  }, [active, clearLoginEntryRequest, loginEntryRequest]);

  useEffect(() => {
    if (active) {
      wasActiveRef.current = true;
      return;
    }

    if (!wasActiveRef.current) {
      return;
    }
    wasActiveRef.current = false;
    // 登录入口被外部关闭时重置到入口态，避免下次打开时残留半填的 API Key 表单状态。
    resetApiKeyForm();
    clearLoginEntryRequest();
  }, [active, clearLoginEntryRequest, resetApiKeyForm]);

  return (
    <>
      <LoginPanelHeader
        title={intl.formatMessage({ id: "login.title" })}
        description={intl.formatMessage({ id: "login.description" })}
      >
        {null}
      </LoginPanelHeader>

      <div className="space-y-6">
        {loginMode === "entry" ? (
          <div className="space-y-2">
            <Button
              variant="default"
              className="h-10 w-full text-ui-base"
              size="lg"
              data-testid={TID_LOGIN_USE_API_KEY_BUTTON}
              onClick={() => {
                setLoginMode("apiKey");
              }}
            >
              {intl.formatMessage({ id: "login.useApiKey" })}
            </Button>
          </div>
        ) : null}

        {loginMode === "apiKey" ? (
          <LoginApiKeyForm
            // 取消必须有真实去向：回到入口态，而不是留在表单或关闭登录入口（SPEC §2.1）。
            onCancel={() => setLoginMode("entry")}
            onSaved={() => {
              resetApiKeyForm();
              return onComplete("apiKey");
            }}
            onSkipped={() => {
              resetApiKeyForm();
              return onComplete("skip");
            }}
          />
        ) : null}
      </div>
    </>
  );
}

function LoginPanelHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <header className="flex flex-col items-center gap-3 text-center">
      <LoginPanelLogo />
      <div className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="text-ui-base/relaxed text-foreground-subtle">{description}</p>
      </div>
      {children}
    </header>
  );
}

function LoginPanelLogo() {
  return (
    // 登录 logo 壳是固定深色底，边框不能跟随浅色主题 token，否则浅色主题下边框过重。
    <div
      className="relative mb-1 flex size-16 items-center justify-center rounded-2xl bg-[linear-gradient(180deg,#000000_0%,#151718_100%)] text-[#ffffff] shadow-lg/20 before:pointer-events-none before:absolute before:inset-0 before:rounded-2xl before:border before:border-[rgba(255,255,255,0.1)]"
      aria-label="ZCode"
      role="img"
    >
      <ZCodeAboutLogo className="h-auto w-10" />
    </div>
  );
}
