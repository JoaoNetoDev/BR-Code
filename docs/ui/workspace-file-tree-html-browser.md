# Abertura de HTML pelo navegador embutido a partir da árvore de arquivos

## Objetivo

O menu de contexto da árvore de arquivos oferece, para arquivos `.html` / `.htm` locais, a ação "Abrir com o navegador embutido". A ação usa o caminho absoluto do arquivo para gerar uma URL `file://` e a entrega ao pane lateral Browser existente, à direita.

## Limites de comportamento

- A ação só aparece na árvore de arquivos local do desktop; workspaces remotos não a exibem, evitando tratar caminhos remotos como arquivos `file://` da máquina local.
- Só é exibida quando o tipo do item é `file` e a extensão é `.html` / `.htm`; diretórios e arquivos virtuais de Git deleted não a exibem.
- A geração da URL reaproveita a ferramenta de caminhos da camada de UI `toFileUrl()`, garantindo que tanto `file:///...` em macOS/Linux quanto `file:///C:/...` no Windows sejam aceitos pelo navegador embutido.
- A abertura do navegador continua passando por `handleOpenBrowserUrl()`, que fica a cargo do pane lateral Browser existente criar a tab, validar a URL e navegar; a árvore de arquivos não opera o webview diretamente.

## Verificação

- `packages/ui/test/workspaceFileTree.test.ts` cobre o reconhecimento das extensões HTML e a geração da URL `file://`.
- A alteração não modifica a semântica de sessão/task realtime do ZCode, snapshot, queue, nem replayable/continuous.