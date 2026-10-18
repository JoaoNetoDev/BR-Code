# Diagnóstico histórico: "Processado" aparecendo onde não deveria em uma posição de Hook (corrigido)

> Status: **corrigido** (2026-08-20); este documento preserva a causa raiz anterior à correção e o destino atual, para evitar correções duplicadas
> Relacionado: workspace hook trust v2 (squash `59c750020f0`); problema residual da remoção da UI de sessão de hooks

## Sintoma

Após a remoção da UI de sessão do HookTrust, aparecia na posição em que as execuções de hook costumavam aparecer (no fluxo da conversa) um cabeçalho de dobra "Processado" isolado, sem nenhum conteúdo ao ser aberto. Ele não deveria aparecer.

## Cadeia de causa raiz antes da correção

```
CLI core (apps/zcode-cli/packages/core/src/hooks/)
  configured-runner.ts: workspace hook sourceKind="project"
  display-metadata.ts: clientVisible = sourceKind !== "internal" ⇒ true
  runner.ts portão suave: hook não confiável não executa, mas emite o evento HookRunBlocked
    （durationMs:0, outcome:"blocked"；hook executado com sucesso emite Started/Completed）
        │
        ▼
Bootstrap 投影 (apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/product-projection.ts,
onHookRunLifecycle)
  onHookRunLifecycle: HookRunBlocked/Completed ⇒ hookInvocation row
  （state:"completed"，a row é adicionada aos rows da sessão）
  ⚠ Esta é uma via de dados reservada para uma futura adaptação da UI de hooks; funciona como projetado
        │
        ▼
UI 分组 (packages/ui/src/v4/conversationTurnWorkSegments.ts:73)
  isAssistantWorkRow = kind !== "turnHeader" && kind !== "userInput"
  ⇒ a hookInvocation row é contada em workRows
        │
        ▼
UI 渲染
  ConversationRowView não tem branch de renderização para hookInvocation (a UI de hooks foi removida) ⇒ row invisível
  resolveConversationTurnWorkStatus: workRows.length > 0 ⇒ hasWork=true
  ⇒ segmento dobrado vazio ⇒ texto de fallback「已处理」(chat.history.worked,
    packages/ui/src/v4/ConversationTurnGroup.tsx:413)
```

## Caracterização histórica

A camada de protocolo (`workspace/hooks/trustGrant`, o schema da hookInvocation row e a projeção) funcionava como projetado,
**a camada de projeção nunca removeu esse tipo de dado** — a `hookInvocation` row é uma via reservada para uma futura adaptação de UI de hooks.
Na época, aquela versão da UI de status de execução de hook (`HookInvocationRow.tsx` / `ToolHookInvocationGroup.tsx` /
`hookInvocationPresentation.ts` etc.) existia apenas no branch `origin/feat/desktop-hook-execution-status`
(não aprovado em revisão) e não tinha consumer no Renderer. O problema era que a projeção continuava produzindo
`hookInvocation` row, a UI não tinha ramo de renderização (a row fica invisível), mas a camada de agrupamento
`isAssistantWorkRow` não foi sincronizada — a combinação dos três fazia com que rows invisíveis ainda participassem da contagem e da segmentação de work,
gerando um segmento "Processado" sem conteúdo. O problema ocorria tanto com hooks executados com sucesso quanto com hooks bloqueados pelo portão suave (não apenas blocked).

## Estado atual da correção

```text
HookInvocationRow
  ├─ não entra em assistant work / flow items / dobra「已处理」
  └─ ConversationTurnRenderUnit.hookInvocations
       -> ConversationHookDetailsAction
       -> Anchor no rodapé do turn + Popover de detalhes somente leitura
```

- `conversationTurnWorkSegments.ts` e `conversationTurnFlowItems.ts` já excluem
  `hookInvocation`, que não participa mais da contagem de work nem gera segmentos dobrados vazios.
- `ConversationHookDetailsAction` tornou-se um consumer do Renderer: o Anchor no rodapé do turn só aparece quando existe
  uma execution client-visible com `didExecute=true`.
- O `HookRunBlocked` apenas de admissão não é exibido como "executado"; uma execution realmente iniciada
  continua mantendo um resumo seguro, e desktop/web reutilizam o mesmo caminho do Renderer.
- Os focused tests já cobrem turn só com hook sem work vazio, a contagem de work em turn misturado, a Hook action
  em estado final sem corpo e o Popover de detalhes.

A especificação dos fatos atuais está em `docs/chat/conversation-hook-turn-summary.md`. O synthetic turn histórico
`session-hooks:<sessionId>` foi proibido; o SessionStart de startup/resume passa a ser atribuído ao próximo
product turn real e autoritativo.