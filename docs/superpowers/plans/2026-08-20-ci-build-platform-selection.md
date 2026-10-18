# CI Build Platform Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que a pipeline do GitLab escolha as plataformas de empacotamento automático por meio da lista opcional de tokens completos `ZCODE_BUILD_PLATFORMS`; sem o parâmetro, mantém-se o modo totalmente automático nas seis plataformas, e as plataformas não selecionadas permanecem como jobs manuais não bloqueantes.

**Architecture:** Definir em `.gitlab/ci/30-build.yml` seis templates ocultos de `rules` separados por plataforma, reutilizados por cada job via `!reference` do GitLab. As mesmas regras de plataforma são aplicadas ao build dos pacotes instaladores, ao macOS CUA Helper e às notificações do Feishu, evitando que plataformas sem empacotamento ainda construam o helper ou enviem notificações; apenas pipelines de MR, web e API suportam recorte, enquanto a cadeia de publicação por tag e `ci/*` mantém o automático em todas as plataformas.

**Tech Stack:** GitLab CI YAML, Vitest, testes de contrato de texto em TypeScript.

---

## Estrutura de arquivos

- Modificar `packages/desktop/test/gitlabCiBuildGraph.test.ts`: validar os tokens completos das seis plataformas, o automático por padrão, o contrato manual quando não houver match e a reutilização das regras correspondentes pelo helper macOS e pelas notificações de cada plataforma.
- Modificar `.gitlab/ci/30-build.yml`: definir os templates de regras de plataforma e fazer os seis jobs de build e os dois jobs de CUA Helper referenciá-los.
- Modificar `.gitlab/ci/40-notarize-notify.yml`: fazer os seis jobs de notificação reutilizarem as regras da plataforma correspondente, preservando a prioridade já existente que proíbe notificações em sandbox/test-tag; as notificações de plataformas não selecionadas mantêm uma entrada manual não bloqueante e, por `needs`, aguardam o build manual correspondente.

### Task 1: adicionar testes de contrato do grafo de CI que falham

- [x] Em `packages/desktop/test/gitlabCiBuildGraph.test.ts`, adicionar asserções auxiliares que lêem as referências de `rules` de cada job de plataforma.
- [x] Adicionar testes para os seis templates de regras de plataforma: afirmar `on_success` quando `ZCODE_BUILD_PLATFORMS` é null/string vazia, `on_success` quando a regex de token completo `(^|,)platform(,|$)` casa, e o fallback final para `manual` com `allow_failure: true`.
- [x] Adicionar testes de mapeamento de jobs: os seis jobs de build, os dois de CUA Helper e os seis de notificação devem referenciar a regra da plataforma correspondente.
- [x] Executar `pnpm exec vitest run packages/desktop/test/gitlabCiBuildGraph.test.ts`; a expectativa é que falhe, pois os templates de regras ainda não existem.

### Task 2: implementar o agendamento parametrizado por plataforma

- [x] Adicionar em `.gitlab/ci/30-build.yml` o template oculto `.rules:build-platform:<platform>`; cada template contém três trechos de regras — automático por padrão, automático por token completo e os demais manuais não bloqueantes — e registra em comentários em chinês a causa do problema e o motivo de agendar antes de escolher o runner.
- [x] Adicionar `rules: !reference [.rules:build-platform:<platform>, rules]` aos seis jobs de build dos pacotes instaladores.
- [x] Adicionar aos dois jobs de CUA Helper a referência de `rules` da plataforma macOS correspondente e remover do template comum do helper a regra antiga de automático incondicional.
- [x] Em `.gitlab/ci/40-notarize-notify.yml`, declarar as rules dos seis jobs de notificação: manter primeiro o `when: never` de sandbox/test-tag e depois reutilizar a regra de seleção da plataforma correspondente; quando não selecionada, torna-se um job manual não bloqueante e, pelo `needs` já existente, aguarda o build correspondente.
- [x] Executar o Vitest focado; a expectativa é que passe.

### Task 3: verificação e commit

- [x] Executar `node scripts/ci/ci-lint-pipeline.mjs`, validando o portão estático de CI do repositório.
- [x] Executar `pnpm typecheck`, registrando o resultado completo.
- [x] Executar `pnpm lint`, registrando o resultado completo.
- [x] Executar `git diff --check` e revisar se as alterações cobrem apenas spec, plano, testes e agendamento de CI.
- [ ] Fazer o commit com Conventional Commits: `chore(ci): support selectable build platforms`.