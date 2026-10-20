# Sidebar Task View Switcher

## Comportamento atual (2026-10-13)

O filtro da barra lateral é 「按项目」/「按分组」/「最近更新」, cada item mantendo seu ícone, sem restaurar o antigo switch de dois níveis.
Agrupamento e projeto são independentes entre si; o contrato específico está em [visão de agrupamento](task-grouped-view.md).
Quando o cliente tem uma nova `view` válida, ela é mantida; caso contrário, a preferência antiga `organizeBy` é migrada: `grouped` → `grouped`, `chronological` → `timeline`, `project` → `projects`. Sem preferência histórica válida, o padrão é por projeto.
As trocas explícitas posteriores seguem a nova preferência; a troca não altera a ordem das tasks, dos projetos nem o diretório de execução.

## Switch de dois níveis histórico (não é mais usado)

As entradas de visão da área de tarefas da barra lateral são divididas em dois níveis:

1. Slider de primeiro nível: `Group` / `Project`
2. Menu de filtro no modo `Project`: `By project` / `Timeline`, além de `Created` / `Updated`

O objetivo é transformar as ações mais usadas pelo usuário — "ver as tarefas por projeto" e "agrupamento personalizado" — em uma troca explícita, evitando comprimir `Project`, `Group`, `Timeline` e a ordenação no mesmo dropdown. Conversas que não são de projeto não ganham uma tab de primeiro nível; elas se tornam uma section de segundo nível independente dentro de `Project + By project`.

## Mapeamento de estado

O estado de dados da visão de tarefas existente continua sendo reaproveitado, sem novos campos de servidor ou de protocolo:

- `Group` -> `taskOrganizeBy = "grouped"`
- `Project` + `By project` -> `taskOrganizeBy = "project"`
- `Project` + `Timeline` -> `taskOrganizeBy = "chronological"`
- `Created` -> `taskSortBy = "created"`
- `Updated` -> `taskSortBy = "updated"`

A visão `Group` não responde à ordenação `Created` / `Updated`. Ao voltar para `Project`, continua valendo a última subvisão de projeto e a preferência de ordenação.

A ordenação de `Project + By project` e de `Project + Timeline` tem duas camadas de semântica, e não é a aplicação direta de `taskSortBy` sobre a tabela inteira:

1. Tasks em `prewarming/running`, assim como tasks com `hasBackgroundWork` verdadeiro (com workflow run dinâmico, bash em background ou subagente destacado pendurados), ficam sempre no topo da lista de tarefas comuns corrente (adendo de 2026-09-09: o trabalho de background entra na camada de running);
2. Dentro da camada de running, a ordem é por `createdAt` decrescente, e empates de horário de criação são resolvidos apenas pelo `taskId` estável;
3. A preferência `Created` / `Updated` só é aplicada na camada que não é running.

Assim, a task original e o fork child que rodam em paralelo não trocam de posição por causa de `lastActivityAt`, que se alterna conforme os eventos de streaming chegam; o fork child foi criado mais tarde e, durante a execução, fica de forma estável acima da task original. O mesmo vale para duas sessões que rodam cada uma um workflow run em background: os eventos de progresso do run avançam `lastActivityAt` continuamente, mas as duas linhas ficam fixas dentro da camada de running por `createdAt` e não se invertem.

Sessões com workflow run pendurado ganham, nas três visões (Project / Group / Timeline), uma linha a mais abaixo do título com 「ícone de Workflow + luz de trilho miniatura + nome do phase atual」 (adendo de 2026-09-14: linha de execução de workflow), com dados vindos do sidecar `workflowActivity`; essa linha é apenas desenhada, não participa da ordenação e não altera a prioridade do slot de 16px à frente. A altura da linha vai de 32 → 52 (até duas linhas).
O ícone de carregamento continua reconhecendo apenas `prewarming/running`; o trabalho de background não acende o indicador. Pinned continua sendo uma seção estrutural independente e Grouped continua obedecendo o `sort_order` explícito persistido pelo usuário; a camada de running não embaralha os dois entre si.

As sections de segundo nível `Projects` / `Tasks` usam a preferência renderer-local independente `zcode-sidebar-purpose-section-preferences`, persistindo separadamente `projectsExpanded`, `conversationsExpanded` e `sectionOrder`; na primeira execução, com preferências antigas, dados corrompidos ou storage indisponível, o padrão é tudo expandido e ordenado como `Projects -> Tasks`.

## Layout de interação

A barra de tarefas exibe diretamente um slider compacto de dois segmentos, sem exibir um título `Tasks` adicional:

```text
[ Group | Project ] [expand]   [new group] [archive] [filter]
Pinned
  • task
```

- A camada externa da barra de tarefas usa `pl-2.5 pr-3`, e o slider usa um estilo pill leve: a altura real do shell das tabs é fixa em `h-7`, o corpo da tab tem altura `h-6`, o padding horizontal usa `pl-1.5 pr-2`, ícone e texto usam `gap-1`, e a largura acompanha o conteúdo dos ícones e textos de `Group` / `Project`, sem esticar horizontalmente a barra; o shell das tabs usa `bg-surface`, e o fundo de active é um pill indicator independente sem borda, com `bg-background`, que desliza acompanhando a posição e a largura do item atual, sem usar grandes áreas de cor de marca.
- A tab `Group` fica à esquerda e a tab `Project` à direita; a inicialização continua mantendo a visão `Project`, para não mudar a entrada de tarefas padrão já existente.
- Nos modos `Group` / `Project` / `Timeline` / `Archived`, a seção de pinned é renderizada sempre de forma fixa abaixo do slider e dos botões de ação, e acima da lista de tarefas comuns; o container da lista não ganha margem vertical extra, evitando um espaço em branco grande demais entre a lista e o slider.
- O corpo de `Group` continua recebendo apenas tasks que não são pinned nem archived; as tasks fixadas migram para a seção global de pinned da mesma página, aparecendo uma única vez. Depois que o menu compartilhado de tarefas no canto superior direito executa a fixação, a task atual precisa continuar encontrável na página `Group`, sem que a página inteira desapareça por o corpo grouped filtrar a pinned membership.
- As group membership e a ordenação do usuário originais da task pinned permanecem inalteradas; ao desfixar, ela volta para o group original ou para a posição de topo. A seção de pinned continua oculta quando não há dados e não está carregando, sem renderizar um título vazio extra.
- Os botões `Expand all` / `Collapse all` ficam colados à direita do slider, por pertencerem à troca de visão atual; ações secundárias como `New group`, arquivamento e filtro permanecem no lado direito da barra.
- Ao trocar de visão, `Expand all` / `Collapse all` preservam de forma otimista, com base no modelo do quadro anterior, a posição, o ícone e o estado disabled; só são removidos depois que a nova visão confirmar de volta que estão vazios, evitando que a área de ações fique momentaneamente com um botão a menos ou pisque cinza antes de voltar, fazendo a linha inteira tremer.
- `New group` mantém, na visão `Group`, o botão apenas com ícone de antes; o texto é exposto por tooltip e `aria-label`, para não alargar demais a área de ações à direita.
- Quando `Group` está selecionado, o lado direito mantém as ações gerais `Expand/Collapse all`, `New group` e arquivamento; a subvisão de projeto e o menu de filtro de ordenação ficam ocultos, e a barra de tarefas não exibe mais o botão de busca.
- Quando `Project` está selecionado, o menu de filtro exibe:

```text
View
✓ By project
  Timeline
---
Sort by
✓ Updated
  Created
```

A área de tarefas de `Project + By project` é fixa como:

```text
Pinned
Projects          [drag]     [chevron] [+]
  workspace rows
Tasks             [drag]     [chevron] [new task]
  conversation rows
```

- `Pinned` só aparece quando há dados ou está carregando; tasks pinned de conversa／projeto aparecem apenas uma vez.
- Os títulos `Projects` e `Tasks` aparecem sempre e expandem／recolhem de forma independente; clicar no restante da linha do título, fora das actions à direita e da alça de arrasto, alterna a section: expandido mostra seta para baixo e recolhido mostra seta para a direita.
- A alça de arrasto dedicada suporta mouse, toque e teclado. O usuário pode trocar a posição de duas sections; uma section vazia ou recolhida continua movível, o estado expandido e o conteúdo acompanham a section, e o `sectionOrder` é persistido imediatamente após a troca.
- A seta e as actions à direita ficam ocultas no estado padrão do ponteiro e aparecem no hover da section, em `focus-within` por teclado, com o menu aberto ou quando o dispositivo não suporta hover; a action é irmã do trigger, e o clique executa apenas a ação, sem mudar o estado expandido da section.
- O menu `+` à direita de `Projects` reaproveita `Open folder` e `Remote connection`; o `MessageCirclePlus` à direita de `Tasks` fica fixo em criar um rascunho na conversation backing workspace.
- As tasks em `Tasks` usam a mesma row de linha única das tasks comuns de workspace: não exibem o nome de diretório do backing workspace interno (por exemplo `default`) nem mostram ponto cinza para o estado ocioso comum; os indicadores reais de estado — não lido, erro, em execução — continuam preservados.
- Recolher uma section apenas oculta o conteúdo, sem limpar o estado expandido das workspace rows, o cache de tasks ou a ordem de DnD. Quando não há projetos reais, não há conversation backing tab ou as workspace tabs ficam temporariamente vazias durante a restauração, os dois títulos e seus respectivos estados vazios continuam sendo renderizados.
- A consulta de tasks usa todos os workspace targets; apenas as workspace rows, o DnD, o expandir／recolher e o estado vazio de projeto são filtrados por `workspacePurpose=project`.
- `Group` continua exibindo as tasks que não são de projeto: por padrão, não agrupadas no topo, podendo entrar em grupos comuns; não se pode gerar automaticamente um workspace group `default` para o backing path.
- A seção de pinned no topo de `Group` e o corpo grouped usam o mesmo workspace scope, mas cada um mantém sua membership independente: a primeira mostra apenas pinned e a segunda exclui pinned, proibindo linhas duplicadas.

- `Expand all` / `Collapse all` continuam funcionando conforme a semântica da visão atual: o modo Group controla os groups; o modo Project controla ao mesmo tempo a section `Projects` e todos os grupos de tarefas de projeto, sem afetar `Tasks`; e o modo Timeline não é exibido quando não há objeto que possa ser expandido em lote.
- Em largura estreita, a barra pode quebrar linha: o slider ocupa primeiro a largura disponível e os botões de ação, ao passarem para a próxima linha, precisam continuar visíveis, evitando que textos de tradução compridos comprimam os botões com ícone.

## Restrições do controle remoto Web

A barra lateral do controle remoto Web continua usando apenas o modo de primeiro nível `Project` e não exibe o item de slider `Group`. A razão é que a lista de tarefas remota vem de `listWorkspaces()` / do índice de tarefas replayable e, hoje, não há uma semântica de restauração remota para groups customizados pelo usuário.

O controle remoto mobile mantém a rolagem vertical e a lógica de arraste de altura da área de navegação superior; esta mudança não modifica `clientMode`, `deliveryKind`, task stream, snapshot nem os limites de restauração replayable.

A ordem das sections é uma preferência renderer-local: a janela atual atualiza imediatamente e não é exigido sync em tempo real das outras janelas já abertas; após remontar, o mesmo valor persistido é lido. Os limites completos e os casos de uso estão em `docs/ui/sidebar-purpose-section-order.md`.

## Compatibilidade

- Continua reaproveitando `readSidebarTaskPreferences()` / `persistSidebarTaskPreferences()`.
- Continua compatível com desktop, Web, macOS, Windows, Linux, além de Zai Light / Zai Dark.
- Os textos passam pelas i18n keys existentes; novos textos precisam vir com `en-US` e `zh-CN` ao mesmo tempo.

## Gestos da lista de tasks do controle remoto no celular (2026-10-14)

O `/remote` do celular reutiliza o componente de barra lateral de projetos, e a capacidade de interação é decidida pelo `isWebRemoteControl` da entrada, sem inferir capacidade de desktop pela largura da janela.

- O título do projeto não registra arraste de ordenação (incluindo ordenação por teclado), permitindo rolagem vertical por toque; o clique continua expandindo ou recolhendo. O mesmo vale para os projetos da área de fixados.
- Todas as visões de sessão (projeto, fixados, agrupamento, timeline) não respondem a hover, e o focus produzido pelo toque não alterna a área de operações nem oculta metadados. Um clique abre a sessão.
- O celular mantém as ações permanentes existentes e a capacidade de abrir pelo teclado; o desktop continua com ordenação de projetos, hover de sessão e ações por focus.
- Não muda a identidade da task, a persistência da ordenação, o Host compartilhado nem a cadeia replayable.

```text
entrada do celular → configuração de exibição compartilhada da barra lateral → projeto sem ordenação / sessão com exibição fixa → clique → cadeia de abertura existente
entrada do desktop → configuração de interação padrão → ordenação de projetos / hover + focus na sessão → clique → cadeia de abertura existente
```