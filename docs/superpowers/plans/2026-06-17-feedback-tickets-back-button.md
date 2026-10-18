# Botão de voltar em Meus Feedbacks Implementation Plan

> **Para workers agênticos:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado)
> ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de
> checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** adicionar um botão de voltar no lado esquerdo do header da página “Meus Feedbacks”, que retorna à
página “Enviar feedback” ao ser clicado.

**Arquitetura:** o `FeedbackCenter` continua sendo a camada de controle de tabs do Dialog de feedback. Quando o
tab é `tickets`, renderiza-se um icon button de baixa ênfase antes do título no header, e o clique reutiliza
`setTab("submit")`; o i18n ganha um novo aria-label de retorno à página de envio.

**Stack:** React 19, Zustand, Vitest, lucide-react, primitives existentes `Button`/`DialogHeader`.

## Restrições Globais

- Preservar primeiro o spec e só então implementar o código; o spec já foi commitado em
  `docs/superpowers/specs/2026-06-17-feedback-tickets-back-button-design.md`.
- Ao modificar `packages/ui`, ler e respeitar o `DESIGN.md` da raiz; usar os Buttons e tokens semânticos
  existentes, sem criar um novo sistema de estilos visíveis.
- Caminhos de import usam `@/` ou caminho absoluto com nome de pacote.
- Não alterar a lógica de carregamento, refresh, cópia de ID, destaque de seleção, envio de feedback ou upload de
  feedback da lista de tickets.
- Não modificar o relay de controle remoto, o processo main, o stream de sessão/task, snapshot, queue nem a
  semântica de restauração replayable.
- Ao final, executar `pnpm typecheck` e `pnpm lint`.

---

### Task 1: Botão de voltar nos tickets do Feedback Center

**Arquivos:**
- Modify: `packages/ui/src/feedback/FeedbackCenter.tsx`
- Modify: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modify: `packages/ui/src/i18n/locales/en-US.ts`
- Modify: `packages/ui/test/feedbackCenter.test.ts`

**Interfaces:**
- Consumes: `useFeedbackStore((state) => state.setTab)` e o `tab` atual.
- Produces: botão de voltar no header de tickets com aria-label `feedback.center.backToSubmit`.

- [x] **Step 1: Escrever o teste que falha**

Atualizar `packages/ui/test/feedbackCenter.test.ts`:

```ts
expect(source).toContain("ArrowLeftIcon");
expect(source).toContain('tab === "tickets"');
expect(source).toContain('data-feedback-back-to-submit="true"');
expect(source).toContain('feedback.center.backToSubmit');
expect(source).toContain('setTab("submit")');
```

Adicionar asserções de copy localizado para `feedback.center.backToSubmit` nos dois arquivos de locale.

- [x] **Step 2: Executar o teste e verificar que ele falha**

Run: `pnpm exec vitest run packages/ui/test/feedbackCenter.test.ts`

Expected: FAIL porque o header de tickets não renderiza um botão de voltar nem o aria-label.

- [x] **Step 3: Implementar a UI e o i18n mínimos**

Atualizar `packages/ui/src/feedback/FeedbackCenter.tsx`:

```ts
import { ArrowLeftIcon, XIcon } from "lucide-react";
```

Substituir a seção de título no `DialogHeader` por um grupo de título à esquerda:

```tsx
<DialogHeader className="flex-row items-center justify-between gap-2 p-6 pb-0">
  <div className="flex min-w-0 items-center gap-2">
    {tab === "tickets" ? (
      <Button
        type="button"
        variant="ghost"
        size="icon-md"
        className="shrink-0 rounded-lg text-foreground-subtle hover:text-foreground"
        aria-label={intl.formatMessage({ id: "feedback.center.backToSubmit" })}
        data-feedback-back-to-submit="true"
        onClick={() => setTab("submit")}
      >
        <ArrowLeftIcon className="size-4" />
      </Button>
    ) : null}
    <DialogTitle className="min-w-0 truncate text-base font-medium text-foreground">
      {intl.formatMessage({ id: titleId })}
    </DialogTitle>
  </div>
  <Button ... />
</DialogHeader>
```

Adicionar as entradas de locale próximos às chaves de título do feedback center:

```ts
"feedback.center.backToSubmit": "返回提交反馈",
```

```ts
"feedback.center.backToSubmit": "Back to submit feedback",
```

- [x] **Step 4: Executar o teste direcionado e verificar que ele passa**

Run: `pnpm exec vitest run packages/ui/test/feedbackCenter.test.ts`

Expected: PASS.

---

### Task 2: Verificação Completa e Commit

**Arquivos:**
- Verify all files changed by Task 1 and this plan.

**Interfaces:**
- Consumes: implementação da Task 1.
- Produces: implementação da funcionalidade commitada.

- [x] **Step 1: Executar o typecheck obrigatório**

Run: `pnpm typecheck`

Expected: PASS.

- [x] **Step 2: Executar o lint obrigatório**

Run: `pnpm lint`

Expected: exit 0. Warnings existentes e não relacionados podem permanecer.

- [x] **Step 3: Inspecionar o git diff**

Run:

```bash
git diff --stat
git diff -- docs/superpowers/plans/2026-06-17-feedback-tickets-back-button.md packages/ui/src/feedback/FeedbackCenter.tsx packages/ui/src/i18n/locales/zh-CN.ts packages/ui/src/i18n/locales/en-US.ts packages/ui/test/feedbackCenter.test.ts
```

Expected: apenas o plano, o header do feedback center, as strings de locale e os testes direcionados foram
alterados.

- [x] **Step 4: Commitar**

```bash
git add docs/superpowers/plans/2026-06-17-feedback-tickets-back-button.md packages/ui/src/feedback/FeedbackCenter.tsx packages/ui/src/i18n/locales/zh-CN.ts packages/ui/src/i18n/locales/en-US.ts packages/ui/test/feedbackCenter.test.ts
git commit -m "feat: add feedback tickets back button"
```