# Renderização Mermaid

## Escopo

- fenced code blocks marcados como `mermaid` / `mmd` em mensagens de chat, pré-visualização de Markdown e saída de
  ferramentas são renderizados como diagramas Mermaid; code blocks de texto puro sem idioma marcado, mas cuja primeira
  linha seja evidentemente sintaxe de diagrama Mermaid, também são renderizados automaticamente.
- o visualizador de código à direita também exibe o diagrama diretamente ao reconhecer arquivos `.mmd` / `.mermaid`.

## Implementação

- o reconhecimento de idioma passa unicamente por `packages/ui/src/lib/mermaidLanguage.ts`, evitando verificações
  escritas à mão em entradas diferentes.
- o componente de renderização do diagrama é `packages/ui/src/components/ai-elements/mermaid-block.tsx`, que usa a
  instância Mermaid do `@streamdown/mermaid` e lê os tokens do tema atual para gerar o `themeVariables` do Mermaid.
- a renderização Mermaid é executada em série por uma fila de nível de módulo, evitando que vários diagramas
  inicializem simultaneamente a configuração global do Mermaid e sobrescrevam o tema uns dos outros.

## Pré-visualização ampliada

- o ponto de entrada da renderização ampliada fica na área de ações do header do bloco de código, à esquerda do botão
  de copiar, e permanece visível tanto no desktop quanto no mobile; o botão fica desabilitado enquanto o diagrama não
  termina de renderizar. Clicar no ponto de entrada ou dar duplo clique na área do diagrama abre o diálogo de
  pré-visualização.
- o diálogo de pré-visualização é hospedado pelo componente genérico de preview de diagramas: no desktop usa um Dialog
  próximo de tela cheia e no mobile ocupa todo o viewport disponível. O diálogo exibe apenas o SVG já renderizado, sem
  reinterpretar o Markdown e sem alterar os limites de mensagens em streaming.
- com a pré-visualização aberta, o zoom-to-fit é aplicado por padrão usando a área visível do diálogo e os limites dos
  gráficos visíveis do SVG; diagramas pequenos também são ampliados dentro do limite máximo de zoom, e o canvas de
  fundo externo do Mermaid não participa do fit. A barra de ferramentas oferece ampliar, reduzir, menu de proporção de
  zoom (zoom to 50% / 100% / 200%, zoom to fit, reset zoom) e fechar; atalhos de teclado suportam `Esc` para fechar e
  `+` / `-` para zoom.
- o viewport de pré-visualização suporta pan com arraste do mouse, pan com a roda do mouse e zoom pela posição do ponteiro.
  No macOS, o pinch do trackpad aparece no navegador como evento de wheel com `ctrlKey`, e dentro do diálogo isso é
  interpretado como zoom centralizado no ponteiro atual; a rolagem normal com dois dedos permanece como pan.
- na Web mobile, o pan com um dedo e o zoom por pinch com dois dedos são suportados via Pointer Events. Todos os
  gestos são interceptados apenas na área de conteúdo do diálogo, evitando afetar a lista de chat, a restauração de
  mensagens replayable do controle remoto e o fluxo principal continuous do desktop.
- o tema dos diagramas continua reutilizando os themeVariables Mermaid atuais, e o container de pré-visualização usa
  design tokens como `--color-popover` / `--color-border` / `--color-foreground`, compatíveis com os temas claro,
  escuro e Zai.

## Limite de streaming

Enquanto a mensagem de chat ainda está em streaming, o code block `mermaid` mantém a exibição do código-fonte; somente
após a conclusão da mensagem ele passa a renderizar como diagrama. Isso evita que código Mermaid não fechado ou pela
metade dispare erros de renderização repetidamente durante as atualizações de streaming.
