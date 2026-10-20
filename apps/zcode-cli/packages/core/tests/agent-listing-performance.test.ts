import { describe, expect, it } from "vitest";
import { collectAgentListingAttachment } from "../src/subagent/listing.js";
import type { AgentProfile } from "../src/subagent/profile.js";

/**
 * Custo do caminho quente (RNF-02, CA-16).
 *
 * M4 (tempo de spawn ponta a ponta) exige o build do desktop e não é medido
 * aqui; o que este arquivo mede é a parcela que esta feature de fato introduz:
 * a coleta do catálogo injetado no pai, que roda uma vez por turno. O orçamento
 * de < 2 ms p95 vem do PRD.
 */
const CATALOG_SIZE = 10;

function profile(index: number): AgentProfile {
  return {
    name: `agent-catalog:role-${index}`,
    description: `Role ${index}. Use it when X. It does NOT do Y.`,
    source: "user",
    systemPrompt: "…",
    tools: ["Read", "Grep", "Glob", "Bash"],
  };
}

const activeAgents = Array.from({ length: CATALOG_SIZE }, (_, index) => profile(index));

function collect(history: unknown[] = []) {
  return collectAgentListingAttachment({
    definitions: { activeAgents },
    entries: history as never,
    tools: [{ name: "Agent" }],
  });
}

function p95(samples: number[]): number {
  const sorted = [...samples].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]!;
}

describe("custo da coleta do catálogo (RNF-02, CA-16)", () => {
  it("não faz I/O por chamada", () => {
    const readFileSyncCalls: string[] = [];
    const original = process.binding;
    // Espiona o módulo de fs para provar que o caminho quente não lê nada:
    // o perfil já vem no snapshot do turno, então ler aqui seria um defeito.
    const fs = require("node:fs") as typeof import("node:fs");
    const realRead = fs.readFileSync;
    (fs as { readFileSync: unknown }).readFileSync = (...args: unknown[]) => {
      readFileSyncCalls.push(String(args[0]));
      return (realRead as unknown as (...a: unknown[]) => unknown)(...args);
    };
    try {
      collect();
    } finally {
      (fs as { readFileSync: unknown }).readFileSync = realRead;
      process.binding = original;
    }

    expect(readFileSyncCalls).toEqual([]);
  });

  it("gasta menos de 2 ms p95 no caminho de estado estável", () => {
    // O orçamento é do caminho quente: a partir do segundo turno só há um delta
    // por perfil alterado, então é esse caminho que paga a cada request. Medir o
    // delta inicial aqui daria um número dominado por warm-up de JIT e por
    // qualquer ruído da máquina, não pelo custo real.
    const initial = collect()!;
    const samples: number[] = [];
    for (let run = 0; run < 200; run += 1) {
      const started = performance.now();
      collect([initial]);
      samples.push(performance.now() - started);
    }

    expect(p95(samples.slice(20))).toBeLessThan(2);
  });

  it("não emite nada quando nada mudou, então o caminho estável não renderiza linha nenhuma", () => {
    // A garantia funcional vive em agent-listing-delta.test.ts; aqui basta não
    // reintroduzir trabalho desnecessário por turno.
    const initial = collect()!;
    expect(collect([initial])).toBeUndefined();
  });
});