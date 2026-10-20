import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

// RF-08：注册提示是「按 API key 接入的预设尚未开通账号」的通用能力，
// 不再对某个品牌做特殊处理。是否展示只由预设是否声明注册地址决定。
export function ProviderRegistrationHint({
  onOpenRegistration,
}: {
  onOpenRegistration?: () => void;
}) {
  const { intl } = useZCodeIntl();

  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-ui-base text-foreground-subtle">
      {intl.formatMessage({
        id: "settings.modelProvider.registration.unregisteredHint",
      })}
      {onOpenRegistration ? (
        <Button
          type="button"
          variant="link"
          size="xs"
          className="h-auto p-0 text-ui-base/relaxed"
          onClick={onOpenRegistration}
        >
          {intl.formatMessage({
            id: "settings.modelProvider.registration.registerAction",
          })}
        </Button>
      ) : null}
    </span>
  );
}

export function isProviderUnregisteredAuthError(error: string | null | undefined): boolean {
  if (!error) {
    return false;
  }

  const normalized = error.toLowerCase();
  // 保持品牌无关：只匹配「账号未注册」的通用语义，任何服务商都走同一条提示。
  return (
    normalized.includes("not registered") ||
    normalized.includes("account is not registered") ||
    error.includes("账号未注册")
  );
}
