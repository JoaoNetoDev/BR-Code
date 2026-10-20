import { describe, expect, it } from "vitest";
import { createTestModelSelection } from "./test-model-selection.js";
import { collectAgentListingAttachment } from "../src/subagent/listing.js";
import { parseAgentListingDelta } from "../src/agent/agent-listing-metadata.js";
import type { RuntimeMessageEntry } from "../src/agent/message-history.js";
import type { AgentProfile } from "../src/subagent/profile.js";
import { formatAgentProfileForPrompt } from "../src/subagent/profile.js";
import { buildProviderRequestMessages } from "../src/runtime/helpers/provider-request-messages.js";

/**
 * Catálogo injetado no pai: custo relativo (RF-06) e re-emissão por mudança de
 * conteúdo (RF-09), sem re-anunciar a lista a cada turno (RF-08).
 */
const profile = (
  name: string,
  overrides: Partial<AgentProfile> = {},
): AgentProfile => ({
  name,
  description: `Description ${name}`,
  source: "user",
  systemPrompt: "private instructions",
  tools: ["Read"],
  ...overrides,
});

const collect = (
  profiles: readonly AgentProfile[],
  history: readonly RuntimeMessageEntry[] = [],
) =>
  collectAgentListingAttachment({
    definitions: { activeAgents: profiles },
    entries: history,
    tools: [{ name: "Agent" }],
  });

describe("linha de catálogo: custo relativo (RF-06)", () => {
  it("anuncia herança do modelo atual quando o perfil não fixa modelo", () => {
    const line = formatAgentProfileForPrompt(profile("code-reviewer"));

    expect(line).toContain("(Tools: Read; herda o modelo atual; escopo restrito a 1 ferramenta)");
  });

  it("nunca imprime providerId, apenas o modelId do override", () => {
    const line = formatAgentProfileForPrompt(
      profile("code-reviewer", {
        modelSelection: {
          providerId: "account:bigmodel-individual-coding-plan",
          modelId: "GLM-5.3",
        },
      }),
    );

    expect(line).toContain("modelo definido pelo usuário: GLM-5.3");
    expect(line).not.toContain("account:bigmodel");
    expect(line).not.toContain("providerId");
  });

  it("não conta ferramentas quando a lista não é expandível por '*'", () => {
    // filterSubagentChildToolNames não expande "*"，报数量只会给出假信息。
    const line = formatAgentProfileForPrompt(
      profile("general-purpose", { tools: ["*"], description: "General-purpose agent" }),
    );

    expect(line).not.toContain("escopo restrito a");
    expect(line).toContain("herda o modelo atual");
  });

  it("omite a contagem quando o perfil não declara ferramentas", () => {
    const line = formatAgentProfileForPrompt(profile("opaque", { tools: undefined }));

    expect(line).not.toContain("Tools:");
    expect(line).toContain("herda o modelo atual");
    expect(line).not.toContain("escopo restrito a");
  });

  it("usa a lista já resolvida no ramo Explore, não profile.tools", () => {
    const line = formatAgentProfileForPrompt(
      profile("Explore", { source: "built-in", tools: undefined, description: "Read-only search" }),
    );

    // Explore 的工具来自 formatExploreAllowedToolsForAgentDescription。
    expect(line).toContain("Tools:");
    expect(line).toMatch(/escopo restrito a \d+ ferramentas?/);
  });
});

describe("delta por conteúdo (RF-08, RF-09, CA-14)", () => {
  it("não emite nada quando nada mudou entre turnos", () => {
    const profiles = [profile("code-reviewer")];
    const first = collect(profiles);

    expect(first).toBeDefined();
    expect(collect(profiles, [first!])).toBeUndefined();
  });

  it("reemite a linha quando o modelo muda, mesmo com o nome intacto", () => {
    const before = [profile("code-reviewer")];
    const first = collect(before)!;

    const after = [
      profile("code-reviewer", { modelSelection: createTestModelSelection("test-provider/model-x") }),
    ];
    const second = collect(after, [first]);

    expect(second).toBeDefined();
    expect(second!.metadata.agentListingDelta?.addedTypes).toEqual(["code-reviewer"]);
    expect(second!.content).toContain("modelo definido pelo usuário");
    expect(second!.content).not.toContain("Available agent types");
  });

  it("não repete o anúncio nas turnos seguintes à mudança", () => {
    const before = [profile("code-reviewer")];
    const after = [
      profile("code-reviewer", { modelSelection: createTestModelSelection("test-provider/model-x") }),
    ];
    const initial = collect(before)!;
    const changed = collect(after, [initial])!;
    expect(changed.metadata.agentListingDelta?.addedTypes).toEqual(["code-reviewer"]);

    // já anunciado o texto novo: as próximas voltas não devem repetir
    expect(collect(after, [initial, changed])).toBeUndefined();
  });

  it("remove o perfil desabilitado e o re-anuncia quando volta", () => {
    const profiles = [profile("code-reviewer")];
    const first = collect(profiles)!;

    // desabilitado: some da lista ativa e precisa ser comunicado como removido
    const removed = collect([profile("other")], [first])!;
    expect(removed.metadata.agentListingDelta?.removedTypes).toEqual(["code-reviewer"]);

    // reabilitado com o mesmo texto: a remoção apagou a chave, então volta a ser anunciado
    const restored = collect(profiles, [removed])!;
    expect(restored.metadata.agentListingDelta?.addedTypes).toEqual(["code-reviewer"]);

    // e a partir daí não repete
    expect(collect(profiles, [removed, restored])).toBeUndefined();
  });

  it("mantém o cabeçalho inicial na primeira temporada e o incremental depois", () => {
    const first = collect([profile("A")])!;
    expect(first.metadata.agentListingDelta?.isInitial).toBe(true);

    const second = collect([profile("A"), profile("B")], [first])!;
    expect(second.metadata.agentListingDelta?.isInitial).toBe(false);
  });

  it("persiste o texto anunciado sem vazar para o payload do provedor", async () => {
    const first = collect([profile("code-reviewer")])!;
    expect(first.metadata.agentListingDelta?.announcedLines).toMatchObject({
      "code-reviewer": expect.stringContaining("herda o modelo atual"),
    });

    const { messages } = buildProviderRequestMessages({
      entries: [{ message: { role: "assistant", content: "previous response" } }, first],
      useMidConversationSystem: true,
    });

    const payload = JSON.stringify(messages);
    expect(payload).not.toContain("announcedLines");
    expect(payload).toContain("code-reviewer");
  });
});

describe("parseAgentListingDelta: announcedLines (CA-14)", () => {
  const base = {
    addedTypes: ["A"],
    addedLines: ["- A: Description A (Tools: Read; herda o modelo atual)"],
    removedTypes: [],
    isInitial: true,
    showConcurrencyNote: true,
  };

  it("aceita o formato antigo, sem announcedLines", () => {
    expect(parseAgentListingDelta(base)).toEqual(base);
  });

  it("aceita announcedLines coerente com as linhas do delta", () => {
    const delta = { ...base, announcedLines: { A: base.addedLines[0]! } };
    expect(parseAgentListingDelta(delta)?.announcedLines).toEqual({ A: base.addedLines[0] });
  });

  it("rejeta announcedLines que contradiz a linha announceada", () => {
    expect(parseAgentListingDelta({ ...base, announcedLines: { A: "outro texto" } })).toBeUndefined();
  });

  it("rejects announcedLines of the wrong shape", () => {
    expect(parseAgentListingDelta({ ...base, announcedLines: ["A"] })).toBeUndefined();
    expect(parseAgentListingDelta({ ...base, announcedLines: { A: 1 } })).toBeUndefined();
  });
});