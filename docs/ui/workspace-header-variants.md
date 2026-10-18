# Variantes do Workspace Header

## Objetivo

No desktop, o rascunho de New Task e uma Task existente usam o mesmo componente `WorkspaceHeader` e o mesmo layout de
barra de título, evitando manter uma segunda versão leve de header para o estado de rascunho, que faria as entradas de
ação, a área segura dos controles de janela e o comportamento de arraste divergirem gradualmente.

## Modelo de estados

```text
activeTaskId = null                       activeTaskId != null
        │                                        │
        ▼                                        ▼
WorkspaceHeader variant="draft"  ─────▶  WorkspaceHeader variant="task"
        │              primeira submissão cria a task        │
        └──────────── mesma instância de componente / mesmo esqueleto de layout ─────┘
```

- `variant="draft"`: mantém a altura do Header, a área de arraste, Help, Terminal, Side Pane e o menu de caption da
  plataforma; não exibe o título da tarefa à esquerda, o seletor de editor, os contextos de workspace/branch que
  dependem de uma task estável, o menu de mais ações da Task, logs, renomear, arquivar etc. Quando o Side Pane está
  recolhido, a linha divisória inferior do Header fica transparente; quando expandido, volta-se à divisória padrão.
- `variant="task"`: exibe o título completo da Task, o contexto de workspace/branch e as ações da Task.
- O arraste de arquivos no topo do Draft reaproveita o drop target controller exposto pelo Composer principal; a máscara
  aparece apenas dentro do Header e nenhuma segunda entrada de anexos é registrada.
- A fronteira de erro do Header é reiniciada somente por workspace; o Header não pode ser recriado por causa de uma
  mudança na reset key quando o primeiro envio do Draft obtém `activeTaskId`.

## Limites multiplataforma

- No desktop, tanto workspace local quanto remoto usam o modelo de variantes acima e continuam se adaptando a macOS,
  Windows, Linux e aos dois temas.
- O controle remoto Web no celular mantém o overlay de side pane existente e os limites de restauração replayable; sem
  active task, não renderiza a barra de título do desktop adicionalmente nem cria um runtime de Agent separado.

## Aceitação

- a página de New Task possui `WorkspaceHeader[data-workspace-header-variant="draft"]`, e o botão do Side Pane pode
  expandir/recolher as tabs existentes.
- o Header do Draft não exibe o título da tarefa, o seletor de editor, o menu de mais ações da Task nem o contexto de
  workspace/branch; com o Side Pane recolhido a linha divisória inferior fica transparente e, expandido, aparece a
  divisória padrão.
- após o primeiro envio entrar na Task, o mesmo Header muda para `variant="task"` e a altura da barra de título e a
  posição das ações compartilhadas à direita não saltam.
- testes unitários cobrem a propagação da variante e o corte de conteúdo do Draft; E2E desktop cobre o Header do Draft
  e a interação com o Side Pane.
