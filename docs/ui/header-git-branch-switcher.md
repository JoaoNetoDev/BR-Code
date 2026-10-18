# Header: indications de workspace e branch

O Workspace Header deixa de exibir a cápsula do workspace e a entrada de troca de branch após o nome da tarefa. As informações do workspace passam para um botão de ícone ghost antes do nome: localmente exibe Folder, na nuvem/remoto exibe Cloud.

O espaçamento dos elementos da área de título é `gap-2` (8px); o controle remoto do celular em tela estreita continua usando o espaçamento compacto `gap-1` já existente.

O padding esquerdo padrão do Header é de 8px (`p-2`), igual ao padding base à direita; com a barra lateral recolhida, ainda se reserva, conforme a plataforma, o espaço dos botões de controle da janela.

## Comportamento

- Tarefas existentes exibem a entrada de ícone; o rascunho de nova task continua ocultando o contexto do workspace.
- No hover, foco por teclado ou ao pressionar, exibe para baixo o nome do workspace, o identificador de host remoto existente e a branch; em workspaces sem Git a branch é omitida e o Detached HEAD reutiliza o texto localizado existente.
- O tooltip adota um overlay em formato de card, fixo em `w-72` (288px), `rounded-xl`, `bg-popover`, `shadow-md`, com padding de 12px e espaçamento entre linhas de 12px. São duas linhas alinhadas à esquerda, "ícone do workspace + nome" e "ícone de branch + branch", usando `text-ui-base`; textos longos quebram linha e ícones não encolhem. Não são adicionados estatísticas de tarefa, caminhos ou ações.
- O controle remoto do celular também exibe o ícone compacto, clicável para visualização, sem depender de hover.
- O texto e os ícones das linhas de workspace e branch usam uniformemente `text-popover-foreground`; a branch não reduz opacidade.
- O Header não oferece mais ação de troca de branch; o `GitBranchSwitcher` em outros locais, como a área de input do chat, mantém a lista, a criação e o fluxo de proteção de alterações não commitadas já existentes.

## Origem dos dados

- O tooltip lê diretamente o `gitSummary` existente, e o nome da branch reutiliza `resolveGitBranchTriggerLabel`. Nenhuma nova chamada a serviço Git é adicionada.
- A identificação local/remoto, o workspaceIdentity e o remoteSessionId mantêm os limites atuais, sem alterar conexão ou estado de task.