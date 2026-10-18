# Chat Empty Workspace Menu

> **Estado atual**: este documento descreve o comportamento atual do rascunho vazio V4 e do workspace quick switcher.

O título do estado vazio do chat é `Start a new task in {workspace}`.
O seletor de workspace agora fica na linha de contexto do composer, acima do `ConversationComposer`, ao lado do seletor
de branch Git.

## Lista de Workspaces

- O menu inclui um campo de busca no topo.
- A busca casa com o nome de exibição do workspace, o rótulo da tab, o caminho do workspace e o texto de destino
  remoto, como host/usuário SSH, distro WSL ou container Docker.
- Os resultados mantêm a ordem atual das tabs de workspace; a busca nunca reordena as correspondências.
- O menu mostra no máximo as primeiras 5 correspondências visíveis de workspace, tanto antes quanto depois da busca.
- Workspaces remotos desconectados permanecem ocultos neste quick switcher, porque não podem ser acessados
  imediatamente.
- O item de atalho `Home` anterior não é mais exibido.

## Adicionar Novo Workspace

A área de ações é ordenada como:

- `Open folder`
- `Remote connection`
- `Work without a project`

`Work without a project` garante o workspace de suporte estável em
`<dataBaseDir>/.zcode/workspace/default` e inicia um rascunho ali. O workspace de suporte é classificado como
`conversation`, fica excluído da busca e dos resultados de projetos e é exibido como `Select project` no gatilho.
Selecioná-lo repetidamente é uma operação sem efeito.

Quando um projeto real é selecionado, o gatilho revela uma ação de fechamento separada no hover/foco. Fechar apenas
revincula o rascunho não enviado ao workspace de suporte da conversa; não fecha a tab do projeto nem move uma task
existente. Os alvos de workspace incluem caminho, identidade opcional e propósito, para que workspaces remotos com o
mesmo caminho permaneçam isolados.

O seletor pode ser reutilizado por uma superfície que exige um projeto real. Nesse modo de capacidade, as duas formas de
entrar no workspace de suporte da conversa estão ausentes: o gatilho não revela a ação de fechamento e o menu não
renderiza `Work without a project`. O ícone do workspace atual permanece visível porque nenhuma ação de fechamento o
substitui. O formulário de criação de tarefa agendada usa esse modo; rascunhos de conversa comuns mantêm o comportamento
padrão acima.

`Open folder` reusa a mesma função de entrada Open Folder da página Open Workspace. No desktop, o seletor de diretórios
da plataforma é configurado com `openDirectory` e `createDirectory` do Electron, de modo que diálogos nativos que
suportam a criação de pastas podem expor New Folder / Create Directory.
