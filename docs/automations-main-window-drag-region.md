# Região de Arrasto da Main Window de Automations

## Contexto

Quando a view principal do Workspace muda para `automations`, o `WorkspaceHeader` não é renderizado. As páginas de chat comum e de rascunho dependem da região `[app-region:drag]` no topo do header para arrastar a janela do desktop; sem essa camada na view principal de tarefas agendadas, os usuários do desktop não conseguem arrastar o app pela parte superior da página.

## Especificações

- A view principal de tarefas agendadas no desktop precisa manter no topo uma região `[app-region:drag]` de `h-12`, alinhada à altura de arraste das barras de título das demais views principais.
- A área de conteúdo das tarefas agendadas continua rolando de forma independente; cards da lista, botões de menu e o botão de criação não entram na região de arraste.
- O controle remoto Web / celular não precisa da capacidade de arrastar a janela do desktop, portanto não há altura de título adicional.
- Se no futuro a view principal de tarefas agendadas voltar a usar o `WorkspaceHeader` unificado, o placeholder de arraste independente deve ser removido, para evitar uma barra de título duplicada.

## Breadcrumb do caminho de edição

A área de arraste de 48px da view principal de Automations do workspace também comporta o breadcrumb das páginas de segundo nível. A página de lista tem apenas um nível, "自动化", que, pela regra global, não é exibido; as páginas de criação e edição exibem "自动化 > 新建任务/任务名称". O botão de primeiro nível chama a lógica de retorno com estado sujo já existente na view de edição e não pode contornar a confirmação de alterações não salvas. O Web móvel não renderiza a barra de arraste do desktop.