# SPRINT-04 — UI: toggle em sub-agente de plugin e origem do modelo

## Objetivo
Habilitar o toggle de sub-agente de plugin na tela de Settings e mostrar a origem do modelo de cada sub-agente.

## Depende de
SPRINT-03 (o toggle grava a chave que o runtime passa a consultar; sem ela a UI mentiria).

## Onda
3 — roda em paralelo com a SPRINT-05; nenhum arquivo em comum.

## Arquivos previstos
- `packages/ui/src/settings/SubagentsSection.tsx` — alterar — `supportsEnabledToggle` aceita linhas de plugin; `handleToggle` grava a chave correta; rótulos de origem do modelo
- `packages/ui/src/i18n/locales/en-US.ts` — alterar — chaves dos rótulos
- `packages/ui/src/i18n/locales/zh-CN.ts` — alterar — chaves dos rótulos
- `packages/ui/test/subagentsSectionCatalog.test.ts` — criar — T-08
- `packages/ui/test/subagentsSectionI18n.test.ts` — criar — T-16

## Passos de implementação

1. **Separar toggle de edição.** Hoje `supportsEnabledToggle` (`:144-146`) é `isEditableUserAgent(agent) && agent.scope === "user"`, e `isEditableUserAgent` (`:132-138`) exige `source === "user"` **e** `readOnly !== true`. Linhas de plugin chegam com `source: "plugin"` e `readOnly: true` (`subagentsService.ts:340-351`), então nenhum dos dois portões abre.
   - Habilitar o toggle quando `source === "plugin"`.
   - **Manter** `isEditableUserAgent` governando **edição de conteúdo**: linhas de plugin continuam `readOnly`, porque o markdown do plugin é sobrescrito no upgrade. Toggle e edição são coisas distintas e devem ser desbloqueados separadamente.

2. **Chave do toggle.** Em `handleToggle` (a chamada a `setEnabled` está em `:1496`), gravar a chave que o runtime consulta: para linhas de plugin, `agent.id`, que já é `plugin:<pluginId>:<bare>`; para as demais, inalterado.

3. **Rótulo de origem (RF-10).** Dois estados: `modelSelectionOverride` presente → "sobrescrito manualmente"; senão → "herdado do pai". Chaves em `en-US.ts` e `zh-CN.ts` — **este repositório não tem locale `pt-BR`**, e uma chave para ele ficaria inerte.

4. **Testes** T-08 e T-16.

## Testes obrigatórios
- T-08 — toggle visível em linha de plugin; dois rótulos de origem distintos e estáveis após reload
- T-16 — chaves novas presentes em `en-US.ts` e `zh-CN.ts`; nenhuma referencia locale inexistente

## Critérios de aceitação
- [ ] CA-12: toggle visível, grava a chave que o runtime consulta, efeito sobrevive ao reload
- [ ] CA-13: dois rótulos distintos e estáveis
- [ ] CA-18: texto novo nos locales existentes

## Comandos de verificação
```bash
pnpm typecheck
pnpm lint
pnpm test:unit:affected
```

## Notas de risco
- `pnpm --filter zcode-cli typecheck` **não** se aplica: esta sprint não toca `apps/zcode-cli`. Mas o gate da raiz **também não cobre** `apps/zcode-cli` — quem valida a integração é a SPRINT-05.
- **Ressalva de escopo:** `attachEnabledState` deriva `enabled` como `agent.scope === "user" ? !disabledSet.has(agent.id) : true` (`:298`). Um plugin semeado em escopo `workspace` cai no ramo `: true`. O catálogo do Release 1 é semeado no escopo de usuário, então isso não afeta esta entrega — está registrado como limite conhecido (TECH §D2).
- **Rótulo "definido no catálogo" não entra.** RF-03 proíbe o catálogo de fixar modelo, então esse rótulo nunca apareceria. Fica para o Release 2.