// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  adaptMarketingPopup,
  marketingLabel,
} from "@/components/marketing-touch/marketingPopupAdapter.js";

describe("marketing popup adapter", () => {
  it.each(["zh-CN", "en-US"] as const)(
    "%s Start 设置入口明确叫查看套餐",
    (locale) => {
      const text = { format: "plaintext" as const, content: "立即使用" };
      const popup = adaptMarketingPopup(
        "start",
        locale,
        {
          title: text,
          description: text,
          buttons: [
            {
              text,
              action: {
                type: "navigate",
                args: {
                  page: "settings",
                  section: "models",
                  provider_id: "account:bigmodel-start-plan",
                },
              },
            },
          ],
        },
        null,
        locale === "zh-CN" ? "查看套餐" : "View plan",
      );
      expect(popup.dialog.buttons[0]?.label).toBe(
        locale === "zh-CN" ? "查看套餐" : "View plan",
      );
      expect(popup.dialog.buttons[0]?.formattedLabel?.text).toBe(
        popup.dialog.buttons[0]?.label,
      );
    },
  );
  it("preserves popup themes and uses default when omitted", () => {
    const text = { format: "plaintext" as const, content: "Close" };
    const theme = {
      variant: "ghost" as const,
      class: "rounded-lg",
      style: "color: red",
    };
    const result = adaptMarketingPopup(
      "test",
      "en-US",
      {
        title: text,
        description: text,
        buttons: [
          { text, theme, action: { type: "close" } },
          { text, action: { type: "close" } },
        ],
      },
      null,
    );
    expect(result.dialog.buttons[0]?.theme).toEqual(theme);
    expect(result.dialog.buttons[1]?.theme).toEqual({ variant: "default" });
  });
  it("keeps copy text literal and correlates navigation through stable button ids", () => {
    const text = { format: "plaintext" as const, content: "Open" };
    const payload = adaptMarketingPopup(
      "action",
      "en-US",
      {
        title: text,
        description: text,
        buttons: [
          {
            text,
            action: {
              type: "navigate",
              args: {
                page: "settings",
                section: "models",
                provider_id: "bigmodel",
              },
            },
          },
          {
            text,
            action: {
              type: "navigate",
              args: { page: "plugin_marketplace", plugin_id: "plugin@market" },
            },
          },
          {
            text,
            action: {
              type: "copy_text",
              args: { text: "<b>literal</b>\n next " },
            },
          },
        ],
      },
      null,
    );
    expect(payload.actions).toEqual({
      "button-0": { type: "navigate", destination: "settings" },
      "button-1": { type: "navigate", destination: "plugin_store" },
      "button-2": { type: "copy_text", text: "<b>literal</b>\n next " },
    });
    expect(payload.dialog.buttons.map((button) => button.actionId)).toEqual([
      "button-0",
      "button-1",
      "button-2",
    ]);
  });
  it("strips markup from labels and drops legacy actions so no no-op button is rendered", () => {
    const payload = adaptMarketingPopup(
      "193001",
      "en-US",
      {
        title: { format: "plaintext", content: "News" },
        description: { format: "html", content: "<p>Hello</p>" },
        buttons: [
          {
            text: {
              format: "html",
              content: "<b>Claim</b><script>bad()</script>",
            },
            action: { type: "claim_zcode_plan", args: { plan_id: "plan" } },
          },
          {
            text: { format: "plaintext", content: "Close" },
            action: { type: "close" },
          },
        ],
      },
      null,
    );
    expect(payload.dialog.hero).toBeNull();
    // CA-12：遗留 claim 动作不得落到弹窗上，否则 CloudContentDialog 会渲染一个
    // 没有 handler 的绝对 no-op 按钮（无 pending、无报错、无上报）。
    expect(payload.actions["button-0"]).toBeUndefined();
    expect(payload.dialog.buttons.map((button) => button.actionId)).toEqual([
      "button-1",
    ]);
    expect(payload.actions["button-1"]).toEqual({ type: "close" });
    expect(payload.dialog.buttons[0]?.label).toBe("Close");
    expect(payload.dialog.formattedTitle).toEqual({
      format: "plain_text",
      text: "News",
    });
    expect(payload.dialog.description).toEqual({
      format: "html",
      text: "<p>Hello</p>",
    });
  });
  it("keeps plaintext literal and does not attach remote styles", () => {
    expect(
      marketingLabel({ format: "plaintext", content: "<b>literal</b>" }),
    ).toBe("<b>literal</b>");
  });
});
