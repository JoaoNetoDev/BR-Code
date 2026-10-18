# Menu da Barra de Título do Windows

## Objetivo

Habilitar no cliente desktop do Windows um menu superior desenhado pela própria aplicação, colocando as ações comuns de `File / View / Help` na barra superior do workspace, enquanto preserva os botões de controle da janela do sistema.

## Implementação

- A janela principal no Windows passa a usar `titleBarStyle: "hidden" + titleBarOverlay`, mantendo `backgroundMaterial: "acrylic"`.
- O processo principal ganha um ponto de entrada único de comando `executeDesktopCommand`; o menu nativo do aplicativo e o menu superior do renderer passam a compartilhar a mesma implementação de ações.
- A UI renderiza `WindowsCaptionMenuButton` condicionalmente em `WorkspaceHeader` para desktop Windows/Linux, chamando os comandos do processo principal via `IPlatformService.executeDesktopCommand()`.
- O estado de rascunho de nova tarefa não renderiza o `WorkspaceHeader` completo, mas o desktop Windows/Linux ainda precisa manter o botão de alternância do Terminal e o botão de menu combinado no canto superior direito. A UI renderiza na área de título externa ao shell, em sequência, a entrada compartilhada do Terminal e o `WindowsCaptionMenuButton`; restaura apenas as entradas de nível de janela do desktop, sem restaurar o caminho do workspace,branch e conteúdos de header relacionados a task. O botão de menu combinado no estado de rascunho do Windows mantém o mesmo tamanho, cantos retos e estilo de hover da entrada de session task header, mas remove a borda esquerda, e a camada externa não desenha `bg-background-win-alt` nem `border-b border-border`, evitando um bloco de cor isolado na área de título transparente.
- No Linux, o estado de rascunho de nova tarefa mantém na camada externa do menu combinado o estilo de surface da barra de título do Linux, com `rounded-bl-xl` no canto inferior esquerdo, formando o mesmo nível hierárquico da área de botões de janela desenhados à direita.
- No desktop, o estado de rascunho de nova tarefa não renderiza o `WorkspaceHeader` completo, mas renderiza um `<header class="h-10 [app-region:drag]">` leve na mesma posição de layout, como área de arraste da barra de título. Esse header participa do layout vertical do conteúdo principal, evitando cobrir o ChatView com overlay absoluto, e ainda fica abaixo do nível de clique do menu de janela do canto superior direito.
- O item de menu "Verificar atualizações" assina `IPlatformService.onUpdateStateChanged()` e, quando o menu é aberto, busca ativamente o estado atual via `IPlatformService.getUpdateState()`. O estado do `electron-updater` no processo principal é sincronizado continuamente com o renderer por `PlatformChannels.UpdateStateChanged`, portanto o menu desenhado no Windows pode exibir verificação, progresso de download e estado reiniciável para instalar, assim como o menu nativo do macOS.

## Itens de menu atuais

- Menu combinado: New task, Open Workspace, Open in File Explorer, About ZCode, Check for Updates (exibe status e percentual durante verificação/download), Feedback, Community (quando houver entrada disponível), Export Logs, Toggle Developer Tools (em dev), Resource Manager (gerenciador de recursos, em dev), Close Window

## Borda externa do workspace no Windows

### Semântica de produto

O formato da janela do sistema é determinado pelo Windows/DWM; o renderer cuida apenas do painel de conteúdo do workspace. Os dois não podem ser tratados como iguais apenas com
`isWindowsDesktop`, caso contrário o Windows 10 e o Windows 11, e janelas normais e maximizadas, se contaminariam.

| Estado do sistema e da janela | Formato da janela do sistema | Painel de conteúdo do workspace |
| --- | --- | --- |
| Janela normal no Windows 11 | Cantos arredondados nativos do DWM | Mantém cantos arredondados e a borda sutil completa |
| Maximizado no Windows 11 | Borda externa do DWM fica reta | O painel de conteúdo também passa a ter cantos retos; remove as bordas superior, direita e inferior que encostam na borda externa da janela, mantendo apenas a divisória esquerda |
| Normal/maximizado no Windows 10 | Cantos retos nativos do sistema | Altera para retos apenas os dois cantos à direita que encostam na borda externa do sistema; mantém a borda sutil completa existente e o canto arredondado interno esquerdo |
| Capacidade do Windows desconhecida/falha de IPC | Ainda não confirmada | Mantém os cantos arredondados e a borda sutil completa de antes da alteração, sem interpretar estado desconhecido como Windows 10 |
| macOS, Linux, Web, Web no celular | Fora do escopo deste recurso | Mantém os estilos existentes e as sobrescritas responsivas |

O build do Windows `>= 22000` é o limite de capacidade de cantos arredondados nativos do Windows 11. O build e o estado de maximização são lidos pelo
processo principal do Electron e injetados na UI pelo preload e pela `IPlatformService`; a UI não lê Node nem
`window.zcode` diretamente.

Quando maximizado no Windows 11, o painel de conteúdo do workspace no renderer e o contorno externo do DWM unificam o uso de cantos retos. Este recurso não altera a forma da janela do sistema por
falsas maximizações, window shape ou modificação dos limites da work area.

### Cadeia de estados

```text
Windows build ───────────────┐
                             v
BrowserWindow maximize/unmaximize -> main calcula o estado visual da janela
                                      |
                                      v
                         preload IPC consulta + evento de estado
                                      |
                                      v
                           IPlatformService（desktop）
                                      |
                                      v
                           useAppChromeState（UI）
                                      |
                                      v
                     WorkspaceShellLayout 样式矩阵

Web / 手机 Web -> IPlatformService fallback -> 不进入 Windows 样式分支
```

### Superfície de impacto e invariantes

- Impacto direto: estado da janela do main do desktop, preload do desktop, interface de plataforma compartilhada, estilos da borda externa do shell do workspace.
- Deve ser verificado: as quatro combinações Windows 10/11 × normal/maximizada, além do caminho de inicialização em que a janela é carregada já maximizada.
- Não afeta: comandos dos botões da barra de título, Agent/session, fluxo de mensagens contínuas do desktop, cadeia de recuperação do remote replayable no celular.
- Nenhuma nova persistência: o estado de maximização é mantido em tempo real pelo `BrowserWindow`; o renderer consulta uma vez e assina as mudanças.
- O snap de tela do Windows e a tela cheia do sistema não são equivalentes a `BrowserWindow.isMaximized()`; aqui mantemos o estilo de janela normal e
  não declaramos alterar o contorno do DWM nesses estados.

### Casos de aceitação

1. Uma janela normal no Windows 11 continua exibindo os cantos arredondados nativos da janela, e o painel de conteúdo mantém os cantos arredondados e a borda sutil atuais.
2. Após maximizar no Windows 11, os quatro cantos do painel de conteúdo ficam retos, e nenhuma borda extra superior, direita ou inferior aparece na borda externa da janela.
3. Ao alternar entre maximizado e restaurado no Windows 11, os estilos acompanham imediatamente, sem necessidade de recarregar.
4. No Windows 10, tanto normal quanto maximizado não simulam os cantos externos direitos arredondados, mantendo as bordas sutis originais superior, direita e inferior.
5. Quando a consulta de capacidade da janela falha ou o bridge está indisponível, mantém-se o estilo anterior à alteração, sem oscilar para o estilo do Windows 10.
6. Os layouts e estilos responsivos existentes do macOS, Linux, Web e Web no celular permanecem inalterados.