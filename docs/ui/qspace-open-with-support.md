# Suporte a QSpace no Open With

Data: 2026-07-07

## Contexto

O menu "Abrir com" do ZCode não enumera diretamente a lista Open With do sistema macOS; em vez disso, o processo main do desktop mantém uma lista multiplataforma de apps externos candidatos, exposta à UI por `platform.getInstalledEditors()`. No macOS, o QSpace / QSpace Pro instalados não estão nessa lista de candidatos e, portanto, não aparecem no header do workspace, na árvore de arquivos, nos links de arquivo das mensagens nem no menu de abertura de preview.

## Escopo

- Adicionar QSpace e QSpace Pro aos candidatos de apps externos do macOS.
- QSpace / QSpace Pro, por serem apps de gerenciador de arquivos de terceiros, são exibidos no topo da ordenação do "Abrir com", assim como o Finder.
- A ação de abertura continua reutilizando o protocolo existente `platform.openInEditor(editorId, path)`, sem novos campos de protocolo.

## Fora de escopo

- Não alterar o gerenciador de arquivos padrão do sistema macOS, nem substituir o texto existente e a semântica padrão de "Abrir no Finder".
- Não adicionar capacidade de abertura de apps locais na Web, no controle remoto do celular ou no remote workspace; a árvore de arquivos remota continua sem poder entregar caminhos remotos ao QSpace local.
- Não alterar as semânticas de realtime/session de `desktop-continuous` e `web-remote-replayable`.

## Restrições de implementação

- O caminho padrão de `QSpace.app` é `/Applications/QSpace.app` e o de `QSpace Pro.app` é `/Applications/QSpace Pro.app`; a abertura usa a cadeia de fallback existente do macOS `open -a <appPath> <path>`.
- O ícone continua reutilizando `getAppIconDataUrl()`, resolvido a partir do `Info.plist` e dos recursos `.icns` do app bundle.
- Se o usuário não tiver instalada a versão correspondente do QSpace, o filtro `existsSync` impede a exibição do item; com as duas versões instaladas, são exibidas duas entradas independentes.