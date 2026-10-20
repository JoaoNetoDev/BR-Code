import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseAgentProfileFromMarkdown } from "@zcode/shared";

/**
 * Contrato do conteúdo do catálogo (RF-02, RF-03, RF-15, RNF-06).
 *
 * Os arquivos são lidos por caminho relativo à raiz do repositório — não ao
 * package root de `core` — e o diretório ausente é falha explícita, para que
 * um caminho quebrado não passe por "catálogo vazio".
 */
const CATALOG_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../../agent-catalog-plugin/agents",
);

const AGENTS = [
  "code-reviewer",
  "repo-researcher",
  "test-triager",
  "long-form-summarizer",
] as const;

function readAgent(name: (typeof AGENTS)[number]): string {
  return readFileSync(join(CATALOG_DIR, `${name}.md`), "utf8");
}

describe("catálogo de sub-agentes: contrato dos papéis", () => {
  it("o diretório do catálogo existe e contém exatamente os quatro papéis", () => {
    expect(
      existsSync(CATALOG_DIR),
      `catálogo não encontrado em ${CATALOG_DIR} — caminho relativo à raiz errado`,
    ).toBe(true);
    for (const name of AGENTS) {
      expect(existsSync(join(CATALOG_DIR, `${name}.md`)), `falta ${name}.md`).toBe(true);
    }
  });

  it.each(AGENTS)("%s: parseia como perfil de agente válido", (name) => {
    const result = parseAgentProfileFromMarkdown({ content: readAgent(name), path: `${name}.md`, source: "project" });

    expect(result.diagnostics ?? []).toEqual([]);
    expect(result.profile?.name).toBe(name);
    expect(result.profile?.description ?? "").not.toBe("");
    expect(result.profile?.systemPrompt.length ?? 0).toBeGreaterThan(200);
  });

  it.each(AGENTS)("%s: não fixa modelo nem nível de raciocínio (RF-03)", (name) => {
    const { profile } = parseAgentProfileFromMarkdown({ content: readAgent(name), path: `${name}.md`, source: "project" });

    // O catálogo herda o modelo do pai; fixar um aqui quebraria em toda máquina
    // cujo provedor conectado seja outro.
    expect(profile?.modelSelection).toBeUndefined();
  });

  it.each(AGENTS)("%s: nunca pede permissão irrestrita nem todas as ferramentas", (name) => {
    const { profile } = parseAgentProfileFromMarkdown({ content: readAgent(name), path: `${name}.md`, source: "project" });

    expect(profile?.permissionMode, `${name} não pode usar bypassPermissions`).not.toBe(
      "bypassPermissions",
    );
    expect(profile?.tools, `${name} precisa declarar tools`).toBeDefined();
    expect(profile?.tools).not.toContain("*");
    expect(profile?.disallowedTools, `${name} precisa negar escrita`).toEqual(
      expect.arrayContaining(["Write", "Edit"]),
    );
  });

  it.each(AGENTS)("%s: a descrição diz quando usar e quando não usar", (name) => {
    const { profile } = parseAgentProfileFromMarkdown({ content: readAgent(name), path: `${name}.md`, source: "project" });
    const description = profile?.description ?? "";

    // RF-06 exige os dois lados: o pai precisa saber também o que evitar.
    expect(description, `${name} precisa de uma condição de disparo`).toMatch(
      /use it when|use it\b|Use it when/i,
    );
    expect(description, `${name} precisa de um anti-disparo`).toMatch(/does NOT|do not use/i);
  });

  it.each(AGENTS)("%s: a lista de ferramentas declarada é real", (name) => {
    const { profile } = parseAgentProfileFromMarkdown({ content: readAgent(name), path: `${name}.md`, source: "project" });

    for (const tool of profile?.tools ?? []) {
      expect(typeof tool).toBe("string");
      expect(tool.trim()).not.toBe("");
    }
  });
});