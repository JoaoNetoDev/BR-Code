# Tooltips da Barra Lateral

## Comportamento

Os tooltips da navegação de projetos/tarefas da barra lateral esquerda, de grupos e linha do tempo, das entradas de conta/configurações/controle remoto móvel na parte inferior, da árvore de arquivos e da área de ferramentas da barra lateral e da navegação de tarefas no canto superior esquerdo passam a aparecer de forma unificada após o mouse permanecer continuamente sobre o alvo por **300ms**.

```text
Entrar no gatilho → Temporizador Radix de 300ms → Exibir tooltip
       └─ Sair antes → Cancelar
Trocar de gatilho → Reinicia o temporizador de 300ms (não pula o atraso)
```

- O Tooltip Provider compartilhado da barra lateral configura o atraso, `skipDelayDuration=0` e a política de atraso estrito. Dentro do escopo estrito, cada tooltip usa um temporizador Radix independente, evitando que o estado de abertura rápida compartilhado contorne o atraso em um mesmo movimento do ponteiro; fora da barra lateral não são adicionados Providers por tooltip. Temporização, cancelamento ao sair e focus por teclado seguem o Radix, sem cronômetros de negócio adicionais.
- Os tooltips comuns apenas exibem a descrição, fecham ao sair do gatilho e não habilitam um corredor de hover para o conteúdo do tooltip; a camada flutuante não intercepta eventos de mouse, evitando que um tooltip antigo bloqueie o novo tooltip de um botão vizinho; os detalhes remotos interativos continuam usando o HoverCard original.
- A linha de projeto ("mais / mostrar árvore de arquivos / nova tarefa"), as ações de seção e de grupo, as ações e o status das tarefas, as informações de workflow, as entradas inferiores, os botões da árvore de arquivos e o status do Git herdam a mesma política. A linha inteira de uma tarefa em grupo não pode sobrescrevê-la com um Provider independente de atraso zero.
- O botão de novo projeto da seção "Projetos" e o botão de nova tarefa da seção "Tarefas" passam a ter tooltip, reaproveitando o texto de internacionalização existente e os nomes de acessibilidade.
- Os tooltips nativos `title` da barra lateral passam a usar o Tooltip compartilhado, incluindo nome do grupo, nome/diretório do rascunho, descrição do projeto antigo, workspace home-only, caminho do arquivo, mais/limpar busca da árvore de arquivos, informações da conta e motivo de menu desabilitado. Preservar as dimensões do gatilho, o arraste, o clique e o comportamento de teclado.
- O HoverCard de detalhes do projeto remoto já adotou 300ms e assim permanece; o atraso de fechamento e a interação de cópia dentro dos detalhes não mudam.
- O título comum de tarefa já possui rolagem por hover de 1 segundo, sem adição de Tooltip no título; o momento de abertura do menu de clique, do Popover e do Dialog não muda. Os tooltips fora da barra lateral continuam usando a política original.
- O atraso do hover do mouse não altera os tooltips por focus de teclado nem o comportamento de clique por toque. Desktop e celular compartilham os componentes, válidos tanto em chinês/inglês quanto nos temas Zai Light / Dark.

## Verificação

- SBT01: uma passagem rápida não exibe nada; após a permanência, exibe; botões adjacentes esperam novamente a cada vez; sair cancela.
- SBT02: os três botões da linha de projeto, os botões de criação das seções de projeto/tarefa, busca/filtro e os textos das entradas inferiores estão corretos, e o clique continua executando a ação original.
- SBT03: a linha inteira e as ações dos grupos, a migração dos tooltips nativos, a árvore de arquivos e os detalhes remotos seguem 300ms; os tooltips fora da barra lateral mantêm a política original.
- SBT04: layouts de desktop/celular, chinês/inglês e temas claro/escuro; o clique por toque não espera tooltip e a usabilidade por teclado é preservada.

Os candidatos de browser montam os componentes reais de produção e injetam dados de serviço; os candidatos de Desktop validam o entrypoint da aplicação completa. Os casos candidatos permanecem em manual-review/pending, sem substituir a transmissão remota nem a validação nativa multiplataforma por fixtures de browser.
