# Detalhes da Conexão do Projeto Remoto

O tooltip exclusivo de SSH foi substituído pelos detalhes unificados do projeto remoto; o contrato atual está em [Navegação de projetos plana · RDUX-12](../remote/project-first-remote-navigation-spec.md#21a-侧栏详情与设备菜单rdux-12). SSH, WSL, Docker e Direct Server compartilham o mesmo modelo de exibição.

- Clicar no rótulo do dispositivo abre imediatamente os detalhes acionáveis; passar o mouse por 400ms abre a mesma camada flutuante. Ela é ancorada à direita da linha inteira do projeto e fecha com Escape, clique externo ou ao sair de um detalhe não fixado; fechar o menu não deixa tooltip residual.
- Os detalhes mostram o nome do projeto, o nome do dispositivo, a descrição da conexão, o caminho remoto completo, o status e o motivo; não mostram senha, caminho de chave privada, passphrase nem token de URL. O nome e o caminho no cabeçalho da sessão são consistentes com isso.
- A conexão segue a intenção original do diretório do projeto; desconectar atua sobre o dispositivo; editar reutiliza a caixa de edição de conexão; gerenciar entra nas configurações e rola e foca, de uma vez, o cartão do dispositivo alvo.
- O nome de exibição não participa do cálculo de ordenação, desduplicação ou workspace identity; a camada flutuante pertence à UI e não muda task, snapshot, queue, owner nem a cadeia desktop continuous / mobile replayable.
