# Cores dos cards da lista de configurações

Memory, Skills, Commands, Subagents, MCP e Hooks usam o mesmo contrato visual:

- Container da lista: `bg-card`
- Hover da linha: `bg-hover`
- Borda do container: `border-border`

O gerenciamento de plugins instalados usa o mesmo contrato `bg-card + hover:bg-hover + border-border`.

Esse contrato não inclui o marketplace de plugins, Automações, estados vazios nem cards auxiliares dentro de formulários.