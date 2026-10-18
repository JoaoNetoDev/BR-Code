# Plano de Implementação — Ocultar o Banner de Modelo de Runtime Indisponível

> **Para agentes executores:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Ocultar o banner de erro de chat para `ZCODE_RUNTIME_MODEL_UNAVAILABLE`, preservando o estado do guard interno e o diagnóstico.

**Arquitetura:** Manter inalterados o comportamento do serviço e do restore. Adicionar um guard na camada de apresentação em `ChatErrorBanner` para que esse error code específico não renderize banner, enquanto os demais continuam pelo caminho existente do banner de erro localizado.

**Stack técnico:** React, TypeScript, Vitest, testes de renderização React no servidor.

---

### Tarefa 1: Visibilidade do Banner de Erro de Chat

**Arquivos:**
- Modificar: `packages/ui/test/chatErrorBanner.test.ts`
- Modificar: `packages/ui/src/ChatErrorBanner.tsx`

- [ ] **Passo 1: Escrever o teste que deve falhar**

Adicionar um teste que renderiza `ChatErrorBanner` com:

```ts
{
  code: "ZCODE_RUNTIME_MODEL_UNAVAILABLE",
  message: "历史任务使用的模型已不可用，请从当前模型列表中选择一个可用模型后继续。",
}
```

Afirmar que o HTML renderizado não contém a mensagem de modelo histórico.

- [ ] **Passo 2: Executar o teste direcionado e verificar que ele falha**

Executar:

```bash
pnpm test -- packages/ui/test/chatErrorBanner.test.ts
```

Esperado antes da implementação: a nova asserção falha porque `ChatErrorBanner` ainda renderiza a mensagem localizada de modelo indisponível.

- [ ] **Passo 3: Implementar o guard mínimo na camada de apresentação**

Em `packages/ui/src/ChatErrorBanner.tsx`, retornar `null` quando `error.code === "ZCODE_RUNTIME_MODEL_UNAVAILABLE"`. Deixar inalterados o comportamento de localização, feedback, copy e detalhes para todos os outros erros.

- [ ] **Passo 4: Executar os testes direcionados e verificar que passam**

Executar:

```bash
pnpm test -- packages/ui/test/chatErrorBanner.test.ts
```

Esperado após a implementação: o novo teste de visibilidade de modelo indisponível passa e os testes existentes do banner de erro de chat continuam passando.

- [ ] **Passo 5: Executar as verificações obrigatórias do projeto**

Executar:

```bash
pnpm typecheck
pnpm lint
```

Esperado: ambos os comandos passam.

- [ ] **Passo 6: Commit**

Adicionar ao stage o spec, o plano, os testes e a implementação e então commitar com Conventional Commits:

```bash
git add docs/superpowers/specs/2026-06-10-hide-runtime-model-unavailable-banner-design.md docs/superpowers/plans/2026-06-10-hide-runtime-model-unavailable-banner.md packages/ui/test/chatErrorBanner.test.ts packages/ui/src/ChatErrorBanner.tsx
git commit -m "fix(ui): hide unavailable historical model banner"
```