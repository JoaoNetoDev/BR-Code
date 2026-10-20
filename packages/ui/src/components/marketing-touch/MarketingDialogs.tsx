import { useEffect } from "react";
import { useStore } from "zustand";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { toast } from "@/components/ui/toast.js";
import { CloudContentDialog } from "@/components/cloud-content-dialog/CloudContentDialog.js";
import { adaptMarketingPopup } from "@/components/marketing-touch/marketingPopupAdapter.js";
import { marketingNavigation } from "@/lib/marketingNavigation.js";
import type { MarketingTouchController } from "@/components/marketing-touch/marketingTouchController.js";

export function MarketingDialogs({ controller }: { controller: MarketingTouchController }) {
  const state = useStore(controller.store);
  const openingUpgrade = useStore(
    marketingNavigation,
    (state) => state.request?.target.page === "upgrade",
  );
  const { locale, intl } = useZCodeIntl();
  // 领取错误弹窗已随 claim 移除：这里只承载中性投递的失败提示。
  useEffect(() => {
    if (state.error) {
      toast(state.error);
      controller.clearError();
    }
  }, [state.error, controller]);
  const dialog = state.dialog;
  const content = !dialog
    ? null
    : dialog.delivery.resource_position === "popup"
      ? dialog.delivery.popup
      : dialog.delivery.banner.success_popup;
  const payload =
    dialog && content
      ? adaptMarketingPopup(
          dialog.delivery.campaign_id,
          locale,
          content,
          dialog.hero,
          intl.formatMessage({ id: "manualClaimPlan.claim.dialog.modelSettings" }),
        )
      : null;
  return (
    <>
      {payload && content ? (
        <CloudContentDialog
          payload={payload}
          open={!openingUpgrade}
          actionPending={state.pending}
          onClose={() => {
            void controller.closeDialog();
          }}
          labels={{
            actionFailed: intl.formatMessage({ id: "marketingTouch.failed" }),
            copySucceeded: intl.formatMessage({
              id: "manualClaimPlan.claim.share.copyTextSucceeded",
            }),
          }}
          handlers={{
            open_external: async (action) => {
              await controller.dialogAction({ type: "open_url", args: { url: action.url } });
            },
            copy_text: async (action) => {
              const result = await controller.dialogAction({
                type: "copy_text",
                args: { text: action.text },
              });
              if (result?.status !== "success") throw new Error("marketing_copy_failed");
            },
            navigate: async (_action, actionId) => {
              const button = content.buttons.find(
                (_button, index) => `button-${index}` === actionId,
              );
              if (button?.action.type !== "navigate")
                throw new Error("marketing_navigation_invalid");
              const result = await controller.dialogAction(button.action);
              if (result?.status !== "success") throw new Error("marketing_navigation_failed");
            },
          }}
        />
      ) : null}
    </>
  );
}
