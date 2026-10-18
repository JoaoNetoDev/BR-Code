# Pausa de animações CSS quando o documento está invisível

## Problema

Quando a janela está invisível (minimizada, em outro desktop, tela bloqueada, navegador do celular em segundo plano), o Chromium deixa de produzir quadros de animação e as
CSS transition / animation no `DocumentTimeline` não conseguem ser liquidadas. Nesse momento, se um elemento animado for removido
(reciclagem de lista virtual, troca de task, remontagem por streaming), `HTMLDocument → DocumentTimeline → CSSTransition`
ainda mantém uma referência forte ao elemento e, pelo ponteiro para o parent, arrasta toda a subárvore de mensagens já desmontada até o documento voltar a ficar visível.

Medições reais (2026-09-29, HOME isolado + mock provider com streaming sob pressão, após GC):

| Estado                 | Nós DOM | Listeners JS | renderer footprint |
| ---------------------- | ------- | ------------ | ------------------ |
| durante hidden         | 235,382 | 12,071       | 498 MB             |
| 1s após voltar visible | 45,297  | 1,943        | 379 MB             |

Experimento controlado: disparar transition enquanto hidden e depois remover → 100% de retenção (permanece mesmo com `cancel()` prévio);
não disparar transition → 0 de retenção. As principais entradas são as tabelas markdown, cujo `transition-[max-width]` /
`transition-[width,opacity]` variam conforme a medição, mas o mecanismo vale para todas as animações CSS.

## Convenção

```
visibilitychange ──► document.visibilityState === "hidden"
                        │ sim                       │ não
                        ▼                            ▼
          <html data-document-hidden>        remover data-document-hidden
                        │
                        ▼
   *, ::before, ::after { transition: none; animation: none } (!important)
   → durante o hidden nenhum novo CSSTransition / CSSAnimation é criado e elementos removidos podem ser GC normalmente
```

- A única fonte de dados é `document.visibilityState`; a sincronização acontece imediatamente na instalação e depois apenas em resposta a `visibilitychange`, sem introduzir temporizadores.
- Os pontos de entrada do renderer desktop e do Web (incluindo `/remote` no celular) chamam `installDocumentHiddenMotionPause()` uma vez antes do `createRoot` (`packages/ui/src/lib/documentHiddenMotionPause.ts`).
- Com o documento invisível o usuário não vê a tela, então desligar as animações não tem impacto visível; ao voltar a ficar visível, o estilo volta imediatamente ao estado final e as mudanças seguintes transitam normalmente.
- Benefício adicional: animações de saída que esperam o `animationend` para desmontar, como o Radix Presence, leem `animation-name: none` em estado hidden,
  são desmontadas de forma síncrona e não deixam sobreposições retidas.

## Resultados da verificação

Mesmo script de pressão, janela minimizada (hidden), 15 rodadas consecutivas, comparando após GC:

| Métrica                                 | Antes  | Depois |
| --------------------------------------- | ------ | ------ |
| Nós DOM (Memory counters)               | 175,224 | 22,361 |
| Listeners JS                            | 12,071  | 1,213  |
| Nós detached no heap snapshot           | 109,407 | 3,819  |
| Retenção no experimento controlado (20.050 nós) | 100% | ~2%  |

Os detached restantes são mantidos pelo `elementsCache` do virtual do TanStack por meio de closures de rAF pendentes; são liquidados após voltar a ficar visível e permanecem limitados.

## Limites

- Apenas transition / animation CSS são cobertas; animações dirigidas por JS, como as de `motion` (Web Animations API), não são afetadas.
- Transições em curso no instante em que se entra em hidden são canceladas (disparam `transitioncancel` em vez de `transitionend`), então
  lógicas que dependem de `transitionend` para fechar precisam ter um fallback próprio (o `useAnimatedResizablePanel` e o
  `HighspeedActivationVisual` já têm fallback por timeout).