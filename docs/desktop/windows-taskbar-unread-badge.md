# Badge de não lidas na barra de tarefas do Windows (taskbar overlay badge)

## Contexto

Na conclusão de uma tarefa, o Desktop emite um aviso sonoro, mas o usuário acabada perdendo-o quando está ouvindo música ou focado em outra coisa. É preciso exibir um contador no ícone do aplicativo na barra de tarefas (semelhante ao badge do Dock do macOS), para que "quantas sessões concluídas ainda não foram vistas" fique visível de imediato.

O caminho de badge de não lidas em nível de aplicação já existe (renderizador contabiliza → IPC → processo principal agrega → `app.setBadgeCount`) e já funciona no macOS / Linux; no Windows, como o `app.setBadgeCount` do Electron é um no-op nessa plataforma, a primeira fase manteve o no-op de propósito (ver os comentários originais e os casos de teste em `unreadBadge.ts`). Este documento é a spec da segunda fase, que completa o suporte no Windows.

## Semântica do badge

- O número do badge = **a quantidade de tarefas concluídas que o usuário ainda não abriu para ver** ("tarefas não lidas"). São os **mesmos dados autoritativos** do ponto azul no painel lateral: o ProjectTree retornado por `projectService.readTree()` do host (`unread_at` do SQLite tasks-index), contando apenas **os projetos realmente renderizados no painel lateral**: são excluídas as tarefas de projetos removidos de forma lógica e as tarefas órfãs (projectId sem projeto correspondente) — elas não têm onde ancorar o ponto azul e contá-las só geraria um lembrete fantasma de "badge sem ponto azul". O filtro e a deduplicação estão em `countProjectTreeUnreadTasks` (project-sidebar/view.ts).
- Quando o usuário abre uma tarefa, o número diminui em um; ao chegar a zero, o badge desaparece. Não é o total histórico de tarefas concluídas.
- Lição aprendida: na primeira fase a contagem lia o `workspace.taskListCache` do session store do renderizador, mas esse cache só carrega a lista do workspace ativo — o ponto azul do workspace em segundo plano ficava aceso e o badge mostrava 0. Esse caminho foi descontinuado (`lib/unreadTaskCount.ts` removido) e o ponto de sincronização foi movido para o `ProjectSidebar` (a árvore autoritativa está no context do `ProjectDirectoryProvider`, o Root não a acessa).

## Cadeia unificada entre plataformas

```
[Host] projectService.readTree() → ProjectTree.tasks[].unreadAt (autoridade: SQLite tasks-index)
    │  ProjectSidebar (árvore autoritativa no context do ProjectDirectoryProvider)
    │  countProjectTreeUnreadTasks(tree)                   project-sidebar/view.ts
    ▼
usePlatform().syncWindowUnreadCount(count)                 IPC: zcode:sync-window-unread-count
    │  (no-op no web; só dispara na atualização da árvore, e não envia pacote se a contagem não mudou)
    ▼
[Main] desktopMainIpcPlatform.ts → handleWindowUnreadCountSync
    │  windowUnreadCountMap (contagem por janela; limpa ao fechar a janela)
    ▼
syncApplicationUnreadBadge(map)                     desktopWindowLifecycle.ts
    │
    ├─ darwin / linux → app.setBadgeCount(total)            (comportamento existente)
    └─ win32         → para cada BrowserWindow, chama setOverlayIcon + ponto vermelho na bandeja (novo neste documento)
```

A cadeia de contagem e sincronização é compartilhada nas três plataformas; apenas no processo principal, na "última milha", a implementação diverge por plataforma.

## Implementação no Windows

No Windows, o Electron suporta badge na barra de tarefas por meio de `BrowserWindow.setOverlayIcon(image, description)` (Shell `ITaskbarList3::SetOverlayIcon`). Diferente de `setBadgeCount`, o **overlay não é responsável por renderizar o número**: o emblema precisa ser desenhado à mão.

- **Posição**: o overlay é desenhado pelo sistema de forma fixa no canto inferior direito do botão da barra de tarefas (o mesmo mecanismo do escudo de atualização do Windows e do status de sincronização do Outlook); a API não tem parâmetro de posição, então não é possível reproduzir o efeito no canto superior direito; o canto superior direito só é viável no badge da bandeja (com desenho próprio, sob controle).
- **Aparência**: o overlay da barra de tarefas é exibido pelo Windows em um tamanho fixo, com representações `NativeImage` nativas 1x (16×16) e 2x (32×32), em vez de entregar ao Shell um círculo de 32px de borda dura para ele redimensionar às cegas. O ponto é vermelho puro, sem contorno, com antisserrilhamento por supersampling 4×, com diâmetro lógico de cerca de 7px. No mesmo instalador, o círculo do canvas é escolhido automaticamente conforme o build do sistema: no Win10 (build < 22000) ele é ancorado no canto inferior direito dentro do canvas, compensando o ponto de chegada do overlay na barra de tarefas antiga; no Win11 (build ≥ 22000) ele é centralizado dentro do canvas, evitando um segundo deslocamento quando o Shell já o posicionou no canto do ícone. A description de acessibilidade continua carregando a quantidade exata (por exemplo, "3 unread tasks").
- **Badge da bandeja**: a bandeja (`Tray`) do Windows/Linux compõe um ponto vermelho puro (sem número) em um recorte arredondado no canto superior direito do ícone do aplicativo. O tamanho é independente do da barra de tarefas, mantido em cerca de 8px; igualmente oferece representações nativas 1x (16px) e 2x (32px) com antisserrilhamento por supersampling 4×, resolvendo o desfoque de uma imagem composta de 32px de borda dura redimensionada pelo Shell. Quando a contagem muda, `tray.setImage` troca a imagem; ao zerar, o ícone original multirresolução é restaurado; o macOS não tem bandeja (a plataforma retorna null) e o badge do Dock assume esse papel.
- **Múltiplas janelas**: todas as janelas exibem o total global de não lidas (consistente com o Dock do macOS mostrar o total em nível de aplicação, o que combina com a intuição de "mostrar quantas sessões foram concluídas"). Janelas sem botão na barra de tarefas (indicador CUA, janela de status de atualização e outras janelas com skipTaskbar) não têm efeito colateral ao definirem o overlay, por isso não são excluídas separadamente.
- **Zeragem**: com `count = 0`, a barra de tarefas recebe image `null` para remover o badge e a bandeja restaura a imagem original.
- **Desempenho**: o badge só muda em eventos de "tarefa concluída / usuário vê a tarefa", com frequência de atualização por evento; a imagem do emblema é cacheada em memória por label, então uma atualização é uma consulta de tabela + uma chamada ao Shell / uma troca de imagem na bandeja.
- **Acessibilidade**: a `description` do overlay recebe uma descrição estática em inglês (o processo principal não tem pipeline de i18n; a v1 não faz localização).

## Matriz de plataformas

| Plataforma             | Mecanismo                                                 | Status                          |
| ---------------------- | --------------------------------------------------------- | ------------------------------- |
| macOS                  | `app.setBadgeCount` (número vermelho no Dock)              | Em produção, sem mudanças       |
| Linux (Unity/KDE etc.) | `app.setBadgeCount` (D-Bus do LauncherEntry) + badge da bandeja | Em produção; badge da bandeja é novo neste documento |
| Linux (GNOME nativo)   | Sistema não tem API de badge                              | Badge da bandeja como fallback (novo neste documento) |
| Windows                | `BrowserWindow.setOverlayIcon` + badge da bandeja          | Novo neste documento            |

## Testes e verificação

- Testes unitários: parsing do label (0/1~9/10+), dimensões/margens de renderização de pixel e cor de pixels-chave (incluindo o modo de ponto vermelho sem número), mistura de alpha pré-multiplicado, troca de imagem da bandeja (composição do ponto vermelho, restauração da imagem original ao zerar, no-op sem bandeja), chamada de `setOverlayIcon` no ramo win32 (incluindo passar null ao zerar, múltiplas janelas, pular janelas já destruídas) e o ramo darwin/linux ainda passando por `setBadgeCount`.
- Aceitação manual (Windows): concluir uma tarefa → o badge aparece no canto inferior direito do ícone da barra de tarefas com a contagem, e um pequeno emblema aparece no canto superior direito do ícone da bandeja; abrir a tarefa → ambos diminuem; ler tudo → somem/ restauram a imagem original; múltiplas janelas exibem o mesmo total.
- E2E: o overlay da barra de tarefas e a imagem da bandeja são renderizados pelo OS Shell, o que o WebDriverIO não consegue afirmar; a cobertura fica por testes unitários + aceitação manual (registro da aceitação na descrição da MR).

## Limites e restrições conhecidas

- Quando a janela é minimizada na barra de tarefas, o overlay continua visível (cenário deste requisito); se no futuro houver suporte a "fechar para a bandeja", o overlay não fica visível depois de ocultado e seria preciso sinalizar isso no ícone da bandeja.
- O controle remoto Web pelo celular não tem o conceito de barra de tarefas, portanto não se aplica; a contagem de badges do Desktop inclui as tarefas não lidas do workspace remoto (o mesmo renderer store).
