import { describe, expect, it } from "vitest";
import { resolvePluginAgentProfiles } from "../src/subagents.js";
import { createPluginAgentStateId } from "@zcode/shared";

/**
 * 停用插件来源的 subagent（RF-04）。
 *
 * 关键点：插件 profile 从不经过 `resolveSubagentRuntimeProfiles` 的过滤——
 * 它在 `create-app.ts` 里被直接拼进 `activeAgents`。所以停用必须在插件
 * resolver 内部执行，否则 UI 上的开关会是一个静默无效的假控件。
 *
 * 这里只覆盖 resolver；路径正确性由 `resolvePluginAgentProfiles` 的类型与
 * `create-app.ts` 的两个调用点保证，两者都会传 `disabledAgentIds`。
 */
const PLUGIN_ID = "agent-catalog@zcode-plugins-official";
const OTHER_PLUGIN_ID = "other-plugin@zcode-plugins-official";

function plugin(id: string, name: string) {
  return {
    id,
    name,
    rootPath: `/plugins/${name}`,
    enabled: true,
    version: "0.1.0",
  };
}

function templatesFor(entries: Array<{ pluginId: string; bareName: string }>) {
  return {
    profiles: entries.map(({ pluginId, bareName }) => ({
      bareName,
      plugin: plugin(pluginId, pluginId.split("@")[0]!),
      profile: {
        name: bareName,
        description: `${bareName} role`,
        source: "user" as const,
        systemPrompt: `You are ${bareName}.`,
        tools: ["Read"],
      },
    })),
    diagnostics: [],
  };
}

const CATALOG = templatesFor([
  { pluginId: PLUGIN_ID, bareName: "code-reviewer" },
  { pluginId: PLUGIN_ID, bareName: "repo-researcher" },
]);

function resolve(templates = CATALOG, disabledAgentIds: Iterable<string> = []) {
  return resolvePluginAgentProfiles(
    { plugins: [], disabledAgentIds },
    templates as Parameters<typeof resolvePluginAgentProfiles>[1],
  ).profiles.map((profile) => profile.name);
}

describe("停用插件来源的 subagent（RF-04）", () => {
  it("不传 disabledAgentIds 时保留全部 profile 及别名", () => {
    expect(resolve()).toEqual(
      expect.arrayContaining([
        "agent-catalog:code-reviewer",
        "code-reviewer",
        "agent-catalog:repo-researcher",
        "repo-researcher",
      ]),
    );
  });

  it("命中 id 时同时移除限定名与别名（CA-11）", () => {
    const names = resolve(
      CATALOG,
      new Set([createPluginAgentStateId(PLUGIN_ID, "code-reviewer")]),
    );

    expect(names).not.toContain("agent-catalog:code-reviewer");
    // 关键回归点：只去掉限定名的话，短名仍可被派发，开关就成了假控件。
    expect(names).not.toContain("code-reviewer");
    // 兄弟角色不受影响。
    expect(names).toContain("agent-catalog:repo-researcher");
    expect(names).toContain("repo-researcher");
  });

  it("用 createPluginAgentStateId 的规范格式，不接受裸名", () => {
    const wrongKey = resolve(CATALOG, new Set(["code-reviewer"]));

    expect(wrongKey).toContain("code-reviewer");
    expect(createPluginAgentStateId(PLUGIN_ID, "code-reviewer")).toBe(
      `plugin:${PLUGIN_ID}:code-reviewer`,
    );
  });

  it("只停用同名不同插件里的角色，互不影响", () => {
    const templates = templatesFor([
      { pluginId: PLUGIN_ID, bareName: "code-reviewer" },
      { pluginId: OTHER_PLUGIN_ID, bareName: "code-reviewer" },
    ]);

    const names = resolve(templates, new Set([createPluginAgentStateId(PLUGIN_ID, "code-reviewer")]));

    expect(names).toContain("other-plugin:code-reviewer");
    expect(names).not.toContain("agent-catalog:code-reviewer");
  });

  it("停用全部角色时 resolve 不抛错、返回空目录", () => {
    const names = resolve(
      CATALOG,
      new Set([
        createPluginAgentStateId(PLUGIN_ID, "code-reviewer"),
        createPluginAgentStateId(PLUGIN_ID, "repo-researcher"),
      ]),
    );

    expect(names).toEqual([]);
  });
});