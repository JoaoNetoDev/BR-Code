# Realce de Busca na Área de Conversa do V4

Este documento registra a semântica de produto e os limites de implementação do realce de busca na área de conversa do
V4. A capacidade cobre dois pontos de entrada:

- o escopo "Conversa" na caixa de busca de tarefas aberta por `Cmd/Ctrl+F`.
- o realce temporário de salto após pesquisar e selecionar um resultado de conversa no Command Center.

## Semântica de produto

- Na primeira versão, o conteúdo pesquisado inclui apenas `userInput.text` e `assistantText.text`; não pesquisa ferramentas,
  raciocínio, marcadores de timeline nem o texto dentro de áreas recolhidas.
- A correspondência é uma busca de texto puro, insensível a maiúsculas/minúsculas, sem suporte a regex; as ocorrências
  dentro de um mesmo nó de texto não se sobrepõem.
- A timeline do V4 usa scroll virtual, e a contagem é baseada no índice de dados das rows projetadas já carregadas; o
  realce visual atua apenas no DOM atualmente montado.
- A busca busca automaticamente histórico mais antigo, mas no máximo até a janela local de `1200` rows projetadas. Ao
  ultrapassar o limite, apenas a contagem do intervalo já carregado é atualizada, sem texto de status adicional.
- Com split view, apenas o pane em foco consome o estado de busca de Cmd/Ctrl+F e reporta a contagem; panes sem foco não
  desenham o realce nem sobrescrevem a contagem global.
- Quando a sessão está em `running` ou `prewarming`, a busca de histórico não é iniciada, os resultados não são reordenados
  em tempo real conforme os deltas de streaming; o recálculo e a restauração do realce ocorrem quando o turno atual
  estabiliza.
- Quando a busca de histórico em segundo plano insere mais resultados antes da ocorrência atual, o realce atual é ancorado
  por `rowId + row kind + índice da ocorrência dentro da row`, sem saltar para outra correspondência.

## Cadeia de estado

```text
Cmd/Ctrl+F
  -> App conversationFindQuery / activeIndex
  -> focused V4 SessionPane
  -> ConversationTimeline 建立数据级 match index
  -> report count / rebased activeIndex
  -> virtualizer.scrollToIndex(unitIndex)
  -> mounted row DOM
  -> CSS Highlight base + active ranges
```

```text
Command Center result
  -> App searchResultHighlightRequest
  -> Shell 按 taskId + workspaceKey 过滤
  -> 目标 focused/primary V4 timeline
  -> snippet/query 定位 match
  -> virtualizer scroll + temporary CSS Highlight
  -> 3000ms 后清理并 onSearchResultHighlightDone(requestId)
```

## Limites de implementação

- Não há novo protocolo entre app e agent; reutiliza-se o `rowsRange` / `loadOlder` existente.
- O CSS usa `--color-find-highlight` e `--color-find-highlight-active`, sem novos tokens de cor.
- Quando a CSS Highlight API não está disponível, mantém-se a contagem e a capacidade de scroll, sem implementar fallback
  com `<mark>`.
- O realce de salto do Command Center não abre a caixa de busca de Cmd/Ctrl+F nem escreve em `conversationFindQuery`.