import { additionalRequestModalSelectors } from "@/request-security-edition/errors.js";
import { isStartPlanModelProviderId, type MarketingPopup } from "@zcode/shared";
import type {
  CloudContentDialogPayload,
  CloudDialogHero,
} from "@/components/cloud-content-dialog/cloudContentDialogTypes.js";
import { isSupportedMarketingAction } from "@/components/marketing-touch/marketingTouchController.js";

export function canOpenMarketingPopup() {
  return (
    document.visibilityState !== "hidden" &&
    !document.querySelector(
      [
        '[role="dialog"]',
        '[role="alertdialog"]',
        '[data-testid="coding-plan-upgrade-surface"]',
        ...additionalRequestModalSelectors,
      ].join(", "),
    )
  );
}

export function marketingLabel(text: MarketingPopup["title"]): string {
  if (text.format !== "html") return text.content;
  const template = document.createElement("template");
  template.innerHTML = text.content;
  template.content
    .querySelectorAll("script,style,iframe,object,svg,math,template")
    .forEach((node) => node.remove());
  return template.content.textContent?.trim() ?? "";
}

export function adaptMarketingPopup(
  id: string,
  locale: "zh-CN" | "en-US",
  popup: MarketingPopup,
  hero: CloudDialogHero | null,
  viewPlanLabel?: string,
): CloudContentDialogPayload {
  const actions: CloudContentDialogPayload["actions"] = {};
  // 遗留动作（PRD R3，如 claim）不得进入弹窗按钮：CloudContentDialog 对没有 handler 的
  // action 会早退，若还渲染按钮就会得到一个既无 pending 也无报错上报的绝对 no-op 按钮。
  // 因此在适配层按与 isMarketingBannerRenderable 相同的白名单过滤。
  // key 仍取原始下标，MarketingDialogs 用 `button-<index>` 回查原始 buttons 的动作。
  const buttons = popup.buttons.flatMap((button, index) => {
    const action = button.action;
    if (!isSupportedMarketingAction(action)) return [];
    const key = `button-${index}`;
    const labelOverride =
      viewPlanLabel &&
      action.type === "navigate" &&
      action.args.page === "settings" &&
      action.args.section === "models" &&
      isStartPlanModelProviderId(action.args.provider_id ?? "")
        ? viewPlanLabel
        : undefined;
    // 白名单之外的动作已在上一行被丢弃；这里按 switch 逐个适配，
    // 白名单新增的动作若未在此处理，类型收窄会在编译期报错而不是变成 no-op 按钮。
    const adapted = ((): CloudContentDialogPayload["actions"][string] => {
      switch (action.type) {
        case "close":
          return { type: "close" };
        case "open_url":
          return { type: "open_external", url: action.args.url };
        case "copy_text":
          return { type: "copy_text", text: action.args.text };
        case "navigate":
          return {
            type: "navigate",
            destination:
              action.args.page === "plugin_marketplace"
                ? "plugin_store"
                : "settings",
          };
      }
    })();
    actions[key] = adapted;
    return [
      {
        id: key,
        actionId: key,
        label: labelOverride ?? marketingLabel(button.text),
        formattedLabel: {
          format:
            labelOverride || button.text.format === "plaintext"
              ? ("plain_text" as const)
              : button.text.format,
          text: labelOverride ?? button.text.content,
        },
        variant:
          action.type === "close"
            ? ("secondary" as const)
            : ("primary" as const),
        theme: button.theme ?? { variant: "default" as const },
      },
    ];
  });
  return {
    schemaVersion: 1,
    id,
    revision: 1,
    kind: "campaign",
    locale,
    dialog: {
      title: marketingLabel(popup.title),
      formattedTitle: {
        format:
          popup.title.format === "plaintext"
            ? "plain_text"
            : popup.title.format,
        text: popup.title.content,
      },
      description: {
        format:
          popup.description.format === "plaintext"
            ? "plain_text"
            : popup.description.format,
        text: popup.description.content,
      },
      hero,
      buttons,
    },
    actions,
  };
}
