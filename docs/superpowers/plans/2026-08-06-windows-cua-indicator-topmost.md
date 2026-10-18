# Plano de implementação: barra de aviso do CUA no Windows permanentemente em cima

## Objetivo

Corrigir o problema em que a barra de aviso superior do CUA no Windows perde o "sempre no topo" em nível de sistema ao ser reutilizada depois de ocultada uma vez, ficando encoberta por janelas comuns em primeiro plano, mantendo a ausência de roubo de foco, a transparência ao mouse e a exclusão da captura de tela.

## Escopo de implementação

- `packages/desktop/test/windowsCuaOperationIndicator.test.ts`
- `packages/desktop/src/main/windowsCuaOperationIndicator.ts`
- Não modificar o protocolo de ciclo de vida do CUA, o Host tracker, o Renderer nem o helper `zcode-cua`.

## Passos de implementação

1. Adicionar `setAlwaysOnTop` e `moveTop` ao test double de janela, afirmar que tanto a primeira exibição quanto a reutilização após ocultação executam estritamente `showInactive -> setAlwaysOnTop(true, "screen-saver") -> moveTop`.
2. Executar primeiro o teste unitário do indicator do CUA no Windows e confirmar que as novas asserções falham por a implementação atual não chamar a API de topmost.
3. Extrair uma função de exibição unificada, reafirmando o nível `screen-saver` após cada `showInactive()` e chamar `moveTop()`; registrar em comentário em português a causa raiz de que o Windows perde o estado nativo de topmost ao ocultar janelas transparentes.
4. Executar novamente o teste unitário alvo e confirmar que a primeira exibição, a exibição por reutilização e os caminhos existentes de ocultação/exceção passam todos.
5. Executar `pnpm typecheck`, `pnpm lint` e `git diff --check`, e commitar a implementação.
6. Definir `ZCODE_CUA_DEV_ROOT=C:\Users\dev\zcode-cua`, reiniciar o desktop dev e entregar ao usuário para verificação real de oclusão por janela em primeiro plano.

## Pontos de verificação

- O aplicativo em primeiro plano mantém o foco e a barra de aviso não recebe eventos de mouse.
- Ao reutilizar a mesma BrowserWindow no segundo turno do CUA, o nível mais alto de aplicativo é restaurado.
- Janelas comuns, a barra de tarefas e janelas comuns em tela cheia não conseguem cobrir a barra de aviso.
- O secure desktop do UAC, a tela de bloqueio e o fullscreen exclusivo continuam seguindo as limitações do sistema Windows.