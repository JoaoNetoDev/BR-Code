# Settings Search Input

As caixas de busca de Skills, Hooks, Commands, MCP, Subagents e do marketplace de plugins na página de configurações reutilizam uniformemente o `SettingsSearchInput`:

- `Input size="lg"`
- Altura `h-9`
- Cantos arredondados `rounded-xl`
- Ícone de busca à esquerda com `size-4`
- Espaçamento à esquerda do conteúdo digitado `pl-9`
- Cores, borda e estados de Hover e Focus herdados do `Input` padrão

A página só pode controlar largura e layout por meio de classes no container, sem sobrescrever os estilos geométricos acima.

Os filtros de estado à direita das caixas de busca de Skills e Subagents usam o mesmo `h-9 rounded-xl`, mantendo o contorno consistente dos controles da mesma linha.