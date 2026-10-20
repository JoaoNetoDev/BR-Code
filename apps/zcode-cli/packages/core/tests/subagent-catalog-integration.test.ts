import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAgentProfileFromMarkdown, type AgentProfile } from "@zcode/shared";
import { collectAgentListingAttachment } from "../src/subagent/listing.js";
import { normalizeAgentProfiles } from "../src/subagent/profile.js";
import { resolveSubagentSelection } from "../src/runtime/helpers/subagent-selection.js";

/**
 * O outro lado da integração do catálogo (a semeadura está em
 * bootstrap/tests/agent-catalog-dispatch.test.ts): perfis do pacote → catálogo
 * injetado no pai → modelo efetivo do filho.
 *
 * O namespace `<plugin>:<name>` é aplicado aqui à mão porque quem o faz é
 * namespacePluginAgentProfile, em bootstrap; o bootstrap test garante que ele é
 * aplicado de verdade lá.
 */
const CATALOG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../agent-catalog-plugin/agents",
);
const CATALOG_AGENTS = ["code-reviewer", "repo-researcher", "test-triager", "long-form-summarizer"];
const PARENT = { providerId: "acme", modelId: "parent-model" };

function catalogProfiles(): AgentProfile[] {
  expect(existsSync(CATALOG_DIR), `catálogo ausente em ${CATALOG_DIR}`).toBe(true);

  return readdirSync(CATALOG_DIR)
    .filter((file) => file.endsWith(".md"))
    .flatMap((file) => {
      const parsed = parseAgentProfileFromMarkdown({
        content: readFileSync(join(CATALOG_DIR, file), "utf8"),
        path: file,
        source: "user",
      });
      expect(parsed.diagnostic, `${file}: ${parsed.diagnostic?.message ?? ""}`).toBeUndefined();
      const profile = parsed.profile!;
      return [
        { ...profile, name: `agent-catalog:${profile.name}` },
        { ...profile, name: profile.name },
      ];
    });
}

function injectedCatalog(profiles = catalogProfiles()) {
  const active = normalizeAgentProfiles(profiles);
  return collectAgentListingAttachment({
    definitions: { activeAgents: active },
    entries: [],
    tools: [{ name: "Agent" }],
  })!;
}

describe("catálogo: perfis do pacote viram catálogo do pai", () => {
  it("anuncia os quatro papéis qualificados e seus aliases (CA-08)", () => {
    const content = injectedCatalog().content;

    for (const agent of CATALOG_AGENTS) {
      expect(content, `linha ausente: ${agent}`).toContain(`- agent-catalog:${agent}:`);
    }
  });

  it("diz quando usar, quando não usar, ferramentas e custo relativo (CA-06)", () => {
    const content = injectedCatalog().content;
    const line = content.split("\n").find((item) => item.startsWith("- agent-catalog:code-reviewer:"))!;

    expect(line).toContain("Use it when");
    expect(line).toContain("does NOT");
    expect(line).toContain("Tools: Read, Grep, Glob, Bash");
    expect(line).toContain("herda o modelo atual");
    expect(line).toMatch(/escopo restrito a \d+ ferramentas?/);
  });

  it("nunca imprime o providerId no texto injetado (CA-07)", () => {
    expect(injectedCatalog().content).not.toContain("@zcode-plugins-official");
    expect(injectedCatalog().content).not.toContain("providerId");
  });

  it("resolve o modelo efetivo de cada papel como herança do pai (CA-21)", () => {
    const active = normalizeAgentProfiles(catalogProfiles());

    for (const profile of active) {
      if (!profile.name.startsWith("agent-catalog:")) continue;

      const { hasConcreteModel, selection } = resolveSubagentSelection({
        profileSelection: profile.modelSelection,
        parentSelection: PARENT,
      });

      expect(hasConcreteModel, `${profile.name} não deveria fixar modelo`).toBe(false);
      expect(selection).toEqual(PARENT);
    }
  });

  it("reemite a linha do catálogo quando o usuário sobrescreve o modelo", () => {
    const before = collectAgentListingAttachment({
      definitions: { activeAgents: normalizeAgentProfiles(catalogProfiles()) },
      entries: [],
      tools: [{ name: "Agent" }],
    })!;

    const overridden = catalogProfiles().map((profile) =>
      profile.name === "agent-catalog:code-reviewer"
        ? {
            ...profile,
            modelSelection: { providerId: "acme", modelId: "fast-model" },
          }
        : profile,
    );
    const after = collectAgentListingAttachment({
      definitions: { activeAgents: normalizeAgentProfiles(overridden) },
      entries: [before],
      tools: [{ name: "Agent" }],
    })!;

    expect(after.metadata.agentListingDelta?.addedTypes).toContain("agent-catalog:code-reviewer");
    expect(after.content).toContain("modelo definido pelo usuário: fast-model");
    // 只重播这一行，不重播整份目录。
    expect(after.metadata.agentListingDelta?.addedTypes).toHaveLength(1);
  });
});