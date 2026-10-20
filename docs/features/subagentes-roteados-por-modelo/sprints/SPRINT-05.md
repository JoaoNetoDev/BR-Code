# SPRINT-05 — E2E: despacho de sub-agente de catálogo

## Objetivo
Provar de ponta a ponta que um sub-agente do catálogo é despachado pelo agente principal e roda com o modelo resolvido.

## Depende de
SPRINT-01, SPRINT-02 e SPRINT-03.

> **Justificativa da dependência de SPRINT-02:** T-11 afirma que o sub-agente do catálogo é despachado **e** que ele aparece na listagem injetada com o conteúdo novo. A segunda metade depende das mudanças de linha e delta da SPRINT-02; sem elas, o caso passaria mesmo com a listagem vazia.

## Onda
3 — roda em paralelo com a SPRINT-04; nenhum arquivo em comum.

## Arquivos previstos
- `packages/desktop/test/e2e/conversation-session/conversation-session-subagent-catalog.test.ts` — criar — T-11
- `docs/conversation-session-case-catalog.md` — alterar — registrar o código do caso novo
- `docs/testing/conversation-session-e2e-coverage-matrix.md` — alterar — registrar o caso na matriz

## Passos de implementação

1. **Replicar a montagem de um caso existente.** Começar por `conversation-session-subagent-prompt-assembly.test.ts`, que já dispara `subagent_type`, em vez de construir o fixture do zero.
2. **T-11, parte 1 — despacho.** Despachar `Agent` com `subagent_type` de um papel do catálogo e afirmar que o filho foi criado.
3. **T-11, parte 2 — modelo efetivo.** Afirmar que o modelo efetivo é o resolvido, lido do evento `SubagentSpawned` (`apps/zcode-cli/packages/core/src/subagent/runner.ts:240-256`; o campo `model` é montado em `:252` como `` `${providerId}/${modelId}` ``). Como o catálogo não fixa modelo (RF-03), o esperado é o modelo herdado do pai. **Esta asserção cobre CA-21** — a permanência do eco do modelo efetivo (RNF-03), que é o que o Release 1 entrega dessa requirements.
4. **T-11, parte 3 — listagem.** Afirmar que a linha do papel aparece no catálogo injetado com quando usar e custo relativo.
5. **Registrar o caso** no catálogo e na matriz de cobertura, e rodar `pnpm audit:conversation-session-coverage` — a auditoria do repo recusa casos E2E não registrados.

## Testes obrigatórios
- T-11 — E2E: `Agent` com `subagent_type` de catálogo despacha; o modelo efetivo é o resolvido; a linha aparece no catálogo injetado

## Critérios de aceitação
- [ ] CA-01: o catálogo semeia e os 4 perfis chegam a `activeAgents` sem configuração do usuário
- [ ] CA-21: o modelo efetivo continua ecoado no evento `SubagentSpawned`

## Comandos de verificação
```bash
pnpm typecheck
pnpm --filter zcode-cli typecheck
pnpm lint
pnpm test:e2e
pnpm audit:conversation-session-coverage
```

## Notas de risco
- **Esta sprint é a validação de integração entre as ondas.** A, C e D2 foram entregues isoladamente; nada até aqui provou que o catálogo semeia e despacha de verdade.
- **CA-11 não é desta sprint.** É o filtro de desativação, coberto por T-07 na SPRINT-03. Afirmá-lo aqui mediria o sujeito errado.
- **A medição de latência foi separada** para a SPRINT-06, porque comparar com uma baseline exige capturá-la **antes** da mudança — impossível nesta ordem de execução.