# SPRINT-03 — Desativação de sub-agente de plugin, ponta a ponta

## Objetivo
Fazer um sub-agente de plugin poder ser desativado pelo usuário, removendo o perfil qualificado **e** o alias de nome curto, no caminho real de runtime.

## Depende de
Nenhuma. Roda em paralelo com a SPRINT-02; nenhum arquivo em comum.

## Onda
2

## Arquivos previstos
- `packages/shared/src/subagent-runtime-config.ts` — alterar — `disabledAgentIds` no ramo `ready` do snapshot; `resolveSubagentRuntimeProfiles` repassa `state.disabledAgentIds` no retorno
- `apps/zcode-cli/packages/bootstrap/src/subagents.ts` — alterar — `LoadZCodeAgentProfilesResult.disabledAgentIds`; `LoadPluginAgentProfilesInput.disabledAgentIds`; descarte em `resolvePluginAgentProfiles`
- `apps/zcode-cli/packages/bootstrap/src/app/create-app.ts` — alterar — propaga o campo em `:247` e `:800`
- `packages/services/src/subagents/subagentRuntimeConfig.ts` — **verificar, sem edição** — o snapshot pega o campo por spread de `resolveSubagentRuntimeProfiles` (`packages/services/src/subagents/subagentRuntimeConfig.ts:110-116`)
- `apps/zcode-cli/packages/bootstrap/tests/helpers/subagents.ts` — alterar — helper aceita `disabledAgentIds`
- `apps/zcode-cli/packages/bootstrap/tests/plugin-agent-disable.test.ts` — criar — T-07, T-13
- `apps/zcode-cli/packages/bootstrap/tests/subagents.test.ts` — alterar — T-14

## Passos de implementação

1. **Estado como fonte, sem leitura nova.** `loadZCodeAgentProfiles` **já lê** `disabledAgentIds` em `subagents.ts:70` e hoje o descarta. Adicionar o campo a `LoadZCodeAgentProfilesResult` e populá-lo a partir de `agentState.disabledAgentIds` (`:78-84`). Nenhuma leitura adicional de disco.

2. **Snapshot.** Adicionar `disabledAgentIds: subagentRuntimeStateSchema.shape.disabledAgentIds` ao ramo `ready` de `subagentRuntimeConfigSchema` (`:23-31`), reusando a forma do schema de estado como o arquivo já faz para os outros dois campos. Fazer `resolveSubagentRuntimeProfiles` (`:37-51`) repassar `state.disabledAgentIds` no retorno — pass-through puro; o campo pode ser **obrigatório**, porque o snapshot é em memória e sempre nasce de um estado que já o exige.

3. **Filtro, no lugar certo.** Adicionar `disabledAgentIds?: Iterable<string>` a `LoadPluginAgentProfilesInput` (`:32-38`, interface interna). Em `resolvePluginAgentProfiles` (`:112-164`), montar `new Set(input.disabledAgentIds ?? [])` e, no laço, `continue` **antes** de `profiles.push(canonical)` quando `createPluginAgentStateId(parsed.plugin.id, parsed.bareName)` estiver no conjunto. Isso remove o qualificado e o alias (`:134-137`) de uma vez. O literal de retorno (`:158-163`) popula `disabledAgentIds: []`.

4. **Propagar nos dois pontos de chamada** de `create-app.ts`: `:247` (carga inicial — no caminho do Host, `zcodeSubagentProfiles` vem de `subagentProfilesFromSnapshot`) e `:800` (refresh — vem do mesmo snapshot). **`:263` não é um ponto de chamada**, é a concatenação das listas de perfis.

5. **Testes** T-07 (pelo caminho real) e T-13 (o snapshot carrega o campo), mais T-14 (não-regressão).

## Testes obrigatórios
- T-07 — `plugin:…:<bare>` remove **qualificado e alias** de `activeAgents`, subindo por Host snapshot → `resolvePluginAgentProfiles` → merge → `activeAgents`. Asserção explícita de que `resolveSubagentRuntimeProfiles` **não** é o caminho.
- T-13 — o ramo `ready` carrega e repassa `disabledAgentIds` por spread
- T-14 — nenhum perfil de usuário/projeto existente muda de comportamento

## Critérios de aceitação
- [ ] CA-11: chave `plugin:…:<bare>` remove qualificado e alias
- [ ] CA-12 (parcial): o runtime consulta a chave correta — a parte de UI é da SPRINT-04
- [ ] CA-19: perfis existentes inalterados

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
- **T-07 é o teste que pega o defeito.** Um teste que compare só as strings de chave passaria trivialmente mesmo com o defeito inteiro. O caminho real precisa ser exercitado.
- **O alias é o detalhe fácil de esquecer.** `resolvePluginAgentProfiles` emite `{...canonical, name: bareName}` (`:134-137`); sem removê-lo, o papel continua despachável pelo nome curto e ainda listado no catálogo.
- **Ressalva conhecida, aceita:** plugin semeado em escopo `workspace` cai no ramo `: true` de `attachEnabledState` e ficaria sempre habilitado. Fora do Release 1.
- Se `subagentRuntimeConfig.ts` exigir edição de fato, isso **quebra** a premissa de "sem edição" e deve ser reportado, não improvisado.