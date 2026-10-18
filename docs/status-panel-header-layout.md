# Layout do Cabeçalho do Painel de Status

## Objetivo

Os blocos de título Git, Goal, Progress e Run do painel Status precisam manter uma ordem de informação consistente, evitando no mesmo painel uma mistura em que parte das informações de status fica à direita e parte acompanha o título.

## Regras

- A ordem da linha de título do bloco é: título, seta de expandir/recolher, conteúdo de status.
- O conteúdo de status no estado recolhido de Git, Progress e Run deve ser exibido logo após a seta, sem usar mais `ml-auto` para empurrá-lo até a extremidade direita.
- A ação de pausar/retomar do Goal é uma ação imediata do objetivo atual e é exibida antes das métricas de tempo decorrido e de tokens.
- O painel Status no estado expandido oferece, no canto superior direito, um botão de recolhimento do painel com posicionamento absoluto, usado para alternar para o estado mini.
- Quando o botão de recolhimento do painel no canto superior direito existe, a linha de título do bloco precisa reservar espaço à direita, evitando que o título, a seta ou o conteúdo de status sobreponham o botão.
- Quando o cápsula mini exibe tarefas em segundo plano em execução, mostra apenas o ícone do tipo de tarefa e a quantidade de tarefas em execução, sem mostrar o tempo decorrido nem o cronômetro; o bloco Run no estado expandido e os detalhes das tarefas continuam exibindo o tempo decorrido.

## Compatibilidade

- Esse layout não altera a origem dos dados do painel status, apenas a disposição das informações na linha de título.
- O estado mini continua usando o ponto de entrada existente de expansão pela linha de cápsula.
- Os textos continuam usando as i18n keys existentes, sem adicionar novos recursos de idioma.