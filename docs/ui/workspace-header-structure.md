# Estrutura do Workspace Header

Atualiza o workspace header de `packages/ui` para uma estrutura com divisão esquerda e direita:

- Esquerda: nome da tarefa, nome do projeto, botão de atalho do editor, menu de mais opções
- Direita: botão de atalho do editor, botão de alternância do terminal, botão de alternância do painel lateral

Restrições de design:

- O nome da tarefa é o título principal e o nome do projeto é a informação secundária
- As entradas de terminal e de navegador passam a ser somente ícone, alinhadas visualmente ao botão de recolher/expandir da sidebar
- O botão de atalho do editor exibe o ícone do editor selecionado por último uso; o botão principal abre diretamente o workspace atual, e o botão de seta abre um dropdown para trocar, persistindo a escolha; a entrada do gerenciador de arquivos continua no menu de mais opções
- O workspace header não exibe o botão de alternância do status panel; a expansão/recolhimento do status panel fica a cargo do próprio botão de recolher do painel e da linha de resumo mini
- No estado de rascunho de nova tarefa (`activeTaskId === null`), o Workspace Header completo não é exibido; a área principal de input do rascunho continua sendo a única a receber a atenção do topo, e no desktop uma barra de título leve mantém, no canto superior direito, apenas a entrada de ajuda e a entrada de Terminal, até que a primeira task estável seja criada e o header, o contexto do workspace e o menu de tasks sejam restaurados
- A entrada de Terminal no estado de rascunho reaproveita o mesmo botão, dica de atalho, estado selecionado e comportamento de alternância da sessão; em macOS/desktop comum fica ao lado da entrada de ajuda e em Windows/Linux ao lado do menu combinado desenhado manualmente. O controle remoto Web no celular não ganha essa entrada de barra de título do desktop
- O botão de alternância do painel lateral mantém apenas o ícone, sem exibir o resumo de alterações `+added -removed` do Git; o resumo de alterações do Git e as entradas de commit/push passam a ficar concentrados no Chat status panel, em Git Tools
- O menu de mais opções concentra o gerenciador de arquivos, o caminho e a capacidade de copiar o ID da tarefa e do trace, facilitando a investigação de problemas
- O item de menu "Open provider config" usa texto puro e reaproveita o aplicativo externo selecionado no canto superior direito, sem manter um estado de editor separado
- O comportamento da janela Remote não é coberto aqui (nesta rodada, apenas a janela do desktop local)

Itens de menu atuais:

- macOS: Open in Finder
- Windows: Open in File Explorer
- Outras plataformas: Open in File Manager
- Copy path
- Copy task ID
- Copy trace ID
- Copy session ID
- Copy log path
- Open provider config