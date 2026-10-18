# Largura de traço unificada do lucide em `packages/ui`

`packages/ui` importa ícones diretamente de `lucide-react` e injeta a largura de traço padrão de forma unificada na raiz da aplicação usando o `LucideProvider` oficial.

Valor padrão atual:

- `DEFAULT_LUCIDE_STROKE_WIDTH = 1.5`

Convenções:

- `packages/ui/src/Root.tsx` é responsável por injetar o valor padrão com `LucideProvider`, mantendo a espessura das linhas consistente em toda a UI.
- Se um ícone específico tiver uma necessidade visual especial, ainda é possível passar explicitamente `strokeWidth` para sobrescrever o padrão.
- Ao adicionar novos ícones, importar diretamente de `lucide-react`, sem manter mais wrappers de encaminhamento de ícones dentro do projeto.
- Os ícones de janela customizados pelo usuário ficam em `components/icons/windowIcons.ts`, são criados com o `createLucideIcon` oficial e herdam `currentColor` e a largura de traço global; os gráficos de maximizar/restaurar reutilizam os caminhos SVG fornecidos e não incluem a placa de fundo branca.
- Os ícones de janela usam viewBox de 24×24, com os gráficos contidos na faixa de coordenadas 5–19; a camada frontal do ícone de restaurar é um retângulo arredondado 10×10 com origem em `(5, 9)`. O tamanho do botão não é ajustado ao caminho do gráfico.