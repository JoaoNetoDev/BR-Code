# Visualização do Feature Boundary Graph

## Objetivo

Oferecer em `@zcode/dev-docs` uma visão legível do grafo semântico de `feature-boundary-planner`, substituindo a exibição de imagens grandes na área de conversa. A página lê diretamente `.agents/skills/feature-boundary-planner/references/zcode-feature-graph.yaml`, permitindo que o desenvolvedor rastreie, a partir de um nó de capacidade, as entradas de UI, o owner de estado, os serviços, a persistência e os limites de entrega.

## Limites de produto

- O grafo tem o YAML como única fonte de dados; a página faz o parse do YAML no build e não mantém uma segunda cópia escrita à mão das relações entre nós.
- Exibe por padrão o grafo semântico completo, com suporte a localizar nós por palavra-chave, estreitar as conexões por nível de relação e preservar zoom, pan e ajuste de visão do canvas.
- Ao selecionar um nó, apenas os vizinhos de primeira ordem são destacados, e a barra de detalhes mostra tipo do nó, ID, aliases, documentação, seeds de código, invariantes e relações diretas.
- Endpoints referenciados no YAML mas não declarados em `nodes` aparecem como "endpoint não declarado", sem completar automaticamente semântica de produto.
- A página é somente leitura, não modifica o YAML e não interpreta a alcançabilidade estática como novas dependências de produto.

## Restrições de implementação

- Usar o `@xyflow/react` já existente e os theme tokens do dev-docs, compatível com temas claro/escuro e layout de tela estreita.
- Exibir um estado de erro claro quando o carregamento do grafo falhar; o layout é calculado em segundo plano e a primeira tela mostra estado de carregamento.
- A interação de nós e detalhes precisa suportar operação por teclado; o estado de seleção é exposto via `aria-live`.
- Relações e tipos de nó usam combinações estáveis de cor/texto, não dependendo apenas de cor para transmitir significado.

## Evidências de verificação

- Testes unitários validam a contagem de nós/arestas após o parse do YAML, a preservação de endpoints não declarados e o cálculo de vizinhos diretos.
- O typecheck, lint, teste unitário e production build de `@zcode/dev-docs` devem passar.