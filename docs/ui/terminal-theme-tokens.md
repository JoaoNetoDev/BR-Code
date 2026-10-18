# Terminal Theme Tokens

O tema do xterm em `packages/ui/src/Terminal.tsx` agora lê uniformemente os tokens específicos de terminal a partir de `packages/ui/src/styles.css`.

Tokens atualmente integrados:

- `--color-terminal-bg`
- `--color-terminal-fg`
- `--color-terminal-cursor`
- `--color-terminal-cursor-accent`
- `--color-terminal-selection`
- `--color-terminal-selection-inactive`
- `--color-terminal-black`
- `--color-terminal-red`
- `--color-terminal-green`
- `--color-terminal-yellow`
- `--color-terminal-blue`
- `--color-terminal-magenta`
- `--color-terminal-cyan`
- `--color-terminal-white`
- `--color-terminal-bright-black`
- `--color-terminal-bright-red`
- `--color-terminal-bright-green`
- `--color-terminal-bright-yellow`
- `--color-terminal-bright-blue`
- `--color-terminal-bright-magenta`
- `--color-terminal-bright-cyan`
- `--color-terminal-bright-white`

Como ajustar:

1. Modificar o token correspondente no `@theme` claro e no `.dark` escuro de `packages/ui/src/styles.css`.
2. `Terminal` relê os tokens na troca de tema e atualiza as cores do xterm em tempo real.

Restrições de design:

- O fundo do terminal e a cor inversa do cursor em Zai Light devem seguir `--color-background`, evitando que a área do terminal fique desconectada do fundo do workspace por causa de um branco puro fixo. O texto padrão, as cores ANSI e a cor de seleção continuam ajustados separadamente pelos terminal tokens, garantindo a legibilidade da saída dos comandos.
- A cor de seleção prioriza uma mistura de baixa opacidade da cor da marca, evitando que fique pesada tanto nos temas claros quanto nos escuros.
- As 16 cores ANSI são mapeadas primeiro para o sistema de cores semânticas existente e para a escala neutral, sem introduzir valores de cor avulsos.