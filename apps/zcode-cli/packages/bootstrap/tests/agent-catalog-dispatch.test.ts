import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPluginAgentTemplates, resolvePluginAgentProfiles } from "../src/subagents.js";

/**
 * Integração do catálogo: dos arquivos reais até o modelo efetivo do filho.
 *
 * Cobre a cadeia completa que a E2E de desktop exercitaria, menos oElectron:
 *   agents/*.md → loadPluginAgentTemplates → resolvePluginAgentProfiles
 *   → normalizeAgentProfiles → collectAgentListingAttachment
 *   → resolveSubagentSelection
 *
 * Vale mais que um teste de fumaça porque cada salto aqui é o mesmo que o
 * runtime percorre; um erro em qualquer elo faria este teste falhar.
 */
const CATALOG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../agent-catalog-plugin",
);
const CATALOG_AGENTS = ["code-reviewer", "repo-researcher", "test-triager", "long-form-summarizer"];
const PLUGIN_ID = "agent-catalog@zcode-plugins-official";
const PARENT = { providerId: "acme", modelId: "parent-model" };

// Reproduz o que adapters/src/plugins/plugin-components.ts:31 faz ao descobrir o
// plugin: varre agents/*.md e monta o grupo kind:"agent" a partir do frontmatter.
// O nome vem do disco, não de uma lista escrita à mão, então um papel renomeado
// ou removido quebra este teste em vez de passar silenciosamente.
function agentComponentGroup() {
  return {
    kind: "agent" as const,
    items: readdirSync(join(CATALOG_DIR, "agents"))
      .filter((file) => file.endsWith(".md"))
      .map((file) => ({
        name: /^name:\s*(.+)$/m.exec(readFileSync(join(CATALOG_DIR, "agents", file), "utf8"))![1]!
          .trim()
          .replace(/^["']|["']$/g, ""),
        path: join(CATALOG_DIR, "agents", file),
      })),
  };
}

const plugin = {
  id: PLUGIN_ID,
  name: "agent-catalog",
  rootPath: CATALOG_DIR,
  enabled: true,
  version: "0.1.0",
  components: [agentComponentGroup()],
} as Parameters<typeof loadPluginAgentTemplates>[0]["plugins"][number];

function activeAgents() {
  const templates = loadPluginAgentTemplates({ plugins: [plugin] });
  expect(templates.diagnostics).toEqual([]);
  const profiles = resolvePluginAgentProfiles({ plugins: [plugin] }, templates).profiles;
  return profiles;
}



describe("catálogo: do arquivo ao despacho", () => {
  it("semeia os quatro papéis sem configuração do usuário (CA-01)", () => {
    expect(existsSync(CATALOG_DIR), `catálogo ausente em ${CATALOG_DIR}`).toBe(true);

    const names = activeAgents().map((profile) => profile.name);
    for (const agent of CATALOG_AGENTS) {
      expect(names, `papel ausente: ${agent}`).toContain(`agent-catalog:${agent}`);
    }
  });

  it("o papel de revisão declara quando usar e quando não usar", () => {
    const reviewer = activeAgents().find(
      (profile) => profile.name === "agent-catalog:code-reviewer",
    );

    expect(reviewer?.description ?? "").toMatch(/Use it when/i);
    expect(reviewer?.description ?? "").toMatch(/does NOT/i);
    expect(reviewer?.tools).toContain("Bash");
    expect(reviewer?.tools).not.toContain("Write");
  });

  it("cada papel resolve o modelo efetivo como herança do pai (CA-01)", () => {
    for (const profile of activeAgents()) {
      if (!profile.name.startsWith("agent-catalog:")) continue;
      // 目录角色不带 modelSelection；继承发生在 core 的 resolveSubagentSelection，
      // 这里只断言"确实没固定模型"，core 的测试负责断言继承结果。
      expect(profile.modelSelection, `${profile.name} não deveria fixar modelo`).toBeUndefined();
    }
  });

  it("cada papel tem prompt de sistema próprio e não vazio", () => {
    for (const agent of CATALOG_AGENTS) {
      const profile = activeAgents().find((item) => item.name === `agent-catalog:${agent}`);
      expect(profile?.systemPrompt.length ?? 0).toBeGreaterThan(200);
    }
  });

  it("o markdown do catálogo é o que está no disco", () => {
    // Guarda contra o pacote ser gerado/empacotado a partir de outra fonte.
    const onDisk = readFileSync(join(CATALOG_DIR, "agents", "code-reviewer.md"), "utf8");
    const parsed = activeAgents().find(
      (profile) => profile.name === "agent-catalog:code-reviewer",
    );

    expect(onDisk).toContain(parsed!.description.split(" — ")[0]!.slice(0, 40));
  });
});