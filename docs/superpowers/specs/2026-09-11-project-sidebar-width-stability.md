# Estabilidade da largura da barra lateral de projetos

2026-09-11: O usuário relatou que “Mostrar mais” (Show More) piscava continuamente ao ficar parado e ficava deslocado para a direita; esta entrada complementa os limites de layout por seção da spec do projeto virtual.

A largura da coluna única das seções de projeto/tarefa é determinada pela largura disponível da barra lateral. O título da tarefa e sua cópia em marquee não podem expandir a seção; o overflow do título continua sendo gerenciado por TaskTitleOverflowText, e a quantidade paginada continua sendo gerenciada por ProjectTaskRows. “Mostrar mais” fica centralizado dentro da largura da lista de tarefas à qual pertence e permanece estável antes e depois da paginação.

```text
Largura disponível da barra lateral -> Largura da coluna da seção -> Detecção de overflow do título -> Cópia do título
                                       ^                                                                             |
                                       +------ Proibido expandir na direção oposta ------+
```

A correção restringe a largura mínima da coluna única do Grid no módulo de UI project-sidebar; reutiliza o espaçamento original das colunas, o colapso, o título da tarefa, a paginação e o owner dos dados, sem adicionar estado, observer ou temporizador. Desktop e celular compartilham essa camada de layout, sem alterar continuous / replayable e o caminho de dados Host / CLI.

Aceitação VP-WIDTH-01 (accepted / pending): renderer Electron real usando um índice de tarefas sintético com HOME isolado, com 25 tarefas de títulos curtos e longos misturados na área de projetos e na área de tarefas; sem requisições ao provider. Observa-se em repouso por uma janela de tempo: a seção não tem overflow horizontal, a largura do botão não oscila e o texto fica centralizado dentro da lista de tarefas; após clicar em “Mostrar mais”, 20 itens expandem para 25. Verificam-se os temas claro e escuro e as larguras normal e estreita da seção. O índice sintético serve apenas ao layout e à paginação e não comprova restauração de sessão nem sincronização com o CLI.
