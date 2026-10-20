import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OFFICIAL_PLUGIN_DEFINITIONS } from "../src/app/official-plugin-definitions.js";

/**
 * Catálogo de sub-agentes: o plugin precisa estar registrado nos CINCO pontos
 * de distribuição. Um registro faltando não quebra o build — falha em runtime,
 * só em um dos canais (SEA, desktop, remoto). Por isso a verificação é explícita
 * aqui, em vez de herdada de qualquer um dos registros.
 *
 * R3/R4 são listas locais não exportadas em scripts de build, e R5 vive em outro
 * pacote; por isso os três são lidos como fonte. R1 e R2 são importados.
 */
const CATALOG = "agent-catalog";
const CATALOG_PACKAGE = "@zcode/agent-catalog-plugin";
const CATALOG_DIR = "agent-catalog-plugin";
const CATALOG_AGENTS = [
  "code-reviewer",
  "repo-researcher",
  "test-triager",
  "long-form-summarizer",
] as const;

const repoRoot = fileURLToPath(new URL("../../../../../", import.meta.url));

function definition() {
  const found = OFFICIAL_PLUGIN_DEFINITIONS.find((plugin) => plugin.name === CATALOG);
  expect(found, `R1 precisa declarar o plugin "${CATALOG}"`).toBeDefined();
  return found!;
}

describe("agent-catalog: registro nos cinco repositórios de distribuição", () => {
  it("R1 declara o catálogo com os quatro papéis como seed obrigatória", () => {
    const plugin = definition();

    expect(plugin.defaultEnabled).toBe(true);
    expect(plugin.requiredSeedPaths).toEqual(CATALOG_AGENTS.map((name) => `agents/${name}.md`));
    expect(plugin.rootCandidates[0]).toBe(`packages/${CATALOG_DIR}`);
  });

  it("R2 (SEA) embute o mesmo pacote com a mesma versão", async () => {
    const { officialSeaPlugins } = (await import(
      join(repoRoot, "apps/zcode-cli/packages/cli/scripts/sea-official-plugin-assets.mjs")
    )) as { officialSeaPlugins: Array<Record<string, unknown>> };

    const entry = officialSeaPlugins.find((plugin) => plugin.name === CATALOG);
    expect(entry, "R2 precisa embeter o catálogo no SEA").toBeDefined();
    expect(entry!.packageName).toBe(CATALOG_PACKAGE);
    expect(entry!.requiresRuntime).toBe(false);
    expect(entry!.version).toBe(definition().version);
  });

  it("R3 e R4 empacotam o mesmo caminho relativo", () => {
    const desktopBundle = readFileSync(
      join(repoRoot, "packages/desktop/scripts/prepare-agent-node-bundle.mjs"),
      "utf8",
    );
    const prebuilds = readFileSync(join(repoRoot, "scripts/prepare-prebuilds.mjs"), "utf8");

    for (const [label, source] of [
      ["R3", desktopBundle],
      ["R4", prebuilds],
    ] as const) {
      expect(source, `${label} precisa empacotar ${CATALOG_PACKAGE}`).toContain(CATALOG_PACKAGE);
      expect(source).toContain(`packages/${CATALOG_DIR}`);
    }
  });

  it("R5 declara o nome de diretório e os quatro papéis como caminhos exigidos", () => {
    const remote = readFileSync(
      join(repoRoot, "packages/server/src/remote/zcodeAgentOfficialPluginAssets.ts"),
      "utf8",
    );

    expect(remote).toContain(`"${CATALOG_DIR}"`);
    for (const name of CATALOG_AGENTS) {
      expect(remote, `R5 precisa exigir agents/${name}.md`).toContain(
        `${CATALOG_DIR}/agents/${name}.md`,
      );
    }
  });

  it("não reintroduz tratamento preferencial de provedor na listagem (RF-15, RF-16)", () => {
    const listing = definition().listing;

    expect(listing?.author?.name).toBe("BR-Code");
    expect(listing?.author?.name).not.toBe("Z.ai");
    expect(listing?.icon).toBeUndefined();
    expect(listing?.author?.url).toBeUndefined();
  });

  it("o pacote existe com manifest, versão alinhada e os quatro papéis", () => {
    const packageRoot = join(repoRoot, "apps/zcode-cli/packages", basename(definition().rootCandidates[0] ?? ""));
    const packageJson = JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")) as {
      name: string;
      version: string;
    };
    const manifest = JSON.parse(
      readFileSync(join(packageRoot, ".zcode-plugin", "plugin.json"), "utf8"),
    ) as { name: string; version: string; agents: string };

    expect(packageJson.name).toBe(CATALOG_PACKAGE);
    expect({
      definition: definition().version,
      manifest: manifest.version,
      package: packageJson.version,
    }).toEqual({
      definition: definition().version,
      manifest: definition().version,
      package: definition().version,
    });
    expect(manifest.name).toBe(CATALOG);
    expect(manifest.agents).toBe("agents");

    for (const name of CATALOG_AGENTS) {
      expect(existsSync(join(packageRoot, "agents", `${name}.md`))).toBe(true);
    }
  });
});