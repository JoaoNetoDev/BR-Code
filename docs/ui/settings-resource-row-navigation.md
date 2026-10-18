# Navegação por linha na lista de recursos do Settings

## Escopo

Em Settings, as quatro listas de recursos — Commands, Subagents, MCP Servers e Hooks — passam a usar a linha inteira como entrada de edição, sem exibir mais um botão separado com ícone de edição. As linhas de projeto e de arquivo de Memory, assim como a entrada de detalhe de Skills, seguem igualmente a interação de descida pela lista.

## Restrições de interação

- Só linhas de recursos gerenciáveis e editáveis pelo ZCode podem abrir a página de edição; itens embutidos, hospedados em plugin e de fontes compatíveis permanecem somente leitura.
- Clicar com o mouse em uma área não-acionável de uma linha editável abre a página de edição correspondente.
- Linhas editáveis podem receber foco e suportam `Enter` e `Space` para abrir a página de edição.
- Controles internos da linha, como switch, exclusão, autorização e seleção de modelo, permanecem operações independentes; clique ou operação por teclado não pode disparar a navegação da linha.
- Linhas editáveis usam explicitamente `cursor-default` para manter o cursor de seta comum e unificam o feedback com `hover:bg-hover`; linhas somente leitura não se passam por entradas clicáveis.
- Desktop e Web no celular usam o mesmo conjunto de interações de linha, sem depender de hover para descobrir a entrada.
- Todas as linhas de projeto e de arquivo de Memory que podem descem na hierarquia usam o cursor de seta comum, igual ao das demais linhas de recurso.
- A área principal de projeto e as linhas de arquivo do Memory usam `div[role="button"][tabindex="0"]` e reutilizam a lógica de ativação por teclado das linhas de recurso (Enter / Space); o File Tree à direita da linha de projeto permanece um Button independente.

## Entrada de exclusão na página de edição

- As páginas de edição de recursos existentes de Command, Subagent, MCP Server e Hook exibem de forma unificada a entrada de exclusão no fim do formulário; as páginas de criação não a exibem.
- A entrada de exclusão segue o padrão do Subagent: à esquerda, `Button variant="link" size="lg"`, `px-0 text-destructive hover:text-destructive` e `Trash2 size-3.5`; o grupo de ações Save e Cancel permanece alinhado à direita.
- As linhas da lista não exibem mais o botão de exclusão. A exclusão continua passando pelo diálogo de confirmação já existente de cada recurso, e, após o sucesso, retorna-se à lista.

## Informações na linha de Subagent

- Os Subagents já estão agrupados por User, Plugin e Built-in; a linha não exibe mais de forma redundante a etiqueta de escopo.
- A linha continua exibindo modelo (para itens não embutidos), ferramentas, descrição, caminho e as ações correspondentes.