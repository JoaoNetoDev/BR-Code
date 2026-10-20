# SPRINT-02 — Roteamento: linha com custo relativo e delta por conteúdo

## Objetivo
Fazer o agente principal enxergar quando usar cada sub-agente e reemitir a linha quando ela muda, sem re-anunciar o catálogo a cada turno.

## Depende de
SPRINT-01 (T-01 e T-02 leem os `agents/*.md` que ela cria).

## Onda
2 — roda em paralelo com a SPRINT-03; nenhum arquivo em comum.

## Arquivos previstos
- `apps/zcode-cli/packages/core/src/agent/agent-listing-metadata.ts` — alterar — campo `announcedLines?` + invariantes no parser estrito
- `apps/zcode-cli/packages/core/src/subagent/listing.ts` — alterar — `Set`→`Map`, derivação retrocompatível, filtro por conteúdo, atualização do mapa e emissão de `announcedLines`
- `apps/zcode-cli/packages/core/src/subagent/profile.ts` — alterar — sufixo de custo relativo; `modelId` só com override; nunca `providerId`
- `apps/zcode-cli/packages/core/tests/agent-listing.test.ts` — alterar — T-03, T-04, T-05, T-15
- `apps/zcode-cli/packages/core/tests/agent-listing-runtime.test.ts` — alterar — T-05 (retomada a frio)
- `apps/zcode-cli/packages/core/tests/subagent-profile.test.ts` — alterar — T-02
- `apps/zcode-cli/packages/core/tests/subagent-catalog-integration.test.ts` — criar — T-01
- `apps/zcode-cli/packages/adapters/tests/agent-listing-wire.test.ts` — alterar — T-06

## Passos de implementação

1. **`agent-listing-metadata.ts`.** Adicionar `announcedLines?: Record<string, string>` ao `AgentListingDelta`. No parser, validar quando presente (objeto, não-array, não nulo, chaves e valores string) e a invariante **verificável no delta isolado**: para todo `i`, `announcedLines[addedTypes[i]] === addedLines[i]`. Copiar no retorno.

2. **`profile.ts`.** Em `formatAgentProfileForPrompt` (`:102-113`), acrescentar o sufixo de custo relativo conforme a tabela de 5 casos da SPEC §2.3.3. Regras que não podem ser esquecidas:
   - `tools: ["*"]` (só `general-purpose`) → **sem** contagem; `filterSubagentChildToolNames` (`tool-policy.ts:21-31`) não expande `*`.
   - `isBuiltInExploreAgentProfile` → a contagem usa a lista **já resolvida** por `formatExploreAllowedToolsForAgentDescription`, nunca `profile.tools`.
   - `tools` ausente → sem segmento `Tools:`, sem contagem.
   - **`providerId` nunca é impresso.** Só `modelId`, e só quando há override.

3. **`listing.ts`.** `announced` vira `Map<string, string>`:
   - reconstrução (`:21-30`): usar `delta.announcedLines` quando presente; senão derivar dos pares `addedTypes[i]/addedLines[i]`; ao final, `announced.delete` para cada `removedTypes`.
   - filtro (`:33`): `announced.get(name) !== formatAgentProfileForPrompt(profile, input)`.
   - `removedTypes` (`:34-37`): manter `current`, só iterar `announced.keys()`. **A troca `Set`→`Map` é no-op aqui** — não gastar refactor.
   - emissão (`:41-47`): **primeiro** `for (const p of added) announced.set(p.name, formatAgentProfileForPrompt(p, input))`, **depois** `announcedLines: Object.fromEntries(announced)`. O passo de atualização é obrigatório: sem ele o perfil alterado volta a `added` em todo turno seguinte e o catálogo é re-anunciado indefinidamente.
   - `isInitial` (`:45`) sobre o mesmo mapa.

4. **Testes.** T-03 a T-06, T-15, T-01, T-02.

## Testes obrigatórios
- T-01, T-02 — catálogo parseia e cumpre as regras de frontmatter (caminho relativo à raiz do repo; falha explícita se o diretório não existir)
- T-03 — conteúdo da linha, incluindo os casos `tools:["*"]`, `tools` ausente e Explore
- T-04 — mudança de modelo reemite a linha no turno seguinte
- T-05 — nada alterado ⇒ nenhum attachment; retomada anuncia no máximo uma vez e converge
- T-06 — sem vazamento no payload; razão ≤ 3%
- T-15 — nenhum acesso a arquivo por chamada; delta sob o orçamento

## Critérios de aceitação
- [ ] CA-06: linha contém quando usar, quando não usar, ferramentas e custo relativo
- [ ] CA-07: linha nunca contém `providerId`
- [ ] CA-08: as três tarefas de RF-07 têm linha no delta inicial
- [ ] CA-09: sem alteração entre turnos, nenhum attachment
- [ ] CA-10: mudança de modelo reemite a linha
- [ ] CA-14: delta antigo parseia; retomada anuncia no máximo uma vez e converge
- [ ] CA-15: `announcedLines` não vaza ao provedor
- [ ] CA-16: 0 I/O por chamada; delta < 2 ms p95
- [ ] CA-17: razão ≤ 3%
- [ ] CA-22: T-01/T-02 acham os assets por caminho relativo à raiz

## Comandos de verificação
```bash
pnpm typecheck
pnpm --filter zcode-cli typecheck
pnpm lint
pnpm --filter zcode-cli test
pnpm test:unit:affected
```

> **`pnpm test:unit:affected` não cobre `apps/zcode-cli`.** O script restringe o escopo a `packages/*/test/` (`scripts/run-affected-unit-tests.mjs:215-228`), e o `vitest.config.ts` da raiz só inclui `packages/*/test`. Os testes desta sprint vivem em `apps/zcode-cli/packages/*/tests` — sem `pnpm --filter zcode-cli test`, o bloco passaria **verde sem executar nada**.

## Notas de risco
- **Ordem do passo 3 importa.** Implementar a emissão antes da atualização do mapa reintroduz o laço de re-anúncio, que nenhum teste de "nada alterado" que começa em estado limpo pegaria.
- **CA-09 (RF-08) é o teste que mais fecha regressões.** Rodar mesmo que "obviamente" passe depois do passo 3.
- Testes existentes quebram com a mudança de formato e precisam ser atualizados: deep-equal em `agent-listing.test.ts:38-47`, constante `EXPECTED_LISTING` no teste de fio, e os `toContain("Tools: ...")` em `subagent-profile.test.ts`.
- `formatAgentProfilesForPrompt` (plural, sem consumidor de produção) **não** é alterado.