# SPRINT-01 — Pacote do catálogo e registro nos cinco repositórios

## Objetivo
Entregar os quatro papéis de sub-agente empacotados como plugin oficial do fork, registrados nos cinco pontos de distribuição, sem configuração do usuário.

## Depende de
Nenhuma.

## Onda
1

## Arquivos previstos
- `apps/zcode-cli/packages/agent-catalog-plugin/package.json` — criar — manifesto npm mínimo, `@zcode/agent-catalog-plugin@0.1.0`
- `apps/zcode-cli/packages/agent-catalog-plugin/.zcode-plugin/plugin.json` — criar — manifest do plugin; é o portão de existência da raiz
- `apps/zcode-cli/packages/agent-catalog-plugin/agents/code-reviewer.md` — criar — papel + prompt de sistema
- `apps/zcode-cli/packages/agent-catalog-plugin/agents/repo-researcher.md` — criar — papel + prompt de sistema
- `apps/zcode-cli/packages/agent-catalog-plugin/agents/test-triager.md` — criar — papel + prompt de sistema
- `apps/zcode-cli/packages/agent-catalog-plugin/agents/long-form-summarizer.md` — criar — papel + prompt de sistema
- `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts` — alterar — entrada R1, `defaultEnabled: true`, `author` do fork, sem ícone de CDN
- `apps/zcode-cli/packages/cli/scripts/sea-official-plugin-assets.mjs` — alterar — entrada R2
- `packages/desktop/scripts/prepare-agent-node-bundle.mjs` — alterar — entrada R3
- `scripts/prepare-prebuilds.mjs` — alterar — entrada R4
- `packages/server/src/remote/zcodeAgentOfficialPluginAssets.ts` — alterar — entrada R5 (nome de diretório)
- `apps/zcode-cli/packages/bootstrap/tests/plugins.test.ts` — alterar — T-09, T-10

## Passos de implementação

1. Criar o pacote com `package.json` e `.zcode-plugin/plugin.json` na forma de `pdf-plugin`. Versão `0.1.0` nos dois, obrigatoriamente igual.
2. Escrever os quatro `agents/*.md`. Para cada um:
   - `description` no estilo de `Explore` (`core/src/subagent/profile.ts:27-29`): papel, condição de disparo, **cláusula de anti-disparo**, exemplo de invocação.
   - `permissionMode: default` com `disallowedTools` de escrita. **Nunca** `bypassPermissions`. **Nunca** `plan` com `Bash` — `checkPlanMode` (`core/src/permission/service.ts:447-489`) nega porque `Bash` está em `isWriteTool` (`:618-620`) e `isDestructiveTool` (`:622-624`).
   - `tools` explícito, nunca `["*"]`.
   - **Sem** `model:` e **sem** `thoughtLevel:`.
3. Adicionar a entrada R1 em `OFFICIAL_PLUGIN_DEFINITIONS`, fora do `.map()` de `:198-227` (o shape de tupla exige `skillDir` e ícone de documento). `requiredSeedPaths` com os quatro caminhos.
4. Adicionar as entradas R2, R3, R4 e R5 conforme a SPEC §2.1.2 (criada nesta revisão) e a tabela de arquivos da SPEC §5, itens 8–11.
5. Escrever T-09 (presença em R1–R5, sem `ZAI_AUTHOR` nem CDN da Z.ai) e T-10 (versão alinhada, `requiredSeedPaths` existentes) em `plugins.test.ts`.

## Testes obrigatórios
- T-09 — `agent-catalog` presente em R1–R5 com nomes e caminhos corretos; sem `ZAI_AUTHOR` nem ícone de CDN da Z.ai
- T-10 — versão igual em `package.json`, `plugin.json`, R1 e R2; todo `requiredSeedPaths` existe

## Critérios de aceitação
- [ ] CA-04: presente em R1–R5; versão alinhada; todo `requiredSeedPaths` existe
- [ ] CA-05: listagem sem `ZAI_AUTHOR` e sem ícone de CDN da Z.ai

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
- **CA-01 não é desta sprint.** O catálogo semeia e aparece em `activeAgents` — isso é verificado na SPRINT-05 (E2E), porque depende do roteamento da SPRINT-02. Aqui a verificação é estrutural (T-09/T-10), não de execução.
- **Não** adicionar teste de igualdade de conjunto entre R1–R5: os conjuntos já divergem hoje (`computer-use` ausente de R2) e o teste ficaria vermelho por um defeito pré-existente, fora de escopo (TECH §12.2).