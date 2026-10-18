# Recolhimento Automático ao Redimensionar o Workspace

## Contexto

A interface principal do Workspace contém a sidebar esquerda, a conversation do chat, o terminal na parte inferior e o side pane à direita. Quando o usuário reduz a janela do desktop, a conversation é a área de trabalho central que sofre pressão primeiro, e por isso a estratégia de recolhimento automático usa como critério a largura real de `ResizablePanel(id="conversation")`.

## Estratégia

- Responder apenas a `window.resize` disparada pelo usuário, sem observar o `ResizeObserver` da própria conversation, evitando que a estratégia feche imediatamente um painel aberto manualmente pelo usuário.
- Após cada resize da janela, ler a largura real do conversation panel, sem usar diretamente `window.innerWidth`.
- Quando o side pane direito já estiver aberto e a largura da conversation for menor que `480px`, recolher automaticamente o side pane.
- Quando a sidebar esquerda já estiver aberta e a largura da conversation for menor que `360px`, recolher automaticamente a sidebar.
- O recolhimento automático só é acionado ao estreitar; após ampliar a janela não há restauração automática, e o usuário reabre manualmente pelo botão existente ou pelo atalho.
- O recolhimento automático do side pane apenas oculta o contêiner, sem fechar a tab, evitando a perda do conteúdo de painéis como browser, Git e pré-visualização.

## Limites de compatibilidade

- O desktop e o Web desktop reutilizam a mesma escuta do conversation panel.
- O controle remoto no celular usa hoje um overlay / mobile shell independente e não depende dessa estratégia de divisões do desktop.
- Essa estratégia não altera o fluxo de mensagens de session / task realtime do ZCode e não envolve os limites de transporte entre `desktop-continuous` e `web-remote-replayable`.