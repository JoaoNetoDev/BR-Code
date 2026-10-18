# Layout dos Formulários de Configurações

## Contexto

Os formulários de criação e edição da página de configurações seguem uma borda de cartão leve, sem adicionar cor de fundo ao cartão. Cantos arredondados, borda e padding continuam fornecendo o agrupamento do formulário; o fundo transparente evita uma hierarquia de aninhamento excessiva ao entrar no formulário a partir de uma lista, e desktop e Web mantêm a mesma densidade de informação.

## Especificação

- O container raiz do formulário usa o layout vertical natural `space-y-*` e mantém a borda de
  cartão `rounded-xl border border-border p-4`, mas sem usar o fundo `bg-card`; os formulários de Subagent, MCP Server, Command e Hook seguem essa regra de forma unificada.
- O texto explicativo abaixo do título do formulário usa `text-ui-base text-foreground-subtle`.
- As páginas de criação/edição de tarefas agendadas e de tarefas off-peak mostram, de forma unificada após o breadcrumb, o título e o subtítulo da área de conteúdo: o título usa
  `text-ui-xl font-semibold text-foreground` e o subtítulo usa o estilo de informação auxiliar acima; o título alterna conforme o estado de criação/edição,
  sem substituir o título de ação da página pelo nome da task.
- Os labels de campo usam `text-ui-base font-medium text-foreground-subtle`.
- Campos comuns usam os componentes existentes `Input` / `Textarea` / `Select` e `size="lg"`.
- O Model picker do formulário de Subagent reaproveita o `ModelConfigSelect` da barra de ferramentas, mas seu trigger precisa usar
  `bg-clip-border` para sobrescrever o `bg-clip-padding` base do Button, mantendo a mesma borda de fundo de input de um Select comum.
- Campos de múltiplas linhas usam uniformemente o Textarea compartilhado da página de configurações, aplicando
  `rounded-lg border border-input-border bg-input px-2 py-2` diretamente no nó raiz do textarea, sem adicionar contêineres que sirvam apenas ao estilo visual.
- `SelectTrigger` não usa `bg-clip-padding`, evitando que o seletor dentro do cartão transparente produza uma camada extra de recorte de fundo.
- O Hook Runner usa um Select com `size="lg"` consistente com Scope e Event; `process` e `command`
  continuam sendo modos de execução mutuamente exclusivos e continuam acoplando os campos Args ou Shell/Async abaixo.
- Os formulários de criação/edição de recursos reaproveitam uma barra de ações unificada: a ação de exclusão aparece apenas no estado de edição e fica à esquerda; Save e Cancel
  ficam à direita, na ordem fixa Save → Cancel. Em telas estreitas a barra de ações pode empilhar verticalmente, mas Save e Cancel
  continuam alinhados à direita. As dicas de campo ficam acima da área de ações, sem ocupar o início horizontal dos botões.
- A primeira linha do formulário de Hook exibe Scope, Event e Runner lado a lado no desktop e volta a uma coluna em tela estreita; Matcher e
  Command formam as duas colunas da configuração de execução. Timeout, Status message e Custom JSON vão para a área Advanced, colapsada por padrão, reduzindo a altura da primeira tela.
- As tabs User / Workspace da lista de Hooks são exibidas na mesma linha do aviso de «aplicado a novas sessões», com o aviso logo à direita
  das tabs e sem encostar no lado direito do contêiner; em tela estreita a quebra de linha é permitida. O aviso usa texto auxiliar comum, sem fundo de cartão, borda, cantos arredondados ou bloco de padding.
- O recurso Hook usa uniformemente o ícone `Anchor` na barra lateral de configurações, nos itens de lista e nos detalhes de capacidade do plugin; o canal Webhook real continua usando o ícone `Webhook`.
- Nome e escopo precisam ser exibidos como a informação de identidade principal na mesma linha: o campo de nome mantém a largura convencional de formulário, sem ocupar a linha inteira; o escopo usa o mesmo label inline + `SelectTrigger size="lg"` das configurações de modelo em «Modo de conexão», colado à direita, com o trigger do dropdown mostrando a largura natural do conteúdo do texto; em tela estreita a quebra natural acontece.
- Campos curtos de identidade nos formulários de recursos mantêm a largura consistente, por exemplo «Nome» e «Tipo» do servidor MCP e «Nome» do comando usam `w-48`.
- A área principal de ação na parte inferior é alinhada à direita, o botão de cancelar usa `ghost` e o de salvar usa `default`; o texto da ação principal é uniformemente «Salvar» tanto na criação quanto na edição, sem misturar «Adicionar» ou «Criar».
- O botão de salvar é habilitado uniformemente quando o formulário é válido: campos obrigatórios, formato do nome, seleção de modelo e configuração de JSON participam da avaliação imediata de validade;
  o botão continua desabilitado enquanto a requisição de salvar está em andamento, evitando envio duplicado. As mensagens de erro específicas continuam sendo exibidas pela validação de envio ou pela interação com o campo.
- Nas cabeçalhos das listas de recursos como habilidades, servidores MCP e comandos, a área de ações prioriza o botão «Novo», seguido pelas ações auxiliares de importação, abrir diretório e atualizar.
- O botão de voltar para a lista usa `variant="link" size="sm"` com ícone de seta à esquerda, com `text-foreground-subtle` por padrão, `text-foreground` no hover e sem sublinhado, usando `-ml-2` para compensar o recuo visual e garantir o alinhamento da borda esquerda entre o texto e o conteúdo do formulário.
- A alternância de modos como Formulário/JSON fica à direita da linha do título, reaproveitando o estilo da alternância de escopo das estatísticas de uso: contêiner externo `h-8 rounded-lg border border-border bg-background p-1`, com o item selecionado usando `data-active:bg-secondary data-active:text-foreground`.
- O dropdown de tipo do novo servidor MCP não exibe `Streamable HTTP` por enquanto, porque esse tipo de transporte ainda precisa de suporte do lado do Agent antes de ser liberado.

## Cobertura atual

- Configurações de modelo: novo provedor de modelo.
- Servidores MCP: criar/editar servidor MCP.
- Comandos: criar/editar comando.
- Subagent: criar/editar Subagent de usuário.
- Hook: criar/editar Hook de usuário ou de workspace.
- Automação: criar/editar tarefa agendada e tarefa off-peak.