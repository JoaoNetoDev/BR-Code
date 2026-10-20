import { describe, expect, it } from "vitest";
import { BUILTIN_MODEL_PROVIDER_IDS } from "@zcode/shared";
import type { ModelSelectionView } from "@zcode/services";
import { buildRegistryModelSelectGroups } from "../src/lib/modelSelectionGroups.js";

describe("model selection groups", () => {
  it.each([
    [
      {
        type: "zhipu-account",
        accountType: "zai",
        mode: "individual-coding-plan",
      },
      false,
    ],
    [
      {
        type: "zhipu-account",
        accountType: "bigmodel",
        mode: "team-coding-plan",
      },
      false,
    ],
    [{ type: "zhipu-coding-plan-api-key" }, false],
    [{ type: "zhipu-account", accountType: "zai", mode: "start-plan" }, false],
    [
      { type: "zhipu-account", accountType: "bigmodel", mode: "start-plan" },
      false,
    ],
    [
      { type: "zhipu-account", accountType: "bigmodel", mode: "off-peak" },
      true,
    ],
    [{ type: "api-key" }, true],
  ])(
    "仅套餐 GLM-5.3 隐藏视觉标，不影响 Flash/真实能力：%j",
    (access, expected) => {
      const view: ModelSelectionView = {
        revision: 1,
        providers: [
          {
            providerId: "fixture",
            config: {
              access:
                access as ModelSelectionView["providers"][number]["config"]["access"],
              api: { type: "anthropic-messages" },
            },
            models: ["GLM-5.3", "GLM-5.3-Flash", "GLM-4.7"].map((modelId) => ({
              modelId,
              config: { properties: { inputFormat: { supportsImage: true } } },
            })),
          },
        ],
      };
      const items = buildRegistryModelSelectGroups("glm", view)[0]!.items;
      expect(items[0]!.supportsVisionInput === true).toBe(expected);
      expect(items[1]!.supportsVisionInput).toBe(true);
      expect(items[2]!.supportsVisionInput).toBe(true);
      expect(
        view.providers[0]!.models[0]!.config.properties?.inputFormat
          ?.supportsImage,
      ).toBe(true);
    },
  );
  it("保留带前缀和多段斜杠的精确模型 ID；不从名称推断视觉能力", () => {
    const modelId = "upstream/family/vision-preview";
    const view: ModelSelectionView = {
      revision: 1,
      providers: [
        {
          providerId: "aggregator",
          config: {
            api: {
              type: "openai-chat-completions",
              baseUrl: "https://example.test/v1",
            },
          },
          models: [
            {
              modelId,
              config: { properties: { inputFormat: { supportsImage: true } } },
            },
          ],
        },
      ],
    };
    expect(buildRegistryModelSelectGroups("glm", view)[0]?.items).toEqual([
      {
        key: `registry-provider:aggregator:${modelId}`,
        value: "custom:aggregator:upstream%2Ffamily%2Fvision-preview",
        name: modelId,
        supportsVisionInput: true,
      },
    ]);
    view.providers[0]!.models[0]!.config = {};
    expect(
      buildRegistryModelSelectGroups("glm", view)[0]?.items[0],
    ).not.toHaveProperty("supportsVisionInput");
  });
  it("直接把 Registry API Provider 投影为有序模型组", () => {
    const selectionView: ModelSelectionView = {
      revision: 7,
      providers: [
        {
          providerId: "anthropic-api",
          providerName: "Anthropic API",
          config: {
            access: { type: "api-key", apiKey: "secret" },
            api: {
              type: "anthropic-messages",
              baseUrl: "https://example.com/anthropic",
            },
            models: ["claude-a", "claude-b"],
          },
          models: [
            {
              modelId: "claude-a",
              config: { properties: { inputFormat: { supportsImage: true } } },
            },
            { modelId: "claude-b", config: {} },
          ],
        },
        {
          providerId: "openai-api",
          providerName: "OpenAI API",
          config: {
            access: { type: "api-key", apiKey: "secret" },
            api: {
              type: "openai-responses",
              baseUrl: "https://example.com/openai",
            },
            models: ["model-a"],
          },
          models: [{ modelId: "model-a", config: {} }],
        },
      ],
    };

    expect(buildRegistryModelSelectGroups("glm", selectionView)).toEqual([
      {
        key: "registry-provider:anthropic-api",
        label: "Anthropic API",
        items: [
          {
            key: "registry-provider:anthropic-api:claude-a",
            value: "custom:anthropic-api:claude-a",
            name: "claude-a",
            supportsVisionInput: true,
          },
          {
            key: "registry-provider:anthropic-api:claude-b",
            value: "custom:anthropic-api:claude-b",
            name: "claude-b",
          },
        ],
      },
      {
        key: "registry-provider:openai-api",
        label: "OpenAI API",
        items: [
          {
            key: "registry-provider:openai-api:model-a",
            value: "custom:openai-api:model-a",
            name: "model-a",
          },
        ],
      },
    ]);
  });

  it("直接把 Registry Account Provider 投影为已选连接，不重新裁决 Family", () => {
    const providerId = BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan;
    const selectionView: ModelSelectionView = {
      revision: 8,
      providers: [
        {
          providerId,
          providerName: "BigModel Coding Plan",
          config: {
            access: {
              type: "zhipu-account",
              accountType: "bigmodel",
              mode: "team-coding-plan",
              entitled: true,
            },
            api: {
              type: "anthropic-messages",
              baseUrl: "https://example.com/anthropic",
            },
            models: ["GLM-5.2"],
          },
          models: [{ modelId: "GLM-5.2", config: {} }],
        },
      ],
    };

    expect(buildRegistryModelSelectGroups("glm", selectionView)).toEqual([
      {
        key: `registry-provider:${providerId}`,
        label: "BigModel",
        labelBadge: "Team",
        directItems: true,
        items: [
          {
            key: `registry-provider:${providerId}:GLM-5.2`,
            value: "custom:account%3Abigmodel-team-coding-plan:GLM-5.2",
            name: "GLM-5.2",
          },
        ],
      },
    ]);
  });

  // RF-12a：hideAccountBadges 是自动化/子代理模型下拉唯一的徽标开关。
  // 若 early-return 被挪动，硬编码的 Free/Individual/Team 营销徽标会静默回流，且没有任何测试失败。
  it("hideAccountBadges 关闭账号分组徽标，但保留分组名称", () => {
    const providers = [
      {
        providerId: BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
        mode: "individual-coding-plan",
        badge: "Individual",
      },
      {
        providerId: BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan,
        mode: "team-coding-plan",
        badge: "Team",
      },
      {
        providerId: BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan,
        mode: "start-plan",
        badge: "Free",
      },
    ] as const;

    for (const { providerId, mode, badge } of providers) {
      const selectionView: ModelSelectionView = {
        revision: 1,
        providers: [
          {
            providerId,
            config: {
              access: {
                type: "zhipu-account",
                accountType: mode === "team-coding-plan" ? "bigmodel" : "zai",
                mode,
                entitled: true,
              },
              api: { type: "anthropic-messages" },
              models: ["GLM-5.2"],
            },
            models: [{ modelId: "GLM-5.2", config: {} }],
          },
        ],
      };

      const [hidden] = buildRegistryModelSelectGroups("glm", selectionView, {
        hideAccountBadges: true,
      });
      expect(hidden).toBeDefined();
      expect(hidden!.labelBadge).toBeUndefined();
      expect(hidden!.label).toBeTruthy();

      // 回归护栏：不传该选项时营销徽标必须继续存在（其它界面保持默认展示）。
      const [shown] = buildRegistryModelSelectGroups("glm", selectionView);
      expect(shown!.labelBadge).toBe(badge);
    }
  });
});
