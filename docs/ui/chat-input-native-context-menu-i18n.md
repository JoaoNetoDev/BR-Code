# Spec de internacionalização do menu de contexto nativo da caixa de entrada no desktop

## Contexto

O menu de contexto da caixa de entrada no desktop é exibido dinamicamente pelo processo principal do Electron ao ouvir o evento `context-menu`. Os itens do menu hoje definem apenas a `role` do Electron, sem `label`, portanto os textos ficam determinados pelo idioma padrão do Electron/sistema operacional, o que pode divergir do idioma atual do aplicativo ZCode.

## Objetivos

- O menu de contexto das caixas de texto editáveis no desktop (desfazer, refazer, recortar, copiar, colar, excluir, selecionar tudo) usa os textos do locale atual do aplicativo.
- Preservar a `role` e as `editFlags` do Electron, sem alterar o comportamento nativo de edição nem os estados de desabilitado.
- Depois de trocar o idioma do aplicativo, a próxima abertura do menu de contexto já usa o novo idioma, sem precisar reiniciar a janela.

## Não objetivos e limites

- Não modificar o menu de contexto nativo do navegador no Web móvel/Web remoto; esse menu é controlado pelo navegador, e o aplicativo não consegue injetar textos diretamente.
- Não transformar o menu de contexto da caixa de entrada em um menu customizado em React/DOM.
- Não alterar outros menus de contexto de texto selecionado, do navegador embutido ou do terminal.

## Restrições de implementação

- Os rótulos do menu reutilizam a tabela de locale do menu desktop em `packages/shared/src/desktopMenu.ts`.
- Na criação do menu de contexto, o idioma atual do aplicativo é lido por um getter de locale, em vez de ser fixado no momento da criação da janela.
- `Delete` recebe um id de message próprio do menu desktop, garantindo que todas as ações do menu de contexto tenham textos em chinês e em inglês.

## Critérios de aceitação

1. Em `zh-CN`, o menu de contexto da caixa de edição exibe: 撤销、重做、剪切、复制、粘贴、删除、全选.
2. Em `en-US`, exibe: Undo, Redo, Cut, Copy, Paste, Delete, Select all.
3. A `role` e o estado `enabled` de cada item do menu permanecem conforme o resultado atual de `ContextMenuParams.editFlags`.
4. O getter de locale é lido no momento em que o menu é exibido, portanto trocar o idioma não exige recriar a BrowserWindow.