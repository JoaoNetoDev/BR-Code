# Estado vazio da página de configurações

Os estados vazios da página de configurações usam de forma unificada fundo transparente e borda tracejada, evitando que o conteúdo vazio fique no mesmo nível hierárquico de cartões de recursos reais.

## Especificação visual

- O contêiner do estado vazio usa uniformemente `border-dashed border-border`, sem definir `bg-card`, `bg-surface` ou `bg-background`.
- O estado vazio das listas de recursos mantém o layout compacto, usando `rounded-xl px-4 py-3` e texto corporal secundário.
- Estados vazios que precisam orientar a criação podem manter título, descrição e botão de ação, usando um espaçamento vertical maior.
- Estados vazios de gráficos de dados podem manter o layout centralizado, mas seguem as mesmas regras de borda tracejada e fundo transparente.
- Estados vazios não recebem ícones decorativos; ícones são usados apenas em itens de recursos reais ou em ações com semântica clara.
- Carregamento, erro, limitação de capacidade e workspace não selecionado são estados independentes e não seguem a especificação visual de estado vazio.

## Escopo de aplicação

 Atualmente cobre os estados vazios de plugins, skills, subagentes, automações, MCP, comandos, Hooks e estatísticas de uso na página de configurações.