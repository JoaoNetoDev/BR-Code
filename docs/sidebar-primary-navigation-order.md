# Sidebar Primary Navigation Order

## Contexto

A navegação principal no topo do `WorkspaceSidebar` abriga a criação de nova tarefa, a busca do Command Center, as automações e a entrada de configurações de Plugins. A entrada de automações é uma capacidade do tipo tarefa vista com frequência pelo usuário e, nos terminais que a suportam, deve ficar logo ao lado de Search; a entrada de Plugins fica fixa abaixo das automações. O `/remote` em celular não abriga Automations e mantém apenas a entrada de Plugins.

## Especificação

A ordem fixa da navegação principal no topo do desktop e da Web comum é:

```text
New Task
  |
  v
Search / Command Center
  |
  v
Automations / 自动化
  |
  v
Plugins / 插件（定位到 `plugins` 设置分区）
  |
  v
Workspace task view switcher
```

A ordem da navegação principal no topo do `/remote` em celular é:

```text
New Task
  |
  v
Search / Command Center
  |
  v
Plugins / 插件（定位到 `plugins` 设置分区）
  |
  v
Workspace task view switcher
```

O estilo visual das entradas, os tokens de tema e as dimensões dos botões são mantidos consistentes com os botões de navegação principal já existentes no `WorkspaceSidebar`.