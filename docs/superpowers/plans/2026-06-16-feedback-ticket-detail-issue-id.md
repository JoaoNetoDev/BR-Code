# Plano de Implementação do Issue ID no Detalhe do Ticket de Feedback

> **Para agentes:** SUB-SKILL OBRIGATÓRIA: use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans para implementar este plano tarefa por tarefa. Os passos usam a sintaxe de checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** Mostrar o issue ID do ticket de feedback na visão de detalhe "Meu feedback" e fornecer um botão de cópia para o ID bruto.

**Arquitetura:** Manter a funcionalidade dentro de `TicketDetailView`, porque o `FeedbackTicketDetail.id` existente já contém o identificador estável do issue. Usar a API de clipboard do navegador diretamente do componente de UI e registrar falhas de cópia pelo logger da UI.

**Stack técnico:** React 19, TypeScript, testes de markup estático com Vitest, ícones lucide-react, primitiva de UI `Button` existente.

---

### Tarefa 1: Documentar o contrato de UI

**Arquivos:**
- Criar: `docs/ui/feedback-ticket-detail-issue-id.md`

- [x] **Passo 1: Escrever a spec**

Documentar que `FeedbackTicketDetail.id` é exibido como `Issue #<id>`, que a ação de cópia grava apenas `<id>` e que o registro de falhas usa `packages/ui/src/logger.ts`.

- [x] **Passo 2: Verificar o escopo**

Confirmar que a mudança não altera as APIs do serviço de feedback, as fronteiras do stream de tempo real nem a semântica de entrega do controle remoto.

### Tarefa 2: Adicionar um teste de view de detalhe inicialmente falhando

**Arquivos:**
- Modificar: `packages/ui/test/feedbackTicketDetail.test.ts`

- [x] **Passo 1: Adicionar o teste**

```ts
it("shows the issue id with a copy action", () => {
  const html = renderToStaticMarkup(
    createElement(
      ZCodeIntlProvider,
      { initialLocale: "zh-CN" },
      createElement(TicketDetailView, {
        ticket: createTicket(),
        feedbackService: {} as IFeedbackService,
        onRefresh: vi.fn(),
        onOpenProcess: vi.fn(),
      }),
    ),
  );

  expect(html).toContain("Issue #");
  expect(html).toContain("ticket-1");
  expect(html).toContain('aria-label="复制 issue 编号"');
});
```

- [x] **Passo 2: Executar o teste focado e verificar o estado vermelho (red)**

Executar: `pnpm vitest run packages/ui/test/feedbackTicketDetail.test.ts`

Esperado: o novo teste falha porque `TicketDetailView` ainda não renderiza o issue ID nem a ação de cópia.

### Tarefa 3: Implementar o controle no cabeçalho de detalhe

**Arquivos:**
- Modificar: `packages/ui/src/feedback/TicketDetail.tsx`
- Modificar: `packages/ui/src/i18n/locales/zh-CN.ts`
- Modificar: `packages/ui/src/i18n/locales/en-US.ts`

- [x] **Passo 1: Adicionar estado do componente e handler de cópia**

Importar `useCallback`, `useEffect`, `useRef`, `useState`, `Check`, `CopyIcon` e o `logger` da UI. Manter um estado transitório de "copiado" e escrever `ticket.id` em `navigator.clipboard.writeText`.

- [x] **Passo 2: Renderizar a linha com o issue ID**

Posicionar uma linha compacta `Issue #<id>` abaixo do indicador de status e acima do título. O botão de cópia usa `Button variant="ghost" size="icon-sm"` e um rótulo acessível e localizado.

- [x] **Passo 3: Adicionar strings de localização**

Adicionar:

```ts
"feedback.detail.issueCopy": "复制 issue 编号",
"feedback.detail.issueCopied": "已复制 issue 编号",
"feedback.detail.issueCopyFailed": "复制 issue 编号失败",
```

e os equivalentes em inglês:

```ts
"feedback.detail.issueCopy": "Copy issue ID",
"feedback.detail.issueCopied": "Issue ID copied",
"feedback.detail.issueCopyFailed": "Failed to copy issue ID",
```

### Tarefa 4: Verificar e commitar

**Arquivos:**
- Teste: `packages/ui/test/feedbackTicketDetail.test.ts`

- [x] **Passo 1: Executar o teste focado**

Executar: `pnpm vitest run packages/ui/test/feedbackTicketDetail.test.ts`

Esperado: todos os testes do arquivo passam.

- [x] **Passo 2: Executar as verificações obrigatórias do projeto**

Executar: `pnpm typecheck`

Esperado: o TypeScript conclui com sucesso.

Executar: `pnpm lint`

Esperado: o oxlint conclui com sucesso.

- [x] **Passo 3: Commitar**

Executar:

```bash
git add docs/ui/feedback-ticket-detail-issue-id.md docs/superpowers/plans/2026-06-16-feedback-ticket-detail-issue-id.md packages/ui/test/feedbackTicketDetail.test.ts packages/ui/src/feedback/TicketDetail.tsx packages/ui/src/i18n/locales/zh-CN.ts packages/ui/src/i18n/locales/en-US.ts
git commit -m "feat(ui): show feedback issue id in details"
```