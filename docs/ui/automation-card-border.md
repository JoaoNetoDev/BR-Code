# Especificação de borda do Card de automação

## Objetivo

O Card de conteúdo da view principal de automação deve usar o mesmo nível de borda semântica que os Cards da página inicial, evitando que, no Zai Dark, a borda do card fique impossível de distinguir por causa de `border-surface` ou de uma sombra interna muito sutil.

## Contrato visual

- O card ocioso da home, o card de tarefa real de automação, o card de tarefa ocioso, os cards de agendamento e ocioso, o estado vazio sem tarefas e o aviso de workspace sem trabalho usam uniformemente `border-card-border`.
- O fundo do Card, o raio dos cantos, o espaçamento e os estados de interação mantêm o contrato existente; desta vez apenas convergimos a semântica da borda.
- Caixas de entrada, menus, popups e divisórias de tabelas continuam usando suas próprias bordas semânticas e não são substituídos junto com o Card.
- Desktop e Web compartilham exatamente o mesmo estilo; tanto Zai Light quanto Zai Dark não podem usar cores hardcoded.
- O botão "创建任务" ("Criar tarefa") no canto superior direito das páginas de detalhe de nova tarefa agendada e de nova tarefa ociosa passa a usar uniformemente o `Button` compartilhado com `variant="default" size="lg"`, sem `className` adicional; a entrada da home de automação mantém seu estilo próprio.
- O texto "创建定时任务" ("Criar tarefa agendada") e o segmento do dropdown também reutilizam o default variant do `Button` compartilhado; a camada de negócio mantém apenas o layout em segmentos, com estrutura de referência no botão do segmento Open do Changes Summary: um `DropdownMenu` envolve todo o container arredondado, e o botão principal e o Trigger do dropdown são controles irmãos, sem borda externa nem divisória adicional, com o menu abrindo a partir da borda direita do botão combinado com `align="end"`.
- A entrada de criação no canto superior direito da home de automação e a do estado vazio passam uniformemente a usar o tamanho `default` de 28px de altura; a atualização usa `outline/icon` e o dropdown segmentado usa `icon-md`, de modo que a atualização e a criação fiquem com a mesma altura e mantenham a hierarquia principal/secundário.

## Limites de regressão

- É proibido restaurar `border-surface` como borda dos Cards de conteúdo de automação.
- É proibido usar `shadow-[inset_0_0_0_1px_var(--color-surface)]` para simular a borda do card de tarefa ocioso.
- `AutomationHistoryEmptyState` usa `rounded-xl border border-dashed border-card-border`, garantindo que o estado vazio "还没有运行记录" ("Ainda não há registros de execução") seja consistente nas páginas de detalhe de agendamento e ocioso.