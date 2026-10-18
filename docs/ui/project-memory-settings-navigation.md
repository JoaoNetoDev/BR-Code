# Navegação em camadas do Project Memory nas Settings

## Resumo do problema

O viewer de Project Memory das Settings precisa ver os arquivos de Memory correspondentes por Workspace Scope e conseguir abrir o arquivo real diretamente com o editor escolhido pelo usuário.

O Memory reaproveita a interação de Scope das configurações de capacidade, mas oferece apenas o Workspace Scope, sem User Scope:

```text
Workspace Memory 开关
  └─ Workspace Scope + 当前记忆数量 + 刷新
       └─ 当前 Workspace 的全部 Memory 文件
            └─ 编辑器按钮打开真实文件
```

## Contrato de produto

### Workspace Scope e lista de arquivos

- O cartão do interruptor 「工作区记忆」 fica sempre visível acima da barra de ferramentas de Scope; ele é o ajuste de entrada da functionality de Memory.
- O cartão do interruptor usa uma descrição única e enxuta: 「在工作区中保存并复用长期上下文，新会话生效。开启后可能增加模型调用和 Token 成本。」, sem repetir em separado o parágrafo de aviso de custo.
- Depois que o catalog termina de carregar, o primeiro Workspace é selecionado por padrão; o menu de Scope lista apenas os Workspaces que têm Memory catalog e não mostra a opção User. O nome do projeto prioriza os nomes reais já presentes nos Workspaces abertos pelo app e no registro de Workspaces recentes, preservando a capitalização e os caracteres originais.
- O menu de Scope respeita a ordem de uso recente de `settings.json.recentProjects`; os Memory Workspaces que podem ser casados pelo nome do diretório do projeto são ordenados primeiro por essa ordem, e o Memory histórico não casado mantém a ordem original do catalog e é acrescentado ao final. Um Workspace atualmente aberto mas ainda não gravado em `recentProjects` apenas complementa o nome e fica no fim, sem sobrescrever a ordem do settings.
- A barra de ferramentas de Scope reaproveita o botão, a largura de menu, o ícone de Workspace e o estado selecionado do MCP; à esquerda são exibidos, em ordem, o Scope, o separador e a quantidade de Memory do Workspace atual, e à direita a busca por nome de arquivo; à direita do título do grupo `文件` fica a entrada de refresh.
- Ao trocar o Scope, a lista de arquivos abaixo é substituída diretamente, sem passar por uma lista de projetos ou por uma navegação secundária de breadcrumb. O Scope expressa o escopo de vigência do Memory sobre o projeto e não sua localização física; embaixo ele ainda pode ficar armazenado no User Home.
- A busca filtra apenas o nome de arquivo do Scope atual e ignora maiúsculas/minúsculas; a consulta é preservada ao trocar de Workspace. Sem resultado, o título do grupo `文件` e a lista são ocultados e o estado vazio de busca unificado é exibido.
- O visual da lista é consistente com as listas de recursos MCP, Skills e Hooks da página de Settings: o título do grupo `文件` usa a altura unificada `h-7`; o contêiner da lista não tem borda externa, usa `bg-surface`, e cada linha é separada por um elemento divisor próprio `bg-border/50`.
- O ícone de arquivo usa um contêiner de ícone `size-9`, `rounded-xl`, `bg-background`; o hover da linha usa `bg-hover`.
- A contagem inclui todos os arquivos `.md` retornados pelo catalog nesse diretório de projeto, incluindo `MEMORY.md`.
- O projeto continua usando a ordem do service por data de última modificação, em ordem decrescente, sem reordenar na UI.

### Lista de arquivos de Memory

- A lista exibe em forma plana todos os arquivos retornados pelo catalog; `MEMORY.md` é um item comum e deixa de ser um nó pai virtual.
- Cada arquivo reaproveita o `FileDisplayIcon` e mostra o ícone do tipo de arquivo conforme a extensão; a linha do arquivo exibe apenas informações e não lê nem expande o corpo em Markdown.
- O centro da linha do arquivo mostra, em duas linhas, o nome do arquivo e a hora de atualização: o nome usa a fonte da UI, `font-medium` como texto principal, e a atualização usa texto secundário de tamanho menor; à direita permanece um menu segmentado de editor independente.
- O título do grupo de arquivos de Memory usa a altura unificada `h-7`; a lista de arquivos usa um contêiner `bg-surface` sem borda com elementos divisores próprios.
- À direita de cada linha de arquivo, o `WorkspaceEditorButtonGroup` da barra de ferramentas superior é reaproveitado: o botão principal mostra o ícone do editor atual e abre o arquivo diretamente, e a seta para baixo serve para escolher outro editor.
- A linha do arquivo não mostra seta de expansão e não possui estado de expansão; o botão e o corpo da linha mantêm interações independentes.
- O corpo da linha do arquivo não é um botão expansível; apenas o grupo de botões de editor nativo à direita é operável. O botão principal abre o arquivo real com o editor atual, e o menu de setas troca o editor.

### Contrato de rolagem

- Assim como nas listas/detalhes de Plugin das Settings, a rolagem vertical é uniformemente assumida pela área principal de conteúdo das Settings, e o viewer de Memory não trava a rolagem externa.
- A barra de ferramentas de Memory e a lista de arquivos participam da mesma cadeia de rolagem da página.
- Nenhuma segunda barra de rolagem vertical é criada dentro do viewer, e não se usa um cabeçalho de cartão fixo.

### Refresh

- A barra de ferramentas de Scope mantém uma entrada explícita de refresh.
- Após o refresh, se o Workspace atual ainda existir, a seleção é mantida; se o Workspace atual desaparecer, um novo primeiro item é selecionado automaticamente.

### Estados vazio e de carregamento

- O aviso de catalog loading, o de "nenhuma memória salva" e o de "visível apenas localmente" usam uniformemente um contêiner de aviso com fundo transparente, `rounded-xl border border-dashed border-border`; quando a funcionalidade está desligada, apenas o cartão do interruptor acima é exibido e nenhum contêiner de aviso adicional é renderizado.
- O estado vazio não fabrica um Workspace Scope, não oferece entrada de criação e não altera as fontes de dados de Memory existentes.

## Estado e eventos

```text
memories(workspaceId)
  ├─ selectScope(nextWorkspaceId) ─────────> memories(nextWorkspaceId)
  ├─ open(file, editor) ───────────────────> external editor
  └─ refresh
       ├─ workspace exists ────────────────> memories(workspaceId)
       └─ workspace missing ───────────────> memories(firstWorkspaceId)
```

A escolha de Scope da UI existe apenas enquanto `MemorySettingsSection` está montado e não é gravada em setting, localStorage, Host, Runtime ou catalog service.

## Limites de plataforma e arquitetura

- As Settings do Desktop continuam lendo o profile local atual sempre por meio do Base Host local.
- A resolução do diretório de Memory e o `stat` antes da abertura também usam fixamente o Base Host local; quando o workspace ativo for SSH, WSL ou Docker, o caminho de Memory local não pode ser entregue ao Host remoto.
- O catalog retorna o caminho absoluto real de cada arquivo; o botão de arquivo entrega esse caminho ao `IPlatformService.openInEditor` já existente, e o Renderer não monta o caminho por conta própria.
- Web Remote / Mobile continuam mostrando apenas o interruptor e o aviso 「前往本地桌面端查看」, sem chamar o catalog.
- Não se agrega Memory de SSH, WSL, Docker, custom-agent ou external storage.
- Não se modifica a persistência app-global de `memoryEnabled` nem a semântica de session materialization.
- Não se adiciona capacidade de protocolo, watcher, polling, leitura inline, exclusão, busca ou exportação.

## Responsividade e acessibilidade

- As larguras de Desktop e de celular usam a mesma semântica de Scope e de lista de arquivos, e a arquitetura da informação não muda por breakpoint.
- O Scope usa a semântica de teclado de menu nativo; a linha de arquivo de Memory é um contêiner de informação estática e o grupo de botões de editor usa a semântica de teclado de botão nativo.
- Os ícones Folder/FileText apenas ajudam na identificação; o nome do Workspace e o nome do arquivo continuam sendo o principal dos nomes acessíveis.
- Nomes longos de Workspace e de arquivo podem ser truncados, sem Tooltip.
- Todos os textos usam i18n, e todas as cores, tamanhos de fonte, espaçamentos e raios usam os tokens semânticos de `DESIGN.md`.

## Casos de aceitação

| ID    | Setup                           | Action           | Assertions                                                                                     |
| ----- | ------------------------------- | ---------------- | ---------------------------------------------------------------------------------------------- |
| PMN01 | Desktop, Memory ligado, dois projetos | catalog ready | O interruptor fica acima; o Scope tem o primeiro item por padrão e sem User; a barra mostra a contagem; abaixo os arquivos do Workspace atual são exibidos diretamente |
| PMN02 | O menu de Scope contém vários Workspaces | Trocar de Workspace | A lista de arquivos é substituída pelo conteúdo do Workspace alvo, sem lista de projetos nem breadcrumb |
| PMN03 | Lista de arquivos do Workspace atual | Ver e usar a linha do arquivo | Ícone de tipo, nome, hora de atualização e menu segmentado de editor à direita corretos; o botão principal abre o caminho real e a seta escolhe outro editor |
| PMN04 | Workspace não inicial selecionado | Refresh explícito | A seleção é mantida se o Workspace ainda existir e o novo primeiro item é escolhido se tiver desaparecido |
| PMN05 | catalog loading, empty ou error | Carregar, tentar de novo | loading/empty usam o contêiner tracejado e transparente unificado; o erro mantém feedback claro e a entrada explícita de refresh |
| PMN06 | Web Remote / Mobile | Abrir Memory | Mostra apenas o interruptor e o aviso de consulta local, com zero chamadas ao catalog |
| PMN07 | Lista de arquivos maior que a viewport | Rolar | Apenas a área principal de conteúdo das Settings rola verticalmente |

## Poda

- Não se enumeram combinações de mensagens de Runtime, provider, desktop continuous e mobile replayable: esta mudança não dispara Runtime nem protocolo, e o isolamento é provado apenas pelo invariante de zero chamadas.
- Não se adicionam classes de equivalência de sistema de arquivos no service: containment de diretório, symlink, exclusão concorrente, atualização atômica e o limite de 5 MiB continuam cobertos por `memoryService.test.ts`.
- Não se mantêm os casos antigos de selector, árvore virtual, colapso e roving-focus: essas interações saem do contrato de produto e são substituídas pela semântica de teclado de uma lista de botões nativos.