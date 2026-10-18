# Herança de Profile do Terminal

O objetivo do terminal embutido do ZCode não é manter uma lista fixa de fontes, mas herdar o profile que já está em vigor no terminal do sistema do usuário. Assim, ao usar oh-my-zsh, oh-my-posh, Nerd Font, proxy do kubectl e configuração de Kube customizada, o terminal embutido fica mais próximo do efeito de abrir diretamente o terminal do sistema.

## Escopo atual

- Ambiente de execução: na inicialização do serviço, captura-se do login shell o PATH, o proxy, KUBECONFIG, locale e as variáveis comuns de toolchain, que depois são mescladas no ambiente dos sub-processos ZCode Agent/terminal.
- Fonte: na criação do terminal, a fonte é resolvida na ordem "override explícito do usuário > configuração do terminal do sistema > stack de fontes fallback do ZCode". A configuração do terminal do sistema hoje cobre Windows Terminal, VS Code, iTerm2, macOS Terminal, Kitty e Alacritty.
- Cores: a cor de fundo do terminal, a cor padrão do texto e a cor do cursor são sempre controladas pelo app theme atual do ZCode; o profile do terminal do sistema só pode complementar detalhes do terminal, como a paleta ANSI e a cor de seleção. Assim, ao herdar um profile do iTerm2 / Terminal no macOS, um fundo escuro não é trazido para a interface clara do ZCode, o cursor não fica invisível por colisão entre a cor de cursor do profile e o fundo atual, e ainda se preserva a familiaridade do usuário com as cores da saída dos comandos.
- Configurações: a página de configurações gerais oferece o toggle "Herdar Profile do Terminal do Sistema" e o campo de override "Fonte do Terminal"; deixar a fonte em branco volta à herança automática.

## Principais módulos

- `packages/services/src/runtime-tools/runtimeCommandEnv.ts`: responsável pela herança do ambiente do login shell.
- `packages/services/src/terminal/terminalProfile.ts`: responsável pela detecção do profile de fonte do terminal, estendida internamente por um registro de detectors para diferentes fontes de terminal.
- `packages/services/src/terminal/terminalService.ts`: retorna o profile de fonte resolvido ao criar o PTY.
- `packages/ui/src/terminal/TerminalSession.tsx`: aplica ao xterm a fonte devolvida pelo servidor e o profile theme restrito.

## Como estender

Ao adicionar uma nova fonte de terminal, como WezTerm, basta acrescentar um `TerminalFontDetector` em `terminalProfile.ts`, implementar `detect(env)` e registrá-lo em `TERMINAL_FONT_DETECTORS`. O fluxo principal não precisa mudar.

iTerm2 e macOS Terminal são detectors best-effort: tentam apenas ler o plist local e, quando a leitura falha, o formato é inválido ou o campo não existe, retornam `null`, seguem para o próximo detector e não afetam a inicialização do terminal.

O detector de profile do macOS pode ler `background` / `foreground` / `cursor` / `cursorAccent`, mas a fase de merge da UI descarta esses campos. A razão é que eles pertencem à fronteira base de legibilidade do tema da janela do ZCode e não devem ser sobrescritos por um profile de terminal do sistema; caso contrário, um bloco de terminal escuro poderia aparecer em um app claro, ou o cursor poderia ficar invisível após colidir com o fundo atual do terminal — o que também seria inconsistente com o comportamento atual do Windows, que herda apenas a fonte.