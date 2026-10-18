# Diálogo de Confirmação Secundária

## Objetivo

- Fornecer a `packages/ui` um diálogo de confirmação secundária global e reutilizável.
- Cobrir primeiro as duas operações de alto risco: excluir task e remover project.

## Implementação

- `packages/ui/src/store/confirmDialogStore.ts` gerencia com Zustand uma requisição de confirmação única; o lado chamador aguarda o resultado via Promise.
- `packages/ui/src/ConfirmDialog.tsxé responsável por renderizar o diálogo, com layout e área de botões alinhados ao estilo do diálogo de confirmação do `z-work`.
- `packages/ui/src/Root.tsx` monta o `ConfirmDialogHost` no nó raiz, garantindo que desktop, web, local e remote usem a mesma lógica de UI.

## Pontos de Integração

- `packages/ui/src/TaskList.tsx` exibe a confirmação antes de excluir uma task.
- `packages/ui/src/WorkspaceSidebar.tsx` exibe a confirmação antes de remover um project.

## Restrições de Interação

- `Esc` cancela, `Enter` confirma.
- Fechar um project apenas remove o item da barra lateral, sem afetar os arquivos em disco.