# React Error Boundary

`packages/ui/src/ErrorBoundary.tsx` agora oferece o `AppErrorBoundary` compartilhado, que envolve de forma unificada o `ZCodeIntlProvider` e o `Root` nas duas entradas de renderer, desktop e web.

O objetivo disso é simples:

- Exceções de render/lifecycle do React não desmontam mais a árvore inteira em uma tela branca
- A página de fallback registra o erro de forma unificada via `packages/ui/src/logger.ts`
- O usuário ainda pode executar "Tentar novamente" ou "Atualizar o aplicativo"

A estratégia atual é "primeiro sobreviver, depois recuperar":

- `Tentar novamente`: limpa o estado do error boundary e tenta renderizar a árvore atual novamente
- `Atualizar o aplicativo`: recarrega diretamente o renderer atual, adequado para casos em que o Provider ou o estado de inicialização já estão corrompidos

Se mais tarde for feita uma isolamento de granularidade mais fina, é possível continuar adicionando Error Boundaries secundários em áreas locais como workspace, barra lateral e painel direito; mas a fronteira do nível raiz deve ser mantida, garantindo que nunca se volte a uma tela branca.