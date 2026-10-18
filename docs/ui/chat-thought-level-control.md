# Controle de thought level do chat

## Objetivo

O controle de thought level da barra de ferramentas do campo de entrada do chat precisa exibir diretamente o texto do nível de pensamento atual, para que o usuário saiba a faixa atual sem abrir uma camada flutuante extra.

## Implementação atual

- `packages/ui/src/chat-input-toolbar/ThoughtLevelCycleControl.tsx`
  - O controle usa por padrão a interação de menu select; ao clicar, expande a lista de thought levels suportados pelo modelo atual.
  - A interação antiga de alternância por clique é preservada como o parâmetro `interactionMode="cycle"`, para poder ser restaurada em cenários em que é preciso trocar mais rápido.
  - O trigger exibe o ícone de cérebro, o texto do nível atual e a barra vertical de níveis; o texto vem do nome de exibição localizado da option `thought_level` atual.
  - Na troca do texto do nível atual é usada uma animação leve de rolagem vertical; quando o sistema tem reduced motion ativado, a substituição é estática.
  - Na largura de desktop o texto do nível atual é exibido; em tela estreita o `labelVisibilityClassName` da barra de ferramentas oculta o texto, garantindo que o Web no celular não comprima o campo de entrada.
  - A barra vertical de progresso de níveis só aparece no intervalo `sm` a `xl` do composer: abaixo de `sm`, em largura muito estreita, a barra de progresso é ocultada e resta apenas o ícone de cérebro; ao atingir `xl`, a barra de progresso é ocultada assim que o texto do nível atual aparece.
  - O composer V4 oculta a seta do dropdown em larguras estreitas menores que `xl`, mas mantém o ícone de cérebro e as regras de resposta da barra de níveis acima; ao estreitar ainda mais, abaixo de `sm`, o trigger converge para um botão de ícone quadrado. Ao atingir `xl` a seta é restaurada.
  - O tooltip alterna conforme o texto do nível atual estar ou não visível no botão: quando o texto está visível, mostra o nome da funcionalidade, `Thought Level` em inglês e "思考级别" em chinês; quando o texto é recolhido porque o campo de entrada ficou estreito, o título do tooltip passa a ser o texto do nível atual.
  - Por padrão o clique expande o menu select; após restaurar o modo `cycle` o clique apenas alterna os níveis, sem exibir tooltip ativamente.
  - `Ctrl+T` sempre preserva a semântica de troca rápida, indo direto para o próximo thought level conforme a ordem exibida, sem abrir o menu select.
  - O `aria-label` continua usando o texto do nível atual, facilitando que o leitor de tela leia o valor atual em voz alta.

## Texto dos níveis e ordem (Todo153)

A configuração do modelo fornece as faixas opcionais e sua ordem. O controle faz apenas a projeção de exibição e não reordena por value nem por name; o menu suspenso, a alternância por clique e o `Ctrl+T` usam a mesma ordem da configuração, com o último item voltando ao primeiro. A configuração declara da mais baixa para a mais alta, com minimal antes de low e ultra depois de max; "ativado" é semântica de interruptor e não é inserido de forma fixa entre alta e altíssima.

| value original                                                        | Chinês | Inglês        |
| ------------------------------------------------------------------- | ----- | ----------- |
| disabled / false / no / none / nothink / no-think / no_think / off | 关闭  | Off         |
| enable / enabled / on / true                                        | 开启  | On          |
| minimal                                                             | 极低  | Minimal     |
| low                                                                 | 低    | Low         |
| medium                                                              | 中    | Medium      |
| high                                                                | 高    | High        |
| xhigh / extra-high / extra_high                                     | 极高  | Extra high  |
| max                                                                 | 最高  | Max         |
| ultra                                                               | 极致  | Ultra       |

A correspondência de texto remove espaços iniciais e finais do value e converte para minúsculas; a seleção e o envio preservam o value original e não fundem opções de mesmo nome. extra-high／extra_high são aliases preservados, sem ampliar outras grafias.

light, shallow, balanced, default, normal, standard, deep, maximum, very-high, very_high deixam de ter uma categorização fixa e, como outros valores desconhecidos, exibem o name fornecido pela origem, permanecendo selecionáveis. Não se infere intensidade nem se está desligado pelo name, e não se adiciona automaticamente uma faixa nem se reescreve a configuração.

A barra de níveis trata valores da categoria desligada como intensidade zero; os itens não desligados aumentam conforme sua posição na sequência de itens não desligados da configuração. Mesmo que um item desligado não esteja em primeiro lugar, ele não é descontado dos desligados seguintes para exibir progresso zero indevidamente. Valores não selecionados/inválidos mantêm progresso zero e espaço reservado; a seleção válida de uma única faixa é somente leitura.

A aceitação cobre os textos em chinês e inglês, o fallback de nomes desconhecidos, o envio do valor original, a ordem personalizada, a consistência entre menu/teclado/toque/alternância, a barra de níveis e as bordas de valor vazio/inválido/faixa única. Desktop e celular usam o controle compartilhado, nos temas claro e escuro; tarefas automáticas e Subagents reutilizam as mesmas regras.

## Fronteiras de compatibilidade

- O Todo153 ajusta a exibição da UI e remove a ordenação de nomes no frontend, preservando a ordem da origem; não altera a escrita do currentValue, o nível de pensamento padrão do workspace, o mapeamento de parâmetros de requisição nem a cadeia de realtime da task.
- Desktop e Web compartilham o mesmo componente React; o celular é afetado apenas pela exibição responsiva do texto, sem alterar a semântica de remote replayable.
- `Ctrl+T` não depende do clique no trigger, evitando que a interação padrão de select sobrescreva a troca rápida por atalho.